// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The control file %TEMP%\MeguLit\draw\<pid>.txt as the native engine-draw observers read it (2026-11-26, for Cardinal's YU-RIS and BGI
   replay models). Ports of native/megulithook/YurisDraw.h ParseControl and BgiDraw.h ReadLine / CfgRoles / ValidRole / ParseControl,
   byte for byte on the UTF-16LE file; source() checks that the shipped headers still hold the parser these ports were taken from, so a
   changed header fails loudly here instead of the model drifting away from the game side. */
const fs=require('node:fs'),path=require('node:path');
const REPO=path.join(__dirname,'..','..'),HOOK=path.join(REPO,'native','megulithook');
/* lines of the headers the ports follow; any of them missing means the native parser changed */
const PINS={
 yuris:['static bool ParseControl(const unsigned char *raw,size_t bytes){','if(!complete||line.compare(0,5,"#cfg "))return false;int keys=0;bool on=false;','return keys==1&&on;',
  'unsigned char raw[1024];DWORD got=0;'],
 bgi:['static bool ParseControl(const unsigned char *raw,size_t bytes,RoleMap *maps,int &count){','return keys==1&&on;',
  'bool known=role=="line"||role=="name"||role=="choice"||role=="button"||role=="menu"||role=="system";',
  'else if(line!="#clearline"&&line.compare(0,7,"#table ")&&line.compare(0,13,"#choiceframe "))break;','unsigned char raw[16384];DWORD got=0;']};
function source(engine){const file=path.join(HOOK,engine==='yuris'?'YurisDraw.h':'BgiDraw.h');const src=fs.readFileSync(file,'utf8');
 const missing=PINS[engine].filter(p=>!src.includes(p));if(missing.length)throw Error(path.basename(file)+' control parser changed ('+missing[0].slice(0,60)+'): update tools/reader-replay/draw-control.cjs');return true;}
function cfgRoles(line){if(!line.startsWith('#cfg '))return false;let keys=0,on=false;
 for(let begin=5;begin<line.length;){while(begin<line.length&&line[begin]===' ')begin++;let end=line.indexOf(' ',begin);if(end<0)end=line.length;const token=line.slice(begin,end);
  if(token.startsWith('roles=')){keys++;on=token==='roles=1';}else if(token==='roles')return false;begin=end;}
 return keys===1&&on;}
/* YurisDraw.h ParseControl: only the complete first ASCII cfg line of at most 1024 bytes */
function yuris(buf){const raw=buf.subarray(0,1024),bytes=raw.length;if(bytes<2)return false;let at=0;if(raw[0]===0xff&&raw[1]===0xfe)at=2;else if(raw[1])return false;
 let line='',complete=false;
 for(;at+2<=bytes;at+=2){const c=raw[at],high=raw[at+1];if(high)return false;
  if(c===0x0a){complete=true;break;}
  if(c===0x0d){complete=at+4<=bytes&&raw[at+2]===0x0a&&!raw[at+3];break;}
  if(c<0x20||c>0x7e)return false;line+=String.fromCharCode(c);}
 return complete&&cfgRoles(line);}
function readLine(raw,state){let line='',ascii=true;const bytes=raw.length;
 for(;state.at+2<=bytes;state.at+=2){const c=raw[state.at],high=raw[state.at+1];
  if(!high&&c===0x0a){state.at+=2;return {line,ascii};}
  if(!high&&c===0x0d){if(state.at+4>bytes||raw[state.at+2]!==0x0a||raw[state.at+3])return null;state.at+=4;return {line,ascii};}
  if(high||c<0x20||c>0x7e)ascii=false;else line+=String.fromCharCode(c);}
 return null;}
function validRole(via,role){if(!['line','name','choice','button','menu','system'].includes(role)||!via||via.length>=64)return false;
 let words=0;for(let begin=0;begin<via.length;){let end=via.indexOf(',',begin);if(end<0)end=via.length;if(end===begin||end-begin>8||++words>6)return false;
  for(let i=begin;i<end;i++)if(!/[0-9a-f]/.test(via[i]))return false;if(end===via.length)return true;begin=end+1;if(begin===via.length)return false;}
 return false;}
/* BgiDraw.h ParseControl: {on, roles:[{via, role}]} (16 roles at most, 16 KB read) */
function bgi(buf){const raw=buf.subarray(0,16384),off={on:false,roles:[]};if(raw.length<2)return off;const state={at:0};if(raw[0]===0xff&&raw[1]===0xfe)state.at=2;else if(raw[1])return off;
 const first=readLine(raw,state);if(!first||!first.ascii||!cfgRoles(first.line))return off;const roles=[];
 for(let l;(l=readLine(raw,state));){if(!l.ascii)break;const line=l.line;
  if(line.startsWith('#role ')){const eq=line.indexOf('=',6);if(eq<0)continue;const via=line.slice(6,eq),role=line.slice(eq+1);if(roles.length<16&&validRole(via,role))roles.push({via,role});}
  else if(line!=='#clearline'&&!line.startsWith('#table ')&&!line.startsWith('#choiceframe '))break;}
 return {on:true,roles};}
/* BgiDraw.h RoleOf: the first map whose via is a prefix of the row's via at a comma */
function roleOf(roles,via){for(const r of roles){const k=r.via.length;if(k&&via.startsWith(r.via)&&(via.length===k||via[k]===','))return r.role;}return null;}
const controlPath=(pid,tmp)=>path.join(tmp,'MeguLit','draw',String(Number(pid)>>>0)+'.txt');
function read(pid,tmp){try{return fs.readFileSync(controlPath(pid,tmp));}catch{return null;}}
module.exports={source,yuris,bgi,roleOf,cfgRoles,validRole,controlPath,read,PINS};
