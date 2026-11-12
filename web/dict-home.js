/* 2026-11-13 judges round 2: the dictionary at rest. Below the search, two panels list the words looked up most (with
   their local meaning) and the newest saved words (with the line and game they came from), then a strip of daily
   look-ups for the last two weeks. Every row looks the word up on click. The block folds away once results arrive. */
export function mountDictHome(target,results,{api,esc,number,locale,look}){
  const home=document.createElement('div');home.className='dict-home';results.after(home);
  const DH={zh:{often:'常查的词',oftenSub:'查了好几次的词，释义先放在这里',recent:'最近收进生词本',recentSub:'都来自你读过的台词',none:'还没有记录。在游戏里点生词查一下，就会出现在这里',times:'次',tap:'点一下查释义',more:'全部生词',days:'近两周查词',dayUnit:'次',total:'共'},
   ja:{often:'よく調べる語',oftenSub:'何度も引いた語の意味をここに',recent:'最近の単語帳',recentSub:'読んだセリフから集めた語',none:'まだ記録がありません。ゲーム中に語を調べるとここに並びます',times:'回',tap:'クリックで意味を表示',more:'単語帳へ',days:'この二週間の検索',dayUnit:'回',total:'計'},
   en:{often:'Looked up often',oftenSub:'Words you keep checking, with their meaning',recent:'Recently saved',recentSub:'From lines you have read',none:'Nothing yet. Look up a word in a game and it shows up here',times:'×',tap:'Click to look it up',more:'All words',days:'Look-ups, last two weeks',dayUnit:'',total:'Total'}}[locale]||{};
  home.onclick=e=>{const go=e.target.closest('[data-dh-words]');if(go){document.querySelector('.main .tabs [data-tab="words"]')?.click();return;}const c=e.target.closest('[data-look]');if(c)look(c.dataset.look);};
  const defsOf=v=>{try{const a=JSON.parse(v.definitions||'[]');return Array.isArray(a)?a.slice(0,3).join('；'):String(v.definitions||'');}catch{return String(v.definitions||'');}};
  return Promise.all([api('unknown_words').catch(()=>[]),api('vocabulary').catch(()=>[]),api('learning_activity').catch(()=>[])]).then(async([often,vocab,days])=>{
   often=(often||[]).slice(0,10);vocab=[...(vocab||[])].sort((a,b)=>(b.created_at||0)-(a.created_at||0)).slice(0,6);
   const defs=await Promise.all(often.map(w=>api('dictionary',{query:w.surface,source:'local',operationId:crypto.randomUUID()}).then(r=>r?.[0]||null).catch(()=>null)));
   if(!home.isConnected)return;
   const oftenRows=often.map((w,i)=>`<li><button type="button" data-look="${esc(w.surface)}"><b lang="ja">${esc(w.surface)}</b><i lang="ja">${esc(defs[i]?.reading&&defs[i].reading!==w.surface?defs[i].reading:'')}</i><span${defs[i]?.definition?'':' class="dh-tap"'}>${esc(defs[i]?.definition||DH.tap)}</span><small>${number(w.lookups)} ${DH.times}</small></button></li>`).join('');
   const vocabRows=vocab.map(v=>{const word=v.spelling||v.reading;return `<li><button type="button" data-look="${esc(word)}"><div class="dh-w"><b lang="ja">${esc(word)}</b>${v.spelling&&v.reading&&v.reading!==v.spelling?`<i lang="ja">${esc(v.reading)}</i>`:''}${v.jlpt?`<em>${esc(v.jlpt)}</em>`:''}</div><span>${esc(defsOf(v))}</span><small>${esc(v.example_title||'')}</small>${v.example_text?`<q lang="ja">${esc(v.example_text)}</q>`:''}</button></li>`;}).join('');
   const map=new Map((days||[]).map(d=>[d.day,d.lookups||0])),list=[];
   for(let i=13;i>=0;i--){const d=new Date(Date.now()-i*864e5),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;list.push({key,n:map.get(key)||0,label:`${d.getMonth()+1}/${d.getDate()}`});}
   const max=Math.max(1,...list.map(d=>d.n)),sum=list.reduce((a,d)=>a+d.n,0);
   const bars=list.map((d,i)=>`<li title="${d.label} · ${number(d.n)} ${DH.dayUnit}"${i===list.length-1?' data-today':''}><span style="--h:${Math.round(Math.sqrt(d.n/max)*100)}%"${d.n?'':' data-zero'}><b>${d.n?number(d.n):''}</b></span><small>${d.label}</small></li>`).join('');
   const empty=`<p class="dh-none">${DH.none}</p>`;
   home.innerHTML=`<section class="dh-col dh-often"><header><h3>${DH.often}</h3><p>${DH.oftenSub}</p></header>${oftenRows?`<ol>${oftenRows}</ol>`:empty}</section>`+
    `<section class="dh-col dh-recent"><header><h3>${DH.recent}</h3><p>${DH.recentSub}</p>${vocabRows?`<button type="button" class="text-button" data-dh-words>${DH.more} →</button>`:''}</header>${vocabRows?`<ol>${vocabRows}</ol>`:empty}</section>`+
    `<section class="dh-col dh-days"><header><h3>${DH.days}</h3><p>${DH.total} ${number(sum)} ${DH.dayUnit}</p></header><ol>${bars}</ol></section>`;
   target.classList.add('dh-ready');
  });
}
