<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import type {
    Ticket,
    PaginatedResponse,
    TicketApprover,
    User,
  } from "../../lib/types";
  import { getCurrentUser, hasRole } from "../../stores/user.svelte";
  import TicketTable from "../../components/TicketTable.svelte";
  import StatsCard from "../../components/StatsCard.svelte";
  import {
    Inbox,
    Clock,
    TriangleAlert,
    CircleCheckBig,
    Plus,
    ClipboardCheck,
    UserCheck,
    Briefcase,
  } from "lucide-svelte";
  import SearchableSelect from "../../components/SearchableSelect.svelte";
  import { getDepartments } from "../../stores/reference.svelte";

  let user = $derived(getCurrentUser());
  let tickets = $state<Ticket[]>([]);
  let pendingApprovals = $state<TicketApprover[]>([]);
  let activeUsers = $state<User[]>([]);
  let departments = $derived(getDepartments());
  let loading = $state(true);

  // Filters
  let departmentId = $state<number | undefined>(undefined);

  // Stats
  let totalOpen = $state(0);
  let totalInProgress = $state(0);
  let totalOverdue = $state(0);
  let totalResolved = $state(0);
  let totalPendingApprovals = $state(0);
  let totalAssignedToMe = $state(0);
  let totalDepartmentUnassigned = $state(0);

  let totalTickets = $derived(
    totalOpen + totalInProgress + totalOverdue + totalResolved,
  );

  async function loadDashboardData() {
    loading = true;
    try {
      const deptParam = departmentId ? `&department_id=${departmentId}` : "";

      // Fetch recent tickets
      const res = await api.get<PaginatedResponse<Ticket>>(
        `/tickets/?page=1&limit=10&sort=created_at&order=desc${deptParam}`,
      );
      if (res) {
        tickets = res.data;
      }

      // Get accurate counts from filtered queries
      const queries = [
        api.get<PaginatedResponse<Ticket>>(
          `/tickets/?status=open&limit=1${deptParam}`,
        ),
        api.get<PaginatedResponse<Ticket>>(
          `/tickets/?status=in_progress&limit=1${deptParam}`,
        ),
        api.get<PaginatedResponse<Ticket>>(
          `/tickets/?overdue=true&limit=1${deptParam}`,
        ),
        api.get<PaginatedResponse<Ticket>>(
          `/tickets/?status=resolved&limit=1${deptParam}`,
        ),
      ];

      // If staff, also check assigned to me
      if (hasRole("admin", "mis")) {
        queries.push(
          api.get<PaginatedResponse<Ticket>>(
            `/tickets/?assignee_id=${user?.id}&limit=1`,
          ),
        );

        // Also check unassigned in my department
        if (user?.department_id) {
          const url = new URL(`${API_BASE}/tickets/`);
          url.searchParams.append("department_id", user.department_id.toString());
          url.searchParams.append("status", "open");
          url.searchParams.append("limit", "1");
          // Omitted assignee_id entirely to represent "unassigned" as the backend logic expects
          queries.push(
            api.get<PaginatedResponse<Ticket>>(url.pathname + "?" + url.searchParams.toString()),
          );
        }
      }

      const results = await Promise.all(queries);
      if (results[0]) totalOpen = results[0].pagination.total;
      if (results[1]) totalInProgress = results[1].pagination.total;
      if (results[2]) totalOverdue = results[2].pagination.total;
      if (results[3]) totalResolved = results[3].pagination.total;
      if (results[4]) totalAssignedToMe = results[4].pagination.total;
      if (results[5]) totalDepartmentUnassigned = results[5].pagination.total;
    } catch {
      // handled
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await loadDashboardData();

    // Fetch active users for messaging
    api.get<User[]>("/messages/active").then((res) => {
      if (res) activeUsers = res;
    });

    // If approver, get pending approvals
    if (hasRole("approver", "admin")) {
      const appRes = await api.get<TicketApprover[]>("/approvals/my/pending");
      if (appRes) {
        pendingApprovals = appRes;
        totalPendingApprovals = appRes.length;
      }
    }
  });

  $effect(() => {
    if (departmentId !== undefined) {
      loadDashboardData();
    }
  });
</script>

<div class="flex flex-col gap-6">
  <!-- Header -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold">Dashboard</h1>
      <p class="text-sm opacity-60 mt-1">
        Welcome back, {user?.first_name ?? user?.username ?? "User"}
      </p>
    </div>
    <div class="flex gap-2">
      <a href="/tickets/new" class="btn btn-primary gap-2">
        <Plus size={18} />
        New Ticket
      </a>
    </div>
  </div>

  <!-- Stats Grid -->
  <div
    class="stats stats-vertical lg:stats-horizontal shadow-sm bg-base-200 w-full overflow-hidden border border-base-300"
  >
    {#if hasRole("approver", "admin") && totalPendingApprovals > 0}
      <StatsCard
        icon={ClipboardCheck}
        label="To Approve"
        value={totalPendingApprovals}
        color="primary"
        sub="Pending your decision"
      />
    {/if}
    {#if hasRole("admin", "mis")}
      <StatsCard
        icon={UserCheck}
        label="My Workload"
        value={totalAssignedToMe}
        color="secondary"
        sub="Assigned to you"
      />
    {/if}
    {#if hasRole("admin", "mis") && user?.department_id}
      <StatsCard
        icon={Briefcase}
        label="Dept Unassigned"
        value={totalDepartmentUnassigned}
        color="accent"
        sub="Open in your dept"
      />
    {/if}
    <StatsCard
      icon={Inbox}
      label="Total Open"
      value={totalOpen}
      color="info"
      pct={totalTickets > 0 ? Math.round((totalOpen / totalTickets) * 100) : 0}
      sub="New requests"
    />
    <StatsCard
      icon={Clock}
      label="In Progress"
      value={totalInProgress}
      color="warning"
      pct={totalTickets > 0
        ? Math.round((totalInProgress / totalTickets) * 100)
        : 0}
      sub="Active work"
    />
    <StatsCard
      icon={TriangleAlert}
      label="Overdue"
      value={totalOverdue}
      color="error"
      pct={totalTickets > 0
        ? Math.round((totalOverdue / totalTickets) * 100)
        : 0}
      sub="SLA breached"
    />
    <StatsCard
      icon={CircleCheckBig}
      label="Resolved"
      value={totalResolved}
      color="success"
      pct={totalTickets > 0
        ? Math.round((totalResolved / totalTickets) * 100)
        : 0}
      sub="Finalized today"
    />
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <!-- Recent Tickets (2/3) -->
    <div class="xl:col-span-2 flex flex-col gap-4">
      <div class="card bg-base-200 shadow-sm overflow-hidden">
        <div
          class="flex flex-wrap items-center justify-between px-5 pt-4 pb-2 gap-4"
        >
          <h2 class="card-title text-lg font-bold shrink-0">Recent Tickets</h2>
          <div class="flex items-center gap-2 flex-1 justify-end min-w-0">
            <div class="w-48">
              <SearchableSelect
                items={departments}
                bind:value={departmentId}
                placeholder="All Departments"
              />
            </div>
            <a href="/my-tickets" class="btn btn-ghost btn-sm shrink-0"
              >View All</a
            >
          </div>
        </div>
        {#if loading}
          <div class="flex justify-center py-12">
            <span class="loading loading-spinner loading-lg text-primary"
            ></span>
          </div>
        {:else}
          <div class="p-0">
            <TicketTable {tickets} showRequester={hasRole("admin", "mis")} />
          </div>
        {/if}
      </div>
    </div>

    <!-- Right Column (1/3) -->
    <div class="flex flex-col gap-6">
      <!-- Pending Approvals Quick List -->
      {#if hasRole("approver", "admin") && pendingApprovals.length > 0}
        <div class="card bg-primary/10 border border-primary/20 shadow-sm">
          <div class="card-body p-4">
            <h2
              class="card-title text-sm font-bold flex items-center gap-2 mb-2"
            >
              <ClipboardCheck size={18} class="text-primary" />
              Pending Approvals
            </h2>
            <div class="flex flex-col gap-2">
              {#each pendingApprovals.slice(0, 5) as app}
                <a
                  href="/tickets/{app.ticket_id}"
                  class="bg-base-100 p-2 rounded-lg text-xs hover:bg-base-300 transition-colors flex justify-between items-center"
                >
                  <span class="truncate flex-1 font-medium"
                    >{(app as any).ticket?.title ??
                      `Ticket #${app.ticket_id}`}</span
                  >
                  <span class="opacity-50 ml-2">#{app.ticket_id}</span>
                </a>
              {/each}
              {#if pendingApprovals.length > 5}
                <a
                  href="/approvals"
                  class="text-xs text-primary font-bold mt-1 hover:underline text-center"
                >
                  View all {pendingApprovals.length} approvals
                </a>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Active Staff / Quick Message -->
      <div
        class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden"
      >
        <div
          class="p-4 border-b border-base-300 bg-base-200/50 flex items-center justify-between"
        >
          <h2 class="text-xs font-black uppercase tracking-widest opacity-50">
            Active Staff
          </h2>
          <div class="flex items-center gap-1">
            <div class="w-2 h-2 rounded-full bg-success animate-pulse"></div>
            <span class="text-[10px] font-bold opacity-40 uppercase"
              >{activeUsers.length} Online</span
            >
          </div>
        </div>
        <div class="card-body p-0 max-h-64 overflow-y-auto">
          {#each activeUsers.slice(0, 6) as staff (staff.id)}
            <a
              href="/messages?userId={staff.id}"
              class="w-full px-4 py-3 flex items-center gap-3 hover:bg-base-200 transition-colors border-b border-base-200 last:border-0 group"
            >
              <div class="avatar online">
                <div
                  class="w-8 h-8 rounded-full bg-neutral text-neutral-content flex items-center justify-center text-xs font-bold"
                >
                  {staff.first_name[0]}{staff.last_name[0]}
                </div>
              </div>
              <div class="flex-1 min-w-0 text-left">
                <p
                  class="text-xs font-bold truncate group-hover:text-primary transition-colors"
                >
                  {staff.first_name}
                  {staff.last_name}
                </p>
                <p class="text-[10px] opacity-40 truncate">
                  {staff.position ?? "Technical Support"}
                </p>
              </div>
            </a>
          {:else}
            <div class="p-10 text-center opacity-30 italic text-xs">
              No staff active at the moment
            </div>
          {/each}
        </div>
        <div class="p-3 bg-base-200/30">
          <a
            href="/messages"
            class="btn btn-ghost btn-xs btn-block gap-2 text-[10px] font-black uppercase tracking-widest"
          >
            Open Full Chat
          </a>
        </div>
      </div>
    </div>
  </div>
</div>
