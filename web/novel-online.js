// SPDX-License-Identifier: GPL-3.0-or-later
import { bindSynopsis, synopsisContentHTML, synopsisHTML } from './synopsis-view.js';
import { bindReception, receptionHTML } from './game-reception.js';

const labels = {
  zh: {
    chapters: '目录', info: '作品资料', pending: '正在自动匹配作品资料…', offline: '部分来源暂时无法访问，稍后打开时会自动重试。',
    empty: '暂未找到可信的作品资料。', authors: '作者', illustrator: '插画', publisher: '出版社',
    date: '出版日期', volume: '卷次', related: '系列资料', alt: '关联书名', sources: '来源',
    ndl: '国立国会图书馆', moegirl: '萌娘百科', shlibrary: '上海图书馆', workScore: '作品级'
  },
  ja: {
    chapters: '目次', info: '作品情報', pending: '作品情報を自動で検索しています…', offline: '一部の出典に接続できません。後で開くと再試行します。',
    empty: '一致する作品情報がまだ見つかりません。', authors: '著者', illustrator: 'イラスト', publisher: '出版社',
    date: '刊行日', volume: '巻次', related: 'シリーズ情報', alt: '関連する書名', sources: '出典',
    ndl: '国立国会図書館', moegirl: '萌娘百科', shlibrary: '上海図書館', workScore: '作品全体'
  },
  en: {
    chapters: 'Contents', info: 'Book information', pending: 'Matching online book information…', offline: 'Some sources could not be reached. They will retry on a later visit.',
    empty: 'No reliable book information found yet.', authors: 'Author', illustrator: 'Illustrator', publisher: 'Publisher',
    date: 'Published', volume: 'Volume', related: 'Series information', alt: 'Matched title', sources: 'Sources',
    ndl: 'National Diet Library', moegirl: 'Moegirlpedia', shlibrary: 'Shanghai Library', workScore: 'Work rating'
  }
};

export const novelOnlineLabels = locale => labels[locale] || labels.zh;

export function bindNovelOnline(detail, { book, api, esc, locale, isCurrent }) {
  const t = novelOnlineLabels(locale);
  const sidebar = detail.querySelector('.nv-detail-side');
  const names = { bangumi: 'Bangumi', ndl: t.ndl, openlibrary: 'Open Library', shlibrary: t.shlibrary, moegirl: t.moegirl };
  const reviewId = 'book-' + book.id;
  const reviewApi = (action, args) => action === 'game_reviews' ?
    api('novel_online_reviews', { id: book.id, page: args.page, size: args.size }) : api(action, args);
  const matchedUrl = (key, record) => key === 'bangumi' ? 'https://bgm.tv/subject/' + Number(record.subjectId) : record.url;
  const attached = () => detail.isConnected && isCurrent();
  let fingerprint;
  let disconnectSynopsis;
  let expanded = false;

  function render(current) {
    const records = { ...current.onlineSources, bangumi: current.online };
    const state = current.onlineLookup || {};
    const snapshot = JSON.stringify([records, state]);
    if (snapshot === fingerprint) return;
    fingerprint = snapshot;
    const available = ['ndl', 'shlibrary', 'bangumi', 'openlibrary', 'moegirl']
      .filter(key => records[key]).sort((a,b) => (records[b].matchScore || 0) - (records[a].matchScore || 0));
    const metadata = available.filter(key => records[key].scope !== 'series');
    const primaryIsbn = metadata.map(key => records[key].isbn).find(Boolean);
    const compatible = metadata.filter(key => !primaryIsbn || !records[key].isbn || records[key].isbn === primaryIsbn);
    const fact = field => compatible.map(key => records[key][field]).find(Boolean);
    const summary = available.find(key => records[key].summary && records[key].scope !== 'series') ||
      available.find(key => records[key].summary);
    const sourceLabel = summary === 'moegirl' ? t.moegirl + ' · CC BY-NC-SA 4.0 · ' + t.related : names[summary];
    const failed = Object.values(state.sources || {}).some(item => item.status === 'failed');
    const pending = state.pending && !available.length;
    const status = pending ? t.pending : failed ? t.offline : t.empty;
    const facts = [
      [t.alt, fact('alternate') || fact('title')], [t.authors, fact('author')], [t.illustrator, fact('illustrator')],
      [t.publisher, fact('publisher')], [t.date, fact('date')], [t.volume, fact('volume')], ['ISBN', primaryIsbn]
    ].filter(([,value]) => value);
    const links = available.filter(key => matchedUrl(key, records[key])).map(key =>
      '<button type="button" class="text-button" data-nv-source="' + esc(matchedUrl(key, records[key])) + '">' +
      esc(names[key]) + ' ↗</button>').join('');
    disconnectSynopsis?.();
    sidebar.innerHTML = synopsisHTML({ locale, esc, title: esc(t.info), actions: false });
    const synopsis = sidebar.querySelector('.synopsis-panel');
    synopsis.classList.add(expanded ? 'is-expanded' : 'is-collapsed');
    synopsis.querySelector('.synopsis-content').innerHTML =
      (summary || !available.length ? synopsisContentHTML({ text: records[summary]?.summary, source: sourceLabel },
        { locale, esc, placeholder: status, expanded }) : '') +
      facts.map(([key,value]) => '<div class="detail-info-row"><span>' + esc(key) + '</span><span>' + esc(value) + '</span></div>').join('') +
      (links ? '<div class="nv-online-sources" aria-label="' + esc(t.sources) + '">' + links + '</div>' : '') +
      (available.length && state.pending ? '<p class="settings-help" role="status">' + esc(t.pending) + '</p>' : '');
    disconnectSynopsis = bindSynopsis(synopsis, locale, value => { expanded = value; });

    const platforms = ['bangumi', 'openlibrary'].map(key => {
      const record = records[key];
      const hasReviews = key === 'bangumi';
      const providerState = state.sources?.[key]?.status;
      return {
        key, name: !hasReviews && record?.score != null ? names[key] + ' · ' + t.workScore : names[key],
        region: key === 'bangumi' ? 'zh' : 'en', hasReviews,
        available: hasReviews ? Boolean(record) : record?.score != null,
        pending: !record && (providerState === 'pending' || (!providerState && state.pending)),
        error: providerState === 'failed', value: record?.score, scale: record?.scale || 10,
        votes: record?.votes, url: record ? matchedUrl(key, record) : undefined
      };
    });
    const value = { platforms, at: Math.max(0, ...available.map(key => records[key].fetchedAt || 0)) };
    sidebar.insertAdjacentHTML('beforeend', receptionHTML(value, locale, esc, reviewId));
    bindReception(sidebar, { api: reviewApi, id: reviewId, locale, esc, value, openFirst: 'bangumi' });
  }

  sidebar.addEventListener('click', event => {
    const link = event.target.closest('button[data-nv-source]');
    if (link) api('open_source', { url: link.dataset.nvSource }).catch(() => {});
  });
  const observer = new MutationObserver(() => {
    if (attached()) return;
    observer.disconnect();
    disconnectSynopsis?.();
  });
  const page = detail.closest('.novel-page');
  observer.observe(page.parentNode, { childList: true });
  observer.observe(detail.parentNode, { childList: true });
  render(book);
  async function refresh() {
    if (!attached()) return;
    try {
      const { book: next } = await api('novel_detail', { id: book.id, onlineOnly: true });
      if (!attached()) return;
      render(next);
      if (next.onlineLookup?.pending) setTimeout(refresh, 1500);
    } catch {}
  }
  if (book.onlineLookup?.pending) setTimeout(refresh, 1500);
}
