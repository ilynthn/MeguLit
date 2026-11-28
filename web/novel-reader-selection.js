// SPDX-License-Identifier: GPL-3.0-or-later
const matches = (node, selector) => node.parentElement?.closest(selector);

function baseNodes(para) {
  const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, {
    acceptNode: node => matches(node, 'rt, rp') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  let start = 0;
  for (let node; (node = walker.nextNode());) {
    nodes.push({ node, start, end: start + node.length });
    start += node.length;
  }
  return nodes;
}

function makeRange(node, start, end) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

export function baseRanges(para, start, end) {
  return baseNodes(para).filter(part => part.end > start && part.start < end)
    .map(part => makeRange(part.node, Math.max(0, start - part.start), Math.min(part.node.length, end - part.start)));
}

export function baseTextHit(body, x, y) {
  const at = document.elementFromPoint(x, y);
  const para = at?.closest('p[data-off]');
  if (!para || !body.contains(para) || at.closest('rt, rp')) return null;
  const caret = document.caretRangeFromPoint?.(x, y);
  if (!caret || !para.contains(caret.startContainer)) return null;
  const word = at.closest('.nr-word');
  const inside = word?.contains(caret.startContainer);
  const nodes = baseNodes(inside ? word : para);
  const part = nodes.find(item => item.node === caret.startContainer);
  if (!part) return null;
  const base = part.start + (inside ? Number(word.dataset.baseStart) : 0);

  const { node } = part;
  const point = caret.startOffset;
  // The browser returns the nearest caret, even over line ends, gutters and empty space.
  for (const offset of [point, point - 1, point - 2]) {
    if (offset < 0 || offset >= node.length || /[\uDC00-\uDFFF]/.test(node.data[offset])) continue;
    const glyph = String.fromCodePoint(node.data.codePointAt(offset));
    if (!glyph.trim()) continue;
    const end = offset + glyph.length;
    const rects = makeRange(node, offset, end).getClientRects();
    if ([...rects].some(rect => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom)) {
      return { para, word: inside ? word : null, start: base + offset, end: base + end };
    }
  }
  return null;
}

export function passageBetween(paragraphs, first, last, raw) {
  let from = paragraphs.indexOf(first.para), to = paragraphs.indexOf(last.para);
  if (from < 0 || to < 0) return [];
  if (from > to || (from === to && first.start > last.start)) {
    [from, to] = [to, from];
    [first, last] = [last, first];
  }
  return paragraphs.slice(from, to + 1).map((para, i) => ({
    para,
    start: i === 0 ? first.start : 0,
    end: from + i === to ? last.end : raw(para).length
  }));
}

export function selectionBoxes(segments, boundary, vertical, fontSize) {
  const lines = [];
  for (const { para, start, end } of segments) {
    for (const range of baseRanges(para, start, end)) {
      for (const rect of range.getClientRects()) {
        const box = { left: Math.max(rect.left, boundary.left), top: Math.max(rect.top, boundary.top),
          right: Math.min(rect.right, boundary.right), bottom: Math.min(rect.bottom, boundary.bottom) };
        if (box.right <= box.left || box.bottom <= box.top) continue;
        const line = lines.at(-1);
        const inlineGap = !line ? Infinity : vertical ? box.top - line.bottom : box.left - line.right;
        const align = line && (vertical ? Math.abs(line.left - box.left) : Math.abs(line.top - box.top));
        if (line && align < fontSize * .42 && inlineGap < fontSize * .9 && inlineGap > -fontSize * 2) {
          line.left = Math.min(line.left, box.left);
          line.top = Math.min(line.top, box.top);
          line.right = Math.max(line.right, box.right);
          line.bottom = Math.max(line.bottom, box.bottom);
        } else lines.push(box);
      }
    }
  }
  return lines;
}
