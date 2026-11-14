import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { THEMES, overviewCard, commitsCard } from './lib/draw.mjs';
import {
  activeDays,
  dayMonthVietnam,
  escapeMarkdown,
  flattenDays,
  fullDateVietnam,
  isShipping,
  latestTags,
  nowBuilding,
  publicCommitRows,
  replaceBlock,
  streaks,
  weekdayTotals,
  weekendShare,
} from './lib/stats.mjs';

const LOGIN = process.env.GH_LOGIN ?? 'Giang-Dang';
const PROFILE_REPO = LOGIN;
const ROUTINE_REPOS = ['computer-science-news'];
const NOT_HAND_PUSHED = [PROFILE_REPO, ...ROUTINE_REPOS];
const TOKEN = process.env.GH_TOKEN;
const COMMIT_ROWS = 5;
const TAG_ROWS = 2;
const MIDDOT = String.fromCharCode(0xb7);
const GUILLEMET = String.fromCharCode(0x203a);

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
        name url pushedAt isPrivate
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
  language: node.primaryLanguage?.name ?? null,
  latestTag: node.refs.nodes[0]?.name ?? null,
  lastCommit: node.defaultBranchRef?.target?.history?.nodes[0]?.messageHeadline ?? null,
});

const markdownBlock = ({ building, buildingCommits, tags, hasPrivate, now }) => {
  const lines = [];
  if (building) {
    const meta = [building.language, `pushed ${dayMonthVietnam(building.pushedAt)}`].filter(Boolean).join(` ${MIDDOT} `);
    const commits = buildingCommits ? ` ${MIDDOT} ${buildingCommits} commits this year` : '';
    lines.push(`**Now building** ${MIDDOT} [${building.name}](${building.url}) ${MIDDOT} ${meta}${commits}<br>`);
    if (building.lastCommit) lines.push(`${GUILLEMET} ${escapeMarkdown(building.lastCommit)}`);
    lines.push('');
  }
  if (tags.length > 0) {
    lines.push(`**Latest tags** ${MIDDOT} ${tags.map((t) => `[${t.name}](${t.url}) \`${t.tag}\``).join(` ${MIDDOT} `)}`);
    lines.push('');
  }
  const scope = hasPrivate ? 'Counts include private work' : 'Counts cover public work';
  lines.push(`${scope} ${MIDDOT} repo lists are public only ${MIDDOT} updated ${fullDateVietnam(now.toISOString())}`);
  return lines.join('\n');
};

const main = async () => {
  const user = await fetchActivity();
  const collection = user.contributionsCollection;
  const weeks = collection.contributionCalendar.weeks;
  const days = flattenDays(weeks);
  const repos = user.repositories.nodes.map(toRepo);
  const now = new Date();
  const totals = weekdayTotals(days);
  const commitRows = publicCommitRows(collection.commitContributionsByRepository, PROFILE_REPO, COMMIT_ROWS);
  const building = nowBuilding(repos, NOT_HAND_PUSHED);

  const cards = {
    overview: (theme) =>
      overviewCard(theme, {
        active: activeDays(days),
        streak: streaks(days).current,
        isShipping: isShipping(repos, NOT_HAND_PUSHED, now.getTime()),
        totals,
        share: weekendShare(totals),
      }),
    commits: (theme) => commitsCard(theme, commitRows),
  };

  mkdirSync('assets', { recursive: true });
  for (const [name, draw] of Object.entries(cards)) {
    for (const [themeName, theme] of Object.entries(THEMES)) {
      writeFileSync(`assets/${name}-${themeName}.svg`, `${draw(theme)}\n`);
    }
  }

  const block = markdownBlock({
    building,
    buildingCommits:
      publicCommitRows(collection.commitContributionsByRepository, PROFILE_REPO, Infinity).find((row) => row.name === building?.name)
        ?.count ?? null,
    tags: latestTags(repos, [PROFILE_REPO], TAG_ROWS),
    hasPrivate: collection.restrictedContributionsCount > 0,
    now,
  });
  writeFileSync('README.md', replaceBlock(readFileSync('README.md', 'utf8'), block));
};

await main();
