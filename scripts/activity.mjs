import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { THEMES, buildingCard, commitsCard, heroNarrow, heroWide, overviewCard, tagsCard } from './lib/draw.mjs';
import {
  activeDays,
  dayMonthVietnam,
  flattenDays,
  fullDateVietnam,
  isShipping,
  latestTags,
  nowBuilding,
  publicCommitRows,
  replaceBlock,
  stampAssets,
  versionStamp,
  streaks,
  weekdayTotals,
  weekendShare,
} from './lib/stats.mjs';

const LOGIN = process.env.GH_LOGIN ?? 'Giang-Dang';
const PROFILE_REPO = LOGIN;
const ROUTINE_REPOS = ['computer-science-news'];
const NOT_HAND_PUSHED = [PROFILE_REPO, ...ROUTINE_REPOS];
const HIDDEN_FROM_COMMITS = [PROFILE_REPO, 'latex-books'];
const TOKEN = process.env.GH_TOKEN;
const COMMIT_ROWS = 5;
const TAG_ROWS = 2;
const MIDDOT = String.fromCharCode(0xb7);

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      restrictedContributionsCount
      contributionCalendar { weeks { contributionDays { contributionCount date weekday } } }
      commitContributionsByRepository(maxRepositories: 25) {
        repository { name isPrivate }
        contributions { totalCount }
      }
    }
    repositories(first: 20, privacy: PUBLIC, ownerAffiliations: OWNER, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes {
        name url pushedAt isPrivate description
        primaryLanguage { name }
        refs(refPrefix: "refs/tags/", first: 1, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) { nodes { name } }
        defaultBranchRef { target { ... on Commit { history(first: 1) { nodes { messageHeadline } } } } }
      }
    }
  }
}`;

const fetchActivity = async () => {
  if (!TOKEN) throw new Error('GH_TOKEN is not set');
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${TOKEN}`, 'content-type': 'application/json', 'user-agent': 'activity-cards' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) throw new Error(`GitHub API error: ${JSON.stringify(payload.errors ?? payload)}`);
  return payload.data.user;
};

const toRepo = (node) => ({
  name: node.name,
  url: node.url,
  pushedAt: node.pushedAt,
  isPrivate: node.isPrivate,
  description: node.description,
  language: node.primaryLanguage?.name ?? null,
  latestTag: node.refs.nodes[0]?.name ?? null,
  lastCommit: node.defaultBranchRef?.target?.history?.nodes[0]?.messageHeadline ?? null,
});

const footerLine = ({ hasPrivate, now }) => {
  const scope = hasPrivate ? 'Counts include private work' : 'Counts cover public work';
  return `${scope} ${MIDDOT} repo lists are public only ${MIDDOT} updated ${fullDateVietnam(now.toISOString())}`;
};

const main = async () => {
  const user = await fetchActivity();
  const collection = user.contributionsCollection;
  const weeks = collection.contributionCalendar.weeks;
  const days = flattenDays(weeks);
  const repos = user.repositories.nodes.map(toRepo);
  const now = new Date();
  const totals = weekdayTotals(days);
  const commitRows = publicCommitRows(collection.commitContributionsByRepository, HIDDEN_FROM_COMMITS, COMMIT_ROWS);
  const building = nowBuilding(repos, NOT_HAND_PUSHED);

  const buildingCommits =
    publicCommitRows(collection.commitContributionsByRepository, [PROFILE_REPO], Infinity).find((row) => row.name === building?.name)
      ?.count ?? null;
  const tags = latestTags(repos, [PROFILE_REPO], TAG_ROWS);

  const themedCards = {
    overview: (theme) =>
      overviewCard(theme, {
        active: activeDays(days),
        streak: streaks(days).current,
        isShipping: isShipping(repos, NOT_HAND_PUSHED, now.getTime()),
        totals,
        share: weekendShare(totals),
      }),
    commits: (theme) => commitsCard(theme, commitRows),
    building: (theme) =>
      buildingCard(theme, {
        repo: building,
        commits: buildingCommits,
        pushedLabel: building ? `pushed ${dayMonthVietnam(building.pushedAt)}` : '',
      }),
    tags: (theme) => tagsCard(theme, tags),
  };

  const files = { 'hero-wide.svg': heroWide(), 'hero-narrow.svg': heroNarrow() };
  for (const [name, draw] of Object.entries(themedCards)) {
    for (const [themeName, theme] of Object.entries(THEMES)) files[`${name}-${themeName}.svg`] = draw(theme);
  }
  mkdirSync('assets', { recursive: true });
  for (const [file, svg] of Object.entries(files)) writeFileSync(`assets/${file}`, `${svg}\n`);

  const block = footerLine({ hasPrivate: collection.restrictedContributionsCount > 0, now });
  writeFileSync('README.md', stampAssets(replaceBlock(readFileSync('README.md', 'utf8'), block), versionStamp(now)));
};

await main();
