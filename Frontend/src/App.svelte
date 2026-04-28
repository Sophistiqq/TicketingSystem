<script lang="ts">
  import { onMount } from "svelte";
  import { themeChange } from "theme-change";
  import { initPushNotifications } from "./lib/pwa";
  import { Router } from "sv-router";
  import "./router.svelte";
  import {
    getCurrentUser,
    hasRole,
    displayName,
    userInitials,
  } from "./stores/user.svelte";
  import { getUnreadCount } from "./stores/notifications.svelte";
  import { getMessageUnreadCount } from "./stores/messages.svelte";
  import { navigate, isActive, route } from "./router.svelte";
  import auth from "./auth.svelte";
  import ModalProvider from "./components/ModalProvider.svelte";
  import AlertProvider from "./components/AlertProvider.svelte";
  import ReloadPrompt from "./components/ReloadPrompt.svelte";
  import {
    LayoutDashboard,
    Ticket,
    Plus,
    ListTodo,
    ClipboardCheck,
    Bell,
    MessageSquare,
    Users,
    ScrollText,
    Star,
    Settings,
    LogOut,
    Menu,
    Sun,
    Moon,
    ChevronLeft,
    User as UserIcon,
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
  let msgUnread = $derived(getMessageUnreadCount());
  let isDark = $state(true);

  onMount(() => {
    themeChange(false);
    const theme = document.documentElement.getAttribute("data-theme");
    isDark = theme === "ticketing";

    const currentUser = getCurrentUser();
    if (currentUser) {
      initPushNotifications(currentUser).catch(console.error);
    }
  });

  const navItems: NavItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: Plus, label: "New Ticket", href: "/tickets/new" },
    { icon: ListTodo, label: "My Tickets", href: "/my-tickets" },
    {
      icon: MessageSquare,
      label: "Messages",
      href: "/messages",
      badge: () => msgUnread,
    },
    {
      icon: ClipboardCheck,
      label: "My Approvals",
      href: "/approvals",
      roles: ["approver", "admin"],
    },
    {
      icon: Bell,
      label: "Notifications",
      href: "/notifications",
      badge: () => unread,
    },
  ];

  const adminItems: NavItem[] = [
    { icon: Users, label: "Users", href: "/admin/users", roles: ["admin"] },
    {
      icon: ScrollText,
      label: "Audit Log",
      href: "/admin/audit",
      roles: ["admin", "mis"],
    },
    { icon: Star, label: "CSAT", href: "/admin/csat", roles: ["admin", "mis"] },
    {
      icon: Settings,
      label: "Management",
      href: "/admin/management",
      roles: ["admin"],
    },
  ];

  function canSee(item: NavItem): boolean {
    if (!item.roles) return true;
    return item.roles.some((r) => hasRole(r as any));
  }

  function toggleTheme() {
    isDark = !isDark;
    const newTheme = isDark ? "ticketing" : "ticketing-light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  }

  function closeDrawer() {
    const drawer = document.getElementById("app-drawer") as HTMLInputElement;
    if (drawer) drawer.checked = false;
  }
</script>

{#if !user}
  <div class="min-h-screen bg-base-200 flex items-center justify-center">
    <Router />
  </div>
{:else}
  <div class="drawer lg:drawer-open h-screen overflow-hidden">
    <input id="app-drawer" type="checkbox" class="drawer-toggle" />
    <div class="drawer-content flex flex-col h-full overflow-hidden">
      <!-- Navbar -->
      <nav
        class="navbar bg-base-100 border-b border-base-300 sticky top-0 z-30 px-4 gap-2"
      >
        <label
          for="app-drawer"
          class="btn btn-ghost btn-sm btn-square lg:hidden"
          ><Menu size={20} /></label
        >
        <div class="flex-1 flex items-center gap-2">
          {#if !isActive("/")}
            <button
              class="btn btn-ghost btn-sm btn-square"
              onclick={() => navigate(-1)}><ChevronLeft size={20} /></button
            >
          {/if}
        </div>

        <button class="btn btn-ghost btn-sm btn-square" onclick={toggleTheme}>
          {#if isDark}<Sun size={18} />{:else}<Moon size={18} />{/if}
        </button>

        <a
          href="/messages"
          class="btn btn-ghost btn-sm btn-square indicator"
          title="Messages"
        >
          <MessageSquare size={18} />
          {#if msgUnread > 0}
            <span class="indicator-item badge badge-primary badge-xs"
              >{msgUnread}</span
            >
          {/if}
        </a>

        <a
          href="/notifications"
          class="btn btn-ghost btn-sm btn-square indicator"
          title="Notifications"
        >
          <Bell size={18} />
          {#if unread > 0}
            <span class="indicator-item badge badge-primary badge-xs"
              >{unread}</span
            >
          {/if}
        </a>

        <details class="dropdown dropdown-end">
          <summary class="btn btn-ghost btn-sm gap-2">
            <div class="avatar avatar-placeholder">
              <div class="bg-neutral text-neutral-content w-8 rounded-full">
                <span class="text-xs">{userInitials()}</span>
              </div>
            </div>
            <span class="hidden sm:inline text-sm whitespace-nowrap"
              >{displayName()}</span
            >
          </summary>
          <ul
            class="dropdown-content menu bg-base-200 rounded-box z-50 w-52 p-2 shadow-lg mt-2"
          >
            <li class="menu-title text-xs opacity-60">
              {user.roles?.map((r) => String(r).toUpperCase()).join(", ") ||
                "USER"}
            </li>
            <li><a href="/profile"><UserIcon size={16} /> Profile</a></li>
            <li>
              <button onclick={() => auth.logout()}
                ><LogOut size={16} /> Logout</button
              >
            </li>
          </ul>
        </details>
      </nav>

      <!-- Main Layout -->
      <div class="flex flex-1 min-h-0 overflow-hidden">
        <main
          class="flex-1 flex flex-col min-h-0 p-4 md:p-6 {route.pathname?.startsWith(
            '/messages',
          ) || route.pathname === '/tickets/new'
            ? 'overflow-hidden'
            : 'overflow-y-auto'}"
        >
          <Router />
        </main>
      </div>
    </div>

    <!-- Navigation Drawer -->
    <div class="drawer-side z-40">
      <label for="app-drawer" class="drawer-overlay"></label>
      <aside
        class="bg-base-200 w-72 min-h-full flex flex-col border-r border-base-300"
      >
        <div class="p-6">
          <h2 class="text-xl font-black">TICKETING</h2>
        </div>
        <ul class="menu menu-md flex-1 p-0 py-4 w-full">
          {#each navItems as item}
            {#if canSee(item)}
              <li>
                <a
                  href={item.href}
                  onclick={closeDrawer}
                  class="flex items-center justify-between px-6 py-4 rounded-none {isActive(
                    item.href as any,
                  )
                    ? 'bg-primary/10 text-primary font-bold'
                    : ''}"
                >
                  <div class="flex items-center gap-3">
                    <item.icon size={20} />
                    {item.label}
                  </div>
                  {#if item.badge && item.badge() > 0}
                    <span class="badge badge-primary badge-sm font-bold"
                      >{item.badge()}</span
                    >
                  {/if}
                </a>
              </li>
            {/if}
          {/each}

          {#if adminItems.some(canSee)}
            <div class="divider px-6 opacity-20"></div>
            <li
              class="menu-title px-6 text-[10px] uppercase tracking-widest opacity-40 font-bold mb-2"
            >
              Administration
            </li>
            {#each adminItems as item}
              {#if canSee(item)}
                <li>
                  <a
                    href={item.href}
                    onclick={closeDrawer}
                    class="flex items-center gap-3 px-6 py-4 rounded-none {isActive(
                      item.href as any,
                    )
                      ? 'bg-primary/10 text-primary font-bold'
                      : ''}"
                  >
                    <item.icon size={20} />
                    {item.label}
                  </a>
                </li>
              {/if}
            {/each}
          {/if}
        </ul>
      </aside>
    </div>
  </div>
{/if}

<ModalProvider />
<AlertProvider />
<ReloadPrompt />
