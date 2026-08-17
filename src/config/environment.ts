/**
 * KwakoPOS SaaS — Production Environment & Client Security Config
 * Authoritative client-side environment manager.
 * Note: Database URLs and JWT signing secrets belong strictly to the backend server.
 */

export type EnvironmentMode = 'development' | 'testing' | 'staging' | 'production';

export interface ProductionConfig {
  mode: EnvironmentMode;
  appName: string;
  version: string;
  buildHash: string;
  isProduction: boolean;
  isOfflineFirst: boolean;
  apiUrl: string;
  jwtAccessExpirySec: number;
  jwtRefreshExpiryDays: number;
  enableSourceMaps: boolean;
  enableTelemetry: boolean;
  cdnUrl: string;
  sentryDsn?: string;
  mfaRequired: boolean;
  rateLimitPerMin: number;
  lockoutThreshold: number;
  lockoutDurationMins: number;
}

const getEnv = (key: string, fallback: string = ''): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env[key] as string) || fallback;
  }
  return fallback;
};

const MODE = (getEnv('VITE_APP_ENV', getEnv('MODE', 'production')) as EnvironmentMode);

export const envConfig: ProductionConfig = {
  mode: MODE,
  appName: 'KwakoPOS SaaS Enterprise',
  version: '2.5.0-PROD',
  buildHash: 'rel-2026-08-v2.5-prod',
  isProduction: MODE === 'production',
  isOfflineFirst: true,
  apiUrl: getEnv('VITE_API_URL', typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080'),
  jwtAccessExpirySec: 900, // 15 minutes
  jwtRefreshExpiryDays: 14, // 14 days
  enableSourceMaps: false, // Security: Disabled in end-user production bundle
  enableTelemetry: true,
  cdnUrl: getEnv('VITE_CDN_URL', ''),
  sentryDsn: getEnv('VITE_SENTRY_DSN', ''),
  mfaRequired: false,
  rateLimitPerMin: 120,
  lockoutThreshold: 5,
  lockoutDurationMins: 15
};

export const validateEnvironmentSecrets = (): { valid: boolean; missingKeys: string[] } => {
  const missingKeys: string[] = [];
  
  if (!envConfig.apiUrl) missingKeys.push('VITE_API_URL');

  return {
    valid: missingKeys.length === 0,
    missingKeys
  };
};

