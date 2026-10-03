/**
 * Thumbnails and the ghost overlay need a file:// URI for <Image>. They live
 * in the app CACHE (app-private, never the gallery), one folder per open
 * session, and are wiped when the session closes and at every app start
 * (docs/ux-flow.md › States and edge cases).
 */
import { Directory, File, Paths } from 'expo-file-system';

const root = () => new Directory(Paths.cache, 'previews');

export function writePreview(key: string, name: string, bytes: Uint8Array): string {
  const dir = new Directory(root(), key);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const f = new File(dir, name);
  if (f.exists) f.delete();
  f.create();
  f.write(bytes);
  return f.uri;
}

export function previewUri(key: string, name: string): string | null {
  const f = new File(root(), key, name);
  return f.exists ? f.uri : null;
}

export function clearPreviews(key?: string) {
  try {
    const d = key ? new Directory(root(), key) : root();
    if (d.exists) d.delete();
  } catch {
    // best effort; the next app start retries
  }
}

export function deleteTempFile(uri: string | undefined) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}
