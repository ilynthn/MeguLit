// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 megulit.com user centre: changes upload by themselves.

   Every POLL the service takes a cheap fingerprint of the tables that feed the sync (counts and newest ids, no text).
   When it moved and then stayed still for DEBOUNCE (or has been moving for MAX_WAIT, for example while reading), one sync
   runs. A failed sync is retried with a growing wait (30 s, 1 min, 2, 5, 10, then every 30 min). Records that could not be
   sent stay queued in account_sync (pending=1), so a restart picks them up again: the first tick after the start syncs when
   anything is queued, the last sync failed, or the last good one is older than STALE.
   Nothing runs when nobody is signed in or 「同步到网页」 is off. */
const POLL=15000,DEBOUNCE=30000,MAX_WAIT=5*60000,STALE=6*3600000;
const BACKOFF=[30000,60000,120000,300000,600000,1800000];
const QUIET=new Set(['UNAUTHORIZED','NOT_LOGGED_IN','SYNC_OFF','RELAY_NOT_CONFIGURED']);

function fingerprint(db){
 const one=sql=>{const row=db.prepare(sql).get();return row?Object.values(row).join(':'):'';};
 return [
  one('SELECT COUNT(*) a,IFNULL(MAX(id),0) b,IFNULL(SUM(status),0) c FROM vocabulary'),
  one('SELECT COUNT(*) a,IFNULL(MAX(id),0) b FROM examples'),
  one('SELECT COUNT(*) a,IFNULL(MAX(id),0) b FROM saved_sentences'),
  one('SELECT COUNT(*) a,IFNULL(MAX(id),0) b,IFNULL(SUM(active_seconds),0) c FROM reading_sessions'),
  one('SELECT COUNT(*) a,IFNULL(MAX(id),0) b FROM lookup_events'),
  one('SELECT COUNT(*) a,IFNULL(MAX(id),0) b FROM review_events'),
  one('SELECT COUNT(*) a,IFNULL(MAX(last_launched_at),0) b FROM games WHERE removed_at IS NULL')
 ].join('|');
}

function create({account,openDb,now=()=>Date.now()}){
 let syncedFp=undefined,lastFp=null,changedAt=0,dirtySince=0,failures=0,nextAt=0;
 async function tick(){
  const status=account.status();
  if(!status.loggedIn||!status.configured||status.webSync===false||status.syncing)return 'idle';
  let fp;try{const db=openDb();try{fp=fingerprint(db);}finally{db.close();}}catch{return 'idle';}
  const t=now();
  if(syncedFp===undefined){
   /* first tick since the start: sync soon when something is queued, the last sync failed, or the cloud copy is old */
   const queued=Object.values(status.pending||{}).reduce((a,b)=>a+b,0)>0;
   syncedFp=queued||status.lastError||t-(status.lastSyncAt||0)>STALE?null:fp;
   lastFp=fp;changedAt=t-DEBOUNCE;dirtySince=t-MAX_WAIT;
  }
  if(fp!==lastFp){lastFp=fp;changedAt=t;}
  if(fp===syncedFp){dirtySince=0;return 'clean';}
  if(!dirtySince)dirtySince=t;
  if(t<nextAt)return 'backoff';
  if(t-changedAt<DEBOUNCE&&t-dirtySince<MAX_WAIT)return 'waiting';
  try{
   await account.sync();
   syncedFp=fp;dirtySince=0;failures=0;nextAt=0;return 'synced';
  }catch(error){
   if(QUIET.has(error?.code))return 'idle';
   failures++;nextAt=t+BACKOFF[Math.min(failures-1,BACKOFF.length-1)];return 'failed';
  }
 }
 return {tick,state:()=>({syncedFp,failures,nextAt})};
}

let timer=null;
function start(root,{poll=POLL}={}){
 if(timer)return;
 const account=require('./account.cjs').accountFor?.(root);if(!account)return;
 const auto=create({account,openDb:()=>require('./store.cjs').openStore(root)});
 let busy=false;
 timer=setInterval(()=>{if(busy)return;busy=true;auto.tick().catch(()=>{}).finally(()=>{busy=false;});},poll);timer.unref?.();
}
function stop(){if(timer){clearInterval(timer);timer=null;}}

module.exports={create,fingerprint,start,stop,POLL,DEBOUNCE,MAX_WAIT,STALE,BACKOFF};
