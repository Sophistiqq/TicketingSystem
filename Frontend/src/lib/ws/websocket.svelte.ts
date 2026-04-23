import { treaty } from '@elysiajs/eden';
import type { App } from '../../../../Backend/src/index';
import { API_BASE } from '../api';
import { pushNotification } from '../../stores/notifications.svelte';
import { fetchMessageUnreadCount } from '../../stores/messages.svelte';
import type { WSNotification, WSTicketUpdate, WSComment, WSMessage } from './types';

class TicketingWS {
  // 🔹 Reactive state (Svelte 5 runes) 🔹
  status = $state<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected');

  // 🔹 Internal 🔹
  #client = treaty<App>(API_BASE.replace(/^https?:\/\//, ''));
  #subscription: any = null;
  #reconnectAttempts = 0;
  #maxReconnectAttempts = 5;

  // Set of callbacks for global events
  #onMessageCbs = new Set<(msg: WSMessage) => void>();
  #onTicketUpdateCbs = new Map<number, Set<(update: WSTicketUpdate) => void>>();
  #onCommentCbs = new Map<number, Set<(comment: WSComment) => void>>();
  #onNotificationCbs = new Set<(notif: WSNotification) => void>();
  #onReadCbs = new Set<(data: { reader_id: number; ticket_id?: number }) => void>();

  /** Initialize connection with a token */
  async connect() {
    if (this.status === 'connected' || this.status === 'connecting') return;
    this.status = 'connecting';

    try {
      const res = await fetch(`${API_BASE}/auth/ws-token`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to get WS token');
      const { token } = await res.json();

      this.#subscription = this.#client.ws.subscribe({
        query: { token }
      });

      this.#subscription.on('open', () => {
        console.log('[WS] Connected via Eden');
        this.status = 'connected';
        this.#reconnectAttempts = 0;
      });

      this.#subscription.on('message', (event: any) => {
        this.#handleMessage(event.data);
      });

      this.#subscription.on('close', () => {
        console.warn('[WS] Closed');
        this.status = 'disconnected';
        this.#attemptReconnect();
      });

      this.#subscription.on('error', (err: any) => {
        console.error('[WS] Error:', err);
        this.status = 'error';
      });

    } catch (err) {
      console.error('[WS] Connection failed:', err);
      this.status = 'error';
    }
  }

  #handleMessage(envelope: any) {
    if (!envelope || !envelope.type) return;

    switch (envelope.type) {
      case 'notification':
        pushNotification(envelope.payload);
        this.#onNotificationCbs.forEach(cb => cb(envelope.payload));
        break;
      case 'ticket_updated':
        this.#onTicketUpdateCbs.get(envelope.payload.ticket_id)?.forEach(cb => cb(envelope.payload));
        break;
      case 'comment_added':
        this.#onCommentCbs.get(envelope.payload.ticket_id)?.forEach(cb => cb(envelope.payload.comment));
        break;
      case 'message_received':
        fetchMessageUnreadCount();
        this.#onMessageCbs.forEach(cb => cb(envelope.payload));
        break;
      case 'messages_read':
        fetchMessageUnreadCount();
        this.#onReadCbs.forEach(cb => cb(envelope.payload));
        break;
    }
  }

  #attemptReconnect() {
    if (this.#reconnectAttempts < this.#maxReconnectAttempts) {
      const delay = Math.min(1000 * 2 ** this.#reconnectAttempts, 30000);
      setTimeout(() => {
        this.#reconnectAttempts++;
        this.connect();
      }, delay);
    }
  }

  disconnect() {
    this.#reconnectAttempts = this.#maxReconnectAttempts;
    this.#subscription?.close();
    this.status = 'disconnected';
  }

  // Helpers for components to send messages
  send(type: string, payload: any) {
    this.#subscription?.send({ type, payload });
  }

  // Subscription helpers
  onMessage(cb: (msg: WSMessage) => void) {
    this.#onMessageCbs.add(cb);
    return () => this.#onMessageCbs.delete(cb);
  }

  onNotification(cb: (n: WSNotification) => void) {
    this.#onNotificationCbs.add(cb);
    return () => this.#onNotificationCbs.delete(cb);
  }

  onTicketUpdate(ticketId: number, cb: (u: WSTicketUpdate) => void) {
    if (!this.#onTicketUpdateCbs.has(ticketId)) this.#onTicketUpdateCbs.set(ticketId, new Set());
    this.#onTicketUpdateCbs.get(ticketId)!.add(cb);
    this.send('subscribe_ticket', { ticket_id: ticketId });
    return () => {
      this.#onTicketUpdateCbs.get(ticketId)?.delete(cb);
      if (this.#onTicketUpdateCbs.get(ticketId)?.size === 0) {
        this.send('unsubscribe_ticket', { ticket_id: ticketId });
      }
    };
  }

  onComment(ticketId: number, cb: (c: WSComment) => void) {
    if (!this.#onCommentCbs.has(ticketId)) this.#onCommentCbs.set(ticketId, new Set());
    this.#onCommentCbs.get(ticketId)!.add(cb);
    return () => this.#onCommentCbs.get(ticketId)?.delete(cb);
  }

  onRead(cb: (data: { reader_id: number; ticket_id?: number }) => void) {
    this.#onReadCbs.add(cb);
    return () => this.#onReadCbs.delete(cb);
  }
}

export const ws = new TicketingWS();
