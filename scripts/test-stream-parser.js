/**
 * KwakoPos / Kwakoko SaaS — Native Stream Parser & Sanitization Unit Test Suite
 * Validates that parseRequestBody and sanitizeIncomingPayload accurately handle:
 * 1. Dropped/null variant_id -> 'no-variant' normalization
 * 2. Dropped/null deleted_at -> 0 13-digit Unix Epoch Millisecond timestamp
 * 3. Deeply nested JSON arrays and batch sync payloads
 * 4. Chunked HTTP readable stream aggregation
 */

import http from 'http';
import { EventEmitter } from 'events';

// Defensive Payload Sanitization Logic (Mirrors server.js)
function sanitizeIncomingPayload(data) {
  if (Array.isArray(data)) {
    return data.map(item => sanitizeIncomingPayload(item));
  }
  if (data !== null && typeof data === 'object') {
    if ('variant_id' in data || 'variantId' in data) {
      const v = data.variant_id || data.variantId;
      if (v === null || v === undefined || v === 'null' || v === 'undefined' || v === 'no-variant') {
        data.variant_id = 'no-variant';
        data.variantId = 'no-variant';
      }
    }
    
    if ('deleted_at' in data || 'deletedAt' in data) {
      const d = data.deleted_at !== undefined ? data.deleted_at : data.deletedAt;
      const numD = d === null || d === undefined ? 0 : Number(d);
      data.deleted_at = numD;
      data.deletedAt = numD;
    }

    for (const key in data) {
      if (typeof data[key] === 'object' && data[key] !== null) {
        data[key] = sanitizeIncomingPayload(data[key]);
      }
    }
  }
  return data;
}

async function parseRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        if (!body) return resolve({});
        const parsed = JSON.parse(body);
        const sanitized = sanitizeIncomingPayload(parsed);
        resolve(sanitized);
      } catch (e) {
        resolve({});
      }
    });
  });
}

// ─── TEST SUITE EXECUTION ──────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ TEST PASSED: ${message}`);
}

async function runTests() {
  console.log('🧪 Starting Native Stream Parser Unit Tests...\n');

  // Test 1: Single Object Null Normalization
  const test1Input = { id: 'p1', name: 'Milk', variant_id: null, deleted_at: null };
  const test1Out = sanitizeIncomingPayload(test1Input);
  assert(test1Out.variant_id === 'no-variant', 'Null variant_id converted to "no-variant"');
  assert(test1Out.deleted_at === 0, 'Null deleted_at converted to 0');

  // Test 2: Complex JSON Array Batch Normalization
  const test2Input = [
    { id: 'sl1', variant_id: null, deleted_at: '1723500000000' },
    { id: 'sl2', variant_id: 'var-99', deleted_at: null },
    { id: 'sl3', variantId: undefined, deletedAt: undefined }
  ];
  const test2Out = sanitizeIncomingPayload(test2Input);
  assert(test2Out[0].variant_id === 'no-variant', 'Array element 0 variant_id normalized');
  assert(test2Out[0].deleted_at === 1723500000000, 'Array element 0 deleted_at numeric converted');
  assert(test2Out[1].variant_id === 'var-99', 'Array element 1 valid variant_id preserved');
  assert(test2Out[1].deleted_at === 0, 'Array element 1 null deleted_at set to 0');
  assert(test2Out[2].variant_id === 'no-variant', 'Array element 2 camelCase variantId normalized');

  // Test 3: Deeply Nested Hierarchy Normalization
  const test3Input = {
    tenant_id: 't1',
    batch: [
      {
        order_id: 'ord-101',
        items: [
          { product_id: 'prod-1', variant_id: null, deleted_at: null },
          { product_id: 'prod-2', variant_id: 'no-variant', deleted_at: 1700000000000 }
        ]
      }
    ]
  };
  const test3Out = sanitizeIncomingPayload(test3Input);
  assert(test3Out.batch[0].items[0].variant_id === 'no-variant', 'Deep nested variant_id normalized');
  assert(test3Out.batch[0].items[0].deleted_at === 0, 'Deep nested deleted_at normalized');

  // Test 4: Chunked HTTP Stream Simulation
  const mockReq = new EventEmitter();
  const rawPayload = JSON.stringify([
    { id: 'chunk-1', variant_id: null, deleted_at: null }
  ]);

  const parsePromise = parseRequestBody(mockReq);

  // Emit chunked data
  mockReq.emit('data', rawPayload.substring(0, 15));
  mockReq.emit('data', rawPayload.substring(15));
  mockReq.emit('end');

  const streamResult = await parsePromise;
  assert(Array.isArray(streamResult), 'Chunked HTTP stream returns array');
  assert(streamResult[0].variant_id === 'no-variant', 'Stream chunked payload variant_id normalized');
  assert(streamResult[0].deleted_at === 0, 'Stream chunked payload deleted_at normalized');

  console.log('\n🎉 ALL STREAM PARSER UNIT TESTS PASSED CLEANLY!');
}

runTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
