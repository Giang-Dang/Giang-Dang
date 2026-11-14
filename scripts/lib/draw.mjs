import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';
import { MARK_GLYPH_PATH, MARK_RADIUS, MARK_VIEWBOX } from './mark.mjs';

const require = createRequire(import.meta.url);

const SUBSETS = ['latin', 'latin-ext', 'vietnamese'];

const loadFamily = (pkg, file, weight) =>
  SUBSETS.map((subset) => fontkit.openSync(require.resolve(`@fontsource/${pkg}/files/${file}-${subset}-${weight}-normal.woff2`)));

const FONTS = {
  serif: loadFamily('newsreader', 'newsreader', 400),
  serifMedium: loadFamily('newsreader', 'newsreader', 500),
  mono: loadFamily('ibm-plex-mono', 'ibm-plex-mono', 400),
};

export const THEMES = {
  light: { fg: '#1e1c18', muted: '#6b665b', lineStrong: '#d2c9b6', accent: '#b4572f', accentText: '#9a4626', quiet: '#d2c9b6' },
  dark: {
    fg: '#f5f0e6',
    muted: '#b6af9f',
    lineStrong: 'rgba(251,248,242,0.25)',
    accent: '#d88e6f',
    accentText: '#d88e6f',
    quiet: 'rgba(251,248,242,0.25)',
  },
};

const INK = { ground: '#1e1c18', fg: '#f5f0e6', muted: '#8c8678', accent: '#d88e6f', lineStrong: 'rgba(251,248,242,0.25)' };

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

const faceFor = (family, char) => family.find((face) => face.hasGlyphForCodePoint(char.codePointAt(0))) ?? family[0];

const segments = (family, text) => {
  const out = [];
  for (const char of text.normalize('NFC')) {
    const face = faceFor(family, char);
    const last = out[out.length - 1];
    if (last && last.face === face) last.text += char;
    else out.push({ face, text: char });
  }
  return out.map(({ face, text: part }) => ({ face, run: face.layout(part) }));
};

const layoutGlyphs = (family, text, size, tracking) => {
  const glyphs = [];
  let pen = 0;
  for (const { face, run } of segments(family, text)) {
    const scale = size / face.unitsPerEm;
    run.glyphs.forEach((glyph, i) => {
      const position = run.positions[i];
      glyphs.push({ glyph, scale, x: pen + position.xOffset * scale, dy: position.yOffset * scale });
      pen += position.xAdvance * scale + tracking * size;
    });
  }
  return { glyphs, width: glyphs.length === 0 ? 0 : pen - tracking * size };
};

const textWidth = (family, text, size, tracking = 0) => layoutGlyphs(family, text, size, tracking).width;

const textPath = (text, x, y, { font = FONTS.mono, size = EYEBROW_SIZE, fill, anchor = 'start', tracking = 0 }) => {
  const { glyphs, width } = layoutGlyphs(font, text, size, tracking);
  const left = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
  const d = glyphs.map(({ glyph, scale, x: gx, dy }) => glyph.path.transform(scale, 0, 0, -scale, left + gx, y - dy).toSVG()).join('');
  return `<path class="t" d="${roundPathNumbers(d)}" fill="${fill}"/>`;
};

class Card {
  constructor(theme, label, { width = WIDTH, height = HEIGHT, ground = null } = {}) {
    this.theme = theme;
    this.label = label;
    this.width = width;
    this.height = height;
    this.parts = [
      ground
        ? `<rect width="${width}" height="${height}" rx="10" fill="${ground}"/>`
        : `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="none" stroke="${theme.lineStrong}"/>`,
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
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" role="img" aria-label="${title}">`,
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

const ELLIPSIS = String.fromCharCode(0x2026);
const GUILLEMET = String.fromCharCode(0x203a);
const HERO = {
  name: 'Dang Giang',
  role: `.NET ENGINEER ${MIDDOT} HO CHI MINH CITY`,
  site: 'DANGVNGIANG.DEV',
  zone: 'UTC+7',
};

const mark = (x, y, size) => {
  const scale = round(size / MARK_VIEWBOX * 1000) / 1000;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><rect width="${MARK_VIEWBOX}" height="${MARK_VIEWBOX}" rx="${MARK_RADIUS}" fill="#b4572f"/><path d="${MARK_GLYPH_PATH}" fill="#ffffff"/></g>`;
};

const heroLabel = `${HERO.name}, .NET engineer in Ho Chi Minh City. dangvngiang.dev`;

export const heroWide = () => {
  const width = 764;
  const card = new Card(INK, heroLabel, { width, height: 168, ground: INK.ground });
  card.add(mark(32, 48, 72));
  card.text(HERO.name, 128, 96, { font: FONTS.serifMedium, size: 48, tracking: -0.02 });
  card.text(`${HERO.role} ${MIDDOT} ${HERO.zone}`, 130, 128, { fill: INK.muted, tracking: EYEBROW_TRACKING });
  card.text(HERO.site, width - 32, 96, { fill: INK.accent, tracking: EYEBROW_TRACKING, anchor: 'end' });
  return card.toSvg();
};

export const heroNarrow = () => {
  const card = new Card(INK, heroLabel, { width: WIDTH, height: 200, ground: INK.ground });
  card.add(mark(PAD, 24, 56));
  card.text(HERO.site, 92, 58, { fill: INK.accent, tracking: EYEBROW_TRACKING });
  card.text(HERO.name, PAD, 128, { font: FONTS.serifMedium, size: 40, tracking: -0.02 });
  card.text(HERO.role, PAD, 158, { fill: INK.muted, tracking: EYEBROW_TRACKING });
  card.text(HERO.zone, PAD, 182, { fill: INK.muted, tracking: EYEBROW_TRACKING });
  return card.toSvg();
};

export const wrapText = (measure, text, maxWidth, maxLines) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(`${last}${ELLIPSIS}`) > maxWidth) last = last.split(' ').slice(0, -1).join(' ');
  kept[maxLines - 1] = `${last}${ELLIPSIS}`;
  return kept;
};

const fitLine = (font, size, text, maxWidth) => wrapText((s) => textWidth(font, s, size), text, maxWidth, 1)[0] ?? '';

export const buildingCard = (theme, { repo, commits, pushedLabel }) => {
  const card = new Card(theme, repo ? `Now building ${repo.name}${repo.language ? ` in ${repo.language}` : ''}. Last commit: ${repo.lastCommit ?? 'none'}.` : 'Nothing pushed lately.');
  card.eyebrow('NOW BUILDING', PAD);
  if (!repo) {
    card.text('Nothing pushed lately', PAD, 92, { font: FONTS.serif, size: 24 });
    return card.toSvg();
  }
  card.eyebrow(pushedLabel.toUpperCase(), WIDTH - PAD, 'end');
  card.text(fitLine(FONTS.serifMedium, 30, repo.name, WIDTH - 2 * PAD), PAD, 88, { font: FONTS.serifMedium, size: 30, tracking: -0.01 });
  const meta = [repo.language?.toUpperCase(), commits ? `${commits} COMMITS THIS YEAR` : null].filter(Boolean).join(` ${MIDDOT} `);
  if (meta) card.text(meta, PAD, 116, { fill: theme.muted, tracking: EYEBROW_TRACKING });
  if (repo.lastCommit) {
    const lines = wrapText((s) => textWidth(FONTS.serif, s, 17), `${GUILLEMET} ${repo.lastCommit}`, WIDTH - 2 * PAD, 3);
    lines.forEach((line, i) => card.text(line, PAD, 156 + i * 24, { font: FONTS.serif, size: 17 }));
  }
  return card.toSvg();
};

export const tagsCard = (theme, tags) => {
  const card = new Card(theme, `Latest tags: ${tags.map((t) => `${t.name} at ${t.tag}`).join(', ')}.`);
  card.eyebrow('LATEST TAGS', PAD);
  tags.slice(0, 2).forEach((tag, j) => {
    const y = 88 + j * 74;
    const tagWidth = textWidth(FONTS.mono, tag.tag, 15);
    card.text(fitLine(FONTS.serif, 20, tag.name, WIDTH - 2 * PAD - tagWidth - 16), PAD, y, { font: FONTS.serif, size: 20 });
    card.text(tag.tag, WIDTH - PAD, y, { fill: theme.accentText, anchor: 'end' });
    if (tag.description) {
      card.text(fitLine(FONTS.serif, 15, tag.description, WIDTH - 2 * PAD), PAD, y + 26, { font: FONTS.serif, size: 15, fill: theme.muted });
    }
  });
  if (tags.length === 0) card.text('No tags yet', PAD, 92, { font: FONTS.serif, size: 24 });
  return card.toSvg();
};
