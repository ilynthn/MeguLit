// SPDX-License-Identifier: GPL-3.0-or-later
/* #1099 「我的辞典」 on Settings › 辞典与解释: import a Yomitan / Yomichan zip or a TSV / CSV table (word, reading, meaning),
   switch each one on or off, move it up or down (lookups show the dictionaries in this order) and delete it. The files are
   read by services/user-dictionaries.cjs into the user's data folder; lookups on the dictionary page and in the in-game
   lookup card ask them next to the built-in dictionary and name the dictionary each entry came from. */
const ui={
 zh:{title:'我的辞典',meta:n=>n?`已导入 <b>${n}</b> 本 · 查词时和内置词典一起查，按下面的顺序显示`:'导入自己的辞典，查词时和内置词典一起查',hint:'支持 Yomitan / Yomichan 辞典 zip（term_bank_*.json），以及 TSV / CSV 表格（每行：词、读音、释义；只有两列时为词、释义）',
  import:'导入辞典',pick:'选择辞典文件（Yomitan zip / TSV / CSV）',importing:'正在导入…',imported:(name,n)=>`已导入「${name}」，共 ${n} 条`,on:'已启用',off:'已停用',enable:'启用',disable:'停用',up:'上移',down:'下移',remove:'删除',sure:'确认删除',
  confirm:name=>`删除「${name}」？导入的数据会一起删掉`,entries:n=>`${n} 条`,failed:'操作失败',
  errors:{USER_DICT_UNSUPPORTED:'不支持这种文件，请选 zip / tsv / csv',USER_DICT_NO_TERMS:'文件里没有找到词条',USER_DICT_BAD_ZIP:'zip 文件损坏或不是 Yomitan 辞典',USER_DICT_BAD_FORMAT:'辞典格式不对',USER_DICT_TOO_LARGE:'辞典太大了',USER_DICT_BAD_ENCODING:'文件编码无法识别，请存成 UTF-8',USER_DICT_FILE_MISSING:'找不到这个文件'}},
 en:{title:'My dictionaries',meta:n=>n?`<b>${n}</b> imported · looked up together with the built-in dictionary, in this order`:'Import your own dictionaries; lookups ask them with the built-in one',hint:'Yomitan / Yomichan dictionary zips (term_bank_*.json) and TSV / CSV tables (word, reading, meaning per line; two columns mean word, meaning)',
  import:'Import dictionary',pick:'Choose a dictionary file (Yomitan zip / TSV / CSV)',importing:'Importing…',imported:(name,n)=>`Imported “${name}”, ${n} entries`,on:'On',off:'Off',enable:'Turn on',disable:'Turn off',up:'Move up',down:'Move down',remove:'Delete',sure:'Confirm',
  confirm:name=>`Delete “${name}” and its imported data?`,entries:n=>`${n} entries`,failed:'Something went wrong',
  errors:{USER_DICT_UNSUPPORTED:'Unsupported file; choose a zip, tsv or csv',USER_DICT_NO_TERMS:'No entries found in the file',USER_DICT_BAD_ZIP:'The zip is damaged or not a Yomitan dictionary',USER_DICT_BAD_FORMAT:'Unrecognised dictionary format',USER_DICT_TOO_LARGE:'The dictionary is too large',USER_DICT_BAD_ENCODING:'Unknown text encoding; save it as UTF-8',USER_DICT_FILE_MISSING:'File not found'}},
 ja:{title:'マイ辞書',meta:n=>n?`<b>${n}</b> 冊インポート済み · 内蔵辞書と一緒に、この順番で引きます`:'自分の辞書をインポートすると、内蔵辞書と一緒に引けます',hint:'Yomitan / Yomichan 辞書 zip（term_bank_*.json）と TSV / CSV 表（1 行に 語・読み・意味。2 列なら 語・意味）に対応',
  import:'辞書をインポート',pick:'辞書ファイルを選択（Yomitan zip / TSV / CSV）',importing:'インポート中…',imported:(name,n)=>`「${name}」をインポートしました（${n} 件）`,on:'有効',off:'無効',enable:'有効にする',disable:'無効にする',up:'上へ',down:'下へ',remove:'削除',sure:'削除する',
  confirm:name=>`「${name}」を削除しますか？インポートしたデータも消えます`,entries:n=>`${n} 件`,failed:'操作に失敗しました',
  errors:{USER_DICT_UNSUPPORTED:'このファイルには対応していません（zip / tsv / csv）',USER_DICT_NO_TERMS:'見出し語が見つかりません',USER_DICT_BAD_ZIP:'zip が壊れているか Yomitan 辞書ではありません',USER_DICT_BAD_FORMAT:'辞書の形式が正しくありません',USER_DICT_TOO_LARGE:'辞書が大きすぎます',USER_DICT_BAD_ENCODING:'文字コードを判別できません。UTF-8 で保存してください',USER_DICT_FILE_MISSING:'ファイルが見つかりません'}}
};
export function userDictRowsHtml(list,w,esc){
 return list.map((d,i)=>`<li class="udict-row" data-id="${esc(d.id)}" data-on="${d.enabled?'1':'0'}"><span class="udict-n">${i+1}</span><span class="udict-name">${esc(d.name)}</span>`+
  `<span class="udict-desc">${esc([d.format==='yomitan'?'Yomitan':String(d.format||'').toUpperCase(),w.entries(d.count)].filter(Boolean).join(' · '))}</span><span class="udict-state">${esc(d.enabled?w.on:w.off)}</span>`+
  `<span class="udict-acts"><button type="button" class="rpk-act" data-udict="toggle">${esc(d.enabled?w.disable:w.enable)}</button>`+
  `<button type="button" class="rpk-act udict-arrow" data-udict="up" aria-label="${esc(w.up)}" title="${esc(w.up)}"${i===0?' disabled':''}>↑</button>`+
  `<button type="button" class="rpk-act udict-arrow" data-udict="down" aria-label="${esc(w.down)}" title="${esc(w.down)}"${i===list.length-1?' disabled':''}>↓</button>`+
  `<button type="button" class="rpk-act" data-udict="remove">${esc(w.remove)}</button></span></li>`).join('');
}
export function mountUserDictionaries({content,api,invoke,locale,esc,toast}){
 const w=ui[locale]||ui.zh,panel=document.createElement('section');panel.className='panel rpk user-dicts';
 const anchor=content.querySelector('.settings-page')||content.lastElementChild;if(!anchor)return;anchor.after(panel);
 let list=[],busy=false;
 const fail=error=>{const code=String(error?.message||error||'').match(/USER_DICT_[A-Z_]+/)?.[0];toast(w.errors[code]||w.failed);};
 function draw(){
  panel.innerHTML=`<header class="rpk-head"><div class="rpk-headtext"><h3 class="rpk-title">${esc(w.title)}</h3><p class="rpk-meta">${w.meta(list.length)}</p></div>`+
   `<button type="button" class="rpk-act go rpk-cta" data-udict="import"${busy?' disabled':''}>${esc(busy?w.importing:w.import)}</button></header>`+
   `<p class="udict-hint">${esc(w.hint)}</p>${list.length?`<ol class="rpk-list udict-list">${userDictRowsHtml(list,w,esc)}</ol>`:''}`;
 }
 panel.addEventListener('click',async event=>{const button=event.target.closest('[data-udict]');if(!button||button.disabled)return;const act=button.dataset.udict,id=button.closest('[data-id]')?.dataset.id||'';
  if(act==='import'){let file='';try{file=await invoke('pick_patch_file',{title:w.pick});}catch(error){fail(error);return;}if(!file)return;
   busy=true;draw();try{const r=await api('user_dict_import',{path:file});list=r.dictionaries||list;toast(w.imported(r.name,r.count));}catch(error){fail(error);}finally{busy=false;if(panel.isConnected)draw();}return;}
  const item=list.find(d=>d.id===id);if(!item)return;
  if(act==='remove'&&button.dataset.armed!=='1'){button.dataset.armed='1';button.textContent=w.sure;button.title=w.confirm(item.name);setTimeout(()=>{if(button.isConnected){button.dataset.armed='';button.textContent=w.remove;button.title='';}},4000);return;}
  button.disabled=true;
  try{list=act==='toggle'?await api('user_dict_toggle',{id,enabled:!item.enabled}):act==='up'||act==='down'?await api('user_dict_move',{id,delta:act==='up'?-1:1}):await api('user_dict_remove',{id});}
  catch(error){fail(error);}if(panel.isConnected)draw();});
 draw();api('user_dict_list').then(value=>{if(Array.isArray(value)){list=value;if(panel.isConnected)draw();}}).catch(()=>{});
}
