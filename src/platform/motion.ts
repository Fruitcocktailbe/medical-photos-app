/**
 * Phone tilt from the motion sensors, so the camera itself is held at the same
 * angle as for the reference photo. UNVERIFIED mapping: in portrait, beta ≈ 90°
 * when the phone is upright; spike (b) shows the raw values to confirm.
 */
import { useEffect, useRef } from 'react';
import { DeviceMotion } from 'expo-sensors';

export interface PhoneTilt {
  /** 0 = upright; positive = top of the phone tilted away from the user. */
  pitch: number;
  /** 0 = level; positive = rotated clockwise. */
  roll: number;
}

const deg = (r: number) => (r * 180) / Math.PI;

export function usePhoneTilt(intervalMs = 100) {
  const ref = useRef<PhoneTilt | null>(null);
  useEffect(() => {
    DeviceMotion.setUpdateInterval(intervalMs);
    const sub = DeviceMotion.addListener((m) => {
      if (!m.rotation) return;
      ref.current = { pitch: deg(m.rotation.beta) - 90, roll: deg(m.rotation.gamma) };
    });
    return () => sub.remove();
  }, [intervalMs]);
  return ref;
}
