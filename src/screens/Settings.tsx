/** Settings: folder, lock, sync, test run, measurement spikes. */
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useArchive } from '../app/ArchiveProvider';
import { SafTarget } from '../platform/SafTarget';
import { authenticate } from '../platform/lock';
import { loadSettings, saveSettings } from '../platform/settings';
import { Big, Card, Header, Link, c, s } from '../ui/kit';
import type { Dispatch } from './types';

export function Settings({ dispatch, onLockChanged }: { dispatch: Dispatch; onLockChanged: (on: boolean) => void }) {
  const { rootUri, openRoot, sync, syncNow, status, archive } = useArchive();
  const [lockOn, setLockOn] = useState(() => !!loadSettings().lockEnabled);
  const [message, setMessage] = useState<string>();

  const changeFolder = async () => {
    if (sync.pending > 0) {
      setMessage(`Er wachten nog ${sync.pending} acties op de huidige map. Synchroniseer eerst.`);
      return;
    }
    try {
      const t = await SafTarget.pick();
      setMessage((await openRoot(t.uri)) ? 'Map gewijzigd.' : 'Die map lukt niet.');
    } catch {
      // cancelled
    }
  };

  const toggleLock = async (on: boolean) => {
    if (!(await authenticate(on ? 'Bevestig om de vergrendeling aan te zetten' : 'Bevestig om de vergrendeling uit te zetten'))) return;
    saveSettings({ lockEnabled: on });
    setLockOn(on);
    onLockChanged(on);
  };

  const folderName = rootUri ? decodeURIComponent(rootUri).split(/[/:]/).filter(Boolean).slice(-2).join(' / ') : 'geen';

  return (
    <View style={s.screen}>
      <Header title="Instellingen" onBack={() => dispatch({ type: 'BACK' })} />
      <ScrollView contentContainerStyle={s.pad}>
        <Card>
          <Text style={s.h2}>Fotomap</Text>
          <Text style={s.body}>{folderName}</Text>
          <Text style={s.muted}>
            {status === 'ready' && archive ? `${archive.registry.patients.length} patiënten` : status}
            {archive && archive.problems.length > 0 ? ` · ${archive.problems.length} meldingen` : ''}
          </Text>
          <Link title="Andere map kiezen" onPress={changeFolder} />
        </Card>

        <Card>
          <Text style={s.h2}>Synchronisatie</Text>
          <Text style={[s.body, { color: sync.error ? c.bad : sync.pending ? c.warn : c.ok }]}>
            {sync.error ? `Fout: ${sync.error}` : sync.pending ? `${sync.pending} acties wachten` : 'Alles staat in de map'}
          </Text>
          <Link title={sync.running ? 'Bezig…' : 'Nu synchroniseren'} onPress={syncNow} disabled={sync.running} />
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.h2}>Vergrendeling</Text>
            <Switch value={lockOn} onValueChange={toggleLock} />
          </View>
          <Text style={s.muted}>Vingerafdruk of pincode bij openen en na 60 s in de achtergrond.</Text>
          {!lockOn && <Text style={{ color: c.warn }}>Uit: iedereen met je telefoon ziet de patiënten.</Text>}
        </Card>

        {message && <Text style={s.body}>{message}</Text>}
        <Big title="Standaardzichten per gebied" tone="ink" onPress={() => dispatch({ type: 'OPEN_VIEW_SETS' })} />
        <Big title="Proefrit met testpatiënt" tone="ink" onPress={() => dispatch({ type: 'START_DEMO' })} />
        <Link title="Metingen (spikes)" tone="muted" onPress={() => dispatch({ type: 'OPEN_SPIKES' })} />
        <Text style={s.muted}>Medical Photos (werknaam) · ontwikkelversie</Text>
      </ScrollView>
    </View>
  );
}
