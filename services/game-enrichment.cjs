'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
function candidates(game){const lib=game.original.library||{},exe=path.win32.basename(game.row.executable,'.exe').toLowerCase();const precise={rance01:'ランス01 光をもとめて',rance02:'ランス02改 反逆の少女たち',rance03:'ランス03 リーザス陥落'};return [...new Set([precise[exe],game.row.title,...(lib.names||[]),game.original.media?.title].filter(Boolean).flatMap(t=>[t,...String(t).split(/\s+\/\s+/)]) )].filter(t=>t.length>2).slice(0,6);}
// Games under <Steam>\steamapps\common\<dir> carry their appid in steamapps\appmanifest_<id>.acf, even when the
// library found them through a plain folder scan. The appid is the most reliable key for VNDB and covers.
const {steamAppidFor}=require('../core/library.cjs');
// Exact title (case/width-insensitive, symbols kept) or "title + subtitle" first; symbol-stripped equality
// only for titles long enough not to collide ("eden*" must not become "Eden"). VNDB aliases count like other
// titles: a folder is often named by one (千恋万花 for 千恋＊万花).
const plain=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
function pickVn(results,title){
 const q=plain(title),loose=normalize(title),main=v=>[v.title,v.alttitle].filter(Boolean),all=v=>[...main(v),...(v.titles||[]).map(x=>x.title),...(v.aliases||[])].filter(Boolean);
 // append discs, fan discs, trials: only when nothing else fits
 const extra=v=>main(v).some(n=>/append|fan ?disc|ファンディスク|追加ディスク|特典|体験版|trial|demo|re:graphic/i.test(n));
 const prefix=n=>{const t=plain(n);return q.length>=3&&(t.startsWith(q+' ')||t.startsWith(q+':')||t.startsWith(q+' -')||t.startsWith(q+' －'));};
 return results.find(v=>main(v).some(n=>plain(n)===q))
  ||results.find(v=>!extra(v)&&main(v).some(prefix))
  ||results.find(v=>!extra(v)&&all(v).some(n=>plain(n)===q))
  ||results.find(v=>all(v).some(n=>plain(n)===q))
  ||(loose.length>=6?results.find(v=>all(v).some(n=>normalize(n)===loose)):null)||null;
}
async function json(fetcher,url,options={}){const r=await fetcher(url,{...options,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('METADATA_NETWORK');return r.json();}
const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
// A VNDB entry typed by the user: "v12345", "12345" or a vndb.org link. Empty clears it; anything else is refused.
function vndbIdFrom(value){const text=String(value??'').trim();if(!text)return '';const m=/^(?:https?:\/\/(?:www\.)?vndb\.org\/)?v?(\d{1,7})(?:[/?#].*)?$/i.exec(text);if(!m||!Number(m[1]))throw Error('INVALID_VNDB_ID');return 'v'+Number(m[1]);}
class GameEnrichment{
 constructor(root,emit=()=>{},fetcher=fetch,translate=null){this.root=root;this.emit=emit;this.abort=new AbortController();this.fetch=(url,options={})=>fetcher(url,{...options,signal:AbortSignal.any([this.abort.signal,...(options.signal?[options.signal]:[])])});this.running=new Map();this.queue=[];this.file=path.join(root,'data/config/game-reception.json');this.synopses=new(require('../core/library.cjs').Synopses)({config:path.join(root,'data/config')},translate?{translate}:{});}
 stop(){this.closed=true;this.queue.length=0;this.abort.abort();}
 enqueue(ids,refresh=false){if(this.closed)return;this.refreshIds??=new Set();for(const id of ids){if(refresh)this.refreshIds.add(id);if(!this.queue.includes(id))this.queue.push(id);}if(!this.pumping)this.pump();}
 async pump(){this.pumping=true;try{while(!this.closed&&this.queue.length){const id=this.queue.shift();const refresh=!!this.refreshIds?.delete(id);try{await this.ensure(id,require('./store.cjs').publicPreferences(this.root).language,refresh);}catch{}}}finally{this.pumping=false;}}
 ensure(id,locale='zh',refresh=false){if(this.closed)return Promise.reject(Error('RUNTIME_STOPPED'));const key=id+':'+locale;if(this.running.has(key))return this.running.get(key);const job=this.run(id,locale,refresh).finally(()=>this.running.delete(key));this.running.set(key,job);return job;}
 async run(id,locale,refresh){const store=require('./store.cjs');let db=store.openStore(this.root),game;try{const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row)throw Error('GAME_NOT_FOUND');game={row,original:JSON.parse(row.original||'{}')};}finally{db.close();}
  // A VNDB entry the user set (save_game) wins over every automatic match and is kept outside `library`, which each
  // library scan rewrites. When it differs from the last match, the cover and synopsis follow it like a correction.
  const manualVnid=vndbIdFrom(game.original.vndbManual||'');
  let lib=game.original.library||{},vn=null,appid=String(lib.appid||'')||steamAppidFor(game.row.executable),cover='';const titles=candidates(game),previousVnid=String(lib.vndbId||'');
  let vndbSteamAppid=appid&&lib.vndbSteamAppid===appid?appid:null;
  let vnid=manualVnid||(!appid||vndbSteamAppid?previousVnid:'');
  const coverPresent=!!store.imageData(this.root,'covers',game.row.cover);
  const cache=store.readJSON(this.file),savedCache=cache[id];
  const cached=!appid||vnid&&savedCache?.vndb?.url==='https://vndb.org/'+vnid?savedCache:undefined;
  if(!refresh&&cached?.synopsisPolicy===2&&require('../core/synopsis-policy.cjs').approved(cached?.synopses?.[locale]?.source)&&cached?.synopses?.[locale]?.text&&Date.now()-cached.at<86400000&&coverPresent)return this.result(id,locale,cached);
  // A Steam appid identifies the exact VNDB entry; it also corrects an earlier wrong title match.
  if(!manualVnid&&/^\d+$/.test(appid))try{const r=await json(this.fetch,'https://api.vndb.org/kana/release',post({filters:['extlink','=',['steam',Number(appid)]],fields:'vns.id',results:5}));const id=r.results?.flatMap(x=>x.vns||[])[0]?.id;vnid=id||'';vndbSteamAppid=id?appid:null;}catch{}
  if(manualVnid)vndbSteamAppid=null;
  if(refresh&&!manualVnid&&!/^\d+$/.test(appid)&&vnid===previousVnid)vnid='';
  try{if(/^v?\d+$/.test(vnid)){const r=await json(this.fetch,'https://api.vndb.org/kana/vn',post({filters:['id','=',vnid.startsWith('v')?vnid:'v'+vnid],fields:'title,alttitle,titles.title,image.url,rating,votecount,released,developers.name,extlinks.url'}));vn=r.results?.[0];}
   else if(!appid)for(const title of titles){const r=await json(this.fetch,'https://api.vndb.org/kana/vn',post({filters:['search','=',title],fields:'title,alttitle,titles.title,aliases,image.url,rating,votecount,released,developers.name,extlinks.url',results:8,sort:'searchrank'}));vn=pickVn(r.results||[],title);if(vn)break;}
  }catch{}
  if(vn){vnid=vn.id;cover=vn.image?.url||'';const steam=(vn.extlinks||[]).map(x=>x.url).find(u=>/^https:\/\/store\.steampowered\.com\/app\/\d+/.test(u));if(steam&&!appid)appid=/\/app\/(\d+)/.exec(steam)[1];}
  if(vnid&&!appid)try{const r=await json(this.fetch,'https://api.vndb.org/kana/release',post({filters:['vn','=', ['id','=',vnid]],fields:'extlinks.url',results:20}));const steam=(r.results||[]).flatMap(v=>v.extlinks||[]).map(v=>v.url).find(u=>/^https:\/\/store\.steampowered\.com\/app\/\d+/.test(u));if(steam)appid=/\/app\/(\d+)/.exec(steam)[1];}catch{}
  let steamScore=null,reviews=[],critic=null,steamCover='';
  if(/^\d+$/.test(appid))try{const language={zh:'schinese',ja:'japanese',en:'english'}[locale]||'all';const data=await json(this.fetch,`https://store.steampowered.com/appreviews/${appid}?json=1&filter=all&language=${language}&purchase_type=all&num_per_page=3`);const summary=await json(this.fetch,`https://store.steampowered.com/appreviews/${appid}?json=1&filter=all&language=all&purchase_type=all&num_per_page=0`);const total=summary.query_summary?.total_reviews||0,positive=summary.query_summary?.total_positive||0;steamScore={positive,total,percent:total?Math.round(positive/total*100):null,url:`https://store.steampowered.com/app/${appid}/#app_reviews_hash`,language};
   let items=data.reviews||[];if(!items.length&&language!=='english'){const fallback=await json(this.fetch,`https://store.steampowered.com/appreviews/${appid}?json=1&filter=all&language=english&purchase_type=all&num_per_page=3`);items=fallback.reviews||[];}
   reviews=items.slice(0,3).map(r=>({text:String(r.review||'').replace(/<[^>]*>|\[[^\]]+\]/g,'').split(/\s+/).slice(0,25).join(' ').slice(0,/schinese|japanese/.test(r.language||'')?40:180),helpful:Number(r.votes_up)||0,positive:!!r.voted_up,url:`https://steamcommunity.com/profiles/${String(r.author?.steamid||'').replace(/\D/g,'')}/recommended/${appid}/`,language:r.language||language}));steamCover=`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`;
  }catch{}
  for(const review of reviews)if(review.text&&review.language!==({zh:'schinese',ja:'japanese',en:'english'}[locale])){const translated=await require('../core/library.cjs').machine(review.text,locale);if(translated)review.translatedText=translated;}
  // A corrected match (new VNDB id, or a Steam appid that differs from what the cover came from) replaces the old cover.
  // A cover the user picked (game_cover) is never replaced.
  const corrected=!!previousVnid&&vnid.replace(/^v/,'')!==previousVnid.replace(/^v/,''),coverKey=/^\d+$/.test(appid)?'steam:'+appid:(vnid?'vndb:'+vnid:''),replaceCover=!game.original.coverCustom&&!!coverKey&&(corrected||(!!cached?.coverKey&&cached.coverKey!==coverKey));
  // The Steam capsule comes first. Newer Steam apps keep it under a hashed folder and the plain path answers 404,
  // so the VNDB cover is tried next.
  let file='';if(!coverPresent||replaceCover){const folder=path.dirname(game.row.executable);for(const name of ['cover.jpg','cover.png','folder.jpg','jacket.jpg','封面.jpg','封面.png']){const p=path.join(folder,name);try{const src=require('./assets.cjs').preview(p);file=this.saveCover(id,src);if(file)break;}catch{}}for(const url of [steamCover,cover]){if(file||!url)continue;try{const r=await this.fetch(url,{signal:AbortSignal.timeout(12000)});if(r.ok){const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<=12*1024*1024){const ext=bytes[0]===255&&bytes[1]===216?'jpeg':bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'png':'';if(ext)file=this.saveCover(id,`data:image/${ext};base64,`+bytes.toString('base64'));}}}catch{}}}
  if(this.closed)throw Error('RUNTIME_STOPPED');db=store.openStore(this.root);try{const current=db.prepare('SELECT original FROM games WHERE id=?').get(id);if(!current)throw Error('GAME_NOT_FOUND');const original=JSON.parse(current.original||'{}');original.library={...original.library,vndbId:vnid||(appid?null:original.library?.vndbId),appid:appid||original.library?.appid,...(appid?{vndbSteamAppid}:{}),...(vn?{names:[...new Set([...(original.library?.names||[]),vn.title,vn.alttitle,...(vn.titles||[]).map(t=>t.title)].filter(Boolean))],release_date:vn.released,developer:(vn.developers||[]).map(d=>d.name).join(' / ')}:{})};db.prepare("UPDATE games SET original=?,cover=CASE WHEN cover='' OR cover=? THEN ? ELSE cover END WHERE id=?").run(JSON.stringify(original),coverPresent&&!(replaceCover&&file)?'__keep__':game.row.cover,file||game.row.cover,id);
   if(vn?.released&&/^\d{4}-\d{2}-\d{2}$/.test(vn.released))db.prepare("UPDATE series_memberships SET released_on=? WHERE game_id=? AND released_on='' AND release_order IS NULL").run(vn.released,id);
   require('./series.cjs').autoGroup(db,this.root);
  }finally{db.close();}
  const synopsis=await this.synopses.get({mediaId:game.row.legacy_id??id,titles,vndbId:vnid,appid,lang:locale,refresh:refresh||corrected});
  if(this.closed)throw Error('RUNTIME_STOPPED');const value={...cached,coverKey:coverKey||cached?.coverKey,synopsisPolicy:2,at:Date.now(),vndb:vn?{rating:Number.isFinite(vn.rating)?vn.rating/10:null,votes:vn.votecount||0,url:`https://vndb.org/${vnid}`}:(corrected?null:cached?.vndb||null),steam:steamScore||cached?.steam||null,critic,reviews:{...cached?.reviews,[locale]:reviews.length?reviews:cached?.reviews?.[locale]||[]},synopses:{...(corrected?{}:cached?.synopses),[locale]:synopsis}};
  // Preserve other games completed while this network request was in flight.
  const latest=store.readJSON(this.file);latest[id]=value;fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(latest));fs.renameSync(this.file+'.tmp',this.file);this.emit('library-updated',{id});return this.result(id,locale,value);
 }
 saveCover(id,src){const m=/^data:image\/(png|jpeg);base64,(.+)$/s.exec(src);if(!m)return '';const file='enriched-'+crypto.createHash('sha256').update(id).digest('hex').slice(0,16)+(m[1]==='png'?'.png':'.jpg'),folder=path.join(this.root,'data/assets/covers');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,file),Buffer.from(m[2],'base64'));return file;}
 result(id,locale,value){const db=require('./store.cjs').openStore(this.root);try{const result=require('./game-detail.cjs').detail(db,this.root,id,locale);if(require('../core/synopsis-policy.cjs').approved(value.synopses?.[locale]?.source))result.synopsis=value.synopses[locale];result.reception={vndb:value.vndb,steam:value.steam,critic:value.critic,reviews:value.reviews?.[locale]||[],at:value.at};return result;}finally{db.close();}}
}
module.exports={GameEnrichment,candidates,steamAppidFor,pickVn,vndbIdFrom};
