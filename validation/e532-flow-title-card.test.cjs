// E532 (user: ファタモルガーナの館 opening 「館がある」「聖なるかな」 had no translation). Replay of the live hook log 2026-11-13:
// on a flow-page game the card came through Krkr2wcs, was dropped as menu/help and switched the selected stream every 2 s,
// which resent 「その瞬間、私は死体を見下ろしていた。」 (sequence 1..181) and kept the art scan off. Cards now go to the art path.
const test=require('node:test'),assert=require('node:assert');
const {HookNative}=require('../core/hook-native.cjs');

function fixture(t){
 let now=1e6;const events=[],art=[],selects=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 hook.flowPage=true;hook.artLocate=text=>art.push(text);hook.process={stdin:{write(){},end(){}},kill(){}};hook.select=id=>selects.push(id);
 hook.state.hookThreads=[{id:'575310',selected:true,sample:'聖なるかな',embeddable:true},{id:'5240d0',selected:false,sample:'その瞬間、私は死体を見下ろしていた。'}];
 return {hook,art,selects,line:text=>hook.source({text,sourceName:'Krkr2wcs',origin:'live'},''),tick:ms=>{now+=ms;}};
}

test('title cards are located as art text, not dropped, and the stream is not switched',t=>{
 const f=fixture(t);
 for(const card of ['館がある','聖なるかな']){f.line(card);f.tick(2500);f.line(card);f.tick(25000);}
 assert.ok(f.art.includes('館がある')&&f.art.includes('聖なるかな'));
 assert.deepEqual(f.selects,[],'no stream flip on a card');
});

test('artCard: cards yes; resource/BGM names, help and Latin no',()=>{
 for(const s of ['館がある','聖なるかな','雪に埋もれた…僕の手'])assert.equal(HookNative.artCard(s),true,s);
 for(const s of ['女中のテーマピアノソロオープニングタイトルメニュー右から掠れ','オープニング','Change text display speed.','ファタモルガーナの館歌入り'])assert.equal(HookNative.artCard(s),false,s);
});
