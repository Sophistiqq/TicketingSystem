<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { api } from "../../lib/api";
  import type { Message, User } from "../../lib/types";
  import { getCurrentUser } from "../../stores/user.svelte";
  import { setHideChrome } from "../../stores/ui.svelte";
  import { fetchMessageUnreadCount } from "../../stores/messages.svelte";
  import { ws } from "../../lib/ws";
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
  import { location } from "../../lib/location.svelte";
  import { triggerAlert } from "../../stores/ui.svelte";

  type Contact = User & {
    position?: string | null;
    last_message?: Message | null;
  };

  let user = $derived(getCurrentUser());
  let contactMap = $state(new Map<number, Contact>());
  let activeUserIds = $state(new Set<number>());
  let selectedContactId = $state<number | null>(null);
  let messages = $state<Message[]>([]);
  // Input & Suggestions
  let newMessage = $state("");
  let ticketSuggestions = $state<any[]>([]);
  let showTicketSuggestions = $state(false);
  let suggestionDebounce: any;

  async function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const selectionStart = (e.target as HTMLInputElement).selectionStart || 0;
    const textBeforeCursor = value.slice(0, selectionStart);
    const lastHash = textBeforeCursor.lastIndexOf("#");
    
    if (lastHash !== -1) {
      const query = textBeforeCursor.slice(lastHash + 1);
      
      // Only search if there's no space after the #
      if (query.includes(' ')) {
        showTicketSuggestions = false;
        return;
      }

      clearTimeout(suggestionDebounce);
      suggestionDebounce = setTimeout(async () => {
        if (query.length >= 1) { // Lowered limit to 1 for better responsiveness
          const res = await api.get<{ data: any[] }>(`/tickets?search=${query}&limit=5`);
          ticketSuggestions = res?.data || [];
          showTicketSuggestions = ticketSuggestions.length > 0;
        } else {
          showTicketSuggestions = false;
        }
      }, 300);
    } else {
      showTicketSuggestions = false;
    }
  }

  function selectTicket(ticket: any) {
    const lastHash = newMessage.lastIndexOf("#");
    newMessage = newMessage.slice(0, lastHash + 1) + ticket.id + " ";
    showTicketSuggestions = false;
  }
  let searchQuery = $state("");
  let loadingContacts = $state(true);
  let loadingMessages = $state(false);
  let sidebarTab = $state<"chats" | "users">("chats");
  let showChatOnMobile = $state(false);
  let messageContainer: HTMLDivElement | null = $state(null);
  let interval: any;

  // Ticket attachment
  let selectedTicketId = $state<number | null>(null);
  let selectedTicketTitle = $state<string | null>(null);

  // Derived
  let selectedContact = $derived(
    selectedContactId ? contactMap.get(selectedContactId) : undefined,
  );

  let filteredContacts = $derived(() => {
    const q = searchQuery.toLowerCase();
    const all = [...contactMap.values()];
    const filtered =
      q.length >= 2
        ? all.filter((c) => getContactName(c).toLowerCase().includes(q))
        : all;

    const sorted = filtered.sort((a, b) => {
        const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0;
        const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0;
        return dateB - dateA;
    });

    return {
      chats: sorted.filter((c) => c.last_message),
      directory: sorted.filter((c) => c.id !== user?.id),
    };
  });

  // Route Params
  $effect(() => {
    const params = new URLSearchParams(location.search);
    const userId = params.get("userId");
    const ticketId = params.get("ticketId");
    const ticketTitle = params.get("ticketTitle");

    if (ticketId) {
      selectedTicketId = Number(ticketId);
      selectedTicketTitle = ticketTitle;
    }

    if (userId) {
      const contactId = Number(userId);
      if (selectedContactId !== contactId) selectContact(contactId);
      showChatOnMobile = true;
    }
  });

  // Websocket
  $effect(() => {
    if (!user) return;

    const unsubMessage = ws.onMessage((msg) => {
      if (selectedContactId === msg.sender_id) {
        if (!messages.some((m) => m.id === msg.id)) {
          messages = [...messages, msg as Message];
          scrollToBottom();
          api.get(`/messages/${msg.sender_id}`).catch(() => {});
        }
      }
      loadAll();
    });

    const unsubRead = ws.onRead((data) => {
      if (selectedContactId === data.reader_id) {
        messages = messages.map((m) =>
          m.receiver_id === data.reader_id ? { ...m, is_read: true } : m,
        );
      }
      loadAll();
    });

    return () => {
      unsubMessage();
      unsubRead();
    };
  });

  //  Mobile chrome

  $effect(() => {
    setHideChrome(showChatOnMobile && window.innerWidth < 768);
  });

  // Lifecycle

  onMount(async () => {
    await Promise.all([loadAll(), loadActiveUsers()]);
    interval = setInterval(
      () => Promise.all([loadAll(), loadActiveUsers()]),
      30000,
    );
  });

  onDestroy(() => {
    clearInterval(interval);
    setHideChrome(false);
  });

  // Data loading

  async function loadAll() {
    try {
      const [conversations, directory] = await Promise.all([
        api.get<any[]>("/messages/conversations"),
        api.get<any[]>("/users/directory"),
      ]);

      const map = new Map<number, Contact>();

      // Directory is the base (has position field, includes everyone)
      for (const u of directory ?? []) map.set(u.id, u);

      // Conversations enrich matching entries with last_message
      for (const c of conversations ?? []) {
        map.set(c.id, { ...map.get(c.id), ...c });
      }

      contactMap = map;
    } catch {
      /* handled */
    }
    loadingContacts = false;
  }

  async function loadActiveUsers() {
    try {
      const res = await api.get<User[]>("/messages/active");
      if (res) activeUserIds = new Set(res.map((u: any) => u.id));
    } catch {
      /* ignore */
    }
  }

  async function loadMessages(contactId: number) {
    if (selectedContactId !== contactId) messages = [];
    selectedContactId = contactId;
    showChatOnMobile = true;
    loadingMessages = true;

    try {
      const res = await api.get<Message[]>(`/messages/${contactId}`);
      if (res) {
        messages = res;
        scrollToBottom();
        fetchMessageUnreadCount();
      }
    } catch {
      /* handled */
    }
    loadingMessages = false;
  }

  // Actions

  // Directory always has everyone - no need to fetch unknown contacts
  async function selectContact(contactId: number) {
    await loadMessages(contactId);
  }

  async function sendMessage(e?: Event) {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedContactId) return;

    const content = newMessage;
    const ticketId = selectedTicketId;
    newMessage = "";
    selectedTicketId = null;
    selectedTicketTitle = null;

    const tempId = Date.now();
    const optimisticMsg: Message = {
      id: tempId,
      content,
      created_at: new Date().toISOString(),
      is_read: false,
      sender_id: user!.id,
      receiver_id: selectedContactId,
      ticket_id: ticketId ?? undefined,
    };
    messages = [...messages, optimisticMsg];
    scrollToBottom();

    try {
      const res = await api.post<Message>("/messages", {
        content,
        receiver_id: selectedContactId,
        ticket_id: ticketId ?? undefined,
      });
      if (res) {
        messages = messages.map((m) => (m.id === tempId ? res : m));
        await loadAll();
      }
    } catch {
      messages = messages.filter((m) => m.id !== tempId);
      newMessage = content;
    }
  }

  //  Helpers

  async function scrollToBottom() {
    await tick();
    if (messageContainer)
      messageContainer.scrollTop = messageContainer.scrollHeight;
  }

  // Ticket Reference Helper
  const ticketCache = new Map<number, { id: number; title: string }>();
  async function getTicketPreview(id: number) {
    if (ticketCache.has(id)) return ticketCache.get(id);
    try {
      const res = await api.get<{ id: number; title: string }>(`/tickets/${id}/preview`, { suppressAlert: true });
      if (res) {
        ticketCache.set(id, res);
        return res;
      }
      return null;
    } catch (e: any) {
      return null;
    }
  }

  // Render message with references
  function renderMessage(content: string) {
    const parts = content.split(/(#\d+)/g);
    return parts.map(part => {
      const match = part.match(/#(\d+)/);
      if (match) {
        return { type: 'potential_ticket', id: Number(match[1]), original: part };
      }
      return { type: 'text', content: part };
    });
  }

  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getContactName(c: Partial<Contact>) {
    return `${c.first_name} ${c.last_name}`;
  }

  function isOnline(id: number) {
    return activeUserIds.has(id);
  }
</script>

<div
  class="flex flex-1 h-full min-h-0 bg-base-100 md:rounded-2xl md:shadow-xl md:border border-base-300 overflow-hidden -m-4 md:m-0"
>
  <!-- Sidebar -->
  <div
    class="w-full md:w-80 border-r border-base-300 flex flex-col bg-base-200/50 {showChatOnMobile
      ? 'hidden md:flex'
      : 'flex'}"
  >
    <div class="p-4 border-b border-base-300 bg-base-100">
      <h2 class="text-xl font-bold mb-4">Messages</h2>

      <!-- Search (client-side only) -->
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
      {#if loadingContacts}
        <div class="flex justify-center py-10">
          <span class="loading loading-spinner text-primary"></span>
        </div>
      {:else if sidebarTab === "chats"}
        {#if filteredContacts().chats.length > 0}
          <div
            class="px-4 py-2 text-[10px] font-bold uppercase tracking-wider opacity-40"
          >
            Recent
          </div>
          {#each filteredContacts().chats as contact (contact.id)}
            <button
              class="w-full p-4 flex items-center gap-3 hover:bg-base-300 transition-colors border-b border-base-300/50 {selectedContactId ===
              contact.id
                ? 'bg-primary/10 border-r-4 border-r-primary'
                : ''}"
              onclick={() => selectContact(contact.id)}
            >
              <div class="avatar {isOnline(contact.id) ? 'online' : 'offline'}">
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
        {:else}
          <div class="px-4 py-12 text-center opacity-30">
            <MessageSquare size={32} class="mx-auto mb-2 opacity-20" />
            <p class="text-xs">
              No recent chats. Start one from the Users tab!
            </p>
          </div>
        {/if}
      {:else}
        <!-- Users Directory Tab -->
        <div
          class="px-4 py-2 text-[10px] font-bold uppercase tracking-wider opacity-40"
        >
          Company Directory
        </div>
        {#each filteredContacts().directory as item (item.id)}
          <button
            class="w-full p-4 flex items-center gap-3 hover:bg-base-300 transition-colors border-b border-base-300/50 {selectedContactId ===
            item.id
              ? 'bg-primary/10 border-r-4 border-r-primary'
              : ''}"
            onclick={() => selectContact(item.id)}
          >
            <div class="avatar {isOnline(item.id) ? 'online' : 'offline'}">
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
    </div>
  </div>

  <!-- Chat Area -->
  <div
    class="flex-1 flex flex-col min-h-0 bg-base-100 {showChatOnMobile
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
            class="avatar {isOnline(selectedContact.id) ? 'online' : 'offline'}"
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
              {isOnline(selectedContact.id) ? "Active Now" : "Offline"}
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
                <div class="text-sm whitespace-pre-wrap">
                  {#each renderMessage(msg.content) as segment}
                    {#if segment.type === 'text'}
                      {segment.content}
                    {:else}
                      {#if segment.id !== undefined}
                        {#await getTicketPreview(segment.id)}
                          <span class="loading loading-spinner loading-xs"></span>
                        {:then ticket}
                          {#if ticket}
                            <button
                              class="font-bold hover:underline {isMe ? 'text-primary-content' : 'text-primary'}"
                              onclick={() => (navigate as any)(`/tickets/${segment.id}`)}
                            >
                              #{segment.id} {ticket.title}
                            </button>
                          {:else}
                            {segment.original}
                          {/if}
                        {/await}
                      {:else}
                        {segment.original}
                      {/if}
                    {/if}
                  {/each}
                </div>
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
        <form onsubmit={sendMessage} class="join w-full relative">
          <!-- Suggestion Popup -->
          {#if showTicketSuggestions}
            <div class="absolute bottom-full left-0 w-full mb-2 bg-base-100 border border-base-300 rounded-lg shadow-xl z-20 overflow-hidden">
              {#each ticketSuggestions as ticket}
                <button
                  type="button"
                  class="w-full text-left p-3 hover:bg-base-200 border-b border-base-300 last:border-b-0 text-sm flex items-center gap-2"
                  onclick={() => selectTicket(ticket)}
                >
                  <Ticket size={14} class="opacity-50" />
                  <span class="font-bold">#{ticket.id}</span>
                  <span class="truncate">{ticket.title}</span>
                </button>
              {/each}
            </div>
          {/if}
          <input
            type="text"
            class="input input-bordered join-item flex-1 focus:outline-none"
            placeholder="Type your message... use # to reference tickets"
            bind:value={newMessage}
            oninput={handleInput}
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
