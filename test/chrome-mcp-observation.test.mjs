import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromeMcpObservation, buildChromeMcpObservationStatus, formatChromeMcpObservationCompact, formatChromeMcpObservationStatusCompact } from '../src/chrome-mcp-observation.mjs';

test('chrome mcp observation accepts normalized flags without raw page output', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-mcp-observation-'));
  try {
    const observation = buildChromeMcpObservation({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      observedConnected: 'yes',
      observedTools: 29,
      observedPageListOk: 'no',
      observedListPagesTimedOut: 'yes',
      observedLastError: 'Network.enable timed out',
      source: 'peekaboo.browser.status+list_pages-normalized',
      write: true
    });

    assert.equal(observation.secretValuesRead, false);
    assert.equal(observation.pageOutputTrusted, false);
    assert.equal(observation.observed.connected, true);
    assert.equal(observation.observed.tools, 29);
    assert.equal(observation.observed.pageListOk, false);
    assert.equal(observation.observed.listPagesTimedOut, true);
    assert.equal(observation.observed.lastError, 'Network.enable timed out');
    assert.equal(observation.decision.status, 'page-list-timeout');
    assert.equal(observation.decision.routeReady, false);
    assert.equal(observation.outputPath, path.join(rootDir, 'runs/operator/chrome-mcp-observation-latest.json'));

    const compact = formatChromeMcpObservationCompact(observation);
    assert.match(compact, /^status: page-list-timeout$/m);
    assert.match(compact, /^observed_connected: yes$/m);
    assert.match(compact, /^observed_page_list_ok: no$/m);
    assert.match(compact, /^observed_list_pages_timed_out: yes$/m);
    assert.match(compact, /^chrome_mcp_handoff_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-handoff'/m);
    assert.doesNotMatch(compact, /https?:\/\//);

    const status = buildChromeMcpObservationStatus({
      rootDir,
      generatedAt: '2026-05-30T00:00:01.000Z'
    });
    assert.equal(status.exists, true);
    assert.equal(status.parseOk, true);
    assert.equal(status.status, 'page-list-timeout');
    assert.equal(status.routeReady, false);
    assert.equal(status.observed.lastError, 'Network.enable timed out');
    assert.equal(status.agentSafeNextCommandId, 'none');
    assert.equal(status.agentSafeNextMayRunUnattended, false);
    assert.equal(status.agentSafeNextBlockedReason, 'no-refresh-needed');
    assert.equal(status.commands.status.shell, "'node' 'src/cli.mjs' 'chrome-mcp-observation-status' '--in' 'operator/chrome-mcp-observation-latest.json' '--format' 'compact'");
    assert.match(status.commands.recordStatusOnlyTemplate.shell, /chrome-mcp-observation/);
    assert.match(status.commands.recordStatusOnlyTemplate.shell, /observed-connected/);
    assert.match(status.commands.recordStatusOnlyTemplate.shell, /'--out' 'operator\/chrome-mcp-observation-latest\.json'/);
    assert.match(status.commands.recordTemplate.shell, /'--out' 'operator\/chrome-mcp-observation-latest\.json'/);
    assert.match(status.commands.chromeMcpHandoff.shell, /chrome-mcp-handoff/);
    assert.doesNotMatch(status.commands.recordStatusOnlyTemplate.shell, /list-pages-text/);

    const statusCompact = formatChromeMcpObservationStatusCompact(status);
    assert.match(statusCompact, /^agent_safe_next_command_id: none$/m);
    assert.match(statusCompact, /^agent_safe_next_may_run_unattended: no$/m);
    assert.match(statusCompact, /^agent_safe_next_blocked_reason: no-refresh-needed$/m);
    assert.match(statusCompact, /^status_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-observation-status' '--in' 'operator\/chrome-mcp-observation-latest\.json' '--format' 'compact'$/m);
    assert.match(statusCompact, /^record_status_only_template_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-observation'/m);
    assert.match(statusCompact, /^chrome_mcp_handoff_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-handoff'/m);
    assert.doesNotMatch(statusCompact, /https?:\/\//);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('chrome mcp observation status preserves custom path and blocks unattended live observation refresh', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-mcp-observation-status-'));
  try {
    const status = buildChromeMcpObservationStatus({
      rootDir,
      in: 'operator/custom-observation.json'
    });

    assert.equal(status.exists, false);
    assert.equal(status.status, 'missing');
    assert.equal(status.agentSafeNextCommandId, 'none');
    assert.equal(status.agentSafeNextMayRunUnattended, false);
    assert.equal(status.agentSafeNextOpensBrowser, false);
    assert.equal(status.agentSafeNextStartsCapture, false);
    assert.equal(status.agentSafeNextReadsBrowserStorage, false);
    assert.equal(status.agentSafeNextReturnsPageContent, false);
    assert.equal(status.agentSafeNextBlockedReason, 'live-chrome-mcp-observation-required');
    assert.equal(status.commands.status.shell, "'node' 'src/cli.mjs' 'chrome-mcp-observation-status' '--in' 'operator/custom-observation.json' '--format' 'compact'");
    assert.match(status.commands.recordTemplate.shell, /'--out' 'operator\/custom-observation\.json'/);
    assert.match(status.commands.recordStatusOnlyTemplate.shell, /'--out' 'operator\/custom-observation\.json'/);

    const compact = formatChromeMcpObservationStatusCompact(status);
    assert.match(compact, /^status: missing$/m);
    assert.match(compact, /^agent_safe_next_command_id: none$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: no$/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
    assert.match(compact, /^agent_safe_next_blocked_reason: live-chrome-mcp-observation-required$/m);
    assert.match(compact, /^status_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-observation-status' '--in' 'operator\/custom-observation\.json' '--format' 'compact'$/m);
    assert.match(compact, /^record_template_command: .*'--out' 'operator\/custom-observation\.json'/m);
    assert.match(compact, /^record_status_only_template_command: .*'--out' 'operator\/custom-observation\.json'/m);
    assert.match(compact, /^chrome_mcp_handoff_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-handoff' '--mcp-observation-in' 'operator\/custom-observation\.json' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
