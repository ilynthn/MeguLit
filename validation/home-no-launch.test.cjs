/* 2026-11-13 hard rule from the user (禁止): no 「继续游玩」 / play button on the home page's cards — the field card, the hand cards and any hover state
   stay artwork and title only; launching lives on the detail page */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const WEB=path.join(__dirname,'..','web'),read=f=>fs.readFileSync(path.join(WEB,f),'utf8');

test('home cards carry no launch button',()=>{
 const tv=read('home-tv.js'),hand=read('home-hand.js'),css=read('home-tv.css');
 for(const [name,src] of [['home-tv.js',tv],['home-hand.js',hand]]){
  assert.ok(!/data-act="play"/.test(src),name+': no play action on a card');
  assert.ok(!/tv-cover-play|tv-play\b|tv-hc-play/.test(src),name+': no play button class');
  assert.ok(!/onLaunch\(/.test(src),name+': the home cards never launch a game');
  assert.ok(!/\$\{w\.play\}/.test(src),name+': the 继续游玩 label is not rendered');}
 assert.ok(!/tv-cover-play|\.tv-play\b/.test(css),'no styles for a cover launch button (including hover reveals)');
 const cover=tv.slice(tv.indexOf('<div class="tv-cover tv-card">'),tv.indexOf('</div></div></div>',tv.indexOf('<div class="tv-cover tv-card">')));
 assert.ok(cover.length>0&&!/<button/.test(cover),'the field card holds no button at all');
});
