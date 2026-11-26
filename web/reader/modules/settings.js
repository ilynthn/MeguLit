(function installSettings() {
  'use strict';
  if (!document.documentElement) { document.addEventListener('DOMContentLoaded', installSettings, { once: true }); return; }
  const bridge = window.__tomoyoChinese;
  if (!bridge || bridge.openSettings) return;
  const defaults = { font: 'Microsoft YaHei', size: 18, color: '', bold: false, enabled: bridge.isEnabled(), transparent: true, provider: 'google', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' };
  defaults.region = ''; defaults.deeplTier = 'free'; defaults.contextEnabled = true; defaults.scriptTranslation = true; defaults.contextLines = 4; defaults.learnerLanguage='zh';defaults.readingEngine='sudachi';
  defaults.lookupProvider='moji';defaults.contextProvider='deepseek';defaults.lookupProfiles={"deepseek":{"baseUrl":"https://api.deepseek.com","model":"deepseek-flash"},"gemini":{"baseUrl":"https://generativelanguage.googleapis.com/v1beta/openai","model":""},"gpt":{"baseUrl":"https://api.openai.com/v1","model":"gpt-4.1-mini"},"qwen":{"baseUrl":"https://dashscope.aliyuncs.com/compatible-mode/v1","model":"qwen-plus"},"kimi":{"baseUrl":"https://api.moonshot.ai/v1","model":"kimi-k2.6"},"glm":{"baseUrl":"https://open.bigmodel.cn/api/paas/v4","model":"glm-4.7"}};
  let settings = { ...defaults }, dialog, status, pendingSave = null, saveSerial = 0;
  try {
    const saved = JSON.parse(localStorage.getItem('tomoyo-chinese-settings') || '{}');
    for (const key of Object.keys(defaults)) if (saved[key] !== undefined) settings[key] = saved[key];
  } catch {}
  bridge.options = () => ({ provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model, region:settings.region || '', deeplTier:settings.deeplTier || 'free', contextEnabled:settings.contextEnabled!==false,contextLines:settings.contextLines||4,learnerLanguage:settings.learnerLanguage||'zh',readingEngine:settings.readingEngine||'sudachi',lookupProvider:settings.lookupProvider,contextProvider:settings.contextProvider||'deepseek',lookupProfiles:settings.lookupProfiles });
  bridge.updateLearningSettings=value=>{settings={...settings,...value};localStorage.setItem('tomoyo-chinese-settings',JSON.stringify(settings));try{window.__tomoyoTranslateRequest(JSON.stringify({type:'learningSettings',settings}));}catch{}bridge.refresh();};
  // Translation text colour for applyGameStyle (gal.js): '#rrggbb', or '' to follow the theme. Saved like the dialog's
  // save button, without touching the API key.
  bridge.translationColor = { get: () => settings.color || '', set: color => {
    if (color !== '' && !/^#[0-9a-f]{6}$/i.test(color)) throw Error('颜色格式应为 #rrggbb');
    settings = { ...settings, color }; localStorage.setItem('tomoyo-chinese-settings', JSON.stringify(settings)); applyAppearance();
    try { window.__tomoyoTranslateRequest(JSON.stringify({ type: 'configure', ...bridge.options(), settings, apiKey: '' })); } catch {}
  } };
  bridge.restoreSettings = saved => {
    if (!saved || !Object.keys(saved).length) return;
    for (const key of Object.keys(defaults)) if (saved[key] !== undefined) settings[key] = saved[key];
    localStorage.setItem('tomoyo-chinese-settings', JSON.stringify(settings));
    applyAppearance();
    bridge.refresh();
  };
  const style = document.createElement('style');
  style.textContent = `
    .tome-models { display:grid; gap:8px; margin:10px 0; padding:10px; border:1px solid color-mix(in srgb,currentColor 18%,transparent); border-radius:10px; }
    .tome-models-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .tome-models-head select { width:auto; }
    .tome-models-head strong { white-space:nowrap; }
    .tome-model-row { display:grid; grid-template-columns:1fr auto; gap:2px 8px; align-items:center; }
    .tome-model-runtime { padding:10px 12px; margin:0 0 12px; border:1px solid #c8303c66; border-radius:10px; background:#c8303c14; } /* E399 the runtime sits apart from the model list */
    .tome-model-row small { grid-column:1; opacity:.7; word-break:break-all; }
    .tome-model-row button { grid-column:2; grid-row:1 / span 2; }
    .tomoyo-cn-dialog { width:430px; max-width:calc(100vw - 30px); max-height:calc(100vh - 30px); box-sizing:border-box; overflow-y:auto; padding:22px; border:1px solid #494c5c; border-radius:14px; background:#20222c; color:var(--tome-picture-text,#eceef5); font:14px/1.6 'Microsoft YaHei',sans-serif; pointer-events:auto!important; -webkit-app-region:no-drag; }
    .tomoyo-cn-dialog { position:fixed;inset:0;margin:auto;height:fit-content;z-index:2147482000; }
    .tomoyo-cn-dialog h3 { margin:0 0 14px; font-size:18px; }
    .tomoyo-cn-dialog label { display:block; margin-top:10px; }
    .tomoyo-cn-dialog input,.tomoyo-cn-dialog select { display:block; width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #505465; border-radius:6px; margin-top:4px; background:#2c2f3b; color:var(--tome-picture-text,#f5f5fa); font:inherit; }
    .tomoyo-cn-dialog input[type=color] { height:36px; padding:3px; }
    .tomoyo-cn-dialog input[type=checkbox] { display:inline; width:auto; margin:0 6px 0 0; }
    .tomoyo-cn-dialog small { display:block; margin-top:5px; color:var(--tome-picture-muted,#b5b9c9); line-height:1.5; }
    .tomoyo-cn-dialog footer { display:flex; gap:9px; margin-top:18px; justify-content:flex-end; }
    .tomoyo-cn-dialog footer button { padding:6px 14px; border:1px solid #505465; border-radius:6px; color:var(--tome-picture-text,#eef1fa); background:#343847; cursor:pointer; font:inherit; }
    .tomoyo-cn-dialog footer button[type=submit] { background:#4b7cbb; border-color:#4b7cbb; }
    .tomoyo-cn-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .tomoyo-cn-status { color:var(--tome-picture-muted,#c9dcff); min-height:22px; margin-top:10px; }
    .tomoyo-cn-gpt[hidden], .tomoyo-cn-dialog [hidden] { display:none!important; }
    html, body, body * { scrollbar-width:none!important; }
    ::-webkit-scrollbar { width:0!important; height:0!important; display:none!important; }
    .tomoyo-cn-dialog details { margin-top:14px; padding-top:10px; border-top:1px solid #ffffff14; }
    .tomoyo-cn-dialog summary { color:var(--tome-picture-text,#d5d7e0); cursor:pointer; }
    .tomoyo-cn-dialog .tomoyo-gal-fields { margin:0 0 16px; border-color:#555966; }
    .tomoyo-cn-dialog .tomoyo-gal-fields legend { color:var(--tome-picture-text,#f4e6cd); }
  `;
  (document.head || document.documentElement).appendChild(style);
  function applyTransparency(active = settings.transparent) {
    active = !!window.__tomoyoMode?.isTranslation();
    const marked = new Set();
    let element = active ? document.querySelector('.sentence-window') : null;
    while (element) { marked.add(element); element = element.parentElement; }
    for (const previous of document.querySelectorAll('[data-tomoyo-transparent]')) if (!marked.has(previous)) previous.removeAttribute('data-tomoyo-transparent');
    for (const element of marked) element.setAttribute('data-tomoyo-transparent', '');
  }
  bridge.applyTransparency = applyTransparency;
  function applyAppearance(preview = settings) {
    applyTransparency(preview.transparent);
    bridge.setEnabled(preview.enabled);
    const output = document.querySelector('.tomoyo-cn-output');
    if (!output) return;
    const original = document.querySelector('.sentence-text');
    output.style.fontFamily = preview.font === 'inherit' ? (original ? getComputedStyle(original).fontFamily : 'inherit') : String(preview.font || defaults.font).replace(/[;{}]/g, '') + ', "Microsoft YaHei", sans-serif';
    output.style.fontSize = Math.max(10, Math.min(60, Number(preview.size) || 18)) + 'px';
    output.style.color = /^#[0-9a-f]{6}$/i.test(preview.color) ? preview.color : '';
    output.style.fontWeight = preview.bold ? '700' : '400';
  }
  bridge.applyAppearance = applyAppearance;
  bridge.configured = (success, message, configureId) => {
    // Ignore acknowledgements for previews or an older request while an explicit save is pending.
    if (Number.isSafeInteger(configureId) && (!pendingSave || configureId !== pendingSave.id)) return;
    if (pendingSave && configureId !== pendingSave.id) return;
    const saved = pendingSave; pendingSave = null;
    if (saved) {
      clearTimeout(saved.timer);
      saved.button.disabled = false; saved.keyField.disabled = false;
      if (success) {
        settings = saved.settings;
        localStorage.setItem('tomoyo-chinese-settings', JSON.stringify(settings));
        saved.keyField.value = '';
        applyAppearance();
      }
      if (saved.status.isConnected) saved.status.textContent = success ? '已应用并保存，重启后无需重新设置' : message;
    } else if (status) status.textContent = success ? '已应用并保存，重启后无需重新设置' : message;
    if (success) { bridge.refresh(); requestKeyStatus(); }
  };
  // The launcher answers with booleans only, so the page can show whether a key is stored without ever seeing it.
  let keyField = null, keyOptions = null;
  function requestKeyStatus() {
    if (!keyField || !keyOptions) return;
    const options = keyOptions();
    if (options.provider === 'google') return;
    try { window.__tomoyoTranslateRequest(JSON.stringify({ type:'keyStatus', targets:{ current:options } })); } catch {}
  }
  bridge.keyStatus = result => {
    if (!keyField?.isConnected) return;
    let local = false; try { local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(String(keyOptions?.()?.baseUrl || '')).hostname); } catch {}
    keyField.placeholder = local ? '本机地址无需密钥，可留空' : result?.current ? '✓ 已保存密钥（Windows 加密），留空即继续使用' : '尚未保存此服务的密钥，请填写后保存';
    keyField.dataset.saved = result?.current ? '1' : '0';
  };
  bridge.openSettings = () => {
    if (dialog?.isConnected) { if(!dialog.open)dialog.show(); return; }
    dialog = document.createElement('dialog');
    dialog.className = 'tomoyo-cn-dialog';
    dialog.innerHTML = `<form>
      <h3>阅读设置</h3>
      <small>Alt+M 绑定当前游戏窗口，Alt+T 开关菜单<br>Alt+H 一键开关内嵌和全部 MeguLit 覆盖</small>
      <label><input name="enabled" type="checkbox">启用中文翻译</label>
      <label><input name="transparent" type="checkbox">背景全透明（绑定游戏后固定开启）</label>
      <details><summary>自定义译文字体与颜色</summary>
      <small>在「游戏风格」中选自定义后生效</small>
      <label>字体<select name="font"><option value="Microsoft YaHei">微软雅黑</option><option value="DengXian">等线</option><option value="SimSun">宋体</option><option value="KaiTi">楷体</option><option value="Noto Sans SC">思源黑体（需已安装）</option><option value="inherit">跟随主题字体</option></select></label>
      <div class="tomoyo-cn-grid"><label>字号（px）<input name="size" type="number" min="10" max="60" required></label><label>文字颜色<input name="color" type="color"></label></div>
      <label><input name="themeColor" type="checkbox">颜色跟随 MeguLit 主题</label>
      <label style="display:none"><input name="bold" type="checkbox">加粗中文</label>
      </details>
      <label class="megulit-script-toggle"><input name="scriptTranslation" type="checkbox">零延迟翻译（汉化脚本）</label><p class="hint megulit-script-hint">当前作品已用汉化脚本：能对上的句子直接用汉化组译文（零延迟），翻译引擎只翻对不上的句子</p><label>翻译引擎<select name="provider"><option value="google">Google 免费</option><option value="bing">Bing / Microsoft Translator API</option><option value="deepseek">DeepSeek API</option><option value="deepl">DeepL API</option><option value="gpt">GPT / OpenAI 兼容接口</option></select></label>
      <div class="tomoyo-cn-gpt">
        <label>API 地址<input name="baseUrl" type="url" placeholder="https://api.openai.com/v1"></label>
        <label>模型名<input name="model" type="text" placeholder="gpt-4.1-mini" maxlength="200" list="megulit-reader-model-list"><datalist id="megulit-reader-model-list"></datalist></label>
        <label>Azure 区域<input name="region" type="text" placeholder="例如 eastasia；全局资源留空" maxlength="60"></label>
        <label>DeepL 接口<select name="deeplTier"><option value="free">API Free</option><option value="pro">API Pro / 付费接口</option></select></label>
        <label>API Key<input name="apiKey" type="password" autocomplete="off" placeholder="已配置可留空；密钥由 Windows 加密保存"></label>
        <label><input name="contextEnabled" type="checkbox">结合前文翻译</label><label>参考前几句<input name="contextLines" type="range" min="1" max="8" step="1"><output data-context-count></output></label><small>DeepSeek / GPT 参考前文和已有译文；DeepL 参考前文原文；Google / Bing 按当前句翻译</small><small data-api-hint></small><div class="tome-models" data-models hidden></div>
      </div>
      <div class="tomoyo-cn-status" role="status"></div>
      <footer><button type="button" data-cancel>取消</button><button type="submit">保存并应用</button></footer>
    </form>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    // Other tabs contain programmatically measured fractional values. They must not block API saving.
    // The backend validates the selected provider/address before acknowledging the save.
    form.noValidate = true;
    const field = name => form.elements.namedItem(name);
    const ENG = window.__tomoyoEngines || {};
    // Three kinds, as in LunaTranslator: AI model APIs (address preset, only a key to fill in), local models running
    // on this PC, and classic machine translation (free ones first).
    { const sel = field('provider'), groups = [['AI 大模型接口（填入 API Key 即可）',['llm'],[['deepseek','DeepSeek'],['gpt','GPT / OpenAI 兼容接口（自定义地址）']]],['本地大模型（离线运行）',['local'],[]],['传统机器翻译',['free','api'],[['google','Google 免费'],['bing','Bing / Azure Translator API'],['deepl','DeepL API']]]];
      sel.replaceChildren();
      for (const [title,keys,base] of groups) { const g = document.createElement('optgroup'); g.label = title; for (const [v,t] of [...base, ...keys.flatMap(key=>Object.entries(ENG).filter(([k,e])=>e.group===key&&(!e.hidden||k===settings.provider)).map(([k,e])=>[k,e.label]))]) g.append(new Option(t,v)); sel.append(g); } }
    field('font').value = settings.font;
    field('size').value = settings.size;
    field('color').value = /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : '#c6c6d2';
    field('themeColor').checked = !settings.color;
    field('bold').checked = !!settings.bold;
    field('enabled').checked = !!settings.enabled;
    field('transparent').checked = !!settings.transparent;
    field('provider').value = settings.provider;
    field('baseUrl').value = settings.baseUrl;
    field('model').value = settings.model;
    field('region').value = settings.region || '';
    field('deeplTier').value = settings.deeplTier || 'free';
    field('contextEnabled').checked = settings.contextEnabled !== false;
    field('scriptTranslation').checked = settings.scriptTranslation !== false;
    field('contextLines').value = settings.contextLines || 4;
    status = dialog.querySelector('.tomoyo-cn-status');
    keyField = field('apiKey');
    keyOptions = () => { const f = readForm(); return { provider:f.provider, baseUrl:f.baseUrl || 'https://api.openai.com/v1', region:f.region, deeplTier:f.deeplTier }; };
    status.textContent = bridge.lastTranslationError || '';
    const readForm = () => ({ ...settings, font: field('font').value, size: Number(field('size').value), color: field('themeColor').checked ? '' : field('color').value,
      bold: field('bold').checked, enabled: field('enabled').checked, transparent: field('transparent').checked,
      provider: field('provider').value, baseUrl: field('baseUrl').value.trim(), model: field('model').value.trim(), region:field('region').value.trim(), deeplTier:field('deeplTier').value,contextEnabled:field('contextEnabled').checked,scriptTranslation:field('scriptTranslation').checked,contextLines:Number(field('contextLines').value) });
    // Offline model files for the local servers above: download (HuggingFace or its China mirror), cancel, delete.
    const models = { timer: 0, source: 'hf', async paint(box) {
      let s; try { s = await bridge.v4Request('modelStatus', {}); } catch { return; }
      if (!box.isConnected) return;
      const gb = n => (n / 1073741824).toFixed(2) + ' GB';
      const head = document.createElement('div'); head.className = 'tome-models-head';
      const title = document.createElement('strong'); title.textContent = '离线模型下载'; const src = document.createElement('select');
      for (const [v, t] of [['hf', 'HuggingFace（海外）'], ['mirror', 'hf-mirror（国内镜像）']]) src.append(new Option(t, v)); src.value = models.source; src.onchange = () => { models.source = src.value; };
      head.append(title, src);
      const rows = s.models.map(m => {
        const row = document.createElement('div'); row.className = 'tome-model-row';
        const name = document.createElement('span'); name.textContent = m.label; const meta = document.createElement('small');
        const job = m.job, busy = job?.state === 'downloading';
        const w = ({ en:['Downloading ','Download failed: ','Downloaded · ',' GB · suggested VRAM '], ja:['ダウンロード中 ','ダウンロード失敗：','ダウンロード済み · ',' GB · 推奨 VRAM '] })[window.__tomeI18n?.get?.()] || ['下载中 ','下载失败：','已下载 · ',' GB · 建议显存 '];
        meta.dataset.noI18n = '';
        meta.textContent = busy ? w[0] + gb(job.received) + ' / ' + (job.total ? gb(job.total) : '?') : job?.state === 'error' ? w[1] + job.error : m.installed ? w[2] + m.file : m.size + w[3] + m.vram + ' GB';
        const act = document.createElement('button'); act.type = 'button';
        act.textContent = busy ? '取消' : m.installed ? '删除' : '下载';
        act.onclick = async () => { act.disabled = true; try { await bridge.v4Request(busy ? 'modelCancel' : m.installed ? 'modelDelete' : 'modelDownload', { id: m.id, source: models.source }); } catch {} models.paint(box); };
        row.append(name, meta, act); return row;
      });
      // The runtime that runs these files (user, 2026-11-03: a downloaded model alone only gave "fetch failed").
      const lang = window.__tomeI18n?.get?.(), rt = s.runtime, rjob = rt?.job, rbusy = rjob?.state === 'downloading';
      const L = ({ en:{ name:'llama.cpp local runtime (runs the models; NVIDIA / AMD / Intel GPUs)', ready:'Installed · ', running:' · running ', get:'Download and install', cancel:'Cancel', del:'Delete', fail:'Download failed: ', note:'Saved in ', note2:'. With the runtime and one model downloaded, pick the Sakura or llama.cpp engine: MeguLit starts the local server itself (the first line takes a while to load). A server you run yourself at the address above is used as is' },
        ja:{ name:'llama.cpp ローカル実行環境（モデルを動かす本体・NVIDIA / AMD / Intel GPU 対応）', ready:'インストール済み · ', running:' · 実行中 ', get:'ダウンロードしてインストール', cancel:'取消', del:'削除', fail:'ダウンロード失敗：', note:'保存先：', note2:'。実行環境とモデルを 1 つダウンロードし、Sakura か llama.cpp エンジンを選ぶと MeguLit がローカルサーバーを自動で起動します（最初の 1 行は読み込みに時間がかかります）。上のアドレスで自分で起動したサーバーはそのまま使います' } })[lang] || { name:'llama.cpp 本地运行库（运行下面的模型，NVIDIA / AMD / Intel 显卡通用）', ready:'已安装 · ', running:' · 正在运行 ', get:'下载并安装', cancel:'取消', del:'删除', fail:'下载失败：', note:'保存位置：', note2:'。下载运行库和一个模型后，选 Sakura 或 llama.cpp 引擎即可，MeguLit 会自动启动本地服务（第一句需要等模型加载）；上方地址上你自己启动的服务会直接使用' };
      const runtime = document.createElement('div'); runtime.className = 'tome-model-row tome-model-runtime'; /* E399 its own block above the model list (user: 移出这个列表，单独一个按钮下载安装) */
      if (rt) { const name = document.createElement('span'); name.textContent = L.name; name.dataset.noI18n = ''; const meta = document.createElement('small'); meta.dataset.noI18n = '';
        meta.textContent = rbusy ? gb(rjob.received) + ' / ' + gb(rjob.total || rt.size) : rjob?.state === 'error' ? L.fail + rjob.error : rt.installed ? L.ready + rt.version + (rt.running ? L.running + rt.model : '') : rt.version + ' · ' + (rt.size / 1048576).toFixed(0) + ' MB';
        const act = document.createElement('button'); act.type = 'button'; act.dataset.noI18n = ''; act.textContent = rbusy ? L.cancel : rt.installed ? L.del : L.get;
        act.onclick = async () => { act.disabled = true; try { await bridge.v4Request(rbusy ? 'runtimeCancel' : rt.installed ? 'runtimeDelete' : 'runtimeDownload', {}); } catch {} models.paint(box); };
        runtime.append(name, meta, act); }
      const note = document.createElement('small'); note.textContent = L.note + s.dir + L.note2; note.dataset.noI18n = '';
      box.replaceChildren(...(rt ? [runtime] : []), head, ...rows, note);
      clearTimeout(models.timer); if (rbusy || s.models.some(m => m.job?.state === 'downloading')) models.timer = setTimeout(() => models.paint(box), 800);
    } };
    const updateForm = () => {
      field('transparent').checked = !!window.__tomoyoMode?.isTranslation();
      field('transparent').disabled = true;
      const provider = field('provider').value, eng = ENG[provider], useGPT = provider === 'gpt' || !!eng?.editable, llm = ['gpt','deepseek'].includes(provider) || eng?.kind === 'llm'; { const list = dialog.querySelector('#megulit-reader-model-list'); if (list) list.replaceChildren(...(Array.isArray(eng?.models) ? eng.models : (window.__tomoyoModelLists || {})[provider] || []).map(name => Object.assign(document.createElement('option'), { value: name }))); }
      dialog.querySelector('.tomoyo-cn-gpt').hidden = provider === 'google';
      field('baseUrl').closest('label').hidden = !useGPT;
      field('model').closest('label').hidden = !llm;
      field('apiKey').closest('label').hidden = !!eng?.keyless;
      field('apiKey').closest('label').firstChild.textContent = eng?.pair ? 'ID:密钥' : 'API Key';
      field('region').closest('label').hidden = provider !== 'bing';
      field('deeplTier').closest('label').hidden = provider !== 'deepl';
      field('baseUrl').disabled = !useGPT;
      field('model').disabled = !llm;
      field('baseUrl').required = useGPT;
      field('model').required = llm;
      field('contextEnabled').disabled = !(llm || provider === 'deepl') || provider === 'sakura';
      field('contextLines').disabled = field('contextEnabled').disabled || !field('contextEnabled').checked;
      dialog.querySelector('[data-api-hint]').textContent = ({bing:'填写 Azure Translator 资源的 Key 和区域；使用微软官方 API',deepseek:'使用 api.deepseek.com；默认 deepseek-flash，可修改模型名',deepl:'填写 DeepL API Key，按账户选择 Free 或付费接口',gpt:'台词发送到填写的 API 地址；ChatGPT Plus 不包含 API 额度'}[provider]||eng?.hint||'')+(eng?.keyless?'；不需要密钥':'；密钥使用当前 Windows 账户加密保存，重启无需重填');
      { const box = dialog.querySelector('[data-models]'); box.hidden = eng?.group !== 'local'; if (!box.hidden) models.paint(box); }
      field('color').disabled = field('themeColor').checked;
      dialog.querySelector('[data-context-count]').textContent = field('contextLines').value+' 句';
      applyAppearance(readForm());
    };
    form.oninput = event => { if (event.target.name === 'color') field('themeColor').checked = false; updateForm(); };
    field('provider').onchange = () => {
      field('apiKey').value = '';
      const eng = ENG[field('provider').value];
      if (eng) { if (eng.editable) field('baseUrl').value = eng.baseUrl; if (eng.kind === 'llm') field('model').value = eng.model; }
      else if (field('provider').value === 'gpt' && Object.values(ENG).some(e => e.baseUrl === field('baseUrl').value)) field('baseUrl').value = 'https://api.openai.com/v1';
      if(field('provider').value === 'deepseek') field('model').value = 'deepseek-flash';
      else if(field('provider').value === 'gpt' && field('model').value.startsWith('deepseek-'))field('model').value = 'gpt-4.1-mini';
      updateForm(); requestKeyStatus();
    };
    const close = () => { field('apiKey').value = ''; const closing = dialog; dialog = null; status = null; closing.close(); applyAppearance(); if (bridge.menuLeave) bridge.menuLeave(closing); else closing.remove(); };
    dialog.querySelector('[data-cancel]').onclick = close;
    dialog.oncancel = event => { event.preventDefault(); close(); };
    form.onsubmit = event => {
      event.preventDefault();
      if (pendingSave) return;
      const next = readForm(), button = form.querySelector('button[type=submit]'), configureId = ++saveSerial;
      pendingSave = { id:configureId, settings:next, button, keyField:field('apiKey'), status };
      button.disabled = true; field('apiKey').disabled = true; status.textContent = '正在应用…';
      pendingSave.timer = setTimeout(() => bridge.configured(false, '保存响应超时，输入已保留，请重试', configureId), 20000);
      try {
        window.__tomoyoTranslateRequest(JSON.stringify({ type:'configure', configureId, ...next, settings:next, apiKey:field('apiKey').value }));
      } catch { bridge.configured(false, '翻译组件未连接，请使用中文启动器重开', configureId); }
    };
    updateForm();
    field('baseUrl').addEventListener('change', requestKeyStatus);
    field('deeplTier').addEventListener('change', requestKeyStatus);
    requestKeyStatus();
    // Finish the decorating wrappers before painting the floating panel. No modal top-layer surface is needed.
    queueMicrotask(()=>{if(dialog?.isConnected&&!dialog.open)dialog.show();});
  };
  document.addEventListener('keydown', event => {
    if(event.code==='Escape'&&dialog?.open){event.preventDefault();event.stopImmediatePropagation();dialog.dispatchEvent(new Event('cancel',{cancelable:true}));return;}
    /* 2026-11-16 one path per hotkey: when the bridge holds Alt+T / Alt+H (RegisterHotKey) the page never handles them as well */
    if (event.altKey && (event.code === 'KeyT' && bridge.nativeHotkeys?.menu === true || event.code === 'KeyH' && bridge.nativeHotkeys?.cover === true)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.altKey && event.code === 'KeyH' && !event.repeat) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { window.__tomoyoTranslateRequest(JSON.stringify({type:'galToggleCover'})); } catch {}
      return;
    }
    if (event.altKey && event.code === 'KeyT' && !event.repeat) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (bridge.toggleGalMenu) bridge.toggleGalMenu();
      else if (dialog?.open) dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      else bridge.openSettings();
    }
  }, true);
  try { window.__tomoyoTranslateRequest(JSON.stringify({ type: 'loadPreferences' })); } catch {}
  applyAppearance();
})();
