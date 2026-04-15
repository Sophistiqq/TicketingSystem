# Frontend Implementation Guide — Internal Ticketing System

## Base URL
```
http://localhost:3000
```

## Authentication

All authenticated endpoints use **httpOnly cookies** (`auth_cookie`). The browser sends it automatically — no need to attach tokens manually.

### Auth Endpoints

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| `POST` | `/auth/register` | No | `{ username, password, email, first_name, last_name, position?, department_id? }` | `{ message, user }` |
| `POST` | `/auth/login` | No | `{ username, password }` | `{ message, user: { id, username, roles: [...] } }` |
| `GET` | `/auth/me` | Yes | — | `{ id, username, first_name, last_name, roles: [], department: {} }` |
| `POST` | `/auth/logout` | Yes | — | `{ message }` |

### Role System
- New users get `"user"` role automatically
- Roles: `user`, `mis`, `approver`, `admin`
- A user can have **multiple roles**
- Roles are returned in `/auth/login` and `/auth/me` responses

### Frontend Auth Flow
```ts
// 1. Login → cookie set automatically
const res = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',  // Required for cookies
  body: JSON.stringify({ username, password }),
});
const { user } = await res.json();
// user.roles → ['admin', 'mis']

// 2. Store user info in state/context
// 3. All subsequent requests: credentials: 'include'
// 4. On 401 → redirect to /login
```

---

## Feature: Reference Data (Dropdowns)

**Used by:** Ticket creation form, user management, filters

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/reference/departments` | No | List active departments |
| `GET` | `/reference/affected-systems` | No | List active systems |
| `GET` | `/reference/request-types` | No | List active request types |

**Admin-only CRUD** (for managing these dropdowns):

| Method | Endpoint | Auth | Body |
|--------|----------|------|------|
| `POST` | `/reference/departments` | Admin | `{ name, description?, is_active? }` |
| `PUT` | `/reference/departments/:id` | Admin | `{ name?, description?, is_active? }` |
| `DELETE` | `/reference/departments/:id` | Admin | — (soft delete) |
| `POST` | `/reference/affected-systems` | Admin | Same pattern |
| `PUT` | `/reference/affected-systems/:id` | Admin | Same pattern |
| `DELETE` | `/reference/affected-systems/:id` | Admin | Same pattern |
| `POST` | `/reference/request-types` | Admin | Same pattern |
| `PUT` | `/reference/request-types/:id` | Admin | Same pattern |
| `DELETE` | `/reference/request-types/:id` | Admin | Same pattern |

**Frontend:** Fetch these on app init, cache in state/store. Use for `<select>` dropdowns.

---

## Feature: User Management

**Role:** Admin only (except `/approvers` and `/assignees` which are authenticated)

| Method | Endpoint | Auth | Query Params | Response |
|--------|----------|------|-------------|----------|
| `GET` | `/users/` | Admin | `?search=&role=&department_id=&is_active=&page=&limit=` | `{ data: [...], pagination }` |
| `GET` | `/users/:id` | Admin | — | User with roles + department |
| `POST` | `/users/` | Admin | Body: `{ first_name, last_name, email, username, password, position?, department_id?, is_active? }` | Created user |
| `PUT` | `/users/:id` | Admin | Body: same fields (all optional) | Updated user |
| `DELETE` | `/users/:id` | Admin | — | 204 (soft delete) |

### Role Assignment

| Method | Endpoint | Auth | Body |
|--------|----------|------|------|
| `POST` | `/users/:id/roles` | Admin | `{ role: "admin" \| "mis" \| "approver" \| "user" }` |
| `DELETE` | `/users/:id/roles/:role` | Admin | — |

### Helper Endpoints (any authenticated user)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users/approvers` | List users with "approver" role |
| `GET` | `/users/assignees` | List users with "mis" role |

**Frontend:** User list table with search/filter, user detail modal, role badge chips.

---

## Feature: Ticket Dashboard

### List Tickets

| Method | Endpoint | Auth | Query Params |
|--------|----------|------|-------------|
| `GET` | `/tickets/` | Yes | `?status=&priority=&assignee_id=&requester_id=&affected_system_id=&request_type_id=&search=&overdue=&page=&limit=&sort=&order=` |

**Sort options:** `created_at`, `updated_at`, `priority`, `status`
**Order:** `asc`, `desc`
**Overdue filter:** `?overdue=true` → only tickets past their `due_date` that are not resolved/closed

**Access rules:**
- Regular users → see only their own tickets
- MIS/Admin/Approvers → see all tickets

### My Tickets

| Method | Endpoint | Auth | Query Params |
|--------|----------|------|-------------|
| `GET` | `/tickets/my/requested` | Yes | `?page=&limit=` |
| `GET` | `/tickets/my/assigned` | Yes | `?page=&limit=` |

### Single Ticket Detail

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tickets/:id` | Yes | Full ticket with all relations |

**Includes:** requester, assignee, request_type, affected_system, approvers, attachments, resolution_attempts, audit_logs, csat

**New ticket fields:**
- `due_date` — ISO datetime, SLA deadline
- `sla_breached` — boolean, auto-set when past due
- `breached_at` — ISO datetime, when SLA was breached
- `started_at` — when work began (open → in_progress)
- `completed_at` — when resolved/closed

### Create Ticket

| Method | Endpoint | Auth | Body |
|--------|----------|------|------|
| `POST` | `/tickets/` | Yes | `{ title, description, priority?, request_type_id?, affected_system_id?, requires_approval?, due_date? }` |

### Update Ticket

| Method | Endpoint | Auth | Body |
|--------|----------|------|------|
| `PUT` | `/tickets/:id` | Yes | `{ title?, description?, status?, priority?, assignee_id?, reopen_reason?, resolution_notes?, due_date? }` |

**Valid status transitions:**
```
open → in_progress | pending_approval | rejected
in_progress → pending_approval | resolved | open
pending_approval → in_progress (after approval)
resolved → closed
closed → open (reopen)
rejected → open | in_progress
```

### Delete Ticket

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `DELETE` | `/tickets/:id` | Admin/MIS | Soft delete (sets status=closed) |

**Frontend:** Ticket table with filters, status badges, priority icons, SLA overdue badges, detail page with tabs.

---

## Feature: SLA / Due Dates

**How it works:**
- `due_date` can be set on ticket creation or updated later
- Tickets past their `due_date` (and not resolved/closed) are auto-flagged with `sla_breached: true`
- Breach detection runs automatically on every ticket list fetch
- Set `due_date` to `null` to clear SLA and reset breach flag

**Frontend:**
- Date picker for setting deadlines on tickets
- Red "OVERDUE" badge on breached tickets
- Overdue filter button: `?overdue=true`
- Time tracking display: `started_at` → `completed_at` = resolution time

---

## Feature: File Upload

### Upload Attachments (Multipart)

| Method | Endpoint | Auth | Content-Type | Description |
|--------|----------|------|-------------|-------------|
| `GET` | `/attachments?ticket_id=N` | Yes | JSON | List attachments |
| `POST` | `/attachments/` | Yes | `multipart/form-data` | Upload file(s) |
| `GET` | `/attachments/:id` | Yes | JSON | Single attachment |
| `DELETE` | `/attachments/:id` | Admin/MIS | — | Delete |

**POST `/attachments/` — Multipart Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ticket_id` | number | Yes | Target ticket |
| `files` | File[] | Yes | One or more files |
| `type` | string | No | `approval_form`, `screenshot`, `document`, `other` |

**Response:**
```json
{
  "id": 1,
  "file_name": "1776238852978-jh7uxl81-screenshot.png",
  "file_url": "/uploads/1776238852978-jh7uxl81-screenshot.png",
  "file_size": 12345,
  "mime_type": "image/png",
  "type": "screenshot",
  "uploaded_at": "2026-04-15T07:40:52.983Z",
  "ticket_id": 9
}
```

### Serve Uploaded Files

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/uploads/:filename` | No | Direct file access |

Uploaded files are publicly accessible via URL. The `file_url` field in attachment records contains the full path.

**Frontend file upload example:**
```tsx
function FileUpload({ ticketId, onUpload }: { ticketId: number; onUpload: () => void }) {
  const handleFiles = async (files: FileList) => {
    const formData = new FormData();
    formData.append('ticket_id', ticketId.toString());
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('type', 'screenshot');

    await fetch('/attachments', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    onUpload();
  };

  return <input type="file" multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} />;
}
```

---

## Feature: Ticket Comments (Conversation Thread)

| Method | Endpoint | Auth | Body/Query | Description |
|--------|----------|------|-----------|-------------|
| `GET` | `/comments?ticket_id=N` | Yes | Query | List comments (internal notes hidden from requesters) |
| `POST` | `/comments/` | Yes | `{ ticket_id, content, is_internal? }` | Add comment |
| `GET` | `/comments/:id` | Yes | — | Single comment |
| `PUT` | `/comments/:id` | Yes | `{ content?, is_internal? }` | Edit (author only) |
| `DELETE` | `/comments/:id` | Yes | — | Delete (author or admin/MIS) |

**Access rules:**
- `is_internal: true` → visible only to staff (MIS/approver/admin)
- Requesters see only public comments
- Notifications sent to all ticket participants on new comment

**Frontend:** Comment thread at bottom of ticket detail, toggle for internal notes, edit/delete buttons for own comments.

---

## Feature: Approval Workflow

### Manage Approvers

| Method | Endpoint | Auth | Body/Query | Description |
|--------|----------|------|-----------|-------------|
| `GET` | `/approvals?ticket_id=N` | Yes | Query | List approvers for ticket |
| `POST` | `/approvals/` | Yes | `{ ticket_id, approver_ids: [id, ...] }` | Add approvers (admin/MIS) |
| `DELETE` | `/approvals/:id?ticket_id=N` | Admin/MIS | Query | Remove pending approver |

### Approver Actions

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| `POST` | `/approvals/:id/decide` | Yes | `{ ticket_id, decision: "approved" \| "rejected" \| "pending", remarks? }` | Make decision |
| `GET` | `/approvals/my/pending` | Yes | — | My pending approvals |

**Workflow:**
1. Admin/MIS adds approvers → ticket status → `pending_approval`
2. Approver calls `/approvals/:id/decide` with `approved` or `rejected`
3. If all approve → ticket → `in_progress`
4. If any rejects → ticket → `rejected`

**Frontend:** "My Approvals" page, approve/reject buttons with remarks textarea, approval status badges on tickets.

---

## Feature: Notifications

| Method | Endpoint | Auth | Query | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/notifications/` | Yes | `?unread_only=&page=&limit=` | My notifications |
| `GET` | `/notifications/unread-count` | Yes | — | Unread count (for badge) |
| `PUT` | `/notifications/:id/read` | Yes | — | Mark single as read |
| `PUT` | `/notifications/read-all` | Yes | — | Mark all as read |
| `DELETE` | `/notifications/:id` | Yes | — | Delete notification |

**Notification types:** `ticket_created`, `ticket_assigned`, `approval_requested`, `approval_decided`, `ticket_resolved`, `ticket_reopened`, `escalated`, `comment_added`

**Frontend:** Bell icon with unread badge, dropdown notification list, "mark all read" button.

---

## Feature: Audit Trail

### Per-Ticket Audit

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/audit/tickets/:ticketId` | Yes | Audit log for specific ticket |

### Global Audit (Admin/MIS)

| Method | Endpoint | Auth | Query | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/audit/` | Admin/MIS | `?ticket_id=&performed_by_id=&action=&page=&limit=` | All ticket audit logs |
| `GET` | `/audit/auth` | Admin/MIS | `?action=&performed_by_id=&page=&limit=` | Auth audit logs |

**Audit actions:**
- Ticket: `status_change`, `assignment`, `title_changed`, `description_changed`, `priority_changed`, `comment_added`, `comment_deleted`, `attachment_uploaded`, `attachment_deleted`, `approvers_added`, `approver_removed`, `approval_decision`, `csat_submitted`
- Auth: `user_registered`, `user_login`, `user_login_failed`, `user_logout`

**Frontend:** "History" tab on ticket detail, admin audit dashboard with filters.

---

## Feature: CSAT (Customer Satisfaction)

| Method | Endpoint | Auth | Body/Query | Description |
|--------|----------|------|-----------|-------------|
| `POST` | `/csat/` | Yes | `{ ticket_id, rating: 1-5, comment? }` | Submit CSAT (requester only, resolved/closed tickets) |
| `GET` | `/csat/tickets/:ticketId` | Yes | — | Get CSAT for ticket |
| `GET` | `/csat/stats` | Admin/MIS | `?agent_id=&start_date=&end_date=` | Overall CSAT stats |
| `GET` | `/csat/my/agent` | Yes | `?page=&limit=` | My CSAT as assigned agent |

**CSAT response includes:**
```json
{
  "id": 1,
  "rating": 5,
  "comment": "Quick resolution",
  "resolution_time_ms": 3600000,
  "submitted_at": "2026-04-15T07:11:16.430Z",
  "ticket_id": 7,
  "agent_id": 3
}
```

**`resolution_time_ms`** — milliseconds from `started_at` to `completed_at` on the ticket.

**Frontend:** Star rating modal after ticket closure, CSAT dashboard for admin/MIS with average and distribution chart.

---

## Frontend Page Map

| Page | Route | Endpoints Used | Roles |
|------|-------|---------------|-------|
| Login | `/login` | `POST /auth/login` | Public |
| Register | `/register` | `POST /auth/register`, `GET /reference/departments` | Public |
| Dashboard | `/` | `GET /tickets/`, `GET /notifications/unread-count` | All |
| My Tickets | `/my-tickets` | `GET /tickets/my/requested`, `GET /tickets/my/assigned` | All |
| My Approvals | `/approvals` | `GET /approvals/my/pending`, `POST /approvals/:id/decide` | Approver |
| Ticket Detail | `/tickets/:id` | `GET /tickets/:id`, `PUT /tickets/:id`, `GET /comments`, `POST /comments`, `GET /attachments`, `GET /audit/tickets/:id`, `GET /csat/tickets/:id`, `POST /csat` | All (access-controlled) |
| Create Ticket | `/tickets/new` | `POST /tickets/`, `GET /reference/*` | All |
| Users | `/admin/users` | `GET /users/`, `POST /users/`, `PUT /users/:id`, `DELETE /users/:id`, `POST /users/:id/roles`, `DELETE /users/:id/roles/:role` | Admin |
| User Detail | `/admin/users/:id` | `GET /users/:id`, role endpoints | Admin |
| Notifications | `/notifications` | `GET /notifications/`, `PUT /notifications/read-all` | All |
| Audit Log | `/admin/audit` | `GET /audit/`, `GET /audit/auth` | Admin/MIS |
| CSAT Dashboard | `/admin/csat` | `GET /csat/stats` | Admin/MIS |
| Reference Management | `/admin/settings` | `GET/POST/PUT/DELETE /reference/*` | Admin |

---

## HTTP Client Setup

```ts
// Base fetch wrapper
const api = async (path: string, options: RequestInit = {}) => {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',  // Always send cookies
    headers: {
      ...options.headers,
    },
  });

  if (res.status === 401) {
    window.location.href = '/login';
    return null;
  }

  if (res.status === 204) return null; // No content
  return res.json();
};

// File upload (multipart)
const uploadFiles = async (ticketId: number, files: FileList, type?: string) => {
  const formData = new FormData();
  formData.append('ticket_id', ticketId.toString());
  for (const file of files) {
    formData.append('files', file);
  }
  if (type) formData.append('type', type);

  const res = await fetch('/attachments', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  return res.json();
};

// Usage
const tickets = await api('/tickets/?page=1&limit=20');
await api('/tickets/1', { method: 'PUT', body: JSON.stringify({ status: 'resolved' }) });
await uploadFiles(1, fileInput.files, 'screenshot');
```

---

## Error Handling

All endpoints return consistent format:
```json
// Success
{ "message": "...", "data": ... }

// Error
{ "message": "User not found" }
```

**Common status codes:**
- `200` — Success
- `201` — Created
- `204` — No content (delete success)
- `400` — Bad request (invalid transition, missing field, no files)
- `401` — Unauthorized (no cookie, invalid token)
- `403` — Forbidden (wrong role, access denied)
- `404` — Not found
- `409` — Conflict (duplicate user, CSAT already submitted)
- `500` — Server error

---

## Pagination

All list endpoints return:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

## Cookie Configuration

The auth cookie is set server-side with:
- `httpOnly: true` — not accessible via JS
- `secure: true` in production — HTTPS only
- `sameSite: 'none'` in production, `'lax'` in dev
- `maxAge: 604800` (7 days)

**Important:** Frontend must use `credentials: 'include'` on all fetch requests.
