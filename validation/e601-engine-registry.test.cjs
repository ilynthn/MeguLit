'use strict';
/* E601 one engine registry: the library's fingerprints and the script readers are linked in services/original-engines/registry.cjs */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const registry=require('../services/original-engines/registry.cjs'),scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
test('every reader named by the registry exists, and every reader has a registry entry',()=>{
 const used=new Set(registry.ENGINES.flatMap(e=>e.readers));
 for(const id of used)assert.ok(scenes.ENGINES[id]||['bgi','system4'].includes(id),'registry names a missing reader: '+id);
 const orphan=Object.keys(scenes.ENGINES).filter(id=>!used.has(id)&&!['adapter-pack','garbro'].includes(id));
 assert.deepEqual(orphan,[],'readers no fingerprint leads to (the library would show their games as unknown)');
});
test('the library and the registry are one table (same entries, same order)',()=>{
 const d=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e601-'));try{fs.writeFileSync(path.join(d,'re_chunk_000.pak'),'KPKA');
  assert.equal(library.engineOf(d)?.name,'RE Engine (Capcom)');assert.equal(registry.engineOf(d),library.engineOf(d));
  assert.deepEqual(registry.readersFor(d),['re-pak']);}finally{fs.rmSync(d,{recursive:true,force:true});}
 const names=registry.ENGINES.map(e=>e.name);assert.equal(new Set(names.filter(n=>n!=='Majiro')).size,names.filter(n=>n!=='Majiro').length,'duplicate engine names');
});
