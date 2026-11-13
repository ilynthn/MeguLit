'use strict';
/* E532: MAGES glyph sheet -> closest installed font (core/mages-font.cjs + services/font-match.ps1). */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const repo=path.join(__dirname,'..');const mf=require(path.join(repo,'core','mages-font.cjs'));const {png}=require(path.join(repo,'services','cg-decoders.cjs'));
test('decodePng reads alpha ink and normCell crops the ink box to 32x32',()=>{
 const width=128,height=64,rgba=Buffer.alloc(width*height*4);for(let y=10;y<30;y++)for(let x=70;x<80;x++){const o=(y*width+x)*4;rgba.fill(255,o,o+4);}
 const img=mf.decodePng(png({width,height,rgba}));assert.equal(img.width,128);assert.equal(img.ink[15*128+75],255);assert.equal(img.ink[0],0);
 const g=mf.normCell(img,64,0,64);assert.equal(g.length,mf.SIZE*mf.SIZE);assert.ok(g.every(v=>v===255));assert.equal(mf.normCell(img,0,0,64),null);});
test('closest: best family above the threshold wins, otherwise no face',()=>{
 assert.equal(mf.closest([{family:'DFGothicP-W5',style:'Regular',score:0.85},{family:'MS Gothic',style:'Regular',score:0.83}]).face,'DFGothicP-W5');
 assert.equal(mf.closest([{family:'X',style:'Regular',score:0.7}]).face,'');assert.equal(mf.closest([]).face,'');});
test('font-match.ps1 draws paths without fallback and takes the sheet em size',()=>{const s=fs.readFileSync(path.join(repo,'services','font-match.ps1'),'utf8');
 assert.match(s,/GraphicsPath/);assert.match(s,/InstalledFontCollection/);assert.match(s,/\$job\.em/);assert.doesNotMatch(s,/FontStyle\.Bold\}/);});
test('engine-font-scan MAGES branch uses the matcher and cache version 2',()=>{const s=fs.readFileSync(path.join(repo,'core','engine-font-scan.cjs'),'utf8');
 assert.match(s,/mages-font\.cjs/);assert.match(s,/version===2/);});
const SG='E:/steam/steamapps/common/STEINS;GATE';
test('live: STEINS;GATE FONT.PNG matches a gothic face',{skip:!fs.existsSync(SG)&&'STEINS;GATE not installed',timeout:300000},()=>{
 const job=mf.sample(SG);assert.ok(job&&job.cell===48&&job.chars.length>=60);const r=mf.closest(mf.matchSync(job,fs.mkdtempSync(path.join(os.tmpdir(),'mfm-'))));
 assert.ok(r.candidates.length>0);if(r.face)assert.doesNotMatch(r.face,/mincho|明朝|serif/i);});
