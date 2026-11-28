// SPDX-License-Identifier: GPL-3.0-or-later
/* megulit.com /me/: the relay client. Same two nodes the desktop app uses: api.megulit.com (Cloudflare) and
   cn-api.megulit.com (EdgeOne, mainland). The faster /api/health wins and is remembered; when it fails the other is tried.
   The session is a read-only web session (POST /api/auth/verify with client:'web'; the one write it may do is the password,
   with proof); a rotated token arrives in the x-megulit-token header and is kept. */
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
/* 2026-11-29 (api.megulit.com ran out of its free daily requests, Cloudflare error 1027): Cloudflare answers that with its
   own page and no CORS headers, so the browser only sees a failed fetch. A no-cors probe of the same node then tells the
   two apart: it resolves when the node answered (quota or another Cloudflare error page), it fails when the network is down.
   A 429 that is not the relay's own JSON RATE_LIMITED is the quota too. Nothing here retries on its own. */
export const QUOTA = 'QUOTA_EXCEEDED';
const reachable = root => fetch(root + '/api/health', { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) }).then(() => true, () => false);
export async function request(method, path, body, { auth = true } = {}) {
  const order = async () => { const first = await base(); return [first, ...BASES.filter(b => b !== first)]; };
  let last = null, quota = false;
  for (const root of await order()) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) { const token = await getMeta('session'); if (!token) throw err('NOT_LOGGED_IN', 401); headers.authorization = 'Bearer ' + token; }
    let response;
    try { response = await fetch(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) }); }
    catch (error) {
      /* a timeout is a slow network, never the quota; only a refused (CORS-less) answer from a node that is up is */
      chosen = null; if (error?.name !== 'TimeoutError' && error?.name !== 'AbortError' && await reachable(root)) quota = true;
      last = err(quota ? QUOTA : 'NETWORK', quota ? 429 : 0); continue;
    }
    const rotated = response.headers.get('x-megulit-token');
    if (auth && rotated && /^mgl_[A-Za-z0-9_-]{43}$/.test(rotated)) await setMeta('session', rotated);
    let data = {}; try { data = await response.json(); } catch { /* no body */ }
    if (response.status === 401 && auth) throw err('UNAUTHORIZED', 401);
    if (response.status === 429 && data?.error !== 'RATE_LIMITED') { quota = true; last = err(QUOTA, 429); continue; }
    if (!response.ok || data?.ok === false) throw err(typeof data?.error === 'string' ? data.error : 'HTTP_' + response.status, response.status, data);
    chosen = root; try { localStorage.setItem('megulit-me-base', root); } catch { /* none */ }
    return data;
  }
  throw quota ? err(QUOTA, 429) : last || err('NETWORK', 0);
}
export const api = { get: path => request('GET', path) };
const device = () => { const ua = navigator.userAgent; return /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'; };
export const requestCode = email => request('POST', '/api/auth/code', { email }, { auth: false });
export const verifyCode = (email, code) => request('POST', '/api/auth/verify', { email, code, device: device(), client: 'web' }, { auth: false });
export const passwordLogin = (login, password) => request('POST', '/api/auth/password', { login, password, device: device(), client: 'web' }, { auth: false });
export const me = () => request('GET', '/api/me');
export const logout = () => request('POST', '/api/auth/logout', {});
/* set or change the password: proof is the current password or a code mailed to the account (requestCode with its own e-mail) */
export const setPassword = ({ password, current, code }) => request('POST', '/api/me/password', { password, ...(code ? { code } : current ? { current } : {}) });
