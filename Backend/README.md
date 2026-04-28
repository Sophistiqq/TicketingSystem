# Monolith Backend

High-performance API service for the Monolith Ticketing System, built with **Bun**, **ElysiaJS**, and **Prisma**.

## ⚡ Tech Stack

- **Runtime**: [Bun](https://bun.sh) (Ultra-fast JavaScript/TypeScript runtime)
- **Framework**: [ElysiaJS](https://elysiajs.com) (Ergonomic, Type-safe web framework)
- **ORM**: [Prisma](https://prisma.io)
- **Database**: PostgreSQL
- **Real-time**: WebSockets (Elysia native support)
- **Validation**: Type-safe input/output validation via Elysia/Tiptap

## 🚀 Core Features

- **Centralized Auth**: Secure JWT-based authentication with HttpOnly cookies.
- **Ticket Lifecycle**: Full management of tickets (Creation, Assignment, Status updates, Priority).
- **Real-time Updates**: Real-time notifications and messaging using WebSockets.
- **CSAT & SLA Tracking**: Built-in Customer Satisfaction surveys and Service Level Agreement monitoring.
- **Audit Logging**: Comprehensive tracking of all critical system actions.
- **File Management**: Secure file uploads and static file serving for ticket attachments.
- **API Documentation**: Automatic Swagger/OpenAPI documentation generation.

## 🛠️ Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed.
- PostgreSQL database (Local or Cloud).

### Installation

1.  Navigate to the Backend directory:
    ```bash
    cd Backend
    ```
2.  Install dependencies:
    ```bash
    bun install
    ```
3.  Set up your environment:
    Create a `.env` file based on the required variables:
    ```bash
    DATABASE_URL="postgresql://user:password@localhost:5432/monolith"
    JWT_SECRET="your-secret-key"
    FRONTEND_URL="http://localhost:5173"
    ```

### Database Setup

Run migrations and seed the database with initial data:

```bash
bun run migrate
bun run db:seed
```

### Running the Server

Start in development mode with hot-reloading:

```bash
bun run dev
```

The API will be available at `http://localhost:3000`.
Swagger documentation can be found at `http://localhost:3000/swagger`.

## 📁 Project Structure

```text
src/
├── routes/          # API Route definitions (tickets, users, etc.)
├── plugins/         # Elysia plugins (Auth validation, File uploads)
├── ws/              # WebSocket handlers and broadcasting logic
├── auth.ts          # Authentication strategy
└── index.ts         # Server entry point
```

## 🧪 Testing

Run backend-specific tests (if available) or use the root test scripts.

```bash
# Example
bun test
```
