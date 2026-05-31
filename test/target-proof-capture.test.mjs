import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTargetProofCapture, formatTargetProofCaptureCompact, formatTargetProofCaptureMarkdown } from '../src/target-proof-capture.mjs';

function command(id) {
  return {
    args: ['node', 'src/cli.mjs', id],
    shell: `'node' 'src/cli.mjs' '${id}'`
  };
}

function plan(overrides = {}) {
  return {
    target: 'vendor-service',
    dir: '/tmp/vendor-service',
    profile: 'vendor-service',
    realExternal: true,
    externalOrigins: ['https://app.vendor-service.com'],
    currentState: {
      auditOk: true,
      profileLikelyAuthenticated: true,
      permissionsPending: 0,
      daemonRunning: false,
      authCheck: { ok: false },
      missingOutputs: ['observe.json', 'inspect.json', 'scrape.csv'],
      benchmark: { ok: false },
      proofReady: false,
      ...(overrides.currentState || {})
    },
    commands: [
      { id: 'permissions', title: 'Apply permissions', command: command('target-permissions') },
      { id: 'start-daemon', title: 'Start daemon', command: command('target-daemon') },
      { id: 'auth-check', title: 'Auth check', command: command('target-auth-check') },
      { id: 'observe', title: 'Observe', command: command('target-run-observe') },
      { id: 'inspect', title: 'Inspect', command: command('target-run-inspect') },
      { id: 'scrape', title: 'Scrape', command: command('target-scrape') },
      { id: 'benchmark', title: 'Benchmark', command: command('target-benchmark') },
      { id: 'write-proof', title: 'Write proof', command: command('target-proof') }
    ],
    ...overrides
  };
}

test('target proof capture plans the post-login proof sequence without running', async () => {
  const capture = await buildTargetProofCapture('/tmp/vendor-service', {
    generatedAt: '2026-05-28T00:00:00.000Z',
    plan: plan()
  });

  assert.equal(capture.status, 'planned');
  assert.equal(capture.readyToRun, true);
  assert.equal(capture.run, false);
  assert.deepEqual(capture.steps.map((step) => step.id), [
    'start-daemon',
    'auth-check',
    'observe',
    'inspect',
    'scrape',
    'benchmark',
    'write-proof'
  ]);
  assert.match(formatTargetProofCaptureMarkdown(capture), /target-proof/);
  assert.match(formatTargetProofCaptureCompact(capture), /^status: planned$/m);
  assert.match(formatTargetProofCaptureCompact(capture), /^next_step: start-daemon$/m);
  assert.match(formatTargetProofCaptureCompact(capture), /^run_command: 'node' 'src\/cli\.mjs' 'target-proof-capture' '\/tmp\/vendor-service' '--real-external' '--run' '--format' 'compact'$/m);
  assert.match(formatTargetProofCaptureCompact(capture), /^command: 'node' 'src\/cli\.mjs' 'target-daemon'$/m);
});

test('target proof capture run command preserves wait-auth and proof options', async () => {
  const capture = await buildTargetProofCapture('/tmp/vendor-service', {
    generatedAt: '2026-05-28T00:00:00.000Z',
    waitAuth: true,
    authCheckPort: 7777,
    waitAuthTimeoutMs: 10000,
    waitAuthIntervalMs: 1000,
    waitAuthStatusOut: 'wait-auth-status.json',
    benchmarkFile: 'runs/target-packs/vendor-service/proof/target-benchmark.json',
    completionAudit: true,
    plan: plan()
  });

  assert.deepEqual(capture.runCommand.args, [
    'node',
    'src/cli.mjs',
    'target-proof-capture',
    '/tmp/vendor-service',
    '--real-external',
    '--run',
    '--wait-auth',
    '--auth-check-port',
    '7777',
    '--wait-auth-timeout-ms',
    '10000',
    '--wait-auth-interval-ms',
    '1000',
    '--wait-auth-status-out',
    'wait-auth-status.json',
    '--benchmark-file',
    'runs/target-packs/vendor-service/proof/target-benchmark.json',
    '--completion-audit',
    '--format',
    'compact'
  ]);

  const compact = formatTargetProofCaptureCompact(capture);
  assert.match(compact, /^run_command: 'node' 'src\/cli\.mjs' 'target-proof-capture' '\/tmp\/vendor-service' '--real-external' '--run' '--wait-auth'/m);
  assert.match(compact, /'--completion-audit'/);
});

test('target proof capture blocks when real external prerequisites are missing', async () => {
  const capture = await buildTargetProofCapture('/tmp/vendor-service', {
    plan: plan({
      realExternal: false,
      externalOrigins: [],
      currentState: {
        auditOk: false,
        profileLikelyAuthenticated: false,
        missingOutputs: [],
        benchmark: { ok: false }
      }
    })
  });

  assert.equal(capture.status, 'blocked');
  assert.equal(capture.readyToRun, false);
  assert.match(capture.blockers.join('\n'), /real service/);
  assert.match(capture.blockers.join('\n'), /no real external origin/i);
  assert.match(capture.blockers.join('\n'), /audit/);
  assert.match(capture.blockers.join('\n'), /authenticated/);
  assert.match(formatTargetProofCaptureCompact(capture), /^status: blocked$/m);
  assert.match(formatTargetProofCaptureCompact(capture), /^blockers: 4$/m);
  assert.match(formatTargetProofCaptureCompact(capture), /^detail: Run with --real-external/m);
});

test('target proof capture executes steps with an injectable runner', async () => {
  const calls = [];
  const capture = await buildTargetProofCapture('/tmp/vendor-service', {
    run: true,
    skipFinalPlan: true,
    plan: plan({
      currentState: {
        auditOk: true,
        profileLikelyAuthenticated: true,
        permissionsPending: 1,
        daemonRunning: true,
        authCheck: { ok: true },
        missingOutputs: ['scrape.csv'],
        benchmark: { ok: true }
      }
    }),
    applyPermissions: true,
    runner: (args) => {
      calls.push(args.at(-1));
      return {
        ok: true,
        status: 0,
        stdout: `/tmp/${args.at(-1)}\n`,
        stderr: ''
      };
    }
  });

  assert.equal(capture.status, 'completed');
  assert.deepEqual(capture.steps.map((step) => step.id), ['permissions', 'scrape', 'write-proof']);
  assert.deepEqual(calls, ['target-permissions', 'target-scrape', 'target-proof']);
  assert.equal(capture.steps.every((step) => step.status === 'completed'), true);
});

test('target proof capture can include the final objective completion audit summary', async () => {
  const capture = await buildTargetProofCapture('/tmp/vendor-service', {
    run: true,
    completionAudit: true,
    skipFinalPlan: true,
    plan: plan({
      currentState: {
        auditOk: true,
        profileLikelyAuthenticated: true,
        permissionsPending: 0,
        daemonRunning: true,
        authCheck: { ok: true },
        missingOutputs: ['scrape.csv'],
        benchmark: { ok: true }
      }
    }),
    runner: () => ({
      ok: true,
      status: 0,
      stdout: 'ok\n',
      stderr: ''
    }),
    completionAuditBuilder: async () => ({
      complete: true,
      status: 'complete',
      finalGate: { remainingCount: 0 },
      remaining: []
    })
  });

  assert.equal(capture.status, 'completed');
  assert.equal(capture.completionAudit.complete, true);
  assert.equal(capture.completionAudit.remainingCount, 0);
  assert.match(formatTargetProofCaptureCompact(capture), /^completion_audit: complete$/m);
  assert.match(formatTargetProofCaptureCompact(capture), /^completion_complete: yes$/m);
  assert.match(formatTargetProofCaptureMarkdown(capture), /Completion Audit/);
});

test('target proof capture can wait for auth before running capture steps', async () => {
  const calls = [];
  const capture = await buildTargetProofCapture('/tmp/vendor-service', {
    run: true,
    waitAuth: true,
    skipFinalPlan: true,
    plan: plan({
      currentState: {
        auditOk: true,
        profileLikelyAuthenticated: true,
        permissionsPending: 0,
        daemonRunning: true,
        authCheck: { ok: true, finalUrl: 'https://app.vendor-service.com/dashboard' },
        missingOutputs: ['scrape.csv'],
        benchmark: { ok: true }
      }
    }),
    runner: (args) => {
      calls.push(args.at(-1));
      return {
        ok: true,
        status: 0,
        stdout: `${args.at(-1)} ok\n`,
        stderr: ''
      };
    }
  });

  assert.equal(capture.status, 'completed');
  assert.equal(capture.waitAuth.enabled, true);
  assert.equal(capture.waitAuth.status, 'authenticated');
  assert.equal(capture.waitAuth.attempts.length, 1);
  assert.deepEqual(capture.steps.map((step) => step.id), ['scrape', 'write-proof']);
  assert.deepEqual(calls, ['target-scrape', 'target-proof']);
  assert.match(formatTargetProofCaptureMarkdown(capture), /Wait auth: authenticated/);
  assert.match(formatTargetProofCaptureCompact(capture), /^status: completed$/m);
  assert.match(formatTargetProofCaptureCompact(capture), /^wait_auth: authenticated$/m);
  assert.match(formatTargetProofCaptureCompact(capture), /^completed_steps: 2$/m);
});

test('target proof capture wait-auth refreshes auth-check through the provided CDP port', async () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-capture-'));
  const authCalls = [];
  const planCalls = [];
  const runnerCalls = [];
  const refreshedPlan = plan({
    dir: targetDir,
    currentState: {
      auditOk: true,
      profileLikelyAuthenticated: true,
      permissionsPending: 0,
      daemonRunning: true,
      authCheck: { ok: true, finalUrl: 'https://app.vendor-service.com/dashboard' },
      missingOutputs: ['scrape.csv'],
      benchmark: { ok: true }
    }
  });

  const capture = await buildTargetProofCapture(targetDir, {
    run: true,
    waitAuth: true,
    authCheckPort: 7777,
    waitAuthStatusOut: 'wait-auth-status.json',
    skipFinalPlan: true,
    plan: plan({
      dir: targetDir,
      currentState: {
        auditOk: true,
        profileLikelyAuthenticated: true,
        permissionsPending: 0,
        daemonRunning: true,
        authCheck: { ok: false, finalUrl: 'https://app.vendor-service.com/login' },
        missingOutputs: ['scrape.csv'],
        benchmark: { ok: true }
      }
    }),
    authCheckBuilder: async (targetDir, options) => {
      authCalls.push({ targetDir, options });
      return {
        ok: true,
        finalUrl: 'https://app.vendor-service.com/dashboard',
        loginLike: false
      };
    },
    planBuilder: async (targetDir, options) => {
      planCalls.push({ targetDir, options });
      return refreshedPlan;
    },
    runner: (args) => {
      runnerCalls.push(args.at(-1));
      return {
        ok: true,
        status: 0,
        stdout: `${args.at(-1)} ok\n`,
        stderr: ''
      };
    }
  });

  assert.equal(capture.status, 'completed');
  assert.equal(capture.waitAuth.status, 'authenticated');
  assert.equal(capture.waitAuth.attempts.length, 1);
  assert.equal(capture.waitAuth.attempts[0].authCheckRefresh.ok, true);
  assert.match(capture.waitAuth.outputPath, /outputs\/wait-auth-status\.json$/);
  const written = JSON.parse(fs.readFileSync(path.join(targetDir, 'outputs/wait-auth-status.json'), 'utf8'));
  assert.equal(written.status, 'authenticated');
  assert.equal(written.attempts.length, 1);
  assert.equal(written.attempts[0].authCheckRefresh.ok, true);
  assert.equal(authCalls.length, 1);
  assert.equal(authCalls[0].targetDir, targetDir);
  assert.equal(authCalls[0].options.write, true);
  assert.equal(authCalls[0].options.cdpPort, 7777);
  assert.equal(planCalls.length, 1);
  assert.deepEqual(runnerCalls, ['target-scrape', 'target-proof']);
});

test('target proof capture wait-auth rejects status output paths outside outputs', async () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-capture-'));
  await assert.rejects(
    () => buildTargetProofCapture(targetDir, {
      run: true,
      waitAuth: true,
      waitAuthStatusOut: '../bad.json',
      plan: plan({
        dir: targetDir,
        currentState: {
          auditOk: true,
          profileLikelyAuthenticated: true,
          permissionsPending: 0,
          daemonRunning: true,
          authCheck: { ok: true, finalUrl: 'https://app.vendor-service.com/dashboard' },
          missingOutputs: [],
          benchmark: { ok: true }
        }
      })
    }),
    /invalid wait auth status output path/
  );
});

test('target proof capture wait-auth times out without running capture steps', async () => {
  const capture = await buildTargetProofCapture('/tmp/vendor-service', {
    run: true,
    waitAuth: true,
    waitAuthTimeoutMs: -1,
    plan: plan({
      currentState: {
        auditOk: true,
        profileLikelyAuthenticated: false,
        permissionsPending: 0,
        daemonRunning: true,
        authCheck: { ok: false, finalUrl: 'https://app.vendor-service.com/login' },
        missingOutputs: [],
        benchmark: { ok: true }
      }
    }),
    runner: () => {
      throw new Error('runner should not be called before auth is ready');
    }
  });

  assert.equal(capture.status, 'blocked');
  assert.equal(capture.readyToRun, false);
  assert.equal(capture.waitAuth.status, 'timed-out');
  assert.match(capture.blockers.join('\n'), /Timed out waiting/);
  assert.equal(capture.steps.every((step) => step.status === 'pending'), true);
});

test('target proof capture stops a daemon it started when a later step fails', async () => {
  const calls = [];
  const capture = await buildTargetProofCapture('/tmp/vendor-service', {
    run: true,
    skipFinalPlan: true,
    plan: plan({
      currentState: {
        auditOk: true,
        profileLikelyAuthenticated: true,
        permissionsPending: 0,
        daemonRunning: false,
        authCheck: { ok: false },
        missingOutputs: [],
        benchmark: { ok: true }
      }
    }),
    runner: (args) => {
      calls.push(args.slice(-2).join(' '));
      if (args.includes('target-auth-check')) {
        return {
          ok: false,
          status: 1,
          stdout: 'login-like\n',
          stderr: ''
        };
      }
      return {
        ok: true,
        status: 0,
        stdout: `${args.at(-1)} ok\n`,
        stderr: ''
      };
    }
  });

  assert.equal(capture.status, 'failed');
  assert.equal(capture.steps.find((step) => step.id === 'start-daemon').status, 'completed');
  assert.equal(capture.steps.find((step) => step.id === 'auth-check').status, 'failed');
  assert.equal(capture.cleanup.id, 'stop-daemon-on-failure');
  assert.equal(capture.cleanup.status, 'completed');
  assert.match(capture.cleanup.command.shell, /target-daemon/);
  assert.match(capture.cleanup.command.shell, /stop/);
  assert.deepEqual(calls, ['src/cli.mjs target-daemon', 'src/cli.mjs target-auth-check', '/tmp/vendor-service stop']);
  assert.match(formatTargetProofCaptureMarkdown(capture), /Cleanup/);
});
