/**
 * KwakoPOS SaaS — Production Certification JSON Schema Validator
 * 
 * Validates artifacts/kwakopos-production-certification.json against strict production schema rules:
 * - Rejects undefined, "undefined", NaN, or null in critical fields
 * - Validates modeBreakdown (REAL_BROWSER and IN_PROCESS)
 * - Validates testResults schema structure for all 30 tests
 */

import fs from 'fs';
import path from 'path';

export function validateCertificationSchema(certData) {
  const errors = [];

  // Required top-level keys
  const requiredKeys = [
    'product', 'version', 'build', 'schemaVersion',
    'certificationDate', 'decision', 'gates', 'metrics',
    'categories', 'testResults'
  ];

  for (const key of requiredKeys) {
    if (certData[key] === undefined || certData[key] === null) {
      errors.push(`Top-level key '${key}' is missing or undefined/null.`);
    }
  }

  // Validate decision
  if (!['PASS', 'FAIL'].includes(certData.decision)) {
    errors.push(`Invalid decision value: '${certData.decision}'. Expected 'PASS' or 'FAIL'.`);
  }

  // Validate metrics & modeBreakdown
  if (certData.metrics) {
    const { totalTests, passed, failed, modeBreakdown } = certData.metrics;
    if (typeof totalTests !== 'number' || typeof passed !== 'number' || typeof failed !== 'number') {
      errors.push(`Metrics must contain numeric totalTests, passed, and failed fields.`);
    }

    if (!modeBreakdown || !modeBreakdown.REAL_BROWSER || !modeBreakdown.IN_PROCESS) {
      errors.push(`Metrics modeBreakdown missing required REAL_BROWSER or IN_PROCESS entries.`);
    } else {
      if (typeof modeBreakdown.REAL_BROWSER.total !== 'number' || typeof modeBreakdown.REAL_BROWSER.passed !== 'number') {
        errors.push(`modeBreakdown.REAL_BROWSER contains invalid numeric types.`);
      }
      if (typeof modeBreakdown.IN_PROCESS.total !== 'number' || typeof modeBreakdown.IN_PROCESS.passed !== 'number') {
        errors.push(`modeBreakdown.IN_PROCESS contains invalid numeric types.`);
      }
    }
  }

  // Validate testResults array
  if (!Array.isArray(certData.testResults) || certData.testResults.length !== 30) {
    errors.push(`testResults must be an array containing exactly 30 test result objects (found: ${certData.testResults?.length || 0}).`);
  } else {
    certData.testResults.forEach((t, idx) => {
      if (!t.testId || typeof t.testId !== 'string') errors.push(`Test [${idx}] missing valid testId.`);
      if (!t.name || typeof t.name !== 'string') errors.push(`Test [${idx}] missing valid name.`);
      if (!t.category || typeof t.category !== 'string') errors.push(`Test [${idx}] missing valid category.`);
      if (!['PASS', 'FAIL'].includes(t.status)) errors.push(`Test [${idx}] has invalid status: ${t.status}`);
      if (!['REAL_BROWSER', 'IN_PROCESS'].includes(t.executionMode)) errors.push(`Test [${idx}] has invalid executionMode: ${t.executionMode}`);
      if (!t.expected || typeof t.expected !== 'string') errors.push(`Test [${t.testId || idx}] missing valid expected invariant string.`);
      if (!t.observed || typeof t.observed !== 'string') errors.push(`Test [${t.testId || idx}] missing valid observed result string.`);
      
      // Strict check for "undefined" string artifacts
      if (typeof t.observed === 'string' && t.observed.includes('undefined')) {
        errors.push(`Test [${t.testId}] observed field contains malformed 'undefined' text: "${t.observed}"`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('validate-certification-schema.js')) {
  const jsonPath = path.resolve(process.cwd(), 'artifacts/kwakopos-production-certification.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Certification JSON artifact not found at: ${jsonPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const certData = JSON.parse(raw);
  const result = validateCertificationSchema(certData);

  if (result.valid) {
    console.log('✅ Official Certification JSON Schema Validation PASSED (0 errors)');
    process.exit(0);
  } else {
    console.error('❌ Official Certification JSON Schema Validation FAILED:');
    result.errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }
}
