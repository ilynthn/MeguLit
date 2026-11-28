// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

function setupDom(t){
 const noop=()=>{};
 const VOID=new Set(['input','br','hr','img','meta','link','source','circle','path']);
 const toCamel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 class El{
  constructor(tag){
   this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.parentNode=null;
   this.attrs=new Map();this.dataset={};this.style={setProperty:noop};this.textContent='';
   this._html='';this.disabled=false;this.hidden=false;this.value='';this.selectedIndex=0;
   this.classes=new Set();
   this.classList={add:(...cs)=>cs.forEach(c=>this.classes.add(c)),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c)),toggle:(c,on)=>on===undefined?(this.classes.has(c)?this.classes.delete(c):this.classes.add(c)):(on?this.classes.add(c):this.classes.delete(c)),contains:c=>this.classes.has(c)};
  }
  get options(){return this.children.filter(c=>c.tagName==='OPTION');}
  get selectedOptions(){return this.options.slice(0,1);}
  get className(){return [...this.classes].join(' ');}
  set className(v){this.classes=new Set(String(v||'').split(/\s+/).filter(Boolean));}
  get firstElementChild(){return this.children[0]||null;}
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
  addEventListener(){}
  removeEventListener(){}
  focus(){}
  click(){if(!this.disabled&&typeof this.onclick==='function')return this.onclick({currentTarget:this,target:this});}
  closest(sel){let cur=this;while(cur){if(cur.matches(sel))return cur;cur=cur.parentElement;}return null;}
  matchesSimple(s){
   s=s.trim().replace(/:scope>/g,'');if(!s)return false;
   const clean=s.replace(/:not\([^)]*\)/g,'');
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
 const doc={documentElement:{lang:'zh',classList:{toggle:noop},style:{setProperty:noop}},body:new El('body'),fullscreenElement:null,createElement:tag=>new El(tag),querySelector:()=>null,addEventListener:noop,removeEventListener:noop};
 const globals={document:doc,window:{addEventListener:noop,removeEventListener:noop},addEventListener:noop,removeEventListener:noop,requestAnimationFrame:noop,cancelAnimationFrame:noop,ResizeObserver:class{observe(){} disconnect(){}},MutationObserver:class{observe(){} disconnect(){}},localStorage:{getItem:()=>null,setItem:noop},MeguHud:require('../web/hud-drag.js'),MeguAnkiHud:require('../web/anki-hud-model.js')};
 for(const [name,value] of Object.entries(globals)){
  const prev=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{if(prev)Object.defineProperty(globalThis,name,prev);else delete globalThis[name];});
 }
 t.mock.method(globalThis,'setInterval',()=>1);
 t.mock.method(globalThis,'clearInterval',noop);
 return {target:new El('div'),El};
}

const text={loading:'加载中',ankiReview:'Anki 复习',ankiStartHint:'提示',ankiOffline:'未连接',ankiOfflineHint:'离线',reconnect:'重新连接',ankiConnected:'已连接',startAnki:'开始',chooseDeck:'牌组',ankiRefresh:'刷新',ankiFailed:'失败'};

/* 2026-11-28 owner (加个手动重新连接的按钮): one 重新连接 Anki button (anki_reconnect) replaces 启动 / 修复; it says why it
   could not connect, keeps the one-click install link when Anki is missing, and reloads the review in place on success */
test('重新连接 with Anki missing says so and keeps the one-click install link',async t=>{
 const {target}=setupDom(t);
 let statusCalls=0;
 const api=async action=>{
  if(action==='anki_status'){statusCalls++;return {connected:false,reason:'ANKI_OFFLINE',url:'http://127.0.0.1:8765'};}
  if(action==='anki_reconnect')throw Error('ANKI_EXECUTABLE_MISSING');
  if(action==='anki_repair'||action==='anki_launch')throw Error('old buttons must not be used');
  return {};
 };
 const {renderAnkiReview}=await import('../web/anki-review.js');
 await renderAnkiReview({target,api,text,esc:String,isCurrent:()=>true,toast:()=>{},quiet:true});
 assert.equal(statusCalls,1);
 const btn=target.querySelector('[data-reconnect]');
 assert.ok(btn,'offline view shows 重新连接');
 assert.equal(target.querySelector('[data-connect]'),null,'the port fix only shows when the port is taken');
 await btn.click();
 assert.match(target.querySelector('[data-anki-reason]').textContent,/没有找到 Anki/);
 assert.ok(target.querySelector('[data-install-ask]'),'one-click install is still offered');
 assert.equal(statusCalls,1,'only the Anki block is redrawn, without another status round');
});

test('重新连接 reloads the review in place when AnkiConnect answers',async t=>{
 const {target}=setupDom(t);
 let connected=false,statusCalls=0;
 const api=async action=>{
  if(action==='anki_status'){statusCalls++;return connected?{connected:true,version:6,decks:['MeguLit'],defaultDeck:'MeguLit'}:{connected:false,reason:'ANKI_OFFLINE'};}
  if(action==='anki_reconnect'){connected=true;return {connected:true};}
  if(action==='anki_current'||action==='anki_practice')return {done:true};
  return {};
 };
 const {renderAnkiReview}=await import('../web/anki-review.js');
 await renderAnkiReview({target,api,text,esc:String,isCurrent:()=>true,toast:()=>{},quiet:true});
 await target.querySelector('[data-reconnect]').click();
 await new Promise(z=>setTimeout(z,0));
 assert.equal(statusCalls,2);
 assert.ok(target.querySelector('[data-start]'),'connected deck view renders after reconnecting');
});
