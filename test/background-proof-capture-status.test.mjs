import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackgroundProofCaptureStatus, formatBackgroundProofCaptureStatusCompact, formatBackgroundProofCaptureStatusMarkdown } from '../src/background-proof-capture-status.mjs';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function makePlan(rootDir) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    planOnly: true,
    target: 'github',
    status: 'incomplete',
    complete: false,
    captureBlocked: true,
    nextArtifactAction: 'wait-auth-then-capture-proof',
    nextArtifactBlocker: 'auth-check-not-ok',
    missingArtifactCount: 6,
    missingArtifacts: [],
    paths: {
      monitorLogPath: 'runs/operator/background-auth-monitor.log',
      monitorPidPath: 'runs/operator/background-auth-monitor.pid',
      captureLogPath: 'runs/operator/background-proof-capture.log',
      capturePidPath: 'runs/operator/background-proof-capture.pid'
    },
    phases: {
      monitorAuth: {
        backgroundCommand: { shell: 'nohup monitor' },
        command: command(['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--format', 'compact'])
      },
      waitAuthThenCapture: {
        command: command(['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--open-login', '--wait-auth'])
      },
      backgroundWaitAuthThenCaptureNoOpen: {
        backgroundCommand: { shell: "mkdir -p 'runs/operator' && nohup 'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--wait-auth' > 'runs/operator/background-proof-capture.log' 2>&1 & echo $! > 'runs/operator/background-proof-capture.pid'" },
        command: command(['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--wait-auth'])
      }
    }
  };
}

test('background proof capture status reads pids logs and target output summaries', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-bg-status-'));
  fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'runs/target-packs/github/outputs'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'runs/operator/background-auth-monitor.pid'), `${process.pid}\n`);
  fs.writeFileSync(path.join(rootDir, 'runs/operator/background-auth-monitor.log'), 'status: waiting\nurl: https://example.com/?token=secret-value\n');
  fs.writeFileSync(path.join(rootDir, 'runs/target-packs/github/outputs/auth-watch-status.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: 'waiting',
    authCheck: {
      ok: false,
      loginLike: true,
      finalUrl: 'https://github.com/login'
    }
  }));
  fs.writeFileSync(path.join(rootDir, 'runs/target-packs/github/outputs/handoff-resume-wait-auth-status.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: 'waiting',
    enabled: true,
    attempts: [
      {
        attempt: 1,
        authCheckOk: false,
        loginLike: true,
        childStatus: 'waiting-for-login'
      }
    ]
  }));
  fs.writeFileSync(path.join(rootDir, 'runs/target-packs/github/outputs/handoff-resume-latest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: 'waiting-for-login'
  }));

  const status = await buildBackgroundProofCaptureStatus({
    rootDir,
    generatedAt: new Date().toISOString(),
    plan: makePlan(rootDir),
    maxLogLines: 2
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.statusOnly, true);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.opensBrowserNow, false);
  assert.equal(status.startsCaptureNow, false);
  assert.equal(status.targetDir, 'runs/target-packs/github');
  assert.equal(status.processes.monitor.exists, true);
  assert.equal(status.processes.monitor.running, true);
  assert.equal(status.processes.capture.exists, false);
  assert.equal(status.logs.monitor.exists, true);
  assert.equal(status.logs.monitor.lineCount, 2);
  assert.match(status.logs.monitor.lastLine, /token=\[redacted\]/);
  assert.equal(status.targetOutputs.authWatchStatus.exists, true);
  assert.equal(status.targetOutputs.authWatchStatus.status, 'waiting');
  assert.equal(status.targetOutputs.authWatchStatus.ok, false);
  assert.equal(status.targetOutputs.authWatchStatus.loginLike, true);
  assert.equal(status.targetOutputs.handoffWaitAuthStatus.active, true);
  assert.equal(status.targetOutputs.handoffWaitAuthStatus.attemptCount, 1);
  assert.equal(status.targetOutputs.handoffResumeLatest.status, 'waiting-for-login');
  assert.equal(status.agentSafeNext.id, 'background-proof-capture-plan');
  assert.equal(status.agentSafeNext.mayRunUnattended, true);
  assert.equal(status.agentSafeNext.opensBrowser, false);
  assert.equal(status.agentSafeNext.startsCapture, false);
  assert.equal(status.agentSafeNext.startsBackground, false);
  assert.equal(status.agentSafeNext.readsBrowserStorage, false);
  assert.equal(status.agentSafeNext.returnsPageContent, false);
  assert.equal(status.agentSafeNext.blockedReason, 'operator-approval-required');

  const compact = formatBackgroundProofCaptureStatusCompact(status);
  assert.match(compact, /^status_only: yes$/m);
  assert.match(compact, /^monitor_running: yes$/m);
  assert.match(compact, /^capture_running: no$/m);
  assert.match(compact, /^auth_watch_status: waiting$/m);
  assert.match(compact, /^handoff_wait_auth_active: yes$/m);
  assert.match(compact, /^handoff_resume_latest_status: waiting-for-login$/m);
  assert.match(compact, /^agent_safe_next_command_id: background-proof-capture-plan$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_starts_background: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_blocked_reason: operator-approval-required$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-plan' '--format' 'compact'$/m);
  assert.match(compact, /^no_open_wait_capture_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' 'runs\/target-packs\/github' '--run' '--wait-auth'$/m);
  assert.doesNotMatch(compact.match(/^no_open_wait_capture_command: .+$/m)[0], /--open-login/);
  assert.match(compact, /^background_no_open_wait_capture_command: mkdir -p 'runs\/operator' && nohup /m);
  assert.doesNotMatch(compact.match(/^background_no_open_wait_capture_command: .+$/m)[0], /--open-login/);
  assert.match(compact, /^monitor_log_last_line: url: https:\/\/example\.com\/\?token=\[redacted\]$/m);
  assert.doesNotMatch(compact, /secret-value/);

  const markdown = formatBackgroundProofCaptureStatusMarkdown(status);
  assert.match(markdown, /Background Proof Capture Status/);
  assert.match(markdown, /Monitor running: yes/);
});

test('background proof capture status rejects paths outside root', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-bg-status-'));
  await assert.rejects(
    () => buildBackgroundProofCaptureStatus({
      rootDir,
      targetDir: '/tmp/outside-target',
      plan: makePlan(rootDir)
    }),
    /invalid background proof capture status target-dir/
  );
});
