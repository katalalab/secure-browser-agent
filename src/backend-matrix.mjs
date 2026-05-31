import fs from 'node:fs';
import path from 'node:path';
import { buildBrowserRoute } from './browser-route.mjs';
import { buildProviderReport } from './provider-report.mjs';
import { buildRegularChromeStatus } from './regular-chrome-refresh.mjs';
import { buildChromeMcpTimeoutPlanStatus } from './chrome-mcp-timeout-plan.mjs';

const TASKS = ['search', 'analyze', 'scrape', 'operate', 'existing-tab', 'authenticated-scrape', 'public-crawl', 'compatibility-test'];

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function yesNoUnknown(value) {
  return value === null || value === undefined ? 'unknown' : yesNo(value);
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function flagEnabled(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  return text !== '' && !['0', 'false', 'no', 'off'].includes(text);
}

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function backgroundTabArgsFrom(options = {}, regularChrome = {}) {
  const allowNewBackgroundTab = options.allowNewBackgroundTab
    ?? options['allow-new-background-tab']
    ?? (regularChrome.scope?.newBackgroundTabsAllowed || regularChrome.chromeMcp?.newBackgroundTabAllowed ? 'yes' : '');
  const newBackgroundUrlEnv = options.newBackgroundUrlEnv
    ?? options['new-background-url-env']
    ?? regularChrome.chromeMcp?.newBackgroundUrlEnv
    ?? '';
  const args = [];
  if (allowNewBackgroundTab) args.push('--allow-new-background-tab', allowNewBackgroundTab);
  if (newBackgroundUrlEnv) args.push('--new-background-url-env', newBackgroundUrlEnv);
  return args;
}

function mcpObservationArgsFrom(options = {}) {
  const mcpObservationIn = options.mcpObservationIn ?? options['mcp-observation-in'] ?? '';
  return mcpObservationIn ? ['--mcp-observation-in', mcpObservationIn] : [];
}

function safeRunPath(rootDir, value, fallback, label) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(value || fallback).replace(/^[/\\]+/, '');
  const filePath = path.resolve(runsRoot, relative);
  const insideRuns = filePath === runsRoot || filePath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid backend matrix ${label}: ${value}`);
  return filePath;
}

function runRelativePath(rootDir, filePath) {
  return path.relative(path.resolve(rootDir, 'runs'), filePath);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, parseOk: false, value: null, error: '' };
  }
  try {
    return {
      exists: true,
      parseOk: true,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
      error: ''
    };
  } catch (error) {
    return {
      exists: true,
      parseOk: false,
      value: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function ageSeconds(generatedAt, savedGeneratedAt) {
  const now = Date.parse(generatedAt || '');
  const saved = Date.parse(savedGeneratedAt || '');
  if (!Number.isFinite(now) || !Number.isFinite(saved)) return null;
  return Math.max(0, Math.floor((now - saved) / 1000));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function observedFlag(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return undefined;
}

function routeOptionsFromRegularChrome(status = {}) {
  const observed = status.chromeMcpObservation || {};
  return {
    chromeMcpConnected: observedFlag(observed.observedConnected),
    chromeMcpTools: observed.observedTools ?? undefined,
    chromeMcpPageListOk: observedFlag(observed.observedPageListOk),
    chromeMcpPageCount: observed.observedPageCount ?? undefined,
    chromeMcpLastError: observed.lastError || '',
    chromeMcpSource: observed.exists ? 'regular-chrome-status-saved-observation' : ''
  };
}

function selectedRoute(routes, task) {
  return routes?.[task] || {};
}

function routeCommand(task, extra = []) {
  return command(['node', 'src/cli.mjs', 'browser-route', '--task', task, ...extra, '--format', 'compact']);
}

function workflowCommand(task, extra = []) {
  return command(['node', 'src/cli.mjs', 'agent-workflow', '--task', task, ...extra, '--format', 'compact']);
}

function selectorCommand(task, extra = []) {
  return command(['node', 'src/cli.mjs', 'agent-backend-select', '--task', task, ...extra, '--backend-matrix-in', 'operator/backend-matrix-latest.json', '--format', 'compact']);
}

function backendRow({ id, label, role, available, status, auth, existingTab, publicCrawl, compatibility, background, notes }) {
  return {
    id,
    label,
    role,
    available: Boolean(available),
    status,
    supportsAuthenticatedProfiles: Boolean(auth),
    supportsExistingTabs: Boolean(existingTab),
    supportsPublicCrawl: Boolean(publicCrawl),
    supportsCompatibility: Boolean(compatibility),
    canRunInBackground: Boolean(background),
    notes
  };
}

function buildBackends(providerReport, regularChrome, routes) {
  const local = providerReport.localStatus || {};
  const existingRoute = selectedRoute(routes, 'existing-tab');
  const authRoute = selectedRoute(routes, 'authenticated-scrape');
  const scrapeRoute = selectedRoute(routes, 'scrape');
  const operateRoute = selectedRoute(routes, 'operate');
  const analyzeRoute = selectedRoute(routes, 'analyze');
  const searchRoute = selectedRoute(routes, 'search');
  const publicRoute = selectedRoute(routes, 'public-crawl');
  const compatibilityRoute = selectedRoute(routes, 'compatibility-test');
  const chromeMcpReady = Boolean(regularChrome.chromeMcpObservation?.routeReady);
  const chromeMcpNewBackgroundReady = Boolean(
    regularChrome.chromeMcp?.newBackgroundTabAllowed
    || regularChrome.newBackgroundTabsAllowed
    || existingRoute.selectedLane === 'regular-chrome-mcp-new-background-tab'
  );
  const chromeExtensionPrepared = regularChrome.selectedLane === 'regular-chrome-extension-resume'
    || regularChrome.selectedLane === 'regular-chrome-extension'
    || existingRoute.backend === 'codex-chrome-extension';

  return [
    backendRow({
      id: 'direct-cdp-chrome',
      label: 'Direct Chrome CDP',
      role: 'authenticated-default',
      available: local.chromeForTesting?.exists,
      status: authRoute.backend === 'direct-cdp-chrome' ? 'selected-for-authenticated-scrape' : 'available',
      auth: true,
      existingTab: false,
      publicCrawl: publicRoute.backend === 'direct-cdp-chrome' || searchRoute.backend === 'direct-cdp-chrome',
      compatibility: compatibilityRoute.backend === 'direct-cdp-chrome' || analyzeRoute.backend === 'direct-cdp-chrome',
      background: true,
      notes: scrapeRoute.backend === 'direct-cdp-chrome' || operateRoute.backend === 'direct-cdp-chrome'
        ? 'Dedicated target profiles for scrape/operate; normal Chrome profile CDP stays disabled.'
        : 'Dedicated target profiles only; normal Chrome profile CDP stays disabled.'
    }),
    backendRow({
      id: 'secure-browser-agent-mcp',
      label: 'secure-browser-agent MCP',
      role: 'agent-interface',
      available: local.secureBrowserAgentMcp?.exists,
      status: providerReport.recommendation?.defaultAgentInterface === 'secure-browser-agent-mcp' ? 'selected-agent-interface' : 'optional',
      auth: true,
      existingTab: false,
      publicCrawl: true,
      compatibility: true,
      background: true,
      notes: 'Low-token bounded tool surface over the secure-browser-agent CLI.'
    }),
    backendRow({
      id: 'chrome-devtools-mcp',
      label: 'Chrome DevTools MCP',
      role: 'existing-tab-debug-companion',
      available: local.chromeDevtoolsMcp?.npxExists,
      status: chromeMcpReady
        ? 'ready-for-existing-tabs'
        : chromeMcpNewBackgroundReady
        ? 'ready-for-new-background-tab'
        : clean(regularChrome.chromeMcpObservation?.status, 'not-proved'),
      auth: false,
      existingTab: chromeMcpReady || chromeMcpNewBackgroundReady,
      publicCrawl: false,
      compatibility: false,
      background: chromeMcpReady || chromeMcpNewBackgroundReady,
      notes: chromeMcpReady
        ? 'Usable for operator-requested everyday Chrome tabs; not for stored authenticated scraping.'
        : chromeMcpNewBackgroundReady
        ? 'Usable for operator-requested fresh everyday Chrome background tabs without listing existing tabs; not for stored authenticated scraping.'
        : 'Requires connected status plus successful list_pages proof.'
    }),
    backendRow({
      id: 'codex-chrome-extension',
      label: 'Codex Chrome Extension',
      role: 'everyday-chrome-fallback',
      available: chromeExtensionPrepared,
      status: regularChrome.ready ? 'ready' : clean(regularChrome.status, 'not-ready'),
      auth: false,
      existingTab: regularChrome.ready || existingRoute.backend === 'codex-chrome-extension',
      publicCrawl: false,
      compatibility: false,
      background: Boolean(regularChrome.canRunInBackground),
      notes: 'Gated by operator approval when it needs to open or resume the everyday Chrome profile.'
    }),
    backendRow({
      id: 'agent-browser',
      label: 'agent-browser CLI',
      role: 'fast-cli-session-tool',
      available: local.agentBrowser?.exists,
      status: local.agentBrowser?.exists ? 'installed' : 'missing',
      auth: false,
      existingTab: false,
      publicCrawl: true,
      compatibility: false,
      background: true,
      notes: 'Useful fast CLI loop and isolated sessions; stored auth still goes through target packs.'
    }),
    backendRow({
      id: 'playwright',
      label: 'Playwright',
      role: 'rich-test-adapter',
      available: local.playwright?.coreExists,
      status: local.playwright?.coreExists ? 'available-for-rich-tests' : 'missing-local-core',
      auth: false,
      existingTab: false,
      publicCrawl: true,
      compatibility: true,
      background: true,
      notes: 'Good for E2E and rich waits; auth state files are treated as secrets.'
    }),
    backendRow({
      id: 'lightpanda',
      label: 'Lightpanda',
      role: 'public-crawl-accelerator',
      available: local.lightpanda?.binaryExists,
      status: publicRoute.backend === 'lightpanda-candidate' ? 'benchmark-candidate' : 'pending-local-binary-or-benchmark',
      auth: false,
      existingTab: false,
      publicCrawl: Boolean(local.lightpanda?.binaryExists),
      compatibility: false,
      background: true,
      notes: 'Public pages only until compatibility and credential boundaries are proved.'
    }),
    backendRow({
      id: 'selenium',
      label: 'Selenium / WebDriver BiDi',
      role: 'compatibility-bridge',
      available: local.selenium?.webdriverPackageExists,
      status: compatibilityRoute.backend === 'selenium-webdriver' ? 'selected-compatibility-bridge' : 'optional',
      auth: false,
      existingTab: false,
      publicCrawl: false,
      compatibility: true,
      background: true,
      notes: 'For existing WebDriver/Grid estates, not the default authenticated scraping lane.'
    })
  ];
}

export async function buildBackendMatrix(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const providerReport = options.providerReport || buildProviderReport({ ...options, rootDir });
  const regularChrome = options.regularChromeStatus || buildRegularChromeStatus({ ...options, rootDir, generatedAt });
  const chromeMcpTimeoutPlan = options.chromeMcpTimeoutPlanStatus || buildChromeMcpTimeoutPlanStatus({ ...options, rootDir, generatedAt });
  const backgroundTabArgs = backgroundTabArgsFrom(options, regularChrome);
  const mcpObservationArgs = mcpObservationArgsFrom(options);
  const routeOptions = {
    ...options,
    ...routeOptionsFromRegularChrome(regularChrome),
    allowNewBackgroundTab: options.allowNewBackgroundTab ?? options['allow-new-background-tab'] ?? (backgroundTabArgs.includes('--allow-new-background-tab') ? 'yes' : undefined),
    newBackgroundUrlEnv: options.newBackgroundUrlEnv ?? options['new-background-url-env'] ?? regularChrome.chromeMcp?.newBackgroundUrlEnv,
    rootDir,
    generatedAt
  };
  const routes = options.routes || Object.fromEntries(await Promise.all(TASKS.map(async (task) => [
    task,
    await buildBrowserRoute({ ...routeOptions, task })
  ])));
  const backends = buildBackends(providerReport, regularChrome, routes);

  const matrix = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    defaultBackend: providerReport.recommendation?.defaultBackend || '',
    defaultAgentInterface: providerReport.recommendation?.defaultAgentInterface || '',
    decision: providerReport.recommendation?.decision || '',
    tasks: Object.fromEntries(TASKS.map((task) => {
      const route = selectedRoute(routes, task);
      return [task, {
        selectedLane: route.selectedLane || '',
        backend: route.backend || '',
        profileMode: route.profileMode || '',
        operatorInput: Boolean(route.operatorInput),
        userPermissionRequired: Boolean(route.userPermissionRequired),
        canRunInBackground: Boolean(route.canRunInBackground),
        startsCapture: Boolean(route.startsCapture),
        captureBlocked: Boolean(route.captureBlocked),
        commandOpensBrowser: Boolean(route.commandOpensBrowser)
      }];
    })),
    regularChrome: {
      status: regularChrome.status || '',
      ready: Boolean(regularChrome.ready),
      stale: Boolean(regularChrome.stale),
      selectedLane: regularChrome.selectedLane || '',
      backend: regularChrome.backend || '',
      canRunInBackground: Boolean(regularChrome.canRunInBackground),
      blockedReason: regularChrome.blockedReason || '',
      newBackgroundTabsAllowed: Boolean(regularChrome.scope?.newBackgroundTabsAllowed),
      chromeMcpNewBackgroundTabAllowed: Boolean(regularChrome.chromeMcp?.newBackgroundTabAllowed),
      chromeMcpNewBackgroundUrlEnv: regularChrome.chromeMcp?.newBackgroundUrlEnv || '',
      chromeMcpNewBackgroundUrlValueRead: Boolean(regularChrome.chromeMcp?.newBackgroundUrlValueRead),
      appleEventsActiveTabObserved: Boolean(regularChrome.appleEvents?.activeTabObserved),
      appleEventsJavascriptAllowed: Boolean(regularChrome.appleEvents?.javascriptAllowed),
      chromeMcpObservationStatus: regularChrome.chromeMcpObservation?.status || '',
      chromeMcpRouteReady: Boolean(regularChrome.chromeMcpObservation?.routeReady),
      chromeMcpObservedConnected: regularChrome.chromeMcpObservation?.observedConnected,
      chromeMcpObservedTools: regularChrome.chromeMcpObservation?.observedTools ?? null,
      chromeMcpObservedPageListOk: regularChrome.chromeMcpObservation?.observedPageListOk,
      chromeMcpListPagesTimedOut: Boolean(regularChrome.chromeMcpObservation?.listPagesTimedOut),
      chromeMcpLastError: regularChrome.chromeMcpObservation?.lastError || ''
    },
    chromeMcpTimeoutPlan: {
      status: chromeMcpTimeoutPlan.status || '',
      exists: Boolean(chromeMcpTimeoutPlan.exists),
      stale: Boolean(chromeMcpTimeoutPlan.stale),
      ageSeconds: chromeMcpTimeoutPlan.ageSeconds ?? null,
      connected: Boolean(chromeMcpTimeoutPlan.connected),
      pageListOk: Boolean(chromeMcpTimeoutPlan.pageListOk),
      pageListTimeout: Boolean(chromeMcpTimeoutPlan.pageListTimeout),
      useEverydayChromeNow: Boolean(chromeMcpTimeoutPlan.useEverydayChromeNow),
      preferExtensionResume: Boolean(chromeMcpTimeoutPlan.preferExtensionResume),
      cleanupIsManual: Boolean(chromeMcpTimeoutPlan.cleanupIsManual),
      nextAction: chromeMcpTimeoutPlan.nextAction || '',
      findings: chromeMcpTimeoutPlan.findings || [],
      cleanupOwnerSessions: chromeMcpTimeoutPlan.cleanup?.ownerSessionCount || 0,
      cleanupReviewOwnerPids: chromeMcpTimeoutPlan.cleanup?.reviewOwnerPids || []
    },
    security: {
      everydayChromeCdpAllowed: false,
      storedAuthenticatedScrapingOnEverydayChrome: false,
      dedicatedTargetProfileForStoredAuth: true,
      cookieValuesRead: false,
      browserStorageRead: false
    },
    backends,
    commands: {
      matrix: command(['node', 'src/cli.mjs', 'backend-matrix', ...mcpObservationArgs, '--format', 'compact']),
      write: command(['node', 'src/cli.mjs', 'backend-matrix', '--write', '--out', 'operator/backend-matrix-latest.json', ...mcpObservationArgs, ...backgroundTabArgs, '--format', 'compact']),
      status: command(['node', 'src/cli.mjs', 'backend-matrix-status', '--in', 'operator/backend-matrix-latest.json', ...mcpObservationArgs, ...backgroundTabArgs, '--format', 'compact']),
      providers: command(['node', 'src/cli.mjs', 'providers', '--format', 'compact']),
      providerDoctorStatus: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']),
      agentBrowserDoctor: command(['node', 'src/cli.mjs', 'agent-browser-doctor', '--format', 'compact']),
      lightpandaDoctor: command(['node', 'src/cli.mjs', 'lightpanda-doctor', '--format', 'compact']),
      playwrightDoctor: command(['node', 'src/cli.mjs', 'playwright-doctor', '--format', 'compact']),
      seleniumDoctor: command(['node', 'src/cli.mjs', 'selenium-doctor', '--format', 'compact']),
      regularChromeStatus: command(['node', 'src/cli.mjs', 'regular-chrome-status', ...mcpObservationArgs, ...backgroundTabArgs, '--format', 'compact']),
      chromeMcpTimeoutPlanStatus: command(['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan-status', '--format', 'compact']),
      chromeMcpTimeoutPlanRefresh: command(['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan', '--write', '--format', 'compact']),
      searchRoute: routeCommand('search'),
      analyzeRoute: routeCommand('analyze'),
      scrapeRoute: routeCommand('scrape'),
      operateRoute: routeCommand('operate'),
      existingTabRoute: routeCommand('existing-tab', backgroundTabArgs),
      authenticatedRoute: routeCommand('authenticated-scrape'),
      publicRoute: routeCommand('public-crawl'),
      compatibilityRoute: routeCommand('compatibility-test'),
      searchWorkflow: workflowCommand('search', ['--query', '<query>']),
      analyzeWorkflow: workflowCommand('analyze'),
      scrapeWorkflow: workflowCommand('scrape'),
      operateWorkflow: workflowCommand('operate'),
      searchSelector: selectorCommand('search', ['--query', '<query>', ...mcpObservationArgs]),
      analyzeSelector: selectorCommand('analyze', mcpObservationArgs),
      scrapeSelector: selectorCommand('scrape', mcpObservationArgs),
      operateSelector: selectorCommand('operate', mcpObservationArgs),
      existingTabSelector: selectorCommand('existing-tab', [...mcpObservationArgs, ...backgroundTabArgs]),
      publicCrawlSelector: selectorCommand('public-crawl', mcpObservationArgs)
    }
  };

  if (options.write || options.out || options.output) {
    matrix.outputPath = safeRunPath(rootDir, options.out || options.output, 'operator/backend-matrix-latest.json', 'output path');
    writeJson(matrix.outputPath, matrix);
  }

  return matrix;
}

export function buildBackendMatrixStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds ?? options['stale-after-seconds'], 900);
  const filePath = safeRunPath(rootDir, options.in || options.input || options.path, 'operator/backend-matrix-latest.json', 'status input path');
  const saved = readJson(filePath);
  const value = saved.value || {};
  const requestedAllowNewBackgroundTab = options.allowNewBackgroundTab ?? options['allow-new-background-tab'];
  const requestedNewBackgroundUrlEnv = options.newBackgroundUrlEnv ?? options['new-background-url-env'];
  const mcpObservationArgs = mcpObservationArgsFrom(options);
  const requestedNewBackgroundTabAllowed = flagEnabled(requestedAllowNewBackgroundTab);
  const backgroundTabArgs = backgroundTabArgsFrom(options, {
    scope: { newBackgroundTabsAllowed: value.regularChrome?.newBackgroundTabsAllowed },
    chromeMcp: {
      newBackgroundTabAllowed: value.regularChrome?.chromeMcpNewBackgroundTabAllowed,
      newBackgroundUrlEnv: value.regularChrome?.chromeMcpNewBackgroundUrlEnv
    }
  });
  const latestChromeMcpTimeoutPlan = buildChromeMcpTimeoutPlanStatus({
    rootDir,
    generatedAt,
    staleAfterSeconds,
    allowNewBackgroundTab: requestedAllowNewBackgroundTab,
    newBackgroundUrlEnv: requestedNewBackgroundUrlEnv
  });
  const savedAgeSeconds = saved.parseOk ? ageSeconds(generatedAt, value.generatedAt) : null;
  const stale = savedAgeSeconds === null ? true : savedAgeSeconds > staleAfterSeconds;
  const matrixRefreshNeeded = !saved.exists || !saved.parseOk || stale;
  const useLatestChromeMcpTimeoutPlan = Boolean(
    saved.parseOk
    && !stale
    && latestChromeMcpTimeoutPlan.exists
    && latestChromeMcpTimeoutPlan.parseOk
    && !latestChromeMcpTimeoutPlan.stale
  );
  const effectiveChromeMcpTimeoutPlan = useLatestChromeMcpTimeoutPlan
    ? latestChromeMcpTimeoutPlan
    : value.chromeMcpTimeoutPlan || {};
  const childRefreshNeeded = Boolean(saved.parseOk && !useLatestChromeMcpTimeoutPlan && value.chromeMcpTimeoutPlan?.stale);
  const statusRelativePath = runRelativePath(rootDir, filePath);
  const refreshCommand = command(['node', 'src/cli.mjs', 'backend-matrix', '--write', '--out', statusRelativePath, ...mcpObservationArgs, ...backgroundTabArgs, '--format', 'compact']);
  const statusCommand = command(['node', 'src/cli.mjs', 'backend-matrix-status', '--in', statusRelativePath, ...mcpObservationArgs, ...backgroundTabArgs, '--format', 'compact']);
  const chromeMcpTimeoutPlanRefreshCommand = command(['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan', '--write', ...backgroundTabArgs, '--format', 'compact']);
  const agentSafeNextCommandId = matrixRefreshNeeded
    ? 'backend-matrix-refresh'
    : childRefreshNeeded
    ? 'chrome-mcp-timeout-plan-refresh'
    : 'none';
  const agentSafeNextCommand = matrixRefreshNeeded
    ? refreshCommand
    : childRefreshNeeded
    ? chromeMcpTimeoutPlanRefreshCommand
    : null;

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    path: filePath,
    exists: saved.exists,
    parseOk: saved.parseOk,
    parseError: saved.error,
    staleAfterSeconds,
    ageSeconds: savedAgeSeconds,
    stale,
    status: !saved.exists
      ? 'missing'
      : !saved.parseOk
      ? 'parse-error'
      : stale
      ? 'stale'
      : 'fresh',
    defaultBackend: saved.parseOk ? value.defaultBackend || '' : '',
    defaultAgentInterface: saved.parseOk ? value.defaultAgentInterface || '' : '',
    authenticatedBackend: saved.parseOk ? value.tasks?.['authenticated-scrape']?.backend || '' : '',
    searchBackend: saved.parseOk ? value.tasks?.search?.backend || '' : '',
    analyzeBackend: saved.parseOk ? value.tasks?.analyze?.backend || '' : '',
    scrapeBackend: saved.parseOk ? value.tasks?.scrape?.backend || '' : '',
    operateBackend: saved.parseOk ? value.tasks?.operate?.backend || '' : '',
    existingTabBackend: saved.parseOk ? value.tasks?.['existing-tab']?.backend || '' : '',
    publicCrawlBackend: saved.parseOk ? value.tasks?.['public-crawl']?.backend || '' : '',
    compatibilityBackend: saved.parseOk ? value.tasks?.['compatibility-test']?.backend || '' : '',
    regularChromeStatus: saved.parseOk ? value.regularChrome?.status || '' : '',
    regularChromeNewBackgroundTabsAllowed: Boolean(saved.parseOk && (value.regularChrome?.newBackgroundTabsAllowed || requestedNewBackgroundTabAllowed)),
    chromeMcpNewBackgroundTabAllowed: Boolean(saved.parseOk && (value.regularChrome?.chromeMcpNewBackgroundTabAllowed || requestedNewBackgroundTabAllowed)),
    chromeMcpNewBackgroundUrlEnv: saved.parseOk ? requestedNewBackgroundUrlEnv || value.regularChrome?.chromeMcpNewBackgroundUrlEnv || '' : '',
    chromeMcpNewBackgroundUrlValueRead: Boolean(saved.parseOk && value.regularChrome?.chromeMcpNewBackgroundUrlValueRead),
    chromeMcpRouteReady: Boolean(saved.parseOk && value.regularChrome?.chromeMcpRouteReady),
    chromeMcpListPagesTimedOut: Boolean(saved.parseOk && value.regularChrome?.chromeMcpListPagesTimedOut),
    chromeMcpTimeoutPlanSource: useLatestChromeMcpTimeoutPlan ? 'latest-file' : 'embedded-matrix',
    chromeMcpTimeoutPlanStatus: saved.parseOk ? effectiveChromeMcpTimeoutPlan.status || '' : '',
    chromeMcpTimeoutPlanStale: Boolean(saved.parseOk && effectiveChromeMcpTimeoutPlan.stale),
    chromeMcpTimeoutPlanPageListTimeout: Boolean(saved.parseOk && effectiveChromeMcpTimeoutPlan.pageListTimeout),
    chromeMcpTimeoutPlanUseEverydayChromeNow: Boolean(saved.parseOk && effectiveChromeMcpTimeoutPlan.useEverydayChromeNow),
    chromeMcpTimeoutPlanPreferExtensionResume: Boolean(saved.parseOk && effectiveChromeMcpTimeoutPlan.preferExtensionResume),
    chromeMcpTimeoutPlanFindings: saved.parseOk && Array.isArray(effectiveChromeMcpTimeoutPlan.findings) ? effectiveChromeMcpTimeoutPlan.findings : [],
    backendCount: Array.isArray(value.backends) ? value.backends.length : 0,
    savedSecretValuesRead: Boolean(saved.parseOk && value.secretValuesRead),
    savedDestructiveActions: Boolean(saved.parseOk && value.destructiveActionsIncluded),
    agentSafeNextCommandId,
    agentSafeNextMayRunUnattended: Boolean(agentSafeNextCommand),
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand,
    commands: {
      refresh: refreshCommand,
      status: statusCommand,
      providers: command(['node', 'src/cli.mjs', 'providers', '--format', 'compact']),
      providerDoctorStatus: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']),
      agentBrowserDoctor: command(['node', 'src/cli.mjs', 'agent-browser-doctor', '--format', 'compact']),
      lightpandaDoctor: command(['node', 'src/cli.mjs', 'lightpanda-doctor', '--format', 'compact']),
      playwrightDoctor: command(['node', 'src/cli.mjs', 'playwright-doctor', '--format', 'compact']),
      seleniumDoctor: command(['node', 'src/cli.mjs', 'selenium-doctor', '--format', 'compact']),
      chromeMcpTimeoutPlanStatus: command(['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan-status', '--format', 'compact']),
      chromeMcpTimeoutPlanRefresh: chromeMcpTimeoutPlanRefreshCommand,
      searchRoute: routeCommand('search'),
      analyzeRoute: routeCommand('analyze'),
      scrapeRoute: routeCommand('scrape'),
      operateRoute: routeCommand('operate'),
      existingTabRoute: routeCommand('existing-tab', backgroundTabArgs),
      authenticatedRoute: routeCommand('authenticated-scrape'),
      publicRoute: routeCommand('public-crawl'),
      compatibilityRoute: routeCommand('compatibility-test'),
      searchWorkflow: workflowCommand('search', ['--query', '<query>']),
      analyzeWorkflow: workflowCommand('analyze'),
      scrapeWorkflow: workflowCommand('scrape'),
      operateWorkflow: workflowCommand('operate'),
      searchSelector: selectorCommand('search', ['--query', '<query>']),
      analyzeSelector: selectorCommand('analyze'),
      scrapeSelector: selectorCommand('scrape'),
      operateSelector: selectorCommand('operate'),
      existingTabSelector: selectorCommand('existing-tab', backgroundTabArgs),
      publicCrawlSelector: selectorCommand('public-crawl')
    }
  };
}

export function formatBackendMatrixCompact(matrix) {
  const tasks = matrix.tasks || {};
  const regularChrome = matrix.regularChrome || {};
  const chromeMcpTimeoutPlan = matrix.chromeMcpTimeoutPlan || {};
  const security = matrix.security || {};
  const lines = [
    `safe_mode: ${yesNo(matrix.safeMode)}`,
    `status_only: ${yesNo(matrix.statusOnly)}`,
    `destructive_actions: ${yesNo(matrix.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(matrix.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(matrix.opensBrowserNow)}`,
    `reads_browser_storage: ${yesNo(matrix.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(matrix.pageContentReturned)}`,
    `default_backend: ${clean(matrix.defaultBackend)}`,
    `default_agent_interface: ${clean(matrix.defaultAgentInterface)}`,
    `search_lane: ${clean(tasks.search?.selectedLane)}`,
    `search_backend: ${clean(tasks.search?.backend)}`,
    `analyze_lane: ${clean(tasks.analyze?.selectedLane)}`,
    `analyze_backend: ${clean(tasks.analyze?.backend)}`,
    `scrape_lane: ${clean(tasks.scrape?.selectedLane)}`,
    `scrape_backend: ${clean(tasks.scrape?.backend)}`,
    `operate_lane: ${clean(tasks.operate?.selectedLane)}`,
    `operate_backend: ${clean(tasks.operate?.backend)}`,
    `authenticated_lane: ${clean(tasks['authenticated-scrape']?.selectedLane)}`,
    `authenticated_backend: ${clean(tasks['authenticated-scrape']?.backend)}`,
    `authenticated_capture_blocked: ${yesNo(tasks['authenticated-scrape']?.captureBlocked)}`,
    `existing_tab_lane: ${clean(tasks['existing-tab']?.selectedLane)}`,
    `existing_tab_backend: ${clean(tasks['existing-tab']?.backend)}`,
    `existing_tab_user_permission_required: ${yesNo(tasks['existing-tab']?.userPermissionRequired)}`,
    `existing_tab_can_run_in_background: ${yesNo(tasks['existing-tab']?.canRunInBackground)}`,
    `public_crawl_lane: ${clean(tasks['public-crawl']?.selectedLane)}`,
    `public_crawl_backend: ${clean(tasks['public-crawl']?.backend)}`,
    `compatibility_lane: ${clean(tasks['compatibility-test']?.selectedLane)}`,
    `compatibility_backend: ${clean(tasks['compatibility-test']?.backend)}`,
    `regular_chrome_status: ${clean(regularChrome.status)}`,
    `regular_chrome_ready: ${yesNo(regularChrome.ready)}`,
    `regular_chrome_stale: ${yesNo(regularChrome.stale)}`,
    `regular_chrome_backend: ${clean(regularChrome.backend)}`,
    `regular_chrome_new_background_tabs_allowed: ${yesNo(regularChrome.newBackgroundTabsAllowed)}`,
    `chrome_mcp_new_background_tab_allowed: ${yesNo(regularChrome.chromeMcpNewBackgroundTabAllowed)}`,
    `chrome_mcp_new_background_url_env: ${clean(regularChrome.chromeMcpNewBackgroundUrlEnv)}`,
    `chrome_mcp_new_background_url_value_read: ${yesNo(regularChrome.chromeMcpNewBackgroundUrlValueRead)}`,
    `chrome_mcp_observation_status: ${clean(regularChrome.chromeMcpObservationStatus)}`,
    `chrome_mcp_route_ready: ${yesNo(regularChrome.chromeMcpRouteReady)}`,
    `chrome_mcp_observed_connected: ${yesNoUnknown(regularChrome.chromeMcpObservedConnected)}`,
    `chrome_mcp_observed_tools: ${regularChrome.chromeMcpObservedTools ?? 'unknown'}`,
    `chrome_mcp_observed_page_list_ok: ${yesNoUnknown(regularChrome.chromeMcpObservedPageListOk)}`,
    `chrome_mcp_list_pages_timed_out: ${yesNo(regularChrome.chromeMcpListPagesTimedOut)}`,
    `chrome_mcp_timeout_plan_status: ${clean(chromeMcpTimeoutPlan.status)}`,
    `chrome_mcp_timeout_plan_stale: ${yesNo(chromeMcpTimeoutPlan.stale)}`,
    `chrome_mcp_timeout_plan_page_list_timeout: ${yesNo(chromeMcpTimeoutPlan.pageListTimeout)}`,
    `chrome_mcp_timeout_plan_use_everyday_chrome_now: ${yesNo(chromeMcpTimeoutPlan.useEverydayChromeNow)}`,
    `chrome_mcp_timeout_plan_prefer_extension_resume: ${yesNo(chromeMcpTimeoutPlan.preferExtensionResume)}`,
    `chrome_mcp_timeout_plan_next_action: ${clean(chromeMcpTimeoutPlan.nextAction)}`,
    `chrome_mcp_timeout_plan_findings: ${chromeMcpTimeoutPlan.findings?.length ? chromeMcpTimeoutPlan.findings.join(',') : 'none'}`,
    `everyday_chrome_cdp_allowed: ${yesNo(security.everydayChromeCdpAllowed)}`,
    `stored_authenticated_scraping_on_everyday_chrome: ${yesNo(security.storedAuthenticatedScrapingOnEverydayChrome)}`,
    `dedicated_target_profile_for_stored_auth: ${yesNo(security.dedicatedTargetProfileForStoredAuth)}`,
    `backend_count: ${matrix.backends?.length ?? 0}`
  ];
  for (const backend of matrix.backends || []) {
    lines.push(`backend_${backend.id}: available=${yesNo(backend.available)} role=${clean(backend.role)} status=${clean(backend.status)} auth=${yesNo(backend.supportsAuthenticatedProfiles)} existing_tab=${yesNo(backend.supportsExistingTabs)} public_crawl=${yesNo(backend.supportsPublicCrawl)} compatibility=${yesNo(backend.supportsCompatibility)} background=${yesNo(backend.canRunInBackground)}`);
  }
  if (matrix.commands?.searchRoute?.shell) lines.push(`search_route_command: ${matrix.commands.searchRoute.shell}`);
  if (matrix.commands?.analyzeRoute?.shell) lines.push(`analyze_route_command: ${matrix.commands.analyzeRoute.shell}`);
  if (matrix.commands?.scrapeRoute?.shell) lines.push(`scrape_route_command: ${matrix.commands.scrapeRoute.shell}`);
  if (matrix.commands?.operateRoute?.shell) lines.push(`operate_route_command: ${matrix.commands.operateRoute.shell}`);
  if (matrix.commands?.existingTabRoute?.shell) lines.push(`existing_tab_route_command: ${matrix.commands.existingTabRoute.shell}`);
  if (matrix.commands?.authenticatedRoute?.shell) lines.push(`authenticated_route_command: ${matrix.commands.authenticatedRoute.shell}`);
  if (matrix.commands?.publicRoute?.shell) lines.push(`public_crawl_route_command: ${matrix.commands.publicRoute.shell}`);
  if (matrix.commands?.compatibilityRoute?.shell) lines.push(`compatibility_route_command: ${matrix.commands.compatibilityRoute.shell}`);
  if (matrix.commands?.searchWorkflow?.shell) lines.push(`search_workflow_command: ${matrix.commands.searchWorkflow.shell}`);
  if (matrix.commands?.analyzeWorkflow?.shell) lines.push(`analyze_workflow_command: ${matrix.commands.analyzeWorkflow.shell}`);
  if (matrix.commands?.scrapeWorkflow?.shell) lines.push(`scrape_workflow_command: ${matrix.commands.scrapeWorkflow.shell}`);
  if (matrix.commands?.operateWorkflow?.shell) lines.push(`operate_workflow_command: ${matrix.commands.operateWorkflow.shell}`);
  if (matrix.commands?.searchSelector?.shell) lines.push(`search_selector_command: ${matrix.commands.searchSelector.shell}`);
  if (matrix.commands?.analyzeSelector?.shell) lines.push(`analyze_selector_command: ${matrix.commands.analyzeSelector.shell}`);
  if (matrix.commands?.scrapeSelector?.shell) lines.push(`scrape_selector_command: ${matrix.commands.scrapeSelector.shell}`);
  if (matrix.commands?.operateSelector?.shell) lines.push(`operate_selector_command: ${matrix.commands.operateSelector.shell}`);
  if (matrix.commands?.existingTabSelector?.shell) lines.push(`existing_tab_selector_command: ${matrix.commands.existingTabSelector.shell}`);
  if (matrix.commands?.publicCrawlSelector?.shell) lines.push(`public_crawl_selector_command: ${matrix.commands.publicCrawlSelector.shell}`);
  if (matrix.commands?.write?.shell) lines.push(`write_command: ${matrix.commands.write.shell}`);
  if (matrix.commands?.status?.shell) lines.push(`status_command: ${matrix.commands.status.shell}`);
  if (matrix.commands?.regularChromeStatus?.shell) lines.push(`regular_chrome_status_command: ${matrix.commands.regularChromeStatus.shell}`);
  if (matrix.commands?.providers?.shell) lines.push(`providers_command: ${matrix.commands.providers.shell}`);
  if (matrix.commands?.providerDoctorStatus?.shell) lines.push(`provider_doctor_status_command: ${matrix.commands.providerDoctorStatus.shell}`);
  if (matrix.commands?.agentBrowserDoctor?.shell) lines.push(`agent_browser_doctor_command: ${matrix.commands.agentBrowserDoctor.shell}`);
  if (matrix.commands?.lightpandaDoctor?.shell) lines.push(`lightpanda_doctor_command: ${matrix.commands.lightpandaDoctor.shell}`);
  if (matrix.commands?.playwrightDoctor?.shell) lines.push(`playwright_doctor_command: ${matrix.commands.playwrightDoctor.shell}`);
  if (matrix.commands?.seleniumDoctor?.shell) lines.push(`selenium_doctor_command: ${matrix.commands.seleniumDoctor.shell}`);
  if (matrix.commands?.chromeMcpTimeoutPlanStatus?.shell) lines.push(`chrome_mcp_timeout_plan_status_command: ${matrix.commands.chromeMcpTimeoutPlanStatus.shell}`);
  if (matrix.commands?.chromeMcpTimeoutPlanRefresh?.shell) lines.push(`chrome_mcp_timeout_plan_refresh_command: ${matrix.commands.chromeMcpTimeoutPlanRefresh.shell}`);
  if (regularChrome.blockedReason) lines.push(`regular_chrome_blocked_reason: ${clean(regularChrome.blockedReason)}`);
  if (regularChrome.chromeMcpLastError) lines.push(`chrome_mcp_last_error: ${clean(regularChrome.chromeMcpLastError)}`);
  lines.push(`decision: ${clean(matrix.decision)}`);
  if (matrix.outputPath) lines.push(`output: ${matrix.outputPath}`);
  return `${lines.join('\n')}\n`;
}

export function formatBackendMatrixStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `status: ${clean(status.status)}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `default_backend: ${clean(status.defaultBackend)}`,
    `default_agent_interface: ${clean(status.defaultAgentInterface)}`,
    `search_backend: ${clean(status.searchBackend)}`,
    `analyze_backend: ${clean(status.analyzeBackend)}`,
    `scrape_backend: ${clean(status.scrapeBackend)}`,
    `operate_backend: ${clean(status.operateBackend)}`,
    `authenticated_backend: ${clean(status.authenticatedBackend)}`,
    `existing_tab_backend: ${clean(status.existingTabBackend)}`,
    `public_crawl_backend: ${clean(status.publicCrawlBackend)}`,
    `compatibility_backend: ${clean(status.compatibilityBackend)}`,
    `regular_chrome_status: ${clean(status.regularChromeStatus)}`,
    `regular_chrome_new_background_tabs_allowed: ${yesNo(status.regularChromeNewBackgroundTabsAllowed)}`,
    `chrome_mcp_new_background_tab_allowed: ${yesNo(status.chromeMcpNewBackgroundTabAllowed)}`,
    `chrome_mcp_new_background_url_env: ${clean(status.chromeMcpNewBackgroundUrlEnv)}`,
    `chrome_mcp_new_background_url_value_read: ${yesNo(status.chromeMcpNewBackgroundUrlValueRead)}`,
    `chrome_mcp_route_ready: ${yesNo(status.chromeMcpRouteReady)}`,
    `chrome_mcp_list_pages_timed_out: ${yesNo(status.chromeMcpListPagesTimedOut)}`,
    `chrome_mcp_timeout_plan_source: ${clean(status.chromeMcpTimeoutPlanSource)}`,
    `chrome_mcp_timeout_plan_status: ${clean(status.chromeMcpTimeoutPlanStatus)}`,
    `chrome_mcp_timeout_plan_stale: ${yesNo(status.chromeMcpTimeoutPlanStale)}`,
    `chrome_mcp_timeout_plan_page_list_timeout: ${yesNo(status.chromeMcpTimeoutPlanPageListTimeout)}`,
    `chrome_mcp_timeout_plan_use_everyday_chrome_now: ${yesNo(status.chromeMcpTimeoutPlanUseEverydayChromeNow)}`,
    `chrome_mcp_timeout_plan_prefer_extension_resume: ${yesNo(status.chromeMcpTimeoutPlanPreferExtensionResume)}`,
    `chrome_mcp_timeout_plan_findings: ${status.chromeMcpTimeoutPlanFindings?.length ? status.chromeMcpTimeoutPlanFindings.join(',') : 'none'}`,
    `backend_count: ${status.backendCount ?? 0}`,
    `saved_secret_values_read: ${yesNo(status.savedSecretValuesRead)}`,
    `saved_destructive_actions: ${yesNo(status.savedDestructiveActions)}`,
    `agent_safe_next_command_id: ${clean(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `agent_safe_next_command: ${status.agentSafeNextCommand?.shell || 'none'}`,
    `path: ${status.path}`,
    `refresh_command: ${status.commands.refresh.shell}`,
    `status_command: ${status.commands.status.shell}`,
    `providers_command: ${status.commands.providers.shell}`,
    `provider_doctor_status_command: ${status.commands.providerDoctorStatus.shell}`,
    `agent_browser_doctor_command: ${status.commands.agentBrowserDoctor.shell}`,
    `lightpanda_doctor_command: ${status.commands.lightpandaDoctor.shell}`,
    `playwright_doctor_command: ${status.commands.playwrightDoctor.shell}`,
    `selenium_doctor_command: ${status.commands.seleniumDoctor.shell}`,
    `chrome_mcp_timeout_plan_status_command: ${status.commands.chromeMcpTimeoutPlanStatus.shell}`,
    `chrome_mcp_timeout_plan_refresh_command: ${status.commands.chromeMcpTimeoutPlanRefresh.shell}`,
    `search_route_command: ${status.commands.searchRoute.shell}`,
    `analyze_route_command: ${status.commands.analyzeRoute.shell}`,
    `scrape_route_command: ${status.commands.scrapeRoute.shell}`,
    `operate_route_command: ${status.commands.operateRoute.shell}`,
    `existing_tab_route_command: ${status.commands.existingTabRoute.shell}`,
    `authenticated_route_command: ${status.commands.authenticatedRoute.shell}`,
    `public_crawl_route_command: ${status.commands.publicRoute.shell}`,
    `compatibility_route_command: ${status.commands.compatibilityRoute.shell}`,
    `search_workflow_command: ${status.commands.searchWorkflow.shell}`,
    `analyze_workflow_command: ${status.commands.analyzeWorkflow.shell}`,
    `scrape_workflow_command: ${status.commands.scrapeWorkflow.shell}`,
    `operate_workflow_command: ${status.commands.operateWorkflow.shell}`,
    `search_selector_command: ${status.commands.searchSelector.shell}`,
    `analyze_selector_command: ${status.commands.analyzeSelector.shell}`,
    `scrape_selector_command: ${status.commands.scrapeSelector.shell}`,
    `operate_selector_command: ${status.commands.operateSelector.shell}`,
    `existing_tab_selector_command: ${status.commands.existingTabSelector.shell}`,
    `public_crawl_selector_command: ${status.commands.publicCrawlSelector.shell}`
  ];
  if (status.parseError) lines.push(`parse_error: ${clean(status.parseError)}`);
  return `${lines.join('\n')}\n`;
}

export function formatBackendMatrixMarkdown(matrix) {
  const lines = [
    '# Secure Browser Agent Backend Matrix',
    '',
    `Generated: ${matrix.generatedAt}`,
    `Safe mode: ${matrix.safeMode ? 'yes' : 'no'}`,
    `Secret values read: ${matrix.secretValuesRead ? 'yes' : 'no'}`,
    `Opens browser now: ${matrix.opensBrowserNow ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Default backend: ${matrix.defaultBackend || 'none'}`,
    `- Default agent interface: ${matrix.defaultAgentInterface || 'none'}`,
    `- Search: ${matrix.tasks?.search?.selectedLane || 'none'} / ${matrix.tasks?.search?.backend || 'none'}`,
    `- Analyze: ${matrix.tasks?.analyze?.selectedLane || 'none'} / ${matrix.tasks?.analyze?.backend || 'none'}`,
    `- Scrape: ${matrix.tasks?.scrape?.selectedLane || 'none'} / ${matrix.tasks?.scrape?.backend || 'none'}`,
    `- Operate: ${matrix.tasks?.operate?.selectedLane || 'none'} / ${matrix.tasks?.operate?.backend || 'none'}`,
    `- Authenticated scrape: ${matrix.tasks?.['authenticated-scrape']?.selectedLane || 'none'} / ${matrix.tasks?.['authenticated-scrape']?.backend || 'none'}`,
    `- Existing tab: ${matrix.tasks?.['existing-tab']?.selectedLane || 'none'} / ${matrix.tasks?.['existing-tab']?.backend || 'none'}`,
    `- Public crawl: ${matrix.tasks?.['public-crawl']?.selectedLane || 'none'} / ${matrix.tasks?.['public-crawl']?.backend || 'none'}`,
    `- Compatibility: ${matrix.tasks?.['compatibility-test']?.selectedLane || 'none'} / ${matrix.tasks?.['compatibility-test']?.backend || 'none'}`,
    '',
    '## Backends',
    ''
  ];
  for (const backend of matrix.backends || []) {
    lines.push(
      `### ${backend.label}`,
      '',
      `- ID: ${backend.id}`,
      `- Role: ${backend.role}`,
      `- Available: ${backend.available ? 'yes' : 'no'}`,
      `- Status: ${backend.status}`,
      `- Background: ${backend.canRunInBackground ? 'yes' : 'no'}`,
      `- Notes: ${backend.notes}`,
      ''
    );
  }
  lines.push('## Security', '');
  lines.push(`- Everyday Chrome CDP allowed: ${matrix.security?.everydayChromeCdpAllowed ? 'yes' : 'no'}`);
  lines.push(`- Stored auth on everyday Chrome: ${matrix.security?.storedAuthenticatedScrapingOnEverydayChrome ? 'yes' : 'no'}`);
  lines.push(`- Dedicated target profiles for stored auth: ${matrix.security?.dedicatedTargetProfileForStoredAuth ? 'yes' : 'no'}`);
  lines.push('');
  return lines.join('\n');
}
