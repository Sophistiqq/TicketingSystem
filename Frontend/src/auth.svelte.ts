// auth.svelte.ts
import { setCurrentUser } from "./stores/user.svelte";
import { navigate } from "./router.svelte";
const url = "http://10.0.23.245:3000/auth";

const auth = {
  check: async () => {
    const response = await fetch(`${url}/me`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  },

  login: async (username: string, password: string) => {
    const response = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });
    const data = await response.json();
    if (!response.ok) return data.message;

    setCurrentUser(data);
    navigate("/home").catch(() => { });
  },

  logout: async (): Promise<string | void> => {
    const response = await fetch(`${url}/logout`, {
      method: "POST",
      credentials: "include",
    });
    const data = await response.json();
    if (!response.ok) return data.message;

    setCurrentUser(null);
    navigate("/login").catch(() => { });
  },
};

export default auth;
