// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: MeguLit quietly captures the game's good-looking scenes, adult scenes included, for the back of the
   detail card). While a game is read, a clean capture of the game window alone (never MeguLit's own layer) is taken at
   most every 30 s on a new line, and at once (5 s apart) when the dialogue box leaves the screen, where CGs and cut-ins
   usually are. The native side scores its looks (colour, contrast, detail; fades, menus and loading screens score 0)
   and gives a difference hash; only the card's 3:4 face is stored (the upright window with the most detail, where the
   characters usually are, at most 720x960), the rest of the frame is never written. Only scenes that look different are kept, a near-duplicate replaces the weaker one, and
   each game keeps its best 48: a weaker near-duplicate or anything pushed out of the 48 is deleted at once. Everything stays on this computer under data/scene-shots; Settings › Library
   (library.json sceneShots:false) stops it. Nothing is filtered by content: the user asked for adult scenes too. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const KEEP=48,MIN_SCORE=38,SAME=10,LINE_GAP=30000,HIDE_GAP=5000;
const keyOf=exe=>crypto.createHash('sha1').update(path.resolve(String(exe)).toLowerCase()).digest('hex').slice(0,16);
const dirOf=(root,exe)=>path.join(root,'data','scene-shots',keyOf(exe));
function readIndex(dir){try{const v=JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8'));return Array.isArray(v)?v:[];}catch{return [];}}
function writeIndex(dir,list){fs.mkdirSync(dir,{recursive:true});const f=path.join(dir,'index.json');fs.writeFileSync(f+'.tmp',JSON.stringify(list));fs.renameSync(f+'.tmp',f);}
function hamming(a,b){if(!a||!b||a.length!==b.length)return 64;let x=BigInt('0x'+a)^BigInt('0x'+b),n=0;while(x){n+=Number(x&1n);x>>=1n;}return n;}
/* keep one capture: returns what happened, for the log and the tests */
function keep(root,exe,shot,now=Date.now()){
 if(!shot?.jpeg||!(shot.score>=MIN_SCORE)||!/^[0-9a-f]{16}$/.test(shot.hash||''))return 'skipped';
 const dir=dirOf(root,exe),list=readIndex(dir),near=list.find(it=>hamming(it.hash,shot.hash)<=SAME);
 if(near&&near.score>=shot.score)return 'duplicate';
 /* a full shelf where every kept shot scores higher: the new one would be written and deleted at once */
 {const others=list.filter(it=>it!==near);if(others.length>=KEEP&&others.every(it=>it.score>=shot.score))return 'skipped';}
 const file=now.toString(36)+'-'+shot.hash.slice(0,6)+'.jpg';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,file),Buffer.from(shot.jpeg,'base64'));
 let next=list.filter(it=>it!==near);if(near)try{fs.rmSync(path.join(dir,near.file),{force:true});}catch{}
 next.push({file,score:shot.score,hash:shot.hash,at:now});next.sort((a,b)=>b.score-a.score);
 for(const drop of next.slice(KEEP))try{fs.rmSync(path.join(dir,drop.file),{force:true});}catch{}
 writeIndex(dir,next.slice(0,KEEP));return near?'replaced':'kept';
}
/* called by the reader on every new line (hidden=false) and when the dialogue box leaves the screen (hidden=true) */
async function maybe(reader,{hidden=false}={}){
 try{const exe=reader.gameExe,gal=reader.gal;if(!exe||!gal?.sceneShot)return;let lib={};try{lib=JSON.parse(fs.readFileSync(path.join(reader.root,'data','config','library.json'),'utf8'));}catch{}if(lib.sceneShots===false)return;
  const now=Date.now(),state=reader.sceneShotState||(reader.sceneShotState={at:0,busy:false});
  if(state.busy||now-state.at<(hidden?HIDE_GAP:LINE_GAP))return;state.busy=true;state.at=now;
  try{if(hidden)await new Promise(r=>setTimeout(r,700));const shot=await gal.sceneShot();if(shot)keep(reader.root,exe,shot);}finally{state.busy=false;}
 }catch{}
}
function list(root,exe){return readIndex(dirOf(root,exe)).map(it=>({file:it.file,score:it.score,at:it.at}));}
function read(root,exe,file){if(!/^[0-9a-z]+-[0-9a-f]{6}\.jpg$/.test(String(file)))throw Error('SHOT_NOT_FOUND');const f=path.join(dirOf(root,exe),file);if(!fs.existsSync(f))throw Error('SHOT_NOT_FOUND');return {mime:'image/jpeg',data:fs.readFileSync(f).toString('base64')};}
module.exports={maybe,keep,list,read,hamming,KEEP,MIN_SCORE};
