/**
 * DukaPOS Enterprise Per-Tab Session Storage Utility
 * Isolates user authentication sessions per browser tab (using sessionStorage).
 * Prevents cross-tab session contamination and split-brain identity bugs.
 */

const SESSION_KEY = 'dukapos_session';

export function getActiveSessionRaw(): string | null {
  if (typeof window === 'undefined') return null;
  // Read tab-isolated sessionStorage first
  const sess = sessionStorage.getItem(SESSION_KEY);
  if (sess) return sess;
  return null;
}

export function getActiveSession<T = any>(): T | null {
  const raw = getActiveSessionRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (_) {
    return null;
  }
}

export function setActiveSession(sessionData: any): void {
  if (typeof window === 'undefined') return;
  const str = typeof sessionData === 'string' ? sessionData : JSON.stringify(sessionData);
  sessionStorage.setItem(SESSION_KEY, str);
  // Ensure global localStorage session is removed so other tabs are NOT contaminated
  localStorage.removeItem(SESSION_KEY);
}

export function clearActiveSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
