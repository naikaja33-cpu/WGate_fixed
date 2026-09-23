/**
 * Local development replacement for the Base44 SDK client.
 *
 * This exposes the same shape the application already uses
 * (base44.auth.*, base44.entities.<Name>.*, base44.users.*) but talks to
 * the local Express API in ./server instead of Base44's hosted backend.
 * No Base44 hosted login, no external network calls.
 */

// In local dev, requests go to the relative "/api" path and Vite's dev
// proxy forwards them to the local backend (see vite.config.js).
// For a production deployment where the frontend and backend are hosted
// separately (e.g. frontend on GitHub Pages, backend on Render/Railway),
// set VITE_API_URL to the backend's full URL at build time, e.g.:
//   VITE_API_URL=https://your-backend.onrender.com/api npm run build
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'wgate_local_token';

let memoryToken = null;
try {
  memoryToken = window.localStorage.getItem(TOKEN_KEY);
} catch {
  // localStorage unavailable (SSR/tests) — fall back to memory-only token.
}

function getToken() {
  return memoryToken;
}

function setToken(token) {
  memoryToken = token;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* auth                                                                */
/* ------------------------------------------------------------------ */

const auth = {
  async login(email, password) {
    const result = await request('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    setToken(result.token);
    return result.user;
  },

  async me() {
    return request('/auth/me');
  },

  async isAuthenticated() {
    if (!getToken()) return false;
    try {
      await auth.me();
      return true;
    } catch {
      return false;
    }
  },

  async updateMe(data) {
    return request('/auth/me', { method: 'PATCH', body: data });
  },

  async changePassword(currentPassword, newPassword) {
    return request('/auth/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    });
  },

  logout() {
    const token = getToken();
    setToken(null);
    if (token) {
      // Fire-and-forget; local session cleanup, no redirect.
      request('/auth/logout', { method: 'POST' }).catch(() => {});
    }
  },

  // Kept for API compatibility with the previous Base44-hosted flow.
  // There is no hosted login in local development, so this just sends
  // the user back to the local login screen instead of a remote URL.
  redirectToLogin() {
    setToken(null);
    window.location.href = import.meta.env.BASE_URL;
  },
};

/* ------------------------------------------------------------------ */
/* users (admin actions)                                              */
/* ------------------------------------------------------------------ */

const users = {
  async inviteUser(email, role = 'tenant') {
    return request('/users/invite', { method: 'POST', body: { email, role } });
  },
};

/* ------------------------------------------------------------------ */
/* generic entity client + realtime subscriptions                     */
/* ------------------------------------------------------------------ */

const subscribers = new Map(); // entity -> Set(callback)
let eventSource = null;
let eventSourceRefCount = 0;

function ensureEventSource() {
  if (eventSource || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  const token = getToken();
  if (!token) return;
  eventSource = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token)}`);
  eventSource.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      const callbacks = subscribers.get(payload.entity);
      if (callbacks) callbacks.forEach((cb) => cb(payload));
    } catch {
      // ignore malformed events
    }
  };
  eventSource.onerror = () => {
    // Let the browser's built-in EventSource retry logic reconnect.
  };
}

function releaseEventSourceIfUnused() {
  eventSourceRefCount = Math.max(0, eventSourceRefCount - 1);
  if (eventSourceRefCount === 0 && eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function makeEntityClient(entityName) {
  const base = `/entities/${entityName}`;

  return {
    async list(sort, limit, skip) {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit !== undefined) params.set('limit', String(limit));
      if (skip !== undefined) params.set('skip', String(skip));
      const qs = params.toString();
      return request(`${base}${qs ? `?${qs}` : ''}`);
    },

    async filter(query = {}, sort, limit, skip) {
      const params = new URLSearchParams();
      params.set('q', JSON.stringify(query));
      if (sort) params.set('sort', sort);
      if (limit !== undefined) params.set('limit', String(limit));
      if (skip !== undefined) params.set('skip', String(skip));
      return request(`${base}?${params.toString()}`);
    },

    async get(id) {
      return request(`${base}/${id}`);
    },

    async create(data) {
      return request(base, { method: 'POST', body: data });
    },

    async bulkCreate(records) {
      return request(`${base}/bulk`, { method: 'POST', body: records });
    },

    async update(id, data) {
      return request(`${base}/${id}`, { method: 'PATCH', body: data });
    },

    async delete(id) {
      return request(`${base}/${id}`, { method: 'DELETE' });
    },

    subscribe(callback) {
      if (!subscribers.has(entityName)) subscribers.set(entityName, new Set());
      subscribers.get(entityName).add(callback);
      eventSourceRefCount += 1;
      ensureEventSource();
      return () => {
        subscribers.get(entityName)?.delete(callback);
        releaseEventSourceIfUnused();
      };
    },
  };
}

const ENTITY_NAMES = ['User', 'Society', 'SocietySettings', 'Visitor', 'ServiceTicket', 'MaintenanceBill', 'Notice'];

const entities = Object.fromEntries(ENTITY_NAMES.map((name) => [name, makeEntityClient(name)]));

export const base44 = {
  auth,
  users,
  entities,
};

export default base44;
