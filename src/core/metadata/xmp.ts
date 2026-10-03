/**
 * Embed the shot's tags in the JPEG itself (PRD §5), so a photo that leaves
 * its folder (mail, slide, Lightroom) still says what it is, and a lost
 * session.json can be rebuilt from the images.
 *
 * Privacy: the packet carries OPAQUE ids only — never the patient's name or
 * date of birth. Exports for social media or teaching strip all metadata.
 */
import { utf8Decode, utf8Encode } from '../bytes';
import type { CaptureGeometry, MediaKind, VisitType } from '../types';

export const MPA_NS = 'https://ns.medical-photos.app/1.0/';
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

export interface ShotXmp {
  patientId: string;
  episodeId: string;
  sessionId: string;
  view: string;
  visit: VisitType;
  interval?: string;
  /** Treated areas as "<sub>" or "<sub>:<L|R|both>", e.g. ["breasts", "abdomen"], ["thigh:L"]. */
  areas: string[];
  /** Skin-spot location text, e.g. "linker onderarm, voorzijde" (no patient identifiers). */
  spot?: string;
  procedure: string | null;
  kind: MediaKind;
  capturedAt: string;
  viewSource: 'auto' | 'manual';
  geometry?: CaptureGeometry;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

export function subjectTags(m: ShotXmp): string[] {
  const tags = [`view:${m.view}`, `visit:${m.visit}`];
  for (const a of m.areas) tags.push(`area:${a.split(':')[0]}`);
  const side = m.view.split(':')[2] ?? m.areas.map((a) => a.split(':')[1]).find((x) => x === 'L' || x === 'R');
  if (side) tags.push(`side:${side}`);
  if (m.interval) tags.push(`interval:${m.interval}`);
  if (m.procedure) tags.push(`procedure:${m.procedure}`);
  return tags;
}

export function buildXmp(m: ShotXmp): string {
  const fields: [string, string | number | undefined][] = [
    ['patientId', m.patientId],
    ['episodeId', m.episodeId],
    ['sessionId', m.sessionId],
    ['view', m.view],
    ['visit', m.visit],
    ['interval', m.interval],
    ['areas', m.areas.join(',')],
    ['spot', m.spot],
    ['procedure', m.procedure ?? undefined],
    ['kind', m.kind],
    ['capturedAt', m.capturedAt],
    ['viewSource', m.viewSource],
  ];
  const g = m.geometry;
  if (g) {
    fields.push(
      ['yaw', round(g.yaw)], ['pitch', round(g.pitch)], ['roll', round(g.roll)],
      ['distance', round(g.distance, 4)], ['centerX', round(g.centerX, 4)], ['centerY', round(g.centerY, 4)],
      ['phonePitch', g.phonePitch == null ? undefined : round(g.phonePitch)],
      ['phoneRoll', g.phoneRoll == null ? undefined : round(g.phoneRoll)],
      ['geometrySource', g.source],
    );
  }
  const body = fields
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `   <mpa:${k}>${esc(String(v))}</mpa:${k}>`)
    .join('\n');
  const subjects = subjectTags(m).map((t) => `      <rdf:li>${esc(t)}</rdf:li>`).join('\n');
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    `  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:mpa="${MPA_NS}">`,
    '   <dc:subject>',
    '    <rdf:Bag>',
    subjects,
    '    </rdf:Bag>',
    '   </dc:subject>',
    body,
    '  </rdf:Description>',
    ' </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function parseXmp(xmp: string): Partial<ShotXmp> & { subjects: string[] } {
  const get = (k: string) => {
    const m = xmp.match(new RegExp(`<mpa:${k}>([^<]*)</mpa:${k}>`));
    return m ? unesc(m[1]) : undefined;
  };
  const num = (k: string) => (get(k) == null ? undefined : Number(get(k)));
  const subjects = [...xmp.matchAll(/<rdf:li>([^<]*)<\/rdf:li>/g)].map((m) => unesc(m[1]));
  const out: Partial<ShotXmp> & { subjects: string[] } = {
    subjects,
    patientId: get('patientId'),
    episodeId: get('episodeId'),
    sessionId: get('sessionId'),
    view: get('view'),
    visit: get('visit') as VisitType | undefined,
    interval: get('interval'),
    areas: get('areas')?.split(',').filter(Boolean),
    spot: get('spot'),
    procedure: get('procedure') ?? null,
    kind: get('kind') as MediaKind | undefined,
    capturedAt: get('capturedAt'),
    viewSource: get('viewSource') as 'auto' | 'manual' | undefined,
  };
  if (get('yaw') != null) {
    out.geometry = {
      yaw: num('yaw')!, pitch: num('pitch')!, roll: num('roll')!, distance: num('distance')!,
      centerX: num('centerX')!, centerY: num('centerY')!, phonePitch: num('phonePitch'), phoneRoll: num('phoneRoll'),
      source: (get('geometrySource') as CaptureGeometry['source']) ?? 'manual',
    };
  }
  return out;
}

interface Segment {
  marker: number;
  start: number;
  end: number; // exclusive
}

/** Walk the header segments up to Start-Of-Scan. Throws on non-JPEG input. */
function headerSegments(jpeg: Uint8Array): { segments: Segment[]; scanStart: number } {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG (missing SOI)');
  const segments: Segment[] = [];
  let i = 2;
  while (i < jpeg.length) {
    if (jpeg[i] !== 0xff) throw new Error(`Corrupt JPEG header at byte ${i}`);
    while (jpeg[i] === 0xff) i++; // fill bytes
    const marker = jpeg[i];
    const start = i - 1;
    i++;
    if (marker === 0xd9) return { segments, scanStart: start }; // EOI without scan
    if (marker >= 0xd0 && marker <= 0xd7) continue; // RSTn, no length
    const len = (jpeg[i] << 8) | jpeg[i + 1];
    const end = i + len;
    if (end > jpeg.length) throw new Error('Truncated JPEG segment');
    if (marker === 0xda) return { segments, scanStart: start }; // SOS: entropy data follows
    segments.push({ marker, start, end });
    i = end;
  }
  throw new Error('JPEG without Start-Of-Scan');
}

function isXmpSegment(jpeg: Uint8Array, s: Segment): boolean {
  if (s.marker !== 0xe1) return false;
  const header = utf8Encode(XMP_HEADER);
  const off = s.start + 4;
  for (let k = 0; k < header.length; k++) if (jpeg[off + k] !== header[k]) return false;
  return true;
}

/** Insert (or replace) the XMP packet. Places it after the leading APP0/APP1-EXIF segments. */
export function injectXmp(jpeg: Uint8Array, xmp: string): Uint8Array {
  const { segments } = headerSegments(jpeg);
  const payload = utf8Encode(XMP_HEADER + xmp);
  if (payload.length + 2 > 0xffff) throw new Error('XMP packet too large for one APP1 segment');
  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg[2] = ((payload.length + 2) >> 8) & 0xff;
  seg[3] = (payload.length + 2) & 0xff;
  seg.set(payload, 4);

  const xmpSegs = segments.filter((s) => isXmpSegment(jpeg, s));
  // Insertion point: after the run of APP0 / non-XMP APP1 at the start.
  let insertAt = 2;
  for (const s of segments) {
    if ((s.marker === 0xe0 || s.marker === 0xe1) && !isXmpSegment(jpeg, s)) insertAt = s.end;
    else if (!isXmpSegment(jpeg, s)) break;
  }
  const parts: Uint8Array[] = [];
  let cursor = 0;
  const cut = (until: number) => {
    // copy [cursor, until) skipping old XMP segments
    for (const x of xmpSegs) {
      if (x.start >= cursor && x.end <= until) {
        parts.push(jpeg.subarray(cursor, x.start));
        cursor = x.end;
      }
    }
    parts.push(jpeg.subarray(cursor, until));
    cursor = until;
  };
  cut(insertAt);
  parts.push(seg);
  cut(jpeg.length);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function readXmp(jpeg: Uint8Array): string | null {
  const { segments } = headerSegments(jpeg);
  const s = segments.find((x) => isXmpSegment(jpeg, x));
  if (!s) return null;
  const headerLen = utf8Encode(XMP_HEADER).length;
  return utf8Decode(jpeg.subarray(s.start + 4 + headerLen, s.end));
}
