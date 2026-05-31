import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildChromeMcpHandoff, formatChromeMcpHandoffCompact, formatChromeMcpHandoffMarkdown } from '../src/chrome-mcp-handoff.mjs';

function route(overrides = {}) {
  return {
    task: 'existing-tab',
    selectedLane: 'regular-chrome-mcp',
    backend: 'chrome-devtools-mcp',
    profileMode: 'everyday-chrome-live-tabs',
    userPermissionRequired: false,
    canRunInBackground: true,
    evidence: {
      chromeMcpStatus: 'usable-for-operator-requested-tabs',
      chromeMcpUsableForEverydayTabs: true,
      chromeMcpObservedConnected: true,
      chromeMcpObservedTools: 29,
      chromeMcpObservedPageListOk: true,
      chromeMcpObservedPageCount: 4,
      chromeMcpListPagesTimedOut: false,
      chromeMcpLastError: '',
      proofGateStatus: 'waiting-for-login',
      proofGateTarget: 'github'
    },
    ...overrides
  };
}

test('chrome mcp handoff returns low-token tool calls for connected everyday Chrome tabs', async () => {
  const handoff = await buildChromeMcpHandoff({
    generatedAt: '2026-05-29T00:00:00.000Z',
    rootDir: '/tmp/sba',
    browserRoute: route()
  });

  assert.equal(handoff.safeMode, true);
  assert.equal(handoff.destructiveActionsIncluded, false);
  assert.equal(handoff.secretValuesRead, false);
  assert.equal(handoff.opensBrowserNow, false);
  assert.equal(handoff.ready, true);
  assert.equal(handoff.selectedLane, 'regular-chrome-mcp');
  assert.equal(handoff.nextAction, 'list-pages');
  assert.equal(handoff.nextToolCall.tool, 'mcp__peekaboo__.browser');
  assert.deepEqual(handoff.nextToolCall.args, { action: 'list_pages' });
  assert.equal(handoff.security.dedicatedTargetProfileForStoredAuth, true);
  assert.equal(handoff.security.pageOutputTrusted, false);
  assert.ok(handoff.toolCalls.some((call) => call.id === 'snapshot' && call.readsPageContent));
  assert.ok(handoff.toolCalls.some((call) => call.id === 'click' && call.requiresFreshSnapshot && call.mayMutatePage));
  assert.doesNotMatch(JSON.stringify(handoff), /cookie value|password store/i);

  const compact = formatChromeMcpHandoffCompact(handoff);
  assert.match(compact, /^ready: yes$/m);
  assert.match(compact, /^selected_lane: regular-chrome-mcp$/m);
  assert.match(compact, /^next_tool: mcp__peekaboo__\.browser$/m);
  assert.match(compact, /^next_tool_args: \{"action":"list_pages"\}$/m);
  assert.match(compact, /^tool_snapshot_args: \{"action":"snapshot"\}$/m);
  assert.match(compact, /^tool_click_args: \{"action":"click","uid":"<snapshot uid>"\}$/m);
  assert.match(compact, /^tool_click_requires_fresh_snapshot: yes$/m);
  assert.match(compact, /^tool_fill_requires_operator_task: yes$/m);
  assert.match(compact, /^chrome_mcp_observed_page_list_ok: yes$/m);
  assert.match(compact, /^chrome_mcp_observed_page_count: 4$/m);
  assert.match(compact, /^page_output_trusted: no$/m);

  const markdown = formatChromeMcpHandoffMarkdown(handoff);
  assert.match(markdown, /Chrome MCP Handoff/);
  assert.match(markdown, /"action": "list_pages"/);
});

test('chrome mcp handoff stays blocked until the MCP connection is observed', async () => {
  const handoff = await buildChromeMcpHandoff({
    browserRoute: route({
      selectedLane: 'regular-chrome-extension-handoff',
      backend: 'codex-chrome-extension',
      profileMode: 'everyday-chrome-selected-profile',
      userPermissionRequired: true,
      canRunInBackground: false,
      evidence: {
        chromeMcpStatus: 'mcp-process-present-unproved',
        chromeMcpUsableForEverydayTabs: false,
        chromeMcpObservedConnected: null,
        chromeMcpObservedTools: null,
        chromeMcpObservedPageListOk: null,
        chromeMcpObservedPageCount: null,
        chromeMcpListPagesTimedOut: false,
        chromeMcpLastError: ''
      }
    })
  });

  assert.equal(handoff.ready, false);
  assert.equal(handoff.nextAction, 'observe-chrome-mcp-status');
  assert.deepEqual(handoff.nextToolCall.args, { action: 'status' });
  assert.match(handoff.blockedReason, /not proved usable/);

  const compact = formatChromeMcpHandoffCompact(handoff);
  assert.match(compact, /^ready: no$/m);
  assert.match(compact, /^next_tool_args: \{"action":"status"\}$/m);
  assert.match(compact, /^blocked_reason: /m);
});

test('chrome mcp handoff blocks connected MCP when list_pages timed out', async () => {
  const handoff = await buildChromeMcpHandoff({
    browserRoute: route({
      selectedLane: 'regular-chrome-extension-handoff',
      backend: 'codex-chrome-extension',
      profileMode: 'everyday-chrome-selected-profile',
      userPermissionRequired: true,
      canRunInBackground: false,
      evidence: {
        chromeMcpStatus: 'mcp-connected-page-list-timeout',
        chromeMcpUsableForEverydayTabs: false,
        chromeMcpObservedConnected: true,
        chromeMcpObservedTools: 29,
        chromeMcpObservedPageListOk: false,
        chromeMcpObservedPageCount: null,
        chromeMcpListPagesTimedOut: true,
        chromeMcpLastError: 'Network.enable timed out'
      }
    })
  });

  assert.equal(handoff.ready, false);
  assert.equal(handoff.nextAction, 'repair-chrome-mcp-page-list-timeout');
  assert.deepEqual(handoff.nextToolCall.args, { action: 'status' });
  assert.match(handoff.blockedReason, /list_pages timed out/);

  const compact = formatChromeMcpHandoffCompact(handoff);
  assert.match(compact, /^chrome_mcp_observed_connected: yes$/m);
  assert.match(compact, /^chrome_mcp_observed_page_list_ok: no$/m);
  assert.match(compact, /^chrome_mcp_list_pages_timed_out: yes$/m);
  assert.match(compact, /^chrome_mcp_last_error: Network\.enable timed out$/m);
});

test('chrome mcp handoff can open a new background tab without listing existing tabs', async () => {
  const handoff = await buildChromeMcpHandoff({
    browserRoute: route({
      selectedLane: 'regular-chrome-extension-handoff',
      backend: 'codex-chrome-extension',
      profileMode: 'everyday-chrome-selected-profile',
      userPermissionRequired: true,
      canRunInBackground: false,
      evidence: {
        chromeMcpStatus: 'mcp-connected-page-list-timeout',
        chromeMcpUsableForEverydayTabs: false,
        chromeMcpObservedConnected: true,
        chromeMcpObservedTools: 29,
        chromeMcpObservedPageListOk: false,
        chromeMcpObservedPageCount: null,
        chromeMcpListPagesTimedOut: true,
        chromeMcpLastError: 'Network.enable timed out'
      }
    }),
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL'
  });

  assert.equal(handoff.ready, true);
  assert.equal(handoff.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(handoff.backend, 'chrome-devtools-mcp');
  assert.equal(handoff.profileMode, 'everyday-chrome-new-background-tab');
  assert.equal(handoff.nextAction, 'new-background-page');
  assert.equal(handoff.canRunInBackground, true);
  assert.equal(handoff.security.newBackgroundTabAllowed, true);
  assert.equal(handoff.security.newBackgroundUrlEnv, 'REGULAR_CHROME_URL');
  assert.equal(handoff.security.newBackgroundUrlValueRead, false);
  assert.equal(handoff.security.existingTabListRequiredForExistingTabWork, false);
  assert.equal(handoff.nextToolCall.id, 'new-background-page');
  assert.deepEqual(handoff.nextToolCall.args, {
    action: 'new_page',
    url: '<env:REGULAR_CHROME_URL>',
    background: true
  });
  assert.ok(handoff.toolCalls.some((call) => call.id === 'snapshot' && call.readsPageContent));
  assert.ok(handoff.toolCalls.every((call) => call.id !== 'list-pages'));

  const compact = formatChromeMcpHandoffCompact(handoff);
  assert.match(compact, /^ready: yes$/m);
  assert.match(compact, /^selected_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^next_action: new-background-page$/m);
  assert.match(compact, /^next_tool_args: \{"action":"new_page","url":"<env:REGULAR_CHROME_URL>","background":true\}$/m);
  assert.match(compact, /^tool_new_background_page_args: \{"action":"new_page","url":"<env:REGULAR_CHROME_URL>","background":true\}$/m);
  assert.match(compact, /^tool_snapshot_args: \{"action":"snapshot"\}$/m);
  assert.match(compact, /^tool_click_requires_fresh_snapshot: yes$/m);
  assert.match(compact, /^new_background_tab_allowed: yes$/m);
  assert.match(compact, /^new_background_url_env: REGULAR_CHROME_URL$/m);
  assert.match(compact, /^new_background_url_value_read: no$/m);

  const markdown = formatChromeMcpHandoffMarkdown(handoff);
  assert.match(markdown, /New background tab allowed: yes/);
  assert.match(markdown, /New background URL env: REGULAR_CHROME_URL/);
  assert.match(markdown, /"action": "new_page"/);
});

test('chrome mcp handoff prefers an explicitly requested new background tab over existing pages', async () => {
  const handoff = await buildChromeMcpHandoff({
    browserRoute: route(),
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL'
  });

  assert.equal(handoff.ready, true);
  assert.equal(handoff.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(handoff.profileMode, 'everyday-chrome-new-background-tab');
  assert.equal(handoff.nextAction, 'new-background-page');
  assert.equal(handoff.security.existingTabListRequiredForExistingTabWork, false);
  assert.equal(handoff.nextToolCall.id, 'new-background-page');
  assert.deepEqual(handoff.nextToolCall.args, {
    action: 'new_page',
    url: '<env:REGULAR_CHROME_URL>',
    background: true
  });
  assert.ok(handoff.toolCalls.every((call) => call.id !== 'list-pages'));

  const compact = formatChromeMcpHandoffCompact(handoff);
  assert.match(compact, /^selected_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^next_tool_args: \{"action":"new_page","url":"<env:REGULAR_CHROME_URL>","background":true\}$/m);
  assert.match(compact, /^new_background_tab_allowed: yes$/m);
});

test('chrome mcp handoff can hydrate from saved normalized observation without raw tab output', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-mcp-handoff-observation-'));
  try {
    const observationPath = path.join(rootDir, 'runs/operator/chrome-mcp-observation-latest.json');
    fs.mkdirSync(path.dirname(observationPath), { recursive: true });
    fs.writeFileSync(observationPath, `${JSON.stringify({
      generatedAt: '2026-05-30T00:00:00.000Z',
      source: 'peekaboo.browser.status+list_pages-normalized',
      observed: {
        connected: true,
        tools: 29,
        pageListOk: true,
        pageCount: 2,
        listPagesTimedOut: false,
        lastError: ''
      },
      decision: {
        status: 'ready-for-route',
        routeReady: true
      }
    })}\n`, 'utf8');

    const handoff = await buildChromeMcpHandoff({
      rootDir,
      mcpObservationIn: 'operator/chrome-mcp-observation-latest.json'
    });

    assert.equal(handoff.ready, true);
    assert.equal(handoff.selectedLane, 'regular-chrome-mcp');
    assert.equal(handoff.routeEvidence.chromeMcpObservedConnected, true);
    assert.equal(handoff.routeEvidence.chromeMcpObservedPageListOk, true);
    assert.equal(handoff.routeEvidence.chromeMcpObservedPageCount, 2);
    assert.equal(handoff.savedObservation.exists, true);
    assert.equal(handoff.savedObservation.parseOk, true);
    assert.equal(handoff.savedObservation.status, 'ready-for-route');
    assert.equal(handoff.security.browserStorageRead, false);

    const compact = formatChromeMcpHandoffCompact(handoff);
    assert.match(compact, /^ready: yes$/m);
    assert.match(compact, /^saved_observation_exists: yes$/m);
    assert.match(compact, /^saved_observation_parse_ok: yes$/m);
    assert.match(compact, /^saved_observation_status: ready-for-route$/m);
    assert.match(compact, /^tool_snapshot_args: \{"action":"snapshot"\}$/m);
    assert.doesNotMatch(compact, /https?:\/\//);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
