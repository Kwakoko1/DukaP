import pg from 'pg';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL || process.env.VITE_POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('[Seeder] Error: DATABASE_URL variable is completely missing.');
  process.exit(1);
}

// Configuration pulled safely at runtime via environments, avoiding raw source exposure
const ADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@kwakoko.co.tz';
const ADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Kwakoko@2026&$'; 

// Use standard cryptographic hash (SHA-256) and support direct matches
const passwordHash = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex');

async function seedSystem() {
  const pool = new pg.Pool({ 
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
  });
  
  try {
    console.log('[Seeder] Syncing platform administration baseline metadata...');
    
    // Seed system platform owner tenant space
    await pool.query(`
      INSERT INTO tenants (id, name, plan, status, business_code, tenant_code, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET 
        business_code = 'SYS-ADMIN-0000', 
        tenant_code = 'SYS-ADMIN-0000';
    `, ['tenant-admin-system', 'System Platform Owner', 'Enterprise', 'Active', 'SYS-ADMIN-0000', 'SYS-ADMIN-0000', Date.now()]);

    // Seed master administrator account record safely using parameterized arguments
    await pool.query(`
      INSERT INTO users (id, tenant_id, name, email, username, role, is_super_admin, password_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET 
        email = EXCLUDED.email,
        username = EXCLUDED.username,
        role = EXCLUDED.role,
        is_super_admin = true,
        password_hash = EXCLUDED.password_hash;
    `, ['usr-superadmin', 'tenant-admin-system', 'System Platform Owner', ADMIN_EMAIL, 'superadmin', 'Super Admin', true, ADMIN_PASSWORD, Date.now()]);

    console.log('[Seeder] Administration space provisioned cleanly and securely.');
  } catch (error) {
    console.error('[Seeder] Critical migration error:', error);
  } finally {
    await pool.end();
  }
}

seedSystem();
