// SPDX-License-Identifier: GPL-3.0-or-later
/* megulit.com /me/: the relay client. Same two nodes the desktop app uses: api.megulit.com (Cloudflare) and
   cn-api.megulit.com (EdgeOne, mainland). The faster /api/health wins and is remembered; when it fails the other is tried.
   The session is a read-only web session (POST /api/auth/verify with client:'web'); a rotated token arrives in
   the x-megulit-token header and is kept. */
import { getMeta, setMeta } from './me-store.mjs';
export const BASES = ['https://api.megulit.com', 'https://cn-api.megulit.com'];
const TIMEOUT = 15000;
const err = (code, status, detail) => Object.assign(new Error(code), { code, status, detail });

async function race() {
  const probes = BASES.map(base => fetch(base + '/api/health', { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then(r => { if (!r.ok) throw new Error('down'); return base; }));
  try { const base = await Promise.any(probes); try { localStorage.setItem('megulit-me-base', base); } catch { /* private mode */ } return base; }
  catch { return BASES[0]; }
}
let chosen = null;
async function base() {
  if (chosen) return chosen;
  let saved = null; try { saved = localStorage.getItem('megulit-me-base'); } catch { /* none */ }
  chosen = BASES.includes(saved) ? saved : await race();
  return chosen;
}
export async function request(method, path, body, { auth = true } = {}) {
  const order = async () => { const first = await base(); return [first, ...BASES.filter(b => b !== first)]; };
  let last = null;
  for (const root of await order()) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) { const token = await getMeta('session'); if (!token) throw err('NOT_LOGGED_IN', 401); headers.authorization = 'Bearer ' + token; }
    let response;
    try { response = await fetch(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) }); }
    catch { last = err('NETWORK', 0); chosen = null; continue; }
    const rotated = response.headers.get('x-megulit-token');
    if (auth && rotated && /^mgl_[A-Za-z0-9_-]{43}$/.test(rotated)) await setMeta('session', rotated);
    let data = {}; try { data = await response.json(); } catch { /* no body */ }
    if (response.status === 401 && auth) throw err('UNAUTHORIZED', 401);
    if (!response.ok || data?.ok === false) throw err(typeof data?.error === 'string' ? data.error : 'HTTP_' + response.status, response.status, data);
    chosen = root; try { localStorage.setItem('megulit-me-base', root); } catch { /* none */ }
    return data;
  }
  throw last || err('NETWORK', 0);
}
export const api = { get: path => request('GET', path) };
const device = () => { const ua = navigator.userAgent; return /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'; };
export const requestCode = email => request('POST', '/api/auth/code', { email }, { auth: false });
export const verifyCode = (email, code) => request('POST', '/api/auth/verify', { email, code, device: device(), client: 'web' }, { auth: false });
export const passwordLogin = (login, password) => request('POST', '/api/auth/password', { login, password, device: device(), client: 'web' }, { auth: false });
export const me = () => request('GET', '/api/me');
export const logout = () => request('POST', '/api/auth/logout', {});
