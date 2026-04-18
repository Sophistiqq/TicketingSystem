// ============================================================
// Messaging store — unread count polling
// ============================================================
import { api } from '../lib/api';

let unreadCount: number = $state(0);
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function getMessageUnreadCount() {
  return unreadCount;
}

export async function fetchMessageUnreadCount() {
  try {
    const res = await api.get<{ count: number }>('/messages/unread-count');
    if (res) unreadCount = res.count;
  } catch {
    // silently fail
  }
}

export function startMessagePolling(intervalMs = 30_000) {
  stopMessagePolling();
  fetchMessageUnreadCount();
  pollTimer = setInterval(fetchMessageUnreadCount, intervalMs);
}

export function stopMessagePolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
