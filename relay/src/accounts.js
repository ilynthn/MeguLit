// SPDX-License-Identifier: GPL-3.0-or-later
/* E378 MeguLit accounts + cloud sync on the relay Worker (D1). Email + 6-digit code login, long-lived device sessions,
   per-kind JSON record sync with last-writer-wins. Wiring: relay/ACCOUNTS.md. Self-contained on purpose (no imports
   from worker.js) so it merges next to the leaderboard branch without touching its router.

   Bindings/secrets: DB (D1), RESEND_API_KEY (secret, mail), optional AUTH_PEPPER (secret, falls back to HASH_SALT).
   Vars: optional MAIL_FROM (default "MeguLit <mail@megulit.com>").

   handleAccounts(request,env,now) → Response, or null when the path is not an accounts path.
   authenticate(request,env,now) → {account,session,token} or null; the leaderboard can use account.id from it. */

export const CODE_TTL = 600;            /* seconds a login code stays valid */
export const CODE_TRIES = 5;            /* wrong guesses before the code is burned */
export const SESSION_DAYS = 180;        /* sliding session lifetime */
export const ROTATE_AFTER = 86400;      /* rotate the token on use at most once a day */
/* 2026-11-12 (user: signed out of the forum and the follow list, and a second leaderboard row appeared): a token rotated
   during a request whose answer did not carry it was lost; the client kept the old one until the grace ran out. The new
   token now rides on every answer (worker.js), and the old one keeps working for 30 days. */
export const ROTATE_GRACE = 30 * 86400; /* the previous token keeps working this long after a rotation */
export const ROTATED = new WeakMap();   /* request -> the token issued while answering it */
export const KINDS = ['words', 'sentences', 'reading', 'settings'];
export const KIND_CAP = { words: 8 << 20, sentences: 4 << 20, reading: 1 << 20, settings: 512 << 10 };
export const RECORD_CAP = { words: 32 << 10, sentences: 8 << 10, reading: 1 << 10, settings: 32 << 10 };
export const PUT_MAX_RECORDS = 500;
export const PUT_MAX_BYTES = 2 << 20;
export const PULL_LIMIT = 500;
/* requests per window: [limit, seconds] */
export const AUTH_RATE = {
  'code-email': [5, 3600], 'code-email-gap': [1, 60], 'code-ip': [20, 3600],
  'verify-ip': [30, 600], 'verify-email': [15, 3600], 'acct': [600, 3600],
  'pw-ip': [30, 600], 'pw-login': [10, 3600]
};
/* ---- user name and password (2026-11-12) ------------------------------------------------------------------- */
export const PBKDF2_ROUNDS = 100000;
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'megulit', 'moderator', 'official', 'staff', 'null', 'undefined']);
/* 3-20 characters, a letter first, then letters, digits and _ ; compared without case */
export function normalizeUsername(value) {
  const name = String(value ?? '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(name)) return null;
  return RESERVED.has(name.toLowerCase()) ? null : name;
}
export function checkPassword(value) {
  const p = String(value ?? '');
  if (p.length < 8 || p.length > 128) return 'PASSWORD_LENGTH';
  if (/^(.)\1*$/.test(p)) return 'PASSWORD_WEAK';
  return '';
}
export async function hashPassword(password, saltHex, rounds = PBKDF2_ROUNDS) {
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}

const encoder = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function sha256(value) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value)))); }
export function sameText(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const pepper = env => String(env.AUTH_PEPPER || env.HASH_SALT || 'megulit-accounts');
const seconds = now => Math.floor(now.getTime() / 1000);

/* ---- pure helpers (unit tested) ------------------------------------------------------------------------------ */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return '';
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return '';
  if (email.split('@')[0].length > 64) return '';
  return email;
}
/* 6 digits, uniform: rejection sampling on a uint32 so 000000..999999 are equally likely */
export function generateCode(random = array => crypto.getRandomValues(array)) {
  const limit = Math.floor(0x100000000 / 1000000) * 1000000;
  for (;;) { const n = random(new Uint32Array(1))[0]; if (n < limit) return String(n % 1000000).padStart(6, '0'); }
}
export function hashCode(secret, email, code) { return sha256(`code:${secret}:${email}:${code}`); }
export function emailKey(secret, email) { return sha256(`email:${secret}:${email}`); }
/* row = {code_hash, expires_at, tries} from auth_codes; nowSec in seconds */
export function checkCode(row, codeHash, nowSec) {
  if (!row) return { ok: false, error: 'NO_CODE' };
  if (row.expires_at <= nowSec) return { ok: false, error: 'CODE_EXPIRED' };
  if (row.tries >= CODE_TRIES) return { ok: false, error: 'TOO_MANY_TRIES' };
  if (!sameText(row.code_hash, codeHash)) return { ok: false, error: 'WRONG_CODE', triesLeft: Math.max(0, CODE_TRIES - row.tries - 1) };
  return { ok: true };
}
/* fixed window: the bucket a request falls in, and when it resets */
export function rateWindow(kind, subject, nowMs) {
  const [limit, span] = AUTH_RATE[kind], start = Math.floor(nowMs / 1000 / span) * span;
  return { bucket: `${kind}:${subject}:${start}`, resetAt: start + span, limit };
}
/* Last-writer-wins on updated_at (ms). Ties: a tombstone wins, then the larger JSON so every replica picks the same. */
export function newerRecord(a, b) {
  if (!a) return b; if (!b) return a;
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at ? a : b;
  if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b;
  return JSON.stringify(a.data ?? null) >= JSON.stringify(b.data ?? null) ? a : b;
}
export function newToken(random = array => crypto.getRandomValues(array)) {
  const bytes = random(new Uint8Array(32));
  let text = ''; for (const b of bytes) text += String.fromCharCode(b);
  return 'mgl_' + btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const TOKEN = /^mgl_[A-Za-z0-9_-]{43}$/;
export function cleanDevice(value) {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60) : '';
  return text || 'MeguLit';
}
/* one incoming sync record → {key,updated_at,deleted,data,json} or an error code */
export function validateRecord(kind, record, nowMs) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { error: 'INVALID_RECORD' };
  const key = record.key;
  if (typeof key !== 'string' || !key || key.length > 200 || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(key)) return { error: 'INVALID_KEY' };
  const at = record.updated_at;
  if (!Number.isSafeInteger(at) || at < Date.UTC(2020, 0, 1) || at > nowMs + 86400000) return { error: 'INVALID_UPDATED_AT' };
  if (record.deleted === true) return { key, updated_at: at, deleted: true, data: null, json: null };
  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return { error: 'INVALID_DATA' };
  const json = JSON.stringify(record.data);
  if (encoder.encode(json).length > RECORD_CAP[kind]) return { error: 'RECORD_TOO_LARGE' };
  return { key, updated_at: at, deleted: false, data: record.data, json };
}

/* ---- responses --------------------------------------------------------------------------------------------- */
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra } });
}
const fail = (error, status = 400, more = {}) => json({ ok: false, error, ...more }, status);
async function readJSON(request, max) {
  if (Number(request.headers.get('content-length') || 0) > max) return { error: 'PAYLOAD_TOO_LARGE' };
  const text = await request.text(); if (text.length > max) return { error: 'PAYLOAD_TOO_LARGE' };
  try { const value = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? { value } : { error: 'INVALID_JSON' }; } catch { return { error: 'INVALID_JSON' }; }
}
const bodyError = e => fail(e, e === 'PAYLOAD_TOO_LARGE' ? 413 : 400);
async function clientKey(request, env) { return (await sha256((env.HASH_SALT || 'megulit-relay') + ':' + (request.headers.get('cf-connecting-ip') || 'unknown'))).slice(0, 32); }

/* ---- rate limiting (same rate_limits table as worker.js) ----------------------------------------------------- */
export async function hitAuth(env, kind, subject, now = Date.now()) {
  const w = rateWindow(kind, subject, now);
  const row = await env.DB.prepare('INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(w.bucket, w.resetAt).first();
  return (row?.count ?? 1) <= w.limit;
}

/* ---- mail -------------------------------------------------------------------------------------------------- */
export function codeEmail(code) {
  const subject = `MeguLit 验证码 / Sign-in code: ${code}`;
  const text = `你的 MeguLit 登录验证码：${code}\n10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。\n\nYour MeguLit sign-in code: ${code}\nIt expires in 10 minutes. If you did not request it, you can ignore this email.\n`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#222"><p>你的 MeguLit 登录验证码：</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。</p><hr style="border:0;border-top:1px solid #ddd"><p>Your MeguLit sign-in code is <b>${code}</b>. It expires in 10 minutes. If you did not request it, you can ignore this email.</p></body></html>`;
  return { subject, text, html };
}
async function sendCode(env, email, code) {
  const mail = codeEmail(code);
  const response = await (env.fetch || fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json', 'user-agent': 'megulit-relay' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'MeguLit <mail@megulit.com>', to: [email], subject: mail.subject, text: mail.text, html: mail.html })
  });
  return response.ok;
}

/* ---- sessions ---------------------------------------------------------------------------------------------- */
export async function authenticate(request, env, now = new Date()) {
  const header = request.headers.get('authorization') || '', token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!TOKEN.test(token)) return null;
  const t = seconds(now), hash = await sha256(token);
  const session = await env.DB.prepare('SELECT * FROM account_sessions WHERE (token_hash=? OR (prev_hash=? AND prev_until>?)) AND expires_at>?').bind(hash, hash, t, t).first();
  if (!session) return null;
  const account = await env.DB.prepare('SELECT id,email,created_at FROM accounts WHERE id=?').bind(session.account_id).first();
  if (!account) return null;
  let rotated = '';
  if (session.token_hash === hash && t - session.rotated_at >= ROTATE_AFTER) {
    rotated = newToken();
    await env.DB.prepare('UPDATE account_sessions SET token_hash=?,prev_hash=?,prev_until=?,rotated_at=?,last_used_at=?,expires_at=? WHERE id=?')
      .bind(await sha256(rotated), hash, t + ROTATE_GRACE, t, t, t + SESSION_DAYS * 86400, session.id).run();
  /* 2026-11-13 was 300s: a row per signed-in device every 5 minutes is ~288 D1 writes a day each. The session lives
       30 days, so refreshing last_used_at / expires_at once an hour keeps it alive just as well. */
  } else if (t - session.last_used_at > 3600) {
    await env.DB.prepare('UPDATE account_sessions SET last_used_at=?,expires_at=? WHERE id=?').bind(t, t + SESSION_DAYS * 86400, session.id).run();
  }
  if (rotated) ROTATED.set(request, rotated);
  return { account, session, token: rotated };
}
const withToken = (response, auth) => { if (auth?.token) response.headers.set('x-megulit-token', auth.token); return response; };

/* ---- endpoints --------------------------------------------------------------------------------------------- */
export const SEND_WAIT = 1500;
async function requestCode(request, env, ip, now, ctx) {
  const body = await readJSON(request, 2048); if (body.error) return bodyError(body.error);
  const email = normalizeEmail(body.value.email); if (!email) return fail('EMAIL_INVALID');
  if (!env.RESEND_API_KEY) return fail('EMAIL_NOT_CONFIGURED', 503);
  const key = await emailKey(pepper(env), email), ms = now.getTime();
  if (!await hitAuth(env, 'code-ip', ip, ms)) return fail('RATE_LIMITED', 429);
  if (!await hitAuth(env, 'code-email-gap', key, ms)) return fail('RATE_LIMITED', 429, { retryAfter: 60 });
  if (!await hitAuth(env, 'code-email', key, ms)) return fail('RATE_LIMITED', 429);
  const code = generateCode(), t = seconds(now);
  await env.DB.prepare('INSERT INTO auth_codes(email_hash,code_hash,expires_at,tries,created_at) VALUES(?,?,?,0,?) ON CONFLICT(email_hash) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,tries=0,created_at=excluded.created_at')
    .bind(key, await hashCode(pepper(env), email, code), t + CODE_TTL, t).run();
  /* 2026-11-12 (user: the code mail is slow): wait for Resend at most SEND_WAIT ms. A failure inside that window is still
     reported (EMAIL_SEND_FAILED); a slower send carries on after the answer (ctx.waitUntil), and if it fails the code
     is removed, so verifying answers NO_CODE and the app asks for a new one. */
  const sending = sendCode(env, email, code).catch(() => false).then(async ok => {
    if (!ok) await env.DB.prepare('DELETE FROM auth_codes WHERE email_hash=? AND created_at=?').bind(key, t).run().catch(() => null);
    return ok;
  });
  let timer = null;
  const early = ctx?.waitUntil ? await Promise.race([sending, new Promise(resolve => { timer = setTimeout(() => resolve(null), Number(env.MAIL_WAIT_MS) || SEND_WAIT); })]) : await sending;
  if (timer) clearTimeout(timer);
  if (early === null) { ctx.waitUntil(sending); return json({ ok: true, expiresIn: CODE_TTL, sending: true }); }
  if (!early) return fail('EMAIL_SEND_FAILED', 502);
  return json({ ok: true, expiresIn: CODE_TTL });
}
async function verifyCode(request, env, ip, now) {
  const body = await readJSON(request, 2048); if (body.error) return bodyError(body.error);
  const email = normalizeEmail(body.value.email), code = String(body.value.code ?? '').replace(/\s+/g, '');
  if (!email) return fail('EMAIL_INVALID'); if (!/^\d{6}$/.test(code)) return fail('WRONG_CODE');
  const key = await emailKey(pepper(env), email), ms = now.getTime(), t = seconds(now);
  if (!await hitAuth(env, 'verify-ip', ip, ms) || !await hitAuth(env, 'verify-email', key, ms)) return fail('RATE_LIMITED', 429);
  const row = await env.DB.prepare('SELECT code_hash,expires_at,tries FROM auth_codes WHERE email_hash=?').bind(key).first();
  const checked = checkCode(row, await hashCode(pepper(env), email, code), t);
  if (!checked.ok) {
    if (checked.error === 'WRONG_CODE') await env.DB.prepare('UPDATE auth_codes SET tries=tries+1 WHERE email_hash=?').bind(key).run();
    if (checked.error === 'CODE_EXPIRED' || checked.error === 'TOO_MANY_TRIES') await env.DB.prepare('DELETE FROM auth_codes WHERE email_hash=?').bind(key).run();
    return fail(checked.error, 400, checked.triesLeft !== undefined ? { triesLeft: checked.triesLeft } : {});
  }
  await env.DB.prepare('DELETE FROM auth_codes WHERE email_hash=?').bind(key).run();
  let account = await env.DB.prepare('SELECT id,email,created_at FROM accounts WHERE email=?').bind(email).first();
  if (!account) {
    account = { id: crypto.randomUUID(), email, created_at: t };
    await env.DB.prepare('INSERT INTO accounts(id,email,created_at,last_login_at,sync_seq) VALUES(?,?,?,?,0) ON CONFLICT(email) DO NOTHING').bind(account.id, email, t, t).run();
    account = await env.DB.prepare('SELECT id,email,created_at FROM accounts WHERE email=?').bind(email).first();
  } else await env.DB.prepare('UPDATE accounts SET last_login_at=? WHERE id=?').bind(t, account.id).run();
  return await openSession(env, account, body.value.device, t);
}
async function openSession(env, account, device, t) {
  const token = newToken(), sessionId = hex(crypto.getRandomValues(new Uint8Array(8)));
  await env.DB.prepare('INSERT INTO account_sessions(id,account_id,token_hash,prev_hash,prev_until,device,created_at,last_used_at,rotated_at,expires_at) VALUES(?,?,?,NULL,0,?,?,?,?,?)')
    .bind(sessionId, account.id, await sha256(token), cleanDevice(device), t, t, t, t + SESSION_DAYS * 86400).run();
  /* at most 20 devices: drop the least recently used beyond that */
  await env.DB.prepare('DELETE FROM account_sessions WHERE account_id=? AND id NOT IN (SELECT id FROM account_sessions WHERE account_id=? ORDER BY last_used_at DESC LIMIT 20)').bind(account.id, account.id).run();
  return json({ ok: true, token, accountId: account.id, email: account.email, sessionId, expiresAt: t + SESSION_DAYS * 86400 });
}
/* e-mail or user name + password. One answer for every failure, so nobody can probe which names exist. */
async function passwordLogin(request, env, ip, now) {
  const body = await readJSON(request, 2048); if (body.error) return bodyError(body.error);
  const login = String(body.value.login ?? '').trim(), password = String(body.value.password ?? ''), ms = now.getTime(), t = seconds(now);
  if (!login || !password || password.length > 128) return fail('WRONG_PASSWORD');
  const email = login.includes('@') ? normalizeEmail(login) : null, key = email ? 'e:' + await emailKey(pepper(env), email) : 'u:' + login.toLowerCase();
  if (!await hitAuth(env, 'pw-ip', ip, ms) || !await hitAuth(env, 'pw-login', await sha256(key), ms)) return fail('RATE_LIMITED', 429);
  const account = email
    ? await env.DB.prepare('SELECT id,email,created_at,pass_hash,pass_salt FROM accounts WHERE email=?').bind(email).first()
    : await env.DB.prepare('SELECT id,email,created_at,pass_hash,pass_salt FROM accounts WHERE username_key=?').bind(login.toLowerCase()).first();
  if (!account?.pass_hash || !account.pass_salt) { await hashPassword(password, '00'.repeat(16)); return fail('WRONG_PASSWORD'); }
  if (!sameText(await hashPassword(password, account.pass_salt), account.pass_hash)) return fail('WRONG_PASSWORD');
  await env.DB.prepare('UPDATE accounts SET last_login_at=? WHERE id=?').bind(t, account.id).run();
  return await openSession(env, { id: account.id, email: account.email, created_at: account.created_at }, body.value.device, t);
}
/* the user name is chosen once and never changed */
async function setUsername(request, env, auth) {
  const body = await readJSON(request, 1024); if (body.error) return bodyError(body.error);
  const name = normalizeUsername(body.value.username); if (!name) return fail('USERNAME_INVALID');
  const row = await env.DB.prepare('SELECT username FROM accounts WHERE id=?').bind(auth.account.id).first();
  if (row?.username) return fail('USERNAME_LOCKED', 409);
  const taken = await env.DB.prepare('SELECT 1 FROM accounts WHERE username_key=? LIMIT 1').bind(name.toLowerCase()).first();
  if (taken) return fail('USERNAME_TAKEN', 409);
  try { await env.DB.prepare('UPDATE accounts SET username=?,username_key=? WHERE id=? AND username IS NULL').bind(name, name.toLowerCase(), auth.account.id).run(); }
  catch { return fail('USERNAME_TAKEN', 409); }
  return withToken(json({ ok: true, username: name }), auth);
}
/* set or change the password: changing needs the current one, unless this session signed in with an e-mail code in the
   last 10 minutes (that is how a forgotten password is reset) */
async function setPassword(request, env, auth, now) {
  const body = await readJSON(request, 2048); if (body.error) return bodyError(body.error);
  const password = String(body.value.password ?? ''), bad = checkPassword(password); if (bad) return fail(bad);
  const row = await env.DB.prepare('SELECT pass_hash,pass_salt FROM accounts WHERE id=?').bind(auth.account.id).first(), t = seconds(now);
  const fresh = t - (auth.session.created_at || 0) <= 600;
  if (row?.pass_hash && !fresh) {
    const current = String(body.value.current ?? '');
    if (!current || !sameText(await hashPassword(current, row.pass_salt), row.pass_hash)) return fail('WRONG_PASSWORD');
  }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.DB.prepare('UPDATE accounts SET pass_hash=?,pass_salt=?,pass_set_at=? WHERE id=?').bind(await hashPassword(password, salt), salt, t, auth.account.id).run();
  return withToken(json({ ok: true, hasPassword: true }), auth);
}
async function me(env, auth, now) {
  const { results: sessions } = await env.DB.prepare('SELECT id,device,created_at,last_used_at FROM account_sessions WHERE account_id=? AND expires_at>? ORDER BY last_used_at DESC').bind(auth.account.id, seconds(now)).all();
  const { results: usage } = await env.DB.prepare('SELECT kind,COUNT(*) records,COALESCE(SUM(LENGTH(CAST(data AS BLOB))),0) bytes FROM sync_records WHERE account_id=? AND deleted=0 GROUP BY kind').bind(auth.account.id).all();
  let extra = null; try { extra = await env.DB.prepare('SELECT username,pass_set_at FROM accounts WHERE id=?').bind(auth.account.id).first(); } catch { extra = null; }
  return withToken(json({
    ok: true, accountId: auth.account.id, email: auth.account.email, createdAt: auth.account.created_at, sessionId: auth.session.id,
    username: extra?.username || null, hasPassword: !!extra?.pass_set_at,
    devices: sessions.map(s => ({ id: s.id, device: s.device, createdAt: s.created_at, lastUsedAt: s.last_used_at, current: s.id === auth.session.id })),
    usage: Object.fromEntries(usage.map(u => [u.kind, { records: u.records, bytes: u.bytes }])), limits: KIND_CAP
  }), auth);
}
async function logout(request, env, auth) {
  const text = await request.text();
  if (text.length > 1024) return bodyError('PAYLOAD_TOO_LARGE');
  let body = { value: {} };
  if (text.trim()) { try { const v = JSON.parse(text); body = { value: v && typeof v === 'object' ? v : {} }; } catch { return bodyError('INVALID_JSON'); } }
  const target = typeof body.value.sessionId === 'string' && /^[0-9a-f]{16}$/.test(body.value.sessionId) ? body.value.sessionId : auth.session.id;
  const r = await env.DB.prepare('DELETE FROM account_sessions WHERE id=? AND account_id=?').bind(target, auth.account.id).run();
  return json({ ok: true, revoked: target, current: target === auth.session.id, changed: r?.meta?.changes ?? null });
}
async function deleteAccount(env, auth) {
  const id = auth.account.id, key = await emailKey(pepper(env), auth.account.email);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sync_records WHERE account_id=?').bind(id),
    env.DB.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(id),
    env.DB.prepare('DELETE FROM auth_codes WHERE email_hash=?').bind(key),
    env.DB.prepare('DELETE FROM accounts WHERE id=?').bind(id)
  ]);
  return json({ ok: true, deleted: true });
}
async function syncPull(url, env, auth, kind) {
  const since = Number(url.searchParams.get('since') || 0), limit = Math.min(PULL_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || PULL_LIMIT));
  if (!Number.isSafeInteger(since) || since < 0) return fail('INVALID_SINCE');
  const { results } = await env.DB.prepare('SELECT key,data,updated_at,deleted,seq FROM sync_records WHERE account_id=? AND kind=? AND seq>? ORDER BY seq ASC LIMIT ?').bind(auth.account.id, kind, since, limit + 1).all();
  const more = results.length > limit, rows = results.slice(0, limit);
  const records = rows.map(r => ({ key: r.key, updated_at: r.updated_at, deleted: !!r.deleted, data: r.deleted ? null : JSON.parse(r.data) }));
  return withToken(json({ ok: true, kind, records, cursor: rows.length ? rows[rows.length - 1].seq : since, more }), auth);
}
async function syncPush(request, env, auth, kind, now) {
  const body = await readJSON(request, PUT_MAX_BYTES); if (body.error) return bodyError(body.error);
  const list = body.value.records;
  if (!Array.isArray(list) || list.length > PUT_MAX_RECORDS) return fail('INVALID_RECORDS');
  const incoming = new Map();
  for (const raw of list) {
    const r = validateRecord(kind, raw, now.getTime()); if (r.error) return fail(r.error, r.error === 'RECORD_TOO_LARGE' ? 413 : 400, { key: typeof raw?.key === 'string' ? raw.key.slice(0, 200) : '' });
    incoming.set(r.key, newerRecord(incoming.get(r.key), r));
  }
  const id = auth.account.id, keys = [...incoming.keys()], existing = new Map();
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT key,data,updated_at,deleted FROM sync_records WHERE account_id=? AND kind=? AND key IN (${part.map(() => '?').join(',')})`).bind(id, kind, ...part).all();
    for (const r of results) existing.set(r.key, { key: r.key, updated_at: r.updated_at, deleted: !!r.deleted, data: r.deleted ? null : JSON.parse(r.data), size: r.data ? encoder.encode(r.data).length : 0 });
  }
  const accepted = [], newer = [];let delta = 0;
  for (const r of incoming.values()) {
    const old = existing.get(r.key);
    if (old && newerRecord(old, r) === old) { if (old.updated_at !== r.updated_at || JSON.stringify(old.data) !== JSON.stringify(r.data)) newer.push({ key: old.key, updated_at: old.updated_at, deleted: old.deleted, data: old.data }); continue; }
    accepted.push(r); delta += (r.json ? encoder.encode(r.json).length : 0) - (old?.size || 0);
  }
  if (delta > 0) {
    const used = (await env.DB.prepare('SELECT COALESCE(SUM(LENGTH(CAST(data AS BLOB))),0) n FROM sync_records WHERE account_id=? AND kind=? AND deleted=0').bind(id, kind).first())?.n || 0;
    if (used + delta > KIND_CAP[kind]) return fail('SYNC_QUOTA_EXCEEDED', 413, { used, limit: KIND_CAP[kind] });
  }
  let cursor = 0;
  if (accepted.length) {
    const top = (await env.DB.prepare('UPDATE accounts SET sync_seq=sync_seq+? WHERE id=? RETURNING sync_seq').bind(accepted.length, id).first())?.sync_seq;
    if (!top) return fail('UNAUTHORIZED', 401);
    let seq = top - accepted.length;
    await env.DB.batch(accepted.map(r => env.DB.prepare('INSERT INTO sync_records(account_id,kind,key,data,updated_at,deleted,seq) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id,kind,key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,deleted=excluded.deleted,seq=excluded.seq')
      .bind(id, kind, r.key, r.json, r.updated_at, r.deleted ? 1 : 0, ++seq)));
    cursor = top;
  }
  return withToken(json({ ok: true, kind, accepted: accepted.length, newer, cursor }), auth);
}

/* ---- entry --------------------------------------------------------------------------------------------------- */
export function isAccountsPath(path) { return path === '/api/me' || path.startsWith('/api/me/') || path.startsWith('/api/auth/') || path.startsWith('/api/sync/'); }
export async function handleAccounts(request, env, now = new Date(), ctx = null) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/', method = request.method;
  if (!isAccountsPath(path)) return null;
  try {
    const ip = await clientKey(request, env);
    if (path === '/api/auth/code') return method === 'POST' ? await requestCode(request, env, ip, now, ctx) : fail('METHOD_NOT_ALLOWED', 405);
    if (path === '/api/auth/verify') return method === 'POST' ? await verifyCode(request, env, ip, now) : fail('METHOD_NOT_ALLOWED', 405);
    if (path === '/api/auth/password') return method === 'POST' ? await passwordLogin(request, env, ip, now) : fail('METHOD_NOT_ALLOWED', 405);
    const auth = await authenticate(request, env, now);
    if (!auth) return fail('UNAUTHORIZED', 401);
    if (!await hitAuth(env, 'acct', auth.account.id, now.getTime())) return fail('RATE_LIMITED', 429);
    if (path === '/api/auth/logout') return method === 'POST' ? await logout(request, env, auth) : fail('METHOD_NOT_ALLOWED', 405);
    if (path === '/api/me') return method === 'GET' ? await me(env, auth, now) : method === 'DELETE' ? await deleteAccount(env, auth) : fail('METHOD_NOT_ALLOWED', 405);
    if (path === '/api/me/username') return method === 'POST' ? await setUsername(request, env, auth) : fail('METHOD_NOT_ALLOWED', 405);
    if (path === '/api/me/password') return method === 'POST' ? await setPassword(request, env, auth, now) : fail('METHOD_NOT_ALLOWED', 405);
    const kind = path.slice('/api/sync/'.length);
    if (!KINDS.includes(kind)) return fail('NOT_FOUND', 404);
    return method === 'GET' ? await syncPull(url, env, auth, kind) : method === 'PUT' ? await syncPush(request, env, auth, kind, now) : fail('METHOD_NOT_ALLOWED', 405);
  } catch (error) { console.error('accounts error', error?.message); return fail('SERVER_ERROR', 500); }
}
