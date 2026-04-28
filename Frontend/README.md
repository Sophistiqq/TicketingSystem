# Monolith Frontend

Modern, reactive, and mobile-first ticketing interface built with **Svelte 5** and **Vite**.

## ⚡ Tech Stack

- **Framework**: [Svelte 5](https://svelte.dev) (Runes-based reactivity)
- **Build Tool**: [Vite](https://vitejs.dev)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) & [DaisyUI](https://daisyui.com)
- **Icons**: [Lucide Svelte](https://lucide.dev)
- **Editor**: [Tiptap](https://tiptap.dev) (Rich Text Editing)
- **PWA**: `vite-plugin-pwa` for offline support and service workers.

## 🚀 Key Features

- **Responsive Dashboards**: Tailored experiences for End Users, Support Staff, and Administrators.
- **Real-time Notifications**: Instant updates via WebSockets for new messages and ticket changes.
- **PWA Support**: Installable application with offline capabilities and background sync.
- **Ticket Management**: Intuitive interface for creating, viewing, and managing support tickets.
- **Rich Interaction**: Interactive maps, charts for CSAT metrics, and real-time messaging.
- **Custom Routing**: Lean, custom-built routing solution for optimal performance.

## 🛠️ Getting Started

### Prerequisites

- [Bun](https://bun.sh) or [Node.js](https://nodejs.org) installed.

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
    ```

### Running the App

Start the development server:

```bash
bun run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

```bash
bun run build
```

The optimized assets will be in the `dist/` directory.

## 📁 Project Structure

```text
src/
├── components/      # Reusable UI components
├── lib/             # API client, WebSocket logic, and utilities
├── routes/          # Application pages (User, Staff, Admin)
├── stores/          # Svelte 5 state management (using Runes)
├── assets/          # Static assets and icons
└── sw.ts            # Service Worker definition
```

## 📱 Progressive Web App (PWA)

The frontend is configured as a PWA. When running in production, it will prompt users to install the application and provide a native-like experience on mobile and desktop.
