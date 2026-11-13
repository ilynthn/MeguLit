// SPDX-License-Identifier: GPL-3.0-or-later
/* Live previews in Settings (v1.1.5, user: "I change it and cannot see what it becomes").
   - 游戏中 → 文字与注音: a mock galgame dialogue box drawn with the reader's own style helpers (TomoyoGameStyle), so
     sizes, fonts, outline, gradient, furigana and spacing look as they will in game, scaled to the preview width.
   - 游戏中 → 游戏内面板: the Alt+T menu, dialogue log or lookup card (whichever tab is open) over a game scene.
   Both follow every input at once; nothing is saved by the preview itself. */
/* Lines for the preview; the first is the default. More lines will come from the user. */
const LINES=[{"ja": [["「", ""], ["黒", "くろ"], ["より", ""], ["黒", "くろ"], ["く、", ""], ["闇", "やみ"], ["より", ""], ["暗", "くら"], ["き", ""], ["漆黒", "しっこく"], ["に、", ""], ["我",
 "わ"], ["が", ""], ["深紅", "しんく"], ["の", ""], ["混淆", "こんこう"], ["を", ""], ["望", "のぞ"], ["みたもう」", ""]], "zh": "「比黑色更黑，比黑暗更暗的漆黑，在此寄托吾真红的金光吧」"}, {"ja": [["「", ""], ["覚醒",
 "かくせい"], ["のとき", ""], ["来", "き"], ["たれり。", ""], ["無謬", "むびゅう"], ["の", ""], ["境界", "きょうかい"], ["に", ""], ["落", "お"], ["ちし", ""], ["理", "ことわり"], ["、", ""], ["無行",
 "むぎょう"], ["の", ""], ["歪", "ゆが"], ["みとなりて", ""], ["現出", "げんしゅつ"], ["せよ」", ""]], "zh": "「觉醒之时已至。坠落于无谬境界之理，化作无形的扭曲显现吧」"}, {"ja": [["「", ""], ["踊", "おど"], ["れ、", ""],
 ["踊", "おど"], ["れ、", ""], ["踊", "おど"], ["れ。", ""], ["我", "わ"], ["が", ""], ["力", "ちから"], ["の", ""], ["奔流", "ほんりゅう"], ["に", ""], ["望", "のぞ"], ["むは", ""], ["崩壊", "ほうかい"],
 ["なり。", ""], ["並", "なら"], ["ぶ", ""], ["者", "もの"], ["無", "な"], ["き", ""], ["崩壊", "ほうかい"], ["なり」", ""]], "zh": "「起舞吧，起舞吧，起舞吧。吾力之奔流所求乃是崩坏，是无与伦比的崩坏」"}, {"ja": [["「",
 ""], ["万象", "ばんしょう"], ["等", "ひと"], ["しく", ""], ["灰塵", "かいじん"], ["に", ""], ["帰", "き"], ["し、", ""], ["深淵", "しんえん"], ["より", ""], ["来", "き"], ["たれ！これが", ""], ["人類",
 "じんるい"], ["最大", "さいだい"], ["威力", "いりょく"], ["の", ""], ["攻撃", "こうげき"], ["手段", "しゅだん"], ["、これこそが", ""], ["究極", "きゅうきょく"], ["の", ""], ["攻撃", "こうげき"], ["魔法", "まほう"],
 ["、エクスプロージョン！！」", ""]], "zh": "「万象皆归于尘埃，自深渊降临吧！这便是人类最强威力的攻击手段，这才是究极的攻击魔法——Explosion！！」"}, {"ja": [["「", ""], ["光", "ひかり"], ["に", ""], ["覆", "おお"], ["われし", ""],
 ["漆黒", "しっこく"], ["よ。", ""], ["夜", "よる"], ["を", ""], ["纏", "まと"], ["いし", ""], ["爆炎", "ばくえん"], ["よ。", ""], ["紅魔", "こうま"], ["の", ""], ["名", "な"], ["のもとに", ""], ["原初",
 "げんしょ"], ["の", ""], ["崩壊", "ほうかい"], ["を", ""], ["顕現", "けんげん"], ["す」", ""]], "zh": "「被光芒笼罩的漆黑啊，身披夜色的爆炎啊，以红魔之名，令原初的崩坏显现」"}, {"ja": [["「", ""], ["終焉", "しゅうえん"], ["の",
 ""], ["王国", "おうこく"], ["の", ""], ["地", "ち"], ["に、", ""], ["力", "ちから"], ["の", ""], ["根源", "こんげん"], ["を", ""], ["隠匿", "いんとく"], ["せし", ""], ["者", "もの"], ["。", ""],
 ["我", "わ"], ["が", ""], ["前", "まえ"], ["に", ""], ["統", "す"], ["べよ！エクスプロージョン！」", ""]], "zh": "「于终焉王国之地，隐匿力量根源之人，在吾面前臣服吧！Explosion！」"}, {"ja": [["「", ""], ["紅", "あか"],
 ["き", ""], ["黒炎", "こくえん"], ["、", ""], ["万界", "ばんかい"], ["の", ""], ["王", "おう"], ["。", ""], ["天地", "てんち"], ["の", ""], ["法", "ほう"], ["を", ""], ["敷衍", "ふえん"], ["すれど、",
 ""], ["我", "われ"], ["は", ""], ["万象", "ばんしょう"], ["昇温", "しょうおん"], ["の", ""], ["理", "ことわり"], ["」", ""]], "zh": "「赤红的黑炎，万界之王。纵使天地之法铺展，吾乃万象升温之理」"}, {"ja": [["「", ""],
 ["崩壊", "ほうかい"], ["破壊", "はかい"], ["の", ""], ["別名", "べつめい"], ["なり。", ""], ["永劫", "えいごう"], ["の", ""], ["鉄槌", "てっつい"], ["は", ""], ["我", "わ"], ["がもとに", ""], ["下", "くだ"],
 ["れ！エクスプロージョン！」", ""]], "zh": "「此乃崩坏与破坏之别名。永劫的铁锤啊，降于吾处吧！Explosion！」"}, {"ja": [["「", ""], ["我", "わ"], ["が", ""], ["名", "な"], ["はめぐみん。", ""], ["紅魔族", "こうまぞく"], ["随一",
 "ずいいち"], ["の", ""], ["魔法", "まほう"], ["の", ""], ["使", "つか"], ["い", ""], ["手", "て"], ["にして、", ""], ["爆裂", "ばくれつ"], ["魔法", "まほう"], ["を", ""], ["操", "あやつ"], ["りし", ""],
 ["者", "もの"], ["。", ""], ["我", "わ"], ["が", ""], ["力", "ちから"], ["、", ""], ["見", "み"], ["るがいい！エクスプロージョン！」", ""]], "zh": "「吾名惠惠。红魔族首屈一指的魔法师，操纵爆裂魔法之人。见识吾之力量吧！Explosion！」"},
 {"ja": [["「", ""], ["我", "わ"], ["が", ""], ["深紅", "しんく"], ["の", ""], ["流出", "りゅうしゅつ"], ["を", ""], ["以", "もっ"], ["て、", ""], ["白", "しろ"], ["き", ""], ["世界", "せかい"],
 ["を", ""], ["覆", "くつがえ"], ["さん！エクスプロージョン！」", ""]], "zh": "「以吾深红之奔流，颠覆这纯白的世界！Explosion！」"}, {"ja": [["「", ""], ["他", "ほか"], ["はともかく、", ""], ["爆裂", "ばくれつ"], ["魔法",
 "まほう"], ["のことに", ""], ["関", "かん"], ["しては", ""], ["私", "わたし"], ["は", ""], ["誰", "だれ"], ["にも", ""], ["負", "ま"], ["けたくないのです！", ""], ["行", "い"], ["きます！", ""], ["我",
 "わ"], ["が", ""], ["究極", "きゅうきょく"], ["の", ""], ["破壊", "はかい"], ["魔法", "まほう"], ["、エクスプロージョン！」", ""]], "zh": "「别的暂且不论，唯独爆裂魔法我绝不想输给任何人！上了！吾之究极破坏魔法，Explosion！」"}, {"ja": [["「",
 ""], ["空蝉", "うつせみ"], ["に", ""], ["忍", "しの"], ["び", ""], ["寄", "よ"], ["る", ""], ["叛逆", "はんぎゃく"], ["の", ""], ["摩天楼", "まてんろう"], ["。", ""], ["我", "わ"], ["が", ""], ["前",
 "まえ"], ["に", ""], ["訪", "おとず"], ["れた", ""], ["静寂", "せいじゃく"], ["なる", ""], ["神雷", "しんらい"], ["」", ""]], "zh": "「悄然逼近空蝉的叛逆摩天楼，降临吾前的寂静神雷」"}, {"ja": [["「", ""], ["時",
 "とき"], ["は", ""], ["来", "き"], ["た！", ""], ["今", "いま"], ["、", ""], ["眠", "ねむ"], ["りから", ""], ["目覚", "めざ"], ["め、", ""], ["我", "わ"], ["が", ""], ["狂気", "きょうき"], ["を",
 ""], ["以", "もっ"], ["て", ""], ["現界", "げんかい"], ["せよ！", ""], ["穿", "うが"], ["て！エクスプロージョン！」", ""]], "zh": "「时机已到！此刻从沉眠中苏醒，以吾之狂气现界吧！贯穿吧！Explosion！」"}, {"ja": [["「", ""],
 ["爆走", "ばくそう"], ["…", ""], ["爆走", "ばくそう"], ["…", ""], ["爆走", "ばくそう"], ["……", ""], ["最高", "さいこう"], ["最強", "さいきょう"], ["にして", ""], ["最大", "さいだい"], ["の", ""], ["魔法",
 "まほう"], ["、", ""], ["爆裂", "ばくれつ"], ["魔法", "まほう"], ["の", ""], ["使", "つか"], ["い", ""], ["手", "て"], ["、", ""], ["我", "わ"], ["が", ""], ["名", "な"], ["はめぐみん」", ""]],
 "zh": "「爆走……爆走……爆走……最高最强亦最大的魔法——爆裂魔法的使用者，吾名惠惠」"}, {"ja": [["「", ""], ["我", "われ"], ["に", ""], ["許", "ゆる"], ["されし", ""], ["一撃", "いちげき"], ["は", ""], ["同胞", "どうほう"],
 ["の", ""], ["愛", "あい"], ["にも", ""], ["似", "に"], ["た", ""], ["盲目", "もうもく"], ["を", ""], ["奏", "かな"], ["で、", ""], ["塑性", "そせい"], ["を", ""], ["脆性", "ぜいせい"], ["へと",
 ""], ["葬", "ほうむ"], ["り", ""], ["去", "さ"], ["る。", ""], ["強", "つよ"], ["き", ""], ["鼓動", "こどう"], ["を", ""], ["享受", "きょうじゅ"], ["する！」", ""]], "zh": "「吾所被允许的一击，奏响宛如同胞之爱的盲目，将塑性葬为脆性。尽享强劲的心跳！」"}];
let lineIndex=0;const SAMPLE={name:'めぐみん',get ja(){return LINES[lineIndex].ja;},get zh(){return LINES[lineIndex].zh;}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const hex=v=>/^#[0-9a-f]{6}$/i.test(String(v||''))?v:'';
/* 2026-11-14 the value is url("…"): its double quotes ended the style="…" attribute it is written into, so the stage stayed
   black and 背景/模糊/变暗/饱和度 showed nothing. Escape them; with the home background off, use the default art. */
const homeImage=()=>{const v=getComputedStyle(document.querySelector('.app-backdrop')||document.documentElement).getPropertyValue('--home-image').trim();
 const img=v&&v!=='none'?v:`url("assets/default-background-${document.documentElement.dataset.theme==='light'?'light':'dark'}.webp")`;return img.replace(/"/g,'&quot;');};
const T={zh:{title:'实时预览',hint:'改动会立刻显示在这里，确认满意再保存',next:'换一句 ✦',unread:'未读',read:'已读',menu:'阅读层菜单',log:'对话记录',card:'点读'},
 ja:{title:'プレビュー',hint:'変更はすぐここに反映されます',next:'別の台詞 ✦',unread:'未読',read:'既読',menu:'メニュー',log:'会話ログ',card:'辞書'},
 en:{title:'Live preview',hint:'Changes show here at once',next:'Another line ✦',unread:'Unread',read:'Read',menu:'Reader menu',log:'Dialogue log',card:'Lookup'}};

function readValues(form,values){
 const v={...values};
 for(const el of form.elements){const k=el.name;if(!k||!(k in values))continue;
  if(el.type==='checkbox')v[k]=el.checked;else if(el.type==='range'||el.type==='number')v[k]=Number(el.value);else if(el.type==='color')v[k]=el.dataset.empty==='true'&&!el.dataset.touched?values[k]:el.value;
   else v[k]=el.value;}
 return v;
}

/* With a gradient the glyphs are transparent (the gradient shows through them), so a text-shadow outline would show as
   a dark mass; draw the outline with drop-shadow filters instead, like the reader's gradient path */
function gradientOutline(v){const c=hex(v.japaneseOutlineColor)||'#1a1010',w=Math.max(.5,Number(v.japaneseOutlineWidth)||0);if(!v.japaneseOutline)return v.shadow==='soft'?'drop-shadow(0 1px 2px #000c)':'none';
 return [[w,0],[-w,0],[0,w],[0,-w]].map(([x,y])=>`drop-shadow(${x}px ${y}px 0 ${c})`).join(' ');}
function textPreview(box,s){
 const G=window.TomoyoGameStyle,d=G?.defaults||{},v={...d,...s};
 const k=Math.max(.4,Math.min(1.2,(box.clientWidth||900)/1000));
 const q=f=>String(f).replace(/"/g,"'"),jaFont=q(G?.japaneseFonts?.[v.japaneseFont]||"'Yu Mincho','MS Mincho',serif"),zhFont=q(G?.chineseFonts?.[v.chineseFont]||"'Microsoft YaHei',sans-serif");
 const outline=(on,color,width)=>G?.outlineFor?G.outlineFor(!!on,hex(color)||'#1a1010',Number(width)*k,window.devicePixelRatio||1):'none';
 const shadow=v.shadow==='soft'?'0 1px 3px #000c':v.shadow==='outline'?(G?.shadows?.outline||'none'):'none';
 const join=(a,b)=>[a,b].filter(x=>x&&x!=='none').join(',')||'none';
 const rd=box.dataset.read==='1',pre=rd?'readText':'text',grad=rd?v.readTextGradient:v.textGradient,color=rd?(hex(v.readTextColor)||hex(v.textColor)||'#fffaf2'):(hex(v.textColor)||'#fffaf2');
 const jaPaint=grad?`background:linear-gradient(180deg,${hex(v[pre+'GradientTop'])||'#fffaf2'} ${Number(v[pre+'GradientStart'])||0}%,${hex(v[pre+'GradientBottom'])||'#a8c8ff'});-webkit-background-clip:text;background-clip:text;color:transparent;`:`color:${color};`;

 const lh=G?.lineHeightFor?G.lineHeightFor(v,!!v.furigana):1.95+(Number(v.lineHeight)||0);
 const chars=t=>[...t].map(c=>`<span class="sp-c">${esc(c)}</span>`).join('');
 const ja=SAMPLE.ja.map(([b,r])=>r&&v.furigana?`<ruby class="sp-c">${esc(b)}<rt style="font-size:${v.rubyScale}em;position:relative;left:${(Number(v.rubyOffsetX)||0)*k}px;top:${(Number(v.rubyOffsetY)||0)*k}px;text-shadow:${outline(v.rubyOutline,v.rubyOutlineColor,v.rubyOutlineWidth)}">${esc(r)}</rt></ruby>`:chars(b)).join('');
 const show=v.display||'bilingual',inverted=false;
 const jaHtml=show==='chinese'?'':`<div class="sp-ja" style="font-family:${jaFont};font-size:${v.japaneseSize*k}px;font-weight:${v.japaneseBold?700:500};letter-spacing:${(Number(v.japaneseSpacingPx)||0)*k}px;line-height:${lh};${jaPaint}${grad?`filter:${gradientOutline(v)};`:`text-shadow:${join(outline(v.japaneseOutline,v.japaneseOutlineColor,v.japaneseOutlineWidth),shadow)};`}">${ja}</div>`;
 const zhHtml=show==='japanese'?'':`<div class="sp-zh" style="font-family:${zhFont};font-size:${v.translationSize*k}px;font-weight:${v.chineseBold?700:500};letter-spacing:${(Number(v.chineseSpacingPx)||0)*k}px;line-height:${1.5+(Number(v.translationLineHeight)||0)};margin-top:${(Number(v.gap)||0)*k}px;max-width:${Number(v.translationWidth)>0?v.translationWidth+'%':'none'};color:${hex(v.textColor)||'#fffaf2'};opacity:.92;text-shadow:${join(outline(v.chineseOutline,v.chineseOutlineColor,v.chineseOutlineWidth),shadow)}">${esc(SAMPLE.zh)}</div>`;
 box.querySelector('.sp-stage').innerHTML=`<div class="sp-scene" style="background-image:${homeImage()}"><div class="sp-window" style="padding:${Math.max(0,(Number(v.paddingY)||0)*k)+14}px ${Math.max(0,(Number(v.paddingX)||0)*k)+22}px"><div class="sp-name">${SAMPLE.name}</div>${inverted?zhHtml+jaHtml:jaHtml+zhHtml}</div></div>`;
 typewriter(box,v);
}

/* Typewriter: reveal the Japanese at the chosen speed (ms per character), hold, then start again */
function typewriter(box,v){
 clearTimeout(box.__tw);const cs=[...box.querySelectorAll('.sp-ja .sp-c')];if(!v.typewriter||!cs.length)return;
 const step=Math.max(5,Number(v.typewriterSpeed)||35);let i=0;cs.forEach(c=>c.style.visibility='hidden');
 const tick=()=>{if(!box.isConnected)return;if(i<cs.length){cs[i++].style.visibility='visible';box.__tw=setTimeout(tick,step);}else box.__tw=setTimeout(()=>{i=0;
  cs.forEach(c=>c.style.visibility='hidden');tick();},1600);};
 box.__tw=setTimeout(tick,step);
}
function panelPreview(box,s,kind,locale){
 const t=T[locale]||T.zh,p=n=>Number(s[`panels.${kind}.${n}`]),surface=s[`surfaces.${kind}`]||'image';
 const image=surface==='image'||surface==='both',glass=surface==='glass'||surface==='both';
 const alpha=Math.max(0,Math.min(100,p('alpha')))/100,border=Math.max(0,Math.min(100,p('border')))/100;
 const pic=image?`<div class="sp-pic" style="background-image:${homeImage()};filter:blur(${p('blur')}px) brightness(${1-p('dim')/100}) saturate(${p('saturate')}%)"></div>`:'';
 const glassStyle=glass?`backdrop-filter:blur(${p('glassBlur')}px) brightness(${1-p('glassDim')/100}) saturate(${p('glassSaturate')}%);-webkit-backdrop-filter:blur(${p('glassBlur')}px) brightness(${1-p('glassDim')/100}) saturate(${p('glassSaturate')}%);`:'';
 const body={
  menu:`<div class="sp-p-title">MeguLit · ${t.menu}</div>${['启用中文翻译','结合前文翻译','逐字显示','假名注音'].map((l,i)=>`<div class="sp-p-row"><span>${l}</span><i class="${i!==2?'on':''}"></i></div>`).join('')}`,
  log:`<div class="sp-p-title">${t.log}</div>${[['めぐみん','「我が名はめぐみん！」','「吾名惠惠！」'],['','風が冷たい夜だった。','那是个寒风凛冽的夜晚。'],['カズマ','「またか……」','「又来了……」']].map(([n,j,z])=>`<div class="sp-p-log"><b>${n||'旁白'}</b><span>${j}<small>${z}</small></span></div>`).join('')}`,
  card:`<div class="sp-p-word">漆黒<small>しっこく</small></div><div class="sp-p-def">名詞・形容動詞 · 漆黑；乌黑发亮的黑色</div><div class="sp-p-def dim">例：漆黒の闇に包まれる</div>`
 }[kind];
 box.querySelector('.sp-stage').innerHTML=`<div class="sp-scene sp-scene-panel" style="background-image:${homeImage()}"><div class="sp-panel sp-${kind}" style="border-radius:${p('radius')}px;border:1px solid rgba(255,236,214,${(.05+border*.6).toFixed(3)});${glassStyle}">${pic}<div class="sp-tint" style="background:rgba(22,14,16,${alpha.toFixed(3)})"></div><div class="sp-body">${body}</div></div></div>`;
}

export function mountSettingsPreview({content,section,values,locale}){
 if(!['text','panels'].includes(section)||!values)return;
 const form=content.querySelector('#advanced-settings-form');if(!form)return;
 const t=T[locale]||T.zh,box=document.createElement('section');box.className='sp-preview';box.setAttribute('aria-label',t.title);
 box.innerHTML=`<div class="sp-head"><span>${t.title}</span><small>${t.hint}</small>${section==='text'?`<span class="sp-read" role="group"><button type="button" data-read="0" aria-pressed="true">${t.unread}</button><button type="button" data-read="1" aria-pressed="false">${t.read}</button></span>`:''}${section==='text'&&LINES.length>1?`<button type="button" class="sp-next">${t.next}</button>`:''}</div><div class="sp-stage"></div>`;
 box.querySelectorAll('.sp-read button').forEach(b=>b.addEventListener('click',()=>{box.dataset.read=b.dataset.read;box.querySelectorAll('.sp-read button').forEach(x=>x.setAttribute('aria-pressed',
  String(x===b)));draw();}));
 box.querySelector('.sp-next')?.addEventListener('click',()=>{lineIndex=(lineIndex+1+Math.floor(Math.random()*(LINES.length-1)))%LINES.length;draw();});
 (form.querySelector('.settings-page-tabs')||form.querySelector('.settings-section-title'))?.after(box);
 const activeKind=()=>form.querySelector('.settings-page-tabs [aria-selected="true"]')?.dataset.page||'menu';
 /* 2026-11-14 (user): the preview stays in view. It is sticky just under the sticky search bar while the options scroll
    beneath it, and kept compact: the scene is scaled down as a whole, like a thumbnail (never clipped or re-wrapped) so the whole box fits in ~30% of the window.
    One layout read per animation frame; the pin offset is measured only on mount and resize. */
 const scroller=box.closest('.settings-content');
 const pin=()=>{if(!scroller||!box.isConnected)return;const search=scroller.querySelector('.settings-search');const st=search?getComputedStyle(search):null;
  const top=st&&st.position==='sticky'?(parseFloat(st.top)||0)+search.offsetHeight+8:8;box.style.setProperty('--sp-top',top+'px');
  scroller.style.scrollPaddingTop=(top+parseFloat(getComputedStyle(scroller).paddingTop||0)+box.offsetHeight+8)+'px';};
 const fit=()=>{const stage=box.querySelector('.sp-stage'),scene=stage?.querySelector('.sp-scene');if(!scene)return;scene.style.transform='';stage.style.height='';
  const natural=scene.offsetHeight,chrome=box.offsetHeight-stage.offsetHeight,z=Math.max(.45,Math.min(1,(Math.round(innerHeight*.32)-chrome)/natural));
  if(z<.995){scene.style.transformOrigin='50% 0';scene.style.transform='scale('+z.toFixed(3)+')';stage.style.height=Math.round(natural*z)+'px';}};
 let frame=0;const draw=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!box.isConnected)return;const v=readValues(form,values);if(section==='text')textPreview(box,
  v);else panelPreview(box,v,activeKind(),locale);fit();});};
 const onResize=()=>{if(!box.isConnected){removeEventListener('resize',onResize);return;}pin();draw();};addEventListener('resize',onResize,{passive:true});requestAnimationFrame(pin);
 form.addEventListener('input',e=>{if(e.target.type==='color')e.target.dataset.touched='1';draw();});form.addEventListener('change',draw);
 form.querySelector('.settings-page-tabs')?.addEventListener('click',()=>setTimeout(draw,0));
 if(typeof ResizeObserver==='function')new ResizeObserver(draw).observe(box);
 draw();
}
