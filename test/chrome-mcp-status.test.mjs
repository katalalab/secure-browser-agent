import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromeMcpStatus, formatChromeMcpStatusCompact, formatChromeMcpStatusMarkdown } from '../src/chrome-mcp-status.mjs';

function runtimeAudit(overrides = {}) {
  return {
    processBreakdown: {
      peekaboo: {
        total: 2,
        parts: { server: 1 }
      },
      chromeDevtoolsMcp: {
        total: 4,
        parts: { server: 1, watchdog: 1 }
      }
    },
    groups: {
      chromeDevtoolsMcp: {
        items: [
          { command: 'npm exec chrome-devtools-mcp@latest --auto-connect --channel=stable --no-usage-statistics --no-performance-crux' },
          { command: 'npm exec chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9223' },
          { command: 'chrome-devtools-mcp' },
          { command: 'watchdog --parent-pid=1' }
        ]
      }
    },
    chromeApp: {
      regularProfiles: 1,
      regularProfileRemoteDebugging: 0,
      codexBrowserAgentProfiles: 1,
      targetPackProfiles: 1
    },
    chromeDevtools: {
      endpoint: {
        ok: true,
        browser: 'Chrome/148.0.7778.179'
      },
      diaEndpoint: {
        ok: false
      }
    },
    ...overrides
  };
}

function extensionStatus(overrides = {}) {
  return {
    decision: {
      everydayChromeViaCodexExtensionPrepared: true,
      everydayChromeViaCodexExtensionReady: false,
      ...overrides
    }
  };
}

test('chrome mcp status separates process presence from observed connection', () => {
  const status = buildChromeMcpStatus({
    generatedAt: '2026-05-29T00:00:00.000Z',
    runtimeAudit: runtimeAudit(),
    chromeExtensionStatus: extensionStatus()
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.destructiveActionsIncluded, false);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.observed.chromeDevtoolsMcpConnected, null);
  assert.equal(status.processes.chromeDevtoolsMcpAutoConnectWrappers, 1);
  assert.equal(status.processes.chromeDevtoolsMcpBrowserUrl9223Wrappers, 1);
  assert.equal(status.decision.status, 'mcp-process-present-unproved');
  assert.equal(status.decision.usableForEverydayChromeTabs, false);
  assert.equal(status.decision.dedicatedTargetProfileStillRequiredForStoredAuth, true);

  const compact = formatChromeMcpStatusCompact(status);
  assert.match(compact, /^observed_chrome_devtools_mcp_connected: unknown$/m);
  assert.match(compact, /^chrome_devtools_mcp_auto_connect_wrappers: 1$/m);
  assert.match(compact, /^usable_for_everyday_chrome_tabs: no$/m);
  assert.match(compact, /^secret_values_read: no$/m);
});

test('chrome mcp status does not treat connection alone as page control', () => {
  const status = buildChromeMcpStatus({
    runtimeAudit: runtimeAudit(),
    chromeExtensionStatus: extensionStatus(),
    observedConnected: 'yes',
    observedTools: 29,
    observedSource: 'peekaboo.browser.status'
  });

  assert.equal(status.observed.chromeDevtoolsMcpConnected, true);
  assert.equal(status.observed.chromeDevtoolsMcpTools, 29);
  assert.equal(status.observed.chromeDevtoolsMcpPageListOk, null);
  assert.equal(status.decision.status, 'mcp-connected-page-list-unproved');
  assert.equal(status.decision.chromeDevtoolsMcpUsableForEverydayTabs, false);
  assert.equal(status.decision.usableForEverydayChromeTabs, false);
  assert.equal(status.nextAction, 'observe-peekaboo-browser-list-pages-before-use');
});

test('chrome mcp status requires a successful list_pages observation for MCP routing', () => {
  const status = buildChromeMcpStatus({
    runtimeAudit: runtimeAudit(),
    chromeExtensionStatus: extensionStatus(),
    observedConnected: 'yes',
    observedTools: 29,
    observedPageListOk: 'yes',
    observedPageCount: 7,
    observedSource: 'peekaboo.browser.status+list_pages'
  });

  assert.equal(status.observed.chromeDevtoolsMcpConnected, true);
  assert.equal(status.observed.chromeDevtoolsMcpTools, 29);
  assert.equal(status.observed.chromeDevtoolsMcpPageListOk, true);
  assert.equal(status.observed.chromeDevtoolsMcpPageCount, 7);
  assert.equal(status.decision.status, 'usable-for-operator-requested-tabs');
  assert.equal(status.decision.chromeDevtoolsMcpUsableForEverydayTabs, true);
  assert.equal(status.decision.usableForEverydayChromeTabs, true);
  assert.equal(status.decision.dedicatedTargetProfileStillRequiredForStoredAuth, true);

  const compact = formatChromeMcpStatusCompact(status);
  assert.match(compact, /^observed_source: peekaboo\.browser\.status\+list_pages$/m);
  assert.match(compact, /^observed_chrome_devtools_mcp_connected: yes$/m);
  assert.match(compact, /^observed_chrome_devtools_mcp_tools: 29$/m);
  assert.match(compact, /^observed_chrome_devtools_mcp_page_list_ok: yes$/m);
  assert.match(compact, /^observed_chrome_devtools_mcp_page_count: 7$/m);
  assert.match(compact, /^chrome_devtools_mcp_usable_for_everyday_tabs: yes$/m);
  assert.match(compact, /^usable_for_everyday_chrome_tabs: yes$/m);

  const markdown = formatChromeMcpStatusMarkdown(status);
  assert.match(markdown, /Chrome MCP Status/);
  assert.match(markdown, /Usable for everyday Chrome tabs: yes/);
  assert.doesNotMatch(JSON.stringify(status), /cookie|password/i);
});

test('chrome mcp status classifies list_pages timeouts as not usable', () => {
  const status = buildChromeMcpStatus({
    runtimeAudit: runtimeAudit(),
    chromeExtensionStatus: extensionStatus(),
    observedConnected: 'yes',
    observedTools: 29,
    observedPageListOk: 'no',
    observedLastError: 'Network.enable timed out',
    observedSource: 'peekaboo.browser.list_pages'
  });

  assert.equal(status.decision.status, 'mcp-connected-page-list-timeout');
  assert.equal(status.decision.chromeDevtoolsMcpUsableForEverydayTabs, false);
  assert.equal(status.decision.usableForEverydayChromeTabs, false);
  assert.equal(status.observed.chromeDevtoolsMcpListPagesTimedOut, true);
  assert.equal(status.nextAction, 'repair-chrome-devtools-permission-or-reconnect-then-list-pages');

  const compact = formatChromeMcpStatusCompact(status);
  assert.match(compact, /^observed_chrome_devtools_mcp_page_list_ok: no$/m);
  assert.match(compact, /^observed_chrome_devtools_mcp_list_pages_timed_out: yes$/m);
  assert.match(compact, /^observed_chrome_devtools_mcp_last_error: Network\.enable timed out$/m);
});
