/* SPDX-License-Identifier: GPL-3.0-or-later */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
test('the open Alt+T panel frees the clipped cursor and gives it back on close',()=>{
 assert.match(src,/static void FreeCursorForMenu\(bool wanted,bool ours\)/);
 assert.match(src,/FreeCursorForMenu\(MenuOpen\|\|LookupOpen,/);
 assert.match(src,/ClipCursor\(IntPtr\.Zero\)/);
});
test('the cursor-clip check is part of the focus self test',()=>{
 assert.match(src,/ClipIsTight\(new Rect\(960,540,961,541\)/);
});
/* Codex #1177: a game that set its clip once gets it back when the panel closes, unless it set a new one meanwhile */
test('the saved clip rectangle is restored on close',()=>{
 assert.match(src,/CursorClip=clip;ClipCursor\(IntPtr\.Zero\);CursorFreed=true;/);
 assert.match(src,/if\(CursorFreed&&!\(GetClipCursor\(out now\)&&ClipIsTight\(now,VirtualScreen\(\)\)\)\)ClipCursorTo\(ref CursorClip\);/);
});
/* RRFZ #1177: ShowCursor is per calling thread, useless across processes, and the old loop added up to 4 per 16 ms tick */
test('no cross-process ShowCursor count is kept',()=>{
 assert.doesNotMatch(src,/ShowCursor\(/);
 assert.doesNotMatch(src,/CursorShown/);
});
test('the clip is lifted and given back only for the bound game in front in translation mode',()=>{
 assert.match(src,/\{IntPtr front=GetAncestor\(GetForegroundWindow\(\),3\);FreeCursorForMenu\(MenuOpen\|\|LookupOpen,TranslationMode&&Target!=IntPtr\.Zero&&front!=IntPtr\.Zero&&\(front==GetAncestor\(Target,3\)\|\|front==GetAncestor\(Overlay,3\)\)\);\}/);
 const m=/internal static int CursorStep\(bool panel,bool ours,bool freed\)\{return ([^;]+);\}/.exec(src);
 assert.ok(m,'CursorStep found');
 const step=new Function('panel','ours','freed','return '+m[1]+';');
 assert.equal(step(true,true,false),1,'panel opens over the game: lift');
 assert.equal(step(true,true,true),0,'already lifted: nothing more on later ticks');
 assert.equal(step(false,true,true),2,'panel closed: give it back');
 assert.equal(step(false,true,false),0);
 assert.equal(step(true,false,false),0,'another program in front: never lift');
 assert.equal(step(true,false,true),3,'another program in front: forget, never clip it to the game');
 assert.equal(step(false,false,true),3);
 assert.match(src,/if\(step==3\)CursorFreed=false;/);
 assert.match(src,/CursorStep\(true,true,false\)!=1\|\|/,'covered by the bridge self test');
});
