// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// pack.ps1 helper: writes the "runtime-dump" entry of setup/runtime.json as one line after "archives", leaving the rest
// of the hand-kept file as it is. Usage: node pack-manifest.cjs <runtime.json> <size> <unpacked> <sha256> <url>
const fs=require('node:fs'),[file,size,unpacked,sha256,url]=process.argv.slice(2);
const entry={size:+size,unpacked:+unpacked,sha256,onDemand:true,hidden:true,dest:'runtime/runtime-dump',files:['MeguLitDump32.dll','MeguLitDump64.dll','pack.json'],license:'MeguLit (GPL-3.0-or-later), MinHook (BSD-2-Clause)',urls:[url]};
const raw=fs.readFileSync(file,'utf8'),bom=raw.charCodeAt(0)===0xfeff?'﻿':'',eol=raw.includes('\r\n')?'\r\n':'\n';
const lines=raw.slice(bom.length).split(/\r?\n/).filter(l=>!/^\s*"runtime-dump":/.test(l)),at=lines.findIndex(l=>/^\s*"archives":/.test(l));
if(at<0)throw Error('no "archives" line to put the entry after');
if(!/,\s*$/.test(lines[at]))lines[at]+=',';
lines.splice(at+1,0,'                  "runtime-dump":  '+JSON.stringify(entry));
// The last entry before the closing brace of "packs" must not end in a comma.
for(let i=at+1;i<lines.length-1;i++)if(/^\s*}/.test(lines[i+1])){lines[i]=lines[i].replace(/,\s*$/,'');break;}
const out=lines.join(eol);JSON.parse(out);fs.writeFileSync(file,bom+out);
