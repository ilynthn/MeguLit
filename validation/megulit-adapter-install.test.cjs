// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (アイキス3 sexy: iso+mds, Update Ver.1.03, bonus discs; GIGA's Setup.exe / Update.exe start elevated and ignore our
   messages, Update.exe wants HKLM\Software\GIGA\<game>) MeguLit-Adapter installs a disc-only game itself: the game disc is picked
   among the bonus and music discs, its files are read out without the installer's, every update is checked against the size and
   CRC-32 its UpdateInf.dat records and copied in version order, and the run then goes on in the installed folder. Reading the
   image (core/disc-image.cjs, tested on its own) is a stub here that copies a folder standing for the disc. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const Install=require('../tools/megulit-adapter/install.cjs'),Adapter=require('../tools/megulit-adapter.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'adapter-install-'));
const SJIS=s=>Buffer.from(new TextEncoder().encode(s)); /* ASCII names only below; the title is checked as text */
const put=(f,data)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);};
const roomy={statfs:()=>({bavail:1e9,bsize:4096}),noDrives:''};

/* the layout of the real file: title / about / version / registry key / value, then {name[0x100] … size@0x108 crc@0x110} entries */
function updateInf(version,files,gap=0x11c8){const head=Buffer.alloc(0x308);const w=(s,at)=>SJIS(s).copy(head,at);
 w('Game '+version,0);w('Game '+version+' update',0x80);w('Game '+version,0x180);w('Software\\GIGA\\Game',0x200);w('DIRECTORY',0x280);head.writeUInt32LE(2,0x300);head.writeUInt32LE(2,0x304);
 const ents=files.map(([name,data])=>{const e=Buffer.alloc(0x118);SJIS(name).copy(e,0);e.writeUInt32LE(data.length,0x108);e.writeUInt32LE(zlib.crc32(data)>>>0,0x110);return e;});
 return Buffer.concat([head,Buffer.alloc(gap),...ents,Buffer.alloc(0x10)]);}

function giga(){const base=tmp(),src=path.join(base,'adapt','game'),disc=path.join(base,'disc');
 put(path.join(src,'[220325][戯画] Game sexy パッケージ版 (iso+mds)','Disc.iso'),'ISO');put(path.join(src,'[220325][戯画] Game sexy パッケージ版 (iso+mds)','Disc.mds'),'MDS');
 put(path.join(src,'[220325][戯画] Game sexy 豪華版特典 サウンドトラック (wav+cue+log)','ost.cue'),'CUE');put(path.join(src,'[220325][戯画] Game sexy 豪華版特典 サウンドトラック (wav+cue+log)','ost.wav'),'WAV');
 put(path.join(src,'[220325][戯画] Game sexy 豪華版特典 追加Hシナリオ (bin+cue)','extra.cue'),'FILE "extra.bin" BINARY');put(path.join(src,'[220325][戯画] Game sexy 豪華版特典 追加Hシナリオ (bin+cue)','extra.bin'),'BIN');
 const exe2=Buffer.from('MZ v1.03'),pac3=Buffer.from('PAC update 3'),exe1=Buffer.from('MZ v1.01');
 const u3=path.join(src,'[220325][戯画] Game sexy パッケージ版 Update Ver.1.03');put(path.join(u3,'Data','Game.exe'),exe2);put(path.join(u3,'Data','Update3.pac'),pac3);put(path.join(u3,'Update.exe'),'MZ updater');put(path.join(u3,'UpdateInf.dat'),updateInf('ver1.03',[['Game.exe',exe2],['Update3.pac',pac3]]));
 const u1=path.join(src,'Update Ver.1.01');put(path.join(u1,'Data','Game.exe'),exe1);put(path.join(u1,'UpdateInf.dat'),updateInf('ver1.01',[['Game.exe',exe1]],0x40));
 for(const [n,d] of [['Game.exe','MZ disc'],['Script.pac','PAC'],['Setup.exe','MZ setup'],['SetupInf.dat','inf'],['Uninstall.exe','MZ'],['autorun.inf','[autorun]'],[path.join('Movie','op.mpg'),'MPG'],[path.join('DirectX','dxsetup.exe'),'MZ'],[path.join('マニュアル','manual.html'),'html']])put(path.join(disc,n),d);
 const calls=[];return {base,src,disc,calls,exe2,pac3,extract:async(img,dest)=>{calls.push(['extract',path.basename(img)]);fs.cpSync(disc,dest,{recursive:true});return 1;}};}

test('install: the game disc is picked among bonus and music discs; its files without the installer\'s; updates checked and applied oldest first',async()=>{const G=giga();
 const sets=Install.discSets(G.src);assert.equal(sets.game.length,1);assert.equal(sets.game[0].kind,'iso+mds');assert.equal(sets.bonus.length,2,'the soundtrack and the bonus scenario disc are not the game');
 const ups=Install.updates(G.src);assert.deepEqual(ups.map(u=>u.inf.version),['Game ver1.01','Game ver1.03']);assert.equal(ups[1].inf.regKey,'Software\\GIGA\\Game');assert.deepEqual(ups[1].inf.files.map(f=>f.name),['Game.exe','Update3.pac']);
 const r=await Install.install(G.src,{root:path.join(G.base,'games'),extract:G.extract,...roomy});
 assert.equal(r.ok,true,r.why);assert.equal(path.basename(r.dir),'Game sexy','named after the disc folder without tags and release words');assert.equal(r.release,'パッケージ版');
 assert.deepEqual(G.calls,[['extract','Disc.iso']],'the ISO is read (not the .mds), once');
 assert.deepEqual(fs.readdirSync(r.dir).sort(),['Game.exe','Movie','Script.pac','Update3.pac'],'the installer\'s own files are dropped');
 assert.equal(fs.readFileSync(path.join(r.dir,'Game.exe'),'utf8'),'MZ v1.03','the last update wins');assert.deepEqual(r.updates.map(u=>u.version),['Game ver1.01','Game ver1.03']);
 const again=await Install.install(G.src,{root:path.join(G.base,'games'),extract:async()=>{throw Error('must not read the disc again');},noDrives:''});assert.equal(again.ok,true,again.why);assert.equal(again.reused,true);});

test('install: an update file that does not match its UpdateInf.dat is not copied; .mdf alone, a C:/E: target and no space are refused; a bin+cue game disc is read',async()=>{const G=giga();
 const u3=Install.updates(G.src)[1];fs.writeFileSync(path.join(u3.data,'Update3.pac'),'PAC tampered');
 const r=await Install.install(G.src,{root:path.join(G.base,'games'),extract:G.extract,...roomy});
 assert.equal(r.ok,false);assert.match(r.why,/Update3\.pac.*CRC/);assert.ok(!fs.existsSync(path.join(r.dir,'Update3.pac')),'nothing of the bad update is copied');
 const b=tmp();put(path.join(b,'[戯画] Other (bin+cue)','game.cue'),'FILE "game.bin" BINARY');put(path.join(b,'[戯画] Other (bin+cue)','game.bin'),'BIN');const seen=[];
 const nb=await Install.install(b,{root:path.join(b,'games'),extract:async(img,dest)=>{seen.push(path.basename(img));fs.writeFileSync(path.join(dest,'Other.exe'),'MZ');},...roomy});
 assert.equal(nb.ok,true,nb.why);assert.deepEqual(seen,['game.bin'],'the .cue points at the .bin that is read');
 const m=tmp();put(path.join(m,'[戯画] Old (mdf)','game.mdf'),'MDF');put(path.join(m,'[戯画] Old (mdf)','game.mds'),'MDS');
 const nm=await Install.install(m,{root:path.join(m,'games'),extract:async()=>{throw Error('must not read');}});assert.equal(nm.ok,false);assert.match(nm.why,/读不了/);
 const ce=await Install.install(G.src,{root:'E:\\x',extract:G.extract,noDrives:'C,E'});assert.equal(ce.ok,false);assert.match(ce.why,/不往 E:/);
 const full=await Install.install(G.src,{root:path.join(G.base,'g2'),extract:G.extract,statfs:()=>({bavail:1,bsize:4096}),noDrives:''});assert.equal(full.ok,false);assert.match(full.why,/空间不够/);});

test('adapter run: a disc-only folder is installed and the run goes on in the installed folder; a failed install still asks a person',async()=>{const G=giga(),out=path.join(G.base,'out');
 const installed=path.join(G.base,'games','Game sexy');fs.mkdirSync(installed,{recursive:true});const logs=[];
 const o={...Adapter.parseRun(['node','x',G.src,'--offline','--no-net','--no-external','--out',out]),installer:async()=>({ok:true,dir:installed,copied:3,updates:[{version:'Game ver1.03',files:['Game.exe']}],bonus:['x.cue'],release:'パッケージ版'})};
 const code=await Adapter.run(o,{log:s=>logs.push(s)});
 assert.ok(logs.some(l=>/^# installed .*Game sexy .*Game ver1\.03/.test(l)),logs.join('\n'));assert.ok(logs.some(l=>/没有 exe/.test(l)),'then the installed (empty) folder is what the run looks at: '+logs.join(' / '));assert.equal(code,Adapter.EXIT.inconclusive);
 const logs2=[],o2={...o,out:path.join(G.base,'out2'),installer:async()=>({ok:false,why:'光盘镜像读不了',bonus:[],unmountable:[]})};
 const code2=await Adapter.run(o2,{log:s=>logs2.push(s)});assert.ok(logs2.some(l=>/自动安装没成：光盘镜像读不了/.test(l)),logs2.join('\n'));
 assert.equal(code2,Adapter.EXIT.human);assert.equal(JSON.parse(fs.readFileSync(path.join(G.base,'out2','adapter.json'),'utf8')).install.length>0,true);});
