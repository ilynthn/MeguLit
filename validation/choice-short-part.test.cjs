'use strict';
/* RRFZ #1198: the "characters of the line in order" rule dropped short real choices: 「学校」 and 「自宅」 both occur letter by letter in
   「今日は学校に行くか、それとも家に帰るか……」, so a reset with that line left one option and no choice screen. */
const test=require('node:test'),assert=require('node:assert/strict'),{ChoiceCapture}=require('../core/choice-capture.cjs');
test('short quoted choices survive a line that merely contains their characters',()=>{
 let t=1000;const c=new ChoiceCapture(()=>t);const line='「今日は学校に行くか、それとも家に帰るか……」';
 c.add('「学校」\n「自宅」','前の台詞。');t+=100;
 c.noteDialogue(line,'');c.reset(400,line);
 assert.deepEqual(c.options(),['「学校」','「自宅」']);
});
test('a quoted piece of the line itself is still dropped',()=>{
 let t=1000;const c=new ChoiceCapture(()=>t);const line='「今日は学校に行くか、それとも家に帰るか……」';
 c.add('「今日は学校」\n「自宅」\n「図書館」','前の台詞。');t+=100;
 c.noteDialogue(line,'');c.reset(400,line);
 assert.deepEqual(c.options(),['「自宅」','「図書館」'],'its beginning');
 let u=1000;const d=new ChoiceCapture(()=>u);
 d.add('「今日は学校に行く」\n「自宅」\n「図書館」','前の台詞。');u+=100;
 d.noteDialogue(line,'');d.reset(400,line);
 assert.deepEqual(d.options(),['「自宅」','「図書館」'],'a long piece in order');
 let v=1000;const e=new ChoiceCapture(()=>v);
 e.add('「帰る」\n「自宅」\n「図書館」','前の台詞。');v+=100;
 e.noteDialogue('「帰るか」','');e.reset(400,'「帰るか」');
 assert.deepEqual(e.options(),['「自宅」','「図書館」'],'a short piece that is most of a short line');
});
