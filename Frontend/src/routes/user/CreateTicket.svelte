<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import {
    getAffectedSystems,
    getRequestTypes,
    getDepartments,
  } from "../../stores/reference.svelte";
  import { navigate } from "../../router.svelte";
  import RichTextEditor from "../../components/RichTextEditor.svelte";
  import SearchableSelect from "../../components/SearchableSelect.svelte";
  import {
    Send,
    Type,
    FileText,
    LayoutGrid,
    Building2,
    TriangleAlert,
    FileCheckCorner,
    Calendar,
    ShieldCheck,
  } from "lucide-svelte";

  let title = $state("");
  let description = $state("");
  let priority = $state("medium");
  let request_type_id = $state<number | undefined>(undefined);
  let affected_system_id = $state<number | undefined>(undefined);
  let department_id = $state<number | undefined>(undefined);
  let requires_approval = $state(false);
  let due_date = $state("");

  let error = $state("");
  let loading = $state(false);

  let systems = $derived(getAffectedSystems());
  let requestTypes = $derived(getRequestTypes());
  let departments = $derived(getDepartments());

  onMount(() => {
    const draft = localStorage.getItem("ticket_draft");
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        title = parsed.title || "";
        description = parsed.description || "";
        priority = parsed.priority || "medium";
        request_type_id = parsed.request_type_id;
        affected_system_id = parsed.affected_system_id;
        department_id = parsed.department_id;
      } catch {}
    }
  });

  $effect(() => {
    localStorage.setItem(
      "ticket_draft",
      JSON.stringify({
        title,
        description,
        priority,
        request_type_id,
        affected_system_id,
        department_id,
      }),
    );
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = "";

    try {
      const body: Record<string, unknown> = {
        title,
        description,
        priority,
        request_type_id,
        affected_system_id,
        department_id,
        requires_approval,
      };
      if (due_date) body.due_date = new Date(due_date).toISOString();

      const res = await api.post<{ id: number }>("/tickets/", body);
      if (res?.id) {
        localStorage.removeItem("ticket_draft");
        await navigate("/tickets/:id", { params: { id: String(res.id) } });
      } else {
        await navigate("/my-tickets");
      }
    } catch (e: any) {
      error = e?.message ?? "Failed to create ticket";
    } finally {
      loading = false;
    }
  }

  let slaHint = $derived.by(() => {
    if (priority === "critical") return "4 Hours";
    if (priority === "high") return "24 Hours";
    return "3-5 Days";
  });
</script>

<div class="h-full flex flex-col max-w-7xl mx-auto w-full px-4 py-2 md:py-4">
  <header class="mb-4 shrink-0">
    <div class="flex items-center gap-3 mb-1">
      <div
        class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"
      >
        <Send size={16} />
      </div>
      <h1 class="text-2xl font-bold tracking-tight">Create Support Ticket</h1>
    </div>
    <p class="text-xs text-base-content/60 max-w-2xl">
      Describe your issue in detail. Our team will route your request to the
      appropriate specialist.
    </p>
  </header>

  {#if error}
    <div
      class="alert alert-error mb-4 shadow-sm border-none rounded-xl py-2 shrink-0"
    >
      <TriangleAlert size={16} />
      <span class="text-sm">{error}</span>
    </div>
  {/if}

  <form
    onsubmit={handleSubmit}
    class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
  >
    <!-- Main Content (Left Column) -->
    <div class="lg:col-span-8 flex flex-col min-h-0">
      <div
        class="card bg-base-100 border border-base-300 shadow-sm rounded-2xl overflow-hidden flex-1 flex flex-col"
      >
        <div class="p-5 flex-1 flex flex-col gap-5 min-h-0">
          <!-- Title Input -->
          <div class="form-control w-full shrink-0">
            <label class="label py-1" for="title">
              <span
                class="label-text font-bold text-[10px] uppercase tracking-wider flex items-center gap-2"
              >
                <Type size={12} class="text-primary" /> Ticket Subject
              </span>
            </label>
            <input
              id="title"
              type="text"
              class="input input-bordered w-full h-10 focus:input-primary transition-all duration-200"
              placeholder="e.g. Printer in Accounting not responding"
              bind:value={title}
              required
            />
          </div>

          <!-- Description / Editor -->
          <div class="form-control w-full flex-1 flex flex-col min-h-0">
            <label class="label py-1" for="description">
              <span
                class="label-text font-bold text-[10px] uppercase tracking-wider flex items-center gap-2"
              >
                <FileText size={12} class="text-primary" /> Issue Description
              </span>
            </label>
            <div
              class="flex-1 min-h-0 rounded-xl border border-base-300 overflow-hidden focus-within:border-primary transition-all duration-200 flex flex-col"
            >
              <RichTextEditor
                bind:value={description}
                class="flex-1 h-full overflow-y-auto"
              />
            </div>
            <div class="flex items-center gap-2 mt-2 shrink-0">
              <span
                class="text-[9px] font-bold opacity-40 uppercase tracking-widest"
                >Supports:</span
              >
              <div class="flex gap-1">
                <span
                  class="badge badge-ghost text-[9px] h-4 py-0 px-1.5 opacity-60"
                  >Images</span
                >
                <span
                  class="badge badge-ghost text-[9px] h-4 py-0 px-1.5 opacity-60"
                  >Tables</span
                >
                <span
                  class="badge badge-ghost text-[9px] h-4 py-0 px-1.5 opacity-60"
                  >Excel</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sidebar / Config (Right Column) -->
    <div class="lg:col-span-4 flex flex-col min-h-0">
      <div
        class="card bg-base-100 border border-base-300 shadow-sm rounded-2xl p-5 flex flex-col gap-4 overflow-y-auto max-h-full"
      >
        <h3
          class="text-xs font-black uppercase tracking-widest opacity-40 flex items-center gap-2"
        >
          Configuration
        </h3>

        <div class="space-y-4">
          <SearchableSelect
            label="Request Type"
            icon={LayoutGrid}
            items={requestTypes}
            bind:value={request_type_id}
          />

          <SearchableSelect
            label="Affected System"
            icon={FileCheckCorner}
            items={systems}
            bind:value={affected_system_id}
          />

          <SearchableSelect
            label="Target Department"
            icon={Building2}
            items={departments}
            bind:value={department_id}
          />
        </div>

        <div class="divider opacity-10 my-0"></div>

        <div class="space-y-4 flex-1">
          <!-- Priority -->
          <div class="form-control w-full">
            <label class="label py-1" for="priority">
              <span
                class="label-text font-bold text-[10px] uppercase tracking-wider flex items-center gap-2"
              >
                <TriangleAlert size={12} class="text-primary" /> Priority Level
              </span>
            </label>
            <select
              id="priority"
              class="select select-bordered w-full select-sm font-bold h-9 min-h-0"
              bind:value={priority}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <div
              class="bg-base-200/50 rounded-lg p-2 mt-2 border border-base-300/50"
            >
              <div class="flex justify-between items-center text-[10px]">
                <span class="opacity-60 font-bold uppercase">SLA:</span>
                <span class="font-black text-primary uppercase">{slaHint}</span>
              </div>
            </div>
          </div>

          <!-- Due Date -->
          <div class="form-control w-full">
            <label class="label py-1" for="due_date">
              <span
                class="label-text font-bold text-[10px] uppercase tracking-wider flex items-center gap-2"
              >
                <Calendar size={12} class="text-primary" /> Desired Due Date
              </span>
            </label>
            <input
              id="due_date"
              type="date"
              class="input input-bordered w-full input-sm h-9 min-h-0 font-medium"
              bind:value={due_date}
            />
          </div>

          <!-- Approval -->
          <label
            class="flex items-center gap-3 p-2 bg-base-200/30 rounded-xl border border-base-300 hover:border-primary/40 transition-all cursor-pointer group"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-primary checkbox-xs"
              bind:checked={requires_approval}
            />
            <div class="flex flex-col">
              <span
                class="label-text font-bold text-[10px] uppercase tracking-wider flex items-center gap-2"
              >
                <ShieldCheck size={12} class="text-primary" /> Requires Approval
              </span>
              <span
                class="text-[9px] opacity-50 font-medium leading-tight mt-0.5"
                >Must be reviewed by a manager.</span
              >
            </div>
          </label>
        </div>

        <button
          class="btn btn-primary w-full h-12 text-sm font-bold shadow-lg shadow-primary/20 rounded-xl gap-2 mt-auto"
          type="submit"
          disabled={loading}
        >
          {#if loading}
            <span class="loading loading-spinner loading-sm"></span>
            SUBMITTING...
          {:else}
            <Send size={16} />
            SUBMIT TICKET
          {/if}
        </button>
      </div>
    </div>
  </form>
</div>
