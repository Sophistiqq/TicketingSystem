import { treaty } from '@elysiajs/eden';
import { triggerAlert } from '../stores/ui.svelte';

type App = any;

let base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
if (base && !base.startsWith('http')) base = `https://${base}`;
export const API_BASE = base;

export const client = treaty<App>(API_BASE.replace(/^https?:\/\//, ''), {
  fetch: {
    credentials: 'include'
  }
});

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function safeJson(r: Response, suppressAlert = false) {
  // 401 Unauthorized handling: 
  // If we are getting a 401 and the app hasn't cleared the user yet, 
  // it might be a session expiry. But if suppressAlert is true (transitions), we stay silent.
  if (r.status === 401) {
    if (!suppressAlert) triggerAlert('Your session has expired. Please login again.');
    throw new ApiError('Unauthorized', 401);
  }
  
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }

  if (!r.ok) {
    let message = 'An unexpected error occurred';
    
    if (typeof json === 'object' && json !== null) {
      message = json.message || json.error || text;
    } else if (typeof json === 'string' && json.length > 0) {
      message = json;
    }

    if (!suppressAlert) {
      triggerAlert(message);
    }
    throw new ApiError(message, r.status);
  }

  return json;
}

export const api = {
  get: <T>(path: string, options?: { suppressAlert?: boolean }) => 
    fetch(`${API_BASE}${path}`, { credentials: 'include' }).then(r => safeJson(r, options?.suppressAlert)),

  post: <T>(path: string, body?: unknown, options?: { suppressAlert?: boolean }) => 
    fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body)
    }).then(r => safeJson(r, options?.suppressAlert)),

  put: <T>(path: string, body?: unknown, options?: { suppressAlert?: boolean }) =>
    fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => safeJson(r, options?.suppressAlert)),

  patch: <T>(path: string, body?: unknown, options?: { suppressAlert?: boolean }) =>
    fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => safeJson(r, options?.suppressAlert)),

  delete: <T>(path: string, options?: { suppressAlert?: boolean }) =>
    fetch(`${API_BASE}${path}`, { method: 'DELETE', credentials: 'include' }).then(r => safeJson(r, options?.suppressAlert)),

  upload: (ticketId: number, files: FileList | File[], type?: string) => {
    const formData = new FormData();
    formData.append('ticket_id', ticketId.toString());
    for (const file of files) formData.append('files', file);
    if (type) formData.append('type', type);

    return api.post('/attachments', formData);
  },
  
  client
};

export { ApiError };
