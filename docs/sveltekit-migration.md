# SvelteKit consolidation

[Linear project and milestones](https://linear.app/ibs-msap/project/sveltekit-consolidation-3e6a3b910b1f)

Target: one SvelteKit 3/Svelte 5 application on Bun, Zod input validation, and
Drizzle over the existing SQLite database. App-owned reads and mutations move to
remote functions; uploads, downloads and integration boundaries use server endpoints.

## Current boundary

- T-1: the UI uses SvelteKit page routes and the official Bun adapter. Existing
  browser-only editors/stores remain client-rendered (`ssr = false`). The small
  router module delegates navigation to SvelteKit while existing callers migrate.
- T-2: all 16 tables are mapped in `Frontend/src/lib/server/db/schema.ts`.
  Compatibility tests compare columns/defaults, indexes and foreign-key actions
  against the existing migrations and exercise dates, booleans, update timestamps,
  uniqueness, delete behavior and transaction rollback. Startup records a guarded
  Drizzle baseline for compatible existing databases; it rejects partial/mismatched
  schemas before writing history. Fresh installations use the versioned baseline SQL.
- T-3: authentication, registration, session checks, profile changes, short-lived
  legacy WebSocket tokens and reference management use Zod-validated native remote
  functions backed by Drizzle. Authorization reloads active status and roles from
  SQLite. Registration and profile audit writes are transactional. Client caches
  refresh after mutations and session changes.
- Elysia/Prisma still serve ticket workflows, approvals, comments, uploads,
  messaging, notifications, dashboards/reports and realtime transport. Their
  remaining migration/removal is tracked by T-3, T-4 and T-5.

## Database compatibility

Keep SQL table/column names and existing records. Preserve the SQLite/uploads
volume names at cutover. Do not reset the database, run Drizzle schema push, or
apply an initial create-table migration over an existing installation.

Prisma/libsql writes ISO dates with a `+00:00` offset. SQLite defaults can produce
UTC text, and older clients can store epoch milliseconds. The Drizzle date column
handles these encodings, preserves the current write format, and rejects invalid
dates. `User`, `Ticket`, and `TicketComment` need application-maintained
`updated_at` values; the schema provides insert/update hooks. Baseline the migration
history and verify a backup of deployed data before production cutover. Drizzle
inserts use an ISO UTC SQL expression for default timestamps, preserving ordering
and millisecond precision alongside Prisma/libsql dates. Legacy SQL defaults stay
untouched when an existing database is adopted.

## Deployment during the transition

Keep both Compose services while the backend migration is in progress. The
frontend now runs a Bun server on port 80 instead of nginx and shares the SQLite
volume and JWT secret with the backend. Backend migrations run first; frontend
startup then verifies/adopts the baseline. Build with `VITE_API_URL`,
`VITE_BASE_PATH` and `FRONTEND_URL` (the browser origin used for CSRF/cookie handling).
Compose supplies these values. Local development must also use the same database
and JWT secret in both services; see `Frontend/.env.example`.

The Caddy frontend handler must preserve the subpath:

```caddyfile
handle /ticketing/* {
    reverse_proxy ticketing-frontend:80
}
```

Keep the preceding `handle_path /ticketing/api/*` handler for the existing API.
Apply `deploy/Caddyfile.ticketing` to the server's Caddyfile and validate/reload
Caddy when deploying this milestone. The repository does not edit the live server.

Service-worker registration remains scoped to the app. The native worker caches
build/static assets, never API responses, and preserves push/click behavior and
the update prompt. Database operations require connectivity.

The older Render/PostgreSQL blueprint is not the supported deployment target for
this migration; the tested configuration is SQLite with Docker Compose/Caddy.

## Verification

```sh
cd Frontend
bun install --frozen-lockfile
bun run check
bun test
bun run build
bun run test:server
```

Before T-5, verify all role-specific ticket/approval transitions, internal-note
and message privacy, attachment originals/previews/deletion, web push and realtime
reconnections. Retire Elysia, Eden, Prisma and legacy deployment configuration only
after those checks pass. No production cutover has been performed.
