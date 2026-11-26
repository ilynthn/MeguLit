// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal replay models of the game side for engines other than KiriKiri (2026-11-26), with KrkrModel's interface
   (tools/reader-replay/krkr-model.cjs): new Model({pid, tmp, report}); tick() -> the cfg the game side reads from MeguLit's control
   file now. On top:
     line(text)   the game drew a dialogue line: the engine-draw rows its native observer would log (report(row) each), only while the
                  control file authorizes it (roles=1). Their canvas boxes are MODEL values (no game, no canvas): x0/y0 0, one row
     threads(list) the bridge's stream list (hookThreads) as the tape / timeline says it
     sent(m)      what core sent the bridge (embedMode, embedReply): checked against what this engine can take
     summary()    {name, label, cfg, observing, rows, bad:[...]}
   Neither model feeds anything back into core (HookBridge EngineInfo drops YU-RIS / BGI draw rows, they are diagnostics) and neither
   is hide evidence (core/cardinal/native-hide.cjs counts only unmodeled native records); they say what the game side would have done
   and what it could not have taken.
     YU-RIS  native/megulithook/YurisDraw.h   ToMe_DRAWRUN engine=yuris run=N n= x0= y0= x1= y1= size= text=
             an EmbedYURIS stream cannot take a written-back text of any size (core/hook-native.cjs fixedSizeEmbed, 2026-11-13 euphoria:
             「テキスト内部エラーです」): an embedReply with text on it is a fault the game would stop on
     BGI     native/megulithook/BgiDraw.h     ToMe_DRAWRUN engine=bgi run=N row=K n= ... color= via= [role=] text= / end run=N rows=K
             a hide-only stream (old per-character hook, E417) cannot draw a translation: embedMode translate or a reply with text on it
             is a fault
   generic   every other engine without a model of its own: nothing of the game side is modeled; the scores come from the tape's own
             hook lines, choices and hide evidence only, and the result says so (label 通用模型). */
const os=require('node:os');
const C=require('./draw-control.cjs');
const cut120=t=>{let b=Buffer.from(String(t).replace(/[\r\n]/g,' '),'utf8');if(b.length<=120)return b.toString('utf8');let n=120;while(n>0&&(b[n]&0xc0)===0x80)n--;return b.subarray(0,n).toString('utf8');};
class Base{
 constructor({pid,tmp=os.tmpdir(),report=()=>{}}){this.pid=pid;this.tmp=tmp;this.reports=[];this.emit=s=>{this.reports.push(s);report(s);};this.cfg={roles:0};this.list=[];this.bad=[];this.runs=0;this.lines=0;}
 selected(){return this.list.find(t=>t&&t.selected===true)||null;}
 threads(list){if(Array.isArray(list))this.list=list;}
 fault(why){if(this.bad.length<12&&!this.bad.includes(why))this.bad.push(why);}
 summary(){return {name:this.name,label:this.label,cfg:{...this.cfg},observing:this.cfg.roles===1,lines:this.lines,rows:this.reports.length,bad:[...this.bad]};}
}
class YurisModel extends Base{
 constructor(o){super(o);C.source('yuris');this.name='yuris';this.label='YU-RIS 模型';}
 tick(){const raw=C.read(this.pid,this.tmp);this.cfg={roles:raw&&C.yuris(raw)?1:0};return this.cfg;}
 line(text){this.lines++;this.tick();if(!this.cfg.roles||!String(text||'').trim())return [];const n=[...String(text)].length;this.runs++;
  const row='ToMe_DRAWRUN engine=yuris run='+this.runs+' n='+n+' x0=0 y0=0 x1='+(n-1)*24+' y1=0 size=24 text='+cut120(text);this.emit(row);return [row];}
 sent(m){if(m?.type!=='embedReply')return;const s=this.selected();if(!s||!/^EmbedYURIS/i.test(String(s.name||'')))return;
  if(m.hide!==true&&String(m.trans||'').length)this.fault('embedReply wrote text into the YU-RIS line '+m.id+' (fixed-size embed: the engine stops on any written-back text)');}
}
class BgiModel extends Base{
 constructor(o){super(o);C.source('bgi');this.name='bgi';this.label='BGI 模型';this.roles=[];this.via='';}
 tick(){const raw=C.read(this.pid,this.tmp),c=raw?C.bgi(raw):{on:false,roles:[]};this.roles=c.roles;this.cfg={roles:c.on?1:0,viaRoles:c.roles.length};
  /* the dialogue's via: the map's line entry (this game's diff), else none (a row without a role, as the native logs it) */
  this.via=(c.roles.find(r=>r.role==='line')||{}).via||'';return this.cfg;}
 line(text){this.lines++;this.tick();if(!this.cfg.roles||!String(text||'').trim())return [];this.runs++;const n=[...String(text)].length,role=this.via?C.roleOf(this.roles,this.via):null;
  const rows=['ToMe_DRAWRUN engine=bgi run='+this.runs+' row=0 n='+n+' x0=0 y0=0 x1='+(n-1)*24+' y1=0 size=24 color=ffffffff via='+this.via+(role?' role='+role:'')+' text='+cut120(text),'ToMe_DRAWRUN engine=bgi end run='+this.runs+' rows=1'];
  for(const r of rows)this.emit(r);return rows;}
 sent(m){const s=this.selected();if(!s||s.hideOnly!==true)return;
  if(m?.type==='embedMode'&&m.mode==='translate')this.fault('embedMode translate on the hide-only BGI stream '+s.id+' (it cannot draw a translation)');
  if(m?.type==='embedReply'&&m.hide!==true&&String(m.trans||'').length)this.fault('embedReply with text on the hide-only BGI stream '+s.id);}
}
class GenericModel extends Base{
 constructor(o){super(o);this.name='generic';this.label='通用模型';}
 tick(){return this.cfg;}line(){this.lines++;return [];}sent(){}
 summary(){return {...super.summary(),note:'no game-side model: hook lines, choices and hide evidence of the tape only'};}
}
/* which model: the game's engine (profile / library), else the bridge's stream names; KiriKiri stays with krkr-model.cjs */
function pick({engine='',threads=[]}={}){const e=String(engine||'').toLowerCase(),names=(threads||[]).map(t=>String(t?.name||'')).join(' ');
 if(/kirikiri|krkr/.test(e))return 'krkr';if(/yu-?ris/.test(e)||/\bEmbedYURIS|\bYURIS/i.test(names))return 'yuris';if(/\bbgi\b|ethornell/.test(e)||/\bBGI/.test(names))return 'bgi';return 'generic';}
const MODELS={yuris:YurisModel,bgi:BgiModel,generic:GenericModel};
module.exports={YurisModel,BgiModel,GenericModel,pick,MODELS};
