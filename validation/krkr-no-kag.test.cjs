// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 KiriKiri without KAG3 (オルフレール: its own cメッセージ system, native/krkrtext reports "wait kag" for good). The bridge's
   behaviour is checked by HookBridge.exe --self-test (KrkrNoKagSelfTest, run by native/Build-HookBridge.ps1); here: the gate is
   wired where the selection is decided, and a cold run leaves Cardinal's tape in its folder for tools/cardinal.cjs --tape. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const SRC=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');

test('HookBridge: the no-KAG DrawText gate decides auto-select and the rival switch, and is self-tested',()=>{
 assert.match(SRC,/static bool KrkrNoKag\(\)\{[^}]*KrkrNoKagMs/);
 assert.match(SRC,/if\(tag=="KRKR"\)KrkrKagStatus\(said\)/,'the KAG DLL status feeds the gate');
 assert.equal((SRC.match(/!AutoSkipped\(c\.name\)/g)||[]).length,1,'auto-select');
 assert.equal((SRC.match(/!AutoSkipped\(rv\.name\)/g)||[]).length,1,'rival switch');
 assert.ok(!/Regex\.IsMatch\((?:c|rv)\.name\?\?"",AutoSkip/.test(SRC),'no selection path bypasses the gate');
 assert.match(SRC,/if\(KrkrRank\(name\)>0&&KrkrNoKag\(\)\)\{string once=UndoubleChars\(text,2\);if\(once==text\)once=UndoublePrefix\(text\);text=once;/,'doubling undone before the frame is read');
 assert.match(SRC,/if\(!KrkrJoinFlush\)\{string whole=KrkrJoinPiece\(code,name,tp,text,probe\);if\(whole==null\)return;text=whole;\}/,'pieces joined into one line');
 assert.match(SRC,/krkr no-KAG: dialogue stream /,'the stream with whole lines takes the selection');
 assert.match(SRC,/if\(!KrkrNoKagSelfTest\(\)\)throw/,'--self-test covers it');});

test('cold run: Cardinal\'s tape is written to the run folder when it has dialogue',async()=>{const R=require('../services/cold-test-run.cjs'),Tape=require('../core/cardinal/tape.cjs');
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'krkr-tape-'));Tape.clear();
 const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};
 child.stdin.on('data',b=>{if(String(b).includes('kill'))setImmediate(()=>{child.stdout.end();child.emit('exit',0);});});
 class Hook{configure(){Tape.record('hb',{type:'hookSource',text:'私も頑張らなくちゃ！',sourceName:'tTVPNativeBaseBitmap::DrawText'});}tick(){}stop(){}}
 setImmediate(()=>{child.stdout.write(JSON.stringify({type:'started',pid:7,started:'1'})+'\n');child.stdout.write(JSON.stringify({type:'window',hwnd:'9',w:10,h:10})+'\n');setTimeout(()=>child.stdout.write(JSON.stringify({type:'exited'})+'\n'),40);});
 const r=await R.runOne({exe:'C:/g/orfre.exe',runDir:path.join(dir,'run'),budgetMs:60000},{spawn:()=>child,helper:'ColdDesk.exe',Hook,layout:{native:dir},tick:10});
 assert.equal(r.tapeLines,1);const text=fs.readFileSync(path.join(dir,'run','cardinal-tape.jsonl'),'utf8'),rows=text.trim().split('\n').map(l=>JSON.parse(l));
 assert.equal(rows[0].tape,'megulit.cardinal-tape','versioned header (core/cardinal/tape-file.cjs)');assert.equal(require('../core/cardinal/tape-file.cjs').parse(text).lines,1);
 assert.ok(rows.some(x=>x.hb?.type==='hookSource'&&x.hb.text==='私も頑張らなくちゃ！'));Tape.clear();});
