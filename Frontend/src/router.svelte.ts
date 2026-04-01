// router.ts
import { createRouter } from 'sv-router';
import Login from './routes/Login.svelte';
import Home from './routes/Home.svelte';
import auth from './auth.svelte';
import { setCurrentUser, getCurrentUser } from "./stores/user.svelte";

export const { p, navigate, isActive, route } = createRouter({
  hooks: {
    async beforeLoad({ pathname }) {
      let user = getCurrentUser();
      if (!user) {
        try {
          user = await auth.check();
          setCurrentUser(user);
        } catch (e) {
          setCurrentUser(null);
        }
      }

      if (!user && pathname !== "/login") throw navigate("/login");
      if (user && pathname === "/login") throw navigate("/home");
    },
  },
  '/home': Home,
  '/login': Login,
  '*': Home,
});
