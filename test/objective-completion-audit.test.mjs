import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildObjectiveCompletionAudit, buildObjectiveCompletionAuditStatus, buildObjectiveCompletionAuditWatch, formatObjectiveCompletionAuditCompact, formatObjectiveCompletionAuditMarkdown, formatObjectiveCompletionAuditStatusCompact, formatObjectiveCompletionAuditWatchCompact } from '../src/objective-completion-audit.mjs';

function readinessFixture(overrides = {}) {
  const requirements = overrides.requirements || [
    {
      id: 'provider-decision',
      requirement: 'Choose a backend.',
      status: 'proved',
      evidence: ['defaultBackend=direct-cdp-chrome']
    },
    {
      id: 'agent-interface',
      requirement: 'Expose low-token browser operations.',
      status: 'proved',
      evidence: [
        'agentNext=present',
        'mcpAgentNext=present',
        'agentNextProofPlan=present',
        'mcpCompactNextActions=present',
        'runGateAudit=present',
        'runGateUnguardedAgentDangerous=0'
      ]
    },
    {
      id: 'real-external-auth-target',
      requirement: 'Prove a real external authenticated target.',
      status: 'manual-required',
      evidence: ['acceptedExternalProofs=0'],
      next: 'Complete operator login and capture proof.'
    }
  ];
  const manualRequired = requirements.filter((item) => item.status === 'manual-required').length;
  const missing = requirements.filter((item) => item.status === 'missing').length;
  return {
    generatedAt: '2026-05-28T00:00:00.000Z',
    rootDir: '/tmp/sba',
    objective: 'Fast secure browser automation.',
    readyForLocalAuthenticatedDevelopment: missing === 0,
    completeAgainstObjective: missing === 0 && manualRequired === 0,
    summary: {
      proved: requirements.filter((item) => item.status === 'proved').length,
      'manual-required': manualRequired,
      missing
    },
    requirements,
    next: requirements.filter((item) => item.status !== 'proved').map((item) => `${item.id}: ${item.next || ''}`)
  };
}

const missingProofArtifacts = [
  { id: 'auth-check', kind: 'proof', path: 'proof/auth-check.json', detail: 'auth-check proof is missing or still login-like' },
  { id: 'output:observe.json', kind: 'output', path: 'observe.json', detail: 'required output file is missing or empty' },
  { id: 'benchmark', kind: 'proof', path: 'proof/target-benchmark.json', detail: 'target benchmark proof is missing or has no successful run' }
];

test('objective completion audit stays incomplete until every criterion is proved', async () => {
  const audit = await buildObjectiveCompletionAudit({
    generatedAt: '2026-05-28T00:00:00.000Z',
    rootDir: '/tmp/sba',
    readiness: readinessFixture(),
    next: {
      primaryAction: {
        id: 'target-login-capture',
        status: 'ready',
        label: 'Open login and capture proof',
        needsOperatorInput: true,
        command: { shell: 'node src/cli.mjs target-login-capture runs/target-packs/github' },
        nextArtifactAction: 'wait-auth-then-capture-proof',
        nextArtifactBlocker: 'operator-login-required',
        artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof'],
        missingArtifacts: missingProofArtifacts,
        manualCommands: ['node src/cli.mjs target-login-capture runs/target-packs/github --open-only'],
        manualCommandCandidates: [
          {
            id: 'auth-watch',
            label: 'Watch auth only',
            command: { shell: 'node src/cli.mjs target-auth-watch runs/target-packs/github --format compact' }
          },
          {
            id: 'open-only',
            label: 'Open login only',
            command: { shell: 'node src/cli.mjs target-login-capture runs/target-packs/github --open-only' }
          }
        ]
      }
    },
    targetApprovalStatus: {
      approvalPackExists: true,
      approvalPackParseOk: true,
      selectedCandidate: 'github',
      targetPackExists: true,
      inventory: {
        realExternal: true
      },
      nextAction: {
        id: 'handoff-resume'
      },
      target: {
        operatorGuidance: {
          humanAction: 'complete-login-in-open-dedicated-browser',
          automationBlocker: 'auth-check-not-ok',
          captureBlocked: true
        }
      },
      nextCommandOpensBrowser: true,
      nextCommandStartsCapture: true,
      nextCommandRequiresOperatorApproval: true,
      nextCommandAgentMayRunUnattended: false
    },
    targetApprovalResume: {
      status: 'planned',
      readyToRun: true,
      operatorOkRequired: true,
      operatorOkAccepted: false,
      plannedCommandOpensBrowser: true,
      plannedCommandStartsCapture: true,
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      preflightCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      proofPlanCommand: {
        shell: "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'"
      },
      runCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      }
    }
  });

  assert.equal(audit.complete, false);
  assert.equal(audit.status, 'incomplete');
  assert.equal(audit.finalGate.remainingCount, 1);
  assert.equal(audit.remaining[0].id, 'real-external-auth-target');
  assert.equal(audit.criteria.find((item) => item.id === 'real-external-auth-target').verdict, 'not-proved-current');
  const markdown = formatObjectiveCompletionAuditMarkdown(audit);
  assert.match(markdown, /Complete: no/);
  assert.match(markdown, /target-login-capture/);
  assert.match(markdown, /Next artifact action: wait-auth-then-capture-proof/);
  assert.match(markdown, /Artifact command covers: auth-check, observe, inspect, scrape, benchmark, target-proof/);
  assert.match(markdown, /Missing Artifacts/);
  assert.match(markdown, /Agent safe command ID: auth-watch/);
  assert.match(markdown, /Agent safe command monitor-only: yes/);
  assert.match(markdown, /Agent Safe Command/);
  assert.match(markdown, /target-auth-watch/);
  assert.match(markdown, /Target Approval Resume/);
  assert.match(markdown, /Target Approval Preflight Command/);
  assert.match(markdown, /Target Approval Resume Preflight Command/);
  assert.match(markdown, /Target Approval Resume Proof Plan Command/);
  assert.match(markdown, /Target Approval Resume Status Command/);
  assert.match(markdown, /Target Approval Resume Watch Command/);
  assert.match(markdown, /target-approval-resume/);
  assert.match(markdown, /auth-check \(proof\/auth-check\.json\)/);
  assert.match(markdown, /output:observe\.json \(observe\.json\)/);
  assert.match(markdown, /open-only: Open login only/);
  assert.match(markdown, /--open-only/);
  const compact = formatObjectiveCompletionAuditCompact(audit);
  assert.match(compact, /^status: incomplete$/m);
  assert.match(compact, /^complete: no$/m);
  assert.match(compact, /^remaining_count: 1$/m);
  assert.match(compact, /^remaining: real-external-auth-target$/m);
  assert.match(compact, /^agent_interface_status: proved$/m);
  assert.match(compact, /^agent_interface_agent_next: present$/m);
  assert.match(compact, /^agent_interface_mcp_agent_next: present$/m);
  assert.match(compact, /^agent_interface_agent_next_proof_plan: present$/m);
  assert.match(compact, /^agent_interface_agent_control_plane: none$/m);
  assert.match(compact, /^agent_interface_mcp_agent_control_plane: none$/m);
  assert.match(compact, /^agent_interface_agent_control_plane_status: none$/m);
  assert.match(compact, /^agent_interface_mcp_agent_control_plane_status: none$/m);
  assert.match(compact, /^agent_interface_agent_control_plane_watch: none$/m);
  assert.match(compact, /^agent_interface_mcp_agent_control_plane_watch: none$/m);
  assert.match(compact, /^agent_interface_operator_runbook: none$/m);
  assert.match(compact, /^agent_interface_mcp_operator_runbook: none$/m);
  assert.match(compact, /^agent_interface_mcp_handoff_compact: none$/m);
  assert.match(compact, /^agent_interface_agent_proof_closeout_status: none$/m);
  assert.match(compact, /^agent_interface_mcp_agent_proof_closeout_status: none$/m);
  assert.match(compact, /^agent_interface_mcp_next_action_compact: present$/m);
  assert.match(compact, /^agent_interface_run_gate_audit: present$/m);
  assert.match(compact, /^agent_interface_run_gate_unguarded_agent_dangerous: 0$/m);
  assert.match(compact, /^next: target-login-capture$/m);
  assert.match(compact, /^operator_input: yes$/m);
  assert.match(compact, /^next_command_opens_browser: yes$/m);
  assert.match(compact, /^next_command_starts_capture: yes$/m);
  assert.match(compact, /^next_command_requires_operator_approval: yes$/m);
  assert.match(compact, /^next_command_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_safe_action: monitor-auth-watch$/m);
  assert.match(compact, /^agent_safe_command_id: auth-watch$/m);
  assert.match(compact, /^agent_safe_command_monitor_only: yes$/m);
  assert.match(compact, /^agent_safe_command_may_open_browser: no$/m);
  assert.match(compact, /^agent_safe_command_starts_capture: no$/m);
  assert.match(compact, /^next_artifact_action: wait-auth-then-capture-proof$/m);
  assert.match(compact, /^next_artifact_blocker: operator-login-required$/m);
  assert.match(compact, /^artifact_command_covers: auth-check,observe,inspect,scrape,benchmark,target-proof$/m);
  assert.match(compact, /^missing_artifact_count: 3$/m);
  assert.match(compact, /^missing_artifacts: auth-check,output:observe\.json,benchmark$/m);
  assert.match(compact, /^agent_proof_step_available: yes$/m);
  assert.match(compact, /^agent_proof_step_start_ready: no$/m);
  assert.match(compact, /^agent_proof_step_start_blockers: operator-ok-required,agent-proof-step-not-allowed:auth-not-ready$/m);
  assert.match(compact, /^agent_proof_step_opens_browser_now: no$/m);
  assert.match(compact, /^agent_proof_step_starts_capture_now: no$/m);
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
  assert.match(compact, /^secret_values_read: no$/m);
  assert.match(compact, /^destructive_actions: no$/m);
  assert.match(compact, /^agent_safe_command: node src\/cli\.mjs target-auth-watch runs\/target-packs\/github --format compact$/m);
  assert.match(compact, /^agent_proof_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-proof-step' '--target-dir' 'runs\/target-packs\/github' '--handoff' 'operator-handoff\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_step_start_command: 'node' 'src\/cli\.mjs' 'agent-proof-step-start' '--run' '--operator-ok' 'OK' '--out' 'operator\/agent-proof-step-latest\.json' '--timeout-ms' '300000' '--target-dir' 'runs\/target-packs\/github' '--handoff' 'operator-handoff\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_step_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-step-status' '--in' 'operator\/agent-proof-step-latest\.json' '--format' 'compact'$/m);
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
  assert.match(compact, /^target_approval_completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^next_agent_run_command: /m);
  assert.match(compact, /^next_operator_approval_command: node src\/cli\.mjs target-login-capture runs\/target-packs\/github$/m);
  assert.doesNotMatch(compact, /^command: node src\/cli\.mjs target-login-capture runs\/target-packs\/github$/m);
});

test('objective completion audit completes only with proved readiness criteria', async () => {
  const audit = await buildObjectiveCompletionAudit({
    rootDir: '/tmp/sba',
    readiness: readinessFixture({
      requirements: [
        {
          id: 'provider-decision',
          requirement: 'Choose a backend.',
          status: 'proved',
          evidence: ['defaultBackend=direct-cdp-chrome']
        },
        {
          id: 'real-external-auth-target',
          requirement: 'Prove a real external authenticated target.',
          status: 'proved',
          evidence: ['acceptedExternalProofs=1']
        }
      ]
    }),
    next: {
      primaryAction: {
        id: 'complete',
        status: 'satisfied',
        label: 'Objective is complete',
        needsOperatorInput: false
      }
    }
  });

  assert.equal(audit.complete, true);
  assert.equal(audit.status, 'complete');
  assert.equal(audit.finalGate.allCriteriaProved, true);
  assert.equal(audit.remaining.length, 0);
});

test('objective completion audit suppresses auth-watch when saved handoff port is stale', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-stale-handoff-'));
  try {
    const handoffDir = path.join(rootDir, 'runs/target-packs/github/outputs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, 'operator-handoff.json'), `${JSON.stringify({
      handoff: {
        commands: [
          {
            id: 'post-login-capture',
            args: ['node', 'src/cli.mjs', 'target-proof-capture', path.join(rootDir, 'runs/target-packs/github'), '--auth-check-port', '59036']
          }
        ]
      }
    }, null, 2)}\n`, 'utf8');

    const audit = await buildObjectiveCompletionAudit({
      rootDir,
      readiness: readinessFixture(),
      authWatchHandoffPortReachable: false,
      next: {
        primaryAction: {
          id: 'target-handoff-resume',
          status: 'ready',
          label: 'Resume saved handoff',
          needsOperatorInput: true,
          command: {
            shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth'",
            args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--open-login', '--wait-auth']
          },
          operatorGuidance: {
            humanAction: 'complete-login-in-open-dedicated-browser',
            automationBlocker: 'auth-check-not-ok',
            captureBlocked: true
          },
          nextArtifactAction: 'wait-auth-then-capture-proof',
          nextArtifactBlocker: 'auth-check-not-ok',
          artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof'],
          missingArtifacts: missingProofArtifacts,
          manualCommandCandidates: [
            {
              id: 'auth-watch',
              label: 'Watch auth only',
              command: {
                shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'",
                args: ['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--format', 'compact']
              }
            }
          ]
        }
      }
    });

    assert.equal(audit.executionPolicy.agentSafeCommandId, 'none');
    assert.equal(audit.executionPolicy.agentSafeCommand, null);
    assert.equal(audit.executionPolicy.agentSafeAction, 'reopen-login-browser-required');
    assert.equal(audit.executionPolicy.agentSafeCommandBlockedReason, 'handoff-auth-check-port-unreachable');
    assert.equal(audit.executionPolicy.authWatchHandoffPort, 59036);
    assert.equal(audit.executionPolicy.authWatchHandoffPortReachable, false);

    const compact = formatObjectiveCompletionAuditCompact(audit);
    assert.match(compact, /^agent_safe_action: reopen-login-browser-required$/m);
    assert.match(compact, /^agent_safe_command_id: none$/m);
    assert.match(compact, /^agent_safe_command_blocked_reason: handoff-auth-check-port-unreachable$/m);
    assert.match(compact, /^auth_watch_handoff_port: 59036$/m);
    assert.match(compact, /^auth_watch_handoff_port_reachable: no$/m);
    assert.match(compact, /^next_command_opens_browser: yes$/m);
    assert.match(compact, /^next_command_starts_capture: yes$/m);
    assert.match(compact, /^next_command_requires_operator_approval: yes$/m);
    assert.match(compact, /^next_command_agent_may_run_unattended: no$/m);
    assert.doesNotMatch(compact, /^next_agent_run_command: /m);
    assert.match(compact, /^next_operator_approval_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^agent_safe_command: /m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('objective completion audit never exposes operator-only primary as agent safe command', async () => {
  const audit = await buildObjectiveCompletionAudit({
    rootDir: '/tmp/sba',
    readiness: readinessFixture(),
    next: {
      primaryAction: {
        id: 'target-handoff-resume',
        status: 'ready',
        label: 'Resume saved handoff',
        needsOperatorInput: true,
        command: {
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth'",
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--open-login', '--wait-auth']
        },
        operatorGuidance: {
          humanAction: 'complete-login-in-open-dedicated-browser',
          automationBlocker: 'auth-check-not-ok',
          captureBlocked: true
        },
        nextArtifactAction: 'wait-auth-then-capture-proof',
        nextArtifactBlocker: 'auth-check-not-ok',
        artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof'],
        missingArtifacts: missingProofArtifacts,
        manualCommandCandidates: []
      }
    }
  });

  assert.equal(audit.executionPolicy.agentSafeCommandId, 'none');
  assert.equal(audit.executionPolicy.agentSafeCommand, null);
  assert.equal(audit.executionPolicy.agentSafeCommandBlockedReason, 'operator-approval-required');

  const compact = formatObjectiveCompletionAuditCompact(audit);
  assert.match(compact, /^agent_safe_action: operator-approval-required$/m);
  assert.match(compact, /^agent_safe_command_id: none$/m);
  assert.match(compact, /^agent_safe_command_blocked_reason: operator-approval-required$/m);
  assert.match(compact, /^next_command_requires_operator_approval: yes$/m);
  assert.match(compact, /^next_operator_approval_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^agent_safe_command: /m);
  assert.doesNotMatch(compact, /^next_agent_run_command: /m);
  assert.doesNotMatch(compact, /^command: /m);
});

test('objective completion audit status reads saved JSON without recomputing browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-completion-status-'));
  try {
    const audit = await buildObjectiveCompletionAudit({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      readiness: readinessFixture(),
      write: true,
      out: 'operator/objective-completion-audit-latest.json',
      next: {
        primaryAction: {
          id: 'target-handoff-resume',
          status: 'ready',
          needsOperatorInput: true,
          command: {
            shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth'",
            args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--open-login', '--wait-auth']
          },
          operatorGuidance: {
            captureBlocked: true
          },
          missingArtifacts: missingProofArtifacts
        }
      }
    });
    assert.ok(fs.existsSync(audit.outputPath));

    const status = buildObjectiveCompletionAuditStatus({
      rootDir,
      in: 'operator/objective-completion-audit-latest.json',
      nowMs: Date.parse('2026-05-28T00:00:01.000Z'),
      staleAfterSeconds: 900
    });

    assert.equal(status.exists, true);
    assert.equal(status.parseOk, true);
    assert.equal(status.savedComplete, false);
    assert.equal(status.remainingCount, 1);
    assert.deepEqual(status.remaining, ['real-external-auth-target']);
    assert.equal(status.nextActionId, 'target-handoff-resume');
    assert.equal(status.nextCommandRequiresOperatorApproval, true);
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.opensBrowserNow, false);
    assert.equal(status.startsCaptureNow, false);
    assert.equal(status.readsBrowserStorage, false);
    assert.equal(status.operatorApprovalSummaryRequiresOperatorOk, true);
    assert.equal(status.operatorApprovalSummaryOperatorOkAccepted, false);
    assert.equal(status.operatorApprovalSummaryMayOpenBrowser, true);
    assert.equal(status.operatorApprovalSummaryMayStartCapture, true);
    assert.equal(status.operatorApprovalSummaryReadsBrowserStorage, false);
    assert.equal(status.operatorApprovalSummaryReturnsPageContent, false);
    assert.equal(status.operatorApprovalSummaryAgentMustNotRunUnattended, true);
    const compact = formatObjectiveCompletionAuditStatusCompact(status);
    assert.match(compact, /^saved_status: incomplete$/m);
    assert.match(compact, /^saved_complete: no$/m);
    assert.match(compact, /^remaining: real-external-auth-target$/m);
    assert.match(compact, /^agent_safe_next_command_id: objective-completion-audit-strict$/m);
    assert.match(compact, /^operator_approval_summary_requires_operator_ok: yes$/m);
    assert.match(compact, /^operator_approval_summary_operator_ok_accepted: no$/m);
    assert.match(compact, /^operator_approval_summary_may_open_browser: yes$/m);
    assert.match(compact, /^operator_approval_summary_may_start_capture: yes$/m);
    assert.match(compact, /^operator_approval_summary_reads_browser_storage: no$/m);
    assert.match(compact, /^operator_approval_summary_returns_page_content: no$/m);
    assert.match(compact, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
    assert.match(compact, /^strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('objective completion audit watch refreshes missing saved JSON only when run is requested', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-completion-watch-'));
  try {
    const dry = await buildObjectiveCompletionAuditWatch({
      rootDir,
      run: false,
      in: 'operator/objective-completion-audit-latest.json',
      out: 'operator/objective-completion-audit-latest.json',
      readiness: readinessFixture()
    });
    assert.equal(dry.executed, false);
    assert.equal(dry.after.exists, false);

    const watch = await buildObjectiveCompletionAuditWatch({
      rootDir,
      run: true,
      in: 'operator/objective-completion-audit-latest.json',
      out: 'operator/objective-completion-audit-latest.json',
      readiness: readinessFixture({
        requirements: [
          {
            id: 'provider-decision',
            requirement: 'Choose a backend.',
            status: 'proved',
            evidence: ['defaultBackend=direct-cdp-chrome']
          }
        ]
      }),
      next: {
        primaryAction: {
          id: 'complete',
          status: 'complete',
          needsOperatorInput: false
        }
      }
    });
    assert.equal(watch.executed, true);
    assert.equal(watch.after.exists, true);
    assert.equal(watch.after.parseOk, true);
    assert.equal(watch.after.savedComplete, true);
    assert.equal(watch.after.remainingCount, 0);
    assert.equal(watch.opensBrowserNow, false);
    assert.equal(watch.startsCaptureNow, false);
    assert.equal(watch.secretValuesRead, false);
    const compact = formatObjectiveCompletionAuditWatchCompact(watch);
    assert.match(compact, /^executed: yes$/m);
    assert.match(compact, /^after_saved_complete: yes$/m);
    assert.match(compact, /^after_remaining: none$/m);
    assert.match(compact, /^strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('objective completion audit status and watch reject paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-objective-completion-paths-'));
  try {
    assert.throws(() => buildObjectiveCompletionAuditStatus({ rootDir, in: '../outside.json' }), /invalid objective completion audit path/);
    await assert.rejects(
      () => buildObjectiveCompletionAuditWatch({ rootDir, run: true, in: 'operator/a.json', out: '../outside.json' }),
      /invalid objective completion audit path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
