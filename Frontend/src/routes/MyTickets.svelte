<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import type { Ticket, PaginatedResponse, TicketStatus, TicketPriority } from "../lib/types";
  import TicketTable from "../components/TicketTable.svelte";
  import Pagination from "../components/Pagination.svelte";
  import { hasRole } from "../stores/user.svelte";
  import { ListTodo, Plus, Search, Filter } from "lucide-svelte";

  let activeTab = $state<"requested" | "assigned">("requested");

  // Requested tickets
  let requestedTickets = $state<Ticket[]>([]);
  let requestedPagination = $state({ page: 1, limit: 20, total: 0, pages: 0 });
  let requestedLoading = $state(true);

  // Assigned tickets
  let assignedTickets = $state<Ticket[]>([]);
  let assignedPagination = $state({ page: 1, limit: 20, total: 0, pages: 0 });
  let assignedLoading = $state(true);

  // Filters (for the "all tickets" view when admin/MIS)
  let search = $state("");
  let statusFilter = $state("");
  let priorityFilter = $state("");
  let overdueOnly = $state(false);
  let allTickets = $state<Ticket[]>([]);
  let allPagination = $state({ page: 1, limit: 20, total: 0, pages: 0 });
  let allLoading = $state(false);

  let showAllView = $derived(hasRole("admin", "mis"));

  onMount(() => {
    loadRequested();
    loadAssigned();
  });

  async function loadRequested(page = 1) {
    requestedLoading = true;
    try {
      const res = await api.get<PaginatedResponse<Ticket>>(`/tickets/my/requested?page=${page}&limit=20`);
      if (res) {
        requestedTickets = res.data;
        requestedPagination = res.pagination;
      }
    } catch { /* handled */ }
    requestedLoading = false;
  }

  async function loadAssigned(page = 1) {
    assignedLoading = true;
    try {
      const res = await api.get<PaginatedResponse<Ticket>>(`/tickets/my/assigned?page=${page}&limit=20`);
      if (res) {
        assignedTickets = res.data;
        assignedPagination = res.pagination;
      }
    } catch { /* handled */ }
    assignedLoading = false;
  }

  async function loadAll(page = 1) {
    allLoading = true;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    params.set("sort", "created_at");
    params.set("order", "desc");
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (overdueOnly) params.set("overdue", "true");

    try {
      const res = await api.get<PaginatedResponse<Ticket>>(`/tickets/?${params}`);
      if (res) {
        allTickets = res.data;
        allPagination = res.pagination;
      }
    } catch { /* handled */ }
    allLoading = false;
  }

  function handleSearch() {
    loadAll(1);
  }
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold">My Tickets</h1>
      <p class="text-sm opacity-60 mt-1">Track your requests and assignments</p>
    </div>
    <a href="/tickets/new" class="btn btn-primary gap-2">
      <Plus size={18} /> New Ticket
    </a>
  </div>

  <!-- Tabs -->
  <div role="tablist" class="tabs tabs-bordered">
    <button role="tab" class="tab" class:tab-active={activeTab === "requested"} onclick={() => (activeTab = "requested")}>
      My Requests ({requestedPagination.total})
    </button>
    <button role="tab" class="tab" class:tab-active={activeTab === "assigned"} onclick={() => (activeTab = "assigned")}>
      Assigned to Me ({assignedPagination.total})
    </button>
    {#if showAllView}
      <button role="tab" class="tab" class:tab-active={activeTab === "all" as any} onclick={() => { activeTab = "all" as any; if (!allTickets.length) loadAll(); }}>
        All Tickets
      </button>
    {/if}
  </div>

  <!-- Filters (only for All Tickets) -->
  {#if activeTab === ("all" as any)}
    <div class="card bg-base-200 p-4">
      <form onsubmit={(e) => { e.preventDefault(); handleSearch(); }} class="flex flex-wrap items-end gap-3">
        <fieldset class="fieldset flex-1 min-w-[200px]">
          <label class="label text-xs" for="search-input">Search</label>
          <div class="join w-full">
            <input id="search-input" type="text" class="input input-bordered input-sm join-item flex-1" placeholder="Search tickets…" bind:value={search} />
            <button type="submit" class="btn btn-primary btn-sm join-item"><Search size={14} /></button>
          </div>
        </fieldset>
        <fieldset class="fieldset">
          <label class="label text-xs" for="status-filter">Status</label>
          <select id="status-filter" class="select select-bordered select-sm" bind:value={statusFilter} onchange={() => loadAll(1)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <label class="label text-xs" for="priority-filter">Priority</label>
          <select id="priority-filter" class="select select-bordered select-sm" bind:value={priorityFilter} onchange={() => loadAll(1)}>
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </fieldset>
        <label class="label cursor-pointer gap-2 text-sm pb-1">
          <input type="checkbox" class="checkbox checkbox-xs checkbox-error" bind:checked={overdueOnly} onchange={() => loadAll(1)} />
          Overdue only
        </label>
      </form>
    </div>
  {/if}

  <!-- Table -->
  <div class="card bg-base-200 shadow-sm">
    <div class="card-body p-0">
      {#if activeTab === "requested"}
        {#if requestedLoading}
          <div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
        {:else}
          <TicketTable tickets={requestedTickets} showAssignee={true} />
          <div class="flex justify-center p-4">
            <Pagination pagination={requestedPagination} onPageChange={loadRequested} />
          </div>
        {/if}

      {:else if activeTab === "assigned"}
        {#if assignedLoading}
          <div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
        {:else}
          <TicketTable tickets={assignedTickets} showRequester={true} />
          <div class="flex justify-center p-4">
            <Pagination pagination={assignedPagination} onPageChange={loadAssigned} />
          </div>
        {/if}

      {:else}
        {#if allLoading}
          <div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
        {:else}
          <TicketTable tickets={allTickets} showRequester={true} showAssignee={true} />
          <div class="flex justify-center p-4">
            <Pagination pagination={allPagination} onPageChange={loadAll} />
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
