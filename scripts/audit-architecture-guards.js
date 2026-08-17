/**
 * KwakoPOS SaaS — Architectural Static Guard Scanner
 * 
 * Scans src/components/ and src/pages/ to ensure zero direct IndexedDB business writes
 * bypassing Canonical Repository abstractions.
 */

import fs from 'fs';
import path from 'path';

const FORBIDDEN_PATTERNS = [
  /db\.(products|productVariants|categories|brands|customers|suppliers|sales|orders|stockLedger)\.(put|add|delete|bulkPut|bulkDelete)\s*\(/g,
  /indexedDB\.open\s*\(/g,
];

function scanDirectory(dirPath, violations = []) {
  if (!fs.existsSync(dirPath)) return violations;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath, violations);
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            // Exclude database core definitions or repository files if accidentally matched
            if (!fullPath.includes('src/db/repositories') && !fullPath.includes('src/db/dexie')) {
              violations.push({
                file: fullPath,
                line: index + 1,
                snippet: line.trim(),
              });
            }
          }
        }
      });
    }
  }

  return violations;
}

console.log('================================================================');
console.log('🛡️ KWAKOPOS ARCHITECTURAL STATIC GUARD AUDIT');
console.log('================================================================\n');

const componentsDir = path.resolve(process.cwd(), 'src/components');
const pagesDir = path.resolve(process.cwd(), 'src/pages');

const violations = [
  ...scanDirectory(componentsDir),
  ...scanDirectory(pagesDir),
];

if (violations.length === 0) {
  console.log('✅ ARCHITECTURAL GUARD AUDIT PASSED: 0 direct UI database writes detected.');
  console.log('   All UI components strictly interact through Canonical Repositories.\n');
  process.exit(0);
} else {
  console.error(`❌ ARCHITECTURAL GUARD AUDIT FAILED: ${violations.length} direct database write violations found!`);
  violations.forEach((v) => {
    console.error(`   - ${path.relative(process.cwd(), v.file)}:${v.line}: "${v.snippet}"`);
  });
  console.error('\n   Direct UI Dexie/IndexedDB writes are strictly forbidden. Use Canonical Repositories.\n');
  process.exit(1);
}
