/**
 * The archive: every operation the screens need, on top of a StorageTarget.
 * Keeps the registry in memory and writes the JSON sidecars through the
 * target (usually an Outbox, so everything works offline).
 */
import { utf8Encode } from './bytes';
import { defaultIdGen, isoDate, type IdGen } from './ids';
import { annotatedFileName, asciiSafe, episodeFolderName, nextShotIndex, patientFolderName, sessionFolderName, shotFileName } from './naming';
import { buildXmp, injectXmp, type ShotXmp } from './metadata/xmp';
import { MIME, type Path, type StorageTarget } from './storage/StorageTarget';
import { rebuildIndex } from './index/rebuild';
import { displayCase } from './identity/parseLabel';
import type {
  CaptureGeometry, ConsentScope, Episode, MediaKind, Patient, Region, Registry, Session, Shot, ViewId, VisitType,
} from './types';

export interface ArchiveDeps {
  storage: StorageTarget;
  operator: string;
  device: string;
  now?: () => Date;
  idGen?: IdGen;
}

export interface NewPatient {
  surname: string;
  firstName: string;
  dob: string;
  patientNumber?: string;
  nationalNumber?: string;
}

export type MatchKind = 'exact' | 'probable-typo' | 'same-name-other-dob';

export interface PatientMatch {
  patient: Patient;
  kind: MatchKind;
}

export type BackfillOp =
  | { type: 'rewriteXmp'; path: string[]; meta: ShotXmp }
  | { type: 'writeJson'; path: string[]; data: unknown }
  | { type: 'rename'; path: string[]; newName: string };

export class Archive {
  registry: Registry = { patients: [], episodes: [], sessions: [] };
  problems: string[] = [];
  private now: () => Date;
  private id: IdGen;

  constructor(private deps: ArchiveDeps) {
    this.now = deps.now ?? (() => new Date());
    this.id = deps.idGen ?? defaultIdGen;
  }

  static async open(deps: ArchiveDeps): Promise<Archive> {
    const a = new Archive(deps);
    const { registry, problems } = await rebuildIndex(deps.storage);
    a.registry = registry;
    a.problems = problems;
    return a;
  }

  // ---------- lookups ----------

  patient(id: string): Patient {
    const p = this.registry.patients.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown patient ${id}`);
    return p;
  }
  episode(id: string): Episode {
    const e = this.registry.episodes.find((x) => x.id === id);
    if (!e) throw new Error(`Unknown episode ${id}`);
    return e;
  }
  session(id: string): Session {
    const s = this.registry.sessions.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown session ${id}`);
    return s;
  }
  episodesOf(patientId: string): Episode[] {
    return this.registry.episodes.filter((e) => e.patientId === patientId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  sessionsOf(episodeId: string): Session[] {
    return this.registry.sessions.filter((s) => s.episodeId === episodeId).sort((a, b) => a.date.localeCompare(b.date));
  }

  private patientPath(p: Patient): string[] {
    return [p.folderName];
  }
  private episodePath(e: Episode): string[] {
    return [...this.patientPath(this.patient(e.patientId)), e.folderName];
  }
  private sessionPath(s: Session): string[] {
    return [...this.episodePath(this.episode(s.episodeId)), s.folderName];
  }

  private async writeJson(path: Path, data: unknown) {
    await this.deps.storage.writeBytes(path, utf8Encode(JSON.stringify(data, null, 2)), MIME.json);
  }

  // ---------- patients ----------

  /** Who could this scanned identity be? Drives the "same person?" prompt (PRD §4 step 1). */
  matchPatients(id: Pick<NewPatient, 'surname' | 'firstName' | 'dob'>): PatientMatch[] {
    const key = (s: string) => asciiSafe(s).toLowerCase();
    const name = `${key(id.surname)} ${key(id.firstName)}`;
    const out: PatientMatch[] = [];
    for (const p of this.registry.patients) {
      const pName = `${key(p.surname)} ${key(p.firstName)}`;
      if (pName === name && p.dob === id.dob) out.push({ patient: p, kind: 'exact' });
      else if (p.dob === id.dob && levenshtein(pName, name) <= 2) out.push({ patient: p, kind: 'probable-typo' });
      else if (pName === name) out.push({ patient: p, kind: 'same-name-other-dob' });
    }
    const order: Record<MatchKind, number> = { exact: 0, 'probable-typo': 1, 'same-name-other-dob': 2 };
    return out.sort((a, b) => order[a.kind] - order[b.kind]);
  }

  async createPatient(input: NewPatient): Promise<Patient> {
    if (!input.surname.trim() || !input.firstName.trim()) throw new Error('Naam en voornaam zijn verplicht');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) throw new Error('Geboortedatum moet JJJJ-MM-DD zijn');
    // "JANSSENS" typed or OCR'd in capitals is the same person as "Janssens".
    const surname = displayCase(input.surname);
    const firstName = displayCase(input.firstName);
    const base = patientFolderName({ surname, firstName, dob: input.dob });
    const same = this.registry.patients.find((p) => p.folderName.toLowerCase() === base.toLowerCase());
    const conflictingNumber = same?.patientNumber && input.patientNumber && same.patientNumber !== input.patientNumber;
    if (same && !conflictingNumber) {
      if (!same.patientNumber && input.patientNumber) {
        same.patientNumber = input.patientNumber;
        await this.writeJson([same.folderName, 'patient.json'], same);
      }
      return same;
    }
    const folderName = uniqueName(base, this.registry.patients.map((p) => p.folderName));
    const patient: Patient = {
      id: `p_${this.id()}`,
      surname,
      firstName,
      dob: input.dob,
      patientNumber: input.patientNumber,
      nationalNumber: input.nationalNumber,
      createdAt: this.now().toISOString(),
      consent: [],
      folderName,
    };
    await this.deps.storage.ensureDir([folderName]);
    await this.writeJson([folderName, 'patient.json'], patient);
    this.registry.patients.push(patient);
    return patient;
  }

  // ---------- consent (oral, one tap; PRD Q24) ----------

  async recordConsent(patientId: string, scope: ConsentScope, granted: boolean, askedBy = this.deps.operator) {
    const p = this.patient(patientId);
    p.consent.push({ scope, granted, at: this.now().toISOString(), askedBy, mode: 'oral' });
    await this.writeJson([p.folderName, 'patient.json'], p);
  }

  consentState(patientId: string): Partial<Record<ConsentScope, boolean>> {
    const out: Partial<Record<ConsentScope, boolean>> = {};
    for (const c of this.patient(patientId).consent) out[c.scope] = c.granted;
    return out;
  }

  /** Export gate (PRD §7): teaching and social exports need the matching consent. */
  canExport(patientId: string, purpose: 'teaching' | 'social'): boolean {
    return this.consentState(patientId)[purpose] === true;
  }

  // ---------- episodes & sessions ----------

  async startEpisode(patientId: string, region: Region, date = isoDate(this.now())): Promise<Episode> {
    const p = this.patient(patientId);
    const draft = { startedAt: date, procedure: null, region };
    const siblings = this.episodesOf(patientId).map((e) => e.folderName);
    const episode: Episode = {
      id: `e_${this.id()}`,
      patientId,
      region,
      procedure: null,
      secondary: [],
      surgeryDate: null,
      startedAt: date,
      folderName: uniqueName(episodeFolderName(draft), siblings),
    };
    this.registry.episodes.push(episode);
    await this.deps.storage.ensureDir([p.folderName, episode.folderName]);
    await this.writeJson([...this.episodePath(episode), 'episode.json'], episode);
    return episode;
  }

  async startSession(
    episodeId: string,
    visit: VisitType,
    opts: { interval?: string; date?: string } = {},
  ): Promise<Session> {
    const e = this.episode(episodeId);
    const date = opts.date ?? isoDate(this.now());
    const siblings = this.sessionsOf(episodeId).map((s) => s.folderName);
    const session: Session = {
      id: `s_${this.id()}`,
      episodeId,
      patientId: e.patientId,
      date,
      visit,
      interval: visit === 'postop' ? opts.interval : undefined,
      folderName: uniqueName(sessionFolderName({ date, visit, interval: opts.interval }), siblings),
      operator: this.deps.operator,
      device: this.deps.device,
      shots: [],
    };
    this.registry.sessions.push(session);
    const path = this.sessionPath(session);
    await this.deps.storage.ensureDir(path);
    await this.writeJson([...path, 'session.json'], session);
    return session;
  }

  shotXmp(session: Session, shot: Pick<Shot, 'view' | 'kind' | 'capturedAt' | 'viewSource' | 'geometry'>): ShotXmp {
    const e = this.episode(session.episodeId);
    return {
      patientId: session.patientId,
      episodeId: e.id,
      sessionId: session.id,
      view: shot.view,
      visit: session.visit,
      interval: session.interval,
      region: e.region,
      procedure: e.procedure,
      kind: shot.kind,
      capturedAt: shot.capturedAt,
      viewSource: shot.viewSource,
      geometry: shot.geometry,
    };
  }

  /** File one capture: name it, tag it, write it, record it (PRD §4 step 4). */
  async fileShot(
    sessionId: string,
    input: { bytes: Uint8Array; view: ViewId; viewSource: 'auto' | 'manual'; geometry?: CaptureGeometry; kind?: MediaKind },
  ): Promise<Shot> {
    const s = this.session(sessionId);
    const kind = input.kind ?? 'photo';
    const index = nextShotIndex(s.shots, input.view);
    const shot: Shot = {
      file: shotFileName(s, input.view, index, kind === 'clip' ? 'mp4' : 'jpg'),
      view: input.view,
      kind,
      index,
      capturedAt: this.now().toISOString(),
      geometry: input.geometry,
      viewSource: input.viewSource,
    };
    const bytes = kind === 'photo' ? injectXmp(input.bytes, buildXmp(this.shotXmp(s, shot))) : input.bytes;
    const path = this.sessionPath(s);
    await this.deps.storage.writeBytes([...path, shot.file], bytes, kind === 'photo' ? MIME.jpeg : MIME.mp4);
    s.shots.push(shot);
    await this.writeJson([...path, 'session.json'], s);
    return shot;
  }

  /** The keeper for a view; follow-ups match this one (guidance/targets.ts). */
  async setReferenceShot(sessionId: string, file: string) {
    const s = this.session(sessionId);
    const target = s.shots.find((x) => x.file === file);
    if (!target) throw new Error(`Unknown shot ${file}`);
    for (const x of s.shots) if (x.view === target.view) x.isReference = x.file === file;
    await this.writeJson([...this.sessionPath(s), 'session.json'], s);
  }

  async setNote(sessionId: string, note: string) {
    const s = this.session(sessionId);
    s.note = note.trim() || undefined;
    await this.writeJson([...this.sessionPath(s), 'session.json'], s);
  }

  /** Save a drawn-on copy next to the original; the original is never modified (PRD F8c). */
  async addAnnotation(sessionId: string, file: string, drawnJpeg: Uint8Array): Promise<string> {
    const s = this.session(sessionId);
    const shot = s.shots.find((x) => x.file === file);
    if (!shot) throw new Error(`Unknown shot ${file}`);
    const name = annotatedFileName(file);
    const tagged = injectXmp(drawnJpeg, buildXmp(this.shotXmp(s, shot)));
    const path = this.sessionPath(s);
    await this.deps.storage.writeBytes([...path, name], tagged, MIME.jpeg);
    shot.annotatedFile = name;
    await this.writeJson([...path, 'session.json'], s);
    return name;
  }

  // ---------- procedure, set once per episode, backfilled (PRD §6) ----------

  planProcedureBackfill(
    episodeId: string,
    procedure: string,
    opts: { secondary?: string[]; surgeryDate?: string | null } = {},
  ): { episode: Episode; ops: BackfillOp[] } {
    const old = this.episode(episodeId);
    const siblings = this.episodesOf(old.patientId).filter((e) => e.id !== episodeId).map((e) => e.folderName);
    const next: Episode = {
      ...old,
      procedure,
      secondary: opts.secondary ?? old.secondary,
      surgeryDate: opts.surgeryDate !== undefined ? opts.surgeryDate : old.surgeryDate,
    };
    next.folderName = uniqueName(episodeFolderName(next), siblings);

    const oldPath = this.episodePath(old);
    const ops: BackfillOp[] = [];
    // 1. Retag every photo (idempotent), at the current location.
    for (const s of this.sessionsOf(episodeId)) {
      for (const shot of s.shots.filter((x) => x.kind === 'photo')) {
        const meta: ShotXmp = { ...this.shotXmp(s, shot), procedure };
        ops.push({ type: 'rewriteXmp', path: [...oldPath, s.folderName, shot.file], meta });
        if (shot.annotatedFile) ops.push({ type: 'rewriteXmp', path: [...oldPath, s.folderName, shot.annotatedFile], meta });
      }
    }
    // 2. The episode record.
    ops.push({ type: 'writeJson', path: [...oldPath, 'episode.json'], data: next });
    // 3. Rename last: an interrupted run leaves a consistent, re-runnable state.
    if (next.folderName !== old.folderName) ops.push({ type: 'rename', path: oldPath, newName: next.folderName });
    return { episode: next, ops };
  }

  async setProcedure(
    episodeId: string,
    procedure: string,
    opts: { secondary?: string[]; surgeryDate?: string | null } = {},
  ): Promise<{ episode: Episode; retagged: number }> {
    const { episode, ops } = this.planProcedureBackfill(episodeId, procedure, opts);
    const st = this.deps.storage;
    let retagged = 0;
    for (const op of ops) {
      if (op.type === 'rewriteXmp') {
        const bytes = await st.readBytes(op.path);
        if (!bytes) throw new Error(`Foto niet gevonden: ${op.path.join('/')}`);
        await st.writeBytes(op.path, injectXmp(bytes, buildXmp(op.meta)), MIME.jpeg);
        retagged++;
      } else if (op.type === 'writeJson') {
        await this.writeJson(op.path, op.data);
      } else {
        await st.rename(op.path, op.newName);
      }
    }
    Object.assign(this.episode(episodeId), episode);
    return { episode: this.episode(episodeId), retagged };
  }
}

export function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
