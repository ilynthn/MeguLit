-- 2026-11-26 issue trackers (relay/src/issue-trackers.js): every adapter probe, game request, diagnostics package and
-- Yui failure still gets its own detail issue, but that issue is closed at once and listed as one checkbox line in the
-- open tracker issue of its kind ([适配探针] 汇总, [想玩] 汇总, [诊断] 汇总, [Yui] 汇总).
CREATE TABLE IF NOT EXISTS issue_tracker_entries (
 id TEXT PRIMARY KEY,
 repo TEXT NOT NULL,
 tracker TEXT NOT NULL,
 name TEXT NOT NULL,
 day TEXT NOT NULL,
 section TEXT NOT NULL DEFAULT '',
 merge_key TEXT NOT NULL DEFAULT '',
 merge_ref INTEGER,
 draft TEXT,
 creating_at TEXT,
 issue INTEGER,
 tracker_issue INTEGER,
 listed_at TEXT,
 noted_at TEXT,
 closed_at TEXT,
 tick_at TEXT,
 ticked_at TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 last_attempt INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS issue_tracker_entry_issue ON issue_tracker_entries(repo,issue) WHERE issue IS NOT NULL;
CREATE INDEX IF NOT EXISTS issue_tracker_pending ON issue_tracker_entries(repo,tracker,closed_at,created_at);
CREATE INDEX IF NOT EXISTS issue_tracker_merge ON issue_tracker_entries(repo,tracker,merge_key);

-- One writer per tracker issue: GitHub has no atomic append, so the read-modify-write of a tracker body runs under
-- this lease (owner = random id, until = epoch ms).
CREATE TABLE IF NOT EXISTS issue_tracker_locks (
 tracker TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 until INTEGER NOT NULL
);

-- The tracker issue last found or opened for each kind; checked (open, marker present) on every use.
CREATE TABLE IF NOT EXISTS issue_trackers (
 repo TEXT NOT NULL,
 tracker TEXT NOT NULL,
 issue INTEGER NOT NULL,
 PRIMARY KEY (repo,tracker)
);
