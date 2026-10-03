/**
 * Folder and file names (PRD §5). Names are ASCII-safe so they survive every
 * storage provider (SAF, Drive, Nextcloud, SharePoint) and every OS.
 *
 *   <root>/Janssens_Marie_1985-03-12/
 *            2026-10_breast-augmentation/          episode (region until procedure is set)
 *              2026-10-03_preop/                   session
 *                20261003_preop_AP_01.jpg
 *                20261003_preop_AP_01.annot.jpg    drawn-on copy
 */
import type { Episode, Patient, Session, Shot, ViewId, VisitType } from './types';

/** Strip diacritics, keep letters/digits, spaces and apostrophes become '-' or vanish. */
export function asciiSafe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function patientFolderName(p: Pick<Patient, 'surname' | 'firstName' | 'dob'>): string {
  return `${asciiSafe(p.surname)}_${asciiSafe(p.firstName)}_${p.dob}`;
}

export function episodeFolderName(e: Pick<Episode, 'startedAt' | 'procedure' | 'region'>): string {
  return `${e.startedAt.slice(0, 7)}_${asciiSafe(e.procedure ?? e.region)}`;
}

export function visitTag(visit: VisitType, interval?: string): string {
  return interval && visit === 'postop' ? `${visit}-${asciiSafe(interval)}` : visit;
}

export function sessionFolderName(s: Pick<Session, 'date' | 'visit' | 'interval'>): string {
  return `${s.date}_${visitTag(s.visit, s.interval)}`;
}

export function nextShotIndex(shots: Shot[], view: ViewId): number {
  return shots.filter((x) => x.view === view).reduce((max, x) => Math.max(max, x.index), 0) + 1;
}

export function shotFileName(
  s: Pick<Session, 'date' | 'visit' | 'interval'>,
  view: ViewId,
  index: number,
  ext: 'jpg' | 'mp4' = 'jpg',
): string {
  return `${s.date.replace(/-/g, '')}_${visitTag(s.visit, s.interval)}_${asciiSafe(view)}_${String(index).padStart(2, '0')}.${ext}`;
}

export function annotatedFileName(file: string): string {
  return file.replace(/\.(jpg|jpeg)$/i, '.annot.$1');
}
