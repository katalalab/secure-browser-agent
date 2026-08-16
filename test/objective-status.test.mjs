import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildObjectiveStatus, formatObjectiveStatusCompact, formatObjectiveStatusMarkdown } from '../src/objective-status.mjs';

const missingProofArtifacts = [
  { id: 'auth-check', kind: 'proof', path: 'proof/auth-check.json', detail: 'auth-check proof is missing or still login-like' },
  { id: 'output:observe.json', kind: 'output', path: 'observe.json', detail: 'required output file is missing or empty' },
  { id: 'output:scrape.csv', kind: 'output', path: 'scrape.csv', detail: 'required output file is missing or empty' },
  { id: 'benchmark', kind: 'proof', path: 'proof/target-benchmark.json', detail: 'target benchmark proof is missing or has no successful run' }
];

function auditFixture(overrides = {}) {
  return {
    complete: false,
    status: 'incomplete',
    finalGate: { remainingCount: 1 },
    remaining: [
      {
        id: 'real-external-auth-target',
        status: 'manual-required',
        next: 'Complete login and capture proof.'
      }
    ],
    nextAction: {
      id: 'target-handoff-capture',
      status: 'ready',
      label: 'Complete login, then run saved handoff capture',
      needsOperatorInput: true,
      writesLocalState: true,
      command: {
        args: ['node', 'src/cli.mjs', 'target-handoff-run', 'runs/target-packs/github'],
        shell: "'node' 'src/cli.mjs' 'target-handoff-run' 'runs/target-packs/github'"
      },
      missingArtifacts: missingProofArtifacts
    },
    ...overrides
  };
}

function resumeFixture(overrides = {}) {
  return {
    status: 'blocked',
    readyToRun: false,
    run: false,
    operatorReady: false,
    action: { id: 'target-handoff-capture' },
    blockers: ['Action requires operator input before running.'],
    outputPath: '',
    ...overrides
  };
}

test('objective status summarizes waiting-for-login state and saved resume', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-status-'));
  const resumePath = path.join(rootDir, 'runs/operator/objective-resume-latest.json');
  fs.mkdirSync(path.dirname(resumePath), { recursive: true });
  fs.writeFileSync(resumePath, `${JSON.stringify({
    generatedAt: '2026-05-28T00:00:00.000Z',
    status: 'planned',
    readyToRun: true,
    action: {
      id: 'target-handoff-capture:login-capture-wait',
      command: {
        args: [
          'node',
          'src/cli.mjs',
          'target-login-capture',
          path.join(rootDir, 'runs/target-packs/github'),
          '--real-external',
          '--handoff-out',
          'operator-handoff.json',
          '--wait-auth-status-out',
          'wait-auth-status.json',
          '--format',
          'markdown'
        ],
        shell: `'node' 'src/cli.mjs' 'target-login-capture' '${path.join(rootDir, 'runs/target-packs/github')}' '--real-external' '--handoff-out' 'operator-handoff.json' '--wait-auth-status-out' 'wait-auth-status.json' '--format' 'markdown'`
      }
    },
    selectedManualCandidate: {
      id: 'login-capture-wait',
      label: 'Open the dedicated login browser, wait for auth-check, then capture proof',
      command: {
        args: [
          'node',
          'src/cli.mjs',
          'target-login-capture',
          path.join(rootDir, 'runs/target-packs/github'),
          '--real-external',
          '--handoff-out',
          'operator-handoff.json',
          '--wait-auth-status-out',
          'wait-auth-status.json',
          '--format',
          'markdown'
        ],
        shell: `'node' 'src/cli.mjs' 'target-login-capture' '${path.join(rootDir, 'runs/target-packs/github')}' '--real-external' '--handoff-out' 'operator-handoff.json' '--wait-auth-status-out' 'wait-auth-status.json' '--format' 'markdown'`
      }
    },
    blockers: [],
    outputPath: resumePath
  }, null, 2)}\n`, 'utf8');
  const probeResumePath = path.join(rootDir, 'runs/operator/objective-resume-probe-latest.json');
  fs.writeFileSync(probeResumePath, `${JSON.stringify({
    generatedAt: '2026-05-28T00:00:30.000Z',
    status: 'failed',
    readyToRun: true,
    action: {
      id: 'target-handoff-capture:login-capture-wait'
    },
    selectedManualCandidate: {
      id: 'login-capture-wait',
      label: 'Short wait probe',
      command: {
        args: [
          'node',
          'src/cli.mjs',
          'target-login-capture',
          path.join(rootDir, 'runs/target-packs/github'),
          '--real-external',
          '--handoff-out',
          'operator-handoff-probe.json',
          '--wait-auth-status-out',
          'wait-auth-status-probe.json',
          '--wait-auth-timeout-ms',
          '10000',
          '--format',
          'markdown'
        ],
        shell: `'node' 'src/cli.mjs' 'target-login-capture' '${path.join(rootDir, 'runs/target-packs/github')}' '--real-external' '--handoff-out' 'operator-handoff-probe.json' '--wait-auth-status-out' 'wait-auth-status-probe.json' '--wait-auth-timeout-ms' '10000' '--format' 'markdown'`
      }
    },
    blockers: [],
    outputPath: probeResumePath
  }, null, 2)}\n`, 'utf8');
  const handoffRunPath = path.join(rootDir, 'runs/target-packs/github/outputs/handoff-run-latest.json');
  fs.mkdirSync(path.dirname(handoffRunPath), { recursive: true });
  fs.writeFileSync(handoffRunPath, `${JSON.stringify({
    generatedAt: '2026-05-28T00:01:00.000Z',
    target: 'github',
    commandId: 'post-login-capture',
    status: 'blocked',
    readyToRun: false,
    blockers: ['Auth preflight failed'],
    authPreflight: {
      ok: false,
      cdpPort: '61872',
      finalUrl: 'https://github.com/login',
      loginLike: true
    },
    nextAction: {
      id: 'login-capture-wait',
      label: 'Open the dedicated login browser, wait for auth-check, then retry capture',
      command: {
        args: [
          'node',
          'src/cli.mjs',
          'target-login-capture',
          path.join(rootDir, 'runs/target-packs/github'),
          '--real-external',
          '--handoff-out',
          'operator-handoff.json',
          '--wait-auth-status-out',
          'wait-auth-status.json',
          '--format',
          'markdown'
        ],
        shell: `'node' 'src/cli.mjs' 'target-login-capture' '${path.join(rootDir, 'runs/target-packs/github')}' '--real-external' '--handoff-out' 'operator-handoff.json' '--wait-auth-status-out' 'wait-auth-status.json' '--format' 'markdown'`
      }
    },
    result: null
  }, null, 2)}\n`, 'utf8');
  const handoffResumePath = path.join(rootDir, 'runs/target-packs/github/outputs/handoff-resume-latest.json');
  fs.writeFileSync(handoffResumePath, `${JSON.stringify({
    generatedAt: '2026-05-28T00:01:30.000Z',
    target: 'github',
    status: 'waiting-for-login',
    blockers: ['Auth check is reachable but still reports OK: no.'],
    loginOpen: {
      status: 'login-opened',
      login: {
        ok: true,
        port: 56789
      },
      handoffPath: path.join(rootDir, 'runs/target-packs/github/outputs/operator-handoff.json')
    },
    authCheck: {
      status: 'failed',
      result: {
        ok: false,
        childStatus: 'not-ok',
        childOk: false,
        finalUrl: 'https://github.com/login',
        title: 'Sign in to GitHub',
        loginLike: true,
        sameOrigin: true
      }
    },
    capture: null,
    nextAction: {
      id: 'login-capture-wait',
      label: 'Complete login in the dedicated browser, then run this resume command again.',
      command: {
        args: [
          'node',
          'src/cli.mjs',
          'target-login-capture',
          path.join(rootDir, 'runs/target-packs/github'),
          '--real-external',
          '--handoff-out',
          'operator-handoff.json',
          '--wait-auth-status-out',
          'wait-auth-status.json',
          '--format',
          'markdown'
        ],
        shell: `'node' 'src/cli.mjs' 'target-login-capture' '${path.join(rootDir, 'runs/target-packs/github')}' '--real-external' '--handoff-out' 'operator-handoff.json' '--wait-auth-status-out' 'wait-auth-status.json' '--format' 'markdown'`
      }
    }
  }, null, 2)}\n`, 'utf8');
  const operatorHandoffPath = path.join(rootDir, 'runs/target-packs/github/outputs/operator-handoff.json');
  fs.writeFileSync(operatorHandoffPath, `${JSON.stringify({
    generatedAt: '2026-05-28T00:01:45.000Z',
    target: 'github',
    realExternal: true,
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            path.join(rootDir, 'runs/target-packs/github'),
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '59036',
            '--format',
            'markdown'
          ]
        },
        {
          id: 'auth-check-status',
          args: [
            'node',
            'src/cli.mjs',
            'target-auth-check',
            path.join(rootDir, 'runs/target-packs/github'),
            '--real-external',
            '--cdp-port',
            '59036',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  }, null, 2)}\n`, 'utf8');
  const waitAuthPath = path.join(rootDir, 'runs/target-packs/github/outputs/wait-auth-status.json');
  fs.writeFileSync(waitAuthPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-05-28T00:02:00.000Z',
    target: 'github',
    profile: 'github',
    realExternal: true,
    status: 'waiting',
    enabled: true,
    timeoutMs: 300000,
    intervalMs: 5000,
    attempts: [
      {
        attempt: 1,
        generatedAt: '2026-05-28T00:02:00.000Z',
        profileLikelyAuthenticated: true,
        authCheckOk: false,
        authCheckFinalUrl: 'https://github.com/login',
        authCheckRefresh: {
          ok: false,
          finalUrl: 'https://github.com/login',
          loginLike: true,
          error: ''
        }
      }
    ]
  }, null, 2)}\n`, 'utf8');
  const waitAuthProbePath = path.join(rootDir, 'runs/target-packs/github/outputs/wait-auth-status-probe.json');
  fs.writeFileSync(waitAuthProbePath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-05-28T00:03:00.000Z',
    target: 'github',
    profile: 'github',
    realExternal: true,
    status: 'timed-out',
    enabled: true,
    timeoutMs: 10000,
    intervalMs: 1000,
    attempts: [
      {
        attempt: 2,
        generatedAt: '2026-05-28T00:03:05.000Z',
        profileLikelyAuthenticated: true,
        authCheckOk: false,
        authCheckFinalUrl: 'https://github.com/login'
      }
    ]
  }, null, 2)}\n`, 'utf8');
  const handoffResumeWaitAuthPath = path.join(rootDir, 'runs/target-packs/github/outputs/handoff-resume-wait-auth-status.json');
  fs.writeFileSync(handoffResumeWaitAuthPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-05-28T00:04:00.000Z',
    target: 'github',
    realExternal: true,
    status: 'timed-out',
    enabled: true,
    timeoutMs: 10000,
    intervalMs: 1000,
    attempts: [
      {
        attempt: 1,
        generatedAt: '2026-05-28T00:04:02.000Z',
        status: 'failed',
        ok: false,
        childStatus: 'not-ok',
        childOk: false,
        finalUrl: 'https://github.com/login',
        title: 'Sign in to GitHub',
        loginLike: true,
        sameOrigin: true
      }
    ]
  }, null, 2)}\n`, 'utf8');
  const authWatchPath = path.join(rootDir, 'runs/target-packs/github/outputs/auth-watch-status.json');
  fs.writeFileSync(authWatchPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-05-28T00:03:00.000Z',
    target: 'github',
    profile: 'github',
    pageUrl: 'https://github.com/dashboard',
    loginUrl: 'https://github.com/login',
    finalUrl: 'https://github.com/login',
    title: 'Sign in to GitHub',
    ok: false,
    sameOrigin: true,
    loginLike: true,
    nextAction: {
      id: 'handoff-resume',
      label: 'Resume saved handoff',
      command: {
        args: ['node', 'src/cli.mjs', 'target-handoff-resume', path.join(rootDir, 'runs/target-packs/github')],
        shell: `'node' 'src/cli.mjs' 'target-handoff-resume' '${path.join(rootDir, 'runs/target-packs/github')}'`
      }
    }
  }, null, 2)}\n`, 'utf8');
  const authWatchLatestPath = path.join(rootDir, 'runs/target-packs/github/outputs/auth-watch-status-latest.json');
  fs.writeFileSync(authWatchLatestPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-05-28T00:02:00.000Z',
    target: 'github',
    profile: 'github',
    status: 'timed-out',
    ok: false,
    timeoutMs: 0,
    intervalMs: 500,
    attemptCount: 1,
    authCheck: {
      generatedAt: '2026-05-28T00:02:00.000Z',
      target: 'github',
      profile: 'github',
      finalUrl: 'https://github.com/login',
      title: 'Sign in to GitHub',
      ok: false,
      sameOrigin: true,
      loginLike: true
    },
    nextAction: {
      id: 'handoff-resume',
      label: 'Resume saved handoff'
    }
  }, null, 2)}\n`, 'utf8');

  const status = await buildObjectiveStatus({
    rootDir,
    generatedAt: '2026-05-28T00:10:00.000Z',
    // This test asserts a reachable auth-check port. Pin it instead of probing the fixture
    // port for real, which made the outcome depend on what the host happened to be listening on.
    handoffPortReachable: true,
    audit: auditFixture(),
    resume: resumeFixture(),
    operatorReadyResume: resumeFixture({
      operatorReady: true,
      operatorReadyPreflight: {
        ok: false,
        kind: 'target-auth-check',
        targetDir: 'runs/target-packs/github',
        cdpPort: '61872',
        finalUrl: 'https://github.com/login',
        blocker: 'Operator-ready preflight failed: auth-check still sees login.'
      }
    }),
    handoffPortProbe: async () => true,
    write: true,
    out: 'operator/objective-status-latest.json'
  });

  assert.equal(status.status, 'waiting-for-login');
  assert.equal(status.authState, 'metadata-only-login-like');
  assert.equal(status.complete, false);
  assert.equal(status.remaining[0].id, 'real-external-auth-target');
  assert.equal(status.savedResume.exists, true);
  assert.equal(status.savedResume.actionId, 'target-handoff-capture:login-capture-wait');
  assert.equal(status.savedResume.readyToRun, true);
  assert.equal(status.savedResume.selectedManualCandidate.id, 'login-capture-wait');
  assert.match(status.savedResume.selectedManualCandidate.command.shell, /wait-auth-status\.json/);
  assert.equal(status.savedProbeResume.exists, true);
  assert.equal(status.savedProbeResume.status, 'failed');
  assert.equal(status.savedProbeResume.selectedManualCandidate.id, 'login-capture-wait');
  assert.match(status.savedProbeResume.selectedManualCandidate.command.shell, /wait-auth-status-probe\.json/);
  assert.equal(status.latestHandoffRun.exists, true);
  assert.equal(status.latestHandoffRun.status, 'blocked');
  assert.equal(status.latestHandoffRun.authPreflight.ok, false);
  assert.equal(status.latestHandoffRun.nextAction.id, 'login-capture-wait');
  assert.match(status.latestHandoffRun.nextAction.command.shell, /wait-auth-status\.json/);
  assert.equal(status.latestHandoffResume.exists, true);
  assert.equal(status.latestHandoffResume.status, 'waiting-for-login');
  assert.equal(status.latestHandoffResume.loginOpen.status, 'login-opened');
  assert.equal(status.latestHandoffResume.loginOpen.ok, true);
  assert.equal(status.latestHandoffResume.loginOpen.port, '56789');
  assert.equal(status.latestHandoffResume.authCheck.status, 'failed');
  assert.equal(status.latestHandoffResume.authCheck.childStatus, 'not-ok');
  assert.equal(status.latestHandoffResume.authCheck.finalUrl, 'https://github.com/login');
  assert.equal(status.latestHandoffResume.authCheck.title, 'Sign in to GitHub');
  assert.equal(status.latestHandoffResume.authCheck.loginLike, true);
  assert.equal(status.latestHandoffResume.authCheck.sameOrigin, true);
  assert.equal(status.latestHandoffResume.nextAction.id, 'login-capture-wait');
  assert.equal(status.operatorHandoff.exists, true);
  assert.equal(status.operatorHandoff.authCheckPort, '59036');
  assert.equal(status.operatorHandoff.commandCount, 2);
  assert.equal(status.handoffAuthCheckPortReachable, true);
  assert.equal(status.waitAuthStatus.exists, true);
  assert.equal(status.waitAuthStatus.status, 'waiting');
  assert.equal(status.waitAuthStatus.updatedAt, '2026-05-28T00:02:00.000Z');
  assert.equal(status.waitAuthStatus.ageSeconds, 480);
  assert.equal(status.waitAuthStatus.stale, true);
  assert.equal(status.waitAuthStatus.active, false);
  assert.equal(status.waitAuthStatus.attemptCount, 1);
  assert.equal(status.waitAuthStatus.lastAttempt.authCheckOk, false);
  assert.equal(status.waitAuthProbeStatus.exists, true);
  assert.equal(status.waitAuthProbeStatus.status, 'timed-out');
  assert.equal(status.waitAuthProbeStatus.updatedAt, '2026-05-28T00:03:05.000Z');
  assert.equal(status.waitAuthProbeStatus.ageSeconds, 415);
  assert.equal(status.waitAuthProbeStatus.stale, true);
  assert.equal(status.waitAuthProbeStatus.active, false);
  assert.equal(status.waitAuthProbeStatus.attemptCount, 1);
  assert.equal(status.handoffResumeWaitAuthStatus.exists, true);
  assert.equal(status.handoffResumeWaitAuthStatus.status, 'timed-out');
  assert.equal(status.handoffResumeWaitAuthStatus.updatedAt, '2026-05-28T00:04:02.000Z');
  assert.equal(status.handoffResumeWaitAuthStatus.ageSeconds, 358);
  assert.equal(status.handoffResumeWaitAuthStatus.stale, true);
  assert.equal(status.handoffResumeWaitAuthStatus.active, false);
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.status, 'failed');
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.authCheckOk, false);
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.childStatus, 'not-ok');
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.finalUrl, 'https://github.com/login');
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.title, 'Sign in to GitHub');
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.loginLike, true);
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.sameOrigin, true);
  assert.equal(status.authWatchStatus.exists, true);
  assert.equal(status.authWatchStatus.status, 'not-ok');
  assert.equal(status.authWatchStatus.updatedAt, '2026-05-28T00:03:00.000Z');
  assert.equal(status.authWatchStatus.ageSeconds, 420);
  assert.equal(status.authWatchStatus.stale, true);
  assert.equal(status.authWatchStatus.active, false);
  assert.equal(status.authWatchStatus.loginLike, true);
  assert.equal(status.authWatchStatus.nextAction.id, 'handoff-resume');
  assert.equal(status.authWatchLatestStatus.exists, true);
  assert.equal(status.authWatchLatestStatus.status, 'timed-out');
  assert.equal(status.authWatchLatestStatus.active, false);
  assert.match(status.commands.loginOpen.shell, /target-login-capture/);
  assert.match(status.commands.loginOpen.shell, /--open-only/);
  assert.match(status.commands.loginCaptureWait.shell, /target-login-capture/);
  assert.doesNotMatch(status.commands.loginCaptureWait.shell, /--open-only/);
  assert.match(status.commands.loginCaptureWait.shell, /operator-handoff\.json/);
  assert.match(status.commands.loginCaptureWait.shell, /wait-auth-status\.json/);
  assert.match(status.commands.loginCaptureWait.shell, /--completion-audit/);
  assert.match(status.commands.authCheck.shell, /target-auth-check/);
  assert.match(status.commands.authCheck.shell, /--handoff/);
  assert.match(status.commands.authCheck.shell, /operator-handoff\.json/);
  assert.match(status.commands.authWatch.shell, /target-auth-watch/);
  assert.match(status.commands.authWatch.shell, /--real-external/);
  assert.match(status.commands.authWatch.shell, /--handoff/);
  assert.match(status.commands.authWatch.shell, /operator-handoff\.json/);
  assert.match(status.commands.authWatch.shell, /auth-watch-status\.json/);
  assert.match(status.commands.handoffResume.shell, /target-handoff-resume/);
  assert.match(status.commands.handoffResume.shell, /--open-login/);
  assert.match(status.commands.handoffResume.shell, /--wait-auth/);
  assert.match(status.commands.handoffResume.shell, /handoff-resume-wait-auth-status\.json/);
  assert.match(status.commands.handoffResume.shell, /handoff-resume-latest\.json/);
  assert.match(status.commands.savedResumeRun.shell, /objective-resume/);
  assert.match(status.commands.savedResumeRun.shell, /login-capture-wait/);
  assert.equal(status.recommendedCommand.id, 'handoff-resume');
  assert.match(status.recommendedCommand.reason, /checks auth first/);
  assert.match(status.recommendedCommand.command.shell, /target-handoff-resume/);
  assert.equal(status.recommendedCommand.opensBrowser, true);
  assert.equal(status.recommendedCommand.startsCapture, true);
  assert.equal(status.recommendedCommand.requiresOperatorApproval, true);
  assert.equal(status.recommendedCommand.mayRunUnattended, false);
  assert.equal(status.recommendedCommand.agentRunCommand, null);
  assert.match(status.recommendedCommand.operatorApprovalCommand.shell, /target-handoff-resume/);
  assert.equal(status.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
  assert.equal(status.operatorGuidance.automationBlocker, 'auth-check-not-ok');
  assert.equal(status.operatorGuidance.captureBlocked, true);
  assert.match(status.operatorGuidance.resumeCommand.shell, /target-handoff-resume/);
  assert.equal(status.outputPath, path.join(rootDir, 'runs/operator/objective-status-latest.json'));
  const written = JSON.parse(fs.readFileSync(status.outputPath, 'utf8'));
  assert.equal(written.status, 'waiting-for-login');
  assert.equal(written.authState, 'metadata-only-login-like');
  assert.match(written.commands.loginOpen.shell, /target-login-capture/);
  assert.match(written.commands.loginCaptureWait.shell, /target-login-capture/);
  assert.equal(written.latestHandoffRun.status, 'blocked');
  assert.equal(written.latestHandoffRun.nextAction.id, 'login-capture-wait');
  assert.equal(written.latestHandoffResume.status, 'waiting-for-login');
  assert.equal(written.latestHandoffResume.loginOpen.status, 'login-opened');
  assert.equal(written.latestHandoffResume.loginOpen.port, '56789');
  assert.equal(written.latestHandoffResume.authCheck.childStatus, 'not-ok');
  assert.equal(written.latestHandoffResume.authCheck.finalUrl, 'https://github.com/login');
  assert.equal(written.latestHandoffResume.authCheck.loginLike, true);
  assert.equal(written.operatorHandoff.authCheckPort, '59036');
  assert.equal(written.handoffAuthCheckPortReachable, true);
  assert.equal(written.waitAuthStatus.status, 'waiting');
  assert.equal(written.waitAuthStatus.stale, true);
  assert.equal(written.waitAuthStatus.active, false);
  assert.equal(written.waitAuthProbeStatus.status, 'timed-out');
  assert.equal(written.waitAuthProbeStatus.stale, true);
  assert.equal(written.handoffResumeWaitAuthStatus.status, 'timed-out');
  assert.equal(written.handoffResumeWaitAuthStatus.stale, true);
  assert.equal(written.authWatchStatus.status, 'not-ok');
  assert.equal(written.authWatchStatus.stale, true);
  assert.equal(written.authWatchLatestStatus.status, 'timed-out');
  assert.equal(written.savedResume.selectedManualCandidate.id, 'login-capture-wait');
  assert.equal(written.savedProbeResume.selectedManualCandidate.id, 'login-capture-wait');
  assert.match(written.commands.savedResumeRun.shell, /login-capture-wait/);
  assert.match(written.commands.handoffResume.shell, /target-handoff-resume/);
  assert.equal(written.recommendedCommand.id, 'handoff-resume');
  assert.equal(written.recommendedCommand.opensBrowser, true);
  assert.equal(written.recommendedCommand.startsCapture, true);
  assert.equal(written.recommendedCommand.requiresOperatorApproval, true);
  assert.equal(written.recommendedCommand.mayRunUnattended, false);
  assert.equal(written.recommendedCommand.agentRunCommand, null);
  assert.match(written.recommendedCommand.operatorApprovalCommand.shell, /target-handoff-resume/);
  assert.equal(written.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
  assert.equal(written.operatorGuidance.automationBlocker, 'auth-check-not-ok');
  assert.equal(written.operatorGuidance.captureBlocked, true);
  const markdown = formatObjectiveStatusMarkdown(status);
  assert.match(markdown, /Objective Status/);
  assert.match(markdown, /Auth state: metadata-only-login-like/);
  assert.match(markdown, /Missing Artifacts/);
  assert.match(markdown, /output:scrape\.csv \(scrape\.csv\)/);
  assert.match(markdown, /Operator Ready Preflight/);
  assert.match(markdown, /Latest Handoff Run/);
  assert.match(markdown, /Latest Handoff Resume/);
  assert.match(markdown, /Login open status: login-opened/);
  assert.match(markdown, /Login open CDP port: 56789/);
  assert.match(markdown, /Auth login-like: yes/);
  assert.match(markdown, /Auth final URL: \[redacted\]/);
  assert.match(markdown, /Auth title: \[redacted\]/);
  assert.match(markdown, /Auth preflight final URL: \[redacted\]/);
  assert.match(markdown, /Last auth-check final URL: \[redacted\]/);
  assert.match(markdown, /Last refresh final URL: \[redacted\]/);
  assert.match(markdown, /Final URL: \[redacted\]/);
  assert.match(markdown, /Title: \[redacted\]/);
  assert.doesNotMatch(markdown, /https:\/\/github\.com\/login/);
  assert.doesNotMatch(markdown, /Sign in to GitHub/);
  assert.match(markdown, /Next action: login-capture-wait/);
  assert.match(markdown, /Wait Auth Status/);
  assert.match(markdown, /Saved Probe Resume/);
  assert.match(markdown, /Wait Auth Probe Status/);
  assert.match(markdown, /Handoff Resume Wait Auth Status/);
  assert.match(markdown, /Auth Watch Status/);
  assert.match(markdown, /Auth Watch Latest Status/);
  assert.match(markdown, /Active watch: no/);
  assert.match(markdown, /Attempts: 1/);
  assert.match(markdown, /Stale: yes/);
  assert.match(markdown, /Active wait: no/);
  assert.match(markdown, /Status: blocked/);
  assert.match(markdown, /Manual candidate: login-capture-wait/);
  assert.match(markdown, /saved-resume-run/);
  assert.match(markdown, /handoff-resume/);
  assert.match(markdown, /login-open/);
  assert.match(markdown, /login-capture-wait/);
  assert.match(markdown, /auth-check/);
  assert.match(markdown, /auth-watch/);
  assert.match(markdown, /operator-ready-resume/);
  assert.match(markdown, /Recommended Command/);
  assert.match(markdown, /ID: handoff-resume/);
  assert.match(markdown, /Operator Guidance/);
  assert.match(markdown, /Human action: complete-login-in-open-dedicated-browser/);
  assert.match(markdown, /Automation blocker: auth-check-not-ok/);
  assert.match(markdown, /Capture blocked: yes/);
  const compact = formatObjectiveStatusCompact(status);
  assert.match(compact, /^status: waiting-for-login/m);
  assert.match(compact, /^complete: no/m);
  assert.match(compact, /^remaining: 1/m);
  assert.match(compact, /^next: target-handoff-capture/m);
  assert.match(compact, /^operator_input: yes/m);
  assert.match(compact, /^human_action: complete-login-in-open-dedicated-browser/m);
  assert.match(compact, /^automation_blocker: auth-check-not-ok/m);
  assert.match(compact, /^capture_blocked: yes/m);
  assert.match(compact, /^auth_state: metadata-only-login-like/m);
  assert.match(compact, /^missing_artifact_count: 4/m);
  assert.match(compact, /^missing_artifacts: auth-check,output:observe\.json,output:scrape\.csv,benchmark/m);
  assert.match(compact, /^missing_output_files: observe\.json,scrape\.csv/m);
  assert.match(compact, /^preflight_ok: no/m);
  assert.match(compact, /^cdp_port: 61872/m);
  assert.match(compact, /^wait_auth: waiting/m);
  assert.match(compact, /^wait_auth_active: no/m);
  assert.match(compact, /^wait_auth_stale: yes/m);
  assert.match(compact, /^wait_auth_probe: timed-out/m);
  assert.match(compact, /^handoff_resume_wait_auth: timed-out/m);
  assert.match(compact, /^handoff_resume_wait_auth_stale: yes/m);
  assert.match(compact, /^handoff_auth_check_port: 59036/m);
  assert.match(compact, /^handoff_auth_check_port_reachable: yes/m);
  assert.match(compact, /^auth_watch: not-ok/m);
  assert.match(compact, /^auth_watch_active: no/m);
  assert.match(compact, /^auth_watch_stale: yes/m);
  assert.match(compact, /^auth_watch_login_like: yes/m);
  assert.match(compact, /^auth_watch_latest: timed-out/m);
  assert.match(compact, /^auth_watch_latest_active: no/m);
  assert.match(compact, /^handoff_resume: waiting-for-login/m);
  assert.match(compact, /^handoff_resume_login_open: login-opened/m);
  assert.match(compact, /^handoff_resume_login_port: 56789/m);
  assert.match(compact, /^handoff_resume_auth_child_status: not-ok/m);
  assert.match(compact, /^handoff_resume_auth_login_like: yes/m);
  assert.match(compact, /^handoff_resume_auth_final_url: \[redacted\]$/m);
  assert.match(compact, /^handoff_resume_auth_title: \[redacted\]$/m);
  assert.doesNotMatch(compact, /https:\/\/github\.com\/login/);
  assert.doesNotMatch(compact, /Sign in to GitHub/);
  assert.match(compact, /^recommended_command: handoff-resume/m);
  assert.match(compact, /^recommended_opens_browser: yes/m);
  assert.match(compact, /^recommended_starts_capture: yes/m);
  assert.match(compact, /^recommended_requires_operator_approval: yes/m);
  assert.match(compact, /^recommended_may_run_unattended: no/m);
  assert.match(compact, /^recommended_agent_run_command: none/m);
  assert.match(compact, /^recommended_operator_approval_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  assert.match(compact, /^agent_safe_next_command_id: auth-watch$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  assert.match(compact, /^auth_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(compact, /^handoff_resume_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
});

test('objective status uses reachable handoff port as open dedicated browser signal', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-status-handoff-port-'));
  try {
    const targetDir = path.join(rootDir, 'runs/target-packs/github');
    const operatorHandoffPath = path.join(targetDir, 'outputs/operator-handoff.json');
    fs.mkdirSync(path.dirname(operatorHandoffPath), { recursive: true });
    fs.writeFileSync(operatorHandoffPath, `${JSON.stringify({
      target: 'github',
      realExternal: true,
      handoff: {
        commands: [
          {
            id: 'post-login-capture',
            args: [
              'node',
              'src/cli.mjs',
              'target-proof-capture',
              targetDir,
              '--real-external',
              '--run',
              '--wait-auth',
              '--auth-check-port',
              '59036',
              '--format',
              'markdown'
            ]
          }
        ]
      }
    }, null, 2)}\n`, 'utf8');

    const status = await buildObjectiveStatus({
      rootDir,
      generatedAt: '2026-05-28T00:10:00.000Z',
      audit: auditFixture({
        nextAction: {
          id: 'target-handoff-resume',
          status: 'ready',
          label: 'Resume handoff',
          needsOperatorInput: true,
          writesLocalState: true,
          command: {
            args: ['node', 'src/cli.mjs', 'target-handoff-resume', targetDir],
            shell: `'node' 'src/cli.mjs' 'target-handoff-resume' '${targetDir}'`
          },
          missingArtifacts: missingProofArtifacts
        }
      }),
      resume: resumeFixture(),
      handoffPortProbe: async () => true
    });

    assert.equal(status.status, 'waiting-for-login');
    assert.equal(status.operatorHandoff.authCheckPort, '59036');
    assert.equal(status.handoffAuthCheckPortReachable, true);
    assert.equal(status.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
    const compact = formatObjectiveStatusCompact(status);
    assert.match(compact, /^human_action: complete-login-in-open-dedicated-browser/m);
    assert.match(compact, /^handoff_auth_check_port_reachable: yes/m);
    assert.match(compact, /^agent_safe_next_command_id: auth-watch$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
    assert.match(compact, /^auth_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
    assert.match(compact, /^handoff_resume_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('objective status suppresses auth watch command when saved handoff port is stale', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-status-stale-handoff-port-'));
  try {
    const targetDir = path.join(rootDir, 'runs/target-packs/github');
    const operatorHandoffPath = path.join(targetDir, 'outputs/operator-handoff.json');
    fs.mkdirSync(path.dirname(operatorHandoffPath), { recursive: true });
    fs.writeFileSync(operatorHandoffPath, `${JSON.stringify({
      target: 'github',
      realExternal: true,
      handoff: {
        commands: [{
          id: 'post-login-capture',
          args: ['node', 'src/cli.mjs', 'target-proof-capture', targetDir, '--real-external', '--run', '--wait-auth', '--auth-check-port', '59036', '--format', 'markdown']
        }]
      }
    }, null, 2)}\n`, 'utf8');

    const status = await buildObjectiveStatus({
      rootDir,
      generatedAt: '2026-05-28T00:10:00.000Z',
      audit: auditFixture({
        nextAction: {
          id: 'target-handoff-resume',
          status: 'ready',
          label: 'Resume handoff',
          needsOperatorInput: true,
          writesLocalState: true,
          command: {
            args: ['node', 'src/cli.mjs', 'target-handoff-resume', targetDir],
            shell: `'node' 'src/cli.mjs' 'target-handoff-resume' '${targetDir}'`
          },
          missingArtifacts: missingProofArtifacts
        }
      }),
      resume: resumeFixture(),
      handoffPortProbe: async () => false
    });

    assert.equal(status.status, 'waiting-for-login');
    assert.equal(status.operatorHandoff.authCheckPort, '59036');
    assert.equal(status.handoffAuthCheckPortReachable, false);
    assert.equal(status.commands.authWatch, null);
    const compact = formatObjectiveStatusCompact(status);
    assert.match(compact, /^handoff_auth_check_port_reachable: no$/m);
    assert.match(compact, /^auth_watch_blocked_reason: handoff-auth-check-port-unreachable$/m);
    assert.match(compact, /^agent_safe_next_command_id: login-handoff-status$/m);
    assert.match(compact, /^agent_safe_next_blocked_reason: operator-approval-required$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'login-handoff-status' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^auth_watch_command: /m);
    assert.match(compact, /^handoff_resume_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('objective status recommends polling when auth-watch is active', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-status-auth-watch-active-'));
  const authWatchPath = path.join(rootDir, 'runs/target-packs/github/outputs/auth-watch-status.json');
  fs.mkdirSync(path.dirname(authWatchPath), { recursive: true });
  fs.writeFileSync(authWatchPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-05-28T00:09:55.000Z',
    target: 'github',
    profile: 'github',
    status: 'waiting',
    ok: false,
    timeoutMs: 300000,
    intervalMs: 5000,
    attemptCount: 1,
    authCheck: {
      generatedAt: '2026-05-28T00:09:55.000Z',
      target: 'github',
      profile: 'github',
      pageUrl: 'https://github.com/dashboard',
      loginUrl: 'https://github.com/login',
      finalUrl: 'https://github.com/login',
      title: 'Sign in to GitHub',
      ok: false,
      sameOrigin: true,
      loginLike: true
    },
    nextAction: {
      id: 'handoff-resume',
      label: 'Resume saved handoff'
    }
  }, null, 2)}\n`, 'utf8');

  const status = await buildObjectiveStatus({
    // cdpPort below is a fixture value, not a live endpoint. Probing it for real made the
    // safe-next flip to auth-watch on any host that happened to be listening on 61872.
    handoffPortReachable: false,
    rootDir,
    generatedAt: '2026-05-28T00:10:00.000Z',
    audit: auditFixture(),
    resume: resumeFixture(),
    operatorReadyResume: resumeFixture({
      operatorReady: true,
      operatorReadyPreflight: {
        ok: false,
        kind: 'target-auth-check',
        targetDir: 'runs/target-packs/github',
        cdpPort: '61872',
        finalUrl: 'https://github.com/login'
      }
    })
  });

  assert.equal(status.authWatchStatus.exists, true);
  assert.equal(status.authState, 'login-like');
  assert.equal(status.authWatchStatus.status, 'waiting');
  assert.equal(status.authWatchStatus.active, true);
  assert.equal(status.authWatchStatus.loginLike, true);
  assert.equal(status.recommendedCommand.id, 'status');
  assert.match(status.recommendedCommand.reason, /auth-watch/);
  assert.equal(status.recommendedCommand.opensBrowser, false);
  assert.equal(status.recommendedCommand.startsCapture, false);
  assert.equal(status.recommendedCommand.requiresOperatorApproval, false);
  assert.equal(status.recommendedCommand.mayRunUnattended, true);
  assert.match(status.recommendedCommand.agentRunCommand.shell, /objective-status/);
  assert.equal(status.recommendedCommand.operatorApprovalCommand, null);
  assert.equal(status.operatorGuidance.humanAction, 'wait-or-poll-active-login-check');
  assert.equal(status.operatorGuidance.automationBlocker, 'auth-check-not-ok');
  assert.equal(status.operatorGuidance.captureBlocked, true);
  const compact = formatObjectiveStatusCompact(status);
  assert.match(compact, /^human_action: wait-or-poll-active-login-check/m);
  assert.match(compact, /^automation_blocker: auth-check-not-ok/m);
  assert.match(compact, /^capture_blocked: yes/m);
  assert.match(compact, /^auth_state: login-like/m);
  assert.match(compact, /^auth_watch: waiting/m);
  assert.match(compact, /^auth_watch_active: yes/m);
  assert.match(compact, /^recommended_command: status/m);
  assert.match(compact, /^recommended_opens_browser: no/m);
  assert.match(compact, /^recommended_starts_capture: no/m);
  assert.match(compact, /^recommended_requires_operator_approval: no/m);
  assert.match(compact, /^recommended_may_run_unattended: yes/m);
  assert.match(compact, /^recommended_agent_run_command: 'node' 'src\/cli\.mjs' 'objective-status'/m);
  assert.match(compact, /^recommended_operator_approval_command: none/m);
  assert.match(compact, /^agent_safe_next_command_id: status$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'objective-status' '--format' 'compact'$/m);
});

test('objective status recommends polling when a login wait is active', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-status-active-'));
  const resumePath = path.join(rootDir, 'runs/operator/objective-resume-latest.json');
  fs.mkdirSync(path.dirname(resumePath), { recursive: true });
  fs.writeFileSync(resumePath, `${JSON.stringify({
    generatedAt: '2026-05-28T00:00:00.000Z',
    status: 'planned',
    readyToRun: true,
    selectedManualCandidate: {
      id: 'login-capture-wait',
      command: {
        args: ['node', 'src/cli.mjs', 'target-login-capture', path.join(rootDir, 'runs/target-packs/github')],
        shell: `'node' 'src/cli.mjs' 'target-login-capture' '${path.join(rootDir, 'runs/target-packs/github')}'`
      }
    }
  }, null, 2)}\n`, 'utf8');
  const waitAuthPath = path.join(rootDir, 'runs/target-packs/github/outputs/wait-auth-status.json');
  fs.mkdirSync(path.dirname(waitAuthPath), { recursive: true });
  fs.writeFileSync(waitAuthPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-05-28T00:09:55.000Z',
    target: 'github',
    status: 'waiting',
    enabled: true,
    timeoutMs: 300000,
    intervalMs: 5000,
    attempts: [
      {
        attempt: 1,
        generatedAt: '2026-05-28T00:09:55.000Z',
        authCheckOk: false,
        authCheckFinalUrl: 'https://github.com/login'
      }
    ]
  }, null, 2)}\n`, 'utf8');

  const status = await buildObjectiveStatus({
    rootDir,
    generatedAt: '2026-05-28T00:10:00.000Z',
    audit: auditFixture(),
    resume: resumeFixture(),
    operatorReadyResume: resumeFixture({
      operatorReady: true,
      operatorReadyPreflight: {
        ok: false,
        kind: 'target-auth-check',
        targetDir: 'runs/target-packs/github',
        cdpPort: '61872',
        finalUrl: 'https://github.com/login'
      }
    })
  });

  assert.equal(status.waitAuthStatus.active, true);
  assert.equal(status.recommendedCommand.id, 'status');
  assert.match(status.recommendedCommand.reason, /already active/);
  assert.equal(status.recommendedCommand.mayRunUnattended, true);
  assert.match(formatObjectiveStatusCompact(status), /^recommended_command: status/m);
  assert.match(formatObjectiveStatusCompact(status), /^recommended_may_run_unattended: yes/m);
  assert.match(formatObjectiveStatusCompact(status), /^command: 'node' 'src\/cli\.mjs' 'objective-status'/m);
});

test('objective status recommends polling when handoff resume wait-auth is active', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-status-handoff-active-'));
  const resumePath = path.join(rootDir, 'runs/operator/objective-resume-latest.json');
  fs.mkdirSync(path.dirname(resumePath), { recursive: true });
  fs.writeFileSync(resumePath, `${JSON.stringify({
    generatedAt: '2026-05-28T00:00:00.000Z',
    status: 'planned',
    readyToRun: true,
    selectedManualCandidate: {
      id: 'login-capture-wait',
      command: {
        args: ['node', 'src/cli.mjs', 'target-login-capture', path.join(rootDir, 'runs/target-packs/github')],
        shell: `'node' 'src/cli.mjs' 'target-login-capture' '${path.join(rootDir, 'runs/target-packs/github')}'`
      }
    }
  }, null, 2)}\n`, 'utf8');
  const handoffResumeWaitAuthPath = path.join(rootDir, 'runs/target-packs/github/outputs/handoff-resume-wait-auth-status.json');
  fs.mkdirSync(path.dirname(handoffResumeWaitAuthPath), { recursive: true });
  fs.writeFileSync(handoffResumeWaitAuthPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-05-28T00:09:55.000Z',
    target: 'github',
    status: 'waiting',
    enabled: true,
    timeoutMs: 300000,
    intervalMs: 5000,
    attempts: [
      {
        attempt: 1,
        generatedAt: '2026-05-28T00:09:55.000Z',
        status: 'failed',
        ok: false,
        childStatus: 'not-ok',
        childOk: false
      }
    ]
  }, null, 2)}\n`, 'utf8');

  const status = await buildObjectiveStatus({
    rootDir,
    generatedAt: '2026-05-28T00:10:00.000Z',
    audit: auditFixture({
      nextAction: {
        id: 'target-handoff-resume',
        status: 'ready',
        label: 'Resume saved handoff',
        needsOperatorInput: true,
        writesLocalState: true,
        command: {
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', path.join(rootDir, 'runs/target-packs/github')],
          shell: `'node' 'src/cli.mjs' 'target-handoff-resume' '${path.join(rootDir, 'runs/target-packs/github')}'`
        }
      }
    }),
    resume: resumeFixture()
  });

  assert.equal(status.status, 'waiting-for-login');
  assert.equal(status.waitAuthStatus.exists, false);
  assert.equal(status.handoffResumeWaitAuthStatus.exists, true);
  assert.equal(status.handoffResumeWaitAuthStatus.active, true);
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.authCheckOk, false);
  assert.equal(status.handoffResumeWaitAuthStatus.lastAttempt.childStatus, 'not-ok');
  assert.equal(status.recommendedCommand.id, 'status');
  assert.match(status.recommendedCommand.reason, /handoff-resume wait is already active/);
  assert.equal(status.recommendedCommand.mayRunUnattended, true);
  const compact = formatObjectiveStatusCompact(status);
  assert.match(compact, /^handoff_resume_wait_auth: waiting/m);
  assert.match(compact, /^handoff_resume_wait_auth_active: yes/m);
  assert.match(compact, /^recommended_command: status/m);
  assert.match(compact, /^recommended_may_run_unattended: yes/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'objective-status'/m);
});

test('objective status rejects output paths outside runs', async () => {
  await assert.rejects(
    () => buildObjectiveStatus({
      rootDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-status-')),
      audit: auditFixture({ nextAction: { id: 'manual', label: 'Manual' } }),
      resume: resumeFixture({ action: { id: 'manual' } }),
      write: true,
      out: '../bad.json'
    }),
    /invalid status output path/
  );
});
