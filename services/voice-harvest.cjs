// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Voice harvest: the reading side of native/runtimedump/Voice.cpp (inside MeguLitDump32/64.dll). While the user plays, the
// DLL saves every sound the game hands to DirectSound / XAudio2 / waveOut / FMOD as one clip, with the wall-clock time it
// started (<root>/<key>/voice/events.jsonl + NNNNN.wav). This module records when each hooked line was shown
// (voice/lines.jsonl), decides which clip is which line's voice, and keeps the result (voice/voice-map.json), so MeguLit
// can play the game's own CV for a line later (backlog, Anki card audio, replay); lines without a clip fall back to AI speech.
//
// Which clip is a line's voice:
//  - its start falls in the line's window: from LEAD ms before the line was hooked until the next line (at most LAG ms
//    after): engines start the voice together with the text, a little before or after the hook sees it;
//  - it is not music (longer than MAX_MS) nor a sound effect: shorter than MIN_MS, or the same clip (CRC) heard on 3+ different lines (click, page turn);
//  - several candidates: the one starting closest to the line;
//  - a clip the DLL saw cut off (stopped before it could play out) near the next line (the user clicked on) is partial: a full hearing of the
//    same line (later, or replayed from the backlog in another session) replaces it.
// Script voice commands ("voice mgm0001" next to a line) complete the map when the DLL saw the clip's file name.
// Middleware that mixes on its own (CRI ADX2, Wwise; modules/AudioMore.cpp) gives no PCM, only which cue started:
// events.jsonl lines with no file and name "<acb>|<cue>" or a Wwise event. A cue names one sound for good, so its first
// line binding is kept (voice-map.json cues: name -> line) and a script voice name/number matching the cue wins over time.
// Cue-only lines have no clip to play yet (lookup() stays null, cueFor() gives the cue for later extraction).
const fs=require('node:fs'),path=require('node:path');
const dump=require('./runtime-dump.cjs');
const gameVoice=require('./game-voice.cjs');
const LEAD=350,LAG=1600,MIN_MS=350,MAX_MS=30000,SE_REPEAT=3,CUT_GAP=1500,PAIR_BEFORE=1500;

const voiceDir=gameDir=>path.join(dump.dirFor(gameDir),'voice');
function readJsonl(file){let raw='';try{raw=fs.readFileSync(file,'utf8');}catch{return[];}
 const out=[];for(const l of raw.split('\n')){if(!l.trim())continue;try{out.push(JSON.parse(l));}catch{}}return out;}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}

// No switch (cold tool): it stops only for a game where the DLL faulted 3 times.
function enabled(gameDir){const d=dump.dirFor(gameDir);
 let faults=0;try{faults=fs.readFileSync(path.join(d,'voice','disabled.txt'),'utf8').split('\n').filter(Boolean).length;}catch{}
 return faults<3;}

// Called for every hooked line while the game runs (t: Date.now() when it arrived).
function noteLine(gameDir,text,t=Date.now()){const s=String(text||'').trim();if(!s)return;
 const d=voiceDir(gameDir);try{fs.mkdirSync(d,{recursive:true});fs.appendFileSync(path.join(d,'lines.jsonl'),JSON.stringify({t,text:s})+'\n');}catch{}}

// Clips from both inputs: played sounds (events.jsonl, audio APIs, PCM) and voice files the game read (files.jsonl: the
// original Ogg/Opus/... bytes, plain or decrypted in place; start = when it was read). Files over FILE_MAX are music.
const FILE_MAX=3<<20;
const events=gameDir=>{const d=voiceDir(gameDir),at=e=>({...e,path:path.join(d,e.file)});
 const ours=s=>/[\\/]runtime-dump[^\\/]*[\\/]/i.test(s||'');/* never our own output */
 // api "file" (modules/VoiceFile.cpp): a voice file the game read; over FILE_MAX it is music, not a voice (review item 6).
 const played=readJsonl(path.join(d,'events.jsonl')).filter(e=>e&&e.file&&Number.isFinite(e.start)&&!(e.api==='file'&&(e.bytes>FILE_MAX||ours(e.name)))).map(e=>e.api==='file'?{...at(e),raw:true,read:true,source:e.name}:at(e));
 const read=readJsonl(path.join(d,'files.jsonl')).filter(e=>e&&e.file&&Number.isFinite(e.start)&&e.bytes<=FILE_MAX&&!ours(e.source)).map(e=>({...at(e),raw:true,read:true,ms:e.ms||0}));
 return [...played,...read];};
// Cue-only events (CRI / Wwise): {start, name, api}, shaped as raw clips so match() treats them like sounds.
const CUE_APIS=new Set(['cri','wwise']);
const cues=gameDir=>readJsonl(path.join(voiceDir(gameDir),'events.jsonl')).filter(e=>e&&!e.file&&CUE_APIS.has(e.api)&&e.name&&Number.isFinite(e.start))
 .map(e=>({start:e.start,ms:0,raw:true,cue:String(e.name),api:e.api,crc:'cue:'+e.api+':'+e.name,file:''}));
const lines=gameDir=>readJsonl(path.join(voiceDir(gameDir),'lines.jsonl')).filter(l=>l&&l.text&&Number.isFinite(l.t));

// Pure matcher: lines [{text,t}] and clips [{start,ms,crc,stopped,...}] -> [{text, clip, partial, gap}].
function match(lineList,clipList){
 const ls=[...lineList].sort((a,b)=>a.t-b.t);let cs=[...clipList].filter(c=>c.raw||(c.ms>=MIN_MS&&c.ms<=MAX_MS)).sort((a,b)=>a.start-b.start);
 // A voice file read just before a sound starts is that sound's file (read, decode, play): the pair counts once, and
 // the original file is kept rather than the decoded PCM.
 // Each sound takes the latest unpaired read from PAIR_BEFORE before it to 150 ms after, if their lengths agree (the
 // read's from its own header; a cut-off sound may be shorter). Sounds heard more than once (a click, music) never take a
 // read. One pass over both lists in time order (review items 5, 6).
 const seen=new Map();for(const c of cs)if(!c.read){const k=c.crc||c.file;seen.set(k,(seen.get(k)||0)+1);}
 const reads=cs.filter(c=>c.read),enc=new Map(),paired=new Set();let j=0;
 for(const c of cs){if(c.read||seen.get(c.crc||c.file)>1)continue;
  while(j<reads.length&&reads[j].start<=c.start+150)j++;
  for(let k=j-1;k>=0&&reads[k].start>=c.start-PAIR_BEFORE;k--){const r=reads[k];if(paired.has(r)||!fits(r,c))continue;enc.set(c,r);paired.add(r);break;}}
 cs=cs.filter(c=>!paired.has(c)).map(c=>enc.has(c)?{...c,enc:enc.get(c)}:c);
 // Sound effects: the same clip near 3+ different lines.
 const near=new Map();
 for(const c of cs){const i=lineAt(ls,c.start);if(i<0)continue;const k=c.crc||c.file;if(!near.has(k))near.set(k,new Set());near.get(k).add(norm(ls[i].text));}
 const se=new Set([...near].filter(([,v])=>v.size>=SE_REPEAT).map(([k])=>k));
 // A clip heard again (backlog replay, a repeated line) belongs to where it was first heard.
 const first=new Set();for(const c of cs){const k=c.crc||c.file;if(first.has(k))se.add(c);else first.add(k);}
 // Each clip goes to the line whose window holds it and whose start is nearest; each line keeps its nearest clip.
 const per=new Map();
 for(const c of cs){if(se.has(c.crc||c.file)||se.has(c))continue;let bi=-1,bd=Infinity;
  for(let i=Math.max(0,lineFloor(ls,c.start)-2);i<ls.length&&ls[i].t<=c.start+LEAD;i++){const next=i+1<ls.length?ls[i+1].t:Infinity;
   if(c.start<ls[i].t-LEAD||c.start>Math.min(ls[i].t+LAG,next-50))continue;const d=Math.abs(c.start-ls[i].t-80);if(d<bd){bd=d;bi=i;}}
  if(bi<0)continue;const prev=per.get(bi);if(!prev||Math.abs(c.start-ls[bi].t-80)<Math.abs(prev.start-ls[bi].t-80))per.set(bi,c);}
 const out=[];
 for(const [i,c] of [...per].sort((a,b)=>a[0]-b[0])){const next=i+1<ls.length?ls[i+1].t:Infinity,end=c.start+(c.ms||0);
  out.push({text:ls[i].text,clip:c,partial:!!c.stopped&&next!==Infinity&&Math.abs(next-end)<CUT_GAP,gap:c.start-ls[i].t});}
 return out;}
// Lengths of a read file and a played sound agree: unknown on either side, or within 25% (400 ms at least); a sound cut off
// by the user may be shorter than its file, never much longer.
function fits(r,c){if(!r.ms||!c.ms)return true;const slack=Math.max(400,r.ms*0.25);return c.stopped?c.ms<=r.ms+slack:Math.abs(r.ms-c.ms)<=slack;}
// Index of the last line hooked by t+LEAD (-1: none, or more than LAG before t).
function lineAt(ls,t){let lo=0,hi=ls.length-1,r=-1;while(lo<=hi){const m=(lo+hi)>>1;if(ls[m].t<=t+LEAD){r=m;lo=m+1;}else hi=m-1;}return r>=0&&t-ls[r].t<=LAG?r:-1;}
function lineFloor(ls,t){let lo=0,hi=ls.length-1,r=0;while(lo<=hi){const m=(lo+hi)>>1;if(ls[m].t<=t){r=m;lo=m+1;}else hi=m-1;}return r;}
const norm=t=>gameVoice.norm(t);

function mapFile(gameDir){return path.join(voiceDir(gameDir),'voice-map.json');}
function loadMap(gameDir){try{const m=JSON.parse(fs.readFileSync(mapFile(gameDir),'utf8'));if(m&&m.lines)return m;}catch{}return {schema:1,lines:{}};}
// A better entry wins: script-confirmed > full > partial; between equals the longer clip.
function better(a,b){if(!b||!b.file)return !!a.file||!b;const r=x=>(x.src==='script'?4:0)+(x.partial?0:2);if(r(a)!==r(b))return r(a)>r(b);return (a.ms||0)>(b.ms||0);}
const CUE_KEYS=['cue','cueApi','cueSrc'];
function put(map,text,entry){const k=norm(text);if(!k)return false;const old=map.lines[k];if(!better(entry,old))return false;
 const keep={};if(old)for(const f of CUE_KEYS)if(old[f]!==undefined)keep[f]=old[f];/* a clip arriving later keeps the line's cue */
 map.lines[k]={...keep,...entry,text};return true;}
// Binds a cue to a line. A cue already bound stays where it is unless a script names it (src 'script').
function putCue(map,text,cue,api,src){const k=norm(text);if(!k)return false;const cs=map.cues||(map.cues={});
 if(src!=='script'&&map.lines[k]&&map.lines[k].cueSrc==='script')return false;
 const was=cs[cue];if(was&&(was.src==='script'||src!=='script'))return false;
 if(was&&was.key!==k&&map.lines[was.key]&&map.lines[was.key].cue===cue){const o=map.lines[was.key];if(o.file){delete o.cue;delete o.cueApi;delete o.cueSrc;}else delete map.lines[was.key];}
 cs[cue]={key:k,src};const e=map.lines[k]||{text,src:'cue'};map.lines[k]={...e,cue,cueApi:api,cueSrc:src};return true;}

// Reads everything recorded so far for this game and updates voice-map.json. Returns {lines, voiced, added}.
function build(gameDir,{script}={}){const map=loadMap(gameDir),ls=lines(gameDir),cs=events(gameDir);let added=0;
 for(const m of match(ls,cs)){const c=m.clip,f=c.enc||c;/* the read file is whole even when its playback was cut */
  if(!fs.existsSync(f.path))continue;
  if(put(map,m.text,{file:f.file,fmt:f.fmt||'wav',ms:c.ms,partial:c.enc?false:m.partial,src:c.enc?'time+file':c.read?'file':'time',gap:m.gap}))added++;}
 const cl=cues(gameDir);
 if(script)added+=fromScript(gameDir,script,map,cs,cl);/* names first: a cue a script names never goes to a line by time */
 for(const m of match(ls,cl))if(putCue(map,m.text,m.clip.cue,m.clip.api,'time'))added++;
 writeJSON(mapFile(gameDir),map);
 return {lines:new Set(ls.map(l=>norm(l.text))).size,voiced:Object.keys(map.lines).length,added};}
// Script pairs [{text, voice}] (voice: the file name or number the script plays): a clip whose opened file name matches.
function fromScript(gameDir,pairs,map=null,cs=null,cl=null){const own=!map;map=map||loadMap(gameDir);cs=cs||events(gameDir);cl=cl||cues(gameDir);
 const stem=s=>String(s||'').replace(/\\/g,'/').split('/').pop().replace(/\.[a-z0-9]{2,5}$/i,'').toLowerCase();
 const byName=new Map();for(const c of cs){const k=stem(c.name||c.source);if(k&&(!byName.has(k)||c.ms>byName.get(k).ms))byName.set(k,c);}
 // Cue names: the part after '|' (CRI) or the whole event (Wwise); numbers compare as numbers ("id:42" = "0042").
 const cueKey=s=>{let t=String(s||'');t=t.slice(t.lastIndexOf('|')+1).replace(/^(id|index|wave):/,'');t=stem(t);return /^\d+$/.test(t)?String(+t):t;};
 const byCue=new Map();for(const c of cl){const k=cueKey(c.cue);if(k&&!byCue.has(k))byCue.set(k,c);}
 let added=0;for(const p of pairs||[]){const c=byName.get(stem(p.voice));if(c&&put(map,p.text,{file:c.file,ms:c.ms,partial:false,src:'script'}))added++;
  const q=byCue.get(cueKey(p.voice));if(q&&putCue(map,p.text,q.cue,q.api,'script'))added++;}
 if(own)writeJSON(mapFile(gameDir),map);return added;}

// The game's own clip for a line, or null (then the caller speaks it with AI).
function lookup(gameDir,text){const k=norm(text);if(!k)return null;const e=loadMap(gameDir).lines[k];if(!e||!e.file)return null;
 const file=path.join(voiceDir(gameDir),e.file);return fs.existsSync(file)?{...e,path:file}:null;}

// The middleware cue bound to a line ({cue, api, src}), or null.
function cueFor(gameDir,text){const k=norm(text);const e=k&&loadMap(gameDir).lines[k];return e&&e.cue?{cue:e.cue,api:e.cueApi,src:e.cueSrc}:null;}

// Hands full (not partial) clips to game-voice, so every place that already asks game-voice.find() for a line's voice
// (learning page, saved sentences, Anki cards) plays them without knowing about this module.
// Only entries not handed over yet (or whose file changed); game-voice's index is saved once at the end (review item 5).
function publish(root,gameDir){const map=loadMap(gameDir);let n=0;
 for(const e of Object.values(map.lines)){if(e.partial||!e.file||e.published===e.file)continue;let b;try{b=fs.readFileSync(path.join(voiceDir(gameDir),e.file));}catch{continue;}
  if(gameVoice.remember(root,e.text,b,{game:'runtime',save:false}))n++;e.published=e.file;}
 if(n)gameVoice.flush(root);
 writeJSON(mapFile(gameDir),map);
 return n;}

// For the reader: a line handler that records each hooked line for the running game and, a few seconds after lines stop
// coming (and at most once a minute), matches what was recorded and hands the clips to game-voice. Never throws.
function recorder(root,exeOf,{every=60000,settle=4000}={}){let timer=null,last=0;
 const run=dir=>{timer=null;last=Date.now();try{if(!fs.existsSync(path.join(voiceDir(dir),'events.jsonl')))return;build(dir);publish(root,dir);}catch{}};
 return text=>{try{const exe=exeOf&&exeOf();if(!exe)return;const dir=path.dirname(String(exe));if(!enabled(dir))return;noteLine(dir,text);
  if(timer)clearTimeout(timer);timer=setTimeout(()=>run(dir),Math.max(settle,every-(Date.now()-last)));timer.unref?.();}catch{}};}

module.exports={recorder,enabled,noteLine,events,cues,lines,match,build,fromScript,lookup,cueFor,publish,voiceDir,_const:{LEAD,LAG,MIN_MS,MAX_MS,SE_REPEAT,CUT_GAP}};
