// SPDX-License-Identifier: GPL-3.0-or-later
/* Website feedback: the game-request and feedback forms on megulit.com post here, and each one becomes a GitHub
   issue (same GITHUB_TOKEN and GITHUB_REPO as diagnostics). Nothing is stored; the IP is only used, hashed, for the
   rate limits in worker.js. Bodies are capped, mentions are defused so an issue never pings anyone, and a hidden
   honeypot field catches simple bots. 2026-11-26: a game request is then listed in the [想玩] 汇总 tracker (same game:
   its line, people +1) and its own issue closed (issue-trackers.js). */
import {settle, trackIssue, nameKey, repoFor} from './issue-trackers.js';

export const FEEDBACK_KINDS = { game: { tag: '想玩', label: 'game-request' }, feedback: { tag: '反馈', label: 'website-feedback' } };
const LANGS = new Set(['zh', 'ja', 'en']);
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
// "@name" would notify that GitHub user; a zero-width joiner after "@" keeps the text readable and silent
const defuse = s => s.replace(/@/g, '@‍');

export function validateFeedback(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'INVALID_BODY' };
  if (clean(body.website, 200)) return { ok: false, error: 'REJECTED' };              // honeypot
  const kind = String(body.kind || '');
  if (!FEEDBACK_KINDS[kind]) return { ok: false, error: 'INVALID_KIND' };
  const text = clean(body.text, kind === 'game' ? 256 : 2000);
  if (!text) return { ok: false, error: 'EMPTY' };
  const contact = clean(body.contact, 120);
  const lang = LANGS.has(body.lang) ? body.lang : 'zh';
  const page = clean(body.page, 120).replace(/[^\w\/#.-]/g, '');
  return { ok: true, value: { kind, text, contact, lang, page } };
}

export function feedbackIssue({ kind, text, contact, lang, page }) {
  const k = FEEDBACK_KINDS[kind];
  /* E394 the desktop app posts the same forms with page "app/<version>" */
  const fromApp = /^app(\/|$)/.test(page || '');
  const appVersion = fromApp ? page.slice(4) : '';
  const first = text.split(/\r?\n/)[0].slice(0, 80);
  const title = `[${fromApp ? '软件' : '官网'}${k.tag}] ${defuse(first)}`.slice(0, 200);
  const lines = [
    kind === 'game' ? `**想玩的游戏**：${defuse(text)}` : defuse(text).split(/\r?\n/).map(l => `> ${l}`).join('\n'),
    '',
    contact ? `联系方式：${defuse(contact)}` : '联系方式：（未留）',
    fromApp ? `界面语言：${lang}` : `网站语言：${lang}${page ? ` · 页面：${page}` : ''}`,
    '',
    fromApp ? `_来自 MeguLit 软件${appVersion ? ' v' + appVersion : ''}，由 relay 自动创建_` : '_来自 megulit.com 的表单，由 relay 自动创建_',
  ];
  return { title, body: lines.join('\n'), labels: [k.label] };
}

const ghIssue = async (env, issue) => {
  const repo = /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') ? env.GITHUB_REPO : 'ilynthn/MeguLit';
  const r = await (env.fetch || fetch)(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.GITHUB_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'megulit-relay', 'content-type': 'application/json' },
    body: JSON.stringify(issue),
  });
  if (!r.ok) throw new Error('github ' + r.status);
  const data = await r.json().catch(() => ({}));
  return typeof data.html_url === 'string' ? data.html_url : '';
};
const numberOf = url => Number(/\/issues\/(\d+)$/.exec(url)?.[1]) || null;

/* Relay first, GitHub second: every submission is written to R2 (feedback/pending/...) before the issue is opened, so
   a GitHub outage or a bad token never loses one. Synced entries move to feedback/done/ with their issue link; the
   cron in worker.js retries whatever is still pending. */
const PENDING = 'feedback/pending/', DONE = 'feedback/done/';
async function sync(env, key, entry, ctx) {
  const url = await ghIssue(env, feedbackIssue(entry));
  await env.BUCKET.put(DONE + key.slice(PENDING.length), JSON.stringify({ ...entry, issueUrl: url, syncedAt: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
  await env.BUCKET.delete(key);
  const number = numberOf(url);
  if (entry.kind === 'game' && number) {
    const name = defuse(entry.text.split(/\r?\n/)[0].slice(0, 80));
    /* the "opened" webhook may already have resolved and closed the request before its entry existed (its tick found no
       row): resolveGameRequest stores closed_at before it asks for the tick, so reading it after the insert catches
       every such ordering */
    const resolved = () => env.DB.prepare(`UPDATE issue_tracker_entries SET tick_at=COALESCE(tick_at,?) WHERE repo=? AND issue=?
      AND EXISTS (SELECT 1 FROM game_request_jobs WHERE repo=? AND issue=? AND closed_at IS NOT NULL AND matched_ref IS NOT NULL)`)
      .bind(new Date().toISOString(), repoFor(env), number, repoFor(env), number).run();
    await settle(ctx, trackIssue(env, { id: 'feedback:' + entry.id, tracker: 'game-request', issue: number, name, mergeKey: nameKey(name) }, undefined, resolved));
  }
  return url;
}

export async function feedbackPost(request, env, { readJSON, fail, json, hit, ctx }, ip, now = new Date()) {
  if (!await hit(env, 'feedback', ip, now.getTime()) || !await hit(env, 'feedback-day', ip, now.getTime())) return fail('RATE_LIMITED', 429);
  const body = await readJSON(request, 8 * 1024);
  if (body.error) return fail(body.error, body.error === 'PAYLOAD_TOO_LARGE' ? 413 : 400);
  const checked = validateFeedback(body.value);
  if (!checked.ok) return fail(checked.error);
  if (!env.BUCKET) return fail('NOT_CONFIGURED', 503);
  const id = crypto.randomUUID();
  const key = `${PENDING}${now.toISOString().replace(/[:.]/g, '-')}-${id}.json`;
  const entry = { ...checked.value, id, ipHash: ip, createdAt: now.toISOString() };
  await env.BUCKET.put(key, JSON.stringify(entry), { httpMetadata: { contentType: 'application/json' } });
  let url = '';
  if (env.GITHUB_TOKEN) { try { url = await sync(env, key, entry, ctx); } catch (e) { console.error('feedback sync', e?.message); } }
  return json({ ok: true, id, url, queued: !url }, 201);
}

// cron: open issues for anything still pending (oldest first, a few per run)
export async function syncPendingFeedback(env, max = 10) {
  if (!env.BUCKET?.list || !env.GITHUB_TOKEN) return 0;
  const { objects = [] } = await env.BUCKET.list({ prefix: PENDING, limit: max });
  let done = 0;
  for (const o of objects) {
    try {
      const obj = await env.BUCKET.get(o.key);
      if (!obj) continue;
      const entry = JSON.parse(await new Response(obj.body).text());
      await sync(env, o.key, entry);
      done++;
    } catch (e) { console.error('feedback retry', o.key, e?.message); }
  }
  return done;
}
