# Ticketing System

A robust, full-stack ticketing and collaboration platform designed for modern enterprises. This project features a high-performance backend powered by Bun and ElysiaJS, and a reactive, mobile-first frontend built with Svelte 5.

## 🏗️ Architecture

The project is split into two main components:

- **Frontend**: A Svelte 5 Single Page Application (SPA) with PWA support, optimized for speed and offline capabilities.
- **Backend**: An ElysiaJS (Bun) API service providing high-performance endpoints, real-time WebSocket communication, and Prisma ORM for database management.

## Run with Docker Compose

Install Docker Engine with Compose v2 (or Docker Desktop using Linux containers).
From the repository root:

1. Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell).
2. Set `JWT_SECRET` in `.env` to a long, random value.
3. Build and start:

   ```sh
   docker compose up -d --build
   docker compose ps
   docker compose logs -f backend
   ```

Open http://localhost:3001. The API is at http://localhost:3002 and its
documentation at http://localhost:3002/swagger.

Compose runs the existing SQLite database inside the backend container; no separate
database server is needed. Migrations run before the API starts. The frontend waits
for the API health check. Named volumes preserve SQLite data and uploaded files
across container rebuilds and `docker compose down`.

For a new local/demo installation, populate reference data and demo accounts once:

```sh
docker compose exec backend bun run db:seed
```

The existing seed creates `admin`, `mis`, `approver`, and `user`, all with password
`password123`. Change these passwords before making the app accessible to others.
Seeding is explicit so normal restarts do not create demo accounts.

For optional browser push notifications, generate your own VAPID keys:

```sh
docker compose exec backend bun -e "console.log(require('web-push').generateVAPIDKeys())"
```

Put the keys and a `mailto:` contact in `.env`, then run `docker compose up -d`.
Browser push requires HTTPS except on localhost.

For access from another computer, set `FRONTEND_URL` and `VITE_API_URL` to URLs
reachable by that computer and run `docker compose up -d --build` again. The API URL
is embedded in the frontend at build time; a Compose service name such as `backend`
is not a browser-accessible hostname. Configure HTTPS before public deployment.

Stop with `docker compose down`. **`docker compose down -v` deletes the database
and uploads.** This setup starts a fresh SQLite database; it does not import an
existing local/Turso database or migrate old PostgreSQL data. Any volume from the
previous PostgreSQL Compose setup is left untouched.

### Existing Caddy server at 192.168.0.254

Use the shared external `proxy` network to serve the app at
`https://192.168.0.254/ticketing/`. Caddy's container must already belong to that
network. This override removes both published host ports; Caddy reaches the
containers through their network aliases.

1. Copy `.env.example` to `.env` and set `JWT_SECRET` as above.
2. Start from this repository's directory (Compose v2.24.4 or newer):

   ```sh
   docker compose -f docker-compose.yml -f compose.caddy.yml config
   docker compose -f docker-compose.yml -f compose.caddy.yml up -d --build
   ```

3. Inside the existing `192.168.0.254 { ... }` Caddy site block, add the contents
   of [deploy/Caddyfile.ticketing](deploy/Caddyfile.ticketing) before the fallback
   `handle` that proxies Homarr:

   ```caddyfile
   redir /ticketing /ticketing/ 308

   handle_path /ticketing/api/* {
       reverse_proxy ticketing-backend:3000
   }

   handle_path /ticketing/* {
       reverse_proxy ticketing-frontend:80
   }
   ```

4. From `~/Services/caddy`, validate and reload (replace `caddy` if your Compose
   service has a different name):

   ```sh
   docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
   docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```

5. Open `https://192.168.0.254/ticketing/`. Check the API at
   `https://192.168.0.254/ticketing/api/health`.

For initial demo data:

```sh
docker compose -f docker-compose.yml -f compose.caddy.yml exec backend bun run db:seed
```

Use both Compose files for subsequent `up`, `down`, `exec`, and `logs` commands.
The override sets the browser API path to `/ticketing/api` and builds frontend
assets and navigation for `/ticketing/`. Caddy strips those prefixes upstream and
handles WebSocket upgrades automatically. The backend CORS origin is
`https://192.168.0.254` (an origin has no path). Trust your Caddy root certificate
on client devices for HTTPS and browser push to work without certificate errors.

## 🚀 Deployment Flow (Render)

This repository is optimized for deployment on [Render](https://render.com) using the included `render.yaml` Blueprint specification.

### Deployment Components

1.  **Frontend (Static Site)**:
    - Automatically builds using `bun run build`.
    - Serves the `dist` directory.
    - Configured with SPA rewrite rules (`/*` -> `/index.html`).
2.  **Backend (Web Service)**:
    - Runs on Bun.
    - Handles database migrations and seeding automatically on start.
    - Exposes a high-performance API.
3.  **PostgreSQL Database**:
    - Managed instance provisioned automatically via the Blueprint.

### One-Click Deployment Steps

1.  Fork this repository to your GitHub account.
2.  Log in to your Render dashboard.
3.  Click **New +** and select **Blueprint**.
4.  Connect your forked repository.
5.  Render will parse the `render.yaml` and prompt you to confirm the creation of the services.
6.  **Configuration**:
    - The `render.yaml` handles most environment variables.
    - You may need to update `VITE_API_URL` in the Frontend service settings if your Backend URL differs from the default in the YAML.

## 🛠️ Project Structure

```text
.
├── Backend/          # ElysiaJS API & Database (Bun)
├── Frontend/         # Svelte 5 Application (Vite)
├── plans/            # Documentation & Improvement plans
├── render.yaml       # Render Blueprint configuration
├── api.yaml          # OpenAPI/Swagger Specification
└── run_all_tests.sh  # E2E Test Suite runner
```

## 🧪 Local Development

To run the entire system locally, refer to the individual READMEs in the `Backend/` and `Frontend/` directories.

- [Backend Documentation](./Backend/README.md)
- [Frontend Documentation](./Frontend/README.md)

