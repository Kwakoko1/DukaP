/**
 * DukaPos SaaS — Application Version & Release Metadata
 * Centralized, build-integrated metadata source for production releases.
 * Automatically synchronized with package.json and Semantic Versioning engine.
 */

import pkg from '../../package.json';
import releaseManifest from '../../release-manifest.json';
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

// Return stable, deterministic build number from release-manifest or release-metadata
const generateBuildNumber = (): string => {
  const envBuild = getEnvValue('VITE_BUILD_NUMBER', '');
  if (envBuild) return envBuild;

  if (releaseManifest && (releaseManifest as any).buildNumber) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${dateStr}.${(releaseManifest as any).buildNumber}`;
  }

  if (releaseMeta && (releaseMeta as any).buildNumber) {
    return (releaseMeta as any).buildNumber;
  }

  return '20260818.361';
};

export const getVersionMetadata = (): ApplicationMetadata => {
  const currentYear = new Date().getFullYear();
  const version = pkg.version || (releaseManifest as any)?.version || getEnvValue('VITE_APP_VERSION', '1.3.1');
  const buildNumber = generateBuildNumber();
  const commitSha = (releaseManifest as any)?.gitSha?.slice(0, 7) || getEnvValue('VITE_GIT_COMMIT', '0baae58');
  const buildDate = (releaseManifest as any)?.buildTimestamp?.split('T')[0] || getEnvValue('VITE_BUILD_DATE', new Date().toISOString().split('T')[0]);
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
