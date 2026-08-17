/**
 * KwakoPos Release Candidate Packaging Script (ESM)
 * Packages compiled app bundle and release manifest into artifacts/release-candidate/app.tar.gz
 * and computes artifact.sha256 for immutable provenance handoff.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

export function packReleaseArtifact() {
  console.log('[Release Packaging] Building immutable production artifact bundle...');

  const releaseDir = path.join(rootDir, 'artifacts/release-candidate');
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }

  const manifestPath = path.join(rootDir, 'release-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('release-manifest.json not found! Run npm run release:manifest first.');
  }

  const tarPath = path.join(releaseDir, 'app.tar.gz');
  const shaPath = path.join(releaseDir, 'artifact.sha256');

  // Package dist/, server.js, package.json, and release-manifest.json
  const tarCmd = `tar -czf "${tarPath}" -C "${rootDir}" dist server.js package.json release-manifest.json`;
  execSync(tarCmd, { cwd: rootDir, stdio: 'inherit' });

  // Compute SHA256 of app.tar.gz
  const fileBuffer = fs.readFileSync(tarPath);
  const hashSum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  fs.writeFileSync(shaPath, hashSum, 'utf8');

  // Update release-manifest.json with exact artifact SHA256
  const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifestData.artifactSha256 = hashSum;
  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
  fs.writeFileSync(path.join(releaseDir, 'release-manifest.json'), JSON.stringify(manifestData, null, 2), 'utf8');

  console.log(`✅ [Release Packaging] Bundle generated: ${tarPath}`);
  console.log(`   SHA256: ${hashSum}`);

  return { tarPath, sha256: hashSum, manifest: manifestData };
}

if (process.argv[1] === __filename) {
  try {
    packReleaseArtifact();
  } catch (err) {
    console.error('❌ [Release Packaging Error]:', err.message);
    process.exit(1);
  }
}
