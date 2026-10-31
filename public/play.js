const socket = io();
const app = document.getElementById('app');
const clock = makeClock();
const params = new URLSearchParams(location.search);
const SESSION_KEY = 'critters-player';
const MIC_GAMES = ['balloon', 'dragon', 'feather'];

let state = null;
let screen = '';
let error = '';
let joinAge = null;

const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } };
const saveSession = (s) => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {} };
const buzz = (p) => navigator.vibrate && navigator.vibrate(p);
const meP = () => state && state.players.find((p) => p.key === state.me.key);

// ---------------- connection ----------------

socket.on('connect', () => {
  const s = loadSession();
  const urlRoom = (params.get('room') || '').toUpperCase();
  if (s && s.playerId && (!urlRoom || urlRoom === s.code)) {
    socket.emit('player:join', { code: s.code, playerId: s.playerId }, (res) => {
      if (res.error) { state = null; renderJoin(); }
    });
  } else if (!state) renderJoin();
});

socket.on('player:state', (s) => {
  if (!s) return;
  const prevPhase = state && state.phase;
  applyTheme(s);
  state = s;
  clock.sync(s);
  if (prevPhase !== s.phase && ['draw', 'intro', 'play'].includes(s.phase)) buzz(150);
  render();
});

socket.on('player:replaced', () => {
  state = null;
  app.innerHTML = '<div class="card center"><h2>Opened on another phone</h2></div>';
});

function act(msg, done) {
  socket.emit('player:action', msg, (res) => {
    error = (res && res.error) || '';
    if (done) done(!error);
    if (error) render(true);
  });
}

// ---------------- Chromecast ----------------

let castNote = '';

function castSlot() {
  if (!castSender.available) return '';
  return `<div class="card center castpanel">
      <button class="big" data-cast="new">📺 Cast a new game to your TV</button>
      <p class="muted" style="margin:0">${castNote || 'Puts the game on your Chromecast. No laptop needed!'}</p>
    </div>`;
}

castSender.onChange = () => {
  const slot = document.getElementById('castslot');
  if (slot) slot.innerHTML = castSlot();
  else if (state) render(true);
};

// The TV tells us its room code: pre-fill the join form.
castSender.onRoom = (code) => {
  if (state) return;
  const input = document.getElementById('code');
  if (!input) return;
  input.value = code;
  castNote = `✅ Game <b>${esc(code)}</b> is on your TV! Type your name and join.`;
  document.getElementById('castslot').innerHTML = castSlot();
  document.getElementById('name').focus();
};

// ---------------- join ----------------

function renderJoin(msg = '') {
  const s = loadSession();
  const room = (params.get('room') || (s && s.code) || '').toUpperCase();
  screen = 'join';
  app.innerHTML = `
    <div class="join-head"><img src="/icon.svg" alt=""><h1 class="logo">${'Doodle Critters'.split('').map((ch, i) => (ch === ' ' ? ' ' : `<span style="color:${CRITTER_COLORS[i % 8]}">${ch}</span>`)).join('')}</h1></div>
    <form class="card" id="join">
      <label>Game code<input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" value="${esc(room)}" placeholder="ABCD"></label>
      <label>Your name<input id="name" maxlength="12" autocomplete="off" value="${esc((s && s.name) || '')}" placeholder="Name"></label>
      <div class="label">How old are you?</div>
      <div class="ages">${[4, 5, 6, 7, 8].map((a) => `<button type="button" class="age ${joinAge === a ? 'on' : ''}" data-age="${a}">${a}</button>`).join('')}</div>
      <div class="err">${esc(msg)}</div>
      <button class="primary big" type="submit">Let's play! 🎨</button>
    </form>
    <div id="castslot">${castSlot()}</div>`;
  app.querySelectorAll('[data-age]').forEach((b) => b.addEventListener('click', () => {
    joinAge = Number(b.dataset.age);
    app.querySelectorAll('[data-age]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.getElementById('join').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('code').value.trim().toUpperCase();
    const name = document.getElementById('name').value.trim();
    socket.emit('player:join', { code, name, age: joinAge }, (res) => {
      if (res.error) return renderJoin(res.error);
      saveSession({ code: res.code, playerId: res.playerId, name });
    });
  });
}

// ---------------- shared pieces ----------------

function bar() {
  const p = meP();
  return `<div class="bar" style="--c:${CRITTER_COLORS[state.me.color]}">
    <span class="who">${p && p.critter ? critterSvg(p.critter, { feet: false }) : '<span class="blob"></span>'}<b>${esc(state.me.name)}</b></span>
    ${castSender.available ? `<button class="castbtn ${castSender.connected ? 'on' : ''}" data-cast="room" aria-label="Show this game on the TV">📺 ${castSender.connected ? 'On TV' : 'Cast'}</button>` : ''}
    <span class="pts">${p ? p.stars : 0} ${prize(state.theme)}</span>
  </div>`;
}

function micCard() {
  if (!mic.supported && !mic.ok) {
    return `<div class="card mic-card"><p>No microphone on this phone. You'll use the big <b>blow button</b> instead!</p></div>`;
  }
  if (!mic.ok) {
    return `<div class="card mic-card">
      <p>Some games use the microphone. You blow into it!</p>
      <button class="primary big" data-mic>🎤 Turn on microphone</button>
    </div>`;
  }
  return `<div class="card mic-card">
    <p>🎤 Microphone is on! Make a noise:</p>
    ${meter()}
  </div>`;
}

const meter = () => '<div class="meter"><div class="meter-ball" id="meter">🌬️</div></div>';

const holdButton = () => '<button class="hold" data-hold>👇 Hold to blow</button>';

// After a refresh mid-game the mic needs turning on again.
const micButton = () => (!mic.ok && mic.supported ? '<button class="primary" data-mic>🎤 Turn on microphone</button>' : '');

const lookAtTv = (text = 'Look at the TV! 📺') => `<p class="look">${text}</p>`;

// ---------------- screens ----------------

function lobbyScreen() {
  return `${bar()}
    <div class="card center">
      <h2>${state.theme === 'halloween' ? '🎃 Happy Halloween' : 'Hi'} ${esc(state.me.name)}! 👋</h2>
      <p class="muted">You're in the game!</p>
    </div>
    ${micCard()}
    <div id="live">${lobbyLive()}</div>`;
}

function lobbyLive() {
  return `<div class="card"><div class="roster">${state.players.map((p) => `<span class="chip" style="--c:${CRITTER_COLORS[p.color]}"><span class="blob"></span>${esc(p.name)}</span>`).join('')}</div></div>
    ${state.me.vip
      ? `<div class="card center"><div class="label">👑 Pick a theme</div>
          <div class="themes">
            <button class="${state.theme === 'sunny' ? 'on' : ''}" data-theme-pick="sunny">☀️ Sunny</button>
            <button class="${state.theme === 'halloween' ? 'on' : ''}" data-theme-pick="halloween">🎃 Halloween</button>
          </div></div>
        <button class="primary big" data-act="start">Start! 🎨</button><p class="center muted">👑 You're the leader. Press start when everyone is in!</p>`
      : '<p class="center muted">Waiting for 👑 the leader to press start…</p>'}`;
}

// --- drawing pad ---

let pad = null; // { strokes, eyes, history, color, width, eyesTool }
const PAD = 300;
const MAX_POINTS = 22000;
const MAX_STROKES = 750;
const padPoints = () => pad.strokes.reduce((n, s) => n + s.p.length / 2, 0);
let inkLeft = MAX_POINTS; // updated on stroke start; cheaper than recounting on every move

// Kids who joined late (or ran out of drawing time) can draw their critter now,
// unless they're in the middle of playing a game.
// The pad opens by itself while there's nothing else for them to do (meeting
// the critters, or waiting out a game they joined late); elsewhere they tap a button.
let wantPad = false;
function needsLatePad(s) {
  const p = s.players.find((x) => x.key === s.me.key);
  if (!p || !p.auto || s.phase === 'lobby' || s.phase === 'draw') return false;
  if (s.phase === 'play' && !p.waiting) return false; // they're playing right now
  return wantPad || s.phase === 'meet' || (s.phase === 'play' && p.waiting);
}

// Shown on results/parade to kids still using a stand-in critter.
const drawOwnButton = () => (meP() && meP().auto ? '<button class="big" data-drawown>🖍️ Draw my own critter</button>' : '');

function drawScreen(late = false) {
  const p = meP();
  if (!late && p && p.drawn) {
    return `${bar()}
      <div class="card center">
        <h2>Great drawing! 🎉</h2>
        <div class="preview">${critterSvg(p.critter, { cls: 'alive' })}</div>
        ${lookAtTv('Waiting for everyone to finish…')}
      </div>`;
  }
  if (!pad) pad = { strokes: [], eyes: [], history: [], color: 0, width: 1, eyesTool: false };
  return `${bar()}${late ? '' : '<div class="timerline"><div class="fuse"><div class="fuse-bar" data-fuse></div></div></div>'}
    <h2 class="center">${late ? `Welcome, ${esc(state.me.name)}! 👋<br>Draw your critter 🖍️` : 'Draw your critter! 🖍️'}</h2>
    ${late ? '<p class="center muted" style="margin:0">It joins the fun as soon as you press Done!</p>' : ''}
    <canvas id="pad"></canvas>
    <div class="palette">${PALETTE.map((c, i) => `<button class="swatch ${!pad.eyesTool && pad.color === i ? 'on' : ''}" style="--c:${c}" data-color="${i}" aria-label="Color ${i + 1}"></button>`).join('')}</div>
    <div class="tools">
      ${WIDTHS.map((w, i) => `<button class="tool ${pad.width === i ? 'on' : ''}" data-width="${i}"><i style="width:${w}px;height:${w}px"></i></button>`).join('')}
      <button class="tool eyes ${pad.eyesTool ? 'on' : ''}" data-eyes>👀</button>
      <button class="tool" data-undo>↩️</button>
      <button class="tool" data-clear>🗑️</button>
    </div>
    <div class="err">${esc(error)}</div>
    <button class="primary big" data-done>Done! ✅</button>`;
}

function setupPad() {
  const canvas = document.getElementById('pad');
  if (!canvas) return;
  const g = canvas.getContext('2d');
  canvas.style.width = '100%';
  const size = Math.min(canvas.getBoundingClientRect().width, 440);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const k = (size * dpr) / PAD;

  function redraw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const s of pad.strokes) {
      g.strokeStyle = PALETTE[s.c];
      g.lineWidth = WIDTHS[s.w];
      g.beginPath();
      g.moveTo(s.p[0], s.p[1]);
      if (s.p.length === 2) g.lineTo(s.p[0] + 0.1, s.p[1]);
      for (let i = 2; i < s.p.length; i += 2) g.lineTo(s.p[i], s.p[i + 1]);
      g.stroke();
    }
    pad.eyes.forEach(drawEye);
  }

  function drawEye(e) {
    const r = EYE_SIZES[e.s];
    g.fillStyle = '#fff';
    g.strokeStyle = '#1d1d1d';
    g.lineWidth = 3;
    g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#1d1d1d';
    g.beginPath(); g.arc(e.x, e.y + r * 0.1, r * 0.46, 0, Math.PI * 2); g.fill();
  }

  // Draw just the newest piece of a stroke, so big drawings stay fast.
  function drawSegment(s, x0, y0, x1, y1) {
    g.strokeStyle = PALETTE[s.c];
    g.lineWidth = WIDTHS[s.w];
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  redraw();

  const pos = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(PAD, ((ev.clientX - r.left) / r.width) * PAD))),
      Math.round(Math.max(0, Math.min(PAD, ((ev.clientY - r.top) / r.height) * PAD)))];
  };
  let stroke = null;
  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    const [x, y] = pos(ev);
    if (pad.eyesTool) {
      if (pad.eyes.length >= 6) return;
      const eye = { x, y, s: pad.width + 1 };
      pad.eyes.push(eye);
      pad.history.push('eye');
      buzz(20);
      drawEye(eye);
      return;
    }
    inkLeft = MAX_POINTS - padPoints();
    if (pad.strokes.length >= MAX_STROKES || inkLeft <= 0) {
      error = 'Wow, your drawing is full! Press Done ✅';
      app.querySelector('.err').textContent = error;
      return;
    }
    stroke = { c: pad.color, w: pad.width, p: [x, y] };
    pad.strokes.push(stroke);
    pad.history.push('stroke');
    drawSegment(stroke, x, y, x + 0.1, y);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!stroke) return;
    const [x, y] = pos(ev);
    const n = stroke.p.length;
    if (Math.hypot(x - stroke.p[n - 2], y - stroke.p[n - 1]) < 2.5) return;
    if (--inkLeft <= 0) { stroke = null; return; }
    stroke.p.push(x, y);
    drawSegment(stroke, stroke.p[n - 2], stroke.p[n - 1], x, y);
  });
  const end = () => { stroke = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  pad.redraw = redraw;
}

function padTool(d) {
  if (d.color !== undefined) { pad.color = Number(d.color); pad.eyesTool = false; }
  else if (d.width !== undefined) pad.width = Number(d.width);
  else if (d.eyes !== undefined) pad.eyesTool = !pad.eyesTool;
  else if (d.undo !== undefined) {
    const last = pad.history.pop();
    if (last === 'eye') pad.eyes.pop();
    else if (last === 'stroke') pad.strokes.pop();
  } else if (d.clear !== undefined) {
    if (!confirm('Start your drawing again?')) return;
    pad.strokes = []; pad.eyes = []; pad.history = [];
  }
  app.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', !pad.eyesTool && Number(b.dataset.color) === pad.color));
  app.querySelectorAll('[data-width]').forEach((b) => b.classList.toggle('on', Number(b.dataset.width) === pad.width));
  app.querySelector('[data-eyes]').classList.toggle('on', pad.eyesTool);
  pad.redraw();
}

// --- games ---

function meetScreen() {
  const p = meP();
  return `${bar()}
    <div class="card center">
      <h2>Your critter is alive! 🎉</h2>
      <div class="preview">${critterSvg(p && p.critter, { cls: 'alive walking' })}</div>
      ${lookAtTv()}
    </div>`;
}

function introScreen() {
  const info = gameInfo(state.game, state.theme);
  return `${bar()}
    <div class="card center">
      <div class="big-emoji">${info.emoji}</div>
      <h2>${esc(info.title)}</h2>
      <p class="how">${esc(info.phone)}</p>
      ${MIC_GAMES.includes(state.game) ? `<p class="muted">Practice now! Hold the phone close to your mouth.</p>${meter()}${micButton()}${mic.ok ? '' : holdButton()}` : ''}
      ${lookAtTv()}
    </div>`;
}

function micGameScreen() {
  const info = gameInfo(state.game, state.theme);
  return `${bar()}
    <div class="card center play">
      <div class="big-emoji">${info.emoji}</div>
      <p class="how">${esc(info.phone)}</p>
      ${meter()}
      ${mic.ok ? '<p class="muted">Blow or make noise into the phone!</p>' : ''}
      ${micButton()}
      ${holdButton()}
      ${lookAtTv()}
    </div>`;
}

function seekScreen() {
  const s = state.seek;
  const hider = state.players.find((p) => p.key === s.hider);
  const iHide = s.hider === state.me.key;
  const who = esc(hider ? hider.name : '?');
  if (s.stage === 'hide') {
    if (iHide) {
      return `${bar()}
        <h2 class="center">🙈 Where will you hide?</h2>
        <p class="center muted">Pick a secret spot. Don't tell anyone!</p>
        <div class="spots">${SEEK_SPOTS.map((sp, i) => `<button class="spot" data-spot="${i}"><span>${sp.emoji}</span>${esc(sp.name)}</button>`).join('')}</div>`;
    }
    return `${bar()}<div class="card center"><div class="big-emoji">🙈</div><h2>Close your eyes!</h2><p class="how"><b>${who}</b> is hiding…</p></div>`;
  }
  if (s.stage === 'seek') {
    if (iHide) {
      const sp = SEEK_SPOTS[s.spot];
      return `${bar()}<div class="card center"><div class="big-emoji">🤫</div><h2>Shh! You're hiding!</h2>
        <p class="how">${sp ? `${sp.emoji} ${esc(sp.name)}` : ''}</p>${lookAtTv('Watch them look for you on the TV!')}</div>`;
    }
    return `${bar()}
      <h2 class="center">🔦 Find ${who}!</h2>
      <div class="lightpad" id="lightpad"><div class="beam" id="beam"></div><p>Slide your finger here to move your flashlight</p></div>
      ${lookAtTv()}`;
  }
  // reveal
  const iFound = s.finder === state.me.key;
  let msg;
  if (iHide) msg = s.finder ? '🙈 They found you!' : '🏆 Nobody found you! Great hiding!';
  else if (iFound) msg = `🎉 You found ${who}!`;
  else msg = s.finder ? `🔦 ${esc(state.players.find((p) => p.key === s.finder)?.name || '')} found ${who}!` : `🏆 ${who} hid really well!`;
  return `${bar()}<div class="card center"><h2>${msg}</h2>${lookAtTv()}</div>`;
}

// Place on the leaderboard (ties share a place, like the TV).
function myPlace() {
  const me = meP();
  const higher = new Set(state.players.filter((p) => p.stars > (me ? me.stars : 0)).map((p) => p.stars));
  return higher.size + 1;
}

function resultsScreen() {
  const n = state.results.stars[state.me.key];
  const info = gameInfo(state.results.game, state.theme);
  const me = meP();
  if (!n) {
    return `${bar()}<div class="card center"><div class="big-emoji">🎉</div><h2>You'll play the next game!</h2>${lookAtTv()}</div>${drawOwnButton()}`;
  }
  const place = myPlace();
  return `${bar()}
    <div class="card center">
      <div class="big-emoji">${info.emoji}</div>
      <h2>${['Good try!', 'Great job!', 'Amazing!'][n - 1]}</h2>
      <div class="stars big">${starsHtml(n)}</div>
      <p class="how">${['🥇', '🥈', '🥉'][place - 1] || '🏅'} You're #${place} with ${me ? me.stars : 0} ${prize(state.theme)}</p>
    </div>
    ${drawOwnButton()}
    ${lookAtTv('Look at the leaderboard on the TV! 📺')}`;
}

function waitingScreen() {
  return `${bar()}<div class="card center">
      <div class="preview">${critterSvg(meP() && meP().critter, { cls: 'alive walking' })}</div>
      <h2>You'll join the next game! 🎉</h2>
      ${lookAtTv('Watch the TV, your turn is coming!')}
    </div>`;
}

function paradeScreen() {
  const p = meP();
  const [emoji, title] = awardFor(p || {}, state.theme);
  return `${bar()}
    <div class="card center">
      <div class="big-emoji">🏅</div>
      <h2>You're a ${title}!</h2>
      <div class="preview">${critterSvg(p && p.critter, { cls: 'alive' })}</div>
      <p class="how">${emoji} ${p ? p.stars : 0} ${prizeWord(state.theme, p ? p.stars : 0)}!</p>
    </div>
    <button class="primary big" data-act="playAgain">Play again! 🎨</button>
    ${drawOwnButton()}`;
}

function screenKey(s) {
  const p = s.players.find((x) => x.key === s.me.key);
  if (needsLatePad(s)) return 'latepad';
  if (s.phase === 'play' && p && p.waiting) return `waiting:${s.gameIdx}`;
  switch (s.phase) {
    case 'lobby': return `lobby:${mic.ok}:${s.theme}`;
    case 'draw': return `draw:${p && p.drawn ? 'done' : 'pad'}`;
    case 'play':
      if (s.game === 'seek') return `seek:${s.seek.round}:${s.seek.stage}:${s.seek.finder}`;
      return `play:${s.game}:${mic.ok}`;
    case 'intro': return `intro:${s.gameIdx}:${mic.ok}`;
    case 'results': return `results:${s.gameIdx}`;
    case 'parade': return 'parade';
    default: return `${s.phase}:${s.gameIdx}:${s.game}`;
  }
}

function build() {
  if (screen === 'latepad') return drawScreen(true);
  if (screen.startsWith('waiting:')) return waitingScreen();
  switch (state.phase) {
    case 'lobby': return lobbyScreen();
    case 'draw': return drawScreen();
    case 'meet': return meetScreen();
    case 'intro': return introScreen();
    case 'play': return state.game === 'seek' ? seekScreen() : micGameScreen();
    case 'results': return resultsScreen();
    case 'parade': return paradeScreen();
    default: return '';
  }
}

// Rebuild only when the screen changes, so the drawing pad and meters survive
// updates about other players.
function render(force = false) {
  if (!state) return;
  const key = screenKey(state);
  const padScreen = key === 'draw:pad' || key === 'latepad';
  const me = state.players.find((x) => x.key === state.me.key);
  if (!padScreen && !(me && me.auto && state.phase !== 'lobby')) pad = null;
  if (me && !me.auto) wantPad = false;
  if (!force && key === screen) {
    const live = document.getElementById('live');
    if (live && state.phase === 'lobby') live.innerHTML = lobbyLive();
    return;
  }
  screen = key;
  app.innerHTML = build();
  if (padScreen) setupPad();
  if (document.getElementById('lightpad')) setupLightpad();
}

// ---------------- live inputs ----------------

// Mic effort: shown on the meter, and sent to the TV during mic games.
let lastEffort = 0;
setInterval(() => {
  if (!state) return;
  const e = mic.effort();
  lastEffort = e;
  if (state.phase === 'play' && MIC_GAMES.includes(state.game)) {
    socket.volatile.emit('player:input', { kind: 'mic', e: Math.round(e * 100) / 100 });
  }
}, 66);

(function meterLoop() {
  const m = document.getElementById('meter');
  if (m) {
    m.style.transform = `scale(${0.55 + lastEffort * 0.9})`;
    m.classList.toggle('hot', lastEffort > 0.5);
  }
  requestAnimationFrame(meterLoop);
})();

function setupLightpad() {
  const padEl = document.getElementById('lightpad');
  const beam = document.getElementById('beam');
  let last = 0;
  const send = (ev, on) => {
    const r = padEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
    beam.style.left = `${x * 100}%`;
    beam.style.top = `${y * 100}%`;
    beam.classList.toggle('on', on);
    const now = performance.now();
    if (!on || now - last > 40) {
      last = now;
      socket.volatile.emit('player:input', { kind: 'light', x, y, on });
    }
  };
  padEl.addEventListener('pointerdown', (ev) => { ev.preventDefault(); padEl.setPointerCapture(ev.pointerId); send(ev, true); });
  padEl.addEventListener('pointermove', (ev) => { if (ev.buttons || ev.pointerType === 'touch') send(ev, true); });
  padEl.addEventListener('pointerup', (ev) => send(ev, false));
  padEl.addEventListener('pointercancel', (ev) => send(ev, false));
}

// ---------------- clicks ----------------

app.addEventListener('click', async (e) => {
  const el = e.target.closest('button');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.cast) castSender.show(d.cast === 'room' && state ? state.code : null);
  else if (d.drawown !== undefined) { wantPad = true; render(true); }
  else if (d.themePick) act({ type: 'theme', theme: d.themePick });
  else if (d.act) act({ type: d.act });
  else if (d.mic !== undefined) {
    el.disabled = true;
    el.textContent = 'Asking…';
    await mic.enable();
    render(true);
  } else if (d.done !== undefined) {
    if (!pad.strokes.length) { error = 'Draw something first! ✏️'; render(true); return; }
    el.disabled = true;
    act({ type: 'drawing', drawing: { strokes: pad.strokes, eyes: pad.eyes } }, (ok) => { if (!ok) el.disabled = false; });
  } else if (d.spot !== undefined) {
    buzz(40);
    act({ type: 'hide', spot: Number(d.spot) });
  } else if (pad && (d.color !== undefined || d.width !== undefined || d.eyes !== undefined || d.undo !== undefined || d.clear !== undefined)) {
    padTool(d);
  }
});

// Hold-to-blow button for phones without a microphone (or for little lungs).
app.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('[data-hold]');
  if (!btn) return;
  e.preventDefault();
  mic.hold(true);
  btn.classList.add('on');
});
// Letting go anywhere stops blowing, even if the finger slid off the button.
const release = () => {
  mic.hold(false);
  app.querySelectorAll('[data-hold].on').forEach((b) => b.classList.remove('on'));
};
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);

// Stop phones from locking during the TV-only parts of the game.
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('pointerdown', keepAwake, { once: true });

startTimerLoop(clock);
