// The TV reads instructions aloud so kids who can't read yet can play.
const voice = (() => {
  let enabled = true;
  let chosen = null;
  const synth = typeof window !== 'undefined' && window.speechSynthesis;

  function pick() {
    if (!synth || chosen) return chosen;
    const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    const us = voices.filter((v) => /en[-_]US/i.test(v.lang));
    chosen = us.find((v) => /google us english|samantha|aria|jenny|zira|female/i.test(v.name)) || us[0]
      || voices.find((v) => /female|samantha|zira|aria/i.test(v.name)) || voices[0] || null;
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
        u.lang = 'en-US';
        u.rate = 1;
        u.pitch = 1.15;
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
