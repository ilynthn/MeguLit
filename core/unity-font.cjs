// SPDX-License-Identifier: GPL-3.0-or-later
// Chinese fonts for embedded translation in Unity games. Unity's TextMeshPro fonts carry no Chinese glyphs, so
// LunaHook's TMP font loader needs LunaTranslator's font bundles (the same archive LunaTranslator downloads, from
// lunatranslator.org). They are downloaded once into cache\unity-font and shared by every Unity game; HookBridge
// points the loader at that folder when LunaHook reports a Unity engine.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const URL='https://lunatranslator.org/Resource/TMP_Font_AssetBundles_2025-12-08.zip';
class UnityFont{
 constructor(root){this.dir=path.join(root,'cache','unity-font');this.state={state:'idle',received:0,total:0,error:''};}
 // A game is Unity when its folder holds the Unity player.
 static isUnity(exe){const dir=path.dirname(String(exe||''));try{return fs.existsSync(path.join(dir,'UnityPlayer.dll'))||fs.readdirSync(dir).some(n=>/_Data$/i.test(n)&&fs.existsSync(path.join(dir,n,'globalgamemanagers')));}catch{return false;}}
 installed(){const walk=d=>{let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{return '';}for(const e of list){if(e.isFile()&&e.name.startsWith('arialuni_sdf_u'))return d;}for(const e of list)if(e.isDirectory()){const r=walk(path.join(d,e.name));if(r)return r;}return '';};return walk(this.dir);}
 status(){return {...this.state,installed:!!this.installed()};}
 download(){
  if(['downloading','extracting'].includes(this.state.state))return this.status();
  this.state={state:'downloading',received:0,total:0,error:''};
  (async()=>{const archive=path.join(path.dirname(this.dir),'unity-font.zip.part');
   try{
    /* a stalled connection used to keep the state at downloading forever, so no retry was possible: 30 s with no data aborts */
    const idle=new AbortController();let timer=setTimeout(()=>idle.abort(),30000);const poke=()=>{clearTimeout(timer);timer=setTimeout(()=>idle.abort(),30000);};
    try{const res=await fetch(URL,{redirect:'follow',signal:idle.signal});poke();if(!res.ok||!res.body)throw Error('下载失败 HTTP '+res.status);
    this.state.total=Number(res.headers.get('content-length'))||0;fs.mkdirSync(path.dirname(archive),{recursive:true});
    const out=fs.createWriteStream(archive);let failed=null;out.on('error',e=>{failed=e;out.emit('drain');});
    try{for await(const chunk of res.body){poke();if(failed)throw failed;this.state.received+=chunk.length;if(!out.write(chunk))await new Promise(r=>out.once('drain',r));}if(failed)throw failed;}catch(e){out.destroy();throw e;}
    await new Promise((resolve,reject)=>out.end(e=>e?reject(e):resolve()));if(failed)throw failed;}finally{clearTimeout(timer);}
    this.state.state='extracting';fs.rmSync(this.dir,{recursive:true,force:true});fs.mkdirSync(this.dir,{recursive:true});
    // Windows 10+ ships bsdtar, which reads zip archives.
    await new Promise((resolve,reject)=>execFile(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',archive,'-C',this.dir],{windowsHide:true,timeout:300000},e=>e?reject(Error('解压失败：'+e.message)):resolve()));
    fs.rmSync(archive,{force:true});if(!this.installed())throw Error('字体包内容不完整');
    this.state={state:'done',received:this.state.received,total:this.state.total,error:''};
   }catch(e){try{fs.rmSync(archive,{force:true});}catch{}this.state={state:'error',received:0,total:0,error:String(e.message||e)};}
  })();
  return this.status();
 }
}
module.exports={UnityFont};
