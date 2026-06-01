import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPolicy } from '../src/policy.mjs';
import { scaffoldTargetPack } from '../src/target-pack.mjs';
import { buildTargetWorkerPool, formatTargetWorkerPoolCompact } from '../src/target-worker-pool.mjs';

function writePolicy(root) {
  const configDir = path.join(root, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const file = path.join(configDir, 'policy.json');
  fs.writeFileSync(file, `${JSON.stringify({
    allowedOrigins: ['https://example.com', 'https://html.duckduckgo.com'],
    defaultProfile: 'public',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: '../runs',
    profileDir: '../profiles',
    redactKeys: ['token', 'password', 'secret']
  }, null, 2)}\n`, 'utf8');
  return file;
}

test('target worker pool inventories target-pack daemon commands without starting Chrome', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-worker-pool-'));
  try {
    const policy = loadPolicy(writePolicy(root));
    const pack = scaffoldTargetPack(policy, {
      name: 'example-public',
      origins: 'https://example.com',
      pageUrl: 'https://example.com',
      force: true
    });
    const pool = await buildTargetWorkerPool(root, { targetDir: pack.dir, profile: 'alternate-public' });
    assert.equal(pool.safeMode, true);
    assert.equal(pool.statusOnly, true);
    assert.equal(pool.workerCount, 1);
    assert.equal(pool.runningCount, 0);
    assert.equal(pool.workers[0].profile, 'alternate-public');
    assert.match(pool.workers[0].startCommand.shell, /target-daemon/);
    assert.match(pool.workers[0].startCommand.shell, /--profile' 'alternate-public/);
    assert.match(pool.workers[0].stopCommand.shell, /--profile' 'alternate-public/);
    assert.match(pool.workers[0].statusCommand.shell, /--profile' 'alternate-public/);
    assert.match(formatTargetWorkerPoolCompact(pool), /^worker_example-public_start_command:/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
