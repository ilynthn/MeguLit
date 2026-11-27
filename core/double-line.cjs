// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E408 (群友: 纯白交响曲 / マガルミナ showed short lines twice in one go, 「うん。うん。」): an engine that redraws a line (shadow
   layer, voice end, repaint) can hand the hook one string holding the line twice. The C# side only collapses quoted lines
   or 3+ copies, so two plain copies passed, and short lines are the ones drawn fast enough to merge. A line a script really
   says twice arrives as two callbacks (two frames), so one frame that is exactly X+X is collapsed only with evidence from
   the same stream and time, never on the text alone:
    - X is the line shown just before (a redraw of it),
    - the same stream sent X alone in the last 3 s,
    - the same stream already sent a doubled frame in its last 8 frames (it draws twice).
   Kept: 「はい。はい。」 the first time from a stream that never doubled. */
const plain=s=>String(s||'').replace(/\s+/g,'');
const doubled=p=>p.length>=4&&p.length%2===0&&p.slice(0,p.length/2)===p.slice(p.length/2);
class DoubleLine{
 constructor(now=()=>Date.now()){this.now=now;this.streams=new Map();}
 state(stream){const key=String(stream||'');let s=this.streams.get(key);if(!s){s={singles:[],frames:[]};this.streams.set(key,s);if(this.streams.size>64)this.streams.delete(this.streams.keys().next().value);}return s;}
 /* #1128: the stream drew one of its last frames twice (the evidence fix() keeps), for core/line-once.js collapse({min}) */
 drawsTwice(stream){const s=this.streams.get(String(stream||''));return !!s&&s.frames.some(Boolean);}
 /* #1128: a frame the line-once fold found drawn twice inside (skip frames are never a plain X+X) is evidence as well */
 noteDoubled(stream){const s=this.state(stream);if(s.frames.length)s.frames[s.frames.length-1]=true;else s.frames.push(true);}
 /* returns {text, collapsed, reason} */
 /* drawn: the frame as the stream sent it, before other normalizers (repeat-normalizer, the script lookup) undid its doubling.
    2026-11-15 (死に逝く君、館に芽吹く憎悪, Krkr2wcs draws many lines twice 「X　X　」): the stream's "draws twice" evidence is taken
    from that frame; judged after the normalizers it ran out once they had collapsed 8 frames themselves, and the next line
    they left alone was shown and translated twice. */
 fix(stream,text,previous='',drawn=text){
  const now=this.now(),s=this.state(stream),p=plain(text);s.singles=s.singles.filter(x=>now-x.at<3000);
  let unit='';if(p.length>=4&&p.length%2===0&&p.slice(0,p.length/2)===p.slice(p.length/2))unit=p.slice(0,p.length/2);
  s.frames.push(!!unit||doubled(plain(drawn)));if(s.frames.length>8)s.frames.shift();
  if(!unit){s.singles.push({key:p,at:now});if(s.singles.length>20)s.singles.shift();return {text,collapsed:false,reason:''};}
  const reason=plain(previous)===unit?'redraw of previous line':s.singles.some(x=>x.key===unit)?'stream sent it alone just before':s.frames.slice(0,-1).some(Boolean)?'stream draws lines twice':/* 2026-11-16 (死に逝く君、館に芽吹く憎悪: the first line of a run, before any evidence, was drawn twice) a whole sentence of 8+ characters, closed by its punctuation, twice in one frame is a redraw: nobody writes that */unit.length>=8&&/[。！？!?」』）)…―～]$/.test(unit)?'whole sentence twice':'';
  if(!reason)return {text,collapsed:false,reason:''};
  /* keep the first copy as drawn (its own line breaks) */let cut=text.length;for(let i=1,seen='';i<=text.length;i++){seen=plain(text.slice(0,i));if(seen===unit){cut=i;break;}}
  return {text:reason==='whole sentence twice'?text.slice(0,cut).trimEnd():text.slice(0,cut).trim(),collapsed:true,reason};
 }
}
module.exports={DoubleLine};
