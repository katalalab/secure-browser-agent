import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectProviderStatus } from './provider-report.mjs';

export const SOURCE_TARGETS = [
  {
    id: 'secure-browser-agent',
    label: 'secure-browser-agent',
    role: 'local product surface',
    posture: 'own',
    candidates: ({ rootDir }) => [rootDir],
    notes: 'Keep as the bounded default surface for authenticated local browser work.'
  },
  {
    id: 'agent-browser',
    label: 'vercel-labs/agent-browser',
    role: 'fast Chrome/CDP execution engine',
    posture: 'adopt',
    candidates: ({ homeDir }) => [
      path.join(homeDir, 'work/claude-skill-sources/repos/vercel-labs__agent-browser'),
      path.join(homeDir, 'work/nicolas-starred-repos/repos/vercel-labs_agent-browser')
    ],
    notes: 'Primary low-token browser control substrate; keep direct CDP fallback for tighter security and target-pack behavior.'
  },
  {
    id: 'chrome-devtools-mcp',
    label: 'Chrome DevTools MCP',
    role: 'debug and performance companion',
    posture: 'companion',
    candidates: ({ homeDir }) => [
      path.join(homeDir, 'work/docs/agent-routing/chrome-devtools-mcp-pilot')
    ],
    notes: 'Use with a dedicated profile or browser URL only; do not attach to a normal Chrome profile by default.'
  },
  {
    id: 'playwright-mcp',
    label: 'microsoft/playwright-mcp',
    role: 'rich automation and test adapter',
    posture: 'adapter',
    candidates: ({ rootDir, homeDir }) => [
      path.resolve(rootDir, '../playwright-mcp'),
      path.join(homeDir, 'work/nicolas-starred-repos/repos/microsoft_playwright-mcp')
    ],
    notes: 'Good for structured tests and accessibility snapshots; storage state remains sensitive.'
  },
  {
    id: 'lightpanda-browser',
    label: 'lightpanda-io/browser',
    role: 'public crawl accelerator candidate',
    posture: 'benchmark-before-adopt',
    candidates: ({ homeDir }) => [
      path.join(homeDir, 'work/nicolas-starred-repos/repos/lightpanda-io_browser')
    ],
    notes: 'Keep unauthenticated/public only until binary compatibility and target coverage are proven.'
  },
  {
    id: 'lightpanda-skill',
    label: 'lightpanda agent skill',
    role: 'usage patterns for Lightpanda',
    posture: 'study',
    candidates: ({ homeDir }) => [
      path.join(homeDir, 'work/claude-skill-sources/repos/lightpanda-io__agent-skill'),
      path.join(homeDir, 'work/nicolas-starred-repos/repos/lightpanda-io_agent-skill'),
      path.join(homeDir, 'work/agent-skills-private/skills/lightpanda')
    ],
    notes: 'Useful for workflow examples, not a credential-bearing browser backend by itself.'
  },
  {
    id: 'browser-use',
    label: 'browser-use/browser-use',
    role: 'agent browser automation reference',
    posture: 'study',
    candidates: ({ homeDir }) => [
      path.join(homeDir, 'Documents/GitHub/browser-use'),
      path.join(homeDir, 'work/nicolas-starred-repos/repos/browser-use_browser-use')
    ],
    notes: 'Study high-level agent patterns; avoid importing broad browser authority into authenticated target packs.'
  },
  {
    id: 'browsermcp',
    label: 'BrowserMCP/mcp',
    role: 'browser MCP reference',
    posture: 'study',
    candidates: ({ homeDir }) => [
      path.join(homeDir, 'work/nicolas-starred-repos/repos/BrowserMCP_mcp')
    ],
    notes: 'Reference MCP ergonomics; keep this project tool surface narrower for secrets and profiles.'
  },
  {
    id: 'skyvern',
    label: 'Skyvern-AI/skyvern',
    role: 'workflow automation reference',
    posture: 'study',
    candidates: ({ homeDir }) => [
      path.join(homeDir, 'work/nicolas-starred-repos/repos/Skyvern-AI_skyvern')
    ],
    notes: 'Study task/workflow modeling; too broad to be the default local credential holder.'
  },
  {
    id: 'scrapling',
    label: 'D4Vinci/Scrapling',
    role: 'scraping resilience reference',
    posture: 'study',
    candidates: ({ homeDir }) => [
      path.join(homeDir, 'work/nicolas-starred-repos/repos/D4Vinci_Scrapling')
    ],
    notes: 'Study extraction robustness; authenticated browser state stays in dedicated Chrome profiles.'
  }
];

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/)[0].trim();
}

function parseTomlField(contents, field) {
  const match = contents.match(new RegExp(`^\\s*${field}\\s*=\\s*["']([^"']+)["']`, 'm'));
  return match ? match[1] : '';
}

function gitInfo(repoDir) {
  const gitPath = path.join(repoDir, '.git');
  if (!fileExists(gitPath)) return { exists: false, branch: '', commit: '' };
  const stat = fs.statSync(gitPath);
  const gitDir = stat.isDirectory()
    ? gitPath
    : path.resolve(repoDir, readText(gitPath).replace(/^gitdir:\s*/i, '').trim());
  const head = readText(path.join(gitDir, 'HEAD')).trim();
  if (!head) return { exists: true, branch: '', commit: '' };
  if (!head.startsWith('ref:')) return { exists: true, branch: '', commit: head.slice(0, 12) };
  const ref = head.replace(/^ref:\s*/, '');
  return {
    exists: true,
    branch: ref.replace(/^refs\/heads\//, ''),
    commit: readText(path.join(gitDir, ref)).trim().slice(0, 12)
  };
}

function manifestInfo(repoDir) {
  const packageJson = readJson(path.join(repoDir, 'package.json'));
  if (packageJson) {
    return {
      type: 'package.json',
      name: packageJson.name || '',
      version: packageJson.version || '',
      private: Boolean(packageJson.private)
    };
  }
  const cargoToml = readText(path.join(repoDir, 'Cargo.toml'));
  if (cargoToml) {
    return {
      type: 'Cargo.toml',
      name: parseTomlField(cargoToml, 'name'),
      version: parseTomlField(cargoToml, 'version'),
      private: false
    };
  }
  const pyprojectToml = readText(path.join(repoDir, 'pyproject.toml'));
  if (pyprojectToml) {
    return {
      type: 'pyproject.toml',
      name: parseTomlField(pyprojectToml, 'name'),
      version: parseTomlField(pyprojectToml, 'version'),
      private: false
    };
  }
  return { type: '', name: '', version: '', private: false };
}

function readmeTitle(repoDir) {
  const names = ['README.md', 'readme.md', 'README'];
  for (const name of names) {
    const line = readText(path.join(repoDir, name))
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item && !item.startsWith('<'));
    if (line) return line.replace(/^#\s*/, '');
  }
  return '';
}

export function describeSourcePath(repoDir) {
  const exists = fileExists(repoDir);
  if (!exists) {
    return {
      path: repoDir,
      exists: false,
      git: { exists: false, branch: '', commit: '' },
      manifest: { type: '', name: '', version: '', private: false },
      markers: {}
    };
  }
  return {
    path: repoDir,
    exists: true,
    git: gitInfo(repoDir),
    manifest: manifestInfo(repoDir),
    readmeTitle: readmeTitle(repoDir),
    markers: {
      packageJson: fileExists(path.join(repoDir, 'package.json')),
      cargoToml: fileExists(path.join(repoDir, 'Cargo.toml')),
      pyprojectToml: fileExists(path.join(repoDir, 'pyproject.toml')),
      readme: ['README.md', 'readme.md', 'README'].some((name) => fileExists(path.join(repoDir, name)))
    }
  };
}

function readiness(status) {
  return {
    agentBrowser: Boolean(status.agentBrowser?.exists),
    chromeForTesting: Boolean(status.chromeForTesting?.exists),
    secureBrowserAgentMcp: Boolean(status.secureBrowserAgentMcp?.exists),
    playwrightCore: Boolean(status.playwright?.coreExists),
    lightpandaBinary: Boolean(status.lightpanda?.binaryExists),
    seleniumWebdriver: Boolean(status.selenium?.webdriverPackageExists)
  };
}

function recommendationFor(readinessMap) {
  const next = [
    'Keep direct Chrome CDP with dedicated target profiles as the authenticated default.',
    'Use source-audit plus providers before changing provider roles or credential boundaries.'
  ];
  if (!readinessMap.lightpandaBinary) next.push('Add Lightpanda only after a local binary is configured and public URL benchmarks pass.');
  if (!readinessMap.seleniumWebdriver) next.push('Do not add Selenium unless an existing WebDriver/BiDi grid or compatibility requirement appears.');
  return next;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function buildSourceAudit(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const homeDir = options.homeDir || os.homedir();
  const status = options.status || detectProviderStatus({ rootDir, homeDir, env: options.env || process.env });
  const ready = readiness(status);
  const targets = SOURCE_TARGETS.map((target) => {
    const candidates = target.candidates({ rootDir, homeDir });
    const paths = candidates.map((candidate) => describeSourcePath(candidate));
    const present = paths.filter((item) => item.exists);
    return {
      id: target.id,
      label: target.label,
      role: target.role,
      posture: target.posture,
      present: present.length > 0,
      primaryPath: present[0]?.path || '',
      cloneCount: present.length,
      paths,
      notes: target.notes
    };
  });

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    homeDir,
    summary: {
      targets: targets.length,
      presentTargets: targets.filter((target) => target.present).length,
      missingTargets: targets.filter((target) => !target.present).map((target) => target.id),
      readiness: ready,
      next: recommendationFor(ready)
    },
    providerStatus: status,
    targets
  };
}

export function formatSourceAuditMarkdown(report) {
  const cell = (value) => String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [
    '# Secure Browser Agent Source Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Root: ${report.rootDir}`,
    '',
    '## Summary',
    '',
    `- Source targets: ${report.summary.presentTargets}/${report.summary.targets} present`,
    `- agent-browser: ${report.summary.readiness.agentBrowser ? 'ready' : 'missing'}`,
    `- Chrome for Testing: ${report.summary.readiness.chromeForTesting ? 'ready' : 'missing'}`,
    `- Playwright core: ${report.summary.readiness.playwrightCore ? 'ready' : 'missing'}`,
    `- Lightpanda binary: ${report.summary.readiness.lightpandaBinary ? report.providerStatus.lightpanda.binaryPath : 'missing'}`,
    `- Selenium webdriver: ${report.summary.readiness.seleniumWebdriver ? 'ready' : 'missing'}`,
    '',
    '## Sources',
    '',
    '| Source | Role | Posture | Local | Evidence |',
    '| --- | --- | --- | --- | --- |'
  ];

  for (const target of report.targets) {
    const evidence = target.present
      ? target.paths
        .filter((item) => item.exists)
        .map((item) => {
          const version = item.manifest.version ? ` ${item.manifest.version}` : '';
          const name = item.manifest.name || item.readmeTitle || 'source';
          return `${name}${version} at ${item.path}`;
        })
        .join('<br>')
      : 'missing';
    lines.push(`| ${cell(target.label)} | ${cell(target.role)} | ${cell(target.posture)} | ${target.present ? 'present' : 'missing'} | ${cell(evidence)} |`);
  }

  lines.push('', '## Next', '');
  for (const item of report.summary.next) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

export function formatSourceAuditCompact(report) {
  const targets = Array.isArray(report.targets) ? report.targets : [];
  const missingTargets = Array.isArray(report.summary?.missingTargets) ? report.summary.missingTargets : [];
  const lines = [
    `source_targets: ${report.summary?.targets ?? targets.length}`,
    `source_present_targets: ${report.summary?.presentTargets ?? targets.filter((target) => target.present).length}`,
    `source_missing_targets: ${missingTargets.length ? missingTargets.join(',') : 'none'}`,
    `readiness_agent_browser: ${yesNo(report.summary?.readiness?.agentBrowser)}`,
    `readiness_chrome_for_testing: ${yesNo(report.summary?.readiness?.chromeForTesting)}`,
    `readiness_secure_browser_agent_mcp: ${yesNo(report.summary?.readiness?.secureBrowserAgentMcp)}`,
    `readiness_playwright_core: ${yesNo(report.summary?.readiness?.playwrightCore)}`,
    `readiness_lightpanda_binary: ${yesNo(report.summary?.readiness?.lightpandaBinary)}`,
    `readiness_selenium_webdriver: ${yesNo(report.summary?.readiness?.seleniumWebdriver)}`
  ];
  for (const target of targets) {
    const prefix = `source_${target.id.replace(/[^a-zA-Z0-9]+/g, '_')}`;
    const primary = target.paths?.find((item) => item.exists) || {};
    lines.push(`${prefix}_present: ${yesNo(target.present)}`);
    lines.push(`${prefix}_posture: ${compact(target.posture)}`);
    lines.push(`${prefix}_role: ${compact(target.role)}`);
    lines.push(`${prefix}_path: ${compact(primary.path || target.primaryPath)}`);
    lines.push(`${prefix}_commit: ${compact(primary.git?.commit)}`);
    lines.push(`${prefix}_manifest: ${compact(primary.manifest?.name || primary.readmeTitle)}`);
    lines.push(`${prefix}_version: ${compact(primary.manifest?.version)}`);
  }
  const next = Array.isArray(report.summary?.next) ? report.summary.next : [];
  lines.push(`next: ${next.length ? next.map((item) => compact(item)).join(' | ') : 'none'}`);
  return `${lines.join('\n')}\n`;
}
