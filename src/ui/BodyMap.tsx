/**
 * Body-map silhouette (anatomy plan A1/A5). Draws the zones from
 * core/catalog/bodymap.ts; a tap reports the zone and the exact point, which
 * becomes the pin for skin spots. Front view: patient's left on the screen's
 * right (the patient faces you).
 */
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Rect } from 'react-native-svg';
import { ZONES, hitTest, type MapSide, type Zone } from '../core/catalog/bodymap';
import { c, s } from './kit';

const VB_W = 100;
const VB_H = 200;

export function BodyMap({
  map,
  width = 190,
  activeZone,
  markedZones = [],
  pins = [],
  onTap,
}: {
  map: MapSide;
  width?: number;
  activeZone?: string | null;
  /** Zones that already have a chosen area (shown tinted). */
  markedZones?: string[];
  pins?: { x: number; y: number }[];
  onTap: (zone: Zone | null, point: { x: number; y: number }) => void;
}) {
  const height = (width * VB_H) / VB_W;
  const scale = VB_W / width;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={map === 'front' ? 'Lichaamskaart voorzijde' : 'Lichaamskaart achterzijde'}
        onPress={(e) => {
          const x = e.nativeEvent.locationX * scale;
          const y = e.nativeEvent.locationY * scale;
          onTap(hitTest(map, x, y), { x, y });
        }}
        style={{ width, height }}
      >
        <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} pointerEvents="none">
          <G>
            {ZONES.filter((z) => z.map === map).map((z) => {
              const fill = z.id === activeZone ? c.accent : markedZones.includes(z.id) ? '#a5f3fc' : '#e2e8f0';
              const common = { fill, stroke: '#94a3b8', strokeWidth: 0.6 };
              return z.shape.kind === 'rect' ? (
                <Rect key={z.id} x={z.shape.x} y={z.shape.y} width={z.shape.w} height={z.shape.h} rx={3} {...common} />
              ) : (
                <Ellipse key={z.id} cx={z.shape.cx} cy={z.shape.cy} rx={z.shape.rx} ry={z.shape.ry} {...common} />
              );
            })}
            {pins.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={2.6} fill={c.bad} stroke={c.white} strokeWidth={0.8} />
            ))}
          </G>
        </Svg>
      </Pressable>
      <Text style={s.muted}>{map === 'front' ? 'Voorzijde · patiënt kijkt naar jou (links = rechts op scherm)' : 'Achterzijde'}</Text>
    </View>
  );
}
