'use strict';
// A Steam client in Chinese (or another non-English language) caches library art with a language suffix, often with
// no unsuffixed copy: appcache/librarycache/<appid>/<hash>/library_capsule_schinese.jpg. Those games got no local cover.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {steamGames}=require('../core/library.cjs');

function steam(art){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-steam-'));
 const put=file=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'x');};
 put('steamapps/common/Some Game/game.exe');
 fs.writeFileSync(path.join(root,'steamapps','appmanifest_3867170.acf'),'"AppState"\n{\n\t"appid"\t\t"3867170"\n\t"name"\t\t"Some Game"\n\t"installdir"\t\t"Some Game"\n}\n');
 for(const file of art)put(path.join('appcache','librarycache','3867170',file));
 return root;
}
const coverOf=root=>{try{return path.relative(path.join(root,'appcache','librarycache','3867170'),steamGames(root)[0].cover).replace(/\\/g,'/');}finally{fs.rmSync(root,{recursive:true,force:true});}};

test('art cached only under a language suffix is used as the cover',()=>{
 assert.equal(coverOf(steam(['9bb7e8cf.jpg','c2d9fc31/library_capsule_schinese.jpg','22093cf0/library_header_schinese.jpg','e0b344a5/library_hero.jpg'])),'c2d9fc31/library_capsule_schinese.jpg');
 assert.equal(coverOf(steam(['a1/header_schinese.jpg'])),'a1/header_schinese.jpg');
 assert.equal(coverOf(steam(['a1/library_capsule_koreana.jpg'])),'a1/library_capsule_koreana.jpg');
});

test('portrait art wins over a landscape header in the top folder',()=>{
 assert.equal(coverOf(steam(['header.jpg','a1/library_capsule.jpg'])),'a1/library_capsule.jpg');
});

test('the art picked before is still picked',()=>{
 assert.equal(coverOf(steam(['header.jpg','library_600x900.jpg','library_600x900_schinese.jpg'])),'library_600x900_schinese.jpg');
 assert.equal(coverOf(steam(['header.jpg'])),'header.jpg');
});
