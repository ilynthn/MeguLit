// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E561 adapter packs: signatures, schema, capability / version gates (graceful skip), the frozen format-1 fixture, the
   declarative reader end to end (pack → scenes.cjs → original-text index rebuilt), fail-safety, rollback and params. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const fx=require('./helpers/adapter-fixtures.cjs');
const R=fx.root();process.env.MEGULIT_ROOT=R;process.env.MEGULIT_ADAPTER_PACKS_DIR=path.join(R,'data','adapter-packs');
const packs=require('../services/adapter-packs.cjs');
const K=fx.key();packs._trust([K.entry]);
const signed=(p)=>packs.sign(p,K.privateKey,'test');
const APP='1.4.9';

test('signature: a signed pack is admitted; altered, unsigned or foreign-key packs are not',()=>{
 const p=signed(fx.fixturePack());assert.equal(packs.admit(p,{app:APP}).ok,true);
 assert.equal(packs.admit(JSON.stringify(p),{app:APP}).ok,true,'as text too');
 const altered=JSON.parse(JSON.stringify(p));altered.transforms[0].key='5b';assert.equal(packs.admit(altered,{app:APP}).reason,'BAD_SIGNATURE');
 const {signature,...bare}=p;assert.equal(packs.admit(bare,{app:APP}).reason,'UNSIGNED');
 const other=fx.key();assert.equal(packs.admit(packs.sign(fx.fixturePack(),other.privateKey,'other'),{app:APP}).reason,'UNKNOWN_KEY');
 assert.equal(packs.admit(packs.sign(fx.fixturePack(),other.privateKey,'test'),{app:APP}).reason,'BAD_SIGNATURE','right key id, wrong key');
 assert.equal(packs.admit('{not json',{app:APP}).reason,'JSON');
 assert.equal(packs.digest(p),packs.digest({...p,signature:{alg:'x'}}),'digest ignores the signature');
});
test('schema: strict format-1 validation',()=>{
 const base=fx.fixturePack();assert.equal(packs.validate(base).ok,true);
 const bad=(patch,error)=>assert.equal(packs.validate({...base,...patch}).error,error,JSON.stringify(patch));
 bad({schema:'x'},'SCHEMA');bad({id:'A B'},'ID');bad({version:0},'VERSION');bad({minApp:'1.4'},'MIN_APP');bad({surprise:1},'UNKNOWN_FIELD');bad({requires:['grammar:lines']},'REQUIRES_INCOMPLETE');
 bad({match:{}},'MATCH');bad({match:{files:[{path:'../outside.dat'}]}},'MATCH');bad({match:{files:[{path:'C:/x.dat'}]}},'MATCH');
 bad({transforms:[{op:'eval',code:'1'}]},'TRANSFORMS');bad({source:{...base.source,container:'shell'}},'SOURCE');
 assert.equal(packs.validate({...base,'x-maintainer-note':'ok'}).ok,true,'x- fields are free');
 bad({params:[{target:'cx-scheme',value:'x'}]},'PARAMS');
});
test('regex safety: patterns that can backtrack exponentially are refused',()=>{
 for(const bad of ['(a+)+','(a|aa)*','(.*)*x','(?<=a)b','(a)\\1','(x+x+)+y','([a-z]+)*$'])assert.equal(packs.safeRegex(bad),null,bad);
 for(const ok of ['^【([^】]+)】$','\\[[^\\]]*\\]','^[@;*]','^(?:「)?(.+?)(?:」)?$','(ab)?c'])assert.ok(packs.safeRegex(ok),ok);
 const g=fx.fixturePack();g.grammar={...g.grammar,skip:'(a+)+$'};assert.equal(packs.validate(g).error,'GRAMMAR');
});
test('compatibility: newer formats, unknown capabilities and app ranges are skipped, never thrown',()=>{
 const p=fx.fixturePack();
 assert.equal(packs.compatible({...p,format:2},{app:APP}).reason,'FORMAT_NEWER');
 assert.equal(packs.compatible({...p,requires:[...p.requires,'container:future-thing']},{app:APP}).reason,'CAPABILITY');
 assert.equal(packs.compatible({...p,minApp:'99.0.0'},{app:APP}).reason,'APP_TOO_OLD');
 assert.equal(packs.compatible({...p,maxApp:'1.0.0'},{app:APP}).reason,'APP_TOO_NEW');
 assert.equal(packs.compatible({...p,minApp:'1.4.9'},{app:'1.4.9-beta.16'}).reason,'APP_TOO_OLD','a beta is older than its release');
 assert.equal(packs.compatible({...p,minApp:'1.4.9-beta.10'},{app:'1.4.9-beta.16'}).ok,true);
 for(const [a,b,want] of [['1.4.9','1.4.10',-1],['1.5.0','1.4.99',1],['1.4.9-beta.2','1.4.9-beta.10',-1],['1.4.9','1.4.9',0],['2.0.0-rc.1','2.0.0',-1]])assert.equal(packs.semverCompare(a,b),want,a+' vs '+b);
 assert.equal(packs.admit(signed({...p,format:2}),{app:APP}).reason,'FORMAT_NEWER','an app that predates format 2 skips it');
 assert.equal(packs.admit(signed({...p,requires:[...p.requires,'grammar:wasm']}),{app:APP}).reason,'CAPABILITY');
 assert.deepEqual(packs.migrate(p),p,'format 1 needs no migration');
 assert.ok(packs.CAPABILITIES.every(c=>/^[a-z]+:[a-z0-9-]+$/.test(c)));
 /* every capability a format-1 pack can need is one this app has: a pack made with today's tool always loads here */
 assert.ok(packs.needs(p).every(n=>packs.CAPABILITIES.includes(n)));
});
test('frozen format-1 fixture reads its game: scenes → lines, names dropped, tags stripped',()=>{
 const g=fx.game(R,'Fixture Game'),p=packs.validate(fx.fixturePack()).pack;
 assert.ok(packs.match(p,g.dir)>0);assert.equal(packs.match(p,path.join(R,'games')),0);
 const scenes=packs.scenesOf(p,g.dir);assert.equal(scenes.length,4,'entries filter keeps *.scn only');
 const parsed=scenes.map(s=>packs.parse(p,s.read()));assert.equal(parsed.reduce((n,x)=>n+x.lines.length,0),g.lines);
 assert.ok(parsed[0].lines.every(l=>!/\[|【/.test(l)));assert.ok(parsed[0].anchors.some(a=>a.startsWith('@bg')));
});
test('install → the adapter-pack engine reads the game first; original-text rebuilds its index from it',()=>{
 const g=fx.game(R,'Engine Game');const r=packs.install(R,JSON.stringify(signed(fx.fixturePack())),{app:APP});assert.equal(r.ok,true,JSON.stringify(r));
 const scenes=require('../services/original-engines/scenes.cjs');assert.equal(scenes.detect(g.dir),'adapter-pack');
 const read=scenes.read('adapter-pack',g.dir);assert.equal(read.reduce((n,s)=>n+s.lines.length,0),g.lines);
 const ot=require('../services/original-text.cjs');const st=ot.scanRunning(R,'game-engine',g.exe);
 assert.equal(st.runtime.engine,'adapter-pack');assert.equal(st.runtime.lines,g.lines);assert.equal(st.status,'native-japanese');
 assert.ok(fs.existsSync(st.runtime.index));const index=JSON.parse(fs.readFileSync(st.runtime.index,'utf8'));assert.equal(index.lines.length,g.lines);
 /* a new pack version changes the fingerprint: the index is read again */
 const before=scenes.fingerprint('adapter-pack',g.dir);packs.install(R,JSON.stringify(signed({...fx.fixturePack(),version:2})),{app:APP});
 assert.notEqual(scenes.fingerprint('adapter-pack',g.dir),before);
});
test('rollback: blocked versions stay out, the older version comes back; per-folder off switch',()=>{
 const id='fixture-mgpk',s=packs.readState(R);assert.equal(s.active[id],2);
 const r=packs.rollback(R,id,{reason:'test'});assert.deepEqual([r.from,r.to],[2,1]);assert.equal(packs.readState(R).active[id],1);
 assert.equal(packs.install(R,JSON.stringify(signed({...fx.fixturePack(),version:2})),{app:APP}).reason,'BLOCKED');
 const g=fx.game(R,'Off Game');assert.ok(packs.forDir(g.dir,R));packs.disableFor(R,g.dir,id+'@1');assert.equal(packs.forDir(g.dir,R),null);packs.enableFor(R,g.dir,id+'@1');assert.ok(packs.forDir(g.dir,R));
});
test('fail-safe: a broken pack file, a corrupt state, a pack that throws — no reader crashes',()=>{
 const scenes=require('../services/original-engines/scenes.cjs'),g=fx.game(R,'Broken Game');
 /* the active pack file altered on disk: admitted again on load, so it drops out */
 const s=packs.readState(R),file=path.join(process.env.MEGULIT_ADAPTER_PACKS_DIR,'packs','fixture-mgpk',s.active['fixture-mgpk']+'.json');const keep=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,keep.replace('"5a"','"5b"'));fs.utimesSync(path.join(process.env.MEGULIT_ADAPTER_PACKS_DIR,'state.json'),new Date(),new Date(Date.now()+5000));
 assert.equal(packs.forDir(g.dir,R),null);assert.notEqual(scenes.detect(g.dir),'adapter-pack');fs.writeFileSync(file,keep);
 /* corrupt state.json: defaults, no throw */
 const st=path.join(process.env.MEGULIT_ADAPTER_PACKS_DIR,'state.json'),saved=fs.readFileSync(st);fs.writeFileSync(st,'{{{');assert.deepEqual(packs.readState(R).active,{});assert.doesNotThrow(()=>scenes.detect(g.dir));fs.writeFileSync(st,saved);
 /* a pack whose transform fails on this game: engine returns nothing, errors are counted, three take it out */
 const base=fx.fixturePack(),wrong=signed({...base,id:'throws-pack',version:1,match:{...base.match,exe:{name:'Game.exe'}},transforms:[{op:'zlib'}],requires:[...base.requires.filter(x=>x!=='transform:xor'),'match:exe']});
 const other=fx.game(R,'Throw Game');assert.equal(packs.install(R,JSON.stringify(wrong),{app:APP}).ok,true);assert.equal(packs.forDir(other.dir,R).id,'throws-pack','the more specific pack wins');
 for(let i=0;i<4;i++)assert.doesNotThrow(()=>{scenes.readable('adapter-pack',other.dir);scenes.read('adapter-pack',other.dir);});
 assert.ok(packs.readState(R).errors['throws-pack@1']>=3);assert.equal(packs.readState(R).active['throws-pack'],undefined,'taken out after repeated errors');
 /* a huge declared table is capped, a bad offset dropped */
 const t=fx.fixturePack();assert.doesNotThrow(()=>packs.tableList(path.join(g.dir,'data','script.mgp'),{...t.source.table,count:{at:0,type:'u32le'}}));
});
test('params: an adapter pack adds a cx scheme and a paz scheme in front of the built-in lists',()=>{
 const scheme={titles:['Pack Test'],type:'CxEncryption',mask:123,offset:456,prolog:[0,1,2],odd:[0,1,2,3,4,5],even:[0,1,2,3,4,5,6,7]};
 const p=signed({schema:'megulit.adapter-pack',format:1,id:'cx-params',version:1,minApp:'1.0.0',requires:['match:files','params:cx-scheme','params:paz-scheme'],match:{files:[{path:'data.xp3'}]},params:[{target:'cx-scheme',value:scheme},{target:'paz-scheme',value:{title:'pack-paz',version:1,arc:{scr:['00','11']}}}]});
 assert.equal(packs.install(R,JSON.stringify(p),{app:APP}).ok,true);
 assert.equal(packs.params('cx-scheme',R)[0].value.mask,123);assert.strictEqual(packs.params('cx-scheme',R),packs.params('cx-scheme',R),'same array while nothing changed');
 const cx=require('../services/original-engines/cx-filter.cjs');const list=cx._schemes?cx._schemes():null;if(list)assert.equal(list[0].mask,123);
});
test('docs stay in step: the reference schema lists exactly the capabilities this app has',()=>{
 const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'..','docs','adapter-pack.schema.json'),'utf8'));
 assert.deepEqual([...schema.properties.requires.items.enum].sort(),[...packs.CAPABILITIES].sort(),'update docs/adapter-pack.schema.json with the capability');
 assert.deepEqual(packs.FORMATS.includes(packs.FORMAT),true);
 for(const k of ['packBytes','files','fileBytes','totalBytes','inflated','lineChars','regex'])assert.ok(packs.LIMITS[k]>0);
});
test('keys file: public keys only, no private key material in the repository',()=>{
 const raw=fs.readFileSync(path.join(__dirname,'..','services','adapter-pack-keys.json'),'utf8');assert.ok(!/PRIVATE KEY/.test(raw));
 const k=JSON.parse(raw).keys;assert.ok(k.length>=1);for(const e of k){assert.equal(e.alg,'ed25519');const pub=require('node:crypto').createPublicKey({key:Buffer.from(e.publicKey,'base64'),format:'der',type:'spki'});assert.equal(pub.asymmetricKeyType,'ed25519');}
});
