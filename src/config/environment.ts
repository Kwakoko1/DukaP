/**
 * DukaPos SaaS — Production Environment & Security Config
 * Authoritative production configuration manager and secrets validator.
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
  postgresUrl: string;
  jwtSecret: string;
  jwtAccessExpirySec: number;
  jwtRefreshExpiryDays: number;
  encryptionKey: string;
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

const MODE = (getEnv('VITE_APP_ENV', 'production') as EnvironmentMode);

export const envConfig: ProductionConfig = {
  mode: MODE,
  appName: 'DukaPos SaaS Enterprise',
  version: '2.5.0-PROD',
  buildHash: 'rel-2026-07-26-v2.5-prod-ec89f',
  isProduction: true,
  isOfflineFirst: true,
  apiUrl: getEnv('VITE_API_URL', 'http://localhost:8080'),
  postgresUrl: getEnv('VITE_POSTGRES_URL', 'postgresql://postgres:postgres@localhost:5432/kwakopos'),
  jwtSecret: getEnv('VITE_JWT_SECRET', 'dukapos_saas_prod_jwt_super_secret_key_2026_x89f'),
  jwtAccessExpirySec: 900, // 15 minutes
  jwtRefreshExpiryDays: 30, // 30 days
  encryptionKey: getEnv('VITE_ENCRYPTION_KEY', 'enc_key_32_bytes_dukapos_aes256_prod_2026!'),
  enableSourceMaps: false, // Security: Disabled in end-user production bundle
  enableTelemetry: true,
  cdnUrl: getEnv('VITE_CDN_URL', 'https://cdn.dukapos.co.tz/assets'),
  sentryDsn: getEnv('VITE_SENTRY_DSN', 'https://sentry.dukapos.co.tz/4509'),
  mfaRequired: false,
  rateLimitPerMin: 120,
  lockoutThreshold: 5,
  lockoutDurationMins: 15
};

export const validateEnvironmentSecrets = (): { valid: boolean; missingKeys: string[] } => {
  const missingKeys: string[] = [];
  
  if (!envConfig.postgresUrl) missingKeys.push('VITE_POSTGRES_URL');
  if (!envConfig.jwtSecret) missingKeys.push('VITE_JWT_SECRET');
  if (!envConfig.encryptionKey) missingKeys.push('VITE_ENCRYPTION_KEY');
  if (!envConfig.apiUrl) missingKeys.push('VITE_API_URL');

  return {
    valid: missingKeys.length === 0,
    missingKeys
  };
};
