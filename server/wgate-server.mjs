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
import compression from 'compression';
import crypto from 'node:crypto';
import pg from 'pg';
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import PDFDocument from 'pdfkit';


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
//const DEFAULT_INVITE_PASSWORD = 'welcome123';
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



const ENTITIES = ['User', 'SocietySettings', 'Visitor', 'ServiceTicket', 'MaintenanceBill', 'Notice', 'AmenityBooking', 'PreApproval', 'GatePass','FlatArea','ClassifiedPost','PaymentConfig'];

const ENTITY_DEFAULTS = {
  User: { role: 'tenant' },
  Visitor: { status: 'pending' },
  ServiceTicket: { priority: 'medium', status: 'open' },
  MaintenanceBill: { status: 'pending' },
  Notice: { type: 'announcement', is_pinned: false },
  AmenityBooking: { status: 'pending' },
  PreApproval: { status: 'active' },
  GatePass: { status: 'active' },
  ClassifiedPost: { status: 'active' },
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

const ROLES = ['admin', 'tenant', 'owner', 'guard','family'];
// Family members: login accounts a tenant/owner adds for people living in their own flat.
const FAMILY_RELATIONS = ['spouse', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'other'];
const MAX_FAMILY_PER_FLAT = 1;

const SELF_EDITABLE_FIELDS = ['full_name', 'phone'];

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
// A phone number is optional here, but when given it must be exactly 10 digits (numbers only).
const isValidPhone = (phone) => {
  if (!phone) return true;
  return /^\d{10}$/.test(String(phone).trim());
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

// Lets the database find the newest visitors without reading all of them.
async function createEntityIndexes(schemaName) {
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_entity_records_newest ON "${schemaName}".entity_records(entity, created_date DESC);`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_visitor_flat_newest ON "${schemaName}".entity_records ((lower(btrim(data->>'flat_number'))), created_date DESC) WHERE entity = 'Visitor';`
  );
}

// Adds the indexes to every society that already exists. Runs each time the server starts and is quick once done.
async function ensureEntityIndexes() {
  const { rows: schemas } = await pool.query('SELECT schema_name FROM societies');
  for (const { schema_name } of schemas) {
    try {
      await createEntityIndexes(schema_name);
    } catch (err) {
      console.warn(`[wgate-api] Could not add indexes to ${schema_name}:`, err.message);
    }
  }
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
  await createEntityIndexes(schemaName);
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
  // The short code members use to reach their own society's sign-in screen.
  await pool.query(`ALTER TABLE societies ADD COLUMN IF NOT EXISTS join_code TEXT;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_societies_join_code ON societies(join_code);`);
  const { rows: withoutCode } = await pool.query('SELECT id FROM societies WHERE join_code IS NULL');
  for (const row of withoutCode) await assignJoinCode(row.id);
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
  // Phone push-notification tokens (one row per installed app).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      schema_name TEXT NOT NULL,
      session_id UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(schema_name, user_id);`);
  // Emergency (SOS) alerts sent by residents.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS emergency_alerts (
      id UUID PRIMARY KEY,
      schema_name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      user_phone TEXT,
      flat_number TEXT,
      kind TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ack_by_name TEXT,
      ack_at TIMESTAMPTZ
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emergency_alerts_society ON emergency_alerts(schema_name, created_at DESC);`);
  // Platform-wide settings (not tied to any society), e.g. the festival banner.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// An 8-character code with no 0/O/1/I, so it is easy to read out loud and type.
function generateJoinCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) code += letters[crypto.randomInt(letters.length)];
  return code;
}

// Saves a new code for the society (used for new societies and when the super admin asks for a new one).
async function assignJoinCode(societyId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const code = generateJoinCode();
      await pool.query('UPDATE societies SET join_code = $1, updated_date = now() WHERE id = $2', [code, societyId]);
      return code;
    } catch (err) {
      if (err.code !== '23505') throw err; // 23505 = that code is already taken, try another
    }
  }
  throw new Error('Could not create a society code');
}

function rowToSociety(row) {
  return {
    id: row.id,
    name: row.name,
    city: row.city || '',
    address: row.address || '',
    join_code: row.join_code || '',
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
  await assignJoinCode(id);
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
  clearAuthCache();
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

// Who is signed in, remembered for 30 seconds so every request does not hit the database three times.
// It is cleared at once when any user, society or sign-out changes, so a disabled member is not kept waiting.
const AUTH_CACHE_MS = 30 * 1000;
const authCache = new Map(); // token hash -> { at, value }
const clearAuthCache = () => authCache.clear();

async function insertEntityRecord(schemaName, entity, record) {
  if (entity === 'User') clearAuthCache();
  await pool.query(
    `INSERT INTO "${schemaName}".entity_records (entity, id, data, created_date, updated_date) VALUES ($1,$2,$3,$4,$5)`,
    [entity, record.id, record, record.created_date, record.updated_date]
  );
  return record;
}

async function updateEntityRecord(schemaName, entity, id, record) {
  if (entity === 'User') clearAuthCache();
  await pool.query(
    `UPDATE "${schemaName}".entity_records SET data=$1, updated_date=$2 WHERE entity=$3 AND id=$4`,
    [record, record.updated_date, entity, id]
  );
  return record;
}
async function deleteEntityRecord(schemaName, entity, id) {
  if (entity === 'User') clearAuthCache();
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
// A family account only works while the primary member it belongs to still exists and is active.
async function familyAccountBlocked(schemaName, user) {
  if (user.role !== 'family') return false;
  const parent = UUID_RE.test(String(user.parent_user_id || ''))
    ? await getEntityRecord(schemaName, 'User', user.parent_user_id)
    : null;
  return !parent || parent.disabled === true;
}
async function resolveSession(token) {
  if (!token) return null;
  const key = sha256(token);
  const hit = authCache.get(key);
  if (hit && Date.now() - hit.at < AUTH_CACHE_MS) return hit.value;
  const value = await resolveSessionFromDb(token);
  if (value) {
    if (authCache.size > 2000) authCache.clear(); // keep the memory small
    authCache.set(key, { at: Date.now(), value });
  }
  return value;
}

async function resolveSessionFromDb(token) {
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
  if (await familyAccountBlocked(schemaName, user)) return null;
  return { session, user, society, schemaName };
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  if (typeof req.query.token === 'string') return req.query.token; // EventSource cannot set headers
  return null;
}

/* ---- Overdue dues: a flat far behind on maintenance can only use Billing ---- */

const DUES_CACHE_MS = 60 * 1000;
const duesCache = new Map(); // schemaName -> { at, flats }

// Flats with an unpaid bill that is more than N days past its due date
// (N = "restrict_after_days" in the payment settings; 0 or missing = off).
// A bill is ignored once the member has reported a payment, or the admin allowed access.
async function overdueFlats(schemaName) {
  const hit = duesCache.get(schemaName);
  if (hit && Date.now() - hit.at < DUES_CACHE_MS) return hit.flats;
  const flats = new Set();
  const [config] = await listEntity(schemaName, 'PaymentConfig');
  const days = Number.isInteger(config?.restrict_after_days) ? config.restrict_after_days : 0;
  if (config && days > 0) {
    // Dates are in Indian time.
    const cutoff = new Date(Date.now() + 5.5 * 3600000 - days * 86400000).toISOString().slice(0, 10);
    const bills = await listEntity(schemaName, 'MaintenanceBill');
    for (const b of bills) {
            if (b.status === 'paid' || b.restriction_waived) continue;
                  // if (b.status === 'paid' || b.restriction_waived || b.payment_claim) continue;
      const due = b.due_date ? String(b.due_date).slice(0, 10) : '';
      if (due && due < cutoff) flats.add(flatKey(b.flat_number));
    }
  }
  duesCache.set(schemaName, { at: Date.now(), flats });
  return flats;
}

async function duesBlocked(schemaName, user) {
  if (!schemaName || !user?.flat_number) return false;
  if (!['owner', 'tenant', 'family'].includes(user.role)) return false; // admin and guard are never locked
  return (await overdueFlats(schemaName)).has(flatKey(user.flat_number));
}

// What a locked flat can still reach: sign-in/out, its bills, the UPI details and flat size.
const DUES_ALLOWED = /^\/api\/(auth\/|emergency|push\/|billing\/|entities\/(MaintenanceBill|PaymentConfig|FlatArea|SocietySettings)(\/|\?|$))/;

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
    if (!DUES_ALLOWED.test(req.originalUrl) && (await duesBlocked(req.schemaName, req.user))) {
      return res.status(403).json({
        code: 'dues_overdue',
        message: 'Your maintenance bill is overdue. Please pay it to continue using the app.',
      });
    }
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

/* ------------------------------------------------------------------ */
/* Push notifications (Firebase Cloud Messaging)                      */
/* ------------------------------------------------------------------ */

let fcm = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    fcm = getMessaging();
    console.log('[push] Firebase ready');
  } else {
    console.log('[push] FIREBASE_SERVICE_ACCOUNT not set - push notifications are off');
  }
} catch (err) {
  console.error('[push] Firebase could not start:', err.message);
}

// Sends one notification to every phone these users are signed in on.
// Never throws: a failed push must not break the request that triggered it.
async function sendPushToUsers(schemaName, userIds, { title, body, data = {}, channelId = 'visitors' }) {
  if (!fcm || !userIds.length) return;
  try {
    const { rows } = await pool.query(
      `SELECT p.token FROM push_tokens p
         JOIN sessions s ON s.id = p.session_id AND s.expires_at > now()
        WHERE p.schema_name = $1 AND p.user_id = ANY($2::text[])`,
      [schemaName, userIds.map(String)]
    );
    const tokens = [...new Set(rows.map((r) => r.token))];
    if (!tokens.length) return;
    const payload = {};
    for (const [k, v] of Object.entries(data)) payload[k] = String(v ?? '');
    const result = await fcm.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: payload,
      android: { priority: 'high', ttl: 120000, notification: { channelId, sound: 'default' } },
    });
    // Forget phones that no longer have the app installed.
    const dead = [];
    result.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) dead.push(tokens[i]);
    });
    if (dead.length) await pool.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [dead]);
  } catch (err) {
    console.error('[push] send failed:', err.message);
  }
}

// A guard logged a visitor: tell everyone living in that flat.
async function notifyVisitorAtGate(schemaName, visitor) {
  if (!fcm) return;
  const users = await listEntity(schemaName, 'User');
  const ids = users
    .filter((u) => isResident(u) && !u.disabled && flatKey(u.flat_number) && flatKey(u.flat_number) === flatKey(visitor.flat_number))
    .map((u) => u.id);
  const what = visitor.purpose ? ` (${visitor.purpose})` : '';
  await sendPushToUsers(schemaName, ids, {
    title: 'Visitor at the gate',
    body: `${visitor.visitor_name || 'Someone'}${what} is waiting for your approval.`,
    data: { type: 'visitor', url: '/Visitors', visitor_id: visitor.id },
    channelId: 'visitors',
  });
}

const sseClients = new Map(); // res -> schemaName

function broadcast(schemaName, entity, type, record) {
  if (entity === 'MaintenanceBill' || entity === 'PaymentConfig') duesCache.delete(schemaName);
  if (sseClients.size === 0) return;
    let data = entity === 'User' ? publicUser(record) : record;
  if (entity === 'ClassifiedPost') {
    // Photos are large and the live event only makes screens reload, so leave them out.
    const { photos, ...light } = record;
    data = light;
  }
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

/* ------------------------------------------------------------------ */
/* Rate limiting                                                      */
/* ------------------------------------------------------------------ */

// In-memory fixed-window limiter. State lives in this process only, which is
// fine for a single Render instance; move to Redis if you ever run several.
function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }
  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  };
  setInterval(sweep, 60 * 1000).unref();
  const entryFor = (key) => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size >= 50000) { sweep(); if (hits.size >= 50000) hits.clear(); } // memory guard
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    return entry;
  };
  return {
    max,
    hit: (key) => { const entry = entryFor(key); entry.count += 1; return entry; },
    // Seconds until the key may try again, or 0 if it is not blocked.
    blockedFor: (key) => {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= Date.now() || entry.count < max) return 0;
      return Math.ceil((entry.resetAt - Date.now()) / 1000);
    },
    reset: (key) => { hits.delete(key); },
  };
}

function sendTooMany(res, seconds, message) {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ message, code: 'rate_limited', retry_after: seconds });
}

// Express middleware: counts every request for keyFn(req) and answers 429 past `max`.
function rateLimit({ windowMs, max, keyFn, message }) {
  const limiter = createLimiter({ windowMs, max });
  return (req, res, next) => {
    const entry = limiter.hit(keyFn(req));
    if (entry.count > max) {
      return sendTooMany(res, Math.ceil((entry.resetAt - Date.now()) / 1000), message);
    }
    next();
  };
}

const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Many residents can share one society Wi-Fi (one public IP), so the per-IP
// limits are generous; the tight limit is on failed logins per IP + account.
const loginIpLimit = rateLimit({
  windowMs: 15 * MINUTE, max: 100, keyFn: (req) => `login:${clientIp(req)}`,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});
const loginFailures = createLimiter({ windowMs: 15 * MINUTE, max: 8 });
const signupLimit = rateLimit({
  windowMs: HOUR, max: 5, keyFn: (req) => `signup:${clientIp(req)}`,
  message: 'Too many sign-up attempts. Please try again later.',
});
const forgotPasswordLimit = rateLimit({
  windowMs: HOUR, max: 10, keyFn: (req) => `forgot:${clientIp(req)}`,
  message: 'Too many password reset requests. Please try again later.',
});
const inviteLimit = rateLimit({
  windowMs: HOUR, max: 100, keyFn: (req) => `invite:${req.user?.id || clientIp(req)}`,
  message: 'You have sent too many invitations. Please try again later.',
});
const adminResetLimit = rateLimit({
  windowMs: HOUR, max: 60, keyFn: (req) => `adminreset:${req.user?.id || clientIp(req)}`,
  message: 'Too many password resets. Please try again later.',
});
const changePasswordLimit = rateLimit({
  windowMs: 15 * MINUTE, max: 10, keyFn: (req) => `chgpw:${req.user?.id || clientIp(req)}`,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

const app = express();
app.disable('x-powered-by');
// Render terminates TLS in front of the app. Trusting one proxy hop makes
// req.ip the real client address (otherwise every user shares the proxy's IP
// and the limits would hit everyone at once). Set TRUST_PROXY=0 locally if needed.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.use(cors());
// Shrinks JSON responses (lists, photos' text) before they travel. The live-updates stream is left alone.
app.use(compression({
  filter: (req, res) => (req.originalUrl.startsWith('/api/events') ? false : compression.filter(req, res)),
}));
app.use(express.json({ limit: '10mb' }));

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// A light check for the uptime monitor. It does not touch the database, so Neon can still sleep.
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ success: true, message: 'WGate backend is running', storage: 'postgres', time: nowIso() });
}));

app.get('/api/public-settings', (_req, res) => {
  res.json({ id: 'wgate-local', public_settings: { auth_mode: 'local', app_name: 'WGate' } });
});

const codeFailures = createLimiter({ windowMs: 15 * MINUTE, max: 15 });
const codeLookupLimit = rateLimit({
  windowMs: MINUTE, max: 60, keyFn: (req) => `joincode:${clientIp(req)}`,
  message: 'Too many requests. Please wait a minute and try again.',
});

// A member enters (or opens a link with) their society's code and gets back only that society.
// Nothing here lists societies, so a stranger cannot browse who uses WGate.
app.get('/api/public/society-by-code', codeLookupLimit, wrap(async (req, res) => {
  const failKey = `code|${clientIp(req)}`;
  const lockedFor = codeFailures.blockedFor(failKey);
  if (lockedFor) return sendTooMany(res, lockedFor, 'Too many wrong codes. Please wait a few minutes and try again.');
  const code = String(req.query.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { rows } = code.length >= 6 && code.length <= 12
    ? await pool.query('SELECT id, name, city FROM societies WHERE join_code = $1 AND approved = true', [code])
    : { rows: [] };
  if (!rows[0]) {
    codeFailures.hit(failKey);
    return res.status(404).json({ message: 'That society code was not found. Please check it with your society admin.' });
  }
  codeFailures.reset(failKey);
  res.json({ id: rows[0].id, name: rows[0].name, city: rows[0].city || '' });
}));

// The old list of every society. Still here for now so installed apps keep working; Part 3 removes it.
// app.get('/api/public/societies', wrap(async (_req, res) => {
//   const societies = await listSocieties();
//   // Only approved societies can log in, so only offer those on the login
//   // screen — a society that just signed up has nothing to select yet.
//   res.json(
//     societies
//       .filter((s) => s.approved)
//           .map(({ id, name, city, total_flats }) => ({ id, name, city, total_flats }))
//   );
// }));
// The public list of societies is switched off (it showed every society to anyone).
app.get('/api/public/societies', (_req, res) => {
  res.status(410).json({ message: 'Please update the WGate app.' });
});

/* Festival / welcome banner: one platform-wide pop-up that the super admin controls.
   Stored as a single row in platform_settings and shown to everyone when they open the app. */
const ANNOUNCEMENT_THEMES = ['general', 'diwali', 'dussehra', 'newyear', 'holi', 'eid', 'christmas', 'national'];

async function readAnnouncement() {
  const { rows } = await pool.query(`SELECT value FROM platform_settings WHERE key = 'announcement'`);
  return rows[0]?.value || null;
}

const announcementLimit = rateLimit({
  windowMs: MINUTE, max: 120, keyFn: (req) => `announce:${clientIp(req)}`,
  message: 'Too many requests. Please try again shortly.',
});

// Anyone, even before signing in, can read the banner while it is switched on and inside its dates.
app.get('/api/public/announcement', announcementLimit, wrap(async (_req, res) => {
  const a = await readAnnouncement();
  const todayIst = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10); // today's date in India
  const live = a && a.enabled && (!a.start_date || a.start_date <= todayIst) && (!a.end_date || todayIst <= a.end_date);
  if (!live) return res.json({ active: false });
  res.json({ active: true, id: a.id, theme: a.theme, title: a.title, message: a.message });
}));

app.get('/api/superadmin/announcement', requireAuth, requireSuperadmin, wrap(async (_req, res) => {
  res.json((await readAnnouncement()) || { enabled: false, theme: 'general', title: '', message: '', start_date: '', end_date: '' });
}));

app.put('/api/superadmin/announcement', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const body = req.body || {};
  const enabled = body.enabled === true;
  const theme = ANNOUNCEMENT_THEMES.includes(body.theme) ? body.theme : 'general';
  const title = String(body.title ?? '').trim();
  const message = String(body.message ?? '').trim();
  const start_date = String(body.start_date ?? '').trim();
  const end_date = String(body.end_date ?? '').trim();
  const isDay = (s) => s === '' || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));
  if (enabled && !title) return res.status(400).json({ message: 'Enter a title for the banner' });
  if (title.length > 60) return res.status(400).json({ message: 'The title can be at most 60 characters' });
  if (message.length > 300) return res.status(400).json({ message: 'The message can be at most 300 characters' });
  if (!isDay(start_date) || !isDay(end_date)) return res.status(400).json({ message: 'Dates must look like 2026-11-08' });
  if (start_date && end_date && end_date < start_date) return res.status(400).json({ message: 'The end date is before the start date' });
  // A new id on every save, so everyone sees an edited banner again.
  const value = { enabled, theme, title, message, start_date, end_date, id: newId(), updated_at: nowIso() };
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ('announcement', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)]
  );
  res.json(value);
}));

/* Self-service signup. Creates the society and its first admin, but the
   society starts unapproved: nobody in it can log in until a super admin
   approves it (see POST /api/superadmin/societies/:id/approve), at which
   point its trial period starts. */
app.post('/api/signup', signupLimit, wrap(async (req, res) => {
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

app.post('/api/auth/login', loginIpLimit, wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const password = req.body?.password;
  const requestedSocietyId = req.body?.society_id || null;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  // Repeated wrong passwords for the same account from the same address are
  // locked out for the rest of the window; a correct login clears the count.
  const failKey = `${clientIp(req)}|${requestedSocietyId || 'superadmin'}|${email}`;
  const lockedFor = loginFailures.blockedFor(failKey);
  if (lockedFor) {
    return sendTooMany(res, lockedFor, 'Too many failed sign-in attempts. Please wait a few minutes and try again.');
  }
  const badCredentials = () => {
    loginFailures.hit(failKey);
    return res.status(401).json({ message: 'Invalid email or password' });
  };
  if (!requestedSocietyId) {
    // No society selected — this is the super admin login path.
    const { rows } = await pool.query('SELECT * FROM superadmins WHERE email = $1', [email]);
    const sa = rows[0];
    if (!sa || sa.disabled || !verifyPassword(password, sa.password_hash)) return badCredentials();
    loginFailures.reset(failKey);
    await pruneSessions();
    const token = await createSession(sa.id, null);
    return res.json({ token, user: publicUser(superadminRowToUser(sa)) });
  }

  const society = await getSocietyById(requestedSocietyId);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  const schemaName = await getSocietySchemaName(requestedSocietyId);

  const user = await findUserByEmail(schemaName, email);
  if (!user || user.disabled || !verifyPassword(password, user.password_hash)) return badCredentials();
  loginFailures.reset(failKey);
  if (await familyAccountBlocked(schemaName, user)) {
    return res.status(403).json({ message: 'This family account is no longer active. Please contact your society admin.' });
  }
  const issue = societyAccessIssue(society);
  if (issue) return res.status(403).json(issue);

  await pruneSessions();
  const token = await createSession(user.id, requestedSocietyId);
  // Lets the app show a "trial ends in N days" / "in grace period" banner
  // without a separate request — included on every successful login.
  res.json({
    token,
    user: { ...publicUser(user), dues_blocked: await duesBlocked(schemaName, user) },
    society_status: trialStatusFor(society),
  });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = bearerToken(req);
  if (token) {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    authCache.delete(sha256(token));
  }
  res.json({ success: true });
}));

/* ------------------------- emergency (SOS) alerts ------------------------- */

const EMERGENCY_KINDS = {
  medical: 'Medical emergency',
  fire: 'Fire',
  security: 'Security / theft',
  other: 'Other emergency',
};
const emergencyLimit = rateLimit({
  windowMs: 60 * 1000, max: 2, keyFn: (req) => `sos:${req.user?.id || clientIp(req)}`,
  message: 'An alert was just sent. Security and the admin have been notified.',
});
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const alertRow = (r) => ({
  id: r.id, kind: r.kind, label: EMERGENCY_KINDS[r.kind] || 'Emergency',
  flat_number: r.flat_number, user_name: r.user_name, user_phone: r.user_phone, note: r.note,
  created_at: r.created_at, ack_by_name: r.ack_by_name, ack_at: r.ack_at,
});

// A resident presses the emergency button: every guard and admin gets a push and a banner.
app.post('/api/emergency', requireAuth, requireSocietySchema, emergencyLimit, wrap(async (req, res) => {
  const user = req.user;
  if (!isResident(user)) return res.status(403).json({ message: 'Only residents can send an emergency alert' });
  const kind = EMERGENCY_KINDS[req.body?.kind] ? req.body.kind : 'other';
  const note = String(req.body?.note || '').trim().slice(0, 200);
  const { rows } = await pool.query(
    `INSERT INTO emergency_alerts (id, schema_name, user_id, user_name, user_phone, flat_number, kind, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [crypto.randomUUID(), req.schemaName, String(user.id), user.full_name || '', user.phone || '', user.flat_number || '', kind, note]
  );
  const alert = rows[0];
  pool.query(`DELETE FROM emergency_alerts WHERE created_at < now() - interval '180 days'`).catch(() => {});

  const staff = (await listEntity(req.schemaName, 'User')).filter((u) => isStaff(u) && !u.disabled).map((u) => u.id);
  sendPushToUsers(req.schemaName, staff, {
    title: `EMERGENCY: ${EMERGENCY_KINDS[kind]}`,
    body: `Flat ${alert.flat_number || '-'}, ${alert.user_name || 'a resident'}${alert.user_phone ? ' (' + alert.user_phone + ')' : ''}${note ? '. ' + note : ''}`,
    data: { type: 'emergency', url: '/Dashboard', alert_id: alert.id },
    channelId: 'emergency',
  });
  res.status(201).json({ success: true, id: alert.id });
}));

// Guards and admins: alerts from the last hour (the app checks this every few seconds).
app.get('/api/emergency/active', requireAuth, requireSocietySchema, wrap(async (req, res) => {
  if (!isStaff(req.user)) return res.status(403).json({ message: 'Only security and admins can see emergency alerts' });
  const { rows } = await pool.query(
    `SELECT * FROM emergency_alerts
      WHERE schema_name = $1 AND created_at > now() - interval '60 minutes'
      ORDER BY created_at DESC LIMIT 20`,
    [req.schemaName]
  );
  res.json(rows.map(alertRow));
}));

// Guards and admins: mark an alert as being handled (clears it for everyone).
app.post('/api/emergency/:id/ack', requireAuth, requireSocietySchema, wrap(async (req, res) => {
  if (!isStaff(req.user)) return res.status(403).json({ message: 'Only security and admins can do this' });
  if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Invalid alert' });
  await pool.query(
    `UPDATE emergency_alerts SET ack_by_name = $3, ack_at = now()
      WHERE id = $1 AND schema_name = $2 AND ack_at IS NULL`,
    [req.params.id, req.schemaName, req.user.full_name || req.user.email || 'Staff']
  );
  res.json({ success: true });
}));

// The app tells us its phone's push token after sign-in.
app.post('/api/push/register', requireAuth, requireSocietySchema, wrap(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (token.length < 20 || token.length > 4096) return res.status(400).json({ message: 'Invalid token' });
  await pool.query(
    `INSERT INTO push_tokens (token, user_id, schema_name, session_id, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id, schema_name = EXCLUDED.schema_name,
           session_id = EXCLUDED.session_id, updated_at = now()`,
    [token, String(req.user.id), req.schemaName, req.session.id]
  );
  res.json({ success: true });
}));

app.get('/api/auth/me', requireAuth, wrap(async (req, res) => {
  res.json({
    ...publicUser(req.user),
    dues_blocked: await duesBlocked(req.schemaName, req.user),
    society_status: req.society ? trialStatusFor(req.society) : undefined,
  });
}));

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

app.post('/api/auth/change-password', requireAuth, changePasswordLimit, wrap(async (req, res) => {
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
app.post('/api/auth/forgot-password',forgotPasswordLimit, wrap(async (req, res) => {
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
app.post('/api/users/invite', requireAuth, requireAdmin, requireSocietySchema,inviteLimit, wrap(async (req, res) => {
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
  //const role = requested === 'admin' ? 'admin' : ROLES.includes(requested) ? requested : 'tenant';
    const role = requested === 'admin' ? 'admin' : ROLES.includes(requested) && requested !== 'family' ? requested : 'tenant';
  const tempPassword = generateTempPassword();
    const user = {
    ...baseRecord({ created_by: req.user.email, created_by_id: req.user.id }),
    email,
    password_hash: hashPassword(tempPassword),
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
      password: tempPassword,
      role: user.role,
    }),
  });

  res.status(201).json({
    ...publicUser(user),
    initial_password: tempPassword,
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

app.post('/api/users/:id/reset-password', requireAuth, requireAdmin, requireSocietySchema,adminResetLimit, wrap(async (req, res) => {
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
const MENU_KEYS = ['Visitors', 'ServiceTickets', 'NoticeBoard', 'Billing', 'Amenities', 'PreApprovals', 'GatePasses','Community'];

// Which entity belongs to which menu section. A switched-off section is
// blocked on the API too, not just hidden in the nav.
const MENU_FOR_ENTITY = {
  Visitor: 'Visitors',
  ServiceTicket: 'ServiceTickets',
  Notice: 'NoticeBoard',
  MaintenanceBill: 'Billing',
  FlatArea: 'Billing',
  AmenityBooking: 'Amenities',
  // Rides along with the existing Visitors toggle — no new super admin
  // menu entry needed, since pre-approvals are part of gate management.
  PreApproval: 'Visitors',
  GatePass: 'Visitors',
  ClassifiedPost: 'Community',
  PaymentConfig: 'Billing',
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
  // Phone is optional, but when given it must be exactly 10 digits (numbers only).
  const phoneInput = String(req.body?.phone ?? '').trim();
  if (phoneInput && !/^\d{10}$/.test(phoneInput)) {
    return res.status(400).json({ message: 'Phone number must be exactly 10 digits, numbers only' });
  }
const tempPassword = generateTempPassword();
  const adminUser = {
    ...baseRecord({ created_by: req.user.email, created_by_id: req.user.id }),
    email,
    password_hash: hashPassword(tempPassword),
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
    res.status(201).json({ ...publicUser(adminUser), initial_password: tempPassword });
  // res.status(201).json({ ...publicUser(adminUser), initial_password: DEFAULT_INVITE_PASSWORD });
}));

// Use when a code has been shared with the wrong people. The old code and links stop working at once.
app.post('/api/superadmin/societies/:id/regenerate-code', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });
  res.json({ join_code: await assignJoinCode(society.id) });
}));

// The society admin reads their own society's code, to share it with residents.
app.get('/api/society/join-code', requireAuth, requireAdmin, requireSocietySchema, wrap(async (req, res) => {
  res.json({ join_code: req.society?.join_code || '', name: req.society?.name || '' });
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
/* ------------------------------ family ------------------------------ */
// A tenant or owner adds people who live in their flat. Each gets their own login, sees the
// same visitors for the flat and can approve or reject them.
const requirePrimaryResident = (req, res, next) =>
  isPrimaryResident(req.user)
    ? next()
    : res.status(403).json({ message: 'Only the flat owner or tenant can manage family members' });

app.get('/api/family', requireAuth, requireSocietySchema, requirePrimaryResident, wrap(async (req, res) => {
  const users = await listEntity(req.schemaName, 'User');
  res.json(users.filter((u) => u.role === 'family' && u.parent_user_id === req.user.id).map(publicUser));
}));

app.post('/api/family', requireAuth, requireSocietySchema, requirePrimaryResident, wrap(async (req, res) => {
  const flat = String(req.user.flat_number || '').trim();
  if (!flat) return res.status(400).json({ message: 'Your account has no flat number yet. Ask your society admin to add it.' });

  const fullName = String(req.body?.full_name || '').trim();
  if (!fullName || fullName.length > 100) return res.status(400).json({ message: "Enter the family member's name" });
  const email = normEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ message: 'Enter a valid email address' });
  }
  const phone = String(req.body?.phone || '').trim();
  if (!phone || !isValidPhone(phone)) return res.status(400).json({ message: 'Enter a valid phone number' });
  const relation = FAMILY_RELATIONS.includes(req.body?.relation) ? req.body.relation : 'other';

  if (await findUserByEmail(req.schemaName, email)) {
    return res.status(409).json({ message: 'A user with this email already exists in this society' });
  }
  const users = await listEntity(req.schemaName, 'User');
  const inThisFlat = users.filter((u) => u.role === 'family' && flatKey(u.flat_number) === flatKey(flat));
  if (inThisFlat.length >= MAX_FAMILY_PER_FLAT) {
    return res.status(400).json({ message: `A flat can have at most ${MAX_FAMILY_PER_FLAT} family members` });
  }

  const tempPassword = generateTempPassword();
  const member = {
    ...baseRecord({ created_by: req.user.email, created_by_id: req.user.id }),
    email,
    password_hash: hashPassword(tempPassword),
    full_name: fullName,
    role: 'family',
    relation,
    parent_user_id: req.user.id,
    flat_number: flat,
    phone,
    society_id: req.society.id,
    society_name: req.society.name,
    disabled: false,
    is_verified: false,
  };
  await insertEntityRecord(req.schemaName, 'User', member);
  broadcast(req.schemaName, 'User', 'create', member);

  const emailResult = await sendEmail({
    to: email,
    ...inviteEmailContent({
      name: fullName,
      societyName: req.society.name,
      email,
      password: tempPassword,
      role: 'family member',
    }),
  });
  res.status(201).json({ ...publicUser(member), initial_password: tempPassword, email_sent: emailResult.ok });
}));

app.delete('/api/family/:id', requireAuth, requireSocietySchema, requirePrimaryResident, wrap(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ message: 'Family member not found' });
  const member = await getEntityRecord(req.schemaName, 'User', req.params.id);
  if (!member || member.role !== 'family' || member.parent_user_id !== req.user.id) {
    return res.status(404).json({ message: 'Family member not found' });
  }
  await deleteEntityRecord(req.schemaName, 'User', member.id);
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [member.id]); // sign them out everywhere
  broadcast(req.schemaName, 'User', 'delete', member);
  res.json({ success: true });
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

/* Phone numbers of the residents of a flat, so the guard or admin can call or
   WhatsApp them while a visitor waits at the gate. Only staff can ask, and only
   for a flat that has a visitor waiting right now, so numbers are not handed out freely. */
app.get('/api/flats/:flat/contacts', requireAuth, requireSocietySchema, wrap(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'guard') {
    return res.status(403).json({ message: 'Only the admin and security can do that' });
  }
  const flat = flatKey(req.params.flat);
  if (!flat) return res.status(400).json({ message: 'Flat is required' });
  const visitors = await listEntity(req.schemaName, 'Visitor');
  const waiting = visitors.some((v) => v.status === 'pending' && flatKey(v.flat_number) === flat);
  if (!waiting) return res.status(404).json({ message: 'No visitor is waiting for this flat' });
  const users = await listEntity(req.schemaName, 'User');
  const contacts = users
    .filter((u) => !u.disabled && ['owner', 'tenant', 'family'].includes(u.role) && flatKey(u.flat_number) === flat && u.phone)
    .map((u) => ({ name: u.full_name || '', role: u.role, phone: u.phone }));
  res.json(contacts);
}));

/* ------------------------- PDF receipts and CSV export ------------------------- */

const exportLimit = rateLimit({
  windowMs: HOUR, max: 30, keyFn: (req) => `export:${req.user?.id || clientIp(req)}`,
  message: 'You have exported several times already. Please try again in a while.',
});
const receiptLimit = rateLimit({
  windowMs: HOUR, max: 60, keyFn: (req) => `receipt:${req.user?.id || clientIp(req)}`,
  message: 'You have downloaded many receipts already. Please try again in a while.',
});

const receiptNo = (bill) => `R-${String(bill.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const istDay = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};
const istTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
};
const rupees = (n) => 'Rs. ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// The standard PDF font has no Hindi letters; anything it cannot draw becomes a question mark.
const pdfText = (v) => String(v ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
const safeName = (s) => String(s || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';

function buildReceiptPdf(society, bill) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Receipt ${receiptNo(bill)}`, Author: pdfText(society.name || 'WGate') } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 50;
    const W = 495;
    const base = Number(bill.amount) || 0;
    const fine = Math.round(Number(bill.fine_applied) || 0);
    const total = Number(bill.amount_paid ?? base + fine) || 0;

    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(18).text(pdfText(society.name || 'Society'), L, 50, { width: W, align: 'center' });
    const addr = [society.address, society.city].filter(Boolean).join(', ');
    if (addr) doc.font('Helvetica').fontSize(10).fillColor('#555555').text(pdfText(addr), { width: W, align: 'center' });
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#047857').text('PAYMENT RECEIPT', { width: W, align: 'center' });
    doc.moveTo(L, doc.y + 6).lineTo(L + W, doc.y + 6).strokeColor('#dddddd').stroke();
    doc.moveDown(1.2);

    const row = (label, value, bold = false) => {
      const y = doc.y;
      doc.font('Helvetica').fontSize(11).fillColor('#666666').text(label, L, y, { width: 150 });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#111111').text(pdfText(value), L + 160, y, { width: W - 160 });
      doc.moveDown(0.5);
    };
    row('Receipt no.', receiptNo(bill), true);
    row('Date paid', istDay(bill.paid_date));
    row('Flat', bill.flat_number, true);
    row('Received from', bill.resident_name || bill.resident_email || '-');
    row('Bill for', bill.month_label || bill.month || '-');
    row('Payment mode', bill.payment_mode ? String(bill.payment_mode).replace(/_/g, ' ') : '-');
    if (bill.transaction_id) row('Transaction ID', bill.transaction_id);

    doc.moveDown(0.8);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.8);

    const money = (label, value, { bold = false, size = 11, color = '#111111' } = {}) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(pdfText(label), L, y, { width: 330 });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(rupees(value), L + 330, y, { width: W - 330, align: 'right' });
      doc.moveDown(0.5);
    };
    money('Maintenance charges', base);
    if (bill.area_sqft > 0 && bill.rate_per_sqft > 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#777777').text(
        `${Number(bill.area_sqft).toLocaleString('en-IN')} sq ft x Rs. ${Number(bill.rate_per_sqft).toLocaleString('en-IN')} per sq ft`, L, doc.y, { width: W });
      doc.moveDown(0.4);
    }
    if (Array.isArray(bill.line_items)) {
      for (const item of bill.line_items) money(`  ${item.label || 'Charge'}`, item.amount, { size: 10, color: '#555555' });
    }
    if (fine > 0) money('Late fine', fine);
    doc.moveDown(0.3);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.6);
    money('Total paid', total, { bold: true, size: 14, color: '#047857' });

    doc.moveDown(3);
    doc.font('Helvetica').fontSize(9).fillColor('#888888')
      .text('This is a computer-generated receipt and does not need a signature.', L, doc.y, { width: W, align: 'center' })
      .text(`Generated on ${istDay(new Date())} by WGate`, { width: W, align: 'center' });
    doc.end();
  });
}

// Members download the receipt for their own paid bills; the admin can download any.
app.get('/api/billing/:id/receipt', requireAuth, requireSocietySchema, receiptLimit, wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ message: 'Bill not found' });
  const bill = await getEntityRecord(req.schemaName, 'MaintenanceBill', req.params.id);
  if (!bill || !canRead(req.user, 'MaintenanceBill', bill)) return res.status(404).json({ message: 'Bill not found' });
  if (bill.status !== 'paid') return res.status(409).json({ message: 'A receipt is available once the bill is paid' });
  const pdf = await buildReceiptPdf(req.society, bill);
  res.json({
    filename: `Receipt-${safeName(bill.flat_number)}-${safeName(bill.month || bill.month_label)}.pdf`,
    mime: 'application/pdf',
    data: pdf.toString('base64'),
  });
}));

// Excel opens a CSV correctly in UTF-8 when it starts with a byte-order mark. Cells that start
// with = + - @ get a leading apostrophe so a spreadsheet never runs them as a formula.
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const sendCsv = (res, filename, header, rows) => {
  const text = '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  res.json({ filename, mime: 'text/csv', data: Buffer.from(text, 'utf8').toString('base64') });
};

// Admin: every bill of the society.
app.get('/api/export/bills', requireAuth, requireAdmin, requireSocietySchema, exportLimit, wrap(async (req, res) => {
  const today = istToday();
  const bills = await listEntity(req.schemaName, 'MaintenanceBill');
  bills.sort((a, b) =>
    String(b.month || '').localeCompare(String(a.month || '')) ||
    String(a.flat_number || '').localeCompare(String(b.flat_number || ''), undefined, { numeric: true }));
  const header = ['Flat', 'Resident', 'Email', 'Month', 'Due date', 'Amount (Rs)', 'Late fine (Rs)', 'Total paid (Rs)', 'Status', 'Paid date', 'Payment mode', 'Transaction ID', 'Receipt no'];
  const rows = bills.slice(0, 20000).map((b) => {
    const paid = b.status === 'paid';
    const due = b.due_date ? String(b.due_date).slice(0, 10) : '';
    const status = paid ? 'paid' : (b.status === 'overdue' || (due && due < today) ? 'overdue' : 'pending');
    const fine = Math.round(Number(b.fine_applied) || 0);
    return [
      b.flat_number, b.resident_name, b.resident_email, b.month_label || b.month, due,
      Number(b.amount) || 0,
      paid ? fine : '',
      paid ? (Number(b.amount_paid ?? (Number(b.amount) || 0) + fine) || 0) : '',
      status,
      paid ? String(b.paid_date || '').slice(0, 10) : '',
      paid ? String(b.payment_mode || '').replace(/_/g, ' ') : '',
      paid ? (b.transaction_id || '') : '',
      paid ? receiptNo(b) : '',
    ];
  });
  sendCsv(res, `Bills-${today}.csv`, header, rows);
}));

// Admin: visitors between two dates (default: the last 30 days).
app.get('/api/export/visitors', requireAuth, requireAdmin, requireSocietySchema, exportLimit, wrap(async (req, res) => {
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  const to = isDay(req.query.to) ? String(req.query.to) : istToday();
  const from = isDay(req.query.from)
    ? String(req.query.from)
    : new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  if (from > to) return res.status(400).json({ message: 'The From date must be on or before the To date' });
  const { rows: found } = await pool.query(
    `SELECT data FROM "${req.schemaName}".entity_records
      WHERE entity = 'Visitor' AND created_date >= $1::timestamptz AND created_date < $2::timestamptz
      ORDER BY created_date DESC LIMIT 20000`,
    [`${from}T00:00:00+05:30`, new Date(Date.parse(`${to}T00:00:00+05:30`) + 86400000).toISOString()]
  );
  const header = ['Date', 'Check-in time', 'Check-out time', 'Visitor', 'Phone', 'Purpose', 'Flat', 'Vehicle', 'Status'];
  const rows = found.map(({ data: v }) => [
    istDay(v.check_in_time || v.created_date), istTime(v.check_in_time || v.created_date), istTime(v.check_out_time),
    v.visitor_name, v.visitor_phone, v.purpose, v.flat_number, v.vehicle_number, v.status,
  ]);
  sendCsv(res, `Visitors-${from}-to-${to}.csv`, header, rows);
}));

/* ------------------------- payment reminders ------------------------- */

const remindLimit = rateLimit({
  windowMs: HOUR, max: 6, keyFn: (req) => `remind:${req.user?.id || clientIp(req)}`,
  message: 'You have sent reminders several times already. Please try again in a while.',
});

// Admin: emails the tenant (or the owner, when there is no tenant) of every flat with an overdue bill.
// A flat is reminded at most once a day. Up to 25 flats are sent per tap, so each request stays short.
app.post('/api/billing/remind-email', requireAuth, requireAdmin, requireSocietySchema, remindLimit, wrap(async (req, res) => {
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const recently = Date.now() - 20 * 3600000;
  const [bills, users] = await Promise.all([
    listEntity(req.schemaName, 'MaintenanceBill'),
    listEntity(req.schemaName, 'User'),
  ]);

  const byFlat = new Map();
  for (const b of bills) {
    if (b.status === 'paid' || b.payment_claim) continue;
    const due = b.due_date ? String(b.due_date).slice(0, 10) : '';
    if (!(due && due < today)) continue; // only overdue bills
    if (b.last_reminded_at && Date.parse(b.last_reminded_at) > recently) continue;
    const key = flatKey(b.flat_number);
    if (!key) continue;
    if (!byFlat.has(key)) byFlat.set(key, []);
    byFlat.get(key).push(b);
  }

  let noEmail = 0;
  const targets = [];
  for (const [key, flatBills] of byFlat) {
    const residents = users.filter((u) => !u.disabled && isPrimaryResident(u) && u.email && flatKey(u.flat_number) === key);
    const tenants = residents.filter((u) => u.role === 'tenant');
    const to = (tenants.length ? tenants : residents).map((u) => u.email);
    if (to.length === 0) noEmail += 1;
    else targets.push({ to, flatBills, flat: flatBills[0].flat_number });
  }

  const batch = targets.slice(0, 25);
  const link = APP_URL ? `${APP_URL}/#/Billing` : '';
  const societyName = req.society?.name || 'your society';
  let sent = 0;
  let failed = 0;

  const remindFlat = async ({ to, flatBills, flat }) => {
    const rows = flatBills.map((b) => {
      const total = Math.round(Number(b.amount) || 0) + Math.round(Number(b.late_fine) || 0);
      return { label: b.month_label || b.month || 'Maintenance', total };
    });
    const textLines = rows.map((r) => `- ${r.label}: Rs ${r.total.toLocaleString('en-IN')}`);
    const htmlLines = rows.map((r) => `<li>${escapeHtml(r.label)}: <strong>&#8377;${r.total.toLocaleString('en-IN')}</strong></li>`);
    const subject = `Maintenance payment reminder - Flat ${flat}`;
    const html = `<p>Hello,</p><p>This is a reminder from ${escapeHtml(societyName)}. The maintenance bill for Flat ${escapeHtml(flat)} is overdue (late fine included where it applies):</p><ul>${htmlLines.join('')}</ul>` +
      (link ? `<p><a href="${link}">Open WGate and pay</a> with GPay, PhonePe or any UPI app.</p>` : '<p>Please open WGate and pay with GPay, PhonePe or any UPI app.</p>') +
      '<p>Thank you.</p>';
    const text = `Hello,\n\nThis is a reminder from ${societyName}. The maintenance bill for Flat ${flat} is overdue:\n${textLines.join('\n')}\n\n` +
      (link ? `Pay here: ${link}\n\n` : 'Please open WGate and pay.\n\n') + 'Thank you.';
    const results = await Promise.all(to.map((addr) => sendEmail({ to: addr, subject, html, text })));
    if (!results.some((r) => r.ok)) { failed += 1; return; }
    sent += 1;
    for (const b of flatBills) {
      const stamp = nowIso();
      const updated = { ...b, last_reminded_at: stamp, updated_date: stamp };
      await updateEntityRecord(req.schemaName, 'MaintenanceBill', b.id, updated);
      broadcast(req.schemaName, 'MaintenanceBill', 'update', updated);
    }
  };

  for (let i = 0; i < batch.length; i += 5) {
    await Promise.all(batch.slice(i, i + 5).map(remindFlat));
  }
  res.json({ sent, failed, no_email: noEmail, remaining: Math.max(0, targets.length - batch.length) });
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
// Family members count as residents (they can approve visitors and make pre-approvals and
// gate passes for their flat) but not as primary residents (no tickets, no billing).
const isPrimaryResident = (u) => u.role === 'tenant' || u.role === 'owner';
const isResident = (u) => isPrimaryResident(u) || u.role === 'family';
//const isResident = (u) => u.role === 'tenant' || u.role === 'owner';
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
  FlatArea: ['admin'],
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
    case 'ClassifiedPost': return user.role === 'admin' || isPrimaryResident(user);
    case 'PaymentConfig': return user.role === 'admin' || isPrimaryResident(user);
    case 'FlatArea': return user.role === 'admin' || (user.role !== 'family' && sameFlat(user, record));
    case 'Visitor': return isStaff(user) || sameFlat(user, record);
    // Guards need to see the list too, to recognize an expected daily
    // maid/cook/nanny or guest at the gate.
    case 'PreApproval': return isStaff(user) || sameFlat(user, record);
    case 'GatePass': return isStaff(user) || sameFlat(user, record);
    case 'ServiceTicket': return isStaff(user) || sameEmail(user, record);
        case 'MaintenanceBill': return user.role === 'admin' || (user.role !== 'family' && (sameFlat(user, record) || sameEmail(user, record)));
    //case 'MaintenanceBill': return user.role === 'admin' || sameFlat(user, record) || sameEmail(user, record);
    default: return false;
  }
}

function canDelete(user, entity, record) {
  if (entity === 'ClassifiedPost') {
          return user.role === 'admin' || (isPrimaryResident(user) && !!record && sameEmail(user, record));
  }
  if (entity === 'AmenityBooking' || entity === 'PreApproval' || entity === 'GatePass') {
    //return user.role === 'admin' || (isResident(user) && record && sameEmail(user, record));
        return user.role === 'admin' || (isResident(user) && record && (sameEmail(user, record) || sameFlat(user, record)));
  }
  return (WRITE_ROLES[entity] || ['admin']).includes(user.role);
}

const denyWrite = (res, message = 'You do not have permission to do that') => {
  res.status(403).json({ message });
  return null;
};

const pickDefined = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

/* Community forum: flats for rent or sale, household items, ads */
const CLASSIFIED_CATEGORIES = ['flat_rent', 'flat_sale', 'items', 'ad'];
const CLASSIFIED_MAX_ACTIVE_PER_PERSON = 10;

// Checks the fields of a forum post. Returns the clean fields, or null after
// sending a 400. With partial = true only the fields that were sent are checked.
function cleanClassifiedFields(res, body, { partial }) {
  const out = {};
  const bad = (message) => {
    res.status(400).json({ message });
    return null;
  };
  if (!partial || body.category !== undefined) {
    if (!CLASSIFIED_CATEGORIES.includes(body.category)) return bad('Choose what you are posting: rent, sale, household item or ad');
    out.category = body.category;
  }
  if (!partial || body.title !== undefined) {
    const title = String(body.title ?? '').trim();
    if (!title) return bad('Title is required');
    if (title.length > 100) return bad('Title can be at most 100 characters');
    out.title = title;
  }
  if (!partial || body.description !== undefined) {
    const description = String(body.description ?? '').trim();
    if (description.length > 1000) return bad('Details can be at most 1000 characters');
    out.description = description;
  }
  if (!partial || body.price !== undefined) {
    if (body.price === '' || body.price === null || body.price === undefined) {
      out.price = null;
    } else {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0 || price > 1000000000) return bad('Price must be a number, or leave it empty');
      out.price = Math.round(price);
    }
  }
    if (!partial || body.contact_phone !== undefined) {
    const phone = String(body.contact_phone ?? '').trim();
    if (!isValidPhone(phone)) return bad('Enter a valid phone number, or leave it empty');
    out.contact_phone = phone;
  }
  // Photos: up to 2. Each has a full-size JPEG and a small thumbnail (data URLs from the app).
  if (body.photos !== undefined || body.thumbs !== undefined) {
    const photos = body.photos ?? [];
    const thumbs = body.thumbs ?? [];
    if (!Array.isArray(photos) || !Array.isArray(thumbs) || photos.length > 2 || photos.length !== thumbs.length) {
      return bad('You can add up to 2 photos');
    }
    const isJpeg = (s, maxLength) =>
      typeof s === 'string' && s.length <= maxLength && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(s);
    if (!photos.every((s) => isJpeg(s, 450000)) || !thumbs.every((s) => isJpeg(s, 80000))) {
      return bad('Photos must be JPEG images (each under about 300 KB)');
    }
    out.photos = photos;
    out.thumbs = thumbs;
  }
  return out;
}

// The society's UPI ID (like mysociety@okhdfcbank) and the name shown on the payment screen.
function cleanPaymentConfig(res, body) {
  const upi = String(body.upi_id ?? '').trim();
  const name = String(body.payee_name ?? '').trim();
  if (!/^[a-zA-Z0-9.\-_]{2,100}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(upi)) {
    res.status(400).json({ message: 'Enter a valid UPI ID, like mysociety@okhdfcbank' });
    return null;
  }
  if (!name || name.length > 60) {
    res.status(400).json({ message: 'Enter the name to show on the payment screen (max 60 characters)' });
    return null;
  }
    // Days after the due date before a member is restricted. 0 switches the lock off.
  const rawDays = body.restrict_after_days === undefined || body.restrict_after_days === '' ? 30 : Number(body.restrict_after_days);
  if (!Number.isInteger(rawDays) || rawDays < 0 || rawDays > 365) {
    res.status(400).json({ message: 'Days before access is paused must be a whole number from 0 to 365 (0 = never)' });
    return null;
  }
  return { upi_id: upi, payee_name: name, restrict_after_days: rawDays };
}

// Returns the record input to store (sanitized), or null after sending an
// error response (403 for permission, 400/409 for bad/conflicting bookings).
async function authorizeCreate(req, res, entity, input) {
  const user = req.user;
  const body = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
    if (entity === 'FlatArea') {
    if (user.role !== 'admin') return denyWrite(res);
    const flat = String(body.flat_number || '').trim();
    const area = Number(body.area_sqft);
    if (!flat || flat.length > 20) {
      res.status(400).json({ message: 'Flat number is required' });
      return null;
    }
    if (!Number.isFinite(area) || area <= 0 || area > 100000) {
      res.status(400).json({ message: 'Area must be a number between 1 and 100000 sq ft' });
      return null;
    }
    const existingAreas = await listEntity(req.schemaName, 'FlatArea');
    if (existingAreas.some((r) => flatKey(r.flat_number) === flatKey(flat))) {
      res.status(409).json({ message: `Flat ${flat} already has a size. Edit it instead.` });
      return null;
    }
    return { flat_number: flat, area_sqft: area };    return { flat_number: flat, area_sqft: area };
  }
    if (entity === 'PaymentConfig') {
    if (user.role !== 'admin') return denyWrite(res);
    const fields = cleanPaymentConfig(res, body);
    if (!fields) return null;
    const existingConfig = await listEntity(req.schemaName, 'PaymentConfig');
    if (existingConfig.length > 0) {
      res.status(409).json({ message: 'Payment details are already set. Edit them instead.' });
      return null;
    }
    return fields;
  }
  if (entity === 'ClassifiedPost') {
    if (!isPrimaryResident(user) && user.role !== 'admin') {
      return denyWrite(res, 'Only owners, tenants and the admin can post here');
    }
    const fields = cleanClassifiedFields(res, body, { partial: false });
    if (!fields) return null;
    const existingPosts = await listEntity(req.schemaName, 'ClassifiedPost');
    const myActive = existingPosts.filter((p) => p.status === 'active' && sameEmail(user, p));
    if (myActive.length >= CLASSIFIED_MAX_ACTIVE_PER_PERSON) {
      res.status(400).json({ message: `You already have ${CLASSIFIED_MAX_ACTIVE_PER_PERSON} open posts. Close one before adding another.` });
      return null;
    }
    return {
      ...fields,
      status: 'active',
      flat_number: user.flat_number || '',
      resident_email: user.email,
      resident_name: user.full_name || '',
    };
  }
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
    //if (!isResident(user)) return denyWrite(res, 'Only residents and admins can raise tickets');
        if (!isPrimaryResident(user)) return denyWrite(res, 'Only residents and admins can raise tickets');
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
async function authorizeUpdate(req, res, entity, record, patch) {
  const user = req.user;
  const body = patch && typeof patch === 'object' && !Array.isArray(patch) ? { ...patch } : {};
    if (entity === 'FlatArea') {
    if (user.role !== 'admin') return denyWrite(res);
    const area = Number(body.area_sqft);
    if (!Number.isFinite(area) || area <= 0 || area > 100000) {
      res.status(400).json({ message: 'Area must be a number between 1 and 100000 sq ft' });
      return null;
    }
        return { area_sqft: area };
  }
   if (entity === 'PaymentConfig') {
    if (user.role !== 'admin') return denyWrite(res);
    return cleanPaymentConfig(res, body);
  }
  if (entity === 'MaintenanceBill' && user.role !== 'admin') {
    // A member can only report that they paid. The admin confirms it and closes the bill.
    if (!isPrimaryResident(user) || !sameFlat(user, record)) return denyWrite(res);
    if (record.status === 'paid') {
      res.status(400).json({ message: 'This bill is already paid' });
      return null;
    }
    if (record.payment_claim) {
      res.status(400).json({ message: 'Your payment is already submitted and waiting for the admin to confirm' });
      return null;
    }
    const utr = String(body.payment_claim?.utr ?? '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{8,30}$/.test(utr)) {
      res.status(400).json({ message: 'Enter the UPI transaction ID (UTR) from your payment app' });
      return null;
    }
    // One payment cannot be used to close two different bills.
    const allBills = await listEntity(req.schemaName, 'MaintenanceBill');
    const reused = allBills.some((b) =>
      b.id !== record.id &&
      ((b.payment_claim?.utr || '').toUpperCase() === utr || String(b.transaction_id || '').toUpperCase() === utr)
    );
    if (reused) {
      res.status(400).json({ message: 'This transaction ID has already been used for another bill' });
      return null;
    }
    return {
      payment_claim: {
        utr,
        claimed_by: user.full_name || user.email,
        claimed_email: user.email,
        claimed_at: nowIso(),
      },
    };
  }
  if (entity === 'ClassifiedPost') {
    const isOwner = (isPrimaryResident(user) || user.role === 'admin') && sameEmail(user, record);
    if (isOwner) {
      const fields = cleanClassifiedFields(res, body, { partial: true });
      if (!fields) return null;
      if (body.status !== undefined) {
        if (!['active', 'closed'].includes(body.status)) return denyWrite(res, 'Invalid status');
        fields.status = body.status;
      }
      return fields;
    }
    // Nobody else (admin and guard included) can change someone else's post.
    // if (user.role === 'admin') {
    //   // Moderation only: the admin can close or reopen someone else's post, not rewrite it.
    //   if (!['active', 'closed'].includes(body.status)) return denyWrite(res, 'Invalid status');
    //   return { status: body.status };
    // }
    return denyWrite(res);
  }
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
    if (isResident(user) && (sameEmail(user, record) || sameFlat(user, record))) {
      const keys = Object.keys(body);
      const onlyCancel = keys.length === 1 && keys[0] === 'status' && body.status === 'cancelled';
      return onlyCancel ? body : denyWrite(res, 'You can only cancel your own pre-approval');
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
    if (isResident(user) && (sameEmail(user, record) || sameFlat(user, record))) {
      const keys = Object.keys(body);
      const onlyCancel = keys.length === 1 && keys[0] === 'status' && body.status === 'cancelled';
      if (!onlyCancel) return denyWrite(res, 'You can only cancel your own gate pass');
      return body;
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
        const patch = await authorizeUpdate(req, res, entity, record, req.body);
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
        record.password_hash = hashPassword(record.password || generateTempPassword());
    // record.password_hash = hashPassword(record.password || DEFAULT_INVITE_PASSWORD);
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
  let rows;
  let fastPath = false;
  const pageSize = parseInt(req.query.limit, 10);
  const pageSkip = Math.max(0, parseInt(req.query.skip, 10) || 0);
  const queryKeys = Object.keys(query);
  const newestFirst = !req.query.sort || String(req.query.sort) === '-created_date';
  // Visitors pile up all year. For the usual list (newest first, a page at a time) the database returns just that page.
  const staffList = isStaff(req.user) && queryKeys.length === 0;
  const flatList = !isStaff(req.user) && queryKeys.length === 1 && queryKeys[0] === 'flat_number' && typeof query.flat_number === 'string';
  if (entity === 'Visitor' && newestFirst && Number.isFinite(pageSize) && pageSize > 0 && (staffList || flatList)) {
    const params = [];
    let where = "entity = 'Visitor'";
    if (flatList) {
      params.push(flatKey(query.flat_number));
      where += ` AND lower(btrim(data->>'flat_number')) = $${params.length}`;
    }
    params.push(pageSize, pageSkip);
    const found = await pool.query(
      `SELECT data FROM "${req.schemaName}".entity_records WHERE ${where} ORDER BY created_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    rows = found.rows.map((r) => r.data);
    fastPath = true;
  } else {
    rows = await listEntity(req.schemaName, entity);
  }
  // entity === 'User' &&
  if ( req.user.role !== 'admin') {
  rows = rows.filter((r) => canRead(req.user, entity, r));
  }
  // Only return records this person may see (their own flat's visitors, bills, passes...).
  
  rows = rows.filter((r) => matchesQuery(r, query));
  rows = sortRecords(rows, req.query.sort ? String(req.query.sort) : '-created_date');
  const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
  const limit = parseInt(req.query.limit, 10);
  if (!fastPath) rows = rows.slice(skip, Number.isFinite(limit) && limit > 0 ? skip + limit : undefined);
  if (entity === 'ClassifiedPost') {
    // Lists carry only the small thumbnails; the full photos load when a post's photo is opened.
    return res.json(rows.map((r) => {
      const { photos, ...rest } = clean(entity, r);
      return { ...rest, photo_count: Array.isArray(photos) ? photos.length : 0 };
    }));
  }
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

    // Fire-and-forget: push the visitor alert to the flat's phones.
    if (entity === 'Visitor' && record.status === 'pending') {
      notifyVisitorAtGate(req.schemaName, record).catch((err) => console.error('[push] visitor notify failed:', err.message));
    }

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
    // 
        if (patch.role !== undefined && !ROLES.includes(patch.role)) {
      return res.status(400).json({ message: `Invalid role. Use one of: ${ROLES.join(', ')}` });
    }
    if (patch.role !== undefined && (patch.role === 'family') !== (record.role === 'family')) {
      return res.status(400).json({ message: 'Family accounts are added by the flat owner or tenant, and their role cannot be changed' });
    }
    if (record.role === 'family') {
      delete patch.flat_number; // a family member's flat always follows the primary member
    }
    if (record.id === req.user.id && patch.role && patch.role !== 'admin') {
      return res.status(400).json({ message: 'You cannot remove your own admin role' });
    }
  }

  // const updated = { ...record, ...patch, updated_date: nowIso() };
  // await updateEntityRecord(req.schemaName, entity, req.params.id, updated);
  // broadcast(req.schemaName, entity, 'update', updated);
  // res.json(clean(entity, updated));
  const updated = { ...record, ...patch, updated_date: nowIso() };
  await updateEntityRecord(req.schemaName, entity, req.params.id, updated);
  broadcast(req.schemaName, entity, 'update', updated);
  if (entity === 'User' && record.role !== 'family' && patch.flat_number !== undefined && patch.flat_number !== record.flat_number) {
    const familyOfRecord = (await listEntity(req.schemaName, 'User'))
      .filter((u) => u.role === 'family' && u.parent_user_id === record.id);
    for (const member of familyOfRecord) {
      const moved = { ...member, flat_number: updated.flat_number, updated_date: nowIso() };
      await updateEntityRecord(req.schemaName, 'User', member.id, moved);
      broadcast(req.schemaName, 'User', 'update', moved);
    }
  }
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
app.post('/api/superadmin/cleanup', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  await cleanupOldRecords();
  res.json({ success: true, message: 'Cleanup pass complete' });
}));

const CLEARABLE_ENTITIES = ['GatePass', 'PreApproval', 'AmenityBooking', 'Visitor', 'ServiceTicket','MaintenanceBill', 'FlatArea'];

app.post('/api/superadmin/societies/:id/clear-data', requireAuth, requireSuperadmin, wrap(async (req, res) => {
  const society = await getSocietyById(req.params.id);
  if (!society) return res.status(404).json({ message: 'Society not found' });

  const entities = Array.isArray(req.body?.entities) ? req.body.entities : [];
  const invalid = entities.filter((e) => !CLEARABLE_ENTITIES.includes(e));
  if (entities.length === 0 || invalid.length > 0) {
    return res.status(400).json({ message: `entities must be a non-empty list from: ${CLEARABLE_ENTITIES.join(', ')}` });
  }

  const schemaName = await getSocietySchemaName(society.id);
  const deleted = {};
  for (const entity of entities) {
    const { rowCount } = await pool.query(
      `DELETE FROM "${schemaName}".entity_records WHERE entity = $1`,
      [entity]
    );
    deleted[entity] = rowCount;
  }
  res.json({ success: true, deleted });
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
  await ensureEntityIndexes();
  await cleanupOldRecords();
  // Re-run once a day for as long as the process stays up.
  setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000);

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