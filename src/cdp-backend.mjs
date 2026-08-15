import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildExtractScript, buildInspectScript, buildObserveScript, buildOutlineScript } from './extract-script.mjs';

const DEFAULT_CDP_LAUNCH_TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function cdpLaunchTimeoutMs(value) {
  return positiveInteger(value ?? process.env.SBA_CDP_LAUNCH_TIMEOUT_MS, DEFAULT_CDP_LAUNCH_TIMEOUT_MS);
}

function isCdpSocketClosedError(error) {
  return error instanceof Error && /CDP socket (?:closed|is not open)/.test(error.message);
}

function isLocalCdpRecipeUrl(url = '') {
  return !url || url === 'about:blank' || url.startsWith('data:');
}

function recipeCanRetryAfterTransientCdpClose(recipe = {}) {
  const urls = Array.isArray(recipe.urls) ? recipe.urls : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const candidates = [
    recipe.url || '',
    ...urls,
    ...steps.map((step) => step?.url || '')
  ].filter(Boolean);
  return candidates.length > 0 && candidates.every(isLocalCdpRecipeUrl);
}

export const __test = {
  isCdpSocketClosedError,
  recipeCanRetryAfterTransientCdpClose,
  waitForCdpVersion
};

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
    };
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

async function waitForExit(child, timeoutMs = 3000) {
  if (await waitForChildExit(child, timeoutMs)) return true;
  try {
    child.kill('SIGTERM');
  } catch {
    return true;
  }
  if (await waitForChildExit(child, 1000)) return true;
  try {
    child.kill('SIGKILL');
  } catch {
    return true;
  }
  return waitForChildExit(child, 1000);
}

async function waitForPidExit(pid, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!pidAlive(pid)) return true;
    await sleep(100);
  }
  return !pidAlive(pid);
}

function timeoutError(label, ms) {
  return new Error(`${label} timed out after ${ms}ms`);
}

function clip(value, maxLength = 500) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function safeArtifactPath(artifactDir, outPath) {
  if (!artifactDir) throw new Error('artifactDir is required for screenshot recipe output');
  if (!outPath) throw new Error('screenshot recipe step requires out');
  const safeName = String(outPath).replace(/^[/\\]+/, '');
  if (safeName.includes('..')) throw new Error(`invalid artifact path: ${outPath}`);
  return path.join(artifactDir, safeName);
}

function daemonMetadataPath(profileDir) {
  return path.join(profileDir, 'sba-cdp-daemon.json');
}

// Chrome lives in a different place on every OS, and the Chrome-for-Testing archive uses a
// different leaf layout per platform. Hardcoding the macOS paths made every CDP test fail on
// Windows and Linux while looking like a missing browser rather than a lookup bug.
function systemChromeCandidates() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ];
  }
  if (process.platform === 'win32') {
    return [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean)
      .map((root) => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ];
}

function testingChromeLeaf() {
  if (process.platform === 'darwin') {
    return path.join('chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
  }
  if (process.platform === 'win32') return path.join('chrome-win64', 'chrome.exe');
  return path.join('chrome-linux64', 'chrome');
}

function locateChromeForTesting() {
  if (process.env.SBA_CHROME_PATH) return process.env.SBA_CHROME_PATH;
  const systemCandidates = systemChromeCandidates();
  const preferAgentBrowser = process.env.SBA_PREFER_AGENT_BROWSER_CHROME === '1';
  if (!preferAgentBrowser) {
    const systemFound = systemCandidates.find((candidate) => fs.existsSync(candidate));
    if (systemFound) return systemFound;
  }
  const browserRoot = path.join(os.homedir(), '.agent-browser/browsers');
  if (fs.existsSync(browserRoot)) {
    const versions = fs.readdirSync(browserRoot)
      .filter((name) => name.startsWith('chrome-'))
      .sort()
      .reverse();
    // macOS archives were unpacked without the chrome-mac-* wrapper in older agent-browser
    // versions, so both layouts have to be probed before giving up on the cache.
    const leaves = [testingChromeLeaf()];
    if (process.platform === 'darwin') {
      leaves.push(path.join('Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
    }
    for (const version of versions) {
      for (const leaf of leaves) {
        const candidate = path.join(browserRoot, version, leaf);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  const fallback = systemCandidates.find((candidate) => fs.existsSync(candidate));
  return fallback || systemCandidates[0] || '';
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function readDaemonMetadata(profileDir) {
  const metadataPath = daemonMetadataPath(profileDir);
  if (!fs.existsSync(metadataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    return null;
  }
}

function httpJson(url, { method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`invalid JSON from ${url}: ${body.slice(0, 200)}`));
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.messageListenerAttached = false;
    this.socket = new WebSocket(url);
    this.socket.addEventListener('close', () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('CDP socket closed'));
      }
      this.pending.clear();
    });
  }

  async ready(timeoutMs = 5000) {
    if (this.socket.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(timeoutError('CDP socket open', timeoutMs));
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timer);
          this.socket.removeEventListener('open', onOpen);
          this.socket.removeEventListener('error', onError);
        };
        const onOpen = () => {
          cleanup();
          resolve();
        };
        const onError = (event) => {
          cleanup();
          reject(event.error || new Error('CDP socket error'));
        };
        this.socket.addEventListener('open', onOpen, { once: true });
        this.socket.addEventListener('error', onError, { once: true });
      });
    }
    if (!this.messageListenerAttached) {
      this.socket.addEventListener('message', (event) => this.onMessage(event));
      this.messageListenerAttached = true;
    }
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method && this.handlers.has(message.method)) {
      for (const handler of this.handlers.get(message.method)) handler(message.params || {});
    }
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  send(method, params = {}, timeoutMs = 10000) {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP socket is not open for ${method}`));
    }
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(timeoutError(`CDP ${method}`, timeoutMs));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close() {
    this.socket.close();
  }
}

function shellToken(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function chromePidsForProfile(profileDir) {
  const resolvedProfileDir = path.resolve(profileDir);
  const ps = spawnSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8',
    timeout: 3000
  });
  if (ps.status !== 0) return [];
  const userDataDirFlag = `--user-data-dir=${resolvedProfileDir}`;
  const quotedUserDataDirFlag = `--user-data-dir="${shellToken(resolvedProfileDir)}"`;
  const pids = [];
  for (const line of String(ps.stdout || '').split(/\r?\n/)) {
    if (!line.includes(userDataDirFlag) && !line.includes(quotedUserDataDirFlag)) continue;
    if (!line.includes('Google Chrome')) continue;
    const pid = Number(line.trim().match(/^(\d+)/)?.[1] || 0);
    if (pid && pidAlive(pid)) pids.push(pid);
  }
  return pids;
}

async function waitForNoChromeProfile(profileDir, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (chromePidsForProfile(profileDir).length === 0) return true;
    await sleep(100);
  }
  return chromePidsForProfile(profileDir).length === 0;
}

function signalChromeProfile(profileDir, signal) {
  for (const pid of chromePidsForProfile(profileDir)) {
    try {
      process.kill(pid, signal);
    } catch {
      // A profile process can exit between the ps snapshot and the signal.
    }
  }
}

function parseListeningPortForPid(pid) {
  const result = spawnSync('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN'], {
    encoding: 'utf8',
    timeout: 3000
  });
  if (result.status !== 0) return '';
  for (const line of String(result.stdout || '').split(/\r?\n/).slice(1)) {
    const match = line.match(/(?:127\.0\.0\.1|localhost):(\d+)\s+\(LISTEN\)/);
    if (match) return match[1];
  }
  return '';
}

async function waitForCdpVersion(port, timeoutMs) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      return await httpJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  const message = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`Chrome CDP endpoint did not become reachable after ${timeoutMs}ms${message}`);
}

async function findExistingCdpProfile(profileDir) {
  const resolvedProfileDir = path.resolve(profileDir);
  const ps = spawnSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8',
    timeout: 3000
  });
  if (ps.status !== 0) return null;
  const userDataDirFlag = `--user-data-dir=${resolvedProfileDir}`;
  const quotedUserDataDirFlag = `--user-data-dir="${shellToken(resolvedProfileDir)}"`;
  for (const line of String(ps.stdout || '').split(/\r?\n/)) {
    if (!line.includes(userDataDirFlag) && !line.includes(quotedUserDataDirFlag)) continue;
    if (!line.includes('Google Chrome')) continue;
    const pid = line.trim().match(/^(\d+)/)?.[1] || '';
    if (!pid || !pidAlive(pid)) continue;
    const port = parseListeningPortForPid(pid);
    if (!port) continue;
    try {
      await waitForCdpVersion(port, 1000);
      return { pid: Number(pid), port };
    } catch {
      continue;
    }
  }
  return null;
}

async function closeTransientChrome(chrome, profileDir, { gracefulMs = 3000, signalMs = 1000 } = {}) {
  const exited = await waitForExit(chrome, gracefulMs);
  if (exited && await waitForNoChromeProfile(profileDir, signalMs)) return true;

  signalChromeProfile(profileDir, 'SIGTERM');
  if (await waitForNoChromeProfile(profileDir, signalMs)) return true;

  signalChromeProfile(profileDir, 'SIGKILL');
  return waitForNoChromeProfile(profileDir, signalMs);
}

async function launchChrome(profileDir, {
  timeoutMs = cdpLaunchTimeoutMs(),
  headed = false,
  initialUrl = 'about:blank',
  detached = false,
  reuseExisting = false
} = {}) {
  timeoutMs = cdpLaunchTimeoutMs(timeoutMs);
  fs.mkdirSync(profileDir, { recursive: true });
  if (reuseExisting) {
    const existing = await findExistingCdpProfile(profileDir);
    if (existing) return { chrome: null, port: String(existing.port), chromePath: '', pid: existing.pid, reused: true };
  }
  fs.rmSync(path.join(profileDir, 'DevToolsActivePort'), { force: true });
  const chromePath = locateChromeForTesting();
  const args = [
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-features=Translate',
    '--password-store=basic',
    '--use-mock-keychain',
    `--user-data-dir=${profileDir}`,
    initialUrl
  ];
  if (!headed) args.unshift('--headless=new');
  const chrome = spawn(chromePath, args, { stdio: 'ignore', detached });

  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(portFile)) {
      const [port] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
      if (/^\d+$/.test(port || '')) {
        try {
          await waitForCdpVersion(port, Math.max(1000, timeoutMs - (Date.now() - started)));
          return { chrome, port, chromePath };
        } catch (error) {
          await closeTransientChrome(chrome, profileDir, { gracefulMs: 0 });
          throw error;
        }
      }
    }
    if (chrome.exitCode !== null) {
      if (reuseExisting) {
        const existing = await findExistingCdpProfile(profileDir);
        if (existing) return { chrome: null, port: String(existing.port), chromePath, pid: existing.pid, reused: true };
      }
      throw new Error(`Chrome exited early: ${chrome.exitCode}`);
    }
    await sleep(100);
  }
  await closeTransientChrome(chrome, profileDir, { gracefulMs: 0 });
  throw new Error(`Chrome CDP port did not become ready after ${timeoutMs}ms`);
}

async function openCdpPage(port) {
  const target = await httpJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.ready();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  return { client, target };
}

async function withTransientCdpPage(profileDir, callback, options = {}) {
  const { chrome, port } = await launchChrome(profileDir, {
    timeoutMs: options.launchTimeoutMs ?? options.cdpLaunchTimeoutMs
  });
  let client;
  try {
    ({ client } = await openCdpPage(port));
    return await callback(client);
  } finally {
    if (client) {
      try {
        await client.send('Browser.close');
      } catch {
        chrome.kill('SIGTERM');
      }
      client.close();
      await closeTransientChrome(chrome, profileDir);
    } else {
      chrome.kill('SIGTERM');
      await closeTransientChrome(chrome, profileDir);
    }
  }
}

async function withPersistentCdpPage(profileDir, callback, options = {}) {
  const daemon = await startCdpDaemon(profileDir, {
    headed: Boolean(options.headed),
    initialUrl: options.initialUrl || 'about:blank',
    timeoutMs: options.launchTimeoutMs ?? options.cdpLaunchTimeoutMs
  });
  let client;
  try {
    ({ client } = await openCdpPage(daemon.port));
    return await callback(client);
  } finally {
    if (client) {
      try {
        await client.send('Page.close', {}, 1000);
      } catch {
        // Closing the temporary target is best-effort; the daemon remains alive.
      }
      client.close();
    }
  }
}

async function withCdpPage(profileDir, callback, options = {}) {
  if (options.daemon) return withPersistentCdpPage(profileDir, callback, options);
  return withTransientCdpPage(profileDir, callback, options);
}

export async function cdpDaemonStatus(profileDir) {
  const metadataPath = daemonMetadataPath(profileDir);
  const metadata = readDaemonMetadata(profileDir);
  const status = {
    ok: false,
    profileDir,
    metadataPath,
    metadataExists: Boolean(metadata),
    pid: metadata?.pid || null,
    port: metadata?.port || null,
    headed: Boolean(metadata?.headed),
    startedAt: metadata?.startedAt || '',
    initialUrl: metadata?.initialUrl || '',
    chromePath: metadata?.chromePath || '',
    pidAlive: false,
    cdpReachable: false,
    version: null
  };
  status.pidAlive = pidAlive(status.pid);
  if (status.pidAlive && status.port) {
    try {
      const version = await httpJson(`http://127.0.0.1:${status.port}/json/version`);
      status.cdpReachable = true;
      status.version = {
        browser: version.Browser || '',
        protocolVersion: version['Protocol-Version'] || ''
      };
    } catch {
      status.cdpReachable = false;
    }
  }
  status.ok = status.pidAlive && status.cdpReachable;
  return status;
}

export async function startCdpDaemon(profileDir, {
  headed = false,
  initialUrl = 'about:blank',
  timeoutMs = cdpLaunchTimeoutMs()
} = {}) {
  timeoutMs = cdpLaunchTimeoutMs(timeoutMs);
  const current = await cdpDaemonStatus(profileDir);
  if (current.ok) {
    return {
      ...current,
      reused: true,
      started: false
    };
  }

  fs.mkdirSync(profileDir, { recursive: true });
  const { chrome, port, chromePath } = await launchChrome(profileDir, {
    headed,
    initialUrl,
    timeoutMs,
    detached: true
  });
  chrome.unref();
  const metadata = {
    pid: chrome.pid,
    port,
    profileDir,
    headed: Boolean(headed),
    initialUrl,
    chromePath,
    startedAt: new Date().toISOString()
  };
  fs.writeFileSync(daemonMetadataPath(profileDir), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  const status = await cdpDaemonStatus(profileDir);
  return {
    ...status,
    reused: false,
    started: true
  };
}

export async function stopCdpDaemon(profileDir, { timeoutMs = 5000 } = {}) {
  const status = await cdpDaemonStatus(profileDir);
  if (!status.metadataExists) return { ...status, stopped: false, reason: 'no daemon metadata' };

  let closeMethod = 'none';
  if (status.cdpReachable && status.port) {
    try {
      const version = await httpJson(`http://127.0.0.1:${status.port}/json/version`);
      if (version.webSocketDebuggerUrl) {
        const client = new CdpClient(version.webSocketDebuggerUrl);
        await client.ready();
        await client.send('Browser.close', {}, 1000);
        client.close();
        closeMethod = 'Browser.close';
      }
    } catch {
      closeMethod = 'cdp-close-failed';
    }
  }

  if (status.pidAlive && closeMethod !== 'Browser.close') {
    try {
      process.kill(Number(status.pid), 'SIGTERM');
      closeMethod = 'SIGTERM';
    } catch {
      closeMethod = 'signal-failed';
    }
  }

  let exited = status.pid ? await waitForPidExit(status.pid, timeoutMs) : true;
  if (!exited && status.pidAlive) {
    try {
      process.kill(Number(status.pid), 'SIGTERM');
      closeMethod = closeMethod === 'Browser.close' ? 'Browser.close+SIGTERM' : 'SIGTERM';
    } catch {
      closeMethod = 'signal-failed';
    }
    exited = await waitForPidExit(status.pid, timeoutMs);
  }
  if (!exited && pidAlive(status.pid)) {
    try {
      process.kill(Number(status.pid), 'SIGKILL');
      closeMethod = `${closeMethod}+SIGKILL`;
    } catch {
      closeMethod = 'sigkill-failed';
    }
    exited = await waitForPidExit(status.pid, timeoutMs);
  }
  if (exited) fs.rmSync(daemonMetadataPath(profileDir), { force: true });
  return {
    ...status,
    stopped: exited,
    closeMethod
  };
}

export async function openCdpProfile(url, profileDir, { headed = true, launchTimeoutMs, cdpLaunchTimeoutMs: optionLaunchTimeoutMs } = {}) {
  const { chrome, port, pid, reused = false } = await launchChrome(profileDir, {
    headed,
    initialUrl: url,
    detached: true,
    reuseExisting: true,
    timeoutMs: launchTimeoutMs ?? optionLaunchTimeoutMs
  });
  if (chrome) chrome.unref();
  return {
    ok: true,
    pid: pid || chrome?.pid || null,
    port,
    profileDir,
    url,
    headed,
    reused
  };
}

async function navigateOrSetContent(client, url) {
  if (url.startsWith('data:text/html,')) {
    const html = decodeURIComponent(url.slice('data:text/html,'.length));
    await client.send('Runtime.evaluate', {
      expression: `document.open();document.write(${JSON.stringify(html)});document.close();`,
      awaitPromise: true
    });
    return;
  }
  await client.send('Page.navigate', { url });
  await sleep(500);
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const message = details.exception?.description || details.exception?.value || details.text || 'CDP evaluation failed';
    throw new Error(message);
  }
  return result.result?.value;
}

function remoteObjectValue(arg, maxLength) {
  if (arg.value !== undefined) return clip(arg.value, maxLength);
  if (arg.unserializableValue !== undefined) return clip(arg.unserializableValue, maxLength);
  if (arg.description) return clip(arg.description, maxLength);
  return clip(arg.type || '', maxLength);
}

function createConsoleCollector(client, { limit = 100, maxArgLength = 300 } = {}) {
  const entries = [];
  const push = (entry) => {
    entries.push(entry);
    while (entries.length > limit) entries.shift();
  };

  client.on('Runtime.consoleAPICalled', (event) => {
    push({
      kind: 'console',
      level: event.type || 'log',
      text: (event.args || []).map((arg) => remoteObjectValue(arg, maxArgLength)).join(' '),
      args: (event.args || []).map((arg) => ({
        type: arg.type || '',
        value: remoteObjectValue(arg, maxArgLength)
      })),
      url: event.stackTrace?.callFrames?.[0]?.url || '',
      line: event.stackTrace?.callFrames?.[0]?.lineNumber ?? null
    });
  });

  client.on('Runtime.exceptionThrown', (event) => {
    const details = event.exceptionDetails || {};
    push({
      kind: 'exception',
      level: 'error',
      text: clip(details.exception?.description || details.text || 'exception', maxArgLength),
      url: details.url || '',
      line: details.lineNumber ?? null,
      column: details.columnNumber ?? null
    });
  });

  return {
    snapshot({ clear = false } = {}) {
      const logs = entries.slice();
      const levels = logs.reduce((acc, entry) => {
        acc[entry.level] = (acc[entry.level] || 0) + 1;
        return acc;
      }, {});
      const output = {
        entries: logs.length,
        levels,
        logs
      };
      if (clear) entries.length = 0;
      return output;
    }
  };
}

function createNetworkCollector(client) {
  const requests = new Map();
  client.on('Network.requestWillBeSent', (event) => {
    requests.set(event.requestId, {
      method: event.request?.method || '',
      url: event.request?.url || '',
      type: event.type || '',
      status: 0,
      mimeType: ''
    });
  });
  client.on('Network.responseReceived', (event) => {
    const row = requests.get(event.requestId) || {};
    row.status = event.response?.status || 0;
    row.mimeType = event.response?.mimeType || '';
    requests.set(event.requestId, row);
  });
  return {
    snapshot() {
      const resources = Array.from(requests.values()).map((request) => {
        let parsed;
        try {
          parsed = new URL(request.url);
        } catch {
          parsed = { host: '', pathname: request.url };
        }
        return {
          method: request.method,
          host: parsed.host,
          path: parsed.pathname,
          status: request.status,
          type: request.type,
          mimeType: request.mimeType
        };
      });
      return {
        entries: resources.length,
        hosts: resources.reduce((acc, row) => {
          acc[row.host] = (acc[row.host] || 0) + 1;
          return acc;
        }, {}),
        resources
      };
    }
  };
}

function extractionSuggestions(inspect = {}, { limit = 8 } = {}) {
  const suggestions = [];
  for (const candidate of inspect.candidates || []) {
    suggestions.push({
      kind: 'repeated',
      selector: candidate.selector,
      count: candidate.count,
      fields: candidate.sampleFields || ['text'],
      sampleRows: candidate.sampleRows || []
    });
  }
  for (const table of inspect.tables || []) {
    suggestions.push({
      kind: 'table',
      selector: table.selector || 'table',
      count: table.rows || 0,
      fields: ['text'],
      headers: table.headers || []
    });
  }
  if (inspect.links?.count) {
    suggestions.push({
      kind: 'links',
      selector: inspect.links.selector || 'a[href]',
      count: inspect.links.count,
      fields: inspect.links.sampleFields || ['text', 'href'],
      sampleRows: inspect.links.sampleRows || []
    });
  }
  return suggestions.slice(0, Number(limit || 8));
}

function pickExtractor(analysis, options = {}) {
  if (options.selector) {
    return {
      kind: 'manual',
      selector: options.selector,
      fields: Array.isArray(options.fields) ? options.fields : String(options.fields || 'text,href').split(',')
    };
  }
  const suggestions = analysis.suggestedExtractors || [];
  const index = Number(options.suggestion ?? options.suggestionIndex ?? 0);
  const suggestion = suggestions[index];
  if (!suggestion?.selector) {
    throw new Error('scrape-cdp could not find an extractor suggestion; pass --selector');
  }
  return {
    ...suggestion,
    suggestionIndex: index,
    fields: Array.isArray(options.fields) && options.fields.length > 0 ? options.fields : suggestion.fields || ['text']
  };
}

function buildActionScript({ action, selector, value = '' } = {}) {
  return `
(() => {
  const selector = ${JSON.stringify(selector)};
  const action = ${JSON.stringify(action)};
  const value = ${JSON.stringify(value)};
  const element = document.querySelector(selector);
  if (!element) return { ok: false, error: 'selector not found', selector, action };
  element.scrollIntoView({ block: 'center', inline: 'center' });
  if (action === 'fill') {
    element.focus();
    element.value = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, action, selector, valueLength: String(element.value || '').length };
  }
  if (action === 'click') {
    element.focus();
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
    return { ok: true, action, selector, text: element.innerText || element.textContent || '' };
  }
  return { ok: false, error: 'unsupported action', selector, action };
})()
`;
}

function buildWaitForScript({ selector = '', text = '', urlIncludes = '' } = {}) {
  return `
(() => {
  const selector = ${JSON.stringify(selector)};
  const text = ${JSON.stringify(text)};
  const urlIncludes = ${JSON.stringify(urlIncludes)};
  const bodyText = (document.body?.innerText || document.body?.textContent || '').replace(/\\s+/g, ' ');
  const selectorMatched = selector ? Boolean(document.querySelector(selector)) : true;
  const textMatched = text ? bodyText.includes(text) : true;
  const urlMatched = urlIncludes ? location.href.includes(urlIncludes) : true;
  return {
    matched: selectorMatched && textMatched && urlMatched,
    selectorMatched,
    textMatched,
    urlMatched,
    url: location.href,
    title: document.title
  };
})()
`;
}

async function waitForCondition(client, options = {}) {
  if (!options.selector && !options.text && !options.urlIncludes) {
    throw new Error('wait-for requires selector, text, or urlIncludes');
  }
  const timeoutMs = Number(options.timeoutMs || 5000);
  const pollMs = Number(options.pollMs || 100);
  const started = Date.now();
  let last = null;
  while (Date.now() - started <= timeoutMs) {
    last = await evaluate(client, buildWaitForScript(options));
    if (last.matched) {
      return {
        ok: true,
        selector: options.selector || '',
        text: options.text || '',
        urlIncludes: options.urlIncludes || '',
        elapsedMs: Date.now() - started,
        state: last
      };
    }
    await sleep(pollMs);
  }
  return {
    ok: false,
    selector: options.selector || '',
    text: options.text || '',
    urlIncludes: options.urlIncludes || '',
    elapsedMs: Date.now() - started,
    state: last
  };
}

export async function extractWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    await navigateOrSetContent(client, url);
    return evaluate(client, buildExtractScript(options));
  }, options);
}

export async function outlineWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    await navigateOrSetContent(client, url);
    return evaluate(client, buildOutlineScript(options));
  }, options);
}

export async function observeWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    await navigateOrSetContent(client, url);
    return evaluate(client, buildObserveScript(options));
  }, options);
}

export async function observeWithCdpPort(url, port, options = {}) {
  let client;
  try {
    ({ client } = await openCdpPage(port));
    await navigateOrSetContent(client, url);
    return await evaluate(client, buildObserveScript(options));
  } finally {
    if (client) {
      try {
        await client.send('Page.close', {}, 1000);
      } catch {
        // Closing the temporary target is best-effort; the login browser remains open.
      }
      client.close();
    }
  }
}

export async function inspectWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    await navigateOrSetContent(client, url);
    return evaluate(client, buildInspectScript(options));
  }, options);
}

export async function waitForWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    await navigateOrSetContent(client, url);
    const output = await waitForCondition(client, options);
    if (!output.ok) throw new Error(`wait-for timed out after ${output.elapsedMs}ms`);
    return output;
  }, options);
}

export async function consoleSummaryWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    const collector = createConsoleCollector(client, {
      limit: Number(options.limit || 100),
      maxArgLength: Number(options.maxArgLength || 300)
    });
    await navigateOrSetContent(client, url);
    await sleep(Number(options.waitMs || 300));
    return collector.snapshot();
  }, options);
}

export async function analyzeWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    const consoleCollector = createConsoleCollector(client, {
      limit: Number(options.consoleLimit || 100),
      maxArgLength: Number(options.maxConsoleArgLength || 300)
    });
    const networkCollector = createNetworkCollector(client);
    await navigateOrSetContent(client, url);
    await sleep(Number(options.waitMs || 300));
    const observe = await evaluate(client, buildObserveScript({
      linkLimit: Number(options.linkLimit || 25),
      controlLimit: Number(options.controlLimit || 40),
      textLimit: Number(options.textLimit || 600)
    }));
    const inspect = await evaluate(client, buildInspectScript({
      candidateLimit: Number(options.candidateLimit || 20),
      sampleLimit: Number(options.sampleLimit || 3)
    }));
    const console = consoleCollector.snapshot();
    const network = networkCollector.snapshot();
    return {
      ok: true,
      title: observe.title || inspect.title || '',
      url: observe.url || inspect.url || url,
      observe,
      inspect,
      console,
      network,
      suggestedExtractors: extractionSuggestions(inspect, { limit: Number(options.suggestionLimit || 8) })
    };
  }, options);
}

export async function scrapeWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    const consoleCollector = createConsoleCollector(client, {
      limit: Number(options.consoleLimit || 100),
      maxArgLength: Number(options.maxConsoleArgLength || 300)
    });
    const networkCollector = createNetworkCollector(client);
    await navigateOrSetContent(client, url);
    await sleep(Number(options.waitMs || 300));
    const observe = await evaluate(client, buildObserveScript({
      linkLimit: Number(options.linkLimit || 25),
      controlLimit: Number(options.controlLimit || 40),
      textLimit: Number(options.textLimit || 600)
    }));
    const inspect = await evaluate(client, buildInspectScript({
      candidateLimit: Number(options.candidateLimit || 20),
      sampleLimit: Number(options.sampleLimit || 3)
    }));
    const analysis = {
      ok: true,
      title: observe.title || inspect.title || '',
      url: observe.url || inspect.url || url,
      observe,
      inspect,
      console: consoleCollector.snapshot(),
      network: networkCollector.snapshot(),
      suggestedExtractors: extractionSuggestions(inspect, { limit: Number(options.suggestionLimit || 8) })
    };
    const extractor = pickExtractor(analysis, options);
    const fields = (extractor.fields || ['text']).map((field) => String(field).trim()).filter(Boolean);
    const rows = await evaluate(client, buildExtractScript({
      selector: extractor.selector,
      fields,
      limit: Number(options.limit || 50)
    }));
    return {
      ok: true,
      url: analysis.url,
      title: analysis.title,
      extractor: {
        kind: extractor.kind || 'suggested',
        suggestionIndex: extractor.suggestionIndex ?? null,
        selector: extractor.selector,
        fields,
        count: extractor.count ?? rows.length
      },
      rows,
      results: { rows },
      analysis
    };
  }, options);
}

async function captureScreenshotData(client, options = {}) {
  if (options.waitMs) await sleep(Number(options.waitMs));
  let clipParams = {};
  let width = 0;
  let height = 0;
  if (options.fullPage) {
    const metrics = await client.send('Page.getLayoutMetrics');
    const size = metrics.cssContentSize || metrics.contentSize || {};
    width = Math.ceil(size.width || 0);
    height = Math.ceil(size.height || 0);
    if (width > 0 && height > 0) {
      clipParams = {
        clip: {
          x: 0,
          y: 0,
          width,
          height,
          scale: 1
        },
        captureBeyondViewport: true
      };
    }
  }
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    ...clipParams
  });
  return {
    mimeType: 'image/png',
    format: 'png',
    fullPage: Boolean(options.fullPage),
    width,
    height,
    bytes: Buffer.byteLength(result.data || '', 'base64'),
    data: result.data || ''
  };
}

export async function screenshotWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    await navigateOrSetContent(client, url);
    return captureScreenshotData(client, options);
  }, options);
}

export async function actionWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    await navigateOrSetContent(client, url);
    const action = await evaluate(client, buildActionScript(options));
    await sleep(100);
    const outline = await evaluate(client, buildOutlineScript({ linkLimit: options.linkLimit || 100 }));
    return { action, outline };
  }, options);
}

function recipeFields(step) {
  if (Array.isArray(step.fields)) return step.fields;
  return String(step.fields || 'text,href').split(',').map((field) => field.trim()).filter(Boolean);
}

function recipeStepName(step, index) {
  return step.as || `step${index + 1}`;
}

function originForRuntimeUrl(rawUrl = '') {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('data:')) return 'data:';
  return new URL(rawUrl).origin;
}

function runtimeUrlAllowed(rawUrl = '', allowedOrigins = []) {
  if (!rawUrl || allowedOrigins.length === 0) return true;
  const origin = originForRuntimeUrl(rawUrl);
  if (allowedOrigins.includes(origin)) return true;
  return allowedOrigins.some((entry) => entry.startsWith('*.') && origin.endsWith(entry.slice(1)));
}

async function assertRuntimeUrlAllowed(client, allowedOrigins = [], label = 'step') {
  if (!allowedOrigins.length) return '';
  const state = await evaluate(client, '({ url: location.href, title: document.title })');
  if (!runtimeUrlAllowed(state.url, allowedOrigins)) {
    throw new Error(`${label} navigated outside target policy: ${state.url}`);
  }
  return state.url || '';
}

async function executeRecipeSteps(client, recipe, steps, options = {}, { currentUrl = '' } = {}) {
  const consoleCollector = createConsoleCollector(client, {
    limit: Number(recipe.consoleLimit || options.consoleLimit || 100),
    maxArgLength: Number(recipe.maxConsoleArgLength || options.maxConsoleArgLength || 300)
  });
  const stepResults = [];
  const results = {};
  let activeUrl = currentUrl;

  for (const [index, step] of steps.entries()) {
    const type = step.type || step.action;
    let output;

    if (step.url && type !== 'goto') {
      activeUrl = step.url;
      await navigateOrSetContent(client, activeUrl);
    }

    if (type === 'goto') {
      if (!step.url) throw new Error(`recipe step ${index + 1} goto requires url`);
      activeUrl = step.url;
      await navigateOrSetContent(client, activeUrl);
      output = { url: activeUrl };
    } else if (type === 'wait') {
      const ms = Number(step.ms || options.defaultWaitMs || 250);
      await sleep(ms);
      output = { ms };
    } else if (type === 'wait-for') {
      output = await waitForCondition(client, {
        selector: step.selector || '',
        text: step.text || '',
        urlIncludes: step.urlIncludes || step['url-includes'] || '',
        timeoutMs: Number(step.timeoutMs || step['timeout-ms'] || 5000),
        pollMs: Number(step.pollMs || step['poll-ms'] || 100)
      });
      if (!output.ok) throw new Error(`recipe step ${index + 1} wait-for timed out after ${output.elapsedMs}ms`);
    } else if (type === 'console') {
      if (step.waitMs || step['wait-ms']) await sleep(Number(step.waitMs || step['wait-ms']));
      output = consoleCollector.snapshot({ clear: Boolean(step.clear) });
    } else if (type === 'screenshot') {
      const screenshot = await captureScreenshotData(client, {
        fullPage: Boolean(step.fullPage || step['full-page']),
        waitMs: Number(step.waitMs || step['wait-ms'] || 0)
      });
      const artifact = safeArtifactPath(options.artifactDir, step.out || `${recipeStepName(step, index)}.png`);
      fs.mkdirSync(path.dirname(artifact), { recursive: true });
      fs.writeFileSync(artifact, Buffer.from(screenshot.data, 'base64'));
      output = {
        output: artifact,
        mimeType: screenshot.mimeType,
        format: screenshot.format,
        fullPage: screenshot.fullPage,
        width: screenshot.width,
        height: screenshot.height,
        bytes: screenshot.bytes
      };
      if (options.artifactManifest) {
        fs.writeFileSync(`${artifact}.manifest.json`, `${JSON.stringify({
          step: index + 1,
          as: recipeStepName(step, index),
          type,
          output: artifact,
          mimeType: screenshot.mimeType,
          format: screenshot.format,
          fullPage: screenshot.fullPage,
          width: screenshot.width,
          height: screenshot.height,
          bytes: screenshot.bytes,
          policy: options.artifactPolicy || '',
          createdAt: new Date().toISOString()
        }, null, 2)}\n`, 'utf8');
      }
    } else if (type === 'fill' || type === 'click') {
      if (!step.selector) throw new Error(`recipe step ${index + 1} ${type} requires selector`);
      const value = step.valueEnv
        ? process.env[step.valueEnv]
        : step.value || '';
      if (type === 'fill' && step.valueEnv && typeof value !== 'string') {
        throw new Error(`recipe step ${index + 1} fill valueEnv is not set: ${step.valueEnv}`);
      }
      output = await evaluate(client, buildActionScript({
        action: type,
        selector: step.selector,
        value
      }));
      await sleep(Number(step.afterMs || options.afterActionMs || 100));
      activeUrl = await assertRuntimeUrlAllowed(client, options.allowedOrigins || [], `recipe step ${index + 1}`);
    } else if (type === 'extract') {
      output = await evaluate(client, buildExtractScript({
        selector: step.selector || 'body',
        fields: recipeFields(step),
        limit: Number(step.limit || 50)
      }));
    } else if (type === 'outline') {
      output = await evaluate(client, buildOutlineScript({
        linkLimit: Number(step.linkLimit || 100)
      }));
    } else if (type === 'observe') {
      output = await evaluate(client, buildObserveScript({
        linkLimit: Number(step.linkLimit || 25),
        controlLimit: Number(step.controlLimit || 40),
        textLimit: Number(step.textLimit || 600)
      }));
    } else if (type === 'inspect') {
      output = await evaluate(client, buildInspectScript({
        candidateLimit: Number(step.candidateLimit || step['candidate-limit'] || 20),
        sampleLimit: Number(step.sampleLimit || step['sample-limit'] || 3)
      }));
    } else if (type === 'search-status') {
      const outline = step.from && results[step.from]
        ? results[step.from]
        : await evaluate(client, buildOutlineScript({
          linkLimit: Number(step.linkLimit || 50)
        }));
      output = searchStatusFromOutline({
        provider: step.provider || recipe.provider || 'duckduckgo',
        query: step.query || recipe.query || '',
        outline
      });
    } else {
      throw new Error(`unsupported recipe step ${index + 1}: ${type}`);
    }

    const as = recipeStepName(step, index);
    const entry = { index: index + 1, type, as, output };
    stepResults.push(entry);
    results[as] = output;
  }

  return { url: activeUrl || 'about:blank', steps: stepResults, results };
}

function searchStatusFromOutline({ provider = 'duckduckgo', query = '', outline = {} } = {}) {
  const haystack = `${outline.title || ''} ${outline.url || ''} ${JSON.stringify(outline.forms || [])}`.toLowerCase();
  const challenge = haystack.includes('captcha') || haystack.includes('sorry/index') || haystack.includes('anomaly.js') || haystack.includes('challenge');
  return {
    provider,
    query,
    challenge,
    resultLinks: (outline.links || []).filter((link) => link.text && link.href && !link.href.includes('/settings') && !link.href.includes('/html/')).length
  };
}

export async function runRecipeWithCdp(recipe, profileDir, options = {}) {
  if (!recipe || typeof recipe !== 'object') throw new Error('recipe must be a JSON object');
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const urls = Array.isArray(recipe.urls) ? recipe.urls : [];
  if (!recipe.url && urls.length === 0 && steps.every((step) => (step.type || step.action) !== 'goto')) {
    throw new Error('recipe requires a top-level url, urls array, or a goto step');
  }

  const runOnce = () => withCdpPage(profileDir, async (client) => {
    if (urls.length > 0) {
      const pages = [];
      for (const [index, url] of urls.entries()) {
        await navigateOrSetContent(client, url);
        const page = await executeRecipeSteps(client, recipe, steps, options, { currentUrl: url });
        pages.push({ index, inputUrl: url, ...page });
      }
      return {
        ok: true,
        url: pages.at(-1)?.url || 'about:blank',
        pages,
        results: { pages }
      };
    }

    let currentUrl = recipe.url || '';
    if (currentUrl) await navigateOrSetContent(client, currentUrl);
    const page = await executeRecipeSteps(client, recipe, steps, options, { currentUrl });
    return {
      ok: true,
      ...page
    };
  }, options);

  try {
    return await runOnce();
  } catch (error) {
    const retryCount = Number(options.cdpSocketCloseRetryCount ?? options['cdp-socket-close-retry-count'] ?? 1);
    if (retryCount <= 0 || options.daemon || !isCdpSocketClosedError(error) || !recipeCanRetryAfterTransientCdpClose(recipe)) {
      throw error;
    }
    return runOnce();
  }
}

export async function networkSummaryWithCdp(url, profileDir, options = {}) {
  return withCdpPage(profileDir, async (client) => {
    const networkCollector = createNetworkCollector(client);
    await navigateOrSetContent(client, url);
    await sleep(500);
    return networkCollector.snapshot();
  }, options);
}
