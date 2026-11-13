// SPDX-License-Identifier: GPL-3.0-or-later
// "Runtime components" panel: one row per pack (icon · name · purpose · size · state · action), shared by the
// 辞典与解释 and 语音 settings pages. 2026-11-13 redesign (option D, picked by the user): no full-width uninstall bar,
// every installed pack reads 「必需」 (GARbro included), a missing pack gets a small download button, progress is a gold rule.
const ui={
 zh:{title:'运行组件',of:'已安装',used:'占用',offline:'安装后离线运行',slim:'精简版只装了基础组件，下载完整版会补齐注音分词词典和语音引擎',full:'下载完整版',cancel:'取消',download:'下载',retry:'重试',required:'必需',requiredTip:'随程序保留，不能单独卸载',installed:'已安装',missing:'未安装',downloading:'下载中',unpack:'解压中',queued:'等待中',error:'失败',failed:'操作失败',base:'基础组件',reading:'注音分词词典',voice:'语音引擎 AivisSpeech',archives:'通用封包解包（GARbro）',baseNote:'界面、取词与本地辞书',readingNote:'分词、注音与读音数据',voiceNote:'没有配音的句子用它朗读',archivesNote:'解开游戏的加密封包'},
 en:{title:'Runtime components',of:'installed',used:'using',offline:'runs offline once installed',slim:'The slim install has only the base components; the full version adds the furigana dictionaries and the voice engine',full:'Download full version',cancel:'Cancel',download:'Download',retry:'Retry',required:'Required',requiredTip:'Kept with the app; cannot be removed on its own',installed:'Installed',missing:'Not installed',downloading:'Downloading',unpack:'Unpacking',queued:'Queued',error:'Failed',failed:'Something went wrong',base:'Base components',reading:'Furigana dictionaries',voice:'Voice engine (AivisSpeech)',archives:'Archive unpacker (GARbro)',baseNote:'Interface, word capture and the local dictionary',readingNote:'Word splitting, furigana and readings',voiceNote:'Reads aloud the lines that have no voice',archivesNote:'Opens a game\'s encrypted archives'},
 ja:{title:'実行コンポーネント',of:'インストール済み',used:'使用',offline:'インストール後はオフラインで動作',slim:'軽量版は基本コンポーネントのみです。完全版でふりがな辞書と音声エンジンを追加します',full:'完全版をダウンロード',cancel:'キャンセル',download:'ダウンロード',retry:'再試行',required:'必須',requiredTip:'アプリに含まれ、個別には削除できません',installed:'インストール済み',missing:'未インストール',downloading:'ダウンロード中',unpack:'展開中',queued:'待機中',error:'失敗',failed:'操作に失敗しました',base:'基本コンポーネント',reading:'ふりがな辞書',voice:'音声エンジン（AivisSpeech）',archives:'汎用アーカイブ展開（GARbro）',baseNote:'画面・単語取得・ローカル辞書',readingNote:'分かち書き・ふりがな・読みのデータ',voiceNote:'ボイスのない文を読み上げます',archivesNote:'ゲームの暗号化アーカイブを開きます'}
};
const ICONS={base:'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3ZM4 7.5 12 12l8-4.5M12 12v9',reading:'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h10M9 8h5',voice:'M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2',archives:'M3 6h18v4H3zM5 10v10h14V10M10 14h4',other:'M4 4h16v16H4z'};
const icon=id=>`<svg class="rpk-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[id]||ICONS.other}"/></svg>`;
/* size as a figure plus a small unit, so the size column reads as set type */
export const sizeParts=n=>n>=1073741824?[(n/1073741824).toFixed(1),'GB']:[String(Math.round(n/1048576)),'MB'];
const sizeText=n=>sizeParts(n).join(' ');
export function packState(p){const j=p.job;if(p.installed)return {kind:'ok'};
 if(j?.state==='downloading')return {kind:'busy',pct:j.total?Math.min(99,j.received/j.total*100):0,unpack:j.stage==='unpack'};
 if(j?.state==='queued')return {kind:'queued',pct:0};if(j?.state==='error')return {kind:'err',message:j.error||''};return {kind:'none'};}
export function packRowHtml(p,w,esc){
 const st=packState(p),busy=st.kind==='busy'||st.kind==='queued',[num,unit]=sizeParts(p.size);
 const state=st.kind==='ok'?w.installed:st.kind==='busy'?`${st.unpack?w.unpack:w.downloading} ${Math.round(st.pct)}%`:st.kind==='queued'?w.queued:st.kind==='err'?w.error+(st.message?'：'+st.message:''):w.missing;
 const action=busy?`<button type="button" class="rpk-act" data-pack-act="cancel">${esc(w.cancel)}</button>`
  :st.kind==='ok'?`<span class="rpk-required" title="${esc(w.requiredTip)}">${esc(w.required)}</span>`
  :`<button type="button" class="rpk-act go" data-pack-act="download" data-pack="${esc(p.id)}">${esc(st.kind==='err'?w.retry:w.download)}</button>`;
 return `<li class="rpk-row" data-k="${st.kind}" style="--p:${busy?st.pct.toFixed(1):0}">${icon(p.id)}<span class="rpk-name">${esc(w[p.id]||p.id)}</span><span class="rpk-desc"${p.license?` title="${esc(p.license)}"`:''}>${esc(w[p.id+'Note']||'')}</span><span class="rpk-size"><b>${num}</b>${unit}</span><span class="rpk-state">${esc(state)}</span><span class="rpk-actcell">${action}</span></li>`;
}
export function mountRuntimePacks({content,api,locale,esc,toast}){
 const w=ui[locale]||ui.zh,panel=document.createElement('section');panel.className='panel runtime-packs rpk';
 const anchor=content.querySelector('.settings-page')||content.firstElementChild;if(!anchor)return()=>{};anchor.before(panel);
 let timer=0,status=null;
 function draw(){
  if(!status)return;const packs=status.packs||[],installed=packs.filter(p=>p.installed),missing=packs.filter(p=>!p.installed&&!p.onDemand);
  const busy=packs.some(p=>['queued','downloading'].includes(p.job?.state)),[usedNum,usedUnit]=sizeParts(installed.reduce((n,p)=>n+p.size,0));
  const meta=`<b>${installed.length}</b>/${packs.length} ${esc(w.of)} · ${esc(w.used)} <b>${usedNum}</b><small>${usedUnit}</small> · ${esc(missing.length?w.slim:w.offline)}`;
  panel.innerHTML=`<header class="rpk-head"><div class="rpk-headtext"><h3 class="rpk-title">${esc(w.title)}</h3><p class="rpk-meta">${meta}</p></div>${missing.length&&!busy?`<button type="button" class="rpk-act go rpk-cta" data-pack-act="full">${esc(w.full)} · ${sizeText(missing.reduce((n,p)=>n+p.size,0))}</button>`:''}</header><ul class="rpk-list">${packs.map(p=>packRowHtml(p,w,esc)).join('')}</ul>`;
  panel.querySelectorAll('[data-pack-act]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;const act=b.dataset.packAct;
   try{status=await api(act==='cancel'?'pack_cancel':'pack_download',{ids:act==='download'?[b.dataset.pack]:[]});draw();refresh();}catch{b.disabled=false;toast(w.failed);}}));
 }
 async function refresh(){if(!panel.isConnected)return;try{status=await api('pack_status');draw();}catch{}clearTimeout(timer);if(panel.isConnected)timer=setTimeout(refresh,status?.packs?.some(p=>['queued','downloading'].includes(p.job?.state))?800:4000);}
 refresh();return()=>clearTimeout(timer);
}
