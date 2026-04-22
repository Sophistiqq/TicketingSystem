<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../../lib/api";
  import { refreshReferenceData } from "../../../stores/reference.svelte";
  import type {
    Department,
    AffectedSystem,
    RequestType,
  } from "../../../lib/types";
  import { simpleConfirm } from "../../../stores/ui.svelte";
  import { Plus, Pencil, Trash2 } from "lucide-svelte";

  // All reference data
  let departments = $state<Department[]>([]);
  let systems = $state<AffectedSystem[]>([]);
  let requestTypes = $state<RequestType[]>([]);
  let loading = $state(true);

  // Active tab
  let activeTab = $state<"departments" | "systems" | "types">("departments");

  // Modal
  let showModal = $state(false);
  let modalType = $state<"departments" | "systems" | "types">("departments");
  let editingItem = $state<any>(null);
  let formName = $state("");
  let formDesc = $state("");
  let formActive = $state(true);
  let formApproval = $state(false);
  let modalError = $state("");
  let modalLoading = $state(false);

  // Derived items based on active tab
  let items = $derived(
    activeTab === "departments"
      ? departments
      : activeTab === "systems"
        ? systems
        : requestTypes,
  );

  onMount(() => loadAll());

  async function loadAll() {
    loading = true;
    try {
      const [d, s, r] = await Promise.all([
        api.get<Department[]>("/reference/departments"),
        api.get<AffectedSystem[]>("/reference/affected-systems"),
        api.get<RequestType[]>("/reference/request-types"),
      ]);
      departments = d ?? [];
      systems = s ?? [];
      requestTypes = r ?? [];
    } catch {
      /* handled */
    }
    loading = false;
  }

  function getEndpoint(type: string): string {
    const map: Record<string, string> = {
      departments: "/reference/departments",
      systems: "/reference/affected-systems",
      types: "/reference/request-types",
    };
    return map[type] ?? "";
  }

  function openCreate(type: "departments" | "systems" | "types") {
    modalType = type;
    editingItem = null;
    formName = "";
    formDesc = "";
    formActive = true;
    formApproval = false;
    modalError = "";
    showModal = true;
  }

  function openEdit(type: "departments" | "systems" | "types", item: any) {
    modalType = type;
    editingItem = item;
    formName = item.name;
    formDesc = item.description ?? "";
    formActive = item.is_active;
    formApproval = item.requires_approval_by_default ?? false;
    modalError = "";
    showModal = true;
  }

  async function save(e: Event) {
    e.preventDefault();
    modalLoading = true;
    modalError = "";
    try {
      const endpoint = getEndpoint(modalType);
      const body: Record<string, unknown> = {
        name: formName,
        description: formDesc || undefined,
        is_active: formActive,
      };
      if (modalType === "types") {
        body.requires_approval_by_default = formApproval;
      }

      if (editingItem) {
        await api.put(`${endpoint}/${editingItem.id}`, body);
      } else {
        await api.post(endpoint, body);
      }
      showModal = false;
      await loadAll();
      await refreshReferenceData();
    } catch (e: any) {
      modalError = e?.message ?? "Save failed";
    }
    modalLoading = false;
  }

  async function remove(type: "departments" | "systems" | "types", id: number) {
    if (!(await simpleConfirm("Delete this item? (soft delete)", true))) return;
    const endpoint = getEndpoint(type);
    await api.delete(`${endpoint}/${id}`);
    await loadAll();
    await refreshReferenceData();
  }

  function getTabLabel(type: string): string {
    const map: Record<string, string> = {
      departments: "Departments",
      systems: "Affected Systems",
      types: "Request Types",
    };
    return map[type] ?? type;
  }
</script>

<div class="flex flex-col gap-6">
  <div>
    <h1 class="text-3xl font-bold">Settings</h1>
    <p class="text-sm opacity-60 mt-1">Manage reference data for dropdowns</p>
  </div>

  <!-- Tabs -->
  <div role="tablist" class="tabs tabs-bordered">
    <button
      role="tab"
      class="tab"
      class:tab-active={activeTab === "departments"}
      onclick={() => (activeTab = "departments")}
    >
      Departments ({departments.length})
    </button>
    <button
      role="tab"
      class="tab"
      class:tab-active={activeTab === "systems"}
      onclick={() => (activeTab = "systems")}
    >
      Affected Systems ({systems.length})
    </button>
    <button
      role="tab"
      class="tab"
      class:tab-active={activeTab === "types"}
      onclick={() => (activeTab = "types")}
    >
      Request Types ({requestTypes.length})
    </button>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else}
    <!-- Add button -->
    <div class="flex justify-end">
      <button
        class="btn btn-primary btn-sm gap-2"
        onclick={() => openCreate(activeTab)}
      >
        <Plus size={16} /> Add {getTabLabel(activeTab).replace(/s$/, "")}
      </button>
    </div>

    <!-- Table -->
    <div class="card bg-base-200 shadow-sm">
      <div class="card-body p-0">
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Description</th>
                {#if activeTab === "types"}
                  <th>Requires Approval</th>
                {/if}
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each items as item (item.id)}
                <tr class="hover:bg-base-300/30">
                  <td class="font-mono text-xs opacity-60">{item.id}</td>
                  <td class="font-medium">{item.name}</td>
                  <td class="text-sm opacity-70 max-w-[300px] truncate"
                    >{item.description ?? "—"}</td
                  >
                  {#if activeTab === "types"}
                    <td>
                      <span
                        class="badge badge-xs {(item as RequestType)
                          .requires_approval_by_default
                          ? 'badge-warning'
                          : 'badge-ghost'}"
                      >
                        {(item as RequestType).requires_approval_by_default
                          ? "Yes"
                          : "No"}
                      </span>
                    </td>
                  {/if}
                  <td>
                    <span
                      class="badge badge-xs {item.is_active
                        ? 'badge-success'
                        : 'badge-error'}"
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div class="flex gap-1">
                      <button
                        class="btn btn-ghost btn-xs"
                        onclick={() => openEdit(activeTab, item)}
                        ><Pencil size={14} /></button
                      >
                      <button
                        class="btn btn-ghost btn-xs text-error"
                        onclick={() => remove(activeTab, item.id)}
                        ><Trash2 size={14} /></button
                      >
                    </div>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="6" class="text-center py-8 opacity-50"
                    >No items</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- ─── Create/Edit Modal ──────────────────────────────────── -->
{#if showModal}
  <div class="modal modal-open">
    <div class="modal-box max-w-md">
      <h3 class="text-lg font-bold">
        {editingItem ? "Edit" : "Create"}
        {getTabLabel(modalType).replace(/s$/, "")}
      </h3>
      {#if modalError}
        <div role="alert" class="alert alert-error alert-soft text-sm mt-3">
          {modalError}
        </div>
      {/if}
      <form onsubmit={save} class="flex flex-col gap-3 mt-4">
        <fieldset class="fieldset">
          <label class="label text-xs" for="ref-name">Name</label>
          <input
            id="ref-name"
            type="text"
            class="input input-bordered input-sm w-full"
            required
            bind:value={formName}
          />
        </fieldset>
        <fieldset class="fieldset">
          <label class="label text-xs" for="ref-desc">Description</label>
          <textarea
            id="ref-desc"
            class="textarea textarea-bordered textarea-sm w-full"
            rows="2"
            bind:value={formDesc}
          ></textarea>
        </fieldset>
        {#if modalType === "types"}
          <label class="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              class="checkbox checkbox-sm checkbox-warning"
              bind:checked={formApproval}
            />
            <span class="text-sm">Requires approval by default</span>
          </label>
        {/if}
        <label class="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            bind:checked={formActive}
          />
          <span class="text-sm">Active</span>
        </label>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (showModal = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary" disabled={modalLoading}>
            {#if modalLoading}<span class="loading loading-spinner loading-xs"
              ></span>{/if}
            {editingItem ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      onclick={() => (showModal = false)}
      aria-label="close"
    ></button>
  </div>
{/if}
