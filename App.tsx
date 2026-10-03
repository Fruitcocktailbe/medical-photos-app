/**
 * Spike build. Three throwaway screens that answer the open questions in
 * docs/spike-checklist.md before the MVP flow is built (MVP adopts Expo Router).
 */
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { SpikeOcr } from './src/spike/SpikeOcr';
import { SpikeYaw } from './src/spike/SpikeYaw';
import { SpikeFolder } from './src/spike/SpikeFolder';
import { Button, styles } from './src/spike/ui';

type Screen = 'menu' | 'ocr' | 'yaw' | 'folder';

export default function App() {
  // Patient names and faces are on screen: no screenshots, blurred in the app switcher (PRD F9).
  usePreventScreenCapture();
  const [screen, setScreen] = useState<Screen>('menu');
  const back = () => setScreen('menu');

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      {screen === 'ocr' && <SpikeOcr onBack={back} />}
      {screen === 'yaw' && <SpikeYaw onBack={back} />}
      {screen === 'folder' && <SpikeFolder onBack={back} />}
      {screen === 'menu' && (
        <ScrollView contentContainerStyle={styles.pad}>
          <Text style={styles.title}>Medical Photos — spikes</Text>
          <Text style={styles.muted}>Werknaam. Drie metingen vóór de echte app. Zie docs/spike-checklist.md.</Text>
          <Button title="(a) Etiket lezen — OCR-score" onPress={() => setScreen('ocr')} />
          <Button title="(b) Hoek live — referentie-regel" onPress={() => setScreen('yaw')} />
          <Button title="(c) Map kiezen — opslag end-to-end" onPress={() => setScreen('folder')} />
        </ScrollView>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
