import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRegularChromeUse, formatRegularChromeUseCompact, formatRegularChromeUseMarkdown } from '../src/regular-chrome-use.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function toolCall(id, action, extra = {}) {
  return {
    id,
    tool: 'mcp__peekaboo__.browser',
    args: { action, ...extra },
    readsPageContent: ['snapshot', 'screenshot', 'console', 'network'].includes(id),
    mayMutatePage: ['click', 'fill'].includes(id),
    requiresFreshSnapshot: ['click', 'fill'].includes(id)
  };
}

function chromeMcpHandoff(overrides = {}) {
  return {
    ready: true,
    nextToolCall: toolCall('list-pages', 'list_pages'),
    toolCalls: [
      toolCall('status', 'status'),
      toolCall('list-pages', 'list_pages'),
      toolCall('select-page', 'select_page', { page_id: 0, bring_to_front: false }),
      toolCall('snapshot', 'snapshot'),
      toolCall('screenshot', 'screenshot', { full_page: false }),
      toolCall('console', 'console', { page_size: 50 }),
      toolCall('network', 'network', { page_size: 50 }),
      toolCall('click', 'click', { uid: '<snapshot uid>' }),
      toolCall('fill', 'fill', { uid: '<snapshot uid>', value: '<operator provided text>' })
    ],
    routeEvidence: {
      chromeMcpObservedConnected: true,
      chromeMcpObservedTools: 29,
      chromeMcpObservedPageListOk: true,
      chromeMcpObservedPageCount: 3,
      chromeMcpListPagesTimedOut: false,
      chromeMcpStatus: 'mcp-smoke'
    },
    blockedReason: '',
    ...overrides
  };
}

function extensionStatus(overrides = {}) {
  return {
    decision: {
      everydayChromeViaCodexExtensionPrepared: false,
      everydayChromeViaCodexExtensionBackendAvailable: false,
      everydayChromeViaCodexExtensionReady: false,
      reason: 'not prepared'
    },
    extension: {
      selectedProfileDirectory: 'Default',
      selectedProfileEnabled: false
    },
    nativeHost: {
      correct: false
    },
    nextAction: 'enable-codex-chrome-extension',
    ...overrides
  };
}

function extensionHandoff(overrides = {}) {
  return {
    commands: [
      {
        id: 'open-selected-profile-window',
        opensBrowser: true,
        runOnlyAfterUserSays: 'OK'
      }
    ],
    ...overrides
  };
}

test('regular chrome use selects Chrome MCP for proved everyday Chrome tabs', async () => {
  const plan = await buildRegularChromeUse({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    intent: 'operate',
    chromeMcpHandoff: chromeMcpHandoff(),
    chromeExtensionStatus: extensionStatus(),
    chromeExtensionHandoff: extensionHandoff()
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.opensBrowserNow, false);
  assert.equal(plan.ready, true);
  assert.equal(plan.selectedLane, 'regular-chrome-mcp');
  assert.equal(plan.backend, 'chrome-devtools-mcp');
  assert.equal(plan.canRunInBackground, true);
  assert.equal(plan.scope.existingTabsOnly, true);
  assert.equal(plan.scope.storedAuthenticatedScrapingAllowed, false);
  assert.equal(plan.scope.directCdpDefaultProfileAllowed, false);
  assert.equal(plan.security.pageOutputTrusted, false);
  assert.equal(plan.security.freshSnapshotRequiredForMutation, true);
  assert.deepEqual(plan.appleEventsStatusCommand.args, ['node', 'src/cli.mjs', 'chrome-apple-events-status', '--format', 'compact']);
  assert.ok(plan.chromeMcp.allowedToolCalls.some((call) => call.id === 'click' && call.requiresFreshSnapshot));
  assert.ok(plan.chromeMcp.allowedToolCalls.some((call) => call.id === 'fill' && call.requiresFreshSnapshot));

  const compact = formatRegularChromeUseCompact(plan);
  assert.match(compact, /^using_everyday_chrome: yes$/m);
  assert.match(compact, /^selected_lane: regular-chrome-mcp$/m);
  assert.match(compact, /^stored_authenticated_scraping_allowed: no$/m);
  assert.match(compact, /^direct_cdp_default_profile_allowed: no$/m);
  assert.match(compact, /^chrome_mcp_allowed_tool_ids: status,list-pages,select-page,snapshot,click,fill$/m);
  assert.match(compact, /^apple_events_status_command: 'node' 'src\/cli\.mjs' 'chrome-apple-events-status' '--format' 'compact'$/m);
  assert.match(compact, /^next_tool_args: \{"action":"list_pages"\}$/m);
  assert.match(compact, /^chrome_mcp_tool_snapshot_args: \{"action":"snapshot"\}$/m);
  assert.match(compact, /^chrome_mcp_tool_click_args: \{"action":"click","uid":"<snapshot uid>"\}$/m);
  assert.match(compact, /^chrome_mcp_tool_click_requires_fresh_snapshot: yes$/m);

  const markdown = formatRegularChromeUseMarkdown(plan);
  assert.match(markdown, /Regular Chrome Use/);
  assert.match(markdown, /Existing tabs only: yes/);
});

test('regular chrome use does not probe extension helpers when Chrome MCP is already proved', async () => {
  const plan = await buildRegularChromeUse({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    intent: 'inspect',
    chromeMcpHandoff: chromeMcpHandoff(),
    runner: () => {
      throw new Error('extension helper should not be called');
    }
  });

  assert.equal(plan.ready, true);
  assert.equal(plan.selectedLane, 'regular-chrome-mcp');
  assert.equal(plan.backend, 'chrome-devtools-mcp');
  assert.equal(plan.userPermissionRequired, false);
  assert.equal(plan.extension.prepared, false);
  assert.equal(plan.extension.ready, false);
});

test('regular chrome use falls back to gated extension resume when MCP is unproved', async () => {
  const plan = await buildRegularChromeUse({
    intent: 'inspect',
    chromeMcpHandoff: chromeMcpHandoff({
      ready: false,
      nextToolCall: toolCall('status', 'status'),
      toolCalls: [toolCall('status', 'status')],
      routeEvidence: {
        chromeMcpObservedConnected: null,
        chromeMcpObservedPageListOk: null,
        chromeMcpObservedPageCount: null,
        chromeMcpListPagesTimedOut: false
      },
      blockedReason: 'Everyday Chrome is not proved usable.'
    }),
    chromeExtensionStatus: extensionStatus({
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false,
        reason: 'prepared but backend unproved'
      },
      extension: {
        selectedProfileDirectory: 'Default',
        selectedProfileEnabled: true
      },
      nativeHost: {
        correct: true
      },
      nextAction: 'verify-codex-chrome-extension-backend'
    }),
    chromeExtensionHandoff: extensionHandoff()
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.selectedLane, 'regular-chrome-extension-resume');
  assert.equal(plan.backend, 'codex-chrome-extension');
  assert.equal(plan.userPermissionRequired, true);
  assert.equal(plan.runOnlyAfterUserSays, 'OK');
  assert.equal(plan.approvalCommand.args.includes('--operator-ok'), true);
  assert.equal(plan.scope.directCdpDefaultProfileAllowed, false);
  assert.equal(plan.security.secretInputAllowedFromPrompt, false);
  assert.match(plan.blockedReason, /operator OK/);

  const compact = formatRegularChromeUseCompact(plan);
  assert.match(compact, /^ready: no$/m);
  assert.match(compact, /^selected_lane: regular-chrome-extension-resume$/m);
  assert.match(compact, /^user_permission_required: yes$/m);
  assert.match(compact, /^approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume'/m);
});

test('regular chrome use can parse raw Chrome MCP timeout output', async () => {
  const plan = await buildRegularChromeUse({
    intent: 'inspect',
    statusText: `Chrome DevTools MCP Status

Connected: yes
Tools: 29`,
    listPagesText: 'Network.enable timed out. Increase the protocolTimeout setting in launch/connect calls for a higher timeout if needed.',
    chromeExtensionStatus: extensionStatus({
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false,
        reason: 'prepared but backend unproved'
      },
      extension: {
        selectedProfileDirectory: 'Default',
        selectedProfileEnabled: true
      },
      nativeHost: {
        correct: true
      }
    }),
    chromeExtensionHandoff: extensionHandoff()
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.chromeMcp.rawObservationStatus, 'page-list-timeout');
  assert.equal(plan.chromeMcp.rawObservationRouteReady, false);
  assert.equal(plan.chromeMcp.observedConnected, true);
  assert.equal(plan.chromeMcp.observedTools, 29);
  assert.equal(plan.chromeMcp.observedPageListOk, false);
  assert.equal(plan.chromeMcp.listPagesTimedOut, true);
  assert.match(plan.chromeMcp.lastError, /Network\.enable timed out/);
  assert.equal(plan.chromeMcp.source, 'mcp-connected-page-list-timeout');

  const compact = formatRegularChromeUseCompact(plan);
  assert.match(compact, /^chrome_mcp_raw_observation_status: page-list-timeout$/m);
  assert.match(compact, /^chrome_mcp_raw_observation_route_ready: no$/m);
  assert.match(compact, /^chrome_mcp_observed_connected: yes$/m);
  assert.match(compact, /^chrome_mcp_observed_tools: 29$/m);
  assert.match(compact, /^chrome_mcp_observed_page_list_ok: no$/m);
  assert.match(compact, /^chrome_mcp_observed_source: mcp-connected-page-list-timeout$/m);
  assert.match(compact, /^chrome_mcp_last_error: Network\.enable timed out/m);
});

test('regular chrome use can choose Chrome MCP new background tab when page listing times out', async () => {
  const plan = await buildRegularChromeUse({
    intent: 'inspect',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    statusText: `Chrome DevTools MCP Status

Connected: yes
Tools: 29`,
    listPagesText: 'Network.enable timed out. Increase the protocolTimeout setting in launch/connect calls for a higher timeout if needed.',
    chromeExtensionStatus: extensionStatus({
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false,
        reason: 'prepared but backend unproved'
      },
      extension: {
        selectedProfileDirectory: 'Default',
        selectedProfileEnabled: true
      },
      nativeHost: {
        correct: true
      }
    }),
    chromeExtensionHandoff: extensionHandoff()
  });

  assert.equal(plan.ready, true);
  assert.equal(plan.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(plan.backend, 'chrome-devtools-mcp');
  assert.equal(plan.nextAction, 'new-background-page');
  assert.equal(plan.userPermissionRequired, false);
  assert.equal(plan.canRunInBackground, true);
  assert.equal(plan.scope.existingTabsOnly, false);
  assert.equal(plan.scope.newBackgroundTabsAllowed, true);
  assert.equal(plan.scope.storedAuthenticatedScrapingAllowed, false);
  assert.equal(plan.chromeMcp.listPagesTimedOut, true);
  assert.equal(plan.chromeMcp.newBackgroundTabAllowed, true);
  assert.equal(plan.chromeMcp.newBackgroundUrlEnv, 'REGULAR_CHROME_URL');
  assert.equal(plan.chromeMcp.newBackgroundUrlValueRead, false);
  assert.deepEqual(plan.chromeMcp.nextToolCall.args, {
    action: 'new_page',
    url: '<env:REGULAR_CHROME_URL>',
    background: true
  });
  assert.ok(plan.chromeMcp.allowedToolCalls.some((call) => call.id === 'new-background-page'));
  assert.ok(plan.chromeMcp.allowedToolCalls.some((call) => call.id === 'snapshot'));
  assert.ok(plan.command.args.includes('--allow-new-background-tab'));
  assert.ok(plan.command.args.includes('--new-background-url-env'));

  const compact = formatRegularChromeUseCompact(plan);
  assert.match(compact, /^selected_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^new_background_tabs_allowed: yes$/m);
  assert.match(compact, /^chrome_mcp_new_background_tab_allowed: yes$/m);
  assert.match(compact, /^chrome_mcp_new_background_url_env: REGULAR_CHROME_URL$/m);
  assert.match(compact, /^chrome_mcp_new_background_url_value_read: no$/m);
  assert.match(compact, /^chrome_mcp_allowed_tool_ids: status,new-background-page,list-pages,select-page,snapshot$/m);
  assert.match(compact, /^next_tool_args: \{"action":"new_page","url":"<env:REGULAR_CHROME_URL>","background":true\}$/m);
  assert.match(compact, /^chrome_mcp_tool_new_background_page_args: \{"action":"new_page","url":"<env:REGULAR_CHROME_URL>","background":true\}$/m);
  assert.match(compact, /^chrome_mcp_tool_new_background_page_requires_operator_task: yes$/m);
  assert.match(compact, /^chrome_mcp_tool_snapshot_args: \{"action":"snapshot"\}$/m);

  const markdown = formatRegularChromeUseMarkdown(plan);
  assert.match(markdown, /New background tabs allowed: yes/);
});

test('regular chrome use prefers explicitly requested new background tab when Chrome MCP is already ready', async () => {
  const plan = await buildRegularChromeUse({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-31T00:00:00.000Z',
    intent: 'inspect',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    chromeMcpHandoff: chromeMcpHandoff({
      selectedLane: 'regular-chrome-mcp-new-background-tab',
      nextAction: 'new-background-page',
      nextToolCall: toolCall('new-background-page', 'new_page', {
        url: '<env:REGULAR_CHROME_URL>',
        background: true
      }),
      toolCalls: [
        toolCall('status', 'status'),
        toolCall('new-background-page', 'new_page', {
          url: '<env:REGULAR_CHROME_URL>',
          background: true
        }, { requiresOperatorTask: true }),
        toolCall('snapshot', 'snapshot')
      ],
      security: {
        newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
        newBackgroundUrlValueRead: false
      }
    }),
    chromeExtensionStatus: extensionStatus(),
    chromeExtensionHandoff: extensionHandoff()
  });

  assert.equal(plan.ready, true);
  assert.equal(plan.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(plan.nextAction, 'new-background-page');
  assert.equal(plan.scope.existingTabsOnly, false);
  assert.equal(plan.scope.newBackgroundTabsAllowed, true);
  assert.equal(plan.chromeMcp.newBackgroundTabAllowed, true);
  assert.deepEqual(plan.chromeMcp.nextToolCall.args, {
    action: 'new_page',
    url: '<env:REGULAR_CHROME_URL>',
    background: true
  });

  const compact = formatRegularChromeUseCompact(plan);
  assert.match(compact, /^selected_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^new_background_tabs_allowed: yes$/m);
  assert.match(compact, /^next_tool_args: \{"action":"new_page","url":"<env:REGULAR_CHROME_URL>","background":true\}$/m);
});

test('regular chrome use can hydrate Chrome MCP flags from saved normalized observation', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-regular-chrome-mcp-observation-'));
  try {
    const observationPath = path.join(rootDir, 'runs/operator/chrome-mcp-observation-latest.json');
    fs.mkdirSync(path.dirname(observationPath), { recursive: true });
    fs.writeFileSync(observationPath, `${JSON.stringify({
      safeMode: true,
      secretValuesRead: false,
      pageOutputTrusted: false,
      source: 'saved-mcp-test',
      observed: {
        connected: true,
        tools: 29,
        pageListOk: true,
        pageCount: 2,
        listPagesTimedOut: false,
        lastError: ''
      },
      decision: {
        routeReady: true,
        status: 'ready-for-route'
      }
    }, null, 2)}\n`, 'utf8');

    const plan = await buildRegularChromeUse({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      intent: 'inspect',
      mcpObservationIn: 'operator/chrome-mcp-observation-latest.json',
      chromeExtensionStatus: extensionStatus(),
      chromeExtensionHandoff: extensionHandoff()
    });

    assert.equal(plan.ready, true);
    assert.equal(plan.selectedLane, 'regular-chrome-mcp');
    assert.equal(plan.backend, 'chrome-devtools-mcp');
    assert.equal(plan.chromeMcp.savedObservationExists, true);
    assert.equal(plan.chromeMcp.savedObservationParseOk, true);
    assert.equal(plan.chromeMcp.savedObservationStatus, 'ready-for-route');
    assert.equal(plan.chromeMcp.savedObservationRouteReady, true);
    assert.equal(plan.chromeMcp.savedObservationSource, 'saved-mcp-test');
    assert.equal(plan.chromeMcp.observedConnected, true);
    assert.equal(plan.chromeMcp.observedTools, 29);
    assert.equal(plan.chromeMcp.observedPageListOk, true);
    assert.equal(plan.chromeMcp.observedPageCount, 2);
    assert.equal(plan.chromeMcp.source, 'usable-for-operator-requested-tabs');

    const compact = formatRegularChromeUseCompact(plan);
    assert.match(compact, /^chrome_mcp_saved_observation_exists: yes$/m);
    assert.match(compact, /^chrome_mcp_saved_observation_parse_ok: yes$/m);
    assert.match(compact, /^chrome_mcp_saved_observation_status: ready-for-route$/m);
    assert.match(compact, /^chrome_mcp_saved_observation_route_ready: yes$/m);
    assert.match(compact, /^chrome_mcp_saved_observation_source: saved-mcp-test$/m);
    assert.match(compact, /^chrome_mcp_observed_source: usable-for-operator-requested-tabs$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('regular chrome use preserves saved Chrome MCP timeout when CLI flags are empty strings', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-regular-chrome-mcp-timeout-observation-'));
  try {
    const observationPath = path.join(rootDir, 'runs/operator/chrome-mcp-observation-latest.json');
    fs.mkdirSync(path.dirname(observationPath), { recursive: true });
    fs.writeFileSync(observationPath, `${JSON.stringify({
      safeMode: true,
      secretValuesRead: false,
      pageOutputTrusted: false,
      source: 'saved-mcp-timeout-test',
      observed: {
        connected: true,
        tools: 29,
        pageListOk: false,
        pageCount: null,
        listPagesTimedOut: true,
        lastError: 'Request timed out after 30000ms'
      },
      decision: {
        routeReady: false,
        status: 'page-list-timeout'
      }
    }, null, 2)}\n`, 'utf8');

    const plan = await buildRegularChromeUse({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      intent: 'inspect',
      mcpObservationIn: 'operator/chrome-mcp-observation-latest.json',
      chromeMcpLastError: '',
      chromeMcpSource: '',
      chromeExtensionStatus: extensionStatus({
        decision: {
          everydayChromeViaCodexExtensionPrepared: true,
          everydayChromeViaCodexExtensionBackendAvailable: false,
          everydayChromeViaCodexExtensionReady: false,
          reason: 'prepared but backend unproved'
        },
        extension: {
          selectedProfileDirectory: 'Default',
          selectedProfileEnabled: true
        },
        nativeHost: {
          correct: true
        }
      }),
      chromeExtensionHandoff: extensionHandoff()
    });

    assert.equal(plan.ready, false);
    assert.equal(plan.chromeMcp.savedObservationStatus, 'page-list-timeout');
    assert.equal(plan.chromeMcp.listPagesTimedOut, true);
    assert.equal(plan.chromeMcp.lastError, 'Request timed out after 30000ms');
    assert.equal(plan.chromeMcp.source, 'mcp-connected-page-list-timeout');

    const compact = formatRegularChromeUseCompact(plan);
    assert.match(compact, /^chrome_mcp_list_pages_timed_out: yes$/m);
    assert.match(compact, /^chrome_mcp_observed_source: mcp-connected-page-list-timeout$/m);
    assert.match(compact, /^chrome_mcp_last_error: Request timed out after 30000ms$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('regular chrome use CLI emits JSON output', () => {
  const result = spawnSync(process.execPath, [
    'src/cli.mjs',
    'regular-chrome-use',
    '--intent',
    'inspect',
    '--status-text',
    'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29',
    '--list-pages-text',
    'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
    '--chrome-extension-prepared',
    'yes',
    '--chrome-extension-backend-available',
    'no',
    '--format',
    'json'
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30000
  });

  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.usingEverydayChrome, true);
  assert.equal(plan.chromeMcp.listPagesTimedOut, true);
  assert.equal(plan.selectedLane, 'regular-chrome-extension-resume');
});

test('regular chrome use accepts observed extension status for timeout fallback without helper probes', async () => {
  const plan = await buildRegularChromeUse({
    intent: 'inspect',
    statusText: `Chrome DevTools MCP Status

Connected: yes
Tools: 29`,
    listPagesText: 'Network.enable timed out.',
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'no',
    chromeExtensionHandoff: extensionHandoff(),
    runner: () => {
      throw new Error('extension helper should not be called');
    }
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.selectedLane, 'regular-chrome-extension-resume');
  assert.equal(plan.extension.prepared, true);
  assert.equal(plan.extension.backendAvailable, false);
  assert.equal(plan.userPermissionRequired, true);
});

test('regular chrome use keeps approval command when explicit extension observation lacks open command', async () => {
  const plan = await buildRegularChromeUse({
    intent: 'inspect',
    statusText: `Chrome DevTools MCP Status

Connected: yes
Tools: 29`,
    listPagesText: 'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'no',
    chromeExtensionBackendLastError: 'Transport closed',
    chromeExtensionHandoff: { commands: [] },
    runner: () => {
      throw new Error('extension helper should not be called');
    }
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.selectedLane, 'regular-chrome-extension-resume');
  assert.equal(plan.userPermissionRequired, true);
  assert.equal(plan.runOnlyAfterUserSays, 'OK');
  assert.deepEqual(plan.approvalCommand.args, [
    'node',
    'src/cli.mjs',
    'chrome-extension-resume',
    '--run',
    '--operator-ok',
    'OK',
    '--format',
    'compact'
  ]);

  const compact = formatRegularChromeUseCompact(plan);
  assert.match(compact, /^user_permission_required: yes$/m);
  assert.match(compact, /^approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
});

test('regular chrome use can write a durable operator observation under runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-regular-chrome-use-'));
  try {
    const plan = await buildRegularChromeUse({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      intent: 'inspect',
      statusText: `Chrome DevTools MCP Status

Connected: yes
Tools: 29`,
      listPagesText: 'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
      chromeExtensionPrepared: 'yes',
      chromeExtensionBackendAvailable: 'no',
      chromeExtensionBackendLastError: 'Transport closed',
      appleEventsActiveTabObserved: 'yes',
      appleEventsJavascriptAllowed: 'no',
      write: true
    });

    assert.equal(plan.outputPath, path.join(rootDir, 'runs/operator/regular-chrome-use-latest.json'));
    const saved = JSON.parse(fs.readFileSync(plan.outputPath, 'utf8'));
    assert.equal(saved.safeMode, true);
    assert.equal(saved.secretValuesRead, false);
    assert.equal(saved.opensBrowserNow, false);
    assert.equal(saved.chromeMcp.rawObservationStatus, 'page-list-timeout');
    assert.equal(saved.chromeMcp.observedConnected, true);
    assert.equal(saved.chromeMcp.observedTools, 29);
    assert.equal(saved.chromeMcp.observedPageListOk, false);
    assert.match(saved.chromeMcp.lastError, /Request timed out/);
    assert.equal(saved.chromeMcp.source, 'mcp-connected-page-list-timeout');
    assert.equal(saved.extension.backendLastError, 'Transport closed');
    assert.equal(saved.appleEvents.activeTabObserved, true);
    assert.equal(saved.appleEvents.javascriptAllowed, false);

    const compact = formatRegularChromeUseCompact(plan);
    assert.match(compact, new RegExp(`^output: ${plan.outputPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('regular chrome use can read a saved Apple Events status file', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-regular-chrome-use-apple-events-'));
  try {
    const statusPath = path.join(rootDir, 'runs/operator/chrome-apple-events-status-latest.json');
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    fs.writeFileSync(statusPath, `${JSON.stringify({
      activeTab: {
        observed: true,
        urlRedacted: 'https://example.com/private'
      },
      javascript: {
        allowed: false
      },
      nextAction: 'enable-javascript-from-apple-events-if-operator-approves'
    }, null, 2)}\n`, 'utf8');

    const plan = await buildRegularChromeUse({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      intent: 'inspect',
      appleEventsStatusFile: 'operator/chrome-apple-events-status-latest.json',
      chromeMcpHandoff: chromeMcpHandoff({
        ready: false,
        nextToolCall: toolCall('status', 'status'),
        toolCalls: [toolCall('status', 'status')],
        routeEvidence: {
          chromeMcpObservedConnected: null,
          chromeMcpObservedPageListOk: null,
          chromeMcpObservedPageCount: null,
          chromeMcpListPagesTimedOut: false
        }
      }),
      chromeExtensionStatus: extensionStatus({
        decision: {
          everydayChromeViaCodexExtensionPrepared: true,
          everydayChromeViaCodexExtensionBackendAvailable: false,
          everydayChromeViaCodexExtensionReady: false,
          reason: 'prepared but backend unproved'
        },
        extension: {
          selectedProfileDirectory: 'Default',
          selectedProfileEnabled: true
        },
        nativeHost: {
          correct: true
        }
      }),
      chromeExtensionHandoff: extensionHandoff()
    });

    assert.equal(plan.appleEvents.observed, true);
    assert.equal(plan.appleEvents.activeTabObserved, true);
    assert.equal(plan.appleEvents.javascriptAllowed, false);
    assert.equal(plan.appleEvents.source, 'apple-events-status-file');
    assert.equal(plan.appleEvents.statusPath, statusPath);
    assert.equal(plan.appleEvents.urlRedacted, 'https://example.com/private');

    const compact = formatRegularChromeUseCompact(plan);
    assert.match(compact, /^apple_events_source: apple-events-status-file$/m);
    assert.match(compact, /^apple_events_status_file: .*chrome-apple-events-status-latest\.json$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('regular chrome use rejects output paths outside runs', async () => {
  await assert.rejects(
    () => buildRegularChromeUse({
      rootDir: '/tmp/sba',
      chromeMcpHandoff: chromeMcpHandoff(),
      chromeExtensionStatus: extensionStatus(),
      chromeExtensionHandoff: extensionHandoff(),
      write: true,
      out: '../regular-chrome-use.json'
    }),
    /invalid regular Chrome use output path/
  );
});

test('regular chrome use rejects Apple Events status paths outside runs', async () => {
  await assert.rejects(
    () => buildRegularChromeUse({
      rootDir: '/tmp/sba',
      appleEventsStatusFile: '../chrome-apple-events-status.json',
      chromeMcpHandoff: chromeMcpHandoff(),
      chromeExtensionStatus: extensionStatus(),
      chromeExtensionHandoff: extensionHandoff()
    }),
    /invalid regular Chrome use input path/
  );
});

test('regular chrome use recommends plugin reinstall after extension retry failure', async () => {
  const plan = await buildRegularChromeUse({
    intent: 'inspect',
    statusText: `Chrome DevTools MCP Status

Connected: yes
Tools: 29`,
    listPagesText: 'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'no',
    chromeExtensionBackendLastError: 'Transport closed',
    chromeExtensionWindowRetryAttempted: 'yes',
    chromeExtensionHandoff: extensionHandoff(),
    runner: () => {
      throw new Error('extension helper should not be called');
    }
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.selectedLane, 'regular-chrome-extension-reinstall-required');
  assert.equal(plan.backend, 'codex-chrome-extension');
  assert.equal(plan.nextAction, 'reinstall-codex-chrome-plugin-from-ui');
  assert.equal(plan.userPermissionRequired, false);
  assert.equal(plan.approvalCommand, null);
  assert.equal(plan.extension.reinstallRecommended, true);
  assert.equal(plan.extension.profileWindowRetryAttempted, true);
  assert.equal(plan.extension.backendLastError, 'Transport closed');
  assert.deepEqual(plan.command.args, [
    'node',
    'src/cli.mjs',
    'chrome-extension-troubleshoot',
    '--backend-available',
    'no',
    '--backend-last-error',
    'Transport closed',
    '--profile-window-retry-attempted',
    'yes',
    '--format',
    'compact'
  ]);
  assert.match(plan.blockedReason, /reinstall the Chrome plugin/);

  const compact = formatRegularChromeUseCompact(plan);
  assert.match(compact, /^selected_lane: regular-chrome-extension-reinstall-required$/m);
  assert.match(compact, /^extension_profile_window_retry_attempted: yes$/m);
  assert.match(compact, /^extension_reinstall_recommended: yes$/m);
  assert.match(compact, /^extension_backend_last_error: Transport closed$/m);
});

test('regular chrome use lets explicit backend observations override a provided stale extension status', async () => {
  const plan = await buildRegularChromeUse({
    intent: 'inspect',
    statusText: `Chrome DevTools MCP Status

Connected: yes
Tools: 29`,
    listPagesText: 'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
    chromeExtensionStatus: extensionStatus({
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false,
        reason: 'prepared but backend unproved'
      },
      extension: {
        selectedProfileDirectory: 'Profile 1',
        selectedProfileEnabled: true
      },
      nativeHost: {
        correct: true
      },
      nextAction: 'verify-codex-chrome-extension-backend'
    }),
    chromeExtensionHandoff: extensionHandoff(),
    chromeExtensionBackendAvailable: 'no',
    chromeExtensionBackendLastError: 'Transport closed',
    chromeExtensionWindowRetryAttempted: 'yes'
  });

  assert.equal(plan.selectedLane, 'regular-chrome-extension-reinstall-required');
  assert.equal(plan.nextAction, 'reinstall-codex-chrome-plugin-from-ui');
  assert.equal(plan.extension.backendAvailable, false);
  assert.equal(plan.extension.reinstallRecommended, true);
  assert.equal(plan.extension.profileWindowRetryAttempted, true);
  assert.equal(plan.extension.backendLastError, 'Transport closed');
});

test('regular chrome use can surface Apple Events fallback state for existing tab inspection', async () => {
  const plan = await buildRegularChromeUse({
    intent: 'inspect',
    chromeMcpHandoff: chromeMcpHandoff({
      ready: false,
      nextToolCall: toolCall('status', 'status'),
      toolCalls: [toolCall('status', 'status')],
      routeEvidence: {
        chromeMcpObservedConnected: true,
        chromeMcpObservedPageListOk: false,
        chromeMcpObservedPageCount: null,
        chromeMcpListPagesTimedOut: true
      },
      blockedReason: 'Chrome MCP list_pages timed out.'
    }),
    chromeExtensionStatus: extensionStatus({
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false,
        reason: 'prepared but backend unproved'
      },
      extension: {
        selectedProfileDirectory: 'Default',
        selectedProfileEnabled: true
      },
      nativeHost: {
        correct: true
      }
    }),
    chromeExtensionHandoff: extensionHandoff(),
    appleEventsActiveTabObserved: 'yes',
    appleEventsJavascriptAllowed: 'yes'
  });

  assert.equal(plan.ready, true);
  assert.equal(plan.selectedLane, 'regular-chrome-apple-events-outline');
  assert.equal(plan.backend, 'chrome-apple-events');
  assert.equal(plan.nextAction, 'run-gated-apple-events-outline-if-operator-approves');
  assert.equal(plan.userPermissionRequired, true);
  assert.equal(plan.canRunInBackground, true);
  assert.deepEqual(plan.command.args, [
    'node',
    'src/cli.mjs',
    'chrome-apple-events-outline',
    '--format',
    'compact'
  ]);
  assert.equal(plan.appleEvents.observed, true);
  assert.equal(plan.appleEvents.activeTabObserved, true);
  assert.equal(plan.appleEvents.javascriptAllowed, true);
  assert.equal(plan.appleEvents.usableForInspect, true);
  assert.equal(plan.appleEvents.operatorApprovalRequiredForOutline, true);
  assert.deepEqual(plan.appleEventsOutlineApprovalCommand.args, [
    'node',
    'src/cli.mjs',
    'chrome-apple-events-outline',
    '--run',
    '--operator-ok',
    'OK',
    '--format',
    'compact'
  ]);

  const compact = formatRegularChromeUseCompact(plan);
  assert.match(compact, /^ready: yes$/m);
  assert.match(compact, /^selected_lane: regular-chrome-apple-events-outline$/m);
  assert.match(compact, /^backend: chrome-apple-events$/m);
  assert.match(compact, /^user_permission_required: yes$/m);
  assert.match(compact, /^can_run_in_background: yes$/m);
  assert.match(compact, /^apple_events_observed: yes$/m);
  assert.match(compact, /^apple_events_javascript_allowed: yes$/m);
  assert.match(compact, /^apple_events_usable_for_inspect: yes$/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'chrome-apple-events-outline' '--format' 'compact'$/m);
  assert.match(compact, /^apple_events_outline_approval_command: 'node' 'src\/cli\.mjs' 'chrome-apple-events-outline' '--run' '--operator-ok' 'OK'/m);
});
