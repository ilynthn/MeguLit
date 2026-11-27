// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E407 choices for every engine: the hook's other streams (choice role 3, or any stream that is not the dialogue or the
   name) carry the choice texts. They are only collected here; nothing is ever written back into the game. A burst of two
   or more short distinct lines that are not the current dialogue line is a choice candidate; OCR (PageLocator) then
   keeps only those drawn on screen as rows of their own, so stray system strings never reach the overlay.
   E416 (user 2026-11-11: fix it for every engine, not per game). The streams next to the dialogue also carry the speaker's
   name and pieces of the line being typed out (穢翼のユースティア: 【オズ】 and 「こ、」 on every spoken line), which made a
   two-item "choice" and put the choice overlay over the text. Engine-independent signals now decide what is not a choice:
   - a lone bracketed name (【…】 〔…〕 ［…］ 《…》 <…>) is a speaker (an unbracketed name may be a route choice)
   - quoted text already shown as dialogue: equal to one of the recent lines
   - a quoted piece of the line on screen: a prefix of it, or its characters in order
   - the dialogue still growing (typewriter) after short candidates (3 characters or fewer) arrived */
const plain=s=>String(s||'').replace(/\s+/g,'');
const japanese=s=>/[぀-ヿ一-鿿]/.test(s);
const NAME=/^(【[^】]{1,16}】|〔[^〕]{1,16}〕|［[^］]{1,16}］|《[^》]{1,16}》|<[^>]{1,16}>)$/;
const bare=s=>plain(s).replace(/[「」『』（）()【】〔〕［］《》<>、。，．！？!?…‥ー〜～・]/g,'');
function partOf(line,dialogue){const key=plain(line),d=plain(dialogue);if(!key||!d)return false;
 /* only quoted pieces: an unquoted short choice (はい) may well begin the line or occur in it */
 if(!/^[「『（(]/.test(line.trim()))return false;if(d.startsWith(key))return true;const a=bare(line),b=bare(dialogue);if(!a||!b||a.length>b.length)return false;
 /* RRFZ #1198: a short choice (under 6 characters) is a piece of the line only as its beginning or as at least half of it: 「学校」 and
    「自宅」 are real choices under 「今日は学校に行くか、それとも家に帰るか……」, their characters occur in it all the same */
 if(a.length<6)return b.startsWith(a)||a.length*2>=b.length&&b.includes(a);let j=0;for(const c of b){if(c===a[j])j++;if(j===a.length)return true;}return false;}
/* 2026-11-13 live choice screens (CLANNAD, Summer Pockets, ATRI, ファタモルガーナの館): engines hand the choice texts over in
   shapes the old reader never split. Every shape below is engine-independent:
   - bullet separators: 「♪・傷ついた渡り鳥♪・歌を忘れたカナリア」, 「上書きで何か吹き込む／」 -> one candidate per piece
   - a name prefix glued on by a name stream: 「【朋也】朋也【朋也】朋也やめておく」 -> 「やめておく」
   - the whole frame drawn twice: 「AB AB」 -> 「AB」 (OCR then cuts AB at the button rows, PageLocator)
   - all options glued with no separator: cut by the other candidates (「傷ついた渡り鳥歌を忘れたカナリア…」)
   - an option made only of ellipses (「…………」, staying silent) is still an option; it needs no translation */
const BULLETS=/[♪♫●○◆◇■□★☆▶▷►▼▽／|｜]+・?/;
const SYMBOLIC=/^[…‥・ー―－\-.。、]{2,12}$/;
/* #146 (WHITE ALBUM2, AQUAPLUS: 「１．電話をかける２．メールを送る」 came as one string, the reader saw one option): options
   numbered 1. 2. 3. in order inside one string, the first at its start, are one candidate per number (every engine). */
function numbered(raw){const t=String(raw||'').trim(),re=/([0-9０-９])[.．、:：)）]/g,cuts=[];let m;
 while((m=re.exec(t))){const c=m[1].charCodeAt(0),d=c>=0xff10?c-0xff10:c-48;if(d===cuts.length+1&&(cuts.length||m.index===0))cuts.push(m.index);}
 if(cuts.length<2)return null;const parts=cuts.map((c,i)=>t.slice(c,i+1<cuts.length?cuts[i+1]:t.length).trim()).filter(Boolean);return parts.length>=2?parts:null;}
function halves(key){/* X+X (X at least 2 chars) -> X; also X+X+X */for(const n of [2,3]){if(key.length%n)continue;const x=key.slice(0,key.length/n);if(x.length>=2&&x.repeat(n)===key)return x;}return key;}
/* 2026-11-19 (千恋＊万花 settings page: 「オ」「オオ」「オオー」… went to OCR as options) a typing sequence is told by timing, never by
   the shape of a word (「ママ」「パパ」 are options): frames of one capture within 1.5 s that grow, shrink or are the same text
   with every glyph drawn twice belong to one line being typed (three frames or more; an ellipsis option never); its shorter pieces
   are fragments */
const undouble=k=>{const c=[...k];if(c.length<2||c.length%2)return k;for(let i=0;i<c.length;i+=2)if(c[i]!==c[i+1])return k;return c.filter((_,i)=>i%2===0).join('');};
function typingPair(a,b){if(!a||!b||a===b)return false;const x=undouble(a),y=undouble(b);return b.startsWith(a)||a.startsWith(b)||x!==a&&y.startsWith(x)||y!==b&&x.startsWith(y)||x===y;}
function balanced(line){let d=0;for(const c of String(line||'')){if('「『（(【'.includes(c))d++;else if('」』）)】'.includes(c)){if(--d<0)return false;}}return d===0;}
function stripNames(line){let s=line,prev;do{prev=s;s=s.replace(/^【([^】]{1,16})】\1?/,'');}while(s!==prev&&s);return s;}
class ChoiceCapture{
 constructor(now=()=>Date.now()){this.now=now;this.items=[];this.active=false;this.at=0;this.lines=[];this.names=new Set();this.dialogue='';this.grewAt=0;this.order=null;}
 /* #1143 (euphoria HD: the first screen is a choice, no dialogue stream yet; the bridge took the stream that draws the options as the
    dialogue and sent 「AABB」 as a line while other streams sent 「AA」 and 「BB」): a line made only of two or more distinct pieces that
    other streams sent apart (each piece maybe drawn twice or three times in a row) is the options drawn together, not dialogue.
    Returns the pieces in line order, or null. Every engine. */
 static frameOf(line,texts){const d=plain(line);if(d.length<4||d.length>400)return null;
  /* a spoken or narrated line (sentence end, quotes) cut into the pieces a typing stream flushed is no frame of options */
  if(/[。！？!?「」『』]/.test(d))return null;
  const keys=[...new Set((texts||[]).map(t=>{const k=plain(t);return SYMBOLIC.test(k)?k:halves(k);}).filter(k=>k.length>=2&&k.length<=40&&k.length<d.length&&japanese(k)))];
  if(keys.length<2)return null;
  const walk=(p,used)=>{if(p===d.length)return used.length>=2&&new Set(used).size>=2?used:null;for(const k of keys){if(!d.startsWith(k,p))continue;let q=p+k.length,n=1;while(n<3&&d.startsWith(k,q)){q+=k.length;n++;}for(let m=n;m>=1;m--){const r=walk(p+k.length*m,[...used,k]);if(r)return r;}}return null;};
  const used=walk(0,[]);return used&&new Set(used).size===used.length?used:null;}
 /* the text pieces one frame stands for */
 static pieces(text){const out=[];for(const raw of String(text||'').split(/\r?\n|\\n/)){let parts=raw.split(BULLETS).map(s=>s.trim()).filter(Boolean);if(parts.length<2){const n=numbered(raw);if(n)parts=n;}
   for(const p of parts.length?parts:[raw]){let line=stripNames(p.trim()).replace(/^[\d０-９]+[.．、:：)\]]\s*/,'');const key=plain(line);const h=SYMBOLIC.test(key)?key:halves(key);if(h!==key)line=h;out.push({line,doubled:h!==key,list:parts.length>=2});}}
  return out;}
 /* every dialogue line (and its speaker) as the hook delivers it; a line that extends the previous one is typing */
 noteDialogue(text,speaker=''){const t=plain(text);if(!t)return;
  if(this.dialogue&&t!==this.dialogue&&t.startsWith(this.dialogue))this.grewAt=this.now();
  this.dialogue=t;this.speakerNow=plain(speaker).replace(/^[【〔［《<]|[】〕］》>]$/g,'');if(!this.lines.includes(t)){this.lines.push(t);if(this.lines.length>40)this.lines.shift();}
  const n=plain(speaker);if(n){this.names.add(n);this.names.add(n.replace(/^[【〔［《<]|[】〕］》>]$/g,''));if(this.names.size>64)this.names.delete(this.names.values().next().value);}}
 /* text: one stream frame (may hold several choices separated by line breaks); dialogue/speaker: the current line and name. */
 add(text,dialogue='',speaker=''){
  const now=this.now(),skip=new Set([plain(dialogue),plain(speaker)]);this.items=this.items.filter(x=>now-x.at<1500);
  if(plain(speaker))this.names.add(plain(speaker));
  /* a frame that is one text drawn twice back to back (「血塗れの男血塗れの男」): this stream draws that text glyph by glyph, twice (#1118) */
  {const k=[...plain(text)];if(k.length>=4&&k.length%2===0&&k.slice(0,k.length/2).join('')===k.slice(k.length/2).join('')){(this.drawnTwice??=new Set()).add(k.slice(0,k.length/2).join(''));if(this.drawnTwice.size>32)this.drawnTwice.delete(this.drawnTwice.values().next().value);}}
  const added=[];
  for(const m of String(text||'').matchAll(/【([^】]{1,16})】/g))this.names.add(m[1]);/* bracketed names on any stream are speaker names */
  /* 2026-11-19 (千恋＊万花: 「■自動車（車内／走行）」 split at ■ and ／ into the "options" 「自動車（車内」「走行）」) a whole script stage note
     ■label（detail） is no choice; it goes before the bullet split */
  this.typed=(this.typed||[]).filter(x=>now-x.at<1500);
  const pieces=ChoiceCapture.pieces(String(text||'').replace(/[■□◆][^■□◆「『（()\r\n]{1,24}（[^（）\r\n]{0,30}）/gu,''));
  if(pieces.filter(p=>p.list).length>=2){const keys=pieces.filter(p=>p.list).map(p=>plain(p.line)).filter(Boolean);if(keys.length>=2&&keys.length<=8)this.order=keys;}
  for(const {line,doubled} of pieces){
   const key=plain(line);const symbolic=SYMBOLIC.test(key);
   if(!symbolic){const rel=this.typed.filter(x=>typingPair(x.key,key));this.typed.push({key,at:now});if(rel.length>=2){const longest=[key,...rel.map(x=>x.key)].sort((p,q)=>undouble(q).length-undouble(p).length||q.length-p.length)[0];this.items=this.items.filter(x=>!(x.key!==longest&&typingPair(x.key,longest)));if(key!==longest)continue;}}
   if(!key||key.length<2||key.length>40||!(japanese(line)||symbolic)||skip.has(key)||plain(dialogue).includes(key)&&key.length>6)continue;
   /* kept narrow so a real choice is never dropped: a choice can be a character's name (route choices), so only a
      bracketed lone name counts as a speaker; an earlier line only when it is quoted dialogue */
   /* 2026-11-13 (ファタモルガーナの館: a stream glued the maid's last line to the options) text already read in a recent dialogue line is not an option */if(key.length>6&&this.lines.some(l=>l!==key&&l.includes(key)))continue;
   if(NAME.test(key)){this.names.add(key.slice(1,-1));continue;}/* a bracketed name teaches the name too */
   if(/^[「『]/.test(key)&&this.lines.includes(key)||partOf(line,dialogue||this.dialogue))continue;
   /* 2026-11-19 a piece with an opening or closing bracket left unmatched is a cut piece of a longer text (a stage note split at ／) */if(!balanced(line))continue;{const nm=require('./line-once.js').nameStack(key);if(nm){this.names.add(nm);continue;}}/* names glued while skipping (美亜美亜…血塗れの男血塗れの男…) are names, not options */
   /* 2026-11-15 a per-glyph stream's typewriter dump (「公公園公園で公園での…」, growing prefixes glued) is no option */if(require('./language-tracks.cjs').typedOut(line))continue;
   if(/^[\x00-\x7f]+$/.test(line)||/[{}<>\\\/=_]|\.(png|ogg|wav|bmp|txt|ks|ybn)$/i.test(line))continue;
   const old=this.items.find(x=>x.key===key);if(old){old.at=now;continue;}
   this.items.push({key,text:line,at:now,doubled:doubled&&key.length>=6,symbolic});added.push(line);
  }
  this.unglue();
  if(this.items.length>12)this.items.splice(0,this.items.length-12);
  return added;
 }
 /* a candidate that is other candidates glued together (with nothing else) is the whole list: it gives the order and goes;
    one that begins or ends with another candidate leaves the rest as a candidate of its own */
 unglue(){for(let pass=0;pass<4;pass++){let changed=false;
   for(const x of [...this.items]){const others=this.items.filter(o=>o!==x&&o.key.length>=2&&o.key.length<x.key.length).sort((a,b)=>b.key.length-a.key.length);if(!others.length)continue;
    let rest=x.key,seq=[];while(rest){const o=others.find(o=>rest.startsWith(o.key));if(!o)break;seq.push(o.key);rest=rest.slice(o.key.length);}
    if(!rest&&seq.length>=2){if(!this.order||this.order.length<seq.length)this.order=seq;this.items.splice(this.items.indexOf(x),1);changed=true;continue;}
    /* cut off other candidates and recent dialogue lines glued at either end; a short candidate (a name, 「アトリ」)
       never cuts: only an option of 4 or more characters, or a dialogue line of 6 or more */
    const cutters=[...others.filter(o=>o.key.length>=4).map(o=>o.key),...this.lines.filter(l=>l.length>=6&&l!==x.key)].sort((a,b)=>b.length-a.length);
    let left=x.key;for(let k=0;k<8;k++){const before=left;left=left.replace(/^[。、，．！？!?]+/,'');const h=cutters.find(c=>c.length<left.length&&left.startsWith(c));if(h)left=left.slice(h.length);else{const t=cutters.find(c=>c.length<left.length&&left.endsWith(c));if(t)left=left.slice(0,left.length-t.length);}if(left===before)break;}
    if(left!==x.key&&(left.length>=4&&japanese(left)||SYMBOLIC.test(left))&&!(left.length>6&&this.lines.some(l=>l.includes(left)))){this.items.splice(this.items.indexOf(x),1);if(!this.items.some(o=>o.key===left))this.items.push({key:left,text:left,at:x.at,doubled:false,symbolic:SYMBOLIC.test(left)});changed=true;}
    else if(left!==x.key&&(left.length<2||this.lines.some(l=>l.includes(left)))){/* only dialogue lines glued together */this.items.splice(this.items.indexOf(x),1);changed=true;}}
  if(!changed)break;}}
 onlyNames(key){const names=[...this.names,...(this.extraNames?.()||[])].filter(n=>n.length>=2).sort((a,b)=>b.length-a.length);if(!names.length)return false;let rest=key;while(rest){const n=names.find(n=>rest.startsWith(n));if(!n)return false;rest=rest.slice(n.length);}return true;}
 // Siglus emits /A, ABA/ and AB on adjacent streams for the same two-row menu.
 noteSiglusFrame(raw){
  const text=String(raw||'').trim(), now=this.now();
  if(!text||text.length>180)return;
  this.siglusFrames=(this.siglusFrames||[]).filter(f=>now-f.at<1000).slice(-23);
  this.siglusFrames.push({text,at:now});
 }
 siglusOptions(){
  const frames=new Set((this.siglusFrames||[]).filter(f=>this.now()-f.at<1500).map(f=>f.text));
  for(const frame of frames){
   if(!frame.startsWith('／'))continue;
   const first=frame.slice(1);
   if(!first||first.includes('／'))continue;
   for(const pair of frames){
    if(!pair.startsWith(first)||pair.length<=first.length||!frames.has(pair+first+'／'))continue;
    const second=pair.slice(first.length);
    if(first!==second&&japanese(second)&&!/[／【】]/.test(second))return [first,second];
   }
  }
  return null;
 }
 options(){
  const siglus=this.siglusOptions();if(siglus)return siglus;
  /* one candidate is enough when the frame came twice in one string (「AB AB」): AB holds the options, OCR cuts it at the rows */
  if(this.items.length===1&&this.items[0].doubled)return [this.items[0].text];
  /* 2026-11-13 (CLANNAD 「朋也」「春原春原朋也」 next to its two options): speaker names, alone or run together, go when two or more
     other options remain; a screen of names only is a route choice and stays */
  let items=this.items;{const other=items.filter(x=>!this.onlyNames(x.key));if(other.length>=2)items=other;}
  /* 2026-11-26 (#1118, 死に逝く君、館に芽吹く憎悪: 「男男」 next to the name plate 「血塗れの男」): one glyph drawn twice that ends another
     candidate of the same burst is the last frame of that one being drawn glyph by glyph, not an option (「ママ」「パパ」 end nothing).
     Only with evidence of that drawing: the same stream sent the other candidate drawn twice back to back (Codex #1198: 「いい」 next to
     「よくない」 is a real choice). A two-glyph plate counts too (integration live test: 「亜亜」 beside 「美亜」, drawn 「美亜美亜」, went to OCR and was found) */
  items=items.filter(x=>{const c=[...x.key];return !(c.length===2&&c[0]===c[1]&&items.some(o=>o!==x&&o.key.length>=2&&o.key!==x.key&&o.key.endsWith(c[0])&&this.drawnTwice?.has(o.key)));});
  if(items.length<2||items.length>8)return null;
  /* the dialogue kept typing after the first candidate arrived: these were pieces of it, not a choice screen */
  const first=Math.min(...items.map(x=>x.at));if(this.grewAt&&this.grewAt>=first&&items.every(x=>bare(x.text).length<=3))return null;
  if(items.every(x=>x.symbolic))return null;
  const order=this.order||[],rank=x=>{const i=order.indexOf(x.key);return i<0?order.length+items.indexOf(x):i;};
  return items.slice().sort((a,b)=>rank(a)-rank(b)).map(x=>x.text);}
 /* keep: candidates younger than this many ms survive (the choices often arrive in the same instant as the line before them) */
 /* 2026-11-26 (#1118, owner, 死に逝く君、館に芽吹く憎悪: the side stream's 「X…」　「X…」　 frame came 4 ms before the dialogue line 「X……」, the
    copies differ only in the ellipsis, so the kept candidate became an "option" next to the name plate and OCR found both: the game's own
    line was annotated as a choice and the hide let go). The line's copy is told by its letters (punctuation and ellipses ignored) or as a
    quoted piece of it; the name plate of the same moment (the line's speaker) is no option either. */
 sameLine(x,line){const l=plain(line);if(!l)return false;if(x.key===l||x.key.length>6&&l.includes(x.key))return true;const a=bare(x.text),b=bare(line);return a.length>=4&&a===b||partOf(x.text,line);}
 reset(keep=0,line=''){if(!keep)this.siglusFrames=[];const now=this.now(),sp=plain(line)?this.speakerNow||'':'';this.items=keep>0?this.items.filter(x=>now-x.at<keep&&!this.sameLine(x,line)&&!(sp&&x.key===sp)):[];/* the line itself, sent on a side stream a moment earlier, is not kept */if(!this.items.length)this.order=null;this.active=false;}
}
/* OCR boxes -> the boxes drawn. Boxes that cover one another keep the shorter text (a glued list over its own options).
   When the options' order is known (a separated list) and two or more were found on evenly spaced rows, a missed option
   between or beside them (OCR misread its row, Summer Pockets 「傷ついた渡り鳥」) is placed on its row of the same column. */
function placeChoices(items,options,missed,order){
 const area=b=>Math.max(0,b.x1-b.x0)*Math.max(0,b.y1-b.y0),cover=(a,b)=>{const w=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),h=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);return w>0&&h>0?w*h/Math.min(area(a),area(b)):0;};
 const kept=[];for(const it of items.slice().sort((a,b)=>plain(a.text).length-plain(b.text).length)){if(!kept.some(k=>cover(k,it)>0.6))kept.push(it);}
 const list=Array.isArray(order)&&order.length>=2?order:null;
 if(list&&kept.length>=2){const idx=it=>list.indexOf(plain(it.text));const known=kept.filter(it=>idx(it)>=0).sort((a,b)=>idx(a)-idx(b));
  if(known.length>=2){const c=it=>(it.y0+it.y1)/2,a=known[0],z=known[known.length-1],step=(c(z)-c(a))/(idx(z)-idx(a));
   const even=step>0&&known.every(it=>Math.abs(c(it)-(c(a)+(idx(it)-idx(a))*step))<step*0.25),h=known.reduce((s,it)=>s+it.y1-it.y0,0)/known.length,cx=known.reduce((s,it)=>s+(it.x0+it.x1)/2,0)/known.length;
   if(even)for(const text of missed){const i=list.indexOf(plain(text));if(i<0||SYMBOL_OPTION.test(plain(text))||kept.some(k=>idx(k)===i))continue;const y=c(a)+(i-idx(a))*step,w=Math.max(...known.map(it=>it.x1-it.x0))*Math.min(1.2,Math.max(0.5,plain(text).length/Math.max(1,...known.map(it=>plain(it.text).length))));
    if(y-h/2<0)continue;kept.push({text,x0:Math.round(cx-w/2),y0:Math.round(y-h/2),x1:Math.round(cx+w/2),y1:Math.round(y+h/2),placed:true});}}}
 kept.sort((a,b)=>a.y0-b.y0||a.x0-b.x0);
 /* rows stacked in a text box overlap a little in OCR (CLANNAD 766-806 and 797-846): they meet half way, so no drawn row covers the next */
 for(let i=1;i<kept.length;i++){const a=kept[i-1],b=kept[i];if(b.y0<a.y1&&b.y1>a.y1&&Math.min(a.x1,b.x1)>Math.max(a.x0,b.x0)){const mid=Math.round((a.y1+b.y0)/2);kept[i-1]={...a,y1:mid};kept[i]={...b,y0:mid};}}
 return kept;}
const SYMBOL_OPTION=/^[…‥・ー―－\-.。、\s]{2,}$/;
module.exports={ChoiceCapture,placeChoices,SYMBOL_OPTION};
