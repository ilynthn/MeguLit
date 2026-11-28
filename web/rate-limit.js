// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 (user: 一直「连不上联网服务」, the relay was answering 429): when the relay says 请求太频繁 the page says so,
   with the seconds from Retry-After, and tries again by itself when they are up, instead of the plain offline line.
   busyText(res,locale) → the line, or '' when res is not a rate limit. autoRetry(box,seconds,again) counts down in
   any [data-rate-left] inside box and calls again() once, only while box is still on the page. */
const WORDS={zh:'请求太频繁，{n} 秒后自动重试',ja:'リクエストが多すぎます。{n} 秒後に自動で再試行します',en:'Too many requests, retrying in {n} s'};
/* 2026-11-29 the relay's free daily request quota is spent (Cloudflare error 1027, services/relay-gate.cjs → DAILY_QUOTA):
   it comes back at 00:00 UTC, so the page says when and does not retry by itself */
export const QUOTA_WORDS={zh:'服务器今日额度已满，北京时间 8 点恢复',ja:'サーバーの本日の利用上限に達しました。日本時間 9 時（北京時間 8 時）に回復します',en:'The server’s daily quota is used up. It comes back at 08:00 Beijing time (00:00 UTC)'};
export function isDailyQuota(res){return res?.error==='DAILY_QUOTA'||res?.code==='DAILY_QUOTA'||/DAILY_QUOTA/.test(String(res?.message||''));}
export function quotaText(res,locale){return isDailyQuota(res)?QUOTA_WORDS[locale]||QUOTA_WORDS.zh:'';}
export function isRateLimited(res){return res?.error==='RATE_LIMITED'||/RATE_LIMITED/.test(String(res?.message||''));}
export function retrySeconds(res){const n=Math.ceil(Number(res?.retryAfter));return Number.isFinite(n)&&n>0?Math.min(3600,n):60;}
export function busyText(res,locale){if(isDailyQuota(res))return quotaText(res,locale);if(!isRateLimited(res))return '';return (WORDS[locale]||WORDS.zh).replace('{n}','<span data-rate-left>'+retrySeconds(res)+'</span>');}
export function autoRetry(box,seconds,again){
 let left=Math.max(1,Math.ceil(seconds));const timer=setInterval(()=>{
  if(!box?.isConnected){clearInterval(timer);return;}left-=1;box.querySelectorAll('[data-rate-left]').forEach(el=>{el.textContent=String(Math.max(0,left));});
  if(left<=0){clearInterval(timer);if(document.visibilityState==='hidden')document.addEventListener('visibilitychange',()=>{if(box.isConnected)again();},{once:true});else again();}
 },1000);return ()=>clearInterval(timer);
}
