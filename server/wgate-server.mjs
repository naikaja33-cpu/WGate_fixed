/**
 * WGate backend — PostgreSQL edition, schema-per-society multi-tenancy.
 *
 * Architecture:
 *   - A shared/public schema holds: `societies` (the directory of all
 *     societies), `superadmins` (accounts not tied to any society), and
 *     `sessions` (routes each login to the right society's schema, or to
 *     the superadmin table when society_id is null).
 *   - Each society gets its OWN Postgres schema (e.g. society_a1b2c3...)
 *     containing its own `entity_records` table — User, Visitor,
 *     ServiceTicket, MaintenanceBill, Notice, SocietySettings all live
 *     there, fully separate from every other society's data. No shared
 *     table, no society_id filter needed to keep them apart — the schema
 *     boundary does that structurally.
 *
 * Works identically whether DATABASE_URL points at:
 *   - a Neon free Postgres project (recommended — no expiration), or
 *   - Render's own free Postgres (expires 30 days after creation), or
 *   - any other Postgres instance.
 *
 * Start it with `npm run dev` (starts this + Vite together) or `npm run dev:api`.
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import pg from 'pg';


// dotenv's default `dotenv/config` import only reads a file named
// `.env`. This project (and the rest of the Vite tooling) uses
// `.env.local`, so load that explicitly. Falls back silently if the
// file doesn't exist (e.g. when real env vars are injected by a host
// like Render instead).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });
// console.log('[DEBUG] cwd:', process.cwd());
// console.log('[DEBUG] APPS_SCRIPT_URL:', process.env.APPS_SCRIPT_URL);
// console.log('[DEBUG] APPS_SCRIPT_SECRET set:', !!process.env.APPS_SCRIPT_SECRET);
// console.log('[DEBUG] DATABASE_URL set:', !!process.env.DATABASE_URL);
const PORT = Number(process.env.WGATE_API_PORT || process.env.PORT || 4400);
// 0.0.0.0 works for local dev (still reachable via localhost) and is
// required by most hosting platforms (Render, etc.) which need the
// server to bind all interfaces, not just the loopback address.
const HOST = process.env.WGATE_API_HOST || '0.0.0.0';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_INVITE_PASSWORD = 'welcome123';
// How long a society's trial runs once the super admin approves it, and
// how many extra days it still gets in after the trial ends before login
// is hard-locked. During the grace period the society can still log in and
// use the app; after it, nobody can log in until the super admin extends
// the trial, upgrades the plan, or lifts a manual suspension.
const TRIAL_DAYS = 14;
const GRACE_DAYS = 7;
const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || '';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
// Sends email through your own Gmail via a small Google Apps Script (the "mail relay").
// It uses normal HTTPS, so it works on Render's free tier (which blocks SMTP).
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET || ''; // must equal RELAY_SECRET in the script
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'WGate';

// Returns { ok: true } or { ok: false, error }. Never throws, so an email problem can't break creating an account.
async function sendEmail({ to, subject, html, text }) {
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET) {
    return { ok: false, error: 'Email is not configured on the server' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // the script can take a few seconds to wake up
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: APPS_SCRIPT_SECRET, to, subject, html, text, fromName: EMAIL_FROM_NAME }),
      redirect: 'follow', // Google answers with a redirect to the real result
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* not JSON, handled below */ }
    if (!response.ok || !data) {
      console.error(`[wgate-api] Apps Script answered ${response.status} without a JSON result`);
      return { ok: false, error: 'The email relay did not answer correctly (check APPS_SCRIPT_URL, and that its access is set to "Anyone")' };
    }
    if (!data.ok) {
      console.error(`[wgate-api] Apps Script refused: ${String(data.error).slice(0, 100)}`);
      return {
        ok: false,
        error: data.error === 'Unauthorized'
          ? 'The email relay rejected the secret (APPS_SCRIPT_SECRET must match RELAY_SECRET in the script)'
          : `Email relay: ${data.error}`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.error('[wgate-api] Failed to send email via Apps Script:', err?.name === 'AbortError' ? 'timed out' : err?.message);
    return { ok: false, error: 'Could not reach the email relay' };
  } finally {
    clearTimeout(timer);
  }
}



const ENTITIES = ['User', 'SocietySettings', 'Visitor', 'ServiceTicket', 'MaintenanceBill', 'Notice', 'AmenityBooking', 'PreApproval', 'GatePass'];

const ENTITY_DEFAULTS = {
  User: { role: 'tenant' },
  Visitor: { status: 'pending' },
  ServiceTicket: { priority: 'medium', status: 'open' },
  MaintenanceBill: { status: 'pending' },
  Notice: { type: 'announcement', is_pinned: false },
  AmenityBooking: { status: 'pending' },
  PreApproval: { status: 'active' },
  GatePass: { status: 'active' },
};

// Characters a gate pass code is built from — no 0/O or 1/I/L, so a guard
// reading it off a phone screen never has to guess which character it is.
const GATE_PASS_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomGatePassCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += GATE_PASS_CODE_CHARS[Math.floor(Math.random() * GATE_PASS_CODE_CHARS.length)];
  return code;
}
async function generateUniqueGatePassCode(schemaName) {
  const existing = await listEntity(schemaName, 'GatePass');
  const taken = new Set(existing.map((p) => p.code));
  let code = randomGatePassCode();
  let attempts = 0;
  while (taken.has(code) && attempts < 10) {
    code = randomGatePassCode();
    attempts += 1;
  }
  return code;
}

// Who a pre-approval can be registered for. Keep this in sync with the
// PRE_APPROVAL_CATEGORIES list in src/pages/PreApprovals.jsx.
const PRE_APPROVAL_CATEGORIES = ['Guest', 'Maid', 'Cook', 'Nanny', 'Driver', 'Delivery', 'Other'];

// Amenities residents can book. Add/remove names here to change what shows
// up in the booking form — no other code needs to change.
const AMENITIES = ['Clubhouse', 'Swimming Pool', 'Party Hall', 'Gym', 'Tennis Court'];

// Two time ranges (both "HH:MM" 24h strings) overlap if one starts before
// the other ends, in both directions.
const timesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

const ROLES = ['admin', 'tenant', 'owner', 'guard'];
const SELF_EDITABLE_FIELDS = ['full_name', 'phone', 'flat_number'];

/* ------------------------------------------------------------------ */
/* WhatsApp notifications (Twilio)                                    */
/* Configure via env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,     */
/* TWILIO_WHATSAPP_FROM (e.g. "whatsapp:+14155238886" for the Twilio  */
/* sandbox, or your own approved WhatsApp sender number).             */
/* If these aren't set, sends are skipped — never blocks the request. */
/* ------------------------------------------------------------------ */

// Turns a stored 10-digit phone (or anything already with a country code)
// into Twilio's required "whatsapp:+<countrycode><number>" format.
function toWhatsAppAddress(phone, countryCode = '91') {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 ? `${countryCode}${digits}` : digits;
  return `whatsapp:+${withCountry}`;
}

async function sendWhatsAppMessage(toPhone, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    console.warn('[whatsapp] Twilio not configured — skipping message');
    return;
  }
  const to = toWhatsAppAddress(toPhone);
  if (!to) return;
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({ From: from, To: to, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!res.ok) {
      console.error('[whatsapp] Twilio send failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('[whatsapp] Twilio send error:', err.message);
  }
}

/* ------------------------------------------------------------------ */
/* Password + token helpers (node:crypto only)                        */
/* ------------------------------------------------------------------ */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function generateTempPassword() {
  return `Temp-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);
const normEmail = (email) => String(email || '').trim().toLowerCase();
const isValidPhone = (phone) => {
  if (!phone) return true;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

/* ------------------------------------------------------------------ */
/* Postgres connection                                                */
/* ------------------------------------------------------------------ */

if (!process.env.DATABASE_URL) {
  console.error(
    '[wgate-api] DATABASE_URL is not set. Point it at a Postgres connection string ' +
    '(e.g. a Neon project) — see server/README-local.md.'
  );
  process.exit(1);
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[wgate-api] Unexpected Postgres error on idle client:', err.message);
});

/* ------------------------------------------------------------------ */
/* Schema-per-society helpers                                         */
/* ------------------------------------------------------------------ */

// Society ids are always crypto.randomUUID() generated by this server,
// so this pattern is a defensive check, not user-facing validation.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function schemaNameForSociety(societyId) {
  if (typeof societyId !== 'string' || !UUID_RE.test(societyId)) {
    throw Object.assign(new Error('Invalid society id'), { status: 400 });
  }
  return `society_${societyId.replace(/-/g, '')}`;
}

async function ensureSocietySchema(schemaName) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".entity_records (
      entity TEXT NOT NULL,
      id UUID NOT NULL,
      data JSONB NOT NULL,
      created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (entity, id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_entity_records_entity ON "${schemaName}".entity_records(entity);`);
}

/* ------------------------------------------------------------------ */
/* Shared (public schema) tables: societies, superadmins, sessions    */
/* ------------------------------------------------------------------ */

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS societies (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      total_flats INT,
      schema_name TEXT NOT NULL UNIQUE,
      created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Self-service signup support: a society created via /api/signup starts
  // unapproved and nobody in it can log in until a super admin approves it.
  // Approving stamps approved_at and starts the trial window.
  await pool.query(`ALTER TABLE societies ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial';`);
  await pool.query(`ALTER TABLE societies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE societies ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE societies ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;`);
  // Manual hard lock — independent of trial/grace, settable by the super
  // admin at any time (e.g. non-payment, abuse, a support hold).
  await pool.query(`ALTER TABLE societies ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE societies ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE societies ADD COLUMN IF NOT EXISTS suspended_reason TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS superadmins (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      must_change_password BOOLEAN NOT NULL DEFAULT true,
      disabled BOOLEAN NOT NULL DEFAULT false,
      created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      society_id UUID,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);`);
}

function rowToSociety(row) {
  return {
    id: row.id,
    name: row.name,
    city: row.city || '',
    address: row.address || '',
    total_flats: row.total_flats,
    plan: row.plan || 'trial',
    trial_ends_at: row.trial_ends_at instanceof Date ? row.trial_ends_at.toISOString() : row.trial_ends_at,
    approved: row.approved === true,
    approved_at: row.approved_at instanceof Date ? row.approved_at.toISOString() : row.approved_at,
    suspended: row.suspended === true,
    suspended_at: row.suspended_at instanceof Date ? row.suspended_at.toISOString() : row.suspended_at,
    suspended_reason: row.suspended_reason || '',
    created_date: row.created_date instanceof Date ? row.created_date.toISOString() : row.created_date,
    updated_date: row.updated_date instanceof Date ? row.updated_date.toISOString() : row.updated_date,
  };
}

// Where a society stands right now: 'trial' (counting down), 'grace' (trial
// over, still usable), 'locked' (grace over — hard-locked), or 'active'
// (not on a time-limited trial at all, e.g. a paid plan or no trial set).
// Suspension is reported separately since it can hit a society on any plan.
function trialStatusFor(society) {
  if (!society.trial_ends_at) return { status: 'active' };
  const now = Date.now();
  const trialEndsAt = new Date(society.trial_ends_at).getTime();
  const graceEndsAt = trialEndsAt + GRACE_DAYS * 24 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  if (now <= trialEndsAt) {
    return { status: 'trial', trial_ends_at: society.trial_ends_at, days_left: Math.ceil((trialEndsAt - now) / dayMs) };
  }
  if (now <= graceEndsAt) {
    return { status: 'grace', trial_ends_at: society.trial_ends_at, grace_ends_at: new Date(graceEndsAt).toISOString(), grace_days_left: Math.ceil((graceEndsAt - now) / dayMs) };
  }
  return { status: 'locked', trial_ends_at: society.trial_ends_at, grace_ends_at: new Date(graceEndsAt).toISOString() };
}

// Returns { code, message } if this society may not log in or use the app
// right now, or null if access is fine. Checked both at login and on every
// authenticated request, so a society that gets suspended or runs out its
// grace period is cut off immediately, not just blocked from a fresh login.
function societyAccessIssue(society) {
  if (!society) return null; // superadmin accounts aren't tied to a society
  if (!society.approved) {
    return {
      code: 'society_not_approved',
      message: 'Your society is awaiting super admin approval. You will be able to sign in once it is approved.',
    };
  }
  if (society.suspended) {
    return {
      code: 'society_suspended',
      message: society.suspended_reason
        ? `Your society has been suspended: ${society.suspended_reason}. Contact your super admin.`
        : 'Your society has been suspended by the super admin. Contact your super admin to resolve this.',
    };
  }
  const trialStatus = trialStatusFor(society);
  if (trialStatus.status === 'locked') {
    return {
      code: 'trial_locked',
      message: 'Your trial and grace period have ended. Contact your super admin to upgrade your plan.',
    };
  }
  return null;
}

async function listSocieties() {
  const { rows } = await pool.query('SELECT * FROM societies ORDER BY name');
  return rows.map(rowToSociety);
}

async function getSocietyById(id) {
  if (!id || typeof id !== 'string') return null;
  const { rows } = await pool.query('SELECT * FROM societies WHERE id = $1', [id]);
  return rows[0] ? rowToSociety(rows[0]) : null;
}

async function getSocietySchemaName(id) {
  const { rows } = await pool.query('SELECT schema_name FROM societies WHERE id = $1', [id]);
  return rows[0]?.schema_name || null;
}

async function createSocietyRecord({ name, city, address, total_flats, approved = false, plan = 'trial', trialEndsAt = null }) {
  const id = newId();
  const schemaName = schemaNameForSociety(id);
  await pool.query(
    `INSERT INTO societies (id, name, city, address, total_flats, schema_name, approved, approved_at, plan, trial_ends_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, name, city || '', address || '', total_flats ?? null, schemaName, approved, approved ? nowIso() : null, plan, trialEndsAt]
  );
  await ensureSocietySchema(schemaName);
  return getSocietyById(id);
}

// Approving a self-signed-up society is what starts its trial clock — until
// then nobody in it (not even its admin) is allowed to log in.
async function approveSocietyRecord(id) {
  const existing = await getSocietyById(id);
  if (!existing) return null;
  const trialEndsAt = existing.trial_ends_at || new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await pool.query(
    `UPDATE societies SET approved = true, approved_at = now(), trial_ends_at = $1, updated_date = now() WHERE id = $2`,
    [trialEndsAt, id]
  );
  return getSocietyById(id);
}

async function updateSocietyRecord(id, patch) {
  const existing = await getSocietyById(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  await pool.query(
    `UPDATE societies SET name=$1, city=$2, address=$3, total_flats=$4, updated_date=now() WHERE id=$5`,
    [merged.name, merged.city, merged.address, merged.total_flats, id]
  );
  return getSocietyById(id);
}

async function deleteSocietyRecord(id) {
  const schemaName = await getSocietySchemaName(id);
  if (!schemaName) return false;
  await pool.query('DELETE FROM sessions WHERE society_id = $1', [id]);
  await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await pool.query('DELETE FROM societies WHERE id = $1', [id]);
  return true;
}

/* ------------------------------------------------------------------ */
/* Per-society entity data access (schema-qualified)                  */
/* ------------------------------------------------------------------ */

async function listEntity(schemaName, entity) {
  const { rows } = await pool.query(`SELECT data FROM "${schemaName}".entity_records WHERE entity = $1`, [entity]);
  return rows.map((r) => r.data);
}

async function countEntity(schemaName, entity) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM "${schemaName}".entity_records WHERE entity = $1`, [entity]);
  return rows[0].n;
}

async function getEntityRecord(schemaName, entity, id) {
  const { rows } = await pool.query(`SELECT data FROM "${schemaName}".entity_records WHERE entity = $1 AND id = $2`, [entity, id]);
  return rows[0]?.data || null;
}

async function insertEntityRecord(schemaName, entity, record) {
  await pool.query(
    `INSERT INTO "${schemaName}".entity_records (entity, id, data, created_date, updated_date) VALUES ($1,$2,$3,$4,$5)`,
    [entity, record.id, record, record.created_date, record.updated_date]
  );
  return record;
}

async function updateEntityRecord(schemaName, entity, id, record) {
  await pool.query(
    `UPDATE "${schemaName}".entity_records SET data=$1, updated_date=$2 WHERE entity=$3 AND id=$4`,
    [record, record.updated_date, entity, id]
  );
  return record;
}

async function deleteEntityRecord(schemaName, entity, id) {
  await pool.query(`DELETE FROM "${schemaName}".entity_records WHERE entity=$1 AND id=$2`, [entity, id]);
}

async function findUserByEmail(schemaName, email) {
  const { rows } = await pool.query(
    `SELECT data FROM "${schemaName}".entity_records WHERE entity = 'User' AND data->>'email' = $1`,
    [normEmail(email)]
  );
  return rows[0]?.data || null;
}

/* ------------------------------------------------------------------ */
/* Seed data (only on a fresh database)                                */
/* ------------------------------------------------------------------ */

function baseRecord(extra = {}) {
  const ts = nowIso();
  return {
    id: newId(),
    created_date: ts,
    updated_date: ts,
    created_by: 'admin@wgate.local',
    created_by_id: null,
    is_sample: false,
    ...extra,
  };
}

async function seedIfEmpty() {
  const { rows: societyCountRows } = await pool.query('SELECT COUNT(*)::int AS n FROM societies');
  if (societyCountRows[0].n === 0) {
    const society = await createSocietyRecord({
      name: 'Green Valley Residency',
      address: '12, Lake View Road',
      city: 'Bengaluru',
      total_flats: 120,
      approved: true,
      plan: 'pro',
    });
    const schemaName = await getSocietySchemaName(society.id);

    const mkUser = (email, password, full_name, role, flat_number, phone) =>
      baseRecord({
        email,
        password_hash: hashPassword(password),
        full_name,
        role,
        flat_number,
        phone,
        society_id: society.id,
        society_name: society.name,
        disabled: false,
        is_verified: true,
      });

    const admin = mkUser('admin@wgate.local', 'admin123', 'WGate Admin', 'admin', 'Office', '9000000001');
    const guard = mkUser('guard@wgate.local', 'guard123', 'Gate Guard', 'guard', '', '9000000002');
    const tenant = mkUser('tenant@wgate.local', 'tenant123', 'Asha Tenant', 'tenant', 'A-101', '9000000003');
    const owner = mkUser('owner@wgate.local', 'owner123', 'Om Owner', 'owner', 'B-202', '9000000004');
    for (const u of [admin, guard, tenant, owner]) await insertEntityRecord(schemaName, 'User', u);

    const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

    await insertEntityRecord(schemaName, 'Visitor', baseRecord({
      visitor_name: 'Rahul Sharma',
      visitor_phone: '9876543210',
      purpose: 'guest',
      flat_number: 'A-101',
      resident_email: tenant.email,
      status: 'pending',
      vehicle_number: 'KA01AB1234',
      check_in_time: hoursAgo(1),
    }));
    await insertEntityRecord(schemaName, 'Visitor', baseRecord({
      visitor_name: 'Swiggy Delivery',
      visitor_phone: '9123456780',
      purpose: 'delivery',
      flat_number: 'B-202',
      resident_email: owner.email,
      status: 'approved',
      check_in_time: hoursAgo(3),
    }));

    await insertEntityRecord(schemaName, 'ServiceTicket', baseRecord({
      title: 'Kitchen tap leaking',
      description: 'The kitchen tap has been dripping since yesterday.',
      category: 'plumber',
      priority: 'medium',
      status: 'open',
      flat_number: 'A-101',
      resident_email: tenant.email,
    }));
    await insertEntityRecord(schemaName, 'ServiceTicket', baseRecord({
      title: 'Corridor light not working',
      description: 'Second floor corridor light is out.',
      category: 'electrician',
      priority: 'low',
      status: 'in_progress',
      flat_number: 'B-202',
      resident_email: owner.email,
      assigned_to: 'Society electrician',
    }));

    await insertEntityRecord(schemaName, 'Notice', baseRecord({
      title: 'Welcome to WGate',
      content: 'This is your WGate environment, with each society kept in its own database schema. Post notices, track visitors and manage service tickets.',
      type: 'announcement',
      society_id: society.id,
      society_name: society.name,
      posted_by: admin.full_name,
      is_pinned: true,
    }));

    const month = new Date().toISOString().slice(0, 7);
    await insertEntityRecord(schemaName, 'MaintenanceBill', baseRecord({
      flat_number: 'A-101',
      resident_email: tenant.email,
      resident_name: tenant.full_name,
      amount: 2500,
      month,
      month_label: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      due_date: `${month}-10`,
      status: 'pending',
    }));

    console.log('[wgate-api] Seeded development data with local accounts (see server/README-local.md).');
  }

  const { rows: saCountRows } = await pool.query('SELECT COUNT(*)::int AS n FROM superadmins');
  if (saCountRows[0].n === 0) {
    await pool.query(
      `INSERT INTO superadmins (id, email, password_hash, full_name, must_change_password) VALUES ($1,$2,$3,$4,true)`,
      [newId(), 'superadmin@wgate.local', hashPassword('super123'), 'Super Admin']
    );
    console.log('[wgate-api] Seeded superadmin account.');
  }
}

/* ------------------------------------------------------------------ */
/* Auth: sessions, superadmin table, login resolution                 */
/* ------------------------------------------------------------------ */

function publicUser(user) {
  if (!user) return null;
  // eslint-disable-next-line no-unused-vars
  const { password_hash, ...rest } = user;
  return {
    ...rest,
    // Default to true for any record that predates this field — forces a
    // password change rather than silently trusting an old password.
    must_change_password: user.must_change_password !== false,
  };
}

function superadminRowToUser(row) {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    full_name: row.full_name,
    role: 'superadmin',
    society_id: null,
    society_name: '',
    disabled: row.disabled,
    must_change_password: row.must_change_password,
    is_verified: true,
    is_sample: false,
    created_date: row.created_date instanceof Date ? row.created_date.toISOString() : row.created_date,
    updated_date: row.updated_date instanceof Date ? row.updated_date.toISOString() : row.updated_date,
    created_by: 'system',
    created_by_id: null,
  };
}

async function createSession(userId, societyId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO sessions (id, user_id, society_id, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)`,
    [newId(), userId, societyId || null, sha256(token), new Date(Date.now() + SESSION_TTL_MS)]
  );
  return token;
}
// Retention windows (days) — how long to keep a record after it's no
// longer "active" before it gets purged to save space. Tune via env vars
// without a code change; set any to 0 to disable cleanup for that entity.
// MaintenanceBill is intentionally never auto-deleted — financial records.
const RETENTION_DAYS = {
  GatePass: Number(process.env.RETENTION_GATEPASS_DAYS || 90),
  PreApproval: Number(process.env.RETENTION_PREAPPROVAL_DAYS || 90),
  AmenityBooking: Number(process.env.RETENTION_AMENITY_DAYS || 180),
  Visitor: Number(process.env.RETENTION_VISITOR_DAYS || 365),
  ServiceTicket: Number(process.env.RETENTION_TICKET_DAYS || 365),
};

async function cleanupOldRecords() {
  const { rows: schemas } = await pool.query(`SELECT schema_name FROM societies`);
  const cutoff = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  for (const { schema_name } of schemas) {
    try {
      if (RETENTION_DAYS.GatePass > 0) {
        await pool.query(
          `DELETE FROM "${schema_name}".entity_records
           WHERE entity = 'GatePass' AND data->>'status' IN ('used','cancelled')
             AND updated_date < $1`,
          [cutoff(RETENTION_DAYS.GatePass)]
        );
      }
      if (RETENTION_DAYS.PreApproval > 0) {
        await pool.query(
          `DELETE FROM "${schema_name}".entity_records
           WHERE entity = 'PreApproval' AND data->>'status' = 'cancelled'
             AND updated_date < $1`,
          [cutoff(RETENTION_DAYS.PreApproval)]
        );
      }
      if (RETENTION_DAYS.AmenityBooking > 0) {
        await pool.query(
          `DELETE FROM "${schema_name}".entity_records
           WHERE entity = 'AmenityBooking' AND data->>'status' IN ('rejected','cancelled')
             AND updated_date < $1`,
          [cutoff(RETENTION_DAYS.AmenityBooking)]
        );
      }
      if (RETENTION_DAYS.Visitor > 0) {
        await pool.query(
          `DELETE FROM "${schema_name}".entity_records
           WHERE entity = 'Visitor' AND data->>'check_out_time' IS NOT NULL
             AND updated_date < $1`,
          [cutoff(RETENTION_DAYS.Visitor)]
        );
      }
      if (RETENTION_DAYS.ServiceTicket > 0) {
        await pool.query(
          `DELETE FROM "${schema_name}".entity_records
           WHERE entity = 'ServiceTicket' AND data->>'status' IN ('resolved','closed')
             AND updated_date < $1`,
          [cutoff(RETENTION_DAYS.ServiceTicket)]
        );
      }
    } catch (err) {
      console.error(`[cleanup] Failed for schema ${schema_name}:`, err.message);
    }
  }
  console.log('[cleanup] Retention cleanup pass complete.');
}
async function pruneSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
}

async function resolveSession(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    'SELECT * FROM sessions WHERE token_hash = $1 AND expires_at > now()',
    [sha256(token)]
  );
  const session = rows[0];
  if (!session) return null;

  if (!session.society_id) {
    const { rows: saRows } = await pool.query('SELECT * FROM superadmins WHERE id = $1', [session.user_id]);
    const sa = saRows[0];
    if (!sa || sa.disabled) return null;
    return { session, user: superadminRowToUser(sa), society: null, schemaName: null };
  }

  const society = await getSocietyById(session.society_id);
  if (!society) return null;
  const schemaName = await getSocietySchemaName(session.society_id);
  const user = await getEntityRecord(schemaName, 'User', session.user_id);
  if (!user || user.disabled) return null;
  return { session, user, society, schemaName };
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  if (typeof req.query.token === 'string') return req.query.token; // EventSource cannot set headers
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const resolved = await resolveSession(bearerToken(req));
    if (!resolved) return res.status(401).json({ message: 'Authentication required' });
    // Catches a society that gets suspended, or runs out its grace period,
    // while its members are still signed in — not just at their next login.
    const issue = societyAccessIssue(resolved.society);
    if (issue) return res.status(403).json(issue);
    req.user = resolved.user;
    req.session = resolved.session;
    req.society = resolved.society;
    req.schemaName = resolved.schemaName;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
}

function requireSuperadmin(req, res, next) {
  if (req.user?.role !== 'superadmin') return res.status(403).json({ message: 'Super admin access required' });
  next();
}

function requireSocietySchema(req, res, next) {
  if (!req.schemaName) return res.status(403).json({ message: 'Not available for super admin accounts' });
  next();
}

/* ------------------------------------------------------------------ */
/* Server-sent events (for entity.subscribe)                          */
/* ------------------------------------------------------------------ */

const sseClients = new Map(); // res -> schemaName

function broadcast(schemaName, entity, type, record) {
  if (sseClients.size === 0) return;
  const data = entity === 'User' ? publicUser(record) : record;
  const payload = `data: ${JSON.stringify({ entity, type, id: record.id, data, timestamp: nowIso() })}\n\n`;
    for (const [client, info] of sseClients) {
    if (info.schema === schemaName && canRead(info.user, entity, record)) client.write(payload);
  }
}

/* ------------------------------------------------------------------ */
/* In-memory query helpers (applied to rows fetched from Postgres)    */
/* ------------------------------------------------------------------ */

function matchesCondition(actual, condition) {
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    return Object.entries(condition).every(([op, expected]) => {
      switch (op) {
        case '$eq': return actual === expected;
        case '$ne': return actual !== expected;
        case '$in': return Array.isArray(expected) && expected.includes(actual);
        case '$nin': return Array.isArray(expected) && !expected.includes(actual);
        case '$gt': return actual > expected;
        case '$gte': return actual >= expected;
        case '$lt': return actual < expected;
        case '$lte': return actual <= expected;
        case '$exists': return (actual !== undefined && actual !== null) === Boolean(expected);
        case '$regex': {
          try { return new RegExp(expected, 'i').test(String(actual ?? '')); } catch { return false; }
        }
        default: return false;
      }
    });
  }
  if (Array.isArray(actual)) return actual.includes(condition);
  return actual === condition;
}

function matchesQuery(record, query) {
  if (!query || typeof query !== 'object') return true;
  return Object.entries(query).every(([field, condition]) => {
    if (field === '$or') return Array.isArray(condition) && condition.some((q) => matchesQuery(record, q));
    if (field === '$and') return Array.isArray(condition) && condition.every((q) => matchesQuery(record, q));
    return matchesCondition(record[field], condition);
  });
}

function sortRecords(records, sort) {
  if (!sort || typeof sort !== 'string') return records;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [...records].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    const cmp = av < bv ? -1 : 1;
    return desc ? -cmp : cmp;
  });
}

const clean = (entity, record) => (entity === 'User' ? publicUser(record) : record);

/* ------------------------------------------------------------------ */
/* App                                                                */
/* ------------------------------------------------------------------ */

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ success: true, message: 'WGate backend is running', storage: 'postgres', time: nowIso() });
}));

app.get('/api/public-settings', (_req, res) => {
  res.json({ id: 'wgate-local', public_settings: { auth_mode: 'local', app_name: 'WGate' } });
});

app.get('/api/public/societies', wrap(async (_req, res) => {
  const societies = await listSocieties();
  // Only approved societies can log in, so only offer those on the login
  // screen — a society that just signed up has nothing to select yet.
  res.json(
    societies
      .filter((s) => s.approved)
      .map(({ id, name, city, total_flats }) => ({ id, name, city, total_flats }))
  );
}));

/* Self-service signup. Creates the society and its first admin, but the
   society starts unapproved: nobody in it can log in until a super admin
   approves it (see POST /api/superadmin/societies/:id/approve), at which
   point its trial period starts. */
app.post('/api/signup', wrap(async (req, res) => {
  const name = String(req.body?.society_name || '').trim();
  if (!name) return res.status(400).json({ message: 'Society name is required' });

  const email = normEmail(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const password = req.body?.password;
  if (!password || String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
    if (!isValidPhone(req.body?.phone)) {
    return res.status(400).json({ message: 'Enter a valid phone number' });
  }

  const society = await createSocietyRecord({
    name,
    city: req.body?.city,
    address: req.body?.address,
    total_flats: req.body?.total_flats ?? null,
    approved: false,
    plan: 'trial',
  });
  const schemaName = await getSocietySchemaName(society.id);

  const admin = {
    ...baseRecord({ created_by: email, created_by_id: null }),
    email,
    password_hash: hashPassword(password),
    full_name: req.body?.full_name || email.split('@')[0],
    role: 'admin',
    flat_number: req.body?.flat_number || '',
    phone: req.body?.phone || '',
    society_id: society.id,
    society_name: society.name,
    disabled: false,
    is_verified: false,
    must_change_password: false,
  };
  await insertEntityRecord(schemaName, 'User', admin);

  res.status(201).json({
    message: 'Thanks for signing up. A super admin will review your society and approve it before you can sign in.',
    society: { id: society.id, name: society.name },
  });
}));

/* ---------------------------- auth ---------------------------- */

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const password = req.body?.password;
  const requestedSocietyId = req.body?.society_id || null;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  if (!requestedSocietyId) {
    // No society selected — this is the super admin login path.
    const { rows } = await pool.query('SELECT * FROM superadmins WHERE email = $1', [email]);
    const sa = rows[0];
    if (!sa || sa.disabled || !verifyPassword(password, sa.password_hash)) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    await pruneSessions();
    const token = await createSession(sa.id, null);
    return res.json({ token, user: publicUser(superadminRowToUser(sa)) });
  }

  const society = await getSocietyById(requestedSocietyId);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  const schemaName = await getSocietySchemaName(requestedSocietyId);

  const user = await findUserByEmail(schemaName, email);
  if (!user || user.disabled || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  const issue = societyAccessIssue(society);
  if (issue) return res.status(403).json(issue);

  await pruneSessions();
  const token = await createSession(user.id, requestedSocietyId);
  // Lets the app show a "trial ends in N days" / "in grace period" banner
  // without a separate request — included on every successful login.
  res.json({ token, user: publicUser(user), society_status: trialStatusFor(society) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = bearerToken(req);
  if (token) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  }
  res.json({ success: true });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    ...publicUser(req.user),
    society_status: req.society ? trialStatusFor(req.society) : undefined,
  });
});

app.patch('/api/auth/me', requireAuth, wrap(async (req, res) => {
  if (!req.schemaName) {
    // Super admin self-update — just full_name is editable here.
    if (req.body?.full_name !== undefined) {
      await pool.query('UPDATE superadmins SET full_name = $1, updated_date = now() WHERE id = $2', [req.body.full_name, req.user.id]);
    }
    const { rows } = await pool.query('SELECT * FROM superadmins WHERE id = $1', [req.user.id]);
    return res.json(publicUser(superadminRowToUser(rows[0])));
  }

  const patch = {};
  for (const key of SELF_EDITABLE_FIELDS) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
  }
    if (patch.phone !== undefined && !isValidPhone(patch.phone)) {
    return res.status(400).json({ message: 'Enter a valid phone number' });
  }
  const updated = { ...req.user, ...patch, updated_date: nowIso() };
  await updateEntityRecord(req.schemaName, 'User', updated.id, updated);
  broadcast(req.schemaName, 'User', 'update', updated);
  res.json(publicUser(updated));
}));

app.post('/api/auth/change-password', requireAuth, wrap(async (req, res) => {
  const { current_password: current, new_password: next } = req.body || {};
  if (!verifyPassword(current, req.user.password_hash)) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  if (!next || String(next).length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }
  const newHash = hashPassword(next);

  if (!req.schemaName) {
    await pool.query(
      'UPDATE superadmins SET password_hash = $1, must_change_password = false, updated_date = now() WHERE id = $2',
      [newHash, req.user.id]
    );
    const { rows } = await pool.query('SELECT * FROM superadmins WHERE id = $1', [req.user.id]);
    return res.json({ success: true, user: publicUser(superadminRowToUser(rows[0])) });
  }

  const updated = { ...req.user, password_hash: newHash, must_change_password: false, updated_date: nowIso() };
  await updateEntityRecord(req.schemaName, 'User', updated.id, updated);
  res.json({ success: true, user: publicUser(updated) });
}));
/* A member who is locked out can request a password reset from the login
   screen without being signed in. This does NOT reset the password itself —
   it only files a request for the society's admin to act on, since there is
   no email/SMS sending configured to verify the requester's identity safely. */
app.post('/api/auth/forgot-password', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const societyId = req.body?.society_id;
  const genericResponse = { message: 'If that email exists in this society, your admin has been notified.' };
  if (!email || !societyId) return res.json(genericResponse); // never reveal which part was wrong

  const society = await getSocietyById(societyId);
  if (!society) return res.json(genericResponse);
  const schemaName = await getSocietySchemaName(societyId);

  const user = await findUserByEmail(schemaName, email);
  if (!user || user.disabled) return res.json(genericResponse);

  const existing = await listEntity(schemaName, 'PasswordResetRequest');
  const alreadyPending = existing.some((r) => r.user_id === user.id && r.status === 'pending');
  if (!alreadyPending) {
    await insertEntityRecord(schemaName, 'PasswordResetRequest', baseRecord({
      created_by: email,
      created_by_id: user.id,
      user_id: user.id,
      email: user.email,
      full_name: user.full_name,
      society_id: society.id,
      status: 'pending',
    }));
  }
  res.json(genericResponse);
}));
function inviteEmailContent({ name, societyName, email, password, role }) {
  const loginUrl = APP_URL ? `${APP_URL}/#/` : '';
  const subject = `You've been added to ${societyName} on WGate`;

  const text = [
    `Hello ${name},`,
    '',
    `You've been added to ${societyName} on WGate as a${role === 'admin' ? 'n' : ''} ${role}.`,
    '',
    loginUrl ? `Sign in here: ${loginUrl}` : 'Ask your society admin for the WGate sign-in link.',
    `Email: ${email}`,
    `Temporary password: ${password}`,
    '',
    'You will be asked to choose a new password when you first sign in.',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <tr><td>
      <h2 style="margin:0 0 12px;font-size:20px;">Welcome to ${escapeHtml(societyName)}</h2>
      <p style="margin:0 0 16px;line-height:1.5;">Hello ${escapeHtml(name)}, you've been added to <strong>${escapeHtml(societyName)}</strong> on WGate as a${role === 'admin' ? 'n' : ''} <strong>${escapeHtml(role)}</strong>.</p>
      <table role="presentation" width="100%" style="background:#f4f5f7;border-radius:8px;padding:14px;margin:0 0 20px;font-size:14px;">
        <tr><td style="color:#6b7280;padding:2px 0;">Email</td><td style="font-weight:bold;text-align:right;">${escapeHtml(email)}</td></tr>
        <tr><td style="color:#6b7280;padding:2px 0;">Temporary password</td><td style="font-weight:bold;text-align:right;font-family:Consolas,monospace;">${escapeHtml(password)}</td></tr>
      </table>
      ${loginUrl ? `<p style="margin:0 0 20px;"><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;">Sign in to WGate</a></p>` : ''}
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">You'll be asked to choose a new password the first time you sign in.</p>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}
/* Invite a member */
app.post('/api/users/invite', requireAuth, requireAdmin, requireSocietySchema, wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Email is required' });
  if (await findUserByEmail(req.schemaName, email)) {
    return res.status(409).json({ message: 'A user with this email already exists in this society' });
  }
  if (!String(req.body?.phone || '').trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    if (!isValidPhone(req.body?.phone)) {
    return res.status(400).json({ message: 'Enter a valid phone number' });
  }
  if (!String(req.body?.flat_number || '').trim()) {
      return res.status(400).json({ message: 'Flat number is required' });
  }
  const requested = req.body?.role;
  const role = requested === 'admin' ? 'admin' : ROLES.includes(requested) ? requested : 'tenant';
  const user = {
    ...baseRecord({ created_by: req.user.email, created_by_id: req.user.id }),
    email,
    password_hash: hashPassword(DEFAULT_INVITE_PASSWORD),
    full_name: req.body?.full_name || email.split('@')[0],
    role,
    flat_number: req.body?.flat_number || '',
    phone: req.body?.phone || '',
    society_id: req.society.id,
    society_name: req.society.name,
    disabled: false,
    is_verified: false,
  };
  await insertEntityRecord(req.schemaName, 'User', user);
  broadcast(req.schemaName, 'User', 'create', user);
  const emailResult = await sendEmail({
    to: user.email,
    ...inviteEmailContent({
      name: user.full_name,
      societyName: req.society.name,
      email: user.email,
      password: DEFAULT_INVITE_PASSWORD,
      role: user.role,
    }),
  });

  res.status(201).json({
    ...publicUser(user),
    initial_password: DEFAULT_INVITE_PASSWORD,
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? undefined : emailResult.error,
  });
}));


/* An admin resets a society member's password. A new one-time password is
   generated, the member must change it at their next sign-in, and every
   device they were signed in on is signed out. Works with or without email. */
function passwordResetEmailContent({ name, societyName, email, password }) {
  const loginUrl = APP_URL ? `${APP_URL}/#/` : '';
  const subject = 'Your WGate password was reset';

  const text = [
    `Hello ${name},`,
    '',
    `Your society admin reset your WGate password for ${societyName}.`,
    '',
    loginUrl ? `Sign in here: ${loginUrl}` : 'Ask your society admin for the WGate sign-in link.',
    `Email: ${email}`,
    `Temporary password: ${password}`,
    '',
    'You will be asked to choose a new password when you sign in. Any device you were signed in on has been signed out.',
    "If you didn't expect this, please contact your society admin.",
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <tr><td>
      <h2 style="margin:0 0 12px;font-size:20px;">Your password was reset</h2>
      <p style="margin:0 0 16px;line-height:1.5;">Hello ${escapeHtml(name)}, your society admin reset your WGate password for <strong>${escapeHtml(societyName)}</strong>.</p>
      <table role="presentation" width="100%" style="background:#f4f5f7;border-radius:8px;padding:14px;margin:0 0 20px;font-size:14px;">
        <tr><td style="color:#6b7280;padding:2px 0;">Email</td><td style="font-weight:bold;text-align:right;">${escapeHtml(email)}</td></tr>
        <tr><td style="color:#6b7280;padding:2px 0;">Temporary password</td><td style="font-weight:bold;text-align:right;font-family:Consolas,monospace;">${escapeHtml(password)}</td></tr>
      </table>
      ${loginUrl ? `<p style="margin:0 0 20px;"><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;">Sign in to WGate</a></p>` : ''}
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.5;">You'll be asked to choose a new password when you sign in. Any device you were signed in on has been signed out.</p>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">If you didn't expect this, please contact your society admin.</p>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

app.post('/api/users/:id/reset-password', requireAuth, requireAdmin, requireSocietySchema, wrap(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ message: 'Member not found' });
  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: 'To change your own password, use your Profile page' });
  }
  const target = await getEntityRecord(req.schemaName, 'User', req.params.id);
  if (!target) return res.status(404).json({ message: 'Member not found' });

  const tempPassword = generateTempPassword();
  const updated = {
    ...target,
    password_hash: hashPassword(tempPassword),
    must_change_password: true,
    updated_date: nowIso(),
  };
  await updateEntityRecord(req.schemaName, 'User', updated.id, updated);
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [updated.id]); // sign them out everywhere

  // Email is optional: if it isn't set up, the admin simply sees the password on screen.
  const emailResult = typeof sendEmail === 'function'
    ? await sendEmail({
        to: updated.email,
        ...passwordResetEmailContent({
          name: updated.full_name || updated.email,
          societyName: req.society.name,
          email: updated.email,
          password: tempPassword,
        }),
      })
    : { ok: false, error: 'Email is not set up on the server' };

  res.json({
    email: updated.email,
    password: tempPassword,
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? undefined : emailResult.error,
  });
}));

/* The admin's queue of self-service "forgot password" requests for this
   society, and the actions to resolve or dismiss them. */
app.get('/api/users/reset-requests', requireAuth, requireAdmin, requireSocietySchema, wrap(async (req, res) => {
  const all = await listEntity(req.schemaName, 'PasswordResetRequest');
  const pending = all
    .filter((r) => r.status === 'pending')
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  res.json(pending);
}));

app.post('/api/users/reset-requests/:id/resolve', requireAuth, requireAdmin, requireSocietySchema, wrap(async (req, res) => {
  const request = await getEntityRecord(req.schemaName, 'PasswordResetRequest', req.params.id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  const target = await getEntityRecord(req.schemaName, 'User', request.user_id);
  if (!target) return res.status(404).json({ message: 'That member no longer exists' });

  const tempPassword = generateTempPassword();
  const updatedUser = {
    ...target,
    password_hash: hashPassword(tempPassword),
    must_change_password: true,
    updated_date: nowIso(),
  };
  await updateEntityRecord(req.schemaName, 'User', updatedUser.id, updatedUser);
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [updatedUser.id]);

  await updateEntityRecord(req.schemaName, 'PasswordResetRequest', request.id, {
    ...request,
    status: 'resolved',
    resolved_by: req.user.email,
    resolved_date: nowIso(),
    updated_date: nowIso(),
  });

  res.json({ email: updatedUser.email, password: tempPassword, name: updatedUser.full_name });
}));

app.post('/api/users/reset-requests/:id/dismiss', requireAuth, requireAdmin, requireSocietySchema, wrap(async (req, res) => {
  const request = await getEntityRecord(req.schemaName, 'PasswordResetRequest', req.params.id);
  if (!request) return res.status(404).json({ message: 'Request not found' });
  await updateEntityRecord(req.schemaName, 'PasswordResetRequest', request.id, {
    ...request,
    status: 'dismissed',
    resolved_by: req.user.email,
    resolved_date: nowIso(),
    updated_date: nowIso(),
  });
  res.json({ success: true });
}));
/* ------------------------- super admin routes ------------------------- */
/* Only a 'superadmin' account can reach these: creating, editing and
   deleting societies (each backed by its own Postgres schema), creating
   admins for a society, and resetting an admin's password. */

app.post('/api/superadmin/societies', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Society name is required' });
  // Created directly by the super admin, so it's trusted already — no
  // approval step needed, and its trial period starts right away.
  const society = await createSocietyRecord({
    name,
    city: req.body?.city,
    address: req.body?.address,
    total_flats: req.body?.total_flats ?? null,
    approved: true,
    plan: 'trial',
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  res.status(201).json(society);
}));

/* Approve a society that signed up through /api/signup. Starts its trial
   period and allows its members to log in for the first time. */
app.post('/api/superadmin/societies/:id/approve', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  if (society.approved) return res.json(society);
  const updated = await approveSocietyRecord(req.params.id);
  res.json(updated);
}));

/* Push a society's trial end date out by N days (default 14). Use this to
   give a society more runway without fully moving them to a paid plan —
   works whether they're still in-trial or already in their grace period. */
app.post('/api/superadmin/societies/:id/extend-trial', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  const days = Number(req.body?.days);
  const extendBy = Number.isFinite(days) && days > 0 ? days : TRIAL_DAYS;
  // Extend from whichever is later: the current trial end, or now — so
  // extending a long-expired trial doesn't still leave it expired.
  const base = Math.max(new Date(society.trial_ends_at || 0).getTime(), Date.now());
  const trialEndsAt = new Date(base + extendBy * 24 * 60 * 60 * 1000).toISOString();
  await pool.query(
    `UPDATE societies SET plan = 'trial', trial_ends_at = $1, updated_date = now() WHERE id = $2`,
    [trialEndsAt, req.params.id]
  );
  res.json(await getSocietyById(req.params.id));
}));

/* Move a society onto a paid plan. A paid plan has no trial_ends_at
   enforcement (see trialStatusFor), so this is what actually lifts a
   trial/grace lock for good, as opposed to extend-trial which just buys
   more time on the trial clock. */
app.post('/api/superadmin/societies/:id/upgrade', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  const plan = ['starter', 'pro'].includes(req.body?.plan) ? req.body.plan : 'pro';
  //await pool.query(`UPDATE societies SET plan = $1, updated_date = now() WHERE id = $2`, [plan, req.params.id]);
  await pool.query(`UPDATE societies SET plan = $1, trial_ends_at = NULL, updated_date = now() WHERE id = $2`, [plan, req.params.id]);
  res.json(await getSocietyById(req.params.id));
}));
// Superadmin picks one of three fixed packages — each sets both the plan
// label and a hard expiry, so Starter/Pro actually lock out at the end of
// their term just like Trial does today (not permanent forever).
const PLAN_OPTIONS = {
  trial: { label: 'Trial — 15 Days', days: 15 },
  starter: { label: 'Starter — 3 Months', days: 90 },
  pro: { label: 'Pro — 1 Year', days: 365 },
};

app.get('/api/superadmin/plan-options', requireAuth, requireSuperadmin, (_req, res) => {
  res.json(PLAN_OPTIONS);
});

app.post('/api/superadmin/societies/:id/set-plan', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  const key = req.body?.plan;
  const option = PLAN_OPTIONS[key];
  if (!option) {
    return res.status(400).json({ message: `Plan must be one of: ${Object.keys(PLAN_OPTIONS).join(', ')}` });
  }
  // Always sets a FRESH expiry from now — doesn't extend an old one. That
  // way if the super admin picked the wrong package by mistake, picking
  // the right one afterwards fully corrects it rather than stacking dates.
  const trialEndsAt = new Date(Date.now() + option.days * 24 * 60 * 60 * 1000).toISOString();
  await pool.query(
    `UPDATE societies SET plan = $1, trial_ends_at = $2, updated_date = now() WHERE id = $3`,
    [key, trialEndsAt, req.params.id]
  );
  res.json(await getSocietyById(req.params.id));
}));
/* Manual hard lock, independent of the trial clock — suspend blocks login
   and cuts off every signed-in session for that society immediately.
   Unsuspend only undoes the suspension; it does not touch approval, plan
   or the trial clock. */
app.post('/api/superadmin/societies/:id/suspend', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  const reason = String(req.body?.reason || '').trim();
  await pool.query(
    `UPDATE societies SET suspended = true, suspended_at = now(), suspended_reason = $1, updated_date = now() WHERE id = $2`,
    [reason || null, req.params.id]
  );
  await pool.query(`DELETE FROM sessions WHERE society_id = $1`, [society.id]);
  res.json(await getSocietyById(req.params.id));
}));

app.post('/api/superadmin/societies/:id/unsuspend', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  await pool.query(
    `UPDATE societies SET suspended = false, suspended_at = NULL, suspended_reason = NULL, updated_date = now() WHERE id = $1`,
    [req.params.id]
  );
  res.json(await getSocietyById(req.params.id));
}));

app.patch('/api/superadmin/societies/:id', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const existing = await getSocietyById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Society not found' });

  const patch = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ message: 'Society name is required' });
    patch.name = name;
  }
  if (req.body?.city !== undefined) patch.city = req.body.city;
  if (req.body?.address !== undefined) patch.address = req.body.address;
  if (req.body?.total_flats !== undefined) patch.total_flats = req.body.total_flats;

  const updated = await updateSocietyRecord(req.params.id, patch);

  // Keep the denormalized society_name in sync inside that society's own
  // schema, so renaming a society doesn't leave stale names on records.
  if (patch.name && patch.name !== existing.name) {
    const schemaName = await getSocietySchemaName(updated.id);
    for (const entity of ['User', 'Notice']) {
      const affected = await listEntity(schemaName, entity);
      for (const r of affected) {
        if (r.society_id === updated.id) {
          await updateEntityRecord(schemaName, entity, r.id, { ...r, society_name: updated.name, updated_date: nowIso() });
        }
      }
    }
  }

  res.json(updated);
}));

app.delete('/api/superadmin/societies/:id', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  const schemaName = await getSocietySchemaName(society.id);
  const userCount = await countEntity(schemaName, 'User');
  const force = req.query.force === 'true';
  if (userCount > 0 && !force) {
    return res.status(409).json({
      message: `This society still has ${userCount} member${userCount === 1 ? '' : 's'}. Remove them first, or confirm force delete.`,
      member_count: userCount,
    });
  }
  await deleteSocietyRecord(society.id);
  res.json({ success: true });
}));
/* Super admin chooses which menu sections a society can use. Stored in that
   society's own SocietySettings record, which the app already reads. */
const MENU_KEYS = ['Visitors', 'ServiceTickets', 'NoticeBoard', 'Billing', 'Amenities', 'PreApprovals', 'GatePasses'];

// Which entity belongs to which menu section. A switched-off section is
// blocked on the API too, not just hidden in the nav.
const MENU_FOR_ENTITY = {
  Visitor: 'Visitors',
  ServiceTicket: 'ServiceTickets',
  Notice: 'NoticeBoard',
  MaintenanceBill: 'Billing',
  AmenityBooking: 'Amenities',
  // Rides along with the existing Visitors toggle — no new super admin
  // menu entry needed, since pre-approvals are part of gate management.
  PreApproval: 'Visitors',
  GatePass: 'Visitors',
};
const menuCache = new Map(); // schemaName -> { menus, expires }

async function getEnabledMenus(schemaName) {
  const hit = menuCache.get(schemaName);
  if (hit && hit.expires > Date.now()) return hit.menus;
  const [settings] = await listEntity(schemaName, 'SocietySettings');
  const menus = Array.isArray(settings?.enabled_menus) ? settings.enabled_menus : null; // null = everything on
  menuCache.set(schemaName, { menus, expires: Date.now() + 30_000 });
  return menus;
}
app.put('/api/superadmin/societies/:id/menus', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const menus = req.body?.enabled_menus;
  if (!Array.isArray(menus) || !menus.every((m) => MENU_KEYS.includes(m))) {
    return res.status(400).json({ message: `enabled_menus must be a list of: ${MENU_KEYS.join(', ')}` });
  }
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ message: 'Society not found' });
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });

  const schemaName = await getSocietySchemaName(society.id);
  const enabled = [...new Set(menus)];
  const [existing] = await listEntity(schemaName, 'SocietySettings');
  if (existing) {
    await updateEntityRecord(schemaName, 'SocietySettings', existing.id, {
      ...existing,
      enabled_menus: enabled,
      updated_date: nowIso(),
    });
  } else {
    await insertEntityRecord(schemaName, 'SocietySettings', {
      ...baseRecord({ created_by: req.user.email, created_by_id: req.user.id }),
      society_id: society.id,
      enabled_menus: enabled,
    });
  }
    menuCache.delete(schemaName); // apply the change immediately
  res.json({ success: true, enabled_menus: enabled });
}));
app.post('/api/superadmin/admins', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const society = await getSocietyById(req.body?.society_id);
  if (!society) return res.status(400).json({ message: 'Society is required' });
  const schemaName = await getSocietySchemaName(society.id);

  if (await findUserByEmail(schemaName, email)) {
    return res.status(409).json({ message: 'A user with this email already exists in this society' });
  }

  const adminUser = {
    ...baseRecord({ created_by: req.user.email, created_by_id: req.user.id }),
    email,
    password_hash: hashPassword(DEFAULT_INVITE_PASSWORD),
    full_name: req.body?.full_name || email.split('@')[0],
    role: 'admin',
    flat_number: req.body?.flat_number || '',
    phone: req.body?.phone || '',
    society_id: society.id,
    society_name: society.name,
    disabled: false,
    is_verified: false,
    must_change_password: true,
  };
  await insertEntityRecord(schemaName, 'User', adminUser);
  res.status(201).json({ ...publicUser(adminUser), initial_password: DEFAULT_INVITE_PASSWORD });
}));

app.get('/api/superadmin/societies', requireAuth, requireSuperadmin, wrap(async (_req, res) => {
  const societies = await listSocieties();
  const withAdmins = await Promise.all(societies.map(async (s) => {
    const schemaName = await getSocietySchemaName(s.id);
    const users = await listEntity(schemaName, 'User');
    const admins = users
      .filter((u) => u.role === 'admin')
      .map(publicUser)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
        const [settings] = await listEntity(schemaName, 'SocietySettings');
    return { ...s, admins, enabled_menus: settings?.enabled_menus ?? null };
  }));
  res.json(withAdmins.sort((a, b) => a.name.localeCompare(b.name)));
}));

app.post('/api/superadmin/admins/:id/reset-password', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.body?.society_id);
  if (!society) return res.status(400).json({ message: 'Society is required' });
  const schemaName = await getSocietySchemaName(society.id);

  const target = await getEntityRecord(schemaName, 'User', req.params.id);
  if (!target) return res.status(404).json({ message: 'Admin not found' });
  if (target.role !== 'admin') return res.status(400).json({ message: 'This action is only available for society admins' });

  const tempPassword = generateTempPassword();
  const updated = {
    ...target,
    password_hash: hashPassword(tempPassword),
    must_change_password: true,
    updated_date: nowIso(),
  };
  await updateEntityRecord(schemaName, 'User', updated.id, updated);
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [updated.id]);

  res.json({ email: updated.email, password: tempPassword });
}));

/* Distinct resident flat numbers — used by the guard's visitor check-in
   form to pick a flat instead of typing it freehand. Open to any
   authenticated role (not just admin), but only returns flat numbers,
   not full user records, so it doesn't leak other residents' PII. */
app.get('/api/flats', requireAuth, requireSocietySchema, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT data->>'flat_number' AS flat_number
    FROM "${req.schemaName}".entity_records
    WHERE entity = 'User'
      AND data->>'role' IN ('tenant', 'owner')
      AND data->>'flat_number' <> ''
    ORDER BY flat_number
  `);
  res.json(rows.map((r) => r.flat_number));
}));

/* ------------------------- realtime events ------------------------- */

app.get('/api/events', requireAuth, requireSocietySchema, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write('retry: 2000\n\n');
  sseClients.set(res, { schema: req.schemaName, user: req.user });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

/* --------------------------- entities --------------------------- */

const entityRouter = express.Router();
entityRouter.use(requireAuth);
entityRouter.use(requireSocietySchema);

entityRouter.use('/:name', (req, res, next) => {
  if (!ENTITIES.includes(req.params.name)) {
    return res.status(404).json({ message: `Unknown entity: ${req.params.name}` });
  }
  next();
});
// Menu access is controlled by the super admin only. Everyone can read the
// settings (the nav needs them), but nobody can change them through this API.
entityRouter.use('/:name', (req, res, next) => {
  if (req.params.name === 'SocietySettings' && req.method !== 'GET') {
    return res.status(403).json({ message: 'Menu access is managed by the super admin' });
  }
  next();
});

// Block API access to sections the super admin has switched off for this society.
entityRouter.use('/:name', wrap(async (req, res, next) => {
  const menuKey = MENU_FOR_ENTITY[req.params.name];
  if (menuKey) {
    const menus = await getEnabledMenus(req.schemaName);
    if (menus && !menus.includes(menuKey)) {
      return res.status(403).json({ message: 'This section is not enabled for your society', code: 'menu_disabled' });
    }
  }
  next();
}));
/* ------------------------------------------------------------------ */
/* Access rules: who may read / write what                            */
/* Enforced here on the server, so they can't be bypassed from the   */
/* browser. They mirror what each screen already allows.             */
/* ------------------------------------------------------------------ */

const isStaff = (u) => u.role === 'admin' || u.role === 'guard';
const isResident = (u) => u.role === 'tenant' || u.role === 'owner';
const flatKey = (v) => String(v ?? '').trim().toLowerCase();
const sameFlat = (u, r) => !!flatKey(u.flat_number) && flatKey(u.flat_number) === flatKey(r.flat_number);
const sameEmail = (u, r) => !!u.email && !!r.resident_email && normEmail(u.email) === normEmail(r.resident_email);

// Who may create / edit / delete each entity. Visitor and ServiceTicket have
// finer rules in authorizeCreate / authorizeUpdate below.
// Notice includes guards because the Notice Board screen lets them post.
const WRITE_ROLES = {
  User: ['admin'],
  SocietySettings: ['admin'],
  MaintenanceBill: ['admin'],
  Notice: ['admin', 'guard'],
};

function canRead(user, entity, record) {
  switch (entity) {
    case 'User': return user.role === 'admin' || record.id === user.id;
    case 'SocietySettings':
    case 'Notice': return true;
    // Everyone in the society can see all bookings (not just their own) so
    // the booking form can show which slots are already taken.
    case 'AmenityBooking': return true;
    case 'Visitor': return isStaff(user) || sameFlat(user, record);
    // Guards need to see the list too, to recognize an expected daily
    // maid/cook/nanny or guest at the gate.
    case 'PreApproval': return isStaff(user) || sameFlat(user, record);
    case 'GatePass': return isStaff(user) || sameFlat(user, record);
    case 'ServiceTicket': return isStaff(user) || sameEmail(user, record);
    case 'MaintenanceBill': return user.role === 'admin' || sameFlat(user, record) || sameEmail(user, record);
    default: return false;
  }
}

function canDelete(user, entity, record) {
  if (entity === 'AmenityBooking' || entity === 'PreApproval' || entity === 'GatePass') {
    return user.role === 'admin' || (isResident(user) && record && sameEmail(user, record));
  }
  return (WRITE_ROLES[entity] || ['admin']).includes(user.role);
}

const denyWrite = (res, message = 'You do not have permission to do that') => {
  res.status(403).json({ message });
  return null;
};

const pickDefined = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

// Returns the record input to store (sanitized), or null after sending an
// error response (403 for permission, 400/409 for bad/conflicting bookings).
async function authorizeCreate(req, res, entity, input) {
  const user = req.user;
  const body = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
  if (WRITE_ROLES[entity]) {
    return WRITE_ROLES[entity].includes(user.role) ? body : denyWrite(res);
  }
  if (entity === 'AmenityBooking') {
    if (!isResident(user) && user.role !== 'admin' && user.role !== 'guard') {
      return denyWrite(res, 'Only residents and admins can book amenities');
    }
    const { amenity, booking_date, start_time, end_time } = body;
    if (!AMENITIES.includes(amenity)) {
      res.status(400).json({ message: `Unknown amenity. Choose one of: ${AMENITIES.join(', ')}` });
      return null;
    }
    if (!booking_date || !start_time || !end_time) {
      res.status(400).json({ message: 'Date, start time and end time are required' });
      return null;
    }
    if (start_time >= end_time) {
      res.status(400).json({ message: 'End time must be after start time' });
      return null;
    }
    const existing = await listEntity(req.schemaName, 'AmenityBooking');
    // Pending requests block the slot too (not just confirmed ones) so two
    // residents can't both get told "pending" for the same time and leave
    // the admin to sort out a clash. Rejected/cancelled bookings free the slot.
    const conflict = existing.find((b) =>
      b.amenity === amenity &&
      b.booking_date === booking_date &&
      b.status !== 'cancelled' &&
      b.status !== 'rejected' &&
      timesOverlap(start_time, end_time, b.start_time, b.end_time)
    );
    if (conflict) {
      res.status(409).json({ message: `${amenity} is already booked (or pending approval) for part of that time on ${booking_date}` });
      return null;
    }
    const isStaffBooking = user.role === 'admin' || user.role === 'guard';
    return {
      amenity,
      booking_date,
      start_time,
      end_time,
      
      notes: typeof body.notes === 'string' ? body.notes : '',
      flat_number: isStaffBooking && body.flat_number ? body.flat_number : (user.flat_number || ''),
      resident_email: isStaffBooking && body.resident_email ? normEmail(body.resident_email) : user.email,
      resident_name: isStaffBooking && body.resident_name ? body.resident_name : (user.full_name || ''),
      status: 'pending',
    };
  }
  if (entity === 'PreApproval') {
    if (!isResident(user) && user.role !== 'admin') {
      return denyWrite(res, 'Only residents and admins can create pre-approvals');
    }
    const { visitor_name, visitor_phone, category, frequency } = body;
    if (!visitor_name || !String(visitor_name).trim()) {
      res.status(400).json({ message: 'Visitor name is required' });
      return null;
    }
    if (!visitor_phone || !isValidPhone(visitor_phone)) {
      res.status(400).json({ message: 'Enter a valid phone number' });
      return null;
    }
    if (!PRE_APPROVAL_CATEGORIES.includes(category)) {
      res.status(400).json({ message: `Category must be one of: ${PRE_APPROVAL_CATEGORIES.join(', ')}` });
      return null;
    }
    if (!['once', 'daily'].includes(frequency)) {
      res.status(400).json({ message: 'Frequency must be "once" or "daily"' });
      return null;
    }
    const today = todayStr();
    let valid_from = body.valid_from || today;
    let valid_until = body.valid_until;
    if (frequency === 'once') {
      // A one-time pass is only good for the single day it's for.
      valid_until = valid_from;
    } else {
      if (!valid_until) {
        res.status(400).json({ message: 'An end date is required for a daily pre-approval' });
        return null;
      }
      if (valid_until < valid_from) {
        res.status(400).json({ message: 'End date must be on or after the start date' });
        return null;
      }
    }
    return {
      visitor_name: String(visitor_name).trim(),
      visitor_phone,
      category,
      frequency,
      valid_from,
      valid_until,
      notes: typeof body.notes === 'string' ? body.notes : '',
      flat_number: user.role === 'admin' && body.flat_number ? body.flat_number : (user.flat_number || ''),
      resident_email: user.role === 'admin' && body.resident_email ? normEmail(body.resident_email) : user.email,
      resident_name: user.role === 'admin' && body.resident_name ? body.resident_name : (user.full_name || ''),
      status: 'active',
    };
  }
  if (entity === 'GatePass') {
    if (!isResident(user) && user.role !== 'admin') {
      return denyWrite(res, 'Only residents and admins can create a gate pass');
    }
    const { visitor_name } = body;
    if (!visitor_name || !String(visitor_name).trim()) {
      res.status(400).json({ message: 'Visitor name is required' });
      return null;
    }
    if (body.visitor_phone && !isValidPhone(body.visitor_phone)) {
      res.status(400).json({ message: 'Enter a valid phone number' });
      return null;
    }
    const today = todayStr();
    const valid_date = body.valid_date || today;
    if (valid_date < today) {
      res.status(400).json({ message: 'Valid date cannot be in the past' });
      return null;
    }
    const code = await generateUniqueGatePassCode(req.schemaName);
    return {
      code,
      visitor_name: String(visitor_name).trim(),
      visitor_phone: body.visitor_phone || '',
      notes: typeof body.notes === 'string' ? body.notes : '',
      valid_date,
      flat_number: user.role === 'admin' && body.flat_number ? body.flat_number : (user.flat_number || ''),
      resident_email: user.role === 'admin' && body.resident_email ? normEmail(body.resident_email) : user.email,
      resident_name: user.role === 'admin' && body.resident_name ? body.resident_name : (user.full_name || ''),
      status: 'active',
      used_at: null,
      used_by: null,
    };
  }
  if (entity === 'Visitor') {
    if (!isValidPhone(body.visitor_phone)) {
      return denyWrite(res, 'Enter a valid visitor phone number');
    }
    if (user.role === 'admin') return body;
    if (user.role !== 'guard') return denyWrite(res, 'Only security and admins can check in visitors');
    delete body.check_out_time;

    // Skip the resident-approval wait when there's an active, currently
    // valid pre-approval for this phone number — the whole point of
    // pre-approving a recurring maid/cook/nanny or an expected guest.
    const today = todayStr();
    const preApprovals = body.visitor_phone ? await listEntity(req.schemaName, 'PreApproval') : [];
    const match = preApprovals.find((p) =>
      p.status === 'active' &&
      p.visitor_phone === body.visitor_phone &&
      p.valid_from <= today &&
      today <= p.valid_until
    );
    if (match) {
      body.status = 'approved';
      body.flat_number = body.flat_number || match.flat_number;
      body.pre_approval_id = match.id;
    } else {
      body.status = 'pending'; // guards cannot pre-approve their own check-ins
    }
    return body;
  }
  if (entity === 'ServiceTicket') {
    if (user.role === 'admin') return body;
    if (!isResident(user)) return denyWrite(res, 'Only residents and admins can raise tickets');
    return {
      ...pickDefined(body, ['title', 'description', 'category', 'priority']),
      flat_number: user.flat_number || body.flat_number,
      resident_email: user.email, // always the signed-in resident, never someone else
      status: 'open',
    };
  }
  return denyWrite(res);
}

// Returns the patch to apply (sanitized), or null after sending a 403.
function authorizeUpdate(req, res, entity, record, patch) {
  const user = req.user;
  const body = patch && typeof patch === 'object' && !Array.isArray(patch) ? { ...patch } : {};
  if (WRITE_ROLES[entity]) {
    return WRITE_ROLES[entity].includes(user.role) ? body : denyWrite(res);
  }
  if (entity === 'ServiceTicket') {
  if (user.role === 'admin' || user.role === 'guard') return body;
  return denyWrite(res, 'Only admins and security can update tickets');
}
  if (entity === 'AmenityBooking') {
    if (user.role === 'admin') {
      if ('status' in body && !['pending', 'confirmed', 'rejected', 'cancelled'].includes(body.status)) {
        return denyWrite(res, 'Invalid booking status');
      }
      return body;
    }
    if (isResident(user) && sameEmail(user, record)) {
      const keys = Object.keys(body);
      const onlyCancel = keys.length === 1 && keys[0] === 'status' && body.status === 'cancelled';
      return onlyCancel ? body : denyWrite(res, 'You can only cancel your own booking');
    }
    return denyWrite(res);
  }
  if (entity === 'PreApproval') {
    if (user.role === 'admin') {
      if ('status' in body && !['active', 'cancelled'].includes(body.status)) {
        return denyWrite(res, 'Invalid status');
      }
      return body;
    }
    if (isResident(user) && sameEmail(user, record)) {
      const keys = Object.keys(body);
      const onlyCancel = keys.length === 1 && keys[0] === 'status' && body.status === 'cancelled';
      return onlyCancel ? body : denyWrite(res, 'You can only cancel your own pre-approval');
    }
    return denyWrite(res);
  }
  if (entity === 'GatePass') {
    if (user.role === 'admin') {
      if ('status' in body && !['active', 'used', 'cancelled'].includes(body.status)) {
        return denyWrite(res, 'Invalid status');
      }
      return body;
    }
    if (isResident(user) && sameEmail(user, record)) {
      const keys = Object.keys(body);
      const onlyCancel = keys.length === 1 && keys[0] === 'status' && body.status === 'cancelled';
      if (!onlyCancel) return denyWrite(res, 'You can only cancel your own gate pass');
      if (record.status !== 'active') return denyWrite(res, 'This gate pass is no longer active');
      return body;
    }
    return denyWrite(res);
  }
  if (entity === 'Visitor') {
    if (user.role === 'admin') return body;
    const keys = Object.keys(body);
    if (user.role === 'guard') {
      const onlyCheckout = keys.length > 0 && keys.every((k) => k === 'check_out_time');
      return record.status === 'approved' && onlyCheckout
        ? body
        : denyWrite(res, 'Security can only check out approved visitors');
    }
    if (isResident(user) && sameFlat(user, record)) {
      const onlyDecision = keys.length === 1 && keys[0] === 'status' && ['approved', 'rejected'].includes(body.status);
      return onlyDecision ? body : denyWrite(res, 'You can only approve or reject visitors for your flat');
    }
    return denyWrite(res);
  }
  return denyWrite(res);
}

const enforceEntityAccess = wrap(async (req, res, next) => {
  const entity = req.params.name;
  const [first] = req.path.split('/').filter(Boolean); // undefined | 'bulk' | <record id>

  if (req.method === 'POST') {
    if (first === 'bulk') {
      const items = Array.isArray(req.body) ? req.body : req.body?.items;
      if (!Array.isArray(items)) return next(); // the route itself returns the 400
      const allowed = [];
      for (const item of items) {
        const input = await authorizeCreate(req, res, entity, item);
        if (!input) return; // error response already sent
        allowed.push(input);
      }
      req.body = allowed;
      return next();
    }
    const input = await authorizeCreate(req, res, entity, req.body);
    if (!input) return;
    req.body = input;
    return next();
  }

  if (first && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const record = await getEntityRecord(req.schemaName, entity, first);
    if (!record) return next(); // the route itself returns the 404
    if (req.method === 'DELETE') {
      if (!canDelete(req.user, entity, record)) return denyWrite(res, 'You do not have permission to delete this');
      return next();
    }
    const patch = authorizeUpdate(req, res, entity, record, req.body);
    if (!patch) return;
    req.body = patch;
  }
  next();
});
entityRouter.use('/:name', enforceEntityAccess);

function assertUserWriteAllowed(req, res) {
  if (req.params.name === 'User' && req.user.role !== 'admin') {
    res.status(403).json({ message: 'Only admins can manage users' });
    return false;
  }
  return true;
}
async function buildRecord(schemaName, entity, input, actor, activeSociety) {
  const record = {
    ...(ENTITY_DEFAULTS[entity] || {}),
    ...input,
    id: newId(),
    created_date: nowIso(),
    updated_date: nowIso(),
    created_by: actor.email,
    created_by_id: actor.id,
    is_sample: false,
  };
  if (entity === 'User') {
    if (record.role === 'superadmin') {
      throw Object.assign(new Error('Super admin accounts cannot be created this way'), { status: 403 });
    }
    record.email = normEmail(record.email);
    if (!record.email) throw Object.assign(new Error('Email is required'), { status: 400 });
    if (await findUserByEmail(schemaName, record.email)) {
      throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
    }
    record.society_id = activeSociety.id;
    record.society_name = activeSociety.name;
    record.password_hash = hashPassword(record.password || DEFAULT_INVITE_PASSWORD);
    delete record.password;
  }
  if (entity === 'Notice' || entity === 'SocietySettings') {
    record.society_id = activeSociety.id;
    record.society_name = activeSociety.name;
  }
    if (entity === 'ServiceTicket') {
    const count = await countEntity(schemaName, 'ServiceTicket');
    record.ticket_number = `TKT-${String(count + 1).padStart(5, '0')}`;
  }
  return record;
}

entityRouter.get('/:name', wrap(async (req, res) => {
  const entity = req.params.name;
  let query = {};
  if (req.query.q) {
    try { query = JSON.parse(String(req.query.q)); } catch { return res.status(400).json({ message: 'Invalid q parameter' }); }
  }
  let rows = await listEntity(req.schemaName, entity);
  if (entity === 'User' && req.user.role !== 'admin') {
    rows = rows.filter((r) => canRead(req.user, entity, r));
  }
  rows = rows.filter((r) => matchesQuery(r, query));
  rows = sortRecords(rows, req.query.sort ? String(req.query.sort) : '-created_date');
  const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
  const limit = parseInt(req.query.limit, 10);
  rows = rows.slice(skip, Number.isFinite(limit) && limit > 0 ? skip + limit : undefined);
  res.json(rows.map((r) => clean(entity, r)));
}));

entityRouter.get('/:name/:id', wrap(async (req, res) => {
  const entity = req.params.name;
  const record = await getEntityRecord(req.schemaName, entity, req.params.id);
  if (!record) return res.status(404).json({ message: `${entity} not found` });
    if (!canRead(req.user, entity, record)) return res.status(404).json({ message: `${entity} not found` });
  res.json(clean(entity, record));
}));

entityRouter.post('/:name/bulk', wrap(async (req, res) => {
  if (!assertUserWriteAllowed(req, res)) return;
  const entity = req.params.name;
  const items = Array.isArray(req.body) ? req.body : req.body?.items;
  if (!Array.isArray(items)) return res.status(400).json({ message: 'Expected an array' });
  try {
    const created = [];
    for (const item of items) {
      const record = await buildRecord(req.schemaName, entity, item || {}, req.user, req.society);
      await insertEntityRecord(req.schemaName, entity, record);
      created.push(record);
    }
    created.forEach((r) => broadcast(req.schemaName, entity, 'create', r));
    res.status(201).json(created.map((r) => clean(entity, r)));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
}));

entityRouter.post('/:name', wrap(async (req, res) => {
  if (!assertUserWriteAllowed(req, res)) return;
  const entity = req.params.name;
  try {
    const record = await buildRecord(req.schemaName, entity, req.body || {}, req.user, req.society);
    await insertEntityRecord(req.schemaName, entity, record);
    broadcast(req.schemaName, entity, 'create', record);
    res.status(201).json(clean(entity, record));

    // Fire-and-forget: notify the society's configured WhatsApp number
    // about the new ticket. Never awaited — a slow/failed WhatsApp send
    // must not delay or break the actual ticket creation.
    if (entity === 'ServiceTicket') {
      listEntity(req.schemaName, 'SocietySettings')
        .then(([settings]) => {
          const to = settings?.ticket_whatsapp_number;
          if (!to) return;
          const msg = [
            '🔧 New Service Ticket',
            `Flat: ${record.flat_number || '—'}`,
            `Title: ${record.title || '—'}`,
            record.category ? `Category: ${record.category}` : null,
            record.priority ? `Priority: ${record.priority}` : null,
            record.description ? `Details: ${record.description}` : null,
          ].filter(Boolean).join('\n');
          return sendWhatsAppMessage(to, msg);
        })
        .catch((err) => console.error('[whatsapp] ticket-create notify failed:', err.message));
    }
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
}));

async function updateHandler(req, res) {
  if (!assertUserWriteAllowed(req, res)) return;
  const entity = req.params.name;
  const record = await getEntityRecord(req.schemaName, entity, req.params.id);
  if (!record) return res.status(404).json({ message: `${entity} not found` });

  const patch = { ...(req.body || {}) };
  delete patch.id;
  delete patch.created_date;
  delete patch.created_by;
  delete patch.created_by_id;
  delete patch.password_hash;
  delete patch.society_id;
  delete patch.society_name;

  if (entity === 'User') {
    if (patch.email !== undefined) {
      patch.email = normEmail(patch.email);
      const existing = await findUserByEmail(req.schemaName, patch.email);
      if (existing && existing.id !== record.id) {
        return res.status(409).json({ message: 'A user with this email already exists' });
      }
    }
    if (patch.phone !== undefined && !isValidPhone(patch.phone)) {
      return res.status(400).json({ message: 'Enter a valid phone number' });
    }
    if (patch.password) {
      patch.password_hash = hashPassword(patch.password);
    }
    delete patch.password;
    if (patch.role !== undefined && !ROLES.includes(patch.role)) {
      return res.status(400).json({ message: `Invalid role. Use one of: ${ROLES.join(', ')}` });
    }
    if (record.id === req.user.id && patch.role && patch.role !== 'admin') {
      return res.status(400).json({ message: 'You cannot remove your own admin role' });
    }
  }

  const updated = { ...record, ...patch, updated_date: nowIso() };
  await updateEntityRecord(req.schemaName, entity, req.params.id, updated);
  broadcast(req.schemaName, entity, 'update', updated);
  res.json(clean(entity, updated));

  // Fire-and-forget: notify the resident over WhatsApp the moment their
  // ticket is actually closed (not on every edit — only on the transition
  // into resolved/closed), using the phone number on their own User record.
  if (entity === 'ServiceTicket') {
    const CLOSED_STATUSES = ['resolved', 'closed'];
    const justClosed = CLOSED_STATUSES.includes(updated.status) && !CLOSED_STATUSES.includes(record.status);
    if (justClosed && updated.resident_email) {
      findUserByEmail(req.schemaName, updated.resident_email)
        .then((resident) => {
          if (!resident?.phone) return;
          const msg = `✅ Your service ticket "${updated.title || ''}" has been marked ${updated.status}. Thank you for your patience!`;
          return sendWhatsAppMessage(resident.phone, msg);
        })
        .catch((err) => console.error('[whatsapp] ticket-closed notify failed:', err.message));
    }
  }
}
entityRouter.put('/:name/:id', wrap(updateHandler));
entityRouter.patch('/:name/:id', wrap(updateHandler));

entityRouter.delete('/:name/:id', wrap(async (req, res) => {
  if (!assertUserWriteAllowed(req, res)) return;
  const entity = req.params.name;
  const record = await getEntityRecord(req.schemaName, entity, req.params.id);
  if (!record) return res.status(404).json({ message: `${entity} not found` });
  if (entity === 'User' && record.id === req.user.id) {
    return res.status(400).json({ message: 'You cannot delete your own account' });
  }
  await deleteEntityRecord(req.schemaName, entity, req.params.id);
  if (entity === 'User') {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [record.id]);
  }
  broadcast(req.schemaName, entity, 'delete', record);
  res.json({ success: true });
}));
app.get('/api/admin/whatsapp-number', requireAuth, requireAdmin, requireSocietySchema, wrap(async (req, res) => {
  const [settings] = await listEntity(req.schemaName, 'SocietySettings');
  res.json({ ticket_whatsapp_number: settings?.ticket_whatsapp_number || '' });
}));

app.patch('/api/admin/whatsapp-number', requireAuth, requireAdmin, requireSocietySchema, wrap(async (req, res) => {
  const raw = String(req.body?.ticket_whatsapp_number || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw && (digits.length < 7 || digits.length > 15)) {
    return res.status(400).json({ message: 'Enter a valid phone number, or leave it blank to turn off WhatsApp alerts' });
  }
  const [existing] = await listEntity(req.schemaName, 'SocietySettings');
  if (existing) {
    const updated = { ...existing, ticket_whatsapp_number: raw, updated_date: nowIso() };
    await updateEntityRecord(req.schemaName, 'SocietySettings', existing.id, updated);
    return res.json({ ticket_whatsapp_number: updated.ticket_whatsapp_number });
  }
  const created = {
    ...baseRecord({ created_by: req.user.email, created_by_id: req.user.id }),
    society_id: req.society.id,
    society_name: req.society.name,
    ticket_whatsapp_number: raw,
  };
  await insertEntityRecord(req.schemaName, 'SocietySettings', created);
  res.status(201).json({ ticket_whatsapp_number: created.ticket_whatsapp_number });
}));
app.use('/api/entities', entityRouter);

// Security scans/types in a gate pass code — no resident approval needed,
// the code itself is the approval. Marks the pass used and logs a normal,
// already-approved Visitor entry so it shows up in the usual history too.
app.post('/api/gate-pass/verify', requireAuth, requireSocietySchema, wrap(async (req, res) => {
  const user = req.user;
  if (user.role !== 'guard' && user.role !== 'admin') {
    return res.status(403).json({ message: 'Only security and admins can verify gate passes' });
  }
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ message: 'Gate pass code is required' });

  const passes = await listEntity(req.schemaName, 'GatePass');
  const pass = passes.find((p) => p.code === code);
  if (!pass) return res.status(404).json({ message: 'No gate pass found with that code' });
  if (pass.status === 'cancelled') return res.status(409).json({ message: 'This gate pass was cancelled' });
  if (pass.status === 'used') {
    return res.status(409).json({
      message: `Already used${pass.used_at ? ' at ' + new Date(pass.used_at).toLocaleString() : ''}`,
    });
  }
  if (pass.valid_date !== todayStr()) {
    return res.status(409).json({ message: `This pass is valid for ${pass.valid_date}, not today` });
  }

  const updatedPass = {
    ...pass,
    status: 'used',
    used_at: nowIso(),
    used_by: user.email,
    updated_date: nowIso(),
  };
  await updateEntityRecord(req.schemaName, 'GatePass', pass.id, updatedPass);
  broadcast(req.schemaName, 'GatePass', 'update', updatedPass);

  const visitorRecord = await buildRecord(req.schemaName, 'Visitor', {
    visitor_name: pass.visitor_name,
    visitor_phone: pass.visitor_phone || '',
    flat_number: pass.flat_number,
    resident_email: pass.resident_email,
    status: 'approved',
    check_in_time: nowIso(),
    gate_pass_id: pass.id,
  }, user);
  await insertEntityRecord(req.schemaName, 'Visitor', visitorRecord);
  broadcast(req.schemaName, 'Visitor', 'create', visitorRecord);

  res.json({ success: true, gate_pass: updatedPass, visitor: visitorRecord });
}));

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[wgate-api] Unhandled error:', err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  await initSchema();
  await seedIfEmpty();
  await pruneSessions();
  await cleanupOldRecords();
  // Re-run once a day for as long as the process stays up.
  setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000);
  app.post('/api/superadmin/cleanup', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  await cleanupOldRecords();
  res.json({ success: true, message: 'Cleanup pass complete' });
}));
  const server = app.listen(PORT, HOST, () => {
    console.log(`[wgate-api] Backend running at http://${HOST}:${PORT} (Postgres, schema-per-society)`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[wgate-api] Port ${PORT} is already in use. Close the other process or set WGATE_API_PORT.`);
    } else {
      console.error('[wgate-api] Server error:', err);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[wgate-api] Failed to start:', err.message);
  process.exit(1);
});
