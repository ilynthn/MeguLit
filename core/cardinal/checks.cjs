// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal (2026-11-21): the reader-layer replay and its scoring. This file: the checks every game must pass, as pure functions of
   one replay run. They were the generic half of ファタモルガーナの館's acceptance (validation/fixtures/games/fata-morgana/
   acceptance.case.cjs, checks 1 2 3 4 5 8 9 10) and moved here unchanged, so the acceptance and the scores of every player's
   MeguLit measure the same thing; a game's own checks (ファタ 6 7 11 12) stay beside its seed.

   A run: {name, steps, o}
     steps  the timeline that was fed (core/cardinal/timeline.cjs): {t, hb|gwb|mark|page|choicePage, line?, text?, pageClear?}
     o      what services/cardinal/driver.cjs measured: samples (web/reader/replay-probe.js + hitRegions + at + mark/watch),
            hookEvents, hbSent, hookSpawned, choiceOffers, hidden, krkr ...
   Every check -> {bad:[messages], n:<units looked at>, ...counts}; nothing here reads a file, a clock or the profile:
   the thresholds come in as t (core/profiles/defaults.cjs cardinal.thresholds). */
const T0={settleMs:300,shownRate:0.9,stablePx:0,cnOverlapPx:2,lineMs:700,burstMs:300,calibGapMs:1000,calibWatchMs:2500,choiceMs:3000,staleChars:4,preflightMs:1500};
const JP=/[぀-ヿ㐀-鿿]/;
const norm=t=>String(t||'').replace(/[^぀-ヿ㐀-鿿]/g,'');
/* the Japanese glyphs the player sees on the reader (no UI, no Chinese rows, nothing unclassified) */
const jpGlyphs=s=>(s.glyphs||[]).filter(g=>JP.test(g.text)&&!['ui','zh'].includes(g.kind)&&!/[A-Za-z]{2}|[一-鿿]{2,}[，。：]/.test(g.text)&&g.kind!=='other');
const lineGlyphs=s=>jpGlyphs(s).filter(g=>g.kind==='line');
// Earlier rows on the same page are still clickable, but cannot complete the current source sentence.
const currentGlyphs=s=>lineGlyphs(s).filter(g=>!g.retained&&!/(?:^|\s)(?:megulit-old-line|tome-page-lines)(?:\s|$)/.test(g.parentCls||''));
const inside=(g,hits)=>(hits||[]).some(h=>{const cx=g.rect.x+g.rect.w/2,cy=g.rect.y+g.rect.h/2;return cx>=h.x-1&&cx<=h.x+h.width+1&&cy>=h.y-1&&cy<=h.y+h.height+1;});
const menuOpen=s=>String(s.body||'').includes('megulit-menu-open');
const opts=t=>({...T0,...(t||{})});
const fed=run=>(run.steps||[]).filter(st=>st.hb?.type==='hookSource');

/* the dialogue lines of a run: each hookSource with its first record, and the samples taken while it was the reader's line.
   A line counts once it is the reader's line for lineMs; lines of a skip burst (the next record within burstMs, Ctrl held) only pass by */
function expectedLines(run,t){t=opts(t);const steps=fed(run).filter(st=>st.line!=null);
 return steps.filter((st,i)=>norm(st.text)&&!(steps[i+1]&&steps[i+1].t-st.t<t.burstMs)&&!(i>0&&st.t-steps[i-1].t<t.burstMs));}
function deliveryClock(run){const records=run.o.sourceEpisodes;if(!Array.isArray(records))return {source:'legacy-source-transitions',reliable:false};
 const sent=(run.steps||[]).map((st,step)=>({st,step})).filter(x=>x.st.hb?.type==='hookSource');let previous=-Infinity;const seen=new Set();
 if(records.length!==sent.length)return {source:'invalid-delivery',reliable:false,why:'source delivery count mismatch'};
 for(let i=0;i<sent.length;i++){const {st,step}=sent[i],record=records[i];if(!record||record.step!==step||!Number.isInteger(record.line)||record.line!==st.line||seen.has(record.line)||!Number.isFinite(record.at)||record.at<0||record.at<previous||record.text!==st.hb.text)return {source:'invalid-delivery',reliable:false,why:'source delivery identity/order/text mismatch'};seen.add(record.line);previous=record.at;}
 return {source:'measured-delivery',reliable:true};}
function lines(run,t){t=opts(t);const o=run.o,steps=fed(run).filter(st=>st.line!=null),episodes=o.sourceEpisodes;
 const timeOf=st=>Array.isArray(episodes)?episodes.find(e=>e.line===st.line&&(e.step===undefined||e.step===(run.steps||[]).indexOf(st)))?.at:st.t;
 const all=(o.samples||[]).filter(s=>!menuOpen(s)),out=[];if(Array.isArray(episodes)&&!deliveryClock(run).reliable)return out;
 // Old observations have no replay delivery clock. Consume each observed source transition at most once.
 if(!Array.isArray(episodes)){const groups=[];for(const sample of all){const key=norm(sample.hookSource);if(groups.at(-1)?.key!==key)groups.push({key,samples:[]});groups.at(-1).samples.push(sample);}let cursor=0;
  for(const st of expectedLines(run,t)){const at=groups.findIndex((g,i)=>i>=cursor&&g.key===norm(st.text));if(at<0)continue;cursor=at+1;const samples=groups[at].samples;
   if(samples.at(-1).at-samples[0].at>=t.lineMs)out.push({line:st.line,text:st.text,t:st.t,from:samples[0].at,to:samples.at(-1).at,samples});}return out;}
 for(const st of expectedLines(run,t)){const index=steps.indexOf(st),next=steps[index+1],start=timeOf(st),end=next?timeOf(next):Infinity;
  const l={line:st.line,text:st.text,t:st.t,from:start,to:end,samples:[]};if(!Number.isFinite(start)||next&&!Number.isFinite(end))continue;
  let run2=[];for(const sample of all){if(sample.at<start||sample.at>=end)continue;
   if(norm(sample.hookSource)&&norm(sample.hookSource)===norm(l.text))run2.push(sample);
   else if(run2.length){if(run2.at(-1).at-run2[0].at>=t.lineMs)break;run2=[];}}
  if(run2.length&&run2.at(-1).at-run2[0].at>=t.lineMs){l.samples=run2;out.push(l);}}
 return out;}

/* per line: 1 the Japanese row is there and clickable, 2 it keeps its place (the Chinese under it, the row's y does not move),
   9 one render owner, and the pairing (a Chinese row while the Japanese is shown) */
function perLine(run,t){t=opts(t);const name=run.name||'run',row=[],stable=[],owner=[],dup=[],pairs={shown:0,paired:0},visibility={shown:0,expected:0},complete={lines:0};const ls=lines(run,t);
 for(const l of ls){const want=norm(l.text);if(!want)continue;let rowBad=false,stableBad=false;
  /* while options are on the reader the line gives way to them (not a missing row) */
  const settled=l.samples.filter(s=>s.at-l.samples[0].at>=t.settleMs&&!(s.choices||[]).some(c=>c.shown));const drawn=s=>norm(currentGlyphs(s).map(g=>g.text).join(''));const shown=settled.filter(s=>{const text=drawn(s);return text.length>=Math.min(want.length,2)&&want.startsWith(text);});
  l.complete=settled.some(s=>drawn(s)===want);if(l.complete)complete.lines++;else if(settled.length){row.push(name+' line '+l.line+' never completes the expected Japanese text');rowBad=true;}
  visibility.expected+=settled.length;visibility.shown+=shown.length;
  if(settled.length&&shown.length<settled.length*t.shownRate){row.push(name+' line '+l.line+' 「'+l.text+'」 Japanese shown in '+shown.length+'/'+settled.length+' samples');rowBad=true;}
  for(const s of shown){const g=lineGlyphs(s);const out=g.filter(x=>!inside(x,s.hitRegions)||x.pointer==='none');if(out.length){row.push(name+' line '+l.line+' not clickable: '+out.map(x=>x.text).join(''));rowBad=true;break;}}
  const withCn=shown.filter(s=>(s.cn||[]).length);if(withCn.length){const s=withCn[0],jpBottom=Math.max(...lineGlyphs(s).map(g=>g.rect.y+g.rect.h));const c0=s.cn[0],cnTop=c0.ink&&c0.fontSize?c0.ink.y+Math.max(0,(c0.ink.h-c0.fontSize)/2):(c0.ink||c0.rect).y;/* the Chinese glyphs' em box (web/reader/replay-probe.js: the text's content area, centred em of fontSize; a CJK font's content area is taller than its em), the row's padded box when a probe has neither */if(cnTop<jpBottom-t.cnOverlapPx){stable.push(name+' line '+l.line+' Chinese at '+cnTop+' over the Japanese bottom '+jpBottom);stableBad=true;}}
  const ys=[...new Set(shown.map(s=>Math.round(Math.min(...lineGlyphs(s).map(g=>g.rect.y)))))];if(ys.length>1&&Math.max(...ys)-Math.min(...ys)>t.stablePx){stable.push(name+' line '+l.line+' Japanese y moved: '+ys.join(','));stableBad=true;}
  for(const s of settled){const kinds=new Set(jpGlyphs(s).filter(g=>norm(g.text)&&want.includes(norm(g.text))).map(g=>g.kind));if(kinds.size>1){owner.push(name+' line '+l.line+' drawn by '+[...kinds].join('+'));break;}}
  /* drawn twice (owner: 禁止复读): the line's text appears more than once on the reader's rows */
  if(want.length>=2)for(const s of settled){const all=norm(lineGlyphs(s).map(g=>g.text).join(''));if(all.split(want).length-1>1){dup.push(name+' line '+l.line+' drawn twice: '+all.slice(0,30));l.dupBad=true;break;}}
  if(shown.length){pairs.shown++;if(withCn.length)pairs.paired++;}
  l.rowBad=rowBad;l.stableBad=stableBad;}
 return {lines:ls,row,stable,owner,dup,pairs,visibility,complete};}

/* 10 (owner 2026-11-21): no Japanese that cannot be clicked and read (the placement fallback layer passes clicks to the game) or is not
   in the line's colour; -> bad sample messages (all of them counted, the first ones kept) */
function white(run){const name=run.name||'run',bad=[];let n=0,badN=0;
 for(const s of run.o.samples||[]){n++;const lc=lineGlyphs(s)[0]?.color+'';const out=jpGlyphs(s).filter(g=>!inside(g,s.hitRegions)||g.kind==='extra'||g.pointer==='none'||(g.kind!=='choice'&&lc!=='undefined'&&g.color+''!==lc));
  if(out.length){badN++;if(bad.length<7)bad.push(name+' @'+s.at+' '+out.map(g=>g.kind+':'+g.text+'('+(g.color||[]).join('/')+')').join(' ').slice(0,200));}}
 return {bad,n,badN};}

/* 3 flashes: nothing from the orphan / glyph fallback (#megulit-place-extras), and a line the reader left never comes back */
function flashes(run){const name=run.name||'run',bad=[],seq=[];let extras=0;
 for(const s of run.o.samples||[]){if(jpGlyphs(s).some(g=>g.kind==='extra')){extras++;bad.push(name+' @'+s.at+' fallback drew '+jpGlyphs(s).filter(g=>g.kind==='extra').map(g=>g.text).join(''));}
  /* by the line the reader shows (its source), not by its typed-out prefix */const t=lineGlyphs(s).length?norm(s.hookSource):'';if(t&&seq.at(-1)!==t)seq.push(t);}
 const fedTexts=fed(run).map(st=>norm(st.text));let comebacks=0;
 for(let i=2;i<seq.length;i++){const j=seq.lastIndexOf(seq[i],i-2);if(j<0)continue;if(fedTexts.filter(x=>x===seq[i]).length>1)continue;/* the game said it twice */comebacks++;bad.push(name+' 「'+seq[i]+'」 came back after 「'+seq[i-1]+'」');}
 return {bad,extras,comebacks,samples:(run.o.samples||[]).length};}

/* 4: the hide is never given up (no disable, no probeHide off, no give way); -> {off, giveWay, firstAt (ms on the run's clock)} */
function hold(run){const o=run.o;const off=(o.hbSent||[]).filter(m=>m.type==='disable'||m.type==='probeHide'&&m.on===false),gw=(o.hookEvents||[]).filter(l=>/give way|gave way|giving way/i.test(l)&&!/no give way/i.test(l));
 const at=[...off.map(m=>m.at),...gw.map(l=>Date.parse(l.slice(0,24))-(o.t0||0))].filter(Number.isFinite);
 return {off:off.length,giveWay:gw.length,firstAt:at.length?Math.min(...at):null};}

/* 5: never read mode (core route, text-effects switch, the page's hide) */
const READ_MODE=/render mode switched in place \S+ -> read\b|text effects: .*read mode(?! not taken)|switched to read mode|read mode on/i;
function readMode(run){const name=run.name||'run',o=run.o,bad=[];let firstAt=null;
 for(const l of o.hookEvents||[])if(READ_MODE.test(l)){bad.push(name+': '+l.slice(25,140));const at=Date.parse(l.slice(0,24))-(o.t0||0);if(Number.isFinite(at)&&(firstAt==null||at<firstAt))firstAt=at;}
 const rs=(o.samples||[]).find(s=>s.hookHide===false&&s.hookProfile==='read'&&/megulit-read-mode|tome-read-mode/.test(s.body||''));
 if(rs){bad.push(name+': reader in read mode');if(firstAt==null||rs.at<firstAt)firstAt=rs.at;}
 return {bad,firstAt};}

/* 8: calibration: the Japanese stays (no gap over calibGapMs), the hook is not restarted, switched or released */
function calibration(run,t){t=opts(t);const o=run.o,cal=(o.samples||[]).find(s=>s.mark==='calibrate');const bad=[];
 if(!cal)return {bad:['no calibration step'],ran:false};
 const after=o.samples.filter(s=>s.watch&&s.at>=cal.at&&s.at<=cal.at+t.calibWatchMs&&!menuOpen(s));let gap=0,last=cal.at;
 for(const s of after){const has=lineGlyphs(s).length>0;if(has){gap=Math.max(gap,s.at-last);last=s.at;}}gap=Math.max(gap,(after.at(-1)?.at||cal.at)-last);if(gap>t.calibGapMs)bad.push('Japanese gone '+gap+' ms');
 if(o.hookSpawned>1)bad.push('hook restarted ('+o.hookSpawned+' starts)');if((o.hbSent||[]).some(m=>m.type==='disable'))bad.push('hide disabled');
 for(const l of o.hookEvents||[])if(/render mode switched|reselect|select id=|stream .*switched|hook reconnect/i.test(l)&&Date.parse(l.slice(0,24))-o.t0>=cal.at-50)bad.push(l.slice(25,120));
 return {bad,ran:true};}

/* clear / page change: once the game has cleared its page (a pageClear step between two lines: the timeline's click model or a
   tape's clear), the earlier line is gone from the reader; without a clear, an earlier line may stay only on its own row of a
   page (page.engineRows), never on the row of the line now shown. -> {bad, n (line changes looked at), stale} */
function clears(run,t,ls){t=opts(t);const name=run.name||'run',steps=run.steps||[],bad=[];ls=ls||lines(run,t);let n=0,stale=0;
 const cleared=(a,b)=>steps.some(st=>st.t>a&&st.t<=b&&(st.pageClear===true||st.clear===true));
 for(let k=1;k<ls.length;k++){const cur=ls[k],wantK=norm(cur.text);n++;let hit=null;
  const settled=cur.samples.filter(s=>s.at-cur.samples[0].at>=t.settleMs);
  /* the rows on screen (glyphs within 3 px of one y, read left to right); a row holds an earlier line when it contains the start of
     that line (staleChars, or the whole of a shorter one) and that start is not part of the line now shown */
  const head=old=>old.slice(0,Math.max(Math.min(t.staleChars,old.length),Math.min(old.length,6)));
  for(const s of settled){const g=jpGlyphs(s).filter(x=>x.kind==='line'||x.kind==='page');const rowsY=[...new Set(g.map(x=>Math.round(x.rect.y)))];
   const rowText=y=>norm(g.filter(x=>Math.abs(x.rect.y-y)<=3).sort((a,b)=>a.rect.x-b.rect.x).map(x=>x.text).join(''));
   for(const y of rowsY){const r=rowText(y);if(r.length<2)continue;const onCurrent=r.includes(wantK.slice(0,Math.min(wantK.length,6)));
    for(let j=k-1;j>=0;j--){const old=norm(ls[j].text),p=old&&head(old);if(!p||wantK.includes(p)||!r.includes(p))continue;
     if(cleared(ls[j].t,cur.t)||onCurrent){hit={j,y,r};break;}}
    if(hit)break;}
   if(hit)break;}
  if(hit){stale++;if(bad.length<6)bad.push(name+' line '+cur.line+' still shows 「'+ls[hit.j].text.slice(0,16)+'」 at y '+hit.y);}}
 return {bad,n,stale};}

/* 2026-11-26 (オルフレール cold run: both options ruled not clickable) where an option's click goes. Two designs, both clickable:
     MeguLit takes it   the option takes pointer input and lies in a capturing hit region (GalWindowBridge passes it to the reader)
     the game takes it  web/reader/modules/choice-overlay.js: ruby and translation over the game's own option, pointer-events none, its
                        box sent as a pass region (web/reader/modules/interaction.js, 2026-11-15) so the window lets the click
                        through to the game's button; it must not also lie in a capturing region, which would swallow the click
   An option with pointer none and no pass region, or with pointer input and no capturing region, reaches nothing it can act on */
const within=(rect,h)=>{const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2;return cx>=h.x-1&&cx<=h.x+h.width+1&&cy>=h.y-1&&cy<=h.y+h.height+1;};
function reaches(x,hits){const hs=Array.isArray(hits)?hits:[],capture=hs.filter(h=>h&&h.pass!==true),pass=hs.filter(h=>h&&h.pass===true);
 if(x.pointer!=='none')return capture.some(h=>within(x.rect,h));
 return pass.some(h=>within(x.rect,h))&&!capture.some(h=>within(x.rect,h));}
/* choices: every set of options core offered the reader (o.choiceOffers: a reader event with hookChoices) is visible and clickable
   within choiceMs, or the game draws them itself (a KiriKiri choice frame the script keeps: o.krkr.choice ui 'choice') */
function choices(run,t){t=opts(t);const name=run.name||'run',o=run.o,bad=[];let n=0,ok=0,unobserved=0;
 const textKey=value=>String(value??'').normalize('NFKC').replace(/\s+/g,'');
 /* 2026-11-26 an offer whose whole window fell while the reader page did not answer (core/cardinal/responsive.cjs) and has no sample:
    what the player saw is unknown; it is not counted and makes the choice observation unreliable (unanswered) */
 const quiet=require('./responsive.cjs').spans(o);let unanswered=0;
 for(const c of o.choiceOffers||[]){
  if(Number.isFinite(c?.at)&&!(o.samples||[]).some(s=>s.at>=c.at&&s.at<=Math.min(c.at+t.choiceMs,c.until??Infinity))&&require('./responsive.cjs').during(quiet,c.at,c.at+t.choiceMs)){unanswered++;if(bad.length<6)bad.push(name+' @'+c.at+' '+c.n+' options offered while the reader page did not answer (no sample): unobserved');continue;}
  n++;
  if(!Number.isSafeInteger(c.n)||c.n<1||!Number.isFinite(c.at)||c.until!=null&&(!Number.isFinite(c.until)||c.until<c.at)){bad.push(name+' invalid choice offer');unobserved++;continue;}
  const expected=Array.isArray(c.texts)?c.texts:null;
  if(expected&&(expected.length!==c.n||expected.some(text=>typeof text!=='string'||!textKey(text)))){bad.push(name+' invalid choice source texts');unobserved++;continue;}
  const w=(o.samples||[]).filter(s=>s.at>=c.at&&s.at<=Math.min(c.at+t.choiceMs,c.until??Infinity));let measured=false;
  const good=w.some(s=>{const sh=(s.choices||[]).filter(x=>x.shown);
   const observed=sh.length>0&&sh.every(x=>typeof x.translationRequired==='boolean'&&(!expected||typeof x.sourceText==='string'));
   if(observed)measured=true;if(sh.length!==c.n||!observed)return false;
   return sh.every((x,i)=>x.rect&&['x','y','w','h'].every(key=>Number.isFinite(x.rect[key]))&&x.rect.w>0&&x.rect.h>0&&reaches(x,s.hitRegions)&&(!expected||textKey(x.sourceText)===textKey(expected[i]))&&(!x.translationRequired||x.translationShown===true&&typeof x.translation==='string'&&!!x.translation.trim()));});
  if(!measured&&w.some(s=>(s.choices||[]).some(x=>x.shown)))unobserved++;
  if(good)ok++;else if(bad.length<6)bad.push(name+' @'+c.at+' '+c.n+' options not all visible, clickable, source-matched and translated when enabled');}
 /* the game's options were on screen (the window bridge found them: hook-events 'choice ocr found found=<n>', n >= 1; one choice's
    answers within choiceMs counted once) and the reader was never given any within choiceMs: options the player could not see.
    A locate that found nothing is not counted: core also asks about candidates that were never options (names, narration) */
 const offered=o.choiceOffers||[];let lastAsk=-Infinity;
 for(const l of o.hookEvents||[]){const m=/ choice ocr found found=[1-9]\d* boxes=(\[.*?\]) missed=/.exec(l);if(!m)continue;const at=Date.parse(String(l).slice(0,24))-(o.t0||0);if(!Number.isFinite(at)||at-lastAsk<t.choiceMs)continue;lastAsk=at;
  /* given to the reader within choiceMs, or still there from before (the bridge reports one choice again and again) */
  if(offered.some(c=>c.at<=at+t.choiceMs&&(c.until==null||c.until>=at-200)))continue;n++;if(bad.length<6)bad.push(name+' @'+at+' options '+m[1].slice(0,60)+' never reached the reader');}
 /* 2026-11-26 options the game's screen showed (o.screenChoices: the cold test's own OCR of the choice screen, core/cardinal/timeline.cjs
    screenRow), counted like the bridge's OCR above: given to the reader within choiceMs or still there from before, else unseen by the
    player. One already counted above within choiceMs is not counted twice */
 const asked=[];for(const l of o.hookEvents||[]){if(/ choice ocr found found=[1-9]/.test(l)){const at=Date.parse(String(l).slice(0,24))-(o.t0||0);if(Number.isFinite(at))asked.push(at);}}
 for(const sc of o.screenChoices||[]){const at=sc?.at;if(!Number.isFinite(at)||!Array.isArray(sc.texts)||!sc.texts.length)continue;if(asked.some(a=>Math.abs(a-at)<t.choiceMs))continue;
  if(offered.some(c=>c.at<=at+t.choiceMs&&(c.until==null||c.until>=at-200)))continue;n++;if(bad.length<6)bad.push(name+' @'+at+' options on the game screen ('+sc.texts.map(x=>String(x).slice(0,24)).join(' / ')+') never reached the reader');}
 for(const c of o.krkr?.choice||[]){n++;if(c.ui==='choice')ok++;else if(bad.length<6)bad.push(name+' '+c.mark+' choice frame not kept for the game');}
 return {bad,n,ok,unobserved,unanswered,reliable:unobserved===0&&unanswered===0};}

/* the original showing through: the bridge's own hide check (hookVisual stage=hidden, read back by core/self-check.cjs), a dialogue
   record the game drew visible while core's hide was on (o.hidden), and every line after the hide was given up or read mode came on */
function leaks(run,t,ls){t=opts(t);const name=run.name||'run',o=run.o,bad=[];ls=ls||lines(run,t);
 let checked=0,visible=0;const sequences=new Set();try{const {parseTrace}=require('../self-check.cjs');for(const l of o.hookEvents||[]){const e=parseTrace(l);let raw=null;try{const text=/\bvisual (\{.*\})\s*$/.exec(l)?.[1];if(text)raw=JSON.parse(text);}catch{}if(e&&e.kind==='hide'&&typeof raw?.matched==='boolean'&&Number.isFinite(e.at)&&Number.isSafeInteger(e.seq)&&e.seq>0&&!sequences.has(e.seq)){sequences.add(e.seq);checked++;if(e.visible)visible++;}}}catch{}
 const h=o.hidden||{lines:0,visible:0},nativeObserved=require('./native-hide.cjs').validCounts(h);const off=offSpans(run,t);
 /* a line shown while the hide was off (disabled, given way) or the reader was in read mode: the original showed */
 const during=ls.filter(l=>{const a=l.samples[0].at,b=l.samples.at(-1).at;return off.some(s=>s.from<b&&s.to>a);});
 /* 2026-11-26 (owner via 261126总指挥: 按屏幕上原文是不是真被藏住判，不按 profile 名字判): the Hook mode 'read' (读取原文) is the
    only mode of a read-only stream. With the hide on AND the bridge's own confirmation on the tape that the selected stream's
    original is hidden (HookBridge GdiHideHit: the selected thread listed hideOnly, "gdi hide confirmed … hide-only"), its samples
    are not read mode. Without that confirmation, or with the hide off, 'read' stays an observed manual read, as before. */
 const hideConfirmed=(run.steps||[]).some(st=>st?.hb?.type==='hookThreads'&&(st.hb.hookThreads||[]).some(x=>x&&x.selected===true&&x.hideOnly===true));
 const readObserved=(o.samples||[]).some(s=>s.readMode===true||s.hookProfile==='read'&&!(s.hookHide===true&&hideConfirmed));
 /* 2026-11-26 the real screen (core/cardinal/screen-evidence.cjs: OCR of captures against the hook's line), a second evidence of either kind */
 const sc=require('./screen-evidence.cjs').valid(o.screen)?o.screen:null,screenVisible=!!sc&&sc.state==='visible',screenObserved=!!sc&&sc.state!=='unconfirmed';
 const failed=visible>0||nativeObserved&&h.visible>0||during.length>0||readObserved||off.length>0||screenVisible;
 /* the bridge's confirmation that the selected stream's original is hidden, while the reader had the hide on, is an observation of the hide too */
 const confirmedHidden=hideConfirmed&&(o.samples||[]).some(s=>s.hookHide===true);
 const observed=failed||checked>=4||nativeObserved||confirmedHidden||screenObserved;
 const rates=[checked&&visible?visible/checked:0,nativeObserved?h.visible/h.lines:0,ls.length?during.length/ls.length:0,readObserved||off.length&&!during.length?1:0,screenVisible?sc.visible/sc.usable:0];
 if(visible)bad.push(name+' hide check read Japanese on '+visible+'/'+checked+' lines');if(nativeObserved&&h.visible)bad.push(name+' '+h.visible+'/'+h.lines+' dialogue records drawn visible while hidden');
 if(screenVisible)for(const i of (sc.items||[]).filter(i=>i.verdict==='visible').slice(0,4))bad.push(name+' screen '+(i.name||'@'+i.at)+' shows the original: OCR 「'+String(i.read||'').slice(0,30)+'」 ~ 「'+String(i.text||'').slice(0,30)+'」');
 for(const l of during.slice(0,4))bad.push(name+' line '+l.line+' shown while the hide was off ('+(off.find(s=>s.from<l.samples.at(-1).at&&s.to>l.samples[0].at)?.why||'')+')');
 /* 2026-11-26 state says it in one word: visible (the original showed), hidden (an observation that it was hidden), unconfirmed (隐藏未确认:
    nothing on the tape says either way; the score stays 0, it is not a pass) */
 const state=failed?'visible':observed?'hidden':'unconfirmed';
 if(readObserved)bad.push(name+' the reader was in read mode (the original is read, not hidden)');if(off.length&&!during.length)bad.push(name+' the hide was off ('+off.map(s=>s.why).filter(Boolean).slice(0,3).join(', ')+')');
 if(!observed)bad.push(name+' hide unconfirmed (隐藏未确认): no valid native dialogue records, four distinct hide checks, a hide-only confirmation of the selected stream or '+require('./screen-evidence.cjs').MIN_FRAMES+' usable screen pictures');
 return {bad,rate:observed?Math.min(1,Math.max(...rates)):1,observed,state,hideConfirmed,screen:sc?{state:sc.state,usable:sc.usable,visible:sc.visible,hidden:sc.hidden}:null,checked,visible,records:h,nativeObserved,readObserved,during:during.length,off};}
/* when the original could show, on the run's clock: from a disable / probeHide off / give way until core enables again, and from a switch
   to read mode until the switch away from it; a span still open runs to the end */
/* the kernel's preflight (hide.preflight: the original shown once and checked before the hide, hook-events 'check baseline') is a
   designed step of every game, not a leak of the seed: a span that starts with it and is back on within preflightMs is left out */
function offSpans(run,t){t=opts(t);const o=run.o,ev=[];const at=l=>Date.parse(String(l).slice(0,24))-(o.t0||0);
 const checks=(o.hookEvents||[]).filter(l=>/ check baseline /.test(l)).map(at).filter(Number.isFinite);
 for(const m of o.hbSent||[]){if(m.type==='disable'||m.type==='probeHide'&&m.on===false)ev.push({at:m.at,k:'hide',on:false,why:m.type+(m.reason?':'+m.reason:'')});else if(m.type==='enable'||m.type==='probeHide'&&m.on===true)ev.push({at:m.at,k:'hide',on:true});}
 for(const l of o.hookEvents||[]){let x;if(/give way|gave way|giving way/i.test(l)&&!/no give way/i.test(l))ev.push({at:at(l),k:'hide',on:false,why:'give way'});
  else if((x=/render mode switched in place (\S+) -> (\S+)/.exec(l)))ev.push({at:at(l),k:'read',on:x[2]!=='read',why:'read mode'});
  else if(READ_MODE.test(l))ev.push({at:at(l),k:'read',on:false,why:'read mode'});}
 ev.sort((a,b)=>a.at-b.at);const spans=[],open={};const end=Math.max(0,...(o.samples||[]).map(s=>s.at))+1;
 for(const e of ev){if(!Number.isFinite(e.at))continue;if(!e.on&&!open[e.k])open[e.k]={from:e.at,why:e.why};else if(e.on&&open[e.k]){spans.push({...open[e.k],to:e.at});open[e.k]=null;}}
 for(const k of Object.keys(open))if(open[k])spans.push({...open[k],to:end});
 return spans.filter(s=>!(s.to-s.from<=t.preflightMs&&checks.some(c=>Math.abs(c-s.from)<=300)));}

module.exports={reaches,T0,JP,norm,jpGlyphs,lineGlyphs,inside,expectedLines,deliveryClock,lines,perLine,white,flashes,hold,readMode,calibration,clears,choices,leaks,offSpans};
