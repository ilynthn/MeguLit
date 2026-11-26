(function install() {
  'use strict';
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded', install, { once: true });
    return;
  }
  if (window.__tomoyoChinese) return;
  const bridge = window.__tomoyoChinese = { current: '', serial: 0, timer: null };
  let guardTimers = [], guardText = '', sourcePreview = false;
  function resetGuard() { guardText = ''; for (const t of guardTimers) clearTimeout(t); guardTimers = []; }
  bridge.refresh = () => { bridge.cardinalPair?.refresh();bridge.choiceOverlay?.refresh();resetGuard();if(bridge.refreshPageTranslations?.())return;bridge.current = ''; bridge.serial++; clearTimeout(bridge.timer); schedule(); };
  bridge.sourceText = '';
  let row, output, parent;
  let translationVisible = true;
  bridge.isTranslationVisible = () => translationVisible;
  bridge.setTranslationVisible = value => {
    if (translationVisible === !!value) return;
    translationVisible = !!value;
    if (output) output.hidden = !enabled || !translationVisible;
    bridge.serial++;
    try { window.__tomoyoTranslateRequest(JSON.stringify({ id: bridge.serial, disabled: !translationVisible })); } catch {}
    bridge.refresh();
  };
  let enabled = localStorage.getItem('tomoyo-chinese-enabled') !== 'false';
  bridge.isEnabled = () => enabled;
  bridge.setEnabled = value => {
    const next = !!value;
    if (next === enabled) return;
    enabled = next;
    bridge.choiceOverlay?.refresh();
    bridge.cardinalPair?.refresh();
    localStorage.setItem('tomoyo-chinese-enabled', String(enabled));
    resetGuard();
    bridge.current = '';
    bridge.serial++;
    clearTimeout(bridge.timer);
    try { window.__tomoyoTranslateRequest(JSON.stringify({ id: bridge.serial, disabled: !enabled })); } catch {}
    if(bridge.refreshPageTranslations?.())return;
    if (output) { output.hidden = !enabled || !translationVisible; setText(enabled && !bridge.quietTranslation ? '等待翻译…' : ''); }
    schedule();
  };
  const style = document.createElement('style');
  style.textContent = `
    .sentence-window.tomoyo-cn-active { flex-direction:column!important; justify-content:flex-start!important; overflow-y:auto; }
    .tomoyo-cn-row { width:100%; box-sizing:border-box; margin-top:6px; padding:0; background:transparent; border:0; color:var(--theme-textSecondary,#c6c6d2); font-family:'Microsoft YaHei','Noto Sans SC',sans-serif; font-size:18px; line-height:1.6; flex-shrink:0; }
    .tomoyo-cn-row { text-align:left!important; align-self:stretch; }
    .tomoyo-cn-output { white-space:pre-wrap; overflow-wrap:anywhere; user-select:text; text-align:left!important; text-align-last:left!important; }
    body.mini-mode .tomoyo-cn-row { font-size:16px; }
    [data-tomoyo-transparent], [data-tomoyo-transparent]::before, [data-tomoyo-transparent]::after {
      background:transparent!important; background-image:none!important; border-color:transparent!important;
      box-shadow:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important;
    }
    [data-tomoyo-transparent] .sentence-text, [data-tomoyo-transparent] .tomoyo-cn-output { text-shadow:0 1px 3px #000c; }
  `;
  (document.head || document.documentElement).appendChild(style);
  /* 2026-11-19 (BGI: one quotation the game adds to piece by piece, each stage a new line): the translation of a line that
     grew stays on screen until the grown line's own arrives, which keeps what it shares with it and types only the rest */
  const flat = v => String(v || '').replace(/[\s\u3000]+/g, ''), grown = (before, next) => { const a = flat(before), c = flat(next); return !!a && c.length > a.length && c.startsWith(a); };
  /* 2026-11-21 (owner, 千恋＊万花: 「译文后出来的话就会把上面的挤上去」): the translation row keeps room for the translation from the moment the
     Japanese is shown: the height the recent translations took, or an estimate from the Japanese length, whichever is more. A late
     translation shows inside that room and never moves the Japanese (a block standing on its bottom edge grows upwards otherwise). */
  const recentHeights = [];
  /* the room a translation row of `text` needs, measured on the row element `el`: max(the last three settled translations,
     the Japanese length at the row's width, one row). Shared with the page's earlier lines (hook-reader.js) */
  function reserveHeight(text, el) {
    const cs = getComputedStyle(el), size = parseFloat(cs.fontSize) || 20, lh = parseFloat(cs.lineHeight) || size * 1.4, width = el.clientWidth || row?.clientWidth || 600;
    const estimate = Math.max(1, Math.ceil([...String(text || '').replace(/[\s\u3000]/g, '')].length * 1.2 * size / Math.max(size, width))) * lh;
    return Math.ceil(Math.max(estimate, ...recentHeights, lh));
  }
  bridge.translationReserveFor = (text, el) => el ? reserveHeight(text, el) : 0;
  function reserve(text) {
    if (!output) return;
    const h = reserveHeight(text, output);
    output.style.minHeight = h + 'px'; bridge.translationReserve = h;
  }
  function settled() { if (!output || output.dataset.state !== 'ready' || !output.textContent.trim() || output.textContent === '翻译中…') return; const prev = output.style.minHeight; output.style.minHeight = ''; const h = output.getBoundingClientRect().height; output.style.minHeight = prev;
    if (h > 0) { recentHeights.push(h); if (recentHeights.length > 3) recentHeights.shift(); if (h > (parseFloat(prev) || 0)) output.style.minHeight = Math.ceil(h) + 'px'; } }
  bridge.markTranslationSource=(node,context)=>{if(!node)return;
    const source=['script','patch','official','machine','local','api','mt','filled'].includes(context?.source)?context.source:'unknown';
    Object.assign(node.dataset,{translationSource:context?.cached?'cache':source,translationOrigin:source,translationProvider:context?.provider||''});
  };
  function setText(text, error = false, animate = false, context=null) {
    if (!output) return;
    bridge.markTranslationSource(output,context);
    const was = output.dataset.state === 'ready' ? [...output.textContent] : [];
    output.dataset.state = error ? 'error' : 'ready';
    bridge.cardinalPair?.notify();
    if (output.textContent === text) return;
    if (animate && window.TomeTypewriter) { const now = [...text]; let from = 0; while (from < was.length && from < now.length && was[from] === now[from]) from++; window.TomeTypewriter.text(output, text, { from }); }
    else {
      window.TomeTypewriter?.stop(output); delete output.dataset.tomeTyping;
      const parts=text.split(/(\p{Script=Latin}+)/u);
      output.replaceChildren(...parts.map((part,index)=>{
        if(index%2===0)return part;
        const latin=document.createElement('span');latin.className='megulit-latin';latin.textContent=part;return latin;
      }));
    }
    output.style.opacity = error ? '.7' : '1';
    settled();
  }
  function ensureRow(sentence) {
    const nextParent = sentence.closest('.sentence-window');
    if (!nextParent) return false;
    if (parent !== nextParent || !row?.isConnected) {
      if (output) window.TomeTypewriter?.stop(output);
      row?.remove();
      parent = nextParent;
      parent.classList.add('tomoyo-cn-active');
      row = document.createElement('div');
      row.className = 'tomoyo-cn-row';
      output = document.createElement('div');
      output.className = 'tomoyo-cn-output';
      output.hidden = !enabled || !translationVisible;
      output.setAttribute('aria-live', 'polite');
      row.append(output);
      sentence.insertAdjacentElement('afterend', row);
      bridge.current = '';
      bridge.applyAppearance?.();
    }
    return true;
  }
  /* 2026-11-21 (r26: two lines paired with the patch were never asked for): every way read() leaves without asking is noted once per line and
     reason (reader-host.log, layoutDiagnostic kind translateSkip) */
  let skipKey = '';
  function skip(reason, text = '') { const k = reason + '|' + text; if (k === skipKey) return; skipKey = k; bridge.lastSkip = { reason, text: String(text).slice(0, 40) };
    try { window.__tomoyoTranslateRequest(JSON.stringify({ type: 'layoutDiagnostic', kind: 'translateSkip', reason, text: String(text).slice(0, 40) })); } catch {} }
  function read() {
    if (sourcePreview) return;
    if(bridge.pageTranslationActive?.()){skip('page translation active');return;}
    const sentence = document.querySelector('.sentence-text');
    if (!sentence) {
      skip('no sentence on screen');
      if (bridge.sourceText) { bridge.sourceText = ''; bridge.onSourceText?.(''); }
      if (output) window.TomeTypewriter?.stop(output);
      row?.remove();
      parent?.classList.remove('tomoyo-cn-active');
      row = output = parent = null;
      bridge.applyTransparency?.();
      bridge.current = '';
      bridge.serial++;
      return;
    }
    if (!ensureRow(sentence)) { skip('no sentence window'); return; }
    const chars = sentence.querySelectorAll('.char-token');
    const text = (chars.length ? Array.from(chars, c => c.textContent).join('') : sentence.textContent).trim();
    bridge.cardinalPair?.bind(null, sentence, output);
    if (text !== bridge.sourceText) { bridge.sourceText = text; bridge.onSourceText?.(text); }
    if (!enabled || !translationVisible || !text || text === bridge.current) { skip(!enabled ? 'translation off' : !translationVisible ? 'translation hidden' : !text ? 'empty line' : 'already asked', text); return; }
    const growing = grown(bridge.current, text) && output.dataset.state === 'ready' && !!output.textContent;
    bridge.current = text;
    const id = ++bridge.serial;
    bridge.lastTranslationError = '';
    /* 2026-11-19 (素晴らしき日々: the grown line's request failed and 「翻译暂不可用」 replaced the translation already shown) a grown
       line that gets no translation keeps the one on screen and asks again, twice at most (deliver) */
    bridge.growingId = growing ? id : 0; if (!growing) bridge.growRetries = 0;
    if (!growing) { reserve(text); setText(bridge.quietTranslation ? '' : '翻译中…'); output.dataset.state = 'pending'; }
    try {
      window.__tomoyoTranslateRequest(JSON.stringify({ id, text, options: bridge.options?.() || {} }));
    } catch {
      setText('翻译组件未连接，请通过中文启动器重新打开 MeguLit', true);
    }
  }
  function schedule() {
    if(bridge.pageTranslationActive?.())return;
    // Source masking is local and latency-sensitive; translation keeps its debounce.
    const sentence = document.querySelector('.sentence-text');
    const chars = sentence?.querySelectorAll('.char-token');
    const text = sentence ? (chars?.length ? Array.from(chars,c=>c.textContent).join('') : sentence.textContent).trim() : '';
    if(text !== bridge.sourceText){bridge.sourceText=text;bridge.onSourceText?.(text);}
    guard(text); try { pageGuard(); } catch {}
    /* the translation row and its room exist from the first frame of the line, not 220 ms later */
    if(sentence&&text&&enabled&&translationVisible&&!output?.isConnected&&ensureRow(sentence))reserve(text);
    /* 2026-11-13 (STEINS;GATE: each new line showed the previous line's translation for ~250 ms): the translation is
       requested after a 220 ms debounce, so the old one goes the moment the source line changes */
    if(output&&text&&text!==bridge.current&&enabled&&translationVisible&&output.dataset.state!=='pending'&&!(output.dataset.state==='ready'&&grown(bridge.current,text))){reserve(text);window.TomeTypewriter?.stop(output);output.replaceChildren();bridge.markTranslationSource(output,null);output.dataset.state='pending';}
    clearTimeout(bridge.timer);
    bridge.timer = setTimeout(read, 220);
  }
  /* E415: the local model is missing, so lines go to Microsoft machine translation (E406). Say it once, in one small
     line under the translation, then let it fade; the reader session never repeats it. */
  bridge.mtNotice = () => {
    if (bridge.mtNoticed) return; bridge.mtNoticed = true;
    const host = output?.parentElement; if (!host) return;
    const note = document.createElement('small');
    note.className = 'tm-mt-note';
    note.textContent = '当前为微软机器翻译，效果一般 · 想要更好的译文可在 设置 › 翻译 接入自己的 AI API（Alt+T）';
    note.style.cssText = 'display:block;margin-top:4px;font-size:11px;line-height:1.4;opacity:.72;transition:opacity .6s';
    host.appendChild(note);
    setTimeout(() => { note.style.opacity = '0'; setTimeout(() => note.remove(), 700); }, 9000);
  };
  /* 2026-11-19 (user rule: no line stays 「未翻译」) a translation that came from the background retry (services/translation-chain.cjs)
     fills the line still on screen when it shows none or an error; a line already translated is left as it is */
  /* 2026-11-21 (owner, 千恋＊万花 中文版: a line paired with the patch shown without Chinese; r26: the patch stored, no lookup ever came): the
     line on screen is the sentence the reader shows (bridge.sourceText), whether or not a request went out for it; it matches a filled
     line written another way (ruby / brackets / blanks: the same normal form as services/reader.cjs, or one inside the other, 60 %) */
  const normal = v => { let t = String(v || '').replace(/[｜|]([^《\[｜|]+)[《\[][^》\]]*[》\]]/g, '$1').replace(/《[^》]*》/g, '').replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>/g, '').replace(/[\s\u3000\u200b\u001f]+/g, ''); for (let k = 0; k < 3; k++) t = t.replace(/^[「『“"（(【]+/, '').replace(/[」』”"）)】]+$/, ''); return t; };
  const sameLine = (a, b) => { const x = normal(a), y = normal(b); if (!x || !y) return false; if (x === y) return true; const lx = [...x].length, ly = [...y].length; return (x.includes(y) || y.includes(x)) && Math.min(lx, ly) / Math.max(lx, ly) >= .6; };
  /* 2026-11-21 translation guard: 600 ms, 1.5 s and 3 s after a line is shown, a line still without a translation is asked again by its
     text (services/reader.cjs translateGuard: cache, script, fallback chain), past the "already asked" check and the request serial; after 3 s
     a faint 「翻译中…」 stands where the translation will go, never an empty row */
  bridge.setHookSourcePreview = preview => {
    if (preview === sourcePreview) return;
    sourcePreview = preview;
    if (preview) {
      bridge.serial++;
      bridge.current = '';
    }
    resetGuard();
    schedule();
  };
  const guardNote = (what, text) => { try { window.__tomoyoTranslateRequest(JSON.stringify({ type: 'layoutDiagnostic', kind: 'translationGuard', what, text: String(text).slice(0, 40) })); } catch {} };
  const hasTranslation = () => output?.isConnected && output.dataset.state === 'ready' && !!output.textContent.trim() && output.textContent !== '翻译中…' && !bridge.lastTranslationError;
  function guard(text) {
    if (sourcePreview || !text || !enabled || !translationVisible) { resetGuard(); return; }
    if (text === guardText) return; guardText = text; for (const t of guardTimers) clearTimeout(t); guardTimers = [];
    for (const [ms, last] of [[600, false], [1500, false], [3000, true]]) guardTimers.push(setTimeout(() => {
      if (sourcePreview || guardText !== text || !sameLine(bridge.sourceText, text) || hasTranslation()) return;
      guardNote(last ? 'still-missing' : 'retry', text);
      try { window.__tomoyoTranslateRequest(JSON.stringify({ type: 'translateGuard', text, visibleSerial: bridge.serial })); } catch {}
      if (last && output?.isConnected && (!output.textContent.trim() || output.textContent === '翻译中…')) { output.textContent = '翻译中…'; output.style.opacity = '.45'; output.dataset.state = 'pending'; }
    }, ms));
  }
  bridge.translationGuard = guard;
  /* the page's earlier lines (.tome-page-tr, hook-reader): each one still empty at 0.6 / 1.5 / 3 s after it was first seen is asked by its text */
  const pageSeen = new Map();
  function pageGuard() {
    if (sourcePreview || !enabled || !translationVisible) return; const now = performance.now();
    for (const tr of document.querySelectorAll('.tome-page-lines .tome-page-tr')) {
      const jp = [...(tr.parentElement?.querySelectorAll('.tome-page-char') || [])].map(c => c.textContent).join('').trim(); if (!jp) continue;
      if (tr.textContent.trim()) { pageSeen.delete(jp); continue; }
      let s = pageSeen.get(jp); if (!s) { s = { at: now, step: 0 }; pageSeen.set(jp, s); if (pageSeen.size > 200) pageSeen.delete(pageSeen.keys().next().value); }
      const due = [600, 1500, 3000][s.step]; if (due == null || now - s.at < due) continue; s.step++;
      guardNote(s.step === 3 ? 'still-missing page' : 'retry page', jp);
      try { window.__tomoyoTranslateRequest(JSON.stringify({ type: 'translateGuard', text: jp })); } catch {}
    }
  }
  /* 2026-11-21: a page line was first seen at the next 300 ms scan, so its 600 ms check came at 0.9 to 1.2 s; the scan is every 100 ms and also runs when a line is shown */
  (window.__megulitReaderIntervals?.set||setInterval)(pageGuard, 100);
  bridge.translationTarget = () => /^(english|bilingual-en)$/.test(bridge.galPreferences?.().display || '') || bridge.options?.().learnerLanguage === 'en' ? 'en' : 'zh';
  bridge.acceptTranslationTarget = context => !context || context.target === bridge.translationTarget();
  bridge.deliverBackfill = (source, text, kind = '', context = null) => {
    if (sourcePreview) return;
    if (!bridge.acceptTranslationTarget(context)) return;
    if (!enabled || !translationVisible || !String(text || '').trim()) return;
    const shown = bridge.sourceText || bridge.current;
    if (!sameLine(shown, source)) { window.__tomoyoChinese?.pageTranslationFill?.(source, text); return; }
    if (!output?.isConnected) { const s = document.querySelector('.sentence-window .sentence-text:not(.megulit-old-line)'); if (!s || !ensureRow(s)) return; }
    const mine = sameLine(bridge.current, shown);
    if (mine && output.dataset.state === 'ready' && output.textContent.trim() && !bridge.lastTranslationError && kind !== 'better') return;
    if (!mine) { bridge.current = shown; bridge.serial++; }
    output.dataset.state = 'ready';
    bridge.returnedTranslation={line:shown,id:bridge.serial,target:bridge.translationTarget(),...context,source:context?.source||(['better','late','guard'].includes(kind)?'':kind)};bridge.refreshTranslationOrigin?.();
    bridge.lastTranslationError = ''; setText(text, false, true,bridge.returnedTranslation); bridge.alignText?.();
  };
  bridge.deliver = (id, text, error, message = '', context = null) => {
    if (!bridge.acceptTranslationTarget(context)) return;
    if(bridge.deliverPageTranslation?.(id,text,error,message,context))return;
    if (id !== bridge.serial || !enabled || !translationVisible || !output?.isConnected) return;
    if ((error || !String(text || '').trim()) && bridge.growingId === id && output.textContent) {
      const source = bridge.current;
      if ((bridge.growRetries = (bridge.growRetries || 0) + 1) <= 2) setTimeout(() => {
        if (bridge.serial !== id || bridge.current !== source || !enabled || !translationVisible) return;
        const again = ++bridge.serial; bridge.growingId = again;
        try { window.__tomoyoTranslateRequest(JSON.stringify({ id: again, text: source, options: bridge.options?.() || {} })); } catch {}
      }, 1500);
      return;
    }
    bridge.returnedTranslation={line:bridge.current,id,target:bridge.translationTarget(),...context,source:error?'':context?.source};bridge.refreshTranslationOrigin?.();
    bridge.lastTranslationError = error ? message || '暂时无法翻译，请检查网络' : '';
    const local = /^LOCAL_RUNTIME_DOWNLOADING:?(\d*)/.exec(message||'') ? (Number(/:(\d+)/.exec(message)?.[1])>0 ? `正在下载本地翻译服务程序 ${/:(\d+)/.exec(message)[1]}%，下载完自动开始翻译` : '正在下载本地翻译服务程序，下载完自动开始翻译')
      : message === 'LOCAL_STARTING' ? '服务程序已就绪，正在启动本地模型…'
      : message === 'LOCAL_RUNTIME_DOWNLOAD_FAILED' ? '本地翻译服务程序下载失败 · 检查网络后翻到下一句会重试'
      : message === 'LOCAL_SERVER_FAILED' ? '本地模型没能启动（可能是显存不够）· 可以换小一点的模型或改用在线翻译'
      : message === 'LOCAL_RUNTIME_MISSING' ? '缺少本地翻译服务程序 · Alt+T 打开设置安装' : '';
    if (error && local) bridge.lastTranslationError = local;
    setText(error ? local || (bridge.quietTranslation ? '翻译暂不可用 · Alt+T' : message || '暂时无法翻译，请检查网络，按 Alt+T 打开设置重试') : text, !!error, !error,error?null:context);
    bridge.alignText?.();
  };
  const observer = new MutationObserver(records => {
    if(records.some(record=>{const target=record.target.nodeType===3?record.target.parentElement:record.target;if(target?.closest?.('.sentence-text'))return true;return [...record.addedNodes,...record.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('.sentence-text,.sentence-window')||n.querySelector?.('.sentence-text')));} ))schedule();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  schedule();
})();
