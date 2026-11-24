'use strict';
/* core/fast-download.cjs against real local HTTP sources: different speeds, one that slows down halfway, one 404, one
   without Range support, one serving a different file; parallel pieces, switching sources, resuming and the hash check. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const fd=require('../core/fast-download.cjs');

const KB=1024,MB=1024*KB;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
/* rate: bytes per second per connection; slowAfter/slowRate: after that many bytes served in total the source slows
   down; noRange: always 200 with the whole file; status: fixed error status; hang: headers then nothing;
   failFirst: the first n Range requests after the probe answer 503; html: a 200 HTML page for everything */
function source(data,opt={}){
 const stats={requests:0,ranges:[],bytes:0,open:0,maxOpen:0};
 const server=http.createServer((req,res)=>{
  stats.requests++;
  if(opt.status){res.writeHead(opt.status);return res.end();}
  if(opt.html){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end('<html>login</html>');}
  if(opt.failFirst&&stats.requests>1&&(stats.failed=(stats.failed||0)+1)<=opt.failFirst){res.writeHead(503);return res.end();}
  let start=0,end=data.length;const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
  if(m&&!opt.noRange&&!(opt.rangeAfterStart&&Number(m[1])===0)){start=Number(m[1]);end=m[2]?Number(m[2])+1:data.length;stats.ranges.push(start+'-'+end);
   res.writeHead(206,{'content-length':end-start,'content-range':'bytes '+start+'-'+(end-1)+'/'+data.length,'accept-ranges':'bytes'});}
  else res.writeHead(200,{'content-length':data.length});
  stats.open++;stats.maxOpen=Math.max(stats.maxOpen,stats.open);let closed=false;const close=()=>{if(!closed){closed=true;stats.open--;}};
  res.on('close',close);
  if(opt.hang)return;
  /* the amount follows the time that really passed (at most 200 ms of it), so a late timer on a busy runner or the
     15.6 ms Windows timer step does not lower the rate a connection is capped at */
  let at=start,last=0;const tick=20;
  const pump=()=>{
   if(closed)return;if(at>=end){close();return res.end();}
   if(opt.stallAt!=null&&!stats.stalled&&stats.bytes>=opt.stallAt){stats.stalled=true;return;}
   if(opt.dropAt!=null&&!stats.dropped&&stats.bytes>=opt.dropAt){stats.dropped=true;res.destroy();return;}
   const rate=opt.slowAfter!=null&&stats.bytes>=opt.slowAfter?opt.slowRate:opt.rate||Infinity;
   const now=Date.now(),dt=last?Math.min(200,Math.max(1,now-last)):tick;last=now;
   const n=Math.min(end-at,rate===Infinity?256*KB:Math.max(1,Math.floor(rate*dt/1000)));
   const chunk=data.subarray(at,at+n);at+=n;stats.bytes+=n;
   const ok=res.write(chunk);if(rate===Infinity&&ok)return setImmediate(pump);if(rate===Infinity)return res.once('drain',pump);setTimeout(pump,tick);
  };pump();
 });
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({url:'http://127.0.0.1:'+server.address().port+'/file.bin',stats,close:()=>{server.closeAllConnections?.();server.close();}})));
}
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'fastdl-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const quick={probeMs:400,probeCapMs:800,segment:256*KB,connections:6,stallMs:1500,slowAfterMs:700,minSteal:64*KB,china:false};

test('fast-download: mainland China puts cn-dl before dl, elsewhere the order stays',()=>{
 const gh='https://github.com/a/b/releases/download/v1/x.zip',dl='https://dl.megulit.com/gh/x.zip',cn='https://cn-dl.megulit.com/gh/x.zip',px='https://gh-proxy.com/'+gh;
 assert.deepEqual(fd.orderSources([dl,cn,px,gh],true),[cn,dl,px,gh]);
 assert.deepEqual(fd.orderSources([gh,dl,px,cn],true),[cn,dl,px,gh],'mainland order from setup/runtime.json: GitHub itself last');
 assert.deepEqual(fd.orderSources([dl,cn,gh],false),[dl,cn,gh]);
 assert.deepEqual(fd.orderSources([dl,dl,gh],true),[dl,gh],'duplicates dropped');
});

test('fast-download: several fast sources in parallel, a 404 and a slow one left out, hash checked',async t=>{
 const data=crypto.randomBytes(6*MB),dir=tmp(t);
 const fast=await source(data,{rate:3*MB}),medium=await source(data,{rate:2*MB}),slow=await source(data,{rate:40*KB}),gone=await source(data,{status:404});
 t.after(()=>[fast,medium,slow,gone].forEach(s=>s.close()));
 const seen=[];const r=await fd.download({...quick,urls:[slow.url,gone.url,medium.url,fast.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data),onProgress:p=>seen.push(p.received)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 assert.ok(fast.stats.ranges.length>1&&medium.stats.ranges.length>1,'both fast sources served pieces');
 assert.ok(fast.stats.maxOpen>1,'several connections to one source at once');
 assert.equal(gone.stats.requests,1,'the 404 source is asked once');
 assert.ok(slow.stats.ranges.length<=2,'the slow source is only probed');
 assert.ok(seen.some(n=>n>0&&n<data.length)&&seen.at(-1)===data.length,'progress moves');
 assert.equal(fs.existsSync(path.join(dir,'f.bin.part.json')),false,'state file removed when done');
});

test('fast-download: a source that slows down halfway or stops sending loses its pieces to the others',async t=>{
 const data=crypto.randomBytes(4*MB),dir=tmp(t);
 const fading=await source(data,{rate:4*MB,slowAfter:1.5*MB,slowRate:8*KB}),steady=await source(data,{rate:1*MB}),hang=await source(data,{hang:true});
 t.after(()=>[fading,steady,hang].forEach(s=>s.close()));
 const t0=Date.now();
 const r=await fd.download({...quick,urls:[fading.url,steady.url,hang.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 assert.ok(steady.stats.bytes>=1*MB,'the steady source took over');
 assert.ok(Date.now()-t0<20000,'finished without waiting on the slowed source ('+(Date.now()-t0)+' ms)');
});

test('fast-download: a connection that goes silent is dropped after the stall time and its piece fetched again',async t=>{
 const data=crypto.randomBytes(2*MB),dir=tmp(t);
 const src=await source(data,{rate:2*MB,stallAt:600*KB});t.after(()=>src.close());
 const logs=[];const r=await fd.download({...quick,endgame:false,urls:[src.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data),log:l=>logs.push(l)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));assert.ok(src.stats.stalled);assert.ok(logs.some(l=>/stalled/.test(l)),logs.join(' | '));
});

test('fast-download: a source without Range support falls back to one connection',async t=>{
 const data=crypto.randomBytes(1*MB+123),dir=tmp(t);
 const plain=await source(data,{rate:1*MB,noRange:true});t.after(()=>plain.close());
 const r=await fd.download({...quick,urls:[plain.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 assert.equal(plain.stats.maxOpen,1,'one connection at a time');
 /* size unknown and no hash: taken from the answer */
 const r2=await fd.download({...quick,urls:[plain.url],dest:path.join(dir,'g.bin')});
 assert.equal(r2.size,data.length);assert.equal(sha(fs.readFileSync(r2.file)),sha(data));
});

test('fast-download: one connection that breaks resumes with a Range request from where it stopped',async t=>{
 const data=crypto.randomBytes(1*MB),dir=tmp(t);
 /* 200 for bytes=0- (looks like no Range support), 206 for a later offset; the connection breaks at 400 KB */
 const src=await source(data,{rate:2*MB,rangeAfterStart:true,dropAt:400*KB});t.after(()=>src.close());
 const r=await fd.download({...quick,urls:[src.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));assert.ok(src.stats.dropped);
 assert.ok(src.stats.ranges.length>=1&&src.stats.ranges.every(x=>Number(x.split('-')[0])>0),'resumed from the break: '+src.stats.ranges.join(' '));
 assert.ok(src.stats.bytes<data.length+100*KB,'not downloaded twice ('+src.stats.bytes+')');
});

test('fast-download: a cancelled download resumes with only the missing pieces',async t=>{
 const data=crypto.randomBytes(3*MB),dir=tmp(t),dest=path.join(dir,'f.bin');
 const src=await source(data,{rate:1*MB});t.after(()=>src.close());
 const ac=new AbortController();let got=0;
 const first=fd.download({...quick,urls:[src.url],dest,size:data.length,sha256:sha(data),signal:ac.signal,onProgress:p=>{got=p.received;if(p.received>=1*MB)ac.abort();}});
 await assert.rejects(first,e=>e.code==='ABORTED');
 assert.ok(fs.existsSync(dest+'.part')&&fs.existsSync(dest+'.part.json'),'part and state kept');
 const state=JSON.parse(fs.readFileSync(dest+'.part.json','utf8'));const had=state.done.reduce((n,[a,b])=>n+b-a,0);assert.ok(had>=1*MB,'finished ranges recorded');
 const before=src.stats.bytes;let firstReport=-1;
 const r=await fd.download({...quick,urls:[src.url],dest,size:data.length,sha256:sha(data),onProgress:p=>{if(firstReport<0)firstReport=p.received;}});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 const served=src.stats.bytes-before;
 assert.ok(served<=data.length-had+quick.segment,'second run fetched only what was missing ('+served+' of '+data.length+', had '+had+')');
 assert.ok(firstReport>=had,'progress starts at what was already there');
});

test('fast-download: a source serving a different file is found by the hash and skipped',async t=>{
 const data=crypto.randomBytes(2*MB),bad=Buffer.from(data);bad[1234]^=0xff;const dir=tmp(t);
 const liar=await source(bad,{rate:4*MB}),honest=await source(data,{rate:1*MB});t.after(()=>[liar,honest].forEach(s=>s.close()));
 const logs=[];const r=await fd.download({...quick,urls:[liar.url,honest.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data),log:l=>logs.push(l)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));assert.deepEqual(r.sources,[honest.url]);
 assert.ok(logs.some(l=>/HASH_MISMATCH/.test(l)));
 /* every source wrong: HASH_MISMATCH, nothing left behind */
 await assert.rejects(fd.download({...quick,urls:[liar.url],dest:path.join(dir,'g.bin'),size:data.length,sha256:sha(data)}),e=>e.code==='HASH_MISMATCH');
 assert.equal(fs.existsSync(path.join(dir,'g.bin')),false);
});

test('fast-download: every source down gives DOWNLOAD_FAILED with the reason',async t=>{
 const a=await source(Buffer.alloc(10),{status:404}),b=await source(Buffer.alloc(10),{status:503});t.after(()=>[a,b].forEach(s=>s.close()));
 await assert.rejects(fd.download({...quick,urls:[a.url,b.url],dest:path.join(tmp(t),'f.bin'),size:10}),e=>e.code==='DOWNLOAD_FAILED'&&/HTTP/.test(e.message));
});

/* ---- 2026-11-20 super assembly ---- */
const lines=logs=>logs.join(' | ');
test('fast-download: resumed bytes do not count toward the first connection speed sample',async t=>{
 const data=crypto.randomBytes(10*MB),saved=8*MB,dest=path.join(tmp(t),'resume.bin'),part=dest+'.part';
 const digest=sha(data),scaleMs=500,src=await source(data,{rate:256*KB});t.after(()=>src.close());
 fs.writeFileSync(part,data.subarray(0,saved));fs.truncateSync(part,data.length);
 fs.writeFileSync(part+'.json',JSON.stringify({v:1,size:data.length,sha256:digest,done:[[0,saved]]}));
 let sample;
 await fd.download({...quick,connections:2,maxConnections:6,scaleMs,urls:[src.url],dest,size:data.length,sha256:digest,log:line=>{
  const m=/^connections \d+ \((\d+) KB\/s\)/.exec(line);
  if(m&&!sample)sample={rate:Number(m[1]),sent:src.stats.bytes};
 }});
 assert.equal(sha(fs.readFileSync(dest)),digest);
 assert.ok(sample,'the running download sampled its speed');
 // The source count even includes the probe. It bounds the bytes received within the sample window.
 assert.ok(sample.rate<=Math.ceil(sample.sent/scaleMs),'reported '+sample.rate+' KB/s after the source sent '+sample.sent+' bytes');
});

test('fast-download: more connections while that still adds speed (8 -> 16 style), per-host limit kept',async t=>{
 const data=crypto.randomBytes(6*MB),dir=tmp(t);
 /* every connection is capped at 120 KB/s, so the total only grows with more connections */
 const a=await source(data,{rate:120*KB}),b=await source(data,{rate:120*KB}),capped=await source(data,{rate:120*KB});
 t.after(()=>[a,b,capped].forEach(s=>s.close()));
 const logs=[];const r=await fd.download({...quick,connections:4,maxConnections:12,scaleMs:500,urls:[a.url,b.url,capped.url],limits:u=>u===capped.url?1:0,dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data),log:l=>logs.push(l)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 assert.ok(logs.some(l=>/^connections (8|10|12) /.test(l)),'grew past the start: '+lines(logs));
 assert.ok(a.stats.maxOpen+b.stats.maxOpen+capped.stats.maxOpen>4,'more than 4 connections at once');
 assert.ok(capped.stats.maxOpen<=2,'the limited host held 1 piece connection at a time (+ the probe still closing): '+capped.stats.maxOpen);
});

test('fast-download: end game fetches the slowest last piece again from another source, first one wins',async t=>{
 const data=crypto.randomBytes(2*MB),dir=tmp(t);
 /* fast until 1.6 MB served, then a trickle; slow drops are off so only the end game can save the tail */
 const fading=await source(data,{rate:3*MB,slowAfter:1.6*MB,slowRate:4*KB}),other=await source(data,{rate:600*KB});
 t.after(()=>[fading,other].forEach(s=>s.close()));
 const logs=[],t0=Date.now();
 const r=await fd.download({...quick,slowRatio:0,minSteal:4*MB,dupMinMs:400,urls:[fading.url,other.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data),log:l=>logs.push(l)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 assert.ok(logs.some(l=>/^end game/.test(l)),lines(logs));
 assert.ok(Date.now()-t0<15000,'tail not left on the trickle ('+(Date.now()-t0)+' ms)');
});

test('fast-download: a source that errors cools down and is used again, not dropped',async t=>{
 const data=crypto.randomBytes(3*MB),dir=tmp(t);
 const flaky=await source(data,{rate:1*MB,failFirst:2}),steady=await source(data,{rate:500*KB});
 t.after(()=>[flaky,steady].forEach(s=>s.close()));
 const logs=[];const r=await fd.download({...quick,coolMs:300,urls:[flaky.url,steady.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data),log:l=>logs.push(l)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 assert.ok(logs.some(l=>/^cool /.test(l)),'cooled down: '+lines(logs));
 assert.ok(!logs.some(l=>/^dropped /.test(l)),'not dropped: '+lines(logs));
 assert.ok(flaky.stats.ranges.length>=2,'served pieces after the cool-down: '+flaky.stats.ranges.length);
});

test('fast-download: an HTML page instead of the file drops that source at once',async t=>{
 const data=crypto.randomBytes(1*MB),dir=tmp(t);
 const page=await source(data,{html:true}),good=await source(data,{rate:2*MB});
 t.after(()=>[page,good].forEach(s=>s.close()));
 const logs=[];const r=await fd.download({...quick,urls:[page.url,good.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data),log:l=>logs.push(l)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 assert.equal(page.stats.requests,1,'asked once');assert.ok(logs.some(l=>/HTML/.test(l)),lines(logs));
});

test('fast-download: a relay serving a bad file in a mixed download: next round uses the first-party sources only',async t=>{
 /* every byte from the relay is wrong (it is the fastest source, so it always serves part of the file) */
 const data=crypto.randomBytes(3*MB),bad=crypto.randomBytes(3*MB);const dir=tmp(t);
 const relay=await source(bad,{rate:2*MB}),own=await source(data,{rate:1*MB}),relay2=await source(data,{rate:1*MB});
 t.after(()=>[relay,own,relay2].forEach(s=>s.close()));
 const logs=[];const r=await fd.download({...quick,trusted:[own.url],urls:[relay.url,own.url,relay2.url],dest:path.join(dir,'f.bin'),size:data.length,sha256:sha(data),log:l=>logs.push(l)});
 assert.equal(sha(fs.readFileSync(r.file)),sha(data));
 assert.ok(logs.some(l=>/first-party sources only/.test(l)),lines(logs));
 assert.deepEqual(r.sources,[own.url]);
});
