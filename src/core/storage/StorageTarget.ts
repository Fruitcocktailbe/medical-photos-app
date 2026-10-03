/**
 * Where the archive lives: a folder the user picked (PRD Q8). Paths are
 * arrays of names relative to that root, because SAF content:// URIs cannot
 * be built by string concatenation.
 *
 * Implementations: MemoryTarget (tests), SafTarget (Android, src/platform),
 * later a Drive REST adapter if the Drive app does not expose folders to SAF.
 */
export type Path = readonly string[];

export interface Entry {
  name: string;
  isDirectory: boolean;
}

export interface StorageTarget {
  list(dir: Path): Promise<Entry[]>;
  exists(path: Path): Promise<boolean>;
  /** Creates every missing directory along the path. */
  ensureDir(dir: Path): Promise<void>;
  /** Creates or overwrites. Parent directory must exist. */
  writeBytes(path: Path, bytes: Uint8Array, mime: string): Promise<void>;
  readBytes(path: Path): Promise<Uint8Array | null>;
  /** Renames the last path element (file or directory) in place. */
  rename(path: Path, newName: string): Promise<void>;
  remove(path: Path): Promise<void>;
}

export const MIME = { jpeg: 'image/jpeg', json: 'application/json', mp4: 'video/mp4' } as const;
