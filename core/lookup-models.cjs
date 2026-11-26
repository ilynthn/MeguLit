// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {normalizeBase,resolveOptions}=require('./providers.cjs');
const {ENGINES}=require('./engines.cjs');
const presets={deepseek:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},gemini:{baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:''},gpt:{baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini'},qwen:{baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'},kimi:{baseUrl:'https://api.moonshot.ai/v1',model:'kimi-k2.6'},glm:{baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.7'}};
const titles={deepseek:'DeepSeek',gemini:'Gemini',gpt:'OpenAI / 兼容接口',qwen:'Qwen / 通义千问',kimi:'Kimi / 月之暗面',glm:'GLM / 智谱'};
// Context explanations ("上下文解释", "归纳义项") have their own source (user, 2026-11-09): always a language model, the
// user's own API (DeepSeek recommended), independent of where word lookups come from (local, MOJi or a model).
const CONTEXT=['follow',...Object.keys(presets)];
function cleanLookup(value={}){const provider=['local','follow','moji',...Object.keys(presets)].includes(value.lookupProvider)?value.lookupProvider:'moji',contextProvider=CONTEXT.includes(value.contextProvider)?value.contextProvider:'deepseek',profiles={};for(const [name,preset]of Object.entries(presets)){const input=value.lookupProfiles?.[name]||{};let baseUrl=!['deepseek','gemini'].includes(name)&&typeof input.baseUrl==='string'&&input.baseUrl.trim()?normalizeBase(input.baseUrl):preset.baseUrl;let model=typeof input.model==='string'&&input.model.length<201&&!/[\r\n]/.test(input.model)?input.model.trim():preset.model;profiles[name]={baseUrl,model};}return {lookupProvider:provider,contextProvider,...(value.contextProviderPicked===true&&{contextProviderPicked:true}),lookupProfiles:profiles};}
function lookupOptions(settings,main={}){const value=cleanLookup(settings);if(value.lookupProvider==='local')return null;if(value.lookupProvider==='follow')return resolveOptions(main);if(value.lookupProvider==='moji')return {provider:'moji'};const p=value.lookupProfiles[value.lookupProvider];return resolveOptions({...main,provider:value.lookupProvider==='deepseek'?'deepseek':'gpt',baseUrl:p.baseUrl,model:p.model});}
/* Context explanations follow the translation API the player has bound (#1117): the same provider, base address, model and key. Only a context
   source the player picked on purpose, and has its own key for, is used instead. hasKey(options) tells whether a key is saved for those options. */
const isModel=o=>!!o&&(['gpt','deepseek'].includes(o.provider)||ENGINES[o.provider]?.kind==='llm');
function boundModel(main,hasKey){try{const o=resolveOptions(main||{});return isModel(o)&&(!hasKey||hasKey(o))?o:null;}catch{return null;}}
function contextOptions(settings,main={},hasKey){const value=cleanLookup(settings),chosen=value.contextProvider,explicit=settings?.contextProviderPicked===true||CONTEXT.includes(settings?.contextProvider)&&settings.contextProvider!=='deepseek',bound=boundModel(main,hasKey);const build=name=>{const p=value.lookupProfiles[name];return resolveOptions({...main,provider:name==='deepseek'?'deepseek':'gpt',baseUrl:p.baseUrl,model:p.model});};
 if(chosen==='follow')return bound||build('deepseek');
 /* the DeepSeek default is written into preferences by every save, so it only counts as a choice with contextProviderPicked (set when the player
    changes the source in Settings or saves it in the lookup card); any other source can only have been picked (Codex #1176) */
 if(!explicit&&bound)return bound;
 const own=build(chosen);if(bound&&hasKey&&!hasKey(own))return bound;return own;}
module.exports={cleanLookup,lookupOptions,contextOptions,boundModel,presets,titles,CONTEXT};
