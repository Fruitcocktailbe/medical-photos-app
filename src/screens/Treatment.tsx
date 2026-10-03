/** Returning patient: which treatment? (decision U6) */
import { ScrollView, Text, View } from 'react-native';
import { formatDutchDate } from '../core/dates';
import { visitLabel } from '../core/visits';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { Big, Card, Header, s } from '../ui/kit';
import { born, fullName, treatmentAreas, treatmentTitle } from '../ui/labels';
import type { Dispatch } from './types';

export function Treatment({ patientId, dispatch }: { patientId: string; dispatch: Dispatch }) {
  useArchive(); // re-render on changes
  const archive = useReadyArchive();
  const patient = archive.patient(patientId);
  const episodes = archive.episodesOf(patientId);
  return (
    <View style={s.screen}>
      <Header title="Welke behandeling?" onBack={() => dispatch({ type: 'BACK' })} />
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.h1}>{fullName(patient)}</Text>
        <Text style={s.muted}>{born(patient)}</Text>
        {episodes.map((e) => {
          const sessions = archive.sessionsOf(e.id);
          const last = sessions[sessions.length - 1];
          return (
            <Card key={e.id} onPress={() => dispatch({ type: 'EPISODE_CHOSEN', episodeId: e.id })}>
              <Text style={s.h2}>{treatmentTitle(e)}</Text>
              {e.procedure && <Text style={s.body}>{treatmentAreas(e)}</Text>}
              <Text style={s.muted}>
                {e.surgeryDate ? `OK ${formatDutchDate(e.surgeryDate)} · ` : ''}
                {last ? `laatst ${visitLabel(last.visit, last.interval)} op ${formatDutchDate(last.date)}` : 'nog geen foto’s'}
              </Text>
            </Card>
          );
        })}
        <Big title="+ Nieuwe behandeling" tone="ink" onPress={() => dispatch({ type: 'NEW_TREATMENT' })} />
      </ScrollView>
    </View>
  );
}
