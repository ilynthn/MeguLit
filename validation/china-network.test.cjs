'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('E461 the update check falls back to the relay when api.github.com is unreachable',async()=>{
 const {latest}=require('../services/update.cjs'),asked=[];
 const rel={tag_name:'v9.9.9',body:'',html_url:'x',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:10,browser_download_url:'https://github.com/a',digest:'sha256:'+'a'.repeat(64)}]};
 const fetcher=async url=>{asked.push(url);if(url.startsWith('https://api.github.com'))throw new TypeError('fetch failed');return {ok:true,status:200,json:async()=>rel};};
 const r=await latest(fetcher);assert.equal(r.version,'9.9.9');assert.ok(asked.some(u=>u.startsWith('https://api.megulit.com/api/release/latest')));
});
test('E461 the relay serves the release JSON and the daily page does not wait for every thumbnail',()=>{
 const w=fs.readFileSync(path.join(__dirname,'..','relay','src','worker.js'),'utf8');assert.ok(w.includes('async function releaseGet(which,env)')&&w.includes('release_cache'));assert.match(w,/release:\[120,60\]/);
 const d=fs.readFileSync(path.join(__dirname,'..','services','daily.cjs'),'utf8');assert.match(d,/const THUMB_BUDGET=2500;/);assert.match(d,/Promise\.race\(\[Promise\.all\(jobs\)/);
});
