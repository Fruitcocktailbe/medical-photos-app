/**
 * On-device ML Kit wrappers. Nothing here sends an image off the phone
 * (PRD N4). Both functions take a file:// URI of a photo in the app cache.
 */
import TextRecognition from '@react-native-ml-kit/text-recognition';
import FaceDetection, { type Face } from '@react-native-ml-kit/face-detection';

/** OCR lines in reading order (top to bottom, then left to right). */
export async function recognizeLines(uri: string): Promise<string[]> {
  const result = await TextRecognition.recognize(uri);
  const lines = result.blocks.flatMap((b) => b.lines);
  return lines
    .map((l) => ({ text: l.text, top: l.frame?.top ?? 0, left: l.frame?.left ?? 0, h: l.frame?.height ?? 0 }))
    .sort((a, b) => (Math.abs(a.top - b.top) < Math.max(a.h, b.h) / 2 ? a.left - b.left : a.top - b.top))
    .map((l) => l.text);
}

/** The largest face in the photo, with head rotation. */
export async function largestFace(uri: string): Promise<Face | null> {
  const faces = await FaceDetection.detect(uri, { performanceMode: 'accurate', classificationMode: 'all' });
  if (faces.length === 0) return null;
  return faces.reduce((a, b) => (a.frame.width * a.frame.height >= b.frame.width * b.frame.height ? a : b));
}
