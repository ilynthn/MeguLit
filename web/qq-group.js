// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 QQ 交流群 entry on the home page: a pill beside The Seed with the group number. A click asks the service to open
   the desktop QQ's join window (tencent://groupwpa, core/qq-group.cjs); without QQ installed, or if that fails, the group
   number goes to the clipboard and QQ's official site opens, with the toast 「群号已复制」. The number shown here, in the
   README and on the website is the same (validation/qq-group.test.cjs). */
export const QQ_GROUP='1131267542';
/* QQ's join pages need a per-group key, which the project has not published; the official QQ site is where people without
   QQ get it, and the copied number is what they search for there */
export const QQ_WEB='https://im.qq.com/';
const W={
 zh:{label:'QQ 群',aria:`加入 MeguLit QQ 交流群 ${QQ_GROUP}`,copied:`群号已复制：${QQ_GROUP}`,manual:`QQ 群号：${QQ_GROUP}`},
 en:{label:'QQ group',aria:`Join the MeguLit QQ group ${QQ_GROUP}`,copied:`Group number copied: ${QQ_GROUP}`,manual:`QQ group: ${QQ_GROUP}`},
 ja:{label:'QQ グループ',aria:`MeguLit の QQ グループ ${QQ_GROUP} に参加`,copied:`グループ番号をコピーしました：${QQ_GROUP}`,manual:`QQ グループ番号：${QQ_GROUP}`}
};
export const qqWords=locale=>W[locale]||W.zh;
export function qqPillHTML(locale,esc){
 const t=qqWords(locale);
 return `<button type="button" class="qq-pill" data-qq-join aria-label="${esc(t.aria)}"><span class="qq-mark" aria-hidden="true">QQ</span><span class="qq-txt"><b>${esc(t.label)}</b><em>${esc(QQ_GROUP)}</em></span></button>`;
}
const clipboard=text=>navigator.clipboard.writeText(text);
/* returns 'qq' when the desktop QQ was asked to open the group, 'web' after the fallback */
export async function joinQQGroup({api,locale,toast,copy=clipboard}){
 try{const r=await api('open_qq_group',{uin:QQ_GROUP});if(r&&r.opened===true)return 'qq';}catch{}
 const t=qqWords(locale);let copied=false;
 try{await copy(QQ_GROUP);copied=true;}catch{}
 try{await api('open_source',{url:QQ_WEB});}catch{}
 toast?.(copied?t.copied:t.manual);
 return 'web';
}
