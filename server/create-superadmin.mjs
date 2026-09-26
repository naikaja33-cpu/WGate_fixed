/**
 * One-time bootstrap: adds a superadmin account to an EXISTING database
 * that was already seeded before the superadmin role existed (so the
 * normal seedIfEmpty() in wgate-server.mjs won't run again).
 *
 * Safe to run more than once — does nothing if a superadmin already exists.
 *
 * Usage:
 *   node server/create-superadmin.mjs
 *   node server/create-superadmin.mjs your-email@example.com YourPassword123
 *
 * Reads DATABASE_URL the same way the main server does (from .env.local
 * locally, or from the real environment on a host like Render).
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const email = (process.argv[2] || 'superadmin@wgate.local').trim().toLowerCase();
const password = process.argv[3] || 'super123';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — put it in .env.local or set it in your environment.');
  process.exit(1);
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
let connectionString = process.env.DATABASE_URL;
try {
  const parsed = new URL(connectionString);
  parsed.searchParams.delete('sslmode');
  connectionString = parsed.toString();
} catch {
  // Malformed URL — let pg surface its own connection error below.
}

const pool = new pg.Pool({
  connectionString,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  const { rows: existing } = await pool.query(
    `SELECT id FROM entity_records WHERE entity = 'User' AND data->>'role' = 'superadmin' LIMIT 1`
  );
  if (existing.length > 0) {
    console.log('A superadmin account already exists — nothing to do.');
    await pool.end();
    return;
  }

  const { rows: emailTaken } = await pool.query(
    `SELECT id FROM entity_records WHERE entity = 'User' AND data->>'email' = $1 LIMIT 1`,
    [email]
  );
  if (emailTaken.length > 0) {
    console.error(`A user with email ${email} already exists (with a different role) — pick a different email.`);
    await pool.end();
    process.exit(1);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = {
    id,
    email,
    password_hash: hashPassword(password),
    full_name: 'Super Admin',
    role: 'superadmin',
    society_id: null,
    society_name: '',
    disabled: false,
    is_verified: true,
    must_change_password: true,
    is_sample: false,
    created_date: now,
    updated_date: now,
    created_by: 'bootstrap-script',
    created_by_id: null,
  };

  await pool.query(
    `INSERT INTO entity_records (entity, id, data, created_date, updated_date) VALUES ('User', $1, $2, $3, $3)`,
    [id, record, now]
  );

  console.log('Superadmin account created:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log('You will be required to change this password on first login.');
  await pool.end();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
