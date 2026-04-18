<script lang="ts">
  import { api } from "../../lib/api";
  import {
    getAffectedSystems,
    getRequestTypes,
  } from "../../stores/reference.svelte";
  import { navigate } from "../../router.svelte";

  import { Send } from "lucide-svelte";

  let title = $state("");
  let description = $state("");
  let priority = $state("medium");
  let request_type_id = $state<number | undefined>(undefined);
  let affected_system_id = $state<number | undefined>(undefined);
  let requires_approval = $state(false);
  let due_date = $state("");
  let error = $state("");
  let loading = $state(false);

  let systems = $derived(getAffectedSystems());
  let requestTypes = $derived(getRequestTypes());

  // Auto-set requires_approval from request type
  $effect(() => {
    if (request_type_id) {
      const rt = requestTypes.find((r) => r.id === request_type_id);
      if (rt) requires_approval = rt.requires_approval_by_default;
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = "";
    loading = true;
    try {
      const body: Record<string, unknown> = {
        title,
        description,
        priority,
      };
      if (request_type_id) body.request_type_id = request_type_id;
      if (affected_system_id) body.affected_system_id = affected_system_id;
      if (requires_approval) body.requires_approval = true;
      if (due_date) body.due_date = new Date(due_date).toISOString();

      const res = await api.post<{ id: number }>("/tickets/", body);
      if (res?.id) {
        await navigate("/tickets/:id", { params: { id: res.id.toString() } });
      } else {
        await navigate("/my-tickets");
      }
    } catch (e: any) {
      error = e?.message ?? "Failed to create ticket";
    } finally {
      loading = false;
    }
  }
</script>

<div class="max-w-2xl mx-auto flex flex-col gap-6">
  <div>
    <h1 class="text-3xl font-bold">New Ticket</h1>
    <p class="text-sm opacity-60 mt-1">Submit a support request</p>
  </div>

  {#if error}
    <div role="alert" class="alert alert-error alert-soft text-sm">{error}</div>
  {/if}

  <form onsubmit={handleSubmit} class="card bg-base-200 shadow-sm">
    <div class="card-body gap-4">
      <!-- Title -->
      <fieldset class="fieldset">
        <label class="label font-medium" for="ticket-title">Title</label>
        <input
          id="ticket-title"
          type="text"
          class="input input-bordered w-full"
          placeholder="Brief summary of the issue"
          required
          bind:value={title}
          disabled={loading}
        />
      </fieldset>

      <!-- Description -->
      <fieldset class="fieldset">
        <label class="label font-medium" for="ticket-desc">Description</label>
        <textarea
          id="ticket-desc"
          class="textarea textarea-bordered w-full h-32"
          placeholder="Describe the issue in detail…"
          required
          bind:value={description}
          disabled={loading}
        ></textarea>
      </fieldset>

      <!-- Row: Priority + Due Date -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <fieldset class="fieldset">
          <label class="label font-medium" for="ticket-priority">Priority</label
          >
          <select
            id="ticket-priority"
            class="select select-bordered w-full"
            bind:value={priority}
            disabled={loading}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <label class="label font-medium" for="ticket-due"
            >Due Date (optional)</label
          >
          <input
            id="ticket-due"
            type="datetime-local"
            class="input input-bordered w-full"
            bind:value={due_date}
            disabled={loading}
          />
        </fieldset>
      </div>

      <!-- Row: Request Type + Affected System -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <fieldset class="fieldset">
          <label class="label font-medium" for="ticket-type">Request Type</label
          >
          <select
            id="ticket-type"
            class="select select-bordered w-full"
            bind:value={request_type_id}
            disabled={loading}
          >
            <option value={undefined}>— Select —</option>
            {#each requestTypes as rt}
              <option value={rt.id}>{rt.name}</option>
            {/each}
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <label class="label font-medium" for="ticket-system"
            >Affected System</label
          >
          <select
            id="ticket-system"
            class="select select-bordered w-full"
            bind:value={affected_system_id}
            disabled={loading}
          >
            <option value={undefined}>— Select —</option>
            {#each systems as sys}
              <option value={sys.id}>{sys.name}</option>
            {/each}
          </select>
        </fieldset>
      </div>

      <!-- Requires Approval -->
      <div class="flex flex-col gap-1">
        <label class="label cursor-pointer justify-start gap-3 p-0">
          <input
            type="checkbox"
            class="checkbox checkbox-primary"
            bind:checked={requires_approval}
            disabled={loading}
          />
          <span class="font-medium text-sm">Requires approval before work begins</span>
        </label>
        {#if requires_approval}
          <p class="text-[10px] opacity-50 ml-8 leading-tight">
            A default approver will be automatically assigned to this ticket. 
            You can still manually assign additional approvers after submission.
          </p>
        {/if}
      </div>

      <!-- Submit -->
      <div class="card-actions justify-end mt-2">
        <a href="/my-tickets" class="btn btn-ghost">Cancel</a>
        <button class="btn btn-primary gap-2" type="submit" disabled={loading}>
          {#if loading}<span class="loading loading-spinner loading-sm"
            ></span>{/if}
          <Send size={16} />
          Submit Ticket
        </button>
      </div>
    </div>
  </form>
</div>
