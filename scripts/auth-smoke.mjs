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
    const isAuthed = /\bauth=ok\b/.test(request.headers.cookie || '');
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (request.url === '/login') {
      response.end('<h1>Login</h1><button id="login" onclick="location.href=\'/set-auth\'">Login</button>');
      return;
    }
    if (request.url === '/set-auth') {
      response.statusCode = 302;
      response.setHeader('set-cookie', 'auth=ok; Path=/; Max-Age=3600; SameSite=Lax');
      response.setHeader('location', '/private');
      response.end();
      return;
    }
    if (request.url === '/private' && isAuthed) {
      response.end('<h1>Private Area</h1><p id="secret">saved-session</p>');
      return;
    }
    response.statusCode = 401;
    response.end('<h1>Login Required</h1>');
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
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`CLI failed: node src/cli.mjs ${args.join(' ')}\n${stdout}${stderr}`));
    });
  });
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-auth-smoke-'));
const fixture = await startServer();

try {
  const policy = path.join(tmpRoot, 'config/policy.json');
  const loginRecipe = path.join(tmpRoot, 'recipes/login.json');
  const privateRecipe = path.join(tmpRoot, 'recipes/private.json');
  writeJson(policy, {
    allowedOrigins: [fixture.origin],
    defaultProfile: 'auth-smoke',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: 'outputs',
    profileDir: 'profiles',
    redactKeys: ['authorization', 'cookie', 'set-cookie', 'token', 'password', 'secret'],
    maxEvalBytes: 12000
  });
  writeJson(loginRecipe, {
    url: `${fixture.origin}/login`,
    steps: [
      { type: 'click', selector: '#login' },
      { type: 'wait', ms: 300 },
      { type: 'outline', as: 'page' }
    ]
  });
  writeJson(privateRecipe, {
    url: `${fixture.origin}/private`,
    steps: [
      { type: 'extract', selector: '#secret', fields: ['text'], as: 'privateValue' }
    ]
  });

  const loginOut = await runCli(['run-cdp', loginRecipe, '--policy', policy, '--profile', 'auth-smoke', '--out', 'login.json', '--manifest']);
  const privateOut = await runCli(['run-cdp', privateRecipe, '--policy', policy, '--profile', 'auth-smoke', '--out', 'private.json', '--manifest']);
  const login = JSON.parse(fs.readFileSync(loginOut, 'utf8'));
  const privatePage = JSON.parse(fs.readFileSync(privateOut, 'utf8'));
  if (login.results.page.headings[0]?.text !== 'Private Area') throw new Error('login did not reach private page');
  if (privatePage.results.privateValue[0]?.text !== 'saved-session') throw new Error('private page did not reuse saved session');
  process.stdout.write(`${JSON.stringify({
    ok: true,
    origin: fixture.origin,
    loginOut,
    privateOut,
    profileDir: path.join(tmpRoot, 'profiles/auth-smoke')
  }, null, 2)}\n`);
} finally {
  await fixture.close();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    process.stderr.write(`cleanup warning: ${error.message}\n`);
  }
}
