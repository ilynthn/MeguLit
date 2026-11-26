// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

function setupEnv(t){
 const noop=()=>{};
 const VOID=new Set(['input','br','hr','img','meta','link','source','circle','path']);
 const toCamel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 const docListeners=new Map(),winListeners=new Map(),audios=[];
 const add=(map,ev,fn)=>{if(!map.has(ev))map.set(ev,new Set());map.get(ev).add(fn);};
 const del=(map,ev,fn)=>{map.get(ev)?.delete(fn);};
 class FakeAudio{
  constructor(src){this.src=src;this.paused=true;this.pauseCalls=0;this.playCalls=0;this.volume=1;this.onended=null;audios.push(this);}
  play(){this.paused=false;this.playCalls++;return Promise.resolve();}
  pause(){this.paused=true;this.pauseCalls++;}
 }
 class El{
  constructor(tag){
   this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.parentNode=null;
   this.attrs=new Map();this.dataset={};this.style={setProperty:noop};this.textContent='';
   this._html='';this.disabled=false;this.hidden=false;this.value='';this.selectedIndex=0;this.ownerDocument=doc;
   this.classes=new Set();
   this.classList={add:(...cs)=>cs.forEach(c=>this.classes.add(c)),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c)),toggle:(c,on)=>on===undefined?(this.classes.has(c)?this.classes.delete(c):this.classes.add(c)):(on?this.classes.add(c):this.classes.delete(c)),contains:c=>this.classes.has(c)};
   if(this.tagName==='IFRAME'){
    const cw={postMessage:msg=>{if(msg?.type==='tome-anki-play-all')for(const fn of [...(winListeners.get('message')||[])])fn({source:cw,data:{type:'tome-anki-replay',nonce:msg.nonce}});}};
    this.contentWindow=cw;
   }
  }
  get options(){return this.children.filter(c=>c.tagName==='OPTION');}
  get selectedOptions(){return this.options.slice(0,1);}
  get className(){return [...this.classes].join(' ');}
  set className(v){this.classes=new Set(String(v||'').split(/\s+/).filter(Boolean));}
  get firstElementChild(){return this.children[0]||null;}
  get nextElementSibling(){if(!this.parentElement)return null;const i=this.parentElement.children.indexOf(this);return this.parentElement.children[i+1]||null;}
  get isConnected(){return true;}
  setAttribute(k,v){this.attrs.set(k,String(v));if(k==='hidden')this.hidden=true;if(k.startsWith('data-'))this.dataset[toCamel(k.slice(5))]=String(v);}
  removeAttribute(k){this.attrs.delete(k);if(k==='hidden')this.hidden=false;}
  getAttribute(k){return this.attrs.has(k)?this.attrs.get(k):null;}
  hasAttribute(k){return this.attrs.has(k);}
  append(...ns){for(const n of ns){if(!(n instanceof El))continue;if(n.parentElement)n.remove();n.parentElement=n.parentNode=this;this.children.push(n);}}
  prepend(...ns){for(const n of [...ns].reverse()){if(!(n instanceof El))continue;if(n.parentElement)n.remove();n.parentElement=n.parentNode=this;this.children.unshift(n);}}
  before(...ns){if(!this.parentElement)return;const idx=this.parentElement.children.indexOf(this);for(const n of ns){if(!(n instanceof El))continue;n.parentElement=n.parentNode=this.parentElement;this.parentElement.children.splice(idx,0,n);}}
  replaceChildren(...ns){this.children.forEach(c=>{c.parentElement=c.parentNode=null;});this.children=[];this.append(...ns);}
  remove(){if(!this.parentElement)return;const i=this.parentElement.children.indexOf(this);if(i>=0)this.parentElement.children.splice(i,1);this.parentElement=this.parentNode=null;}
  insertAdjacentHTML(_pos,html){for(const n of parse(html))this.append(n);}
  addEventListener(){}
  removeEventListener(){}
  focus(){}
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
  getClientRects(){return [{width:1000,height:700}];}
  click(){if(!this.disabled&&typeof this.onclick==='function')return this.onclick({currentTarget:this,target:this});}
  closest(sel){let cur=this;while(cur){if(cur.matches(sel))return cur;cur=cur.parentElement;}return null;}
  matchesSimple(s){
   s=s.trim().replace(/:scope>/g,'');if(!s)return false;
   if(s.includes(':not(:disabled)')&&this.disabled)return false;
   const clean=s.replace(/:not\([^)]*\)/g,'').replace(/:popover-open|:hover/g,'');
   const tag=/^([a-z0-9-]+)/i.exec(clean);if(tag&&this.tagName!==tag[1].toUpperCase())return false;
   for(const m of clean.matchAll(/\.([a-z0-9_-]+)/gi))if(!this.classList.contains(m[1]))return false;
   for(const m of clean.matchAll(/\[([a-z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]/gi)){
    if(!this.attrs.has(m[1]))return false;
    if(m[2]!==undefined&&this.attrs.get(m[1])!==m[2])return false;
   }
   return true;
  }
  matches(sel){
   return String(sel).split(',').some(part=>{
    const chain=part.trim().replace(/\s*>\s*/g,' ').split(/\s+/).filter(Boolean);
    if(!chain.length||!this.matchesSimple(chain.at(-1)))return false;
    let cur=this.parentElement;
    for(let i=chain.length-2;i>=0;i--){while(cur&&!cur.matchesSimple(chain[i]))cur=cur.parentElement;if(!cur)return false;cur=cur.parentElement;}
    return true;
   });
  }
  querySelectorAll(sel){const out=[];const walk=el=>{for(const c of el.children){if(c.matches(sel))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  get innerHTML(){return this._html;}
  set innerHTML(html){this._html=String(html||'');this.replaceChildren(...parse(this._html));}
 }
 function parse(html){
  const root=new El('root'),stack=[root];let last=0;
  for(const m of String(html).matchAll(/<(\/?)([a-z0-9-]+)([^>]*)>/gi)){
   if(m.index>last)stack.at(-1).textContent+=String(html).slice(last,m.index);
   last=m.index+m[0].length;
   const [,closing,tag,rawAttrs]=m;
   if(closing){if(stack.length>1)stack.pop();continue;}
   const el=new El(tag);
   for(const a of rawAttrs.matchAll(/([a-z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi)){
    const k=a[1],v=a[2]??a[3]??a[4]??'';
    if(k==='class')el.className=v;else el.setAttribute(k,v);
   }
   stack.at(-1).append(el);
   if(!rawAttrs.trim().endsWith('/')&&!VOID.has(tag.toLowerCase()))stack.push(el);
  }
  if(last<String(html).length)stack.at(-1).textContent+=String(html).slice(last);
  return root.children;
 }
 const doc={documentElement:{lang:'zh',classList:{toggle:noop},style:{setProperty:noop}},body:null,fullscreenElement:null,createElement:tag=>new El(tag),querySelector:()=>null,getElementById:()=>null,addEventListener:(ev,fn)=>add(docListeners,ev,fn),removeEventListener:(ev,fn)=>del(docListeners,ev,fn)};
 doc.body=new El('body');
 const win={addEventListener:(ev,fn)=>add(winListeners,ev,fn),removeEventListener:(ev,fn)=>del(winListeners,ev,fn)};
 const globals={document:doc,window:win,Audio:FakeAudio,addEventListener:win.addEventListener,removeEventListener:win.removeEventListener,requestAnimationFrame:noop,cancelAnimationFrame:noop,ResizeObserver:class{observe(){} disconnect(){}},MutationObserver:class{observe(){} disconnect(){}},localStorage:{getItem:()=>null,setItem:noop},MeguHud:require('../web/hud-drag.js'),MeguAnkiHud:require('../web/anki-hud-model.js')};
 for(const [name,value] of Object.entries(globals)){
  const prev=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{if(prev)Object.defineProperty(globalThis,name,prev);else delete globalThis[name];});
 }
 t.mock.method(globalThis,'setInterval',()=>1);
 t.mock.method(globalThis,'clearInterval',noop);
 return {target:new El('div'),audios,docListeners,winListeners,El};
}

const text={loading:'加载中',ankiReview:'Anki 复习',ankiStartHint:'提示',ankiOffline:'未连接',ankiOfflineHint:'离线',reconnect:'重新连接',ankiConnected:'已连接',startAnki:'开始',chooseDeck:'牌组',ankiRefresh:'刷新',ankiFailed:'失败',showAnswer:'显示答案',ankiAgain:'重来',ankiHard:'困难',ankiGood:'良好',ankiEasy:'简单'};

test('fallback clip playback stops on card flip/advance, stop study, and leaving the review view without leaking listeners',async t=>{
 const {target,audios,docListeners,winListeners,El}=setupEnv(t);
 let current=true,cardStep=0;
 const cardFront={done:false,cardId:10,deck:'MeguLit',answerShown:false,buttons:[1,2,3,4],intervals:[],hasAudio:true,manualAudio:false,html:'<div>表</div>'};
 const cardBack={done:false,cardId:10,deck:'MeguLit',answerShown:true,buttons:[1,2,3,4],intervals:['1m','6m','10m','4d'],hasAudio:true,manualAudio:false,html:'<div>裏</div>'};
 const cardDone={done:true,finished:true,deck:'MeguLit',total:1,reviewedToday:1,nextDue:null};
 const api=async action=>{
  if(action==='anki_status')return {connected:true,version:6,decks:['MeguLit'],defaultDeck:'MeguLit'};
  if(action==='anki_current'||action==='anki_start')return cardStep===0?cardFront:cardBack;
  if(action==='anki_show_answer'){cardStep=1;return cardBack;}
  if(action==='anki_grade')return cardDone;
  if(action==='anki_stop')return {stopped:true};
  if(action==='anki_play_audio')return {played:false,clips:[{name:'tomoyo_1.wav',src:'data:audio/wav;base64,AA=='},{name:'tomoyo_s_2.wav',src:'data:audio/wav;base64,BB=='}]};
  return {};
 };
 const {renderAnkiReview}=await import('../web/anki-review.js');
 const baseFullscreen=docListeners.get('fullscreenchange')?.size||0,baseResize=winListeners.get('resize')?.size||0;
 await renderAnkiReview({target,api,text,esc:String,isCurrent:()=>current,toast:()=>{},quiet:true});

 const triggerReplay=async()=>{target.querySelector('[data-replay]').click();await new Promise(z=>setTimeout(z,0));};

 // 1. Start fallback clip playback, then flip card: clip 0 must pause and its onended must not start clip 1.
 await triggerReplay();
 assert.equal(audios.length,1);
 assert.equal(audios[0].paused,false);
 await target.querySelector('[data-controls] button').click();
 assert.equal(audios[0].paused,true,'flipping the card stops active fallback playback');
 audios[0].onended?.();
 assert.equal(audios.length,1,'stale onended after flip must not start the next clip');

 // 2. Replay on answer side, then stop study (drawDecks): clip must stop.
 await triggerReplay();
 assert.equal(audios.length,2);
 assert.equal(audios[1].paused,false);
 await target.querySelector('[data-stop]').click();
 assert.equal(audios[1].paused,true,'stopping study to deck list stops active fallback playback');

 // 3. Start card again, replay, then finish deck (drawDone): clip must stop.
 cardStep=1;
 await target.querySelector('[data-start]').click();
 await triggerReplay();
 assert.equal(audios.length,3);
 assert.equal(audios[2].paused,false);
 await target.querySelector('.rating-3').click();
 assert.equal(audios[2].paused,true,'finishing the deck stops active fallback playback');

 // 4. Re-enter review, start playback, then leave the tab (isCurrent=false): stop() pauses audio and removes fullscreen/resize listeners.
 cardStep=0;
 await renderAnkiReview({target,api,text,esc:String,isCurrent:()=>current,toast:()=>{},quiet:true});
 await triggerReplay();
 assert.equal(audios.length,4);
 assert.equal(audios[3].paused,false);
 current=false;
 for(const fn of [...(docListeners.get('keydown')||[])])fn({key:'r',repeat:false,defaultPrevented:false,target:new El('div'),preventDefault:()=>{}});
 assert.equal(audios[3].paused,true,'leaving the Anki review view stops active fallback playback');
 assert.equal(docListeners.get('fullscreenchange')?.size||0,baseFullscreen,'leaving review removes all fullscreenchange listeners');
 assert.equal(winListeners.get('resize')?.size||0,baseResize,'leaving review removes resize listener');
});
