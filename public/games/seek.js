// 🔦 Flashlight Hide & Seek: one critter peeks out of a hiding spot in a dark
// bedroom; the other kids steer flashlights from their phones to find it.
// Hiding spots (SEEK_SPOTS) live in common.js so the phones can show them too.

Games.seek = (ctx) => {
  ctx.stage.innerHTML = `<div class="scene seek-scene">
    ${bedroomSvg(ctx.theme === 'halloween')}
    <div class="s-hidden"></div>
    <canvas class="s-dark"></canvas>
    <div class="s-banner"></div>
  </div>`;
  const scene = ctx.stage.querySelector('.seek-scene');
  const hidden = scene.querySelector('.s-hidden');
  const canvas = scene.querySelector('.s-dark');
  const banner = scene.querySelector('.s-banner');
  const g = canvas.getContext('2d');

  let stage = null;
  let round = -1;
  let hider = null;
  let spot = null;
  let reported = false;
  const dwell = {};
  const nameOf = (key) => ctx.players.find((p) => p.key === key)?.name || '?';

  function fit() {
    const r = scene.getBoundingClientRect();
    canvas.width = Math.round(r.width);
    canvas.height = Math.round(r.height);
  }
  fit();
  window.addEventListener('resize', fit);

  function update(state) {
    const s = state.seek;
    if (!s) return;
    const changed = s.stage !== stage || s.round !== round;
    stage = s.stage;
    round = s.round;
    hider = ctx.players.find((p) => p.key === s.hider);
    spot = s.spot;
    if (!changed) return;
    scene.dataset.stage = stage;
    reported = false;
    for (const k of Object.keys(dwell)) delete dwell[k];
    const who = esc(hider ? hider.name : '?');
    if (stage === 'hide') {
      hidden.innerHTML = '';
      banner.innerHTML = `🙈 Everyone close your eyes!<br><b>${who}</b> is hiding… (${s.round + 1}/${s.rounds})`;
      ctx.voice.say(`Everyone close your eyes! ${hider ? hider.name : ''} is hiding!`);
    } else if (stage === 'seek' && spot !== null && hider) {
      const sp = SEEK_SPOTS[spot];
      hidden.style.left = `${sp.x * 100}%`;
      hidden.style.top = `${sp.y * 100}%`;
      hidden.innerHTML = critterSvg(hider.critter, { cls: 'alive', feet: false });
      banner.innerHTML = `🔦 Find <b>${who}</b>!`;
      ctx.voice.say(`Ready or not! Find ${hider.name}!`);
      ctx.sound.play('whoosh');
    } else if (stage === 'reveal') {
      const finder = s.finder ? nameOf(s.finder) : null;
      banner.innerHTML = finder
        ? `🎉 <b>${esc(finder)}</b> found <b>${who}</b>!`
        : `🏆 Nobody found <b>${who}</b>! Great hiding!`;
      ctx.voice.say(finder ? `${finder} found ${hider ? hider.name : 'them'}!` : `Nobody found ${hider ? hider.name : 'them'}! Great hiding!`);
      ctx.sound.play(finder ? 'found' : 'cheer');
    }
  }

  const stopLoop = gameLoop((dt) => {
    ctx.serverClock();
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    if (stage === 'reveal') return;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = stage === 'hide' ? 'rgba(4,6,20,0.985)' : 'rgba(4,6,20,0.93)';
    g.fillRect(0, 0, W, H);
    if (stage !== 'seek' || !hider || spot === null) return;

    const sp = SEEK_SPOTS[spot];
    const seekers = ctx.players.filter((p) => p.key !== hider.key);
    const lights = seekers.map((p) => {
      const l = ctx.light(p.key) || { x: 0.5, y: 0.6, on: false };
      const r = 0.085 * W * Math.sqrt(ageFactor(p.age)) * (l.on ? 1 : 0.7);
      return { p, x: l.x * W, y: l.y * H, r, on: l.on };
    });
    // Cut holes in the darkness for every flashlight.
    g.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const grad = g.createRadialGradient(l.x, l.y, l.r * 0.25, l.x, l.y, l.r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      g.fill();
    }
    // A colored ring and name so each kid can tell which light is theirs.
    g.globalCompositeOperation = 'source-over';
    for (const l of lights) {
      g.strokeStyle = critterColor(l.p);
      g.lineWidth = Math.max(3, W * 0.004);
      g.globalAlpha = l.on ? 0.95 : 0.5;
      g.beginPath();
      g.arc(l.x, l.y, l.r * 0.92, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = critterColor(l.p);
      g.font = `bold ${Math.round(W * 0.016)}px 'Baloo 2', sans-serif`;
      g.textAlign = 'center';
      g.fillText(l.p.name, l.x, l.y + l.r + W * 0.018);

      // Holding the light on the critter for half a second finds it.
      const d = Math.hypot(l.x - sp.x * W, l.y - sp.y * H);
      dwell[l.p.key] = l.on && d < l.r * 0.55 + W * 0.035 ? (dwell[l.p.key] || 0) + dt : 0;
      if (!reported && dwell[l.p.key] > 0.5) {
        reported = true;
        ctx.found(l.p.key);
      }
    }
  });

  return {
    input() {},
    update,
    stop() { stopLoop(); window.removeEventListener('resize', fit); },
  };
};

// An original cozy bedroom, 1600x900, matching SEEK_SPOTS.
function bedroomSvg(halloween = false) {
  const lights = Array.from({ length: 22 }, (_, i) => {
    const x = 40 + i * 72;
    const y = 58 + Math.sin(i * 0.9) * 10 + (i % 2) * 6;
    return `<circle cx="${x}" cy="${y}" r="11" fill="${i % 2 ? '#b07cff' : '#ff9a1f'}"/><circle cx="${x - 3}" cy="${y - 3}" r="3" fill="#fff" opacity=".7"/>`;
  }).join('');
  const deco = halloween ? `
    <path d="M0 50 Q400 80 800 52 T1600 56" fill="none" stroke="#3a2f2a" stroke-width="4"/>${lights}
    <svg x="250" y="170" width="140" height="70" viewBox="0 0 120 60">${batSvg().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>
    <svg x="1000" y="240" width="110" height="55" viewBox="0 0 120 60">${batSvg().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>
    <svg x="1190" y="660" width="120" height="120" viewBox="0 0 100 100">${pumpkinSvg('', 0).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>` : '';
  return `<svg class="bedroom" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
    <rect width="1600" height="620" fill="#f6d9b8"/>
    <path d="M0 0 H1600 V40 H0Z" fill="#e8c59d"/>
    ${Array.from({ length: 16 }, (_, i) => `<circle cx="${50 + i * 100}" cy="${120 + (i % 3) * 140}" r="10" fill="#efc9a0"/>`).join('')}
    <rect y="620" width="1600" height="280" fill="#c8915f"/>
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 200} 620 V900" stroke="#b47f50" stroke-width="5"/>`).join('')}
    <ellipse cx="760" cy="790" rx="330" ry="70" fill="#7cc6c2"/><ellipse cx="760" cy="790" rx="270" ry="50" fill="#a6dcd8"/>
    <!-- window + curtains -->
    <rect x="700" y="110" width="290" height="300" rx="14" fill="#2b3f7a" stroke="#fff" stroke-width="18"/>
    <circle cx="900" cy="190" r="34" fill="#fff6c9"/><circle cx="915" cy="180" r="30" fill="#2b3f7a"/>
    <path d="M845 110 V410 M700 260 H990" stroke="#fff" stroke-width="10"/>
    <path d="M660 95 Q700 260 650 430 L720 430 Q740 260 720 95Z" fill="#e85d75"/>
    <path d="M1030 95 Q990 260 1040 430 L970 430 Q950 260 970 95Z" fill="#e85d75"/>
    <rect x="640" y="85" width="410" height="18" rx="9" fill="#8a5a3b"/>
    <!-- bookshelf -->
    <rect x="1090" y="150" width="190" height="420" rx="10" fill="#9b6a43"/>
    ${[0, 1, 2].map((r) => `<rect x="1105" y="${170 + r * 135}" width="160" height="110" fill="#7b4f30"/>
      ${[0, 1, 2, 3, 4].map((b) => `<rect x="${1112 + b * 30}" y="${190 + r * 135}" width="24" height="90" rx="3" fill="${['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc'][(b + r) % 5]}"/>`).join('')}`).join('')}
    <!-- wardrobe -->
    <rect x="1330" y="130" width="250" height="660" rx="16" fill="#a5734c"/>
    <rect x="1345" y="150" width="105" height="620" rx="8" fill="#b9845a"/>
    <path d="M1462 150 L1560 165 V760 L1462 770Z" fill="#8c5f3d"/>
    <circle cx="1440" cy="460" r="9" fill="#ffd166"/>
    <!-- floor lamp -->
    <path d="M600 760 V420" stroke="#555" stroke-width="12"/>
    <ellipse cx="600" cy="765" rx="60" ry="14" fill="#555"/>
    <path d="M530 270 L670 270 L640 400 L560 400Z" fill="#ffe08a" stroke="#d9a400" stroke-width="6"/>
    <!-- bed -->
    <rect x="120" y="470" width="560" height="200" rx="26" fill="#6c8cff"/>
    <rect x="120" y="440" width="190" height="90" rx="30" fill="#fff"/>
    <rect x="300" y="470" width="380" height="200" rx="26" fill="#ffb4c6"/>
    ${[0, 1, 2, 3].map((i) => `<circle cx="${360 + i * 90}" cy="560" r="18" fill="#ff8fab"/>`).join('')}
    <rect x="95" y="380" width="40" height="370" rx="14" fill="#8a5a3b"/>
    <rect x="665" y="500" width="34" height="250" rx="14" fill="#8a5a3b"/>
    <rect x="130" y="670" width="540" height="80" fill="#2a2035"/>
    <!-- toy box -->
    <rect x="730" y="640" width="190" height="150" rx="14" fill="#ff9f43" stroke="#c46a12" stroke-width="8"/>
    <rect x="720" y="620" width="210" height="34" rx="12" fill="#ffbe76" stroke="#c46a12" stroke-width="8"/>
    <circle cx="825" cy="715" r="28" fill="#ffd43b"/><path d="M810 715 l10 10 l20 -22" stroke="#c46a12" stroke-width="7" fill="none"/>
    <!-- plant -->
    <path d="M1010 840 L1000 700 H1110 L1100 840Z" fill="#d9480f"/>
    ${[[-60, -150], [-20, -190], [30, -170], [60, -130], [0, -120]].map(([dx, dy]) => `<ellipse cx="${1055 + dx / 2}" cy="${700 + dy / 2}" rx="34" ry="80" transform="rotate(${dx / 2} ${1055 + dx / 2} ${700 + dy / 2})" fill="#37b24d"/>`).join('')}
    <!-- laundry basket -->
    <path d="M30 720 H220 L200 880 H50Z" fill="#e9c46a" stroke="#b08a2e" stroke-width="7"/>
    ${[0, 1, 2, 3].map((i) => `<path d="M40 ${750 + i * 32} H210" stroke="#b08a2e" stroke-width="5"/>`).join('')}
    <path d="M60 720 q40 -50 90 -10 q30 -30 60 10Z" fill="#74c0fc"/>
    ${deco}
  </svg>`;
}
