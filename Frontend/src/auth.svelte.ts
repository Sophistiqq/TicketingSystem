// ============================================================
// Auth helpers — login / logout / session check
// ============================================================
import { api } from './lib/api';
import { setCurrentUser } from './stores/user.svelte';
import { startPolling, stopPolling } from './stores/notifications.svelte';
import { startMessagePolling, stopMessagePolling } from './stores/messages.svelte';
import { fetchReferenceData } from './stores/reference.svelte';
import { navigate } from './router.svelte';
import { ws } from './lib/ws';
import type { LoginResponse, User } from './lib/types';

const auth = {
  /** Check current session via cookie (GET /auth/me) */
  check: async (): Promise<User | null> => {
    try {
      const user = await api.get<User>('/auth/me');
      return user;
    } catch {
      return null;
    }
  },

  /** Log in and bootstrap app state */
  login: async (username: string, password: string): Promise<string | void> => {
    try {
      const res = await api.post<LoginResponse>('/auth/login', { username, password });
      if (res?.user) {
        setCurrentUser(res.user);
        startPolling();
        fetchReferenceData();
        startMessagePolling();
        ws.connect();
        await navigate('/');
      }
    } catch (e: any) {
      return e?.message ?? 'Login failed';
    }
  },

  /** Log out and clean up */
  logout: async (): Promise<string | void> => {
    try {
      await api.post('/auth/logout');
    } catch {
      // even if the request fails, clear local state
    }
    setCurrentUser(null);
    stopPolling();
    stopMessagePolling();
    ws.disconnect();
    await navigate('/login');
  },

  /** Register a new account */
  register: async (data: {
    username: string;
    password: string;
    email: string;
    first_name: string;
    last_name: string;
    position?: string;
    department_id?: number;
  }): Promise<string | void> => {
    try {
      await api.post('/auth/register', data);
      await navigate('/login');
    } catch (e: any) {
      return e?.message ?? 'Registration failed';
    }
  },
};

export default auth;
