// 🎈 Balloon Pop: blow to inflate; stop with the top of the balloon in the
// green stripe. Too far and it pops (you get a new one).
Games.balloon = (ctx) => {
  const SECONDS = ctx.seconds;
  const BOTTOM = 70; // % from the top where the string meets the balloon
  const MAX_D = 60; // balloon height (% of stage) at size 1 = popping point
  const n = ctx.players.length;

  const lanes = ctx.players.map((p, i) => {
    const f = ageFactor(p.age);
    const half = 0.06 * f;
    const target = 0.74;
    return {
      p, f, size: 0.15, pops: 0, popTimer: 0, still: 0, locked: false,
      band: [target - half, Math.min(0.95, target + half)],
      left: (i + 0.5) * (100 / n),
    };
  });

  const laneW = Math.min(22, 92 / n);
  const hw = ctx.theme === 'halloween';
  const face = hw ? `<svg class="b-face" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M26 40 L36 26 L46 40Z M54 40 L64 26 L74 40Z" fill="#5a2a00"/>
      <path d="M24 56 Q50 84 76 56 Q50 66 24 56Z" fill="#5a2a00"/></svg>` : '';
  ctx.stage.innerHTML = `<div class="scene ${hw ? 'nightsky' : 'sky'} balloon-scene">
    <div class="cloud c1"></div><div class="cloud c2"></div>
    ${lanes.map((l, i) => `
      <div class="b-lane" id="bl${i}" style="left:${l.left}%;width:${laneW}%">
        <div class="b-danger" style="top:${BOTTOM - MAX_D}%"></div>
        <div class="b-band" style="top:${BOTTOM - l.band[1] * MAX_D}%;height:${(l.band[1] - l.band[0]) * MAX_D}%"></div>
        <div class="b-balloon ${hw ? 'pumpkin-balloon' : ''}" style="--c:${hw ? '#ff8a1c' : critterColor(l.p)}"><i></i>${face}</div>
        <div class="b-string" style="top:${BOTTOM}%"></div>
        <div class="b-burst">POP!</div>
        <div class="b-done">⭐ Perfect!</div>
        <div class="b-critter">${critterSvg(l.p.critter, { cls: 'alive' })}</div>
        <div class="lane-name">${esc(l.p.name)}</div>
      </div>`).join('')}
  </div>`;
  const els = lanes.map((l, i) => {
    const root = ctx.stage.querySelector(`#bl${i}`);
    return { root, balloon: root.querySelector('.b-balloon') };
  });

  const score = (l) => {
    if (l.popTimer > 0) return 0.25;
    const inBand = l.size >= l.band[0] && l.size <= l.band[1];
    if (inBand) return Math.max(0.75, 1 - l.pops * 0.1);
    return Math.min(0.6, (l.size / l.band[0]) * 0.6);
  };
  const finish = () => ctx.report(Object.fromEntries(lanes.map((l) => [l.p.key, score(l)])));
  const clock = gameClock(ctx, SECONDS, finish);

  const stopLoop = gameLoop((dt) => {
    clock.tick();
    lanes.forEach((l, i) => {
      const el = els[i];
      if (l.popTimer > 0) {
        l.popTimer -= dt;
        if (l.popTimer <= 0) { l.size = 0.15; el.root.classList.remove('popped'); }
        return;
      }
      if (l.locked || clock.done) return;
      const e = ctx.effort(l.p.key);
      // Younger kids' balloons fill a little slower, so they're easier to stop.
      l.size += e * (0.3 / Math.sqrt(l.f)) * dt;
      if (l.size >= 1) {
        l.pops++;
        l.popTimer = 1.3;
        el.root.classList.add('popped');
        ctx.sound.play('pop');
        return;
      }
      // Resting in the stripe for 2.5 seconds locks in a perfect score.
      const inBand = l.size >= l.band[0] && l.size <= l.band[1];
      l.still = inBand && e < 0.08 ? l.still + dt : 0;
      if (l.still > 2.5) {
        l.locked = true;
        el.root.classList.add('locked');
        ctx.sound.play('star');
      }
      const d = Math.max(4, l.size * MAX_D);
      el.balloon.style.height = `${d}%`;
      el.balloon.style.top = `${BOTTOM - d}%`;
      el.balloon.classList.toggle('in-band', inBand);
    });
    if (!clock.done && lanes.every((l) => l.locked)) clock.end();
  });

  return { input() {}, update() {}, stop: stopLoop };
};
