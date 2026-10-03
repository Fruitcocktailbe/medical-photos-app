import { describe, expect, it } from 'vitest';
import {
  FREE_KEY, PROCEDURES, SUBAREAS, areasFromLegacyRegion, areasLabel, areasSlug, effectiveViews, legacyViewKey, needsSide, needsSpot,
  parseViewKey, procedureArea, procedureById, selectionLabel, selectionsForProcedure, stepForKey, subById, viewKey, viewSequence,
} from './catalog';
import { SKIN_SUBS, ZONES, hitTest, spotLabel } from './bodymap';

const keys = (steps: { key: string }[]) => steps.map((s) => s.key);

describe('catalogue integrity', () => {
  it('sub-area ids are unique and every view id is unique within its sub-area', () => {
    expect(new Set(SUBAREAS.map((s) => s.id)).size).toBe(SUBAREAS.length);
    for (const s of SUBAREAS) expect(new Set(s.views.map((v) => v.id)).size).toBe(s.views.length);
  });
  it('procedure ids are unique and only reference existing sub-areas', () => {
    expect(new Set(PROCEDURES.map((p) => p.id)).size).toBe(PROCEDURES.length);
    for (const p of PROCEDURES) for (const id of p.subs) expect(subById(id), `${p.id} → ${id}`).toBeDefined();
  });
  it('sides exactly where decided (A2): limbs, nerves, ears, facial nerve', () => {
    const sided = SUBAREAS.filter((s) => s.sided).map((s) => s.id).sort();
    expect(sided).toEqual(['ears', 'foot', 'forearm', 'hand', 'leg', 'nerve-arm', 'nerve-foot', 'nerve-hand', 'nerve-leg', 'nerve-plexus', 'palsy', 'thigh', 'upperarm']);
  });
  it('per-side views only exist in sided sub-areas', () => {
    for (const s of SUBAREAS) if (!s.sided) expect(s.views.some((v) => v.perSide), s.id).toBe(false);
  });
  it('skin spot sub-areas are the four skin types', () => {
    expect(SUBAREAS.filter((s) => s.spot).map((s) => s.id)).toEqual(SKIN_SUBS);
  });
  it('every body-map zone offers existing sub-areas', () => {
    for (const z of ZONES) for (const id of z.subs) expect(subById(id), `${z.id} → ${id}`).toBeDefined();
  });
});

describe('view keys and sequences', () => {
  it('compose and parse keys', () => {
    expect(viewKey('thigh', 'medial', 'L')).toBe('thigh:medial:L');
    expect(parseViewKey('thigh:medial:L')).toEqual({ sub: 'thigh', viewId: 'medial', side: 'L' });
    expect(parseViewKey('face:frontal')).toEqual({ sub: 'face', viewId: 'frontal', side: undefined });
  });

  it('a paired area is shot once per view', () => {
    expect(keys(viewSequence([{ sub: 'breasts' }], 'preop'))).toEqual([
      'breasts:ap', 'breasts:ap-arms-up', 'breasts:oblique-L', 'breasts:oblique-R', 'breasts:lateral-L', 'breasts:lateral-R',
    ]);
  });

  it('"both" expands per-side views, L then R; views with both sides in frame stay single', () => {
    expect(keys(viewSequence([{ sub: 'thigh', side: 'both' }], 'preop'))).toEqual([
      'thigh:anterior', 'thigh:posterior', 'thigh:medial:L', 'thigh:medial:R', 'thigh:lateral:L', 'thigh:lateral:R',
    ]);
  });

  it('one side keeps only that side', () => {
    expect(keys(viewSequence([{ sub: 'hand', side: 'R' }], 'consult'))).toEqual(['hand:dorsal:R', 'hand:palmar:R', 'hand:lateral:R', 'hand:fist:R', 'hand:extension:R']);
  });

  it('several areas walk one after the other without duplicates (A3)', () => {
    const seq = keys(viewSequence([{ sub: 'breasts' }, { sub: 'abdomen' }, { sub: 'breasts' }], 'postop'));
    expect(seq.slice(0, 6).every((k) => k.startsWith('breasts:'))).toBe(true);
    expect(seq.slice(6).every((k) => k.startsWith('abdomen:'))).toBe(true);
    expect(new Set(seq).size).toBe(seq.length);
    expect(seq).toContain('abdomen:bending');
  });

  it('intra-op is free mode only, and nothing selected falls back to free', () => {
    expect(keys(viewSequence([{ sub: 'face' }], 'intraop'))).toEqual([FREE_KEY]);
    expect(keys(viewSequence([], 'preop'))).toEqual([FREE_KEY]);
  });

  it('labels carry the side in words', () => {
    expect(stepForKey('thigh:medial:R').label).toBe('Mediaal rechts');
    expect(stepForKey('face:lateral-L')).toMatchObject({ label: 'Profiel links', detect: 'face' });
    expect(stepForKey('unknown:thing').detect).toBe('manual');
  });
});

describe('view-set editor overrides (A6)', () => {
  const eyelids = subById('eyelids')!;
  it('hide, reorder and add custom views', () => {
    const v = effectiveViews(eyelids, { eyelids: { hidden: ['upgaze'], order: ['eyes-closed', 'eyes-open'], custom: [{ id: 'c1', label: 'Ptosis close-up' }] } });
    expect(v.map((x) => x.id)).toEqual(['eyes-closed', 'eyes-open', 'oblique-L', 'oblique-R', 'c1']);
    expect(v.find((x) => x.id === 'c1')).toMatchObject({ detect: 'manual', custom: true });
  });
  it('the sequence uses the overrides, and hidden views still resolve for old photos', () => {
    const o = { eyelids: { hidden: ['upgaze'] } };
    expect(keys(viewSequence([{ sub: 'eyelids' }], 'preop', o))).not.toContain('eyelids:upgaze');
    expect(stepForKey('eyelids:upgaze', o).label).toBe('Opwaartse blik');
  });
});

describe('selections', () => {
  it('procedures bring their areas and default sides', () => {
    expect(selectionsForProcedure(procedureById('brachioplasty')!)).toEqual([{ sub: 'upperarm', side: 'both' }]);
    expect(selectionsForProcedure(procedureById('carpal-tunnel')!)).toEqual([{ sub: 'hand' }]);
    expect(selectionsForProcedure(procedureById('breast-reconstruction-diep')!)).toEqual([{ sub: 'breasts' }, { sub: 'abdomen' }]);
    expect(selectionsForProcedure(procedureById('rpni')!)).toEqual([]);
    expect(procedureArea(procedureById('rpni')!)).toBe('nerve');
  });
  it('knows when a side or a pin is still missing', () => {
    expect(needsSide({ sub: 'hand' })).toBe(true);
    expect(needsSide({ sub: 'hand', side: 'L' })).toBe(false);
    expect(needsSide({ sub: 'breasts' })).toBe(false);
    expect(needsSpot({ sub: 'scar' })).toBe(true);
  });
  it('reads and slugs selections', () => {
    const scar = { sub: 'scar', spot: { map: 'front' as const, x: 1, y: 1, label: 'linker onderarm, voorzijde' } };
    expect(selectionLabel({ sub: 'thigh', side: 'L' })).toBe('Dij links');
    expect(selectionLabel(scar)).toBe('Litteken · linker onderarm, voorzijde');
    expect(areasLabel([{ sub: 'breasts' }, { sub: 'abdomen' }])).toBe('Borsten + Buik');
    expect(areasSlug([{ sub: 'eyelids' }])).toBe('oogleden');
    expect(areasSlug([{ sub: 'thigh', side: 'L' }])).toBe('dij-L');
    expect(areasSlug([{ sub: 'thigh', side: 'both' }])).toBe('dij-LR');
    expect(areasSlug([{ sub: 'breasts' }, { sub: 'abdomen' }])).toBe('borsten+buik');
    expect(areasSlug([scar])).toBe('litteken-onderarm-L');
    expect(areasSlug([{ sub: 'face' }, { sub: 'neck' }, { sub: 'eyelids' }, { sub: 'nose' }, { sub: 'lips' }])).toBe('gelaat+hals+oogleden+2');
  });
});

describe('legacy regions', () => {
  it('convert to areas and map old view ids', () => {
    expect(areasFromLegacyRegion('hand')).toEqual([{ sub: 'hand', side: 'both' }]);
    expect(areasFromLegacyRegion('other')).toEqual([{ sub: 'free' }]);
    expect(legacyViewKey('face', 'oblique-L')).toBe('face:oblique-L');
    expect(legacyViewKey('breast', 'body-lateral-R')).toBe('breasts:lateral-R');
    expect(legacyViewKey('hand', 'volar')).toBe('hand:palmar');
    expect(legacyViewKey('face', 'face:frontal')).toBe('face:frontal');
  });
});

describe('body map', () => {
  it('front view: the patient\'s right arm is on the screen\'s left', () => {
    expect(hitTest('front', 27, 50)).toMatchObject({ noun: 'bovenarm', side: 'R' });
    expect(hitTest('front', 72, 50)).toMatchObject({ noun: 'bovenarm', side: 'L' });
  });
  it('back view: the patient\'s left arm is on the screen\'s left', () => {
    expect(hitTest('back', 27, 50)).toMatchObject({ noun: 'bovenarm', side: 'L' });
  });
  it('trunk, head and background', () => {
    expect(hitTest('front', 50, 45)?.subs).toEqual(['breasts', 'chestwall']);
    expect(hitTest('front', 50, 15)?.subs).toContain('palsy');
    expect(hitTest('back', 50, 80)?.subs).toEqual(['buttocks']);
    expect(hitTest('front', 2, 2)).toBeNull();
  });
  it('spot labels read like a clinical note', () => {
    expect(spotLabel(hitTest('front', 72, 75)!)).toBe('linker onderarm, voorzijde');
    expect(spotLabel(hitTest('back', 50, 50)!)).toBe('rug, achterzijde');
  });
  it('every zone has a unique id and limb zones come in L/R pairs', () => {
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(ZONES.length);
    const sided = ZONES.filter((z) => z.side);
    expect(sided.filter((z) => z.side === 'L').length).toBe(sided.filter((z) => z.side === 'R').length);
  });
});

describe('view-set editor operations', () => {
  const eyelids = subById('eyelids')!;
  it('lists every view with its hidden flag, in the current order', async () => {
    const { editableViews, toggleViewHidden, moveView, addCustomView } = await import('./catalog');
    let o = {};
    o = { eyelids: toggleViewHidden(eyelids, o, 'upgaze') };
    expect(editableViews(eyelids, o).map((e) => [e.view.id, e.hidden])).toEqual([
      ['eyes-open', false], ['eyes-closed', false], ['upgaze', true], ['oblique-L', false], ['oblique-R', false],
    ]);
    o = { eyelids: moveView(eyelids, o, 'oblique-L', -1) };
    expect(editableViews(eyelids, o).map((e) => e.view.id)).toEqual(['eyes-open', 'eyes-closed', 'oblique-L', 'upgaze', 'oblique-R']);
    o = { eyelids: moveView(eyelids, o, 'eyes-open', -1) }; // already first: no change
    expect(editableViews(eyelids, o)[0].view.id).toBe('eyes-open');
    o = { eyelids: addCustomView(eyelids, o, 'Ptosis close-up') };
    o = { eyelids: addCustomView(eyelids, o, 'Ptosis close-up') };
    const ids = editableViews(eyelids, o).map((e) => e.view.id);
    expect(ids.slice(-2)).toEqual(['c-ptosis-close-up', 'c-ptosis-close-up-2']);
    expect(keys(viewSequence([{ sub: 'eyelids' }], 'preop', o))).not.toContain('eyelids:upgaze');
    expect(keys(viewSequence([{ sub: 'eyelids' }], 'preop', o))).toContain('eyelids:c-ptosis-close-up');
  });
});
