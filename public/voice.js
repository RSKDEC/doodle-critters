// The TV reads instructions aloud so kids who can't read yet can play.
const voice = (() => {
  let enabled = true;
  let chosen = null;
  const synth = typeof window !== 'undefined' && window.speechSynthesis;

  function pick() {
    if (!synth || chosen) return chosen;
    const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    chosen = voices.find((v) => /female|samantha|google us english|zira|aria/i.test(v.name)) || voices[0] || null;
    return chosen;
  }
  if (synth) synth.onvoiceschanged = () => { chosen = null; pick(); };

  // The Android TV app's WebView has no speech; it lends us Android's own voice.
  const android = typeof window !== 'undefined' && window.AndroidTTS;

  return {
    say(text) {
      if (!enabled || !text) return;
      if (android) { try { android.speak(String(text)); } catch {} return; }
      if (!synth) return;
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pick();
        if (v) u.voice = v;
        u.rate = 0.95;
        u.pitch = 1.25;
        synth.speak(u);
      } catch {}
    },
    stop() {
      try {
        if (android) android.stop();
        else if (synth) synth.cancel();
      } catch {}
    },
    set enabled(on) { enabled = on; if (!on) this.stop(); },
    get enabled() { return enabled; },
  };
})();
