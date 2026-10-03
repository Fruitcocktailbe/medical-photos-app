/**
 * VisionCamera 5 adapters (decision 2026-10-03: one Expo codebase for Android
 * and iOS, camera layer on VisionCamera, ML Kit on both platforms so geometry
 * is measured the same way everywhere).
 *
 * - Photos: JPEG bytes straight from the photo output; no temp file, never the
 *   camera roll. JPEG is enforced because iPhones default to HEIC and the tags
 *   are written into JPEG segments.
 * - Faces: react-native-vision-camera-face-detector runs ML Kit natively on
 *   every frame (Kotlin/Swift, New Architecture) and calls back with
 *   yaw/pitch/roll and the face box. With autoMode off, the box and
 *   frameWidth/frameHeight are in the same upright coordinate space.
 */
import type { CameraPhotoOutput } from 'react-native-vision-camera';
import type { Face } from 'react-native-vision-camera-face-detector';
import type { Box } from '../core/guidance/detectors';

export const PHOTO_OUTPUT_OPTIONS = { containerFormat: 'jpeg', qualityPrioritization: 'quality', quality: 0.92 } as const;

export interface CapturedJpeg {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export async function captureJpeg(output: CameraPhotoOutput): Promise<CapturedJpeg> {
  const photo = await output.capturePhoto({ enableShutterSound: false }, {});
  try {
    const bytes = new Uint8Array(await photo.getFileDataAsync());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`Camera gaf geen JPEG (${photo.containerFormat})`);
    return { bytes, width: photo.width, height: photo.height };
  } finally {
    photo.dispose();
  }
}

/** For APIs that need a file (on-device OCR). Caller deletes the file right after use. */
export async function captureTempFile(output: CameraPhotoOutput): Promise<string> {
  const photo = await output.capturePhoto({ enableShutterSound: false }, {});
  try {
    const path = await photo.saveToTemporaryFileAsync();
    return path.startsWith('file://') ? path : `file://${path}`;
  } finally {
    photo.dispose();
  }
}

/** Plugin Face → the detector-neutral shape core/guidance/detectors.ts expects. */
export function faceForGeometry(face: Face): {
  detection: { rotationX: number; rotationY: number; rotationZ: number; frame: Box };
  image: { width: number; height: number };
} {
  return {
    detection: {
      rotationX: face.pitchAngle,
      rotationY: face.yawAngle,
      rotationZ: face.rollAngle,
      frame: { left: face.bounds.x, top: face.bounds.y, width: face.bounds.width, height: face.bounds.height },
    },
    image: { width: face.frameWidth, height: face.frameHeight },
  };
}

export function largest(faces: Face[]): Face | null {
  if (faces.length === 0) return null;
  return faces.reduce((a, b) => (a.bounds.width * a.bounds.height >= b.bounds.width * b.bounds.height ? a : b));
}
