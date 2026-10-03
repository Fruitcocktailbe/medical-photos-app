/**
 * Offline-first writes (PRD F6, N2). Every write, rename and directory creation
 * is applied to a LOCAL target (app-internal storage) and appended to an
 * ordered op log. `drain()` replays the log against the REMOTE target (the
 * user's folder), verifies each written file by reading it back, and deletes
 * the local blob only after a verified write.
 *
 * Order is preserved: a failure stops the drain so a later rename can never
 * overtake an earlier write. Re-running drain() after a crash is safe: every
 * op is idempotent against the remote (ensureDir, overwrite, rename-if-present).
 */
import { fnv1a, sameBytes, utf8Decode, utf8Encode } from '../bytes';
import type { Entry, Path, StorageTarget } from './StorageTarget';

type Op =
  | { id: string; type: 'ensureDir'; path: string[] }
  | { id: string; type: 'write'; path: string[]; mime: string; blob: string; hash: string }
  | { id: string; type: 'rename'; path: string[]; newName: string }
  | { id: string; type: 'remove'; path: string[] };

const LOG: Path = ['.outbox', 'ops.json'];
const BLOBS: Path = ['.outbox', 'blobs'];

export interface DrainResult {
  done: number;
  remaining: number;
  error?: string;
}

/**
 * A StorageTarget that writes locally and syncs later.
 *
 * Reads and listings present a MERGED VIEW: the remote folder as it is, with
 * every pending op applied on top (writes, new directories, renames, removes).
 * So an index rebuilt after a restart with unsynced work — e.g. the cloud
 * offline in a hospital basement — still sees every patient and session.
 */
export class Outbox implements StorageTarget {
  private ops: Op[] | null = null;
  private seq = 0;

  constructor(private local: StorageTarget, private remote: StorageTarget) {}

  private async load(): Promise<Op[]> {
    if (this.ops) return this.ops;
    const raw = await this.local.readBytes(LOG);
    this.ops = raw ? (JSON.parse(utf8Decode(raw)) as Op[]) : [];
    this.seq = this.ops.length;
    return this.ops;
  }

  private async save() {
    await this.local.ensureDir(['.outbox']);
    await this.local.writeBytes(LOG, utf8Encode(JSON.stringify(this.ops)), 'application/json');
  }

  private nextId() {
    return `${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
  }

  async pending(): Promise<number> {
    return (await this.load()).length;
  }

  /** Apply the renames that come after op index `from` to a path recorded at that time. */
  private forward(path: readonly string[], from: number): string[] {
    let p = [...path];
    for (const op of (this.ops ?? []).slice(from)) {
      if (op.type === 'rename' && startsWith(p, op.path)) p = [...op.path.slice(0, -1), op.newName, ...p.slice(op.path.length)];
    }
    return p;
  }

  /** Map a current path back to the name it still has on the remote (undo pending renames). */
  private remotePath(path: Path): string[] {
    let p = [...path];
    const ops = this.ops ?? [];
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.type !== 'rename') continue;
      const renamed = [...op.path.slice(0, -1), op.newName];
      if (startsWith(p, renamed)) p = [...op.path, ...p.slice(renamed.length)];
    }
    return p;
  }

  /** Is the item at current path `p`, created at op index `createdAt` (-1 = remote), removed by a later remove op? */
  private removedAfter(p: readonly string[], createdAt: number): boolean {
    const ops = this.ops ?? [];
    for (let i = createdAt + 1; i < ops.length; i++) {
      const op = ops[i];
      if (op.type === 'remove' && startsWith(p, this.forward(op.path, i + 1))) return true;
    }
    return false;
  }

  private pendingWrite(path: Path): Extract<Op, { type: 'write' }> | undefined {
    const ops = this.ops ?? [];
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.type === 'write' && same(this.forward(op.path, i + 1), path)) return this.removedAfter(path, i) ? undefined : op;
    }
    return undefined;
  }

  async ensureDir(dir: Path) {
    const ops = await this.load();
    ops.push({ id: this.nextId(), type: 'ensureDir', path: [...dir] });
    await this.save();
  }

  async writeBytes(path: Path, bytes: Uint8Array, mime: string) {
    const ops = await this.load();
    const id = this.nextId();
    await this.local.ensureDir(BLOBS);
    await this.local.writeBytes([...BLOBS, id], bytes, mime);
    ops.push({ id, type: 'write', path: [...path], mime, blob: id, hash: fnv1a(bytes) });
    await this.save();
  }

  async rename(path: Path, newName: string) {
    const ops = await this.load();
    ops.push({ id: this.nextId(), type: 'rename', path: [...path], newName });
    await this.save();
  }

  async remove(path: Path) {
    const ops = await this.load();
    ops.push({ id: this.nextId(), type: 'remove', path: [...path] });
    await this.save();
  }

  async readBytes(path: Path) {
    await this.load();
    const w = this.pendingWrite(path);
    if (w) return this.local.readBytes([...BLOBS, w.blob]);
    if (this.removedAfter(path, -1)) return null;
    return this.remote.readBytes(this.remotePath(path));
  }

  async exists(path: Path) {
    await this.load();
    if (this.pendingWrite(path)) return true;
    if ((await this.list(path.slice(0, -1))).some((e) => e.name === path[path.length - 1])) return true;
    return path.length === 0;
  }

  async list(dir: Path): Promise<Entry[]> {
    const ops = await this.load();
    const out = new Map<string, boolean>();
    // Remote children, under their current names, minus pending removes.
    const remoteDir = this.remotePath(dir);
    let remoteEntries: Entry[] = [];
    try {
      remoteEntries = await this.remote.list(remoteDir);
    } catch {
      remoteEntries = []; // remote unreachable: the pending view still works
    }
    for (const e of remoteEntries) {
      const current = this.forward([...remoteDir, e.name], 0);
      if (same(current.slice(0, -1), dir) && !this.removedAfter(current, -1)) out.set(current[current.length - 1], e.isDirectory);
    }
    // Children created by pending ops.
    ops.forEach((op, i) => {
      if (op.type !== 'write' && op.type !== 'ensureDir') return;
      const p = this.forward(op.path, i + 1);
      if (p.length <= dir.length || !startsWith(p, dir) || this.removedAfter(p, i)) return;
      const name = p[dir.length];
      const isDir = op.type === 'ensureDir' || p.length > dir.length + 1;
      out.set(name, (out.get(name) ?? false) || isDir);
    });
    return [...out.entries()].map(([name, isDirectory]) => ({ name, isDirectory }));
  }

  /** Replay pending ops against the remote, oldest first. Stops at the first failure. */
  async drain(): Promise<DrainResult> {
    const ops = await this.load();
    let done = 0;
    while (ops.length > 0) {
      const op = ops[0];
      try {
        await this.apply(op);
      } catch (e) {
        await this.save();
        return { done, remaining: ops.length, error: e instanceof Error ? e.message : String(e) };
      }
      ops.shift();
      if (op.type === 'write') await this.local.remove([...BLOBS, op.blob]).catch(() => undefined);
      done++;
      await this.save();
    }
    return { done, remaining: 0 };
  }

  private async apply(op: Op) {
    switch (op.type) {
      case 'ensureDir':
        return this.remote.ensureDir(op.path);
      case 'write': {
        const bytes = await this.local.readBytes([...BLOBS, op.blob]);
        if (!bytes) throw new Error(`Local blob missing for ${op.path.join('/')}`);
        if (fnv1a(bytes) !== op.hash) throw new Error(`Local blob corrupt for ${op.path.join('/')}`);
        await this.remote.ensureDir(op.path.slice(0, -1));
        await this.remote.writeBytes(op.path, bytes, op.mime);
        const back = await this.remote.readBytes(op.path);
        if (!back || !sameBytes(back, bytes)) throw new Error(`Verification failed for ${op.path.join('/')}`);
        return;
      }
      case 'rename': {
        const renamed = [...op.path.slice(0, -1), op.newName];
        if (await this.remote.exists(renamed)) return; // already applied before a crash
        if (!(await this.remote.exists(op.path))) return; // nothing to rename (never synced, or removed)
        return this.remote.rename(op.path, op.newName);
      }
      case 'remove':
        if (await this.remote.exists(op.path)) await this.remote.remove(op.path);
    }
  }
}

function startsWith(p: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= p.length && prefix.every((x, i) => p[i] === x);
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && startsWith(a, b);
}
