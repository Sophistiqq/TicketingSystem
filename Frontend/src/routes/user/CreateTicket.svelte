<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import {
    getAffectedSystems,
    getRequestTypes,
    getDepartments,
  } from "../../stores/reference.svelte";
  import { navigate } from "../../router.svelte";
  import { hasRole } from "../../stores/user.svelte";
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
    ShieldCheck,
    Paperclip,
    Upload,
    HelpCircle,
    Calendar,
  } from "lucide-svelte";
  import { createTicketTour, startTourIfNeverSeen } from "../../lib/tutorial";

  let title = $state("");
  let description = $state("");
  let priority = $state("medium");
  let request_type_id = $state<number | undefined>(undefined);
  let affected_system_id = $state<number | undefined>(undefined);
  let department_id = $state<number | undefined>(undefined);
  let requires_approval = $state(false);
  let due_date = $state("");

  // Other details
  let other_request_type = $state("");
  let other_affected_system = $state("");
  let other_department = $state("");

  let files = $state<FileList | null>(null);
  let fileInput = $state<HTMLInputElement | undefined>(undefined);
  let selectedZoomImage = $state<string | null>(null);

  let error = $state("");
  let loading = $state(false);

  let systems = $derived(getAffectedSystems());
  let requestTypes = $derived(getRequestTypes());
  let departments = $derived(getDepartments());

  let isOtherRequestType = $derived(
    requestTypes.find((t) => t.id === request_type_id)?.name === "Others",
  );
  let isOtherAffectedSystem = $derived(
    systems.find((s) => s.id === affected_system_id)?.name === "Others",
  );
  let isOtherDepartment = $derived(
    departments.find((d) => d.id === department_id)?.name === "Others",
  );
  onMount(() => {
    startTourIfNeverSeen("ticket_create", createTicketTour);

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
        due_date = parsed.due_date || "";
        other_request_type = parsed.other_request_type || "";
        other_affected_system = parsed.other_affected_system || "";
        other_department = parsed.other_department || "";
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
        due_date,
        request_type_id,
        affected_system_id,
        department_id,
        other_request_type,
        other_affected_system,
        other_department,
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
        other_request_type: isOtherRequestType ? other_request_type : undefined,
        other_affected_system: isOtherAffectedSystem
          ? other_affected_system
          : undefined,
        other_department: isOtherDepartment ? other_department : undefined,
      };
      if (due_date) body.due_date = new Date(due_date).toISOString();

      const res = await api.post<{ id: number }>("/tickets/", body);
      if (res?.id) {
        if (files && files.length > 0) {
          await api.upload(res.id, files);
        }
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

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      files = target.files;
    }
  }

  function getPreviewUrl(file: File) {
    return URL.createObjectURL(file);
  }

  function isImage(file: File) {
    return file.type.startsWith("image/");
  }

  let slaHint = $derived.by(() => {
    if (priority === "critical") return "4 Hours";
    if (priority === "high") return "24 Hours";
    if (priority === "medium") return "3 Days";
    return "5 Days";
  });

  import { Search, CircleX } from "lucide-svelte";
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
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-primary transition-colors"
        title="Show Guide"
        onclick={() => createTicketTour().drive()}
      >
        <HelpCircle size={16} />
      </button>
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
              data-tour="ticket-subject"
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
                data-tour="ticket-description"
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
          <div>
            <SearchableSelect
              label="Request Type"
              icon={LayoutGrid}
              items={requestTypes}
              bind:value={request_type_id}
              data-tour="ticket-request-type"
            />
            {#if isOtherRequestType}
              <div class="mt-2 animate-in fade-in slide-in-from-top-1">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  placeholder="Specify request type..."
                  bind:value={other_request_type}
                  required
                />
              </div>
            {/if}
          </div>

          <div>
            <SearchableSelect
              label="Affected System"
              icon={FileCheckCorner}
              items={systems}
              bind:value={affected_system_id}
              data-tour="ticket-system"
            />
            {#if isOtherAffectedSystem}
              <div class="mt-2 animate-in fade-in slide-in-from-top-1">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  placeholder="Specify system name..."
                  bind:value={other_affected_system}
                  required
                />
              </div>
            {/if}
          </div>

          <div>
            <SearchableSelect
              label="Target Department"
              icon={Building2}
              items={departments}
              bind:value={department_id}
              data-tour="ticket-department"
            />
            {#if isOtherDepartment}
              <div class="mt-2 animate-in fade-in slide-in-from-top-1">
                <input
                  type="text"
                  class="input input-bordered input-sm w-full"
                  placeholder="Specify department..."
                  bind:value={other_department}
                  required
                />
              </div>
            {/if}
          </div>
        </div>

        <div class="divider opacity-10 my-0"></div>

        <div class="space-y-4">
          {#if hasRole("admin", "mis")}
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
                data-tour="ticket-priority"
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
                type="datetime-local"
                class="input input-bordered w-full input-sm h-9 min-h-0 font-medium"
                bind:value={due_date}
                data-tour="ticket-due-date"
              />
            </div>

            <div class="divider opacity-10 my-0"></div>
          {/if}

          <!-- Attachments -->
          <div class="form-control w-full">
            <label class="label py-1">
              <span
                class="label-text font-bold text-[10px] uppercase tracking-wider flex items-center gap-2"
              >
                <Paperclip size={12} class="text-primary" /> Attachments
              </span>
            </label>
            <div
              class="flex flex-col gap-2 p-3 bg-base-200/30 rounded-xl border border-dashed border-base-300"
              data-tour="ticket-attachments"
            >
              <input
                type="file"
                multiple
                class="hidden"
                bind:this={fileInput}
                onchange={handleFileChange}
              />
              <button
                type="button"
                class="btn btn-ghost btn-sm w-full gap-2 text-xs border border-base-300 bg-base-100"
                onclick={() => fileInput?.click()}
              >
                <Upload size={14} />
                {files && files.length > 0
                  ? `${files.length} files selected`
                  : "Choose Files"}
              </button>
              {#if files && files.length > 0}
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each Array.from(files) as file}
                    {#if isImage(file)}
                      <button
                        type="button"
                        class="badge badge-primary badge-outline text-[9px] truncate max-w-[120px] cursor-pointer hover:bg-primary hover:text-white transition-all"
                        onclick={() =>
                          (selectedZoomImage = getPreviewUrl(file))}
                      >
                        {file.name}
                      </button>
                    {:else}
                      <span
                        class="badge badge-ghost text-[9px] truncate max-w-[120px]"
                      >
                        {file.name}
                      </span>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <!-- Approval -->
          <label
            class="flex items-center gap-3 p-2 bg-base-200/30 rounded-xl border border-base-300 hover:border-primary/40 transition-all cursor-pointer group"
            data-tour="ticket-approval"
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
          data-tour="ticket-submit"
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

<!-- Image zoom modal -->
{#if selectedZoomImage}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200"
    onclick={() => (selectedZoomImage = null)}
  >
    <button
      class="absolute top-4 right-4 btn btn-circle btn-ghost text-white"
      onclick={() => (selectedZoomImage = null)}
    >
      <CircleX size={28} />
    </button>
    <img
      src={selectedZoomImage}
      alt="Zoomed preview"
      class="max-w-full max-h-full object-contain shadow-2xl animate-in zoom-in-95 duration-200"
    />
  </div>
{/if}
