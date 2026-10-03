import { describe, expect, it } from 'vitest';
import type { CaptureGeometry, Episode, Session, Shot } from '../types';
import { resolveTarget, textbookGeometry } from './targets';
import { angleDelta, evaluate, smooth } from './evaluate';
import { bodyYaw, classifyStep, faceGeometry, poseGeometry, yawBucket } from './detectors';
import { viewSequence } from '../catalog/catalog';

const episode: Episode = {
  id: 'ep1', patientId: 'p1', areas: [{ sub: 'face' }], procedure: null, secondary: [], surgeryDate: null,
  startedAt: '2026-10-03', folderName: '2026-10_face',
};

const geo = (yaw: number, extra: Partial<CaptureGeometry> = {}): CaptureGeometry => ({
  yaw, pitch: 2, roll: -1, distance: 0.41, centerX: 0.03, centerY: -0.02, phonePitch: 1, phoneRoll: 0, source: 'face', ...extra,
});

const shot = (view: string, index: number, g?: CaptureGeometry, extra: Partial<Shot> = {}): Shot => ({
  file: `${view}_${index}.jpg`, view, kind: 'photo', index, capturedAt: '', geometry: g, viewSource: 'auto', ...extra,
});

const session = (id: string, date: string, visit: Session['visit'], shots: Shot[], extra: Partial<Session> = {}): Session => ({
  id, episodeId: 'ep1', patientId: 'p1', date, visit, folderName: `${date}_${visit}`, operator: 'JP', device: 'test', shots, ...extra,
});

describe('reference rule: textbook on a first visit, pre-op geometry on follow-ups', () => {
  it('first visit → textbook angle', () => {
    const t = resolveTarget('face:oblique-L', episode, [], { id: 'now', date: '2026-10-03' });
    expect(t.source).toBe('textbook');
    expect(t.geometry.yaw).toBe(45);
    expect(t.reference).toBeUndefined();
  });

  it('post-op → exact geometry of the pre-op photo, not the textbook value', () => {
    const pre = session('pre', '2026-10-03', 'preop', [shot('face:oblique-L', 1, geo(41.5))]);
    const t = resolveTarget('face:oblique-L', episode, [pre], { id: 'post', date: '2026-11-14' });
    expect(t.source).toBe('reference');
    expect(t.geometry).toMatchObject({ yaw: 41.5, pitch: 2, roll: -1, distance: 0.41, centerX: 0.03, centerY: -0.02 });
    expect(t.reference?.sessionId).toBe('pre');
    expect(t.tolerance.yaw).toBe(5);
  });

  it('later post-op still matches the pre-op, not the previous post-op', () => {
    const pre = session('pre', '2026-10-03', 'preop', [shot('face:lateral-L', 1, geo(88))]);
    const post6w = session('p6', '2026-11-14', 'postop', [shot('face:lateral-L', 1, geo(93))], { interval: '6w' });
    const t = resolveTarget('face:lateral-L', episode, [pre, post6w], { id: 'p3m', date: '2027-01-10' });
    expect(t.reference?.sessionId).toBe('pre');
    expect(t.geometry.yaw).toBe(88);
  });

  it('uses the latest pre-op when there are several', () => {
    const preA = session('preA', '2026-09-01', 'preop', [shot('face:frontal', 1, geo(1))]);
    const preB = session('preB', '2026-10-03', 'preop', [shot('face:frontal', 1, geo(-2))]);
    const t = resolveTarget('face:frontal', episode, [preB, preA], { id: 'post', date: '2026-11-14' });
    expect(t.reference?.sessionId).toBe('preB');
  });

  it('prefers the shot marked as reference, else the last one taken', () => {
    const pre = session('pre', '2026-10-03', 'preop', [
      shot('face:frontal', 1, geo(3), { isReference: true }),
      shot('face:frontal', 2, geo(-4)),
    ]);
    expect(resolveTarget('face:frontal', episode, [pre], { id: 'x', date: '2026-12-01' }).geometry.yaw).toBe(3);
    const pre2 = session('pre', '2026-10-03', 'preop', [shot('face:frontal', 1, geo(3)), shot('face:frontal', 2, geo(-4))]);
    expect(resolveTarget('face:frontal', episode, [pre2], { id: 'x', date: '2026-12-01' }).geometry.yaw).toBe(-4);
  });

  it('falls back to the consult when there is no pre-op', () => {
    const consult = session('c', '2026-09-01', 'consult', [shot('face:frontal', 1, geo(2))]);
    expect(resolveTarget('face:frontal', episode, [consult], { id: 'x', date: '2026-12-01' }).reference?.sessionId).toBe('c');
  });

  it('pre-op wins over a more recent consult', () => {
    const pre = session('pre', '2026-09-01', 'preop', [shot('face:frontal', 1, geo(2))]);
    const consult = session('c', '2026-09-20', 'consult', [shot('face:frontal', 1, geo(9))]);
    expect(resolveTarget('face:frontal', episode, [pre, consult], { id: 'x', date: '2026-12-01' }).reference?.sessionId).toBe('pre');
  });

  it('honours a manual reference override on the episode', () => {
    const pre = session('pre', '2026-10-03', 'preop', [shot('face:frontal', 1, geo(2))]);
    const consult = session('c', '2026-09-01', 'consult', [shot('face:frontal', 1, geo(9))]);
    const t = resolveTarget('face:frontal', { ...episode, referenceSessionId: 'c' }, [pre, consult], { id: 'x', date: '2026-12-01' });
    expect(t.reference?.sessionId).toBe('c');
  });

  it('pre-op shot without geometry → textbook target, but still a ghost reference', () => {
    const pre = session('pre', '2026-10-03', 'preop', [shot('nose:basal', 1)]);
    const t = resolveTarget('nose:basal', episode, [pre], { id: 'x', date: '2026-12-01' });
    expect(t.source).toBe('textbook');
    expect(t.reference?.shot.file).toBe('nose:basal_1.jpg');
  });

  it('ignores other episodes and later sessions', () => {
    const other = { ...session('o', '2026-01-01', 'preop', [shot('face:frontal', 1, geo(20))]), episodeId: 'ep2' };
    const later = session('l', '2027-05-01', 'preop', [shot('face:frontal', 1, geo(20))]);
    expect(resolveTarget('face:frontal', episode, [other, later], { id: 'x', date: '2026-12-01' }).source).toBe('textbook');
  });

  it('patient entered the app already post-op: the first documented visit is the baseline', () => {
    const post6w = session('p6', '2026-11-14', 'postop', [shot('face:lateral-L', 1, geo(86))], { interval: '6w' });
    const post3m = session('p3', '2027-01-10', 'postop', [shot('face:lateral-L', 1, geo(95))], { interval: '3m' });
    const t = resolveTarget('face:lateral-L', episode, [post3m, post6w], { id: 'p1y', date: '2027-10-01' });
    expect(t.source).toBe('reference');
    expect(t.reference?.sessionId).toBe('p6');
    expect(t.geometry.yaw).toBe(86);
  });

  it('the very first documented visit still gets the textbook target', () => {
    expect(resolveTarget('face:lateral-L', episode, [], { id: 'p6', date: '2026-11-14' }).source).toBe('textbook');
  });

  it('a pre-op without the requested view does not become the reference', () => {
    const pre = session('pre', '2026-10-03', 'preop', [shot('face:frontal', 1, geo(0))]);
    expect(resolveTarget('face:lateral-R', episode, [pre], { id: 'x', date: '2026-12-01' }).source).toBe('textbook');
  });
});

describe('evaluate', () => {
  const target = resolveTarget('face:oblique-L', episode, [session('pre', '2026-10-03', 'preop', [shot('face:oblique-L', 1, geo(42))])], { id: 'x', date: '2026-12-01' });

  it('is green when every axis is inside tolerance', () => {
    const r = evaluate(geo(44), target);
    expect(r.allOk).toBe(true);
    expect(r.hints).toEqual([]);
    expect(r.score).toBe(1);
  });

  it('tells which way to turn the patient', () => {
    expect(evaluate(geo(30), target).hints[0]).toBe('Patiënt 12° verder naar eigen rechts draaien');
    expect(evaluate(geo(55), target).hints[0]).toBe('Patiënt 13° verder naar eigen links draaien');
  });

  it('prioritises rotation over distance and caps the hints at two', () => {
    const r = evaluate(geo(30, { pitch: 15, distance: 0.6, centerX: 0.3 }), target);
    expect(r.hints).toHaveLength(2);
    expect(r.hints[0]).toMatch(/draaien/);
    expect(r.hints[1]).toMatch(/Kin/);
  });

  it('reports distance relative to the reference', () => {
    const r = evaluate(geo(42, { distance: 0.5 }), target);
    expect(r.hints[0]).toBe('Iets achteruit (22% te dichtbij)');
  });

  it('says when nothing is detected', () => {
    expect(evaluate(null, target).hints).toEqual(['Geen gezicht in beeld']);
  });

  it('handles the ±180° seam for PA views', () => {
    expect(angleDelta(179, -179)).toBe(-2);
    expect(angleDelta(-179, 179)).toBe(2);
  });

  it('textbook targets have looser framing than reference targets', () => {
    const tb = resolveTarget('face:oblique-L', episode, [], { id: 'x', date: '2026-10-03' });
    expect(evaluate({ ...geo(45), distance: 0.35 * 1.2 }, tb).allOk).toBe(true);
    expect(textbookGeometry('face:lateral-R').yaw).toBe(-90);
  });
});

describe('detectors', () => {
  it('maps an ML Kit face to canonical geometry', () => {
    const g = faceGeometry({ rotationX: 3, rotationY: -40, rotationZ: 2, frame: { left: 300, top: 200, width: 400, height: 500 } }, { width: 1000, height: 1250 });
    expect(g).toMatchObject({ yaw: 40, pitch: 3, roll: -2, source: 'face' });
    expect(g.distance).toBeCloseTo(0.4);
    expect(g.centerX).toBeCloseTo(0);
    expect(g.centerY).toBeCloseTo(-0.14); // (200 + 250) / 1250 − 0.5
  });

  it('body yaw: facing camera 0°, left side to camera +90°, back to camera 180°', () => {
    expect(bodyYaw({ x: 600, y: 0, z: 0 }, { x: 400, y: 0, z: 0 })).toBeCloseTo(0);
    expect(bodyYaw({ x: 500, y: 0, z: -100 }, { x: 500, y: 0, z: 100 })).toBeCloseTo(90);
    expect(Math.abs(bodyYaw({ x: 400, y: 0, z: 0 }, { x: 600, y: 0, z: 0 }))).toBeCloseTo(180);
  });

  it('pose geometry measures torso span and centre', () => {
    const g = poseGeometry(
      { leftShoulder: { x: 600, y: 400, z: 0 }, rightShoulder: { x: 400, y: 400, z: 0 }, leftHip: { x: 580, y: 1000, z: 0 }, rightHip: { x: 420, y: 1000, z: 0 } },
      { width: 1000, height: 1500 },
    );
    expect(g.yaw).toBeCloseTo(0);
    expect(g.distance).toBeCloseTo(0.4);
    expect(g.centerX).toBeCloseTo(0);
  });

  it('classifies face views within the current sequence and refuses the grey zones', () => {
    const face = viewSequence([{ sub: 'face' }], 'preop');
    expect(classifyStep({ yaw: 4, source: 'face' }, face)).toBe('face:frontal');
    expect(classifyStep({ yaw: 3, source: 'face' }, face, { smiling: 0.9 })).toBe('face:frontal-smile');
    expect(classifyStep({ yaw: 47, source: 'face' }, face)).toBe('face:oblique-L');
    expect(classifyStep({ yaw: -85, source: 'face' }, face)).toBe('face:lateral-R');
    expect(classifyStep({ yaw: 22, source: 'face' }, face)).toBeNull();
  });

  it('does not guess between expressions or eyelid poses that share an angle', () => {
    expect(classifyStep({ yaw: 0, source: 'face' }, viewSequence([{ sub: 'palsy', side: 'L' }], 'preop'))).toBeNull();
    expect(classifyStep({ yaw: 0, source: 'face' }, viewSequence([{ sub: 'eyelids' }], 'preop'))).toBeNull();
    expect(classifyStep({ yaw: 46, source: 'face' }, viewSequence([{ sub: 'eyelids' }], 'preop'))).toBe('eyelids:oblique-L');
  });

  it('classifies body views by detector and band, never manual views', () => {
    const breasts = viewSequence([{ sub: 'breasts' }], 'preop');
    expect(classifyStep({ yaw: 5, source: 'pose' }, breasts, { armsUp: true })).toBe('breasts:ap-arms-up');
    expect(classifyStep({ yaw: -50, source: 'pose' }, breasts)).toBe('breasts:oblique-R');
    expect(classifyStep({ yaw: 175, source: 'pose' }, breasts)).toBeNull(); // no PA view for breasts
    expect(classifyStep({ yaw: 175, source: 'pose' }, viewSequence([{ sub: 'flanks' }], 'preop'))).toBe('flanks:pa');
    expect(classifyStep({ yaw: 130, source: 'pose' }, viewSequence([{ sub: 'back' }], 'preop'))).toBe('back:post-oblique-L');
    expect(classifyStep({ yaw: 0, source: 'face' }, viewSequence([{ sub: 'hand', side: 'L' }], 'preop'))).toBeNull();
    expect(yawBucket(25, 'pose')).toBeNull();
  });

  it('smooths jitter without breaking at the seam', () => {
    const a = geo(178);
    const b = geo(-178);
    expect(Math.abs(smooth(a, b).yaw)).toBeGreaterThan(178);
  });
});
