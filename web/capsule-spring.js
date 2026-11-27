// The capsule stretches through the first overshoot and settles at its layout position.
export function capsuleSpringFrames(before, after, { blur = 0 } = {}) {
  const dx = before.left + before.width / 2 - after.left - after.width / 2;
  const dy = before.top + before.height / 2 - after.top - after.height / 2;
  const sx = before.width / Math.max(1, after.width);
  const sy = before.height / Math.max(1, after.height);
  const moving = Math.hypot(dx, dy) > 1;
  const spring = t => 1 - Math.exp(-6 * t) * (Math.cos(8 * t) + .75 * Math.sin(8 * t));
  const end = spring(1);
  return Array.from({ length: 81 }, (_, i) => {
    const t = i / 80;
    const p = i === 80 ? 1 : spring(t * t * (3 - 2 * t)) / end;
    const strain = i === 80 ? 0 : .05 * Math.exp(-3 * t) * Math.sin(4 * Math.PI * t);
    const key = {
      offset: t,
      translate: `${dx * (1 - p)}px ${dy * (1 - p) + (moving ? 0 : strain * 100)}px`,
      scale: `${(1 + (sx - 1) * (1 - p)) * (1 + strain)} ${(1 + (sy - 1) * (1 - p)) * (1 - 1.4 * strain)}`
    };
    if (blur && moving) key.filter = `blur(${i === 80 ? 0 : blur * Math.sin(Math.PI * t) ** 3 * (1 - t)}px)`;
    return key;
  });
}
