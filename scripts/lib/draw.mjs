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
const CHART_BASE = 178;
const CHART_TOP = 62;
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

  baseline() {
    this.add(`<line x1="${PAD}" y1="${CHART_BASE}" x2="${WIDTH - PAD}" y2="${CHART_BASE}" stroke="${this.theme.lineStrong}"/>`);
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

const formatCount = (n) => n.toLocaleString('en-US');

const monthLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

export const pulseCard = (theme, { total, active, streak, repos, isShipping }) => {
  const card = new Card(
    theme,
    `Last 12 months: ${formatCount(total)} contributions, ${active} active days, a ${streak.current} day streak (best ${streak.best}), commits in ${repos} repos. ${isShipping ? 'Shipping' : 'Quiet'}.`,
  );
  const status = isShipping ? 'SHIPPING' : 'QUIET';
  const statusWidth = textWidth(FONTS.mono, status, EYEBROW_SIZE, EYEBROW_TRACKING);
  card.eyebrow('LAST 12 MONTHS', PAD);
  card.add(
    `<circle class="${isShipping ? 'live' : ''}" cx="${round(WIDTH - PAD - statusWidth - 12)}" cy="31" r="4" fill="${isShipping ? theme.accent : theme.muted}"/>`,
  );
  card.eyebrow(status, WIDTH - PAD, 'end');
  const kpis = [
    [formatCount(total), 'contributions'],
    [String(active), 'active days'],
    [String(streak.current), `streak ${MIDDOT} best ${streak.best}`],
    [String(repos), 'repos with commits'],
  ];
  kpis.forEach(([value, label], i) => {
    const x = PAD + (i % 2) * 176;
    const y = 100 + Math.floor(i / 2) * 78;
    card.text(value, x, y, { font: FONTS.serifMedium, size: 40, tracking: -0.02 });
    card.text(label, x, y + 30, { fill: theme.muted });
  });
  return card.toSvg();
};

export const weeksCard = (theme, weekly) => {
  const peak = weekly.reduce((best, week) => (week.count > best.count ? week : best), weekly[0]);
  const peakDate = new Date(`${peak.start}T00:00:00Z`);
  const peakLabel = `${peakDate.getUTCDate()} ${monthLabel(peak.start)}`;
  const card = new Card(theme, `Contributions per week over ${weekly.length} weeks, peak ${peak.count} in the week of ${peakLabel}.`);
  card.eyebrow('PER WEEK', PAD);
  card.eyebrow(`PEAK ${peak.count} ${MIDDOT} ${peakLabel}`, WIDTH - PAD, 'end');
  const step = (WIDTH - 2 * PAD) / weekly.length;
  const barWidth = round(step - 1.6);
  const scale = peak.count === 0 ? 0 : (CHART_BASE - CHART_TOP) / peak.count;
  weekly.forEach((week, i) => {
    const x = round(PAD + i * step + 0.8);
    const isCurrent = i === weekly.length - 1;
    if (week.count === 0) {
      card.add(`<rect x="${x}" y="${CHART_BASE - 1.5}" width="${barWidth}" height="1.5" fill="${theme.lineStrong}"/>`);
      return;
    }
    const height = round(Math.max(1.5, week.count * scale));
    const y = round(CHART_BASE - height);
    card.add(
      isCurrent
        ? `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="1" fill="none" stroke="${theme.accent}" stroke-width="1.2" stroke-dasharray="2 2"/>`
        : `<rect class="b" style="animation-delay:${i * 14}ms" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="1" fill="${theme.accent}"/>`,
    );
  });
  card.baseline();
  weekly.forEach((week, i) => {
    const [, month, day] = week.start.split('-').map(Number);
    if (![1, 4, 7, 10].includes(month) || day > 7 || i === 0) return;
    const x = round(PAD + i * step);
    card.add(`<line x1="${x}" y1="${CHART_BASE}" x2="${x}" y2="${CHART_BASE + 5}" stroke="${theme.lineStrong}"/>`);
    card.text(monthLabel(week.start), x, CHART_BASE + 26, { fill: theme.muted });
  });
  return card.toSvg();
};

export const commitsCard = (theme, rows) => {
  const card = new Card(theme, `Commits by public repo: ${rows.map((r) => `${r.name} ${r.count}`).join(', ')}.`);
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

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const rhythmCard = (theme, totals, share) => {
  const busiest = totals.indexOf(Math.max(...totals));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const card = new Card(theme, `Contributions by weekday. Weekends carry ${share} percent; ${dayNames[busiest]} is the busiest day.`);
  card.eyebrow('WEEKLY RHYTHM', PAD);
  card.text(`weekends ${share}%`, WIDTH - PAD, EYEBROW_Y, { font: FONTS.serif, size: 17, anchor: 'end' });
  const max = Math.max(1, ...totals);
  WEEK_ORDER.forEach((weekday, k) => {
    const x = PAD + k * 49;
    const height = round((totals[weekday] / max) * (CHART_BASE - CHART_TOP));
    const isWeekend = weekday === 0 || weekday === 6;
    card.add(`<rect x="${x}" y="${round(CHART_BASE - height)}" width="34" height="${height}" rx="2" fill="${isWeekend ? theme.accent : theme.quiet}"/>`);
    card.text(DAY_INITIALS[weekday], x + 17, CHART_BASE + 26, { fill: theme.muted, anchor: 'middle' });
  });
  card.baseline();
  return card.toSvg();
};
