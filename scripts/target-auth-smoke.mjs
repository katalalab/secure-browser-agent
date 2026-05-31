#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'src/cli.mjs');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function startServer() {
  const server = http.createServer((request, response) => {
    const isAuthed = /\bauth=target-ok\b/.test(request.headers.cookie || '');
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (request.url === '/login') {
      response.end('<main><h1>Target Login</h1><button id="login" onclick="location.href=\'/set-auth\'">Login</button></main>');
      return;
    }
    if (request.url === '/set-auth') {
      response.statusCode = 302;
      response.setHeader('set-cookie', 'auth=target-ok; Path=/; Max-Age=3600; SameSite=Lax');
      response.setHeader('location', '/private');
      response.end();
      return;
    }
    if (request.url === '/private' && isAuthed) {
      response.end(`<!doctype html>
<main>
  <h1>Private Dashboard</h1>
  <label>Search records<input name="q"></label>
  <ul>
    <li class="record"><a href="/detail/alpha">Alpha</a><span class="amount">100</span></li>
    <li class="record"><a href="/detail/beta">Beta</a><span class="amount">200</span></li>
  </ul>
</main>`);
      return;
    }
    response.statusCode = 401;
    response.end('<main><h1>Login Required</h1></main>');
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`CLI failed: node src/cli.mjs ${args.join(' ')}\n${stdout}${stderr}`));
    });
  });
}

function parseJsonOutput(output) {
  return JSON.parse(output);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-auth-smoke-'));
const fixture = await startServer();
const targetName = 'local-auth-target';
const targetDir = path.join(tmpRoot, 'runs/target-packs', targetName);

try {
  const policy = path.join(tmpRoot, 'config/policy.json');
  const loginRecipe = path.join(tmpRoot, 'recipes/login.json');
  writeJson(policy, {
    allowedOrigins: [fixture.origin],
    defaultProfile: 'target-auth-base',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: 'runs',
    profileDir: 'profiles',
    redactKeys: ['authorization', 'cookie', 'set-cookie', 'token', 'password', 'secret'],
    maxEvalBytes: 12000
  });

  const scaffold = parseJsonOutput(await runCli([
    'scaffold-target',
    targetName,
    '--policy',
    policy,
    '--origin',
    fixture.origin,
    '--login-url',
    `${fixture.origin}/login`,
    '--page-url',
    `${fixture.origin}/private`,
    '--permissions',
    'clipboard,downloads',
    '--force'
  ]));

  writeJson(loginRecipe, {
    url: `${fixture.origin}/login`,
    steps: [
      { type: 'click', selector: '#login' },
      { type: 'wait-for', selector: 'h1', text: 'Private Dashboard', timeoutMs: 3000, as: 'ready' },
      { type: 'outline', as: 'page' }
    ]
  });

  const packPolicy = scaffold.policy;
  await runCli(['run-cdp', loginRecipe, '--policy', packPolicy, '--profile', targetName, '--out', 'login.json', '--manifest']);
  const statusAfterLogin = parseJsonOutput(await runCli(['target-status', targetDir]));
  assert(statusAfterLogin.likelyAuthenticated, 'target profile did not persist auth artifacts');

  await runCli(['target-permissions', targetDir, 'apply']);
  const audit = parseJsonOutput(await runCli(['target-audit', targetDir]));
  assert(audit.ok, 'target audit did not pass after login and permissions');

  const daemonStart = parseJsonOutput(await runCli(['target-daemon', targetDir, 'start']));
  assert(daemonStart.ok && daemonStart.cdpReachable, 'target daemon did not start');

  const observeOut = await runCli(['target-run', targetDir, 'observe', '--daemon']);
  const scrapeOut = await runCli(['target-scrape', targetDir, '--daemon']);
  const benchmark = await runCli(['target-benchmark', targetDir, '--recipes', 'observe,inspect', '--iterations', '1', '--format', 'json']);

  const observe = JSON.parse(fs.readFileSync(observeOut, 'utf8'));
  const scrapeCsv = fs.readFileSync(scrapeOut, 'utf8');
  const benchmarkReport = parseJsonOutput(benchmark);
  assert(observe.results.page.headings.some((heading) => heading.text === 'Private Dashboard'), 'target observe did not see private page');
  assert(scrapeCsv.includes('Alpha') && scrapeCsv.includes('Beta'), 'target scrape did not extract private rows');
  assert(benchmarkReport.preflight.ok, 'target benchmark preflight did not pass');
  assert(benchmarkReport.results.some((item) => item.ok && item.mode === 'target-cdp-daemon'), 'target benchmark did not measure daemon mode');

  const daemonStop = parseJsonOutput(await runCli(['target-daemon', targetDir, 'stop']));
  assert(daemonStop.stopped, 'target daemon did not stop');

  process.stdout.write(`${JSON.stringify({
    ok: true,
    origin: fixture.origin,
    targetDir,
    profile: targetName,
    observeOut,
    scrapeOut,
    benchmarkFastest: [benchmarkReport.recommendation?.fastestMode, benchmarkReport.recommendation?.fastestRecipe].filter(Boolean).join('/'),
    daemonStopped: daemonStop.stopped
  }, null, 2)}\n`);
} finally {
  await runCli(['target-daemon', targetDir, 'stop']).catch(() => {});
  await fixture.close();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    process.stderr.write(`cleanup warning: ${error.message}\n`);
  }
}
