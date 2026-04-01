
# All-In-One (AIO) Central Auth Backend

This project serves as the **Centralized Authentication Service** for my ecosystem of applications. 

Instead of rewriting authentication logic for every new project (HR systems, Applicant trackers, internal tools), this backend acts as the single source of truth for **User Management, Identity Verification, and Session Handling**.

## 🎯 Purpose & Architecture

This is designed to be a "plug-and-play" auth server. Your other frontend applications or services simply consume the API provided by this project to log users in and verify who they are.

* **Central User Database:** All users across different modules are stored here.
* **Unified Session Management:** Handles JWT generation, secure HTTP-only cookies, and session validation.
* **Reusable Middleware:** Provides a consistent way to protect routes across different endpoints.

## ⚡ Tech Stack

* **Runtime:** [Bun](https://bun.sh) (for ultra-fast startup and native password hashing).
* **Framework:** [ElysiaJS](https://elysiajs.com) (Edge-compatible, ergonomic web framework).
* **Database:** SQLite (Embedded, zero-latency).
* **Security:** Argon2 hashing & Secure/HttpOnly Cookies.

## 🚀 Getting Started

### 1. Installation
Clone the repository and install dependencies:
```bash
bun install

```

### 2. Run the Service

Start the central backend server:

```bash
bun run dev

```

The service will be live at `http://localhost:3000`.

> **Note:** On the first run, it will automatically create the `database.db` and seed an admin user.
> * **User:** `admin`
> * **Pass:** `password`
> 
> 

## 🔗 Integration Guide

### Base URL: `http://localhost:3000/auth`

Any external application (e.g., your HR Dashboard) should direct authentication requests here.

| Action | Endpoint | Method | Payload | Description |
| --- | --- | --- | --- | --- |
| **Login** | `/auth/login` | `POST` | `{username, password}` | Validates creds & sets the `auth_cookie` on the client. |
| **Verify** | `/auth/me` | `POST` | *(Cookie)* | Call this on your app load to check if the user is logged in. |
| **Register** | `/auth/register` | `POST` | `{username, password, email}` | Creates a new user in the central DB. |
| **Logout** | `/auth/logout` | `POST` | *(Cookie)* | Clears the session. |

## 🛡️ Security Features

1. **Secure Cookies:** Tokens are never sent to the client body (preventing XSS attacks). They are stored in `HttpOnly` cookies.
2. **Native Hashing:** Uses `Bun.password` (Argon2) which is significantly faster and more secure than JavaScript-based implementations like bcrypt.js.
3. **Role-Based Payload:** The JWT includes the user `role`, allowing downstream apps to easily handle permissions (Admin vs User).

## 🛠️ Development

### Project Structure

```
src/
├── auth.ts              # Core Authentication Logic
├── dbconfig.ts          # Central Database & Schema Definitions
├── plugins/
│   └── authValidator.ts # JWT Validation Strategy
└── index.ts             # Entry Point

```

### Adding New Modules

While this is primarily an Auth Backend, it is extensible. You can mount new controllers in `index.ts` alongside the auth module if you need specific logic (like HR or Job Postings) to live in the same instance.
