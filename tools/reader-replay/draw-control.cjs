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
  'unsigned char raw[1024];DWORD got=0;']};
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
const controlPath=(pid,tmp)=>path.join(tmp,'MeguLit','draw',String(Number(pid)>>>0)+'.txt');
function read(pid,tmp){try{return fs.readFileSync(controlPath(pid,tmp));}catch{return null;}}
module.exports={source,yuris,cfgRoles,controlPath,read,PINS};
