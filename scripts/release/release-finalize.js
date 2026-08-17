/**
 * KwakoPos Release Finalizer Script (ESM)
 * Operates strictly on an already-certified candidate.
 * Verifies certificate status === 'CERTIFIED', SHA identity match, and creates git release tag.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

export function finalizeRelease() {
  console.log('[Release Finalizer] Verifying release candidate certification...');

  const certPath = path.join(rootDir, 'kwakopos-release-certificate.json');
  const manifestPath = path.join(rootDir, 'release-manifest.json');

  if (!fs.existsSync(certPath)) {
    throw new Error('REJECTED: kwakopos-release-certificate.json not found! Run npm run production:certify first.');
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error('REJECTED: release-manifest.json not found!');
  }

  const cert = JSON.parse(fs.readFileSync(certPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (cert.status !== 'CERTIFIED') {
    throw new Error(`REJECTED: Release certificate status is '${cert.status}' (Must be 'CERTIFIED')! Cannot finalize release.`);
  }

  const headSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: rootDir }).trim();

  if (manifest.gitSha && !headSha.startsWith(manifest.gitSha.slice(0, 7))) {
    throw new Error(`REJECTED: Git SHA mismatch! HEAD (${headSha}) != Manifest SHA (${manifest.gitSha})`);
  }

  if (cert.gitSha && !headSha.startsWith(cert.gitSha.slice(0, 7))) {
    throw new Error(`REJECTED: Git SHA mismatch! HEAD (${headSha}) != Certificate SHA (${cert.gitSha})`);
  }

  const tagVersion = `v${cert.release || '1.2.0'}-build${cert.buildNumber || '358'}`;

  console.log(`✅ [Release Finalizer] Certification verified!`);
  console.log(`   Release Tag: ${tagVersion}`);
  console.log(`   Git SHA: ${headSha}`);
  console.log(`   Artifact SHA256: ${cert.artifactSha256}`);
  console.log(`   Mode: ${cert.mode}`);
  console.log(`   Target URL: ${cert.productionUrl}`);

  // Create local git tag if not exists
  try {
    execSync(`git tag -a "${tagVersion}" -m "KwakoPos Certified Production Release ${tagVersion}"`, { cwd: rootDir, stdio: 'pipe' });
    console.log(`🏷️ [Git Tag] Created local release tag: ${tagVersion}`);
  } catch (err) {
    console.log(`ℹ️ [Git Tag] Release tag ${tagVersion} already exists or tagging skipped.`);
  }

  return { success: true, tag: tagVersion, certificate: cert };
}

if (process.argv[1] === __filename) {
  try {
    finalizeRelease();
  } catch (err) {
    console.error('❌ [Release Finalizer Error]:', err.message);
    process.exit(1);
  }
}
