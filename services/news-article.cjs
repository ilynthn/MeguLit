// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E415 article text for the 日报 reader: the body paragraphs of a news page, without menus, ads, scripts or images.
   Shared by the app (services/daily.cjs, fetching on this PC) and the relay (relay/src/daily.js, only for sources the
   maintainer has permission to cache). No DOM: each site's body is cut out between known markers, then <br>, </p>,
   headings and list items become paragraph breaks and every tag is dropped. */
const SITES=[
 {host:/(^|\.)4gamer\.net$/,start:/↓本文↓/,end:/↑本文↑/},
 {host:/(^|\.)denfaminicogamer\.jp$/,start:/id="articleBody"/,end:/class="(?:inner-related-article|contentbtn-box|dfj-share)|id="articleFooter"|<footer/},
 {host:/(^|\.)moepedia\.net$/,start:/class="post-body"/,end:/class="post-share"/}
];
const MAX_PARAS=120,MAX_CHARS=20000;
const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',mdash:'—',ndash:'–',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',middot:'·',times:'×',yen:'¥',copy:'©',reg:'®',trade:'™'};
const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>{if(e[0]==='#'){const n=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):Number(e.slice(1));return n>0&&n<0x110000?String.fromCodePoint(n):'';}return ENT[e.toLowerCase()]??m;});
function region(html,host){
 const site=SITES.find(s=>s.host.test(host));
 if(site){const m=site.start.exec(html);if(m){/* start after the tag (or comment) holding the marker, end before the tag holding the end marker */
  const close=html.indexOf('>',m.index+m[0].length),rest=html.slice(close>=0?close+1:m.index+m[0].length),b=rest.search(site.end);
  if(b<0)return rest.slice(0,60000);const cut=rest.lastIndexOf('<',b);return rest.slice(0,cut>=0?cut:b);}}
 const art=html.match(/<article[\s\S]*?<\/article>/i);return art?art[0]:'';
}
function paragraphs(fragment){
 const text=fragment
  .replace(/<(script|style|noscript|iframe|table|figure|svg|form|button|select)\b[\s\S]*?<\/\1>/gi,' ')
  .replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(rt|rp)(?:\s[^>]*)?>[^<]*(?:<\/\1\s*>|(?=<(?:rt|rp|rb|\/ruby)\b))/gi,'')
  .replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|h[1-6]|li|blockquote|dd|dt)>/gi,'\n').replace(/<(h[1-6])[^>]*>/gi,'\n')
  .replace(/<[^>]+>/g,'');
 const out=[];let size=0;
 for(const raw of decode(decode(text)).split(/\n+/)){
  const line=raw.replace(/[ \t ]+/g,' ').trim();
  if(line.length<2||/^(?:https?:\/\/|pic\.twitter\.com\/)\S+$/i.test(line)||/^(Share|Tweet|シェア|ツイート|関連記事|この記事を|\[…\])$/i.test(line))continue;
  if(size+line.length>MAX_CHARS||out.length>=MAX_PARAS)break;out.push(line);size+=line.length;
 }
 return out;
}
function extract(html,url){
 let host='';try{host=new URL(url).hostname;}catch{}
 const title=decode((String(html).match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)||String(html).match(/<title>([^<]*)<\/title>/i)||[])[1]||'').trim().slice(0,200);
 return {title,paragraphs:paragraphs(region(String(html||''),host))};
}
module.exports={extract,paragraphs,region,SITES,MAX_PARAS,MAX_CHARS};
