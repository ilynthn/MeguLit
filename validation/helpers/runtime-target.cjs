// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 a stand-in "running game" for the native end-to-end test: holds the synthetic heap (runtime-fixtures heapBlob)
   in its own memory, says ready over IPC and idles until killed. It is a plain Node process; nothing is injected. */
const fs=require('node:fs');
const held=[fs.readFileSync(process.argv[2])];
/* a second copy in a fresh allocation, as a game keeps a decoded buffer and its working copy */
held.push(Buffer.from(held[0]));
process.send?.({ready:true,bytes:held.reduce((n,b)=>n+b.length,0)});
setInterval(()=>{globalThis.__keep=held.length;},1000);
