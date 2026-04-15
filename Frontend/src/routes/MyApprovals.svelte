<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import type { TicketApprover } from "../lib/types";
  import StatusBadge from "../components/StatusBadge.svelte";
  import { CheckCircle, XCircle, ClipboardCheck, Clock } from "lucide-svelte";

  let approvals = $state<(TicketApprover & { ticket?: any })[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const res = await api.get<(TicketApprover & { ticket?: any })[]>("/approvals/my/pending");
      if (res) approvals = res;
    } catch { /* handled */ }
    loading = false;
  });

  async function decide(approval: TicketApprover, decision: "approved" | "rejected") {
    const remarks = prompt(`Remarks for ${decision}:`);
    try {
      await api.post(`/approvals/${approval.id}/decide`, {
        ticket_id: approval.ticket_id,
        decision,
        remarks: remarks ?? undefined,
      });
      // Remove from list
      approvals = approvals.filter((a) => a.id !== approval.id);
    } catch { /* handled */ }
  }
</script>

<div class="flex flex-col gap-6">
  <div>
    <h1 class="text-3xl font-bold">My Approvals</h1>
    <p class="text-sm opacity-60 mt-1">Tickets awaiting your decision</p>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else if approvals.length === 0}
    <div class="card bg-base-200 shadow-sm">
      <div class="card-body items-center text-center py-16">
        <ClipboardCheck size={48} class="opacity-20 mb-2" />
        <h2 class="text-lg font-semibold opacity-60">All caught up!</h2>
        <p class="text-sm opacity-40">No pending approvals at this time.</p>
      </div>
    </div>
  {:else}
    <div class="grid gap-4">
      {#each approvals as approval (approval.id)}
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <a href="/tickets/{approval.ticket_id}" class="text-lg font-semibold hover:text-primary transition-colors">
                  {approval.ticket?.title ?? `Ticket #${approval.ticket_id}`}
                </a>
                <div class="flex items-center gap-2 mt-1 text-sm opacity-60">
                  <Clock size={14} />
                  <span>Requested {new Date(approval.created_at).toLocaleDateString()}</span>
                  {#if approval.ticket?.status}
                    <StatusBadge status={approval.ticket.status} />
                  {/if}
                </div>
                {#if approval.ticket?.description}
                  <p class="text-sm opacity-70 mt-2 line-clamp-2">{approval.ticket.description}</p>
                {/if}
              </div>

              <div class="flex gap-2 shrink-0">
                <button class="btn btn-success btn-sm gap-1" onclick={() => decide(approval, "approved")}>
                  <CheckCircle size={14} /> Approve
                </button>
                <button class="btn btn-error btn-sm gap-1" onclick={() => decide(approval, "rejected")}>
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
