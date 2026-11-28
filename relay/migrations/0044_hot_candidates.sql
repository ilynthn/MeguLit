-- SPDX-License-Identifier: GPL-3.0-or-later
-- 2026-11-28 每周热词: an entry under the readers bar, filled in by lookups so a quiet week is not empty (shown as 本周候选)
ALTER TABLE hot_awards ADD COLUMN candidate INTEGER NOT NULL DEFAULT 0;
