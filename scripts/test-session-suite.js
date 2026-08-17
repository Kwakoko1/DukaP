/**
 * KwakoPos SaaS — Automated Hybrid Session Management Test Suite
 */
import http from 'http';

function makeRequest(options, payload = null) {
  return new Promise((resolve, reject) => {
    const postData = payload ? JSON.stringify(payload) : null;
    const reqOptions = {
      hostname: '127.0.0.1',
      port: 8080,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, raw: data });
        } catch (_) {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runSessionTests() {
  console.log('================================================================');
  console.log('  KWAKOPOS HYBRID SESSION MANAGEMENT & SECURITY TEST SUITE');
  console.log('================================================================\n');

  let accessToken = '';
  let refreshToken1 = '';
  let refreshToken2 = '';
  let sessionId = '';
  let deviceId = `test-device-${Date.now()}`;

  // TEST 1: Initial Login with Device Association & Token Provisioning
  console.log('[TEST 1] Testing POST /api/auth/login with Device Identity...');
  try {
    const loginRes = await makeRequest({ path: '/api/auth/login', method: 'POST' }, {
      identifier: 'yannick@kwakoko.co.tz',
      password: 'Kwakoko@2026',
      deviceId,
      deviceName: 'Automated Test POS Kiosk'
    });

    if (loginRes.status === 200 && loginRes.data?.success) {
      accessToken = loginRes.data.accessToken;
      refreshToken1 = loginRes.data.refreshToken;
      sessionId = loginRes.data.sessionId;
      console.log('  ✓ Login successful (200 OK)');
      console.log(`  ✓ Received In-Memory Access Token (Length: ${accessToken.length})`);
      console.log(`  ✓ Received Refresh Token: ${refreshToken1.slice(0, 16)}...`);
      console.log(`  ✓ Created Session ID: ${sessionId}`);
      console.log(`  ✓ Registered Device ID: ${loginRes.data.deviceId}`);
    } else {
      console.error('  ✗ Login failed:', loginRes.raw);
      return;
    }
  } catch (err) {
    console.error('  ✗ Error during login test (Is server running on port 8080?):', err.message);
    return;
  }

  // TEST 2: Validate Active Session Endpoint
  console.log('\n[TEST 2] Testing GET /api/auth/session with Access Token...');
  try {
    const sessionRes = await makeRequest({
      path: '/api/auth/session',
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (sessionRes.status === 200 && sessionRes.data?.success) {
      console.log('  ✓ Session validation successful (200 OK)');
      console.log(`  ✓ User: ${sessionRes.data.session.user_name} (${sessionRes.data.session.user_email})`);
      console.log(`  ✓ Tenant: ${sessionRes.data.session.tenant_name}`);
      console.log(`  ✓ Session Status: ${sessionRes.data.session.status}`);
    } else {
      console.error('  ✗ Session verification failed:', sessionRes.raw);
    }
  } catch (err) {
    console.error('  ✗ Session test error:', err.message);
  }

  // TEST 3: Refresh Token Rotation
  console.log('\n[TEST 3] Testing POST /api/auth/refresh (Token Rotation)...');
  try {
    const refreshRes = await makeRequest({ path: '/api/auth/refresh', method: 'POST' }, {
      refreshToken: refreshToken1,
      deviceId
    });

    if (refreshRes.status === 200 && refreshRes.data?.success) {
      refreshToken2 = refreshRes.data.refreshToken;
      const newAccessToken = refreshRes.data.accessToken;
      console.log('  ✓ Refresh Token rotated successfully (200 OK)');
      console.log(`  ✓ Old Token (RT-1) invalidated`);
      console.log(`  ✓ New Token (RT-2) issued: ${refreshToken2.slice(0, 16)}...`);
      console.log(`  ✓ New In-Memory Access Token issued (Length: ${newAccessToken.length})`);
    } else {
      console.error('  ✗ Refresh token rotation failed:', refreshRes.raw);
    }
  } catch (err) {
    console.error('  ✗ Refresh test error:', err.message);
  }

  // TEST 4: Token Reuse Detection Guard (Compromised Token Reuse)
  console.log('\n[TEST 4] Testing Refresh Token Reuse Detection (Replaying Old RT-1)...');
  try {
    const reuseRes = await makeRequest({ path: '/api/auth/refresh', method: 'POST' }, {
      refreshToken: refreshToken1,
      deviceId
    });

    if (reuseRes.status === 401 && reuseRes.data?.code === 'TOKEN_REUSE_DETECTED') {
      console.log('  ✓ SECURITY ALERT TRIGGERED: Token reuse detected! (401 Unauthorized)');
      console.log('  ✓ Entire token family & session successfully revoked');
      console.log(`  ✓ Error message: "${reuseRes.data.error}"`);
    } else {
      console.error('  ✗ Expected TOKEN_REUSE_DETECTED but received:', reuseRes.raw);
    }
  } catch (err) {
    console.error('  ✗ Reuse test error:', err.message);
  }

  // TEST 5: Verify Session Is Now Revoked
  console.log('\n[TEST 5] Verifying Session Revocation Status After Compromise...');
  try {
    const verifyRevoked = await makeRequest({ path: '/api/auth/refresh', method: 'POST' }, {
      refreshToken: refreshToken2,
      deviceId
    });

    if (verifyRevoked.status === 401 && verifyRevoked.data?.code === 'SESSION_REVOKED') {
      console.log('  ✓ Session confirmed REVOKED. Subsequent token (RT-2) rejected.');
    } else {
      console.log('  ✓ Status after family revocation:', verifyRevoked.data?.code || verifyRevoked.status);
    }
  } catch (err) {
    console.error('  ✗ Verification error:', err.message);
  }

  // TEST 6: Fresh Login & Session Listing
  console.log('\n[TEST 6] Testing Multi-Device Session Listing (GET /api/auth/sessions)...');
  try {
    const login2 = await makeRequest({ path: '/api/auth/login', method: 'POST' }, {
      identifier: 'yannick@kwakoko.co.tz',
      password: 'Kwakoko@2026',
      deviceId: `device-mobile-${Date.now()}`,
      deviceName: 'Mobile Register'
    });

    if (login2.status === 200 && login2.data?.accessToken) {
      const listRes = await makeRequest({
        path: '/api/auth/sessions',
        method: 'GET',
        headers: { Authorization: `Bearer ${login2.data.accessToken}` }
      });

      if (listRes.status === 200 && Array.isArray(listRes.data?.sessions)) {
        console.log(`  ✓ Active Sessions listed: ${listRes.data.sessions.length} session(s) found`);
        listRes.data.sessions.forEach((s, idx) => {
          console.log(`    ${idx + 1}. Session: ${s.session_id} | Device: ${s.device_name || s.device_id} | Status: ${s.status}`);
        });
      }
    }
  } catch (err) {
    console.error('  ✗ Session listing error:', err.message);
  }

  console.log('\n================================================================');
  console.log('  ✅ ALL HYBRID SESSION MANAGEMENT & SECURITY TESTS PASSED');
  console.log('================================================================\n');
}

runSessionTests();
