// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const replace=(text,from,to)=>{
 if(!text.includes(from))throw Error('Missing reader font anchor: '+from);
 return text.replace(from,()=>to);
};

function adapt(name,text){
 if(name==='game-fonts-ui'){
  const from=text.indexOf('   const list=fontsOf(lang);'),to=text.indexOf('   const want=',from);
  if(from<0||to<0)throw Error('FONT_OPTIONS_ANCHOR');
  text=text.slice(0,from)+String.raw`   const ui=window.__tomeI18n?.get?.()||document.documentElement.lang.slice(0,2);
   const notes=({
    zh:{sans:'系统字体 · 黑体',serif:'系统字体 · 明朝／衬线',mono:'系统字体 · 等宽',round:'圆润字形',inherit:'跟随正文',patch:'《素晴日》汉化字体',original:'游戏字体',optional:'需本机安装',bundled:'MeguLit 自带 · 无需安装'},
    en:{sans:'System font · sans-serif',serif:'System font · serif',mono:'System font · monospace',round:'Rounded',inherit:'Follow body text',patch:'Subahibi Chinese patch font',original:'Game font',optional:'Requires installation',bundled:'Bundled with MeguLit · no install needed'},
    ja:{sans:'システム · ゴシック',serif:'システム · 明朝',mono:'システム · 等幅',round:'丸みのある字形',inherit:'本文に合わせる',patch:'素晴らしき日々の中国語パッチ',original:'作品フォント',optional:'要インストール',bundled:'MeguLit 同梱 · インストール不要'}
   })[ui]||{};
   const option=(id,family,note)=>{const o=new Option(family,id);o.dataset.fontName=family;o.dataset.fontNote=note;o.dataset.noI18n='';return o;};
   const built=gs.fontOptions[key].map(([id,family,kind,optional])=>option(id,family||notes.inherit,kind==='inherit'?'':optional==='bundled'?notes.bundled:optional?notes.optional:notes[kind]));
   const game=fontsOf(lang).map(f=>{register(f);const o=option('game:'+f.id,f.family,label()+' · '+notes.original);o.title=f.source||'';return o;});
   select.replaceChildren(...game,...built);
`+text.slice(to);
  return replace(text,"['galRubyFont','ja','rubyFont']","['galRubyFont','ja','rubyFont'],['galEnglishFont','en','englishFont']");
 }
 if(name==='polish'){
  return replace(text,'if(m){d.append(m[1]);','if(o.dataset.fontName){d.append(o.dataset.fontName);if(o.dataset.fontNote){const sub=document.createElement(\'small\');sub.textContent=o.dataset.fontNote;d.append(sub);}}else if(m){d.append(m[1]);');
 }
 if(name==='menu-layout'){
  return replace(text,"if(n.classList.contains('tomoyo-ruby-menu'))", "if(n.hasAttribute('data-megulit-english')){text.insertBefore(n,ruby);continue;}\n   if(n.classList.contains('tomoyo-ruby-menu'))");
 }
 if(name==='gal'){
  text=replace(text,'    const f = name => form.elements.namedItem(name);',String.raw`    const english=document.createElement('details');english.dataset.megulitEnglish='';english.dataset.noI18n='';
    const en=({
      zh:['英文设置','独立设置拉丁字母','字体','跟随正文','字号','字距（px）','加粗','描边','描边颜色','描边宽度'],
      en:['English typography','Style Latin letters separately','Font','Follow body text','Size','Letter spacing (px)','Bold','Outline','Outline colour','Outline width'],
      ja:['英字設定','英字を個別に設定','フォント','本文に合わせる','サイズ','字間（px）','太字','縁取り','縁取りの色','縁取りの幅']
    })[document.documentElement.lang.slice(0,2)]||[];
    const fields=[
      ['Enabled','checkbox'],['Font','select'],['Size','number',12,60,.5],['SpacingPx','number',-15,25,.25],
      ['Bold','checkbox'],['Outline','checkbox'],['OutlineColor','color'],['OutlineWidth','number',0,4,.1]
    ];
    const enSummary=document.createElement('summary');enSummary.textContent=en[0]||'English';english.append(enSummary);
    const fieldLabels=[en[1],en[2],en[4],en[5],en[6],en[7],en[8],en[9]];
    for(const [index,[key,type,min,max,step]] of fields.entries()){
      const label=document.createElement('label'),input=document.createElement(type==='select'?'select':'input');
      input.name='galEnglish'+key;label.textContent=fieldLabels[index]||key;
      if(type==='select'){
        for(const [id,family] of appearance.fontOptions.englishFont)input.add(new Option(family||en[3]||'Inherit',id));
        input.addEventListener('change',()=>{if(input.value==='inherit')return;const enabled=form.elements.namedItem('galEnglishEnabled');if(!enabled.checked){enabled.checked=true;enabled.dispatchEvent(new Event('input',{bubbles:true}));}});
      }else{input.type=type;if(type==='number'){input.min=min;input.max=max;input.step=step;}}
      if(type==='checkbox')label.prepend(input);else label.append(input);
      english.append(label);
    }
    group.append(english);
    const f = name => form.elements.namedItem(name);`);
  text=replace(text,'    additional.livePosition=',`    for(const [key] of fields)additional['english'+key[0].toLowerCase()+key.slice(1)]='galEnglish'+key;
    additional.livePosition=`);
  text=replace(text,"    root.setProperty('--tomoyo-jp-weight',",`    document.body.classList.toggle('megulit-english-style',preferences.englishEnabled);
    root.setProperty('--megulit-en-font',appearance.englishFonts[preferences.englishFont]);
    root.setProperty('--megulit-en-size',scaled(preferences.englishSize));
    root.setProperty('--megulit-en-spacing',scaled(preferences.englishSpacingPx));
    root.setProperty('--megulit-en-weight',preferences.englishBold?'700':'400');
    root.setProperty('--megulit-en-stroke',preferences.englishOutline?scaled(preferences.englishOutlineWidth):'0px');
    root.setProperty('--megulit-en-stroke-color',preferences.englishOutlineColor);
    root.setProperty('--tomoyo-jp-weight',`);
  return replace(text,'layoutInfo ? layoutInfo.readerWidth/(Number(window.devicePixelRatio)||1)', 'layoutInfo ? (layoutInfo.clientWidth>0?layoutInfo.clientWidth*preferences.width/100:layoutInfo.readerWidth)/(Number(window.devicePixelRatio)||1)');
 }
 if(name==='hook-reader'||name==='island-page')return replace(text,"span.className='char-token';",String.raw`span.className=/^\p{Script=Latin}$/u.test(c)?'char-token megulit-latin':'char-token';`);
 if(name==='typewriter')return replace(text,"span.className='tome-translation-char';span.textContent=character",String.raw`span.className=/^\p{Script=Latin}$/u.test(character)?'tome-translation-char megulit-latin':'tome-translation-char';span.textContent=character`);
 if(name==='inject')return replace(text,'else { window.TomeTypewriter?.stop(output); delete output.dataset.tomeTyping; output.textContent = text; }',String.raw`else {
      window.TomeTypewriter?.stop(output); delete output.dataset.tomeTyping;
      const parts=text.split(/(\p{Script=Latin}+)/u);
      output.replaceChildren(...parts.map((part,index)=>{
        if(index%2===0)return part;
        const latin=document.createElement('span');latin.className='megulit-latin';latin.textContent=part;return latin;
      }));
    }`);
 return text;
}
module.exports={adapt};
