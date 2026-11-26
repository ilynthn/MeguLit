'use strict';
/* core/definitions.cjs with the per-sense tags tools/build-jmdict.cjs adds (JMdict 2026-11-26: 218,181 entries pair one Chinese
   definition with each sense; 258 of them have an archaic / obsolete / rare / dated sense before a current one, which now goes
   last). Real rows of jmdict.json (室 1320300, 焼き鳥 1605410). */
const test=require('node:test'),assert=require('node:assert/strict');
const {definitionGroups}=require('../core/definitions.cjs');
const N='noun (common) (futsuumeishi)';
const ROOM={id:1320300,spellings:['室'],definitions:['房间；室','（高官贵人的）妻室；夫人','刀鞘；鞘','室宿（二十八宿之一）'],
 senses:[{pos:[N]},{pos:[N],misc:['rare']},{pos:[N],misc:['rare']},{pos:[N],field:['astron']}]};
const YAKITORI={id:1605410,spellings:['焼き鳥'],definitions:['烤鸡串；烤鸡肉串','烤鸟；烤麻雀','（麻将）烧鸟（整个半庄一次也没和牌）'],
 senses:[{pos:[N],field:['food']},{pos:[N],misc:['obs']},{pos:[N],field:['mahj']}]};

test('rare and obsolete senses go last, each sense labelled by its JMdict tags',()=>{
 assert.deepEqual(definitionGroups(ROOM).map(g=>(g.label||'')+g.title),['房间','〔天文〕室宿（二十八宿之一）','〔罕用〕（高官贵人的）妻室','〔罕用〕刀鞘']);
 assert.deepEqual(definitionGroups(YAKITORI).map(g=>(g.label||'')+g.title),['〔饮食〕烤鸡串','〔麻将〕（麻将）烧鸟（整个半庄一次也没和牌）','〔旧用法〕烤鸟']);
 assert.equal(definitionGroups(ROOM)[1].text,'室宿（二十八宿之一）','the text is the definition alone (Anki, search)');
});

test('an older jmdict.json, English, or senses that do not pair: as before',()=>{
 const old={definitions:ROOM.definitions};
 assert.deepEqual(definitionGroups(old).map(g=>g.title),['房间','（高官贵人的）妻室','刀鞘','室宿（二十八宿之一）']);
 assert.equal(definitionGroups({...ROOM,senses:ROOM.senses.slice(1)}).map(g=>g.label).filter(Boolean).length,0);
 assert.equal(definitionGroups(ROOM,'en').some(g=>g.label),false,'labels are Chinese, the English card has none');
});
