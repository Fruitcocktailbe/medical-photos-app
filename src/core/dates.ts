/** Dates as typed in a Belgian clinic: dd/mm/jjjj in the UI, ISO (JJJJ-MM-DD) everywhere else. */
import { isRealDate, pad } from './identity/nationalNumber';

/** Accepts 12/03/1985, 12-3-1985, 12.03.85, 12031985 or ISO. Two-digit years pivot on `today`. Null if invalid. */
export function parseDutchDate(input: string, today = new Date()): string | null {
  const t = input.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return isRealDate(+m[1], +m[2], +m[3]) ? t : null;
  m = t.match(/^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{4}|\d{2})$/) ?? t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  let y = +m[3];
  if (m[3].length === 2) y = y > today.getFullYear() % 100 ? 1900 + y : 2000 + y;
  const mo = +m[2];
  const d = +m[1];
  return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

export function formatDutchDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
