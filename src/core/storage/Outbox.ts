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
 * A StorageTarget that writes locally and syncs later. Reads go to the remote
 * unless a pending local write exists for that path.
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

  private pendingWrite(path: Path): Extract<Op, { type: 'write' }> | undefined {
    const key = path.join('/');
    return [...(this.ops ?? [])].reverse().find((o): o is Extract<Op, { type: 'write' }> => o.type === 'write' && o.path.join('/') === key);
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
    return this.remote.readBytes(path);
  }

  async exists(path: Path) {
    await this.load();
    return !!this.pendingWrite(path) || this.remote.exists(path);
  }

  async list(dir: Path): Promise<Entry[]> {
    // Listing is used for index rebuilds, which run against the remote after a drain.
    return this.remote.list(dir);
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
        return this.remote.rename(op.path, op.newName);
      }
      case 'remove':
        if (await this.remote.exists(op.path)) await this.remote.remove(op.path);
    }
  }
}
