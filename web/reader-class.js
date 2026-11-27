// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 ranks and 转职 (class change). Lv.1–20 share one path of learning magic. At Lv.20 a reader must choose
   an element to keep levelling: until then the level holds at 20 and the experience gathered meanwhile waits, paid
   back in full when the element is chosen. Each element has its own ranks up to Lv.80; fire's top rank is
   爆裂魔法学徒. The element can be changed again later at no cost. The numbers match services/reader-class.cjs. */
import {fxPref} from './fx-prefs.js';
import {mountElementFx} from './rite-stage.js';
export const SCHOOL_LEVEL=20;
const XP_EARLY=[100,150,200,250,300],XP_STEP=600;
const xpOf=s=>Math.floor((Number(s?.characters)||0)/50)+Math.floor((Number(s?.seconds)||0)/60)*2+(Number(s?.words)||0)*10;
const xpToReach=level=>{let x=0;for(let l=1;l<level;l++)x+=l<=XP_EARLY.length?XP_EARLY[l-1]:XP_STEP;return x;};
function levelOf(xp){let left=Math.max(0,Math.floor(xp)),level=1;
 for(const cost of XP_EARLY){if(left<cost)return {level,into:left,need:cost};left-=cost;level++;}
 const more=Math.floor(left/XP_STEP);return {level:level+more,into:left-more*XP_STEP,need:XP_STEP};}
export function readerLevel(stats,element=''){
 const xp=xpOf(stats),cap=xpToReach(SCHOOL_LEVEL);
 if(SCHOOLS[element]||xp<cap)return {...levelOf(xp),xp,pending:0,locked:false};
 return {level:SCHOOL_LEVEL,into:0,need:XP_STEP,xp:cap,pending:xp-cap,locked:true};
}
/* 2026-11-12 (user: not so chuunibyou; think DNF and Mushoku Tensei; the top is just 神级): before 转职 见习 / 初级 / 中级 /
   上级魔术师 (staying 上级 until 转职); then a DNF-style job name for the element at Lv.20 and its Saint / King / Emperor /
   God ranks at Lv.35 / 50 / 65 / 80 — 神级 is the top. Fire alone goes on past it, 爆裂魔法初学者 → 爆裂魔法师 (Lv.90–130).
   Each element is described by the reading style it suits, plainly. No 魔导士, no 红魔族, no 练习生. */
const BASE={zh:[[1,'见习魔术师'],[5,'初级魔术师'],[10,'中级魔术师'],[15,'上级魔术师']],
 ja:[[1,'見習い魔術師'],[5,'初級魔術師'],[10,'中級魔術師'],[15,'上級魔術師']],
 en:[[1,'Apprentice magician'],[5,'Beginner-rank magician'],[10,'Intermediate-rank magician'],[15,'Advanced-rank magician']]};
const STEPS=[20,35,50,65,80];
/* 2026-11-12 (user): fire goes four ranks further than every other element — past 火神级魔术师 (Lv.80, the top for everyone else): 爆裂魔法初学者 at Lv.90 up to 爆裂魔法师 at Lv.130 */
const FIRE_STEPS=[...STEPS,90,100,110,120,130];
const E=(color,glyph,name,tag,desc,feat,zh,ja,en)=>({color,glyph,name,tag,desc,feat,ranks:{zh,ja,en}});
/* 2026-11-12 (user: the descriptions must say more): each element has a short type tag, a line on its temperament and
   the reader it suits, and one line on what it is good for */
export const SCHOOLS={
 fire:E('#e2423e',{zh:'火',ja:'火',en:'火'},{zh:'火',ja:'火',en:'Fire'},{zh:'爆发型',ja:'爆発型',en:'Burst'},{zh:'一坐下就停不下来，一晚上推完一条线。适合有整块时间、喜欢一口气读完的人。',ja:'座ったら止まらない。一晩で一つのルートを読み切る。まとまった時間があって、一気に読みたい人に。',en:'Once you sit down you don’t stop; a whole route in one night. For readers with long evenings who like to finish in one go.'},{zh:'唯一能在神级之后继续升段的元素：爆裂魔法初学者一路到爆裂魔法师。',ja:'神級のその先へ進める唯一の元素：爆裂魔法の初心者から爆裂魔法師まで。',en:'The only element that climbs past God-rank: from Explosion beginner up to Explosion mage.'},
  ['火焰术士','火圣级魔术师','火王级魔术师','火帝级魔术师','火神级魔术师','爆裂魔法初学者','爆裂魔法学徒','爆裂魔法修习者','爆裂魔法术士','爆裂魔法师'],['火焔術士','火聖級魔術師','火王級魔術師','火帝級魔術師','火神級魔術師','爆裂魔法の初心者','爆裂魔法見習い','爆裂魔法の修行者','爆裂魔法の術士','爆裂魔法師'],['Pyromancer','Fire Saint-rank magician','Fire King-rank magician','Fire Emperor-rank magician','Fire God-rank magician','Explosion beginner','Explosion apprentice','Explosion student','Explosion caster','Explosion mage']),
 ice:E('#7fd3f2',{zh:'冰',ja:'氷',en:'氷'},{zh:'冰',ja:'氷',en:'Ice'},{zh:'精读型',ja:'精読型',en:'Close'},{zh:'不急，每个词都弄明白再往下读。适合喜欢精读、愿意反复回看长句的人。',ja:'急がない。言葉をひとつずつ確かめてから先へ。精読が好きで、長い文を読み返すのが苦にならない人に。',en:'No hurry: every word understood before moving on. For readers who like close reading and going back over long lines.'},{zh:'适合文字密、用词难的作品，越读越稳。',ja:'文章が濃く言葉の難しい作品向き。読むほど足元が固まる。',en:'Suits dense, hard-worded stories; the more you read, the steadier you get.'},
  ['冰结师','冰圣级魔术师','冰王级魔术师','冰帝级魔术师','冰神级魔术师'],['氷結師','氷聖級魔術師','氷王級魔術師','氷帝級魔術師','氷神級魔術師'],['Cryomancer','Ice Saint-rank magician','Ice King-rank magician','Ice Emperor-rank magician','Ice God-rank magician']),
 thunder:E('#f2d14a',{zh:'雷',ja:'雷',en:'雷'},{zh:'雷',ja:'雷',en:'Thunder'},{zh:'速读型',ja:'速読型',en:'Fast'},{zh:'文字一闪而过，眼睛总比鼠标快一步。适合已经读得顺、想提高速度的人。',ja:'文字が一瞬で流れ、目はいつもクリックより一歩先。もうすらすら読めて、速さを上げたい人に。',en:'The text flashes past and your eyes are always a step ahead of the click. For fluent readers who want more pace.'},{zh:'适合节奏快的作品，读得越多升得越快。',ja:'テンポの速い作品向き。たくさん読むほど早く上がる。',en:'Suits fast-paced stories; the more you read, the faster you rise.'},
  ['引雷师','雷圣级魔术师','雷王级魔术师','雷帝级魔术师','雷神级魔术师'],['引雷師','雷聖級魔術師','雷王級魔術師','雷帝級魔術師','雷神級魔術師'],['Bolt caller','Thunder Saint-rank magician','Thunder King-rank magician','Thunder Emperor-rank magician','Thunder God-rank magician']),
 wind:E('#8fe0c0',{zh:'风',ja:'風',en:'風'},{zh:'风',ja:'風',en:'Wind'},{zh:'杂读型',ja:'雑読型',en:'Wide'},{zh:'今天这部，明天那部，哪里有风往哪走。适合同时追好几部作品的人。',ja:'今日はこれ、明日はあれ。風の向くままに。何作も並行して読む人に。',en:'This story today, that one tomorrow, wherever the wind goes. For readers following several stories at once.'},{zh:'适合同时开好几部作品，换着读不会腻。',ja:'何作も同時に進める読み方向き。飽きずに読み続けられる。',en:'Suits keeping several stories open; switching keeps it fresh.'},
  ['御风师','风圣级魔术师','风王级魔术师','风帝级魔术师','风神级魔术师'],['御風師','風聖級魔術師','風王級魔術師','風帝級魔術師','風神級魔術師'],['Aeromancer','Wind Saint-rank magician','Wind King-rank magician','Wind Emperor-rank magician','Wind God-rank magician']),
 water:E('#4f9de8',{zh:'水',ja:'水',en:'水'},{zh:'水',ja:'水',en:'Water'},{zh:'坚持型',ja:'継続型',en:'Daily'},{zh:'不求多，每天一点，从不间断。适合时间零碎、但能坚持的人。',ja:'多くは求めず、毎日少しずつ、途切れずに。時間は細切れでも続けられる人に。',en:'Not much, but every day without a break. For readers with scattered time who keep at it.'},{zh:'适合每天固定读一会儿，连续天数会越拉越长。',ja:'毎日少しの読書向き。連続日数がどんどん伸びる。',en:'Suits a short daily session; your streak keeps growing.'},
  ['潮汐师','水圣级魔术师','水王级魔术师','水帝级魔术师','水神级魔术师'],['潮汐師','水聖級魔術師','水王級魔術師','水帝級魔術師','水神級魔術師'],['Tidecaller','Water Saint-rank magician','Water King-rank magician','Water Emperor-rank magician','Water God-rank magician']),
 earth:E('#c08a52',{zh:'土',ja:'土',en:'土'},{zh:'土',ja:'土',en:'Earth'},{zh:'积累型',ja:'積み上げ型',en:'Builder'},{zh:'遇到不认识的词就停下来，收进单词本。适合刚起步、想打牢词汇的人。',ja:'知らない言葉で立ち止まり、単語帳にしまう。始めたばかりで語彙を固めたい人に。',en:'Stop at every unknown word and keep it in your word list. For readers starting out who want a solid vocabulary.'},{zh:'适合边读边收录单词，单词本会越来越厚。',ja:'読みながら単語を集める読み方向き。単語帳がどんどん厚くなる。',en:'Suits saving words as you read; your word list keeps thickening.'},
  ['岩石术士','土圣级魔术师','土王级魔术师','土帝级魔术师','土神级魔术师'],['岩石術士','土聖級魔術師','土王級魔術師','土帝級魔術師','土神級魔術師'],['Geomancer','Earth Saint-rank magician','Earth King-rank magician','Earth Emperor-rank magician','Earth God-rank magician']),
 light:E('#fff1b8',{zh:'光',ja:'光',en:'光'},{zh:'光',ja:'光',en:'Light'},{zh:'理解型',ja:'理解型',en:'Insight'},{zh:'读到懂为止，伏笔和言外之意都不放过。适合喜欢剧情、爱琢磨台词的人。',ja:'わかるまで読む。伏線も言外の意味も逃さない。物語が好きで、台詞をじっくり味わう人に。',en:'Read until it makes sense; no foreshadowing or subtext slips by. For readers who love the story and turn lines over.'},{zh:'适合剧情向的作品，读懂每一句的分量。',ja:'シナリオ重視の作品向き。一文ごとの重みがわかる。',en:'Suits story-driven works; every line carries its weight.'},
  ['圣光师','光圣级魔术师','光王级魔术师','光帝级魔术师','光神级魔术师'],['聖光師','光聖級魔術師','光王級魔術師','光帝級魔術師','光神級魔術師'],['Lightbringer','Light Saint-rank magician','Light King-rank magician','Light Emperor-rank magician','Light God-rank magician']),
 dark:E('#a07ae0',{zh:'暗',ja:'闇',en:'闇'},{zh:'暗',ja:'闇',en:'Dark'},{zh:'夜读型',ja:'夜読型',en:'Night'},{zh:'夜深人静才是阅读时间，一读就到天亮。适合习惯夜里读的人。',ja:'夜が更けてからが読書の時間。読み始めたら朝まで。夜に読む習慣の人に。',en:'Reading time starts when the night goes quiet, and runs till dawn. For readers who read at night.'},{zh:'适合深夜里不被打扰的长时间阅读。',ja:'夜更けの、邪魔の入らない長い読書向き。',en:'Suits long, undisturbed reading late at night.'},
  ['暗影师','暗圣级魔术师','暗王级魔术师','暗帝级魔术师','暗神级魔术师'],['暗影師','闇聖級魔術師','闇王級魔術師','闇帝級魔術師','闇神級魔術師'],['Shadowmancer','Dark Saint-rank magician','Dark King-rank magician','Dark Emperor-rank magician','Dark God-rank magician'])
};
const lang=locale=>locale==='ja'||locale==='en'?locale:'zh';
export const elementName=(element,locale)=>SCHOOLS[element]?.name[lang(locale)]||'';
export function rankTitle(level,locale,school=''){
 const l=lang(locale),s=SCHOOLS[school];
 if(s&&level>=SCHOOL_LEVEL){let t=s.ranks[l][0];(school==='fire'?FIRE_STEPS:STEPS).forEach((at,i)=>{if(level>=at)t=s.ranks[l][i];});return t;}
 let t=BASE[l][0][1];for(const [at,name] of BASE[l])if(level>=at)t=name;return t;
}
const W={zh:{open:'转职',again:'重新转职',locked:n=>`Lv.${n} 转职`,title:'转职',sub:'选一个元素。转职后才能继续获得经验，之前攒下的经验会一次补发；以后还能换',subAgain:'换一个元素。等级和经验都不会变',confirm:'确认转职',cancel:'稍后',done:n=>`转职完成：${n}`,paid:n=>`补发 +${n} 经验`,fail:'转职没有成功，请稍后再试',top:'最高段位',
  due:'需要转职才能继续获得经验（转职后补发）',reached:'到达 Lv.20！',nudge:'你已经 Lv.20 了，转职后才能继续获得经验',nudgeGo:'去转职',nudgeLater:'稍后',doneKicker:'转职完成',finish:'完成',xpWord:'补发的经验'},
 ja:{open:'転職',again:'もう一度転職',locked:n=>`Lv.${n} で転職`,title:'転職',sub:'元素をひとつ選びます。転職すると経験値がまた貯まり、それまでの分はまとめて支給されます。あとで選び直せます',subAgain:'元素を選び直します。レベルと経験値はそのままです',confirm:'転職する',cancel:'あとで',done:n=>`転職しました：${n}`,paid:n=>`経験値 +${n} を支給`,fail:'転職できませんでした。しばらくしてからお試しください',top:'最高位',
  due:'転職すると経験値がまた貯まります（それまでの分は後で支給）',reached:'Lv.20 到達！',nudge:'Lv.20 になりました。転職すると経験値がまた貯まります',nudgeGo:'転職する',nudgeLater:'あとで',doneKicker:'転職完了',finish:'完了',xpWord:'支給された経験値'},
 en:{open:'Change class',again:'Change class again',locked:n=>`Class change at Lv.${n}`,title:'Class change',sub:'Choose an element. XP only grows again after a class change; what you gathered meanwhile is paid back at once. You can switch later',subAgain:'Switch to another element. Level and XP stay',confirm:'Change class',cancel:'Later',done:n=>`Class changed: ${n}`,paid:n=>`+${n} XP paid back`,fail:'The class change did not go through; try again later',top:'Top rank',
  due:'Change class to keep earning XP (paid back afterwards)',reached:'Lv.20 reached!',nudge:'You are Lv.20. Change class to keep earning XP',nudgeGo:'Change class',nudgeLater:'Later',doneKicker:'Class changed',finish:'Done',xpWord:'XP paid back'}};
export const classWords=locale=>W[lang(locale)];

/* the rite (user: more detailed). Choosing: the stage shows the chosen element's own scene, quietly; the elements are rows of glyph,
   name with its type tag, its temperament and what it is good for. Casting (user: no shared magic circle — each element its
   own animation and particles, element-fx.js): the element's scene gathers strength, bursts in its own way, then the
   new rank is revealed character by character and the experience that waited counts up. A 完成 button ends it. Reduced motion skips straight to the reveal. */
const motion=()=>!(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
function countUp(el,to,ms,fmt){if(!ms){el.textContent=fmt(to);return;}const t0=performance.now();const step=now=>{const k=Math.min(1,(now-t0)/ms),e=1-Math.pow(1-k,3);el.textContent=fmt(Math.round(to*e));if(k<1&&el.isConnected)requestAnimationFrame(step);};requestAnimationFrame(step);}
export function openRite({api,locale,esc,toast,current='',pending=0,xpTotal=0,headline='',onDone=()=>{}}){
 if(document.querySelector('dialog.class-rite'))return null;
 const w=classWords(locale),l=lang(locale),nf=new Intl.NumberFormat({zh:'zh-CN',ja:'ja-JP',en:'en-US'}[l]),dialog=document.createElement('dialog');dialog.className='class-rite';dialog.setAttribute('aria-label',w.title);
 let pick=SCHOOLS[current]?current:'fire';
 dialog.innerHTML=`<div class="class-rite-stage"><canvas class="class-rite-fx" aria-hidden="true"></canvas><b class="class-rite-glyph" data-glyph></b></div>
  <div class="class-rite-body"><div class="class-rite-top"><span class="class-rite-kicker">${headline?esc(headline)+' · ':''}${w.title}</span><h2 data-title></h2></div><p class="class-rite-sub">${current?w.subAgain:w.sub}</p>
  <div class="class-rite-schools" role="radiogroup">${Object.entries(SCHOOLS).map(([k,s])=>`<button type="button" role="radio" class="class-rite-school" data-school="${k}" style="--c:${s.color}"><b>${s.glyph[l]}</b><span class="class-rite-text">${s.name[l]!==s.glyph[l]?`<strong>${esc(s.name[l])}</strong>`:''}<small>${esc(s.desc[l])}</small><em>${esc(s.feat[l])}</em></span><i class="class-rite-tag">${esc(s.tag[l])}</i></button>`).join('')}</div>
  <div class="class-rite-actions"><span>${pending>0?`<small class="class-rite-wait">${esc(w.paid(nf.format(pending)))}</small>`:''}</span><button type="button" class="secondary" data-cancel>${w.cancel}</button><button type="button" class="primary" data-go>${w.confirm}</button></div></div>
  <div class="class-rite-reveal" aria-live="polite" hidden><span class="class-rite-kicker" data-r-kicker></span><h2 data-r-rank></h2><p data-r-line></p><i class="class-rite-rule" aria-hidden="true"></i><q class="class-rite-motto" data-r-motto></q><div class="class-rite-xp" data-r-xp hidden><small>${esc(w.xpWord)}</small><b data-r-num>+0</b></div><div class="class-rite-end"><button type="button" class="primary" data-finish disabled>${w.finish}</button></div></div>`;
 (document.querySelector('.main')||document.body).append(dialog);
 const fx=mountElementFx(dialog.querySelector('.class-rite-fx'));
 const draw=()=>{const s=SCHOOLS[pick];fx.setElement(pick,s.glyph[l]);dialog.style.setProperty('--c',s.color);dialog.querySelector('[data-glyph]').textContent=s.glyph[l];dialog.dataset.el=pick;dialog.querySelector('[data-title]').textContent=s.name[l];
  dialog.querySelectorAll('[data-school]').forEach(b=>{const on=b.dataset.school===pick;b.classList.toggle('is-on',on);b.setAttribute('aria-checked',String(on));});};
 /* switching cross-fades the right side too: the title and the chosen row's text ease in from a few pixels */
 dialog.querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>{if(pick===b.dataset.school)return;pick=b.dataset.school;draw();if(motion()){const ease={duration:420,easing:'cubic-bezier(.2,.8,.2,1)'};dialog.querySelector('[data-title]').animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],ease);b.querySelectorAll('.class-rite-text>*').forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{...ease,delay:60+i*50,fill:'backwards'}));}});
 const close=()=>{dialog.close();};
 dialog.addEventListener('close',()=>{fx.stop();dialog.remove();},{once:true});
 dialog.querySelector('[data-cancel]').onclick=close;
 dialog.querySelector('[data-go]').onclick=async()=>{const buttons=[...dialog.querySelectorAll('.class-rite-body button')];buttons.forEach(b=>b.disabled=true);
  try{await api('reader_class_set',{element:pick});}catch{buttons.forEach(b=>b.disabled=false);toast(w.fail);return;}
  document.dispatchEvent(new CustomEvent('megulit:reader-class',{detail:{element:pick}}));
  const s=SCHOOLS[pick],lv=Math.max(SCHOOL_LEVEL,levelOf(xpTotal||xpToReach(SCHOOL_LEVEL)).level),rank=rankTitle(lv,l,pick),pref=fxPref('rite'),move=motion()&&pref.on;
  const reveal=dialog.querySelector('.class-rite-reveal');
  dialog.querySelector('[data-r-kicker]').textContent=w.doneKicker;
  dialog.querySelector('[data-r-rank]').innerHTML=[...rank].map((ch,i)=>`<span style="--i:${i}">${esc(ch)}</span>`).join('');
  dialog.querySelector('[data-r-line]').textContent=`Lv.${lv} · ${s.name[l]} · ${s.tag[l]}`;dialog.querySelector('[data-r-motto]').textContent=s.desc[l].split(/(?<=[。.])/)[0];
  dialog.querySelector('[data-finish]').onclick=()=>{close();onDone(pick);};
  /* the burst plays out first; then the dialog changes shape smoothly (FLIP on its height) into the result */
  /* (judge fx8: a small hard white ball, the result card already showing under it) the white comes from the burst
     point as a large soft-edged bloom that fills the window at once; the result card is swapped in under the full
     white, then the white lifts */
  const showReveal=()=>{
   const apply=()=>{const h0=dialog.getBoundingClientRect().height;dialog.dataset.el=pick;dialog.classList.add('is-revealed');reveal.hidden=false;const h1=dialog.getBoundingClientRect().height;if(move&&Math.abs(h1-h0)>4)dialog.animate([{height:h0+'px'},{height:h1+'px'}],{duration:520,easing:'cubic-bezier(.2,.8,.2,1)'});
    if(pending>0){dialog.querySelector('[data-r-xp]').hidden=false;const num=dialog.querySelector('[data-r-num]');setTimeout(()=>countUp(num,pending,move?1400:0,n=>'+'+nf.format(n)),move?800:0);}
    setTimeout(()=>{const f=dialog.querySelector('[data-finish]');f.disabled=false;f.focus();},move?1000:0);};
   /* (user: no full-screen flash in the class change) the result comes in on its own, no white over the window */
   apply();};
  if(!move){showReveal();return;}
  dialog.classList.add('is-casting');
  fx.cast(()=>{dialog.classList.add('is-burst');setTimeout(showReveal,950);});};
 draw();dialog.showModal();
 return dialog;
}
