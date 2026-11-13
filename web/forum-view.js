// SPDX-License-Identifier: GPL-3.0-or-later
/* #117 交流: the fourth switch on the 排行榜 page (阅读榜 / 每周热词 / 关注 / 交流), so the top bar stays as it is.
   Everyone can read; posting and replying need the MeguLit account (signed out, the write box becomes the e-mail
   login). Three views in the page body: the thread list (tag switch, game / engine filter chips, 加载更多), one thread
   with its replies, and the new-post form. A post can name a work; the game detail page opens this tab filtered to that
   work (这部作品的讨论). Data: bridge forum_* (services/forum.cjs → relay/src/forum.js). */
import {busyText,isRateLimited,retrySeconds,autoRetry} from './rate-limit.js';
import {mountEmailLogin} from './account-ui.js';
import {trayHTML,mountTray,galleryHTML,bindGallery,pictureWords} from './forum-pictures.js';

const W={
 zh:{forum:'交流',all:'全部',question:'求助',hook:'Hook 适配',guide:'教程',share:'分享',other:'闲聊',newPost:'发帖',mine:'我的帖子',
  sub:'玩家互相解答问题。所有人都能看，登录后才能发言',empty:'这里还没有帖子',emptyHint:'第一个来提问或分享吧',
  replies:'{n} 条回复',noReplies:'还没有回复',back:'返回列表',more:'加载更多',reply:'回复',replyHint:'写下你的回答…',send:'发送',sending:'发送中…',
  title:'标题',titleHint:'一句话说明问题（2–60 字）',body:'正文',bodyHint:'游戏、引擎、你试过的办法……（最多 4000 字）',tag:'分类',game:'关联作品',gameHint:'可不填',engine:'引擎',engineHint:'可不填，例如 Kirikiri',
  publish:'发布',cancel:'取消',del:'删除',delConfirm:'再点一次确认删除',deleted:'已删除',replyDeleted:'这条回复已删除',
  loginTitle:'登录后才能发言',loginText:'用邮箱收一个 6 位验证码就能登录，不用设密码。没登录也能看所有帖子',
  gameFilter:'作品：{v}',engineFilter:'引擎：{v}',clear:'清除筛选',posted:'已发布',replied:'已回复',offline:'暂时连不上联网服务',retry:'重试',notReady:'联网服务还在准备中',
  rules:'大家友善交流就好～请别发违法内容，也别透露自己或别人的个人隐私；发布前会自动审核',
  UNAUTHORIZED:'请先登录',RATE_LIMITED:'发得太快了，过一会儿再试',TITLE_REQUIRED:'请填写标题',TITLE_LENGTH:'标题需要 2–60 字',BODY_REQUIRED:'请填写内容',BODY_LENGTH:'内容太长了',
  TEXT_INVALID:'内容里有不可见的特殊字符',TEXT_LINK:'不能包含网址、邮箱或联系方式',TEXT_BLOCKED:'内容里有不能使用的词',INVALID_TAG:'请选择分类',INVALID_GAME:'作品名有误',INVALID_ENGINE:'引擎名只能用字母、数字和常见符号',
  MODERATION_ADULT:'审核未通过：疑似成人内容',MODERATION_ABUSE:'审核未通过：疑似辱骂或攻击他人',MODERATION_SPAM:'审核未通过：疑似广告或引流',THREAD_FULL:'这个帖子的回复已满',NOT_FOUND:'帖子不存在或已删除',FORBIDDEN:'只能删除自己发的内容'},
 ja:{forum:'交流',all:'すべて',question:'質問',hook:'Hook 対応',guide:'解説',share:'共有',other:'雑談',newPost:'投稿する',mine:'自分の投稿',
  sub:'プレイヤー同士で助け合う場所です。誰でも読めます。書き込みにはログインが必要です',empty:'まだ投稿がありません',emptyHint:'最初の質問や共有をどうぞ',
  replies:'返信 {n} 件',noReplies:'まだ返信がありません',back:'一覧に戻る',more:'さらに読み込む',reply:'返信',replyHint:'回答を書く…',send:'送信',sending:'送信中…',
  title:'タイトル',titleHint:'問題をひとことで（2〜60 文字）',body:'本文',bodyHint:'ゲーム、エンジン、試したこと……（4000 文字まで）',tag:'カテゴリー',game:'関連作品',gameHint:'任意',engine:'エンジン',engineHint:'任意。例：Kirikiri',
  publish:'投稿',cancel:'キャンセル',del:'削除',delConfirm:'もう一度押すと削除します',deleted:'削除しました',replyDeleted:'この返信は削除されました',
  loginTitle:'書き込むにはログイン',loginText:'メールに届く 6 桁のコードだけでログインできます。パスワードは不要です。ログインしなくても読めます',
  gameFilter:'作品：{v}',engineFilter:'エンジン：{v}',clear:'絞り込みを解除',posted:'投稿しました',replied:'返信しました',offline:'オンラインサービスに接続できません',retry:'再試行',notReady:'オンラインサービスは準備中です',
  rules:'みんなで仲良く話しましょう。違法な内容や、自分・他人の個人情報は書かないでね。投稿前に自動で確認します',
  UNAUTHORIZED:'先にログインしてください',RATE_LIMITED:'投稿が速すぎます。少し待ってください',TITLE_REQUIRED:'タイトルを入力してください',TITLE_LENGTH:'タイトルは 2〜60 文字です',BODY_REQUIRED:'本文を入力してください',BODY_LENGTH:'本文が長すぎます',
  TEXT_INVALID:'見えない特殊文字が含まれています',TEXT_LINK:'URL・メールアドレス・連絡先は書けません',TEXT_BLOCKED:'使えない語が含まれています',INVALID_TAG:'カテゴリーを選んでください',INVALID_GAME:'作品名が正しくありません',INVALID_ENGINE:'エンジン名は英数字と一般的な記号だけです',
  MODERATION_ADULT:'審査で不可：成人向けの内容の疑い',MODERATION_ABUSE:'審査で不可：暴言・攻撃の疑い',MODERATION_SPAM:'審査で不可：宣伝・誘導の疑い',THREAD_FULL:'この投稿は返信の上限に達しました',NOT_FOUND:'投稿が見つからないか削除されました',FORBIDDEN:'自分の書き込みだけ削除できます'},
 en:{forum:'Community',all:'All',question:'Help',hook:'Hook support',guide:'Guides',share:'Sharing',other:'Chat',newPost:'New post',mine:'My posts',
  sub:'Players helping players. Anyone can read; sign in to post',empty:'No posts here yet',emptyHint:'Be the first to ask or share',
  replies:'{n} replies',noReplies:'No replies yet',back:'Back to the list',more:'Load more',reply:'Reply',replyHint:'Write your answer…',send:'Send',sending:'Sending…',
  title:'Title',titleHint:'The problem in one line (2–60 characters)',body:'Text',bodyHint:'Game, engine, what you tried… (up to 4000 characters)',tag:'Category',game:'Game',gameHint:'Optional',engine:'Engine',engineHint:'Optional, e.g. Kirikiri',
  publish:'Post',cancel:'Cancel',del:'Delete',delConfirm:'Click again to delete',deleted:'Deleted',replyDeleted:'This reply was deleted',
  loginTitle:'Sign in to post',loginText:'Sign in with a 6-digit code sent to your email, no password. Everything here can be read without signing in',
  gameFilter:'Game: {v}',engineFilter:'Engine: {v}',clear:'Clear filters',posted:'Posted',replied:'Reply sent',offline:'Cannot reach the online service right now',retry:'Retry',notReady:'Online services are still being set up',
  rules:'Be kind to each other. Nothing illegal, and keep your own and others’ personal details private; posts are checked automatically',
  UNAUTHORIZED:'Sign in first',RATE_LIMITED:'Too fast; try again in a while',TITLE_REQUIRED:'Enter a title',TITLE_LENGTH:'Titles are 2–60 characters',BODY_REQUIRED:'Write something',BODY_LENGTH:'That is too long',
  TEXT_INVALID:'It contains invisible special characters',TEXT_LINK:'No links, email addresses or contact handles',TEXT_BLOCKED:'It contains words that are not allowed',INVALID_TAG:'Pick a category',INVALID_GAME:'That game name is not valid',INVALID_ENGINE:'Engine names use letters, digits and common symbols only',
  MODERATION_ADULT:'Rejected by the check: looks like adult content',MODERATION_ABUSE:'Rejected by the check: looks abusive',MODERATION_SPAM:'Rejected by the check: looks like advertising',THREAD_FULL:'This thread is full',NOT_FOUND:'This post does not exist or was deleted',FORBIDDEN:'You can only delete your own posts'}
};
export const TAGS=['question','hook','guide','share','other'];
export const forumWords=locale=>W[locale]||W.zh;
const fill=(t,v)=>t.replace(/\{(\w+)\}/g,(_,k)=>v[k]??'');
/* the filter survives tab switches; the game detail page sets it before opening the tab */
let filter={tag:'',game:'',engine:'',mine:false},screen={name:'list',id:''};
export function setForumFilter(patch){filter={...filter,...patch};screen={name:'list',id:''};}
export const forumFilter=()=>({...filter});
export function errorText(error,locale){const w=forumWords(locale),code=String(error?.message||error||'').replace(/^FORUM_/,'');return w[code]||pictureWords(locale)[code]||w.offline;}
function when(t,locale){if(!t)return '';const d=new Date(t*1000),diff=(Date.now()-d.getTime())/1000,rtf=new Intl.RelativeTimeFormat(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en',{numeric:'auto'});
 if(diff<3600)return rtf.format(-Math.max(1,Math.round(diff/60)),'minute');if(diff<86400)return rtf.format(-Math.round(diff/3600),'hour');if(diff<86400*30)return rtf.format(-Math.round(diff/86400),'day');
 return d.toLocaleDateString(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-US');}
const paragraphs=(text,esc)=>String(text||'').split(/\n{2,}/).map(p=>`<p>${esc(p).replace(/\n/g,'<br>')}</p>`).join('');
const tagChip=(tag,w)=>`<span class="forum-tag is-${tag}">${w[tag]||w.other}</span>`;

/* motion (#forum-motion): list <-> thread is a shared-element flight. The clicked row's title and author are cloned into
   fixed ghosts that fly to their places in the thread (and back), the card unfolds from the row, everything else rises.
   transform/opacity only, WAAPI so a new click cancels the running flight, nothing at all under reduced motion. */
const EASE='cubic-bezier(.22,1,.36,1)';
const calm=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!document.body.animate;
const COPY=['font','color','letter-spacing','line-height','display','align-items','justify-content','gap','border-radius','background-color','background-image','background-size','object-fit','box-shadow','padding','border','text-transform','font-variant-numeric'];
function ghost(el){if(!el)return null;const r=el.getBoundingClientRect();if(!r.width)return null;const g=el.cloneNode(true),all=[el,...el.querySelectorAll('*')],out=[g,...g.querySelectorAll('*')];
 all.forEach((n,i)=>{const cs=getComputedStyle(n);COPY.forEach(p=>out[i].style.setProperty(p,cs.getPropertyValue(p)));out[i].removeAttribute('class');if(i&&(/avatar/.test(n.className)||n.tagName==='IMG')){out[i].style.width=cs.width;out[i].style.height=cs.height;out[i].style.flex='none';}});
 Object.assign(g.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:Math.ceil(r.width+1)+'px',height:r.height+'px',margin:'0',whiteSpace:'nowrap',zIndex:'60',pointerEvents:'none',transformOrigin:'0 0',display:getComputedStyle(el).display==='inline'?'inline-block':g.style.display});
 g.setAttribute('aria-hidden','true');g.removeAttribute('id');g.className='forum-ghost';return {g,r,font:parseFloat(getComputedStyle(el).fontSize)||1};}
function panel(el){if(!el)return null;const r=el.getBoundingClientRect(),cs=getComputedStyle(el),g=document.createElement('div');
 Object.assign(g.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',zIndex:'59',pointerEvents:'none',transformOrigin:'0 0',background:cs.background,borderRadius:cs.borderRadius,boxShadow:cs.boxShadow});
 g.setAttribute('aria-hidden','true');return {g,r};}
function rise(els,delay=0){[...els].filter(Boolean).forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:320,delay:delay+Math.min(i,8)*35,easing:EASE,fill:'backwards'}));}
const parts=(card,thread)=>card?{card,title:card.querySelector(thread?'.forum-title':'.forum-row-title'),who:card.querySelector(thread?':scope>.forum-row-meta>:first-child':'.forum-row-meta>:first-child')}:null;
export function forumSubRow(locale,esc){
 const w=forumWords(locale),chips=[filter.game?['game',fill(w.gameFilter,{v:esc(filter.game)})]:null,filter.engine?['engine',fill(w.engineFilter,{v:esc(filter.engine)})]:null].filter(Boolean);
 return `<div class="lb-seg" role="group" data-forum-tags>${['',...TAGS].map(t=>`<button type="button" data-forum-tag="${t}" aria-pressed="${filter.tag===t&&!filter.mine}">${t?w[t]:w.all}</button>`).join('')}</div>
  <div class="forum-subrow-end">${chips.map(([k,label])=>`<button type="button" class="forum-filter" data-forum-clear="${k}" title="${w.clear}">${label}<span aria-hidden="true">×</span></button>`).join('')}<button type="button" class="leaderboard-leave" data-forum-mine aria-pressed="${filter.mine}">${w.mine}</button><button type="button" class="primary forum-new" data-forum-new>${w.newPost}</button></div>`;
}
function author(a,ctx){return ctx.person(a,`${ctx.avatarHTML(a,ctx.images,ctx.esc)}<span class="leaderboard-name">${ctx.esc(a.name)}</span>`);}
function listHTML(data,ctx,append=false){
 const {w,esc,locale}=ctx;
 const rows=data.posts.map(p=>`<li class="forum-row"><button type="button" class="forum-open" data-forum-open="${esc(p.id)}"><span class="forum-row-head">${tagChip(p.tag,w)}<strong class="forum-row-title">${esc(p.title)}</strong></span><span class="forum-row-excerpt">${esc(p.excerpt)}</span></button>
  <div class="forum-row-meta">${author(p.author,ctx)}<span>· ${esc(when(p.created,locale))}</span>${p.game?`<button type="button" class="forum-meta-chip" data-forum-game="${esc(p.game)}">${esc(p.game)}</button>`:''}${p.engine?`<button type="button" class="forum-meta-chip" data-forum-engine="${esc(p.engine)}">${esc(p.engine)}</button>`:''}${p.pictures?`<span class="forum-row-pics" aria-label="${p.pictures}"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><path d="M5 17l5-5 4 4 2-2 3 3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>${p.pictures}</span>`:''}<span class="forum-row-count">${esc(fill(w.replies,{n:p.replies}))}</span></div></li>`).join('');
 if(append)return rows;
 const empty=!data.posts.length?ctx.emptyState('empty',w.empty,w.emptyHint):'';
 return `<section class="lb-card forum-list"><div class="lb-card-head"><h2 class="lb-h2">${w.forum}${filter.tag?` <span>· ${w[filter.tag]}</span>`:''}</h2><small>${w.sub}</small></div>${empty}<ol class="forum-rows">${rows}</ol>${data.more?`<button type="button" class="leaderboard-leave forum-more" data-forum-more>${w.more}</button>`:''}</section>`;
}
function writeBox(signedIn,inner,w){return signedIn?inner:`<div class="forum-login"><h3 class="lb-h2">${w.loginTitle}</h3><p class="lb-note">${w.loginText}</p><div data-forum-login></div></div>`;}
function threadHTML(data,ctx){
 const {w,esc,locale}=ctx,p=data.post;data.pictures=data.pictures||{};
 const del=(id,reply='')=>`<button type="button" class="forum-delete" data-forum-delete="${esc(id)}" data-reply="${esc(reply)}">${w.del}</button>`;
 const replies=data.replies.map(r=>r.deleted?`<li class="forum-reply is-deleted"><p class="lb-note">${w.replyDeleted}</p></li>`:`<li class="forum-reply"><div class="forum-row-meta">${author(r.author,ctx)}<span>· ${esc(when(r.created,locale))}</span>${r.author.mine?del(p.id,r.id):''}</div><div class="forum-text">${paragraphs(r.body,esc)}</div>${galleryHTML(r.images,data.pictures,locale)}</li>`).join('');
 return `<button type="button" class="text-button forum-back" data-forum-back><span aria-hidden="true">←</span> ${w.back}</button>
  <article class="lb-card forum-thread"><div class="forum-row-head">${tagChip(p.tag,w)}${p.game?`<button type="button" class="forum-meta-chip" data-forum-game="${esc(p.game)}">${esc(p.game)}</button>`:''}${p.engine?`<button type="button" class="forum-meta-chip" data-forum-engine="${esc(p.engine)}">${esc(p.engine)}</button>`:''}</div>
  <h1 class="forum-title">${esc(p.title)}</h1><div class="forum-row-meta">${author(p.author,ctx)}<span>· ${esc(when(p.created,locale))}</span>${p.author.mine?del(p.id):''}</div><div class="forum-text">${paragraphs(p.body,esc)}</div>${galleryHTML(p.images,data.pictures,locale)}</article>
  <section class="lb-card forum-replies"><div class="lb-card-head"><h2 class="lb-h2">${w.reply} <span>· ${p.replies}</span></h2></div>${replies?`<ol class="forum-reply-list">${replies}</ol>`:`<p class="lb-note">${w.noReplies}</p>`}
  ${writeBox(data.signedIn,`<div class="forum-compose"><textarea data-forum-reply-body maxlength="2000" rows="4" placeholder="${w.replyHint}"></textarea>${trayHTML(locale)}<p class="leaderboard-error" data-forum-error hidden></p><div class="forum-actions"><small class="lb-note">${w.rules}</small><button type="button" class="primary" data-forum-send>${w.send}</button></div></div>`,w)}</section>`;
}
function composeHTML(signedIn,ctx){
 const {w,esc}=ctx;
 return `<button type="button" class="text-button forum-back" data-forum-back><span aria-hidden="true">←</span> ${w.back}</button><section class="lb-card forum-form"><div class="lb-card-head"><h2 class="lb-h2">${w.newPost}</h2></div>${writeBox(signedIn,`
  <div class="forum-field"><span>${w.tag}</span><div class="lb-seg" role="group">${TAGS.map((t,i)=>`<button type="button" data-forum-pick="${t}" aria-pressed="${(filter.tag||'question')===t}">${w[t]}</button>`).join('')}</div></div>
  <label class="leaderboard-field forum-field"><span>${w.title}</span><input type="text" data-forum-title maxlength="60" placeholder="${w.titleHint}" autocomplete="off"></label>
  <label class="leaderboard-field forum-field"><span>${w.body}</span><textarea data-forum-body maxlength="4000" rows="9" placeholder="${w.bodyHint}"></textarea></label>${trayHTML(ctx.locale)}
  <div class="forum-field-row"><label class="leaderboard-field forum-field"><span>${w.game}</span><input type="text" data-forum-game-input maxlength="120" value="${esc(filter.game)}" placeholder="${w.gameHint}" autocomplete="off"></label>
  <label class="leaderboard-field forum-field"><span>${w.engine}</span><input type="text" data-forum-engine-input maxlength="24" value="${esc(filter.engine)}" placeholder="${w.engineHint}" autocomplete="off" spellcheck="false"></label></div>
  <p class="leaderboard-error" data-forum-error hidden></p><div class="forum-actions"><small class="lb-note">${w.rules}</small><button type="button" class="secondary" data-forum-back>${w.cancel}</button><button type="button" class="primary" data-forum-publish>${w.publish}</button></div>`,w)}</section>`;
}

/* page: the .leaderboard-page element; its .lb-subrow and .lb-body are ours while the tab is open */
export async function mountForum(page,{api,locale,esc,toast,isCurrent=()=>true,avatarHTML,person,emptyState,bindPeople=()=>{}}){
 const w=forumWords(locale),sub=page.querySelector('.lb-subrow'),body=page.querySelector('.lb-body');
 const ctx={w,esc,locale,avatarHTML,emptyState,images:{},person:(a,inner)=>person({...a,me:a.mine},inner,esc)};
 let listPage=0,seq=0,nav=null,listTop=0,flying=[];
 const scroller=()=>{for(let n=body.parentElement;n;n=n.parentElement){const o=getComputedStyle(n).overflowY;if(o==='auto'||o==='scroll')return n;}return document.scrollingElement||document.documentElement;};
 const settle=()=>{flying.splice(0).forEach(f=>f());body.getAnimations?.({subtree:true}).forEach(a=>a.cancel());};
 const fly=(gh,to,ms=480)=>{if(!gh)return;if(!to){gh.g.remove();return;}document.body.append(gh.g);const r=to.getBoundingClientRect(),s=(parseFloat(getComputedStyle(to).fontSize)||1)/gh.font;to.style.opacity='0';
  const a=gh.g.animate([{transform:'none'},{transform:`translate(${r.left-gh.r.left}px,${r.top-gh.r.top}px) scale(${s})`}],{duration:ms,easing:EASE,fill:'forwards'});
  const done=()=>{gh.g.remove();to.style.opacity='';};flying.push(done);a.onfinish=done;};
 /* paint: swap the body and run the transition named by nav (set by go / send / tag switch) */
 const paint=html=>{const n=nav;nav=null;settle();
  if(!n||calm()){body.innerHTML=html;return;}
  const sc=scroller(),base=()=>sc===document.scrollingElement||sc===document.documentElement?0:sc.getBoundingClientRect().top;
  const src=n.kind==='open'?parts(body.querySelector(`[data-forum-open="${CSS.escape(n.id)}"]`)?.closest('.forum-row'),false):n.kind==='back'?parts(body.querySelector('.forum-thread'),true):null;
  const gt=src&&ghost(src.title),gw=src&&ghost(src.who),gp=n.kind==='back'&&src?panel(src.card):null,rowRect=n.kind==='open'&&src?src.card.getBoundingClientRect():null;
  if(n.kind==='open')listTop=sc.scrollTop;
  body.innerHTML=html;
  if(n.kind==='back'&&body.querySelector('.forum-rows'))sc.scrollTop=listTop;
  else if(n.kind==='open'||n.kind==='enter'){const top=body.getBoundingClientRect().top-base()+sc.scrollTop-16;if(sc.scrollTop>top)sc.scrollTop=Math.max(0,top);}
  if(n.kind==='open'){const dst=parts(body.querySelector('.forum-thread'),true);
   if(dst&&rowRect){const cr=dst.card.getBoundingClientRect();fly(gt,dst.title);fly(gw,dst.who);/* measured before the card and its rows start moving */
    dst.card.animate([{opacity:.35,transformOrigin:'50% 0',transform:`translateY(${rowRect.top-cr.top}px) scaleY(${Math.min(1,rowRect.height/Math.max(1,cr.height))})`},{opacity:1,transformOrigin:'50% 0',transform:'none'}],{duration:380,easing:EASE});
    rise([...dst.card.children].filter(c=>c!==dst.title),150);}
   else{gt?.g.remove();gw?.g.remove();rise(body.children);}
   rise(body.querySelectorAll('.forum-back,.forum-replies'),120);return;}
  if(n.kind==='back'){const row=body.querySelector(`[data-forum-open="${CSS.escape(n.id)}"]`)?.closest('.forum-row'),dst=parts(row,false);
   if(dst&&gp)fly(gt,dst.title,440),fly(gw,dst.who,440);
   body.querySelector('.forum-list')?.animate([{opacity:0,transform:'scale(.985)'},{opacity:1,transform:'none'}],{duration:300,easing:EASE});
   if(dst&&gp){document.body.append(gp.g);const rr=row.getBoundingClientRect();const a=gp.g.animate([{opacity:1,transform:'none'},{opacity:0,transform:`translate(${rr.left-gp.r.left}px,${rr.top-gp.r.top}px) scale(${rr.width/gp.r.width},${rr.height/gp.r.height})`}],{duration:420,easing:EASE,fill:'forwards'});
    const done=()=>gp.g.remove();flying.push(done);a.onfinish=done;}
   else{gt?.g.remove();gw?.g.remove();}return;}
  if(n.kind==='reply'){rise([body.querySelector('.forum-reply:last-child')]);return;}
  if(n.kind==='tab'){rise([body.querySelector('.forum-list .lb-card-head'),...body.querySelectorAll('.forum-row,.lb-empty,.forum-more')]);return;}
  rise(body.children);};
 const busy=on=>body.classList.toggle('is-loading',on);
 const showError=(error)=>{const box=body.querySelector('[data-forum-error]');if(box){box.textContent=errorText(error,locale);box.hidden=false;}else toast(errorText(error,locale));};
 const failed=res=>{body.innerHTML=res?.state==='not-configured'?ctx.emptyState('pending',w.notReady):`${ctx.emptyState('empty',isRateLimited(res)?'':w.offline)}${isRateLimited(res)?`<p class="forum-center" data-rate-wait>${busyText(res,locale)}</p>`:''}<p class="forum-center"><button type="button" class="leaderboard-leave" data-forum-retry>${w.retry}</button></p>`;body.querySelector('[data-forum-retry]')?.addEventListener('click',()=>show());{const wait=body.querySelector('[data-rate-wait]');if(wait)autoRetry(wait,retrySeconds(res),()=>show());}};
 const paintSub=()=>{sub.innerHTML=forumSubRow(locale,esc);
  sub.querySelectorAll('[data-forum-tag]').forEach(b=>b.onclick=()=>{filter.tag=b.dataset.forumTag;filter.mine=false;go('list');});
  sub.querySelectorAll('[data-forum-clear]').forEach(b=>b.onclick=()=>{filter[b.dataset.forumClear]='';go('list');});
  sub.querySelector('[data-forum-mine]').onclick=()=>{filter.mine=!filter.mine;go('list');};
  sub.querySelector('[data-forum-new]').onclick=()=>go('compose');};
 const go=(name,id='',kind)=>{const prev=screen;nav={kind:kind||(name==='thread'&&prev.name==='list'?'open':name==='list'&&prev.name==='thread'?'back':name==='list'&&prev.name==='list'?'tab':'enter'),id:name==='list'?prev.id:id};screen={name,id};paintSub();show();};
 const login=()=>{const box=body.querySelector('[data-forum-login]');if(box)mountEmailLogin(box,{api,locale,esc,toast,onDone:()=>{if(isCurrent())show();}});};
 const common=()=>{
  body.querySelectorAll('[data-forum-open]').forEach(b=>b.onclick=()=>go('thread',b.dataset.forumOpen));
  body.querySelectorAll('[data-forum-game]').forEach(b=>b.onclick=()=>{filter.game=b.dataset.forumGame;filter.mine=false;go('list');});
  body.querySelectorAll('[data-forum-engine]').forEach(b=>b.onclick=()=>{filter.engine=b.dataset.forumEngine;filter.mine=false;go('list');});
  body.querySelectorAll('[data-forum-back]').forEach(b=>b.onclick=()=>go('list'));
  bindPeople(body,ctx.images);login();
 };
 const show=async()=>{
  const mine=++seq;busy(true);
  try{
   if(screen.name==='compose'){let signedIn=true;try{signedIn=(await api('forum_status')).signedIn!==false;}catch{}
    if(mine!==seq||!isCurrent())return;paint(composeHTML(signedIn,ctx));bindCompose();common();return;}
   if(screen.name==='thread'){const data=await api('forum_get',{id:screen.id});if(mine!==seq||!isCurrent())return;
    if(data.state!=='ok'){if(data.error==='NOT_FOUND'){toast(w.NOT_FOUND);go('list');return;}failed(data);return;}
    ctx.images=data.avatars||{};paint(threadHTML(data,ctx));bindThread(data);bindGallery(body,data.pictures,locale);common();return;}
   listPage=0;const data=await api('forum_list',{...filter,page:0});if(mine!==seq||!isCurrent())return;
   if(data.state!=='ok'){failed(data);return;}
   ctx.images=data.avatars||{};paint(listHTML(data,ctx));bindMore(data);common();
  }catch(error){if(mine===seq&&isCurrent())failed(null);}
  finally{if(mine===seq)busy(false);}
 };
 const bindMore=data=>{const more=body.querySelector('[data-forum-more]');if(!more)return;more.onclick=async()=>{more.disabled=true;
  try{const next=await api('forum_list',{...filter,page:listPage+1});if(next.state!=='ok')throw Error(next.error);listPage++;ctx.images={...ctx.images,...(next.avatars||{})};
   const ol=body.querySelector('.forum-rows'),had=ol.children.length;ol.insertAdjacentHTML('beforeend',listHTML(next,ctx,true));if(!calm())rise([...ol.children].slice(had));if(next.more)more.disabled=false;else more.remove();common();}
  catch{more.disabled=false;toast(w.offline);}};};
 const confirmDelete=b=>{if(b.dataset.armed!=='1'){b.dataset.armed='1';b.textContent=w.delConfirm;return false;}return true;};
 const bindThread=data=>{
  body.querySelectorAll('[data-forum-delete]').forEach(b=>b.onclick=async()=>{if(!confirmDelete(b))return;b.disabled=true;
   try{await api('forum_delete',{id:b.dataset.forumDelete,reply:b.dataset.reply||''});toast(w.deleted);if(b.dataset.reply)show();else go('list');}catch(error){b.disabled=false;toast(errorText(error,locale));}});
  const send=body.querySelector('[data-forum-send]');if(!send)return;const tray=mountTray(body.querySelector('.forum-compose'),{api,locale,toast,esc});
  send.onclick=async()=>{const text=body.querySelector('[data-forum-reply-body]').value,box=body.querySelector('[data-forum-error]');box.hidden=true;
   if(!text.trim()){showError('BODY_REQUIRED');return;}if(tray.busy()){box.textContent=tray.busyText;box.hidden=false;return;}send.disabled=true;send.textContent=w.sending;
   try{await api('forum_reply',{id:data.post.id,body:text,images:tray.ids()});toast(w.replied);nav={kind:'reply'};show();}catch(error){send.disabled=false;send.textContent=w.send;showError(error);}};
 };
 const bindCompose=()=>{
  let tag=filter.tag||'question';
  body.querySelectorAll('[data-forum-pick]').forEach(b=>b.onclick=()=>{tag=b.dataset.forumPick;body.querySelectorAll('[data-forum-pick]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  const publish=body.querySelector('[data-forum-publish]');if(!publish)return;const tray=mountTray(body.querySelector('.forum-form'),{api,locale,toast,esc});
  publish.onclick=async()=>{const val=s=>body.querySelector(s).value,box=body.querySelector('[data-forum-error]');box.hidden=true;
   const title=val('[data-forum-title]').trim(),text=val('[data-forum-body]');
   if([...title].length<2){showError(title?'TITLE_LENGTH':'TITLE_REQUIRED');return;}if(!text.trim()){showError('BODY_REQUIRED');return;}
   if(tray.busy()){box.textContent=tray.busyText;box.hidden=false;return;}publish.disabled=true;publish.textContent=w.sending;
   try{const r=await api('forum_post',{title,body:text,tag,game:val('[data-forum-game-input]').trim(),engine:val('[data-forum-engine-input]').trim(),images:tray.ids()});toast(w.posted);if(r?.id)go('thread',r.id);else go('list');}
   catch(error){publish.disabled=false;publish.textContent=w.publish;showError(error);}};
 };
 paintSub();await show();
}
