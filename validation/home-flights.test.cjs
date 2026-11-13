/* 2026-11-13 (user: "我要的十种不同手牌和在场牌切换的不同…动画呢", "最后衔接会卡") the ten hand/field flights each have their own signature and length,
   end exactly on the field pose, and hand off to the real card with a short cross-fade */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('the ten flights each have a signature that tells them apart',async()=>{
 const h=await import('../web/home-hand.js'),A={x:900,y:700,r:12,s:.3,rx:0,ry:0,o:1},B={x:1000,y:300,r:-4,s:1,rx:0,ry:0,o:1};
 const sig=k=>{const f=h.flightFrames(k,A,B,60),dist=Math.hypot(B.x-A.x,B.y-A.y),line=p=>((p.x-A.x)*(B.y-A.y)-(p.y-A.y)*(B.x-A.x))/dist;
  return {arc:Math.max(...f.map(p=>Math.abs(line(p)))),spinR:Math.max(...f.map(p=>Math.abs(p.r-B.r))),ry:Math.max(...f.map(p=>Math.abs(p.ry))),rx:Math.max(...f.map(p=>Math.abs(p.rx))),
   back:Math.max(...f.map(p=>((A.x-p.x)*(B.x-A.x)+(A.y-p.y)*(B.y-A.y))/dist)),up:Math.max(...f.map(p=>A.y-p.y))};};
 const s=Object.fromEntries(h.HAND_VARIANTS.map(k=>[k,sig(k)]));
 assert.ok(s.toss.arc>150,'toss: high arc');assert.ok(s.flip.ry>=180,'flip: turns over');assert.ok(s.spin.spinR>=300,'spin: a full turn');
 assert.ok(s.edge.ry>70,'edge: goes edge-on');assert.ok(s.slap.rx>15,'slap: slams down');assert.ok(s.pull.back>40,'pull: winds back first');
 assert.ok(s.swing.spinR>20&&s.swing.ry===0,'swing: pendulum');assert.ok(s.dive.rx>10,'dive: tips into the table');
 for(const k of h.HAND_VARIANTS)assert.ok(h.FLIGHT_MS[k]>=500&&h.FLIGHT_MS[k]<=1100,k+' has its own length');
 assert.ok(new Set(Object.values(h.FLIGHT_MS)).size>=6,'lengths differ');
});

test('landing: no fade, the real card replaces the flying one in the same task, on an untilted scene',()=>{
 const W=path.join(__dirname,'..','web'),js=fs.readFileSync(path.join(W,'home-hand.js'),'utf8'),depth=fs.readFileSync(path.join(W,'home-depth.js'),'utf8'),
  tv=fs.readFileSync(path.join(W,'home-tv.js'),'utf8'),css=fs.readFileSync(path.join(W,'home-tv.css'),'utf8');
 assert.ok(js.includes("if(q>=1)return {x:B.x,y:B.y"),'q=1 is exactly the target');
 assert.ok(js.includes('s=r.width/(W*Math.cos(t)+H*Math.sin(t))'),'landing scale from the rotated face box');
 assert.ok(!js.includes('{opacity:1},{opacity:0}'),'(user: 过渡到展示的怎么是渐变过渡的) the flying card never fades out');
 assert.ok(js.includes("done?.();f.anims.forEach(a=>a.cancel());f.el.remove();"),'swap and removal happen in one task');
 assert.ok(js.includes('flat(coverPose)')&&js.includes('flat(()=>slotPose(old.id,W))'),'landing and return slots measured on the untilted scene');
 assert.ok(depth.includes('function hold(on)')&&depth.includes('function neutral(fn)'),'depth can settle flat and measure flat');
 assert.ok(tv.includes('onBusy:on=>live?.depth?.hold(on)')&&js.includes('opts.onBusy?.(true)')&&js.includes('opts.onBusy?.(false)'),'the scene stays flat while any card flies, including a draw that sends the field card home');
 assert.ok(!/\.tv-canvas\{[^}]*transition/.test(css),'no CSS transition on the tilted canvas (it made the real card lag behind the measured pose)');
});

test('random draw is tied to the hand; the field card stays centred over the fan',()=>{
 const W=path.join(__dirname,'..','web'),tv=fs.readFileSync(path.join(W,'home-tv.js'),'utf8'),hand=fs.readFileSync(path.join(W,'home-hand.js'),'utf8');
 assert.ok(tv.includes('if(pool.length>1)draw(randomGame());'),'double-click goes through draw()');
 assert.ok(tv.includes('if(list.includes(g)){hand.play(g.id);return;}'),'a drawn game that is in the hand is played out of it with a flight');
 assert.ok(tv.includes("hand.stow(prev.id,g.id))$('.tv-cover').dataset.stow='1'"),'otherwise the field card flies back into its slot');
 assert.ok(tv.includes("if(!stowed)outLayer(cover).appendChild(old);"),'a stowed field card is not also thrown off the table');
 assert.ok(hand.includes('function stow(oldId,newId)')&&hand.includes('function extent()'),'hand exposes stow and its fan extent');
 assert.ok(tv.includes('function placeCover()')&&tv.includes('aim=fan.cx-Math.min(48,rr.width*.025)'),'(user: 展示的卡要一直在手牌上方居中, 往左边移动一点点) field card over the fan, a touch left');
 assert.ok(tv.includes('for(let i=0;i<4;i++){const r=hand.restRect()')&&hand.includes('function restRect()'),'(user: 位置有大问题) measured on the resting box, never on the card mid draw animation');
 const css=fs.readFileSync(path.join(W,'home-tv.css'),'utf8');assert.ok(!/^\.tv-hc\{[^}]*opacity \.2s/m.test(css),'(user: 收回的封面会闪烁) hand cards appear without an opacity fade');
 assert.ok(hand.includes('if(st.flights.size&&el)return;'),'the fan holds still while a card flies to its slot');
 assert.ok(/onResize=\(\)=>\{if\(live&&live\.root===root\)\{fitLeft\(root\);hand\.relayout\(\);placeCover\(\);/.test(tv),'re-centred on resize');
});

test('a field card from outside the hand is thrown off, the card never leaves the top, the deck follows it',()=>{
 const W=path.join(__dirname,'..','web'),tv=fs.readFileSync(path.join(W,'home-tv.js'),'utf8'),hand=fs.readFileSync(path.join(W,'home-hand.js'),'utf8');
 assert.ok(hand.includes("const gone=!old?opts.field?.():null")&&hand.includes("fly('__gone',gone,fromGone,"),'(user: 还是有问题) a drawn field card is flown off when a hand card is played, not removed');
 assert.ok(tv.includes('field:()=>shown,'),'the hand knows the field card');
 assert.ok(tv.includes('if(r0.height>room&&room>80)c.style.width=')&&tv.includes('under=minTop-(r2.top-rr.top)'),'a short window gets a smaller card instead of one pushed off the top');
 assert.ok(tv.includes("pile.style.left=c.style.left?(c.offsetLeft-rr.width*.06)+'px':''"),'the deck a draw is dealt from moves with the card');
});

test('a hovered (lifted) hand card takes off from where it is drawn, not from its resting slot',()=>{
 const hand=fs.readFileSync(path.join(__dirname,'..','web','home-hand.js'),'utf8');
 assert.ok(hand.includes('function cardPose(el,W)')&&hand.includes('new DOMMatrixReadOnly(getComputedStyle(el).transform)'),'pose read from the card as drawn');
 assert.ok(hand.includes("?cardPose(pickEl,W):slotPose(id,W))"),'(user: 手牌就会有个强制被改变位置的bug) picked card starts at its drawn pose');
});

test('the fan moves with Web Animations, so a busy moment never skips a re-spacing',()=>{
 const W=path.join(__dirname,'..','web'),hand=fs.readFileSync(path.join(W,'home-hand.js'),'utf8'),css=fs.readFileSync(path.join(W,'home-tv.css'),'utf8');
 assert.ok(hand.includes("el._mv=el.animate([{transform:a},{transform:to}],{duration:420,easing:EASE})"),'(user: 手牌就会有个强制被改变位置的bug) moves are animations that start when drawn');
 assert.ok(!/^\.tv-hc\{[^}]*transition:transform/m.test(css),'no CSS transform transition on hand cards (it was timed from the style change and skipped ahead after a busy frame)');
});
