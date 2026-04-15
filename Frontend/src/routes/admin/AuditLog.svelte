<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import type { AuditLog, PaginatedResponse } from "../../lib/types";
  import Pagination from "../../components/Pagination.svelte";
  import { ScrollText, Search, Clock, Filter } from "lucide-svelte";

  let activeTab = $state<"ticket" | "auth">("ticket");

  // Ticket audit
  let ticketLogs = $state<AuditLog[]>([]);
  let ticketPagination = $state({ page: 1, limit: 30, total: 0, pages: 0 });
  let ticketLoading = $state(true);
  let ticketIdFilter = $state("");
  let actionFilter = $state("");

  // Auth audit
  let authLogs = $state<AuditLog[]>([]);
  let authPagination = $state({ page: 1, limit: 30, total: 0, pages: 0 });
  let authLoading = $state(true);
  let authActionFilter = $state("");

  const ticketActions = [
    "status_change", "assignment", "title_changed", "description_changed",
    "priority_changed", "comment_added", "comment_deleted",
    "attachment_uploaded", "attachment_deleted", "approvers_added",
    "approver_removed", "approval_decision", "csat_submitted",
  ];

  const authActions = [
    "user_registered", "user_login", "user_login_failed", "user_logout",
  ];

  onMount(() => {
    loadTicketAudit();
    loadAuthAudit();
  });

  async function loadTicketAudit(page = 1) {
    ticketLoading = true;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "30");
    if (ticketIdFilter) params.set("ticket_id", ticketIdFilter);
    if (actionFilter) params.set("action", actionFilter);

    try {
      const res = await api.get<PaginatedResponse<AuditLog>>(`/audit/?${params}`);
      if (res) {
        ticketLogs = res.data;
        ticketPagination = res.pagination;
      }
    } catch { /* handled */ }
    ticketLoading = false;
  }

  async function loadAuthAudit(page = 1) {
    authLoading = true;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "30");
    if (authActionFilter) params.set("action", authActionFilter);

    try {
      const res = await api.get<PaginatedResponse<AuditLog>>(`/audit/auth?${params}`);
      if (res) {
        authLogs = res.data;
        authPagination = res.pagination;
      }
    } catch { /* handled */ }
    authLoading = false;
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleString();
  }
</script>

<div class="flex flex-col gap-6">
  <div>
    <h1 class="text-3xl font-bold">Audit Log</h1>
    <p class="text-sm opacity-60 mt-1">Track all system activity</p>
  </div>

  <!-- Tabs -->
  <div role="tablist" class="tabs tabs-bordered">
    <button role="tab" class="tab" class:tab-active={activeTab === "ticket"} onclick={() => (activeTab = "ticket")}>
      Ticket Activity
    </button>
    <button role="tab" class="tab" class:tab-active={activeTab === "auth"} onclick={() => (activeTab = "auth")}>
      Auth Activity
    </button>
  </div>

  {#if activeTab === "ticket"}
    <!-- Ticket audit filters -->
    <div class="card bg-base-200 p-4">
      <div class="flex flex-wrap items-end gap-3">
        <fieldset class="fieldset">
          <label class="label text-xs" for="audit-id">Ticket ID</label>
          <input id="audit-id" type="number" class="input input-bordered input-sm w-28" placeholder="#" bind:value={ticketIdFilter} />
        </fieldset>
        <fieldset class="fieldset">
          <label class="label text-xs" for="audit-action">Action</label>
          <select id="audit-action" class="select select-bordered select-sm" bind:value={actionFilter}>
            <option value="">All</option>
            {#each ticketActions as action}
              <option value={action}>{action.replace(/_/g, " ")}</option>
            {/each}
          </select>
        </fieldset>
        <button class="btn btn-primary btn-sm" onclick={() => loadTicketAudit(1)}>
          <Filter size={14} /> Filter
        </button>
      </div>
    </div>

    <!-- Ticket audit table -->
    <div class="card bg-base-200 shadow-sm">
      <div class="card-body p-0">
        {#if ticketLoading}
          <div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Ticket</th>
                  <th>Action</th>
                  <th>Change</th>
                  <th>By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {#each ticketLogs as log (log.id)}
                  <tr class="hover:bg-base-300/30">
                    <td class="text-xs opacity-60 whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td>
                      {#if log.ticket_id}
                        <a href="/tickets/{log.ticket_id}" class="link link-primary font-mono text-xs">#{log.ticket_id}</a>
                      {:else}
                        —
                      {/if}
                    </td>
                    <td><span class="badge badge-sm badge-ghost">{log.action.replace(/_/g, " ")}</span></td>
                    <td class="text-sm">
                      {#if log.old_value || log.new_value}
                        <span class="opacity-50">{log.old_value ?? "—"}</span>
                        <span class="mx-1">→</span>
                        <span class="font-medium">{log.new_value ?? "—"}</span>
                      {:else}
                        —
                      {/if}
                    </td>
                    <td class="text-sm">{log.performed_by ? `${log.performed_by.first_name} ${log.performed_by.last_name}` : "System"}</td>
                    <td class="text-xs opacity-60 max-w-[200px] truncate">{log.notes ?? ""}</td>
                  </tr>
                {:else}
                  <tr><td colspan="6" class="text-center py-8 opacity-50">No audit entries</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
          <div class="flex justify-center p-4">
            <Pagination pagination={ticketPagination} onPageChange={loadTicketAudit} />
          </div>
        {/if}
      </div>
    </div>

  {:else}
    <!-- Auth audit filters -->
    <div class="card bg-base-200 p-4">
      <div class="flex flex-wrap items-end gap-3">
        <fieldset class="fieldset">
          <label class="label text-xs" for="auth-action">Action</label>
          <select id="auth-action" class="select select-bordered select-sm" bind:value={authActionFilter}>
            <option value="">All</option>
            {#each authActions as action}
              <option value={action}>{action.replace(/_/g, " ")}</option>
            {/each}
          </select>
        </fieldset>
        <button class="btn btn-primary btn-sm" onclick={() => loadAuthAudit(1)}>
          <Filter size={14} /> Filter
        </button>
      </div>
    </div>

    <!-- Auth audit table -->
    <div class="card bg-base-200 shadow-sm">
      <div class="card-body p-0">
        {#if authLoading}
          <div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>User</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {#each authLogs as log (log.id)}
                  <tr class="hover:bg-base-300/30">
                    <td class="text-xs opacity-60 whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td><span class="badge badge-sm badge-ghost">{log.action.replace(/_/g, " ")}</span></td>
                    <td class="text-sm">{log.performed_by ? `${log.performed_by.first_name} ${log.performed_by.last_name}` : "—"}</td>
                    <td class="text-xs opacity-60 max-w-[300px] truncate">{log.notes ?? ""}</td>
                  </tr>
                {:else}
                  <tr><td colspan="4" class="text-center py-8 opacity-50">No auth entries</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
          <div class="flex justify-center p-4">
            <Pagination pagination={authPagination} onPageChange={loadAuthAudit} />
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
