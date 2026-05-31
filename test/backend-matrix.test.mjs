import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBackendMatrix, buildBackendMatrixStatus, formatBackendMatrixCompact, formatBackendMatrixMarkdown, formatBackendMatrixStatusCompact } from '../src/backend-matrix.mjs';

const providerReport = {
  recommendation: {
    defaultBackend: 'direct-cdp-chrome',
    defaultAgentInterface: 'secure-browser-agent-mcp',
    decision: 'Keep secure-browser-agent direct CDP as the default.'
  },
  localStatus: {
    agentBrowser: { exists: true },
    chromeForTesting: { exists: true },
    secureBrowserAgentMcp: { exists: true },
    playwright: { coreExists: true },
    lightpanda: { binaryExists: false },
    chromeDevtoolsMcp: { npxExists: true },
    selenium: { webdriverPackageExists: false }
  }
};

const regularChromeStatus = {
  status: 'stale',
  ready: false,
  stale: true,
  selectedLane: 'regular-chrome-extension-resume',
  backend: 'codex-chrome-extension',
  canRunInBackground: false,
  blockedReason: 'backend unproved',
  appleEvents: {
    activeTabObserved: true,
    javascriptAllowed: false
  },
  chromeMcpObservation: {
    exists: true,
    status: 'page-list-timeout',
    routeReady: false,
    observedConnected: true,
    observedTools: 29,
    observedPageListOk: false,
    observedPageCount: null,
    listPagesTimedOut: true,
    lastError: 'Request timed out after 30000ms'
  }
};

const chromeMcpTimeoutPlanStatus = {
  status: 'mcp-connected-page-list-timeout',
  exists: true,
  stale: false,
  ageSeconds: 30,
  connected: true,
  pageListOk: false,
  pageListTimeout: true,
  useEverydayChromeNow: false,
  preferExtensionResume: true,
  cleanupIsManual: true,
  nextAction: 'use-gated-extension-resume-or-clean-stale-mcp',
  findings: ['page-list-timeout', 'duplicate-mcp-servers'],
  cleanup: {
    ownerSessionCount: 3,
    reviewOwnerPids: [200, 300]
  }
};

const routes = {
  search: {
    selectedLane: 'public-search-direct-cdp',
    backend: 'direct-cdp-chrome',
    profileMode: 'public-profile',
    canRunInBackground: true
  },
  analyze: {
    selectedLane: 'direct-cdp-page-analysis',
    backend: 'direct-cdp-chrome',
    profileMode: 'public-or-dedicated-target-profile',
    canRunInBackground: true
  },
  scrape: {
    selectedLane: 'target-pack-direct-cdp',
    backend: 'direct-cdp-chrome',
    profileMode: 'dedicated-target-profile',
    operatorInput: true,
    canRunInBackground: true,
    captureBlocked: true
  },
  operate: {
    selectedLane: 'target-pack-direct-cdp-operate',
    backend: 'direct-cdp-chrome',
    profileMode: 'dedicated-target-profile',
    operatorInput: true,
    userPermissionRequired: true,
    canRunInBackground: true,
    captureBlocked: true
  },
  'existing-tab': {
    selectedLane: 'regular-chrome-extension-handoff',
    backend: 'codex-chrome-extension',
    profileMode: 'everyday-chrome-selected-profile',
    userPermissionRequired: true,
    canRunInBackground: false
  },
  'authenticated-scrape': {
    selectedLane: 'target-pack-direct-cdp',
    backend: 'direct-cdp-chrome',
    profileMode: 'dedicated-target-profile',
    operatorInput: true,
    canRunInBackground: true,
    captureBlocked: true
  },
  'public-crawl': {
    selectedLane: 'direct-cdp-public',
    backend: 'direct-cdp-chrome',
    profileMode: 'public-or-ephemeral-profile',
    canRunInBackground: true
  },
  'compatibility-test': {
    selectedLane: 'direct-cdp-with-selenium-plan',
    backend: 'direct-cdp-chrome',
    profileMode: 'test-profile',
    canRunInBackground: true
  }
};

test('backend matrix summarizes task routes and local backend readiness without secrets', async () => {
  const matrix = await buildBackendMatrix({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    providerReport,
    regularChromeStatus,
    chromeMcpTimeoutPlanStatus,
    routes
  });

  assert.equal(matrix.safeMode, true);
  assert.equal(matrix.statusOnly, true);
  assert.equal(matrix.secretValuesRead, false);
  assert.equal(matrix.opensBrowserNow, false);
  assert.equal(matrix.defaultBackend, 'direct-cdp-chrome');
  assert.equal(matrix.tasks.search.backend, 'direct-cdp-chrome');
  assert.equal(matrix.tasks.analyze.backend, 'direct-cdp-chrome');
  assert.equal(matrix.tasks.scrape.backend, 'direct-cdp-chrome');
  assert.equal(matrix.tasks.operate.backend, 'direct-cdp-chrome');
  assert.equal(matrix.tasks['authenticated-scrape'].backend, 'direct-cdp-chrome');
  assert.equal(matrix.tasks['existing-tab'].backend, 'codex-chrome-extension');
  assert.equal(matrix.regularChrome.chromeMcpRouteReady, false);
  assert.equal(matrix.chromeMcpTimeoutPlan.status, 'mcp-connected-page-list-timeout');
  assert.equal(matrix.chromeMcpTimeoutPlan.pageListTimeout, true);
  assert.equal(matrix.chromeMcpTimeoutPlan.preferExtensionResume, true);
  assert.equal(matrix.security.dedicatedTargetProfileForStoredAuth, true);
  assert.equal(matrix.security.storedAuthenticatedScrapingOnEverydayChrome, false);
  assert.equal(matrix.backends.some((backend) => backend.id === 'chrome-devtools-mcp'), true);
  assert.equal(matrix.backends.find((backend) => backend.id === 'chrome-devtools-mcp').supportsExistingTabs, false);
  assert.equal(matrix.backends.find((backend) => backend.id === 'direct-cdp-chrome').supportsAuthenticatedProfiles, true);
});

test('backend matrix compact output is low-token and route oriented', async () => {
  const matrix = await buildBackendMatrix({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    providerReport,
    regularChromeStatus,
    chromeMcpTimeoutPlanStatus,
    routes
  });
  const compact = formatBackendMatrixCompact(matrix);

  assert.match(compact, /^safe_mode: yes$/m);
  assert.match(compact, /^status_only: yes$/m);
  assert.match(compact, /^search_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^analyze_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^scrape_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^operate_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^authenticated_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^existing_tab_backend: codex-chrome-extension$/m);
  assert.match(compact, /^chrome_mcp_route_ready: no$/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_status: mcp-connected-page-list-timeout$/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_page_list_timeout: yes$/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_prefer_extension_resume: yes$/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_findings: page-list-timeout,duplicate-mcp-servers$/m);
  assert.match(compact, /^backend_chrome-devtools-mcp: available=yes role=existing-tab-debug-companion status=page-list-timeout auth=no existing_tab=no/m);
  assert.match(compact, /^stored_authenticated_scraping_on_everyday_chrome: no$/m);
  assert.match(compact, /^search_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'search' '--format' 'compact'$/m);
  assert.match(compact, /^analyze_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'analyze' '--format' 'compact'$/m);
  assert.match(compact, /^scrape_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'scrape' '--format' 'compact'$/m);
  assert.match(compact, /^operate_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'operate' '--format' 'compact'$/m);
  assert.match(compact, /^existing_tab_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'existing-tab' '--format' 'compact'$/m);
  assert.match(compact, /^public_crawl_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'public-crawl' '--format' 'compact'$/m);
  assert.match(compact, /^compatibility_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'compatibility-test' '--format' 'compact'$/m);
  assert.match(compact, /^search_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'search' '--query' '<query>' '--format' 'compact'$/m);
  assert.match(compact, /^analyze_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'analyze' '--format' 'compact'$/m);
  assert.match(compact, /^scrape_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'scrape' '--format' 'compact'$/m);
  assert.match(compact, /^operate_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'operate' '--format' 'compact'$/m);
  assert.match(compact, /^search_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'search' '--query' '<query>' '--backend-matrix-in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^scrape_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'scrape' '--backend-matrix-in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^operate_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'operate' '--backend-matrix-in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^existing_tab_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'existing-tab' '--backend-matrix-in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^providers_command: 'node' 'src\/cli\.mjs' 'providers' '--format' 'compact'$/m);
  assert.match(compact, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
  assert.match(compact, /^agent_browser_doctor_command: 'node' 'src\/cli\.mjs' 'agent-browser-doctor' '--format' 'compact'$/m);
  assert.match(compact, /^lightpanda_doctor_command: 'node' 'src\/cli\.mjs' 'lightpanda-doctor' '--format' 'compact'$/m);
  assert.match(compact, /^playwright_doctor_command: 'node' 'src\/cli\.mjs' 'playwright-doctor' '--format' 'compact'$/m);
  assert.match(compact, /^selenium_doctor_command: 'node' 'src\/cli\.mjs' 'selenium-doctor' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^\{/);
});

test('backend matrix markdown renders the backend table context', async () => {
  const matrix = await buildBackendMatrix({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    providerReport,
    regularChromeStatus,
    chromeMcpTimeoutPlanStatus,
    routes
  });
  const markdown = formatBackendMatrixMarkdown(matrix);

  assert.match(markdown, /Backend Matrix/);
  assert.match(markdown, /Search: public-search-direct-cdp \/ direct-cdp-chrome/);
  assert.match(markdown, /Operate: target-pack-direct-cdp-operate \/ direct-cdp-chrome/);
  assert.match(markdown, /Direct Chrome CDP/);
  assert.match(markdown, /Stored auth on everyday Chrome: no/);
});

test('backend matrix preserves everyday Chrome background-tab opt-in in existing-tab commands', async () => {
  const backgroundRegularChromeStatus = {
    ...regularChromeStatus,
    ready: true,
    status: 'ready',
    selectedLane: 'regular-chrome-mcp-new-background-tab',
    backend: 'chrome-devtools-mcp',
    canRunInBackground: true,
    scope: {
      existingTabsOnly: false,
      newBackgroundTabsAllowed: true
    },
    chromeMcp: {
      newBackgroundTabAllowed: true,
      newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
      newBackgroundUrlValueRead: false
    }
  };
  const backgroundRoutes = {
    ...routes,
    'existing-tab': {
      selectedLane: 'regular-chrome-mcp-new-background-tab',
      backend: 'chrome-devtools-mcp',
      profileMode: 'everyday-chrome-new-background-tab',
      canRunInBackground: true
    }
  };
  const matrix = await buildBackendMatrix({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    providerReport,
    regularChromeStatus: backgroundRegularChromeStatus,
    chromeMcpTimeoutPlanStatus,
    routes: backgroundRoutes,
    mcpObservationIn: 'operator/chrome-mcp-observation-latest.json'
  });

  assert.equal(matrix.tasks['existing-tab'].backend, 'chrome-devtools-mcp');
  assert.equal(matrix.regularChrome.newBackgroundTabsAllowed, true);
  assert.equal(matrix.regularChrome.chromeMcpNewBackgroundUrlEnv, 'REGULAR_CHROME_URL');
  assert.equal(matrix.backends.find((backend) => backend.id === 'chrome-devtools-mcp').status, 'ready-for-new-background-tab');
  assert.equal(matrix.backends.find((backend) => backend.id === 'chrome-devtools-mcp').supportsExistingTabs, true);
  assert.equal(matrix.backends.find((backend) => backend.id === 'chrome-devtools-mcp').canRunInBackground, true);
  assert.deepEqual(matrix.commands.existingTabRoute.args, [
    'node', 'src/cli.mjs', 'browser-route',
    '--task', 'existing-tab',
    '--allow-new-background-tab', 'yes',
    '--new-background-url-env', 'REGULAR_CHROME_URL',
    '--format', 'compact'
  ]);
  assert.ok(matrix.commands.existingTabSelector.args.includes('--new-background-url-env'));
  assert.match(matrix.commands.regularChromeStatus.shell, /'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/);
  assert.match(matrix.commands.write.shell, /'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/);

  const compact = formatBackendMatrixCompact(matrix);
  assert.match(compact, /^regular_chrome_new_background_tabs_allowed: yes$/m);
  assert.match(compact, /^chrome_mcp_new_background_url_env: REGULAR_CHROME_URL$/m);
  assert.match(compact, /^chrome_mcp_new_background_url_value_read: no$/m);
  assert.match(compact, /^backend_chrome-devtools-mcp: available=yes role=existing-tab-debug-companion status=ready-for-new-background-tab auth=no existing_tab=yes .* background=yes/m);
  assert.match(compact, /^existing_tab_route_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(compact, /^existing_tab_selector_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(compact, /^regular_chrome_status_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);

  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-backend-matrix-bg-'));
  try {
    await buildBackendMatrix({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      providerReport,
      regularChromeStatus: backgroundRegularChromeStatus,
      chromeMcpTimeoutPlanStatus,
      routes: backgroundRoutes,
      mcpObservationIn: 'operator/chrome-mcp-observation-latest.json',
      write: true,
      out: 'operator/backend-matrix-latest.json'
    });
    const status = buildBackendMatrixStatus({
      rootDir,
      generatedAt: '2026-05-30T00:01:00.000Z',
      in: 'operator/backend-matrix-latest.json',
      mcpObservationIn: 'operator/chrome-mcp-observation-latest.json'
    });
    assert.equal(status.regularChromeNewBackgroundTabsAllowed, true);
    assert.equal(status.chromeMcpNewBackgroundUrlEnv, 'REGULAR_CHROME_URL');
    assert.ok(status.commands.existingTabRoute.args.includes('--new-background-url-env'));
    assert.match(status.commands.refresh.shell, /'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/);

    const statusCompact = formatBackendMatrixStatusCompact(status);
    assert.match(statusCompact, /^regular_chrome_new_background_tabs_allowed: yes$/m);
    assert.match(statusCompact, /^existing_tab_selector_command: .*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('backend matrix status overlays background-tab opt-in onto older saved reports', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-backend-matrix-bg-status-'));
  try {
    await buildBackendMatrix({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      providerReport,
      regularChromeStatus,
      chromeMcpTimeoutPlanStatus,
      routes,
      write: true,
      out: 'operator/backend-matrix-latest.json'
    });
    const status = buildBackendMatrixStatus({
      rootDir,
      generatedAt: '2026-05-30T00:01:00.000Z',
      in: 'operator/backend-matrix-latest.json',
      allowNewBackgroundTab: 'yes',
      newBackgroundUrlEnv: 'REGULAR_CHROME_URL'
    });

    assert.equal(status.regularChromeNewBackgroundTabsAllowed, true);
    assert.equal(status.chromeMcpNewBackgroundTabAllowed, true);
    assert.equal(status.chromeMcpNewBackgroundUrlEnv, 'REGULAR_CHROME_URL');
    assert.ok(status.commands.refresh.args.includes('--allow-new-background-tab'));
    assert.ok(status.commands.existingTabRoute.args.includes('--new-background-url-env'));

    const compact = formatBackendMatrixStatusCompact(status);
    assert.match(compact, /^regular_chrome_new_background_tabs_allowed: yes$/m);
    assert.match(compact, /^chrome_mcp_new_background_tab_allowed: yes$/m);
    assert.match(compact, /^chrome_mcp_new_background_url_env: REGULAR_CHROME_URL$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('backend matrix status refreshes the nested Chrome MCP timeout plan when it is stale', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-backend-matrix-child-stale-'));
  try {
    await buildBackendMatrix({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      providerReport,
      regularChromeStatus,
      chromeMcpTimeoutPlanStatus: {
        ...chromeMcpTimeoutPlanStatus,
        status: 'stale',
        stale: true
      },
      routes,
      write: true,
      out: 'operator/backend-matrix-latest.json'
    });
    const status = buildBackendMatrixStatus({
      rootDir,
      generatedAt: '2026-05-30T00:01:00.000Z',
      in: 'operator/backend-matrix-latest.json',
      staleAfterSeconds: 900
    });

    assert.equal(status.status, 'fresh');
    assert.equal(status.chromeMcpTimeoutPlanStale, true);
    assert.equal(status.agentSafeNextCommandId, 'chrome-mcp-timeout-plan-refresh');
    assert.equal(status.agentSafeNextMayRunUnattended, true);
    assert.equal(status.agentSafeNextOpensBrowser, false);
    assert.equal(status.agentSafeNextStartsCapture, false);
    assert.equal(status.agentSafeNextReadsBrowserStorage, false);
    assert.equal(status.agentSafeNextReturnsPageContent, false);
    assert.deepEqual(status.agentSafeNextCommand.args, [
      'node',
      'src/cli.mjs',
      'chrome-mcp-timeout-plan',
      '--write',
      '--format',
      'compact'
    ]);

    const compact = formatBackendMatrixStatusCompact(status);
    assert.match(compact, /^chrome_mcp_timeout_plan_stale: yes$/m);
    assert.match(compact, /^agent_safe_next_command_id: chrome-mcp-timeout-plan-refresh$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('backend matrix status uses a fresh standalone Chrome MCP timeout plan over a stale embedded one', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-backend-matrix-child-latest-'));
  try {
    await buildBackendMatrix({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      providerReport,
      regularChromeStatus,
      chromeMcpTimeoutPlanStatus: {
        ...chromeMcpTimeoutPlanStatus,
        status: 'stale',
        stale: true
      },
      routes,
      write: true,
      out: 'operator/backend-matrix-latest.json'
    });
    const latestPath = path.join(rootDir, 'runs/operator/chrome-mcp-timeout-plan-latest.json');
    fs.mkdirSync(path.dirname(latestPath), { recursive: true });
    fs.writeFileSync(latestPath, `${JSON.stringify({
      generatedAt: '2026-05-30T00:00:30.000Z',
      status: {
        decision: 'mcp-connected-page-list-failed',
        connected: true,
        pageListOk: false,
        pageListTimeout: false
      },
      guidance: {
        useEverydayChromeNow: false,
        preferExtensionResume: true,
        cleanupIsManual: true
      },
      findings: [{ id: 'duplicate-mcp-servers' }],
      cleanup: {},
      commands: {}
    }, null, 2)}\n`, 'utf8');

    const status = buildBackendMatrixStatus({
      rootDir,
      generatedAt: '2026-05-30T00:01:00.000Z',
      in: 'operator/backend-matrix-latest.json',
      staleAfterSeconds: 900
    });

    assert.equal(status.status, 'fresh');
    assert.equal(status.chromeMcpTimeoutPlanSource, 'latest-file');
    assert.equal(status.chromeMcpTimeoutPlanStatus, 'mcp-connected-page-list-failed');
    assert.equal(status.chromeMcpTimeoutPlanStale, false);
    assert.equal(status.chromeMcpTimeoutPlanPreferExtensionResume, true);
    assert.deepEqual(status.chromeMcpTimeoutPlanFindings, ['duplicate-mcp-servers']);
    assert.equal(status.agentSafeNextCommandId, 'none');
    assert.equal(status.agentSafeNextMayRunUnattended, false);

    const compact = formatBackendMatrixStatusCompact(status);
    assert.match(compact, /^chrome_mcp_timeout_plan_source: latest-file$/m);
    assert.match(compact, /^chrome_mcp_timeout_plan_stale: no$/m);
    assert.match(compact, /^agent_safe_next_command_id: none$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('backend matrix writes and status reads a saved low-token handoff', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-backend-matrix-'));
  try {
    const matrix = await buildBackendMatrix({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      providerReport,
      regularChromeStatus,
      chromeMcpTimeoutPlanStatus,
      routes,
      write: true,
      out: 'operator/backend-matrix-latest.json'
    });
    assert.equal(matrix.outputPath, path.join(rootDir, 'runs/operator/backend-matrix-latest.json'));
    assert.equal(fs.existsSync(matrix.outputPath), true);

    const status = buildBackendMatrixStatus({
      rootDir,
      generatedAt: '2026-05-30T00:05:00.000Z',
      in: 'operator/backend-matrix-latest.json',
      staleAfterSeconds: 900
    });
    assert.equal(status.status, 'fresh');
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.savedSecretValuesRead, false);
    assert.equal(status.defaultBackend, 'direct-cdp-chrome');
    assert.equal(status.searchBackend, 'direct-cdp-chrome');
    assert.equal(status.analyzeBackend, 'direct-cdp-chrome');
    assert.equal(status.scrapeBackend, 'direct-cdp-chrome');
    assert.equal(status.operateBackend, 'direct-cdp-chrome');
    assert.equal(status.existingTabBackend, 'codex-chrome-extension');
    assert.equal(status.chromeMcpListPagesTimedOut, true);
    assert.equal(status.chromeMcpTimeoutPlanStatus, 'mcp-connected-page-list-timeout');
    assert.equal(status.chromeMcpTimeoutPlanPageListTimeout, true);
    assert.equal(status.chromeMcpTimeoutPlanPreferExtensionResume, true);
    assert.equal(status.backendCount, 8);
    assert.equal(status.agentSafeNextCommandId, 'none');
    assert.equal(status.agentSafeNextMayRunUnattended, false);

    const compact = formatBackendMatrixStatusCompact(status);
    assert.match(compact, /^status: fresh$/m);
    assert.match(compact, /^search_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^operate_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^existing_tab_backend: codex-chrome-extension$/m);
    assert.match(compact, /^chrome_mcp_timeout_plan_status: mcp-connected-page-list-timeout$/m);
    assert.match(compact, /^chrome_mcp_timeout_plan_page_list_timeout: yes$/m);
    assert.match(compact, /^chrome_mcp_timeout_plan_prefer_extension_resume: yes$/m);
    assert.match(compact, /^saved_secret_values_read: no$/m);
    assert.match(compact, /^agent_safe_next_command_id: none$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: no$/m);
    assert.match(compact, /^search_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'search' '--format' 'compact'$/m);
    assert.match(compact, /^existing_tab_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'existing-tab' '--format' 'compact'$/m);
    assert.match(compact, /^public_crawl_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'public-crawl' '--format' 'compact'$/m);
    assert.match(compact, /^compatibility_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'compatibility-test' '--format' 'compact'$/m);
    assert.match(compact, /^operate_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'operate' '--format' 'compact'$/m);
    assert.match(compact, /^operate_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'operate' '--backend-matrix-in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^existing_tab_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'existing-tab' '--backend-matrix-in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^providers_command: 'node' 'src\/cli\.mjs' 'providers' '--format' 'compact'$/m);
    assert.match(compact, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
    assert.match(compact, /^agent_browser_doctor_command: 'node' 'src\/cli\.mjs' 'agent-browser-doctor' '--format' 'compact'$/m);
    assert.match(compact, /^lightpanda_doctor_command: 'node' 'src\/cli\.mjs' 'lightpanda-doctor' '--format' 'compact'$/m);
    assert.match(compact, /^playwright_doctor_command: 'node' 'src\/cli\.mjs' 'playwright-doctor' '--format' 'compact'$/m);
    assert.match(compact, /^selenium_doctor_command: 'node' 'src\/cli\.mjs' 'selenium-doctor' '--format' 'compact'$/m);

    await assert.rejects(
      () => buildBackendMatrix({
        rootDir,
        providerReport,
        regularChromeStatus,
        chromeMcpTimeoutPlanStatus,
        routes,
        write: true,
        out: '../backend-matrix.json'
      }),
      /invalid backend matrix output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('backend matrix status exposes refresh as safe next when saved matrix is missing', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-backend-matrix-missing-'));
  try {
    const status = buildBackendMatrixStatus({
      rootDir,
      generatedAt: '2026-05-30T00:05:00.000Z',
      in: 'operator/missing-backend-matrix.json'
    });

    assert.equal(status.status, 'missing');
    assert.equal(status.exists, false);
    assert.equal(status.stale, true);
    assert.equal(status.agentSafeNextCommandId, 'backend-matrix-refresh');
    assert.equal(status.agentSafeNextMayRunUnattended, true);
    assert.equal(status.agentSafeNextOpensBrowser, false);
    assert.equal(status.agentSafeNextStartsCapture, false);
    assert.equal(status.agentSafeNextReadsBrowserStorage, false);
    assert.equal(status.agentSafeNextReturnsPageContent, false);
    assert.deepEqual(status.agentSafeNextCommand.args, [
      'node', 'src/cli.mjs', 'backend-matrix',
      '--write', '--out', 'operator/missing-backend-matrix.json',
      '--format', 'compact'
    ]);

    const compact = formatBackendMatrixStatusCompact(status);
    assert.match(compact, /^agent_safe_next_command_id: backend-matrix-refresh$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--write' '--out' 'operator\/missing-backend-matrix\.json' '--format' 'compact'$/m);
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--write' '--out' 'operator\/missing-backend-matrix\.json' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
