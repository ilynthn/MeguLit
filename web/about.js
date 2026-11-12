// SPDX-License-Identifier: GPL-3.0-or-later
// About page: what MeguLit is, version, links, credits, and the support (sponsor) codes.
import {checkForUpdates} from './update-notice.js';
import {openFeedback} from './feedback-ui.js';
export const VERSION='1.4.9-beta.24';
const REPO='https://github.com/ilynthn/MeguLit';
const SPONSOR='https://github.com/sponsors/ilynthn';
export const aboutLabel={zh:'关于',en:'About',ja:'について'};
const w={
 zh:{tag:'Read the game, keep the game.',intro:'在 Galgame 里读日语的小魔导书 ✦',version:'版本',license:'许可证',author:'作者',links:'链接',repo:'GitHub 仓库',issues:'反馈问题',releases:'下载更新',made:'用 AI 一起 vibe coding 出来的个人项目，每天自己在用，哪里难受就改哪里',credits:'致谢',creditsText:'LunaHook（文本 Hook）· JMdict / EDRDG（日语词典）· SudachiDict 与 UniDic（分词与注音）· Tauri（桌面宿主）· Anki 与 AnkiConnect · AivisSpeech（语音合成）· Tomoyo（最早的灵感来源）',support:'支持 MeguLit',supportText:'和 Bug 魔王军的战斗还在继续，冒险经费倒是快见底了……(›´ω`‹ )\n如果 MeguLit 为你的日语学习带来了一点帮助，欢迎赞助一点厄里斯，支持项目继续开发！',supportStrong:'每一份支持，都能让这场冒险走得更远 ヾ(≧▽≦*)o',cn:'国内赞赏',alipay:'支付宝',wechat:'微信赞赏',intl:'海外用户',intlText:'可以通过 GitHub Sponsors 赞助，支持信用卡和 PayPal',sponsorBtn:'打开 GitHub Sponsors',thanks:'谢谢你 ♡'},
 en:{tag:'Read the game, keep the game.',intro:'A tiny grimoire for reading Japanese in visual novels ✦',version:'Version',license:'License',author:'Author',links:'Links',repo:'GitHub repository',issues:'Report an issue',releases:'Downloads',made:'A personal project, vibe coded together with AI. I use it every day and fix whatever bugs me.',credits:'Thanks',creditsText:'LunaHook (text hooks) · JMdict / EDRDG (dictionary) · SudachiDict & UniDic (tokenizing & readings) · Tauri (desktop host) · Anki & AnkiConnect · AivisSpeech (speech) · Tomoyo (where it all started)',support:'Support MeguLit',supportText:'The fight against the Bug Demon King\'s army goes on, and the adventuring funds are running low… (›´ω`‹ )\nIf MeguLit made your Japanese a little easier, consider tossing a few Eris into the coin pouch.',supportStrong:'Every bit helps this adventure go a little further ヾ(≧▽≦*)o',cn:'From mainland China',alipay:'Alipay',wechat:'WeChat',intl:'Everywhere else',intlText:'Sponsor through GitHub Sponsors (credit card or PayPal).',sponsorBtn:'Open GitHub Sponsors',thanks:'Thank you ♡'},
 ja:{tag:'Read the game, keep the game.',intro:'ギャルゲーで日本語を読むための小さな魔導書 ✦',version:'バージョン',license:'ライセンス',author:'作者',links:'リンク',repo:'GitHub リポジトリ',issues:'不具合を報告',releases:'ダウンロード',made:'AI と一緒に Vibe Coding で作っている個人プロジェクトです。毎日自分で使いながら直しています',credits:'謝辞',creditsText:'LunaHook（テキストフック）· JMdict / EDRDG（辞書）· SudachiDict・UniDic（形態素解析・読み）· Tauri（デスクトップホスト）· Anki・AnkiConnect · AivisSpeech（音声合成）· Tomoyo（すべての始まり）',support:'MeguLit を応援する',supportText:'Bug 魔王軍との戦いはまだ続いていて、冒険資金はそろそろ底をつきそうです……(›´ω`‹ )\nMeguLit が日本語の勉強に少しでも役立ったら、エリスを少し投げてもらえると開発が続けられます',supportStrong:'ひとつひとつの応援が、この冒険を少し先へ進めてくれます ヾ(≧▽≦*)o',cn:'中国国内から',alipay:'Alipay',wechat:'WeChat',intl:'海外から',intlText:'GitHub Sponsors から支援できます（クレジットカード・PayPal 対応）',sponsorBtn:'GitHub Sponsors を開く',thanks:'ありがとうございます ♡'}
};
export function aboutHTML(locale,esc){
 const t=w[locale]||w.zh;
 const link=(url,label)=>`<button type="button" class="about-link" data-open="${esc(url)}">${esc(label)}<span aria-hidden="true">↗</span></button>`;
 return `<section class="about-page">
  <header class="about-hero">
   <img class="about-logo" src="assets/sponsor/logo.png" alt="MeguLit">
   <p class="about-tag">${esc(t.tag)}</p>
   <p class="about-intro">${esc(t.intro).replace(/\n/g,'<br>')}</p>
  </header>
  <div class="about-grid">
   <dl class="about-facts">
    <div><dt>${esc(t.version)}</dt><dd>v${VERSION} <button type="button" class="about-update" data-update>${esc(U[locale]?.check||U.zh.check)}</button><span class="about-update-state" data-update-state></span></dd></div>
    <div><dt>${esc(t.license)}</dt><dd>GPL-3.0-or-later</dd></div>
    <div><dt>${esc(t.author)}</dt><dd>魚魚棟 · ilynthn</dd></div>
    <div><dt>${esc(UN[locale]?.label||UN.zh.label)}</dt><dd><button type="button" class="about-update about-uninstall" data-uninstall>${esc(UN[locale]?.button||UN.zh.button)}</button><span class="about-update-state">${esc(UN[locale]?.hint||UN.zh.hint)}</span></dd></div>
   </dl>
   <div class="about-links"><h3>${esc(t.links)}</h3>${link('https://megulit.com',({zh:'官网',ja:'公式サイト',en:'Website'})[locale]||'Website')}${link(REPO,t.repo)}${link(REPO+'#faq',({zh:'常见问题',ja:'よくある質問',en:'FAQ'})[locale]||'FAQ')}<button type="button" class="about-link about-report" data-feedback>${esc(({zh:'一键上传问题反馈',ja:'不具合をまとめて送る',en:'Report a problem'})[locale]||'Report a problem')}</button>${link(REPO+'/releases',t.releases)}</div>
  </div>
  <section class="about-support">
   <span class="about-glyph" aria-hidden="true">援</span>
   <div class="about-eyebrow">Support</div>
   <h2>${esc(t.support)}</h2>
   <p class="about-support-text">${esc(t.supportText).replace(/\n/g,'<br>')}</p><p class="about-support-strong">${esc(t.supportStrong)}</p>
   <div class="about-pay">
    <div class="about-cn"><h3>${esc(t.cn)}</h3>
     <div class="about-qrs">
      <figure class="about-qcard"><div class="about-qr"><img src="assets/sponsor/alipay.png" alt="${esc(t.alipay)}"></div><figcaption><i class="dot alipay"></i>${esc(t.alipay)}</figcaption></figure>
      <figure class="about-qcard"><div class="about-qr"><img src="assets/sponsor/wechat.png" alt="${esc(t.wechat)}"></div><figcaption><i class="dot wechat"></i>${esc(t.wechat)}</figcaption></figure>
     </div>
    </div>
    <div class="about-intl"><h3>${esc(t.intl)}</h3><p>${esc(t.intlText)}</p>
     <button type="button" class="primary about-sponsor" data-open="${SPONSOR}">♡ ${esc(t.sponsorBtn)}</button>
     <p class="about-thanks">${esc(t.thanks)}</p>
    </div>
   </div>
  </section>
  <section class="about-credits"><h3>${esc(t.credits)}</h3><p>${esc(t.creditsText)}</p></section>
 </section>`;
}
/* 2026-11-12 the uninstaller (setup/uninstall.ps1) lists what goes and can keep the account data on this PC */
const UN={zh:{label:'卸载',button:'卸载 MeguLit',hint:'会列出要删除的内容，可以选择保留本地账户数据',opened:'卸载程序已打开',failed:'没能打开卸载程序：'},
 ja:{label:'アンインストール',button:'MeguLit をアンインストール',hint:'削除する内容を確認でき、ローカルのアカウントデータを残すこともできます',opened:'アンインストーラーを開きました',failed:'アンインストーラーを開けませんでした：'},
 en:{label:'Uninstall',button:'Uninstall MeguLit',hint:'Shows what will be removed; you can keep your local account data',opened:'The uninstaller is open',failed:'Could not open the uninstaller: '}};
const U={zh:{check:'检查更新',checking:'正在检查…',latest:'已经是最新版',found:v=>`有新版本 v${v}`,install:v=>`下载并更新到 v${v}`,downloading:'正在下载…',restart:'下载完成，MeguLit 即将关闭并自动更新，完成后会重新打开',failed:'更新失败：',keep:'只替换程序文件，你的游戏库、学习记录和设置都会保留'},
 ja:{check:'アップデートを確認',checking:'確認中…',latest:'最新版です',found:v=>`新しいバージョン v${v}`,install:v=>`v${v} に更新`,downloading:'ダウンロード中…',restart:'ダウンロード完了。MeguLit を閉じて自動で更新し、再起動します',failed:'更新に失敗しました：',keep:'プログラムだけを置き換えます。ライブラリ・学習記録・設定はそのまま残ります'},
 en:{check:'Check for updates',checking:'Checking…',latest:'You are up to date',found:v=>`v${v} is available`,install:v=>`Update to v${v}`,downloading:'Downloading…',restart:'Downloaded. MeguLit will close, update itself and reopen',failed:'Update failed: ',keep:'Only program files are replaced. Your library, study records and settings stay'}};
export function mountAbout(main,api,toast){
 const locale=document.documentElement.lang?.startsWith('ja')?'ja':document.documentElement.lang?.startsWith('en')?'en':'zh',t=U[locale]||U.zh;
 const button=main.querySelector('[data-update]'),state=main.querySelector('[data-update-state]');let found=null;
 const invoke=(cmd,args)=>window.__TAURI_INTERNALS__?.invoke(cmd,args);
 button?.addEventListener('click',async()=>{button.disabled=true;state.textContent=t.checking;const info=await checkForUpdates({api,invoke:(c,a)=>Promise.resolve(window.__TAURI_INTERNALS__?.invoke(c,a)),version:VERSION,toast,manual:true});state.textContent=info?(info.newer?t.found(info.latest):t.latest):'';button.disabled=false;});
 main.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>api('open_source',{url:b.dataset.open}).catch(()=>toast&&toast('…'))));
 /* E394 feedback and logs go through MeguLit's relay, not a GitHub page many users cannot open */
 const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 main.querySelector('[data-uninstall]')?.addEventListener('click',async e=>{const u=UN[locale]||UN.zh,b=e.currentTarget;b.disabled=true;try{await api('uninstall_open',{});toast&&toast(u.opened);}catch(err){toast&&toast(u.failed+(err?.message||err));b.disabled=false;}});
 main.querySelector('[data-feedback]')?.addEventListener('click',()=>openFeedback({api,locale,esc:escHTML,toast,version:VERSION}));
}
