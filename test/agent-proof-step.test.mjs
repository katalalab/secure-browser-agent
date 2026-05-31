import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAgentProofStep, buildAgentProofStepStart, buildAgentProofStepStatus, formatAgentProofStepCompact, formatAgentProofStepStartCompact, formatAgentProofStepStatusCompact } from '../src/agent-proof-step.mjs';

function auditFixture(overrides = {}) {
  return {
    generatedAt: '2026-05-30T00:00:00.000Z',
    nextAction: {
      target: 'github',
      command: {
        args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--handoff', 'operator-handoff.json']
      }
    },
    executionPolicy: overrides.executionPolicy || {}
  };
}

function command(args) {
  return {
    args,
    shell: args.map((item) => `'${String(item)}'`).join(' ')
  };
}

function watchFixture(overrides = {}) {
  const selectedId = overrides.selectedId || 'monitor-auth';
  const selectedStartsCapture = Boolean(overrides.startsCapture);
  const selectedArgs = overrides.commandArgs || [
    'node',
    'src/cli.mjs',
    selectedId === 'resume-capture' ? 'target-handoff-resume' : 'target-auth-watch',
    'runs/target-packs/github',
    '--handoff',
    'operator-handoff.json',
    '--format',
    'compact'
  ];
  return {
    status: overrides.status || 'planned',
    statusBefore: {
      latestAuthOk: Boolean(overrides.latestAuthOk),
      captureCompleted: Boolean(overrides.captureCompleted)
    },
    selectedCommand: {
      id: selectedId,
      startsCapture: selectedStartsCapture,
      command: command(selectedArgs)
    },
    result: overrides.result || null
  };
}

test('agent proof step blocks before saved auth is ready and does not run capture', async () => {
  const calls = [];
  const step = await buildAgentProofStep({
    rootDir: '/tmp/sba-proof',
    generatedAt: '2026-05-30T00:00:00.000Z',
    audit: auditFixture(),
    run: true,
    handoffResumeWatchBuilder: async (targetDir, options) => {
      calls.push({ targetDir, run: Boolean(options.run) });
      return watchFixture();
    }
  });

  assert.equal(step.status, 'blocked');
  assert.equal(step.allowedToRun, false);
  assert.equal(step.executed, false);
  assert.equal(step.blockedReason, 'auth-not-ready');
  assert.deepEqual(calls, [{ targetDir: 'runs/target-packs/github', run: false }]);
  const compact = formatAgentProofStepCompact(step);
  assert.match(compact, /^selected_command: monitor-auth$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^allowed_to_run: no$/m);
});

test('agent proof step blocks stale auth-watch handoff ports instead of selecting monitor auth', async () => {
  const step = await buildAgentProofStep({
    rootDir: '/tmp/sba-proof',
    generatedAt: '2026-05-30T00:00:00.000Z',
    audit: auditFixture({
      executionPolicy: {
        agentSafeCommandBlockedReason: 'handoff-auth-check-port-unreachable',
        authWatchHandoffPortReachable: false
      }
    }),
    run: true,
    handoffResumeWatchBuilder: async () => watchFixture()
  });

  assert.equal(step.status, 'blocked');
  assert.equal(step.allowedToRun, false);
  assert.equal(step.executed, false);
  assert.equal(step.blockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(step.selectedCommandId, 'reopen-login-required');
  assert.equal(step.command, null);
  assert.equal(step.runCommand, null);
  const compact = formatAgentProofStepCompact(step);
  assert.match(compact, /^selected_command: reopen-login-required$/m);
  assert.match(compact, /^blocked_reason: handoff-auth-check-port-unreachable$/m);
});

test('agent proof step runs no-open resume capture after saved auth is ready', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-'));
  const calls = [];
  const step = await buildAgentProofStep({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    audit: auditFixture(),
    run: true,
    operatorOk: 'OK',
    write: true,
    out: 'operator/agent-proof-step-latest.json',
    timeoutMs: 15000,
    handoffResumeWatchBuilder: async (targetDir, options) => {
      calls.push({ targetDir, run: Boolean(options.run), operatorOk: options.operatorOk || '', timeoutMs: options.timeoutMs });
      if (options.run) {
        return watchFixture({
          status: 'completed',
          latestAuthOk: true,
          selectedId: 'resume-capture',
          startsCapture: true,
          commandArgs: [
            'node',
            'src/cli.mjs',
            'target-handoff-resume',
            'runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--run',
            '--wait-auth',
            '--format',
            'compact'
          ],
          result: { ok: true, childStatus: 'completed', childOk: true, status: 0 }
        });
      }
      return watchFixture({
        latestAuthOk: true,
        selectedId: 'resume-capture',
        startsCapture: true,
        commandArgs: [
          'node',
          'src/cli.mjs',
          'target-handoff-resume',
          'runs/target-packs/github',
          '--handoff',
          'operator-handoff.json',
          '--run',
          '--wait-auth',
          '--format',
          'compact'
        ]
      });
    }
  });

  assert.deepEqual(calls, [
    { targetDir: 'runs/target-packs/github', run: false, operatorOk: 'OK', timeoutMs: 15000 },
    { targetDir: 'runs/target-packs/github', run: true, operatorOk: 'OK', timeoutMs: 15000 }
  ]);
  assert.equal(step.allowedToRun, true);
  assert.equal(step.executed, true);
  assert.equal(step.status, 'completed');
  assert.equal(step.result.ok, true);
  assert.equal(step.secretValuesRead, false);
  assert.equal(step.readsBrowserStorage, false);
  assert.equal(step.pageContentReturned, false);
  assert.ok(fs.existsSync(path.join(rootDir, 'runs/operator/agent-proof-step-latest.json')));
  const compact = formatAgentProofStepCompact(step);
  assert.match(compact, /^selected_command: resume-capture$/m);
  assert.match(compact, /^operator_ok_required: yes$/m);
  assert.match(compact, /^operator_ok_accepted: yes$/m);
  assert.match(compact, /^starts_capture_now: yes$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^allowed_to_run: yes$/m);
  assert.doesNotMatch(compact, /secret-value/);
});

test('agent proof step blocks no-open resume capture without operator OK', async () => {
  const step = await buildAgentProofStep({
    rootDir: '/tmp/sba-proof',
    generatedAt: '2026-05-30T00:00:00.000Z',
    audit: auditFixture(),
    run: true,
    handoffResumeWatchBuilder: async () => watchFixture({
      latestAuthOk: true,
      selectedId: 'resume-capture',
      startsCapture: true,
      commandArgs: [
        'node',
        'src/cli.mjs',
        'target-handoff-resume',
        'runs/target-packs/github',
        '--handoff',
        'operator-handoff.json',
        '--run',
        '--wait-auth',
        '--format',
        'compact'
      ]
    })
  });

  assert.equal(step.status, 'blocked');
  assert.equal(step.allowedToRun, false);
  assert.equal(step.executed, false);
  assert.equal(step.blockedReason, 'operator-ok-required');
  assert.equal(step.operatorOkRequired, true);
  assert.equal(step.operatorOkAccepted, false);
  assert.equal(step.runCommand, null);
  const compact = formatAgentProofStepCompact(step);
  assert.match(compact, /^operator_ok_required: yes$/m);
  assert.match(compact, /^operator_ok_accepted: no$/m);
  assert.match(compact, /^blocked_reason: operator-ok-required$/m);
});

test('agent proof step refuses resume capture command shape that opens login browser', async () => {
  const step = await buildAgentProofStep({
    rootDir: '/tmp/sba-proof',
    generatedAt: '2026-05-30T00:00:00.000Z',
    audit: auditFixture(),
    run: true,
    handoffResumeWatchBuilder: async () => watchFixture({
      latestAuthOk: true,
      selectedId: 'resume-capture',
      startsCapture: true,
      commandArgs: [
        'node',
        'src/cli.mjs',
        'target-handoff-resume',
        'runs/target-packs/github',
        '--run',
        '--wait-auth',
        '--open-login',
        '--format',
        'compact'
      ]
    })
  });

  assert.equal(step.status, 'blocked');
  assert.equal(step.allowedToRun, false);
  assert.equal(step.executed, false);
  assert.equal(step.blockedReason, 'command-shape-not-allowed');
});

test('agent proof step rejects output paths outside runs', async () => {
  assert.rejects(
    buildAgentProofStep({
      rootDir: '/tmp/sba-proof',
      generatedAt: '2026-05-30T00:00:00.000Z',
      audit: auditFixture(),
      out: '../outside.json',
      handoffResumeWatchBuilder: async () => watchFixture()
    }),
    /invalid agent proof step output path/
  );
});

test('agent proof step start refuses background start without operator OK', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-start-'));
  const result = await buildAgentProofStepStart({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    step: {
      allowedToRun: true,
      blockedReason: '',
      selectedCommandId: 'resume-capture',
      selectedStartsCapture: true,
      latestAuthOk: true,
      captureCompleted: false,
      startsCaptureNow: true,
      runCommand: command(['node', 'src/cli.mjs', 'agent-proof-step', '--run', '--write', '--out', 'operator/agent-proof-step-latest.json', '--format', 'compact'])
    },
    run: true
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.readyToRun, false);
  assert.equal(result.startsBackgroundProcessNow, false);
  assert.deepEqual(result.blockers, ['operator-ok-required']);
  const compact = formatAgentProofStepStartCompact(result);
  assert.match(compact, /^status: blocked$/m);
  assert.match(compact, /^operator_ok_accepted: no$/m);
  assert.match(compact, /^approved_run_command: 'node' 'src\/cli\.mjs' 'agent-proof-step-start' '--run' '--operator-ok' 'OK'/m);
});

test('agent proof step start preserves target handoff monitor and path arguments', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-start-'));
  const result = await buildAgentProofStepStart({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    audit: auditFixture(),
    out: 'operator/custom-step.json',
    logPath: 'operator/custom-step.log',
    pidPath: 'operator/custom-step.pid',
    timeoutMs: 12345,
    monitorTimeoutMs: 6789,
    monitorIntervalMs: 111,
    handoffResumeWatchBuilder: async () => watchFixture()
  });

  assert.deepEqual(result.commands.approvedRun.args, [
    'node',
    'src/cli.mjs',
    'agent-proof-step-start',
    '--run',
    '--operator-ok',
    'OK',
    '--out',
    'operator/custom-step.json',
    '--timeout-ms',
    '12345',
    '--target-dir',
    'runs/target-packs/github',
    '--handoff',
    'operator-handoff.json',
    '--monitor-timeout-ms',
    '6789',
    '--monitor-interval-ms',
    '111',
    '--log-path',
    'operator/custom-step.log',
    '--pid-path',
    'operator/custom-step.pid',
    '--format',
    'compact'
  ]);
  assert.deepEqual(result.commands.status.args, [
    'node',
    'src/cli.mjs',
    'agent-proof-step-status',
    '--in',
    'operator/custom-step.json',
    '--log-path',
    'operator/custom-step.log',
    '--pid-path',
    'operator/custom-step.pid',
    '--format',
    'compact'
  ]);
});

test('agent proof step start launches detached no-open proof command after operator OK', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-start-'));
  const calls = [];
  const result = await buildAgentProofStepStart({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    step: {
      allowedToRun: true,
      blockedReason: '',
      selectedCommandId: 'resume-capture',
      selectedStartsCapture: true,
      latestAuthOk: true,
      captureCompleted: false,
      startsCaptureNow: true,
      runCommand: command(['node', 'src/cli.mjs', 'agent-proof-step', '--run', '--write', '--out', 'operator/agent-proof-step-latest.json', '--format', 'compact'])
    },
    run: true,
    operatorOk: 'OK',
    spawnImpl(commandName, args, options) {
      calls.push({ commandName, args, options });
      return {
        pid: 515151,
        unref() {}
      };
    }
  });

  assert.equal(result.status, 'started');
  assert.equal(result.readyToRun, true);
  assert.equal(result.startsBackgroundProcessNow, true);
  assert.equal(result.startsCaptureNow, true);
  assert.equal(result.started.pid, 515151);
  assert.equal(fs.readFileSync(path.join(rootDir, 'runs/operator/agent-proof-step.pid'), 'utf8'), '515151\n');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].commandName, 'node');
  assert.deepEqual(calls[0].args, ['src/cli.mjs', 'agent-proof-step', '--run', '--write', '--out', 'operator/agent-proof-step-latest.json', '--format', 'compact']);
  assert.equal(calls[0].options.cwd, rootDir);
  assert.equal(calls[0].options.detached, true);
  const compact = formatAgentProofStepStartCompact(result);
  assert.match(compact, /^status: started$/m);
  assert.match(compact, /^starts_background_process_now: yes$/m);
});

test('agent proof step status reads saved step and redacts auth-like log tail', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-status-'));
  fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'runs/operator/agent-proof-step-latest.json'), `${JSON.stringify({
    status: 'completed',
    executed: true,
    allowedToRun: true,
    selectedCommandId: 'resume-capture',
    result: { status: 'completed' }
  })}\n`);
  fs.writeFileSync(path.join(rootDir, 'runs/operator/agent-proof-step.log'), 'ok token=abc123 auth=secret\n');

  const status = buildAgentProofStepStatus({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    in: 'operator/agent-proof-step-latest.json',
    maxLogLines: 5
  });

  assert.equal(status.saved.exists, true);
  assert.equal(status.saved.step.status, 'completed');
  assert.equal(status.agentSafeNextCommandId, 'none');
  assert.equal(status.agentSafeNextMayRunUnattended, false);
  assert.equal(status.agentSafeNextCommand, null);
  assert.deepEqual(status.commands.refresh.args, [
    'node',
    'src/cli.mjs',
    'agent-proof-step',
    '--write',
    '--out',
    'operator/agent-proof-step-latest.json',
    '--format',
    'compact'
  ]);
  assert.equal(status.log.tail[0], 'ok token=[redacted] auth=[redacted]');
  const compact = formatAgentProofStepStatusCompact(status);
  assert.match(compact, /^agent_safe_next_command_id: none$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: no$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^saved_status: completed$/m);
  assert.match(compact, /^saved_selected_command: resume-capture$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-proof-step' '--write' '--out' 'operator\/agent-proof-step-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^log_tail: ok token=\[redacted\] auth=\[redacted\]$/m);
});

test('agent proof step status exposes refresh as unattended-safe when saved step is missing', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-status-missing-'));

  const status = buildAgentProofStepStatus({
    rootDir,
    generatedAt: '2026-05-30T00:00:00.000Z',
    in: 'operator/missing-proof-step.json'
  });

  assert.equal(status.saved.exists, false);
  assert.equal(status.agentSafeNextCommandId, 'agent-proof-step-refresh');
  assert.equal(status.agentSafeNextMayRunUnattended, true);
  assert.equal(status.agentSafeNextOpensBrowser, false);
  assert.equal(status.agentSafeNextStartsCapture, false);
  assert.equal(status.agentSafeNextReadsBrowserStorage, false);
  assert.equal(status.agentSafeNextReturnsPageContent, false);
  assert.deepEqual(status.agentSafeNextCommand.args, [
    'node',
    'src/cli.mjs',
    'agent-proof-step',
    '--write',
    '--out',
    'operator/missing-proof-step.json',
    '--format',
    'compact'
  ]);

  const compact = formatAgentProofStepStatusCompact(status);
  assert.match(compact, /^saved_exists: no$/m);
  assert.match(compact, /^agent_safe_next_command_id: agent-proof-step-refresh$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-proof-step' '--write' '--out' 'operator\/missing-proof-step\.json' '--format' 'compact'$/m);
});
