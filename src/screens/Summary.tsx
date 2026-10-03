/** Summary before closing (U8): one tile per view, missing tiles not blocking, one note. */
import { useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { viewSequence } from '../core/catalog/catalog';
import { sessionProgress, visitLabel } from '../core/visits';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { clearPreviews, previewUri } from '../platform/previewCache';
import { Big, Header, Link, c, s } from '../ui/kit';
import { fullName, treatmentTitle, viewLabel as viewLabelFor } from '../ui/labels';
import type { Dispatch } from './types';

export function Summary({ patientId, episodeId, sessionId, demo, dispatch }: { patientId: string; episodeId: string; sessionId: string; demo?: boolean; dispatch: Dispatch }) {
  const archive = useReadyArchive();
  const { changed } = useArchive();
  const patient = archive.patient(patientId);
  const episode = archive.episode(episodeId);
  const session = archive.session(sessionId);
  const viewLabel = (key: string) => viewLabelFor(key, archive.viewOverrides);
  const progress = sessionProgress(session, viewSequence(episode.areas, session.visit, archive.viewOverrides).map((st) => st.key));
  const [note, setNote] = useState(session.note ?? '');
  const [busy, setBusy] = useState(false);

  const close = async (removeDemo: boolean) => {
    setBusy(true);
    try {
      if (removeDemo) await archive.removePatient(patientId);
      else if ((session.note ?? '') !== note.trim()) await archive.setNote(sessionId, note);
    } catch (e) {
      Alert.alert(removeDemo ? 'Proefbestanden niet gewist' : 'Notitie niet bewaard', e instanceof Error ? e.message : String(e));
    } finally {
      clearPreviews(sessionId);
      clearPreviews('ghost');
      changed();
      dispatch({ type: 'SESSION_CLOSED' });
    }
  };

  const tile = (view: string, shots: number) => {
    const last = [...session.shots].reverse().find((x) => x.view === view);
    const uri = last ? previewUri(sessionId, last.file) : null;
    return (
      <View key={view} style={{ width: '31%', gap: 4 }}>
        {uri ? (
          <Image source={{ uri }} resizeMethod="resize" style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 8 }} />
        ) : (
          <View style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: shots ? c.card : '#fef2f2', justifyContent: 'center', borderWidth: 1, borderColor: shots ? c.line : '#fecaca' }}>
            <Text style={{ textAlign: 'center', color: shots ? c.muted : c.bad }}>{shots ? `${shots} foto` : 'ontbreekt'}</Text>
          </View>
        )}
        <Text style={s.muted} numberOfLines={1}>
          {viewLabel(view)}
          {shots > 1 ? ` (${shots})` : ''}
        </Text>
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <Header title="Overzicht" onBack={() => dispatch({ type: 'BACK' })} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.h2}>{fullName(patient)}</Text>
        <Text style={s.muted}>
          {treatmentTitle(episode)} · {visitLabel(session.visit, session.interval)} · {session.shots.length} foto&apos;s
        </Text>
        {progress.missing.length > 0 && <Text style={{ color: c.warn }}>{progress.missing.length} zicht(en) ontbreken. Mag, maar check even.</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {progress.planned.map((p) => tile(p.view, p.shots))}
          {progress.extra.map((p) => tile(p.view, p.shots))}
        </View>
        {!demo && (
          <>
            <Text style={s.muted}>Notitie bij deze sessie</Text>
            <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top', fontSize: 16 }]} multiline value={note} onChangeText={setNote} placeholder="bv. implantaat 325 cc, drains eruit dag 2" />
          </>
        )}
        <Link title="‹ Verder fotograferen" onPress={() => dispatch({ type: 'CONTINUE_SHOOTING' })} />
        {demo ? (
          <>
            <Text style={s.body}>Proefrit klaar. Zo komt elke sessie in je map terecht.</Text>
            <Big title="Proefbestanden verwijderen" tone="bad" onPress={() => close(true)} disabled={busy} />
          </>
        ) : (
          <Big title="Klaar ✓" tone="ok" onPress={() => close(false)} disabled={busy} />
        )}
      </ScrollView>
    </View>
  );
}
