<script lang="ts">
  import { navigate } from "../router.svelte";
  import type { Ticket } from "../lib/types";
  import StatusBadge from "./StatusBadge.svelte";
  import PriorityBadge from "./PriorityBadge.svelte";
  import { Clock, AlertTriangle } from "lucide-svelte";

  let { tickets, showRequester = false, showAssignee = true }: {
    tickets: Ticket[];
    showRequester?: boolean;
    showAssignee?: boolean;
  } = $props();

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }
</script>

<div class="overflow-x-auto">
  <table class="table table-sm">
    <thead>
      <tr>
        <th>ID</th>
        <th>Title</th>
        <th>Status</th>
        <th>Priority</th>
        {#if showRequester}<th>Requester</th>{/if}
        {#if showAssignee}<th>Assignee</th>{/if}
        <th>Created</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each tickets as ticket (ticket.id)}
        <tr class="hover:bg-base-200/50 cursor-pointer" onclick={() => navigate("/tickets/:id", { params: { id: ticket.id.toString() } })}>
          <td class="font-mono text-xs opacity-60">#{ticket.id}</td>
          <td>
            <div class="flex items-center gap-2">
              <span class="font-medium">{ticket.title}</span>
              {#if ticket.sla_breached}
                <span class="badge badge-error badge-xs gap-1">
                  <AlertTriangle size={10} />
                  SLA
                </span>
              {/if}
            </div>
          </td>
          <td><StatusBadge status={ticket.status} /></td>
          <td><PriorityBadge priority={ticket.priority} /></td>
          {#if showRequester}
            <td class="text-sm">
              {ticket.requester ? `${ticket.requester.first_name} ${ticket.requester.last_name}` : "—"}
            </td>
          {/if}
          {#if showAssignee}
            <td class="text-sm">
              {ticket.assignee ? `${ticket.assignee.first_name} ${ticket.assignee.last_name}` : "Unassigned"}
            </td>
          {/if}
          <td>
            <span class="flex items-center gap-1 text-xs opacity-60">
              <Clock size={12} />
              {timeAgo(ticket.created_at)}
            </span>
          </td>
          <td>
            <a href="/tickets/{ticket.id}" class="btn btn-ghost btn-xs">View</a>
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="99" class="text-center py-8 opacity-50">
            No tickets found
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
