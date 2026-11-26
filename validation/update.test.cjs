'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   About → update: version comparison and release asset checks (offline). */
const test=require('node:test'),assert=require('node:assert/strict');
const u=require('../services/update.cjs');
test('update: semantic version comparison',()=>{
 assert.equal(u.newer('1.0.6','1.0.5'),true);assert.equal(u.newer('1.0.5','1.0.6'),false);
 assert.equal(u.newer('1.0.10','1.0.9'),true);assert.equal(u.newer('v1.1.0','1.0.99'),true);assert.equal(u.newer('1.0.5','1.0.5'),false);
});
test('update: only the official zip from GitHub is accepted',async()=>{
 const rel=assets=>async()=>({ok:true,json:async()=>({tag_name:'v9.9.9',assets})});
 await assert.rejects(u.latest(rel([{name:'other.zip',browser_download_url:'https://github.com/x'}])),/UPDATE_ASSET_MISSING/);
 await assert.rejects(u.latest(rel([{name:'MeguLit-v9.9.9-win-x64.zip',browser_download_url:'https://evil.example/MeguLit.zip'}])),/UPDATE_URL_REJECTED/);
 const ok=await u.latest(rel([{name:'MeguLit-v9.9.9-win-x64.zip',size:3,digest:'sha256:'+'a'.repeat(64),browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]));
 assert.equal(ok.version,'9.9.9');assert.equal(ok.digest,'a'.repeat(64));
});
test('update: background download reports real progress, verifies and reuses the package',async()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));u.reset();
 const zip=Buffer.concat([Buffer.from('PK'),crypto.randomBytes(300000)]),digest='sha256:'+crypto.createHash('sha256').update(zip).digest('hex');
 const rel={tag_name:'v9.9.9',body:'notes',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:zip.length,digest,browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]};
 const old={tag_name:'v1.1.0',assets:[{name:'MeguLit-v1.1.0-win-x64.zip',size:zip.length-1000,browser_download_url:'https://github.com/x'}]};
 let downloads=0,seen=[];
 const fetcher=async url=>{
  if(url.endsWith('/latest'))return {ok:true,json:async()=>rel};
  if(url.endsWith('/tags/v1.1.0'))return {ok:true,json:async()=>old};
  downloads++;let at=0;
  return {ok:true,url,headers:{get:()=>String(zip.length)},body:{getReader:()=>({read:async()=>{if(at>=zip.length)return {done:true};const v=zip.subarray(at,at+65536);at+=v.length;seen.push(u.status().received);return {done:false,value:v};}})}};
 };
 const info=await u.check('1.1.0',fetcher);assert.equal(info.newer,true);assert.equal(info.delta,1000);
 const done=await u.start(root,'1.1.0',fetcher);assert.equal(done.phase,'ready');assert.equal(done.received,zip.length);
 assert.ok(seen.some(n=>n>0&&n<zip.length),'progress moves during the download');
 /* every source is measured at once (core/fast-download.cjs), so the first run asks each once */const first=downloads;assert.ok(first>=1);
 u.reset();const again=await u.start(root,'1.1.0',fetcher);assert.equal(again.phase,'ready');assert.equal(downloads,first,'a verified package is reused');
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
test('v1.1.2: the update script is started by Windows (WMI), and a failed launch keeps MeguLit open',async()=>{
 const {EventEmitter}=require('node:events');let seen=null;
 const fake=code=>(cmd,args,opt)=>{seen={cmd,args,opt};const c=new EventEmitter();setTimeout(()=>c.emit('exit',code),5);return c;};
 assert.equal(await u.launchScript('C:\MeguLit',{run:fake(0)}),true);
 assert.match(seen.args.join(' '),/Win32_Process -MethodName Create/);assert.match(seen.opt.env.MEGULIT_UPDATE_COMMAND,/-File ".*" -Root "C:\MeguLit"/);
 assert.equal(await u.launchScript('C:\MeguLit',{run:fake(9)}),false);
});
test('v1.1.8: the same version with a different package online is a hotfix',async()=>{
 const fs=require('fs'),os=require('os'),path=require('path');const root=fs.mkdtempSync(path.join(os.tmpdir(),'hf-'));u.reset();
 let digest='sha256:'+'a'.repeat(64);
 const rel=()=>({tag_name:'v1.1.8',assets:[{name:'MeguLit-v1.1.8-win-x64.zip',size:3,digest,browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v1.1.8/MeguLit-v1.1.8-win-x64.zip'}]});
 const fetcher=async url=>url.endsWith('/latest')?{ok:true,json:async()=>rel()}:{ok:false,status:404};
 assert.equal((await u.check('1.1.8',fetcher,root)).newer,false,'first check records what is online');
 assert.equal((await u.check('1.1.8',fetcher,root)).newer,false,'same package: nothing to do');
 digest='sha256:'+'b'.repeat(64);
 const r=await u.check('1.1.8',fetcher,root);assert.equal(r.newer,true);assert.equal(r.hotfix,true);
 assert.equal((await u.check('1.1.8',fetcher,'')).newer,false,'without a root no hotfix guess');
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
/* User report (2026-11-09, mainland China): "restart and update" failed to download. The package also comes through
   relays, verified against GitHub's digest; a release replaced mid-download (hotfix) is read again once. */
test('update: relays are tried when GitHub fails, and only with a digest',()=>{
 const rel={url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/a.zip',digest:'a'.repeat(64)};
 const fresh=rel.url+'?v='+'a'.repeat(12);
 /* 2026-11-20: the relays are the ones in setup/runtime.json (core/download-sources.cjs) */
 const relays=require('../core/download-sources.cjs').relays().map(m=>m.url.replace('{url}',fresh));
 assert.ok(relays.length>=3&&relays.some(r=>r.startsWith('https://gh-proxy.com/')),'relays listed');
 assert.deepEqual(u.sources(rel,false),[rel.url,...relays],'relays get the digest so a cached old package is not served');
 assert.equal(u.sources(rel,true).at(-1),rel.url,'China tries relays first');
 assert.deepEqual(u.sources({...rel,digest:''},true),[rel.url],'no digest, no relay');
});
/* User report (2026-11-13: "更新显示下载失败"): the site's own R2 mirror is one of the sources, first in
   mainland China, and only for the full package — the small hot-update packages are not on it. */
test('update: the dl.megulit.com mirror is a source for the full package only',()=>{
 const full={name:'MeguLit-v9.9.9-win-x64.zip',url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip',digest:'a'.repeat(64)};
 const dl='https://dl.megulit.com/files/'+full.digest+'/'+full.name;
 const cn='https://cn-dl.megulit.com/files/'+full.digest+'/'+full.name;
 assert.deepEqual(u.sources(full,true).slice(0,2),[cn,dl],'China: the China entry first, then Cloudflare');
 assert.deepEqual(u.sources(full,false).slice(0,3),[full.url,dl,cn],'elsewhere GitHub first, then the mirrors');
 assert.ok(!u.sources({...full,name:'MeguLit-hot-9.9.9-from-9.9.8-abcdef.zip'},true).some(x=>x.startsWith('https://dl.megulit.com/')),'no hot package on the mirror');
 assert.ok(!u.sources({...full,digest:''},true).some(x=>x.startsWith('https://dl.megulit.com/')),'no digest, no mirror');
});
test('update: a failing GitHub download falls back to a relay; a replaced release is fetched again',async()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
 const make=()=>Buffer.concat([Buffer.from('PK'),crypto.randomBytes(5000)]);
 const body=data=>({ok:true,headers:{get:()=>String(data.length)},arrayBuffer:async()=>data});
 const relOf=data=>({tag_name:'v9.9.9',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:data.length,digest:'sha256:'+crypto.createHash('sha256').update(data).digest('hex'),browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]});
 /* GitHub unreachable, relay works */
 let root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));u.reset();const zip=make(),hits=[];
 let r=await u.start(root,'1.0.0',async url=>{if(url.endsWith('/latest'))return {ok:true,json:async()=>relOf(zip)};hits.push(new URL(url).hostname);if(url.startsWith('https://github.com'))throw Error('ECONNRESET');return {...body(zip),url};});
 assert.equal(r.phase,'ready');assert.ok(hits.some(h=>h!=='github.com'));
 assert.match(fs.readFileSync(path.join(root,'logs','update.log'),'utf8'),/download failed github\.com/);
 u.reset();fs.rmSync(root,{recursive:true,force:true});
 /* hotfix replaced the package after the check: every source returns the new file, the release is read again */
 root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));const before=make(),after=make();let reads=0;
 r=await u.start(root,'1.0.0',async url=>{if(url.endsWith('/latest')){reads++;return {ok:true,json:async()=>relOf(reads===1?before:after)};}return {...body(after),url};});
 assert.equal(r.phase,'ready');assert.equal(reads,2);
 assert.equal(r.sha256,crypto.createHash('sha256').update(after).digest('hex'));
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
/* The previous version is kept in migration\update-rollback, not as a second exe next to MeguLit.exe (user, 2026-11-09). */
test('update: an old rollback exe moves out of the MeguLit folder; the script backs up and rolls back from there',()=>{
 const fs=require('fs'),os=require('os'),path=require('path');const root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));
 try{fs.writeFileSync(path.join(root,'MeguLit.rollback-update.exe'),'old');assert.equal(u.tidyRollback(root),true);
  assert.equal(fs.existsSync(path.join(root,'MeguLit.rollback-update.exe')),false);assert.equal(fs.readFileSync(path.join(root,'migration','update-rollback','MeguLit.exe'),'utf8'),'old');
  assert.equal(u.tidyRollback(root),false);}finally{fs.rmSync(root,{recursive:true,force:true});}
 const src=fs.readFileSync(path.join(__dirname,'..','services','update.cjs'),'utf8');
 assert.match(src,/robocopy \$Root \$bak \/MIR/);assert.match(src,/ie4uinit\.exe'\) -show/);assert.match(src,/rolling back/);assert.doesNotMatch(src,/Copy-Item -LiteralPath \$exe -Destination \$backup/);
});

test('a full update and rollback leave the local Anki program in place',{skip:process.platform!=='win32',timeout:120000},async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {execFileSync}=require('node:child_process');
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-update-anki-'));
 const root=path.join(work,'app'),src=path.join(work,'package'),bak=path.join(work,'backup');
 const put=(dir,file,contents)=>{
  const dest=path.join(dir,file);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,contents);
 };
 put(root,'MeguLit.exe','old app');
 put(root,'Anki/anki.exe','user Anki');
 put(src,'MeguLit.exe','new app contents');
 put(src,'Anki/anki.exe','package Anki');
 u.reset();
 t.after(()=>{u.reset();try{fs.rmSync(work,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{}});
 const zip=Buffer.from('PK fixture');
 const rel={tag_name:'v9.9.9',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:zip.length,
  digest:'sha256:'+crypto.createHash('sha256').update(zip).digest('hex'),
  browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]};
 const state=await u.start(root,'1.0.0',async url=>url.endsWith('/latest')?
  {ok:true,json:async()=>rel}:{ok:true,url,headers:{get:()=>String(zip.length)},arrayBuffer:async()=>zip});
 assert.equal(state.phase,'ready');
 const copies=fs.readFileSync(state.ps1,'utf8').match(/^ *& robocopy .+$/gm);
 assert.equal(copies.length,3);
 const copy=index=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  '$Root=$env:MEGULIT_UPDATE_FIX_ROOT; $src=$env:MEGULIT_UPDATE_FIX_PACKAGE; $bak=$env:MEGULIT_UPDATE_FIX_BACKUP; '+copies[index]+
  '; if($LASTEXITCODE -ge 8){exit $LASTEXITCODE}; exit 0'],{windowsHide:true,env:{...process.env,
   MEGULIT_UPDATE_FIX_ROOT:root,MEGULIT_UPDATE_FIX_PACKAGE:src,MEGULIT_UPDATE_FIX_BACKUP:bak},timeout:30000});
 const read=file=>fs.readFileSync(path.join(root,file),'utf8');
 copy(0);
 const backedUpAnki=fs.existsSync(path.join(bak,'Anki'));
 put(bak,'Anki/anki.exe','stale Anki backup');
 copy(1);
 assert.equal(read('MeguLit.exe'),'new app contents');
 const afterUpdate=read('Anki/anki.exe');
 copy(2);
 assert.equal(read('MeguLit.exe'),'old app');
 assert.equal(afterUpdate,'user Anki');
 assert.equal(read('Anki/anki.exe'),'user Anki');
 assert.equal(backedUpAnki,false);
});

// E289 (Henan user: the download failed right at the end): a dropped connection resumes from the bytes it already has.
test('update: a download cut off near the end resumes with a range request',async()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
 const zip=Buffer.concat([Buffer.from('PK'),crypto.randomBytes(9000)]),digest=crypto.createHash('sha256').update(zip).digest('hex');
 const rel={tag_name:'v9.9.9',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:zip.length,digest:'sha256:'+digest,browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));u.reset();const ranges=[];
 const stream=(data,fail)=>{let sent=false;return {getReader:()=>({read:async()=>{if(!sent){sent=true;return {done:false,value:data};}if(fail)throw Error('ECONNRESET');return {done:true};}})};};
 /* 2026-11-19 core/fast-download.cjs asks every source at once in Range pieces. The connection drops at 8000 bytes on every
    source (a line that breaks near the end, not one bad mirror), so what arrived is kept and only the rest is asked for. */
 const cutHosts=new Set();
 const serve=(url,opts,cut)=>{const range=opts?.headers?.Range;ranges.push(range||'');
  const m=/bytes=(\d+)-(\d*)/.exec(range||''),from=m?Number(m[1]):0,to=m&&m[2]?Number(m[2])+1:zip.length,host=new URL(url).hostname;
  if(cut(host,from,to)){cutHosts.add(host);return {ok:true,status:206,url,headers:{'content-range':'bytes '+from+'-'+(to-1)+'/'+zip.length},body:stream(zip.subarray(from,8000),true)};}
  return {ok:true,status:206,url,headers:{'content-range':'bytes '+from+'-'+(to-1)+'/'+zip.length},body:stream(zip.subarray(from,to),false)};};
 const r=await u.start(root,'1.0.0',async(url,opts)=>url.endsWith('/latest')?{ok:true,json:async()=>rel}:serve(url,opts,(host,from,to)=>!cutHosts.has(host)&&from<8000&&to>8000));
 assert.equal(r.phase,'ready');assert.equal(r.sha256,digest);assert.ok(ranges.some(x=>/^bytes=8000-/.test(x)),'the rest is asked from 8000: '+ranges.join(' '));
 assert.ok(ranges.filter(x=>!/^bytes=0-$/.test(x)).every(x=>/^bytes=8000-/.test(x)),'nothing before 8000 is asked again: '+ranges.join(' '));
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});

/* 2026-11-19: the .part a failed update left behind (cache/update/<name>.part + .part.json) is used by the next start, which
   asks only for the rest, also from the measuring requests */
test('update: the next start continues the .part a failed download left behind',async()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
 const zip=Buffer.concat([Buffer.from('PK'),crypto.randomBytes(9000)]),digest=crypto.createHash('sha256').update(zip).digest('hex');
 const rel={tag_name:'v9.9.9',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:zip.length,digest:'sha256:'+digest,browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));u.reset();
 const stream=(data,fail)=>{let sent=false;return {getReader:()=>({read:async()=>{if(!sent){sent=true;return {done:false,value:data};}if(fail)throw Error('ECONNRESET');return {done:true};}})};};
 const answer=(url,opts,broken)=>{const m=/bytes=(\d+)-(\d*)/.exec(opts?.headers?.Range||''),from=m?Number(m[1]):0,to=m&&m[2]?Number(m[2])+1:zip.length;
  if(broken&&from>=8000)throw Error('ECONNRESET');
  return {ok:true,status:206,url,headers:{'content-range':'bytes '+from+'-'+(to-1)+'/'+zip.length},body:stream(zip.subarray(from,broken?Math.min(to,8000):to),broken&&to>8000)};};
 try{
  /* first start: every source breaks at 8000 and nothing after it answers */
  await assert.rejects(u.start(root,'1.0.0',async(url,opts)=>url.endsWith('/latest')?{ok:true,json:async()=>rel}:answer(url,opts,true)));
  const part=path.join(root,'cache','update','MeguLit-v9.9.9-win-x64.zip.part');
  assert.ok(fs.existsSync(part)&&fs.existsSync(part+'.json'),'the .part and its state are kept');
  /* next start: the line works again */
  u.reset();const asked=[];
  const r=await u.start(root,'1.0.0',async(url,opts)=>{if(url.endsWith('/latest'))return {ok:true,json:async()=>rel};asked.push(opts?.headers?.Range||'');return answer(url,opts,false);});
  assert.equal(r.phase,'ready');assert.equal(r.sha256,digest);
  assert.ok(asked.length&&asked.every(x=>/^bytes=8000-/.test(x)),'only the rest is asked: '+asked.join(' '));
  assert.equal(fs.existsSync(part),false);
 }finally{u.reset();fs.rmSync(root,{recursive:true,force:true});}
});

// E350: hotfix letters order after the base version, and lettered packages are accepted.
test('versions compare with hotfix letters',()=>{
 const u=require('../services/update.cjs');
 assert.equal(u.newer('1.2.8a','1.2.8'),true);assert.equal(u.newer('1.2.8b','1.2.8a'),true);assert.equal(u.newer('1.2.9','1.2.8z'),true);
 assert.equal(u.newer('1.2.8','1.2.8b'),false);assert.equal(u.newer('v1.2.8b','1.2.8b'),false);assert.equal(u.newer('1.2.8','1.2.7'),true);
});

// E350: an app showing 1.2.8a still gets a later hotfix published under the numeric tag v1.2.8.
test('lettered app version still sees a hotfix of its numeric tag',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));
 const rel=(d)=>({tag_name:'v1.2.8',body:'',html_url:'https://github.com/ilynthn/MeguLit/releases/tag/v1.2.8',assets:[{name:'MeguLit-v1.2.8-win-x64.zip',size:1,digest:'sha256:'+d.repeat(64),browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v1.2.8/MeguLit-v1.2.8-win-x64.zip'}]});
 const fetcher=d=>async()=>({ok:true,json:async()=>rel(d)});
 const first=await u.check('1.2.8a',fetcher('a'),root);assert.equal(first.newer,false);
 const next=await u.check('1.2.8a',fetcher('b'),root);assert.equal(next.newer,true);assert.equal(next.hotfix,true);
 fs.rmSync(root,{recursive:true,force:true});
});
