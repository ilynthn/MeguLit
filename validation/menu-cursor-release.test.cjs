/* SPDX-License-Identifier: GPL-3.0-or-later */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
test('the open Alt+T panel frees the clipped cursor and gives it back on close',()=>{
 assert.match(src,/static void FreeCursorForMenu\(bool wanted\)/);
 assert.match(src,/FreeCursorForMenu\(MenuOpen\|\|LookupOpen\);/);
 assert.match(src,/ClipCursor\(IntPtr\.Zero\)/);
 assert.match(src,/while\(CursorShown>0\)\{ShowCursor\(false\);CursorShown--;\}/);
});
test('the cursor-clip check is part of the focus self test',()=>{
 assert.match(src,/ClipIsTight\(new Rect\(960,540,961,541\)/);
});
/* Codex #1177: a game that set its clip once gets it back when the panel closes, unless it set a new one meanwhile */
test('the saved clip rectangle is restored on close',()=>{
 assert.match(src,/CursorClip=clip;ClipCursor\(IntPtr\.Zero\);CursorFreed=true;/);
 assert.match(src,/if\(CursorFreed&&!\(GetClipCursor\(out now\)&&ClipIsTight\(now,VirtualScreen\(\)\)\)\)ClipCursorTo\(ref CursorClip\);/);
});
