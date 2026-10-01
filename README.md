# WGate — Society Management System

A multi-tenant society/apartment-complex management app: visitor check-in,
service tickets, notices, billing, and member management. Each society's
data lives in its own Postgres schema, managed under a super admin who
creates societies and their first admin accounts.

## Stack

- **Frontend:** React + Vite, Tailwind, shadcn/ui, HashRouter
- **Backend:** Node/Express (`server/wgate-server.mjs`), plain REST API
- **Database:** PostgreSQL — one schema per society, plus a shared schema
  for the society directory, super admin accounts, and sessions
- **Auth:** local email/password, no external provider
- **Mobile:** Android app via Capacitor (`android/` folder)

## Local development

1. `npm install`
2. Create `.env.local` with a Postgres connection string (a free
   [Neon](https://neon.tech) project works well):
   ```
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   ```
3. `npm run dev` — starts the backend and Vite dev server together at
   http://localhost:5173

On first boot against an empty database, the backend seeds:
- A demo society ("Green Valley Residency") with admin/owner/tenant/guard
  accounts — see `server/README-local.md` for credentials
- A super admin account (`superadmin@wgate.local`) — reachable at the
  hidden `/superadmin-login` route, not linked from the normal login page

See `server/README-local.md` for full details on the data model, API
routes, deployment (Render + GitHub Pages), and the Android build.
