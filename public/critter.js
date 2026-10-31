// Renders a kid's drawing as a living critter: their strokes, googly eyes that
// look around and blink, and little feet that walk.
const CRITTER_COLORS = ['#ff5d5d', '#ff9f1c', '#f7c600', '#3bb273', '#2f80ed', '#9b5de5', '#ff6fb5', '#20c4cb'];
const PALETTE = ['#2b2b2b', '#e63946', '#ff8c1a', '#ffd23f', '#3bb273', '#2f80ed', '#9b5de5', '#ff6fb5'];
const WIDTHS = [6, 12, 22];
const EYE_SIZES = [0, 11, 16, 23];

function critterBox(c) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const grow = (x, y, pad) => {
    x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad);
    x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad);
  };
  for (const s of c.strokes) for (let i = 0; i < s.p.length; i += 2) grow(s.p[i], s.p[i + 1], WIDTHS[s.w] / 2);
  for (const e of c.eyes || []) grow(e.x, e.y, EYE_SIZES[e.s] + 2);
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 300, y1: 300 };
  return { x0, y0, x1, y1 };
}

function strokePoints(p) {
  // A single tap is one point; nudge it so it draws as a dot.
  const pts = p.length === 2 ? [p[0], p[1], p[0] + 0.1, p[1]] : p;
  let out = '';
  for (let i = 0; i < pts.length; i += 2) out += `${pts[i]},${pts[i + 1]} `;
  return out;
}

// opts: { cls, feet (default true), mood: 'happy' | 'dizzy' }
function critterSvg(c, opts = {}) {
  if (!c) return '';
  const { cls = '', feet = true, mood } = opts;
  const b = critterBox(c);
  const w = Math.max(40, b.x1 - b.x0);
  const h = Math.max(40, b.y1 - b.y0);
  const side = Math.max(w, h) + 24;
  const footH = feet ? side * 0.13 : 0;
  const vx = b.x0 + w / 2 - side / 2;
  const vy = b.y0 + h / 2 - side / 2;
  const cx = b.x0 + w / 2;
  const by = b.y1;
  const lines = c.strokes.map((s) =>
    `<polyline points="${strokePoints(s.p)}" fill="none" stroke="${PALETTE[s.c]}" stroke-width="${WIDTHS[s.w]}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const eyes = (c.eyes || []).map((e, i) => {
    const r = EYE_SIZES[e.s];
    const pupil = mood === 'dizzy'
      ? `<path class="pupil" d="M${-r * .45} ${-r * .45} L${r * .45} ${r * .45} M${r * .45} ${-r * .45} L${-r * .45} ${r * .45}" stroke="#222" stroke-width="${r * .22}" stroke-linecap="round"/>`
      : `<circle class="pupil" r="${r * 0.46}" fill="#1d1d1d" style="animation-delay:${-i * 0.7}s"/>`;
    return `<g transform="translate(${e.x} ${e.y})"><g class="eye" style="animation-delay:${-i * 0.15}s">
      <circle r="${r}" fill="#fff" stroke="#1d1d1d" stroke-width="3"/>${pupil}</g></g>`;
  }).join('');
  const fw = Math.min(46, w * 0.22);
  const feetSvg = feet ? `<g class="feet">
      <ellipse class="foot l" cx="${cx - w * 0.2}" cy="${by + footH * 0.45}" rx="${fw / 2}" ry="${footH * 0.38}" fill="#3a2f2a"/>
      <ellipse class="foot r" cx="${cx + w * 0.2}" cy="${by + footH * 0.45}" rx="${fw / 2}" ry="${footH * 0.38}" fill="#3a2f2a"/>
    </g>` : '';
  return `<svg class="critter ${cls}" viewBox="${vx} ${vy} ${side} ${side + footH}" aria-hidden="true">
    ${feetSvg}<g class="body">${lines}${eyes}</g></svg>`;
}
