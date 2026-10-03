/** The three measurement screens from docs/spike-checklist.md, reachable from Settings. */
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SpikeOcr } from '../spike/SpikeOcr';
import { SpikeYaw } from '../spike/SpikeYaw';
import { SpikeFolder } from '../spike/SpikeFolder';
import { Big, Header, s } from '../ui/kit';
import type { Dispatch } from './types';

export function Spikes({ dispatch }: { dispatch: Dispatch }) {
  const [which, setWhich] = useState<'ocr' | 'yaw' | 'folder' | null>(null);
  const back = () => setWhich(null);
  if (which === 'ocr') return <SpikeOcr onBack={back} />;
  if (which === 'yaw') return <SpikeYaw onBack={back} />;
  if (which === 'folder') return <SpikeFolder onBack={back} />;
  return (
    <View style={s.screen}>
      <Header title="Metingen" onBack={() => dispatch({ type: 'BACK' })} />
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.muted}>Zie docs/spike-checklist.md. Spike (c) wil een aparte, lege testmap.</Text>
        <Big title="(a) Etiket lezen — OCR-score" onPress={() => setWhich('ocr')} />
        <Big title="(b) Hoek live — referentie-regel" onPress={() => setWhich('yaw')} />
        <Big title="(c) Map kiezen — opslag end-to-end" onPress={() => setWhich('folder')} />
      </ScrollView>
    </View>
  );
}
