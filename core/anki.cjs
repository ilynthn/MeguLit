'use strict';
const {createHash}=require('node:crypto'),{cleanV4}=require('./v4-config.cjs');
const fields=['Word','Pitch','PartOfSpeech','Meaning','Sentence','Audio'];
const extraFields=['SentenceFurigana','SentenceTranslation','SentenceAudio','Screenshot','WordReading','Game','TranslationSource'];
const CIRCLED='⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
// Answer-side reading rule (user, 2026-11-09): words with kanji get their reading in hiragana on its own line;
// kana-only words need none. Dictionary readings may arrive in katakana.
const KANJI=/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ]/;
const hiragana=s=>String(s||'').replace(/[\u30a1-\u30f4]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const answerReading=(word,reading)=>KANJI.test(String(word||''))?hiragana(reading):'';
const circled=list=>(list||[]).filter(n=>Number.isInteger(n)&&n>=0&&n<=20).map(n=>CIRCLED[n]).join('');
// Card design: word + pitch on the front with the context sentence dimmed; back adds reading, meaning,
// the sentence with furigana and the word highlighted, its translation and audio.
const FRONT=`<div class="tm-card">
<div class="tm-head"><a class="tm-search" href="https://www.weblio.jp/content/{{text:Word}}" title="Weblio">&#128269;</a><span class="tm-word">{{Word}}</span><sup class="tm-pitch">{{Pitch}}</sup></div>
{{#Sentence}}<div class="tm-sec"><div class="tm-ex tm-dim"><span class="tm-tag">[例]</span>{{Sentence}}</div></div>{{/Sentence}}
</div>`;
const BACK=`<div class="tm-card">
<div class="tm-head"><a class="tm-search" href="https://www.weblio.jp/content/{{text:Word}}" title="Weblio">&#128269;</a><span class="tm-word">{{Word}}</span><sup class="tm-pitch">{{Pitch}}</sup><span class="tm-play">{{Audio}}</span></div>
<div class="tm-sec">
{{#WordReading}}<div class="tm-reading">{{WordReading}}<sup class="tm-pitch">{{Pitch}}</sup></div>{{/WordReading}}
<div class="tm-mean">{{#PartOfSpeech}}<span class="tm-pos">[{{PartOfSpeech}}]</span>{{/PartOfSpeech}}{{Meaning}}</div></div>
{{#Sentence}}<div class="tm-sec"><div class="tm-ex"><span class="tm-tag">[例]</span><span class="tm-jp">{{#SentenceFurigana}}{{SentenceFurigana}}{{/SentenceFurigana}}{{^SentenceFurigana}}{{Sentence}}{{/SentenceFurigana}}</span><span class="tm-play">{{SentenceAudio}}</span></div>
{{#SentenceTranslation}}<div class="tm-tr"><span class="tm-tag">[訳]</span>{{SentenceTranslation}}</div>{{/SentenceTranslation}}{{#Game}}<div class="tm-src">{{Game}}{{#TranslationSource}} · {{TranslationSource}}{{/TranslationSource}}</div>{{/Game}}</div>{{/Sentence}}
{{#Screenshot}}<div class="tm-sec tm-shot">{{Screenshot}}</div>{{/Screenshot}}
</div>`;
const CSS=`.card{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","Source Han Serif",serif;font-size:22px;text-align:left;color:#222;background:#fafafa}
.card.nightMode,.nightMode .card{color:#e8e8e8;background:#2c2c2c}
.tm-card{max-width:680px;margin:18px auto;border:1px solid rgba(140,140,140,.35);border-radius:10px;overflow:hidden}
.tm-head{position:relative;display:flex;align-items:center;justify-content:center;padding:26px 64px;min-height:44px}
.tm-word{font-size:42px;letter-spacing:.04em}
.tm-pitch{font-size:.55em;margin-left:2px;vertical-align:super;opacity:.9}
.tm-head .tm-pitch{font-size:22px}
.tm-search{position:absolute;left:16px;top:50%;transform:translateY(-50%);text-decoration:none;font-size:22px}
.tm-head .tm-play{position:absolute;right:16px;top:50%;transform:translateY(-50%)}
.tm-sec{border-top:1px solid rgba(140,140,140,.35);padding:14px 18px}
.tm-reading{font-size:30px;margin-bottom:8px}
.tm-mean{font-size:21px;line-height:1.6}
.tm-pos{margin-right:6px}
.tm-ex{display:flex;align-items:center;gap:6px;font-size:24px;line-height:2.1;margin:2px 0}
.tm-ex .tm-jp{flex:1}
.tm-dim{color:#8c8c8c}
.tm-tag{color:#8c8c8c;margin-right:4px;white-space:nowrap}
.tm-tr{color:#8c8c8c;font-size:21px;line-height:1.7;margin:0 0 6px}
.tm-hl{color:#f0883e;font-weight:600}
.tm-src{color:#8c8c8c;font-size:15px;text-align:right;margin-top:4px}
ruby rt{font-size:.5em;opacity:.85}
.tm-shot img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:6px}
.tm-hl rt{color:#f0883e}
.replay-button{color:inherit}.replay-button svg{width:40px;height:40px}`;
const html=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/\n/g,'<br>');
// Native Anki queues [sound:] tags automatically. MeguLit notes use a
// manual player so showing or grading a card never starts the media.
const audioField=(name,manual)=>manual?'<audio controls preload="none" src="'+name+'"></audio>':'[sound:'+name+']';
class Anki{
 constructor(fetcher=fetch,{mediaDir=''}={}){this.fetch=fetcher;this.pending=new Map();this.mediaDir=mediaDir;}
 async call(config,action,params={}){const c=cleanV4(config);let response;try{response=await this.fetch(c.ankiUrl,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:6,params})});}catch(e){const code=e?.cause?.code||e?.name||'';if(code==='ECONNREFUSED'){/* tell the two causes apart when the add-on folder can be read */const installed=require('./anki-process.cjs').ankiConnectInstalled?.();if(installed===false)throw Error('没装 AnkiConnect 插件：在 Anki 里点 工具 → 插件 → 获取插件，输入代码 2055492159，装完重启 Anki');throw Error('连不上 '+c.ankiUrl+'：Anki 没打开，或没装 AnkiConnect 插件（插件代码 2055492159，装完要重启 Anki）');}if(code==='TimeoutError')throw Error('AnkiConnect 超时：Anki 可能卡在弹窗或同步中');throw Error('连接 AnkiConnect 失败（'+(code||e.message)+'）：检查地址 '+c.ankiUrl);}if(!response.ok)throw Error('AnkiConnect HTTP '+response.status);const b=await response.json();if(b.error)throw Error('AnkiConnect：'+String(b.error).slice(0,200));if(!Object.hasOwn(b,'result'))throw Error('无效的 AnkiConnect 响应');/* keep MeguLit's own copy of the clips it stores, so cards play them without Anki */if(action==='storeMediaFile'&&this.mediaDir)require('./anki-media-cache.cjs').write(this.mediaDir,params.filename,params.data);return b.result;}
 // Card state + review history for every note in the ToMe deck, for the statistics page.
 async stats(config){const c=cleanV4(config),quote=v=>'"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
  const ids=await this.call(c,'findNotes',{query:'deck:'+quote(c.ankiDeck)+' note:'+quote(c.ankiModel)});if(!ids.length)return [];
  const notes=await this.call(c,'notesInfo',{notes:ids.slice(0,5000)}),cardIds=notes.flatMap(n=>n.cards||[]);
  const cards=cardIds.length?await this.call(c,'cardsInfo',{cards:cardIds}):[],byId=new Map(cards.map(x=>[x.cardId,x]));
  const reviews=cardIds.length?await this.call(c,'getReviewsOfCards',{cards:cardIds.map(String)}):{};
  const text=v=>String(v?.value||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').trim();
  const level=x=>{if(!x)return 0;if(x.type===0||x.queue===0)return 0;if(x.type===1||x.type===3||x.queue===1||x.queue===3)return 1;const ivl=Number(x.interval)||0;return ivl>=21?4:ivl>=7?3:2;};
  return notes.map(n=>{const cs=(n.cards||[]).map(id=>byId.get(id)).filter(Boolean);return {noteId:n.noteId,word:text(n.fields?.Word),reading:text(n.fields?.WordReading||n.fields?.Reading),sentence:text(n.fields?.Sentence),status:cs.length?Math.max(...cs.map(level)):0,reviews:(n.cards||[]).flatMap(id=>(reviews[String(id)]||[]).map(r=>Number(r.id)).filter(Number.isFinite))};});
 }
 async status(c){return {version:await this.call(c,'version'),decks:await this.call(c,'deckNames'),models:await this.call(c,'modelNames')};}
 async sync(word,config,audio,extra={}){const c=cleanV4(config);if(!word?.surface||!word?.reading)throw Error('当前词没有确定读音，无法制卡');const id=createHash('sha256').update(JSON.stringify(word.cardKey?[word.cardKey]:[word.base||word.surface,word.reading])).digest('hex'),lock=JSON.stringify([c.ankiUrl,c.ankiDeck,c.ankiModel,id]);if(this.pending.has(lock))return this.pending.get(lock);const job=this.save(word,c,audio,id,extra).finally(()=>this.pending.delete(lock));this.pending.set(lock,job);return job;}
 async prepareModel(config){const c=cleanV4(config),models=await this.call(c,'modelNames'),own=['MeguLit','ToMe','tomoyo_megumin'].includes(c.ankiModel);
  if(!models.includes(c.ankiModel)){if(!own)throw Error('所选笔记类型不存在，请先在 Anki 中创建');await this.call(c,'createModel',{modelName:c.ankiModel,inOrderFields:[...fields,...extraFields],css:CSS,cardTemplates:[{Name:'日本語',Front:FRONT,Back:BACK}]});this.upgraded=true;}
  let available=await this.call(c,'modelFieldNames',{modelName:c.ankiModel});
  if(fields.some(f=>!available.includes(f)))throw Error('笔记类型缺少需要字段：'+fields.join(', '));
  if(own&&!this.upgraded){for(const f of extraFields)if(!available.includes(f)){await this.call(c,'modelFieldAdd',{modelName:c.ankiModel,fieldName:f,index:available.length});available=[...available,f];}const names=await this.call(c,'modelTemplates',{modelName:c.ankiModel}).catch(()=>({}));const tname=Object.keys(names||{})[0]||'日本語';await this.call(c,'updateModelTemplates',{model:{name:c.ankiModel,templates:{[tname]:{Front:FRONT,Back:BACK}}}});await this.call(c,'updateModelStyling',{model:{name:c.ankiModel,css:CSS}});this.upgraded=true;}
  if(own&&available.includes('WordReading')&&!this.readingsFixed){this.readingsFixed=true;this.fixReadings(c).catch(()=>{});}
  return {available,owned:own};
 }
 // Existing MeguLit notes follow the same reading rule: katakana readings become hiragana, kana-only words drop it.
 async fixReadings(c){
  const quote=s=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"',ids=await this.call(c,'findNotes',{query:'note:'+quote(c.ankiModel)});let changed=0;
  for(let i=0;i<ids.length;i+=200){
   for(const n of await this.call(c,'notesInfo',{notes:ids.slice(i,i+200)})){
    const word=String(n.fields?.Word?.value||'').replace(/<[^>]*>/g,''),current=String(n.fields?.WordReading?.value??'');if(!n.fields?.WordReading)continue;
    const want=answerReading(word,current);if(want===current)continue;
    try{await this.call(c,'updateNoteFields',{note:{id:n.noteId,fields:{WordReading:want}}});changed++;}catch{}
   }
  }
  return changed;
 }
 async save(word,c,audio,id,extra={}){const {available,owned}=await this.prepareModel(c);await this.call(c,'createDeck',{deck:c.ankiDeck});
  const quote=s=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"',tag='tomoyo::'+id,found=await this.call(c,'findNotes',{query:'tag:'+tag+' deck:'+quote(c.ankiDeck)+' note:'+quote(c.ankiModel)});if(found.length>1)throw Error('找到多个同步词条，请先在 Anki 中消除重复笔记');
  const values={Word:html(word.base||word.surface),Pitch:circled(word.pitch),PartOfSpeech:html(word.pos),Meaning:html(word.meaning)+(extra.aiNote?.text?'<div class="megulit-ai-note"><br><b>'+(extra.aiNote.kind==='summary'?'AI 归纳义项':'AI 上下文解释')+'</b><br>'+html(extra.aiNote.text)+'</div>':''),Sentence:html(word.sentence),Audio:''};
  if(available.includes('SentenceFurigana'))values.SentenceFurigana=extra.sentenceHtml||'';if(available.includes('SentenceTranslation'))values.SentenceTranslation=html(extra.translation||'');{/* sentence card: game title and where the translation came from (human first) */const f=require('../services/learning-insights.cjs').ankiSentenceFields({translation:extra.translation,translationSource:extra.translationSource,gameTitle:extra.gameTitle},available);if('Game' in f)values.Game=html(f.Game);if('TranslationSource' in f)values.TranslationSource=html(f.TranslationSource);}if(available.includes('SentenceAudio'))values.SentenceAudio='';
  if(available.includes('Screenshot'))values.Screenshot='';
  // E215.6 (user): the answer shows the word's reading under the word, as common decks do.
  if(available.includes('WordReading'))values.WordReading=word.noReading?'':html(answerReading(word.base||word.surface,word.reading));
  // Game window picture taken for this card (answer side).
  if(extra.screenshot&&available.includes('Screenshot')){const name='tomoyo_p_'+createHash('sha256').update(extra.screenshot).digest('hex').slice(0,16)+'.jpg';await this.call(c,'storeMediaFile',{filename:name,data:extra.screenshot});values.Screenshot='<img src="'+name+'">';}
  // The game's own voice for the line when it was recorded, otherwise the synthesized sentence.
  if(extra.sentenceAudio&&available.includes('SentenceAudio')){const name=(extra.gameAudio?'tomoyo_g_':'tomoyo_s_')+createHash('sha256').update(extra.sentenceAudio.data).digest('hex').slice(0,16)+(extra.sentenceAudio.ext||'.wav');await this.call(c,'storeMediaFile',{filename:name,data:extra.sentenceAudio.data});values.SentenceAudio=audioField(name,owned);}
  if(audio){const filename='tomoyo_'+id+'_'+createHash('sha256').update(audio.data).digest('hex').slice(0,12)+'.wav';await this.call(c,'storeMediaFile',{filename,data:audio.data});values.Audio=audioField(filename,owned);}
  if(found.length){if(!audio)delete values.Audio;if(!extra.sentenceAudio)delete values.SentenceAudio;if(!extra.screenshot)delete values.Screenshot;if(!extra.translation){delete values.SentenceTranslation;delete values.TranslationSource;}if(!extra.gameTitle)delete values.Game;await this.call(c,'updateNoteFields',{note:{id:found[0],fields:values}});return {id:found[0],updated:true,screenshotAttached:!!extra.screenshot&&available.includes('Screenshot')};}
  const note=await this.call(c,'addNote',{note:{deckName:c.ankiDeck,modelName:c.ankiModel,fields:values,options:{allowDuplicate:false},tags:['tomoyo_megumin',tag]}});if(!note)throw Error('Anki 未创建笔记');return {id:note,updated:false,screenshotAttached:!!extra.screenshot&&available.includes('Screenshot')};
 }
}
module.exports={Anki,answerReading,hiragana,fields,extraFields,html,circled,FRONT,BACK,CSS};
