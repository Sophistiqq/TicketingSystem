<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import type { User, PaginatedResponse, Role, Department } from "../../lib/types";
  import Pagination from "../../components/Pagination.svelte";
  import {
    Search,
    Plus,
    Pencil,
    Trash2,
    Shield,
    X,
    UserPlus,
  } from "lucide-svelte";

  let users = $state<User[]>([]);
  let pagination = $state({ page: 1, limit: 20, total: 0, pages: 0 });
  let loading = $state(true);
  let departments = $state<Department[]>([]);

  // Filters
  let search = $state("");
  let roleFilter = $state("");
  let deptFilter = $state("");
  let activeFilter = $state("");

  // Modal state
  let showModal = $state(false);
  let editingUser = $state<User | null>(null);
  let formData = $state({
    first_name: "",
    last_name: "",
    email: "",
    username: "",
    password: "",
    position: "",
    department_id: undefined as number | undefined,
    is_active: true,
  });
  let modalError = $state("");
  let modalLoading = $state(false);

  // Role modal
  let showRoleModal = $state(false);
  let roleTarget = $state<User | null>(null);
  let newRole = $state<Role>("user");

  onMount(async () => {
    await loadUsers();
    try {
      const res = await api.get<Department[]>("/reference/departments");
      if (res) departments = res;
    } catch { /* non-critical */ }
  });

  async function loadUsers(page = 1) {
    loading = true;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    if (search) params.set("search", search);
    if (roleFilter) params.set("role", roleFilter);
    if (deptFilter) params.set("department_id", deptFilter);
    if (activeFilter) params.set("is_active", activeFilter);

    try {
      const res = await api.get<PaginatedResponse<User>>(`/users/?${params}`);
      if (res) {
        // Flatten roles if they are objects
        users = res.data.map(u => ({
          ...u,
          roles: u.roles.map(r => typeof r === 'object' ? (r as any).role : r)
        }));
        pagination = res.pagination;
      }
    } catch { /* handled */ }
    loading = false;
  }

  function openCreate() {
    editingUser = null;
    formData = { first_name: "", last_name: "", email: "", username: "", password: "", position: "", department_id: undefined, is_active: true };
    modalError = "";
    showModal = true;
  }

  function openEdit(user: User) {
    editingUser = user;
    formData = {
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      username: user.username,
      password: "",
      position: user.position ?? "",
      department_id: user.department_id ?? undefined,
      is_active: user.is_active ?? true,
    };
    modalError = "";
    showModal = true;
  }

  async function saveUser(e: Event) {
    e.preventDefault();
    modalLoading = true;
    modalError = "";
    try {
      const body: Record<string, unknown> = { ...formData };
      if (!body.password) delete body.password;
      if (!body.position) delete body.position;
      if (!body.department_id) delete body.department_id;

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, body);
      } else {
        await api.post("/users/", body);
      }
      showModal = false;
      await loadUsers(pagination.page);
    } catch (e: any) {
      modalError = e?.message ?? "Save failed";
    }
    modalLoading = false;
  }

  async function deleteUser(user: User) {
    if (!confirm(`Deactivate ${user.first_name} ${user.last_name}?`)) return;
    await api.delete(`/users/${user.id}`);
    await loadUsers(pagination.page);
  }

  function openRoles(user: User) {
    roleTarget = user;
    newRole = "user";
    showRoleModal = true;
  }

  async function addRole() {
    if (!roleTarget) return;
    try {
      await api.post(`/users/${roleTarget.id}/roles`, { role: newRole });
      showRoleModal = false;
      await loadUsers(pagination.page);
    } catch { /* handled */ }
  }

  async function removeRole(userId: number, role: string) {
    if (!confirm(`Remove role "${role}"?`)) return;
    await api.delete(`/users/${userId}/roles/${role}`);
    await loadUsers(pagination.page);
  }
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold">User Management</h1>
      <p class="text-sm opacity-60 mt-1">{pagination.total} users</p>
    </div>
    <button class="btn btn-primary gap-2" onclick={openCreate}>
      <UserPlus size={18} /> Add User
    </button>
  </div>

  <!-- Filters -->
  <div class="card bg-base-200 p-4">
    <form onsubmit={(e) => { e.preventDefault(); loadUsers(1); }} class="flex flex-wrap items-end gap-3">
      <fieldset class="fieldset flex-1 min-w-[200px]">
        <label class="label text-xs" for="user-search">Search</label>
        <div class="join w-full">
          <input id="user-search" type="text" class="input input-bordered input-sm join-item flex-1" placeholder="Name, email, username…" bind:value={search} />
          <button type="submit" class="btn btn-primary btn-sm join-item"><Search size={14} /></button>
        </div>
      </fieldset>
      <fieldset class="fieldset">
        <label class="label text-xs" for="role-filter">Role</label>
        <select id="role-filter" class="select select-bordered select-sm" bind:value={roleFilter} onchange={() => loadUsers(1)}>
          <option value="">All</option>
          <option value="admin">Admin</option>
          <option value="mis">MIS</option>
          <option value="approver">Approver</option>
          <option value="user">User</option>
        </select>
      </fieldset>
      <fieldset class="fieldset">
        <label class="label text-xs" for="active-filter">Status</label>
        <select id="active-filter" class="select select-bordered select-sm" bind:value={activeFilter} onchange={() => loadUsers(1)}>
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </fieldset>
    </form>
  </div>

  <!-- Table -->
  <div class="card bg-base-200 shadow-sm">
    <div class="card-body p-0">
      {#if loading}
        <div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Department</th>
                <th>Roles</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each users as user (user.id)}
                <tr class="hover:bg-base-300/30">
                  <td class="font-medium">{user.first_name} {user.last_name}</td>
                  <td class="font-mono text-sm opacity-70">{user.username}</td>
                  <td class="text-sm">{user.email}</td>
                  <td class="text-sm">{user.department?.name ?? "—"}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      {#each user.roles as role}
                        <span class="badge badge-xs badge-outline gap-1">
                          {role}
                          <button class="opacity-50 hover:opacity-100" onclick={() => removeRole(user.id, role)}>
                            <X size={10} />
                          </button>
                        </span>
                      {/each}
                      <button class="badge badge-xs badge-ghost" onclick={() => openRoles(user)}>
                        <Plus size={10} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <span class="badge badge-xs {user.is_active ? 'badge-success' : 'badge-error'}">
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div class="flex gap-1">
                      <button class="btn btn-ghost btn-xs" onclick={() => openEdit(user)}><Pencil size={14} /></button>
                      <button class="btn btn-ghost btn-xs text-error" onclick={() => deleteUser(user)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              {:else}
                <tr><td colspan="7" class="text-center py-8 opacity-50">No users found</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="flex justify-center p-4">
          <Pagination {pagination} onPageChange={loadUsers} />
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- ─── Create/Edit User Modal ─────────────────────────────── -->
{#if showModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-bold">{editingUser ? "Edit User" : "Create User"}</h3>
      {#if modalError}
        <div role="alert" class="alert alert-error alert-soft text-sm mt-3">{modalError}</div>
      {/if}
      <form onsubmit={saveUser} class="flex flex-col gap-3 mt-4">
        <div class="grid grid-cols-2 gap-3">
          <fieldset class="fieldset">
            <label class="label text-xs" for="edit-fname">First name</label>
            <input id="edit-fname" type="text" class="input input-bordered input-sm w-full" required bind:value={formData.first_name} />
          </fieldset>
          <fieldset class="fieldset">
            <label class="label text-xs" for="edit-lname">Last name</label>
            <input id="edit-lname" type="text" class="input input-bordered input-sm w-full" required bind:value={formData.last_name} />
          </fieldset>
        </div>
        <fieldset class="fieldset">
          <label class="label text-xs" for="edit-email">Email</label>
          <input id="edit-email" type="email" class="input input-bordered input-sm w-full" required bind:value={formData.email} />
        </fieldset>
        <fieldset class="fieldset">
          <label class="label text-xs" for="edit-user">Username</label>
          <input id="edit-user" type="text" class="input input-bordered input-sm w-full" required bind:value={formData.username} />
        </fieldset>
        <fieldset class="fieldset">
          <label class="label text-xs" for="edit-pass">Password {editingUser ? "(leave blank to keep)" : ""}</label>
          <input id="edit-pass" type="password" class="input input-bordered input-sm w-full" bind:value={formData.password} required={!editingUser} />
        </fieldset>
        <div class="grid grid-cols-2 gap-3">
          <fieldset class="fieldset">
            <label class="label text-xs" for="edit-pos">Position</label>
            <input id="edit-pos" type="text" class="input input-bordered input-sm w-full" bind:value={formData.position} />
          </fieldset>
          <fieldset class="fieldset">
            <label class="label text-xs" for="edit-dept">Department</label>
            <select id="edit-dept" class="select select-bordered select-sm w-full" bind:value={formData.department_id}>
              <option value={undefined}>— None —</option>
              {#each departments as dept}
                <option value={dept.id}>{dept.name}</option>
              {/each}
            </select>
          </fieldset>
        </div>
        <label class="label cursor-pointer justify-start gap-2">
          <input type="checkbox" class="checkbox checkbox-sm" bind:checked={formData.is_active} />
          <span class="text-sm">Active</span>
        </label>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" onclick={() => (showModal = false)}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={modalLoading}>
            {#if modalLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
            {editingUser ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
    <button class="modal-backdrop" onclick={() => (showModal = false)} aria-label="close"></button>
  </div>
{/if}

<!-- ─── Add Role Modal ─────────────────────────────────────── -->
{#if showRoleModal && roleTarget}
  <div class="modal modal-open">
    <div class="modal-box max-w-xs">
      <h3 class="text-lg font-bold">Add Role</h3>
      <p class="text-sm opacity-60 mt-1">for {roleTarget.first_name} {roleTarget.last_name}</p>
      <fieldset class="fieldset mt-4">
        <select class="select select-bordered w-full" bind:value={newRole}>
          <option value="user">User</option>
          <option value="mis">MIS</option>
          <option value="approver">Approver</option>
          <option value="admin">Admin</option>
        </select>
      </fieldset>
      <div class="modal-action">
        <button class="btn btn-ghost" onclick={() => (showRoleModal = false)}>Cancel</button>
        <button class="btn btn-primary" onclick={addRole}>
          <Shield size={14} /> Assign
        </button>
      </div>
    </div>
    <button class="modal-backdrop" onclick={() => (showRoleModal = false)} aria-label="close"></button>
  </div>
{/if}
