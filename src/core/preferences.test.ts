import { describe, expect, it } from 'vitest';
import { PREFERENCES_PATH, loadPreferences, procedureSections, toggle } from './preferences';
import { Archive } from './archive';
import { MemoryTarget } from './storage/MemoryTarget';
import { Outbox } from './storage/Outbox';
import { rebuildIndex } from './index/rebuild';
import { utf8Encode } from './bytes';

const ids = (sections: ReturnType<typeof procedureSections>) => sections.map((s) => [s.key, s.items.map((p) => p.id)] as const);
const deps = (storage: MemoryTarget | Outbox) => ({ storage, operator: 'JP', device: 'x', now: () => new Date('2026-10-03T09:00:00Z') });

describe('favourites', () => {
  it('toggle appends and removes, keeping star order', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('starred first in your order, then frequent (not starred), then the rest with the region first', () => {
    const s = procedureSections({ starred: ['mastopexy', 'facelift'], frequent: ['facelift', 'abdominoplasty', 'rhinoplasty'], region: 'breast' });
    const [starred, frequent, all] = ids(s);
    expect(starred).toEqual(['starred', ['mastopexy', 'facelift']]);
    expect(frequent).toEqual(['frequent', ['abdominoplasty', 'rhinoplasty']]);
    expect(all[0]).toBe('all');
    expect(all[1][0]).toBe('breast-augmentation'); // region first, starred ones not repeated
    expect(all[1]).not.toContain('mastopexy');
    expect(all[1]).not.toContain('abdominoplasty');
  });

  it('search filters every section and keeps stars on top', () => {
    const s = procedureSections({ starred: ['blepharoplasty-lower'], frequent: [], query: 'blef' });
    expect(ids(s)).toEqual([
      ['starred', ['blepharoplasty-lower']],
      ['all', ['blepharoplasty-upper']],
    ]);
  });

  it('can limit to one region (inline picker on the visit screen)', () => {
    const s = procedureSections({ starred: ['facelift', 'mastopexy'], frequent: [], region: 'breast', onlyRegion: true });
    expect(s[0].items.map((p) => p.id)).toEqual(['mastopexy']);
    expect(s.flatMap((x) => x.items).every((p) => p.region === 'breast')).toBe(true);
  });

  it('ignores unknown ids and drops empty sections', () => {
    expect(ids(procedureSections({ starred: ['gone'], frequent: [] })).map(([k]) => k)).toEqual(['all']);
  });

  it('are stored in the folder, survive a reopen, and are never mistaken for a patient', async () => {
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(remote));
    expect(await a.toggleFavouriteProcedure('mastopexy')).toBe(true);
    await a.toggleFavouriteProcedure('facelift');
    await a.toggleFavouriteArea('arm.hand');
    expect(await a.toggleFavouriteProcedure('mastopexy')).toBe(false);
    expect(remote.dump()).toEqual(['.medical-photos/preferences.json']);

    const tablet = await Archive.open(deps(remote));
    expect(tablet.preferences).toEqual({ favouriteProcedures: ['facelift'], favouriteAreas: ['arm.hand'] });
    expect((await rebuildIndex(remote)).problems).toEqual([]);
  });

  it('work offline through the outbox', async () => {
    const local = new MemoryTarget();
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(new Outbox(local, remote)));
    await a.toggleFavouriteProcedure('rhinoplasty');
    const reopened = await Archive.open(deps(new Outbox(local, remote)));
    expect(reopened.preferences.favouriteProcedures).toEqual(['rhinoplasty']);
  });

  it('a damaged preferences file falls back to empty', async () => {
    const remote = new MemoryTarget();
    await remote.ensureDir(['.medical-photos']);
    await remote.writeBytes(PREFERENCES_PATH, utf8Encode('{not json'));
    expect(await loadPreferences(remote)).toEqual({ favouriteProcedures: [], favouriteAreas: [] });
  });
});
