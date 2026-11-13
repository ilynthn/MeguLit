'use strict';
// User report (2026-11-09): 穢翼のユースティア needs Japanese locale; launching told the user to install Locale Emulator
// from a Library button that no longer exists. Launch now installs it on its own (GitHub, then relays, pinned by
// size + sha256); when every source fails the error says the download failed, and the failure is logged.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LocaleEmulator}=require('../core/locale-emulator.cjs');

test('when every source fails, ensure() reports a download failure and logs each source',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'le-'));fs.mkdirSync(path.join(root,'logs'));
 const hosts=[],le=new LocaleEmulator(root,async url=>{hosts.push(new URL(url).hostname);throw Error('ECONNRESET');});
 le.status=async()=>({installed:false,job:le.job});
 try{
  await assert.rejects(le.ensure(),/LOCALE_EMULATOR_DOWNLOAD_FAILED/);
  /* 2026-11-13: MeguLit's own R2 mirror is a source as well (outside mainland China after GitHub, inside it first) */
  assert.deepEqual(hosts,['github.com','dl.megulit.com','cn-dl.megulit.com','gh-proxy.com','ghproxy.net']);
  assert.equal(fs.readFileSync(path.join(root,'logs','locale-emulator.log'),'utf8').match(/download /g).length,5);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a relay that serves a different file is rejected',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'le-'));fs.mkdirSync(path.join(root,'logs'));
 const fake=Buffer.alloc(154135);fake.writeUInt32LE(0x04034b50,0);
 const le=new LocaleEmulator(root,async()=>({ok:true,body:[fake]}));le.status=async()=>({installed:false,job:le.job});
 try{await assert.rejects(le.ensure(),/LOCALE_EMULATOR_DOWNLOAD_FAILED/);assert.match(fs.readFileSync(path.join(root,'logs','locale-emulator.log'),'utf8'),/LE_PACKAGE_INVALID/);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('no message points to a Library install button any more',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
 assert.doesNotMatch(app,/游戏库安装 Locale Emulator/);assert.match(app,/LOCALE_EMULATOR_DOWNLOAD_FAILED/);
});
