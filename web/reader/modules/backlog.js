// SPDX-License-Identifier: GPL-3.0-or-later
// Galgame-style LOG: every line that reached the reader is kept together with its translation, so a line skipped
// by clicking too fast can be read again. Open with the mouse wheel (scroll up over the text) or the L key in
// translation mode; close with Esc, right click, the close button, or scrolling down past the end.
// The LOG button in the Alt+T menu header opens the 记录 page of the menu: how the log looks and what it keeps.
// By default the log uses the game's own text font and the translation (Chinese patch) font of the dialogue box.
(function installBacklog(){
 'use strict';
 if(!document.documentElement||!document.body||!window.__tomoyoChinese){document.addEventListener('DOMContentLoaded',installBacklog,{once:true});return;}
 const b=window.__tomoyoChinese;if(b.backlogInstalled)return;b.backlogInstalled=true;
 const KEY='tomoyo-backlog-session',SETTINGS='tome-log-settings';
 const DEFAULTS={jpFont:'game',cnFont:'game',jpSize:18,trSize:14.5,lineHeight:1.75,showTr:true,showName:true,showTime:false,compact:false,width:800,height:88,opacity:100,keep:true,max:500,wheel:true,keyL:true};
 const T={
  zh:{title:'对话记录',count:'{n} 条',empty:'还没有记录。游戏里出现的台词和译文会保存在这里。',noMatch:'没有找到包含「{q}」的台词',hint:'滚轮向上打开 · Esc / 右键关闭',search:'搜索台词或译文',close:'关闭',settings:'记录设置',copy:'复制原文',copyTr:'复制译文',copied:'已复制',pending:'翻译中…',none:'未翻译',narration:'旁白',
   page:'对话记录（LOG）',pageNote:'调整 LOG 的外观和保存方式，改动立即生效。',open:'打开对话记录',preview:'预览',fonts:'字体',jpFont:'原文字体',cnFont:'译文字体',followGame:'跟随游戏原文字体',followCn:'跟随汉化 / 译文字体',followJp:'与原文相同',current:'当前：{f}',jpSize:'原文字号',trSize:'译文字号',lineHeight:'行距',
   display:'显示',showTr:'显示译文',showName:'显示说话人',showTime:'显示时间',compact:'紧凑排列',panel:'面板',width:'宽度',height:'高度（占窗口）',opacity:'背景不透明度',keeping:'记录',keep:'重启后保留记录',max:'最多保留',wheel:'在台词上滚轮向上打开',keyL:'翻译模式下按 L 打开',copyAll:'复制全部记录',clear:'清空记录',cleared:'已清空',confirmClear:'再点一次确认清空',
   sampleName:'司',sampleSrc:'「ゆきはここでどんな表情でいるんだろ……」',sampleTr:'“雪在这里会是什么样的表情呢……”',sampleSrc2:'空がとても青かった。',sampleTr2:'天空非常蓝。'},
  en:{title:'Backlog',count:'{n} lines',empty:'Nothing yet. Lines from the game and their translations are kept here.',noMatch:'No line contains “{q}”',hint:'Scroll up to open · Esc or right-click to close',search:'Search lines or translations',close:'Close',settings:'Log settings',copy:'Copy line',copyTr:'Copy translation',copied:'Copied',pending:'Translating…',none:'Not translated',narration:'Narration',
   page:'Backlog (LOG)',pageNote:'How the log looks and what it keeps; changes apply at once.',open:'Open backlog',preview:'Preview',fonts:'Fonts',jpFont:'Original text font',cnFont:'Translation font',followGame:'Follow the game text font',followCn:'Follow the translation (patch) font',followJp:'Same as original',current:'now: {f}',jpSize:'Original size',trSize:'Translation size',lineHeight:'Line height',
   display:'Display',showTr:'Show translations',showName:'Show speakers',showTime:'Show times',compact:'Compact',panel:'Panel',width:'Width',height:'Height (of window)',opacity:'Background opacity',keeping:'History',keep:'Keep the log after restarting',max:'Keep at most',wheel:'Wheel up over the line opens it',keyL:'L opens it in translation mode',copyAll:'Copy whole log',clear:'Clear log',cleared:'Cleared',confirmClear:'Click again to clear',
   sampleName:'Tsukasa',sampleSrc:'「ゆきはここでどんな表情でいるんだろ……」',sampleTr:'“I wonder what kind of face Yuki makes here…”',sampleSrc2:'空がとても青かった。',sampleTr2:'The sky was very blue.'},
  ja:{title:'バックログ',count:'{n} 件',empty:'まだ記録はありません。ゲームのセリフと訳がここに残ります。',noMatch:'「{q}」を含むセリフはありません',hint:'ホイール上で開く · Esc / 右クリックで閉じる',search:'セリフや訳文を検索',close:'閉じる',settings:'ログ設定',copy:'原文をコピー',copyTr:'訳文をコピー',copied:'コピーしました',pending:'翻訳中…',none:'未翻訳',narration:'地の文',
   page:'バックログ（LOG）',pageNote:'ログの見た目と保存方法。変更はすぐ反映されます。',open:'バックログを開く',preview:'プレビュー',fonts:'フォント',jpFont:'原文フォント',cnFont:'訳文フォント',followGame:'ゲームの本文フォントに合わせる',followCn:'訳文（パッチ）フォントに合わせる',followJp:'原文と同じ',current:'現在：{f}',jpSize:'原文サイズ',trSize:'訳文サイズ',lineHeight:'行間',
   display:'表示',showTr:'訳文を表示',showName:'話者を表示',showTime:'時刻を表示',compact:'詰めて表示',panel:'パネル',width:'幅',height:'高さ（ウィンドウ比）',opacity:'背景の不透明度',keeping:'記録',keep:'再起動後も残す',max:'最大件数',wheel:'セリフ上でホイール上で開く',keyL:'翻訳モードで L キーで開く',copyAll:'全件コピー',clear:'ログを消去',cleared:'消去しました',confirmClear:'もう一度押すと消去',
   sampleName:'司',sampleSrc:'「ゆきはここでどんな表情でいるんだろ……」',sampleTr:'“雪在这里会是什么样的表情呢……”',sampleSrc2:'空がとても青かった。',sampleTr2:'天空非常蓝。'}};
 const t=(k,v={})=>{const lang=window.__tomeI18n?.get?.()||'zh';let s=(T[lang]||T.zh)[k]??T.zh[k]??k;for(const [a,x] of Object.entries(v))s=s.replace('{'+a+'}',x);return s;};
 let cfg={...DEFAULTS};try{cfg={...DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS)||'{}')};}catch{}
 const saveCfg=()=>{try{localStorage.setItem(SETTINGS,JSON.stringify(cfg));}catch{}};
 const store=()=>cfg.keep?localStorage:sessionStorage;
 function normalizeTranslation(value){
 return typeof value==='string'?value.replace(/\\r\\n|\\n|<br\s*\/?>/gi,'\n'):value;
}
 let entries=[];try{const saved=JSON.parse(store().getItem(KEY)||sessionStorage.getItem(KEY)||'[]');if(Array.isArray(saved))entries=saved.filter(e=>e&&typeof e.src==='string').slice(-cfg.max).map(e=>({...e,tr:normalizeTranslation(e.tr)}));}catch{}
 let saveTimer=0;const persist=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{store().setItem(KEY,JSON.stringify(entries));(cfg.keep?sessionStorage:localStorage).removeItem(KEY);}catch{}},300);};
 const norm=v=>String(v||'').replace(/\s+/g,'');
 function record(src){const body=String(src||'').trim(),raw=b.hookActive&&typeof b.hookSourceText==='string'&&norm(split(b.hookSourceText).text)===norm(body)?b.hookSourceText:body;const text=raw.trim();if(!text)return;const last=entries.at(-1);if(last&&norm(last.src)===norm(text))return;const speaker=raw===b.hookSourceText&&!split(text).name&&typeof b.hookSpeaker==='string'?b.hookSpeaker:'';entries.push(speaker?{src:text,tr:'',at:Date.now(),name:speaker}:{src:text,tr:'',at:Date.now()});if(entries.length>cfg.max)entries.splice(0,entries.length-cfg.max);persist();refreshLog();}
 function translated(src,text){const key=norm(split(src).text);for(let i=entries.length-1;i>=Math.max(0,entries.length-20);i--)if(norm(split(entries[i].src).text)===key){entries[i].tr=String(text||'');persist();refreshLog();return;}}
 const source=b.onSourceText;b.onSourceText=text=>{source?.(text);record(text);};
 if(b.sourceText)record(b.sourceText);
 // Page translation (ISLAND) delivers per sentence instead of through b.current.
 b.backlogTranslated=translated;const deliver=b.deliver;b.deliver=(id,text,error,message)=>{const src=b.current;deliver?.(id,text,error,message);if(!error&&id===b.serial&&src&&typeof text==='string'&&text.trim())translated(src,text);};
 b.backlogEntries=()=>entries.slice();
 // "司\n「……」" (BGI and many engines put the speaker on its own line) or "司「……」": speaker and line apart.
 // "[千春]……" / "【千春】……" without 「」 (BRUNS): the bracket is the speaker.
 function split(src){const r=splitRaw(src);if(r.name)return r;const k=/^[\[【]([^\[\]【】\n]{1,12})[\]】]\s*([^]*)$/.exec(String(r.text).trim());return k&&k[2].trim()?{name:k[1],text:k[2].trim()}:r;}
 function splitRaw(src){if(b.splitDialogue)return b.splitDialogue(src);const lines=src.split('\n');
  if(lines.length>=2&&lines[0].trim().length<=12&&!/[「『（(。、]/.test(lines[0])&&/^[「『（(]/.test(lines[1].trim()))return {name:lines[0].trim(),text:lines.slice(1).join('\n').trim()};
  const m=/^([^\s「『（(]{1,10})([「『].*[」』])$/s.exec(src.trim());if(m)return {name:m[1],text:m[2]};
  return {name:'',text:src};}
 // One hook delivery can hold several lines (BRUNS pages, fast skipping): "[千春]……っ。[千春]な……" was one row with
 // the speaker inline (user, 2026-11-14). Such an entry is shown as one row per speaker mark; translations pair up line
 // by line when the counts match, otherwise the whole translation stays under the last row. The stored entry is unchanged.
 const MARK=/(?=[\[【][^\[\]【】\n]{1,12}[\]】])/;
 function pieces(entry){const parts=String(entry.src||'').split(MARK).map(x=>x.trim()).filter(Boolean);if(parts.length<2)return [[entry,true]];
  const tr=String(entry.tr||'').split('\n').map(x=>x.trim()).filter(Boolean),pair=tr.length===parts.length;
  return parts.map((src,i)=>{const last=i===parts.length-1,tx=pair?tr[i]:last?entry.tr:'';return [{...entry,src,tr:tx,trElsewhere:!tx&&!!entry.tr},last];});}

 // ── Fonts: the dialogue box's own font variables, unless a font is chosen here ──────────────────────────────────
 const rootVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
 // Internal aliases (TomoyoSubahibiCN, ToMeGF-…) stand for a game's font: show its real name (素晴字体) instead.
 const ALIAS=/^(Tomoyo|ToMeGF)/i;
 const firstFamily=v=>{const list=String(v||'').split(',').map(f=>f.trim().replace(/^["']|["']$/g,'')).filter(f=>f&&!/^(sans-serif|serif|monospace)$/.test(f));const real=list.filter(f=>!ALIAS.test(f));return real.find(f=>/[^ -]/.test(f))||real[0]||list[0]||'—';};
 const SYSTEM=['Yu Gothic UI','Yu Mincho','Meiryo','MS Gothic','MS Mincho','Noto Sans JP','Noto Serif JP','Microsoft YaHei','SimHei','SimSun','KaiTi','Noto Sans SC'];
 const quote=f=>'"'+String(f).replace(/"/g,'')+'"';
 function fontValue(kind,depth=0){const v=depth>1?'game':kind==='jp'?cfg.jpFont:cfg.cnFont;
  if(v==='game')return kind==='jp'?'var(--tomoyo-gal-jp-font,"Yu Gothic UI",sans-serif)':'var(--tomoyo-gal-cn-font,"Microsoft YaHei",sans-serif)';
  if(v==='jp'||v==='cn')return fontValue(v,depth+1);return quote(v)+',sans-serif';}
 function fontChoices(){const set=new Set();try{for(const f of document.fonts)if(f.status!=='error'&&!/Symbols Nerd/i.test(f.family)&&!ALIAS.test(f.family.replace(/^["']/,'')))set.add(f.family.replace(/^["']|["']$/g,''));}catch{}for(const f of SYSTEM)set.add(f);
  for(const v of [rootVar('--tomoyo-gal-jp-font'),rootVar('--tomoyo-gal-cn-font')])for(const f of v.split(','))if(f.trim()&&!/serif|sans-serif|monospace/.test(f)&&!ALIAS.test(f.trim().replace(/^["']/,'')))set.add(f.trim().replace(/^["']|["']$/g,''));return [...set];}
 function applyVars(node){if(!node)return;const s=node.style;
  s.setProperty('--log-jp-font',fontValue('jp'));s.setProperty('--log-cn-font',fontValue('cn'));s.setProperty('--log-jp-size',cfg.jpSize+'px');s.setProperty('--log-tr-size',cfg.trSize+'px');s.setProperty('--log-lh',String(cfg.lineHeight));
  s.setProperty('--log-w',cfg.width+'px');s.setProperty('--log-h',cfg.height+'vh');s.setProperty('--log-bg',cfg.opacity+'%');
  node.toggleAttribute('data-compact',cfg.compact);node.toggleAttribute('data-no-tr',!cfg.showTr);node.toggleAttribute('data-no-name',!cfg.showName);node.toggleAttribute('data-time',cfg.showTime);}

 const style=document.createElement('style');style.textContent=String.raw`
 .tome-backlog{--log-accent:var(--theme-primary,#e0495a);position:fixed;z-index:2147482500;inset:0;margin:auto;width:min(var(--log-w,800px),var(--log-max-w,calc(100vw - 32px)));height:min(var(--log-h,88vh),calc(100vh - 32px));display:flex;flex-direction:column;box-sizing:border-box;border-radius:18px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 10%,transparent);background:linear-gradient(180deg,color-mix(in srgb,color-mix(in srgb,var(--theme-surface,#18181b) 92%,var(--log-accent) 8%) var(--log-bg,97%),transparent) 0,color-mix(in srgb,var(--theme-surface,#18181b) var(--log-bg,97%),transparent) 140px);color:var(--theme-text,#e8e9ec);box-shadow:0 24px 70px rgba(0,0,0,.45);font:14px/1.6 "Microsoft YaHei UI","Yu Gothic UI",sans-serif;overflow:hidden;-webkit-app-region:no-drag;pointer-events:auto}
 body.tomoyo-ui-translation .tome-backlog{box-shadow:none} .tome-backlog:focus,.tome-backlog:focus-visible{outline:none!important}
 .tome-backlog header{cursor:move;touch-action:none;user-select:none}
 .tome-backlog header :is(input,button){cursor:pointer} .tome-backlog header input{cursor:text}
 .tome-backlog.tome-log-dragging{will-change:transform} .tome-backlog.tome-log-dragging header{cursor:grabbing}
 /* Frosted glass: the bridge's native glass window blurs the game and desktop, but MeguLit's own text is drawn in this
    same page above that window, so it showed sharp through the panel. Blur the page content behind the panel only. */
 html:is([data-tome-log-surface=glass],[data-tome-log-surface=both]) body.tomoyo-ui-translation .tome-backlog{-webkit-backdrop-filter:blur(var(--tome-log-text-blur,16px));backdrop-filter:blur(var(--tome-log-text-blur,16px))}
 /* Furigana on past lines, same readings as the current line; drawn by a pseudo element so copying and the lookup
    selection only see the original characters. */
 .tome-log-src[data-ruby]{padding-top:.42em;line-height:max(var(--log-lh,1.75),2.15)}
 .tome-log-rb{position:relative}
 .tome-log-rb::before{content:attr(data-reading);position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:-.28em;white-space:nowrap;font:400 .55em/1 var(--tomoyo-ruby-font,var(--log-jp-font));letter-spacing:0;color:color-mix(in srgb,var(--theme-text,#eee) 78%,transparent);pointer-events:none;user-select:none}
 .tome-backlog[data-open]{will-change:scale,opacity;animation:tome-log-in .22s cubic-bezier(.16,1,.3,1) both} .tome-backlog[data-open][data-shown]{will-change:auto;animation:none}
 .tome-backlog[data-leaving]{pointer-events:none;will-change:scale,opacity;animation:tome-log-out .17s cubic-bezier(.5,0,.75,0) both}
 .tome-backlog[data-open]>*{animation:tome-log-content .3s cubic-bezier(.3,0,.2,1) both}
 @keyframes tome-log-in{from{scale:.97;opacity:0}to{scale:1;opacity:1}}
 @keyframes tome-log-out{from{scale:1;opacity:1}to{scale:.97;opacity:0}}
 @keyframes tome-log-content{from{opacity:0}35%{opacity:0}to{opacity:1}}
 .tome-backlog header{display:flex;align-items:center;gap:12px;padding:18px 16px 14px 24px;flex:none}
 .tome-log-heading{display:flex;flex-direction:column;gap:1px;min-width:0}
 .tome-log-heading span{font:700 10px/1.2 Consolas,"Cascadia Mono",monospace;letter-spacing:.32em;color:var(--log-accent)}
 .tome-log-heading h3{margin:0;font-size:19px;font-weight:700;letter-spacing:.05em;line-height:1.35}
 .tome-log-count{align-self:flex-end;margin-bottom:3px;font-size:11.5px;color:var(--theme-textSecondary,#999);white-space:nowrap}
 .tome-log-search{flex:1;display:flex;justify-content:flex-end;min-width:0}
 .tome-log-search input{width:min(240px,100%);height:32px;box-sizing:border-box;padding:0 12px 0 30px;border-radius:9px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 11%,transparent);background:color-mix(in srgb,var(--theme-text,#eee) 4%,transparent) no-repeat 10px 50%/13px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E");color:inherit;font:inherit;font-size:12.5px;outline:none;transition:border-color .15s,width .2s}
 .tome-log-search input:focus{border-color:var(--log-accent)}
 .tome-backlog header button{all:unset;flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:9px;cursor:pointer;color:var(--theme-textSecondary,#aaa);transition:background .12s,color .12s}
 .tome-backlog header button:hover{background:color-mix(in srgb,var(--theme-text,#eee) 8%,transparent);color:var(--theme-text,#eee)}
 .tome-backlog svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
 .tome-backlog .tome-log-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 14px 18px;border-top:1px solid color-mix(in srgb,var(--theme-text,#eee) 7%,transparent);scrollbar-width:auto!important;scrollbar-color:auto!important;mask-image:linear-gradient(transparent 0,#000 14px)}
 .tome-backlog .tome-log-list::-webkit-scrollbar{display:block!important;width:10px!important;background:transparent!important}
 .tome-backlog .tome-log-list::-webkit-scrollbar-track,.tome-backlog .tome-log-list::-webkit-scrollbar-corner{background:transparent!important;border:0!important;box-shadow:none!important}
 .tome-backlog .tome-log-list::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--theme-text,#eee) 24%,transparent)!important;border:3px solid transparent!important;background-clip:padding-box!important;border-radius:12px!important;min-height:36px;box-shadow:none!important}
 .tome-backlog .tome-log-list::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--log-accent) 65%,transparent)!important}
 .tome-backlog .tome-log-list::-webkit-scrollbar-button{display:none!important;width:0!important;height:0!important}
 .tome-log-item{position:relative;display:grid;grid-template-columns:var(--log-name-w,92px) 1fr;column-gap:16px;padding:14px 64px 14px 14px;border-radius:12px;transition:background .15s}
 :is(.tome-backlog,.tome-log-preview)[data-no-name] .tome-log-item{grid-template-columns:1fr}
 :is(.tome-backlog,.tome-log-preview)[data-no-name] .tome-log-name{display:none}
 :is(.tome-backlog,.tome-log-preview)[data-compact] .tome-log-item{padding-top:8px;padding-bottom:8px}
 .tome-log-item+.tome-log-item::after{content:"";position:absolute;left:14px;right:14px;top:0;height:1px;background:color-mix(in srgb,var(--theme-text,#eee) 5%,transparent)}
 .tome-log-item:hover{background:color-mix(in srgb,var(--theme-text,#eee) 4%,transparent)}
 .tome-log-item:hover::after,.tome-log-item:hover+.tome-log-item::after{opacity:0}
 .tome-log-item[data-latest]{background:linear-gradient(90deg,color-mix(in srgb,var(--log-accent) 13%,transparent),color-mix(in srgb,var(--log-accent) 3%,transparent))}
 .tome-log-item[data-latest]::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:0 3px 3px 0;background:var(--log-accent);box-shadow:0 0 10px var(--log-accent)}
 .tome-log-name{padding-top:calc((var(--log-jp-size,18px) * var(--log-lh,1.75) - 22px) / 2);text-align:right;min-width:0}
 .tome-log-name b{display:inline-block;max-width:100%;padding:1px 9px;border-radius:6px;background:color-mix(in srgb,var(--log-accent) 16%,transparent);color:color-mix(in srgb,var(--log-accent) 70%,var(--theme-text,#eee));font:700 12.5px/20px var(--log-jp-font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .tome-log-name i{font-style:normal;font-size:11px;line-height:22px;color:color-mix(in srgb,var(--theme-text,#eee) 32%,transparent)}
 .tome-log-body{min-width:0}
 .tome-log-src{font-family:var(--log-jp-font);font-size:var(--log-jp-size,18px);line-height:var(--log-lh,1.75);white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;color:var(--theme-text,#eee)}
 body:has(.tome-backlog[data-open]) .tomoyo-selection-card{z-index:2147482600!important}
 .tome-log-tr{margin-top:5px;padding-left:12px;border-left:2px solid color-mix(in srgb,var(--log-accent) 45%,transparent);font-family:var(--log-cn-font);font-size:var(--log-tr-size,14.5px);line-height:calc(var(--log-lh,1.75) - .05);white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;color:color-mix(in srgb,var(--theme-text,#eee) 72%,transparent)}
 :is(.tome-backlog,.tome-log-preview)[data-no-tr] .tome-log-tr{display:none}
 .tome-log-tr[data-missing]{border-left-color:color-mix(in srgb,var(--theme-text,#eee) 14%,transparent);font-size:12px;opacity:.6}
 .tome-log-time{position:absolute;right:16px;top:15px;font:11px/1.4 Consolas,"Cascadia Mono",monospace;color:color-mix(in srgb,var(--theme-text,#eee) 36%,transparent);display:none}
 :is(.tome-backlog,.tome-log-preview)[data-time] .tome-log-time{display:block}
 .tome-log-actions{position:absolute;right:10px;top:10px;display:flex;gap:2px;opacity:0;transition:opacity .12s}
 .tome-log-item:hover .tome-log-actions{opacity:1}
 :is(.tome-backlog,.tome-log-preview)[data-time] .tome-log-item:hover .tome-log-time{opacity:0}
 .tome-log-actions button{all:unset;display:grid;place-items:center;width:26px;height:26px;border-radius:8px;cursor:pointer;color:var(--theme-textSecondary,#999)}
 .tome-log-actions button:hover{background:color-mix(in srgb,var(--theme-text,#eee) 9%,transparent);color:var(--theme-text,#eee)}
 .tome-log-actions button[data-done]{color:#3ddc7a}
 .tome-log-actions svg{width:14px;height:14px}
 .tome-log-break{display:flex;align-items:center;gap:12px;margin:14px 14px 4px;font:11px/1 Consolas,"Cascadia Mono",monospace;letter-spacing:.08em;color:color-mix(in srgb,var(--theme-text,#eee) 38%,transparent)}
 .tome-log-break::before,.tome-log-break::after{content:"";flex:1;height:1px;background:color-mix(in srgb,var(--theme-text,#eee) 9%,transparent)}
 .tome-log-hit{background:color-mix(in srgb,var(--log-accent) 35%,transparent);color:inherit;border-radius:3px;padding:0 1px}
 .tome-log-empty{padding:56px 20px;text-align:center;color:var(--theme-textSecondary,#999);font-size:13px}
 .tome-backlog footer{flex:none;padding:8px 24px 12px;font-size:11px;color:color-mix(in srgb,var(--theme-text,#eee) 38%,transparent);border-top:1px solid color-mix(in srgb,var(--theme-text,#eee) 6%,transparent)}
 .tomoyo-menu-header .tome-menu-close{all:unset;position:absolute;right:22px;top:18px;padding:4px 10px;border-radius:8px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 14%,transparent);font:400 20px/1 Consolas,"Cascadia Mono",monospace;letter-spacing:.08em;color:var(--theme-textSecondary,#aaa);cursor:pointer}
 .tomoyo-menu-header .tome-menu-close:hover,.tomoyo-cn-dialog[data-log-page] .tomoyo-menu-header .tome-menu-close{color:var(--theme-primary,#e0495a);border-color:var(--theme-primary,#e0495a)}
 .tomoyo-menu-header{position:relative}
 .tome-log-settings .tome-log-preview{--log-accent:var(--theme-primary,#e0495a);position:relative;margin:4px 0 14px;color:var(--theme-text,#e8e9ec);border-radius:12px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 9%,transparent);background:color-mix(in srgb,var(--theme-background,#111) 55%,transparent);overflow:hidden}
 .tome-log-settings .tome-log-preview .tome-log-item{padding-right:14px}
 .tome-log-settings .tome-log-preview .tome-log-actions{display:none}
 .tome-log-settings .tome-log-row{display:flex;align-items:center;gap:10px;margin:0 0 12px}
 .tome-log-settings .tome-log-row>span{flex:none;width:96px;font-size:13px}
 .tome-log-settings .tome-log-row>select,.tome-log-settings .tome-log-row>input[type=range]{flex:1;min-width:0}
 .tome-log-settings .tome-log-row output{flex:none;min-width:42px;text-align:right;font:600 11.5px/1.6 Consolas,"Cascadia Mono",monospace;color:var(--theme-primary,#e0495a)}
 .tome-log-settings .tome-log-row small{flex:none;color:var(--theme-textSecondary,#999);font-size:11px}
 .tome-log-settings .tome-log-toggles{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin:0 0 12px}
 .tome-log-settings .tome-log-toggles label{display:flex;align-items:center;gap:8px;font-size:13px;margin:0}
 .tome-log-settings .tome-log-actions-row{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 4px}
 .tome-log-settings h4{margin:18px 0 10px!important}
 .tome-log-settings .tome-log-open-big{display:inline-flex!important;align-items:center;gap:8px;width:auto!important;white-space:nowrap;padding:0 16px!important;height:36px}
 .tome-log-settings svg{flex:none;width:16px;height:16px;fill:none!important;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
 .tome-log-settings .tome-log-preview{--log-name-w:52px}
 .tome-log-settings .tome-log-preview .tome-log-item{column-gap:12px;padding-left:8px}
 @media (prefers-reduced-motion: reduce){.tome-backlog[data-open],.tome-backlog[data-leaving]{animation-duration:1ms}}`;
 document.head.append(style);

 let panel=null,query='',pageSize=20,refresh=0;
 const earlier=()=>({zh:'加载更早的记录',ja:'以前のログを表示',en:'Load older lines'})[window.__tomeI18n?.get?.()||'zh']||'Load older lines';
 function refreshLog(){if(!panel||refresh)return;refresh=requestAnimationFrame(()=>{refresh=0;if(panel)render();});}
 const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
 const svg=d=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>';
 const ICON={close:'<path d="M6 6l12 12M18 6 6 18"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',copyTr:'<path d="M4 5h7M7.5 3v2M5.5 5c.5 3 2.5 5 5 6M10 5c-.5 3-2.5 5.5-5.5 6.5"/><path d="m13 21 4-10 4 10M14.5 17.5h5"/>'};
 const pad=n=>String(n).padStart(2,'0');const clock=at=>{const d=new Date(at);return pad(d.getHours())+':'+pad(d.getMinutes());};
 // Without a search the original is laid out as char tokens, so selecting a word opens the same local lookup card.
 function highlight(node,text){node.textContent='';if(!query){if(node.classList.contains('tome-log-src'))node.append(...[...text].map((c,i)=>{const span=document.createElement('span');span.className='char-token';span.dataset.index=String(i);span.textContent=c;return span;}));else node.textContent=text;return;}const lower=text.toLowerCase(),q=query.toLowerCase();let i=0,j;while((j=lower.indexOf(q,i))>=0){node.append(text.slice(i,j));const m=document.createElement('mark');m.className='tome-log-hit';m.textContent=text.slice(j,j+q.length);node.append(m);i=j+q.length;}node.append(text.slice(i));}
 function item(entry,latest,sample){const s=split(entry.src);if(!s.name&&entry.name)s.name=entry.name;const it=document.createElement('div');it.className='tome-log-item';if(latest)it.dataset.latest='';
  const name=document.createElement('div');name.className='tome-log-name';if(s.name){const n=document.createElement('b');n.textContent=s.name;n.title=s.name;name.append(n);}else{const n=document.createElement('i');n.textContent=t('narration');name.append(n);}
  const body=document.createElement('div');body.className='tome-log-body';const src=document.createElement('div');src.className='tome-log-src';src.lang='ja';src.__logText=s.text;highlight(src,s.text);const tr=document.createElement('div');tr.className='tome-log-tr';
  if(entry.tr)highlight(tr,entry.tr);else if(entry.trElsewhere)tr.hidden=true;else{tr.dataset.missing='';tr.textContent=latest&&!sample&&b.isEnabled?.()?t('pending'):t('none');}body.append(src,tr);
  const time=document.createElement('div');time.className='tome-log-time';time.textContent=clock(entry.at||Date.now());
  const actions=document.createElement('div');actions.className='tome-log-actions';const btn=(icon,title,text)=>{const x=document.createElement('button');x.type='button';x.title=title;x.innerHTML=svg(ICON[icon]);x.onclick=()=>{try{navigator.clipboard.writeText(text);x.dataset.done='';x.title=t('copied');setTimeout(()=>{delete x.dataset.done;x.title=title;},1200);}catch{}};return x;};
  actions.append(btn('copy',t('copy'),entry.src));if(entry.tr)actions.append(btn('copyTr',t('copyTr'),entry.tr));
  it.append(name,body,time,actions);return it;}
 // Past lines get the same furigana as the current line (gal.js rubyAnnotations: game ruby, then whole dictionary
 // words, E138) as they scroll into view, so a long log is never tokenized all at once.
 const rubyCache=new Map();let rubyObserver=null;
 function annotate(src){const text=src.__logText;if(!text||query||!b.rubyAnnotations)return;
  const apply=list=>{if(!src.isConnected||src.__logText!==text||query||!Array.isArray(list)||src.hasAttribute('data-ruby'))return;const box=src.closest('.tome-log-list'),end=!!box&&box.scrollHeight-box.scrollTop-box.clientHeight<40,chars=[...src.querySelectorAll('.char-token')];let added=0;
   for(const a of list){const run=chars.slice(a.start,a.end);if(!a.reading||!run.length||run.length!==a.end-a.start||run.some(c=>c.parentNode!==src))continue;const rb=document.createElement('span');rb.className='tome-log-rb';rb.dataset.reading=a.reading;run[0].before(rb);rb.append(...run);added++;}
   if(added)src.setAttribute('data-ruby','');if(end)box.scrollTop=box.scrollHeight;};
  if(rubyCache.has(text)){apply(rubyCache.get(text));return;}
  b.rubyAnnotations(text).then(list=>{if(Array.isArray(list)){rubyCache.set(text,list);if(rubyCache.size>600)rubyCache.delete(rubyCache.keys().next().value);}apply(list);}).catch(()=>{});}
 function watchRuby(list){rubyObserver?.disconnect();rubyObserver=null;if(query||!b.rubyAnnotations)return;
  if(typeof IntersectionObserver!=='function'){for(const src of list.querySelectorAll('.tome-log-src'))annotate(src);return;}
  const observer=rubyObserver=new IntersectionObserver(seen=>{for(const e of seen)if(e.isIntersecting){observer.unobserve(e.target);annotate(e.target);}},{root:list,rootMargin:'400px 0px'});
  for(const src of list.querySelectorAll('.tome-log-src'))observer.observe(src);}

 // ── Place: opens in the middle of the game window and follows it ─────────────────────────────────────────────────
 // While bound the overlay spans the whole desktop (GalWindowBridge), so centring in the page put the log in the
 // middle of the monitor. The game client comes from the bridge layout (physical px, relative to the overlay).
 // A dragged log keeps its offset from the game's middle, so it moves with the game window like the reading text.
 const POSITION='tome-log-position';
 let offset={x:0,y:0};try{const o=JSON.parse(localStorage.getItem(POSITION)||'null');if(o&&Number.isFinite(o.x)&&Number.isFinite(o.y))offset={x:o.x,y:o.y};}catch{}
 function gameArea(){const l=document.body.classList.contains('tomoyo-gal-bound')?b.galLayoutInfo?.():null,dpr=Math.max(.5,Number(window.devicePixelRatio)||1);
  if(l&&[l.clientX,l.clientY,l.clientWidth,l.clientHeight].every(Number.isFinite)&&l.clientWidth>0&&l.clientHeight>0)return {x:l.clientX/dpr,y:l.clientY/dpr,width:l.clientWidth/dpr,height:l.clientHeight/dpr};
  return {x:0,y:0,width:innerWidth,height:innerHeight};}
 const fit=(x,y,w,h)=>({x:Math.round(Math.max(4,Math.min(Math.max(4,innerWidth-w-4),x))),y:Math.round(Math.max(4,Math.min(Math.max(4,innerHeight-h-4),y)))});
 function placePanel(node=panel){if(!node||node.classList.contains('tome-log-dragging'))return null;const a=gameArea(),s=node.style;
  // Height is a share of the game window (the setting says "of window"), not of the desktop-wide overlay.
  s.setProperty('--log-h',Math.round(a.height*cfg.height/100)+'px');s.setProperty('--log-max-w',Math.max(320,Math.min(a.width,innerWidth)-32)+'px');
  const w=node.offsetWidth,h=node.offsetHeight,p=fit(a.x+a.width/2+offset.x-w/2,a.y+a.height/2+offset.y-h/2,w,h);
  for(const [k,v] of [['left',p.x+'px'],['top',p.y+'px'],['right','auto'],['bottom','auto'],['margin','0']])s.setProperty(k,v);return p;}
 // Dragged by its header like the Alt+T menu: a GPU transform while the pointer is down (no relayout and no window
 // region per event; "tome-menu-dragging" makes interaction.js hold one whole-surface region), the place on release.
 function installDrag(node){const header=node.querySelector('header');
  header.addEventListener('pointerdown',down=>{if(down.button!==0||down.target.closest('button,input,select,a'))return;down.preventDefault();try{header.setPointerCapture(down.pointerId);}catch{}
   const start={x:node.offsetLeft,y:node.offsetTop},w=node.offsetWidth,h=node.offsetHeight;let pos=start,frame=0,last=down;node.classList.add('tome-menu-dragging','tome-log-dragging');
   const paint=()=>{frame=0;pos=fit(start.x+last.clientX-down.clientX,start.y+last.clientY-down.clientY,w,h);node.style.transform='translate3d('+(pos.x-start.x)+'px,'+(pos.y-start.y)+'px,0)';};
   const move=e=>{last=e.getCoalescedEvents?.().at(-1)||e;if(!frame)frame=requestAnimationFrame(paint);};
   const up=()=>{header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',up);header.removeEventListener('pointercancel',up);if(frame){cancelAnimationFrame(frame);paint();}
    node.style.removeProperty('transform');node.style.left=pos.x+'px';node.style.top=pos.y+'px';node.classList.remove('tome-menu-dragging','tome-log-dragging');
    const a=gameArea();offset={x:Math.round(pos.x+w/2-(a.x+a.width/2)),y:Math.round(pos.y+h/2-(a.y+a.height/2))};try{localStorage.setItem(POSITION,JSON.stringify(offset));}catch{}requestAnimationFrame(()=>window.__tomoyoHitRegionsRefresh?.(true));};
   header.addEventListener('pointermove',move);header.addEventListener('pointerup',up);header.addEventListener('pointercancel',up);});
  // Double-click on the header: back to the middle of the game window.
  header.addEventListener('dblclick',e=>{if(e.target.closest('button,input'))return;offset={x:0,y:0};try{localStorage.removeItem(POSITION);}catch{}placePanel(node);});}
 function render(){if(!panel)return;applyVars(panel);placePanel();const list=panel.querySelector('.tome-log-list'),atEnd=list.scrollHeight-list.scrollTop-list.clientHeight<40;
  panel.querySelector('h3').textContent=t('title');panel.querySelector('.tome-log-count').textContent=t('count',{n:entries.length});panel.querySelector('footer').textContent=t('hint');
  const search=panel.querySelector('.tome-log-search input');search.placeholder=t('search');for(const [k,sel] of [['close','[data-close]'],['settings','[data-settings]']]){const x=panel.querySelector(sel);x.title=t(k);x.setAttribute('aria-label',t(k));}
  list.replaceChildren();const q=query.toLowerCase(),matched=entries.map((e,i)=>[e,i]).filter(([e])=>!q||e.src.toLowerCase().includes(q)||String(e.tr).toLowerCase().includes(q)),shown=matched.slice(-pageSize);
  if(matched.length>shown.length){const more=document.createElement('button');more.type='button';more.textContent=earlier();more.onclick=()=>{const previous=list.scrollHeight;pageSize+=40;render();list.scrollTop=Math.max(0,list.scrollHeight-previous);};list.append(more);}
  if(!shown.length){const e=document.createElement('div');e.className='tome-log-empty';e.textContent=entries.length?t('noMatch',{q:query}):t('empty');list.append(e);return;}
  let prev=0;for(const [entry,i] of shown){if(entry.at&&(!prev||entry.at-prev>10*60*1000)){const br=document.createElement('div');br.className='tome-log-break';const d=new Date(entry.at);br.textContent=(prev?'':(d.getMonth()+1)+'/'+d.getDate()+' ')+clock(entry.at);list.append(br);}prev=entry.at||prev;for(const [piece,last] of pieces(entry))list.append(item(piece,last&&i===entries.length-1));}
  if(atEnd||!panel.dataset.rendered||query){list.scrollTop=list.scrollHeight;panel.dataset.rendered='1';}
  watchRuby(list);
 }
 function menuOpen(){return !!document.querySelector('.tomoyo-cn-dialog[open]');}
 function open(){
  if(panel)return;for(const ghost of document.querySelectorAll('.tome-backlog[data-leaving]'))ghost.remove();query='';pageSize=20;
  panel=document.createElement('section');panel.className='tome-backlog';panel.dataset.noI18n='';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.tabIndex=-1;
  panel.innerHTML='<header><div class="tome-log-heading"><span>BACKLOG</span><h3></h3></div><div class="tome-log-count"></div><div class="tome-log-search"><input type="search" spellcheck="false"></div><button type="button" data-settings>'+svg(ICON.gear)+'</button><button type="button" data-close>'+svg(ICON.close)+'</button></header><div class="tome-log-list"></div><footer></footer>';
  followLayout();installDrag(panel);panel.querySelector('[data-close]').onclick=close;panel.querySelector('[data-settings]').onclick=()=>{close();openSettings();};
  const search=panel.querySelector('.tome-log-search input');let timer=0;search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{query=search.value.trim();pageSize=20;render();},120);});
  panel.addEventListener('contextmenu',e=>{if(e.target.closest('input'))return;e.preventDefault();close();});
  const list=panel.querySelector('.tome-log-list');
  // The log stays open at either edge; wheel momentum must never fall through to the game.
  const opening=panel;opening.style.opacity='0';document.body.append(opening);opening.setAttribute('data-open','');opening.style.animation='none';send({type:'galMenu',open:true});render();window.__tomeWaitForSurface(opening,()=>{if(panel!==opening)return;opening.style.removeProperty('opacity');opening.style.removeProperty('animation');opening.focus({preventScroll:true});settle(opening);},220);
 }
 // The open animation always ends in the final state (user, 2026-11-14: on beta38 the log stayed a 70 px translucent strip
 // with squashed rows: the 推镜 GSAP push on the same element read the running keyframe scale, baked it into an inline
 // transform and left it there). On animationend (or 400 ms) the panel drops the animation and any inline transform.
 function settle(node){let done=false;const end=()=>{if(done||panel!==node)return;done=true;node.removeEventListener('animationend',onEnd);
   if(!node.classList.contains('tome-log-dragging'))for(const k of ['transform','scale','translate','rotate'])node.style.removeProperty(k);
   node.setAttribute('data-shown','');window.__tomoyoHitRegionsRefresh?.(true);};
  const onEnd=e=>{if(e.target===node)end();};node.addEventListener('animationend',onEnd);setTimeout(end,400);}
 function close(){if(!panel)return;const old=panel;panel=null;rubyObserver?.disconnect();rubyObserver=null;old.removeAttribute('data-open');old.setAttribute('data-leaving','');let gone=false;const finish=()=>{if(gone)return;gone=true;old.remove();if(!panel&&!menuOpen())send({type:'galMenu',open:false});};old.addEventListener('animationend',e=>{if(e.target===old)finish();});setTimeout(finish,320);}
 b.openBacklog=open;b.closeBacklog=close;b.toggleBacklog=()=>panel?close():open();
 // The game window moved or resized (new bridge layout) or the overlay changed size: keep the log on the game.
 // Wrapped again on open in case gal.js installed its handler after this script.
 function followLayout(){const layout=b.galLayout;if(typeof layout!=='function'||layout.logFollows)return;const wrapped=l=>{const r=layout(l);placePanel();return r;};wrapped.logFollows=true;b.galLayout=wrapped;}
 followLayout();addEventListener('resize',()=>placePanel());
 // Wheel up over the line opens the log (Tomoyo's own wheel history only flips the Japanese line, without translation).
 // While the log is open it scrolls the wheel that lands on it or on the game/text (momentum never falls through), but
 // never one over another panel: with the Alt+T menu open beside it, the menu has to scroll under the pointer.
 const OTHER_PANELS='.tomoyo-cn-dialog,.tomoyo-selection-card,.lookup-tooltip,.mg-select-pop,.tome-color-panel';
 document.addEventListener('wheel',e=>{if(panel){if(!e.target?.closest?.('.tome-backlog')&&e.target?.closest?.(OTHER_PANELS))return;e.preventDefault();e.stopImmediatePropagation();const list=panel.querySelector('.tome-log-list');list.scrollTop+=e.deltaY*(e.deltaMode===1?24:e.deltaMode===2?list.clientHeight:1);return;}if(!cfg.wheel||e.deltaY>=0||e.ctrlKey)return;const win=e.target?.closest?.('.sentence-window');if(!win||e.target.closest('.lookup-tooltip,.tomoyo-selection-card,.tomoyo-cn-dialog'))return;e.preventDefault();e.stopImmediatePropagation();open();},{capture:true,passive:false});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel){if(e.target?.closest?.('.tome-log-search input')&&e.target.value){e.target.value='';query='';render();e.preventDefault();e.stopImmediatePropagation();return;}e.preventDefault();e.stopImmediatePropagation();close();return;}
  if(cfg.keyL&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.repeat&&(e.key==='l'||e.key==='L')&&!e.target?.closest?.('input,textarea,select,[contenteditable]')&&document.body.classList.contains('tomoyo-ui-translation')){e.preventDefault();b.toggleBacklog();}},true);

 // ── The 记录 page of the Alt+T menu: preview and every LOG option ───────────────────────────────────────────────
 function openSettings(){if(!menuOpen())b.openSettings?.();let n=0;const go=()=>{const tab=document.querySelector('.tomoyo-cn-dialog[open] [data-menu-key=log]');if(tab){tab.click();return;}if(++n<40)setTimeout(go,50);};go();}
 b.openBacklogSettings=openSettings;
 function settingsPage(host){
  const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x;};
  const box=el('section','tome-log-settings');box.dataset.noI18n='';const h=el('h4',null,t('page'));const note=el('small',null,t('pageNote'));
  const openBtn=el('button','tome-log-open-big');openBtn.type='button';openBtn.innerHTML=svg('<path d="M5 4h11l3 3v13H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5"/>');openBtn.append(t('open'));openBtn.onclick=()=>{b.closeSettingsMenu?.();const d=document.querySelector('.tomoyo-cn-dialog[open]');d?.dispatchEvent(new Event('cancel',{cancelable:true}));setTimeout(open,200);};
  const preview=el('div','tome-log-preview');
  const pv=el('div','tome-log-list');pv.style.cssText='border-top:0;mask-image:none;overflow:visible;padding:6px';preview.append(pv);
  const drawPreview=()=>{applyVars(preview);pv.replaceChildren(item({src:t('sampleName')+'\n'+t('sampleSrc'),tr:t('sampleTr'),at:Date.now()-60000},false,true),item({src:t('sampleSrc2'),tr:t('sampleTr2'),at:Date.now()},true,true));};
  const changed=()=>{saveCfg();drawPreview();if(panel)render();};
  const fontSelect=kind=>{const s=el('select');const cur=firstFamily(rootVar(kind==='jp'?'--tomoyo-gal-jp-font':'--tomoyo-gal-cn-font'));
   s.add(new Option((kind==='jp'?t('followGame'):t('followCn'))+'（'+t('current',{f:cur})+'）','game'));s.add(new Option(t('followJp'),kind==='jp'?'cn':'jp'));
   if(kind==='jp')s.options[1].text=t('followCn');for(const f of fontChoices())s.add(new Option(f,f));const v=kind==='jp'?cfg.jpFont:cfg.cnFont;if(![...s.options].some(o=>o.value===v))s.add(new Option(v,v));s.value=v;
   s.onchange=()=>{if(kind==='jp')cfg.jpFont=s.value;else cfg.cnFont=s.value;changed();};return s;};
  const row=(label,control,extra)=>{const r=el('label','tome-log-row');r.append(el('span',null,label),control);if(extra)r.append(extra);return r;};
  const range=(key,min,max,step,fmt)=>{const i=el('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=cfg[key];const o=el('output');const show=()=>{o.textContent=fmt(Number(i.value));};show();i.oninput=()=>{cfg[key]=Number(i.value);show();changed();};return [i,o];};
  const toggle=(key,label)=>{const l=el('label');const c=el('input');c.type='checkbox';c.checked=!!cfg[key];c.onchange=()=>{cfg[key]=c.checked;if(key==='keep')persist();changed();};l.append(c,label);return l;};
  const toggles=(...items)=>{const g=el('div','tome-log-toggles');g.append(...items);return g;};
  const [jpSize,jpOut]=range('jpSize',12,30,.5,v=>v+'px'),[trSize,trOut]=range('trSize',10,26,.5,v=>v+'px'),[lh,lhOut]=range('lineHeight',1.3,2.4,.05,v=>v.toFixed(2));
  const [width,wOut]=range('width',520,1400,10,v=>v+'px'),[height,hOut]=range('height',40,100,1,v=>v+'%'),[opacity,oOut]=range('opacity',50,100,1,v=>v+'%');
  const max=el('select');for(const n of [100,300,500,1000,2000])max.add(new Option(String(n),String(n)));max.value=String(cfg.max);max.onchange=()=>{cfg.max=Number(max.value);if(entries.length>cfg.max){entries.splice(0,entries.length-cfg.max);persist();}changed();};
  const actions=el('div','tome-log-actions-row'),copyAll=el('button',null,t('copyAll')),clear=el('button',null,t('clear'));copyAll.type=clear.type='button';
  copyAll.onclick=()=>{const text=entries.map(e=>{const s=split(e.src);if(!s.name&&e.name)s.name=e.name;return (s.name?s.name+'：':'')+s.text+(e.tr?'\n'+e.tr:'');}).join('\n\n');try{navigator.clipboard.writeText(text);copyAll.textContent=t('copied');setTimeout(()=>{copyAll.textContent=t('copyAll');},1400);}catch{}};
  let armed=0;clear.onclick=()=>{if(Date.now()-armed>3000){armed=Date.now();clear.textContent=t('confirmClear');setTimeout(()=>{clear.textContent=t('clear');},3000);return;}entries=[];persist();clear.textContent=t('cleared');if(panel)render();};
  actions.append(copyAll,clear);
  box.append(h,note,openBtn,el('h4',null,t('preview')),preview,
   el('h4',null,t('fonts')),row(t('jpFont'),fontSelect('jp')),row(t('cnFont'),fontSelect('cn')),row(t('jpSize'),jpSize,jpOut),row(t('trSize'),trSize,trOut),row(t('lineHeight'),lh,lhOut),
   el('h4',null,t('display')),toggles(toggle('showTr',t('showTr')),toggle('showName',t('showName')),toggle('showTime',t('showTime')),toggle('compact',t('compact'))),
   el('h4',null,t('panel')),row(t('width'),width,wOut),row(t('height'),height,hOut),row(t('opacity'),opacity,oOut),
   el('h4',null,t('keeping')),toggles(toggle('keep',t('keep')),toggle('wheel',t('wheel')),toggle('keyL',t('keyL'))),row(t('max'),max),actions);
  host.replaceChildren(box);drawPreview();
 }
 // A LOG button in the Alt+T menu header opens this page; the page is (re)built whenever the menu is.
 function decorate(){const dialog=document.querySelector('.tomoyo-cn-dialog:not([data-leaving])');if(!dialog)return;const header=dialog.querySelector('.tomoyo-menu-header');
  if(header&&!header.querySelector('.tome-menu-close')){const btn=document.createElement('button');btn.type='button';btn.className='tome-menu-close';btn.dataset.noI18n='';btn.textContent='×';btn.title=t('close');btn.setAttribute('aria-label',t('close'));btn.onclick=e=>{e.stopPropagation();dialog.dispatchEvent(new Event('cancel',{cancelable:true}));};header.append(btn);}
  const host=dialog.querySelector('[data-menu-category=log]');if(host&&!host.querySelector('.tome-log-settings'))settingsPage(host);
  const tab=dialog.querySelector('[data-menu-key=log]');dialog.toggleAttribute('data-log-page',tab?.getAttribute('aria-selected')==='true');}
 new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-selected']});decorate();
 addEventListener('tome-language-change',()=>{render();const host=document.querySelector('.tomoyo-cn-dialog[open] [data-menu-category=log]');if(host)settingsPage(host);});
 const status=b.galStatus;if(status)b.galStatus=m=>{status(m);if(m?.type==='backlogHotkey')b.toggleBacklog();if(m?.interfaceMode&&panel&&m.type==='interfaceMode')close();};
})();
