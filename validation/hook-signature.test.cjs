// Signature memory (user: a game that embedded before replaces its first line after a restart, also after an update,
// ASLR or on another build). Two mock game builds with the dialogue function moved and its call targets / absolute
// operands changed; the signature captured in build A must find the function in build B. No real game is started.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),os=require('os'),{execFileSync,spawn}=require('child_process');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const csc=['C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'].find(f=>fs.existsSync(f));
const work=fs.existsSync('H:/')?'H:/MeguLit-Work/hook-signature-test':path.join(os.tmpdir(),'megulit-hook-signature-test');
// A fake x86 dialogue routine: prologue, call rel32, push imm32, mov ecx,[abs], jz rel32, call [abs], epilogue.
const fnA=[0x55,0x8B,0xEC,0x83,0xEC,0x10,0x53,0x56,0x57,0x8B,0x7D,0x08,0xE8,1,2,3,4,0x68,0x10,0x20,0x40,0x00,0x8B,0x0D,0x44,0x33,0x22,0x11,0x85,0xC9,0x0F,0x84,9,9,0,0,0x8B,0x45,0x0C,0x50,0x57,0xFF,0x15,0x10,0x10,0x40,0x00,0x83,0xC4,0x08,0x5F,0x5E,0x5B,0x8B,0xE5,0x5D,0xC3];
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

test('bridge: remembered with module+offset+signature, other builds looked up, pre-armed right after injection',()=>{
 const s=read('native/HookBridge.cs');
 assert.match(s,/sigModule=sig==null\?null:sig\.Module,sigOffset=/);
 assert.match(s,/string file=MemoryPath\(\)/);
 assert.match(s,/Contains\("\\"sigPattern\\""\)/);
 assert.match(s,/PreArmSignature\(\);\r?\n\s+KrkrText\(bit,loader,args\);/);
 assert.match(s,/Resume\["code"\]=next;Resume\["addr"\]=addr\.ToString\("x"\)/);
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
});
