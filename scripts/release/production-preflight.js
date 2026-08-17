/**
 * KwakoPos Production Preflight Endpoint Probe (ESM)
 * Probes GET /api/version, GET /api/health, GET /api/readiness on target environment.
 * Requires process.env.PRODUCTION_BASE_URL for deployed mode.
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

export async function runProductionPreflight() {
  const isDeployedMode = process.env.CERTIFICATION_MODE === 'deployed' || process.env.NODE_ENV === 'production';
  const baseUrl = process.env.PRODUCTION_BASE_URL || (isDeployedMode ? '' : 'http://127.0.0.1:8080');

  if (isDeployedMode && !baseUrl) {
    throw new Error('PRODUCTION_BASE_URL environment variable is required in deployed mode! Example: PRODUCTION_BASE_URL=https://app.kwakopos.co.tz');
  }

  if (isDeployedMode && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1'))) {
    throw new Error(`Deployed certification mode forbids localhost/127.0.0.1! Target URL must be deployed environment: ${baseUrl}`);
  }

  if (isDeployedMode && !baseUrl.startsWith('https://')) {
    console.warn(`⚠️ [Preflight Notice] Deployed production target should enforce HTTPS: ${baseUrl}`);
  }

  console.log(`[Preflight] Probing target production environment: ${baseUrl}...`);

  const versionRes = await fetch(`${baseUrl}/api/version`);
  if (!versionRes.ok) throw new Error(`GET /api/version returned HTTP ${versionRes.status}`);
  const versionData = await versionRes.json();

  const healthRes = await fetch(`${baseUrl}/api/health`);
  if (!healthRes.ok) throw new Error(`GET /api/health returned HTTP ${healthRes.status}`);

  const readyRes = await fetch(`${baseUrl}/api/readiness`);
  if (!readyRes.ok) throw new Error(`GET /api/readiness returned HTTP ${readyRes.status}`);

  console.log('✅ [Preflight Probe] All endpoints responsive:');
  console.log(`   App: ${versionData.application} v${versionData.version} (Build #${versionData.buildNumber})`);
  console.log(`   Git SHA: ${versionData.gitSha}`);
  console.log(`   Artifact SHA256: ${versionData.artifactSha256}`);
  console.log(`   Cloud Run Revision: ${versionData.cloudRunRevision}`);
  console.log(`   Container Digest: ${versionData.containerImageDigest}`);

  return versionData;
}

if (process.argv[1] === __filename) {
  runProductionPreflight().catch(err => {
    console.error('❌ [Preflight Probe Failed]:', err.message);
    process.exit(1);
  });
}
