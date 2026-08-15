import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RETRIEVED_AT = '2026-05-28';

export const PROVIDER_SOURCES = [
  {
    id: 'chrome-devtools-mcp',
    url: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    retrievedAt: RETRIEVED_AT,
    finding: 'Chrome DevTools MCP can launch a dedicated profile, auto-connect to Chrome 144+, or connect to a remote debugging port; the docs warn that a debugging port lets local applications control the browser and should use a non-default user data directory.'
  },
  {
    id: 'playwright-auth',
    url: 'https://playwright.dev/docs/auth',
    retrievedAt: RETRIEVED_AT,
    finding: 'Playwright stores authenticated browser state on disk and warns that state files can contain sensitive cookies and headers that can impersonate the account.'
  },
  {
    id: 'playwright-mcp',
    url: 'https://github.com/microsoft/playwright-mcp',
    retrievedAt: RETRIEVED_AT,
    finding: 'Playwright MCP exposes browser automation to LLMs through structured accessibility snapshots.'
  },
  {
    id: 'browsermcp',
    url: 'https://github.com/BrowserMCP/mcp',
    retrievedAt: '2026-05-30',
    finding: 'BrowserMCP combines an MCP server with a Chrome extension and intentionally targets the user browser/profile for logged-in browser automation; treat this as a study reference, not the default credential boundary.'
  },
  {
    id: 'browser-use',
    url: 'https://github.com/browser-use/browser-use',
    retrievedAt: '2026-05-30',
    finding: 'browser-use is a broad agent browser automation framework; use it as a pattern reference while keeping secure-browser-agent narrower around target packs, redaction, and dedicated profiles.'
  },
  {
    id: 'skyvern',
    url: 'https://github.com/Skyvern-AI/skyvern',
    retrievedAt: '2026-05-30',
    finding: 'Skyvern layers LLM and computer-vision planning on Playwright-compatible automation for workflows; useful for task modeling ideas, but too broad to become the default local credential holder.'
  },
  {
    id: 'scrapling',
    url: 'https://github.com/D4Vinci/Scrapling',
    retrievedAt: '2026-05-30',
    finding: 'Scrapling focuses on adaptive scraping, fetchers, stealth, and MCP-assisted extraction; useful for public scraping resilience patterns while authenticated browser state remains in dedicated Chrome profiles.'
  },
  {
    id: 'lightpanda',
    url: 'https://lightpanda.io/docs/',
    retrievedAt: RETRIEVED_AT,
    finding: 'Lightpanda is a machine-oriented headless browser with CDP compatibility for Playwright and Puppeteer, and claims much lower memory and faster execution than Chrome.'
  },
  {
    id: 'lightpanda-cdp',
    url: 'https://lightpanda.io/docs/quickstart/your-first-test',
    retrievedAt: RETRIEVED_AT,
    finding: 'Lightpanda examples start a CDP server and connect Playwright through chromium.connectOverCDP.'
  },
  {
    id: 'selenium-bidi',
    url: 'https://www.selenium.dev/ja/documentation/webdriver/bidi/',
    retrievedAt: RETRIEVED_AT,
    finding: 'Selenium positions WebDriver BiDi as the standards-based bidirectional automation path, with CDP support described as temporary until BiDi coverage is complete.'
  }
];

export const PROVIDER_MATRIX = [
  {
    id: 'direct-cdp-chrome',
    label: 'Direct Chrome CDP via secure-browser-agent',
    role: 'default',
    authPosture: 'Best fit for authenticated local work because every target gets a dedicated Chrome profile and local CDP endpoint.',
    securityPosture: 'Strongest local default when paired with exact-origin policy, profile isolation, output redaction, and no normal-profile attachment.',
    speedPosture: 'Fast enough for authenticated operation; can reuse a background daemon to avoid repeated browser startup.',
    scrapingPosture: 'Native page observe/inspect/analyze/scrape, console, network, screenshot, forms, click/fill, recipes, CSV, and manifests.',
    useWhen: 'Authenticated target packs, agent-friendly low-token page analysis, repeatable scraping, background operation.',
    avoidWhen: 'Cross-browser conformance testing or remote managed browser infrastructure is the main requirement.',
    sourceRefs: ['chrome-devtools-mcp', 'playwright-auth', 'browser-use']
  },
  {
    id: 'secure-browser-agent-mcp',
    label: 'secure-browser-agent MCP stdio',
    role: 'agent interface',
    authPosture: 'Uses the same dedicated profile and target-pack policy as direct CDP.',
    securityPosture: 'Safer MCP surface than a full DevTools bridge because tools are limited to target-pack and redacted browser operations.',
    speedPosture: 'Avoids extra prompt tokens by exposing stable tools instead of asking agents to construct CLI commands.',
    scrapingPosture: 'Exposes status, permissions, daemon, target run, target scrape, and direct CDP analysis as MCP tools.',
    useWhen: 'An agent supports MCP and needs browser tools with bounded capabilities.',
    avoidWhen: 'The operator needs full Chrome DevTools performance panels or arbitrary DevTools operations.',
    sourceRefs: ['playwright-mcp', 'browsermcp']
  },
  {
    id: 'chrome-devtools-mcp',
    label: 'Chrome DevTools MCP',
    role: 'debug/perf companion',
    authPosture: 'Can use a dedicated profile, auto-connect to a user-started Chrome, or connect to a debugging port.',
    securityPosture: 'High risk if connected to a normal profile or open debugging port; useful only with explicit operator scope.',
    speedPosture: 'Good for DevTools-backed debugging and performance inspection, not optimized as the default scraping loop.',
    scrapingPosture: 'Strong debugging surface; less purpose-built for redacted extraction and target-pack CSV workflows.',
    useWhen: 'Performance debugging, console/network diagnostics, or an MCP client specifically needs Chrome DevTools semantics.',
    avoidWhen: 'Default authenticated scraping with personal accounts, unless a dedicated user data directory and explicit scope are used.',
    sourceRefs: ['chrome-devtools-mcp']
  },
  {
    id: 'playwright',
    label: 'Playwright',
    role: 'test/rich automation adapter',
    authPosture: 'Supports storage state, but the state file is sensitive and must stay out of repos and shared context.',
    securityPosture: 'Good with isolated auth files and test accounts; less direct than dedicated Chrome profile reuse for personal sessions.',
    speedPosture: 'Mature and predictable, but heavier than direct CDP for tight agent scraping loops.',
    scrapingPosture: 'Excellent selectors, waits, fixtures, and test ergonomics.',
    useWhen: 'E2E tests, rich waits, cross-browser testing, or a project already has Playwright fixtures.',
    avoidWhen: 'Lowest-token agent observation and persistent personal browser context are the primary goals.',
    sourceRefs: ['playwright-auth', 'playwright-mcp', 'skyvern']
  },
  {
    id: 'lightpanda',
    label: 'Lightpanda',
    role: 'public crawl accelerator',
    authPosture: 'Keep public-profile only until target compatibility and credential boundaries are proven.',
    securityPosture: 'Promising for low-risk public pages because it avoids normal Chrome profiles; not the authenticated default.',
    speedPosture: 'Best speed candidate based on vendor claims and CDP compatibility, pending local binary and target tests.',
    scrapingPosture: 'Good candidate for dynamic public pages through CDP clients if required Web APIs are implemented.',
    useWhen: 'High-volume public crawl/extract jobs where rendering compatibility has been tested.',
    avoidWhen: 'Authenticated user sessions, complex account workflows, extension-dependent sites, or unverified Web API coverage.',
    sourceRefs: ['lightpanda', 'lightpanda-cdp', 'scrapling']
  },
  {
    id: 'selenium',
    label: 'Selenium / WebDriver BiDi',
    role: 'compatibility bridge',
    authPosture: 'Useful where an organization already standardizes on WebDriver sessions and grids.',
    securityPosture: 'Good for standards-based automation boundaries, but not optimized for local personal-profile scraping.',
    speedPosture: 'Generally not the fastest path for agent-first extraction.',
    scrapingPosture: 'Useful for browser compatibility and existing Selenium suites; weaker fit for compact agent observations.',
    useWhen: 'Existing Selenium grid, browser vendor conformance, or WebDriver BiDi standardization matters.',
    avoidWhen: 'A local agent needs fast, compact, authenticated page analysis with minimal setup.',
    sourceRefs: ['selenium-bidi']
  }
];

function findExecutable(command, env = process.env) {
  const paths = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Continue scanning PATH.
    }
  }
  return '';
}

function commandVersion(command, args = ['--version'], env = process.env) {
  const executable = findExecutable(command, env);
  if (!executable) return { exists: false, path: '', version: '' };
  const result = spawnSync(executable, args, {
    env,
    encoding: 'utf8',
    timeout: 5000
  });
  return {
    exists: true,
    path: executable,
    version: (result.stdout || result.stderr || '').trim().split('\n')[0] || '',
    ok: result.status === 0
  };
}

function executableStatus(command, configuredPath = '', env = process.env) {
  const executable = configuredPath || findExecutable(command, env);
  if (!executable) {
    return {
      exists: false,
      path: '',
      configuredPath,
      configuredExists: false
    };
  }
  let exists = false;
  try {
    fs.accessSync(executable, fs.constants.X_OK);
    exists = true;
  } catch {
    exists = false;
  }
  return {
    exists,
    path: exists ? executable : '',
    configuredPath,
    configuredExists: configuredPath ? exists : false
  };
}

function newestChromeForTesting(homeDir) {
  const browserRoot = path.join(homeDir, '.agent-browser/browsers');
  if (!fs.existsSync(browserRoot)) return '';
  return fs.readdirSync(browserRoot)
    .filter((name) => name.startsWith('chrome-'))
    .sort()
    .reverse()
    .map((name) => path.join(browserRoot, name, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
    .find((candidate) => fs.existsSync(candidate)) || '';
}

export function readCloneMap(rootDir, homeDir) {
  const configPath = process.env.SBA_LOCAL_CLONES
    || path.join(rootDir, 'config', 'local-clones.json');
  if (!fs.existsSync(configPath)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
  const entries = parsed.clones && typeof parsed.clones === 'object' ? parsed.clones : {};
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => {
    const raw = String(value || '');
    const fromHome = raw.startsWith('~/') ? path.join(homeDir, raw.slice(2)) : raw;
    return [key, raw ? path.resolve(fromHome) : ''];
  }));
}

export function detectProviderStatus({ rootDir = process.cwd(), homeDir = os.homedir(), env = process.env } = {}) {
  const agentBrowser = commandVersion('agent-browser', ['--version'], env);
  const lightpanda = executableStatus('lightpanda', env.SBA_LIGHTPANDA_PATH || '', env);
  const npxPath = findExecutable('npx', env);
  const playwrightCore = path.resolve(rootDir, '../playwright-mcp/node_modules/playwright-core/index.js');
  const seleniumWebdriver = path.resolve(rootDir, 'node_modules/selenium-webdriver/package.json');
  const chromeForTesting = newestChromeForTesting(homeDir);
  // Reference-clone locations belong to the machine, not to this tool. They used to be one
  // developer's absolute paths, so every other checkout reported "clone missing" for all of them.
  // Shape: { "clones": { "lightpanda": "~/src/lightpanda" } } - see config/local-clones.example.json.
  const clones = readCloneMap(rootDir, homeDir);

  return {
    agentBrowser,
    chromeForTesting: {
      exists: Boolean(chromeForTesting),
      path: chromeForTesting
    },
    secureBrowserAgentMcp: {
      exists: fs.existsSync(path.join(rootDir, 'src/mcp-server.mjs')),
      command: 'node src/cli.mjs mcp-stdio'
    },
    playwright: {
      coreExists: fs.existsSync(playwrightCore),
      corePath: playwrightCore
    },
    lightpanda: {
      binaryExists: lightpanda.exists,
      binaryPath: lightpanda.path,
      configuredPath: lightpanda.configuredPath,
      configuredExists: lightpanda.configuredExists
    },
    chromeDevtoolsMcp: {
      npxExists: Boolean(npxPath),
      npxPath,
      packageCommand: 'npx -y chrome-devtools-mcp@latest'
    },
    selenium: {
      webdriverPackageExists: fs.existsSync(seleniumWebdriver),
      webdriverPackagePath: seleniumWebdriver
    },
    localClones: Object.fromEntries(Object.entries(clones).map(([key, value]) => [key, {
      exists: fs.existsSync(value),
      path: value
    }]))
  };
}

export function recommendProviders(status) {
  const directReady = Boolean(status.chromeForTesting?.exists);
  const mcpReady = Boolean(status.secureBrowserAgentMcp?.exists);
  const lightpandaReady = Boolean(status.lightpanda?.binaryExists);
  const playwrightReady = Boolean(status.playwright?.coreExists);
  const seleniumReady = Boolean(status.selenium?.webdriverPackageExists);

  return {
    defaultBackend: directReady ? 'direct-cdp-chrome' : 'agent-browser-chrome',
    defaultAgentInterface: mcpReady ? 'secure-browser-agent-mcp' : 'cli',
    authenticatedPolicy: 'Use one dedicated Chrome profile per target pack. Do not attach to the normal Chrome profile by default.',
    publicCrawlAccelerator: lightpandaReady ? 'lightpanda-ready-for-public-page-benchmarks' : 'lightpanda-pending-local-binary',
    richAutomationFallback: playwrightReady ? 'playwright-available-for-rich-tests' : 'playwright-pending-local-core',
    devtoolsCompanion: 'chrome-devtools-mcp-only-for-explicit-debugging-or-dedicated-profile-sessions',
    seleniumRole: seleniumReady ? 'selenium-available-for-compatibility-checks' : 'compatibility-only-for-existing-webdriver-bidi-grids',
    adoptionNext: lightpandaReady
      ? 'run-public-lightpanda-benchmark-before-adoption'
      : seleniumReady
      ? 'keep-selenium-compatibility-only-and-refresh-backend-matrix'
      : 'keep-direct-cdp-default-and-run-provider-doctors-before-changing-backends',
    lightpandaNext: lightpandaReady ? 'benchmark-public-pages' : 'install-or-configure-lightpanda-binary-then-benchmark',
    playwrightNext: playwrightReady ? 'use-for-rich-tests-not-default-auth-scraping' : 'install-playwright-core-only-if-rich-tests-are-needed',
    seleniumNext: seleniumReady ? 'use-only-for-webdriver-bidi-compatibility' : 'install-selenium-webdriver-only-if-grid-compatibility-is-needed',
    decision: directReady
      ? 'Keep secure-browser-agent direct CDP as the default for authenticated agent operation; expose it through mcp-stdio for agents; add Lightpanda only after public-page compatibility benchmarks.'
      : 'Install or repair Chrome for Testing / agent-browser before treating this machine as ready for authenticated browser agents.'
  };
}

export function buildProviderReport(options = {}) {
  const status = options.status || detectProviderStatus(options);
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    recommendation: recommendProviders(status),
    localStatus: status,
    providers: PROVIDER_MATRIX,
    sources: PROVIDER_SOURCES
  };
}

export function formatProviderReportMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Provider Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Recommendation',
    '',
    `- Default backend: ${report.recommendation.defaultBackend}`,
    `- Agent interface: ${report.recommendation.defaultAgentInterface}`,
    `- Auth policy: ${report.recommendation.authenticatedPolicy}`,
    `- Decision: ${report.recommendation.decision}`,
    '',
    '## Local Status',
    '',
    `- agent-browser: ${report.localStatus.agentBrowser?.exists ? 'present' : 'missing'} ${report.localStatus.agentBrowser?.version || ''}`.trim(),
    `- Chrome for Testing: ${report.localStatus.chromeForTesting?.exists ? report.localStatus.chromeForTesting.path : 'missing'}`,
    `- secure-browser-agent MCP: ${report.localStatus.secureBrowserAgentMcp?.exists ? report.localStatus.secureBrowserAgentMcp.command : 'missing'}`,
    `- Playwright core: ${report.localStatus.playwright?.coreExists ? report.localStatus.playwright.corePath : 'missing'}`,
    `- Lightpanda binary: ${report.localStatus.lightpanda?.binaryExists ? report.localStatus.lightpanda.binaryPath : 'missing'}`,
    `- Chrome DevTools MCP: ${report.localStatus.chromeDevtoolsMcp?.npxExists ? report.localStatus.chromeDevtoolsMcp.packageCommand : 'npx missing'}`,
    `- Selenium webdriver package: ${report.localStatus.selenium?.webdriverPackageExists ? report.localStatus.selenium.webdriverPackagePath : 'missing'}`,
    '',
    '## Provider Roles',
    ''
  ];

  for (const provider of report.providers) {
    lines.push(
      `### ${provider.label}`,
      '',
      `- Role: ${provider.role}`,
      `- Auth: ${provider.authPosture}`,
      `- Security: ${provider.securityPosture}`,
      `- Speed: ${provider.speedPosture}`,
      `- Use when: ${provider.useWhen}`,
      `- Avoid when: ${provider.avoidWhen}`,
      ''
    );
  }

  lines.push('## Sources', '');
  for (const source of report.sources) {
    lines.push(`- ${source.id}: ${source.url} (retrieved ${source.retrievedAt})`);
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function formatProviderReportCompact(report) {
  const status = report.localStatus || {};
  const recommendation = report.recommendation || {};
  const lines = [
    `default_backend: ${compact(recommendation.defaultBackend)}`,
    `default_agent_interface: ${compact(recommendation.defaultAgentInterface)}`,
    `authenticated_policy: ${compact(recommendation.authenticatedPolicy)}`,
    `public_crawl_accelerator: ${compact(recommendation.publicCrawlAccelerator)}`,
    `rich_automation_fallback: ${compact(recommendation.richAutomationFallback)}`,
    `devtools_companion: ${compact(recommendation.devtoolsCompanion)}`,
    `selenium_role: ${compact(recommendation.seleniumRole)}`,
    `provider_adoption_next: ${compact(recommendation.adoptionNext)}`,
    `lightpanda_next: ${compact(recommendation.lightpandaNext)}`,
    `playwright_next: ${compact(recommendation.playwrightNext)}`,
    `selenium_next: ${compact(recommendation.seleniumNext)}`,
    `agent_browser_present: ${yesNo(status.agentBrowser?.exists)}`,
    `chrome_for_testing_present: ${yesNo(status.chromeForTesting?.exists)}`,
    `secure_browser_agent_mcp_present: ${yesNo(status.secureBrowserAgentMcp?.exists)}`,
    `playwright_core_present: ${yesNo(status.playwright?.coreExists)}`,
    `lightpanda_binary_present: ${yesNo(status.lightpanda?.binaryExists)}`,
    `chrome_devtools_mcp_npx_present: ${yesNo(status.chromeDevtoolsMcp?.npxExists)}`,
    `selenium_webdriver_present: ${yesNo(status.selenium?.webdriverPackageExists)}`,
    `clone_agent_browser_present: ${yesNo(status.localClones?.agentBrowser?.exists)}`,
    `clone_browser_use_present: ${yesNo(status.localClones?.browserUse?.exists)}`,
    `clone_lightpanda_present: ${yesNo(status.localClones?.lightpanda?.exists)}`,
    `clone_browsermcp_present: ${yesNo(status.localClones?.browserMcp?.exists)}`,
    `clone_skyvern_present: ${yesNo(status.localClones?.skyvern?.exists)}`,
    `clone_scrapling_present: ${yesNo(status.localClones?.scrapling?.exists)}`,
    `provider_count: ${report.providers?.length ?? 0}`,
    `source_count: ${report.sources?.length ?? 0}`,
    `provider_doctor_command: 'node' 'src/cli.mjs' 'providers' '--format' 'compact'`,
    `backend_matrix_command: 'node' 'src/cli.mjs' 'backend-matrix' '--format' 'compact'`,
    `lightpanda_doctor_command: 'node' 'src/cli.mjs' 'lightpanda-doctor' '--format' 'compact'`,
    `lightpanda_benchmark_command: 'node' 'src/cli.mjs' 'benchmark' '--url' 'https://example.com' '--iterations' '1' '--write' '--out' 'provider-benchmarks/lightpanda-public.json' '--format' 'json'`,
    `playwright_doctor_command: 'node' 'src/cli.mjs' 'playwright-doctor' '--format' 'compact'`,
    `selenium_doctor_command: 'node' 'src/cli.mjs' 'selenium-doctor' '--format' 'compact'`,
    `decision: ${compact(recommendation.decision)}`
  ];
  if (status.chromeForTesting?.path) lines.push(`chrome_for_testing_path: ${status.chromeForTesting.path}`);
  if (status.lightpanda?.configuredPath) lines.push(`lightpanda_configured_path: ${status.lightpanda.configuredPath}`);
  if (status.lightpanda?.binaryPath) lines.push(`lightpanda_binary_path: ${status.lightpanda.binaryPath}`);
  return `${lines.join('\n')}\n`;
}
