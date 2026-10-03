/**
 * Belgian national register number (rijksregisternummer / INSZ / NISS):
 * YY.MM.DD-CCC.KK. The check digits KK = 97 - (first 9 digits mod 97); for
 * people born from 2000 on, the number 2 is prefixed before taking mod 97.
 * Bis numbers add 20 or 40 to the month. Month or day 0 means "unknown".
 *
 * Used as an independent cross-check on the OCR'd date of birth: if a label
 * carries a valid national number whose birth date disagrees with the date we
 * read, the confirm screen blocks.
 */

export interface NationalNumberInfo {
  digits: string;
  /** YYYY-MM-DD, or null when the number encodes an unknown month/day. */
  dob: string | null;
  sex: 'M' | 'F' | null;
  bis: boolean;
}

function check(nine: string, prefix2000: boolean): number {
  const n = BigInt((prefix2000 ? '2' : '') + nine);
  const r = Number(n % 97n);
  return 97 - r;
}

export function parseNationalNumber(raw: string): NationalNumberInfo | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  const nine = digits.slice(0, 9);
  const kk = Number(digits.slice(9));
  let century: 1900 | 2000;
  if (check(nine, false) === kk) century = 1900;
  else if (check(nine, true) === kk) century = 2000;
  else return null;

  const yy = Number(digits.slice(0, 2));
  let mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const counter = Number(digits.slice(6, 9));
  let bis = false;
  let sexKnown = true;
  if (mm >= 40) {
    mm -= 40;
    bis = true;
  } else if (mm >= 20) {
    mm -= 20;
    bis = true;
    sexKnown = false;
  }
  if (mm > 12 || dd > 31) return null;

  const year = century + yy;
  let dob: string | null = null;
  if (mm > 0 && dd > 0 && isRealDate(year, mm, dd)) {
    dob = `${year}-${pad(mm)}-${pad(dd)}`;
  }
  const sex = sexKnown ? (counter % 2 === 1 ? 'M' : 'F') : null;
  return { digits, dob, sex, bis };
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
