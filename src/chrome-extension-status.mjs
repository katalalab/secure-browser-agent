import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HELPER_SCRIPTS = {
  chromeRunning: 'chrome-is-running.js',
  installedBrowsers: 'installed-browsers.js',
  extensionInstalled: 'check-extension-installed.js',
  nativeHost: 'check-native-host-manifest.js'
};
const DEFAULT_HELPER_TIMEOUT_MS = 300;
const DEFAULT_PGREP_TIMEOUT_MS = 150;

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function compareVersionPath(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

export function findCodexChromePluginDir(options = {}) {
  const env = options.env || process.env;
  if (env.SBA_CODEX_CHROME_PLUGIN_DIR) return path.resolve(env.SBA_CODEX_CHROME_PLUGIN_DIR);

  const chromeRoot = path.join(os.homedir(), '.codex/plugins/cache/openai-bundled/chrome');
  let versions = [];
  try {
    versions = fs.readdirSync(chromeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(chromeRoot, entry.name))
      .filter((candidate) => fs.existsSync(path.join(candidate, 'scripts/browser-client.mjs')));
  } catch {
    versions = [];
  }
  return versions.sort(compareVersionPath).at(-1) || '';
}

function scriptPath(pluginDir, scriptName) {
  return path.join(pluginDir, 'scripts', scriptName);
}

function numericOption(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function runJsonHelper(pluginDir, scriptName, runner = spawnSync, timeoutMs = DEFAULT_HELPER_TIMEOUT_MS) {
  const file = scriptPath(pluginDir, scriptName);
  if (!pluginDir || !fs.existsSync(file)) {
    return {
      ok: false,
      status: null,
      missing: true,
      stdout: '',
      stderr: '',
      json: null,
      error: `missing helper script: ${scriptName}`
    };
  }
  const result = runner(process.execPath, [file, '--json'], {
    cwd: pluginDir,
    encoding: 'utf8',
    timeout: numericOption(timeoutMs, DEFAULT_HELPER_TIMEOUT_MS)
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const json = readJsonSafeFromText(stdout);
  return {
    ok: result.status === 0 && Boolean(json),
    status: result.status,
    missing: false,
    stdout,
    stderr,
    json,
    error: result.error ? result.error.message : stderr.trim()
  };
}

function readJsonSafeFromText(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch {
    return null;
  }
}

function selectedProfile(extensionJson) {
  const selected = (extensionJson?.profiles || []).find((profile) => profile.selected);
  return selected || (extensionJson?.selectedProfileDirectory
    ? (extensionJson?.profiles || []).find((profile) => profile.profileDirectory === extensionJson.selectedProfileDirectory)
    : null);
}

function browserSchemeName(installedJson, scheme) {
  return installedJson?.default_browser?.schemes?.[scheme]?.name
    || installedJson?.default_browser?.schemes?.[scheme]?.bundle_id
    || '';
}

function chromeFromRunningProcesses(chromeRunning) {
  const processes = chromeRunning?.processes || [];
  const process = processes.find((item) => /Google Chrome(?: Helper)?/i.test(item.process_name || item.command || ''));
  const command = process?.command || '';
  const appPath = command.match(/(\/[^"]*?Google Chrome\.app)\b/)?.[1] || '';
  const version = command.match(/\/Versions\/([^/]+)\//)?.[1] || '';
  if (!appPath) return null;
  return {
    name: 'Google Chrome',
    bundle_id: 'com.google.Chrome',
    path: appPath,
    version
  };
}

function chromeFromApplications() {
  const appPath = '/Applications/Google Chrome.app';
  if (!fs.existsSync(appPath)) return null;
  return {
    name: 'Google Chrome',
    bundle_id: 'com.google.Chrome',
    path: appPath,
    version: ''
  };
}

function isChromeRunningFallback(runner = spawnSync, timeoutMs = DEFAULT_PGREP_TIMEOUT_MS) {
  try {
    const result = runner('/usr/bin/pgrep', ['-x', 'Google Chrome'], {
      encoding: 'utf8',
      timeout: numericOption(timeoutMs, DEFAULT_PGREP_TIMEOUT_MS)
    });
    return result.status === 0 && clean(result.stdout || '');
  } catch {
    return false;
  }
}

export function buildChromeExtensionStatus(options = {}) {
  const env = options.env || process.env;
  const pluginDir = options.pluginDir ? path.resolve(options.pluginDir) : findCodexChromePluginDir(options);
  const pluginAvailable = Boolean(pluginDir && fs.existsSync(path.join(pluginDir, 'scripts/browser-client.mjs')));
  const runner = options.runner || spawnSync;
  const helperTimeoutMs = numericOption(
    options.helperTimeoutMs ?? options['helper-timeout-ms'] ?? env.SBA_CHROME_EXTENSION_HELPER_TIMEOUT_MS,
    DEFAULT_HELPER_TIMEOUT_MS
  );
  const pgrepTimeoutMs = numericOption(
    options.pgrepTimeoutMs ?? options['pgrep-timeout-ms'] ?? env.SBA_CHROME_EXTENSION_PGREP_TIMEOUT_MS,
    DEFAULT_PGREP_TIMEOUT_MS
  );
  const helperResults = pluginAvailable
    ? Object.fromEntries(Object.entries(HELPER_SCRIPTS).map(([key, script]) => [key, runJsonHelper(pluginDir, script, runner, helperTimeoutMs)]))
    : {};
  const chromeRunning = helperResults.chromeRunning?.json || {};
  const installedBrowsers = helperResults.installedBrowsers?.json || {};
  const extension = helperResults.extensionInstalled?.json || {};
  const nativeHost = helperResults.nativeHost?.json || {};
  const selected = selectedProfile(extension);
  const runningFallback = !chromeRunning.running && isChromeRunningFallback(runner, pgrepTimeoutMs);
  const chromeRunningEffective = Boolean(chromeRunning.running || runningFallback);
  const installedChrome = (installedBrowsers.installed_browsers || []).find((browser) => browser.bundle_id === 'com.google.Chrome' || browser.name === 'Google Chrome')
    || chromeFromRunningProcesses(chromeRunning)
    || chromeFromApplications()
    || null;
  const extensionPrepared = Boolean(pluginAvailable && chromeRunningEffective && extension.installed && extension.enabled && nativeHost.correct);
  const backendProbe = {
    attemptedByCli: false,
    available: null,
    note: 'The extension backend handshake is performed by the Codex Chrome plugin runtime, not by this standalone CLI.',
    ...(options.backendProbe || {})
  };
  const extensionReady = extensionPrepared && backendProbe.available === true;
  const defaultHttp = browserSchemeName(installedBrowsers, 'http');
  const defaultHttps = browserSchemeName(installedBrowsers, 'https');
  const defaultBrowserIsChrome = [defaultHttp, defaultHttps].every((name) => /chrome/i.test(name));
  const nextAction = !pluginAvailable
    ? 'install-or-repair-codex-chrome-plugin'
    : !installedChrome
    ? 'install-google-chrome'
    : !chromeRunningEffective
    ? 'launch-google-chrome'
    : !extension.installed
    ? 'enable-codex-chrome-extension'
    : !extension.enabled
    ? 'enable-codex-chrome-extension'
    : !nativeHost.correct
    ? 'reinstall-codex-chrome-plugin'
    : backendProbe.available === true
    ? 'claim-or-open-everyday-chrome-tab'
    : 'verify-codex-chrome-extension-backend';

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    helperTimeoutMs,
    pgrepTimeoutMs,
    plugin: {
      dir: pluginDir || '',
      available: pluginAvailable
    },
    chrome: {
      installed: Boolean(installedChrome),
      path: installedChrome?.path || '',
      version: installedChrome?.version || '',
      running: chromeRunningEffective,
      processCount: chromeRunning.processes?.length || 0
    },
    defaultBrowser: {
      http: defaultHttp,
      https: defaultHttps,
      chrome: defaultBrowserIsChrome
    },
    extension: {
      id: extension.extensionId || '',
      selectedProfileDirectory: extension.selectedProfileDirectory || selected?.profileDirectory || '',
      installed: Boolean(extension.installed),
      enabled: Boolean(extension.enabled),
      selectedProfileInstalled: Boolean(selected?.installed),
      selectedProfileEnabled: Boolean(selected?.enabled),
      selectedProfileVersions: selected?.versions || [],
      installedProfileCount: (extension.profiles || []).filter((profile) => profile.installed).length,
      enabledProfileCount: (extension.profiles || []).filter((profile) => profile.enabled).length
    },
    nativeHost: {
      correct: Boolean(nativeHost.correct),
      exists: Boolean(nativeHost.exists),
      manifestPath: nativeHost.manifestPath || '',
      hasExpectedOrigin: Boolean(nativeHost.hasExpectedOrigin),
      problem: nativeHost.problem || ''
    },
    decision: {
      everydayChromeViaCodexExtensionPrepared: extensionPrepared,
      everydayChromeViaCodexExtensionBackendAvailable: backendProbe.available === true,
      everydayChromeViaCodexExtensionReady: extensionReady,
      everydayChromeViaCdpAllowed: false,
      dedicatedTargetProfileStillRequiredForStoredAuth: true,
      reason: extensionReady
        ? 'Everyday Chrome is reachable through the Codex Chrome Extension backend for operator-requested tab-level work; keep stored authenticated scraping in dedicated target profiles.'
        : extensionPrepared
        ? 'Everyday Chrome has the Codex Chrome Extension and Native Messaging Host prepared, but the extension backend has not been proved available in this agent session; do not treat the live Chrome profile as controllable yet.'
        : 'Everyday Chrome is not yet ready through the Codex Chrome Extension control lane; do not expose the default Chrome profile through CDP as a workaround.'
    },
    backendProbe,
    nextAction,
    helperStatus: Object.fromEntries(Object.entries(helperResults).map(([key, value]) => [key, {
      ok: value.ok,
      status: value.status,
      missing: value.missing,
      error: value.error || ''
    }]))
  };
}

export function formatChromeExtensionStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `helper_timeout_ms: ${status.helperTimeoutMs}`,
    `pgrep_timeout_ms: ${status.pgrepTimeoutMs}`,
    `plugin_available: ${yesNo(status.plugin.available)}`,
    `chrome_installed: ${yesNo(status.chrome.installed)}`,
    `chrome_running: ${yesNo(status.chrome.running)}`,
    `chrome_processes: ${status.chrome.processCount}`,
    `default_browser_http: ${clean(status.defaultBrowser.http || 'unknown')}`,
    `default_browser_https: ${clean(status.defaultBrowser.https || 'unknown')}`,
    `default_browser_chrome: ${yesNo(status.defaultBrowser.chrome)}`,
    `extension_installed: ${yesNo(status.extension.installed)}`,
    `extension_enabled: ${yesNo(status.extension.enabled)}`,
    `selected_profile: ${clean(status.extension.selectedProfileDirectory || 'unknown')}`,
    `selected_profile_extension_installed: ${yesNo(status.extension.selectedProfileInstalled)}`,
    `selected_profile_extension_enabled: ${yesNo(status.extension.selectedProfileEnabled)}`,
    `native_host_correct: ${yesNo(status.nativeHost.correct)}`,
    `everyday_chrome_extension_prepared: ${yesNo(status.decision.everydayChromeViaCodexExtensionPrepared)}`,
    `everyday_chrome_extension_backend_available: ${yesNo(status.decision.everydayChromeViaCodexExtensionBackendAvailable)}`,
    `everyday_chrome_extension_ready: ${yesNo(status.decision.everydayChromeViaCodexExtensionReady)}`,
    `everyday_chrome_cdp_allowed: ${yesNo(status.decision.everydayChromeViaCdpAllowed)}`,
    `dedicated_target_profile_required: ${yesNo(status.decision.dedicatedTargetProfileStillRequiredForStoredAuth)}`,
    `backend_probe_attempted_by_cli: ${yesNo(status.backendProbe.attemptedByCli)}`,
    `next_action: ${status.nextAction}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatChromeExtensionStatusMarkdown(status) {
  const lines = [
    '# Codex Chrome Extension Status',
    '',
    `Generated: ${status.generatedAt}`,
    `Safe mode: ${status.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${status.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${status.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Chrome',
    '',
    `- Installed: ${status.chrome.installed ? 'yes' : 'no'}`,
    `- Running: ${status.chrome.running ? 'yes' : 'no'}`,
    `- Processes: ${status.chrome.processCount}`,
    `- Version: ${status.chrome.version || 'unknown'}`,
    `- Default HTTP browser: ${status.defaultBrowser.http || 'unknown'}`,
    `- Default HTTPS browser: ${status.defaultBrowser.https || 'unknown'}`,
    '',
    '## Extension',
    '',
    `- Plugin dir available: ${status.plugin.available ? 'yes' : 'no'}`,
    `- Extension installed: ${status.extension.installed ? 'yes' : 'no'}`,
    `- Extension enabled: ${status.extension.enabled ? 'yes' : 'no'}`,
    `- Selected profile: ${status.extension.selectedProfileDirectory || 'unknown'}`,
    `- Selected profile extension enabled: ${status.extension.selectedProfileEnabled ? 'yes' : 'no'}`,
    `- Native host correct: ${status.nativeHost.correct ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Everyday Chrome via Codex Extension prepared: ${status.decision.everydayChromeViaCodexExtensionPrepared ? 'yes' : 'no'}`,
    `- Everyday Chrome via Codex Extension backend available: ${status.decision.everydayChromeViaCodexExtensionBackendAvailable ? 'yes' : 'no'}`,
    `- Everyday Chrome via Codex Extension ready: ${status.decision.everydayChromeViaCodexExtensionReady ? 'yes' : 'no'}`,
    `- Everyday Chrome via CDP allowed: ${status.decision.everydayChromeViaCdpAllowed ? 'yes' : 'no'}`,
    `- Dedicated target profile required for stored auth: ${status.decision.dedicatedTargetProfileStillRequiredForStoredAuth ? 'yes' : 'no'}`,
    `- Reason: ${status.decision.reason}`,
    `- Backend probe attempted by CLI: ${status.backendProbe.attemptedByCli ? 'yes' : 'no'}`,
    `- Backend note: ${status.backendProbe.note}`,
    `- Next action: ${status.nextAction}`,
    ''
  ];
  return lines.join('\n');
}
