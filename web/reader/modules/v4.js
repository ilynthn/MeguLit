// SPDX-License-Identifier: GPL-3.0-or-later
(function installV4(){
 'use strict';if(!document.documentElement||!window.__tomoyoChinese){document.addEventListener('DOMContentLoaded',installV4,{once:true});return;}const b=window.__tomoyoChinese;
  if(b.v4)return;b.v4=true;let serial=0,config={},currentAudio;const pending=new Map();
 const send=m=>window.__tomoyoTranslateRequest(JSON.stringify(m));
 const request=(action,args={},timeout=240000)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('服务等待超时，请检查组件状态'));
  },timeout);pending.set(id,{resolve,reject,timer});send({type:'v4',id,action,args});});
 b.v4Request=request; // shared with library.js
 b.v4Deliver=(id,result,error)=>{const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);error?p.reject(Error(error)):p.resolve(result);};
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const button=(label,fn)=>{const n=el('button',label);n.type='button';n.onclick=fn;return n;};
 const pitchName=(p,n)=>p===0?'平板':p===1?'頭高':p===n?'尾高':'中高';
 // Small high/low contour of the word's morae, like a dictionary accent mark.
 function pitchCurve(morae,p){const n=Math.max(1,morae.length),high=i=>p===0?i>0:p===1?i===0:i>0&&i<p,step=12,w=n*step+4,ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,
  'svg');svg.setAttribute('viewBox','0 0 '+w+' 16');svg.setAttribute('width',String(w));svg.setAttribute('height','16');svg.setAttribute('aria-hidden','true');const pts=[];
  for(let i=0;i<n;i++)pts.push([2+i*step+step/2,high(i)?4:12]);const line=document.createElementNS(ns,'polyline');line.setAttribute('points',pts.map(q=>q.join(',')).join(' '));
  svg.append(line);for(const [x,y]of pts){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r','2.2');
  svg.append(c);}return svg;}
 /* E270 (user: one word could be sent to Anki again and again): words already sent from a sentence, this session */
 let autoSpoken={key:'',at:0};const minedKeys=new Set();
 b.decorateWordActions=(card,args,result,opts={})=>{if(!card||!args)return;card.querySelector('.tomoyo-v4-actions')?.remove();const box=el('div'),status=el('small'),
  pitch=el('div'),audio=button('🔊',()=>act('speak')),anki=button('＋ Anki',()=>{if(!ankiBusy&&!minedKeys.has(minedKey()))act('anki');});box.className='tomoyo-v4-actions';
  let ankiBusy=false;const minedKey=()=>[args.text,args.start,args.end,args.entryId||''].join('|'),markMined=()=>{anki.dataset.state='done';anki.dataset.mgIcon='1';anki.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>已加入</span>';anki.title='这个词已从这句加入 Anki';
  };if(minedKeys.has(minedKey())){anki.disabled=true;markMined();}audio.setAttribute('aria-label','朗读当前词');audio.title='使用 AivisSpeech 朗读当前词';pitch.hidden=true;
  pitch.className='tomoyo-pitch-choices';pitch.setAttribute('role','radiogroup');pitch.setAttribute('aria-label','选择音调');let pitchValue;anki.className='tomoyo-anki-button';
  audio.className='tomoyo-speak-button';box.append(audio,pitch,anki);const keep=b.savedSentences;let keepButton=null;if(keep){/* 收藏句子 on every lookup card (user 2026-11-13: a click-lookup card had no button): the whole line the word sits in */keepButton=button('',
  async()=>{const s=keep.t();keepButton.disabled=true;try{if(keep.isSaved(args.text)===true){await keep.remove(args.text);status.textContent=s.removed;}else{await keep.save(args.text);
  }}catch(e){status.textContent=s.failed+e.message;}finally{if(alive())keepButton.disabled=false;paintKeep();}});keepButton.className='tomoyo-save-sentence-button';
  box.append(keepButton);keep.state(args.text).catch(()=>{}).finally(paintKeep);const off=keep.onChange(()=>{if(!alive()){off();return;}if(keep.isSaved(args.text)===undefined)keep.state(args.text).catch(()=>{
  });paintKeep();});}function paintKeep(){if(!keepButton)return;const s=keep.t(),on=keep.isSaved(args.text)===true;keepButton.textContent=on?s.saved:s.save;keepButton.title=on?s.savedTitle:s.saveTitle;
  keepButton.setAttribute('aria-pressed',String(on));keepButton.classList.toggle('tomoyo-sentence-saved',on);}paintKeep();box.append(status);card.querySelector('footer').before(box);
  // Put the speaker inline before the headword (or the selected phrase) so it can never overlap the text.
  // Compact card top: the action buttons, Anki and close share one slim bar; source and status go to a quiet
  // line at the bottom. The pitch chips (only when a choice is needed) stay where they were.
  {const header=card.querySelector('header'),footer=card.querySelector('footer');if(header&&footer){let bar=header.querySelector('.tomoyo-card-bar');if(!bar){bar=el('div');
   bar.className='tomoyo-card-bar';const label=header.firstElementChild&&header.firstElementChild.tagName!=='BUTTON'?header.firstElementChild:null;header.prepend(bar);
   for(const n of [...footer.children])bar.append(n);footer.classList.add('tomoyo-footer-empty');const meta=el('div');meta.className='tomoyo-card-meta';if(label){
   meta.append(el('span',label.textContent));label.remove();}card.append(meta);}
   bar.querySelector('.tomoyo-anki-button')?.remove();bar.querySelector('.tomoyo-save-sentence-button')?.remove();/* 收藏句子 sits beside + Anki (user 2026-11-13: same level) */if(keepButton)bar.append(keepButton);bar.append(anki);const meta=card.querySelector('.tomoyo-card-meta');meta?.querySelector('.tomoyo-v4-status')?.remove();
    status.classList.add('tomoyo-v4-status');meta?.append(status);}}
  const phraseTitle=card.querySelector('.tomoyo-selected-phrase'),headWord=card.querySelector('.tomoyo-word-heading strong');
  if(phraseTitle){phraseTitle.classList.add('tomoyo-speak-row');phraseTitle.prepend(audio);}
  else if(headWord){const row=el('span');row.className='tomoyo-speak-row';headWord.replaceWith(row);row.append(audio,headWord);}const entryId=result?.entries?.[0]?.id,
   scope={...args,entryId};let word;
  const alive=()=>box.isConnected&&card.querySelector('.tomoyo-v4-actions')===box;
  /* Auto read-aloud (user, 2026-11-09: people expected a looked-up or selected word to be spoken). Off by default
     since the voice engine is optional; the speaker's tooltip, and for the first few cards a quiet line in the card
     meta, say where to turn it on. The same word is not spoken twice when the card redraws. */
  audio.title='朗读当前词（Alt+T → 语音 可开启「点读或选中后自动朗读」）';
  if(config.aivisAutoSpeak){const key=[args.text,args.start,args.end].join('|'),now=Date.now();if(key!==autoSpoken.key||now-autoSpoken.at>1500){autoSpoken={key,
   at:now};setTimeout(()=>{if(alive()&&!audio.disabled)act('speak');},0);}}
  else{let seen=0;try{seen=Number(localStorage.getItem('megulit-autospeak-hint'))||0;}catch{}if(seen<3){try{localStorage.setItem('megulit-autospeak-hint',String(seen+1));
   }catch{}const hint=el('small','Alt+T → 语音 可开启自动朗读');hint.className='megulit-autospeak-hint';card.querySelector('.tomoyo-card-meta')?.append(hint);}}
  /* #115 (user: + Anki made the lookup card flash): the picture is taken as the card opens, before it is drawn, so + Anki
     needs no capture later. The card is never hidden for it (the picture is the game window alone). */
  b.precaptureReader=()=>{if(config.ankiGameMedia===false)return null;const at=Date.now();return captureReader().then(id=>id?{id,at}:null).catch(()=>null);};
  async function captureReader(){
   /* 2026-11-14 (user: an Anki picture held MeguLit's own lookup card and furigana): the picture is the game window's own
      surface (GalWindowBridge mediaClip -> GameCapture.Picture), never a copy of the screen, so nothing is hidden or measured here. */
   if(config.ankiGameMedia===false)return;
   try{return (await request('ankiScreenshot',{},5000)).id;}catch{return;}
  }
  async function act(action){if(action==='anki'){if(ankiBusy)return;ankiBusy=true;anki.dataset.state='busy';}audio.disabled=anki.disabled=true;status.textContent=action==='speak'?'合成读音中…':'同步 Anki 中…';
   const started=Date.now(),ticker=action==='speak'?setInterval(()=>{if(!alive())return;const s=Math.round((Date.now()-started)/1000);status.textContent='合成读音中… '+s+' 秒'+(s>=5?'（语音引擎首次启动或加载模型会慢一些）':'');
   },1000):0;try{const value=await request(action,{...scope,pitchChoice:pitch.hidden?undefined:pitchValue,...(action==='anki'?{aiNote:card.__megulitAi||undefined,
   translation:currentTranslation(scope.text),screenshotId:(await(card.__megulitShot||Promise.resolve(null)).then(v=>v&&Date.now()-v.at<170000?v.id:null).catch(()=>null).finally(()=>{
   card.__megulitShot=null;}))||await captureReader()}:{})});if(!alive())return;if(action==='speak'){currentAudio?.pause();const bytes=Uint8Array.from(atob(value.data),
   c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})),player=currentAudio=new Audio(url);player.volume=Number.isFinite(config.aivisVolume)?config.aivisVolume:.9;
   player.onended=()=>URL.revokeObjectURL(url);player.onerror=()=>URL.revokeObjectURL(url);await player.play();status.textContent=(value.cached?'已播放缓存读音':'正在播放');
   }else{minedKeys.add(minedKey());status.textContent=value.updated?'已更新 Anki 词条':'已加入 Anki';/* the service keeps every Anki card's line in 学习 → 句子 (auto) */if(value.sentenceSaved&&keep){
   keep.markSaved(args.text);status.textContent+=' · '+keep.t().also;paintKeep();}if(value.mediaWarning==='SCREENSHOT_UNAVAILABLE')status.textContent+=' · '+(document.documentElement.lang.startsWith('ja')?'ゲーム画像を取得できませんでした':document.documentElement.lang.startsWith('en')?'Game screenshot unavailable':'未获取到游戏截图');
   if(value.sentenceAudioSource){const labels={game:['例句：游戏原声','Example: game voice','例文：ゲーム音声'],synthesized:['例句：合成语音','Example: synthesized voice','例文：合成音声']};
   const lang=document.documentElement.lang;status.textContent+=' · '+labels[value.sentenceAudioSource][lang.startsWith('ja')?2:lang.startsWith('en')?1:0];}try{
   window.__tomeAnkiMined?.({entry:result?.entries?.find(e=>e.id===entryId)||result?.entries?.[0],args,noteId:value.id,word});}catch{}}}catch(e){if(alive())status.textContent=e.message;
   }finally{clearInterval(ticker);if(action==='anki'){ankiBusy=false;if(anki.dataset.state==='busy')delete anki.dataset.state;}if(alive()){audio.disabled=false;anki.disabled=minedKeys.has(minedKey());if(anki.disabled)markMined();
   }}}
  request('word',scope).then(value=>{if(!alive())return;word=value;status.textContent=(value.pronunciationForm==='lemma'?'原形朗读：':'')+(value.reading||value.surface)+(value.pitch?.length?' · 音调 '+value.pitch.join(' / '):'')+' · '+value.pitchSource;
   if(value.pitch?.length>1){pitch.hidden=false;const morae=(value.reading.match(/[ぁ-ゖァ-ヺー][ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]?/g)||[]);const pick=p=>{pitchValue=p;for(const c of pitch.children)c.setAttribute('aria-checked',
   String(Number(c.dataset.pitch)===p));};for(const p of value.pitch){const chip=el('button');chip.type='button';chip.dataset.pitch=String(p);chip.setAttribute('role',
   'radio');chip.title=p+' 型';chip.append(pitchCurve(morae,p),el('span',p+' · '+pitchName(p,morae.length)));chip.onclick=()=>pick(p);pitch.append(chip);}pick(value.pitch[0]);
   }audio.disabled=!value.reading&&!value.surface;audio.title=audio.disabled?'没有可朗读的读音':'朗读 '+(value.reading||value.surface);
   // Prepare the audio while the reader looks at the card; it only plays on click.
   if(!audio.disabled&&(value.pitch?.length||0)<=1)request('prefetch',scope).catch(()=>{});}).catch(e=>{if(alive())status.textContent=e.message;});
 };
 const oldStatus=b.galStatus;b.galStatus=m=>{oldStatus?.(m);if(m.hookSource!==undefined&&typeof m.hookSource==='string')b.hookSourceText=m.hookSource;if(m.type==='dialogCalibration')for(const node of document.querySelectorAll('[data-v4-calibration]'))node.textContent=m.message;
  if(typeof m.hookSequence==='number')b.hookSequence=m.hookSequence;for(const k of ['processAttached','streamSelected','receivedText','replacementState','hookRecovering'])if(m[k]!==undefined)b[k]=m[k];
  if(typeof m.dialogVisible==='boolean'){document.body.classList.toggle('tomoyo-dialog-hidden',!m.dialogVisible);if(!m.dialogVisible)b.closeLocalSelection?.();}updateDiagnostic();
  };
 function diagnostic(){return ['进程：'+(b.processAttached?'已附加':'未附加'),'文本流：'+(b.streamSelected?'已选中':'未选中'),'文本：'+(b.receivedText?'已接收':b.hookRecovering?'恢复中，保留最后一句':'等待实际文本'),
  '替换：'+(b.replacementState==='user-verified'?'用户已确认原文隐藏':b.replacementState==='callback-acknowledged'?'已应答，画面待验证':b.replacementState==='clear-requested'?'已请求清空，画面待验证':'尚未验证')].join(' · ');
  }
 function updateDiagnostic(){for(const n of document.querySelectorAll('[data-v4-hook]'))if(n.textContent!==diagnostic())n.textContent=diagnostic();}
 function panel(host){if(host.querySelector('.tomoyo-v4-settings'))return;const section=el('section');section.className='tomoyo-v4-settings';const status=el('div'),
  fields={};const imm=el('section');imm.className='tomoyo-v4-immersion';imm.append(el('h4','沉浸模式'));const voice=el('section'),voiceStatus=el('small');
  // 'fetch failed' is the raw error when the local speech engine is not up yet (starting, or restarting after a voice
  // was deleted): say that in words instead, and clear it once speakers load again (user, 2026-11-02).
  const voiceError=e=>{const raw=String(e?.message||e||'');if(!/fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|network/i.test(raw))return raw;voiceStatus.dataset.err='1';
   const l=(window.__tomeI18n?.get?.()||'zh').slice(0,2);return l==='en'?'The speech engine is not ready yet (it may be starting or restarting). Wait a few seconds, then click "Refresh voice list"':l==='ja'?'音声エンジンがまだ準備できていません（起動中または再起動中の可能性があります）。数秒待ってから「声の一覧を更新」を押してください':'语音引擎还没准备好（可能正在启动或重启），稍等几秒后点「刷新声音列表」重试';
   };voice.className='tomoyo-v4-voice';voice.append(el('h4','朗读语音'));
  const inputs=[['aivisUrl','AivisSpeech 地址','url'],['aivisSpeaker','话者样式 ID','number'],['aivisVolume','朗读音量','range'],['aivisSpeed','语速','range'],['aivisGpu','使用显卡加速朗读（更快；重启软件后生效）',
   'checkbox'],['aivisAutoSpeak','点读或选中单词后自动朗读','checkbox'],['ankiUrl','AnkiConnect 地址','url'],['ankiDeck','Anki 牌组','text'],['ankiModel','Anki 笔记类型','text'],['ankiPath',
   'Anki 程序路径（anki.exe，留空则自动查找）','text'],['ankiAudio','制卡包含语音','checkbox'],['ankiGameMedia','优先使用游戏原声，并在答案附游戏截图','checkbox'],['ankiVoiceIsolate','游戏录音去掉背景音乐（首次使用会在后台下载约 170 MB 的人声分离模型）',
   'checkbox'],['immersion','无对话时自动隐藏，下一句出现时再显示','checkbox']];
  section.append(el('h4','Anki 制卡'));const ankiNote=el('small');ankiNote.className='tomoyo-anki-note';ankiNote.textContent='制卡要先让本机的 Anki 软件开着，并装好 AnkiConnect 插件（工具 → 插件 → 获取插件，代码 2055492159，装完重启 Anki）。也可以在下面填好 anki.exe 的路径并保存，之后点「启动 Anki」就行；默认安装位置一般是 C:\\Users\\你的用户名\\AppData\\Local\\Programs\\Anki\\anki.exe。';
   section.append(ankiNote);for(const [key,label,type] of inputs){const row=el('label',label),input=el('input');input.type=type;input.dataset.v4Key=key;if(type==='checkbox')input.checked=config[key]===true;
   else input.value=config[key]??'';if(key==='aivisSpeed'){input.step='.05';input.min='.5';input.max='2';input.value=config.aivisSpeed??1;}if(key==='aivisVolume'){
   input.step='.05';input.min='0';input.max='1';input.value=config.aivisVolume??.9;}
   if(type==='range'){const out=el('output');out.className='tomoyo-slider-value';const show=()=>{out.textContent=key==='aivisVolume'?String(Math.round(input.value*100)):Number(input.value).toFixed(2)+'×';
    };input.addEventListener('input',show);show();row.append(out);}
   // Volume applies at once (also to audio already playing) and is saved without pressing the save button.
   if(key==='aivisAutoSpeak'){input.addEventListener('change',()=>{config.aivisAutoSpeak=input.checked;request('configure',{...config,aivisAutoSpeak:input.checked}).then(v=>{
    config=v;}).catch(e=>{status.textContent=e.message;});});}
   if(key==='aivisVolume'){input.addEventListener('input',()=>{config.aivisVolume=Number(input.value);if(currentAudio)currentAudio.volume=config.aivisVolume;});
    input.addEventListener('change',()=>{request('configure',{...config,aivisVolume:Number(input.value)}).then(v=>{config=v;}).catch(e=>{status.textContent=e.message;
    });});}
   fields[key]=input;row.append(input);if(key==='ankiPath')row.append(button('浏览…',async()=>{try{const value=await window.__megulitPickExecutable();if(value){input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));}}catch(e){status.textContent=e.message||String(e);}}));if(key==='ankiDeck')row.append(el('small','新加入的单词会保存到这个牌组，可与当前复习牌组不同'));
    if(key==='ankiModel')row.append(el('small','决定卡片字段和正反面排版；MeguLit / 旧 ToMe 类型包含释义、例句、语音和游戏截图'));(key==='immersion'?imm:/^aivis/.test(key)?voice:section).append(row);
    }
  // Speaker: pick "voice（style）" from AivisSpeech instead of typing a bare style ID; the ID is still what gets saved.
  let loadSpeakers=async()=>{};
  // Style names are Japanese descriptions of how the voice speaks; translate the common ones (speaker names stay as they are).
  // Style names are Japanese descriptions of how the voice speaks; translate them (speaker names stay as they are).
  // Keys are matched after katakana→hiragana folding, so ノーマル / のーまる and ふつう / ふつー all hit the same entry.
  const STYLE_RAW=[
   ['ノーマル','普通','Normal'],['ふつう','普通','Normal'],['ふつー','普通','Normal'],['普通','普通','Normal'],['通常','普通','Normal'],['標準','标准','Standard'],['ニュートラル','中性','Neutral'],
    ['デフォルト','默认','Default'],
   ['あまあま','甜美','Sweet'],['甘々','甜美','Sweet'],['甘い','甜美','Sweet'],['ちょいあま','微甜','Slightly sweet'],['甘え','撒娇','Clingy'],['甘えんぼ','撒娇','Clingy'],['デレ','娇羞','Lovey'],
    ['デレデレ','黏人','Lovey-dovey'],['ぶりっこ','装可爱','Cutesy'],['かわいい','可爱','Cute'],['可愛い','可爱','Cute'],
   ['ツンツン','傲娇','Tsun'],['ツンデレ','傲娇','Tsundere'],['ツンギレ','傲娇暴怒','Tsun (angry)'],['ヤンデレ','病娇','Yandere'],['やむやむ','病娇','Yandere'],['病み','病娇','Unstable'],
   ['セクシー','性感','Sexy'],['色っぽい','妩媚','Alluring'],['大人っぽい','成熟','Mature'],
   ['ささやき','耳语','Whisper'],['囁き','耳语','Whisper'],['ひそひそ','悄悄话','Hushed'],['内緒話','悄悄话','Secret talk'],['ぼそぼそ','嘟囔','Mumbling'],['小声','小声','Quiet'],
   ['喜び','喜悦','Joy'],['よろこび','喜悦','Joy'],['嬉しい','开心','Happy'],['うれしい','开心','Happy'],['楽しい','愉快','Fun'],['たのしい','愉快','Fun'],['楽々','轻松','Easygoing'],['上機嫌','心情好',
    'Cheerful'],['ご機嫌','心情好','Cheerful'],['うきうき','雀跃','Bubbly'],['わくわく','期待','Excited'],['にこにこ','笑眯眯','Smiling'],['笑い','笑','Laughing'],
   ['怒り','生气','Angry'],['いかり','生气','Angry'],['おこ','生气','Mad'],['激おこ','暴怒','Furious'],['不機嫌','不高兴','Grumpy'],['むかむか','恼火','Irritated'],['いらいら','烦躁','Annoyed'],['ぷんぷん',
    '气鼓鼓','Huffy'],
   ['悲しみ','悲伤','Sad'],['かなしみ','悲伤','Sad'],['悲しい','悲伤','Sad'],['泣き','哭泣','Crying'],['なみだめ','泪眼','Teary'],['涙目','泪眼','Teary'],['びえーん','哭腔','Sobbing'],['めそめそ','啜泣',
    'Weepy'],['しょんぼり','沮丧','Dejected'],['落ち込み','低落','Down'],['沈み','消沉','Gloomy'],
   ['せつなめ','略带伤感','Wistful'],['せつない','伤感','Wistful'],['切ない','伤感','Wistful'],['寂しい','寂寞','Lonely'],['さみしい','寂寞','Lonely'],['不安','不安','Anxious'],['怯え','胆怯','Frightened'],
    ['おびえ','胆怯','Frightened'],['こわがり','胆小','Timid'],['恐怖','害怕','Scared'],['怖い','害怕','Scared'],
   ['驚き','惊讶','Surprised'],['おどろき','惊讶','Surprised'],['びっくり','吃惊','Startled'],['呆れ','无语','Exasperated'],['あきれ','无语','Exasperated'],['嫌悪','厌恶','Disgust'],['軽蔑','轻蔑',
    'Contempt'],['嘲笑','嘲笑','Mocking'],['煽り','挑衅','Taunting'],['あおり','挑衅','Taunting'],
   ['からかい','调侃','Teasing'],['いたずら','恶作剧','Mischievous'],['どや','得意','Smug'],['どや顔','得意','Smug'],['自信','自信','Confident'],['余裕','从容','Composed'],['照れ','害羞','Bashful'],
    ['てれ','害羞','Bashful'],['恥ずかしい','害羞','Shy'],['はずかしい','害羞','Shy'],['恥ずかしがり','害羞','Shy'],
   ['落ち着き','沉稳','Calm'],['おちつき','沉稳','Calm'],['しっとり','温婉','Soft'],['おっとり','温吞','Mellow'],['のんびり','悠闲','Relaxed'],['ゆったり','舒缓','Leisurely'],['くーる','冷静','Cool'],['冷静',
    '冷静','Composed'],['優しい','温柔','Gentle'],['やさしい','温柔','Gentle'],['穏やか','平和','Mild'],['おだやか','平和','Mild'],
   ['真剣','认真','Serious'],['しんけん','认真','Serious'],['真面目','认真','Earnest'],['まじめ','认真','Earnest'],['きりっ','干练','Crisp'],['はきはき','爽朗','Clear'],['元気','元气','Energetic'],
    ['げんき','元气','Energetic'],['明るい','开朗','Bright'],['あかるい','开朗','Bright'],
   ['テンション高め','兴奋','High energy'],['ハイテンション','兴奋','High energy'],['テンション低め','无精打采','Low energy'],['ローテンション','无精打采','Low energy'],['だうなー','慵懒','Downer'],['あっぱー',
    '高昂','Upper'],['気だるげ','慵懒','Languid'],['けだるげ','慵懒','Languid'],['無気力','无精打采','Listless'],
   ['熱血','热血','Fiery'],['叫び','呐喊','Shouting'],['さけび','呐喊','Shouting'],['絶叫','尖叫','Screaming'],
   ['眠たい','困倦','Sleepy'],['ねむたい','困倦','Sleepy'],['眠い','困倦','Sleepy'],['ねむい','困倦','Sleepy'],['ねむねむ','迷糊','Drowsy'],['寝起き','刚睡醒','Just woke up'],['へろへろ','疲惫','Exhausted'],
    ['疲れ','疲惫','Tired'],['つかれ','疲惫','Tired'],
   ['低音','低沉','Low'],['低め','偏低','Lower'],['高音','高亢','High'],['高め','偏高','Higher'],['ゆっくり','慢速','Slow'],['早口','快语速','Fast'],['なれーしょん','旁白','Narration'],['朗読','朗读',
    'Reading'],['読み聞かせ','讲故事','Storytelling'],['あなうんす','播报','Announcer'],['実況風','解说风','Commentary'],['にゅーす','新闻播报','News'],
   ['人間ver.','人类版','Human ver.'],['ぬいぐるみver.','布偶版','Plush ver.'],['鬼ver.','鬼版','Demon ver.'],['人間','人类','Human'],['ぬいぐるみ','布偶','Plush'],
   ['Angry','生气','Angry'],['Fear','害怕','Fear'],['Happy','开心','Happy'],['Sad','悲伤','Sad'],['Disgust','厌恶','Disgust'],['Surprised','惊讶','Surprised'],['close','近距离',
    'Close'],['far','远距离','Far'],['close-shout','近距离喊叫','Close shout'],['far-shout','远距离喊叫','Far shout'],['子供','童声','Child'],['こども','童声','Child'],['大人','成熟','Adult'],
    ['おとな','成熟','Adult'],['少年','少年','Boy'],['少女','少女','Girl'],['お姉さん','大姐姐','Big sister'],['おねえさん','大姐姐','Big sister'],['お嬢様','大小姐','Ojousama'],['ぎゃる','辣妹','Gal'],
    ['関西弁','关西腔','Kansai dialect']];
  const fold=t=>String(t).normalize('NFKC').trim().toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96)).replace(/\s+/g,'');
  const STYLE=new Map(STYLE_RAW.map(([k,zh,en])=>[fold(k),[zh,en]]));
  // Exact match first; then a "base（inner）ver." compound piece by piece; then without a trailing number / "め".
  function styleText(name,i){const key=fold(name);if(!key)return '';const hit=STYLE.get(key);if(hit)return hit[i];
   const m=/^(.*?)[(（](.+?)[)）](.*)$/.exec(String(name).normalize('NFKC'));if(m){const parts=[m[1],m[2],m[3]].map(p=>p.trim()?styleText(p,i)||(!i&&/^ver\.?$/i.test(p.trim())?'版':p.trim()):'');
    if(parts.some((p,n)=>p&&p!==[m[1],m[2],m[3]][n].trim()))return parts[0]+(parts[1]?'（'+parts[1]+'）':'')+(parts[2]?(i?' ':'')+parts[2]:'');}
   const bare=key.replace(/[0-9]+$/,'').replace(/ver\.?$/,'');if(bare&&bare!==key){const t=STYLE.get(bare);if(t)return t[i]+(key.endsWith('ver.')||key.endsWith('ver')?(i?' ver.':'版'):'');
    }
   if(key.length>2&&key.endsWith('め')){const t=STYLE.get(key.slice(0,-1));if(t)return (i?'Slightly ':'略')+t[i];}
   return '';}
  const styleLabel=n=>{const lang=window.__tomeI18n?.get?.()||'zh';if(lang==='ja')return n;const t=styleText(n,lang==='en'?1:0);return t&&fold(t)!==fold(n)?n+' · '+t:n;
   };
  {const spk=fields.aivisSpeaker,row=spk.closest('label'),sel=el('select'),hint=el('small');const speaker=el('select'),speakerRow=el('label','语音角色'),emotionRow=el('label',
   '情感／风格');speaker.className='tome-speaker-select';speakerRow.append(speaker);emotionRow.append(sel);let speakerList=[];const remembered=new Map();sel.className='tome-speaker-select';
   sel.hidden=true;hint.className='tome-speaker-hint';
   hint.textContent='AivisSpeech 里每个「话者」是一种声音，每个声音有几种说话风格（普通、温柔、开心等），每种风格对应一个 ID；在这里直接选声音和风格即可。';
   let previewPlayer=null;const PREVIEW='▶ 试听',STOP='■ 停止';const tryBtn=button(PREVIEW,async()=>{
     // Second click while playing stops it. Every way playback can end (finished, paused by another sound, error,
     // source torn down) resets the button; a timer based on the clip length is the last fallback.
     if(previewPlayer){previewPlayer.pause();return;}
     const id=Number(sel.hidden?spk.value:sel.value);if(!Number.isSafeInteger(id))return;tryBtn.disabled=true;tryBtn.textContent='合成中…';
     try{const v=await request('preview',{speaker:id,speed:Number(fields.aivisSpeed?.value)||1,text:'黒より黒く闇より暗き漆黒に我が深紅の混淆を望みたもう。'});currentAudio?.pause();const bytes=Uint8Array.from(atob(v.data),
      c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})),player=currentAudio=previewPlayer=new Audio(url);{const vol=Number(fields.aivisVolume?.value);
      player.volume=Number.isFinite(vol)?Math.max(0,Math.min(1,vol)):.8;}
      let done=false,timer=0;const finish=()=>{if(done)return;done=true;clearTimeout(timer);if(previewPlayer===player)previewPlayer=null;URL.revokeObjectURL(url);
       tryBtn.textContent=PREVIEW;tryBtn.disabled=false;};
      for(const name of ['ended','pause','error','emptied','abort'])player.addEventListener(name,finish,{once:true});
      player.addEventListener('loadedmetadata',()=>{if(Number.isFinite(player.duration)&&!done){clearTimeout(timer);timer=setTimeout(finish,player.duration*1000/(player.playbackRate||1)+1500);
       }},{once:true});
      timer=setTimeout(finish,30000);
      await player.play();if(!done){tryBtn.textContent=STOP;tryBtn.disabled=false;}}
     catch(e){voiceStatus.textContent=voiceError(e);previewPlayer=null;tryBtn.textContent=PREVIEW;tryBtn.disabled=false;}});tryBtn.className='tome-speaker-try';
   const pick=el('div');pick.className='tome-speaker-pick';row.append(pick);pick.append(speakerRow,emotionRow,tryBtn);row.after(hint);sel.onchange=()=>{spk.value=sel.value;
    remembered.set(speaker.value,sel.value);};
   const fillStyles=(index,current)=>{sel.replaceChildren();for(const st of speakerList[index]?.styles||[]){const option=new Option(styleLabel(st.name),String(st.id));
    option.dataset.styleName=st.name;option.dataset.noI18n='';sel.add(option);}if([...sel.options].some(o=>o.value===String(current)))sel.value=String(current);
    spk.value=sel.value;};
   speaker.onchange=()=>fillStyles(Number(speaker.value),remembered.get(speaker.value));
   // The menu is rebuilt on every open: fill the list from the last result right away (and show the picker, not the raw
   // ID field, while loading), so the ID box no longer flashes before the names arrive.
   const fill=list=>{speakerList=(Array.isArray(list)?list:[]).filter(s=>s.styles?.length);speaker.replaceChildren();const cur=String(spk.value||'').trim();let index=speakerList.findIndex(s=>s.styles.some(st=>String(st.id)===cur));
    if(index<0&&cur&&cur!=='0'){speakerList.push({name:'ID '+cur,styles:[{id:Number(cur),name:'ID '+cur}]});index=speakerList.length-1;}
    speakerList.forEach((s,i)=>{const o=new Option(s.name,String(i));o.dataset.noI18n='';speaker.add(o);});speaker.value=String(Math.max(0,index));fillStyles(Number(speaker.value),
     cur);
    sel.hidden=speaker.hidden=!speakerList.length;spk.hidden=!!speakerList.length;if(speakerList.length&&row.firstChild?.nodeType===3)row.firstChild.textContent='朗读声音';
     };
   sel.__tomeRefreshLanguage=()=>{for(const option of sel.options)if(option.dataset.styleName)option.textContent=styleLabel(option.dataset.styleName);};
   // Home and Alt+T panels share one published speaker list: a download or reload in one refreshes every open panel
   // (Alt+T used to keep the two speakers it was built with). Each open also re-reads the launcher's cached list.
   fill(window.__tomeSpeakerCache||[]);const onSpeakers=e=>{if(!row.isConnected){removeEventListener('tome-speakers',onSpeakers);return;}fill(e.detail);};addEventListener('tome-speakers',
    onSpeakers);request('speakersCached').then(list=>{if(Array.isArray(list)&&list.length)publishSpeakers(list);}).catch(()=>{});
   loadSpeakers=async manual=>{try{const list=await request('speakers');publishSpeakers(list);fill(list);if(voiceStatus.dataset.err){voiceStatus.textContent='';
    delete voiceStatus.dataset.err;}if(manual)voiceStatus.textContent='已读取 '+sel.options.length+' 个声音风格；选好后点「保存语音设置」';}
    catch(e){sel.hidden=true;spk.hidden=false;if(row.firstChild?.nodeType===3)row.firstChild.textContent='话者样式 ID';hint.textContent='没读到 AivisSpeech 的话者列表（可能还没启动），暂时可直接填 ID；启动 AivisSpeech 后点「刷新声音列表」即可按名字选择。';
     if(manual)voiceStatus.textContent=voiceError(e);}};
   // Opening settings must not start a GPU speech model; the Load speakers button starts it explicitly.
   }
  const detection=el('select');for(const [value,label]of [['marker','游戏等待标记 ▼（推荐，无需校准）'],['hook','Hook 明确空文本信号'],['visual','画面对话框边缘检测（需校准）']])detection.add(new Option(label,
   value));detection.value=config.dialogDetection||'marker';fields.dialogDetection=detection;imm.append(el('label','沉浸模式判断方式'),detection);const immHint=el('small');
   immHint.className='tome-imm-hint';imm.append(immHint);const edge=el('details');edge.className='tome-imm-edge';edge.append(el('summary','画面边缘检测区域（按游戏窗口百分比，窗口缩放后自动适配）'));
   imm.append(edge);const roi={};for(const [k,label,value]of [['x','左边距 %',2],['y','上边距 %',58],['width','宽度 %',96],['height','高度 %',2]]){const input=el('input');
   input.type='number';input.value=String(value);input.min='0';input.max='100';roi[k]=input;const labelNode=el('label',label);labelNode.append(input);edge.append(labelNode);
   }
  // Only the edge-detection mode reads these numbers; the default wait-marker mode needs no setup (user, 2026-11-02).
  const immMode=()=>{const v=detection.value;edge.hidden=v!=='visual';immHint.textContent=v==='marker'?'跟随游戏自己的「点击继续」标记判断有没有对话，不用设置，窗口大小变化也会自动适配':v==='hook'?'游戏发出空文本时隐藏，适合文字钩子稳定的游戏':'检测对话框边缘是否还在。先进入有对话框的画面，再点「记住当前对话框边缘」';
   };detection.addEventListener('change',immMode);immMode();const calibration=el('small');calibration.dataset.v4Calibration='';edge.append(button('记住当前对话框边缘',async()=>{
   try{await request('calibrate',Object.fromEntries(Object.entries(roi).map(([k,n])=>[k,Number(n.value)])));}catch(e){calibration.textContent=e.message;}}),calibration);
  const saveAll=async out=>{const value={...config};for(const [k,input]of Object.entries(fields))value[k]=input.type==='checkbox'?input.checked:['number','range'].includes(input.type)?Number(input.value):input.value;
   try{config=await request('configure',value);out.textContent='已保存，重启仍保留';}catch(e){out.textContent=e.message;}};const immStatus=el('small');imm.append(button('保存沉浸模式设置',
   ()=>saveAll(immStatus)),immStatus);section.append(button('保存学习服务',()=>saveAll(status)));
  // Recommended voices (AivisHub, ACML 1.0): downloaded in the background on request, about 250 MB each.
  const packWords={zh:{all:'推荐声音已全部安装',busy:(s)=>'正在下载 '+s.current+'（'+(s.done+1)+'/'+s.total+'，'+Math.round(s.bytes/1048576)+'/'+Math.round(s.size/1048576)+' MB）',
   done:'推荐声音已安装，正在重启语音引擎并刷新角色列表',ask:'将下载 {n} 个声音，共约 {mb} MB；10 秒内再点一次开始',title:'推荐声音（按需逐个下载，约 250 MB／个）',note:'删除会移除该声音的整个模型（含其全部风格），不影响其他声音',male:'男',female:'女',
   download:'下载',cancel:'取消',remove:'删除',confirm:'再点一次删除',installed:'已安装',removing:'删除中…',removed:'已删除',recommended:'推荐'},en:{all:'All recommended voices are installed',
   busy:(s)=>'Downloading '+s.current+' ('+(s.done+1)+'/'+s.total+', '+Math.round(s.bytes/1048576)+'/'+Math.round(s.size/1048576)+' MB)',done:'Voices installed; restarting the speech engine and refreshing the list',
   ask:'Downloads {n} voices, about {mb} MB in total; click again within 10 s to start',title:'Recommended voices (download one by one, about 250 MB each)',note:'Deleting removes that voice’s whole model (all its styles); other voices are not affected',
   male:'male',female:'female',download:'Download',cancel:'Cancel',remove:'Delete',confirm:'Click again to delete',installed:'Installed',removing:'Deleting…',removed:'Deleted',
   recommended:'Recommended'},ja:{all:'おすすめ音声はすべてインストール済みです',busy:(s)=>s.current+' をダウンロード中（'+(s.done+1)+'/'+s.total+'、'+Math.round(s.bytes/1048576)+'/'+Math.round(s.size/1048576)+' MB）',
   done:'インストールしました。音声エンジンを再起動して一覧を更新しています',ask:'{n} 個の音声（合計約 {mb} MB）をダウンロードします。10 秒以内にもう一度押すと開始します',title:'おすすめ音声（1 つずつダウンロード、各約 250 MB）',note:'削除するとその音声のモデル全体（すべてのスタイル）が消えます。ほかの音声には影響しません',
   male:'男性',female:'女性',download:'ダウンロード',cancel:'キャンセル',remove:'削除',confirm:'もう一度押すと削除',installed:'インストール済み',removing:'削除中…',removed:'削除しました',recommended:'おすすめ'}};
  const pw=()=>packWords[(window.__tomeI18n?.get?.()||'zh').slice(0,2)]||packWords.zh;
  // One row per recommended voice: its own progress bar, download / cancel / delete. Nothing is downloaded unasked.
  const pack=el('details');pack.className='tome-voice-pack';pack.dataset.noI18n='';const packHead=el('summary');packHead.className='tome-voice-pack-head';const packBody=el('div');
   packBody.className='tome-voice-pack-body';pack.append(packHead,packBody);let packTimer=0,wasRunning=false;
  const armed=new Map(),busy=new Map();let lastPack=null;
  const renderPack=st=>{lastPack=st;const w=pw();packBody.replaceChildren();packHead.textContent=w.title;const note=el('small');note.textContent=w.note;packBody.append(note);
   for(const v of st.voices||[]){const line=el('div');line.className='tome-voice-row';const name=el('span');name.textContent=v.name+' · '+(v.gender==='male'?w.male:w.female);
    if(v.recommended){const tag=el('em');tag.className='tome-voice-rec';tag.textContent=w.recommended;name.append(tag);}const info=el('small');const state=busy.get(v.uuid);
    info.textContent=state==='removing'?''/* the button already says 删除中… (user: shown twice) */:state==='removed'?w.removed:v.running?Math.round(v.bytes/1048576)+' / '+Math.round((v.size||0)/1048576)+' MB':v.installed?w.installed:v.error||'';
    const action=v.running?'cancel':v.installed?'remove':'install',act=el('button');act.type='button';act.textContent=state==='removing'?w.removing:v.running?w.cancel:v.installed?(Date.now()-(armed.get(v.uuid)||0)<6000?w.confirm:w.remove):w.download;
     act.disabled=state==='removing';act.dataset.voiceAction=action;act.onclick=()=>voiceAct(action,v,act);
    const bar=el('progress');bar.max=v.size||1;bar.value=v.bytes||0;bar.hidden=!v.running;line.append(name,info,act,bar);packBody.append(line);}
   clearTimeout(packTimer);if((st.voices||[]).some(v=>v.running))packTimer=setTimeout(refreshPack,1000);};
  const refreshPack=async()=>{if(!pack.isConnected&&wasRunning===false&&packTimer)return;try{const st=await request('voicePackStatus');const running=(st.voices||[]).some(v=>v.running);
   renderPack(st);if(wasRunning&&!running)setTimeout(()=>loadSpeakers(false),4000);wasRunning=running;}catch(e){voiceStatus.textContent=voiceError(e);}};
  const voiceAct=async(action,v,act)=>{
   // Deleting stops the speech engine, removes the model and restarts the engine (several seconds): the row shows
   // 'Deleting…' then 'Deleted', and the click-again state is kept per voice so a re-render cannot drop it.
   if(action==='remove'&&!(Date.now()-(armed.get(v.uuid)||0)<6000)){armed.set(v.uuid,Date.now());if(lastPack)renderPack(lastPack);setTimeout(()=>{if(lastPack&&!busy.has(v.uuid))renderPack(lastPack);
    },6100);return;}
   armed.delete(v.uuid);if(action==='remove'){busy.set(v.uuid,'removing');if(lastPack)renderPack(lastPack);}
   act.disabled=true;try{const st=await request(action==='install'?'voicePackInstall':action==='cancel'?'voicePackCancel':'voicePackRemove',{uuid:v.uuid});if(action==='remove'){
    busy.set(v.uuid,'removed');setTimeout(()=>{busy.delete(v.uuid);if(lastPack)renderPack(lastPack);},2500);}renderPack(st);if(action==='install')wasRunning=true;
    if(action==='remove')setTimeout(()=>loadSpeakers(false),4000);else setTimeout(refreshPack,400);}catch(e){busy.delete(v.uuid);if(lastPack)renderPack(lastPack);
    voiceStatus.textContent=voiceError(e);act.disabled=false;}};
  refreshPack();
  voice.append(button('保存语音设置',()=>saveAll(voiceStatus)),Object.assign(button('刷新声音列表',()=>loadSpeakers(true)),{title:{en:'Starts the speech engine if needed and re-reads the installed voices. Downloads and deletions refresh the list by themselves, so this is rarely needed',
   ja:'必要なら音声エンジンを起動し、インストール済みの声を読み直します。ダウンロードや削除のあとは自動で更新されるので、普段は押す必要はありません'}[(window.__tomeI18n?.get?.()||'zh').slice(0,2)]||'需要时启动语音引擎，重新读取已安装的声音。下载或删除声音后会自动刷新，平时一般不用点'}),
   voiceStatus,pack);
  section.append(button('启动 Anki',async()=>{status.textContent='正在启动 Anki，等待 AnkiConnect 响应…';try{const r=await request('ankiLaunch');status.textContent=r.running?'Anki 已经在运行（AnkiConnect '+r.version+'）':'已启动 Anki（AnkiConnect '+r.version+'）';
   }catch(e){status.textContent=e.message;}}),button('自动查找 anki.exe',async()=>{try{const r=await request('ankiFind');if(r.path){fields.ankiPath.value=r.path;status.textContent='找到了：'+r.path+'，点「保存学习服务」记住它';
   }else status.textContent='常见位置都没找到 anki.exe，请手动填写路径';}catch(e){status.textContent=e.message;}}));section.append(button('检查 Anki',async()=>{try{const info=await request('ankiStatus');
   status.textContent='AnkiConnect '+info.version+' · '+info.decks.join('、');}catch(e){status.textContent=e.message;}}),status);const hookBox=el('section');hookBox.className='tomoyo-v4-hook';
   const hookStatus=el('small');hookBox.append(el('h4','Hook 诊断'));const hook=el('small');hook.dataset.v4Hook='';hookBox.append(hook,button('重新枚举／恢复文本',()=>send({
   type:'hookRescan'})));hookBox.append(button('我已确认游戏原文隐藏',()=>{if(!b.receivedText){hookStatus.textContent='请先推进一句并确认原文确已隐藏，再记录结果';return;}send({type:'hookReplacementConfirm'});
   }),hookStatus);host.append(voice,section,imm,hookBox);updateDiagnostic();
 }
 // Translation shown for this line right now (only when it really belongs to the sentence on the card).
 function publishSpeakers(list){if(!Array.isArray(list))return;if(JSON.stringify(list)===JSON.stringify(window.__tomeSpeakerCache))return;window.__tomeSpeakerCache=list;
  dispatchEvent(new CustomEvent('tome-speakers',{detail:list}));}
 function currentTranslation(text){try{const norm=v=>String(v||'').replace(/\s+/g,'');const line=document.querySelector('.sentence-text'),out=document.querySelector('.tomoyo-cn-output');
  if(!line||!out)return '';const src=line.cloneNode(true);for(const r of src.querySelectorAll('rt'))r.remove();return norm(src.textContent)===norm(text)?out.textContent.trim():'';
  }catch{return '';}}
 addEventListener('tome-language-change',()=>{for(const select of document.querySelectorAll('.tome-speaker-select'))select.__tomeRefreshLanguage?.();});
 function mount(){window.__tomeV4Request=request;for(const host of document.querySelectorAll('.tomoyo-learning-panel'))panel(host);const title=document.querySelector('.tomoyo-menu-header h3');
  if(title){const name=[...title.childNodes].find(n=>n.nodeType===3);if(!name)title.prepend('MeguLit');else if(name.textContent!=='MeguLit')name.textContent='MeguLit';
  }if(document.title!=='MeguLit')document.title='MeguLit';}
 const style=el('style');style.textContent='.megulit-autospeak-hint{margin-left:auto;opacity:.55;font-size:11px;white-space:nowrap}.tomoyo-v4-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 18px}.tomoyo-speak-row{display:inline-flex!important;align-items:center;gap:10px}.tomoyo-speak-button{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;font-size:17px;line-height:1;border:1px solid var(--theme-border,#3a3a40);border-radius:9px;background:transparent;cursor:pointer}.tomoyo-speak-button:hover:not(:disabled){border-color:var(--theme-primary,#e0495a)}.tomoyo-speak-button:disabled{opacity:.4;cursor:default}.tomoyo-anki-button{margin-left:auto}.tomoyo-selection-card>header{display:flex!important;align-items:center;padding:8px 10px 8px 14px!important;gap:8px}.tomoyo-card-bar{display:flex;gap:6px;align-items:center;flex:1;min-width:0}.tomoyo-card-bar button{font-size:12px!important;padding:4px 10px!important;border-radius:8px!important;white-space:nowrap}.tomoyo-card-bar .tomoyo-anki-button{margin-left:auto}.tomoyo-card-bar .tomoyo-save-sentence-button{margin-left:auto}.tomoyo-card-bar .tomoyo-save-sentence-button~.tomoyo-anki-button{margin-left:0}.tomoyo-footer-empty{display:none!important}.tomoyo-selection-card .tomoyo-ai-result{margin-top:12px!important}.tomoyo-v4-actions:not(:has(.tomoyo-pitch-choices:not([hidden]),.tomoyo-save-sentence-button)){display:none!important}.tomoyo-card-meta{display:flex;flex-wrap:wrap;gap:4px 10px;padding:8px 18px 10px;border-top:1px solid color-mix(in srgb,var(--theme-border,#444) 60%,transparent);font-size:10.5px;color:var(--theme-textSecondary,#999)}.tomoyo-card-meta small{flex-basis:auto!important;font-size:10.5px}.tomoyo-v4-actions small{flex-basis:100%;color:var(--theme-textSecondary,#aaa)}.tomoyo-pitch-choices{display:flex;gap:6px;flex-wrap:wrap}.tomoyo-pitch-choices button{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 8px;border:1px solid var(--theme-border,#3a3a40);border-radius:999px;background:transparent;color:var(--theme-textSecondary,#aaa);font-size:12px;line-height:1.4;font-family:inherit;cursor:pointer;transition:border-color .12s,color .12s}.tomoyo-pitch-choices button:hover{color:var(--theme-text,#eee)}.tomoyo-pitch-choices button[aria-checked=true]{border-color:var(--theme-primary,#e0495a);color:var(--theme-text,#eee);background:color-mix(in srgb,var(--theme-primary,#e0495a) 14%,transparent)}.tomoyo-pitch-choices svg{overflow:visible}.tomoyo-pitch-choices polyline{fill:none;stroke:currentColor;stroke-width:1.4;opacity:.7}.tomoyo-pitch-choices circle{fill:currentColor}.tomoyo-pitch-choices button[aria-checked=true] svg{color:var(--theme-primary,#e0495a)}.tomoyo-v4-settings input[type=range]{padding:0!important;border:0!important;background:none!important}.tomoyo-v4-settings .tomoyo-slider-value{float:right}.tomoyo-v4-settings{border-top:1px solid var(--theme-border,#444);margin-top:20px;padding-top:8px}.tomoyo-v4-settings input:not([type=checkbox]){display:block;width:100%;box-sizing:border-box;padding:8px;color:inherit;background:var(--theme-background,#151518);border:1px solid var(--theme-border,#444);border-radius:6px}.tomoyo-dialog-hidden .sentence-window,.tomoyo-dialog-hidden .tomoyo-selection-card,.tomoyo-dialog-hidden .lookup-tooltip{visibility:hidden!important;opacity:0!important;transition:opacity .12s ease-out,visibility 0s linear .12s!important}.tomoyo-selection-open .lookup-tooltip{display:none!important}';
  document.head.append(style);
 request('load').then(value=>{config=value;mount();}).catch(()=>{});new MutationObserver(mount).observe(document.documentElement,{subtree:true,childList:true});
  mount();
})();
