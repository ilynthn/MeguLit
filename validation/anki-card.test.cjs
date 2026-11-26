const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function renderer(){
 const handlers={},events={},sent=[],moved=[],classes=new Set();let replacements=0,played=0,paused=0;
 const audio={hidden:false,controls:true,addEventListener(){},pause(){paused++;},async play(){played++;}},media={querySelector:()=>audio};
 const button={parentElement:media,setAttribute(){},hasAttribute:()=>false},fallback={hasAttribute:()=>true};
 const destination={closest:()=>({}),querySelector:()=>null,append:node=>moved.push(node)};
 // The word audio is in BackSide, while its visible placeholder is in FrontSide.
 const source={querySelector:()=>media,querySelectorAll:()=>[media]};
 const phrase={cloneNode:()=>({querySelectorAll:()=>[],textContent:'縁もゆかりもない'})};
 const frontList={dataset:{},querySelectorAll:()=>[phrase],querySelector:()=>null},backList={querySelectorAll:()=>[phrase]};
 const front={contains:node=>node===destination,querySelector:()=>frontList},back={querySelector:()=>backList};
 const root={style:{setProperty(){}},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},replaceChildren(){replacements++;},
  querySelector:s=>s==='#FrontSide.CardSide'?front:back,
  querySelectorAll:s=>s==='.VocabAudio'?[destination,source]:s==='[data-anki-play]'?[button]:s==='[data-anki-replay]'?[fallback]:s==='audio'||s==='audio[src]'||s==='img,video,audio'?[audio]:[],
  addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
 fallback.setAttribute=()=>{};
 const document={querySelector:s=>s==='#card-content'?root:s==='#card-viewport'?{scrollTop:0}:s==='#card-stage'?{}:{hidden:true},createElement:()=>({content:{querySelectorAll:()=>[]}})};
 const parent={postMessage:message=>sent.push(message)};
 const context={document,parent,location:{hash:'#frame-123'},addEventListener:(name,fn)=>handlers[name]=fn,requestAnimationFrame(){},ResizeObserver:class{observe(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/anki-card.js'),'utf8'),context);
 const load=source=>handlers.message({source,data:{type:'tome-anki-card',nonce:'frame-123',html:'fixture'}});
 return {parent,load,handlers,events,sent,moved,classes,audio,button,fallback,frontList,get replacements(){return replacements;},get played(){return played;},get paused(){return paused;}};
}
test('isolated card only accepts its parent and restores the hidden BackSide word player to the visible front',()=>{
 const r=renderer();r.load({});assert.equal(r.replacements,0);r.load(r.parent);assert.equal(r.replacements,1);assert.equal(r.moved.length,1);assert(r.classes.has('compact-eggroll'));assert.equal(r.frontList.dataset.tomeDuplicate,'true');assert.equal(r.audio.hidden,true);assert.equal(r.audio.controls,false);
});
test('a card play click starts its own audio; only the explicit fallback asks the parent to replay',async()=>{
 const r=renderer();r.load(r.parent);const before=r.paused,click=async button=>{for(const fn of r.events.click)await fn({target:{closest:selector=>selector==='a'?null:button},preventDefault(){}});};
 assert.equal(r.played,0);
 await click(r.button);assert.equal(r.played,1);assert.equal(r.paused,before+1);assert.equal(r.audio.currentTime,0);assert.equal(r.sent.length,0);
 await click(r.fallback);assert.equal(r.played,1);assert.equal(r.sent.length,1);assert.equal(r.sent[0].type,'tome-anki-replay');assert.equal(r.sent[0].nonce,'frame-123');
});
test('playing all managed audio requires the authenticated explicit play message',()=>{
 const r=renderer(),data={type:'tome-anki-play-all',nonce:'frame-123'};
 r.load(r.parent);r.handlers.message({source:{},data});assert.equal(r.played,0);
 r.handlers.message({source:r.parent,data});assert.equal(r.played,1);
});
test('card volume combines master and track gains without replaying audio',()=>{
 const r=renderer();
 r.audio.dataset={ankiChannel:'game'};
 r.load(r.parent);
 const data={type:'tome-anki-mix',nonce:'frame-123',mix:{master:50,game:20,word:100}};
 r.handlers.message({source:{},data});assert.equal(r.audio.volume,1);
 r.handlers.message({source:r.parent,data});assert.equal(r.audio.volume,.1);
 assert.equal(r.played,0);
});

test('playAudio respects the visible side and resolves both q: and a: markers in template order',async t=>{
 const {DatabaseSync}=require('node:sqlite'),{AnkiReviewer}=require('../services/anki-review.cjs');
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db.close());
 const card={
  cardId:501,deckName:'Core2k',modelName:'Core',ord:0,css:'',buttons:[1,2,3,4],nextReviews:['1m','6m','1d','4d'],
  question:'食べる [anki:play:q:0]',
  answer:'食べる [anki:play:q:0]<hr>ご飯を食べる [anki:play:a:0]',
  fields:{
   Word:{value:'食べる',order:0},
   WordAudio:{value:'[sound:word.mp3]',order:1},
   Sentence:{value:'ご飯を食べる',order:2},
   SentenceAudio:{value:'[sound:sent.mp3]',order:3}
  }
 };
 let failTemplates=false;const calls=[];
 const fetcher=async(_u,o)=>{
  const {action,params}=JSON.parse(o.body);calls.push(action);
  if(action==='deckNames')return {ok:true,json:async()=>({result:['Core2k'],error:null})};
  if(action==='guiDeckReview'||action==='guiShowAnswer'||action==='guiPlayAudio')return {ok:true,json:async()=>({result:true,error:null})};
  if(action==='guiCurrentCard')return {ok:true,json:async()=>({result:card,error:null})};
  if(action==='cardsInfo')return {ok:true,json:async()=>({result:[card],error:null})};
  if(action==='modelTemplates'){if(failTemplates)return {ok:true,json:async()=>({result:null,error:'templates unavailable'})};return {ok:true,json:async()=>({result:{Card1:{Front:'{{Word}} {{WordAudio}}',Back:'{{FrontSide}}<hr>{{Sentence}} {{SentenceAudio}}'}},error:null})};}
  if(action==='retrieveMediaFile')return {ok:true,json:async()=>({result:Buffer.from('ID3-'+params.filename).toString('base64'),error:null})};
  throw Error('unexpected '+action);
 };
 const reviewer=new AnkiReviewer({db,fetcher});
 await reviewer.start('Core2k');
 // On the front side, replay must play ONLY the front word audio, never leak the back sentence audio.
 const front=await reviewer.playAudio(501);
 assert.deepEqual(front.clips.map(c=>c.name),['word.mp3']);
 // If template resolution fails on the front side, do not dump back-side field sounds; fall back to Anki's guiPlayAudio.
 failTemplates=true;
 const fallback=await reviewer.playAudio(501);
 assert.deepEqual(fallback,{played:true});
 assert.equal(calls.filter(a=>a==='guiPlayAudio').length,1);
 // After showing the answer, both front (q:0) and back (a:0) audio are returned in template order.
 failTemplates=false;
 await reviewer.showAnswer(501);
 const back=await reviewer.playAudio(501);
 assert.deepEqual(back.clips.map(c=>c.name),['word.mp3','sent.mp3']);
 // On the answer side, if template lookup fails, field-order [sound:] fallback still recovers all clips.
 failTemplates=true;
 const backFallback=await reviewer.playAudio(501);
 assert.deepEqual(backFallback.clips.map(c=>c.name),['word.mp3','sent.mp3']);
});

test('review toolbar replay plays embedded iframe audio for non-MeguLit cards instead of bypassing to anki_play_audio',async t=>{
 const noop=()=>{},posted=[],apiCalls=[];
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
  addEventListener(){} removeEventListener(){} focus(){}
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
 const doc={documentElement:{lang:'zh',classList:{toggle:noop},style:{setProperty:noop}},body:null,fullscreenElement:null,createElement:tag=>new El(tag),querySelector:()=>null,addEventListener:noop,removeEventListener:noop};
 doc.body=new El('body');
 const target=new El('div');
 const globals={document:doc,window:{addEventListener:noop,removeEventListener:noop},addEventListener:noop,removeEventListener:noop,requestAnimationFrame:noop,cancelAnimationFrame:noop,ResizeObserver:class{observe(){} disconnect(){}},MutationObserver:class{observe(){} disconnect(){}},localStorage:{getItem:()=>null,setItem:noop},MeguHud:require('../web/hud-drag.js'),MeguAnkiHud:require('../web/anki-hud-model.js')};
 for(const [name,value] of Object.entries(globals)){const prev=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true});t.after(()=>{if(prev)Object.defineProperty(globalThis,name,prev);else delete globalThis[name];});}
 t.mock.method(globalThis,'setInterval',()=>1);
 t.mock.method(globalThis,'clearInterval',noop);
 const api=async action=>{
  apiCalls.push(action);
  if(action==='anki_status')return {connected:true,version:6,decks:['Core2k'],defaultDeck:'Core2k'};
  if(action==='anki_current')return {done:false,cardId:501,deck:'Core2k',answerShown:false,buttons:[1,2,3,4],intervals:[],hasAudio:true,manualAudio:false,html:'<div>食べる <span data-anki-media><button data-anki-play></button><audio src="data:audio/mpeg;base64,SUQz"></audio></span></div>'};
  return {};
 };
 const {renderAnkiReview}=await import('../web/anki-review.js');
 await renderAnkiReview({target,api,text:{ankiReview:'Anki',showAnswer:'显示答案',chooseDeck:'牌组',ankiRefresh:'刷新',ankiFailed:'失败',ankiOfflineHint:'离线'},esc:String,isCurrent:()=>true,toast:noop,quiet:true});
 const replayBtn=target.querySelector('[data-replay]');
 assert.ok(replayBtn);
 replayBtn.click();
 assert.equal(posted.filter(m=>m.type==='tome-anki-play-all').length,1,'toolbar replay plays the visible iframe audio first');
 assert.equal(apiCalls.filter(a=>a==='anki_play_audio').length,0,'does not bypass iframe audio to replay backend answer clips');
});
