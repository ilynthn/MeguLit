// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 排行榜 page (top tab between 学习 and 工具). Data: bridge leaderboard_view / leaderboard_join / leaderboard_leave
   (services/leaderboard.cjs). Opt-in only; with no relay configured the page shows a "not ready yet" notice and the
   numbers computed on this PC.
   E379: avatars (moderated on the relay; default = initial on a preset colour) with a report button, and a second
   view 每周热词: 词汇 / 短语 / 短句, podium for 1–3, cards with the AI guess for 4–10, a plain list for 11–50. */
import {mountEmailLogin} from './account-ui.js';
import {changeAvatar} from './avatar-crop.js';
import {personButton,socialHTML,bindSocial} from './leaderboard-social.js';
import {openProfilePanel} from './profile-panel.js';
import {rankTitle,SCHOOLS,elementName} from './reader-class.js';
/* 2026-11-12 转职: each reader's level, element and rank under the name, as the relay reports them */
const rankTag=(e,esc)=>{if(!(e?.level>0))return '';const l=String(document.documentElement.lang||'zh'),loc=l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh',el=SCHOOLS[e.element]?e.element:'';return `<small class="lb-rank-tag"${el?` style="--c:${SCHOOLS[el].color}"`:''}>Lv.${e.level} · ${el?esc(elementName(el,loc))+' · ':''}${esc(rankTitle(e.level,loc,el))}</small>`;};
import {cardify} from './home-tv.js';
/* #117 交流 tab */
import {mountForum,forumWords,forumSubRow} from './forum-view.js';
export const leaderboardLabel={zh:'排行榜',ja:'ランキング',en:'Leaderboard'};
const W={
 zh:{title:'排行榜',week:'本周',month:'本月',all:'全部',characters:'阅读字数',seconds:'阅读时长',words:'新收录单词',reviews:'复习次数',kana:'假名练习',streak:'连续天数',games:'按游戏',
  notReady:'联网服务还在准备中',notReadyText:'排行榜上线后会显示在这里。下面是只在本机计算的个人数据，不会上传',
  mine:'我的数据',currentStreak:'当前连续',days:'天',unitChars:'字',unitWords:'个',unitReviews:'次',unitKana:'题',totalWords:'共收录单词',hours:'小时',minutes:'分钟',
  joinTitle:'参加排行榜',joinText:'参加后只会上传阅读字数、时长、收录单词数、复习次数、假名练习题数、连续天数的汇总，以及本周查词的词条和次数（不含原句和游戏进度），不读取硬件信息。参加要先用邮箱登录 MeguLit 账号，几台电脑会合并成一行；邮箱只用来登录，不会出现在榜上。随时可以在 设置 › 个人主页 退出，退出时会删除服务器上的记录',loginStep:'第 1 步：用邮箱登录',loginText:'输入邮箱，收到 6 位验证码后填进来就登录好了，不用设密码。已经在 设置 › 账号 登录过的话会直接跳到下一步',joinStep:'第 2 步：起个昵称',ACCOUNT_REQUIRED:'请先用邮箱登录',
  nickname:'昵称',nicknameHint:'2–16 个字',shareGames:'同时公开我读过的游戏（用于“按游戏”排行）',consent:'我同意上传上述汇总数据',join:'参加',
  joinedAs:'以 {name} 参加',leave:'退出排行榜',leaveConfirm:'再点一次确认退出（会删除服务器上的记录）',left:'已退出排行榜',
  me:'我的排名',rank:'第 {n} 名',empty:'还没有人上榜',offline:'暂时连不上联网服务',retry:'重试',readers:'{n} 人在读',top:'榜首',back:'返回游戏列表',
  report:'举报头像',reported:'已举报，谢谢',reportHidden:'已举报，这个头像已隐藏',
  board:'阅读榜',hot:'每周热词',word:'词汇',phrase:'短语',sentence:'短句',weekOf:'{week} 周',pastWeeks:'往期',
  hotPending:'本周热词会在周一 00:00（北京时间）揭晓',hotEmpty:'这一周还没有达到上榜门槛的词',hotRule:'至少 3 位读者查过才会上榜，只统计参加排行榜的读者',
  lookedUp:'{users} 人查过 · {n} 次',times:'{n} 次',aiGuess:'AI 推测',participants:'{n} 位读者参与',
  NAME_REQUIRED:'请填写昵称',NAME_LENGTH:'昵称需要 2–16 个字',NAME_INVALID:'昵称不能包含网址、引号或特殊字符',NAME_BLOCKED:'这个昵称不能使用，换一个吧',NAME_TAKEN:'这个昵称已经有人在用了，换一个吧',CONSENT_REQUIRED:'请先勾选同意',BIO_LENGTH:'签名最多 60 字',BIO_INVALID:'签名不能包含网址或特殊字符',BIO_BLOCKED:'签名里有不能使用的内容',NOT_JOINED:'请先参加排行榜',INVALID_FAVORITES:'最喜欢的游戏有误'},
 ja:{title:'ランキング',week:'今週',month:'今月',all:'全期間',characters:'読んだ文字数',seconds:'読書時間',words:'新しく登録した単語',reviews:'復習回数',kana:'かな練習',streak:'連続日数',games:'ゲーム別',
  notReady:'オンラインサービスは準備中です',notReadyText:'公開後、ランキングはここに表示されます。下はこの PC だけで計算した個人の記録で、送信されません',
  mine:'自分の記録',currentStreak:'現在の連続',days:'日',unitChars:'字',unitWords:'語',unitReviews:'回',unitKana:'問',totalWords:'登録単語の合計',hours:'時間',minutes:'分',
  joinTitle:'ランキングに参加',joinText:'参加すると、読んだ文字数・時間・登録単語数・復習回数・かな練習の問題数・連続日数の合計と、今週調べた語とその回数（原文やゲームの進行状況は含みません）だけを送ります。ハードウェア情報は読みません。参加にはメールアドレスで MeguLit アカウントにログインする必要があり、複数の PC が 1 行にまとまります。メールアドレスはログインにのみ使い、ランキングには表示されません。設定 › プロフィール でいつでも退出でき、そのときサーバーの記録も削除します',loginStep:'ステップ 1：メールアドレスでログイン',loginText:'メールアドレスを入力し、届いた 6 桁の確認コードを入れるだけでログインできます。パスワードは不要です。設定 › アカウント でログイン済みなら次のステップから始まります',joinStep:'ステップ 2：ニックネームを決める',ACCOUNT_REQUIRED:'先にメールアドレスでログインしてください',
  nickname:'ニックネーム',nicknameHint:'2〜16 文字',shareGames:'読んだゲームも公開する（ゲーム別ランキング用）',consent:'上記の合計データの送信に同意します',join:'参加する',
  joinedAs:'{name} として参加中',leave:'ランキングから退出',leaveConfirm:'もう一度押すと退出します（サーバーの記録を削除）',left:'ランキングから退出しました',
  me:'自分の順位',rank:'{n} 位',empty:'まだ誰も載っていません',offline:'オンラインサービスに接続できません',retry:'再試行',readers:'{n} 人が読書中',top:'1 位',back:'ゲーム一覧に戻る',
  report:'アイコンを通報',reported:'通報しました',reportHidden:'通報しました。このアイコンは非表示になりました',
  board:'読書ランキング',hot:'今週の注目語',word:'単語',phrase:'フレーズ',sentence:'短文',weekOf:'{week} 週',pastWeeks:'過去の週',
  hotPending:'今週の注目語は月曜 0:00（UTC+8）に発表されます',hotEmpty:'この週は掲載基準に達した語がありません',hotRule:'3 人以上が調べた語だけを掲載します。ランキング参加者のみ集計',
  lookedUp:'{users} 人が {n} 回調べました',times:'{n} 回',aiGuess:'AI の推測',participants:'{n} 人が参加',
  NAME_REQUIRED:'ニックネームを入力してください',NAME_LENGTH:'ニックネームは 2〜16 文字です',NAME_INVALID:'URL・引用符・特殊文字は使えません',NAME_BLOCKED:'このニックネームは使えません',NAME_TAKEN:'このニックネームはすでに使われています。別の名前にしてください',CONSENT_REQUIRED:'同意にチェックしてください',BIO_LENGTH:'ひとことは 60 文字までです',BIO_INVALID:'URL や特殊文字は使えません',BIO_BLOCKED:'使えない内容が含まれています',NOT_JOINED:'先にランキングに参加してください',INVALID_FAVORITES:'好きなゲームの指定が正しくありません'},
 en:{title:'Leaderboard',week:'This week',month:'This month',all:'All time',characters:'Characters read',seconds:'Reading time',words:'New words saved',reviews:'Reviews',kana:'Kana practice',streak:'Streak days',games:'By game',
  notReady:'Online services are still being set up',notReadyText:'The leaderboard will appear here once it is live. Below are your own numbers, computed on this PC and not uploaded',
  mine:'My numbers',currentStreak:'Current streak',days:'days',unitChars:'chars',unitWords:'words',unitReviews:'reviews',unitKana:'questions',totalWords:'Words saved in all',hours:'h',minutes:'min',
  joinTitle:'Join the leaderboard',joinText:'Only totals are uploaded: characters read, reading time, words saved, reviews, kana questions answered, streak days, and this week\'s looked-up words with their counts (no sentences, no game progress, no hardware ids). Joining needs a MeguLit account signed in with your email, so your PCs share one row; the email is only used to sign in and never shows on the board. Leave any time in Settings › Profile, which also deletes your entry on the server',loginStep:'Step 1: sign in with your email',loginText:'Enter your email, then type the 6-digit code we send you. No password. If you already signed in under Settings › Account, you start at step 2',joinStep:'Step 2: pick a nickname',ACCOUNT_REQUIRED:'Sign in with your email first',
  nickname:'Nickname',nicknameHint:'2–16 characters',shareGames:'Also show the games I read (for the per-game boards)',consent:'I agree to upload these totals',join:'Join',
  joinedAs:'Joined as {name}',leave:'Leave the leaderboard',leaveConfirm:'Click again to leave (deletes your entry on the server)',left:'You left the leaderboard',
  me:'My rank',rank:'#{n}',empty:'Nobody here yet',offline:'Cannot reach the online service right now',retry:'Retry',readers:'{n} readers',top:'Top',back:'Back to games',
  report:'Report picture',reported:'Reported, thank you',reportHidden:'Reported; this picture is now hidden',
  board:'Reading',hot:'Weekly hot words',word:'Words',phrase:'Phrases',sentence:'Sentences',weekOf:'Week {week}',pastWeeks:'Past weeks',
  hotPending:'This week\'s hot words are announced Monday 00:00 (UTC+8)',hotEmpty:'No term reached the threshold this week',hotRule:'A term needs at least 3 different readers; only people who joined the leaderboard count',
  lookedUp:'{users} readers · {n} lookups',times:'{n}×',aiGuess:'AI guess',participants:'{n} readers took part',
  NAME_REQUIRED:'Enter a nickname',NAME_LENGTH:'Nicknames are 2–16 characters',NAME_INVALID:'No links, quotes or special characters',NAME_BLOCKED:'That nickname is not allowed',NAME_TAKEN:'Someone already uses this name; pick another',CONSENT_REQUIRED:'Please tick the agreement first',BIO_LENGTH:'Signatures are up to 60 characters',BIO_INVALID:'No links or special characters',BIO_BLOCKED:'That signature is not allowed',NOT_JOINED:'Join the leaderboard first',INVALID_FAVORITES:'Those favourite games are not valid'}
};
const PERIODS=['week','month','all'],METRICS=['seconds','characters','words','reviews','kana','streak','games'],CATS=['word','phrase','sentence'];
let view={tab:'board',period:'week',metric:'seconds',game:'',category:'word',week:''};
export const setView=patch=>{view={...view,...patch};};
export function leaderboardWords(locale){return W[locale]||W.zh;}
function fill(template,values){return template.replace(/\{(\w+)\}/g,(_,k)=>values[k]??'');}
const nf=locale=>new Intl.NumberFormat(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-US');
export function formatValue(metric,value,locale){
 const w=leaderboardWords(locale),n=nf(locale).format(value||0);
 if(metric==='seconds'){const min=Math.floor((value||0)/60);return min>=60?`${Math.floor(min/60)} ${w.hours} ${min%60} ${w.minutes}`:`${min} ${w.minutes}`;}
 if(metric==='words')return `${n} ${w.unitWords}`;if(metric==='reviews')return `${n} ${w.unitReviews}`;if(metric==='kana')return `${n} ${w.unitKana}`;if(metric==='streak')return `${n} ${w.days}`;return `${n} ${w.unitChars}`;
}
/* Default avatar: the first character of the name on one of six preset colours picked by the name. */
const PRESETS=['#ad1539','#b8862e','#3f7d6e','#4867a8','#7a4ea3','#a65a3a'];
export function defaultAvatar(name){const text=String(name||'?');let h=0;for(const ch of text)h=(h*31+ch.codePointAt(0))>>>0;return {initial:[...text.trim()][0]||'?',color:PRESETS[h%PRESETS.length]};}
export function avatarHTML(entry,images,esc){
 const src=entry?.avatar&&images?.[entry.avatar];
 if(src&&/^data:image\/webp;base64,/.test(src))return `<img class="leaderboard-avatar" src="${esc(src)}" alt="" width="36" height="36" loading="lazy" decoding="async">`;
 const d=defaultAvatar(entry?.name);return `<span class="leaderboard-avatar is-default" style="--avatar-color:${d.color}" aria-hidden="true">${esc(d.initial)}</span>`;
}
/* E380 layout (references: podium-first leaderboards on Dribbble): a stage with the top three on medal blocks, then
   ruled rows under column headings; hot words use the same stage, 4–10 as one column of honour rows (no orphan
   card), 11–50 as a compact two-column index. */
const EXTRA={
 zh:{eyebrow:'读者 · 每周更新',colRank:'名次',colReader:'读者',colTerm:'词条',colWhy:'为什么是它',honours:'4 – 10 名',rest:'11 – 50 名',myRank:'我的名次',myPage:'我的主页',circleTitle:'本周众人汇聚的魔力',circleSub:'{n} 位读者在此共鸣',featureTitle:'被阅读最多的作品',featureSub:'{n} 位读者一起读过 · 累计',wordTitle:'本周最多人查的词',wordSub:'{n} 位读者查过 · 点击查词',meTag:'吾',signIn:'注册 / 登录',follow:'关注',vacant:'虚位以待',followSub:'关注的人和同好',changeAvatar:'换头像',editProfile:'编辑个人主页',uploading:'上传并审核中…'},
 ja:{eyebrow:'読者 · 毎週更新',colRank:'順位',colReader:'読者',colTerm:'語',colWhy:'なぜこの語？',honours:'4 – 10 位',rest:'11 – 50 位',myRank:'自分の順位',myPage:'マイページ',circleTitle:'みんなで集めた魔力',circleSub:'{n} 人の読者が共鳴中',featureTitle:'いちばん読まれた作品',featureSub:'{n} 人の読者が読みました · 累計',wordTitle:'今週いちばん調べられた語',wordSub:'{n} 人が調べました · クリックで辞書へ',meTag:'我',signIn:'登録 / ログイン',follow:'フォロー',vacant:'空席',followSub:'フォロー中の人と同好',changeAvatar:'アイコンを変更',editProfile:'プロフィールを編集',uploading:'アップロードして審査中…'},
 en:{eyebrow:'Readers · updated weekly',colRank:'Rank',colReader:'Reader',colTerm:'Term',colWhy:'Why this one',honours:'Ranks 4 – 10',rest:'Ranks 11 – 50',myRank:'My rank',myPage:'My profile',circleTitle:'Mana gathered together',circleSub:'{n} readers in resonance',featureTitle:'The most-read work',featureSub:'Read by {n} readers · all time',wordTitle:'Most looked-up word this week',wordSub:'Looked up by {n} readers · click to look it up',meTag:'You',signIn:'Sign up / sign in',follow:'Following',vacant:'Open spot',followSub:'People you follow and kindred readers',changeAvatar:'Change picture',editProfile:'Edit profile',uploading:'Uploading and checking…'}
};
const words=locale=>({...leaderboardWords(locale),...(EXTRA[locale]||EXTRA.zh),forum:forumWords(locale).forum});
function segmented(name,items,current,w){return `<div class="lb-seg" role="group" data-lb-group="${name}">${items.map(item=>`<button type="button" data-lb-${name}="${item}" aria-pressed="${item===current}">${w[item]}</button>`).join('')}</div>`;}
function underline(name,items,current,w){return `<div class="lb-tabs" role="group" data-lb-group="${name}">${items.map(item=>`<button type="button" data-lb-${name}="${item}" aria-pressed="${item===current}">${w[item]}</button>`).join('')}</div>`;}
/* E417 the place number on the block: a plain serif numeral with a short rule under it, no wreath (the old SVG wreath
   was round and jagged at small sizes) */
function laurel(rank){return `<span class="lb-laurel" aria-hidden="true"><b>${rank}</b><i></i></span>`;}
/* E402 an empty podium place keeps its stand (dashed, "虚位以待") so the stage stays centred and complete */
function vacantPlace(place,w){return `<div class="lb-place is-vacant" role="listitem" data-rank="${place}" aria-label="${w.vacant}"><div class="lb-who"><span class="lb-ring is-vacant"><span class="leaderboard-avatar is-vacant" aria-hidden="true">?</span></span><span class="lb-name">${w.vacant}</span></div><div class="lb-block is-vacant">${laurel(place)}</div></div>`;}
/* E402 one empty-state look for every tab: small emblem, a line, an optional hint, centred */
const EMBLEM={empty:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 12h20a6 6 0 0 1 6 6v20H16a6 6 0 0 1-6-6z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 20h14M16 26h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M36 10l1.2 2.6L40 14l-2.8 1.4L36 18l-1.2-2.6L32 14l2.8-1.4z" fill="currentColor"/></svg>',
 pending:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M24 16v9l6 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
 people:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="19" cy="18" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 38c1.5-7 6-10 11-10s9.5 3 11 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M31 13a5 5 0 0 1 0 10M34 29c3 1.5 5 4.5 6 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'};
export function emptyState(kind,title,hint=''){return `<div class="lb-empty-state"><span class="lb-empty-emblem">${EMBLEM[kind]||EMBLEM.empty}</span><p class="lb-empty-title">${title}</p>${hint?`<p class="lb-empty-hint">${hint}</p>`:''}</div>`;}
const crown='<svg class="lb-crown\" viewBox="0 0 32 20" aria-hidden="true"><path d="M2 18 4 5l7 6 5-9 5 9 7-6 2 13z"/></svg>';
const MEDAL={1:'gold',2:'silver',3:'bronze'};
function localHTML(data,w,locale,esc){
 const stats=data.local?.stats?.[view.period]||{};
 return `<section class="lb-mine"><h2 class="lb-h2">${w.mine} <span>· ${w[view.period]}</span></h2><div class="lb-tiles">${[['seconds',stats.seconds],['characters',stats.characters],['words',stats.words],['totalWords',data.local?.totals?.words,'words'],['reviews',stats.reviews],['kana',stats.kana],['streak',stats.streak],['currentStreak',data.local?.currentStreak,'streak']].map(([key,value,unit])=>`<div class="lb-tile"><small>${w[key]}</small><strong>${esc(formatValue(unit||key,value,locale))}</strong></div>`).join('')}</div></div></section>`;
}
const flag='<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14"><path d="M6 21V4m0 0h10l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const reportButton=(e,w,esc)=>e.avatar&&!e.me?`<button type="button" class="leaderboard-report" data-lb-report="${esc(e.avatar)}" title="${w.report}" aria-label="${w.report}">${flag}</button>`:'';
/* E419 readers as equals: no podium, no rank ladder. A magic circle shows what everyone gathered together, then one
   grimoire card per reader, all the same size; the order is kept but the number is only a small sigil code. */
const SIGIL=(()=>{const c=100,pt=(r,a)=>`${(c+r*Math.cos(a)).toFixed(1)},${(c+r*Math.sin(a)).toFixed(1)}`;
 const tri=o=>`<polygon points="${[0,1,2].map(k=>pt(62,o+k*2*Math.PI/3)).join(' ')}"/>`;
 const ticks=Array.from({length:36},(_,k)=>{const a=k*Math.PI/18;return `<line x1="${pt(84,a).split(',')[0]}" y1="${pt(84,a).split(',')[1]}" x2="${pt(k%3?88:92,a).split(',')[0]}" y2="${pt(k%3?88:92,a).split(',')[1]}"/>`;}).join('');
 return `<svg class="lb-sigil" viewBox="0 0 200 200" aria-hidden="true"><g class="lb-sigil-spin"><circle cx="100" cy="100" r="94"/><circle cx="100" cy="100" r="84"/>${ticks}</g><g class="lb-sigil-spin is-back">${tri(-Math.PI/2)}${tri(Math.PI/2)}<circle cx="100" cy="100" r="62"/><circle cx="100" cy="100" r="31"/></g></svg>`;})();
/* E420 the head of the board: 阅读时长 / 阅读字数 show the most-read work (cover, title, total); 新收录单词 shows only
   the week's top word, a button into the dictionary; the other metrics keep the magic circle with everyone's total */
function headHTML(entries,metric,w,locale,esc,board){
 const f=board?.feature,word=board?.word;
 if(f?.cover&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(f.cover))stageCover=f.cover;
 if((metric==='seconds'||metric==='characters')&&f)return `<section class="lb-circle is-feature"><div class="lb-cover tv-card tv-holo"><div class="tv-face">${f.cover?`<img src="${esc(f.cover)}" alt="">`:`<span class="lb-cover-blank">${esc([...f.title][0]||'?')}</span>`}<i class="tv-foil"></i><i class="tv-glare"></i></div></div><div class="lb-circle-text"><small>${w.featureTitle}</small><h3 class="lb-feature-title" lang="ja">${esc(f.title)}</h3><strong>${esc(formatValue(metric,f.value,locale))}</strong><span>${esc(fill(w.featureSub,{n:f.readers}))}</span></div></section>`;
 if(metric==='words'&&word)return `<section class="lb-circle is-word"><button type="button" class="lb-word" data-lb-lookup="${esc(word.term)}" lang="ja" title="${esc(w.wordTitle+' · '+fill(w.wordSub,{n:word.users}))}">${esc(word.term)}</button></section>`;
 const total=entries.reduce((n,e)=>n+(Number(e.value)||0),0);
 return `<section class="lb-circle"><div class="lb-circle-sigil">${SIGIL}</div><div class="lb-circle-text"><small>${w.circleTitle}</small><strong>${esc(formatValue(metric,total,locale))}</strong><span>${esc(fill(w.circleSub,{n:entries.length}))}</span></div></section>`;
}
function circleHTML(entries,metric,w,locale,esc,images,board){
 const code=n=>'No.'+String(n).padStart(2,'0');
 return `${headHTML(entries,metric,w,locale,esc,board)}
 <ol class="lb-grimoires" role="list">${entries.map((e,i)=>`<li class="lb-grimoire${e.me?' is-me':''}" style="--i:${i}">${e.me?`<em class="lb-me-tag">${w.meTag}</em>`:''}<span class="lb-code">${code(e.rank)}</span>${personButton(e,`<span class="lb-gem">${avatarHTML(e,images,esc)}</span><span class="lb-gname">${esc(e.name)}</span>${rankTag(e,esc)}`,esc)}<strong class="lb-gvalue">${esc(formatValue(metric,e.value,locale))}</strong>${reportButton(e,w,esc)}</li>`).join('')}</ol>`;
}
export function boardHTML(data,w,locale,esc){
 w={...words(locale),...w};
 const board=data.board||{},images=data.avatars||{};
 if(board.state==='error')return `<div class="leaderboard-offline"><p>${w.offline}</p><button type="button" class="primary" data-lb-retry>${w.retry}</button></div>`;
 if(view.metric==='games'&&!view.game){const games=board.games||[];if(!games.length)return `<p class="lb-empty">${w.empty}</p>`;
  return `<ol class="leaderboard-list leaderboard-games lb-rows">${games.map(g=>`<li><button type="button" data-lb-game="${esc(g.title)}"><span class="leaderboard-name">${esc(g.title)}</span><small>${esc(fill(w.readers,{n:g.readers}))}${g.top?` · ${w.top} ${esc(g.top.name)}`:''}</small></button></li>`).join('')}</ol>`;}
 const metric=view.metric==='games'?'characters':view.metric,entries=board.entries||[];
 if(!entries.length)return (view.game?`<button type="button" class="leaderboard-back" data-lb-back>‹ ${w.back}</button>`:'')+`<p class="lb-empty">${w.empty}</p>`;
 const top=entries.slice(0,3),rest=entries.slice(3);
 return (view.game?`<button type="button" class="leaderboard-back" data-lb-back>‹ ${w.back}</button><h3 class="leaderboard-game-title">${esc(view.game)}</h3>`:'')+circleHTML(entries,metric,w,locale,esc,images,board);
}
/* ---- 每周热词 ------------------------------------------------------------------------------------------------- */
/* Pure split used by the page and the tests: podium 1–3, cards 4–10, list 11–50. */
export function splitAwards(awards){const sorted=[...(awards||[])].sort((a,b)=>a.rank-b.rank);return {podium:sorted.filter(a=>a.rank<=3),cards:sorted.filter(a=>a.rank>=4&&a.rank<=10),list:sorted.filter(a=>a.rank>=11&&a.rank<=50)};}
export function hotHTML(hot,w,locale,esc){
 w={...words(locale),...w};
 if(!hot||hot.state==='error')return `<div class="leaderboard-offline"><p>${w.offline}</p><button type="button" class="primary" data-lb-retry>${w.retry}</button></div>`;
 const n=v=>nf(locale).format(v||0);
 if(!hot.settled||!hot.awards?.length)return emptyState(hot.settled?'empty':'pending',hot.settled?w.hotEmpty:w.hotPending,w.hotRule);
 const {podium,cards,list}=splitAwards(hot.awards);
 const order=[2,1,3].map(r=>podium.find(a=>a.rank===r)||{rank:r,vacant:true});
 const reason=a=>a.reason?`<p class="leaderboard-reason">${a.ai?`<span class="leaderboard-ai">${w.aiGuess}</span>`:''}${esc(a.reason)}</p>`:'';
 const meta=a=>esc(fill(w.lookedUp,{users:n(a.users),n:n(a.lookups)}));
 return `<p class="lb-note">${esc(fill(w.weekOf,{week:hot.week}))} · ${esc(fill(w.participants,{n:n(hot.participants)}))} · ${w.hotRule}</p>
  <div class="lb-stage leaderboard-podium is-terms" role="list">${order.map(a=>a.vacant?vacantPlace(a.rank,w):`<div class="lb-place podium-place medal-${MEDAL[a.rank]}" role="listitem" data-rank="${a.rank}" style="--delay:${({1:2,2:1,3:0})[a.rank]*140}ms"><div class="lb-who">${a.rank===1?crown:''}<span class="lb-term" lang="ja">${esc(a.term)}</span><span class="lb-score">${meta(a)}</span>${reason(a)}</div><div class="lb-block">${laurel(a.rank)}</div></div>`).join('')}</div>
  ${cards.length?`<section class="lb-section"><h3 class="lb-h3">${w.honours}</h3><ol class="leaderboard-cards lb-honours">${cards.map(a=>`<li class="leaderboard-card"><span class="leaderboard-rank">${a.rank}</span><div class="lb-honour-term"><strong lang="ja">${esc(a.term)}</strong><small>${meta(a)}</small></div>${reason(a)||'<span></span>'}</li>`).join('')}</ol></section>`:''}
  ${list.length?`<section class="lb-section"><h3 class="lb-h3">${w.rest}</h3><ol class="leaderboard-list leaderboard-hot-list" style="--rows:${Math.ceil(list.length/2)}">${list.map(a=>`<li><span class="leaderboard-rank">${a.rank}</span><span class="leaderboard-name" lang="ja">${esc(a.term)}</span><strong>${esc(fill(w.times,{n:n(a.lookups)}))}</strong></li>`).join('')}</ol></section>`:''}`;
}
/* E385 joining goes through the email login (one row per account, not per PC). Not signed in: step 1 only, the
   shared email + code form from account-ui.js; signed in: step 2, nickname + consent. */
function joinHTML(data,w,esc){
 const head=`<section class="lb-card leaderboard-join"><h2 class="lb-h2">${w.joinTitle}</h2><p class="lb-note">${w.joinText}</p>`;
 if(!data.account)return `${head}<h3 class="lb-h3 lb-step">${w.loginStep}</h3><p class="lb-note">${w.loginText}</p><div class="lb-login" data-lb-login></div></section>`;
 return `${head}<h3 class="lb-h3 lb-step">${w.joinStep}</h3>
  <label class="leaderboard-field"><span>${w.nickname}</span><input type="text" maxlength="16" data-lb-name value="${esc(data.name||'')}" placeholder="${w.nicknameHint}" autocomplete="off" spellcheck="false"></label>
  <label class="leaderboard-check"><input type="checkbox" class="switch" data-lb-share ${data.shareGames?'checked':''}><span>${w.shareGames}</span></label>
  <label class="leaderboard-check"><input type="checkbox" class="switch" data-lb-consent><span>${w.consent}</span></label>
  <p class="leaderboard-error" data-lb-error hidden></p><button type="button" class="primary" data-lb-join>${w.join}</button></section>`;
}
/* E393 no page title: the top bar already says 排行榜 (rule: never repeat a first-level menu item on its page); only my rank chip stays */
/* E402 every tab draws the same two rows, so switching tabs or loading never moves them:
   1. top row: the 阅读榜 / 每周热词 / 关注 switch, and on the right 我的名次 (only on 阅读榜; the row keeps its height)
   2. sub row: 阅读榜 = metric tabs + period, 每周热词 = category + past weeks, 关注 = a caption
   The body below fades in. */
function hero(){return '';}
function topRow(w,tab,chip=''){return `<div class="lb-toprow">${segmented('tab',['board','hot','follow','forum'],tab,w)}<div class="lb-toprow-end">${chip}</div></div>`;}
function subRow(inner){return `<div class="lb-subrow">${inner}</div>`;}
function hotControls(hot,w,esc){const weeks=hot?.weeks||[];const picker=weeks.length>1?`<label class="lb-week"><span>${w.pastWeeks}</span><select data-lb-week>${weeks.map(k=>`<option value="${esc(k)}" ${k===hot.week?'selected':''}>${esc(fill(w.weekOf,{week:k}))}</option>`).join('')}</select></label>`:'';return `${segmented('category',CATS,view.category,w)}${picker}`;}
function boardControls(w){return `${underline('metric',METRICS,view.metric,w)}${segmented('period',PERIODS,view.period,w)}`;}
/* E457 the stage of the home / game detail: blurred cover of the most-read work behind everything, a big outline glyph,
   crop marks at the window corners (styles in web/detail-tv.css, layout in web/leaderboard.css) */
let stageCover='';
const stage=()=>`<div class="dtv-bg lb-backdrop" aria-hidden="true" style="--dtv-cover:${stageCover?`url(&quot;${stageCover}&quot;)`:'none'}"><i class="dtv-glyph">読</i></div><div class="dtv-marks" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
function page(top,sub,body){return `${stage()}<div class="leaderboard-page">${top}${subRow(sub)}<div class="lb-body">${body}</div></div>`;}
/* E388 your own avatar is the way to change it: click → pick → crop window → upload. */
/* E404 the 我的主页 chip, on every tab: your picture and name (or 注册 / 登录 when signed out); on 阅读榜 with a rank it
   also shows the rank and value. The whole chip opens the 个人主页 panel. Same two-line height in every state. */
function myChip(data,w,locale,esc){
 const me=view.tab==='board'||data.tab==='board'?data.board?.me:null,ranked=!!(data.joined&&me&&data.tab!=='hot'&&data.tab!=='follow');
 const metric=view.metric==='games'?'characters':view.metric,self={name:data.name||'?',avatar:data.self?.avatar||null};
 const line=ranked?esc(data.name||w.myPage):data.joined||data.account?esc(data.name||w.myPage):w.signIn;
 return `<button type="button" class="lb-mychip" data-lb-me aria-label="${esc(w.myPage)}">${avatarHTML(self,data.avatars||{},esc)}<div><small>${w.myPage}</small><strong>${line}</strong></div>${ranked?`<span>${esc(formatValue(metric,me.value,locale))}</span>`:''}</button>`;
}
export function leaderboardHTML(data,locale,esc){
 const w=words(locale);
 /* E393/E402 loading: the same rows as the tab being loaded, with a spinner in the body */
 if(!data){const tab=view.tab||'board';return page(topRow(w,tab),tab==='board'?boardControls(w):tab==='hot'?hotControls(null,w,esc):tab==='forum'?forumSubRow(locale,esc):`<p class="lb-subrow-caption">${w.followSub}</p>`,'<div class="lb-loading"><span class="spinner"></span></div>');}
 if(!data.configured)return page(topRow(w,'board',myChip(data,w,locale,esc)),segmented('period',PERIODS,view.period,w),`<section class="lb-card leaderboard-notice"><h2 class="lb-h2">${w.notReady}</h2><p class="lb-note">${w.notReadyText}</p></section>${localHTML(data,w,locale,esc)}`);
 const tab=['hot','follow'].includes(data.tab)?data.tab:'board';
 /* E397 关注: people you follow, then 同好 */
 if(tab==='follow')return page(topRow(w,tab,myChip(data,w,locale,esc)),`<p class="lb-subrow-caption">${w.followSub}</p>`,socialHTML(data.social,locale,esc,avatarHTML));
 if(tab==='hot')return page(topRow(w,tab,myChip(data,w,locale,esc)),hotControls(data.hot,w,esc),`<section class="lb-card leaderboard-hot"><div class="lb-card-head"><h2 class="lb-h2">${w.hot} <span>· ${w[view.category]}</span></h2></div>${hotHTML(data.hot,w,locale,esc)}</section>`);
 const body=data.joined?`<section class="lb-card leaderboard-board"><div class="lb-card-head"><h2 class="lb-h2">${w[view.metric]} <span>· ${view.metric==='games'?w.all:w[view.period]}</span></h2><small>${esc(fill(w.joinedAs,{name:data.name}))} · <button type="button" class="leaderboard-leave" data-lb-profile>${w.editProfile}</button></small></div>${boardHTML(data,w,locale,esc)}</section>`:joinHTML(data,w,esc);
 return page(topRow(w,tab,myChip(data,w,locale,esc)),boardControls(w),body+localHTML(data,w,locale,esc));
}
/* Mounts the page into main; isCurrent() guards against a late reply after the user moved on. */
/* 2026-11-12 (user video: every switch of 阅读榜 / 每周热词 / 关注 / 交流 and of the metric tabs waited about a second and
   the page blinked). The cache now outlives the page, so coming back paints at once; after a paint the other tabs, the
   other metrics and the other periods are fetched quietly one by one; a repaint keeps the top row and, when it did not
   change, the sub row in place and crossfades only the body. */
const viewCache=new Map(),inflight=new Map(),FRESH_MS=60000;
export async function mountLeaderboard(main,{api,locale,esc,toast,isCurrent=()=>true,openSettings=()=>{},lookup=null}){
 const w=leaderboardWords(locale);
 let last=null;
 /* E457 switching was slow: every click waited for the relay (and the local stats, avatars, cover) before
    anything changed. Now each view is cached by its key: a cached view paints at once, then is refreshed in the
    background and repainted only if it changed; an uncached one marks the new switch at once and dims the body. After
    the first paint the other metrics of the same period are fetched quietly so the next switches are instant. */
 const cache={get:key=>viewCache.get(key)?.json,set:(key,json)=>viewCache.set(key,{json,at:Date.now()}),has:key=>Date.now()-(viewCache.get(key)?.at||0)<FRESH_MS,clear:()=>viewCache.clear()};
 /* 每周热词 does not depend on the period or metric, 关注 on nothing: one cache entry each */
 const keyOf=(v=view)=>(v.tab==='hot'?[v.tab,v.category,v.week]:v.tab==='follow'?[v.tab]:[v.tab,v.period,v.metric,v.game]).join('|');
 const args=(v=view)=>({tab:v.tab,period:v.period,metric:v.metric,game:v.game,category:v.category,week:v.week});
 let seq=0,painted=false;
 const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 /* repaint in place: the top row stays, the sub row is swapped only when it changed, the body crossfades */
 const soft=html=>{
  const page=main.querySelector(':scope>.leaderboard-page');if(!page)return false;
  const tpl=document.createElement('template');tpl.innerHTML=html;
  const kids=[...tpl.content.children],next=kids.find(el=>el.classList.contains('leaderboard-page')),bg=kids.find(el=>el.classList.contains('dtv-bg')),oldBg=main.querySelector(':scope>.dtv-bg');
  if(!next)return false;
  const part=sel=>[page.querySelector(':scope>'+sel),next.querySelector(':scope>'+sel)];
  const [topOld,topNew]=part('.lb-toprow'),[subOld,subNew]=part('.lb-subrow'),[bodyOld,bodyNew]=part('.lb-body');
  if(!topOld||!topNew||!subOld||!subNew||!bodyOld||!bodyNew)return false;
  if(bg&&oldBg&&bg.getAttribute('style')!==oldBg.getAttribute('style'))oldBg.replaceWith(bg);
  topNew.querySelectorAll('[aria-pressed]').forEach(nb=>{const k=[...nb.attributes].find(a=>a.name.startsWith('data-lb-'));const ob=k&&topOld.querySelector(`[${k.name}="${CSS.escape(k.value)}"]`);if(ob)ob.setAttribute('aria-pressed',nb.getAttribute('aria-pressed'));});
  const endOld=topOld.querySelector('.lb-toprow-end'),endNew=topNew.querySelector('.lb-toprow-end');
  if(endOld&&endNew&&endNew.innerHTML.trim()&&endOld.innerHTML!==endNew.innerHTML)endOld.replaceWith(endNew);
  if(subOld.innerHTML!==subNew.innerHTML)subOld.replaceWith(subNew);
  if(bodyOld.innerHTML===bodyNew.innerHTML)return true;
  if(calm()){bodyOld.replaceWith(bodyNew);return true;}
  /* the old body fades out on top while the new one rises in under it */
  const pr=page.getBoundingClientRect(),br=bodyOld.getBoundingClientRect();
  if(getComputedStyle(page).position==='static')page.style.position='relative';
  bodyOld.classList.remove('is-loading');bodyOld.inert=true;bodyOld.setAttribute('aria-hidden','true');
  Object.assign(bodyOld.style,{position:'absolute',left:(br.left-pr.left)+'px',top:(br.top-pr.top)+'px',width:br.width+'px',margin:'0',pointerEvents:'none',zIndex:'1'});
  bodyOld.before(bodyNew);
  bodyOld.animate([{opacity:1},{opacity:0}],{duration:150,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}).finished.then(()=>bodyOld.remove(),()=>bodyOld.remove());
  bodyNew.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:240,delay:60,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
  return true;
 };
 const paint=data=>{last=data;const y=main.scrollTop,html=leaderboardHTML(data,locale,esc);
  if(!soft(html))main.innerHTML=html;
  main.dataset.lbTab=view.tab;main.classList.toggle('lb-instant',painted);painted=true;main.scrollTop=y;bind();main.querySelectorAll('.lb-cover.tv-holo').forEach(cardify);};
 /* quiet prefetch, two requests at a time: the other tabs first, then the other metrics, then the other periods */
 /* one request per view at a time: a click on a view that is being prefetched waits for that request */
 const load=(v=view)=>{const k=keyOf(v);let p=inflight.get(k);if(!p){p=api('leaderboard_view',args(v)).finally(()=>inflight.delete(k));inflight.set(k,p);}return p;};
 let prefetching=0;
 const prefetch=()=>{if(view.game)return;const base={...view,game:''},token=++prefetching;
  const views=[{...base,tab:'board'},{...base,tab:'hot'},{...base,tab:'follow'},...METRICS.map(m=>({...base,tab:'board',metric:m})),...PERIODS.map(p=>({...base,tab:'board',period:p}))];
  const seen=new Set([keyOf()]),queue=views.filter(v=>{const k=keyOf(v);if(seen.has(k)||cache.has(k))return false;seen.add(k);return true;});
  const next=()=>{const v=queue.shift();if(!v||token!==prefetching||!isCurrent())return;load(v).then(d=>{if(!cache.has(keyOf(v)))cache.set(keyOf(v),JSON.stringify(d));}).catch(()=>{}).finally(()=>setTimeout(next,120));};
  setTimeout(next,300);setTimeout(next,450);};
 /* #117 交流 owns the sub row and body; the top row (and its switch) stay the same */
 const forum=async()=>{const w2=words(locale),html=page(topRow(w2,'forum',last?myChip(last,w2,locale,esc):''),forumSubRow(locale,esc),'<div class="lb-loading"><span class="spinner"></span></div>');if(!soft(html))main.innerHTML=html;main.dataset.lbTab='forum';main.classList.add('lb-instant');painted=true;bind();
  await mountForum(main.querySelector('.leaderboard-page'),{api,locale,esc,toast,isCurrent:()=>isCurrent()&&view.tab==='forum',avatarHTML,person:personButton,emptyState,
   bindPeople:(el,images)=>bindSocial(el,{api,locale,esc,toast,images:()=>images,avatarHTML,openSettings:section=>section==='personal'?openProfilePanel({api,locale,esc,toast,openSettings}):openSettings(section),rerender:()=>{}})});};
 const render=async(action='leaderboard_view',extra={})=>{
  if(view.tab==='forum'&&action==='leaderboard_view'){seq++;return forum();}
  const plain=action==='leaderboard_view'&&!Object.keys(extra).length,key=keyOf(),mine=++seq,hit=plain?cache.get(key):null;
  if(hit)paint(JSON.parse(hit));
  /* another tab with nothing cached yet: its own sub row and a spinner at once (the chip stays), not the old tab dimmed */
  else if(plain&&main.dataset.lbTab&&main.dataset.lbTab!==view.tab&&soft(leaderboardHTML(null,locale,esc))){main.dataset.lbTab=view.tab;bind();}
  else main.querySelector('.lb-body')?.classList.add('is-loading');
  let data;try{data=await(plain?load():api(action,{...args(),...extra}));}
  catch(error){if(!isCurrent()||mine!==seq)return;main.querySelector('.lb-body')?.classList.remove('is-loading');if(hit)return;const code=String(error?.message||error).replace(/^LEADERBOARD_/,'');const box=main.querySelector('[data-lb-error]');if(box&&w[code]){box.textContent=w[code];box.hidden=false;return;}toast(w.offline);return;}
  if(!isCurrent()||mine!==seq)return;
  const json=JSON.stringify(data);if(plain||action==='leaderboard_view')cache.set(key,json);else cache.clear();
  if(json!==hit)paint(data);
  if(plain)prefetch();
 };
 /* marks the pressed switch before the data arrives */
 const press=(attr,value)=>main.querySelectorAll(`[data-lb-${attr}]`).forEach(x=>x.setAttribute('aria-pressed',String(x.dataset['lb'+attr[0].toUpperCase()+attr.slice(1)]===value)));
 const bind=()=>{
  main.querySelectorAll('[data-lb-tab]').forEach(b=>b.onclick=()=>{view.tab=b.dataset.lbTab;press('tab',view.tab);render();});
  main.querySelectorAll('[data-lb-period]').forEach(b=>b.onclick=()=>{view.period=b.dataset.lbPeriod;press('period',view.period);render();});
  main.querySelectorAll('[data-lb-metric]').forEach(b=>b.onclick=()=>{view.metric=b.dataset.lbMetric;view.game='';press('metric',view.metric);render();});
  main.querySelectorAll('[data-lb-category]').forEach(b=>b.onclick=()=>{view.category=b.dataset.lbCategory;press('category',view.category);render();});
  {const week=main.querySelector('[data-lb-week]');if(week)week.onchange=event=>{view.week=event.currentTarget.value;render();};}
  main.querySelectorAll('[data-lb-game]').forEach(b=>b.onclick=()=>{view.game=b.dataset.lbGame;render();});
  main.querySelectorAll('[data-lb-report]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api('leaderboard_report',{avatar:b.dataset.lbReport});toast(r?.hidden?w.reportHidden:w.reported);}catch{toast(w.offline);b.disabled=false;}});
  main.querySelectorAll('[data-lb-avatar]').forEach(b=>b.onclick=async()=>{const buttons=[...main.querySelectorAll('[data-lb-avatar]')];
   const r=await changeAvatar({api,locale,toast,onBusy:busy=>{buttons.forEach(x=>{x.disabled=busy;x.classList.toggle('is-busy',busy);});if(busy)toast(words(locale).uploading);}});if(r&&isCurrent())render();});
  main.querySelector('[data-lb-back]')?.addEventListener('click',()=>{view.game='';render();});
  main.querySelector('[data-lb-retry]')?.addEventListener('click',()=>render());
  const login=main.querySelector('[data-lb-login]');if(login)mountEmailLogin(login,{api,locale,esc,toast,onDone:()=>render()});
  main.querySelector('[data-lb-join]')?.addEventListener('click',()=>{const box=main.querySelector('[data-lb-error]');box.hidden=true;
   if(!main.querySelector('[data-lb-consent]').checked){box.textContent=w.CONSENT_REQUIRED;box.hidden=false;return;}
   render('leaderboard_join',{name:main.querySelector('[data-lb-name]').value,shareGames:main.querySelector('[data-lb-share]').checked,consent:true});});
  /* E394 leaving, nickname and sharing moved to Settings → 个人主页 */
  /* E404 the chip and every 编辑个人主页 open the 个人主页 panel; closing it refreshes the page */
  const openProfile=()=>openProfilePanel({api,locale,esc,toast,openSettings,onClose:()=>{if(isCurrent())render();}});
  main.querySelectorAll('[data-lb-me],[data-lb-profile]').forEach(b=>b.addEventListener('click',openProfile));
  main.querySelectorAll('[data-lb-lookup]').forEach(b=>b.addEventListener('click',()=>lookup?.(b.dataset.lbLookup)));
  bindSocial(main,{api,locale,esc,toast,images:()=>({...(last?.avatars||{}),...(last?.social?.avatars||{})}),avatarHTML,openSettings:section=>section==='personal'?openProfile():openSettings(section),rerender:()=>{if(isCurrent())render();}});
 };
 main.innerHTML=leaderboardHTML(null,locale,esc);
 await render();
}
