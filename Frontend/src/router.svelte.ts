// ============================================================
// Router — all route definitions + auth guard
// ============================================================
import { createRouter } from 'sv-router';
import auth from './auth.svelte';
import { setCurrentUser, getCurrentUser } from './stores/user.svelte';
import { startPolling } from './stores/notifications.svelte';
import { fetchReferenceData } from './stores/reference.svelte';

// ── Route components (lazy-ish — Vite will code-split) ──────
import Login from './routes/Login.svelte';
import Register from './routes/Register.svelte';
import Dashboard from './routes/Dashboard.svelte';
import CreateTicket from './routes/CreateTicket.svelte';
import TicketDetail from './routes/TicketDetail.svelte';
import MyTickets from './routes/MyTickets.svelte';
import MyApprovals from './routes/MyApprovals.svelte';
import Notifications from './routes/Notifications.svelte';
import Users from './routes/admin/Users.svelte';
import AuditLog from './routes/admin/AuditLog.svelte';
import CsatDashboard from './routes/admin/CsatDashboard.svelte';
import Settings from './routes/admin/Settings.svelte';

const PUBLIC_ROUTES = ['/login', '/register'];

export const { p, navigate, isActive, route } = createRouter({
  hooks: {
    async beforeLoad({ pathname }) {
      let user = getCurrentUser();

      // If no user in memory, try to restore session from cookie
      if (!user) {
        try {
          user = await auth.check();
          if (user) {
            setCurrentUser(user);
            startPolling();
            fetchReferenceData();
          }
        } catch {
          setCurrentUser(null);
        }
      }

      // Redirect unauthenticated users away from protected routes
      if (!user && !PUBLIC_ROUTES.includes(pathname)) {
        throw navigate('/login');
      }

      // Redirect authenticated users away from public routes
      if (user && PUBLIC_ROUTES.includes(pathname)) {
        throw navigate('/');
      }
    },
  },

  // ── Public ──────────────────────────────────────────────
  '/login': Login,
  '/register': Register,

  // ── Authenticated ───────────────────────────────────────
  '/': Dashboard,
  '/tickets/new': CreateTicket,
  '/tickets/:id': TicketDetail,
  '/my-tickets': MyTickets,
  '/approvals': MyApprovals,
  '/notifications': Notifications,

  // ── Admin / MIS ─────────────────────────────────────────
  '/admin/users': Users,
  '/admin/audit': AuditLog,
  '/admin/csat': CsatDashboard,
  '/admin/settings': Settings,

  // ── Fallback ────────────────────────────────────────────
  '*': Dashboard,
});
