// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter, a second opinion when our own readers read nothing: GalTransl-GalGameReverse-Skill (GPL-3.0, an
   external checkout on this PC, never in git; MEGULIT_GT_SKILL or --gt-skill). Only while adapting, on our machine: its lines are
   evidence (can the script be read at all, how many lines, which of its Python files to port to services/original-engines), never a
   source of text for the player (the player has no Python and no copy of it).
   secondOpinion({gameDir, out, skill, python}, {run}) -> {ok, candidates:[{engine, strength, matched, page}], port, extracted:{lines,
   files, command} | null, error}. detect.py is read-only and bounded; an extractor runs only when its command needs nothing but the
   game folder and an output folder (out/external/galtransl, never the game folder). Nothing here is fatal: errors come back as error. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const DEFAULT_SKILL=process.env.MEGULIT_GT_SKILL||'';
const TRIGGER=new Set(['unsupported-engine','unknown-pack','decrypt-failed','parse-failed','no-script','error']);
const wanted=({probe,caps})=>!caps?.known||TRIGGER.has(String(probe?.step||'error'));
function runPy(python,args,{cwd,timeoutMs}){const r=spawnSync(python,args,{cwd,encoding:'utf8',windowsHide:true,timeout:timeoutMs,maxBuffer:32<<20,env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
 return {status:r.status,stdout:String(r.stdout||''),stderr:String(r.stderr||''),error:r.error?String(r.error.code||r.error.message):''};}
/* an extract command template whose only required placeholders are the game folder and the output folder ([...] parts are optional) */
function simpleCommand(template){const t=String(template||'').replace(/\s*\[[^\]]*\]/g,'');const holes=[...t.matchAll(/<[^>]+>/g)].map(m=>m[0]);
 if(!/^python -m python\.engines\.\w+/.test(t)||!holes.includes('<游戏目录>')||!holes.includes('<输出目录>')||holes.some(h=>h!=='<游戏目录>'&&h!=='<输出目录>'))return null;
 const parts=t.match(/"[^"]*"|\S+/g).slice(1).map(x=>x.replace(/^"|"$/g,''));return parts;}
function countLines(dir){let lines=0,files=0;const walk=d=>{let e=[];try{e=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
  for(const x of e){const f=path.join(d,x.name);if(x.isDirectory())walk(f);else if(/\.json$/i.test(x.name)&&/gt_input/i.test(f)){try{const j=JSON.parse(fs.readFileSync(f,'utf8'));if(Array.isArray(j)){lines+=j.filter(o=>o&&typeof o.message==='string'&&o.message.trim()).length;files++;}}catch{}}}};
 walk(dir);return {lines,files};}
function secondOpinion({gameDir,out,skill=DEFAULT_SKILL,python='python'},{run=runPy,detectMs=30000,extractMs=180000}={}){
 const res={ok:false,candidates:[],port:'',extracted:null,error:''};
 if(!skill||!fs.existsSync(path.join(skill,'python','detect.py'))){res.error=skill?'GalTransl skill not found ('+path.basename(skill)+')':'MEGULIT_GT_SKILL not set';return res;}
 const d=run(python,['-I',path.join(skill,'python','detect.py'),gameDir,'--max-seconds','15'],{cwd:skill,timeoutMs:detectMs});
 let j=null;try{j=JSON.parse(d.stdout);}catch{}
 if(!j){res.error='detect.py: '+(d.error||d.stderr.trim().split(/\r?\n/).pop()||'no output').slice(0,160);return res;}
 res.candidates=(j.next_steps||[]).map(s=>({engine:String(s.engine||''),strength:String(s.strongest_evidence||''),matched:s.matched_files|0,page:String(s.engine_page||''),evidence:String((j.candidates?.[s.engine]||[])[0]?.evidence||'').slice(0,200)})).filter(c=>c.engine);
 if(!res.candidates.length){res.error='no candidate';return res;}
 res.ok=true;const first=(j.next_steps||[])[0],py=path.join('python','engines',res.candidates[0].engine+'.py');if(fs.existsSync(path.join(skill,py)))res.port=py.replace(/\\/g,'/');
 for(const cmd of first.extract_commands||[]){const parts=simpleCommand(cmd);if(!parts)continue;
  const dest=path.join(out,'external','galtransl');fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
  const args=['-E','-s',...parts.map(p=>p==='<游戏目录>'?gameDir:p==='<输出目录>'?dest:p)];
  const r=run(python,args,{cwd:skill,timeoutMs:extractMs});const n=countLines(dest);
  res.extracted={...n,command:parts.slice(0,3).join(' '),status:r.status,error:r.status===0?'':(r.error||r.stderr.trim().split(/\r?\n/).pop()||'').slice(0,160)};break;}
 return res;}
/* the note the plan shows */
function note(o){if(!o?.ok)return '';const c=o.candidates[0];return 'GalTransl 认为是 '+c.engine+'（'+c.strength+(c.evidence?'：'+c.evidence:'')+'）'+(o.extracted?.lines?'，读出 '+o.extracted.lines+' 句':o.extracted?'，提取没成功（'+(o.extracted.error||'0 句')+'）':'')+(o.port?'：移植 '+o.port+' 到 services/original-engines/':'');}
module.exports={secondOpinion,simpleCommand,countLines,wanted,note,TRIGGER};
