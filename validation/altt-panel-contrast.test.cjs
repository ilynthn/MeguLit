// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { setTimeout: sleep } = require('node:timers/promises');
const { startEdge } = require('./library-views-perf.cjs');

const web = path.join(__dirname, '..', 'web');
const types = {'.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2'};
const backgroundKey = 'tome-menu-background';
const menu = '.tomoyo-cn-dialog[open]';
const textTab = `${menu} [data-menu-category=text]`;
const hasEdge = [process.env.MEGULIT_EDGE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(file => file && fs.existsSync(file));
const white = {home:[255,255,255], backdrop:'#fff'};

function readerStub(fixture) {
 return `<script>(${function ({ state, home, game, themeMode, accent }) {
  localStorage.clear();
  const pictures = window.panelFixturePictures = {home,game};
  function image(value) {
   if (!Array.isArray(value)) return value || '';
   const canvas = document.createElement('canvas');
   canvas.width = canvas.height = 16;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = `rgb(${value.join(',')})`;
   ctx.fillRect(0, 0, 16, 16);
   return canvas.toDataURL();
  }
  window.__TAURI_INTERNALS__ = {transformCallback: () => 1, invoke: async (cmd, args) => {
   if (cmd !== 'service') return null;
   const { action, message } = args.request;
   if (action === 'home') return {preferences:{language:'zh',themeMode,accent}, games:[]};
   if (action === 'ui_state') return state;
   if (action === 'reader_bootstrap') return {engines:[],native:{}};
   if (action === 'reader_message') {
    if (message.type === 'v4') {
     const result = message.action === 'backgroundGet' ? {image:image(pictures[message.args.slot === 'game' ? 'game' : 'home'])} : {};
     return {replies:[{method:'v4Deliver',args:[message.id,result,'']}]};
    }
    return {replies:[]};
   }
   return {};
  }};
 }.toString()})(${JSON.stringify(fixture)});</script>`;
}

async function waitFor(cdp, condition, timeout = 6000) {
 const deadline = performance.now() + timeout;
 do {
  if (await cdp.evaluate(condition).catch(() => false)) return;
  await sleep(50);
 } while (performance.now() < deadline);
 const status = await cdp.evaluate('document.querySelector("#reader-status")?.textContent');
 assert.fail(`${condition} did not become true. Reader status: ${status}`);
}

async function withReader(run) {
 const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-panel-contrast-'));
 let fixture, cdp, page = 0;
 const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(web, rel);
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
   res.writeHead(404).end();
   return;
  }
  const content = fs.readFileSync(file);
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  res.end(rel === '/reader/index.html' ? String(content).replace('<head>', '<head>' + readerStub(fixture)) : content);
 });
 try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cdp = await startEdge(path.join(temp, 'edge'));
  async function load({home, game, backdrop, state = {}, themeMode = 'dark', accent, width = 1280, height = 720}) {
   fixture = {home, game, state, themeMode, accent};
   await cdp.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile:false});
   await cdp.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
   const url = `http://127.0.0.1:${server.address().port}/reader/index.html?fixture=${++page}`;
   const navigation = await cdp.send('Page.navigate', {url});
   assert.ok(!navigation.errorText, `Reader navigation failed: ${navigation.errorText}`);
   // The reader loads its modules serially. Leave time for startup on a busy CI runner.
   await waitFor(cdp, `location.href === ${JSON.stringify(url)} && !!window.__TOME_READER_READY__`, 20000);
   await cdp.evaluate(`(${function (backdrop) {
    const frame = document.createElement('div');
    frame.style.cssText = 'position:fixed;inset:0;z-index:-2147483647;pointer-events:none';
    frame.style.background = backdrop;
    document.body.prepend(frame);
    const b = window.__tomoyoChinese;
    window.__tomoyoMode.set('translation');
    b.galStatus({bound:true,interfaceMode:'translation'});
    b.galLayout({clientX:0,clientY:0,clientWidth:innerWidth,clientHeight:innerHeight,surfaceWidth:innerWidth,surfaceHeight:innerHeight});
   }})(${JSON.stringify(backdrop)})`);
   if (home || game) await waitFor(cdp, `getComputedStyle(document.documentElement).getPropertyValue('--tome-menu-image').startsWith('url(')`);
  }
  await run(cdp, load);
 } finally {
  await cdp?.stop();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  try {
   fs.rmSync(temp, {recursive:true, force:true, maxRetries:10, retryDelay:150});
  } catch (error) {
   if (!['EBUSY','EPERM','ENOTEMPTY'].includes(error?.code)) throw error;
  }
 }
}

async function openMenu(cdp) {
 const key = {code:'KeyT', key:'t', modifiers:1, windowsVirtualKeyCode:84};
 await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', ...key});
 await cdp.send('Input.dispatchKeyEvent', {type:'keyUp', ...key});
 await waitFor(cdp, `!!document.querySelector('${menu} [data-menu-key=text]')`);
 await cdp.evaluate(`document.querySelector('${menu} [data-menu-key=text]').click();
  dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth,surfaceHeight:innerHeight}}))`);
 await waitFor(cdp, `(() => {
  const panel = document.querySelector('${menu}');
  return !panel.dataset.surfacePending && !panel.classList.contains('tome-menu-enter') && getComputedStyle(panel).opacity === '1';
 })()`);
}

const menuText = [`${textTab} label:has([name=galTypewriter])`, `${textTab} .tome-ac-switch-slider + small`,
 `${textTab} .mg-subtabs button[aria-selected=false]`, `${menu} [data-menu-key=misc]`];
const logText = ['.tome-log-src','.tome-log-tr:not([hidden])'];
const cardText = ['.tomoyo-sense > div','.tomoyo-word-reading','.tomoyo-word-pos'];
const logState = () => ({'tomoyo-backlog-session':JSON.stringify([{src:'窓を開ける。',tr:'打开窗户。',at:Date.now()}])});
const phraseText = ['.tomoyo-word-row:not(.tomoyo-word-minor)>summary>strong','.tomoyo-chunk-role','.tomoyo-row-meaning','.tomoyo-row-pos'];
const speakerState = () => ({'tomoyo-backlog-session':JSON.stringify([
 {src:'窓を開ける。',tr:'打开窗户。',at:Date.now()-5000},
 {src:'司\n「明日は晴れる。」',tr:'明天会放晴。',at:Date.now()}
])});
const opaquePictures = {'tome-menu-background':JSON.stringify({
 panels:Object.fromEntries(['menu','log','card'].map(panel => [panel,{alpha:100,dim:0,blur:0,saturate:100}]))
})};

function luminance(rgb) {
 return rgb.slice(0,3).map(value => {
  const s = value / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
 }).reduce((sum,value,i) => sum + value * [.2126,.7152,.0722][i], 0);
}

// Remove the glyphs to sample their composited background. The text scan pairs screenshots
// so borders and clipped pixels beside the glyphs do not count as the text background.
async function contrastDetails(cdp, selectors, directText = false) {
 for (let attempt=0; attempt<3; attempt++) {
  const readings = await measureContrast(cdp,selectors,directText);
  if (readings) return readings;
 }
 assert.fail('Panel text moved between the contrast captures');
}

function textVisibilityDetails(target, card, clip) {
 const nodes = [];
 const walker = target && document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
 for (let node = walker?.nextNode(); node; node = walker.nextNode()) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const ancestors = [];
  for (let element = node.parentElement; element; element = element.parentElement) {
   const {opacity,visibility,display,overflowX,overflowY,contentVisibility} = getComputedStyle(element);
   ancestors.push({tag:element.localName,id:element.id,className:element.className,opacity,visibility,display,
    overflowX,overflowY,contentVisibility,open:element.localName === 'details' ? element.open : undefined,
    rect:element.getBoundingClientRect().toJSON(),scrollTop:element.scrollTop,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight});
  }
  const {fontFamily,fontStyle,fontWeight,fontSize,lineHeight} = getComputedStyle(node.parentElement);
  nodes.push({text:node.textContent,rects:[...range.getClientRects()].map(rect => rect.toJSON()),ancestors,
   fontFamily,fontSize,lineHeight,fontLoaded:document.fonts.check(`${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`,node.textContent)});
 }
 return JSON.stringify({
  browser:navigator.userAgent,theme:document.documentElement.dataset.theme,card:card?.getBoundingClientRect().toJSON(),clip,
  viewport:{width:innerWidth,height:innerHeight,scale:devicePixelRatio,scrollX,scrollY,
   visualWidth:visualViewport.width,visualHeight:visualViewport.height,visualTop:visualViewport.offsetTop,visualLeft:visualViewport.offsetLeft},
  workArea:{left:screen.availLeft,top:screen.availTop,width:screen.availWidth,height:screen.availHeight,screenX,screenY,outerWidth,outerHeight},
  fonts:{status:document.fonts.status,faces:[...document.fonts].map(({family,status}) => ({family,status}))},nodes
 });
}

async function measureContrast(cdp,selectors,directText,scan = false) {
 const probes = await cdp.evaluate(`(${function (selectors,directText,scan,visibilityDetails) {
  const text = new Set(), positions = [];
  const palette = new OffscreenCanvas(1,1).getContext('2d',{willReadFrequently:true});
  const probes = selectors.map(selector => {
   const target = document.querySelector(selector);
   if (!target) {
    if (scan) return [];
    const card = document.querySelector('.tomoyo-selection-card');
    throw Error(`Missing text: ${selector}\n${visibilityDetails(null,card)}`);
   }
   const panel = target.closest('.tomoyo-selection-card');
   const card = panel?.getBoundingClientRect();
   const viewport = {left:Math.max(0,card?.left ?? 0),top:Math.max(0,card?.top ?? 0),
    right:Math.min(innerWidth,card?.right ?? innerWidth),bottom:Math.min(innerHeight,card?.bottom ?? innerHeight)};
   const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
   const areas = [];
   for (let node; (node = walker.nextNode());) {
    if (!node.textContent.trim() || directText && node.parentElement !== target) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const parent = node.parentElement;
    const style = getComputedStyle(parent);
    if (style.visibility !== 'visible' || style.display === 'none') continue;
    const color = style.color;
    palette.clearRect(0,0,1,1);
    palette.fillStyle = color;
    palette.fillRect(0,0,1,1);
    const fg = Array.from(palette.getImageData(0,0,1,1).data);
    let alpha = fg[3]/255;
    for (let ancestor=parent; ancestor; ancestor=ancestor.parentElement) alpha *= Number(getComputedStyle(ancestor).opacity);
    if (!alpha) continue;
    if (directText) positions.push([range,range.getBoundingClientRect()]);
    for (const {left,top,right,bottom} of range.getClientRects()) {
     if (left >= viewport.left && top >= viewport.top && right <= viewport.right && bottom <= viewport.bottom && right-left > 2 && bottom-top > 2)
      areas.push({fg,alpha,color,text:node.textContent.trim(),box:[Math.ceil(left),Math.ceil(top),Math.floor(right)-Math.ceil(left),Math.floor(bottom)-Math.ceil(top)]});
    }
    text.add(parent);
   }
   if (!areas.length && !scan) throw Error(`No visible text: ${selector}\n${visibilityDetails(target,panel,viewport)}`);
   return areas;
  });
  if (probes.some(areas => !areas.length)) return null;
  const savedStyles = [...text].map(node => [node,node.getAttribute('style')]);
  window.maskContrastProbe = () => {
   for (const node of text) {
    node.style.setProperty('-webkit-text-fill-color','transparent','important');
    node.style.setProperty('text-shadow','none','important');
   }
  };
  window.contrastProbeIsStable = () => positions.every(([range,before]) => {
   const after = range.getBoundingClientRect();
   return ['x','y','width','height'].every(key => Math.abs(before[key]-after[key]) < 1);
  });
  window.restoreContrastProbe = () => {
   for (const [node,style] of savedStyles) {
    if (style === null) node.removeAttribute('style');
    else node.setAttribute('style',style);
   }
  };
  return probes;
 }})(${JSON.stringify(selectors)},${directText},${scan},${textVisibilityDetails})`);
 if (!probes) return null;
 try {
  const boxes = probes.flat().map(area => area.box);
  const before = directText ? await cdp.send('Page.captureScreenshot',{format:'png'}) : null;
  await cdp.evaluate('window.maskContrastProbe()');
  await frame(cdp);
  const result = await screenshotPixels(cdp,boxes);
  if (before && !await cdp.evaluate('window.contrastProbeIsStable()')) return null;
  const withText = before ? await screenshotPixels(cdp,boxes,before.data) : [];
  const readings = probes.map(areas => areas.map(({fg,alpha,color,text}) => {
   const pixels = result.shift(), painted = withText.shift();
   let min = Infinity, glyphMin = Infinity;
   for (let i=0; i<pixels.length; i+=4) {
    const rgb = pixels.slice(i,i+3);
    const back = luminance(rgb);
    const front = luminance(rgb.map((channel,k) => channel*(1-alpha)+fg[k]*alpha));
    const ratio = (Math.max(front,back)+.05)/(Math.min(front,back)+.05);
    min = Math.min(min,ratio);
    if (painted && rgb.some((channel,k) => Math.abs(channel-painted[i+k]) >= 8)) glyphMin = Math.min(glyphMin,ratio);
   }
   return {ratio:Number.isFinite(glyphMin)?glyphMin:min,color,rgb:fg.slice(0,3),alpha,text};
  }).reduce((worst,reading) => reading.ratio < worst.ratio ? reading : worst));
  return Object.fromEntries(selectors.map((selector,i) => [selector,readings[i]]));
 } finally {
  await cdp.evaluate('window.restoreContrastProbe(); delete window.restoreContrastProbe; delete window.maskContrastProbe; delete window.contrastProbeIsStable;');
  await frame(cdp);
 }
}
async function contrast(cdp,selectors) {
 return Object.fromEntries(Object.entries(await contrastDetails(cdp,selectors)).map(([selector,reading]) => [selector,reading.ratio]));
}

async function scrollToText(cdp, selector) {
 await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
 await frame(cdp);
}

// A short monitor work area can leave some lookup rows below the card scrollport.
async function lookupContrast(cdp, selectors) {
 await cdp.evaluate('document.fonts.ready.then(() => true)');
 const ratios = {};
 for (const selector of selectors) {
  const deadline = performance.now() + 2000;
  // A resize can move a row below the scrollport after the initial scroll.
  while (true) {
   await scrollToText(cdp,selector);
   try {
    Object.assign(ratios,await contrast(cdp,[selector]));
    break;
   } catch (error) {
    if (!error.message.includes(`No visible text: ${selector}\n`) || performance.now() >= deadline) throw error;
   }
  }
 }
 return ratios;
}

async function screenshotPixels(cdp, boxes, data) {
 if (!data) ({data} = await cdp.send('Page.captureScreenshot',{format:'png'}));
 return cdp.evaluate(`(${async function (data, boxes) {
  const image = new Image();
  image.src = 'data:image/png;base64,' + data;
  await image.decode();
  const canvas = new OffscreenCanvas(image.width,image.height);
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0);
  return boxes.map(box => Array.from(ctx.getImageData(...box).data));
 }})(${JSON.stringify(data)},${JSON.stringify(boxes)})`);
}

async function openLog(cdp) {
 await cdp.evaluate(`window.__tomoyoChinese.openBacklog();
  dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth,surfaceHeight:innerHeight}}));`);
 await waitFor(cdp, `(() => {
  const panel = document.querySelector('.tome-backlog[data-shown]');
  return panel && getComputedStyle(panel).opacity === '1' && getComputedStyle(panel.querySelector('.tome-log-list')).opacity === '1';
 })()`);
}

async function openCard(cdp) {
 await cdp.evaluate(`(async () => {
  const b = window.__tomoyoChinese;
  b.localLookup = async () => ({entries:[{spellings:['窓'],readings:['まど'],pos:['名詞'],definitions:['窗户']}]});
  await b.openLocalSelection({text:'窓を開ける',start:0,end:1},{left:500,right:526,top:480,bottom:510,width:26,height:30});
 })()`);
 await waitFor(cdp, `!!document.querySelector('.tomoyo-selection-card .tomoyo-sense')`);
}

async function openPhrase(cdp) {
 await cdp.evaluate(`(${async function () {
  const b = window.__tomoyoChinese,phrase = '明日は晴れる';
  const part = (surface,reading,pos,definition) => ({surface,entries:[{spellings:[surface],readings:[reading],pos:[pos],definitions:[definition]}]});
  const parts = [part('明日','あした','名詞','明天'),part('は','は','助詞','主题助词'),part('晴れる','はれる','動詞','放晴')];
  b.localLookup = async () => ({selection_analysis:{surface:phrase,exact:false,parts}});
  await b.openLocalSelection({text:phrase,start:0,end:phrase.length},{left:500,right:560,top:480,bottom:510,width:60,height:30});
 }})()`);
 await waitFor(cdp, `!!document.querySelector('.tomoyo-selection-card .tomoyo-chunk-role')`);
}

async function visiblePanelText(cdp, root) {
 // Layout can move between tagging visible nodes and collecting their text rectangles.
 for (let attempt=0; attempt<3; attempt++) {
  const readings = await scanPanelText(cdp,root);
  if (readings) return readings;
  await frame(cdp);
 }
 assert.fail(`Panel text kept moving during contrast measurement: ${root}`);
}

async function scanPanelText(cdp, root) {
 const labels = await cdp.evaluate(`(${function (root) {
  const panel = document.querySelector(root);
  const surface = panel.querySelector(':scope > .tome-menu-bg').getBoundingClientRect();
  const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  const elements = new Map();
  for (let node; (node = walk.nextNode());) {
   const element = node.parentElement, text = node.textContent.trim();
   if (!text || elements.has(element) || element.closest('style,script,option,[hidden],[aria-hidden=true]')) continue;
   if (getComputedStyle(element).visibility !== 'visible') continue;
   const range = document.createRange();
   range.selectNodeContents(node);
   const rects = [...range.getClientRects()];
   const whole = rects.every(r => r.width>2 && r.height>2 && r.left>=surface.left && r.top>=surface.top &&
    r.right<=surface.right && r.bottom<=surface.bottom && r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight);
   if (!rects.length || !whole) continue;
   let visible = true;
   for (let parent = element; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
    const clipped = rects.some(r =>
     (/auto|scroll|hidden|clip/.test(style.overflowX) && (r.left<bounds.left-2 || r.right>bounds.right+2)) ||
     (/auto|scroll|hidden|clip/.test(style.overflowY) && (r.top<bounds.top-2 || r.bottom>bounds.bottom+2)));
    if (style.opacity === '0' || clipped) { visible = false; break; }
    if (parent === panel) break;
   }
   if (visible) elements.set(element, [text, element.localName, element.className || ''].join(' | '));
  }
  return [...elements].map(([element,label],index) => {
   element.dataset.panelTextProbe = index;
   return label;
  });
 }})(${JSON.stringify(root)})`);
 if (!labels.length) return [];
 const selectors = labels.map((_,index) => `[data-panel-text-probe="${index}"]`);
 try {
  const readings = await measureContrast(cdp,selectors,true,true);
  return readings && selectors.map((selector,index) => ({label:labels[index],...readings[selector]}));
 } finally {
  await cdp.evaluate(`document.querySelectorAll('[data-panel-text-probe]').forEach(n=>delete n.dataset.panelTextProbe)`);
 }
}

async function openAiResult(cdp, kind, text, selector) {
 await cdp.evaluate(`(${function (kind,text) {
  const original = window.__tomoyoTranslateRequest, bridge = window.__tomoyoChinese;
  window.__tomoyoTranslateRequest = raw => {
   const message = JSON.parse(raw);
   if (message.type !== 'lookupExplain') return original(raw);
   queueMicrotask(() => bridge.lookupDeliver(message.id,{kind,text},''));
  };
  document.querySelector('.tomoyo-selection-card [data-mg-ai="'+kind+'"]').click();
 }})(${JSON.stringify(kind)},${JSON.stringify(text)})`);
 await waitFor(cdp, `!!document.querySelector('${selector}')`);
}

const frame = cdp => cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
async function sampleLookupCardText(cdp, card) {
 const view = top => cdp.evaluate(`(${function (selector,top) {
  const panel = document.querySelector(selector);
  if (top !== null) panel.scrollTop = top;
  const {x,y,width,height} = panel.getBoundingClientRect();
  const {scrollTop,clientHeight,scrollHeight} = panel;
  return {layout:[innerWidth,innerHeight,x,y,width,height,clientHeight,scrollHeight].join(','),scrollTop,clientHeight,scrollHeight};
 }})(${JSON.stringify(card)},${top})`);
 await cdp.evaluate('document.fonts.ready.then(() => true)');
 for (let attempt=0; attempt<3; attempt++) {
  const readings = [];
  let before = await view(0);
  for (;;) {
   await frame(cdp);
   const samples = await scanPanelText(cdp,card);
   const after = await view(null);
   // A reflow can clip labels or leave a gap between the pages already sampled.
   if (!samples || before.layout !== after.layout || before.scrollTop !== after.scrollTop) break;
   readings.push(...samples);
   if (after.scrollHeight-after.clientHeight-after.scrollTop <= 1) return readings;
   // Overlap pages so labels that straddle a scrollport edge get a full sample.
   before = await view(after.scrollTop+Math.max(1,Math.floor(after.clientHeight/2)));
   if (before.layout !== after.layout || before.scrollTop <= after.scrollTop) break;
  }
 }
 assert.fail(`Lookup card kept moving during contrast measurement: ${JSON.stringify(await view(null))}`);
}

async function sampleMenuPage(cdp,scene,readings) {
 await frame(cdp);
 await cdp.evaluate(`(() => {
  const content = document.querySelector('${menu} .tomoyo-menu-content');
  for (const details of content.querySelectorAll('details')) if (details.offsetHeight) details.open = true;
  content.scrollTop = 0;
 })()`);
 let scroll = 0;
 do {
  await frame(cdp);
  readings[`${scene}/${scroll}`] = await visiblePanelText(cdp,menu);
  scroll = await cdp.evaluate(`(() => {
   const content = document.querySelector('${menu} .tomoyo-menu-content');
   const previous = content.scrollTop;
   content.scrollTop = previous + Math.max(1,content.clientHeight-90);
   return content.scrollTop > previous ? content.scrollTop : 0;
  })()`);
 } while (scroll);
}

async function menuPictureTextSamples(cdp,load,fixture) {
 const readings = {};
 await load(fixture);
 await openMenu(cdp);
 await cdp.evaluate(`(() => {
  const style = document.createElement('style');
  // Measure fully shown labels, including text that can scroll through the decorative edge fade.
  style.textContent = '.tomoyo-cn-dialog *, .tome-backlog *, .tomoyo-selection-card *{transition:none!important;animation:none!important;overflow-anchor:none!important}'
   + '.tomoyo-cn-dialog .tomoyo-menu-content{mask-image:none!important}';
  document.head.appendChild(style);
  return document.fonts.ready.then(() => true);
 })()`);
 const tabs = await cdp.evaluate(`[...document.querySelectorAll('${menu} [data-menu-key]')].map(n=>n.dataset.menuKey)`);
 for (const tab of tabs) {
  await cdp.evaluate(`document.querySelector('${menu} [data-menu-key="${tab}"]').click()`);
  await sampleMenuPage(cdp,`Alt+T/${tab}`,readings);
  if (tab === 'voice') {
   const note = `${menu} .tome-voice-pack-body > small`;
   await waitFor(cdp, `!!document.querySelector(${JSON.stringify(note)})?.textContent`);
   // Scroll directly to the deletion warning even if the normal pass lands either side of it.
   await scrollToText(cdp,note);
   readings['Alt+T/voice/pack-note'] = [{label:note,...(await contrastDetails(cdp,[note],true))[note]}];
  }
  if (tab !== 'text') continue;
  const sub = `${textTab} .mg-subtabs > button`;
  const items = await cdp.evaluate(`[...document.querySelectorAll('${sub}')].map(b=>({text:b.textContent,selected:b.getAttribute('aria-selected')==='true'}))`);
  for (const [index,{text,selected}] of items.entries()) {
   if (selected) continue;
   await cdp.evaluate(`document.querySelectorAll('${sub}')[${index}].click()`);
   await sampleMenuPage(cdp,`Alt+T/text/${text}`,readings);
  }
 }
 const save = `${menu} footer button[type=submit]`;
 await cdp.send('DOM.enable');
 await cdp.send('CSS.enable');
 const {root} = await cdp.send('DOM.getDocument');
 const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:save});
 for (const pseudo of ['hover','active']) {
  await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[pseudo]});
  await frame(cdp);
  const result = await contrastDetails(cdp,[save]);
  readings[`Alt+T/save/${pseudo}`] = [{label:save,...result[save]}];
 }
 await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
 await cdp.evaluate(`document.querySelector('${save}').disabled = true`);
 await frame(cdp);
 const disabled = await contrastDetails(cdp,[save]);
 readings['Alt+T/save/disabled'] = [{label:save,...disabled[save]}];
 return readings;
}

async function pictureTextSamples(cdp,load,themeMode) {
 const fixture = {...white,themeMode,accent:'#ffffff',state:opaquePictures};
 const readings = await menuPictureTextSamples(cdp,load,fixture);
 const backlog = '.tome-backlog[data-shown]', card = '.tomoyo-selection-card';
 await load({...fixture,state:{...opaquePictures,...speakerState(),'tome-log-settings':'{"showTime":true}'}});
 await openLog(cdp);
 readings['对话记录/菜单'] = await visiblePanelText(cdp,backlog);
 await cdp.evaluate(`(() => {
  const input = document.querySelector('${backlog} input[type=search]');
  input.value = '晴';
  input.dispatchEvent(new Event('input',{bubbles:true}));
 })()`);
 const hit = '.tome-log-hit';
 await waitFor(cdp,`!!document.querySelector('${hit}')`);
 const search = await contrastDetails(cdp,[hit]);
 readings['对话记录/搜索'] = [{label:hit,...search[hit]}];

 // The role label is below the first full page of a short phrase card.
 await load({...fixture,height:160});
 await openPhrase(cdp);
 readings['点读卡/多词'] = await sampleLookupCardText(cdp,card);
 await load(fixture);
 await openCard(cdp);
 readings['点读卡/单词'] = await sampleLookupCardText(cdp,card);
 await openAiResult(cdp,'summary','① 整理窗边｜把窗台上的东西排好\n② 打开窗户｜开窗通风\n本句：①，整理窗台。\n补充说明。','.mg-sum-row[data-match] b');
 readings['点读卡/归纳义项'] = await sampleLookupCardText(cdp,card);
 await openAiResult(cdp,'explain','意思：打开窗户。\n语气：普通。\n注意：对象是窗户。','.mg-ai-tag');
 readings['点读卡/上下文解释'] = await sampleLookupCardText(cdp,card);
 return readings;
}

async function menuPixel(cdp) {
 const point = await cdp.evaluate(`(() => {
  const panel = document.querySelector('${menu}').getBoundingClientRect();
  return [Math.floor(panel.left + panel.width * .68), Math.floor(panel.top+14),1,1];
 })()`);
 return (await screenshotPixels(cdp,[point]))[0].slice(0,3);
}

function assertAA(ratios) {
 assert.ok(Object.values(ratios).every(ratio => ratio >= 4.5),
  Object.entries(ratios).map(([selector,ratio]) => `${selector}: ${ratio.toFixed(2)}:1`).join(', '));
}

if (require.main === module) {
 const options = {skip:!hasEdge && !process.env.CI && 'Edge not installed',timeout:60000};
 test('Alt+T text and secondary controls meet 4.5:1 over a white game',options,() => withReader(async (cdp,load) => {
  for (const fixture of [white,{...white,themeMode:'light'},{...white,home:[30,30,30]}]) {
   await load(fixture);
   await openMenu(cdp);
   assertAA(await contrast(cdp,menuText));
  }
 }));
 test('backlog text and secondary translation meet 4.5:1 over a white picture and game',options,() => withReader(async (cdp,load) => {
  await load({...white,state:logState()});
  await openLog(cdp);
  assertAA(await contrast(cdp,logText));
 }));
 test('lookup definition and reading meet 4.5:1 over a white picture and game',options,() => withReader(async (cdp,load) => {
  await load(white);
  await openCard(cdp);
  assertAA(await lookupContrast(cdp,cardText));
 }));
 test('both themes keep lookup accents and speaker names readable over white',options,() => withReader(async (cdp,load) => {
  for (const themeMode of ['dark','light']) {
   await load({...white,themeMode,state:opaquePictures});
   await openPhrase(cdp);
   const lookup = await lookupContrast(cdp,phraseText);
   await load({...white,themeMode,state:{...opaquePictures,...speakerState()}});
   await openLog(cdp);
   assertAA({...lookup,...await contrast(cdp,['.tome-log-name b',...logText])});
  }
  await load({...white,themeMode:'light',accent:'#ffffff',state:{...opaquePictures,...speakerState()}});
  await openLog(cdp);
  await cdp.evaluate(`(() => {
   const search = document.querySelector('.tome-backlog input[type=search]');
   search.value = '晴';
   search.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await waitFor(cdp, `!!document.querySelector('.tome-backlog .tome-log-hit')`);
  await frame(cdp);
  assertAA(await contrast(cdp,['.tome-backlog .tome-log-hit']));
 }));
 test('all panel text stays readable in both themes over a white picture and white game', {...options,timeout:150000},() => withReader(async (cdp,load) => {
  for (const themeMode of ['dark','light']) {
   const samples = await pictureTextSamples(cdp,load,themeMode);
   const settings = {[backgroundKey]:JSON.stringify({panels:{menu:{alpha:20,dim:0,blur:0,saturate:100}}})};
   const cappedDark = await menuPictureTextSamples(cdp,load,{...white,themeMode,home:[48,48,48],state:settings});
   for (const [page,readings] of Object.entries(cappedDark)) samples[`暗图/${page}`] = readings;
   for (const [panel,expected] of [
    ['Alt+T/text/0','tomoyo-slider-value'], ['对话记录/菜单','司'],
    ['点读卡/多词','tomoyo-chunk-role'], ['点读卡/归纳义项','整理窗边'], ['点读卡/上下文解释','mg-ai-tag'],
   ]) {
    assert.ok(samples[panel].some(x => x.label.includes(expected) || x.text.includes(expected)), `${themeMode}: ${panel} omitted ${expected}`);
   }
   const failures = Object.entries(samples).flatMap(([panel,readings]) => readings.filter(x=>x.ratio<4.5)
    .map(x=>`${panel} · ${x.label} · ${x.color} · ${x.ratio.toFixed(2)}:1`));
   assert.deepEqual(failures,[],`${themeMode} panel text below 4.5:1:\n${failures.join('\n')}`);
  }
 }));
 test('dark grey and dark blue pictures stay within a few RGB levels of the original',options,() => withReader(async (cdp,load) => {
  const opacity = () => cdp.evaluate(`Number(getComputedStyle(document.querySelector('${menu} .tome-menu-bg')).opacity)`);
  const savedLow = {[backgroundKey]:JSON.stringify({panels:{menu:{alpha:30,dim:0,blur:0,saturate:100}}})};
  await load({...white,state:savedLow});
  await openMenu(cdp);
  const brightOpacity = await opacity();
  for (const [home,alpha,expected] of [
   [[48,48,48],30,[48,48,48]],
   [[10,21,80],30,[37,40,58]],
   [[10,21,80],100,[10,20,79]],
  ]) {
   const state = {[backgroundKey]:JSON.stringify({panels:{menu:{alpha,dim:0,blur:0,saturate:100}}})};
   await load({home,backdrop:'#303030',state});
   await openMenu(cdp);
   const pixel = await menuPixel(cdp);
   assert.ok(pixel.every((channel,i) => Math.abs(channel-expected[i]) <= 4), `at ${alpha}% with ${home}, got ${pixel}; expected ${expected}`);
   if (alpha === 30) assert.ok(await opacity() <= brightOpacity + 1e-6, `dark picture ${home} must use the bright picture opacity cap`);
  }
 }));
 test('clearing a picture restores the saved opacity and plain composite',options,() => withReader(async (cdp,load) => {
  const saved = JSON.stringify({panels:{menu:{alpha:30}}});
  await load({home:[255,255,255],backdrop:'#3c405e',state:{[backgroundKey]:saved}});
  await openMenu(cdp);
  await cdp.evaluate(`window.panelFixturePictures.home = ''; window.__tomoyoChinese.hostRefreshAppearance()`);
  await waitFor(cdp,`getComputedStyle(document.querySelector('${menu} .tome-menu-bg>i')).backgroundImage === 'none'`);
  const result = await cdp.evaluate(`(() => {
   const layer = document.querySelector('${menu} .tome-menu-bg');
   return {alpha:getComputedStyle(layer).opacity,saved:localStorage.getItem('${backgroundKey}')};
  })()`);
  assert.deepEqual(result,{alpha:'0.3',saved});
  const pixel = await menuPixel(cdp);
  assert.ok(pixel.every((channel,i) => Math.abs(channel-[45,48,69][i]) <= 1), JSON.stringify(pixel));
 }));
 test('canceling a picture render releases unused images and keeps the visible cache',options,() => withReader(async (cdp,load) => {
  const settings = (menuDim,logDim) => JSON.stringify({panels:{menu:{dim:menuDim},log:{dim:logDim},card:{dim:30}}});
  await load({backdrop:'#fff',state:{[backgroundKey]:settings(20,30)}});
  await cdp.evaluate(`(${function () {
   const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
   const toBlob = HTMLCanvasElement.prototype.toBlob;
   const state = window.panelPictureTest = {live:new Set(),stale:new Set(),reclaimed:false};
   URL.createObjectURL = blob => {
    const url = create(blob);
    const ref = 'url("'+url+'")';
    state.live.add(ref);
    if (state.resuming) state.stale.add(ref);
    return url;
   };
   URL.revokeObjectURL = url => {
    const ref = 'url("'+url+'")';
    state.live.delete(ref);
    if (state.stale.delete(ref)) state.reclaimed = true;
    revoke(url);
   };
   let jpegs = 0;
   HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    if (state.defer && type === 'image/jpeg' && ++jpegs === 2) {
     return toBlob.call(this,blob => {state.resume = () => callback(blob);},type,quality);
    }
    return toBlob.call(this,callback,type,quality);
   };
  }})()`);
  const refresh = setting => cdp.evaluate(`localStorage.setItem('${backgroundKey}',${JSON.stringify(setting)});
   window.__tomoyoChinese.hostRefreshAppearance()`);
  await cdp.evaluate('window.panelFixturePictures.home = [255,255,255]');
  await refresh(settings(20,30));
  const image = panel => `document.documentElement.style.getPropertyValue('--tome-${panel}-image')`;
  await waitFor(cdp, `${image('card')}.startsWith('url(')`);
  const log = await cdp.evaluate(image('log'));
  assert.equal(log,await cdp.evaluate(image('card')),'panels with identical effects must reuse the same image');
  await cdp.evaluate('window.panelPictureTest.defer = true');
  await refresh(settings(21,31));
  await waitFor(cdp,`typeof window.panelPictureTest.resume === 'function'`);
  await refresh(settings(21,30));
  await cdp.evaluate(`window.panelPictureTest.resuming = true; window.panelPictureTest.resume()`);
  await waitFor(cdp,`window.panelPictureTest.reclaimed && window.panelPictureTest.stale.size === 0`);
  const unused = await cdp.evaluate(`(() => {
   const css = document.documentElement.style;
   const refs = new Set(['menu','log','card'].flatMap(p=>['image','readable-image'].map(prop=>css.getPropertyValue('--tome-'+p+'-'+prop))));
   return [...window.panelPictureTest.live].filter(url=>!refs.has(url));
  })()`);
  assert.equal(await cdp.evaluate(image('log')),log,'a canceled result must leave the selected log picture in place');
  assert.deepEqual(unused,[],'the partial update must release images with no panel references');
 }));
 test('other panel modes keep their original opacity even when a picture is loaded',options,() => withReader(async (cdp,load) => {
  for (const [surface,expected] of [['plain','0.3'],['glass','1'],['both','1']]) {
   const state = {[backgroundKey]:JSON.stringify({surfaces:{menu:surface},panels:{menu:{alpha:30}}})};
   await load({...white,state});
   await openMenu(cdp);
   const alpha = await cdp.evaluate(`getComputedStyle(document.querySelector('${menu} .tome-menu-bg')).opacity`);
   assert.equal(alpha,expected,surface);
  }
 }));
 test('picture contrast respects saved values and keeps the full range of the opacity control',options,() => withReader(async (cdp,load) => {
  const saved = {custom:true,panels:{menu:{alpha:20,dim:0,saturate:172},log:{alpha:71,dim:42},card:{alpha:93,dim:60}}};
  const stored = JSON.stringify(saved);
  await load({home:[12,12,12],game:[235,235,235],backdrop:'#ddd',state:{[backgroundKey]:stored}});
  await openMenu(cdp);
  const low = await menuPixel(cdp);
  const lowRatios = await contrast(cdp,menuText);
  assert.equal(await cdp.evaluate(`localStorage.getItem('${backgroundKey}')`),stored);
  const updated = await cdp.evaluate(`(() => {
   const dialog = document.querySelector('${menu}');
   dialog.querySelector('[data-menu-key=misc]').click();
   const opacity = dialog.querySelector('[data-game-panel=menu][data-game-key=alpha]');
   if (opacity.value !== '20') throw Error('Opacity control did not show the saved value');
   opacity.value = '100';
   opacity.dispatchEvent(new Event('input',{bubbles:true}));
   dialog.querySelector('[data-menu-key=text]').click();
   return JSON.parse(localStorage.getItem('${backgroundKey}'));
  })()`);
  assert.equal(updated.custom,saved.custom);
  for (const [panel,values] of Object.entries(saved.panels)) {
   for (const [key,value] of Object.entries(values)) assert.equal(updated.panels[panel][key],panel === 'menu' && key === 'alpha' ? 100 : value);
  }
  assert.notDeepEqual(await menuPixel(cdp),low,'the opacity slider still changes the picture blend');
  assertAA(lowRatios);
  assertAA(await contrast(cdp,menuText));
 }));
}

module.exports = {contrast,contrastDetails,menuPixel,menuText,logText,cardText,logState,phraseText,speakerState,opaquePictures,openMenu,openLog,openCard,openPhrase,lookupContrast,pictureTextSamples,waitFor,withReader};
