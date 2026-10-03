/**
 * New treatment: a procedure (also for patients who enter the app already
 * operated, decision U7) or only a region (consult, pre-op).
 */
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { REGION_LABELS, procedurePickerOrder, type ProcedureDef } from '../core/catalog/catalog';
import { favouriteProcedures } from '../core/visits';
import type { Region } from '../core/types';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { Card, Chip, DateField, Header, c, s } from '../ui/kit';
import type { Dispatch } from './types';

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const REGIONS: Region[] = ['face', 'breast', 'body', 'hand', 'other'];

export function NewTreatment({ patientId, dispatch }: { patientId: string; dispatch: Dispatch }) {
  const archive = useReadyArchive();
  const { changed } = useArchive();
  const [query, setQuery] = useState('');
  const [surgeryDate, setSurgeryDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  const favourites = favouriteProcedures(archive.registry);
  const list = procedurePickerOrder(null, favourites).filter((p) => !query || fold(p.label).includes(fold(query)) || p.id.includes(fold(query)));

  const start = async (region: Region, procedure: ProcedureDef | null) => {
    setBusy(true);
    try {
      const e = await archive.startEpisode(patientId, region, undefined, { procedure: procedure?.id ?? null, surgeryDate });
      changed();
      dispatch({ type: 'EPISODE_CHOSEN', episodeId: e.id });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <Header title="Nieuwe behandeling" onBack={() => dispatch({ type: 'BACK' })} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.h2}>Nog geen ingreep (consult, pre-op)</Text>
        <Text style={s.muted}>Kies de regio; de ingreep vul je later in, bij de operatie.</Text>
        <View style={s.row}>
          {REGIONS.map((r) => (
            <Chip key={r} label={REGION_LABELS[r]} onPress={() => !busy && start(r, null)} />
          ))}
        </View>

        <Text style={[s.h2, { marginTop: 8 }]}>Of kies de ingreep</Text>
        <DateField label="Al geopereerd? OK-datum (optioneel)" onChange={(iso) => setSurgeryDate(iso)} />
        <TextInput style={s.input} placeholder="Zoek ingreep…" value={query} onChangeText={setQuery} autoCorrect={false} />
        {failure && <Text style={{ color: c.bad }}>{failure}</Text>}
        {list.map((p, i) => (
          <Card key={p.id} onPress={() => !busy && start(p.region, p)}>
            <Text style={s.body}>
              {i < favourites.length && !query ? '★ ' : ''}
              {p.label}
            </Text>
            <Text style={s.muted}>{REGION_LABELS[p.region]}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
