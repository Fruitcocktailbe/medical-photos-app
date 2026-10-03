/**
 * Visit: one proposed button (computed from the treatment), chips for the
 * rest. Procedure asked inline at intra-op/post-op if still unknown (backfills
 * earlier photos); optional surgery date for post-op.
 */
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { REGION_LABELS } from '../core/catalog/catalog';
import { isoDate } from '../core/ids';
import { INTERVAL_PRESETS, intervalFor, proposeVisit, visitLabel } from '../core/visits';
import type { VisitType } from '../core/types';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { Big, Chip, DateField, Header, c, s } from '../ui/kit';
import { ProcedurePicker } from '../ui/ProcedurePicker';
import { fullName, procedureLabel, treatmentTitle } from '../ui/labels';
import type { Dispatch } from './types';

const VISITS: VisitType[] = ['consult', 'preop', 'intraop', 'postop'];

export function Visit({ patientId, episodeId, dispatch }: { patientId: string; episodeId: string; dispatch: Dispatch }) {
  const archive = useReadyArchive();
  const { changed } = useArchive();
  const patient = archive.patient(patientId);
  const episode = archive.episode(episodeId);
  const [today] = useState(() => isoDate(new Date()));
  const proposal = proposeVisit(episode, archive.sessionsOf(episodeId), today);

  const [visit, setVisit] = useState<VisitType>(proposal.visit);
  const [interval, setIntervalChoice] = useState<string | undefined>(proposal.interval);
  const [surgeryDate, setSurgeryDate] = useState<string | null>(episode.surgeryDate);
  const [procedure, setProcedure] = useState<string | null>(episode.procedure);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string>();

  const needsProcedure = (visit === 'postop' || visit === 'intraop') && !episode.procedure;
  const since = surgeryDate && surgeryDate < today ? intervalFor(surgeryDate, today) : null;
  const isProposal = visit === proposal.visit && interval === proposal.interval;
  const canStart = !busy && (!needsProcedure || !!procedure) && (visit !== 'postop' || !!interval);

  const chooseVisit = (v: VisitType) => {
    setVisit(v);
    setIntervalChoice(v === 'postop' ? (since?.preset ?? interval) : undefined);
  };

  const start = async () => {
    setFailure(undefined);
    try {
      if (needsProcedure && procedure) {
        setBusy('Ingreep opslaan en eerdere foto’s bijwerken…');
        await archive.setProcedure(episodeId, procedure);
      }
      const finalSurgery = visit === 'intraop' && !surgeryDate ? today : surgeryDate;
      if (finalSurgery !== episode.surgeryDate) await archive.setSurgeryDate(episodeId, finalSurgery);
      setBusy('Sessie starten…');
      const session = await archive.startSession(episodeId, visit, { interval: visit === 'postop' ? interval : undefined });
      changed();
      dispatch({ type: 'SESSION_STARTED', sessionId: session.id });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <View style={s.screen}>
      <Header title="Welk bezoek?" onBack={() => dispatch({ type: 'BACK' })} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.h2}>{fullName(patient)}</Text>
        <Text style={s.muted}>{treatmentTitle(episode)}</Text>

        <Big
          title={proposal.label}
          sub={isProposal ? 'voorgesteld' : 'tik om het voorstel te nemen'}
          tone={isProposal ? 'accent' : 'muted'}
          onPress={() => {
            setVisit(proposal.visit);
            setIntervalChoice(proposal.interval);
          }}
        />
        <View style={s.row}>
          {VISITS.map((v) => (
            <Chip key={v} label={visitLabel(v)} selected={visit === v} onPress={() => chooseVisit(v)} />
          ))}
        </View>

        {visit === 'postop' && (
          <>
            {!episode.surgeryDate && (
              <DateField
                label="OK-datum (optioneel, berekent het interval)"
                initialIso={surgeryDate}
                onChange={(iso) => {
                  setSurgeryDate(iso);
                  if (iso && iso < today) setIntervalChoice(intervalFor(iso, today).preset);
                }}
              />
            )}
            {since && <Text style={s.muted}>Sinds de operatie: {since.label}</Text>}
            <View style={s.row}>
              {INTERVAL_PRESETS.map((p) => (
                <Chip key={p.id} label={p.label} selected={interval === p.id} onPress={() => setIntervalChoice(p.id)} />
              ))}
              {interval && !INTERVAL_PRESETS.some((p) => p.id === interval) && <Chip label={interval} selected onPress={() => undefined} />}
            </View>
          </>
        )}

        {needsProcedure && (
          <View style={{ gap: 8 }}>
            <Text style={s.h2}>Welke ingreep? ({REGION_LABELS[episode.region]})</Text>
            <Text style={s.muted}>Wordt ook op de eerdere foto&apos;s van deze behandeling gezet.</Text>
            <ProcedurePicker region={episode.region} onlyRegion={episode.region !== 'other'} selected={procedure} onPick={(p) => setProcedure(p.id)} />
          </View>
        )}

        {failure && <Text style={{ color: c.bad }}>{failure}</Text>}
        {busy ? (
          <View style={s.row}>
            <ActivityIndicator />
            <Text style={s.muted}>{busy}</Text>
          </View>
        ) : null}
        <Big
          title={`Start · ${visitLabel(visit, visit === 'postop' ? interval : undefined)}`}
          sub={needsProcedure && procedure ? procedureLabel(procedure) ?? undefined : undefined}
          tone="ok"
          onPress={start}
          disabled={!canStart}
        />
      </ScrollView>
    </View>
  );
}
