// All sound is synthesized with Web Audio (no audio files): original tunes in
// classic American styles plus game-show sound effects.
//
// Music follows the screen (sound.scene) and the theme (sound.setTheme):
//   lobby -> rock-'n'-roll boogie    | Halloween: finger-snapping spooky swing
//   game  -> banjo hoedown           | Halloween: haunted hoedown (minor)
//   party -> brass marching band     | Halloween: monster march
// Browsers only allow audio after a gesture; the TV app and Chromecast allow it anyway.
const sound = (() => {
  const KEY = 'critters-sound';
  let ctx = null;
  let master = null;
  let musicGain = null;
  let songGain = null; // per-song loudness, between the notes and musicGain
  let enabled = true;
  let musicOn = false;
  let musicTimer = null;
  let theme = 'sunny';
  let scene = 'lobby';
  let song = null;
  let pos = { bar: 0, step: 0, chorus: 0, time: 0 };
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch {}

  // ---------------- instruments (work on any AudioContext, live or offline) ----------------

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const noiseBufs = new WeakMap();
  const pluckBufs = new Map();

  function noiseBuf(c) {
    if (!noiseBufs.has(c)) {
      const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBufs.set(c, b);
    }
    return noiseBufs.get(c);
  }

  function env(c, t, peak, attack, dur, dest) {
    // Exponential ramps can't reach exactly zero, so keep every level above it.
    peak = Math.max(peak, 0.0002);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }

  function osc(c, type, freq, t, dur, dest, detune = 0) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  function noise(c, t, dur, dest, { type = 'bandpass', freq = 1500, q = 1, vol = 0.3, sweep = null } = {}) {
    const src = c.createBufferSource();
    src.buffer = noiseBuf(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    src.connect(f).connect(env(c, t, vol, 0.004, dur, dest));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // Plucked strings (banjo, guitar) with the Karplus-Strong trick, cached per note.
  function pluckBuffer(c, freq, decay) {
    const key = `${c.sampleRate}:${Math.round(freq)}:${decay}`;
    if (pluckBufs.has(key)) return pluckBufs.get(key);
    const sr = c.sampleRate;
    const n = Math.floor(sr * 1.2);
    const b = c.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const next = (idx + 1) % period;
      d[i] = line[idx];
      line[idx] = decay * 0.5 * (line[idx] + line[next]);
      idx = next;
    }
    pluckBufs.set(key, b);
    return b;
  }

  const I = {
    pluck(c, dest, t, m, vol = 0.35, { decay = 0.994, dur = 0.9, twang = 2200 } = {}) {
      const src = c.createBufferSource();
      src.buffer = pluckBuffer(c, mtof(m), decay);
      const f = c.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = twang;
      f.gain.value = 6;
      src.connect(f).connect(env(c, t, vol, 0.002, dur, dest));
      src.start(t);
      src.stop(t + dur + 0.05);
    },
    banjo(c, dest, t, m, vol = 0.3) { I.pluck(c, dest, t, m, vol, { decay: 0.986, dur: 0.45, twang: 2600 }); },
    guitar(c, dest, t, m, vol = 0.25, dur = 0.5) { I.pluck(c, dest, t, m, vol, { decay: 0.996, dur, twang: 1400 }); },
    piano(c, dest, t, m, vol = 0.18, dur = 0.5) {
      const g = env(c, t, vol, 0.004, dur, dest);
      osc(c, 'triangle', mtof(m), t, dur, g);
      osc(c, 'sine', mtof(m + 12), t, dur * 0.6, env(c, t, vol * 0.5, 0.004, dur * 0.6, dest));
    },
    bass(c, dest, t, m, vol = 0.45, dur = 0.3) {
      const g = env(c, t, vol, 0.006, dur, dest);
      osc(c, 'triangle', mtof(m), t, dur, g);
      osc(c, 'sine', mtof(m), t, dur, g);
    },
    // Brass: a sawtooth whose filter opens on attack (trumpet, sax-ish, tuba).
    brass(c, dest, t, m, vol = 0.16, dur = 0.3, { bright = 2600, vib = 5 } = {}) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(bright * 0.2, t);
      f.frequency.exponentialRampToValueAtTime(bright, t + 0.05);
      f.frequency.exponentialRampToValueAtTime(bright * 0.5, t + dur);
      f.connect(env(c, t, vol, 0.03, dur, dest));
      const o = osc(c, 'sawtooth', mtof(m), t, dur, f);
      const o2 = osc(c, 'sawtooth', mtof(m), t, dur, f, 7);
      if (vib && dur > 0.3) {
        const lfo = c.createOscillator();
        const lg = c.createGain();
        lfo.frequency.value = vib;
        lg.gain.value = 6;
        lfo.connect(lg);
        lg.connect(o.detune);
        lg.connect(o2.detune);
        lfo.start(t + 0.12);
        lfo.stop(t + dur + 0.05);
      }
    },
    tuba(c, dest, t, m, vol = 0.3, dur = 0.25) { I.brass(c, dest, t, m, vol, dur, { bright: 700, vib: 0 }); },
    organ(c, dest, t, m, vol = 0.1, dur = 0.4) {
      const g = env(c, t, vol, 0.01, dur, dest);
      osc(c, 'square', mtof(m), t, dur, g, -6);
      osc(c, 'sine', mtof(m + 12), t, dur, g, 6);
      osc(c, 'sine', mtof(m - 12), t, dur, g);
    },
    kick(c, dest, t, vol = 0.7) {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
      o.connect(env(c, t, vol, 0.002, 0.18, dest));
      o.start(t);
      o.stop(t + 0.2);
    },
    snare(c, dest, t, vol = 0.3) {
      noise(c, t, 0.16, dest, { freq: 1900, q: 0.7, vol });
      osc(c, 'triangle', 190, t, 0.06, env(c, t, vol * 0.6, 0.002, 0.06, dest));
    },
    brush(c, dest, t, vol = 0.12) { noise(c, t, 0.09, dest, { freq: 3000, q: 0.5, vol }); },
    hat(c, dest, t, vol = 0.08, open = false) { noise(c, t, open ? 0.22 : 0.045, dest, { type: 'highpass', freq: 7000, vol }); },
    ride(c, dest, t, vol = 0.06) { noise(c, t, 0.35, dest, { type: 'highpass', freq: 5000, vol }); },
    crash(c, dest, t, vol = 0.25) { noise(c, t, 1.6, dest, { type: 'highpass', freq: 4000, vol }); },
    snap(c, dest, t, vol = 0.35) { noise(c, t, 0.035, dest, { freq: 2600, q: 3, vol }); },
    woodblock(c, dest, t, vol = 0.2) { osc(c, 'sine', 950, t, 0.06, env(c, t, vol, 0.001, 0.06, dest)); },
    bell(c, dest, t, m, vol = 0.15, dur = 0.7) {
      osc(c, 'sine', mtof(m), t, dur, env(c, t, vol, 0.002, dur, dest));
      osc(c, 'sine', mtof(m) * 2.76, t, dur * 0.4, env(c, t, vol * 0.3, 0.002, dur * 0.4, dest));
    },
  };

  // ---------------- songs (original compositions) ----------------

  const CHORDS = {
    C: [48, [0, 4, 7]], C7: [48, [0, 4, 7, 10]], F: [53, [0, 4, 7]], F7: [53, [0, 4, 7, 10]],
    G: [55, [0, 4, 7]], G7: [55, [0, 4, 7, 10]], D: [50, [0, 4, 7]], D7: [50, [0, 4, 7, 10]],
    Am: [57, [0, 3, 7]], Dm: [50, [0, 3, 7]], E: [52, [0, 4, 7]], E7: [52, [0, 4, 7, 10]],
  };
  const _ = null;

  const SONGS = {
    // 🎸 Rock-'n'-roll Hop: 12-bar boogie in C with a sax-like lead.
    rock: {
      style: 'rock', bpm: 168, gain: 0.55, swing: 0.3,
      prog: ['C', 'C', 'C', 'C', 'F7', 'F7', 'C', 'C', 'G7', 'F7', 'C', 'G7'],
      melody: [
        [67, _, 67, 69, 67, _, 64, _], [60, _, 62, 64, 67, _, _, _], [67, _, 67, 69, 70, 69, 67, _], [64, _, 62, _, 60, _, _, _],
        [72, _, 72, 74, 72, _, 69, _], [65, _, 67, 69, 72, _, _, _], [67, _, 67, 69, 67, _, 64, _], [60, _, _, _, _, _, _, _],
        [71, _, 71, _, 74, _, 71, _], [72, _, 69, _, 65, _, _, _], [67, 69, 67, 64, 60, _, 62, _], [67, _, _, _, 59, _, _, _],
      ],
    },
    // 🪕 Critter Hoedown: fast banjo rolls over boom-chick bass.
    hoedown: {
      style: 'hoedown', bpm: 200, gain: 0.95, swing: 0,
      prog: ['G', 'G', 'C', 'C', 'D7', 'D7', 'G', 'G'],
      melody: [
        [74, _, 71, _, 74, 76, 74, _], [71, _, 67, _, 71, _, _, _], [72, _, 76, _, 79, 76, 72, _], [76, _, 72, _, _, _, _, _],
        [74, 76, 78, _, 81, _, 78, _], [74, _, 72, _, 69, _, _, _], [67, 69, 71, 72, 74, _, 71, _], [67, _, _, _, 55, _, _, _],
      ],
    },
    // 🎺 Critter Parade March: tuba oom-pahs, snare and a trumpet tune.
    march: {
      style: 'march', bpm: 120, gain: 1.15, swing: 0,
      prog: ['C', 'F', 'C', 'G', 'C', 'F', 'G7', 'C'],
      melody: [
        [67, _, 72, _, 71, 72, 74, _], [72, _, 69, _, 65, _, 69, _], [67, _, 64, _, 67, 72, 76, _], [74, _, _, _, 71, _, 67, _],
        [67, _, 72, _, 71, 72, 74, _], [77, _, 76, _, 74, _, 72, _], [71, _, 74, _, 79, _, 71, _], [72, _, _, _, 60, _, _, _],
      ],
    },
    // 🎃 Spooky Swing: minor 12-bar with walking bass, finger snaps and organ.
    spookySwing: {
      style: 'swing', bpm: 150, gain: 0.6, swing: 0.33,
      prog: ['Am', 'Am', 'Am', 'Am', 'Dm', 'Dm', 'Am', 'Am', 'E7', 'Dm', 'Am', 'E7'],
      melody: [
        [69, _, 72, _, 74, 75, 76, _], [76, _, 74, _, 72, _, 69, _], [69, _, 72, _, 74, 75, 76, _], [79, _, 76, _, _, _, _, _],
        [74, _, 77, _, 79, 80, 81, _], [81, _, 79, _, 77, _, 74, _], [69, _, 72, _, 74, 75, 76, _], [72, _, 69, _, _, _, _, _],
        [71, _, 68, _, 64, _, 68, _], [74, _, 72, _, 69, _, _, _], [69, 72, 76, 72, 69, _, 64, _], [68, _, 71, _, 64, _, _, _],
      ],
    },
    // 🎃 Haunted Hoedown: the banjo goes minor.
    hauntedHoedown: {
      style: 'hoedown', bpm: 190, gain: 0.95, swing: 0,
      prog: ['Am', 'Am', 'G', 'G', 'F', 'F', 'E', 'E'],
      melody: [
        [76, _, 72, _, 76, 77, 76, _], [72, _, 69, _, 72, _, _, _], [74, _, 71, _, 74, 76, 74, _], [71, _, 67, _, _, _, _, _],
        [72, 74, 76, _, 77, _, 76, _], [72, _, 69, _, 65, _, _, _], [68, 69, 71, 72, 74, _, 71, _], [68, _, _, _, 64, _, _, _],
      ],
    },
    // 🎃 Monster March: the marching band, in a minor key.
    monsterMarch: {
      style: 'march', bpm: 116, gain: 1.2, swing: 0,
      prog: ['Am', 'Dm', 'E', 'Am', 'Am', 'Dm', 'E7', 'Am'],
      melody: [
        [69, _, 76, _, 74, 76, 77, _], [77, _, 74, _, 69, _, 74, _], [76, _, 71, _, 68, _, 71, _], [69, _, _, _, 64, _, _, _],
        [72, _, 76, _, 74, 76, 77, _], [81, _, 77, _, 74, _, 77, _], [76, _, 80, _, 83, _, 80, _], [81, _, _, _, 69, _, _, _],
      ],
    },
  };

  const SCENE_SONGS = {
    sunny: { lobby: 'rock', game: 'hoedown', party: 'march' },
    halloween: { lobby: 'spookySwing', game: 'hauntedHoedown', party: 'monsterMarch' },
  };

  // Schedule one eighth-note step of a song at time t.
  function playStep(c, dest, s, bar, step, chorus, t) {
    const [root, tones] = CHORDS[s.prog[bar]];
    const note = s.melody && s.melody[bar % s.melody.length][step];
    const beat = 60 / s.bpm;
    switch (s.style) {
      case 'rock': {
        if (step % 4 === 0) I.kick(c, dest, t);
        if (step % 4 === 2) { I.snare(c, dest, t); I.piano(c, dest, t, root + 12 + tones[1], 0.1, 0.18); I.piano(c, dest, t, root + 12 + tones[2], 0.1, 0.18); }
        I.hat(c, dest, t, step % 2 ? 0.05 : 0.08);
        // Boogie-woogie bass: up and down the chord, one note per eighth.
        const boogie = [0, 4, 7, 9, 10, 9, 7, 4];
        I.bass(c, dest, t, root - 12 + boogie[step], 0.4, beat * 0.45);
        if (note && chorus % 2 === 1) I.brass(c, dest, t, note, 0.12, beat * 0.9, { bright: 1800 });
        else if (note && step % 2 === 0) I.piano(c, dest, t, note, 0.12, beat * 0.8);
        break;
      }
      case 'hoedown': {
        // Boom (root, then fifth) and chick (a muted strum) on the off-beats.
        if (step === 0) I.bass(c, dest, t, root - 12, 0.45, beat * 0.5);
        if (step === 4) I.bass(c, dest, t, root - 5, 0.45, beat * 0.5);
        if (step % 4 === 2) { tones.forEach((iv) => I.guitar(c, dest, t, root + iv, 0.1, 0.12)); I.brush(c, dest, t); }
        // Banjo rolls through the chord; the tune rides on top every other time round.
        const roll = [0, 1, 2, 0, 1, 2, 0, 1];
        I.banjo(c, dest, t, root + 12 + tones[roll[step] % tones.length] + (step >= 6 ? 12 : 0), 0.22);
        if (note && chorus % 2 === 1) I.banjo(c, dest, t, note, 0.3);
        break;
      }
      case 'march': {
        if (step === 0) { I.kick(c, dest, t, 0.6); I.tuba(c, dest, t, root - 12); }
        if (step === 4) { I.kick(c, dest, t, 0.5); I.tuba(c, dest, t, root - 5); }
        if (step % 4 === 2) tones.forEach((iv) => I.brass(c, dest, t, root + iv, 0.05, beat * 0.4, { bright: 1200, vib: 0 }));
        // Snare: steady with a little roll at the end of each bar.
        if (step % 2 === 0 || step === 7) I.snare(c, dest, t, step === 7 ? 0.18 : 0.22);
        if (step === 7) I.snare(c, dest, t + beat / 4, 0.16);
        if (bar % 4 === 0 && step === 0) I.crash(c, dest, t, 0.15);
        if (note) I.brass(c, dest, t, note, 0.13, beat * 0.95);
        break;
      }
      case 'swing': {
        // Walking bass on every beat; snaps and ride cymbal keep the swing.
        if (step % 2 === 0) {
          const walk = [0, tones[1], 7, step === 6 ? 11 : 9];
          I.bass(c, dest, t, root - 12 + walk[step / 2], 0.42, beat * 0.9);
          I.ride(c, dest, t);
        }
        if (step === 2 || step === 6) I.snap(c, dest, t);
        if (note) I.organ(c, dest, t, note, 0.07, beat * 0.9);
        break;
      }
    }
  }

  // ---------------- live music scheduler ----------------

  const songFor = () => SONGS[SCENE_SONGS[theme][scene]];

  function schedule() {
    if (!ready() || !song) return;
    const eighth = 60 / song.bpm / 2;
    while (pos.time < ctx.currentTime + 0.3) {
      const swing = pos.step % 2 ? song.swing * eighth : 0;
      playStep(ctx, songGain, song, pos.bar, pos.step, pos.chorus, pos.time + swing);
      pos.time += eighth;
      pos.step++;
      if (pos.step >= 8) {
        pos.step = 0;
        pos.bar++;
        if (pos.bar >= song.prog.length) { pos.bar = 0; pos.chorus++; }
        // Switch songs on a bar line when the screen or theme changes.
        const want = songFor();
        if (want !== song) {
          song = want;
          songGain.gain.setValueAtTime(song.gain || 1, pos.time);
          pos = { bar: 0, step: 0, chorus: 0, time: pos.time + eighth };
        }
      }
    }
  }

  function startSong() {
    song = songFor();
    songGain.gain.setValueAtTime(song.gain || 1, ctx.currentTime);
    pos = { bar: 0, step: 0, chorus: 0, time: ctx.currentTime + 0.05 };
  }

  // ---------------- sound effects ----------------

  function sfxPlay(name, ...args) {
    if (!ready()) return;
    sfxAt(ctx, master, ctx.currentTime + 0.01, name, args);
  }

  function sfxAt(c, d, t, name, args = []) {
    switch (name) {
      case 'pop': // balloon pop + slide whistle down
        noise(c, t, 0.2, d, { freq: 2500, q: 0.5, vol: 0.8, sweep: 400 });
        slide(c, d, t + 0.05, 1500, 350, 0.4);
        break;
      case 'boing': slide(c, d, t, 400, 1300, 0.3); break; // slide whistle up
      case 'star': I.bell(c, d, t, 88, 0.16); I.bell(c, d, t + 0.12, 93, 0.16); break; // game-show "ding-ding"
      case 'sparkle': [84, 88, 91, 96].forEach((m, i) => I.bell(c, d, t + i * 0.07, m, 0.1, 0.5)); break;
      case 'stars': [0, 1, 2].forEach((i) => sfxAt(c, d, t + i * 0.45, 'star')); break;
      case 'whoosh': noise(c, t, 0.5, d, { freq: 400, sweep: 3000, vol: 0.3 }); break;
      case 'tick': I.woodblock(c, d, t, 0.18); break;
      case 'hello': kazoo(c, d, t, 64 + Math.floor(Math.random() * 8)); break; // a kazoo "hey!"
      case 'puff': // the dragon caught someone: a goofy sad trombone
        [62, 61, 60].forEach((m, i) => I.brass(c, d, t + i * 0.3, m, 0.16, 0.28, { bright: 1100, vib: 0 }));
        I.brass(c, d, t + 0.9, 59, 0.16, 0.9, { bright: 1100, vib: 6 });
        noise(c, t, 0.4, d, { type: 'lowpass', freq: 800, vol: 0.3 });
        break;
      case 'roar':
        noise(c, t, 0.9, d, { type: 'lowpass', freq: 500, sweep: 200, vol: 0.45 });
        I.brass(c, d, t, 40, 0.25, 0.9, { bright: 600, vib: 8 });
        break;
      case 'yawn': slide(c, d, t, 520, 240, 1.0, 0.12); break;
      case 'snore': noise(c, t, 0.8, d, { type: 'lowpass', freq: 300, sweep: 600, vol: 0.12 }); break;
      case 'drumroll': {
        const len = args[0] || 1.4;
        for (let x = 0; x < len; x += 0.045) I.snare(c, d, t + x, 0.05 + 0.15 * (x / len));
        break;
      }
      case 'crash': I.crash(c, d, t, 0.35); I.kick(c, d, t, 0.6); break;
      case 'applause': applause(c, d, t, args[0] || 1.8); break;
      case 'cheer': // crowd "yay!" + applause + a brass stab
        yay(c, d, t);
        applause(c, d, t + 0.1, 1.6);
        [60, 64, 67, 72].forEach((m) => I.brass(c, d, t, m, 0.07, 0.5, { vib: 0 }));
        break;
      case 'fanfare': // ta-da-da-DAAA + cymbal
        [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 1.1]]
          .forEach(([m, at, dur]) => [m, m - 12].forEach((n) => I.brass(c, d, t + at, n, 0.12, dur)));
        I.crash(c, d, t + 0.45, 0.3);
        I.kick(c, d, t + 0.45, 0.6);
        break;
      case 'found': sfxAt(c, d, t, 'sparkle'); yay(c, d, t + 0.15); break;
      default: break;
    }
  }

  function slide(c, d, t, from, to, dur, vol = 0.18) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 9;
    lg.gain.value = 25;
    lfo.connect(lg).connect(o.frequency);
    o.connect(env(c, t, vol, 0.02, dur, d));
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  function kazoo(c, d, t, m) {
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 2;
    f.connect(env(c, t, 0.4, 0.02, 0.35, d));
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(mtof(m), t);
    o.frequency.exponentialRampToValueAtTime(mtof(m + 5), t + 0.12);
    o.frequency.exponentialRampToValueAtTime(mtof(m + 2), t + 0.3);
    o.connect(f);
    o.start(t);
    o.stop(t + 0.4);
  }

  function yay(c, d, t) {
    // A crowd of voices: several detuned "yay" glides through a vowel-ish filter.
    for (let k = 0; k < 6; k++) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(700, t);
      f.frequency.exponentialRampToValueAtTime(1800, t + 0.5);
      f.Q.value = 3;
      f.connect(env(c, t, 0.05, 0.05, 0.8, d));
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const base = 260 + Math.random() * 200;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.4, t + 0.35);
      o.connect(f);
      o.start(t + Math.random() * 0.05);
      o.stop(t + 0.85);
    }
  }

  function applause(c, d, t, len) {
    for (let x = 0; x < len; x += 0.012) {
      const fade = x < len * 0.2 ? x / (len * 0.2) : 1 - (x - len * 0.2) / (len * 0.8);
      if (fade < 0.02) continue;
      noise(c, t + x + Math.random() * 0.01, 0.02, d, { freq: 1500 + Math.random() * 2500, q: 1.5, vol: 0.06 * Math.max(0, fade) });
    }
  }

  // ---------------- public API ----------------

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.8 : 0;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.22;
      musicGain.connect(master);
      songGain = ctx.createGain();
      songGain.connect(musicGain);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function ready() {
    return ctx && ctx.state === 'running';
  }

  function music(on) {
    if (on === musicOn) return;
    musicOn = on;
    clearInterval(musicTimer);
    if (on && ctx) {
      startSong();
      musicTimer = setInterval(schedule, 100);
    }
  }

  // Quieter music during mic games so it doesn't count as a kid's noise.
  function musicLevel(v) {
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(v * 1.2, ctx.currentTime, 0.15);
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
    if (master) master.gain.value = on ? 0.8 : 0;
  }

  // Renders a song or the sound effects offline (for previews and tests).
  async function renderPreview(what, seconds = 20, rate = 22050) {
    const c = new OfflineAudioContext(1, rate * seconds, rate);
    const out = c.createGain();
    out.gain.value = 0.8;
    out.connect(c.destination);
    if (SONGS[what]) {
      const s = SONGS[what];
      out.gain.value = 0.8 * (s.gain || 1);
      const eighth = 60 / s.bpm / 2;
      let bar = 0; let step = 0; let chorus = 0;
      for (let t = 0.05; t < seconds - 0.5; t += eighth) {
        playStep(c, out, s, bar, step, chorus, t + (step % 2 ? s.swing * eighth : 0));
        if (++step >= 8) { step = 0; if (++bar >= s.prog.length) { bar = 0; chorus++; } }
      }
    } else if (Array.isArray(what)) {
      // A list of [secondsFromStart, effectName, ...args] for a sound-effects demo.
      for (const [at, name, ...args] of what) sfxAt(c, out, at, name, args);
    }
    return c.startRendering();
  }

  return {
    unlock,
    ready,
    music,
    musicLevel,
    play: sfxPlay,
    setTheme(t) { theme = SCENE_SONGS[t] ? t : 'sunny'; },
    scene(s) { scene = SCENE_SONGS.sunny[s] ? s : 'lobby'; },
    get enabled() { return enabled; },
    setEnabled,
    renderPreview,
    songs: Object.keys(SONGS),
    // Exposed so the preview script can render sound effects offline too.
    _offline: { I, playStep, SONGS },
  };
})();
