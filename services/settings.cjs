// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fields,groups}=require('./settings-schema.cjs');
const gameStyle=require('../core/game-style.js');
const {cleanV4}=require('../core/v4-config.cjs');
const {cleanPreferences}=require('../core/preferences.cjs');
const {readJSON}=require('./store.cjs');
const backgroundDefaults={blur:0,dim:35,saturate:100,glass:true,glassBlur:14,glassAlpha:55,crop:{x:50,y:50,zoom:1}};
const panelDefaults={blur:16,dim:40,saturate:110,alpha:62,radius:18,border:8,glassBlur:18,glassDim:0,glassSaturate:100};
const gameScopes=new Set(['text','embedding','position']);
const v4Scopes=new Set(['speech','anki','immersion']);
const nativeScopes=new Set(['lookup','study','reader']);
const nativeDefaults=require('./native-defaults.cjs');
const getPath=(obj,key)=>key.split('.').reduce((value,k)=>value?.[k],obj);
function setPath(obj,key,value){const parts=key.split('.');let parent=obj;for(const part of parts.slice(0,-1)){if(!parent[part]||typeof parent[part]!=='object')parent[part]={};parent=parent[part];}parent[parts.at(-1)]=value;}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);}
class Settings{
 constructor(root){this.root=root;this.folder=path.join(root,'data','config');fs.mkdirSync(this.folder,{recursive:true});}
 file(name){return path.join(this.folder,name);}
 ui(){return readJSON(path.join(this.root,'data','ui-state.json'));}
 uiObject(name,fallback){try{return {...fallback,...JSON.parse(this.ui()[name]||'{}')};}catch{return {...fallback};}}
 read(scope,profile=''){
  if(gameScopes.has(scope)){
    // Text style for works without saved settings comes from the global preset edited here (E215), not from the live
    // session file, so one work's Alt+T save never becomes another work's default.
    const preset=scope==='text'?require('../core/text-defaults.cjs').read(this.folder):{};
    // Preset sizes are current-format values: keep the legacy "older than layout 22" size floor away from them.
    const session=readJSON(this.file('gal-preferences.json')),modern=Object.hasOwn(preset,'japaneseSize')||Object.hasOwn(preset,'translationSize');
    const global=gameStyle.clean({...session,...preset,...(modern?{layoutVersion:22}:{})});
    const entry=profile?readJSON(this.file('game-style-profiles.json')).entries?.[profile]:null;
    return entry?gameStyle.clean({...global,...entry.prefs}):global;
  }
  if(v4Scopes.has(scope))return cleanV4(readJSON(this.file('v4-preferences.json')));
  if(nativeScopes.has(scope))return {...nativeDefaults,...readJSON(this.file('native-preferences.json'))};
  if(['translation','dictionary'].includes(scope))return {enabled:true,provider:'google',contextEnabled:true,scriptTranslation:true,scriptColdRun:true,contextLines:4,learnerLanguage:'zh',readingEngine:'sudachi',reviewEngine:'machine',...cleanPreferences(readJSON(this.file('preferences.json')))};
  if(scope==='background')return this.uiObject('tome-background',backgroundDefaults);
  if(scope==='panels'){
    const value=this.uiObject('tome-menu-background',{...panelDefaults,surfaces:{menu:'image',log:'image',card:'image'}});value.panels={...value.panels};
    for(const panel of ['menu','log','card'])value.panels[panel]={...panelDefaults,...Object.fromEntries(Object.keys(panelDefaults).map(k=>[k,value[k]??panelDefaults[k]])),...value.panels[panel]};return value;
  }
  if(scope==='online')return {relayUrl:'',leaderboardEnabled:false,leaderboardName:'',leaderboardShareGames:false,...readJSON(path.join(this.folder,'online.json'))};
  if(scope==='library'){const library=readJSON(this.file('library.json'));return {autoSeries:library.autoSeries!==false,sharedAdaptation:library.sharedAdaptation!==false,sceneShots:library.sceneShots!==false,runtimeHarvest:library.runtimeHarvest!==false,probeUpload:library.probeUpload!==false,steamPath:library.steamPath||'',folders:(library.folders||[]).join('\n')};}
  throw Error('SETTINGS_SCOPE_INVALID');
 }
 get(profile=''){
  if(profile&&!/^[a-f0-9]{64}$/.test(profile))throw Error('SETTINGS_PROFILE_INVALID');
  const values={};for(const group of groups){const source=this.read(group.id,profile);values[group.id]={};for(const field of fields.filter(f=>f.scope===group.id))values[group.id][field.key]=getPath(source,field.key)??(field.type==='boolean'?false:field.type==='number'?field.min??0:'');}
  const entries=readJSON(this.file('game-style-profiles.json')).entries||{};
  if(profile&&!entries[profile])throw Error('SETTINGS_PROFILE_INVALID');
  const {resolveOptions}=require('../core/providers.cjs'),{ENGINES}=require('../core/engines.cjs'),translationProfiles=readJSON(this.file('translation-profiles.json'));
  const providers={};for(const option of fields.find(field=>field.scope==='translation'&&field.key==='provider').options){const provider=option.value,base=resolveOptions({provider});providers[provider]={defaultBaseUrl:base.baseUrl||'',defaultModel:base.model||'',baseUrl:base.baseUrl||'',model:base.model||(provider==='gpt'?'gpt-4.1-mini':''),editable:provider==='gpt'||ENGINES[provider]?.editable===true,keyless:provider==='google'||ENGINES[provider]?.keyless===true,...translationProfiles[provider]};}
  return {groups,fields,values,providers,profile,profiles:Object.entries(entries).filter(([key])=>/^[a-f0-9]{64}$/.test(key)).map(([key,entry])=>({id:key,name:String(entry.name||key.slice(0,12)),savedAt:entry.savedAt||0})),hasSavedKeys:fs.existsSync(this.file('secrets.dpapi'))};
 }
 save({scope,values,profile=''}){
  if(!groups.some(group=>group.id===scope))throw Error('SETTINGS_SCOPE_INVALID');
  if(profile&&(!/^[a-f0-9]{64}$/.test(profile)||!readJSON(this.file('game-style-profiles.json')).entries?.[profile]))throw Error('SETTINGS_PROFILE_INVALID');
  if(!values||typeof values!=='object'||Array.isArray(values))throw Error('SETTINGS_INVALID_VALUE');
  const current=this.read(scope,profile),next=structuredClone(current),allowed=new Map(fields.filter(f=>f.scope===scope).map(field=>[field.key,field]));
  for(const[key,input]of Object.entries(values||{})){
    const field=allowed.get(key);if(!field)throw Error('SETTINGS_FIELD_INVALID');let value=input;
    if(field.readOnly&&value!==getPath(current,key))throw Error('SETTINGS_READ_ONLY');
    if(field.type==='boolean'){if(typeof value!=='boolean')throw Error('SETTINGS_INVALID_VALUE');}
    else if(field.type==='number'){value=Number(value);if(!Number.isFinite(value))throw Error('SETTINGS_INVALID_VALUE');value=Math.max(field.min??-Infinity,Math.min(field.max??Infinity,value));if((field.step??1)===1)value=Math.round(value);}
    else if(field.type==='select'){if(!field.options.some(option=>option.value===value)&&!(key.endsWith('Font')&&/^game:[0-9a-f]{10}$/.test(value)))throw Error('SETTINGS_INVALID_VALUE');}
    else if(field.type==='color'){if(value!==''&&!/^#[0-9a-f]{3,8}$/i.test(value))throw Error('SETTINGS_INVALID_VALUE');}
    else{if(typeof value!=='string'||value.length>12000||(/key|password|token|secret/i.test(key)))throw Error('SETTINGS_INVALID_VALUE');}
    if(/(?:Url|baseUrl)$/.test(key)&&value){let url;try{url=new URL(value);}catch{throw Error('SETTINGS_INVALID_URL');}if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw Error('SETTINGS_INVALID_URL');if((scope==='anki'||scope==='speech')&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('SETTINGS_INVALID_URL');}
    setPath(next,key,value);
  }
  const written=Object.keys(values||{});if(scope==='text'&&written.some(k=>['japaneseSize','translationSize','englishSize'].includes(k))){next.sizeSource='user';written.push('sizeSource');}
  if(gameScopes.has(scope)){
    const cleaned=gameStyle.clean(next);
    if(profile){
      if(!/^[a-f0-9]{64}$/.test(profile))throw Error('SETTINGS_PROFILE_INVALID');
      const document=readJSON(this.file('game-style-profiles.json'));const entry=document.entries?.[profile];if(!entry)throw Error('SETTINGS_PROFILE_INVALID');
      const saved={...entry.prefs};for(const key of written)saved[key]=cleaned[key];const now=Date.now();
      document.entries[profile]={...entry,prefs:saved,savedAt:now,textSavedAt:scope==='position'?entry.textSavedAt:now,positionSavedAt:scope==='position'?now:entry.positionSavedAt,history:[{id:String(now),savedAt:now,prefs:saved,positionMap:entry.positionMap||null},...(entry.history||[])].slice(0,7)};document.version=3;atomic(this.file('game-style-profiles.json'),document);
    }else if(scope==='text'){
      const presets=require('../core/text-defaults.cjs'),keys=written,style=Object.fromEntries(keys.filter(presets.isTextKey).map(k=>[k,cleaned[k]])),rest=Object.fromEntries(keys.filter(k=>!presets.isTextKey(k)).map(k=>[k,cleaned[k]]));
      if(Object.keys(style).length)presets.write(this.folder,style);if(Object.keys(rest).length)atomic(this.file('gal-preferences.json'),{...readJSON(this.file('gal-preferences.json')),...rest});
    }else atomic(this.file('gal-preferences.json'),{...readJSON(this.file('gal-preferences.json')),...cleaned});
  }else if(nativeScopes.has(scope))atomic(this.file('native-preferences.json'),{...readJSON(this.file('native-preferences.json')),...next});
  else if(v4Scopes.has(scope))atomic(this.file('v4-preferences.json'),{...readJSON(this.file('v4-preferences.json')),...cleanV4(next)});
  else if(['translation','dictionary'].includes(scope)){
    const cleaned=cleanPreferences(next);atomic(this.file('preferences.json'),{...readJSON(this.file('preferences.json')),...cleaned});
    if(scope==='translation'){const profiles=readJSON(this.file('translation-profiles.json'));profiles[next.provider]=Object.fromEntries(['baseUrl','model','region','deeplTier'].filter(key=>Object.hasOwn(cleaned,key)).map(key=>[key,cleaned[key]]));atomic(this.file('translation-profiles.json'),profiles);}
  }
  else if(scope==='background'||scope==='panels'){
    const ui=this.ui();ui[scope==='background'?'tome-background':'tome-menu-background']=JSON.stringify(next);atomic(path.join(this.root,'data','ui-state.json'),ui);
  }else if(scope==='online'){
    /* E377: nickname through the leaderboard filter, relay address https (http only for localhost) */
    if(Object.hasOwn(values,'leaderboardName')&&next.leaderboardName!==''){const checked=require('./leaderboard.cjs').cleanName(next.leaderboardName);if(!checked.ok)throw Error('LEADERBOARD_'+checked.error);next.leaderboardName=checked.name;}
    if(Object.hasOwn(values,'relayUrl')&&next.relayUrl!==''){const base=require('./relay-config.cjs').normalizeBase(next.relayUrl);if(!base)throw Error('SETTINGS_INVALID_URL');next.relayUrl=base;}
    const file=path.join(this.folder,'online.json');atomic(file,{...readJSON(file),relayUrl:next.relayUrl,leaderboardEnabled:next.leaderboardEnabled,leaderboardName:next.leaderboardName,leaderboardShareGames:next.leaderboardShareGames});
  }else if(scope==='library')atomic(this.file('library.json'),{...readJSON(this.file('library.json')),steamPath:next.steamPath,folders:next.folders.split(/[\r\n;]+/).map(v=>v.trim()).filter(Boolean),autoSeries:next.autoSeries,sharedAdaptation:next.sharedAdaptation!==false,sceneShots:next.sceneShots!==false,runtimeHarvest:next.runtimeHarvest!==false,probeUpload:next.probeUpload!==false});
  return this.get(profile);
 }
 saveKey({provider,baseUrl,apiKey}){
  if(typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>10000||/[\r\n]/.test(apiKey))throw Error('SETTINGS_INVALID_KEY');
  const {resolveOptions}=require('../core/providers.cjs');const options=resolveOptions({provider,baseUrl});
  const {SecretStore}=require('../core/secrets.cjs');
  const store=new SecretStore(this.folder,undefined,path.join(this.root,'native','KeyVault.exe'));store.set(options.baseUrl,apiKey);return {saved:true};
 }
}
module.exports={Settings,fields,groups,gameScopes,nativeDefaults};
