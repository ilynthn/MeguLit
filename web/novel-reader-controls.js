// SPDX-License-Identifier: GPL-3.0-or-later
const glyphs = {
  menu: '<path d="M5 7h14M5 12h14"/><circle cx="6" cy="17" r="1"/><circle cx="12" cy="17" r="1"/><circle cx="18" cy="17" r="1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  toc: '<path d="M9 5h11M9 12h11M9 19h11M4 5h.1M4 12h.1M4 19h.1"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  type: '<path d="M3 18 7.5 6 12 18m-7.2-4h5.3m9 4v-4a2.5 2.5 0 0 0-5 0v2a2 2 0 0 0 4.5 0"/>',
  notes: '<path d="M5 4h11l3 3v13H5zm3 6h8m-8 4h8m-8 3h4"/>',
  marks: '<path d="M6 20V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15l-6-4z"/>',
  full: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  unfull: '<path d="M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5"/>',
  language: '<path d="M3 5h10M8 3v2m-4 3c2 3 4 5 7 6M11 5c0 4-3 8-8 10m10 5 4-9 4 9m-7-2h6"/>',
  slide: '<rect x="4" y="4" width="12" height="16" rx="2"/><path d="M19 5v14m-6-7H7m2-2-2 2 2 2"/>',
  curl: '<path d="M6 4h12v10l-5 6H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm7 16v-5a1 1 0 0 1 1-1h4"/>',
  fade: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="m13 7-4 6h4l-2 4"/>',
  scroll: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  color: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none"/>',
  custom: '<path d="M4 7h16M4 12h16M4 17h16M8 5v4m8 1v4m-5 1v4"/>'
};

export const readerIcon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + glyphs[name] + '</svg>';

export const readerLabels = {
  zh: { menu:'阅读菜单', search:'在图书中搜索', themes:'主题与设置', notes:'摘要', full:'全屏阅读', unfull:'退出全屏', singleLang:'单语', dualLang:'双语', style:'翻页方式', color:'面板外观', auto:'跟随软件', dark:'深色', light:'浅色', custom:'自定义', less:'小', more:'大', slide:'滑动', curl:'卷页', fade:'快速淡入淡出', scroll:'滚动', spread:'页数布局', presets:['原始','安静','纸张','粗体','平静','专注'], noMatches:'书中没有匹配的内容', results:n=>`${n} 条结果`, configure:'自定义阅读设置', translation:'当前页译文', end:'退出阅读' },
  ja: { menu:'読書メニュー', search:'本の中を検索', themes:'テーマと設定', notes:'抜粋', full:'全画面で読む', unfull:'全画面を終了', singleLang:'原文のみ', dualLang:'対訳', style:'ページの切り替え', color:'パネルの外観', auto:'アプリに合わせる', dark:'ダーク', light:'ライト', custom:'カスタム', less:'小', more:'大', slide:'スライド', curl:'ページをめくる', fade:'短いフェード', scroll:'スクロール', spread:'ページ構成', presets:['標準','静か','紙','太字','穏やか','集中'], noMatches:'一致する箇所がありません', results:n=>`${n} 件`, configure:'読書設定をカスタマイズ', translation:'現在のページの訳文', end:'読書を終了' },
  en: { menu:'Reading menu', search:'Search this book', themes:'Theme and settings', notes:'Excerpts', full:'Full-screen reading', unfull:'Exit full screen', singleLang:'Original only', dualLang:'Bilingual', style:'Page transitions', color:'Panel appearance', auto:'Follow app', dark:'Dark', light:'Light', custom:'Customize', less:'A−', more:'A+', slide:'Slide', curl:'Page curl', fade:'Quick fade', scroll:'Scroll', spread:'Page layout', presets:['Original','Quiet','Paper','Bold','Calm','Focus'], noMatches:'No matches in this book', results:n=>`${n} results`, configure:'Custom reading settings', translation:'Translation of current page', end:'Exit reader' }
};

export const themes = ['white', 'quiet', 'cream', 'bold', 'green', 'night'];
export const pageTurns = ['slide', 'curl', 'fade', 'scroll'];

export function readerMenu(labels, w, esc) {
  const row = (action, name, icon = action) =>
    `<button type="button" class="nr-menu-row" data-reader-action="${action}"><span${action === 'toc' ? ' data-reader-progress' : ''}>${esc(name)}</span>${readerIcon(icon)}</button>`;
  const tool = (action, name) =>
    `<button type="button" class="nr-menu-tool" data-reader-action="${action}" title="${esc(name)}" aria-label="${esc(name)}">${readerIcon(action)}</button>`;
  return `<div class="nr-menu">
    <nav class="nr-menu-list" data-reader-menu hidden aria-label="${esc(labels.menu)}">
      ${row('toc', w.toc)}${row('search', labels.search)}${row('type', labels.themes)}${row('notes', labels.notes)}
      <div class="nr-menu-trio">${tool('full', labels.full)}${tool('language', labels.dualLang)}${tool('marks', w.marks)}</div>
    </nav>
    <button type="button" class="nr-menu-trigger" data-reader-action="menu" aria-expanded="false" aria-label="${esc(labels.menu)}" title="${esc(labels.menu)}">${readerIcon('menu')}</button>
  </div>`;
}

export function readerSettings(prefs, papers, labels, w, esc) {
  const option = (key, value, title, current, icon = '') =>
    `<button type="button" data-setting="${key}" data-value="${value}" aria-pressed="${current === value}">${icon ? readerIcon(icon) : ''}<span>${esc(title)}</span></button>`;
  const pop = (name, icon, content) => `<details class="nr-setting-pop"><summary aria-label="${esc(name)}" title="${esc(name)}">${readerIcon(icon)}</summary><div class="nr-setting-options">${content}</div></details>`;
  return `<div class="nr-panel-head"><b>${esc(labels.themes)}</b></div>
    <div class="nr-settings nr-panel-body">
      <div class="nr-setting-top">
        <div class="nr-font-step"><button data-font-step="-1" type="button" aria-label="${esc(w.fontSize + ' −')}">${esc(labels.less)}</button><button data-font-step="1" type="button" aria-label="${esc(w.fontSize + ' +')}">${esc(labels.more)}</button></div>
        <div class="nr-setting-pop-group">
          ${pop(labels.style, 'scroll', pageTurns.map(turn => option('turn', turn, labels[turn], prefs.turn, turn)).join(''))}
          ${pop(labels.color, 'color', ['auto','dark','light'].map(color => option('chrome', color, labels[color], prefs.chrome)).join(''))}
        </div>
      </div>
      <label class="nr-font-slider">${readerIcon('type')}<input type="range" min="15" max="30" step="1" value="${prefs.size}" aria-label="${esc(w.fontSize)}" data-reader-size><output>${prefs.size}px</output></label>
      <div class="nr-layout-choice" aria-label="${esc(labels.spread)}" ${prefs.dir === 'h' ? '' : 'hidden'}>
        ${option('spread','auto',w.auto,prefs.spread)}${option('spread','single',w.singlePage,prefs.spread)}${option('spread','double',w.doublePage,prefs.spread)}
      </div>
      <div class="nr-presets">${themes.map((theme, i) => `<button type="button" data-setting="paper" data-value="${theme}" aria-pressed="${prefs.paper === theme}" style="--sample-paper:${papers[theme].paper};--sample-ink:${papers[theme].ink};--sample-weight:${theme === 'bold' ? 700 : 400}"><span lang="ja" aria-hidden="true">あ<small>ア</small></span><span>${esc(labels.presets[i])}</span></button>`).join('')}</div>
      <button type="button" class="nr-custom" data-setting="custom">${readerIcon('custom')}${esc(labels.custom)}</button>
    </div>`;
}
