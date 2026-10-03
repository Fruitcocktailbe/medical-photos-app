/**
 * App lock (PRD F9): system biometric prompt with device-PIN fallback, on
 * launch and after 60 s in the background.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { SecurityLevel, authenticateAsync, getEnrolledLevelAsync } from 'expo-local-authentication';

export type DeviceSecurity = 'biometric' | 'pin' | 'none';

export async function deviceSecurity(): Promise<DeviceSecurity> {
  const level = await getEnrolledLevelAsync();
  if (level === SecurityLevel.NONE) return 'none';
  if (level === SecurityLevel.SECRET) return 'pin';
  return 'biometric';
}

export async function authenticate(prompt = 'Ontgrendel Medical Photos'): Promise<boolean> {
  const r = await authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
  return r.success;
}

export function useAppLock(enabled: boolean, timeoutMs = 60_000) {
  const [locked, setLocked] = useState(enabled);
  const backgroundSince = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundSince.current = Date.now();
      if (state === 'active' && backgroundSince.current !== null) {
        if (enabled && Date.now() - backgroundSince.current > timeoutMs) setLocked(true);
        backgroundSince.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled, timeoutMs]);

  const unlock = useCallback(async () => {
    if (await authenticate()) setLocked(false);
  }, []);
  return { locked: enabled && locked, unlock };
}
