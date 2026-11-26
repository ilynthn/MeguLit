/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module entry. Renders inside a shadow root under 学习 → 五十音 so its styles never touch
   the rest of the app. Views are ported one-to-one from the approved web prototype. */
import * as D from './data.js';

const VIEWS=['index','lesson','gojuon','games','play','results','records','kanji'];
const BASE=new URL('./',import.meta.url).href;
import {RECORDED} from './audio/index.js';
/* Kana voices (user, 2026-11-09): single kana are best heard from a person. 'female' / 'male' play the recordings in
   kana/audio (Wikimedia Commons, see kana/audio/CREDITS.md); anything without a recording, and 'ai', use the synthesis. */
const toHira=t=>String(t||'').replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
export const VOICES=[['female','女声'],['male','男声'],['ai','AI 合成']];
export function voicePicker(ctx,{note=true}={}){
 const box=document.createElement('div');box.className='kn-voice';
 const draw=()=>{const cur=(ctx.store.get(KEY.p,{}).voice)||'female';box.innerHTML='<span class="kn-voice-label">发音</span><div class="kn-voice-seg" role="radiogroup" aria-label="发音">'+VOICES.map(([v,l])=>'<button type="button" role="radio" data-voice="'+v+'" aria-checked="'+(v===cur)+'">'+l+'</button>').join('')+'</div>'+(note?'<small class="kn-voice-note">清音、浊音播放母语者真人录音（来自 Wikimedia Commons）；拗音暂无真人录音，统一用 AI 合成</small>':'');
  box.querySelectorAll('[data-voice]').forEach(b=>b.onclick=()=>{const p=ctx.store.get(KEY.p,{});ctx.store.put(KEY.p,{...p,voice:b.dataset.voice});draw();ctx.speech.say(b.dataset.voice==='male'?'お':'あ');});};
 draw();return box;
}
const KEY={m:'megulit.kana.mastery',b:'megulit.kana.boxes',r:'megulit.kana.runs',a:'megulit.kana.applied',l:'megulit.kana.lessons',p:'megulit.kana.prefs'};
const FIELD={[KEY.m]:'mastery',[KEY.b]:'boxes',[KEY.r]:'runs',[KEY.a]:'applied',[KEY.l]:'lessons',[KEY.p]:'prefs'};
const INTERVAL=[1,3,7,21],DAY=864e5;
const GAME={pos:'行段识别',seq:'前后假名',conv:'平片转换'},DIFF={intro:'入门',std:'标准',adv:'进阶',chal:'挑战'};

let fontsAdded=false,saving=Promise.resolve(),liveStore=null;
function addFonts(){
 if(fontsAdded)return;fontsAdded=true;
 const style=document.createElement('style');style.dataset.kana='fonts';
 style.textContent="@font-face{font-family:'MJP Serif';src:local('Noto Serif JP'),url('fonts/NotoSerifJP.woff2') format('woff2');font-weight:200 900;font-display:swap}@font-face{font-family:'MJP Sans';src:local('Noto Sans JP'),url('fonts/NotoSansJP.woff2') format('woff2');font-weight:100 900;font-display:swap}";
 document.head.append(style);
}

/* ---------- 学习进度：内存一份，改动后合并写入 data/kana-progress.json ---------- */
function createStore(api,data){
 let timer=0,pending=null;
 const flush=()=>{clearTimeout(timer);timer=0;const body=pending;pending=null;if(body)saving=saving.then(()=>api('kana_progress_save',{data:body})).catch(()=>{});return saving;};
 const put=(key,value)=>{data[FIELD[key]]=value;pending=data;clearTimeout(timer);timer=setTimeout(flush,400);};
 const get=(key,fallback)=>{const v=data[FIELD[key]];return v===undefined?fallback:JSON.parse(JSON.stringify(v));};
 function applyRun(run,dry){
  const applied=get(KEY.a,[]);if(!dry&&applied.includes(run.id))return run.changes||[];
  const m=get(KEY.m,{}),b=get(KEY.b,{}),now=Date.now(),agg={};
  for(const l of run.log){const a=agg[l.show]||(agg[l.show]={ok:0,bad:0,hint:false});l.ok?a.ok++:a.bad++;if(l.hint)a.hint=true;}
  const changes=[];
  for(const [k,a] of Object.entries(agg)){
   const from=m[k]||0,box=b[k]?.box||0;let to,nb;
   if(a.bad){nb=1;to=Math.min(from,1)||1;}
   else if(a.hint){nb=Math.max(1,box);to=Math.max(from,1);}
   else{nb=Math.min(4,box+1);to=Math.max(from,nb>=3?3:2);}
   m[k]=to;b[k]={box:nb,due:now+INTERVAL[nb-1]*DAY};
   changes.push({k,from,to,box:nb,days:INTERVAL[nb-1],ok:a.ok,bad:a.bad});
  }
  if(dry)return changes;
  put(KEY.m,m);put(KEY.b,b);applied.push(run.id);put(KEY.a,applied.slice(-300));
  const runs=get(KEY.r,[]),i=runs.findIndex(r=>r.id===run.id);if(i>=0){runs[i].changes=changes;put(KEY.r,runs);}
  run.changes=changes;return changes;
 }
 function stats(run){
  const L=run.log,ok=L.filter(l=>l.ok).length,total=L.length;
  const speed=L.reduce((s,l)=>s+(l.br?.speed||0)*(l.br?.mult||1),0);
  const multBonus=L.reduce((s,l)=>s+(l.br?(l.br.base+l.br.speed-l.br.hintCut)*(l.br.mult-1):0),0);
  const hintCut=L.reduce((s,l)=>s+(l.br?.hintCut||0),0);
  const penalty=L.reduce((s,l)=>s+(l.penalty||0),0);
  const times=L.map(l=>l.t);
  return {ok,total,acc:total?Math.round(ok/total*100):0,avg:times.length?times.reduce((a,b)=>a+b,0)/times.length:0,base:ok*10,speed,multBonus,hintCut,penalty};
 }
 function bestOf(G,Dd,exceptId){const rs=get(KEY.r,[]).filter(r=>r.G===G&&r.D===Dd&&r.id!==exceptId&&!(r.only&&r.only.length));return rs.reduce((b,r)=>!b||r.score>b.score?r:b,null);}
 function addRun(run){const runs=get(KEY.r,[]);runs.push(run);put(KEY.r,runs.slice(-200));}
 function setMastery(k,l){const m=get(KEY.m,{});m[k]=l;put(KEY.m,m);}
 function lessonDone(id){const l=get(KEY.l,{});l[id]=Date.now();put(KEY.l,l);}
 return {KEY,GAME,DIFF,CONFUSE:D.CONFUSE,INTERVAL,DAY,get,put,flush,applyRun,stats,bestOf,addRun,setMastery,lessonDone,seed(){}};
}

/* ---------- 发音：走 MeguLit 的 AivisSpeech（词典读音 + UniDic 音调），连不上退回系统语音 ---------- */
function createSpeech(api,store,toast=()=>{},active=()=>true){
 const cache=new Map();let current=null,seq=0,offline=false;
 const volume=()=>{const p=store.get(KEY.p,{});return Number.isFinite(p.volume)?p.volume:0.4;};
 const readingOf=t=>{for(const w of Object.values(D.WORD_H))if(w[0]===t)return w[1];return '';};
 function synth(text){
  if(cache.has(text))return cache.get(text);
  const pr=store.get(KEY.p,{}),p=api('kana_speak',{text,reading:readingOf(text),speaker:pr.speaker??null,speed:pr.speed??0.9}).then(r=>URL.createObjectURL(new Blob([Uint8Array.from(atob(r.data),c=>c.charCodeAt(0))],{type:'audio/wav'})));
  cache.set(text,p);p.catch(()=>cache.delete(text));return p;
 }
 function system(t){try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='ja-JP';u.rate=.85;u.volume=volume();speechSynthesis.speak(u);}catch{}}
 const voice=()=>(store.get(KEY.p,{}).voice)||'female';
 const recorded=text=>{const v=voice();if(v==='ai')return '';const k=toHira(text);return RECORDED[v]&&RECORDED[v].includes(','+k+',')?BASE+'audio/'+v+'/'+[...k].map(c=>c.codePointAt(0).toString(16).padStart(4,'0')).join('-')+'.'+RECORDED.ext/* ASCII file names: the release zip and updater stay encoding-safe */:'';};
 async function say(text){
  stop();const my=seq;
  {const url=recorded(text);if(url){try{current=new Audio(url);current.volume=volume();await current.play();return;}catch{if(my!==seq)return;}}}
  /* v1.1.6 (user: the speaker button stayed silent until a voice preview in Settings had started the engine): a cold
     AivisSpeech refuses the first requests for a few seconds; keep retrying up to ~20 s instead of going offline at once */
  if(!offline){for(let tries=0;tries<14&&my===seq;tries++){try{const url=await synth(text);if(my!==seq)return;current=new Audio(url);current.volume=volume();await current.play();return;}catch(error){const msg=String(error?.message||error||'');if(/[一-鿿]/.test(msg)&&!/尚未就绪/.test(msg)){if(my===seq)toast('AI 发音不可用：'+msg.replace(/^Error:\s*/,''));break;}await new Promise(r=>setTimeout(r,1500));}}
   if(my!==seq)return;offline=true;setTimeout(()=>{offline=false;},15000);}
  if(my===seq)system(text);
 }
 function stop(){seq++;if(current){current.pause();current=null;}try{speechSynthesis.cancel();}catch{}}
 /* start the voice engine when AI voice is chosen, so the first click already has a voice */
 setTimeout(()=>{if(active()&&voice()==='ai')synth('あ').catch(()=>{});},300);
 let queue=Promise.resolve();
 function prefetch(list){queue=queue.then(async()=>{for(const t of [...new Set(list)].slice(0,120)){if(!active()||offline)return;if(recorded(t))continue;try{await synth(t);}catch{return;}}});return queue;}
 function setVolume(v){if(current)current.volume=v;}
 return {say,prefetch,stop,setVolume};
}

/* ---------- 入口 ---------- */
export async function mountKana(target,{api,invoke,toast,start='index',openTab,focus=''}={}){
 /* 两个子标签（五十音 / 假名游戏）共用一份进度：先把上一个页面没写完的保存掉 */
 if(liveStore)await liveStore.flush();await saving;
 addFonts();
 const host=document.createElement('div');host.className='kana-host';host.tabIndex=-1;host.style.outline='none';
 const shadow=host.attachShadow({mode:'open'});
 shadow.innerHTML=`<link rel="stylesheet" href="${BASE}kana.css"><div class="kana-root"><div class="kn-view"></div></div>`;
 target.replaceChildren(host);
 const root=shadow.querySelector('.kana-root'),viewEl=shadow.querySelector('.kn-view');
 const data=await api('kana_progress').catch(()=>({mastery:{},boxes:{},runs:[],applied:[],lessons:{},prefs:{volume:0.4}}));
 const store=createStore(api,data),speech=createSpeech(api,store,(...a)=>(toast||(()=>{}))(...a),()=>host.isConnected);liveStore=store;
 let gameWordsCache=null;
 const gameWords=()=>gameWordsCache??=api('kana_game_words',{words:D.GAME_WORDS}).then(r=>r.words||{}).catch(()=>({}));
 let keyHandlers=[],leaveHandlers=[],current={name:'index',params:{}};
 const ctx={voicePicker:o=>voicePicker(ctx,o),base:BASE,api,invoke,home:start,openTab:openTab||null,toast:toast||(()=>{}),store,speech,data:D,gameWords,lastRun:null,go,onKey:h=>keyHandlers.push(h),onLeave:h=>leaveHandlers.push(h),root:shadow};
 function go(url){
  if(url==='@reload'){show(current.name,current.params);return;}
  /* 在「假名游戏」标签里，回到学习主页就切去「五十音」标签；反之亦然 */
  const target0=String(url).split('?')[0].replace(/\.html$/,'')||'index';
  const [file,query='']=String(url).split('?'),name=file.replace(/\.html$/,'')||'index';
  if(!VIEWS.includes(name))return;
  show(name,Object.fromEntries(new URLSearchParams(query)));
 }
 async function show(name,params){
  for(const h of leaveHandlers.splice(0))try{h();}catch{}
  speech.stop();keyHandlers=[];current={name,params};
  const mod=await import(`./views/${name}.js`);
  const el=document.createElement('div');viewEl.replaceChildren(el);
  try{mod.view(el,{...ctx,params});}catch(error){console.error('[kana]',error);el.textContent='加载失败：'+error.message;}
  host.scrollIntoView?.({block:'start'});const scroller=host.closest('.main')||document.scrollingElement;if(scroller)scroller.scrollTop=0;
 }
 /* 视图里的 <a href="x.html"> 与 data-go 在模块内部切换，不离开 MeguLit */
 root.addEventListener('click',event=>{
  const link=event.target.closest('a[href],[data-go]');if(!link||!root.contains(link))return;
  const url=link.dataset.go||link.getAttribute('href');if(!url||/^(https?:|mailto:)/.test(url))return;
  event.preventDefault();go(url);
 });
 /* 按键只在五十音页面可见时生效；输入框、MeguLit 自己的对话框不受影响 */
 const cleanup=()=>{document.removeEventListener('keydown',onKey,true);speech.stop();store.flush();};
 const onKey=event=>{
  if(!host.isConnected){cleanup();return;}
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
  const path=event.composedPath(),inner=path[0];
  if(!path.includes(host)&&inner!==document.body&&inner!==document.documentElement)return;
  if(document.querySelector('dialog[open],.modal.open'))return;
  /* 中文输入法开着时，快捷键会以 key=Process 送来；按物理键位还原成数字、字母、空格、回车 */
  let key=event.key;
  if((key==='Process'||key==='Unidentified')&&!(inner instanceof HTMLInputElement)&&!(inner instanceof HTMLTextAreaElement)){const c=event.code||'';key=/^Digit\d$/.test(c)?c.slice(5):/^Numpad\d$/.test(c)?c.slice(6):/^Key[A-Z]$/.test(c)?c.slice(3).toLowerCase():c==='Space'?' ':c==='Enter'||c==='NumpadEnter'?'Enter':c==='Backspace'?'Backspace':c==='Escape'?'Escape':key;
   /* 换一下焦点，让输入法丢掉这次的候选，不留候选窗 */
   if(key!==event.key){event.preventDefault();setTimeout(()=>{if(!host.isConnected)return;const a=shadow.activeElement||document.activeElement;a?.blur?.();host.focus({preventScroll:true});},0);}}
  const wrapped={key,shiftKey:event.shiftKey,isComposing:event.isComposing,target:inner,preventDefault:()=>event.preventDefault()};
  for(const h of keyHandlers)h(wrapped);
 };
/* 发音音量：标题行右侧的常驻细尺（方案 C）；只影响五十音学习，不改游戏朗读 */
 const curVol=()=>{const v=store.get(KEY.p,{}).volume;return Number.isFinite(v)?v:0.4;};
 ctx.volumeHTML=()=>{const pct=Math.round(curVol()*100);return `<div class="kn-vol" title="五十音发音音量，不影响游戏朗读"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg><span>发音</span><input class="kn-ruler" type="range" min="0" max="100" step="5" value="${pct}" style="--v:${pct}%" aria-label="发音音量"><output class="num">${pct}%</output></div>`;};
 root.addEventListener('input',event=>{const r=event.target;if(!r.classList?.contains('kn-ruler'))return;const val=Number(r.value)/100,p=store.get(KEY.p,{});p.volume=val;store.put(KEY.p,p);speech.setVolume(val);r.style.setProperty('--v',r.value+'%');const o=r.parentElement.querySelector('output');if(o)o.textContent=r.value+'%';});
 root.addEventListener('change',event=>{if(event.target.classList?.contains('kn-ruler'))speech.say('あ');});
 document.addEventListener('keydown',onKey,true);
 window.addEventListener('beforeunload',()=>store.flush());
 await show(start==='games'?'index':start,focus||start==='games'?{focus:'practice'}:{});
 return {flush:()=>store.flush(),stop:cleanup};
}
