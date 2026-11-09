// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');

test('build discovery accepts a versioned MSVC component without the default component ID',{skip:process.platform!=='win32'},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-build-env-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const install=path.join(root,'BuildTools'),msvc=path.join(install,'VC/Tools/MSVC/14.42.34433');
 const installer=path.join(root,'Microsoft Visual Studio/Installer'),kits=path.join(root,'Windows Kits/10');
 for(const file of [path.join(msvc,'lib/x64/msvcrt.lib'),path.join(kits,'Lib/10.0.22621.0/um/x64/kernel32.lib'),path.join(kits,'bin/10.0.22621.0/x64/rc.exe')]){
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'');
 }
 fs.mkdirSync(installer,{recursive:true});
 const source=path.join(root,'Vswhere.cs'),vswhere=path.join(installer,'vswhere.exe');
 fs.writeFileSync(source,'using System; class Vswhere { static void Main(string[] args) { if(Array.IndexOf(args,"-requires")>=0)return; Console.WriteLine(Environment.GetEnvironmentVariable("MEGULIT_TEST_VS_INSTALLATION")); } }');
 const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 execFileSync(compiler,['/nologo','/target:exe','/out:'+vswhere,source],{windowsHide:true});
 const script=path.resolve(__dirname,'../tools/build-env.ps1').replace(/'/g,"''");
 const command=". '"+script+"'; if(-not $taskMsvc){throw 'MSVC_NOT_DISCOVERED'}; $taskMsvc.FullName";
 const output=execFileSync('powershell.exe',['-NoProfile','-Command',command],{
  windowsHide:true,encoding:'utf8',env:{...process.env,'ProgramFiles(x86)':root,MEGULIT_BUILD_TOOLS:path.join(root,'offline-tools'),MEGULIT_TEST_VS_INSTALLATION:install}
 });
 assert.equal(output.trim(),msvc);
});
