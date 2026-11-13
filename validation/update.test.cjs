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
 u.reset();const again=await u.start(root,'1.1.0',fetcher);assert.equal(again.phase,'ready');assert.equal(downloads,1,'a verified package is reused');
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
 assert.deepEqual(u.sources(rel,false),[rel.url,'https://gh-proxy.com/'+fresh,'https://ghproxy.net/'+fresh,'https://ghfast.top/'+fresh],'relays get the digest so a cached old package is not served');
 assert.equal(u.sources(rel,true)[3],rel.url,'China tries relays first');
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

// E289 (Henan user: the download failed right at the end): a dropped connection resumes from the bytes it already has.
test('update: a download cut off near the end resumes with a range request',async()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
 const zip=Buffer.concat([Buffer.from('PK'),crypto.randomBytes(9000)]),digest=crypto.createHash('sha256').update(zip).digest('hex');
 const rel={tag_name:'v9.9.9',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:zip.length,digest:'sha256:'+digest,browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));u.reset();const ranges=[];
 const stream=(data,fail)=>{let sent=false;return {getReader:()=>({read:async()=>{if(!sent){sent=true;return {done:false,value:data};}if(fail)throw Error('ECONNRESET');return {done:true};}})};};
 const r=await u.start(root,'1.0.0',async(url,opts)=>{if(url.endsWith('/latest'))return {ok:true,json:async()=>rel};const range=opts?.headers?.Range;ranges.push(range||'');
  if(!range)return {ok:true,status:200,url,body:stream(zip.subarray(0,8000),true)};
  const from=Number(/bytes=(\d+)-/.exec(range)[1]);return {ok:true,status:206,url,body:stream(zip.subarray(from),false)};});
 assert.equal(r.phase,'ready');assert.equal(r.sha256,digest);assert.deepEqual(ranges,['','bytes=8000-']);
 u.reset();fs.rmSync(root,{recursive:true,force:true});
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
