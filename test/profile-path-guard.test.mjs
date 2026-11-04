import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { profilePath, statePath } from '../src/policy.mjs';
import { sessionArgs } from '../src/agent-browser.mjs';
import { profileStatus } from '../src/profile-status.mjs';

test('dot profile names cannot select the profile root or its parent', () => {
  const policy = { profileDir: path.resolve('synthetic-profiles'), allowedOrigins: [] };
  for (const name of ['.', '..']) {
    assert.throws(() => profilePath(policy, name), /invalid profile name/);
    assert.throws(() => statePath(policy, name), /invalid profile name/);
    assert.throws(() => sessionArgs(policy, name), /invalid profile name/);
    assert.throws(() => profileStatus(policy, name), /invalid profile name/);
    assert.throws(() => profilePath({ ...policy, defaultProfile: name }), /invalid profile name/);
  }
});

test('profile-status rejects dot names before examining profile artifacts', () => {
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  for (const name of ['.', '..']) {
    const result = spawnSync(process.execPath, [cli, 'profile-status', '--profile', name], {
      encoding: 'utf8', env: { ...process.env, SBA_POLICY: '', PATH: '' }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid profile name/);
    assert.equal(result.stdout, '');
  }
});

test('close-session rejects dot names without launching an external program', () => {
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  for (const name of ['.', '..']) {
    const result = spawnSync(process.execPath, [cli, 'close-session', '--profile', name], {
      encoding: 'utf8', env: { ...process.env, SBA_POLICY: '', PATH: '' }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid profile name/);
    assert.equal(result.stdout, '');
  }
});

test('invalid profile names do not create the output directory', () => {
  const tempBase = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempBase, 'sba-profile-path-'));
  try {
    const config = path.join(root, 'config');
    fs.mkdirSync(config);
    const policy = path.join(config, 'policy.json');
    fs.writeFileSync(policy, JSON.stringify({ allowedOrigins: ['data:'] }));
    const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, 'outline', 'data:text/html,ok', '--policy', policy, '--profile', '..'], {
      encoding: 'utf8', env: { ...process.env, PATH: '' }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid profile name/);
    assert.equal(fs.existsSync(path.join(root, 'runs')), false);
  } finally {
    const resolved = fs.realpathSync(root);
    const relative = path.relative(tempBase, resolved);
    assert.ok(relative.startsWith('sba-profile-path-') && !relative.includes(path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test('normal profile names and existing sanitized names retain their paths', () => {
  const policy = { profileDir: path.resolve('synthetic-profiles'), allowedOrigins: [] };
  for (const [name, expected] of [['target.example', 'target.example'], ['team/test', 'team_test']]) {
    assert.equal(profilePath(policy, name), path.join(policy.profileDir, expected));
    assert.equal(statePath(policy, name), path.join(policy.profileDir, expected, 'state.json'));
  }
});
