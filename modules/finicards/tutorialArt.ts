/**
 * Artwork for the dungeon tutorial's cast, drawn by hand in SVG.
 *
 * Nobody in the tutorial is a real card, so there is no artwork to fetch. Each
 * picture is a `data:` URL, which the card renderer fetches like any other art
 * URL - the tutorial's cards go through exactly the same drawing code as a run's.
 */

/* Characters are drawn on a 600 x 800 sheet; the picture is landscape, as
   the card's art window is, with the character scaled into its middle so the
   dungeon scene's tall arch keeps all of them too. */
const W = 600;
const H = 800;
const CANVAS = { width: 800, height: 600 };
const FIT = 0.7;

/** A full-bleed backdrop: a gradient and a soft spotlight, never a flat edge. */
const backdrop = (top: string, bottom: string, glow: string): string =>
  `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><radialGradient id="glow" cx="0.5" cy="0.45" r="0.55"><stop offset="0" stop-color="${glow}" stop-opacity="0.55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs><rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#bg)"/><rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#glow)"/>`;

/** A googly eye, its pupil rolled toward (dx, dy). */
const eye = (x: number, y: number, r: number, dx = 0, dy = 0): string =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#1b1b1b" stroke-width="5"/><circle cx="${x + dx * r * 0.45}" cy="${y + dy * r * 0.45}" r="${r * 0.42}" fill="#1b1b1b"/>`;

const svg = (background: string, body: string): string => {
  const left = (CANVAS.width - W * FIT) / 2;
  const top = (CANVAS.height - H * FIT) / 2;
  return `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">${background}<g transform="translate(${left} ${top}) scale(${FIT})">${body}</g></svg>`,
  ).toString("base64")}`;
};

export const TUTORIAL_ART = {
  /** A brick. Also a bricklayer. He has made peace with this. */
  brick: svg(
    backdrop("#ff9d4d", "#7a2e0e", "#ffe0a0"),
    `<rect x="120" y="300" width="360" height="230" rx="18" fill="#b5462c" stroke="#5a1f10" stroke-width="10"/>` +
      `<path d="M120 377 H480 M120 454 H480 M240 300 V377 M360 377 V454 M240 454 V530" stroke="#e8b48a" stroke-width="8"/>` +
      `${eye(240, 400, 34, 0.6, 0.2)}${eye(360, 400, 34, -0.4, 0.3)}` +
      `<path d="M255 475 Q300 505 345 475" fill="none" stroke="#1b1b1b" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="M150 300 Q150 190 300 185 Q450 190 450 300 Z" fill="#ffd23f" stroke="#7a5a00" stroke-width="9"/>` +
      `<rect x="120" y="288" width="360" height="26" rx="13" fill="#ffd23f" stroke="#7a5a00" stroke-width="9"/>` +
      `<rect x="285" y="200" width="30" height="90" rx="10" fill="#f0b400"/>` +
      `<path d="M120 470 Q60 440 70 380 M480 470 Q540 440 530 380" stroke="#5a1f10" stroke-width="16" fill="none" stroke-linecap="round"/>` +
      `<circle cx="70" cy="370" r="22" fill="#b5462c" stroke="#5a1f10" stroke-width="8"/><circle cx="530" cy="370" r="22" fill="#b5462c" stroke="#5a1f10" stroke-width="8"/>`,
  ),

  /** A crouton, and the captain of a ship nobody has seen. */
  crouton: svg(
    backdrop("#4d7bff", "#0d1b4a", "#a8d4ff") +
      `<path d="M0 470 Q100 440 200 470 T400 470 T600 470 T800 470 V600 H0 Z" fill="#1d3f9a"/>`,
    `<rect x="150" y="300" width="300" height="290" rx="46" fill="#e2a24b" stroke="#7b4a12" stroke-width="10" transform="rotate(-4 300 445)"/>` +
      `<g fill="#a8661f">${[
        [190, 340],
        [400, 330],
        [215, 560],
        [420, 540],
        [300, 330],
        [180, 470],
        [430, 440],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`)
        .join("")}</g>` +
      `${eye(250, 420, 30, 0.2, -0.3)}${eye(350, 420, 30, 0.2, -0.3)}` +
      `<path d="M300 480 Q250 455 215 490 Q245 470 300 500 Q355 470 385 490 Q350 455 300 480 Z" fill="#3a2410"/>` +
      `<path d="M140 300 Q300 170 460 300 Z" fill="#14254f" stroke="#0a1430" stroke-width="8"/>` +
      `<rect x="130" y="284" width="340" height="34" rx="12" fill="#14254f" stroke="#0a1430" stroke-width="8"/>` +
      `<rect x="120" y="300" width="360" height="16" rx="8" fill="#0a1430"/>` +
      `<circle cx="300" cy="248" r="28" fill="#ffd23f" stroke="#a37a00" stroke-width="6"/><path d="M300 228 V268 M282 240 Q300 262 318 240" stroke="#a37a00" stroke-width="5" fill="none"/>`,
  ),

  /** An owl with tenure. */
  owlbert: svg(
    backdrop("#5aa9ff", "#10205a", "#d4ecff"),
    `<rect x="80" y="610" width="440" height="40" rx="10" fill="#6b4422"/>` +
      `<ellipse cx="300" cy="460" rx="165" ry="185" fill="#8a5a33" stroke="#4a2c14" stroke-width="10"/>` +
      `<ellipse cx="300" cy="510" rx="100" ry="115" fill="#d9b48a"/>` +
      `${eye(235, 400, 58, 0, 0.1)}${eye(365, 400, 58, 0, 0.1)}` +
      `<circle cx="235" cy="400" r="70" fill="none" stroke="#1b1b1b" stroke-width="9"/><circle cx="365" cy="400" r="70" fill="none" stroke="#1b1b1b" stroke-width="9"/><path d="M305 400 H295" stroke="#1b1b1b" stroke-width="9"/>` +
      `<path d="M300 455 L280 490 L320 490 Z" fill="#ffb02e" stroke="#8a5a00" stroke-width="5"/>` +
      `<path d="M300 205 L460 250 L300 295 L140 250 Z" fill="#1b1b1b"/><rect x="225" y="262" width="150" height="40" fill="#1b1b1b"/>` +
      `<path d="M300 250 L440 300 L440 360" stroke="#ffd23f" stroke-width="7" fill="none"/><circle cx="440" cy="368" r="12" fill="#ffd23f"/>` +
      `<path d="M150 430 Q110 500 150 570 M450 430 Q490 500 450 570" stroke="#4a2c14" stroke-width="12" fill="none" stroke-linecap="round"/>`,
  ),

  /** A calculator in a tie. Does your taxes whether you asked or not. */
  accountant: svg(
    backdrop("#7fd3ff", "#183a63", "#ffffff"),
    `<rect x="160" y="170" width="280" height="430" rx="34" fill="#4a5561" stroke="#20262c" stroke-width="10"/>` +
      `<rect x="190" y="205" width="220" height="80" rx="10" fill="#b8e0a0" stroke="#20262c" stroke-width="6"/>` +
      `<text x="398" y="262" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="44" font-weight="700" fill="#24401a">2+2=5</text>` +
      `<g fill="#cfd6dd" stroke="#20262c" stroke-width="4">${Array.from(
        { length: 12 },
        (_, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          return `<rect x="${195 + col * 72}" y="${400 + row * 46}" width="60" height="36" rx="8"/>`;
        },
      ).join("")}</g>` +
      `${eye(250, 335, 26, -0.5, 0)}${eye(350, 335, 26, -0.5, 0)}` +
      `<rect x="214" y="305" width="72" height="56" rx="10" fill="none" stroke="#1b1b1b" stroke-width="6"/><rect x="314" y="305" width="72" height="56" rx="10" fill="none" stroke="#1b1b1b" stroke-width="6"/><path d="M286 330 H314" stroke="#1b1b1b" stroke-width="6"/>` +
      `<path d="M300 600 L270 640 L300 760 L330 640 Z" fill="#c0262d" stroke="#5a0f13" stroke-width="6"/><path d="M280 598 H320 L300 625 Z" fill="#8a1a20"/>`,
  ),

  /** A tidal wave who knits. Hugs are mandatory and slightly damp. */
  grandma: svg(
    backdrop("#ff7aa8", "#5a1033", "#ffd6e6"),
    `<path d="M70 660 Q60 330 300 300 Q520 290 530 470 Q530 560 440 560 Q370 560 380 480 Q390 430 440 440 Q400 380 320 400 Q200 440 220 660 Z" fill="#39b4d6" stroke="#0f5a70" stroke-width="10"/>` +
      `<path d="M110 660 Q120 470 260 430" stroke="#ffffff" stroke-opacity="0.6" stroke-width="12" fill="none" stroke-linecap="round"/>` +
      `<circle cx="330" cy="270" r="48" fill="#d8d8e0" stroke="#7a7a88" stroke-width="7"/><path d="M300 250 Q330 230 360 255" stroke="#7a7a88" stroke-width="5" fill="none"/>` +
      `${eye(275, 360, 24, 0.3, 0)}${eye(355, 360, 24, 0.3, 0)}` +
      `<circle cx="275" cy="360" r="34" fill="none" stroke="#5a3a1a" stroke-width="6"/><circle cx="355" cy="360" r="34" fill="none" stroke="#5a3a1a" stroke-width="6"/><path d="M309 360 H321" stroke="#5a3a1a" stroke-width="6"/>` +
      `<path d="M290 415 Q315 435 340 415" stroke="#0f3a48" stroke-width="7" fill="none" stroke-linecap="round"/>` +
      `<circle cx="450" cy="640" r="62" fill="#ff5c8a" stroke="#8a1a3d" stroke-width="7"/><path d="M400 610 Q450 650 500 615 M398 650 Q450 690 505 650 M420 590 Q460 630 470 700" stroke="#8a1a3d" stroke-width="5" fill="none"/>` +
      `<path d="M380 520 L520 700 M420 500 L500 720" stroke="#ffd23f" stroke-width="10" stroke-linecap="round"/>`,
  ),

  /** A very good boy. The best boy, some say. */
  gerald: svg(
    backdrop("#ff6b5e", "#5a1410", "#ffe0b0"),
    `<g fill="#ffd23f">${[
      [90, 140],
      [500, 180],
      [130, 640],
      [470, 660],
      [520, 420],
    ]
      .map(
        ([x, y]) =>
          `<rect x="${x}" y="${y}" width="22" height="12" rx="3" transform="rotate(${x % 60} ${x} ${y})"/>`,
      )
      .join("")}</g>` +
      `<path d="M165 330 Q90 360 110 520 Q130 560 175 520 Z" fill="#b8742a" stroke="#6a3c10" stroke-width="8"/><path d="M435 330 Q510 360 490 520 Q470 560 425 520 Z" fill="#b8742a" stroke="#6a3c10" stroke-width="8"/>` +
      `<ellipse cx="300" cy="420" rx="150" ry="160" fill="#e6a548" stroke="#6a3c10" stroke-width="10"/>` +
      `<ellipse cx="300" cy="500" rx="80" ry="62" fill="#f5d39a"/>` +
      `${eye(245, 395, 28, 0.2, -0.4)}${eye(355, 395, 28, -0.2, -0.4)}` +
      `<ellipse cx="300" cy="470" rx="30" ry="20" fill="#2a1a10"/>` +
      `<path d="M300 490 V515 M270 515 Q300 535 330 515" stroke="#2a1a10" stroke-width="6" fill="none"/>` +
      `<path d="M285 518 Q285 590 310 590 Q330 590 325 518 Z" fill="#ff6b8a" stroke="#a02c4a" stroke-width="5"/>` +
      `<path d="M240 270 L300 120 L360 270 Z" fill="#5ac8fa" stroke="#1a5a7a" stroke-width="8"/><path d="M262 220 L338 220 M282 170 L318 170" stroke="#ffd23f" stroke-width="10"/><circle cx="300" cy="115" r="18" fill="#ffd23f"/>`,
  ),

  /** A squirrel who has seen one heist movie and now thinks he is in one. */
  squirrel: svg(
    backdrop("#59d68a", "#0f3d22", "#e4ffd0"),
    `<path d="M400 600 Q560 560 520 380 Q490 230 380 260 Q470 330 440 430 Q420 500 360 520 Z" fill="#8a6142" stroke="#4a2e18" stroke-width="10"/>` +
      `<ellipse cx="290" cy="520" rx="110" ry="130" fill="#a07452" stroke="#4a2e18" stroke-width="10"/>` +
      `<ellipse cx="290" cy="560" rx="60" ry="70" fill="#e0c3a0"/>` +
      `<circle cx="270" cy="350" r="95" fill="#a07452" stroke="#4a2e18" stroke-width="10"/>` +
      `<path d="M200 285 L185 215 L240 265 Z M310 270 L345 205 L345 285 Z" fill="#a07452" stroke="#4a2e18" stroke-width="8"/>` +
      `<path d="M180 335 H360" stroke="#1b1b1b" stroke-width="10"/><rect x="185" y="325" width="75" height="42" rx="16" fill="#1b1b1b"/><rect x="280" y="325" width="75" height="42" rx="16" fill="#1b1b1b"/>` +
      `<path d="M200 335 L225 335" stroke="#ffffff" stroke-opacity="0.6" stroke-width="6"/>` +
      `<path d="M245 410 Q275 395 305 412" stroke="#1b1b1b" stroke-width="7" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="200" cy="560" rx="34" ry="40" fill="#c78a3c" stroke="#5a3a10" stroke-width="7"/><path d="M168 540 Q200 505 232 540 Z" fill="#6a4418"/>`,
  ),

  /** Definitely one tall gentleman. */
  raccoons: svg(
    backdrop("#3a3a52", "#0b0b14", "#9a9ad0"),
    `<path d="M190 300 L410 300 L470 760 L130 760 Z" fill="#b89a6a" stroke="#5a4426" stroke-width="10"/>` +
      `<path d="M300 300 L300 760" stroke="#5a4426" stroke-width="8"/><path d="M190 300 L300 420 L410 300" fill="#9a7e52" stroke="#5a4426" stroke-width="8"/>` +
      `<g fill="#5a4426">${[460, 540, 620, 700].map((y) => `<circle cx="275" cy="${y}" r="9"/>`).join("")}</g>` +
      `<rect x="160" y="560" width="290" height="22" fill="#5a4426"/>` +
      `<circle cx="300" cy="225" r="85" fill="#8a8a96" stroke="#3a3a44" stroke-width="9"/>` +
      `<path d="M215 220 Q300 175 385 220 Q385 255 300 250 Q215 255 215 220 Z" fill="#1b1b22"/>` +
      `${eye(262, 220, 20, 0.6, 0)}${eye(338, 220, 20, 0.6, 0)}` +
      `<ellipse cx="300" cy="275" rx="14" ry="10" fill="#1b1b1b"/>` +
      `<path d="M190 160 L410 160 L380 100 L220 100 Z" fill="#2a2a34"/><rect x="160" y="150" width="280" height="22" rx="8" fill="#2a2a34"/>` +
      /* Two of the other six, not hiding very well. */
      `<g transform="translate(330 470)"><circle r="34" fill="#8a8a96" stroke="#3a3a44" stroke-width="6"/><path d="M-30 -2 Q0 -22 30 -2 Q30 12 0 10 Q-30 12 -30 -2 Z" fill="#1b1b22"/>${eye(-12, -2, 8, -0.6, 0)}${eye(12, -2, 8, -0.6, 0)}</g>` +
      `<g transform="translate(400 660)"><circle r="30" fill="#8a8a96" stroke="#3a3a44" stroke-width="6"/><path d="M-26 -2 Q0 -20 26 -2 Q26 10 0 8 Q-26 10 -26 -2 Z" fill="#1b1b22"/>${eye(-10, -2, 7, 0.6, -0.4)}${eye(10, -2, 7, 0.6, -0.4)}</g>` +
      `<path d="M150 700 Q120 740 160 770 M450 690 Q500 720 470 770" stroke="#8a8a96" stroke-width="14" fill="none" stroke-linecap="round"/>`,
  ),

  /** Has a form for that. Has a form for the form. */
  paperwork: svg(
    backdrop("#9a5cff", "#1e0a4a", "#e6d0ff"),
    `<g stroke="#8a8aa0" stroke-width="4">${Array.from(
      { length: 9 },
      (_, i) => {
        const y = 690 - i * 42;
        const x = 175 + (i % 2 === 0 ? 0 : 14) - (i % 3) * 6;
        return `<rect x="${x}" y="${y}" width="250" height="40" fill="#f6f4ee"/>`;
      },
    ).join("")}</g>` +
      `${eye(255, 450, 30, 0.1, 0.3)}${eye(345, 450, 30, -0.1, 0.3)}` +
      `<path d="M215 405 L285 430 M385 405 L315 430" stroke="#1b1b1b" stroke-width="10" stroke-linecap="round"/>` +
      `<path d="M255 520 Q300 495 345 520" stroke="#1b1b1b" stroke-width="8" fill="none" stroke-linecap="round"/>` +
      `<path d="M300 40 L440 360 L160 360 Z" fill="#3b1a7a" stroke="#1a0a3a" stroke-width="10"/>` +
      `<g fill="#ffd23f">${[
        [300, 150],
        [255, 260],
        [350, 300],
        [320, 220],
      ]
        .map(
          ([x, y]) =>
            `<path d="M${x} ${y - 16} L${x + 5} ${y - 5} L${x + 16} ${y} L${x + 5} ${y + 5} L${x} ${y + 16} L${x - 5} ${y + 5} L${x - 16} ${y} L${x - 5} ${y - 5} Z"/>`,
        )
        .join("")}</g>` +
      `<rect x="130" y="350" width="340" height="26" rx="12" fill="#3b1a7a" stroke="#1a0a3a" stroke-width="8"/>` +
      `<g transform="rotate(-18 480 560)"><rect x="458" y="470" width="44" height="90" rx="12" fill="#8a1a20"/><rect x="430" y="555" width="100" height="36" rx="6" fill="#c0262d" stroke="#5a0f13" stroke-width="5"/></g>` +
      `<text x="200" y="740" font-family="DejaVu Sans, sans-serif" font-size="30" font-weight="800" fill="#c0262d" transform="rotate(-8 300 740)">DENIED</text>`,
  ),
};
