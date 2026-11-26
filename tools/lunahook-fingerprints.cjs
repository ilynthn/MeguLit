#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter: LunaHook's static engine checks as data (THIRD-PARTY.md: LunaHook engine detection rules, GPL-3.0).
   LunaHook (LunaTranslator src/NativeImpl/LunaHook/LunaHook/engine32|engine64/*.h) declares per engine class which files it looks for
   (check_by = CHECK_BY::FILE / FILE_ANY / FILE_ALL with L"..." targets). Only those three declarative kinds are taken: CUSTOM, resource
   strings and version info need LunaHook's own code. Writes services/original-engines/lunahook-fingerprints.json.
   Usage: node tools/lunahook-fingerprints.cjs <LunaHook source folder containing engine32 and engine64> [--commit <sha>] */
const fs=require('node:fs'),path=require('node:path');
const KINDS=new Set(['FILE','FILE_ANY','FILE_ALL']);
const unescape=s=>s.replace(/\\(.)/g,'$1');
function extract(dir){const out=[];const STR=/L"((?:[^"\\]|\\.)*)"/g;
 for(const arch of ['engine32','engine64']){let files=[];try{files=fs.readdirSync(path.join(dir,arch)).filter(f=>f.endsWith('.h')).sort();}catch{continue;}
  for(const f of files){const t=fs.readFileSync(path.join(dir,arch,f),'utf8');const re=/class\s+(\w+)\s*:\s*public\s+ENGINE\s*\{([\s\S]*?)\n\s*\}\s*;?/g;let m;
   while((m=re.exec(t))){const body=m[2],check=(body.match(/check_by\s*=\s*CHECK_BY::(\w+)/)||[])[1]||'';if(!KINDS.has(check))continue;
    const targets=[...body.matchAll(STR)].map(x=>unescape(x[1])).filter(Boolean).slice(0,8);if(targets.length)out.push({cls:m[1],arch:arch==='engine32'?32:64,check,targets});}}}
 return out;}
if(require.main===module){const dir=process.argv[2];if(!dir){console.error('usage: node tools/lunahook-fingerprints.cjs <LunaHook folder with engine32/engine64> [--commit <sha>]');process.exit(2);}
 const i=process.argv.indexOf('--commit'),commit=i>0?process.argv[i+1]:'';const rules=extract(dir);
 const file=path.join(__dirname,'..','services','original-engines','lunahook-fingerprints.json');
 fs.writeFileSync(file,JSON.stringify({source:'LunaHook (LunaTranslator) engine check_by, GPL-3.0',commit,rules})+'\n');console.log(rules.length+' rules -> '+file);}
module.exports={extract};
