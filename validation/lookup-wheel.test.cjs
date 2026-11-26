'use strict';
/* QQ #1130 (p0, 2026-11-24): the wheel over the lookup popup advanced the game, and wheel up over MeguLit's line no longer
   opened the log. In translation mode the bridge holds every wheel and asks the page (__megulitResolveWheel) whose it is. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const web=read('web/reader/modules/interaction.js'),log=read('web/reader/modules/backlog.js'),gate=read('native/ReaderPointerGate.cs');

/* the page decision, run on a small stand-in DOM */
function resolver(){
 const menus=web.match(/const MENUS='([^']+)'/)[1],lookups=web.match(/const LOOKUPS='([^']+)'/)[1];
 const body=web.match(/window\.__megulitResolveWheel=\(id,x,y\)=>\{([\s\S]+?)\n \};/)[1];
 const scroll=web.match(/function movedTranslationScroll\(node\) \{([\s\S]+?)\n \}/)[1];
 return ({nodes,at,backlog})=>{const sent=[];
  const document={querySelectorAll:sel=>nodes.filter(n=>sel.split(',').includes(n.cls)),elementFromPoint:()=>at};
  const window={__tomoyoChinese:{backlogWheelTarget:backlog},__tomoyoTranslateRequest:s=>sent.push(JSON.parse(s))};
  const getComputedStyle=n=>n.style||{visibility:'visible',display:'block'};
  new Function('document','window','getComputedStyle','MENUS','LOOKUPS','movedTranslationScroll','id','x','y',body)(document,window,getComputedStyle,menus,lookups,new Function('node',scroll),7,100,100);
  return sent[0];};
}
const el=(cls,box,parents=[])=>({cls,getBoundingClientRect:()=>box,closest:sel=>[cls,...parents].some(c=>sel.split(',').includes(c))||null});
const inside={left:50,top:50,right:200,bottom:200,width:150,height:150},away={left:500,top:500,right:600,bottom:600,width:100,height:100};

test('the word tooltip and the lookup card own the wheel over their box',()=>{
 const decide=resolver();
 const tip=el('.lookup-tooltip',inside);
 assert.deepStrictEqual(decide({nodes:[tip],at:tip,backlog:()=>''}),{type:'galWheelDecision',id:7,panel:true,panelUp:false});
 const card=el('.tomoyo-selection-card',inside);
 assert.equal(decide({nodes:[card],at:null,backlog:()=>''}).panel,true,'resolved from the live box even when the hit element is something else');
 const hidden={...el('.lookup-tooltip',inside),style:{visibility:'hidden',display:'block'}},line=el('.char-token',inside,['.sentence-window']);
 assert.equal(decide({nodes:[hidden],at:line,backlog:()=>''}).panel,false,'a hidden tooltip owns nothing');
});
test('over the line the log decides: up opens it, down stays the game\'s; an open log takes both',()=>{
 const decide=resolver(),line=el('.char-token',away,['.sentence-window']);
 assert.deepStrictEqual(decide({nodes:[],at:line,backlog:()=>'up'}),{type:'galWheelDecision',id:7,panel:false,panelUp:true});
 assert.deepStrictEqual(decide({nodes:[],at:line,backlog:()=>'all'}),{type:'galWheelDecision',id:7,panel:true,panelUp:false});
 assert.deepStrictEqual(decide({nodes:[],at:line,backlog:()=>''}),{type:'galWheelDecision',id:7,panel:false,panelUp:false});
});
test('backlog says which wheels are its own',()=>{
 const src=log.match(/b\.backlogWheelTarget=target=>\{([\s\S]+?)\};\r?\n/)[1],others=log.match(/const OTHER_PANELS='([^']+)'/)[1];
 const run=(panel,cfg,target)=>new Function('panel','cfg','OTHER_PANELS','target',src)(panel,cfg,others,target);
 const line=el('.char-token',away,['.sentence-window']),card=el('.tomoyo-selection-card',away),list=el('.tome-log-list',away,['.tome-backlog']);
 assert.equal(run(null,{wheel:true},line),'up');
 assert.equal(run(null,{wheel:false},line),'');
 assert.equal(run(null,{wheel:true},card),'');
 assert.equal(run({},{wheel:true},line),'all');
 assert.equal(run({},{wheel:true},list),'all');
 assert.equal(run({},{wheel:true},card),'','the open card keeps its own wheel beside the log');
});
test('the bridge sends only an upward wheel to the page for panelUp',()=>{
 assert.match(gate,/internal static bool WheelToPanel\(bool panel,bool panelUp,int message,int delta\)\{return panel\|\|panelUp&&message==Wheel&&delta>0;\}/);
 assert.match(gate,/!WheelToPanel\(false,true,Wheel,120\)\|\|WheelToPanel\(false,true,Wheel,-120\)/,'covered by the bridge self-test');
 assert.match(read('native/GalWindowBridge.cs'),/PointerGate\.ResolveWheel\(id,Bool\(d,"panel"\),Bool\(d,"panelUp"\)\)/);
 assert.match(read('services/reader.cjs'),/type:'wheelDecision',id:r\.id,panel:r\.panel===true,panelUp:r\.panelUp===true/);
});
