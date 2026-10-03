/**
 * New treatment (anatomy plan): ★ favourites on top, then the body map
 * (front/back) with sub-area chips per tapped zone, sides for limbs, nerves,
 * ears and facial nerve, skin spots pinned where you tapped, several areas
 * per treatment, an optional procedure and surgery date (patients who are
 * already operated, U7).
 */
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import {
  areasLabel, needsSide, needsSpot, procedureById, selectionLabel, selectionsForProcedure, subById, type ProcedureDef,
} from '../core/catalog/catalog';
import { SKIN_SUBS, spotLabel, type MapSide, type Zone } from '../core/catalog/bodymap';
import type { AreaSelection, Side } from '../core/types';
import { useArchive, useReadyArchive } from '../app/ArchiveProvider';
import { BodyMap } from '../ui/BodyMap';
import { Big, Card, Chip, DateField, Header, Link, c, s } from '../ui/kit';
import { ProcedurePicker } from '../ui/ProcedurePicker';
import type { Dispatch } from './types';

const SIDES: { id: Side; label: string }[] = [
  { id: 'L', label: 'Links' },
  { id: 'R', label: 'Rechts' },
  { id: 'both', label: 'Beide' },
];

interface Picked {
  sel: AreaSelection;
  /** Body-map zone it came from, for highlighting. */
  zoneId?: string;
}

export function NewTreatment({ patientId, dispatch }: { patientId: string; dispatch: Dispatch }) {
  const archive = useReadyArchive();
  const { changed } = useArchive();
  const [map, setMap] = useState<MapSide>('front');
  const [zone, setZone] = useState<Zone | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [procedure, setProcedure] = useState<ProcedureDef | null>(null);
  const [surgeryDate, setSurgeryDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  const favSubs = archive.preferences.favouriteAreas.filter((id) => subById(id));
  const favProcs = archive.preferences.favouriteProcedures.map(procedureById).filter((p): p is ProcedureDef => !!p);
  const areas = picked.map((p) => p.sel);
  const incomplete = areas.some((a) => needsSide(a) || needsSpot(a));
  const canStart = !busy && areas.length > 0 && !incomplete;

  const start = async (list: AreaSelection[], proc: ProcedureDef | null) => {
    setBusy(true);
    setFailure(undefined);
    try {
      const e = await archive.startEpisode(patientId, list, undefined, { procedure: proc?.id ?? null, surgeryDate });
      changed();
      dispatch({ type: 'EPISODE_CHOSEN', episodeId: e.id });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const add = (sel: AreaSelection, zoneId?: string) => {
    setPicked((list) => {
      const dup = list.findIndex((p) => p.sel.sub === sel.sub && !sel.spot && !p.sel.spot);
      if (dup >= 0) {
        // Same sub-area again from the other side → becomes "both".
        const cur = list[dup].sel;
        if (subById(sel.sub)?.sided && cur.side && sel.side && cur.side !== sel.side) {
          return list.map((p, i) => (i === dup ? { ...p, sel: { ...cur, side: 'both' } } : p));
        }
        return list;
      }
      return [...list, { sel, zoneId }];
    });
  };

  const update = (i: number, sel: AreaSelection) => setPicked((list) => list.map((p, j) => (j === i ? { ...p, sel } : p)));
  const remove = (i: number) => setPicked((list) => list.filter((_, j) => j !== i));

  const chooseProcedure = (p: ProcedureDef) => {
    const extra = selectionsForProcedure(p).filter((sel) => !areas.some((m) => m.sub === sel.sub));
    // Fast path: nothing chosen yet and the procedure says it all → start right away.
    if (areas.length === 0 && extra.length > 0 && !extra.some((a) => needsSide(a) || needsSpot(a))) {
      start(extra, p);
      return;
    }
    setProcedure(p);
    setPicked((list) => [...list, ...extra.map((sel) => ({ sel }))]);
  };

  const pickSub = (subId: string) => {
    const sub = subById(subId);
    if (!sub) return;
    if (sub.spot) {
      if (!zone || !point) return;
      add({ sub: subId, spot: { map, x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10, label: spotLabel(zone) } }, zone.id);
      return;
    }
    add(sub.sided && zone?.side ? { sub: subId, side: zone.side } : { sub: subId }, zone?.id);
  };

  const starSub = async (subId: string) => {
    await archive.toggleFavouriteArea(subId);
    changed();
  };

  const subChip = (subId: string) => {
    const sub = subById(subId);
    if (!sub) return null;
    const fav = favSubs.includes(subId);
    return <Chip key={subId} label={`${fav ? '★ ' : ''}${sub.label}`} onPress={() => pickSub(subId)} onLongPress={() => starSub(subId)} />;
  };

  return (
    <View style={s.screen}>
      <Header title="Nieuwe behandeling" onBack={() => dispatch({ type: 'BACK' })} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {(favProcs.length > 0 || favSubs.length > 0) && (
          <View style={{ gap: 6 }}>
            <Text style={[s.muted, { fontWeight: '700' }]}>★ Favorieten</Text>
            <View style={s.row}>
              {favProcs.map((p) => (
                <Chip key={p.id} label={p.label} selected={procedure?.id === p.id} onPress={() => chooseProcedure(p)} />
              ))}
              {favSubs.map((id) => (
                <Chip key={`sub-${id}`} label={subById(id)!.label} onPress={() => add({ sub: id })} onLongPress={() => starSub(id)} />
              ))}
            </View>
          </View>
        )}

        <Text style={s.h2}>Waar?</Text>
        <View style={s.row}>
          <Chip label="Voorzijde" selected={map === 'front'} onPress={() => { setMap('front'); setZone(null); }} />
          <Chip label="Achterzijde" selected={map === 'back'} onPress={() => { setMap('back'); setZone(null); }} />
        </View>
        <BodyMap
          map={map}
          activeZone={zone?.id}
          markedZones={picked.map((p) => p.zoneId).filter((z): z is string => !!z)}
          pins={areas.filter((a) => a.spot?.map === map).map((a) => a.spot!)}
          onTap={(z, pt) => {
            setZone(z);
            setPoint(pt);
          }}
        />
        {zone ? (
          <View style={{ gap: 6 }}>
            <Text style={s.muted}>
              {spotLabel(zone)} — tik een gebied · lang drukken = favoriet
            </Text>
            <View style={s.row}>{zone.subs.map(subChip)}</View>
            <Text style={s.muted}>Huid op deze plek:</Text>
            <View style={s.row}>
              {SKIN_SUBS.map((id) => (
                <Chip key={id} label={subById(id)!.label} onPress={() => pickSub(id)} />
              ))}
            </View>
          </View>
        ) : (
          <Text style={s.muted}>Tik op de kaart, of kies hieronder een ingreep.</Text>
        )}

        {picked.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={s.h2}>Gekozen</Text>
            {picked.map((p, i) => {
              const sub = subById(p.sel.sub)!;
              return (
                <Card key={`${p.sel.sub}-${i}`} style={needsSide(p.sel) ? { borderWidth: 1, borderColor: c.warn } : undefined}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[s.body, { fontWeight: '700', flex: 1 }]}>{selectionLabel(p.sel)}</Text>
                    <Link title="✕" tone="muted" onPress={() => remove(i)} />
                  </View>
                  {sub.sided && (
                    <View style={s.row}>
                      {SIDES.map((sd) => (
                        <Chip key={sd.id} label={sd.label} selected={p.sel.side === sd.id} onPress={() => update(i, { ...p.sel, side: sd.id })} />
                      ))}
                      {!p.sel.side && <Text style={{ color: c.warn }}>Kies de zijde</Text>}
                    </View>
                  )}
                  {p.sel.spot && (
                    <TextInput
                      style={[s.input, { fontSize: 16 }]}
                      value={p.sel.spot.label}
                      onChangeText={(t) => update(i, { ...p.sel, spot: { ...p.sel.spot!, label: t } })}
                    />
                  )}
                </Card>
              );
            })}
          </View>
        )}

        <Text style={[s.h2, { marginTop: 8 }]}>Ingreep (optioneel)</Text>
        {procedure ? (
          <View style={s.row}>
            <Chip label={`✓ ${procedure.label}`} selected onPress={() => setProcedure(null)} />
            <Link title="Wis" tone="muted" onPress={() => setProcedure(null)} />
          </View>
        ) : (
          <Text style={s.muted}>Nog geen ingreep (consult, pre-op)? Laat leeg; je kiest ze later, bij de operatie.</Text>
        )}
        <DateField label="Al geopereerd? OK-datum (optioneel)" onChange={(iso) => setSurgeryDate(iso)} />

        {failure && <Text style={{ color: c.bad }}>{failure}</Text>}
        <Big
          title={areas.length ? `Start · ${areasLabel(areas)}` : 'Kies eerst een gebied'}
          sub={procedure?.label}
          tone="ok"
          onPress={() => start(areas, procedure)}
          disabled={!canStart}
        />

        <Text style={[s.muted, { fontWeight: '700', marginTop: 8 }]}>Of kies een ingreep</Text>
        <ProcedurePicker subs={areas.map((a) => a.sub)} disabled={busy} selected={procedure?.id} onPick={chooseProcedure} />
      </ScrollView>
    </View>
  );
}
