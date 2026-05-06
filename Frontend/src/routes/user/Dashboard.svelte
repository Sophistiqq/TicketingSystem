<script lang="ts">
  import { onMount } from "svelte";
  import { api, API_BASE } from "../../lib/api";
  import type {
    Ticket,
    PaginatedResponse,
    TicketApprover,
    User,
    DashboardSummary,
  } from "../../lib/types";
  import { getCurrentUser, hasRole } from "../../stores/user.svelte";
  import TicketTable from "../../components/TicketTable.svelte";
  import StatsCard from "../../components/StatsCard.svelte";
  import Chart from "../../components/Chart.svelte";
  import {
    Inbox,
    Clock,
    TriangleAlert,
    CircleCheckBig,
    Plus,
    ClipboardCheck,
    UserCheck,
    Briefcase,
    LayoutDashboard,
    Star,
  } from "lucide-svelte";
  import SearchableSelect from "../../components/SearchableSelect.svelte";
  import { getDepartments } from "../../stores/reference.svelte";

  let user = $derived(getCurrentUser());
  let tickets = $state<Ticket[]>([]);
  let pendingApprovals = $state<TicketApprover[]>([]);
  let unratedTickets = $state<Ticket[]>([]);
  let activeUsers = $state<User[]>([]);
  let analytics = $state<DashboardSummary["analytics"] | null>(null);
  let departments = $derived(getDepartments());
  let loading = $state(true);
  let dashboardSort = $state("created_at");
  let dashboardOrder = $state<"asc" | "desc">("desc");

  // Filters
  let departmentId = $state<number | undefined>(undefined);

  // Stats
  let totalOpen = $state(0);
  let totalInProgress = $state(0);
  let totalOverdue = $state(0);
  let totalResolved = $state(0);
  let totalClosed = $state(0);
  let totalAll = $state(0);
  let totalPendingApprovals = $state(0);
  let totalUnrated = $state(0);
  let totalAssignedToMe = $state(0);
  let totalDepartmentUnassigned = $state(0);

  async function loadDashboardData() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    loading = true;
    try {
      const deptParam = departmentId ? `&department_id=${departmentId}` : "";
      
      const res = await api.get<DashboardSummary>(
        `/dashboard/summary?sort=${dashboardSort}&order=${dashboardOrder}${deptParam}`,
      );

      if (res) {
        tickets = res.tickets;
        unratedTickets = res.unratedTickets;
        activeUsers = res.activeUsers;
        pendingApprovals = res.pendingApprovals;
        
        totalOpen = res.stats.totalOpen;
        totalInProgress = res.stats.totalInProgress;
        totalOverdue = res.stats.totalOverdue;
        totalResolved = res.stats.totalResolved;
        totalClosed = res.stats.totalClosed;
        totalAll = res.stats.totalAll;
        totalAssignedToMe = res.stats.totalAssignedToMe;
        totalDepartmentUnassigned = res.stats.totalDepartmentUnassigned;
        totalUnrated = res.stats.totalUnrated;
        totalPendingApprovals = res.stats.totalPendingApprovals;
        analytics = res.analytics;
      }
    } catch {
      // handled
    } finally {
      loading = false;
    }
  }

  function handleDashboardSort(field: string) {
    if (dashboardSort === field) {
      dashboardOrder = dashboardOrder === "asc" ? "desc" : "asc";
    } else {
      dashboardSort = field;
      dashboardOrder = "asc";
    }
    loadDashboardData();
  }

  onMount(async () => {
    await loadDashboardData();
  });

  $effect(() => {
    if (departmentId !== undefined) {
      loadDashboardData();
    }
  });
</script>

<div class="flex flex-col gap-8 pb-8">
  <!-- Header -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight">Dashboard</h1>
      <p class="text-sm opacity-60 mt-1 font-medium">
        Welcome back, <span class="text-primary font-bold">{user?.first_name ?? user?.username ?? "User"}</span>. Here's what's happening today.
      </p>
    </div>
    <div class="flex gap-2">
      <a href="/tickets/new" class="btn btn-primary btn-md shadow-lg shadow-primary/20 gap-2">
        <Plus size={20} />
        New Ticket
      </a>
    </div>
  </div>

  <!-- 1. IMMEDIATE ACTION BAR (Top) -->
  {#if totalOverdue > 0 || totalPendingApprovals > 0 || totalUnrated > 0}
    <div class="flex flex-col gap-3">
      <h2 class="text-xs font-black uppercase tracking-[0.2em] opacity-40 px-1">Needs Immediate Attention</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#if totalOverdue > 0}
          <a href="/my-tickets?tab={hasRole('admin', 'mis') ? 'all' : 'requested'}&overdue=true" 
             class="flex items-center gap-4 p-4 bg-error/10 border border-error/20 rounded-2xl hover:bg-error/15 transition-all group">
            <div class="p-3 bg-error text-error-content rounded-xl shadow-lg shadow-error/30 group-hover:scale-110 transition-transform">
              <TriangleAlert size={24} />
            </div>
            <div>
              <div class="text-2xl font-black text-error">{totalOverdue}</div>
              <div class="text-[10px] font-black uppercase tracking-widest opacity-60">Overdue Tickets</div>
            </div>
          </a>
        {/if}

        {#if hasRole("approver", "admin") && totalPendingApprovals > 0}
          <a href="/approvals" 
             class="flex items-center gap-4 p-4 bg-primary/10 border border-primary/20 rounded-2xl hover:bg-primary/15 transition-all group">
            <div class="p-3 bg-primary text-primary-content rounded-xl shadow-lg shadow-primary/30 group-hover:scale-110 transition-transform">
              <ClipboardCheck size={24} />
            </div>
            <div>
              <div class="text-2xl font-black text-primary">{totalPendingApprovals}</div>
              <div class="text-[10px] font-black uppercase tracking-widest opacity-60">To Approve</div>
            </div>
          </a>
        {/if}

        {#if totalUnrated > 0}
          <div class="flex items-center gap-4 p-4 bg-warning/10 border border-warning/20 rounded-2xl hover:bg-warning/15 transition-all group">
            <div class="p-3 bg-warning text-warning-content rounded-xl shadow-lg shadow-warning/30 group-hover:scale-110 transition-transform">
              <Star size={24} />
            </div>
            <div>
              <div class="text-2xl font-black text-warning">{totalUnrated}</div>
              <div class="text-[10px] font-black uppercase tracking-widest opacity-60">Unrated Resolutions</div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- 2. MAIN ANALYTICS SECTION -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Ticket Trends (Line Chart) -->
    <div class="lg:col-span-2 card bg-base-200 border border-base-300 shadow-sm overflow-hidden">
      <div class="p-5 border-b border-base-300 flex items-center justify-between bg-base-300/30">
        <h2 class="text-sm font-black uppercase tracking-widest opacity-60">Ticket Volume Trends</h2>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-1.5">
            <div class="size-2 rounded-full bg-primary"></div>
            <span class="text-[10px] font-bold opacity-50 uppercase">New</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="size-2 rounded-full bg-success"></div>
            <span class="text-[10px] font-bold opacity-50 uppercase">Resolved</span>
          </div>
        </div>
      </div>
      <div class="p-6 h-80">
        {#if analytics}
          <Chart 
            type="line"
            data={{
              labels: analytics.trends.map(t => new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
              datasets: [
                {
                  label: 'New Tickets',
                  data: analytics.trends.map(t => t.new),
                  borderColor: '#4f46e5', // Indigo-600
                  backgroundColor: 'rgba(79, 70, 229, 0.1)',
                  fill: true,
                  tension: 0.4
                },
                {
                  label: 'Resolved',
                  data: analytics.trends.map(t => t.resolved),
                  borderColor: '#22c55e', // Green-500
                  backgroundColor: 'transparent',
                  tension: 0.4
                }
              ]
            }}
            options={{
              scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
              },
              plugins: { legend: { display: false } }
            }}
          />
        {:else}
          <div class="h-full w-full bg-base-300/20 animate-pulse rounded-xl"></div>
        {/if}
      </div>
    </div>

    <!-- Distribution by Type (Doughnut) -->
    <div class="card bg-base-200 border border-base-300 shadow-sm overflow-hidden">
      <div class="p-5 border-b border-base-300 bg-base-300/30">
        <h2 class="text-sm font-black uppercase tracking-widest opacity-60">Request Mix</h2>
      </div>
      <div class="p-6 h-80 flex flex-col items-center justify-center">
        {#if analytics}
          <Chart 
            type="doughnut"
            data={{
              labels: analytics.byType.map(t => t.name),
              datasets: [{
                data: analytics.byType.map(t => t.count),
                backgroundColor: [
                  '#4f46e5', // Indigo-600
                  '#f59e0b', // Amber-500
                  '#ec4899', // Pink-500
                  '#3b82f6', // Blue-500
                  '#10b981'  // Emerald-500
                ],
                borderWidth: 0
              }]
            }}
            options={{
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10, weight: 'bold' }, color: 'oklch(var(--bc) / 0.6)' } }
              },
              cutout: '70%'
            }}
          />
        {:else}
          <div class="size-48 rounded-full border-8 border-base-300/30 border-t-primary animate-spin"></div>
        {/if}
      </div>
    </div>
  </div>

  <!-- 3. SECONDARY STATS & OPERATIONAL CARDS -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {#if hasRole("admin", "mis")}
      <a href="/my-tickets?tab=assigned&status=in_progress" class="contents">
        <StatsCard
          icon={UserCheck}
          label="My Workload"
          value={totalAssignedToMe}
          color="secondary"
          sub="Active & Assigned"
        />
      </a>
      
      {#if user?.department_id}
        <a href="/my-tickets?tab=all&status=open" class="contents">
          <StatsCard
            icon={Briefcase}
            label="Dept Triage"
            value={totalDepartmentUnassigned}
            color="accent"
            sub="Unassigned in Dept"
          />
        </a>
      {/if}
    {/if}

    <a href="/my-tickets?tab={hasRole('admin', 'mis') ? 'all' : 'requested'}&status=open" class="contents">
      <StatsCard
        icon={Inbox}
        label="Total Open"
        value={totalOpen}
        color="info"
        pct={totalAll > 0 ? Math.round((totalOpen / totalAll) * 100) : 0}
        sub="New & Pending"
      />
    </a>

    <a href="/my-tickets?tab={hasRole('admin', 'mis') ? 'all' : 'requested'}&status=resolved" class="contents">
      <StatsCard
        icon={CircleCheckBig}
        label="Resolved"
        value={totalResolved}
        color="success"
        pct={totalAll > 0 ? Math.round((totalResolved / totalAll) * 100) : 0}
        sub="Resolved all time"
      />
    </a>

    {#if hasRole("admin", "mis")}
      <a href="/my-tickets?tab=all" class="contents">
        <StatsCard
          icon={LayoutDashboard}
          label="Total Tickets"
          value={totalAll}
          color="neutral"
          sub="All time"
        />
      </a>
    {/if}
  </div>

  <!-- 4. BOTTOM CONTENT (Recent Tickets & Staff) -->
  <div class="grid grid-cols-1 xl:grid-cols-4 gap-8">
    <!-- Recent Tickets (3/4) -->
    <div class="xl:col-span-3 flex flex-col gap-4">
      <div class="card bg-base-100 border border-base-300 shadow-xl overflow-hidden">
        <div class="flex flex-wrap items-center justify-between px-6 py-5 border-b border-base-300 gap-4">
          <h2 class="text-lg font-black tracking-tight flex items-center gap-2">
            <LayoutDashboard class="text-primary" size={20} />
            Recent Activity
          </h2>
          <div class="flex items-center gap-3 flex-1 justify-end min-w-0">
            <div class="w-48">
              <SearchableSelect
                items={departments}
                bind:value={departmentId}
                placeholder="All Departments"
              />
            </div>
            <a href="/my-tickets?tab={hasRole('admin', 'mis') ? 'all' : 'requested'}" class="btn btn-ghost btn-sm font-bold uppercase tracking-widest text-[10px]"
              >View All Activity</a
            >
          </div>
        </div>
        {#if loading}
          <div class="flex justify-center py-20">
            <span class="loading loading-spinner loading-lg text-primary"></span>
          </div>
        {:else}
          <div class="p-0 overflow-x-auto">
            <TicketTable
              {tickets}
              showRequester={hasRole("admin", "mis")}
              sort={dashboardSort}
              order={dashboardOrder}
              onSort={handleDashboardSort}
            />
          </div>
        {/if}
      </div>
    </div>

    <!-- Active Staff (1/4) -->
    <div class="flex flex-col gap-6">
      <div class="card bg-base-100 border border-base-300 shadow-xl overflow-hidden">
        <div class="p-5 border-b border-base-300 bg-base-200/50 flex items-center justify-between">
          <h2 class="text-xs font-black uppercase tracking-widest opacity-50">
            Online Team
          </h2>
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full bg-success animate-pulse"></div>
            <span class="text-[10px] font-black opacity-40 uppercase">{activeUsers.length}</span>
          </div>
        </div>
        <div class="card-body p-0 max-h-[400px] overflow-y-auto">
          {#each activeUsers.slice(0, 8) as staff (staff.id)}
            <a href="/messages/{staff.id}" class="w-full px-5 py-4 flex items-center gap-4 hover:bg-base-200 transition-colors border-b border-base-200 last:border-0 group">
              <div class="avatar online">
                <div class="w-10 h-10 rounded-xl bg-neutral text-neutral-content flex items-center justify-center text-sm font-black">
                  {staff.first_name[0]}{staff.last_name[0]}
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-black truncate group-hover:text-primary transition-colors">
                  {staff.first_name} {staff.last_name}
                </p>
                <p class="text-[10px] font-bold opacity-40 truncate">
                  {staff.position ?? "Technical Support"}
                </p>
              </div>
            </a>
          {:else}
            <div class="p-12 text-center opacity-30 italic text-xs font-medium">
              No staff active
            </div>
          {/each}
        </div>
        <div class="p-4 bg-base-200/30 border-t border-base-200">
          <a href="/messages" class="btn btn-ghost btn-xs btn-block gap-2 text-[10px] font-black uppercase tracking-widest">
            Open Chat Room
          </a>
        </div>
      </div>
    </div>
  </div>
</div>
