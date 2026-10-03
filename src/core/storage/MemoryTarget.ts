import type { Entry, Path, StorageTarget } from './StorageTarget';

type Node = { dir: true; children: Map<string, Node> } | { dir: false; bytes: Uint8Array };

/** In-memory folder tree. Used by tests and as the spike's dry-run target. */
export class MemoryTarget implements StorageTarget {
  private root: Node = { dir: true, children: new Map() };
  /** Set to make the next N operations throw (simulates an offline provider). */
  failNext = 0;

  private maybeFail() {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('MemoryTarget: simulated failure');
    }
  }

  private find(path: Path): Node | undefined {
    let n: Node = this.root;
    for (const p of path) {
      if (!n.dir) return undefined;
      const next = n.children.get(p);
      if (!next) return undefined;
      n = next;
    }
    return n;
  }

  private parent(path: Path): Map<string, Node> {
    const p = this.find(path.slice(0, -1));
    if (!p || !p.dir) throw new Error(`No such directory: ${path.slice(0, -1).join('/')}`);
    return p.children;
  }

  async list(dir: Path): Promise<Entry[]> {
    this.maybeFail();
    const n = this.find(dir);
    if (!n || !n.dir) return [];
    return [...n.children.entries()].map(([name, c]) => ({ name, isDirectory: c.dir }));
  }

  async exists(path: Path) {
    return this.find(path) !== undefined;
  }

  async ensureDir(dir: Path) {
    this.maybeFail();
    let n = this.root;
    for (const p of dir) {
      if (!n.dir) throw new Error('Path crosses a file');
      let next = n.children.get(p);
      if (!next) {
        next = { dir: true, children: new Map() };
        n.children.set(p, next);
      }
      n = next;
    }
  }

  async writeBytes(path: Path, bytes: Uint8Array) {
    this.maybeFail();
    const existing = this.find(path);
    if (existing?.dir) throw new Error('Is a directory');
    this.parent(path).set(path[path.length - 1], { dir: false, bytes: bytes.slice() });
  }

  async readBytes(path: Path) {
    this.maybeFail();
    const n = this.find(path);
    return n && !n.dir ? n.bytes.slice() : null;
  }

  async rename(path: Path, newName: string) {
    this.maybeFail();
    const parent = this.parent(path);
    const node = parent.get(path[path.length - 1]);
    if (!node) throw new Error(`No such entry: ${path.join('/')}`);
    if (parent.has(newName)) throw new Error(`Target exists: ${newName}`);
    parent.delete(path[path.length - 1]);
    parent.set(newName, node);
  }

  async remove(path: Path) {
    this.maybeFail();
    this.parent(path).delete(path[path.length - 1]);
  }

  /** Debug helper: every file path, sorted. */
  dump(): string[] {
    const out: string[] = [];
    const walk = (n: Node, prefix: string) => {
      if (!n.dir) return out.push(prefix);
      for (const [k, c] of n.children) walk(c, prefix ? `${prefix}/${k}` : k);
    };
    walk(this.root, '');
    return out.sort();
  }
}
