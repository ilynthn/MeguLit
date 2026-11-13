// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E561 shared fixtures for the adapter pipeline tests: a throw-away MeguLit root, a synthetic game in a made-up archive
   format ("MGPK": u32 count, 32-byte Shift-JIS names, u32 offset/size; entries xor 0x5a over zlib), a test signing key
   that only these tests trust, and the frozen format-1 pack that reads that game. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
function sjisEncoder(){const m=new Map(),dec=new TextDecoder('shift_jis');for(let a=0x81;a<=0xfc;a++)for(let b=0x40;b<=0xfc;b++){const s=dec.decode(Buffer.from([a,b]));if(s.length===1&&s!=='�'&&!m.has(s))m.set(s,[a,b]);}
 return t=>{const out=[];for(const ch of t){const c=ch.codePointAt(0);if(c<0x80)out.push(c);else out.push(...m.get(ch));}return Buffer.from(out);};}
const sjis=sjisEncoder();
const LINES=['爆裂魔法、撃ってもいいですか？','今日はいい天気ですね','カズマさん、聞いてください','紅魔族随一の魔法の使い手','ここは駆け出しの街アクセル','ダクネスが前に出た','アクアが泣いている','冒険者ギルドに行こう'];
/* scene i holds lines i*n .. : "@bg", a name line, the text lines, a label */
function scene(i,n=6){const out=['*scene'+i,'@bg storage="bg0'+i+'"'];for(let k=0;k<n;k++){if(k%3===0)out.push('【めぐみん】');out.push(LINES[(i*n+k)%LINES.length]+'[p]');}out.push(';end');return sjis(out.join('\r\n')+'\r\n');}
function mgpk(files){const names=Object.keys(files),head=Buffer.alloc(8+names.length*40);head.write('MGPK',0,'latin1');head.writeUInt32LE(names.length,4);
 let offset=head.length;const bodies=[];names.forEach((n,i)=>{const z=zlib.deflateSync(files[n]);const enc=Buffer.from(z.map(b=>b^0x5a));const at=8+i*40;sjis(n).copy(head,at);head.writeUInt32LE(offset,at+32);head.writeUInt32LE(enc.length,at+36);bodies.push(enc);offset+=enc.length;});
 return Buffer.concat([head,...bodies]);}
function root(prefix='megulit-adapter-'){const base=process.env.MEGULIT_TEST_TMP||os.tmpdir();const r=fs.mkdtempSync(path.join(base,prefix));fs.mkdirSync(path.join(r,'data','config'),{recursive:true});return r;}
/* a game folder with Game.exe and data/script.mgp of `scenes` scenes */
function game(r,name='MGPK Game',scenes=4){const dir=path.join(r,'games',name);fs.mkdirSync(path.join(dir,'data'),{recursive:true});
 const exe=path.join(dir,'Game.exe');const body=Buffer.alloc(4096);for(let i=0;i<body.length;i++)body[i]=(i*7+name.length)&255;fs.writeFileSync(exe,body);
 const files={};for(let i=0;i<scenes;i++)files['scene'+i+'.scn']=scene(i);files['system.dat']=Buffer.from('not a scene');fs.writeFileSync(path.join(dir,'data','script.mgp'),mgpk(files));
 return {dir,exe,lines:scenes*6};}
function key(){const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');return {privateKey,entry:{id:'test',alg:'ed25519',publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64')}};}
const fixturePack=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'adapter-packs','format1-table-xor-zlib.json'),'utf8'));
/* a fake db with the games table the pipeline reads */
const db=games=>({prepare:()=>({all:()=>games.map(g=>({id:g.id,title:g.title,executable:g.executable}))})});
module.exports={sjis,LINES,scene,mgpk,root,game,key,fixturePack,db};
