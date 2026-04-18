<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { api } from "../../lib/api";
  import type { Message, User } from "../../lib/types";
  import { getCurrentUser } from "../../stores/user.svelte";
  import { setHideChrome } from "../../stores/ui.svelte";
  import {
    Send,
    Search,
    Ticket,
    X,
    MessageSquare,
    Users as UsersIcon,
    ArrowLeft,
  } from "lucide-svelte";
  import { navigate } from "../../router.svelte";

  let user = $derived(getCurrentUser());
  let contacts = $state<any[]>([]);
  let selectedContactId = $state<number | null>(null);
  let messages = $state<Message[]>([]);
  let newMessage = $state("");
  let searchQuery = $state("");
  let searchResults = $state<User[]>([]);
  let loadingContacts = $state(true);
  let loadingMessages = $state(false);
  let searching = $state(false);
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
    const searchParams = new URLSearchParams(window.location.search);
    const userId = searchParams.get("userId");
    const ticketId = searchParams.get("ticketId");
    const ticketTitle = searchParams.get("ticketTitle");

    if (ticketId) {
      selectedTicketId = Number(ticketId);
      selectedTicketTitle = ticketTitle;
    }

    if (userId) {
      const contactId = Number(userId);
      if (selectedContactId !== contactId) {
        selectContact(contactId);
      }
      showChatOnMobile = true;
    }
  });

  async function selectContact(contactId: number) {
    const existing = contacts.find((c) => c.id === contactId);
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
      if (res) directoryUsers = res.filter((u) => u.id !== user?.id);
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

    interval = setInterval(async () => {
      await Promise.all([loadConversations(), loadActiveUsers()]);
      if (selectedContactId) {
        await loadMessages(selectedContactId, false);
      }
    }, 5000);
  });

  // Handle mobile full-screen transition
  $effect(() => {
    if (showChatOnMobile && window.innerWidth < 768) {
      setHideChrome(true);
    } else {
      setHideChrome(false);
    }
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
    setHideChrome(false); // Ensure chrome is restored
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
      /* handled */
    }
    loadingContacts = false;
  }

  async function loadMessages(contactId: number, showLoading = true) {
    if (selectedContactId !== contactId) {
      messages = []; // Clear current messages when switching
    }
    selectedContactId = contactId;
    showChatOnMobile = true;

    if (showLoading) loadingMessages = true;
    const oldLength = messages.length;
    try {
      const res = await api.get<Message[]>(`/messages/${contactId}`);
      if (res) {
        messages = res;
        // Scroll if new messages arrived
        if (res.length > oldLength || showLoading) {
          scrollToBottom();
        }
      }
    } catch {
      /* handled */
    }
    loadingMessages = false;
  }

  let searchTimeout: any;
  async function handleSearch() {
    clearTimeout(searchTimeout);
    if (searchQuery.length < 2) {
      searchResults = [];
      return;
    }
    searchTimeout = setTimeout(async () => {
      searching = true;
      try {
        const res = await api.get<User[]>(
          `/messages/search-contacts?q=${searchQuery}`,
        );
        if (res) searchResults = res;
      } catch {
        /* ignore */
      }
      searching = false;
    }, 300);
  }

  async function sendMessage(e?: Event) {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !selectedContactId) return;

    const content = newMessage;
    const ticketId = selectedTicketId;
    newMessage = "";
    selectedTicketId = null;
    selectedTicketTitle = null;

    // Optimistic update
    const tempId = Date.now();
    const optimisticMsg: Message = {
      id: tempId,
      content,
      created_at: new Date().toISOString(),
      is_read: false,
      sender_id: user!.id,
      receiver_id: selectedContactId,
      ticket_id: ticketId || undefined,
    };
    messages = [...messages, optimisticMsg];
    scrollToBottom();

    try {
      const res = await api.post<Message>("/messages", {
        content,
        receiver_id: selectedContactId,
        ticket_id: ticketId || undefined,
      });
      if (res) {
        // Replace optimistic message with real one
        messages = messages.map((m) => (m.id === tempId ? res : m));
        // Refresh conversations to update last message
        await loadConversations();
      }
    } catch {
      // Remove optimistic message on failure
      messages = messages.filter((m) => m.id !== tempId);
    }
  }

  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getContactName(contact: any) {
    return `${contact.first_name} ${contact.last_name}`;
  }

  function isOnline(lastActive: string | null | undefined) {
    if (!lastActive) return false;
    const diff = Date.now() - new Date(lastActive).getTime();
    return diff < 15 * 60 * 1000; // 15 minutes
  }

  let selectedContact = $derived(
    contacts.find((c) => c.id === selectedContactId) ||
      directoryUsers.find((u) => u.id === selectedContactId) ||
      searchResults.find((u) => u.id === selectedContactId),
  );

  let filteredContacts = $derived(
    searchQuery.length >= 2
      ? contacts.filter((c) =>
          getContactName(c).toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : contacts,
  );

  let filteredDirectory = $derived(
    searchQuery.length >= 2
      ? directoryUsers.filter((u) =>
          getContactName(u).toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : directoryUsers,
  );
</script>

<div
  class="flex h-full bg-base-100 md:rounded-2xl md:shadow-xl md:border border-base-300 overflow-hidden -m-4 md:m-0"
>
  <!-- Sidebar -->
  <div
    class="w-full md:w-80 border-r border-base-300 flex-col bg-base-200/50 {showChatOnMobile
      ? 'hidden md:flex'
      : 'flex'}"
  >
    <div class="p-4 border-b border-base-300 bg-base-100">
      <h2 class="text-xl font-bold mb-4">Messages</h2>

      <!-- Search -->
      <div class="join w-full mb-4">
        <div
          class="join-item flex items-center px-3 bg-base-200 border border-base-300 border-r-0"
        >
          <Search size={14} class="opacity-50" />
        </div>
        <input
          type="text"
          class="input input-bordered input-sm join-item flex-1 focus:outline-none"
          placeholder="Search..."
          bind:value={searchQuery}
          oninput={handleSearch}
        />
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 p-1 bg-base-200 rounded-lg">
        <button
          class="flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all {sidebarTab ===
          'chats'
            ? 'bg-base-100 shadow-sm text-primary'
            : 'opacity-50 hover:opacity-100'}"
          onclick={() => (sidebarTab = "chats")}
        >
          <MessageSquare size={14} /> Chats
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all {sidebarTab ===
          'users'
            ? 'bg-base-100 shadow-sm text-primary'
            : 'opacity-50 hover:opacity-100'}"
          onclick={() => (sidebarTab = "users")}
        >
          <UsersIcon size={14} /> Users
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      {#if sidebarTab === "chats"}
        {#if loadingContacts}
          <div class="flex justify-center py-10">
            <span class="loading loading-spinner text-primary"></span>
          </div>
        {:else}
          <!-- Search Results (Global) -->
          {#if searchQuery.length >= 2 && searchResults.length > 0}
            <div
              class="px-4 py-2 text-[10px] font-bold uppercase tracking-wider opacity-40"
            >
              Search Results
            </div>
            {#each searchResults as result (result.id)}
              <button
                class="w-full p-4 flex items-center gap-3 hover:bg-base-300 transition-colors border-b border-base-300/50 {selectedContactId ===
                result.id
                  ? 'bg-primary/10 border-r-4 border-r-primary'
                  : ''}"
                onclick={() => loadMessages(result.id)}
              >
                <div
                  class="avatar {isOnline(result.last_active)
                    ? 'online'
                    : 'offline'}"
                >
                  <div
                    class="w-10 h-10 rounded-full bg-neutral text-neutral-content flex items-center justify-center font-bold text-xs"
                  >
                    {result.first_name[0]}{result.last_name[0]}
                  </div>
                </div>
                <div class="flex-1 min-w-0 text-left">
                  <p class="font-bold truncate text-sm">
                    {getContactName(result)}
                  </p>
                  <p class="text-[10px] opacity-50">
                    {result.position || "Staff"}
                  </p>
                </div>
              </button>
            {/each}
            <div class="divider my-0 opacity-20"></div>
          {/if}

          <!-- Recent Conversations -->
          {#if filteredContacts.length > 0}
            <div
              class="px-4 py-2 text-[10px] font-bold uppercase tracking-wider opacity-40"
            >
              Recent
            </div>
            {#each filteredContacts as contact (contact.id)}
              <button
                class="w-full p-4 flex items-center gap-3 hover:bg-base-300 transition-colors border-b border-base-300/50 {selectedContactId ===
                contact.id
                  ? 'bg-primary/10 border-r-4 border-r-primary'
                  : ''}"
                onclick={() => loadMessages(contact.id)}
              >
                <div
                  class="avatar {isOnline(contact.last_active)
                    ? 'online'
                    : 'offline'}"
                >
                  <div
                    class="w-12 h-12 rounded-full bg-neutral text-neutral-content flex items-center justify-center font-bold"
                  >
                    {contact.first_name[0]}{contact.last_name[0]}
                  </div>
                </div>
                <div class="flex-1 min-w-0 text-left">
                  <div class="flex justify-between items-baseline">
                    <p class="font-bold truncate text-sm">
                      {getContactName(contact)}
                    </p>
                    {#if contact.last_message}
                      <span class="text-[10px] opacity-40"
                        >{formatTime(contact.last_message.created_at)}</span
                      >
                    {/if}
                  </div>
                  <p class="text-xs opacity-60 truncate">
                    {contact.last_message?.content ?? "No messages yet"}
                  </p>
                </div>
                {#if contact.last_message && !contact.last_message.is_read && contact.last_message.receiver_id === user?.id}
                  <div class="w-2 h-2 rounded-full bg-primary"></div>
                {/if}
              </button>
            {/each}
          {:else if searchQuery.length < 2}
            <!-- Empty recent state -->
            <div class="px-4 py-12 text-center opacity-30">
              <MessageSquare size={32} class="mx-auto mb-2 opacity-20" />
              <p class="text-xs">
                No recent chats. Start one from the Users tab!
              </p>
            </div>
          {/if}
        {/if}
      {:else}
        <!-- Users Directory Tab -->
        {#if loadingDirectory}
          <div class="flex justify-center py-10">
            <span class="loading loading-spinner text-primary"></span>
          </div>
        {:else}
          <div
            class="px-4 py-2 text-[10px] font-bold uppercase tracking-wider opacity-40"
          >
            Company Directory
          </div>
          {#each filteredDirectory as item (item.id)}
            <button
              class="w-full p-4 flex items-center gap-3 hover:bg-base-300 transition-colors border-b border-base-300/50 {selectedContactId ===
              item.id
                ? 'bg-primary/10 border-r-4 border-r-primary'
                : ''}"
              onclick={() => loadMessages(item.id)}
            >
              <div
                class="avatar {isOnline(item.last_active)
                  ? 'online'
                  : 'offline'}"
              >
                <div
                  class="w-10 h-10 rounded-full bg-neutral text-neutral-content flex items-center justify-center font-bold text-xs"
                >
                  {item.first_name[0]}{item.last_name[0]}
                </div>
              </div>
              <div class="flex-1 min-w-0 text-left">
                <p class="font-bold truncate text-sm">{getContactName(item)}</p>
                <p class="text-[10px] opacity-50">{item.position || "Staff"}</p>
              </div>
            </button>
          {:else}
            <div class="px-4 py-12 text-center opacity-30 text-xs">
              No users found
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>

  <!-- Chat Area -->
  <div
    class="flex-1 flex-col bg-base-100 {showChatOnMobile
      ? 'flex'
      : 'hidden md:flex'}"
  >
    {#if selectedContactId && selectedContact}
      <!-- Chat Header -->
      <div
        class="p-3 md:p-4 border-b border-base-300 flex items-center justify-between bg-base-100 z-10 shadow-sm"
      >
        <div class="flex items-center gap-2 md:gap-3">
          <button
            class="btn btn-ghost btn-sm btn-square md:hidden"
            onclick={() => (showChatOnMobile = false)}
          >
            <ArrowLeft size={20} />
          </button>
          <div
            class="avatar {isOnline(selectedContact.last_active)
              ? 'online'
              : 'offline'}"
          >
            <div
              class="w-10 h-10 rounded-full bg-neutral text-neutral-content flex items-center justify-center text-sm font-bold"
            >
              {selectedContact.first_name[0]}{selectedContact.last_name[0]}
            </div>
          </div>
          <div>
            <h3 class="font-bold leading-none">
              {getContactName(selectedContact)}
            </h3>
            <p class="text-[10px] opacity-50 mt-1 uppercase tracking-tighter">
              {isOnline(selectedContact.last_active) ? "Active Now" : "Offline"}
            </p>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div
        bind:this={messageContainer}
        class="flex-1 overflow-y-auto p-6 space-y-4 bg-base-200/20"
      >
        {#if loadingMessages && messages.length === 0}
          <div class="flex justify-center py-10">
            <span class="loading loading-spinner text-primary"></span>
          </div>
        {:else}
          {#each messages as msg (msg.id)}
            {@const isMe = Number(msg.sender_id) === Number(user?.id)}
            <div class="chat {isMe ? 'chat-end' : 'chat-start'}">
              <div class="chat-header opacity-40 text-[10px] mb-1">
                {formatTime(msg.created_at)}
              </div>
              <div
                class="chat-bubble shadow-sm {isMe
                  ? 'chat-bubble-primary'
                  : 'chat-bubble-neutral'}"
              >
                {#if msg.ticket}
                  <button
                    class="block mb-2 p-2 bg-black/10 rounded-lg text-left hover:bg-black/20 transition-colors w-full border border-white/10"
                    onclick={() =>
                      (navigate as any)(`/tickets/${msg.ticket_id}`)}
                  >
                    <div
                      class="flex items-center gap-2 text-[10px] font-bold uppercase opacity-70 mb-1"
                    >
                      <Ticket size={12} />
                      Ticket Reference
                    </div>
                    <p class="text-xs font-medium truncate">
                      {msg.ticket.title}
                    </p>
                  </button>
                {/if}
                <p class="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
              <div class="chat-footer opacity-40 mt-1">
                {#if isMe}
                  <span class="text-[10px]"
                    >{msg.is_read ? "Read" : "Sent"}</span
                  >
                {/if}
              </div>
            </div>
          {:else}
            <div
              class="h-full flex flex-col items-center justify-center opacity-30 text-center p-10"
            >
              <div
                class="w-16 h-16 bg-base-300 rounded-full flex items-center justify-center mb-4"
              >
                <MessageSquare size={32} />
              </div>
              <h4 class="font-bold">No messages here yet</h4>
              <p class="text-xs max-w-xs">
                Send a message to start the conversation with {selectedContact.first_name}.
              </p>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Input -->
      <div class="p-4 border-t border-base-300 bg-base-100">
        {#if selectedTicketId}
          <div
            class="flex items-center gap-2 mb-3 p-2 bg-primary/5 rounded-lg border border-primary/10"
          >
            <Ticket size={14} class="text-primary" />
            <span class="text-xs font-bold flex-1 truncate"
              >Referencing: {selectedTicketTitle}</span
            >
            <button
              class="btn btn-ghost btn-xs btn-circle"
              onclick={() => {
                selectedTicketId = null;
                selectedTicketTitle = null;
              }}
            >
              <X size={14} />
            </button>
          </div>
        {/if}
        <form onsubmit={sendMessage} class="join w-full">
          <input
            type="text"
            class="input input-bordered join-item flex-1 focus:outline-none"
            placeholder="Type your message..."
            bind:value={newMessage}
          />
          <button
            type="submit"
            class="btn btn-primary join-item px-6"
            disabled={!newMessage.trim()}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    {:else}
      <div
        class="flex-1 flex flex-col items-center justify-center opacity-20 p-10 text-center"
      >
        <Send size={80} class="mb-4" />
        <h3 class="text-2xl font-bold">Select a conversation</h3>
        <p>Choose someone from the list or search to start messaging</p>
      </div>
    {/if}
  </div>
</div>
