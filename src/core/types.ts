/**
 * Core data model. Everything here is serialised into the user's chosen folder
 * (patient.json / episode.json / session.json): the folder is the database and
 * any device can rebuild its index from it (PRD §5).
 *
 * Pure TypeScript: no React Native imports anywhere under src/core.
 */

export type Region = 'face' | 'breast' | 'body' | 'hand' | 'other';

export type VisitType = 'consult' | 'preop' | 'intraop' | 'postop' | 'other';

/** Post-op interval presets; free text is allowed for anything else ("10d"). */
export type PostopInterval = '1w' | '6w' | '3m' | '6m' | '1y' | (string & {});

/** A view id from the catalogue, e.g. "frontal", "oblique-L", "lateral-R", "AP-arms-up". */
export type ViewId = string;

/**
 * Static photos in v1. "clip" is reserved for the expression series and
 * short videos of Phase 4, so the model never assumes view === JPEG.
 */
export type MediaKind = 'photo' | 'clip';

/**
 * Where the subject is, measured at capture time. This is what makes a post-op
 * photo reproduce its pre-op pair (PRD §4 step 3).
 *
 * Coordinate convention (canonical, device-independent):
 * - yaw:   degrees the PATIENT is rotated. 0 = facing the camera.
 *          Positive = patient turned to their own right, so their LEFT side
 *          faces the camera (left oblique +45, left lateral +90).
 * - pitch: degrees, positive = chin up.
 * - roll:  degrees, positive = head tilted towards the patient's left shoulder.
 * - distance: subject box height / frame height (0..1). Bigger = closer.
 * - centerX/centerY: subject box centre minus frame centre, as a fraction of
 *          frame width/height (-0.5..0.5). Positive X = subject right of centre
 *          in the image, positive Y = subject below centre.
 * - phonePitch/phoneRoll: device tilt in degrees from the motion sensors.
 *
 * Platform adapters convert raw detector output into this convention; the
 * sign mapping is verified on the device in spike (b).
 */
export interface CaptureGeometry {
  yaw: number;
  pitch: number;
  roll: number;
  distance: number;
  centerX: number;
  centerY: number;
  phonePitch?: number;
  phoneRoll?: number;
  source: 'face' | 'pose' | 'manual';
}

export type ConsentScope = 'clinical' | 'teaching' | 'social';

/** Oral consent given in the consultation, recorded with one tap (PRD Q24). */
export interface ConsentRecord {
  scope: ConsentScope;
  granted: boolean;
  at: string; // ISO timestamp
  askedBy: string;
  mode: 'oral';
}

export interface Patient {
  id: string;
  surname: string;
  firstName: string;
  /** YYYY-MM-DD */
  dob: string;
  patientNumber?: string;
  /** Belgian national register number, digits only, if it was on the label. */
  nationalNumber?: string;
  createdAt: string;
  /** Append-only; the latest record per scope wins. */
  consent: ConsentRecord[];
  /** Folder name under the root; stored so a rename is detectable. */
  folderName: string;
}

/** One treatment for one patient: consult → pre-op → intra-op → post-ops. */
export interface Episode {
  id: string;
  patientId: string;
  region: Region;
  /** Null until the operation: pre-op only needs the region (PRD §6). */
  procedure: string | null;
  secondary: string[];
  surgeryDate: string | null;
  /** YYYY-MM-DD of the first session. */
  startedAt: string;
  folderName: string;
  /**
   * Optional override for the reference session whose geometry follow-ups
   * must match. Default: the latest pre-op session (see guidance/targets.ts).
   */
  referenceSessionId?: string;
}

export interface Shot {
  file: string;
  view: ViewId;
  kind: MediaKind;
  /** 1-based index within (session, view). */
  index: number;
  capturedAt: string;
  geometry?: CaptureGeometry;
  /** Whether the view tag came from the detector or a manual tap. */
  viewSource: 'auto' | 'manual';
  /** The surgeon's chosen keeper for this view; used as the reference shot. */
  isReference?: boolean;
  /** File name of the drawn-on copy, if any. The original is never modified. */
  annotatedFile?: string;
}

export interface Session {
  id: string;
  episodeId: string;
  patientId: string;
  /** YYYY-MM-DD */
  date: string;
  visit: VisitType;
  interval?: PostopInterval;
  folderName: string;
  operator: string;
  device: string;
  shots: Shot[];
  note?: string;
}

export interface Registry {
  patients: Patient[];
  episodes: Episode[];
  sessions: Session[];
}
