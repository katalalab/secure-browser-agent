import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromeExtensionResume, formatChromeExtensionResumeCompact, formatChromeExtensionResumeMarkdown } from '../src/chrome-extension-resume.mjs';

function statusFixture(ready = false) {
  return {
    chrome: { running: true },
    decision: {
      everydayChromeViaCodexExtensionPrepared: true,
      everydayChromeViaCodexExtensionBackendAvailable: ready,
      everydayChromeViaCodexExtensionReady: ready
    }
  };
}

function handoffFixture() {
  return {
    ready: false,
    selectedProfile: 'Default',
    chromeRunning: true,
    extensionPrepared: true,
    backendAvailable: false,
    canOpenSelectedProfileWindow: true,
    commands: [
      {
        id: 'open-selected-profile-window',
        opensBrowser: true,
        runOnlyAfterUserSays: 'OK',
        command: {
          args: ['node', '/tmp/open-chrome-window.js'],
          shell: "'node' '/tmp/open-chrome-window.js'"
        }
      }
    ]
  };
}

test('chrome extension resume plans by default without opening Chrome', () => {
  const result = buildChromeExtensionResume({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    chromeExtensionStatus: statusFixture(false),
    chromeExtensionHandoff: handoffFixture()
  });

  assert.equal(result.requestedRun, false);
  assert.equal(result.operatorApproved, false);
  assert.equal(result.opensBrowserNow, false);
  assert.equal(result.action, 'plan-requires-operator-ok');
  assert.equal(result.secretValuesRead, false);
  assert.equal(result.commandRunOnlyAfterUserSays, 'OK');
  assert.match(formatChromeExtensionResumeCompact(result), /^operator_ok_required: yes$/m);
  assert.match(formatChromeExtensionResumeCompact(result), /^opens_browser_now: no$/m);
  assert.match(formatChromeExtensionResumeMarkdown(result), /Required Approval/);
});

test('chrome extension resume refuses run without exact OK', () => {
  const result = buildChromeExtensionResume({
    rootDir: '/tmp/sba',
    chromeExtensionStatus: statusFixture(false),
    chromeExtensionHandoff: handoffFixture(),
    run: true,
    operatorOk: 'yes'
  });

  assert.equal(result.requestedRun, true);
  assert.equal(result.operatorApproved, false);
  assert.equal(result.opensBrowserNow, false);
  assert.equal(result.action, 'refused-operator-ok-required');
});

test('chrome extension resume supports approved dry run without spawning Chrome', () => {
  const result = buildChromeExtensionResume({
    rootDir: '/tmp/sba',
    chromeExtensionStatus: statusFixture(false),
    chromeExtensionHandoff: handoffFixture(),
    run: true,
    operatorOk: 'OK',
    dryRun: true
  });

  assert.equal(result.operatorApproved, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.opensBrowserNow, false);
  assert.equal(result.action, 'dry-run-open-selected-profile-window');
});
