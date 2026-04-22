import { treaty } from '@elysiajs/eden';
import type { App } from '../../../Backend/src/index';

export const API_BASE = 'http://localhost:3000';

// Treaty client for type-safe requests
const client = treaty<App>(API_BASE.replace('http://', ''));

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Helper to handle Treaty responses
async function handle<T>(response: any): Promise<T> {
  const { data, error, status } = response;
  
  if (error) {
    if (status === 401 && typeof window !== 'undefined') {
      // Logic for redirect if needed, or let stores handle it
    }
    throw new ApiError(error.value?.message || `Error ${status}`, status);
  }
  
  return data as T;
}

// ── Convience methods (Legacy support & simplification) ──────

async function safeJson(r: Response) {
  if (r.status === 401) throw new ApiError('Unauthorized', 401);
  if (r.status === 204 || r.headers.get('content-length') === '0') return null;
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

export const api = {
  get: <T>(path: string) => fetch(`${API_BASE}${path}`, { credentials: 'include' }).then(safeJson),

  post: <T>(path: string, body?: unknown) => 
    fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body)
    }).then(safeJson),

  put: <T>(path: string, body?: unknown) =>
    fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(safeJson),

  patch: <T>(path: string, body?: unknown) =>
    fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(safeJson),

  delete: <T>(path: string) =>
    fetch(`${API_BASE}${path}`, { method: 'DELETE', credentials: 'include' }).then(safeJson),

  /** Multipart file upload for ticket attachments */
  upload: (ticketId: number, files: FileList | File[], type?: string) => {
    const formData = new FormData();
    formData.append('ticket_id', ticketId.toString());
    for (const file of files) formData.append('files', file);
    if (type) formData.append('type', type);

    return api.post('/attachments', formData);
  },
  
  // Expose the treaty client for new code
  client
};

export { ApiError };
