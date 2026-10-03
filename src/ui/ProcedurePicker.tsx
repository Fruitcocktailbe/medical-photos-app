/**
 * Procedure list with ★ favourites on top (your order), then "Vaak gebruikt",
 * then the rest. Tap the star to (un)favourite; tap the row to choose.
 * Favourites are stored in the photo folder (core/preferences.ts).
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { REGION_LABELS, type ProcedureDef } from '../core/catalog/catalog';
import { procedureSections } from '../core/preferences';
import { favouriteProcedures } from '../core/visits';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { c, s } from './kit';

export function ProcedurePicker({
  region,
  onlyRegion,
  selected,
  onPick,
  disabled,
}: {
  region: string | null;
  onlyRegion?: boolean;
  selected?: string | null;
  onPick: (p: ProcedureDef) => void;
  disabled?: boolean;
}) {
  const archive = useReadyArchive();
  const { changed } = useArchive();
  const [query, setQuery] = useState('');
  const starred = archive.preferences.favouriteProcedures;
  const sections = procedureSections({ starred, frequent: favouriteProcedures(archive.registry), query, region, onlyRegion });

  const star = async (id: string) => {
    await archive.toggleFavouriteProcedure(id);
    changed();
  };

  return (
    <View style={{ gap: 8 }}>
      <TextInput style={s.input} placeholder="Zoek ingreep…" value={query} onChangeText={setQuery} autoCorrect={false} />
      {sections.length === 0 && <Text style={s.muted}>Niets gevonden voor &quot;{query}&quot;.</Text>}
      {sections.map((section) => (
        <View key={section.key} style={{ gap: 6 }}>
          <Text style={[s.muted, { fontWeight: '700', marginTop: 4 }]}>{section.title}</Text>
          {section.items.map((p) => {
            const isStar = starred.includes(p.id);
            const isSel = selected === p.id;
            return (
              <View key={p.id} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 8 }, isSel ? { backgroundColor: '#cffafe' } : null]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Kies ${p.label}`}
                  disabled={disabled}
                  onPress={() => onPick(p)}
                  style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1, paddingVertical: 4 })}
                >
                  <Text style={s.body}>
                    {isSel ? '✓ ' : ''}
                    {p.label}
                  </Text>
                  {!onlyRegion && <Text style={s.muted}>{REGION_LABELS[p.region]}</Text>}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isStar ? `${p.label} uit favorieten` : `${p.label} als favoriet`}
                  onPress={() => star(p.id)}
                  hitSlop={12}
                  style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                >
                  <Text style={{ fontSize: 24, color: isStar ? '#eab308' : c.muted }}>{isStar ? '★' : '☆'}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
