/**
 * StorageTarget over Android's Storage Access Framework: the user picks (or
 * creates) a folder in any app that exposes one — local storage, Nextcloud,
 * OneDrive, a synced folder — and the archive lives there (PRD Q8).
 *
 * UNVERIFIED ON DEVICE. Spike (c) checks: exact file names (no extension
 * appended by the provider), rename of a directory, read-back, and whether the
 * folder permission survives an app restart.
 */
import { Directory, File } from 'expo-file-system';
import type { Entry, Path, StorageTarget } from '../core/storage/StorageTarget';

type Node = Directory | File;

export class SafTarget implements StorageTarget {
  constructor(readonly root: Directory) {}

  static async pick(): Promise<SafTarget> {
    return new SafTarget(await Directory.pickDirectoryAsync());
  }

  static fromUri(uri: string): SafTarget {
    return new SafTarget(new Directory(uri));
  }

  get uri(): string {
    return this.root.uri;
  }

  private child(dir: Directory, name: string): Node | undefined {
    return dir.list().find((e) => e.name === name);
  }

  private resolve(path: Path): Node | undefined {
    let node: Node = this.root;
    for (const name of path) {
      if (!(node instanceof Directory)) return undefined;
      const next = this.child(node, name);
      if (!next) return undefined;
      node = next;
    }
    return node;
  }

  private dirOf(path: Path): Directory {
    const d = this.resolve(path);
    if (!(d instanceof Directory)) throw new Error(`Map bestaat niet: ${path.join('/')}`);
    return d;
  }

  async list(dir: Path): Promise<Entry[]> {
    const d = this.resolve(dir);
    if (!(d instanceof Directory)) return [];
    return d.list().map((e) => ({ name: e.name, isDirectory: e instanceof Directory }));
  }

  async exists(path: Path) {
    return this.resolve(path) !== undefined;
  }

  async ensureDir(dir: Path) {
    let d = this.root;
    for (const name of dir) {
      const next = this.child(d, name);
      if (next instanceof File) throw new Error(`Bestand in de weg: ${name}`);
      d = next ?? d.createDirectory(name);
    }
  }

  async writeBytes(path: Path, bytes: Uint8Array, mime: string) {
    const parent = this.dirOf(path.slice(0, -1));
    const name = path[path.length - 1];
    const existing = this.child(parent, name);
    if (existing instanceof Directory) throw new Error(`Is een map: ${name}`);
    // Some document providers open existing files in "w" mode without truncating,
    // which leaves stale bytes after a shorter rewrite (fatal for JSON). Replace instead.
    if (existing) existing.delete();
    parent.createFile(name, mime).write(bytes);
  }

  async readBytes(path: Path) {
    const f = this.resolve(path);
    return f instanceof File ? f.bytes() : null;
  }

  async rename(path: Path, newName: string) {
    const n = this.resolve(path);
    if (!n) throw new Error(`Niet gevonden: ${path.join('/')}`);
    n.rename(newName);
  }

  async remove(path: Path) {
    this.resolve(path)?.delete();
  }
}
