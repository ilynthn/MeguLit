// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 提取日志: the scrubbed whole-app package with 问题说明.txt, saved on the real desktop for the QQ group */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {DatabaseSync}=require('node:sqlite');
const diag=require('../services/diagnostics.cjs'),ex=require('../services/log-export.cjs');
const who={user:'Someone',profile:'C:\\Users\\Someo',names:[]};

function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-logexport-')),desktop=path.join(root,'OneDrive','桌面');
 fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.mkdirSync(desktop,{recursive:true});
 fs.writeFileSync(path.join(root,'logs','reader-host.log'),'start C:\\Users\\Someo\\OneDrive\\桌面\\game.exe as Someone\nprofile folder Someo, mail me@example.com\nD:\\Users\\Other\\x\n');
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id,title,library,last_launched_at)');
 return {root,desktop,db};
}
const build=(root,db,options)=>diag.buildAll(root,db,{...options,who});

test('the desktop comes from the shell folder key, OneDrive redirect and %VARS% included',()=>{
 const env={USERPROFILE:'C:\\Users\\Someo',OneDrive:'C:\\Users\\Someo\\OneDrive'};
 const reg='\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    Desktop    REG_EXPAND_SZ    %USERPROFILE%\\OneDrive\\桌面\r\n';
 assert.equal(ex.parseRegistry(reg,env),'C:\\Users\\Someo\\OneDrive\\桌面');
 assert.equal(ex.parseRegistry('    Desktop    REG_EXPAND_SZ    %NOPE%\\Desktop',env),'');
 const seen=[];
 assert.equal(ex.desktopDir({env,query:key=>{seen.push(key);return reg;},exists:()=>true}),path.resolve('C:\\Users\\Someo\\OneDrive\\桌面'));
 assert.match(seen[0],/User Shell Folders$/);
 assert.equal(ex.desktopDir({env,query:()=>'',exists:p=>p==='C:\\Users\\Someo\\OneDrive\\Desktop'}),path.resolve('C:\\Users\\Someo\\OneDrive\\Desktop'));
 assert.throws(()=>ex.desktopDir({env,query:()=>'',exists:()=>false}),/DESKTOP_NOT_FOUND/);
});

test('the file name carries the problem (first 20 characters, no illegal characters), the version and the time',()=>{
 const now=new Date(2026,10,27,9,5);
 assert.equal(ex.problemPart('点读层不显示 / 读音错了: "why?" <x>|*'),'点读层不显示-读音错了-why-x');
 assert.equal([...ex.problemPart('一二三四五六七八九十一二三四五六七八九十多出来的')].length,20);
 assert.equal(ex.problemPart(' ... '),'问题');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-logname-'));
 try{
  const first=ex.fileName({problem:'读音错了',version:'1.5.2',now,dir});
  assert.equal(first,'MeguLit日志_读音错了_v1.5.2_20261127-0905.zip');assert.match(first,ex.NAME);
  fs.writeFileSync(path.join(dir,first),'');
  assert.equal(ex.fileName({problem:'读音错了',version:'1.5.2',now,dir}),'MeguLit日志_读音错了_v1.5.2_20261127-0905-2.zip');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('export: the zip lands on the desktop with 问题说明.txt (problem, version, time, game) and scrubbed logs',()=>{
 const {root,desktop,db}=fixture(),now=new Date();
 try{
  db.prepare('INSERT INTO games VALUES (?,?,?,?)').run('7','ATRI','{"engine":"Unity"}',now.getTime()-3600000);
  const out=ex.exportToDesktop(root,db,{problem:'点读层不显示 C:\\Users\\Someo\\x',version:'1.5.2',now,desktop,build});
  assert.equal(path.dirname(out.path),desktop);assert.match(out.name,/^MeguLit日志_点读层不显示-C-Users-user_v1\.5\.2_\d{8}-\d{4}\.zip$/);
  assert.ok(!out.name.includes('Someo'),out.name);
  assert.equal(ex.ownExport(out.path,desktop),out.path);
  const entries=diag.zipEntries(fs.readFileSync(out.path)),get=name=>entries.find(e=>e.name===name)?.data.toString('utf8');
  const note=get(ex.NOTE_FILE);
  assert.match(note,/问题：点读层不显示/);assert.match(note,/版本：v1\.5\.2/);assert.match(note,/时间：\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/);assert.match(note,/当前游戏：ATRI（Unity）/);
  assert.ok(!/Someo/.test(note),note);
  const log=get('logs/reader-host.log');
  assert.ok(!/Someo|Someone|me@example\.com|Other/.test(log),log);
  assert.match(log,/%USERPROFILE%\\OneDrive\\桌面\\game\.exe as <user>/);assert.match(log,/profile folder <user>/);assert.match(log,/D:\\Users\\<user>\\x/);
  assert.match(get('README.txt'),/问题说明\.txt  what the user wrote/);
  assert.equal(fs.readdirSync(desktop).length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('export: no game launched in the last 12 hours says so; an empty problem is refused',()=>{
 const {root,desktop,db}=fixture(),now=new Date();
 try{
  db.prepare('INSERT INTO games VALUES (?,?,?,?)').run('7','ATRI','{}',Math.floor((now.getTime()-48*3600000)/1000));
  const out=ex.exportToDesktop(root,db,{problem:'启动很慢',version:'1.5.2',now,desktop,build});
  assert.match(diag.zipEntries(fs.readFileSync(out.path)).find(e=>e.name===ex.NOTE_FILE).data.toString('utf8'),/当前游戏：无/);
  assert.throws(()=>ex.exportToDesktop(root,db,{problem:'  ',version:'1.5.2',now,desktop,build}),/PROBLEM_REQUIRED/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('export failure gives a code without the path, and the page explains it in three languages',async()=>{
 const {root,db}=fixture(),missing=path.join(root,'gone','Desktop');
 try{
  let error=null;try{ex.exportToDesktop(root,db,{problem:'x',version:'1.5.2',desktop:missing,build});}catch(e){error=e;}
  assert.equal(error?.message,'ENOENT');
  assert.throws(()=>ex.ownExport(path.join(root,'logs','reader-host.log'),path.join(root,'logs')),/LOG_EXPORT_NOT_FOUND/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 const ui=await import(pathToFileURL(path.join(__dirname,'..','web','feedback-ui.js')).href);
 assert.equal(ui.exportReason('EACCES','zh'),'没有权限写入桌面（可能被安全软件拦住了）');
 assert.equal(ui.exportReason(new Error('DESKTOP_NOT_FOUND'),'ja'),'デスクトップのフォルダーが見つかりません');
 assert.equal(ui.exportReason('ENOSPC','en'),'the disk is full');
 assert.equal(ui.exportReason('WEIRD_THING','zh'),'未知错误（WEIRD_THING）');
 for(const locale of ['zh','ja','en'])assert.ok(ui.exportWords(locale).note&&ui.exportWords(locale).button&&ui.exportWords(locale).reveal);
 assert.equal(ui.exportWords('zh').note,'针对修复 · QQ群内专用');assert.equal(ui.exportWords('ja').note,'修正用・QQグループ専用');assert.equal(ui.exportWords('en').note,'For fixes · QQ group only');
 const calls=[],api=async(action,params)=>{calls.push([action,params]);if(action==='logs_export_desktop')return {name:'MeguLit日志_读音错了_v1.5.2_20261127-0905.zip',path:'C:\\Desktop\\a.zip'};throw Error('x');};
 const ok=await ui.exportLogs({api,locale:'zh',version:'1.5.2',problem:'读音错了'});
 assert.deepEqual(calls[0],['logs_export_desktop',{problem:'读音错了',version:'1.5.2'}]);
 assert.equal(ok.text,'日志已保存到桌面：MeguLit日志_读音错了_v1.5.2_20261127-0905.zip，发到 QQ 群里给作者，发完可以删掉');
 const bad=await ui.exportLogs({api:async()=>{throw 'EPERM';},locale:'en',version:'1.5.2',problem:'x'});
 assert.equal(bad.ok,false);assert.match(bad.text,/^Could not export the logs: no permission/);
});
