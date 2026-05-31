import test from 'node:test';
import assert from 'node:assert/strict';
import { buildObjectiveProofPipeline, formatObjectiveProofPipelineCompact, formatObjectiveProofPipelineMarkdown } from '../src/objective-proof-pipeline.mjs';

function auditFixture(overrides = {}) {
  return {
    generatedAt: '2026-05-29T00:00:00.000Z',
    rootDir: '/tmp/sba',
    complete: false,
    status: 'incomplete',
    finalGate: {
      remainingCount: 1
    },
    nextAction: {
      id: 'target-handoff-resume',
      target: 'github',
      needsOperatorInput: true,
      operatorGuidance: {
        humanAction: 'complete-login-in-open-dedicated-browser',
        automationBlocker: 'auth-check-not-ok',
        captureBlocked: true
      },
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'auth-check-not-ok',
      artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof'],
      missingArtifacts: [
        { id: 'auth-check' },
        { id: 'output:observe.json' },
        { id: 'benchmark' }
      ],
      command: {
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' '--run' '--open-login' '--wait-auth'",
        args: ['node', 'src/cli.mjs', 'target-handoff-resume', '--run', '--open-login', '--wait-auth']
      },
      manualCommandCandidates: [
        {
          id: 'auth-watch',
          label: 'Monitor auth',
          command: {
            shell: "'node' 'src/cli.mjs' 'target-auth-watch'",
            args: ['node', 'src/cli.mjs', 'target-auth-watch']
          }
        },
        {
          id: 'open-only',
          label: 'Open login only',
          command: {
            shell: "'node' 'src/cli.mjs' 'target-login-capture' '--open-only'",
            args: ['node', 'src/cli.mjs', 'target-login-capture', '--open-only']
          }
        }
      ]
    },
    executionPolicy: {
      agentSafeAction: 'monitor-auth-watch',
      agentSafeCommandId: 'auth-watch',
      agentSafeCommand: {
        shell: "'node' 'src/cli.mjs' 'target-auth-watch'",
        args: ['node', 'src/cli.mjs', 'target-auth-watch']
      },
      agentSafeCommandMonitorOnly: true,
      agentSafeCommandMayOpenBrowser: false,
      agentSafeCommandStartsCapture: false
    },
    ...overrides
  };
}

test('objective proof pipeline separates auth monitoring from wait-auth capture', async () => {
  const pipeline = await buildObjectiveProofPipeline({
    rootDir: '/tmp/sba',
    audit: auditFixture()
  });

  assert.equal(pipeline.safeMode, true);
  assert.equal(pipeline.destructiveActionsIncluded, false);
  assert.equal(pipeline.secretValuesRead, false);
  assert.equal(pipeline.opensBrowserNow, false);
  assert.equal(pipeline.startsCaptureNow, false);
  assert.equal(pipeline.decision.recommendedNow, 'monitor-auth');
  assert.equal(pipeline.decision.proofCaptureAllowedNow, false);
  assert.equal(pipeline.decision.waitAuthThenCaptureAvailable, true);
  assert.equal(pipeline.phases.monitorAuth.available, true);
  assert.equal(pipeline.phases.monitorAuth.opensBrowser, false);
  assert.equal(pipeline.phases.monitorAuth.startsCapture, false);
  assert.equal(pipeline.phases.openLogin.available, true);
  assert.equal(pipeline.phases.reopenLogin.available, true);
  assert.equal(pipeline.phases.reopenLogin.opensBrowser, true);
  assert.equal(pipeline.phases.reopenLogin.startsCapture, false);
  assert.equal(pipeline.phases.waitAuthThenCapture.opensBrowser, true);
  assert.equal(pipeline.phases.waitAuthThenCapture.waitsForAuth, true);
  assert.equal(pipeline.phases.waitAuthThenCapture.startsCapture, true);
  assert.equal(pipeline.phases.waitAuthThenCaptureNoOpen.available, true);
  assert.equal(pipeline.phases.waitAuthThenCaptureNoOpen.opensBrowser, false);
  assert.equal(pipeline.phases.waitAuthThenCaptureNoOpen.waitsForAuth, true);
  assert.equal(pipeline.phases.waitAuthThenCaptureNoOpen.startsCapture, true);
  assert.equal(pipeline.background.commandsAreOperatorGated, true);
  assert.equal(pipeline.background.monitorStartAvailable, true);
  assert.equal(pipeline.background.captureStartAvailable, true);
  assert.match(pipeline.background.statusCommand.shell, /background-proof-capture-status/);

  const compact = formatObjectiveProofPipelineCompact(pipeline);
  assert.match(compact, /^recommended_now: monitor-auth$/m);
  assert.match(compact, /^monitor_auth_opens_browser: no$/m);
  assert.match(compact, /^reopen_login_available: yes$/m);
  assert.match(compact, /^reopen_login_starts_capture: no$/m);
  assert.match(compact, /^wait_capture_opens_browser: yes$/m);
  assert.match(compact, /^wait_capture_no_open_available: yes$/m);
  assert.match(compact, /^wait_capture_no_open_opens_browser: no$/m);
  assert.match(compact, /^wait_capture_no_open_starts_capture: yes$/m);
  assert.match(compact, /^background_commands_operator_gated: yes$/m);
  assert.match(compact, /^background_monitor_start_available: yes$/m);
  assert.match(compact, /^background_capture_start_available: yes$/m);
  assert.match(compact, /^artifact_command_covers: auth-check,observe,inspect,scrape,benchmark,target-proof$/m);
  assert.match(compact, /^monitor_auth_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'$/m);
  assert.match(compact, /^reopen_login_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' '--run' '--open-login'$/m);
  assert.match(compact, /^wait_capture_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
  assert.match(compact, /^wait_capture_no_open_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' '--run' '--wait-auth'$/m);
  assert.match(compact, /^background_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status' '--format' 'compact'$/m);
  assert.match(compact, /^background_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^background_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture' '--timeout-ms' '300000' '--interval-ms' '5000' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^wait_capture_no_open_command: .*--open-login/m);

  const markdown = formatObjectiveProofPipelineMarkdown(pipeline);
  assert.match(markdown, /Objective Proof Pipeline/);
  assert.match(markdown, /Monitor Auth/);
  assert.match(markdown, /Wait Auth Then Capture No Open/);
  assert.doesNotMatch(JSON.stringify(pipeline), /cookie|password|secret value/i);
});

test('objective proof pipeline can shorten only monitor-auth settings', async () => {
  const pipeline = await buildObjectiveProofPipeline({
    rootDir: '/tmp/sba',
    audit: auditFixture(),
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000
  });

  const compact = formatObjectiveProofPipelineCompact(pipeline);
  assert.match(compact, /^monitor_auth_command: 'node' 'src\/cli\.mjs' 'target-auth-watch' '--timeout-ms' '10000' '--interval-ms' '1000'$/m);
  assert.match(compact, /^background_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^background_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture' '--timeout-ms' '300000' '--interval-ms' '5000' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^wait_capture_command: .*'--timeout-ms' '10000'/m);
  assert.doesNotMatch(compact, /^wait_capture_no_open_command: .*'--timeout-ms' '10000'/m);
  assert.doesNotMatch(compact, /^open_login_command: .*'--timeout-ms' '10000'/m);
});

test('objective proof pipeline compact output hides root-local target pack paths', async () => {
  const targetDir = '/tmp/sba/runs/target-packs/github';
  const pipeline = await buildObjectiveProofPipeline({
    rootDir: '/tmp/sba',
    audit: auditFixture({
      nextAction: {
        ...auditFixture().nextAction,
        command: {
          shell: `'node' 'src/cli.mjs' 'target-handoff-resume' '${targetDir}' '--run' '--open-login' '--wait-auth'`,
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', targetDir, '--run', '--open-login', '--wait-auth']
        }
      }
    })
  });

  const compact = formatObjectiveProofPipelineCompact(pipeline);
  assert.match(compact, /^reopen_login_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' 'runs\/target-packs\/github' '--run' '--open-login'$/m);
  assert.match(compact, /^wait_capture_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' 'runs\/target-packs\/github'/m);
  assert.match(compact, /^wait_capture_no_open_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' 'runs\/target-packs\/github' '--run' '--wait-auth'$/m);
  assert.doesNotMatch(compact, /\/tmp\/sba\/runs\/target-packs\/github/);
  assert.doesNotMatch(formatObjectiveProofPipelineMarkdown(pipeline), /\/tmp\/sba\/runs\/target-packs\/github/);
});

test('objective proof pipeline allows capture when auth is no longer blocked', async () => {
  const pipeline = await buildObjectiveProofPipeline({
    audit: auditFixture({
      nextAction: {
        ...auditFixture().nextAction,
        needsOperatorInput: false,
        operatorGuidance: {
          humanAction: '',
          automationBlocker: '',
          captureBlocked: false
        }
      },
      executionPolicy: {
        agentSafeAction: 'run-target-handoff-resume',
        agentSafeCommandId: 'target-handoff-resume',
        agentSafeCommand: {
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' '--run' '--wait-auth'",
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', '--run', '--wait-auth']
        },
        agentSafeCommandMonitorOnly: false,
        agentSafeCommandMayOpenBrowser: false,
        agentSafeCommandStartsCapture: true
      }
    })
  });

  assert.equal(pipeline.operator.captureBlocked, false);
  assert.equal(pipeline.decision.proofCaptureAllowedNow, true);
  assert.equal(pipeline.phases.waitAuthThenCapture.runNow, true);
  assert.match(formatObjectiveProofPipelineCompact(pipeline), /^proof_capture_allowed_now: yes$/m);
});

test('objective proof pipeline does not recommend stale auth watch ports', async () => {
  const pipeline = await buildObjectiveProofPipeline({
    rootDir: '/tmp/sba',
    audit: auditFixture({
      executionPolicy: {
        agentSafeAction: 'reopen-login-browser-required',
        agentSafeCommandId: 'none',
        agentSafeCommand: null,
        agentSafeCommandMonitorOnly: false,
        agentSafeCommandMayOpenBrowser: false,
        agentSafeCommandStartsCapture: false,
        agentSafeCommandBlockedReason: 'handoff-auth-check-port-unreachable',
        authWatchHandoffPort: 57245,
        authWatchHandoffPortReachable: false
      }
    }),
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000
  });

  assert.equal(pipeline.decision.recommendedNow, 'reopen-login-browser');
  assert.equal(pipeline.phases.monitorAuth.available, false);
  assert.equal(pipeline.phases.monitorAuth.blockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(pipeline.phases.reopenLogin.available, true);
  assert.equal(pipeline.phases.reopenLogin.opensBrowser, true);
  assert.equal(pipeline.phases.reopenLogin.startsCapture, false);
  assert.equal(pipeline.operator.authWatchHandoffPort, 57245);
  assert.equal(pipeline.operator.authWatchHandoffPortReachable, false);

  const compact = formatObjectiveProofPipelineCompact(pipeline);
  assert.match(compact, /^recommended_now: reopen-login-browser$/m);
  assert.match(compact, /^monitor_auth_available: no$/m);
  assert.match(compact, /^monitor_auth_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^reopen_login_available: yes$/m);
  assert.match(compact, /^reopen_login_opens_browser: yes$/m);
  assert.match(compact, /^reopen_login_starts_capture: no$/m);
  assert.match(compact, /^auth_watch_handoff_port: 57245$/m);
  assert.match(compact, /^auth_watch_handoff_port_reachable: no$/m);
  assert.doesNotMatch(compact, /^monitor_auth_command:/m);
  assert.match(compact, /^reopen_login_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' '--run' '--open-login'$/m);
  assert.doesNotMatch(compact, /^reopen_login_command: .*--wait-auth/m);
  assert.match(compact, /^wait_capture_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
});
