import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAgentLoopStep, buildAgentLoopStepStatus, formatAgentLoopStepCompact, formatAgentLoopStepStatusCompact } from '../src/agent-loop-step.mjs';

function controlStatus(overrides = {}) {
  return {
    agentLoop: {
      nextAction: 'run-monitor-only-command',
      canRunWithoutApproval: true,
      commandId: 'auth-watch',
      command: {
        args: ['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--format' 'compact'"
      },
      statusCommand: {
        args: ['node', 'src/cli.mjs', 'control-status', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'control-status' '--format' 'compact'"
      },
      backgroundStatusCommand: {
        args: ['node', 'src/cli.mjs', 'background-proof-capture-status', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'background-proof-capture-status' '--format' 'compact'"
      },
      backgroundCaptureStartCommand: {
        args: ['node', 'src/cli.mjs', 'background-proof-capture-start', '--mode', 'capture', '--run', '--operator-ok', 'OK', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'background-proof-capture-start' '--mode' 'capture' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      },
      backgroundMonitorStartCommand: {
        args: ['node', 'src/cli.mjs', 'background-proof-capture-start', '--mode', 'monitor', '--run', '--operator-ok', 'OK', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      },
      opensBrowserNow: false,
      startsCaptureNow: false,
      userApprovalRequiredForBackgroundStart: true,
      ...overrides
    }
  };
}

test('agent loop step can shorten monitor-only auth watch settings', async () => {
  let received = null;
  const step = await buildAgentLoopStep({
    rootDir: '/tmp/sba',
    run: true,
    timeoutMs: 15000,
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000,
    controlStatus: controlStatus({
      command: {
        args: [
          'node',
          'src/cli.mjs',
          'target-auth-watch',
          'runs/target-packs/github',
          '--timeout-ms',
          '300000',
          '--interval-ms',
          '5000',
          '--format',
          'compact'
        ],
        shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--timeout-ms' '300000' '--interval-ms' '5000' '--format' 'compact'"
      }
    }),
    runner: (command, options) => {
      received = { command, options };
      return {
        status: 0,
        signal: '',
        stdout: 'status: timed-out\n',
        stderr: ''
      };
    }
  });

  assert.deepEqual(received.command.args, [
    'node',
    'src/cli.mjs',
    'target-auth-watch',
    'runs/target-packs/github',
    '--timeout-ms',
    '10000',
    '--interval-ms',
    '1000',
    '--format',
    'compact'
  ]);
  assert.equal(received.options.timeoutMs, 15000);
  assert.equal(step.monitorTimeoutMs, 10000);
  assert.equal(step.monitorIntervalMs, 1000);
  assert.match(step.stepWriteCommand.shell, /--monitor-timeout-ms' '10000/);
  assert.match(step.stepWriteCommand.shell, /--monitor-interval-ms' '1000/);
  assert.match(step.stepRunCommand.shell, /--monitor-timeout-ms' '10000/);
  assert.match(step.stepRunCommand.shell, /--monitor-interval-ms' '1000/);
  const compact = formatAgentLoopStepCompact(step);
  assert.match(compact, /^monitor_timeout_ms: 10000$/m);
  assert.match(compact, /^monitor_interval_ms: 1000$/m);
  assert.match(compact, /^step_write_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
});

test('agent loop step plans the next safe command without executing by default', async () => {
  let called = false;
  const step = await buildAgentLoopStep({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    controlStatus: controlStatus(),
    runner: () => {
      called = true;
      return { status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(called, false);
  assert.equal(step.status, 'planned');
  assert.equal(step.allowedToRun, true);
  assert.equal(step.executed, false);
  assert.equal(step.commandId, 'auth-watch');
  assert.equal(step.opensBrowserNow, false);
  assert.equal(step.startsCaptureNow, false);
  assert.equal(step.userApprovalRequiredForBackgroundStart, true);
  assert.deepEqual(step.stepWriteCommand.args, [
    'node',
    'src/cli.mjs',
    'agent-loop-step',
    '--write',
    '--out',
    'operator/agent-loop-step-latest.json',
    '--format',
    'compact'
  ]);
  assert.deepEqual(step.stepRunCommand.args, [
    'node',
    'src/cli.mjs',
    'agent-loop-step',
    '--run',
    '--write',
    '--out',
    'operator/agent-loop-step-latest.json',
    '--timeout-ms',
    '300000',
    '--format',
    'compact'
  ]);
  assert.deepEqual(step.stepStatusCommand.args, [
    'node',
    'src/cli.mjs',
    'agent-loop-step-status',
    '--in',
    'operator/agent-loop-step-latest.json',
    '--format',
    'compact'
  ]);
  const compact = formatAgentLoopStepCompact(step);
  assert.match(compact, /^status: planned$/m);
  assert.match(compact, /^allowed_to_run: yes$/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(compact, /^background_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start'/m);
  assert.match(compact, /^step_write_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^step_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
  assert.match(compact, /^step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
});

test('agent loop step refuses commands that could start capture', async () => {
  const step = await buildAgentLoopStep({
    rootDir: '/tmp/sba',
    run: true,
    controlStatus: controlStatus({
      commandId: 'target-proof-capture',
      startsCaptureNow: true,
      command: {
        args: ['node', 'src/cli.mjs', 'target-proof-capture', 'runs/target-packs/github', '--run'],
        shell: "'node' 'src/cli.mjs' 'target-proof-capture' 'runs/target-packs/github' '--run'"
      }
    }),
    runner: () => {
      throw new Error('runner must not be called');
    }
  });

  assert.equal(step.status, 'blocked');
  assert.equal(step.allowedToRun, false);
  assert.equal(step.executed, false);
  assert.equal(step.blockedReason, 'starts-capture');
  assert.equal(step.stepRunCommand, null);
  const compact = formatAgentLoopStepCompact(step);
  assert.match(compact, /^status: blocked$/m);
  assert.match(compact, /^blocked_reason: starts-capture$/m);
  assert.match(compact, /^starts_capture_now: yes$/m);
  assert.doesNotMatch(compact, /^step_run_command: /m);
});

test('agent loop step refuses auth-watch id when command target is not monitor-only auth watch', async () => {
  const step = await buildAgentLoopStep({
    rootDir: '/tmp/sba',
    run: true,
    controlStatus: controlStatus({
      commandId: 'auth-watch',
      command: {
        args: ['node', 'src/cli.mjs', 'target-handoff-resume-watch', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--format' 'compact'"
      }
    }),
    runner: () => {
      throw new Error('runner must not be called');
    }
  });

  assert.equal(step.status, 'blocked');
  assert.equal(step.allowedToRun, false);
  assert.equal(step.executed, false);
  assert.equal(step.blockedReason, 'command-target-not-allowed');
  assert.equal(step.stepRunCommand, null);
  const compact = formatAgentLoopStepCompact(step);
  assert.match(compact, /^status: blocked$/m);
  assert.match(compact, /^blocked_reason: command-target-not-allowed$/m);
  assert.match(compact, /^command_id: auth-watch$/m);
  assert.doesNotMatch(compact, /^step_run_command: /m);
});

test('agent loop step can run the monitor-only auth watch command', async () => {
  let received = null;
  const step = await buildAgentLoopStep({
    rootDir: '/tmp/sba',
    run: true,
    timeoutMs: 1234,
    controlStatus: controlStatus(),
    runner: (command, options) => {
      received = { command, options };
      return {
        status: 0,
        signal: '',
        stdout: 'status: timed-out\ncomplete: no\n',
        stderr: ''
      };
    }
  });

  assert.equal(received.command.args[2], 'target-auth-watch');
  assert.equal(received.options.cwd, '/tmp/sba');
  assert.equal(received.options.timeoutMs, 1234);
  assert.equal(step.status, 'ran');
  assert.equal(step.executed, true);
  assert.equal(step.child.exitCode, 0);
  assert.equal(step.child.stdoutLineCount, 2);
  assert.deepEqual(step.child.stdoutPreview, ['status: timed-out', 'complete: no']);
  const compact = formatAgentLoopStepCompact(step);
  assert.match(compact, /^status: ran$/m);
  assert.match(compact, /^executed: yes$/m);
  assert.match(compact, /^child_exit_code: 0$/m);
});

test('agent loop step writes result JSON only under runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-loop-step-'));
  const step = await buildAgentLoopStep({
    rootDir,
    write: true,
    out: 'operator/custom-agent-loop-step.json',
    controlStatus: controlStatus()
  });

  const expectedPath = path.join(rootDir, 'runs/operator/custom-agent-loop-step.json');
  assert.equal(step.outputPath, expectedPath);
  assert.equal(fs.existsSync(expectedPath), true);
  const saved = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  assert.equal(saved.status, 'planned');
  assert.equal(saved.secretValuesRead, false);
  assert.equal(saved.destructiveActionsIncluded, false);
  const status = buildAgentLoopStepStatus({ rootDir, in: 'operator/custom-agent-loop-step.json' });
  assert.equal(status.recommendedCommandId, 'run-agent-loop-step');
  assert.equal(status.agentSafeNextCommandId, 'agent-loop-step-run');
  assert.equal(status.agentSafeNextMayRunUnattended, true);
  assert.equal(status.agentSafeNextOpensBrowser, false);
  assert.equal(status.agentSafeNextStartsCapture, false);
  assert.equal(status.agentSafeNextReadsBrowserStorage, false);
  assert.equal(status.agentSafeNextReturnsPageContent, false);
  assert.equal(status.recommendedCommand.shell, "'node' 'src/cli.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator/custom-agent-loop-step.json' '--timeout-ms' '300000' '--format' 'compact'");
  const compact = formatAgentLoopStepStatusCompact(status);
  assert.match(compact, /^recommended_command_id: run-agent-loop-step$/m);
  assert.match(compact, /^agent_safe_next_command_id: agent-loop-step-run$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^run_command_allowed: yes$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/custom-agent-loop-step\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
  assert.match(compact, /^recommended_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/custom-agent-loop-step\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
  assert.match(compact, /^run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/custom-agent-loop-step\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
});

test('agent loop step rejects output paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-loop-step-'));
  await assert.rejects(
    buildAgentLoopStep({
      rootDir,
      write: true,
      out: '../outside.json',
      controlStatus: controlStatus()
    }),
    /invalid agent loop step output path/
  );
});

test('agent loop step status summarizes a saved step without stdout content', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-loop-step-'));
  await buildAgentLoopStep({
    rootDir,
    run: true,
    write: true,
    out: 'operator/agent-loop-step-latest.json',
    controlStatus: controlStatus(),
    runner: () => ({
      status: 0,
      signal: '',
      stdout: 'status: timed-out\nsecret-looking-token should not be returned here\n',
      stderr: ''
    })
  });

  const status = buildAgentLoopStepStatus({
    rootDir,
    staleAfterSeconds: 900
  });
  assert.equal(status.exists, true);
  assert.equal(status.stale, false);
  assert.equal(status.stepStatus, 'ran');
  assert.equal(status.executed, true);
  assert.equal(status.childExitCode, 0);
  assert.equal(status.childStdoutLines, 2);
  assert.equal(status.recommendedCommandId, 'refresh-agent-loop-step');
  assert.equal(status.agentSafeNextCommandId, 'agent-loop-step-refresh');
  assert.equal(status.agentSafeNextMayRunUnattended, true);
  assert.equal(status.recommendedCommand.shell, "'node' 'src/cli.mjs' 'agent-loop-step' '--write' '--out' 'operator/agent-loop-step-latest.json' '--format' 'compact'");
  assert.equal(JSON.stringify(status).includes('secret-looking-token'), false);
  assert.deepEqual(status.refreshCommand.args, [
    'node',
    'src/cli.mjs',
    'agent-loop-step',
    '--write',
    '--out',
    'operator/agent-loop-step-latest.json',
    '--format',
    'compact'
  ]);
  assert.deepEqual(status.runCommand.args, [
    'node',
    'src/cli.mjs',
    'agent-loop-step',
    '--run',
    '--write',
    '--out',
    'operator/agent-loop-step-latest.json',
    '--timeout-ms',
    '300000',
    '--format',
    'compact'
  ]);
  const compact = formatAgentLoopStepStatusCompact(status);
  assert.match(compact, /^status_only: yes$/m);
  assert.match(compact, /^exists: yes$/m);
  assert.match(compact, /^step_status: ran$/m);
  assert.match(compact, /^recommended_command_id: refresh-agent-loop-step$/m);
  assert.match(compact, /^agent_safe_next_command_id: agent-loop-step-refresh$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^run_command_allowed: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^recommended_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^run_command: /m);
  assert.doesNotMatch(compact, /secret-looking-token/);
});

test('agent loop step status revalidates saved run command target before recommending run', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-loop-step-'));
  const filePath = path.join(rootDir, 'runs/operator/agent-loop-step-latest.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: 'planned',
    nextAction: 'run-monitor-only-command',
    commandId: 'auth-watch',
    canRunWithoutApproval: true,
    allowedToRun: true,
    executed: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    command: {
      args: ['node', 'src/cli.mjs', 'target-handoff-resume-watch', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--format', 'compact'],
      shell: "'node' 'src/cli.mjs' 'target-handoff-resume-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--format' 'compact'"
    }
  }, null, 2)}\n`, 'utf8');

  const status = buildAgentLoopStepStatus({
    rootDir,
    staleAfterSeconds: 900
  });

  assert.equal(status.exists, true);
  assert.equal(status.stale, false);
  assert.equal(status.allowedToRun, false);
  assert.equal(status.blockedReason, 'command-target-not-allowed');
  assert.equal(status.recommendedCommandId, 'refresh-agent-loop-step');
  const compact = formatAgentLoopStepStatusCompact(status);
  assert.match(compact, /^allowed_to_run: no$/m);
  assert.match(compact, /^blocked_reason: command-target-not-allowed$/m);
  assert.match(compact, /^recommended_command_id: refresh-agent-loop-step$/m);
  assert.match(compact, /^run_command_allowed: no$/m);
  assert.doesNotMatch(compact, /^run_command: /m);
});

test('agent loop step status reports missing stale files and rejects paths outside runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-loop-step-'));
  const missing = buildAgentLoopStepStatus({ rootDir });
  assert.equal(missing.exists, false);
  assert.equal(missing.stale, true);
  assert.equal(missing.nextAction, 'refresh-agent-loop-step');
  assert.equal(missing.recommendedCommandId, 'refresh-agent-loop-step');
  assert.equal(missing.agentSafeNextCommandId, 'agent-loop-step-refresh');
  assert.equal(missing.agentSafeNextMayRunUnattended, true);
  assert.equal(missing.refreshCommand.shell, "'node' 'src/cli.mjs' 'agent-loop-step' '--write' '--out' 'operator/agent-loop-step-latest.json' '--format' 'compact'");
  assert.match(formatAgentLoopStepStatusCompact(missing), /^agent_safe_next_command_id: agent-loop-step-refresh$/m);
  assert.match(formatAgentLoopStepStatusCompact(missing), /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
  assert.match(formatAgentLoopStepStatusCompact(missing), /^recommended_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
  assert.equal(formatAgentLoopStepStatusCompact(missing).includes('run_command:'), false);
  assert.throws(
    () => buildAgentLoopStepStatus({ rootDir, in: '../outside.json' }),
    /invalid agent loop step status input path/
  );
});

test('agent loop step status preserves short monitor settings in refresh and run recommendations', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-loop-step-'));
  await buildAgentLoopStep({
    rootDir,
    write: true,
    out: 'operator/agent-loop-step-latest.json',
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000,
    controlStatus: controlStatus()
  });

  const status = buildAgentLoopStepStatus({
    rootDir,
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000
  });

  assert.equal(status.recommendedCommandId, 'run-agent-loop-step');
  assert.match(status.refreshCommand.shell, /'--monitor-timeout-ms' '10000'/);
  assert.match(status.refreshCommand.shell, /'--monitor-interval-ms' '1000'/);
  assert.match(status.runCommand.shell, /'--monitor-timeout-ms' '10000'/);
  assert.match(status.runCommand.shell, /'--monitor-interval-ms' '1000'/);
  assert.match(status.recommendedCommand.shell, /'--monitor-timeout-ms' '10000'/);
  assert.match(status.recommendedCommand.shell, /'--monitor-interval-ms' '1000'/);

  const compact = formatAgentLoopStepStatusCompact(status);
  assert.match(compact, /^monitor_timeout_ms: 10000$/m);
  assert.match(compact, /^monitor_interval_ms: 1000$/m);
  assert.match(compact, /^run_command_allowed: yes$/m);
  assert.match(compact, /^refresh_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
  assert.match(compact, /^run_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
});
