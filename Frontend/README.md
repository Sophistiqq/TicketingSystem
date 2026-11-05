# Monolith Frontend

Ticketing interface built with **SvelteKit 3**, **Svelte 5**, and **Bun 1.4.4**. Migration tracking and current boundaries are in [the migration notes](../docs/sveltekit-migration.md).

## ⚡ Tech Stack

- **Framework**: [SvelteKit](https://svelte.dev/docs/kit) with Svelte 5 runes and file-based routing
- **Build Tool**: [Vite](https://vitejs.dev)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) & [DaisyUI](https://daisyui.com)
- **Icons**: [Lucide Svelte](https://lucide.dev)
- **Editor**: [Tiptap](https://tiptap.dev) (Rich Text Editing)
- **Validation**: Zod schemas for native auth, profile, reference management and ticket/report/directory/audit queries
- **Database**: Drizzle over the existing SQLite database; ticket mutations and the remaining workflows are migrating from Prisma
- **PWA**: Native SvelteKit service worker for asset caching, push notifications, and update prompts

## 🚀 Key Features

- **Responsive Dashboards**: Tailored experiences for End Users, Support Staff, and Administrators.
- **Real-time Notifications**: Instant updates via WebSockets for new messages and ticket changes.
- **PWA Support**: Installable application with cached assets and push notifications. Ticket operations require a network connection.
- **Ticket Management**: Intuitive interface for creating, viewing, and managing support tickets.
- **Rich Interaction**: Interactive maps, charts for CSAT metrics, and real-time messaging.
- **Routing**: SvelteKit routes, including parameterized ticket and message pages

## 🛠️ Getting Started

### Prerequisites

- [Bun 1.4.4](https://bun.sh) installed. The production adapter runs on Bun.

### Installation

1.  Navigate to the Frontend directory:
    ```bash
    cd Frontend
    ```
2.  Install dependencies:
    ```bash
    bun install
    ```
3.  Set up your environment:
    Create a `.env` file:
    ```bash
    VITE_API_URL="http://localhost:3000"
    DATABASE_URL="file:../Backend/database.db"
    JWT_SECRET="same-secret-as-backend"
    FRONTEND_URL="http://localhost:5173"
    ```

During the transition, migrate/start the backend first, using the same SQLite file
and JWT secret. Then run `bun run db:migrate` here to adopt its schema. This verifies
the schema and records the Drizzle baseline without recreating existing tables.

### Running the App

Start the development server:

```bash
bun run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

```bash
bun run build
bun run start
```

The Bun server and assets are in `build/`. Use `PORT` to choose the listening port.
Set `VITE_BASE_PATH=/ticketing/` when building for the Caddy subpath deployment.

Verify with `bun run check` and `bun test`. After building, run `bun run test:server`
for native remote-function checks. These launch their own Bun server and disposable
SQLite database; they never connect to an existing server or application data.

`bun run db:generate` generates future Drizzle migrations. Review generated SQL
before applying it; do not use schema push on existing installations.

## 📁 Project Structure

```text
src/
├── components/      # Reusable UI components
├── lib/             # API client, WebSocket logic, and utilities
├── routes/          # SvelteKit routes and existing page components
├── stores/          # Svelte 5 state management (using Runes)
├── assets/          # Static assets and icons
└── service-worker/  # Service worker and its separate TypeScript configuration
```

## 📱 Progressive Web App (PWA)

The frontend is configured as a PWA. When running in production, it will prompt users to install the application and provide a native-like experience on mobile and desktop.
