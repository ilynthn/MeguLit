'use strict';
/* QQ #1116 (user, 2026-11-24: 「译文有时候出现神秘韩文」): a Chinese line came out as 「칠她深信不疑，这样就能去往家人身边了。」.
   Root: LLM translation requests carried no temperature, so the open-model servers (Ollama, LM Studio, llama-server,
   SiliconFlow, DashScope) sampled at their own 0.7-1.0 and small models picked a stray token of another script. Fix: those
   engines are asked for a low temperature; and as a guard every answer, and every stored translation, that carries Hangul
   the Japanese line did not have is no translation: the chain goes on to the next source. */
const test=require('node:test'),assert=require('node:assert/strict');
const {foreignScript}=require('../core/text-sanity.cjs');
const {createTranslationService}=require('../core/providers.cjs');
const {ENGINES}=require('../core/engines.cjs');
const chain=require('../services/translation-chain.cjs');
const {Reader}=require('../services/reader.cjs');
const JA='これで家族のもとへ逝けると、信じて疑わなかった。',BAD='칠她深信不疑，这样就能去往家人身边了。',GOOD='她深信不疑，这样就能去往家人身边了。';

test('Hangul the Japanese line does not have marks the answer as another script',()=>{
 for(const t of [BAD,'안녕하세요','她说ㅋㅋ','He said 사랑해.'])assert.equal(foreignScript(t,JA),true,t);
 for(const t of [GOOD,'I believed it without a doubt.','「……」','她说：“ソウル？”',''])assert.equal(foreignScript(t,JA),false,t);
 assert.equal(foreignScript('他念出了「사랑해」。','「사랑해」って言った。'),false,'a line that itself carries Korean may keep it');
});

function service(reply){const calls=[];const fetcher=async(url,init)=>{let body;try{body=JSON.parse(init.body);}catch{body=String(init.body);}calls.push({url,body});const content=typeof reply==='function'?reply(calls.length):reply;
  return {ok:true,status:200,json:async()=>Array.isArray(content)?content:({choices:[{message:{content}}]})};};
 const s=createTranslationService(fetcher);s.setKey('https://api.example.com/v1','k');return {s,calls};}

test('an answer with stray Hangul is dropped, not cached and not used as context; the next try can succeed',async()=>{
 const {s,calls}=service(n=>n===1?BAD:GOOD),opts={provider:'gpt',baseUrl:'https://api.example.com/v1',model:'m'};
 assert.equal(await s.translate(JA,opts),'');
 assert.equal(await s.translate(JA,opts),GOOD,'nothing was cached: the line is asked again');
 assert.equal(calls.length,2);
});

test('open-model engines are asked for a low temperature; hosted ones keep their own sampling',async()=>{
 for(const provider of ['ollama','lmstudio','llamacpp']){
  const {s,calls}=service(GOOD);await s.translate(JA,{provider,model:'qwen2.5:7b'});
  assert.equal(calls[0].body.temperature,0.3,provider);
 }
 for(const provider of ['siliconflow','qwen']){
  const {s,calls}=service(GOOD);s.setKey(ENGINES[provider].baseUrl,'k');await s.translate(JA,{provider,model:'m'});
  assert.equal(calls[0].body.temperature,0.3,provider);
 }
 for(const [provider,baseUrl] of [['gpt','https://api.openai.com/v1'],['deepseek','https://api.deepseek.com'],['claude',ENGINES.claude.baseUrl],['gemini',ENGINES.gemini.baseUrl]]){
  const {s,calls}=service(GOOD);s.setKey(baseUrl,'k');await s.translate(JA,{provider,baseUrl,model:'m'});
  assert.equal('temperature' in calls[0].body,false,provider);
 }
 const {s,calls}=service(GOOD);await s.translate(JA,{provider:'sakura',model:'sakura'});
 assert.equal(calls[0].body.temperature,0.1,'Sakura keeps its own sampling');
});

test('the free machine translation route is checked the same way',async()=>{
 const {s}=service([[[BAD,JA]]]);
 assert.equal(await s.translate('別の行。',{provider:'google'}),'');
});

test('the chain goes on to the next source when one answers in another script',async()=>{
 const list=chain.candidates({provider:'ollama',model:'qwen2.5:7b'},{});
 const {s}=service(BAD);
 const r=await chain.translate(JA,list,async o=>o.provider==='ollama'?s.translate(JA,o):GOOD);
 assert.equal(r.provider,'microsoft');assert.equal(r.text,GOOD);
});

test('a stored translation in another script is not shown; the line goes to the chain',()=>{
 const reader=Object.create(Reader.prototype);
 reader.zeroLatencyEnabled=()=>false;
 reader.gal={hooks:{scriptTranslation:(text,returned)=>{returned.source='official';return BAD;}}};
 const cached=new Map();reader.embedCached=(text,value)=>{if(value===undefined)return cached.get(text);cached.set(text,value);return value;};
 assert.equal(reader.localTranslation(JA,'zh',{}),'');
 cached.set(JA,BAD);assert.equal(reader.localTranslation(JA,'zh',{}),'');
 reader.gal.hooks.scriptTranslation=()=>GOOD;assert.equal(reader.localTranslation(JA,'zh',{}),GOOD);
});

test('a caller sharing an in-flight request gets the checked answer too (Codex #1284)',async()=>{
 const {s,calls}=service(BAD),opts={provider:'gpt',baseUrl:'https://api.example.com/v1',model:'m',contextEnabled:false};
 assert.deepEqual(await Promise.all([s.translate(JA,opts),s.translate(JA,opts)]),['','']);
 assert.equal(calls.length,1,'one request shared by both callers');
 const ok=service(' '+GOOD+' ');
 assert.deepEqual(await Promise.all([ok.s.translate(JA,opts),ok.s.translate(JA,opts)]),[GOOD,GOOD],'the shared answer is normalized for both');
});
