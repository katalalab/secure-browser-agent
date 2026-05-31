import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetApprovalPreflight, formatTargetApprovalPreflightCompact } from '../src/target-approval-pack.mjs';

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

test('target approval preflight exposes saved resume handoff commands without browser work', async () => {
  const realExternalStatus = {
    selectedCandidate: 'github',
    targetDir: 'runs/target-packs/github',
    approvalPackExists: true,
    approvalPackParseOk: true,
    targetPackExists: true,
    inventory: {
      realExternal: true,
      complete: false,
      summary: {
        acceptedExternalProofs: 0
      }
    },
    target: {
      authState: 'login-like',
      authUsable: false,
      operatorGuidance: {
        captureBlocked: true,
        humanAction: 'complete-login-in-open-dedicated-browser',
        automationBlocker: 'auth-check-not-ok'
      },
      missingArtifacts: [{ id: 'auth-check' }, { id: 'output:scrape.csv' }]
    },
    nextAction: {
      id: 'handoff-resume'
    },
    nextCommandOpensBrowser: true,
    nextCommandStartsCapture: true,
    nextCommandRequiresOperatorApproval: true,
    nextCommandAgentMayRunUnattended: false,
    commands: {
      proofPlan: command(['node', 'src/cli.mjs', 'target-proof-plan', 'runs/target-packs/github', '--real-external', '--format', 'compact']),
      proofInventory: command(['node', 'src/cli.mjs', 'target-proof-inventory', '--real-external', '--format', 'compact']),
      approvalResumePlan: command(['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', 'github', '--real-external', '--format', 'compact']),
      approvalResumeRun: command(['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', 'github', '--real-external', '--run', '--operator-ok', 'OK', '--format', 'compact'])
    }
  };
  const defaultStatus = {
    ...realExternalStatus,
    inventory: {
      realExternal: false,
      complete: false,
      summary: {
        acceptedExternalProofs: 0
      }
    }
  };
  const preflight = await buildTargetApprovalPreflight({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-31T00:00:00.000Z',
    candidate: 'github',
    realExternalStatus,
    defaultStatus,
    resume: {
      plannedCommandOpensBrowser: true,
      plannedCommandStartsCapture: true
    }
  });

  assert.equal(preflight.safeMode, true);
  assert.equal(preflight.opensBrowserNow, false);
  assert.equal(preflight.startsCaptureNow, false);
  assert.equal(preflight.readsBrowserStorage, false);
  assert.equal(preflight.agentSafeNextCommandId, 'target-proof-plan');
  assert.equal(preflight.approvalResumeWriteCommand.args.includes('--write'), true);
  assert.equal(preflight.approvalResumeStatusCommand.args.includes('target-approval-resume-status'), true);
  assert.equal(preflight.approvalResumeWatchCommand.args.includes('target-approval-resume-watch'), true);
  assert.equal(preflight.approvalResumeWatchCommand.args.includes('--run'), true);
  assert.equal(preflight.approvalResumeRunCommand.args.includes('--operator-ok'), true);
  assert.equal(preflight.completionProofBundleWithAuditCommand.args.includes('--include-compact-command-audit'), true);
  assert.equal(preflight.agentProofCloseoutWriteCommand.args.includes('agent-proof-closeout'), true);
  assert.equal(preflight.agentProofCloseoutStatusCommand.args.includes('agent-proof-closeout-status'), true);
  assert.equal(preflight.objectiveCompletionStrictCommand.args.includes('--strict'), true);

  const compact = formatTargetApprovalPreflightCompact(preflight);
  assert.match(compact, /^approval_resume_write_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^approval_resume_status_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-status' '--in' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^approval_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator\/target-approval-resume-latest\.json' '--out' 'operator\/target-approval-resume-latest\.json' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
});
