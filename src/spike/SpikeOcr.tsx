/**
 * Spike (a): can we read surname, first name and date of birth from a label,
 * a handwritten sheet or an agenda screen? Measures its own hit rate per
 * source type — target ≥ 95 % on labels (PRD §7 phase 0).
 */
import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { parseLabel, type LabelParse } from '../core/identity/parseLabel';
import { recognizeLines } from '../platform/vision';
import { Button, Field, Row, colors, styles } from './ui';

type Kind = 'etiket' | 'briefje' | 'scherm';
type Tally = Record<Kind, { ok: number; bad: number }>;

export function SpikeOcr({ onBack }: { onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const barcodes = useRef<Set<string>>(new Set());
  const [kind, setKind] = useState<Kind>('etiket');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ parse: LabelParse; lines: string[]; ms: number; codes: string[] } | null>(null);
  const [tally, setTally] = useState<Tally>({ etiket: { ok: 0, bad: 0 }, briefje: { ok: 0, bad: 0 }, scherm: { ok: 0, bad: 0 } });
  const [showRaw, setShowRaw] = useState(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.pad]}>
        <Text style={styles.title}>Camera nodig</Text>
        <Button title="Toestaan" onPress={requestPermission} />
        <Button title="Terug" onPress={onBack} tone="muted" />
      </View>
    );
  }

  const read = async () => {
    if (!camera.current) return;
    setBusy(true);
    const t0 = Date.now();
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.9, shutterSound: false });
      const lines = await recognizeLines(pic.uri);
      try {
        new File(pic.uri).delete(); // temp file in app cache; never kept
      } catch {}
      const codes = [...barcodes.current];
      setResult({ parse: parseLabel({ lines, barcodes: codes }), lines, ms: Date.now() - t0, codes });
    } catch (e) {
      setResult({ parse: { confidence: 'low', warnings: [String(e)], conflicts: [] }, lines: [], ms: Date.now() - t0, codes: [] });
    } finally {
      barcodes.current.clear();
      setBusy(false);
    }
  };

  const judge = (ok: boolean) => {
    setTally((t) => ({ ...t, [kind]: { ok: t[kind].ok + (ok ? 1 : 0), bad: t[kind].bad + (ok ? 0 : 1) } }));
    setResult(null);
  };

  const rate = (k: Kind) => {
    const { ok, bad } = tally[k];
    return ok + bad === 0 ? '—' : `${Math.round((ok / (ok + bad)) * 100)}% (${ok}/${ok + bad})`;
  };

  const p = result?.parse;
  const tone = p?.conflicts.length ? colors.bad : p?.confidence === 'high' ? colors.ok : p?.confidence === 'medium' ? colors.warn : colors.bad;

  return (
    <View style={styles.screen}>
      <CameraView
        ref={camera}
        style={{ height: 300 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'qr', 'datamatrix', 'pdf417', 'ean13', 'itf14'] }}
        onBarcodeScanned={(b) => barcodes.current.add(b.data)}
      />
      <ScrollView contentContainerStyle={styles.pad}>
        <Row>
          {(['etiket', 'briefje', 'scherm'] as Kind[]).map((k) => (
            <Button key={k} title={k} tone={k === kind ? 'ink' : 'muted'} onPress={() => setKind(k)} />
          ))}
        </Row>
        <Button title={busy ? 'Lezen…' : 'Lees naam en geboortedatum'} onPress={read} disabled={busy || !!result} />

        {p && result && (
          <View style={[styles.card, { borderColor: tone }]}>
            <Text style={{ color: tone, fontWeight: '700' }}>
              {p.conflicts.length ? 'TEGENSTRIJDIG — bevestigen geblokkeerd' : `Zekerheid: ${p.confidence}`} · {result.ms} ms
            </Text>
            <Field label="Achternaam" value={p.surname} />
            <Field label="Voornaam" value={p.firstName} />
            <Field label="Geboortedatum" value={p.dob} />
            <Field label="Patiëntnr" value={p.patientNumber} />
            {p.nationalNumber && <Field label="Rijksregister" value="gevonden, controlegetal geldig" />}
            {result.codes.length > 0 && <Field label="Barcodes" value={result.codes.join(', ')} />}
            {[...p.conflicts, ...p.warnings].map((w) => (
              <Text key={w} style={styles.muted}>• {w}</Text>
            ))}
            <Text style={styles.muted}>Klopt alles (naam, voornaam, geboortedatum)?</Text>
            <Row>
              <Button title="Juist" tone="ok" onPress={() => judge(true)} />
              <Button title="Fout" tone="bad" onPress={() => judge(false)} />
              <Button title={showRaw ? 'Verberg tekst' : 'Ruwe tekst'} tone="muted" onPress={() => setShowRaw(!showRaw)} />
            </Row>
            {showRaw && <Text style={styles.mono}>{result.lines.join('\n')}</Text>}
          </View>
        )}

        <View style={styles.card}>
          <Text style={{ fontWeight: '700' }}>Score (doel: etiket ≥ 95%)</Text>
          <Field label="Etiket" value={rate('etiket')} />
          <Field label="Briefje" value={rate('briefje')} />
          <Field label="Scherm" value={rate('scherm')} />
        </View>
        <Button title="Terug" tone="muted" onPress={onBack} />
      </ScrollView>
    </View>
  );
}
