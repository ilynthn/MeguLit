const test=require('node:test'),assert=require('node:assert/strict');
const rgba=(w,h,f)=>{const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const [r,g,b]=f(x,y),i=(y*w+x)*4;d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255;}return d;};

test('a plain colour backdrop with a small icon counts as flat, a real picture does not',async()=>{
 const {isFlat}=await import('../web/home-depth.js');
 assert.equal(isFlat(rgba(24,24,()=>[63,174,90])),true);
 assert.equal(isFlat(rgba(24,24,(x,y)=>x>9&&x<14&&y>8&&y<16?[255,255,255]:[63,174,90])),true);
 assert.equal(isFlat(rgba(24,24,(x,y)=>[(x*37+y*11)%256,(y*53)%256,(x*y*7)%256])),false);
});

test('flat news pictures are marked and never chosen for the home thumbnails',async()=>{
 const {markFlat}=await import('../web/home-depth.js');
 const v={news:{items:[{title:'a',image:'data:image/png;flat'},{title:'b',image:'data:image/png;photo'},{title:'c'}]}};
 await markFlat(v,async src=>src.endsWith('flat'));
 assert.deepEqual(v.news.items.map(x=>x.flat),[true,false,undefined]);
 assert.deepEqual(v.news.items.filter(x=>x.image&&!x.flat).map(x=>x.title),['b']);
});

test('the daily block is cached: coming back paints from memory and a fresh copy is not fetched again',async()=>{
 const m=await import('../web/home-depth.js');m.resetHomeCache();
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 assert.equal(m.cachedDaily(storage),null);
 const v={news:{items:[{title:'t',link:'l',image:'data:image/png;x',flat:false}]},words:{words:[]}};
 m.rememberDaily(v,storage);assert.equal(m.dailyIsFresh(),true);assert.equal(m.cachedDaily(storage).news.items[0].title,'t');
 assert.equal(m.dailySignature(m.cachedDaily(storage)),m.dailySignature(v));
 m.resetHomeCache();assert.equal(m.cachedDaily(storage).news.items[0].title,'t','first visit of a session reads localStorage');
 assert.equal(m.dailyIsFresh(),false,'a stored copy is shown at once but still refreshed quietly');
 assert.notEqual(m.dailySignature({news:{items:[{title:'u'}]}}),m.dailySignature(v));
});

test('hand of cards: arc layout, hover lift and spread, flights end where they should, variants never repeat',async()=>{
 const h=await import('../web/home-hand.js');
 const base=h.handLayout(7,{W:900,H:280,cw:90}),hov=h.handLayout(7,{W:900,H:280,cw:90,hover:3});
 assert.equal(base.length,7);assert.ok(base[0].a<0&&base[6].a>0,'cards lean along the arc');assert.ok(base[3].y<base[0].y&&base[3].y<base[6].y,'the arc rises in the middle');
 assert.ok(hov[3].y<base[3].y&&hov[3].s>1.2&&hov[3].z>hov[2].z,'hovered card lifts on top');assert.ok(hov[2].x<base[2].x&&hov[4].x>base[4].x,'neighbours give way');
 const A={x:900,y:700,r:12,s:.3,rx:0,ry:0,o:1},B={x:1000,y:300,r:-4,s:1,rx:0,ry:0,o:1};
 for(const k of h.HAND_VARIANTS){const f=h.flightFrames(k,A,B),end=f.at(-1);assert.ok(Math.abs(f[0].x-A.x)<1&&Math.abs(f[0].y-A.y)<1,k+' starts at the slot');
  assert.ok(end.x===B.x&&end.y===B.y&&end.s===B.s&&end.rx===0&&(end.r-B.r)%360===0&&end.ry%360===0,k+' ends exactly on the field pose (clean hand-off)');assert.ok(f.every(p=>p.s<1.12),k+' never balloons');}
 let last=null;for(let i=0;i<200;i++){const v=h.pickVariant(last);assert.notEqual(v,last);last=v;}
 assert.equal(h.HAND_VARIANTS.length,10);
});
