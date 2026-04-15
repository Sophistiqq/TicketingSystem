<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { navigate, route } from "../router.svelte";
  import { getCurrentUser, hasRole } from "../stores/user.svelte";
  import type { Ticket, TicketComment, Attachment, AuditLog, TicketApprover, User } from "../lib/types";
  import StatusBadge from "../components/StatusBadge.svelte";
  import PriorityBadge from "../components/PriorityBadge.svelte";
  import {
    ArrowLeft,
    Send,
    Paperclip,
    Upload,
    Trash2,
    Download,
    Clock,
    Pencil,
    User as UserIcon,
    Eye,
    EyeOff,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Star,
    ClipboardCheck,
  } from "lucide-svelte";

  let ticket = $state<Ticket | null>(null);
  let loading = $state(true);
  let activeTab = $state<"comments" | "attachments" | "approvals" | "history">("comments");

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
  let isOwner = $derived(ticket && user ? Number(ticket.requester_id) === Number(user.id) : false);
  let isAssigned = $derived(ticket && user ? Number(ticket.assignee_id) === Number(user.id) : false);
  let isPendingApprover = $derived(
    ticket?.approvers?.some(
      (a) => Number(a.approver_id) === Number(user?.id) && a.status === "pending"
    )
  );
  let canManage = $derived(hasRole("admin", "mis") || isAssigned);
  let showCsat = $derived(
    isOwner &&
    (ticket?.status === "resolved" || ticket?.status === "closed") &&
    !ticket?.csat &&
    !csatSubmitted
  );

  onMount(async () => {
    await loadTicket();
    // Load assignees and potential approvers for the dropdowns
    try {
      const [assigneesRes, approversRes] = await Promise.all([
        api.get<User[]>("/users/assignees"),
        api.get<User[]>("/users/approvers")
      ]);
      if (assigneesRes) assignees = assigneesRes;
      if (approversRes) allApprovers = approversRes;
    } catch { /* non-critical */ }
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
          const comments = await api.get<TicketComment[]>(`/comments?ticket_id=${res.id}`);
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
    } catch { /* handled */ }
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
      if (assigneeId !== (ticket.assignee_id ?? undefined)) body.assignee_id = assigneeId;
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
    } catch { /* handled */ }
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
    } catch { /* handled */ }
    csatLoading = false;
  }

  async function handleApproval(approvalId: number, decision: "approved" | "rejected") {
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
        approver_ids: [selectedApproverId]
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
</script>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">
  <!-- Back link -->
  <a href="/my-tickets" class="btn btn-ghost btn-sm w-fit gap-1">
    <ArrowLeft size={16} /> Back
  </a>

  {#if loading}
    <div class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else if !ticket}
    <div class="text-center py-20 opacity-60">Ticket not found</div>
  {:else}
    <!-- ─── Header ─────────────────────────────────────────── -->
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <span class="text-sm font-mono opacity-50">#{ticket.id}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {#if ticket.sla_breached}
            <span class="badge badge-error gap-1"><AlertTriangle size={12} /> OVERDUE</span>
          {/if}
        </div>
        <h1 class="text-2xl font-bold">{ticket.title}</h1>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- ─── Main content (2/3) ───────────────────────────── -->
      <div class="lg:col-span-2 flex flex-col gap-4">
        <!-- Description -->
        <div class="card bg-base-200">
          <div class="card-body p-4">
            <h3 class="font-semibold text-sm opacity-60 mb-2">Description</h3>
            <p class="whitespace-pre-wrap text-sm">{ticket.description}</p>
          </div>
        </div>

        <!-- CSAT banner -->
        {#if showCsat}
          <div class="card bg-base-200 border border-primary/20">
            <div class="card-body p-4">
              <h3 class="font-semibold">Rate this experience</h3>
              <div class="flex gap-1 my-2">
                {#each [1, 2, 3, 4, 5] as star}
                  <button
                    class="btn btn-ghost btn-sm btn-square"
                    onclick={() => (csatRating = star)}
                  >
                    <Star size={24} fill={star <= csatRating ? "currentColor" : "none"} class={star <= csatRating ? "text-warning" : "opacity-30"} />
                  </button>
                {/each}
              </div>
              <textarea
                class="textarea textarea-bordered w-full text-sm"
                placeholder="Optional feedback…"
                rows="2"
                bind:value={csatComment}
              ></textarea>
              <button class="btn btn-primary btn-sm w-fit mt-2" onclick={submitCsat} disabled={csatRating < 1 || csatLoading}>
                {#if csatLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
                Submit Rating
              </button>
            </div>
          </div>
        {/if}

        <!-- Tabs -->
        <div role="tablist" class="tabs tabs-bordered">
          <button role="tab" class="tab" class:tab-active={activeTab === "comments"} onclick={() => (activeTab = "comments")}>
            Comments ({ticket.comments?.length ?? 0})
          </button>
          <button role="tab" class="tab" class:tab-active={activeTab === "attachments"} onclick={() => (activeTab = "attachments")}>
            Attachments ({ticket.attachments?.length ?? 0})
          </button>
          <button role="tab" class="tab" class:tab-active={activeTab === "approvals"} onclick={() => (activeTab = "approvals")}>
            Approvals ({ticket.approvers?.length ?? 0})
          </button>
          <button role="tab" class="tab" class:tab-active={activeTab === "history"} onclick={() => (activeTab = "history")}>
            History
          </button>
        </div>

        <!-- Tab content -->
        <div class="card bg-base-200">
          <div class="card-body p-4">
            {#if activeTab === "comments"}
              <!-- Comment list -->
              <div class="flex flex-col gap-4 mb-4">
                {#each ticket.comments ?? [] as comment (comment.id)}
                  <div class="chat {Number(comment.user_id) === Number(user?.id) ? 'chat-end' : 'chat-start'}">
                    <div class="chat-image avatar avatar-placeholder relative group">
                      <div class="bg-neutral text-neutral-content w-8 h-8 rounded-full flex items-center justify-center">
                        <span class="text-xs">{comment.user ? `${comment.user.first_name[0]}${comment.user.last_name[0]}` : "?"}</span>
                      </div>
                      {#if comment.user_id === user?.id || hasRole("admin", "mis")}
                        <div class="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button class="btn btn-circle btn-xs btn-primary shadow-sm" onclick={() => editComment(comment)} title="Edit">
                             <Pencil size={10} />
                           </button>
                        </div>
                      {/if}
                    </div>
                    <div class="chat-header text-xs opacity-50 flex items-center gap-2">
                      {comment.user ? `${comment.user.first_name} ${comment.user.last_name}` : "Unknown"}
                      <time class="opacity-50">{formatDate(comment.created_at)}</time>
                      {#if comment.is_internal}
                        <span class="badge badge-warning badge-xs gap-1"><EyeOff size={10} /> Internal</span>
                      {/if}
                    </div>
                    <div class="chat-bubble {comment.is_internal ? 'chat-bubble-warning' : (Number(comment.user_id) === Number(user?.id) ? 'chat-bubble-primary' : 'chat-bubble-neutral')} text-sm whitespace-pre-wrap">
                      {comment.content}
                    </div>
                    <div class="chat-footer opacity-50 flex gap-1">
                      {#if comment.user_id === user?.id || hasRole("admin", "mis")}
                        <button class="btn btn-ghost btn-xs text-xs text-error" onclick={() => deleteComment(comment.id)}>Delete</button>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <p class="text-sm opacity-50 text-center py-4">No comments yet</p>
                {/each}
              </div>

              <!-- Comment input -->
              <div class="border-t border-base-300 pt-4 flex flex-col gap-2">
                <textarea
                  class="textarea textarea-bordered w-full text-sm"
                  placeholder="Write a comment…"
                  rows="3"
                  bind:value={commentText}
                  disabled={commentLoading}
                ></textarea>
                <div class="flex items-center justify-between">
                  {#if hasRole("admin", "mis", "approver")}
                    <label class="label cursor-pointer gap-2 text-sm">
                      <input type="checkbox" class="checkbox checkbox-xs checkbox-warning" bind:checked={isInternal} />
                      <span class="flex items-center gap-1"><EyeOff size={14} /> Internal note</span>
                    </label>
                  {:else}
                    <div></div>
                  {/if}
                  <button class="btn btn-primary btn-sm gap-1" onclick={submitComment} disabled={!commentText.trim() || commentLoading}>
                    {#if commentLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
                    <Send size={14} /> Send
                  </button>
                </div>
              </div>

            {:else if activeTab === "attachments"}
              <div class="flex flex-col gap-3">
                {#each ticket.attachments ?? [] as att (att.id)}
                  <div class="flex items-center gap-3 bg-base-100 rounded-lg p-3">
                    <Paperclip size={16} class="opacity-50 shrink-0" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{att.file_name}</p>
                      <p class="text-xs opacity-50">
                        {att.type} · {att.file_size ? `${(att.file_size / 1024).toFixed(1)} KB` : "unknown size"}
                      </p>
                    </div>
                    <a href="http://localhost:3000{att.file_url}" target="_blank" class="btn btn-ghost btn-xs"><Download size={14} /></a>
                    {#if hasRole("admin", "mis")}
                      <button class="btn btn-ghost btn-xs text-error" onclick={() => deleteAttachment(att.id)}><Trash2 size={14} /></button>
                    {/if}
                  </div>
                {:else}
                  <p class="text-sm opacity-50 text-center py-4">No attachments</p>
                {/each}

                <!-- Upload -->
                <div class="border-t border-base-300 pt-3 flex items-center gap-2">
                  <input type="file" multiple class="file-input file-input-bordered file-input-sm flex-1" bind:this={fileInput} />
                  <button class="btn btn-primary btn-sm gap-1" onclick={handleUpload} disabled={uploadLoading}>
                    {#if uploadLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
                    <Upload size={14} /> Upload
                  </button>
                </div>
              </div>

            {:else if activeTab === "approvals"}
              <div class="flex flex-col gap-3">
                {#each ticket.approvers ?? [] as approval (approval.id)}
                  <div class="flex items-center gap-3 bg-base-100 rounded-lg p-3">
                    <div class="avatar avatar-placeholder shrink-0">
                      <div class="bg-neutral text-neutral-content w-8 rounded-full">
                        <span class="text-xs">{approval.approver ? `${approval.approver.first_name[0]}${approval.approver.last_name[0]}` : "?"}</span>
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium">
                        {approval.approver ? `${approval.approver.first_name} ${approval.approver.last_name}` : `Approver #${approval.approver_id}`}
                      </p>
                      {#if approval.remarks}
                        <p class="text-xs opacity-60 mt-0.5">{approval.remarks}</p>
                      {/if}
                    </div>
                    <span class="badge badge-sm {approval.status === 'approved' ? 'badge-success' : approval.status === 'rejected' ? 'badge-error' : 'badge-warning'}">
                      {approval.status}
                    </span>
                    {#if approval.status === "pending"}
                      <div class="flex gap-1">
                        {#if approval.approver_id === user?.id}
                          <button class="btn btn-success btn-xs gap-1" onclick={() => handleApproval(approval.id, "approved")}><CheckCircle size={12} /> Approve</button>
                          <button class="btn btn-error btn-xs gap-1" onclick={() => handleApproval(approval.id, "rejected")}><XCircle size={12} /> Reject</button>
                        {/if}
                        {#if hasRole("admin", "mis")}
                          <button class="btn btn-ghost btn-xs text-error" onclick={() => removeApprover(approval.id)} title="Remove approver"><Trash2 size={12} /></button>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <p class="text-sm opacity-50 text-center py-4">No approvers assigned</p>
                {/each}
              </div>

            {:else if activeTab === "history"}
              <div class="flex flex-col gap-2">
                {#each ticket.audit_logs ?? [] as log (log.id)}
                  <div class="flex items-start gap-3 text-sm py-2 border-b border-base-300 last:border-0">
                    <Clock size={14} class="opacity-40 mt-0.5 shrink-0" />
                    <div class="flex-1">
                      <span class="font-medium">{log.action.replace(/_/g, ' ')}</span>
                      {#if log.old_value || log.new_value}
                        <span class="opacity-50"> · {log.old_value ?? '—'} → {log.new_value ?? '—'}</span>
                      {/if}
                      {#if log.notes}
                        <p class="text-xs opacity-50 mt-0.5">{log.notes}</p>
                      {/if}
                    </div>
                    <span class="text-xs opacity-40 shrink-0">{formatDate(log.created_at)}</span>
                  </div>
                {:else}
                  <p class="text-sm opacity-50 text-center py-4">No history</p>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- ─── Sidebar (1/3) ────────────────────────────────── -->
      <div class="flex flex-col gap-4">
        {#if isPendingApprover}
          {@const myApproval = ticket?.approvers?.find(a => Number(a.approver_id) === Number(user?.id) && a.status === "pending")}
          <div class="card bg-primary text-primary-content shadow-lg border-2 border-primary-content/20">
            <div class="card-body p-4 items-center text-center gap-2">
              <ClipboardCheck size={32} class="mb-1" />
              <h3 class="font-bold text-lg">Approval Required</h3>
              <p class="text-xs opacity-90 mb-2">You are requested to approve this ticket before work can proceed.</p>
              
              <div class="flex flex-col w-full gap-2">
                <button 
                  class="btn btn-sm bg-success hover:bg-success/80 border-none text-success-content w-full gap-2" 
                  onclick={() => myApproval && handleApproval(myApproval.id, "approved")}
                >
                  <CheckCircle size={16} /> Approve Ticket
                </button>
                <button 
                  class="btn btn-sm bg-error hover:bg-error/80 border-none text-error-content w-full gap-2" 
                  onclick={() => myApproval && handleApproval(myApproval.id, "rejected")}
                >
                  <XCircle size={16} /> Reject Ticket
                </button>
              </div>
            </div>
          </div>
        {:else if ticket.status === "pending_approval" && hasRole("approver", "admin", "mis")}
          <div class="card bg-warning text-warning-content shadow-sm">
            <div class="card-body p-4 items-center text-center gap-2">
              <Clock size={24} />
              <h3 class="font-bold text-sm">Awaiting Approval</h3>
              <p class="text-xs opacity-90">This ticket is currently waiting for assigned approvers to make a decision.</p>
              <button class="btn btn-sm btn-ghost btn-xs w-full mt-1" onclick={() => (activeTab = "approvals")}>
                See who's pending
              </button>
            </div>
          </div>
        {/if}

        <!-- Info card -->
        <div class="card bg-base-200">
          <div class="card-body p-4 gap-3">
            <h3 class="font-semibold text-sm opacity-60">Details</h3>

            <div class="flex justify-between items-center text-sm">
              <span class="opacity-60">Requester</span>
              <span class="font-medium">
                {ticket.requester ? `${ticket.requester.first_name} ${ticket.requester.last_name}` : "—"}
              </span>
            </div>

            <div class="flex justify-between items-center text-sm">
              <span class="opacity-60">Assignee</span>
              <span class="font-medium">
                {ticket.assignee ? `${ticket.assignee.first_name} ${ticket.assignee.last_name}` : "Unassigned"}
              </span>
            </div>

            <div class="flex justify-between items-center text-sm">
              <span class="opacity-60">Request Type</span>
              <span>{ticket.request_type?.name ?? "—"}</span>
            </div>

            <div class="flex justify-between items-center text-sm">
              <span class="opacity-60">System</span>
              <span>{ticket.affected_system?.name ?? "—"}</span>
            </div>

            <div class="divider my-0"></div>

            <div class="flex justify-between items-center text-sm">
              <span class="opacity-60">Created</span>
              <span class="text-xs">{formatDate(ticket.created_at)}</span>
            </div>

            {#if ticket.started_at}
              <div class="flex justify-between items-center text-sm">
                <span class="opacity-60">Started</span>
                <span class="text-xs">{formatDate(ticket.started_at)}</span>
              </div>
            {/if}

            {#if ticket.due_date}
              <div class="flex justify-between items-center text-sm">
                <span class="opacity-60">Due</span>
                <span class="text-xs {ticket.sla_breached ? 'text-error font-bold' : ''}">{formatDate(ticket.due_date)}</span>
              </div>
            {/if}

            {#if ticket.completed_at}
              <div class="flex justify-between items-center text-sm">
                <span class="opacity-60">Completed</span>
                <span class="text-xs">{formatDate(ticket.completed_at)}</span>
              </div>
            {/if}

            {#if ticket.reopen_count > 0}
              <div class="flex justify-between items-center text-sm">
                <span class="opacity-60">Reopened</span>
                <span class="badge badge-warning badge-xs">{ticket.reopen_count}×</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Actions card (staff only) -->
        {#if canManage}
          <div class="card bg-base-200">
            <div class="card-body p-4 gap-3">
              <h3 class="font-semibold text-sm opacity-60">Actions</h3>

              {#if statusError}
                <div role="alert" class="alert alert-error alert-soft text-xs p-2">{statusError}</div>
              {/if}

              <fieldset class="fieldset">
                <label class="label text-xs" for="detail-status">Status</label>
                <select id="detail-status" class="select select-bordered select-sm w-full" bind:value={newStatus}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </fieldset>

              <fieldset class="fieldset">
                <label class="label text-xs" for="detail-assignee">Assignee</label>
                <select id="detail-assignee" class="select select-bordered select-sm w-full" bind:value={assigneeId}>
                  <option value={undefined}>Unassigned</option>
                  {#each assignees as a}
                    <option value={a.id}>{a.first_name} {a.last_name}</option>
                  {/each}
                </select>
              </fieldset>

              {#if newStatus === "resolved"}
                <fieldset class="fieldset">
                  <label class="label text-xs" for="resolution-notes">Resolution Notes</label>
                  <textarea id="resolution-notes" class="textarea textarea-bordered textarea-sm w-full" rows="2" bind:value={resolutionNotes}></textarea>
                </fieldset>
              {/if}

              {#if ticket.status === "closed" && newStatus === "open"}
                <fieldset class="fieldset">
                  <label class="label text-xs" for="reopen-reason">Reopen Reason</label>
                  <textarea id="reopen-reason" class="textarea textarea-bordered textarea-sm w-full" rows="2" bind:value={reopenReason}></textarea>
                </fieldset>
              {/if}

              {#if hasRole("admin", "mis")}
                <div class="divider my-0 opacity-20"></div>
                <fieldset class="fieldset">
                  <label class="label text-xs" for="detail-add-approver">Assign Approver</label>
                  <div class="join w-full">
                    <select id="detail-add-approver" class="select select-bordered select-sm join-item flex-1" bind:value={selectedApproverId}>
                      <option value={undefined}>— Select —</option>
                      {#each allApprovers as a}
                        <option value={a.id}>{a.first_name} {a.last_name}</option>
                      {/each}
                    </select>
                    <button class="btn btn-primary btn-sm join-item" onclick={addApprover} disabled={!selectedApproverId}>Add</button>
                  </div>
                </fieldset>
              {/if}

              <button class="btn btn-primary btn-sm mt-1" onclick={updateTicket} disabled={statusLoading}>
                {#if statusLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
                Update Ticket
              </button>
            </div>
          </div>
        {/if}

        <!-- CSAT result (if already submitted) -->
        {#if ticket.csat}
          <div class="card bg-base-200">
            <div class="card-body p-4 gap-2">
              <h3 class="font-semibold text-sm opacity-60">Customer Satisfaction</h3>
              <div class="flex gap-0.5">
                {#each [1, 2, 3, 4, 5] as star}
                  <Star size={18} fill={star <= ticket.csat.rating ? "currentColor" : "none"} class={star <= ticket.csat.rating ? "text-warning" : "opacity-20"} />
                {/each}
              </div>
              {#if ticket.csat.comment}
                <p class="text-sm opacity-70 italic">"{ticket.csat.comment}"</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
