import { treaty } from '@elysiajs/eden';
import { triggerAlert } from '../stores/ui.svelte';

type App = any;

let base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
if (base && !base.startsWith('http')) base = `https://${base}`;
export const API_BASE = base;
console.log('[API] Initialized with BASE:', API_BASE);

export const client = treaty<App>(API_BASE.replace(/^https?:\/\//, ''));

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function safeJson(r: Response, suppressAlert = false) {
  if (r.status === 401) throw new ApiError('Unauthorized', 401);
  
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }

  if (!r.ok) {
    const message = (typeof json === 'object' && json !== null && 'message' in json) ? json.message : text;
    if (!suppressAlert) {
      triggerAlert(message || `Error ${r.status}`);
    }
    throw new ApiError(message || `Error ${r.status}`, r.status);
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
