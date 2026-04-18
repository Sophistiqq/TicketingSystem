<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { route } from "../../router.svelte";
  import { getCurrentUser, hasRole } from "../../stores/user.svelte";
  import type { Ticket, TicketComment, User } from "../../lib/types";
  import StatusBadge from "../../components/StatusBadge.svelte";
  import PriorityBadge from "../../components/PriorityBadge.svelte";
  import {
    ArrowLeft,
    Send,
    Paperclip,
    Upload,
    Trash2,
    Download,
    Clock,
    Pencil,
    EyeOff,
    CircleCheckBig,
    CircleX,
    TriangleAlert,
    Star,
    ClipboardCheck,
    ChevronDown,
    ChevronUp,
    ImageIcon,
    FileText,
    Search,
  } from "lucide-svelte";

  let ticket = $state<Ticket | null>(null);
  let loading = $state(true);
  let activeTab = $state<"comments" | "attachments" | "approvals" | "history">(
    "comments",
  );
  let imagesExpanded = $state(true);

  // Comment form
  let commentText = $state("");
  let isInternal = $state(false);
  let commentLoading = $state(false);

  // Status update
  let newStatus = $state("");
  let assigneeId = $state<number | undefined>(undefined);
  let assignees = $state<User[]>([]);
  let allApprovers = $state<User[]>([]);
  let selectedApproverId = $state<number | undefined>(undefined);
  let resolutionNotes = $state("");
  let reopenReason = $state("");
  let statusLoading = $state(false);
  let statusError = $state("");

  // File upload
  let fileInput = $state<HTMLInputElement | undefined>(undefined);
  let uploadLoading = $state(false);

  // CSAT
  let csatRating = $state(0);
  let csatComment = $state("");
  let csatSubmitted = $state(false);
  let csatLoading = $state(false);

  let user = $derived(getCurrentUser());
  let isOwner = $derived(
    ticket && user ? Number(ticket.requester_id) === Number(user.id) : false,
  );
  let isAssigned = $derived(
    ticket && user ? Number(ticket.assignee_id) === Number(user.id) : false,
  );
  let isPendingApprover = $derived(
    ticket?.approvers?.some(
      (a) =>
        Number(a.approver_id) === Number(user?.id) && a.status === "pending",
    ),
  );
  let canManage = $derived(hasRole("admin", "mis") || isAssigned);
  let showCsat = $derived(
    isOwner &&
      (ticket?.status === "resolved" || ticket?.status === "closed") &&
      !ticket?.csat &&
      !csatSubmitted,
  );

  onMount(async () => {
    await loadTicket();
    // Load assignees and potential approvers for the dropdowns
    try {
      const [assigneesRes, approversRes] = await Promise.all([
        api.get<User[]>("/users/assignees"),
        api.get<User[]>("/users/approvers"),
      ]);
      if (assigneesRes) assignees = assigneesRes;
      if (approversRes) allApprovers = approversRes;
    } catch {
      /* non-critical */
    }
  });

  async function loadTicket() {
    loading = true;
    try {
      const res = await api.get<Ticket>(`/tickets/${route.params.id}`);
      if (res) {
        ticket = res;
        newStatus = res.status;
        assigneeId = res.assignee_id ?? undefined;
        if (res.csat) csatSubmitted = true;

        // Fetch comments explicitly since they have their own API
        try {
          const comments = await api.get<TicketComment[]>(
            `/comments?ticket_id=${res.id}`,
          );
          ticket.comments = comments;
        } catch {
          ticket.comments = [];
        }
      }
    } catch {
      ticket = null;
    } finally {
      loading = false;
    }
  }

  let editingCommentId = $state<number | null>(null);

  async function submitComment() {
    if (!commentText.trim() || !ticket) return;
    commentLoading = true;
    try {
      if (editingCommentId) {
        await api.put(`/comments/${editingCommentId}`, {
          content: commentText,
          is_internal: isInternal,
        });
      } else {
        await api.post("/comments/", {
          ticket_id: ticket.id,
          content: commentText,
          is_internal: isInternal,
        });
      }
      commentText = "";
      isInternal = false;
      editingCommentId = null;
      await loadTicket();
    } catch {
      /* handled */
    }
    commentLoading = false;
  }

  function editComment(comment: TicketComment) {
    editingCommentId = comment.id;
    commentText = comment.content;
    isInternal = comment.is_internal;
  }

  async function deleteComment(id: number) {
    if (!confirm("Delete this comment?")) return;
    await api.delete(`/comments/${id}`);
    await loadTicket();
  }

  async function updateTicket() {
    if (!ticket) return;
    statusLoading = true;
    statusError = "";
    try {
      const body: Record<string, unknown> = {};
      if (newStatus !== ticket.status) body.status = newStatus;
      if (assigneeId !== (ticket.assignee_id ?? undefined))
        body.assignee_id = assigneeId;
      if (resolutionNotes) body.resolution_notes = resolutionNotes;
      if (reopenReason) body.reopen_reason = reopenReason;

      await api.put(`/tickets/${ticket.id}`, body);
      resolutionNotes = "";
      reopenReason = "";
      await loadTicket();
    } catch (e: any) {
      statusError = e?.message ?? "Update failed";
    }
    statusLoading = false;
  }

  async function handleUpload() {
    if (!fileInput?.files?.length || !ticket) return;
    uploadLoading = true;
    try {
      await api.upload(ticket.id, fileInput!.files!);
      fileInput!.value = "";
      await loadTicket();
    } catch {
      /* handled */
    }
    uploadLoading = false;
  }

  async function deleteAttachment(id: number) {
    if (!confirm("Delete this attachment?")) return;
    await api.delete(`/attachments/${id}`);
    await loadTicket();
  }

  async function submitCsat() {
    if (!ticket || csatRating < 1) return;
    csatLoading = true;
    try {
      await api.post("/csat/", {
        ticket_id: ticket.id,
        rating: csatRating,
        comment: csatComment || undefined,
      });
      csatSubmitted = true;
      await loadTicket();
    } catch {
      /* handled */
    }
    csatLoading = false;
  }

  async function handleApproval(
    approvalId: number,
    decision: "approved" | "rejected",
  ) {
    const remarks = prompt(`Remarks for ${decision}:`);
    await api.post(`/approvals/${approvalId}/decide`, {
      ticket_id: ticket!.id,
      decision,
      remarks: remarks ?? undefined,
    });
    await loadTicket();
  }

  async function addApprover() {
    if (!ticket || !selectedApproverId) return;
    try {
      await api.post("/approvals/", {
        ticket_id: ticket.id,
        approver_ids: [selectedApproverId],
      });
      selectedApproverId = undefined;
      await loadTicket();
    } catch (e: any) {
      statusError = e.message;
    }
  }

  async function removeApprover(approvalId: number) {
    if (!ticket) return;
    if (!confirm("Remove this pending approver?")) return;
    try {
      await api.delete(`/approvals/${approvalId}?ticket_id=${ticket.id}`);
      await loadTicket();
    } catch (e: any) {
      statusError = e.message;
    }
  }

  function formatDate(d: string | undefined): string {
    if (!d) return "—";
    return new Date(d).toLocaleString();
  }

  function isImage(att: any) {
    if (!att || !att.file_name) return false;
    if (att.mime_type?.startsWith("image/")) return true;
    const ext = att.file_name.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext ?? "");
  }

  let imageAttachments = $derived(ticket?.attachments?.filter(isImage) ?? []);
  let otherAttachments = $derived(ticket?.attachments?.filter(a => !isImage(a)) ?? []);

  let selectedZoomImage = $state<string | null>(null);
</script>

<div class="flex flex-col gap-5 max-w-7xl mx-auto w-full px-4 lg:px-6">
  {#if loading}
    <div class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else if !ticket}
    <div class="text-center py-20 opacity-60">Ticket not found</div>
  {:else}
    <!-- ─── Urgent Notifications ───────────────────────────── -->
    {#if isPendingApprover}
      {@const myApproval = ticket?.approvers?.find(
        (a) =>
          Number(a.approver_id) === Number(user?.id) &&
          a.status === "pending",
      )}
      <div class="alert alert-primary shadow-md border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="bg-primary-content/20 p-2 rounded-lg text-primary-content">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <h3 class="font-bold">Approval Required</h3>
            <p class="text-xs opacity-90">Please review and provide your decision for this request.</p>
          </div>
        </div>
        <div class="flex gap-2 w-full sm:w-auto">
          <button
            class="btn btn-sm btn-success flex-1 sm:flex-none gap-2"
            onclick={() => myApproval && handleApproval(myApproval.id, "approved")}
          >
            <CircleCheckBig size={16} /> Approve
          </button>
          <button
            class="btn btn-sm btn-error flex-1 sm:flex-none gap-2"
            onclick={() => myApproval && handleApproval(myApproval.id, "rejected")}
          >
            <CircleX size={16} /> Reject
          </button>
        </div>
      </div>
    {/if}

    <!-- ─── Header ─────────────────────────────────────────── -->
    <div class="bg-base-100 p-4 rounded-xl shadow-sm border border-base-300">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="badge badge-outline font-mono text-[10px] h-5">#{ticket.id}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {#if ticket.sla_breached}
              <span class="badge badge-error badge-sm gap-1 animate-pulse">
                <TriangleAlert size={10} /> OVERDUE
              </span>
            {/if}
          </div>
          <h1 class="text-xl font-bold tracking-tight">{ticket.title}</h1>
          <div class="flex items-center gap-3 text-xs opacity-60">
            <div class="flex items-center gap-1.5">
              <div class="w-5 h-5 rounded-full bg-neutral flex items-center justify-center text-[9px] text-neutral-content">
                {ticket.requester ? `${ticket.requester.first_name[0]}${ticket.requester.last_name[0]}` : '?'}
              </div>
              <span>{ticket.requester ? `${ticket.requester.first_name} ${ticket.requester.last_name}` : 'Unknown'}</span>
            </div>
            <span>•</span>
            <time>{formatDate(ticket.created_at)}</time>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- ─── Main content (9/12) ───────────────────────────── -->
      <div class="lg:col-span-9 flex flex-col gap-5">
        <!-- Description -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
          <div class="card-body p-4">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-xs uppercase tracking-wider text-primary/80">Issue Details</h3>
                <div class="h-px w-24 bg-base-300/50"></div>
              </div>
            </div>
            <p class="whitespace-pre-wrap text-sm leading-relaxed mb-4">{ticket.description}</p>

            <!-- Inline Image Gallery -->
            {#if imageAttachments.length > 0}
              <div class="pt-4 border-t border-base-200">
                <div class="flex items-center gap-2 mb-3">
                   <ImageIcon size={14} class="opacity-50" />
                   <span class="text-[10px] font-bold uppercase tracking-widest opacity-50">Attachments ({imageAttachments.length})</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {#each imageAttachments as att (att.id)}
                    <button 
                      type="button"
                      class="aspect-square bg-base-200 rounded-lg overflow-hidden border border-base-300 hover:border-primary/50 transition-all group relative p-0"
                      onclick={() => selectedZoomImage = `http://localhost:3000${att.file_url}`}
                    >
                      <img 
                        src="http://localhost:3000{att.file_url}" 
                        alt={att.file_name} 
                        class="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Search size={20} class="text-white" />
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- CSAT banner -->
        {#if showCsat}
          <div class="card bg-warning/5 border border-warning/20">
            <div class="card-body p-4">
              <div class="flex items-center gap-2 mb-1">
                <Star size={16} class="text-warning" fill="currentColor" />
                <h3 class="font-bold text-sm">Rate your experience</h3>
              </div>
              <div class="flex items-center gap-4">
                <div class="flex gap-1">
                  {#each [1, 2, 3, 4, 5] as star}
                    <button
                      class="btn btn-ghost btn-xs btn-square"
                      onclick={() => (csatRating = star)}
                    >
                      <Star
                        size={18}
                        fill={star <= csatRating ? "currentColor" : "none"}
                        class={star <= csatRating ? "text-warning" : "opacity-20"}
                      />
                    </button>
                  {/each}
                </div>
                <input
                  type="text"
                  class="input input-bordered input-sm flex-1 text-xs"
                  placeholder="Feedback (optional)"
                  bind:value={csatComment}
                />
                <button
                  class="btn btn-primary btn-sm px-4 text-xs"
                  onclick={submitCsat}
                  disabled={csatRating < 1 || csatLoading}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Tabs -->
        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden">
          <div class="tabs tabs-md tabs-lifted bg-base-200/30">
            <button
              class="tab h-11"
              class:tab-active={activeTab === "comments"}
              onclick={() => (activeTab = "comments")}
            >
              Comments
              <span class="badge badge-xs badge-neutral ml-1.5">{ticket.comments?.length ?? 0}</span>
            </button>
            <button
              class="tab h-11"
              class:tab-active={activeTab === "attachments"}
              onclick={() => (activeTab = "attachments")}
            >
              Files
              <span class="badge badge-xs badge-neutral ml-1.5">{ticket.attachments?.length ?? 0}</span>
            </button>
            <button
              class="tab h-11"
              class:tab-active={activeTab === "approvals"}
              onclick={() => (activeTab = "approvals")}
            >
              Approvals
              <span class="badge badge-xs badge-neutral ml-1.5">{ticket.approvers?.length ?? 0}</span>
            </button>
          </div>

          <div class="card-body p-4">
            {#if activeTab === "comments"}
              <!-- Comment list -->
              <div class="flex flex-col gap-4 mb-6">
                {#each ticket.comments ?? [] as comment (comment.id)}
                  <div
                    class="chat {Number(comment.user_id) === Number(user?.id)
                      ? 'chat-end'
                      : 'chat-start'}"
                  >
                    <div
                      class="chat-image avatar avatar-placeholder relative group"
                    >
                      <div
                        class="bg-neutral text-neutral-content w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
                      >
                        <span class="text-[10px]"
                          >{comment.user
                            ? `${comment.user.first_name[0]}${comment.user.last_name[0]}`
                            : "?"}</span
                        >
                      </div>
                      {#if comment.user_id === user?.id || hasRole("admin", "mis")}
                        <div
                          class="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <button
                            class="btn btn-circle btn-xs btn-primary shadow-md scale-75"
                            onclick={() => editComment(comment)}
                            title="Edit"
                          >
                            <Pencil size={8} />
                          </button>
                        </div>
                      {/if}
                    </div>
                    <div
                      class="chat-header mb-0.5 text-[10px] font-medium flex items-center gap-1.5"
                    >
                      <span class="opacity-80">{comment.user
                        ? `${comment.user.first_name} ${comment.user.last_name}`
                        : "Unknown"}</span>
                      <time class="opacity-40 font-normal"
                        >{formatDate(comment.created_at)}</time
                      >
                      {#if comment.is_internal}
                        <span class="text-[9px] text-warning font-bold uppercase tracking-tighter"
                          >• INTERNAL</span
                        >
                      {/if}
                    </div>
                    <div
                      class="chat-bubble min-h-0 py-1.5 px-3 shadow-sm text-sm leading-snug {comment.is_internal
                        ? 'chat-bubble-warning'
                        : Number(comment.user_id) === Number(user?.id)
                          ? 'chat-bubble-primary'
                          : 'chat-bubble-neutral'} whitespace-pre-wrap"
                    >
                      {comment.content}
                    </div>
                  </div>
                {:else}
                  <div class="text-center py-6 opacity-30 text-xs">
                    <p>No comments yet.</p>
                  </div>
                {/each}
              </div>

              <!-- Comment input -->
              <div class="bg-base-200/30 p-3 rounded-lg border border-base-300 flex flex-col gap-2">
                <textarea
                  class="textarea textarea-bordered textarea-sm w-full text-sm bg-base-100"
                  placeholder="Reply..."
                  rows="2"
                  bind:value={commentText}
                  disabled={commentLoading}
                ></textarea>
                <div class="flex items-center justify-between">
                  {#if hasRole("admin", "mis", "approver")}
                    <label class="label cursor-pointer gap-1.5 p-0">
                      <input
                        type="checkbox"
                        class="checkbox checkbox-xs checkbox-warning"
                        bind:checked={isInternal}
                      />
                      <span class="text-[10px] font-bold uppercase opacity-60">Internal note</span>
                    </label>
                  {:else}
                    <div></div>
                  {/if}
                  <button
                    class="btn btn-primary btn-sm px-4 gap-1.5 text-xs"
                    onclick={submitComment}
                    disabled={!commentText.trim() || commentLoading}
                  >
                    {#if commentLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
                    <Send size={12} /> Send
                  </button>
                </div>
              </div>
            {:else if activeTab === "attachments"}
              <div class="flex flex-col gap-3">
                {#each ticket.attachments ?? [] as att (att.id)}
                  <div
                    class="flex items-center gap-3 bg-base-100 rounded-lg p-2 border border-base-200 hover:border-base-300 transition-colors"
                  >
                    {#if isImage(att)}
                      <ImageIcon size={14} class="opacity-40 shrink-0 text-primary" />
                    {:else}
                      <Paperclip size={14} class="opacity-40 shrink-0" />
                    {/if}
                    
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-medium truncate">
                        {att.file_name}
                      </p>
                      <p class="text-[10px] opacity-40">
                        {att.type} · {(att.file_size ?? 0) > 0 ? `${(att.file_size! / 1024).toFixed(0)} KB` : "unknown size"}
                      </p>
                    </div>
                    
                    {#if isImage(att)}
                      <button 
                        class="btn btn-ghost btn-xs h-7 w-7"
                        onclick={() => selectedZoomImage = `http://localhost:3000${att.file_url}`}
                        title="View"
                      >
                        <Search size={12} />
                      </button>
                    {/if}

                    <a
                      href="http://localhost:3000{att.file_url}"
                      target="_blank"
                      class="btn btn-ghost btn-xs h-7 w-7"
                      title="Download"
                    >
                      <Download size={12} />
                    </a>
                    
                    {#if hasRole("admin", "mis")}
                      <button
                        class="btn btn-ghost btn-xs h-7 w-7 text-error"
                        onclick={() => deleteAttachment(att.id)}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    {/if}
                  </div>
                {:else}
                  <div class="text-center py-8 opacity-30 text-xs bg-base-200/50 rounded-lg border border-dashed border-base-300">
                    <Paperclip size={24} class="mx-auto mb-2 opacity-50" />
                    <p>No files attached to this ticket.</p>
                  </div>
                {/each}

                <!-- Upload Section -->
                <div
                  class="bg-base-200/30 p-3 rounded-lg border border-base-300 flex items-center gap-2 mt-1"
                >
                  <input
                    type="file"
                    multiple
                    class="file-input file-input-bordered file-input-sm flex-1 text-xs h-8"
                    bind:this={fileInput}
                  />
                  <button
                    class="btn btn-primary btn-sm h-8 px-4 text-xs gap-1.5"
                    onclick={handleUpload}
                    disabled={uploadLoading}
                  >
                    {#if uploadLoading}
                      <span class="loading loading-spinner loading-xs"></span>
                    {/if}
                    <Upload size={12} /> Upload
                  </button>
                </div>
              </div>
            {:else if activeTab === "approvals"}
              <div class="flex flex-col gap-3">
                {#if hasRole("admin", "mis")}
                  <div class="bg-base-200/50 p-3 rounded-lg flex gap-2">
                    <select
                      class="select select-bordered select-sm flex-1 text-xs"
                      bind:value={selectedApproverId}
                    >
                      <option value={undefined}>Assign Approver...</option>
                      {#each allApprovers as a}
                        <option value={a.id}>{a.first_name} {a.last_name}</option>
                      {/each}
                    </select>
                    <button
                      class="btn btn-primary btn-sm px-4 text-xs"
                      onclick={addApprover}
                      disabled={!selectedApproverId}
                    >
                      Add
                    </button>
                  </div>
                {/if}

                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {#each ticket.approvers ?? [] as approval (approval.id)}
                    <div
                      class="flex items-center gap-3 bg-base-100 rounded-lg p-2.5 border border-base-200"
                    >
                      <div class="avatar avatar-placeholder shrink-0">
                        <div class="bg-neutral text-neutral-content w-8 h-8 rounded-full">
                          <span class="text-[10px]">{approval.approver ? `${approval.approver.first_name[0]}${approval.approver.last_name[0]}` : "?"}</span>
                        </div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold truncate">
                          {approval.approver ? `${approval.approver.first_name} ${approval.approver.last_name}` : `ID: ${approval.approver_id}`}
                        </p>
                        <span class="text-[9px] uppercase font-bold {approval.status === 'approved' ? 'text-success' : approval.status === 'rejected' ? 'text-error' : 'text-warning'}">
                          {approval.status}
                        </span>
                      </div>
                      {#if approval.status === "pending" && (approval.approver_id === user?.id || hasRole("admin", "mis"))}
                        <div class="flex gap-1 scale-90 origin-right">
                          {#if approval.approver_id === user?.id}
                            <button class="btn btn-success btn-xs btn-square" onclick={() => handleApproval(approval.id, "approved")}><CircleCheckBig size={12} /></button>
                            <button class="btn btn-error btn-xs btn-square" onclick={() => handleApproval(approval.id, "rejected")}><CircleX size={12} /></button>
                          {/if}
                          {#if hasRole("admin", "mis")}
                            <button class="btn btn-ghost btn-xs btn-square text-error" onclick={() => removeApprover(approval.id)}><Trash2 size={12} /></button>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- ─── Sidebar (3/12) ────────────────────────────────── -->
      <div class="lg:col-span-3 flex flex-col gap-5">
        <!-- Details Card -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
          <div class="card-body p-4 gap-3">
            <h3 class="font-bold text-[10px] uppercase tracking-widest text-base-content/40">Details</h3>

            <div class="space-y-3">
              <div class="flex flex-col gap-0.5">
                <span class="text-[9px] font-bold uppercase opacity-30">Requester</span>
                <span class="text-xs font-medium truncate">{ticket.requester?.first_name} {ticket.requester?.last_name}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[9px] font-bold uppercase opacity-30">Assignee</span>
                <span class="text-xs font-medium truncate {ticket.assignee ? '' : 'italic opacity-40'}">
                  {ticket.assignee ? `${ticket.assignee.first_name} ${ticket.assignee.last_name}` : "Unassigned"}
                </span>
              </div>
              <div class="grid grid-cols-1 gap-2 pt-1 border-t border-base-200">
                <div class="flex justify-between items-center text-[11px]">
                  <span class="opacity-50">Type</span>
                  <span class="font-medium">{ticket.request_type?.name ?? "—"}</span>
                </div>
                <div class="flex justify-between items-center text-[11px]">
                  <span class="opacity-50">System</span>
                  <span class="font-medium truncate max-w-[100px]">{ticket.affected_system?.name ?? "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Management Card -->
        {#if canManage}
          <div class="card bg-base-100 shadow-md border border-primary/10">
            <div class="card-body p-4 gap-3">
              <h3 class="font-bold text-[10px] uppercase tracking-widest text-primary">Management</h3>
              
              <div class="space-y-3">
                <div class="form-control">
                  <select
                    class="select select-bordered select-sm w-full text-xs h-8 min-h-0"
                    bind:value={newStatus}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div class="form-control">
                  <select
                    class="select select-bordered select-sm w-full text-xs h-8 min-h-0"
                    bind:value={assigneeId}
                  >
                    <option value={undefined}>Assignee...</option>
                    {#each assignees as a}
                      <option value={a.id}>{a.first_name} {a.last_name}</option>
                    {/each}
                  </select>
                </div>

                {#if newStatus === "resolved"}
                  <textarea
                    class="textarea textarea-bordered textarea-xs w-full"
                    rows="2"
                    placeholder="Resolution notes..."
                    bind:value={resolutionNotes}
                  ></textarea>
                {/if}

                {#if ticket.status === "closed" && newStatus === "open"}
                  <textarea
                    class="textarea textarea-bordered textarea-xs w-full"
                    rows="2"
                    placeholder="Reopen reason..."
                    bind:value={reopenReason}
                  ></textarea>
                {/if}

                <button
                  class="btn btn-primary btn-sm w-full text-xs h-8 min-h-0 shadow-sm"
                  onclick={updateTicket}
                  disabled={statusLoading}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#if selectedZoomImage}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200"
    onclick={() => selectedZoomImage = null}
  >
    <button 
      class="absolute top-4 right-4 btn btn-circle btn-ghost text-white"
      onclick={() => selectedZoomImage = null}
    >
      <CircleX size={32} />
    </button>
    <img 
      src={selectedZoomImage} 
      alt="Zoomed preview" 
      class="max-w-full max-h-full object-contain shadow-2xl animate-in zoom-in-95 duration-200"
    />
  </div>
{/if}
