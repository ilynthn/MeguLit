/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Anki review HUD: default layout (the user's 1920x1080 sketch: word on top, a wide reading/meaning band, the example
   with its translation, the screenshot large in the middle, Next at the bottom), the look settings, and the checks that
   keep whatever comes back from storage usable. Classic script shared by the page, the card frame and the tests. */
(function(root){
 'use strict';
 const KEY='megulit-anki-hud';
 const LAYOUT={
  progress:{x:1.5,y:1.5,w:22,h:5},
  word:{x:20,y:4,w:60,h:12},
  info:{x:5,y:16.5,w:90,h:10},
  example:{x:8,y:27,w:84,h:15},
  shot:{x:17,y:43,w:66,h:43},
  card:{x:8,y:8,w:84,h:77},
  controls:{x:22,y:87.5,w:56,h:10}
 };
 /* (user 2026-11-13) four ready layouts in the spirit of FF14's HUD presets; each can still be fine-tuned */
 const PRESETS={
  classic:LAYOUT,
  split:{progress:{x:2,y:1.5,w:30,h:5},shot:{x:2.5,y:9,w:52,h:74},word:{x:58,y:10,w:39,h:15},info:{x:58,y:27,w:39,h:12},example:{x:58,y:42,w:39,h:24},card:{x:58,y:9,w:39,h:74},controls:{x:58,y:86,w:39,h:10}},
  subtitle:{progress:{x:78,y:1.5,w:20,h:4.5},shot:{x:6,y:5,w:88,h:62},word:{x:6,y:69,w:34,h:11},info:{x:41,y:70,w:53,h:9},example:{x:6,y:80,w:88,h:9.5},card:{x:10,y:58,w:80,h:30},controls:{x:30,y:90.5,w:40,h:8}},
  minimal:{progress:{x:40,y:2,w:20,h:4},word:{x:10,y:16,w:80,h:30},info:{x:16,y:48,w:68,h:10},example:{x:12,y:60,w:76,h:13},shot:{x:79,y:76,w:19,h:19},card:{x:10,y:10,w:80,h:75},controls:{x:30,y:87,w:40,h:9}}
 };
 const SNAP={mode:'free',grid:24};
 const FONTS_JA=['Yu Mincho','Yu Gothic UI','Meiryo','MS Mincho','MS Gothic','Noto Serif JP','Noto Sans JP','BIZ UDPMincho','BIZ UDPGothic','UD Digi Kyokasho N-R'];
 const FONTS_ZH=['Microsoft YaHei UI','SimSun','KaiTi','FangSong','DengXian','Noto Sans SC','Noto Serif SC','Source Han Sans SC','LXGW WenKai'];
 const STYLE={jaFont:'',zhFont:'',size:{word:64,info:28,example:30,card:22,controls:16},color:{word:'#f6e7d8',text:'#ece4dc',dim:'#a99e97',accent:'#f0883e'},
  bg:{mode:'none',color:'#0d0a0c',image:'',blur:0,dim:35},shadow:true};
 const BG_MODES=['none','color','game','shot','image'];
 const clamp=(v,lo,hi,d)=>{v=Number(v);return Number.isFinite(v)?Math.min(hi,Math.max(lo,Math.round(v))):d;};
 const hex=(v,d)=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v).toLowerCase():d;
 /* Only a plain font family name: it goes into CSS, so quotes, semicolons and braces are refused */
 const font=v=>{const s=String(v||'').trim();return s.length<=80&&/^[\p{L}\p{N} _\-.]*$/u.test(s)?s:'';};
 const image=v=>/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(v||''))&&String(v).length<6e6?String(v):'';
 function cleanStyle(s){
  s=s&&typeof s==='object'?s:{};const d=STYLE,size=s.size||{},color=s.color||{},bg=s.bg||{};
  return {jaFont:font(s.jaFont),zhFont:font(s.zhFont),
   size:{word:clamp(size.word,20,160,d.size.word),info:clamp(size.info,12,80,d.size.info),example:clamp(size.example,12,80,d.size.example),card:clamp(size.card,12,60,d.size.card),controls:clamp(size.controls,11,32,d.size.controls)},
   color:{word:hex(color.word,d.color.word),text:hex(color.text,d.color.text),dim:hex(color.dim,d.color.dim),accent:hex(color.accent,d.color.accent)},
   bg:{mode:BG_MODES.includes(bg.mode)?bg.mode:d.bg.mode,color:hex(bg.color,d.bg.color),image:image(bg.image),blur:clamp(bg.blur,0,40,d.bg.blur),dim:clamp(bg.dim,0,90,d.bg.dim)},
   shadow:s.shadow!==false};
 }
 function cleanLayout(l){
  const H=root.MeguHud||(typeof require==='function'?require('./hud-drag.js'):null);return H.mergeLayout(l&&typeof l==='object'?l:{},LAYOUT);
 }
 function cleanSnap(s){s=s&&typeof s==='object'?s:{};return {mode:s.mode==='grid'?'grid':'free',grid:clamp(s.grid,8,96,SNAP.grid)};}
 /* the user's own saved layouts: at most 6, each with a short name */
 function cleanSaved(list){return (Array.isArray(list)?list:[]).filter(x=>x&&typeof x==='object').slice(0,6).map((x,i)=>({name:String(x.name||'').replace(/[<>]/g,'').trim().slice(0,24)||'#'+(i+1),layout:cleanLayout(x.layout)}));}
 function preset(name){return cleanLayout(PRESETS[name]||LAYOUT);}
 function load(storage){let raw={};try{raw=JSON.parse(storage.getItem(KEY))||{};}catch{}return {layout:cleanLayout(raw.layout),style:cleanStyle(raw.style),snap:cleanSnap(raw.snap),saved:cleanSaved(raw.saved)};}
 function save(storage,state){try{storage.setItem(KEY,JSON.stringify({layout:cleanLayout(state.layout),style:cleanStyle(state.style),snap:cleanSnap(state.snap),saved:cleanSaved(state.saved)}));return true;}catch{return false;}}
 /* CSS custom properties for a style (the card frame and the page both read them) */
 function cssVars(style){
  const s=cleanStyle(style),q=f=>f?'"'+f+'",':'';
  return {'--hud-ja-font':q(s.jaFont)+'"Yu Mincho","Noto Serif JP","Hiragino Mincho ProN",serif','--hud-zh-font':q(s.zhFont)+'"Microsoft YaHei UI","Noto Sans SC",sans-serif',
   '--hud-size-word':s.size.word+'px','--hud-size-info':s.size.info+'px','--hud-size-example':s.size.example+'px','--hud-size-card':s.size.card+'px','--hud-size-controls':s.size.controls+'px',
   '--hud-word':s.color.word,'--hud-text':s.color.text,'--hud-dim':s.color.dim,'--hud-accent':s.color.accent,'--hud-shadow':s.shadow?'0 2px 10px rgba(0,0,0,.75),0 0 2px rgba(0,0,0,.9)':'none'};
 }
 /* Pick the review action a key stands for; pure so the tests can drive it */
 function keyAction(key,{answerShown,ratings=[],editing=false,immersive=false}={}){
  if(key==='Escape')return editing?'layout':immersive?'fullscreen':null;
  if(key==='f'||key==='F')return 'fullscreen';if(key==='l'||key==='L')return 'layout';if(key==='r'||key==='R')return 'replay';
  if(editing)return null;
  if(/^[1-4]$/.test(key))return answerShown&&ratings.includes(Number(key))?'rate-'+key:null;
  if(key===' '||key==='Enter')return answerShown?(ratings.includes(3)?'rate-3':'primary'):'primary';
  return null;
 }
 const api={keyAction,KEY,LAYOUT,PRESETS,SNAP,cleanSnap,cleanSaved,preset,STYLE,FONTS_JA,FONTS_ZH,BG_MODES,cleanStyle,cleanLayout,load,save,cssVars};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MeguAnkiHud=api;
})(globalThis);
