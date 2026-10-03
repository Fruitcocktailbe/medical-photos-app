/**
 * App-private storage (not visible to other apps, not in the gallery). Holds
 * the outbox: captures land here first and are deleted after a verified write
 * to the user's folder (PRD F6).
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { Entry, Path, StorageTarget } from '../core/storage/StorageTarget';

export class LocalTarget implements StorageTarget {
  private base: Directory;

  constructor(name = 'archive-local') {
    this.base = new Directory(Paths.document, name);
    if (!this.base.exists) this.base.create({ intermediates: true, idempotent: true });
  }

  private dir(path: Path) {
    return new Directory(this.base, ...path);
  }
  private file(path: Path) {
    return new File(this.base, ...path);
  }

  async list(dir: Path): Promise<Entry[]> {
    const d = this.dir(dir);
    if (!d.exists) return [];
    return d.list().map((e) => ({ name: e.name, isDirectory: e instanceof Directory }));
  }
  async exists(path: Path) {
    return this.file(path).exists || this.dir(path).exists;
  }
  async ensureDir(dir: Path) {
    const d = this.dir(dir);
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
  }
  async writeBytes(path: Path, bytes: Uint8Array) {
    const f = this.file(path);
    if (!f.exists) f.create({ intermediates: true });
    f.write(bytes);
  }
  async readBytes(path: Path) {
    const f = this.file(path);
    return f.exists ? f.bytes() : null;
  }
  async rename(path: Path, newName: string) {
    const f = this.file(path);
    if (f.exists) f.rename(newName);
    else this.dir(path).rename(newName);
  }
  async remove(path: Path) {
    const f = this.file(path);
    if (f.exists) f.delete();
    else if (this.dir(path).exists) this.dir(path).delete();
  }
}
