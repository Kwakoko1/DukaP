/**
 * Real Client IP Resolution Service
 * Fetches the user's real public IP address from dynamic IP services,
 * caching the result in sessionStorage. Falls back gracefully to workstation host when offline.
 */

let cachedIp: string | null = null;

export async function getRealClientIp(): Promise<string> {
  if (cachedIp) return cachedIp;

  try {
    const sessionSaved = sessionStorage.getItem('dukapos_real_client_ip');
    if (sessionSaved && sessionSaved !== '197.250.4.15') {
      cachedIp = sessionSaved;
      return cachedIp;
    }
  } catch (e) {}

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.ip && typeof data.ip === 'string') {
        const ipStr: string = data.ip;
        cachedIp = ipStr;
        try {
          sessionStorage.setItem('dukapos_real_client_ip', ipStr);
        } catch (e) {}
        return ipStr;
      }
    }
  } catch (e) {
    // Network offline or endpoint unreachable
  }

  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  cachedIp = (host === 'localhost' || host === '127.0.0.1') ? '127.0.0.1' : host;
  return cachedIp;
}

export function getSyncRealClientIp(): string {
  if (cachedIp) return cachedIp;
  try {
    const sessionSaved = sessionStorage.getItem('dukapos_real_client_ip');
    if (sessionSaved && sessionSaved !== '197.250.4.15') {
      cachedIp = sessionSaved;
      return cachedIp;
    }
  } catch (e) {}

  getRealClientIp().catch(() => {});

  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  return (host === 'localhost' || host === '127.0.0.1') ? '127.0.0.1' : host;
}
