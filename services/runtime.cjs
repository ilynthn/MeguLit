// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path');
const {readJSON}=require('./store.cjs');
// Text sizes changed on the home settings page also apply to the work that is running: its saved settings would hide them (issue 119).
const SIZE_KEYS=['japaneseSize','translationSize','englishSize'];
class Runtime {
 constructor(root,emit=()=>{}){this.root=root;this.folder=path.join(root,'data','config');this.emit=emit;this.stopped=false;}
 config(){return require('../core/v4-config.cjs').cleanV4(readJSON(path.join(this.folder,'v4-preferences.json')));}
 // Bind the window of a game MeguLit just launched; retried a few times while the reader/bridge finishes starting.
 bindLaunched(pid){if(!Number.isInteger(Number(pid))||Number(pid)<=0)return;let tries=0;const go=()=>{const g=this.reader?.gal;if(g){g.send({type:'bindProcess',pid:String(pid)});if(++tries<4)setTimeout(go,1500);}else if(++tries<20)setTimeout(go,500);};setTimeout(go,300);}
 prepareGame(executable,{enter=true}={}){this.pendingGameEnter=enter;this.pendingGame=path.basename(executable,path.extname(executable));this.pendingExecutable=executable;this.reader?.selectGame(this.pendingGame,enter,executable);}
 // Point the hook at the Japanese original index for this executable, or clear it.
 learning(){return this.localLearning??=new(require('../core/learning-native.cjs').LocalLearning)(this.root,message=>this.emit('reader-event',message));}
 ankiProcess(){return this.ankiRunner??=new(require('../core/anki-process.cjs').AnkiProcess)({config:()=>this.config(),log:line=>{try{require('node:fs').appendFileSync(path.join(this.root,'logs','anki-process.log'),new Date().toISOString()+' '+line+'\n');}catch{}}});}
 services(){return this.serviceManager??=new(require('../core/services.cjs').Services)(this.root);}
 speech(){return this.speechEngine??=new(require('../core/speech.cjs').Speech)(path.join(this.root,'cache'));}
 models(){return this.modelStore??=new(require('../core/model-store.cjs').ModelStore)(this.root);}
 packs(){return this.packStore??=require('../core/runtime-packs.cjs').RuntimePacks.shared(this.root);}
 local(){return this.localEngine??=new(require('../core/local-llm.cjs').LocalLlm)({root:this.root,models:this.models(),logs:path.join(this.root,'logs')});}
 library(){return this.libraryManager??=new(require('../core/library.cjs').Library)(require('../core/layout.cjs'));}
 history(){return this.historyTranslations??=new(require('./history-view.cjs').HistoryTranslations)(this.root,async text=>{if(this.stopped)throw Error('RUNTIME_STOPPED');const {createTranslationService,resolveOptions}=require('../core/providers.cjs'),preferences=require('../core/preferences.cjs').cleanPreferences(readJSON(path.join(this.folder,'preferences.json'))),options=resolveOptions(preferences),translator=createTranslationService();if(options.provider!=='google'&&!require('../core/engines.cjs').ENGINES[options.provider]?.keyless){const {SecretStore}=require('../core/secrets.cjs');for(const[base,key]of new SecretStore(this.folder,undefined,path.join(this.root,'native','KeyVault.exe')).entries())translator.setKey(base,key);}await this.local().ensure(options);return translator.translate(text,options);});}
 reviews(){return this.gameReviews??=new(require('./game-reviews.cjs').GameReviews)(this.root,fetch,{engine:()=>require('../core/preferences.cjs').cleanPreferences(readJSON(path.join(this.folder,'preferences.json'))).reviewEngine||'machine',translate:(text,lang,mode)=>this.reviewTranslate(text,lang,mode)});}
 // Community reviews through the user's translation engine, or a local model.
 async reviewTranslate(text,lang,mode){if(this.stopped)throw Error('RUNTIME_STOPPED');const {createTranslationService,resolveOptions}=require('../core/providers.cjs'),{ENGINES}=require('../core/engines.cjs'),preferences=require('../core/preferences.cjs').cleanPreferences(readJSON(path.join(this.folder,'preferences.json')));
  const useConfigured=mode!=='local'||ENGINES[preferences.provider]?.group==='local',options={...resolveOptions(useConfigured?preferences:{provider:'sakura'}),learnerLanguage:lang==='en'?'en':'zh',contextEnabled:false},translator=this.reviewTranslator??=createTranslationService();
  if(options.provider!=='google'&&!ENGINES[options.provider]?.keyless){const {SecretStore}=require('../core/secrets.cjs');for(const[base,key]of new SecretStore(this.folder,undefined,path.join(this.root,'native','KeyVault.exe')).entries())translator.setKey(base,key);}
  await this.local().ensure(options);return translator.translate(text,options);}
 // Synopses: free machine translation first, then the user's own translation engine (Chinese or English).
 metadata(){const {machine}=require('../core/library.cjs');return this.gameEnrichment??=new(require('./game-enrichment.cjs').GameEnrichment)(this.root,this.emit,fetch,async(text,lang)=>(await machine(text,lang))||(lang!=='ja'?String(await this.reviewTranslate(text,lang,'follow').catch(()=>'')||'').trim():''));}
 settingsSaved(request){if(request.scope==='library'){const db=require('./store.cjs').openStore(this.root);try{require('./series.cjs').autoGroup(db,this.root);}finally{db.close();}}const reader=this.reader,g=reader?.gal;if(!g)return;const settings=new(require('./settings.cjs').Settings)(this.root);
  if(['background','panels'].includes(request.scope))this.emit('reader-event',{type:'panelAppearance',values:settings.ui()});
  if(['text','embedding','position'].includes(request.scope)&&(!request.profile||request.profile===g.styleSync.profileKey)){const active=g.styleSync.profileKey,entries=readJSON(path.join(this.folder,'game-style-profiles.json')).entries||{},sizes=Object.keys(request.values||{}).filter(k=>SIZE_KEYS.includes(k));if(request.scope==='text'&&!request.profile&&active&&entries[active]&&sizes.length)try{settings.save({scope:'text',profile:active,values:Object.fromEntries(sizes.map(k=>[k,request.values[k]]))});}catch{}const global=settings.read('text'),profile=readJSON(path.join(this.folder,'game-style-profiles.json')).entries?.[active]?.prefs||{};const effective={...global,...profile,gameProcess:g.preferences.gameProcess,bindEnabled:g.preferences.bindEnabled};g.preferences=require('../core/game-style.js').clean(effective);g.preview(g.preferences);this.emit('reader-event',{type:'call',method:'restoreGalSettings',args:[g.preferences]});}
  /* E545 */if(request.scope==='translation')reader.refreshTextSource?.({force:false});reader.immersion?.configure(this.config());g.setGameAudio(this.config().ankiGameMedia!==false);this.emit('reader-event',{type:'call',method:'restoreSettings',args:[reader.prefs()]});this.emit('reader-event',{type:'word-status-changed'});
 }
 /* Antivirus quarantine shows up as missing native files: name it instead of a generic timeout */readerMissing(){const fs=require('node:fs');return ['GalWindowBridge.exe','HookBridge.exe','HookInjector32.exe','HookInjector64.exe'].filter(n=>!fs.existsSync(path.join(this.root,'native',n)));}
 readerStatus(){const status=this.readerStatusRaw();if(status.ready||status.error&&!/READER_NATIVE_EXITED/.test(status.error)||status.phase!=='not-started'&&!status.error)return status;const missing=this.readerMissing();return missing.length?{...status,error:'READER_NATIVE_MISSING: '+missing.join(', ')}:status;}
 readerStatusRaw(){const native=this.reader?.gal,alive=native?.process?.exitCode===null,hotkey=native?.state?.hotkey;return {ready:!!this.readerReady&&alive&&hotkey===true,hotkey,error:this.readerError||(this.readerReady&&alive&&hotkey===false?'READER_HOTKEY_IN_USE':''),phase:this.readerPhase||'not-started'};}
 async call(request){
  if(this.stopped)throw Error('RUNTIME_STOPPED');const config=this.config();
  switch(request.action){
   case 'library_scan':{this.libraryScans??=new(require('./library-scan.cjs').LibraryScans)(async options=>{const library=this.library();library.state=library.read();await library.scan(progress=>this.emit('library-progress',progress),options);const result=require('./library.cjs').reconcile(this.root,library.load().games,{restoreRemoved:!options.incremental});const db=require('./store.cjs').openStore(this.root);try{this.metadata().enqueue(db.prepare('SELECT id FROM games WHERE removed_at IS NULL').all().map(g=>g.id),options?.incremental!==true);
     /* E297 Hxv4 KiriKiri games found: read their scripts once in the background (setting 后台准备加密剧本) */
     try{const cold=require('./kirikiri-cold.cjs');this.coldWatch??=cold.onDone(()=>this.reader?.refreshTextSource?.());cold.considerLibrary(this.root,db.prepare('SELECT id,executable FROM games WHERE removed_at IS NULL').all(),{enabled:require('../core/preferences.cjs').cleanPreferences(readJSON(path.join(this.folder,'preferences.json'))).scriptColdRun!==false});}catch{}
     /* E450 the game's own voices for every game in the library, a game every 20 s, off the start-up path */
     try{const coldOn=require('../core/preferences.cjs').cleanPreferences(readJSON(path.join(this.folder,'preferences.json'))).scriptColdRun!==false,gv=require('./game-voice.cjs');db.prepare('SELECT executable FROM games WHERE removed_at IS NULL').all().forEach((g,i)=>gv.scanLater(this.root,g.executable,30000+i*20000,{cold:coldOn}));}catch{}
    }finally{db.close();}return {...result,games:library.load().games,unconfirmed:(library.unconfirmed||[]).slice(0,50)};});return this.libraryScans.run({startup:request.startup===true});}
   case 'library_find_steam':return this.library().findSteam();
   case 'reader_status':return this.readerStatus();
   case 'reader_health':{const phase=String(request.phase||'').slice(0,100),error=String(request.error||'').slice(0,3000);this.readerReady=phase==='ready'&&!error;this.readerPhase=phase;this.readerError=error;if(error)await this.reader?.stop();this.emit('reader-health',this.readerStatus());require('node:fs').appendFileSync(path.join(this.root,'logs','reader-startup.log'),new Date().toISOString()+' '+phase+' '+error+'\n');return {saved:true};}
   case 'reader_bootstrap':return {native:{...require('./settings.cjs').nativeDefaults,...readJSON(path.join(this.folder,'native-preferences.json'))},engines:Object.fromEntries(Object.entries(require('../core/engines.cjs').ENGINES).map(([name,engine])=>[name,{label:engine.label,hidden:!!engine.hidden,group:engine.group,kind:engine.kind,keyless:!!engine.keyless,editable:!!engine.editable,pair:!!engine.pair,baseUrl:engine.baseUrl,model:engine.model||'',hint:engine.hint||''}]))};
   case 'reader_detach':this.readerReady=false;this.readerError='';await this.reader?.stop();return {stopped:true};
   case 'reader_attach':{const reader=this.reader??=new(require('./reader.cjs').Reader)(this);if(reader.stopping)await reader.stopping;return reader.attach(request);}
   case 'reader_message':return (this.reader??=new(require('./reader.cjs').Reader)(this)).message(request.message);
   case 'reader_invoke':return (this.reader??=new(require('./reader.cjs').Reader)(this)).invoke(request.command,request.args);
   case 'model_status':return {...this.models().status(),runtime:this.local().status()};
   case 'model_download':return this.models().download(String(request.id),String(request.source||'hf'));
   case 'pack_status':return this.packs().status();
   case 'pack_download':return this.packs().download(request.ids);
   case 'pack_cancel':return this.packs().cancel();
   case 'pack_uninstall':return this.packs().uninstall(String(request.id||''));
   case 'model_cancel':return this.models().cancel(String(request.id));
   case 'local_start':{const options=require('../core/providers.cjs').resolveOptions(require('../core/preferences.cjs').cleanPreferences(readJSON(path.join(this.folder,'preferences.json'))));if(!this.local().local(options))throw Error('LOCAL_ENGINE_REQUIRED');await this.local().ensure(options);return this.local().status();}
   case 'local_stop':await this.local().stop();return this.local().status();
   case 'runtime_download':return this.local().download();
   case 'runtime_cancel':return this.local().cancel();
   case 'speakers':await this.services().ensureSpeech(config.aivisUrl,config.aivisGpu);{const list=await this.speech().speakers(config);this.services().rememberSpeakers(list);return list;}
   case 'speakers_cached':return this.services().cachedSpeakers();
   /* E450 a sentence read aloud anywhere in the app: the game's own voice (CV) when MeguLit knows it, else synthesis. */
   case 'sentence_voice':{const text=String(request.text||'').trim();if(!text||text.length>400)throw Error('INVALID_PREVIEW_TEXT');const v=require('./game-voice.cjs').find(this.root,text);if(v)return {data:v.data.toString('base64'),mime:v.mime,source:'game',estimated:!!v.estimated};if(text.length>200)throw Error('INVALID_PREVIEW_TEXT');const options=require('../core/v4-config.cjs').cleanV4(config);const r=await require('../core/speech-deadline.cjs').speakWithin(()=>this.services().ensureSpeech(options.aivisUrl,options.aivisGpu),()=>this.speech().synthesize({surface:text,reading:'',pitch:[]},options));return {...r,mime:'audio/wav',source:'synthesized'};}
   case 'speech_preview':{const text=String(request.text||'').trim();if(!text||text.length>200)throw Error('INVALID_PREVIEW_TEXT');const options=require('../core/v4-config.cjs').cleanV4({...config,...(Number.isSafeInteger(Number(request.speaker))?{aivisSpeaker:Number(request.speaker)}:{}),...(Number.isFinite(Number(request.speed))?{aivisSpeed:Number(request.speed)}:{})});return require('../core/speech-deadline.cjs').speakWithin(()=>this.services().ensureSpeech(options.aivisUrl,options.aivisGpu),()=>this.speech().synthesize({surface:text,reading:'',pitch:[]},options));}
   case 'kana_speak':{
    /* Kana module: speak a kana or a study word through the same dictionary reading and UniDic pitch path the reader uses. */
    const text=String(request.text||'').trim(),want=String(request.reading||'').trim();if(!text||[...text].length>24)throw Error('INVALID_KANA_TEXT');
    const options=require('../core/v4-config.cjs').cleanV4({...config,...(Number.isFinite(Number(request.speed))&&request.speed!==null?{aivisSpeed:Math.min(1.3,Math.max(0.7,Number(request.speed)))}:{})}),deadline=require('../core/speech-deadline.cjs');await deadline.withDeadline(this.services().ensureSpeech(options.aivisUrl,options.aivisGpu),deadline.SPEECH_START_MS,'语音引擎启动超时：模型下载或加载太久，请检查网络后重试（详情见 speech-engine.log）');
    /* 学习发音单独选风格：没指定时用当前话者的「おちつき」（没有就用「ノーマル」）；伤感、耳语类风格读单个假名会发黏 */
    try{const speakers=await this.speech().speakers(options),pick=Number(request.speaker);if(Number.isSafeInteger(pick)&&speakers.some(s=>(s.styles||[]).some(t=>t.id===pick)))options.aivisSpeaker=pick;else{const owner=speakers.find(s=>(s.styles||[]).some(t=>t.id===options.aivisSpeaker)),calm=owner?.styles?.find(t=>t.name==='おちつき')||owner?.styles?.find(t=>/ノーマル|normal/i.test(t.name));if(calm)options.aivisSpeaker=calm.id;}}catch{}
    const hira=v=>String(v||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
    let word={surface:text,reading:want,pitch:[]};
    if([...text].length>1){try{const found=await this.learning().word({text,start:0,end:[...text].length});if(found?.reading&&(!want||hira(found.reading)===hira(want)))word={...found,surface:text};}catch{}}
    /* 试听选定的调校：抑扬 1.3、前后留白，多字词句尾加「。」让收尾自然 */
    const into=Number(request.intonation);word.tuning={intonation:Number.isFinite(into)&&request.intonation!==null?Math.min(2,Math.max(0.5,into)):1.3,pre:0.12,post:0.15};
    if([...text].length>1&&!/[。！？!?]$/.test(word.surface))word={...word,surface:word.surface+'。'};
    return deadline.withDeadline(this.speech().synthesize(word,options),deadline.SPEECH_SYNTH_MS,'语音合成超时：引擎没有响应，请稍后重试或在设置里重启语音');
   }
   case 'tokenize':{const text=String(request.text||'');if(!text||text.length>4000)throw Error('INVALID_READER_TEXT');return this.learning().tokenize(text);}
   case 'translate_preview':{
    const text=String(request.text||'').trim();if(!text||text.length>1000)throw Error('INVALID_PREVIEW_TEXT');
    const {createTranslationService,resolveOptions}=require('../core/providers.cjs');this.translator??=createTranslationService();
    const preferences=require('../core/preferences.cjs').cleanPreferences(readJSON(path.join(this.folder,'preferences.json'))),options=resolveOptions(preferences);
    if(options.provider!=='google'&&!require('../core/engines.cjs').ENGINES[options.provider]?.keyless){const {SecretStore}=require('../core/secrets.cjs');for(const[base,key]of new SecretStore(this.folder,undefined,path.join(this.root,'native','KeyVault.exe')).entries())this.translator.setKey(base,key);}
    await this.local().ensure(options);return {text:await this.translator.translate(text,options)};
   }
   default:throw Error('UNKNOWN_RUNTIME_ACTION');
  }
 }
 async stop(){if(this.stopping)return this.stopping;this.stopped=true;this.gameEnrichment?.stop();this.gameReviews?.stop();this.stopping=(async()=>{await Promise.all([this.reader?.stop(),this.ankiRunner?.stop().catch(()=>{})]);this.localLearning?.stop();if(this.modelStore)for(const id of Object.keys(this.modelStore.jobs))this.modelStore.cancel(id);this.localEngine?.cancel();await Promise.allSettled([this.serviceManager?.stop(),this.localEngine?.stop()]);})();return this.stopping;}
}
module.exports={Runtime};
