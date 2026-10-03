/** Tiny persisted settings in app-private storage (never patient data). */
import { File, Paths } from 'expo-file-system';

export interface Settings {
  /** SAF URI of the folder the archive lives in. */
  rootUri?: string;
  onboardingDone?: boolean;
  lockEnabled?: boolean;
  /** Ghost overlay of the reference photo in the capture screen (remembered). */
  ghostOn?: boolean;
  /** Detector sign fix found in spike (b). */
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
