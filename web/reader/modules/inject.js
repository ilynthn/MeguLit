(function install() {
  'use strict';
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded', install, { once: true });
    return;
  }
  if (window.__tomoyoChinese) return;
  const bridge = window.__tomoyoChinese = { current: '', serial: 0, timer: null };
  bridge.refresh = () => { if(bridge.refreshPageTranslations?.())return;bridge.current = ''; bridge.serial++; clearTimeout(bridge.timer); schedule(); };
  bridge.sourceText = '';
  let row, output, parent;
  let translationVisible = true;
  bridge.isTranslationVisible = () => translationVisible;
  bridge.setTranslationVisible = value => {
    if (translationVisible === !!value) return;
    translationVisible = !!value;
    bridge.refresh();
    if (output) output.hidden = !enabled || !translationVisible;
    try { window.__tomoyoTranslateRequest(JSON.stringify({ id: bridge.serial, disabled: !translationVisible })); } catch {}
  };
  let enabled = localStorage.getItem('tomoyo-chinese-enabled') !== 'false';
  bridge.isEnabled = () => enabled;
  bridge.setEnabled = value => {
    const next = !!value;
    if (next === enabled) return;
    enabled = next;
    localStorage.setItem('tomoyo-chinese-enabled', String(enabled));
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
  function setText(text, error = false, animate = false) {
    if (!output) return;
    output.dataset.state = error ? 'error' : 'ready';
    if (output.textContent === text) return;
    if (animate && window.TomeTypewriter) window.TomeTypewriter.text(output, text);
    else {
      window.TomeTypewriter?.stop(output); delete output.dataset.tomeTyping;
      const parts=text.split(/(\p{Script=Latin}+)/u);
      output.replaceChildren(...parts.map((part,index)=>{
        if(index%2===0)return part;
        const latin=document.createElement('span');latin.className='megulit-latin';latin.textContent=part;return latin;
      }));
    }
    output.style.opacity = error ? '.7' : '1';
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
  function read() {
    if(bridge.pageTranslationActive?.())return;
    const sentence = document.querySelector('.sentence-text');
    if (!sentence) {
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
    if (!ensureRow(sentence)) return;
    const chars = sentence.querySelectorAll('.char-token');
    const text = (chars.length ? Array.from(chars, c => c.textContent).join('') : sentence.textContent).trim();
    if (text !== bridge.sourceText) { bridge.sourceText = text; bridge.onSourceText?.(text); }
    if (!enabled || !translationVisible || !text || text === bridge.current) return;
    bridge.current = text;
    const id = ++bridge.serial;
    bridge.lastTranslationError = '';
    setText(bridge.quietTranslation ? '' : '翻译中…');
    output.dataset.state = 'pending';
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
    /* 2026-11-13 (STEINS;GATE: each new line showed the previous line's translation for ~250 ms): the translation is
       requested after a 220 ms debounce, so the old one goes the moment the source line changes */
    if(output&&text&&text!==bridge.current&&enabled&&translationVisible&&output.dataset.state!=='pending'){window.TomeTypewriter?.stop(output);output.replaceChildren();output.dataset.state='pending';}
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
  bridge.deliver = (id, text, error, message = '') => {
    if(bridge.deliverPageTranslation?.(id,text,error,message))return;
    if (id !== bridge.serial || !enabled || !translationVisible || !output?.isConnected) return;
    bridge.lastTranslationError = error ? message || '暂时无法翻译，请检查网络' : '';
    const local = /^LOCAL_RUNTIME_DOWNLOADING:?(\d*)/.exec(message||'') ? (Number(/:(\d+)/.exec(message)?.[1])>0 ? `正在下载本地翻译服务程序 ${/:(\d+)/.exec(message)[1]}%，下载完自动开始翻译` : '正在下载本地翻译服务程序，下载完自动开始翻译')
      : message === 'LOCAL_STARTING' ? '服务程序已就绪，正在启动本地模型…'
      : message === 'LOCAL_RUNTIME_DOWNLOAD_FAILED' ? '本地翻译服务程序下载失败 · 检查网络后翻到下一句会重试'
      : message === 'LOCAL_MODEL_MISSING' ? '还没有下载本地翻译模型 · Alt+T 打开设置下载'
      : message === 'LOCAL_SERVER_FAILED' ? '本地模型没能启动（可能是显存不够）· 可以换小一点的模型或改用在线翻译'
      : message === 'LOCAL_RUNTIME_MISSING' ? '缺少本地翻译服务程序 · Alt+T 打开设置安装' : '';
    if (error && local) bridge.lastTranslationError = local;
    setText(error ? local || (bridge.quietTranslation ? '翻译暂不可用 · Alt+T' : message || '暂时无法翻译，请检查网络，按 Alt+T 打开设置重试') : text, !!error, !error);
    bridge.alignText?.();
  };
  const observer = new MutationObserver(records => {
    if(records.some(record=>{const target=record.target.nodeType===3?record.target.parentElement:record.target;if(target?.closest?.('.sentence-text'))return true;return [...record.addedNodes,...record.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('.sentence-text,.sentence-window')||n.querySelector?.('.sentence-text')));} ))schedule();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  schedule();
})();
