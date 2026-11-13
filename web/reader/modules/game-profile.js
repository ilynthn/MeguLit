// SPDX-License-Identifier: GPL-3.0-or-later
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TomeGameProfile=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const textKeys=['choiceFont','choiceSelectedColor','choiceUnselectedColor','autoGameStyle','typewriter','typewriterSpeed','style','display','japaneseSize','translationSize','japaneseSpacingPx','chineseSpacingPx','lineHeight','lineHeightMode','translationLineHeight','gap','translationWidth','textColor','readTextColor','speechTextColor','narrationTextColor','textGradient','textGradientTop','textGradientBottom','textGradientStart','readTextGradientStart','readTextGradient','readTextGradientTop','readTextGradientBottom','shadow','japaneseFont','japaneseFontSource','chineseFont','rubyFont','englishFont','englishEnabled','englishSize','englishSpacingPx','englishBold','englishOutline','englishOutlineColor','englishOutlineWidth','japaneseBold','chineseBold','japaneseOutline','chineseOutline','japaneseOutlineColor','chineseOutlineColor','japaneseOutlineWidth','chineseOutlineWidth','rubyOutline','rubyOutlineColor','rubyOutlineWidth','rubyScale','rubyOffsetX','rubyOffsetY','rubyRowOffsets','rubyRowOffsetsX','furigana','autoScale','sizeSource'];
 const positionKeys=['x','y','width','height','paddingX','paddingY','livePosition'];
 // 内嵌 panel: original-text hiding, mask/scan, Hook switches and the wait marker are per work too (user, 2026-11-02).
 const embedKeys=['maskMode','embedTranslation','maskModeSource','maskStyle','maskColor','maskPadding','blurRadius','fastMask','scanAuto','scanX','scanY','scanWidth','scanHeight','hideWaitMarker','relocateWaitMarker','waitCoverStyle','hookProfile','hookHide','hookAutoStart','hookFast'];
 // 'base' = text+position (they have defaults); 'all' adds embed, which falls back to the current value, not a default.
 const keysOf=kind=>kind==='text'?textKeys:kind==='position'?positionKeys:kind==='embed'?embedKeys:kind==='base'?[...textKeys,...positionKeys]:[...textKeys,...positionKeys,...embedKeys];
 function pick(p,kind='all'){const out={};for(const k of keysOf(kind))if(p&&p[k]!==undefined&&['number','boolean','string'].includes(typeof p[k]))out[k]=p[k];return out;}
 /* E550 (user, ファタモルガーナの館: calibration drew MS Gothic although the game font ＭＳ Ｐ明朝 was detected). Saved or default
    profile values that follow the game font (japaneseFontSource is not 'user') carry the font of the time they were saved, or the
    built-in default; applying them replaced the font the engine reports now. Only a font the user picked travels with a profile. */
 function followFont(p){if(!p||typeof p!=='object'||p.japaneseFontSource==='user')return p;const out={...p};delete out.japaneseFont;delete out.japaneseFontSource;return out;}
 function map(value){if(value===null)return null;if(!value||typeof value!=='object'||![value.s,value.bx,value.by,value.dx,value.dy,value.cw,value.ch].every(Number.isFinite)||value.s<=.1||value.s>=10||value.cw<=0||value.ch<=0||['bx','by','dx','dy'].some(k=>Math.abs(value[k])>20000))return undefined;const out={};for(const key of ['engine','s','bx','by','dx','dy','cw','ch'])if(key==='engine'?typeof value[key]==='string'&&value[key].length<40:Number.isFinite(value[key]))out[key]=value[key];return out;}
 function version(value){if(!value||!Number.isFinite(value.savedAt)||value.savedAt<=0)return null;const m=map(value.positionMap);return {id:String(value.id||value.savedAt).slice(0,80),savedAt:value.savedAt,prefs:pick(value.prefs),positionMap:m===undefined?null:m};}
 function normalize(entry){if(!entry||!entry.prefs)return null;const prefs=pick(entry.prefs);if('lineHeight' in prefs&&prefs.lineHeightMode!=='offset'){prefs.lineHeight=Number(prefs.lineHeight)-(Number(prefs.lineHeight)>=0?1.95:0);prefs.lineHeightMode='offset';}const textSavedAt=entry.textSavedAt??(textKeys.some(k=>k in prefs)?entry.savedAt:0),positionSavedAt=entry.positionSavedAt??(positionKeys.some(k=>k in prefs)?entry.savedAt:0);const history=Array.isArray(entry.history)?entry.history.map(version).filter(Boolean).sort((a,b)=>b.savedAt-a.savedAt).slice(0,7):[];return {...entry,prefs,textSavedAt,positionSavedAt,history};}
 const copy=v=>v==null?null:JSON.parse(JSON.stringify(v));
 const canonical=v=>JSON.stringify(Object.fromEntries(Object.entries(v||{}).sort(([a],[b])=>a.localeCompare(b))));
 class Session{
  constructor(){this.key='';this.name='';this.savedAt=0;this.history=[];this.base={prefs:{},map:null};}
  load(key,name,prefs,positionMap,savedAt=0,history=[]){this.key=key||'';this.name=name||'';this.savedAt=savedAt||0;this.history=history.slice(0,7).map(version).filter(Boolean);this.base={prefs:copy(pick(prefs)),map:map(positionMap)||null};}
  dirty(prefs,positionMap){return canonical(pick(prefs))!==canonical(this.base.prefs)||canonical(map(positionMap)||{})!==canonical(this.base.map||{});}
  cancel(){return copy(this.base);}
  select(id){const h=this.history.find(v=>v.id===id);return h?{prefs:copy(h.prefs),map:copy(h.positionMap)}:null;}
  saved(key,prefs,positionMap,at,history){if(key!==this.key)return false;this.load(key,this.name,prefs,positionMap,at,history);return true;}
 }
 return {textKeys,positionKeys,embedKeys,pick,followFont,normalize,map,version,Session};
});
