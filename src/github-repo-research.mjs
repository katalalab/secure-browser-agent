import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_QUERIES = [
  'browser automation',
  'ai browser automation',
  'chrome devtools mcp',
  'browser mcp',
  'playwright automation',
  'headless browser scraping'
];

const KEYWORDS = [
  'agent-browser',
  'browser-use',
  'browser-tools-mcp',
  'chrome-devtools',
  'hyperagent',
  'lightpanda',
  'playwright',
  'puppeteer',
  'scrapling',
  'selenium',
  'skyvern'
];

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function runGhJson(args, runner) {
  const output = runner(args);
  if (!output) return null;
  return JSON.parse(output);
}

function defaultGhRunner(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function repoKey(repo = {}) {
  return repo.fullName || repo.full_name || repo.nameWithOwner || repo.name || repo.url || '';
}

function normalizeRepo(repo = {}, source, query = '') {
  const fullName = repo.fullName || repo.full_name || repo.nameWithOwner || repo.name || '';
  return {
    fullName,
    url: repo.url || repo.html_url || (fullName ? `https://github.com/${fullName}` : ''),
    description: repo.description || '',
    stars: Number(repo.stargazersCount ?? repo.stargazers_count ?? 0),
    language: repo.language || repo.primaryLanguage?.name || '',
    updatedAt: repo.updatedAt || repo.updated_at || '',
    source,
    query
  };
}

function uniqueRepos(repos) {
  const seen = new Map();
  for (const repo of repos) {
    const key = repoKey(repo).toLowerCase();
    if (!key) continue;
    const current = seen.get(key);
    if (!current || Number(repo.stars || 0) > Number(current.stars || 0)) seen.set(key, repo);
  }
  return [...seen.values()].sort((a, b) => (b.stars || 0) - (a.stars || 0));
}

function githubPopularRepos({ queries, limit, runner }) {
  const repos = [];
  for (const query of queries) {
    const result = runGhJson([
      'search',
      'repos',
      query,
      '--stars',
      '>500',
      '--limit',
      String(limit),
      '--json',
      'fullName,stargazersCount,description,url,updatedAt,language'
    ], runner);
    if (Array.isArray(result)) repos.push(...result.map((repo) => normalizeRepo(repo, 'github-popular', query)));
  }
  return uniqueRepos(repos).slice(0, limit);
}

function githubStarredRepos({ limit, runner }) {
  const result = runGhJson(['api', 'user/starred?per_page=100'], runner);
  const repos = Array.isArray(result) ? result : [];
  return uniqueRepos(repos.map((repo) => normalizeRepo(repo, 'github-starred')))
    .filter((repo) => {
      const text = `${repo.fullName} ${repo.description} ${repo.language}`.toLowerCase();
      return KEYWORDS.some((keyword) => text.includes(keyword)) || /browser|scrap|crawl|automation|mcp|agent/.test(text);
    })
    .slice(0, limit);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function remoteUrl(repoDir) {
  const config = readText(path.join(repoDir, '.git', 'config'));
  const match = config.match(/\[remote "origin"\][\s\S]*?\n\s*url\s*=\s*(.+)/);
  return match ? match[1].trim() : '';
}

function localRepoScore(repoDir, remote) {
  const haystack = `${repoDir} ${remote} ${readText(path.join(repoDir, 'README.md')).slice(0, 4000)}`.toLowerCase();
  return KEYWORDS.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

function childDirs(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !['node_modules', '.cache', '.tmp', 'runs', 'profiles'].includes(entry.name))
      .sort((a, b) => {
        const aHit = KEYWORDS.some((keyword) => a.name.toLowerCase().includes(keyword));
        const bHit = KEYWORDS.some((keyword) => b.name.toLowerCase().includes(keyword));
        return Number(bHit) - Number(aHit) || a.name.localeCompare(b.name);
      })
      .slice(0, 120)
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

function discoverLocalRepoDirs(root) {
  const candidates = [];
  for (const top of childDirs(root)) {
    candidates.push(top);
    if (fs.existsSync(path.join(top, '.git'))) continue;
    for (const second of childDirs(top)) candidates.push(second);
    if (candidates.length >= 300) break;
  }
  return candidates;
}

function describeLocalRepo(repoDir) {
  try {
    if (!fs.existsSync(path.join(repoDir, '.git'))) return null;
  } catch {
    return null;
  }
  const remote = remoteUrl(repoDir);
  const score = localRepoScore(repoDir, remote);
  if (score <= 0) return null;
  return {
    path: repoDir,
    remote,
    score,
    source: 'local-clone'
  };
}

function defaultLocalRoots(homeDir) {
  return [
    path.join(homeDir, 'work/nicolas-starred-repos/repos'),
    path.join(homeDir, 'work/claude-skill-sources/repos')
  ];
}

function defaultLocalCandidatePaths(homeDir) {
  return [
    path.join(homeDir, 'Documents/GitHub/felipeorlando-stars/AgentDeskAI/browser-tools-mcp'),
    path.join(homeDir, 'Documents/GitHub/agent-skill'),
    path.join(homeDir, 'Documents/GitHub/felipeorlando-stars/aghyad97/browserytools'),
    path.join(homeDir, 'Documents/GitHub/browser-use'),
    path.join(homeDir, 'work/nicolas-starred-repos/repos/vercel-labs_agent-browser'),
    path.join(homeDir, 'work/nicolas-starred-repos/repos/browser-use_browser-use'),
    path.join(homeDir, 'work/nicolas-starred-repos/repos/lightpanda-io_browser'),
    path.join(homeDir, 'work/nicolas-starred-repos/repos/microsoft_playwright-mcp'),
    path.join(homeDir, 'work/nicolas-starred-repos/repos/BrowserMCP_mcp'),
    path.join(homeDir, 'work/nicolas-starred-repos/repos/Skyvern-AI_skyvern')
  ];
}

function localCloneCandidates({ localRoots, localPaths, limit, scanLocalRoots = false }) {
  const repos = [];
  for (const repoDir of localPaths) {
    const repo = describeLocalRepo(repoDir);
    if (repo) repos.push(repo);
  }
  if (!scanLocalRoots) {
    return repos
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, limit);
  }
  for (const root of localRoots) {
    for (const repoDir of discoverLocalRepoDirs(root)) {
      const repo = describeLocalRepo(repoDir);
      if (repo) repos.push(repo);
    }
  }
  return repos
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function classify(repo) {
  const text = `${repo.fullName || ''} ${repo.description || ''} ${repo.remote || ''} ${repo.path || ''}`.toLowerCase();
  if (text.includes('agent-browser')) return { posture: 'adopt-engine-reference', takeaway: 'Keep agent-browser/CDP patterns close to the fast agent-facing path.' };
  if (text.includes('chrome') && text.includes('mcp')) return { posture: 'companion-reference', takeaway: 'Use for DevTools/MCP ergonomics, not default credential storage.' };
  if (text.includes('playwright')) return { posture: 'adapter-reference', takeaway: 'Use for structured tests and compatibility; storageState remains sensitive.' };
  if (text.includes('lightpanda')) return { posture: 'public-crawl-candidate', takeaway: 'Benchmark for unauthenticated crawl speed before adoption.' };
  if (text.includes('selenium')) return { posture: 'compatibility-only', takeaway: 'Keep as WebDriver/BiDi fallback, not the agent default.' };
  if (text.includes('browser-use') || text.includes('skyvern') || text.includes('hyperagent')) return { posture: 'agent-pattern-study', takeaway: 'Study task planning and recovery patterns without broadening auth authority.' };
  return { posture: 'study', takeaway: 'Review selectively for extraction and operator UX patterns.' };
}

function toFinding(item) {
  const classified = classify(item);
  return {
    ...item,
    ...classified
  };
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'research/github-repo-research-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid github repo research output path: ${outPath}`);
  return outputPath;
}

export function writeGithubRepoResearch(rootDir, report, outPath = 'research/github-repo-research-latest.json') {
  const outputPath = safeRunPath(rootDir, outPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

export function buildGithubRepoResearch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const homeDir = options.homeDir || os.homedir();
  const limit = Number(options.limit || 12);
  const queries = options.queries || DEFAULT_QUERIES;
  const runner = options.ghRunner || defaultGhRunner;
  const localRoots = options.localRoots || defaultLocalRoots(homeDir);
  const localPaths = options.localPaths || defaultLocalCandidatePaths(homeDir);
  const includeGithub = options.includeGithub !== false;
  const popular = includeGithub ? githubPopularRepos({ queries, limit, runner }) : [];
  const starred = includeGithub ? githubStarredRepos({ limit, runner }) : [];
  const local = localCloneCandidates({
    localRoots,
    localPaths,
    limit,
    scanLocalRoots: Boolean(options.scanLocalRoots)
  });
  const findings = [
    ...popular.map(toFinding),
    ...starred.map(toFinding),
    ...local.map(toFinding)
  ];
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    retrievalDate: options.retrievalDate || new Date().toISOString().slice(0, 10),
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    githubQueried: includeGithub,
    queries,
    summary: {
      popularCount: popular.length,
      starredCount: starred.length,
      localCloneCount: local.length,
      findingCount: findings.length,
      topPostures: [...new Set(findings.map((item) => item.posture))].slice(0, 8),
      recommendation: 'Keep direct CDP/agent-browser as the authenticated default; use Playwright for tests, Chrome DevTools MCP as companion, Lightpanda for public crawl benchmarks, Selenium only for compatibility.'
    },
    popular: popular.map(toFinding),
    starred: starred.map(toFinding),
    local: local.map(toFinding),
    commands: {
      refresh: command(['node', 'src/cli.mjs', 'github-repo-research', '--write', '--out', 'research/github-repo-research-latest.json', '--format', 'compact'])
    }
  };
}

export function formatGithubRepoResearchCompact(report) {
  const lines = [
    `safe_mode: ${yesNo(report.safeMode)}`,
    `status_only: ${yesNo(report.statusOnly)}`,
    `destructive_actions: ${yesNo(report.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(report.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(report.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(report.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(report.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(report.pageContentReturned)}`,
    `github_queried: ${yesNo(report.githubQueried)}`,
    `retrieval_date: ${compact(report.retrievalDate)}`,
    `popular_count: ${report.summary?.popularCount ?? 0}`,
    `starred_count: ${report.summary?.starredCount ?? 0}`,
    `local_clone_count: ${report.summary?.localCloneCount ?? 0}`,
    `top_postures: ${report.summary?.topPostures?.length ? report.summary.topPostures.join(',') : 'none'}`,
    `recommendation: ${compact(report.summary?.recommendation)}`
  ];
  for (const [index, repo] of (report.popular || []).slice(0, 8).entries()) {
    lines.push(`popular_${index + 1}: ${compact(repo.fullName)} stars=${repo.stars || 0} posture=${compact(repo.posture)}`);
  }
  for (const [index, repo] of (report.starred || []).slice(0, 8).entries()) {
    lines.push(`starred_${index + 1}: ${compact(repo.fullName)} stars=${repo.stars || 0} posture=${compact(repo.posture)}`);
  }
  for (const [index, repo] of (report.local || []).slice(0, 8).entries()) {
    lines.push(`local_${index + 1}: ${compact(repo.remote || repo.path)} score=${repo.score || 0} posture=${compact(repo.posture)}`);
  }
  if (report.commands?.refresh?.shell) lines.push(`refresh_command: ${report.commands.refresh.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatGithubRepoResearchMarkdown(report) {
  const lines = [
    '# GitHub Browser Automation Repository Research',
    '',
    `Generated: ${report.generatedAt}`,
    `Retrieval date: ${report.retrievalDate}`,
    '',
    '## Recommendation',
    '',
    `- ${report.summary.recommendation}`,
    '',
    '## Popular GitHub Repositories',
    ''
  ];
  for (const repo of report.popular || []) {
    lines.push(`- ${repo.fullName} (${repo.stars || 0} stars): ${repo.posture} - ${repo.takeaway}`);
  }
  lines.push('', '## Starred Repositories', '');
  for (const repo of report.starred || []) {
    lines.push(`- ${repo.fullName} (${repo.stars || 0} stars): ${repo.posture} - ${repo.takeaway}`);
  }
  lines.push('', '## Local Clones', '');
  for (const repo of report.local || []) {
    lines.push(`- ${repo.remote || repo.path}: ${repo.posture} - ${repo.takeaway}`);
  }
  lines.push('');
  return lines.join('\n');
}
