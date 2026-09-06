// Build-time API base. Empty (the default) means same-origin, which is how the single
// Node service and the Vite dev proxy both work. Set VITE_API_BASE_URL to the API origin
// when the frontend is hosted separately, e.g. Vercel static build in front of Render.
export const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

function resolveUrl(path) {
  if (!apiBase || typeof path !== 'string' || !path.startsWith('/api')) return path;
  return `${apiBase}${path}`;
}

export async function api(path, options = {}) {
  const response = await fetch(resolveUrl(path), {
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details || data.error || `Request failed (${response.status})`);
  return data;
}
