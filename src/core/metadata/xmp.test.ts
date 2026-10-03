import { describe, expect, it } from 'vitest';
import { buildXmp, injectXmp, parseXmp, readXmp, type ShotXmp } from './xmp';
import { utf8Decode, utf8Encode } from '../bytes';

/** Minimal valid JPEG skeleton: SOI, APP0 JFIF, APP1 Exif, DQT, SOS, data, EOI. */
function fakeJpeg(): Uint8Array {
  const seg = (marker: number, body: number[]) => [0xff, marker, ((body.length + 2) >> 8) & 0xff, (body.length + 2) & 0xff, ...body];
  return Uint8Array.from([
    0xff, 0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3, 4]),
    ...seg(0xdb, [0, 1, 2, 3]),
    ...seg(0xda, [1, 2, 3]),
    0x11, 0x22, 0xff, 0x00, 0x33,
    0xff, 0xd9,
  ]);
}

const meta: ShotXmp = {
  patientId: 'p_abc', episodeId: 'e_1', sessionId: 's_1', view: 'lateral-L', visit: 'postop', interval: '6w',
  region: 'breast', procedure: 'breast-augmentation', kind: 'photo', capturedAt: '2026-11-14T10:00:00.000Z', viewSource: 'auto',
  geometry: { yaw: 88.26, pitch: 0, roll: 1.04, distance: 0.55123, centerX: 0.012, centerY: -0.03, phonePitch: 1.2, source: 'pose' },
};

describe('xmp', () => {
  it('round-trips tags and capture geometry through a JPEG', () => {
    const out = injectXmp(fakeJpeg(), buildXmp(meta));
    const parsed = parseXmp(readXmp(out)!);
    expect(parsed.subjects).toEqual(['view:lateral-L', 'visit:postop', 'region:breast', 'interval:6w', 'procedure:breast-augmentation']);
    expect(parsed).toMatchObject({ patientId: 'p_abc', sessionId: 's_1', procedure: 'breast-augmentation', viewSource: 'auto' });
    expect(parsed.geometry).toMatchObject({ yaw: 88.3, roll: 1, distance: 0.5512, phonePitch: 1.2, source: 'pose' });
    expect(parsed.geometry?.phoneRoll).toBeUndefined();
  });

  it('keeps the image data intact and places XMP after APP0/EXIF', () => {
    const src = fakeJpeg();
    const out = injectXmp(src, buildXmp(meta));
    expect(Array.from(out.slice(-9))).toEqual(Array.from(src.slice(-9)));
    // APP0 at 2, EXIF APP1 next, then our XMP APP1.
    const app0Len = (src[4] << 8) | src[5];
    const exifStart = 2 + 2 + app0Len;
    const exifLen = (src[exifStart + 2] << 8) | src[exifStart + 3];
    const xmpStart = exifStart + 2 + exifLen;
    expect(out[xmpStart]).toBe(0xff);
    expect(out[xmpStart + 1]).toBe(0xe1);
    expect(utf8Decode(out.subarray(xmpStart + 4, xmpStart + 32))).toBe('http://ns.adobe.com/xap/1.0/');
  });

  it('replaces an existing packet instead of stacking (procedure backfill)', () => {
    const once = injectXmp(fakeJpeg(), buildXmp({ ...meta, procedure: null }));
    const twice = injectXmp(once, buildXmp(meta));
    const latin1 = (x: Uint8Array) => Array.from(x, (c) => String.fromCharCode(c)).join('');
    const count = (x: Uint8Array) => (latin1(x).match(/x:xmpmeta xmlns/g) ?? []).length;
    expect(count(twice)).toBe(1);
    expect(parseXmp(readXmp(twice)!).procedure).toBe('breast-augmentation');
    expect(parseXmp(readXmp(once)!).procedure).toBeNull();
  });

  it('never contains a name or birth date field', () => {
    const x = buildXmp(meta);
    expect(x).not.toMatch(/surname|firstName|<mpa:dob|birth|Janssens/i);
    expect(x).not.toMatch(/\d{4}-\d{2}-\d{2}(?!T)/); // no bare dates (DOB); capture timestamp is ISO with T
  });

  it('escapes XML-special characters', () => {
    const x = buildXmp({ ...meta, view: 'a<b&c' });
    expect(parseXmp(x).view).toBe('a<b&c');
  });

  it('rejects non-JPEG input', () => {
    expect(() => injectXmp(Uint8Array.from([1, 2, 3]), 'x')).toThrow(/Not a JPEG/);
  });

  it('utf8 round-trips accents and emoji', () => {
    const s = 'Élise D’Hondt ✓ 🙂';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
  });
});
