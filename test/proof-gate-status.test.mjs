import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProofGateStatus, formatProofGateStatusCompact, formatProofGateStatusMarkdown } from '../src/proof-gate-status.mjs';

const missingArtifacts = [
  { id: 'auth-check', kind: 'proof', path: 'proof/auth-check.json', detail: 'auth-check proof is missing or still login-like' },
  { id: 'output:observe.json', kind: 'output', path: 'observe.json', detail: 'required output file is missing or empty' },
  { id: 'output:inspect.json', kind: 'output', path: 'inspect.json', detail: 'required output file is missing or empty' },
  { id: 'benchmark', kind: 'proof', path: 'proof/target-benchmark.json', detail: 'target benchmark proof is missing or has no successful run' }
];

function objectiveStatusFixture(overrides = {}) {
  return {
    complete: false,
    status: 'waiting-for-login',
    nextAction: {
      id: 'target-handoff-resume',
      label: 'Continue through saved handoff resume',
      needsOperatorInput: true,
      missingArtifacts
    },
    operatorGuidance: {
      humanAction: 'complete-login-in-open-dedicated-browser',
      automationBlocker: 'auth-check-not-ok',
      captureBlocked: true
    },
    recommendedCommand: {
      id: 'handoff-resume',
      reason: 'Use the saved handoff resume lane.',
      command: {
        args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github'],
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github'"
      }
    },
    commands: {
      authWatch: {
        args: ['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--real-external', '--handoff', 'operator-handoff.json', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--real-external' '--handoff' 'operator-handoff.json' '--format' 'compact'"
      },
      handoffResume: {
        args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--open-login', '--wait-auth', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--open-login' '--wait-auth' '--format' 'compact'"
      }
    },
    authWatchLatestStatus: {
      exists: true,
      ok: false,
      loginLike: true,
      finalUrl: 'https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Fdashboard',
      title: 'Sign in to GitHub - GitHub'
    },
    latestHandoffResume: {
      exists: true,
      loginOpen: {
        port: '59036'
      },
      authCheck: {
        childStatus: 'not-ok'
      }
    },
    ...overrides
  };
}

function targetProofNextFixture(overrides = {}) {
  return {
    complete: false,
    nextAction: {
      id: 'handoff-resume',
      label: 'Auth-check still sees login; continue through the auth-first handoff resume lane',
      command: {
        args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github'],
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github'"
      }
    },
    acceptedExternalProofs: [],
    summary: {
      acceptedExternalProofs: 0,
      targetPacks: 1
    },
    target: {
      target: 'github',
      dir: 'runs/target-packs/github',
      authCheckOk: false,
      auditOk: true,
      benchmarkOk: false,
      proofReady: false,
      profileLikelyAuthenticated: true,
      missingArtifacts,
      missingOutputs: ['observe.json', 'inspect.json'],
      operatorGuidance: {
        humanAction: 'complete-login-in-open-dedicated-browser',
        automationBlocker: 'auth-check-not-ok',
        captureBlocked: true
      }
    },
    ...overrides
  };
}

test('proof gate status combines objective and target proof state for login handoff', async () => {
  const status = await buildProofGateStatus({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    objectiveStatus: objectiveStatusFixture(),
    targetProofNext: targetProofNextFixture(),
    handoffPortProbe: async () => true
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.destructiveActionsIncluded, false);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.complete, false);
  assert.equal(status.status, 'waiting-for-login');
  assert.equal(status.target, 'github');
  assert.equal(status.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
  assert.equal(status.operatorGuidance.automationBlocker, 'auth-check-not-ok');
  assert.equal(status.operatorGuidance.captureBlocked, true);
  assert.equal(status.authCheckOk, false);
  assert.equal(status.loginLike, true);
  assert.equal(status.authState, 'metadata-only-login-like');
  assert.equal(status.authUsable, false);
  assert.equal(status.profileAuthMetadataOnly, true);
  assert.equal(status.authStatusSource, 'auth-watch-latest');
  assert.equal(status.authFinalUrl, 'https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Fdashboard');
  assert.equal(status.authTitle, 'Sign in to GitHub - GitHub');
  assert.equal(status.handoffAuthCheckPort, '59036');
  assert.equal(status.handoffAuthCheckPortReachable, true);
  assert.deepEqual(status.missingOutputFiles, ['observe.json', 'inspect.json']);
  assert.equal(status.nextArtifactAction, 'wait-auth-then-capture-proof');
  assert.equal(status.nextArtifactBlocker, 'auth-check-not-ok');
  assert.deepEqual(status.artifactCommandCovers, ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof']);
  assert.equal(status.missingArtifactCount, 4);
  assert.equal(status.nextAction.command.shell.includes('target-handoff-resume'), true);
  assert.equal(status.monitorCommand.shell.includes('target-auth-watch'), true);
  assert.equal(status.resumeCommand.shell.includes('target-handoff-resume'), true);
  assert.equal(status.targetApprovalPreflightCommand.shell.includes('target-approval-preflight'), true);
  assert.equal(status.agentSafeNext.id, 'auth-watch');
  assert.equal(status.agentSafeNext.mayRunUnattended, true);
  assert.equal(status.agentSafeNext.opensBrowser, false);
  assert.equal(status.agentSafeNext.startsCapture, false);
  assert.equal(status.agentSafeNext.readsBrowserStorage, false);
  assert.equal(status.agentSafeNext.returnsPageContent, false);

  const compact = formatProofGateStatusCompact(status);
  assert.match(compact, /^status: waiting-for-login$/m);
  assert.match(compact, /^human_action: complete-login-in-open-dedicated-browser$/m);
  assert.match(compact, /^automation_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^capture_blocked: yes$/m);
  assert.match(compact, /^auth_check_ok: no$/m);
  assert.match(compact, /^login_like: yes$/m);
  assert.match(compact, /^auth_state: metadata-only-login-like$/m);
  assert.match(compact, /^auth_usable: no$/m);
  assert.match(compact, /^profile_auth_metadata_only: yes$/m);
  assert.match(compact, /^auth_status_source: auth-watch-latest$/m);
  assert.match(compact, /^auth_final_url: \[redacted\]$/m);
  assert.match(compact, /^auth_title: \[redacted\]$/m);
  assert.doesNotMatch(compact, /https:\/\/github\.com\/login/);
  assert.doesNotMatch(compact, /Sign in to GitHub/);
  assert.match(compact, /^handoff_auth_check_port: 59036$/m);
  assert.match(compact, /^handoff_auth_check_port_reachable: yes$/m);
  assert.match(compact, /^missing_artifacts: auth-check,output:observe\.json,output:inspect\.json,benchmark$/m);
  assert.match(compact, /^next_artifact_action: wait-auth-then-capture-proof$/m);
  assert.match(compact, /^next_artifact_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^artifact_command_covers: auth-check,observe,inspect,scrape,benchmark,target-proof$/m);
  assert.match(compact, /^secret_values_read: no$/m);
  assert.match(compact, /^agent_safe_next_command_id: auth-watch$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(compact, /^auth_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(compact, /^handoff_resume_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^\{/);
  const markdown = formatProofGateStatusMarkdown(status);
  assert.match(markdown, /Proof Gate Status/);
  assert.match(markdown, /Auth final URL: \[redacted\]/);
  assert.match(markdown, /Auth title: \[redacted\]/);
  assert.doesNotMatch(markdown, /https:\/\/github\.com\/login/);
  assert.doesNotMatch(markdown, /Sign in to GitHub/);
  assert.match(markdown, /Login Monitoring Commands/);
  assert.match(markdown, /Target approval preflight/);
  assert.match(markdown, /Next artifact action: wait-auth-then-capture-proof/);
});

test('proof gate status reports complete when an accepted external proof exists', async () => {
  const status = await buildProofGateStatus({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    objectiveStatus: objectiveStatusFixture({
      complete: true,
      status: 'complete',
      nextAction: null,
      operatorGuidance: {
        humanAction: 'none',
        automationBlocker: 'none',
        captureBlocked: false
      },
      authWatchLatestStatus: null,
      latestHandoffResume: null
    }),
    targetProofNext: targetProofNextFixture({
      complete: true,
      nextAction: {
        id: 'complete',
        label: 'Accepted real external target proof already exists',
        command: null
      },
      acceptedExternalProofs: [{ target: 'github', path: '/tmp/sba/runs/target-packs/github/proof/target-proof.json' }],
      summary: {
        acceptedExternalProofs: 1,
        targetPacks: 1
      },
      target: null
    }),
    handoffPortProbe: async () => null
  });

  assert.equal(status.complete, true);
  assert.equal(status.objectiveComplete, true);
  assert.equal(status.status, 'complete');
  assert.equal(status.authState, 'accepted-proof');
  assert.equal(status.operatorGuidance.humanAction, 'none');
  assert.equal(status.acceptedExternalProofCount, 1);
  assert.equal(status.missingArtifactCount, 0);
  assert.equal(status.nextArtifactAction, 'none');
  assert.equal(status.nextArtifactBlocker, 'none');
  assert.match(formatProofGateStatusCompact(status), /^accepted_external_proofs: 1$/m);
  assert.match(formatProofGateStatusCompact(status), /^auth_state: accepted-proof$/m);
});

test('proof gate status can derive auth status from latest handoff resume', async () => {
  const status = await buildProofGateStatus({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    objectiveStatus: objectiveStatusFixture({
      authWatchLatestStatus: null,
      authWatchStatus: null,
      latestHandoffResume: {
        exists: true,
        loginOpen: {
          port: '59036'
        },
        authCheck: {
          status: 'failed',
          ok: false,
          childStatus: 'not-ok',
          childOk: false,
          finalUrl: 'https://github.com/login',
          title: 'Sign in to GitHub',
          loginLike: true,
          sameOrigin: true
        }
      }
    }),
    targetProofNext: targetProofNextFixture(),
    handoffPortProbe: async () => false
  });

  assert.equal(status.authStatusSource, 'latest-handoff-resume-auth-check');
  assert.equal(status.authFinalUrl, 'https://github.com/login');
  assert.equal(status.authTitle, 'Sign in to GitHub');
  assert.equal(status.loginLike, true);
  assert.equal(status.handoffAuthCheckPortReachable, false);
  const compact = formatProofGateStatusCompact(status);
  assert.match(compact, /^auth_status_source: latest-handoff-resume-auth-check$/m);
  assert.match(compact, /^auth_final_url: \[redacted\]$/m);
  assert.match(compact, /^auth_title: \[redacted\]$/m);
  assert.doesNotMatch(compact, /https:\/\/github\.com\/login/);
  assert.doesNotMatch(compact, /Sign in to GitHub/);
  assert.match(compact, /^handoff_auth_check_port_reachable: no$/m);
  assert.equal(status.monitorCommand, null);
  assert.equal(status.monitorBlockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(status.agentSafeNext.id, 'target-approval-preflight');
  assert.equal(status.agentSafeNext.mayRunUnattended, true);
  assert.equal(status.agentSafeNext.opensBrowser, false);
  assert.equal(status.agentSafeNext.startsCapture, false);
  assert.equal(status.agentSafeNext.blockedReason, 'operator-approval-required');
  assert.match(compact, /^auth_watch_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(compact, /^agent_safe_next_blocked_reason: operator-approval-required$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^auth_watch_command: /m);
});

test('proof gate status tells operator to use open login browser when handoff port is reachable', async () => {
  const status = await buildProofGateStatus({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    objectiveStatus: objectiveStatusFixture({
      operatorGuidance: {
        humanAction: 'run-handoff-resume-to-open-login',
        automationBlocker: 'auth-check-not-ok',
        captureBlocked: true
      }
    }),
    targetProofNext: targetProofNextFixture(),
    handoffPortProbe: async () => true
  });

  assert.equal(status.handoffAuthCheckPortReachable, true);
  assert.equal(status.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
  assert.equal(status.operatorGuidance.automationBlocker, 'auth-check-not-ok');
  assert.equal(status.operatorGuidance.captureBlocked, true);
  const compact = formatProofGateStatusCompact(status);
  assert.match(compact, /^human_action: complete-login-in-open-dedicated-browser$/m);
});

test('proof gate status can write secret-free json under runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-gate-status-'));
  try {
    const status = await buildProofGateStatus({
      rootDir,
      generatedAt: '2026-05-29T00:00:00.000Z',
      objectiveStatus: objectiveStatusFixture(),
      targetProofNext: targetProofNextFixture(),
      handoffPortProbe: async () => true,
      write: true,
      out: 'operator/proof-gate-status-latest.json'
    });

    assert.equal(status.outputPath, path.join(rootDir, 'runs/operator/proof-gate-status-latest.json'));
    assert.equal(fs.existsSync(status.outputPath), true);
    const written = JSON.parse(fs.readFileSync(status.outputPath, 'utf8'));
    assert.equal(written.secretValuesRead, false);
    assert.equal(written.target, 'github');
    assert.equal(JSON.stringify(written).includes('hunter2'), false);
    assert.match(formatProofGateStatusCompact(status), /^output_path: /m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('proof gate status rejects output paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-proof-gate-status-invalid-'));
  try {
    await assert.rejects(
      buildProofGateStatus({
        rootDir,
        objectiveStatus: objectiveStatusFixture(),
        targetProofNext: targetProofNextFixture(),
        handoffPortProbe: async () => true,
        write: true,
        out: '../outside.json'
      }),
      /invalid proof gate status output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
