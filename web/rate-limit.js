// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 (user: 一直「连不上联网服务」, the relay was answering 429): when the relay says 请求太频繁 the page says so,
   with the seconds from Retry-After, and tries again by itself when they are up, instead of the plain offline line.
   busyText(res,locale) → the line, or '' when res is not a rate limit. autoRetry(box,seconds,again) counts down in
   any [data-rate-left] inside box and calls again() once, only while box is still on the page. */
const WORDS={zh:'请求太频繁，{n} 秒后自动重试',ja:'リクエストが多すぎます。{n} 秒後に自動で再試行します',en:'Too many requests, retrying in {n} s'};
export function isRateLimited(res){return res?.error==='RATE_LIMITED'||/RATE_LIMITED/.test(String(res?.message||''));}
export function retrySeconds(res){const n=Math.ceil(Number(res?.retryAfter));return Number.isFinite(n)&&n>0?Math.min(3600,n):60;}
export function busyText(res,locale){if(!isRateLimited(res))return '';return (WORDS[locale]||WORDS.zh).replace('{n}','<span data-rate-left>'+retrySeconds(res)+'</span>');}
export function autoRetry(box,seconds,again){
 let left=Math.max(1,Math.ceil(seconds));const timer=setInterval(()=>{
  if(!box?.isConnected){clearInterval(timer);return;}left-=1;box.querySelectorAll('[data-rate-left]').forEach(el=>{el.textContent=String(Math.max(0,left));});
  if(left<=0){clearInterval(timer);if(document.visibilityState==='hidden')document.addEventListener('visibilitychange',()=>{if(box.isConnected)again();},{once:true});else again();}
 },1000);return ()=>clearInterval(timer);
}
