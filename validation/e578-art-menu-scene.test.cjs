// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E578 live beta38 (2026-11-14, ダストマニア・グロテスク, 800x600 game at screen 345,157 under a monitor-wide overlay):
   1. the right-click menu's translations were drawn at the monitor's right edge, 2.4x too large, overlapping: art-text.js
      scaled the read picture onto the whole overlay instead of the game's client rect;
   2. the menu (11 short rows) was one item with one translation, and through the script snap even a dialogue line's;
   3. hiding the game's text window left MeguLit's line on the bare picture: the scene probe only reacted to the whole
      picture changing. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {artJunk,artList}=require('../core/art-filter.cjs');

const menu=['クイックセーブ','クイックロード','メッセージスキップ','オートモード','ロード','セーブ','フローモード','ログ表示','環境設定','タイトルへ戻る','ゲームを終了する'];
const rows=menu.map((text,i)=>({text,x:600,y:40+i*24,w:180,h:18}));

test('art geometry: the read picture maps into the game client rect inside a monitor-wide overlay, at any DPI',()=>{
 const src=read('web/reader/modules/art-text.js'),m=src.match(/ const geo=(m=>\{[^\n]*\});/);assert.ok(m,'geo()');
 assert.doesNotMatch(src,/innerWidth\/sw|innerHeight\/sh/,'never the whole overlay');
 for(const dpr of [1,1.5]){
  const info={clientX:345*dpr,clientY:182*dpr,clientWidth:800*dpr,clientHeight:600*dpr};
  const geo=new Function('b','window','innerWidth','innerHeight','return '+m[1])({galLayoutInfo:()=>info},{devicePixelRatio:dpr},1920,1080);
  const g=geo({sw:800,sh:600});
  assert.equal(g.k,1);assert.equal(g.left,345);assert.equal(g.top,182);assert.equal(g.w,800);assert.equal(g.h,600);
  const x=g.left+rows[0].x*g.k;assert.ok(x>=345&&x<=1145,'menu row lands inside the game window, not at the monitor edge');}
});
test('art layer: translations are clamped inside the game and sized from the source glyph height',()=>{
 const src=read('web/reader/modules/art-text.js');
 assert.match(src,/const clampY=\(y,height\)=>Math\.max\(g\.top,Math\.min\(y,g\.top\+g\.h-height\)\);/);
 assert.match(src,/const rowH=Math\.min\(\.\.\.rows\.map\(r=>r\.h\*g\.k\)\)/);
 assert.match(src,/let size=Math\.max\(10,h\*\.85\);/,'per-row size from that row');
 assert.match(src,/m\.rowTranslations\.length===rows\.length/);
});
test('a vertical menu is a list of rows; sentences, single rows and overlapping rows are not',()=>{
 assert.deepEqual(artList(rows),menu);
 assert.equal(artList([rows[0]]),null);
 assert.equal(artList([{text:'遠くで小さく、モーター音がしていることに気がついた。',x:0,y:0,w:700,h:20},{text:'そう思って。',x:0,y:30,w:200,h:20}]),null);
 assert.equal(artList([{text:'セーブ',x:0,y:0,w:60,h:20},{text:'ロード',x:70,y:2,w:60,h:20}]),null,'side by side is one row');
});
test('OCR noise from a fading menu is no item',()=>{
 assert.equal(artJunk('ククメイイツツッセクク一ブドキ',[],600),true);
 assert.equal(artJunk('クイックセーブクイックロードメッセージスキップ',[],600),false);
});
test('reader: each menu row gets its own translation, never the script snap',async()=>{
 const R=require('../services/reader.cjs').Reader;
 const r=Object.create(R.prototype),out=[];r.runtime={emit:(_,m)=>out.push(m)};
 const cache=new Map();r.embedCached=(k,v)=>{if(v!==undefined)cache.set(k,v);return cache.get(k)||'';};
 r.displayLanguage=()=>'zh';r.prefs=()=>({});r.workPrompt='';r.loadKeys=()=>{};r.localReady=async()=>{};r.langOptions=o=>o;
 let snapped=0;r.gal={hooks:{ocrSnap:()=>{snapped++;return '待ってたよ、早くおいで。';},scriptTranslation:()=>'久等了，快过来趟。',trace(){}}};
 const tr={'クイックセーブ':'快速存档','ロード':'读档','ゲームを終了する':'结束游戏'};
 r.translator=()=>({translate:async t=>tr[t]||''});
 await r.artText({type:'artText',id:3,source:'ocr',text:menu.join(''),visible:true,rows,sw:800,sh:600});
 assert.equal(snapped,0,'a menu is never snapped to a script line');
 const m=out.at(-1);assert.equal(m.rowTranslations.length,menu.length);
 assert.equal(m.rowTranslations[0],'快速存档');assert.equal(m.rowTranslations[4],'读档');assert.equal(m.rowTranslations[10],'结束游戏');
 assert.ok(!m.rowTranslations.includes('久等了，快过来趟。'));assert.equal(m.text,menu.join('\n'));
});
test('scene probe: the text window alone going away hides MeguLit\'s line, and its return shows it (native self-test)',()=>{
 const s=read('native/GameSceneProbe.cs');
 assert.match(s,/const double BoxOnly=\.5, StillPicture=\.13;/);
 assert.match(s,/if\(delta<=StillPicture&&bandDelta>=BoxOnly\)\{if\(boxAt==DateTime\.MinValue\)boxAt=now;else if\(\(now-boxAt\)\.TotalMilliseconds>=BoxSettleMs\)\{hidden=boxHidden=true;/);
 assert.match(s,/returned=\(boxHidden\?Difference\(baseBox,box\):delta\)<=Returned\?returned\+1:0;/);
 assert.match(s,/E578: the text window alone is hidden/,'covered by GameSceneProbe.SelfTest (--mode-self-test)');
});
test('scene probe self-test passes (when GalWindowBridge.exe is built)',{skip:!fs.existsSync(path.join(__dirname,'..','native','GalWindowBridge.exe'))},()=>{
 const r=require('node:child_process').spawnSync(path.join(__dirname,'..','native','GalWindowBridge.exe'),['--mode-self-test'],{encoding:'utf8',timeout:20000});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
