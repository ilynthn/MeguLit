'use strict';
/* E540 (WHITE ALBUM2 opening, live 2026-11-13): cards read by the art scan must reach the screen before they fade, junk
   reads and translator apologies never show, and a thin new line on a dark screen counts as a new picture. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {artJunk,artNoTranslation}=require('../core/art-filter.cjs');
const root=path.join(__dirname,'..');
test('OCR reads of logos and symbols are not lines; real cards are',()=>{
 for(const junk of ['ミき=ミミミ','ミ','|||','ーーー','abc def'])assert.equal(artJunk(junk),true,junk);
 assert.equal(artJunk('、ーをやま',[{h:160}],720),true);assert.equal(artJunk('初めて、好きな人ができた',[{h:38}],720),false);
 for(const line of ['どうしてこうなるんだろう…','初めて、好きな人ができた。','なのに、どうして、','第一章','嬉しいことが二つ重なって。'])assert.equal(artJunk(line),false,line);
});
test('apologies and echoes are no translation',()=>{
 assert.equal(artNoTranslation('ミき=ミミミ','抱歉，我无法翻译这段内容。'),true);
 assert.equal(artNoTranslation('开始游戏，','开始游戏。'),true);
 assert.equal(artNoTranslation('x',"I'm sorry, I can't translate that."),true);
 assert.equal(artNoTranslation('初めて、好きな人ができた','第一次有了喜欢的人。'),false);
});
test('the reader sends an art line before its translation arrives',()=>{
 const src=fs.readFileSync(path.join(root,'services','reader.cjs'),'utf8');
 const at=src.indexOf('async artText(message)');assert.ok(at>0);
 const body=src.slice(at,src.indexOf('async embedTranslate(',at));
 const early=body.indexOf("translation:''"),slow=body.indexOf('this.translator().translate(');
 assert.ok(early>0&&slow>early,'early emit precedes the translator call');
 assert.match(body,/artJunk\(text,message\.rows,message\.sh\)/);assert.match(body,/artNoTranslation\(text,translation\)/);
});
test('the art scan treats a thin new line as a changed picture',()=>{
 const cs=fs.readFileSync(path.join(root,'native','PageLocator.cs'),'utf8');
 assert.match(cs,/!Changed\(last, thumb\) && !pending/);
 assert.match(cs,/public static bool Changed\(byte\[\] a, byte\[\] b\)/);
});
test('a late translation fades in on an item already shown',()=>{
 const js=fs.readFileSync(path.join(root,'web','reader','modules','art-text.js'),'utf8');
 assert.match(js,/if\(old&&!hadCn\)cn\.classList\.add\('is-late'\)/);
 assert.match(js,/\.megulit-art-cn\.is-late\{animation:/);
});
