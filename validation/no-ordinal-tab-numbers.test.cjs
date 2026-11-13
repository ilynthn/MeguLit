// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* user: decorative 01/02/03 prefixes before tabs or list items must never come back */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const web=path.join(__dirname,'..','web');
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):/\.(css|js|html)$/.test(e.name)?[path.join(d,e.name)]:[]);
/* real step counters that carry meaning */
const KEEP=/guide-success li::before|counter\((gs|sense|step)\b/;
test('no decorative ordinal numbers in web/',()=>{
 const bad=[];
 for(const f of files(web)){const src=fs.readFileSync(f,'utf8');
  src.split('\n').forEach((l,i)=>{
   if(/content:\s*counter\([^)]*decimal-leading-zero/.test(l)&&!KEEP.test(l))bad.push(`${f}:${i+1}`);
   if(/\.detail-tabs[^{]*::before\{[^}]*counter\(/.test(l))bad.push(`${f}:${i+1}`);
   if(/>0[1-9]<\/(span|small|i|em|b)>\s*\$?\{?[^<]{0,20}(作品资料|阅读记录|关联单词|收录句子)/.test(l))bad.push(`${f}:${i+1}`);
  });}
 assert.deepStrictEqual(bad,[]);
});
