// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: every effect can be switched off together or one by one, and each one's strength set). The
   effect preferences, kept on this PC (localStorage, they are only about presentation). fxPref(id) → {on, k}: on is
   false when the master switch or the effect's own switch is off; k is the effect's strength, 0.2–1.5 (1 = as
   designed). The panel is fx-settings.js; the effects ask here each time they run. */
export const FX=[
 {id:'dictImpact',name:{zh:'词典 · 搜索框撞击',ja:'辞書 · 検索欄の衝突',en:'Dictionary · search box impact'},desc:{zh:'从中间搜索时，搜索框撞上顶栏、镜头运动',ja:'中央から検索したとき、検索欄が上端に当たりカメラが動く',en:'Searching from the centre slams the box into the top bar, with camera motion'}},
 {id:'dictField',name:{zh:'词典 · 背景漂浮字',ja:'辞書 · 背景の漂う文字',en:'Dictionary · drifting glyphs'},desc:{zh:'词典页背后漂浮的假名和常查词',ja:'辞書ページの背後を漂う仮名とよく調べる語',en:'Kana and your frequent words drifting behind the dictionary'}},
 {id:'explosion',name:{zh:'答错 · 爆裂魔法',ja:'不正解 · 爆裂魔法',en:'Wrong answer · Explosion'},desc:{zh:'练习答错时的爆炸、坑和烟',ja:'練習で間違えたときの爆発・穴・煙',en:'The blast, pit and smoke on a wrong answer'}},
 {id:'heal',name:{zh:'答对 · 花鸟风月',ja:'正解 · 花鳥風月',en:'Right answer · flower fountain'},desc:{zh:'答对时的水花和花瓣，修复最早的坑',ja:'正解したときの水と花びら、いちばん古い穴を直す',en:'Water and petals on a right answer, mending the oldest pit'}},
 {id:'rite',name:{zh:'转职动画',ja:'転職アニメーション',en:'Class-change animation'},desc:{zh:'转职时每个元素的粒子和爆发',ja:'転職時の各元素の粒子と爆発',en:'Each element’s particles and burst when changing class'}},
 {id:'wallBlur',name:{zh:'游戏库 · 拖动模糊',ja:'ライブラリ · ドラッグのブラー',en:'Library · drag motion blur'},desc:{zh:'快速拖动封面墙时整面墙轻微模糊',ja:'表紙の壁を素早く動かすと壁全体が少しぼける',en:'The cover wall blurs slightly while it moves fast'}},
 {id:'cardTilt',name:{zh:'游戏库 · 卡片倾斜',ja:'ライブラリ · カードの傾き',en:'Library · card tilt'},desc:{zh:'鼠标移到封面上时卡片跟着倾斜',ja:'表紙にマウスを乗せるとカードが傾く',en:'Covers tilt toward the pointer'}}
];
const KEY='megulit.fx.v1';
export function readFx(){try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return {all:v.all!==false,items:v.items&&typeof v.items==='object'?v.items:{}};}catch{return {all:true,items:{}};}}
export function writeFx(v){try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}document.dispatchEvent(new CustomEvent('megulit:fx-prefs'));}
export function fxPref(id){const v=readFx(),it=v.items[id]||{};const k=Math.min(1.5,Math.max(.2,Number(it.k)||1));return {on:v.all&&it.on!==false,k};}
