// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 per-speaker text colours (owner, アイキス3 sexy: アヤメ's lines are bright pink in the game; 「自动识别说话人…有的话就老老实实
   读内存看看角色名都是啥 然后都是啥颜色」, and a 「分角色」 entry under Settings → 字体 to recolour them).
   One table per work, kept in that work's reader settings (key speakerColors):
     seen  {name: '#rrggbb'}  the colour the game itself drew this speaker's last line with (engine draw call or the game's pixels)
     user  {name: '#rrggbb'}  the colour the user picked for this speaker in 分角色; wins over seen; removing it restores the game's
   Names come in the order the game first showed them. A work colours by speaker when two speakers were seen in two different
   colours; one colour for everybody (or nothing seen yet) is a work that does not, and 分角色 says so instead of listing names.
   The module is pure (no DOM): the reader (text-position.js paintLine) and the settings panel (game-fonts-ui.js) both use it. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeguLitSpeakerColors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX = 120, NAME = 24;
  const hex = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));
  const cleanName = n => String(n == null ? '' : n).replace(/[\s　]+/g, ' ').trim().slice(0, NAME);
  const cleanMap = m => { const out = {}; if (!m || typeof m !== 'object' || Array.isArray(m)) return out; let n = 0;
    for (const [k, v] of Object.entries(m)) { const name = cleanName(k); if (!name || !hex(v) || name in out) continue; out[name] = String(v).toLowerCase(); if (++n >= MAX) break; } return out; };
  /* the stored shape, whatever was saved (older builds saved nothing: an empty table) */
  function normalize(value) { const v = value && typeof value === 'object' ? value : {}; return { seen: cleanMap(v.seen), user: cleanMap(v.user) }; }
  /* the speaker of a line whose text carries the name before the quote (名前「…」), else '' */
  function nameIn(text) { const m = String(text || '').trim().match(/^([^\s　「『（(【\[“"]{1,12})[\s　]*[「『（(“"]/); return m ? cleanName(m[1]) : ''; }
  /* the game drew speaker `name` with `color`: a new table when that is news, the same object when nothing changed (callers save
     only on a change). Alpha (#rrggbbaa: read dimming, a fade) is the line's state, not the speaker's colour: only #rrggbb is kept. */
  function learn(table, name, color) {
    const t = normalize(table), n = cleanName(name), c = String(color || '').slice(0, 7).toLowerCase();
    if (!n || !hex(c) || t.seen[n] === c) return table && typeof table === 'object' && table.seen && table.user ? table : t;
    if (!(n in t.seen) && Object.keys(t.seen).length >= MAX) return table && typeof table === 'object' && table.seen && table.user ? table : t;
    return { seen: { ...t.seen, [n]: c }, user: t.user };
  }
  /* the user's colour for `name` ('' / null removes it: the game's colour applies again) */
  function setUser(table, name, color) {
    const t = normalize(table), n = cleanName(name); if (!n) return t; const user = { ...t.user };
    if (hex(color)) user[n] = String(color).toLowerCase(); else delete user[n];
    return { seen: t.seen, user };
  }
  /* what to paint a line of `name` with: the user's colour, else '' (the game's own colour for that line applies) */
  function override(table, name) { const t = normalize(table), n = cleanName(name); return n && t.user[n] || ''; }
  /* the colour shown for a speaker in the list: the user's, else the one the game drew */
  function colorFor(table, name) { const t = normalize(table), n = cleanName(name); return n ? t.user[n] || t.seen[n] || '' : ''; }
  /* two speakers seen in two different colours */
  function bySpeaker(table) { const t = normalize(table); return new Set(Object.values(t.seen)).size >= 2; }
  /* the rows of 分角色: every speaker seen (and any the user coloured), first seen first */
  function list(table) { const t = normalize(table), names = [...Object.keys(t.seen), ...Object.keys(t.user).filter(n => !(n in t.seen))];
    return names.map(name => ({ name, game: t.seen[name] || '', user: t.user[name] || '', color: t.user[name] || t.seen[name] || '' })); }
  return { normalize, nameIn, learn, setUser, override, colorFor, bySpeaker, list, MAX };
});
/* The reader side: the current work's table (from the service: core/game-style-sync.cjs speakerTable, every gameStyleStatus carries it),
   learning from each painted line (text-position.js paintLine), the user's colours, and the 分角色 group of Alt+T → 文字 → 颜色, beside 已读 / 未读
   and 已选 / 未选 (menu-layout.js; owner 11-28: at the bottom of 字体 it was hard to find, 「把分角色放进颜色里」). */
(function installSpeakerColors() {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!document.head || !window.__tomoyoChinese) { document.addEventListener('DOMContentLoaded', installSpeakerColors, { once: true }); return; }
  const b = window.__tomoyoChinese, api = window.MeguLitSpeakerColors; if (!api || b.speakerColorsInstalled) return; b.speakerColorsInstalled = true;
  const send = m => { try { window.__tomoyoTranslateRequest(JSON.stringify(m)); } catch {} };
  let key = '', table = api.normalize(null), timer = 0;
  const save = (wait = 600) => { clearTimeout(timer); if (!key) return; const k = key, t = table; timer = setTimeout(() => send({ type: 'speakerColorsSave', key: k, table: t }), wait); };
  const W = {
    zh: { title: '分角色', help: '游戏按说话人给台词上色。改色立即生效，只保存在这部作品里', none: '还没认出说话的角色。推进几句台词后，认出的角色和游戏里的字色会列在这里', uniform: '该作品不分角色字体颜色', uniformHelp: '游戏里所有角色的台词都是同一种颜色，这里没有可以单独改的', unbound: '绑定游戏后，这里按作品列出角色', change: '改色', reset: '恢复默认', game: '游戏原色' },
    en: { title: 'By character', help: 'The game colours lines by speaker. Changes apply at once and are kept for this game only', none: 'No speakers recognised yet. Advance a few lines and the characters appear here with the game’s own text colour', uniform: 'This game does not colour text by character', uniformHelp: 'Every character’s lines share one colour in this game, so there is nothing to change per character', unbound: 'Bind a game to list its characters here', change: 'Change', reset: 'Reset', game: 'Game colour' },
    ja: { title: 'キャラ別', help: 'この作品は話者ごとにセリフの色を変えています。変更はすぐ反映され、この作品だけに保存されます', none: 'まだ話者を認識していません。数行進めると、認識したキャラとゲーム本来の文字色がここに並びます', uniform: 'この作品はキャラごとに文字色を分けていません', uniformHelp: 'どのキャラのセリフも同じ色なので、キャラ別に変えられる項目はありません', unbound: 'ゲームを固定すると、作品ごとにキャラが並びます', change: '色を変える', reset: '元に戻す', game: 'ゲームの色' } };
  const t = k => (W[String(window.__tomeI18n?.get?.() || document.documentElement.lang || 'zh').slice(0, 2)] || W.zh)[k];
  const style = document.createElement('style'); style.textContent = `
 .mg-speakers{margin:0 0 12px;padding:0}
 .mg-speakers-head{display:none} /* the sub-tab already says 分角色 */
 .mg-speakers small{display:block;margin-top:2px!important;line-height:1.6;opacity:.78}
 .mg-speakers small[hidden]{display:none!important}
 .mg-speakers[data-state=uniform] .mg-speakers-say{opacity:1;font-weight:600}
 .mg-speakers-list{display:flex;flex-direction:column;gap:2px;margin-top:9px}
 .mg-speakers-list:empty{display:none}
 .mg-speaker{display:grid;grid-template-columns:minmax(0,1fr) 6px 26px auto;align-items:center;gap:8px;min-height:36px;padding:3px 0;border-radius:9px}
 .mg-speaker:hover{background:color-mix(in srgb,var(--theme-text,#eee) 5%,transparent)}
 .mg-speaker-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mg-speaker,currentColor);text-shadow:0 0 1px #0009,0 1px 2px #0008}
 .mg-speaker .tome-color-text,.mg-speaker .tome-color-copy{display:none!important}
 .mg-speaker .tome-color-swatch{width:26px!important;height:26px!important;border-radius:8px!important}
 .mg-speaker-acts{display:grid;grid-template-columns:auto auto;gap:6px}
 .mg-speaker .tome-color-field{display:inline-flex!important;width:26px!important;min-width:0!important;padding:0!important;border:0!important;background:none!important;box-shadow:none!important}
 .mg-speaker button.mg-speaker-act{margin:0!important;font-size:12px!important;padding:5px 11px!important;border-radius:8px!important;cursor:pointer;white-space:nowrap}
 .mg-speaker button.mg-speaker-act[data-off]{visibility:hidden} /* the columns stay put whether or not a row has 恢复默认 */
 .mg-speaker-mark{width:6px;height:6px;border-radius:50%;background:var(--theme-primary,#e0495a);box-shadow:0 0 6px color-mix(in srgb,var(--theme-primary,#e0495a) 70%,transparent)}
 .mg-speaker-mark[data-off]{visibility:hidden}
 .mg-speaker-swatch{display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center}`;
  document.head.append(style);
  const host = () => document.querySelector('.tomoyo-cn-dialog [data-text-speaker-colors]') || document.querySelector('.tomoyo-cn-dialog [data-text-colours]');
  function row(name) {
    const r = document.createElement('div'); r.className = 'mg-speaker'; r.dataset.name = name;
    r.innerHTML = '<span class="mg-speaker-name"></span><i class="mg-speaker-mark" data-off></i><span class="mg-speaker-swatch"><input type="color" class="mg-speaker-color"></span><span class="mg-speaker-acts"><button type="button" class="mg-speaker-act" data-act="change"></button><button type="button" class="mg-speaker-act" data-act="reset"></button></span>';
    r.querySelector('.mg-speaker-name').textContent = name;
    const input = r.querySelector('input');
    const pick = live => { table = api.setUser(table, name, input.value); paint(); b.lineColorRepaint?.(); save(live ? 500 : 0); };
    /* the colour rows are this block's own: gal.js's form listeners (preview, save) never see them */
    input.addEventListener('input', e => { e.stopPropagation(); pick(true); });
    input.addEventListener('change', e => { e.stopPropagation(); pick(false); });
    r.querySelector('[data-act=change]').onclick = e => { e.preventDefault(); e.stopPropagation(); const sw = input.__tomeColorField?.querySelector('.tome-color-swatch'); if (sw) sw.click(); else input.click(); };
    r.querySelector('[data-act=reset]').onclick = e => { e.preventDefault(); e.stopPropagation(); table = api.setUser(table, name, ''); paint(); b.lineColorRepaint?.(); save(0); };
    return r;
  }
  function paint() {
    const h = host(); if (!h) return; let box = h.querySelector(':scope > .mg-speakers');
    if (!box) { box = document.createElement('div'); box.className = 'mg-speakers'; box.dataset.noI18n = ''; box.innerHTML = '<div class="mg-speakers-head"></div><small class="mg-speakers-say"></small><small class="mg-speakers-help"></small><div class="mg-speakers-list"></div>'; h.append(box); }
    else if (h.lastElementChild !== box) h.append(box);
    const rows = api.list(table), split = api.bySpeaker(table), own = rows.some(x => x.user), list = box.querySelector('.mg-speakers-list');
    const state = !key ? 'unbound' : !rows.length ? 'none' : !split && !own ? 'uniform' : 'list'; box.dataset.state = state;
    box.querySelector('.mg-speakers-head').textContent = t('title');
    const say = box.querySelector('.mg-speakers-say'), help = box.querySelector('.mg-speakers-help');
    say.textContent = state === 'list' ? '' : t(state); say.hidden = state === 'list';
    help.textContent = state === 'list' ? t('help') : state === 'uniform' ? t('uniformHelp') : ''; help.hidden = !help.textContent;
    const show = state === 'list' ? rows : [], keep = new Set(show.map(x => x.name));
    for (const el of [...list.children]) if (!keep.has(el.dataset.name)) el.remove();
    show.forEach((x, i) => {
      const r = [...list.children].find(el => el.dataset.name === x.name) || row(x.name);
      if (list.children[i] !== r) list.insertBefore(r, list.children[i] || null);
      const input = r.querySelector('input'); if (input.value.toLowerCase() !== x.color) input.value = x.color || '#ffffff';
      r.style.setProperty('--mg-speaker', x.color || 'currentColor');
      const mark = r.querySelector('.mg-speaker-mark'); mark.toggleAttribute('data-off', !x.user); mark.title = x.user ? t('game') + ' ' + (x.game || '—').toUpperCase() : '';
      r.querySelector('[data-act=change]').textContent = t('change');
      const reset = r.querySelector('[data-act=reset]'); reset.textContent = t('reset'); reset.toggleAttribute('data-off', !x.user); reset.tabIndex = x.user ? 0 : -1; reset.setAttribute('aria-hidden', String(!x.user));
    });
  }
  /* the service's table for the bound work (another work, or the same one after a save) */
  b.speakerColorsReceived = (value, workKey) => { const k = /^[a-f0-9]{64}$/i.test(String(workKey || '')) ? String(workKey).toLowerCase() : ''; if (k !== key) { clearTimeout(timer); key = k; table = api.normalize(null); } if (value && typeof value === 'object') table = api.normalize(value); paint(); b.lineColorRepaint?.(); };
  /* the game drew speaker `name` with `color` (that line's own evidence) */
  b.speakerColorsLearn = (name, color) => { if (!key) return; const next = api.learn(table, name, color); if (next === table) return; table = next; paint(); save(); };
  b.speakerColorsOverride = name => api.override(table, name);
  b.speakerColorsState = () => ({ key, table: api.normalize(table) });
  addEventListener('tome-language-change', paint);
  let queued = false; new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; const h = host(); if (h && !h.querySelector(':scope > .mg-speakers')) paint(); }); }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  paint();
})();
