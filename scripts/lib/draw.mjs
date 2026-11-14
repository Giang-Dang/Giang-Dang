import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';

const require = createRequire(import.meta.url);

const loadFont = (specifier) => fontkit.openSync(require.resolve(specifier));

const FONTS = {
  serif: loadFont('@fontsource/newsreader/files/newsreader-latin-400-normal.woff2'),
  serifMedium: loadFont('@fontsource/newsreader/files/newsreader-latin-500-normal.woff2'),
  mono: loadFont('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'),
};

export const THEMES = {
  light: { fg: '#1e1c18', muted: '#6b665b', lineStrong: '#d2c9b6', accent: '#b4572f', quiet: '#d2c9b6' },
  dark: { fg: '#f5f0e6', muted: '#b6af9f', lineStrong: 'rgba(251,248,242,0.25)', accent: '#d88e6f', quiet: 'rgba(251,248,242,0.25)' },
};

const WIDTH = 380;
const HEIGHT = 232;
const PAD = 20;
const EYEBROW_SIZE = 15;
const EYEBROW_TRACKING = 0.04;
const EYEBROW_Y = 36;
const MIDDOT = String.fromCharCode(0xb7);

const ANIMATION_CSS = [
  '.b{transform-box:fill-box;transform-origin:50% 100%;animation:grow 640ms cubic-bezier(0.2,0.7,0.2,1) both}',
  '@keyframes grow{from{transform:scaleY(0.04)}to{transform:scaleY(1)}}',
  '.live{animation:pulse 2.4s ease-in-out 3}',
  '@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}',
  '@media (prefers-reduced-motion:reduce){.b,.live{animation:none}}',
].join('');

const escapeXml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const round = (n) => Math.round(n * 10) / 10;

const roundPathNumbers = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(round(Number(n))));

const textWidth = (font, text, size, tracking = 0) => {
  const run = font.layout(text);
  const advance = run.positions.reduce((sum, p) => sum + p.xAdvance, 0) * (size / font.unitsPerEm);
  return advance + tracking * size * Math.max(0, run.glyphs.length - 1);
};

const textPath = (text, x, y, { font = FONTS.mono, size = EYEBROW_SIZE, fill, anchor = 'start', tracking = 0 }) => {
  const width = textWidth(font, text, size, tracking);
  let pen = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
  const scale = size / font.unitsPerEm;
  const run = font.layout(text);
  const d = run.glyphs
    .map((glyph, i) => {
      const position = run.positions[i];
      const path = glyph.path.transform(scale, 0, 0, -scale, pen + position.xOffset * scale, y - position.yOffset * scale).toSVG();
      pen += position.xAdvance * scale + tracking * size;
      return path;
    })
    .join('');
  return `<path class="t" d="${roundPathNumbers(d)}" fill="${fill}"/>`;
};

class Card {
  constructor(theme, label) {
    this.theme = theme;
    this.label = label;
    this.parts = [
      `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="10" fill="none" stroke="${theme.lineStrong}"/>`,
    ];
  }

  add(markup) {
    this.parts.push(markup);
  }

  text(text, x, y, options) {
    this.add(textPath(text, x, y, { fill: this.theme.fg, ...options }));
  }

  eyebrow(text, x, anchor = 'start') {
    this.add(textPath(text, x, EYEBROW_Y, { fill: this.theme.muted, tracking: EYEBROW_TRACKING, anchor }));
  }

  toSvg() {
    const title = escapeXml(this.label);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${title}">`,
      `<title>${title}</title>`,
      `<style>${ANIMATION_CSS}</style>`,
      ...this.parts,
      '</svg>',
    ].join('\n');
  }
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RHYTHM_TOP = 132;
const RHYTHM_BASE = 186;
const KPI_Y = 86;
const KPI_STEP = 124;

export const overviewCard = (theme, { active, streak, isShipping, totals, share }) => {
  const busiest = totals.indexOf(Math.max(...totals));
  const card = new Card(
    theme,
    `Last 12 months: ${active} active days, a ${streak} day streak, ${share} percent of contributions on weekends, ${DAY_NAMES[busiest]} busiest. ${isShipping ? 'Shipping' : 'Quiet'}.`,
  );
  const status = isShipping ? 'SHIPPING' : 'QUIET';
  const statusWidth = textWidth(FONTS.mono, status, EYEBROW_SIZE, EYEBROW_TRACKING);
  card.eyebrow('LAST 12 MONTHS', PAD);
  card.add(
    `<circle class="${isShipping ? 'live' : ''}" cx="${round(WIDTH - PAD - statusWidth - 12)}" cy="31" r="4" fill="${isShipping ? theme.accent : theme.muted}"/>`,
  );
  card.eyebrow(status, WIDTH - PAD, 'end');
  const kpis = [
    [String(active), 'active days'],
    [String(streak), 'day streak'],
    [`${share}%`, 'weekends'],
  ];
  kpis.forEach(([value, label], i) => {
    const x = PAD + i * KPI_STEP;
    card.text(value, x, KPI_Y, { font: FONTS.serifMedium, size: 34, tracking: -0.02 });
    card.text(label, x, KPI_Y + 24, { fill: theme.muted });
  });
  const max = Math.max(1, ...totals);
  WEEK_ORDER.forEach((weekday, k) => {
    const x = PAD + k * 49;
    const height = round(Math.max(1.5, (totals[weekday] / max) * (RHYTHM_BASE - RHYTHM_TOP)));
    const isWeekend = weekday === 0 || weekday === 6;
    card.add(
      `<rect class="b" style="animation-delay:${k * 40}ms" x="${x}" y="${round(RHYTHM_BASE - height)}" width="34" height="${height}" rx="2" fill="${isWeekend ? theme.accent : theme.quiet}"/>`,
    );
    card.text(DAY_INITIALS[weekday], x + 17, RHYTHM_BASE + 22, { fill: theme.muted, anchor: 'middle' });
  });
  card.add(`<line x1="${PAD}" y1="${RHYTHM_BASE}" x2="${WIDTH - PAD}" y2="${RHYTHM_BASE}" stroke="${theme.lineStrong}"/>`);
  return card.toSvg();
};

export const commitsCard = (theme, rows) => {
  const card = new Card(theme, `Commits by public repo over the last 12 months: ${rows.map((r) => `${r.name} ${r.count}`).join(', ')}.`);
  card.eyebrow(`COMMITS ${MIDDOT} PUBLIC REPOS`, PAD);
  const max = rows[0]?.count ?? 1;
  rows.forEach((row, j) => {
    const y = 80 + j * 32;
    card.text(row.name, PAD, y, { font: FONTS.serif, size: 17 });
    const width = round(Math.max(4, (row.count / max) * 100));
    card.add(`<rect x="214" y="${y - 9}" width="${width}" height="8" rx="2" fill="${j === 0 ? theme.accent : theme.quiet}"/>`);
    card.text(String(row.count), WIDTH - PAD, y, { anchor: 'end' });
  });
  return card.toSvg();
};
