// SPDX-License-Identifier: GPL-3.0-or-later
// E215.7: a finished deck is reported (AnkiConnect throws "review is not currently active"), studying can be stopped,
// practice never answers cards in Anki, and daily limits are saved through the deck's options preset.
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {AnkiReviewer}=require('../services/anki-review.cjs');
function fixture(t,handler){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db.close());const calls=[];
 const fetcher=async(_u,o)=>{const {action,params}=JSON.parse(o.body);calls.push({action,params});const r=handler(action,params);return {ok:true,json:async()=>r instanceof Error?{result:null,error:r.message}:{result:r,error:null}};};
 return {reviewer:new AnkiReviewer({db,fetcher}),calls};}
test('a finished deck reports finished instead of failing',async t=>{
 const {reviewer}=fixture(t,a=>a==='deckNames'?['MeguLit']:a==='guiDeckReview'?true:a==='guiCurrentCard'?Error('Gui review is not currently active.'):a==='getDeckStats'?{1:{total_in_deck:4}}:null);
 assert.deepEqual(await reviewer.start('MeguLit'),{done:true,finished:true,deck:'MeguLit',total:4,reviewedToday:0,nextDue:null});
 assert.deepEqual(await reviewer.snapshot(),{done:true});
});
test('a finished deck says how many were reviewed today and when cards are due again',async t=>{
 const {reviewer}=fixture(t,(a,p)=>a==='deckNames'?['MeguLit']:a==='guiDeckReview'?true:a==='guiCurrentCard'?Error('Gui review is not currently active.'):a==='getDeckStats'?{1:{total_in_deck:9}}:a==='getNumCardsReviewedToday'?12:a==='findCards'?(/prop:due=3$/.test(p.query)?[1,2]:[]):null);
 assert.deepEqual(await reviewer.start('MeguLit'),{done:true,finished:true,deck:'MeguLit',total:9,reviewedToday:12,nextDue:{days:3,count:2}});
});
test('stop returns Anki to the deck list',async t=>{const {reviewer,calls}=fixture(t,()=>true);assert.deepEqual(await reviewer.stop(),{stopped:true});assert.deepEqual(calls.map(c=>c.action),['guiDeckBrowser']);});
test('practice walks the deck without answering cards',async t=>{
 const {reviewer,calls}=fixture(t,(a,p)=>a==='findCards'?[11,12]:a==='cardsInfo'?[{cardId:p.cards[0],question:'q'+p.cards[0],answer:'a'+p.cards[0]}]:null);
 const first=await reviewer.practice('MeguLit');assert.equal(first.practice,true);assert.equal(first.position,1);
 const second=await reviewer.practice('MeguLit',true);assert.equal(second.position,2);assert.notEqual(second.cardId,first.cardId);
 assert.deepEqual(await reviewer.practice('MeguLit',true),{done:true,practiceDone:true,deck:'MeguLit',total:2});
 assert.ok(!calls.some(c=>/answer|guiAnswerCard/i.test(c.action)));
});
test('daily limits are saved through the deck preset',async t=>{
 let saved=null;const {reviewer}=fixture(t,(a,p)=>a==='getDeckConfig'?(saved||{id:1,name:'默认',new:{perDay:10,bury:false},rev:{perDay:200}}):a==='saveDeckConfig'?(saved=p.config,true):null);
 const r=await reviewer.saveDeckLimits('MeguLit',{newPerDay:30,revPerDay:500});assert.equal(r.newPerDay,30);assert.equal(r.revPerDay,500);assert.equal(saved.new.bury,false);
 await assert.rejects(reviewer.saveDeckLimits('MeguLit',{newPerDay:-1,revPerDay:5}),/ANKI_INVALID_LIMIT/);
});
test('an unfinished practice round resumes on the same card and ends cleanly',async t=>{
 const {reviewer}=fixture(t,(a,p)=>a==='findCards'?[21,22,23]:a==='cardsInfo'?[{cardId:p.cards[0],question:'q',answer:'a'}]:null);
 assert.deepEqual(await reviewer.practice('',false,true),{done:true});
 const first=await reviewer.practice('MeguLit');const again=await reviewer.practice('',false,true);assert.equal(again.cardId,first.cardId);assert.equal(again.position,1);
 await reviewer.practice('MeguLit',true);assert.equal((await reviewer.practice('',false,true)).position,2);
 reviewer.endPractice();assert.deepEqual(await reviewer.practice('',false,true),{done:true});
});

test('practice mode supports R-key audio replay on answer and prevents double-advance skipping a card',async t=>{
 const noop=()=>{},posted=[],keyListeners=[];
 const VOID=new Set(['input','hr','br','img','circle','path']);
 const toCamel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 class El{
  constructor(tag){
   this.tagName=String(tag||'div').toUpperCase();this.children=[];this.parentNode=null;this.parentElement=null;
   this.attrs=new Map();this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';
   this.style={setProperty:noop};this._html='';this.ownerDocument=doc;
   this.classList={
    add:(...cs)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));cs.forEach(c=>set.add(c));this.className=[...set].join(' ');},
    remove:(...cs)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));cs.forEach(c=>set.delete(c));this.className=[...set].join(' ');},
    toggle:(c,on)=>{const has=this.classList.contains(c);const want=on===undefined?!has:!!on;if(want)this.classList.add(c);else this.classList.remove(c);return want;},
    contains:c=>this.className.split(/\s+/).includes(c)
   };
   if(this.tagName==='IFRAME')this.contentWindow={postMessage:msg=>posted.push(msg)};
  }
  get className(){return this.attrs.get('class')||'';}
  set className(v){this.attrs.set('class',String(v||''));}
  get isConnected(){let cur=this;while(cur){if(cur===doc.body||cur===target)return true;cur=cur.parentElement;}return false;}
  get firstElementChild(){return this.children[0]||null;}
  get nextElementSibling(){if(!this.parentElement)return null;const i=this.parentElement.children.indexOf(this);return this.parentElement.children[i+1]||null;}
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
    for(let i=chain.length-2;i>=0;i--){
     while(cur&&!cur.matchesSimple(chain[i]))cur=cur.parentElement;
     if(!cur)return false;
     cur=cur.parentElement;
    }
    return true;
   });
  }
  querySelectorAll(sel){
   const out=[];
   const walk=el=>{for(const c of el.children){if(c.matches(sel))out.push(c);walk(c);}};
   walk(this);return out;
  }
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
 const doc={
  documentElement:{lang:'zh',classList:{toggle:noop},style:{setProperty:noop}},
  body:null,
  fullscreenElement:null,
  createElement:tag=>new El(tag),
  querySelector:()=>null,
  addEventListener:(ev,fn)=>{if(ev==='keydown')keyListeners.push(fn);},
  removeEventListener:(ev,fn)=>{if(ev==='keydown'){const i=keyListeners.indexOf(fn);if(i>=0)keyListeners.splice(i,1);}}
 };
 doc.body=new El('body');
 const target=new El('div');
 const globals={
  document:doc,
  window:{addEventListener:noop,removeEventListener:noop},
  addEventListener:noop,removeEventListener:noop,
  requestAnimationFrame:noop,cancelAnimationFrame:noop,
  ResizeObserver:class{observe(){} disconnect(){}},
  MutationObserver:class{observe(){} disconnect(){}},
  localStorage:{getItem:()=>null,setItem:noop},
  MeguHud:require('../web/hud-drag.js'),
  MeguAnkiHud:require('../web/anki-hud-model.js')
 };
 for(const [name,value] of Object.entries(globals)){
  const prev=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{if(prev)Object.defineProperty(globalThis,name,prev);else delete globalThis[name];});
 }
 t.mock.method(globalThis,'setInterval',()=>1);
 t.mock.method(globalThis,'clearInterval',noop);

 let advanceCalls=0,releaseAdvance=null,failNext=false;
 const card1={done:false,practice:true,deck:'MeguLit',cardId:1,position:1,total:3,question:'<div>表</div>',answer:'<div>裏 <span data-anki-media><button data-anki-play></button><audio data-anki-channel="game" src="data:audio/ogg;base64,T2dnUw=="></audio></span></div>'};
 const card2={done:false,practice:true,deck:'MeguLit',cardId:2,position:2,total:3,question:'<div>表2</div>',answer:'<div>裏2</div>'};
 const api=async(action,params={})=>{
  if(action==='anki_status')return {connected:true,version:6,decks:['MeguLit'],defaultDeck:'MeguLit'};
  if(action==='anki_current')return {done:true};
  if(action==='anki_practice'&&params.resume)return card1;
  if(action==='anki_practice'&&params.advance){
   advanceCalls++;
   if(failNext){failNext=false;throw Error('ANKI_TIMEOUT');}
   return new Promise(resolve=>{releaseAdvance=()=>resolve(card2);});
  }
  return {};
 };
 const toasts=[];
 const {renderAnkiReview}=await import('../web/anki-review.js');
 await renderAnkiReview({target,api,text:{ankiReview:'Anki',showAnswer:'显示答案',chooseDeck:'牌组',ankiFailed:'失败',ankiOfflineHint:'离线'},esc:String,isCurrent:()=>true,toast:m=>toasts.push(m),quiet:true});

 const fireKey=key=>{for(const fn of [...keyListeners])fn({key,repeat:false,defaultPrevented:false,ctrlKey:false,metaKey:false,altKey:false,target:new El('div'),preventDefault:noop});};

 // On front (no audio), pressing R must not post play-all; replay button stays hidden.
 const replayBtn=target.querySelector('[data-replay]');
 assert.ok(replayBtn,'practice toolbar should provide a replay button for audio cards');
 assert.equal(replayBtn.hidden,true,'replay button is hidden while front side has no audio');
 fireKey('r');
 assert.equal(posted.filter(m=>m.type==='tome-anki-play-all').length,0);

 // Flip to answer (has audio): replay button becomes visible and pressing R triggers play-all.
 const primary1=target.querySelector('[data-controls] button.primary');
 primary1.click();
 assert.equal(replayBtn.hidden,false,'replay button becomes visible on answer with audio');
 fireKey('r');
 assert.equal(posted.filter(m=>m.type==='tome-anki-play-all').length,1,'R key replays card audio in practice mode');

 // Rapid double-click / double Space on Next must send only one advance request, not skip a card.
 const nextBtn=target.querySelector('[data-controls] button.primary');
 nextBtn.click();
 assert.equal(nextBtn.disabled,true,'Next button disables immediately while advancing');
 nextBtn.click();
 fireKey(' ');
 assert.equal(advanceCalls,1,'rapid Next click + Space must not skip a practice card');
 releaseAdvance();
 await new Promise(z=>setTimeout(z,0));
 assert.equal(target.querySelector('.anki-hud-count').textContent,'2 / 3','rendered card 2');

 // On failed advance, Next button re-enables so the user can retry.
 failNext=true;
 target.querySelector('[data-controls] button.primary').click(); // flip card 2
 const retryBtn=target.querySelector('[data-controls] button.primary');
 await retryBtn.click();
 assert.equal(retryBtn.disabled,false,'Next button re-enables when advance fails');
});
