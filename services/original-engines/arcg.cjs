// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path');
const kit=require('./kit.cjs');

const SCB=/\.scb$/i;
const HEADER_SIZE=32, MAX_SIZE=64<<20, MAX_FIELD=255+8;
const PADDING=Buffer.alloc(64<<10,0xff);
const decoder=new TextDecoder('shift_jis',{fatal:true});
const expired=deadline=>deadline!==Infinity&&Date.now()>=deadline;

function header(bytes,size){
 if(bytes.length<HEADER_SIZE||size>MAX_SIZE||bytes.toString('latin1',0,4)!=='ARCG'||
    bytes.readUInt32LE(4)!==0x10000||bytes.readUInt16LE(16)!==1)return null;
 const index=bytes.readUInt32LE(8), length=bytes.readUInt32LE(12), count=bytes.readUInt32LE(18);
 if(index<HEADER_SIZE||length<10||index+length>size||!count)return null;
 return {index,end:index+length,count};
}

function nameField(bytes,at,end,allowEmpty=false){
 const width=bytes[at];
 if(width<2||at+width+8>end)return null;
 const name=bytes.subarray(at+1,at+width);
 const terminator=name.indexOf(0);
 if(terminator<0||(!allowEmpty&&!terminator))return null;
 return {text:kit.cname(name),next:at+width};
}

function firstEntry(root,{index,end,count}){
 const directory=nameField(root,0,root.length,true);
 if(!directory||root.readUInt32LE(directory.next+4)!==count)return null;
 const at=root.readUInt32LE(directory.next);
 return at>=index+directory.next+8&&count<=Math.floor((end-at)/11)?at:null;
}

function entryAt(bytes,at,end,index){
 const name=nameField(bytes,at,end);
 if(!name)return null;
 const offset=bytes.readUInt32LE(name.next),size=bytes.readUInt32LE(name.next+4);
 if(offset<HEADER_SIZE||offset+size>index)return null;
 return {name:name.text,offset,size,next:name.next+8};
}

/* Flat ARCG v1 script archives. Directory and entry offsets are absolute. */
function entries(bytes,deadline){
 const archive=header(bytes,bytes.length);
 if(!archive)return [];
 const {index,end,count}=archive;
 let at=firstEntry(bytes.subarray(index,Math.min(index+MAX_FIELD,end)),archive);
 if(at===null)return [];

 const files=[];
 for(let i=0;i<count;i++){
  if(expired(deadline))return [];
  const entry=entryAt(bytes,at,end,index);
  if(!entry)return [];
  files.push(entry);
  at=entry.next;
 }
 return files;
}

function pageText(parts){
 if(!parts?.length)return '';
 try{return decoder.decode(Buffer.concat(parts)).trim();}catch{return '';}
}

function paddingOnly(bytes,at,deadline){
 for(;at<bytes.length;at+=PADDING.length){
  const end=Math.min(at+PADDING.length,bytes.length);
  if(expired(deadline)||bytes.compare(PADDING,0,end-at,at,end)!==0)return false;
 }
 return true;
}

/* A displayed page starts with command 07 and ends with 0A. Command 09 adds
   one wrapped text fragment. The 40 terminator separates scripts from tables. */
function parse(bytes,{deadline=Infinity}={}){
 const lines=[];
 let page=null,checkAt=0;
 for(let at=0;at+2<=bytes.length;){
  if(at>=checkAt){
   if(expired(deadline))break;
   checkAt=at+PADDING.length;
  }
  const width=bytes[at], opcode=bytes[at+1];
  const next=at+width;
  if(width<2||next>bytes.length)break;
  if(opcode===0x40){
   if(width===3&&bytes[at+2]===0&&paddingOnly(bytes,next,deadline))return {lines,anchors:[]};
   break;
  }
  if(opcode===0x07)page=width===6?[]:null;
  if(opcode===0x09&&page){
   const text=bytes.subarray(at+2,next-1);
   if(width<3||bytes[next-1]!==0||text.some(value=>value<0x20))page=null;
   else page.push(text);
  }
  if(opcode===0x0a){
   const line=width===2?pageText(page):'';
   if(line)lines.push(line);
   page=null;
  }
  at=next;
 }
 return {lines:[],anchors:[]};
}

function probe(file){
 try{
  const archive=header(kit.head(file,HEADER_SIZE),kit.size(file));
  if(!archive)return false;
  const {index,end}=archive;
  const at=firstEntry(kit.readAt(file,index,Math.min(MAX_FIELD,end-index)),archive);
  if(at===null)return false;
  const first=kit.readAt(file,at,Math.min(MAX_FIELD,end-at));
  return !!entryAt(first,0,first.length,index);
 }catch{return false;}
}

function* matchingFiles(dir,deadline=Infinity){
 let count=0;
 for(const name of kit.names(dir)){
  if(expired(deadline))return;
  if(!SCB.test(name))continue;
  const file=path.join(dir,name);
  if(!probe(file))continue;
  yield file;
  if(++count===64)return;
 }
}

const matches=dir=>!matchingFiles(dir).next().done;
function sources(dir,deadline=Infinity){
 if(expired(deadline))return [];
 const files=[...matchingFiles(dir,deadline)];
 // A valid side archive must not replace the scripts of the registered engine.
 return files.length&&!expired(deadline)&&require('./registry.cjs').readersFor(dir).includes('arcg')?files:[];
}

const engine={
 id:'arcg',
 hint:'*.scb (ARCG)',
 archives:()=>[],
 sources,
 scenes(dir,{deadline=Infinity}={}){
  const scenes=[];
  for(const file of sources(dir,deadline)){
   if(expired(deadline))break;
   const size=kit.size(file);
   if(size<HEADER_SIZE||size>MAX_SIZE)continue;
   let bytes;
   try{bytes=kit.readAt(file,0,size);}catch{continue;}
   for(const {name,offset,size:entrySize} of entries(bytes,deadline)){
    if(expired(deadline))return scenes;
    const result=parse(bytes.subarray(offset,offset+entrySize),{deadline});
    if(expired(deadline))return scenes;
    if(result.lines.length)scenes.push({name,parse:()=>result});
   }
  }
  return scenes;
 },
 parse,
};
module.exports={engine,matches};
