// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 Cardinal's tape on disk (cold-test run/cardinal-tape.jsonl, tools/cardinal.cjs --tape): one JSON record per line.
   Version 1 starts with a header line {"tape":"megulit.cardinal-tape","version":1,"lines":n,"game":"…"}; a file without a header is
   version 0 (every tape written before this). parse() never guesses: a tape it cannot use is a TapeError with a code and a sentence,
   so a broken file is reported as broken instead of scoring 0 everywhere.
     TAPE_EMPTY        no records
     TAPE_UNREADABLE   most lines are not JSON (over half, or none usable)
     TAPE_VERSION      a header of a newer or unknown version
     TAPE_NO_LINES     records, but not one dialogue line (hookSource) to replay
     TAPE_NO_TIME      records without a numeric t
   Records: {t, gwb|hb|m|screen}; anything else is counted as skipped. */
const KIND='megulit.cardinal-tape',VERSION=1;
class TapeError extends Error{constructor(code,message){super(code+': '+message);this.code=code;}}
const isRecord=r=>r&&typeof r==='object'&&(r.hb||r.gwb||r.m||r.screen||r.phase);
function parse(text){
 const raw=String(text||'').split(/\r?\n/).filter(l=>l.trim());if(!raw.length)throw new TapeError('TAPE_EMPTY','the tape has no records');
 let header=null,bad=0,skipped=0,untimed=0;const rows=[];
 for(const [i,l] of raw.entries()){let v;try{v=JSON.parse(l);}catch{bad++;continue;}
  if(i===0&&v&&v.tape===KIND){header=v;continue;}
  if(!isRecord(v)){skipped++;continue;}if(!Number.isFinite(v.t)){untimed++;continue;}rows.push(v);}
 if(header&&header.version!==VERSION)throw new TapeError('TAPE_VERSION','tape version '+JSON.stringify(header.version)+' is not '+VERSION+' (a newer MeguLit wrote it)');
 if(bad*2>raw.length||!rows.length&&bad)throw new TapeError('TAPE_UNREADABLE',bad+' of '+raw.length+' lines are not JSON');
 if(!rows.length&&untimed)throw new TapeError('TAPE_NO_TIME',untimed+' records have no time (t)');
 const lines=rows.filter(r=>(r.hb||r.m)?.type==='hookSource').length;
 if(!lines)throw new TapeError('TAPE_NO_LINES','no dialogue line (hookSource) among '+rows.length+' records');
 return {version:header?VERSION:0,header,rows,lines,skipped:{bad,records:skipped,untimed}};}
/* a tape snapshot (core/cardinal/tape.cjs snapshot()) -> the file's text, header first */
function serialize(snap){const rows=Array.isArray(snap?.rows)?snap.rows:[];
 return [JSON.stringify({tape:KIND,version:VERSION,lines:snap?.lines|0,game:String(snap?.game||'')}),...rows.map(r=>JSON.stringify(r))].join('\n')+'\n';}
module.exports={parse,serialize,TapeError,KIND,VERSION};
