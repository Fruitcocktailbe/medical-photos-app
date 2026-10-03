/**
 * Body-map geometry (anatomy plan A1/A5): front and back silhouettes in a
 * 0..100 × 0..200 viewBox, tappable zones, the sub-areas each zone offers,
 * and readable spot labels. Pure, so hit-testing and side logic are tested;
 * the screen only draws these shapes.
 *
 * FRONT view: the patient faces you, so the patient's LEFT is on the RIGHT of
 * the screen. BACK view: the patient's left is on the left of the screen.
 */
export type MapSide = 'front' | 'back';

export interface Zone {
  id: string;
  map: MapSide;
  /** Dutch noun used in spot labels, without side ("onderarm"). */
  noun: string;
  side?: 'L' | 'R';
  shape: { kind: 'rect'; x: number; y: number; w: number; h: number } | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };
  /** Sub-area ids offered when this zone is tapped (skin spots are always added). */
  subs: string[];
}

const rect = (x: number, y: number, w: number, h: number) => ({ kind: 'rect' as const, x, y, w, h });

/** Limb zones mirrored per side; `screenLeftSide` is the patient's side drawn on the screen's left. */
function limbs(map: MapSide, screenLeftSide: 'L' | 'R', nerve: boolean): Zone[] {
  const other: 'L' | 'R' = screenLeftSide === 'L' ? 'R' : 'L';
  const pairs: [string, string, (x: number) => Zone['shape'], string[]][] = [
    ['upperarm', 'bovenarm', (x) => rect(x, 36, 11, 28), ['upperarm', ...(nerve ? ['nerve-plexus', 'nerve-arm'] : [])]],
    ['forearm', 'onderarm', (x) => rect(x, 64, 11, 26), ['forearm', ...(nerve ? ['nerve-arm', 'nerve-hand'] : [])]],
    ['hand', 'hand', (x) => rect(x, 90, 11, 14), ['hand', ...(nerve ? ['nerve-hand'] : [])]],
    ['thigh', 'dij', (x) => rect(x, 87, 12, 34), ['thigh', ...(nerve ? ['nerve-leg'] : [])]],
    ['leg', 'knie en onderbeen', (x) => rect(x, 121, 11, 45), ['leg', ...(nerve ? ['nerve-leg'] : [])]],
    ['foot', 'voet', (x) => rect(x, 166, 13, 10), ['foot', ...(nerve ? ['nerve-foot'] : [])]],
  ];
  const leftX: Record<string, number> = { upperarm: 22, forearm: 18, hand: 15, thigh: 37, leg: 38, foot: 36 };
  const rightX: Record<string, number> = { upperarm: 67, forearm: 71, hand: 74, thigh: 51, leg: 51, foot: 51 };
  return pairs.flatMap(([id, noun, shape, subs]) => [
    { id: `${map}-${id}-${screenLeftSide}`, map, noun, side: screenLeftSide, shape: shape(leftX[id]), subs },
    { id: `${map}-${id}-${other}`, map, noun, side: other, shape: shape(rightX[id]), subs },
  ]);
}

export const ZONES: Zone[] = [
  // FRONT — patient's right on the screen's left
  { id: 'front-head', map: 'front', noun: 'gelaat', shape: { kind: 'ellipse', cx: 50, cy: 16, rx: 10, ry: 13 }, subs: ['face', 'eyelids', 'nose', 'lips', 'ears', 'palsy'] },
  { id: 'front-neck', map: 'front', noun: 'hals', shape: rect(45, 28, 10, 7), subs: ['neck'] },
  { id: 'front-chest', map: 'front', noun: 'borst', shape: rect(35, 35, 30, 22), subs: ['breasts', 'chestwall'] },
  { id: 'front-abdomen', map: 'front', noun: 'buik', shape: rect(36, 57, 28, 20), subs: ['abdomen', 'flanks'] },
  { id: 'front-genital', map: 'front', noun: 'genitale streek', shape: rect(43, 77, 14, 10), subs: ['genital'] },
  ...limbs('front', 'R', true),
  // BACK — patient's left on the screen's left
  { id: 'back-head', map: 'back', noun: 'achterhoofd', shape: { kind: 'ellipse', cx: 50, cy: 16, rx: 10, ry: 13 }, subs: ['scalp', 'ears'] },
  { id: 'back-neck', map: 'back', noun: 'nek', shape: rect(45, 28, 10, 7), subs: ['neck'] },
  { id: 'back-back', map: 'back', noun: 'rug', shape: rect(35, 35, 30, 40), subs: ['back', 'flanks'] },
  { id: 'back-buttocks', map: 'back', noun: 'bil', shape: rect(35, 75, 30, 14), subs: ['buttocks'] },
  ...limbs('back', 'L', false),
];

export const SKIN_SUBS = ['scar', 'lesion', 'wound', 'burn'];

function inside(z: Zone, x: number, y: number): boolean {
  const s = z.shape;
  if (s.kind === 'rect') return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  return ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1;
}

const area = (z: Zone) => (z.shape.kind === 'rect' ? z.shape.w * z.shape.h : Math.PI * z.shape.rx * z.shape.ry);

/** The zone under a tap (smallest wins where shapes touch), or null on the background. */
export function hitTest(map: MapSide, x: number, y: number): Zone | null {
  const hits = ZONES.filter((z) => z.map === map && inside(z, x, y));
  return hits.length ? hits.reduce((a, b) => (area(a) <= area(b) ? a : b)) : null;
}

/** "linker onderarm, voorzijde" / "rug, achterzijde" — the editable spot label. */
export function spotLabel(zone: Zone): string {
  const sideWord = zone.side === 'L' ? 'linker ' : zone.side === 'R' ? 'rechter ' : '';
  return `${sideWord}${zone.noun}, ${zone.map === 'front' ? 'voorzijde' : 'achterzijde'}`;
}

export function zoneById(id: string): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}
