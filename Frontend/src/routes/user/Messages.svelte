<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { api } from "../../lib/api";
  import type { Message, User } from "../../lib/types";
  import { getCurrentUser } from "../../stores/user.svelte";
  import { fetchMessageUnreadCount } from "../../stores/messages.svelte";
  import { ws } from "../../lib/ws";
  import {
    Send,
    Ticket,
    Search,
    MessageSquare,
    Users as UsersIcon,
    ArrowLeft,
  } from "lucide-svelte";
  import { navigate } from "../../router.svelte";
  import { location } from "../../lib/location.svelte";

  let user = $derived(getCurrentUser());
  let contacts = $state<any[]>([]);
  let selectedContactId = $state<number | null>(null);
  let messages = $state<Message[]>([]);
  let newMessage = $state("");
  let searchQuery = $state("");
  let searchResults = $state<User[]>([]);
  let loadingContacts = $state(true);
  let loadingMessages = $state(false);
  let interval: any;
  let messageContainer: HTMLDivElement | null = $state(null);
  let sidebarTab = $state<"chats" | "users">("chats");
  let showChatOnMobile = $state(false);

  // Attachment for ticket
  let selectedTicketId = $state<number | null>(null);
  let selectedTicketTitle = $state<string | null>(null);

  // Directory users
  let directoryUsers = $state<User[]>([]);
  let loadingDirectory = $state(false);

  // Reactive parameters from route
  $effect(() => {
    // Svelte 5 will re-run this when location.search (our reactive getter) changes
    const searchParams = new URLSearchParams(location.search);
    const userId = searchParams.get("userId");
    const ticketId = searchParams.get("ticketId");
    const ticketTitle = searchParams.get("ticketTitle");

    if (userId) {
      selectContact(Number(userId));
    }

    if (ticketId) {
      selectedTicketId = Number(ticketId);
      selectedTicketTitle = ticketTitle;
    }
  });

  async function selectContact(contactId: number) {
    if (selectedContactId === contactId) return;

    selectedContactId = contactId;
    messages = [];
    showChatOnMobile = true;

    // Ensure we have the contact info in our arrays for the header
    const existing =
      contacts.find((c) => c.id === contactId) ||
      directoryUsers.find((u) => u.id === contactId) ||
      searchResults.find((u) => u.id === contactId);

    if (!existing) {
      try {
        const u = await api.get<User>(`/messages/contact/${contactId}`);
        if (u) {
          contacts = [{ ...u, last_message: null }, ...contacts];
        }
      } catch {
        /* ignore */
      }
    }

    await loadMessages(contactId);
  }

  let activeUsers = $state<User[]>([]);
  async function loadActiveUsers() {
    try {
      const res = await api.get<User[]>("/messages/active");
      if (res) activeUsers = res;
    } catch {
      /* ignore */
    }
  }

  async function loadDirectory() {
    loadingDirectory = true;
    try {
      // Get all active users as potential contacts (available to everyone)
      const res = await api.get<User[]>("/users/directory");
      if (res) directoryUsers = res.filter((u: User) => u.id !== user?.id);
    } catch {
      /* ignore */
    }
    loadingDirectory = false;
  }

  onMount(async () => {
    await Promise.all([
      loadConversations(),
      loadActiveUsers(),
      loadDirectory(),
    ]);
    loadingContacts = false;
    interval = setInterval(async () => {
      await loadConversations();
      await loadActiveUsers();
    }, 30000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  async function scrollToBottom() {
    await tick();
    if (messageContainer) {
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
  }

  async function loadConversations() {
    try {
      const res = await api.get<any[]>("/messages/conversations");
      if (res) contacts = res;
    } catch {
      /* ignore */
    }
  }

  async function loadMessages(contactId: number) {
    loadingMessages = true;
    try {
      const res = await api.get<Message[]>(`/messages/${contactId}`);
      if (res) messages = res;
      scrollToBottom();
    } catch {
      /* ignore */
    }
    loadingMessages = false;
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedContactId) return;

    const content = newMessage;
    newMessage = "";

    try {
      const res = await api.post<Message>("/messages", {
        content,
        receiver_id: selectedContactId,
        ticket_id: selectedTicketId || undefined,
      });
      if (res) {
        messages = [...messages, res];
        scrollToBottom();
      }
    } catch {
      newMessage = content; // restore
    }
  }

  async function searchUsers(q: string) {
    if (!q.trim()) {
      searchResults = [];
      return;
    }
    const res = await api.get<User[]>(`/users?search=${q}`);
    if (res) searchResults = res.filter((u: User) => u.id !== user?.id);
  }
</script>

<div class="flex h-[calc(100vh-4rem)] bg-base-100 border-t border-base-300">
  <!-- Conversations Sidebar -->
  <aside
    class="{showChatOnMobile && window.innerWidth < 768
      ? 'hidden'
      : 'flex'} flex-col w-full md:w-80 border-r border-base-300 bg-base-200"
  >
    <div class="p-4 border-b border-base-300">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xs font-black uppercase tracking-widest opacity-40">
          Chats
        </h2>
        <div class="tabs tabs-boxed bg-base-300 p-1">
          <button
            class="tab tab-xs {sidebarTab === 'chats' ? 'tab-active' : ''}"
            onclick={() => (sidebarTab = 'chats')}>Chats</button
          >
          <button
            class="tab tab-xs {sidebarTab === 'users' ? 'tab-active' : ''}"
            onclick={() => (sidebarTab = 'users')}>Users</button
          >
        </div>
      </div>
      <div class="join w-full">
        <div
          class="join-item flex items-center px-2 bg-base-100 border border-base-300 border-r-0"
        >
          <Search size={14} class="opacity-40" />
        </div>
        <input
          type="text"
          class="input input-bordered input-xs join-item flex-1 focus:outline-none"
          placeholder="Search..."
          bind:value={searchQuery}
          oninput={() => searchUsers(searchQuery)}
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      {#if sidebarTab === "chats"}
        {#each contacts as chat (chat.id)}
          <button
            class="w-full px-4 py-3 flex items-center gap-3 hover:bg-base-300 transition-colors {selectedContactId ===
            chat.id
              ? 'bg-base-300'
              : ''}"
            onclick={() => selectContact(chat.id)}
          >
            <div class="avatar {activeUsers.some(u => u.id === chat.id) ? 'online' : ''}">
              <div
                class="w-10 h-10 rounded-full bg-neutral flex items-center justify-center text-sm font-bold text-neutral-content"
              >
                {chat.first_name[0]}{chat.last_name[0]}
              </div>
            </div>
            <div class="flex-1 min-w-0 text-left">
              <p class="text-sm font-bold truncate">
                {chat.first_name} {chat.last_name}
              </p>
              <p class="text-xs opacity-50 truncate">
                {chat.last_message?.content || "No messages"}
              </p>
            </div>
          </button>
        {/each}
      {:else}
        {#each (searchQuery ? searchResults : directoryUsers) as user (user.id)}
          <button
            class="w-full px-4 py-3 flex items-center gap-3 hover:bg-base-300 transition-colors"
            onclick={() => selectContact(user.id)}
          >
            <div class="avatar">
              <div
                class="w-10 h-10 rounded-full bg-base-300 flex items-center justify-center text-sm font-bold"
              >
                {user.first_name[0]}{user.last_name[0]}
              </div>
            </div>
            <p class="text-sm font-bold">{user.first_name} {user.last_name}</p>
          </button>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- Chat Content -->
  <section
    class="{showChatOnMobile && window.innerWidth < 768
      ? 'flex'
      : 'hidden md:flex'} flex-1 flex-col bg-base-100"
  >
    {#if selectedContactId}
      <div class="p-4 border-b border-base-300 flex items-center gap-3">
        <button
          class="btn btn-ghost btn-sm md:hidden"
          onclick={() => (showChatOnMobile = false)}
        >
          <ArrowLeft size={16} />
        </button>
        <div class="avatar">
          <div class="w-8 h-8 rounded-full bg-primary text-primary-content flex items-center justify-center text-xs font-bold">
            {contacts.find(c => c.id === selectedContactId)?.first_name[0] || 'U'}
          </div>
        </div>
        <div>
          <h3 class="font-bold">
            {contacts.find(c => c.id === selectedContactId)?.first_name || 'User'}
          </h3>
          {#if selectedTicketTitle}
            <p class="text-xs text-primary font-medium flex items-center gap-1">
              <Ticket size={12} /> Ref: {selectedTicketTitle}
            </p>
          {/if}
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4" bind:this={messageContainer}>
        {#each messages as msg}
          <div class="chat {msg.sender_id === user?.id ? 'chat-end' : 'chat-start'}">
            <div class="chat-bubble {msg.sender_id === user?.id ? 'chat-bubble-primary' : 'chat-bubble-neutral'}">
              {msg.content}
            </div>
          </div>
        {/each}
      </div>

      <div class="p-4 border-t border-base-300 flex gap-2">
        <input
          type="text"
          class="input input-bordered flex-1"
          placeholder="Type a message..."
          bind:value={newMessage}
          onkeydown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button class="btn btn-primary" onclick={sendMessage}>
          <Send size={16} />
        </button>
      </div>
    {:else}
      <div class="flex-1 flex flex-col items-center justify-center text-base-content/40 text-center p-8">
        <MessageSquare size={80} class="mb-4" />
        <h3 class="text-2xl font-bold">Select a conversation</h3>
        <p>Choose someone from the list or search to start messaging</p>
      </div>
    {/if}
  </section>
</div>
