/* SPDX-License-Identifier: GPL-3.0-or-later */
/* /me/: the chosen theme before first paint, so the page never flashes the wrong colours (an external file because the site's CSP has no 'unsafe-inline'). */
try { var t = localStorage.getItem('megulit-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) { /* private mode */ }
