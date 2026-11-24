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
const RUBY_TEXT=/^\s*ruby\b[\s\S]*?\btext\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/i;
const OPEN_CODE=/^\s*(iscript|html)\b/i;
const END_SCRIPT=/\[\s*endscript\s*\]/i,END_HTML=/\[\s*endhtml\s*\]/i;
const AT_END_SCRIPT=/^@\s*endscript\b/i,AT_END_HTML=/^@\s*endhtml\b/i;
function parse(buf){const lines=[],anchors=[],ruby=[],voices=[],vt=voiceRef.tracker();let code=null,block=false;
 for(const raw of decode(buf).split(/\r?\n/)){let t=raw.trim();
  if(block){const e=t.indexOf('*/');if(e<0)continue;block=false;t=t.slice(e+2).trim();}
  while(t.startsWith('/*')){const e=t.indexOf('*/',2);if(e<0){block=true;t='';break;}t=t.slice(e+2).trim();}
  if(!t||t[0]===';')continue;
  if(code){
   const atEnd=code==='endscript'?AT_END_SCRIPT:AT_END_HTML;
   if(atEnd.test(t)){code=null;continue;}
   const endRe=code==='endscript'?END_SCRIPT:END_HTML;
   const em=endRe.exec(t);if(!em)continue;
   code=null;t=t.slice(em.index+em[0].length).trim();if(!t||t[0]===';')continue;
  }
  const atOpen=/^@\s*(iscript|html)\b/i.exec(t);
  if(atOpen){code=atOpen[1].toLowerCase()==='iscript'?'endscript':'endhtml';continue;}
  if(t[0]==='*'||t[0]==='@'){vt.see(t);anchors.push(t);continue;}
  if(t[0]==='#'){const who=t.slice(1).split(':')[0].trim();if(who){lines.push(who);ruby.push(null);voices.push(null);}continue;}
  /* [ruby text="よみ"] reads the next character; [[ escapes a literal '['; quoted attribute values may contain ']' */
  const pairs=[];let text='',pending=null,sawCode=false,sawTag=false,noClose=false;
  let lastDQ=t.lastIndexOf('"'),lastSQ=t.lastIndexOf("'");
  const take=seg=>{if(pending&&seg){const ch=[...seg][0];pairs.push([ch,pending]);pending=null;}return seg;};
  for(let i=0;i<t.length;){
   if(t[i]!=='['){const nxt=t.indexOf('[',i);const end=nxt<0?t.length:nxt;text+=take(t.slice(i,end));i=end;continue;}
   if(t[i+1]==='['){text+=take('[');i+=2;continue;}
   if(noClose){text+=take('[');i++;continue;}
   let end=-1,q='',afterEq=false;
   for(let j=i+1;j<t.length;j++){
    const c=t[j];
    if(q){if(c==='\\'&&(t[j+1]===q||t[j+1]==='\\')){j++;continue;}if(c===q)q='';continue;}
    if(c===']'){end=j;break;}
    if(afterEq&&(c==='"'||c==="'")){
     if((c==='"'?lastDQ:lastSQ)<=j){end=t.indexOf(']',i+1);break;}
     q=c;afterEq=false;continue;}
    if(c==='=')afterEq=true;
    else if(c!==' '&&c!=='\t')afterEq=false;}
   if(end<0&&q){if(q==='"')lastDQ=-1;else lastSQ=-1;end=t.indexOf(']',i+1);}
   if(end<0){noClose=true;text+=take('[');i++;continue;}
   const body=t.slice(i+1,end),om=OPEN_CODE.exec(body);
   if(om){sawCode=true;const kind=om[1].toLowerCase()==='iscript'?'endscript':'endhtml';
    const endRe=kind==='endscript'?END_SCRIPT:END_HTML;
    const em=endRe.exec(t.slice(end+1));
    if(em){i=end+1+em.index+em[0].length;continue;}
    code=kind;break;}
   sawTag=true;vt.see(t.slice(i,end+1));
   const rm=RUBY_TEXT.exec(body);if(rm){const v=rm[1]??rm[2]??rm[3];if(v)pending=v;}
   i=end+1;}
  text=text.trim();if(!text){if(!sawCode&&sawTag)anchors.push(t);continue;}
  lines.push(text);ruby.push(pairs.length?pairs:null);voices.push(vt.take());}
 const out={lines,anchors};if(ruby.some(Boolean))out.ruby=ruby;const v=voiceRef.keep(voices);if(v)out.voices=v;return out;}

/* ---- containers ------------------------------------------------------------------------------------------------ */
/* E604 the containers (asar, zip anywhere in a file) moved to kit.cjs: the web-bundle family shares them */
const readAt=kit.readAt,{asarList,zipList,zipRead}=kit;

function names(dir){try{return fs.readdirSync(dir);}catch{return [];}}
const walk=(dir,depth)=>kit.walk(dir,depth,n=>/\.ks$/i.test(n),[],null);/* E577 kit.walk, every folder */
const gameExe=n=>/\.exe$/i.test(n)&&!/^(nwjc|notification_helper|unins\d*|chromedriver|payload)\.exe$/i.test(n);
const tyranoArchive=list=>list?.some(e=>/(^|\/)tyrano\/(tyrano|libs)/i.test(e.name))&&list.some(e=>KS(e.name));
/* Old NW.js ships nw.pak without nw.dll. Only the game exe, not an installer or patch beside it,
   carries both the Tyrano runtime and the scenario. Read just its ZIP directory to identify it. */
function legacyExeBundles(dir,files){
 if(!files.some(n=>/^nw\.pak$/i.test(n))||files.some(n=>/^nw\.dll$/i.test(n)))return [];
 const out=[];
 for(const n of files.filter(gameExe)){
  const file=path.join(dir,n);
  try{const entries=zipList(file);if(tyranoArchive(entries))out.push({kind:'zip',file,exe:true,entries});}catch{}
 }
 return out;
}
/* every place a Tyrano game keeps its scenario, as {kind, file, root} */
function containers(dir){const out=[];
 for(const base of [dir,path.join(dir,'resources','app'),path.join(dir,'www')]){const sc=path.join(base,'data','scenario');if(fs.existsSync(sc))out.push({kind:'loose',root:base});}
 const asar=path.join(dir,'resources','app.asar');if(fs.existsSync(asar))out.push({kind:'asar',file:asar});
 const files=names(dir),nw=files.some(n=>/^nw\.dll$/i.test(n));
 for(const n of files){const f=path.join(dir,n);
  if(/^package\.nw$/i.test(n))out.push({kind:'zip',file:f});
  else if(nw&&gameExe(n))out.push({kind:'zip',file:f,exe:true});}
 return out.concat(legacyExeBundles(dir,files));}
function archiveList(c){try{return c.entries||(c.kind==='asar'?asarList(c.file):zipList(c.file));}catch{return null;}}
function isTyranoAsar(dir){return tyranoArchive(archiveList({kind:'asar',file:path.join(dir,'resources','app.asar')}));}
const scenarioName=n=>n.replace(/\\/g,'/').replace(/^.*?data\/scenario\//i,'');
function scenes(dir,{original=false}={}){const out=new Map();
 for(const c of containers(dir)){
  if(c.kind==='loose'){const sc=path.join(c.root,'data','scenario');for(const f of walk(sc,4)){const rel=path.relative(sc,f).replace(/\\/g,'/');out.set(rel.toLowerCase(),{name:rel,read:()=>fs.readFileSync(f)});}continue;}
  const list=archiveList(c);if(!list)continue;
  const scripts=list.filter(e=>!e.encrypted&&KS(e.name));
  // A declared Chinese locale with its own entry script may keep translated versions in ch/.
  const names=original&&c.kind==='asar'&&list.some(e=>/(?:^|\/)data\/others\/lang\/ch\.json$/i.test(e.name))?
   new Set(scripts.map(e=>scenarioName(e.name).toLowerCase())):null;
  const mirror=names?.has('first.ks')&&names.has('ch/first.ks');
  for(const e of scripts){const rel=scenarioName(e.name),key=rel.toLowerCase();
   if(mirror&&key.startsWith('ch/')&&names.has(key.slice(3)))continue;
   if(out.has(key))continue;
   out.set(key,{name:rel,read:c.kind==='asar'?()=>readAt(c.file,e.offset,e.size):()=>zipRead(c.file,e)});}}
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
/* a Tyrano game: its scenario sits next to the engine (tyrano/ folder, or tyrano/*.js inside the container) */
function isTyrano(dir){for(const c of containers(dir)){
  if(c.kind==='loose'){if(fs.existsSync(path.join(c.root,'tyrano','tyrano.base.js'))||fs.existsSync(path.join(c.root,'tyrano','libs')))return true;continue;}
  if(tyranoArchive(archiveList(c)))return true;}
 return false;}
const engine={
 id:'tyrano',hint:'data\\scenario\\*.ks（或 app.asar / package.nw）',
 scenes:dir=>isTyrano(dir)?scenes(dir,{original:true}):[],
 archives:dir=>scenes(dir),
 sources:dir=>containers(dir).map(c=>c.file||path.join(c.root,'data','scenario')),
 parse,test:n=>/\.ks$/i.test(n),
};
module.exports={engine,parse,asarList,zipList,zipRead,containers,isTyrano,isTyranoAsar,scenes,legacyExeBundles};
