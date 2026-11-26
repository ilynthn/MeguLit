// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E362 one-click diagnostic package for one library game.
   build(root,db,id,{version}) writes data/diagnostics/MeguLit-diag-<game>-<stamp>.zip and returns the exact list of what is inside,
   so the UI can show it before anything leaves the PC. Nothing here uploads: see diagnostics-upload.cjs.
   Contents: logs/<name>.log (the last ~2000 lines of each log that fall inside this game's runs), info.json (game, engine,
   MeguLit version, OS, original-text state, embed/hook evidence), README.txt (what each file is), and screenshot.png only when
   a screenshot already sits on disk. Every text file is scrubbed: Windows user name and profile paths become placeholders,
   e-mail addresses are removed. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const LOGS=['hook-diagnostics.log','hook-events.log','reader-host.log','game-launch.log',/* engine-draw: every ToMe_CHARS record (roles, boxes, emb) */'engine-draw.log'];
const MAX_LINES=2000,READ_BYTES=8*1024*1024,RUN_LEAD_MS=5000,RUN_MAX_MS=12*3600*1000;
/* the library stores some times in seconds, some in ms */
const ms=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?(n<1e12?n*1000:n):null;};

/* ---------- privacy ---------- */
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function identity(extra={}){
 let user='';try{user=os.userInfo().username||'';}catch{}
 return {user:extra.user??(process.env.USERNAME||user),profile:extra.profile??(process.env.USERPROFILE||os.homedir()||''),names:(extra.names||[]).filter(Boolean)};
}
/* Profile path → %USERPROFILE% (any slash style, JSON-escaped too), any other C:\Users\<name> → C:\Users\<user>,
   the bare user name → <user>, e-mails → <email>. */
function scrub(text,who=identity()){
 let out=String(text??'');
 out=out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?!(?:exe|dll|dat|bin|ypf|xp3|int|arc|pak|pck|ain|asm|sys)\b)[A-Za-z]{2,}\b/g,'<email>');
 const profile=String(who.profile||'').replace(/[\\/]+$/,'');
 if(profile.length>3){const parts=profile.split(/[\\/]+/).map(escapeRe);out=out.replace(new RegExp(parts.join('(?:\\\\{1,2}|/)'),'gi'),'%USERPROFILE%');}
 out=out.replace(/([A-Za-z]:(?:\\{1,2}|\/)(?:Users|Documents and Settings)(?:\\{1,2}|\/))(?!Public\b|Default\b|All Users\b)[^\\/"'\r\n<>|:*?]+/gi,'$1<user>');
 /* 2026-11-27 a Microsoft-account profile folder is often not the user name (megumin → megum): that folder name goes too */
 const folder=profile.length>3?profile.split(/[\\/]+/).pop():'';
 for(const name of [who.user,folder,...(who.names||[])].map(v=>String(v||'').trim()).filter(v=>v.length>=2&&!/^(?:user|admin|administrator)$/i.test(v)))
  out=out.replace(new RegExp('(^|[^\\p{L}\\p{N}_])'+escapeRe(name)+'(?=$|[^\\p{L}\\p{N}_])','giu'),'$1<user>');
 return out;
}

/* ---------- logs ---------- */
function tailText(file,bytes=READ_BYTES){
 try{const size=fs.statSync(file).size,start=Math.max(0,size-bytes),fd=fs.openSync(file,'r');try{const buffer=Buffer.alloc(size-start);fs.readSync(fd,buffer,0,buffer.length,start);let text=buffer.toString('utf8');if(start>0)text=text.slice(text.indexOf('\n')+1);return text;}finally{fs.closeSync(fd);}}catch{return '';}
}
function readLog(root,name){
 const file=path.join(root,'logs',name),previous=tailText(file+'.previous',READ_BYTES/2),current=tailText(file);
 return (previous+(previous&&!previous.endsWith('\n')?'\n':'')+current).split(/\r?\n/).filter(line=>line.length);
}
/* "2026-11-07T16:25:48.6473157Z info …" or {"at":"…"} → ms, else NaN */
function lineTime(line){
 let m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?(Z|[+-]\d\d:?\d\d)?/.exec(line);
 if(!m)m=/"(?:at|time|ts)"\s*:\s*"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?(Z|[+-]\d\d:?\d\d)?"/.exec(line);
 if(!m)return NaN;return Date.parse(m[1]+(m[2]?m[2].slice(0,4):'')+(m[3]||'Z'));
}
function launchEntries(root){
 const out=[];for(const line of readLog(root,'game-launch.log')){try{const v=JSON.parse(line);const at=Date.parse(v.at);if(v.gameId&&Number.isFinite(at))out.push({...v,at});}catch{}}
 return out.sort((a,b)=>a.at-b.at);
}
/* A run starts at a launch-request (or the first entry) of this game and lasts until another game is launched (at most 12 h). */
function runWindows(entries,id,now=Date.now()){
 const windows=[];let open=null;
 for(const e of entries){
  if(e.gameId===id){if(!open||e.stage==='launch-request'){if(open)windows.push(open);open={from:e.at-RUN_LEAD_MS,to:now};}}
  else if(open&&e.stage==='launch-request'){open.to=e.at;windows.push(open);open=null;}
 }
 if(open)windows.push(open);for(const w of windows)w.to=Math.min(w.to,w.from+RUN_MAX_MS);return windows;
}
function lastLaunch(entries,id){let last=null;for(const e of entries)if(e.gameId===id)last=e;return last?{stage:String(last.stage||''),at:last.at,error:last.error?String(last.error).slice(0,200):undefined}:null;}
/* Lines inside the windows; an untimed line follows the line before it. Lines naming the executable always count. */
function filterLines(lines,windows,needles=[],limit=MAX_LINES){
 const kept=[];let inside=false;const lower=needles.map(n=>String(n).toLowerCase()).filter(n=>n.length>=3);
 for(const line of lines){const t=lineTime(line);if(Number.isFinite(t))inside=windows.some(w=>t>=w.from&&t<=w.to);if(inside||lower.some(n=>line.toLowerCase().includes(n)))kept.push(line);}
 return kept.slice(-limit);
}

/* ---------- zip (store/deflate, UTF-8 names) ---------- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(buffer){let c=0xFFFFFFFF;for(let i=0;i<buffer.length;i++)c=CRC[(c^buffer[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zip(files,date=new Date()){
 const locals=[],centrals=[];let offset=0;
 const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),day=((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
 for(const f of files){
  const name=Buffer.from(f.name,'utf8'),data=Buffer.isBuffer(f.data)?f.data:Buffer.from(String(f.data),'utf8'),packed=zlib.deflateRawSync(data,{level:6}),deflate=packed.length<data.length,body=deflate?packed:data,crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(deflate?8:0,8);local.writeUInt16LE(time,10);local.writeUInt16LE(day,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(deflate?8:0,10);central.writeUInt16LE(time,12);central.writeUInt16LE(day,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,name,body);centrals.push(central,name);offset+=30+name.length+body.length;
 }
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}
/* Reads back the names and sizes of a zip written above (for tests and for re-showing the preview). */
function zipEntries(buffer){
 const out=[];const end=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));if(end<0)return out;let p=buffer.readUInt32LE(end+16);const count=buffer.readUInt16LE(end+10);
 for(let i=0;i<count;i++){const method=buffer.readUInt16LE(p+10),size=buffer.readUInt32LE(p+24),packed=buffer.readUInt32LE(p+20),nameLength=buffer.readUInt16LE(p+28),extra=buffer.readUInt16LE(p+30),comment=buffer.readUInt16LE(p+32),local=buffer.readUInt32LE(p+42),name=buffer.subarray(p+46,p+46+nameLength).toString('utf8');
  const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28),raw=buffer.subarray(start,start+packed);out.push({name,bytes:size,data:method===8?zlib.inflateRawSync(raw):raw});p+=46+nameLength+extra+comment;}
 return out;
}

/* ---------- evidence ---------- */
function gameRow(db,id){const row=db.prepare('SELECT * FROM games WHERE id=?').get(String(id));if(!row)throw Error('GAME_NOT_FOUND');let original={};try{original=JSON.parse(row.original||'{}');}catch{}return {row,library:original.library||{}};}
function hookStreams(root,executable){
 if(!executable)return null;const dir=path.join(root,'data','hook-streams'),base=path.basename(executable).toLowerCase();let size=-1;try{size=fs.statSync(executable).size;}catch{}
 let names=[];try{names=fs.readdirSync(dir).filter(n=>n.toLowerCase().startsWith(base+'-')&&n.endsWith('.json'));}catch{return null;}
 const pick=names.find(n=>n.toLowerCase()===`${base}-${size}.json`)||names[0];if(!pick)return null;
 try{return {file:pick,...JSON.parse(fs.readFileSync(path.join(dir,pick),'utf8'))};}catch{return {file:pick};}
}
function originalTextState(root,id){
 let saved=null;try{saved=JSON.parse(fs.readFileSync(path.join(root,'data','config','original-text.json'),'utf8'))[String(id)]||null;}catch{}
 let brief='unknown';try{brief=require('./original-text.cjs').brief(root,String(id));}catch{}
 if(saved&&typeof saved==='object'){const pick={};for(const k of ['status','patchStatus','engine','mode','error','updatedAt','checkedAt','lines','matched','coverage','provider'])if(saved[k]!=null)pick[k]=typeof saved[k]==='object'?saved[k]:String(saved[k]).slice(0,400);if(saved.runtime)pick.runtime={engine:saved.runtime.engine,file:saved.runtime.file,codepage:saved.runtime.codepage,version:saved.runtime.version,lines:saved.runtime.lines,japaneseLines:saved.runtime.japaneseLines};saved=pick;}
 return {brief,saved};
}
/* 2026-11-21 the game diff calibrated on this PC and the self-check windows of the running game (docs/auto-profile.md): the
   upload format the server aggregates; no paths, the program name only */
function autoProfile(root,executable,engine){try{const ap=require('../core/auto-profile.cjs');const key=executable?ap.exeKeySync(root,executable):'';if(!key)return null;const cur=require('./self-check-live.cjs').current();const session=cur?.reader.root===root&&cur.key===key&&cur.exe===executable?cur:null;const check=session?.check;return ap.diagnostic(session?.stored||ap.load(root,key,require('./original-text.cjs').contributionScript(root,executable)),check?.windows,check?.w.lines??null);}catch{return null;}}
function osInfo(){let version='';try{version=os.version();}catch{}return {platform:process.platform,release:os.release(),version,arch:process.arch,node:process.version,locale:Intl.DateTimeFormat().resolvedOptions().locale};}
function findScreenshot(root,executable,maxAgeMs=6*3600*1000){
 const dirs=[path.join(root,'data','screenshots'),path.join(root,'logs','screenshots'),path.join(root,'logs')];const base=executable?path.basename(executable,path.extname(executable)).toLowerCase():'';let best=null;
 for(const dir of dirs){let names=[];try{names=fs.readdirSync(dir);}catch{continue;}for(const n of names){if(!/\.(png|jpe?g)$/i.test(n))continue;const file=path.join(dir,n);let st;try{st=fs.statSync(file);}catch{continue;}if(!st.isFile()||st.size>8*1024*1024||Date.now()-st.mtimeMs>maxAgeMs)continue;if(dir.endsWith('logs')&&base&&!n.toLowerCase().includes(base))continue;if(!best||st.mtimeMs>best.mtime)best={file,mtime:st.mtimeMs,ext:path.extname(n).toLowerCase()};}}
 return best;
}
const slug=s=>String(s||'game').replace(/[\\/:*?"<>|\s]+/g,'_').replace(/_+/g,'_').slice(0,40)||'game';
const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z').replace('T','-');

function collect(root,db,id,{version='',now=new Date(),who=identity(),screenshot=true}={}){
 const {row,library}=gameRow(db,id),entries=launchEntries(root),windows=runWindows(entries,String(id),now.getTime()),exe=row.executable?path.basename(row.executable):'';
 const files=[],logInfo={};
 for(const name of LOGS){const all=readLog(root,name);const kept=name==='game-launch.log'?all.filter(l=>l.includes(`"gameId":"${id}"`)).slice(-MAX_LINES):filterLines(all,windows,exe?[exe]:[]);logInfo[name]={linesInLog:all.length,linesKept:kept.length};if(kept.length)files.push({name:'logs/'+name,data:scrub(kept.join('\n')+'\n',who),kind:'log'});}
 let overviewRow=null;try{overviewRow=require('./adaptation-overview.cjs').overview(db,root,{entries}).games.find(g=>g.id===String(id))||null;}catch{}
 const info={schema:1,yui:require('./yui.cjs').sessions(root).filter(s=>s.session===process.env.MEGULIT_YUI_SESSION),createdAt:now.toISOString(),megulit:{version:String(version||'')},os:osInfo(),
  game:{id:String(row.id),title:row.title,engine:String(library.engine||''),executable:row.executable||'',executableName:exe,available:!!row.executable&&fs.existsSync(row.executable),localeMode:library.localeMode||(library.localeJapanese===true?'japanese':'auto'),source:row.source,lastLaunchedAt:ms(row.last_launched_at)?new Date(ms(row.last_launched_at)).toISOString():null,removed:row.removed_at!=null},
  embed:{hookSupport:String(library.hook||'unknown'),hookVerifiedAt:ms(library.hookVerifiedAt)?new Date(ms(library.hookVerifiedAt)).toISOString():null,hookVerifiedStream:library.hookVerifiedStream||null,hookReadonlyAt:ms(library.hookReadonlyAt)?new Date(ms(library.hookReadonlyAt)).toISOString():null,hookReadonlyBuild:library.hookReadonlyBuild||null,hookVerdictStale:require('./hook-verdict.cjs').stale(library,require('./hook-verdict.cjs').appVersion(root)),hookStreams:hookStreams(root,row.executable)},
  originalText:originalTextState(root,id),autoProfile:autoProfile(root,row.executable,library.engine),adaptation:overviewRow?{reading:overviewRow.reading,zeroLatency:overviewRow.zeroLatency,evidence:overviewRow.evidence}:null,
  runs:windows.slice(-20).map(w=>({from:new Date(w.from).toISOString(),to:new Date(w.to).toISOString()})),logs:logInfo};
 files.unshift({name:'info.json',data:scrub(JSON.stringify(info,null,2),who),kind:'info'});
 const marks=require('./sentence-marks.cjs').read(root,id);
 if(marks.length)files.push({name:'sentence-marks.json',kind:'info',data:JSON.stringify({schema:1,marks},null,2)});
 const shot=screenshot?findScreenshot(root,row.executable):null;if(shot){try{files.push({name:'screenshot'+(shot.ext==='.png'?'.png':'.jpg'),data:fs.readFileSync(shot.file),kind:'screenshot'});}catch{}}
 const readme=['MeguLit diagnostic package','','Game: '+row.title,'Created: '+now.toISOString(),'',...files.map(f=>`${f.name}  ${f.kind==='log'?'log lines from this game\'s runs':f.kind==='info'?'game, engine, version, OS, original-text and embed evidence':'screenshot already on disk'}`),'','Privacy: the Windows user name and profile paths are replaced with <user> / %USERPROFILE%, e-mail addresses with <email>.'].join('\r\n');
 files.push({name:'README.txt',data:scrub(readme,who),kind:'readme'});
 return {files,info,title:row.title};
}
function build(root,db,id,options={}){
 const now=options.now||new Date(),{files,title,info}=collect(root,db,id,{...options,now}),dir=path.join(root,'data','diagnostics');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,`MeguLit-diag-${slug(title)}-${stamp(now)}.zip`),buffer=zip(files,now),temporary=file+'.tmp';fs.writeFileSync(temporary,buffer);fs.renameSync(temporary,file);
 prune(dir,20);
 return {path:file,name:path.basename(file),bytes:buffer.length,game:{id:String(id),title,engine:info.game.engine},version:info.megulit.version,entries:files.map(f=>({name:f.name,kind:f.kind,bytes:Buffer.isBuffer(f.data)?f.data.length:Buffer.byteLength(String(f.data)),preview:f.kind==='info'?String(f.data).slice(0,6000):undefined}))};
}
/* E394 one package for MeguLit as a whole (About → 一键上传日志): the newest logs of the last week, each cut to its last
   MAX_LINES lines, plus a short library overview, all scrubbed the same way. For a problem with one game the per-game
   package above is sharper; this one is for "something is wrong and I don't know where". */
const ALL_MAX_FILES=24,ALL_MAX_AGE_MS=7*24*3600*1000;
function collectAll(root,db,{version='',now=new Date(),who=identity(),extra=[]}={}){
 const dir=path.join(root,'logs');let names=[];
 try{names=fs.readdirSync(dir).filter(n=>/\.log$/i.test(n)).map(n=>{let st=null;try{st=fs.statSync(path.join(dir,n));}catch{}return st&&st.isFile()?{n,t:st.mtimeMs}:null;}).filter(Boolean).filter(f=>now.getTime()-f.t<=ALL_MAX_AGE_MS).sort((a,b)=>b.t-a.t).slice(0,ALL_MAX_FILES).map(f=>f.n);}catch{}
 const files=[],logInfo={};
 for(const name of names){const all=readLog(root,name),kept=all.slice(-MAX_LINES);logInfo[name]={linesInLog:all.length,linesKept:kept.length};if(kept.length)files.push({name:'logs/'+name,data:scrub(kept.join('\n')+'\n',who),kind:'log'});}
 let games=[];try{games=db.prepare('SELECT id,title,library FROM games ORDER BY last_launched_at DESC LIMIT 60').all().map(r=>{let lib={};try{lib=JSON.parse(r.library||'{}');}catch{}return {id:String(r.id),title:r.title,engine:String(lib.engine||''),hook:String(lib.hook||'')};});}catch{}
 const marked=require('./sentence-marks.cjs').all(root);
 if(marked.length)files.push({name:'sentence-marks.json',kind:'info',data:JSON.stringify({schema:1,games:marked},null,2)});
 /* log-export.cjs: the reader's own description (问题说明.txt), scrubbed like everything else */
 for(const f of extra)files.push({name:String(f.name),kind:'note',data:scrub(f.data,who)});
 const info={schema:1,yui:require('./yui.cjs').sessions(root),kind:'all',createdAt:now.toISOString(),megulit:{version:String(version||'')},os:osInfo(),games,logs:logInfo};
 files.unshift({name:'info.json',data:scrub(JSON.stringify(info,null,2),who),kind:'info'});
 const readme=['MeguLit diagnostic package (whole app)','','Created: '+now.toISOString(),'',...files.map(f=>`${f.name}  ${f.kind==='log'?'last lines of this log':f.kind==='note'?'what the user wrote about the problem':'MeguLit version, OS and the library'}`),'','Privacy: the Windows user name and profile paths are replaced by placeholders and e-mail addresses are removed.'].join('\n');
 files.push({name:'README.txt',data:scrub(readme,who),kind:'readme'});
 return {files,info};
}
function buildAll(root,db,options={}){
 const now=options.now||new Date(),{files,info}=collectAll(root,db,{...options,now}),dir=path.join(root,'data','diagnostics');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,`MeguLit-diag-all-${stamp(now)}.zip`),buffer=zip(files,now),temporary=file+'.tmp';fs.writeFileSync(temporary,buffer);fs.renameSync(temporary,file);
 prune(dir,20);
 return {path:file,name:path.basename(file),bytes:buffer.length,game:{id:'',title:'MeguLit',engine:''},version:info.megulit.version,entries:files.map(f=>({name:f.name,kind:f.kind,bytes:Buffer.byteLength(String(f.data)),preview:f.kind==='info'||f.kind==='note'?String(f.data).slice(0,6000):undefined}))};
}
/* keep the newest packages only */
function prune(dir,keep){try{const zips=fs.readdirSync(dir).filter(n=>/^MeguLit-diag-.*\.zip$/.test(n)).map(n=>({n,t:fs.statSync(path.join(dir,n)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const z of zips.slice(keep))fs.rmSync(path.join(dir,z.n),{force:true});}catch{}}
/* Only packages MeguLit itself wrote may be revealed or uploaded. */
function ownPackage(root,file){const dir=path.resolve(root,'data','diagnostics'),resolved=path.resolve(String(file||''));if(path.dirname(resolved).toLowerCase()!==dir.toLowerCase()||!/^MeguLit-diag-.*\.zip$/i.test(path.basename(resolved))||!fs.existsSync(resolved))throw Error('DIAGNOSTICS_NOT_FOUND');return resolved;}

module.exports={ms,build,buildAll,collectAll,collect,scrub,identity,zip,zipEntries,crc32,runWindows,launchEntries,lastLaunch,filterLines,lineTime,ownPackage,hookStreams,LOGS,MAX_LINES};
