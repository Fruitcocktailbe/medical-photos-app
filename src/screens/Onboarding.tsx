/** First launch: folder → lock → ready (docs/ux-flow.md › Onboarding, decision U5). */
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafTarget } from '../platform/SafTarget';
import { authenticate, deviceSecurity, type DeviceSecurity } from '../platform/lock';
import { saveSettings } from '../platform/settings';
import { useArchive } from '../app/ArchiveProvider';
import { Big, Link, c, s } from '../ui/kit';
import type { Dispatch } from './types';

export function Onboarding({ step, dispatch, onLockEnabled }: { step: 'folder' | 'lock' | 'ready'; dispatch: Dispatch; onLockEnabled: () => void }) {
  return (
    <ScrollView contentContainerStyle={[s.pad, { paddingTop: 32 }]}>
      <Text style={s.muted}>Stap {step === 'folder' ? 1 : step === 'lock' ? 2 : 3} van 3</Text>
      {step === 'folder' && <FolderStep dispatch={dispatch} />}
      {step === 'lock' && <LockStep dispatch={dispatch} onLockEnabled={onLockEnabled} />}
      {step === 'ready' && <ReadyStep dispatch={dispatch} />}
    </ScrollView>
  );
}

function FolderStep({ dispatch }: { dispatch: Dispatch }) {
  const { openRoot, status, error } = useArchive();
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    setBusy(true);
    try {
      const t = await SafTarget.pick();
      if (await openRoot(t.uri)) dispatch({ type: 'ONBOARDING_NEXT' });
    } catch {
      // picker cancelled
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 14 }}>
      <Text style={s.h1}>Waar bewaren we je foto&apos;s?</Text>
      <Text style={s.body}>
        Nooit in je galerij. Altijd in één map die jij kiest: in Nextcloud, Google Drive, OneDrive of op deze telefoon. Elke patiënt krijgt
        daar een eigen map.
      </Text>
      <Text style={s.muted}>Tip: maak in de kiezer een nieuwe, lege map, bijvoorbeeld &quot;Medical Photos&quot;.</Text>
      <Big title={busy ? 'Map openen…' : 'Kies of maak een map'} onPress={pick} disabled={busy} />
      {status === 'error' && <Text style={{ color: c.bad }}>Deze map lukt niet: {error}. Kies een andere.</Text>}
    </View>
  );
}

function LockStep({ dispatch, onLockEnabled }: { dispatch: Dispatch; onLockEnabled: () => void }) {
  const [security, setSecurity] = useState<DeviceSecurity | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    deviceSecurity().then(setSecurity, () => setSecurity('none'));
  }, []);
  if (!security) return <ActivityIndicator />;
  const enable = async () => {
    if (await authenticate('Bevestig om de app te beveiligen')) {
      saveSettings({ lockEnabled: true });
      onLockEnabled();
      dispatch({ type: 'ONBOARDING_NEXT' });
    } else setFailed(true);
  };
  return (
    <View style={{ gap: 14 }}>
      <Text style={s.h1}>Beveilig de app</Text>
      <Text style={s.body}>
        De app vraagt je vingerafdruk of pincode bij het openen en na een minuut in de achtergrond. Schermafdrukken zijn altijd geblokkeerd.
      </Text>
      {security === 'none' ? (
        <>
          <Text style={{ color: c.warn, fontSize: 16 }}>
            Deze telefoon heeft geen schermvergrendeling. Stel er eerst een in via Instellingen › Beveiliging; zonder kan de app niet beveiligd
            worden.
          </Text>
          <Link title="Toch verder zonder vergrendeling" tone="warn" onPress={() => dispatch({ type: 'ONBOARDING_NEXT' })} />
        </>
      ) : (
        <>
          <Big title={security === 'biometric' ? 'Beveilig met vingerafdruk' : 'Beveilig met pincode'} onPress={enable} />
          {failed && <Text style={{ color: c.bad }}>Niet gelukt. Probeer opnieuw.</Text>}
        </>
      )}
    </View>
  );
}

function ReadyStep({ dispatch }: { dispatch: Dispatch }) {
  const finish = (demo: boolean) => {
    saveSettings({ onboardingDone: true });
    dispatch(demo ? { type: 'START_DEMO' } : { type: 'ONBOARDING_DONE' });
  };
  return (
    <View style={{ gap: 14 }}>
      <Text style={s.h1}>Klaar</Text>
      <Text style={s.body}>
        De app opent voortaan meteen op de camera: richt op het etiket, bevestig de patiënt, kies behandeling en bezoek, fotografeer.
      </Text>
      <Big title="Proefrit met testpatiënt" sub="Fotografeer een voorwerp; achteraf alles wissen" onPress={() => finish(true)} />
      <Big title="Start" tone="ink" onPress={() => finish(false)} />
    </View>
  );
}
