/**
 * Visit-level helpers for the flow (docs/ux-flow.md): the proposed visit,
 * the post-op interval, session progress and the recent-patients list.
 */
import type { Episode, Patient, Registry, Session, ViewId, VisitType } from './types';

export const INTERVAL_PRESETS = [
  { id: '1w', days: 7, label: '1 week' },
  { id: '6w', days: 42, label: '6 weken' },
  { id: '3m', days: 91, label: '3 maanden' },
  { id: '6m', days: 182, label: '6 maanden' },
  { id: '1y', days: 365, label: '1 jaar' },
] as const;

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Exact time since surgery in clinic language: "6 weken + 2 dagen", "4 dagen", "1 jaar + 3 weken". */
export function sinceLabel(days: number): string {
  if (days < 7) return `${days} ${days === 1 ? 'dag' : 'dagen'}`;
  if (days < 365) {
    const w = Math.floor(days / 7);
    const d = days % 7;
    return `${w} ${w === 1 ? 'week' : 'weken'}${d ? ` + ${d} ${d === 1 ? 'dag' : 'dagen'}` : ''}`;
  }
  const y = Math.floor(days / 365);
  const w = Math.floor((days % 365) / 7);
  return `${y} jaar${w ? ` + ${w} ${w === 1 ? 'week' : 'weken'}` : ''}`;
}

/** Nearest post-op preset; beyond ~1.5 year: whole years ("2y"). */
export function intervalFor(surgeryDate: string, date: string): { days: number; preset: string; label: string } {
  const days = daysBetween(surgeryDate, date);
  let preset: string;
  if (days > 547) preset = `${Math.round(days / 365)}y`;
  else {
    preset = INTERVAL_PRESETS.reduce((best, p) => (Math.abs(p.days - days) < Math.abs(best.days - days) ? p : best)).id;
  }
  return { days, preset, label: sinceLabel(Math.max(days, 0)) };
}

export interface VisitProposal {
  visit: VisitType;
  interval?: string;
  /** Big-button text, Dutch. */
  label: string;
}

const VISIT_LABEL: Record<VisitType, string> = {
  consult: 'Consult',
  preop: 'Pre-op',
  intraop: 'Intra-op',
  postop: 'Post-op',
  other: 'Andere',
};

export function visitLabel(visit: VisitType, interval?: string): string {
  if (visit !== 'postop' || !interval) return VISIT_LABEL[visit];
  const preset = INTERVAL_PRESETS.find((p) => p.id === interval);
  return `Post-op ${preset ? preset.label : interval}`;
}

/** The one-tap proposal on the Visit screen (docs/ux-flow.md › Visit). */
export function proposeVisit(episode: Episode, sessions: Session[], today: string): VisitProposal {
  if (episode.surgeryDate) {
    if (episode.surgeryDate === today) return { visit: 'intraop', label: 'Intra-op (vandaag geopereerd)' };
    if (episode.surgeryDate < today) {
      const { preset, label } = intervalFor(episode.surgeryDate, today);
      return { visit: 'postop', interval: preset, label: `${visitLabel('postop', preset)} · ${label}` };
    }
    return { visit: 'preop', label: 'Pre-op' };
  }
  const own = sessions.filter((s) => s.episodeId === episode.id);
  return own.length > 0 ? { visit: 'preop', label: 'Pre-op' } : { visit: 'consult', label: 'Consult' };
}

export interface ViewProgress {
  view: ViewId;
  shots: number;
}

/** Per view of the set: how many photos exist. Extra views (outside the set) are appended. */
export function sessionProgress(session: Session, viewSetIds: ViewId[]): { planned: ViewProgress[]; extra: ViewProgress[]; missing: ViewId[] } {
  const count = (v: ViewId) => session.shots.filter((s) => s.view === v).length;
  const planned = viewSetIds.map((view) => ({ view, shots: count(view) }));
  const extraIds = [...new Set(session.shots.map((s) => s.view))].filter((v) => !viewSetIds.includes(v));
  return { planned, extra: extraIds.map((view) => ({ view, shots: count(view) })), missing: planned.filter((p) => p.shots === 0).map((p) => p.view) };
}

/** Next view to shoot after `current`: the first missing one after it, wrapping; null when all are done. */
export function nextMissingView(viewSetIds: ViewId[], session: Session, current: ViewId): ViewId | null {
  const done = new Set(session.shots.map((s) => s.view));
  const start = Math.max(viewSetIds.indexOf(current), -1);
  for (let k = 1; k <= viewSetIds.length; k++) {
    const v = viewSetIds[(start + k) % viewSetIds.length];
    if (!done.has(v)) return v;
  }
  return null;
}

export interface RecentPatient {
  patient: Patient;
  lastDate: string;
  episode?: Episode;
  session?: Session;
}

/** Patients ordered by their latest session (or creation), newest first. */
export function recentPatients(r: Registry, limit = 8): RecentPatient[] {
  const out: RecentPatient[] = r.patients.map((patient) => {
    const sessions = r.sessions.filter((s) => s.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date));
    const session = sessions[0];
    const episode = session ? r.episodes.find((e) => e.id === session.episodeId) : undefined;
    return { patient, lastDate: session?.date ?? patient.createdAt.slice(0, 10), episode, session };
  });
  return out.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.patient.createdAt.localeCompare(a.patient.createdAt)).slice(0, limit);
}

/** Procedures used most often across all treatments: the picker's favourites. */
export function favouriteProcedures(r: Registry, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const e of r.episodes) if (e.procedure) counts.set(e.procedure, (counts.get(e.procedure) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}
