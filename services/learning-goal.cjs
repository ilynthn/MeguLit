// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 学习 → 学习目标 (2026-11-12): after the level, what you are learning for. Several at once: JLPT (level, score, which
   sitting), EJU (subjects, 日本語 band and parts, which sitting), 娱乐 (gal / anime) and 交流 (conversation) with the
   directions to push. The goals set the countdown and which lessons come first. Synced with the account (settings kind). */
const fs=require('fs'),path=require('path');
const GOALS=['jlpt','eju','fun','talk'];
const JLPT_LEVELS=['N5','N4','N3','N2','N1'];
const EJU_SUBJECTS=['ja','sci','hum','math1','math2'];
const EJU_BANDS=[250,300,350,400];
const EJU_PARTS=['read','listen','write'];
const FUN_FOCUS=['story','voice','shadow','slang'];
const TALK_FOCUS=['daily','shadow','slang','polite'];
const FILE=root=>path.join(root,'data','config','learning-goal.json');
const pick=(list,v,d)=>list.includes(v)?v:d;
const some=(list,v)=>[...new Set((Array.isArray(v)?v:[]).filter(x=>list.includes(x)))];
const yearOf=(v,now)=>{const y=Number(v),t=new Date(now).getFullYear();return Number.isInteger(y)&&y>=t&&y<=t+5?y:t;};
function normalize(o={},now=Date.now()){
  const goals=some(GOALS,o.goals),out={goals,savedAt:Number(o.savedAt)||0};
  if(goals.includes('jlpt')){const j=o.jlpt||{};out.jlpt={level:pick(JLPT_LEVELS,j.level,'N3'),score:Math.max(80,Math.min(180,Math.round(Number(j.score)||120))),full:j.full===true,month:pick([7,12],Number(j.month),7),year:yearOf(j.year,now)};if(out.jlpt.full)out.jlpt.score=180;}
  if(goals.includes('eju')){const e=o.eju||{},subjects=some(EJU_SUBJECTS,e.subjects);out.eju={subjects:subjects.includes('ja')?subjects:['ja',...subjects],band:pick(EJU_BANDS,Number(e.band),300),parts:some(EJU_PARTS,e.parts).length?some(EJU_PARTS,e.parts):[...EJU_PARTS],month:pick([6,11],Number(e.month),6),year:yearOf(e.year,now)};if(out.eju.subjects.includes('sci')&&out.eju.subjects.includes('hum'))out.eju.subjects=out.eju.subjects.filter(x=>x!=='hum');}
  if(goals.includes('fun'))out.fun={focus:some(FUN_FOCUS,o.fun?.focus)};
  if(goals.includes('talk'))out.talk={focus:some(TALK_FOCUS,o.talk?.focus)};
  return out;
}
/* the n-th Sunday of a month (JLPT: first Sunday of July / December; EJU: third Sunday of June, second of November) */
function sunday(year,month,n){const d=new Date(year,month-1,1,9);d.setDate(1+((7-d.getDay())%7)+7*(n-1));return d;}
const examDay=(kind,year,month)=>kind==='jlpt'?sunday(year,month,1):sunday(year,month,month===6?3:2);
function countdown(goal,now=Date.now()){
  const out=[];
  for(const kind of ['jlpt','eju'])if(goal?.[kind]){const g=goal[kind],d=examDay(kind,g.year,g.month),days=Math.ceil((d.getTime()-now)/864e5);/* local calendar date: toISOString() is UTC and shows the day before east of UTC+9 */out.push({kind,date:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),days,past:days<0});}
  return out.sort((a,b)=>a.days-b.days);
}
/* What comes first. groups: grammar categories pulled to the front, in order; level: the grammar level to open on;
   review: how review is weighted (kind → weight) */
function plan(goal,userLevel=null){
  const g=goal||{goals:[]},groups=[],review={},tabs=[];let level=null;
  const add=(list,w)=>{for(const x of list)if(!groups.includes(x))groups.push(x);for(const x of list)review[x]=Math.max(review[x]||0,w);};
  if(g.jlpt){level=g.jlpt.level;add(['particle','form','pattern','cond','perm','give','aspect','guess','voice','link','formal'],g.jlpt.full?3:2);tabs.push('grammar');}
  if(g.eju){if(!level)level='N2';const p=g.eju.parts;if(p.includes('read'))add(['link','stance','formal','time','pattern'],2);if(p.includes('listen'))add(['speech','ending','aspect'],2);if(p.includes('write'))add(['link','formal','cond'],2);tabs.push('grammar','readwords');}
  if(g.fun){add(['speech','ending','stance','slang','net'],1);tabs.push('readwords');if(g.fun.focus.includes('voice')||g.fun.focus.includes('shadow'))tabs.push('kana');}
  if(g.talk){add(['speech','ending','net','trend','slang','give','perm'],1);tabs.push('grammar');if(!level&&!g.jlpt&&!g.eju&&userLevel&&/^N[1-3]$/.test(userLevel))level='N0';}
  return {level,groups,review,tabs:[...new Set(tabs)]};
}
function get(root,now=Date.now()){let o={};try{o=JSON.parse(fs.readFileSync(FILE(root),'utf8'));}catch{}const goal=normalize(o,now);return {goal,countdown:countdown(goal,now),plan:plan(goal)};}
function save(root,goal){const file=FILE(root);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(goal));fs.renameSync(file+'.tmp',file);}
function set(root,input,now=Date.now()){const goal=normalize({...input,savedAt:now},now);save(root,goal);return {goal,countdown:countdown(goal,now),plan:plan(goal)};}
/* account sync: a cloud copy only replaces this PC's goal when it was saved later */
function applySynced(root,data){if(!data||typeof data!=='object')return false;let local={};try{local=JSON.parse(fs.readFileSync(FILE(root),'utf8'));}catch{}if((Number(local.savedAt)||0)>=(Number(data.savedAt)||0))return false;save(root,normalize(data));return true;}
function synced(root){try{const o=JSON.parse(fs.readFileSync(FILE(root),'utf8'));const g=normalize(o);return g.goals.length?g:null;}catch{return null;}}
module.exports={GOALS,JLPT_LEVELS,EJU_SUBJECTS,EJU_BANDS,EJU_PARTS,FUN_FOCUS,TALK_FOCUS,FILE,normalize,countdown,examDay,plan,get,set,applySynced,synced};
