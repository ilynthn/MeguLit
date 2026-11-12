'use strict';
/* Frame budget: ancestor :has() rules (.main/.workspace/body/.app-frame or a bare :has) restyle the whole page whenever
   anything below changes (library wall covers). They are replaced by attributes written by web/main-kids.js. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const web=path.join(__dirname,'..','web');
test('no ancestor-scoped :has() in web css',()=>{
  const bad=[];
  for(const f of fs.readdirSync(web).filter(f=>f.endsWith('.css'))){
    const s=fs.readFileSync(path.join(web,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    const re=/(\.main|\.workspace|body|\.app-frame)(\[[^\]]*\]|\.[\w-]+)*:(not\()?has\(|(^|[\s>~+])(:not\()?:has\(/gm;let m;
    while((m=re.exec(s)))bad.push(f+': '+s.slice(Math.max(0,m.index-40),m.index+60).replace(/\s+/g,' '));
  }
  assert.deepStrictEqual(bad,[]);
});
test('main-kids is loaded before app.js and lists direct children',async()=>{
  const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
  assert.ok(html.indexOf('main-kids.js')>0&&html.indexOf('main-kids.js')<html.indexOf('src="app.js"'));
  const {kidsOf}=await import('file:///'+path.join(web,'main-kids.js').replace(/\\/g,'/'));
  const main={children:[{id:'learning-content',classList:['a']},{id:'',classList:['tabs','b']}]};
  assert.strictEqual(kidsOf(main),'#learning-content a tabs b');
});
