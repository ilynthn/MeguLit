-- SPDX-License-Identifier: GPL-3.0-or-later
-- 2026-11-27 megulit.com user centre: a session signed in from the website is read-only (scope 'read', 30-day sliding
-- life); desktop sessions keep 'full'. Only adds a column with a default, existing rows become 'full'. Applies after 0041.
ALTER TABLE account_sessions ADD COLUMN scope TEXT NOT NULL DEFAULT 'full';
