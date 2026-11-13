// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E602 inputs for the WARC 1.2–1.6 index range coder: what shiinario-crypt.cjs' encoder makes of some fixed data (an
   index-like table, skewed bytes over many model rescales, zeros), raw pseudo-random bytes and a cut-off stream; GARbro's
   CRangeCoder decoded each (tools/warc-vectors.ps1 -RangeDir), warc-vectors.json holds its results */
const C=require('../../services/original-engines/shiinario-crypt.cjs'),{gen}=require('./warc-vectors.cjs');
module.exports=()=>{
 const table=Buffer.alloc(56*300);for(let i=0;i<300;i++){table.write('SCN'+String(i).padStart(4,'0')+'.TXT',56*i,'latin1');table.writeUInt32LE(0x1000+i*0x321,56*i+32);table.writeUInt32LE(0x300+i,56*i+36);table.writeUInt32LE(0x900+i*3,56*i+40);table.writeUInt32LE((0x80000000|i)>>>0,56*i+52);}
 const skew=gen(11,120000).map((v,i)=>v<200?v&7:v^(i&255));
 const enc={table:C.rangeEncode(table),skew:C.rangeEncode(skew),zeros:C.rangeEncode(Buffer.alloc(50000)),empty:C.rangeEncode(Buffer.alloc(0))};
 return {'r1-table':enc.table,'r2-skew':enc.skew,'r3-zeros':enc.zeros,'r4-empty':enc.empty,'r5-random':gen(5,4096),'r6-cut':enc.skew.subarray(0,enc.skew.length>>1),'r7-padded':Buffer.concat([enc.table,Buffer.alloc(1000)])};};
