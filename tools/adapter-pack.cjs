#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E561 maintainer tool for adapter packs (docs/ADAPTER-PACKS.md).
     node tools/adapter-pack.cjs keygen [--out <folder outside the repo>] [--id k1]
         new Ed25519 key pair; the private key is written outside the repository (default %USERPROFILE%\.megulit-signing),
         the public key is printed for services/adapter-pack-keys.json
     node tools/adapter-pack.cjs check <pack.json>                 schema + capabilities, no signature needed
     node tools/adapter-pack.cjs sign <pack.json> [--key <pem>] [--id k1] [--out <signed.json>]
     node tools/adapter-pack.cjs verify <signed.json>              what an app would say (signature with the repo keys)
     node tools/adapter-pack.cjs try <signed.json|pack.json> <game folder>   match + read the game locally (no upload)
     node tools/adapter-pack.cjs publish <signed.json>             POST to the relay (MEGULIT_ADAPTER_ADMIN_TOKEN)
     node tools/adapter-pack.cjs withdraw <id> <version>           take a published version off the feed
     node tools/adapter-pack.cjs probe-request <request id> <key,key,...>   ask those games for a fresh probe
     node tools/adapter-pack.cjs reports [<pack id>]               before/after numbers the apps sent back (verdict: solved /
                                                                   read / partial / failed; origin: runtime / probe)
     node tools/adapter-pack.cjs from-runtime <bundle.json> <game key prefix> --id <pack id> [--grammar <grammar.json>] [--out <draft.json>]
         E596: an unsigned pack draft from a game's runtime findings (recovered index + verified key + grammar guess);
         check the grammar against the script samples, then sign and publish
   Relay base: --relay <url> or MEGULIT_RELAY_BASE, default https://api.megulit.com. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const packs=require('../services/adapter-packs.cjs');
const args=process.argv.slice(2),cmd=args.shift();
const opt=(name,fallback)=>{const i=args.indexOf('--'+name);if(i<0)return fallback;const v=args[i+1];args.splice(i,2);return v;};
const repo=path.resolve(__dirname,'..');
const fail=m=>{console.error(m);process.exit(1);};
const relay=()=>(opt('relay',process.env.MEGULIT_RELAY_BASE||'https://api.megulit.com')).replace(/\/+$/,'');
const token=()=>process.env.MEGULIT_ADAPTER_ADMIN_TOKEN||fail('MEGULIT_ADAPTER_ADMIN_TOKEN is not set');
const readPack=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){fail('cannot read '+f+': '+e.message);}};
async function call(method,route,body){const r=await fetch(relay()+route,{method,headers:{'content-type':'application/json',authorization:'Bearer '+token(),'user-agent':'MeguLit-maintainer'},body:body?JSON.stringify(body):undefined});const t=await r.text();console.log(r.status,t);if(!r.ok)process.exit(1);}
(async()=>{switch(cmd){
 case 'keygen':{const out=path.resolve(opt('out',path.join(os.homedir(),'.megulit-signing'))),id=opt('id','k1');
  if((out+path.sep).toLowerCase().startsWith((repo+path.sep).toLowerCase()))fail('refusing to write a private key inside the repository');
  const file=path.join(out,'adapter-pack-'+id+'.pem');if(fs.existsSync(file))fail(file+' exists; pick another --id');
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(file,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const pub=publicKey.export({type:'spki',format:'der'}).toString('base64');
  console.log(JSON.stringify({private:file,entry:{id,alg:'ed25519',publicKey:pub,added:new Date().toISOString().slice(0,10)}},null,1));break;}
 case 'check':{const p=readPack(args[0]);const v=packs.validate(packs.migrate(p)||p);console.log(v.ok?'valid; needs '+packs.needs(p).join(', '):'invalid: '+v.error);if(!v.ok)process.exit(1);break;}
 case 'sign':{const p=readPack(args[0]),id=opt('id','k1'),key=opt('key',path.join(os.homedir(),'.megulit-signing','adapter-pack-'+id+'.pem')),out=opt('out',args[0].replace(/\.json$/i,'')+'.signed.json');
  const body={...p,requires:p.requires||packs.needs(p),createdAt:p.createdAt||new Date().toISOString()};delete body.signature;
  const v=packs.validate(body);if(!v.ok)fail('invalid: '+v.error);const signed=packs.sign(body,fs.readFileSync(key,'utf8'),id);
  fs.writeFileSync(out,JSON.stringify(signed,null,1));console.log(out,'sha256',packs.digest(signed));break;}
 case 'verify':{const p=readPack(args[0]);const a=packs.admit(p,{app:opt('app','')});console.log(a.ok?'ok, key '+a.keyId+', sha256 '+a.sha256:'refused: '+a.reason);if(!a.ok)process.exit(1);break;}
 case 'try':{const p=readPack(args[0]),dir=path.resolve(args[1]||'.');const v=packs.validate(packs.migrate(p)||p);if(!v.ok)fail('invalid: '+v.error);
  const score=packs.match(p,dir);console.log('match score',score);if(!score||!p.source)break;let n=0,lines=0,kana=0;const t=Date.now();
  for(const s of packs.scenesOf(p,dir)){n++;let r;try{r=packs.parse(p,s.read());}catch(e){console.log(' scene',s.name,'failed',e.message);continue;}lines+=r.lines.length;for(const l of r.lines)if(/[ぁ-ゖァ-ヺ]/.test(l))kana++;}
  console.log({scenes:n,lines,japaneseLines:kana,ms:Date.now()-t});break;}
 case 'publish':{const p=readPack(args[0]);const a=packs.admit(p,{app:''});if(!a.ok)fail('not publishable: '+a.reason+' (sign it with a key listed in services/adapter-pack-keys.json and ship that key in an app first)');await call('POST','/api/adapters/publish',{pack:p});break;}
 case 'withdraw':await call('POST','/api/adapters/withdraw',{id:args[0],version:Number(args[1])});break;
 case 'probe-request':await call('POST','/api/adapters/probe-request',{id:args[0],keys:String(args[1]||'').split(',').filter(Boolean)});break;
 case 'reports':await call('GET','/api/adapters/reports'+(args[0]?'?pack='+encodeURIComponent(args[0]):''));break;
 case 'from-runtime':{const id=opt('id',''),grammarFile=opt('grammar',''),outFile=opt('out','');const bundle=readPack(args[0]),prefix=String(args[1]||'');
  const g=(bundle.games||[]).find(x=>String(x.key||'').startsWith(prefix)&&x.runtime);if(!g)fail('no game with runtime findings for key '+prefix);
  const r=require('../services/runtime-pack-draft.cjs').draft(g.runtime,{id,grammar:grammarFile?readPack(grammarFile):null,title:g.title?('Runtime: '+g.title).slice(0,200):''});
  for(const n of r.notes||[])console.error('note:',n);if(r.error&&!r.pack)fail(r.error);if(r.error)console.error('draft is not valid yet:',r.error);
  const file=outFile||id+'.draft.json';fs.writeFileSync(file,JSON.stringify(r.pack,null,1));console.log(file);break;}
 default:console.log(fs.readFileSync(__filename,'utf8').split('*/')[0].split('\n').slice(3).join('\n'));}})().catch(e=>fail(e.message));
