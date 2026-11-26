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
const DEFAULT_VOICE_PREP_MS=45000;
class Services{
 constructor(root,options={}){this.root=root;this.children=[];this.starting=null;this.preparingDefaultVoices=null;this.epoch=0;this.controller=new AbortController();this.fetch=options.fetch||fetch;this.prepare=options.prepare||require('./speech-setup.cjs').prepareSpeechModel;this.spawn=options.spawn||spawn;this.exe=options.exe||require('./layout.cjs').aivis;this.killTree=options.killTree||killTree;this.releasing=Promise.resolve();this.game='';this.log=message=>fs.appendFileSync(path.join(this.root,'logs','speech-engine.log'),message+'\n');}
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
 cachedSpeakers(){try{const list=JSON.parse(fs.readFileSync(path.join(this.root,'cache','speakers.json'),'utf8'));return Array.isArray(list)?list:[];}catch{return [];}}
 async stopSpeech(){const voiceCleanup=this.preparingDefaultVoices;this.epoch++;this.controller.abort();this.controller=new AbortController();this.starting=null;const children=this.children.splice(0);const previous=this.releasing;this.releasing=Promise.allSettled([previous,voiceCleanup,...children.map(child=>this.killTree(child))]);await this.releasing;}
 ensureSpeech(url='http://127.0.0.1:10101',gpu=true){
  if(this.stopping)return Promise.reject(Error('程序正在退出'));if(this.starting)return this.starting;
  const epoch=this.epoch,signal=this.controller.signal,check=()=>{if(this.stopping||epoch!==this.epoch)throw Error('语音启动已取消');};
  const probe=async()=>{try{const r=await this.fetch(url+'/version',{signal:AbortSignal.any([signal,AbortSignal.timeout(1000)])});return r.ok;}catch{return false;}};
  const job=(async()=>{await this.releasing;check();const ready=await probe();check();if(ready)return;
   if(url!=='http://127.0.0.1:10101')throw Error('无法连接所配置的 AivisSpeech 地址，请先启动对应引擎');
   const exe=this.exe;if(!fs.existsSync(exe))throw Error('缺少 AivisSpeech 引擎，请完整解压语音组件');
   // Keep time for the engine's ordinary startup when the model host is slow or unreachable.
   const voicePrepSignal=AbortSignal.any([signal,AbortSignal.timeout(DEFAULT_VOICE_PREP_MS)]);
   await this.prepare(this.log);check();
   let voices;
   try{voices=require('./voice-pack.cjs').prepareDefaultVoices({fetch:this.fetch,signal:voicePrepSignal});this.preparingDefaultVoices=voices;await voices;}
   catch(e){check();this.log('[MeguLit] default voice preparation failed; AivisSpeech will handle first-run setup: '+e.message);}
   finally{if(this.preparingDefaultVoices===voices)this.preparingDefaultVoices=null;}
   const marker=path.join(this.root,'cache','speech-gpu-unavailable'),modes=gpu&&!fs.existsSync(marker)?['--use_gpu','--no-use_gpu']:['--no-use_gpu'];
   const logFile=path.join(this.root,'logs','speech-engine.log');
   for(const mode of modes){check();this.log('[MeguLit] starting AivisSpeech with '+mode);const log=fs.openSync(logFile,'a');let child,attemptStart;try{attemptStart=fs.fstatSync(log).size;child=this.spawn(exe,['--host','127.0.0.1','--port','10101',mode],{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore',log,log]});}finally{fs.closeSync(log);}this.children.push(child);let failed=false;child.on('error',()=>{failed=true;});child.on('exit',()=>{failed=true;});
    const until=Date.now()+180000;while(Date.now()<until&&!failed){await require('node:timers/promises').setTimeout(500,undefined,{signal});check();const ready=await probe();check();if(ready){this.mode=mode;return;}}
    await this.killTree(child);this.children=this.children.filter(c=>c!==child);check();
    if(defaultVoiceRateLimited(logFile,attemptStart)){
     this.log('[MeguLit] AivisHub rate-limited the default voice download (HTTP 429)');
     throw Error('AivisHub 默认语音模型下载被限流（HTTP 429），请稍后重试');
    }
    if(mode==='--use_gpu')try{fs.writeFileSync(marker,new Date().toISOString());}catch{}
   }throw Error('AivisSpeech 尚未就绪，首次启动可能需要下载模型，请查看 speech-engine.log');
  })();this.starting=job;job.finally(()=>{if(this.starting===job)this.starting=null;}).catch(()=>{});return job;
 }

 stop(){this.stopping=true;return this.stopSpeech();}
}
function killTree(child){if(!child.pid||child.exitCode!==null)return Promise.resolve();if(process.platform!=='win32'){child.kill();return Promise.resolve();}return new Promise(resolve=>{const task=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});task.once('error',()=>{try{child.kill();}catch{}resolve();});
  // taskkill can fail (access, timing); then kill the child directly. Either way wait (5 s at most) until it has
  // really exited, so a quick game restart never finds the old engine still holding the port or the GPU.
  task.once('exit',code=>{if(code&&child.exitCode===null)try{child.kill();}catch{}if(child.exitCode!==null||child.signalCode)return resolve();const timer=setTimeout(resolve,5000);timer.unref?.();child.once('exit',()=>{clearTimeout(timer);resolve();});});});}
module.exports={Services};
