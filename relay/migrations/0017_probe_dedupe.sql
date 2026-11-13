-- 2026-11-14 one probe per game (owner: 去重，不要把每个人的同一个游戏都加一加一加一). identity = the app's per-game id
-- (services/probe-identity.cjs: engine + exe content hash + archive names hash). A later upload replaces the stored one
-- only when the stored one is missing items or failed; otherwise only reporters goes up (no new row, no blob).
CREATE TABLE IF NOT EXISTS probe_games (
  identity TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  items INTEGER NOT NULL DEFAULT 0,
  reporters INTEGER NOT NULL DEFAULT 1,
  vndb TEXT NOT NULL DEFAULT '',
  issue_url TEXT NOT NULL DEFAULT '',
  first_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- bundles uploaded before identities existed: the same bytes sent more than once collapse to the first copy
DELETE FROM probe_bundles WHERE rowid NOT IN (SELECT MIN(rowid) FROM probe_bundles GROUP BY sha256);
