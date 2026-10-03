/**
 * Spike (b): is live head-angle guidance usable?
 *  - Is the yaw sign right? (patient turns to own right → yaw goes POSITIVE)
 *  - Is yaw stable within ±5° and accurate against a protractor?
 *  - Does "capture as reference" make the next attempt land on the same pose?
 *
 * Uses repeated still captures (simple, all-JS). Production uses a camera
 * frame processor for < 100 ms updates; this spike measures accuracy, and
 * reports its own update rate so we know the gap.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { REGION_VIEWS, VIEWS } from '../core/catalog/catalog';
import { BACK_CAMERA_SIGNS, classifyView, faceGeometry } from '../core/guidance/detectors';
import { evaluate, smooth, type GuidanceResult } from '../core/guidance/evaluate';
import { resolveTarget } from '../core/guidance/targets';
import type { CaptureGeometry, Episode, Session } from '../core/types';
import { largestFace } from '../platform/vision';
import { usePhoneTilt } from '../platform/motion';
import { loadSettings, saveSettings } from '../platform/settings';
import { Button, Field, Row, colors, styles } from './ui';

const FACE_VIEWS = REGION_VIEWS.face.filter((v) => v !== 'frontal-smile');
const EPISODE: Episode = { id: 'spike', patientId: 'spike', region: 'face', procedure: null, secondary: [], surgeryDate: null, startedAt: '2000-01-01', folderName: 'spike' };

export function SpikeYaw({ onBack }: { onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const tilt = usePhoneTilt();
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [view, setView] = useState('frontal');
  const [inverted, setInverted] = useState(!!loadSettings().yawInverted);
  const invertedRef = useRef(inverted);
  const [live, setLive] = useState<CaptureGeometry | null>(null);
  const [raw, setRaw] = useState<{ x: number; y: number; z: number; smile?: number } | null>(null);
  const [period, setPeriod] = useState(0);
  const [reference, setReference] = useState<Record<string, CaptureGeometry>>({});
  const smoothed = useRef<CaptureGeometry | null>(null);

  // A fake pre-op session holding the captured references → the real rule code picks the target.
  const target = useMemo(() => {
    const sessions: Session[] = reference[view]
      ? [{ id: 'pre', episodeId: 'spike', patientId: 'spike', date: '2000-01-01', visit: 'preop', folderName: 'pre', operator: '', device: '', shots: [{ file: 'ref.jpg', view, kind: 'photo', index: 1, capturedAt: '', viewSource: 'manual', geometry: reference[view] }] }]
      : [];
    return resolveTarget(view, EPISODE, sessions, { id: 'now', date: '2000-02-01' });
  }, [view, reference]);

  const guidance: GuidanceResult = evaluate(live, target);
  const detectedView = live ? classifyView(live, REGION_VIEWS.face, { smiling: raw?.smile }) : null;

  useEffect(() => () => {
    runningRef.current = false;
  }, []);

  const loop = async () => {
    while (runningRef.current && camera.current) {
      const signs = { ...BACK_CAMERA_SIGNS, yaw: (invertedRef.current ? -BACK_CAMERA_SIGNS.yaw : BACK_CAMERA_SIGNS.yaw) as 1 | -1 };
      const t0 = Date.now();
      try {
        const pic = await camera.current.takePictureAsync({ quality: 0.3, shutterSound: false });
        const face = await largestFace(pic.uri);
        try {
          new File(pic.uri).delete();
        } catch {}
        if (face) {
          const g = faceGeometry(face, { width: pic.width, height: pic.height }, signs, tilt.current ?? undefined);
          smoothed.current = smooth(smoothed.current, g);
          setLive(smoothed.current);
          setRaw({ x: face.rotationX, y: face.rotationY, z: face.rotationZ, smile: face.smilingProbability });
        } else {
          smoothed.current = null;
          setLive(null);
        }
      } catch {
        // keep looping; a single failed frame is fine
      }
      setPeriod(Date.now() - t0);
    }
  };

  const toggle = () => {
    runningRef.current = !running;
    setRunning(!running);
    if (!running) loop();
  };

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.pad]}>
        <Button title="Camera toestaan" onPress={requestPermission} />
        <Button title="Terug" onPress={onBack} tone="muted" />
      </View>
    );
  }

  const ring = !guidance.detected ? colors.bad : guidance.allOk ? colors.ok : guidance.score > 0.6 ? colors.warn : colors.bad;
  const f = (n?: number) => (n == null ? '—' : n.toFixed(1));

  return (
    <View style={styles.screen}>
      <View style={{ height: 320, borderWidth: 8, borderColor: ring }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={[styles.title, { color: ring }]}>
          {guidance.allOk ? 'GOED — neem de foto' : guidance.hints.join(' · ') || '…'}
        </Text>
        <Row>
          {FACE_VIEWS.map((v) => (
            <Button key={v} title={VIEWS[v].label} tone={v === view ? 'ink' : 'muted'} onPress={() => setView(v)} />
          ))}
        </Row>
        <View style={styles.card}>
          <Field label="Doel" value={`${target.source === 'reference' ? 'REFERENTIE (pre-op)' : 'handboek'} · yaw ${f(target.geometry.yaw)}°`} />
          <Field label="Live yaw / pitch / roll" value={`${f(live?.yaw)}° / ${f(live?.pitch)}° / ${f(live?.roll)}°`} />
          <Field label="Afstand / centrum" value={`${f(live ? live.distance * 100 : undefined)}% / ${f(live ? live.centerX * 100 : undefined)}, ${f(live ? live.centerY * 100 : undefined)}`} />
          <Field label="Telefoon pitch / roll" value={`${f(tilt.current?.pitch)}° / ${f(tilt.current?.roll)}°`} />
          <Field label="Herkend als" value={detectedView ? VIEWS[detectedView].label : 'twijfel'} />
          <Field label="ML Kit ruw X/Y/Z" value={raw ? `${f(raw.x)} / ${f(raw.y)} / ${f(raw.z)}` : undefined} />
          <Field label="Update elke" value={`${period} ms`} />
        </View>
        <Row>
          <Button title={running ? 'Stop' : 'Start meting'} onPress={toggle} />
          <Button
            title="Leg vast als referentie"
            tone="ok"
            disabled={!live}
            onPress={() => live && setReference({ ...reference, [view]: live })}
          />
          <Button title="Wis referentie" tone="muted" onPress={() => setReference({ ...reference, [view]: undefined as never })} />
        </Row>
        <View style={styles.card}>
          <Text style={{ fontWeight: '700' }}>Tekencontrole</Text>
          <Text style={styles.muted}>
            Laat de testpersoon naar eigen rechts draaien (linkerwang naar de camera). Yaw moet POSITIEF worden en ¾ links herkend worden.
            Zo niet: zet omkering aan. Dit wordt bewaard.
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
