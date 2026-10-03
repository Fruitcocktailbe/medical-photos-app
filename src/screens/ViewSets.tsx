/**
 * Standaardzichten (anatomy plan A6): per sub-area, show or hide views,
 * reorder them and add your own. Saved in the photo folder
 * (.medical-photos/views.json) so the tablet and a new phone use the same sets.
 */
import { useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import {
  AREA_LABELS, SUBAREAS, addCustomView, editableViews, moveView, subById, toggleViewHidden, type AreaId, type SubAreaDef,
} from '../core/catalog/catalog';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { Card, Header, Link, c, s } from '../ui/kit';
import type { Dispatch } from './types';

const AREAS = Object.keys(AREA_LABELS) as AreaId[];

export function ViewSets({ dispatch }: { dispatch: Dispatch }) {
  const [subId, setSubId] = useState<string | null>(null);
  const sub = subId ? subById(subId) : undefined;
  if (sub) return <SubAreaEditor sub={sub} onBack={() => setSubId(null)} />;
  return <SubAreaList onPick={setSubId} onBack={() => dispatch({ type: 'BACK' })} />;
}

function SubAreaList({ onPick, onBack }: { onPick: (id: string) => void; onBack: () => void }) {
  const archive = useReadyArchive();
  useArchive();
  return (
    <View style={s.screen}>
      <Header title="Standaardzichten" onBack={onBack} />
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.muted}>Welke foto&apos;s de camera per gebied voorstelt. Wijzigingen gelden voor nieuwe sessies; oude foto&apos;s blijven zoals ze zijn.</Text>
        {AREAS.map((area) => (
          <View key={area} style={{ gap: 6 }}>
            <Text style={[s.muted, { fontWeight: '700', marginTop: 6 }]}>{AREA_LABELS[area]}</Text>
            {SUBAREAS.filter((x) => x.area === area).map((x) => {
              const edited = !!archive.viewOverrides[x.id];
              const n = editableViews(x, archive.viewOverrides).filter((e) => !e.hidden).length;
              return (
                <Card key={x.id} onPress={() => onPick(x.id)}>
                  <Text style={s.body}>
                    {x.label}
                    {edited ? '  · aangepast' : ''}
                  </Text>
                  <Text style={s.muted}>
                    {n} zichten{x.sided ? ' · met zijde' : ''}
                  </Text>
                </Card>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SubAreaEditor({ sub, onBack }: { sub: SubAreaDef; onBack: () => void }) {
  const archive = useReadyArchive();
  const { changed } = useArchive();
  const [label, setLabel] = useState('');
  const [failure, setFailure] = useState<string>();
  const list = editableViews(sub, archive.viewOverrides);

  const save = async (override: Parameters<typeof archive.setViewOverride>[1]) => {
    try {
      await archive.setViewOverride(sub.id, override);
      changed();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={s.screen}>
      <Header title={sub.label} onBack={onBack} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {list.map(({ view, hidden }, i) => (
          <Card key={view.id} style={hidden ? { opacity: 0.55 } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.body}>
                  {view.label}
                  {view.perSide ? '  (per zijde)' : ''}
                </Text>
                <Text style={s.muted}>{view.custom ? 'eigen zicht' : view.detect === 'face' ? 'live hoekgeleiding' : view.detect === 'pose' ? 'ghost (lichaamshouding later)' : 'ghost'}</Text>
              </View>
              <Link title="↑" tone="muted" disabled={i === 0} onPress={() => save(moveView(sub, archive.viewOverrides, view.id, -1))} />
              <Link title="↓" tone="muted" disabled={i === list.length - 1} onPress={() => save(moveView(sub, archive.viewOverrides, view.id, 1))} />
              <Switch value={!hidden} onValueChange={() => save(toggleViewHidden(sub, archive.viewOverrides, view.id))} />
            </View>
          </Card>
        ))}
        <Text style={[s.muted, { fontWeight: '700', marginTop: 6 }]}>Eigen zicht toevoegen</Text>
        <View style={s.row}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="bv. Ptosis close-up" value={label} onChangeText={setLabel} />
          <Link
            title="Voeg toe"
            disabled={!label.trim()}
            onPress={() => {
              save(addCustomView(sub, archive.viewOverrides, label));
              setLabel('');
            }}
          />
        </View>
        {failure && <Text style={{ color: c.bad }}>{failure}</Text>}
        {archive.viewOverrides[sub.id] && <Link title="Standaard herstellen" tone="bad" onPress={() => save(null)} />}
      </ScrollView>
    </View>
  );
}
