// Only this controlled renderer executes in the opaque note sandbox.
(function(){
 'use strict';
 const nonce=location.hash.slice(1),root=document.querySelector('#card-content'),viewport=document.querySelector('#card-viewport'),stage=document.querySelector('#card-stage'),error=document.querySelector('#media-error');
 let fit=true,scheduled=false,playback=0,copy={play:'Play audio',failed:'Audio playback failed'};
 let mix={};
 function applyMix(){
  const level=channel=>Number.isFinite(mix[channel])?Math.min(1,Math.max(0,mix[channel]/100)):1;
  for(const audio of all('audio'))audio.volume=level('master')*level(audio.dataset?.ankiChannel||'');
 }
 /* audio in the card, including what HUD mode moved out to its blocks */
 function all(sel){const list=[...root.querySelectorAll(sel)];if(hud){const s=document.querySelector('#hud-stage');if(s&&s.querySelectorAll)list.push(...s.querySelectorAll(sel));}return list;}
 function stopAudio(){playback++;all('audio').forEach(audio=>audio.pause());}
 function layout(){
  scheduled=false;const width=Math.max(120,viewport.clientWidth-24),height=Math.max(60,viewport.clientHeight-24);
  root.style.setProperty('width',width+'px','important');root.style.setProperty('transform','none','important');
  const contentWidth=Math.max(width,root.scrollWidth),contentHeight=Math.max(1,root.offsetHeight,root.scrollHeight),scale=TomeAnkiFit.fitScale(width,height,contentWidth,contentHeight,fit);
  root.style.setProperty('transform','scale('+scale+')','important');stage.style.setProperty('width',Math.ceil(contentWidth*scale)+'px','important');stage.style.setProperty('height',Math.ceil(contentHeight*scale)+'px','important');
  /* 2026-11-13 judges round 2: tell the host how tall the card naturally is, so the frame hugs the card instead of filling the page */
  if(!hud)try{parent.postMessage({type:'tome-anki-size',nonce,height:Math.ceil(contentHeight)+24},'*');}catch{}
  if(hud)fitBlocks();
 }
 /* 2026-11-13 (user: Anki 界面大改) HUD mode: the MeguLit note is split into word / reading+meaning / example /
    screenshot blocks placed by percentage on a full-frame stage; any other template stays whole as one "card" block.
    The page sends the layout and the look (CSS variables); moving a block in edit mode reports the new rect back. */
 let hud=null;const blocks={};
 function hudStage(){let s=document.querySelector('#hud-stage');if(!s){s=document.createElement('div');s.id='hud-stage';s.addEventListener('click',playClick);s.addEventListener('click',lookupClick);document.body.append(s);}return s;}
 function applyVars(vars){for(const [k,v] of Object.entries(vars||{}))if(/^--hud-[a-z-]+$/.test(k))document.documentElement.style.setProperty(k,String(v));}
 function split(){
  const card=root.querySelector('.tm-card');if(!card||!card.querySelector||!card.querySelector('.tm-word'))return null;
  /* the answer always shows the reading: a note without WordReading gets it from its example's furigana */
  const m0=card.querySelector('.tm-mean');if(m0&&!card.querySelector('.tm-reading')&&globalThis.MeguHud?.rubyReading){const w=card.querySelector('.tm-word')?.textContent||'',ex=card.querySelector('.tm-ex');
   const rd=MeguHud.rubyReading(w,ex?.querySelector('.tm-hl')?.innerHTML)||MeguHud.rubyReading(w,ex?.innerHTML);if(rd){const d=document.createElement('div');d.className='tm-reading';d.dataset.from='sentence';d.textContent=rd;m0.before(d);}}
  const sec=n=>n&&n.closest?n.closest('.tm-sec')||n:n,word=card.querySelector('.tm-head'),info=card.querySelector('.tm-mean'),reading=card.querySelector('.tm-reading');
  const ex=card.querySelector('.tm-ex'),example=ex?sec(ex):null,shot=card.querySelector('.tm-shot'),used=[word,reading,info,example,shot].filter(Boolean);
  const rest=[...card.children].filter(n=>!used.includes(n)&&!used.some(u=>u.contains(n)||n.contains(u)));
  return {word:word?[word]:[],reading:reading?[reading]:[],info:info?[info,...(example?[]:rest)]:[],example:example?[example,...rest]:info?[]:rest,shot:shot?[shot]:[]};
 }
 function block(id){
  const b=document.createElement('div');b.className='hud-block';b.dataset.hud=id;b.tabIndex=-1;
  b.innerHTML='<div class="hud-fit"><div class="card nightMode tm-card hud-inner"></div></div><span class="hud-label"></span>';
  b.querySelector('.hud-label').textContent=hud?.labels?.[id]||id;return b;
 }
 /* (user 2026-11-13) each block hugs its content: shown[id] is the frame on screen; snapping against the other
    blocks (the page's progress and buttons included) and drawing guides while one is moved */
 const shown={};let hostFrames={},snapOpt={mode:'free',grid:24};
 function guideLayer(){let g=document.querySelector('#hud-guides');if(!g){g=document.createElement('div');g.id='hud-guides';document.body.append(g);}return g;}
 function others(id){return [...Object.entries(shown),...Object.entries(hostFrames).filter(([k])=>!(k in shown))].filter(([k])=>k!==id).map(([,r])=>r);}
 function attachBlock(el,id){
  if(!globalThis.MeguHud)return;
  MeguHud.attach(el,{stage:()=>document.documentElement,rect:()=>shown[id]||hud.layout[id],editing:()=>!!hud?.edit,
   snap:(r,kind,alt)=>alt?null:MeguHud.snapRect(r,others(id),kind,{...snapOpt,SW:innerWidth,SH:innerHeight}),guides:g=>MeguHud.drawGuides(guideLayer(),g),
   ratio:id==='shot',onActive:on=>{try{parent.postMessage({type:'tome-anki-hud-drag',nonce,on},'*');}catch{}},
   onCommit:(r,from)=>{r=MeguHud.carry(hud.layout[id],from,r);hud.layout[id]=r;schedule();parent.postMessage({type:'tome-anki-hud-move',nonce,id,rect:r},'*');}});
 }
 function place(){
  if(!hud)return;const r=hud.layout.card;
  if(blocks.card&&r)for(const [k,v] of [['left',r.x+'%'],['top',r.y+'%'],['width',r.w+'%'],['height',r.h+'%'],['right','auto'],['bottom','auto']])blocks.card.style.setProperty(k,v,'important');
  schedule();
 }
 function fitBlocks(){
  if(!globalThis.MeguHud)return;const SW=innerWidth,SH=innerHeight,fresh={},meta={};
  for(const k of Object.keys(shown))if(!(k in blocks))delete shown[k];
  for(const [id,el] of Object.entries(blocks)){
   if(id==='card'){shown.card=hud.layout.card;continue;}
   const box=el.querySelector('.hud-fit');if(!box)continue;box.style.transform='none';let nw=0,nh=0;
   /* (user 2026-11-13) the screenshot is a frame of its own shape: the picture always covers it (object-fit: cover),
      framed by a focus point and zoom the user drags / scrolls; edges change the proportions, corners scale */
   if(id==='shot'){const r=hud.layout.shot;if(!r)continue;const rect=MeguHud.normRect(r,r,{w:.3,h:.3});shown.shot=rect;MeguHud.applyRect(el,rect);
    box.style.cssText='';el.classList.add('hud-crop');frameShot(el,rect);continue;}
   const r=hud.layout[id];if(!r)continue;const rect=MeguHud.normRect(r,r,{w:.3,h:.3});
   /* (user 2026-11-14) like the screenshot: the content fills its frame and is centred; meanings and examples may wrap */
   const f=MeguHud.fitContent(box,rect.w*SW/100,rect.h*SH/100,{wrap:id==='info'||id==='example',max:8,minPx:10});
   if(!f){shown[id]=rect;MeguHud.applyRect(el,rect);continue;}
   const h=MeguHud.hugRect(rect,f.nw,f.nh,SW,SH,f.max,f.min);shown[id]=h.frame;MeguHud.applyRect(el,h.frame);box.style.transform='scale('+h.scale+')';box.style.left=h.ox+'px';box.style.top=h.oy+'px';
   meta[id]={scale:Math.round(h.scale*1000)/1000,text:el.querySelector('.hud-inner')?.textContent.replace(/\s+/g,' ').trim().slice(0,120)||''};
  }
  /* (user 2026-11-14: 已自动让位 cropped the screenshot) no auto-yield: a block never grows past its own frame, so
     nothing is pushed or cropped, and an overlap is the user's own choice */
  for(const el of Object.values(blocks))delete el.querySelector?.('.hud-label')?.dataset.nudge;
  for(const [id,m] of Object.entries(meta)){const el=blocks[id],b=el?.querySelector('.hud-fit');if(!b)continue;const px=q=>[q.left,q.top,q.width,q.height].map(v=>Math.round(v*10)/10);m.frame=px(el.getBoundingClientRect());m.content=px(b.getBoundingClientRect());}
  for(const [id,r] of Object.entries(fresh))parent.postMessage({type:'tome-anki-hud-move',nonce,id,rect:r},'*');
  parent.postMessage({type:'tome-anki-hud-frames',nonce,frames:{...shown},meta},'*');
 }
 function frameShot(el,r){const img=el.querySelector('img');if(!img)return;const v=hud.layout.shot||{};
  img.style.objectPosition=(v.fx??50)+'% '+(v.fy??50)+'%';img.style.transformOrigin=(v.fx??50)+'% '+(v.fy??50)+'%';img.style.transform=v.z>1?'scale('+v.z+')':'';}
 /* framing: Alt-drag or a drag while "framing" (double-click) pans, the wheel zooms (Shift: pans sideways) */
 function shotFraming(el){
  const commit=()=>{const r=hud.layout.shot;parent.postMessage({type:'tome-anki-hud-move',nonce,id:'shot',rect:r},'*');};
  let wheelTimer=0;
  el.addEventListener('dblclick',e=>{if(!hud?.edit)return;e.preventDefault();el.classList.toggle('hud-framing');});
  el.addEventListener('pointerdown',down=>{if(!hud?.edit||down.button!==0||down.target.closest('.hud-handle'))return;if(!down.altKey&&!el.classList.contains('hud-framing'))return;
   down.preventDefault();down.stopImmediatePropagation();const img=el.querySelector('img');if(!img?.naturalWidth)return;try{el.setPointerCapture(down.pointerId);}catch{}
   const v={...hud.layout.shot},o=MeguHud.coverOverflow(img.naturalWidth,img.naturalHeight,el.clientWidth,el.clientHeight,v.z||1),fx=v.fx??50,fy=v.fy??50;el.classList.add('hud-panning');
   const move=e=>{hud.layout.shot={...hud.layout.shot,fx:o.x?Math.min(100,Math.max(0,fx-(e.clientX-down.clientX)/o.x*100)):50,fy:o.y?Math.min(100,Math.max(0,fy-(e.clientY-down.clientY)/o.y*100)):50};frameShot(el);};
   const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.classList.remove('hud-panning');hud.layout.shot=MeguHud.normRect(hud.layout.shot,hud.layout.shot);commit();};
   el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);},true);
  el.addEventListener('wheel',e=>{if(!hud?.edit)return;e.preventDefault();const v={...hud.layout.shot};
   if(e.shiftKey)v.fx=Math.min(100,Math.max(0,(v.fx??50)+Math.sign(e.deltaY||e.deltaX)*4));else v.z=Math.min(4,Math.max(1,(v.z||1)*(e.deltaY<0?1.08:1/1.08)));
   hud.layout.shot=MeguHud.normRect(v,v);frameShot(el);clearTimeout(wheelTimer);wheelTimer=setTimeout(commit,250);},{passive:false});
 }
 function buildHud(){
  const stage=hudStage();stage.replaceChildren();for(const k of Object.keys(blocks))delete blocks[k];
  document.body.classList.add('hud');document.body.classList.toggle('hud-edit',!!hud.edit);
  let parts=null;try{parts=split();}catch{parts=null;}
  document.body.classList.toggle('hud-whole',!parts);
  if(parts){for(const [id,nodes] of Object.entries(parts)){if(!nodes.length)continue;const b=block(id);nodes.forEach(n=>b.querySelector('.hud-inner').append(n));stage.append(b);blocks[id]=b;if(id==='shot')shotFraming(b);attachBlock(b,id);}
   const img=blocks.shot?.querySelector('img[src^="data:image/"]');try{parent.postMessage({type:'tome-anki-shot',nonce,src:img?img.getAttribute('src'):''},'*');}catch{}}
  else{blocks.card=viewport;viewport.dataset.hud='card';viewport.classList.add('hud-block');if(!viewport.querySelector('.hud-label')){const l=document.createElement('span');l.className='hud-label';viewport.append(l);}
   viewport.querySelector('.hud-label').textContent=hud.labels?.card||'card';attachBlock(viewport,'card');
   const img=root.querySelector('img[src^="data:image/"]');try{parent.postMessage({type:'tome-anki-shot',nonce,src:img?img.getAttribute('src'):''},'*');}catch{}}
  place();schedule();
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
  applyMix();error.hidden=true;viewport.scrollTop=0;if(hud)buildHud();schedule();document.fonts?.ready.then(schedule);
 }
 addEventListener('message',event=>{
  if(event.source!==parent||event.data?.nonce!==nonce||!nonce)return;
  if(event.data.type==='tome-anki-card'){fit=event.data.fit!==false;copy=event.data.copy||copy;mix=event.data.mix||{};
   if(event.data.hud&&typeof event.data.hud==='object'){hud={layout:{...event.data.hud.layout},edit:!!event.data.hud.edit,labels:event.data.hud.labels||{}};if(event.data.hud.snap)snapOpt=event.data.hud.snap;if(event.data.hud.frames)hostFrames=event.data.hud.frames;applyVars(event.data.hud.vars);}
   content(event.data.html);autoplay(event.data.auto);}
  else if(event.data.type==='tome-anki-hud'&&hud){if(event.data.layout)hud.layout={...hud.layout,...event.data.layout};if(event.data.snap)snapOpt=event.data.snap;if(event.data.frames)hostFrames=event.data.frames;if('edit' in event.data){hud.edit=!!event.data.edit;
   document.body.classList.toggle('hud-edit',hud.edit);}applyVars(event.data.vars);place();schedule();}
  else if(event.data.type==='tome-anki-fit'){fit=event.data.fit!==false;viewport.scrollTop=0;schedule();}
  else if(event.data.type==='tome-anki-mix'){mix=event.data.mix||{};applyMix();}
  else if(event.data.type==='tome-anki-play-all'){
   stopAudio();const ticket=playback,tracks=all('audio[src]');
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
  const tracks=all('audio[src]').filter(a=>want.includes(a.dataset.ankiChannel||'')).sort((a,b)=>(a.dataset.ankiChannel==='word'?0:1)-(b.dataset.ankiChannel==='word'?0:1));if(!tracks.length)return;
  stopAudio();const ticket=playback;const next=i=>{if(ticket!==playback||!tracks[i])return;const audio=tracks[i],button=audio.parentElement.querySelector('[data-anki-play]');audio.currentTime=0;audio.addEventListener('ended',()=>{button?.setAttribute('aria-pressed','false');setTimeout(()=>next(i+1),250);},{once:true});audio.play().then(()=>button?.setAttribute('aria-pressed','true')).catch(()=>{});};
  setTimeout(()=>next(0),180);}
 const playClick=async event=>{
  const button=event.target.closest('button[data-anki-play],button[data-anki-replay]');if(!button)return;event.preventDefault();
  if(button.hasAttribute('data-anki-replay')){parent.postMessage({type:'tome-anki-replay',nonce},'*');return;}
  const audio=button.parentElement.querySelector('audio');if(!audio)return;
  stopAudio();audio.currentTime=0;
  try{await audio.play();button.setAttribute('aria-pressed','true');error.hidden=true;}catch{error.textContent=copy.failed;error.hidden=false;}
 };
 root.addEventListener('click',playClick);
 root.addEventListener('submit',event=>event.preventDefault());
 /* Links never navigate the sandbox; the template's magnifier (.tm-search) asks the page to look the word up instead */
 const lookupClick=event=>{const a=event.target.closest?.('a');if(!a)return;event.preventDefault();if(hud?.edit)return;
  if(a.classList.contains('tm-search')){const w=a.closest('.tm-card,.hud-inner,#card-content')?.querySelector('.tm-word')||root.querySelector('.tm-word');
   const word=(w?.textContent||'').trim().slice(0,60);if(word)parent.postMessage({type:'tome-anki-lookup',nonce,word},'*');}};
 root.addEventListener('click',lookupClick);
 /* While the layout is being edited a press moves the block, it never plays audio or follows a link */
 document.addEventListener?.('click',event=>{if(hud?.edit){event.stopPropagation();event.preventDefault();}},true);
 /* Review shortcuts work while focus is inside the card too: the page decides what each key does */
 document.addEventListener?.('keydown',event=>{if(event.target.closest?.('input,select,textarea')||event.ctrlKey||event.metaKey||event.altKey)return;
  if([' ','Enter','1','2','3','4','f','F','l','L','r','R','Escape'].includes(event.key)){event.preventDefault();parent.postMessage({type:'tome-anki-key',nonce,key:event.key},'*');}});
 new ResizeObserver(schedule).observe(viewport);addEventListener('resize',schedule);
})();
