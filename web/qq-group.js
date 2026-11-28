// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 QQ 交流群 entry on the home page: a capsule beside The Seed; the group number is in the hover tip and on the QR card. Pointing at it or clicking it
   opens a small card (the reader's tip look: dark, rounded, soft shadow, fades in): the group's QR code
   (assets/qq-group-qr.svg, made by tools/build-qq-qr.py from the group's join link), the number with a copy button, and
   「用电脑 QQ 加群」. That button opens the group's join page in the browser, which hands over to the desktop QQ (owner,
   2026-11-28: the new desktop QQ answers its own groupwpa protocol link with 「加群参数不合法」, so that route is gone); if the page
   cannot be opened the number is copied, with the toast 「群号已复制」. The number and link here, in the README and on the
   website are the same (validation/qq-group.test.cjs). */
export const QQ_GROUP='1131267542';
/* the group's join page, read from the QR card QQ made for the group; it opens QQ (or asks to install it) on any device */
export const QQ_WEB='https://qm.qq.com/q/C95LXYb5Sg';
export const QQ_QR='assets/qq-group-qr.svg';
const W={
 zh:{label:'QQ 交流群',aria:`加入 MeguLit QQ 交流群 ${QQ_GROUP}`,copied:`群号已复制：${QQ_GROUP}`,manual:`QQ 群号：${QQ_GROUP}`,
  numberTip:`群号 ${QQ_GROUP}`,title:'MeguLit 交流群',scan:'用手机 QQ 扫码加入',number:'群号',copy:'复制',copiedShort:'已复制',open:'用电脑 QQ 加群',qr:`QQ 群 ${QQ_GROUP} 二维码`},
 en:{label:'QQ group',aria:`Join the MeguLit QQ group ${QQ_GROUP}`,copied:`Group number copied: ${QQ_GROUP}`,manual:`QQ group: ${QQ_GROUP}`,
  numberTip:`Group ${QQ_GROUP}`,title:'MeguLit QQ group',scan:'Scan with QQ on your phone',number:'Group',copy:'Copy',copiedShort:'Copied',open:'Join with QQ on this PC',qr:`QR code of QQ group ${QQ_GROUP}`},
 ja:{label:'QQ グループ',aria:`MeguLit の QQ グループ ${QQ_GROUP} に参加`,copied:`グループ番号をコピーしました：${QQ_GROUP}`,manual:`QQ グループ番号：${QQ_GROUP}`,
  numberTip:`グループ ${QQ_GROUP}`,title:'MeguLit の QQ グループ',scan:'スマホの QQ でスキャンして参加',number:'番号',copy:'コピー',copiedShort:'コピー済み',open:'PC の QQ で参加',qr:`QQ グループ ${QQ_GROUP} の QR コード`}
};
export const qqWords=locale=>W[locale]||W.zh;
export function qqPillHTML(locale,esc){
 const t=qqWords(locale);
 return `<div class="qq-anchor"><button type="button" class="qq-pill tv-cap" data-qq-join title="${esc(t.numberTip)}" aria-label="${esc(t.aria)}" aria-expanded="false" aria-controls="qq-card"><svg class="cap-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5z"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" stroke-width="2.2"/></svg><span class="cap-txt">${esc(t.label)}</span></button>`+
  `<div class="qq-card" id="qq-card" role="dialog" aria-label="${esc(t.title)}" hidden><img class="qq-qr" src="${QQ_QR}" width="176" height="176" alt="${esc(t.qr)}"><b class="qq-card-title">${esc(t.title)}</b><small>${esc(t.scan)}</small>`+
  `<div class="qq-card-no"><span>${esc(t.number)}</span><code>${esc(QQ_GROUP)}</code><button type="button" data-qq-copy>${esc(t.copy)}</button></div>`+
  `<button type="button" class="qq-card-open" data-qq-open>${esc(t.open)}</button></div></div>`;
}
const clipboard=text=>navigator.clipboard.writeText(text);
/* returns 'web' when the join page was opened, 'copied' when it could not be and the number was offered instead */
export async function joinQQGroup({api,locale,toast,copy=clipboard}){
 try{const r=await api('open_source',{url:QQ_WEB});if(!r||r.opened!==false)return 'web';}catch{}
 const t=qqWords(locale);let copied=false;
 try{await copy(QQ_GROUP);copied=true;}catch{}
 toast?.(copied?t.copied:t.manual);
 return 'copied';
}
/* the card: pointing at the pill opens it and leaving closes it shortly after, unless a click pinned it; Escape and a
   click elsewhere close a pinned card */
export function wireQQCard(anchor,{api,locale,toast,copy=clipboard,doc=anchor.ownerDocument}){
 const pill=anchor.querySelector('.qq-pill'),card=anchor.querySelector('.qq-card'),t=qqWords(locale);let pinned=false,timer=0;
 const show=on=>{clearTimeout(timer);if(card.hidden===!on)return;card.hidden=!on;pill.setAttribute('aria-expanded',String(on));if(on)requestAnimationFrame?.(()=>card.classList.add('qq-card-in'));else{card.classList.remove('qq-card-in');pinned=false;}};
 anchor.addEventListener('pointerenter',()=>show(true));
 anchor.addEventListener('pointerleave',()=>{if(!pinned){clearTimeout(timer);timer=setTimeout(()=>show(false),260);}});
 pill.addEventListener('click',()=>{if(card.hidden||!pinned){pinned=true;show(true);}else show(false);});
 const copyButton=card.querySelector('[data-qq-copy]');
 copyButton.addEventListener('click',async()=>{try{await copy(QQ_GROUP);copyButton.textContent=t.copiedShort;setTimeout(()=>{copyButton.textContent=t.copy;},1600);}catch{toast?.(t.manual);}});
 card.querySelector('[data-qq-open]').addEventListener('click',()=>joinQQGroup({api,locale,toast,copy}));
 const outside=e=>{if(pinned&&!anchor.contains(e.target))show(false);};
 const key=e=>{if(e.key==='Escape'&&!card.hidden){show(false);pill.focus();}};
 doc.addEventListener('pointerdown',outside,true);doc.addEventListener('keydown',key);
 return {show,stop:()=>{doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',key);clearTimeout(timer);}};
}
