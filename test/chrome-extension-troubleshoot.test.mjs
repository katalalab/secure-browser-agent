import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromeExtensionTroubleshoot, formatChromeExtensionTroubleshootCompact, formatChromeExtensionTroubleshootMarkdown } from '../src/chrome-extension-troubleshoot.mjs';

function statusFixture(overrides = {}) {
  return {
    plugin: { available: true },
    chrome: { installed: true, running: true },
    extension: {
      selectedProfileDirectory: 'Default',
      installed: true,
      enabled: true
    },
    nativeHost: { correct: true },
    decision: {
      everydayChromeViaCodexExtensionPrepared: true,
      everydayChromeViaCodexExtensionBackendAvailable: false,
      everydayChromeViaCodexExtensionReady: false,
      everydayChromeViaCdpAllowed: false,
      dedicatedTargetProfileStillRequiredForStoredAuth: true
    },
    ...overrides
  };
}

function handoffFixture(overrides = {}) {
  return {
    canOpenSelectedProfileWindow: true,
    needsUserPermission: true,
    ...overrides
  };
}

test('chrome extension troubleshoot routes backend failure to gated profile-window retry', () => {
  const result = buildChromeExtensionTroubleshoot({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    backendAvailable: 'no',
    backendLastError: 'Browser is not available: extension',
    chromeExtensionStatus: statusFixture(),
    chromeExtensionHandoff: handoffFixture()
  });

  assert.equal(result.safeMode, true);
  assert.equal(result.destructiveActionsIncluded, false);
  assert.equal(result.secretValuesRead, false);
  assert.equal(result.opensBrowserNow, false);
  assert.equal(result.pageOutputTrusted, false);
  assert.equal(result.nextAction, 'open-selected-profile-window-after-operator-ok');
  assert.equal(result.userPermissionRequired, true);
  assert.equal(result.canOpenSelectedProfileWindow, true);
  assert.equal(result.cdpAllowed, false);
  assert.equal(result.dedicatedTargetProfileRequired, true);
  assert.match(result.commands.resumeApproval.shell, /--operator-ok' 'OK/);

  const compact = formatChromeExtensionTroubleshootCompact(result);
  assert.match(compact, /^backend_observed_available: no$/m);
  assert.match(compact, /^next_action: open-selected-profile-window-after-operator-ok$/m);
  assert.match(compact, /^user_permission_required: yes$/m);
  assert.match(compact, /^resume_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK'/m);
  assert.match(compact, /^backend_last_error: Browser is not available: extension$/m);

  const markdown = formatChromeExtensionTroubleshootMarkdown(result);
  assert.match(markdown, /Codex Chrome Extension Troubleshoot/);
  assert.match(markdown, /Backend observed available: no/);
});

test('chrome extension troubleshoot reports ready extension backend without opening Chrome', () => {
  const result = buildChromeExtensionTroubleshoot({
    rootDir: '/tmp/sba',
    backendAvailable: 'yes',
    chromeExtensionStatus: statusFixture({
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: true,
        everydayChromeViaCodexExtensionReady: true,
        everydayChromeViaCdpAllowed: false,
        dedicatedTargetProfileStillRequiredForStoredAuth: true
      }
    }),
    chromeExtensionHandoff: handoffFixture({ canOpenSelectedProfileWindow: false, needsUserPermission: false })
  });

  assert.equal(result.nextAction, 'claim-or-open-everyday-chrome-tab');
  assert.equal(result.ready, true);
  assert.equal(result.opensBrowserNow, false);
  assert.equal(result.userPermissionRequired, false);
  assert.match(formatChromeExtensionTroubleshootCompact(result), /^ready: yes$/m);
});

test('chrome extension troubleshoot recommends reinstall after profile-window retry still fails', () => {
  const result = buildChromeExtensionTroubleshoot({
    rootDir: '/tmp/sba',
    backendAvailable: 'no',
    backendLastError: 'Transport closed',
    profileWindowRetryAttempted: 'yes',
    chromeExtensionStatus: statusFixture(),
    chromeExtensionHandoff: handoffFixture()
  });

  assert.equal(result.nextAction, 'reinstall-codex-chrome-plugin-from-ui');
  assert.equal(result.profileWindowRetryAttempted, true);
  assert.equal(result.backendFailureAfterProfileWindowRetry, true);
  assert.equal(result.extensionReinstallRecommended, true);
  assert.equal(result.opensBrowserNow, false);
  assert.equal(result.cdpAllowed, false);

  const compact = formatChromeExtensionTroubleshootCompact(result);
  assert.match(compact, /^profile_window_retry_attempted: yes$/m);
  assert.match(compact, /^backend_failure_after_profile_window_retry: yes$/m);
  assert.match(compact, /^extension_reinstall_recommended: yes$/m);
  assert.match(compact, /^next_action: reinstall-codex-chrome-plugin-from-ui$/m);
});
