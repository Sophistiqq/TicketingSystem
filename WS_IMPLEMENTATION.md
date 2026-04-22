# WebSocket Implementation Guide
### Real-time Features for the Internal Ticketing System
> Stack: Bun + ElysiaJS + Prisma (SQLite)

---

## Table of Contents
1. [Overview](#overview)
2. [How ElysiaJS WebSocket Works](#how-elysiajs-websocket-works)
3. [Architecture Design](#architecture-design)
4. [Implementation](#implementation)
   - [Connection Manager](#1-connection-manager)
   - [WebSocket Route](#2-websocket-route)
   - [Message Protocol](#3-message-protocol)
   - [Integration with Existing Routes](#4-integration-with-existing-routes)
5. [Event Reference](#event-reference)
6. [Client-Side Usage](#client-side-usage)
7. [Security Considerations](#security-considerations)
8. [Caveats & Known Limitations](#caveats--known-limitations)

---

## Overview

ElysiaJS has **built-in WebSocket support** via Bun's native `uWebSocket` implementation - no extra package needed. You just call `.ws()` on your Elysia app instance. This guide covers wiring it into the existing ticketing system to power:

- **Live notifications** - pushed immediately instead of polled
- **Real-time messaging** - existing `/messages` routes become instant
- **Ticket activity feed** - status changes, comments, assignments broadcast live
- **Online presence** - who's currently connected

---

## How ElysiaJS WebSocket Works

### Key Points

- WebSocket in Elysia is **built-in** as of v1.x. The old `@elysiajs/websocket` package is deprecated and should **not** be used (last release was over a year ago).
- It uses **Bun's `uWebSocket`** under the hood - one of the fastest WebSocket implementations available.
- `.ws()` routes support the **same schema validation, hooks, and middleware** as HTTP routes.
- Broadcasting uses `app.server?.publish(topic, data)` - a pub/sub system built into Bun.
- Each WebSocket connection has a unique `ws.id` and access to the full request `Context` via `ws.data`.

### Lifecycle Callbacks

```
open(ws)        fired when client connects
message(ws, m)  fired on each incoming message
close(ws)       fired when client disconnects
drain(ws)       fired when backpressure clears (safe to send again)
```

### Pub/Sub (Topics)

Bun's WebSocket has a built-in pub/sub system:

```ts
ws.subscribe('topic-name')   // subscribe this connection to a topic
ws.publish('topic-name', msg) // send to all subscribers of a topic
app.server?.publish('topic', msg) // broadcast from outside a ws handler
```

This is how you broadcast to a ticket's participants, a user's personal channel, or all connected admins.

---

## Architecture Design

### Connection Model

```
Client connects to /ws?token=<jwt>
         ³
         
   Auth validated (beforeHandle)
         ³
         
   User subscribed to personal channel: "user:{userId}"
   User subscribed to role channels:    "role:mis", "role:admin", etc.
         ³
         
   On ticket event  publish to relevant channels
```

### Topic Channels

| Channel | Who subscribes | Used for |
|---|---|---|
| `user:{id}` | The user themselves | Personal notifications, DMs |
| `role:mis` | All MIS staff | New tickets, assignments |
| `role:admin` | All admins | System-wide events |
| `ticket:{id}` | All participants of a ticket | Status changes, new comments |

---

## Implementation

### File Structure Addition

```
src/
ÃÄÄ ws/
³   ÃÄÄ connectionManager.ts    tracks active connections
³   ÃÄÄ wsHandler.ts            the .ws() route definition
³   ÀÄÄ broadcaster.ts          helper to push events from HTTP routes
ÀÄÄ index.ts                    mount the WS route here
```

---

### 1. Connection Manager

**`src/ws/connectionManager.ts`**

Tracks which `userId` maps to which WebSocket connections (a user can have multiple tabs open).

```ts
import type { ServerWebSocket } from 'bun'

interface WSData {
  userId: number
  roles: string[]
}

// Map of userId  Set of ws instances
const connections = new Map<number, Set<ServerWebSocket<any>>>()

export const connectionManager = {
  add(userId: number, ws: ServerWebSocket<any>) {
    if (!connections.has(userId)) {
      connections.set(userId, new Set())
    }
    connections.get(userId)!.add(ws)
  },

  remove(userId: number, ws: ServerWebSocket<any>) {
    connections.get(userId)?.delete(ws)
    if (connections.get(userId)?.size === 0) {
      connections.delete(userId)
    }
  },

  isOnline(userId: number): boolean {
    return (connections.get(userId)?.size ?? 0) > 0
  },

  getOnlineUserIds(): number[] {
    return Array.from(connections.keys())
  },

  count(): number {
    return connections.size
  }
}
```

---

### 2. WebSocket Route

**`src/ws/wsHandler.ts`**

```ts
import { Elysia, t } from 'elysia'
import { validator } from '../plugins/authValidator'
import { connectionManager } from './connectionManager'
import { prisma } from '../../lib/prisma'

export const wsHandler = new Elysia()
  .use(validator)
  .ws('/ws', {
    // ÄÄ Validate the query string (JWT token passed as ?token=xxx) ÄÄ
    query: t.Object({
      token: t.String()
    }),

    // ÄÄ Auth: runs before the HTTPWS upgrade ÄÄ
    async beforeHandle({ query, jwt_token, status }) {
      const token = await jwt_token.verify(query.token)
      if (!token) return status(401)
    },

    // ÄÄ On connect ÄÄ
    async open(ws) {
      const token = await (ws.data as any).jwt_token.verify(
        (ws.data as any).query.token
      )
      if (!token) return ws.close()

      const userId = Number(token.sub)
      const roles = token.roles as string[]

      // Store on ws.data for use in message/close
      ;(ws.data as any).userId = userId
      ;(ws.data as any).userRoles = roles

      // Subscribe to personal channel
      ws.subscribe(`user:${userId}`)

      // Subscribe to role channels
      for (const role of roles) {
        ws.subscribe(`role:${role}`)
      }

      // Track connection
      connectionManager.add(userId, ws.raw)

      // Update last_active
      prisma.user.update({
        where: { id: userId },
        data: { last_active: new Date() }
      }).catch(console.error)

      // Confirm to the client
      ws.send(JSON.stringify({
        type: 'connected',
        payload: { userId, message: 'WebSocket connected' }
      }))

      console.log(`[WS] User ${userId} connected. Total: ${connectionManager.count()}`)
    },

    // ÄÄ On message ÄÄ
    async message(ws, rawMessage) {
      const userId = (ws.data as any).userId as number
      if (!userId) return

      let parsed: { type: string; payload?: any }
      try {
        parsed = typeof rawMessage === 'string'
          ? JSON.parse(rawMessage)
          : rawMessage
      } catch {
        ws.send(JSON.stringify({ type: 'error', payload: 'Invalid JSON' }))
        return
      }

      switch (parsed.type) {
        // Client subscribes to a specific ticket's live feed
        case 'subscribe_ticket': {
          const ticketId = parsed.payload?.ticket_id
          if (!ticketId) break

          // Verify user has access to this ticket before subscribing
          const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { approvers: true }
          })
          if (!ticket) break

          const roles = (ws.data as any).userRoles as string[]
          const canAccess =
            roles.includes('admin') || roles.includes('mis') ||
            ticket.requester_id === userId ||
            ticket.assignee_id === userId ||
            ticket.approvers.some(a => a.approver_id === userId)

          if (canAccess) {
            ws.subscribe(`ticket:${ticketId}`)
            ws.send(JSON.stringify({
              type: 'subscribed',
              payload: { ticket_id: ticketId }
            }))
          }
          break
        }

        // Client unsubscribes from a ticket feed
        case 'unsubscribe_ticket': {
          const ticketId = parsed.payload?.ticket_id
          if (ticketId) {
            ws.unsubscribe(`ticket:${ticketId}`)
          }
          break
        }

        // Ping/heartbeat
        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', payload: Date.now() }))
          break
        }

        default:
          ws.send(JSON.stringify({ type: 'error', payload: `Unknown event type: ${parsed.type}` }))
      }
    },

    // ÄÄ On disconnect ÄÄ
    close(ws) {
      const userId = (ws.data as any).userId as number
      if (userId) {
        connectionManager.remove(userId, ws.raw)
        console.log(`[WS] User ${userId} disconnected. Total: ${connectionManager.count()}`)
      }
    }
  })
```

---

### 3. Message Protocol

All messages (client  server and server  client) follow this JSON envelope:

```ts
interface WSMessage {
  type: string       // event name
  payload: any       // event data
}
```

#### Client  Server Events

| `type` | `payload` | Description |
|---|---|---|
| `ping` | - | Heartbeat |
| `subscribe_ticket` | `{ ticket_id: number }` | Start receiving live updates for a ticket |
| `unsubscribe_ticket` | `{ ticket_id: number }` | Stop receiving updates for a ticket |

#### Server  Client Events

| `type` | `payload` | Description |
|---|---|---|
| `connected` | `{ userId }` | Sent on successful connection |
| `pong` | `timestamp` | Response to ping |
| `subscribed` | `{ ticket_id }` | Confirmed ticket subscription |
| `notification` | `{ id, type, message, ticket? }` | New notification pushed live |
| `ticket_updated` | `{ ticket_id, status, field, oldValue, newValue }` | Ticket field changed |
| `comment_added` | `{ ticket_id, comment }` | New comment on a subscribed ticket |
| `message_received` | `{ from, content, ticket_id? }` | New direct message |
| `error` | `string` | Error message |

---

### 4. Broadcaster

**`src/ws/broadcaster.ts`**

This is the bridge between your HTTP routes and the WebSocket layer. Import this in your route files to push live events.

```ts
import type { Elysia } from 'elysia'

// Hold a reference to the Elysia app so we can use app.server?.publish
let _app: Elysia | null = null

export function registerApp(app: Elysia) {
  _app = app
}

function publish(topic: string, type: string, payload: any) {
  if (!_app?.server) return
  _app.server.publish(topic, JSON.stringify({ type, payload }))
}

// ÄÄ Public broadcasting helpers ÄÄ

export const broadcaster = {
  /** Push a notification to a specific user */
  notifyUser(userId: number, notification: {
    id: number
    type: string
    message: string
    ticket_id?: number | null
  }) {
    publish(`user:${userId}`, 'notification', notification)
  },

  /** Broadcast a ticket update to all subscribers of that ticket */
  ticketUpdated(ticketId: number, data: {
    field: string
    old_value?: string | null
    new_value?: string | null
    status?: string
    updated_by?: string
  }) {
    publish(`ticket:${ticketId}`, 'ticket_updated', { ticket_id: ticketId, ...data })
  },

  /** Push a new comment to all ticket subscribers */
  commentAdded(ticketId: number, comment: {
    id: number
    content: string
    is_internal: boolean
    user: { id: number; first_name: string; last_name: string }
    created_at: Date
  }) {
    publish(`ticket:${ticketId}`, 'comment_added', { ticket_id: ticketId, comment })
  },

  /** Push a direct message to a user */
  messageSent(receiverId: number, message: {
    id: number
    content: string
    sender: { id: number; first_name: string; last_name: string }
    ticket_id?: number | null
    created_at: Date
  }) {
    publish(`user:${receiverId}`, 'message_received', message)
  },

  /** Notify all MIS staff */
  notifyMIS(type: string, payload: any) {
    publish('role:mis', type, payload)
  },

  /** Notify all admins */
  notifyAdmins(type: string, payload: any) {
    publish('role:admin', type, payload)
  }
}
```

---

### 5. Integration with Existing Routes

#### Mount WebSocket in `src/index.ts`

```ts
import { Elysia } from 'elysia'
import { wsHandler } from './ws/wsHandler'
import { registerApp } from './ws/broadcaster'
// ... other imports

const app = new Elysia()
  .use(cors())
  .use(swagger())
  .use(wsHandler)        //  Add this
  .use(auth)
  // ... rest of routes
  .listen(PORT)

registerApp(app)          //  Add this - lets broadcaster use app.server.publish
```

#### Update `src/routes/tickets.ts`

In the `PUT /:id` handler, after updating the ticket, add a broadcast:

```ts
import { broadcaster } from '../ws/broadcaster'

// After: const updated = await prisma.ticket.update(...)

// Broadcast ticket update to subscribers
broadcaster.ticketUpdated(params.id, {
  field: 'status',
  old_value: ticket.status,
  new_value: body.status ?? ticket.status,
  updated_by: `User #${user}`
})
```

#### Update `src/routes/comments.ts`

In the `POST /` handler, after creating the comment, add:

```ts
import { broadcaster } from '../ws/broadcaster'

// After: const comment = await prisma.ticketComment.create(...)

// Don't broadcast internal notes to the ticket channel
// (requesters might be subscribed there)
if (!comment.is_internal) {
  broadcaster.commentAdded(body.ticket_id, {
    id: comment.id,
    content: comment.content,
    is_internal: comment.is_internal,
    user: comment.user,
    created_at: comment.created_at
  })
}
```

#### Update `src/routes/messages.ts`

In the `POST /` handler, after creating the message, add:

```ts
import { broadcaster } from '../ws/broadcaster'

// After: const message = await prisma.message.create(...)

broadcaster.messageSent(body.receiver_id, {
  id: message.id,
  content: message.content,
  sender: message.sender,
  ticket_id: message.ticket_id ?? null,
  created_at: message.created_at
})
```

#### Update `src/routes/notifications.ts` (or wherever notifications are created)

Create a shared `createNotification` helper that also pushes live:

```ts
import { broadcaster } from '../ws/broadcaster'
import { prisma } from '../../lib/prisma'

export async function createAndPushNotification(
  userId: number,
  ticketId: number | null,
  type: string,
  message: string
) {
  const notification = await prisma.notification.create({
    data: {
      user_id: userId,
      ticket_id: ticketId,
      type: type as any,
      message
    }
  })

  // Push live
  broadcaster.notifyUser(userId, {
    id: notification.id,
    type: notification.type,
    message: notification.message,
    ticket_id: notification.ticket_id
  })

  return notification
}
```

Then replace all `prisma.notification.create(...)` calls in `tickets.ts`, `approvals.ts`, and `comments.ts` with `createAndPushNotification(...)`.

---

## Event Reference

### Full Server  Client Payload Shapes

```ts
// notification
{
  type: 'notification',
  payload: {
    id: number
    type: 'ticket_created' | 'ticket_assigned' | 'approval_requested' | ...
    message: string
    ticket_id?: number
  }
}

// ticket_updated
{
  type: 'ticket_updated',
  payload: {
    ticket_id: number
    field: string         // 'status', 'priority', 'assignee', etc.
    old_value: string | null
    new_value: string | null
    updated_by: string
  }
}

// comment_added
{
  type: 'comment_added',
  payload: {
    ticket_id: number
    comment: {
      id: number
      content: string
      is_internal: boolean
      user: { id: number; first_name: string; last_name: string }
      created_at: string
    }
  }
}

// message_received
{
  type: 'message_received',
  payload: {
    id: number
    content: string
    sender: { id: number; first_name: string; last_name: string }
    ticket_id?: number | null
    created_at: string
  }
}
```

---

## Client-Side Usage (Svelte 5)

> All examples use **Svelte 5 runes** (`$state`, `$derived`, `$effect`). No Svelte 4 stores (`writable`) are used.

### File Structure (Frontend)

```
src/
ÃÄÄ lib/
³   ÃÄÄ ws/
³   ³   ÃÄÄ websocket.svelte.ts      core store (connect here)
³   ³   ÃÄÄ types.ts                 shared WS message types
³   ³   ÀÄÄ index.ts                 re-exports
³   ÀÄÄ api.ts                       fetch helpers (ws-token call)
ÀÄÄ components/
    ÃÄÄ NotificationBell.svelte      example consumer
    ÀÄÄ TicketDetail.svelte          example consumer
```

---

### Types

**`src/lib/ws/types.ts`**

```ts
export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface WSNotification {
  id: number
  type: string
  message: string
  ticket_id?: number | null
}

export interface WSTicketUpdate {
  ticket_id: number
  field: string
  old_value: string | null
  new_value: string | null
  updated_by: string
}

export interface WSComment {
  id: number
  content: string
  is_internal: boolean
  user: { id: number; first_name: string; last_name: string }
  created_at: string
}

export interface WSMessage {
  id: number
  content: string
  sender: { id: number; first_name: string; last_name: string }
  ticket_id?: number | null
  created_at: string
}

export interface WSEnvelope {
  type: 'connected' | 'pong' | 'subscribed' | 'notification' |
        'ticket_updated' | 'comment_added' | 'message_received' | 'error'
  payload: any
}
```

---

### Core WebSocket Store

**`src/lib/ws/websocket.svelte.ts`**

This is a **Svelte 5 rune-based class store**. Instantiate it once (singleton), import it anywhere.

```ts
import type {
  WSStatus, WSNotification, WSTicketUpdate,
  WSComment, WSMessage, WSEnvelope
} from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const WS_BASE  = API_BASE.replace(/^http/, 'ws')

class TicketingWS {
  // ÄÄ Reactive state (Svelte 5 runes) ÄÄ
  status = $state<WSStatus>('disconnected')
  notifications = $state<WSNotification[]>([])
  messages      = $state<WSMessage[]>([])
  lastTicketUpdate = $state<WSTicketUpdate | null>(null)
  lastComment      = $state<WSComment & { ticket_id: number } | null>(null)

  unreadNotifications = $derived(
    this.notifications.filter(n => true).length  // adjust with read tracking
  )

  // ÄÄ Internal ÄÄ
  #ws: WebSocket | null = null
  #pingInterval: ReturnType<typeof setInterval> | null = null
  #reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  #reconnectAttempts = 0
  #maxReconnectAttempts = 5
  #token: string | null = null

  // Per-event callbacks - components register these
  #ticketListeners = new Map<number, Set<(e: WSTicketUpdate) => void>>()
  #commentListeners = new Map<number, Set<(e: WSComment) => void>>()

  // ÄÄ Public API ÄÄ

  /** Call after login. Fetches a short-lived WS token then connects. */
  async connect() {
    if (this.status === 'connected' || this.status === 'connecting') return
    this.status = 'connecting'

    try {
      // Fetch a short-lived token from the backend (reads httpOnly cookie)
      const res = await fetch(`${API_BASE}/auth/ws-token`, {
        credentials: 'include'  // sends the httpOnly auth cookie
      })
      if (!res.ok) throw new Error('Failed to get WS token')
      const { token } = await res.json()
      this.#token = token
      this.#open()
    } catch (err) {
      console.error('[WS] Token fetch failed:', err)
      this.status = 'error'
    }
  }

  /** Gracefully close the connection (e.g. on logout). */
  disconnect() {
    this.#clearTimers()
    this.#reconnectAttempts = this.#maxReconnectAttempts // prevent auto-reconnect
    this.#ws?.close()
    this.#ws = null
    this.status = 'disconnected'
  }

  /** Subscribe to a ticket's live feed (status, comments). */
  subscribeTicket(ticketId: number) {
    this.#send({ type: 'subscribe_ticket', payload: { ticket_id: ticketId } })
  }

  /** Unsubscribe from a ticket's live feed. */
  unsubscribeTicket(ticketId: number) {
    this.#send({ type: 'unsubscribe_ticket', payload: { ticket_id: ticketId } })
    this.#ticketListeners.delete(ticketId)
    this.#commentListeners.delete(ticketId)
  }

  /**
   * Register a callback for ticket_updated events on a specific ticket.
   * Returns an unsubscribe function - call it in $effect cleanup.
   */
  onTicketUpdate(ticketId: number, cb: (e: WSTicketUpdate) => void): () => void {
    if (!this.#ticketListeners.has(ticketId)) {
      this.#ticketListeners.set(ticketId, new Set())
    }
    this.#ticketListeners.get(ticketId)!.add(cb)
    return () => this.#ticketListeners.get(ticketId)?.delete(cb)
  }

  /**
   * Register a callback for comment_added events on a specific ticket.
   * Returns an unsubscribe function - call it in $effect cleanup.
   */
  onComment(ticketId: number, cb: (e: WSComment) => void): () => void {
    if (!this.#commentListeners.has(ticketId)) {
      this.#commentListeners.set(ticketId, new Set())
    }
    this.#commentListeners.get(ticketId)!.add(cb)
    return () => this.#commentListeners.get(ticketId)?.delete(cb)
  }

  /** Mark a notification as read locally (optimistic). */
  markRead(notificationId: number) {
    this.notifications = this.notifications.filter(n => n.id !== notificationId)
  }

  /** Clear all notifications locally. */
  clearNotifications() {
    this.notifications = []
  }

  // ÄÄ Private ÄÄ

  #open() {
    if (!this.#token) return
    const url = `${WS_BASE}/ws?token=${this.#token}`
    this.#ws = new WebSocket(url)

    this.#ws.onopen = () => {
      console.log('[WS] Connected')
      this.status = 'connected'
      this.#reconnectAttempts = 0
      this.#startPing()
    }

    this.#ws.onmessage = (event) => {
      try {
        const envelope: WSEnvelope = JSON.parse(event.data)
        this.#handle(envelope)
      } catch {
        console.warn('[WS] Failed to parse message:', event.data)
      }
    }

    this.#ws.onclose = () => {
      console.warn('[WS] Connection closed')
      this.status = 'disconnected'
      this.#clearTimers()
      this.#scheduleReconnect()
    }

    this.#ws.onerror = (e) => {
      console.error('[WS] Error:', e)
      this.status = 'error'
    }
  }

  #handle(envelope: WSEnvelope) {
    switch (envelope.type) {
      case 'connected':
        // Initial confirmation - nothing extra needed
        break

      case 'notification':
        // Prepend so newest is first
        this.notifications = [envelope.payload as WSNotification, ...this.notifications]
        break

      case 'ticket_updated': {
        const update = envelope.payload as WSTicketUpdate
        this.lastTicketUpdate = update
        // Fire per-ticket listeners
        this.#ticketListeners.get(update.ticket_id)?.forEach(cb => cb(update))
        break
      }

      case 'comment_added': {
        const { ticket_id, comment } = envelope.payload as { ticket_id: number; comment: WSComment }
        this.lastComment = { ...comment, ticket_id }
        this.#commentListeners.get(ticket_id)?.forEach(cb => cb(comment))
        break
      }

      case 'message_received':
        this.messages = [envelope.payload as WSMessage, ...this.messages]
        break

      case 'pong':
        // Heartbeat ack - no action needed
        break

      case 'error':
        console.warn('[WS] Server error:', envelope.payload)
        break
    }
  }

  #send(data: object) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(data))
    }
  }

  #startPing() {
    this.#pingInterval = setInterval(() => {
      this.#send({ type: 'ping' })
    }, 25_000)
  }

  #scheduleReconnect() {
    if (this.#reconnectAttempts >= this.#maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached')
      return
    }
    const delay = Math.min(1000 * 2 ** this.#reconnectAttempts, 30_000) // exponential backoff, max 30s
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.#reconnectAttempts + 1})`)
    this.#reconnectTimeout = setTimeout(async () => {
      this.#reconnectAttempts++
      await this.connect()
    }, delay)
  }

  #clearTimers() {
    if (this.#pingInterval) clearInterval(this.#pingInterval)
    if (this.#reconnectTimeout) clearTimeout(this.#reconnectTimeout)
    this.#pingInterval = null
    this.#reconnectTimeout = null
  }
}

// Singleton - import this everywhere
export const ws = new TicketingWS()
```

---

### Re-export

**`src/lib/ws/index.ts`**

```ts
export { ws } from './websocket.svelte'
export type * from './types'
```

---

### Usage in Components

#### Connect on login / app init

Call `ws.connect()` right after a successful login, and `ws.disconnect()` on logout. A good place is wherever you handle auth state:

```ts
// e.g. src/lib/auth.svelte.ts
import { ws } from '$lib/ws'

export async function login(username: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (res.ok) {
    await ws.connect()   //  connect WS after login
  }
  return res
}

export async function logout() {
  ws.disconnect()        //  disconnect before clearing session
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
}
```

---

#### Notification Bell Component

**`src/components/NotificationBell.svelte`**

```svelte
<script lang="ts">
  import { ws } from '$lib/ws'
</script>

<button class="relative">
  ??
  {#if ws.notifications.length > 0}
    <span class="badge">{ws.notifications.length}</span>
  {/if}
</button>

{#if ws.notifications.length > 0}
  <ul class="dropdown">
    {#each ws.notifications as notif (notif.id)}
      <li>
        <span>{notif.message}</span>
        <button onclick={() => ws.markRead(notif.id)}>?</button>
      </li>
    {/each}
  </ul>
{/if}

<!-- Connection status indicator (optional) -->
<span class="status status--{ws.status}">{ws.status}</span>
```

---

#### Ticket Detail - Live Updates

**`src/components/TicketDetail.svelte`**

```svelte
<script lang="ts">
  import { ws } from '$lib/ws'
  import type { WSTicketUpdate, WSComment } from '$lib/ws'

  // Props
  let { ticketId }: { ticketId: number } = $props()

  // Local reactive state
  let currentStatus = $state('open')
  let comments = $state<WSComment[]>([])

  $effect(() => {
    // Subscribe to this ticket's live feed when component mounts
    ws.subscribeTicket(ticketId)

    // Listen for status/field changes
    const unsubUpdate = ws.onTicketUpdate(ticketId, (update: WSTicketUpdate) => {
      if (update.field === 'status' && update.new_value) {
        currentStatus = update.new_value
      }
    })

    // Listen for new comments
    const unsubComment = ws.onComment(ticketId, (comment: WSComment) => {
      comments = [...comments, comment]
    })

    // Cleanup when component unmounts or ticketId changes
    return () => {
      unsubUpdate()
      unsubComment()
      ws.unsubscribeTicket(ticketId)
    }
  })
</script>

<div>
  <p>Status: <strong>{currentStatus}</strong></p>

  <ul>
    {#each comments as c (c.id)}
      <li>
        <strong>{c.user.first_name}</strong>: {c.content}
        <small>{new Date(c.created_at).toLocaleTimeString()}</small>
      </li>
    {/each}
  </ul>
</div>
```

---

#### Live Messaging

**`src/components/ChatWindow.svelte`**

```svelte
<script lang="ts">
  import { ws } from '$lib/ws'

  let { contactId }: { contactId: number } = $props()

  // Filter messages relevant to this conversation
  let conversation = $derived(
    ws.messages.filter(m =>
      m.sender.id === contactId
      // incoming only - outgoing messages come from your POST /messages response
    )
  )
</script>

<ul>
  {#each conversation as msg (msg.id)}
    <li>
      <strong>{msg.sender.first_name}</strong>: {msg.content}
    </li>
  {/each}
</ul>
```

---

## Security Considerations

### Token Passing
Since this project uses `httpOnly` cookies, the JWT isn't accessible from JavaScript directly. Two options:

**Option A - Add a `/auth/ws-token` endpoint** that reads the cookie server-side and returns a short-lived (60s TTL) token just for WS handshake:

```ts
.get('/ws-token', async ({ user, jwt_token, status }) => {
  if (!user) return status(401)
  const shortToken = await jwt_token.sign({
    sub: user.toString(),
    exp: Math.floor(Date.now() / 1000) + 60 // 60 seconds only
  })
  return status(200, { token: shortToken })
}, { isAuth: true })
```

**Option B** - Pass the cookie directly in the WS upgrade request headers (works in server-to-server scenarios but not in browser WebSocket API).

Option A is recommended for browser clients.

### Authorization on Subscribe
The `subscribe_ticket` handler already verifies ticket access before subscribing - never skip this check. Anyone who can construct a WS message shouldn't be able to subscribe to arbitrary ticket feeds.

### Rate Limiting
Consider tracking message counts per connection and closing connections that send too many messages in a short window (simple abuse protection).

---

## Caveats & Known Limitations

| Concern | Detail |
|---|---|
| **Single process only** | Bun's `server.publish()` is in-memory. If you ever run multiple processes/instances behind a load balancer, pub/sub won't cross process boundaries. For multi-instance, swap to Redis pub/sub. |
| **No persistence** | Messages sent over WS are fire-and-forget. If a user is offline, they won't receive it - they'll still get the DB notification on next login (which already exists). |
| **SQLite concurrency** | SQLite has write lock contention under high concurrent WS activity. For a small internal system this is fine; at scale, consider PostgreSQL (just swap the Prisma datasource). |
| **Idle timeout** | Default Bun idle timeout is 120s. Set a client-side ping every 25s to keep connections alive. |
| **`@elysiajs/websocket` is legacy** | Do not install it. WebSocket is built into Elysia core since v1.x. |
