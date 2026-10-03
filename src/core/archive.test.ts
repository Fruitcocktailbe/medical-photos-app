import { beforeEach, describe, expect, it } from 'vitest';
import { Archive, levenshtein, uniqueName } from './archive';
import { MemoryTarget } from './storage/MemoryTarget';
import { Outbox } from './storage/Outbox';
import { readXmp, parseXmp } from './metadata/xmp';
import { resolveTarget } from './guidance/targets';
import { episodesPerProcedure, findCases, rebuildIndex } from './index/rebuild';
import type { CaptureGeometry } from './types';

function jpeg(tag: number): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 3, 1, tag, 0xff, 0xd9]);
}
const geo = (yaw: number): CaptureGeometry => ({ yaw, pitch: 0, roll: 0.5, distance: 0.52, centerX: 0.01, centerY: 0.02, phonePitch: 1, phoneRoll: 0, source: 'pose' });

let clock: Date;
let n: number;
const deps = (storage: MemoryTarget | Outbox) => ({
  storage, operator: 'JP', device: 'Pixel', now: () => clock, idGen: () => String(++n),
});

beforeEach(() => {
  clock = new Date('2026-10-03T09:00:00Z');
  n = 0;
});

describe('Archive — full episode', () => {
  it('pre-op without procedure → surgery sets it → backfill → follow-up matches pre-op', async () => {
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(remote));

    const p = await a.createPatient({ surname: 'Janssens', firstName: 'Marie', dob: '1985-03-12', patientNumber: '2001234567' });
    const ep = await a.startEpisode(p.id, [{ sub: 'breasts' }]);
    expect(ep.folderName).toBe('2026-10_borsten');
    const pre = await a.startSession(ep.id, 'preop');
    const s1 = await a.fileShot(pre.id, { bytes: jpeg(1), view: 'breasts:ap', viewSource: 'auto', geometry: geo(1) });
    await a.fileShot(pre.id, { bytes: jpeg(2), view: 'breasts:lateral-L', viewSource: 'auto', geometry: geo(87) });
    await a.fileShot(pre.id, { bytes: jpeg(3), view: 'breasts:lateral-L', viewSource: 'manual', geometry: geo(91) });
    expect(s1.file).toBe('20261003_preop_breasts-ap_01.jpg');

    // Pre-op photos know the area, not yet the procedure.
    const before = parseXmp(readXmp((await remote.readBytes(['Janssens_Marie_1985-03-12', '2026-10_borsten', '2026-10-03_preop', s1.file]))!)!);
    expect(before.procedure).toBeNull();
    expect(before.subjects).toContain('area:breasts');

    // Surgery: set the procedure once.
    clock = new Date('2026-10-20T08:00:00Z');
    const { retagged } = await a.setProcedure(ep.id, 'breast-augmentation', { surgeryDate: '2026-10-20' });
    expect(retagged).toBe(3);
    expect(a.episode(ep.id).folderName).toBe('2026-10_breast-augmentation');
    expect(remote.dump()).toEqual([
      'Janssens_Marie_1985-03-12/2026-10_breast-augmentation/2026-10-03_preop/20261003_preop_breasts-ap_01.jpg',
      'Janssens_Marie_1985-03-12/2026-10_breast-augmentation/2026-10-03_preop/20261003_preop_breasts-lateral-L_01.jpg',
      'Janssens_Marie_1985-03-12/2026-10_breast-augmentation/2026-10-03_preop/20261003_preop_breasts-lateral-L_02.jpg',
      'Janssens_Marie_1985-03-12/2026-10_breast-augmentation/2026-10-03_preop/session.json',
      'Janssens_Marie_1985-03-12/2026-10_breast-augmentation/episode.json',
      'Janssens_Marie_1985-03-12/patient.json',
    ]);
    const after = parseXmp(readXmp((await remote.readBytes(['Janssens_Marie_1985-03-12', '2026-10_breast-augmentation', '2026-10-03_preop', s1.file]))!)!);
    expect(after.procedure).toBe('breast-augmentation');
    expect(after.subjects).toContain('procedure:breast-augmentation');

    // Follow-up at 6 weeks: the target is the pre-op geometry (last lateral shot = 91°).
    clock = new Date('2026-11-14T10:00:00Z');
    const post = await a.startSession(ep.id, 'postop', { interval: '6w' });
    expect(post.folderName).toBe('2026-11-14_postop-6w');
    const t = resolveTarget('breasts:lateral-L', a.episode(ep.id), a.sessionsOf(ep.id), post);
    expect(t.source).toBe('reference');
    expect(t.geometry.yaw).toBe(91);

    // Surgeon picks the first lateral as the keeper → follow-ups now match 87°.
    await a.setReferenceShot(pre.id, '20261003_preop_breasts-lateral-L_01.jpg');
    expect(resolveTarget('breasts:lateral-L', a.episode(ep.id), a.sessionsOf(ep.id), post).geometry.yaw).toBe(87);
  });

  it('the tablet rebuilds the same registry from the folder alone', async () => {
    const remote = new MemoryTarget();
    const phone = await Archive.open(deps(remote));
    const p = await phone.createPatient({ surname: 'Peeters', firstName: 'Jan', dob: '1950-06-23' });
    const ep = await phone.startEpisode(p.id, [{ sub: 'face' }]);
    const s = await phone.startSession(ep.id, 'preop');
    await phone.fileShot(s.id, { bytes: jpeg(9), view: 'face:oblique-L', viewSource: 'auto', geometry: { ...geo(44), source: 'face' } });
    await phone.setNote(s.id, 'Ptosis wenkbrauw links');
    await phone.setProcedure(ep.id, 'facelift');

    const tablet = await Archive.open({ ...deps(remote), device: 'Tab' });
    expect(tablet.problems).toEqual([]);
    expect(tablet.registry).toEqual(phone.registry);
    const t = resolveTarget('face:oblique-L', tablet.episode(ep.id), tablet.sessionsOf(ep.id), { id: 'new', date: '2027-01-01' });
    expect(t.geometry.yaw).toBe(44);
  });
});

describe('Archive — offline outbox', () => {
  it('works offline, syncs in order, verifies, and cleans the local copy', async () => {
    const local = new MemoryTarget();
    const remote = new MemoryTarget();
    const box = new Outbox(local, remote);
    const a = await Archive.open(deps(box as never));

    const p = await a.createPatient({ surname: 'Maes', firstName: 'Els', dob: '1980-01-01' });
    const ep = await a.startEpisode(p.id, [{ sub: 'face' }]);
    const s = await a.startSession(ep.id, 'preop');
    await a.fileShot(s.id, { bytes: jpeg(5), view: 'face:frontal', viewSource: 'auto', geometry: { ...geo(0), source: 'face' } });
    await a.setProcedure(ep.id, 'blepharoplasty-upper');
    expect(remote.dump()).toEqual([]); // nothing reached the folder yet

    remote.failNext = 1; // provider offline
    const first = await box.drain();
    expect(first.error).toMatch(/simulated/);
    expect(first.remaining).toBeGreaterThan(0);

    const second = await box.drain();
    expect(second).toEqual({ done: expect.any(Number), remaining: 0 });
    expect(remote.dump()).toContain('Maes_Els_1980-01-01/2026-10_blepharoplasty-upper/2026-10-03_preop/20261003_preop_face-frontal_01.jpg');
    expect(parseXmp(readXmp((await remote.readBytes(['Maes_Els_1980-01-01', '2026-10_blepharoplasty-upper', '2026-10-03_preop', '20261003_preop_face-frontal_01.jpg']))!)!).procedure).toBe('blepharoplasty-upper');
    expect(local.dump()).toEqual(['.outbox/ops.json']); // blobs wiped after verified write
    expect(await box.pending()).toBe(0);

    const rebuilt = await rebuildIndex(remote);
    expect(rebuilt.registry.episodes[0].procedure).toBe('blepharoplasty-upper');
  });

  it('survives an app restart with pending work', async () => {
    const local = new MemoryTarget();
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(new Outbox(local, remote) as never));
    const p = await a.createPatient({ surname: 'Maes', firstName: 'Els', dob: '1980-01-01' });
    await a.startEpisode(p.id, [{ sub: 'hand', side: 'L' }]);
    const restarted = new Outbox(local, remote);
    expect(await restarted.pending()).toBeGreaterThan(0);
    expect((await restarted.drain()).remaining).toBe(0);
    expect(remote.dump()).toContain('Maes_Els_1980-01-01/2026-10_hand-L/episode.json');
  });
});

describe('Archive — patients, consent, annotations', () => {
  it('reuses the folder for the same name + DOB and flags look-alikes', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    const p1 = await a.createPatient({ surname: 'Janssens', firstName: 'Marie', dob: '1985-03-12' });
    const again = await a.createPatient({ surname: 'JANSSENS', firstName: 'Marie', dob: '1985-03-12', patientNumber: '42' });
    expect(again.id).toBe(p1.id);
    expect(again.patientNumber).toBe('42');
    expect(a.matchPatients({ surname: 'Janssen', firstName: 'Marie', dob: '1985-03-12' })[0].kind).toBe('probable-typo');
    expect(a.matchPatients({ surname: 'Janssens', firstName: 'Marie', dob: '1990-01-01' })[0].kind).toBe('same-name-other-dob');
  });

  it('keeps two people with the same name and DOB apart when patient numbers differ', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    await a.createPatient({ surname: 'Peeters', firstName: 'Jan', dob: '1950-01-01', patientNumber: '1' });
    const other = await a.createPatient({ surname: 'Peeters', firstName: 'Jan', dob: '1950-01-01', patientNumber: '2' });
    expect(other.folderName).toBe('Peeters_Jan_1950-01-01-2');
  });

  it('rejects incomplete identities', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    await expect(a.createPatient({ surname: '', firstName: 'X', dob: '1990-01-01' })).rejects.toThrow(/verplicht/);
    await expect(a.createPatient({ surname: 'A', firstName: 'B', dob: '12/03/1985' })).rejects.toThrow(/JJJJ/);
  });

  it('gates exports on the latest oral consent', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    expect(a.canExport(p.id, 'social')).toBe(false);
    await a.recordConsent(p.id, 'social', true);
    expect(a.canExport(p.id, 'social')).toBe(true);
    await a.recordConsent(p.id, 'social', false);
    expect(a.canExport(p.id, 'social')).toBe(false);
    expect(a.patient(p.id).consent.every((c) => c.mode === 'oral' && c.askedBy === 'JP')).toBe(true);
  });

  it('stores a drawn-on copy beside the untouched original', async () => {
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(remote));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    const ep = await a.startEpisode(p.id, [{ sub: 'face' }]);
    const s = await a.startSession(ep.id, 'consult');
    const shot = await a.fileShot(s.id, { bytes: jpeg(1), view: 'face:frontal', viewSource: 'manual' });
    const original = await remote.readBytes(['A_B_1990-01-01', '2026-10_gelaat', '2026-10-03_consult', shot.file]);
    const name = await a.addAnnotation(s.id, shot.file, jpeg(77));
    expect(name).toBe('20261003_consult_face-frontal_01.annot.jpg');
    expect(await remote.readBytes(['A_B_1990-01-01', '2026-10_gelaat', '2026-10-03_consult', shot.file])).toEqual(original);
    expect(a.session(s.id).shots[0].annotatedFile).toBe(name);
  });

  it('suffixes same-day sessions and same-month episodes', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    const e1 = await a.startEpisode(p.id, [{ sub: 'face' }]);
    const e2 = await a.startEpisode(p.id, [{ sub: 'face' }]);
    expect([e1.folderName, e2.folderName]).toEqual(['2026-10_gelaat', '2026-10_gelaat-2']);
    const s1 = await a.startSession(e1.id, 'preop');
    const s2 = await a.startSession(e1.id, 'preop');
    expect(s2.folderName).toBe(`${s1.folderName}-2`);
  });
});

describe('index and reporting', () => {
  it('reports missing files and unreadable sidecars', async () => {
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(remote));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    const ep = await a.startEpisode(p.id, [{ sub: 'face' }]);
    const s = await a.startSession(ep.id, 'preop');
    const shot = await a.fileShot(s.id, { bytes: jpeg(1), view: 'face:frontal', viewSource: 'auto' });
    await remote.remove(['A_B_1990-01-01', '2026-10_gelaat', '2026-10-03_preop', shot.file]);
    await remote.ensureDir(['Stray_Folder']);
    const { problems } = await rebuildIndex(remote);
    expect(problems).toEqual([
      'A_B_1990-01-01/2026-10_gelaat/2026-10-03_preop/20261003_preop_face-frontal_01.jpg: ontbreekt',
      'Stray_Folder: geen leesbare patient.json',
    ]);
  });

  it('finds cases by procedure and interval and counts episodes', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    const ep = await a.startEpisode(p.id, [{ sub: 'face' }]);
    await a.startSession(ep.id, 'preop');
    await a.setProcedure(ep.id, 'facelift');
    await a.startSession(ep.id, 'postop', { interval: '1y', date: '2027-10-01' });
    expect(findCases(a.registry, { procedure: 'facelift', interval: '1y' })).toHaveLength(1);
    expect(findCases(a.registry, { procedure: 'facelift', visit: 'preop' })).toHaveLength(1);
    expect(episodesPerProcedure(a.registry)).toEqual({ facelift: 1 });
  });
});

describe('helpers', () => {
  it('uniqueName and levenshtein', () => {
    expect(uniqueName('x', ['x', 'x-2'])).toBe('x-3');
    expect(levenshtein('janssens', 'janssen')).toBe(1);
  });
});

describe('Archive — UX flow operations', () => {
  it('starts a treatment already operated, with procedure and surgery date (U7)', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    const e = await a.startEpisode(p.id, [{ sub: 'breasts' }], undefined, { procedure: 'mastopexy', surgeryDate: '2026-08-20' });
    expect(e).toMatchObject({ procedure: 'mastopexy', surgeryDate: '2026-08-20', folderName: '2026-10_mastopexy' });
    await a.setSurgeryDate(e.id, '2026-08-21');
    expect(a.episode(e.id).surgeryDate).toBe('2026-08-21');
    await expect(a.setSurgeryDate(e.id, '21/08/2026')).rejects.toThrow(/JJJJ/);
  });

  it('deletes a shot so it can be retaken with the next index', async () => {
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(remote));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    const e = await a.startEpisode(p.id, [{ sub: 'face' }]);
    const s = await a.startSession(e.id, 'preop');
    const first = await a.fileShot(s.id, { bytes: jpeg(1), view: 'face:frontal', viewSource: 'auto' });
    await a.deleteShot(s.id, first.file);
    expect(a.session(s.id).shots).toEqual([]);
    expect(remote.dump().some((f) => f.endsWith(first.file))).toBe(false);
    const again = await a.fileShot(s.id, { bytes: jpeg(2), view: 'face:frontal', viewSource: 'auto' });
    expect(again.index).toBe(1);
  });

  it('removes the demo patient completely', async () => {
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(remote));
    const p = await a.createPatient({ surname: 'Demo', firstName: 'Proef', dob: '2000-01-01' });
    const e = await a.startEpisode(p.id, [{ sub: 'free' }]);
    await a.startSession(e.id, 'consult');
    await a.removePatient(p.id);
    expect(remote.dump()).toEqual([]);
    expect(a.registry).toEqual({ patients: [], episodes: [], sessions: [] });
  });
});

describe('Outbox — merged view while offline', () => {
  it('a restart with unsynced work still sees every patient, rename and retake', async () => {
    const local = new MemoryTarget();
    const remote = new MemoryTarget();
    // Day 1, online: a patient with a synced pre-op.
    const a1 = await Archive.open(deps(new Outbox(local, remote) as never));
    const p = await a1.createPatient({ surname: 'Janssens', firstName: 'Marie', dob: '1985-03-12' });
    const e = await a1.startEpisode(p.id, [{ sub: 'breasts' }]);
    const pre = await a1.startSession(e.id, 'preop');
    await a1.fileShot(pre.id, { bytes: jpeg(1), view: 'breasts:ap', viewSource: 'manual' });
    expect((await new Outbox(local, remote).drain()).remaining).toBe(0);

    // Day 2, cloud offline: surgery sets the procedure (rename pending), a new patient, a retake.
    remote.failNext = 0;
    const a2 = await Archive.open(deps(new Outbox(local, remote) as never));
    await a2.setProcedure(e.id, 'breast-augmentation');
    const q = await a2.createPatient({ surname: 'Peeters', firstName: 'Jan', dob: '1950-06-23' });
    const qe = await a2.startEpisode(q.id, [{ sub: 'face' }]);
    const qs = await a2.startSession(qe.id, 'consult');
    const shot = await a2.fileShot(qs.id, { bytes: jpeg(2), view: 'face:frontal', viewSource: 'manual' });
    await a2.deleteShot(qs.id, shot.file);
    await a2.fileShot(qs.id, { bytes: jpeg(3), view: 'face:frontal', viewSource: 'manual' });

    // App killed and restarted while still offline: the rebuilt index sees everything.
    const a3 = await Archive.open(deps(new Outbox(local, remote) as never));
    expect(a3.problems).toEqual([]);
    expect(a3.registry.patients.map((x) => x.surname).sort()).toEqual(['Janssens', 'Peeters']);
    expect(a3.episode(e.id).folderName).toBe('2026-10_breast-augmentation');
    expect(a3.session(pre.id).shots).toHaveLength(1);
    expect(a3.session(qs.id).shots.map((x) => x.file)).toEqual(['20261003_consult_face-frontal_01.jpg']);
    expect(a3.matchPatients({ surname: 'Peeters', firstName: 'Jan', dob: '1950-06-23' })[0].kind).toBe('exact');
    const retaken = await new Outbox(local, remote).readBytes(['Peeters_Jan_1950-06-23', '2026-10_gelaat', '2026-10-03_consult', '20261003_consult_face-frontal_01.jpg']);
    expect(retaken![retaken!.length - 3]).toBe(3); // the retake (jpeg(3)), not the deleted jpeg(2)

    // Back online: one drain makes the folder match the view.
    expect((await new Outbox(local, remote).drain()).remaining).toBe(0);
    const fromFolder = await rebuildIndex(remote);
    expect(fromFolder.registry).toEqual(a3.registry);
    expect(remote.dump().filter((f) => f.includes('consult_face-frontal'))).toEqual(['Peeters_Jan_1950-06-23/2026-10_gelaat/2026-10-03_consult/20261003_consult_face-frontal_01.jpg']);
  });
});

describe('Archive — anatomy (areas, sides, spots, legacy)', () => {
  it('validates areas: at least one, sides where needed, a pin for skin spots', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    await expect(a.startEpisode(p.id, [])).rejects.toThrow(/minstens/);
    await expect(a.startEpisode(p.id, [{ sub: 'hand' }])).rejects.toThrow(/zijde.*Hand/);
    await expect(a.startEpisode(p.id, [{ sub: 'scar' }])).rejects.toThrow(/plaats/);
    await expect(a.startEpisode(p.id, [{ sub: 'nope' }])).rejects.toThrow(/Onbekend/);
    // A side on a paired area is dropped rather than stored.
    const e = await a.startEpisode(p.id, [{ sub: 'breasts', side: 'L' }, { sub: 'abdomen' }]);
    expect(e.areas).toEqual([{ sub: 'breasts' }, { sub: 'abdomen' }]);
    expect(e.folderName).toBe('2026-10_borsten+buik');
  });

  it('left and right follow-ups never match each other', async () => {
    const a = await Archive.open(deps(new MemoryTarget()));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    const e = await a.startEpisode(p.id, [{ sub: 'thigh', side: 'both' }]);
    const pre = await a.startSession(e.id, 'preop');
    await a.fileShot(pre.id, { bytes: jpeg(1), view: 'thigh:medial:L', viewSource: 'manual', geometry: geo(10) });
    clock = new Date('2026-12-01T09:00:00Z');
    const post = await a.startSession(e.id, 'postop', { interval: '6w' });
    expect(resolveTarget('thigh:medial:L', a.episode(e.id), a.sessionsOf(e.id), post).source).toBe('reference');
    expect(resolveTarget('thigh:medial:R', a.episode(e.id), a.sessionsOf(e.id), post).source).toBe('textbook');
  });

  it('tags photos with areas, side and the spot location', async () => {
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(remote));
    const p = await a.createPatient({ surname: 'A', firstName: 'B', dob: '1990-01-01' });
    const spot = { map: 'front' as const, x: 76, y: 77, label: 'linker onderarm, voorzijde' };
    const e = await a.startEpisode(p.id, [{ sub: 'scar', spot }]);
    expect(e.folderName).toBe('2026-10_litteken-onderarm-L');
    const s = await a.startSession(e.id, 'consult');
    const shot = await a.fileShot(s.id, { bytes: jpeg(1), view: 'scar:closeup', viewSource: 'manual' });
    const x = parseXmp(readXmp((await remote.readBytes(['A_B_1990-01-01', e.folderName, s.folderName, shot.file]))!)!);
    expect(x.subjects).toEqual(['view:scar:closeup', 'visit:consult', 'area:scar']);
    expect(x).toMatchObject({ areas: ['scar'], spot: 'linker onderarm, voorzijde' });

    const h = await a.startEpisode(p.id, [{ sub: 'hand', side: 'R' }]);
    const hs = await a.startSession(h.id, 'consult');
    const hshot = await a.fileShot(hs.id, { bytes: jpeg(2), view: 'hand:dorsal:R', viewSource: 'manual' });
    const hx = parseXmp(readXmp((await remote.readBytes(['A_B_1990-01-01', h.folderName, hs.folderName, hshot.file]))!)!);
    expect(hx.subjects).toEqual(['view:hand:dorsal:R', 'visit:consult', 'area:hand', 'side:R']);
  });

  it('episodes saved before the anatomy build are converted on load', async () => {
    const remote = new MemoryTarget();
    const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
    await remote.ensureDir(['Old_Case_1970-01-01', '2026-09_breast', '2026-09-01_preop']);
    await remote.writeBytes(['Old_Case_1970-01-01', 'patient.json'], enc({ id: 'p_old', surname: 'Old', firstName: 'Case', dob: '1970-01-01', createdAt: '2026-09-01T00:00:00Z', consent: [], folderName: 'Old_Case_1970-01-01' }));
    await remote.writeBytes(['Old_Case_1970-01-01', '2026-09_breast', 'episode.json'], enc({ id: 'e_old', patientId: 'p_old', region: 'breast', procedure: null, secondary: [], surgeryDate: null, startedAt: '2026-09-01', folderName: '2026-09_breast' }));
    await remote.writeBytes(['Old_Case_1970-01-01', '2026-09_breast', '2026-09-01_preop', 'session.json'], enc({ id: 's_old', episodeId: 'e_old', patientId: 'p_old', date: '2026-09-01', visit: 'preop', folderName: '2026-09-01_preop', operator: 'JP', device: 'x', shots: [{ file: 'x.jpg', view: 'body-lateral-L', kind: 'photo', index: 1, capturedAt: '', viewSource: 'manual', geometry: geo(88) }] }));
    await remote.writeBytes(['Old_Case_1970-01-01', '2026-09_breast', '2026-09-01_preop', 'x.jpg'], jpeg(1));

    const a = await Archive.open(deps(remote));
    expect(a.problems).toEqual([]);
    expect(a.episode('e_old').areas).toEqual([{ sub: 'breasts' }]);
    expect(a.session('s_old').shots[0].view).toBe('breasts:lateral-L');
    const post = await a.startSession('e_old', 'postop', { interval: '6w' });
    expect(resolveTarget('breasts:lateral-L', a.episode('e_old'), a.sessionsOf('e_old'), post).geometry.yaw).toBe(88);
    // The old folder name stays as it is on disk.
    expect(a.episode('e_old').folderName).toBe('2026-09_breast');
  });

  it('stores edited view sets in the folder and restores defaults', async () => {
    const remote = new MemoryTarget();
    const a = await Archive.open(deps(remote));
    await a.setViewOverride('eyelids', { hidden: ['upgaze'] });
    const tablet = await Archive.open(deps(remote));
    expect(tablet.viewOverrides).toEqual({ eyelids: { hidden: ['upgaze'] } });
    await tablet.setViewOverride('eyelids', null);
    expect((await Archive.open(deps(remote))).viewOverrides).toEqual({});
    expect(remote.dump()).toEqual(['.medical-photos/views.json']);
  });
});
