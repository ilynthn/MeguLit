// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Is a game really installed in this folder, for the tests that read a real game when this PC has it? The folder alone is not
   enough: uninstalling a Steam game leaves its folder with a log, steam_api_o.dll or the saves (9-nine- Episode 4, ATRI, DDLC Plus,
   THE SHELL on 2026-11-25), and a moved game leaves an empty folder; those tests then failed instead of skipping. A game is
   installed when a program (.exe) is in the folder or up to two levels below it. */
const fs=require('node:fs'),path=require('node:path');
function installed(dir,depth=2){let ents;try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return false;}
 if(ents.some(e=>e.isFile()&&/\.exe$/i.test(e.name)))return true;
 return depth>0&&ents.some(e=>e.isDirectory()&&installed(path.join(dir,e.name),depth-1));}
module.exports={installed};
