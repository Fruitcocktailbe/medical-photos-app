/**
 * Capture (docs/ux-flow.md › Capture): view rail, live ring for face views,
 * ghost overlay of the reference photo, manual shutter that advances to the
 * next missing view (decision U4), thumbnail strip with retake / delete /
 * mark as reference (U8). Every photo is filed the moment it is taken.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Camera, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { useFaceDetectorOutput, type Face } from 'react-native-vision-camera-face-detector';
import { REGION_LABELS, VIEWS, viewSetForVisit } from '../core/catalog/catalog';
import { BACK_CAMERA_SIGNS, classifyView, faceGeometry } from '../core/guidance/detectors';
import { evaluate, smooth } from '../core/guidance/evaluate';
import { resolveTarget } from '../core/guidance/targets';
import { nextMissingView, visitLabel } from '../core/visits';
import type { CaptureGeometry, Session, Shot, ViewId } from '../core/types';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { PHOTO_OUTPUT_OPTIONS, captureJpeg, faceForGeometry, largest } from '../platform/camera';
import { usePhoneTilt } from '../platform/motion';
import { previewUri, writePreview } from '../platform/previewCache';
import { loadSettings, saveSettings } from '../platform/settings';
import { ActionSheet, Big, Chip, Link, c, s, type SheetAction } from '../ui/kit';
import { procedureLabel, shortName, viewLabel } from '../ui/labels';
import type { Dispatch } from './types';

function firstView(viewIds: ViewId[], session: Session): ViewId {
  return nextMissingView(viewIds, session, viewIds[viewIds.length - 1]) ?? viewIds[0];
}

export function Capture({ patientId, episodeId, sessionId, dispatch }: { patientId: string; episodeId: string; sessionId: string; dispatch: Dispatch }) {
  const archive = useReadyArchive();
  const { changed } = useArchive();
  const permission = useCameraPermission();
  const photoOutput = usePhotoOutput(PHOTO_OUTPUT_OPTIONS);
  const tilt = usePhoneTilt();

  const patient = archive.patient(patientId);
  const episode = archive.episode(episodeId);
  const session = archive.session(sessionId);
  const viewIds = viewSetForVisit(episode.region, episode.procedure, session.visit);
  const faceRegion = episode.region === 'face';

  const [current, setCurrent] = useState<ViewId>(() => firstView(viewIds, session));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [sheetShot, setSheetShot] = useState<Shot | null>(null);
  const [ghostOn, setGhostOn] = useState(() => loadSettings().ghostOn ?? true);
  const [ghost, setGhost] = useState<{ key: string; uri: string } | null>(null);

  const target = resolveTarget(current, episode, archive.sessionsOf(episodeId), session);
  const detect = VIEWS[current]?.detect ?? 'manual';
  const ghostKey = ghostOn && target.reference ? `${target.reference.sessionId}/${target.reference.shot.file}` : null;

  // Ghost overlay: the reference photo of this view, loaded from the archive into the cache.
  useEffect(() => {
    if (!ghostKey || !target.reference) return;
    let alive = true;
    const ref = target.reference;
    archive.readShotBytes(ref.sessionId, ref.shot.file).then((bytes) => {
      if (alive && bytes) setGhost({ key: ghostKey, uri: writePreview('ghost', ref.shot.file, bytes) });
    });
    return () => {
      alive = false;
    };
    // target.reference is derived from ghostKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostKey, archive]);

  // Live face analysis: written on every analysed frame, redrawn at 10 Hz.
  const latest = useRef<{ live: CaptureGeometry | null; smile?: number }>({ live: null });
  const smoothed = useRef<CaptureGeometry | null>(null);
  const [yawSign] = useState(() => ((loadSettings().yawInverted ? -BACK_CAMERA_SIGNS.yaw : BACK_CAMERA_SIGNS.yaw) as 1 | -1));
  const [snap, setSnap] = useState<{ live: CaptureGeometry | null; smile?: number }>({ live: null });
  const onFaces = useCallback(
    (faces: Face[]) => {
      const face = largest(faces);
      if (!face) {
        smoothed.current = null;
        latest.current = { live: null };
        return;
      }
      const { detection, image } = faceForGeometry(face);
      const signs = { ...BACK_CAMERA_SIGNS, yaw: yawSign };
      smoothed.current = smooth(smoothed.current, faceGeometry(detection, image, signs, tilt.current ?? undefined));
      latest.current = { live: smoothed.current, smile: face.smilingProbability };
    },
    [tilt, yawSign],
  );
  const faceOutput = useFaceDetectorOutput({ cameraFacing: 'back', performanceMode: 'fast', runClassifications: true, onFacesDetected: onFaces, onError: () => undefined });
  // Stable identity: the screen redraws at 10 Hz and must not reconfigure the camera.
  const outputs = useMemo(() => (faceRegion ? [photoOutput, faceOutput] : [photoOutput]), [faceRegion, photoOutput, faceOutput]);
  useEffect(() => {
    if (!faceRegion) return;
    const t = setInterval(() => setSnap({ ...latest.current }), 100);
    return () => clearInterval(t);
  }, [faceRegion]);

  const showRing = faceRegion && detect === 'face';
  const guidance = showRing ? evaluate(snap.live, target) : null;
  const recognised = showRing && snap.live ? classifyView(snap.live, viewIds, { smiling: snap.smile }) : null;
  const ring = !guidance ? 'transparent' : !guidance.detected ? c.bad : guidance.allOk ? '#22c55e' : guidance.score > 0.6 ? '#f59e0b' : c.bad;

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const pic = await captureJpeg(photoOutput);
      const live = showRing ? latest.current.live : null;
      const seen = live ? classifyView(live, viewIds, { smiling: latest.current.smile }) : null;
      const shot = await archive.fileShot(sessionId, { bytes: pic.bytes, view: current, viewSource: seen === current ? 'auto' : 'manual', geometry: live ?? undefined });
      writePreview(sessionId, shot.file, pic.bytes);
      changed();
      if (current !== 'free') setCurrent(nextMissingView(viewIds, archive.session(sessionId), current) ?? current);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sheetActions: SheetAction[] = sheetShot
    ? [
        {
          label: 'Opnieuw',
          onPress: async () => {
            await archive.deleteShot(sessionId, sheetShot.file);
            changed();
            setCurrent(sheetShot.view);
          },
        },
        {
          label: sheetShot.isReference ? '★ Is de referentie' : 'Markeer als referentie ★',
          onPress: async () => {
            await archive.setReferenceShot(sessionId, sheetShot.file);
            changed();
          },
        },
        {
          label: 'Verwijder',
          tone: 'bad',
          onPress: async () => {
            await archive.deleteShot(sessionId, sheetShot.file);
            changed();
          },
        },
      ]
    : [];

  if (!permission.hasPermission) {
    return (
      <View style={[s.dark, s.pad, { justifyContent: 'center' }]}>
        <Big title="Camera toestaan" onPress={permission.requestPermission} />
      </View>
    );
  }

  const done = (v: ViewId) => session.shots.some((x) => x.view === v);
  const shotsNewestFirst = [...session.shots].reverse();
  const title = `${shortName(patient)} · ${procedureLabel(episode.procedure) ?? REGION_LABELS[episode.region]} · ${visitLabel(session.visit, session.interval)}`;

  return (
    <View style={s.dark}>
      <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 8 }}>
        <Text style={{ color: c.white, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
          {title}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {viewIds.map((v) => (
            <Chip key={v} dark label={viewLabel(v)} done={done(v)} selected={v === current} onPress={() => setCurrent(v)} />
          ))}
          {!viewIds.includes('free') && <Chip dark label="+ Vrij" selected={current === 'free'} onPress={() => setCurrent('free')} />}
        </ScrollView>
      </View>

      <View style={{ flex: 1, margin: 8, borderWidth: showRing ? 6 : 0, borderColor: ring, borderRadius: 12, overflow: 'hidden' }}>
        <Camera style={{ flex: 1 }} device="back" isActive outputs={outputs} />
        {ghost && ghost.key === ghostKey && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Image source={{ uri: ghost.uri }} resizeMode="cover" style={{ flex: 1, opacity: 0.3 }} />
          </View>
        )}
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 8, left: 8, right: 8, gap: 6 }}>
          <Text style={{ color: c.white, fontSize: 22, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 }}>{viewLabel(current)}</Text>
          {guidance && (
            <Text style={{ color: c.white, fontSize: 16, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 }}>
              {guidance.allOk ? 'Goed — neem de foto' : guidance.hints.join(' · ')}
            </Text>
          )}
          {target.source === 'reference' && <Text style={{ color: '#a5f3fc', fontSize: 13 }}>Doel: zoals de referentiefoto</Text>}
          {recognised && recognised !== current && (
            <Pressable onPress={() => setCurrent(recognised)} style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 }}>
              <Text style={{ color: c.white }}>Herkend: {viewLabel(recognised)} — wissel?</Text>
            </Pressable>
          )}
        </View>
      </View>

      {failure && <Text style={{ color: '#fca5a5', paddingHorizontal: 12 }}>Foto mislukt: {failure}</Text>}

      <ScrollView horizontal style={{ maxHeight: 76 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 8 }}>
        {shotsNewestFirst.map((shot) => {
          const uri = previewUri(sessionId, shot.file);
          return (
            <Pressable key={shot.file} onPress={() => setSheetShot(shot)} accessibilityLabel={`${viewLabel(shot.view)} ${shot.index}`}>
              {uri ? (
                <Image source={{ uri }} resizeMethod="resize" style={{ width: 60, height: 72, borderRadius: 6, borderWidth: shot.isReference ? 2 : 0, borderColor: '#facc15' }} />
              ) : (
                <View style={{ width: 60, height: 72, borderRadius: 6, backgroundColor: '#334155', justifyContent: 'center' }}>
                  <Text style={{ color: c.white, fontSize: 10, textAlign: 'center' }}>{viewLabel(shot.view)}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
        <Link
          title={ghostOn ? 'Ghost aan' : 'Ghost uit'}
          tone={ghostOn ? 'accent' : 'muted'}
          onPress={() => {
            setGhostOn(!ghostOn);
            saveSettings({ ghostOn: !ghostOn });
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Neem foto"
          onPress={shoot}
          disabled={busy}
          style={({ pressed }) => ({ width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: c.white, backgroundColor: pressed || busy ? '#94a3b8' : 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' })}
        >
          {busy ? <ActivityIndicator color={c.white} /> : null}
        </Pressable>
        <Link title="Klaar ›" tone="ok" onPress={() => dispatch({ type: 'DONE_SHOOTING' })} />
      </View>

      <ActionSheet title={sheetShot ? `${viewLabel(sheetShot.view)} ${sheetShot.index}` : null} actions={sheetActions} onClose={() => setSheetShot(null)} />
    </View>
  );
}
