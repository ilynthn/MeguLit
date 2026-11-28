'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function defaultVoiceRateLimited(file,attemptStart){
 let fd;
 try{
  fd=fs.openSync(file,'r');
  const end=fs.fstatSync(fd).size,start=Math.max(attemptStart,end-64*1024);
  if(end<=start)return false;
  const buffer=Buffer.alloc(end-start);
  const bytes=fs.readSync(fd,buffer,0,buffer.length,start);
  const attempts=buffer.toString('utf8',0,bytes).split(/(?=Downloading AIVMX file from )/);
  return attempts.some(attempt=>{
   const exhausted=/Failed to download AIVMX file from (https:\/\/api\.aivis-project\.com\/v1\/aivm-models\/[a-f0-9-]+\/download)\?\S+ after \d+ attempts\./i.exec(attempt);
   return exhausted&&attempt.includes('Failed to install default model.')&&attempt.split('\n').some(line=>line.includes('429 Too Many Requests')&&line.includes(exhausted[1]+'?'));
  });
 }catch{return false;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
/* 2026-11-28 (1.4.26 QQ group report: 语音引擎「已就绪」，读取已安装声音却「操作失败」). AivisSpeech asks huggingface.co about the BERT
   files on every start, even with the cache complete; where that host is blocked each ask waits 10 s × 5 retries and port 10101
   never opens (speech-engine.log: "Connection to huggingface.co timed out"). The lines below name that, and the other ways a
   start ends, so the settings page can say what happened instead of 操作失败. */
function hubUnreachable(file,attemptStart){return engineLogSince(file,attemptStart).split('\n').some(line=>/huggingface\.co/i.test(line)&&/timed out|Max retries exceeded|ConnectTimeout|ConnectionError|Failed to resolve|getaddrinfo/i.test(line));}
function portInUse(file,attemptStart){return /address already in use|error while attempting to bind|Errno 10048|WinError 10048/i.test(engineLogSince(file,attemptStart));}
function engineLogSince(file,attemptStart){let fd;try{fd=fs.openSync(file,'r');const end=fs.fstatSync(fd).size,start=Math.max(attemptStart,end-64*1024);if(end<=start)return '';const buffer=Buffer.alloc(end-start);return buffer.toString('utf8',0,fs.readSync(fd,buffer,0,buffer.length,start));}catch{return '';}finally{if(fd!==undefined)fs.closeSync(fd);}}
/* An error the service bridge passes to the page as its code (services/server.cjs), with the Chinese text kept for the reader */
function speechError(code,message){return Object.assign(Error(message),{code});}
function tcpOpen(port,host='127.0.0.1'){return new Promise(resolve=>{const socket=require('node:net').connect({port,host});const done=open=>{socket.destroy();resolve(open);};socket.setTimeout(800,()=>done(false));socket.once('connect',()=>done(true));socket.once('error',()=>done(false));});}
const DEFAULT_VOICE_PREP_MS=45000,START_WAIT_MS=180000;
class Services{
 constructor(root,options={}){this.root=root;this.children=[];this.starting=null;this.preparingDefaultVoices=null;this.epoch=0;this.controller=new AbortController();this.fetch=options.fetch||fetch;this.prepare=options.prepare||require('./speech-setup.cjs').prepareSpeechModel;this.spawn=options.spawn||spawn;this.exe=options.exe||require('./layout.cjs').aivis;this.killTree=options.killTree||killTree;this.portOpen=options.portOpen||tcpOpen;this.startWaitMs=options.startWaitMs||START_WAIT_MS;this.lastError=null;this.releasing=Promise.resolve();this.game='';this.log=message=>fs.appendFileSync(path.join(this.root,'logs','speech-engine.log'),message+'\n');}
 async gameEvent(message,config){
  if(message.type==='gameClosed'){this.game='';await this.stopSpeech();this.log('[MeguLit] game closed; owned speech process tree released');return;}
  if(!['bound','snapshot'].includes(message.type)||!message.gameProcessId)return;
  const identity=message.gameProcessId+'|'+(message.gameStarted||'');if(identity===this.game)return;this.game=identity;
  const epoch=this.epoch,signal=this.controller.signal;
  try{this.log('[MeguLit] game speech warmup '+identity);await this.ensureSpeech(config.aivisUrl,config.aivisGpu);if(epoch!==this.epoch)return;
   const url=config.aivisUrl;const sr=await this.fetch(url+'/speakers',{signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});if(sr.ok===false)throw Error('Speakers HTTP '+sr.status);const list=await sr.json();if(epoch!==this.epoch)return;this.rememberSpeakers(list);
   const styles=list.flatMap(s=>s.styles||[]),speaker=styles.find(s=>s.id===config.aivisSpeaker)||styles[0];if(!speaker)throw Error('No installed speech style');
   const r=await this.fetch(url+'/initialize_speaker?'+new URLSearchParams({speaker:String(speaker.id),skip_reinit:'true'}),{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});if(!r.ok)throw Error('Speaker warmup HTTP '+r.status);if(epoch===this.epoch)this.log('[MeguLit] game speech model ready '+identity);
  }catch(e){if(epoch===this.epoch&&!this.stopping)this.log('[MeguLit] game speech warmup failed: '+e.message);}
 }
 rememberSpeakers(list){if(!Array.isArray(list))return;try{const file=path.join(this.root,'cache','speakers.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(list));fs.renameSync(file+'.tmp',file);}catch{}}
 /* What the settings page shows next to the installed voice pack: 已就绪 only when the engine answers now, never from files alone. Never starts it. */
 async status(url='http://127.0.0.1:10101'){let running=false;try{const r=await this.fetch(url+'/version',{signal:AbortSignal.timeout(1500)});running=r.ok!==false;}catch{}return {running,starting:!!this.starting,mode:running?this.mode||null:null,error:running?null:this.lastError};}
 cachedSpeakers(){try{const list=JSON.parse(fs.readFileSync(path.join(this.root,'cache','speakers.json'),'utf8'));return Array.isArray(list)?list:[];}catch{return [];}}
 async stopSpeech(){const voiceCleanup=this.preparingDefaultVoices;this.epoch++;this.controller.abort();this.controller=new AbortController();this.starting=null;const children=this.children.splice(0);const previous=this.releasing;this.releasing=Promise.allSettled([previous,voiceCleanup,...children.map(child=>this.killTree(child))]);await this.releasing;}
 ensureSpeech(url='http://127.0.0.1:10101',gpu=true){
  if(this.stopping)return Promise.reject(Error('程序正在退出'));if(this.starting)return this.starting;
  const epoch=this.epoch,signal=this.controller.signal,check=()=>{if(this.stopping||epoch!==this.epoch)throw Error('语音启动已取消');};
  const probe=async(ms=1000)=>{try{const r=await this.fetch(url+'/version',{signal:AbortSignal.any([signal,AbortSignal.timeout(ms)])});return r.ok;}catch{return false;}};
  const job=(async()=>{await this.releasing;check();const ready=await probe();check();if(ready)return;
   if(url!=='http://127.0.0.1:10101')throw speechError('SPEECH_REMOTE_UNREACHABLE','无法连接所配置的 AivisSpeech 地址，请先启动对应引擎');
   const exe=this.exe;if(!fs.existsSync(exe))throw speechError('SPEECH_ENGINE_MISSING','缺少 AivisSpeech 引擎，请完整解压语音组件');
   // Something holds 10101: an engine busy with a long synthesis gets more time to answer; anything else blocks a new engine from binding.
   if(await this.portOpen(10101)){check();if(await probe(8000)){check();return;}throw speechError('SPEECH_PORT_BUSY','端口 10101 被其他程序占用，AivisSpeech 无法启动；请关闭占用它的程序（或另一个 AivisSpeech）后重试');}check();
   // Keep time for the engine's ordinary startup when the model host is slow or unreachable.
   const voicePrepSignal=AbortSignal.any([signal,AbortSignal.timeout(DEFAULT_VOICE_PREP_MS)]);
   await this.prepare(this.log);check();
   let voices;
   try{voices=require('./voice-pack.cjs').prepareDefaultVoices({fetch:this.fetch,signal:voicePrepSignal});this.preparingDefaultVoices=voices;await voices;}
   catch(e){check();this.log('[MeguLit] default voice preparation failed; AivisSpeech will handle first-run setup: '+e.message);}
   finally{if(this.preparingDefaultVoices===voices)this.preparingDefaultVoices=null;}
   const marker=path.join(this.root,'cache','speech-gpu-unavailable'),modes=gpu&&!fs.existsSync(marker)?['--use_gpu','--no-use_gpu']:['--no-use_gpu'];
   const logFile=path.join(this.root,'logs','speech-engine.log');
   for(const mode of modes){check();this.log('[MeguLit] starting AivisSpeech with '+mode);const log=fs.openSync(logFile,'a');let child,attemptStart;try{attemptStart=fs.fstatSync(log).size;
     /* this.prepare above has just checked every BERT file against its SHA-256, so the engine needs nothing from Hugging Face:
        offline, it loads the cache at once instead of hanging on a blocked huggingface.co (2026-11-28, see hubUnreachable) */
     child=this.spawn(exe,['--host','127.0.0.1','--port','10101',mode],{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});}finally{fs.closeSync(log);}this.children.push(child);let failed=false;child.on('error',()=>{failed=true;});child.on('exit',()=>{failed=true;});
    const until=Date.now()+this.startWaitMs;while(Date.now()<until&&!failed){await require('node:timers/promises').setTimeout(500,undefined,{signal});check();const ready=await probe();check();if(ready){this.mode=mode;return;}}
    await this.killTree(child);this.children=this.children.filter(c=>c!==child);check();
    if(defaultVoiceRateLimited(logFile,attemptStart)){
     this.log('[MeguLit] AivisHub rate-limited the default voice download (HTTP 429)');
     throw speechError('SPEECH_VOICE_RATE_LIMITED','AivisHub 默认语音模型下载被限流（HTTP 429），请稍后重试');
    }
    // A network or port failure is not the graphics card's fault: do not mark the GPU unusable or try the CPU, which would hang the same way.
    if(hubUnreachable(logFile,attemptStart))throw speechError('SPEECH_HUB_UNREACHABLE','AivisSpeech 启动时连不上 huggingface.co，卡在加载断句模型；请检查网络或代理后重试（详情见 speech-engine.log）');
    if(portInUse(logFile,attemptStart))throw speechError('SPEECH_PORT_BUSY','端口 10101 被其他程序占用，AivisSpeech 无法启动；请关闭占用它的程序（或另一个 AivisSpeech）后重试');
    if(mode==='--use_gpu')this.log('[MeguLit] AivisSpeech did not start on the GPU; retrying on the CPU');
    if(mode==='--use_gpu')try{fs.writeFileSync(marker,new Date().toISOString());}catch{}
   }throw speechError('SPEECH_START_TIMEOUT','AivisSpeech 尚未就绪，首次启动可能需要下载模型，请查看 speech-engine.log');
  })().then(()=>{if(epoch===this.epoch)this.lastError=null;},error=>{
   // One line per failed start in speech-engine.log, which the feedback package (一键上传问题反馈) carries.
   if(epoch===this.epoch&&!this.stopping){this.lastError=error.code||'SPEECH_FAILED';try{this.log('[MeguLit] speech start failed: '+this.lastError+' '+error.message);}catch{}}throw error;});this.starting=job;job.finally(()=>{if(this.starting===job)this.starting=null;}).catch(()=>{});return job;
 }

 stop(){this.stopping=true;return this.stopSpeech();}
}
function killTree(child){if(!child.pid||child.exitCode!==null)return Promise.resolve();if(process.platform!=='win32'){child.kill();return Promise.resolve();}return new Promise(resolve=>{const task=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});task.once('error',()=>{try{child.kill();}catch{}resolve();});
  // taskkill can fail (access, timing); then kill the child directly. Either way wait (5 s at most) until it has
  // really exited, so a quick game restart never finds the old engine still holding the port or the GPU.
  task.once('exit',code=>{if(code&&child.exitCode===null)try{child.kill();}catch{}if(child.exitCode!==null||child.signalCode)return resolve();const timer=setTimeout(resolve,5000);timer.unref?.();child.once('exit',()=>{clearTimeout(timer);resolve();});});});}
module.exports={Services};
