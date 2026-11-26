'use strict';
/* #1099 personal dictionaries: Yomitan zip and TSV / CSV import, on-off, order, delete, lookup with the dictionary's name */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const U=require('../services/user-dictionaries.cjs');

function zip(files){
 const parts=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const data=Buffer.from(text,'utf8'),raw=zlib.deflateRawSync(data),n=Buffer.from(name,'utf8'),crc=zlib.crc32(data);
  const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(8,8);head.writeUInt32LE(crc,14);head.writeUInt32LE(raw.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(n.length,26);
  const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(0x800,8);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc,16);cd.writeUInt32LE(raw.length,20);cd.writeUInt32LE(data.length,24);cd.writeUInt16LE(n.length,28);cd.writeUInt32LE(offset,42);
  parts.push(head,n,raw);central.push(cd,n);offset+=30+n.length+raw.length;}
 const cdBuf=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(cdBuf.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,cdBuf,end]);
}
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-userdict-'));

test('Yomitan glossaries become plain text: strings, text items and structured content',()=>{
 assert.equal(U.glossText('吃'),'吃');
 assert.equal(U.glossText({type:'text',text:'吃饭'}),'吃饭');
 assert.equal(U.glossText({type:'structured-content',content:[{tag:'ul',content:[{tag:'li',content:'吃'},{tag:'li',content:['喝',{tag:'ruby',content:['飲',{tag:'rt',content:'の'}]}]}]},{type:'image',path:'a.png'}]}),'・吃\n・喝飲');
 const rows=U.parseTermBank([['食べる','たべる','v1','v1',10,['吃','食用'],1,''],['猫','ねこ','','',0,[],2,''],['x']]);
 assert.deepEqual(rows,[['食べる','たべる',['［v1］吃','食用']]],'rows without a meaning are dropped');
});

test('TSV / CSV tables: three or two columns, header row, quotes and comments',()=>{
 assert.deepEqual(U.parseTable('词\t读音\t释义\n食べる\tたべる\t吃\n# 注释\n猫\t\t猫咪\n','.tsv'),[['食べる','たべる',['吃']],['猫','',['猫咪']]]);
 assert.deepEqual(U.parseTable('﻿爆裂,"爆炸, 迸裂"\n夢,"梦想\\n梦"\n','.csv'),[['爆裂','',['爆炸, 迸裂']],['夢','',['梦想\n梦']]]);
});

test('import, look up with the dictionary name, toggle, reorder and delete; data stays in the user folder',async()=>{
 U._reset();const root=tmp(),src=tmp();
 const zipFile=path.join(src,'my-jz.zip');fs.writeFileSync(zipFile,zip({'index.json':JSON.stringify({title:'我的日中辞典',revision:'1',format:3}),
  'term_bank_1.json':JSON.stringify([['食べる','たべる','','v1',0,['吃（自定义）'],1,''],['猫','ねこ','n','',0,[{type:'text',text:'猫'}],2,'']]),
  'tag_bank_1.json':'[]'}));
 const tsv=path.join(src,'游戏用语.tsv');fs.writeFileSync(tsv,'食べる\tたべる\t游戏里的吃\n');
 const a=await U.importDictionary(root,zipFile);assert.equal(a.name,'我的日中辞典');assert.equal(a.count,2);assert.equal(a.format,'yomitan');
 const b=await U.importDictionary(root,tsv);assert.equal(b.name,'游戏用语');assert.equal(b.dictionaries.length,2);
 assert.ok(fs.existsSync(path.join(root,'data','user-dictionaries','index.json')));
 let hits=U.lookup(root,['食べる']);assert.deepEqual(hits.map(h=>h.dictionary.name),['我的日中辞典','游戏用语']);assert.deepEqual(hits[0].definitions,['吃（自定义）']);
 assert.deepEqual(U.lookup(root,['ネコ']).map(h=>h.term),['猫'],'kana queries also match readings (katakana folded)');
 U.move(root,b.id,-1);assert.deepEqual(U.lookup(root,'食べる').map(h=>h.dictionary.name),['游戏用语','我的日中辞典'],'order follows the priority');
 assert.deepEqual(U.list(root).map(d=>[d.name,d.priority]),[['游戏用语',1],['我的日中辞典',2]]);
 U.setEnabled(root,b.id,false);assert.deepEqual(U.lookup(root,'食べる').map(h=>h.dictionary.name),['我的日中辞典'],'a switched-off dictionary is skipped');
 assert.deepEqual(U.rows(root,'猫'),[{spelling:'猫',reading:'ねこ',pron:'ねこ',definition:'［n］猫',source:'user',dictionary:'我的日中辞典'}]);
 U.remove(root,a.id);assert.equal(fs.existsSync(path.join(root,'data','user-dictionaries',a.id+'.json')),false);assert.deepEqual(U.lookup(root,'猫'),[]);
 U.rename(root,b.id,'改名');assert.equal(U.list(root)[0].name,'改名');
 await assert.rejects(U.importDictionary(root,path.join(src,'none.zip')),/USER_DICT_FILE_MISSING/);
 const bad=path.join(src,'bad.zip');fs.writeFileSync(bad,zip({'index.json':'{}'}));await assert.rejects(U.importDictionary(root,bad),/USER_DICT_NO_TERMS/);
 const doc=path.join(src,'a.docx');fs.writeFileSync(doc,'x');await assert.rejects(U.importDictionary(root,doc),/USER_DICT_UNSUPPORTED/);
 U._reset();fs.rmSync(root,{recursive:true,force:true});fs.rmSync(src,{recursive:true,force:true});
});

function legacy(text,label){const m=new Map();for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){try{const c=new TextDecoder(label,{fatal:true}).decode(Buffer.from([a,b]));if(c.length===1&&!m.has(c))m.set(c,Buffer.from([a,b]));}catch{}}
 return Buffer.concat(Array.from(text,c=>c.charCodeAt(0)<0x80?Buffer.from(c):m.get(c)));}
test('a Shift-JIS table that also decodes as GB18030 is read as Shift-JIS; GB18030 tables stay Chinese (Codex #1280)',async()=>{
 const src=tmp(),sj=path.join(src,'sjis.tsv'),gb=path.join(src,'gb.tsv'),gbKana=path.join(src,'gb-kana.tsv');
 const sjBytes=legacy('猫\tねこ\tcat\n','shift_jis');assert.doesNotThrow(()=>new TextDecoder('gb18030',{fatal:true}).decode(sjBytes),'the bytes are valid GB18030 too');
 fs.writeFileSync(sj,sjBytes);fs.writeFileSync(gb,legacy('猫\t猫咪\n爆裂\t爆炸\n','gb18030'));fs.writeFileSync(gbKana,legacy('猫\tねこ\t猫咪\n','gb18030'));
 assert.deepEqual((await U.readFile(sj)).rows,[['猫','ねこ',['cat']]]);
 assert.deepEqual((await U.readFile(gb)).rows,[['猫','',['猫咪']],['爆裂','',['爆炸']]]);
 assert.deepEqual((await U.readFile(gbKana)).rows,[['猫','ねこ',['猫咪']]]);
 fs.rmSync(src,{recursive:true,force:true});
});

test('user dictionaries are wired into the dictionary page, the settings page and the lookup card',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const bridge=read('services/bridge.cjs'),reader=read('services/reader.cjs'),card=read('web/reader/modules/selection.js'),settings=read('web/settings.js'),page=read('web/user-dicts.js');
 for(const action of ['user_dict_list','user_dict_import','user_dict_toggle','user_dict_move','user_dict_remove'])assert.ok(bridge.includes(`case '${action}'`),action);
 assert.match(bridge,/user-dictionaries\.cjs'\)\.rows\(root/);
 assert.match(reader,/action==='userDict'/);
 assert.match(card,/const request=b\.v4Request[\s\S]{0,400}request\('userDict'/);
 assert.match(card,/catch\(e\)\{if\(current===mine&&card\)\{status\.textContent=e\.message;[\s\S]{0,200}userDict\(null,args,body,mine\)/,'a failed built-in lookup still asks the personal dictionaries (Codex #1280)');assert.match(card,/tomoyo-user-dict/);
 assert.match(settings,/section==='dictionary'[\s\S]{0,200}user-dicts\.js/);
 assert.match(page,/pick_patch_file/);
});
