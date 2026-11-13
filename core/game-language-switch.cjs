// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E525 Japanese restore for multi-language releases that keep every language in the same files and pick one by a
   setting (2026-11-13). Instead of rewriting game data, the game's own language setting is switched to Japanese.
   Generic, per engine family, never per title:
     krkr-sysvar   KiriKiri: the system-variable save (*.ksd / *.kdt in the datapath named by <exe>.cf, zlib "FE FE 02"
                   or plain UTF-16 text) holds a language key ("textLanguageType" => 1). Integer keys go to 0 (the
                   original Japanese is the first language of a Japanese title); string keys get the Japanese code in
                   the same style (en → ja, English → Japanese, en-US → ja-JP).
     unity-pref    Unity: (a) PlayerPrefs strings under HKCU\Software\<company>\<product> whose name has lang or locale;
                   (b) JSON/ini settings in LocalLow\<company>\<product> with such a key (also JSON inside JSON strings);
                   (c) Mono games that save preferences as a BinaryFormatter Dictionary<Int32,Single|Int32> keyed by an
                   enum (…Preference…/…Setting…) with a member "Language": its value becomes SystemLanguage.Japanese (22).
                   Only when the game ships Japanese resources (StreamingAssets names with ja/jp/japanese).
     steam-language  Steam games whose language follows Steam (krkrsteam / SteamApps.GetCurrentGameLanguage): the
                   per-game language in steamapps/appmanifest_<appid>.acf (UserConfig.language). Steam rewrites that
                   file while it runs, so the write only happens with Steam closed; otherwise the page shows the steps
                   (Library → right-click → Properties → General → Language → 日本語). Only local settings, no download.
   Every write keeps a backup and a manifest in <game>/.megulit-japanese (adapter "language-switch"); undo puts back
   only values that still hold what MeguLit wrote. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),crypto=require('node:crypto'),cp=require('node:child_process');
const BACKUP_DIR='.megulit-japanese',ADAPTER='language-switch',UNITY_JAPANESE=22;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const isFile=f=>{try{return fs.statSync(f).isFile();}catch{return false;}};
const isDir=f=>{try{return fs.statSync(f).isDirectory();}catch{return false;}};
const list=d=>{try{return fs.readdirSync(d);}catch{return [];}};
const LANG_KEY=/lang|locale/i, SKIP_KEY=/store|font|dir|path|file|url|hook|count|history|voice/i;

/* ---- language codes ------------------------------------------------------------------------------------- */
const JA_VALUE=/^(?:ja|jp|jpn|ja[-_]jp|japanese|日本語|nihongo)$/i;
const KNOWN=/^(?:en|eng|english|en[-_](?:us|gb)|zh|cn|chs|cht|sc|tc|zh[-_]?(?:cn|tw|hk|hans|hant)|chinese|schinese|tchinese|simplifiedchinese|traditionalchinese|ko|kr|kor|korean|ko[-_]kr|fr|french|de|german|es|spanish|it|italian|ru|russian|pt|pt[-_]br|portuguese)$/i;
function japaneseLike(v){
 const s=String(v);if(JA_VALUE.test(s))return null;if(!KNOWN.test(s))return null;
 const upper=s===s.toUpperCase(),cap=/^[A-Z][a-z]/.test(s);let out;
 if(/[-_]/.test(s)&&s.length===5)out='ja'+s[2]+'JP';
 else if(s.length>=5)out='japanese';else if(s.length===3)out='jpn';else out='ja';
 if(upper&&!/[-_]/.test(s))out=out.toUpperCase();else if(cap)out=out[0].toUpperCase()+out.slice(1);
 if(/[-_]/.test(s)&&s.length===5&&s[0]===s[0].toUpperCase())out='JA'+s[2]+'JP';
 return out;}

/* ---- KiriKiri ---------------------------------------------------------------------------------------------- */
const KRKR_MAGIC=Buffer.from([0xFE,0xFE,0x02,0xFF,0xFE]);
function decodeCf(v){return String(v).split('\\x').filter(Boolean).map(h=>String.fromCodePoint(parseInt(h,16))).join('');}
function krkrDataDirs(gameDir,env){
 const out=[];
 for(const n of list(gameDir).filter(n=>/\.cf$/i.test(n))){
  let t='';try{t=fs.readFileSync(path.join(gameDir,n),'utf8');}catch{continue;}
  const m=/^\s*datapath\s*=\s*"([^"]*)"/m.exec(t);if(!m)continue;
  let p=decodeCf(m[1]).replace(/\$\((appdatapath|vistapath)\)/gi,env.appData).replace(/\$\(personalpath\)/gi,env.documents).replace(/\$\(localappdatapath\)/gi,env.localAppData).replace(/\$\(exepath\)/gi,gameDir).replace(/\$\(savedgamespath\)/gi,path.join(env.home,'Saved Games'));
  if(!path.isAbsolute(p))p=path.join(gameDir,p);out.push(path.normalize(p));}
 out.push(path.join(gameDir,'savedata'));
 return [...new Set(out)].filter(isDir);
}
/* TJS text of a save file, with what is needed to write it back */
function readKrkr(buf){
 const at=buf.indexOf(KRKR_MAGIC);
 if(at>=0&&buf.length>=at+21){const comp=Number(buf.readBigUInt64LE(at+5)),raw=Number(buf.readBigUInt64LE(at+13));
  const body=zlib.inflateSync(buf.subarray(at+21,at+21+comp));if(body.length!==raw)throw Error('KSD_SIZE');
  return {text:body.toString('utf16le'),mode:'zlib',prefix:buf.subarray(0,at)};}
 if(buf[0]===0xFF&&buf[1]===0xFE)return {text:buf.subarray(2).toString('utf16le'),mode:'plain',prefix:Buffer.alloc(0)};
 return null;}
function writeKrkr(info,text){
 const body=Buffer.from(text,'utf16le');
 if(info.mode==='plain')return Buffer.concat([Buffer.from([0xFF,0xFE]),body]);
 const z=zlib.deflateSync(body),head=Buffer.alloc(21);KRKR_MAGIC.copy(head);head.writeBigUInt64LE(BigInt(z.length),5);head.writeBigUInt64LE(BigInt(body.length),13);
 return Buffer.concat([info.prefix,head,z]);}
const KRKR_KEY=/"([A-Za-z_]\w*)"\s*=>\s*(?:(-?\d+)|"([^"\\]{1,24})")/g;
function krkrChanges(text){
 const out=[];let m;KRKR_KEY.lastIndex=0;
 while((m=KRKR_KEY.exec(text))){const key=m[1];if(!LANG_KEY.test(key)||SKIP_KEY.test(key))continue;
  if(m[2]!=null){const v=Number(m[2]);out.push({key,from:v,to:0,index:m.index,match:m[0],next:m[0].replace(/-?\d+$/,'0')});}
  else{const to=japaneseLike(m[3]);out.push({key,from:m[3],to:to??m[3],index:m.index,match:m[0],next:to?m[0].replace(/"[^"]*"$/,'"'+to+'"'):m[0],already:JA_VALUE.test(m[3])});}}
 return out;}
function krkrPlan(gameDir,env){
 if(!list(gameDir).some(n=>/\.xp3$/i.test(n)))return null;
 const files=[];let any=false;
 for(const dir of krkrDataDirs(gameDir,env))for(const n of list(dir).filter(n=>/\.(ksd|kdt)$/i.test(n))){
  const file=path.join(dir,n);let buf,info;try{buf=fs.readFileSync(file);if(buf.length>8<<20)continue;info=readKrkr(buf);}catch{continue;}if(!info)continue;
  const ch=krkrChanges(info.text);if(!ch.length)continue;any=true;
  const todo=ch.filter(c=>c.next!==c.match);if(todo.length)files.push({file,buf,info,changes:todo});}
 const steamDriven=list(path.join(gameDir,'plugin')).some(n=>/^krkrsteam\.dll$/i.test(n));
 return {engine:'kirikiri',found:any,files,steamDriven};
}

/* ---- Unity ------------------------------------------------------------------------------------------------ */
function unityData(gameDir){const d=list(gameDir).find(n=>/_Data$/i.test(n)&&isFile(path.join(gameDir,n,'globalgamemanagers')));return d?path.join(gameDir,d):'';}
function appInfo(data){try{const [company,product]=fs.readFileSync(path.join(data,'app.info'),'utf8').split(/\r?\n/);return {company:company||'',product:product||''};}catch{return {company:'',product:''};}}
const JA_ASSET=/(?:^|[^a-z])(?:ja|jp|jpn|japanese|ja[-_]jp)(?:[^a-z]|$)|^lang(?:ja|jp)\b/i;
function japaneseAssets(data){
 const out=[],queue=[[path.join(data,'StreamingAssets'),0]];let seen=0;
 while(queue.length&&seen<4000&&out.length<5){const [d,depth]=queue.shift();
  for(const n of list(d)){seen++;const f=path.join(d,n);if(JA_ASSET.test(n.replace(/\.[^.]+$/,'')))out.push(path.relative(data,f));if(depth<4&&isDir(f))queue.push([f,depth+1]);}}
 return out;}
function regQuery(key){
 try{const out=cp.execFileSync('reg.exe',['query',key],{encoding:'utf8',windowsHide:true,timeout:15000});
  return out.split(/\r?\n/).map(l=>/^\s{4}(.+?)\s{4}(REG_\w+)\s{4}(.*)$/.exec(l)).filter(Boolean).map(m=>({name:m[1],type:m[2],data:m[3]}));}catch{return [];}}
function regSet(key,name,type,data){cp.execFileSync('reg.exe',['add',key,'/v',name,'/t',type,'/d',data,'/f'],{windowsHide:true,timeout:15000});}
/* PlayerPrefs strings are REG_BINARY, UTF-8 with a trailing NUL */
const hexText=h=>Buffer.from(h,'hex').toString('utf8').replace(/\0+$/,''),textHex=t=>Buffer.from(t+'\0','utf8').toString('hex').toUpperCase();
const JSON_KEY=/(\\?")([A-Za-z_][\w.\-]*)\1\s*:\s*\1([^"\\]{1,24})\1/g;
function jsonChanges(text){const out=[];let m;JSON_KEY.lastIndex=0;
 while((m=JSON_KEY.exec(text))){if(!LANG_KEY.test(m[2])||SKIP_KEY.test(m[2]))continue;const to=japaneseLike(m[3]);
  out.push({key:m[2],from:m[3],to:to??m[3],match:m[0],next:to?m[0].slice(0,m[0].length-m[3].length-m[1].length)+to+m[1]:m[0],already:JA_VALUE.test(m[3])});}
 return out;}
/* BinaryFormatter Dictionary<Int32,Single|Int32>: pairs are 01 <id> <metadata id> <key int32> <value>, or the first one
   inline after the member list "key" "value" 00 00 08 <0b|08> <library id>. */
function prefPairs(buf,key){
 const out=[],k=Buffer.alloc(4);k.writeInt32LE(key);
 const single=buf.includes(Buffer.from('[System.Int32, mscorlib','latin1'))&&/KeyValuePair`2\[\[System\.Int32[^\]]*\],\[System\.(Single|Int32)/.exec(buf.toString('latin1'));if(!single)return out;
 const kind=single[1];
 for(let i=buf.indexOf(k);i>=0;i=buf.indexOf(k,i+1)){
  const rec=i>=9&&buf[i-9]===0x01&&buf.readInt32LE(i-8)<0;
  const head=buf.lastIndexOf(Buffer.from('key\x05value','latin1'),i);const inline=head>=0&&i===head+9+2+2+4;
  if(!rec&&!inline)continue;out.push({offset:i+4,kind,value:kind==='Single'?buf.readFloatLE(i+4):buf.readInt32LE(i+4)});}
 return out;}
const enumMemo=new Map();
function preferenceLanguageKey(managed){
 if(!isDir(managed))return null;const dlls=list(managed).filter(n=>/\.dll$/i.test(n)&&!/^(?:Unity|System|mscorlib|Mono|netstandard|Microsoft|com\.rlabrecque)/i.test(n));
 const stamp=dlls.map(n=>{try{return n+fs.statSync(path.join(managed,n)).size;}catch{return n;}}).join('|');if(enumMemo.has(stamp))return enumMemo.get(stamp);
 /* the enum's numeric value is only in assembly metadata: read it with .NET reflection (read-only load) */
 const ps=`$d=$env:MEGULIT_MANAGED;[AppDomain]::CurrentDomain.add_ReflectionOnlyAssemblyResolve({param($s,$e) try{[Reflection.Assembly]::ReflectionOnlyLoadFrom((Join-Path $d (($e.Name -split ',')[0]+'.dll')))}catch{$null}});foreach($f in $env:MEGULIT_DLLS -split '\\|'){try{$a=[Reflection.Assembly]::ReflectionOnlyLoadFrom((Join-Path $d $f));try{$t=$a.GetTypes()}catch{$t=$_.Exception.InnerException.Types|?{$_}};foreach($x in $t){if($x.IsEnum -and $x.Name -match 'Pref|Setting|Option|Config'){$v=$x.GetField('Language');if($v){[Console]::WriteLine($v.GetRawConstantValue());exit}}}}catch{}}`;
 let key=null;try{const out=cp.execFileSync('powershell.exe',['-NoProfile','-Command',ps],{encoding:'utf8',windowsHide:true,timeout:60000,env:{...process.env,MEGULIT_MANAGED:managed,MEGULIT_DLLS:dlls.join('|')}}).trim();if(/^\d+$/.test(out))key=Number(out);}catch{}
 enumMemo.set(stamp,key);return key;}
function unityPlan(gameDir,env){
 const data=unityData(gameDir);if(!data)return null;
 const {company,product}=appInfo(data),assets=japaneseAssets(data),items=[];let found=false;
 if(company&&product){
  const regKey='HKCU\\Software\\'+company+'\\'+product;
  for(const v of env.registry.query(regKey)){const name=v.name.replace(/_h\d+$/,'');if(!LANG_KEY.test(name)||SKIP_KEY.test(name))continue;found=true;
   if(v.type==='REG_BINARY'){const cur=hexText(v.data),to=japaneseLike(cur);if(to)items.push({kind:'registry',key:regKey,name:v.name,type:v.type,original:v.data,patched:textHex(to),from:cur,to});}}
  const low=path.join(env.localLow,company,product),files=[];
  for(const d of [low,...list(low).map(n=>path.join(low,n)).filter(isDir)])for(const n of list(d)){const f=path.join(d,n);if(isFile(f))files.push(f);}
  const prefKey=files.some(f=>/\.(sav|dat|bin)$/i.test(f))?(env.prefKeyFor||preferenceLanguageKey)(path.join(data,'Managed')):null;
  for(const f of files.slice(0,200)){let buf;try{if(fs.statSync(f).size>256<<10)continue;buf=fs.readFileSync(f);}catch{continue;}
   if(/\.(json|txt|ini|cfg|xml|nson)$/i.test(f)&&!buf.includes(0)){const text=buf.toString('utf8'),ch=jsonChanges(text);if(ch.length)found=true;const todo=ch.filter(c=>c.next!==c.match);
    if(todo.length){let next=text;for(const c of todo)next=next.replace(c.match,c.next);items.push({kind:'file',file:f,buf,next:Buffer.from(next,'utf8'),from:todo[0].from,to:todo[0].to,key:todo[0].key,format:'json'});}continue;}
   if(prefKey!=null){const pairs=prefPairs(buf,prefKey);if(!pairs.length)continue;found=true;const next=Buffer.from(buf);let changed=false;
    for(const p of pairs){if(p.value===UNITY_JAPANESE)continue;if(p.kind==='Single')next.writeFloatLE(UNITY_JAPANESE,p.offset);else next.writeInt32LE(UNITY_JAPANESE,p.offset);changed=true;}
    if(changed)items.push({kind:'file',file:f,buf,next,from:pairs[0].value,to:UNITY_JAPANESE,key:'Language',format:'pref',prefKey});}}
 }
 let steamDriven=false;try{const meta=path.join(data,'il2cpp_data','Metadata','global-metadata.dat'),asm=path.join(data,'Managed','Assembly-CSharp.dll');const f=[meta,asm].find(isFile);
  if(f&&fs.statSync(f).size<200<<20)steamDriven=fs.readFileSync(f).includes(Buffer.from('GetCurrentGameLanguage','latin1'));}catch{}
 return {engine:'unity',found,items:assets.length?items:[],japaneseAssets:assets,steamDriven,company,product};
}

/* ---- Steam ------------------------------------------------------------------------------------------------- */
function steamApp(gameDir){
 const m=/^(.*[\\/]steamapps)[\\/]common[\\/]([^\\/]+)/i.exec(path.resolve(gameDir)+path.sep);if(!m)return null;
 for(const n of list(m[1]).filter(n=>/^appmanifest_\d+\.acf$/i.test(n))){const file=path.join(m[1],n);let t='';try{t=fs.readFileSync(file,'utf8');}catch{continue;}
  const inst=/"installdir"\s+"([^"]*)"/i.exec(t)?.[1];if(!inst||inst.toLowerCase()!==m[2].toLowerCase())continue;
  return {appid:/"appid"\s+"(\d+)"/.exec(t)?.[1]||n.match(/\d+/)[0],acf:file,current:/"UserConfig"\s*\{[^}]*"language"\s+"([^"]*)"/i.exec(t)?.[1]||''};}
 return null;}
function steamRunning(){try{return /steam\.exe/i.test(cp.execFileSync('tasklist.exe',['/FI','IMAGENAME eq steam.exe','/NH'],{encoding:'utf8',windowsHide:true,timeout:15000}));}catch{return false;}}
function setAcfLanguage(text,lang){
 const block=/("UserConfig"\s*\{)([^}]*)\}/i;
 if(block.test(text))return text.replace(block,(all,open,body)=>/"language"\s+"[^"]*"/i.test(body)?open+body.replace(/("language"\s+")[^"]*"/i,'$1'+lang+'"')+'}':open+body.replace(/\s*$/,'')+'\n\t\t"language"\t\t"'+lang+'"\n\t}');
 return text.replace(/\}\s*$/,'\t"UserConfig"\n\t{\n\t\t"language"\t\t"'+lang+'"\n\t}\n}\n');}

/* ---- public ----------------------------------------------------------------------------------------------- */
function environment(o={}){const home=o.home||os.homedir();return {home,appData:o.appData||process.env.APPDATA||path.join(home,'AppData','Roaming'),localAppData:o.localAppData||process.env.LOCALAPPDATA||path.join(home,'AppData','Local'),
 localLow:o.localLow||path.join(home,'AppData','LocalLow'),documents:o.documents||path.join(home,'Documents'),registry:o.registry||{query:regQuery,set:regSet},steamRunning:o.steamRunning||steamRunning,steamJapanese:o.steamJapanese,prefKeyFor:o.prefKeyFor};}
function manifestPath(gameDir){return path.join(gameDir,BACKUP_DIR,'manifest.json');}
function readManifest(gameDir){try{const m=JSON.parse(fs.readFileSync(manifestPath(gameDir),'utf8'));return m?.adapter===ADAPTER?m:null;}catch{return null;}}

function plan(gameDir,options={}){
 const env=environment(options),krkr=krkrPlan(gameDir,env),unity=krkr?null:unityPlan(gameDir,env),steam=steamApp(gameDir);
 const engine=krkr?.engine||unity?.engine||'';
 const items=[...(krkr?.files||[]).map(f=>({kind:'file',file:f.file,buf:f.buf,next:writeKrkr(f.info,f.changes.reduce((t,c)=>t.replace(c.match,c.next),f.info.text)),from:f.changes[0].from,to:f.changes[0].to,key:f.changes[0].key,format:'krkr'})),...(unity?.items||[])];
 const found=!!(krkr?.found||unity?.found);
 /* Japanese is known to exist: the game keeps a language setting (KiriKiri), Japanese resources (Unity), or the Steam store lists it */
 const japanese=!!(krkr?.found||unity?.japaneseAssets?.length||env.steamJapanese===true);
 const steamDriven=!!(krkr?.steamDriven||unity?.steamDriven);
 /* a game whose own setting already says Japanese needs no Steam change (the in-game choice wins over Steam's default) */
 const steamSwitch=steam&&!found&&japanese&&env.steamJapanese!==false&&steamDriven&&!/^japanese$/i.test(steam.current)?steam:null;
 return {engine,found,japanese,items,steam,steamSwitch,steamDriven,japaneseAssets:unity?.japaneseAssets||[],env};
}
function detect(gameDir,options={}){
 gameDir=path.resolve(String(gameDir||''));const m=readManifest(gameDir);
 if(m)return {state:'applied',adapter:ADAPTER,engine:m.engine,files:m.entries.length,cells:0,pending:0,manifest:{at:m.at,files:m.entries.length}};
 let p;try{p=plan(gameDir,options);}catch{return {state:'none'};}
 if(!p.engine&&!p.steamSwitch)return {state:'none'};
 const base={adapter:ADAPTER,engine:p.engine,appid:p.steam?.appid||'',steamLanguage:p.steam?.current||'',cells:0};
 if(p.items.length)return {...base,state:'restorable',mode:'setting',files:p.items.length,pending:p.items.length,changes:p.items.map(i=>({kind:i.kind,where:i.kind==='registry'?i.key+'\\'+i.name:i.file,key:i.key||i.name,from:i.from,to:i.to}))};
 if(p.steamSwitch){const running=p.env.steamRunning();return {...base,state:running?'steam-guide':'restorable',mode:'steam',files:1,pending:1,steamRunning:running};}
 if(p.found)return {...base,state:'already'};
 if(p.engine&&p.japanese)return {...base,state:'first-run'};
 return {state:'none',engine:p.engine};
}
function writeAtomic(file,data){const tmp=file+'.megulit-tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}
function apply(gameDir,options={}){
 gameDir=path.resolve(String(gameDir||''));if(readManifest(gameDir))throw Error('ALREADY_APPLIED');
 const p=plan(gameDir,options),backup=path.join(gameDir,BACKUP_DIR,'language'),entries=[];
 const items=p.items.length?p.items:[];
 if(!items.length&&p.steamSwitch){if(p.env.steamRunning())throw Error('STEAM_RUNNING');
  const text=fs.readFileSync(p.steamSwitch.acf,'utf8');items.push({kind:'file',file:p.steamSwitch.acf,buf:Buffer.from(text,'utf8'),next:Buffer.from(setAcfLanguage(text,'japanese'),'utf8'),from:p.steamSwitch.current,to:'japanese',key:'steam'});}
 if(!items.length)throw Error('NOTHING_TO_RESTORE');
 fs.mkdirSync(backup,{recursive:true});
 items.forEach((it,i)=>{
  if(it.kind==='registry'){p.env.registry.set(it.key,it.name,it.type,it.patched);entries.push({kind:'registry',key:it.key,name:it.name,type:it.type,original:it.original,patched:it.patched,from:it.from,to:it.to});return;}
  const keep=String(i).padStart(2,'0')+'-'+path.basename(it.file);fs.writeFileSync(path.join(backup,keep),it.buf);writeAtomic(it.file,it.next);
  entries.push({kind:'file',file:it.file,backup:keep,originalSha256:sha(it.buf),patchedSha256:sha(it.next),key:it.key,from:it.from,to:it.to,format:it.format||'',prefKey:it.prefKey});});
 writeAtomic(manifestPath(gameDir),Buffer.from(JSON.stringify({version:1,adapter:ADAPTER,engine:p.engine,at:new Date().toISOString(),entries},null,1)));
 return {applied:entries.length,cells:0,mode:entries.some(e=>e.key==='steam')?'steam':'setting'};
}
function revert(buf,e){
 try{
  if(e.format==='krkr'){const info=readKrkr(buf);if(!info)return null;const ch=krkrChanges(info.text).filter(c=>c.key===e.key&&String(c.from)===String(e.to));if(!ch.length)return null;
   let t=info.text;for(const c of ch)t=t.replace(c.match,typeof e.from==='number'?c.match.replace(/-?\d+$/,String(e.from)):c.match.replace(/"[^"]*"$/,'"'+e.from+'"'));return writeKrkr(info,t);}
  if(e.format==='json'){const t=buf.toString('utf8'),ch=jsonChanges(t).filter(c=>c.key===e.key&&c.from===e.to);if(!ch.length)return null;let n=t;for(const c of ch)n=n.replace(c.match,c.match.replace(/[^"\\]*(\\?")$/,e.from+'$1'));return Buffer.from(n,'utf8');}
  if(e.format==='pref'){const pairs=prefPairs(buf,e.prefKey).filter(p=>p.value===e.to);if(!pairs.length)return null;const n=Buffer.from(buf);for(const p of pairs){if(p.kind==='Single')n.writeFloatLE(e.from,p.offset);else n.writeInt32LE(e.from,p.offset);}return n;}
 }catch{}
 return null;}
function restore(gameDir,options={}){
 gameDir=path.resolve(String(gameDir||''));const m=readManifest(gameDir);if(!m)throw Error('NOT_APPLIED');
 const env=environment(options),backup=path.join(gameDir,BACKUP_DIR,'language'),skipped=[];let restored=0;
 for(const e of m.entries){
  if(e.kind==='registry'){const now=env.registry.query(e.key).find(v=>v.name===e.name);if(now&&now.data.toUpperCase()!==e.patched.toUpperCase()&&now.data.toUpperCase()!==e.original.toUpperCase()){skipped.push(e.name);continue;}env.registry.set(e.key,e.name,e.type,e.original);restored++;continue;}
  const keep=path.join(backup,e.backup);if(!isFile(keep)){skipped.push(e.file);continue;}
  const now=isFile(e.file)?sha(fs.readFileSync(e.file)):'';if(now===e.originalSha256){restored++;continue;}
  if(e.key==='steam'&&now!==e.patchedSha256){/* Steam rewrote the manifest: put back only the language */
   if(env.steamRunning()){skipped.push(e.file);continue;}const t=fs.readFileSync(e.file,'utf8');if(/"UserConfig"\s*\{[^}]*"language"\s+"japanese"/i.test(t)){writeAtomic(e.file,Buffer.from(setAcfLanguage(t,e.from||'english'),'utf8'));restored++;}else skipped.push(e.file);continue;}
  if(now!==e.patchedSha256){/* the game saved its settings since (KiriKiri rewrites its system save on every exit): put back only the language value, and only while it is still Japanese */
   const next=isFile(e.file)?revert(fs.readFileSync(e.file),e):null;if(!next){skipped.push(e.file);continue;}writeAtomic(e.file,next);restored++;continue;}
  writeAtomic(e.file,fs.readFileSync(keep));restored++;}
 if(!skipped.length)fs.rmSync(path.join(gameDir,BACKUP_DIR),{recursive:true,force:true});
 return {restored,skipped};
}
module.exports={detect,apply,restore,readManifest,ADAPTER,_internal:{decodeCf,readKrkr,writeKrkr,krkrChanges,jsonChanges,japaneseLike,prefPairs,setAcfLanguage,steamApp,japaneseAssets,hexText,textHex}};
