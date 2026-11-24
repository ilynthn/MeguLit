'use strict';
/* Build.ps1 test resume on Node 23+: node --test prints the spec reporter by default even into a pipe, which
   tools/test-resume.cjs record cannot read ("failures unreadable": every file stayed unpassed and the next -TestsOnly ran
   them all again), and Build.ps1's "not ok" failure summary came out empty. Build.ps1 names the TAP reporter. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..');

test('Build.ps1 runs node --test with the TAP reporter its readers expect',()=>{
 const build=fs.readFileSync(path.join(ROOT,'Build.ps1'),'utf8');
 const run=build.split(/\r?\n/).find(l=>/run-isolated\.cjs'\)\s+\$taskNode --test /.test(l));
 assert.ok(run,'the node --test line of Invoke-TaskTests');
 assert.match(run,/--test-reporter=tap\b/);
});

test('record reads the failing file from TAP output and keeps the passing one',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-test-resume-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...a)=>execFileSync('git',['-C',root,'-c','user.name=t','-c','user.email=t@t','-c','commit.gpgsign=false',...a],{stdio:'ignore'});
 fs.mkdirSync(path.join(root,'validation'));
 fs.writeFileSync(path.join(root,'validation','bad.test.cjs'),"require('node:test')('a',()=>{throw Error('x');});\n");
 fs.writeFileSync(path.join(root,'validation','good.test.cjs'),"require('node:test')('b',()=>{});\n");
 git('init','-q');git('config','core.autocrlf','false');git('add','-A');git('commit','-qm','x');
 const files=['validation/bad.test.cjs','validation/good.test.cjs'],ran=path.join(root,'ran.txt'),out=path.join(root,'out.txt'),state=path.join(root,'state.json');
 fs.writeFileSync(ran,files.join('\n'));
 /* a standalone run, as Build.ps1 starts it: without NODE_TEST_CONTEXT the child would report into this runner */
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd:root,encoding:'utf8',env,windowsHide:true});
 assert.equal(r.status,1);
 fs.writeFileSync(out,r.stdout+r.stderr);
 execFileSync(process.execPath,[path.join(ROOT,'tools','test-resume.cjs'),'record',state,root,ran,out,String(r.status)],{stdio:'ignore'});
 const files_=JSON.parse(fs.readFileSync(state,'utf8')).files;
 assert.equal(files_['validation/bad.test.cjs'].result,'fail');
 assert.equal(files_['validation/good.test.cjs'].result,'pass');
});
