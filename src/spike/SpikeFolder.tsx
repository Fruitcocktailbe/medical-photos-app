/**
 * Spike (c): does the user-chosen folder work end to end?
 *  1. pick a folder (Nextcloud, Drive, local…) — does access survive a restart?
 *  2. file a real camera photo through the outbox, exactly as the app will
 *  3. set the procedure → episode folder renamed, photo retagged
 *  4. rebuild the index from the folder (the tablet's view)
 * Use a NEW EMPTY folder and photograph an object, never a patient.
 */
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { Archive } from '../core/archive';
import { Outbox } from '../core/storage/Outbox';
import { parseXmp, readXmp } from '../core/metadata/xmp';
import { rebuildIndex } from '../core/index/rebuild';
import { SafTarget } from '../platform/SafTarget';
import { LocalTarget } from '../platform/LocalTarget';
import { loadSettings, saveSettings } from '../platform/settings';
import { Button, Row, colors, styles } from './ui';

type Line = { ok: boolean | null; text: string };

export function SpikeFolder({ onBack }: { onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [target, setTarget] = useState<SafTarget | null>(null);
  const [photo, setPhoto] = useState<Uint8Array | null>(null);
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const say = (ok: boolean | null, text: string) => setLog((l) => [...l, { ok, text }]);

  useEffect(() => {
    const uri = loadSettings().rootUri;
    if (!uri) return;
    const t = SafTarget.fromUri(uri);
    t.list([])
      .then((entries) => {
        setTarget(t);
        say(true, `Toegang na herstart: JA (${entries.length} items in de map)`);
      })
      .catch((e) => say(false, `Toegang na herstart: NEE — ${String(e)}`));
  }, []);

  const pick = async () => {
    try {
      const t = await SafTarget.pick();
      saveSettings({ rootUri: t.uri });
      setTarget(t);
      say(true, `Map gekozen: ${decodeURIComponent(t.uri).slice(-60)}`);
    } catch (e) {
      say(false, `Kiezen mislukt: ${String(e)}`);
    }
  };

  const shoot = async () => {
    const pic = await camera.current?.takePictureAsync({ quality: 0.8, shutterSound: false });
    if (!pic) return;
    const f = new File(pic.uri);
    setPhoto(await f.bytes());
    f.delete();
    say(true, `Testfoto: ${pic.width}×${pic.height}`);
  };

  const run = async () => {
    if (!target || !photo) return;
    setBusy(true);
    const step = async (name: string, fn: () => Promise<string | void>) => {
      const t0 = Date.now();
      try {
        const extra = await fn();
        say(true, `${name} (${Date.now() - t0} ms)${extra ? ` — ${extra}` : ''}`);
        return true;
      } catch (e) {
        say(false, `${name}: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    };
    const box = new Outbox(new LocalTarget('spike-outbox'), target);
    let archive!: Archive;
    let episodeId = '';
    let sessionId = '';
    let file = '';
    const P = 'Test_Spike_2000-01-01';

    const ok =
      (await step('Index lezen', async () => {
        archive = await Archive.open({ storage: box, operator: 'spike', device: 'spike' });
        return `${archive.registry.patients.length} patiënten, ${archive.problems.length} problemen`;
      })) &&
      (await step('Patiënt + episode + sessie + foto (offline wachtrij)', async () => {
        const p = await archive.createPatient({ surname: 'Test', firstName: 'Spike', dob: '2000-01-01' });
        const e = await archive.startEpisode(p.id, 'face');
        const s = await archive.startSession(e.id, 'preop');
        const shot = await archive.fileShot(s.id, { bytes: photo, view: 'frontal', viewSource: 'manual' });
        episodeId = e.id;
        sessionId = s.id;
        file = shot.file;
        return `${await box.pending()} acties in wachtrij`;
      })) &&
      (await step('Synchroniseren naar de map (met controle)', async () => {
        const r = await box.drain();
        if (r.error) throw new Error(r.error);
        return `${r.done} acties`;
      })) &&
      (await step('Bestandsnamen exact (geen extensie toegevoegd)', async () => {
        const s = archive.session(sessionId);
        const names = (await target.list([P, archive.episode(episodeId).folderName, s.folderName])).map((x) => x.name).sort();
        const expected = [file, 'session.json'].sort();
        if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`gevonden: ${names.join(', ')}`);
        return names.join(', ');
      })) &&
      (await step('Ingreep zetten → map hernoemen + foto hertaggen', async () => {
        const { retagged } = await archive.setProcedure(episodeId, 'facelift');
        const r = await box.drain();
        if (r.error) throw new Error(r.error);
        const dirs = (await target.list([P])).map((x) => x.name);
        if (!dirs.some((d) => d.endsWith('_facelift')) || dirs.some((d) => d.endsWith('_face'))) throw new Error(`mappen: ${dirs.join(', ')}`);
        return `${retagged} foto hertagd, mappen: ${dirs.join(', ')}`;
      })) &&
      (await step('Tag in de JPEG zelf leesbaar', async () => {
        const s = archive.session(sessionId);
        const bytes = await target.readBytes([P, archive.episode(episodeId).folderName, s.folderName, file]);
        const meta = bytes && readXmp(bytes);
        if (!meta) throw new Error('geen XMP gevonden');
        const x = parseXmp(meta);
        if (x.procedure !== 'facelift') throw new Error(`procedure = ${x.procedure}`);
        return x.subjects.join(' ');
      })) &&
      (await step('Index opnieuw opbouwen uit de map (tablet-zicht)', async () => {
        const { registry, problems } = await rebuildIndex(target);
        const ep = registry.episodes.find((e) => e.id === episodeId);
        if (!ep || ep.procedure !== 'facelift') throw new Error('episode niet teruggevonden');
        return `${problems.length} problemen`;
      }));

    say(ok ? true : false, ok ? 'ALLES GESLAAGD' : 'Gestopt bij de eerste fout');
    setBusy(false);
  };

  const cleanup = async () => {
    if (!target) return;
    await target.remove(['Test_Spike_2000-01-01']).catch((e) => say(false, String(e)));
    say(null, 'Testmap verwijderd');
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

  return (
    <View style={styles.screen}>
      <CameraView ref={camera} style={{ height: 200 }} facing="back" />
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.muted}>Kies een NIEUWE LEGE map. Fotografeer een voorwerp, nooit een patiënt.</Text>
        <Row>
          <Button title={target ? 'Andere map' : 'Kies map'} onPress={pick} />
          <Button title="Testfoto" onPress={shoot} />
          <Button title={busy ? 'Bezig…' : 'Start test'} tone="ok" disabled={!target || !photo || busy} onPress={run} />
          <Button title="Opruimen" tone="muted" disabled={!target || busy} onPress={cleanup} />
        </Row>
        <View style={styles.card}>
          {log.map((l, i) => (
            <Text key={i} style={{ color: l.ok === null ? colors.muted : l.ok ? colors.ok : colors.bad }}>
              {l.ok === null ? '·' : l.ok ? '✓' : '✗'} {l.text}
            </Text>
          ))}
        </View>
        <Button title="Terug" tone="muted" onPress={onBack} />
      </ScrollView>
    </View>
  );
}
