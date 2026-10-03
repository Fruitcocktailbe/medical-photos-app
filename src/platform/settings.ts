/** Tiny persisted settings (folder URI, detector sign fixes) in app-private storage. */
import { File, Paths } from 'expo-file-system';

export interface Settings {
  rootUri?: string;
  yawInverted?: boolean;
}

const file = () => new File(Paths.document, 'settings.json');

export function loadSettings(): Settings {
  try {
    const f = file();
    return f.exists ? (JSON.parse(f.textSync()) as Settings) : {};
  } catch {
    return {};
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  const f = file();
  if (!f.exists) f.create();
  f.write(JSON.stringify(next));
  return next;
}
