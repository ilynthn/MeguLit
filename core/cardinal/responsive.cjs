// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 (krkr-nodraw r1/r2) when the reader page stopped answering: the driver's probe (web/reader/replay-probe.js through CDP)
   failed after its 15 s timeout, once or for the rest of the run, and no sample exists for that time. The page was busy or gone; what
   it showed then is unknown. -> [{from, to, failed}] on the replay clock: from the last answered probe before a failure to the next
   answered one (Infinity when it never answered again). Pure; reads o.timing.probes only. */
function spans(o){const p=Array.isArray(o?.timing?.probes)?o.timing.probes.filter(x=>x&&Number.isFinite(x.at)):[],out=[];let open=null;
 for(let i=0;i<p.length;i++){if(p[i].ok===false){if(!open)open={from:i?p[i-1].at:0,to:Infinity,failed:0};open.failed++;}
  else if(open){open.to=p[i].at;out.push(open);open=null;}}
 if(open)out.push(open);return out;}
const during=(sp,a,b=a)=>sp.some(s=>a<s.to&&b>=s.from);
module.exports={spans,during};
