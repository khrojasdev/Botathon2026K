let token = (() => { try { return localStorage.getItem('chc_token'); } catch { return null; } })();
export function setToken(t) { token = t; try { t ? localStorage.setItem('chc_token', t) : localStorage.removeItem('chc_token'); } catch {} }
export function getToken() { return token; }

async function req(method, url, body, isForm) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const r = await fetch(`/api${url}`, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  if (r.status === 401 && !url.startsWith('/auth/login')) { setToken(null); window.dispatchEvent(new Event('chc-logout')); }
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
  return data;
}
export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  upload: (u, form) => req('POST', u, form, true),
};
export async function download(url, filename) {
  const r = await fetch(`/api${url}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('No se pudo generar el archivo');
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) p.set(k, Array.isArray(v) ? v.join(',') : v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
