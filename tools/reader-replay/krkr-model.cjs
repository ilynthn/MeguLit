// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The KiriKiri side of the control file, run from the shipped sources (no game, no TJS engine):
     native/krkrtext/KrkrText.cpp MakeCtlPath   -> the path the game process reads (GetTempPathW + MeguLit\draw\<its pid>.txt)
     native/krkrtext/script.inc st.ctl / st.clearSent / st.choicePage / st.uiDraw -> taken out of script.inc as they are and run
     after a mechanical TJS->JS rewrite (%[..] dictionaries, #c, typeof 'Object'/'String', .count, .add, [].load, int()).
   What a test gets is what the script would do with the file core really wrote; nothing here decides on its own. */
const fs=require('node:fs'),path=require('node:path');
const REPO=path.join(__dirname,'..','..');
const script=()=>fs.readFileSync(path.join(REPO,'native','krkrtext','script.inc'),'utf8').replace(/\r\n/g,'\n');
const cpp=()=>fs.readFileSync(path.join(REPO,'native','krkrtext','KrkrText.cpp'),'utf8');
function tjsFunction(src,head){const a=src.indexOf(head);if(a<0)throw Error('script.inc: '+head+' not found');const b=src.indexOf('} incontextof st;',a);if(b<0)throw Error('script.inc: end of '+head);return src.slice(a,b+1);}
function toJs(t){
 return t.replace(/%\[([^\]]*)\]/g,(_,inner)=>'{'+inner.replace(/=>/g,':')+'}')
  .replace(/(?<![\w'"])#([A-Za-z_]\w*)/g,'($1.charCodeAt(0))')
  .replace(/typeof ([\w.]+)\s*!=\s*'String'/g,"typeof $1!=='string'").replace(/typeof ([\w.]+)\s*!=\s*'Object'/g,"($1===null||typeof $1!=='object')")
  .replace(/typeof ([\w.]+)\s*==\s*'undefined'/g,"typeof $1==='undefined'").replace(/typeof ([\w.]+)\s*!=\s*'undefined'/g,"typeof $1!=='undefined'")
  .replace(/\.count\b/g,'.length').replace(/\.add\(/g,'.push(').replace(/\[\]\.load\(/g,'__load(').replace(/\bint\(/g,'Math.trunc(')
  .replace(/===void\b/g,'===undefined').replace(/!isvalid\s+(\w+)/g,'false').replace(/\bvoid\b/g,'undefined');
}
/* KrkrText.cpp MakeCtlPath, for this process's temp folder: the file:// form the game hands to Array.load, and the Windows path */
function ctlPathFor(pid,tmp){
 const src=cpp();if(!/swprintf\(tail, 64, L"MeguLit\\\\draw\\\\%lu\.txt", GetCurrentProcessId\(\)\)/.test(src))throw Error('KrkrText.cpp MakeCtlPath changed: update krkr-model.cjs');
 const win=path.join(tmp,'MeguLit','draw',String(pid>>>0)+'.txt');
 return {win,url:process.platform==='win32'?'file://./'+win[0].toLowerCase()+win.slice(2).replace(/\\/g,'/'):require('node:url').pathToFileURL(win).href};
}
const loadUrl=url=>{const m=/^file:\/\/\.\/([a-z])(\/.*)$/.exec(url);
 const buf=fs.readFileSync(m?m[1].toUpperCase()+':'+m[2]:require('node:url').fileURLToPath(url));
 const text=buf[0]===0xff&&buf[1]===0xfe?buf.slice(2).toString('utf16le'):buf.toString('utf8');const lines=text.split(/\r?\n/);if(lines.length&&lines.at(-1)==='')lines.pop();return lines;};
class KrkrModel{
 constructor({pid,tmp=require('node:os').tmpdir(),report=()=>{}}){
  const src=script(),ctl=ctlPathFor(pid,tmp);this.ctl=ctl;this.reports=[];
  const st=this.st={cfg:{roles:0,embed:0,zh:1},embMap:{},ctlRaw:'',clears:0,report:s=>{this.reports.push(s);report(s);},screen:()=>[800,600],
   /* 2026-11-26 st.ctl now resets through st.ctlOff, which also puts embedded lines back (st.embRestore): no layers here */embRestore:()=>{}};
  const global=this.global={__megulitKrkrCtlPath:ctl.url,RegExp};
  for(const head of ['st.ctlOff=function(){','st.ctl=function(){','st.clearSent=function(rec)','st.choicePage=function(P)','st.uiDraw=function(ll)'])
   {let js;try{js=tjsFunction(src,head);}catch{continue;}/* a build without that function (an older script.inc) */new Function('st','global','__load',toJs(js)+';')(st,global,loadUrl);}
 }
 tick(){this.st.ctl();return this.st.cfg;}
}
module.exports={KrkrModel,ctlPathFor,toJs,tjsFunction};
