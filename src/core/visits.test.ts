import { describe, expect, it } from 'vitest';
import { favouriteProcedures, intervalFor, nextMissingView, proposeVisit, recentPatients, sessionProgress, sinceLabel, visitLabel } from './visits';
import type { Episode, Registry, Session, Shot } from './types';

const ep = (extra: Partial<Episode> = {}): Episode => ({
  id: 'e1', patientId: 'p1', region: 'breast', procedure: null, secondary: [], surgeryDate: null, startedAt: '2026-09-01', folderName: 'x', ...extra,
});
const shot = (view: string): Shot => ({ file: `${view}.jpg`, view, kind: 'photo', index: 1, capturedAt: '', viewSource: 'manual' });
const sess = (id: string, date: string, shots: Shot[] = [], extra: Partial<Session> = {}): Session => ({
  id, episodeId: 'e1', patientId: 'p1', date, visit: 'preop', folderName: id, operator: 'JP', device: 'x', shots, ...extra,
});

describe('intervals', () => {
  it('rounds to the nearest preset and labels the exact time', () => {
    expect(intervalFor('2026-10-20', '2026-12-03')).toEqual({ days: 44, preset: '6w', label: '6 weken + 2 dagen' });
    expect(intervalFor('2026-10-20', '2026-10-25').preset).toBe('1w');
    expect(intervalFor('2026-10-20', '2027-01-15').preset).toBe('3m');
    expect(intervalFor('2026-10-20', '2027-10-25').preset).toBe('1y');
    expect(intervalFor('2024-01-01', '2026-01-10').preset).toBe('2y');
  });
  it('speaks clinic language', () => {
    expect(sinceLabel(1)).toBe('1 dag');
    expect(sinceLabel(14)).toBe('2 weken');
    expect(sinceLabel(386)).toBe('1 jaar + 3 weken');
    expect(visitLabel('postop', '6w')).toBe('Post-op 6 weken');
    expect(visitLabel('postop', '2y')).toBe('Post-op 2y');
  });
});

describe('proposeVisit', () => {
  it('post-op with the computed interval when the surgery date is past', () => {
    expect(proposeVisit(ep({ surgeryDate: '2026-10-20' }), [], '2026-12-03')).toMatchObject({ visit: 'postop', interval: '6w', label: 'Post-op 6 weken · 6 weken + 2 dagen' });
  });
  it('intra-op on the day of surgery, pre-op before it', () => {
    expect(proposeVisit(ep({ surgeryDate: '2026-10-20' }), [], '2026-10-20').visit).toBe('intraop');
    expect(proposeVisit(ep({ surgeryDate: '2026-10-20' }), [], '2026-10-10').visit).toBe('preop');
  });
  it('consult for a brand-new treatment, pre-op once it has sessions', () => {
    expect(proposeVisit(ep(), [], '2026-10-03').visit).toBe('consult');
    expect(proposeVisit(ep(), [sess('s1', '2026-09-01')], '2026-10-03').visit).toBe('preop');
  });
});

describe('progress', () => {
  const set = ['AP', 'body-oblique-L', 'body-oblique-R'];
  it('lists planned views, extras and what is missing', () => {
    const s = sess('s', '2026-10-03', [shot('AP'), shot('AP'), shot('free')]);
    expect(sessionProgress(s, set)).toEqual({
      planned: [{ view: 'AP', shots: 2 }, { view: 'body-oblique-L', shots: 0 }, { view: 'body-oblique-R', shots: 0 }],
      extra: [{ view: 'free', shots: 1 }],
      missing: ['body-oblique-L', 'body-oblique-R'],
    });
  });
  it('advances to the next missing view, wrapping, null when complete', () => {
    expect(nextMissingView(set, sess('s', 'd', [shot('AP')]), 'AP')).toBe('body-oblique-L');
    expect(nextMissingView(set, sess('s', 'd', [shot('AP'), shot('body-oblique-R')]), 'body-oblique-R')).toBe('body-oblique-L');
    expect(nextMissingView(set, sess('s', 'd', set.map(shot)), 'AP')).toBeNull();
    expect(nextMissingView(set, sess('s', 'd', [shot('free')]), 'free')).toBe('AP');
  });
});

describe('recent and favourites', () => {
  it('orders patients by their latest session', () => {
    const r: Registry = {
      patients: [
        { id: 'p1', surname: 'A', firstName: 'A', dob: '1990-01-01', createdAt: '2026-01-01T00:00:00Z', consent: [], folderName: 'a' },
        { id: 'p2', surname: 'B', firstName: 'B', dob: '1990-01-01', createdAt: '2026-02-01T00:00:00Z', consent: [], folderName: 'b' },
      ],
      episodes: [ep({ id: 'e1', patientId: 'p1', procedure: 'facelift' }), ep({ id: 'e2', patientId: 'p2', procedure: 'facelift' }), ep({ id: 'e3', patientId: 'p2', procedure: 'mastopexy' })],
      sessions: [sess('s1', '2026-10-02', [], { patientId: 'p1', episodeId: 'e1' }), sess('s2', '2026-09-01', [], { patientId: 'p2', episodeId: 'e2' })],
    };
    const rec = recentPatients(r);
    expect(rec.map((x) => x.patient.id)).toEqual(['p1', 'p2']);
    expect(rec[0].episode?.procedure).toBe('facelift');
    expect(favouriteProcedures(r)).toEqual(['facelift', 'mastopexy']);
  });
});
