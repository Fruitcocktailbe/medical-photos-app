/**
 * Procedure catalogue and view sets (PRD §6). Bundled data; the settings
 * screen will let Jeroen add procedures and edit view sets (stored as an
 * override file in the root folder, so the tablet sees the same catalogue).
 *
 * Textbook geometry per view is the FIRST-VISIT target. On every follow-up the
 * target becomes the geometry recorded with the reference (pre-op) photo of
 * that view — see guidance/targets.ts.
 */
import type { Region, ViewId } from '../types';

export type DetectMode = 'face' | 'pose' | 'manual';

export interface ViewDef {
  id: ViewId;
  /** Dutch UI label. */
  label: string;
  /** Textbook patient yaw in degrees (+ = patient's left side to camera). */
  yaw: number;
  pitch?: number;
  detect: DetectMode;
}

export interface ProcedureDef {
  id: string;
  label: string;
  region: Region;
  /** Replaces the region's default view set when present. */
  views?: ViewId[];
  /** Added to the region's default view set. */
  extraViews?: ViewId[];
}

export const VIEWS: Record<ViewId, ViewDef> = {
  // Face — detected from head pose.
  frontal: { id: 'frontal', label: 'Frontaal (rust)', yaw: 0, detect: 'face' },
  'frontal-smile': { id: 'frontal-smile', label: 'Frontaal (glimlach)', yaw: 0, detect: 'face' },
  'oblique-L': { id: 'oblique-L', label: '¾ links', yaw: 45, detect: 'face' },
  'oblique-R': { id: 'oblique-R', label: '¾ rechts', yaw: -45, detect: 'face' },
  'lateral-L': { id: 'lateral-L', label: 'Profiel links', yaw: 90, detect: 'face' },
  'lateral-R': { id: 'lateral-R', label: 'Profiel rechts', yaw: -90, detect: 'face' },
  basal: { id: 'basal', label: 'Basaal (neus)', yaw: 0, pitch: 45, detect: 'manual' },
  // Breast / body — detected from body pose.
  AP: { id: 'AP', label: 'AP (armen langs)', yaw: 0, detect: 'pose' },
  'AP-arms-up': { id: 'AP-arms-up', label: 'AP (armen omhoog)', yaw: 0, detect: 'pose' },
  'body-oblique-L': { id: 'body-oblique-L', label: 'Schuin links', yaw: 45, detect: 'pose' },
  'body-oblique-R': { id: 'body-oblique-R', label: 'Schuin rechts', yaw: -45, detect: 'pose' },
  'body-lateral-L': { id: 'body-lateral-L', label: 'Lateraal links', yaw: 90, detect: 'pose' },
  'body-lateral-R': { id: 'body-lateral-R', label: 'Lateraal rechts', yaw: -90, detect: 'pose' },
  PA: { id: 'PA', label: 'PA (rug)', yaw: 180, detect: 'pose' },
  // Hand — manual tag in v1.
  dorsal: { id: 'dorsal', label: 'Dorsaal', yaw: 0, detect: 'manual' },
  volar: { id: 'volar', label: 'Volair', yaw: 0, detect: 'manual' },
  'hand-lateral': { id: 'hand-lateral', label: 'Lateraal', yaw: 0, detect: 'manual' },
  fist: { id: 'fist', label: 'Vuist', yaw: 0, detect: 'manual' },
  extension: { id: 'extension', label: 'Extensie', yaw: 0, detect: 'manual' },
  // Anything outside the set, intra-op photos, and regions without a set.
  free: { id: 'free', label: 'Vrij', yaw: 0, detect: 'manual' },
};

export const REGION_VIEWS: Record<Region, ViewId[]> = {
  face: ['frontal', 'frontal-smile', 'oblique-L', 'oblique-R', 'lateral-L', 'lateral-R'],
  breast: ['AP', 'AP-arms-up', 'body-oblique-L', 'body-oblique-R', 'body-lateral-L', 'body-lateral-R'],
  body: ['AP', 'PA', 'body-lateral-L', 'body-lateral-R', 'body-oblique-L', 'body-oblique-R'],
  hand: ['dorsal', 'volar', 'hand-lateral', 'fist', 'extension'],
  other: ['free'],
};

export const REGION_LABELS: Record<Region, string> = {
  face: 'Gelaat',
  breast: 'Borst',
  body: 'Lichaam',
  hand: 'Hand / zenuw',
  other: 'Andere',
};

export const PROCEDURES: ProcedureDef[] = [
  // Face
  { id: 'facelift', label: 'Facelift', region: 'face' },
  { id: 'necklift', label: 'Necklift', region: 'face' },
  { id: 'blepharoplasty-upper', label: 'Blefaroplastie boven', region: 'face' },
  { id: 'blepharoplasty-lower', label: 'Blefaroplastie onder', region: 'face' },
  { id: 'rhinoplasty', label: 'Rhinoplastie', region: 'face', extraViews: ['basal'] },
  { id: 'otoplasty', label: 'Otoplastie', region: 'face' },
  { id: 'brow-lift', label: 'Browlift', region: 'face' },
  { id: 'facial-palsy-reconstruction', label: 'Facialisreconstructie', region: 'face' },
  { id: 'fat-grafting-face', label: 'Lipofilling gelaat', region: 'face' },
  // Breast
  { id: 'breast-augmentation', label: 'Borstvergroting', region: 'breast' },
  { id: 'mastopexy', label: 'Mastopexie', region: 'breast' },
  { id: 'augmentation-mastopexy', label: 'Augmentatie-mastopexie', region: 'breast' },
  { id: 'breast-reduction', label: 'Borstverkleining', region: 'breast' },
  { id: 'breast-reconstruction-implant', label: 'Borstreconstructie (implantaat)', region: 'breast' },
  { id: 'breast-reconstruction-diep', label: 'Borstreconstructie (DIEP)', region: 'breast' },
  { id: 'explantation', label: 'Explantatie', region: 'breast' },
  { id: 'gynaecomastia', label: 'Gynaecomastie', region: 'breast' },
  // Body
  { id: 'abdominoplasty', label: 'Abdominoplastie', region: 'body' },
  { id: 'liposuction', label: 'Liposuctie', region: 'body' },
  { id: 'brachioplasty', label: 'Brachioplastie', region: 'body' },
  { id: 'thigh-lift', label: 'Dijlift', region: 'body' },
  { id: 'body-lift', label: 'Bodylift', region: 'body' },
  { id: 'gluteal-fat-grafting', label: 'Lipofilling billen', region: 'body' },
  // Hand / nerve
  { id: 'carpal-tunnel', label: 'Carpale tunnel', region: 'hand' },
  { id: 'dupuytren', label: 'Dupuytren', region: 'hand' },
  { id: 'nerve-transfer', label: 'Zenuwtransfer', region: 'hand' },
  { id: 'rpni', label: 'RPNI', region: 'hand' },
  { id: 'tendon-repair', label: 'Peesherstel', region: 'hand' },
  // Other
  { id: 'scar-revision', label: 'Littekencorrectie', region: 'other' },
  { id: 'skin-lesion', label: 'Huidletsel', region: 'other' },
];

export function procedureById(id: string): ProcedureDef | undefined {
  return PROCEDURES.find((p) => p.id === id);
}

/** The view set for a session: region default, overridden or extended by the procedure. */
export function viewSet(region: Region, procedureId: string | null): ViewId[] {
  const proc = procedureId ? procedureById(procedureId) : undefined;
  if (proc?.views) return proc.views;
  const base = REGION_VIEWS[proc?.region ?? region];
  return proc?.extraViews ? [...base, ...proc.extraViews.filter((v) => !base.includes(v))] : base;
}

/** Views to walk through in a session: intra-op is free mode only (PRD Q21). */
export function viewSetForVisit(region: Region, procedureId: string | null, visit: string): ViewId[] {
  return visit === 'intraop' ? ['free'] : viewSet(region, procedureId);
}

/** Procedures for a picker: favourites first, then the region's, then the rest. */
export function procedurePickerOrder(region: Region | null, favourites: string[] = []): ProcedureDef[] {
  const fav = favourites.map(procedureById).filter((p): p is ProcedureDef => !!p);
  const rest = PROCEDURES.filter((p) => !favourites.includes(p.id));
  const inRegion = rest.filter((p) => p.region === region);
  const others = rest.filter((p) => p.region !== region);
  return [...fav, ...inRegion, ...others];
}
