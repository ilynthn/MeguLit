// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 user: recommended sites get a Copy button each (rows cannot be drag-selected) and the disclaimer is shown once
   under the whole list instead of only after one site; the sites file itself is not changed */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','web','cn-version-guide.js'),'utf8');
test('every site row has Copy and Open, and the disclaimer is lifted to one line under the list',()=>{
 assert.match(src,/data-cn-copy=/);assert.match(src,/data-cn-open=/);assert.match(src,/navigator\.clipboard\.writeText/);
 assert.match(src,/class="cn-site-law"/);assert.match(src,/siteList\(v\.sites\.lines\)/);
 const m=src.match(/const DISCLAIM=(\/.*?\/i);/);assert.ok(m);const re=eval(m[1]);
 const n='资源左下角会提示是生肉/熟肉，但有时候熟肉也会被判断成生肉；MeguLit 只分享平台，不承担任何法律责任',x=n.match(re);
 assert.ok(x);assert.equal(x[1].trim(),'MeguLit 只分享平台，不承担任何法律责任');
});
test('the shipped sites file is unchanged',()=>{
 const t=fs.readFileSync(path.join(__dirname,'..','services','jp-original-sites.txt'),'utf8');
 assert.match(t,/www\.shinnku\.com（资源左下角会提示是生肉\/熟肉，但有时候熟肉也会被判断成生肉；MeguLit 只分享平台，不承担任何法律责任）/);
 assert.match(t,/^lzacg\.cc$/m);assert.match(t,/^www\.touchgal\.ink$/m);
});
