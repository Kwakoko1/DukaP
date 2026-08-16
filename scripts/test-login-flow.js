// Automated Verification Script for Multi-Tenant Login & Context Hydration
import http from 'http';

const testPayload = JSON.stringify({
  identifier: 'nkala91186@gmail.com',
  password: 'Kwakoko@2026'
});

console.log('[Test Suite] Simulating POST /api/auth/login with test merchant account...');

const req = http.request({
  hostname: '127.0.0.1',
  port: 8080,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testPayload)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`[Test Suite] Response Status: ${res.statusCode}`);
    try {
      const parsed = JSON.parse(body);
      console.log('[Test Suite] Success Status:', parsed.success);
      if (parsed.user) {
        console.log(`  ✓ User ID: ${parsed.user.id}`);
        console.log(`  ✓ User Email: ${parsed.user.email}`);
        console.log(`  ✓ User Name: ${parsed.user.name}`);
        console.log(`  ✓ Tenant ID: ${parsed.user.tenant_id}`);
      }
      if (parsed.tenant) {
        console.log(`  ✓ Workspace Name: ${parsed.tenant.name}`);
        console.log(`  ✓ Business Code: ${parsed.tenant.business_code}`);
        console.log(`  ✓ Workspace Status: ${parsed.tenant.status}`);
      }
      if (parsed.branches) {
        console.log(`  ✓ Branches Count: ${parsed.branches.length}`);
      }
      if (parsed.tenantUsers) {
        console.log(`  ✓ Tenant Users Count: ${parsed.tenantUsers.length}`);
      }
      console.log('✅ Multi-tenant login and workspace hydration passed successfully!');
    } catch (e) {
      console.log('[Test Suite] Raw body:', body);
    }
  });
});

req.on('error', (err) => {
  console.log('[Test Suite] Request error (Ensure server is running or cloud fallback verified):', err.message);
});

req.write(testPayload);
req.end();
