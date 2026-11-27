// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 MeguLit-Adapter, zero-latency pairing is part of the adaptation (owner: 有中文汉化的作品，适配完就该直接能零延迟；
   适配时如果有汉化，配对是必做步骤，没做完不算 ready). OZMAFIA!! shipped as skeleton while MeguLit still said 「本机没找到汉化包」
   with the 夜鸮汉化 sitting in the game folder: the adapter never ran the pairing the user's MeguLit runs.
   chineseHints(gameDir, exe) -> [why]   what says a translation sits with this game: a translated launcher beside the
                                          Japanese exe (xxx_cn.exe, xxx_chs.exe, 中文版.exe), a translation folder
                                          (汉化 / 中文 / chs / cn), an overlay table (mai\word.mai)
   check({exe}) -> {status, paired, translations, source, error}
                                          MeguLit's own search (original-text autoPatch over the game folder, its own
                                          subfolders and its siblings; no drive search) in a throwaway data folder
   need(hints, probe) -> true when the adaptation must end with status 'ready' */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const LAUNCHER=/(?:[_\-. ]|^)(?:cn|chs|cht|sc|tc|zh|chinese)(?:[_\-. ]|\.exe$)|中文|汉化|漢化|简体|繁體|繁体/i;
const FOLDER=/^(?:汉化|漢化|中文|简体中文|繁體中文|chs|cht|cn|zh|zh[-_]?cn|chinese|patch[-_]?(?:cn|chs))$/i;
function chineseHints(gameDir,exe){const out=[];let entries=[];try{entries=fs.readdirSync(gameDir,{withFileTypes:true});}catch{return out;}
 const main=path.basename(String(exe||'')).toLowerCase();
 for(const e of entries){
  if(e.isFile()&&/\.exe$/i.test(e.name)&&e.name.toLowerCase()!==main&&LAUNCHER.test(e.name)&&!/unins|setup|config|launcher\.exe$/i.test(e.name))out.push('汉化启动程序 '+e.name);
  else if(e.isDirectory()&&FOLDER.test(e.name))out.push('汉化文件夹 '+e.name+'\\');}
 if(fs.existsSync(path.join(gameDir,'mai','word.mai')))out.push('外挂汉化码表 mai\\word.mai');
 return out;}
async function check({exe,repo=path.join(__dirname,'..','..')}){
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-adapter-pairing-'));
 try{
  const ot=require(path.join(repo,'services','original-text.cjs')),{DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
  const r=await ot.autoPatch(data,db,'1',{drives:false,force:true}),s=ot.status(data,db,'1');
  const cov=s.patch?.coverage?.script||{};
  return {status:s.patchStatus||'none',running:s.status||'',paired:cov.paired|0,translations:cov.translations|0,source:r.found||'',error:r.found?'':(r.notFound?'not-found':JSON.stringify(r))};
 }catch(e){return {status:'error',paired:0,translations:0,source:'',error:String(e.message||e)};}
 finally{fs.rmSync(data,{recursive:true,force:true});}}
const need=(hints,probe)=>(hints||[]).length>0||probe?.step==='chinese-build';
/* the adapter's pairing line for the summary and the PR */
function line(p){if(!p)return '零延迟配对：没查';if(p.status==='ready')return '零延迟配对：已启用（'+p.paired+' 句，来源 '+path.basename(p.source||'')+'）';
 return '零延迟配对：'+(p.hints?.length?'有汉化（'+p.hints.join('、')+'）但':'')+'没配上（'+p.status+(p.error?'，'+p.error:'')+'）';}
module.exports={chineseHints,check,need,line,LAUNCHER,FOLDER};
