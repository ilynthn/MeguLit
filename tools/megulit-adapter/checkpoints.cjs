// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter, where a person has to look (owner: 需要人看的地方停下来，给出截图和一句话问题，让人确认).
   questions(state) -> [{id, ask, evidence:[absolute picture paths], options:[...], free?}] for what the machine cannot settle:
     vndb       the work id is not known (no seed, no HANDOFF row)             evidence: the title picture
     cn         the Chinese name for public text 「原名（中文名）」 (AGENTS.md)  evidence: none
     release    nobody named the release and nothing guessed it                evidence: the title picture
     again      HANDOFF already lists this VNDB id + release                    evidence: none (the row)
     engine     no engine rule matched                                          evidence: the title picture
     install    only disc images, no installed game                            evidence: none (the image names)
     lines      the live check passed: does the line change with the game          evidence: dialogue pictures
     dialogue   the live check passed: is the original really gone on screen     evidence: dialogue pictures (hidden desktops lied before)
     choice     the run reached a choice: are the options there and right          evidence: the choice picture
   2026-11-27 (owner: 实机验证，看换句、原文隐藏、选项): these three answers decide, not Cardinal
     stuck      the run stopped on a screen (title, name entry, black)          evidence: the last pictures
     readmode   the hide did not pass: ship the game in read mode?              evidence: dialogue pictures
   status(state, answers) -> the seed status the answers allow ('verified' | 'read' | 'skeleton' | '' = no seed yet).
   review(file, state, qs) writes one local HTML page with each question and its pictures (nothing leaves this PC). */
const fs=require('node:fs'),path=require('node:path');
const VNDB=/^v[1-9]\d{0,7}$/;
const list=(dir,re)=>{try{return fs.readdirSync(dir).filter(f=>re.test(f)).map(f=>path.join(dir,f)).sort();}catch{return [];}};
const mtime=f=>{try{return fs.statSync(f).mtimeMs;}catch{return 0;}};
/* the pictures of a cold run: client-area shots (run/shot-*), OCR grabs (run/ocr-*), whole-screen shots of a --foreground run (screen/*) */
/* 2026-11-27 (アイキス3 sexy: a whole-screen picture showed another agent's game, 死に逝く君, and was offered as dialogue evidence)
   a whole-screen picture whose recorder noted another process in front (screen-NN.fg, the foreground window's process id) is not
   evidence of this game; pictures without that note (older runs) are kept */
function gamePids(run){try{const r=JSON.parse(fs.readFileSync(path.join(run,'run.json'),'utf8'));return [r.pid,r.launcherPid].filter(Boolean).map(String);}catch{return [];}}
function inFront(file,pids){if(!pids.length)return true;let fg='';try{fg=fs.readFileSync(file.replace(/\.png$/i,'.fg'),'utf8').trim();}catch{return true;}return !fg||pids.includes(fg);}
function pictures(coldOut){const run=path.join(coldOut,'run'),pids=gamePids(run);return {shots:list(run,/^shot-.*\.jpe?g$/i),ocr:list(run,/^ocr-\d+\.png$/i).sort((a,b)=>mtime(a)-mtime(b)),screen:list(path.join(coldOut,'screen'),/\.png$/i).filter(f=>inFront(f,pids))};}
function phaseAt(cold,name){const p=(cold?.phases||[]).find(x=>x.name===name);return p?Date.parse(p.at):0;}
function evidence(coldOut,cold){const P=pictures(coldOut),all=[...P.screen,...P.shots];
 const title=P.screen[0]||P.shots[0]||P.ocr[0]||'';
 const lines=P.shots.filter(f=>/line-\d+/i.test(f));const dialogue=[...lines.slice(-2),...P.screen.filter(f=>{const t=phaseAt(cold,'fast');return t&&mtime(f)<=t;}).slice(-1)];
 const tc=phaseAt(cold,'choice');const near=arr=>arr.filter(f=>mtime(f)>=tc-1000).sort((a,b)=>mtime(a)-mtime(b))[0]||'';
 const choice=tc?near(P.screen)||near(P.ocr)||'':'';
 return {title,dialogue:[...new Set(dialogue)],choice,last:all.sort((a,b)=>mtime(a)-mtime(b)).slice(-2)};}
function questions({identity={},caps={},cold=null,coldOut='',force=false,install=[]}={}){const q=[],ev=coldOut?evidence(coldOut,cold):{title:'',dialogue:[],choice:'',last:[]};const pic=x=>[x].flat().filter(Boolean);
 /* only disc images (アイキス3 sexy: iso+mds and an update folder): installing needs a mount and the installer, a person's step */
 if(install.length)q.push({id:'install',ask:'只有光盘镜像（'+install.map(f=>path.basename(f)).slice(0,3).join('、')+'），要先挂载安装。装好后回 install=<装好的游戏目录>，再对那个目录重跑',evidence:[],free:true});
 if(!identity.vndb)q.push({id:'vndb',ask:'这是哪部作品？回 VNDB 作品号（v 开头）',evidence:pic(ev.title),free:true});
 /* AGENTS.md: public text names a work 「原名（中文名）」; '-' when it has no Chinese name */
 if(!identity.cn)q.push({id:'cn',ask:'这部作品的中文名？（VNDB 中文标题或通行译名；没有就回 -）',evidence:[],free:true});
 if(!identity.release&&!identity.releaseGuess)q.push({id:'release',ask:'这是哪个发行版？'+((identity.releaseCandidates||[]).length?'VNDB 候选：'+identity.releaseCandidates.join('、'):'（例：DL 版、Steam 版、DVD 版、汉化硬盘版）'),evidence:pic(ev.title),free:true});
 const same=(identity.adapted||[]).filter(r=>r.same);
 if(same.length&&!force)q.push({id:'again',ask:'HANDOFF 已登记过这个作品和发行版（'+same.map(r=>r.status+' '+r.ref).join('；')+'），还要重新适配吗？',evidence:[],options:['yes','no']});
 if(caps.known===false)q.push({id:'engine',ask:'规则表认不出引擎（'+(caps.id||'unknown')+'）'+(identity.vndbLookup?.engine?'，VNDB 记的是 '+identity.vndbLookup.engine:'')+(caps.luna?'，LunaHook 认为是 '+caps.luna:'')+'，这是什么引擎？',evidence:pic(ev.title),free:true});
 const v=cold?.verdict||'';
 if(v==='pass'){q.push({id:'lines',ask:'这几张对话画面里，台词跟着游戏换句了吗（没有停在旧句、没有跳句）？',evidence:pic(ev.dialogue),options:['yes','no']});
  q.push({id:'dialogue',ask:'这几张对话画面里，游戏原文藏住了、没有残影吗？',evidence:pic(ev.dialogue),options:['yes','no']});
  if(cold.checks?.choice?.measured||(cold.phases||[]).some(p=>/^choice/.test(String(p?.name||''))))q.push({id:'choice',ask:'这张是第一个选项：选项文字还在、能点吗？',evidence:pic(ev.choice||ev.last),options:['yes','no']});}
 if(v==='fail'&&cold.checks?.hidden?.measured&&cold.checks.hidden.ok===false)q.push({id:'readmode',ask:'原文隐藏没过（'+(cold.checks.hidden.detail||'')+'），先按读模式发 seed 吗？',evidence:pic(ev.dialogue),options:['yes','no']});
 /* a Steam build without steam_appid.txt and no single appid from VNDB (千恋＊万花: 1144400 and 1221010) */
 if(/steam-appid-unknown/.test(String(cold?.stuck||''))){q.push({id:'steam',ask:'这是 Steam 版，冷测试要它的 appid'+((identity.steamCandidates||[]).length?'（VNDB 候选：'+identity.steamCandidates.join('、')+'）':'')+'，回 steam=<appid>，再加 --steam-appid 重跑',evidence:[],free:true});}
 else if(v==='inconclusive'&&cold?.stuck)q.push({id:'stuck',ask:'冷测试卡在这里（'+cold.stuck+'），下一步该按什么？（回按键、点哪个字，或 skip）',evidence:pic(ev.last),free:true});
 return q;}
const yes=v=>/^(y|yes|ok|是|对|好|行|可以)$/i.test(String(v||'').trim());
function status({cold=null}={},a={}){const v=cold?.verdict||'';
 if(v==='pass')return yes(a.dialogue)&&(a.lines===undefined||yes(a.lines))&&(a.choice===undefined||yes(a.choice))?'verified':a.dialogue!==undefined?'skeleton':'';
 if(v==='fail')return a.readmode!==undefined?(yes(a.readmode)?'read':'skeleton'):'';
 return '';}
/* answers 'id=value' -> {id:value}; a VNDB answer is checked */
function parseAnswers(args){const out={};for(const s of args){const i=String(s).indexOf('=');if(i<1)throw Error('answer is id=value: '+s);const k=s.slice(0,i).trim(),v=s.slice(i+1).trim();
  if(k==='vndb'&&!VNDB.test(v.toLowerCase()))throw Error('vndb is v<number>: '+v);out[k]=k==='vndb'?v.toLowerCase():v;}return out;}
function open(qs,a){return qs.filter(x=>a[x.id]===undefined);}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function review(file,{title='',summary=[]}={},qs=[],answers={}){const dir=path.dirname(file),rel=f=>path.relative(dir,f).split(path.sep).map(encodeURIComponent).join('/');
 const body=qs.map(x=>'<section><h2>'+esc(x.id)+'</h2><p>'+esc(x.ask)+'</p>'+(answers[x.id]!==undefined?'<p class="a">已答：'+esc(answers[x.id])+'</p>':'<p class="cmd">node tools/megulit-adapter.cjs answer "'+esc(dir)+'" '+esc(x.id)+'='+(x.options?x.options.join('|'):'…')+'</p>')+x.evidence.map(f=>'<img src="'+esc(rel(f))+'" alt="'+esc(path.basename(f))+'">').join('')+'</section>').join('\n');
 const html='<!doctype html><meta charset="utf-8"><title>MeguLit-Adapter 确认</title><style>body{font:15px system-ui;margin:16px;max-width:1100px;background:#fff;color:#111}img{max-width:100%;display:block;margin:8px 0;border:1px solid #ccc}.cmd{font:13px monospace;background:#f3f3f3;padding:6px}.a{color:#070}@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}.cmd{background:#262626}}</style>'+
  '<h1>'+esc(title)+'</h1><ul>'+summary.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>'+(body||'<p>没有要人看的地方</p>');
 fs.writeFileSync(file,html);return file;}
module.exports={questions,status,parseAnswers,open,review,evidence,pictures,yes};
