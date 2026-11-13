// Signature memory (user: a game that embedded before replaces its first line after a restart, also after an update,
// ASLR or on another build). Two mock game builds with the dialogue function moved and its call targets / absolute
// operands changed; the signature captured in build A must find the function in build B. No real game is started.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),os=require('os'),{execFileSync,spawn}=require('child_process');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const csc=['C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'].find(f=>fs.existsSync(f));
const work=fs.existsSync('H:/')?'H:/MeguLit-Work/hook-signature-test':path.join(os.tmpdir(),'megulit-hook-signature-test');
// A fake x86 dialogue routine: prologue, call rel32, push imm32, mov ecx,[abs], jz rel32, call [abs], epilogue.
const fnA=[0x55,0x8B,0xEC,0x83,0xEC,0x10,0x53,0x56,0x57,0x8B,0x7D,0x08,0xE8,1,2,3,4,0x68,0x10,0x20,0x40,0x00,0x8B,0x0D,0x44,0x33,0x22,0x11,0x85,0xC9,0x0F,0x84,9,9,0,0,0x8B,0x45,0x0C,0x50,0x57,0xFF,0x15,0x10,0x10,0x40,0x00,0x83,0xC4,0x08,0x5F,0x5E,0x5B,0x8B,0xE5,0x5D,0xC3];
const fnH=fnA.slice();fnH.splice(6,5,0xE9,0x11,0x22,0x33,0x44);/* build A as LunaHook leaves it: hook point patched */
const fnB=fnA.slice();fnB[13]=0x77;fnB[18]=0x30;fnB[24]=0x55;fnB[33]=0x12;fnB[44]=0x60;
const hex=a=>Buffer.from(a).toString('hex');
function host(dir,pad,fn,seed){fs.mkdirSync(dir,{recursive:true});let x=seed;const rnd=()=>(x=(x*1103515245+12345)>>>0)>>>24;
 const bytes=n=>Array.from({length:n},rnd).join(',');
 const src=`using System;static class G{static readonly byte[] Pad={${bytes(pad)}};static readonly byte[] Fn={${fn.join(',')}};static readonly byte[] Tail={${bytes(3000)}};static void Main(){Console.WriteLine(Pad.Length+Fn.Length+Tail.Length);Console.Out.Flush();System.Threading.Thread.Sleep(60000);}}`;
 fs.writeFileSync(path.join(dir,'game.cs'),src);execFileSync(csc,['/nologo','/platform:x86','/out:'+path.join(dir,'game.exe'),path.join(dir,'game.cs')]);return path.join(dir,'game.exe');}
function launch(exe){return new Promise((ok,no)=>{const p=spawn(exe,[],{windowsHide:true,stdio:['ignore','pipe','ignore']});p.stdout.once('data',()=>ok(p));p.once('error',no);});}

test('pure signature logic passes the bridge self-test routine (synthetic builds, code rewrite)',()=>{
 const s=read('native/HookSignature.cs');assert.match(s,/public static bool SelfTest\(\)/);
 assert.match(read('native/HookBridge.cs'),/HookSignature\.SelfTest\(\)/);assert.match(read('native/Build-HookBridge.ps1'),/'HookSignature\.cs'/);
});

test('bridge: review fixes (hooked capture, no early insert, off the Gate lock, guard pages, cross-build silent, moved = ordinary candidate, Resume locked)',()=>{
 const s=read('native/HookBridge.cs'),g=read('native/HookSignature.cs');
 assert.match(g,/HookArea\(w,lead\)/,'hook point bytes never fixed in a new signature');
 assert.match(g,/HookArea\(p,s\.Lead\)/,'and ignored in old signatures captured from hooked memory');
 assert.match(g,/VirtualQueryEx/);assert.match(g,/if\(Readable\(info\.State,info\.Protect\)\)/);
 assert.match(g,/String\.IsNullOrEmpty\(Convert\.ToString\(pat\)\)/,'empty sigPattern is no memory');
 const remember=s.slice(s.indexOf(' static void RememberStream(){'),s.indexOf('\n',s.indexOf(' static void RememberStream(){')+40)+400);
 assert.match(remember,/ThreadPool\.QueueUserWorkItem\(_=>\{try\{string file=MemoryPath\(\);if\(file==""\)return;var sig=HookSignature\.Capture/,'capture + write off the Gate lock');
 const pre=s.slice(s.indexOf(' static void PreArmSignature(){'),s.indexOf(' static void RememberStream(){'));
 assert.match(pre,/lock\(Gate\)\{mem=CrossMemory;CrossMemory=null;\}/,'cross-build memory taken once, under the lock');
 assert.match(pre,/if\(offset==sig\.Offset\)\{Diagnostic\([^;]*\);return;\}/,'other build at the same place: no insert, not restored (exe names are shared by many games)');assert.doesNotMatch(pre,/Resume=mem|FromMemory=true|hookMemory/,'other-build memory never becomes the remembered stream');assert.match(s,/static void PreArmSignature\(\)\{ThreadPool\.QueueUserWorkItem\(_=>PreArmSignatureNow\(\)\);\}/,'off the injection path');
 assert.match(pre,/Thread\.Sleep\(2500\)/,'moved: after engine detection');
 assert.match(pre,/if\(k\.tp\.addr==addr\)/);assert.match(pre,/first==0xE9\|\|first==0xEB/);assert.match(pre,/SignatureInserted=true/);
 assert.doesNotMatch(pre.slice(pre.indexOf('Thread.Sleep(2500)')),/Resume=|FromMemory=true|hookMemory/,'moved hook is not the remembered fast path');
 assert.match(s,/if\(Resume==null&&!FromMemory\)CrossMemory=OtherBuildMemory\(\);/,'cross-build memory announces nothing at load');
 assert.match(s,/PreArmSignature\(\);\r?\n\s+KrkrText\(bit,loader,args\);/);
 assert.match(read('core/hook-native.cjs'),/m\.type==='hookSignature'/);
});

test('mock game builds A and B: function moved + operands changed, ASLR on: signature relocates it',{skip:!csc&&'no csc'},async()=>{
 const src=[path.join(root,'native/HookSignature.cs'),path.join(__dirname,'hook-signature-harness.cs')];
 fs.mkdirSync(work,{recursive:true});const harness=path.join(work,'harness.exe');
 execFileSync(csc,['/nologo','/platform:x64','/out:'+harness,...src]);
 const a=host(path.join(work,'v1'),4000,fnA,1),b=host(path.join(work,'v2'),9100,fnB,2);
 const pa=await launch(a),pb=await launch(b);
 try{const out=JSON.parse(execFileSync(harness,[String(pa.pid),String(pb.pid),hex(fnA),hex(fnB),'game.exe','6'],{encoding:'utf8'}));
  assert.ok(!out.error,out.error);
  assert.notEqual(out.offA,out.expectB,'the function really moved between builds');
  assert.equal(out.offB,out.expectB,'relocated to the moved function');
  assert.equal(BigInt('0x'+out.addrB),BigInt('0x'+out.baseB)+BigInt('0x'+out.offB));
  assert.equal(out.code,'EHS-4@'+out.offB.toUpperCase()+':game.exe');
  assert.match(out.pattern,/E8 \?\? \?\? \?\? \?\?/,'call target wildcarded');
 }finally{pa.kill();pb.kill();}
 // captured from an already hooked process (E9 at the hook point), relocated in a clean build
 const h=host(path.join(work,'v1hooked'),4000,fnH,1),ph=await launch(h),pc=await launch(b);
 try{const out=JSON.parse(execFileSync(harness,[String(ph.pid),String(pc.pid),hex(fnH),hex(fnB),'game.exe','6'],{encoding:'utf8'}));
  assert.ok(!out.error,out.error);assert.ok(out.pattern.startsWith('?? ?? ?? ?? ??'),out.pattern);assert.equal(out.offB,out.expectB);
 }finally{ph.kill();pc.kill();}
});
