// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E602 keyed WARC archives built here (engine-fixtures-g2 warcEncrypted) for titles of every ExtraCrypt kind and every
   WARC version 1.2–1.7, each in a folder with the title's game-map .exe (one without: scheme.txt names it, and the
   reader has to find it by trying). GARbro's WarOpener opened the same archives (tools/warc-vectors.ps1 -OpenDir,
   node validation/helpers/warc-open-fixtures.cjs <dir> writes them); warc-vectors.json "open" holds the SHA-256 of
   every entry it read. */
const fs=require('node:fs'),path=require('node:path');
const F={...require('./engine-fixtures.cjs'),...require('./engine-fixtures-g2.cjs')},{gen}=require('./warc-vectors.cjs');
const PLAN=[['Hana no Kioku 1-2-3',[2,3],'HK123.EXE'],['Shi-Ka-E-Shi',[3,4],'FKS.EXE'],['Ao no Juuai',[5],'aoj.EXE'],['Kateinai Choukyou',[5,6],'katei.exe'],
 ['Hitozuma Onna Kyoushi Reika',[6],'HITODUMA.EXE'],['Helter Skelter',[6,7],'HELTER.exe'],['Azu Plus',[7],'AZUPLUS.exe'],['Bitch Nee-chan ga Seijun na Hazu ga Nai!',[7],null],
 ['Aneiro',[6,7],'ANEIRO.exe'],['Boku Igai no Otoko o Shiranai Kanojo',[6,7],'MATNTR.exe'],['Bitch Shimai ga Seijun na Hazu ga Nai!!',[6,7],'BITCHES2.exe'],
 ['Chuuni Hime no Teikoku',[6,7],'CHU2HIME.exe'],['Doushite Daite Kurenai no!?',[6,7],'DODAKURE.exe'],['Gohoushi Nurse ~Mayonaka no Kyousei Call~',[6,7],'GHNURSE.exe'],
 ['Gyaku Katei Kyoushi',[6,7],'GYAKUKATE.exe'],['Hin wa Bokura no Fuku no Kami',[6,7],'BINBO.EXE'],['Intruder',[6,7],'INTRUDER.exe'],['Kanojo ga Ore ni Kureta Mono',[6,7],'MONOMONO.exe'],
 ['Kuroneko Plus',[6,7],'KURONEKOPLUS.exe'],['Majime to Sasayakareru Ore o Osananajimi no Risa',[6,7],'MAJIKAN01.exe'],['Nyaru Plus',[6,7],'NYARUPLUS.exe'],
 ['Shinigami no Testament',[6,7],'TESTAMENT.exe'],['Toriko no Chigiri',[6,7],'TORIGIRI.exe']];
const SCENE=';【第一話】\r\n$L_BG,b\\bg01,0\r\n【霧子】\r\n「おはよう」\r\n朝の光が差し込む。\r\n';
/* the entries of one archive: a long scenario (YPK, every DecodeBin flag), a short one (YLZ, KM), Huffman, stored */
function files(v,scheme){const dk=!!scheme.decodeBin,text=F.sjis(SCENE.repeat(60));return {
 'S001.TXT':{data:text,tag:'YPK',flags:0x80000000|(dk?0x60000000:0)},
 'S002.TXT':{data:text.subarray(0,0x300+v),tag:'YLZ',flags:0x80000000,km:true},
 'G001.BIN':{data:gen(v*3+3,0x900),tag:'YH1',flags:0x80000000|(dk?0x40000000:0)},
 'RAW.DAT':{data:gen(v*3+4,0x700),tag:null,flags:0x80000000|(dk?0x20000000:0)},
 'PLAIN.DAT':{data:gen(v*3+5,0x500),tag:'YPK',flags:0},
 'TINY.DAT':{data:Buffer.from('abcde'),tag:null,flags:0x80000000}};}
/* [{key: "<folder>/<archive>", war, scheme, files}] written under root */
function build(root,schemeOf){const out=[];
 for(const [name,versions,exe] of PLAN){const s=schemeOf(name),dir=path.join(root,name.replace(/[^\w]+/g,'_'));fs.mkdirSync(dir,{recursive:true});
  if(exe)fs.writeFileSync(path.join(dir,exe),'MZ');else fs.writeFileSync(path.join(dir,'scheme.txt'),name);
  for(const v of versions){const f=files(v,s),war=path.join(dir,'DATA1'+v+'.war');fs.writeFileSync(war,F.warcEncrypted(f,{version:v,scheme:s}));out.push({key:path.basename(dir)+'/'+path.basename(war),war,scheme:name,files:f});}}
 return out;}
module.exports={PLAN,files,build};
if(require.main===module){const sh=require('../../services/original-engines/shiinario.cjs');build(process.argv[2],n=>sh.schemes().byName.get(n));}
