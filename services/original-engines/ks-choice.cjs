// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Menu choices of a KAG script, read from the script's own commands instead of guessed from short captured lines.
// Port of the rules in engine/src/kirikiri/ks.rs (megulit-engine): "[link …]text[endlink]", "[seladd|selbutton|choice|
// button|glink text=…]", and a graphic button that names its option only through the label it jumps to
// ("[button graphic=… target=*手を伸ばした]": a label holding Japanese is the option, an ASCII one is a system button).
// Consecutive options form one set; the set ends at "[s]" or at a page clear ([cm] [er] [ct]) and at the end of the script.
// It only looks; the callers keep their own text extraction, so their lines stay exactly as they were.
const JA=/[぀-ヿ一-鿿々ー]/;
const TAG=/\[\[|\[((?:[^\]"']|"[^"]*"|'[^']*')*)\]/g,ATTR=/([^\s=\]]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]*))/g;
const OPTION=new Set(['seladd','selbutton','choice','button','glink']),END=new Set(['s','cm','er','ct']);
function attrsOf(body){const out={};for(const m of body.matchAll(ATTR))out[m[1].toLowerCase()]=m[2]??m[3]??m[4]??'';return out;}
function choiceScan(){
 const st={opts:[],link:null,stop:false};
 return {
  get stop(){return st.stop;},
  // One physical line (a "@cmd" line is fed as "[cmd]"); text between link tags is collected, other tags are dropped.
  feed(line){let at=0;const add=s=>{if(st.link!==null)st.link+=s.replace(/\[\[/g,'[');};
   for(const m of String(line).matchAll(TAG)){add(line.slice(at,m.index));at=m.index+m[0].length;
    if(m[0]==='[[')continue;const body=m[1],name=(body.match(/^\s*([^\s=]+)/)?.[1]||'').toLowerCase();
    if(name==='link')st.link='';
    else if(name==='endlink'){if(st.link!==null){const t=st.link.trim();if(t)st.opts.push(t);st.link=null;}}
    else if(OPTION.has(name)){const a=attrsOf(body),label=(a.target||'').replace(/^\*+/,''),t=(a.text!==undefined?a.text:JA.test(label)?label:'').trim();if(t)st.opts.push(t);}
    else if(END.has(name))st.stop=true;
    // a bare Japanese tag is a macro that prints that word ([輝夜], [漢字'よみ]); inside a link it is part of the text
    else if(st.link!==null){const w=body.match(/^([぀-ヿ一-鿿々ー]+)(?:ruby|'.*)?$/);if(w)st.link+=w[1];}}
   add(String(line).slice(at));},
  // The finished set (or null), resetting the end flag; the caller says where in its lines the set sits.
  take(){st.stop=false;st.link=null;if(!st.opts.length)return null;const o=st.opts;st.opts=[];return o;},
 };
}
module.exports={choiceScan};
