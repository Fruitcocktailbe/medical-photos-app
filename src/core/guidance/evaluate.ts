/**
 * The live guidance loop: compare what the detector measures right now with
 * the target and say what to change. Runs on every analysed frame, so it is
 * pure and cheap. The UI renders `allOk` as the green ring and shows at most
 * two hints so the surgeon can keep talking to the patient.
 */
import type { CaptureGeometry } from '../types';
import type { Target } from './targets';

export type Axis = 'yaw' | 'pitch' | 'roll' | 'distance' | 'centerX' | 'centerY' | 'phonePitch' | 'phoneRoll';

export interface AxisResult {
  axis: Axis;
  /** live − target (degrees, fraction, or relative ratio − 1 for distance). */
  delta: number;
  ok: boolean;
}

export interface GuidanceResult {
  detected: boolean;
  allOk: boolean;
  /** 0..1, share of axes inside tolerance — drives the ring fill. */
  score: number;
  axes: AxisResult[];
  /** Dutch, ordered by priority, at most `maxHints`. */
  hints: string[];
}

/** Smallest signed difference between two angles in degrees, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function evaluate(
  live: CaptureGeometry | null,
  target: Target,
  opts: { maxHints?: number } = {},
): GuidanceResult {
  const maxHints = opts.maxHints ?? 2;
  if (!live) {
    const what = target.detect === 'pose' ? 'lichaam' : 'gezicht';
    return {
      detected: target.detect === 'manual',
      allOk: target.detect === 'manual',
      score: 0,
      axes: [],
      hints: target.detect === 'manual' ? [] : [`Geen ${what} in beeld`],
    };
  }
  const g = target.geometry;
  const t = target.tolerance;
  const axes: AxisResult[] = [];
  const add = (axis: Axis, delta: number, tol: number) => axes.push({ axis, delta, ok: Math.abs(delta) <= tol });

  if (target.detect !== 'manual') {
    add('yaw', angleDelta(live.yaw, g.yaw), t.yaw);
    if (target.detect === 'face') add('pitch', live.pitch - g.pitch, t.pitch);
    add('roll', live.roll - g.roll, t.roll);
    if (g.distance > 0) add('distance', live.distance / g.distance - 1, t.distanceRel);
    add('centerX', live.centerX - g.centerX, t.center);
    add('centerY', live.centerY - g.centerY, t.center);
  }
  if (live.phonePitch != null) add('phonePitch', live.phonePitch - g.phonePitch, t.phone);
  if (live.phoneRoll != null) add('phoneRoll', live.phoneRoll - g.phoneRoll, t.phone);

  const okCount = axes.filter((a) => a.ok).length;
  const hints = axes.filter((a) => !a.ok).map(hintFor).slice(0, maxHints);
  return {
    detected: true,
    allOk: okCount === axes.length,
    score: axes.length ? okCount / axes.length : 1,
    axes,
    hints,
  };
}

const deg = (d: number) => `${Math.round(Math.abs(d))}°`;
const pct = (d: number) => `${Math.round(Math.abs(d) * 100)}%`;

function hintFor(a: AxisResult): string {
  switch (a.axis) {
    case 'yaw':
      // Positive yaw = patient turned to their own right (left side to camera).
      return a.delta < 0
        ? `Patiënt ${deg(a.delta)} verder naar eigen rechts draaien`
        : `Patiënt ${deg(a.delta)} verder naar eigen links draaien`;
    case 'pitch':
      return a.delta > 0 ? `Kin ${deg(a.delta)} omlaag` : `Kin ${deg(a.delta)} omhoog`;
    case 'roll':
      return a.delta > 0
        ? `Hoofd rechtop: kantelt ${deg(a.delta)} naar linkerschouder`
        : `Hoofd rechtop: kantelt ${deg(a.delta)} naar rechterschouder`;
    case 'distance':
      return a.delta > 0 ? `Iets achteruit (${pct(a.delta)} te dichtbij)` : `Iets dichterbij (${pct(a.delta)} te ver)`;
    case 'centerX':
      return a.delta > 0 ? 'Camera iets naar rechts richten' : 'Camera iets naar links richten';
    case 'centerY':
      return a.delta > 0 ? 'Camera iets omlaag richten' : 'Camera iets omhoog richten';
    case 'phonePitch':
      return `Telefoon rechtop houden (helt ${deg(a.delta)})`;
    case 'phoneRoll':
      return `Telefoon waterpas houden (kantelt ${deg(a.delta)})`;
  }
}

/** Exponential smoothing against detector jitter; angles use the shortest path. */
export function smooth(prev: CaptureGeometry | null, next: CaptureGeometry, alpha = 0.35): CaptureGeometry {
  if (!prev) return next;
  const lin = (a: number, b: number) => a + alpha * (b - a);
  const ang = (a: number, b: number) => {
    const r = a + alpha * angleDelta(b, a);
    return angleDelta(r, 0);
  };
  const opt = (a?: number, b?: number) => (a == null || b == null ? b : lin(a, b));
  return {
    ...next,
    yaw: ang(prev.yaw, next.yaw),
    pitch: lin(prev.pitch, next.pitch),
    roll: lin(prev.roll, next.roll),
    distance: lin(prev.distance, next.distance),
    centerX: lin(prev.centerX, next.centerX),
    centerY: lin(prev.centerY, next.centerY),
    phonePitch: opt(prev.phonePitch, next.phonePitch),
    phoneRoll: opt(prev.phoneRoll, next.phoneRoll),
  };
}
