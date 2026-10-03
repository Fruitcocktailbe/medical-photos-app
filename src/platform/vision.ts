/**
 * On-device OCR for the identity photo (one reading per patient, so a still
 * photo is enough). Nothing leaves the phone (PRD N4).
 * Live face analysis lives in camera.ts (VisionCamera frame output).
 */
import TextRecognition from '@react-native-ml-kit/text-recognition';

/** OCR lines in reading order (top to bottom, then left to right). */
export async function recognizeLines(uri: string): Promise<string[]> {
  const result = await TextRecognition.recognize(uri);
  const lines = result.blocks.flatMap((b) => b.lines);
  return lines
    .map((l) => ({ text: l.text, top: l.frame?.top ?? 0, left: l.frame?.left ?? 0, h: l.frame?.height ?? 0 }))
    .sort((a, b) => (Math.abs(a.top - b.top) < Math.max(a.h, b.h) / 2 ? a.left - b.left : a.top - b.top))
    .map((l) => l.text);
}
