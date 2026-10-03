import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Big, s } from '../ui/kit';

export function LockScreen({ unlock }: { unlock: () => void }) {
  useEffect(() => {
    unlock();
  }, [unlock]);
  return (
    <View style={[s.screen, s.pad, { justifyContent: 'center' }]}>
      <Text style={[s.h1, { textAlign: 'center' }]}>Vergrendeld</Text>
      <Big title="Ontgrendel" onPress={unlock} />
    </View>
  );
}
