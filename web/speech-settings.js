// SPDX-License-Identifier: GPL-3.0-or-later
import {styleLabel,defaultPreview} from './voice-style.js';
import {enhanceSelects} from './select-control.js';
import {voiceRemovalWords,confirmVoiceRemoval} from './voice-delete.js';
const words={zh:{voice:'语音角色',style:'情感与说话风格',refresh:'读取已安装声音',preview:'试听',stop:'停止试听',loading:'正在合成…',text:'试听内容',reset:'恢复惠惠咏唱',empty:'点击“读取已安装声音”加载角色名称，之前选择会保留',
 unknown:'之前选择的声音未在列表中，请重新选择',recommended:'推荐声音',male:'男声',female:'女声',download:'下载',cancel:'取消下载',installed:'已安装',failed:'操作失败，请重试',hint:'先选角色，再选情感；ID 会自动对应，试听内容可以自行修改',
 size:'每个声音约 250 MB，点击后才下载'},en:{voice:'Voice character',style:'Emotion and speaking style',refresh:'Load installed voices',preview:'Preview',stop:'Stop preview',
 loading:'Synthesizing…',text:'Preview text',reset:'Restore Megumin chant',empty:'Load installed voices to see names; the saved voice is preserved',unknown:'The saved voice is not in this list; choose another',
 recommended:'Recommended voices',male:'Male',female:'Female',download:'Download',cancel:'Cancel download',installed:'Installed',failed:'Operation failed; try again',
 hint:'Choose a character, then an emotion. Style IDs are assigned automatically; preview text is editable',size:'About 250 MB each; downloaded only when clicked'},
 ja:{voice:'音声キャラクター',style:'感情・話し方',refresh:'導入済みの声を読み込む',preview:'試聴',stop:'試聴を停止',loading:'音声を合成中…',text:'試聴する文章',reset:'めぐみんの詠唱に戻す',empty:'声を読み込むと名前が表示されます。保存済みの選択は保持します',
 unknown:'保存済みの声が見つかりません。選び直してください',recommended:'おすすめの声',male:'男性',female:'女性',download:'ダウンロード',cancel:'取得を中止',installed:'導入済み',failed:'操作を再試行してください',hint:'キャラクターと感情を選ぶと ID は自動で設定されます。試聴文は変更できます',
 size:'各約250 MB。クリックした声だけ取得します'}};
/* 2026-11-28 (1.4.26 QQ group report: 读取已安装声音 only said 操作失败，请重试). A failed engine start comes back as its reason
   (core/services.cjs speechError); each one names what happened and what to do next. */
const reasons={zh:{SPEECH_HUB_UNREACHABLE:'语音引擎启动时连不上 huggingface.co，卡在加载断句模型。请检查网络或代理，再点「读取已安装声音」重试',
 SPEECH_PORT_BUSY:'端口 10101 被其他程序占用，语音引擎起不来。请关闭占用它的程序（或另开的 AivisSpeech），再点「读取已安装声音」',
 SPEECH_START_TIMEOUT:'语音引擎没能启动（显卡和 CPU 都试过）。再点「读取已安装声音」会重新启动；仍不行请在「关于」页一键上传问题反馈',
 SPEECH_ENGINE_MISSING:'缺少语音引擎文件，请在下方「运行组件」重新安装语音组件',SPEECH_REMOTE_UNREACHABLE:'连不上设置里填写的 AivisSpeech 地址，请先启动那台引擎',
 SPEECH_VOICE_RATE_LIMITED:'AivisHub 默认声音下载被限流（HTTP 429），请过几分钟再点「读取已安装声音」',
 other:'读取声音失败。再点「读取已安装声音」会重新启动语音引擎；仍不行请在「关于」页一键上传问题反馈',
 cpu:'显卡启动语音引擎失败，已改用 CPU（合成会慢一些）'},
 en:{SPEECH_HUB_UNREACHABLE:'The speech engine could not reach huggingface.co while loading its text model. Check your network or proxy, then click “Load installed voices” again',
 SPEECH_PORT_BUSY:'Port 10101 is used by another program, so the speech engine cannot start. Close it (or another AivisSpeech), then click “Load installed voices”',
 SPEECH_START_TIMEOUT:'The speech engine did not start (tried the GPU and the CPU). Clicking “Load installed voices” restarts it; if it still fails, send feedback from the About page',
 SPEECH_ENGINE_MISSING:'Speech engine files are missing; reinstall the voice component under Runtime components below',SPEECH_REMOTE_UNREACHABLE:'Cannot reach the AivisSpeech address in settings; start that engine first',
 SPEECH_VOICE_RATE_LIMITED:'AivisHub rate-limited the default voice download (HTTP 429); wait a few minutes, then click “Load installed voices”',
 other:'Could not load voices. Clicking “Load installed voices” restarts the speech engine; if it still fails, send feedback from the About page',
 cpu:'The speech engine could not start on the GPU and now runs on the CPU (synthesis is slower)'},
 ja:{SPEECH_HUB_UNREACHABLE:'音声エンジンの起動中に huggingface.co へ接続できず、文章モデルの読み込みで止まりました。ネットワークやプロキシを確認し、もう一度「導入済みの声を読み込む」を押してください',
 SPEECH_PORT_BUSY:'ポート 10101 が別のプログラムに使われているため、音声エンジンを起動できません。そのプログラム（または別の AivisSpeech）を閉じてから読み込み直してください',
 SPEECH_START_TIMEOUT:'音声エンジンを起動できませんでした（GPU と CPU の両方を試しました）。読み込み直すと再起動します。直らない場合は「情報」ページから問題を報告してください',
 SPEECH_ENGINE_MISSING:'音声エンジンのファイルが見つかりません。下の「実行コンポーネント」で音声コンポーネントを入れ直してください',SPEECH_REMOTE_UNREACHABLE:'設定の AivisSpeech アドレスに接続できません。先にそのエンジンを起動してください',
 SPEECH_VOICE_RATE_LIMITED:'AivisHub の既定音声ダウンロードが制限されました（HTTP 429）。数分待ってから読み込み直してください',
 other:'声を読み込めませんでした。読み込み直すと音声エンジンを再起動します。直らない場合は「情報」ページから問題を報告してください',
 cpu:'GPU で音声エンジンを起動できなかったため、CPU で動作しています（合成は少し遅くなります）'}};
export function speechFailure(error,locale){const r=reasons[locale]||reasons.zh,code=String((typeof error==='string'?error:error?.message)||'');return r[code]||r.other;}
export function configureSpeech({content,form,api,locale,esc,toast}){
 const w={...words[locale],...voiceRemovalWords[locale]},id=form.elements.namedItem('aivisSpeaker'),volume=form.elements.namedItem('aivisVolume');id.closest('.settings-row').hidden=true;let speakers=[],audio=null,
  url='',timer,stopped=false,requestId=0,previousRunning=false;const removing=new Set();
 const panel=document.createElement('section');panel.className='panel speech-choices';panel.innerHTML=`<p class="settings-help">${w.hint}</p><label class="settings-row"><span class="settings-label">${w.voice}</span><select data-voice disabled><option>${w.empty}</option></select></label><label class="settings-row"><span class="settings-label">${w.style}</span><select data-style disabled><option>—</option></select></label><div class="speech-feedback settings-help"></div><button type="button" class="secondary" data-refresh>${w.refresh}</button><label class="audition-label">${w.text}<textarea maxlength="200" rows="3" data-text>${esc(localStorage.getItem('tome-voice-preview-text')||defaultPreview)}</textarea></label><div class="speech-preview-actions"><button type="button" class="primary" data-preview>${w.preview}</button><button type="button" class="text-button" data-reset>${w.reset}</button></div>`;
 form.before(panel);const voice=panel.querySelector('[data-voice]'),emotion=panel.querySelector('[data-style]'),feedback=panel.querySelector('.speech-feedback'),
  preview=panel.querySelector('[data-preview]'),input=panel.querySelector('[data-text]');
 const pack=document.createElement('section');pack.className='panel voice-downloads';pack.innerHTML=`<h2 class="panel-title">${w.recommended}</h2><p class="settings-help">${w.size}</p><div data-voices></div>`;
  content.append(pack);
 const v4=async(action,args={})=>{const key=++requestId,result=await api('reader_message',{message:{type:'v4',id:key,action,args}}),reply=result.replies?.find(reply=>reply.method==='v4Deliver');
  if(!reply||reply.args[2])throw Error(reply?.args[2]||'SPEECH_FAILED');return reply.args[1];};
 let syncing=false;
 function fill(list){if(stopped||!panel.isConnected)return;if(!Array.isArray(list))return;if(!list.length){speakers=[];voice.replaceChildren(new Option(w.empty,
  ''));emotion.replaceChildren(new Option('—',''));voice.disabled=emotion.disabled=true;feedback.textContent='';delete feedback.dataset.state;return;}speakers=list;const selected=list.findIndex(s=>s.styles?.some(style=>style.id===Number(id.value)));
  voice.replaceChildren(...list.map((speaker,index)=>new Option(speaker.name,String(index))));voice.disabled=false;voice.value=String(selected<0?0:selected);feedback.textContent=selected<0&&Number(id.value)!==0?w.unknown:'';delete feedback.dataset.state;
  styles(false);enhanceSelects(panel);}
 function styles(change){syncing=true;try{const current=speakers[Number(voice.value)],list=current?.styles||[];emotion.replaceChildren(...list.map(style=>new Option(styleLabel(style.name,
  locale),String(style.id))));emotion.disabled=!list.length;const saved=list.find(style=>style.id===Number(id.value));if(saved)emotion.value=String(saved.id);if(change&&list.length){
  id.value=emotion.value;feedback.textContent='';delete feedback.dataset.state;id.dispatchEvent(new Event('change',{bubbles:true}));}voice.dispatchEvent(new Event('change-ui'));emotion.dispatchEvent(new Event('change'));
  }finally{syncing=false;}}
 voice.onchange=()=>styles(true);emotion.onchange=()=>{if(syncing||!emotion.value||id.value===emotion.value)return;
  id.value=emotion.value;feedback.textContent='';delete feedback.dataset.state;id.dispatchEvent(new Event('change',{bubbles:true}));};
 /* 读取已安装声音 starts the engine first when it is not running (services/runtime.cjs speakers → ensureSpeech) */
 async function load(){const button=panel.querySelector('[data-refresh]'),r=reasons[locale]||reasons.zh;button.disabled=true;try{const list=await api('speakers');if(!Array.isArray(list))throw Error();fill(list);
  if(stopped||!panel.isConnected)return;const notes=[];
  try{const status=await api('speech_status');if(status?.mode==='--no-use_gpu'&&form.elements.namedItem('aivisGpu')?.checked)notes.push(r.cpu);}catch{}
  if(notes.length){feedback.textContent=[feedback.textContent,...notes].filter(Boolean).join(' ');feedback.dataset.state='info';}
  }catch(error){feedback.textContent=speechFailure(error,locale);feedback.dataset.state='error';}finally{button.disabled=false;}}
 panel.querySelector('[data-refresh]').onclick=load;api('speakers_cached').then(fill).catch(()=>{});
 const readVolume=()=>{const v=Number(volume?.value);return Number.isFinite(v)?Math.max(0,Math.min(1,v)):0.9;};
 const syncVolume=()=>{if(audio)audio.volume=readVolume();};
 volume?.addEventListener('input',syncVolume);
 function stop(){if(audio){audio.pause();audio=null;}if(url){URL.revokeObjectURL(url);url='';}preview.textContent=w.preview;}
 preview.onclick=async()=>{if(audio){stop();return;}preview.disabled=true;preview.textContent=w.loading;try{localStorage.setItem('tome-voice-preview-text',input.value);
  const result=await api('speech_preview',{speaker:Number(id.value),speed:Number(form.elements.namedItem('aivisSpeed').value),text:input.value}),bytes=Uint8Array.from(atob(result.data),
  c=>c.charCodeAt(0));if(stopped)return;url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));const current=audio=new Audio(url);audio.volume=readVolume();
  audio.onended=stop;audio.onerror=stop;await current.play();if(stopped||audio!==current)return;preview.textContent=w.stop;}catch(error){stop();if(!stopped)toast(speechFailure(error,locale));}finally{preview.disabled=false;if(!audio)preview.textContent=w.preview;
  }};
 input.oninput=()=>localStorage.setItem('tome-voice-preview-text',input.value);panel.querySelector('[data-reset]').onclick=()=>{input.value=defaultPreview;input.dispatchEvent(new Event('input'));
  };
 async function refreshPack(){if(stopped||!pack.isConnected)return;try{const state=await v4('voicePackStatus'),running=state.voices?.some(v=>v.running);const target=pack.querySelector('[data-voices]');
  target.innerHTML=(state.voices||[]).map(v=>`<div class="model-download"><div class="model-info"><strong>${esc(v.name)} <small>${v.gender==='male'?w.male:w.female}</small></strong><span class="settings-help">${v.installed?w.installed:v.running?`${(v.bytes/1048576).toFixed(1)} / ${v.size?(v.size/1048576).toFixed(1):'…'} MB`:v.error?esc(v.error):w.size}</span>${v.running?`<progress ${v.size?`value="${Math.min(99,v.bytes/v.size*100)}" max="100"`:''}></progress>`:''}</div>${v.installed?`<button type="button" class="text-button danger" data-uuid="${v.uuid}" data-name="${esc(v.name)}" data-action="voicePackRemove" ${removing.has(v.uuid)?'disabled':''} title="${esc(w.removeHint)}">${w.remove}</button>`:`<button type="button" class="secondary" data-uuid="${v.uuid}" data-action="${v.running?'voicePackCancel':'voicePackInstall'}">${v.running?w.cancel:w.download}</button>`}</div>`).join('');
  target.querySelectorAll('[data-uuid]').forEach(button=>button.onclick=async()=>{const uuid=button.dataset.uuid;button.disabled=true;try{if(button.dataset.action==='voicePackRemove'){
  if(removing.has(uuid))return;removing.add(uuid);if(!await confirmVoiceRemoval(button.dataset.name,locale))return;stop();await v4('voicePackRemove',{uuid});const list=await api('speakers');
  let changed=false;if(!list.some(s=>s.styles?.some(style=>style.id===Number(id.value)))){id.value=String(list[0]?.styles?.[0]?.id||0);id.dispatchEvent(new Event('change',
  {bubbles:true}));changed=true;}fill(list);feedback.textContent=changed?w.changed:'';delete feedback.dataset.state;toast(w.done);}else await v4(button.dataset.action,
  {uuid});await refreshPack();}catch{toast(w.failed);}finally{removing.delete(uuid);button.disabled=false;}});if(previousRunning&&!running)api('speakers_cached').then(fill).catch(()=>{
  });previousRunning=running;}catch{pack.querySelector('[data-voices]').innerHTML=`<p class="u-status" data-state="error">${esc(w.failed)}</p>`;}clearTimeout(timer);
  if(!stopped)timer=setTimeout(refreshPack,1600);}
 refreshPack();return()=>{stopped=true;clearTimeout(timer);volume?.removeEventListener('input',syncVolume);stop();};
}
