# MeguLit relay

One Cloudflare Worker that MeguLit's online features talk to, so nothing depends on reaching GitHub from mainland China:

| Endpoint | Used by | Storage |
|---|---|---|
| `POST /api/diagnostics` | 诊断上传 (`services/diagnostics-upload.cjs`) | zip in R2, a GitHub issue on `ilynthn/MeguLit` |
| `POST /api/adaptation`, `POST /api/adaptation/query`, `GET /api/adaptation?fp=` | 共享适配 (`services/shared-adaptation-sync.cjs`) | D1 `adaptation_records` |
| `POST` / `GET` / `DELETE /api/leaderboard` | 排行榜 (`services/leaderboard.cjs`) | D1 `leaderboard_*` |
| `POST/GET/DELETE /api/leaderboard/avatar`, `GET /api/avatar/:id`, `POST /api/avatar/:id/report` | 排行榜头像 | R2 `avatars/`, D1 `avatars`, `avatar_reports`, `moderation_queue` |
| `GET /api/hotwords` + weekly cron | 每周热词 | D1 `hot_lookups` (raw, deleted after settling), `hot_awards`, `hot_weeks` |
| `/api/auth/*`, `/api/me`, `/api/sync/*` | 账号与云同步 (`relay/ACCOUNTS.md`) | D1 `accounts`, `account_sessions`, `sync_records` |
| `GET /api/health` | checks | none |

Nothing is deployed yet. The app works without the relay: each feature reports "not configured" until the
client knows the relay's address (see [Point the app at the relay](#5-point-the-app-at-the-relay)).

## What you need

- A Cloudflare account, with the domain you want to use added as a zone (for example `megulit.example` → `relay.megulit.example`).
- A GitHub fine-grained token with access to **ilynthn/MeguLit** only, permission **Issues: Read and write**. Nothing else.
- Node.js 18 or newer. Wrangler comes from `npm install` in this folder.

The token file the debug session reads should hold these lines (it stays outside the repo and is never committed):

```
CLOUDFLARE_ACCOUNT_ID=...
RELAY_HOST=relay.megulit.example
GITHUB_TOKEN=github_pat_...
```

## Deploy

All commands run inside `relay/`.

### 1. Install and sign in

```bash
cd relay
npm install
npx wrangler login
npx wrangler whoami
```

`wrangler login` opens a browser for the Cloudflare sign-in. In a non-interactive shell, use an API token instead:
`CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...` in the environment (token permissions: Workers Scripts Edit,
D1 Edit, Workers R2 Storage Edit, Zone → Workers Routes Edit for the zone).

### 2. Create the database and the bucket

```bash
npx wrangler d1 create megulit-relay
```

Copy the `database_id` it prints into `wrangler.toml` (replace `REPLACE_WITH_D1_DATABASE_ID`). Then:

```bash
npx wrangler d1 migrations apply megulit-relay --remote
npx wrangler r2 bucket create megulit-diagnostics
```

Optional, keeps the bucket small: delete diagnostics after 90 days.

```bash
npx wrangler r2 bucket lifecycle add megulit-diagnostics expire-diagnostics diagnostics/ --expire-days 90
```

`migrations apply` runs every file in `migrations/` in order: `0001_init.sql` (leaderboard, adaptation, diagnostics),
`0005_accounts.sql` (accounts, relay/ACCOUNTS.md), `0006_community.sql` (avatars, reports, hot words) and
`0007_social.sql` (public profiles, follows, profile reports; adds `last_at` to `leaderboard_games`) and
`0008_learning.sql` (`reviews` and `kana` columns on `leaderboard_stats`: word reviews incl. Anki, and kana questions
answered; older clients leave them out and they count as 0). Avatars live in
the same bucket as diagnostics under `avatars/`; do not add a lifecycle rule for that prefix.

### 2b. Workers AI (avatar moderation and hot-word guesses)

The Worker reaches Workers AI through the `[ai]` binding in `wrangler.toml` (`binding = "AI"`); no AI token is stored
in the Worker. The deploy token needs nothing extra for the binding. Usage is billed to the account (free daily
allowance first).

| Use | Model (var) | Notes |
|---|---|---|
| Avatar NSFW check | `@cf/meta/llama-3.2-11b-vision-instruct` (`AVATAR_MODEL`) | Answers SAFE / UNSAFE. Only a clean `SAFE` publishes; UNSAFE, an unclear answer, a model error or a missing binding all reject. |
| "为什么是这个词" | `@cf/meta/llama-3.1-8b-instruct` (`HOT_MODEL`) | One call per category per week for the top 10. If it fails, a plain "N 位读者查过" line is stored and not labelled as AI. |

The Llama 3.2 vision model needs its license accepted once per account before the first real call. Run this once
(an API token with **Account → Workers AI → Read** is enough; it is not stored anywhere):

```bash
curl https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/meta/llama-3.2-11b-vision-instruct   -H "Authorization: Bearer $CLOUDFLARE_AI_TOKEN" -d '{"prompt":"agree"}'
```

Until that is done every avatar is rejected with `MODERATION_ERROR` (fail closed), which is safe but means no avatars.
`HOT_MIN_USERS` (default 3) is the privacy threshold for hot words, `REPORT_THRESHOLD` (default 3) the number of
different reporters that hides an avatar.

The weekly settlement runs from `[triggers] crons = ["0 16 * * SUN"]` (Monday 00:00 UTC+8). It settles every finished
week that still has raw rows, so a missed run catches up the next week. To run it by hand while testing locally:
`npx wrangler dev --test-scheduled`, then `curl "http://127.0.0.1:8787/__scheduled?cron=0+16+*+*+SUN"`.

### 3. Secrets

Each command asks for the value on stdin; nothing is written to disk.

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put LINK_SECRET
npx wrangler secret put HASH_SALT
```

- `GITHUB_TOKEN`: the fine-grained token above. Without it, uploads are still stored and the reply has an empty `issueUrl`.
- `LINK_SECRET`: any long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). It signs the time-limited download links in issues.
- `HASH_SALT`: another random string; client IPs are only stored as salted hashes for rate limiting.
- Optional `DIAG_TOKEN`: if set, `POST /api/diagnostics` needs `Authorization: Bearer <DIAG_TOKEN>`. It ships inside the app, so it only stops casual abuse.

From a script, pipe the value in: `printf '%s' "$GITHUB_TOKEN" | npx wrangler secret put GITHUB_TOKEN`.

#### Profile reports go to a private repository

Profile reports contain what the reported reader wrote, so they never go to the public repository. Create a
**private** repository only you can see (for example `ilynthn/megulit-reports`), then:

```bash
npx wrangler secret put REPORT_REPO     # owner/name of the private repository
npx wrangler secret put REPORT_TOKEN    # optional: a fine-grained token for that repository only
```

- `REPORT_TOKEN`: fine-grained token, repository access = only the private reports repository, permission
  **Issues: Read and write** (Metadata read-only comes with it). Without it the relay uses `GITHUB_TOKEN`, which then
  must include the private repository as well.
- Without `REPORT_REPO` no issue is opened at all (the relay never falls back to `GITHUB_REPO`); reports still hide the
  profile and wait in `moderation_queue` with kind `profile`.

### 4. Custom domain and deploy

In `wrangler.toml`, replace `relay.example.com` in

```toml
routes = [
  { pattern = "relay.example.com", custom_domain = true }
]
```

with the real host (`RELAY_HOST`). With `custom_domain = true` Cloudflare creates the DNS record and certificate on
deploy; the zone must be on the same account. Then:

```bash
npx wrangler deploy
curl https://relay.megulit.example/api/health
```

The last command should print `{"ok":true,"service":"megulit-relay"}`.

Create the `diagnostics` label in the GitHub repo once (Issues → Labels), or let the first issue create it (GitHub
creates unknown labels when the token can write issues).

### 5. Point the app at the relay

The client reads one address for all three features: `services/relay-config.cjs` → `relayBase(root)`.

- For a release: set `DEFAULT_RELAY_BASE = 'https://relay.megulit.example'` in `services/relay-config.cjs`.
- For testing without a release: Settings → 联网服务 → 联网服务地址, or the `MEGULIT_RELAY_BASE` environment variable.

## Local testing

```bash
npx wrangler d1 migrations apply megulit-relay --local
npx wrangler dev
```

Put local-only secrets in `relay/.dev.vars` (git-ignored), e.g. `LINK_SECRET=dev`. Then set `MEGULIT_RELAY_BASE=http://127.0.0.1:8787`
before starting MeguLit. The handler logic is also covered by `node --test validation/relay.test.cjs` from the repo root,
which runs the Worker against an in-memory SQLite stand-in for D1.

## API

All JSON replies have `cache-control: no-store`. Errors are `{"ok":false,"error":"CODE"}` with 400 (validation),
401, 404, 405, 410 (expired link), 413 (too large) or 429 (rate limited).

### Leaderboard

```
POST /api/leaderboard
{"version":1,"id":"<uuid v4>","name":"めぐみん","keys":{"week":"2026-W46","month":"2026-11"},
 "stats":{"week":{"characters":0,"seconds":0,"words":0,"streak":0,"reviews":0,"kana":0},"month":{...},"all":{...}},
 "games":[{"title":"ATRI","characters":120000,"seconds":36000}]}          → {"ok":true}
GET /api/leaderboard?period=week|month|all&metric=characters|seconds|words|streak|reviews|kana[&key=2026-W46][&me=<sha256 of id>]
                                                                        → {"entries":[{"rank","name","value","me"}],"total","me":{"rank","value"}|null}
GET /api/leaderboard?metric=games                                       → {"games":[{"title","readers","top":{"name","value"}}]}
GET /api/leaderboard?metric=games&game=ATRI                             → {"entries":[...],"total","me"}
DELETE /api/leaderboard?id=<uuid>                                       → {"ok":true}
```

- Only `sha256(id)` is stored. Replies never contain ids or hashes, only names and numbers.
- Nicknames: 2–16 characters after NFKC, no links, quotes, control or zero-width characters, and a block list (same rules as the client).
- Period keys must match the server's current week/month within ±14 hours. Values above realistic caps (`CAPS` in `src/validate.js`) are rejected.
- Sending a POST without `games` removes the user's per-game rows (the user turned 公开读过的游戏 off).

### Shared adaptation

```
POST /api/adaptation        {"version":1,"records":[<megulit.adaptation v1>, ...]}   (≤ 50, ≤ 16 KB each) → {"ok":true,"accepted","rejected"}
POST /api/adaptation/query  {"version":1,"keys":["<64 hex>", ...]}                   (≤ 50)             → {"records":[...]}
GET  /api/adaptation?fp=<64 hex>,<64 hex>                                                                → {"records":[...]}
```

Records are keyed by `record.key` (64 hex). A later upload for the same key replaces the stored record and counts a report.
Records that look like they carry a Windows path or user folder are rejected.

### Diagnostics

```
POST /api/diagnostics   multipart/form-data
  meta     JSON  {"schema":1,"version":"1.2.8d","game":{"id","title","engine"},"os","size","sha256","createdAt","note"}
  package  zip   ≤ 20 MB   (the part may also be named "file")
→ 201 {"ok":true,"id":"<uuid>","issueUrl":"https://github.com/ilynthn/MeguLit/issues/<n>"}
```

The zip must start with `PK`; when `meta.sha256` is given it must match. The issue (label `diagnostics`) lists the meta
and a link `GET /api/diagnostics/download/<id>?exp=&sig=` signed with `LINK_SECRET`, valid for `LINK_DAYS` (30) days.
Issues on a public repo are public, so anyone with the issue can download the package until the link expires.

### Avatars

```
POST   /api/leaderboard/avatar?id=<uuid>   body: still WebP, square, 32–256 px, ≤ 64 KB, content-type image/webp
                                            → {"ok":true,"status":"approved"|"rejected","reason","avatar":"<32 hex>"|null}
GET    /api/leaderboard/avatar?id=<uuid>   → {"status":"none"|"pending"|"approved"|"rejected"|"hidden","reason","avatar"}
DELETE /api/leaderboard/avatar?id=<uuid>   → {"ok":true}
GET    /api/avatar/<avatar id>              → image/webp, only while approved (404 for pending / rejected / hidden)
POST   /api/avatar/<avatar id>/report[?id=<uuid>]   → {"ok":true,"hidden":bool}
```

With `authorization: Bearer <account token>` the account is the identity instead of the install id (one row and one
avatar across PCs). The user must have joined the leaderboard first (403 `NOT_JOINED`). Leaderboard rows carry
`avatar` (the approved id or null); avatar ids are random per upload and say nothing about the user.

### Appeals (the check got it wrong)

A rejected picture is kept privately in R2 (never served by `/api/avatar/:id`). In Settings › 联网服务 its owner can
press 「判断错了？提交人工复核」 once per picture:

```
POST /api/leaderboard/avatar/appeal?id=<uuid>   body {"version":"1.2.9"}   → {"ok":true,"issueUrl":"https://github.com/.../issues/<n>"}
GET  /api/avatar/<avatar id>/review?exp=&sig=                             → image/webp, private, for the reviewer only
```

The relay opens an issue labelled `avatar-appeal` (create the label once, or let the first issue create it) with the
verdict, the model's raw answer, the app version, a review link signed with `LINK_SECRET` that expires after 72 hours
(linked, not embedded, so nothing shows inline on the public issue), and the two `wrangler d1 execute` commands to
approve or keep the rejection. It also adds a `moderation_queue` row of kind `appeal`. Approving makes the picture
public right away; the user's Settings page picks it up on the next visit. Rejected pictures nobody appealed are
deleted by the weekly cron after 30 days (status `expired`). Appeals: 3 per day per user.

### Moderation queue

Avatars reported by `REPORT_THRESHOLD` different people are hidden and queued. Review from the CLI:

```bash
npx wrangler d1 execute megulit-relay --remote --command "SELECT id,subject,reason,datetime(created_at,'unixepoch') FROM moderation_queue WHERE resolved_at=0"
```

Look at the picture with `npx wrangler r2 object get megulit-diagnostics/avatars/<subject>.webp --file a.webp --remote`. Then either restore it:

```bash
npx wrangler d1 execute megulit-relay --remote --command "UPDATE avatars SET status='approved',reason='' WHERE avatar_id='<subject>'; DELETE FROM avatar_reports WHERE avatar_id='<subject>'; UPDATE moderation_queue SET resolved_at=unixepoch() WHERE subject='<subject>'"
```

or reject it for good: `UPDATE avatars SET status='rejected',reason='REVIEWED' WHERE avatar_id='<subject>'` plus the
same `moderation_queue` update, and delete the R2 object.

### Weekly hot words

Each leaderboard POST may carry `"hot":{"week":"2026-W46","terms":[{"term":"仕方ない","count":3}]}` (≤ 100 terms,
1–40 characters with kana or kanji, count 1–1000): this week's lookups of a joined user, term and count only. Weeks
start Monday 00:00 UTC+8. Settlement keeps terms looked up by at least `HOT_MIN_USERS` different people, drops terms on
the name block list, sorts each of 词汇 / 短语 / 短句 (`classifyTerm` in `src/validate.js`) by people then lookups, keeps
50, adds the AI guess for the top 10, freezes them in `hot_awards` and deletes that week's raw rows.

```
GET /api/hotwords?category=word|phrase|sentence[&week=2026-W46]
→ {"week","weeks":[last 26 settled],"settled":true,"participants","awards":[{"rank","term","users","lookups","reason","ai"}]}
```

`reason` is filled for ranks 1–10 only; `ai` is true when it is the model's guess (the page labels it "AI 推测").

### Public profiles, follows and 同好

All of these need a signed-in account (`Authorization: Bearer mgl_…`) except reading a public card. A profile belongs to
the account's leaderboard row, so the reader must have joined the leaderboard. Profiles are **private by default**:
only a public, unreported profile gets a `pid` on the board, can be opened, followed or suggested. "Reading lately"
comes only from readers who share game titles (`leaderboard_games.last_at`, sent by the app with each shared game).

```
GET    /api/profile                       → {joined, pid, public, hidden, bio, favorites:[{title,vndb}]}
PUT    /api/profile  {bio, favorites, public}   bio: one line ≤60 chars, nickname filter (BIO_LENGTH/BIO_INVALID/BIO_BLOCKED);
                                                favorites ≤5 [{title, vndb:'v123'|''}]; NOT_JOINED (409) without a board row
GET    /api/profile/<pid>                 → {name, avatar, bio, favorites, recent:[{title,last}], followers, following, me}
                                            404 for private, reported or unknown pids alike
POST   /api/follow/<pid>   DELETE /api/follow/<pid>   (cannot follow yourself; at most 500; unfollow works after they go private)
GET    /api/following                     → {following:[{pid, name, public, avatar, recent (≤3)}]}, newest reading first
GET    /api/kindred                       → {kindred:[{pid, name, avatar, shared:[titles], count, following}]}, ≤20, most overlap first
POST   /api/profile/<pid>/report {kind, reason?}   kind: discrimination | nudity | racism | harassment | spam | other
POST   /api/profile/appeal {reason?}       the owner of a hidden profile objects (異議あり！), once per hiding → issue in REPORT_REPO
```

Board rows (`GET /api/leaderboard`) now carry `pid` (or `null`). Leaving the leaderboard or deleting the account
removes the profile, favourites, every follow in both directions and the reader's own reports.

### Profile reports

A report hides the profile at once (`profiles.hidden=1`, private everywhere; the owner sees why in Settings and cannot
undo it), adds a `moderation_queue` row of kind `profile` and, with `REPORT_REPO` set, opens an issue labelled
`profile-report` in that private repository: kind, reason (optional), nickname, signature, favourites, a 72-hour private
link to the picture, and the two commands to restore or clear it. One report per reader and profile; 3 reports a day.

The owner sees the hiding in Settings › 个人主页 and can press 「一斤鸭梨！」 (Japanese UI: 「異議あり！」, English: Objection!; tooltip 驳回举报) once per hiding, with an optional
statement. That opens a second issue labelled `profile-appeal` in the same private repository (every report on the
profile, the statement, and the command that shows it again) plus a `moderation_queue` row of kind `profile-appeal`.
The profile stays hidden until you decide; a new report after a restore allows a new objection. 3 objections a day.

```bash
npx wrangler d1 execute megulit-relay --remote --command "SELECT r.kind,r.reason,p.pid,datetime(r.created_at,'unixepoch') FROM profile_reports r JOIN profiles p ON p.id_hash=r.target WHERE p.hidden=1"
```

### 交流 board (#117, `src/forum.js`, migration `0010_forum.sql`)

Anyone can read; writing needs a signed-in account (Bearer token). Shown name = the leaderboard nickname, else `#` and
four hex characters of the account hash (never the e-mail).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/forum?game=&engine=&tag=&mine=1&page=` | 20 per page, most recently active first; `tag` ∈ question / hook / guide / share / other |
| GET | `/api/forum/:id` | the post and up to 200 replies (deleted replies keep only `{id,deleted,created}`) |
| POST | `/api/forum` | `{title 2–60, body 1–4000, tag, game?, engine?}` |
| POST | `/api/forum/:id/replies` | `{body 1–2000}` |
| DELETE | `/api/forum/:id`, `/api/forum/:id/replies/:rid` | the author, or the maintainer with header `x-megulit-admin: $ADMIN_TOKEN` |

Checks, in order: limits (`forum-post` 5/h and `forum-reply` 30/h per account, `forum-day` 60/day per account,
`forum-ip` 40/h per IP), lengths, a local filter (links, e-mail, QQ/微信 handles, invisible characters, the shared
blocked-word list), then Workers AI (`FORUM_MODEL`, default Qwen 3) answering SAFE / ADULT / ABUSE / SPAM. A named
reason is returned as `422 MODERATION_ADULT|ABUSE|SPAM`; if the model is missing or errors, the local filter decides.
Deleting blanks the text in D1 (`deleted` 1 = author, 2 = maintainer); deleting the account blanks everything it wrote.

Maintainer delete (set the key once with `npx wrangler secret put ADMIN_TOKEN`; without it LINK_SECRET is accepted):

```
curl -X DELETE https://api.megulit.com/api/forum/<id> -H "x-megulit-admin: $ADMIN_TOKEN"
```

## Rate limits

Fixed windows in D1 (`RATE` in `src/worker.js`): 120 requests/min per IP overall; leaderboard writes 6 per 10 min per IP
and 20 per hour per install id; leaderboard reads 60/min; adaptation writes 30/hour, reads 120/hour; diagnostics uploads
5/hour and downloads 30/hour per IP; avatar uploads 5/hour per user, avatar reads 600/min, reports 20/hour, hot
words 60/min per IP; profile saves 30/hour, profile and follow reads 120/min, follow changes 60/hour per account;
profile reports and objections 3/day each per account.

## E562 adapter packs and desensitized probes

Endpoints (`src/adapters.js`, tables in `migrations/0016_adapters.sql`, probe bundles in R2 under `probes/`):

| Method | Path | Who |
|---|---|---|
| GET | `/api/adapters/feed?app=&format=` | the app (packs on offer, withdrawn versions, open probe requests; cached 5 min) |
| GET | `/api/adapters/pack/:id/:version` | the app (the signed pack as published) |
| POST | `/api/adapters/report` | the app (before/after line and pairing counts, anonymous game key) |
| POST | `/api/probe` | the app (one ≤ 512 KiB chunk of a desensitized bundle; the last one opens the `adapter-probe` issue) |
| GET | `/api/probe/download/:id?exp=&sig=` | link in the issue |
| POST | `/api/adapters/publish`, `/withdraw`, `/probe-request`; GET `/api/adapters/reports` | maintainer, `Authorization: Bearer $ADAPTER_ADMIN_TOKEN` |

The relay stores packs but cannot sign them: apps only load packs signed with a key in `services/adapter-pack-keys.json`.

Deploy (once):

```bash
cd relay
npx wrangler d1 migrations apply megulit-relay --remote
npx wrangler secret put ADAPTER_ADMIN_TOKEN
npx wrangler deploy
```

Create the GitHub label `adapter-probe` in the repository (issues are opened with it). Maintainer tool: `node tools/adapter-pack.cjs`
(docs/ADAPTER-PACKS.md).
