# WGate backend

Self-contained local/hosted replacement for the Base44 hosted backend.
No Docker, no separate DB server to install — it connects to a
PostgreSQL database over the network (recommended: a free Neon project).

- Runtime: plain Express (already a project dependency).
- Storage: PostgreSQL. A single generic `entity_records` table holds all
  app data as JSONB, plus a `sessions` table for login sessions. Tables
  are created automatically on first boot.
- Auth: local email/password sessions (opaque bearer tokens), password
  hashes via Node's built-in `crypto.scrypt` — no external auth provider.

## Set up the database (one time)

1. Create a free project at [neon.tech](https://neon.tech) (no expiration,
   0.5GB storage, sleeps after 5 min idle — fine for this app).
2. Copy its connection string (looks like
   `postgresql://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`).
3. Put it in `.env.local` as `DATABASE_URL=...` for local dev, **and**
   add the same value as an environment variable named `DATABASE_URL`
   on your Render web service (Environment tab) for the hosted deploy.

Using the same Neon database for both local dev and the Render
deployment means your data stays in sync between the two — no separate
setup needed for each.

## Start it

`npm run dev` starts this backend and the Vite dev server together.
The frontend talks to it through Vite's `/api` proxy, so you only ever
open `http://localhost:5173`.

To run only the backend: `npm run server` (listens on `http://localhost:4400`,
or whatever `PORT` the host provides).

The backend refuses to start if `DATABASE_URL` is not set — this is
intentional, so a missing/misconfigured database fails loudly instead of
silently running with no data.

## Default local accounts

Created automatically the first time the backend runs against an empty
database:

| Email                 | Password   | Role   |
|------------------------|-----------|--------|
| admin@wgate.local      | admin123  | admin  |
| owner@wgate.local      | owner123  | owner  |
| tenant@wgate.local     | tenant123 | tenant |
| guard@wgate.local      | guard123  | guard  |

## API surface

- `POST /api/auth/login` `{ email, password }` -> `{ token, user }`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/users/invite` (admin only)
- `GET/POST /api/entities/:name`, `GET/PUT/PATCH/DELETE /api/entities/:name/:id`,
  `POST /api/entities/:name/bulk`
  (`:name` is one of User, Society, SocietySettings, Visitor, ServiceTicket,
  MaintenanceBill, Notice)
- `GET /api/events` — Server-Sent Events stream used for the realtime
  visitor/ticket notifications in the UI.

This mirrors the subset of the Base44 SDK (`base44.auth.*`,
`base44.entities.*`, `base44.users.inviteUser`) that the app actually
uses, via `src/api/base44Client.js`.

## Deploying

- **Backend (Render):** New Web Service → connect the repo → Build
  command `npm install` → Start command `npm run server` → add the
  `DATABASE_URL` environment variable (see above). Render sets `PORT`
  automatically.
- **Frontend (GitHub Pages):**
  ```
  set VITE_API_URL=https://your-backend.onrender.com/api
  set VITE_BASE_PATH=/WGate_fixed/
  npm run deploy
  ```
  then set GitHub → Settings → Pages → source branch to `gh-pages`.
