import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const colors = { ok: '#1f9d55', warn: '#d97706', bad: '#c0392b', ink: '#111', muted: '#666', bg: '#fff', line: '#ddd' };

export function Button({ title, onPress, disabled, tone = 'ink' }: { title: string; onPress: () => void; disabled?: boolean; tone?: keyof typeof colors }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, { backgroundColor: colors[tone], opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.btnText}>{title}</Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Field({ label, value }: { label: string; value?: string }) {
  return (
    <Text style={styles.field}>
      <Text style={styles.fieldLabel}>{label}: </Text>
      {value ?? '—'}
    </Text>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink },
  muted: { color: colors.muted },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  field: { fontSize: 16, color: colors.ink },
  fieldLabel: { color: colors.muted },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 6 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: colors.ink },
});

/** Camera permission gate shared by the spike screens. */
export function CameraGate({ granted, canAsk, onAsk, onBack }: { granted: boolean; canAsk: boolean; onAsk: () => void; onBack: () => void }) {
  if (granted) return null;
  return (
    <View style={[styles.screen, styles.pad]}>
      <Text style={styles.title}>Camera nodig</Text>
      {canAsk ? (
        <Button title="Toestaan" onPress={onAsk} />
      ) : (
        <Text style={styles.muted}>Geweigerd. Zet de camera aan via Instellingen › Apps › Medical Photos.</Text>
      )}
      <Button title="Terug" onPress={onBack} tone="muted" />
    </View>
  );
}
