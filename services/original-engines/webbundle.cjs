// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E610 F1 "bundled assets" family: engines whose game is a web / NW.js / Electron / zip bundle (or loose www files) and
   whose text is plain data inside it. One module, one reader per engine (profiles below are data: how to recognise the
   engine among a bundle's entries, which entries hold text and by which content type to read them).
   Containers (kit.asarList / kit.zipList, as TyranoScript, E604): loose folder, resources\app.asar, package.nw / *.nw,
   *.love, a zip appended to the exe (NW.js with nw.dll, LÖVE with love.dll). Entry names lose a leading
   resources/app/, app/, www/ so a patch folder pairs with the game whichever way each was shipped.
   Content types (kinds): js (string literals), json (strings holding kana or ideographs), lua, plist, html, txt, yaml, and
   the engine specific twine / webgal / narrat / ink / inksrc / bitsy / gbs / rpg / raw. Lines are kept when they hold
   kana or ideographs (so the Japanese original and its Chinese patch keep the same lines); the patch is paired by
   scene name = entry path (loose copies override archived ones, as every kit engine).
   Status per engine: see ENGINE-ADAPTATION-NOTES E610–E619. */
const fs=require('node:fs'),path=require('node:path');
const kit=require('./kit.cjs');
const decode=buf=>kit.decodeText(buf);

/* ---- entries ---------------------------------------------------------------------------------------------------- */
const TEXT=/\.(js|mjs|json|html?|txt|lua|plist|ya?ml|narrat|gbsproj|deck|csv|ink)$/i;
const RAW=/\.(arcd|car)$/i;
const MAXSIZE=32<<20;
const SKIPDIR=/^(save|savedata|\.megulit|node_modules|locales|swiftshader|img|image|images|audio|sound|sounds|bgm|bgs|se|me|voice|movies|movie|video|videos|fonts|font|icon|icons|cg|music|sfx|textures)$/i;
const VENDOR=/(^|\/)(jquery|moment|lodash|underscore|pixi|phaser|three|howler|vue|react|react-dom|angular|bootstrap|electron|chromium|require|babylon|createjs|easeljs|tweenjs|soundjs|preloadjs|zlib|pako|fastclick|stats|dat\.gui|libs\/[^/]+)[^/]*\.js$/i;
function norm(n){n=String(n).replace(/\\/g,'/');let m;while((m=/^(?:resources\/app(?:\.asar)?\/|app\/|www\/|package\/|game\.love\/)/i.exec(n)))n=n.slice(m[0].length);return n;}
const mk=(name,size,read,from,hd)=>({name:norm(name),raw:name,size,read,from,head:hd||(n=>read().subarray(0,n))});
const memo=new Map();
/* every entry (text-like or raw) of every container of a folder; cheap signals first so a plain game folder costs a readdir */
function signals(dir){const ns=kit.names(dir);
 return ns.some(n=>/^(index\.html?|package\.json|main\.lua|conf\.lua|project\.json|data\.js|data\.json|www|resources|game|scene|story|js|scripts|src|assets|build|dist|app|ink|data)$/i.test(n)||/\.(html?|nw|love|asar|arcd|car|deck|gbsproj|gb|gbc|narrat|ink|js|json)$/i.test(n)||/^(nw|love).dll$/i.test(n)||/nvlmaker|cloudnovel|htmlvn|novelsphere/i.test(n));}
function entries(dir,any){if(!any&&!signals(dir))return [];
 const ns=kit.names(dir),key=dir+'|'+ns.join(',')+'|'+['resources','www','game'].map(s=>{try{return fs.statSync(path.join(dir,s)).mtimeMs;}catch{return 0;}}).join(',')+'|'+ns.filter(n=>/\.(nw|love|asar|exe|arcd|car)$/i.test(n)).map(n=>{try{const s=fs.statSync(path.join(dir,n));return n+s.size+':'+s.mtimeMs;}catch{return n;}}).join(',');
 const hit=memo.get(dir);if(hit&&hit.key===key)return hit.list;
 const out=[],seen=new Set();const add=e=>{const k=e.name.toLowerCase();if(seen.has(k))return;seen.add(k);out.push(e);};
 /* loose first: loose files override archived ones */
 for(const f of kit.walk(dir,6,(n,full)=>(TEXT.test(n)||RAW.test(n)||/\.(gb|gbc)$/i.test(n)),[],SKIPDIR)){let sz=kit.size(f);if(sz<0||sz>(RAW.test(f)?64<<20:MAXSIZE))continue;
  add(mk(path.relative(dir,f),sz,()=>fs.readFileSync(f),f,n=>kit.head(f,n)));}
 const lists=[];
 for(const base of [dir,path.join(dir,'resources')])for(const n of kit.names(base)){const f=path.join(base,n);
  if(/\.asar$/i.test(n))lists.push({f,asar:true});
  else if(/\.(nw|love)$/i.test(n))lists.push({f,zip:true});
  else if(/\.exe$/i.test(n)&&!/^(nwjc|notification_helper|unins\d*|chromedriver|payload)\.exe$/i.test(n)&&(ns.some(x=>/^(nw|love)\.dll$/i.test(x))||ns.some(x=>/^(nw|love)\.dll$/i.test(x))))lists.push({f,zip:true});}
 for(const c of lists){let l=null;try{l=c.asar?kit.asarList(c.f):kit.zipList(c.f);}catch{}if(!l)continue;
  for(const e of l){if(e.encrypted||!(TEXT.test(e.name)||RAW.test(e.name)||/\.(gb|gbc)$/i.test(e.name)))continue;const sz=c.asar?e.size:e.raw;if(sz>MAXSIZE)continue;
   const rd=c.asar?()=>kit.readAt(c.f,e.offset,e.size):()=>kit.zipRead(c.f,e);add({...mk(e.name,sz,rd,c.f,c.asar?n=>kit.readAt(c.f,e.offset,Math.min(n,e.size)):null),packed:true});}}
 memo.set(dir,{key,list:out});if(memo.size>200)memo.delete(memo.keys().next().value);return out;}

/* ---- text helpers ------------------------------------------------------------------------------------------------ */
const CJK=/[぀-ヿ㐀-鿿]/;
const ent=s=>s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi,(m,e)=>{e=e.toLowerCase();if(e[0]==='#')return String.fromCodePoint(e[1]==='x'?parseInt(e.slice(2),16):+e.slice(1));return {lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",nbsp:' '}[e];});
const noTags=s=>ent(s.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,''));
const keep=t=>CJK.test(t);
const clean=t=>String(t).replace(/\r/g,'').trim();
const ESC={n:'\n',t:'\t',r:'',b:'',f:'',v:'',0:''};
function unesc(s,i,out){const d=s[i+1];if(d==='u'){if(s[i+2]==='{'){const e=s.indexOf('}',i);out.s+=String.fromCodePoint(parseInt(s.slice(i+3,e),16));return e+1;}out.s+=String.fromCharCode(parseInt(s.slice(i+2,i+6),16));return i+6;}
 if(d==='x'){out.s+=String.fromCharCode(parseInt(s.slice(i+2,i+4),16));return i+4;}if(d==='\n'){return i+2;}if(d==='\r'){return s[i+2]==='\n'?i+3:i+2;}
 out.s+=d in ESC?ESC[d]:d;return i+2;}
/* JavaScript string literals in order (comments skipped; template literals taken whole) */
function jsStrings(t){const out=[],n=t.length;let i=0;
 while(i<n){const c=t[i];
  if(c==='/'&&t[i+1]==='/'){i=t.indexOf('\n',i);if(i<0)break;continue;}
  if(c==='/'&&t[i+1]==='*'){i=t.indexOf('*/',i+2);if(i<0)break;i+=2;continue;}
  if(c==='"'||c==="'"||c==='`'){const o={s:''};let j=i+1;while(j<n&&t[j]!==c){if(t[j]==='\\'){j=unesc(t,j,o);}else if(t[j]==='\n'&&c!=='`')break;else o.s+=t[j++];}out.push(o.s);i=j+1;continue;}
  i++;}
 return out;}
/* Lua string literals: "..", '..', [[..]] / [=[..]=]; -- and --[[ ]] comments */
function luaStrings(t){const out=[],n=t.length;let i=0;
 const longEnd=(at,eq)=>t.indexOf(']'+'='.repeat(eq)+']',at);
 while(i<n){const c=t[i];
  if(c==='-'&&t[i+1]==='-'){const m=/^\[(=*)\[/.exec(t.slice(i+2,i+40));if(m){const e=longEnd(i+2+m[0].length,m[1].length);if(e<0)break;i=e+m[1].length+2;}else{i=t.indexOf('\n',i);if(i<0)break;}continue;}
  if(c==='['){const m=/^\[(=*)\[/.exec(t.slice(i,i+40));if(m){const e=longEnd(i+m[0].length,m[1].length);if(e<0)break;out.push(t.slice(i+m[0].length,e).replace(/^\r?\n/,''));i=e+m[1].length+2;continue;}}
  if(c==='"'||c==="'"){const o={s:''};let j=i+1;while(j<n&&t[j]!==c){if(t[j]==='\\'){const d=t[j+1];if(/\d/.test(d)){const m=/^\d{1,3}/.exec(t.slice(j+1,j+4));o.s+=String.fromCharCode(+m[0]);j+=1+m[0].length;}else if(d==='z'){j+=2;while(/\s/.test(t[j]||'x'))j++;}else j=unesc(t,j,o);}else if(t[j]==='\n')break;else o.s+=t[j++];}out.push(o.s);i=j+1;continue;}
  i++;}
 return out;}
const SKIPKEYS=/^(name|path|file|filename|filepath|uuid|id|type|__type__|class|layer|image|sound|font|animation|tags|resourceName)$/i;
function jsonStrings(v,out=[],key=''){if(typeof v==='string'){if(keep(v)&&!SKIPKEYS.test(key))out.push(v);}else if(Array.isArray(v))for(const x of v)jsonStrings(x,out,key);else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))jsonStrings(x,out,k);return out;}
const parseJson=t=>JSON.parse(t.charCodeAt(0)===0xfeff?t.slice(1):t);
/* a JSON document, or JS that assigns / wraps one ("gdjs.projectData = {...};") */
function jsonOf(t){try{return parseJson(t);}catch{}const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a>=0&&b>a)try{return JSON.parse(t.slice(a,b+1));}catch{}return null;}
const res=(lines,anchors=[],extra={})=>({lines,anchors,...extra});
const simple=a=>res(a.map(clean).filter(keep));

/* ---- engine specific readers ------------------------------------------------------------------------------------ */
/* Twine 2 (published HTML <tw-storydata>/<tw-passagedata>; Harlowe, SugarCube, Snowman, Chapbook) and Twine 1 tiddlers */
function twine(t){const lines=[],anchors=[];const passages=[];
 for(const m of t.matchAll(/<tw-passagedata\b([^>]*)>([\s\S]*?)<\/tw-passagedata>/g)){const a=m[1],nm=/\bname="([^"]*)"/.exec(a),tg=/\btags="([^"]*)"/.exec(a);passages.push({name:ent(nm?nm[1]:''),tags:tg?tg[1]:'',text:ent(m[2])});}
 if(!passages.length)for(const m of t.matchAll(/<div\b[^>]*\btiddler="([^"]*)"[^>]*>([\s\S]*?)<\/div>/g))passages.push({name:ent(m[1]),tags:'',text:ent(m[2]).replace(/\\n/g,'\n')});
 for(const p of passages){if(/\b(script|stylesheet|widget)\b/i.test(p.tags)||/^Story(Init|Script|Stylesheet)$/i.test(p.name))continue;
  let x=p.text.replace(/<<(?:link|button|linkreplace|linkappend|linkprepend)\s+(?:"([^"]*)"|'([^']*)'|\[\[([^\]|]*))[^>]*>>/g,(_,a,b,c)=>a||b||c||'')
   .replace(/<<[\s\S]*?>>/g,'').replace(/\[\[([^\]]*?)(?:\]\[[^\]]*)?\]\]/g,(_,s)=>{let l=s;let k;if((k=l.indexOf('|'))>=0)l=l.slice(0,k);else if((k=l.indexOf('->'))>=0)l=l.slice(0,k);else if((k=l.indexOf('<-'))>=0)l=l.slice(k+2);return l;})
   .replace(/\([a-z0-9-]+:[^)]*\)/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/\{\{[\s\S]*?\}\}/g,'');
  const got=x.split('\n').map(clean).filter(keep);if(got.length){anchors.push(p.name);lines.push(...got);}}
 return res(lines,anchors);}
/* WebGAL scene/*.txt: "speaker:text -args;", commands "changeBg:x;", intro:a|b; choose:text:scene|text:scene; */
const WG_CMD=new Set('changebg changefigure bgm playeffect playvideo unlockcg unlockbgm label jumplabel callscene changescene setvar end pixiinit pixiperform setanimation settransform miniavatar getuserinput settextbox settempanimation applystyle wait filmmode showvars setcomplexanimation settransition setfilter'.split(' '));
function webgal(t){const lines=[],anchors=[],speakers=[];
 for(let raw of t.split(/\r?\n/)){raw=raw.trim();if(!raw||raw[0]===';')continue;raw=raw.replace(/;\s*$/,'');
  const cut=/\s-[A-Za-z0-9_]+(?:[=.]\S*)?(?=\s|$)/.exec(raw);let body=cut?raw.slice(0,cut.index):raw;
  const colon=body.search(/[:：]/);const cmd=colon>=0?body.slice(0,colon).trim():'';
  if(WG_CMD.has(cmd.toLowerCase())){anchors.push(raw);continue;}
  if(cmd.toLowerCase()==='intro'){for(const x of body.slice(colon+1).split('|').map(clean))if(keep(x)){lines.push(x);speakers.push('');}continue;}
  if(cmd.toLowerCase()==='choose'){for(const o of body.slice(colon+1).split('|')){const k=o.lastIndexOf(':'),x=clean(k>=0?o.slice(0,k):o);if(keep(x)){lines.push(x);speakers.push('');}}continue;}
  const text=clean(colon>=0?body.slice(colon+1):body);if(!keep(text))continue;
  if(colon>=0&&cmd&&keep(cmd)&&!keep(text.slice(0,1)))speakers.push(cmd);else speakers.push(colon>=0?cmd:'');
  lines.push(text.replace(/\\n/g,'\n'));}
 return res(lines,anchors,speakers.some(Boolean)?{speakers}:{});}
/* Narrat .narrat: the first double-quoted string of a line; talk / think lines give the speaker */
function narrat(t){const lines=[],speakers=[];
 for(const raw of t.split(/\r?\n/)){const l=raw.trim();if(!l||l.startsWith('//'))continue;const m=/"((?:[^"\\]|\\.)*)"/.exec(l);if(!m||!keep(m[1]))continue;const p=/^(?:talk|think)\s+(\S+)/.exec(l);lines.push(clean(m[1].replace(/\\n/g,'\n').replace(/\\"/g,'"')));speakers.push(p?p[1]:'');}
 return res(lines,[],speakers.some(Boolean)?{speakers}:{});}
/* RenJS story/*.yaml: "- character expression: text", "- text", choices; the value after the first ": " when the key is ASCII */
function renjs(t){const lines=[];
 for(const raw of t.split(/\r?\n/)){const l=raw.replace(/#.*$/,m=>keep(m)?m:'').trim();if(!l)continue;let v=l.replace(/^-\s*/,'');
  const k=/^[A-Za-z_][\w ]*:\s+(.*)$/.exec(v);if(k)v=k[1];v=v.replace(/^["']|["']$/g,'');if(keep(v)&&!/^[\w.]+:\s*$/.test(v))lines.push(clean(v));}
 return res(lines);}
/* ink compiled JSON: "^text" strings, "\n" ends a line; choice text sits in its own container */
function ink(t){const doc=jsonOf(t);if(!doc||doc.inkVersion===undefined)return res([]);const lines=[];let buf='';
 const flush=()=>{const x=clean(buf);if(keep(x))lines.push(x);buf='';};
 const walk=a=>{for(const e of a){if(typeof e==='string'){if(e[0]==='^')buf+=e.slice(1);else if(e==='\n')flush();}else if(Array.isArray(e)){flush();walk(e);flush();}else if(e&&typeof e==='object'){for(const [k,v] of Object.entries(e))if(Array.isArray(v)&&k!=='listDefs'){flush();walk(v);flush();}}}};
 walk(doc.root||[]);flush();return res(lines);}
/* ink source: text lines minus logic, choice markers, diverts, tags */
function inksrc(t){const lines=[];
 for(let l of t.split(/\r?\n/)){l=l.trim();if(!l||/^(\/\/|~|VAR\b|CONST\b|INCLUDE\b|LIST\b|EXTERNAL\b|=|->)/.test(l)||/^\/\*/.test(l))continue;
  l=l.replace(/^[*+\-\s]+(?:\([^)]*\)\s*)?/,'').replace(/\{[^}]*\}/g,'').replace(/->.*$/,'').replace(/#.*$/,'').replace(/\[([^\]]*)\]/g,'$1').trim();if(keep(l))lines.push(l);}
 return res(lines);}
/* Bitsy game data (inside the exported HTML, or a .bitsy file): "DLG id" blocks, ended by a blank line; """ multi-line */
function bitsy(t){const m=/<script[^>]*bitsyGameData[^>]*>([\s\S]*?)<\/script>/i.exec(t),src=(m?m[1]:t).replace(/\r/g,''),lines=[],anchors=[];const L=src.split('\n');
 for(let i=0;i<L.length;i++){const h=/^DLG\s+(\S+)/.exec(L[i]);if(!h)continue;const body=[];i++;
  if(L[i]!==undefined&&L[i].trim()==='"""'){i++;while(i<L.length&&L[i].trim()!=='"""'){body.push(L[i]);i++;}}else while(i<L.length&&L[i].trim()!==''){body.push(L[i]);i++;}
  const x=clean(body.join('\n').replace(/\{\/?[a-z]+\}/gi,'').replace(/\{[^}]*\}/g,''));if(keep(x)){anchors.push(h[1]);lines.push(x);}}
 return res(lines,anchors);}
/* GB Studio project: events EVENT_TEXT / EVENT_CHOICE etc. (args.text is a string or an array of strings) */
function gbs(t){const doc=jsonOf(t);const lines=[];if(!doc)return res(lines);
 const take=v=>{if(Array.isArray(v))v.forEach(take);else if(typeof v==='string'&&keep(v))lines.push(clean(v));};
 const walk=o=>{if(Array.isArray(o)){o.forEach(walk);return;}if(!o||typeof o!=='object')return;
  if(typeof o.command==='string'&&/^EVENT_(TEXT|CHOICE|MENU|ACTOR_SET_NAME|SET_INPUT_SCRIPT)/.test(o.command)&&o.args){for(const [k,v] of Object.entries(o.args))if(/^(text|trueText|falseText|option\d*|title)$/.test(k))take(v);}
  for(const v of Object.values(o))if(v&&typeof v==='object')walk(v);};
 walk(doc);return res(lines);}
/* RPG Maker data (Visual Novel Maker packs MZ-format maps / common events): rpgmaker.cjs on the wrapper it defines */
function rpg(buf){return require('./rpgmaker.cjs').parse(buf);}
/* strings of a binary (Defold game.arcd, Corona resource.car): UTF-8 runs holding kana or ideographs */
function raw(buf){const lines=[];const s=buf.toString('utf8');for(const m of s.matchAll(/[^\u0000-\u001f�]{2,}/g))if(keep(m[0])&&m[0].length<400)lines.push(clean(m[0]));return res(lines);}
/* HTML: text nodes outside script / style, plus inline script strings */
function html(t){const lines=[];t=t.replace(/<!--[\s\S]*?-->/g,'');
 for(const m of t.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))for(const s of jsStrings(m[1]))if(keep(s))lines.push(clean(noTags(s)));
 const body=t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'');for(const x of body.split(/<[^>]*>/))if(keep(x))lines.push(clean(ent(x)));
 return res(lines.filter(Boolean));}

const KINDS={
 js:t=>simple(jsStrings(t).map(s=>noTags(s))),lua:t=>simple(luaStrings(t)),json:t=>{const d=jsonOf(t);return simple(d?jsonStrings(d).map(noTags):[]);},
 plist:t=>simple([...t.matchAll(/<string>([\s\S]*?)<\/string>/g)].map(m=>ent(m[1]))),
 txt:t=>simple(t.split(/\r?\n/)),yaml:t=>renjs(t),html:t=>html(t),twine:twine,webgal:webgal,narrat:narrat,ink:ink,inksrc:inksrc,bitsy:bitsy,gbs:gbs,
};
/* Monogatari: "y 「text」" dialogue strings in js/script.js (first ASCII word = character id) */
function monogatari(t){const lines=[],speakers=[];
 for(const s of jsStrings(t)){if(!keep(s))continue;const m=/^([A-Za-z_][\w-]*)\s+(?=\S)/.exec(s),rest=m?s.slice(m[0].length):s,sp=m&&keep(rest)&&!/^(centered|nvl|clear|wait|show|hide|play|stop|jump|call)$/i.test(m[1])?m[1]:'';
  lines.push(clean(noTags(sp?rest:(m&&/^(centered|nvl)$/i.test(m[1])?rest:s))));speakers.push(sp);}
 return res(lines,[],speakers.some(Boolean)?{speakers}:{});}
KINDS.monogatari=monogatari;

/* ---- profiles ---------------------------------------------------------------------------------------------------- */
const has=(es,re)=>es.some(e=>re.test(e.name));
const pickText=(e,re,kind)=>re.test(e.name)?kind:null;
const sniff=(e,n,re)=>{try{return re.test(e.head(n).toString('utf8'));}catch{return false;}};
const byExt=(e,map)=>{for(const [re,k] of map)if(re.test(e.name))return k;return null;};
const GENERIC_MAP=[[/\.js$/i,'js'],[/\.json$/i,'json'],[/\.html?$/i,'html']];
const nonVendor=e=>!VENDOR.test(e.name)&&!/(^|\/)(package|package-lock|manifest|locales?)[^/]*\.json$/i.test(e.name);
const PROFILES={
 vnmaker:{name:'Visual Novel Maker',hint:'NW.js 内 data\\*.json（RPG Maker MZ 格式）',
  /* E605: loose www\data or data\ with System.json + MapInfos.json is RPG Maker MV/MZ itself; VNM only when that data
     sits inside its NW.js package and no RPG Maker core js ships with it */
  detect:es=>es.some(e=>e.packed&&/(^|\/)data\/System\.json$/i.test(e.name))&&es.some(e=>e.packed&&/(^|\/)data\/MapInfos\.json$/i.test(e.name))&&!has(es,/(^|\/)(rpg_core|rmmz_core|rpg_managers|rmmz_managers)\.js$/i),
  pick:e=>/(^|\/)data\/(map\d+|commonevents|troops)\.json$/i.test(e.name)?'rpg':/(^|\/)data\/(?!system|mapinfos|actors|classes|skills|items|weapons|armors|enemies|states|animations|tilesets)[^/]+\.json$/i.test(e.name)?'json':null},
 twine:{name:'Twine / SugarCube',hint:'*.html 内 <tw-storydata>',
  detect:es=>es.some(e=>/\.html?$/i.test(e.name)&&sniff(e,16384,/<tw-storydata\b|<div[^>]*id="storeArea"/i)),
  pick:e=>/\.html?$/i.test(e.name)&&sniff(e,16384,/<tw-storydata\b|<div[^>]*id="storeArea"/i)?'twine':null},
 webgal:{name:'WebGAL',hint:'scene\\*.txt',
  detect:es=>has(es,/(^|\/)(game\/)?scene\/start\.txt$/i),
  pick:e=>/(^|\/)scene\/.*\.txt$/i.test(e.name)?'webgal':null},
 monogatari:{name:'Monogatari',hint:'js\\script.js',
  detect:es=>has(es,/monogatari/i)||has(es,/(^|\/)js\/script\.js$/i)&&has(es,/(^|\/)js\/options\.js$/i)&&has(es,/(^|\/)js\/storage\.js$/i),
  pick:e=>/(^|\/)js\/script\.js$|(^|\/)script\/[^/]+\.js$/i.test(e.name)?'monogatari':null},
 renjs:{name:'RenJS',hint:'story\\*.yaml',
  detect:es=>has(es,/renjs[^/]*\.js$/i)||has(es,/(^|\/)story\/(setup|config)\.ya?ml$/i),
  pick:e=>/(^|\/)story\/.*\.ya?ml$/i.test(e.name)?'yaml':null},
 narrat:{name:'Narrat',hint:'*.narrat',
  detect:es=>has(es,/\.narrat$/i)||has(es,/narrat[^/]*\.js$/i),
  pick:e=>/\.narrat$/i.test(e.name)?'narrat':null},
 ink:{name:'ink (inkle)',hint:'*.ink.json',
  detect:es=>es.some(e=>/\.json$/i.test(e.name)&&sniff(e,128,/^\s*\{\s*"inkVersion"/)),
  pick:e=>/\.json$/i.test(e.name)&&sniff(e,128,/^\s*\{\s*"inkVersion"/)?'ink':/\.ink$/i.test(e.name)?'inksrc':null},
 bitsy:{name:'Bitsy',hint:'*.html 内 bitsyGameData',
  detect:es=>es.some(e=>/\.(html?|bitsy)$/i.test(e.name)&&e.size<4<<20&&sniff(e,e.size,/bitsyGameData|(^|\n)DLG \S/)),
  pick:e=>/\.(html?|bitsy|txt)$/i.test(e.name)&&e.size<4<<20&&sniff(e,e.size,/bitsyGameData|(^|\n)DLG /)?'bitsy':null},
 gbstudio:{name:'GB Studio',hint:'project.gbsproj（网页导出只有 ROM：需实物）',
  detect:es=>has(es,/\.gbsproj$/i)||has(es,/\.gbc?$/i)&&has(es,/(^|\/)index\.html?$/i)&&has(es,/(^|\/)(gbs|game)[^/]*\.js$/i),
  pick:e=>/\.gbsproj$/i.test(e.name)?'gbs':null},
 gdevelop:{name:'GDevelop',hint:'data.js + code*.js',
  detect:es=>has(es,/(^|\/)data\.js$/i)&&(has(es,/(^|\/)(runtimegame|gd)\.js$/i)||has(es,/(^|\/)gdjs-evtsext/i)||has(es,/(^|\/)code0\.js$/i)),
  pick:e=>/(^|\/)data\.js$/i.test(e.name)?'json':/(^|\/)code\d+\.js$/i.test(e.name)?'js':null},
 construct:{name:'Construct',hint:'data.js / data.json',
  detect:es=>has(es,/(^|\/)(c2runtime|c3runtime)\.js$/i)||has(es,/(^|\/)scripts\/c3runtime\.js$/i),
  pick:e=>/(^|\/)data\.(js|json)$/i.test(e.name)?'json':/(^|\/)scripts\/(?!c3runtime|.*\.min\.).*\.js$/i.test(e.name)?'js':null},
 decker:{name:'Decker',hint:'*.deck',
  detect:es=>has(es,/\.deck$/i)||es.some(e=>/\.html?$/i.test(e.name)&&sniff(e,16384,/<script[^>]*language="decker"/i)),
  pick:e=>/\.deck$/i.test(e.name)?'js':/\.html?$/i.test(e.name)&&sniff(e,16384,/language="decker"/i)?'js':null},
 cocos:{name:'Cocos2d',hint:'res / src / assets 内 json、lua、plist、js',
  detect:es=>has(es,/(^|\/)project\.json$/i)&&has(es,/(^|\/)main\.js$/i)&&(has(es,/(^|\/)src\//i)||has(es,/(^|\/)res\//i))||has(es,/(^|\/)(src\/)?cocos2d[^/]*\.js$/i)||has(es,/(^|\/)assets\/main\/index\.js$/i)||has(es,/(^|\/)(res|src)\/.*\.(lua|plist)$/i)&&has(es,/(^|\/)main\.lua$/i),
  pick:e=>nonVendor(e)&&!/cocos2d/i.test(e.name)?byExt(e,[[/\.lua$/i,'lua'],[/\.plist$/i,'plist'],[/\.json$/i,'json'],[/\.js$/i,'js']]):null},
 love:{name:'LÖVE',hint:'*.love 内 lua / json / txt',
  detect:es=>has(es,/(^|\/)conf\.lua$/i)&&has(es,/(^|\/)main\.lua$/i),
  pick:e=>byExt(e,[[/\.lua$/i,'lua'],[/\.json$/i,'json'],[/\.txt$/i,'txt'],[/\.csv$/i,'txt']])},
 defold:{name:'Defold',hint:'game.arcd（LZ4 压缩：需实物）',
  detect:es=>has(es,/(^|\/)game\.arcd$/i),
  pick:e=>/(^|\/)game\.arcd$/i.test(e.name)?'raw':null},
 solar2d:{name:'Corona / Solar2D',hint:'main.lua / resource.car（.car：需实物）',
  detect:es=>has(es,/(^|\/)resource\.car$/i)||has(es,/(^|\/)main\.lua$/i)&&has(es,/(^|\/)config\.lua$/i)&&!has(es,/(^|\/)conf\.lua$/i),
  pick:e=>/(^|\/)resource\.car$/i.test(e.name)?'raw':/\.lua$/i.test(e.name)?'lua':/\.json$/i.test(e.name)?'json':null},
 html5:{name:'HTML5 / Electron / NW.js',hint:'index.html + js / json（O2 / Novelsphere、HTMLVN、Phaser / PixiJS 同属这一类）',
  detect:es=>has(es,/(^|\/)index\.html?$/i)&&has(es,/(^|\/)package\.json$/i)||has(es,/novelsphere|htmlvn|nvlmaker|cloudnovel/i),
  pick:e=>nonVendor(e)?byExt(e,GENERIC_MAP):null},
};
/* the engines named in the registry that read through a profile (several names, one generic reader) */
const ALIASES={'O2 Engine / Novelsphere':'html5','HTMLVN':'html5','Phaser / PixiJS':'html5','NVLMaker':'html5','CloudNovel':'html5'};

/* ---- wrapping: a scene's read() gives "WVN\0<kind>\0" + bytes so parse() knows how to read it ----------------------- */
const wrap=(kind,buf)=>Buffer.concat([Buffer.from('WVN\0'+kind+'\0','latin1'),buf]);
function parse(buf){buf=Buffer.isBuffer(buf)?buf:Buffer.from(buf);let kind='js',body=buf;
 if(buf.length>5&&buf.toString('latin1',0,4)==='WVN\0'){const e=buf.indexOf(0,4);kind=buf.toString('latin1',4,e);body=buf.subarray(e+1);}
 try{if(kind==='rpg')return rpg(body);if(kind==='raw')return raw(body);return (KINDS[kind]||KINDS.js)(decode(body));}catch{return res([]);}}
function actorsOf(es){const a=es.find(e=>/(^|\/)data\/Actors\.json$/i.test(e.name));try{return a?(parseJson(a.read().toString('utf8'))||[]).map(x=>x&&typeof x.name==='string'?x.name:''):[];}catch{return [];}}
function scenesOf(id,dir,gated){const p=PROFILES[id];const es=entries(dir,!gated);if(!es.length)return [];if(gated&&!p.detect(es))return [];
 const actors=id==='vnmaker'?actorsOf(es):[],out=[];
 for(const e of es){const kind=p.pick(e);if(!kind)continue;
  out.push({name:e.name,read:kind==='rpg'?()=>wrap('rpg',Buffer.from(JSON.stringify({rpgmaker:1,name:path.posix.basename(e.name),actors,data:parseJson(e.read().toString('utf8'))}))):()=>wrap(kind,e.read()),_e:e});}
 return out.sort((a,b)=>a.name.localeCompare(b.name)).map(({name,read})=>({name,read}));}
const engines={};
for(const id of Object.keys(PROFILES)){const p=PROFILES[id];
 engines[id]={id,hint:p.hint,
  scenes:dir=>scenesOf(id,dir,true),archives:dir=>scenesOf(id,dir,false),
  sources:dir=>{const es=entries(dir);if(!es.length||!p.detect(es))return [];return [...new Set(es.filter(e=>p.pick(e)).map(e=>e.from||e.name))].slice(0,400);},
  parse,test:n=>TEXT.test(n)};}
/* registry: does this folder look like engine id (detect only, no text read) */
function probe(dir,id){try{const es=entries(dir);return es.length>0&&PROFILES[id].detect(es);}catch{return false;}}
module.exports={engines,PROFILES,ALIASES,probe,parse,entries,jsStrings,luaStrings,KINDS,norm};
