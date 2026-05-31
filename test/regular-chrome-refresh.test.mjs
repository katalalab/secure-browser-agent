import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRegularChromeRefresh,
  buildRegularChromeStatus,
  buildRegularChromeWatch,
  formatRegularChromeRefreshCompact,
  formatRegularChromeStatusCompact,
  formatRegularChromeWatchCompact
} from '../src/regular-chrome-refresh.mjs';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sba-regular-chrome-refresh-'));
}

function appleEventsStatus(rootDir) {
  return {
    outputPath: path.join(rootDir, 'runs/operator/chrome-apple-events-status-latest.json'),
    chrome: { reachable: true },
    activeTab: { observed: false, urlRedacted: '' },
    javascript: { allowed: false },
    nextAction: 'none'
  };
}

function writeReadyMcpObservation(rootDir, relativePath = 'operator/chrome-mcp-observation-latest.json') {
  const observationPath = path.join(rootDir, 'runs', relativePath);
  fs.mkdirSync(path.dirname(observationPath), { recursive: true });
  fs.writeFileSync(observationPath, `${JSON.stringify({
    safeMode: true,
    secretValuesRead: false,
    pageOutputTrusted: false,
    source: 'saved-refresh-mcp-test',
    observed: {
      connected: true,
      tools: 29,
      pageListOk: true,
      pageCount: 1,
      listPagesTimedOut: false,
      lastError: ''
    },
    decision: {
      routeReady: true,
      status: 'ready-for-route'
    }
  }, null, 2)}\n`, 'utf8');
  return relativePath;
}

test('regular chrome refresh preserves background tab opt-in for status and refresh commands', async () => {
  const rootDir = tempRoot();
  const refresh = await buildRegularChromeRefresh({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    intent: 'operate',
    chromeMcpConnected: 'yes',
    chromeMcpTools: 29,
    chromeMcpPageListOk: 'no',
    chromeMcpLastError: 'Request timed out after 30000ms',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'no',
    appleEventsStatus: appleEventsStatus(rootDir)
  });

  assert.equal(refresh.ready, true);
  assert.equal(refresh.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(refresh.scope.existingTabsOnly, false);
  assert.equal(refresh.scope.newBackgroundTabsAllowed, true);
  assert.deepEqual(refresh.commands.status.args, [
    'node', 'src/cli.mjs', 'regular-chrome-use',
    '--apple-events-status-file', 'operator/chrome-apple-events-status-latest.json',
    '--allow-new-background-tab', 'yes',
    '--new-background-url-env', 'REGULAR_CHROME_URL',
    '--format', 'compact'
  ]);
  assert.ok(refresh.commands.refresh.args.includes('--allow-new-background-tab'));
  assert.ok(refresh.commands.refresh.args.includes('--new-background-url-env'));

  const compact = formatRegularChromeRefreshCompact(refresh);
  assert.match(compact, /^selected_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^existing_tabs_only: no$/m);
  assert.match(compact, /^new_background_tabs_allowed: yes$/m);
  assert.match(compact, /--new-background-url-env' 'REGULAR_CHROME_URL/);
});

test('regular chrome refresh can reuse saved Chrome MCP observation without raw tab output', async () => {
  const rootDir = tempRoot();
  const mcpObservationIn = writeReadyMcpObservation(rootDir);

  const refresh = await buildRegularChromeRefresh({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    intent: 'inspect',
    mcpObservationIn,
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'no',
    appleEventsStatus: appleEventsStatus(rootDir)
  });

  assert.equal(refresh.ready, true);
  assert.equal(refresh.selectedLane, 'regular-chrome-mcp');
  assert.equal(refresh.backend, 'chrome-devtools-mcp');
  assert.deepEqual(refresh.commands.status.args, [
    'node', 'src/cli.mjs', 'regular-chrome-use',
    '--apple-events-status-file', 'operator/chrome-apple-events-status-latest.json',
    '--mcp-observation-in', 'operator/chrome-mcp-observation-latest.json',
    '--format', 'compact'
  ]);
  assert.deepEqual(refresh.commands.refresh.args, [
    'node', 'src/cli.mjs', 'regular-chrome-refresh',
    '--intent', 'inspect',
    '--mcp-observation-in', 'operator/chrome-mcp-observation-latest.json',
    '--format', 'compact'
  ]);

  const compact = formatRegularChromeRefreshCompact(refresh);
  assert.match(compact, /^selected_lane: regular-chrome-mcp$/m);
  assert.match(compact, /^backend: chrome-devtools-mcp$/m);
  assert.match(compact, /^status_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
});

test('regular chrome status and watch preserve background tab opt-in in low-token commands', async () => {
  const rootDir = tempRoot();
  const mcpObservationIn = writeReadyMcpObservation(rootDir);
  await buildRegularChromeRefresh({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    intent: 'operate',
    mcpObservationIn,
    chromeMcpConnected: 'yes',
    chromeMcpTools: 29,
    chromeMcpPageListOk: 'no',
    chromeMcpLastError: 'Request timed out after 30000ms',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'no',
    appleEventsStatus: appleEventsStatus(rootDir)
  });

  const status = buildRegularChromeStatus({
    rootDir,
    generatedAt: '2026-05-30T00:01:00.000Z',
    mcpObservationIn,
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL'
  });
  assert.equal(status.ready, true);
  assert.equal(status.scope.newBackgroundTabsAllowed, true);
  assert.equal(status.chromeMcp.newBackgroundTabAllowed, true);
  assert.equal(status.chromeMcp.newBackgroundUrlEnv, 'REGULAR_CHROME_URL');
  assert.equal(status.chromeMcp.newBackgroundUrlValueRead, false);
  assert.ok(status.commands.refresh.args.includes('--allow-new-background-tab'));
  assert.ok(status.commands.watch.args.includes('--new-background-url-env'));
  assert.match(status.commands.refresh.shell, /'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/);
  assert.match(status.commands.watch.shell, /'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/);
  assert.ok(status.commands.refresh.args.includes('--out'));
  assert.ok(status.commands.watch.args.includes('--in'));
  assert.equal(status.agentSafeNextCommandId, 'none');

  const statusCompact = formatRegularChromeStatusCompact(status);
  assert.match(statusCompact, /^new_background_tabs_allowed: yes$/m);
  assert.match(statusCompact, /^chrome_mcp_new_background_url_env: REGULAR_CHROME_URL$/m);
  assert.match(statusCompact, /^chrome_mcp_new_background_url_value_read: no$/m);
  assert.match(statusCompact, /^agent_safe_next_command_id: none$/m);

  const watch = await buildRegularChromeWatch({
    rootDir,
    generatedAt: '2026-05-30T00:01:00.000Z',
    mcpObservationIn,
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL'
  });
  const watchCompact = formatRegularChromeWatchCompact(watch);
  assert.match(watchCompact, /^command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'.*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
});

test('regular chrome status exposes watch refresh as safe next when saved decision is missing', () => {
  const rootDir = tempRoot();
  const status = buildRegularChromeStatus({
    rootDir,
    generatedAt: '2026-05-30T00:01:00.000Z',
    in: 'operator/missing-regular-chrome.json',
    appleEventsIn: 'operator/missing-apple-events.json',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL'
  });

  assert.equal(status.status, 'missing');
  assert.equal(status.exists, false);
  assert.equal(status.stale, true);
  assert.equal(status.agentSafeNextCommandId, 'regular-chrome-watch-refresh');
  assert.equal(status.agentSafeNextMayRunUnattended, true);
  assert.equal(status.agentSafeNextOpensBrowser, false);
  assert.equal(status.agentSafeNextStartsCapture, false);
  assert.equal(status.agentSafeNextReadsBrowserStorage, false);
  assert.equal(status.agentSafeNextReturnsPageContent, false);
  assert.deepEqual(status.agentSafeNextCommand.args, [
    'node', 'src/cli.mjs', 'regular-chrome-watch',
    '--run',
    '--in', 'operator/missing-regular-chrome.json',
    '--apple-events-in', 'operator/missing-apple-events.json',
    '--mcp-observation-in', 'operator/chrome-mcp-observation-latest.json',
    '--allow-new-background-tab', 'yes',
    '--new-background-url-env', 'REGULAR_CHROME_URL',
    '--format', 'compact'
  ]);
  assert.deepEqual(status.commands.refresh.args, [
    'node', 'src/cli.mjs', 'regular-chrome-refresh',
    '--out', 'operator/missing-regular-chrome.json',
    '--apple-events-out', 'operator/missing-apple-events.json',
    '--mcp-observation-in', 'operator/chrome-mcp-observation-latest.json',
    '--allow-new-background-tab', 'yes',
    '--new-background-url-env', 'REGULAR_CHROME_URL',
    '--format', 'compact'
  ]);

  const compact = formatRegularChromeStatusCompact(status);
  assert.match(compact, /^agent_safe_next_command_id: regular-chrome-watch-refresh$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'regular-chrome-watch' '--run' '--in' 'operator\/missing-regular-chrome\.json' '--apple-events-in' 'operator\/missing-apple-events\.json'.*'--new-background-url-env' 'REGULAR_CHROME_URL' '--format' 'compact'$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'regular-chrome-refresh' '--out' 'operator\/missing-regular-chrome\.json' '--apple-events-out' 'operator\/missing-apple-events\.json'.*'--new-background-url-env' 'REGULAR_CHROME_URL' '--format' 'compact'$/m);
});
