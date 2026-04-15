<script lang="ts">
  import { Router } from "sv-router";
  import "./router.svelte";
  import { getCurrentUser, hasRole, displayName, userInitials } from "./stores/user.svelte";
  import { getUnreadCount } from "./stores/notifications.svelte";
  import { isActive } from "./router.svelte";
  import auth from "./auth.svelte";
  import {
    LayoutDashboard,
    Ticket,
    Plus,
    ListTodo,
    ClipboardCheck,
    Bell,
    Users,
    ScrollText,
    Star,
    Settings,
    LogOut,
    Menu,
    Sun,
    Moon,
  } from "lucide-svelte";

  type NavItem = {
    icon: typeof LayoutDashboard;
    label: string;
    href: string;
    roles?: string[];
    badge?: () => number;
  };

  let user = $derived(getCurrentUser());
  let unread = $derived(getUnreadCount());
  let isDark = $state(true);

  const navItems: NavItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: Plus, label: "New Ticket", href: "/tickets/new" },
    { icon: ListTodo, label: "My Tickets", href: "/my-tickets" },
    { icon: ClipboardCheck, label: "My Approvals", href: "/approvals", roles: ["approver", "admin"] },
    { icon: Bell, label: "Notifications", href: "/notifications", badge: () => unread },
  ];

  const adminItems: NavItem[] = [
    { icon: Users, label: "Users", href: "/admin/users", roles: ["admin"] },
    { icon: ScrollText, label: "Audit Log", href: "/admin/audit", roles: ["admin", "mis"] },
    { icon: Star, label: "CSAT", href: "/admin/csat", roles: ["admin", "mis"] },
    { icon: Settings, label: "Settings", href: "/admin/settings", roles: ["admin"] },
  ];

  function canSee(item: NavItem): boolean {
    if (!item.roles) return true;
    return item.roles.some((r) => hasRole(r as any));
  }

  function toggleTheme() {
    isDark = !isDark;
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "ticketing" : "ticketing-light"
    );
  }
</script>

{#if !user}
  <!-- Public layout (Login / Register) — no chrome -->
  <div class="min-h-screen bg-base-200 flex items-center justify-center">
    <Router />
  </div>
{:else}
  <!-- Authenticated layout — DaisyUI drawer -->
  <div class="drawer lg:drawer-open">
    <input id="app-drawer" type="checkbox" class="drawer-toggle" />

    <!-- ─── Main content area ─────────────────────────────── -->
    <div class="drawer-content flex flex-col min-h-screen">
      <!-- Navbar -->
      <nav class="navbar bg-base-100 border-b border-base-300 sticky top-0 z-30 px-4 gap-2">
        <label for="app-drawer" class="btn btn-ghost btn-sm btn-square lg:hidden">
          <Menu size={20} />
        </label>

        <div class="flex-1">
          <h1 class="text-xl font-bold tracking-wide">
            <a href="/" class="hover:text-primary transition-colors">Ticketing</a>
          </h1>
        </div>

        <!-- Theme toggle -->
        <button class="btn btn-ghost btn-sm btn-square" onclick={toggleTheme}>
          {#if isDark}
            <Sun size={18} />
          {:else}
            <Moon size={18} />
          {/if}
        </button>

        <!-- Notification bell -->
        <a href="/notifications" class="btn btn-ghost btn-sm btn-square indicator">
          <Bell size={18} />
          {#if unread > 0}
            <span class="indicator-item badge badge-primary badge-xs">{unread}</span>
          {/if}
        </a>

        <!-- User dropdown -->
        <details class="dropdown dropdown-end">
          <summary class="btn btn-ghost btn-sm gap-2">
            <div class="avatar avatar-placeholder">
              <div class="bg-neutral text-neutral-content w-8 rounded-full">
                <span class="text-xs">{userInitials()}</span>
              </div>
            </div>
            <span class="hidden sm:inline text-sm">{displayName()}</span>
          </summary>
          <ul class="dropdown-content menu bg-base-200 rounded-box z-50 w-52 p-2 shadow-lg mt-2">
            <li class="menu-title text-xs opacity-60">
              {user.roles?.map((r) => String(r).toUpperCase()).join(", ") || "USER"}
            </li>
            <li>
              <button onclick={() => auth.logout()}>
                <LogOut size={16} /> Logout
              </button>
            </li>
          </ul>
        </details>
      </nav>

      <!-- Page content -->
      <main class="flex-1 p-4 md:p-6 overflow-y-auto">
        <Router />
      </main>
    </div>

    <!-- ─── Sidebar ───────────────────────────────────────── -->
    <div class="drawer-side z-40">
      <label for="app-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
      <aside class="bg-base-200 min-h-full w-72 flex flex-col">
        <!-- Logo area -->
        <div class="p-4 border-b border-base-300">
          <a href="/" class="flex items-center gap-3">
            <div class="bg-primary text-primary-content w-10 h-10 rounded-lg flex items-center justify-center">
              <Ticket size={22} />
            </div>
            <div>
              <h2 class="text-lg font-bold leading-tight">Ticketing</h2>
              <p class="text-xs opacity-50">Internal Support</p>
            </div>
          </a>
        </div>

        <!-- Navigation -->
        <ul class="menu menu-md flex-1 px-3 py-4 gap-0.5">
          {#each navItems as item}
            {#if canSee(item)}
              <li>
                <a
                  href={item.href}
                  class:active={isActive(item.href as any)}
                >
                  <item.icon size={18} />
                  {item.label}
                  {#if item.badge && item.badge() > 0}
                    <span class="badge badge-primary badge-sm ml-auto">{item.badge()}</span>
                  {/if}
                </a>
              </li>
            {/if}
          {/each}

          <!-- Admin section divider -->
          {#if adminItems.some(canSee)}
            <li class="menu-title mt-4 text-xs opacity-50">Administration</li>
            {#each adminItems as item}
              {#if canSee(item)}
                <li>
                  <a
                    href={item.href}
                    class:active={isActive(item.href as any)}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </a>
                </li>
              {/if}
            {/each}
          {/if}
        </ul>

        <!-- User footer -->
        <div class="p-4 border-t border-base-300">
          <div class="flex items-center gap-3">
            <div class="avatar avatar-placeholder">
              <div class="bg-neutral text-neutral-content w-10 rounded-full">
                <span class="text-sm">{userInitials()}</span>
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{displayName()}</p>
              <p class="text-xs opacity-50 truncate">{user.email}</p>
            </div>
            <button
              class="btn btn-ghost btn-sm btn-square"
              onclick={() => auth.logout()}
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
{/if}
