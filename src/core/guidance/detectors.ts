/**
 * Convert raw detector output into the canonical CaptureGeometry convention
 * (see types.ts) and classify the view. Pure: the platform layer passes in
 * numbers from ML Kit; the sign constants are confirmed on the device in
 * spike (b) and live in one place (DetectorSigns).
 */
import type { CaptureGeometry, ViewId } from '../types';

export interface DetectorSigns {
  /** Multiplier from ML Kit headEulerAngleY (rotationY) to canonical yaw. */
  yaw: 1 | -1;
  /** Multiplier from ML Kit headEulerAngleX (rotationX) to canonical pitch. */
  pitch: 1 | -1;
  /** Multiplier from ML Kit headEulerAngleZ (rotationZ) to canonical roll. */
  roll: 1 | -1;
}

/**
 * UNVERIFIED defaults for the back camera. ML Kit documents positive Y as the
 * face turned towards the image's right; with the back camera the patient's
 * own right is the image's left. Spike (b) checks this with a protractor.
 */
export const BACK_CAMERA_SIGNS: DetectorSigns = { yaw: -1, pitch: 1, roll: -1 };

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function faceGeometry(
  face: { rotationX: number; rotationY: number; rotationZ: number; frame: Box },
  image: { width: number; height: number },
  signs: DetectorSigns = BACK_CAMERA_SIGNS,
  phone?: { pitch: number; roll: number },
): CaptureGeometry {
  return {
    yaw: signs.yaw * face.rotationY,
    pitch: signs.pitch * face.rotationX,
    roll: signs.roll * face.rotationZ,
    distance: face.frame.height / image.height,
    centerX: (face.frame.left + face.frame.width / 2) / image.width - 0.5,
    centerY: (face.frame.top + face.frame.height / 2) / image.height - 0.5,
    phonePitch: phone?.pitch,
    phoneRoll: phone?.roll,
    source: 'face',
  };
}

export interface Landmark3D {
  x: number;
  y: number;
  /** ML Kit pose z: depth on roughly the same scale as x; smaller = closer. */
  z: number;
}

/**
 * Body yaw from the shoulder line in 3D. Facing the camera, the patient's left
 * shoulder is on the image right (dx > 0, dz ≈ 0) → 0°. Turned to their own
 * right, the left shoulder comes closer (dz < 0) → towards +90°. Back to the
 * camera → ±180°.
 */
export function bodyYaw(leftShoulder: Landmark3D, rightShoulder: Landmark3D): number {
  const dx = leftShoulder.x - rightShoulder.x;
  const dz = leftShoulder.z - rightShoulder.z;
  return (Math.atan2(-dz, dx) * 180) / Math.PI;
}

export function poseGeometry(
  lm: { leftShoulder: Landmark3D; rightShoulder: Landmark3D; leftHip: Landmark3D; rightHip: Landmark3D },
  image: { width: number; height: number },
  phone?: { pitch: number; roll: number },
): CaptureGeometry {
  const shoulderMidY = (lm.leftShoulder.y + lm.rightShoulder.y) / 2;
  const hipMidY = (lm.leftHip.y + lm.rightHip.y) / 2;
  const xs = [lm.leftShoulder.x, lm.rightShoulder.x, lm.leftHip.x, lm.rightHip.x];
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  // Shoulder-line tilt in the image plane; positive = patient's left shoulder lower.
  const roll = (Math.atan2(lm.leftShoulder.y - lm.rightShoulder.y, Math.abs(lm.leftShoulder.x - lm.rightShoulder.x) || 1e-6) * 180) / Math.PI;
  return {
    yaw: bodyYaw(lm.leftShoulder, lm.rightShoulder),
    pitch: 0,
    roll,
    distance: Math.abs(hipMidY - shoulderMidY) / image.height,
    centerX: midX / image.width - 0.5,
    centerY: (shoulderMidY + hipMidY) / 2 / image.height - 0.5,
    phonePitch: phone?.pitch,
    phoneRoll: phone?.roll,
    source: 'pose',
  };
}

export function armsUp(lm: { leftWrist: Landmark3D; rightWrist: Landmark3D; leftShoulder: Landmark3D; rightShoulder: Landmark3D }): boolean {
  return lm.leftWrist.y < lm.leftShoulder.y && lm.rightWrist.y < lm.rightShoulder.y;
}

/**
 * Auto view tag. Returns null in the grey zones between views so the UI asks
 * with one tap instead of guessing. Only views from the active set are returned.
 */
export function classifyView(
  g: Pick<CaptureGeometry, 'yaw' | 'source'>,
  viewSetIds: ViewId[],
  extra: { smiling?: number; armsUp?: boolean } = {},
): ViewId | null {
  const a = Math.abs(g.yaw);
  const side = g.yaw >= 0 ? 'L' : 'R';
  let v: ViewId | null = null;
  if (g.source === 'face') {
    if (a <= 15) v = (extra.smiling ?? 0) > 0.6 && viewSetIds.includes('frontal-smile') ? 'frontal-smile' : 'frontal';
    else if (a >= 30 && a <= 60) v = `oblique-${side}`;
    else if (a >= 72) v = `lateral-${side}`;
  } else if (g.source === 'pose') {
    if (a <= 20) v = extra.armsUp && viewSetIds.includes('AP-arms-up') ? 'AP-arms-up' : 'AP';
    else if (a >= 30 && a <= 60) v = `body-oblique-${side}`;
    else if (a >= 70 && a <= 110) v = `body-lateral-${side}`;
    else if (a >= 150) v = 'PA';
  }
  return v && viewSetIds.includes(v) ? v : null;
}
