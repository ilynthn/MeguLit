# MeguLit accounts and cloud sync (E378)

Email + 6-digit code login and opt-in sync of words, saved sentences, reading totals and per-game settings.
Server: `relay/src/accounts.js` + `relay/migrations/0005_accounts.sql`. Client: `services/account.cjs`,
Settings → 账号 (`web/account-ui.js`). Nothing is deployed by this branch.

## Wiring into the relay router

Done in E379 (feature/leaderboard-relay): `worker.js` routes accounts paths, uses `authenticate` for the leaderboard
identity, and `DELETE /api/me` also removes the account's leaderboard rows and avatar. Original instructions, kept for reference:

`relay/src/worker.js` (leaderboard branch) owns the router; this branch does not edit it. After the merge, add two lines:

```js
import {handleAccounts,isAccountsPath} from './accounts.js';
```

and in `handle()`, inside the `try`, right after the global `ip` rate-limit check and before the `NOT_FOUND` fallback:

```js
else if(isAccountsPath(path))response=await handleAccounts(request,env,now);
```

`handleAccounts` does its own per-route rate limits on the shared `rate_limits` table and returns a `Response`
(or `null` for paths it does not own). The global CORS block already allows the `authorization` header; the desktop
app calls from Node with no Origin, so no CORS change is needed.

## Deploy steps (debug session)

1. `npx wrangler d1 migrations apply megulit-relay --remote` (applies `0005_accounts.sql` after `0001_init.sql`;
   rename it if another migration takes that number, order only has to stay after 0001).
2. Secrets:
   - `npx wrangler secret put RESEND_API_KEY` (from `E:\MeguLit\secrets\relay.txt` once the user adds it).
     Until it exists, `POST /api/auth/code` answers `503 EMAIL_NOT_CONFIGURED` and the app says so.
   - optional `npx wrangler secret put AUTH_PEPPER` (any long random string; falls back to `HASH_SALT`).
     Changing it later invalidates pending codes only.
3. Resend: verify the `megulit.com` domain (SPF/DKIM records in Cloudflare DNS) and keep **open and click tracking
   off** for it. The mail has no links and no images. Sender: `mail@megulit.com` (`MAIL_FROM` var overrides).

## Endpoints

| Method | Path | Body / query | Answer |
|---|---|---|---|
| POST | `/api/auth/code` | `{email}` | `{ok,expiresIn:600}`; 429 `RATE_LIMITED` (1/min and 5/h per email, 20/h per IP); `502 EMAIL_SEND_FAILED`. Waits for Resend at most 1.5 s (`SEND_WAIT`, `MAIL_WAIT_MS`), then answers `{ok,expiresIn,sending:true}` and finishes in `ctx.waitUntil`; a late failure deletes the code, so verify says `NO_CODE` |
| POST | `/api/auth/password` | `{login,password,device}` | login = e-mail or user name; same answer as verify; `WRONG_PASSWORD` for every failure, 429 `RATE_LIMITED` |
| POST | `/api/me/username` | `{username}` | once only: `USERNAME_INVALID`, `USERNAME_TAKEN`, `USERNAME_LOCKED` |
| POST | `/api/me/password` | `{password,current?,code?}` | 8–128. Proof (2026-11-29): `code` = a code mailed to the account's own address (`POST /api/auth/code`), burned on use; or `current`; or a desktop session <10 min old. No proof: `CODE_REQUIRED` (no password yet) / `WRONG_PASSWORD`. Also `WRONG_CODE` (+`triesLeft`), `NO_CODE`, `CODE_EXPIRED`, `PASSWORD_LENGTH`, `PASSWORD_WEAK`; 429 after 10 tries an hour per account (`pw-set`). Other sessions stay signed in; each device can be removed from the desktop device list |
| POST | `/api/auth/verify` | `{email,code,device}` | `{token,accountId,email,sessionId,expiresAt}`; `WRONG_CODE` (+`triesLeft`), `CODE_EXPIRED`, `TOO_MANY_TRIES`, `NO_CODE` |
| GET | `/api/me` | Bearer | `{accountId,email,createdAt,sessionId,username,hasPassword,devices[],usage,limits}` |
| POST | `/api/auth/logout` | `{sessionId?}` | revokes this device, or another device of the same account |
| DELETE | `/api/me` | Bearer | deletes the account, all sessions, all synced records |
| GET | `/api/sync/:kind` | `?since=<seq>&limit=` | `{records:[{key,updated_at,deleted,data}],cursor,more}` |
| PUT | `/api/sync/:kind` | `{records:[{key,updated_at,deleted?,data?}]}` | `{accepted,newer:[server records that won],cursor}` |
| GET | `/api/sync` | Bearer | `{kinds:{<kind>:{cursor,records}}}`: newest seq and live record count per kind (the website pulls only kinds that moved) |
| DELETE | `/api/sync` | Bearer, full session | 「删除云端数据」: every synced record of the account; the account and its sessions stay. 3 a day (`sync-wipe`) |

Kinds and caps (per account): `words` 8 MB / 32 KB per record, `sentences` 4 MB / 40 KB, `reading` 1 MB / 1 KB,
`settings` 512 KB / 32 KB, `progress` 256 KB / 1 KB, `study` 256 KB / 1 KB. `progress` (`{game,read,total?,seconds?,lastPlayedAt?}`)
and `study` (`{day,lookups?,reviews?,newWords?,kana?,grammar?,anki?}`) take exactly those fields, numbers and a title only
(`SCHEMA`), so no game text can be sent in them. At most 500 records and 2 MB per PUT. Over the cap → `413 SYNC_QUOTA_EXCEEDED`.

Tokens: `mgl_` + 32 random bytes (base64url), stored as sha256. Sliding 180-day expiry. Rotated on use at most once a
day: the new token comes back in the `x-megulit-token` response header, and the old one keeps working for 24 h so a
lost response never logs the user out. Codes: 6 digits, only `sha256(pepper:email:code)` stored, 10 minutes, 5 tries,
deleted on success. Conflicts: last writer wins on the client's `updated_at` (ms); on a tie a tombstone wins, then the
larger JSON, so every replica picks the same record (`newerRecord`, mirrored in `services/account.cjs`).

## Leaderboard: using the account id

`accounts.js` exports `authenticate(request,env,now)` → `{account:{id,email},session,token}` or `null`. The leaderboard
branch can, after the merge:

- client (`services/leaderboard.cjs`): when `require('./account.cjs').status(root).loggedIn`, send the session as
  `authorization: Bearer <token>` (get it with `account.token(root)`) next to the install id;
- server (`leaderboardPost`): `const auth=await authenticate(request,env,now);` and, when present, use
  `id_hash = sha256('account:'+auth.account.id)` instead of `sha256(installId)`, so one person on two PCs is one row.
  Keep the install-id path for people without an account. `GET /api/me` returns `accountId` for display/debug.
- `DELETE /api/me` does not touch leaderboard rows; if the leaderboard keys rows by account, add
  `DELETE FROM leaderboard_* WHERE id_hash=?` for that hash to `deleteAccount` in `accounts.js`.

## Privacy

Only the kinds the user leaves on are uploaded. Records carry no game paths, executables, cover files, logs or
install ids: game references are titles; settings are the per-game style profile with every path-like key and value
removed (`services/account.cjs` `cleanSettings`, tested). The email is used only to send the code and is shown only to
its owner in `/api/me`.

## Website sessions (2026-11-27, megulit.com /me/)

`POST /api/auth/verify` and `/api/auth/password` with `client:"web"` open a **read-only** session: `scope:'read'`
(column added by `0042_web_sessions.sql`), 30-day sliding life, device name `网页 · <browser>`. It may call
`GET /api/me`, `GET /api/sync`, `GET /api/sync/:kind` and sign itself out; anything else answers
`403 READ_ONLY_SESSION`. Its reads are limited by the `RL_SYNC_GET` rate-limit binding (60/min per account, no D1 row);
desktop sessions keep the D1 `acct` limit. The one write a website session may do is `POST /api/me/password` (2026-11-29), and only with `current` or `code`:
the 10-minute shortcut is desktop only. CORS allows `megulit.com`, `www.megulit.com`, `cn.megulit.com` and exposes
`x-megulit-token`, so the page keeps a rotated token. Without migration 0042 a website sign-in fails (never a full
session); desktop sign-ins keep working.

Deploy order: `wrangler d1 migrations apply megulit-relay --remote` (0042 only adds a column), then `wrangler deploy`.
