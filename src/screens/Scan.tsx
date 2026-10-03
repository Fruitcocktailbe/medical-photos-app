/** Home: camera ready to scan (decision U1), recent patients below. */
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Camera, isScannedCode, useCameraPermission, useObjectOutput, usePhotoOutput } from 'react-native-vision-camera';
import { parseLabel } from '../core/identity/parseLabel';
import { formatDutchDate } from '../core/dates';
import { recentPatients, visitLabel } from '../core/visits';
import { useArchive } from '../app/ArchiveProvider';
import { PHOTO_OUTPUT_OPTIONS, captureTempFile } from '../platform/camera';
import { recognizeLines } from '../platform/vision';
import { deleteTempFile } from '../platform/previewCache';
import { Big, Card, Link, SyncDot, c, s } from '../ui/kit';
import { born, fullName, treatmentTitle } from '../ui/labels';
import type { Dispatch } from './types';

export function Scan({ dispatch }: { dispatch: Dispatch }) {
  const { status, error, archive, sync, syncNow, rootUri, openRoot } = useArchive();
  const permission = useCameraPermission();
  const photoOutput = usePhotoOutput(PHOTO_OUTPUT_OPTIONS);
  const barcodes = useRef<Set<string>>(new Set());
  const objectOutput = useObjectOutput({
    types: ['code-128', 'code-39', 'qr', 'data-matrix', 'pdf-417', 'ean-13', 'itf-14', 'interleaved-2-of-5'],
    onObjectsScanned: (objects) => {
      for (const o of objects) if (isScannedCode(o) && o.value) barcodes.current.add(o.value);
    },
  });
  const outputs = useMemo(() => [photoOutput, objectOutput], [photoOutput, objectOutput]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  const read = async () => {
    setBusy(true);
    setFailure(undefined);
    let uri: string | undefined;
    try {
      uri = await captureTempFile(photoOutput);
      const lines = await recognizeLines(uri);
      dispatch({ type: 'SCANNED', parse: parseLabel({ lines, barcodes: [...barcodes.current] }), photoUri: uri });
    } catch (e) {
      deleteTempFile(uri);
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      barcodes.current.clear();
      setBusy(false);
    }
  };

  const ready = status === 'ready' && archive;
  const recent = ready ? recentPatients(archive.registry, 6) : [];

  return (
    <View style={s.dark}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
        <SyncDot sync={sync} onPress={syncNow} />
        <Link title="⚙ Instellingen" tone="muted" onPress={() => dispatch({ type: 'OPEN_SETTINGS' })} />
      </View>

      {!ready ? (
        <View style={[s.pad, { flex: 1, justifyContent: 'center' }]}>
          {status === 'opening' && <ActivityIndicator color={c.white} />}
          {status === 'opening' && <Text style={{ color: c.white, textAlign: 'center' }}>Map openen…</Text>}
          {status === 'error' && (
            <>
              <Text style={{ color: c.white, fontSize: 16 }}>De fotomap is niet bereikbaar: {error}</Text>
              <Big title="Opnieuw proberen" onPress={() => rootUri && openRoot(rootUri)} />
              <Big title="Andere map kiezen" tone="ink" onPress={() => dispatch({ type: 'OPEN_SETTINGS' })} />
            </>
          )}
          {status === 'no-folder' && <Big title="Kies eerst een fotomap" onPress={() => dispatch({ type: 'OPEN_SETTINGS' })} />}
        </View>
      ) : !permission.hasPermission ? (
        <View style={[s.pad, { flex: 1, justifyContent: 'center' }]}>
          <Text style={{ color: c.white, fontSize: 16 }}>De camera is nodig om etiketten te lezen en foto&apos;s te nemen.</Text>
          {permission.canRequestPermission ? (
            <Big title="Camera toestaan" onPress={permission.requestPermission} />
          ) : (
            <Text style={{ color: c.white }}>Zet de camera aan via Instellingen › Apps › Medical Photos.</Text>
          )}
        </View>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            <Camera style={{ flex: 1 }} device="back" isActive outputs={outputs} />
            <View pointerEvents="none" style={{ position: 'absolute', left: '12%', right: '12%', top: '30%', height: '28%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 12 }} />
            <Text style={{ position: 'absolute', bottom: 12, width: '100%', textAlign: 'center', color: c.white }}>Richt op etiket, briefje of scherm</Text>
          </View>
          <View style={[s.pad, { paddingBottom: 4 }]}>
            {failure && <Text style={{ color: '#fca5a5' }}>Lezen mislukt: {failure}</Text>}
            <Big title={busy ? 'Lezen…' : 'Lees etiket'} onPress={read} disabled={busy} />
            <Link title="Typ naam en geboortedatum" tone="muted" onPress={() => dispatch({ type: 'MANUAL_ENTRY' })} />
          </View>
          {recent.length > 0 && (
            <ScrollView style={{ maxHeight: 190, backgroundColor: c.bg }} contentContainerStyle={{ padding: 12, gap: 8 }}>
              <Text style={s.muted}>Recent</Text>
              {recent.map((r) => (
                <Pressable key={r.patient.id} onPress={() => dispatch({ type: 'RECENT_PICKED', patientId: r.patient.id })}>
                  <Card>
                    <Text style={s.h2}>
                      {fullName(r.patient)} <Text style={s.muted}>{born(r.patient)}</Text>
                    </Text>
                    <Text style={s.muted}>
                      {r.episode ? `${treatmentTitle(r.episode)} · ` : ''}
                      {r.session ? `${visitLabel(r.session.visit, r.session.interval)} · ${formatDutchDate(r.session.date)}` : 'nog geen foto’s'}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}
