<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import type { Ticket, PaginatedResponse, TicketApprover } from "../lib/types";
  import { getCurrentUser, hasRole } from "../stores/user.svelte";
  import TicketTable from "../components/TicketTable.svelte";
  import StatsCard from "../components/StatsCard.svelte";
  import {
    Inbox,
    Clock,
    AlertTriangle,
    CheckCircle,
    Plus,
    ClipboardCheck,
    UserCheck,
  } from "lucide-svelte";

  let user = $derived(getCurrentUser());
  let tickets = $state<Ticket[]>([]);
  let pendingApprovals = $state<TicketApprover[]>([]);
  let loading = $state(true);

  // Stats
  let totalOpen = $state(0);
  let totalInProgress = $state(0);
  let totalOverdue = $state(0);
  let totalResolved = $state(0);
  let totalPendingApprovals = $state(0);
  let totalAssignedToMe = $state(0);

  onMount(async () => {
    try {
      // Fetch recent tickets
      const res = await api.get<PaginatedResponse<Ticket>>("/tickets/?page=1&limit=10&sort=created_at&order=desc");
      if (res) {
        tickets = res.data;
      }

      // Get accurate counts from filtered queries
      const queries = [
        api.get<PaginatedResponse<Ticket>>("/tickets/?status=open&limit=1"),
        api.get<PaginatedResponse<Ticket>>("/tickets/?status=in_progress&limit=1"),
        api.get<PaginatedResponse<Ticket>>("/tickets/?overdue=true&limit=1"),
        api.get<PaginatedResponse<Ticket>>("/tickets/?status=resolved&limit=1"),
      ];

      // If staff, also check assigned to me
      if (hasRole("admin", "mis")) {
        queries.push(api.get<PaginatedResponse<Ticket>>(`/tickets/?assignee_id=${user?.id}&limit=1`));
      }

      const results = await Promise.all(queries);
      if (results[0]) totalOpen = results[0].pagination.total;
      if (results[1]) totalInProgress = results[1].pagination.total;
      if (results[2]) totalOverdue = results[2].pagination.total;
      if (results[3]) totalResolved = results[3].pagination.total;
      if (results[4]) totalAssignedToMe = results[4].pagination.total;

      // If approver, get pending approvals
      if (hasRole("approver", "admin")) {
        const appRes = await api.get<TicketApprover[]>("/approvals/my/pending");
        if (appRes) {
          pendingApprovals = appRes;
          totalPendingApprovals = appRes.length;
        }
      }
    } catch {
      // handled
    } finally {
      loading = false;
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
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#if hasRole("approver", "admin") && totalPendingApprovals > 0}
      <StatsCard icon={ClipboardCheck} label="To Approve" value={totalPendingApprovals} color="primary" sub="Pending your decision" />
    {/if}
    {#if hasRole("admin", "mis")}
      <StatsCard icon={UserCheck} label="My Workload" value={totalAssignedToMe} color="secondary" sub="Assigned to you" />
    {/if}
    <StatsCard icon={Inbox} label="Total Open" value={totalOpen} color="info" />
    <StatsCard icon={Clock} label="In Progress" value={totalInProgress} color="warning" />
    <StatsCard icon={AlertTriangle} label="Overdue" value={totalOverdue} color="error" />
    <StatsCard icon={CheckCircle} label="Resolved" value={totalResolved} color="success" />
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <!-- Recent Tickets (2/3) -->
    <div class="xl:col-span-2 flex flex-col gap-4">
      <div class="card bg-base-200 shadow-sm overflow-hidden">
        <div class="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 class="card-title text-lg font-bold">Recent Tickets</h2>
          <a href="/my-tickets" class="btn btn-ghost btn-sm">View All</a>
        </div>
        {#if loading}
          <div class="flex justify-center py-12">
            <span class="loading loading-spinner loading-lg text-primary"></span>
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
            <h2 class="card-title text-sm font-bold flex items-center gap-2 mb-2">
              <ClipboardCheck size={18} class="text-primary" />
              Pending Approvals
            </h2>
            <div class="flex flex-col gap-2">
              {#each pendingApprovals.slice(0, 5) as app}
                <a href="/tickets/{app.ticket_id}" class="bg-base-100 p-2 rounded-lg text-xs hover:bg-base-300 transition-colors flex justify-between items-center">
                  <span class="truncate flex-1 font-medium">{(app as any).ticket?.title ?? `Ticket #${app.ticket_id}`}</span>
                  <span class="opacity-50 ml-2">#{app.ticket_id}</span>
                </a>
              {/each}
              {#if pendingApprovals.length > 5}
                <a href="/approvals" class="text-xs text-primary font-bold mt-1 hover:underline text-center">
                  View all {pendingApprovals.length} approvals
                </a>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Quick Actions -->
      <div class="card bg-base-200 shadow-sm">
        <div class="card-body p-4">
          <h2 class="card-title text-sm font-bold mb-2">Quick Actions</h2>
          <div class="grid grid-cols-1 gap-2">
            <a href="/tickets/new" class="btn btn-sm btn-outline btn-primary justify-start">
              <Plus size={14} /> New Ticket
            </a>
            <a href="/my-tickets" class="btn btn-sm btn-outline justify-start">
              <Inbox size={14} /> My Tickets
            </a>
            {#if hasRole("approver", "admin")}
              <a href="/approvals" class="btn btn-sm btn-outline btn-primary justify-start">
                <ClipboardCheck size={14} /> My Approvals
              </a>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
