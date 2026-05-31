import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAgentProofChecklist,
  buildAgentProofChecklistStatus,
  formatAgentProofChecklistCompact,
  formatAgentProofChecklistStatusCompact
} from '../src/agent-proof-checklist.mjs';

test('agent proof checklist builds a safe candidate-only proof handoff', async () => {
  const checklist = await buildAgentProofChecklist({
    rootDir: '/tmp/sba-test-root',
    generatedAt: '2026-05-31T00:00:00.000Z',
    candidate: 'github',
    bundle: {
      complete: false,
      verdict: 'not-complete',
      targetDir: '/tmp/sba-test-root/runs/target-packs/github',
      authState: 'metadata-only-login-like',
      authUsable: false,
      captureBlocked: true,
      automationBlocker: 'auth-check-not-ok',
      acceptedExternalProofs: 0,
      readinessRemainingCount: 1,
      readinessRemaining: ['real-external-auth-target'],
      missingArtifacts: ['auth-check', 'target-proof'],
      targetApprovalOperatorApprovalRequired: true,
      targetApprovalOperatorCommandOpensBrowser: true,
      targetApprovalOperatorCommandStartsCapture: true,
      commands: {
        agentPreflight: { shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'" },
        completionProofBundle: { shell: "'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'" },
        completionProofBundleWrite: { shell: "'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator/completion-proof-bundle-latest.json' '--format' 'compact'" },
        completionProofBundleStatus: { shell: "'node' 'src/cli.mjs' 'completion-proof-bundle-status' '--in' 'operator/completion-proof-bundle-latest.json' '--format' 'compact'" },
        targetProofPlan: { shell: "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'" },
        operatorResume: { shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'" }
      }
    }
  });

  assert.equal(checklist.safeMode, true);
  assert.equal(checklist.statusOnly, true);
  assert.equal(checklist.destructiveActionsIncluded, false);
  assert.equal(checklist.secretValuesRead, false);
  assert.equal(checklist.opensBrowserNow, false);
  assert.equal(checklist.startsCaptureNow, false);
  assert.equal(checklist.readsBrowserStorage, false);
  assert.equal(checklist.pageContentReturned, false);
  assert.equal(checklist.complete, false);
  assert.equal(checklist.candidate, 'github');
  assert.equal(checklist.nextOperatorAction, 'complete-login-and-run-operator-resume');
  assert.equal(checklist.operatorApprovalRequired, true);
  assert.equal(checklist.operatorCommandOpensBrowser, true);
  assert.equal(checklist.operatorCommandStartsCapture, true);
  assert.equal(checklist.operatorApprovalToken, 'OK');
  assert.equal(checklist.agentMustNotRunOperatorResumeUnattended, true);
  assert.equal(checklist.readinessRemainingCount, 1);
  assert.deepEqual(checklist.readinessRemaining, ['real-external-auth-target']);
  assert.deepEqual(checklist.missingArtifacts, ['auth-check', 'target-proof']);

  const compact = formatAgentProofChecklistCompact(checklist);
  assert.match(compact, /^safe_mode: yes$/m);
  assert.match(compact, /^status_only: yes$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^reads_browser_storage: no$/m);
  assert.match(compact, /^page_content_returned: no$/m);
  assert.match(compact, /^readiness_remaining_count: 1$/m);
  assert.match(compact, /^readiness_remaining: real-external-auth-target$/m);
  assert.match(compact, /^operator_approval_token: OK$/m);
  assert.match(compact, /^agent_must_not_run_operator_resume_unattended: yes$/m);
  assert.match(compact, /^agent_proof_checklist_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist'/m);
  assert.match(compact, /^agent_proof_checklist_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_checklist_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist-status' '--in' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
  assert.match(compact, /^completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status'/m);
  assert.match(compact, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
  assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^\{/);
});

test('agent proof checklist writes and status reads only runs-scoped JSON', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-proof-checklist-'));
  const checklist = await buildAgentProofChecklist({
    rootDir,
    generatedAt: '2026-05-31T00:00:00.000Z',
    candidate: 'github',
    write: true,
    out: 'operator/agent-proof-checklist-latest.json',
    bundle: {
      complete: false,
      verdict: 'not-complete',
      targetDir: path.join(rootDir, 'runs/target-packs/github'),
      authState: 'metadata-only-login-like',
      authUsable: false,
      captureBlocked: true,
      automationBlocker: 'auth-check-not-ok',
      acceptedExternalProofs: 0,
      readinessRemainingCount: 1,
      readinessRemaining: ['real-external-auth-target'],
      missingArtifacts: ['auth-check'],
      targetApprovalOperatorApprovalRequired: true,
      targetApprovalOperatorCommandOpensBrowser: true,
      targetApprovalOperatorCommandStartsCapture: true
    }
  });

  assert.equal(checklist.outputPath, path.join(rootDir, 'runs/operator/agent-proof-checklist-latest.json'));
  assert.equal(fs.existsSync(checklist.outputPath), true);

  const status = buildAgentProofChecklistStatus({
    rootDir,
    in: 'operator/agent-proof-checklist-latest.json',
    nowMs: new Date('2026-05-31T00:05:00.000Z').getTime()
  });
  assert.equal(status.safeMode, true);
  assert.equal(status.statusOnly, true);
  assert.equal(status.exists, true);
  assert.equal(status.parseOk, true);
  assert.equal(status.complete, false);
  assert.equal(status.candidate, 'github');
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.opensBrowserNow, false);
  assert.equal(status.startsCaptureNow, false);
  assert.equal(status.readsBrowserStorage, false);
  assert.equal(status.pageContentReturned, false);
  assert.equal(status.operatorApprovalRequired, true);
  assert.equal(status.operatorApprovalToken, 'OK');
  assert.equal(status.agentMustNotRunOperatorResumeUnattended, true);
  assert.deepEqual(status.readinessRemaining, ['real-external-auth-target']);
  assert.deepEqual(status.missingArtifacts, ['auth-check']);

  const compact = formatAgentProofChecklistStatusCompact(status);
  assert.match(compact, /^safe_mode: yes$/m);
  assert.match(compact, /^exists: yes$/m);
  assert.match(compact, /^parse_ok: yes$/m);
  assert.match(compact, /^operator_approval_token: OK$/m);
  assert.match(compact, /^agent_must_not_run_operator_resume_unattended: yes$/m);
  assert.match(compact, /^completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status' '--in' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^\{/);

  assert.throws(
    () => buildAgentProofChecklistStatus({ rootDir, in: '../outside.json' }),
    /invalid agent proof checklist output path/
  );
});
