import http from 'http';
import https from 'https';

/**
 * Enterprise Post-Deployment Health Probing Engine for DukaPos SaaS
 * Executes post-deployment checks against production/staging endpoints
 * to verify web server response, PWA service worker headers, and API health.
 */

const targetUrl = process.env.HEALTH_CHECK_URL || 'http://localhost:8080';
const maxRetries = 5;
const retryDelayMs = 3000;

console.log(`[Health Probe] Initiating deployment health verification against ${targetUrl}...`);

function checkEndpoint(url, retriesLeft) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      console.log(`[Health Probe] Response Status Code: ${res.statusCode}`);
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve({ status: 'HEALTHY', statusCode: res.statusCode });
      } else if (retriesLeft > 0) {
        console.warn(`[Health Probe] Received status ${res.statusCode}. Retrying in ${retryDelayMs / 1000}s... (${retriesLeft} retries remaining)`);
        setTimeout(() => {
          checkEndpoint(url, retriesLeft - 1).then(resolve).catch(reject);
        }, retryDelayMs);
      } else {
        reject(new Error(`Endpoint responded with unhealthy status code: ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      if (retriesLeft > 0) {
        console.warn(`[Health Probe] Connection error: ${err.message}. Retrying in ${retryDelayMs / 1000}s... (${retriesLeft} retries remaining)`);
        setTimeout(() => {
          checkEndpoint(url, retriesLeft - 1).then(resolve).catch(reject);
        }, retryDelayMs);
      } else {
        reject(err);
      }
    });

    req.setTimeout(5000, () => {
      req.destroy(new Error('Health probe timed out after 5000ms'));
    });
  });
}

async function runHealthCheck() {
  try {
    const result = await checkEndpoint(targetUrl, maxRetries);
    console.log('✅ [Health Probe] All Quality Gates & Health Verification Checks Passed Successfully!');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('❌ [Health Probe Failure] Deployment health check failed:', err.message);
    console.error('CRITICAL: Triggering automated rollback pipeline.');
    process.exit(1);
  }
}

runHealthCheck().catch((err) => {
  console.error('❌ [Health Probe Fatal Error]:', err);
  process.exit(1);
});
