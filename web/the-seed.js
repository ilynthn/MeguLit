// SPDX-License-Identifier: GPL-3.0-or-later
/* The Seed (传火计划): one pure-data seed per game version, shared by everyone who plays. One copy of the words, used by the
   home banner, the About section and the intro dialog. Reading seeds, the automatic upload and hot updates ship with the next
   big version, so the copy says "coming" and never "works now". The counts come from web/the-seed-stats.json (tools/gen-seed-stats.cjs). */
import {catalogLinkHTML,bindSeedCatalog} from './seed-catalog.js';
export const SEED_URL='https://github.com/ilynthn/MeguLit/tree/main/The%20Seed';
const W={
 zh:{name:'The Seed · 传火计划',kicker:'传火计划',line:'每部游戏一份几 KB 的差分',
  lead:'每个游戏、每个版本一份几 KB 的差分，由玩家互相共享：你玩的时候帮这部游戏调好，下一个人打开就直接能用；别人调好的，你也直接拿到。改一部只动这一部，已经调好的不会被带坏。',
  homage:'名字致敬《刀剑神域》里的 The Seed；共享的思路致敬当年大家在论坛上互相贴的 Textractor 钩子码',
  points:[['几 KB 纯数据','没有代码，不带路径和个人信息'],
   ['互相共享','你调好的下一个人直接用，别人调好的你也直接拿到'],
   ['互不影响','每个游戏只动自己那份，做好的就是做好了'],
   ['认得出版本','认 exe、封包、剧本指纹、Steam / VNDB 编号'],
   ['坏了先退一步','退回读模式并上报，修好后热更新送到大家手上'],
   ['共享运行样本','默认开，只用来修差分，可以在设置里关']],
  soon:'玩的时候自动传火，修好的种子热更新送到',next:'下一步',tag:'megulit · the seed',
  count:(g,v)=>`已种下 ${g} 部游戏、${v} 个版本`,live:(c,w)=>`已确认 ${c} 部 · 等传火 ${w} 部`,github:'去 GitHub 看看',close:'关闭',openAria:'打开 The Seed 介绍'},
 en:{name:'The Seed',kicker:'Project Spark',line:'One small diff per game',
  lead:'One small diff per game and per version, shared between players: when you play, you help tune that game for the next person, and you get what others have tuned. Fixing one game touches only that game, so one that works stays that way.',
  homage:'The name is a nod to The Seed in Sword Art Online; the sharing idea is a nod to the Textractor hook codes people used to post for each other on forums',
  points:[['A few KB of data','No code, no paths, no personal info'],
   ['Shared both ways','What you tune helps the next player, and you get what others tuned'],
   ['No cross-talk','Each game only touches its own diff; what works stays working'],
   ['Knows the version','Matches exe, archive, script fingerprint and Steam / VNDB ID'],
   ['Breaks, steps back','Falls back to reading mode and reports; a hot update brings the fix'],
   ['Shared run samples','On by default, used only to fix diffs, can be turned off in Settings']],
  soon:'Seeds spread as you play, and fixed seeds arrive by hot update',next:'Next',tag:'megulit · the seed',
  count:(g,v)=>`${g} games, ${v} versions planted`,live:(c,w)=>`${c} confirmed · ${w} waiting for a spark`,github:'See it on GitHub',close:'Close',openAria:'Open the introduction to The Seed'},
 ja:{name:'The Seed · 伝火計画',kicker:'伝火計画',line:'ゲームごとの数 KB の差分',
  lead:'ゲームごと・バージョンごとに数 KB の差分を、プレイヤー同士で共有します。あなたが遊ぶとそのゲームが次の人のために整い、ほかの人が整えたものはあなたもそのまま使えます。直すのはそのゲームだけなので、調整済みのゲームが崩れることはありません。',
  homage:'名前は『ソードアート・オンライン』の The Seed から。共有の発想は、かつて皆が掲示板で貼り合った Textractor のフックコードへのオマージュです',
  points:[['数 KB のデータだけ','コードなし、パスも個人情報も入りません'],
   ['お互いに共有','あなたが整えたものは次の人へ、ほかの人が整えたものもそのまま届きます'],
   ['お互い干渉しない','各ゲームは自分の差分だけを触り、動いたものは動いたまま'],
   ['バージョンを見分ける','exe、アーカイブ、スクリプトの指紋、Steam / VNDB の ID で判別'],
   ['壊れたら一歩退く','読み取りモードに戻って報告し、直したらホットアップデートで届けます'],
   ['実行サンプルの共有','既定でオン。差分の修正にだけ使い、設定でオフにできます']],
  soon:'遊んでいる間に自動で伝火し、直った種はホットアップデートで届きます',next:'次へ',tag:'megulit · the seed',
  count:(g,v)=>`${g} 本のゲーム、${v} バージョン分を種まき済み`,live:(c,w)=>`確認済み ${c} 本 · 伝火待ち ${w} 本`,github:'GitHub で見る',close:'閉じる',openAria:'The Seed の紹介を開く'}
};
export const seedWords=locale=>W[locale]||W.zh;
/* counts: the file made at build time answers at once; the live numbers come through the app's service layer (GET /api/seed/stats on the relay,
   3 s per host, nothing about the user is sent) and replace it when they arrive; if that fails the file stays */
let bundled=null;
const bundledStats=()=>bundled||(bundled=fetch('the-seed-stats.json').then(r=>r.json()).catch(()=>null));
export const seedStats=(api,onLive)=>{
 if(api)Promise.resolve().then(()=>api('seed_stats',{})).then(v=>{if(v&&Number.isInteger(v.games)&&onLive)onLive(v);}).catch(()=>{});
 return bundledStats();
};
const ASSET='assets/the-seed-egg.webp';
const heroHTML=()=>`<div class="seed-hero"><img src="assets/the-seed-banner.webp" alt="" loading="lazy"></div>`;
/* the home entry: a small pill under the top bar, the egg, the name, one line and an arrow; the whole pill is one button */
export function seedBannerHTML(locale,esc){
 const t=seedWords(locale);
 return `<button type="button" class="seed-banner" data-seed-open aria-label="${esc(t.openAria)}"><span class="seed-pic" aria-hidden="true"><img src="${ASSET}" alt=""></span><span class="seed-txt"><b>The Seed</b></span><i class="seed-go" aria-hidden="true">→</i></button>`;
}
/* the intro parts shared by the About section, the dialog and the start flow; the nod to Sword Art Online and Textractor lives only at the bottom of About */
const seedParts=(locale,esc)=>{
 const t=seedWords(locale);
 return {lead:`<p class="seed-lead">${esc(t.lead)}</p>`,
  points:`<dl class="seed-points">${t.points.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`,
  soon:`<p class="seed-soon">${esc(t.soon)}</p>`};
};
export function seedBodyHTML(locale,esc){const p=seedParts(locale,esc);return p.lead+p.points+p.soon;}
const countText=(locale,s)=>{if(!s||!s.games)return '';const t=seedWords(locale);return t.count(s.games,s.versions)+(Number.isInteger(s.confirmed)&&Number.isInteger(s.waiting)?' · '+t.live(s.confirmed,s.waiting):'');};
/* the About section: a full-width band under the three columns; the nod sits last, small */
export function seedAboutHTML(locale,esc){
 const t=seedWords(locale);
 const points=`<dl class="seed-points">${t.points.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
 const foot=`<div class="seed-foot"><span class="seed-soon">${esc(t.soon)}</span><span class="seed-count" data-seed-count></span>${catalogLinkHTML(locale,esc)}<button type="button" class="seed-link" data-open="${SEED_URL}">${esc(t.github)}<i aria-hidden="true">↗</i></button></div>`;
 return `<section class="ab-sec ab-seed"><h2>${esc(t.name)}</h2>
  <div class="seed-band"><div class="seed-band-l">${heroHTML()}</div><div class="seed-band-r"><p class="seed-lead">${esc(t.lead)}</p>${points}</div></div>
  ${foot}
  <p class="seed-homage">${esc(t.homage)}</p></section>`;
}
export function fillSeedCount(root,locale,api){
 const el=root.querySelector('[data-seed-count]');if(!el)return;
 const show=s=>{const text=countText(locale,s);el.textContent=text;el.hidden=!text;};
 seedStats(api,s=>{if(el.isConnected)show(s);}).then(s=>{if(s&&!el.textContent)show(s);});
}
/* one page of the start flow (notice, The Seed, tutorial): the same top line, title, scrolling body and button row as the other two */
export function seedPageHTML(locale,esc,{kicker='传火计划',tag='',left='',right=''}={}){
 const t=seedWords(locale);
 return `<div class="dev-notice-top"><span>${esc(t.kicker)}</span><span data-page-no>${esc(tag||t.tag)}</span></div>
 <h2>${esc(t.name)}</h2>
 <div class="dev-notice-scroll seed-scroll">${(p=>`<div class="seed-top">${heroHTML()}${p.lead}</div>${p.points}${p.soon}`)(seedParts(locale,esc))}<p class="seed-count" data-seed-count></p></div>
 <div class="dev-notice-actions">${left}${right}</div>`;
}
export const seedSeen=()=>{try{return localStorage.getItem('megulit.seedIntroSeen')==='1';}catch{return false;}};
export const markSeedSeen=()=>{try{localStorage.setItem('megulit.seedIntroSeen','1');}catch{}};
/* the dialog behind the home pill: same container and button row as the start flow */
export function openSeedDialog({api,locale,esc,toast}){
 document.querySelector('dialog.seed-panel')?.close();
 const t=seedWords(locale),dialog=document.createElement('dialog');
 dialog.className='game-dialog dev-notice seed-flow seed-panel';
 dialog.innerHTML=seedPageHTML(locale,esc,{left:`<button type="button" class="text-button" data-seed-github>${esc(t.github)} ↗</button>${catalogLinkHTML(locale,esc,'text-button')}`,right:`<button type="button" class="secondary" data-ok>${esc(t.close)}</button>`});
 document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 fillSeedCount(dialog,locale,api);markSeedSeen();
 dialog.querySelector('[data-ok]').onclick=()=>dialog.close();
 dialog.querySelector('[data-seed-github]').onclick=()=>api('open_source',{url:SEED_URL}).catch(()=>toast&&toast('…'));
 bindSeedCatalog(dialog,{api,locale,esc,toast});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.showModal();
}
