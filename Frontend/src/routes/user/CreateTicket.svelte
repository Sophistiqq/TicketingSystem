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
  import { Send, Type, FileText, LayoutGrid, Building2, AlertTriangle, FileCheck2, Info } from "lucide-svelte";

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
      } catch { }
    }
  });

  $effect(() => {
    localStorage.setItem("ticket_draft", JSON.stringify({ title, description, priority, request_type_id, affected_system_id, department_id }));
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    try {
      const body: Record<string, unknown> = { title, description, priority, request_type_id, affected_system_id, department_id, requires_approval };
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

<div class="w-full max-w-[1400px] mx-auto p-6">
  <div class="mb-8">
    <h1 class="text-3xl font-extrabold tracking-tight text-base-content">New Support Ticket</h1>
    <p class="text-sm opacity-60 mt-1">Submit a new request to your department for rapid assistance.</p>
  </div>
  
  <form onsubmit={handleSubmit} class="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
    
    <!-- Main Content: Subject + Editor (3/4 width) -->
    <div class="lg:col-span-3 space-y-6">
      <div class="card bg-base-100 shadow-xl border border-base-200 p-10">
        <div class="form-control mb-8">
          <label class="label font-bold text-sm uppercase gap-2 mb-2" for="title">
            <Type size={16} class="text-primary" /> Ticket Subject
            <div class="tooltip tooltip-right" data-tip="Give your ticket a clear and concise title.">
                <Info size={16} class="opacity-40 cursor-help" />
            </div>
          </label>
          <input id="title" type="text" class="input input-bordered input-lg w-full font-medium" placeholder="Briefly describe your issue..." bind:value={title} required />
        </div>
        
        <div class="form-control">
          <label class="label font-bold text-sm uppercase gap-2 mb-2" for="description">
            <FileText size={16} class="text-primary" /> Detailed Description
            <div class="tooltip tooltip-right" data-tip="You can paste tables from Excel directly here!">
                <Info size={16} class="opacity-40 cursor-help" />
            </div>
          </label>
          <div class="mt-2">
            <RichTextEditor bind:value={description} />
          </div>
          <p class="text-sm opacity-60 mt-4 italic flex items-center gap-2">
            <Info size={14} /> Pro-tip: You can paste content, images, and Excel cells directly into the editor above.
          </p>
        </div>
      </div>
    </div>

    <!-- Sidebar: Config & Metadata (1/4 width) -->
    <div class="lg:col-span-1 space-y-6">
      <div class="card bg-base-100 shadow-xl border border-primary/20 p-6 gap-6 text-sm">
        <h3 class="font-bold text-sm uppercase text-primary">Configuration</h3>
        <SearchableSelect label="Request Type" icon={LayoutGrid} items={requestTypes} bind:value={request_type_id} />
        <SearchableSelect label="Affected System" icon={FileCheck2} items={systems} bind:value={affected_system_id} />
        <SearchableSelect label="Target Department" icon={Building2} items={departments} bind:value={department_id} />
        
        <div class="divider my-0"></div>
        
        <div class="space-y-4">
            <label class="label font-bold text-xs uppercase gap-2">
              <AlertTriangle size={14} class="text-warning" /> Priority
            </label>
            <select 
              class="select select-bordered w-full select-sm font-bold" 
              bind:value={priority}
              class:text-success={priority === 'low'}
              class:text-info={priority === 'medium'}
              class:text-warning={priority === 'high'}
              class:text-error={priority === 'critical'}
            >
              <option value="low" class="text-success">Low</option>
              <option value="medium" class="text-info">Medium</option>
              <option value="high" class="text-warning">High</option>
              <option value="critical" class="text-error">Critical</option>
            </select>
            <p class="text-xs opacity-70">SLA Commitment: <span class="text-primary font-bold">{slaHint}</span></p>
        </div>

        <label class="cursor-pointer flex items-center gap-3 p-2 bg-base-200/50 rounded-lg border border-base-300 hover:border-primary/30 transition-colors">
          <input type="checkbox" class="checkbox checkbox-primary" bind:checked={requires_approval} />
          <span class="font-bold text-sm">Requires formal approval</span>
        </label>

        <button class="btn btn-primary w-full mt-4 shadow-lg shadow-primary/20 py-4 h-auto text-lg" type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit Ticket"}
        </button>
      </div>
    </div>
  </form>
</div>
