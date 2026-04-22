// ============================================================
// Notification store — polls unread count for the bell badge
// ============================================================
import { api } from '../lib/api';
import type { Notification, PaginatedResponse } from '../lib/types';

let unreadCount: number = $state(0);
let notifications: Notification[] = $state([]);
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function getUnreadCount() {
  return unreadCount;
}

export function getNotifications() {
  return notifications;
}

export async function fetchUnreadCount() {
  try {
    const res = await api.get<{ count: number }>('/notifications/unread-count');
    if (res) unreadCount = res.count;
  } catch {
    // silently fail — non-critical
  }
}

export async function fetchNotifications(page = 1, limit = 20) {
  try {
    const res = await api.get<PaginatedResponse<Notification>>(
      `/notifications/?page=${page}&limit=${limit}`
    );
    if (res) {
      notifications = res.data;
      return res;
    }
  } catch {
    // handled by caller
  }
  return null;
}

export async function markAsRead(id: number) {
  await api.put(`/notifications/${id}/read`);
  notifications = notifications.map((n) =>
    n.id === id ? { ...n, is_read: true } : n
  );
  unreadCount = Math.max(0, unreadCount - 1);
}

export async function markAllAsRead() {
  await api.put('/notifications/read-all');
  notifications = notifications.map((n) => ({ ...n, is_read: true }));
  unreadCount = 0;
}

export function pushNotification(notification: any) {
  notifications = [notification, ...notifications];
  unreadCount++;
}

export function startPolling(intervalMs = 30_000) {
  stopPolling();
  fetchUnreadCount();
  pollTimer = setInterval(fetchUnreadCount, intervalMs);
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
