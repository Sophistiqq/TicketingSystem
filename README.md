# Ticketing System

A robust, full-stack ticketing and collaboration platform designed for modern enterprises. This project features a high-performance backend powered by Bun and ElysiaJS, and a reactive, mobile-first frontend built with Svelte 5.

## 🏗️ Architecture

The project is split into two main components:

- **Frontend**: A Svelte 5 Single Page Application (SPA) with PWA support, optimized for speed and offline capabilities.
- **Backend**: An ElysiaJS (Bun) API service providing high-performance endpoints, real-time WebSocket communication, and Prisma ORM for database management.

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

