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
   generic   every other engine without a model of its own: nothing of the game side is modeled; the scores come from the tape's own
             hook lines, choices and hide evidence only, and the result says so (label 通用模型). */
const os=require('node:os');
const cut120=t=>{let b=Buffer.from(String(t).replace(/[\r\n]/g,' '),'utf8');if(b.length<=120)return b.toString('utf8');let n=120;while(n>0&&(b[n]&0xc0)===0x80)n--;return b.subarray(0,n).toString('utf8');};
class Base{
 constructor({pid,tmp=os.tmpdir(),report=()=>{}}){this.pid=pid;this.tmp=tmp;this.reports=[];this.emit=s=>{this.reports.push(s);report(s);};this.cfg={roles:0};this.list=[];this.bad=[];this.runs=0;this.lines=0;}
 selected(){return this.list.find(t=>t&&t.selected===true)||null;}
 threads(list){if(Array.isArray(list))this.list=list;}
 fault(why){if(this.bad.length<12&&!this.bad.includes(why))this.bad.push(why);}
 summary(){return {name:this.name,label:this.label,cfg:{...this.cfg},observing:this.cfg.roles===1,lines:this.lines,rows:this.reports.length,bad:[...this.bad]};}
}
class GenericModel extends Base{
 constructor(o){super(o);this.name='generic';this.label='通用模型';}
 tick(){return this.cfg;}line(){this.lines++;return [];}sent(){}
 summary(){return {...super.summary(),note:'no game-side model: hook lines, choices and hide evidence of the tape only'};}
}
/* which model: the game's engine (profile / library), else the bridge's stream names; KiriKiri stays with krkr-model.cjs */
function pick({engine='',threads=[]}={}){const e=String(engine||'').toLowerCase(),names=(threads||[]).map(t=>String(t?.name||'')).join(' ');
 if(/kirikiri|krkr/.test(e))return 'krkr';return 'generic';}
const MODELS={generic:GenericModel};
module.exports={GenericModel,pick,MODELS};
