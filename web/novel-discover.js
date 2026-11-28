// SPDX-License-Identifier: GPL-3.0-or-later

const messages = {
  zh: {
    epubEncrypted:'该 EPUB 的正文已加密，无法导入。', epubPackage:'这个 EPUB 缺少可读取的书籍目录。', epubContent:'EPUB 中没有找到可读取的章节。', epubDamaged:'下载文件不是有效的 EPUB，或文件已损坏。',
    authWebsite:'登录或验证', authWaiting:'请在浏览器完成登录或验证。书目恢复后将自动返回。', loggedOut:'已清除该书源的登录会话', catalogUnavailable:'这个网址没有返回可用书目。可切到浏览器查看网站。',
    websiteTitle:'网页书源', websiteName:'名称（可选）', websiteUrl:'网站网址', websiteAdd:'添加网页书源', edit:'编辑', remove:'移除', cancel:'取消',
    websiteModes:{system:'跟随系统网络',direct:'直连',proxy:'使用已配置的代理'}, websiteOpen:'在浏览器打开', websiteGuide:'在打开的窗口浏览、登录或完成人机验证。下载的 EPUB 和 PDF 会自动加入书架。',
    websiteBrowser:'需要安装 Edge 或 Chrome 才能打开网页书源。', websiteBusy:'正在导入图书…', websiteDownloading:'正在下载…', websiteDone:'已加入书架', websiteFailed:'有文件导入失败，可重新下载后重试。',
    alternate:'备用图书源网站', connection:'连接方式', connections:{auto:'自动（直连优先）',direct:'仅直连',proxy:'仅代理'},
    providers:{auto:'自动选择', 'book-site':'自定义图书源', bangumi:'Bangumi', openlibrary:'Open Library'}, provider:'图书来源', catalogOnly:'可到原站查看阅读或借阅选项。', accountSite:'登录网站',
    siteBrowser:'此网站要求浏览器验证，或当前地址未提供应用可用的书目接口。', fallback:'自定义书源暂不可用，已切换到备用目录。',
    heading: '发现', order: { match: '相关度', popular: '热门', date: '最新收录', year: '出版年份' },
    search: '搜索书名、作者或 ISBN', loading: '正在读取书源…', empty: '没有找到图书', retry: '重试',
    alias: title => '日文原名 · ' + title, original: '日文', open: '打开书页', source: '打开网站',
    local: '导入已下载文件', import: '下载并导入', added: '已加入书架', viewBook: '在书架中查看',
    duplicate: '已在书架', back: '上一页', next: '下一页', settings: '书源设置',
    unconfigured: '请先在书源设置中填写图书源网站。', lightNovels: '日文轻小说', site: '图书源网站', proxy: 'HTTP 代理（可选）', save: '保存书源', saved: '书源已保存',
    signIn: '登录书源', signOut: '退出登录', email: '邮箱', password: '密码',
    signedIn: '登录已验证', signedOut: '登录后可直接下载并导入 PDF 或 EPUB',
    check: '检查登录', verifying: '正在验证书源登录…', expired: '登录已失效，请重新登录',
    unverified: '本次无法验证登录，请检查网络后重试', quota: (used, limit) => `今日下载 ${used} / ${limit}`,
    invalidOrigin: '请输入有效的 HTTPS 网站地址',
    invalidProxy: '请输入有效的 HTTP 或 HTTPS 代理地址',
    unavailable: '无法连接书源，请检查书源地址或网络设置',
    auth: '书源要求重新登录。也可在浏览器打开书页后导入已下载文件。',
    loginFailed: '登录失败，请检查账号和密码，或在浏览器登录该站点。',
    loginBrowser: '站点要求浏览器验证，可打开网站完成验证。',
    limit: '书源暂未提供下载链接，请检查账号额度或打开书页查看',
    rate: '书源请求过于频繁，请稍后再试',
    large: '文件太大，无法导入',
    importError: '导入失败，请打开书页下载文件后再导入',
    backToDiscover: '返回发现', detailUnavailable: '暂时无法读取完整资料', synopsis: '内容简介',
    pages: count => `${count} 页`, unsupported: '应用内导入支持 PDF 和 EPUB，可到原站查看此格式。',
    downloadLabel: '下载进度', importLabel: '导入进度', resolving: '正在获取下载链接…',
    downloadSteps: ['正在读取文件', '正在解析图书', '正在写入书架'],
    ready: '等待下载', finished: '下载完成', downloading: '正在下载',
    webRequired: '此书需要在浏览器完成站点验证或下载。可打开原书页后导入文件。',
    transferError: '下载连接中断或文件未传完，可以重试。',
    noLink: '书源没有返回可用的下载链接，可打开原书页查看。',
  },
  ja: {
    epubEncrypted:'暗号化された EPUB 本文は取り込めません。', epubPackage:'EPUB の書籍情報を読み込めません。', epubContent:'EPUB に読み込める章がありません。', epubDamaged:'有効な EPUB ファイルを取得できませんでした。',
    authWebsite:'ログイン・認証', authWaiting:'ブラウザーでログインまたは認証してください。カタログに接続できると自動的に戻ります。', loggedOut:'このソースのログイン情報を削除しました', catalogUnavailable:'この URL ではカタログを取得できません。ブラウザーでサイトを開いてください。',
    websiteTitle:'ウェブ書籍ソース', websiteName:'名前（任意）', websiteUrl:'サイトの URL', websiteAdd:'ウェブソースを追加', edit:'編集', remove:'削除', cancel:'キャンセル',
    websiteModes:{system:'システムの接続設定に従う',direct:'直接接続',proxy:'設定済みプロキシを使用'}, websiteOpen:'ブラウザーで開く', websiteGuide:'開いたウィンドウで閲覧、ログイン、認証ができます。ダウンロードした EPUB と PDF は本棚に追加されます。',
    websiteBrowser:'ウェブソースを開くには Edge または Chrome が必要です。', websiteBusy:'書籍を追加しています…', websiteDownloading:'ダウンロード中…', websiteDone:'本棚に追加しました', websiteFailed:'追加できないファイルがあります。再度ダウンロードしてください。',
    alternate:'予備の書籍サイト', connection:'接続方法', connections:{auto:'自動（直接接続を優先）',direct:'直接接続のみ',proxy:'プロキシのみ'},
    providers:{auto:'自動選択', 'book-site':'カスタム書籍サイト', bangumi:'Bangumi', openlibrary:'Open Library'}, provider:'書籍ソース', catalogOnly:'閲覧や貸出については元のサイトをご確認ください。', accountSite:'ログイン先',
    siteBrowser:'ブラウザーでの認証が必要か、このサイトに対応する検索 API がありません。', fallback:'カスタム書籍ソースに接続できないため、予備のカタログを表示しています。',
    heading: '発見', order: { match: '関連度', popular: '人気順', date: '新着順', year: '出版年順' },
    search: '書名・著者・ISBN を検索', loading: '書籍ソースを読み込んでいます…', empty: '本が見つかりません', retry: '再試行',
    alias: title => '日本語原題 · ' + title, original: '日本語', open: '書籍ページ', source: 'サイトを開く',
    local: 'ダウンロード済みファイルを追加', import: 'ダウンロードして追加', added: '本棚に追加しました', viewBook: '本棚で開く',
    duplicate: '本棚にあります', back: '前へ', next: '次へ', settings: '書籍ソース設定',
    unconfigured: '書籍ソース設定でサイトを入力してください。', lightNovels: '日本語のライトノベル', site: '書籍ソースのサイト', proxy: 'HTTP プロキシ（任意）', save: '保存', saved: '設定を保存しました',
    signIn: '書籍ソースにログイン', signOut: 'ログアウト', email: 'メールアドレス', password: 'パスワード',
    signedIn: 'ログインを確認しました', signedOut: 'ログインすると PDF と EPUB を直接追加できます',
    check: 'ログイン状態を確認', verifying: '書籍ソースのログイン状態を確認しています…', expired: 'セッションが切れました。再度ログインしてください',
    unverified: 'ログイン状態を確認できませんでした。ネットワークを確認してください', quota: (used, limit) => `今日のダウンロード ${used} / ${limit}`,
    invalidOrigin: '有効な HTTPS のサイトアドレスを入力してください',
    invalidProxy: '有効な HTTP または HTTPS のプロキシを入力してください',
    unavailable: '書籍ソースに接続できません。サイトとネットワーク設定を確認してください',
    auth: '書籍ソースにログインしてください。ブラウザーでダウンロードしてから追加することもできます。',
    loginFailed: 'ログインできません。認証情報を確認するか、ブラウザーでお試しください。',
    loginBrowser: 'サイトでブラウザー認証が必要です。',
    limit: 'ダウンロードできません。アカウントの上限または書籍ページを確認してください',
    rate: 'アクセスが集中しています。しばらくしてからお試しください',
    large: 'ファイルが大きすぎます', importError: '追加できません。書籍ページでダウンロードして再度お試しください',
    backToDiscover: '発見に戻る', detailUnavailable: '詳細情報を取得できません', synopsis: 'あらすじ',
    pages: count => `${count} ページ`, unsupported: 'アプリでは PDF と EPUB を追加できます。この形式はサイトで確認してください。',
    downloadLabel: 'ダウンロード状況', importLabel: '追加状況', resolving: 'ダウンロードリンクを取得しています…',
    downloadSteps: ['ファイルを読み込んでいます', '書籍を解析しています', '本棚に保存しています'],
    ready: 'ダウンロード待ち', finished: 'ダウンロード完了', downloading: 'ダウンロード中',
    webRequired: 'この書籍はブラウザーで認証またはダウンロードしてください。保存後に追加できます。',
    transferError: '接続が切れたか、ファイルの転送が完了しませんでした。再試行できます。',
    noLink: 'ダウンロードリンクがありません。書籍ページを確認してください。',
  },
  en: {
    epubEncrypted:'The EPUB has encrypted text.', epubPackage:'The EPUB is missing a readable package document.', epubContent:'No readable chapters were found in the EPUB.', epubDamaged:'The downloaded file is not a valid EPUB or is damaged.',
    authWebsite:'Sign in or verify', authWaiting:'Finish signing in or verifying in the browser. The catalog will resume automatically when available.', loggedOut:'This source’s sign-in session was cleared', catalogUnavailable:'This address returned no compatible catalog. Open the website in the browser.',
    websiteTitle:'Website sources', websiteName:'Name (optional)', websiteUrl:'Website URL', websiteAdd:'Add website source', edit:'Edit', remove:'Remove', cancel:'Cancel',
    websiteModes:{system:'Use system network settings',direct:'Direct',proxy:'Use configured proxy'}, websiteOpen:'Open in browser', websiteGuide:'Browse, sign in, or complete verification in the browser window. Downloaded EPUB and PDF files are added to your shelf.',
    websiteBrowser:'Install Edge or Chrome to open website sources.', websiteBusy:'Importing your book…', websiteDownloading:'Downloading…', websiteDone:'Added to your shelf', websiteFailed:'Some files could not be imported. Download them again and retry.',
    alternate:'Backup book source website', connection:'Connection', connections:{auto:'Auto (direct first)',direct:'Direct only',proxy:'Proxy only'},
    providers:{auto:'Automatic', 'book-site':'Custom book source', bangumi:'Bangumi', openlibrary:'Open Library'}, provider:'Book provider', catalogOnly:'Open the original site for reading or borrowing options.', accountSite:'Sign-in website',
    siteBrowser:'This site requires browser verification or does not provide a compatible catalog API.', fallback:'The custom source is unavailable. Showing a backup catalog.',
    heading: 'Discover', order: { match: 'Relevance', popular: 'Popular', date: 'Recently added', year: 'Publication year' },
    search: 'Search title, author or ISBN', loading: 'Loading the book source…', empty: 'No books found', retry: 'Retry',
    alias: title => 'Japanese title · ' + title, original: 'Japanese', open: 'Book page', source: 'Open website',
    local: 'Import a downloaded file', import: 'Download and import', added: 'Added to your shelf', viewBook: 'View on shelf',
    duplicate: 'Already on your shelf', back: 'Previous', next: 'Next', settings: 'Book source settings',
    unconfigured: 'Enter a website in Book source settings to get started.', lightNovels: 'Japanese light novels', site: 'Book source website', proxy: 'HTTP proxy (optional)', save: 'Save source', saved: 'Source saved',
    signIn: 'Sign in to the book source', signOut: 'Sign out', email: 'Email', password: 'Password',
    signedIn: 'Sign-in verified', signedOut: 'Sign in to download and import PDFs or EPUBs directly',
    check: 'Check sign-in', verifying: 'Verifying sign-in with the book source…', expired: 'Session expired. Sign in again.',
    unverified: 'Could not verify sign-in. Check your connection and try again.', quota: (used, limit) => `Downloads today ${used} / ${limit}`,
    invalidOrigin: 'Enter a valid HTTPS website address',
    invalidProxy: 'Enter a valid HTTP or HTTPS proxy address',
    unavailable: 'Could not reach the book source. Check the source and network settings.',
    auth: 'The book source requires sign-in. You can also download the file in your browser and import it.',
    loginFailed: 'Could not sign in. Check your credentials or try signing in through your browser.',
    loginBrowser: 'The site requires browser verification. Open the site to continue.',
    limit: 'The book source did not provide a download link. Check your account quota or open the book page.',
    rate: 'Too many requests. Try again in a moment.',
    large: 'This file is too large to import',
    importError: 'Import failed. Download the file from the book page and try importing it again.',
    backToDiscover: 'Back to Discover', detailUnavailable: 'Full book details are unavailable', synopsis: 'Description',
    pages: count => `${count} pages`, unsupported: 'The app can import PDF and EPUB. Open the book page for this format.',
    downloadLabel: 'Download progress', importLabel: 'Import progress', resolving: 'Getting the download link…',
    downloadSteps: ['Reading the file', 'Parsing the book', 'Saving to your shelf'],
    ready: 'Waiting for download', finished: 'Download complete', downloading: 'Downloading',
    webRequired: 'This book requires browser verification or download. Open the book page, then import the file.',
    transferError: 'The connection dropped or the transfer was incomplete. You can retry.',
    noLink: 'The source returned no usable download link. Open the book page to check.',
  },
};

export const discoverMessages = locale => messages[locale] || messages.zh;

function errorText(w, code, fallback) {
  return ({
    NOVEL_EPUB_ENCRYPTED: w.epubEncrypted, NOVEL_EPUB_PACKAGE: w.epubPackage, NOVEL_EPUB_CONTENT: w.epubContent, NOVEL_EPUB_DAMAGED: w.epubDamaged,
    NOVEL_WEBSITE_BROWSER_MISSING: w.websiteBrowser, NOVEL_WEBSITE_CATALOG_UNAVAILABLE: w.catalogUnavailable,
    BOOK_SITE_UNCONFIGURED: w.unconfigured, BOOK_SITE_INVALID_ORIGIN: w.invalidOrigin, BOOK_SITE_INVALID_PROXY: w.invalidProxy, BOOK_SITE_AUTH: w.auth,
    BOOK_SITE_DOWNLOAD_LINK: w.noLink, BOOK_SITE_DOWNLOAD_LIMIT: w.limit, BOOK_SITE_RATE_LIMIT: w.rate, NOVEL_FILE_TOO_LARGE: w.large,
    BOOK_SITE_WEB_REQUIRED: w.webRequired, BOOK_SITE_FILE_NETWORK: w.transferError, BOOK_SITE_FILE_HOST: w.noLink,
    BOOK_SITE_WRONG_LOGIN: w.loginFailed, BOOK_SITE_VERIFY_FAILED: w.unverified, NOVEL_UNSUPPORTED: w.unsupported,
  })[code] || fallback;
}

export function paintDiscovery(host, { state, result, api, esc, w, toast, onPage, onLocal, onSettings, onBook, onProvider, onImported, onRead, onRefresh, signal }) {
  const books = result?.books || [];
  const website = result?.website;
  const providers = [...Object.entries(w.providers), ...(state.websites || []).map(site => ['website-' + site.id, site.name])];
  host.innerHTML = `<header class="nv-discover-head">
    <div><h2>${esc(w.heading)}</h2>${website ? '<p>' + esc(website.name) + '</p>' : result?.alias ? '<p>' + esc(w.alias(result.alias)) + '</p>' : result?.provider ? '<p>' + esc(w.providers[result.provider]) + '</p>' : ''}</div>
    <div class="nv-discover-links">
      <select data-source-provider aria-label="${esc(w.provider)}">${providers.map(([key, label]) => `<option value="${key}" ${state.source === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
      ${website ? `<button type="button" class="nv-primary" data-website-open>${esc(w.websiteOpen)}</button>` : ''}
      ${result?.url ? `<button type="button" class="nv-ghost" data-source-site>${esc(w.source)}</button>` : ''}
      <button type="button" class="nv-ghost" data-source-local>${esc(w.local)}</button>
      ${onSettings ? `<button type="button" class="nv-ghost" data-source-settings>${esc(w.settings)}</button>` : ''}
    </div>
  </header>
  ${result?.fallbackError ? `<p class="nv-discover-status" role="status">${esc(w.fallback)}</p>` : ''}
  ${!result ? `<p class="nv-discover-status" role="status">${esc(w.loading)}</p>` : ''}
  ${result?.error ? `<div class="nv-discover-status"><p role="status">${esc(result.auth ? w.authWaiting : result.error === 'BOOK_SITE_WEB_REQUIRED' ? w.siteBrowser : errorText(w, result.error, w.unavailable))}</p>
    ${result.error !== 'BOOK_SITE_UNCONFIGURED' ? `<button type="button" class="nv-ghost" data-source-page="${state.page}">${esc(w.retry)}</button>` : ''}</div>` : ''}
  ${website ? `<section class="nv-discover-status">${!result.adapter && !result.auth ? '<p>' + esc(w.websiteGuide) + '</p>' : ''}
    <p data-website-status role="status"></p><button type="button" class="nv-ghost" data-website-book hidden>${esc(w.viewBook)}</button></section>` : ''}
  ${result && !result.error && !books.length ? `<p class="nv-discover-status" role="status">${esc(w.empty)}</p>` : ''}
  <div class="nv-discover-grid">${books.map((book, i) => `<article class="nv-discover-book">
    <button type="button" class="nv-discover-cover" data-source-open="${i}" aria-label="${esc(book.title)}" title="${esc(book.title)}">
      ${book.cover && !result?.proxiedCovers ? `<img src="${esc(book.cover)}" referrerpolicy="no-referrer" loading="lazy" alt="">` : ''}
      <span aria-hidden="true">${esc(book.title)}</span>
    </button>
    <h3><button type="button" data-source-entry="${i}" title="${esc(book.title)}">${esc(book.title)}</button></h3>
    ${book.author ? `<p>${esc(book.author)}</p>` : ''}
    <p>${esc([book.japanese ? w.original : book.language, book.year, (book.extension || '').toUpperCase(), book.size].filter(Boolean).join(' · '))}</p>
  </article>`).join('')}</div>
  ${result && (state.page > 1 || result.more) && !result.error ? `<nav class="nv-discover-pagination">
    <button type="button" class="nv-ghost" data-source-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>${esc(w.back)}</button>
    <span>${state.page}</span>
    <button type="button" class="nv-ghost" data-source-page="${state.page + 1}" ${!result.more ? 'disabled' : ''}>${esc(w.next)}</button>
  </nav>` : ''}`;
  host.querySelector('[data-source-provider]').onchange = event => onProvider?.(event.target.value);
  if (website) bindWebsiteDiscovery(host, { website, api, w, toast, onImported, onRead, onRefresh, signal, reason: result.auth, authUrl: result.authUrl, state });
  const site = url => api(result?.catalog ? 'open_source' : 'novel_source_open', { url }).catch(() => toast(w.unavailable));
  host.querySelector('[data-source-site]')?.addEventListener('click', () => site(result.url));
  host.querySelector('[data-source-local]').onclick = onLocal;
  host.querySelector('[data-source-settings]')?.addEventListener('click', onSettings);
  host.querySelectorAll('[data-source-page]').forEach(button => {
    button.onclick = () => onPage(Number(button.dataset.sourcePage));
  });
  const covers = result?.proxiedCovers ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const button = entry.target;
      covers.unobserve(button);
      const { cover, id } = books[Number(button.dataset.sourceOpen)];
      if (!cover) continue;
      const picture = website ? websiteRequest(api, website, 'cover', { bookId: id }) : api('novel_source_cover', { url: cover, source: result.provider, origin: result.host });
      picture.then(({ data }) => {
        if (signal?.aborted || !button.isConnected || !/^data:image\/(?:jpeg|png|webp|gif);base64,/.test(data)) return;
        const image = new Image();
        image.alt = '';
        image.src = data;
        image.decode().then(() => { if (!signal?.aborted && button.isConnected) button.prepend(image); }).catch(() => {});
      }).catch(() => {});
    }
  }) : null;
  signal?.addEventListener('abort', () => covers?.disconnect(), { once: true });
  host.querySelectorAll('[data-source-open]').forEach(button => {
    button.onclick = () => onBook(books[Number(button.dataset.sourceOpen)], button.querySelector('img')?.src, Number(button.dataset.sourceOpen));
    covers?.observe(button);
    const image = button.querySelector('img');
    image?.addEventListener('error', () => image.remove(), { once: true });
    if (image?.complete && !image.naturalWidth) image.remove();
  });
  host.querySelectorAll('[data-source-entry]').forEach(button => {
    button.onclick = () => host.querySelector(`[data-source-open="${Number(button.dataset.sourceEntry)}"]`).click();
  });
}

export function novelImportError(locale, code) {
  return errorText(discoverMessages(locale), code, code);
}

const activePhases = new Set(['resolving', 'downloading', 'importing']);

export function paintDiscoveryDetail(host, { selection, api, esc, w, locale, signal, backButton, onBack, onLocal, onSettings, onImported, onRead }) {
  const { origin, catalog, provider, website, book: initialBook, preview, proxiedCovers } = selection;
  const ref = { origin, id: initialBook.id, hash: initialBook.hash };
  let book = initialBook;
  let currentTask = { phase: 'idle' };
  let pollVersion = 0;
  let notified = '';
  host.innerHTML = `<article class="nv-detail nv-source-detail">
    ${backButton(w.backToDiscover)}
    <div class="nv-source-detail-hero">
      <div class="nv-discover-cover" data-source-art><span aria-hidden="true">${esc(book.title)}</span></div>
      <div class="nv-detail-meta">
        <h2 data-source-title></h2>
        <p class="nv-detail-author" data-source-author></p>
        <p class="nv-detail-facts" data-source-facts></p>
        <div class="nv-detail-actions">
          <button type="button" class="nv-primary" data-source-download>${esc(w.import)}</button>
          <button type="button" class="nv-ghost" data-source-original>${esc(w.open)}</button>
          <button type="button" class="nv-ghost" data-source-file>${esc(w.local)}</button>
          ${onSettings ? `<button type="button" class="nv-ghost" data-source-account-settings>${esc(w.settings)}</button>` : ''}
        </div>
        <p data-source-details-note role="status"></p>
        <section class="nv-source-progress" data-source-progress hidden>
          <div class="nv-source-progress-row">
            <label for="nv-source-download-progress">${esc(w.downloadLabel)}</label>
            <progress id="nv-source-download-progress" max="1" value="0"></progress>
            <small data-source-download-status></small>
          </div>
          <div class="nv-source-progress-row">
            <label for="nv-source-import-progress">${esc(w.importLabel)}</label>
            <progress id="nv-source-import-progress" max="3" value="0"></progress>
            <small data-source-import-status></small>
          </div>
          <p data-source-status role="status"></p>
        </section>
      </div>
    </div>
    <section class="nv-source-description" data-source-description hidden>
      <h3>${esc(w.synopsis)}</h3><p></p>
    </section>
  </article>`;
  const select = selector => host.querySelector(selector);
  const art = select('[data-source-art]');
  const download = select('[data-source-download]');
  const detailsNote = select('[data-source-details-note]');
  const transferBar = select('#nv-source-download-progress');
  const importBar = select('#nv-source-import-progress');
  const safeImage = /^data:image\/(?:jpeg|png|webp|gif);base64,|^https:\/\//i;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const size = bytes => bytes >= 1024 * 1024 ? number.format(bytes / (1024 * 1024)) + ' MB'
    : number.format(bytes / 1024) + ' KB';
  const supportsImport = () => book.downloadable && ['pdf', 'epub'].includes(book.extension);

  async function loadPicture(source) {
    if (!source) return;
    try {
      const url = !source.startsWith('data:') && website ? (await websiteRequest(api, website, 'cover', { bookId: book.id })).data
        : proxiedCovers && !source.startsWith('data:') ? (await api('novel_source_cover', { url: source, source: provider, origin })).data : source;
      if (signal.aborted || !safeImage.test(url)) return;
      const image = new Image();
      image.referrerPolicy = 'no-referrer';
      image.alt = '';
      image.src = url;
      await image.decode();
      if (!signal.aborted) art.querySelector('img')?.remove();
      if (!signal.aborted) art.prepend(image);
    } catch { /* The title is visible while no preview is available. */ }
  }

  function showMetadata() {
    select('[data-source-title]').textContent = book.title;
    select('[data-source-author]').textContent = book.author || '';
    select('[data-source-facts]').textContent = [book.japanese ? w.original : book.language, book.publisher, book.year,
      book.extension?.toUpperCase(), book.size, book.pages ? w.pages(book.pages) : '', book.isbn].filter(Boolean).join(' · ');
    const description = select('[data-source-description]');
    description.hidden = !book.description;
    description.querySelector('p').textContent = book.description || '';
    drawProgress(currentTask);
  }

  function drawProgress(task) {
    currentTask = task;
    const busy = activePhases.has(task.phase);
    const done = task.phase === 'done';
    const failed = task.phase === 'failed';
    const step = ['read', 'parse', 'save'].indexOf(task.step);
    const transferred = done || step >= 0;
    const fraction = transferred ? 1 : task.total > 0 ? Math.min(1, task.received / task.total) : 0;
    download.disabled = busy;
    download.hidden = !supportsImport() && !done;
    download.textContent = done ? w.viewBook : failed ? w.retry : w.import;
    select('[data-source-progress]').hidden = task.phase === 'idle';
    if (busy && !task.total && !transferred) transferBar.removeAttribute('value');
    else transferBar.value = fraction;
    importBar.value = done ? 3 : Math.max(0, step);
    const transferText = task.phase === 'resolving' ? w.resolving
      : task.total > 0 ? `${Math.round(fraction * 100)}% · ${size(task.received)} / ${size(task.total)}`
      : task.received > 0 ? size(task.received) : busy ? w.downloading : w.ready;
    select('[data-source-download-status]').textContent = transferred ? w.finished + ' · ' + size(task.received) : transferText;
    select('[data-source-import-status]').textContent = done ? (task.duplicate ? w.duplicate : w.added)
      : step >= 0 ? `${step + 1}/3 · ${w.downloadSteps[step]}` : w.ready;
    select('[data-source-status]').textContent = failed ? errorText(w, task.error, w.importError) : '';
    if (done && task.bookId !== notified) {
      notified = task.bookId;
      onImported();
    }
  }

  async function follow(version, firstTask) {
    try {
      let task = firstTask || await api('novel_source_download_status', ref);
      while (!signal.aborted && version === pollVersion) {
        drawProgress(task);
        if (!activePhases.has(task.phase)) return;
        await new Promise(resolve => setTimeout(resolve, 350));
        if (signal.aborted || version !== pollVersion) return;
        task = await api('novel_source_download_status', ref);
      }
    } catch (error) {
      if (!signal.aborted && version === pollVersion) drawProgress({ ...currentTask, phase: 'failed', error: error.message });
    }
  }

  select('[data-nv-back]').onclick = onBack;
  select('[data-source-original]').onclick = () => (website ? websiteRequest(api, website, 'open', { bookId: book.id })
    : api(catalog ? 'open_source' : 'novel_source_open', { url: book.url }))
    .catch(() => { if (!signal.aborted) detailsNote.textContent = w.unavailable; });
  select('[data-source-file]').onclick = onLocal;
  select('[data-source-account-settings]')?.addEventListener('click', onSettings);
  download.onclick = async () => {
    if (currentTask.phase === 'done') { onRead(currentTask.bookId); return; }
    const version = ++pollVersion;
    drawProgress({ phase: 'resolving', received: 0, total: 0 });
    try {
      if (website) {
        const previous = await websiteRequest(api, website, 'status');
        let result = await websiteRequest(api, website, 'download', { bookId: book.id });
        if (result.auth) {
          detailsNote.textContent = w.authWaiting;
          if (!await waitWebsiteAuth(api, website, result.auth, { bookId: book.id, authUrl: result.authUrl }, signal)) throw Error('BOOK_SITE_AUTH');
          detailsNote.textContent = '';
          result = await websiteRequest(api, website, 'download', { bookId: book.id });
          if (result.auth) throw Error('BOOK_SITE_AUTH');
        }
        drawProgress({ phase: 'downloading' });
        for (let i = 0; !signal.aborted && i < 200; i++) {
          const status = await websiteRequest(api, website, 'status');
          if (status.last?.at && status.last.at !== previous.last?.at) {
            drawProgress({ phase: 'done', bookId: status.last.bookId });
            return;
          }
          if (status.failed > previous.failed) throw Error('NOVEL_PARSE_FAILED');
          if (status.importing) drawProgress({ phase: 'importing', step: 'read' });
          await new Promise(resolve => setTimeout(resolve, 1300));
        }
        if (!signal.aborted) throw Error('BOOK_SITE_FILE_NETWORK');
        return;
      }
      const task = await api('novel_source_download_start', { ...ref, title: book.title, extension: book.extension });
      if (!signal.aborted && version === pollVersion) await follow(version, task);
    } catch (error) {
      if (!signal.aborted && version === pollVersion) drawProgress({ phase: 'failed', error: error.message });
    }
  };

  showMetadata();
  select('[data-nv-back]').focus({ preventScroll: true });
  loadPicture(preview || book.cover);
  if (!book.downloadable) {
    download.hidden = true;
    detailsNote.textContent = catalog ? w.catalogOnly : w.unsupported;
    return;
  }
  if (website) return;
  follow(pollVersion);
  api('novel_source_detail', ref).then(details => {
    if (signal.aborted) return;
    const changedCover = details.cover && details.cover !== book.cover;
    book = { ...book, ...details };
    showMetadata();
    detailsNote.textContent = supportsImport() ? '' : w.unsupported;
    if (changedCover) loadPicture(book.cover);
  }).catch(() => { if (!signal.aborted) detailsNote.textContent = w.detailUnavailable; });
}


const websiteRequest = (api, site, operation, extra) => api('novel_website_sources', { operation, id: site.id, ...extra });

async function waitWebsiteAuth(api, site, reason, state, signal) {
  await websiteRequest(api, site, 'authenticate', { reason, authUrl: state?.authUrl, bookId: state?.bookId, query: state?.query, order: state?.order, page: state?.page });
  while (!signal.aborted) {
    const { authStatus } = await websiteRequest(api, site, 'authStatus');
    if (authStatus === 'ready') return true;
    if (authStatus !== 'pending') return false;
    await new Promise(resolve => setTimeout(resolve, 850));
  }
  return false;
}

function bindWebsiteDiscovery(host, { website, api, w, toast, onImported, onRead, onRefresh, signal, reason, authUrl, state }) {
  const open = host.querySelector('[data-website-open]');
  const status = host.querySelector('[data-website-status]');
  const book = host.querySelector('[data-website-book]');
  let timer;
  let last;
  const request = operation => api('novel_website_sources', { operation, id: website.id });

  async function refresh() {
    if (signal.aborted) return;
    try {
      const result = await request('status');
      if (signal.aborted) return;
      status.textContent = result.importing ? w.websiteBusy : result.downloading ? w.websiteDownloading
        : result.failed ? w.websiteFailed : result.last ? w.websiteDone : '';
      if (result.last?.at !== last?.at) {
        last = result.last;
        if (last) onImported?.();
      }
      book.hidden = !last;
      book.onclick = () => { if (last) onRead?.(last.bookId); };
      timer = setTimeout(refresh, 1700);
    } catch (error) {
      if (!signal.aborted) status.textContent = errorText(w, error.message, w.unavailable);
    }
  }

  open.onclick = async () => {
    open.disabled = true;
    try {
      if (reason) {
        status.textContent = w.authWaiting;
        if (await waitWebsiteAuth(api, website, reason, { ...state, authUrl }, signal)) onRefresh?.();
      } else await request('open');
    }
    catch (error) { toast(errorText(w, error.message, w.unavailable)); }
    finally { if (!signal.aborted) open.disabled = false; }
  };
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  if (reason) void open.onclick();
  else void refresh();
}

async function mountWebsiteSettings(host, { api, esc, w, toast }) {
  host.innerHTML = `<h3 class="settings-section-title">${esc(w.websiteTitle)}</h3>
    <form class="panel" data-website-form>
      <label class="settings-row"><span class="settings-label">${esc(w.websiteName)}</span><input name="name" maxlength="60"></label>
      <label class="settings-row"><span class="settings-label">${esc(w.websiteUrl)}</span><input name="url" type="url" autocomplete="off" spellcheck="false" required></label>
      <label class="settings-row"><span class="settings-label">${esc(w.connection)}</span><select name="mode">
        ${Object.entries(w.websiteModes).map(([value,label]) => `<option value="${value}">${esc(label)}</option>`).join('')}
      </select></label>
      <button type="submit" class="secondary">${esc(w.websiteAdd)}</button>
      <button type="button" class="secondary" data-website-cancel hidden>${esc(w.cancel)}</button>
      <div data-website-list></div>
    </form>`;
  const form = host.querySelector('[data-website-form]');
  const list = host.querySelector('[data-website-list]');
  const submit = form.querySelector('[type=submit]');
  const cancel = form.querySelector('[data-website-cancel]');
  const request = (operation, fields) => api('novel_website_sources', { operation, ...fields });
  let sites = [];
  let editing = null;
  let pending = false;

  function select(site) {
    editing = site?.id || null;
    form.elements.name.value = site?.name || '';
    form.elements.url.value = site?.url || '';
    form.elements.mode.value = site?.mode || 'system';
    submit.textContent = editing ? w.save : w.websiteAdd;
    cancel.hidden = !editing;
  }

  function render() {
    list.innerHTML = sites.map(site => `<details class="nv-website-settings-row"><summary title="${esc(site.url)}">${esc(site.name)}</summary><div class="settings-row"><span class="settings-label">${esc(w.websiteModes[site.mode] || w.websiteModes.system)}</span><div>
      ${[['authenticate',w.authWebsite],['logout',w.signOut],['open',w.websiteOpen],['edit',w.edit],['remove',w.remove]].map(([action,label]) => `<button type="button" class="secondary" data-website-action="${action}" data-id="${esc(site.id)}">${esc(label)}</button>`).join('')}
    </div></div></details>`).join('');
  }

  async function run(operation, fields) {
    if (pending) return;
    pending = true;
    try {
      const result = await request(operation, fields);
      if (!host.isConnected) return;
      if (result.sites) {
        sites = result.sites;
        render();
      }
      if (operation === 'save') { select(null); toast(w.saved); }
      if (operation === 'logout') toast(w.loggedOut);
      if (operation === 'remove' && editing === fields.id) select(null);
    } catch (error) {
      if (host.isConnected) toast(errorText(w, error.message, w.unavailable));
    } finally { pending = false; }
  }

  form.onsubmit = event => {
    event.preventDefault();
    void run('save', { ...Object.fromEntries(new FormData(form)), id: editing });
  };
  cancel.onclick = () => select(null);
  list.onclick = event => {
    const button = event.target.closest('[data-website-action]');
    if (!button) return;
    const site = sites.find(item => item.id === button.dataset.id);
    if (!site) return;
    const action = button.dataset.websiteAction;
    if (action === 'edit') { select(site); form.elements.url.focus(); }
    else void run(action, { id: site.id });
  };
  await run('list');
}

export async function mountNovelSourceSettings(host, { api, locale, esc, toast }) {
  const w = discoverMessages(locale);
  host.innerHTML = `<h2 class="settings-section-title">${esc(w.settings)}</h2>
    <form class="panel" data-source-config>
      <label class="settings-row"><span class="settings-label">${esc(w.site)}</span>
        <input name="origin" type="url" autocomplete="off" spellcheck="false"></label>
      <label class="settings-row"><span class="settings-label">${esc(w.alternate)}</span>
        <input name="alternate" type="url" autocomplete="off" spellcheck="false"></label>
      <label class="settings-row"><span class="settings-label">${esc(w.connection)}</span>
        <select name="connection">${Object.entries(w.connections).map(([value,label]) => `<option value="${value}">${esc(label)}</option>`).join('')}</select></label>
      <label class="settings-row"><span class="settings-label">${esc(w.proxy)}</span>
        <input name="proxy" type="url" autocomplete="off" spellcheck="false" placeholder="http://127.0.0.1:7890"></label>
      <button type="submit" class="secondary">${esc(w.save)}</button>
    </form>
    <section data-website-settings></section>
    <form class="panel" data-source-account hidden>
      <p data-account-status role="status"></p>
      <label class="settings-row"><span class="settings-label">${esc(w.accountSite)}</span><select name="accountOrigin"></select></label>
      <label class="settings-row"><span class="settings-label">${esc(w.email)}</span>
        <input name="email" type="email" autocomplete="username" required></label>
      <label class="settings-row"><span class="settings-label">${esc(w.password)}</span>
        <input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit" class="secondary">${esc(w.signIn)}</button>
      <button type="button" class="secondary" data-account-check hidden>${esc(w.check)}</button>
      <button type="button" class="secondary" data-account-logout hidden>${esc(w.signOut)}</button>
      <button type="button" class="secondary" data-account-site>${esc(w.source)}</button>
    </form>`;
  const settings = host.querySelector('[data-source-config]');
  const account = host.querySelector('[data-source-account]');
  const heading = host.querySelector('[data-account-status]');
  const check = host.querySelector('[data-account-check]');
  const signOut = host.querySelector('[data-account-logout]');
  let current;
  let pending = false;
  const update = state => {
    current = state;
    settings.elements.origin.value = state.origin;
    settings.elements.proxy.value = state.proxy;
    settings.elements.alternate.value = state.alternate || '';
    settings.elements.connection.value = state.connection || 'auto';
    const origins = [...new Set([state.origin, state.alternate].filter(Boolean))];
    account.elements.accountOrigin.replaceChildren(...origins.map(url => new Option(new URL(url).hostname, url)));
    if (state.accountOrigin) account.elements.accountOrigin.value = state.accountOrigin;
    const status = { verified: w.signedIn, expired: w.expired, unavailable: w.unverified, signedOut: w.signedOut };
    account.hidden = !origins.length;
    heading.textContent = [status[state.status],
      state.quota && w.quota(state.quota.used, state.quota.limit)].filter(Boolean).join(' · ');
    check.hidden = !state.hasSession;
    signOut.hidden = !state.hasSession;
    account.elements.email.closest('label').hidden = state.signedIn;
    account.elements.password.closest('label').hidden = state.signedIn;
    account.querySelector('[type=submit]').hidden = state.signedIn;
  };
  async function run(operation, values, fallback, note) {
    if (pending) return;
    pending = true;
    heading.textContent = w.verifying;
    for (const button of host.querySelectorAll('button')) button.disabled = true;
    try {
      update(await api('novel_source_config', { operation, ...values }));
      if (note) toast(note);
    } catch (error) {
      const message = operation === 'login' && error.message === 'BOOK_SITE_WEB_REQUIRED'
        ? w.loginBrowser : errorText(w, error.message, fallback);
      heading.textContent = message;
      toast(message);
    } finally {
      pending = false;
      for (const button of host.querySelectorAll('button')) button.disabled = false;
    }
  }
  settings.onsubmit = event => {
    event.preventDefault();
    run('save', Object.fromEntries(new FormData(settings)), w.unavailable, w.saved);
  };
  account.onsubmit = event => {
    event.preventDefault();
    if (!current?.accountOrigin) return;
    const values = Object.fromEntries(new FormData(account));
    account.elements.password.value = '';
    run('login', { ...values, origin: current.accountOrigin }, w.loginFailed);
  };
  const accountOrigin = () => ({ accountOrigin: account.elements.accountOrigin.value });
  account.elements.accountOrigin.onchange = () => run('verify', accountOrigin(), w.unavailable);
  signOut.onclick = () => run('logout', accountOrigin(), w.unavailable);
  check.onclick = () => run('verify', accountOrigin(), w.unavailable);
  host.querySelector('[data-account-site]').onclick = () => {
    if (current?.accountOrigin) api('novel_source_open', { url: current.accountOrigin }).catch(() => toast(w.unavailable));
  };
  await Promise.all([run('get', {}, w.unavailable), mountWebsiteSettings(host.querySelector('[data-website-settings]'), { api, esc, w, toast })]);
}
