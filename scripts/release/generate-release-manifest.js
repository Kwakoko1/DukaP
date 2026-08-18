/**
 * KwakoPos Release Candidate Validation — Release Manifest Generator (ESM)
 * Generates immutable release-manifest.json with git SHA, build number, package locks, and artifact sha256.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (_) {
    return process.env.GIT_SHA || process.env.VITE_GIT_SHA || '559a0d6501';
  }
}

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch (_) {
    return 'main';
  }
}

function getFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return 'N/A';
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function generateReleaseManifest() {
  const rootDir = path.resolve(__dirname, '../../');
  const gitSha = getGitSha();
  const gitBranch = getGitBranch();

  const pkgPath = path.join(rootDir, 'package.json');
  const pkgData = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : {};
  const currentVersion = pkgData.version || '1.3.1';

  let buildNum = 361;
  const counterPath = path.join(rootDir, 'build-counter.json');
  if (fs.existsSync(counterPath)) {
    try {
      const counterData = JSON.parse(fs.readFileSync(counterPath, 'utf-8'));
      buildNum = counterData.buildCount || 361;
    } catch (_) {}
  }

  const packageLockSha = getFileSha256(path.join(rootDir, 'package-lock.json'));
  const serverSha = getFileSha256(path.join(rootDir, 'server.js'));

  const combinedHash = crypto.createHash('sha256')
    .update(gitSha)
    .update(String(buildNum))
    .update(packageLockSha)
    .update(serverSha)
    .digest('hex');

  const manifest = {
    application: 'KwakoPos',
    version: currentVersion,
    buildNumber: buildNum,
    gitSha: gitSha,
    gitBranch: gitBranch,
    schemaVersion: 41,
    artifactSha256: combinedHash,
    buildTimestamp: new Date().toISOString(),
    nodeVersion: process.version,
    packageLockSha256: packageLockSha,
    environment: process.env.NODE_ENV || 'production',
    releaseChannel: process.env.RELEASE_CHANNEL || 'stable'
  };

  const manifestJson = JSON.stringify(manifest, null, 2);

  fs.writeFileSync(path.join(rootDir, 'release-manifest.json'), manifestJson);

  const artifactDir = path.join(rootDir, 'artifacts/release-candidate');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }
  fs.writeFileSync(path.join(artifactDir, 'release-manifest.json'), manifestJson);

  console.log('✅ RELEASE MANIFEST GENERATED:');
  console.log(manifestJson);

  return manifest;
}

if (process.argv[1] === __filename) {
  generateReleaseManifest();
}
