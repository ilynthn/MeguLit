// SPDX-License-Identifier: GPL-3.0-or-later
/* 学习 → 句子 (2026-11-13 user layout: 先像这样展示最近的一个最顶的和cg，然后下面可以左右拖动，上限30句都是最近收录的，然后往下滑就是作品书架，
   点进去就做个过渡动画到作品详情的收录句子).
   1. hero: the newest saved line set huge (the game detail's "Grail 巨字台词" look) with its scene frame beside it. The only pictures are
      sentence.scene (dialogue-free frames, read through sentence_scene); never covers, never a frame with a dialogue box. No scene = type only.
   2. a draggable collage of the 15 newest lines across all games, each line two cards (its scene as a polaroid + the line; no scene = the line only) (pointer drag with inertia, shift-wheel, arrow keys, arrows + progress).
   3. 作品书架: every game with saved lines; a cover flies into the detail page's cover and the page opens on 收录句子.
   4. 全部句子: the old page's filter (all / manual / auto), search, the words added from each line, play, remove, open the game.
   focusSentence(text) from the words page puts that line in the hero. Motion: GSAP on transform / opacity, one context per mount,
   reverted when the page goes away; reduced motion or no GSAP = the same page without movement. */
import {loadGsap} from './gsap-loader.js';
import {inspectPhoto,closeInspect} from './photo-inspect.js';
const L={
 zh:{all:'全部',manual:'手动收藏',auto:'加卡时自动留下',autoTag:'加卡时留下',words:'从这句加过的词',lookup:'查词：',none:'这个筛选下还没有句子',howManual:'在游戏里点一个词，或在台词上拖选一段文字，查词卡底部的「☆ 收藏句子」会把这一整句和译文存到这里',remove:'取消收藏',confirm:'确认取消',play:'播放（有游戏原声时播原声）',playShort:'朗读',missing:'这句还没有收藏到句子页（这个词是在句子收藏功能之前加的）',game:'打开作品',
  lede:'你最近收下的一句',ledeOther:'收下的台词',noTr:'没有保存译文',recent:'最近收录',recentSub:n=>`最近的 ${n} 句 · 拖动或用 ← → 浏览，点一张换到上面，双击照片放大`,current:'正在看',enlarge:'放大查看这张场景图',inspect:'滚轮缩放 · 拖动平移 · 双击复原 · Esc 关闭',close:'关闭',shelf:'作品书架',shelfSub:n=>`${n} 部作品 · 点开进入这部作品的收录句子`,lines:n=>`${n} 句`,latest:'最近',
  list:'全部句子',search:'搜索原文、译文或作品',prev:'上一组',next:'下一组',noQ:q=>`没有找到「${q}」`,today:'今天',yesterday:'昨天',unknownGame:'未关联作品'},
 ja:{all:'すべて',manual:'手動で保存',auto:'カード追加時に自動保存',autoTag:'カード追加時',words:'この文から追加した語',lookup:'辞書で調べる：',none:'この条件の文はまだありません',howManual:'ゲーム中に語をクリックするか台詞をドラッグで選ぶと、辞書カードの下に「☆ 文を保存」があります。押すと一文と訳文がここに保存されます',remove:'保存を解除',confirm:'解除を確定',play:'再生（ゲーム音声があれば原音）',playShort:'読み上げ',missing:'この文はまだ保存されていません（文の保存機能より前に追加した語です）',game:'作品を開く',
  lede:'最近保存した一文',ledeOther:'保存した台詞',noTr:'訳文は保存されていません',recent:'最近の保存',recentSub:n=>`最新 ${n} 文 · ドラッグか ← → で移動、クリックで上に表示、写真はダブルクリックで拡大`,current:'表示中',enlarge:'この場面を拡大して見る',inspect:'ホイールで拡大 · ドラッグで移動 · ダブルクリックで戻す · Esc で閉じる',close:'閉じる',shelf:'作品の本棚',shelfSub:n=>`${n} 作品 · 開くとその作品の保存した例文へ`,lines:n=>`${n} 文`,latest:'最新',
  list:'すべての文',search:'原文・訳文・作品で検索',prev:'前へ',next:'次へ',noQ:q=>`「${q}」は見つかりません`,today:'今日',yesterday:'昨日',unknownGame:'作品なし'},
 en:{all:'All',manual:'Saved by hand',auto:'Kept when adding cards',autoTag:'From a card',words:'Words added from this line',lookup:'Look up: ',none:'No sentences for this filter yet',howManual:'Click a word in the game or drag across a line: the lookup card has “☆ Save sentence” at the bottom, which keeps the whole line and its translation here',remove:'Remove',confirm:'Confirm remove',play:'Play (the game voice when there is one)',playShort:'Play',missing:'This line is not in Sentences yet (the word was added before sentence saving existed)',game:'Open the game',
  lede:'The line you saved last',ledeOther:'A saved line',noTr:'No translation saved',recent:'Recently saved',recentSub:n=>`The ${n} newest · drag or use ← → to browse, click one to bring it up, double-click a photo to enlarge it`,current:'Showing',enlarge:'Enlarge this scene',inspect:'Wheel to zoom · drag to pan · double-click to reset · Esc to close',close:'Close',shelf:'Shelf',shelfSub:n=>`${n} games · open one to see its saved sentences`,lines:n=>n===1?'1 line':`${n} lines`,latest:'Latest',
  list:'All sentences',search:'Search lines, translations or games',prev:'Previous',next:'Next',noQ:q=>`Nothing matches “${q}”`,today:'Today',yesterday:'Yesterday',unknownGame:'No game'}
};
let filter='all',focus='',query='';
export function focusSentence(text){focus=String(text||'');filter='all';}

const STRIP_CAP=15;
/* a steady tilt per sentence and side (the collage must not reshuffle on every render) */
const jitter=(id,k)=>{let h=2166136261;for(const c of String(id)+k)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h/4294967296;};
const tilt=(id,k)=>`--rot:${(jitter(id,k)*6-3).toFixed(2)}deg;--dy:${Math.round(jitter(id,k+'y')*24-6)}px`;
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion=()=>!reduced()&&window.gsap?window.gsap:null;
const toMs=ts=>{const n=Number(ts)||0;return n>1e12?n:n*1000;};
const dayKey=ms=>{const d=new Date(ms);return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();};
const loc=locale=>locale==='en'?'en-US':locale==='ja'?'ja-JP':'zh-CN';
function when(ts,locale,s,withTime=true){const ms=toMs(ts);if(!ms)return '';const d=new Date(ms),now=new Date(),hm=d.toLocaleTimeString(loc(locale),{hour:'2-digit',minute:'2-digit',hour12:false});
 const tail=withTime?' '+hm:'';if(dayKey(ms)===dayKey(now.getTime()))return s.today+tail;if(dayKey(ms)===dayKey(now.getTime()-86400000))return s.yesterday+tail;
 return d.toLocaleDateString(loc(locale),{month:locale==='en'?'short':'long',day:'numeric',...(d.getFullYear()!==now.getFullYear()?{year:'numeric'}:{})})+tail;}

/* scene frames: one promise per game + file, kept across mounts */
const SCENES=new Map();
function sceneURL(api,gameId,file){const key=gameId+'|'+file;let p=SCENES.get(key);if(p)return p;
 p=Promise.resolve().then(()=>api('sentence_scene',{id:gameId,file})).then(r=>{if(!r?.data)throw Error('NO_SCENE');return `data:${r.mime||'image/jpeg'};base64,${r.data}`;});
 p.catch(()=>{if(SCENES.get(key)===p)SCENES.delete(key);});SCENES.set(key,p);if(SCENES.size>120)SCENES.delete(SCENES.keys().next().value);return p;}

/* rows for the giant set: close to even length, cut after punctuation where it can, never before a closing mark (same rule as detail-collect) */
const KINSOKU=/^[、。，．！？!?…‥ー)）」』】〕〉》っゃゅょぁぃぅぇぉッャュョァィゥェォ～〜・]/;
function rowsOf(text){const chars=[...text],n=chars.length;if(n<=9||n>150)return [chars.join('')];
 const count=n<=20?2:Math.min(5,Math.max(3,Math.ceil(n/18))),target=n/count,INF=1e9;
 const cut=i=>{const p=chars[i-1],q=chars[i],hi=x=>/[ぁ-ゟ]/.test(x);let c=/[、。，！？!?…」』）)]/.test(p)?-6:hi(q)?3:hi(p)?.5:1.5;if(KINSOKU.test(q))c+=60;return c;};
 const dp=Array.from({length:count+1},()=>new Array(n+1).fill(INF)),from=Array.from({length:count+1},()=>new Array(n+1).fill(-1));dp[0][0]=0;
 for(let k=1;k<=count;k++)for(let i=2*k;i<=n;i++){if(k===count&&i!==n)continue;for(let j=2*(k-1);j<=i-2;j++){if(dp[k-1][j]>=INF)continue;const d=i-j-target,c=dp[k-1][j]+d*d/target+(i<n?cut(i):0);
  if(c<dp[k][i]){dp[k][i]=c;from[k][i]=j;}}}
 if(dp[count][n]>=INF)return [chars.join('')];const cuts=[];for(let k=count,i=n;k>0;k--){cuts.unshift(i);i=from[k][i];}
 const out=[];let a=0;for(const c of cuts){out.push(chars.slice(a,c).join(''));a=c;}return out;}
const INDENT=[[0],[0,18],[0,10,22],[0,12,4,20],[0,12,4,18,8]];
/* where the words added from this line sit in it (the list gives spellings only) */
function rangesOf(text,words){const out=[];for(const w of words||[]){const sp=String(w.spelling||'');if(!sp)continue;const at=text.indexOf(sp);if(at<0)continue;
 const start=[...text.slice(0,at)].length;out.push({start,end:start+[...sp].length});}return out;}
function marked(text,words,esc){const chars=[...String(text||'')],r=rangesOf(String(text||''),words);return chars.map((c,i)=>r.some(h=>i>=h.start&&i<h.end)?`<b>${esc(c)}</b>`:esc(c)).join('').replace(/<\/b><b>/g,'');}

export async function mountSentences(target,{api,locale,esc,toast,errorMessage,empty,emptyLabel,readTime,datetime,icon,isCurrent,rerender,lookup,openGame,games=[],cover}){
 const s=L[locale]||L.zh;
 loadGsap().catch(()=>{});
 const all=await api('sentences');if(!isCurrent())return;
 const want=focus;focus='';
 if(!all.length){target.innerHTML=empty(emptyLabel,'learning');if(want)toast(s.missing);return;}
 try{await Promise.race([loadGsap(),new Promise(r=>setTimeout(r,600))]);}catch{}
 if(!isCurrent())return;
 const gameOf=new Map((games||[]).map(g=>[String(g.id),g])),titleOf=item=>item.title||gameOf.get(String(item.game_id))?.title||'';
 const byId=new Map(all.map(x=>[String(x.id),x]));
 let cur=(want&&all.find(x=>x.text===want))||all[0];
 if(want&&cur.text!==want)toast(s.missing);
 const recent=all.slice(0,STRIP_CAP);
 /* shelf: one entry per game, newest activity first */
 const shelfMap=new Map();for(const x of all){if(!x.game_id)continue;const k=String(x.game_id);let e=shelfMap.get(k);if(!e){e={id:k,title:titleOf(x),count:0,latest:0};shelfMap.set(k,e);}
  e.count++;e.latest=Math.max(e.latest,toMs(x.created_at));}
 const shelf=[...shelfMap.values()].sort((a,b)=>b.latest-a.latest);

 const gsap0=window.gsap,ctx=gsap0&&!reduced()?gsap0.context(()=>{},target):null;const offs=[];let alive=true;
 const main=target.closest('.main')||document.querySelector('#main');
 const watch=main?new MutationObserver(()=>{if(!target.isConnected)stop();}):null;watch?.observe(main,{childList:true,subtree:true});
 function stop(){if(!alive)return;alive=false;watch?.disconnect();offs.splice(0).forEach(f=>{try{f();}catch{}});try{ctx?.revert();}catch{}}
 const add=fn=>ctx?ctx.add(fn):fn();

 const playIc=`<svg class="sp-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor"/></svg>`;
 const arrow=d=>`<svg class="sp-ic" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${d}"/></svg>`;
 const polIn=x=>`<span class="sp-pol-img"><img alt="" draggable="false"></span><span class="sp-pol-cap"><span class="sp-pol-t">${esc(titleOf(x)||s.unknownGame)}</span><time>${esc(when(x.created_at,locale,s,false))}</time></span>`;
 /* one sentence = two cards side by side: its scene as a polaroid (only when it has one) and the line itself */
 const pair=x=>{const auto=(x.source||'manual')==='auto',scene=x.scene?.file&&x.game_id;
  return `<div class="sp-pair${x.id===cur.id?' is-cur':''}" data-sp-pair="${x.id}">`+
  (scene?`<button type="button" class="sp-pol" data-sp-pick="${x.id}" data-scene-game="${esc(String(x.game_id))}" data-scene-file="${esc(x.scene.file)}" style="${tilt(x.id,'p')}" title="${esc(s.enlarge)}">${polIn(x)}</button>`:'')+
  `<button type="button" class="sp-card" data-sp-pick="${x.id}" style="${tilt(x.id,'c')}"><span class="sp-card-k"><span${auto?' class="is-auto"':''}>${esc(auto?s.autoTag:s.manual)}</span><em>${esc(s.current)}</em></span>`+
  `<span class="sp-card-ja" lang="ja">${marked(x.text,x.words,esc)}</span>${x.translation?`<span class="sp-card-zh" lang="${locale==='en'?'en':'zh'}">${esc(x.translation)}</span>`:''}`+
  `<time class="sp-card-t">${esc(when(x.created_at,locale,s,true))}</time></button></div>`;};
 const book=g=>{const gm=gameOf.get(g.id)||{title:g.title};return `<button type="button" class="sp-book" data-sp-game="${esc(g.id)}"><span class="sp-cover">${cover({...gm,title:gm.title||g.title})}</span>`+
  `<span class="sp-book-t">${esc(g.title||gm.title||'')}</span><span class="sp-book-m"><b>${esc(s.lines(g.count))}</b><span>${esc(s.latest)} ${esc(when(g.latest,locale,s,false))}</span></span></button>`;};

 target.innerHTML=`<section class="sp" aria-label="${esc(s.list)}">
  <div class="sp-hero"><div class="sp-hero-in"></div><figure class="sp-cg"><button type="button" class="sp-pol sp-hero-pol" aria-label="${esc(s.enlarge)}" title="${esc(s.enlarge)}"><span class="sp-pol-img"><img alt="" draggable="false"></span><span class="sp-pol-cap"><span class="sp-pol-t"></span><time></time></span></button></figure></div>
  <section class="sp-strip" aria-label="${esc(s.recent)}"><header class="sp-h"><p class="sp-k">${esc(s.recent)}</p><p class="sp-sub">${esc(s.recentSub(recent.length))}</p>
    <div class="sp-nav"><button type="button" class="secondary icon-only" data-sp-step="-1" aria-label="${esc(s.prev)}" title="${esc(s.prev)}">${arrow('M10 3.5L5.5 8l4.5 4.5')}</button><button type="button" class="secondary icon-only" data-sp-step="1" aria-label="${esc(s.next)}" title="${esc(s.next)}">${arrow('M6 3.5L10.5 8 6 12.5')}</button></div></header>
   <div class="sp-viewport" tabindex="0" role="group" aria-label="${esc(s.recent)}"><div class="sp-track">${recent.map(pair).join('')}</div></div>
   <div class="sp-progress" aria-hidden="true"><i></i></div></section>
  ${shelf.length?`<section class="sp-shelf" aria-label="${esc(s.shelf)}"><header class="sp-h"><p class="sp-k">${esc(s.shelf)}</p><p class="sp-sub">${esc(s.shelfSub(shelf.length))}</p></header>
   <div class="sp-books">${shelf.map(book).join('')}</div></section>`:''}
  <section class="sp-all" aria-label="${esc(s.list)}"><header class="sp-h"><p class="sp-k">${esc(s.list)}</p>
    <div class="sentence-filter sp-filter" role="tablist"></div>
    <label class="sp-q"><input type="search" autocomplete="off" spellcheck="false" placeholder="${esc(s.search)}" aria-label="${esc(s.search)}" value="${esc(query)}"></label></header>
   <div class="sp-list"></div></section></section>`;
 const root=target.querySelector('.sp'),hero=root.querySelector('.sp-hero'),heroIn=root.querySelector('.sp-hero-in'),cg=root.querySelector('.sp-cg'),heroPol=cg.querySelector('.sp-pol'),cgImg=cg.querySelector('img');
 const viewport=root.querySelector('.sp-viewport'),track=root.querySelector('.sp-track'),bar=root.querySelector('.sp-progress i'),listEl=root.querySelector('.sp-list'),
  filterEl=root.querySelector('.sp-filter'),input=root.querySelector('.sp-q input');

 /* ---------- hero ---------- */
 function heroHTML(x){const rows=rowsOf(String(x.text||'')),ind=INDENT[Math.min(rows.length,5)-1],r=rangesOf(String(x.text||''),x.words);let at=0;
  const big=rows.map((row,i)=>{const chars=[...row],html=chars.map((c,k)=>`<span class="u${r.some(h=>at+k>=h.start&&at+k<h.end)?' em':''}">${esc(c)}</span>`).join('');at+=chars.length;
   return `<span class="sp-row" style="--ind:${ind[i]??0}%"><span class="sp-mask">${html}</span></span>`;}).join('');
  const auto=(x.source||'manual')==='auto',title=titleOf(x);
  return `<p class="sp-lede">${esc(x.id===all[0].id?s.lede:s.ledeOther)}${title?`<span>${x.game_id?`<button type="button" class="link-button" data-sentence-game="${esc(String(x.game_id))}" title="${esc(s.game)}">${esc(title)}</button>`:esc(title)}</span>`:''}</p>
   <h2 class="sp-big" lang="ja" aria-live="polite">${big}</h2>
   <div class="sp-meta"><p class="sp-zh${x.translation?'':' is-none'}">${esc(x.translation||s.noTr)}</p>
    <div class="sp-line"><p class="sp-who"><time>${esc(readTime(x.created_at,locale)||datetime(x.created_at))}</time>${auto?`<span class="sentence-source sp-src">${esc(s.autoTag)}</span>`:''}</p>
     <div class="sp-act"><button type="button" class="text-button" data-sentence-play="${x.id}" title="${esc(s.play)}">${playIc}${esc(s.playShort)}</button>
      ${x.game_id?`<button type="button" class="text-button" data-sentence-game="${esc(String(x.game_id))}">${esc(s.game)}</button>`:''}
      <button type="button" class="text-button sp-del" data-sentence-delete="${x.id}" aria-label="${esc(s.remove)}" title="${esc(s.remove)}">${icon('trash')}<span>${esc(s.remove)}</span></button></div></div>
    ${x.words?.length?`<div class="sentence-words sp-words"><span class="muted">${esc(s.words)}</span>${x.words.map(w=>`<button type="button" class="sentence-word" data-lookup="${esc(w.spelling)}" title="${esc(s.lookup+w.spelling)}">${esc(w.spelling)}${w.reading&&w.reading!==w.spelling?`<small>${esc(w.reading)}</small>`:''}</button>`).join('')}</div>`:''}</div>`;}
 function fit(){const big=heroIn.querySelector('.sp-big');if(!big)return;big.style.removeProperty('--sp-fit');const W=big.clientWidth;if(!W)return;let ratio=1;
  big.querySelectorAll('.sp-mask').forEach(m=>{const ind=parseFloat(m.parentElement.style.getPropertyValue('--ind'))||0,room=W*(1-ind/100)-8;if(m.scrollWidth&&m.scrollWidth>room)ratio=Math.min(ratio,room/m.scrollWidth);});
  if(ratio<1)big.style.setProperty('--sp-fit',ratio.toFixed(4));big.classList.toggle('is-wrap',ratio<.42);}
 let sceneTicket=0;
 /* the CG is only ever this sentence's own scene frame; anything else (no scene, a failed read) leaves the hero type-only */
 function paintCg(x){const ticket=++sceneTicket,has=!!(x.scene?.file&&x.game_id);hero.classList.toggle('has-cg',has);heroPol.classList.remove('ok');cgImg.removeAttribute('src');
  heroPol.style.cssText=`--rot:${(jitter(x.id,'h')*5-1).toFixed(2)}deg`;heroPol.querySelector('.sp-pol-t').textContent=titleOf(x)||'';heroPol.querySelector('time').textContent=when(x.created_at,locale,s,false);
  if(!has)return Promise.resolve(false);
  return sceneURL(api,String(x.game_id),x.scene.file).then(url=>{if(!alive||ticket!==sceneTicket)return false;cgImg.src=url;heroPol.classList.add('ok');return true;},
   ()=>{if(alive&&ticket===sceneTicket){hero.classList.remove('has-cg');fit();}return false;});}
 /* the whole photo, never cropped: click or Enter opens the enlarge-and-inspect view */
 const inspect=el=>{if(el?.classList.contains('ok'))inspectPhoto(el,{hint:s.inspect,closeLabel:s.close});};
 heroPol.addEventListener('click',()=>inspect(heroPol));offs.push(()=>closeInspect(true));
 function fillHero(){const p=paintCg(cur);heroIn.innerHTML=heroHTML(cur);fit();bindHero();return p;}
 let swapTl=null;
 function setHero(x,{scroll=true}={}){if(!x||x.id===cur.id&&heroIn.childElementCount)return;cur=x;markCards();
  if(scroll&&hero.getBoundingClientRect().top<(main?.getBoundingClientRect().top||0))hero.scrollIntoView({block:'start',behavior:reduced()?'auto':'smooth'});
  const gsap=motion();if(!gsap){fillHero();return;}
  swapTl?.progress(1).kill();
  add(()=>{const units=heroIn.querySelectorAll('.u');swapTl=gsap.timeline({defaults:{ease:'power3.in'}})
   .to(units,{yPercent:-118,duration:.3,stagger:{amount:Math.min(.25,units.length*.01)}})
   .to(heroIn.querySelectorAll('.sp-lede,.sp-meta'),{autoAlpha:0,duration:.2},0)
   .to(cg,{autoAlpha:0,duration:.25},0)
   .add(()=>{if(!alive)return;const shown=fillHero();const fresh=heroIn.querySelectorAll('.u');
    add(()=>gsap.timeline({defaults:{ease:'power4.out'}}).from(fresh,{yPercent:118,duration:.7,stagger:{amount:Math.min(.5,fresh.length*.025)}})
     .from(heroIn.querySelectorAll('.sp-lede,.sp-meta'),{autoAlpha:0,y:10,duration:.45},'<.15'));
    shown.then(ok=>{if(alive&&ok)add(()=>gsap.fromTo(cg,{autoAlpha:0,y:-26,rotation:-7},{autoAlpha:1,y:0,rotation:0,duration:.75,ease:'back.out(1.4)'}));else gsap.set(cg,{autoAlpha:1});});});});}
 function bindHero(){heroIn.querySelectorAll('[data-sentence-play]').forEach(b=>b.addEventListener('click',()=>play(b)));
  heroIn.querySelectorAll('[data-sentence-delete]').forEach(b=>b.addEventListener('click',()=>{if(!b.classList.contains('armed')){b.classList.add('armed');b.querySelector('span').textContent=s.confirm;
   setTimeout(()=>{if(b.isConnected){b.classList.remove('armed');b.querySelector('span').textContent=s.remove;}},3200);return;}remove(b);}));
  heroIn.querySelectorAll('[data-lookup]').forEach(b=>b.addEventListener('click',()=>lookup(b.dataset.lookup)));
  heroIn.querySelectorAll('[data-sentence-game]').forEach(b=>b.addEventListener('click',()=>openGame(b.dataset.sentenceGame)));}
 async function play(b){const id=b.dataset.sentencePlay,item=byId.get(String(id));if(!item)return;b.disabled=true;
  try{await (await import('./sentence-voice.js')).playSentence(api,item.text,b);}catch(error){toast(errorMessage(error));}finally{b.disabled=false;}}
 async function remove(b){b.disabled=true;try{await api('sentence_delete',{id:Number(b.dataset.sentenceDelete)});rerender();}catch(error){b.disabled=false;toast(errorMessage(error));}}

 /* ---------- strip: drag with inertia, shift-wheel, arrows ---------- */
 let x=0,minX=0;
 const measure=()=>{minX=Math.min(0,viewport.clientWidth-track.scrollWidth);};
 const clampX=v=>Math.max(minX,Math.min(0,v));
 const progress=()=>{const p=minX?x/minX:0,vis=track.scrollWidth?Math.min(1,viewport.clientWidth/track.scrollWidth):1;bar.style.transform=`translateX(${(p*(1-vis)*100/vis).toFixed(2)}%)`;bar.style.width=`${(vis*100).toFixed(2)}%`;
  root.querySelector('[data-sp-step="-1"]').disabled=x>=-1;root.querySelector('[data-sp-step="1"]').disabled=x<=minX+1;};
 let tween=null;
 function moveTo(v,{instant=false,dur=.7}={}){v=clampX(v);const gsap=motion();tween?.kill();tween=null;
  if(!gsap||instant){x=v;track.style.transform=`translate3d(${x}px,0,0)`;progress();return;}
  const o={x};tween=gsap.to(o,{x:v,duration:dur,ease:'power3.out',onUpdate:()=>{x=o.x;track.style.transform=`translate3d(${x}px,0,0)`;progress();}});}
 const step=()=>{const c=track.querySelector('.sp-pair');return c?(c.offsetWidth+parseFloat(getComputedStyle(track).columnGap||'40')):300;};
 root.querySelectorAll('[data-sp-step]').forEach(b=>b.addEventListener('click',()=>moveTo(x-Number(b.dataset.spStep)*Math.max(step(),Math.floor(viewport.clientWidth/step())*step()))));
 let drag=null,moved=false;
 viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;tween?.kill();drag={id:e.pointerId,x0:e.clientX,start:x,last:e.clientX,t:performance.now(),v:0};moved=false;});
 viewport.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x0;if(!moved&&Math.abs(dx)>6){moved=true;viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-drag');}
  if(!moved)return;const now=performance.now(),dt=Math.max(1,now-drag.t);drag.v=.8*((e.clientX-drag.last)/dt)+.2*drag.v;drag.last=e.clientX;drag.t=now;
  let v=drag.start+dx;if(v>0)v*=.35;else if(v<minX)v=minX+(v-minX)*.35;x=v;track.style.transform=`translate3d(${x}px,0,0)`;progress();});
 const end=e=>{if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;viewport.classList.remove('is-drag');if(!moved)return;
  const fling=performance.now()-d.t<80?d.v*380:0;moveTo(x+fling,{dur:Math.min(1.2,.5+Math.abs(fling)/1600)});};
 viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
 viewport.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;}},true);
 viewport.addEventListener('wheel',e=>{const dx=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.shiftKey?e.deltaY:0;if(!dx)return;e.preventDefault();moveTo(x-dx*1.4,{dur:.45});},{passive:false});
 viewport.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();
  moveTo(e.key==='Home'?0:e.key==='End'?minX:x+(e.key==='ArrowLeft'?1:-1)*step());});
 viewport.addEventListener('focusin',e=>{const c=e.target.closest('.sp-pair');if(!c)return;const l=c.offsetLeft+x,r=l+c.offsetWidth;
  if(l<0)moveTo(-c.offsetLeft);else if(r>viewport.clientWidth)moveTo(viewport.clientWidth-c.offsetLeft-c.offsetWidth);});
 track.addEventListener('click',e=>{const c=e.target.closest('[data-sp-pick]');if(c)setHero(byId.get(c.dataset.spPick),{scroll:false});});
 track.addEventListener('dblclick',e=>{const p=e.target.closest('.sp-pol');if(p&&!moved)inspect(p);});
 function markCards(){track.querySelectorAll('.sp-pair').forEach(c=>c.classList.toggle('is-cur',c.dataset.spPair===String(cur.id)));
  listEl.querySelectorAll('[data-sentence-id]').forEach(r=>r.classList.toggle('is-cur',r.dataset.sentenceId===String(cur.id)));}
 const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>{measure();moveTo(x,{instant:true});fit();}):null;ro?.observe(viewport);ro?.observe(heroIn);offs.push(()=>ro?.disconnect(),()=>tween?.kill());
 measure();progress();
 /* thumbnails: loaded when the strip comes near view */
 const thumbs=[...track.querySelectorAll('[data-scene-file]')];let thumbsDone=false;
 const loadThumbs=()=>{if(thumbsDone)return;thumbsDone=true;thumbs.forEach(t=>sceneURL(api,t.dataset.sceneGame,t.dataset.sceneFile).then(u=>{if(alive&&t.isConnected){const im=t.querySelector('img');im.onload=()=>{if(alive){measure();progress();}};im.src=u;t.classList.add('ok');}},()=>{t.remove();if(alive){measure();moveTo(x,{instant:true});}}));};
 const io='IntersectionObserver' in window?new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();loadThumbs();}},{root:main,rootMargin:'300px 0px'}):null;
 if(io){io.observe(viewport);offs.push(()=>io.disconnect());}else loadThumbs();

 /* ---------- shelf: the cover flies into the detail page's cover ---------- */
 root.querySelectorAll('[data-sp-game]').forEach(b=>b.addEventListener('click',()=>flyTo(b)));
 function flyTo(b){const id=b.dataset.spGame,gsap=motion(),from=b.querySelector('.sp-cover');
  if(!gsap||!from){openGame(id,{tab:'sentences'});return;}
  try{const r=from.getBoundingClientRect(),ghost=from.cloneNode(true);ghost.className='sp-cover sp-ghost';
   Object.assign(ghost.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',margin:0,zIndex:9999,pointerEvents:'none',transformOrigin:'0 0'});
   document.body.append(ghost);from.style.visibility='hidden';
   const g=window.gsap;g.to(root.querySelectorAll('.sp-hero,.sp-strip,.sp-all,.sp-shelf .sp-h,.sp-book:not([data-sp-game="'+CSS.escape(id)+'"])'),{autoAlpha:0,duration:.22,ease:'power1.in'});
   g.to(b.querySelectorAll('.sp-book-t,.sp-book-m'),{autoAlpha:0,duration:.15});
   g.to(ghost,{scale:1.04,duration:.22,ease:'power2.out'});
   const cleanup=()=>{g.killTweensOf(ghost);ghost.remove();document.querySelectorAll('.sp-fly-target').forEach(n=>{n.classList.remove('sp-fly-target');n.style.removeProperty('opacity');});};
   const t0=performance.now();
   const land=()=>{const dest=document.querySelector('.game-detail-hero .detail-cover');
    if(!dest){if(performance.now()-t0>2500){cleanup();return;}requestAnimationFrame(land);return;}
    dest.classList.add('sp-fly-target');dest.style.opacity='0';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{const d=dest.getBoundingClientRect();if(!d.width){cleanup();return;}
     g.to(ghost,{x:d.left-r.left,y:d.top-r.top,scale:d.width/r.width,duration:.62,ease:'expo.inOut',onComplete:()=>{dest.style.opacity='';
      g.fromTo(dest,{autoAlpha:.6},{autoAlpha:1,duration:.2,clearProps:'opacity,visibility'});g.to(ghost,{autoAlpha:0,duration:.18,onComplete:cleanup});}});}));};
   setTimeout(()=>{openGame(id,{tab:'sentences'});requestAnimationFrame(land);},230);
  }catch{openGame(id,{tab:'sentences'});}}

 /* ---------- 全部句子: filter, search, rows ---------- */
 const count=k=>k==='all'?all.length:all.filter(x=>(x.source||'manual')===k).length;
 const row=item=>`<article class="record sentence-record sp-r${item.id===cur.id?' is-cur':''}" data-sentence-id="${item.id}"><div class="record-meta"><span>${item.game_id&&titleOf(item)?`<button type="button" class="link-button" data-sentence-game="${esc(item.game_id)}" title="${esc(s.game)}">${esc(titleOf(item))}</button>`:esc(titleOf(item))}${(item.source||'manual')==='auto'?` · <span class="sentence-source">${esc(s.autoTag)}</span>`:''}</span><span class="sentence-when">${esc(readTime(item.created_at,locale))||datetime(item.created_at)}</span><div class="word-actions sentence-actions"><button type="button" class="icon-button" data-sentence-play="${item.id}" aria-label="${esc(s.play)}" title="${esc(s.play)}">▶</button><button class="icon-button" data-sentence-delete="${item.id}" aria-label="${esc(s.remove)}" title="${esc(s.remove)}">${icon('trash')}</button></div></div><p class="sp-r-ja" lang="ja" data-sp-pick="${item.id}">${esc(item.text)}</p>${item.translation?`<p class="muted">${esc(item.translation)}</p>`:''}${item.words?.length?`<div class="sentence-words"><span class="muted">${esc(s.words)}</span>${item.words.map(w=>`<button type="button" class="sentence-word" data-lookup="${esc(w.spelling)}" title="${esc(s.lookup+w.spelling)}">${esc(w.spelling)}${w.reading&&w.reading!==w.spelling?`<small>${esc(w.reading)}</small>`:''}</button>`).join('')}</div>`:''}</article>`;
 function renderList(){filterEl.innerHTML=['all','manual','auto'].map(k=>`<button type="button" role="tab" class="tab${filter===k?' active':''}" aria-selected="${filter===k}" data-sentence-filter="${k}">${esc(s[k])} <small class="muted">${count(k)}</small></button>`).join('');
  const q=query.trim().toLowerCase(),items=(filter==='all'?all:all.filter(x=>(x.source||'manual')===filter)).filter(x=>!q||(String(x.text)+'\n'+String(x.translation||'')+'\n'+titleOf(x)).toLowerCase().includes(q));
  listEl.innerHTML=items.length?`<div class="record-list">${items.map(row).join('')}</div>`:`<div class="empty-state"><p>${esc(q?s.noQ(query.trim()):s.none)}</p>${filter==='manual'?/* #147 (user: 不知道怎么手动收藏) */`<p class="muted">${esc(s.howManual)}</p>`:''}</div>`;
  filterEl.querySelectorAll('[data-sentence-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.sentenceFilter;renderList();}));
  listEl.querySelectorAll('[data-sentence-play]').forEach(b=>b.addEventListener('click',()=>play(b)));
  listEl.querySelectorAll('[data-sentence-delete]').forEach(b=>b.addEventListener('click',()=>remove(b)));
  listEl.querySelectorAll('[data-lookup]').forEach(b=>b.addEventListener('click',()=>lookup(b.dataset.lookup)));
  listEl.querySelectorAll('[data-sentence-game]').forEach(b=>b.addEventListener('click',()=>openGame(b.dataset.sentenceGame)));
  listEl.querySelectorAll('.sp-r-ja[data-sp-pick]').forEach(p=>p.addEventListener('click',()=>setHero(byId.get(p.dataset.spPick))));}
 let qTimer=0;input.addEventListener('input',()=>{clearTimeout(qTimer);qTimer=setTimeout(()=>{query=input.value;renderList();},120);});
 renderList();

 fillHero();
 /* the serif face may land after the first measure: fit the rows again once fonts are in */
 const refit=()=>{if(alive)fit();};document.fonts?.ready?.then(refit);document.fonts?.addEventListener?.('loadingdone',refit);offs.push(()=>document.fonts?.removeEventListener?.('loadingdone',refit));
 const gsap=motion();
 if(gsap)add(()=>{gsap.timeline({defaults:{ease:'power4.out'}}).from(heroIn.querySelectorAll('.u'),{yPercent:118,duration:.8,stagger:{amount:.45}})
  .from(heroIn.querySelectorAll('.sp-lede,.sp-meta'),{autoAlpha:0,y:12,duration:.5},'<.2')
  .from(track.querySelectorAll('.sp-pair'),{autoAlpha:0,x:60,y:24,rotation:4,duration:.7,stagger:.05},'<.1');});
 if(want){const node=listEl.querySelector(`[data-sentence-id="${cur.id}"]`);node?.classList.add('sentence-focus');requestAnimationFrame(()=>hero.scrollIntoView({block:'start'}));}
}
