/**
 * DukaPos SaaS — Application Version & Release Metadata
 * Centralized, build-integrated metadata source for production releases.
 * Automatically synchronized with package.json and Semantic Versioning engine.
 */

import pkg from '../../package.json';
import releaseMeta from '../../release-metadata.json';

export interface ApplicationMetadata {
  appName: string;
  copyrightHolder: string;
  supportEmail: string;
  currentYear: number;
  version: string;
  buildNumber: string;
  commitSha: string;
  buildDate: string;
  environment: string;
}

const getEnvValue = (key: string, fallback: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env[key] as string) || fallback;
  }
  return fallback;
};

// Return stable, deterministic build number from release-metadata or VITE_BUILD_NUMBER
const generateBuildNumber = (): string => {
  const envBuild = getEnvValue('VITE_BUILD_NUMBER', '');
  if (envBuild) return envBuild;

  if (releaseMeta && (releaseMeta as any).buildNumber) {
    return (releaseMeta as any).buildNumber;
  }

  if (releaseMeta && (releaseMeta as any).date && (releaseMeta as any).commitCount) {
    const dateStr = (releaseMeta as any).date.replace(/-/g, '');
    return `${dateStr}.${(releaseMeta as any).commitCount}`;
  }

  return '20260810.93';
};

export const getVersionMetadata = (): ApplicationMetadata => {
  const currentYear = new Date().getFullYear();
  const version = pkg.version || getEnvValue('VITE_APP_VERSION', '1.0.0');
  const buildNumber = generateBuildNumber();
  const commitSha = getEnvValue('VITE_GIT_COMMIT', 'a1f89bc');
  const buildDate = getEnvValue('VITE_BUILD_DATE', new Date().toISOString().split('T')[0]);
  const environment = getEnvValue('VITE_APP_ENV', 'production');

  return {
    appName: 'Kwakoko',
    copyrightHolder: 'Kwakoko',
    supportEmail: 'info@kwakoko.co.tz',
    currentYear,
    version,
    buildNumber,
    commitSha,
    buildDate,
    environment
  };
};

export const versionMetadata = getVersionMetadata();
