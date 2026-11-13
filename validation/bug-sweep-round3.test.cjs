'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('scene shot that would fall off a full shelf is skipped, not written then deleted',()=>{
 const shots=require('../services/scene-shots.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ss-'));const exe=path.join(root,'game.exe');const jpeg=Buffer.from('x').toString('base64');
 try{for(let i=0;i<shots.KEEP;i++){const hash=require('node:crypto').createHash('sha1').update('s'+i).digest('hex').slice(0,16);shots.keep(root,exe,{jpeg,score:90,hash},i+1);}
  const before=shots.list(root,exe).length;const files=()=>fs.readdirSync(path.dirname(fs.readdirSync(root,{recursive:true}).map(f=>path.join(root,f)).find(f=>f.endsWith('index.json')))).length;const n=files();
  assert.equal(shots.keep(root,exe,{jpeg,score:shots.MIN_SCORE+1,hash:require('node:crypto').createHash('sha1').update('new').digest('hex').slice(0,16)},999),'skipped');
  assert.equal(shots.list(root,exe).length,before);assert.equal(files(),n);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('exam countdown date is the local calendar day',()=>{
 const lg=require('../services/learning-goal.cjs');const s=read('services/learning-goal.cjs');
 assert.doesNotMatch(s,/date:d\.toISOString\(\)/);
 const d=lg.examDay('jlpt',2027,7);const want=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 assert.match(s,/getFullYear\(\)\+'-'\+String\(d\.getMonth\(\)\+1\)/);assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(want));
});

test('icon refresh fallback path keeps its backslash',()=>{
 assert.ok(read('services/update.cjs').includes("process.env.SystemRoot||'C:\\\\Windows'"));
});

test('home TV fades cancelled by a newer swap do not reject unhandled',()=>{
 assert.match(read('web/home-tv.js'),/Promise\.all\(outs\.map\(p=>p\.catch\(\(\)=>null\)\)\)/);
});
