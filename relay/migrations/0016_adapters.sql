-- E562 adapter packs (signed by the maintainer, stored and listed here), the apps' before/after reports, probe requests
-- and the chunked desensitized probe uploads (chunks in R2 under probes/<upload>/<part>).
CREATE TABLE IF NOT EXISTS adapter_packs (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  format INTEGER NOT NULL,
  min_app TEXT NOT NULL,
  max_app TEXT NOT NULL DEFAULT '',
  requires TEXT NOT NULL DEFAULT '[]',
  size INTEGER NOT NULL,
  published_at INTEGER NOT NULL,
  withdrawn_at INTEGER,
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS adapter_reports (
  pack TEXT NOT NULL,
  pack_version INTEGER NOT NULL,
  game_key TEXT NOT NULL,
  state TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  app TEXT NOT NULL DEFAULT '',
  reporters INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pack, pack_version, game_key)
);
CREATE TABLE IF NOT EXISTS adapter_probe_requests (
  id TEXT PRIMARY KEY,
  keys TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'resample',
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE TABLE IF NOT EXISTS probe_uploads (
  upload TEXT NOT NULL,
  part INTEGER NOT NULL,
  parts INTEGER NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (upload, part)
);
CREATE TABLE IF NOT EXISTS probe_bundles (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  issue_url TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
