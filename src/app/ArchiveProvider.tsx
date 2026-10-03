/**
 * One archive for the whole app, opened over Outbox(app-private, chosen
 * folder). Screens read `archive.registry` and call `changed()` after every
 * mutation; that re-renders and schedules a sync. Sync also runs when the app
 * returns to the foreground and every 30 s while work is waiting.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { Archive } from '../core/archive';
import { Outbox } from '../core/storage/Outbox';
import { SafTarget } from '../platform/SafTarget';
import { LocalTarget } from '../platform/LocalTarget';
import { loadSettings, saveSettings } from '../platform/settings';

export interface SyncState {
  pending: number;
  running: boolean;
  error?: string;
  lastOkAt?: number;
}

export type ArchiveStatus = 'no-folder' | 'opening' | 'ready' | 'error';

interface Ctx {
  status: ArchiveStatus;
  error?: string;
  archive: Archive | null;
  /** Bumped on every change so screens re-read the registry. */
  version: number;
  sync: SyncState;
  rootUri?: string;
  openRoot: (uri: string) => Promise<boolean>;
  changed: () => void;
  syncNow: () => Promise<void>;
}

const ArchiveContext = createContext<Ctx | null>(null);

export function useArchive(): Ctx {
  const c = useContext(ArchiveContext);
  if (!c) throw new Error('useArchive outside ArchiveProvider');
  return c;
}

/** For screens that only render with an open archive. */
export function useReadyArchive(): Archive {
  const { archive } = useArchive();
  if (!archive) throw new Error('Archive not open');
  return archive;
}

const DEVICE = `${Platform.OS} ${String(Platform.Version)}`;
const OPERATOR = 'toestel-eigenaar';

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const [rootUri, setRootUri] = useState<string | undefined>(() => loadSettings().rootUri);
  const [status, setStatus] = useState<ArchiveStatus>(rootUri ? 'opening' : 'no-folder');
  const [error, setError] = useState<string>();
  const [archive, setArchive] = useState<Archive | null>(null);
  const [version, setVersion] = useState(0);
  const [sync, setSync] = useState<SyncState>({ pending: 0, running: false });
  const outbox = useRef<Outbox | null>(null);
  const draining = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drain = useCallback(async () => {
    const box = outbox.current;
    if (!box || draining.current) return;
    draining.current = true;
    setSync((s) => ({ ...s, running: true }));
    try {
      const r = await box.drain();
      setSync({ pending: r.remaining, running: false, error: r.error, lastOkAt: r.error ? undefined : Date.now() });
    } catch (e) {
      setSync({ pending: await box.pending(), running: false, error: String(e) });
    } finally {
      draining.current = false;
    }
  }, []);

  const open = useCallback(
    async (uri: string): Promise<boolean> => {
      setStatus('opening');
      setError(undefined);
      try {
        const box = new Outbox(new LocalTarget(), SafTarget.fromUri(uri));
        outbox.current = box;
        await drain(); // best effort; the merged view covers what is still queued
        const a = await Archive.open({ storage: box, operator: OPERATOR, device: DEVICE });
        setArchive(a);
        setStatus('ready');
        setSync((s) => ({ ...s }));
        setVersion((v) => v + 1);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
        return false;
      }
    },
    [drain],
  );

  const openRoot = useCallback(
    async (uri: string) => {
      saveSettings({ rootUri: uri });
      setRootUri(uri);
      return open(uri);
    },
    [open],
  );

  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      outbox.current?.pending().then((n) => setSync((s) => ({ ...s, pending: n })));
      drain();
    }, 400);
  }, [drain]);

  // Open the saved folder on launch.
  useEffect(() => {
    // Deferred one microtask so the effect body itself sets no state.
    if (rootUri) Promise.resolve().then(() => open(rootUri));
    // only on mount: later changes go through openRoot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Foreground and periodic sync.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') drain();
    });
    const interval = setInterval(() => {
      outbox.current?.pending().then((n) => {
        if (n > 0) drain();
      });
    }, 30_000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [drain]);

  const value = useMemo<Ctx>(
    () => ({ status, error, archive, version, sync, rootUri, openRoot, changed, syncNow: drain }),
    [status, error, archive, version, sync, rootUri, openRoot, changed, drain],
  );
  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>;
}
