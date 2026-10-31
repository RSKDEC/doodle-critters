// Friendly (never scary) Halloween art: original drawings of a smiling ghost,
// a grinning pumpkin, a little bat, and the decoration layer behind the TV.
function ghostSvg(cls = '') {
  return `<svg class="ghost ${cls}" viewBox="0 0 100 104" aria-hidden="true">
    <path d="M12 62 Q12 10 50 10 Q88 10 88 62 L88 92 Q80 84 72 92 Q62 102 50 92 Q38 82 28 92 Q20 100 12 92Z"
      fill="#fff" stroke="#c9c3e6" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="38" cy="48" rx="6" ry="8" fill="#2b2140"/><ellipse cx="62" cy="48" rx="6" ry="8" fill="#2b2140"/>
    <circle cx="40" cy="45" r="2" fill="#fff"/><circle cx="64" cy="45" r="2" fill="#fff"/>
    <path d="M42 62 Q50 70 58 62" fill="none" stroke="#2b2140" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="29" cy="60" r="5" fill="#ffb3c7" opacity=".8"/><circle cx="71" cy="60" r="5" fill="#ffb3c7" opacity=".8"/>
  </svg>`;
}

function pumpkinSvg(cls = '', face = 0) {
  const faces = [
    // happy round eyes and a big smile with one tooth
    `<circle cx="36" cy="52" r="7" fill="#5a2a00"/><circle cx="64" cy="52" r="7" fill="#5a2a00"/>
     <path d="M30 66 Q50 84 70 66 Q50 74 30 66Z" fill="#5a2a00"/><rect x="47" y="68" width="7" height="6" rx="1" fill="#ff9a1f"/>`,
    // winking
    `<path d="M29 53 Q36 47 43 53" fill="none" stroke="#5a2a00" stroke-width="5" stroke-linecap="round"/>
     <circle cx="64" cy="52" r="7" fill="#5a2a00"/><path d="M34 66 Q50 80 66 66" fill="none" stroke="#5a2a00" stroke-width="6" stroke-linecap="round"/>`,
    // surprised "ooh"
    `<circle cx="36" cy="51" r="6" fill="#5a2a00"/><circle cx="64" cy="51" r="6" fill="#5a2a00"/>
     <ellipse cx="50" cy="70" rx="8" ry="9" fill="#5a2a00"/>`,
  ];
  return `<svg class="pumpkin ${cls}" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M50 22 Q48 10 58 6" fill="none" stroke="#3f7d2a" stroke-width="7" stroke-linecap="round"/>
    <path d="M56 12 Q70 6 74 16 Q64 20 56 12Z" fill="#5cb83c"/>
    <ellipse cx="50" cy="58" rx="44" ry="36" fill="#ff8a1c" stroke="#d65f00" stroke-width="3"/>
    <path d="M50 22 Q34 58 50 94 M50 22 Q66 58 50 94 M28 28 Q16 58 28 90 M72 28 Q84 58 72 90" fill="none" stroke="#e26f05" stroke-width="3"/>
    ${faces[face % faces.length]}
  </svg>`;
}

function batSvg(cls = '') {
  return `<svg class="bat ${cls}" viewBox="0 0 120 60" aria-hidden="true">
    <g class="wing l"><path d="M52 30 Q34 6 4 14 Q16 22 12 32 Q24 28 28 38 Q38 30 52 34Z" fill="#4a3a6b"/></g>
    <g class="wing r"><path d="M68 30 Q86 6 116 14 Q104 22 108 32 Q96 28 92 38 Q82 30 68 34Z" fill="#4a3a6b"/></g>
    <ellipse cx="60" cy="32" rx="14" ry="15" fill="#5b4a80"/>
    <path d="M50 20 L52 10 L57 18 M70 20 L68 10 L63 18" fill="#5b4a80" stroke="#5b4a80" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="55" cy="30" r="3.2" fill="#fff"/><circle cx="65" cy="30" r="3.2" fill="#fff"/>
    <circle cx="55" cy="31" r="1.6" fill="#222"/><circle cx="65" cy="31" r="1.6" fill="#222"/>
    <path d="M56 38 Q60 41 64 38" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

// Moon, twinkling stars, floating ghosts, flapping bats and a row of pumpkins.
function halloweenDeco() {
  const stars = Array.from({ length: 18 }, (_, i) =>
    `<i class="twinkle" style="left:${(i * 37) % 100}%;top:${(i * 23) % 45}%;animation-delay:${(i % 6) * 0.4}s"></i>`).join('');
  return `<div class="hw-deco" aria-hidden="true">
    <div class="moon"></div>${stars}
    <div class="float-ghost g1">${ghostSvg()}</div>
    <div class="float-ghost g2">${ghostSvg()}</div>
    <div class="flap-bat b1">${batSvg()}</div>
    <div class="flap-bat b2">${batSvg()}</div>
    <div class="pumpkin-row">${[0, 1, 2, 0, 1].map((f, i) => pumpkinSvg(`p${i}`, f)).join('')}</div>
  </div>`;
}

// Costumes for critters, drawn in a 100-unit box centred on (0, 0) = the hat's base.
const COSTUMES = [
  { name: 'witch hat', h: 0.95, svg: `
    <ellipse cx="0" cy="0" rx="52" ry="10" fill="#5b3a9e" stroke="#2b2140" stroke-width="4"/>
    <path d="M-30 -2 Q-14 -55 16 -86 Q8 -50 30 -2Z" fill="#5b3a9e" stroke="#2b2140" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-27 -12 Q0 -19 27 -12 L29 -3 Q0 -10 -29 -3Z" fill="#ff8a1c"/>
    <rect x="-7" y="-19" width="14" height="12" rx="2" fill="#ffd23f" stroke="#2b2140" stroke-width="2.5"/>` },
  { name: 'pumpkin hat', h: 0.75, svg: `
    <path d="M0 -40 Q-2 -54 8 -58" fill="none" stroke="#3f7d2a" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="0" cy="-16" rx="42" ry="26" fill="#ff8a1c" stroke="#d65f00" stroke-width="3.5"/>
    <path d="M0 -42 Q-14 -16 0 10 M0 -42 Q14 -16 0 10 M-24 -36 Q-34 -16 -24 6 M24 -36 Q34 -16 24 6" fill="none" stroke="#e26f05" stroke-width="3"/>` },
  { name: 'cat ears', h: 0.6, svg: `
    <path d="M-44 6 Q0 -26 44 6" fill="none" stroke="#2b2140" stroke-width="9" stroke-linecap="round"/>
    <path d="M-38 -4 L-30 -50 L-10 -16Z M38 -4 L30 -50 L10 -16Z" fill="#2b2140" stroke="#2b2140" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-31 -10 L-27 -36 L-17 -18Z M31 -10 L27 -36 L17 -18Z" fill="#ffb3c7"/>` },
  { name: 'wizard hat', h: 1, svg: `
    <path d="M-36 -2 L2 -90 Q10 -86 12 -76 Q20 -40 36 -2Z" fill="#2f5bd3" stroke="#1b2f73" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="0" cy="0" rx="48" ry="9" fill="#2f5bd3" stroke="#1b2f73" stroke-width="4"/>
    <path d="M-10 -40 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z M10 -18 l2 4 4 1 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 -1z" fill="#ffd23f"/>` },
];
