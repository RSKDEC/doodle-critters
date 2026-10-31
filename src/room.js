const crypto = require('crypto');

// Order the mini-games are played in. 'seek' needs at least two kids.
const GAMES = ['balloon', 'dragon', 'seek', 'feather'];
const AGES = [4, 5, 6, 7, 8];
const MAX_PLAYERS = 8;
const COLORS = 8; // must match CRITTER_COLORS in public/critter.js
const SPOTS = 8; // hiding spots in the seek scene (public/games/seek.js)
const SECONDS = {
  draw: 100,
  meetPer: 3.4,
  intro: 9,
  results: 10,
  // The TV runs each game's clock and reports the result; these are the
  // server's failsafe limits in case the TV disappears mid-game.
  play: { balloon: 22, dragon: 60, feather: 22 },
  seekHide: 15,
  seekSeek: 35,
  seekReveal: 4.5,
  maxSeekRounds: 4,
};
// Drawing limits (canvas is 300x300 on the phone).
const DRAW = { size: 300, maxStrokes: 800, maxPoints: 24000, palette: 8, widths: 3, maxEyes: 6 };

const THEMES = ['sunny', 'halloween'];
// Halloween decorations come out on their own in October.
const defaultTheme = (d = new Date()) => (d.getMonth() === 9 || (d.getMonth() === 10 && d.getDate() === 1) ? 'halloween' : 'sunny');

const norm = (s) => String(s || '').trim().toLowerCase();

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Stars for a 0..1 performance score. Everyone who plays gets at least one.
const starsFor = (score) => (score >= 0.75 ? 3 : score >= 0.35 ? 2 : 1);

function validDrawing(d) {
  if (!d || !Array.isArray(d.strokes) || !Array.isArray(d.eyes || [])) return null;
  const inRange = (n) => Number.isFinite(n) && n >= 0 && n <= DRAW.size;
  let points = 0;
  if (d.strokes.length > DRAW.maxStrokes || (d.eyes || []).length > DRAW.maxEyes) return null;
  const strokes = [];
  for (const s of d.strokes) {
    if (!s || !Array.isArray(s.p) || s.p.length < 2 || s.p.length % 2) return null;
    if (!Number.isInteger(s.c) || s.c < 0 || s.c >= DRAW.palette) return null;
    if (!Number.isInteger(s.w) || s.w < 0 || s.w >= DRAW.widths) return null;
    points += s.p.length / 2;
    if (points > DRAW.maxPoints || !s.p.every(inRange)) return null;
    strokes.push({ c: s.c, w: s.w, p: s.p.map(Math.round) });
  }
  const eyes = [];
  for (const e of d.eyes || []) {
    if (!e || !inRange(e.x) || !inRange(e.y) || ![1, 2, 3].includes(e.s)) return null;
    eyes.push({ x: Math.round(e.x), y: Math.round(e.y), s: e.s });
  }
  if (!strokes.length) return null;
  return { strokes, eyes };
}

// A round blob with two eyes, for kids who didn't finish drawing in time.
function defaultDrawing(color) {
  const p = [];
  for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.2) {
    p.push(Math.round(150 + Math.cos(a) * 85 * (1 + Math.sin(a * 3) * 0.06)), Math.round(165 + Math.sin(a) * 75));
  }
  return { strokes: [{ c: color, w: 2, p }], eyes: [{ x: 120, y: 140, s: 2 }, { x: 180, y: 140, s: 2 }] };
}

class Room {
  constructor(code, onChange) {
    this.code = code;
    this.theme = defaultTheme();
    this.onChange = onChange;
    this.players = new Map();
    this.hostSockets = new Set();
    this.timer = null;
    this.deadline = null;
    this.duration = null;
    this.nextKey = 1;
    this.lastActive = Date.now();
    this.reset();
  }

  reset() {
    this.clearTimer();
    this.phase = 'lobby';
    this.gameIdx = -1;
    this.game = null;
    this.games = [];
    this.seek = null;
    this.results = null;
    this.participants = new Set();
    for (const p of this.players.values()) {
      p.critter = null;
      p.autoCritter = false;
      p.stars = 0;
      p.gameStars = {};
    }
  }

  touch() {
    this.lastActive = Date.now();
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
    this.duration = null;
  }

  setTimer(seconds, fn) {
    this.clearTimer();
    this.deadline = Date.now() + seconds * 1000;
    this.duration = seconds;
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
      this.onChange();
    }, seconds * 1000);
  }

  // ---------- players ----------

  active() {
    return [...this.players.values()];
  }

  connected() {
    return this.active().filter((p) => p.connected);
  }

  get vipId() {
    const all = this.active();
    const vip = all.find((p) => p.connected) || all[0];
    return vip ? vip.id : null;
  }

  byKey(key) {
    return this.active().find((p) => p.key === key);
  }

  join(name, age, playerId) {
    if (playerId && this.players.has(playerId)) return { player: this.players.get(playerId) };

    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!name) return { error: 'Type your name' };
    age = Number(age);
    if (!AGES.includes(age)) return { error: 'Pick your age' };

    const existing = this.active().find((p) => norm(p.name) === norm(name));
    if (existing) {
      if (!existing.connected) return { player: existing };
      return { error: 'Someone already has that name' };
    }
    if (this.players.size >= MAX_PLAYERS) return { error: 'The game is full' };

    const taken = new Set(this.active().map((p) => p.color));
    const color = [...Array(COLORS).keys()].find((c) => !taken.has(c)) ?? 0;
    const player = {
      id: crypto.randomUUID(), key: `p${this.nextKey++}`, name, age, color,
      connected: true, socketId: null, critter: null, stars: 0, gameStars: {},
    };
    // Joining mid-game: a stand-in critter until they draw their own (they can, anytime).
    if (!['lobby', 'draw'].includes(this.phase)) {
      player.critter = defaultDrawing(color);
      player.autoCritter = true;
    }
    this.players.set(player.id, player);
    return { player };
  }

  // ---------- controls (TV buttons or the VIP's phone) ----------

  control(type, arg) {
    switch (type) {
      case 'theme': return this.setTheme(arg);
      case 'toggleTheme': return this.setTheme(this.theme === 'halloween' ? 'sunny' : 'halloween');
      case 'start': return this.start();
      case 'skip': return this.skip();
      case 'playAgain': return this.playAgain();
      default: return 'Unknown action';
    }
  }

  setTheme(theme) {
    if (!THEMES.includes(theme)) return 'Unknown theme';
    if (this.phase !== 'lobby') return 'Pick the theme before starting';
    this.theme = theme;
    return null;
  }

  start() {
    if (this.phase !== 'lobby') return 'Already playing';
    if (!this.players.size) return 'Waiting for players';
    this.reset();
    // Hide & seek needs someone to hide and someone to seek.
    this.games = GAMES.filter((g) => g !== 'seek' || this.players.size >= 2);
    this.phase = 'draw';
    this.setTimer(SECONDS.draw, () => this.beginMeet());
    return null;
  }

  playAgain() {
    if (this.phase !== 'parade') return 'Not finished yet';
    this.reset();
    return this.start();
  }

  skip() {
    switch (this.phase) {
      case 'draw': this.beginMeet(); break;
      case 'meet': this.nextGame(); break;
      case 'intro': this.beginPlay(); break;
      case 'play':
        if (this.game === 'seek') this.endSeekRound(null);
        else this.finishGame({});
        break;
      case 'results': this.nextGame(); break;
      default: return 'Nothing to skip';
    }
    return null;
  }

  // ---------- drawing & meeting the critters ----------

  submitDrawing(p, drawing) {
    // Late joiners (and kids who ran out of drawing time) can draw their critter later.
    if (this.phase !== 'draw' && !p.autoCritter) return 'Drawing time is over';
    const d = validDrawing(drawing);
    if (!d) return 'Draw something first!';
    p.critter = d;
    p.autoCritter = false;
    if (this.phase === 'draw' && this.connected().every((x) => x.critter)) this.beginMeet();
    return null;
  }

  beginMeet() {
    if (this.phase !== 'draw') return;
    for (const p of this.players.values()) {
      if (!p.critter) {
        p.critter = defaultDrawing(p.color);
        p.autoCritter = true;
      }
    }
    this.phase = 'meet';
    this.setTimer(Math.max(5, this.players.size * SECONDS.meetPer + 1.5), () => this.nextGame());
  }

  // ---------- mini-games ----------

  nextGame() {
    this.gameIdx++;
    this.results = null;
    this.seek = null;
    if (this.gameIdx >= this.games.length) {
      this.phase = 'parade';
      this.clearTimer();
      return;
    }
    this.game = this.games[this.gameIdx];
    this.phase = 'intro';
    this.setTimer(SECONDS.intro, () => this.beginPlay());
  }

  beginPlay() {
    if (this.phase !== 'intro') return;
    this.phase = 'play';
    // Everyone here now plays this game; anyone joining mid-game waits for the next.
    this.participants = new Set(this.active().map((p) => p.id));
    if (this.game === 'seek') {
      const hiders = shuffle(this.connected()).slice(0, SECONDS.maxSeekRounds).map((p) => p.id);
      this.seek = { hiders, round: 0, hiderId: null, spot: null, stage: 'hide', finderId: null, tally: {} };
      this.startSeekRound();
    } else {
      this.setTimer(SECONDS.play[this.game] + 6, () => this.finishGame({}));
    }
  }

  // The TV reports how each kid did, as 0..1 scores keyed by public player key.
  hostResult(game, scores) {
    if (this.phase !== 'play' || game !== this.game || game === 'seek') return 'Not now';
    const byId = {};
    for (const [key, score] of Object.entries(scores || {})) {
      const p = this.byKey(key);
      if (p && Number.isFinite(score)) byId[p.id] = Math.max(0, Math.min(1, score));
    }
    this.finishGame(byId);
    return null;
  }

  finishGame(scoresById, starsById = null) {
    const stars = {};
    for (const p of this.players.values()) {
      if (!this.participants.has(p.id)) continue;
      const s = starsById ? starsById[p.id] || 1 : starsFor(scoresById[p.id] || 0);
      p.gameStars[this.game] = s;
      p.stars += s;
      stars[p.key] = s;
    }
    this.results = { game: this.game, stars };
    this.phase = 'results';
    this.setTimer(SECONDS.results, () => this.nextGame());
  }

  // ---------- flashlight hide & seek ----------

  startSeekRound() {
    const s = this.seek;
    s.hiderId = s.hiders[s.round];
    s.spot = null;
    s.finderId = null;
    s.stage = 'hide';
    this.setTimer(SECONDS.seekHide, () => {
      // Too slow to choose? The critter hides itself.
      if (s.spot === null) s.spot = Math.floor(Math.random() * SPOTS);
      this.beginSeeking();
    });
  }

  hide(p, spot) {
    const s = this.seek;
    if (this.phase !== 'play' || !s || s.stage !== 'hide') return 'Not hiding now';
    if (p.id !== s.hiderId) return "It's not your turn to hide";
    if (!Number.isInteger(spot) || spot < 0 || spot >= SPOTS) return 'Pick a hiding spot';
    s.spot = spot;
    this.beginSeeking();
    return null;
  }

  beginSeeking() {
    this.seek.stage = 'seek';
    this.setTimer(SECONDS.seekSeek, () => this.endSeekRound(null));
  }

  hostFound(finderKey) {
    const s = this.seek;
    if (this.phase !== 'play' || !s || s.stage !== 'seek') return 'Not seeking now';
    const finder = this.byKey(finderKey);
    if (!finder || finder.id === s.hiderId) return 'Bad finder';
    this.endSeekRound(finder.id);
    return null;
  }

  endSeekRound(finderId) {
    const s = this.seek;
    if (!s || s.stage === 'reveal') return;
    if (s.spot === null) s.spot = Math.floor(Math.random() * SPOTS);
    s.stage = 'reveal';
    s.finderId = finderId;
    const add = (id, n) => { s.tally[id] = (s.tally[id] || 0) + n; };
    if (finderId) add(finderId, 3);
    add(s.hiderId, finderId ? 1 : 3);
    this.setTimer(SECONDS.seekReveal, () => {
      s.round++;
      if (s.round < s.hiders.length) this.startSeekRound();
      else this.finishSeek();
    });
  }

  finishSeek() {
    const stars = {};
    for (const p of this.players.values()) {
      const t = this.seek.tally[p.id] || 0;
      stars[p.id] = t >= 3 ? 3 : t >= 1 ? 2 : 1;
    }
    this.finishGame({}, stars);
  }

  // ---------- views ----------

  publicPlayer(p, vip) {
    return {
      key: p.key, name: p.name, age: p.age, color: p.color, connected: p.connected,
      vip: p.id === vip, critter: p.critter, drawn: this.phase === 'draw' ? !!p.critter : undefined,
      auto: !!p.autoCritter,
      waiting: this.phase === 'play' && !this.participants.has(p.id),
      stars: p.stars, gameStars: p.gameStars,
    };
  }

  baseView() {
    const vip = this.vipId;
    const v = {
      code: this.code,
      theme: this.theme,
      phase: this.phase,
      game: this.game,
      games: this.games,
      gameIdx: this.gameIdx,
      gameSeconds: this.game && SECONDS.play[this.game],
      deadline: this.deadline,
      duration: this.duration,
      now: Date.now(),
      maxPlayers: MAX_PLAYERS,
      players: this.active().map((p) => this.publicPlayer(p, vip)),
      results: this.results,
    };
    if (this.seek) {
      const s = this.seek;
      v.seek = {
        round: s.round,
        rounds: s.hiders.length,
        stage: s.stage,
        hider: this.players.get(s.hiderId)?.key,
        finder: s.finderId ? this.players.get(s.finderId)?.key : null,
        spot: s.stage === 'reveal' ? s.spot : null,
      };
    }
    return v;
  }

  // The TV needs to know where the critter hid so it can draw it.
  hostView() {
    const v = this.baseView();
    if (this.seek) v.seek.spot = this.seek.spot;
    return v;
  }

  playerView(id) {
    const p = this.players.get(id);
    if (!p) return null;
    const v = this.baseView();
    v.me = { id: p.id, key: p.key, name: p.name, age: p.age, color: p.color, vip: p.id === this.vipId };
    if (this.seek && this.seek.hiderId === p.id) v.seek.spot = this.seek.spot;
    return v;
  }
}

module.exports = { Room, GAMES, SECONDS, DRAW, THEMES, defaultTheme, starsFor, validDrawing };
