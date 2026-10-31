// Synthesized sound effects and an original cheerful loop (no audio files).
// Browsers only allow audio after a gesture; the TV app and Chromecast allow it anyway.
const sound = (() => {
  const KEY = 'critters-sound';
  let ctx = null;
  let master = null;
  let musicGain = null;
  let enabled = true;
  let musicOn = false;
  let musicTimer = null;
  let nextBeat = 0;
  let beat = 0;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch {}

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.8 : 0;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.18;
      musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  const ready = () => ctx && ctx.state === 'running';

  function tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, at = 0, slide = null, dest = null }) {
    if (!ready()) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.3, at = 0, filter = 1200, type = 'lowpass', sweep = null }) {
    if (!ready()) return;
    const t = ctx.currentTime + at;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  const sfx = {
    pop: () => { noise({ dur: 0.25, vol: 0.7, filter: 3000, sweep: 300 }); tone({ freq: 300, slide: 80, dur: 0.15, vol: 0.4 }); },
    boing: () => tone({ freq: 220, slide: 660, dur: 0.3, vol: 0.3, type: 'triangle' }),
    sparkle: () => [1319, 1568, 2093, 2637].forEach((f, i) => tone({ freq: f, dur: 0.25, vol: 0.12, type: 'triangle', at: i * 0.06 })),
    star: () => [988, 1319].forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.16, type: 'triangle', at: i * 0.09 })),
    whoosh: () => noise({ dur: 0.5, vol: 0.3, filter: 400, sweep: 3000, type: 'bandpass' }),
    tick: () => tone({ freq: 1400, dur: 0.04, vol: 0.1, type: 'square' }),
    // A squeaky "hello" chirp with a random pitch per critter.
    hello: () => {
      const base = 500 + Math.random() * 500;
      tone({ freq: base, slide: base * 1.5, dur: 0.12, vol: 0.2, type: 'square' });
      tone({ freq: base * 1.2, slide: base * 0.9, dur: 0.16, vol: 0.2, type: 'square', at: 0.13 });
    },
    puff: () => { noise({ dur: 0.6, vol: 0.5, filter: 900, sweep: 150 }); tone({ freq: 90, slide: 50, dur: 0.4, vol: 0.4 }); },
    roar: () => { noise({ dur: 0.9, vol: 0.45, filter: 500, sweep: 200 }); tone({ freq: 110, slide: 70, dur: 0.9, vol: 0.35, type: 'sawtooth' }); },
    yawn: () => tone({ freq: 380, slide: 160, dur: 1.0, vol: 0.18, type: 'sine' }),
    snore: () => noise({ dur: 0.8, vol: 0.12, filter: 300, sweep: 600 }),
    cheer: () => {
      noise({ dur: 1.2, vol: 0.18, filter: 2500, type: 'bandpass' });
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.35, vol: 0.15, type: 'triangle', at: i * 0.1 }));
    },
    fanfare: () => [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45], [784, 0.62], [1047, 0.78]]
      .forEach(([f, at]) => tone({ freq: f, dur: at > 0.7 ? 0.8 : 0.2, vol: 0.18, type: 'triangle', at })),
    found: () => { sfx.sparkle(); tone({ freq: 784, slide: 1568, dur: 0.3, vol: 0.2, type: 'triangle', at: 0.2 }); },
  };

  // Original bouncy loop in C major: plucky bass and a little melody.
  const BASS = [130.8, 0, 196, 0, 174.6, 0, 196, 0, 130.8, 0, 196, 0, 220, 0, 196, 0];
  const MELODY = [523, 0, 659, 784, 0, 659, 587, 0, 523, 587, 659, 0, 784, 0, 659, 0];
  const STEP = 0.2;

  function schedule() {
    if (!ready()) return;
    while (nextBeat < ctx.currentTime + 0.4) {
      const at = nextBeat - ctx.currentTime;
      const b = BASS[beat % BASS.length];
      const m = MELODY[beat % MELODY.length];
      if (b) tone({ freq: b, type: 'triangle', dur: STEP * 0.9, vol: 0.5, at, dest: musicGain });
      if (m && Math.floor(beat / 16) % 2 === 1) tone({ freq: m, type: 'sine', dur: STEP * 0.8, vol: 0.25, at, dest: musicGain });
      nextBeat += STEP;
      beat++;
    }
  }

  function music(on) {
    if (on === musicOn) return;
    musicOn = on;
    clearInterval(musicTimer);
    if (on && ctx) {
      nextBeat = ctx.currentTime + 0.05;
      musicTimer = setInterval(schedule, 100);
    }
  }

  // Quieter music during mic games so it doesn't count as a kid's noise.
  function musicLevel(v) {
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(v, ctx.currentTime, 0.15);
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
    if (master) master.gain.value = on ? 0.8 : 0;
  }

  return {
    unlock,
    ready,
    music,
    musicLevel,
    play: (name, ...args) => sfx[name] && sfx[name](...args),
    get enabled() { return enabled; },
    setEnabled,
  };
})();
