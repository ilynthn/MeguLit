// SPDX-License-Identifier: GPL-3.0-or-later
// E450 A sentence read aloud: the game's own voice when MeguLit has it (marked CV on the button), else the synthesized
// voice. Shared by the grammar lessons (examples, "your lines", 怎么接), the game page's saved lines and the saved
// sentences page.
/* 2026-11-15 (user: 我游戏里有cv的例句怎么出来朗读还是ai合成？) a saved line passes its id: the voice kept when it was saved
   plays first (services/saved-line-voice.cjs). labelVoices() names each button before it is clicked: 「原声」 when the game
   voiced the line, the page's own 「朗读」 otherwise. */
let latest=0,current=null,labelTicket=0;
const labelOf=new WeakMap();
const CSS='.cv-badge{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.04em;line-height:16px;vertical-align:middle;background:var(--mg-accent,#c04a5a);color:#fff}';
const GAME={zh:['原声','游戏原声 · 这句台词的 CV'],ja:['原音声','ゲームの音声 · このセリフの CV'],en:['Game voice','The game\'s own voice for this line']};
const locale=()=>{const l=String(document.documentElement.lang||'').toLowerCase();return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
function style(){if(document.getElementById('cv-badge-style'))return;const s=document.createElement('style');s.id='cv-badge-style';s.textContent=CSS;document.head.append(s);}
// The button's own label text node (icons and badges stay), or null.
function labelNode(button){const walk=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let last=null;for(let n=walk.nextNode();n;n=walk.nextNode())if(n.nodeValue.trim()&&!n.parentElement?.closest('.cv-badge'))last=n;return last;}
function setLabel(button,game){if(!button)return;button.querySelector('.cv-badge')?.remove();const node=labelNode(button);if(!node)return;
 if(button.dataset.voiceLabel===undefined){button.dataset.voiceLabel=node.nodeValue;button.dataset.voiceTitle=button.title||'';}
 const [word,title]=GAME[locale()];node.nodeValue=game?word:button.dataset.voiceLabel;button.title=game?title:button.dataset.voiceTitle;button.classList.toggle('is-game-voice',!!game);}
export function markSource(button,source,estimated=false){if(!button)return;style();labelOf.set(button,++labelTicket);button.dataset.voiceSource=source||'';
 setLabel(button,source==='game');
 if(source==='game'&&estimated){const b=document.createElement('span');b.className='cv-badge';b.textContent='CV?';b.title='游戏原声（按台词顺序与长度推定的对应）· Game voice, matched by order and length';button.append(b);}}
/* buttons: [{button, text, id?}] -> each labelled 「原声」 or left as 「朗读」. Never throws. */
export async function labelVoices(api,buttons){const list=(buttons||[]).filter(x=>x?.button&&x.text);if(!list.length)return;
 const ticket=++labelTicket;list.forEach(x=>labelOf.set(x.button,ticket));
 try{const r=await api('sentence_voice_has',{items:list.map(x=>({id:x.id??null,text:String(x.text).slice(0,400)}))});(r?.has||[]).forEach((h,i)=>{if(list[i].button.isConnected&&labelOf.get(list[i].button)===ticket)setLabel(list[i].button,!!h);});}catch{}}
export function stopSentence(){latest++;if(current){current.audio.pause();current.release();}}
export async function playSentence(api,text,button,{id}={}){
 const request=++latest,attached=!!button?.isConnected;
 if(current){current.audio.pause();current.release();}
 try{
  const r=await api('sentence_voice',{text:String(text||'').slice(0,400),...(id!==undefined&&id!==null?{id:Number(id)}:{})});
  if(request!==latest||(attached&&!button.isConnected))return;
  const bytes=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0)),audio=new Audio();
  if(typeof r.volume==='number'&&Number.isFinite(r.volume))audio.volume=Math.max(0,Math.min(1,r.volume));
  const url=URL.createObjectURL(new Blob([bytes],{type:r.mime||'audio/wav'}));
  const release=()=>{if(current?.audio===audio){current=null;URL.revokeObjectURL(url);}};
  current={audio,release};
  audio.addEventListener('ended',release,{once:true});audio.addEventListener('error',release,{once:true});
  audio.src=url;markSource(button,r.source,r.estimated);
  await audio.play();return r.source;
 }catch(error){
  if(request!==latest)return;
  current?.release();if(attached&&!button.isConnected)return;throw error;
 }}
