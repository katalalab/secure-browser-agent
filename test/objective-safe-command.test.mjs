import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildObjectiveSafeCommand, formatObjectiveSafeCommandCompact } from '../src/objective-safe-command.mjs';

function auditFixture() {
  return {
    generatedAt: '2026-05-28T00:00:00.000Z',
    rootDir: '/tmp/sba',
    safeMode: true,
    destructiveActionsIncluded: false,
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
      missingArtifacts: [{ id: 'auth-check' }],
      command: {
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth'",
        args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--open-login', '--wait-auth']
      }
    },
    executionPolicy: {
      agentSafeAction: 'monitor-auth-watch',
      agentSafeCommandId: 'auth-watch',
      agentSafeCommand: {
        shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github'",
        args: ['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github']
      },
      agentSafeCommandMonitorOnly: true,
      agentSafeCommandMayOpenBrowser: false,
      agentSafeCommandStartsCapture: false
    },
    targetApproval: {
      approvalPackExists: true,
      approvalPackParseOk: true,
      selectedCandidate: 'github',
      targetPackExists: true,
      targetNext: 'handoff-resume',
      humanAction: 'complete-login-in-open-dedicated-browser',
      automationBlocker: 'auth-check-not-ok',
      captureBlocked: true,
      nextCommandOpensBrowser: true,
      nextCommandStartsCapture: true,
      nextCommandRequiresOperatorApproval: true,
      nextCommandAgentMayRunUnattended: false,
      resumeStatus: 'planned',
      resumeReadyToRun: true,
      resumeOperatorOkRequired: true,
      resumeOperatorOkAccepted: false,
      resumeAgentMayRunUnattended: false,
      resumePlannedCommandOpensBrowser: true,
      resumePlannedCommandStartsCapture: true,
      operatorApprovalSummaryScope: 'real-external-auth-target-proof',
      operatorApprovalSummaryHumanAction: 'complete-login-in-open-dedicated-browser',
      operatorApprovalSummaryRequiresOperatorOk: true,
      operatorApprovalSummaryOperatorOkAccepted: false,
      operatorApprovalSummaryMayOpenBrowser: true,
      operatorApprovalSummaryMayStartCapture: true,
      operatorApprovalSummaryReadsBrowserStorage: false,
      operatorApprovalSummaryReturnsPageContent: false,
      operatorApprovalSummaryAgentMustNotRunUnattended: true,
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      preflightCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      resumePreflightCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      resumeProofPlanCommand: {
        shell: "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'"
      },
      resumePlanCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      resumeStatusCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'"
      },
      resumeWatchCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      resumeRunCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      }
    }
  };
}

function handoffResumeWatchFixture(overrides = {}) {
  return {
    status: 'planned',
    target: 'github',
    selectedCommand: {
      id: 'monitor-auth',
      startsCapture: false,
      command: {
        shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'",
        args: ['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--format', 'compact']
      }
    },
    statusBefore: {
      status: 'waiting-for-login',
      latestAuthOk: false,
      captureCompleted: false,
      capturePlanCommand: {
        shell: "'node' 'src/cli.mjs' 'target-proof-capture' 'runs/target-packs/github' '--real-external' '--wait-auth' '--format' 'compact'",
        args: ['node', 'src/cli.mjs', 'target-proof-capture', 'runs/target-packs/github', '--real-external', '--wait-auth', '--format', 'compact']
      }
    },
    ...overrides
  };
}

test('objective safe command prefers monitor-only auth watch while capture is blocked', async () => {
  const result = await buildObjectiveSafeCommand({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000,
    audit: auditFixture(),
    handoffResumeWatch: handoffResumeWatchFixture()
  });

  assert.equal(result.safeMode, true);
  assert.equal(result.secretValuesRead, false);
  assert.equal(result.destructiveActionsIncluded, false);
  assert.equal(result.commandId, 'auth-watch');
  assert.equal(result.monitorOnly, true);
  assert.equal(result.mayOpenBrowser, false);
  assert.equal(result.startsCapture, false);
  assert.equal(result.blockedReason, '');
  assert.equal(result.agentSafeNext.commandId, 'auth-watch');
  assert.equal(result.agentSafeNext.mayRunUnattended, true);
  assert.equal(result.agentSafeNext.opensBrowser, false);
  assert.equal(result.agentSafeNext.startsCapture, false);
  assert.equal(result.agentSafeNext.readsBrowserStorage, false);
  assert.equal(result.agentSafeNext.returnsPageContent, false);
  assert.match(result.command.shell, /target-auth-watch/);
  assert.equal(result.backgroundProofCapture.captureBlocked, true);
  assert.equal(result.backgroundProofCapture.captureBlockedReason, '');
  assert.equal(result.backgroundProofCapture.monitorAvailable, true);
  assert.equal(result.backgroundProofCapture.captureAvailable, true);
  assert.equal(result.backgroundProofCapture.opensBrowserNow, false);
  assert.equal(result.backgroundProofCapture.startsCaptureNow, false);
  assert.equal(result.backgroundProofCapture.captureStartReadyToRun, false);
  assert.deepEqual(result.backgroundProofCapture.captureStartBlockers, ['operator-ok-required']);
  assert.match(result.backgroundProofCapture.statusCommand.shell, /background-proof-capture-status/);
  assert.match(result.backgroundProofCapture.noOpenWaitCaptureCommand.shell, /target-handoff-resume/);
  assert.doesNotMatch(result.backgroundProofCapture.noOpenWaitCaptureCommand.shell, /--open-login/);
  assert.match(result.backgroundProofCapture.backgroundNoOpenWaitCaptureCommand.shell, /nohup/);
  assert.doesNotMatch(result.backgroundProofCapture.backgroundNoOpenWaitCaptureCommand.shell, /--open-login/);
  assert.match(result.backgroundProofCapture.captureStartCommand.shell, /background-proof-capture-start/);
  assert.match(result.backgroundProofCapture.monitorStartCommand.shell, /background-proof-capture-start/);
  assert.equal(result.agentProofStep.startStatus, 'planned');
  assert.equal(result.agentProofStep.startReadyToRun, false);
  assert.deepEqual(result.agentProofStep.startBlockers, ['operator-ok-required', 'agent-proof-step-not-allowed:auth-not-ready']);
  assert.equal(result.agentProofStep.selectedCommandId, 'monitor-auth');
  assert.equal(result.agentProofStep.opensBrowserNow, false);
  assert.equal(result.agentProofStep.startsCaptureNow, false);
  assert.match(result.agentProofStep.planCommand.shell, /agent-proof-step/);
  assert.equal(result.agentProofStep.runCommand, null);
  assert.match(result.agentProofStep.startCommand.shell, /agent-proof-step-start/);
  assert.match(result.agentProofStep.statusCommand.shell, /agent-proof-step-status/);
  assert.match(result.agentLoopStep.planCommand.shell, /agent-loop-step/);
  assert.match(result.agentLoopStep.planCommand.shell, /--write/);
  assert.match(result.agentLoopStep.runCommand.shell, /agent-loop-step/);
  assert.match(result.agentLoopStep.runCommand.shell, /--run/);
  assert.match(result.agentLoopStep.statusCommand.shell, /agent-loop-step-status/);
  assert.equal(result.handoffResumeWatch.available, true);
  assert.equal(result.handoffResumeWatch.blockedReason, '');
  assert.equal(result.handoffResumeWatch.selectedCommandId, 'monitor-auth');
  assert.equal(result.handoffResumeWatch.selectedStartsCapture, false);
  assert.equal(result.handoffResumeWatch.beforeStatus, 'waiting-for-login');
  assert.match(result.handoffResumeWatch.capturePlanCommand.shell, /target-proof-capture/);
  assert.match(result.handoffResumeWatch.planCommand.shell, /target-handoff-resume-watch/);
  assert.match(result.handoffResumeWatch.planCommand.shell, /'--monitor-timeout-ms' '10000'/);
  assert.match(result.handoffResumeWatch.planCommand.shell, /'--monitor-interval-ms' '1000'/);
  assert.match(result.handoffResumeWatch.runCommand.shell, /--run/);
  assert.match(result.handoffResumeWatch.runCommand.shell, /'--monitor-timeout-ms' '10000'/);
  assert.match(result.handoffResumeWatch.runCommand.shell, /'--monitor-interval-ms' '1000'/);
  assert.equal(result.targetApproval.selectedCandidate, 'github');
  assert.equal(result.targetApproval.resumeReadyToRun, true);
  assert.equal(result.targetApproval.resumeOperatorOkRequired, true);
  assert.equal(result.targetApproval.resumeOperatorOkAccepted, false);
  assert.equal(result.targetApproval.resumeAgentMayRunUnattended, false);
  assert.equal(result.targetApproval.resumePlannedCommandOpensBrowser, true);
  assert.equal(result.targetApproval.resumePlannedCommandStartsCapture, true);
  assert.equal(result.targetApproval.operatorApprovalSummaryRequiresOperatorOk, true);
  assert.equal(result.targetApproval.operatorApprovalSummaryOperatorOkAccepted, false);
  assert.equal(result.targetApproval.operatorApprovalSummaryMayOpenBrowser, true);
  assert.equal(result.targetApproval.operatorApprovalSummaryMayStartCapture, true);
  assert.equal(result.targetApproval.operatorApprovalSummaryReadsBrowserStorage, false);
  assert.equal(result.targetApproval.operatorApprovalSummaryReturnsPageContent, false);
  assert.equal(result.targetApproval.operatorApprovalSummaryAgentMustNotRunUnattended, true);
  assert.match(result.targetApproval.resumePreflightCommand.shell, /target-approval-preflight/);
  assert.match(result.targetApproval.resumeProofPlanCommand.shell, /target-proof-plan/);
  assert.match(result.targetApproval.resumeStatusCommand.shell, /target-approval-resume-status/);
  assert.match(result.targetApproval.resumeWatchCommand.shell, /target-approval-resume-watch/);
  const compact = formatObjectiveSafeCommandCompact(result);
  assert.match(compact, /^agent_safe_command_id: auth-watch$/m);
  assert.match(compact, /^agent_safe_command_monitor_only: yes$/m);
  assert.match(compact, /^agent_safe_command_may_open_browser: no$/m);
  assert.match(compact, /^agent_safe_command_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_command_blocked_reason: none$/m);
  assert.match(compact, /^agent_safe_next_command_id: auth-watch$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_blocked_reason: none$/m);
  assert.match(compact, /^auth_watch_handoff_port_reachable: unknown$/m);
  assert.match(compact, /^background_proof_capture_blocked: yes$/m);
  assert.match(compact, /^background_proof_capture_blocked_reason: none$/m);
  assert.match(compact, /^background_proof_monitor_available: yes$/m);
  assert.match(compact, /^background_proof_capture_available: yes$/m);
  assert.match(compact, /^background_proof_opens_browser_now: no$/m);
  assert.match(compact, /^background_proof_starts_capture_now: no$/m);
  assert.match(compact, /^background_proof_capture_start_ready: no$/m);
  assert.match(compact, /^background_proof_capture_start_blockers: operator-ok-required$/m);
  assert.match(compact, /^agent_proof_step_start_status: planned$/m);
  assert.match(compact, /^agent_proof_step_start_ready: no$/m);
  assert.match(compact, /^agent_proof_step_start_blockers: operator-ok-required,agent-proof-step-not-allowed:auth-not-ready$/m);
  assert.match(compact, /^agent_proof_step_selected_command: monitor-auth$/m);
  assert.match(compact, /^agent_proof_step_opens_browser_now: no$/m);
  assert.match(compact, /^agent_proof_step_starts_capture_now: no$/m);
  assert.match(compact, /^handoff_resume_watch_available: yes$/m);
  assert.match(compact, /^handoff_resume_watch_blocked_reason: none$/m);
  assert.match(compact, /^handoff_resume_watch_selected_command: monitor-auth$/m);
  assert.match(compact, /^handoff_resume_watch_selected_starts_capture: no$/m);
  assert.match(compact, /^handoff_resume_watch_before_status: waiting-for-login$/m);
  assert.match(compact, /^target_approval_pack_exists: yes$/m);
  assert.match(compact, /^target_approval_pack_parse_ok: yes$/m);
  assert.match(compact, /^target_approval_candidate: github$/m);
  assert.match(compact, /^target_approval_target_pack_exists: yes$/m);
  assert.match(compact, /^target_approval_next: handoff-resume$/m);
  assert.match(compact, /^target_approval_human_action: complete-login-in-open-dedicated-browser$/m);
  assert.match(compact, /^target_approval_automation_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^target_approval_capture_blocked: yes$/m);
  assert.match(compact, /^target_approval_next_command_opens_browser: yes$/m);
  assert.match(compact, /^target_approval_next_command_starts_capture: yes$/m);
  assert.match(compact, /^target_approval_next_command_requires_operator_approval: yes$/m);
  assert.match(compact, /^target_approval_next_command_agent_may_run_unattended: no$/m);
  assert.match(compact, /^target_approval_resume_status: planned$/m);
  assert.match(compact, /^target_approval_resume_ready_to_run: yes$/m);
  assert.match(compact, /^target_approval_resume_operator_ok_required: yes$/m);
  assert.match(compact, /^target_approval_resume_operator_ok_accepted: no$/m);
  assert.match(compact, /^target_approval_resume_agent_may_run_unattended: no$/m);
  assert.match(compact, /^target_approval_resume_planned_opens_browser: yes$/m);
  assert.match(compact, /^target_approval_resume_planned_starts_capture: yes$/m);
  assert.match(compact, /^operator_approval_summary_scope: real-external-auth-target-proof$/m);
  assert.match(compact, /^operator_approval_summary_human_action: complete-login-in-open-dedicated-browser$/m);
  assert.match(compact, /^operator_approval_summary_requires_operator_ok: yes$/m);
  assert.match(compact, /^operator_approval_summary_operator_ok_accepted: no$/m);
  assert.match(compact, /^operator_approval_summary_may_open_browser: yes$/m);
  assert.match(compact, /^operator_approval_summary_may_start_capture: yes$/m);
  assert.match(compact, /^operator_approval_summary_reads_browser_storage: no$/m);
  assert.match(compact, /^operator_approval_summary_returns_page_content: no$/m);
  assert.match(compact, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'target-auth-watch' 'runs\/target-packs\/github'$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-auth-watch' 'runs\/target-packs\/github'$/m);
  assert.match(compact, /^agent_loop_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
  assert.match(compact, /^agent_loop_step_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
  assert.match(compact, /^agent_loop_step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^background_proof_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status' '--format' 'compact'$/m);
  assert.match(compact, /^background_proof_no_open_wait_capture_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' 'runs\/target-packs\/github'.*'--run' '--wait-auth'.*'--wait-auth-interval-ms' '5000'$/m);
  assert.doesNotMatch(compact.match(/^background_proof_no_open_wait_capture_command: .+$/m)[0], /--open-login/);
  assert.match(compact, /^background_proof_no_open_wait_capture_background_command: mkdir -p 'runs\/operator' && nohup /m);
  assert.doesNotMatch(compact.match(/^background_proof_no_open_wait_capture_background_command: .+$/m)[0], /--open-login/);
  assert.match(compact, /^background_proof_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture' '--timeout-ms' '300000' '--interval-ms' '5000' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^background_proof_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-proof-step' '--target-dir' 'runs\/target-packs\/github' '--handoff' 'operator-handoff\.json' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^agent_proof_step_run_command: /m);
  assert.match(compact, /^agent_proof_step_start_command: 'node' 'src\/cli\.mjs' 'agent-proof-step-start' '--run' '--operator-ok' 'OK' '--out' 'operator\/agent-proof-step-latest\.json' '--timeout-ms' '300000' '--target-dir' 'runs\/target-packs\/github' '--handoff' 'operator-handoff\.json' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_step_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-step-status' '--in' 'operator\/agent-proof-step-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^handoff_resume_watch_plan_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch' 'runs\/target-packs\/github' '--handoff' 'operator-handoff\.json' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
  assert.match(compact, /^handoff_resume_watch_run_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch' 'runs\/target-packs\/github' '--handoff' 'operator-handoff\.json' '--run' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
  assert.match(compact, /^handoff_resume_capture_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-capture' 'runs\/target-packs\/github' '--real-external' '--wait-auth' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_status_command: 'node' 'src\/cli\.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_status_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-status' '--in' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_watch_opens_browser: no$/m);
  assert.match(compact, /^target_approval_resume_watch_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_watch_requires_operator_approval: no$/m);
  assert.match(compact, /^target_approval_resume_watch_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator\/target-approval-resume-latest\.json' '--out' 'operator\/target-approval-resume-latest\.json' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
});

test('objective safe command writes secret-free handoff only under runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-safe-command-'));
  try {
    const result = await buildObjectiveSafeCommand({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      audit: auditFixture(),
      handoffResumeWatch: handoffResumeWatchFixture(),
      write: true,
      out: 'operator/objective-safe-command-latest.json'
    });

    assert.equal(result.outputPath, path.join(rootDir, 'runs/operator/objective-safe-command-latest.json'));
    assert.equal(fs.existsSync(result.outputPath), true);
    const saved = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
    assert.equal(saved.safeMode, true);
    assert.equal(saved.secretValuesRead, false);
    assert.equal(saved.destructiveActionsIncluded, false);
    assert.equal(saved.commandId, 'auth-watch');
    assert.equal(saved.targetApproval.selectedCandidate, 'github');
    assert.equal(saved.targetApproval.resumeReadyToRun, true);

    const compact = formatObjectiveSafeCommandCompact(result);
    assert.match(compact, /^output: .*operator\/objective-safe-command-latest\.json$/m);

    await assert.rejects(
      () => buildObjectiveSafeCommand({
        rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      audit: auditFixture(),
      handoffResumeWatch: handoffResumeWatchFixture(),
      write: true,
      out: '../objective-safe-command.json'
      }),
      /invalid objective safe command output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('objective safe command reports stale handoff port blocker without a runnable watch command', async () => {
  const result = await buildObjectiveSafeCommand({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    audit: {
      generatedAt: '2026-05-28T00:00:00.000Z',
      rootDir: '/tmp/sba',
      safeMode: true,
      destructiveActionsIncluded: false,
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
        missingArtifacts: [{ id: 'auth-check' }],
        command: {
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth'",
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--open-login', '--wait-auth']
        }
      },
      executionPolicy: {
        agentSafeAction: 'reopen-login-browser-required',
        agentSafeCommandId: 'none',
        agentSafeCommand: null,
        agentSafeCommandMonitorOnly: false,
        agentSafeCommandMayOpenBrowser: false,
        agentSafeCommandStartsCapture: false,
        agentSafeCommandBlockedReason: 'handoff-auth-check-port-unreachable',
        authWatchHandoffPort: 59036,
        authWatchHandoffPortReachable: false
      }
    },
    handoffResumeWatch: handoffResumeWatchFixture()
  });

  assert.equal(result.commandId, 'none');
  assert.equal(result.command, null);
  assert.equal(result.blockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(result.agentSafeNext.commandId, 'target-approval-preflight');
  assert.equal(result.agentSafeNext.mayRunUnattended, true);
  assert.equal(result.agentSafeNext.opensBrowser, false);
  assert.equal(result.agentSafeNext.startsCapture, false);
  assert.equal(result.agentSafeNext.blockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(result.authWatchHandoffPort, 59036);
  assert.equal(result.authWatchHandoffPortReachable, false);
  assert.equal(result.proofCaptureAllowedNow, false);
  assert.equal(result.backgroundProofCapture.captureAvailable, false);
  assert.equal(result.backgroundProofCapture.captureBlockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(result.backgroundProofCapture.monitorStartCommand, null);
  assert.equal(result.backgroundProofCapture.captureStartReadyToRun, false);
  assert.deepEqual(result.backgroundProofCapture.captureStartBlockers, ['operator-ok-required', 'handoff-auth-check-port-unreachable']);
  assert.equal(result.backgroundProofCapture.noOpenWaitCaptureCommand, null);
  assert.equal(result.backgroundProofCapture.backgroundNoOpenWaitCaptureCommand, null);
  assert.equal(result.backgroundProofCapture.captureStartCommand, null);
  assert.equal(result.agentLoopStep.runCommand, null);
  assert.equal(result.handoffResumeWatch.blockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(result.handoffResumeWatch.runCommand, null);
  assert.match(result.handoffResumeWatch.planCommand.shell, /target-handoff-resume-watch/);
  assert.match(result.agentLoopStep.planCommand.shell, /agent-loop-step/);
  assert.match(result.agentLoopStep.statusCommand.shell, /agent-loop-step-status/);

  const compact = formatObjectiveSafeCommandCompact(result);
  assert.match(compact, /^agent_safe_action: reopen-login-browser-required$/m);
  assert.match(compact, /^agent_safe_command_id: none$/m);
  assert.match(compact, /^agent_safe_command_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^auth_watch_handoff_port: 59036$/m);
  assert.match(compact, /^auth_watch_handoff_port_reachable: no$/m);
  assert.match(compact, /^proof_capture_allowed_now: no$/m);
  assert.match(compact, /^background_proof_capture_available: no$/m);
  assert.match(compact, /^background_proof_capture_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^background_proof_capture_start_blockers: operator-ok-required,handoff-auth-check-port-unreachable$/m);
  assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_command: /m);
  assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_background_command: /m);
  assert.doesNotMatch(compact, /^background_proof_capture_start_command: /m);
  assert.doesNotMatch(compact, /^background_proof_monitor_start_command: /m);
  assert.match(compact, /^handoff_resume_watch_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^handoff_resume_watch_plan_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch'/m);
  assert.doesNotMatch(compact, /^handoff_resume_watch_run_command: /m);
  assert.match(compact, /^agent_loop_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write'/m);
  assert.doesNotMatch(compact, /^agent_loop_step_run_command: /m);
  assert.match(compact, /^agent_loop_step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status'/m);
  assert.doesNotMatch(compact, /^command: /m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
});

test('objective safe command suppresses handoff watch run when child watch rejects stale port', async () => {
  const result = await buildObjectiveSafeCommand({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    audit: auditFixture(),
    handoffResumeWatch: handoffResumeWatchFixture({
      status: 'planned',
      target: 'github',
      selectedCommandAvailable: false,
      selectedCommandBlockedReason: 'handoff-auth-check-port-unreachable',
      selectedCommand: {
        id: 'monitor-auth',
        startsCapture: false,
        command: {
          shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--format', 'compact']
        }
      },
      statusBefore: {
        status: 'waiting-for-login',
        latestAuthOk: false,
        captureCompleted: false
      }
    })
  });

  assert.equal(result.commandId, 'auth-watch');
  assert.equal(result.backgroundProofCapture.captureAvailable, false);
  assert.equal(result.backgroundProofCapture.captureBlockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(result.backgroundProofCapture.noOpenWaitCaptureCommand, null);
  assert.equal(result.backgroundProofCapture.backgroundNoOpenWaitCaptureCommand, null);
  assert.equal(result.handoffResumeWatch.available, true);
  assert.equal(result.handoffResumeWatch.blockedReason, 'handoff-auth-check-port-unreachable');
  assert.equal(result.handoffResumeWatch.runCommand, null);
  assert.match(result.handoffResumeWatch.planCommand.shell, /target-handoff-resume-watch/);

  const compact = formatObjectiveSafeCommandCompact(result);
  assert.match(compact, /^agent_safe_command_id: auth-watch$/m);
  assert.match(compact, /^background_proof_capture_available: no$/m);
  assert.match(compact, /^background_proof_capture_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_command: /m);
  assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_background_command: /m);
  assert.match(compact, /^handoff_resume_watch_blocked_reason: handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^handoff_resume_watch_plan_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch'/m);
  assert.doesNotMatch(compact, /^handoff_resume_watch_run_command: /m);
});

test('objective safe command reclassifies unsafe saved agent command as operator-only', async () => {
  const audit = auditFixture();
  audit.executionPolicy = {
    agentSafeAction: 'run-target-handoff-resume',
    agentSafeCommandId: 'target-handoff-resume',
    agentSafeCommand: {
      shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth'",
      args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--open-login', '--wait-auth']
    },
    agentSafeCommandMonitorOnly: false,
    agentSafeCommandMayOpenBrowser: true,
    agentSafeCommandStartsCapture: true,
    agentSafeCommandBlockedReason: ''
  };

  const result = await buildObjectiveSafeCommand({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    audit,
    handoffResumeWatch: handoffResumeWatchFixture()
  });

  assert.equal(result.agentSafeAction, 'operator-approval-required');
  assert.equal(result.commandId, 'none');
  assert.equal(result.command, null);
  assert.equal(result.mayOpenBrowser, false);
  assert.equal(result.startsCapture, false);
  assert.equal(result.blockedReason, 'operator-approval-required');
  assert.equal(result.agentSafeNext.commandId, 'target-approval-preflight');
  assert.equal(result.agentSafeNext.mayRunUnattended, true);
  assert.equal(result.agentSafeNext.opensBrowser, false);
  assert.equal(result.agentSafeNext.startsCapture, false);
  assert.equal(result.agentSafeNext.blockedReason, 'operator-approval-required');
  assert.equal(result.proofCaptureAllowedNow, false);
  assert.equal(result.agentLoopStep.runCommand, null);

  const compact = formatObjectiveSafeCommandCompact(result);
  assert.match(compact, /^agent_safe_action: operator-approval-required$/m);
  assert.match(compact, /^agent_safe_command_id: none$/m);
  assert.match(compact, /^agent_safe_command_may_open_browser: no$/m);
  assert.match(compact, /^agent_safe_command_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_command_blocked_reason: operator-approval-required$/m);
  assert.match(compact, /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_blocked_reason: operator-approval-required$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^proof_capture_allowed_now: no$/m);
  assert.doesNotMatch(compact, /^command: /m);
  assert.doesNotMatch(compact, /^agent_loop_step_run_command: /m);
});

test('objective safe command does not treat option flags as target directories', async () => {
  const audit = auditFixture();
  audit.nextAction = {
    id: 'target-bootstrap-plan',
    target: '',
    command: {
      shell: "'node' 'src/cli.mjs' 'target-bootstrap-plan' '--name' 'github' '--format' 'compact'",
      args: ['node', 'src/cli.mjs', 'target-bootstrap-plan', '--name', 'github', '--format', 'compact']
    }
  };
  audit.executionPolicy = {
    agentSafeAction: 'wait-operator',
    agentSafeCommandId: 'none',
    agentSafeCommand: null,
    agentSafeCommandMonitorOnly: false,
    agentSafeCommandMayOpenBrowser: false,
    agentSafeCommandStartsCapture: false
  };
  audit.targetApproval = {
    ...audit.targetApproval,
    selectedCandidate: '',
    targetPackExists: false
  };

  const result = await buildObjectiveSafeCommand({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    audit
  });

  assert.equal(result.handoffResumeWatch.available, false);
  assert.equal(result.handoffResumeWatch.status, 'missing-target');
  assert.notEqual(result.handoffResumeWatch.targetDir, '--name');
  assert.doesNotMatch(formatObjectiveSafeCommandCompact(result), /target-handoff-resume-watch' '--name'/);
});
