// ============================================================
// HTTP Client — centralised fetch wrapper
// All requests include credentials (httpOnly cookie auth).
// On 401 → redirect to /login.
// ============================================================

const API_BASE = 'http://localhost:3000';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    throw new ApiError('Unauthorized', 401);
  }

  if (res.status === 204) return null as T;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(body?.message ?? `HTTP ${res.status}`, res.status);
  }

  return body as T;
}

// ── Convenience methods ─────────────────────────────────────

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),

  /** Multipart file upload for ticket attachments */
  upload: (ticketId: number, files: FileList | File[], type?: string) => {
    const formData = new FormData();
    formData.append('ticket_id', ticketId.toString());
    for (const file of files) {
      formData.append('files', file);
    }
    if (type) formData.append('type', type);

    return request<unknown>('/attachments', {
      method: 'POST',
      body: formData,
    });
  },
};

export { ApiError };
