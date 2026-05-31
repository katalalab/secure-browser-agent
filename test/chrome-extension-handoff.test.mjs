import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromeExtensionHandoff, formatChromeExtensionHandoffCompact, formatChromeExtensionHandoffMarkdown } from '../src/chrome-extension-handoff.mjs';

function statusFixture(pluginDir) {
  fs.mkdirSync(path.join(pluginDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'scripts/open-chrome-window.js'), '', 'utf8');
  return {
    plugin: {
      available: true,
      dir: pluginDir
    },
    chrome: {
      installed: true,
      running: true
    },
    extension: {
      installed: true,
      enabled: true,
      selectedProfileDirectory: 'Default'
    },
    nativeHost: {
      correct: true
    },
    decision: {
      everydayChromeViaCodexExtensionPrepared: true,
      everydayChromeViaCodexExtensionBackendAvailable: false,
      everydayChromeViaCodexExtensionReady: false,
      everydayChromeViaCdpAllowed: false,
      dedicatedTargetProfileStillRequiredForStoredAuth: true
    },
    nextAction: 'verify-codex-chrome-extension-backend'
  };
}

test('chrome extension handoff reports permission-gated open command without opening Chrome', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-handoff-'));
  try {
    const pluginDir = path.join(rootDir, 'plugin');
    const handoff = buildChromeExtensionHandoff({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      chromeExtensionStatus: statusFixture(pluginDir)
    });

    assert.equal(handoff.opensBrowserNow, false);
    assert.equal(handoff.needsUserPermission, true);
    assert.equal(handoff.canOpenSelectedProfileWindow, true);
    assert.equal(handoff.action, 'ask-user-ok-to-open-selected-profile-window-and-retry');
    assert.equal(handoff.selectedProfile, 'Default');
    assert.equal(handoff.secretValuesRead, false);
    const open = handoff.commands.find((item) => item.id === 'open-selected-profile-window');
    assert.equal(open.permissionRequired, true);
    assert.equal(open.opensBrowser, true);
    assert.match(open.command.shell, /open-chrome-window\.js/);
    const compact = formatChromeExtensionHandoffCompact(handoff);
    assert.match(compact, /^opens_browser_now: no$/m);
    assert.match(compact, /^user_permission_required: yes$/m);
    assert.match(compact, /^open_command: 'node' /m);
    assert.match(formatChromeExtensionHandoffMarkdown(handoff), /Codex Chrome Extension Handoff/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('chrome extension handoff writes only under runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-handoff-write-'));
  try {
    const pluginDir = path.join(rootDir, 'plugin');
    const handoff = buildChromeExtensionHandoff({
      rootDir,
      chromeExtensionStatus: statusFixture(pluginDir),
      write: true,
      out: 'operator/handoff.json'
    });
    assert.equal(handoff.outputPath, path.join(rootDir, 'runs/operator/handoff.json'));
    assert.equal(JSON.parse(fs.readFileSync(handoff.outputPath, 'utf8')).selectedProfile, 'Default');

    assert.throws(
      () => buildChromeExtensionHandoff({
        rootDir,
        chromeExtensionStatus: statusFixture(pluginDir),
        out: '../handoff.json'
      }),
      /invalid chrome extension handoff output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
