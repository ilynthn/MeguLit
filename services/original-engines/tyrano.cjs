// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E567 TyranoScript / TyranoBuilder (ShinoGame; MIT engine). VNDB counts ~4000 Japanese Windows releases, the largest
   share of them doujin and otome titles. The scenario is plain KAG-style text, data/scenario/**\/*.ks, shipped as:
     loose          <game>/data/scenario, or <game>/resources/app/data/scenario (unpacked Electron)
     app.asar       Electron (TyranoScript V5 / TyranoBuilder Electron export): u32 4, u32 header size, then a
                    pickle {u32 payload, u32 json length, JSON tree {files:{name:{offset:"n",size}}}}; file data starts
                    at 8 + header size (electron/asar, MIT)
     package.nw     NW.js export: a zip; or the same zip appended to the game's exe (NW.js reads it from the end)
   Script grammar (TyranoScript docs, tyrano.ks): ";" comment, "*label", "@tag", "[tag ...]" inline, "#name" or
   "#name:face" sets the speaker, [iscript]..[endscript] and [html]..[endhtml] are code, /* ... *\/ block comments.
   [ruby text="よみ"] puts a reading over the next character; [r] [l] [p] are breaks and waits. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const voiceRef=require('./voice-ref.cjs');
const decode=buf=>require('./scenes.cjs').decode(buf);
const KS=n=>/(?:^|\/)data\/scenario\/.*\.ks$/i.test(n.replace(/\\/g,'/'));

/* ---- parse ----------------------------------------------------------------------------------------------------- */
function parse(buf){const lines=[],anchors=[],ruby=[],voices=[],vt=voiceRef.tracker();let code=false,block=false;
 for(const raw of decode(buf).split(/\r?\n/)){let t=raw.trim();
  if(block){const e=t.indexOf('*/');if(e<0)continue;block=false;t=t.slice(e+2).trim();}
  if(t.startsWith('/*')){const e=t.indexOf('*/',2);if(e<0){block=true;continue;}t=t.slice(e+2).trim();}
  if(!t||t[0]===';')continue;
  if(/^[@[]\s*(?:iscript|html)\b/i.test(t)){code=true;continue;}if(code){if(/^[@[]\s*(?:endscript|endhtml)\b/i.test(t))code=false;continue;}
  if(t[0]==='*'||t[0]==='@'){vt.see(t);anchors.push(t);continue;}
  if(t[0]==='#'){const who=t.slice(1).split(':')[0].trim();if(who){lines.push(who);ruby.push(null);voices.push(null);}continue;}
  vt.see(t);
  /* [ruby text="よみ"] reads the next character */
  const pairs=[];let text='';const re=/\[([^\]]*)\]/g;let last=0,m,pending=null;
  while((m=re.exec(t))){text+=take(t.slice(last,m.index));last=re.lastIndex;const r=/^\s*ruby\b[^\]]*\btext\s*=\s*["']?([^"'\s\]]+)/i.exec(m[1]);if(r)pending=r[1];}
  text+=take(t.slice(last));
  function take(seg){if(pending&&seg){const ch=[...seg][0];pairs.push([ch,pending]);pending=null;}return seg;}
  text=text.trim();if(!text){anchors.push(t);continue;}
  lines.push(text);ruby.push(pairs.length?pairs:null);voices.push(vt.take());}
 const out={lines,anchors};if(ruby.some(Boolean))out.ruby=ruby;const v=voiceRef.keep(voices);if(v)out.voices=v;return out;}

/* ---- containers ------------------------------------------------------------------------------------------------ */
/* E604 the containers (asar, zip anywhere in a file) moved to kit.cjs: the web-bundle family shares them */
const readAt=kit.readAt,{asarList,zipList,zipRead}=kit;

function names(dir){try{return fs.readdirSync(dir);}catch{return [];}}
const walk=(dir,depth)=>kit.walk(dir,depth,n=>/\.ks$/i.test(n),[],null);/* E577 kit.walk, every folder */
/* every place a Tyrano game keeps its scenario, as {kind, file, root} */
function containers(dir){const out=[];
 for(const base of [dir,path.join(dir,'resources','app'),path.join(dir,'www')]){const sc=path.join(base,'data','scenario');if(fs.existsSync(sc))out.push({kind:'loose',root:base});}
 const asar=path.join(dir,'resources','app.asar');if(fs.existsSync(asar))out.push({kind:'asar',file:asar});
 for(const n of names(dir)){const f=path.join(dir,n);
  if(/^package\.nw$/i.test(n))out.push({kind:'zip',file:f});
  /* NW.js: the zip appended to the game's own exe (nw.dll beside it) */
  else if(/\.exe$/i.test(n)&&!/^(nwjc|notification_helper|unins\d*|chromedriver|payload)\.exe$/i.test(n)&&names(dir).some(x=>/^nw\.dll$/i.test(x)))out.push({kind:'zip',file:f,exe:true});}
 return out;}
function scenes(dir){const out=new Map();
 for(const c of containers(dir)){
  if(c.kind==='loose'){const sc=path.join(c.root,'data','scenario');for(const f of walk(sc,4)){const rel=path.relative(sc,f).replace(/\\/g,'/');out.set(rel.toLowerCase(),{name:rel,read:()=>fs.readFileSync(f)});}continue;}
  let list=null;try{list=c.kind==='asar'?asarList(c.file):zipList(c.file);}catch{list=null;}if(!list)continue;
  for(const e of list){if(!KS(e.name)||e.encrypted)continue;const rel=e.name.replace(/\\/g,'/').replace(/^.*?data\/scenario\//i,'');if(out.has(rel.toLowerCase()))continue;
   out.set(rel.toLowerCase(),{name:rel,read:c.kind==='asar'?()=>readAt(c.file,e.offset,e.size):()=>zipRead(c.file,e)});}}
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));}
/* a Tyrano game: its scenario sits next to the engine (tyrano/ folder, or tyrano/*.js inside the container) */
function isTyrano(dir){for(const c of containers(dir)){
  if(c.kind==='loose'){if(fs.existsSync(path.join(c.root,'tyrano','tyrano.base.js'))||fs.existsSync(path.join(c.root,'tyrano','libs')))return true;continue;}
  let list=null;try{list=c.kind==='asar'?asarList(c.file):zipList(c.file);}catch{}if(list&&list.some(e=>/(^|\/)tyrano\/(tyrano|libs)/i.test(e.name))&&list.some(e=>KS(e.name)))return true;}
 return false;}
const engine={
 id:'tyrano',hint:'data\\scenario\\*.ks（或 app.asar / package.nw）',
 scenes:dir=>isTyrano(dir)?scenes(dir):[],
 archives:dir=>scenes(dir),
 sources:dir=>containers(dir).map(c=>c.file||path.join(c.root,'data','scenario')),
 parse,test:n=>/\.ks$/i.test(n),
};
module.exports={engine,parse,asarList,zipList,zipRead,containers,isTyrano,scenes};
