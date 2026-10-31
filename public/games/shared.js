// Helpers shared by the TV-side mini-games. Each game is a factory that takes
// a context and returns { input(msg), update(state), stop() }:
//   ctx.stage            element to draw into
//   ctx.players          kids in the game (public player objects)
//   ctx.effort(key)      latest mic effort 0..1 for a kid (0 if stale)
//   ctx.light(key)       latest flashlight {x, y, on} for a kid
//   ctx.report(scores)   finish: { key: 0..1 } (balloon, dragon, feather)
//   ctx.found(key)       seek: this kid found the hidden critter
//   ctx.clock(secs, frac) show the game's own countdown
const Games = {};

// Younger kids get more forgiving targets and a little more speed.
const ageFactor = (age) => ({ 4: 1.6, 5: 1.4, 6: 1.22, 7: 1.1, 8: 1 })[age] || 1;

const critterColor = (p) => CRITTER_COLORS[p.color % CRITTER_COLORS.length];

// requestAnimationFrame loop with a capped time step; returns a stop function.
function gameLoop(fn) {
  let last = performance.now();
  let stopped = false;
  const step = (t) => {
    if (stopped) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    fn(dt);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => { stopped = true; };
}

// Runs the game clock: calls onEnd once after `seconds`.
function gameClock(ctx, seconds, onEnd) {
  const start = performance.now();
  let done = false;
  return {
    tick() {
      const left = Math.max(0, seconds - (performance.now() - start) / 1000);
      ctx.clock(Math.ceil(left), left / seconds);
      if (!done && left <= 0) { done = true; onEnd(); }
    },
    elapsed: () => (performance.now() - start) / 1000,
    end() { if (!done) { done = true; onEnd(); } },
    get done() { return done; },
  };
}
