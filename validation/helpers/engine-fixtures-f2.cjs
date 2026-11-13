'use strict';
/* E620 synthetic game folders for the F2 plain-text family (services/original-engines/plaintext.cjs), written as the
   profiles' sources describe the formats: a Japanese game and a Chinese (GBK) patch per engine, same structure. */
const {sjis,gbk,zip,writeTree}=require('./engine-fixtures.cjs');
const utf8=s=>Buffer.from(s,'utf8');
const u64=v=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;};
/* Suika 2 data01.arc: u64 count, {name[256], u64 size, u64 offset from the file start}, bodies */
function suikaArc(files){const names=Object.keys(files),head=8+names.length*272;let off=head;const idx=[],bodies=[];
 for(const n of names){const e=Buffer.alloc(272);e.write(n,0,'latin1');const b=Buffer.from(files[n]);e.writeBigUInt64LE(BigInt(b.length),256);e.writeBigUInt64LE(BigInt(off),264);idx.push(e);bodies.push(b);off+=b.length;}
 return Buffer.concat([u64(names.length),...idx,...bodies]);}
/* the same archive obfuscated as Suika 2 2.x / OpenNovel write it (names and bodies XORed per entry index, build key) */
function suikaArcObf(files,key='cafef00dabadbeef'){const pt=require('../../services/original-engines/plaintext.cjs'),b=suikaArc(files),n=Object.keys(files).length,out=Buffer.from(b);
 for(let i=0;i<n;i++){const at=8+i*272,seed=pt.suikaSeed(key,i);pt.suikaXor(b.subarray(at,at+256),key,seed).copy(out,at);const size=Number(b.readBigUInt64LE(at+256)),off=Number(b.readBigUInt64LE(at+264));pt.suikaXor(b.subarray(off,off+size),key,seed).copy(out,off);}
 return out;}

/* the story in each engine's grammar: L = [speaker, line 1 (with a break), line 2, choice a, choice b, line 3] */
const JA=['ひなた','「おはよう」\n朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ありがとう。'];
const ZH=['向日葵','“早上好”\n晨光照了进来。','那是个安静的午后。','去教室','去屋顶','谢谢。'];
const scripts={
 suika2:L=>`# opening\n@bg bg001.png 1.0\n:start\n*${L[0]}*${L[1].replace('\n','\\n')}\n${L[2]}\n@choose a ${L[3]} b ${L[4]}\n:a\n*${L[0]}*v001.ogg*${L[5]}\n`,
 nvlist:L=>`#opening\n##\n内部メモ\n##\n@bgf("bg001")\n@@\nlocal x = 1\n@@\n${L[0]}\n${L[1].replace('\n','[wait(10)]\n')}\n${L[2]}\n@choice("${L[3]}", "${L[4]}")\n${L[5]}\n`,
 vnds:L=>`# opening\nbgload bg001.jpg\nlabel start\ntext ${L[0]}\ntext ${L[1].split('\n')[0]}\ntext @${L[1].split('\n')[1]}\ntext ~\ntext ${L[2]}\nchoice ${L[3]}|${L[4]}\nif selected == 1\ntext ${L[5]}\nfi\n`,
 pymo:L=>`;opening\n#bg bg001\n#say ${L[0]},${L[1].replace('\n','\\n')}\n#say ${L[2]}\n#sel 2\n${L[3]}\n${L[4]}\n#if FSEL==0,goto a\n#label a\n#say ${L[0]},${L[5]}\n`,
 pywright:L=>`# opening\nbg court\nchar ${L[0]==='ひなた'?'hinata':'hinata'}\nnt ${L[0]}\n"${L[1].replace('\n','{n}')}"\n"{c900}${L[2]}"\nlist choose\nli ${L[3]}\nli ${L[4]}\nshowlist\n"${L[5]}"\n`,
 airnovel:L=>`;opening\n[bg storage="bg001"]\n*start\n[ch name="${L[0]}"]\n${L[0]}\n${L[1].replace('\n','[r]\n')}[p]\n${L[2]}[p]\n[link target="*a"]${L[3]}[endlink]\n[link target="*b"]${L[4]}[endlink]\n[s]\n*a\n${L[5]}[p]\n`,
 instead:L=>`-- $Name: 物語$\n-- $Version: 1.0$\nroom {\n nam = "${L[0]}";\n dsc = "${L[1].replace('\n','^')}";\n act = function() p "${L[2]}" end;\n obj = { 'apple' };\n}\nxact("a", "${L[3]}") xact("b", "${L[4]}")\np "${L[5]}"\n`};

/* the game folder per engine, and the same scripts as a patch folder */
const games={
 suika2:(enc,s)=>({'suika.exe':'MZ','data01.arc':suikaArc({'txt/init.txt':enc(s),'bg/bg001.png':Buffer.from('PNG'),'conf/config.txt':Buffer.from('window.title=x\n')})}),
 'suika2-obf':(enc,s)=>({'polaris.exe':'MZ','data01.arc':suikaArcObf({'txt/init.txt':enc(s),'bg/bg001.png':Buffer.from('PNG')})}),
 airnovel:(enc,s)=>({'config.anprj':'<?xml version="1.0"?><project first_script="start.an"/>','mat/start.an':enc(s)}),
 'suika2-loose':(enc,s)=>({'suika.exe':'MZ','txt/init.txt':enc(s),'conf/config.txt':'window.title=x\n'}),
 nvlist:(enc,s)=>({'nvlist.exe':'MZ','res/script/main.lvn':enc(s),'res/img/bg001.png':'PNG'}),
 vnds:(enc,s)=>({'script.zip':zip({'script/main.scr':enc(s)}),'foreground.zip':zip({'a.png':Buffer.from('PNG')}),'background.zip':zip({'b.jpg':Buffer.from('JPG')}),'info.txt':'title=x\n'}),
 pymo:(enc,s)=>({'gameconfig.txt':'#gametitle,x\n','script/start.txt':enc(s),'bg/bg001.png':'PNG'}),
 pywright:(enc,s)=>({'PyWright.exe':'MZ','core/core.py':'#','art/bg/court.png':'PNG','games/case1/intro.txt':enc(s)}),
 instead:(enc,s)=>({'main3.lua':enc(s),'gfx/a.png':'PNG'})};
const patches={suika2:(s)=>({'txt/init.txt':gbk(s)}),'suika2-loose':(s)=>({'txt/init.txt':gbk(s)}),'suika2-obf':(s)=>({'txt/init.txt':gbk(s)}),airnovel:(s)=>({'mat/start.an':gbk(s)}),nvlist:(s)=>({'res/script/main.lvn':gbk(s)}),
 vnds:(s)=>({'script/main.scr':gbk(s)}),pymo:(s)=>({'script/start.txt':gbk(s)}),pywright:(s)=>({'games/case1/intro.txt':gbk(s)}),instead:(s)=>({'main3.lua':gbk(s)})};
module.exports={sjis,gbk,utf8,suikaArc,suikaArcObf,JA,ZH,scripts,games,patches,writeTree};
