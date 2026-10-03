/**
 * Spike (b): is live head-angle guidance usable?
 *  - Is the yaw sign right? (patient turns to own right → yaw goes POSITIVE)
 *  - Is yaw stable within ±5° and accurate against a protractor?
 *  - Does "capture as reference" make the next attempt land on the same pose?
 *
 * Live: ML Kit runs natively on every camera frame (VisionCamera face-detector
 * output). The screen redraws at ~10 Hz from the latest result.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import { useFaceDetectorOutput, type Face } from 'react-native-vision-camera-face-detector';
import { stepForKey, viewSequence } from '../core/catalog/catalog';
import { BACK_CAMERA_SIGNS, classifyStep, faceGeometry } from '../core/guidance/detectors';
import { evaluate, smooth } from '../core/guidance/evaluate';
import { resolveTarget } from '../core/guidance/targets';
import type { CaptureGeometry, Episode, Session } from '../core/types';
import { faceForGeometry, largest } from '../platform/camera';
import { usePhoneTilt } from '../platform/motion';
import { loadSettings, saveSettings } from '../platform/settings';
import { Button, CameraGate, Field, Row, colors, styles } from './ui';

const FACE_STEPS = viewSequence([{ sub: 'face' }], 'preop');
const FACE_VIEWS = FACE_STEPS.map((st) => st.key).filter((k) => k !== 'face:frontal-smile');
const EPISODE: Episode = { id: 'spike', patientId: 'spike', areas: [{ sub: 'face' }], procedure: null, secondary: [], surgeryDate: null, startedAt: '2000-01-01', folderName: 'spike' };

interface Snapshot {
  live: CaptureGeometry | null;
  raw: { x: number; y: number; z: number; smile?: number; frame: string } | null;
  perSecond: number;
}

export function SpikeYaw({ onBack }: { onBack: () => void }) {
  const permission = useCameraPermission();
  const tilt = usePhoneTilt();
  const [running, setRunning] = useState(true);
  const [view, setView] = useState('face:frontal');
  const [inverted, setInverted] = useState(!!loadSettings().yawInverted);
  const invertedRef = useRef(inverted);
  const [reference, setReference] = useState<Record<string, CaptureGeometry | undefined>>({});
  const [snap, setSnap] = useState<Snapshot>({ live: null, raw: null, perSecond: 0 });

  // Written on every analysed frame, read by the 10 Hz redraw.
  const latest = useRef<Snapshot>({ live: null, raw: null, perSecond: 0 });
  const smoothed = useRef<CaptureGeometry | null>(null);
  const count = useRef({ n: 0, since: 0 }); // since = 0 until the first analysed frame

  // Only touches refs, so it is stable for the lifetime of the screen.
  const onFaces = useCallback((faces: Face[]) => {
    const now = Date.now();
    if (count.current.since === 0) count.current.since = now;
    count.current.n++;
    if (now - count.current.since >= 1000) {
      latest.current.perSecond = Math.round((count.current.n * 1000) / (now - count.current.since));
      count.current = { n: 0, since: now };
    }
    const face = largest(faces);
    if (!face) {
      smoothed.current = null;
      latest.current = { ...latest.current, live: null, raw: null };
      return;
    }
    const { detection, image } = faceForGeometry(face);
    const signs = { ...BACK_CAMERA_SIGNS, yaw: (invertedRef.current ? -BACK_CAMERA_SIGNS.yaw : BACK_CAMERA_SIGNS.yaw) as 1 | -1 };
    smoothed.current = smooth(smoothed.current, faceGeometry(detection, image, signs, tilt.current ?? undefined));
    latest.current = {
      ...latest.current,
      live: smoothed.current,
      raw: { x: face.pitchAngle, y: face.yawAngle, z: face.rollAngle, smile: face.smilingProbability, frame: `${face.frameWidth}×${face.frameHeight}` },
    };
  }, [tilt]);

  const faceOutput = useFaceDetectorOutput({
    cameraFacing: 'back',
    performanceMode: 'fast',
    runClassifications: true,
    onFacesDetected: onFaces,
    onError: () => undefined,
  });

  const outputs = useMemo(() => [faceOutput], [faceOutput]);
  useEffect(() => {
    const t = setInterval(() => setSnap({ ...latest.current }), 100);
    return () => clearInterval(t);
  }, []);

  // A fake pre-op session holding the captured references → the real rule code picks the target.
  const target = useMemo(() => {
    const g = reference[view];
    const sessions: Session[] = g
      ? [{ id: 'pre', episodeId: 'spike', patientId: 'spike', date: '2000-01-01', visit: 'preop', folderName: 'pre', operator: '', device: '', shots: [{ file: 'ref.jpg', view, kind: 'photo', index: 1, capturedAt: '', viewSource: 'manual', geometry: g }] }]
      : [];
    return resolveTarget(view, EPISODE, sessions, { id: 'now', date: '2000-02-01' });
  }, [view, reference]);

  if (!permission.hasPermission) {
    return <CameraGate granted={false} canAsk={permission.canRequestPermission} onAsk={permission.requestPermission} onBack={onBack} />;
  }

  const { live, raw, perSecond } = snap;
  const guidance = evaluate(live, target);
  const detectedView = live ? classifyStep(live, FACE_STEPS, { smiling: raw?.smile }) : null;
  const ring = !guidance.detected ? colors.bad : guidance.allOk ? colors.ok : guidance.score > 0.6 ? colors.warn : colors.bad;
  const f = (n?: number) => (n == null ? '—' : n.toFixed(1));

  return (
    <View style={styles.screen}>
      <View style={{ height: 320, borderWidth: 8, borderColor: ring }}>
        <Camera style={{ flex: 1 }} device="back" isActive={running} outputs={outputs} />
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={[styles.title, { color: ring }]}>
          {guidance.allOk ? 'GOED — neem de foto' : guidance.hints.join(' · ') || '…'}
        </Text>
        <Row>
          {FACE_VIEWS.map((v) => (
            <Button key={v} title={stepForKey(v).label} tone={v === view ? 'ink' : 'muted'} onPress={() => setView(v)} />
          ))}
        </Row>
        <View style={styles.card}>
          <Field label="Doel" value={`${target.source === 'reference' ? 'REFERENTIE (pre-op)' : 'handboek'} · yaw ${f(target.geometry.yaw)}°`} />
          <Field label="Live yaw / pitch / roll" value={`${f(live?.yaw)}° / ${f(live?.pitch)}° / ${f(live?.roll)}°`} />
          <Field label="Afstand / centrum" value={`${f(live ? live.distance * 100 : undefined)}% / ${f(live ? live.centerX * 100 : undefined)}, ${f(live ? live.centerY * 100 : undefined)}`} />
          <Field label="Telefoon pitch / roll" value={`${f(tilt.current?.pitch)}° / ${f(tilt.current?.roll)}°`} />
          <Field label="Herkend als" value={detectedView ? stepForKey(detectedView).label : 'twijfel'} />
          <Field label="ML Kit ruw X/Y/Z" value={raw ? `${f(raw.x)} / ${f(raw.y)} / ${f(raw.z)}` : undefined} />
          <Field label="Frame (b×h)" value={raw?.frame} />
          <Field label="Analyses per seconde" value={String(perSecond)} />
        </View>
        <Row>
          <Button title={running ? 'Pauze' : 'Verder'} onPress={() => setRunning(!running)} />
          <Button title="Leg vast als referentie" tone="ok" disabled={!live} onPress={() => live && setReference({ ...reference, [view]: live })} />
          <Button title="Wis referentie" tone="muted" onPress={() => setReference({ ...reference, [view]: undefined })} />
        </Row>
        <View style={styles.card}>
          <Text style={{ fontWeight: '700' }}>Tekencontrole</Text>
          <Text style={styles.muted}>
            Laat de testpersoon naar eigen rechts draaien (linkerwang naar de camera). Yaw moet POSITIEF worden en ¾ links herkend worden.
            Zo niet: zet omkering aan. Dit wordt bewaard. Frame moet staand zijn (hoogte groter dan breedte).
          </Text>
          <Button
            title={`Yaw omkeren: ${inverted ? 'AAN' : 'UIT'}`}
            tone="muted"
            onPress={() => {
              setInverted(!inverted);
              invertedRef.current = !inverted;
              saveSettings({ yawInverted: !inverted });
              smoothed.current = null;
            }}
          />
        </View>
        <Button title="Terug" tone="muted" onPress={onBack} />
      </ScrollView>
    </View>
  );
}
