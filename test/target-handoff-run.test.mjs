import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTargetLoginCapture } from '../src/target-login-capture.mjs';
import { buildTargetHandoffResume, buildTargetHandoffResumeStatus, buildTargetHandoffResumeWatch, buildTargetHandoffRun, buildTargetHandoffStatus, formatTargetHandoffResumeCompact, formatTargetHandoffResumeMarkdown, formatTargetHandoffResumeStatusCompact, formatTargetHandoffResumeWatchCompact, formatTargetHandoffRunCompact, formatTargetHandoffRunMarkdown, formatTargetHandoffStatusCompact, formatTargetHandoffStatusMarkdown } from '../src/target-handoff-run.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTargetPack() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-handoff-run-'));
  const dir = path.join(root, 'github');
  writeJson(path.join(dir, 'target.json'), {
    schemaVersion: 1,
    target: 'github',
    origins: ['https://github.com'],
    loginUrl: 'https://github.com/login',
    pageUrl: 'https://github.com/dashboard',
    profile: 'github'
  });
  writeJson(path.join(dir, 'policy.json'), {
    allowedOrigins: ['https://github.com'],
    defaultProfile: 'github',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: path.join(dir, 'outputs'),
    profileDir: path.join(dir, 'profiles'),
    redactKeys: ['authorization', 'cookie', 'password', 'token'],
    maxEvalBytes: 12000
  });
  return dir;
}

test('target handoff run plans a structured post-login command from JSON handoff', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    dryRun: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z'
  });

  const result = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'post-login-capture',
    out: 'handoff-run.json',
    generatedAt: '2026-05-28T00:00:00.000Z'
  });

  assert.equal(result.status, 'planned');
  assert.equal(result.outputPath, path.join(targetDir, 'outputs/handoff-run.json'));
  assert.equal(JSON.parse(fs.readFileSync(result.outputPath, 'utf8')).status, 'planned');
  assert.equal(result.safeMode, true);
  assert.equal(result.destructiveActionsIncluded, false);
  assert.ok(result.availableCommands.some((item) => item.id === 'auth-check-status' && item.synthesized === false));
  assert.ok(result.availableCommands.some((item) => item.id === 'post-login-capture'));
  assert.deepEqual(result.selected.command.args.slice(0, 4), ['node', 'src/cli.mjs', 'target-proof-capture', targetDir]);
  assert.match(result.selected.command.shell, /target-proof-capture/);
  assert.match(result.selected.command.shell, /--wait-auth-status-out/);
  assert.match(result.selected.command.shell, /wait-auth-status\.json/);
  assert.match(formatTargetHandoffRunMarkdown(result), /Target Handoff Run/);
  assert.match(formatTargetHandoffRunCompact(result), /^status: planned$/m);
  assert.match(formatTargetHandoffRunCompact(result), /^run: no$/m);
  assert.match(formatTargetHandoffRunCompact(result), /^available: /m);
  assert.match(formatTargetHandoffRunCompact(result), /^command: 'node' 'src\/cli\.mjs' 'target-proof-capture'/m);
});

test('target handoff status summarizes available and synthesized commands', async () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    realExternal: true,
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Capture after login',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });

  const status = buildTargetHandoffStatus(targetDir, {
    handoff: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(status.status, 'ready');
  assert.equal(status.safeMode, true);
  assert.equal(status.destructiveActionsIncluded, false);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.realExternal, true);
  assert.equal(status.authCheckPort, '45678');
  assert.ok(status.commandCount >= 4);
  assert.ok(status.synthesizedCount >= 3);
  assert.equal(status.recommendedCommand.id, 'auth-check-status');
  assert.equal(status.agentSafeNext.id, 'auth-check-status');
  assert.equal(status.agentSafeNext.mayRunUnattended, true);
  assert.equal(status.agentSafeNext.opensBrowser, false);
  assert.equal(status.agentSafeNext.startsCapture, false);
  assert.equal(status.agentSafeNext.startsBackground, false);
  assert.equal(status.agentSafeNext.readsBrowserStorage, false);
  assert.equal(status.agentSafeNext.returnsPageContent, false);
  assert.match(status.agentSafeNext.command.shell, /target-auth-check/);
  assert.match(status.agentSafeNext.command.shell, /'--format' 'compact'/);
  assert.ok(status.availableCommands.some((item) => item.id === 'secret-run-plan' && item.synthesized));
  const compact = formatTargetHandoffStatusCompact(status);
  assert.match(compact, /^recommended_command: auth-check-status$/m);
  assert.match(compact, /auth-check-status:synthesized/);
  assert.match(compact, /^agent_safe_next_command_id: auth-check-status$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-auth-check'.*'--format' 'compact'$/m);
  assert.match(formatTargetHandoffStatusMarkdown(status), /Available Commands/);
  assert.match(formatTargetHandoffStatusMarkdown(status), /Recommended Command/);
});

test('target handoff resume status reads saved handoff progress without browser work', () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    realExternal: true,
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Capture after login',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });
  writeJson(path.join(targetDir, 'outputs/handoff-resume-latest.json'), {
    schemaVersion: 1,
    generatedAt: '2026-05-30T00:00:00.000Z',
    target: 'github',
    status: 'waiting-for-login',
    secretValuesRead: false,
    destructiveActionsIncluded: false
  });
  writeJson(path.join(targetDir, 'outputs/handoff-resume-wait-auth-status.json'), {
    schemaVersion: 1,
    generatedAt: '2026-05-30T00:01:00.000Z',
    target: 'github',
    status: 'waiting',
    enabled: true,
    attempts: [{ attempt: 1, ok: false }]
  });
  writeJson(path.join(targetDir, 'outputs/auth-watch-status.json'), {
    schemaVersion: 1,
    generatedAt: '2026-05-30T00:02:00.000Z',
    target: 'github',
    status: 'waiting',
    attempts: [{ attempt: 1, ok: false }, { attempt: 2, ok: false }]
  });

  const status = buildTargetHandoffResumeStatus(targetDir, {
    generatedAt: '2026-05-30T00:03:00.000Z',
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.statusOnly, true);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.opensBrowserNow, false);
  assert.equal(status.startsCaptureNow, false);
  assert.equal(status.status, 'waiting-for-login');
  assert.equal(status.waitAuth.attempts, 1);
  assert.equal(status.authWatch.attempts, 2);
  assert.equal(status.recommendedCommand.id, 'monitor-auth');
  assert.equal(status.recommendedCommand.requiresOperatorApproval, false);
  assert.equal(status.recommendedCommand.mayRunUnattended, false);
  assert.equal(status.recommendedCommand.agentRunCommand, null);
  assert.equal(status.recommendedCommand.operatorApprovalCommand, null);
  assert.match(status.recommendedCommand.watchRunCommand.shell, /target-handoff-resume-watch/);
  assert.match(status.recommendedCommand.watchRunCommand.shell, /--run/);
  assert.match(status.recommendedCommand.command.shell, /target-auth-watch/);
  assert.match(status.recommendedCommand.command.shell, /'--timeout-ms' '10000'/);
  assert.match(status.recommendedCommand.command.shell, /'--interval-ms' '1000'/);
  assert.equal(status.agentSafeNext.id, 'target-handoff-resume-watch');
  assert.equal(status.agentSafeNext.mayRunUnattended, true);
  assert.equal(status.agentSafeNext.opensBrowser, false);
  assert.equal(status.agentSafeNext.startsCapture, false);
  assert.equal(status.agentSafeNext.startsBackground, false);
  assert.equal(status.agentSafeNext.readsBrowserStorage, false);
  assert.equal(status.agentSafeNext.returnsPageContent, false);
  assert.match(status.agentSafeNext.command.shell, /target-handoff-resume-watch/);
  assert.match(status.agentSafeNext.command.shell, /--run/);
  assert.match(status.capturePlanCommand.shell, /target-proof-capture/);
  assert.match(status.capturePlanCommand.shell, /'--auth-check-port' '45678'/);
  assert.match(status.capturePlanCommand.shell, /handoff-resume-wait-auth-status\.json/);
  assert.match(status.capturePlanCommand.shell, /'--completion-audit'/);

  const compact = formatTargetHandoffResumeStatusCompact(status);
  assert.match(compact, /^status_only: yes$/m);
  assert.match(compact, /^secret_values_read: no$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^recommended_command: monitor-auth$/m);
  assert.match(compact, /^recommended_opens_browser: no$/m);
  assert.match(compact, /^recommended_starts_capture: no$/m);
  assert.match(compact, /^recommended_requires_operator_approval: no$/m);
  assert.match(compact, /^recommended_may_run_unattended: no$/m);
  assert.match(compact, /^recommended_agent_run_command: none$/m);
  assert.match(compact, /^recommended_operator_approval_command: none$/m);
  assert.match(compact, /^recommended_watch_run_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch'/m);
  assert.match(compact, /^agent_safe_next_command_id: target-handoff-resume-watch$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch'/m);
  assert.match(compact, /^capture_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-capture'/m);
});

test('target handoff resume status recommends no-open capture after saved auth is ready', () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    realExternal: true,
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Capture after login',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });
  writeJson(path.join(targetDir, 'outputs/handoff-resume-wait-auth-status.json'), {
    schemaVersion: 1,
    generatedAt: '2026-05-30T00:01:00.000Z',
    target: 'github',
    status: 'authenticated',
    enabled: true,
    attempts: [{ attempt: 1, ok: true }]
  });

  const status = buildTargetHandoffResumeStatus(targetDir, {
    generatedAt: '2026-05-30T00:03:00.000Z'
  });

  assert.equal(status.status, 'auth-ready');
  assert.equal(status.latestAuthOk, true);
  assert.equal(status.recommendedCommand.id, 'resume-capture');
  assert.equal(status.recommendedCommand.opensBrowser, false);
  assert.equal(status.recommendedCommand.startsCapture, true);
  assert.equal(status.recommendedCommand.requiresOperatorApproval, true);
  assert.equal(status.recommendedCommand.mayRunUnattended, false);
  assert.equal(status.recommendedCommand.agentRunCommand, null);
  assert.match(status.recommendedCommand.operatorApprovalCommand.shell, /target-handoff-resume/);
  assert.match(status.recommendedCommand.command.shell, /target-handoff-resume/);
  assert.doesNotMatch(status.recommendedCommand.command.shell, /--open-login/);
  assert.equal(status.agentSafeNext.id, 'capture-plan');
  assert.equal(status.agentSafeNext.mayRunUnattended, true);
  assert.equal(status.agentSafeNext.opensBrowser, false);
  assert.equal(status.agentSafeNext.startsCapture, false);
  assert.equal(status.agentSafeNext.blockedReason, 'operator-approval-required');
  assert.match(status.agentSafeNext.command.shell, /target-proof-capture/);
  const compact = formatTargetHandoffResumeStatusCompact(status);
  assert.match(compact, /^recommended_command: resume-capture$/m);
  assert.match(compact, /^recommended_opens_browser: no$/m);
  assert.match(compact, /^recommended_starts_capture: yes$/m);
  assert.match(compact, /^recommended_requires_operator_approval: yes$/m);
  assert.match(compact, /^recommended_may_run_unattended: no$/m);
  assert.match(compact, /^recommended_agent_run_command: none$/m);
  assert.match(compact, /^recommended_operator_approval_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  assert.match(compact, /^agent_safe_next_command_id: capture-plan$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_blocked_reason: operator-approval-required$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-proof-capture'/m);
  assert.doesNotMatch(compact, /--open-login/);
});

test('target handoff resume watch monitors auth and captures only after saved auth is ready', async () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    realExternal: true,
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Capture after login',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });
  writeJson(path.join(targetDir, 'outputs/handoff-resume-latest.json'), {
    schemaVersion: 1,
    generatedAt: '2026-05-30T00:00:00.000Z',
    target: 'github',
    status: 'waiting-for-login'
  });

  const monitorCalls = [];
  const monitor = await buildTargetHandoffResumeWatch(targetDir, {
    run: true,
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000,
    runner: (args) => {
      monitorCalls.push(args);
      return { ok: true, status: 0, stdout: 'status: waiting\n', stderr: '' };
    }
  });
  assert.equal(monitor.selectedCommand.id, 'monitor-auth');
  assert.equal(monitor.selectedCommand.startsCapture, false);
  assert.equal(monitor.selectedCommandAvailable, true);
  assert.equal(monitor.selectedCommandBlockedReason, 'none');
  assert.equal(monitor.selectedRequiresOperatorApproval, false);
  assert.equal(monitor.selectedMayRunUnattended, true);
  assert.match(monitor.selectedAgentRunCommand.shell, /target-auth-watch/);
  assert.equal(monitor.selectedOperatorApprovalCommand, null);
  assert.equal(monitor.operatorOkRequired, false);
  assert.equal(monitor.startsCaptureNow, false);
  assert.deepEqual(monitorCalls[0].slice(0, 3), ['node', 'src/cli.mjs', 'target-auth-watch']);
  assert.deepEqual(monitorCalls[0].slice(monitorCalls[0].indexOf('--timeout-ms'), monitorCalls[0].indexOf('--timeout-ms') + 2), ['--timeout-ms', '10000']);
  assert.deepEqual(monitorCalls[0].slice(monitorCalls[0].indexOf('--interval-ms'), monitorCalls[0].indexOf('--interval-ms') + 2), ['--interval-ms', '1000']);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^selected_starts_capture: no$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^operator_ok_required: no$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^auth_check_port: 45678$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^auth_check_port_reachable: unknown$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^selected_command_available: yes$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^selected_command_blocked_reason: none$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^selected_requires_operator_approval: no$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^selected_may_run_unattended: yes$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^selected_agent_run_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^selected_operator_approval_command: none$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(monitor), /^starts_capture_now: no$/m);

  writeJson(path.join(targetDir, 'outputs/handoff-resume-wait-auth-status.json'), {
    schemaVersion: 1,
    generatedAt: '2026-05-30T00:01:00.000Z',
    target: 'github',
    status: 'authenticated',
    attempts: [{ attempt: 1, ok: true }]
  });
  const blockedCaptureCalls = [];
  const blockedCapture = await buildTargetHandoffResumeWatch(targetDir, {
    run: true,
    runner: (args) => {
      blockedCaptureCalls.push(args);
      return { ok: true, status: 0, stdout: 'status: completed\n', stderr: '' };
    }
  });
  assert.equal(blockedCapture.status, 'blocked');
  assert.equal(blockedCapture.operatorOkRequired, true);
  assert.equal(blockedCapture.operatorOkAccepted, false);
  assert.equal(blockedCapture.startsCaptureNow, false);
  assert.equal(blockedCapture.selectedCommand.id, 'resume-capture');
  assert.equal(blockedCapture.selectedRequiresOperatorApproval, true);
  assert.equal(blockedCapture.selectedMayRunUnattended, false);
  assert.equal(blockedCapture.selectedAgentRunCommand, null);
  assert.match(blockedCapture.selectedOperatorApprovalCommand.shell, /target-handoff-resume/);
  assert.deepEqual(blockedCaptureCalls, []);
  assert.match(formatTargetHandoffResumeWatchCompact(blockedCapture), /^operator_ok_required: yes$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(blockedCapture), /^operator_ok_accepted: no$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(blockedCapture), /^selected_requires_operator_approval: yes$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(blockedCapture), /^selected_may_run_unattended: no$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(blockedCapture), /^selected_agent_run_command: none$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(blockedCapture), /^selected_operator_approval_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  assert.match(formatTargetHandoffResumeWatchCompact(blockedCapture), /^starts_capture_now: no$/m);

  const captureCalls = [];
  const capture = await buildTargetHandoffResumeWatch(targetDir, {
    run: true,
    operatorOk: 'OK',
    runner: (args) => {
      captureCalls.push(args);
      return { ok: true, status: 0, stdout: 'status: completed\n', stderr: '' };
    }
  });
  assert.equal(capture.selectedCommand.id, 'resume-capture');
  assert.equal(capture.selectedCommand.startsCapture, true);
  assert.equal(capture.operatorOkRequired, true);
  assert.equal(capture.operatorOkAccepted, true);
  assert.equal(capture.startsCaptureNow, true);
  assert.deepEqual(captureCalls[0].slice(0, 3), ['node', 'src/cli.mjs', 'target-handoff-resume']);
  assert.equal(captureCalls[0].includes('--open-login'), false);
  assert.match(formatTargetHandoffResumeWatchCompact(capture), /^selected_starts_capture: yes$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(capture), /^operator_ok_accepted: yes$/m);
  assert.match(formatTargetHandoffResumeWatchCompact(capture), /^starts_capture_now: yes$/m);
});

test('target handoff resume watch blocks stale auth-check ports before running monitor', async () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    realExternal: true,
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Capture after login',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });
  writeJson(path.join(targetDir, 'outputs/handoff-resume-latest.json'), {
    schemaVersion: 1,
    generatedAt: '2026-05-30T00:00:00.000Z',
    target: 'github',
    status: 'waiting-for-login'
  });

  const calls = [];
  const watch = await buildTargetHandoffResumeWatch(targetDir, {
    run: true,
    authCheckPortReachable: false,
    runner: (args) => {
      calls.push(args);
      return { ok: true, status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(watch.status, 'blocked');
  assert.equal(watch.selectedCommand.id, 'monitor-auth');
  assert.equal(watch.selectedCommandAvailable, false);
  assert.equal(watch.selectedCommandBlockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(watch.selectedRequiresOperatorApproval, false);
  assert.equal(watch.selectedMayRunUnattended, false);
  assert.equal(watch.selectedAgentRunCommand, null);
  assert.equal(watch.selectedOperatorApprovalCommand, null);
  assert.equal(watch.authCheckPortReachable, false);
  assert.deepEqual(calls, []);
  const compact = formatTargetHandoffResumeWatchCompact(watch);
  assert.match(compact, /^auth_check_port: 45678$/m);
  assert.match(compact, /^auth_check_port_reachable: no$/m);
  assert.match(compact, /^selected_command_available: no$/m);
  assert.match(compact, /^selected_command_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^selected_requires_operator_approval: no$/m);
  assert.match(compact, /^selected_may_run_unattended: no$/m);
  assert.match(compact, /^selected_agent_run_command: none$/m);
  assert.match(compact, /^selected_operator_approval_command: none$/m);
  assert.match(compact, /^error: Saved handoff auth-check port is not reachable/m);
});

test('target handoff run executes selected command with injectable runner', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    dryRun: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z'
  });
  const calls = [];

  const result = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'proof-plan-status',
    run: true,
    runner: (args) => {
      calls.push(args);
      return {
        ok: true,
        status: 0,
        stdout: '# proof plan',
        stderr: ''
      };
    }
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.result.ok, true);
  assert.deepEqual(calls[0].slice(0, 3), ['node', 'src/cli.mjs', 'target-proof-plan']);
  assert.match(formatTargetHandoffRunMarkdown(result), /OK: yes/);
  assert.match(formatTargetHandoffRunMarkdown(result), /Available Commands/);
});

test('target handoff run allows read-only status commands generated by login handoff', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    openOnly: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => ({
      ok: true,
      url,
      profileDir,
      options,
      port: 45678
    }),
    captureBuilder: async () => {
      throw new Error('capture should not run in open-only mode');
    }
  });

  const calls = [];
  const authCheck = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'auth-check-status',
    run: true,
    runner: (args) => {
      calls.push(args);
      return { ok: true, status: 0, stdout: '# auth check', stderr: '' };
    }
  });
  assert.equal(authCheck.status, 'completed');
  assert.deepEqual(calls.at(-1).slice(0, 3), ['node', 'src/cli.mjs', 'target-auth-check']);
  assert.ok(calls.at(-1).includes('--cdp-port'));
  assert.ok(calls.at(-1).includes('45678'));

  const control = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'control-status'
  });
  assert.equal(control.status, 'planned');
  assert.deepEqual(control.selected.command.args.slice(0, 3), ['node', 'src/cli.mjs', 'control-status']);

  const secret = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'secret-run-plan'
  });
  assert.equal(secret.status, 'planned');
  assert.deepEqual(secret.selected.command.args.slice(0, 3), ['node', 'src/cli.mjs', 'secret-run-plan']);
  assert.ok(secret.selected.command.args.includes('--target-dir'));
  assert.ok(secret.selected.command.args.includes(targetDir));
});

test('target handoff run treats child OK no output as failed even with zero exit', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    openOnly: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => ({
      ok: true,
      url,
      profileDir,
      options,
      port: 45678
    }),
    captureBuilder: async () => {
      throw new Error('capture should not run in open-only mode');
    }
  });

  const result = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'auth-check-status',
    run: true,
    runner: () => ({
      ok: true,
      status: 0,
      stdout: '# Secure Browser Agent Target Auth Check\n\nOK: no\n',
      stderr: ''
    })
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.result.ok, false);
  assert.equal(result.result.childStatus, 'not-ok');
  assert.equal(result.result.childOk, false);
  assert.match(formatTargetHandoffRunCompact(result), /^child_ok: no$/m);
  assert.match(formatTargetHandoffRunMarkdown(result), /Child OK: no/);
});

test('target handoff resume waits for login instead of capturing when auth check is not ok', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    openOnly: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => ({
      ok: true,
      url,
      profileDir,
      options,
      port: 45678
    }),
    captureBuilder: async () => {
      throw new Error('capture should not run in open-only mode');
    }
  });
  const calls = [];

  const result = await buildTargetHandoffResume(targetDir, {
    handoff: 'operator-handoff.json',
    run: true,
    runner: (args) => {
      calls.push(args);
      return {
        ok: true,
        status: 0,
        stdout: '# Secure Browser Agent Target Auth Check\n\nOK: no\nFinal URL: https://github.com/login\nTitle: Sign in to GitHub\n\n## Signals\n\n- Same origin: yes\n- Login-like: yes\n',
        stderr: ''
      };
    }
  });

  assert.equal(result.status, 'waiting-for-login');
  assert.equal(result.authCheck.status, 'failed');
  assert.equal(result.authCheck.result.finalUrl, 'https://github.com/login');
  assert.equal(result.authCheck.result.title, 'Sign in to GitHub');
  assert.equal(result.authCheck.result.loginLike, true);
  assert.equal(result.authCheck.result.sameOrigin, true);
  assert.equal(result.capture, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 3), ['node', 'src/cli.mjs', 'target-auth-check']);
  assert.equal(result.nextAction.id, 'handoff-resume-wait');
  assert.match(result.nextAction.command.shell, /target-handoff-resume/);
  assert.match(result.nextAction.command.shell, /--open-login/);
  assert.match(result.nextAction.command.shell, /--wait-auth/);
  const compact = formatTargetHandoffResumeCompact(result);
  assert.match(compact, /^status: waiting-for-login$/m);
  assert.match(compact, /^auth_child_ok: no$/m);
  assert.match(compact, /^auth_login_like: yes$/m);
  assert.match(compact, /^auth_final_url: \[redacted\]$/m);
  assert.match(compact, /^auth_title: \[redacted\]$/m);
  assert.doesNotMatch(compact, /https:\/\/github\.com\/login/);
  assert.doesNotMatch(compact, /Sign in to GitHub/);
  assert.match(formatTargetHandoffResumeMarkdown(result), /Target Handoff Resume/);
});

test('target handoff resume can wait for auth without starting capture too early', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    openOnly: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => ({
      ok: true,
      url,
      profileDir,
      options,
      port: 45678
    }),
    captureBuilder: async () => {
      throw new Error('capture should not run in open-only mode');
    }
  });
  const calls = [];

  const result = await buildTargetHandoffResume(targetDir, {
    handoff: 'operator-handoff.json',
    run: true,
    waitAuth: true,
    waitAuthTimeoutMs: 1,
    waitAuthIntervalMs: 1,
    waitAuthStatusOut: 'handoff-resume-wait-auth-status.json',
    sleep: async () => new Promise((resolve) => setTimeout(resolve, 2)),
    runner: (args) => {
      calls.push(args);
      return {
        ok: true,
        status: 0,
        stdout: '# Secure Browser Agent Target Auth Check\n\nOK: no\nFinal URL: https://github.com/login\nTitle: Sign in to GitHub\n\n## Signals\n\n- Same origin: yes\n- Login-like: yes\n',
        stderr: ''
      };
    }
  });

  assert.equal(result.status, 'waiting-for-login');
  assert.equal(result.capture, null);
  assert.equal(result.waitAuth.status, 'timed-out');
  assert.equal(result.waitAuth.attempts.length, 1);
  assert.equal(result.waitAuth.attempts[0].childStatus, 'not-ok');
  assert.equal(result.waitAuth.attempts[0].finalUrl, 'https://github.com/login');
  assert.equal(result.waitAuth.attempts[0].title, 'Sign in to GitHub');
  assert.equal(result.waitAuth.attempts[0].loginLike, true);
  assert.equal(result.waitAuth.attempts[0].sameOrigin, true);
  assert.equal(result.nextAction.id, 'handoff-resume-wait');
  assert.match(result.nextAction.command.shell, /handoff-resume-wait-auth-status\.json/);
  assert.match(result.waitAuth.outputPath, /handoff-resume-wait-auth-status\.json$/);
  assert.equal(JSON.parse(fs.readFileSync(result.waitAuth.outputPath, 'utf8')).status, 'timed-out');
  assert.deepEqual(calls[0].slice(0, 3), ['node', 'src/cli.mjs', 'target-auth-check']);
  assert.match(formatTargetHandoffResumeCompact(result), /^wait_auth: timed-out$/m);
  assert.match(formatTargetHandoffResumeCompact(result), /^wait_auth_attempts: 1$/m);
  assert.match(formatTargetHandoffResumeMarkdown(result), /Wait auth: timed-out/);
});

test('target handoff resume can open the login browser before waiting for auth', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    openOnly: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => ({
      ok: true,
      url,
      profileDir,
      options,
      port: 45678
    }),
    captureBuilder: async () => {
      throw new Error('capture should not run in open-only mode');
    }
  });
  const calls = [];
  const opened = [];

  const result = await buildTargetHandoffResume(targetDir, {
    handoff: 'operator-handoff.json',
    run: true,
    openLogin: true,
    waitAuth: true,
    waitAuthTimeoutMs: 1,
    waitAuthIntervalMs: 1,
    waitAuthStatusOut: 'handoff-resume-wait-auth-status.json',
    sleep: async () => new Promise((resolve) => setTimeout(resolve, 2)),
    opener: async (url, profileDir, options) => {
      opened.push({ url, profileDir, options });
      return {
        ok: true,
        url,
        profileDir,
        options,
        port: 56789
      };
    },
    runner: (args) => {
      calls.push(args);
      return {
        ok: true,
        status: 0,
        stdout: '# Secure Browser Agent Target Auth Check\n\nOK: no\n',
        stderr: ''
      };
    }
  });

  assert.equal(result.status, 'waiting-for-login');
  assert.equal(result.loginOpen.status, 'login-opened');
  assert.equal(result.loginOpen.login.port, 56789);
  assert.equal(result.capture, null);
  assert.equal(result.waitAuth.status, 'timed-out');
  assert.equal(opened.length, 1);
  assert.ok(calls.length >= 2);
  assert.equal(calls.every((args) => args[2] === 'target-auth-check'), true);
  assert.ok(calls[0].includes('45678'));
  assert.ok(calls[1].includes('56789'));
  const refreshedHandoff = JSON.parse(fs.readFileSync(path.join(targetDir, 'outputs/operator-handoff.json'), 'utf8'));
  const postLogin = refreshedHandoff.handoff.commands.find((item) => item.id === 'post-login-capture');
  assert.equal(postLogin.args.includes('--wait-auth-timeout-ms'), false);
  assert.equal(postLogin.args.includes('--wait-auth-interval-ms'), false);
  assert.equal(postLogin.args[postLogin.args.indexOf('--wait-auth-status-out') + 1], 'wait-auth-status.json');
  assert.ok(postLogin.args.includes('--completion-audit'));
  assert.match(formatTargetHandoffResumeCompact(result), /^login_open: login-opened$/m);
  assert.match(formatTargetHandoffResumeCompact(result), /^login_open_port: 56789$/m);
  assert.match(formatTargetHandoffResumeMarkdown(result), /Login Open/);
});

test('target handoff resume captures after auth check succeeds', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    openOnly: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => ({
      ok: true,
      url,
      profileDir,
      options,
      port: 45678
    }),
    captureBuilder: async () => {
      throw new Error('capture should not run in open-only mode');
    }
  });
  const calls = [];

  const result = await buildTargetHandoffResume(targetDir, {
    handoff: 'operator-handoff.json',
    run: true,
    runner: (args) => {
      calls.push(args);
      return {
        ok: true,
        status: 0,
        stdout: args[2] === 'target-auth-check'
          ? '# Secure Browser Agent Target Auth Check\n\nOK: yes\n'
          : '# Secure Browser Agent Target Proof Capture\n\nStatus: completed\n',
        stderr: ''
      };
    },
    authPreflight: async () => ({
      ok: true,
      kind: 'target-auth-check',
      loginLike: false
    })
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.authCheck.status, 'completed');
  assert.equal(result.capture.status, 'completed');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].slice(0, 3), ['node', 'src/cli.mjs', 'target-auth-check']);
  assert.deepEqual(calls[1].slice(0, 3), ['node', 'src/cli.mjs', 'target-proof-capture']);
  assert.match(formatTargetHandoffResumeCompact(result), /^capture_status: completed$/m);
});

test('target handoff resume wait-auth captures after a later auth check succeeds', async () => {
  const targetDir = writeTargetPack();
  await buildTargetLoginCapture(targetDir, {
    realExternal: true,
    openOnly: true,
    handoffOut: 'operator-handoff.json',
    generatedAt: '2026-05-28T00:00:00.000Z',
    opener: async (url, profileDir, options) => ({
      ok: true,
      url,
      profileDir,
      options,
      port: 45678
    }),
    captureBuilder: async () => {
      throw new Error('capture should not run in open-only mode');
    }
  });
  const calls = [];
  let authChecks = 0;

  const result = await buildTargetHandoffResume(targetDir, {
    handoff: 'operator-handoff.json',
    run: true,
    waitAuth: true,
    waitAuthTimeoutMs: 100,
    waitAuthIntervalMs: 1,
    sleep: async () => {},
    runner: (args) => {
      calls.push(args);
      if (args[2] === 'target-auth-check') {
        authChecks += 1;
        return {
          ok: true,
          status: 0,
          stdout: authChecks === 1
            ? '# Secure Browser Agent Target Auth Check\n\nOK: no\n'
            : '# Secure Browser Agent Target Auth Check\n\nOK: yes\n',
          stderr: ''
        };
      }
      return {
        ok: true,
        status: 0,
        stdout: '# Secure Browser Agent Target Proof Capture\n\nStatus: completed\n',
        stderr: ''
      };
    },
    authPreflight: async () => ({
      ok: true,
      kind: 'target-auth-check',
      loginLike: false
    })
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.waitAuth.status, 'authenticated');
  assert.equal(result.waitAuth.attempts.length, 2);
  assert.equal(result.capture.status, 'completed');
  assert.deepEqual(calls.map((args) => args[2]), ['target-auth-check', 'target-auth-check', 'target-proof-capture']);
  assert.match(formatTargetHandoffResumeCompact(result), /^wait_auth: authenticated$/m);
  assert.match(formatTargetHandoffResumeCompact(result), /^capture_status: completed$/m);
});

test('target handoff run synthesizes read-only status commands for stale handoff files', async () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    realExternal: true,
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Wait for auth-check and capture proof artifacts',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--wait-auth-status-out',
            'wait-auth-status.json',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        },
        {
          id: 'objective-next',
          title: 'Show the next required action',
          args: ['node', 'src/cli.mjs', 'objective-next', '--format', 'markdown']
        }
      ]
    }
  });

  const authCheck = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'auth-check-status'
  });
  assert.equal(authCheck.status, 'planned');
  assert.equal(authCheck.selected.synthesized, true);
  assert.ok(authCheck.availableCommands.some((item) => item.id === 'auth-check-status' && item.synthesized === true));
  assert.deepEqual(authCheck.selected.command.args.slice(0, 3), ['node', 'src/cli.mjs', 'target-auth-check']);
  assert.ok(authCheck.selected.command.args.includes('--cdp-port'));
  assert.ok(authCheck.selected.command.args.includes('45678'));
  assert.match(formatTargetHandoffRunCompact(authCheck), /^synthesized: yes$/m);
  assert.match(formatTargetHandoffRunCompact(authCheck), /^available: /m);
  assert.match(formatTargetHandoffRunMarkdown(authCheck), /Synthesized: yes/);

  const control = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'control-status'
  });
  assert.equal(control.selected.synthesized, true);
  assert.deepEqual(control.selected.command.args, ['node', 'src/cli.mjs', 'control-status', '--format', 'compact']);

  const secret = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'secret-run-plan'
  });
  assert.equal(secret.selected.synthesized, true);
  assert.deepEqual(secret.selected.command.args.slice(0, 3), ['node', 'src/cli.mjs', 'secret-run-plan']);
  assert.ok(secret.selected.command.args.includes(targetDir));
});

test('target handoff run blocks post-login capture when auth preflight still sees login', async () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Capture after login',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });
  let runnerCalled = false;

  const result = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'post-login-capture',
    run: true,
    authPreflight: async () => ({
      ok: false,
      kind: 'target-auth-check',
      targetDir,
      cdpPort: '45678',
      finalUrl: 'https://github.com/login',
      loginLike: true,
      blocker: 'Auth preflight failed: still login.'
    }),
    runner: () => {
      runnerCalled = true;
      return { ok: true, status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(runnerCalled, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.readyToRun, false);
  assert.equal(result.authPreflight.ok, false);
  assert.match(result.selected.command.shell, /--wait-auth-status-out/);
  assert.match(result.selected.command.shell, /wait-auth-status\.json/);
  assert.deepEqual(result.blockers, ['Auth preflight failed: still login.']);
  assert.equal(result.nextAction.id, 'login-capture-wait');
  assert.match(result.nextAction.command.shell, /target-login-capture/);
  assert.match(result.nextAction.command.shell, /--wait-auth-status-out/);
  assert.match(result.nextAction.command.shell, /wait-auth-status\.json/);
  const markdown = formatTargetHandoffRunMarkdown(result);
  assert.match(markdown, /Auth Preflight/);
  assert.match(markdown, /OK: no/);
  assert.match(markdown, /Final URL: \[redacted\]/);
  assert.doesNotMatch(markdown, /https:\/\/github\.com\/login/);
  assert.match(markdown, /Next Action/);
  assert.match(markdown, /login-capture-wait/);
});

test('target handoff run executes post-login capture when auth preflight passes', async () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Capture after login',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });
  const calls = [];

  const result = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'post-login-capture',
    run: true,
    authPreflight: async () => ({
      ok: true,
      kind: 'target-auth-check',
      targetDir,
      cdpPort: '45678',
      finalUrl: 'https://github.com/dashboard',
      title: 'GitHub Dashboard',
      loginLike: false
    }),
    runner: (args) => {
      calls.push(args);
      return {
        ok: true,
        status: 0,
        stdout: '# capture\nFinal URL: https://github.com/dashboard\nTitle: GitHub Dashboard\n',
        stderr: ''
      };
    }
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.authPreflight.ok, true);
  assert.deepEqual(calls[0].slice(0, 3), ['node', 'src/cli.mjs', 'target-proof-capture']);
  assert.ok(calls[0].includes('--wait-auth-status-out'));
  assert.ok(calls[0].includes('wait-auth-status.json'));
  const markdown = formatTargetHandoffRunMarkdown(result);
  assert.match(markdown, /Auth Preflight/);
  assert.match(markdown, /Final URL: \[redacted\]/);
  assert.match(markdown, /Title: \[redacted\]/);
  assert.match(markdown, /Stdout tail: # capture \| Final URL: \[redacted\] \| Title: \[redacted\]/);
  assert.doesNotMatch(markdown, /https:\/\/github\.com\/dashboard/);
  assert.doesNotMatch(markdown, /GitHub Dashboard/);
});

test('target handoff run treats incomplete child status as failed even with zero exit', async () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    target: 'github',
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Capture after login',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            targetDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });

  const result = await buildTargetHandoffRun(targetDir, {
    handoff: 'operator-handoff.json',
    command: 'post-login-capture',
    run: true,
    authPreflight: async () => ({
      ok: true,
      kind: 'target-auth-check',
      targetDir,
      cdpPort: '45678',
      finalUrl: 'https://github.com/dashboard',
      loginLike: false
    }),
    runner: () => ({
      ok: true,
      status: 0,
      stdout: '# Secure Browser Agent Target Proof Capture\n\nStatus: timed-out\n',
      stderr: ''
    })
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.result.ok, false);
  assert.equal(result.result.childStatus, 'timed-out');
  assert.match(formatTargetHandoffRunMarkdown(result), /Child status: timed-out/);
  const compact = formatTargetHandoffRunCompact(result);
  assert.match(compact, /^status: failed$/m);
  assert.match(compact, /^result_ok: no$/m);
  assert.match(compact, /^child_status: timed-out$/m);
});

test('target handoff run rejects shell-only and disallowed handoff commands', async () => {
  const targetDir = writeTargetPack();
  writeJson(path.join(targetDir, 'outputs/operator-handoff.json'), {
    schemaVersion: 1,
    handoff: {
      commands: [
        { id: 'shell-only', shell: 'node src/cli.mjs target-proof-plan runs/target-packs/github' },
        { id: 'bad', args: ['node', 'src/cli.mjs', 'target-login-capture', targetDir] }
      ]
    }
  });

  await assert.rejects(
    () => buildTargetHandoffRun(targetDir, { command: 'shell-only' }),
    /missing structured args/
  );
  await assert.rejects(
    () => buildTargetHandoffRun(targetDir, { command: 'bad' }),
    /not allowed/
  );
});
