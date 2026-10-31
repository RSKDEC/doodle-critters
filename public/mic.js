// Turns the phone's microphone into a 0..1 "effort" value: how hard a kid is
// blowing or how loud they are, above the room's background noise.
// Falls back to a big hold-to-blow button when there's no microphone.
const mic = (() => {
  const params = new URLSearchParams(location.search);
  let ctx = null;
  let analyser = null;
  let buf = null;
  let floor = 0.25;
  let ok = false;
  let held = false;
  let smooth = 0;

  // Tests drive the "microphone" with window.__fakeEffort.
  if (params.has('fakemic')) ok = true;

  async function enable() {
    if (ok) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      buf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      ok = true;
    } catch {
      ok = false;
    }
    return ok;
  }

  // Loudness as 0..1 on a decibel scale (-70 dB .. -10 dB).
  function loudness() {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
    return Math.max(0, Math.min(1, (db + 70) / 60));
  }

  function effort() {
    if (held) return 0.7;
    if (params.has('fakemic')) return window.__fakeEffort || 0;
    if (!ok || !analyser) return 0;
    if (ctx.state === 'suspended') ctx.resume();
    const l = loudness();
    // Background noise: snap down to quiet moments, creep up slowly.
    floor = l < floor ? l : floor + 0.0015;
    const raw = Math.max(0, Math.min(1, (l - floor - 0.08) / Math.max(0.2, 0.9 - floor)));
    smooth = smooth * 0.5 + raw * 0.5;
    return smooth;
  }

  return {
    enable,
    effort,
    get ok() { return ok; },
    get supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    hold(on) { held = on; },
  };
})();
