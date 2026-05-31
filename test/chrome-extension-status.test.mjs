import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildChromeExtensionStatus, formatChromeExtensionStatusCompact } from '../src/chrome-extension-status.mjs';

function makePluginDir() {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-plugin-'));
  const scriptsDir = path.join(pluginDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  for (const script of [
    'browser-client.mjs',
    'chrome-is-running.js',
    'installed-browsers.js',
    'check-extension-installed.js',
    'check-native-host-manifest.js'
  ]) {
    fs.writeFileSync(path.join(scriptsDir, script), '', 'utf8');
  }
  return pluginDir;
}

test('chrome extension status falls back to running Chrome when installed browser helper times out', () => {
  const pluginDir = makePluginDir();
  try {
    const runner = (_node, args) => {
      const script = path.basename(args[0]);
      if (script === 'chrome-is-running.js') {
        return {
          status: 0,
          stdout: JSON.stringify({
            running: true,
            processes: [
              {
                pid: 32047,
                process_name: 'Google Chrome',
                command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
              },
              {
                pid: 32105,
                process_name: 'Google Chrome Helper',
                command: '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/148.0.7778.181/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper'
              }
            ]
          })
        };
      }
      if (script === 'installed-browsers.js') {
        return {
          status: null,
          stdout: '',
          stderr: 'timed out'
        };
      }
      if (script === 'check-extension-installed.js') {
        return {
          status: 0,
          stdout: JSON.stringify({
            installed: true,
            enabled: true,
            selectedProfileDirectory: 'Default',
            profiles: [{ selected: true, profileDirectory: 'Default', installed: true, enabled: true, versions: ['1.1.5_0'] }]
          })
        };
      }
      if (script === 'check-native-host-manifest.js') {
        return {
          status: 0,
          stdout: JSON.stringify({
            correct: true,
            exists: true,
            hasExpectedOrigin: true
          })
        };
      }
      return { status: 1, stdout: '', stderr: 'unexpected helper' };
    };

    const status = buildChromeExtensionStatus({
      pluginDir,
      runner
    });

    assert.equal(status.chrome.installed, true);
    assert.equal(status.chrome.running, true);
    assert.equal(status.chrome.path, '/Applications/Google Chrome.app');
    assert.equal(status.nextAction, 'verify-codex-chrome-extension-backend');

    const compact = formatChromeExtensionStatusCompact(status);
    assert.match(compact, /^chrome_installed: yes$/m);
    assert.match(compact, /^next_action: verify-codex-chrome-extension-backend$/m);
  } finally {
    fs.rmSync(pluginDir, { recursive: true, force: true });
  }
});

test('chrome extension status uses short configurable helper timeouts', () => {
  const pluginDir = makePluginDir();
  const calls = [];
  try {
    const runner = (command, args, options) => {
      calls.push({ command, script: path.basename(args[0] || ''), timeout: options.timeout });
      if (command === '/usr/bin/pgrep') return { status: 1, stdout: '', stderr: '' };
      return { status: null, stdout: '', stderr: 'timed out' };
    };

    const status = buildChromeExtensionStatus({
      pluginDir,
      runner,
      env: {
        SBA_CHROME_EXTENSION_HELPER_TIMEOUT_MS: '250',
        SBA_CHROME_EXTENSION_PGREP_TIMEOUT_MS: '125'
      }
    });

    assert.equal(status.helperTimeoutMs, 250);
    assert.equal(status.pgrepTimeoutMs, 125);
    assert.equal(status.decision.everydayChromeViaCodexExtensionReady, false);
    assert.equal(calls.filter((call) => call.command !== '/usr/bin/pgrep').length, 4);
    assert.equal(calls.find((call) => call.script === 'chrome-is-running.js')?.timeout, 250);
    assert.equal(calls.find((call) => call.command === '/usr/bin/pgrep')?.timeout, 125);
    const compact = formatChromeExtensionStatusCompact(status);
    assert.match(compact, /^helper_timeout_ms: 250$/m);
    assert.match(compact, /^pgrep_timeout_ms: 125$/m);
  } finally {
    fs.rmSync(pluginDir, { recursive: true, force: true });
  }
});
