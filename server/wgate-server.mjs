/**
 * WGate backend — PostgreSQL edition.
 *
 * Works identically whether DATABASE_URL points at:
 *   - a Neon free Postgres project (recommended — no expiration), or
 *   - Render's own free Postgres (expires 30 days after creation), or
 *   - any other Postgres instance.
 *
 * Same API surface as the JSON-file version: local email/password auth
 * (no Base44, no OAuth), and a generic entity CRUD API the frontend's
 * src/api/base44Client.js already talks to.
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

const PORT = Number(process.env.WGATE_API_PORT || process.env.PORT || 4400);
// 0.0.0.0 works for local dev (still reachable via localhost) and is
// required by most hosting platforms (Render, etc.) which need the
// server to bind all interfaces, not just the loopback address.
const HOST = process.env.WGATE_API_HOST || '0.0.0.0';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_INVITE_PASSWORD = 'welcome123';

const ENTITIES = [
  'User',
  'Society',
  'SocietySettings',
  'Visitor',
  'ServiceTicket',
  'MaintenanceBill',
  'Notice',
];

const ENTITY_DEFAULTS = {
  User: { role: 'tenant' },
  Visitor: { status: 'pending' },
  ServiceTicket: { priority: 'medium', status: 'open' },
  MaintenanceBill: { status: 'pending' },
  Notice: { type: 'announcement', is_pinned: false },
};

const ROLES = ['admin', 'tenant', 'owner', 'guard'];
const SELF_EDITABLE_FIELDS = ['full_name', 'phone', 'flat_number', 'society_id', 'society_name'];

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

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const normEmail = (email) => String(email || '').trim().toLowerCase();

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
/* Schema                                                             */
/* ------------------------------------------------------------------ */

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entity_records (
      entity TEXT NOT NULL,
      id UUID NOT NULL,
      data JSONB NOT NULL,
      created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (entity, id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_entity_records_entity ON entity_records(entity);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);`);
}

/* ------------------------------------------------------------------ */
/* Entity data access                                                 */
/* ------------------------------------------------------------------ */

async function listEntity(entity) {
  const { rows } = await pool.query('SELECT data FROM entity_records WHERE entity = $1', [entity]);
  return rows.map((r) => r.data);
}

async function countEntity(entity) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM entity_records WHERE entity = $1', [entity]);
  return rows[0].n;
}

async function getEntityRecord(entity, id) {
  const { rows } = await pool.query('SELECT data FROM entity_records WHERE entity = $1 AND id = $2', [entity, id]);
  return rows[0]?.data || null;
}

async function insertEntityRecord(entity, record) {
  await pool.query(
    'INSERT INTO entity_records (entity, id, data, created_date, updated_date) VALUES ($1, $2, $3, $4, $5)',
    [entity, record.id, record, record.created_date, record.updated_date]
  );
  return record;
}

async function updateEntityRecord(entity, id, record) {
  await pool.query(
    'UPDATE entity_records SET data = $1, updated_date = $2 WHERE entity = $3 AND id = $4',
    [record, record.updated_date, entity, id]
  );
  return record;
}

async function deleteEntityRecord(entity, id) {
  await pool.query('DELETE FROM entity_records WHERE entity = $1 AND id = $2', [entity, id]);
}

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT data FROM entity_records WHERE entity = 'User' AND data->>'email' = $1`,
    [normEmail(email)]
  );
  return rows[0]?.data || null;
}

/* ------------------------------------------------------------------ */
/* Seed data (only when there are no users yet)                       */
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
  const userCount = await countEntity('User');
  if (userCount > 0) return;

  const society = baseRecord({
    name: 'Green Valley Residency',
    address: '12, Lake View Road',
    city: 'Bengaluru',
    total_flats: 120,
  });
  await insertEntityRecord('Society', society);

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
  for (const u of [admin, guard, tenant, owner]) await insertEntityRecord('User', u);

  const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

  await insertEntityRecord('Visitor', baseRecord({
    visitor_name: 'Rahul Sharma',
    visitor_phone: '9876543210',
    purpose: 'guest',
    flat_number: 'A-101',
    resident_email: tenant.email,
    status: 'pending',
    vehicle_number: 'KA01AB1234',
    check_in_time: hoursAgo(1),
  }));
  await insertEntityRecord('Visitor', baseRecord({
    visitor_name: 'Swiggy Delivery',
    visitor_phone: '9123456780',
    purpose: 'delivery',
    flat_number: 'B-202',
    resident_email: owner.email,
    status: 'approved',
    check_in_time: hoursAgo(3),
  }));

  await insertEntityRecord('ServiceTicket', baseRecord({
    title: 'Kitchen tap leaking',
    description: 'The kitchen tap has been dripping since yesterday.',
    category: 'plumber',
    priority: 'medium',
    status: 'open',
    flat_number: 'A-101',
    resident_email: tenant.email,
  }));
  await insertEntityRecord('ServiceTicket', baseRecord({
    title: 'Corridor light not working',
    description: 'Second floor corridor light is out.',
    category: 'electrician',
    priority: 'low',
    status: 'in_progress',
    flat_number: 'B-202',
    resident_email: owner.email,
    assigned_to: 'Society electrician',
  }));

  await insertEntityRecord('Notice', baseRecord({
    title: 'Welcome to WGate',
    content: 'This is your WGate environment, now backed by PostgreSQL. Post notices, track visitors and manage service tickets.',
    type: 'announcement',
    society_id: society.id,
    society_name: society.name,
    posted_by: admin.full_name,
    is_pinned: true,
  }));

  const month = new Date().toISOString().slice(0, 7);
  await insertEntityRecord('MaintenanceBill', baseRecord({
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

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */


function publicUser(user) {
  if (!user) return null;
  // eslint-disable-next-line no-unused-vars
  const { password_hash, ...rest } = user;
  // Default to true for any record that predates this field (existing
  // seeded/invited accounts) — forces a password change rather than
  // silently trusting whatever password they already had.
  return { ...rest, must_change_password: user.must_change_password !== false };
}
async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [newId(), userId, sha256(token), new Date(Date.now() + SESSION_TTL_MS)]
  );
  return token;
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
  const user = await getEntityRecord('User', session.user_id);
  if (!user || user.disabled) return null;
  return { session, user };
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
    req.user = resolved.user;
    req.session = resolved.session;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
}

/* ------------------------------------------------------------------ */
/* Server-sent events (for entity.subscribe)                          */
/* ------------------------------------------------------------------ */

const sseClients = new Set();

function broadcast(entity, type, record) {
  if (sseClients.size === 0) return;
  const data = entity === 'User' ? publicUser(record) : record;
  const payload = `data: ${JSON.stringify({ entity, type, id: record.id, data, timestamp: nowIso() })}\n\n`;
  for (const client of sseClients) client.write(payload);
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

/* ---------------------------- auth ---------------------------- */

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const user = await findUserByEmail(email);
  if (!user || user.disabled || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  await pruneSessions();
  const token = await createSession(user.id);
  res.json({ token, user: publicUser(user) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = bearerToken(req);
  if (token) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  }
  res.json({ success: true });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

app.patch('/api/auth/me', requireAuth, wrap(async (req, res) => {
  const patch = {};
  for (const key of SELF_EDITABLE_FIELDS) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
  }
  const updated = { ...req.user, ...patch, updated_date: nowIso() };
  await updateEntityRecord('User', updated.id, updated);
  broadcast('User', 'update', updated);
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
  const updated = { ...req.user, password_hash: hashPassword(next),must_change_password: false, updated_date: nowIso() };
  await updateEntityRecord('User', updated.id, updated);
  res.json({ success: true, user: publicUser(updated) });
}));

/* Invite a member (local replacement for base44.users.inviteUser) */
app.post('/api/users/invite', requireAuth, requireAdmin, wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Email is required' });
  if (await findUserByEmail(email)) {
    return res.status(409).json({ message: 'A user with this email already exists' });
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
    society_id: req.user.society_id || null,
    society_name: req.user.society_name || '',
    disabled: false,
    is_verified: false,
  };
  await insertEntityRecord('User', user);
  broadcast('User', 'create', user);
  res.status(201).json({ ...publicUser(user), initial_password: DEFAULT_INVITE_PASSWORD });
}));

/* Distinct resident flat numbers — used by the guard's visitor check-in
   form to pick a flat instead of typing it freehand. Open to any
   authenticated role (not just admin), but only returns flat numbers,
   not full user records, so it doesn't leak other residents' PII. */
app.get('/api/flats', requireAuth, wrap(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT data->>'flat_number' AS flat_number
    FROM entity_records
    WHERE entity = 'User'
      AND data->>'role' IN ('tenant', 'owner')
      AND COALESCE(data->>'flat_number', '') <> ''
    ORDER BY flat_number
  `);
  res.json(rows.map((r) => r.flat_number));
}));
/* ------------------------- realtime events ------------------------- */

app.get('/api/events', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write('retry: 2000\n\n');
  sseClients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

/* --------------------------- entities --------------------------- */

const entityRouter = express.Router();
entityRouter.use(requireAuth);

entityRouter.use('/:name', (req, res, next) => {
  if (!ENTITIES.includes(req.params.name)) {
    return res.status(404).json({ message: `Unknown entity: ${req.params.name}` });
  }
  next();
});

function assertUserWriteAllowed(req, res) {
  if (req.params.name === 'User' && req.user.role !== 'admin') {
    res.status(403).json({ message: 'Only admins can manage users' });
    return false;
  }
  return true;
}

async function buildRecord(entity, input, actor) {
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
    record.email = normEmail(record.email);
    if (!record.email) throw Object.assign(new Error('Email is required'), { status: 400 });
    if (await findUserByEmail(record.email)) {
      throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
    }
    record.password_hash = hashPassword(record.password || DEFAULT_INVITE_PASSWORD);
    delete record.password;
  }
  return record;
}

entityRouter.get('/:name', wrap(async (req, res) => {
  const entity = req.params.name;
  let query = {};
  if (req.query.q) {
    try { query = JSON.parse(String(req.query.q)); } catch { return res.status(400).json({ message: 'Invalid q parameter' }); }
  }
  let rows = await listEntity(entity);
  if (entity === 'User' && req.user.role !== 'admin') rows = rows.filter((u) => u.id === req.user.id);
  rows = rows.filter((r) => matchesQuery(r, query));
  rows = sortRecords(rows, req.query.sort ? String(req.query.sort) : '-created_date');
  const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
  const limit = parseInt(req.query.limit, 10);
  rows = rows.slice(skip, Number.isFinite(limit) && limit > 0 ? skip + limit : undefined);
  res.json(rows.map((r) => clean(entity, r)));
}));

entityRouter.get('/:name/:id', wrap(async (req, res) => {
  const entity = req.params.name;
  const record = await getEntityRecord(entity, req.params.id);
  if (!record) return res.status(404).json({ message: `${entity} not found` });
  if (entity === 'User' && req.user.role !== 'admin' && record.id !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
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
      const record = await buildRecord(entity, item || {}, req.user);
      await insertEntityRecord(entity, record);
      created.push(record);
    }
    created.forEach((r) => broadcast(entity, 'create', r));
    res.status(201).json(created.map((r) => clean(entity, r)));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
}));

entityRouter.post('/:name', wrap(async (req, res) => {
  if (!assertUserWriteAllowed(req, res)) return;
  const entity = req.params.name;
  try {
    const record = await buildRecord(entity, req.body || {}, req.user);
    await insertEntityRecord(entity, record);
    broadcast(entity, 'create', record);
    res.status(201).json(clean(entity, record));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
}));

async function updateHandler(req, res) {
  if (!assertUserWriteAllowed(req, res)) return;
  const entity = req.params.name;
  const record = await getEntityRecord(entity, req.params.id);
  if (!record) return res.status(404).json({ message: `${entity} not found` });

  const patch = { ...(req.body || {}) };
  delete patch.id;
  delete patch.created_date;
  delete patch.created_by;
  delete patch.created_by_id;
  delete patch.password_hash;

  if (entity === 'User') {
    if (patch.email !== undefined) {
      patch.email = normEmail(patch.email);
      const existing = await findUserByEmail(patch.email);
      if (existing && existing.id !== record.id) {
        return res.status(409).json({ message: 'A user with this email already exists' });
      }
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
  await updateEntityRecord(entity, req.params.id, updated);
  broadcast(entity, 'update', updated);
  res.json(clean(entity, updated));
}
entityRouter.put('/:name/:id', wrap(updateHandler));
entityRouter.patch('/:name/:id', wrap(updateHandler));

entityRouter.delete('/:name/:id', wrap(async (req, res) => {
  if (!assertUserWriteAllowed(req, res)) return;
  const entity = req.params.name;
  const record = await getEntityRecord(entity, req.params.id);
  if (!record) return res.status(404).json({ message: `${entity} not found` });
  if (entity === 'User' && record.id === req.user.id) {
    return res.status(400).json({ message: 'You cannot delete your own account' });
  }
  await deleteEntityRecord(entity, req.params.id);
  if (entity === 'User') {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [record.id]);
  }
  broadcast(entity, 'delete', record);
  res.json({ success: true });
}));

app.use('/api/entities', entityRouter);

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

  const server = app.listen(PORT, HOST, () => {
    console.log(`[wgate-api] Backend running at http://${HOST}:${PORT} (Postgres)`);
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
