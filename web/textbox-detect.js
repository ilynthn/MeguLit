/* 2026-11-13 (user: "以后只要有对话框 除非用户主动截图 否则不要拿来当卡牌") fallback check for automatically captured pictures: a game
   dialogue box shows as a full-width band in the lower part of the frame with a straight top edge, an even backdrop and
   small high-contrast text strokes inside. Pictures that look like that are never used as cards. Works on a small RGBA sample. */
const luma=(d,i)=>.299*d[i]+.587*d[i+1]+.114*d[i+2];
export function hasTextBox(data,w,h){if(!data||w<16||h<16)return false;const L=(x,y)=>luma(data,(y*w+x)*4);
 /* 1. a straight horizontal edge across most of the width somewhere in 50-85% of the height */
 let edgeRow=-1,best=0;for(let y=Math.floor(h*.5);y<Math.floor(h*.85);y++){let on=0;for(let x=0;x<w;x++)if(Math.abs(L(x,y+1)-L(x,y-1))>18)on++;const share=on/w;if(share>best){best=share;edgeRow=y;}}
 if(best<.72)return false;
 /* 2. below it: an even backdrop (most pixels near the band's median) with some strong text strokes */
 const y0=edgeRow+2,y1=Math.min(h-1,edgeRow+Math.max(4,Math.floor(h*.22)));if(y1-y0<3)return false;const vals=[];
 for(let y=y0;y<y1;y++)for(let x=1;x<w-1;x++)vals.push(L(x,y));const sorted=[...vals].sort((a,b)=>a-b),med=sorted[sorted.length>>1];
 const even=vals.filter(v=>Math.abs(v-med)<22).length/vals.length,strokes=vals.filter(v=>Math.abs(v-med)>70).length/vals.length;
 return even>.55&&strokes>.02&&strokes<.4;}
export function imageHasTextBox(img,{canvas=()=>document.createElement('canvas')}={}){try{const w=96,h=Math.max(16,Math.round(96*(img.naturalHeight||4)/(img.naturalWidth||3))),c=canvas();
 c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);return hasTextBox(x.getImageData(0,0,w,h).data,w,h);}catch{return false;}}
