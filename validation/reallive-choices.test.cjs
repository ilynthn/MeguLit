// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// RealLive select commands (select_w/select/select_s2/select_s) give the scene's menu choices, read from bytecode.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rl-choices-'));
process.env.MEGULIT_ROOT=tmp;process.env.MEGULIT_WORK=tmp;
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const rl=require('../services/original-engines/reallive.cjs');
const {sjis}=require('./helpers/engine-fixtures.cjs');
const B=(...a)=>Buffer.from(a),nl=n=>B(0x0a,n&255,n>>8);
const int=v=>{const b=Buffer.alloc(6);b[0]=0x24;b[1]=0xff;b.writeInt32LE(v,2);return b;};
// ( intB[flag] != 1 ) : a condition group as in a real select
const cond=flag=>Buffer.concat([B(0x28,0x24,0x01,0x5b),int(flag),B(0x5d,0x5c,0x29),int(1),B(0x29)]);
const select=(op,...elems)=>Buffer.concat([B(0x23,0,2,op,0,2,0,0),B(0x7b),...elems,B(0x7d)]);
const textout=s=>Buffer.concat([sjis(s),nl(1)]);
const head=B(0x23,1,2,3,4,5,6,7,0x28,0x31,0x29);
const pad=Buffer.alloc(700,0x2c);

test('reallive: a select command gives one choice set, in order, tied to the line before it',()=>{
 const code=Buffer.concat([head,textout('「どうする？」'),
  select(3,nl(2),sjis('受け取る'),nl(3),B(0x28),cond(600),B(0x30),int(0),B(0x29),sjis('断る'),nl(4),sjis('ＹＥＳ')),
  textout('「そうか」'),pad]);
 const r=rl.parse(code);
 assert.deepEqual(r.choices,[{after:0,options:['受け取る','断る','ＹＥＳ']}]);
 assert.ok(r.lines.includes('「どうする？」')&&r.lines.includes('「そうか」'));
});
test('reallive: before the first line is -1; a window argument and a second set work; no select, no key',()=>{
 const win=B(0x28,0x24,0xff,0,0,0,0,0x29);
 const first=Buffer.concat([B(0x23,0,2,0,0,1,0,0),win,B(0x7b),nl(1),sjis('あいう'),nl(2),sjis('いうえ'),nl(3),B(0x7d)]);
 const code=Buffer.concat([head,first,textout('「あいう」'),select(1,sjis('おはよう'),nl(1),sjis('さようなら')),pad]);
 const r=rl.parse(code);
 assert.deepEqual(r.choices,[{after:-1,options:['あいう','いうえ']},{after:r.lines.indexOf('「あいう」'),options:['おはよう','さようなら']}]);
 assert.equal(rl.parse(Buffer.concat([head,textout('「あいう」'),pad])).choices,undefined);
});
test('reallive: lines are unchanged by choices (option text stays among them), and a 0x7d trail byte does not end a block',()=>{
 // 0x7d is a valid Shift-JIS trail byte (0x81 0x7d): it must not close the block early
 const code=Buffer.concat([head,select(2,sjis('はい'),nl(1),Buffer.from([0x81,0x7d]),sjis('いいえ')),pad]);
 const r=rl.parse(code);
 assert.deepEqual(r.choices[0].options.slice(0,1),['はい']);
 assert.ok(r.choices[0].options.at(-1).endsWith('いいえ'));
 assert.ok(r.lines.includes('はい'));
});
