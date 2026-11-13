// SPDX-License-Identifier: GPL-3.0-or-later
/* About page · support plate toy. One small canvas beside the QR; a random toy each time the page opens:
   circle — a faint gold magic circle eases toward the pointer, a click bursts crimson sparks (explosion magic);
   coins  — a click drops an Eris coin that bounces and stacks, with a quiet running count;
   kana   — a few kana float in place; the pointer pushes them aside, a click scatters them.
   Cost: draws once at rest; requestAnimationFrame runs only while something is moving and stops itself.
   Reduced motion: a single still frame, no animation. */
export function mountSupportToy(canvas, {pick, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, coinIdle = '点一下，投一枚厄里斯', coinCount = n => `厄里斯 ×${n}`, palette = {}} = {}) {
  const ctx = canvas.getContext('2d');
  const {gold: GOLD = '217,165,74', red: RED = '200,50,60', cream: CREAM = '241,224,210'} = palette;
  const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのまみむめもやゆよらりるれろわをん';
  let W = 0, H = 0, raf = 0, last = 0;
  const pointer = {x: -1e3, y: -1e3, in: false};
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const kick = () => { if (!raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(loop); } };

  /* ── toys: each has draw() and step(dt) → returns true while still moving ── */
  const toys = {
    circle() {
      const c = {x: 0, y: 0, a: 0, sparks: []};
      const ring = (r, n, glyphs) => {
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
        if (!glyphs) return;
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a * (r > 40 ? 1 : -1.6));
        for (let i = 0; i < n; i++) { ctx.rotate(Math.PI * 2 / n); ctx.fillText(glyphs[i % glyphs.length], 0, -r + 7); }
        ctx.restore();
      };
      return {
        reset() { c.x = W * .62; c.y = H * .55; },
        draw() {
          ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${GOLD},.28)`; ctx.fillStyle = `rgba(${GOLD},.34)`;
          ctx.font = '9px serif'; ctx.textAlign = 'center';
          ring(52, 18, 'エクスプロージョン'); ring(36, 0); ring(24, 9, '爆裂魔法');
          ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(-c.a * .5); ctx.beginPath();
          for (let i = 0; i <= 5; i++) { const t = i * 4 * Math.PI / 5 - Math.PI / 2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(t) * 36, Math.sin(t) * 36); }
          ctx.stroke(); ctx.restore();
          for (const s of c.sparks) { ctx.fillStyle = `rgba(${s.gold ? GOLD : RED},${s.life})`; ctx.fillRect(s.x, s.y, s.r, s.r); }
        },
        step(dt) {
          const tx = pointer.in ? pointer.x : W * .62, ty = pointer.in ? pointer.y : H * .55;
          c.x += (tx - c.x) * Math.min(1, dt * 4); c.y += (ty - c.y) * Math.min(1, dt * 4);
          if (pointer.in) c.a += dt * .9;
          c.sparks = c.sparks.filter(s => (s.life -= dt * 1.4) > 0);
          for (const s of c.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt; s.vx *= .97; }
          return pointer.in || c.sparks.length > 0 || Math.hypot(tx - c.x, ty - c.y) > .5;
        },
        click(x, y) { for (let i = 0; i < 46; i++) { const a = rand(0, Math.PI * 2), v = rand(60, 230); c.sparks.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: rand(1.5, 3.5), life: rand(.6, 1), gold: Math.random() < .3}); } }
      };
    },
    coins() {
      let coins = [], count = 0;
      const floor = () => H - 8;
      return {
        reset() {},
        draw() {
          for (const k of coins) {
            ctx.save(); ctx.translate(k.x, k.y); ctx.scale(Math.abs(Math.cos(k.spin)) * .85 + .15, 1);
            ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = `rgba(${GOLD},.85)`; ctx.fill();
            ctx.strokeStyle = 'rgba(90,60,20,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = 'rgba(70,45,15,.85)'; ctx.font = 'bold 8px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('エ', 0, .5);
            ctx.restore();
          }
          ctx.fillStyle = `rgba(${CREAM},.38)`; ctx.font = '12px serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(count ? coinCount(count) : coinIdle, W - 4, 14);
        },
        step(dt) {
          let moving = false;
          for (const k of coins) {
            if (k.rest) continue;
            k.vy += 900 * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.spin += dt * 14;
            const below = coins.filter(o => o !== k && o.rest && Math.abs(o.x - k.x) < 16);
            const top = Math.min(floor(), ...below.map(o => o.y - 7));
            if (k.x < 10 || k.x > W - 10) { k.vx *= -.6; k.x = Math.max(10, Math.min(W - 10, k.x)); }
            if (k.y >= top - 9) { k.y = top - 9; if (Math.abs(k.vy) < 60) { k.rest = true; k.spin = 0; } else { k.vy *= -.38; k.vx *= .7; } }
            moving = moving || !k.rest;
          }
          return moving;
        },
        click(x) { count++; coins.push({x: Math.max(12, Math.min(W - 12, x + rand(-6, 6))), y: -10, vx: rand(-40, 40), vy: 0, spin: 0, rest: false}); if (coins.length > 60) coins.shift(); }
      };
    },
    kana() {
      let ps = [];
      return {
        reset() { const cols = 8, rows = 3, cw = (W - 20) / cols, rh = (H - 16) / rows; ps = Array.from({length: cols * rows}, (_, i) => { const x = 10 + cw * (i % cols + .5) + rand(-cw * .3, cw * .3), y = 10 + rh * (Math.floor(i / cols) + .5) + rand(-rh * .25, rh * .25); return {x, y, hx: x, hy: y, vx: 0, vy: 0, ch: KANA[Math.floor(Math.random() * KANA.length)], s: rand(11, 17), a: rand(.18, .42)}; }); },
        draw() { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (const p of ps) { ctx.font = `${p.s}px serif`; ctx.fillStyle = `rgba(${p.s > 15 ? GOLD : CREAM},${p.a})`; ctx.fillText(p.ch, p.x, p.y); } },
        step(dt) {
          let moving = false;
          for (const p of ps) {
            const dx = p.x - pointer.x, dy = p.y - pointer.y, d = Math.hypot(dx, dy);
            if (pointer.in && d < 46) { const f = (46 - d) / 46 * 900; p.vx += dx / (d || 1) * f * dt; p.vy += dy / (d || 1) * f * dt; }
            p.vx += (p.hx - p.x) * 6 * dt; p.vy += (p.hy - p.y) * 6 * dt; p.vx *= .88; p.vy *= .88;
            p.x += p.vx * dt; p.y += p.vy * dt;
            moving = moving || Math.abs(p.vx) + Math.abs(p.vy) > 1 || Math.hypot(p.x - p.hx, p.y - p.hy) > .5;
          }
          return moving || pointer.in;
        },
        click(x, y) { for (const p of ps) { const a = Math.atan2(p.y - y, p.x - x), v = rand(160, 320); p.vx += Math.cos(a) * v; p.vy += Math.sin(a) * v; } }
      };
    }
  };
  const names = Object.keys(toys);
  const name = names.includes(pick) ? pick : names[Math.floor(Math.random() * names.length)];
  const toy = toys[name]();
  canvas.dataset.toy = name;

  const draw = () => { ctx.clearRect(0, 0, W, H); toy.draw(); };
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const moving = toy.step(dt); draw();
    raf = moving && !document.hidden ? requestAnimationFrame(loop) : 0;
  }
  const at = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointermove', e => { [pointer.x, pointer.y] = at(e); pointer.in = true; kick(); });
  canvas.addEventListener('pointerleave', () => { pointer.in = false; pointer.x = pointer.y = -1e3; kick(); });
  canvas.addEventListener('pointerdown', e => { const [x, y] = at(e); toy.click(x, y); kick(); if (reduce) { toy.step(1); draw(); } });
  const ro = new ResizeObserver(() => { if (!canvas.isConnected) { ro.disconnect(); return; } fit(); toy.reset(); draw(); }); ro.observe(canvas);
  fit(); toy.reset(); draw();
  return name;
}
