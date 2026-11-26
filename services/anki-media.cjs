'use strict';
const sounds=value=>[...String(value||'').matchAll(/\[sound:([^\]\r\n]+)\]/g)].map(m=>m[1]);
const TTS_RE=/\[anki:tts|\{\{tts:/i,AUDIO_RE=/\[sound:|\[anki:tts|\{\{tts:/i;
const SAFE_FILTERS=new Set(['text','furigana','kanji','kana']),META_FILTERS=new Set(['hint','type','cloze','cloze-only','nc','edit']);
// Enumerate audio in template order, not note-field order. Ambiguous, TTS, or unknown filter audio keeps the native replay fallback.
function templateSounds(template,fields){
 const stack=[{active:true,uncertain:false}],parts=[];let last=0,safe=true;
 const text=String(template||'');
 for(const m of text.matchAll(/\{\{([^{}]+)\}\}/g)){
  const top=stack.at(-1),chunk=text.slice(last,m.index);last=m.index+m[0].length;
  if(top.active)parts.push(chunk);else if(top.uncertain&&AUDIO_RE.test(chunk))safe=false;
  const tag=m[1].trim(),kind=tag[0],name=tag.slice(1).trim();
  if(kind==='#'||kind==='^'){
   if(Object.hasOwn(fields,name)){const present=!!String(fields[name]?.value??'').trim(),on=kind==='#'?present:!present;stack.push({name,active:top.active&&on,uncertain:top.uncertain&&on});}
   else stack.push({name,active:false,uncertain:top.active||top.uncertain});
  }else if(kind==='/'){if(stack.length===1||top.name!==name)safe=false;else stack.pop();}
  else if((top.active||top.uncertain)&&tag!=='FrontSide'){
   const bits=tag.split(':').map(s=>s.trim()),field=bits.pop();
   if(bits.some(f=>!SAFE_FILTERS.has(f)&&!META_FILTERS.has(f))){safe=false;continue;}
   const hasField=Object.hasOwn(fields,field),val=hasField?String(fields[field]?.value??''):'';
   if(bits.some(f=>META_FILTERS.has(f))){if(!hasField||AUDIO_RE.test(val))safe=false;continue;}
   if(top.active)parts.push(val);else if(AUDIO_RE.test(val))safe=false;
  }
 }
 const tail=text.slice(last),top=stack.at(-1);
 if(top.active)parts.push(tail);
 if(stack.length!==1)safe=false;
 const rendered=parts.join('');if(TTS_RE.test(rendered))safe=false;
 return {safe,names:sounds(rendered)};
}
function playMap(card,templates,html){
 /* (user 2026-11-12: an example's play button failed in practice) cardsInfo gives no template name, only its ord: the
    model's templates come back in that order */
 const named=templates?.[typeof card.template==='string'?card.template:card.template?.name],template=named||(Number.isInteger(card.ord)&&templates?Object.values(templates)[card.ord]:null);if(!template)return new Map();
 const result=new Map();for(const[side,key]of [['q','Front'],['a','Back']]){
  const markers=[...html.matchAll(new RegExp('\\[anki:play:'+side+':(\\d+)\\]','g'))].map(m=>Number(m[1]));if(!markers.length)continue;
  const audio=templateSounds(template[key],card.fields||{});if(!audio.safe||audio.names.length!==Math.max(...markers)+1)continue;
  for(const index of markers)result.set(side+':'+index,audio.names[index]);
 }return result;
}
const icon='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9 5v14l11-7z"/></svg>';
function player(src,name,override){
 const channel=override||(/^tomoyo_g_/i.test(name)?'game':/^tomoyo_s_/i.test(name)?'sentence':/^tomoyo_[a-f0-9]+_[a-f0-9]+\.wav$/i.test(name)?'word':'');
 return '<span data-anki-media><button type="button" class="tome-anki-play" data-anki-play aria-label="Play audio">'+icon+'</button><audio controls preload="none" data-anki-channel="'+channel+'" src="'+src+'"></audio></span>';
}
function replay(){return '<button type="button" class="tome-anki-play" data-anki-replay aria-label="Replay card audio">'+icon+'</button>';}
module.exports={sounds,templateSounds,playMap,player,replay};
