import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromeExtensionBackendCheckPlan, formatChromeExtensionBackendCheckPlanCompact, formatChromeExtensionBackendCheckPlanMarkdown } from '../src/chrome-extension-backend-check-plan.mjs';

function statusFixture(ready = false) {
  return {
    plugin: {
      dir: '/tmp/codex-chrome-plugin',
      available: true
    },
    extension: {
      selectedProfileDirectory: 'Default'
    },
    decision: {
      everydayChromeViaCodexExtensionPrepared: true,
      everydayChromeViaCodexExtensionBackendAvailable: ready,
      everydayChromeViaCodexExtensionReady: ready,
      everydayChromeViaCdpAllowed: false,
      dedicatedTargetProfileStillRequiredForStoredAuth: true
    },
    nextAction: ready ? 'claim-or-open-everyday-chrome-tab' : 'verify-codex-chrome-extension-backend'
  };
}

test('chrome extension backend check plan emits a safe node_repl probe without opening Chrome', () => {
  const plan = buildChromeExtensionBackendCheckPlan({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    chromeExtensionStatus: statusFixture(false)
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.opensBrowserNow, false);
  assert.equal(plan.startsCapture, false);
  assert.equal(plan.nextTool, 'mcp__node_repl__js');
  assert.equal(plan.nextAction, 'run-node-repl-backend-probe');
  assert.equal(plan.directCdpDefaultProfileAllowed, false);
  assert.equal(plan.storedAuthenticatedScrapingAllowed, false);
  assert.equal(plan.dedicatedTargetProfileRequiredForStoredAuth, true);
  assert.equal(plan.readsBrowserStorage, false);
  assert.equal(plan.readsOpenTabMetadataWhenRun, true);
  assert.equal(plan.probeUsesOpenTabsOnly, true);
  assert.match(plan.snippets.probe, /setupBrowserRuntime/);
  assert.match(plan.snippets.probe, /browser\.user\.openTabs\(\)/);
  assert.doesNotMatch(plan.snippets.probe, /cookies|localStorage|sessionStorage|password/i);

  const compact = formatChromeExtensionBackendCheckPlanCompact(plan);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture: no$/m);
  assert.match(compact, /^next_tool: mcp__node_repl__js$/m);
  assert.match(compact, /^snippet_keys: probe$/m);
  assert.match(compact, /^direct_cdp_default_profile_allowed: no$/m);
  assert.match(compact, /^stored_authenticated_scraping_allowed: no$/m);
  assert.match(compact, /^record_failure_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect' '--chrome-extension-prepared' 'yes' '--chrome-extension-backend-available' 'no'/m);
  assert.match(compact, /^record_success_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect' '--chrome-extension-prepared' 'yes' '--chrome-extension-backend-available' 'yes'/m);
  assert.equal(plan.commands.recordFailure.args.includes('--write'), true);
  assert.equal(plan.commands.recordSuccess.args.includes('--write'), true);
  assert.equal(plan.commands.recordFailure.args.includes('operator/regular-chrome-use-latest.json'), true);
  assert.equal(plan.commands.recordSuccess.args.includes('operator/regular-chrome-use-latest.json'), true);

  const markdown = formatChromeExtensionBackendCheckPlanMarkdown(plan);
  assert.match(markdown, /Codex Chrome Extension Backend Check Plan/);
  assert.match(markdown, /browser\.user\.openTabs/);
  assert.match(markdown, /regular-chrome-use/);
});

test('chrome extension backend check plan routes an observed ready backend to claim plan', () => {
  const plan = buildChromeExtensionBackendCheckPlan({
    rootDir: '/tmp/sba',
    backendAvailable: 'yes',
    chromeExtensionStatus: statusFixture(true)
  });

  assert.equal(plan.backendAvailable, true);
  assert.equal(plan.nextAction, 'build-claim-plan-for-user-tab');
  assert.equal(plan.nextTool, 'none');
  assert.deepEqual(plan.snippets, {});
  assert.match(plan.commands.claimPlanOnSuccess.shell, /chrome-extension-claim-plan/);
});
