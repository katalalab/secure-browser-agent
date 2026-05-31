import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLoginHandoffStatus, formatLoginHandoffStatusCompact, formatLoginHandoffStatusMarkdown } from '../src/login-handoff-status.mjs';

function command(args) {
  return {
    args,
    shell: args.map((item) => `'${String(item).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function proofGateFixture(overrides = {}) {
  return {
    complete: false,
    status: 'waiting-for-login',
    target: 'github',
    targetDir: 'runs/target-packs/github',
    authCheckOk: false,
    loginLike: true,
    authState: 'metadata-only-login-like',
    authUsable: false,
    handoffAuthCheckPort: '57245',
    handoffAuthCheckPortReachable: true,
    operatorGuidance: {
      humanAction: 'complete-login-in-open-dedicated-browser',
      automationBlocker: 'auth-check-not-ok',
      captureBlocked: true
    },
    nextArtifactAction: 'wait-auth-then-capture-proof',
    nextArtifactBlocker: 'auth-check-not-ok',
    missingArtifactCount: 4,
    missingArtifacts: [
      { id: 'auth-check' },
      { id: 'output:observe.json' },
      { id: 'output:scrape.csv' },
      { id: 'target-proof' }
    ],
    missingOutputFiles: ['observe.json', 'scrape.csv'],
    monitorCommand: command([
      'node',
      'src/cli.mjs',
      'target-auth-watch',
      'runs/target-packs/github',
      '--real-external',
      '--handoff',
      'operator-handoff.json',
      '--format',
      'compact'
    ]),
    resumeCommand: command([
      'node',
      'src/cli.mjs',
      'target-handoff-resume',
      'runs/target-packs/github',
      '--handoff',
      'operator-handoff.json',
      '--run',
      '--open-login',
      '--wait-auth',
      '--format',
      'compact'
    ]),
    agentSafeNext: {
      id: 'target-approval-preflight',
      command: command([
        'node',
        'src/cli.mjs',
        'target-approval-preflight',
        '--candidate',
        'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      mayRunUnattended: true,
      opensBrowser: false,
      startsCapture: false,
      startsBackground: false,
      readsBrowserStorage: false,
      returnsPageContent: false,
      blockedReason: 'operator-approval-required'
    },
    ...overrides
  };
}

test('login handoff status condenses waiting login gate into monitor-safe output', async () => {
  const status = await buildLoginHandoffStatus({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    proofGateStatus: proofGateFixture()
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.destructiveActionsIncluded, false);
  assert.equal(status.opensBrowserNow, false);
  assert.equal(status.startsCaptureNow, false);
  assert.equal(status.nextAction, 'monitor-login');
  assert.equal(status.loginRequired, true);
  assert.equal(status.authCheckOk, false);
  assert.equal(status.loginLike, true);
  assert.equal(status.authUsable, false);
  assert.equal(status.dedicatedBrowserPort, '57245');
  assert.equal(status.dedicatedBrowserReachable, true);
  assert.equal(status.safeMonitorAvailable, true);
  assert.equal(status.safeMonitorOnly, true);
  assert.equal(status.captureAllowedNow, false);
  assert.equal(status.proofCaptureBlockedUntilAuth, true);
  assert.equal(status.safeMonitorCommand.shell.includes('target-auth-watch'), true);
  assert.equal(status.authFirstResumeCommand.shell.includes('target-handoff-resume'), true);
  assert.equal(status.agentSafeNext.id, 'auth-watch');
  assert.equal(status.agentSafeNext.mayRunUnattended, true);
  assert.equal(status.agentSafeNext.opensBrowser, false);
  assert.equal(status.agentSafeNext.startsCapture, false);
  assert.equal(status.agentSafeNext.readsBrowserStorage, false);
  assert.equal(status.agentSafeNext.returnsPageContent, false);

  const compact = formatLoginHandoffStatusCompact(status);
  assert.match(compact, /^next_action: monitor-login$/m);
  assert.match(compact, /^login_required: yes$/m);
  assert.match(compact, /^dedicated_browser_reachable: yes$/m);
  assert.match(compact, /^safe_monitor_available: yes$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^proof_capture_blocked_until_auth: yes$/m);
  assert.match(compact, /^agent_safe_next_command_id: auth-watch$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(compact, /^safe_monitor_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(compact, /^auth_first_resume_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  assert.doesNotMatch(compact, /^\{/);

  const markdown = formatLoginHandoffStatusMarkdown(status);
  assert.match(markdown, /Login Handoff Status/);
  assert.match(markdown, /Safe Monitor/);
  assert.match(markdown, /Auth-First Resume/);
});

test('login handoff status switches to open login browser when handoff port is gone', async () => {
  const status = await buildLoginHandoffStatus({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    proofGateStatus: proofGateFixture({
      handoffAuthCheckPortReachable: false
    })
  });

  assert.equal(status.nextAction, 'open-login-browser');
  assert.equal(status.safeMonitorAvailable, false);
  assert.equal(status.authFirstResumeMayOpenBrowser, true);
  assert.equal(status.agentSafeNext.id, 'target-approval-preflight');
  assert.equal(status.agentSafeNext.mayRunUnattended, true);
  assert.equal(status.agentSafeNext.opensBrowser, false);
  assert.equal(status.agentSafeNext.startsCapture, false);
  assert.equal(status.agentSafeNext.blockedReason, 'operator-approval-required');
  assert.match(formatLoginHandoffStatusCompact(status), /^next_action: open-login-browser$/m);
  assert.match(formatLoginHandoffStatusCompact(status), /^safe_monitor_available: no$/m);
  assert.match(formatLoginHandoffStatusCompact(status), /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(formatLoginHandoffStatusCompact(status), /^agent_safe_next_blocked_reason: operator-approval-required$/m);
});

test('login handoff status reports auth usable without starting capture', async () => {
  const status = await buildLoginHandoffStatus({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    proofGateStatus: proofGateFixture({
      authCheckOk: true,
      loginLike: false,
      authState: 'usable',
      authUsable: true,
      handoffAuthCheckPortReachable: true,
      operatorGuidance: {
        humanAction: 'none',
        automationBlocker: 'none',
        captureBlocked: false
      }
    })
  });

  assert.equal(status.nextAction, 'run-auth-first-proof-capture');
  assert.equal(status.loginRequired, false);
  assert.equal(status.captureAllowedNow, true);
  assert.equal(status.startsCaptureNow, false);
  assert.equal(status.safeMonitorAvailable, false);
  assert.match(formatLoginHandoffStatusCompact(status), /^capture_allowed_now: yes$/m);
  assert.match(formatLoginHandoffStatusCompact(status), /^proof_capture_blocked_until_auth: no$/m);
});

test('login handoff status writes only under runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-login-handoff-status-'));
  const status = await buildLoginHandoffStatus({
    rootDir,
    generatedAt: '2026-05-29T00:00:00.000Z',
    proofGateStatus: proofGateFixture(),
    write: true
  });
  assert.equal(status.outputPath, path.join(rootDir, 'runs/operator/login-handoff-status-latest.json'));
  assert.equal(JSON.parse(fs.readFileSync(status.outputPath, 'utf8')).nextAction, 'monitor-login');

  await assert.rejects(() => buildLoginHandoffStatus({
    rootDir,
    proofGateStatus: proofGateFixture(),
    write: true,
    out: '../bad.json'
  }), /invalid login handoff status output path/);
});
