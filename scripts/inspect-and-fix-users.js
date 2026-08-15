import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '..', '.env');
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

const connectionString = process.env.DATABASE_URL || process.env.VITE_POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/kwakopos';
const client = new pg.Client({ connectionString });

async function inspectAndFix() {
  await client.connect();
  console.log('Connected to DB.');
  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    ORDER BY ordinal_position
  `);
  console.log('Users table columns:');
  console.table(cols.rows);

  const users = await client.query('SELECT * FROM users');
  console.log('Current users:');
  console.table(users.rows);

  const tenants = await client.query('SELECT id, name, business_code FROM tenants');
  console.log('Current tenants:');
  console.table(tenants.rows);

  await client.end();
}

inspectAndFix().catch(console.error);
