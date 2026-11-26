// SPDX-License-Identifier: GPL-3.0-or-later
import requestIdentity from '../../core/game-request-selector.cjs';
import {seedAdminAuthorized} from './seed-admin.js';
import {lookup} from './torch-release.js';
import {FEEDBACK_KINDS} from './feedback.js';
import {requestTrackerTick, trackerEntry} from './issue-trackers.js';

const HEX = /^[a-f0-9]{64}$/;
const GENERATION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const kinds = ['available', 'skeleton', 'backlog', 'generating'];
const generationMinutes = 360;

const {parseSelector} = requestIdentity;

export function gameRequestSelector(issue, env, repo, number) {
  const author = env.GAME_REQUEST_ISSUE_AUTHOR || (repo === 'ilynthn/MeguLit' ? 'ilynthn' : '');
  if (!author || issue?.number !== number || issue.pull_request ||
      issue.html_url !== `https://github.com/${repo}/issues/${number}` || issue.user?.login !== author ||
      !Array.isArray(issue.labels) || issue.labels.length !== 1 || issue.labels[0]?.name !== FEEDBACK_KINDS.game.label ||
      !/^\[(软件|官网)想玩\] /.test(issue.title || '') || typeof issue.body !== 'string') return null;
  const lines = issue.body.replace(/\r\n/g, '\n').split('\n');
  const fromApp = issue.title.startsWith('[软件');
  if (lines.length !== 6 || lines[1] || lines[4] || !lines[2].startsWith('联系方式：') ||
      (fromApp ? !lines[3].startsWith('界面语言：') || !/^_来自 MeguLit 软件(?: v[\w.-]+)?，由 relay 自动创建_$/.test(lines[5])
        : !lines[3].startsWith('网站语言：') || lines[5] !== '_来自 megulit.com 的表单，由 relay 自动创建_')) return null;
  const prefix = '**想玩的游戏**：';
  const input = lines[0].slice(prefix.length);
  if (!lines[0].startsWith(prefix) || issue.title !== (fromApp ? '[软件想玩] ' : '[官网想玩] ') + input.slice(0,80)) return null;
  return parseSelector(input);
}

function reference(kind, ref) {
  if (typeof ref !== 'string') return false;
  if (kind === 'backlog') return /^[1-9]\d{0,8}$/.test(ref);
  return (kind === 'generating' ? GENERATION_ID : HEX).test(ref);
}

async function sourceExists(env, repo, selector, kind, ref) {
  const db = env.DB;
  if (kind === 'generating') return true; // The authenticated worker's active lease is the durable job record.
  if (kind === 'skeleton') {
    return !!await db.prepare(`SELECT id FROM seed_admin_items AS item
      WHERE id=? AND engine=? AND state<>'deleted' AND (
        (kind='probe-skeleton' AND json_extract(body,'$.status')='skeleton')
        OR (kind='repository' AND layer='version' AND game_key=?
          AND json_extract(body,'$.sourceCommit')=(SELECT value FROM seed_admin_meta WHERE name='repository_snapshot')
          AND EXISTS (
            SELECT 1 FROM seed_admin_items AS game WHERE game.kind='repository' AND game.layer='game'
              AND game.engine=item.engine AND game.state<>'deleted' AND json_extract(game.body,'$.sourceStatus')='skeleton'
              AND json_extract(game.body,'$.sourceCommit')=json_extract(item.body,'$.sourceCommit')
              AND replace(item.source_path,'/versions/'||item.game_key||'.json','/game.json')=game.source_path
          ))
      )`).bind(ref, selector.engine, selector.exe).first();
  }
  if (kind === 'backlog') {
    return !!await db.prepare(`SELECT issue FROM probe_issue_disposition WHERE repo=? AND issue=?
      AND length(markdown)>0`).bind(repo, Number(ref)).first();
  }
  try {
    const current = await lookup(db, selector.exe, env);
    return current?.publication.hash === ref && current.release.profile.engine === selector.engine && current.release.review.identity.script === selector.script;
  } catch (error) {
    if (['TORCH_REVOKED', 'TORCH_HISTORY'].includes(error.code)) return false;
    throw error;
  }
}

export async function gameRequestEvidence(request, env, repo, now, url, {readJSON, json, fail, onRegistered}) {
  if (!seedAdminAuthorized(request, env)) return fail('UNAUTHORIZED', 401);
  if (request.method === 'GET') {
    if (url.searchParams.has('selector')) {
      const selector = parseSelector(url.searchParams.get('selector'));
      if (!selector) return fail('INVALID_SELECTOR', 400);
      const records = await env.DB.prepare(`SELECT kind,ref FROM game_request_evidence WHERE selector=?
        AND ended_at IS NULL AND (expires_at IS NULL OR expires_at>?) ORDER BY registered_at DESC`)
        .bind(selector.key,now.toISOString()).all();
      for (const row of records.results) {
        if (await sourceExists(env,repo,selector,row.kind,row.ref)) return json({selector:selector.key,...row});
      }
      return fail('NOT_FOUND',404);
    }
    const number = Number(url.searchParams.get('issue'));
    if (!Number.isSafeInteger(number) || number < 1) return fail('INVALID_ISSUE', 400);
    const job = await env.DB.prepare(`SELECT issue,selector,matched_kind AS status,matched_ref AS ref,closed_at AS closedAt
      FROM game_request_jobs WHERE repo=? AND issue=?`).bind(repo, number).first();
    return job ? json(job) : fail('NOT_FOUND', 404);
  }
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405);
  const {value, error} = await readJSON(request, 4096);
  if (error) return fail(error, 400);
  const {selector: raw, kind, ref, ended = false} = value || {};
  const selector = parseSelector(raw);
  if (!selector || !kinds.includes(kind) || !reference(kind, ref) || typeof ended !== 'boolean') {
    return fail('INVALID_GAME_REQUEST_EVIDENCE', 400);
  }
  const db = env.DB, stamp = now.toISOString();
  if (ended) {
    await db.prepare('UPDATE game_request_evidence SET ended_at=? WHERE kind=? AND ref=? AND selector=?')
      .bind(stamp, kind, ref, selector.key).run();
    return json({ok: true});
  }
  if (!await sourceExists(env, repo, selector, kind, ref)) return fail('EVIDENCE_NOT_FOUND', 404);
  const expires = kind === 'generating' ? new Date(+now + generationMinutes * 60000).toISOString() : null;
  await db.prepare(`INSERT INTO game_request_evidence(selector,kind,ref,registered_at,expires_at) VALUES(?,?,?,?,?)
    ON CONFLICT(kind,ref) DO UPDATE SET expires_at=excluded.expires_at
      WHERE game_request_evidence.selector=excluded.selector AND game_request_evidence.ended_at IS NULL`)
    .bind(selector.key, kind, ref, stamp, expires).run();
  const stored = await db.prepare('SELECT selector,ended_at FROM game_request_evidence WHERE kind=? AND ref=?').bind(kind, ref).first();
  if (stored?.selector !== selector.key || stored.ended_at) return fail('EVIDENCE_CONFLICT', 409);
  await onRegistered(selector.key);
  return json({ok: true}, 201);
}

export async function trackGameRequest(env, repo, number, selector, now) {
  await env.DB.prepare(`INSERT INTO game_request_jobs(repo,issue,selector,created_at) VALUES(?,?,?,?)
    ON CONFLICT(repo,issue) DO UPDATE SET selector=excluded.selector,matched_kind=NULL,matched_ref=NULL
      WHERE game_request_jobs.closed_at IS NULL AND game_request_jobs.selector<>excluded.selector
        AND (game_request_jobs.closing_until IS NULL OR game_request_jobs.closing_until<=excluded.created_at)`)
    .bind(repo, number, selector.key, now.toISOString()).run();
}

export async function resolveGameRequest(env, repo, number, now, github) {
  const db = env.DB;
  const job = await db.prepare('SELECT * FROM game_request_jobs WHERE repo=? AND issue=?').bind(repo, number).first();
  if (!job || job.closed_at) return 'closed';
  const stamp = now.toISOString();
  await db.prepare('UPDATE game_request_jobs SET last_attempt_at=? WHERE repo=? AND issue=?').bind(stamp, repo, number).run();
  const selector = parseSelector(job.selector);
  const {results: evidence} = await db.prepare(`SELECT kind,ref FROM game_request_evidence
    WHERE selector=? AND ended_at IS NULL AND (expires_at IS NULL OR expires_at>?)
    ORDER BY CASE kind WHEN 'available' THEN 0 WHEN 'skeleton' THEN 1 WHEN 'backlog' THEN 2 ELSE 3 END,
      registered_at DESC LIMIT 20`).bind(selector.key, stamp).all();
  if (!evidence.length) return 'open';
  const response = await github(env, repo, number);
  if (!response.ok) return 'retry';
  const issue = await response.json();
  if (gameRequestSelector(issue, env, repo, number)?.key !== selector.key) return 'open';
  /* 2026-11-26 a request listed in the [想玩] 汇总 tracker was closed by the relay right after it was listed: it is
     resolved by ticking its tracker line instead of closing the issue (issue-trackers.js) */
  const tracked = !!(await trackerEntry(env, repo, number))?.listed_at;
  if (issue.state === 'closed' && job.matched_ref && !tracked) {
    await db.prepare('UPDATE game_request_jobs SET closed_at=? WHERE repo=? AND issue=? AND selector=?')
      .bind(stamp, repo, number, selector.key).run();
    return 'closed';
  }
  if (issue.state !== 'open' && !tracked) return 'open';
  for (const {kind, ref} of evidence) {
    if (!await sourceExists(env, repo, selector, kind, ref)) continue;
    const token = crypto.randomUUID(), until = new Date(+now + 60000).toISOString();
    const saved = await db.prepare(`UPDATE game_request_jobs SET matched_kind=?,matched_ref=?,closing_token=?,closing_until=?
      WHERE repo=? AND issue=? AND selector=? AND closed_at IS NULL AND (closing_until IS NULL OR closing_until<=?) AND EXISTS
        (SELECT 1 FROM game_request_evidence WHERE selector=? AND kind=? AND ref=?
          AND ended_at IS NULL AND (expires_at IS NULL OR expires_at>?)) RETURNING issue`)
      .bind(kind, ref, token, until, repo, number, selector.key, stamp, selector.key, kind, ref, stamp).first();
    if (!saved) return 'open';
    let closed = false;
    try {
      if (tracked) closed = await requestTrackerTick(env, repo, number, now);
      else closed = (await github(env, repo, number, 'PATCH')).ok;
    } finally {
      await db.prepare(`UPDATE game_request_jobs SET closed_at=?,closing_token=NULL,closing_until=NULL
        WHERE repo=? AND issue=? AND closing_token=?`).bind(closed ? stamp : null, repo, number, token).run();
    }
    /* closed by PATCH while its tracker entry may still be on the way: the tick is asked only after closed_at is
       stored, so a registration that finds no tick here reads closed_at instead (feedback.js) */
    if (closed && !tracked) await requestTrackerTick(env, repo, number, now);
    return closed ? 'closed' : 'retry';
  }
  return 'open';
}

export async function retryGameRequests(env, repo, now, github, selector) {
  let after = 0;
  do {
    const {results} = await env.DB.prepare(`SELECT issue FROM game_request_jobs
      WHERE repo=? AND selector=? AND issue>? AND closed_at IS NULL ORDER BY issue LIMIT 50`)
      .bind(repo, selector, after).all();
    for (const {issue} of results) {
      if (await resolveGameRequest(env, repo, issue, now, github) === 'retry') throw Error('GAME_REQUEST_CLOSE_PENDING');
      after = issue;
    }
    if (results.length < 50) return;
  } while (true);
}
