'use strict';
/* A 组 ruby 错位 (user 2026-11-24, 「姉の断末魔が耳から離れず、思い出すだけで涙が溢れてきた。」, 读音字偏移): one place found by reading the code
   (guess, the user's case may be another): the game line the capture compositor draws holds the game's own row break and the
   reader's text does not, and the positions were moved onto the game's line as they were, so every reading after the break sat one
   character on. core/compositor-host.cjs counts both without blanks now, as the compositor counts its cells. The compositor is
   off unless MEGULIT_CAPTURE_COMPOSITOR=1. */
const test=require('node:test'),assert=require('node:assert/strict');
process.env.MEGULIT_CAPTURE_COMPOSITOR='1';
const {CompositorHost}=require('../core/compositor-host.cjs');
const {rubyToStripped,strip}=require('../services/capture-compositor.cjs');
const {annotations}=require('../core/furigana.js');

function host(gameLine){
 const sent=[],lines=new Map();
 const fake={available:()=>true,start:()=>true,stop(){},send(){},style(){},hookGlyphDots(){},choices(){},lines,
  annotate:o=>sent.push({id:o.id,ruby:rubyToStripped(o.fullText??lines.get(o.id)?.text??'',o.ruby)})};
 const h=new CompositorHost({make:()=>fake});
 h.configure({textRenderer:'compositor',display:'japanese'},{bound:true,gameHwnd:'1',gameStarted:'a',clientWidth:1280,clientHeight:720});
 h.hook({type:'hookGlyphDots',state:'line',seq:5,text:gameLine});lines.set(5,{text:gameLine});
 return {h,sent};
}
const LINE='姉の断末魔が耳から離れず、思い出すだけで涙が溢れてきた。';
const TOKENS=[['姉','あね'],['の',''],['断末魔','だんまつま'],['が',''],['耳','みみ'],['から',''],['離れ','はなれ'],['ず',''],['、',''],['思い出す','おもいだす'],['だけ',''],['で',''],['涙','なみだ'],['が',''],['溢れ','あふれ'],['て',''],['き',''],['た',''],['。','']].map(([surface,reading])=>({surface,reading}));
const spans=annotations(LINE,TOKENS).map(a=>[a.start,a.end,a.reading]);

test('readings after the game’s own row break stay on their kanji',()=>{
 const {h,sent}=host('姉の断末魔が耳から離れず、\n思い出すだけで涙が溢れてきた。');
 h.ruby(LINE,spans);
 const cells=strip('姉の断末魔が耳から離れず、\n思い出すだけで涙が溢れてきた。').text,got=sent.at(-1).ruby;
 const over=got.map(([s,e,r])=>[...cells].slice(s,e).join('')+':'+r);
 assert.deepEqual(over,['姉:あね','断末魔:だんまつま','耳:みみ','離:はな','思:おも','出:だ','涙:なみだ','溢:あふ']);
});

test('a speaker before the reader’s text in the game’s line still shifts the readings onto it',()=>{
 const {h,sent}=host('？？\n姉の断末魔が耳から離れず、思い出すだけで\n涙が溢れてきた。');
 h.ruby(LINE,spans);
 const cells=strip('？？\n姉の断末魔が耳から離れず、思い出すだけで\n涙が溢れてきた。').text;
 assert.deepEqual(sent.at(-1).ruby.map(([s,e,r])=>[...cells].slice(s,e).join('')+':'+r).slice(-2),['涙:なみだ','溢:あふ']);
});
