import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProofGateWatch, formatProofGateWatchCompact, formatProofGateWatchMarkdown } from '../src/proof-gate-watch.mjs';

function statusFixture(overrides = {}) {
  return {
    generatedAt: '2026-05-28T00:00:00.000Z',
    complete: false,
    objectiveComplete: false,
    status: 'waiting-for-login',
    target: 'github',
    nextAction: {
      id: 'handoff-resume',
      label: 'Continue handoff',
      command: {
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume'"
      }
    },
    operatorGuidance: {
      humanAction: 'complete-login-in-open-dedicated-browser',
      automationBlocker: 'auth-check-not-ok',
      captureBlocked: true
    },
    authCheckOk: false,
    loginLike: true,
    authStatusSource: 'auth-watch-latest',
    authFinalUrl: 'https://github.com/login',
    authTitle: 'Sign in to GitHub',
    missingArtifactCount: 6,
    acceptedExternalProofCount: 0,
    secretValuesRead: false,
    destructiveActionsIncluded: false,
    ...overrides
  };
}

test('proof gate watch completes after a later status and writes under runs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-gate-watch-ok-'));
  try {
    let currentMs = 0;
    let calls = 0;
    const result = await buildProofGateWatch({
      rootDir: root,
      timeoutMs: 1000,
      intervalMs: 100,
      write: true,
      out: 'operator/watch.json',
      generatedAt: '2026-05-28T00:00:00.000Z',
      now: () => currentMs,
      sleep: async (ms) => {
        currentMs += ms;
      },
      statusBuilder: async () => {
        calls += 1;
        return statusFixture(calls === 2
          ? {
              complete: true,
              objectiveComplete: true,
              status: 'complete',
              nextAction: { id: 'complete', label: 'Done' },
              operatorGuidance: {
                humanAction: 'none',
                automationBlocker: 'none',
                captureBlocked: false
              },
              authCheckOk: true,
              loginLike: false,
              authFinalUrl: 'https://github.com/dashboard',
              missingArtifactCount: 0,
              acceptedExternalProofCount: 1
            }
          : {});
      }
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.complete, true);
    assert.equal(result.attemptCount, 2);
    assert.equal(result.secretValuesRead, false);
    assert.equal(result.destructiveActionsIncluded, false);
    assert.ok(result.outputPath.endsWith('runs/operator/watch.json'));
    const written = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
    assert.equal(written.status, 'complete');
    assert.equal(written.attemptCount, 2);
    assert.match(formatProofGateWatchCompact(result), /^status: complete$/m);
    assert.match(formatProofGateWatchMarkdown(result), /Proof Gate Watch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('proof gate watch times out without starting capture', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-gate-watch-timeout-'));
  try {
    const result = await buildProofGateWatch({
      rootDir: root,
      timeoutMs: 0,
      intervalMs: 10,
      now: () => 0,
      sleep: async () => {
        throw new Error('sleep should not run after timeout');
      },
      statusBuilder: async () => statusFixture()
    });

    assert.equal(result.status, 'timed-out');
    assert.equal(result.complete, false);
    assert.equal(result.attemptCount, 1);
    assert.equal(result.outputPath, '');
    const compact = formatProofGateWatchCompact(result);
    assert.match(compact, /^last_gate_status: waiting-for-login$/m);
    assert.match(compact, /^auth_check_ok: no$/m);
    assert.match(compact, /^login_like: yes$/m);
    assert.match(compact, /^secret_values_read: no$/m);
    assert.match(compact, /^destructive_actions: no$/m);
    assert.match(compact, /target-handoff-resume/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('proof gate watch rejects output paths outside runs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-gate-watch-bad-out-'));
  try {
    await assert.rejects(
      () => buildProofGateWatch({
        rootDir: root,
        out: '../watch.json',
        statusBuilder: async () => statusFixture()
      }),
      /invalid proof gate watch output path/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
