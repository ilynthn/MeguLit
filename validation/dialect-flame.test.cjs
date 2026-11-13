// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const {pathToFileURL}=require('node:url');
const web=f=>pathToFileURL(path.join(__dirname,'..','web',f)).href;

test('N0 dialects: every region is in, each point has a region tag, meaning, standard form and answerable examples',async()=>{
 const L=await import(web('grammar-levels.js'));
 const pts=L.LEVEL_POINTS.N0.filter(p=>p.dialect);
 const regions=new Set(pts.map(p=>p.group));
 for(const g of ['d_kansai','d_kago','d_shikoku','d_okinawa','d_hakata','d_nagoya','d_tohoku','d_hokkaido'])assert.ok(regions.has(g),g);
 for(const sub of ['土佐','伊予','讃岐','阿波'])assert.ok(pts.some(p=>p.region.includes(sub)),sub);
 assert.ok(pts.length>=45,'enough dialect lessons: '+pts.length);
 const ids=new Set();
 for(const p of pts){
  assert.ok(!ids.has(p.id),'unique id '+p.id);ids.add(p.id);
  assert.ok(L.LEVEL_GROUPS[p.group],'group label '+p.group);
  assert.ok(p.region&&p.std&&p.gist.zh.includes(p.region),'region tag '+p.id);
  assert.equal(p.builtin.length,3);
  for(const b of p.builtin){assert.ok(b.ja.includes(b.hl),`${p.id}: ${b.ja} has ${b.hl}`);assert.ok(p.hits.includes(b.hl));assert.ok(b.zh);}
  assert.ok(p.wrong.length>=1&&p.wrong.every(w=>!p.hits.includes(w)));
 }
 const all=L.LEVEL_POINTS.N0.flatMap(p=>p.hits);assert.equal(new Set(all).size,all.length,'no hit is claimed by two N0 points');
 const hit=L.findHit(pts.find(p=>p.hits.includes('知らへん')),'ほんまに知らへんわ');assert.equal(hit&&hit.text,'知らへん');
});

