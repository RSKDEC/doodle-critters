// 🪶 Feather Float: blowing pushes the feather up, gravity pulls it down.
// Keep it inside the cloud zone as long as possible.
Games.feather = (ctx) => {
  const SECONDS = ctx.seconds;
  const GRACE = 3; // seconds before the cloud zone starts counting
  const n = ctx.players.length;
  const TOP = 8;
  const SPAN = 64; // % of stage height the feather travels

  const lanes = ctx.players.map((p, i) => {
    const f = ageFactor(p.age);
    const mid = 0.58;
    const half = 0.13 * f;
    return { p, f, y: 0.05, inZone: 0, zone: [mid - half, Math.min(0.95, mid + half)], left: (i + 0.5) * (100 / n), phase: Math.random() * 6 };
  });
  const laneW = Math.min(22, 92 / n);
  const yPct = (y) => TOP + (1 - y) * SPAN;

  const hw = ctx.theme === 'halloween';
  ctx.stage.innerHTML = `<div class="scene ${hw ? 'nightsky' : 'sky'} feather-scene">
    ${lanes.map((l, i) => `
      <div class="f-lane" id="fl${i}" style="left:${l.left}%;width:${laneW}%">
        <div class="f-zone" style="top:${yPct(l.zone[1])}%;height:${(l.zone[1] - l.zone[0]) * SPAN}%"></div>
        <div class="f-feather ${hw ? 'is-ghost' : ''}">${hw ? ghostSvg() : '🪶'}</div>
        <div class="f-meter"><i></i></div>
        <div class="f-critter">${critterSvg(l.p.critter, { cls: 'alive' })}</div>
        <div class="lane-name">${esc(l.p.name)}</div>
      </div>`).join('')}
  </div>`;
  const els = lanes.map((l, i) => {
    const root = ctx.stage.querySelector(`#fl${i}`);
    return { root, feather: root.querySelector('.f-feather'), meter: root.querySelector('.f-meter i') };
  });

  const counted = () => Math.max(1, SECONDS - GRACE);
  const finish = () => ctx.report(Object.fromEntries(lanes.map((l) => [l.p.key, Math.min(1, (l.inZone / counted()) * 1.15)])));
  const clock = gameClock(ctx, SECONDS, finish);

  let t = 0;
  const stopLoop = gameLoop((dt) => {
    clock.tick();
    if (clock.done) return;
    t += dt;
    lanes.forEach((l, i) => {
      const e = ctx.effort(l.p.key);
      // A steady breath holds a steady height: softly = low, harder = high,
      // stop = it drifts down. Younger kids reach the zone with a softer breath.
      const target = Math.min(1, e * 1.6 * Math.sqrt(l.f));
      const rate = target > l.y ? 1.6 : 0.9; // rises a bit faster than it sinks
      l.y += (target - l.y) * (1 - Math.exp(-rate * dt));
      l.y = Math.max(0, Math.min(1, l.y));
      const inZone = l.y >= l.zone[0] && l.y <= l.zone[1];
      if (inZone && clock.elapsed() > GRACE) l.inZone += dt;
      const sway = Math.sin(t * 2 + l.phase) * 18;
      const el = els[i];
      el.feather.style.top = `${yPct(l.y)}%`;
      el.feather.style.transform = `translate(-50%, -50%) rotate(${sway}deg)`;
      el.root.classList.toggle('in-zone', inZone);
      el.meter.style.height = `${Math.min(100, (l.inZone / counted()) * 115)}%`;
    });
  });

  return { input() {}, update() {}, stop: stopLoop };
};
