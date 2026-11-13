'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {cleanV4}=require('./v4-config.cjs');
const katakana=s=>String(s||'').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+96));
function morae(s){return katakana(s).match(/[ァ-ヴー][ァィゥェォャュョヮ]?/g)||[];}
// Compare the engine's reading with ours, treating long-vowel spellings (ヨー / ヨウ / ヨオ) as equal.
function plainKana(s){let out='';for(const ch of katakana(s).replace(/[^ァ-ヴー]/g,'')){if(ch==='ー'){const v=vowel(out.at(-1));out+=v||'';}else out+=ch;}return out.replace(/([オコソトノホモヨロゴゾドボポョ])ウ/g,'$1オ').replace(/([エケセテネヘメレゲゼデベペ])イ/g,'$1エ');}
function vowel(ch){if(!ch)return '';const rows={ア:'アカサタナハマヤラワガザダバパァャ',イ:'イキシチニヒミリギジヂビピィ',ウ:'ウクスツヌフムユルグズヅブプゥュッ',エ:'エケセテネヘメレゲゼデベペェ',オ:'オコソトノホモヨロヲゴゾドボポォョ'};for(const [v,set]of Object.entries(rows))if(set.includes(ch))return v;return '';}
function sameReading(phrases,reading){const engine=(phrases||[]).flatMap(p=>[...(p.moras||[]),...(p.pause_mora?[p.pause_mora]:[])]).map(m=>m.text||'').join('');return plainKana(engine)===plainKana(reading);}
function accentKana(reading,accent){const m=morae(reading);if(!m.length||!Number.isInteger(accent)||accent<0||accent>m.length)throw Error('UniDic 音调无法可靠对应当前词，请选择确定的读音');m.splice(accent===0?m.length:accent,0,"'");return m.join('');}
function clipKey(word,c,auto,accent){return createHash('sha256').update(JSON.stringify([c.aivisUrl,c.aivisSpeaker,c.aivisSpeed,word.surface,word.reading,auto?'auto':accent,word.ambiguous?'engine-reading':'','unidic-lite-1.0.8-v2',...(word.tuning?[word.tuning]:[])])).digest('hex');}
class Speech{
 constructor(folder,fetcher=fetch){this.folder=path.join(folder,'audio-cache');this.fetch=fetcher;this.pending=new Map();this.chain=Promise.resolve();this.latestPrefetch='';this.explicit=new Set();}
 async api(base,route,options={}){const r=await this.fetch(base+route,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('AivisSpeech 请求失败：HTTP '+r.status);return r;}
 /* 2026-11-14 (user recording: 朗读 stayed grey ~34 s while AivisSpeech cold-started for a clip it already had): a clip in
    the cache needs no engine. Same key as synthesize with the configured speaker; null when it is not cached. */
 cachedClip(word,options){if(!word?.reading&&!word?.surface)return null;const c=cleanV4(options),auto=!(word.pitch?.length===1&&word.reading&&!word.ambiguous);if(!auto)return null;
  const key=clipKey(word,c,true,null),file=path.join(this.folder,key+'.wav');try{return fs.existsSync(file)?{filename:key+'.wav',data:fs.readFileSync(file).toString('base64'),cached:true,autoAccent:true}:null;}catch{return null;}}
 async speakers(options){const c=cleanV4(options);return (await this.api(c.aivisUrl,'/speakers')).json();}
 async synthesize(word,options,{prefetch=false}={}){const c=cleanV4(options);if(!word?.reading&&!word?.surface)throw Error('当前选区没有可朗读的文字');
  // With exactly one UniDic accent, speak it explicitly. Otherwise (phrases, unmatched or ambiguous words) let
  // AivisSpeech estimate the accent itself, but keep the contextual reading from SudachiDict when it differs.
  const auto=!(word.pitch?.length===1&&word.reading&&!word.ambiguous);
  const speakers=await this.speakers(c),styles=speakers.flatMap(s=>s.styles||[]);if(!styles.length)throw Error('AivisSpeech 尚未安装话者模型');if(!styles.some(s=>s.id===c.aivisSpeaker)){if(c.aivisSpeaker!==0)throw Error('所选 AivisSpeech 话者不存在，请重新读取话者');c.aivisSpeaker=styles[0].id;}
  const accent=auto?null:word.pitch[0],pron=auto?'':accentKana(word.reading,accent),key=clipKey(word,c,auto,accent),file=path.join(this.folder,key+'.wav');
  fs.mkdirSync(this.folder,{recursive:true});if(prefetch)this.latestPrefetch=key;else this.explicit.add(key);if(fs.existsSync(file)){this.explicit.delete(key);return {filename:key+'.wav',data:fs.readFileSync(file).toString('base64'),cached:true,autoAccent:auto};}if(this.pending.has(key))return this.pending.get(key);
  // The CPU engine handles one inference at a time. Run requests one by one and drop
  // background prefetches for cards that were already replaced, so a click never waits
  // behind words the reader skipped past.
  const pending=this.chain.then(async()=>{if(prefetch&&this.latestPrefetch!==key&&!this.explicit.has(key))throw Object.assign(Error('已跳过过期的预读'),{superseded:true});const speaker=String(c.aivisSpeaker),query=await(await this.api(c.aivisUrl,'/audio_query?'+new URLSearchParams({text:word.surface||word.reading,speaker}),{method:'POST'})).json();
   // AivisSpeech uses kana as ordinary text, not AquesTalk. Explicit phrases
   // determine the reading and accent; do not assign AquesTalk to query.kana.
   if(!auto)query.accent_phrases=await(await this.api(c.aivisUrl,'/accent_phrases?'+new URLSearchParams({text:pron,speaker,is_kana:'true'}),{method:'POST'})).json();
   else if(word.reading&&!word.ambiguous&&!sameReading(query.accent_phrases,word.reading)){const byKana=await(await this.api(c.aivisUrl,'/audio_query?'+new URLSearchParams({text:katakana(word.reading),speaker}),{method:'POST'})).json();query.accent_phrases=byKana.accent_phrases;}
   query.kana=word.surface||word.reading;query.speedScale=c.aivisSpeed;
   /* 学习模块的发音调校（抑扬、前后留白）；朗读和制卡不传，保持原样 */
   if(word.tuning){const t=word.tuning;if(Number.isFinite(t.intonation))query.intonationScale=t.intonation;if(Number.isFinite(t.pre))query.prePhonemeLength=t.pre;if(Number.isFinite(t.post))query.postPhonemeLength=t.post;}
   const data=Buffer.from(await(await this.api(c.aivisUrl,'/synthesis?speaker='+speaker,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query)})).arrayBuffer());if(data.length<44||data.length>12000000||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE')throw Error('AivisSpeech 返回了无效 WAV');fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);this.prune();return {filename:key+'.wav',data:data.toString('base64'),cached:false,autoAccent:auto};}).finally(()=>{this.pending.delete(key);this.explicit.delete(key);});this.chain=pending.catch(()=>{});this.pending.set(key,pending);return pending;
 }
 prune(){const files=fs.readdirSync(this.folder).filter(n=>/^[a-f0-9]{64}\.wav$/.test(n)).map(n=>({n,time:fs.statSync(path.join(this.folder,n)).mtimeMs})).sort((a,b)=>b.time-a.time);for(const f of files.slice(300))fs.unlinkSync(path.join(this.folder,f.n));}
}
module.exports={Speech,accentKana,morae,sameReading,clipKey};
