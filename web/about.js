// SPDX-License-Identifier: GPL-3.0-or-later
// About page: what MeguLit is, version, links, credits, and the support (sponsor) codes.
/* 2026-11-13 redesign (owner's picks): one landscape screen in four quarters — the cover reel top-left (the owner's own
   edit "endless everything", Megumin-graded, always looping), 关于 + 链接 top-right, 致谢 + uninstall bottom-left,
   支持开发 bottom-right with one plate whose tabs swap the code in place (WeChat first) and a small random toy beside it.
   Motion is plain Web Animations: no library. */
import {checkForUpdates} from './update-notice.js';
import {openFeedback} from './feedback-ui.js';
import {fxPref} from './fx-prefs.js';
import {mountSupportToy} from './about-toy.js';
export const VERSION='1.4.9-beta.36';
const REPO='https://github.com/ilynthn/MeguLit';
const SPONSOR='https://github.com/sponsors/ilynthn';
export const aboutLabel={zh:'关于',en:'About',ja:'について'};
const w={
 zh:{reel:'MeguLit 封面短片',tag:'在 Galgame 里读日语的小魔导书',about:'关于',author:'作者',links:'链接',linksSub:'都会在浏览器里打开',
  site:'官网',faq:'常见问题',releases:'更新日志',source:'源码',report:'反馈问题',reportSub:'在本机打包日志后上传',
  journey:'一起走过',journeySub:'只算这台电脑',jHours:['小时','在游戏里读日语'],jChars:['字','读过的日文'],jLook:['次','查词'],jEmpty:'还没一起冒险过，去游戏库打开一部游戏吧',
  thanks:'致谢',credits:[['LunaHook','从游戏里取出文本'],['JMdict / EDRDG','日语词典'],['SudachiDict · UniDic','分词与注音'],['Tauri','桌面外壳'],['Anki · AnkiConnect','制卡'],['AivisSpeech','语音合成'],['Tomoyo','最早让我想做这个']],
  support:'支持开发',eris:'和 Bug 魔王军的战斗还在继续，冒险经费倒是快见底了…… (´･ω･`)\n如果 MeguLit 帮你在日语上往前走了一点，欢迎赞助几枚厄里斯',
  ways:'赞助方式',alipay:'支付宝',wechat:'微信赞赏',sponsorAria:'GitHub Sponsors（在浏览器打开）',scanAli:'打开支付宝扫一扫',scanWx:'打开微信扫一扫',aliAlt:'支付宝收款码',wxAlt:'微信赞赏码',
  coinIdle:'点一下，投一枚厄里斯',coinCount:n=>`厄里斯 ×${n}`},
 ja:{reel:'MeguLit カバー映像',tag:'ギャルゲーで日本語を読む、小さな魔導書',about:'アプリ情報',check:'更新を確認',author:'作者',links:'リンク',linksSub:'ブラウザで開きます',
  site:'公式サイト',faq:'よくある質問',releases:'更新履歴',source:'ソースコード',report:'不具合を報告',reportSub:'ログをまとめて送信',
  journey:'冒険の記録',journeySub:'このPCの分だけ',jHours:['時間','ゲームで日本語を読んだ'],jChars:['字','読んだ日本語'],jLook:['回','辞書を引いた'],jEmpty:'まだ一緒に冒険していません。ライブラリからゲームを開いてみてください',
  thanks:'謝辞',credits:[['LunaHook','ゲームからテキストを取り出す'],['JMdict / EDRDG','日本語辞書'],['SudachiDict · UniDic','形態素解析と読み'],['Tauri','デスクトップの外枠'],['Anki · AnkiConnect','カード作成'],['AivisSpeech','音声合成'],['Tomoyo','作るきっかけ']],
  support:'応援する',eris:'Bug 魔王軍との戦いは続くのに、資金はもう底が見えてきた…… (´･ω･`)\nMeguLit が役に立ったら、エリスを何枚か投げてもらえると嬉しいです',
  ways:'支援の方法',alipay:'Alipay',wechat:'WeChat',sponsorAria:'GitHub Sponsors（ブラウザで開く）',scanAli:'Alipay でスキャン',scanWx:'WeChat でスキャン',aliAlt:'Alipay の受取コード',wxAlt:'WeChat の投げ銭コード',
  coinIdle:'押してエリスを一枚',coinCount:n=>`エリス ×${n}`},
 en:{reel:'MeguLit cover reel',tag:'a tiny grimoire for reading Japanese in visual novels',about:'About',author:'by',links:'Links',linksSub:'Open in your browser',
  site:'Website',faq:'FAQ',releases:'Release notes',source:'Source code',report:'Report a problem',reportSub:'Sends the logs from this PC',
  journey:'The journey',journeySub:'on this PC only',jHours:['h','reading Japanese in games'],jChars:['chars','of Japanese read'],jLook:['×','dictionary lookups'],jEmpty:'No adventures yet: open a game from your library',
  thanks:'Thanks',credits:[['LunaHook','pulls the text out of games'],['JMdict / EDRDG','Japanese dictionary'],['SudachiDict · UniDic','word splitting & readings'],['Tauri','desktop shell'],['Anki · AnkiConnect','card making'],['AivisSpeech','speech synthesis'],['Tomoyo','where the idea started']],
  support:'Support',eris:'The Bug Demon King\'s army fights on, and the funds run dry… (´･ω･`)\nIf MeguLit helped your Japanese, a few Eris keep it going',
  ways:'Ways to support',alipay:'Alipay',wechat:'WeChat',sponsorAria:'GitHub Sponsors (opens in your browser)',scanAli:'Scan with Alipay',scanWx:'Scan with WeChat',aliAlt:'Alipay payment code',wxAlt:'WeChat tip code',
  coinIdle:'click to toss an Eris',coinCount:n=>`Eris ×${n}`}
};
const pickLocale=locale=>w[locale]?locale:String(locale||'').startsWith('ja')?'ja':String(locale||'').startsWith('en')?'en':'zh';
export function aboutHTML(locale,esc){
 const L=pickLocale(locale),t=w[L],u=U[L],un=UN[L];
 const link=(url,label,sub)=>`<li><button type="button" data-open="${esc(url)}">${esc(label)}<small>${esc(sub)}<i aria-hidden="true">↗</i></small></button></li>`;
 return `<section class="ab" lang="${L==='zh'?'zh-CN':L}">
  <div class="ab-col ab-left">
  <section class="ab-player" aria-label="${esc(t.reel)}">
   <video class="ab-reel" muted loop playsinline preload="auto" disablepictureinpicture disableremoteplayback poster="assets/about/cover-poster.webp" aria-hidden="true"><source src="assets/about/cover-reel.webm" type="video/webm"><source src="assets/about/cover-reel.mp4" type="video/mp4"></video>
   <div class="ab-hud" aria-hidden="true"><span class="ab-hud-tl"><b>●</b> megulit.exe · 2026</span></div>
   <div class="ab-mark"><div class="ab-logo"><img src="assets/sponsor/logo.png" alt="MeguLit"><img class="ab-g ab-gr" src="assets/sponsor/logo.png" alt=""><img class="ab-g ab-gc" src="assets/sponsor/logo.png" alt=""></div><p class="ab-typed${/^[\x00-\x7f]+$/.test(t.tag)?' ab-latin':''}">&gt; ${esc(t.tag)}</p></div>
  </section>
  <section class="ab-sec ab-about"><h2>${esc(t.about)}</h2>
    <p class="ab-facts"><b class="ab-ver">v${esc(VERSION)}</b><button type="button" class="ab-tlink" data-update>${esc(t.check||u.check)}</button><span class="ab-state" data-update-state aria-live="polite"></span><span class="ab-dot">·</span><span>${esc(t.author)}</span> <b>魚魚棟</b><span class="ab-dot">·</span><b>GPL-3.0-or-later</b></p>
  </section>
  <div class="ab-q ab-bl">
   <section class="ab-sec"><h2>${esc(t.thanks)}</h2>
    <dl class="ab-cred">${t.credits.map(([n,d])=>`<div><dt>${esc(n)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>
   </section>
   <div class="ab-end"><span>${esc(un.hint)}</span><button type="button" class="ab-danger" data-uninstall>${esc(un.button)}…</button></div>
  </div>
  </div>
  <div class="ab-col ab-right">
  <section class="ab-sec ab-linksec"><h2>${esc(t.links)}<small>${esc(t.linksSub)}</small></h2>
    <ul class="ab-links">${link('https://megulit.com',t.site,'megulit.com')}${link(REPO+'#faq',t.faq,'GitHub · FAQ')}${link(REPO+'/releases',t.releases,'GitHub · Releases')}${link(REPO,t.source,'github.com/ilynthn/MeguLit')}<li><button type="button" data-feedback>${esc(t.report)}<small>${esc(t.reportSub)}<i aria-hidden="true">…</i></small></button></li></ul>
  </section>
  <div class="ab-q ab-br">
   <section class="ab-sec"><h2>${esc(t.support)}</h2>
    <div>
     <p class="ab-eris">${esc(t.eris).replace(/\n/g,'<br>').replace(/\(´･ω･`\)/g,'<span class="ab-nw">$&</span>')}</p>
     <div class="ab-plate">
      <div class="ab-tabs" role="tablist" aria-label="${esc(t.ways)}">
       <button type="button" class="ab-tab" role="tab" aria-selected="false" aria-controls="ab-pay" data-k="ali">${esc(t.alipay)}</button><span class="ab-sep" aria-hidden="true">·</span>
       <button type="button" class="ab-tab" role="tab" aria-selected="false" aria-controls="ab-pay" data-k="wx">${esc(t.wechat)}</button><span class="ab-sep" aria-hidden="true">·</span>
       <button type="button" class="ab-tab" data-open="${SPONSOR}" aria-label="${esc(t.sponsorAria)}">GitHub Sponsors<i aria-hidden="true">↗</i></button>
      </div>
      <div class="ab-slot" role="tabpanel" id="ab-pay">
       <div class="ab-qr"><img class="ab-mark0" src="assets/sponsor/logo.png" alt=""><img class="ab-code" data-c="ali" src="assets/about/alipay.png" alt="${esc(t.aliAlt)}"><img class="ab-code" data-c="wx" src="assets/about/wechat.png" alt="${esc(t.wxAlt)}"></div>
       <div class="ab-side"><span class="ab-hint" data-hint aria-live="polite" data-ali="${esc(t.scanAli)}" data-wx="${esc(t.scanWx)}"></span><canvas class="ab-toy" aria-hidden="true"></canvas></div>
      </div>
     </div>
    </div>
   </section>
  </div>
  <section class="ab-sec ab-journey"><h2>${esc(t.journey)}<small>${esc(t.journeySub)}</small></h2>
   <dl class="ab-stats" data-journey>${[t.jHours,t.jChars,t.jLook].map(([unit,label],i)=>`<div><dt><b data-n="${i}">0</b><small>${esc(unit)}</small></dt><dd>${esc(label)}</dd></div>`).join('')}</dl>
   <p class="ab-jempty" hidden>${esc(t.jEmpty)}</p>
  </section>
  </div>
 </section>`;
}
/* 2026-11-12 the uninstaller (setup/uninstall.ps1) lists what goes and can keep the account data on this PC */
const UN={zh:{label:'卸载',button:'卸载 MeguLit',hint:'卸载前会先列出要删除的文件，可以保留本地账户数据',opened:'卸载程序已打开',failed:'没能打开卸载程序：'},
 ja:{label:'アンインストール',button:'MeguLit をアンインストール',hint:'削除するファイルを先に確認でき、アカウントデータは残せます',opened:'アンインストーラーを開きました',failed:'アンインストーラーを開けませんでした：'},
 en:{label:'Uninstall',button:'Uninstall MeguLit',hint:'The uninstaller lists every file first; you can keep your local account data',opened:'The uninstaller is open',failed:'Could not open the uninstaller: '}};
const U={zh:{check:'检查更新',checking:'正在检查…',latest:'已经是最新版',found:v=>`有新版本 v${v}`,install:v=>`下载并更新到 v${v}`,downloading:'正在下载…',restart:'下载完成，MeguLit 即将关闭并自动更新，完成后会重新打开',failed:'更新失败：',keep:'只替换程序文件，你的游戏库、学习记录和设置都会保留'},
 ja:{check:'アップデートを確認',checking:'確認中…',latest:'最新版です',found:v=>`新しいバージョン v${v}`,install:v=>`v${v} に更新`,downloading:'ダウンロード中…',restart:'ダウンロード完了。MeguLit を閉じて自動で更新し、再起動します',failed:'更新に失敗しました：',keep:'プログラムだけを置き換えます。ライブラリ・学習記録・設定はそのまま残ります'},
 en:{check:'Check for updates',checking:'Checking…',latest:'You are up to date',found:v=>`v${v} is available`,install:v=>`Update to v${v}`,downloading:'Downloading…',restart:'Downloaded. MeguLit will close, update itself and reopen',failed:'Update failed: ',keep:'Only program files are replaced. Your library, study records and settings stay'}};
/* cut times (s) in cover-reel.*, from the encoder's cut detection; every third one fires the logo glitch, and the last
   one is the start of the loop transition */
const CUTS=[0,.333,1.417,2.375,5.167,5.833,6.333,7.042,7.792,8.542,9.167,9.833,10.958];
const KANA='あいうえおかきくけこさしすせそアイウエオカキクケコ';
const TOYS=['circle','coins','kana'];
function mountReel(page,reduce){
 const v=page.querySelector('.ab-reel'),typed=page.querySelector('.ab-typed');
 const alive=()=>v.isConnected;
 if(reduce)return;
 const play=()=>v.play().catch(()=>{});play();
 /* hidden window or another page: decode nothing */
 const vis=()=>{if(!alive()){document.removeEventListener('visibilitychange',vis);return;}if(document.hidden)v.pause();else play();};
 document.addEventListener('visibilitychange',vis);
 const ease='cubic-bezier(.16,1,.3,1)';
 page.querySelector('.ab-player').animate([{clipPath:'inset(0 0 100% 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:700,easing:'cubic-bezier(.77,0,.18,1)'});
 page.querySelector('.ab-logo').animate([{transform:'translateX(-20px)',opacity:0},{transform:'none',opacity:1}],{duration:800,delay:500,easing:ease,fill:'backwards'});
 page.querySelectorAll('.ab-hud>*').forEach((e,i)=>e.animate([{opacity:0},{opacity:1}],{duration:400,delay:500+i*60,fill:'backwards'}));
 page.querySelectorAll('.ab-sec,.ab-end,.ab-plate').forEach((e,i)=>e.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:600,delay:500+i*50,easing:ease,fill:'backwards'}));
 /* the tagline types in out of scrambled kana */
 const line=typed.textContent,t0=performance.now()+500,dur=1100;
 const scramble=now=>{if(!alive())return;const p=Math.max(0,Math.min(1,(now-t0)/dur)),n=Math.floor(line.length*p);
  typed.textContent=line.slice(0,n)+[...line.slice(n)].map(c=>c===' '?' ':KANA[Math.floor(Math.random()*KANA.length)]).join('').slice(0,Math.ceil((line.length-n)*Math.min(1,p*3)));
  if(p<1)requestAnimationFrame(scramble);else typed.textContent=line;};
 requestAnimationFrame(scramble);
 /* logo glitch on the reel's cuts */
 const [main,gr,gc]=page.querySelectorAll('.ab-logo img'),steps={easing:'steps(1,end)',duration:290};
 const burst=()=>{
  main.animate([{clipPath:'inset(0 0 0 0)',transform:'none'},{clipPath:'inset(30% 0 46% 0)',transform:'translateX(8px)',offset:.15},{clipPath:'inset(62% 0 12% 0)',transform:'translateX(-7px)',offset:.32},{clipPath:'inset(0 0 0 0)',transform:'none',offset:.5}],steps);
  gr.animate([{opacity:.85,transform:'translateX(-6px)'},{opacity:.85,transform:'translateX(-6px)',offset:.6},{opacity:0,transform:'none'}],{duration:290});
  gc.animate([{opacity:.85,transform:'translateX(5px)'},{opacity:.85,transform:'translateX(5px)',offset:.6},{opacity:0,transform:'none'}],{duration:290});};
 let last=-1;
 const onFrame=(now,meta)=>{if(!alive())return;const i=CUTS.findLastIndex(c=>c<=meta.mediaTime+.017);if(i!==last){last=i;if(i%3===0)burst();}v.requestVideoFrameCallback(onFrame);};
 if('requestVideoFrameCallback' in v)v.requestVideoFrameCallback(onFrame);
}
export function mountAbout(main,api,toast,model){
 const locale=pickLocale(document.documentElement.lang),t=U[locale],page=main.querySelector('.ab');
 const button=main.querySelector('[data-update]'),state=main.querySelector('[data-update-state]');
 button?.addEventListener('click',async()=>{button.disabled=true;state.textContent=t.checking;const info=await checkForUpdates({api,invoke:(c,a)=>Promise.resolve(window.__TAURI_INTERNALS__?.invoke(c,a)),version:VERSION,toast,manual:true});state.textContent=info?(info.newer?t.found(info.latest):t.latest):'';button.disabled=false;});
 main.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>api('open_source',{url:b.dataset.open}).catch(()=>toast&&toast('…'))));
 /* E394 feedback and logs go through MeguLit's relay, not a GitHub page many users cannot open */
 const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 main.querySelector('[data-uninstall]')?.addEventListener('click',async e=>{const u=UN[locale],b=e.currentTarget;b.disabled=true;try{await api('uninstall_open',{});toast&&toast(u.opened);}catch(err){toast&&toast(u.failed+(err?.message||err));b.disabled=false;}});
 main.querySelector('[data-feedback]')?.addEventListener('click',()=>openFeedback({api,locale,esc:escHTML,toast,version:VERSION}));
 if(!page)return;
 /* support plate: tabs swap the code in place; WeChat shows first, already there (no fade on open) */
 const hint=page.querySelector('[data-hint]'),codes=page.querySelectorAll('.ab-code'),tabs=page.querySelectorAll('.ab-tab[data-k]');
 const pick=k=>{tabs.forEach(x=>x.setAttribute('aria-selected',String(x.dataset.k===k)));codes.forEach(c=>c.classList.toggle('on',c.dataset.c===k));hint.textContent=hint.dataset[k];};
 codes.forEach(c=>c.style.transition='none');pick('wx');void page.querySelector('.ab-qr').offsetWidth;codes.forEach(c=>c.style.transition='');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches||!fxPref('aboutReel').on;
 const words=w[locale],light=document.documentElement.dataset.theme==='light';
 /* the toy beside the code: a random one each time the page opens, and a different one each time the tab changes
    (a fresh canvas, so the old toy's listeners go with it) */
 let toy='';
 const mountToy=()=>{const old=page.querySelector('.ab-toy'),c=old.cloneNode(false);old.replaceWith(c);
  const others=TOYS.filter(n=>n!==toy);
  toy=mountSupportToy(c,{pick:others[Math.floor(Math.random()*others.length)],reduce,coinIdle:words.coinIdle,coinCount:words.coinCount,...(light?{palette:{gold:'176,120,34',red:'178,32,48',cream:'70,40,36'}}:{})});};
 tabs.forEach(x=>x.addEventListener('click',()=>{if(x.getAttribute('aria-selected')==='true')return;pick(x.dataset.k);mountToy();}));
 mountToy();
 mountJourney(page,model,reduce);
 mountReel(page,reduce);
}
/* 一起走过: the totals this PC already keeps (the home page's model); numbers count up once */
function mountJourney(page,model,reduce){
 const box=page.querySelector('[data-journey]');if(!box)return;
 const games=Array.isArray(model?.games)?model.games:[],stats=model?.stats||{};
 const hours=(Number(stats.readingSeconds)||0)/3600,chars=games.reduce((n,g)=>n+(Number(g.characters)||0),0),looks=Number(stats.lookups)||0;
 if(!hours&&!chars&&!looks){box.hidden=true;page.querySelector('.ab-jempty').hidden=false;return;}
 const vals=[hours,chars,looks],nf=new Intl.NumberFormat(document.documentElement.lang||undefined);
 const fmt=(v,i)=>i===0?(v<10?v.toFixed(1):nf.format(Math.round(v))):nf.format(Math.round(v));
 const cells=box.querySelectorAll('[data-n]');
 const paint=p=>cells.forEach((c,i)=>{c.textContent=fmt(vals[i]*p,i);});
 if(reduce){paint(1);return;}
 const t0=performance.now()+400,dur=900,ease=x=>1-Math.pow(1-x,4);
 const tick=now=>{if(!box.isConnected)return;const p=Math.max(0,Math.min(1,(now-t0)/dur));paint(ease(p));if(p<1)requestAnimationFrame(tick);};
 paint(0);requestAnimationFrame(tick);
}
