/**
 * KwakoPOS SaaS — Production Database Migration Runner
 * Executes versioned SQL migrations deterministically inside transactions.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env if present
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valParts] = trimmed.split('=');
      const val = valParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (key.trim() && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  });
}

const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL || (!isProduction ? 'postgresql://postgres:postgres@localhost:5432/kwakopos' : null);

if (!DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is not set. Cannot run database migrations.');
  process.exit(1);
}

const isSSLRequired = DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('neon.tech');

export async function runMigrations(customPool = null) {
  const pool = customPool || new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: isSSLRequired ? { rejectUnauthorized: false } : false,
    max: 5,
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();

  try {
    console.log('[Migration Runner] Checking PostgreSQL schema_migrations status...');
    
    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT,
        applied_at BIGINT NOT NULL
      );
    `);

    const existingRes = await client.query('SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;');
    const appliedVersions = new Set(existingRes.rows.map(r => r.version));

    const migrationsDir = path.join(rootDir, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.warn(`[Migration Runner] No migrations directory found at ${migrationsDir}`);
      return { success: true, appliedCount: 0 };
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const version = parseInt(match[1], 10);
      const name = match[2];

      if (appliedVersions.has(version)) {
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

      console.log(`[Migration Runner] Executing migration ${version} (${name})...`);

      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES ($1, $2, $3, $4)',
          [version, name, checksum, Date.now()]
        );
        await client.query('COMMIT');
        console.log(`[Migration Runner]  Applied migration ${version} (${name}) successfully.`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migration Runner]  Failed migration ${version} (${name}):`, err.message);
        throw err;
      }
    }

    console.log(`[Migration Runner] All migrations up to date. (${appliedCount} new migrations applied)`);
    return { success: true, appliedCount };
  } finally {
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('[Migration Runner] Database migration complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration Runner] Migration failed:', err);
      process.exit(1);
    });
}
