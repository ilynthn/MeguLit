'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {find,candidates,AnkiProcess}=require('../core/anki-process.cjs'),{cleanV4}=require('../core/v4-config.cjs');
const env={LOCALAPPDATA:'C:\\Users\\u\\AppData\\Local',ProgramFiles:'C:\\Program Files'};
// configured path first, then classic installs, then the Anki 25 venv
assert.equal(candidates('D:\\Anki\\anki.exe',env)[0],'D:\\Anki\\anki.exe');
const venv=path.join(env.LOCALAPPDATA,'AnkiProgramFiles','.venv','Scripts','ankiw.exe');
assert.equal(find('',env,file=>file===venv),venv);
assert.equal(find('',env,()=>false),'');
// settings: new switches default off/on/off and accept ankiw.exe
const c=cleanV4({});assert.equal(c.ankiAutoStart,true);assert.equal(c.ankiAutoClose,true);assert.equal(c.ankiHidden,true);
assert.equal(cleanV4({ankiPath:'C:\\x\\ankiw.exe'}).ankiPath,'C:\\x\\ankiw.exe');
assert.equal(cleanV4({ankiPath:'C:\\x\\evil.exe'}).ankiPath,'');
(async()=>{
 // only an Anki that MeguLit started is closed (WM_CLOSE to its window, never killed); a kept Anki is shown again
 let online=true,procAlive=true;const calls=[],win=[];const anki={call:async(_c,action)=>{calls.push(action);if(!online)throw Error('ANKI_OFFLINE');return 6;}};
 const windowControl=async mode=>{win.push(mode);if(mode==='close'){online=false;procAlive=false;}return 1;};
 const p=new AnkiProcess({config:()=>cleanV4({ankiAutoStart:true,ankiHidden:false}),anki,windowControl,running:()=>procAlive,wait:async()=>{}});
 assert.deepEqual(await p.stop(),{closed:false});assert.deepEqual(win,[]);
 assert.deepEqual(await p.start(),{running:true,started:false});assert.equal(p.started,false);
 p.started=true;assert.deepEqual(await p.stop(),{closed:true});assert.deepEqual(win,['close']);
 online=true;procAlive=true;win.length=0;const h=new AnkiProcess({config:()=>cleanV4({ankiHidden:true}),anki,windowControl,running:()=>procAlive,wait:async()=>{}});assert.deepEqual(await h.stop(),{closed:false});assert.deepEqual(win,['show']);
 win.length=0;const q=new AnkiProcess({config:()=>cleanV4({ankiAutoClose:false,ankiHidden:true}),anki,windowControl,running:()=>procAlive,wait:async()=>{}});q.started=true;assert.deepEqual(await q.stop(),{closed:false});assert.deepEqual(win,['show']);
 assert.deepEqual(await new AnkiProcess({config:()=>cleanV4({ankiAutoStart:false}),anki,windowControl,running:()=>procAlive,wait:async()=>{}}).auto(),{skipped:true});

 // #11: open() cancels an active hide watcher before showing Anki
 {
  const {EventEmitter}=require('node:events');
  let killed=0;const modes=[];
  const r=new AnkiProcess({
   config:()=>cleanV4({ankiDeck:'MeguLit'}),
   anki:{call:async()=>6},
   windowControl:async m=>{modes.push(m);return 1;},
   watcher:()=>({kill:()=>{killed++;}})
  });
  r.watch(30000);
  await r.open('addons');
  assert.equal(killed,1,'open() must stop the hide watcher');
  assert.equal(r.watcher,null);
  assert.deepEqual(modes,['show']);

  // #10: user-owned running Anki is not re-spawned or marked started, so stop() will not close it
  let spawned=0,probe=0;const modes2=[];
  const userOwned=new AnkiProcess({
   config:()=>cleanV4({ankiPath:'C:\\Anki\\anki.exe',ankiAutoClose:true,ankiHidden:false}),
   anki:{call:async()=>{if(++probe>=3)return 6;throw Error('ANKI_OFFLINE');}},
   windowControl:async m=>{modes2.push(m);return 1;},
   running:()=>true,
   wait:async()=>{},
   spawner:()=>{spawned++;return new EventEmitter();}
  });
  const res=await userOwned.start({hide:false});
  assert.deepEqual(res,{running:true,started:false});
  assert.equal(spawned,0,'already running Anki must not be spawned again');
  assert.equal(userOwned.started,false,'already running Anki is not owned by MeguLit');
  /* 2026-11-28 owner (anki 软件老是显示出来): an Anki the user opened is left alone, never shown, raised or hidden */
  assert.deepEqual(modes2,[],'start() leaves the windows of an already running Anki alone');
  modes2.length=0;
  assert.deepEqual(await userOwned.stop(),{closed:false});
  assert.ok(!modes2.includes('close'),'stop() must not close user-owned Anki');

  // #10: spawn error rejects immediately without claiming ownership or leaving watcher running
  let wKilled=0;
  const badSpawn=new AnkiProcess({
   config:()=>cleanV4({ankiPath:'C:\\Anki\\anki.exe'}),
   anki:{call:async()=>{throw Error('ANKI_OFFLINE');}},
   windowControl:async()=>1,
   running:()=>false,
   wait:async()=>{},
   watcher:()=>({kill:()=>{wKilled++;}}),
   spawner:()=>{const e=new EventEmitter();queueMicrotask(()=>e.emit('error',Error('ENOENT spawn')));return e;}
  });
  badSpawn.find=()=>'C:\\Anki\\anki.exe';
  await assert.rejects(badSpawn.start({hide:true}),/ENOENT spawn/);
  assert.equal(badSpawn.started,false);
  assert.equal(wKilled,1,'watcher is stopped on spawn error');

  // #10 + #887: concurrent start() shares one spawn; a hide:false caller stops the watcher and reveals Anki
  let cSpawn=0,cWatchKill=0,cOnline=false;const cModes=[];
  const conc=new AnkiProcess({
   config:()=>cleanV4({ankiPath:'C:\\Anki\\anki.exe'}),
   anki:{call:async()=>{if(!cOnline)throw Error('ANKI_OFFLINE');return 6;}},
   windowControl:async m=>{cModes.push(m);return 1;},
   running:()=>cSpawn>0,
   wait:async()=>{await new Promise(z=>setTimeout(z,5));},
   watcher:()=>({kill:()=>{cWatchKill++;}}),
   spawner:()=>{cSpawn++;const e=new EventEmitter();queueMicrotask(()=>e.emit('spawn'));return e;}
  });
  conc.find=()=>'C:\\Anki\\anki.exe';
  const p1=conc.start({hide:true});
  await new Promise(z=>setTimeout(z,15));
  const p2=conc.start({hide:false});
  await new Promise(z=>setTimeout(z,5));
  assert.ok(!cModes.includes('show'),'a hide:false caller joining a start never shows Anki while it loads');
  cOnline=true;
  const [r1,r2]=await Promise.all([p1,p2]);
  assert.equal(cSpawn,1,'concurrent starts spawn Anki only once');
  assert.equal(conc.started,true,'MeguLit-spawned Anki is marked started');
  assert.equal(r1.running,true);assert.equal(r2.running,true);
  assert.equal(conc.hidden,false);
  assert.ok(cModes.includes('mini')&&!cModes.includes('show'),'with hide:false it ends minimized without activation, never shown in front');

  // Same-tick concurrent start({hide:true}) + start({hide:false}) while online() is still in flight
  let stSpawn=0,stWatch=0,stOnline=false,stHideOpt=null;const stModes=[];
  const sameTick=new AnkiProcess({
   config:()=>cleanV4({ankiPath:'C:\\Anki\\anki.exe'}),
   anki:{call:async()=>{await new Promise(z=>setTimeout(z,5));if(!stOnline)throw Error('ANKI_OFFLINE');return 6;}},
   windowControl:async m=>{stModes.push(m);return 1;},
   running:()=>stSpawn>0,
   wait:async()=>{await new Promise(z=>setTimeout(z,5));},
   watcher:()=>({kill:()=>{}}),
   spawner:(_exe,_args,opts)=>{stSpawn++;stHideOpt=opts.windowsHide;const e=new EventEmitter();queueMicrotask(()=>e.emit('spawn'));return e;}
  });
  sameTick.watch=()=>{stWatch++;};
  sameTick.find=()=>'C:\\Anki\\anki.exe';
  const sp1=sameTick.start({hide:true});
  const sp2=sameTick.start({hide:false});
  setTimeout(()=>{stOnline=true;},20);
  const [sr1,sr2]=await Promise.all([sp1,sp2]);
  assert.equal(stSpawn,1);
  assert.equal(stHideOpt,true,'MeguLit always spawns Anki hidden, so it never flashes in front while loading');
  assert.equal(stWatch,1,'its windows are kept hidden while it loads');
  assert.ok(stModes.includes('mini')&&!stModes.includes('show'),'hide:false ends minimized without activation');
  assert.equal(sameTick.hidden,false);
  assert.equal(sameTick.hideRequested,false);
  assert.equal(sr1.running,true);assert.equal(sr2.running,true);

  // hide:false joining a windowsHide start before Qt window exists still reveals Anki once online
  let lateOnline=false,windowReady=false;const lateShowStates=[];
  const lateReveal=new AnkiProcess({
   config:()=>cleanV4({ankiPath:'C:\\Anki\\anki.exe'}),
   anki:{call:async()=>{if(!lateOnline)throw Error('ANKI_OFFLINE');return 6;}},
   windowControl:async m=>{if(m==='mini')lateShowStates.push(windowReady);return windowReady?1:0;},
   running:()=>true,
   wait:async()=>{await new Promise(z=>setTimeout(z,5));},
   watcher:()=>({kill:()=>{}}),
   spawner:()=>{const e=new EventEmitter();queueMicrotask(()=>e.emit('spawn'));return e;}
  });
  let lateSpawned=false;
  lateReveal.running=()=>lateSpawned;
  lateReveal.spawner=()=>{lateSpawned=true;const e=new EventEmitter();queueMicrotask(()=>e.emit('spawn'));return e;};
  lateReveal.find=()=>'C:\\Anki\\anki.exe';
  const lp1=lateReveal.start({hide:true});
  await new Promise(z=>setTimeout(z,10));
  const lp2=lateReveal.start({hide:false});
  windowReady=true;lateOnline=true;
  await Promise.all([lp1,lp2]);
  assert.ok(lateShowStates.includes(true),'puts Anki in the taskbar (minimized) once its window exists and AnkiConnect is up');

  // An Anki already online that the user opened is never touched; MeguLit's own hidden Anki is hidden again
  const onModes=[];
  const alreadyOn=new AnkiProcess({
   config:()=>cleanV4({ankiHidden:true}),
   anki:{call:async()=>6},
   windowControl:async m=>{onModes.push(m);return 1;},
   watcher:()=>({kill:()=>{}})
  });
  assert.deepEqual(await alreadyOn.start({hide:false}),{running:true,started:false});
  assert.deepEqual(await alreadyOn.start({hide:true}),{running:true,started:false});
  assert.deepEqual(onModes,[],'user-opened Anki: no show, no hide');
  alreadyOn.started=true;alreadyOn.hidden=true;
  assert.deepEqual(await alreadyOn.start({hide:true}),{running:true,started:false});
  assert.deepEqual(onModes,['hideall'],'MeguLit-started hidden Anki stays hidden');

  // Missing executable when Anki is not running rejects with ANKI_EXECUTABLE_MISSING
  const missingExe=new AnkiProcess({
   config:()=>cleanV4({ankiPath:''}),
   anki:{call:async()=>{throw Error('ANKI_OFFLINE');}},
   running:()=>false
  });
  missingExe.find=()=>'';
  await assert.rejects(missingExe.start({hide:false}),/ANKI_EXECUTABLE_MISSING/);

  // stop() during initial online() check cancels in-flight start() without spawning and clears hideRequested
  let cancelSpawns=0,cancelCalls=0,releaseOnline;
  const cancelled=new AnkiProcess({
   config:()=>cleanV4({ankiPath:'C:\\Anki\\anki.exe',ankiAutoClose:false,ankiHidden:false}),
   anki:{call:()=>++cancelCalls===1?new Promise((_,rej)=>{releaseOnline=()=>rej(Error('ANKI_OFFLINE'));}):Promise.reject(Error('ANKI_OFFLINE'))},
   windowControl:async()=>1,
   running:()=>false,
   wait:async()=>{},
   spawner:()=>{cancelSpawns++;const e=new EventEmitter();queueMicrotask(()=>e.emit('spawn'));return e;}
  });
  cancelled.find=()=>'C:\\Anki\\anki.exe';
  const pendingStart=cancelled.start({hide:true}).then(v=>({v}),e=>({e}));
  await Promise.resolve();
  assert.equal(cancelled.hideRequested,true);
  await cancelled.stop();
  assert.equal(cancelled.hideRequested,false);
  releaseOnline();
  const cancelledRes=await pendingStart;
  assert.match(cancelledRes.e?.message||'',/ANKI_OFFLINE/);
  assert.equal(cancelSpawns,0,'cancelled start must not spawn after stop()');

  // User-owned running Anki waiting for AnkiConnect is not hidden until online
  let uWatch=0,uProbe=0;const uModes=[];
  const userHiddenWait=new AnkiProcess({
   config:()=>cleanV4({ankiHidden:true}),
   anki:{call:async()=>{if(++uProbe>=3)return 6;throw Error('ANKI_OFFLINE');}},
   windowControl:async m=>{uModes.push(m);return 1;},
   running:()=>true,
   wait:async()=>{}
  });
  userHiddenWait.watch=()=>{uWatch++;};
  await userHiddenWait.start({hide:true});
  assert.equal(uWatch,0,'do not watch-hide user-owned Anki');
  assert.deepEqual(uModes,[],'a user-opened Anki is never hidden or shown');

  // Timeout on self-started hidden Anki keeps hiding while waiting, then stops watcher, clears hideRequested, and shows window
  let toWatchKill=0;const toModes=[];
  const timedOut=new AnkiProcess({
   config:()=>cleanV4({ankiPath:'C:\\Anki\\anki.exe',ankiHidden:true}),
   anki:{call:async()=>{throw Error('ANKI_OFFLINE');}},
   windowControl:async m=>{toModes.push(m);return 1;},
   running:()=>false,
   wait:async()=>{},
   watcher:()=>({kill:()=>{toWatchKill++;}}),
   spawner:()=>{const e=new EventEmitter();queueMicrotask(()=>e.emit('spawn'));return e;}
  });
  timedOut.find=()=>'C:\\Anki\\anki.exe';
  await assert.rejects(timedOut.start({hide:true}),/ANKI_OFFLINE/);
  assert.ok(toModes.includes('hideall'),'self-started hidden Anki hides while waiting');
  assert.equal(toWatchKill,1,'timeout stops hide watcher');
  assert.equal(timedOut.hideRequested,false);
  assert.equal(timedOut.hidden,false);
  assert.ok(toModes.includes('mini')&&!toModes.includes('show'),'timeout puts Anki in the taskbar minimized (blocking dialogs reachable) without taking the foreground');
 }

 // #12: stop() checks process exit independently of AnkiConnect, stops watcher, and restores surviving windows
 {
  let wKilled=0;const modes=[];
  const stillAlive=new AnkiProcess({
   config:()=>cleanV4({ankiAutoClose:true,ankiHidden:true}),
   anki:{call:async()=>{throw Error('ANKI_OFFLINE');}},
   windowControl:async m=>{modes.push(m);return 1;},
   running:()=>true,
   wait:async()=>{},
   watcher:()=>({kill:()=>{wKilled++;}})
  });
  stillAlive.started=true;
  const sr=await stillAlive.stop();
  assert.deepEqual(sr,{closed:false},'must not report closed while Anki process is still running');
  assert.ok(wKilled>=1,'stop() cancels its watcher');
  assert.ok(modes.includes('show'),'surviving Anki windows are restored');
  assert.equal(stillAlive.watcher,null);

  // stop() respects wall-clock deadline so it shows surviving windows before host shutdown timeout
  let fakeTime=0,polls=0;const bModes=[];
  const budgeted=new AnkiProcess({
   config:()=>cleanV4({ankiAutoClose:true,ankiHidden:false}),
   anki:{call:async()=>{throw Error('ANKI_OFFLINE');}},
   windowControl:async m=>{bModes.push(m);return 1;},
   running:()=>{polls++;fakeTime+=1500;return true;},
   wait:async()=>{fakeTime+=400;},
   now:()=>fakeTime
  });
  budgeted.started=true;
  assert.deepEqual(await budgeted.stop(),{closed:false});
  assert.ok(polls<10,'wall-clock budget stops polling well before 40 iterations (got '+polls+')');
  assert.ok(bModes.includes('show'));

  // stop() with !close and !ankiHidden still cancels a stray watcher
  let strayKill=0;
  const stray=new AnkiProcess({
   config:()=>cleanV4({ankiAutoClose:false,ankiHidden:false}),
   anki:{call:async()=>6},
   windowControl:async()=>1,
   watcher:()=>({kill:()=>{strayKill++;}})
  });
  stray.watch(30000);
  assert.deepEqual(await stray.stop(),{closed:false});
  assert.equal(strayKill,1);
  assert.equal(stray.watcher,null);

  // stop() cleans up watcher and restores window even when windowControl('close') throws
  let errKill=0,errShow=0;
  const errStop=new AnkiProcess({
   config:()=>cleanV4({ankiAutoClose:true,ankiHidden:true}),
   anki:{call:async()=>{throw Error('ANKI_OFFLINE');}},
   windowControl:async m=>{if(m==='close')throw Error('WIN_FAIL');if(m==='show'){errShow++;throw Error('SHOW_FAIL');}return 1;},
   running:()=>true,
   wait:async()=>{},
   watcher:()=>({kill:()=>{errKill++;}})
  });
  errStop.started=true;
  assert.deepEqual(await errStop.stop(),{closed:false});
  assert.equal(errShow,1);
  assert.equal(errKill,1);
  assert.equal(errStop.watcher,null);

  // Normal exit also cancels the 20s hide watcher
  let wKilledOk=0,alive=true;
  const cleanExit=new AnkiProcess({
   config:()=>cleanV4({ankiAutoClose:true,ankiHidden:true}),
   anki:{call:async()=>{throw Error('ANKI_OFFLINE');}},
   windowControl:async m=>{if(m==='close')alive=false;return 1;},
   running:()=>alive,
   wait:async()=>{},
   watcher:()=>({kill:()=>{wKilledOk++;}})
  });
  cleanExit.started=true;
  assert.deepEqual(await cleanExit.stop(),{closed:true});
  assert.ok(wKilledOk>=1,'watcher is cancelled on normal stop too');
  assert.equal(cleanExit.watcher,null);
 }
 console.log('anki-process ok');
})().catch(e=>{console.error(e);process.exit(1);});
// E451: windows hidden with Anki are recorded and a blocking dialog is shown again with Anki
{
 const src=require('fs').readFileSync(require('path').join(__dirname,'..','core','anki-process.cjs'),'utf8');
 assert.match(src,/Save\(hid\);return k;\}/);assert.match(src,/if\(show\)RestoreBlocked\(\);return n;\}/);assert.match(src,/IsWindowEnabled\(m\)/);
}
