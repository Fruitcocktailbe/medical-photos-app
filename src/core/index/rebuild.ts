/**
 * The folder is the database (PRD §5): rebuild the registry by scanning the
 * root. Used at start-up, by the tablet viewer, and after a phone swap.
 * Actual folder names on disk win over the folderName stored in JSON, so a
 * rename done outside the app (or interrupted) never orphans data.
 */
import { utf8Decode } from '../bytes';
import type { Episode, Patient, Registry, Session } from '../types';
import type { Path, StorageTarget } from '../storage/StorageTarget';

export interface RebuildResult {
  registry: Registry;
  problems: string[];
}

async function readJson<T>(storage: StorageTarget, path: Path): Promise<T | null> {
  const b = await storage.readBytes(path);
  if (!b) return null;
  try {
    return JSON.parse(utf8Decode(b)) as T;
  } catch {
    return null;
  }
}

export async function rebuildIndex(storage: StorageTarget): Promise<RebuildResult> {
  const registry: Registry = { patients: [], episodes: [], sessions: [] };
  const problems: string[] = [];
  const visible = (name: string) => !name.startsWith('.');

  for (const pDir of (await storage.list([])).filter((e) => e.isDirectory && visible(e.name))) {
    const patient = await readJson<Patient>(storage, [pDir.name, 'patient.json']);
    if (!patient) {
      problems.push(`${pDir.name}: geen leesbare patient.json`);
      continue;
    }
    registry.patients.push({ ...patient, folderName: pDir.name });

    for (const eDir of (await storage.list([pDir.name])).filter((e) => e.isDirectory && visible(e.name))) {
      const episode = await readJson<Episode>(storage, [pDir.name, eDir.name, 'episode.json']);
      if (!episode) {
        problems.push(`${pDir.name}/${eDir.name}: geen leesbare episode.json`);
        continue;
      }
      registry.episodes.push({ ...episode, patientId: patient.id, folderName: eDir.name });

      for (const sDir of (await storage.list([pDir.name, eDir.name])).filter((e) => e.isDirectory && visible(e.name))) {
        const sPath = [pDir.name, eDir.name, sDir.name];
        const session = await readJson<Session>(storage, [...sPath, 'session.json']);
        if (!session) {
          problems.push(`${sPath.join('/')}: geen leesbare session.json`);
          continue;
        }
        const files = new Set((await storage.list(sPath)).filter((e) => !e.isDirectory).map((e) => e.name));
        for (const s of session.shots) {
          if (!files.has(s.file)) problems.push(`${sPath.join('/')}/${s.file}: ontbreekt`);
        }
        registry.sessions.push({ ...session, episodeId: episode.id, patientId: patient.id, folderName: sDir.name });
      }
    }
  }
  return { registry, problems };
}

/** Reporting (PRD Q25): find cases by procedure, visit and interval. */
export function findCases(
  r: Registry,
  q: { procedure?: string; region?: string; visit?: Session['visit']; interval?: string },
): { patient: Patient; episode: Episode; session: Session }[] {
  const out: { patient: Patient; episode: Episode; session: Session }[] = [];
  for (const session of r.sessions) {
    const episode = r.episodes.find((e) => e.id === session.episodeId);
    const patient = r.patients.find((p) => p.id === session.patientId);
    if (!episode || !patient) continue;
    if (q.procedure && episode.procedure !== q.procedure) continue;
    if (q.region && episode.region !== q.region) continue;
    if (q.visit && session.visit !== q.visit) continue;
    if (q.interval && session.interval !== q.interval) continue;
    out.push({ patient, episode, session });
  }
  return out;
}

/** Personal outcome stats (PRD Q25): episodes per procedure. */
export function episodesPerProcedure(r: Registry): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of r.episodes) {
    const k = e.procedure ?? `(${e.region}, nog geen ingreep)`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
