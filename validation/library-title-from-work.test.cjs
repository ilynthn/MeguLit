// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The library showed a game by its folder or program name and kept it: a copy in a folder named Ozmafia-ozmafia-joki stayed
   "Ozmafia-ozmafia-joki" on the shelf after VNDB had found OZMAFIA!!, whose name only went into the aliases. The title now
   follows core/library-title.cjs: the user's own name, else the work's name (the seed's, else VNDB's original-script name),
   else the scan's, else the folder or program name. Runs the real bridge, scan reconcile and enrichment against a stubbed VNDB. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-title-'));process.env.MEGULIT_ROOT=root;
/* a seed of our own (never the repository's): a work matched by its program's SHA-256, listed as "Cafe Stella" first */
const seedDir=path.join(root,'seed'),seedExe=path.join(root,'games','CafeStella-copy','game.exe');
fs.mkdirSync(path.dirname(seedExe),{recursive:true});fs.writeFileSync(seedExe,'MZ cafe stella test build');
const seedSha=crypto.createHash('sha256').update(fs.readFileSync(seedExe)).digest('hex');
fs.mkdirSync(path.join(seedDir,'yuris','cafe-stella'),{recursive:true});
fs.writeFileSync(path.join(seedDir,'yuris','cafe-stella','game.json'),JSON.stringify({schema:'megulit.game-diff',version:1,key:'b'.repeat(64),layer:'game',source:'official',mode:'hide',
 settings:{},exe:'',engine:'yuris',app:'diff-maker/5',issuedAt:'',prints:{vndb:'v26414'},seedFormat:1,status:'skeleton',slug:'cafe-stella',builds:[seedSha],
 match:{titles:['Cafe Stella','喫茶ステラと死神の蝶']},sourceLangs:['ja'],rev:1}));
process.env.MEGULIT_SEED_DIR=seedDir;
const store=require('../services/store.cjs'),{dispatch}=require('../services/bridge.cjs'),{GameEnrichment}=require('../services/game-enrichment.cjs');
const {reconcile}=require('../services/library.cjs');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));

const OZ={id:'v7833',title:'OZMAFIA!!',alttitle:null,titles:[{title:'OZMAFIA!!'}],aliases:['Ozmafia'],image:{url:'https://t.vndb.org/cv/oz.jpg'}};
const exeIn=(folder,name='OZMAFIA.exe')=>{const exe=path.join(root,'games',folder,name);fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'MZ '+folder);return exe;};
let vndbUp=true;
const network=async(url,options={})=>{
 url=String(url);const body=options.body?JSON.parse(options.body):{};
 if(!vndbUp)throw Error('offline');
 if(url==='https://api.vndb.org/kana/vn'&&body.filters?.[0]==='search')return Response.json({results:/ozmafia/i.test(String(body.filters[2]))?[OZ]:[]});
 if(url==='https://api.vndb.org/kana/vn')return Response.json({results:[OZ]});
 if(url==='https://api.vndb.org/kana/release')return Response.json({results:[]});
 if(url===OZ.image.url)return new Response(Buffer.from([0xff,0xd8,0xff,0xe0,0x6f,0x7a]));
 return new Response('',{status:404});
};
globalThis.fetch=network;
const enrich=id=>new GameEnrichment(root,()=>{},network,async()=>'').run(id,'zh',true);
const shelf=()=>{const db=store.openStore(root);try{return store.home(db,root).games;}finally{db.close();}};
const shown=id=>shelf().find(g=>g.id===id)?.title;
/* the library page's search (web/series-library.js): the title and the aliases */
const fold=s=>String(s||'').toLowerCase();
const search=term=>shelf().filter(g=>[g.title,...(g.aliases||[])].some(n=>fold(n).includes(fold(term)))).map(g=>g.id);
function insert(id,title,exe,original={}){const db=store.openStore(root);try{db.prepare('INSERT INTO games(id,title,executable,cover,source,original) VALUES(?,?,?,?,?,?)').run(id,title,exe,'','folder',JSON.stringify(original));}finally{db.close();}}

test('a game added from a folder named apart from the work shows the work name, and the folder name still finds it',async()=>{
 const exe=exeIn('Ozmafia-ozmafia-joki');
 // the folder name the add dialog used to fill in (or the one it falls back to while VNDB is unreachable)
 const {id}=await dispatch({action:'save_game',title:'Ozmafia-ozmafia-joki',executable:exe,titleAuto:true});
 assert.equal(shown(id),'Ozmafia-ozmafia-joki');
 await enrich(id);
 assert.equal(shown(id),'OZMAFIA!!');
 assert.deepEqual(search('ozmafia-joki'),[id]);
});

test('the seed\'s Japanese work name comes before VNDB and before the folder name',async()=>{
 const {id}=await dispatch({action:'save_game',title:'CafeStella-copy',executable:seedExe,titleAuto:true});
 await enrich(id);
 assert.equal(shown(id),'喫茶ステラと死神の蝶');
 assert.deepEqual(search('CafeStella-copy'),[id]);
});

test('the add dialog fills in the work name, the folder name only when neither the seed nor VNDB knows the game',async()=>{
 assert.deepEqual(await dispatch({action:'game_title_lookup',executable:exeIn('Ozmafia-dialog')}),{title:'OZMAFIA!!',source:'vndb'});
 assert.deepEqual(await dispatch({action:'game_title_lookup',executable:seedExe}),{title:'喫茶ステラと死神の蝶',source:'seed'});
 const exe=exeIn('私の同人ゲーム','Game.exe');
 assert.deepEqual(await dispatch({action:'game_title_lookup',executable:exe}),{title:'私の同人ゲーム',source:'folder'});
 vndbUp=false;
 try{assert.deepEqual(await dispatch({action:'game_title_lookup',executable:exeIn('Ozmafia-offline')}),{title:'Ozmafia-offline',source:'folder'});}finally{vndbUp=true;}
 const {id}=await dispatch({action:'save_game',title:'私の同人ゲーム',executable:exe,titleAuto:true});
 await enrich(id);
 assert.equal(shown(id),'私の同人ゲーム');
});

test('a name the user typed or edited is never replaced',async()=>{
 // typed in the add dialog
 const typed=await dispatch({action:'save_game',title:'オズマフィア（自分用）',executable:exeIn('Ozmafia-typed'),titleAuto:false});
 await enrich(typed.id);
 assert.equal(shown(typed.id),'オズマフィア（自分用）');
 // edited later: the folder name first, the user renames it, then the matches run again
 const exe=exeIn('Ozmafia-edited'),{id}=await dispatch({action:'save_game',title:'Ozmafia-edited',executable:exe,titleAuto:true});
 await dispatch({action:'save_game',id,title:'俺のOZ',executable:exe});
 await enrich(id);await enrich(id);
 assert.equal(shown(id),'俺のOZ');
});

test('a game already in the library under its folder name is renamed on the next match; other old titles stay',async()=>{
 // saved before titleSource existed: a folder name and a program name are renamed, the folder name stays searchable
 insert('old-folder','Ozmafia-old-copy',exeIn('Ozmafia-old-copy'),{library:{names:['Ozmafia-old-copy']}});
 insert('old-program','OZMAFIA.exe',exeIn('Ozmafia-old-program'),{library:{}});
 // an old title that is neither may be the user's own: it stays
 insert('old-own','オズの魔法使い（積みゲー）',exeIn('Ozmafia-old-own'),{library:{}});
 for(const id of ['old-folder','old-program','old-own'])await enrich(id);
 assert.equal(shown('old-folder'),'OZMAFIA!!');
 assert.equal(shown('old-program'),'OZMAFIA!!');
 assert.equal(shown('old-own'),'オズの魔法使い（積みゲー）');
 assert.deepEqual(search('Ozmafia-old-copy'),['old-folder']);
 // a run answered from the cache (no refresh) also renames an old row, from the remembered VNDB name
 insert('old-cached','Ozmafia-old-cached',exeIn('Ozmafia-old-cached'),{library:{}});
 await enrich('old-cached');
 const db=store.openStore(root);try{db.prepare('UPDATE games SET title=?,original=json_remove(original,\'$.titleSource\') WHERE id=?').run('Ozmafia-old-cached','old-cached');}finally{db.close();}
 await new GameEnrichment(root,()=>{},network,async()=>'').run('old-cached','zh',false);
 assert.equal(shown('old-cached'),'OZMAFIA!!');
});

test('a folder scan names a new game by its folder until the match, then by the work',async()=>{
 const exe=exeIn('Ozmafia-scanned');
 reconcile(root,[{source:'folder',title:'Ozmafia-scanned',names:['Ozmafia-scanned'],dir:path.dirname(exe),exe,key:'scan-oz'}]);
 const id=shelf().find(g=>g.executable===exe).id;
 assert.equal(shown(id),'Ozmafia-scanned');
 await enrich(id);
 assert.equal(shown(id),'OZMAFIA!!');
 assert.deepEqual(search('Ozmafia-scanned'),[id]);
});
