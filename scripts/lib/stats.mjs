const DAY_MS = 86_400_000;
const SHIPPING_WINDOW_DAYS = 7;
const SATURDAY = 6;
const SUNDAY = 0;
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const flattenDays = (weeks) => weeks.flatMap((week) => week.contributionDays);

export const activeDays = (days) => days.filter((day) => day.contributionCount > 0).length;

export const streaks = (days) => {
  let best = 0;
  let run = 0;
  for (const day of days) {
    run = day.contributionCount > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const lastIndex = days.length - 1;
  const isTodayEmpty = lastIndex >= 0 && days[lastIndex].contributionCount === 0;
  let current = 0;
  for (let i = isTodayEmpty ? lastIndex - 1 : lastIndex; i >= 0 && days[i].contributionCount > 0; i--) {
    current += 1;
  }
  return { current, best };
};

export const weekdayTotals = (days) => {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const day of days) totals[day.weekday] += day.contributionCount;
  return totals;
};

export const weekendShare = (totals) => {
  const all = totals.reduce((sum, n) => sum + n, 0);
  return all === 0 ? 0 : Math.round(((totals[SUNDAY] + totals[SATURDAY]) / all) * 100);
};

export const publicCommitRows = (byRepository, excludedNames, limit) =>
  byRepository
    .filter(({ repository }) => !repository.isPrivate && !excludedNames.includes(repository.name))
    .map(({ repository, contributions }) => ({ name: repository.name, count: contributions.totalCount }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

export const ownPublicRepos = (repos, excludedNames) =>
  repos.filter((repo) => !repo.isPrivate && !excludedNames.includes(repo.name));

export const nowBuilding = (repos, excludedNames) => {
  const [latest] = ownPublicRepos(repos, excludedNames).sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
  return latest ?? null;
};

export const isShipping = (repos, excludedNames, now) =>
  ownPublicRepos(repos, excludedNames).some((repo) => now - Date.parse(repo.pushedAt) <= SHIPPING_WINDOW_DAYS * DAY_MS);

export const latestTags = (repos, excludedNames, limit) =>
  ownPublicRepos(repos, excludedNames)
    .filter((repo) => repo.latestTag)
    .slice(0, limit)
    .map((repo) => ({ name: repo.name, url: repo.url, tag: repo.latestTag, description: repo.description ?? null }));

const vietnamDateParts = (iso) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: VIETNAM_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );

export const dayMonthVietnam = (iso) => {
  const parts = vietnamDateParts(iso);
  return `${parts.day} ${parts.month}`;
};

export const fullDateVietnam = (iso) => {
  const parts = vietnamDateParts(iso);
  return `${parts.day} ${parts.month} ${parts.year}`;
};

export const START_MARKER = '<!-- activity:start -->';
export const END_MARKER = '<!-- activity:end -->';

export const replaceBlock = (readme, block) => {
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) throw new Error('README is missing the activity markers');
  return `${readme.slice(0, start + START_MARKER.length)}\n${block}\n${readme.slice(end)}`;
};
