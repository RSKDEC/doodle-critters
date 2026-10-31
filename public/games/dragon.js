// 🐉 Shh! The Dragon: noise moves your critter toward the castle. When the
// dragon falls asleep, go silent — anyone loud gets puffed backwards.
Games.dragon = (ctx) => {
  const SECONDS = ctx.seconds;
  const START = 6; // % from the left
  const FINISH = 74;
  const n = ctx.players.length;
  const laneH = Math.min(16, 50 / n);

  const racers = ctx.players.map((p, i) => ({
    p, f: ageFactor(p.age), x: 0, noisy: 0, stun: 0, place: 0, top: 47 + i * laneH,
  }));

  const hw = ctx.theme === 'halloween';
  ctx.stage.innerHTML = `<div class="scene meadow dragon-scene ${hw ? 'dusk' : ''}" data-state="awake">
    <div class="sun"></div><div class="cloud c1"></div><div class="cloud c2"></div>
    <div class="night"></div>
    <div class="castle">🏰</div>
    <div class="hill"></div>
    ${dragonSvg(hw)}
    ${hw ? `<div class="track-pumpkins">${[0, 1, 2, 1].map((f) => pumpkinSvg('', f)).join('')}</div>` : ''}
    <div class="zzz"><span>Z</span><span>z</span><span>z</span></div>
    <div class="d-banner"></div>
    <div class="finish-line" style="left:${FINISH + 6}%"></div>
    ${racers.map((r, i) => `
      <div class="d-lane" style="top:${r.top}%;height:${laneH}%">
        <div class="d-racer" id="dr${i}">
          ${critterSvg(r.p.critter, { cls: 'alive' })}
          <div class="puff">💨</div>
          <div class="lane-name">${esc(r.p.name)}</div>
        </div>
      </div>`).join('')}
  </div>`;
  const scene = ctx.stage.querySelector('.dragon-scene');
  const banner = scene.querySelector('.d-banner');
  const els = racers.map((r, i) => ctx.stage.querySelector(`#dr${i}`));

  // Dragon moods: awake (make noise!) -> drowsy (warning) -> asleep (silence!).
  let mood = 'awake';
  let moodLeft = 3.5;
  let grace = 0; // nobody can be caught right after a roar or as it dozes off
  let finished = 0;

  const setMood = (m) => {
    mood = m;
    scene.dataset.state = m;
    if (m === 'awake') {
      moodLeft = 3 + Math.random() * 3;
      banner.textContent = '📣 Make noise to run!';
      ctx.sound.musicLevel(0.06);
      ctx.sound.play('boing');
    } else if (m === 'drowsy') {
      moodLeft = 1.4;
      banner.textContent = '🥱 The dragon is getting sleepy…';
      ctx.sound.play('yawn');
    } else {
      moodLeft = 2.6 + Math.random() * 1.8;
      grace = 0.6;
      banner.textContent = '🤫 SHHH! Freeze!';
      // Total quiet on the TV too, so phones don't hear the music.
      ctx.sound.musicLevel(0);
    }
  };
  setMood('awake');

  const finish = () => {
    ctx.sound.musicLevel(0.18);
    ctx.report(Object.fromEntries(racers.map((r) => [r.p.key,
      r.place ? Math.max(0.75, 1 - (r.place - 1) * 0.08) : Math.min(0.7, r.x * 0.75)])));
  };
  const clock = gameClock(ctx, SECONDS, finish);

  const stopLoop = gameLoop((dt) => {
    clock.tick();
    if (clock.done) return;
    moodLeft -= dt;
    grace = Math.max(0, grace - dt);
    if (moodLeft <= 0) setMood(mood === 'awake' ? 'drowsy' : mood === 'drowsy' ? 'asleep' : 'awake');

    racers.forEach((r, i) => {
      const el = els[i];
      if (r.place) return;
      r.stun = Math.max(0, r.stun - dt);
      const e = ctx.effort(r.p.key);
      if (mood === 'asleep') {
        // Sustained noise while it sleeps gets you caught. Little kids get more slack.
        const limit = 0.3 * Math.sqrt(r.f);
        r.noisy = e > limit && grace <= 0 ? r.noisy + dt : 0;
        if (r.noisy > 0.3) {
          r.noisy = 0;
          r.x = Math.max(0, r.x - 0.16);
          r.stun = 1.2;
          grace = 1.0;
          el.classList.remove('caught');
          void el.offsetWidth;
          el.classList.add('caught');
          scene.classList.add('peek');
          setTimeout(() => scene.classList.remove('peek'), 900);
          ctx.sound.play('puff');
        }
      } else if (r.stun <= 0) {
        r.x = Math.min(1, r.x + e * 0.085 * Math.sqrt(r.f) * dt * 1.6);
        if (r.x >= 1) {
          r.place = ++finished;
          el.classList.add('home');
          ctx.sound.play('cheer');
        }
      }
      el.style.left = `${START + r.x * (FINISH - START)}%`;
      el.classList.toggle('running', mood !== 'asleep' && e > 0.08 && r.stun <= 0);
    });
    if (racers.every((r) => r.place)) clock.end();
  });

  return {
    input() {},
    update() {},
    stop() { stopLoop(); ctx.sound.musicLevel(0.18); },
  };
};

// An original chubby green dragon napping on the hill. CSS swaps its eyes
// open/closed using the scene's data-state.
function dragonSvg(witchHat = false) {
  const hat = witchHat ? `<g transform="translate(116 84) rotate(-14) scale(1.05)">${COSTUMES[0].svg}</g>` : '';
  return `<svg class="dragon" viewBox="0 0 400 300" aria-hidden="true">
    <path d="M300 210 Q370 200 380 150 Q385 120 360 118 Q372 140 350 160 Q320 185 290 190Z" fill="#3faa5a" stroke="#1f5a2f" stroke-width="6" stroke-linejoin="round"/>
    <path d="M150 120 L120 50 L190 100Z M200 105 L215 35 L250 108Z" fill="#7fd08f" stroke="#1f5a2f" stroke-width="6" stroke-linejoin="round" class="wings"/>
    <ellipse cx="220" cy="190" rx="120" ry="80" fill="#4cbb66" stroke="#1f5a2f" stroke-width="6"/>
    <ellipse cx="225" cy="215" rx="80" ry="45" fill="#c9efb0"/>
    <path d="M150 260 q10 25 30 0 M260 262 q10 25 30 0" fill="#4cbb66" stroke="#1f5a2f" stroke-width="6"/>
    <g class="d-head">
      <circle cx="110" cy="150" r="70" fill="#4cbb66" stroke="#1f5a2f" stroke-width="6"/>
      <path d="M80 92 L70 55 L100 85Z M128 85 L140 48 L150 88Z" fill="#ffd166" stroke="#1f5a2f" stroke-width="5" stroke-linejoin="round"/>
      <ellipse cx="70" cy="180" rx="38" ry="26" fill="#7fd08f" stroke="#1f5a2f" stroke-width="5"/>
      <circle cx="58" cy="176" r="5" fill="#1f5a2f"/><circle cx="80" cy="176" r="5" fill="#1f5a2f"/>
      <g class="d-eyes">
        <g class="open"><circle cx="95" cy="135" r="16" fill="#fff" stroke="#1f5a2f" stroke-width="4"/><circle cx="91" cy="137" r="8" fill="#1d1d1d"/>
          <circle cx="140" cy="135" r="16" fill="#fff" stroke="#1f5a2f" stroke-width="4"/><circle cx="136" cy="137" r="8" fill="#1d1d1d"/></g>
        <g class="closed"><path d="M80 138 Q95 150 110 138 M125 138 Q140 150 155 138" fill="none" stroke="#1f5a2f" stroke-width="6" stroke-linecap="round"/></g>
        <g class="half"><path d="M79 135 h32 M124 135 h32" stroke="#1f5a2f" stroke-width="7" stroke-linecap="round"/>
          <circle cx="95" cy="141" r="6" fill="#1d1d1d"/><circle cx="140" cy="141" r="6" fill="#1d1d1d"/></g>
      </g>
      <path class="d-smile" d="M95 200 Q115 214 135 198" fill="none" stroke="#1f5a2f" stroke-width="5" stroke-linecap="round"/>
      <circle cx="150" cy="175" r="10" fill="#ff9aa8" opacity=".7"/>
      ${hat}
    </g>
  </svg>`;
}
