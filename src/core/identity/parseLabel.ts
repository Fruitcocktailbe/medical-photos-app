/**
 * Turn OCR text from a hospital sticker label, a handwritten sheet or an
 * agenda screen into a proposed patient identity (PRD §4 step 1).
 *
 * The NAME is the key (Jeroen: "barcode is just a number, name should be read
 * and used"). Barcodes and national numbers are cross-checks, not the key.
 *
 * Output is a proposal for the confirm screen, never a silent decision:
 * - `conflicts` non-empty  → the confirm button stays disabled until edited.
 * - `confidence` drives how loudly the UI asks the user to check.
 */
import { isRealDate, pad, parseNationalNumber } from './nationalNumber';

export interface LabelInput {
  /** OCR lines in reading order. */
  lines: string[];
  /** Raw barcode/QR payloads, if any were read. */
  barcodes?: string[];
  /** Reference "now" for plausibility checks (tests inject it). */
  today?: Date;
}

export type NameSource = 'keyword' | 'split-keywords' | 'comma' | 'caps-pattern' | 'assumed-order';

export interface LabelParse {
  surname?: string;
  firstName?: string;
  /** YYYY-MM-DD */
  dob?: string;
  patientNumber?: string;
  nationalNumber?: string;
  sex?: 'M' | 'F';
  nameSource?: NameSource;
  dobSource?: 'keyword' | 'national-number' | 'single-date' | 'earliest-date';
  confidence: 'high' | 'medium' | 'low';
  /** Things the user should double-check (shown, not blocking). */
  warnings: string[];
  /** Contradictions between sources (blocking until the user edits). */
  conflicts: string[];
}

const PARTICLES = new Set([
  'van', 'de', 'der', 'den', 'vanden', 'vander', 'vande', 'ver', 'le', 'la', 'du', 'des',
  "d'", 'di', 'da', 'del', 'della', 'ten', 'ter', "'t", 'op', 'in', 'von', 'zu',
]);

const HONORIFIC = /^(dhr|mevr|mevrouw|meneer|mijnheer|mr|mrs|ms|mme|madame|mlle|mademoiselle|monsieur|m|mw|mej|juffr)\.?\s+/i;

const NOT_A_NAME = /\b(uz|az|chu|chirec|ziekenhuis|hospital|h[oô]pital|kliniek|clinique|campus|dienst|service|afdeling|kamer|room|bed|consult|raadpleging|opname|admission|plastische|heelkunde|chirurgie|dr|prof|arts|m[ée]decin|straat|laan|lei|plein|rue|avenue|bus|tel|gsm|ziekenfonds|mutualit[ée]|insz|niss|rrn)\b\.?/i;

const NAME_KEYWORD = /^(?:naam(?:\s*(?:en|\+)\s*voornaam)?|nom(?:\s*et\s*pr[ée]nom)?|name|pati[eë]nt(?:e)?|patient(?:e)?)\s*[:.]\s*(.+)$/i;
const SURNAME_KEYWORD = /^(?:achternaam|familienaam|nom\s*de\s*famille|surname|last\s*name)\s*[:.]\s*(.+)$/i;
const FIRSTNAME_KEYWORD = /^(?:voornaam|pr[ée]nom|first\s*name|given\s*name)\s*[:.]\s*(.+)$/i;

const DOB_KEYWORD = /(geb(?:oren|oortedatum)?\.?|°|n[ée]e?\s*le|n[ée]e?|date\s*de\s*naissance|naissance|dob|d\.o\.b\.|birth|date\s*of\s*birth)/i;

const PATNR_KEYWORD = /(?:pat(?:i[eë]nt)?\.?\s*(?:nr|nummer|n°|no|id)?\.?|pid|ipp|dossier(?:nr|nummer)?|ead|mrn|n°\s*patient|eadnr)\s*[:#.]?\s*([A-Z]{0,3}\d[\dA-Z-]{3,15})/i;

const NATNR_PATTERN = /\b\d{2}[.\s]?\d{2}[.\s]?\d{2}[-.\s]?\d{3}[.\s]?\d{2}\b/g;

interface FoundDate {
  iso: string;
  lineIndex: number;
  keyword: boolean;
  twoDigitYear: boolean;
  /** Character span in the line, to avoid reusing these digits elsewhere. */
  start: number;
  end: number;
}

export function parseLabel(input: LabelInput): LabelParse {
  const today = input.today ?? new Date();
  const lines = input.lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const warnings: string[] = [];
  const conflicts: string[] = [];
  const out: LabelParse = { confidence: 'low', warnings, conflicts };

  // 1. National number (from text or barcodes) — strongest DOB evidence.
  const natSpans: { line: number; start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(NATNR_PATTERN)) {
      const info = parseNationalNumber(m[0]);
      if (info && !out.nationalNumber) {
        out.nationalNumber = info.digits;
        if (info.sex) out.sex = info.sex;
      }
      if (info) natSpans.push({ line: i, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  }
  for (const b of input.barcodes ?? []) {
    const info = parseNationalNumber(b);
    if (info && !out.nationalNumber) {
      out.nationalNumber = info.digits;
      if (info.sex) out.sex = info.sex;
    }
  }
  const natInfo = out.nationalNumber ? parseNationalNumber(out.nationalNumber) : null;

  // 2. Dates.
  const dates = findDates(lines, today).filter(
    (d) => !natSpans.some((s) => s.line === d.lineIndex && d.start < s.end && d.end > s.start),
  );
  const plausible = dates.filter((d) => isPlausibleDob(d.iso, today));
  const kw = plausible.find((d) => d.keyword);
  if (kw) {
    out.dob = kw.iso;
    out.dobSource = 'keyword';
  } else if (natInfo?.dob) {
    out.dob = natInfo.dob;
    out.dobSource = 'national-number';
  } else if (plausible.length === 1) {
    out.dob = plausible[0].iso;
    out.dobSource = 'single-date';
  } else if (plausible.length > 1) {
    const earliest = [...plausible].sort((a, b) => a.iso.localeCompare(b.iso))[0];
    out.dob = earliest.iso;
    out.dobSource = 'earliest-date';
    warnings.push('Meerdere datums gevonden; de oudste is als geboortedatum genomen.');
  }
  const chosen = plausible.find((d) => d.iso === out.dob);
  if (chosen?.twoDigitYear) warnings.push('Geboortejaar met twee cijfers gelezen; eeuw gecontroleerd?');
  if (natInfo?.dob && out.dob && natInfo.dob !== out.dob) {
    conflicts.push(`Rijksregisternummer geeft geboortedatum ${natInfo.dob}, gelezen datum is ${out.dob}.`);
  }

  // 3. Patient number.
  for (const line of lines) {
    const m = line.match(PATNR_KEYWORD);
    if (m) {
      const val = m[1].replace(/[^\dA-Z-]/gi, '');
      if (val.replace(/\D/g, '') !== out.nationalNumber) {
        out.patientNumber = val;
        break;
      }
    }
  }
  const numericBarcodes = (input.barcodes ?? [])
    .map((b) => b.trim())
    .filter((b) => /^[A-Z]{0,3}\d{5,15}$/i.test(b) && b.replace(/\D/g, '') !== out.nationalNumber);
  if (!out.patientNumber && numericBarcodes.length > 0) {
    out.patientNumber = numericBarcodes[0];
  } else if (out.patientNumber && numericBarcodes.length > 0 && !numericBarcodes.includes(out.patientNumber)) {
    conflicts.push(`Barcode (${numericBarcodes[0]}) verschilt van het gelezen patiëntnummer (${out.patientNumber}).`);
  }

  // 4. Name.
  const name = findName(lines);
  if (name) {
    out.surname = name.surname;
    out.firstName = name.firstName;
    out.nameSource = name.source;
    if (name.orderAssumed) {
      warnings.push('Volgorde achternaam/voornaam aangenomen (achternaam eerst). Klopt dat?');
    }
  }

  // 5. Confidence.
  const strongName = name != null && !name.orderAssumed;
  const strongDob = out.dobSource === 'keyword' || out.dobSource === 'national-number' ||
    (natInfo?.dob != null && natInfo.dob === out.dob);
  if (conflicts.length > 0 || !out.surname || !out.firstName || !out.dob) {
    out.confidence = 'low';
  } else if (strongName && strongDob) {
    out.confidence = 'high';
  } else {
    out.confidence = 'medium';
  }
  if (!out.surname || !out.firstName) warnings.push('Geen volledige naam gevonden; typ of dicteer.');
  if (!out.dob) warnings.push('Geen geboortedatum gevonden.');
  return out;
}

function findDates(lines: string[], today: Date): FoundDate[] {
  const found: FoundDate[] = [];
  const pivot = today.getFullYear() % 100;
  lines.forEach((line, lineIndex) => {
    const keyword = DOB_KEYWORD.test(line);
    const push = (y: number, m: number, d: number, two: boolean, start: number, len: number) => {
      if (isRealDate(y, m, d)) {
        found.push({ iso: `${y}-${pad(m)}-${pad(d)}`, lineIndex, keyword, twoDigitYear: two, start, end: start + len });
      }
    };
    for (const m of line.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
      push(+m[1], +m[2], +m[3], false, m.index ?? 0, m[0].length);
    }
    for (const m of line.matchAll(/(?<![\d.\-/])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d./-])/g)) {
      const yRaw = m[3];
      const two = yRaw.length === 2;
      const y = two ? (+yRaw > pivot ? 1900 + +yRaw : 2000 + +yRaw) : +yRaw;
      push(y, +m[2], +m[1], two, m.index ?? 0, m[0].length);
    }
  });
  return found;
}

function isPlausibleDob(iso: string, today: Date): boolean {
  const t = isoToday(today);
  if (iso > t) return false;
  const year = Number(iso.slice(0, 4));
  return today.getFullYear() - year <= 115;
}

function isoToday(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface NameHit {
  surname: string;
  firstName: string;
  source: NameSource;
  /** True when nothing in the text told us which part is the surname. */
  orderAssumed: boolean;
  rank: number;
}

const SOURCE_RANK: Record<NameSource, number> = {
  'split-keywords': 5,
  keyword: 4,
  comma: 3,
  'caps-pattern': 2,
  'assumed-order': 1,
};

function findName(lines: string[]): NameHit | null {
  let surnameKw: string | undefined;
  let firstKw: string | undefined;
  const hits: NameHit[] = [];

  lines.forEach((raw, i) => {
    const sk = raw.match(SURNAME_KEYWORD);
    if (sk) surnameKw = cleanNamePart(sk[1]);
    const fk = raw.match(FIRSTNAME_KEYWORD);
    if (fk) firstKw = cleanNamePart(fk[1]);
    if (sk || fk) return;

    const kw = raw.match(NAME_KEYWORD);
    if (kw) {
      const split = splitName(kw[1]);
      if (split) hits.push({ ...split, source: split.source === 'assumed-order' ? 'keyword' : split.source, orderAssumed: split.source === 'assumed-order', rank: 100 - i });
      return;
    }
    if (NOT_A_NAME.test(raw)) return;
    const split = splitName(raw);
    if (split) hits.push({ ...split, orderAssumed: split.source === 'assumed-order', rank: 100 - i });
  });

  if (surnameKw && firstKw) {
    return { surname: displayCase(surnameKw), firstName: displayCase(firstKw), source: 'split-keywords', orderAssumed: false, rank: 999 };
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => SOURCE_RANK[b.source] - SOURCE_RANK[a.source] || b.rank - a.rank);
  return hits[0];
}

function cleanNamePart(s: string): string {
  return s
    .replace(HONORIFIC, '')
    .replace(/\(\s*[MVF]\s*\)/g, '')
    .replace(/[^\p{L}\s'’\-,]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split one line into surname + first name, or null if it does not look like a name. */
function splitName(raw: string): Omit<NameHit, 'rank' | 'orderAssumed'> | null {
  let line = raw.replace(HONORIFIC, '');
  // Drop trailing sex markers ("JANSSENS Marie V", "(F)").
  line = line.replace(/\(\s*[MVF]\s*\)/g, ' ').replace(/\s+[MVF]$/, '');
  // Names contain only letters, spaces, hyphens, apostrophes and a comma.
  if (/[^\p{L}\s'’\-,.]/u.test(line)) return null;
  line = line.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();

  if (line.includes(',')) {
    const [s, f] = line.split(',', 2).map((x) => x.trim());
    if (!s || !f || !isNameish(s) || !isNameish(f)) return null;
    return { surname: displayCase(s), firstName: displayCase(f), source: 'comma' };
  }

  const tokens = line.split(' ').filter(Boolean);
  if (tokens.length < 2 || tokens.length > 6) return null;
  if (!tokens.every((t) => /^[\p{L}'’-]+$/u.test(t))) return null;
  if (tokens.every((t) => t === t.toLowerCase()) && !tokens.some((t) => t.length > 1)) return null;

  const isCaps = (t: string) => t.length >= 2 && t === t.toUpperCase() && t !== t.toLowerCase();
  const isParticle = (t: string) => PARTICLES.has(t.toLowerCase());
  const allCaps = tokens.every((t) => isCaps(t) || isParticle(t));

  if (!allCaps) {
    // "VAN DEN BROECK Pieter-Jan": leading caps run (incl. particles) = surname.
    let k = 0;
    while (k < tokens.length && (isCaps(tokens[k]) || (isParticle(tokens[k]) && tokens[k] === tokens[k].toUpperCase()))) k++;
    if (k > 0 && k < tokens.length && tokens.slice(0, k).some(isCaps)) {
      return {
        surname: displayCase(tokens.slice(0, k).join(' ')),
        firstName: displayCase(tokens.slice(k).join(' ')),
        source: 'caps-pattern',
      };
    }
    // "Marie DUPONT": trailing caps run = surname (French order).
    let j = tokens.length;
    while (j > 0 && (isCaps(tokens[j - 1]) || isParticle(tokens[j - 1]))) j--;
    if (j > 0 && j < tokens.length && tokens.slice(j).some(isCaps)) {
      return {
        surname: displayCase(tokens.slice(j).join(' ')),
        firstName: displayCase(tokens.slice(0, j).join(' ')),
        source: 'caps-pattern',
      };
    }
  }

  // No case signal: Belgian label convention is surname first.
  // Leading particles belong to the surname: "VAN DER ELST JAN" → Van der Elst / Jan.
  let s = 0;
  while (s < tokens.length - 2 && isParticle(tokens[s])) s++;
  const surnameEnd = s + 1;
  if (surnameEnd >= tokens.length) return null;
  return {
    surname: displayCase(tokens.slice(0, surnameEnd).join(' ')),
    firstName: displayCase(tokens.slice(surnameEnd).join(' ')),
    source: 'assumed-order',
  };
}

function isNameish(s: string): boolean {
  return /^[\p{L}'’\- ]+$/u.test(s) && /\p{L}{2,}/u.test(s);
}

/**
 * Display case: ALL-CAPS or all-lowercase input is title-cased; mixed case is
 * kept as written. Belgian particle convention: the first particle is
 * capitalised, following ones lower-case ("Van den Broeck", "De Smet").
 */
export function displayCase(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, ' ');
  const hasLower = /\p{Ll}/u.test(trimmed);
  const hasUpper = /\p{Lu}/u.test(trimmed);
  if (hasLower && hasUpper) return trimmed;
  return trimmed
    .split(' ')
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && PARTICLES.has(lower)) return lower;
      return lower.replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
    })
    .join(' ');
}
