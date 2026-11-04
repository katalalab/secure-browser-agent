import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { sessionArgs } from '../src/agent-browser.mjs';
import { applyOwnedReap, planOwnedReap } from '../src/reap-owned.mjs';
import { handleMcpMessage } from '../src/mcp-server.mjs';
import { scaffoldTargetPack } from '../src/target-pack.mjs';
import { buildTargetWorkerPool } from '../src/target-worker-pool.mjs';
import { buildTargetLoginCapture } from '../src/target-login-capture.mjs';
import { __test as cdpTest, cdpDaemonStatus, openCdpProfile, startCdpDaemon, stopCdpDaemon } from '../src/cdp-backend.mjs';
import * as policyModule from '../src/policy.mjs';
const { profilePath } = policyModule;
const initializeProfile = (...args) => policyModule.initializeProfile(...args);
const profileSessionId = (...args) => policyModule.profileSessionId(...args);

function fixture() {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, 'sba-v2-'));
  const cleanup = () => {
    const resolved = fs.realpathSync(root);
    const relative = path.relative(base, resolved);
    assert.ok(relative.startsWith('sba-v2-') && !relative.includes(path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  };
  return { root, policy: { profileDir: path.join(root, 'profiles'), allowedOrigins: [] }, cleanup };
}

test('v2 creates a separate marked profile without modifying legacy data', () => {
  const f = fixture();
  try {
    const legacy = path.join(f.policy.profileDir, 'default');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'sentinel'), 'old');
    const planned = profilePath(f.policy, 'default');
    assert.equal(fs.existsSync(planned), false);
    assert.throws(() => initializeProfile(f.policy, 'default'), /legacy/);
    assert.equal(fs.existsSync(planned), false);
    assert.equal(initializeProfile({ ...f.policy, allowFreshV2Profile: true }, 'default'), planned);
    assert.equal(fs.readFileSync(path.join(legacy, 'sentinel'), 'utf8'), 'old');
    assert.equal(profilePath(f.policy, 'default'), planned);
  } finally { f.cleanup(); }
});

test('ambiguous, noncanonical and Windows reserved names are rejected', () => {
  const f = fixture();
  try {
    for (const name of ['a/b', 'a?b', 'Case', 'case.', 'con', 'nul.txt', 'com1', '.', '..']) {
      assert.throws(() => profilePath(f.policy, name), /invalid profile name/);
    }
    assert.doesNotThrow(() => profilePath(f.policy, 'target.example'));
  } finally { f.cleanup(); }
});

test('an existing unmarked v2 profile is never adopted', () => {
  const f = fixture();
  try {
    const p = initializeProfile(f.policy, 'other');
    const unmarked = path.join(path.dirname(p), 'default');
    fs.mkdirSync(unmarked);
    fs.writeFileSync(path.join(unmarked, 'sentinel'), 'not ours');
    assert.throws(() => initializeProfile(f.policy, 'default'), /unowned|marker/);
    assert.equal(fs.readFileSync(path.join(unmarked, 'sentinel'), 'utf8'), 'not ours');
  } finally { f.cleanup(); }
});

test('session identity separates different roots and remains stable', () => {
  const f = fixture();
  try {
    const other = { ...f.policy, profileDir: path.join(f.root, 'other-profiles') };
    assert.equal(profileSessionId(f.policy, 'default'), profileSessionId(f.policy, 'default'));
    assert.notEqual(profileSessionId(f.policy, 'default'), profileSessionId(other, 'default'));
  } finally { f.cleanup(); }
});

test('agent-browser session arguments use the same root-bound v2 identity', () => {
  const f = fixture();
  try {
    const id = profileSessionId(f.policy, 'default');
    for (const options of [{}, { stateOnly: true }, { engine: 'lightpanda' }]) {
      const args = sessionArgs(f.policy, 'default', options);
      assert.equal(args[args.indexOf('--session') + 1], id);
      assert.equal(args[args.indexOf('--session-name') + 1], id);
    }
  } finally { f.cleanup(); }
});

test('CLI uses distinct sessions for separate roots and closes the matching session', () => {
  const f = fixture();
  try {
    const preload = path.join(f.root, 'fake.cjs');
    const log = path.join(f.root, 'calls.jsonl');
    fs.writeFileSync(preload, `const cp=require('node:child_process'); const {EventEmitter}=require('node:events'); const {PassThrough}=require('node:stream'); const fs=require('node:fs'); cp.spawn=(cmd,args)=>{fs.appendFileSync(process.env.SBA_FAKE_LOG, JSON.stringify({cmd,args})+'\\n'); const p=new EventEmitter(); p.stdout=new PassThrough(); p.stderr=new PassThrough(); p.stdin=new PassThrough(); p.kill=()=>{}; process.nextTick(()=>{p.stdout.end('ok');p.stderr.end();p.emit('close',0)}); return p}; require('node:module').syncBuiltinESMExports();`);
    const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
    const env = { ...process.env, SBA_POLICY: '', PATH: '', NODE_OPTIONS: `--require="${preload.replaceAll('\\', '/')}"`, SBA_FAKE_LOG: log };
    const run = (config, command) => spawnSync(process.execPath, [cli, command, ...(command === 'open' ? ['data:text/html,ok'] : []), '--policy', config, '--profile', 'default'], { encoding: 'utf8', env });
    const configs = [];
    for (const name of ['one', 'two']) {
      const configDir = path.join(f.root, name, 'config');
      fs.mkdirSync(configDir, { recursive: true });
      const config = path.join(configDir, 'policy.json');
      fs.writeFileSync(config, JSON.stringify({ allowedOrigins: ['data:'], allowedEngines: ['chrome'], profileDir: 'profiles' }));
      configs.push(config);
      const result = run(config, 'open');
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(run(configs[0], 'close-session').status, 0);
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls.length, 3);
    assert.notEqual(calls[0].args[1], calls[1].args[1]);
    assert.equal(calls[0].args[1], calls[2].args[1]);
    assert.match(calls[0].args[1], /^sba-v2-/);
    assert.ok(calls.every((c) => c.cmd === 'agent-browser'));
  } finally { f.cleanup(); }
});

test('reap planning includes only verified v2 profiles, never legacy profiles', () => {
  const f = fixture();
  try {
    const owned = initializeProfile(f.policy, 'verify-123');
    const legacy = path.join(f.policy.profileDir, 'verify-456');
    fs.mkdirSync(legacy);
    const plan = planOwnedReap(f.policy, { processTable: [
      { pid: 101, ppid: 1, command: `chrome --user-data-dir=${owned}` },
      { pid: 102, ppid: 1, command: `chrome --user-data-dir=${legacy}` }
    ], homeDir: f.root });
    assert.deepEqual(plan.verifyProfiles, [owned]);
    assert.deepEqual(plan.processTargets.map((item) => item.pid), [101]);
    assert.ok(fs.existsSync(legacy));
    const calls = [];
    assert.throws(() => applyOwnedReap(plan, { remove: (...args) => calls.push(['remove', ...args]) }), /cannot safely verify/);
    assert.deepEqual(calls, []);
    assert.throws(() => applyOwnedReap({ ...plan, processTargets: [] }), /cannot prove profiles are unused/);
    assert.ok(fs.existsSync(owned));
    assert.ok(fs.existsSync(legacy));
  } finally { f.cleanup(); }
});

test('read-only MCP profile status does not initialize a missing v2 profile', async () => {
  const f = fixture();
  try {
    const config = path.join(f.root, 'config');
    fs.mkdirSync(config);
    const policy = path.join(config, 'policy.json');
    fs.writeFileSync(policy, JSON.stringify({ allowedOrigins: [], profileDir: 'profiles' }));
    const result = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sba_profile_status', arguments: { policy, profile: 'default' } } });
    assert.equal(result.result.isError, false);
    assert.match(JSON.stringify(result), /legacyStatus/);
    assert.match(JSON.stringify(result), /not_checked/);
    assert.equal(fs.existsSync(path.join(f.root, 'profiles')), false);
  } finally { f.cleanup(); }
});

test('simultaneous initializers either succeed with a valid marker or fail closed', async () => {
  const f = fixture();
  try {
    const moduleUrl = new URL('../src/policy.mjs', import.meta.url).href;
    const script = `import {initializeProfile} from ${JSON.stringify(moduleUrl)}; initializeProfile({profileDir:process.argv[1]}, 'default');`;
    const run = promisify(execFile);
    const results = await Promise.allSettled([1, 2].map(() => run(process.execPath, ['--input-type=module', '-e', script, f.policy.profileDir], { env: { ...process.env, NODE_OPTIONS: '' } })));
    assert.ok(results.some((r) => r.status === 'fulfilled'));
    assert.equal(policyModule.requireOwnedProfile(f.policy, 'default'), profilePath(f.policy, 'default'));
  } finally { f.cleanup(); }
});

test('a vanished directory during an EEXIST race fails closed', () => {
  const f = fixture();
  const original = fs.mkdirSync;
  try {
    fs.mkdirSync = (dir, options) => {
      if (path.basename(dir) === 'default') {
        const error = new Error('simulated race');
        error.code = 'EEXIST';
        throw error;
      }
      return original(dir, options);
    };
    assert.throws(() => initializeProfile(f.policy, 'default'), /race|unowned/);
  } finally {
    fs.mkdirSync = original;
    f.cleanup();
  }
});

test('target login and read-only worker resolve the same managed profile', async () => {
  const f = fixture();
  try {
    const configDir = path.join(f.root, 'config');
    fs.mkdirSync(configDir);
    const policyFile = path.join(configDir, 'policy.json');
    fs.writeFileSync(policyFile, JSON.stringify({ allowedOrigins: ['https://example.test'], defaultProfile: 'public', allowedEngines: ['chrome'], authenticatedEngines: ['chrome'], profileDir: 'profiles', outputDir: 'runs' }));
    const policy = policyModule.loadPolicy(policyFile);
    const pack = scaffoldTargetPack(policy, { name: 'sample', origins: 'https://example.test', loginUrl: 'https://example.test/login', pageUrl: 'https://example.test/page' });
    let opened;
    await buildTargetLoginCapture(pack.dir, { openOnly: true, opener: async (_url, dir) => { opened = dir; return {}; } });
    const pool = await buildTargetWorkerPool(f.root, { targetDir: pack.dir });
    assert.equal(pool.errors.length, 0);
    assert.equal(pool.workerCount, 1);
    assert.equal(pool.workers[0].legacyStatus, 'not_checked');
    assert.equal(pool.workers[0].profileDir.replaceAll('\\', '/'), opened.replaceAll('\\', '/'));
    assert.match(opened, /\.sba-profile-v2/);
  } finally { f.cleanup(); }
});

test('stale daemon metadata does not signal an unverified PID', async () => {
  const f = fixture();
  const original = process.kill;
  const signals = [];
  try {
    const dir = initializeProfile(f.policy, 'default');
    fs.writeFileSync(path.join(dir, 'sba-cdp-daemon.json'), JSON.stringify({ pid: 456789, port: null }));
    process.kill = (pid, signal) => { signals.push([pid, signal]); return true; };
    const result = await stopCdpDaemon(dir, { timeoutMs: 0 });
    assert.equal(result.stopped, false);
    assert.deepEqual(signals.filter((item) => item[1] !== 0), []);
    assert.ok(fs.existsSync(path.join(dir, 'sba-cdp-daemon.json')));
  } finally {
    process.kill = original;
    f.cleanup();
  }
});

test('unverified daemon metadata is neither contacted nor reused, even if invalid', async () => {
  const f = fixture();
  try {
    const dir = initializeProfile(f.policy, 'default');
    const metadata = path.join(dir, 'sba-cdp-daemon.json');
    fs.writeFileSync(metadata, 'invalid');
    const status = await cdpDaemonStatus(dir);
    assert.equal(status.ok, false);
    assert.equal(status.metadataExists, true);
    assert.match(status.reason, /cannot be verified/);
    await assert.rejects(() => startCdpDaemon(dir), /cannot be verified/);
    assert.equal(fs.readFileSync(metadata, 'utf8'), 'invalid');
  } finally { f.cleanup(); }
});

test('an existing port file is not removed or reused', async () => {
  const f = fixture();
  try {
    const dir = initializeProfile(f.policy, 'default');
    const port = path.join(dir, 'DevToolsActivePort');
    fs.writeFileSync(port, '45678\n/synthetic');
    await assert.rejects(() => openCdpProfile('about:blank', dir), /cannot be verified/);
    assert.equal(fs.readFileSync(port, 'utf8'), '45678\n/synthetic');
  } finally { f.cleanup(); }
});

test('transient cleanup signals only its owned child handle', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    child.signalCode = signal;
    process.nextTick(() => child.emit('exit'));
    return true;
  };
  const original = process.kill;
  process.kill = () => { throw new Error('global PID signal is forbidden in this fixture'); };
  try {
    assert.equal(await cdpTest.closeTransientChrome(child, 'synthetic', { gracefulMs: 0 }), true);
    assert.deepEqual(signals, ['SIGTERM']);
  } finally { process.kill = original; }
});

test('failed owned-child signal is not reported as a successful exit', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => { throw new Error('synthetic signal failure'); };
  assert.equal(await cdpTest.closeTransientChrome(child, 'synthetic', { gracefulMs: 0 }), false);
});
