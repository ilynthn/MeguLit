// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 「差分只能是数据，绝不能带代码；服务端校验键和值域」) the value domain of every key of core/profiles/defaults.cjs.
   A game diff that comes from outside the repository (this PC's calibration, the relay's shared or official diff) passes clean()
   before it becomes a profile layer: unknown keys and values outside their domain are dropped (and listed), so shared data can
   only choose among the behaviours the kernel already has. The same file runs in the relay (relay/src/auto-profile.js) and in
   the app (services/auto-profile-feed.cjs). validation/profile-domains.test.cjs fails when a key of defaults.cjs has no domain.
   Kinds: enum (the listed values), bool, number [min,max] (nullable when listed), rect {x,y,w,h[,client]}, regexList (RegExp
   sources with flags 'u': no backreferences, no nested quantifiers, bounded size). */
const DOMAINS={
 'source.artemisQuoteSpans':{bool:true,layer:'version'},
 'source.autoSelectSkip':{regexList:{max:16,chars:100},layer:'version'},
 'source.keepStream':{regexList:{max:8,chars:100},layer:'game'},
 'source.stripCodes':{regexList:{max:16,chars:100}},
 'source.embedGlyphPieces':{regexList:{max:8,chars:100},layer:'game'},
 'source.firstGlyphSiblings':{bool:true},
 'source.siglusDbsNameColumn':{number:[0,2147483647],nullable:true,int:true,layer:'version'},
 'source.versionMatch':{enum:['exe','prints']},
 'placement.firstLineAnchor':{enum:[null,'glyph','box','page']},
 'placement.dialogueArea':{rect:true,nullable:true},
 'placement.lineOffsetY':{number:[-400,400]},
 'placement.drawWhileBlanking':{bool:true},
 'placement.translationGrowsDown':{bool:true},'placement.orphanDraw':{bool:true},
 'page.effectFrames':{enum:[null,true,false]},
 'page.presentation':{enum:[null,'adv','nvl','mixed'],layer:'version'},
 'page.flowPage':{enum:[null,true,false]},
 'page.holdMs':{number:[0,20000],nullable:true},
 'page.pairByDrawn':{bool:true},
 'page.reportClear':{bool:true},'page.engineRows':{enum:[null,true,false]},
 'page.keepHeld':{bool:true},
 'page.filterHookRedraws':{bool:true},
 'page.hookAnnotationPatterns':{regexList:{max:16,chars:100}},
 'page.skipMergedTail':{number:[20,400],nullable:true,int:true},
 'choice.contentInterleave':{bool:true},
 'choice.dropEffectFrames':{bool:true},
 'choice.selectRecords':{bool:true},
 'safeMode.effectJudge':{bool:true},
 'choice.filters':{regexList:{max:20,chars:200}},
 'choice.pageFrames':{regexList:{max:20,chars:200}},
 'hide.textEffectsRead':{bool:true},
 'hide.preflight':{enum:[null,true,false]},
 'hide.drawsHidden':{enum:[null,true,false]},
 'hide.engineTrial.enabled':{enum:[null,true,false],layer:'version'},
 'hide.engineTrial.unconfirmedLines':{number:[1,10],nullable:true,int:true,layer:'version'},
 'hide.engineTrial.clickMs':{number:[100,10000],nullable:true,int:true,layer:'version'},
 'hide.engineTrial.skipAside':{enum:[null,true,false],layer:'version'},
 'hide.glyphAfterLine':{bool:true},
 'hide.gpuBodyRecheck':{bool:true},
 'choice.ocrLoose':{bool:true},
 'selfCheck.window':{number:[5,200]},
 'selfCheck.minLines':{number:[1,200]},
 'selfCheck.hideVisible':{number:[0,1]},
 'selfCheck.dropRate':{number:[0,1]},
 'selfCheck.repeatRate':{number:[0,1]},
 'selfCheck.choiceMismatch':{number:[0,100]},
 'selfCheck.positionPx':{number:[0,4000]},
 'selfCheck.pairRate':{number:[0,1]},
 'calibrate.positionSource':{enum:[null,'engine','glyph','ocr']},
 'calibrate.textBox':{rect:true,nullable:true},
 'calibrate.hideMethod':{enum:[null,'hide','engine','glyph','gpu','read']},
 'draw.roles':{bool:true},
 'draw.advhdInput':{bool:true,layer:'version'},
 'draw.cmvsInput':{bool:true,layer:'version'},
 'draw.fvpInput':{bool:true,layer:'version'},
 'draw.minoriInput':{bool:true,layer:'version'},
 'draw.spikechunsoftInput':{bool:true,layer:'version'},
 'draw.kemcoSprites':{bool:true,layer:'version'},
 'draw.embed':{bool:true,layer:'version'},
 'draw.embedTranslation':{bool:true,layer:'version'},
 'draw.engineTable':{engineTable:true,nullable:true,layer:'version'},
 'draw.viaRoles':{regexList:{max:16,chars:64},layer:'version'},
 'lang':{langMap:true},
 'library.partLabels':{partLabels:true,nullable:true},
 'safeMode.redrawRate':{number:[0,120],nullable:true},
 /* Cardinal scoring rules (core/cardinal/score.cjs, defaults.cjs cardinal): numbers only, never a user preference */
 'cardinal.rev':{number:[1,100000],int:true},
 'cardinal.lines':{number:[10,400],int:true},
 'cardinal.maxGapMs':{number:[200,10000],int:true},
 'cardinal.sampleMs':{number:[30,1000],int:true},
 'cardinal.minIntervalMin':{number:[0,1440]},
 'cardinal.maxLagMs':{number:[10,5000]},
 'cardinal.weights.row':{number:[0,100]},'cardinal.weights.stable':{number:[0,100]},'cardinal.weights.clean':{number:[0,100]},'cardinal.weights.clear':{number:[0,100]},
 'cardinal.weights.choice':{number:[0,100]},'cardinal.weights.pair':{number:[0,100]},'cardinal.weights.leak':{number:[0,100]},
 'cardinal.thresholds.settleMs':{number:[0,5000]},
 'cardinal.thresholds.shownRate':{number:[0,1]},
 'cardinal.thresholds.stablePx':{number:[0,200]},
 'cardinal.thresholds.cnOverlapPx':{number:[0,200]},
 'cardinal.thresholds.lineMs':{number:[100,10000]},
 'cardinal.thresholds.burstMs':{number:[0,5000]},
 'cardinal.thresholds.calibGapMs':{number:[100,10000]},
 'cardinal.thresholds.calibWatchMs':{number:[500,20000]},
 'cardinal.thresholds.choiceMs':{number:[200,20000]},
 'cardinal.thresholds.staleChars':{number:[1,40],int:true},
 'cardinal.thresholds.preflightMs':{number:[0,10000]},
};
/* lang.<bcp47>.{annotation, pairing, dictionary, fontFallback}: known fields are checked strictly, unknown fields of a block are
   dropped (an older client reading a newer diff); -> the cleaned map, or null when a known field is out of its domain */
const LANG_TAG=/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
const LANG_FIELDS={annotation:v=>['ruby','ipa','pinyin','none'].includes(v),pairing:v=>['script','patch','machine','none'].includes(v),
 dictionary:v=>typeof v==='string'&&/^[a-z0-9][a-z0-9.-]{0,39}$/.test(v),fontFallback:v=>Array.isArray(v)&&v.length<=8&&v.every(f=>typeof f==='string'&&f&&f.length<=80&&!/[\/]/.test(f))};
function langMap(v){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>16)return null;const out={};
 for(const [tag,block] of Object.entries(v)){if(!LANG_TAG.test(tag)||!block||typeof block!=='object'||Array.isArray(block))return null;const b={};
  for(const [k,x] of Object.entries(block)){if(!(k in LANG_FIELDS))continue;if(x===null)continue;if(!LANG_FIELDS[k](x))return null;b[k]=Array.isArray(x)?x.slice():x;}out[tag]=b;}
 return out;}
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const tableValue=x=>typeof x==='string'&&/^[A-Za-z0-9_.-]{1,40}$/.test(x)||typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=0x7fffffff;
/* a RegExp source that cannot blow up: compiles, no backreference, no quantified group that itself repeats */
function safeRegex(src,chars=200){if(typeof src!=='string'||!src||src.length>chars)return false;if(/\\[1-9]|\\k</.test(src))return false;if(/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/.test(src))return false;try{new RegExp(src,'u');return true;}catch{return false;}}
function okValue(d,v){
 if(v===null)return !!d.nullable||(d.enum||[]).includes(null);
 if(d.enum)return d.enum.includes(v);
 if(d.bool)return typeof v==='boolean';
 if(d.number)return typeof v==='number'&&Number.isFinite(v)&&v>=d.number[0]&&v<=d.number[1]&&(!d.int||Number.isInteger(v));
 if(d.rect){if(!plain(v))return false;const keys=Object.keys(v);if(!keys.every(k=>['x','y','w','h','client'].includes(k)))return false;
  if(!['x','y','w','h'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&Math.abs(v[k])<=100000))return false;
  return v.client===undefined||Array.isArray(v.client)&&v.client.length===2&&v.client.every(n=>typeof n==='number'&&n>0&&n<=100000);}
 if(d.langMap)return langMap(v)!==null;
 /* library.partLabels (core/library.cjs steamParts): {'.': root label, '<folder>': part label}, a folder name, never a path */
 if(d.partLabels)return plain(v)&&Object.keys(v).length>=1&&Object.keys(v).length<=16&&Object.entries(v).every(([k,x])=>(k==='.'||/^[^\/:*?"<>|]{1,64}$/.test(k)&&k!=='..')&&typeof x==='string'&&x.trim()&&x.length<=40);
 /* draw.engineTable: one exe's addresses for an engine DLL (data only: module offsets, small numbers, names) */
 if(d.engineTable)return plain(v)&&/^[a-z0-9]{1,16}$/.test(String(v.engine||''))&&Object.keys(v).length<=32&&Object.entries(v).every(([k,x])=>/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(k)&&(tableValue(x)||Array.isArray(x)&&x.length<=8&&x.every(tableValue)));
 if(d.regexList)return Array.isArray(v)&&v.length<=d.regexList.max&&v.every(s=>safeRegex(s,d.regexList.chars));
 return false;}
/* settings (a nested layer) -> {value, rejected}: only domain keys with in-domain values survive (any depth: hide.engineTrial.*) */
const groups=new Set(Object.keys(DOMAINS).flatMap(k=>{const p=k.split('.'),out=[];for(let i=1;i<p.length;i++)out.push(p.slice(0,i).join('.'));return out;}));
function clean(settings){const value={},rejected=[];if(!plain(settings))return {value,rejected:settings==null?[]:['(not an object)']};
 const walk=(obj,at,out)=>{for(const [k,v] of Object.entries(obj)){const p=at?at+'.'+k:k,d=DOMAINS[p];
  if(d){if(okValue(d,v))out[k]=d.langMap?langMap(v):Array.isArray(v)?v.slice():plain(v)?JSON.parse(JSON.stringify(v)):v;else rejected.push(p);continue;}
  if(groups.has(p)&&plain(v)){const inner={};walk(v,p,inner);if(Object.keys(inner).length)out[k]=inner;continue;}
  if(plain(v)&&Object.keys(v).length){for(const c of Object.keys(v))rejected.push(p+'.'+c);continue;}rejected.push(p);}};
 walk(settings,'',value);return {value,rejected};}
/* every leaf of a defaults tree (for the test that keeps DOMAINS complete) */
function leaves(tree,at=''){const out=[];for(const [k,v] of Object.entries(tree))if(plain(v)&&Object.keys(v).length)out.push(...leaves(v,at+k+'.'));else out.push(at+k);return out;}
/* 2026-11-21 (owner: 差分分版本层和游戏层) which layer a key belongs to:
   version  only for one exe (its native hook, signature offsets, exe-only switches): used when the exe itself matched (exe hash or
            the probe's size + first/last MiB hash / PE time stamp)
   game     for every version of the game (text box, effect frames, choice filters, hide method, self-check, placement): used when
            the exe or the game identity matched (archive fingerprint, Steam app id, VNDB id, title)
   Every key is labelled (DOMAINS[k].layer); a key not marked 'version' is a game key. */
for(const d of Object.values(DOMAINS))if(d.layer!=='version')d.layer='game';
const layerOf=key=>DOMAINS[key]?.layer==='version'?'version':'game',tierOf=layerOf;
/* settings -> {version, game}: the same nested shape, each key in its tier's half */
function split(settings){const out={version:{},game:{}};const walk=(obj,at,dst)=>{for(const [k,v] of Object.entries(obj||{})){const p=at?at+'.'+k:k;
  if(DOMAINS[p]){let o=dst[layerOf(p)];const path=p.split('.');for(const seg of path.slice(0,-1))o=o[seg]||(o[seg]={});o[path.at(-1)]=v;continue;}
  if(plain(v))walk(v,p,dst);}};walk(settings,'',out);return out;}
module.exports={langMap,LANG_TAG,layerOf,tierOf,split,DOMAINS,clean,okValue,safeRegex,leaves};
