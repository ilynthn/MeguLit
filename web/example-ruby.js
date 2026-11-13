/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Furigana on every example sentence taken from the user's own read lines (2026-11-14, user: 所有地方提取例句出来的时候记得注音啊).
   One renderer for all study pages. A page marks the element that shows a line with exAttr(text,ruby,esc) and keeps
   its own markup (highlight, bold words, quotes); this module asks the service once per batch (example_ruby: game
   ruby → dictionary reading, names and tokenizer guesses bare) and puts <ruby> into the element's text nodes, so the
   page's highlight stays as it is. Kana get no ruby. Parts that must not show a reading (a fill-in blank, inputs) are
   skipped: inputs, textareas, [contenteditable] and anything under [data-exr-skip]. 假名注音 off → no ruby;
   注音大小 (rubyScale) sets the reading's size. */
const SKIP='input,textarea,select,rt,rp,ruby,[contenteditable],[data-exr-skip]';
const KANJI=/[㐀-鿿豈-﫿々〆ヶ]/;
const cache=new Map(),waiting=new Map();
let api=null,prefs={on:true,scale:.5},prefsAt=0,queued=null,observer=null;

/* attribute for the element that shows one example line; ruby = the game's [[base,reading],…] when the page has it */
export function exAttr(text,ruby,esc){
  const e=esc||(v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const t=String(text||'');if(!t)return '';
  /* 'none': a made-up variant (a quiz option) — no game ruby looked up, so the real line does not stand out */
  if(ruby==='none')return ` data-exr="${e(t)}" data-exr-ruby="none"`;
  const pairs=Array.isArray(ruby)?ruby.filter(p=>Array.isArray(p)&&p[0]&&p[1]):[];
  return ` data-exr="${e(t)}"${pairs.length?` data-exr-ruby="${e(JSON.stringify(pairs))}"`:''}`;
}

/* Pure part: put spans [{start,end,reading}] (code points of `text`) into the element's text nodes. Text nodes are
   matched to the line in order; characters the page added (「」, a blank) are passed over. Returns how many were set. */
export function applySpans(el,text,spans){
  const chars=[...String(text||'')];if(!el||!chars.length||!spans?.length)return 0;
  const nodes=[],walker=el.ownerDocument.createTreeWalker(el,4/* SHOW_TEXT */);
  for(let n=walker.nextNode();n;n=walker.nextNode()){const sk=n.parentElement?.closest(SKIP);if(sk&&el.contains(sk))continue;nodes.push(n);}
  /* map: position in the line → [node, code-point offset in the node] */
  const where=new Array(chars.length).fill(null);let cursor=0;
  for(const node of nodes){const s=[...node.data];let k=0;
    while(k<s.length&&cursor<chars.length){
      const rest=s.slice(k).join(''),at=chars.slice(cursor).join('').indexOf(rest);
      if(at>=0){const from=cursor+[...chars.slice(cursor).join('').slice(0,at)].length;for(let q=0;q<s.length-k;q++)where[from+q]=[node,k+q];cursor=from+s.length-k;k=s.length;break;}
      if(s[k]===chars[cursor]){where[cursor]=[node,k];cursor++;}
      k++;}
  }
  /* group by node, last first, so earlier offsets stay valid */
  const byNode=new Map(),letters=[];
  for(const sp of spans){const a=where[sp.start],b=where[sp.end-1];if(!a||!b)continue;
    if(a[0]!==b[0]){const run=letterRun(where,sp);if(run)letters.push({run,reading:sp.reading});continue;}
    if(b[1]-a[1]!==sp.end-1-sp.start)continue;
    let whole=true;for(let i=sp.start;i<sp.end;i++)if(!where[i]||where[i][0]!==a[0])whole=false;if(!whole)continue;
    if(!byNode.has(a[0]))byNode.set(a[0],[]);byNode.get(a[0]).push({from:a[1],to:b[1]+1,reading:sp.reading});}
  let count=0;
  for(const [node,list] of byNode){list.sort((x,y)=>y.from-x.from);let cur=node;
    for(const r of list){const cp=[...cur.data],before=cp.slice(0,r.from).join(''),base=cp.slice(r.from,r.to).join(''),after=cp.slice(r.to).join('');
      if(!KANJI.test(base))continue;
      const doc=cur.ownerDocument,ruby=doc.createElement('ruby');ruby.className='exr';ruby.append(doc.createTextNode(base));const rt=doc.createElement('rt');rt.textContent=r.reading;ruby.append(rt);
      const tail=doc.createTextNode(after);cur.data=before;cur.after(ruby,tail);count++;}}
  /* pages that draw a line letter by letter (<span class="u">人</span><span class="u">間</span>): one ruby around the letters */
  for(const {run,reading} of letters){const doc=el.ownerDocument,ruby=doc.createElement('ruby');ruby.className='exr';run[0].before(ruby);ruby.append(...run);
    const rt=doc.createElement('rt');rt.textContent=reading;ruby.append(rt);count++;}
  return count;
}
/* the letters of a span when each sits alone in its own element and those elements are next to each other */
function letterRun(where,sp){const els=[];
  for(let i=sp.start;i<sp.end;i++){const w=where[i];if(!w)return null;const node=w[0],parent=node.parentElement;
    if(!parent||parent.childNodes.length!==1||[...node.data].length!==1)return null;els.push(parent);}
  for(let i=1;i<els.length;i++)if(els[i-1].nextElementSibling!==els[i]||els[i-1].nextSibling!==els[i])return null;
  return els;}

/* for an element a page keeps and refills (el.innerHTML=…): which line it now shows */
export function setExample(el,text,ruby){if(!el)return;const t=String(text||'');if(!t){delete el.dataset.exr;delete el.dataset.exrRuby;delete el.dataset.exrDone;return;}
  el.dataset.exr=t;const pairs=Array.isArray(ruby)?ruby.filter(p=>Array.isArray(p)&&p[0]&&p[1]):[];if(pairs.length)el.dataset.exrRuby=JSON.stringify(pairs);else delete el.dataset.exrRuby;delete el.dataset.exrDone;hydrateExamples();}
async function readPrefs(){
  if(!api||Date.now()-prefsAt<30000)return prefs;prefsAt=Date.now();
  try{const s=await api('settings_get');const t=s?.values?.text||{};prefs={on:t.furigana!==false&&t.furigana!=='false',scale:Number(t.rubyScale)>0?Math.min(.85,Math.max(.2,Number(t.rubyScale))):.5};}catch{}
  document.documentElement.style.setProperty('--exr-rt',String(prefs.scale));document.documentElement.classList.toggle('exr-off',!prefs.on);
  return prefs;
}
const keyOf=(text,ruby)=>text+'\u0001'+(ruby||'');
async function flush(){
  queued=null;const list=[...document.querySelectorAll('[data-exr]')].filter(el=>el.dataset.exrDone!==el.dataset.exr&&el.isConnected);
  if(!list.length)return;const p=await readPrefs();if(!p.on)return;
  const need=[];for(const el of list){const k=keyOf(el.dataset.exr,el.dataset.exrRuby);if(!cache.has(k)&&!waiting.has(k)){waiting.set(k,true);let ruby=[];if(el.dataset.exrRuby==='none')ruby=false;else try{ruby=JSON.parse(el.dataset.exrRuby||'[]');}catch{}need.push({k,text:el.dataset.exr,ruby});}}
  if(need.length&&api){try{const r=await api('example_ruby',{items:need.map(x=>({text:x.text,ruby:x.ruby}))});
      need.forEach((x,i)=>{const it=r?.items?.[i];if(it&&!it.retry&&(r.ready||it.spans?.length))cache.set(x.k,it.spans||[]);});}catch{}
    need.forEach(x=>waiting.delete(x.k));}
  for(const el of list){const k=keyOf(el.dataset.exr,el.dataset.exrRuby);if(!cache.has(k)||!el.isConnected)continue;
    if(el.dataset.exrDone===el.dataset.exr)continue;el.dataset.exrDone=el.dataset.exr;applySpans(el,el.dataset.exr,cache.get(k));}
}
/* hydrate now (pages that build off-document can call it after attaching) */
export function hydrateExamples(){if(!queued)queued=setTimeout(()=>flush().catch(()=>{}),30);}

const STYLE=`html.exr-off ruby.exr rt{display:none}
ruby.exr{ruby-position:over;ruby-align:center}
ruby.exr rt{font-size:calc(var(--exr-rt,.5) * 1em);font-weight:400;letter-spacing:0;line-height:1;opacity:.8;user-select:none;-webkit-user-select:none;font-style:normal;text-decoration:none}`;
/* once, from app.js: watch the document for [data-exr] lines and give them ruby */
export function installExampleRuby(options={}){
  api=options.api||api;if(observer||typeof document==='undefined')return;
  const style=document.createElement('style');style.id='example-ruby-style';style.textContent=STYLE;document.head.append(style);
  observer=new MutationObserver(records=>{for(const r of records){
    /* the page rewrote a line in place: give it ruby again */
    if(r.type==='childList'&&r.removedNodes.length){const host=(r.target.nodeType===1?r.target:r.target.parentElement)?.closest?.('[data-exr]');if(host){delete host.dataset.exrDone;hydrateExamples();return;}}
    if(r.type==='attributes'||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-exr]')||n.querySelector?.('[data-exr]')))){hydrateExamples();return;}}});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-exr']});
  document.addEventListener('megulit-settings-saved',()=>{prefsAt=0;readPrefs().then(hydrateExamples);});
  hydrateExamples();
}
