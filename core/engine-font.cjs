// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E475: which Japanese font the reader uses for a game, from what the engine reports it draws with (hookFont).
// face: the font the game's text layer uses (KiriKiri: the KAG lineLayer's font.face). prerendered: a pre-rendered glyph
// file mapped over it ([mappfont storage=mincho2.tft]); its glyphs win over the face, so when its name says another
// family (mincho / gothic) than the face, the reader takes that family instead of the face.
// fonts: the game's own bundled fonts (core/game-fonts.cjs scan); one of the same family is used before the system face.
function flat(v){return String(v||'').replace(/[\s　]/g,'').normalize('NFKC').toLowerCase();}
function familyClass(name){const n=flat(name);if(!n)return '';
 if(/mincho|明朝|minchou|serif|ming|song|宋|ｍｉｎ/.test(n)||/(^|[^a-z])min(\d|[^a-z]|$)/.test(n))return 'mincho';
 if(/gothic|ゴシック|goth|sans|meiryo|メイリオ|hei|黑|丸ゴ|round/.test(n))return 'gothic';
 return '';}
function pick({face,prerendered,fonts}={}){
 face=String(face||'').trim().slice(0,64);if(!face||/["\<>;{}]/.test(face))return null;
 const want=familyClass(String(prerendered||'').replace(/\.[a-z0-9]+$/i,'')),have=familyClass(face);
 if(want&&have&&want!==have)return {key:want==='mincho'?'originalMincho':'originalGothic',face,reason:'prerendered '+prerendered};
 const hit=(fonts||[]).find(f=>f&&f.lang!=='zh'&&[f.family,...(Array.isArray(f.names)?f.names:[])].some(n=>flat(n)===flat(face)));
 return {key:hit?'game:'+hit.id:'engine:'+face,face,reason:hit?'bundled':'face'};}
/* Which report wins for a game: an engine's own report (KiriKiri lineLayer) over the font probe (GDI/GDI+/DirectWrite draw
   counts); among probe reports the newest leader. */
/* Windows UI faces: a launcher, title-bar or message box drawn before any dialogue (live: ファタモルガーナの館 / WA2 start-up\r
   reported Segoe UI); never the dialogue font. */
const UI_FACE=/^(segoe ui.*|tahoma|ms shell dlg.*|system|ms sans serif|marlett|microsoft sans serif|yu gothic ui|meiryo ui|ms ui gothic|arial|verdana)$/i;
function uiFace(face){return UI_FACE.test(String(face||'').trim());}
function rank(message){return message&&message.probe?1:2;}
module.exports={pick,familyClass,rank,uiFace};
