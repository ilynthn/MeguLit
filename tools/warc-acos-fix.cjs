// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E602 the ShiinaRio cipher's angle token, acos(a / sqrt(a² + b²)) in degrees, for every byte pair it can meet: .NET's
   Math.Acos (the CRT's) and V8's differ in the last bits for some ratios, so the pairs where GARbro's token is not
   the JS one are stored with the difference in units in the last place.
     powershell -NoProfile -ExecutionPolicy Bypass -File tools\warc-vectors.ps1 -GarbroDir runtime\garbro -TokenFile tokens.bin
     node tools/warc-acos-fix.cjs tokens.bin   → services/original-engines/shiinario-acos.json */
const fs=require('node:fs'),path=require('node:path');
const raw=fs.readFileSync(process.argv[2]);
/* the token without the table (as shiinario-crypt.cjs computes it before the fix) */
const token=(a,b)=>{let t=0.0;if((a|b)!==0){t=Math.acos(a/Math.sqrt(a*a+b*b));t=t/Math.PI*180.0;}if(b<0)t=360.0-t;return t;};
const bits=v=>{const x=Buffer.alloc(8);x.writeDoubleLE(v);return x.readBigInt64LE();};
const fix=[];let k=0;
for(let a=-128;a<256;a++)for(let b=-128;b<256;b++){const net=raw.readDoubleLE(8*k++),js=token(a,b);if(net!==js)fix.push(((a+128)*384+(b+128)).toString(36)+':'+Number(bits(net)-bits(js)));}
if(k*8!==raw.length)throw new Error('expected 384 x 384 doubles');
const out={source:'GARbro 1.5.44 (.NET Framework Math.Acos) vs V8, tools/warc-acos-fix.cjs',key:'((a + 128) * 384 + (b + 128)) base 36 : ulp difference of the token',fix:fix.join(' ')};
fs.writeFileSync(path.join(__dirname,'..','services','original-engines','shiinario-acos.json'),JSON.stringify(out,null,1)+'\n');
console.log(fix.length+' pairs');
