// SPDX-License-Identifier: GPL-3.0-or-later
/* Hook point between the adaptation overview and the local probe pipeline (owned by the probe/upload work, not by the
   overview). The overview never exports or sends anything itself: it hands the pipeline the games the user picked.
   Order: a global entry (window.megulitProbe.open, if something installs one), then the pipeline's own module
   (web/adapter-probe-ui.js openProbeUpload: local check of those games, then the exact upload manifest, sent only after
   the user confirms), then the per-game diagnostics dialog if that module cannot load.
   onDone({state:'checked'|'cancelled'|'uploaded',problems?}) lets the overview reload its rows. */
import {openDiagnostics} from './diagnostics-ui.js';

export const probeAvailable = () => typeof window.megulitProbe?.open === 'function';

export const requestProbe = async ({ ids, source = 'overview', api, locale, esc, toast, onDone = null }) => {
  const list = [...new Set((ids || []).map(String))].filter(Boolean);
  if (!list.length) return null;
  if (probeAvailable()) return window.megulitProbe.open({ ids: list, source, onDone });
  try {
    const { openProbeUpload } = await import('./adapter-probe-ui.js');
    return await openProbeUpload({ api, locale, esc, toast, ids: list, reason: source, onDone });
  } catch { /* the pipeline module did not load: fall back below */ }
  /* fallback: the per-game diagnostics dialog the app already has (one game at a time) */
  return openDiagnostics({ api, id: list[0], locale, esc, toast });
};
