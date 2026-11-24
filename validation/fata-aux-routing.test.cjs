// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs'),P=require('../core/profiles/index.cjs');
const fata=()=>P.profileFor({exe:'E:/GAL/海市蜃楼之馆/fata_jp.exe',engine:'KiriKiri'});
function held({active=false,shown=false,pending=true}={}){
 const h=Object.create(HookNative.prototype),delivered=[],trace=[],text='扉の向こうから声が聞こえた。';
 Object.assign(h,{profile:fata(),now:()=>5000,pageMode:{mode:'nvl',at:4900},pageState:{engine:'krkr',lines:new Map(),held:[{text,origin:'live',at:0}]},
  recentSources:[],choice:{active,items:pending?[{key:HookNative.flat(text),at:4900}]:[]},choiceOptions:pending?[text]:null,
  state:{hookChoices:shown?{items:[{text}],at:4900}:null},trace:s=>trace.push(s),deliverSource:(...a)=>delivered.push(a),schedulePageHeld(){}});
 return {h,text,delivered,trace};
}
test('pending aux/OCR candidates cannot consume a held ordinary dialogue line',()=>{
 for(const options of [{},{active:true},{shown:true}]){const r=held(options);r.h.expirePageHeld();assert.deepEqual(r.delivered,[[r.text,'live','krkr']]);}
});
test('only confirmed on-screen choice text stays with the choice layer',()=>{
 const r=held({active:true,shown:true});r.h.expirePageHeld();assert.deepEqual(r.delivered,[]);
 const q=held({active:true,shown:true});q.h.state.hookChoices.items=[{text:'違う選択肢'}];q.h.expirePageHeld();assert.deepEqual(q.delivered,[[q.text,'live','krkr']]);
});
test('a doubled menu label requires a separate recent frame and option, and cannot swallow exact script text',()=>{
 const {h}=held(),label='選択肢',option='……おはよう………………',text=label+label+option;
 h.choice.items=[{key:label,at:4900},{key:option,at:4900}];
 assert.deepEqual(h.heldChoiceParts(text),[label,option]);
 assert.equal(h.heldChoiceParts(label+option),null);
 h.originalText={};h.sourceCache=new Map([[text,{provider:h.originalText,r:{status:'exact'}}]]);
 assert.equal(h.heldChoiceParts(text),null);
 h.sourceCache.clear();h.choice.items[0].at=-100;
 assert.equal(h.heldChoiceParts(text),null);
});
test('effect-frame game: aux art rejects interleaved draws and configured UI markers',()=>{
 const h=Object.create(HookNative.prototype),located=[];Object.assign(h,{profile:fata(),now:()=>5000,trace(){},artLocate:t=>located.push(t),lastSource:'今は別の台詞を読んでいる。',recentSources:[]});
 for(const t of ['しょう……。しょう……。しょ…う…。しょ…う…。','選択肢選択肢','選択ライン選択ライン'])h.artCandidate(t);
 assert.deepEqual(located,[]);
 h.artCandidate('聖なるかな');assert.deepEqual(located,['聖なるかな'],'real title/card text still reaches art location');
});
test('effect-frame game: a recent full dialogue still excludes its late aux fragments',()=>{
 const h=Object.create(HookNative.prototype),located=[];Object.assign(h,{profile:fata(),now:()=>5000,trace(){},artLocate:t=>located.push(t),lastSource:'次の台詞が来た。',recentSources:['扉の向こうから声が聞こえた。']});
 h.artCandidate('声が聞こえた。');assert.deepEqual(located,[]);
});
test('Fata filters known UI and sound metadata from both auxiliary and selected hooks',()=>{
 const {h,out}=sourceRig(),located=[];
 h.artLocate=t=>located.push(t);
 for(const text of ['終了しますか？','リビング','コンクリートの上を歩く（革靴）女性暖炉']){
  h.auxText({text,role:0,sourceName:'Krkr2wcs'});
  h.artCandidate(text);
  h.source({text,sourceCode:'HWN-10',sourceName:'KiriKiri1'});
 }
 assert.deepEqual(located,[]);assert.deepEqual(out,[]);
 h.originalText.pageParts=t=>t==='リビング'?[t]:[];
 h.source({text:'リビング',sourceCode:'HWN-10',sourceName:'KiriKiri1'});
 assert.deepEqual(out,['リビング'],'exact script dialogue wins over a label of the same spelling');
});
test('other engines keep the existing aux art policy',()=>{
 const h=Object.create(HookNative.prototype),located=[];Object.assign(h,{profile:P.profileFor({}),now:()=>5000,trace(){},artLocate:t=>located.push(t),recentSources:[]});
 h.artCandidate('選択肢');assert.deepEqual(located,['選択肢']);
});
function sourceRig(exact=false,profile=fata()){
 const h=Object.create(HookNative.prototype),out=[];
 Object.assign(h,{profile,now:()=>5000,state:{},windowState:{},trace(){},notify(){},
  codepage:{fix:(s,text)=>({text,locked:false}),mode:()=>''},languageCheck(){},japaneseGuard(){},
  originalText:{},resolveSource:()=>exact?{status:'exact',japanese:'あいうあいうあいう'}:null,
  foreignJapanese:()=>'',originalTextFor:t=>t,locatePage(){},pageRoute:()=>false,deliverSource:t=>out.push(t)});
 return {h,out};
}
test('unmatched interleaved effect callbacks cannot become dialogue solely because the hook is wide',()=>{
 const r=sourceRig();r.h.source({text:'あいうあいうあいう',sourceCode:'HWN-10',sourceName:'KiriKiri1'});assert.deepEqual(r.out,[]);
});
test('exact script dialogue with repeated content and ordinary clean dialogue still pass',()=>{
 const exact=sourceRig(true);exact.h.source({text:'あいうあいうあいう',sourceCode:'HWN-10',sourceName:'KiriKiri1'});assert.equal(exact.out.length,1);
 const normal=sourceRig();normal.h.source({text:'扉の向こうから声が聞こえた。',sourceCode:'HWN-10',sourceName:'KiriKiri1'});assert.deepEqual(normal.out,['扉の向こうから声が聞こえた。']);
 const unknown=sourceRig();unknown.h.originalText=null;unknown.h.source({text:'あいうあいうあいう',sourceCode:'HWN-10',sourceName:'KiriKiri1'});assert.equal(unknown.out.length,1,'missing script evidence does not delete authored repetition');
});
