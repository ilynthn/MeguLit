// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 (tools/megulit-adapter (cold stage) only; Monochrome Empire, YU-RIS: the title's 「最初から始める」 OCR found took neither a posted click nor a
   hover + click) the cold test's input ladder. Level 0 is ColdDesk's PostMessage (what the app's idle cold test always uses); a
   watched action (the driver's start / confirm click) that changed neither the lines nor the picture within waitMs goes up one level
   and is sent again there: 'inputctl' (the testbed's InputShim injected into the game: fake foreground, cursor, GetAsyncKeyState,
   DirectInput), then 'sendinput' (real input to the foreground window, visible runs only). Lines that stop for stallMs while
   advancing also go up one level. The level stays for the rest of the run.
   Pure: the runner (services/cold-test-run.cjs) feeds it times, line counts and the screen change of two small pictures. */
const zlib=require('node:zlib');

/* the levels a run may use: inputctl only with the testbed's InputCtl, sendinput only on the visible desktop */
/* sendinput moves the user's own mouse: only with realInput (session rule 2026-11-27: input goes into the game only, PostMessage or
   InputShim). from: the engine's first level (tools/megulit-adapter/engines.cjs RULES input) when it is on the ladder; 2026-11-27
   ハミダシクリエイティブ (Artemis) polls the cursor and keys, ignored every posted click and Enter, and answered InputShim at once */
function ladder({inputCtl=false,foreground=false,realInput=false,from=''}={}){const l=['post',...(inputCtl?['inputctl']:[]),...(foreground&&realInput?['sendinput']:[])];
 const k=from?l.indexOf(from):-1;return k>0?l.slice(k):l;}

/* a PNG (8-bit gray / RGB / RGBA / gray+alpha, not interlaced: what ColdDesk's System.Drawing writes) -> {w,h,px: Uint8Array gray} | null */
function pngGray(buf){try{if(!Buffer.isBuffer(buf)||buf.length<33||buf.readUInt32BE(0)!==0x89504e47)return null;
 let o=8,w=0,h=0,depth=0,type=0,inter=0;const idat=[];
 while(o+8<=buf.length){const n=buf.readUInt32BE(o),k=buf.toString('latin1',o+4,o+8),d=buf.subarray(o+8,o+8+n);
  if(k==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);depth=d[8];type=d[9];inter=d[12];}else if(k==='IDAT')idat.push(d);else if(k==='IEND')break;o+=12+n;}
 const ch={0:1,2:3,4:2,6:4}[type];if(!w||!h||depth!==8||!ch||inter)return null;
 const raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*ch,cur=Buffer.alloc(stride),prev=Buffer.alloc(stride),px=new Uint8Array(w*h);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],row=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
  for(let i=0;i<stride;i++){const a=i>=ch?cur[i-ch]:0,b=prev[i],c=i>=ch?prev[i-ch]:0;let v=row[i];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
   cur[i]=v&255;}
  for(let x=0;x<w;x++){const i=x*ch;px[y*w+x]=ch>=3?(cur[i]*30+cur[i+1]*59+cur[i+2]*11)/100|0:cur[i];}
  cur.copy(prev);}
 return {w,h,px};}catch{return null;}}

/* the share of pixels whose brightness moved by more than 24 (0..1); null when the pictures cannot be compared. A title's own
   animation (particles, a blinking cursor) moves a few percent; leaving the title moves most of the picture */
function screenChange(a,b){if(!a||!b||a.w!==b.w||a.h!==b.h||!a.px.length)return null;let n=0;for(let i=0;i<a.px.length;i++)if(Math.abs(a.px[i]-b.px[i])>24)n++;return n/a.px.length;}

const DEFAULTS=Object.freeze({waitMs:4000,stallMs:15000,minChange:0.25,keep:40});
class Ladder{
 constructor(levels,opt={}){this.levels=levels.length?levels.slice():['post'];this.o={...DEFAULTS,...opt};this.i=0;this.watch=null;this.raisedAt=-1e9;this.verified=new Set();
  this.record={levels:this.levels.slice(),level:this.levels[0],verified:[],sent:{},escalations:[],checks:[],errors:[]};}
 get level(){return this.levels[this.i];}
 /* a level that cannot work here (InputShim not injected): skipped, the next one taken */
 drop(level,why){const k=this.levels.indexOf(level);if(k<0)return;this.record.errors.push(level+': '+why);this.levels.splice(k,1);if(this.i>=this.levels.length)this.i=this.levels.length-1;if(k<this.i)this.i--;this.record.level=this.level;}
 sent(level){this.record.sent[level]=(this.record.sent[level]|0)+1;}
 /* a watched action went out at t (snap: {lines, choices}); one watch at a time */
 start(act,t,snap){if(this.watch)return false;this.watch={act,at:t,level:this.level,lines:snap.lines|0,choices:snap.choices|0,diff:null,shot:false};return true;}
 /* every tick -> {done:true, changed, resend?} | {need:'shot'} | null */
 tick(t,snap){const w=this.watch;if(!w)return null;
  if((snap.lines|0)>w.lines||(snap.choices|0)>w.choices)return this.close(t,true,'lines');
  if(w.diff!=null)return this.close(t,w.diff>=this.o.minChange,'screen '+w.diff.toFixed(2));
  if(t-w.at>=this.o.waitMs&&!w.shot){w.shot=true;w.shotAt=t;return {need:'shot'};}
  /* the after picture never came: judged on the lines alone */
  if(w.shot&&t-w.shotAt>=3000)return this.close(t,false,'no picture');
  return null;}
 /* the change between the picture before the action and the one waitMs after it (null: not comparable) */
 screen(diff){if(this.watch)this.watch.diff=diff==null?-1:diff;}
 close(t,changed,why){const w=this.watch;this.watch=null;const c={t,act:w.act.do+(w.act.x!=null?' '+w.act.x+' '+w.act.y:w.act.vk!=null?' '+w.act.vk:''),tag:w.act.watch||'',via:w.level,changed,why};
  if(this.record.checks.length<this.o.keep)this.record.checks.push(c);
  /* a level the game answered is kept: lines that stop later (a name entry waiting for the OCR) are not its fault */
  if(changed){this.verified.add(w.level);this.record.verified=[...this.verified];this.raisedAt=t;return {done:true,changed};}
  if(this.i>=this.levels.length-1)return {done:true,changed};
  this.raise(t,'no change after '+c.act+' ('+why+')');return {done:true,changed:false,resend:w.act};}
 /* advancing, lines stopped for stallMs since the last line (and since the last raise or answered click), on a level no watched click
    has shown to work yet: one level up, nothing re-sent (2026-11-26 オルフレール: its name entry waited 15 s for the OCR's 「決定」 and
    raised PostMessage, which had just opened the title's start item) */
 stall(t,lastLineAt,{advancing=true}={}){if(!advancing||this.watch||this.verified.has(this.level)||this.i>=this.levels.length-1)return false;if(t-Math.max(lastLineAt,this.raisedAt)<this.o.stallMs)return false;this.raise(t,'no line for '+Math.round((t-Math.max(lastLineAt,this.raisedAt))/1000)+' s');return true;}
 raise(t,why){const from=this.level;this.i++;this.raisedAt=t;this.record.level=this.level;this.record.escalations.push({t,from,to:this.level,why});}
}
module.exports={ladder,pngGray,screenChange,Ladder,DEFAULTS};
