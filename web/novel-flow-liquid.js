// SPDX-License-Identifier: GPL-3.0-or-later
const clamp = value => Math.max(0, Math.min(1, value));

export function pourIntoSlot(host, origin, bottom, signal, followSlot) {
  const canvas = document.createElement('canvas');
  canvas.className = 'nv-flow-liquid';
  canvas.setAttribute('aria-hidden', 'true');
  const left = Math.floor(Math.min(origin.x, 0) - 59);
  const top = Math.floor(Math.min(origin.y, bottom) - 35);
  const width = Math.ceil(Math.max(origin.x, 0) - left + 67);
  const height = Math.ceil(Math.max(origin.y, bottom) - top + 22);
  const density = Math.min(devicePixelRatio, 2);
  canvas.width = Math.ceil(width * density);
  canvas.height = Math.ceil(height * density);
  Object.assign(canvas.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve();
  context.scale(density, density);
  host.append(canvas);

  const sx = origin.x - left, sy = origin.y - top;
  const ex = -left, ey = bottom - top;
  const drop = ey - sy;
  const bend = origin.x > 8 ? -1 : 1;
  const curve = t => {
    const u = 1 - t;
    return {
      x: u ** 3 * sx + 3 * u ** 2 * t * (sx + bend * 32)
        + 3 * u * t ** 2 * (ex - bend * 18) + t ** 3 * ex,
      y: u ** 3 * sy + 3 * u ** 2 * t * (sy + drop * .23)
        + 3 * u * t ** 2 * (ey - drop * .18) + t ** 3 * ey
    };
  };
  const water = context.createLinearGradient(sx - 17, sy, ex + 14, ey);
  water.addColorStop(0, '#d3e9eaed');
  water.addColorStop(.42, '#9fc8d2e8');
  water.addColorStop(.76, '#689eb4db');
  water.addColorStop(1, '#a9cbd1cb');

  function blob(x, y, rx, ry, time, alpha = 1) {
    if (rx < .15 || ry < .15) return;
    context.globalAlpha = alpha;
    context.beginPath();
    for (let i = 0; i <= 36; i++) {
      const angle = i / 36 * Math.PI * 2;
      const wobble = 1 + .075 * Math.sin(angle * 3 + time * .029) + .045 * Math.cos(angle * 2 - time * .018);
      const point = [x + Math.cos(angle) * rx * wobble, y + Math.sin(angle) * ry * wobble];
      if (i) context.lineTo(...point);
      else context.moveTo(...point);
    }
    context.closePath();
    const glass = context.createRadialGradient(x - rx * .25, y - ry * .37, 1, x, y, Math.max(rx, ry) * 1.09);
    glass.addColorStop(0, '#e0f2f5ee');
    glass.addColorStop(.55, '#a9ced8ee');
    glass.addColorStop(.85, '#6494a9e8');
    glass.addColorStop(1, '#99bdcbcf');
    context.fillStyle = glass;
    context.fill();
    context.globalAlpha = 1;
  }

  function ribbon(tail, head, time, strength) {
    const near = [], far = [], glint = [];
    for (let i = 0; i <= 28; i++) {
      const fraction = i / 28;
      const t = tail + (head - tail) * fraction;
      const { x, y } = curve(t);
      const ahead = curve(Math.min(1, t + .007));
      const behind = curve(Math.max(0, t - .007));
      const length = Math.hypot(ahead.x - behind.x, ahead.y - behind.y) || 1;
      const nx = (ahead.y - behind.y) / length, ny = (behind.x - ahead.x) / length;
      const edge = Math.min(1, fraction * 8 + .16, (1 - fraction) * 8 + .15);
      const radius = (2.5 + (1 - t) * 5 + Math.sin(t * 28 - time * .048) * 1.15) * edge * strength;
      near.push([x + nx * radius, y + ny * radius]);
      far.push([x - nx * radius, y - ny * radius]);
      glint.push([x + nx * radius * .56, y + ny * radius * .56]);
    }
    context.beginPath();
    context.moveTo(...near[0]);
    for (const point of near.slice(1)) context.lineTo(...point);
    for (const point of far.reverse()) context.lineTo(...point);
    context.closePath();
    context.fillStyle = water;
    context.fill();
    context.beginPath();
    context.moveTo(...glint[1]);
    for (const point of glint.slice(2, -1)) context.lineTo(...point);
    context.lineWidth = 1;
    context.strokeStyle = '#f7ffffa8';
    context.stroke();
  }

  return new Promise(resolve => {
    const start = performance.now();
    let frame;
    function finish() {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', finish);
      canvas.remove();
      resolve();
    }
    function draw(now) {
      const time = now - start;
      if (time >= 248 || signal.aborted) { finish(); return; }
      followSlot();
      context.clearRect(0, 0, width, height);
      const p = clamp((time - 32) / 216);
      const head = clamp(p ** 1.23 * 1.38);
      const tail = clamp((p - .26) / .74) ** 1.6;
      if (head > tail + .007) ribbon(tail, head, time, 1 - p * .31);
      const swell = Math.sin(Math.PI * .5 * clamp(time / 37));
      const mass = swell * (1 - clamp((time - 44) / 85));
      const bead = curve(tail * .9);
      blob(bead.x, bead.y, 17 * mass, (14 + 8 * p) * mass, time);
      if (head > .1 && p < .91) {
        const tip = curve(head);
        blob(tip.x, tip.y, 3.2 * (1 - p), 5.1 * (1 - p), time);
        for (let i = 0; i < 3; i++) {
          const t = head - .11 - i * .13;
          if (t <= tail || t >= .98) continue;
          const spray = curve(t);
          const side = (i % 2 ? -1 : 1) * (5 + (head - t) * 10);
          blob(spray.x + side, spray.y - 2, 1.35 - i * .19, 2.65 - i * .36, time + i * 11, .7);
        }
      }
      frame = requestAnimationFrame(draw);
    }
    signal.addEventListener('abort', finish, { once: true });
    frame = requestAnimationFrame(draw);
  });
}
