'use strict';
/* 2026-11-14 (beta36: 学习 page showed only 「载入失败，请重试」) every module the packaged build ships must load:
   MeguLit.exe embeds web/ from the committed tree, so a missing file, an untracked file or a renamed export only shows up in the
   installed app. This walks every web module and checks each relative import (static and literal dynamic) and each imported name. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web');
const rel=f=>path.relative(ROOT,f).split(path.sep).join('/');
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='node_modules')walk(f,out);}else out.push(f);}return out;}
const files=walk(WEB),scripts=files.filter(f=>/\.(m?js)$/.test(f)&&!/[\\/]vendor[\\/]/.test(f));
/* tracked files = what a build from committed modules embeds; skipped when git is not available (e.g. an unpacked zip) */
let tracked=null;try{tracked=new Set(execFileSync('git',['ls-files','web'],{cwd:ROOT,encoding:'utf8'}).split(/\r?\n/).filter(Boolean));}catch{}
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g,'$1');
function isModule(src){return /(^|[\n;}])\s*(import\s*[{*\w]|import\s*['"]|export\s)/.test(src);}
function importsOf(src){const out=[];const s=strip(src);
 for(const m of s.matchAll(/(?:^|[\n;}])\s*import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s*as\s+[\w$]+)?\s*(?:from\s*)?['"]([^'"]+)['"]/g))out.push({spec:m[3],names:(m[2]||'').split(',').map(x=>x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean),def:!!m[1]});
 for(const m of s.matchAll(/(?:^|[\n;}])\s*export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g))out.push({spec:m[2],names:m[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)});
 for(const m of s.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g))out.push({spec:m[1],names:[],dynamic:true});
 return out.filter(i=>i.spec.startsWith('.')||i.spec.startsWith('/'));}
function exportsOf(src){const s=strip(src),names=new Set();
 for(const m of s.matchAll(/\bexport\s+(?:async\s+)?function\s*\*?\s*([\w$]+)/g))names.add(m[1]);
 for(const m of s.matchAll(/\bexport\s+class\s+([\w$]+)/g))names.add(m[1]);
 for(const m of s.matchAll(/\bexport\s+(?:const|let|var)\s+([^;]+)/g)){/* every top-level declarator: a=..., b=... */let depth=0,cur='';for(const ch of m[1]){if('([{'.includes(ch))depth++;else if(')]}'.includes(ch))depth--;if(ch===','&&depth===0){const n=/^\s*([\w$]+)/.exec(cur);if(n)names.add(n[1]);cur='';}else cur+=ch;}const n=/^\s*([\w$]+)/.exec(cur);if(n)names.add(n[1]);}
 for(const m of s.matchAll(/\bexport\s*\{([^}]*)\}/g))for(const part of m[1].split(','))if(part.trim())names.add(part.trim().split(/\s+as\s+/).pop().trim());
 if(/\bexport\s+default\b/.test(s))names.add('default');
 if(/\bexport\s*\*\s*from\b/.test(s))names.add('*');
 return names;}
function resolve(from,spec){const base=spec.startsWith('/')?path.join(WEB,spec.split(/[?#]/)[0]):path.resolve(path.dirname(from),spec.split(/[?#]/)[0]);return base;}

test('the web folder has modules to check',()=>{assert.ok(scripts.length>100,'only '+scripts.length+' scripts found');});
test('every relative import in web/ resolves to a shipped file',()=>{const problems=[];
 for(const file of scripts){const src=fs.readFileSync(file,'utf8');if(!isModule(src))continue;
  for(const imp of importsOf(src)){const target=resolve(file,imp.spec);
   if(!target.startsWith(WEB+path.sep)){problems.push(rel(file)+' imports outside web/: '+imp.spec);continue;}
   if(!fs.existsSync(target)||!fs.statSync(target).isFile()){problems.push(rel(file)+' imports missing '+imp.spec);continue;}
   if(tracked&&!tracked.has(rel(target)))problems.push(rel(file)+' imports '+rel(target)+' which is not committed (the packaged build would miss it)');}}
 assert.deepEqual(problems,[]);});
test('every imported name is exported by the module it comes from',()=>{const problems=[],cache=new Map();
 const exp=f=>{if(!cache.has(f))cache.set(f,exportsOf(fs.readFileSync(f,'utf8')));return cache.get(f);};
 for(const file of scripts){const src=fs.readFileSync(file,'utf8');if(!isModule(src))continue;
  for(const imp of importsOf(src)){const target=resolve(file,imp.spec);if(!/\.m?js$/.test(target)||!fs.existsSync(target))continue;const names=exp(target);if(names.has('*'))continue;
   for(const n of imp.names)if(!names.has(n))problems.push(rel(file)+' imports {'+n+'} from '+imp.spec+' but it is not exported');
   if(imp.def&&!names.has('default'))problems.push(rel(file)+' imports a default from '+imp.spec+' which has none');}}
 assert.deepEqual(problems,[]);});
test('index.html only references shipped scripts and stylesheets',()=>{const problems=[];
 for(const page of files.filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(page,'utf8');
  for(const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/g)){const ref=m[1];if(/^(https?:|data:|\/\/)/.test(ref))continue;
   const target=ref.startsWith('/')?path.join(WEB,ref):path.resolve(path.dirname(page),ref);
   if(!fs.existsSync(target))problems.push(rel(page)+' references missing '+ref);else if(tracked&&!tracked.has(rel(target)))problems.push(rel(page)+' references uncommitted '+ref);}}
 assert.deepEqual(problems,[]);});
test('the learning page keeps a failing review inside its tab',()=>{const app=fs.readFileSync(path.join(WEB,'app.js'),'utf8');
 assert.match(app,/if\(subtab==='review'\)\{try\{await review\(token,target\);\}catch\(error\)\{[^}]*learningFailed\(target,error,token\)/);
 /* the page-level retry button lives inside the empty state, so it is centred under the message */
 assert.match(app,/\(main\.querySelector\('\.empty-state'\)\|\|main\)\.insertAdjacentHTML\('beforeend',`<button class="primary" id="retry">/);});
test('font pickers work on a root that is not in the document yet (学习 › 复习 HUD)',async()=>{
 /* a tiny fake DOM: the Anki HUD builds its look panel off-document, so document.getElementById cannot see its datalist */
 const el=(tag,props={})=>{const e={tagName:tag.toUpperCase(),attrs:{},children:[],style:{setProperty(){}},dataset:{},hidden:false,value:'',className:'',...props,
  getAttribute(k){return k in this.attrs?this.attrs[k]:null;},setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];},
  append(...c){this.children.push(...c);},before(x){this.prev=x;},addEventListener(){},dispatchEvent(){},closest(){return null;},querySelectorAll(){return [];}};return e;};
 const listeners=[];globalThis.addEventListener=(...a)=>listeners.push(a);
 globalThis.Option=function(label,value){return {label,value};};globalThis.Event=function(type){this.type=type;};
 globalThis.document={addEventListener(){},getElementById:()=>null,createElement:tag=>el(tag),documentElement:{lang:'zh-CN'}};
 const src=fs.readFileSync(path.join(WEB,'select-control.js'),'utf8');
 const {enhanceSelects}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 const input=el('input',{value:'Meiryo'});input.attrs.list='hud-fonts';const orphan=el('input');orphan.attrs.list='nowhere';
 const datalist=el('datalist',{id:'hud-fonts',options:[{value:'Meiryo'},{value:'Yu Gothic'}]});
 const root={querySelectorAll:sel=>sel==='input[list]'?[input,orphan]:sel==='datalist'?[datalist]:[]};
 assert.doesNotThrow(()=>enhanceSelects(root));
 assert.equal(input.getAttribute('list'),null,'the font input was turned into a picker');assert.equal(input.prev.className,'font-control');
 const picker=input.prev.children[0];assert.deepEqual(picker.children.map(o=>o.value),['','Meiryo','Yu Gothic','__custom__']);assert.equal(picker.value,'Meiryo');
 assert.equal(orphan.getAttribute('list'),'nowhere','an input whose datalist is missing is left alone instead of throwing');
 delete globalThis.document;delete globalThis.Option;delete globalThis.Event;delete globalThis.addEventListener;});
