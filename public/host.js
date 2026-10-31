const socket = io();
const app = document.getElementById('app');
const clock = makeClock();
const HOST_KEY = 'critters-host';
// In the Android TV app or on a Chromecast there's no mouse: hide buttons, play sound right away.
const CAST = !!window.CRITTERS_CAST;
const NO_INPUT = !!(window.CRITTERS_TV || CAST);
if (NO_INPUT) document.body.classList.add('no-input');
// On a Chromecast (cast.html) the TV waits for a phone to say which room to show.
let castCode;

let state = null;
let qr = null;
let lastHtml = '';
let game = null; // running mini-game: { name, round, api }
const inputs = {}; // latest live input per kid key
const timers = []; // scheduled voice/sound cues for the current screen

const saved = () => { try { return sessionStorage.getItem(HOST_KEY); } catch { return null; } };
const save = (code) => { try { sessionStorage.setItem(HOST_KEY, code); } catch {} };
const joinUrl = (code) => `${location.origin}/play?room=${code}`;

function onRoom(res) {
  save(res.code);
  if (window.onCrittersRoom) window.onCrittersRoom(res.code);
  socket.emit('host:qr', { url: joinUrl(res.code) }, (r) => {
    qr = r.dataUrl || null;
    render();
  });
}

function connectRoom() {
  if (CAST && castCode === undefined) return;
  const code = CAST ? castCode : saved();
  if (code) socket.emit('host:resume', { code }, (res) => (res.error ? socket.emit('host:create', null, onRoom) : onRoom(res)));
  else socket.emit('host:create', null, onRoom);
}
socket.on('connect', connectRoom);

// Called by cast-receiver.js: show this room, or a new one when code is null.
window.crittersShow = (code) => {
  if (code && state && state.code === code) return window.onCrittersRoom && window.onCrittersRoom(code);
  castCode = code || null;
  if (code) save(code);
  if (socket.connected) connectRoom();
};

socket.on('host:state', (s) => {
  const prev = state;
  state = s;
  clock.sync(s);
  cues(prev, s);
  render();
});

socket.on('input', (m) => {
  const cur = inputs[m.key] || {};
  if (m.kind === 'mic') inputs[m.key] = { ...cur, e: m.e, et: performance.now() };
  else inputs[m.key] = { ...cur, light: { x: m.x, y: m.y, on: m.on }, lt: performance.now() };
});

function act(action) {
  socket.emit('host:action', { action }, (res) => res && res.error && console.warn(res.error));
}

const unlockSound = () => {
  if (!sound.ready() && sound.unlock()) setTimeout(() => { syncMusic(); render(true); }, 50);
};
document.addEventListener('click', unlockSound);
document.addEventListener('keydown', unlockSound);
if (NO_INPUT) setTimeout(unlockSound, 0);

app.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'sound') {
    if (sound.ready()) sound.setEnabled(!sound.enabled);
    voice.enabled = sound.enabled;
    render(true);
  } else if (btn.dataset.act === 'newRoom') {
    if (!confirm('Start a new room? Everyone will need to join again.')) return;
    try { sessionStorage.removeItem(HOST_KEY); } catch {}
    socket.emit('host:create', null, onRoom);
  } else act(btn.dataset.act);
});

// ---------------- voice & sound cues ----------------

function later(ms, fn) {
  timers.push(setTimeout(fn, ms));
}

function syncMusic() {
  if (!state) return;
  sound.music(state.phase !== 'lobby' || state.players.length > 0);
}

function cues(prev, s) {
  syncMusic();
  const phaseChanged = !prev || prev.phase !== s.phase || prev.gameIdx !== s.gameIdx;
  if (phaseChanged) {
    timers.splice(0).forEach(clearTimeout);
    voice.stop();
  }
  if (s.phase === 'lobby' && prev) {
    const fresh = s.players.filter((p) => !prev.players.some((q) => q.key === p.key));
    fresh.forEach((p) => { sound.play('pop'); voice.say(`Hi ${p.name}!`); });
  }
  if (s.phase === 'draw' && prev && prev.phase === 'draw') {
    const drawn = (st) => st.players.filter((p) => p.drawn).length;
    if (drawn(s) > drawn(prev)) sound.play('star');
  }
  if (!phaseChanged) return;

  switch (s.phase) {
    case 'draw':
      sound.play('whoosh');
      voice.say('Time to draw your critter! Draw it on your phone, and give it googly eyes!');
      break;
    case 'meet':
      sound.play('sparkle');
      voice.say('Look! Your critters are coming to life!');
      s.players.forEach((p, i) => later(2200 + i * 3400, () => {
        sound.play('hello');
        voice.say(`Say hi to ${p.name}'s critter!`);
      }));
      break;
    case 'intro': {
      const info = GAME_INFO[s.game];
      sound.play('sparkle');
      later(400, () => voice.say(`${info.title}! ${info.how}`));
      break;
    }
    case 'play':
      sound.play('whoosh');
      if (s.game !== 'seek') later(300, () => voice.say('Go!'));
      break;
    case 'results':
      voice.say(['Great job, everyone!', 'Wow, look at all those stars!', 'You are amazing!'][s.gameIdx % 3]);
      for (let i = 0; i < 3; i++) later(700 + i * 450, () => sound.play('star'));
      break;
    case 'parade':
      sound.play('fanfare');
      later(1200, () => voice.say('Hooray! Time for a parade of all our amazing critters!'));
      break;
  }
}

// ---------------- mini-games ----------------

const MIC_GAMES = ['balloon', 'dragon', 'feather'];

function gameCtx(stage) {
  return {
    stage,
    players: state.players.filter((p) => p.critter),
    seconds: state.gameSeconds,
    sound,
    voice,
    effort(key) {
      const i = inputs[key];
      return i && performance.now() - i.et < 600 ? i.e : 0;
    },
    light(key) {
      const i = inputs[key];
      return i && i.light ? i.light : null;
    },
    report(scores) { socket.emit('host:result', { game: state.game, scores }); },
    found(key) { socket.emit('host:found', { finder: key }); },
    clock(secs, frac) { setClock(secs, frac); },
    serverClock() { setClock(clock.remaining(), clock.fraction()); },
  };
}

function setClock(secs, frac) {
  const t = document.getElementById('gclock');
  const f = document.getElementById('gfuse');
  if (t) t.textContent = secs == null ? '' : secs;
  if (f) f.style.width = `${(frac || 0) * 100}%`;
}

function stopGame() {
  if (!game) return;
  game.api.stop();
  game = null;
  sound.musicLevel(0.18);
}

function renderPlay() {
  const key = `${state.game}:${state.gameIdx}`;
  if (game && game.key === key) {
    game.api.update(state);
    return;
  }
  stopGame();
  const info = GAME_INFO[state.game];
  app.innerHTML = `
    <div class="tv-top">
      <div class="logo small">${logo()}</div>
      <div class="info">${info.emoji} ${esc(info.title)}</div>
      <div class="top-right">${soundBtn()}<div class="timer" id="gclock"></div></div>
    </div>
    <div class="fuse"><div class="fuse-bar" id="gfuse"></div></div>
    <div class="stage" id="stage"></div>
    <div class="tv-actions"><button data-act="skip" class="ghost">Skip</button></div>`;
  lastHtml = '';
  for (const k of Object.keys(inputs)) delete inputs[k];
  if (MIC_GAMES.includes(state.game)) sound.musicLevel(0.05);
  const api = Games[state.game](gameCtx(document.getElementById('stage')));
  game = { key, api };
  api.update(state);
}

// ---------------- screens ----------------

const logo = () => 'Doodle Critters'.split('').map((ch, i) => (ch === ' ' ? ' ' : `<span style="color:${CRITTER_COLORS[i % CRITTER_COLORS.length]}">${ch}</span>`)).join('');

function soundBtn() {
  if (NO_INPUT) return '';
  return sound.ready()
    ? `<button class="ghost soundbtn" data-act="sound">${sound.enabled ? '🔊' : '🔇'}</button>`
    : '<button class="ghost soundbtn hint" data-act="sound">🔈 Click for sound</button>';
}

function header(extra = '') {
  const step = state.gameIdx >= 0 && state.phase !== 'parade' ? `Game ${state.gameIdx + 1} of ${state.games.length}` : '';
  return `
    <div class="tv-top">
      <div class="logo small">${logo()}</div>
      <div class="info">${extra || step}</div>
      <div class="top-right">${soundBtn()}<div class="timer" data-timer></div></div>
    </div>
    ${state.deadline ? '<div class="fuse"><div class="fuse-bar" data-fuse></div></div>' : ''}`;
}

function kidChip(p, extra = '') {
  return `<div class="kid ${p.connected ? '' : 'off'}" style="--c:${CRITTER_COLORS[p.color]}">
    <span class="blob"></span><b>${esc(p.name)}</b><small>age ${p.age}</small>${extra}</div>`;
}

function lobby() {
  return `
    <div class="lobby">
      <div class="title">${logo()}</div>
      <p class="tagline">Draw a critter on your phone and watch it come alive!</p>
      <div class="lobby-grid">
        <div class="joinbox">
          <div class="muted">Join on a phone</div>
          <div class="code">${esc(state.code)}</div>
          ${qr ? `<img src="${qr}" alt="QR code to join">` : ''}
          <div class="url">${esc(joinUrl(state.code))}</div>
        </div>
        <div class="kids">
          <h2>Players ${state.players.length}/${state.maxPlayers}</h2>
          <div class="kid-list">${state.players.map((p) => kidChip(p, p.vip ? '<span class="crown">👑</span>' : '')).join('') || '<p class="muted">Scan the code to join!</p>'}</div>
          <div class="games-preview">${Object.values(GAME_INFO).map((g) => `<span>${g.emoji} ${g.title}</span>`).join('')}</div>
        </div>
      </div>
      <div class="tv-actions">
        <button data-act="start" class="primary" ${state.players.length ? '' : 'disabled'}>Start! 🎨</button>
        <button data-act="newRoom" class="ghost">New room</button>
      </div>
      <p class="sub">👑 The first player can press Start on their phone.</p>
    </div>`;
}

function drawScreen() {
  const done = state.players.filter((p) => p.drawn).length;
  return `
    ${header('✏️ Drawing time')}
    <div class="center-screen">
      <div class="big-emoji bounce">🖍️</div>
      <h1>Draw your critter!</h1>
      <p class="sub">Use your phone. Add googly eyes 👀 and press <b>Done</b>!</p>
      <div class="kid-list">${state.players.map((p) => kidChip(p, p.drawn ? '<span class="tick">✅</span>' : '<span class="dots">✏️</span>')).join('')}</div>
      <p class="sub">${done} of ${state.players.length} finished</p>
    </div>`;
}

function meetScreen() {
  return `
    ${header('👋 Meet the critters')}
    <div class="meet">
      <h1>Say hi to our critters!</h1>
      <div class="meet-row">${state.players.map((p, i) => `
        <div class="meet-critter" style="animation-delay:${2.2 + i * 3.4}s">
          ${critterSvg(p.critter, { cls: 'alive walking' })}
          <div class="nametag" style="--c:${CRITTER_COLORS[p.color]}">${esc(p.name)}</div>
        </div>`).join('')}
      </div>
      <div class="ground"></div>
    </div>`;
}

function introScreen() {
  const info = GAME_INFO[state.game];
  return `
    ${header()}
    <div class="center-screen intro">
      <div class="big-emoji bounce">${info.emoji}</div>
      <h1>${esc(info.title)}</h1>
      <p class="how">${esc(info.how)}</p>
      <div class="critter-row">${state.players.map((p) => `<div class="mini">${critterSvg(p.critter, { cls: 'alive' })}</div>`).join('')}</div>
      <p class="sub">Get ready…</p>
    </div>`;
}

function resultsScreen() {
  const info = GAME_INFO[state.results.game];
  return `
    ${header()}
    <div class="center-screen results">
      <h1>${info.emoji} ${esc(info.title)}</h1>
      <div class="result-grid">${state.players.map((p, i) => `
        <div class="result" style="animation-delay:${i * 0.15}s">
          ${critterSvg(p.critter, { cls: 'alive' })}
          <b>${esc(p.name)}</b>
          <div class="stars" style="--d:${0.6 + i * 0.15}s">${starsHtml(state.results.stars[p.key] || 1)}</div>
        </div>`).join('')}
      </div>
    </div>`;
}

function paradeScreen() {
  const total = state.players.reduce((n, p) => n + p.stars, 0);
  return `
    ${header('🎉 Parade!')}
    <div class="parade">
      <h1>Hooray for our critters!</h1>
      <p class="team-total">Together you collected <b>${total}</b> ⭐!</p>
      <div class="award-grid">${state.players.map((p, i) => {
        const [emoji, title] = awardFor(p);
        return `<div class="award" style="animation-delay:${0.3 + i * 0.2}s">
          <div class="medal">🏅</div>
          ${critterSvg(p.critter, { cls: 'alive' })}
          <b>${esc(p.name)}</b>
          <div class="award-title">${emoji} ${title}</div>
          <div class="muted">${p.stars} ⭐</div>
        </div>`;
      }).join('')}</div>
      <div class="marching">${state.players.concat(state.players).map((p) => critterSvg(p.critter, { cls: 'alive walking' })).join('')}</div>
      <div class="tv-actions"><button data-act="playAgain" class="primary">Play again 🎨</button></div>
    </div>`;
}

const screens = { lobby, draw: drawScreen, meet: meetScreen, intro: introScreen, results: resultsScreen, parade: paradeScreen };

function render(force = false) {
  if (!state) return;
  if (state.phase === 'play') return renderPlay();
  stopGame();
  const html = screens[state.phase]();
  if (force || html !== lastHtml) {
    app.innerHTML = html;
    lastHtml = html;
  }
}

startTimerLoop(clock);
