/**
 * Anatomy catalogue (anatomy plan, 03/10/2026): areas → sub-areas → views,
 * sides, skin spots and the procedure mapping. View sets are Claude's draft,
 * editable in the app (core/viewOverrides.ts); defaults live here.
 *
 * Textbook geometry per view is the FIRST-VISIT target. On every follow-up
 * the target becomes the geometry recorded with the reference photo of that
 * view key (guidance/targets.ts).
 */
import type { AreaSelection, Side, ViewId, VisitType } from '../types';

export type DetectMode = 'face' | 'pose' | 'manual';

export type AreaId = 'head' | 'facialNerve' | 'breast' | 'trunk' | 'buttocksGenital' | 'arm' | 'leg' | 'nerve' | 'skin' | 'other';

export interface ViewDef {
  id: string;
  /** Dutch UI label. */
  label: string;
  detect: DetectMode;
  /** Textbook patient yaw in degrees (+ = patient's left side to camera). */
  yaw?: number;
  pitch?: number;
  /** Shot once per side when the selection's side is "both". */
  perSide?: boolean;
  /** Added by the user in the view-set editor. */
  custom?: boolean;
}

export interface SubAreaDef {
  id: string;
  area: AreaId;
  label: string;
  /** Limbs, peripheral nerves, ears and facial nerve carry a side (A2). */
  sided: boolean;
  /** Skin spot: pinned on the body map (A5). */
  spot?: boolean;
  views: ViewDef[];
}

export const AREA_LABELS: Record<AreaId, string> = {
  head: 'Hoofd & gelaat',
  facialNerve: 'Facialis',
  breast: 'Borst & thorax',
  trunk: 'Romp',
  buttocksGenital: 'Billen & genitaal',
  arm: 'Arm',
  leg: 'Been',
  nerve: 'Perifere zenuw',
  skin: 'Huid',
  other: 'Overig',
};

const F = (id: string, label: string, yaw = 0, extra: Partial<ViewDef> = {}): ViewDef => ({ id, label, detect: 'face', yaw, ...extra });
const P = (id: string, label: string, yaw = 0, extra: Partial<ViewDef> = {}): ViewDef => ({ id, label, detect: 'pose', yaw, ...extra });
const M = (id: string, label: string, extra: Partial<ViewDef> = {}): ViewDef => ({ id, label, detect: 'manual', ...extra });
const side = (v: ViewDef): ViewDef => ({ ...v, perSide: true });

const FACE_SIX = [F('frontal', 'Frontaal rust'), F('frontal-smile', 'Frontaal glimlach'), F('oblique-L', '¾ links', 45), F('oblique-R', '¾ rechts', -45), F('lateral-L', 'Profiel links', 90), F('lateral-R', 'Profiel rechts', -90)];
const SKIN_VIEWS = [M('overview', 'Overzicht'), M('closeup', 'Close-up'), M('closeup-ruler', 'Close-up met liniaal')];

export const SUBAREAS: SubAreaDef[] = [
  // Hoofd & gelaat
  { id: 'face', area: 'head', label: 'Gelaat', sided: false, views: FACE_SIX },
  { id: 'eyelids', area: 'head', label: 'Oogleden', sided: false, views: [F('eyes-open', 'Ogen open'), F('eyes-closed', 'Ogen dicht'), F('upgaze', 'Opwaartse blik'), F('oblique-L', '¾ links', 45), F('oblique-R', '¾ rechts', -45)] },
  { id: 'nose', area: 'head', label: 'Neus', sided: false, views: [F('frontal', 'Frontaal'), F('oblique-L', '¾ links', 45), F('oblique-R', '¾ rechts', -45), F('lateral-L', 'Profiel links', 90), F('lateral-R', 'Profiel rechts', -90), M('basal', 'Basaal', { pitch: 45 })] },
  { id: 'lips', area: 'head', label: 'Lippen & kin', sided: false, views: [F('frontal', 'Frontaal rust'), F('frontal-smile', 'Frontaal glimlach'), F('lateral-L', 'Profiel links', 90), F('lateral-R', 'Profiel rechts', -90)] },
  { id: 'neck', area: 'head', label: 'Hals', sided: false, views: [F('frontal', 'Frontaal'), F('oblique-L', '¾ links', 45), F('oblique-R', '¾ rechts', -45), F('lateral-L', 'Profiel links', 90), F('lateral-R', 'Profiel rechts', -90)] },
  { id: 'ears', area: 'head', label: 'Oren', sided: true, views: [M('frontal', 'Frontaal'), M('posterior', 'Posterieur'), side(M('lateral-closeup', 'Lateraal close-up'))] },
  { id: 'scalp', area: 'head', label: 'Schedel / hoofdhuid', sided: false, views: [M('top', 'Boven'), M('back', 'Achter'), M('lateral-L', 'Lateraal links'), M('lateral-R', 'Lateraal rechts')] },
  // Facialis — side = aangedane zijde (metadata), views not per side
  { id: 'palsy', area: 'facialNerve', label: 'Aangezichtsverlamming', sided: true, views: [F('rest', 'Rust'), F('brow-raise', 'Wenkbrauwen optrekken'), F('eyes-gentle', 'Ogen zacht sluiten'), F('eyes-tight', 'Ogen krachtig sluiten'), F('smile', 'Glimlach met tanden'), F('pucker', 'Tuiten'), F('snarl', 'Neus optrekken')] },
  // Borst & thorax
  { id: 'breasts', area: 'breast', label: 'Borsten', sided: false, views: [P('ap', 'AP armen langs'), P('ap-arms-up', 'AP armen omhoog'), P('oblique-L', 'Schuin links', 45), P('oblique-R', 'Schuin rechts', -45), P('lateral-L', 'Lateraal links', 90), P('lateral-R', 'Lateraal rechts', -90)] },
  { id: 'chestwall', area: 'breast', label: 'Thoraxwand', sided: false, views: [P('ap', 'AP'), P('lateral-L', 'Lateraal links', 90), P('lateral-R', 'Lateraal rechts', -90)] },
  // Romp
  { id: 'abdomen', area: 'trunk', label: 'Buik', sided: false, views: [P('ap', 'AP'), P('oblique-L', 'Schuin links', 45), P('oblique-R', 'Schuin rechts', -45), P('lateral-L', 'Lateraal links', 90), P('lateral-R', 'Lateraal rechts', -90), M('bending', 'Voorovergebogen')] },
  { id: 'flanks', area: 'trunk', label: 'Flanken & taille', sided: false, views: [P('ap', 'AP'), P('pa', 'PA', 180), P('oblique-L', 'Schuin links', 45), P('oblique-R', 'Schuin rechts', -45)] },
  { id: 'back', area: 'trunk', label: 'Rug', sided: false, views: [P('pa', 'PA', 180), P('post-oblique-L', 'Posterieur schuin links', 135), P('post-oblique-R', 'Posterieur schuin rechts', -135)] },
  // Billen & genitaal
  { id: 'buttocks', area: 'buttocksGenital', label: 'Billen', sided: false, views: [P('pa', 'PA', 180), P('post-oblique-L', 'Posterieur schuin links', 135), P('post-oblique-R', 'Posterieur schuin rechts', -135), P('lateral-L', 'Lateraal links', 90), P('lateral-R', 'Lateraal rechts', -90)] },
  { id: 'genital', area: 'buttocksGenital', label: 'Genitaal / perineaal', sided: false, views: [M('standing-front', 'Vooraanzicht staand'), M('closeup', 'Close-up')] },
  // Arm
  { id: 'upperarm', area: 'arm', label: 'Bovenarm', sided: true, views: [P('ap-arms-down', 'AP armen langs'), P('abduction-front', '90° abductie voor'), P('abduction-back', '90° abductie achter', 180)] },
  { id: 'forearm', area: 'arm', label: 'Onderarm', sided: true, views: [side(M('volar', 'Volair')), side(M('dorsal', 'Dorsaal')), side(M('radial', 'Radiaal')), side(M('ulnar', 'Ulnair'))] },
  { id: 'hand', area: 'arm', label: 'Hand', sided: true, views: [side(M('dorsal', 'Dorsaal')), side(M('palmar', 'Palmair')), side(M('lateral', 'Lateraal')), side(M('fist', 'Vuist')), side(M('extension', 'Extensie'))] },
  // Been
  { id: 'thigh', area: 'leg', label: 'Dij', sided: true, views: [P('anterior', 'Anterieur'), P('posterior', 'Posterieur', 180), side(M('medial', 'Mediaal')), side(M('lateral', 'Lateraal'))] },
  { id: 'leg', area: 'leg', label: 'Knie & onderbeen', sided: true, views: [P('anterior', 'Anterieur'), P('posterior', 'Posterieur', 180), side(M('medial', 'Mediaal')), side(M('lateral', 'Lateraal'))] },
  { id: 'foot', area: 'leg', label: 'Voet', sided: true, views: [side(M('dorsal', 'Dorsaal')), side(M('plantar', 'Plantair')), side(M('medial', 'Mediaal')), side(M('lateral', 'Lateraal'))] },
  // Perifere zenuw — views of the segment + repeatable function shots
  { id: 'nerve-plexus', area: 'nerve', label: 'Plexus & schouder', sided: true, views: [P('ap', 'AP'), P('pa', 'PA', 180), P('abduction-front', 'Abductie voor'), side(M('function', 'Functie'))] },
  { id: 'nerve-arm', area: 'nerve', label: 'Zenuw arm', sided: true, views: [side(M('volar', 'Volair')), side(M('dorsal', 'Dorsaal')), side(M('function', 'Functie'))] },
  { id: 'nerve-hand', area: 'nerve', label: 'Zenuw onderarm & hand', sided: true, views: [side(M('dorsal', 'Dorsaal')), side(M('palmar', 'Palmair')), side(M('fist', 'Vuist')), side(M('extension', 'Extensie')), side(M('function', 'Functie'))] },
  { id: 'nerve-leg', area: 'nerve', label: 'Zenuw been', sided: true, views: [P('anterior', 'Anterieur'), P('posterior', 'Posterieur', 180), side(M('medial', 'Mediaal')), side(M('lateral', 'Lateraal')), side(M('function', 'Functie'))] },
  { id: 'nerve-foot', area: 'nerve', label: 'Zenuw voet', sided: true, views: [side(M('dorsal', 'Dorsaal')), side(M('plantar', 'Plantair')), side(M('function', 'Functie'))] },
  // Huid (spot)
  { id: 'scar', area: 'skin', label: 'Litteken', sided: false, spot: true, views: SKIN_VIEWS },
  { id: 'lesion', area: 'skin', label: 'Letsel', sided: false, spot: true, views: SKIN_VIEWS },
  { id: 'wound', area: 'skin', label: 'Wonde', sided: false, spot: true, views: SKIN_VIEWS },
  { id: 'burn', area: 'skin', label: 'Brandwonde', sided: false, spot: true, views: SKIN_VIEWS },
  // Overig
  { id: 'free', area: 'other', label: 'Vrij', sided: false, views: [M('free', 'Vrij')] },
];

export interface ProcedureDef {
  id: string;
  label: string;
  /** Sub-areas the procedure documents. Empty = choose on the body map. */
  subs: string[];
  /** Default side for sided sub-areas (e.g. brachioplasty → both). Otherwise the side is asked. */
  defaultSide?: Side;
}

export const PROCEDURES: ProcedureDef[] = [
  // Gelaat
  { id: 'facelift', label: 'Facelift', subs: ['face'] },
  { id: 'necklift', label: 'Necklift', subs: ['neck'] },
  { id: 'blepharoplasty-upper', label: 'Blefaroplastie boven', subs: ['eyelids'] },
  { id: 'blepharoplasty-lower', label: 'Blefaroplastie onder', subs: ['eyelids'] },
  { id: 'rhinoplasty', label: 'Rhinoplastie', subs: ['nose'] },
  { id: 'otoplasty', label: 'Otoplastie', subs: ['ears'], defaultSide: 'both' },
  { id: 'brow-lift', label: 'Browlift', subs: ['face'] },
  { id: 'facial-palsy-reconstruction', label: 'Facialisreconstructie', subs: ['palsy'] },
  { id: 'fat-grafting-face', label: 'Lipofilling gelaat', subs: ['face'] },
  // Borst
  { id: 'breast-augmentation', label: 'Borstvergroting', subs: ['breasts'] },
  { id: 'mastopexy', label: 'Mastopexie', subs: ['breasts'] },
  { id: 'augmentation-mastopexy', label: 'Augmentatie-mastopexie', subs: ['breasts'] },
  { id: 'breast-reduction', label: 'Borstverkleining', subs: ['breasts'] },
  { id: 'breast-reconstruction-implant', label: 'Borstreconstructie (implantaat)', subs: ['breasts'] },
  { id: 'breast-reconstruction-diep', label: 'Borstreconstructie (DIEP)', subs: ['breasts', 'abdomen'] },
  { id: 'explantation', label: 'Explantatie', subs: ['breasts'] },
  { id: 'gynaecomastia', label: 'Gynaecomastie', subs: ['breasts'] },
  // Romp, billen, genitaal
  { id: 'abdominoplasty', label: 'Abdominoplastie', subs: ['abdomen'] },
  { id: 'liposuction', label: 'Liposuctie', subs: ['abdomen', 'flanks'] },
  { id: 'body-lift', label: 'Bodylift', subs: ['abdomen', 'flanks', 'buttocks'] },
  { id: 'gluteal-fat-grafting', label: 'Lipofilling billen', subs: ['buttocks'] },
  { id: 'labiaplasty', label: 'Labiaplastie', subs: ['genital'] },
  // Ledematen
  { id: 'brachioplasty', label: 'Brachioplastie', subs: ['upperarm'], defaultSide: 'both' },
  { id: 'thigh-lift', label: 'Dijlift', subs: ['thigh'], defaultSide: 'both' },
  { id: 'carpal-tunnel', label: 'Carpale tunnel', subs: ['hand'] },
  { id: 'dupuytren', label: 'Dupuytren', subs: ['hand'] },
  { id: 'tendon-repair', label: 'Peesherstel', subs: ['hand'] },
  // Zenuw — segment chosen on the body map
  { id: 'nerve-transfer', label: 'Zenuwtransfer', subs: [] },
  { id: 'rpni', label: 'RPNI', subs: [] },
  { id: 'neuroma-excision', label: 'Neuroomexcisie', subs: [] },
  // Huid
  { id: 'scar-revision', label: 'Littekencorrectie', subs: ['scar'] },
  { id: 'skin-lesion', label: 'Huidletsel', subs: ['lesion'] },
  { id: 'burn-reconstruction', label: 'Brandwondreconstructie', subs: ['burn'] },
];

export function subById(id: string): SubAreaDef | undefined {
  return SUBAREAS.find((s) => s.id === id);
}

export function procedureById(id: string): ProcedureDef | undefined {
  return PROCEDURES.find((p) => p.id === id);
}

/** Area a procedure belongs to, for grouping labels in the picker. */
export function procedureArea(p: ProcedureDef): AreaId {
  return (p.subs[0] && subById(p.subs[0])?.area) || 'nerve';
}

// ---------- view keys and sequences ----------

export const FREE_KEY: ViewId = 'free';

export function viewKey(sub: string, viewId: string, s?: 'L' | 'R'): ViewId {
  return s ? `${sub}:${viewId}:${s}` : `${sub}:${viewId}`;
}

export function parseViewKey(key: ViewId): { sub: string; viewId: string; side?: 'L' | 'R' } {
  if (key === FREE_KEY) return { sub: 'free', viewId: 'free' };
  const [sub, viewId, s] = key.split(':');
  return { sub, viewId: viewId ?? '', side: s === 'L' || s === 'R' ? s : undefined };
}

export const sideWord = (s: Side | undefined) => (s === 'L' ? 'links' : s === 'R' ? 'rechts' : s === 'both' ? 'beide' : '');

export interface ViewStep {
  key: ViewId;
  sub: string;
  view: ViewDef;
  side?: 'L' | 'R';
  /** e.g. "Mediaal rechts". */
  label: string;
  detect: DetectMode;
}

/** Per-sub-area edits from the view-set editor (stored in the photo folder). */
export type ViewSetOverrides = Record<string, { hidden?: string[]; order?: string[]; custom?: { id: string; label: string }[] }>;

/** The effective views of a sub-area after the user's edits. */
export function effectiveViews(sub: SubAreaDef, overrides: ViewSetOverrides = {}): ViewDef[] {
  const o = overrides[sub.id];
  if (!o) return sub.views;
  const custom = (o.custom ?? []).map((c) => M(c.id, c.label, { custom: true }));
  let views = [...sub.views, ...custom].filter((v) => !(o.hidden ?? []).includes(v.id));
  if (o.order?.length) {
    const rank = (id: string) => {
      const i = o.order!.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    views = views.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v.id) - rank(b.v.id) || a.i - b.i).map((x) => x.v);
  }
  return views;
}

export interface EditableView {
  view: ViewDef;
  hidden: boolean;
}

/** All views of a sub-area in the current order, hidden ones included (editor list). */
export function editableViews(sub: SubAreaDef, overrides: ViewSetOverrides = {}): EditableView[] {
  const o = overrides[sub.id] ?? {};
  const visible = effectiveViews(sub, { [sub.id]: { ...o, hidden: [] } });
  return visible.map((view) => ({ view, hidden: (o.hidden ?? []).includes(view.id) }));
}

type Override = ViewSetOverrides[string];

export function toggleViewHidden(sub: SubAreaDef, overrides: ViewSetOverrides, viewId: string): Override {
  const o = overrides[sub.id] ?? {};
  const hidden = o.hidden ?? [];
  return { ...o, hidden: hidden.includes(viewId) ? hidden.filter((x) => x !== viewId) : [...hidden, viewId] };
}

export function moveView(sub: SubAreaDef, overrides: ViewSetOverrides, viewId: string, dir: -1 | 1): Override {
  const o = overrides[sub.id] ?? {};
  const ids = editableViews(sub, overrides).map((e) => e.view.id);
  const i = ids.indexOf(viewId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return o;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return { ...o, order: ids };
}

export function addCustomView(sub: SubAreaDef, overrides: ViewSetOverrides, label: string): Override {
  const o = overrides[sub.id] ?? {};
  const base = `c-${slug(label) || 'zicht'}`;
  const taken = new Set([...sub.views.map((v) => v.id), ...(o.custom ?? []).map((c) => c.id)]);
  let id = base;
  for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
  return { ...o, custom: [...(o.custom ?? []), { id, label: label.trim() }] };
}

function stepFor(sub: SubAreaDef, view: ViewDef, s?: 'L' | 'R'): ViewStep {
  return { key: viewKey(sub.id, view.id, s), sub: sub.id, view, side: s, label: s ? `${view.label} ${sideWord(s)}` : view.label, detect: view.detect };
}

const FREE_STEP: ViewStep = { key: FREE_KEY, sub: 'free', view: M('free', 'Vrij'), label: 'Vrij', detect: 'manual' };

/**
 * The views to walk through: area by area, in selection order. Views shot per
 * side are expanded for "both" (L then R). Intra-op is free mode only.
 * Duplicate keys (same sub-area chosen twice) are dropped.
 */
export function viewSequence(areas: AreaSelection[], visit: VisitType | string, overrides: ViewSetOverrides = {}): ViewStep[] {
  if (visit === 'intraop') return [FREE_STEP];
  const out: ViewStep[] = [];
  const seen = new Set<string>();
  for (const sel of areas) {
    const sub = subById(sel.sub);
    if (!sub) continue;
    for (const view of effectiveViews(sub, overrides)) {
      const sides: ('L' | 'R' | undefined)[] =
        sub.sided && view.perSide ? (sel.side === 'L' ? ['L'] : sel.side === 'R' ? ['R'] : ['L', 'R']) : [undefined];
      for (const s of sides) {
        const step = stepFor(sub, view, s);
        if (!seen.has(step.key)) {
          seen.add(step.key);
          out.push(step);
        }
      }
    }
  }
  return out.length ? out : [FREE_STEP];
}

/** Any key, also from older sessions or hidden views, resolves to a step (unknown → manual). */
export function stepForKey(key: ViewId, overrides: ViewSetOverrides = {}): ViewStep {
  if (key === FREE_KEY) return FREE_STEP;
  const { sub: subId, viewId, side: s } = parseViewKey(key);
  const sub = subById(subId);
  const view =
    (sub && [...sub.views, ...effectiveViews(sub, overrides)].find((v) => v.id === viewId)) ??
    M(viewId || key, viewId || key);
  return sub ? stepFor(sub, view, s) : { key, sub: subId, view, side: s, label: view.label, detect: view.detect };
}

// ---------- selections ----------

export function selectionsForProcedure(p: ProcedureDef): AreaSelection[] {
  return p.subs.map((id) => (subById(id)?.sided && p.defaultSide ? { sub: id, side: p.defaultSide } : { sub: id }));
}

export function needsSide(sel: AreaSelection): boolean {
  return !!subById(sel.sub)?.sided && !sel.side;
}

export function needsSpot(sel: AreaSelection): boolean {
  return !!subById(sel.sub)?.spot && !sel.spot;
}

/** "Dij links", "Borsten", "Litteken · linker onderarm, voorzijde". */
export function selectionLabel(sel: AreaSelection): string {
  const sub = subById(sel.sub);
  const base = sub?.label ?? sel.sub;
  if (sel.spot) return `${base} · ${sel.spot.label}`;
  return sel.side ? `${base} ${sideWord(sel.side)}` : base;
}

export function areasLabel(areas: AreaSelection[]): string {
  return areas.map(selectionLabel).join(' + ') || 'Geen gebied';
}

const slug = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Folder slug before a procedure is known: "oogleden", "dij-L", "borsten+buik", "litteken-onderarm-L". */
export function areasSlug(areas: AreaSelection[]): string {
  const parts = areas.map((sel) => {
    const sub = subById(sel.sub);
    const name = slug(sub?.label.split(/[ /&]/)[0] ?? sel.sub);
    const sideSuffix = sel.side === 'L' ? '-L' : sel.side === 'R' ? '-R' : sel.side === 'both' ? '-LR' : '';
    if (sel.spot) {
      const zone = slug(sel.spot.label.replace(/^(linker|rechter)\s+/i, '').split(',')[0]);
      const s = /^linker/i.test(sel.spot.label) ? '-L' : /^rechter/i.test(sel.spot.label) ? '-R' : '';
      return `${name}-${zone}${s}`;
    }
    return `${name}${sideSuffix}`;
  });
  const shown = parts.slice(0, 3).join('+');
  return parts.length > 3 ? `${shown}+${parts.length - 3}` : shown || 'vrij';
}

// ---------- legacy (five regions, before the anatomy build) ----------

export function areasFromLegacyRegion(region: string): AreaSelection[] {
  switch (region) {
    case 'face':
      return [{ sub: 'face' }];
    case 'breast':
      return [{ sub: 'breasts' }];
    case 'body':
      return [{ sub: 'abdomen' }];
    case 'hand':
      return [{ sub: 'hand', side: 'both' }];
    default:
      return [{ sub: 'free' }];
  }
}

/** Old view ids → new keys, per legacy region. */
export function legacyViewKey(region: string, id: string): ViewId {
  if (id.includes(':') || id === FREE_KEY) return id;
  const face: Record<string, string> = { frontal: 'face:frontal', 'frontal-smile': 'face:frontal-smile', 'oblique-L': 'face:oblique-L', 'oblique-R': 'face:oblique-R', 'lateral-L': 'face:lateral-L', 'lateral-R': 'face:lateral-R', basal: 'nose:basal' };
  const body = (sub: string): Record<string, string> => ({ AP: `${sub}:ap`, 'AP-arms-up': `${sub}:ap-arms-up`, PA: `${sub}:pa`, 'body-oblique-L': `${sub}:oblique-L`, 'body-oblique-R': `${sub}:oblique-R`, 'body-lateral-L': `${sub}:lateral-L`, 'body-lateral-R': `${sub}:lateral-R` });
  const hand: Record<string, string> = { dorsal: 'hand:dorsal', volar: 'hand:palmar', 'hand-lateral': 'hand:lateral', fist: 'hand:fist', extension: 'hand:extension' };
  const table = region === 'face' ? face : region === 'breast' ? body('breasts') : region === 'body' ? body('abdomen') : region === 'hand' ? hand : {};
  return table[id] ?? id;
}
