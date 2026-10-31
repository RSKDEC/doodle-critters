// Shared by the TV and the phones.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Titles, picture hints and the lines the TV reads aloud for each mini-game.
const GAME_INFO = {
  balloon: {
    title: 'Balloon Pop', emoji: '🎈',
    how: 'Blow into your phone to fill your balloon. Stop at the green line, before it goes POP!',
    phone: 'Blow gently! Stop at the line!',
  },
  dragon: {
    title: 'Shh! The Dragon', emoji: '🐉',
    how: 'Make noise to run to the castle! But when the dragon falls asleep, be super quiet, or it will blow you back!',
    phone: 'Make noise to run! Be quiet when the dragon sleeps!',
  },
  seek: {
    title: 'Flashlight Hide and Seek', emoji: '🔦',
    how: 'One critter hides in the dark bedroom. Everyone else, slide your finger to move your flashlight and find it!',
    phone: 'Slide your finger to move your flashlight!',
  },
  feather: {
    title: 'Feather Float', emoji: '🪶',
    how: 'Blow softly to keep your feather floating in the fluffy cloud zone. Not too hard, not too soft!',
    phone: 'Blow softly! Keep the feather in the clouds!',
  },
};

// Server sends `now` with each state so countdowns survive clock drift between devices.
function makeClock() {
  let offset = 0;
  let deadline = null;
  let duration = null;
  return {
    sync(state) {
      offset = Date.now() - state.now;
      deadline = state.deadline;
      duration = state.duration;
    },
    remaining() {
      if (!deadline) return null;
      return Math.max(0, Math.ceil((deadline - (Date.now() - offset)) / 1000));
    },
    fraction() {
      if (!deadline || !duration) return null;
      return Math.max(0, Math.min(1, (deadline - (Date.now() - offset)) / (duration * 1000)));
    },
  };
}

function startTimerLoop(clock) {
  setInterval(() => {
    const s = clock.remaining();
    document.querySelectorAll('[data-timer]').forEach((el) => { el.textContent = s == null ? '' : s; });
    const f = clock.fraction();
    document.querySelectorAll('[data-fuse]').forEach((el) => { el.style.width = f == null ? '0' : `${f * 100}%`; });
  }, 100);
}

const starsHtml = (n, max = 3) => Array.from({ length: max }, (_, i) => `<span class="star ${i < n ? 'on' : ''}">★</span>`).join('');

// Hiding spots in the seek bedroom (positions as fractions of the TV stage).
// The server's spot count (SPOTS in src/room.js) must match this list.
const SEEK_SPOTS = [
  { x: 0.25, y: 0.83, name: 'Under the bed', emoji: '🛏️' },
  { x: 0.515, y: 0.71, name: 'Toy box', emoji: '🧸' },
  { x: 0.635, y: 0.36, name: 'Curtains', emoji: '🪟' },
  { x: 0.745, y: 0.27, name: 'Bookshelf', emoji: '📚' },
  { x: 0.655, y: 0.63, name: 'Big plant', emoji: '🪴' },
  { x: 0.885, y: 0.5, name: 'Wardrobe', emoji: '🚪' },
  { x: 0.375, y: 0.33, name: 'Lamp', emoji: '💡' },
  { x: 0.075, y: 0.79, name: 'Laundry basket', emoji: '🧺' },
];

// The medal each kid gets in the parade: named after their best game.
const AWARDS = {
  balloon: ['🎈', 'Balloon Boss'],
  dragon: ['🐉', 'Dragon Dodger'],
  seek: ['🔦', 'Super Seeker'],
  feather: ['🪶', 'Feather Floater'],
};

function awardFor(p) {
  const best = Object.entries(p.gameStars || {}).sort((a, b) => b[1] - a[1])[0];
  return best ? AWARDS[best[0]] : ['🎨', 'Super Doodler'];
}
