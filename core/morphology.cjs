// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const rows={'う':['わ','い','え','お'],'く':['か','き','け','こ'],'ぐ':['が','ぎ','げ','ご'],'す':['さ','し','せ','そ'],'つ':['た','ち','て','と'],'ぬ':['な','に','ね','の'],'ぶ':['ば','び','べ','ぼ'],'む':['ま','み','め','も'],'る':['ら','り','れ','ろ']};
const kata=s=>String(s||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
function conjugation(group,language='zh'){
 const tokens=group.parts||[group],first=tokens[0]||group,base=group.derived_from||group.base_form||first.base_form||group.surface,surface=group.surface||'',grammar=first.grammar||[],type=grammar[4]||'',form=grammar[5]||'',aux=tokens.slice(1),forms=[],rules=[];
 const godan=type.startsWith('五段')||group.derivation==='potential',ichidan=/[上下]一段/.test(type)&&!group.derivation,suru=type.includes('サ行変格'),kuru=type.includes('カ行変格'),adjective=first.pos==='形容詞',last=[...base].at(-1),row=rows[last];
 const add=(name,rule)=>{if(!forms.includes(name))forms.push(name);if(rule&&!rules.includes(rule))rules.push(rule);};
 const hasBase=s=>aux.some(t=>t.base_form===s),hasType=s=>aux.some(t=>(t.grammar?.[4]||'').includes(s)),hasSurface=s=>aux.some(t=>t.surface===s),hasPassive=hasType('助動詞-レル'),causative=aux.some(t=>['せる','させる'].includes(t.base_form));
 function stemRule(kind,ending){if(godan&&row){const i={a:0,i:1,e:2,o:3}[kind];return last+'→'+row[i]+(ending?'＋'+ending:'');}if(ichidan)return '去る＋'+ending;if(suru)return 'する→'+({a:'し',i:'し',e:'すれ',o:'し'}[kind]||'し')+(ending?'＋'+ending:'');if(kuru)return '来る（くる）→'+(kind==='a'?'こ':kind==='e'?'くれ':kind==='o'?'こ':'き')+(ending?'＋'+ending:'');return '';}
 function taRule(ending){if(ichidan)return '去る＋'+ending;if(suru)return 'する→し＋'+ending;if(kuru)return '来る（くる）→き＋'+ending;if(!godan)return '';
  if(base==='行く'||base==='往く')return 'く→っ＋'+ending+'（行く的例外音便）';if(['う','つ','る'].includes(last))return last+'→っ＋'+ending;if(['む','ぶ','ぬ'].includes(last))return last+'→ん＋'+(ending==='て'?'で':'だ');if(last==='く')return 'く→い＋'+ending;if(last==='ぐ')return 'ぐ→い＋'+(ending==='て'?'で':'だ');if(last==='す')return 'す→し＋'+ending;return '';}
 if(group.derivation==='potential')add('可能形',stemRule('e','る'));
 if(/意志推量/.test(form)){add('意志形',godan?stemRule('o','う'):ichidan?'去る＋よう':suru?'する→しよう':kuru?'来る（くる）→こよう':'');}
 if(/命令/.test(form)){add('命令形',godan?stemRule('e',''):ichidan?'去る＋'+(surface.endsWith('よ')?'よ':'ろ'):suru?'する→'+surface:kuru?'来る（くる）→こい':'');}
 if(causative&&hasPassive)add('使役受身',godan?stemRule('a','せる')+'→去る＋られる':ichidan?'去る＋させる→去る＋られる':suru?'する→させられる':kuru?'来る→こさせられる':'');
 else if(causative)add('使役形',godan?stemRule('a','せる'):ichidan?'去る＋させる':suru?'する→させる':kuru?'来る→こさせる':'');
 else if(hasPassive)add('れる／られる形',godan?stemRule('a','れる'):ichidan?'去る＋られる':suru?'する→さ＋れる':kuru?'来る（くる）→こ＋られる':'');
 const polite=hasType('助動詞-マス'),politeNegative=polite&&hasType('助動詞-ヌ');
 if(hasBase('ない'))add('否定形',adjective?'去い＋くない':stemRule('a','ない'));
 if(polite)add(politeNegative?'礼貌否定形':'礼貌形',stemRule('i',politeNegative?'ません':'ます'));
 if(hasBase('たい'))add('愿望形',stemRule('i','たい'));
 const past=hasType('助動詞-タ'),tara=aux.some(t=>(t.grammar?.[4]||'').includes('助動詞-タ')&&(t.grammar?.[5]||'').includes('仮定'));
 if(past){if(politeNegative)add('礼貌过去否定','ません→ませんでした');else if(hasBase('ない'))add('过去否定','ない→なかった');else if(polite)add('过去礼貌','ます→ました');else{const outer=aux.filter(t=>t.pos==='動詞'||t.pos==='助動詞'&&!String(t.grammar?.[4]).includes('助動詞-タ')).at(-1);add('た形／过去形',outer?.base_form?.endsWith('る')?outer.base_form+'→'+outer.base_form.slice(0,-1)+'＋た':adjective?'去い＋かった':taRule('た'));}if(tara)add('たら形／条件','た形＋ら（条件，不单独断定为过去时）');}
 if(hasSurface('て')||hasSurface('で')){add('て形',taRule('て'));if(aux.some(t=>['いる','居る'].includes(t.base_form)))add('ている形','て形＋いる（进行／结果状态，需结合语境）');}
 if(hasSurface('ば'))add('ば形／假定形',adjective?'去い＋ければ':stemRule('e','ば'));
 if(!forms.length&&surface!==base&&/連用/.test(form))add('连用形',godan?stemRule('i',''):ichidan?'去る':suru?'する→し':kuru?'来る（くる）→き':'');
 const wordClass=godan?'五段动词（一类）':ichidan?(type.startsWith('上一段')?'上一段动词（二类）':'下一段动词（二类）'):suru?'サ变动词（三类）':kuru?'カ变动词（三类）':adjective?'い形容词':first.pos==='形状詞'?'な形容词':first.pos||'';
 const ambiguity=hasPassive&&!causative?'れる／られる可能表示受身、可能、自发或尊敬；仅靠词形不能确定这里是哪一种':'';
 const lookup=group.lookup_from||group.derived_from||'';
 const lookupReading=group.suru_noun?.reading?kata(group.suru_noun.reading):'';
 const normalized=group.normalized||'';
 if(language==='en'){const labels={'意志形':'Volitional','命令形':'Imperative','可能形':'Potential','否定形':'Negative','礼貌形':'Polite','礼貌否定形':'Polite negative','礼貌过去否定':'Polite past negative','过去否定':'Past negative','过去礼貌':'Polite past','たら形／条件':'Conditional (-tara)','た形／过去形':'Past / ta form','て形':'Te form','ている形':'Te-iru form','愿望形':'Desiderative','ば形／假定形':'Conditional (-ba)','れる／られる形':'-reru / -rareru form','使役形':'Causative','使役受身':'Causative passive','连用形':'Continuative'};return {base,lookup,lookupReading,normalized,surface,wordClass:godan?'Godan verb (class 1)':ichidan?'Ichidan verb (class 2)':suru?'Suru verb (class 3)':kuru?'Kuru verb (class 3)':adjective?'I-adjective':first.pos,forms:forms.map(f=>labels[f]||f),rules:rules.map(r=>r.replace(/去る/g,'drop る').replace(/去い/g,'drop い').replace('（行く的例外音便）',' (exceptional stem for 行く)').replace('（进行／结果状态，需结合语境）',' (progressive/resultative; context required)').replace('た形＋ら（条件，不单独断定为过去时）','ta form + ら (condition; not necessarily past tense)')),reading:kata(tokens.map(t=>t.reading||'').join('')),ambiguity:ambiguity?'This form may be passive, potential, spontaneous or honorific; context is required.':'',source:'SudachiDict Full conjugation tags + local inflection rules'};}
 return {base,lookup,lookupReading,normalized,surface,wordClass,forms,rules,reading:kata(tokens.map(t=>t.reading||'').join('')),ambiguity,source:'SudachiDict Full 活用信息＋本地规则'};
}
module.exports={conjugation,rows};
