/**
 * THE RULE (PRD §4 step 3, confirmed by Jeroen 03/10):
 *   on a first visit the target is the textbook angle;
 *   on every follow-up the target is the exact geometry recorded with the
 *   pre-op photo of that view — not the textbook value, and not the previous
 *   post-op — so every post-op photo pairs with the same "before".
 *
 * Reference session, in order of preference:
 *   1. episode.referenceSessionId (manual override), if it holds that view;
 *   2. the latest PRE-OP session before the current one that holds that view;
 *   3. the latest CONSULT session before the current one that holds that view;
 *   4. the EARLIEST earlier session that holds that view — for patients who
 *      entered the app already operated (UX decision U7, 03/10): their first
 *      documented visit becomes the baseline every later visit matches.
 * Reference shot within that session: the one marked isReference, else the
 * last one taken of that view (usually the keeper).
 *
 * If the reference shot has no geometry (manual views such as hand or basal),
 * the target falls back to textbook geometry but the shot is still returned so
 * the ghost overlay can show it.
 */
import { stepForKey, type DetectMode } from '../catalog/catalog';
import type { CaptureGeometry, Episode, Session, Shot, ViewId } from '../types';

export interface Tolerance {
  yaw: number;
  pitch: number;
  roll: number;
  /** Relative: 0.1 = ±10 % of the target distance. */
  distanceRel: number;
  /** Fraction of frame width/height. */
  center: number;
  /** Phone tilt in degrees. */
  phone: number;
}

export interface TargetGeometry {
  yaw: number;
  pitch: number;
  roll: number;
  distance: number;
  centerX: number;
  centerY: number;
  phonePitch: number;
  phoneRoll: number;
}

export interface ReferenceShot {
  sessionId: string;
  sessionDate: string;
  visit: Session['visit'];
  sessionFolder: string;
  shot: Shot;
}

export interface Target {
  view: ViewId;
  detect: DetectMode;
  source: 'textbook' | 'reference';
  geometry: TargetGeometry;
  tolerance: Tolerance;
  /** For the ghost overlay; present whenever a reference shot exists. */
  reference?: ReferenceShot;
}

/** Tight windows when matching a recorded reference. Starting values; tuned in the spike. */
export const REFERENCE_TOLERANCE: Record<DetectMode, Tolerance> = {
  face: { yaw: 5, pitch: 5, roll: 3, distanceRel: 0.1, center: 0.05, phone: 3 },
  pose: { yaw: 8, pitch: 90, roll: 4, distanceRel: 0.1, center: 0.06, phone: 3 },
  manual: { yaw: 360, pitch: 90, roll: 90, distanceRel: 1, center: 1, phone: 4 },
};

/** Looser windows for textbook targets: angle matters, framing is a suggestion. */
export const TEXTBOOK_TOLERANCE: Record<DetectMode, Tolerance> = {
  face: { yaw: 5, pitch: 7, roll: 4, distanceRel: 0.25, center: 0.1, phone: 4 },
  pose: { yaw: 8, pitch: 90, roll: 5, distanceRel: 0.25, center: 0.12, phone: 4 },
  manual: { yaw: 360, pitch: 90, roll: 90, distanceRel: 1, center: 1, phone: 5 },
};

/** Textbook subject size: face box ≈ 35 % of frame height, shoulder–hip span ≈ 55 %. */
const TEXTBOOK_DISTANCE: Record<DetectMode, number> = { face: 0.35, pose: 0.55, manual: 0.5 };

export function textbookGeometry(view: ViewId): TargetGeometry {
  const step = stepForKey(view);
  const detect = step.detect;
  return {
    yaw: step.view.yaw ?? 0,
    pitch: step.view.pitch ?? 0,
    roll: 0,
    distance: TEXTBOOK_DISTANCE[detect],
    centerX: 0,
    centerY: 0,
    phonePitch: 0,
    phoneRoll: 0,
  };
}

export function geometryToTarget(g: CaptureGeometry): TargetGeometry {
  return {
    yaw: g.yaw,
    pitch: g.pitch,
    roll: g.roll,
    distance: g.distance,
    centerX: g.centerX,
    centerY: g.centerY,
    phonePitch: g.phonePitch ?? 0,
    phoneRoll: g.phoneRoll ?? 0,
  };
}

export function findReferenceShot(
  view: ViewId,
  episode: Episode,
  sessions: Session[],
  current: Pick<Session, 'id' | 'date'>,
): ReferenceShot | undefined {
  const earlier = sessions
    .filter((s) => s.episodeId === episode.id && s.id !== current.id && s.date <= current.date)
    .filter((s) => s.shots.some((x) => x.view === view && x.kind === 'photo'))
    .sort((a, b) => a.date.localeCompare(b.date));

  const pick = (s: Session | undefined): ReferenceShot | undefined => {
    if (!s) return undefined;
    const ofView = s.shots.filter((x) => x.view === view && x.kind === 'photo');
    const shot = ofView.find((x) => x.isReference) ?? ofView.sort((a, b) => a.index - b.index)[ofView.length - 1];
    return { sessionId: s.id, sessionDate: s.date, visit: s.visit, sessionFolder: s.folderName, shot };
  };

  if (episode.referenceSessionId) {
    const forced = earlier.find((s) => s.id === episode.referenceSessionId);
    if (forced) return pick(forced);
  }
  const latest = (visit: Session['visit']) => [...earlier].reverse().find((s) => s.visit === visit);
  return pick(latest('preop')) ?? pick(latest('consult')) ?? pick(earlier[0]);
}

export function resolveTarget(
  view: ViewId,
  episode: Episode,
  sessions: Session[],
  current: Pick<Session, 'id' | 'date'>,
): Target {
  const detect = stepForKey(view).detect;
  const reference = findReferenceShot(view, episode, sessions, current);
  if (reference?.shot.geometry) {
    return {
      view,
      detect,
      source: 'reference',
      geometry: geometryToTarget(reference.shot.geometry),
      tolerance: REFERENCE_TOLERANCE[detect],
      reference,
    };
  }
  return { view, detect, source: 'textbook', geometry: textbookGeometry(view), tolerance: TEXTBOOK_TOLERANCE[detect], reference };
}
