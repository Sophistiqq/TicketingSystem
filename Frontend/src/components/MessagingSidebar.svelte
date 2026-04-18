<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { api } from "../lib/api";
  import type { User } from "../lib/types";
  import { Search, MessageSquare, User as UserIcon } from "lucide-svelte";
  import { navigate } from "../router.svelte";

  let activeUsers = $state<User[]>([]);
  let loading = $state(true);
  let interval: any;

  onMount(async () => {
    await loadActiveUsers();
    interval = setInterval(loadActiveUsers, 30000); // Every 30 seconds
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  async function loadActiveUsers() {
    try {
      const res = await api.get<User[]>("/messages/active");
      if (res) activeUsers = res;
    } catch { /* handled */ }
    loading = false;
  }

  function getContactName(contact: User) {
    return `${contact.first_name} ${contact.last_name}`;
  }
</script>

<aside class="w-72 bg-base-200 border-l border-base-300 flex flex-col h-full hidden xl:flex">
  <div class="p-4 border-b border-base-300">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xs font-black uppercase tracking-widest opacity-40">Contacts</h2>
      <button class="btn btn-ghost btn-xs btn-circle" onclick={() => navigate('/messages')}>
        <MessageSquare size={14} />
      </button>
    </div>
    <div class="join w-full">
      <div class="join-item flex items-center px-2 bg-base-100 border border-base-300 border-r-0">
        <Search size={12} class="opacity-40" />
      </div>
      <input type="text" class="input input-bordered input-xs join-item flex-1 focus:outline-none" placeholder="Search..." />
    </div>
  </div>

  <div class="flex-1 overflow-y-auto py-2">
    {#if loading}
      <div class="flex justify-center py-10"><span class="loading loading-spinner loading-sm text-primary"></span></div>
    {:else}
      {#each activeUsers as contact (contact.id)}
        <a 
          href="/messages?userId={contact.id}"
          class="w-full px-4 py-2 flex items-center gap-3 hover:bg-base-300 transition-colors group text-left"
        >
          <div class="avatar online">
            <div class="w-8 h-8 rounded-full bg-neutral text-neutral-content flex items-center justify-center text-xs font-bold shadow-sm">
              {contact.first_name[0]}{contact.last_name[0]}
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-bold truncate group-hover:text-primary transition-colors">{getContactName(contact)}</p>
            <p class="text-[10px] opacity-40 truncate">{contact.position ?? 'Staff'}</p>
          </div>
        </a>
      {:else}
        <div class="px-6 py-10 text-center opacity-30">
          <p class="text-[10px] font-bold uppercase tracking-tighter">No one active now</p>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Quick Chat Footer -->
  <div class="p-4 border-t border-base-300 bg-base-300/50">
     <button 
      class="btn btn-primary btn-sm btn-block gap-2 text-[10px] font-black uppercase tracking-widest"
      onclick={() => navigate('/messages')}
    >
       <MessageSquare size={14} />
       Open Messages
     </button>
  </div>
</aside>
