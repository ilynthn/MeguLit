/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E383 Built-in tutorials at the top of Settings pages (user 2026-11-10: many people do not know what an API key, credits
   or a local model are, or that the voice engine has to be downloaded; the help must sit in Settings, not appear only
   when something fails). One folding card per page, open until the reader folds it; buttons do the step for them. */

const T = (zh, en, ja) => ({ zh, en, ja });

/* Steps are plain text; a link marker (link + colon + id in braces) becomes a button that opens that page, an act marker a button that runs an action. */
const LINKS = {
  deepseek: 'https://platform.deepseek.com/api_keys',
  siliconflow: 'https://cloud.siliconflow.cn/account/ak',
  bailian: 'https://bailian.console.aliyun.com/',
  gemini: 'https://aistudio.google.com/apikey',
  anki: 'https://apps.ankiweb.net/',
  ankiconnect: 'https://ankiweb.net/shared/info/2055492159',
  site: 'https://megulit.com',
};
const LINK_LABEL = {
  deepseek: T('打开 DeepSeek 开放平台', 'Open the DeepSeek platform', 'DeepSeek を開く'),
  siliconflow: T('打开硅基流动', 'Open SiliconFlow', 'SiliconFlow を開く'),
  bailian: T('打开阿里云百炼', 'Open Alibaba Bailian', 'Alibaba Bailian を開く'),
  gemini: T('打开 Google AI Studio', 'Open Google AI Studio', 'Google AI Studio を開く'),
  anki: T('下载 Anki', 'Download Anki', 'Anki をダウンロード'),
  ankiconnect: T('AnkiConnect 插件页', 'AnkiConnect add-on page', 'AnkiConnect のページ'),
  site: T('打开官网', 'Open megulit.com', '公式サイトを開く'),
};
const ACTIONS = {
  voice: T('一键下载语音引擎', 'Download the voice engine', '音声エンジンをダウンロード'),
  reading: T('一键下载注音词典', 'Download the reading dictionary', '読み仮名辞書をダウンロード'),
  ankiCheck: T('检查 Anki 连接', 'Check the Anki connection', 'Anki との接続を確認'),
};

const GUIDES = {
  translation: {
    title: T('翻译怎么选？', 'Which translation?', '翻訳の選び方'),
    summary: T('3 种方式 · 零延迟汉化 · 5 步接入 DeepSeek', '3 options · zero-latency · DeepSeek in 5 steps', '3 つの方式・ゼロ遅延・DeepSeek 5 ステップ'),
    blocks: [
      {
        icon: '⚡',
        head: T('有汉化？用零延迟', 'Have a translation patch? Go zero-latency', '翻訳パッチがあればゼロ遅延'),
        steps: [
          T('游戏有汉化或官方中文时，日文一出，人工译文立刻出现，免费不联网', 'With a fan or official Chinese version, the human translation appears instantly, free and offline', '中国語版があれば、人の訳が即表示。無料・オフライン'),
          T('在本页打开「零延迟翻译」', 'Turn on Zero-latency translation on this page', 'このページで「ゼロ遅延翻訳」をオン'),
          T('没自动找到？作品页「汉化脚本」→「手动选择」汉化文件', 'Not found? Game page → Translation script → Choose manually', '見つからない時は作品ページ「翻訳スクリプト」→「手動で選択」'),
        ],
      },
      {
        icon: '🧭',
        head: T('其余句子：三选一', 'Everything else: pick one', 'それ以外は 3 つから選ぶ'),
        steps: [
          T('🌐 免费机翻：不用设置，质量一般', '🌐 Free MT: no setup, fair quality', '🌐 無料翻訳：設定不要、品質そこそこ'),
          T('✨ API 翻译：质量最好，要 API Key，按字数付少量钱', '✨ API: best quality, needs an API key, a little per character', '✨ API 翻訳：最高品質、API キーと少額の料金'),
          T('💻 本地模型：免费离线，要 6 GB 以上显存', '💻 Local model: free and offline, needs 6 GB+ VRAM', '💻 ローカル：無料・オフライン、VRAM 6 GB 以上'),
        ],
      },
      {
        icon: '🔑',
        head: T('API Key 是什么？', 'What is an API key?', 'API キーとは？'),
        steps: [
          T('AI 平台给你的一串密码，用多少扣多少余额', 'A password-like string from the AI platform; usage is taken from your balance', 'AI サービスの合言葉。使った分だけ残高から引かれます'),
          T('读完一部游戏通常只要几块钱，新用户常送免费额度', 'A whole game usually costs very little; new users often get free credit', '1 本読んでもわずかな金額。新規は無料枠も'),
          T('Key 加密存在本机，别发给别人', 'Stored encrypted on this PC; never share it', 'この PC に暗号化保存。人に渡さないで'),
        ],
      },
      {
        icon: '🚀',
        head: T('推荐：DeepSeek 5 步', 'Recommended: DeepSeek in 5 steps', 'おすすめ：DeepSeek 5 ステップ'),
        steps: [
          T('注册登录 {link:deepseek}', 'Sign up {link:deepseek}', '登録 {link:deepseek}'),
          T('「充值」先充 10 元', 'Top up a small amount', '少額をチャージ'),
          T('「API keys」→ 创建，复制 Key（只显示一次）', 'API keys → Create, copy the key (shown once)', '「API keys」→ 作成してコピー（一度だけ表示）'),
          T('本页选「API 翻译」→「DeepSeek」，粘贴 Key，保存', 'Here: API translation → DeepSeek, paste, save', 'ここで「API 翻訳」→「DeepSeek」、貼り付けて保存'),
          T('开游戏试试。401 Key 错，402 余额不足，429 稍等再试', 'Try a game. 401 wrong key, 402 top up, 429 wait', '試す。401 キー誤り、402 残高不足、429 少し待つ'),
        ],
      },
      {
        icon: '🗂',
        head: T('其他平台', 'Other platforms', 'その他'),
        steps: [
          T('硅基流动：新用户送额度 {link:siliconflow}', 'SiliconFlow: free credit {link:siliconflow}', 'SiliconFlow：無料枠 {link:siliconflow}'),
          T('通义千问（阿里云百炼） {link:bailian}', 'Qwen (Alibaba Bailian) {link:bailian}', 'Qwen（Alibaba Bailian） {link:bailian}'),
          T('海外：Google Gemini 有免费额度 {link:gemini}', 'Outside China: Google Gemini free tier {link:gemini}', '海外：Google Gemini 無料枠 {link:gemini}'),
        ],
      },
      {
        icon: '💻',
        head: T('本地模型 3 步', 'Local model in 3 steps', 'ローカルモデル 3 ステップ'),
        steps: [
          T('选「本地模型」→「下载并安装」服务（约 37 MB）', 'Pick Local model → Download and install (about 37 MB)', '「ローカルモデル」→「インストール」（約 37 MB）'),
          T('下载模型：6–8 GB 显存选 4B，12 GB 以上选 14B', 'Get a model: 4B for 6–8 GB VRAM, 14B for 12 GB+', 'モデル取得：6–8 GB は 4B、12 GB 以上は 14B'),
          T('点「使用此模型」，之后自动启动', 'Click Use this model; it starts by itself', '「このモデルを使う」で完了、自動起動'),
        ],
      },
    ],
  },
  speech: {
    title: T('朗读和跟读：先装语音引擎', 'Read-aloud: install the voice engine first', '読み上げ：まず音声エンジンを入れる'),
    blocks: [
      {
        head: T('一键安装', 'One-click install', 'ワンクリックで導入'),
        steps: [
          T('朗读、跟读用的是 AivisSpeech 语音引擎，第一次要下载约 290 MB（装好后约 850 MB）。国内会自动从 MeguLit 国内镜像下载，很快 {act:voice}', 'Read-aloud uses the AivisSpeech engine, a one-time download of about 290 MB (850 MB installed). In China it comes from MeguLit\'s own mirror {act:voice}', '読み上げには AivisSpeech エンジンを使います。初回のみ約 290 MB をダウンロード（展開後約 850 MB） {act:voice}'),
          T('装好后，查词卡片和句子旁的朗读按钮就能出声；跟读就是听一遍再自己念一遍', 'After that, the speaker buttons on word cards and lines play audio; to shadow, listen once and repeat it aloud', '導入後は単語カードや文の再生ボタンで音声が流れます。シャドーイングは聞いてから自分で繰り返すだけです'),
        ],
      },
      {
        head: T('换声音、调速度', 'Voices and speed', '声と速さ'),
        steps: [
          T('下面「语音角色」可以选声音、点「试听」；想要更多声音点下载，每个约 250 MB，只下你点的那个', 'Pick a voice under Voice character and press Preview. More voices are about 250 MB each, downloaded only when you choose one', '「話者」で声を選び「試聴」。追加の声は 1 つ約 250 MB、選んだものだけ取得します'),
          T('朗读太快就把语速调到 0.8–0.9；显卡出问题或没声音时，关掉「用显卡合成」改用 CPU', 'Too fast? Set speed to 0.8–0.9. If audio fails, turn off GPU synthesis to use the CPU', '速すぎるときは速度 0.8–0.9。音が出ないときは GPU 合成をオフに'),
        ],
      },
    ],
  },
  dictionary: {
    title: T('查词和注音需要什么？', 'What lookups and furigana need', '辞書と読み仮名に必要なもの'),
    blocks: [
      {
        head: T('两样东西', 'Two pieces', '2 つの部品'),
        steps: [
          T('MOJi 联网查词：不用装，联网就能查', 'MOJi online lookup: nothing to install, works online', 'MOJi オンライン辞書：インストール不要'),
          T('注音分词词典：给汉字标假名、把句子切成词，约 190 MB，只需装一次。国内自动走国内镜像 {act:reading}', 'Reading dictionary: adds furigana and splits sentences into words, about 190 MB, installed once {act:reading}', '読み仮名・分かち書き辞書：約 190 MB、一度だけ導入 {act:reading}'),
        ],
      },
    ],
  },
  anki: {
    title: T('连上 Anki，生词自动做成卡片', 'Connect Anki to turn words into cards', 'Anki と連携して単語カードを作る'),
    blocks: [
      {
        head: T('4 步连上', '4 steps', '4 ステップ'),
        steps: [
          T('安装 Anki 电脑版并打开 {link:anki}', 'Install Anki for desktop and open it {link:anki}', 'Anki デスクトップ版を入れて起動 {link:anki}'),
          T('Anki 菜单「工具」→「插件」→「获取插件」，输入代码 2055492159，确定后重启 Anki {link:ankiconnect}', 'In Anki: Tools → Add-ons → Get Add-ons, enter 2055492159, then restart Anki {link:ankiconnect}', 'Anki の「ツール」→「アドオン」→「アドオンを取得」でコード 2055492159 を入力し再起動 {link:ankiconnect}'),
          T('保持 Anki 开着（MeguLit 也能在后台帮你打开它）', 'Keep Anki running (MeguLit can also start it in the background)', 'Anki は起動したままに（MeguLit がバックグラウンドで起動することもできます）'),
          T('点这里检查连接，显示「Anki 已连接」就好了 {act:ankiCheck}', 'Check the connection; it should say connected {act:ankiCheck}', '接続を確認 {act:ankiCheck}'),
        ],
      },
    ],
  },
  online: {
    title: T('联网功能说明', 'About the online features', 'オンライン機能について'),
    blocks: [
      {
        head: T('都连 MeguLit 自己的服务器，国内能用', 'All on MeguLit\'s own server, works in China', 'すべて MeguLit のサーバー経由'),
        steps: [
          T('排行榜：默认关闭。打开后只上传阅读时长、字数这些数字，不上传你读的内容；名字和头像可以随时改或删', 'Leaderboard: off by default. When on, only totals like reading time are uploaded, never what you read; name and avatar can be changed or removed any time', 'ランキング：初期状態はオフ。数字だけを送り、読んだ内容は送りません'),
          T('账号：用邮箱收验证码登录，不用密码；登录后可以开云端同步，换电脑接着用', 'Account: sign in with an email code, no password; then turn on cloud sync to continue on another PC', 'アカウント：メールのコードでログイン。クラウド同期で別の PC でも続きから'),
          T('共享适配：你调好的游戏设置会匿名分享给其他人，不含个人信息，不想分享可以关', 'Shared adaptation: your tuned game settings are shared anonymously, with no personal data; you can turn it off', '共有設定：調整したゲーム設定を匿名で共有。オフにもできます'),
          T('更多说明和下载见官网 {link:site}', 'More on the website {link:site}', '詳しくは公式サイトへ {link:site}'),
        ],
      },
    ],
  },
};

const STORE = 'megulit-guide-open';
function opened() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; } }
function remember(section, value) { try { const all = opened(); all[section] = value; localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* storage unavailable */ } }

export function guideSections() { return Object.keys(GUIDES); }
export function guideText(section, locale = 'zh') {
  const g = GUIDES[section]; if (!g) return '';
  const pick = v => v[locale] || v.zh;
  return [pick(g.title), ...(g.summary ? [pick(g.summary)] : []), ...g.blocks.flatMap(b => [pick(b.head), ...b.steps.map(pick)])].join('\n');
}

/* E426 Guides start folded as one short card under the real settings; opening animates the height (grid 0fr to 1fr) and each block is a step card with an icon. */
/* 2026-11-13 (user: the dictionary guide offered 「一键下载注音词典」 while the dictionary was already installed and the click
   faked a re-download). A download CTA reads the real install state: installed → a quiet ✓ 已就绪 mark, never a button. */
const READY = T('已就绪', 'Ready', '準備完了');
export function guideActionMarkup(id, { installed = {}, locale = 'zh', esc = s => String(s) } = {}) {
  const pick = v => v[locale] || v.zh;
  if (installed[id]) return `<span class="guide-chip guide-ready" data-guide-ready="${esc(id)}">${esc(pick(READY))}</span>`;
  return `<button type="button" class="guide-chip guide-act" data-guide-act="${esc(id)}">${esc(pick(ACTIONS[id] || T(id, id, id)))}</button>`;
}
export function mountGuide({ content, section, locale = 'zh', esc, api, toast, actions = {}, installed = {} }) {
  const g = GUIDES[section]; if (!g || !content) return () => {};
  const pick = v => v[locale] || v.zh;
  const step = text => esc(pick(text)).replace(/\{(link|act):([a-zA-Z]+)\}/g, (_, kind, id) => kind === 'link'
    ? `<button type="button" class="guide-chip" data-guide-link="${esc(id)}">${esc(pick(LINK_LABEL[id] || T(id, id, id)))} ↗</button>`
    : guideActionMarkup(id, { installed, locale, esc }));
  /* 2026-11-13 dictionary guide redesign: the words before the first colon become the item's bold term (presentation only) */
  const term = html => { if (section !== 'dictionary') return html; const i = html.indexOf('：'); return i > 0 && i < 24 && !html.slice(0, i).includes('<') ? `<b class="guide-term">${html.slice(0, i)}</b>${html.slice(i + 1)}` : html; };
  const card = document.createElement('section');
  card.className = 'panel settings-guide';
  card.dataset.guide = section;
  const open = !!opened()[section];
  card.classList.toggle('open', open);
  card.innerHTML = `<button type="button" class="guide-head" aria-expanded="${open}"><span class="guide-badge">${esc(pick(T('教程', 'Guide', 'ガイド')))}</span><span class="guide-title"><b>${esc(pick(g.title))}</b>${g.summary ? `<small>${esc(pick(g.summary))}</small>` : ''}</span><span class="guide-caret" aria-hidden="true">▾</span></button>`
    + `<div class="guide-body"><div class="guide-inner">${g.blocks.map((b, i) => `<div class="guide-block"><div class="guide-icon" aria-hidden="true">${esc(b.icon || String(i + 1))}</div><div class="guide-main"><h3>${esc(pick(b.head))}</h3><ol>${b.steps.map(s => `<li>${term(step(s))}</li>`).join('')}</ol></div></div>`).join('')}</div></div>`;
  const head = card.querySelector('.guide-head');
  head.addEventListener('click', () => { const next = !card.classList.contains('open'); card.classList.toggle('open', next); head.setAttribute('aria-expanded', String(next)); remember(section, next); });
  card.querySelectorAll('[data-guide-link]').forEach(button => button.addEventListener('click', () => {
    const url = LINKS[button.dataset.guideLink]; if (!url) return;
    api('open_source', { url }).catch(() => toast && toast(url));
  }));
  card.querySelectorAll('[data-guide-act]').forEach(button => button.addEventListener('click', async () => {
    const run = actions[button.dataset.guideAct]; if (!run) return;
    button.disabled = true;
    try { await run(button); } finally { button.disabled = false; }
  }));
  content.append(card);
  return () => card.remove();
}
