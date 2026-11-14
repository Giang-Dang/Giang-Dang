import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeDays,
  dayMonthVietnam,
  escapeMarkdown,
  fullDateVietnam,
  isShipping,
  latestTags,
  nowBuilding,
  publicCommitRows,
  replaceBlock,
  streaks,
  weekdayTotals,
  weekendShare,
} from '../scripts/lib/stats.mjs';

const day = (date, contributionCount, weekday) => ({ date, contributionCount, weekday });

test('streaks counts the best run and the run ending today', () => {
  const days = [1, 2, 0, 3, 4, 5, 0, 6, 7].map((n, i) => day(`2026-01-0${i + 1}`, n, i % 7));
  assert.deepEqual(streaks(days), { current: 2, best: 3 });
});

test('streaks keeps the run up to yesterday alive while today is still empty', () => {
  const days = [0, 1, 1, 1, 0].map((n, i) => day(`2026-01-0${i + 1}`, n, i));
  assert.deepEqual(streaks(days), { current: 3, best: 3 });
});

test('streaks is zero when the last two days are empty', () => {
  const days = [1, 0, 0].map((n, i) => day(`2026-01-0${i + 1}`, n, i));
  assert.equal(streaks(days).current, 0);
});

test('activeDays counts days with at least one contribution', () => {
  const days = [0, 3, 0, 1].map((n, i) => day(`2026-01-0${i + 1}`, n, i));
  assert.equal(activeDays(days), 2);
});

test('weekendShare rounds Saturday plus Sunday over the total', () => {
  const days = [day('a', 10, 0), day('b', 5, 1), day('c', 5, 3), day('d', 10, 6)];
  const totals = weekdayTotals(days);
  assert.deepEqual(totals, [10, 5, 0, 5, 0, 0, 10]);
  assert.equal(weekendShare(totals), 67);
});

test('weekendShare is zero when there is no activity', () => {
  assert.equal(weekendShare([0, 0, 0, 0, 0, 0, 0]), 0);
});

const byRepository = [
  { repository: { name: 'client-secret-work', isPrivate: true }, contributions: { totalCount: 900 } },
  { repository: { name: 'Giang-Dang', isPrivate: false }, contributions: { totalCount: 400 } },
  { repository: { name: 'snisplit', isPrivate: false }, contributions: { totalCount: 41 } },
  { repository: { name: 'latex-books', isPrivate: false }, contributions: { totalCount: 285 } },
  { repository: { name: 'mosaic-graph', isPrivate: false }, contributions: { totalCount: 35 } },
];

test('publicCommitRows drops private repos and the profile repo, then ranks by commits', () => {
  assert.deepEqual(publicCommitRows(byRepository, 'Giang-Dang', 2), [
    { name: 'latex-books', count: 285 },
    { name: 'snisplit', count: 41 },
  ]);
});

const repos = [
  { name: 'Giang-Dang', url: 'u0', pushedAt: '2026-11-14T23:00:00Z', isPrivate: false, latestTag: null },
  { name: 'computer-science-news', url: 'u5', pushedAt: '2026-11-14T20:00:00Z', isPrivate: false, latestTag: null },
  { name: 'snisplit', url: 'u1', pushedAt: '2026-11-14T10:00:00Z', isPrivate: false, latestTag: null },
  { name: 'mosaic-graph', url: 'u2', pushedAt: '2026-08-13T00:00:00Z', isPrivate: false, latestTag: 'ch18' },
  { name: 'rnn-to-transformer-lab', url: 'u3', pushedAt: '2026-08-12T00:00:00Z', isPrivate: false, latestTag: 'ch11' },
  { name: 'old-lab', url: 'u4', pushedAt: '2024-01-01T00:00:00Z', isPrivate: false, latestTag: 'v1' },
];

const NOT_HAND_PUSHED = ['Giang-Dang', 'computer-science-news'];

test('nowBuilding skips the profile repo and the routine repo, both pushed by automation', () => {
  assert.equal(nowBuilding(repos, NOT_HAND_PUSHED).name, 'snisplit');
});

test('nowBuilding is null when only automated repos exist', () => {
  assert.equal(nowBuilding([repos[0], repos[1]], NOT_HAND_PUSHED), null);
});

test('isShipping is true within seven days of the last hand push, ignoring automated repos', () => {
  const pushed = Date.parse('2026-11-14T10:00:00Z');
  assert.equal(isShipping(repos, NOT_HAND_PUSHED, pushed + 7 * 86_400_000), true);
  assert.equal(isShipping(repos, NOT_HAND_PUSHED, pushed + 7 * 86_400_000 + 1), false);
});

test('latestTags lists the most recently pushed tagged repos', () => {
  assert.deepEqual(latestTags(repos, ['Giang-Dang'], 2), [
    { name: 'mosaic-graph', url: 'u2', tag: 'ch18' },
    { name: 'rnn-to-transformer-lab', url: 'u3', tag: 'ch11' },
  ]);
});

test('dates are shown in Vietnam time, seven hours ahead of UTC', () => {
  assert.equal(dayMonthVietnam('2026-11-14T23:30:00Z'), '15 Nov');
  assert.equal(fullDateVietnam('2026-12-31T16:59:00Z'), '31 Dec 2026');
  assert.equal(fullDateVietnam('2026-12-31T17:00:00Z'), '1 Jan 2027');
});

test('escapeMarkdown neutralises emphasis, links and HTML in commit messages', () => {
  assert.equal(escapeMarkdown('fix *a* [b] <i>'), 'fix \\*a\\* \\[b\\] &lt;i&gt;');
});

test('replaceBlock swaps only the text between the markers', () => {
  const readme = 'top\n<!-- activity:start -->\nold\n<!-- activity:end -->\nbottom';
  assert.equal(replaceBlock(readme, 'new'), 'top\n<!-- activity:start -->\nnew\n<!-- activity:end -->\nbottom');
});

test('replaceBlock refuses a README without markers', () => {
  assert.throws(() => replaceBlock('no markers here', 'new'), /missing the activity markers/);
});
