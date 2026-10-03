/**
 * Shared UI: big targets (one-handed, gloves-light), one decision per screen,
 * clinical palette. Dutch labels.
 */
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { formatDutchDate, parseDutchDate } from '../core/dates';
import type { SyncState } from '../app/ArchiveProvider';

export const c = {
  ink: '#0f172a',
  muted: '#64748b',
  accent: '#0e7490',
  ok: '#15803d',
  warn: '#b45309',
  bad: '#b91c1c',
  bg: '#ffffff',
  card: '#f1f5f9',
  line: '#e2e8f0',
  black: '#000000',
  white: '#ffffff',
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  dark: { flex: 1, backgroundColor: c.black },
  pad: { padding: 16, gap: 12 },
  h1: { fontSize: 24, fontWeight: '700', color: c.ink },
  h2: { fontSize: 18, fontWeight: '700', color: c.ink },
  body: { fontSize: 16, color: c.ink, lineHeight: 22 },
  muted: { fontSize: 14, color: c.muted, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  card: { backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 4 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, color: c.ink, backgroundColor: c.white },
});

type Tone = 'accent' | 'ok' | 'warn' | 'bad' | 'ink' | 'muted';

export function Big({ title, onPress, disabled, tone = 'accent', sub }: { title: string; onPress: () => void; disabled?: boolean; tone?: Tone; sub?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.big, { backgroundColor: c[tone], opacity: disabled ? 0.35 : pressed ? 0.75 : 1 }]}
    >
      <Text style={styles.bigText}>{title}</Text>
      {sub ? <Text style={styles.bigSub}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Link({ title, onPress, tone = 'accent', disabled }: { title: string; onPress: () => void; tone?: Tone; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={10} style={{ paddingVertical: 8, opacity: disabled ? 0.35 : 1 }}>
      <Text style={{ color: c[tone], fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, done, dark }: { label: string; selected?: boolean; onPress: () => void; done?: boolean; dark?: boolean }) {
  const fg = selected ? c.white : dark ? c.white : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? c.accent : dark ? 'rgba(255,255,255,0.15)' : c.card, borderColor: selected ? c.accent : dark ? 'transparent' : c.line }]}
    >
      <Text style={{ color: fg, fontSize: 15, fontWeight: selected ? '700' : '500' }}>
        {done ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? <Link title="‹ Terug" onPress={onBack} /> : <View />}
      <Text style={[s.h2, { flex: 1, textAlign: onBack ? 'center' : 'left' }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ minWidth: 60, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.card, style, { opacity: pressed ? 0.7 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function SyncDot({ sync, onPress }: { sync: SyncState; onPress?: () => void }) {
  const color = sync.error ? c.bad : sync.pending > 0 ? c.warn : c.ok;
  const label = sync.error ? 'Synchronisatie-fout' : sync.pending > 0 ? `${sync.pending} wachten` : 'Alles bewaard';
  return (
    <Pressable onPress={onPress} hitSlop={10} style={[s.row, { gap: 6 }]} accessibilityLabel={label}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ color: c.white, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** dd/mm/jjjj input that reports a valid ISO date or null. */
export function DateField({ label, initialIso, onChange }: { label: string; initialIso?: string | null; onChange: (iso: string | null, raw: string) => void }) {
  const [text, setText] = useState(formatDutchDate(initialIso ?? undefined));
  const iso = text ? parseDutchDate(text) : null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.muted}>{label}</Text>
      <TextInput
        style={[s.input, text && !iso ? { borderColor: c.bad } : null]}
        value={text}
        placeholder="dd/mm/jjjj"
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        onChangeText={(t) => {
          setText(t);
          onChange(t ? parseDutchDate(t) : null, t);
        }}
      />
      {text && !iso ? <Text style={{ color: c.bad }}>Geen geldige datum</Text> : null}
    </View>
  );
}

export interface SheetAction {
  label: string;
  onPress: () => void;
  tone?: Tone;
}

/** Bottom action sheet; Android dialogs allow only three buttons. */
export function ActionSheet({ title, actions, onClose }: { title: string | null; actions: SheetAction[]; onClose: () => void }) {
  return (
    <Modal visible={title !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={[s.h2, { marginBottom: 8 }]}>{title}</Text>
          {actions.map((a) => (
            <Big
              key={a.label}
              title={a.label}
              tone={a.tone ?? 'ink'}
              onPress={() => {
                onClose();
                a.onPress();
              }}
            />
          ))}
          <Link title="Annuleer" tone="muted" onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  big: { paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  bigText: { color: c.white, fontSize: 18, fontWeight: '700' },
  bigSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 },
});
