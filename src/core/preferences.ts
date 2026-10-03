/**
 * Per-user preferences that travel with the archive (stored in the photo
 * folder under `.medical-photos/`, so a new phone or the tablet sees them).
 * Not patient data. Hidden folder: the index rebuild skips names starting
 * with '.', so it is never mistaken for a patient.
 */
import { utf8Decode, utf8Encode } from './bytes';
import { MIME, type Path, type StorageTarget } from './storage/StorageTarget';
import { PROCEDURES, type ProcedureDef, type ViewSetOverrides } from './catalog/catalog';

export const PREFERENCES_PATH: Path = ['.medical-photos', 'preferences.json'];
/** Edited view sets per sub-area (anatomy plan A6), shared with the tablet. */
export const VIEWS_PATH: Path = ['.medical-photos', 'views.json'];

export interface Preferences {
  /** Starred procedure ids, in the order they were starred. */
  favouriteProcedures: string[];
  /** Starred sub-area ids (body map, see anatomy plan). */
  favouriteAreas: string[];
}

export const EMPTY_PREFERENCES: Preferences = { favouriteProcedures: [], favouriteAreas: [] };

export async function loadPreferences(storage: StorageTarget): Promise<Preferences> {
  try {
    const b = await storage.readBytes(PREFERENCES_PATH);
    if (!b) return { ...EMPTY_PREFERENCES };
    const raw = JSON.parse(utf8Decode(b)) as Partial<Preferences>;
    return {
      favouriteProcedures: Array.isArray(raw.favouriteProcedures) ? raw.favouriteProcedures.filter((x) => typeof x === 'string') : [],
      favouriteAreas: Array.isArray(raw.favouriteAreas) ? raw.favouriteAreas.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    return { ...EMPTY_PREFERENCES };
  }
}

export async function savePreferences(storage: StorageTarget, prefs: Preferences): Promise<void> {
  await storage.ensureDir(PREFERENCES_PATH.slice(0, -1));
  await storage.writeBytes(PREFERENCES_PATH, utf8Encode(JSON.stringify(prefs, null, 2)), MIME.json);
}

export async function loadViewOverrides(storage: StorageTarget): Promise<ViewSetOverrides> {
  try {
    const b = await storage.readBytes(VIEWS_PATH);
    if (!b) return {};
    const raw = JSON.parse(utf8Decode(b)) as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as ViewSetOverrides) : {};
  } catch {
    return {};
  }
}

export async function saveViewOverrides(storage: StorageTarget, overrides: ViewSetOverrides): Promise<void> {
  await storage.ensureDir(VIEWS_PATH.slice(0, -1));
  await storage.writeBytes(VIEWS_PATH, utf8Encode(JSON.stringify(overrides, null, 2)), MIME.json);
}

/** Add or remove one id; starring appends, so favourites keep the order you starred them in. */
export function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export interface PickerSection<T> {
  key: 'starred' | 'frequent' | 'all';
  title: string;
  items: T[];
}

/**
 * The procedure picker: ★ favourites first (your order), then the ones you
 * use most that are not starred, then everything else (procedures for the
 * treatment's areas first, then catalogue order). A search query filters all
 * three sections and keeps the same order. Empty sections are dropped.
 * `onlySubs` limits the list to procedures for those areas (procedures that
 * choose their area on the body map stay available).
 */
export function procedureSections(opts: {
  starred: string[];
  frequent: string[];
  query?: string;
  subs?: string[];
  onlySubs?: boolean;
  frequentLimit?: number;
}): PickerSection<ProcedureDef>[] {
  const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = fold(opts.query ?? '');
  const subs = opts.subs ?? [];
  const relevant = (p: ProcedureDef) => p.subs.length === 0 || p.subs.some((s) => subs.includes(s));
  const matches = (p: ProcedureDef) =>
    (!opts.onlySubs || subs.length === 0 || relevant(p)) && (!q || fold(p.label).includes(q) || p.id.includes(q));
  const byId = (id: string) => PROCEDURES.find((p) => p.id === id);

  const starred = opts.starred.map(byId).filter((p): p is ProcedureDef => !!p && matches(p));
  const taken = new Set(starred.map((p) => p.id));
  const frequent = opts.frequent
    .filter((id) => !taken.has(id))
    .slice(0, opts.frequentLimit ?? 5)
    .map(byId)
    .filter((p): p is ProcedureDef => !!p && matches(p));
  for (const p of frequent) taken.add(p.id);
  const rest = PROCEDURES.filter((p) => !taken.has(p.id) && matches(p));
  const first = (p: ProcedureDef) => subs.length > 0 && p.subs.some((s) => subs.includes(s));
  const all = [...rest.filter(first), ...rest.filter((p) => !first(p))];

  const sections: PickerSection<ProcedureDef>[] = [
    { key: 'starred', title: '★ Favorieten', items: starred },
    { key: 'frequent', title: 'Vaak gebruikt', items: frequent },
    { key: 'all', title: starred.length || frequent.length ? 'Alle ingrepen' : 'Ingrepen', items: all },
  ];
  return sections.filter((s) => s.items.length > 0);
}
