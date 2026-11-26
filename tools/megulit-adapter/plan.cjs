// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter, the choices a machine can make for one game, from evidence only (pure: no files, no game run).
   plan({caps, probe}) -> {
     source  {kind:'script', reader, lines, japaneseLines, original?}   RRFZ's reader read the Japanese: it is the text, the draw hook
                                                                         (or the hook stream) only aligns it to the screen
             {kind:'hook', via:'draw-roles'|'kag'|'hook', why}           no reader read Japanese: the live text is the only source
     align   'draw-roles' | 'kag' | 'hook'                               what the cold test reads the screen order from
     pairing {mode:'script'|'patch'|'machine', reader, chineseLines, how}  -> the seed's lang.ja.pairing
     hide    {kind:'engine', how, file} | {kind:'generic', how}          an engine-level hide first, the GDI / GPU layers otherwise
     notes   [what the plan could not decide] }
   A reader counts when it read at least MIN_JP Japanese lines (adapter-probe-core's DEDICATED_JP); the probe's own classify() said
   which reader that is (probe.detected). */
const MIN_JP=30,ZH_SHARE=0.3;
function alignOf(caps){const d=caps?.draw||[];if(d.some(x=>x.kind==='kag'))return 'kag';if(d.some(x=>x.kind==='roles'))return 'draw-roles';return 'hook';}
function plan({caps={},probe=null}={}){const notes=[],align=alignOf(caps);
 const step=probe?.step||'',detected=probe?.detected||'',jp=probe?.japaneseLines|0;
 let source;
 if(detected&&jp>=MIN_JP&&(step==='ok'||step==='chinese-build'&&probe.original))source={kind:'script',reader:detected,lines:probe.lines|0,japaneseLines:jp,...(probe.original?{original:probe.original}:{})};
 else{source={kind:'hook',via:align,why:step?step+(probe?.detail?':'+probe.detail:''):'no probe'};
  if(step==='decrypt-failed'||step==='unknown-pack'||step==='unsupported-engine'||step==='parse-failed')notes.push('剧本读不出（'+source.why+'）：这是引擎层读取器的活（services/original-engines），先用钩子流');}
 /* a Chinese build: the probe says so, or Chinese lines are a real share of the Japanese (a Japanese script always has some Han-only
    lines: names, labels; 千恋＊万花 241 of 53k, ISLAND 321 of 42k are not a Chinese build) */
 const chinese=probe?.chineseLines|0,zhBuild=step==='chinese-build'||chinese>=Math.max(MIN_JP,jp*ZH_SHARE);
 const own=(caps.pairing||[]).filter(p=>source.kind==='script'&&p.startsWith(source.reader+':'));
 let pairing;
 if(source.kind==='script'&&zhBuild)pairing={mode:'patch',reader:source.reader,chineseLines:chinese,how:own.join(',')||'original-text align'};
 else if(source.kind==='script'&&own.some(p=>/:column$/.test(p)))pairing={mode:'script',reader:source.reader,chineseLines:chinese,how:own.filter(p=>/:column$/.test(p)).join(',')};
 else if(source.kind==='script')pairing={mode:'script',reader:source.reader,chineseLines:0,how:'zero-latency script lines, translated'};
 else pairing={mode:'machine',reader:'',chineseLines:0,how:'no script: live lines translated'};
 const eh=(caps.hide||[])[0];
 if(eh?.caveat)notes.push(eh.caveat);
 const hide=eh?{kind:'engine',how:eh.how,file:eh.file}:{kind:'generic',how:(caps.genericHide||[]).map(h=>h.how).join(' / ')||'GDI / GPU glyph layers'};
 if(!eh)notes.push('这个引擎没有引擎级隐藏：靠通用 GDI / GPU 层，过不了就只能读模式');
 if(caps.known===false)notes.push('规则表里没有这个引擎：学到的特征写回 tools/megulit-adapter/engines.cjs RULES');
 return {source,align,pairing,hide,notes};}
/* which steps run alone and which stop for a person (the skill and the PR show this list) */
const STEPS=[
 ['identify','认游戏：VNDB 作品号 + 发行版、HANDOFF 已适配表','auto；作品号或发行版不知道 → 问人'],
 ['engine','认引擎：registry 指纹 + 封包指纹','auto；认不出 → 问人'],
 ['source','原文来源：RRFZ 剧本读取优先，画字钩子 / 钩子流对齐兜底','auto'],
 ['pairing','汉化配对：读取器的 patch / column / underlay','auto'],
 ['hide','隐藏方式：引擎级优先，通用 GDI / GPU 兜底','auto'],
 ['cold','冷测试 + Cardinal（隐藏桌面，静音）','auto'],
 ['screens','看截图：原文藏住、选项有译文','问人（证据截图）'],
 ['stuck','卡在画面上（标题、改名、黑屏）','问人（证据截图）'],
 ['readmode','隐藏不过只能读模式','问人'],
 ['seed','生成 The Seed 游戏层 + 版本层（带封包 / 剧本指纹）','auto'],
 ['publish','开 PR、登记 HANDOFF','人答完才做（publish --go）'],
];
module.exports={plan,alignOf,STEPS,MIN_JP};
