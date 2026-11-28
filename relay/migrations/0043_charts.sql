-- SPDX-License-Identifier: GPL-3.0-or-later
-- 2026-11-28 排行榜 · 作品榜 (relay/src/charts.js): Galgame / light novel / otome rankings from VNDB, Bangumi and AniList,
-- refreshed once a day. One row per board and source; payload is the ranked list (top 50) as JSON.
CREATE TABLE IF NOT EXISTS charts_cache (
  board TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (board, source)
);
