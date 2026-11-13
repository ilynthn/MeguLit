'use strict';
// E373 Summer Pockets (Steam, EN/ZH only): one-word English names are translations, 「名／注記」 speaker keys show the
// name only, and *_ch.dbs locale twins take the base table instead of being read as a multi-column table.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const jr=require('../core/japanese-restore.cjs'),{encrypt,decrypt,parse,isIdent,shownJapanese}=jr._internal;

function table(rows){
 const cols=rows[0].length,head=28,fmt=head,data=fmt+cols*8,text=data+rows.length*cols*4,pool=[];let size=0;
 const b=Buffer.alloc(text);b.writeUInt32LE(rows.length,4);b.writeUInt32LE(cols,8);b.writeUInt32LE(head,12);b.writeUInt32LE(fmt,16);b.writeUInt32LE(data,20);b.writeUInt32LE(text,24);
 for(let c=0;c<cols;c++){b.writeUInt32LE(c,fmt+c*8);b.writeUInt32LE(0x53,fmt+c*8+4);}
 rows.forEach((r,ri)=>r.forEach((v,ci)=>{const s=Buffer.from(v+'\0','utf16le');b.writeUInt32LE(size,data+(ri*cols+ci)*4);pool.push(s);size+=s.length;}));
 const raw=Buffer.concat([b,...pool]);raw.writeUInt32LE(raw.length,0);return encrypt(1,raw);
}
const cells=f=>{const d=decrypt(fs.readFileSync(f));return parse(d.raw,d.marker).cells;};

test('identifier test keeps plain English names as translations',()=>{
 for(const v of ['Shiroha','Umi','Ao'])assert.equal(isIdent(v),false,v);
 for(const v of ['BGM01','bg_01','a:b','voice.ogg'])assert.equal(isIdent(v),true,v);
});
test('speaker key note after 「／」 is dropped unless the translation has a slash',()=>{
 assert.equal(shownJapanese('うみ／うみ４歳','Umi'),'うみ');
 assert.equal(shownJapanese('うみ／うみ４歳','Umi/4'),'うみ／うみ４歳');
 assert.equal(shownJapanese('しろは','Shiroha'),'しろは');
});
test('Summer Pockets shaped tables restore every language column',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-names-')),dat=path.join(root,'dat');fs.mkdirSync(dat);
 const names=['しろは','蒼','鴎','紬','うみ','静久'],en=['Shiroha','Ao','Kamome','Tsumugi','Umi','Shizuku'],zh=['白羽','苍','鸥','紬','羽未','静久'];
 fs.writeFileSync(path.join(dat,'chara_name.dbs'),table(names.map((n,i)=>[n,en[i],zh[i],''])));
 fs.writeFileSync(path.join(dat,'namae_all.dbs'),table(names.map((n,i)=>[n+'／'+n+'４歳',en[i],zh[i],''])));
 const story=[];for(let i=0;i<10;i++)story.push(['「島に着いた」'+i,'We reached the island '+i,'我们到了岛上'+i]);
 fs.writeFileSync(path.join(dat,'10_story.dbs'),table(story));
 const base=[['港','説明のもの１'],['駄菓子屋','説明のもの２']],ch=[['港口','説明のもの１'],['小卖铺','説明のもの２']];
 fs.writeFileSync(path.join(dat,'sfight_map.dbs'),table(base));fs.writeFileSync(path.join(dat,'sfight_map_ch.dbs'),table(ch));
 const plan=jr._internal.siglusPlan(root);
 assert.ok(plan.targetColumns.includes(1)&&plan.targetColumns.includes(2));
 assert.ok(!plan.targetColumns.includes(0),'no table writes Japanese over its own key column');
 const byName=Object.fromEntries(plan.changes.map(c=>[c.name,c]));
 assert.equal(byName['sfight_map_ch.dbs'].kind,'twin');
 assert.deepEqual(byName['sfight_map_ch.dbs'].next,base);
 assert.deepEqual(byName['chara_name.dbs'].next[0].slice(0,3),['しろは','しろは','しろは']);
 assert.deepEqual(byName['namae_all.dbs'].next[4].slice(0,3),['うみ／うみ４歳','うみ','うみ']);
 assert.equal(cells(path.join(dat,'chara_name.dbs'))[0][1],'Shiroha','plan alone writes nothing');
 fs.rmSync(root,{recursive:true,force:true});
});
