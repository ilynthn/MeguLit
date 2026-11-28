// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isMainThread, parentPort, Worker, workerData } = require('node:worker_threads');
const { languageOf } = require('./editions.cjs');

const version = 2;
const han = /\p{Script=Han}/u;
const standard = new Map(Object.entries({
  '國':'国','學':'学','體':'体','圖':'图','書':'书','讀':'读','館':'馆','廣':'广','聲':'声','區':'区','戰':'战',
  '轉':'转','転':'转','號':'号','時':'时','計':'计','間':'间','門':'门','來':'来','発':'发','發':'发','與':'与','會':'会',
  '實':'实','実':'实','気':'气','氣':'气','點':'点','電':'电','車':'车','馬':'马','風':'风','龍':'龙','貓':'猫',
  '魚':'鱼','夢':'梦','說':'说','話':'话','語':'语','樂':'乐','楽':'乐','覺':'觉','覚':'觉','觀':'观','観':'观',
  '現':'现','見':'见','開':'开','閉':'闭','萬':'万','無':'无','產':'产','業':'业','對':'对','駅':'站','驛':'站',
  '澤':'泽','沢':'泽','邊':'边','辺':'边','島':'岛','戀':'恋','隱':'隐','隠':'隐','險':'险','険':'险','隨':'随',
  '從':'从','従':'从','經':'经','経':'经','醫':'医','藥':'药','薬':'药','鄉':'乡','郷':'乡','靜':'静','燈':'灯',
  '稱':'称','淚':'泪','涙':'泪','髮':'发','髪':'发','讓':'让','優':'优','傷':'伤','難':'难','達':'达','鐘':'钟','銀':'银','羅':'罗','盤':'盘','針':'针',
  '遠':'远','監':'监','證':'证','証':'证','結':'结','離':'离','別':'别','寫':'写','畫':'画','給':'给',
  '帶':'带','帰':'归','歸':'归','總':'总','関':'关','關':'关','売':'卖','賣':'卖','買':'买','聞':'闻',
  '鉄':'铁','鐵':'铁','陽':'阳','陰':'阴','曉':'晓','曇':'昙','氷':'冰','綠':'绿','緑':'绿','藍':'蓝','紅':'红',
  '鋼':'钢','鏡':'镜','牆':'墙','牀':'床','條':'条','塩':'盐','鹽':'盐','団':'团','團':'团','橫':'横',
  '横':'横','檻':'槛','桜':'樱','櫻':'樱','継':'继','繼':'继','盜':'盗','雙':'双','數':'数','階':'阶',
  '陥':'陷','縁':'缘','緣':'缘','聽':'听','頭':'头','臉':'脸','顔':'颜','顏':'颜','雲':'云','啟':'启','質':'质',
  '權':'权','権':'权','攝':'摄','摂':'摄','爭':'争','種':'种','滅':'灭','記':'记','憶':'忆','識':'识','調':'调',
  '將':'将','軍':'军','衆':'众','眾':'众','護':'护','衛':'卫','衞':'卫','縣':'县','県':'县','劍':'剑','剣':'剑'
}));

function features(value) {
  const text = [...value.normalize('NFKC').toLowerCase()].map(char => standard.get(char) || char).join('')
    .replace(/时计/g, '时钟').replace(/罗针盘/g, '罗盘');
  const set = new Set();
  for (const run of text.match(/\p{Script=Han}+|[a-z0-9]{2,}/gu) || []) {
    if (han.test(run)) {
      const chars = [...run];
      chars.forEach((char, index) => {
        set.add(char);
        if (index) set.add(chars[index - 1] + char);
      });
    } else set.add(run);
  }
  return set;
}

const editorialHeading = /^\s*(?:(?:[【［（(「]\s*)?(?:(?:追加的|附加的)?[译譯]者(?:的)?[话話]|译者序|譯者序|译后记|譯後記|译者注|譯者註|译注|譯註|校对注|校對註|汉化组(?:注|的话|后记)|漢化組(?:註|的話|後記)|翻译组(?:注|的话)|翻譯組(?:註|的話))(?=\s|[:：】］）)」]|$)|(?:转载请(?:注明|保留)|轉載請(?:註明|保留)|仅供(?:学习|交流)|僅供(?:學習|交流)))/u;
const enclosedNote = /[（(【\[]\s*(?:译者注|譯者註|译注|譯註|汉化组注|漢化組註)\s*[:：][^）)】\]\n]*[）)】\]]/gu;

function units(chapters, locale) {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  const translated = locale === 'zh';
  return chapters.flatMap(chapter => {
    if (translated && editorialHeading.test(chapter.title || '')) return [];
    return chapter.paragraphs.flatMap((paragraph, paragraphIndex) => {
      if (translated && editorialHeading.test(paragraph)) return [];
      const spans = [...segmenter.segment(translated ? paragraph.replace(enclosedNote, '') : paragraph)];
      return spans.flatMap(({ segment, index }, i) => {
        const text = segment.trim();
        if (!text || (translated && editorialHeading.test(text))) return [];
        const normalized = text.normalize('NFKC');
        return [{
          chapter: chapter.idx, paragraph: paragraphIndex, start: index, text, tokens: features(text),
          length: Math.max(1, [...text].length),
          dialogue: /^[「『“‘«"]/u.test(text),
          emphatic: /[!?][」』”’»"\s]*$/u.test(normalized),
          paragraphStart: i === 0, paragraphEnd: i === spans.length - 1
        }];
      });
    });
  });
}

function pairCost(source, target, ratio) {
  const length = Math.abs(Math.log((target.length + 5) / (source.length * ratio + 5)));
  const structure = Number(source.dialogue !== target.dialogue) * .42 +
    Number(source.emphatic !== target.emphatic) * .24 +
    (Number(source.paragraphStart !== target.paragraphStart) + Number(source.paragraphEnd !== target.paragraphEnd)) * .1;
  let overlap = 0;
  for (const token of source.tokens) {
    if (target.tokens.has(token)) overlap += token.length > 1 ? .25 : .075;
  }
  return length * 2.2 + Math.max(0, length - .75) * 2.7 + structure - Math.min(.8, overlap);
}

function alignGap(ja, zh, ratio, bounded) {
  const n = ja.length;
  const m = zh.length;
  if (!n || !m || (!bounded && (m / n < .58 || m / n > 1.65))) return [];
  if (bounded && Math.max(n, m) > 4 * Math.min(n, m) + 12) return [];
  const band = Math.min(96, Math.max(14, Math.abs(n - m) + 10));
  const starts = new Int32Array(n + 1);
  const trace = new Array(n + 1);
  let previous;
  for (let i = 0; i <= n; i++) {
    const center = Math.round(i * m / n);
    const first = Math.max(0, center - band);
    const last = Math.min(m, center + band);
    const costs = new Float32Array(last - first + 1).fill(Infinity);
    const steps = new Uint8Array(costs.length);
    const old = col => previous?.[col - starts[i - 1]] ?? Infinity;
    starts[i] = first;
    trace[i] = steps;
    for (let j = first; j <= last; j++) {
      const offset = j - first;
      if (i === 0 && j === 0) { costs[offset] = 0; continue; }
      let cost = Infinity;
      let step = 0;
      if (i > 0 && j > 0) {
        // Order is the primary signal in the gaps between vocabulary anchors.
        cost = old(j - 1) + pairCost(ja[i - 1], zh[j - 1], ratio) + Math.abs(j - center) * .025;
        step = 1;
      }
      if (i > 0 && old(j) + 1.8 < cost) {
        cost = old(j) + 1.8;
        step = 2;
      }
      if (j > first && costs[offset - 1] + 1.45 < cost) {
        cost = costs[offset - 1] + 1.45;
        step = 3;
      }
      if (i > 0 && j > 1 && m > n) {
        const before = zh[j - 2];
        const after = zh[j - 1];
        const source = ja[i - 1];
        if (before.chapter === after.chapter && before.paragraph === after.paragraph &&
            !after.dialogue && source.length >= 18 &&
            Math.max(before.length, after.length) < source.length * ratio * .82) {
          const merged = { ...before, length: before.length + after.length, tokens: new Set([...before.tokens, ...after.tokens]),
            emphatic: after.emphatic, paragraphEnd: after.paragraphEnd };
          const candidate = old(j - 2) + pairCost(source, merged, ratio) + .85 + Math.abs(j - center) * .025;
          if (candidate < cost) { cost = candidate; step = 4; }
        }
      }
      costs[offset] = cost;
      steps[offset] = step;
    }
    previous = costs;
  }
  if (!Number.isFinite(previous[m - starts[n]])) return [];
  const pairs = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const step = trace[i][j - starts[i]];
    if (step === 1) { pairs.push([ja[--i], zh[--j].text]); }
    else if (step === 2) i--;
    else if (step === 3) j--;
    else if (step === 4) {
      pairs.push([ja[--i], zh[j - 2].text + zh[j - 1].text]);
      j -= 2;
    } else break;
  }
  return pairs.reverse();
}

function align(japanese, chinese) {
  const ja = units(japanese, 'ja');
  const zh = units(chinese, 'zh');
  if (!ja.length || !zh.length) return {};
  const byToken = new Map();
  for (const [index, entry] of zh.entries()) {
    for (const token of entry.tokens) {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(index);
    }
  }
  const frequent = Math.min(180, Math.max(10, Math.ceil(zh.length * .016)));
  const informative = token => (byToken.get(token)?.length || 0) <= frequent;
  const weight = token => (token.length > 1 ? 2.5 : 1) / (1 + Math.log1p(byToken.get(token)?.length || 0) * .24);
  const zhMass = zh.map(entry => [...entry.tokens].filter(informative).reduce((sum, token) => sum + weight(token), 0));
  const links = [];
  const reverse = new Map();
  for (const [index, entry] of ja.entries()) {
    const tokens = [...entry.tokens].filter(informative);
    const total = tokens.reduce((sum, token) => sum + weight(token), 0);
    const scores = new Map();
    for (const token of tokens) {
      for (const target of byToken.get(token) || []) {
        const item = scores.get(target) || { overlap: 0, singles: 0, phrase: false };
        item.overlap += weight(token);
        if (token.length > 1) item.phrase = true;
        else item.singles++;
        scores.set(target, item);
      }
    }
    const choices = [];
    for (const [target, item] of scores) {
      if (!item.phrase && item.singles < 3) continue;
      const coverage = item.overlap / Math.max(1, Math.min(total, zhMass[target]));
      const difference = Math.abs(Math.log((zh[target].length + 3) / (entry.length * .85 + 3)));
      if (coverage < (item.phrase ? .29 : .5) || difference > .86) continue;
      const distance = Math.abs(index / ja.length - target / zh.length);
      if (distance > .08 && (!item.phrase || item.singles < 3)) continue;
      const score = coverage * 2 + Math.min(item.overlap, 7) * .27 - difference * .36 - distance * 1.8;
      choices.push({ source: index, target, score });
    }
    choices.sort((a, b) => b.score - a.score);
    const best = choices[0];
    if (!best || best.score < 1.07 || best.score - (choices[1]?.score ?? 0) < .2) continue;
    links.push(best);
    const list = reverse.get(best.target) || [];
    list.push(best);
    reverse.set(best.target, list);
  }

  // A weighted increasing subsequence keeps the Japanese order and allows gaps on either side.
  const bestAt = new Array(zh.length + 1);
  const bestBefore = stop => {
    let best;
    for (let index = stop; index > 0; index -= index & -index) {
      if ((bestAt[index]?.total || 0) > (best?.total || 0)) best = bestAt[index];
    }
    return best;
  };
  for (const link of links) {
    const others = reverse.get(link.target);
    if (others.some(other => other !== link && other.score > link.score - .2)) continue;
    link.previous = bestBefore(link.target);
    link.total = link.score + (link.previous?.total || 0);
    for (let index = link.target + 1; index < bestAt.length; index += index & -index) {
      if (link.total > (bestAt[index]?.total || 0)) bestAt[index] = link;
    }
  }
  const anchors = [];
  for (let link = bestBefore(zh.length); link; link = link.previous) anchors.push(link);
  anchors.reverse();

  const ratios = anchors.filter(link => ja[link.source].length >= 8 && zh[link.target].length >= 5)
    .map(link => zh[link.target].length / ja[link.source].length).sort((a, b) => a - b);
  const ratio = Math.max(.55, Math.min(1.25, ratios[Math.floor(ratios.length / 2)] ?? .85));
  const entries = {};
  const write = (unit, text) => {
    entries[unit.chapter] ||= {};
    entries[unit.chapter][unit.paragraph + ':' + unit.start] = text;
  };
  let source = 0;
  let target = 0;
  for (const anchor of [...anchors, { source: ja.length, target: zh.length }]) {
    // Only use word similarity to pin boundaries; short sentences within them follow source order.
    for (const [unit, text] of alignGap(ja.slice(source, anchor.source), zh.slice(target, anchor.target), ratio,
      source > 0 && anchor.source < ja.length)) write(unit, text);
    if (anchor.source < ja.length) write(ja[anchor.source], zh[anchor.target].text);
    source = anchor.source + 1;
    target = anchor.target + 1;
  }
  return entries;
}

function readChapters(root, book) {
  return book.chapters.map(idx => {
    const file = path.join(root, 'data', 'novel-cache', book.id, idx + '.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { idx, title: data.title || '', paragraphs: (data.paragraphs || []).map(paragraph => typeof paragraph === 'string' ? paragraph : '') };
  });
}

if (!isMainThread) {
  const { root, source, target } = workerData;
  try {
    const chapters = align(readChapters(root, source), readChapters(root, target));
    if (Object.keys(chapters).length) {
      fs.mkdirSync(path.dirname(workerData.cache), { recursive: true });
      const temp = workerData.cache + '.' + process.pid + '.tmp';
      fs.writeFileSync(temp, JSON.stringify(chapters));
      fs.renameSync(temp, workerData.cache);
    }
    parentPort.postMessage(chapters);
  } catch { parentPort.postMessage({}); }
}

const active = new Map();
const results = new Map();
let workerChain = Promise.resolve();

function prepare(db, root, id, group = require('./library.cjs').editionsFor(db, root, id)) {
  const source = group.find(book => book.id === id);
  const target = group.filter(book => languageOf(book) === 'zh' && ['txt', 'epub'].includes(book.format))
    .sort((a, b) => Number(b.format === 'epub') - Number(a.format === 'epub') || a.id.localeCompare(b.id))[0];
  if (!source || languageOf(source) !== 'ja' || !target || !['txt', 'epub'].includes(source.format)) return null;
  if (![source.id, target.id].every(value => /^novel-[a-f0-9]{16}$/.test(value))) return null;
  const cache = path.join(root, 'data', 'novel-cache', source.id, 'aligned-' + target.id + '-v' + version + '.json');
  if (results.has(cache)) return results.get(cache);
  if (active.has(cache)) return active.get(cache);
  const rows = db.prepare('SELECT idx FROM novel_chapters WHERE novel_id=? ORDER BY idx');
  const descriptor = book => ({ id: book.id, chapters: rows.all(book.id).map(row => row.idx) });
  const job = { root, source: descriptor(source), target: descriptor(target), cache };
  const pending = (async () => {
    try { return JSON.parse(await fs.promises.readFile(cache, 'utf8')); } catch {}
    const work = workerChain.then(() => new Promise(resolve => {
      const worker = new Worker(__filename, { workerData: job });
      worker.once('message', resolve);
      worker.once('error', () => resolve({}));
      worker.once('exit', () => resolve({}));
    }));
    workerChain = work.catch(() => {});
    return work;
  })().catch(() => {}).then(value => {
    active.delete(cache);
    results.set(cache, Promise.resolve(value || {}));
    if (results.size > 10) results.delete(results.keys().next().value);
    return value || {};
  });
  active.set(cache, pending);
  return pending;
}

async function chapter(db, root, id, index) {
  const pending = prepare(db, root, id);
  if (!pending) return { available: false, sentences: {} };
  const value = await pending;
  return { available: true, sentences: value[Number(index)] || {} };
}

module.exports = { align, chapter, prepare };
