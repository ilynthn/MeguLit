// SPDX-License-Identifier: GPL-3.0-or-later
(function installSelection(){
 'use strict';if(!document.documentElement||!window.__tomoyoChinese?.localLookup){document.addEventListener('DOMContentLoaded',installSelection,{once:true});return;
  }
 const b=window.__tomoyoChinese;if(b.selectionInstalled)return;b.selectionInstalled=true;
 const send=m=>window.__tomoyoTranslateRequest(JSON.stringify(m));let pointSerial=0;let card,current,anchor,serial=0,hold,down,suppressUntil=0;const pending=new Map(),
  modelPanels=new Set();b.lookupConfigured=error=>{for(const item of modelPanels){if(!item.details.isConnected){modelPanels.delete(item);continue;}item.state.textContent=error||'已保存；仅手动点击解释或归纳时调用 API';
  if(!error)for(const f of Object.values(item.fields)){if(f.key.value)f.key.placeholder='本次运行已配置';f.key.value='';}}};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};const button=(text,fn)=>{
  const n=el('button','',text);n.type='button';n.onclick=fn;return n;};
 b.lookupDeliver=(id,result,error)=>{const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);error?p.reject(Error(error)):p.resolve(result);
  };
 const explain=(args,mode)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('学习 API 等待超时，请稍后重试'));},45000);
  pending.set(id,{resolve,reject,timer});send({type:'lookupExplain',id,args,mode,options:b.options()});});
 function close(keepSurface=false){if(!keepSurface)try{getSelection()?.removeAllRanges();}catch{}pointSerial++;serial++;card?.remove();card=null;current=null;b.selectionActive=false;
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('选区已关闭'));}pending.clear();document.body.classList.remove('tomoyo-selection-open');try{send({
  type:'lookupCancel'});if(!keepSurface)send({type:'galLookup',open:false});}catch{}}
 function textBlock(word){const root=anchor?.closest?.('.sentence-text,.tome-log-src');if(!root)return word;const own=root.getBoundingClientRect(),parent=root.parentElement?.getBoundingClientRect?.();
  return parent&&parent.height<innerHeight*.6&&parent.width<=innerWidth?parent:own;}
 let lastPoint=null;document.addEventListener('pointerdown',e=>{lastPoint={x:e.clientX,y:e.clientY};},true);
 function hitRects(){const a=anchor;let list=[];try{if(a&&typeof a.getClientRects==='function')list=[...a.getClientRects()];}catch{}
  if(!list.length&&a?.getBoundingClientRect)list=[a.getBoundingClientRect()];if(!list.length&&a&&Number.isFinite(a.top))list=[a];return list.filter(r=>r.width||r.height);
   }
 function place(){if(!card)return;card.style.width=Math.min(520,innerWidth-24)+'px';
  if(card.__tomeMoved){const s=card.getBoundingClientRect();card.style.bottom='';card.style.left=Math.max(12,Math.min(innerWidth-s.width-12,s.left))+'px';card.style.top=Math.max(12,
   Math.min(innerHeight-s.height-12,s.top))+'px';window.__tomoyoHitRegionsRefresh?.(true);return;}
  const rects=hitRects(),u=rects.length?{left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))}:{
   left:innerWidth/2,right:innerWidth/2,top:innerHeight/2,bottom:innerHeight/2};
  const point=anchor?.__megulitPoint||lastPoint,size=card.getBoundingClientRect(),gap=10,margin=12;
  // Centred on the click when it lies on (or right next to) the hit text, else on the hit text; kept on screen.
  const cx=point&&point.x>=u.left-40&&point.x<=u.right+40?point.x:(u.left+u.right)/2;
  card.style.left=Math.round(Math.max(margin,Math.min(innerWidth-size.width-margin,cx-size.width/2)))+'px';
  // Just above the hit text; just below it when the card does not fit above; otherwise the roomier side, capped.
  const above=u.top-gap-margin,below=innerHeight-u.bottom-gap-margin,h=size.height,up=above>=h||(below<h&&above>=below);
  if(up){card.style.top='';card.style.bottom=Math.round(innerHeight-u.top+gap)+'px';card.style.setProperty('max-height',Math.max(120,Math.round(above))+'px','important');
   }
  else{card.style.bottom='';card.style.top=Math.round(u.bottom+gap)+'px';card.style.setProperty('max-height',Math.max(120,Math.round(below))+'px','important');}
  window.__tomoyoHitRegionsRefresh?.(true);}
 function dragCard(head){head.style.cursor='grab';head.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,a,input,select,textarea,summary,[role=button]'))return;
  e.preventDefault();e.stopPropagation();const s=card.getBoundingClientRect(),dx=e.clientX-s.left,dy=e.clientY-s.top;try{head.setPointerCapture(e.pointerId);}catch{
  }head.style.cursor='grabbing';card.__tomeMoved=true;card.style.bottom='';
  const move=ev=>{const w=card.offsetWidth,h=card.offsetHeight;card.style.left=Math.max(4,Math.min(innerWidth-w-4,ev.clientX-dx))+'px';card.style.top=Math.max(4,
   Math.min(innerHeight-h-4,ev.clientY-dy))+'px';},up=()=>{head.style.cursor='grab';head.removeEventListener('pointermove',move);head.removeEventListener('pointerup',
   up);head.removeEventListener('pointercancel',up);window.__tomoyoHitRegionsRefresh?.(true);};
  head.addEventListener('pointermove',move);head.addEventListener('pointerup',up);head.addEventListener('pointercancel',up);});}
 function paragraphText(at){const root=at?.closest?.('.sentence-text,.tome-log-src')||document.querySelector('.sentence-text'),chars=root?[...root.querySelectorAll('.char-token')]:[];
  return {root,chars,text:chars.map(n=>n.textContent).join('')};}
 function selected(){const selection=getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return null;const range=selection.getRangeAt(0),
  {root,chars,text}=paragraphText(range.startContainer.nodeType===3?range.startContainer.parentElement:range.startContainer);if(!root||!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
  const boundary=(node,offset)=>{let count=0;for(const char of chars){const part=document.createRange();part.selectNodeContents(char);const relation=part.comparePoint(node,
   offset);if(relation>0){count+=[...char.textContent].length;continue;}if(relation<0)return count;part.setEnd(node,offset);return count+[...part.toString()].length;
   }return count;};const start=boundary(range.startContainer,range.startOffset),end=boundary(range.endContainer,range.endOffset);if(end<=start)return null;return {
   args:{text,start,end},anchor:range.cloneRange()};
 }
 function groups(entry){if(entry.definition_groups)return entry.definition_groups;return (entry.definitions||[]).map(s=>({title:String(s).split(/[；;]/)[0],text:String(s)}));
  }
 function senses(entry,parent){const list=groups(entry),box=el('div','tomoyo-senses');const add=(g,i,host)=>{const row=el('div','tomoyo-sense');row.append(el('span',
  'tomoyo-sense-number',String(i+1).padStart(2,'0')),el('div','',g.text));host.append(row);};list.slice(0,3).forEach((g,i)=>add(g,i,box));if(list.length>3){const details=el('details'),
  summary=el('summary','',`展开其余 ${list.length-3} 个义项`);details.append(summary);list.slice(3).forEach((g,i)=>add(g,i+3,details));box.append(details);}if(!list.length)box.append(el('p',
  'tomoyo-muted','本地辞书没有收录这个写法'));parent.append(box);}
 /* Word card class, JLPT level and MOJi lookup count come from MOJi 辞書 (user 2026-11-13); local classes stay when MOJi has no entry. */
 const factsCache=new Map();
 function mojiFacts(word,reading){const key=word+'|'+reading,request=b.v4Request;if(!word||!request)return Promise.resolve(null);if(factsCache.has(key))return factsCache.get(key);
  const p=request('mojiFacts',{word,reading},9000).catch(()=>null);factsCache.set(key,p);p.then(v=>{if(!v)factsCache.delete(key);});
  while(factsCache.size>80)factsCache.delete(factsCache.keys().next().value);return p;}
 const views=n=>n>=10000?(n/10000).toFixed(n>=100000?0:1).replace(/\.0$/,'')+'万':String(n);
 function paintFacts(cell,f){const pos=[(f.partOfSpeech||[]).join('·'),f.verbType].filter(Boolean).join('·');if(pos){cell.textContent=pos;cell.title='MOJi 辞書词性'+(f.verbGroup?'（'+f.verbGroup+'动词）':'');}
  const tags=el('span','tomoyo-word-facts');if(f.jlpt){const n=el('span','tomoyo-word-jlpt',f.jlpt);n.title='JLPT '+f.jlpt+'（MOJi 标签：'+(f.jlptAll||[f.jlpt]).join(' · ')+'）';tags.append(n);}
  if(Number.isFinite(f.views)){const n=el('span','tomoyo-word-freq','被查 '+views(f.views)+' 次');n.title='在 MOJi 辞書被查过 '+f.views.toLocaleString('zh-CN')+' 次，越多说明越常碰到';tags.append(n);}
  if(tags.childElementCount){cell.querySelector('.tomoyo-word-facts')?.remove();cell.classList.add('has-facts');cell.append(tags);}}
 function wordHeader(result,entry,parent){const m=result.morphology||{},line=el('div','tomoyo-word-heading'),word=el('strong','',m.base||entry?.spellings?.[0]||result.surface);
  line.append(word);if(m.forms?.length){const shape=el('span','tomoyo-word-form');shape.append(el('b','',m.surface+' · '+m.forms.join(' · ')),el('small','',m.rules.join('；')));
  shape.title=m.source||'本地活用规则';line.append(shape);}else line.append(el('span'));const posCell=el('span','tomoyo-word-pos',m.wordClass||entry?.pos?.join('、')||'');line.append(posCell);
  parent.append(line);mojiFacts(word.textContent,entry?.readings?.[0]||m.reading||'').then(f=>{if(f&&line.isConnected)paintFacts(posCell,f);});const reading=el('div','tomoyo-word-reading',entry?.readings?.[0]||m.reading||'');if(m.reading&&entry?.readings?.[0]&&m.reading!==entry.readings[0])reading.append(el('small',
  '',`句中：${m.reading}`));parent.append(reading);if(m.ambiguity)parent.append(el('small','tomoyo-muted',m.ambiguity));if(result.match_note)parent.append(el('small',
  'tomoyo-muted',result.match_note));}
 function renderLocal(result,host){host.replaceChildren();const analysis=result.selection_analysis;if(analysis&&!analysis.exact&&analysis.parts?.length>1){host.append(el('h3',
  'tomoyo-selected-phrase',analysis.surface),el('div','tomoyo-muted','按句子结构分段 · 点一个词展开完整释义'));
   // Group the words into phrases (文節: content words plus the particles/auxiliaries attached to them) and label
   // each phrase with its role in the sentence, so the structure is visible at a glance.
   const posOf=part=>part.morphology?.wordClass||part.entries?.[0]?.pos?.join('、')||'',isFunc=pos=>/助詞|助動詞|接尾辞|補助記号|記号/.test(pos),isNounish=pos=>/名詞|代名詞|接頭辞|形状詞|数詞/.test(pos)&&!/动词|動詞/.test(pos);
   const chunks=[];for(const part of analysis.parts){const pos=posOf(part),last=chunks.at(-1);
    const joins=last&&(isFunc(pos)||last.prefix||(!last.hasFunc&&isNounish(pos)&&isNounish(last.lastPos)));
    if(joins){last.parts.push(part);if(isFunc(pos)&&!/記号/.test(pos))last.hasFunc=true;last.lastPos=pos;last.prefix=/接頭辞/.test(pos);}
    else chunks.push({parts:[part],hasFunc:false,lastPos:pos,prefix:/接頭辞/.test(pos)});}
   const roleOf=(chunk,index)=>{const fn=[...chunk.parts].reverse().find(p=>{const pos=posOf(p);return isFunc(pos)&&!/記号/.test(pos);}),particle=fn&&/助詞/.test(posOf(fn))?fn.surface:'';
    const map={'は':'主题','が':'主语','を':'宾语','に':'对象 / 时间','へ':'方向','で':'场所 / 手段','と':'同伴 / 引用','から':'起点 / 原因','まで':'终点','も':'也','の':'修饰','や':'列举','より':'比较','って':'引用 / 主题',
     'には':'对象（强调）','では':'范围','とは':'定义'};
    if(map[particle])return map[particle];const content=chunk.parts.find(p=>!isFunc(posOf(p))),pos=content?posOf(content):'';
    if(/动词|動詞|形容|助動詞/.test(pos)||chunk.parts.some(p=>/助動詞/.test(posOf(p)))){const forms=content?.morphology?.forms||[];if(index<chunks.length-1&&forms.some(f=>/连用|連用|て形/.test(f)))return /形容/.test(pos)?'修饰':'接续';
     return index===chunks.length-1||chunks.slice(index+1).every(c=>c.parts.every(p=>/記号/.test(posOf(p))))?'谓语':'修饰';}
    if(/副詞/.test(pos))return '修饰';if(/接続詞/.test(pos))return '接续';if(/感動詞/.test(pos))return '感叹';return '';};
   const row=part=>{const entry=part.entries?.[0],m=part.morphology||{},pos=posOf(part),minor=isFunc(pos),node=el('details','tomoyo-word-row'+(minor?' tomoyo-word-minor':'')),
    summary=el('summary');
    const first=String(entry?.definition_groups?.[0]?.text||entry?.definitions?.[0]||(entry?'':'未收录的表记')).split('\n')[0];
    const head=m.base||entry?.spellings?.[0]||part.surface,read=entry?.readings?.[0]||m.reading||'';summary.append(el('strong','',head),el('span','tomoyo-row-reading',
     read===head?'':read),el('span','tomoyo-row-pos',pos.replace(/詞$/,'')),el('span','tomoyo-row-meaning',first));
    if(m.forms?.length)summary.append(el('span','tomoyo-row-form',m.surface+' · '+m.forms.join(' · ')));
    node.append(summary);const detail=el('div','tomoyo-row-detail');node.append(detail);
    node.addEventListener('toggle',()=>{if(node.open&&!detail.childElementCount){wordHeader(part,entry,detail);if(entry)senses(entry,detail);}place();});return node;
     };
   const list=el('div','tomoyo-chunks');chunks.forEach((chunk,index)=>{if(chunk.parts.every(p=>/記号/.test(posOf(p))))return;const block=el('section','tomoyo-chunk'),
    title=el('div','tomoyo-chunk-title'),role=roleOf(chunk,index);
    title.append(el('span','tomoyo-chunk-text',chunk.parts.map(p=>p.surface).join('')));if(role)title.append(el('span','tomoyo-chunk-role',role));block.append(title);
    // Particles and auxiliaries are summarised by the role label; their rows appear when the phrase title is clicked.
    if(chunk.parts.some(p=>isFunc(posOf(p))&&!/記号/.test(posOf(p)))){title.classList.add('tomoyo-chunk-toggle');title.title='显示 / 隐藏助词与助动词';title.onclick=()=>{block.classList.toggle('tomoyo-chunk-open');
     place();};}
    const words=el('div','tomoyo-word-rows');for(const part of chunk.parts)if(!/記号/.test(posOf(part)))words.append(row(part));block.append(words);list.append(block);
     });
   host.append(list);}
  else{const entry=result.entries?.[0],sub=el('div','tomoyo-local-entry');wordHeader(result,entry,sub);if(entry)senses(entry,sub);else sub.append(el('div','tomoyo-muted',
   '未找到完整词条；可调整选区或查看上下文解释'));host.append(sub);if((result.entries?.length||0)>1){const label=el('label','tomoyo-alternative','其他同形词条 '),select=el('select');result.entries.forEach((e,
   i)=>{const option=el('option','',`${e.spellings?.[0]||e.readings?.[0]} · ${e.readings?.[0]||''}`);option.value=String(i);select.append(option);});select.onchange=()=>{
   const replacement={...result,entries:[result.entries[Number(select.value)]]};sub.replaceChildren();wordHeader(replacement,replacement.entries[0],sub);senses(replacement.entries[0],
   sub);b.decorateWordActions?.(host.closest('.tomoyo-selection-card'),current,replacement);place();};label.append(select);host.append(label);}}
 }
 async function show(args,at,result){if(current&&card&&current.text===args.text&&current.start===args.start&&current.end===args.end){anchor=at;place();return;}close(true);
  current=args;anchor=at;b.selectionActive=true;const mine=current;card=el('section','tomoyo-selection-card word-image-preview-portal');{const shot=b.precaptureReader?.();
  if(shot)card.__megulitShot=shot;/* game-only picture: the card is never hidden for it */}card.setAttribute('role','dialog');card.setAttribute('aria-label',
  '本地查词与选区解释');const top=el('header');dragCard(top);if(typeof ResizeObserver==='function'){const watched=card;new ResizeObserver(()=>{if(card===watched&&watched.isConnected)place();
  }).observe(watched);}top.append(el('span',''),button('×',()=>close()));const body=el('div','tomoyo-selection-body'),status=el('div','tomoyo-muted','本地查询中…'),actions=el('footer'),
  ai=el('div','tomoyo-ai-result');ai.hidden=true;actions.append(button('上下文解释',()=>askAI('explain')),button('AI 归纳义项',()=>askAI('summary')));body.append(status);
  card.append(top,actions,ai,body);document.body.append(card);document.body.classList.add('tomoyo-selection-open');send({type:'galLookup',open:true});place();
  // Short entrance (user, 2026-11-02): compositor-only translate/scale on the card (its CSS pins opacity/transform/animation)
  // and a fade on its contents, ~140 ms; the window region is refreshed once it settles.
  if(!['glass','both'].includes(document.documentElement.dataset.tomeCardSurface)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const ease='cubic-bezier(.2,.7,.2,1)';
   try{const run=card.animate([{translate:'0 6px',scale:'.985'},{translate:'0 0',scale:'1'}],{duration:140,easing:ease});for(const part of card.children)part.animate([{
   opacity:0},{opacity:1}],{duration:110,easing:'ease-out'});run.finished.then(()=>window.__tomoyoHitRegionsRefresh?.(true)).catch(()=>{});}catch{}}
  /* Context explanations have their own source (user, 2026-11-09): always the user's own AI API, never the word-lookup
     source; without a key the card says so and how to add one (DeepSeek recommended). */
  const keyHint=()=>{ai.hidden=false;ai.replaceChildren(el('strong','','上下文解释需要你自己的 AI API Key'),keyGuide(),button('打开设置',()=>{b.openSettings();document.querySelector('[data-menu-key=learn]')?.click();
   setTimeout(()=>{const d=document.querySelector('.tomoyo-learning-models');if(d){d.open=true;d.scrollIntoView({block:'start'});}},120);}));place();};
  async function askAI(mode){if(!card||current!==mine)return;ai.hidden=false;ai.textContent=mode==='summary'?'AI 正在归纳词典义项…':'AI 正在结合台词解释…';place();try{const value=await explain(mine,
   mode);if(current!==mine||!card)return;card.__megulitAi=(value.kind==='summary'||value.kind==='explain'||value.kind==='context')&&value.text?{kind:value.kind,
   text:String(value.text).slice(0,2000)}:card.__megulitAi;ai.replaceChildren(el('strong','',value.kind==='moji'?'MOJi 辞書':value.kind==='translation'?'选区翻译':value.kind==='summary'?'AI 归纳（可对照上方词典原义项）':'AI 上下文解释'),
   el('div','',value.text));}catch(e){if(current===mine&&card){if(e.message==='CONTEXT_KEY_REQUIRED'||e.message==='LOOKUP_MODEL_REQUIRED'){keyHint();return;}ai.textContent=e.message;
   }}place();}
  /* drag: a drag selection (no point-lookup result handed in) */const drag=!result;try{result=result||await b.localLookup('lookup_exact',args);if(current!==mine||!card)return;
   renderLocal(result,body);b.decorateWordActions?.(card,args,result,{drag});place();}catch(e){if(current===mine&&card){status.textContent=e.message;place();}}
 }
 async function showPoint(token){const ticket=++pointSerial;const {chars,text}=paragraphText(token),index=chars.indexOf(token);if(index<0)return;const position=chars.slice(0,
  index).reduce((n,t)=>n+[...t.textContent].length,0);try{const result=await b.localLookup('lookup_at_position',{text,position});if(result&&ticket===pointSerial&&token.isConnected&&paragraphText(token).text===text){
  const range=document.createRange();let n=0,first=null,last=null;for(const c of chars){const len=[...c.textContent].length;if(n+len>result.start&&n<result.end){
  first=first||c;last=c;}n+=len;}if(first){range.setStartBefore(first);range.setEndAfter(last);}else range.selectNode(token);show({text,start:result.start,end:result.end},
  range,result);}}catch(e){if(ticket===pointSerial)b.learningStatus?.({learningMessage:e.message||'本地点词失败'});}}
 for(const type of ['mouseover','mousemove'])document.addEventListener(type,e=>{if(card&&e.target.closest?.('.sentence-text'))e.stopImmediatePropagation();},true);
 /* E427 The styled dropdown list (.mg-select-pop) sits on <body>, outside the card: picking another homograph there must not count as a click outside, which closed the card before the switch ran. */
 const inOwn=node=>node?.closest?.('.tomoyo-selection-card,.tomoyo-cn-dialog,.tomoyo-learning-panel,.mg-select-pop');
 // E213: resolve the clicked character from geometry, not the event target. Ruby, padding or a drawing layer above the
 // line made the target the first token ("(" at the line start). Line breaks are covered by per-line client rects.
 function tokenAt(e){const x=e.clientX,y=e.clientY;let root=e.target?.closest?.('.sentence-text');if(!root)for(const n of document.elementsFromPoint(x,y)){root=n.closest?.('.sentence-text');
  if(root)break;}if(!root)for(const n of document.querySelectorAll('.sentence-text')){const r=n.getBoundingClientRect();if(r.width&&r.height&&x>=r.left-4&&x<=r.right+4&&y>=r.top-4&&y<=r.bottom+4){
  root=n;break;}}if(!root)return null;
  let best=null,dist=Infinity;for(const t of root.querySelectorAll('.char-token:not(.tome-typewriter-pending)')){for(const r of t.getClientRects()){if(!r.width||!r.height)continue;
   const dx=x<r.left?r.left-x:x>r.right?x-r.right:0,dy=y<r.top?r.top-y:y>r.bottom?y-r.bottom:0,d=dx*dx+dy*dy*4;if(d<dist){dist=d;best=t;}}if(dist===0)break;}
  return dist<=576?best:null;}
 function pointerTrace(kind,e,token){try{const chars=token?paragraphText(token).chars:[],t=e.target;window.__tomoyoTranslateRequest?.(JSON.stringify({type:'pointerDiagnostic',
  kind,clientX:Math.round(e.clientX),clientY:Math.round(e.clientY),screenX:e.screenX,screenY:e.screenY,dpr:devicePixelRatio,detail:e.detail,target:String(t?.className?.baseVal??t?.className??t?.tagName??''),
  targetText:String(t?.textContent||'').slice(0,6),direct:String(t?.closest?.('.char-token')?.textContent||''),token:token?.textContent||'',index:token?chars.indexOf(token):-1,
  focused:document.hasFocus(),win:[window.screenX,window.screenY,innerWidth,innerHeight],sentences:[...document.querySelectorAll('.sentence-text')].slice(0,3).map(n=>{
  const r=n.getBoundingClientRect(),c=getComputedStyle(n);return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height),c.visibility,c.opacity,
  c.display,String(n.textContent||'').slice(0,8)];}),under:document.elementsFromPoint(e.clientX,e.clientY).slice(0,4).map(n=>String(n.className?.baseVal??n.className??n.tagName).slice(0,
  40))}));}catch{}}
 document.addEventListener('pointerdown',e=>{if(inOwn(e.target))return;if(card&&!e.target.closest?.('.sentence-text'))close();const token=tokenAt(e);pointerTrace('down',
  e,token);if(!token||e.button!==0)return;down={x:e.clientX,y:e.clientY,token};clearTimeout(hold);if(e.pointerType==='touch')hold=setTimeout(()=>{suppressUntil=Date.now()+700;
  const selection=selected();selection?show(selection.args,selection.anchor):showPoint(token);},480);},true);
 /* E422 (user, WoH, screen recording: dragging over the text, the red highlight jumped to 「魔法」, 「見たコト」, 「とは違」 in
    other lines and off the page, now and then). The browser's own drag selection ran alongside this one: on a page every
    sentence is its own positioned box, and once the pointer left the sentence the drag began in, the native selection
    kept growing in DOM order through the other boxes. The native selection never starts on a line; this drag owns it. */
 document.addEventListener('selectstart',e=>{if(e.target?.closest?.('.sentence-text')||e.target?.parentElement?.closest?.('.sentence-text'))e.preventDefault();},
  true);
 document.addEventListener('pointermove',e=>{
  if(!down||!(e.buttons&1)||Math.hypot(e.clientX-down.x,e.clientY-down.y)<=6)return;
  clearTimeout(hold);
  const end=e.target.closest?.('.char-token:not(.tome-typewriter-pending)')||tokenAt(e);
  const {root,chars,text}=paragraphText(down.token);
  /* E422: outside the sentence the drag began in, keep the last range (never a range through other lines) */
  if(!root||!end||!root.contains(end)){if(down.drag?.anchor){const s=getSelection();if(s&&(s.rangeCount!==1||s.getRangeAt(0).toString()!==down.drag.anchor.toString())){
   s.removeAllRanges();s.addRange(down.drag.anchor);}}return;}
  if(down.drag?.end===end)return;
  const a=chars.indexOf(down.token),b=chars.indexOf(end);
  if(a<0||b<0)return;
  const first=Math.min(a,b),last=Math.max(a,b),range=document.createRange();
  range.setStartBefore(chars[first]);range.setEndAfter(chars[last]);
  const start=chars.slice(0,first).reduce((n,t)=>n+[...t.textContent].length,0);
  down.drag={end,args:{text,start,end:start+[...range.toString()].length},anchor:range};
  const selection=getSelection();selection?.removeAllRanges();selection?.addRange(range);
 },true);
 const finish=e=>{clearTimeout(hold);const drag=down?.drag;down=null;if(drag){e.stopImmediatePropagation();suppressUntil=Date.now()+500;show(drag.args,drag.anchor);
  return;}if(inOwn(e.target))return;if(e.detail>=2&&e.target?.closest?.('.sentence-text')){const token=tokenAt(e);try{getSelection()?.removeAllRanges();}catch{}if(token){
  e.stopImmediatePropagation();suppressUntil=Date.now()+500;pointerTrace('double',e,token);showPoint(token);}return;}const selection=selected();if(selection){e.stopImmediatePropagation();
  suppressUntil=Date.now()+500;show(selection.args,selection.anchor);}};document.addEventListener('pointerup',finish,true);document.addEventListener('mouseup',finish,
  true);document.addEventListener('pointercancel',()=>{clearTimeout(hold);if(down?.drag)getSelection()?.removeAllRanges();down=null;},true);
 document.addEventListener('click',e=>{const token=e.target.closest?.('.sentence-text')?tokenAt(e):null;if(token&&Date.now()>=suppressUntil){pointerTrace('click',
  e,token);e.preventDefault();e.stopImmediatePropagation();showPoint(token);return;}if(Date.now()<suppressUntil&&e.target.closest?.('.sentence-text')){e.preventDefault();
  e.stopImmediatePropagation();}},true);
 document.addEventListener('contextmenu',e=>{if(!e.target.closest?.('.sentence-text'))return;e.preventDefault();e.stopImmediatePropagation();const selection=selected(),
  token=tokenAt(e);if(selection)show(selection.args,selection.anchor);else if(token)showPoint(token);},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&card){e.stopPropagation();close();}},true);addEventListener('resize',place);const source=b.onSourceText;
  b.onSourceText=text=>{if(current&&text.trim()!==current.text.trim())close();source?.(text);};
 b.openLocalSelection=(args,at)=>show(args,at||{left:innerWidth/2,top:innerHeight/2,bottom:innerHeight/2});b.closeLocalSelection=close;

 // How to get a key, shown in the card and in the settings panel (user, 2026-11-09): why an AI is needed, that any cost
 // goes to the AI company and not to MeguLit, a free route, and the DeepSeek steps.
 function keyGuide(){const box=el('div','megulit-key-guide');
  const p=(text,cls='')=>el('p',cls,text);
  box.append(p('上下文解释要让 AI 读懂整句台词再解释这个词在这里的意思，不用 AI 做不到，所以需要你自己的 AI 服务 API Key。'),
   p('如果产生费用，钱是付给 AI 服务商的，MeguLit 本身完全免费，不收任何钱。','megulit-key-free'),
   p('免费方案：智谱开放平台（open.bigmodel.cn）注册后有免费的 Flash 模型，在「上下文解释来源」选「GLM / 智谱」，模型填免费的 Flash 型号，再粘贴 Key。'),
   p('推荐 DeepSeek（性价比很高，充几块钱能用很久），获取方法：'));
  const ol=el('ol');for(const step of ['打开 platform.deepseek.com，用手机号注册并登录','在「充值」里充一点钱（几块钱就够用很久）','左侧「API Keys」→「创建 API Key」，复制生成的 sk- 开头的那串字','Alt+T → 学习 →「上下文解释与义项归纳」，来源选 DeepSeek，把 Key 粘贴进去，点「保存学习模型」'])ol.append(el('li',
   '',step));
  box.append(ol);return box;}
 function modelPanel(panel){if(panel.querySelector('.tomoyo-learning-models'))return;const details=el('details','tomoyo-learning-models'),summary=el('summary','',
  '上下文解释与义项归纳（自备 AI 的 API Key）'),choose=el('select'),label=el('label','','上下文解释来源');for(const [value,text]of [["deepseek","DeepSeek（推荐，性价比很高）"],["follow","跟随台词翻译引擎"],
  ["gemini","Gemini"],["gpt","OpenAI / 兼容接口"],["qwen","Qwen / 通义千问"],["kimi","Kimi / 月之暗面"],["glm","GLM / 智谱"]]){const o=el('option','',text);o.value=value;choose.append(o);
  }label.append(choose);details.append(summary,label);const options=b.options(),profiles=JSON.parse(JSON.stringify(options.lookupProfiles||{})),fields={};choose.value=options.contextProvider||'deepseek';
  for(const [name,title,base,model]of [["deepseek","DeepSeek","https://api.deepseek.com","deepseek-flash"],["gemini","Gemini","https://generativelanguage.googleapis.com/v1beta/openai",
   ""],["gpt","OpenAI / 兼容接口","https://api.openai.com/v1","gpt-4.1-mini"],["qwen","Qwen / 通义千问","https://dashscope.aliyuncs.com/compatible-mode/v1","qwen-plus"],
   ["kimi","Kimi / 月之暗面","https://api.moonshot.ai/v1","kimi-k2.6"],["glm","GLM / 智谱","https://open.bigmodel.cn/api/paas/v4","glm-4.7"]]){const group=el('section',
   'megulit-lookup-profile'),header=el('strong','',title);group.dataset.provider=name;group.append(header);const baseInput=el('input');baseInput.value=profiles[name]?.baseUrl||base;
   baseInput.type='url';baseInput.readOnly=['deepseek','gemini'].includes(name);const modelInput=el('input');modelInput.value=profiles[name]?.model??model;modelInput.placeholder='模型名（按服务商提供的名称填写）';
   const key=el('input');key.type='password';key.autocomplete='off';key.spellcheck=false;key.placeholder='API Key，由 Windows 加密保存';for(const [caption,input]of [['接口地址',
   baseInput],['模型',modelInput],['API Key',key]]){const l=el('label','',caption);l.append(input);group.append(l);}fields[name]={baseInput,modelInput,key};details.append(group);
   }
  const switchProvider=()=>{for(const group of details.querySelectorAll('.megulit-lookup-profile')){group.hidden=group.dataset.provider!==choose.value;group.style.display=group.hidden?'none':'';
   }window.__tomoyoHitRegionsRefresh?.(true);};choose.addEventListener('change',switchProvider);switchProvider();
  const state=el('div','tomoyo-muted');modelPanels.add({details,state,fields});details.append(button('保存学习模型',()=>{const lookupProfiles={},keys={};for(const [name,
   f]of Object.entries(fields)){lookupProfiles[name]={baseUrl:f.baseInput.value,model:f.modelInput.value};if(f.key.value.trim())keys[name]=f.key.value.trim();}const lookupProvider=b.options().lookupProvider;
   b.updateLearningSettings({contextProvider:choose.value,lookupProfiles});state.textContent='正在保存…';send({type:'lookupConfigure',settings:{lookupProvider,contextProvider:choose.value,
   lookupProfiles},keys});}),state,keyGuide(),el('small','tomoyo-muted','点词释义（点读解释来源）是另一个设置，不受这里影响；本地查词、读音和变形分析始终离线可用，API 只在你点击「上下文解释」「归纳义项」时调用。'));details.addEventListener('change',
   e=>e.stopPropagation());panel.append(details);
 }
 const style=el('style');style.textContent=`
 .tomoyo-selection-card{opacity:1!important;transform:none!important;animation:none!important;position:fixed!important;z-index:26000!important;pointer-events:auto!important;box-sizing:border-box!important;max-width:calc(100vw - 24px)!important;max-height:calc(100vh - 24px)!important;overflow:auto!important;padding:0!important;border:1px solid var(--theme-border,#444)!important;border-radius:14px!important;background:var(--theme-surface,#202024)!important;color:var(--theme-text,#eee)!important;box-shadow:0 12px 40px #0005!important;font:14px/1.7 'Microsoft YaHei',Meiryo,sans-serif!important;letter-spacing:normal!important;text-shadow:none!important;-webkit-text-stroke:0!important;scrollbar-width:thin;scrollbar-color:var(--theme-border,#444) transparent;-webkit-app-region:no-drag}
 .tomoyo-selection-card *{box-sizing:border-box;font-family:'Microsoft YaHei',Meiryo,sans-serif;letter-spacing:normal;text-shadow:none;-webkit-text-stroke:0}.tomoyo-selection-card header{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-bottom:1px solid var(--theme-border,#444);font-size:11px;color:var(--theme-textSecondary,#aaa)}.tomoyo-selection-card button{font:inherit;font-size:12px;color:var(--theme-text,#eee);background:transparent;border:1px solid var(--theme-border,#444);border-radius:7px;padding:5px 10px;cursor:pointer}.tomoyo-selection-card header button{border:0;font-size:20px;padding:0 3px;line-height:1.2}
 .tomoyo-selection-body{padding:16px 18px}.tomoyo-word-heading{display:grid;grid-template-columns:minmax(50px,auto) minmax(0,1fr) auto;align-items:start;gap:12px}.tomoyo-word-heading strong{font-size:22px;line-height:1.4;color:var(--theme-primary,#e0495a)}.tomoyo-word-form{font-size:11px;color:var(--theme-textSecondary,#aaa)}.tomoyo-word-form b{font-weight:500;display:block}.tomoyo-word-form small{display:block;line-height:1.6;font-size:11px}.tomoyo-word-pos{max-width:130px;font-size:11px;line-height:1.6;color:var(--theme-textSecondary,#aaa)}.tomoyo-word-pos.has-facts{display:grid;justify-items:end;gap:5px;text-align:right}.tomoyo-word-facts{display:flex;gap:4px;justify-content:flex-end}.tomoyo-word-facts>span{font-size:10.5px;line-height:1;padding:3px 6px;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:4px;white-space:nowrap;font-variant-numeric:tabular-nums}.tomoyo-word-jlpt{color:var(--theme-primary,#e0495a);font-weight:700}.tomoyo-word-reading{font-size:15px;color:var(--theme-textSecondary,#aaa);margin:5px 0 12px}.tomoyo-word-reading small{display:inline-block;font-size:11px;margin-left:12px}
 .tomoyo-sense{display:grid;grid-template-columns:20px minmax(0,1fr);gap:8px;padding:6px 0;line-height:1.8}.tomoyo-sense-number{font-size:10px;color:var(--theme-primary,#e0495a);padding-top:3px}.tomoyo-senses details{margin-top:6px}.tomoyo-senses summary{font-size:12px;color:var(--theme-textSecondary,#aaa);cursor:pointer;padding:5px 0}.tomoyo-muted{font-size:12px;color:var(--theme-textSecondary,#aaa);line-height:1.7}.tomoyo-word-part{border-top:1px solid var(--theme-border,#444);padding-top:14px;margin-top:14px}.tomoyo-word-part .tomoyo-word-heading strong{font-size:18px}.tomoyo-selected-phrase{font-size:19px;line-height:1.7;margin:0 0 4px;font-weight:500}.tomoyo-selection-card footer{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid var(--theme-border,#444)}.tomoyo-chunks{display:flex;flex-direction:column;gap:7px;margin-top:10px}.tomoyo-chunk:not(.tomoyo-chunk-open) .tomoyo-word-minor{display:none}.tomoyo-chunk-toggle{cursor:pointer}.tomoyo-chunk-toggle .tomoyo-chunk-text::after{content:' ＋';font-size:11px;font-weight:400;color:var(--theme-textSecondary,#aaa)}.tomoyo-chunk-open .tomoyo-chunk-toggle .tomoyo-chunk-text::after{content:' −'}.tomoyo-chunk{border:1px solid color-mix(in srgb,var(--theme-border,#444) 70%,transparent);border-radius:12px;padding:6px 10px 0;background:color-mix(in srgb,var(--theme-text,#eee) 2.5%,transparent)}.tomoyo-chunk-title{display:flex;align-items:center;gap:8px;padding:0 2px 4px;border-bottom:1px dashed color-mix(in srgb,var(--theme-border,#444) 70%,transparent)}.tomoyo-chunk-text{font-size:15px;font-weight:700}.tomoyo-chunk-role{margin-left:auto;font-size:11px;font-weight:700;padding:1px 8px;border-radius:99px;color:var(--theme-primary,#e0495a);background:color-mix(in srgb,var(--theme-primary,#e0495a) 14%,transparent)}.tomoyo-word-rows{display:flex;flex-direction:column}.tomoyo-chunk .tomoyo-word-row:last-child{border-bottom:0}.tomoyo-selection-card>footer{border-top:0!important;border-bottom:1px solid var(--theme-border,#444)}.tomoyo-selection-card>footer+.tomoyo-ai-result{margin-top:12px}.tomoyo-word-row{border-bottom:1px solid color-mix(in srgb,var(--theme-border,#444) 60%,transparent)}.tomoyo-word-row>summary{list-style:none;display:grid;grid-template-columns:auto auto auto minmax(0,1fr);align-items:baseline;column-gap:8px;padding:8px 2px;cursor:pointer}.tomoyo-word-row>summary::-webkit-details-marker{display:none}.tomoyo-word-row>summary:hover{background:color-mix(in srgb,var(--theme-text,#eee) 4%,transparent)}.tomoyo-word-row>summary strong{font-size:16px;color:var(--theme-primary,#e0495a)}.tomoyo-row-reading{font-size:12px;color:var(--theme-textSecondary,#aaa)}.tomoyo-row-pos{font-size:10.5px;padding:0 6px;border-radius:5px;background:color-mix(in srgb,var(--theme-text,#eee) 8%,transparent);color:var(--theme-textSecondary,#aaa);white-space:nowrap}.tomoyo-row-meaning{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tomoyo-row-form{grid-column:2/-1;font-size:11px;color:var(--theme-textSecondary,#aaa)}.tomoyo-word-minor>summary strong{font-size:14px;color:var(--theme-textSecondary,#aaa)}.tomoyo-word-minor .tomoyo-row-meaning{color:var(--theme-textSecondary,#aaa);font-size:12px}.tomoyo-word-row[open]>summary .tomoyo-row-meaning{white-space:normal}.tomoyo-row-detail{padding:2px 2px 12px}.tomoyo-row-detail .tomoyo-word-heading strong{font-size:16px}.tomoyo-ai-result{margin:0 18px 16px;border-left:2px solid var(--theme-primary,#e0495a);padding-left:12px;font-size:13px;white-space:pre-wrap}.tomoyo-ai-result strong{display:block;font-size:11px;color:var(--theme-primary,#e0495a);margin-bottom:6px}.tomoyo-selection-open .lookup-tooltip{display:none!important}.tomoyo-alternative{display:block;font-size:11px;color:var(--theme-textSecondary,#aaa);margin-top:12px}.tomoyo-alternative select{font:inherit;max-width:100%;background:var(--theme-background,#111);color:var(--theme-text,#eee);border:1px solid var(--theme-border,#444);border-radius:6px;padding:4px}
 .megulit-key-guide{margin:8px 0 10px;font-size:12px;line-height:1.7;color:var(--theme-textSecondary,#bbb)}.megulit-key-guide p{margin:0 0 6px}.megulit-key-guide .megulit-key-free{color:var(--theme-text,#eee);font-weight:600}.megulit-key-guide ol{margin:4px 0 0;padding-left:20px}.megulit-key-guide li{margin:2px 0}
 .tomoyo-learning-models{border-top:1px solid var(--theme-border,#444);padding-top:16px;margin-top:18px}.tomoyo-learning-models summary{cursor:pointer}.tomoyo-learning-models>details{padding:10px 0;border-bottom:1px solid var(--theme-border,#444)}.tomoyo-learning-models input,.tomoyo-learning-models select{display:block;width:100%;box-sizing:border-box;background:var(--theme-background,#111);color:var(--theme-text,#eee);border:1px solid var(--theme-border,#444);border-radius:7px;padding:8px;margin-top:5px;font:inherit}.tomoyo-learning-models input[readonly]{opacity:.7}
 `;(document.head||document.documentElement).append(style);const mount=()=>{for(const panel of document.querySelectorAll('.tomoyo-learning-panel'))modelPanel(panel);
  };new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
})();
