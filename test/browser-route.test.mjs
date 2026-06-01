import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrowserRoute, formatBrowserRouteCompact, formatBrowserRouteMarkdown } from '../src/browser-route.mjs';

function command(id) {
  return {
    shell: `'node' 'src/cli.mjs' '${id}'`,
    args: ['node', 'src/cli.mjs', id]
  };
}

function baseFixtures(overrides = {}) {
  return {
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    proofGateStatus: {
      complete: false,
      status: 'waiting-for-login',
      target: 'github',
      operatorInput: true,
      authCheckOk: false,
      loginLike: true,
      operatorGuidance: {
        captureBlocked: true
      },
      recommendedCommand: {
        command: command('target-handoff-resume')
      }
    },
    chromeControlPlan: {
      recommendedLane: 'target-pack',
      chrome: {
        regularExtensionPrepared: true,
        regularExtensionReady: false
      }
    },
    chromeExtensionHandoff: {
      needsUserPermission: true,
      commands: [
        {
          id: 'open-selected-profile-window',
          opensBrowser: true,
          runOnlyAfterUserSays: 'OK',
          command: command('open-chrome-window')
        }
      ]
    },
    chromeMcpStatus: {
      observedSource: '',
      observed: {
        chromeDevtoolsMcpConnected: null,
        chromeDevtoolsMcpTools: null,
        chromeDevtoolsMcpPageListOk: null,
        chromeDevtoolsMcpPageCount: null,
        chromeDevtoolsMcpListPagesTimedOut: false,
        chromeDevtoolsMcpLastError: ''
      },
      decision: {
        status: 'mcp-process-present-unproved',
        chromeDevtoolsMcpUsableForEverydayTabs: false,
        usableForEverydayChromeTabs: false
      }
    },
    lightpandaDoctor: {
      readyForPublicBenchmark: false
    },
    seleniumDoctor: {
      readyForLocalSmoke: false
    },
    ...overrides
  };
}

test('browser route keeps stored authenticated scraping in a dedicated target profile', async () => {
  const route = await buildBrowserRoute(baseFixtures({ task: 'authenticated-scrape' }));

  assert.equal(route.safeMode, true);
  assert.equal(route.destructiveActionsIncluded, false);
  assert.equal(route.secretValuesRead, false);
  assert.equal(route.opensBrowserNow, false);
  assert.equal(route.task, 'authenticated-scrape');
  assert.equal(route.selectedLane, 'target-pack-direct-cdp');
  assert.equal(route.backend, 'direct-cdp-chrome');
  assert.equal(route.profileMode, 'dedicated-target-profile');
  assert.equal(route.operatorInput, true);
  assert.equal(route.captureBlocked, true);
  assert.equal(route.security.everydayChromeCdpAllowed, false);
  assert.equal(route.security.dedicatedTargetProfileForStoredAuth, true);
  assert.match(route.commands.route.shell, /target-handoff-resume/);

  const compact = formatBrowserRouteCompact(route);
  assert.match(compact, /^selected_lane: target-pack-direct-cdp$/m);
  assert.match(compact, /^backend: direct-cdp-chrome$/m);
  assert.match(compact, /^dedicated_target_profile_for_stored_auth: yes$/m);
  assert.match(compact, /^proof_gate_login_like: yes$/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'$/m);
});

test('browser route skips everyday Chrome probes for authenticated scrape tasks', async () => {
  const route = await buildBrowserRoute({
    ...baseFixtures({
      task: 'authenticated-scrape',
      chromeControlPlan: undefined,
      chromeExtensionHandoff: undefined,
      chromeMcpStatus: undefined
    }),
    runner: () => {
      throw new Error('everyday Chrome helper should not be called');
    }
  });

  assert.equal(route.selectedLane, 'target-pack-direct-cdp');
  assert.equal(route.backend, 'direct-cdp-chrome');
  assert.equal(route.evidence.chromeRecommendedLane, 'not-checked');
  assert.equal(route.evidence.regularChromeExtensionPrepared, false);
});

test('browser route gates everyday Chrome tab work on extension backend readiness', async () => {
  const route = await buildBrowserRoute(baseFixtures({ task: 'existing-tab' }));

  assert.equal(route.selectedLane, 'regular-chrome-extension-handoff');
  assert.equal(route.backend, 'codex-chrome-extension');
  assert.equal(route.profileMode, 'everyday-chrome-selected-profile');
  assert.equal(route.userPermissionRequired, true);
  assert.equal(route.operatorInput, true);
  assert.equal(route.canRunInBackground, false);
  assert.equal(route.commandOpensBrowser, false);
  assert.equal(route.approvalCommandOpensBrowser, true);
  assert.equal(route.commandRunOnlyAfterUserSays, 'OK');
  assert.match(route.commands.route.shell, /chrome-extension-resume/);
  assert.match(route.commands.approval.shell, /--operator-ok' 'OK/);

  const markdown = formatBrowserRouteMarkdown(route);
  assert.match(markdown, /Everyday Chrome CDP allowed: no/);
  assert.match(markdown, /User permission required: yes/);
  assert.match(markdown, /Command opens browser: no/);
  assert.match(markdown, /Approval command opens browser: yes/);
  assert.match(formatBrowserRouteCompact(route), /^command_run_only_after_user_says: OK$/m);
  assert.match(formatBrowserRouteCompact(route), /^approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume'/m);
});

test('browser route can use observed Chrome MCP for existing everyday Chrome tabs', async () => {
  const route = await buildBrowserRoute(baseFixtures({
    task: 'existing-tab',
    chromeMcpStatus: {
      observedSource: 'peekaboo.browser.status',
      observed: {
        chromeDevtoolsMcpConnected: true,
        chromeDevtoolsMcpTools: 29,
        chromeDevtoolsMcpPageListOk: true,
        chromeDevtoolsMcpPageCount: 4,
        chromeDevtoolsMcpListPagesTimedOut: false,
        chromeDevtoolsMcpLastError: ''
      },
      decision: {
        status: 'usable-for-operator-requested-tabs',
        chromeDevtoolsMcpUsableForEverydayTabs: true,
        usableForEverydayChromeTabs: true
      }
    }
  }));

  assert.equal(route.selectedLane, 'regular-chrome-mcp');
  assert.equal(route.backend, 'chrome-devtools-mcp');
  assert.equal(route.profileMode, 'everyday-chrome-live-tabs');
  assert.equal(route.operatorInput, false);
  assert.equal(route.userPermissionRequired, false);
  assert.equal(route.canRunInBackground, true);
  assert.equal(route.security.dedicatedTargetProfileForStoredAuth, true);
  assert.equal(route.evidence.chromeMcpUsableForEverydayTabs, true);
  assert.equal(route.evidence.chromeMcpObservedConnected, true);
  assert.equal(route.evidence.chromeMcpObservedTools, 29);
  assert.equal(route.evidence.chromeMcpObservedPageListOk, true);
  assert.equal(route.evidence.chromeMcpObservedPageCount, 4);
  assert.match(route.commands.route.shell, /chrome-mcp-status/);

  const compact = formatBrowserRouteCompact(route);
  assert.match(compact, /^selected_lane: regular-chrome-mcp$/m);
  assert.match(compact, /^backend: chrome-devtools-mcp$/m);
  assert.match(compact, /^chrome_mcp_usable_for_everyday_tabs: yes$/m);
  assert.match(compact, /^chrome_mcp_observed_connected: yes$/m);
  assert.match(compact, /^chrome_mcp_observed_tools: 29$/m);
  assert.match(compact, /^chrome_mcp_observed_page_list_ok: yes$/m);
  assert.match(compact, /^chrome_mcp_observed_page_count: 4$/m);

  const markdown = formatBrowserRouteMarkdown(route);
  assert.match(markdown, /Chrome MCP usable for everyday tabs: yes/);
});

test('browser route skips extension helpers when observed Chrome MCP is ready', async () => {
  const route = await buildBrowserRoute({
    ...baseFixtures({
      task: 'existing-tab',
      chromeControlPlan: undefined,
      chromeExtensionHandoff: undefined,
      chromeMcpStatus: undefined
    }),
    chromeMcpConnected: 'yes',
    chromeMcpTools: 29,
    chromeMcpPageListOk: 'yes',
    chromeMcpPageCount: 4,
    chromeMcpSource: 'test',
    runner: () => {
      throw new Error('extension helper should not be called');
    }
  });

  assert.equal(route.selectedLane, 'regular-chrome-mcp');
  assert.equal(route.backend, 'chrome-devtools-mcp');
  assert.equal(route.userPermissionRequired, false);
  assert.equal(route.evidence.chromeMcpUsableForEverydayTabs, true);
  assert.equal(route.evidence.regularChromeExtensionPrepared, false);
});

test('browser route does not select Chrome MCP when list_pages timed out', async () => {
  const route = await buildBrowserRoute(baseFixtures({
    task: 'existing-tab',
    chromeMcpStatus: {
      observedSource: 'peekaboo.browser.list_pages',
      observed: {
        chromeDevtoolsMcpConnected: true,
        chromeDevtoolsMcpTools: 29,
        chromeDevtoolsMcpPageListOk: false,
        chromeDevtoolsMcpPageCount: null,
        chromeDevtoolsMcpListPagesTimedOut: true,
        chromeDevtoolsMcpLastError: 'Network.enable timed out'
      },
      decision: {
        status: 'mcp-connected-page-list-timeout',
        chromeDevtoolsMcpUsableForEverydayTabs: false,
        usableForEverydayChromeTabs: false
      }
    }
  }));

  assert.equal(route.selectedLane, 'regular-chrome-extension-handoff');
  assert.equal(route.evidence.chromeMcpUsableForEverydayTabs, false);
  assert.equal(route.evidence.chromeMcpObservedConnected, true);
  assert.equal(route.evidence.chromeMcpObservedPageListOk, false);
  assert.equal(route.evidence.chromeMcpListPagesTimedOut, true);

  const compact = formatBrowserRouteCompact(route);
  assert.match(compact, /^chrome_mcp_status: mcp-connected-page-list-timeout$/m);
  assert.match(compact, /^chrome_mcp_observed_page_list_ok: no$/m);
  assert.match(compact, /^chrome_mcp_list_pages_timed_out: yes$/m);
  assert.match(compact, /^chrome_mcp_last_error: Network\.enable timed out$/m);
});

test('browser route can use a new Chrome MCP background tab without listing existing tabs', async () => {
  const route = await buildBrowserRoute({
    ...baseFixtures({
      task: 'existing-tab',
      chromeControlPlan: undefined,
      chromeExtensionHandoff: undefined,
      chromeMcpStatus: undefined
    }),
    chromeMcpConnected: 'yes',
    chromeMcpTools: 29,
    chromeMcpPageListOk: 'no',
    chromeMcpLastError: 'Network.enable timed out',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    runner: () => {
      throw new Error('extension helper should not be called for background-tab MCP routing');
    }
  });

  assert.equal(route.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(route.backend, 'chrome-devtools-mcp');
  assert.equal(route.profileMode, 'everyday-chrome-new-background-tab');
  assert.equal(route.operatorInput, false);
  assert.equal(route.userPermissionRequired, false);
  assert.equal(route.canRunInBackground, true);
  assert.equal(route.commandOpensBrowser, false);
  assert.equal(route.security.everydayChromeCdpAllowed, false);
  assert.equal(route.security.dedicatedTargetProfileForStoredAuth, true);
  assert.equal(route.evidence.allowNewBackgroundTab, true);
  assert.equal(route.evidence.newBackgroundUrlEnv, 'REGULAR_CHROME_URL');
  assert.equal(route.evidence.newBackgroundUrlValueRead, false);
  assert.equal(route.evidence.chromeMcpObservedConnected, true);
  assert.equal(route.evidence.chromeMcpObservedPageListOk, false);
  assert.equal(route.evidence.chromeMcpListPagesTimedOut, true);
  assert.equal(route.evidence.regularChromeExtensionPrepared, false);
  assert.match(route.commands.route.shell, /regular-chrome-use/);
  assert.match(route.commands.route.shell, /--allow-new-background-tab' 'yes/);
  assert.match(route.commands.route.shell, /--new-background-url-env' 'REGULAR_CHROME_URL/);

  const compact = formatBrowserRouteCompact(route);
  assert.match(compact, /^selected_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^backend: chrome-devtools-mcp$/m);
  assert.match(compact, /^allow_new_background_tab: yes$/m);
  assert.match(compact, /^new_background_url_env: REGULAR_CHROME_URL$/m);
  assert.match(compact, /^new_background_url_value_read: no$/m);
  assert.match(compact, /^everyday_chrome_cdp_allowed: no$/m);
  assert.match(compact, /^chrome_mcp_observed_page_list_ok: no$/m);
});

test('browser route prefers explicit new Chrome MCP background tab even when page listing is proved', async () => {
  const route = await buildBrowserRoute({
    ...baseFixtures({
      task: 'existing-tab',
      chromeControlPlan: undefined,
      chromeExtensionHandoff: undefined,
      chromeMcpStatus: undefined
    }),
    chromeMcpConnected: 'yes',
    chromeMcpTools: 29,
    chromeMcpPageListOk: 'yes',
    chromeMcpPageCount: 2,
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    runner: () => {
      throw new Error('extension helper should not be called for background-tab MCP routing');
    }
  });

  assert.equal(route.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(route.backend, 'chrome-devtools-mcp');
  assert.equal(route.profileMode, 'everyday-chrome-new-background-tab');
  assert.equal(route.canRunInBackground, true);
  assert.equal(route.evidence.allowNewBackgroundTab, true);
  assert.equal(route.evidence.chromeMcpObservedPageListOk, true);
  assert.match(route.commands.route.shell, /regular-chrome-use/);
  assert.match(route.commands.route.shell, /--chrome-mcp-page-list-ok' 'yes/);
  assert.match(route.commands.route.shell, /--allow-new-background-tab' 'yes/);

  const compact = formatBrowserRouteCompact(route);
  assert.match(compact, /^selected_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^allow_new_background_tab: yes$/m);
  assert.match(compact, /^chrome_mcp_observed_page_list_ok: yes$/m);
});

test('browser route exposes Lightpanda and Selenium as task-specific candidates', async () => {
  const publicRoute = await buildBrowserRoute(baseFixtures({
    task: 'public-crawl',
    lightpandaDoctor: { readyForPublicBenchmark: true }
  }));
  assert.equal(publicRoute.selectedLane, 'lightpanda-public-benchmark-candidate');
  assert.equal(publicRoute.backend, 'lightpanda-candidate');
  assert.equal(publicRoute.operatorInput, false);
  assert.match(publicRoute.commands.route.shell, /provider-benchmarks\/lightpanda-public\.json/);

  const compatRoute = await buildBrowserRoute(baseFixtures({
    task: 'compatibility-test',
    seleniumDoctor: { readyForLocalSmoke: true }
  }));
  assert.equal(compatRoute.selectedLane, 'selenium-compatibility-bridge');
  assert.equal(compatRoute.backend, 'selenium-webdriver');
  assert.match(formatBrowserRouteCompact(compatRoute), /^selenium_local_smoke_ready: yes$/m);
});

test('browser route selects Lightpanda only after the public gate is accepted', async () => {
  const route = await buildBrowserRoute(baseFixtures({
    task: 'public-crawl',
    lightpandaDoctor: { readyForPublicBenchmark: true },
    lightpandaGate: {
      accepted: true,
      status: 'accepted',
      proofRelativePath: 'runs/provider-benchmarks/lightpanda-public.json'
    }
  }));

  assert.equal(route.selectedLane, 'lightpanda-public-gated');
  assert.equal(route.backend, 'lightpanda');
  assert.equal(route.profileMode, 'public-ephemeral-profile');
  assert.equal(route.evidence.lightpandaGateAccepted, true);
  assert.match(formatBrowserRouteCompact(route), /^lightpanda_gate_accepted: yes$/m);
});

test('browser route rejects stale Lightpanda gate when local binary is not ready', async () => {
  const route = await buildBrowserRoute(baseFixtures({
    task: 'public-crawl',
    lightpandaDoctor: { readyForPublicBenchmark: false },
    lightpandaGate: {
      accepted: true,
      status: 'accepted',
      proofRelativePath: 'runs/provider-benchmarks/lightpanda-public.json'
    }
  }));

  assert.equal(route.selectedLane, 'direct-cdp-public');
  assert.equal(route.backend, 'direct-cdp-chrome');
  assert.equal(route.evidence.lightpandaGateAccepted, true);
});

test('browser route exposes search, analyze, scrape, and operate as first-class workflow tasks', async () => {
  const searchRoute = await buildBrowserRoute(baseFixtures({ task: 'search' }));
  assert.equal(searchRoute.task, 'search');
  assert.equal(searchRoute.selectedLane, 'public-search-direct-cdp');
  assert.equal(searchRoute.backend, 'direct-cdp-chrome');
  assert.equal(searchRoute.operatorInput, false);
  assert.match(searchRoute.commands.route.shell, /agent-workflow/);
  assert.match(searchRoute.commands.route.shell, /--task' 'search/);

  const analyzeRoute = await buildBrowserRoute(baseFixtures({ task: 'analyze' }));
  assert.equal(analyzeRoute.task, 'analyze');
  assert.equal(analyzeRoute.selectedLane, 'direct-cdp-page-analysis');
  assert.equal(analyzeRoute.backend, 'direct-cdp-chrome');
  assert.equal(analyzeRoute.profileMode, 'public-or-dedicated-target-profile');
  assert.match(analyzeRoute.commands.route.shell, /analyze-cdp/);
  assert.match(analyzeRoute.commands.route.shell, /<url>/);

  const scrapeRoute = await buildBrowserRoute(baseFixtures({ task: 'scrape' }));
  assert.equal(scrapeRoute.task, 'scrape');
  assert.equal(scrapeRoute.selectedLane, 'target-pack-direct-cdp');
  assert.equal(scrapeRoute.backend, 'direct-cdp-chrome');
  assert.equal(scrapeRoute.profileMode, 'dedicated-target-profile');
  assert.equal(scrapeRoute.captureBlocked, true);
  assert.equal(scrapeRoute.security.dedicatedTargetProfileForStoredAuth, true);

  const operateRoute = await buildBrowserRoute(baseFixtures({ task: 'operate' }));
  assert.equal(operateRoute.task, 'operate');
  assert.equal(operateRoute.selectedLane, 'target-pack-direct-cdp-operate');
  assert.equal(operateRoute.backend, 'direct-cdp-chrome');
  assert.equal(operateRoute.profileMode, 'dedicated-target-profile');
  assert.equal(operateRoute.startsCapture, false);
  assert.equal(operateRoute.userPermissionRequired, true);
  assert.match(formatBrowserRouteCompact(operateRoute), /^selected_lane: target-pack-direct-cdp-operate$/m);
});
