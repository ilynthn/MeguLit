// Only this controlled renderer executes in the opaque note sandbox.
(function(){
 'use strict';
 const nonce=location.hash.slice(1),root=document.querySelector('#card-content'),viewport=document.querySelector('#card-viewport'),stage=document.querySelector('#card-stage'),error=document.querySelector('#media-error');
 let fit=true,scheduled=false,playback=0,copy={play:'Play audio',failed:'Audio playback failed'};
 let mix={};
 function applyMix(){
  const level=channel=>Number.isFinite(mix[channel])?Math.min(1,Math.max(0,mix[channel]/100)):1;
  for(const audio of root.querySelectorAll('audio'))audio.volume=level('master')*level(audio.dataset?.ankiChannel||'');
 }
 function stopAudio(){playback++;root.querySelectorAll('audio').forEach(audio=>audio.pause());}
 function layout(){
  scheduled=false;const width=Math.max(120,viewport.clientWidth-24),height=Math.max(60,viewport.clientHeight-24);
  root.style.setProperty('width',width+'px','important');root.style.setProperty('transform','none','important');
  const contentWidth=Math.max(width,root.scrollWidth),contentHeight=Math.max(1,root.offsetHeight,root.scrollHeight),scale=TomeAnkiFit.fitScale(width,height,contentWidth,contentHeight,fit);
  root.style.setProperty('transform','scale('+scale+')','important');stage.style.setProperty('width',Math.ceil(contentWidth*scale)+'px','important');stage.style.setProperty('height',Math.ceil(contentHeight*scale)+'px','important');
  /* 2026-11-13 judges round 2: tell the host how tall the card naturally is, so the frame hugs the card instead of filling the page */
  try{parent.postMessage({type:'tome-anki-size',nonce,height:Math.ceil(contentHeight)+24},'*');}catch{}
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(layout);}}
 function content(html){
  const template=document.createElement('template');template.innerHTML=String(html||'');
  template.content.querySelectorAll('script,iframe,frame,object,embed,link,meta,base').forEach(node=>node.remove());
  for(const node of template.content.querySelectorAll('*')){
   for(const attr of [...node.attributes])if(/^on/i.test(attr.name)||['srcdoc','action','formaction','autoplay'].includes(attr.name)||['href','src','xlink:href'].includes(attr.name)&&/^\s*(?:javascript|vbscript):/i.test(attr.value))node.removeAttribute(attr.name);
   if(node.tagName==='BUTTON')node.type='button';
  }
  stopAudio();root.replaceChildren(template.content);root.classList.remove('compact-eggroll');
  // Recreate the template's audio placement without executing arbitrary note JS.
  const front=root.querySelector('#FrontSide.CardSide'),back=root.querySelector('#BackSide.CardSide');
  if(front){
   root.classList.add('compact-eggroll');
   const audio=[...root.querySelectorAll('.VocabAudio')],destination=audio.find(node=>front.contains(node)&&node.closest('.Question')&&!node.querySelector('[data-anki-media]'));
   const source=audio.find(node=>node!==destination&&node.querySelector('[data-anki-media]'));
   if(destination&&source)source.querySelectorAll('[data-anki-media]').forEach(node=>destination.append(node));
   const text=node=>{const clone=node.cloneNode(true);clone.querySelectorAll('rt,rp,style,script,button,audio').forEach(n=>n.remove());return clone.textContent.replace(/\s+/g,'').trim();};
   const frontSentences=front.querySelector('.SentenceList'),backSentences=back?.querySelector('.SentenceList');
   const questions=[...frontSentences?.querySelectorAll('.SentKanji')||[]],answers=[...backSentences?.querySelectorAll('.SentFurigana')||[]];
   if(frontSentences&&questions.length&&questions.length===answers.length&&questions.every((node,i)=>text(node)&&text(node)===text(answers[i]))&&!frontSentences.querySelector('img,video,audio'))frontSentences.dataset.tomeDuplicate='true';
  }
  root.querySelectorAll('[data-anki-play]').forEach(button=>{button.setAttribute('aria-label',copy.play);const audio=button.parentElement.querySelector('audio');if(!audio)return;audio.hidden=true;audio.controls=false;audio.onended=()=>button.setAttribute('aria-pressed','false');audio.onpause=()=>button.setAttribute('aria-pressed','false');});
  root.querySelectorAll('[data-anki-replay]').forEach(button=>button.setAttribute('aria-label',copy.play));
  root.querySelectorAll('img,video,audio').forEach(node=>{node.addEventListener('load',schedule);node.addEventListener('loadedmetadata',schedule);node.addEventListener('error',schedule);});
  applyMix();error.hidden=true;viewport.scrollTop=0;schedule();document.fonts?.ready.then(schedule);
 }
 addEventListener('message',event=>{
  if(event.source!==parent||event.data?.nonce!==nonce||!nonce)return;
  if(event.data.type==='tome-anki-card'){fit=event.data.fit!==false;copy=event.data.copy||copy;mix=event.data.mix||{};content(event.data.html);autoplay(event.data.auto);}
  else if(event.data.type==='tome-anki-fit'){fit=event.data.fit!==false;viewport.scrollTop=0;schedule();}
  else if(event.data.type==='tome-anki-mix'){mix=event.data.mix||{};applyMix();}
  else if(event.data.type==='tome-anki-play-all'){
   stopAudio();const ticket=playback,tracks=[...root.querySelectorAll('audio[src]')];
   if(!tracks.length){parent.postMessage({type:'tome-anki-replay',nonce},'*');return;}
   const next=i=>{
    if(ticket!==playback||!tracks[i])return;
    const audio=tracks[i];audio.currentTime=0;
    audio.addEventListener('ended',()=>next(i+1),{once:true});
    audio.play().catch(()=>{if(ticket===playback){error.textContent=copy.failed;error.hidden=false;}});
   };
   next(0);
  }
 });
 /* (user 2026-11-12) play the card's own clips by themselves: word = the word's reading; sentence = the example
    (synthesized or the game's voice); both = the word, then the example */
 function autoplay(mode){if(!mode||mode==='off')return;const want=mode==='word'?['word']:mode==='sentence'?['sentence','game']:['word','sentence','game'];
  const tracks=[...root.querySelectorAll('audio[src]')].filter(a=>want.includes(a.dataset.ankiChannel||'')).sort((a,b)=>(a.dataset.ankiChannel==='word'?0:1)-(b.dataset.ankiChannel==='word'?0:1));if(!tracks.length)return;
  stopAudio();const ticket=playback;const next=i=>{if(ticket!==playback||!tracks[i])return;const audio=tracks[i],button=audio.parentElement.querySelector('[data-anki-play]');audio.currentTime=0;audio.addEventListener('ended',()=>{button?.setAttribute('aria-pressed','false');setTimeout(()=>next(i+1),250);},{once:true});audio.play().then(()=>button?.setAttribute('aria-pressed','true')).catch(()=>{});};
  setTimeout(()=>next(0),180);}
 root.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-anki-play],button[data-anki-replay]');if(!button)return;event.preventDefault();
  if(button.hasAttribute('data-anki-replay')){parent.postMessage({type:'tome-anki-replay',nonce},'*');return;}
  const audio=button.parentElement.querySelector('audio');if(!audio)return;
  stopAudio();audio.currentTime=0;
  try{await audio.play();button.setAttribute('aria-pressed','true');error.hidden=true;}catch{error.textContent=copy.failed;error.hidden=false;}
 });
 root.addEventListener('submit',event=>event.preventDefault());root.addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();});
 new ResizeObserver(schedule).observe(viewport);addEventListener('resize',schedule);
})();
