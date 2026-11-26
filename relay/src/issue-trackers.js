// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-26 (user: github issues 要分类合并成一个问题，尤其是那个设备探针，合成一个之后里面还能再去一个一个 close)
   Adapter probes, game requests, diagnostics packages and Yui failures no longer stay open one issue each. Each still
   gets its detail issue (key, download link, SHA-256 … stay there), but the relay then
     1. lists it as one checkbox line in the open tracker issue of its kind (found by label + the body marker
        <!-- tracker:<kind> -->, opened and pinned when there is none),
     2. comments 「已登记到汇总 #N」 on the detail issue and closes it (not_planned).
   A game request for a game already listed joins that line (people +1); a newer probe of the same game joins the
   line of its earlier probe; a probe goes under the section of its reason.

   GitHub has no atomic append, so every tracker body is rewritten by one worker at a time: entries are queued in D1
   (issue_tracker_entries, 0041) and whoever takes the D1 lease (issue_tracker_locks) drains the queue for that
   tracker: read the body, add every pending line, read again right before the PATCH (a body changed since, e.g. a
   maintainer ticking a box, means the round is built again on it), PATCH, read again and check each line is really
   there (an edit based on an older page that removed our line makes the round run again). What is left is the
   time of one request between that last read and the PATCH: GitHub offers no conditional write for an issue body.
   After letting the lease go the holder looks once more for rows nobody has tried yet, so an entry queued while the
   lease was taken is never left behind; the 30-minute cron (syncTrackers) retries anything that failed. */

const DEFAULT_REPO = 'ilynthn/MeguLit';
const LEASE = 60000, BATCH = 8, MAX_ATTEMPTS = 48, ROUNDS = 3, WRITE_ROUNDS = 5;
const PENDING = '(closed_at IS NULL OR (tick_at IS NOT NULL AND ticked_at IS NULL))';
const CHECK = /^- \[([ xX])\] /;
const PEOPLE = /^- \[[ xX]\] (.+)（(\d+) 人：(#\d+(?: #\d+)*)）\s*$/;

export const TRACKERS = {
  'adapter-probe': {title: '[适配探针] 汇总', labels: ['adapter-probe'], style: 'dated',
    intro: '所有适配探针汇总在这里，每部游戏一个勾选框：处理完一部就勾一部，不用再开关一堆 issue。原探针 issue 已关闭，详情、key、下载链接都还在原 issue 里（下载链接 30 天有效）。'},
  'game-request': {title: '[想玩] 汇总', labels: ['game-request'], style: 'people',
    intro: '所有「想玩」请求汇总在这里，同一部游戏已合并，括号里是想玩的人数和原请求。适配好一部就勾一部。'},
  diagnostics: {title: '[诊断] 汇总', labels: ['diagnostics'], style: 'dated',
    intro: '所有诊断包汇总在这里，每个包一个勾选框：看完一个就勾一个。原 issue 已关闭，详情和下载链接都还在原 issue 里（下载链接 30 天有效）。'},
  'yui-report': {title: '[Yui] 汇总', labels: ['yui-report', 'diagnostics'], style: 'dated',
    intro: 'Yui 启动故障汇总在这里，每种故障一个勾选框：修好一种就勾一种。原 issue 已关闭，次数和最近一次的阶段还在原 issue 里持续更新。'}
};

export const repoFor = env => /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') ? env.GITHUB_REPO : DEFAULT_REPO;
export const trackerMarker = tracker => `<!-- tracker:${tracker} -->`;
export const nameKey = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
/* one line of a checklist: no line breaks, no "#123" that GitHub would link, no "@name" that would ping, no HTML */
export const trackerName = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/#/g, '＃').replace(/</g, '＜').replace(/>/g, '＞').replace(/@/g, '@‍').slice(0, 120) || '（未命名）';
const refsOf = line => Array.from(line.matchAll(/#(\d+)/g), m => Number(m[1]));
const headingLabel = line => line.slice(4).trim().replace(/（\d+）$/, '').trim();
export const issueNumber = data => Number.isSafeInteger(data?.number) && data.number > 0 ? data.number
  : Number(/\/issues\/(\d+)$/.exec(String(data?.html_url || ''))?.[1]) || null;

function initialTitle(conf) {
  return conf.title + (conf.style === 'people' ? '（0 部游戏 / 0 条请求）' : '（0 条，逐条勾选）');
}

export function retitle(title, body, tracker) {
  const items = String(body || '').split('\n').filter(l => CHECK.test(l));
  if (TRACKERS[tracker]?.style === 'people') {
    const refs = items.reduce((n, l) => n + refsOf(l).length, 0);
    return String(title || '').replace(/（\d+ 部游戏 \/ \d+ 条请求）/, `（${items.length} 部游戏 / ${refs} 条请求）`);
  }
  return String(title || '').replace(/（\d+ 条/, `（${items.length} 条`);
}

function joinLine(line, number, style) {
  const open = line.replace(CHECK, '- [ ] ');
  const people = style === 'people' && PEOPLE.exec(open);
  if (people) return `- [ ] ${people[1]}（${Number(people[2]) + 1} 人：#${number} ${people[3]}）`;
  if (/详情和下载 #\d+/.test(open)) return open.replace(/详情和下载 #/, `详情和下载 #${number} #`);
  return `${open.trimEnd()} #${number}`;
}

function insertLine(lines, line, section, marker) {
  const markerAt = lines.findLastIndex(l => l.includes(marker));
  if (section) {
    const heading = lines.findIndex((l, i) => i < markerAt && l.startsWith('### ') && headingLabel(l) === section);
    if (heading >= 0) {
      let at = heading + 1;
      while (at < lines.length && CHECK.test(lines[at])) at++;
      lines.splice(at, 0, line);
      return;
    }
  } else {
    const last = lines.findLastIndex((l, i) => i < markerAt && CHECK.test(l));
    if (last >= 0) { lines.splice(last + 1, 0, line); return; }
  }
  let at = markerAt;
  while (at > 0 && lines[at - 1].trim() === '') at--;
  const block = section ? ['', `### ${section}（0）`, line] : ['', line];
  lines.splice(at, 0, ...block);
  if (lines[at + block.length].includes(marker)) lines.splice(at + block.length, 0, '');
}

/* The new body of a tracker: every entry with list:true gets its line (or joins the line of a candidate issue / the same
   game), every entry with tick:true has its line ticked. Lines already holding the entry's number are left alone, so a
   round that runs twice changes nothing the second time. */
export function applyEntries(body, tracker, entries) {
  const {style} = TRACKERS[tracker], marker = trackerMarker(tracker);
  const lines = body ? String(body).replace(/\r\n/g, '\n').split('\n') : [];
  if (!lines.some(l => l.includes(marker))) lines.push('', marker);
  const lineOf = number => lines.findIndex(l => CHECK.test(l) && refsOf(l).includes(number));
  for (const entry of entries) {
    if (!entry.list || lineOf(entry.issue) >= 0) continue;
    let at = -1;
    for (const candidate of entry.candidates || []) if ((at = lineOf(candidate)) >= 0) break;
    if (at < 0 && style === 'people') {
      const key = nameKey(entry.name);
      at = lines.findIndex(l => { const m = PEOPLE.exec(l); return !!m && nameKey(m[1]) === key; });
    }
    if (at >= 0) { lines[at] = joinLine(lines[at], entry.issue, style); continue; }
    insertLine(lines, style === 'people' ? `- [ ] ${entry.name}（1 人：#${entry.issue}）`
      : `- [ ] ${entry.name} · ${entry.day} · 详情和下载 #${entry.issue}`, entry.section, marker);
  }
  for (const entry of entries) {
    const at = entry.tick ? lineOf(entry.issue) : -1;
    if (at >= 0) lines[at] = lines[at].replace(CHECK, '- [x] ');
  }
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('### ') || !/（\d+）$/.test(lines[i])) continue;
    let n = 0;
    while (i + 1 + n < lines.length && CHECK.test(lines[i + 1 + n])) n++;
    lines[i] = lines[i].replace(/（\d+）$/, `（${n}）`);
  }
  return lines.join('\n');
}

function satisfied(body, entry) {
  const line = String(body || '').replace(/\r\n/g, '\n').split('\n')
    .find(l => CHECK.test(l) && refsOf(l).includes(entry.issue));
  return {listed: !!line, ticked: !!line && /^- \[[xX]\]/.test(line)};
}

async function gh(env, route, method = 'GET', body) {
  const url = route.startsWith('https://') ? route : `https://api.github.com/repos/${repoFor(env)}${route}`;
  const r = await (env.fetch || fetch)(url, {method, signal: AbortSignal.timeout(15000),
    headers: {authorization: 'Bearer ' + env.GITHUB_TOKEN, accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28', 'user-agent': 'megulit-relay', 'content-type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  if (!r.ok) throw Error(`GITHUB_${r.status} ${method} ${route.split('?')[0]}`);
  return r.json();
}

const entryMarker = id => `<!-- tracker-entry:${id} -->`;

async function findCreated(env, draft, id) {
  const marker = entryMarker(id);
  for (let page = 1; page <= 3; page++) {
    const list = await gh(env, `/issues?state=all&labels=${encodeURIComponent(draft.labels.join(','))}&sort=created&direction=desc&per_page=100&page=${page}`);
    const found = Array.isArray(list) ? list.find(issue => !issue.pull_request && typeof issue.body === 'string' && issue.body.includes(marker)) : null;
    if (found) return issueNumber(found);
    if (!Array.isArray(list) || list.length < 100) break;
  }
  return null;
}

async function acquire(env, key, owner) {
  const t = Date.now();
  const row = await env.DB.prepare(`INSERT INTO issue_tracker_locks(tracker,owner,until) VALUES(?,?,?)
    ON CONFLICT(tracker) DO UPDATE SET owner=excluded.owner,until=excluded.until WHERE issue_tracker_locks.until<?
    RETURNING owner`).bind(key, owner, t + LEASE, t).first();
  return row?.owner === owner;
}

async function hold(env, key, owner) {
  const row = await env.DB.prepare('UPDATE issue_tracker_locks SET until=? WHERE tracker=? AND owner=? RETURNING owner')
    .bind(Date.now() + LEASE, key, owner).first();
  if (row?.owner !== owner) throw Error('TRACKER_LOCK_LOST');
}

const usable = (issue, tracker) => {
  const marker = trackerMarker(tracker);
  return !!issue && !issue.pull_request && issue.state === 'open' && typeof issue.body === 'string' &&
    issue.body.includes(marker) && (issue.body.trimEnd().endsWith(marker) || String(issue.title || '').startsWith(TRACKERS[tracker].title));
};

async function currentTracker(env, repo, tracker, lock, skipCache) {
  const conf = TRACKERS[tracker];
  const remember = number => env.DB.prepare(`INSERT INTO issue_trackers(repo,tracker,issue) VALUES(?,?,?)
    ON CONFLICT(repo,tracker) DO UPDATE SET issue=excluded.issue`).bind(repo, tracker, number).run();
  if (!skipCache) {
    const cached = await env.DB.prepare('SELECT issue FROM issue_trackers WHERE repo=? AND tracker=?').bind(repo, tracker).first();
    if (cached) {
      const issue = await gh(env, `/issues/${cached.issue}`).catch(e => /GITHUB_(404|410) /.test(e.message) ? null : Promise.reject(e));
      if (usable(issue, tracker)) return issue;
    }
  }
  for (let page = 1; page <= 10; page++) {
    const list = await gh(env, `/issues?state=open&labels=${encodeURIComponent(conf.labels.join(','))}&sort=created&direction=asc&per_page=100&page=${page}`);
    const found = Array.isArray(list) ? list.find(issue => usable(issue, tracker)) : null;
    if (found) { await remember(found.number); return found; }
    if (!Array.isArray(list) || list.length < 100) break;
  }
  await lock();
  const made = await gh(env, '/issues', 'POST', {title: initialTitle(conf), body: `${conf.intro}\n\n${trackerMarker(tracker)}`, labels: conf.labels});
  if (!issueNumber(made)) throw Error('TRACKER_ISSUE_NUMBER');
  made.number = issueNumber(made);
  await remember(made.number);
  try {
    await gh(env, 'https://api.github.com/graphql', 'POST', {query: 'mutation($id:ID!){pinIssue(input:{issueId:$id}){issue{number}}}', variables: {id: made.node_id}});
  } catch {}
  return {state: 'open', title: initialTitle(conf), body: `${conf.intro}\n\n${trackerMarker(tracker)}`, ...made};
}

async function updateTracker(env, repo, tracker, rows, lock, stamp, fixed = null) {
  for (const row of rows) {
    const candidates = [];
    if (row.merge_key) {
      const {results} = await env.DB.prepare(`SELECT issue FROM issue_tracker_entries WHERE repo=? AND tracker=? AND merge_key=?
        AND issue IS NOT NULL AND issue<>? ORDER BY created_at DESC LIMIT 20`).bind(repo, tracker, row.merge_key, row.issue).all();
      candidates.push(...results.map(r => r.issue));
    }
    if (row.merge_ref) candidates.push(row.merge_ref);
    row.candidates = candidates;
  }
  const entries = () => rows.map(row => ({issue: row.issue, name: row.name, day: row.day, section: row.section,
    candidates: row.candidates, list: !row.listed_at, tick: !!row.tick_at && !row.ticked_at}));
  /* fixed: a tick for a line already listed goes to the tracker that holds it, open or closed */
  let issue = fixed ? await gh(env, `/issues/${fixed}`) : await currentTracker(env, repo, tracker, lock, false);
  for (let round = 0; round < WRITE_ROUNDS; round++) {
    const want = entries(), body = applyEntries(issue.body, tracker, want), title = retitle(issue.title, body, tracker);
    if (body !== issue.body || title !== issue.title) {
      await lock();
      /* GitHub has no conditional update for an issue body: read once more right before writing, and when anyone
         (a maintainer ticking a box) wrote since the body this round was built on, build it again on theirs */
      const fresh = await gh(env, `/issues/${issue.number}`);
      if (fresh.body !== issue.body || fresh.title !== issue.title || fresh.state !== issue.state) {
        issue = fixed || usable(fresh, tracker) ? fresh : await currentTracker(env, repo, tracker, lock, true);
        continue;
      }
      await gh(env, `/issues/${issue.number}`, 'PATCH', {body, title});
      issue = await gh(env, `/issues/${issue.number}`);
    }
    for (const row of rows) {
      const state = satisfied(issue.body, {issue: row.issue});
      if (state.listed && !row.listed_at) {
        await env.DB.prepare('UPDATE issue_tracker_entries SET listed_at=COALESCE(listed_at,?),tracker_issue=? WHERE id=?')
          .bind(stamp, issue.number, row.id).run();
        row.listed_at = stamp;
      }
      if (state.listed) row.tracker_issue = issue.number;
      if (state.ticked && row.tick_at && !row.ticked_at) {
        await env.DB.prepare('UPDATE issue_tracker_entries SET ticked_at=? WHERE id=?').bind(stamp, row.id).run();
        row.ticked_at = stamp;
      }
    }
    if (!entries().some(e => e.list || e.tick)) return;
    if (!fixed && !usable(issue, tracker)) issue = await currentTracker(env, repo, tracker, lock, true);
  }
  throw Error('TRACKER_CONFLICT');
}

async function work(env, repo, tracker, key, owner, now) {
  const stamp = now.toISOString(), lock = () => hold(env, key, owner);
  const {results: rows} = await env.DB.prepare(`SELECT * FROM issue_tracker_entries WHERE repo=? AND tracker=? AND ${PENDING}
    AND attempts<? ORDER BY created_at,id LIMIT ?`).bind(repo, tracker, MAX_ATTEMPTS, BATCH).all();
  if (!rows.length) return;
  for (const row of rows) {
    await env.DB.prepare('UPDATE issue_tracker_entries SET attempts=attempts+1,last_attempt=? WHERE id=?').bind(Date.now(), row.id).run();
  }
  const failed = (row, error) => env.DB.prepare('UPDATE issue_tracker_entries SET last_error=? WHERE id=?')
    .bind(String(error?.message || error).slice(0, 300), row.id).run();
  for (const row of rows) {
    if (row.issue || !row.draft) continue;
    try {
      await lock();
      const draft = JSON.parse(row.draft);
      /* an earlier attempt may have created the issue and lost the answer: find it by its entry marker first */
      let number = row.creating_at ? await findCreated(env, draft, row.id) : null;
      if (!number) {
        await env.DB.prepare('UPDATE issue_tracker_entries SET creating_at=COALESCE(creating_at,?) WHERE id=?').bind(stamp, row.id).run();
        number = issueNumber(await gh(env, '/issues', 'POST', {title: draft.title, body: draft.body, labels: draft.labels}));
      }
      if (!number) throw Error('DETAIL_ISSUE_NUMBER');
      await env.DB.prepare('UPDATE issue_tracker_entries SET issue=? WHERE id=?').bind(number, row.id).run();
      row.issue = number;
    } catch (error) { await failed(row, error); }
  }
  /* new lines go to the open tracker; a tick goes to the tracker its line was written to (it may be closed by now) */
  const open = rows.filter(row => row.issue && (!row.listed_at || (row.tick_at && !row.ticked_at && !row.tracker_issue)));
  const groups = [[null, open]];
  for (const row of rows) {
    if (!row.issue || !row.listed_at || !row.tick_at || row.ticked_at || !row.tracker_issue) continue;
    const group = groups.find(([number]) => number === row.tracker_issue);
    if (group) group[1].push(row); else groups.push([row.tracker_issue, [row]]);
  }
  for (const [number, group] of groups) {
    if (!group.length) continue;
    try { await updateTracker(env, repo, tracker, group, lock, stamp, number); }
    catch (error) { for (const row of group) if (!row.listed_at || (row.tick_at && !row.ticked_at)) await failed(row, error); }
  }
  for (const row of rows) {
    if (!row.issue || !row.listed_at || row.closed_at) continue;
    try {
      if (!row.noted_at) {
        await gh(env, `/issues/${row.issue}/comments`, 'POST', {body: `已登记到汇总 #${row.tracker_issue}，在汇总里逐条勾选处理。`});
        await env.DB.prepare('UPDATE issue_tracker_entries SET noted_at=? WHERE id=?').bind(stamp, row.id).run();
      }
      await gh(env, `/issues/${row.issue}`, 'PATCH', {state: 'closed', state_reason: 'not_planned'});
      await env.DB.prepare('UPDATE issue_tracker_entries SET closed_at=?,last_error=NULL WHERE id=?').bind(stamp, row.id).run();
    } catch (error) { await failed(row, error); }
  }
}

/* Drain the queue of one tracker while holding its lease; a worker that finds the lease taken leaves its row to the
   holder (who looks again after letting go) or to the cron. */
export async function drainTracker(env, tracker, now = new Date()) {
  if (!env.DB || !env.GITHUB_TOKEN || !TRACKERS[tracker]) return {skipped: true};
  const repo = repoFor(env), key = `${repo} ${tracker}`;
  for (let round = 0; round < ROUNDS; round++) {
    const owner = crypto.randomUUID(), start = Date.now();
    if (!await acquire(env, key, owner)) return {busy: true};
    try { await work(env, repo, tracker, key, owner, now); }
    finally { await env.DB.prepare('DELETE FROM issue_tracker_locks WHERE tracker=? AND owner=?').bind(key, owner).run(); }
    const more = await env.DB.prepare(`SELECT id FROM issue_tracker_entries WHERE repo=? AND tracker=? AND ${PENDING}
      AND attempts<? AND last_attempt<? LIMIT 1`).bind(repo, tracker, MAX_ATTEMPTS, start).first();
    if (!more) return {ok: true};
  }
  return {ok: true, more: true};
}

/* Queue one detail issue for its tracker. entry: {id, tracker, name, issue?|draft:{title,body,labels}, section?,
   mergeKey?, mergeRef?}. Idempotent per id and per detail issue number. */
export async function registerTrackerEntry(env, entry, now = new Date()) {
  if (!env.DB || !env.GITHUB_TOKEN || !TRACKERS[entry.tracker]) return false;
  const issue = Number.isSafeInteger(entry.issue) && entry.issue > 0 ? entry.issue : null;
  if (!issue && !entry.draft) return false;
  await env.DB.prepare(`INSERT OR IGNORE INTO issue_tracker_entries(id,repo,tracker,name,day,section,merge_key,merge_ref,draft,issue,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(entry.id, repoFor(env), entry.tracker, trackerName(entry.name), now.toISOString().slice(0, 10), entry.section ? trackerName(entry.section) : '',
      entry.mergeKey || '', Number.isSafeInteger(entry.mergeRef) ? entry.mergeRef : null,
      issue ? null : JSON.stringify({...entry.draft, body: `${entry.draft.body}\n\n${entryMarker(entry.id)}`}), issue, now.toISOString()).run();
  return true;
}

/* register + drain; never throws (the detail issue simply stays open when the tracker cannot be reached, and the cron
   tries again) */
export async function trackIssue(env, entry, now = new Date(), afterRegister = null) {
  try {
    if (await registerTrackerEntry(env, entry, now)) {
      if (afterRegister) await afterRegister();
      return await drainTracker(env, entry.tracker, now);
    }
  } catch (error) { console.error('issue tracker', entry.tracker, error?.message); }
  return null;
}

/* in the request: after the response (ctx.waitUntil) when there is a ctx, else awaited (tests, cron) */
export function settle(ctx, job) {
  const safe = Promise.resolve(job).catch(error => console.error('issue tracker', error?.message));
  if (ctx?.waitUntil) { ctx.waitUntil(safe); return Promise.resolve(); }
  return safe;
}

export async function syncTrackers(env, now = new Date()) {
  if (!env.DB || !env.GITHUB_TOKEN) return 0;
  const {results} = await env.DB.prepare(`SELECT DISTINCT tracker FROM issue_tracker_entries WHERE repo=? AND ${PENDING} AND attempts<?`)
    .bind(repoFor(env), MAX_ATTEMPTS).all();
  let n = 0;
  for (const {tracker} of results) {
    try { await drainTracker(env, tracker, now); n++; } catch (error) { console.error('issue tracker cron', tracker, error?.message); }
  }
  return n;
}

export async function trackerEntry(env, repo, number) {
  try {
    return await env.DB.prepare('SELECT * FROM issue_tracker_entries WHERE repo=? AND issue=?').bind(repo, number).first();
  } catch { return null; }
}

/* a resolved game request: tick its line (queued, so it survives a busy lease or a GitHub outage) */
export async function requestTrackerTick(env, repo, number, now = new Date()) {
  let row;
  try {
    row = await env.DB.prepare('UPDATE issue_tracker_entries SET tick_at=COALESCE(tick_at,?) WHERE repo=? AND issue=? RETURNING tracker')
      .bind(now.toISOString(), repo, number).first();
  } catch { return false; }
  if (!row) return false;
  try { await drainTracker(env, row.tracker, now); } catch (error) { console.error('issue tracker tick', error?.message); }
  return true;
}
