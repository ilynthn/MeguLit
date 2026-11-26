'use strict';
/* #1110 Weblio lookups: page parsing from offline fixtures, robots.txt, timeout / failure messages, cache and wiring */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const W=require('../services/weblio-dictionary.cjs');
const fixture=name=>fs.readFileSync(path.join(__dirname,'fixtures','weblio',name),'utf8');
const ROBOTS='User-agent: *\nDisallow: /ejje/content/\nDisallow: /cjjc/content/\n\nUser-agent: grapeshot\nDisallow:\n';
const page=(status,body,url)=>({ok:status>=200&&status<300,status,url,text:async()=>body});

test('the 国語辞典 page gives headword, reading and plain text per dictionary; encyclopedia blocks and page chrome are dropped',()=>{
 const blocks=W.parse(fixture('kokugo.html'),'kokugo');
 assert.deepEqual(blocks.map(b=>b.dictionary),['デジタル大辞泉','実用日本語表現辞典']);
 const [first]=blocks[0].entries;assert.equal(first.spelling,'食べる');assert.equal(first.reading,'たべる');
 assert.match(first.text,/^［動バ下一］/);assert.match(first.text,/\n１ 食物を口に入れて/);assert.match(first.text,/&生活する/,'entities decoded');
 assert.doesNotMatch(first.text,/googletag|読み方|<|索引トップ/);
 assert.doesNotMatch(blocks[1].entries[0].text,/索引トップ|ランキング/,'the kijiFoot links are cut');
 assert.deepEqual(W.parse('<html>no entries</html>'),[]);
});

test('the 日中中日辞典 page reads as translation（pinyin） lines',()=>{
 const blocks=W.parse(fixture('cjjc.html'),'cjjc');
 assert.deepEqual(blocks.map(b=>b.dictionary),['白水社 中国語辞典','Weblio中国語翻訳辞書','EDR日中対訳辞書']);
 assert.deepEqual(blocks[2].entries[0],{spelling:'食べる',reading:'たべる',text:'吃'},'EDR: the reading is taken, the grammar notes are cut');
 assert.equal(blocks[0].entries[0].text,'吃（chī）\n涮（shuàn）\n　（テスト用の解説）食べる');
 assert.deepEqual(W.headword('た・べる【食べる】'),{spelling:'食べる',reading:'たべる'});
});

test('robots.txt rules: the * group, longest match, Allow over Disallow on a tie, wildcards',()=>{
 assert.equal(W.robotsAllows(ROBOTS,'/content/%E9%A3%9F'),true);
 assert.equal(W.robotsAllows(ROBOTS,'/cjjc/content/%E9%A3%9F'),false);
 assert.equal(W.robotsAllows('User-agent: *\nDisallow: /\nAllow: /content/','/content/x'),true);
 assert.equal(W.robotsAllows('User-agent: *\nDisallow: /*.html$','/a/b.html'),false);
 assert.equal(W.robotsAllows('User-agent: *\nDisallow: /*.html$','/a/b.html?x'),true);
 assert.equal(W.robotsAllows('User-agent: megulit-dictionary\nDisallow: /\n\nUser-agent: *\nDisallow:','/content/x'),false,'a group naming us wins over *');
 assert.equal(W.robotsAllows('','/anything'),true);
});

test('lookups: both sites, robots checked first, cache on disk, shared in flight, errors become messages',async()=>{
 W._reset();const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-weblio-'));const urls=[];
 const fetcher=async url=>{urls.push(url);if(url.endsWith('/robots.txt'))return url.startsWith('https://www.weblio.jp')?page(200,ROBOTS):page(404,'not found');
  return url.startsWith('https://cjjc.weblio.jp/')?page(200,fixture('cjjc.html'),url):page(200,fixture('kokugo.html'),url);};
 const [a,b]=await Promise.all([W.lookupWeblio('食べる',fetcher,{root,noThrottle:true}),W.lookupWeblio('食べる',fetcher,{root,noThrottle:true})]);
 assert.deepEqual(a,b);
 assert.deepEqual([...new Set(a.map(r=>r.dictionary))],['Weblio 日中中日辞典 · 白水社 中国語辞典','Weblio 日中中日辞典 · Weblio中国語翻訳辞書','Weblio 日中中日辞典 · EDR日中対訳辞書','Weblio 国語辞典 · デジタル大辞泉','Weblio 国語辞典 · 実用日本語表現辞典']);
 assert.equal(a[0].source,'weblio');assert.equal(a[0].url,'https://cjjc.weblio.jp/content/'+encodeURIComponent('食べる'));
 assert.equal(urls.filter(u=>u.includes('/content/')).length,2,'one page per site');assert.equal(urls.filter(u=>u.endsWith('/robots.txt')).length,2);
 W._reset();const again=await W.lookupWeblio('食べる',async()=>{throw Error('no network');},{root,noThrottle:true});
 assert.equal(again.length,a.length,'the disk cache answers without the network');
 assert.ok(fs.existsSync(path.join(root,'data','config','weblio-cache.json')));
 assert.doesNotMatch(fs.readFileSync(path.join(root,'data','config','weblio-cache.json'),'utf8'),/<html|googletag/,'only parsed text is cached');
 W._reset();
 const english=[];await W.lookupWeblio('猫',async url=>{english.push(url);return url.endsWith('/robots.txt')?page(200,ROBOTS):page(404,'');},{noThrottle:true,language:'en'});
 assert.ok(english.every(u=>u.startsWith('https://www.weblio.jp/')),'English asks only the 国語辞典');
 W._reset();assert.deepEqual(await W.lookupWeblio('ほげ',async url=>url.endsWith('/robots.txt')?page(200,ROBOTS):page(404,''),{noThrottle:true}),[],'a missing word is no error');
 W._reset();await assert.rejects(W.lookupWeblio('夢',async url=>url.endsWith('/robots.txt')?page(200,ROBOTS):page(503,''),{noThrottle:true}),/WEBLIO_UNAVAILABLE/);
 W._reset();await assert.rejects(W.lookupWeblio('夢',async()=>{const e=Error('The operation was aborted due to timeout');e.name='TimeoutError';throw e;},{noThrottle:true}),/WEBLIO_TIMEOUT/);
 W._reset();const blocked=[];await assert.rejects(W.lookupWeblio('夢',async url=>{blocked.push(url);return url.endsWith('/robots.txt')?page(200,'User-agent: *\nDisallow: /content/'):page(200,fixture('kokugo.html'));},{noThrottle:true}),/WEBLIO_BLOCKED/);
 assert.ok(blocked.every(u=>u.endsWith('/robots.txt')),'a disallowed page is never requested');
 W._reset();await assert.rejects(W.lookupWeblio('夢',async url=>url.endsWith('/robots.txt')?page(200,''):page(200,'x','https://evil.example/'),{noThrottle:true,sites:['kokugo']}),/WEBLIO_UNAVAILABLE/,'a redirect off weblio.jp is refused');
 assert.equal(W.message(Error('WEBLIO_TIMEOUT')),'Weblio 响应超时，请稍后再试');
 assert.deepEqual(await W.lookupWeblio('  ',fetcher),[]);
 W._reset();fs.rmSync(root,{recursive:true,force:true});
});

test('requests to one host are spaced apart',async()=>{
 W._reset();const times=[];const fetcher=async url=>{if(!url.endsWith('/robots.txt'))times.push(Date.now());return url.endsWith('/robots.txt')?page(404,''):page(404,'');};
 await W.lookupWeblio('一',fetcher,{sites:['kokugo']});await W.lookupWeblio('二',fetcher,{sites:['kokugo']});
 assert.ok(times[1]-times[0]>=W.GAP_MS-60);W._reset();
});

test('Weblio is wired into settings, the dictionary page, the lookup card and the bridge',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const {cleanLookup,lookupOptions}=require('../core/lookup-models.cjs');
 assert.equal(cleanLookup({lookupProvider:'weblio'}).lookupProvider,'weblio');assert.deepEqual(lookupOptions({lookupProvider:'weblio'}),{provider:'weblio'});
 assert.match(read('services/settings-schema.cjs'),/option\('weblio'/);
 assert.match(read('services/bridge.cjs'),/request\.source==='weblio'/);
 assert.match(read('services/reader.cjs'),/action==='weblio'/);
 const card=read('web/reader/modules/selection.js');assert.match(card,/button\('Weblio'/);assert.match(card,/lookupProvider==='weblio'/);
 const app=read('web/app.js');assert.match(app,/value="weblio"/);assert.match(app,/source:'weblio'/);
 assert.match(read('web/detail-collect.js'),/weblio:'Weblio 辞書'/);
});
