// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E560 Unity text setters (UI.Text / TMP set_text, JIT hooks): shared clean-up before the reader sees a hook frame.
   rubySize  furigana drawn as a small <size=N>kana</size> right after kanji (Tsuki ni Yorisou: 一月<size=12>ひとつき</size>)
             is ruby, not text: dropped when N is at most 60 % of the size around it (or ≤ 20 with no outer size).
   typewriter a typewriter calls the setter once per character; LunaHost hands the calls over as one string, so a line that
             the next line starts with is an earlier state of that line and is dropped (blank states too). */
const KANA=/^[\u3041-\u309f\u30a0-\u30ffー・]+$/u,KANJI_END=/[\u3400-\u9fff々〆ヶ]$/u;
/* #1248 TextMeshPro ruby is the same thing in relative units: 漢字<voffset=1em><size=50%>かんじ</size></voffset> (a size in % or em
   is already relative to the text around it, ruby when at most 60 %) */
function sizeOf(v){const m=/^(\d+(?:\.\d+)?)(%|em|px)?$/i.exec(String(v).trim());if(!m)return null;const n=+m[1],u=(m[2]||'').toLowerCase();return u==='%'?{rel:n/100}:u==='em'?{rel:n}:{abs:n};}
function small(v,outer){const z=sizeOf(v);if(!z)return false;if(z.rel!==undefined)return z.rel<=0.6;return outer?z.abs<=outer*0.6:z.abs<=20;}
function rubySize(text){
 const s=String(text||'');let outer=0,out='',at=0;const re=/<size=([\d.]+(?:%|em|px)?)>([^<]*)<\/size>|<size=([\d.]+(?:%|em|px)?)>/gi;let m;
 while((m=re.exec(s))){
  if(m[3]){const z=sizeOf(m[3]);if(z&&z.abs!==undefined&&(!outer||z.abs>outer*0.6))outer=z.abs;continue;}
  const inner=m[2];
  if(KANA.test(inner)&&KANJI_END.test(s.slice(0,m.index).replace(/<[^>]*>/g,''))&&small(m[1],outer)){out+=s.slice(at,m.index);at=m.index+m[0].length;}
 }
 out+=s.slice(at);
 /* a typewriter stops mid-tag: an unclosed small kana run (or a cut-off tag) at the very end is the ruby being typed */
 return out.replace(/<size=([\d.]+(?:%|em|px)?)>[ぁ-ゟ゠-ヿー・]*(?:<\/?[a-z]*)?(?=\s*$)/i,(m0,n)=>small(n,outer)?'':m0).replace(/<\/?[a-z]*(?:=[^>]*)?(?=\s*$)/i,'');
}
function typewriter(text){
 const lines=String(text||'').split('\n');if(lines.length<3)return String(text||'');
 const key=l=>l.replace(/^[\s\u3000]+|[\s\u3000]+$/g,'');let dropped=0;const out=[];
 for(let i=0;i<lines.length;i++){const k=key(lines[i]),next=i+1<lines.length?key(lines[i+1]):null;
  if(next!==null&&next.length>k.length&&next.startsWith(k)){dropped++;continue;}
  out.push(lines[i]);}
 return dropped>=2?out.join('\n'):String(text||'');
}
module.exports={rubySize,typewriter};
/* E560 one Unity text box per setter stream: the box is rewritten on every typewriter step and a whole NVL page sits in it,
   so the reader gets only the paragraph the game is on, once it is typed out. Paragraphs: a line that starts with an
   indent/bracket opens one, other lines are wraps of the one before. A paragraph still being typed (no closing mark) is
   held until the stream has been quiet for holdMs; the same paragraph again is not delivered twice. */
const OPEN=/^[　「『（(【〈《“"]/u,DONE=/[。！？!?」』）)…―─〜~♪】>”"．.]$/u;
function paragraphs(text){const out=[];for(const raw of String(text||'').split('\n')){const l=raw.replace(/\s+$/,'');if(!l.trim())continue;if(!out.length||OPEN.test(l))out.push(l);else out[out.length-1]+=l.replace(/^\s+/,'');}return out;}
/* #468 (ひぐらしのなく頃に解: 「どうせ引き裂かれるなら、」 then 「身を引き裂かされる方が…」 0.3 s later, one setter call each, no typewriter):
   a held paragraph is a typewriter state only while the next call grows it. A call that does not grow it means the held
   text was complete: it is delivered at once, never dropped (the half sentence used to be lost, the reader's line no longer
   matched the page and the OCR read took over). The rest of a sentence after a comma is joined downstream (core/page-text.cjs).
   A stream that has never grown a paragraph holds an unfinished one only quickHoldMs (a comma piece of an append-only box). */
class UnityBox{
 constructor(now,deliver,holdMs=3000,quickHoldMs=350){this.now=now;this.deliver=deliver;this.holdMs=holdMs;this.quickHoldMs=quickHoldMs;this.streams=new Map();}
 feed(stream,text,payload){
  const paras=paragraphs(text);if(!paras.length)return;const last=paras[paras.length-1];
  const s=this.streams.get(stream)||{shown:'',timer:null,held:null,typed:false};this.streams.set(stream,s);
  const key=last.replace(/\s+/g,'');/* a paragraph that grows the one just released early is a typewriter too: hold its next states the full time */if(!s.held&&s.shown&&key.length>s.shown.length&&key.startsWith(s.shown))s.typed=true;
  if(s.held){if(key.length>s.held.key.length&&key.startsWith(s.held.key))s.typed=true;else if(key!==s.held.key&&!s.typed)this.release(s);}/* a typewriter stream also carries other boxes between its steps (Tsuki: 「前略。」 amid a page being typed): there the held state is still dropped for the next one, as before */
  if(key===s.shown){this.cancel(s);return;}
  /* #1248 (制服カノジョ3: 「今日は芹香の希望で山中にある、水着で…向かっている。」 was shown, then the box sent 「今日は芹香の希望で山中にある、」 again
     and the next line was joined to that comma piece: 「…山中にある、……だが、登山道を…」). An unfinished piece the shown paragraph starts with
     is an earlier typewriter state of that paragraph (the box typing it again), never a new line: it is not delivered. Rich-text
     tags are gone before this (core/rich-text.cjs), so the tagged state matches the shown line. */
  if(s.shown&&key.length<s.shown.length&&s.shown.startsWith(key)&&!DONE.test(last.trim()))return;
  if(DONE.test(last.trim())){this.cancel(s);s.shown=key;this.deliver(last,payload);return;}
  this.cancel(s);s.held={key,last,payload};s.timer=setTimeout(()=>this.release(s),s.typed?this.holdMs:this.quickHoldMs);s.timer.unref?.();
 }
 release(s){const h=s.held;this.cancel(s);if(!h||h.key===s.shown)return;s.shown=h.key;this.deliver(h.last,h.payload);}
 cancel(s){clearTimeout(s.timer);s.timer=null;s.held=null;}
}
module.exports.paragraphs=paragraphs;module.exports.UnityBox=UnityBox;
