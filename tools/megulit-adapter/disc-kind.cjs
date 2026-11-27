// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (制服カノジョ3, ENTERGRAM package edition 「めいか初恋BOX」: SEIFUKU3.mdf/.mds plus three bonus CDs) what kind of disc a
   package game is, for the adapter's install step (a person did each of these by hand for this game):

   mdfIso(file)        an .mdf is Alcohol 120%'s raw image; when its sectors are 2048 bytes with the ISO 9660 descriptor at 0x8001
                       it is a plain ISO, and Windows mounts it once it is reached under an .iso name (a hard link beside it costs
                       nothing). A 2352-byte raw .mdf (CD001 at 0x9310) is not mountable this way and stays reported.
   innoDisc(root)      a disc whose root is an Inno Setup installer with its data split into <name>-1.bin, <name>-2.bin … (here
                       Launcher.exe + Launcher-1..3.bin, no game files on the disc): the game exists only after the installer has
                       run, so copying the disc root installs nothing. -> {exe, parts} or null
   innoArgs(target)    the installer run with no person: /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOICONS, /CURRENTUSER (an Inno 6
                       setup that allows the per-user mode then needs no elevation: it wrote HKCU only), the desktop icon task off,
                       /DIR=<target>, /LOG=<log>
   linkInPath(target)  Inno refuses a /DIR under a junction or symlink (「エラー 448: The path cannot be traversed because it contains
                       an untrusted mount point」, then rolls back): the first linked folder on the way to the target, or '' */
const fs=require('node:fs'),path=require('node:path');

function mdfIso(file,{open=fs.openSync,read=fs.readSync,close=fs.closeSync}={}){
 if(!/\.mdf$/i.test(String(file||'')))return false;let fd;try{fd=open(file,'r');const b=Buffer.alloc(5);
  return read(fd,b,0,5,0x8001)===5&&b.toString('latin1')==='CD001';}catch{return false;}finally{if(fd!==undefined)try{close(fd);}catch{}}}

const INNO=/Inno Setup Setup Data \(\d/;
function innoDisc(root,{list=d=>fs.readdirSync(d),readHead=f=>{const fd=fs.openSync(f,'r');try{const b=Buffer.alloc(4<<20);const n=fs.readSync(fd,b,0,b.length,0);return b.subarray(0,n);}finally{fs.closeSync(fd);}}}={}){
 let names=[];try{names=list(root);}catch{return null;}
 for(const exe of names.filter(n=>/\.exe$/i.test(n))){const stem=exe.replace(/\.exe$/i,'');
  const parts=names.filter(n=>new RegExp('^'+stem.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'-\\d+\\.bin$','i').test(n)).sort((a,b)=>parseInt(a.slice(stem.length+1),10)-parseInt(b.slice(stem.length+1),10));
  if(!parts.length)continue;let head;try{head=readHead(path.join(root,exe));}catch{continue;}
  if(INNO.test(Buffer.from(head).toString('latin1')))return {exe:path.join(root,exe),parts:parts.map(p=>path.join(root,p))};}
 return null;}

function innoArgs(target,log=''){return ['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/CURRENTUSER','/MERGETASKS="!desktopicon"','/DIR="'+target+'"'].concat(log?['/LOG="'+log+'"']:[]);}

function linkInPath(target,{lstat=fs.lstatSync}={}){let p=path.resolve(String(target||''));const chain=[];
 while(true){chain.unshift(p);const up=path.dirname(p);if(up===p)break;p=up;}
 for(const d of chain){let st;try{st=lstat(d);}catch{return '';}if(st.isSymbolicLink())return d;}
 return '';}

module.exports={mdfIso,innoDisc,innoArgs,linkInPath};
