/**
 * Root: screenshot block, archive, app lock, onboarding and the flow state
 * machine (src/core/flow/flow.ts; behaviour in docs/ux-flow.md).
 */
import { useEffect, useReducer, useState } from 'react';
import { BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initialScreen, isRoot, reduce } from './src/core/flow/flow';
import { ArchiveProvider } from './src/app/ArchiveProvider';
import { useAppLock } from './src/platform/lock';
import { loadSettings } from './src/platform/settings';
import { clearPreviews } from './src/platform/previewCache';
import { Onboarding } from './src/screens/Onboarding';
import { LockScreen } from './src/screens/LockScreen';
import { Scan } from './src/screens/Scan';
import { Confirm } from './src/screens/Confirm';
import { Treatment } from './src/screens/Treatment';
import { NewTreatment } from './src/screens/NewTreatment';
import { Visit } from './src/screens/Visit';
import { Capture } from './src/screens/Capture';
import { Summary } from './src/screens/Summary';
import { Settings } from './src/screens/Settings';
import { Spikes } from './src/screens/Spikes';
import { ViewSets } from './src/screens/ViewSets';
import { s } from './src/ui/kit';

// Stale thumbnails from a killed session never survive an app start.
clearPreviews();

export default function App() {
  // Patient names and faces are on screen: no screenshots, blank in the app switcher (PRD F9).
  usePreventScreenCapture();
  const [lockEnabled, setLockEnabled] = useState(() => !!loadSettings().lockEnabled);
  const { locked, unlock } = useAppLock(lockEnabled);
  const [screen, dispatch] = useReducer(reduce, undefined, () => initialScreen(!!loadSettings().onboardingDone));

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (locked) return true; // nothing moves behind the lock
      if (isRoot(screen)) return false;
      dispatch({ type: 'BACK' });
      return true;
    });
    return () => sub.remove();
  }, [screen, locked]);

  const dark = screen.name === 'scan' || screen.name === 'capture';

  return (
    <SafeAreaProvider>
      <ArchiveProvider>
        <SafeAreaView style={dark ? s.dark : s.screen}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          {locked ? (
            <LockScreen unlock={unlock} />
          ) : (
            <>
              {screen.name === 'onboarding' && <Onboarding step={screen.step} dispatch={dispatch} onLockEnabled={() => setLockEnabled(true)} />}
              {screen.name === 'scan' && <Scan dispatch={dispatch} />}
              {screen.name === 'confirm' && <Confirm parse={screen.parse} photoUri={screen.photoUri} demo={screen.demo} dispatch={dispatch} />}
              {screen.name === 'treatment' && <Treatment patientId={screen.patientId} dispatch={dispatch} />}
              {screen.name === 'newTreatment' && <NewTreatment patientId={screen.patientId} dispatch={dispatch} />}
              {screen.name === 'visit' && <Visit patientId={screen.patientId} episodeId={screen.episodeId} dispatch={dispatch} />}
              {screen.name === 'capture' && <Capture patientId={screen.patientId} episodeId={screen.episodeId} sessionId={screen.sessionId} dispatch={dispatch} />}
              {screen.name === 'summary' && <Summary patientId={screen.patientId} episodeId={screen.episodeId} sessionId={screen.sessionId} demo={screen.demo} dispatch={dispatch} />}
              {screen.name === 'settings' && <Settings dispatch={dispatch} onLockChanged={setLockEnabled} />}
              {screen.name === 'spikes' && <Spikes dispatch={dispatch} />}
              {screen.name === 'viewSets' && <ViewSets dispatch={dispatch} />}
            </>
          )}
        </SafeAreaView>
      </ArchiveProvider>
    </SafeAreaProvider>
  );
}
