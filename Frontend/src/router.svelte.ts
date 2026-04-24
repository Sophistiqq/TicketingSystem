// ============================================================
// Router — all route definitions + auth guard
// ============================================================
import { createRouter } from 'sv-router';
import auth from './auth.svelte';
import { setCurrentUser, getCurrentUser } from './stores/user.svelte';
import { startPolling } from './stores/notifications.svelte';
import { fetchReferenceData } from './stores/reference.svelte';
import { startMessagePolling } from './stores/messages.svelte';
import { ws } from './lib/ws';

// ── Route components ────────────────────────────────────────

// Auth
import Login from './routes/auth/Login.svelte';
import Register from './routes/auth/Register.svelte';

// User (Common)
import Dashboard from './routes/user/Dashboard.svelte';
import CreateTicket from './routes/user/CreateTicket.svelte';
import TicketDetail from './routes/user/TicketDetail.svelte';
import MyTickets from './routes/user/MyTickets.svelte';
import Notifications from './routes/user/Notifications.svelte';
import Profile from './routes/user/Profile.svelte';
import Messages from './routes/user/Messages.svelte';

// Staff (Approver / Admin / MIS)
import MyApprovals from './routes/staff/MyApprovals.svelte';
import Users from './routes/staff/admin/Users.svelte';
import AuditLog from './routes/staff/admin/AuditLog.svelte';
import CsatDashboard from './routes/staff/admin/CsatDashboard.svelte';
import Settings from './routes/staff/admin/Settings.svelte';

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
            startMessagePolling();
            ws.connect();
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

  // ── Authenticated (User) ────────────────────────────────
  '/': Dashboard,
  '/tickets/new': CreateTicket,
  '/tickets/:id': TicketDetail,
  '/my-tickets': MyTickets,
  '/notifications': Notifications,
  '/profile': Profile,
  '/messages': Messages,
  '/messages/:userId': Messages,

  // ── Staff / Admin ───────────────────────────────────────
  '/approvals': MyApprovals,
  '/admin/users': Users,
  '/admin/audit': AuditLog,
  '/admin/csat': CsatDashboard,
  '/admin/settings': Settings,

  // ── Fallback ────────────────────────────────────────────
  '*': Dashboard,
});
