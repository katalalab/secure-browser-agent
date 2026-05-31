import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromeExtensionClaimPlan, formatChromeExtensionClaimPlanCompact, formatChromeExtensionClaimPlanMarkdown } from '../src/chrome-extension-claim-plan.mjs';

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

test('chrome extension claim plan emits safe node_repl snippets only when backend is ready', () => {
  const plan = buildChromeExtensionClaimPlan({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    intent: 'operate',
    backendReady: 'yes',
    matchOrigin: 'https://github.com',
    matchPath: '/notifications',
    chromeExtensionStatus: statusFixture(true)
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.opensBrowserNow, false);
  assert.equal(plan.ready, true);
  assert.equal(plan.nextTool, 'mcp__node_repl__js');
  assert.equal(plan.directCdpDefaultProfileAllowed, false);
  assert.equal(plan.storedAuthenticatedScrapingAllowed, false);
  assert.equal(plan.dedicatedTargetProfileRequiredForStoredAuth, true);
  assert.equal(plan.readsBrowserStorage, false);
  assert.equal(plan.readsOpenTabMetadataWhenRun, true);
  assert.equal(plan.pageTitleReturnedWhenRun, false);
  assert.equal(plan.fullUrlReturnedWhenRun, false);
  assert.equal(plan.freshSnapshotRequiredForMutation, true);
  assert.ok(plan.allowedActions.includes('click'));
  assert.ok(plan.allowedActions.includes('title-length'));
  assert.ok(plan.allowedActions.includes('url-redacted'));
  assert.equal(plan.allowedActions.includes('title'), false);
  assert.equal(plan.allowedActions.includes('url'), false);
  assert.match(plan.snippets.openTabs, /browser\.user\.openTabs\(\)/);
  assert.match(plan.snippets.claimTab, /browser\.user\.claimTab\(sbaTabInfo\)/);
  assert.match(plan.snippets.claimTab, /https:\/\/github\.com/);
  assert.match(plan.snippets.claimTab, /\/notifications/);
  assert.match(plan.snippets.openTabs, /titleLength/);
  assert.match(plan.snippets.openTabs, /urlRedacted/);
  assert.doesNotMatch(plan.snippets.openTabs, /title: tab\.title/);
  assert.doesNotMatch(plan.snippets.openTabs, /url: tab\.url/);
  assert.doesNotMatch(plan.snippets.claimTab, /title: await tab\.title/);
  assert.doesNotMatch(plan.snippets.claimTab, /url: await tab\.url/);

  const compact = formatChromeExtensionClaimPlanCompact(plan);
  assert.match(compact, /^ready: yes$/m);
  assert.match(compact, /^next_tool: mcp__node_repl__js$/m);
  assert.match(compact, /^snippet_keys: openTabs,claimTab$/m);
  assert.match(compact, /^direct_cdp_default_profile_allowed: no$/m);
  assert.match(compact, /^stored_authenticated_scraping_allowed: no$/m);
  assert.match(compact, /^page_title_returned_when_run: no$/m);
  assert.match(compact, /^full_url_returned_when_run: no$/m);

  const markdown = formatChromeExtensionClaimPlanMarkdown(plan);
  assert.match(markdown, /Codex Chrome Extension Claim Plan/);
  assert.match(markdown, /browser\.user\.openTabs/);
});

test('chrome extension claim plan falls back to gated resume when backend is not ready', () => {
  const plan = buildChromeExtensionClaimPlan({
    rootDir: '/tmp/sba',
    backendReady: 'no',
    chromeExtensionStatus: statusFixture(false)
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.nextTool, 'none');
  assert.equal(plan.nextAction, 'run-chrome-extension-troubleshoot-or-resume');
  assert.deepEqual(plan.snippets, {});
  assert.match(plan.commands.resumeApproval.shell, /--operator-ok' 'OK/);

  const compact = formatChromeExtensionClaimPlanCompact(plan);
  assert.match(compact, /^ready: no$/m);
  assert.match(compact, /^snippet_keys: none$/m);
  assert.match(compact, /^resume_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK'/m);
});
