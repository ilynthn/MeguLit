const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('the real bootstrap attaches and becomes ready with non-writable Tauri invoke',async()=>{
 const {installGameUiScan}=await import('../web/reader/game-ui.js');
 const {installLookupDismiss}=await import('../web/reader/lookup-dismiss.js');const {installLearningNotice}=await import('../web/reader/learning-notice.js');const {installHostTransport}=await import('../web/reader/host-transport.js'),calls=[],status={textContent:''},values=new Map();
 class Storage{get length(){return values.size;}key(i){return [...values.keys()][i];}getItem(k){return values.get(k)||null;}setItem(k,v){values.set(k,String(v));}}
 const localStorage=new Storage(),internal={transformCallback:()=>1},original=async(command,args)=>{calls.push({command,args});if(command==='service'){const r=args.request;return r.action==='home'?{preferences:{}}:r.action==='reader_bootstrap'?{native:{},engines:{}}:r.action==='ui_state'?{}:{saved:true};}return null;};
 Object.defineProperty(internal,'invoke',{value:original});
 const window={__TAURI_INTERNALS__:internal,fetch:async()=>new Response('{}')};
 const source=fs.readFileSync(path.join(__dirname,'../web/reader/bootstrap.js'),'utf8').replace(/^import .+;\r?\n/gm,'').replace("await import('./word-status.js')","await Promise.resolve()");
 const context={window,document:{addEventListener(){},querySelector:selector=>selector==='.tomoyo-selection-card'?null:status,documentElement:{style:{setProperty(){}},},body:{}},localStorage,Storage,modules:[],legacyStorageKeys:[],installGameUiScan,installHostTransport,installLookupDismiss:options=>installLookupDismiss(options,window),installLearningNotice:bridge=>installLearningNotice(bridge,{doc:context.document}),hostRegionMessage:m=>m,installHostRegions(){},MutationObserver:class{observe(){}},setTimeout,clearTimeout,addEventListener(){},dispatchEvent(){},Response,TextDecoder,URL};
 Object.assign(window,{document:context.document,MutationObserver:context.MutationObserver,addEventListener(){}});
 await vm.runInNewContext('(async()=>{"use strict";'+source+'})()',context);
 assert.equal(internal.invoke,original);assert.equal(window.__TOME_READER_READY__,true,status.textContent);assert(calls.some(c=>c.command==='reader_connect'));assert(calls.some(c=>c.args?.request?.phase==='ready'));
 window.__tomeOverlayRoute('/media/9');assert.equal(calls.at(-1).args.action,'enter_overlay');
});
test('legacy IPC routes without changing the native bridge, while reader window commands do not recurse',async()=>{
 const {installHostTransport}=await import('../web/reader/host-transport.js'),routed=[],native=[],internal={runCallback(){}};
 Object.defineProperty(internal,'invoke',{value:()=>{}});const original=internal.invoke,env={__TAURI_INTERNALS__:internal,fetch:async(url,init)=>{native.push({url,init});return new Response('{}');}};
 installHostTransport(async(cmd,args)=>{routed.push({cmd,args});return {ok:true};},env);
 const r=await env.fetch('http://ipc.localhost/plugin%3Asql%7Cselect',{body:JSON.stringify({db:'sqlite:immersion.db',query:'SELECT id FROM words WHERE id = $1',values:[1]})});assert.equal(r.headers.get('Tauri-Response'),'ok');assert.deepEqual(await r.json(),{ok:true});assert.equal(routed[0].cmd,'plugin:sql|select');
 await env.fetch('http://ipc.localhost/plugin%3Awindow%7Cset_skip_taskbar',{body:JSON.stringify({label:'reader',value:true})});assert.equal(native.length,1);assert.equal(internal.invoke,original);
 await env.fetch('http://ipc.localhost/plugin%3Awindow%7Cshow',{body:JSON.stringify({label:'unrelated'})});assert.equal(native.length,2);assert.equal(routed.length,1);
});
test('postMessage fallback routes legacy callbacks and leaves normal service IPC native',async()=>{
 const {installHostTransport}=await import('../web/reader/host-transport.js'),callbacks=[],native=[],env={fetch:async()=>{},__TAURI_INTERNALS__:{runCallback:(...args)=>callbacks.push(args)},ipc:{postMessage:data=>native.push(data)}};
 installHostTransport(async()=>42,env);env.ipc.postMessage(JSON.stringify({cmd:'get_settings',payload:{},callback:7,error:8}));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(callbacks,[[7,42]]);
 env.ipc.postMessage(JSON.stringify({cmd:'service',payload:{},callback:9,error:10}));assert.equal(native.length,1);
});
test('actual immutable Tauri core and IPC protocol complete a legacy request through the host adapter',async()=>{
 const {installHostTransport}=await import('../web/reader/host-transport.js');
 // The real tauri core.js from the locked crate in the Cargo registry (needs `cargo fetch` once).
 const lock=fs.readFileSync(path.join(__dirname,'..','desktop','Cargo.lock'),'utf8'),version=lock.match(/name = "tauri"\s+version = "([^"]+)"/)[1];
 const homes=[process.env.CARGO_HOME,process.env.MEGULIT_BUILD_TOOLS&&path.join(process.env.MEGULIT_BUILD_TOOLS,'cargo'),/* any ancestor's build-tools (a worktree sits several folders below the repo) */...(()=>{const out=[];for(let d=path.join(__dirname,'..');;){const up=path.dirname(d);out.push(path.join(up,'build-tools','cargo'));if(up===d)break;d=up;}return out;})(),process.env.USERPROFILE&&path.join(process.env.USERPROFILE,'.cargo')].filter(Boolean);
 const sourceRoot=homes.flatMap(h=>{const r=path.join(h,'registry','src');try{return fs.readdirSync(r).map(d=>path.join(r,d,'tauri-'+version,'scripts'));}catch{return [];}}).find(d=>fs.existsSync(path.join(d,'core.js')));
 assert.ok(sourceRoot,'tauri-'+version+' sources not found in any Cargo registry; run cargo fetch --manifest-path desktop/Cargo.toml');
 const nativeCalls=[],env={__TAURI_INTERNALS__:{},crypto:require('node:crypto').webcrypto,ipc:{postMessage(){throw Error('Unexpected fallback');}}};
 env.fetch=async(url,init)=>{nativeCalls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({value:17}),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});};
 const context={window:env,Headers,Response,Uint32Array,setTimeout,console};Object.defineProperty(context,'fetch',{get:()=>env.fetch});vm.createContext(context);
 let core=fs.readFileSync(path.join(sourceRoot,'core.js'),'utf8').replace('__TEMPLATE_os_name__','"windows"').replace('__TEMPLATE_protocol_scheme__','"http"');
 vm.runInContext(core,context);
 const protocol=fs.readFileSync(path.join(sourceRoot,'ipc-protocol.js'),'utf8').replace('__TEMPLATE_invoke_key__','"test-key"').replace('__RAW_process_ipc_message_fn__','payload=>({contentType:"application/json",data:JSON.stringify(payload)})').replace('__TEMPLATE_os_name__','"windows"').replace('__TEMPLATE_fetch_channel_data_command__','"plugin:channel|fetch"');
 vm.runInContext(protocol,context);Object.defineProperty(env.__TAURI_INTERNALS__,'ipc',{value:env.__TAURI_INTERNALS__.postMessage});
 const original=env.__TAURI_INTERNALS__.invoke;installHostTransport((command,args)=>original('service',{request:{action:'reader_invoke',command,args}}),env);
 assert.deepEqual(await original('get_settings',{}),{value:17});assert.equal(nativeCalls.length,1);assert.equal(nativeCalls[0].body.request.command,'get_settings');assert.equal(env.__TAURI_INTERNALS__.invoke,original);assert.equal(env.__TAURI_INTERNALS__.callbacks.size,0);
});

test('outside lookup gesture is consumed through release and clears selection',async()=>{
 const {installLookupDismiss}=await import('../web/reader/lookup-dismiss.js');
 const listeners=new Map(),messages=[],timers=new Map(),inside={},outside={};
 let hasCard=true,cleared=0,closed=0,removed=0;
 const card={contains:target=>target===inside};
 const shield={style:{},setAttribute(){},setPointerCapture(id){assert.equal(id,1);},remove(){removed++;}};
 const document={querySelector:()=>hasCard?card:null,createElement:()=>shield,body:{append(){}},addEventListener:(type,callback)=>listeners.set(type,callback)};
 const env={document,getSelection:()=>({removeAllRanges(){cleared++;}}),MutationObserver:class{observe(){}},setTimeout:callback=>{const timer=setTimeout(()=>{timers.delete(timer);callback();},0);timers.set(timer,true);return timer;}};
 const state=installLookupDismiss({bridge:()=>({closeLocalSelection(keep){assert.equal(keep,true);closed++;hasCard=false;}}),send:message=>messages.push(message.open)},env);
 const fire=(type,target=outside,pointerId=1)=>{
  const event={target,pointerId,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  listeners.get(type)(event);return event.prevented===true&&event.stopped===true;
 };
 assert.equal(fire('pointerdown',inside),false);
 assert.equal(fire('pointerdown'),true);assert.equal(cleared,1);assert.equal(closed,1);assert.equal(state.isDismissing(),true);
 assert.equal(fire('pointerdown',outside,2),true);assert.equal(fire('pointerup',outside,2),true);assert.equal(timers.size,0);
 assert.equal(fire('pointerup'),true);assert.equal(fire('click'),true);assert.deepEqual(messages,[true]);
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(state.isDismissing(),false);assert.equal(removed,1);assert.equal(cleared,2);assert.deepEqual(messages,[true,false]);
 assert.equal(fire('pointerdown'),false);assert.equal(fire('click'),false);
});
