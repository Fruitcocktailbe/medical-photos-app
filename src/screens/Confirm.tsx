/**
 * Identity: always one explicit tap, birth date highlighted (decision U2).
 * Same surname + first name + birth date = same patient (U6).
 */
import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';
import type { LabelParse } from '../core/identity/parseLabel';
import { formatDutchDate } from '../core/dates';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { deleteTempFile } from '../platform/previewCache';
import { Big, Card, DateField, Header, Link, c, s } from '../ui/kit';
import { fullName } from '../ui/labels';
import type { Dispatch } from './types';

export function Confirm({ parse, photoUri, demo, dispatch }: { parse: LabelParse; photoUri?: string; demo?: boolean; dispatch: Dispatch }) {
  const archive = useReadyArchive();
  const { changed } = useArchive();
  const [surname, setSurname] = useState(parse.surname ?? '');
  const [firstName, setFirstName] = useState(parse.firstName ?? '');
  const [dob, setDob] = useState<string | null>(parse.dob ?? null);
  const [patientNumber, setPatientNumber] = useState(parse.patientNumber ?? '');
  const [edited, setEdited] = useState(false);
  const [typoChoice, setTypoChoice] = useState<'existing' | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  // The label photo never outlives this screen.
  useEffect(() => () => deleteTempFile(photoUri), [photoUri]);

  const valid = surname.trim().length > 0 && firstName.trim().length > 0 && !!dob;
  const matches = valid && dob ? archive.matchPatients({ surname, firstName, dob }) : [];
  const exact = matches.find((m) => m.kind === 'exact');
  const typo = exact ? undefined : matches.find((m) => m.kind === 'probable-typo');
  const sameName = matches.find((m) => m.kind === 'same-name-other-dob');
  const conflictBlocks = parse.conflicts.length > 0 && !edited;
  const blocked = !valid || conflictBlocks || (!!typo && typoChoice === null) || busy;

  const edit = (fn: () => void) => {
    fn();
    setEdited(true);
    setTypoChoice(null);
  };

  const confirm = async () => {
    if (!dob) return;
    setBusy(true);
    try {
      const patient =
        exact?.patient ??
        (typo && typoChoice === 'existing'
          ? typo.patient
          : await archive.createPatient({ surname, firstName, dob, patientNumber: patientNumber.trim() || undefined, nationalNumber: parse.nationalNumber }));
      changed();
      dispatch({ type: 'PATIENT_CONFIRMED', patientId: patient.id, hasEpisodes: archive.episodesOf(patient.id).length > 0 });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <Header title={demo ? 'Proefrit: patiënt' : 'Klopt deze patiënt?'} onBack={() => dispatch({ type: 'BACK' })} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {photoUri ? <Image source={{ uri: photoUri }} style={{ height: 120, borderRadius: 10, backgroundColor: c.card }} resizeMode="contain" /> : null}

        <Text style={s.muted}>Achternaam</Text>
        <TextInput style={[s.input, { fontSize: 22, fontWeight: '700' }]} value={surname} autoCapitalize="characters" onChangeText={(t) => edit(() => setSurname(t))} />
        <Text style={s.muted}>Voornaam</Text>
        <TextInput style={[s.input, { fontSize: 20 }]} value={firstName} autoCapitalize="words" onChangeText={(t) => edit(() => setFirstName(t))} />
        <View style={{ backgroundColor: '#fef3c7', borderRadius: 12, padding: 10 }}>
          <DateField label="Geboortedatum — check met de patiënt" initialIso={dob} onChange={(iso) => edit(() => setDob(iso))} />
        </View>
        <Text style={s.muted}>Patiëntnummer (optioneel)</Text>
        <TextInput style={s.input} value={patientNumber} keyboardType="number-pad" onChangeText={(t) => edit(() => setPatientNumber(t))} />

        {parse.conflicts.map((m) => (
          <Text key={m} style={{ color: c.bad }}>
            ⚠ {m}
            {conflictBlocks ? ' Pas een veld aan om verder te gaan.' : ''}
          </Text>
        ))}
        {parse.warnings.map((w) => (
          <Text key={w} style={s.muted}>
            • {w}
          </Text>
        ))}

        {exact && (
          <Card style={{ backgroundColor: '#dcfce7' }}>
            <Text style={[s.body, { color: c.ok, fontWeight: '700' }]}>
              Bekende patiënt · {archive.episodesOf(exact.patient.id).length} behandeling(en)
            </Text>
          </Card>
        )}
        {typo && (
          <Card style={{ backgroundColor: '#ffedd5' }}>
            <Text style={[s.body, { color: c.warn, fontWeight: '700' }]}>
              Bedoel je {fullName(typo.patient)}, ° {formatDutchDate(typo.patient.dob)}?
            </Text>
            <View style={s.row}>
              <Link title={typoChoice === 'existing' ? '✓ Ja, die' : 'Ja, die'} onPress={() => setTypoChoice('existing')} />
              <Link title={typoChoice === 'new' ? '✓ Nee, nieuwe patiënt' : 'Nee, nieuwe patiënt'} tone="ink" onPress={() => setTypoChoice('new')} />
            </View>
          </Card>
        )}
        {!exact && !typo && sameName && (
          <Card>
            <Text style={s.muted}>
              Er bestaat een andere patiënt met deze naam (° {formatDutchDate(sameName.patient.dob)}). Dit wordt een nieuwe patiënt.
            </Text>
          </Card>
        )}
        {failure && <Text style={{ color: c.bad }}>{failure}</Text>}

        <Big title="Klopt ✓" tone="ok" onPress={confirm} disabled={blocked} />
        <Link title="Opnieuw scannen" tone="muted" onPress={() => dispatch({ type: 'BACK' })} />
      </ScrollView>
    </View>
  );
}
