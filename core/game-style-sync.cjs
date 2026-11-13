// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
// Publish the current visible line; a short line retains the existing wrap width in the reader.
const NEEDED=1;
const profileTools=require('./game-profile.js'),gameStyle=require('./game-style.js'),islandSource=require('./island-source.js');
const median=values=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:undefined;};
// Several measured lines -> one result: medians for size-like values, the union of the measured text for position.
function combine(samples){
 const valid=samples.filter(s=>s&&s.style&&Number.isFinite(s.width)&&s.width>0);if(!valid.length)return null;
 const n=k=>valid.map(s=>Number(s[k])),st=k=>valid.map(s=>Number(s.style[k]));
 const width=median(n('width')),height=median(n('height'));
 const x=Math.min(...st('x').filter(Number.isFinite)),y=Math.min(...st('y').filter(Number.isFinite));
 const right=Math.max(...valid.map(s=>Number(s.style.x)+Number(s.style.width)).filter(Number.isFinite));
 const bottom=Math.max(...valid.map(s=>Number(s.style.y)+Number(s.style.height||0)).filter(Number.isFinite));
 // Colours differ slightly from line to line (anti-aliasing, background): the per-channel median, not an exact match.
 // Many games draw already-read lines in another colour (ISLAND: unread white, read blue). Never average the two:
 // samples are split by whether ToMe had shown that line before, and each group gets its own median.
 // E282 (user: 爱上火车 turned pure black after a manual calibration): the read colour came out #030304, the outline
 // under white text. Games tint read lines (ISLAND: white -> blue); they never turn white text black or black text
 // white, so a read colour on the far side of the brightness scale is a mis-measure and is dropped.
 const luma=hex=>{const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex||'');return m?(.2126*parseInt(m[1],16)+.7152*parseInt(m[2],16)+.0722*parseInt(m[3],16))/255:null;};
 const inverted=(a,b)=>{const x=luma(a),y=luma(b);return x!==null&&y!==null&&Math.abs(x-y)>.6;};
 const colour=list=>{const rgb=list.map(s=>/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s.style.textColor||'')).filter(Boolean).map(m=>m.slice(1).map(v=>parseInt(v,16)));return rgb.length?'#'+[0,1,2].map(i=>Math.round(median(rgb.map(c=>c[i]))).toString(16).padStart(2,'0')).join(''):undefined;};
 const unread=valid.filter(s=>s.read!==true),read=valid.filter(s=>s.read===true),textColor=colour(unread.length?unread:valid),readTextColor=read.length&&unread.length?colour(read):undefined;
 const style={x,y,width:Math.min(100-x,right-x),textHeight:Number.isFinite(bottom)?bottom-y:undefined,japaneseSize:median(st('japaneseSize')),japaneseSpacingPx:median(st('japaneseSpacingPx')),lineHeight:median(st('lineHeight')),paddingX:0,paddingY:0,autoScale:true};
 const palette=(list,prefix)=>{if(!list.length)return;const gradients=list.filter(s=>s.style.textGradient===true&&/^#[0-9a-f]{6}$/i.test(s.style.textGradientTop||'')&&/^#[0-9a-f]{6}$/i.test(s.style.textGradientBottom||''));
   if(gradients.length>=Math.ceil(list.length*.6)){style[prefix+'Gradient']=true;for(const side of ['Top','Bottom'])style[prefix+'Gradient'+side]=colour(gradients.map(s=>({style:{textColor:s.style['textGradient'+side]}})));}
   else style[prefix+'Gradient']=false;};
 if(textColor)style.textColor=textColor;if(readTextColor)style.readTextColor=readTextColor;
 /* E550 the measured colour also belongs to the kind of line it was measured on (speech in 「」 / narration): games like
    ファタモルガーナの館 draw narration grey and speech white, and the reader paints later lines of each kind with their own colour. */
 {const kinds=[...new Set((unread.length?unread:valid).map(s=>s.lineKind))];if(textColor&&kinds.length===1&&['speech','narration'].includes(kinds[0]))style[kinds[0]+'TextColor']=textColor;}
 palette(unread,'text');palette(read,'readText');
 if(!unread.length&&read.length){style.readTextColor=textColor;delete style.textColor;}
 if(style.textColor&&style.readTextColor&&inverted(style.textColor,style.readTextColor)){style.readTextColor='';style.readTextGradient=false;}

 return {valid:true,method:'visual-measurement',samples:valid.length,width,height,inkHeight:median(n('inkHeight')),advance:median(n('advance')),lineStep:median(n('lineStep').filter(v=>v>0)),wrapWidth:Math.max(0,...n('wrapWidth').filter(Number.isFinite)),inkLeft:Math.min(...n('inkLeft').filter(Number.isFinite)),inkTop:Math.min(...n('inkTop').filter(Number.isFinite)),rows:Math.max(...n('rows').filter(Number.isFinite)),positionSamples:valid.filter(s=>Number.isSafeInteger(s.sourceToken)).map(s=>({token:s.sourceToken,inkLeft:s.inkLeft,inkTop:s.inkTop,textWidth:Number(s.style.width)*s.width/100})),style};
}
class GameStyleSync{
 constructor(layout,emit,spawnHelper=spawn){this.layout=layout;this.emit=emit;this.spawn=spawnHelper;this.seq=0;this.source='';this.enabled=true;this.lastAt=0;this.generation=0;this.samples=[];this.profiles={};
  // Settings the user confirmed for a game (keyed by the game executable's hash), applied at every launch.
  this.profileFile=layout.config?path.join(layout.config,'game-style-profiles.json'):null;
  try{const v=JSON.parse(fs.readFileSync(this.profileFile,'utf8'));if(v&&[1,2,3].includes(v.version)&&v.entries&&typeof v.entries==='object')this.profiles=Object.fromEntries(Object.entries(v.entries).map(([k,e])=>[k.toLowerCase(),profileTools.normalize(e)]).filter(([k,e])=>/^[a-f0-9]{64}$/.test(k)&&e));}catch{}
  // How engine draw-hook coordinates map to the screen for each game (text-position.js), from a position sync.
  this.mapFile=layout.config?path.join(layout.config,'game-position-maps.json'):null;this.maps={};try{const v=JSON.parse(fs.readFileSync(this.mapFile,'utf8'));if(v&&v.version===1&&v.entries&&typeof v.entries==='object')this.maps=v.entries;}catch{}for(const [key,entry]of Object.entries(this.profiles))if(Object.hasOwn(entry,'positionMap')){const m=profileTools.map(entry.positionMap);if(m)this.maps[key]=m;else if(m===null)delete this.maps[key];}}
 get profile(){return this.profileKey?this.profiles[this.profileKey]||null:null;}
 configure(p,s){const identity=String(s.gameProcessId||'')+'|'+String(s.gameStarted||'');if(identity!==this.identity){this.identity=identity;this.generation++;this.source='';this.latest=null;this.profileKey=null;this.samples=[];this.lastAt=0;this.calibrating=false;clearTimeout(this.timer);}this.p=p;this.s=s;
  const key=/^[a-f0-9]{64}$/i.test(String(s.gameStyleKey||''))?String(s.gameStyleKey).toLowerCase():null;
  this.gameName=String(s.gameTitle||s.processName||p.gameProcess||'').trim().slice(0,180);
  if(key&&key!==this.profileKey){this.profileKey=key;const entry=this.profile;if(entry?.textSavedAt)this.latest={profile:true};this.status('profile',{gameStyleProfile:entry?.prefs||{},gameStyleEffectivePrefs:{...this.base(),...entry?.prefs},gameStylePositionMap:this.maps[key]||null});}
  this.enabled=p.autoGameStyle!==false;if(!this.enabled&&!this.calibrating){clearTimeout(this.timer);this.generation++;}}
 snapshot(){const e=this.profile;return {gameStyleIdentity:this.identity||'',gameStyleKey:this.profileKey,gameStyleGameName:this.gameName||e?.name||'',gameStyleTextSavedAt:e?.textSavedAt||0,gameStylePositionSavedAt:e?.positionSavedAt||0,gameStyleSavedAt:e?.savedAt||0,gameStyleHistory:(e?.history||[]).slice(0,7)};}
 // Calibration import lists: other saved works on this PC, names and save times only. importFrom reads one group
 // (text appearance, or position/wrap with its coordinate map) of a source work; it never writes the source.
 savedWorks(){return Object.entries(this.profiles||{}).filter(([key,e])=>key!==this.profileKey&&e&&e.prefs).map(([key,e])=>({key,name:String(e.name||key).slice(0,120),textSavedAt:e.textSavedAt||0,positionSavedAt:e.positionSavedAt||0})).sort((a,b)=>Math.max(b.textSavedAt,b.positionSavedAt)-Math.max(a.textSavedAt,a.positionSavedAt)).slice(0,200);}
 importFrom(key,part){const e=this.profiles?.[key];if(!e||!e.prefs||key===this.profileKey||!['text','position'].includes(part))return null;return {prefs:profileTools.pick({...profileTools.pick(gameStyle.defaults,part),...e.prefs},part),map:part==='position'?(this.maps?.[key]||null):undefined};}
 // Built-in defaults, then the user's global text preset from the home settings (E215); a work's saved prefs go on top.
 base(){return {...profileTools.pick(gameStyle.defaults,'base'),...(this.profileFile?require('./text-defaults.cjs').read(path.dirname(this.profileFile)):{})};}
 replay(){this.status('profile',{gameStyleProfile:this.profile?.prefs||{},gameStyleEffectivePrefs:{...this.base(),...this.profile?.prefs},gameStylePositionMap:this.positionMap()});}
 // Measuring only runs during a calibration (the original is shown for it); between calibrations nothing is scanned.
 observe(source,read,engine=''){this.sourceEngine=engine;if(!source?.trim()||source===this.source)return;this.source=source.slice(0,4000);this.sourceRead=read===true;this.generation++;this.waitNext=false;if(this.calibrating)this.request(true);}
 resize(width,height){const key=width+'x'+height;if(this.size&&this.size!==key&&this.calibrating){this.generation++;this.request(true);}this.size=key;}
 request(force=false){if(this.waitNext&&this.calibrating){this.status('advance');return;}if(!this.calibrating&&!force||!this.s?.bound)return;if(!this.source){this.status('waitingSource');return;}clearTimeout(this.timer);this.force=force;const calibration=this.calibrating;this.timer=setTimeout(()=>{if(calibration&&!this.calibrating)return;this.sample();},Math.max(force&&!this.calibrating?0:450,this.lastAt+1200-Date.now()));this.timer.unref?.();}
 status(state,extra={}){const count=this.samples.length,needed=NEEDED;this.emit({type:'gameStyleStatus',gameStyleState:state,gameStyleSamples:count,gameStyleNeeded:needed,...this.snapshot(),gameStylePurpose:this.purpose||'all',gameStyleAutomatic:this.automatic===true,gameStyleOwner:this.owner||'',gameStyleCalibrationSerial:this.calibrationSerial||0,...extra});}
 begin(purpose='all'){this.purpose=['position','text'].includes(purpose)?purpose:'all';this.calibrationSerial=(this.calibrationSerial||0)+1;this.attemptGeneration=null;this.sampleAttempts=0;this.samples=[];this.calibrating=true;this.status('sampling',{gameStyleSamples:0,gameStyleNeeded:NEEDED});}
 // Ends a calibration with what was measured so far; false when nothing was.
 publish(){const result=combine(this.samples);this.samples=[];if(!result)return false;if(!result.style.textColor&&result.style.readTextColor)result.style.textColor=this.p?.textColor||gameStyle.defaults.textColor;if(!result.style.readTextGradient&&combine.inverted(result.style.textColor,result.style.readTextColor))result.style.readTextColor='';this.latest=result;this.status('measured',{gameStyle:result,gameStyleConfirm:true,gameStyleSamples:result.samples,gameStyleNeeded:Math.max(NEEDED,result.samples)});return true;}
 saveProfile(prefs,kind='all',key=this.profileKey,map,saveId){
  if(!this.profileKey||key!==this.profileKey||!prefs||typeof prefs!=='object')return false;
  const clean=profileTools.pick(prefs,kind),previous=this.profile||{prefs:{},textSavedAt:0,positionSavedAt:0},now=Math.max(Date.now(),(previous.savedAt||0)+1);
  if(map!==undefined&&profileTools.map(map)===undefined){this.status('saveFailed',{gameStyleSavedPart:kind,gameStyleSaveId:saveId});return false;}
  const next={...previous,name:this.gameName||previous.name||'',prefs:{...previous.prefs,...clean},savedAt:now};if(kind!=='position')next.textSavedAt=now;if(kind!=='text')next.positionSavedAt=now;
  const currentMap=map===undefined?this.positionMap():profileTools.map(map);next.positionMap=currentMap||null;
  const oldHistory=(previous.history||[]).slice();if(!oldHistory.length&&previous.savedAt)oldHistory.push({id:String(previous.savedAt),savedAt:previous.savedAt,prefs:profileTools.pick({...this.base(),...previous.prefs}),positionMap:this.positionMap()});
  next.history=[{id:String(now),savedAt:now,prefs:profileTools.pick({...this.base(),...next.prefs}),positionMap:currentMap||null},...oldHistory].slice(0,7);
  const entries={...this.profiles,[key]:next};if(!this.writeProfiles(entries)){this.status('saveFailed',{gameStyleSavedPart:kind,gameStyleSaveId:saveId});return false;}
  if(kind!=='text'&&map!==undefined&&!this.savePositionMap(map,key)){this.writeProfiles(this.profiles);this.status('saveFailed',{gameStyleSavedPart:kind,gameStyleSaveId:saveId});return false;}
  this.profiles=entries;if(next.textSavedAt)this.latest={profile:true};
  this.status('saved',{gameStyleSavedAt:now,gameStyleSavedPart:kind,gameStyleSaveId:saveId,gameStyleProfile:next.prefs,gameStyleEffectivePrefs:{...this.base(),...next.prefs},gameStylePositionMap:currentMap||null});return true;
 }
 updateProfile(prefs){const entry=this.profile;if(!entry)return;const values={};for(const k of Object.keys(entry.prefs))if(prefs[k]!==undefined)values[k]=prefs[k];return this.saveProfile(values,'all');}
 positionMap(){return this.profileKey?this.maps[this.profileKey]||null:null;}
 savePositionMap(map,key=this.profileKey){if(!this.profileKey||key!==this.profileKey)return false;
  if(map!==null&&(!map||typeof map!=='object'||![map.s,map.bx,map.by,map.dx,map.dy,map.cw,map.ch].every(Number.isFinite)||map.s<=.1||map.s>=10||Math.abs(map.bx)>20000||Math.abs(map.by)>20000||Math.abs(map.dx)>20000||Math.abs(map.dy)>20000||map.cw<=0||map.ch<=0))return false;
  const clean={};if(map)for(const [k,v]of Object.entries(map))if(/^[a-zA-Z]{1,20}$/.test(k)&&(typeof v==='string'&&v.length<40||Number.isFinite(v)))clean[k]=v;
  const maps={...this.maps};if(map)maps[this.profileKey]={...clean,savedAt:Date.now()};else delete maps[this.profileKey];
  try{if(!this.mapFile)return false;fs.writeFileSync(this.mapFile+'.tmp',JSON.stringify({version:1,entries:maps},null,1));fs.renameSync(this.mapFile+'.tmp',this.mapFile);}catch{this.status('saveFailed',{gameStyleSavedPart:'position'});return false;}
  this.maps=maps;this.status('positionMap',{gameStylePositionMap:this.positionMap()});return true;
 }
 // Lines this game has already shown, kept across sessions by hash: the read/unread state for engines that report no
 // per-line colour. Repeated callbacks for the current line keep its first answer.
 readLine(text){const key=this.profileKey,file=this.profileFile&&path.join(path.dirname(this.profileFile),'game-read-lines.json');if(!key||!file||typeof text!=='string'||!text.trim())return null;
  /* E335 (user 2026-11-10, 女装山脈: new lines showed in the read colour): a line comes back several times (voice end, repaint, other text in between); the second time it was already in the set and turned "read". Lines first seen in this run stay unread for this run, and line breaks/spaces do not count. */
  const line=text.replace(/\s+/g,'');if(!line)return null;if(this.readCurrent?.key===key&&this.readCurrent.line===line)return this.readCurrent.seen;
  if(!this.readSets){this.readSets={};try{for(const [k,v]of Object.entries(JSON.parse(fs.readFileSync(file,'utf8')).entries||{}))if(Array.isArray(v))this.readSets[k]=new Set(v.filter(Number.isSafeInteger));}catch{}}
  let h=2166136261;for(let i=0;i<line.length;i++)h=Math.imul(h^line.charCodeAt(i),16777619);h>>>=0;
  this.newLines??=new Set();const set=this.readSets[key]||(this.readSets[key]=new Set()),seen=set.has(h)&&!this.newLines.has(key+'|'+h);if(!set.has(h)){set.add(h);this.newLines.add(key+'|'+h);if(this.newLines.size>20000)this.newLines.delete(this.newLines.values().next().value);if(set.size>60000)set.delete(set.values().next().value);clearTimeout(this.readTimer);this.readTimer=setTimeout(()=>{try{const out={};for(const [k,v]of Object.entries(this.readSets))out[k]=[...v];fs.writeFileSync(file+'.tmp',JSON.stringify({version:1,entries:out}));fs.renameSync(file+'.tmp',file);}catch{}},3000);this.readTimer.unref?.();}
  this.readCurrent={key,line,seen};return seen;}
 writeProfiles(entries=this.profiles){if(!this.profileFile)return false;try{fs.writeFileSync(this.profileFile+'.tmp',JSON.stringify({version:3,entries},null,1));fs.renameSync(this.profileFile+'.tmp',this.profileFile);return true;}catch{return false;}}
 start(){if(this.child)return true;let exe=path.join(this.layout.native,'GameStyleProbe.exe');const pendingExe=path.join(this.layout.native,'GameStyleProbe.updated.exe');if(this.spawn===spawn&&fs.existsSync(pendingExe)){try{fs.copyFileSync(pendingExe,exe);fs.unlinkSync(pendingExe);}catch{exe=pendingExe;}}if(!fs.existsSync(exe)){this.status('unavailable');return false;}const child=this.child=this.spawn(exe,[],{cwd:this.layout.native,windowsHide:true,stdio:['pipe','pipe','ignore']});child.stdin.on('error',()=>{});
  createInterface({input:child.stdout}).on('line',line=>{if(line.length>30000)return;let m;try{m=JSON.parse(line);}catch{return;}if(!this.pending||m.id!==this.pending.id)return;const pending=this.pending;this.pending=null;clearTimeout(this.captureTimer);clearTimeout(this.timeout);if(pending.calibration&&(!this.calibrating||pending.session!==(this.calibrationSerial||0))){if(this.calibrating)this.request(true);return;}if(pending.generation!==this.generation){this.request(this.calibrating);return;}
   const missingColor=m.result?.valid&&this.purpose!=='position'&&!/^#[a-f0-9]{6}$/i.test(m.result.style?.textColor||'');
   if(m.id!==pending.id||!m.result?.valid||missingColor){this.emit({type:'gameStyleStatus',gameStylePreview:false});const retry=this.calibrating&&(this.sampleAttempts||0)<3;this.status(this.calibrating?(retry?'waitingOriginal':'unmatched'):'unmeasured',{gameStyleReason:missingColor?'text-color-unavailable':m.result?.reason||m.error||'unmeasured',gameStyleElapsedMs:m.elapsedMs,gameStyleAttempt:this.sampleAttempts||1,gameStyleAttemptLimit:3});if(retry)this.request(true);return;}
   this.emit({type:'gameStyleStatus',gameStylePreview:false});
   if(!this.calibrating){this.samples=[m.result];this.publish();return;}
   let sourceToken=2166136261;for(let i=0;i<this.source.length;i++)sourceToken=Math.imul(sourceToken^this.source.charCodeAt(i),16777619);m.result.sourceToken=this.sourceEngine==='cs2'?islandSource.token(this.source):sourceToken>>>0;m.result.read=this.sourceRead===true;m.result.lineKind=gameStyle.lineKind?gameStyle.lineKind(this.source):'';this.samples.push(m.result);this.status('sampling',{gameStyleSamples:this.samples.length,gameStyleElapsedMs:m.elapsedMs});
   // One complete visible sentence is enough; no requirement to advance through several different lines.
   if(this.samples.length>=NEEDED)this.publish();});
  const failed=()=>{if(this.child!==child)return;this.emit({type:'gameStyleStatus',gameStylePreview:false});this.child=null;this.pending=null;clearTimeout(this.timeout);this.status('unavailable');};child.on('error',failed);child.on('exit',failed);return true;}
 cancel(){if(this.calibrating)this.emit({type:'gameStyleStatus',gameStyleState:'cancelled'});clearTimeout(this.timer);clearTimeout(this.captureTimer);clearTimeout(this.timeout);this.pending=null;this.calibrating=false;this.generation++;this.calibrationSerial=(this.calibrationSerial||0)+1;this.emit({type:'gameStyleStatus',gameStylePreview:false});}
 captureReady(id){const p=this.pending;if(!p||p.id!==id||p.sent||p.generation!==this.generation||p.calibration&&(!this.calibrating||p.session!==(this.calibrationSerial||0)))return false;clearTimeout(this.captureTimer);p.sent=true;this.child?.stdin.write(JSON.stringify(p.request)+'\n');return true;}
 sample(){if(this.pending||!this.s?.bound||!this.source||!this.start())return;if(this.attemptGeneration!==this.generation){this.attemptGeneration=this.generation;this.sampleAttempts=0;}if(this.calibrating&&this.sampleAttempts>=3)return;this.sampleAttempts++;const id=++this.seq;this.lastAt=Date.now();this.pending={id,generation:this.generation,calibration:!!this.calibrating,session:this.calibrationSerial||0};const d={id,hwnd:String(this.s.gameHwnd),pid:Number(this.s.gameProcessId),source:this.source,overlayPid:this.overlayPid||0,scanX:0,scanY:0,scanWidth:100,scanHeight:100,captureMode:'visible-client'};this.pending.request=d;this.status('measuring',{gameStylePreview:true,gameStyleCaptureId:id});if(this.spawn===spawn){this.captureTimer=setTimeout(()=>this.captureReady(id),250);this.captureTimer.unref?.();}else this.captureReady(id);this.timeout=setTimeout(()=>{const old=this.child;this.child=null;this.pending=null;old?.kill();this.emit({type:'gameStyleStatus',gameStylePreview:false});this.status('timeout');},8000);this.timeout.unref?.();}
 stop(){clearTimeout(this.timer);clearTimeout(this.captureTimer);clearTimeout(this.timeout);this.calibrating=false;this.pending=null;this.generation++;this.child?.stdin.end();const child=this.child;this.child=null;if(child){const timer=setTimeout(()=>child.kill(),1000);timer.unref?.();}}
}
combine.inverted=(a,b)=>{const luma=hex=>{const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex||'');return m?(.2126*parseInt(m[1],16)+.7152*parseInt(m[2],16)+.0722*parseInt(m[3],16))/255:null;};const x=luma(a),y=luma(b);return x!==null&&y!==null&&Math.abs(x-y)>.6;};
module.exports={GameStyleSync,combine};
