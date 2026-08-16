#!/usr/bin/env node
import assert from 'node:assert/strict';
import { handleMcpMessage } from '../src/mcp-server.mjs';

const TOOL_TIMEOUT_MS = Number(process.env.SBA_MCP_COMPACT_TOOL_TIMEOUT_MS || 240000);
const TOTAL_TIMEOUT_MS = Number(process.env.SBA_MCP_COMPACT_TOTAL_TIMEOUT_MS || 900000);
// Flags come from argv as well as env: `VAR=1 node ...` is POSIX-only and fails on cmd.exe.
const SHOW_PROGRESS = process.env.SBA_MCP_COMPACT_PROGRESS === '1' || process.argv.includes('--progress');
const FAST_SMOKE = process.env.SBA_MCP_COMPACT_FAST === '1' || process.argv.includes('--fast');
const COMPACT_AUDIT_SOURCE = FAST_SMOKE ? 'run-gate-audit' : 'all';
let activeTool = 'startup';
const startedAt = Date.now();
const totalWatchdog = setTimeout(() => {
  const elapsedMs = Date.now() - startedAt;
  process.stderr.write(`mcp compact smoke timed out after ${elapsedMs}ms active_tool=${activeTool}\n`);
  process.exit(124);
}, TOTAL_TIMEOUT_MS);

async function callTool(id, name, args = {}) {
  activeTool = `${id}:${name}`;
  const toolStartedAt = Date.now();
  if (SHOW_PROGRESS) process.stderr.write(`mcp compact smoke start ${activeTool}\n`);
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`MCP compact smoke tool timed out after ${TOOL_TIMEOUT_MS}ms: ${activeTool}`));
    }, TOOL_TIMEOUT_MS);
  });
  let response;
  try {
    response = await Promise.race([handleMcpMessage({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    }), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
  if (response.error) throw new Error(response.error.message);
  if (SHOW_PROGRESS) process.stderr.write(`mcp compact smoke ok ${activeTool} ${Date.now() - toolStartedAt}ms\n`);
  activeTool = 'idle';
  return response.result;
}

function finishSmoke() {
  clearTimeout(totalWatchdog);
  process.stdout.write('mcp compact smoke: ok\n');
}

const cleanup = await callTool(1, 'sba_runtime_cleanup_plan', {
  ownerLimit: 1,
  format: 'compact'
});
assert.equal(cleanup.isError, false);
assert.match(cleanup.content[0].text, /^safe_mode: yes$/m);
assert.match(cleanup.content[0].text, /^destructive_actions: no$/m);
assert.equal(typeof cleanup.structuredContent.summary.ownerSessionCount, 'number');

const runGateAudit = await callTool(11, 'sba_run_gate_audit', {
  format: 'compact'
});
assert.equal(runGateAudit.isError, false);
assert.match(runGateAudit.content[0].text, /^safe_mode: yes$/m);
assert.match(runGateAudit.content[0].text, /^exact_operator_ok_required: /m);
assert.match(runGateAudit.content[0].text, /^unguarded_agent_dangerous: 0$/m);
assert.match(runGateAudit.content[0].text, /^ok_for_agent_loops: yes$/m);
assert.match(runGateAudit.content[0].text, /^surface_target-approval-resume_exact_operator_ok_required: yes$/m);
assert.match(runGateAudit.content[0].text, /^surface_target-approval-resume_preferred_agent_surface: target-approval-resume --run --operator-ok OK$/m);
assert.equal(runGateAudit.structuredContent.summary.okForAgentLoops, true);
assert.equal(runGateAudit.structuredContent.secretValuesRead, false);

const compactCommandAudit = await callTool(12, 'sba_compact_command_audit', {
  source: COMPACT_AUDIT_SOURCE,
  monitorTimeoutMs: 10000,
  monitorIntervalMs: 1000,
  format: 'compact'
});
assert.equal(compactCommandAudit.isError, false);
assert.match(compactCommandAudit.content[0].text, new RegExp(`^source: ${COMPACT_AUDIT_SOURCE}$`, 'm'));
assert.match(compactCommandAudit.content[0].text, /^complete: yes$/m);
assert.match(compactCommandAudit.content[0].text, /^safe_for_strict_agent_loops: yes$/m);
assert.match(compactCommandAudit.content[0].text, /^unclassified_risk_count: 0$/m);
assert.match(compactCommandAudit.content[0].text, /^missing_approval_count: 0$/m);
if (!FAST_SMOKE) {
  assert.match(compactCommandAudit.content[0].text, /^source_operator-pack_complete: yes$/m);
  assert.match(compactCommandAudit.content[0].text, /^source_control-status_complete: yes$/m);
  assert.match(compactCommandAudit.content[0].text, /^source_objective-completion-audit_complete: yes$/m);
  assert.match(compactCommandAudit.content[0].text, /^source_run-gate-audit_complete: yes$/m);
}
assert.equal(compactCommandAudit.structuredContent.safeForStrictAgentLoops, true);

const controlStatus = await callTool(2, 'sba_control_status', {
  format: 'compact'
});
assert.equal(controlStatus.isError, false);
assert.match(controlStatus.content[0].text, /^objective_status: /m);
assert.match(controlStatus.content[0].text, /^objective_safe_command_id: /m);
assert.match(controlStatus.content[0].text, /^objective_safe_command_monitor_only: /m);
assert.match(controlStatus.content[0].text, /^background_proof_plan_status: /m);
assert.match(controlStatus.content[0].text, /^background_proof_capture_blocked: /m);
assert.match(controlStatus.content[0].text, /^background_proof_opens_browser_now: no$/m);
assert.match(controlStatus.content[0].text, /^background_proof_starts_capture_now: no$/m);
assert.match(controlStatus.content[0].text, /^handoff_resume_watch_available: /m);
assert.match(controlStatus.content[0].text, /^handoff_resume_watch_may_open_browser: no$/m);
assert.match(controlStatus.content[0].text, /^target_approval_resume_status: /m);
assert.match(controlStatus.content[0].text, /^operator_approval_summary_requires_operator_ok: /m);
assert.match(controlStatus.content[0].text, /^operator_approval_summary_operator_ok_accepted: /m);
assert.match(controlStatus.content[0].text, /^operator_approval_summary_may_open_browser: /m);
assert.match(controlStatus.content[0].text, /^operator_approval_summary_may_start_capture: /m);
assert.match(controlStatus.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(controlStatus.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(controlStatus.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: /m);
assert.match(controlStatus.content[0].text, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(controlStatus.content[0].text, /^target_approval_resume_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(controlStatus.content[0].text, /^target_approval_resume_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
assert.match(controlStatus.content[0].text, /^target_approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
assert.match(controlStatus.content[0].text, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
assert.match(controlStatus.content[0].text, /^agent_loop_next_action: /m);
assert.match(controlStatus.content[0].text, /^agent_loop_can_run_without_approval: /m);
assert.match(controlStatus.content[0].text, /^agent_loop_command_id: /m);
assert.match(controlStatus.content[0].text, /^agent_loop_user_approval_required_for_background_start: /m);
assert.match(controlStatus.content[0].text, /^agent_loop_opens_browser_now: no$/m);
assert.match(controlStatus.content[0].text, /^agent_loop_starts_capture_now: no$/m);
assert.match(controlStatus.content[0].text, /^backend_matrix_status: /m);
assert.match(controlStatus.content[0].text, /^backend_matrix_default_backend: /m);
assert.match(controlStatus.content[0].text, /^backend_matrix_authenticated_backend: /m);
assert.match(controlStatus.content[0].text, /^backend_matrix_existing_tab_backend: /m);
assert.match(controlStatus.content[0].text, /^backend_matrix_saved_secret_values_read: no$/m);
assert.match(controlStatus.content[0].text, /^provider_doctor_default_backend: /m);
assert.match(controlStatus.content[0].text, /^provider_doctor_playwright_ready_for_public_smoke: /m);
assert.match(controlStatus.content[0].text, /^provider_doctor_playwright_ready_for_authenticated_default: no$/m);
assert.match(controlStatus.content[0].text, /^provider_doctor_playwright_smoke_reads_browser_storage: no$/m);
assert.match(controlStatus.content[0].text, /^objective_safe_command: 'node' 'src\/cli\.mjs' 'objective-safe-command'/m);
assert.match(controlStatus.content[0].text, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status'/m);
assert.match(controlStatus.content[0].text, /^runtime_audit_command: 'node' 'src\/cli\.mjs' 'runtime-audit'/m);
assert.match(controlStatus.content[0].text, /^runtime_cleanup_plan_command: 'node' 'src\/cli\.mjs' 'runtime-cleanup-plan'/m);
assert.match(controlStatus.content[0].text, /^backend_matrix_refresh_command: 'node' 'src\/cli\.mjs' 'backend-matrix'/m);
assert.match(controlStatus.content[0].text, /^backend_matrix_status_command: 'node' 'src\/cli\.mjs' 'backend-matrix-status'/m);
assert.match(controlStatus.content[0].text, /^background_proof_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status'/m);
assert.match(controlStatus.content[0].text, /^agent_loop_status_command: 'node' 'src\/cli\.mjs' 'control-status'/m);
assert.match(controlStatus.content[0].text, /^agent_loop_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
if (controlStatus.structuredContent.agentLoop.stepRunCommand) {
  assert.match(controlStatus.content[0].text, /^agent_loop_step_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
}
assert.match(controlStatus.content[0].text, /^agent_loop_step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
assert.equal(controlStatus.structuredContent.secretValuesRead, false);
assert.equal(typeof controlStatus.structuredContent.objectiveSafeCommand.commandId, 'string');
assert.equal(typeof controlStatus.structuredContent.agentLoop.nextAction, 'string');
assert.equal(controlStatus.structuredContent.backendMatrix.savedSecretValuesRead, false);
assert.equal(typeof controlStatus.structuredContent.providerDoctorStatus.playwrightReadyForPublicSmoke, 'boolean');
assert.equal(typeof controlStatus.structuredContent.agentLoop.canRunWithoutApproval, 'boolean');

const agentNext = await callTool(21, 'sba_agent_next', {
  format: 'compact'
});
assert.equal(agentNext.isError, false);
assert.match(agentNext.content[0].text, /^safe_mode: yes$/m);
assert.match(agentNext.content[0].text, /^agent_next_action: /m);
assert.match(agentNext.content[0].text, /^agent_can_run_without_approval: /m);
assert.match(agentNext.content[0].text, /^agent_proof_plan_available: /m);
assert.match(agentNext.content[0].text, /^agent_proof_plan_may_run_without_approval: /m);
assert.match(agentNext.content[0].text, /^operator_approval_required: /m);
assert.match(agentNext.content[0].text, /^operator_approval_proof_plan_opens_browser: no$/m);
assert.match(agentNext.content[0].text, /^operator_approval_proof_plan_starts_capture: no$/m);
assert.match(agentNext.content[0].text, /^operator_approval_proof_plan_reads_browser_storage: no$/m);
assert.match(agentNext.content[0].text, /^operator_approval_proof_plan_returns_page_content: no$/m);
assert.match(agentNext.content[0].text, /^opens_browser_now: no$/m);
assert.match(agentNext.content[0].text, /^starts_capture_now: no$/m);
assert.match(agentNext.content[0].text, /^run_gate_unguarded_agent_dangerous: 0$/m);
assert.match(agentNext.content[0].text, /^provider_default_backend: /m);
assert.match(agentNext.content[0].text, /^provider_playwright_ready_for_public_smoke: /m);
assert.match(agentNext.content[0].text, /^provider_playwright_ready_for_authenticated_default: no$/m);
assert.match(agentNext.content[0].text, /^provider_playwright_storage_state_sensitive: /m);
assert.match(agentNext.content[0].text, /^provider_doctor_opens_browser: no$/m);
assert.match(agentNext.content[0].text, /^provider_doctor_starts_capture: no$/m);
assert.match(agentNext.content[0].text, /^provider_doctor_reads_browser_storage: no$/m);
assert.match(agentNext.content[0].text, /^provider_doctor_returns_page_content: no$/m);
assert.match(agentNext.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
assert.match(agentNext.content[0].text, /^provider_doctor_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
assert.doesNotMatch(agentNext.content[0].text, /^\{/);
if (!agentNext.structuredContent.agentCanRunWithoutApproval) {
  assert.doesNotMatch(agentNext.content[0].text, /^agent_run_command: /m);
}
assert.equal(agentNext.structuredContent.secretValuesRead, false);

const agentPreflight = await callTool(22, 'sba_agent_preflight', {
  format: 'compact'
});
assert.equal(agentPreflight.isError, false);
assert.match(agentPreflight.content[0].text, /^real_external_required: yes$/m);
assert.match(agentPreflight.content[0].text, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
assert.match(agentPreflight.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
assert.match(agentPreflight.content[0].text, /^opens_browser_now: no$/m);
assert.match(agentPreflight.content[0].text, /^starts_capture_now: no$/m);
assert.doesNotMatch(agentPreflight.content[0].text, /^\{/);
assert.equal(agentPreflight.structuredContent.secretValuesRead, false);
assert.equal(agentPreflight.structuredContent.realExternalRequired, true);

const agentProofChecklist = await callTool(23, 'sba_agent_proof_checklist', {
  format: 'compact'
});
assert.equal(agentProofChecklist.isError, false);
assert.match(agentProofChecklist.content[0].text, /^safe_mode: yes$/m);
assert.match(agentProofChecklist.content[0].text, /^status_only: yes$/m);
assert.match(agentProofChecklist.content[0].text, /^opens_browser_now: no$/m);
assert.match(agentProofChecklist.content[0].text, /^starts_capture_now: no$/m);
assert.match(agentProofChecklist.content[0].text, /^reads_browser_storage: no$/m);
assert.match(agentProofChecklist.content[0].text, /^page_content_returned: no$/m);
assert.match(agentProofChecklist.content[0].text, /^agent_proof_checklist_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist'/m);
assert.match(agentProofChecklist.content[0].text, /^agent_proof_checklist_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist'.*'--write'/m);
assert.match(agentProofChecklist.content[0].text, /^agent_proof_checklist_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist-status'/m);
assert.match(agentProofChecklist.content[0].text, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
assert.match(agentProofChecklist.content[0].text, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
assert.doesNotMatch(agentProofChecklist.content[0].text, /^\{/);
assert.equal(agentProofChecklist.structuredContent.secretValuesRead, false);
assert.equal(agentProofChecklist.structuredContent.opensBrowserNow, false);
assert.equal(agentProofChecklist.structuredContent.startsCaptureNow, false);
assert.equal(agentProofChecklist.structuredContent.readsBrowserStorage, false);
assert.equal(agentProofChecklist.structuredContent.pageContentReturned, false);

const agentProofChecklistStatus = await callTool(24, 'sba_agent_proof_checklist_status', {
  format: 'compact'
});
assert.equal(agentProofChecklistStatus.isError, false);
assert.match(agentProofChecklistStatus.content[0].text, /^safe_mode: yes$/m);
assert.match(agentProofChecklistStatus.content[0].text, /^exists: /m);
assert.match(agentProofChecklistStatus.content[0].text, /^target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
assert.match(agentProofChecklistStatus.content[0].text, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
assert.match(agentProofChecklistStatus.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
assert.match(agentProofChecklistStatus.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist'/m);
assert.doesNotMatch(agentProofChecklistStatus.content[0].text, /^\{/);
assert.equal(agentProofChecklistStatus.structuredContent.secretValuesRead, false);
assert.equal(agentProofChecklistStatus.structuredContent.opensBrowserNow, false);
assert.equal(agentProofChecklistStatus.structuredContent.startsCaptureNow, false);

const agentProofCloseout = await callTool(245, 'sba_agent_proof_closeout', {
  format: 'compact'
});
assert.equal(agentProofCloseout.isError, false);
assert.match(agentProofCloseout.content[0].text, /^safe_mode: yes$/m);
assert.match(agentProofCloseout.content[0].text, /^status_only: yes$/m);
assert.match(agentProofCloseout.content[0].text, /^opens_browser_now: no$/m);
assert.match(agentProofCloseout.content[0].text, /^starts_capture_now: no$/m);
assert.match(agentProofCloseout.content[0].text, /^agent_safe_next_command_id: /m);
assert.match(agentProofCloseout.content[0].text, /^agent_safe_next_may_run_unattended: /m);
assert.match(agentProofCloseout.content[0].text, /^agent_safe_next_opens_browser: no$/m);
assert.match(agentProofCloseout.content[0].text, /^agent_safe_next_starts_capture: no$/m);
assert.match(agentProofCloseout.content[0].text, /^target_approval_preflight_opens_browser: no$/m);
assert.match(agentProofCloseout.content[0].text, /^target_approval_preflight_starts_capture: no$/m);
assert.match(agentProofCloseout.content[0].text, /^next_artifact_action: /m);
assert.match(agentProofCloseout.content[0].text, /^next_artifact_blocker: /m);
assert.match(agentProofCloseout.content[0].text, /^artifact_command_covers: /m);
assert.match(agentProofCloseout.content[0].text, /^missing_artifact_count: /m);
assert.match(agentProofCloseout.content[0].text, /^operator_resume_requires_operator_approval: /m);
assert.match(agentProofCloseout.content[0].text, /^operator_resume_opens_browser: /m);
assert.match(agentProofCloseout.content[0].text, /^operator_resume_starts_capture: /m);
assert.match(agentProofCloseout.content[0].text, /^operator_resume_agent_may_run_unattended: /m);
assert.match(agentProofCloseout.content[0].text, /^provider_default_backend: /m);
assert.match(agentProofCloseout.content[0].text, /^provider_playwright_ready_for_authenticated_default: no$/m);
assert.match(agentProofCloseout.content[0].text, /^provider_doctor_opens_browser: no$/m);
assert.match(agentProofCloseout.content[0].text, /^provider_doctor_reads_browser_storage: no$/m);
assert.match(agentProofCloseout.content[0].text, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
assert.match(agentProofCloseout.content[0].text, /^agent_proof_closeout_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout'/m);
assert.match(agentProofCloseout.content[0].text, /^objective_completion_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit'/m);
assert.match(agentProofCloseout.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict'/m);
assert.match(agentProofCloseout.content[0].text, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
assert.match(agentProofCloseout.content[0].text, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.doesNotMatch(agentProofCloseout.content[0].text, /^\{/);
assert.equal(agentProofCloseout.structuredContent.secretValuesRead, false);
assert.equal(agentProofCloseout.structuredContent.opensBrowserNow, false);
assert.equal(agentProofCloseout.structuredContent.startsCaptureNow, false);
assert.equal(agentProofCloseout.structuredContent.readsBrowserStorage, false);
assert.equal(agentProofCloseout.structuredContent.agentSafeNextOpensBrowser, false);
assert.equal(agentProofCloseout.structuredContent.agentSafeNextStartsCapture, false);
assert.equal(Array.isArray(agentProofCloseout.structuredContent.artifactCommandCovers), true);
assert.equal(typeof agentProofCloseout.structuredContent.missingArtifactCount, 'number');
assert.equal(typeof agentProofCloseout.structuredContent.operatorResumeRequiresOperatorApproval, 'boolean');
assert.equal(typeof agentProofCloseout.structuredContent.operatorResumeAgentMayRunUnattended, 'boolean');

const agentProofCloseoutStatus = await callTool(246, 'sba_agent_proof_closeout_status', {
  format: 'compact'
});
assert.equal(agentProofCloseoutStatus.isError, false);
assert.match(agentProofCloseoutStatus.content[0].text, /^safe_mode: yes$/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^status_only: yes$/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^exists: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^agent_safe_next_command_id: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^agent_safe_next_opens_browser: no$/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^agent_safe_next_starts_capture: no$/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^next_artifact_action: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^next_artifact_blocker: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^artifact_command_covers: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^missing_artifact_count: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^operator_resume_requires_operator_approval: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^operator_resume_opens_browser: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^operator_resume_starts_capture: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^operator_resume_agent_may_run_unattended: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^provider_default_backend: /m);
assert.match(agentProofCloseoutStatus.content[0].text, /^provider_playwright_ready_for_authenticated_default: no$/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^provider_doctor_opens_browser: no$/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^provider_doctor_reads_browser_storage: no$/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict'/m);
assert.match(agentProofCloseoutStatus.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout'/m);
assert.doesNotMatch(agentProofCloseoutStatus.content[0].text, /^\{/);
assert.equal(agentProofCloseoutStatus.structuredContent.secretValuesRead, false);
assert.equal(agentProofCloseoutStatus.structuredContent.opensBrowserNow, false);
assert.equal(agentProofCloseoutStatus.structuredContent.startsCaptureNow, false);
assert.equal(agentProofCloseoutStatus.structuredContent.agentSafeNextOpensBrowser, false);
assert.equal(agentProofCloseoutStatus.structuredContent.agentSafeNextStartsCapture, false);
assert.equal(Array.isArray(agentProofCloseoutStatus.structuredContent.artifactCommandCovers), true);
assert.equal(typeof agentProofCloseoutStatus.structuredContent.missingArtifactCount, 'number');
assert.equal(typeof agentProofCloseoutStatus.structuredContent.operatorResumeRequiresOperatorApproval, 'boolean');
assert.equal(typeof agentProofCloseoutStatus.structuredContent.operatorResumeAgentMayRunUnattended, 'boolean');

const agentWorkflow = await callTool(25, 'sba_agent_workflow', {
  task: 'search',
  query: 'secure browser agent',
  format: 'compact'
});
assert.equal(agentWorkflow.isError, false);
assert.match(agentWorkflow.content[0].text, /^task: search$/m);
assert.match(agentWorkflow.content[0].text, /^recommended_command_id: public-search$/m);
assert.match(agentWorkflow.content[0].text, /^public_search_command: /m);
assert.doesNotMatch(agentWorkflow.content[0].text, /^\{/);
assert.equal(agentWorkflow.structuredContent.secretValuesRead, false);

const agentWorkflowExistingTab = await callTool(2510, 'sba_agent_workflow', {
  task: 'existing-tab',
  intent: 'inspect',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentWorkflowExistingTab.isError, false);
assert.match(agentWorkflowExistingTab.content[0].text, /^task: existing-tab$/m);
assert.match(agentWorkflowExistingTab.content[0].text, /^regular_chrome_use_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.match(agentWorkflowExistingTab.content[0].text, /^regular_chrome_refresh_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.match(agentWorkflowExistingTab.content[0].text, /^regular_chrome_status_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.match(agentWorkflowExistingTab.content[0].text, /^chrome_mcp_handoff_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(agentWorkflowExistingTab.content[0].text, /^\{/);
assert.equal(agentWorkflowExistingTab.structuredContent.secretValuesRead, false);

const agentBackendSelect = await callTool(250, 'sba_agent_backend_select', {
  task: 'existing-tab',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentBackendSelect.isError, false);
assert.match(agentBackendSelect.content[0].text, /^task: existing-tab$/m);
assert.match(agentBackendSelect.content[0].text, /^selector_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.match(agentBackendSelect.content[0].text, /^regular_chrome_status_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(agentBackendSelect.content[0].text, /^\{/);
assert.equal(agentBackendSelect.structuredContent.secretValuesRead, false);

const agentControlPlane = await callTool(251, 'sba_agent_control_plane', {
  task: 'search',
  query: 'secure browser agent',
  write: true,
  out: 'operator/agent-control-plane-smoke.json',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentControlPlane.isError, false);
assert.match(agentControlPlane.content[0].text, /^safe_mode: yes$/m);
assert.match(agentControlPlane.content[0].text, /^task: search$/m);
assert.match(agentControlPlane.content[0].text, /^ready_local_auth: /m);
assert.match(agentControlPlane.content[0].text, /^default_backend: /m);
assert.match(agentControlPlane.content[0].text, /^playwright_ready_for_public_smoke: /m);
assert.match(agentControlPlane.content[0].text, /^playwright_ready_for_authenticated_default: no$/m);
assert.match(agentControlPlane.content[0].text, /^playwright_storage_state_sensitive: /m);
assert.match(agentControlPlane.content[0].text, /^playwright_smoke_reads_browser_storage: no$/m);
assert.match(agentControlPlane.content[0].text, /^selected_backend: /m);
assert.match(agentControlPlane.content[0].text, /^objective_primary: /m);
assert.match(agentControlPlane.content[0].text, /^proof_pipeline_recommended_now: /m);
assert.match(agentControlPlane.content[0].text, /^proof_pipeline_background_commands_operator_gated: yes$/m);
assert.match(agentControlPlane.content[0].text, /^target_approval_resume_status: /m);
assert.match(agentControlPlane.content[0].text, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(agentControlPlane.content[0].text, /^target_approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
assert.match(agentControlPlane.content[0].text, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
assert.match(agentControlPlane.content[0].text, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
assert.match(agentControlPlane.content[0].text, /^objective_proof_pipeline_command: 'node' 'src\/cli\.mjs' 'objective-proof-pipeline' '--format' 'compact'$/m);
assert.match(agentControlPlane.content[0].text, /^proof_pipeline_background_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status' '--format' 'compact'$/m);
assert.match(agentControlPlane.content[0].text, /^self_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(agentControlPlane.content[0].text, /^\{/);
assert.equal(agentControlPlane.structuredContent.secretValuesRead, false);
assert.equal(agentControlPlane.structuredContent.opensBrowserNow, false);
assert.equal(agentControlPlane.structuredContent.outputPath, 'operator/agent-control-plane-smoke.json');

const agentControlPlaneStatus = await callTool(252, 'sba_agent_control_plane_status', {
  in: 'operator/agent-control-plane-smoke.json',
  format: 'compact'
});
assert.equal(agentControlPlaneStatus.isError, false);
assert.match(agentControlPlaneStatus.content[0].text, /^status_only: yes$/m);
assert.match(agentControlPlaneStatus.content[0].text, /^exists: yes$/m);
assert.match(agentControlPlaneStatus.content[0].text, /^parse_ok: yes$/m);
assert.match(agentControlPlaneStatus.content[0].text, /^task: search$/m);
assert.match(agentControlPlaneStatus.content[0].text, /^target_approval_resume_status: /m);
assert.match(agentControlPlaneStatus.content[0].text, /^target_approval_resume_requires_operator_approval: /m);
assert.match(agentControlPlaneStatus.content[0].text, /^target_approval_resume_agent_may_run_unattended: /m);
assert.match(agentControlPlaneStatus.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-control-plane' '--write' '--out' 'operator\/agent-control-plane-smoke\.json' '--format' 'compact'$/m);
assert.doesNotMatch(agentControlPlaneStatus.content[0].text, /^\{/);
assert.equal(agentControlPlaneStatus.structuredContent.secretValuesRead, false);
assert.equal(agentControlPlaneStatus.structuredContent.opensBrowserNow, false);

const agentControlPlaneWatch = await callTool(253, 'sba_agent_control_plane_watch', {
  in: 'operator/agent-control-plane-smoke.json',
  format: 'compact'
});
assert.equal(agentControlPlaneWatch.isError, false);
assert.match(agentControlPlaneWatch.content[0].text, /^safe_mode: yes$/m);
assert.match(agentControlPlaneWatch.content[0].text, /^run_requested: no$/m);
assert.match(agentControlPlaneWatch.content[0].text, /^executed: no$/m);
assert.match(agentControlPlaneWatch.content[0].text, /^before_exists: yes$/m);
assert.match(agentControlPlaneWatch.content[0].text, /^before_parse_ok: yes$/m);
assert.doesNotMatch(agentControlPlaneWatch.content[0].text, /^\{/);
assert.equal(agentControlPlaneWatch.structuredContent.secretValuesRead, false);
assert.equal(agentControlPlaneWatch.structuredContent.opensBrowserNow, false);
assert.equal(agentControlPlaneWatch.structuredContent.startsCaptureNow, false);

const agentTask = await callTool(26, 'sba_agent_task', {
  task: 'existing-tab',
  intent: 'inspect',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentTask.isError, false);
assert.match(agentTask.content[0].text, /^status: planned$/m);
assert.match(agentTask.content[0].text, /^execution_allowed: (yes|no)$/m);
if (/^execution_allowed: no$/m.test(agentTask.content[0].text)) {
  assert.match(agentTask.content[0].text, /^route_operator_approval_required: yes$/m);
  assert.match(agentTask.content[0].text, /^blocked_reason: /m);
} else {
  assert.match(agentTask.content[0].text, /^command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
  assert.match(agentTask.content[0].text, /^write_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
}
assert.doesNotMatch(agentTask.content[0].text, /^\{/);
assert.equal(agentTask.structuredContent.secretValuesRead, false);

const agentTaskStatus = await callTool(27, 'sba_agent_task_status', {
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentTaskStatus.isError, false);
assert.match(agentTaskStatus.content[0].text, /^status_only: yes$/m);
assert.match(agentTaskStatus.content[0].text, /^exists: /m);
assert.match(agentTaskStatus.content[0].text, /^safe_mode: yes$/m);
assert.match(agentTaskStatus.content[0].text, /^secret_values_read: no$/m);
assert.match(agentTaskStatus.content[0].text, /^task_status: /m);
assert.match(agentTaskStatus.content[0].text, /^recommended_command_id: /m);
assert.match(agentTaskStatus.content[0].text, /^path: /m);
assert.match(agentTaskStatus.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-task'/m);
assert.match(agentTaskStatus.content[0].text, /^refresh_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(agentTaskStatus.content[0].text, /^\{/);
assert.equal(agentTaskStatus.structuredContent.secretValuesRead, false);
assert.equal(agentTaskStatus.structuredContent.destructiveActionsIncluded, false);

const agentTaskWatch = await callTool(28, 'sba_agent_task_watch', {
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentTaskWatch.isError, false);
assert.match(agentTaskWatch.content[0].text, /^safe_mode: yes$/m);
assert.match(agentTaskWatch.content[0].text, /^secret_values_read: no$/m);
assert.match(agentTaskWatch.content[0].text, /^run_requested: no$/m);
assert.match(agentTaskWatch.content[0].text, /^status: planned$/m);
assert.match(agentTaskWatch.content[0].text, /^recommended_command_id: /m);
assert.match(agentTaskWatch.content[0].text, /^allowed_to_run: /m);
assert.match(agentTaskWatch.content[0].text, /^command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(agentTaskWatch.content[0].text, /^\{/);
assert.equal(agentTaskWatch.structuredContent.secretValuesRead, false);
assert.equal(agentTaskWatch.structuredContent.destructiveActionsIncluded, false);

const agentTaskLoop = await callTool(281, 'sba_agent_task_loop', {
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentTaskLoop.isError, false);
assert.match(agentTaskLoop.content[0].text, /^safe_mode: yes$/m);
assert.match(agentTaskLoop.content[0].text, /^secret_values_read: no$/m);
assert.match(agentTaskLoop.content[0].text, /^run_requested: no$/m);
assert.match(agentTaskLoop.content[0].text, /^status: planned$/m);
assert.match(agentTaskLoop.content[0].text, /^iterations: /m);
assert.match(agentTaskLoop.content[0].text, /^status_command: 'node' 'src\/cli\.mjs' 'agent-task-watch-status'/m);
assert.match(agentTaskLoop.content[0].text, /^status_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(agentTaskLoop.content[0].text, /^\{/);
assert.equal(agentTaskLoop.structuredContent.secretValuesRead, false);

const agentTaskWatchStart = await callTool(29, 'sba_agent_task_watch_start', {
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentTaskWatchStart.isError, false);
assert.match(agentTaskWatchStart.content[0].text, /^status: planned$/m);
assert.match(agentTaskWatchStart.content[0].text, /^safe_mode: yes$/m);
assert.match(agentTaskWatchStart.content[0].text, /^secret_values_read: no$/m);
assert.match(agentTaskWatchStart.content[0].text, /^starts_background_process_now: no$/m);
assert.match(agentTaskWatchStart.content[0].text, /^operator_ok_accepted: no$/m);
assert.match(agentTaskWatchStart.content[0].text, /^approved_run_command: 'node' 'src\/cli\.mjs' 'agent-task-watch-start'/m);
assert.match(agentTaskWatchStart.content[0].text, /^approved_run_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(agentTaskWatchStart.content[0].text, /^\{/);
assert.equal(agentTaskWatchStart.structuredContent.secretValuesRead, false);

const agentTaskWatchStatus = await callTool(290, 'sba_agent_task_watch_status', {
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(agentTaskWatchStatus.isError, false);
assert.match(agentTaskWatchStatus.content[0].text, /^status_only: yes$/m);
assert.match(agentTaskWatchStatus.content[0].text, /^safe_mode: yes$/m);
assert.match(agentTaskWatchStatus.content[0].text, /^secret_values_read: no$/m);
assert.match(agentTaskWatchStatus.content[0].text, /^pid_exists: /m);
assert.match(agentTaskWatchStatus.content[0].text, /^task_status: /m);
assert.match(agentTaskWatchStatus.content[0].text, /^start_command: 'node' 'src\/cli\.mjs' 'agent-task-watch-start'/m);
assert.match(agentTaskWatchStatus.content[0].text, /^start_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(agentTaskWatchStatus.content[0].text, /^\{/);
assert.equal(agentTaskWatchStatus.structuredContent.secretValuesRead, false);

const agentLoopStep = await callTool(23, 'sba_agent_loop_step', {
  format: 'compact'
});
assert.equal(agentLoopStep.isError, false);
assert.match(agentLoopStep.content[0].text, /^status: planned$/m);
assert.match(agentLoopStep.content[0].text, /^run_requested: no$/m);
assert.match(agentLoopStep.content[0].text, /^executed: no$/m);
assert.match(agentLoopStep.content[0].text, /^safe_mode: yes$/m);
assert.match(agentLoopStep.content[0].text, /^opens_browser_now: no$/m);
assert.match(agentLoopStep.content[0].text, /^starts_capture_now: no$/m);
assert.match(agentLoopStep.content[0].text, /^status_command: 'node' 'src\/cli\.mjs' 'control-status'/m);
assert.match(agentLoopStep.content[0].text, /^step_write_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
if (/^allowed_to_run: yes$/m.test(agentLoopStep.content[0].text)) {
  assert.match(agentLoopStep.content[0].text, /^step_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
} else {
  assert.match(agentLoopStep.content[0].text, /^blocked_reason: /m);
  assert.doesNotMatch(agentLoopStep.content[0].text, /^step_run_command: /m);
}
assert.match(agentLoopStep.content[0].text, /^step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
assert.equal(agentLoopStep.structuredContent.secretValuesRead, false);
assert.equal(agentLoopStep.structuredContent.destructiveActionsIncluded, false);

const agentLoopStepStatus = await callTool(24, 'sba_agent_loop_step_status', {
  format: 'compact'
});
assert.equal(agentLoopStepStatus.isError, false);
assert.match(agentLoopStepStatus.content[0].text, /^status_only: yes$/m);
assert.match(agentLoopStepStatus.content[0].text, /^exists: /m);
assert.match(agentLoopStepStatus.content[0].text, /^safe_mode: yes$/m);
assert.match(agentLoopStepStatus.content[0].text, /^secret_values_read: no$/m);
assert.match(agentLoopStepStatus.content[0].text, /^recommended_command_id: /m);
assert.match(agentLoopStepStatus.content[0].text, /^recommended_command: 'node' 'src\/cli\.mjs' 'agent-loop-step'/m);
assert.match(agentLoopStepStatus.content[0].text, /^path: /m);
assert.match(agentLoopStepStatus.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
if (agentLoopStepStatus.structuredContent.recommendedCommandId === 'run-agent-loop-step') {
  assert.match(agentLoopStepStatus.content[0].text, /^recommended_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
}
if (agentLoopStepStatus.structuredContent.allowedToRun && agentLoopStepStatus.structuredContent.recommendedCommandId === 'run-agent-loop-step') {
  assert.match(agentLoopStepStatus.content[0].text, /^run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
} else {
  assert.doesNotMatch(agentLoopStepStatus.content[0].text, /^run_command: /m);
}
assert.equal(agentLoopStepStatus.structuredContent.secretValuesRead, false);
assert.equal(agentLoopStepStatus.structuredContent.destructiveActionsIncluded, false);

const chromeControlPlan = await callTool(3, 'sba_chrome_control_plan', {
  format: 'compact'
});
assert.equal(chromeControlPlan.isError, false);
assert.match(chromeControlPlan.content[0].text, /^recommended_lane: /m);
assert.match(chromeControlPlan.content[0].text, /^secret_values_read: no$/m);
assert.match(chromeControlPlan.content[0].text, /^regular_chrome_extension_prepared: /m);
assert.match(chromeControlPlan.content[0].text, /^regular_chrome_extension_backend_available: /m);
assert.match(chromeControlPlan.content[0].text, /^regular_chrome_user_permission_required: /m);
assert.match(chromeControlPlan.content[0].text, /^regular_chrome_approval_command_opens_browser: /m);
assert.match(chromeControlPlan.content[0].text, /^regular_chrome_command_run_only_after_user_says: /m);
assert.doesNotMatch(chromeControlPlan.content[0].text, /^\{/);
assert.equal(chromeControlPlan.structuredContent.safeMode, true);
assert.equal(chromeControlPlan.structuredContent.secretValuesRead, false);

const providers = await callTool(301, 'sba_providers', {
  format: 'compact'
});
assert.equal(providers.isError, false);
assert.match(providers.content[0].text, /^default_backend: /m);
assert.match(providers.content[0].text, /^provider_adoption_next: /m);
assert.match(providers.content[0].text, /^lightpanda_next: /m);
assert.match(providers.content[0].text, /^playwright_next: /m);
assert.match(providers.content[0].text, /^selenium_next: /m);
assert.match(providers.content[0].text, /^secure_browser_agent_mcp_present: /m);
assert.match(providers.content[0].text, /^lightpanda_binary_present: /m);
assert.match(providers.content[0].text, /^backend_matrix_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--format' 'compact'$/m);
assert.match(providers.content[0].text, /^lightpanda_doctor_command: 'node' 'src\/cli\.mjs' 'lightpanda-doctor' '--format' 'compact'$/m);
assert.match(providers.content[0].text, /^playwright_doctor_command: 'node' 'src\/cli\.mjs' 'playwright-doctor' '--format' 'compact'$/m);
assert.match(providers.content[0].text, /^selenium_doctor_command: 'node' 'src\/cli\.mjs' 'selenium-doctor' '--format' 'compact'$/m);
assert.match(providers.content[0].text, /^decision: /m);
assert.doesNotMatch(providers.content[0].text, /^\{/);
assert.equal(Array.isArray(providers.structuredContent.providers), true);

const agentBrowserDoctor = await callTool(302, 'sba_agent_browser_doctor', {
  format: 'compact'
});
assert.equal(agentBrowserDoctor.isError, false);
assert.match(agentBrowserDoctor.content[0].text, /^safe_mode: yes$/m);
assert.match(agentBrowserDoctor.content[0].text, /^status_only: yes$/m);
assert.match(agentBrowserDoctor.content[0].text, /^agent_browser_cli_exists: /m);
assert.match(agentBrowserDoctor.content[0].text, /^agent_browser_chrome_for_testing_exists: /m);
assert.match(agentBrowserDoctor.content[0].text, /^agent_browser_install_plan_command: /m);
assert.doesNotMatch(agentBrowserDoctor.content[0].text, /^\{/);
assert.equal(agentBrowserDoctor.structuredContent.secretValuesRead, false);
assert.equal(agentBrowserDoctor.structuredContent.opensBrowserNow, false);
assert.equal(agentBrowserDoctor.structuredContent.startsCaptureNow, false);

const lightpandaDoctor = await callTool(305, 'sba_lightpanda_doctor', {
  format: 'compact'
});
assert.equal(lightpandaDoctor.isError, false);
assert.match(lightpandaDoctor.content[0].text, /^ready_for_public_benchmark: /m);
assert.match(lightpandaDoctor.content[0].text, /^ready_for_source_build: /m);
assert.match(lightpandaDoctor.content[0].text, /^binary_exists: /m);
assert.match(lightpandaDoctor.content[0].text, /^benchmark_command: /m);
assert.doesNotMatch(lightpandaDoctor.content[0].text, /^\{/);
assert.equal(Array.isArray(lightpandaDoctor.structuredContent.checks), true);

const seleniumDoctor = await callTool(306, 'sba_selenium_doctor', {
  format: 'compact'
});
assert.equal(seleniumDoctor.isError, false);
assert.match(seleniumDoctor.content[0].text, /^role: compatibility-bridge$/m);
assert.match(seleniumDoctor.content[0].text, /^ready_for_local_smoke: /m);
assert.match(seleniumDoctor.content[0].text, /^selenium_webdriver_present: /m);
assert.match(seleniumDoctor.content[0].text, /^smoke_command: /m);
assert.doesNotMatch(seleniumDoctor.content[0].text, /^\{/);
assert.equal(Array.isArray(seleniumDoctor.structuredContent.checks), true);

const playwrightDoctor = await callTool(3061, 'sba_playwright_doctor', {
  format: 'compact'
});
assert.equal(playwrightDoctor.isError, false);
assert.match(playwrightDoctor.content[0].text, /^role: test-rich-automation-adapter$/m);
assert.match(playwrightDoctor.content[0].text, /^ready_for_public_smoke: /m);
assert.match(playwrightDoctor.content[0].text, /^ready_for_authenticated_default: no$/m);
assert.match(playwrightDoctor.content[0].text, /^storage_state_sensitive: yes$/m);
assert.match(playwrightDoctor.content[0].text, /^smoke_command: /m);
assert.doesNotMatch(playwrightDoctor.content[0].text, /^\{/);
assert.equal(Array.isArray(playwrightDoctor.structuredContent.checks), true);

const providerDoctorStatus = await callTool(307, 'sba_provider_doctor_status', {
  format: 'compact'
});
assert.equal(providerDoctorStatus.isError, false);
assert.match(providerDoctorStatus.content[0].text, /^default_backend: /m);
assert.match(providerDoctorStatus.content[0].text, /^lightpanda_ready_for_public_benchmark: /m);
assert.match(providerDoctorStatus.content[0].text, /^playwright_ready_for_public_smoke: /m);
assert.match(providerDoctorStatus.content[0].text, /^selenium_ready_for_local_smoke: /m);
assert.match(providerDoctorStatus.content[0].text, /^lightpanda_doctor_command: node src\/cli\.mjs lightpanda-doctor --format compact$/m);
assert.match(providerDoctorStatus.content[0].text, /^playwright_doctor_command: node src\/cli\.mjs playwright-doctor --format compact$/m);
assert.match(providerDoctorStatus.content[0].text, /^selenium_doctor_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
assert.doesNotMatch(providerDoctorStatus.content[0].text, /^\{/);
assert.equal(Array.isArray(providerDoctorStatus.structuredContent.lightpanda.missingChecks), true);

const readinessAudit = await callTool(304, 'sba_readiness_audit', {
  format: 'compact'
});
assert.equal(readinessAudit.isError, false);
assert.match(readinessAudit.content[0].text, /^ready_for_local_authenticated_development: /m);
assert.match(readinessAudit.content[0].text, /^complete_against_objective: /m);
assert.match(readinessAudit.content[0].text, /^remaining: /m);
assert.match(readinessAudit.content[0].text, /^provider_default_backend: /m);
assert.match(readinessAudit.content[0].text, /^provider_default_agent_interface: /m);
assert.match(readinessAudit.content[0].text, /^provider_adoption_next: /m);
assert.match(readinessAudit.content[0].text, /^provider_lightpanda_next: /m);
assert.match(readinessAudit.content[0].text, /^provider_playwright_next: /m);
assert.match(readinessAudit.content[0].text, /^provider_selenium_next: /m);
assert.match(readinessAudit.content[0].text, /^onepassword_secret_run_ready: /m);
assert.match(readinessAudit.content[0].text, /^onepassword_secret_run_candidate: /m);
assert.match(readinessAudit.content[0].text, /^onepassword_secret_run_headless: /m);
assert.match(readinessAudit.content[0].text, /^accepted_external_proofs: /m);
assert.doesNotMatch(readinessAudit.content[0].text, /^\{/);
assert.equal(
  readinessAudit.structuredContent.objective,
  'Fast, secure, credential-aware browser search, operation, page analysis, and scraping for agents.'
);
assert.equal(typeof readinessAudit.structuredContent.completeAgainstObjective, 'boolean');
assert.equal(typeof readinessAudit.structuredContent.readyForLocalAuthenticatedDevelopment, 'boolean');

const completionProofBundle = await callTool(305, 'sba_completion_proof_bundle', {
  candidate: 'github',
  includeCompactCommandAudit: !FAST_SMOKE,
  format: 'compact'
});
assert.equal(completionProofBundle.isError, false);
assert.match(completionProofBundle.content[0].text, /^safe_mode: yes$/m);
assert.match(completionProofBundle.content[0].text, /^status_only: yes$/m);
assert.match(completionProofBundle.content[0].text, /^complete: /m);
assert.match(completionProofBundle.content[0].text, /^agent_safe_next_command_id: /m);
assert.match(completionProofBundle.content[0].text, /^agent_safe_next_may_run_unattended: /m);
assert.match(completionProofBundle.content[0].text, /^agent_safe_next_opens_browser: no$/m);
assert.match(completionProofBundle.content[0].text, /^agent_safe_next_starts_capture: no$/m);
assert.match(completionProofBundle.content[0].text, /^agent_safe_next_reads_browser_storage: no$/m);
assert.match(completionProofBundle.content[0].text, /^agent_safe_next_returns_page_content: no$/m);
assert.match(completionProofBundle.content[0].text, /^target_approval_preflight_opens_browser: no$/m);
assert.match(completionProofBundle.content[0].text, /^target_approval_preflight_starts_capture: no$/m);
assert.match(completionProofBundle.content[0].text, /^target_proof_plan_opens_browser: no$/m);
assert.match(completionProofBundle.content[0].text, /^target_proof_plan_starts_capture: no$/m);
assert.match(completionProofBundle.content[0].text, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
assert.match(completionProofBundle.content[0].text, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
assert.match(completionProofBundle.content[0].text, /^completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status'/m);
assert.match(completionProofBundle.content[0].text, /^agent_control_plane_command: 'node' 'src\/cli\.mjs' 'agent-control-plane'/m);
assert.match(completionProofBundle.content[0].text, /^agent_control_plane_status_command: 'node' 'src\/cli\.mjs' 'agent-control-plane-status'/m);
assert.match(completionProofBundle.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict'/m);
assert.match(completionProofBundle.content[0].text, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(completionProofBundle.content[0].text, /^target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--format' 'compact'/m);
if (FAST_SMOKE) {
  assert.match(completionProofBundle.content[0].text, /^compact_command_audit_skipped: yes$/m);
} else {
  assert.match(completionProofBundle.content[0].text, /^compact_command_audit_complete: yes$/m);
  assert.match(completionProofBundle.content[0].text, /^compact_command_audit_safe_for_strict_agent_loops: yes$/m);
  assert.match(completionProofBundle.content[0].text, /^compact_command_audit_skipped: no$/m);
  assert.match(completionProofBundle.content[0].text, /^compact_command_audit_all_command: 'node' 'src\/cli\.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'$/m);
}
assert.match(completionProofBundle.content[0].text, /^secret_values_read: no$/m);
assert.match(completionProofBundle.content[0].text, /^opens_browser_now: no$/m);
assert.match(completionProofBundle.content[0].text, /^starts_capture_now: no$/m);
assert.doesNotMatch(completionProofBundle.content[0].text, /^\{/);
assert.equal(completionProofBundle.structuredContent.safeMode, true);
assert.equal(completionProofBundle.structuredContent.statusOnly, true);
assert.equal(completionProofBundle.structuredContent.opensBrowserNow, false);
assert.equal(completionProofBundle.structuredContent.startsCaptureNow, false);
assert.equal(completionProofBundle.structuredContent.agentSafeNextOpensBrowser, false);
assert.equal(completionProofBundle.structuredContent.agentSafeNextStartsCapture, false);
assert.equal(completionProofBundle.structuredContent.agentSafeNextReadsBrowserStorage, false);

const completionProofBundleStatus = await callTool(306, 'sba_completion_proof_bundle_status', {
  format: 'compact'
});
assert.equal(completionProofBundleStatus.isError, false);
assert.match(completionProofBundleStatus.content[0].text, /^safe_mode: yes$/m);
assert.match(completionProofBundleStatus.content[0].text, /^exists: /m);
assert.match(completionProofBundleStatus.content[0].text, /^operator_resume_requires_operator_approval: /m);
assert.match(completionProofBundleStatus.content[0].text, /^operator_resume_agent_may_run_unattended: /m);
assert.match(completionProofBundleStatus.content[0].text, /^agent_safe_next_command_id: /m);
assert.match(completionProofBundleStatus.content[0].text, /^agent_safe_next_opens_browser: no$/m);
assert.match(completionProofBundleStatus.content[0].text, /^agent_safe_next_starts_capture: no$/m);
assert.match(completionProofBundleStatus.content[0].text, /^agent_safe_next_reads_browser_storage: no$/m);
assert.match(completionProofBundleStatus.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict'/m);
assert.match(completionProofBundleStatus.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-watch'/m);
assert.doesNotMatch(completionProofBundleStatus.content[0].text, /^\{/);
assert.equal(completionProofBundleStatus.structuredContent.safeMode, true);
assert.equal(completionProofBundleStatus.structuredContent.opensBrowserNow, false);
assert.equal(completionProofBundleStatus.structuredContent.agentSafeNextOpensBrowser, false);
assert.equal(completionProofBundleStatus.structuredContent.agentSafeNextStartsCapture, false);

const fastTargetApprovalStatus = await callTool(214, 'sba_target_approval_status', {
  candidate: 'github',
  realExternal: true,
  format: 'compact'
});
assert.equal(fastTargetApprovalStatus.isError, false);
assert.match(fastTargetApprovalStatus.content[0].text, /^safe_mode: yes$/m);
assert.match(fastTargetApprovalStatus.content[0].text, /^opens_browser_now: no$/m);
assert.match(fastTargetApprovalStatus.content[0].text, /^starts_capture_now: no$/m);
assert.match(fastTargetApprovalStatus.content[0].text, /^agent_safe_command_id: /m);
assert.match(fastTargetApprovalStatus.content[0].text, /^agent_may_run_unattended: /m);
assert.match(fastTargetApprovalStatus.content[0].text, /^operator_command_id: /m);
assert.match(fastTargetApprovalStatus.content[0].text, /^operator_approval_required: /m);
assert.match(fastTargetApprovalStatus.content[0].text, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
assert.match(fastTargetApprovalStatus.content[0].text, /^approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
assert.doesNotMatch(fastTargetApprovalStatus.content[0].text, /^\{/);
assert.equal(fastTargetApprovalStatus.structuredContent.secretValuesRead, false);
assert.equal(fastTargetApprovalStatus.structuredContent.opensBrowserNow, false);
assert.equal(fastTargetApprovalStatus.structuredContent.startsCaptureNow, false);
assert.equal(typeof fastTargetApprovalStatus.structuredContent.agentSafeCommandId, 'string');
assert.equal(typeof fastTargetApprovalStatus.structuredContent.agentMayRunUnattended, 'boolean');
assert.equal(typeof fastTargetApprovalStatus.structuredContent.operatorCommandId, 'string');
assert.equal(typeof fastTargetApprovalStatus.structuredContent.operatorApprovalRequired, 'boolean');
assert.equal(fastTargetApprovalStatus.structuredContent.commands.agentPreflight.args.includes('agent-preflight'), true);
assert.equal(fastTargetApprovalStatus.structuredContent.commands.approvalPreflight.args.includes('--real-external'), true);

const fastTargetApprovalResume = await callTool(215, 'sba_target_approval_resume', {
  candidate: 'github',
  realExternal: true,
  format: 'compact'
});
assert.equal(fastTargetApprovalResume.isError, false);
assert.match(fastTargetApprovalResume.content[0].text, /^safe_mode: yes$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^run_requested: no$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^opens_browser_now: no$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^starts_capture_now: no$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^agent_safe_next_command_id: target-approval-preflight$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^agent_safe_next_may_run_unattended: yes$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^agent_safe_next_opens_browser: no$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^agent_safe_next_starts_capture: no$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^agent_safe_next_reads_browser_storage: no$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^agent_safe_next_returns_page_content: no$/m);
assert.match(fastTargetApprovalResume.content[0].text, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
assert.match(fastTargetApprovalResume.content[0].text, /^preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
assert.match(fastTargetApprovalResume.content[0].text, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--real-external'/m);
assert.match(fastTargetApprovalResume.content[0].text, /^run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
assert.doesNotMatch(fastTargetApprovalResume.content[0].text, /^\{/);
assert.equal(fastTargetApprovalResume.structuredContent.secretValuesRead, false);
assert.equal(fastTargetApprovalResume.structuredContent.opensBrowserNow, false);
assert.equal(fastTargetApprovalResume.structuredContent.startsCaptureNow, false);
assert.equal(fastTargetApprovalResume.structuredContent.agentSafeNextCommandId, 'target-approval-preflight');
assert.equal(fastTargetApprovalResume.structuredContent.agentSafeNextMayRunUnattended, true);
assert.equal(fastTargetApprovalResume.structuredContent.agentSafeNextOpensBrowser, false);
assert.equal(fastTargetApprovalResume.structuredContent.agentSafeNextStartsCapture, false);
assert.equal(fastTargetApprovalResume.structuredContent.agentSafeNextCommand.args.includes('target-approval-preflight'), true);
assert.equal(fastTargetApprovalResume.structuredContent.preflightCommand.args.includes('target-approval-preflight'), true);
assert.equal(fastTargetApprovalResume.structuredContent.proofPlanCommand.args.includes('target-proof-plan'), true);

const fastObjectiveCompletionAudit = await callTool(216, 'sba_objective_completion_audit', {
  write: true,
  out: 'operator/mcp-objective-completion-audit-fast-smoke.json',
  format: 'compact'
});
assert.equal(fastObjectiveCompletionAudit.isError, false);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^status: /m);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^operator_approval_summary_requires_operator_ok: /m);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^operator_approval_summary_operator_ok_accepted: /m);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^operator_approval_summary_may_open_browser: /m);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^operator_approval_summary_may_start_capture: /m);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: /m);
assert.match(fastObjectiveCompletionAudit.content[0].text, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
assert.equal(fastObjectiveCompletionAudit.structuredContent.safeMode, true);
assert.equal(fastObjectiveCompletionAudit.structuredContent.destructiveActionsIncluded, false);

const fastObjectiveCompletionAuditStatus = await callTool(217, 'sba_objective_completion_audit_status', {
  in: 'operator/mcp-objective-completion-audit-fast-smoke.json',
  format: 'compact'
});
assert.equal(fastObjectiveCompletionAuditStatus.isError, false);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^exists: yes$/m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^parse_ok: yes$/m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^operator_approval_summary_requires_operator_ok: /m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^operator_approval_summary_operator_ok_accepted: /m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^operator_approval_summary_may_open_browser: /m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^operator_approval_summary_may_start_capture: /m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: /m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^agent_safe_next_opens_browser: no$/m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^agent_safe_next_starts_capture: no$/m);
assert.match(fastObjectiveCompletionAuditStatus.content[0].text, /^secret_values_read: no$/m);
assert.equal(fastObjectiveCompletionAuditStatus.structuredContent.opensBrowserNow, false);
assert.equal(fastObjectiveCompletionAuditStatus.structuredContent.startsCaptureNow, false);
assert.equal(fastObjectiveCompletionAuditStatus.structuredContent.readsBrowserStorage, false);

const fastObjectiveCompletionAuditWatch = await callTool(218, 'sba_objective_completion_audit_watch', {
  run: true,
  in: 'operator/mcp-objective-completion-audit-fast-smoke.json',
  out: 'operator/mcp-objective-completion-audit-fast-smoke.json',
  format: 'compact'
});
assert.equal(fastObjectiveCompletionAuditWatch.isError, false);
assert.match(fastObjectiveCompletionAuditWatch.content[0].text, /^run_requested: yes$/m);
assert.match(fastObjectiveCompletionAuditWatch.content[0].text, /^executed: no$/m);
assert.match(fastObjectiveCompletionAuditWatch.content[0].text, /^opens_browser_now: no$/m);
assert.match(fastObjectiveCompletionAuditWatch.content[0].text, /^starts_capture_now: no$/m);
assert.match(fastObjectiveCompletionAuditWatch.content[0].text, /^secret_values_read: no$/m);
assert.equal(fastObjectiveCompletionAuditWatch.structuredContent.opensBrowserNow, false);
assert.equal(fastObjectiveCompletionAuditWatch.structuredContent.startsCaptureNow, false);
assert.equal(fastObjectiveCompletionAuditWatch.structuredContent.readsBrowserStorage, false);

if (FAST_SMOKE) {
  finishSmoke();
  process.exit(0);
}

const backendMatrix = await callTool(302, 'sba_backend_matrix', {
  write: true,
  out: 'operator/backend-matrix-latest.json',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(backendMatrix.isError, false);
assert.match(backendMatrix.content[0].text, /^safe_mode: yes$/m);
assert.match(backendMatrix.content[0].text, /^default_backend: /m);
assert.match(backendMatrix.content[0].text, /^search_backend: /m);
assert.match(backendMatrix.content[0].text, /^analyze_backend: /m);
assert.match(backendMatrix.content[0].text, /^scrape_backend: /m);
assert.match(backendMatrix.content[0].text, /^operate_backend: /m);
assert.match(backendMatrix.content[0].text, /^authenticated_backend: /m);
assert.match(backendMatrix.content[0].text, /^existing_tab_backend: /m);
assert.match(backendMatrix.content[0].text, /^chrome_mcp_route_ready: /m);
assert.match(backendMatrix.content[0].text, /^backend_count: /m);
assert.match(backendMatrix.content[0].text, /^search_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'search'/m);
assert.match(backendMatrix.content[0].text, /^analyze_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'analyze'/m);
assert.match(backendMatrix.content[0].text, /^scrape_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'scrape'/m);
assert.match(backendMatrix.content[0].text, /^operate_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'operate'/m);
assert.match(backendMatrix.content[0].text, /^search_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'search'/m);
assert.match(backendMatrix.content[0].text, /^operate_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'operate'/m);
assert.match(backendMatrix.content[0].text, /^write_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.match(backendMatrix.content[0].text, /^regular_chrome_status_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.match(backendMatrix.content[0].text, /^search_selector_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(backendMatrix.content[0].text, /^\{/);
assert.equal(backendMatrix.structuredContent.secretValuesRead, false);
assert.equal(backendMatrix.structuredContent.opensBrowserNow, false);

const backendMatrixStatus = await callTool(303, 'sba_backend_matrix_status', {
  in: 'operator/backend-matrix-latest.json',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  format: 'compact'
});
assert.equal(backendMatrixStatus.isError, false);
assert.match(backendMatrixStatus.content[0].text, /^status_only: yes$/m);
assert.match(backendMatrixStatus.content[0].text, /^status: /m);
assert.match(backendMatrixStatus.content[0].text, /^default_backend: /m);
assert.match(backendMatrixStatus.content[0].text, /^search_backend: /m);
assert.match(backendMatrixStatus.content[0].text, /^operate_backend: /m);
assert.match(backendMatrixStatus.content[0].text, /^existing_tab_backend: /m);
assert.match(backendMatrixStatus.content[0].text, /^search_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'search'/m);
assert.match(backendMatrixStatus.content[0].text, /^operate_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'operate'/m);
assert.match(backendMatrixStatus.content[0].text, /^refresh_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.match(backendMatrixStatus.content[0].text, /^saved_secret_values_read: no$/m);
assert.doesNotMatch(backendMatrixStatus.content[0].text, /^\{/);
assert.equal(backendMatrixStatus.structuredContent.secretValuesRead, false);
assert.equal(backendMatrixStatus.structuredContent.opensBrowserNow, false);

const chromeMcpObservation = await callTool(30, 'sba_chrome_mcp_observation', {
  format: 'compact',
  statusText: 'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29',
  listPagesText: 'Pages:\n- 0: Example https://example.com/',
  source: 'mcp-compact-smoke',
  intent: 'operate'
});
assert.equal(chromeMcpObservation.isError, false);
assert.match(chromeMcpObservation.content[0].text, /^route_ready: yes$/m);
assert.match(chromeMcpObservation.content[0].text, /^observed_page_list_ok: yes$/m);
assert.match(chromeMcpObservation.content[0].text, /^secret_values_read: no$/m);
assert.match(chromeMcpObservation.content[0].text, /^regular_chrome_use_write_command: .*'--write'/m);
assert.doesNotMatch(chromeMcpObservation.content[0].text, /^\{/);
assert.equal(chromeMcpObservation.structuredContent.safeMode, true);
assert.equal(chromeMcpObservation.structuredContent.secretValuesRead, false);

const chromeMcpObservationStatus = await callTool(3001, 'sba_chrome_mcp_observation_status', {
  format: 'compact',
  in: 'operator/nonexistent-mcp-observation-smoke.json'
});
assert.equal(chromeMcpObservationStatus.isError, false);
assert.match(chromeMcpObservationStatus.content[0].text, /^status: missing$/m);
assert.match(chromeMcpObservationStatus.content[0].text, /^record_template_command: /m);
assert.doesNotMatch(chromeMcpObservationStatus.content[0].text, /^\{/);
assert.equal(chromeMcpObservationStatus.structuredContent.safeMode, true);
assert.equal(chromeMcpObservationStatus.structuredContent.secretValuesRead, false);

const chromeMcpStatus = await callTool(31, 'sba_chrome_mcp_status', {
  format: 'compact',
  observedConnected: 'yes',
  observedTools: 29,
  observedPageListOk: 'yes',
  observedPageCount: 3,
  observedSource: 'mcp-compact-smoke'
});
assert.equal(chromeMcpStatus.isError, false);
assert.match(chromeMcpStatus.content[0].text, /^status: /m);
assert.match(chromeMcpStatus.content[0].text, /^observed_chrome_devtools_mcp_connected: yes$/m);
assert.match(chromeMcpStatus.content[0].text, /^observed_chrome_devtools_mcp_page_list_ok: yes$/m);
assert.match(chromeMcpStatus.content[0].text, /^chrome_devtools_mcp_usable_for_everyday_tabs: yes$/m);
assert.match(chromeMcpStatus.content[0].text, /^usable_for_everyday_chrome_tabs: yes$/m);
assert.match(chromeMcpStatus.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeMcpStatus.content[0].text, /^\{/);
assert.equal(chromeMcpStatus.structuredContent.safeMode, true);
assert.equal(chromeMcpStatus.structuredContent.secretValuesRead, false);

const chromeMcpHandoff = await callTool(32, 'sba_chrome_mcp_handoff', {
  format: 'compact',
  chromeMcpConnected: 'yes',
  chromeMcpTools: 29,
  chromeMcpPageListOk: 'yes',
  chromeMcpPageCount: 3,
  chromeMcpSource: 'mcp-compact-smoke'
});
assert.equal(chromeMcpHandoff.isError, false);
assert.match(chromeMcpHandoff.content[0].text, /^ready: yes$/m);
assert.match(chromeMcpHandoff.content[0].text, /^next_tool: mcp__peekaboo__\.browser$/m);
assert.match(chromeMcpHandoff.content[0].text, /^next_tool_args: \{"action":"list_pages"\}$/m);
assert.match(chromeMcpHandoff.content[0].text, /^chrome_mcp_observed_page_list_ok: yes$/m);
assert.match(chromeMcpHandoff.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeMcpHandoff.content[0].text, /^\{/);
assert.equal(chromeMcpHandoff.structuredContent.safeMode, true);
assert.equal(chromeMcpHandoff.structuredContent.secretValuesRead, false);

const chromeMcpTimeoutPlan = await callTool(35, 'sba_chrome_mcp_timeout_plan', {
  format: 'compact',
  observedConnected: 'yes',
  observedTools: 29,
  observedLastError: 'Network.enable timed out',
  observedSource: 'mcp-compact-smoke',
  ownerLimit: 1
});
assert.equal(chromeMcpTimeoutPlan.isError, false);
assert.match(chromeMcpTimeoutPlan.content[0].text, /^page_list_timeout: yes$/m);
assert.match(chromeMcpTimeoutPlan.content[0].text, /^do_not_kill_processes_automatically: yes$/m);
assert.match(chromeMcpTimeoutPlan.content[0].text, /^do_not_use_default_profile_cdp: yes$/m);
assert.match(chromeMcpTimeoutPlan.content[0].text, /^cleanup_review_owner_pids: /m);
assert.match(chromeMcpTimeoutPlan.content[0].text, /^cleanup_review_top: /m);
assert.match(chromeMcpTimeoutPlan.content[0].text, /^cleanup_review_inspect: /m);
assert.match(chromeMcpTimeoutPlan.content[0].text, /^regular_chrome_use_command: /m);
assert.match(chromeMcpTimeoutPlan.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeMcpTimeoutPlan.content[0].text, /^\{/);
assert.equal(chromeMcpTimeoutPlan.structuredContent.safeMode, true);
assert.equal(chromeMcpTimeoutPlan.structuredContent.secretValuesRead, false);

const chromeMcpAutostartPlan = await callTool(351, 'sba_chrome_mcp_autostart_plan', {
  format: 'compact'
});
assert.equal(chromeMcpAutostartPlan.isError, false);
assert.match(chromeMcpAutostartPlan.content[0].text, /^safe_mode: yes$/m);
assert.match(chromeMcpAutostartPlan.content[0].text, /^opens_browser_now: no$/m);
assert.match(chromeMcpAutostartPlan.content[0].text, /^starts_background_now: no$/m);
assert.match(chromeMcpAutostartPlan.content[0].text, /^install_requires_operator_approval: yes$/m);
assert.match(chromeMcpAutostartPlan.content[0].text, /^agent_may_install_unattended: no$/m);
assert.match(chromeMcpAutostartPlan.content[0].text, /^write_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-autostart-plan'/m);
assert.doesNotMatch(chromeMcpAutostartPlan.content[0].text, /^\{/);
assert.equal(chromeMcpAutostartPlan.structuredContent.safeMode, true);
assert.equal(chromeMcpAutostartPlan.structuredContent.secretValuesRead, false);
assert.equal(chromeMcpAutostartPlan.structuredContent.opensBrowserNow, false);

const chromeMcpAutostartPlanStatus = await callTool(352, 'sba_chrome_mcp_autostart_plan_status', {
  format: 'compact',
  in: 'operator/nonexistent-chrome-mcp-autostart-plan-smoke.json'
});
assert.equal(chromeMcpAutostartPlanStatus.isError, false);
assert.match(chromeMcpAutostartPlanStatus.content[0].text, /^exists: no$/m);
assert.match(chromeMcpAutostartPlanStatus.content[0].text, /^opens_browser_now: no$/m);
assert.match(chromeMcpAutostartPlanStatus.content[0].text, /^starts_background_now: no$/m);
assert.match(chromeMcpAutostartPlanStatus.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-autostart-plan' '--write'/m);
assert.doesNotMatch(chromeMcpAutostartPlanStatus.content[0].text, /^\{/);
assert.equal(chromeMcpAutostartPlanStatus.structuredContent.safeMode, true);
assert.equal(chromeMcpAutostartPlanStatus.structuredContent.secretValuesRead, false);
assert.equal(chromeMcpAutostartPlanStatus.structuredContent.opensBrowserNow, false);

const regularChromeUse = await callTool(33, 'sba_regular_chrome_use', {
  format: 'compact',
  intent: 'operate',
  chromeMcpConnected: 'yes',
  chromeMcpTools: 29,
  chromeMcpPageListOk: 'yes',
  chromeMcpPageCount: 3,
  chromeMcpSource: 'mcp-compact-smoke'
});
assert.equal(regularChromeUse.isError, false);
assert.match(regularChromeUse.content[0].text, /^using_everyday_chrome: yes$/m);
assert.match(regularChromeUse.content[0].text, /^selected_lane: regular-chrome-mcp$/m);
assert.match(regularChromeUse.content[0].text, /^stored_authenticated_scraping_allowed: no$/m);
assert.match(regularChromeUse.content[0].text, /^direct_cdp_default_profile_allowed: no$/m);
assert.match(regularChromeUse.content[0].text, /^chrome_mcp_allowed_tool_ids: status,list-pages,select-page,snapshot,click,fill$/m);
assert.match(regularChromeUse.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(regularChromeUse.content[0].text, /^\{/);
assert.equal(regularChromeUse.structuredContent.safeMode, true);
assert.equal(regularChromeUse.structuredContent.secretValuesRead, false);

const regularChromeUseRawTimeout = await callTool(34, 'sba_regular_chrome_use', {
  format: 'compact',
  statusText: 'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29',
  listPagesText: 'Network.enable timed out. Increase the protocolTimeout setting in launch/connect calls for a higher timeout if needed.',
  chromeExtensionPrepared: 'yes',
  chromeExtensionBackendAvailable: 'no'
});
assert.equal(regularChromeUseRawTimeout.isError, false);
assert.match(regularChromeUseRawTimeout.content[0].text, /^chrome_mcp_raw_observation_status: page-list-timeout$/m);
assert.match(regularChromeUseRawTimeout.content[0].text, /^chrome_mcp_raw_observation_route_ready: no$/m);
assert.match(regularChromeUseRawTimeout.content[0].text, /^selected_lane: regular-chrome-extension-resume$/m);
assert.match(regularChromeUseRawTimeout.content[0].text, /^direct_cdp_default_profile_allowed: no$/m);
assert.doesNotMatch(regularChromeUseRawTimeout.content[0].text, /^\{/);
assert.equal(regularChromeUseRawTimeout.structuredContent.safeMode, true);
assert.equal(regularChromeUseRawTimeout.structuredContent.secretValuesRead, false);

const regularChromeRefresh = await callTool(35, 'sba_regular_chrome_refresh', {
  format: 'compact',
  intent: 'inspect',
  appleEventsOut: 'operator/mcp-smoke-chrome-apple-events-status.json',
  out: 'operator/mcp-smoke-regular-chrome-use.json',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json',
  chromeMcpConnected: 'yes',
  chromeMcpTools: 29,
  chromeMcpPageListOk: 'yes',
  chromeMcpPageCount: 3,
  chromeMcpSource: 'mcp-compact-smoke'
});
assert.equal(regularChromeRefresh.isError, false);
assert.match(regularChromeRefresh.content[0].text, /^using_everyday_chrome: yes$/m);
assert.match(regularChromeRefresh.content[0].text, /^secret_values_read: no$/m);
assert.match(regularChromeRefresh.content[0].text, /^reads_browser_storage: no$/m);
assert.match(regularChromeRefresh.content[0].text, /^page_content_returned: no$/m);
assert.match(regularChromeRefresh.content[0].text, /^regular_chrome_use_output: /m);
assert.match(regularChromeRefresh.content[0].text, /^stored_authenticated_scraping_allowed: no$/m);
assert.match(regularChromeRefresh.content[0].text, /^status_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.match(regularChromeRefresh.content[0].text, /^refresh_command: .*'--mcp-observation-in' 'operator\/nonexistent-mcp-observation-smoke\.json'/m);
assert.doesNotMatch(regularChromeRefresh.content[0].text, /^\{/);
assert.equal(regularChromeRefresh.structuredContent.safeMode, true);
assert.equal(regularChromeRefresh.structuredContent.secretValuesRead, false);

const regularChromeStatus = await callTool(351, 'sba_regular_chrome_status', {
  format: 'compact',
  in: 'operator/mcp-smoke-regular-chrome-use.json',
  appleEventsIn: 'operator/mcp-smoke-chrome-apple-events-status.json',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json'
});
assert.equal(regularChromeStatus.isError, false);
assert.match(regularChromeStatus.content[0].text, /^status_only: yes$/m);
assert.match(regularChromeStatus.content[0].text, /^secret_values_read: no$/m);
assert.match(regularChromeStatus.content[0].text, /^opens_browser_now: no$/m);
assert.match(regularChromeStatus.content[0].text, /^chrome_mcp_observation_exists: no$/m);
assert.match(regularChromeStatus.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'regular-chrome-refresh'/m);
assert.doesNotMatch(regularChromeStatus.content[0].text, /^\{/);
assert.equal(regularChromeStatus.structuredContent.safeMode, true);

const regularChromeWatch = await callTool(352, 'sba_regular_chrome_watch', {
  format: 'compact',
  in: 'operator/mcp-smoke-regular-chrome-use.json',
  appleEventsIn: 'operator/mcp-smoke-chrome-apple-events-status.json',
  mcpObservationIn: 'operator/nonexistent-mcp-observation-smoke.json'
});
assert.equal(regularChromeWatch.isError, false);
assert.match(regularChromeWatch.content[0].text, /^run_requested: no$/m);
assert.match(regularChromeWatch.content[0].text, /^secret_values_read: no$/m);
assert.match(regularChromeWatch.content[0].text, /^status: planned$/m);
assert.doesNotMatch(regularChromeWatch.content[0].text, /^\{/);
assert.equal(regularChromeWatch.structuredContent.safeMode, true);

const chromeAppleEventsStatus = await callTool(36, 'sba_chrome_apple_events_status', {
  format: 'compact'
});
assert.equal(chromeAppleEventsStatus.isError, false);
assert.match(chromeAppleEventsStatus.content[0].text, /^backend: chrome-apple-events$/m);
assert.match(chromeAppleEventsStatus.content[0].text, /^full_url_returned: no$/m);
assert.match(chromeAppleEventsStatus.content[0].text, /^stored_authenticated_scraping_allowed: no$/m);
assert.match(chromeAppleEventsStatus.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeAppleEventsStatus.content[0].text, /^\{/);
assert.equal(chromeAppleEventsStatus.structuredContent.safeMode, true);
assert.equal(chromeAppleEventsStatus.structuredContent.secretValuesRead, false);

const chromeAppleEventsOutline = await callTool(37, 'sba_chrome_apple_events_outline', {
  format: 'compact'
});
assert.equal(chromeAppleEventsOutline.isError, false);
assert.match(chromeAppleEventsOutline.content[0].text, /^backend: chrome-apple-events$/m);
assert.match(chromeAppleEventsOutline.content[0].text, /^operator_ok_required: yes$/m);
assert.match(chromeAppleEventsOutline.content[0].text, /^executed: no$/m);
assert.match(chromeAppleEventsOutline.content[0].text, /^text_content_returned: no$/m);
assert.match(chromeAppleEventsOutline.content[0].text, /^full_url_returned: no$/m);
assert.match(chromeAppleEventsOutline.content[0].text, /^stored_authenticated_scraping_allowed: no$/m);
assert.match(chromeAppleEventsOutline.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeAppleEventsOutline.content[0].text, /^\{/);
assert.equal(chromeAppleEventsOutline.structuredContent.safeMode, true);
assert.equal(chromeAppleEventsOutline.structuredContent.secretValuesRead, false);

const browserRoute = await callTool(4, 'sba_browser_route', {
  task: 'authenticated-scrape',
  format: 'compact'
});
assert.equal(browserRoute.isError, false);
assert.match(browserRoute.content[0].text, /^selected_lane: /m);
assert.match(browserRoute.content[0].text, /^backend: /m);
assert.match(browserRoute.content[0].text, /^profile_mode: /m);
assert.match(browserRoute.content[0].text, /^everyday_chrome_cdp_allowed: no$/m);
assert.match(browserRoute.content[0].text, /^dedicated_target_profile_for_stored_auth: yes$/m);
assert.match(browserRoute.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(browserRoute.content[0].text, /^\{/);
assert.equal(browserRoute.structuredContent.safeMode, true);
assert.equal(browserRoute.structuredContent.secretValuesRead, false);

const existingTabRoute = await callTool(41, 'sba_browser_route', {
  task: 'existing-tab',
  chromeMcpConnected: 'yes',
  chromeMcpTools: 29,
  chromeMcpPageListOk: 'yes',
  chromeMcpPageCount: 3,
  chromeMcpSource: 'mcp-compact-smoke',
  format: 'compact'
});
assert.equal(existingTabRoute.isError, false);
assert.match(existingTabRoute.content[0].text, /^selected_lane: regular-chrome-mcp$/m);
assert.match(existingTabRoute.content[0].text, /^backend: chrome-devtools-mcp$/m);
assert.match(existingTabRoute.content[0].text, /^chrome_mcp_usable_for_everyday_tabs: yes$/m);
assert.match(existingTabRoute.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(existingTabRoute.content[0].text, /^\{/);
assert.equal(existingTabRoute.structuredContent.safeMode, true);
assert.equal(existingTabRoute.structuredContent.secretValuesRead, false);

const chromeExtensionStatus = await callTool(5, 'sba_chrome_extension_status', {
  format: 'compact'
});
assert.equal(chromeExtensionStatus.isError, false);
assert.match(chromeExtensionStatus.content[0].text, /^chrome_running: /m);
assert.match(chromeExtensionStatus.content[0].text, /^everyday_chrome_extension_prepared: /m);
assert.match(chromeExtensionStatus.content[0].text, /^everyday_chrome_extension_backend_available: /m);
assert.match(chromeExtensionStatus.content[0].text, /^everyday_chrome_cdp_allowed: no$/m);
assert.match(chromeExtensionStatus.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeExtensionStatus.content[0].text, /^\{/);
assert.equal(chromeExtensionStatus.structuredContent.safeMode, true);
assert.equal(chromeExtensionStatus.structuredContent.secretValuesRead, false);

const chromeExtensionHandoff = await callTool(6, 'sba_chrome_extension_handoff', {
  format: 'compact'
});
assert.equal(chromeExtensionHandoff.isError, false);
assert.match(chromeExtensionHandoff.content[0].text, /^opens_browser_now: no$/m);
assert.match(chromeExtensionHandoff.content[0].text, /^action: /m);
assert.match(chromeExtensionHandoff.content[0].text, /^user_permission_required: /m);
assert.match(chromeExtensionHandoff.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeExtensionHandoff.content[0].text, /^\{/);
assert.equal(chromeExtensionHandoff.structuredContent.safeMode, true);
assert.equal(chromeExtensionHandoff.structuredContent.secretValuesRead, false);

const chromeExtensionResume = await callTool(61, 'sba_chrome_extension_resume', {
  format: 'compact'
});
assert.equal(chromeExtensionResume.isError, false);
assert.match(chromeExtensionResume.content[0].text, /^operator_ok_required: yes$/m);
assert.match(chromeExtensionResume.content[0].text, /^operator_approved: no$/m);
assert.match(chromeExtensionResume.content[0].text, /^opens_browser_now: no$/m);
assert.match(chromeExtensionResume.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeExtensionResume.content[0].text, /^\{/);
assert.equal(chromeExtensionResume.structuredContent.safeMode, true);
assert.equal(chromeExtensionResume.structuredContent.secretValuesRead, false);

const chromeExtensionTroubleshoot = await callTool(62, 'sba_chrome_extension_troubleshoot', {
  format: 'compact',
  backendAvailable: 'no',
  backendLastError: 'Browser is not available: extension'
});
assert.equal(chromeExtensionTroubleshoot.isError, false);
assert.match(chromeExtensionTroubleshoot.content[0].text, /^opens_browser_now: no$/m);
assert.match(chromeExtensionTroubleshoot.content[0].text, /^backend_observed_available: no$/m);
assert.match(chromeExtensionTroubleshoot.content[0].text, /^cdp_allowed: no$/m);
assert.match(chromeExtensionTroubleshoot.content[0].text, /^resume_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK'/m);
assert.match(chromeExtensionTroubleshoot.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeExtensionTroubleshoot.content[0].text, /^\{/);
assert.equal(chromeExtensionTroubleshoot.structuredContent.safeMode, true);
assert.equal(chromeExtensionTroubleshoot.structuredContent.secretValuesRead, false);

const chromeExtensionBackendCheckPlan = await callTool(64, 'sba_chrome_extension_backend_check_plan', {
  format: 'compact'
});
assert.equal(chromeExtensionBackendCheckPlan.isError, false);
assert.match(chromeExtensionBackendCheckPlan.content[0].text, /^opens_browser_now: no$/m);
assert.match(chromeExtensionBackendCheckPlan.content[0].text, /^starts_capture: no$/m);
assert.match(chromeExtensionBackendCheckPlan.content[0].text, /^direct_cdp_default_profile_allowed: no$/m);
assert.match(chromeExtensionBackendCheckPlan.content[0].text, /^stored_authenticated_scraping_allowed: no$/m);
assert.match(chromeExtensionBackendCheckPlan.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeExtensionBackendCheckPlan.content[0].text, /^\{/);
assert.equal(chromeExtensionBackendCheckPlan.structuredContent.safeMode, true);
assert.equal(chromeExtensionBackendCheckPlan.structuredContent.secretValuesRead, false);

const chromeExtensionClaimPlan = await callTool(63, 'sba_chrome_extension_claim_plan', {
  format: 'compact',
  backendReady: 'yes',
  intent: 'operate',
  matchUrl: 'github.com'
});
assert.equal(chromeExtensionClaimPlan.isError, false);
assert.match(chromeExtensionClaimPlan.content[0].text, /^opens_browser_now: no$/m);
assert.match(chromeExtensionClaimPlan.content[0].text, /^ready: yes$/m);
assert.match(chromeExtensionClaimPlan.content[0].text, /^next_tool: mcp__node_repl__js$/m);
assert.match(chromeExtensionClaimPlan.content[0].text, /^direct_cdp_default_profile_allowed: no$/m);
assert.match(chromeExtensionClaimPlan.content[0].text, /^stored_authenticated_scraping_allowed: no$/m);
assert.match(chromeExtensionClaimPlan.content[0].text, /^snippet_keys: openTabs,claimTab$/m);
assert.match(chromeExtensionClaimPlan.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(chromeExtensionClaimPlan.content[0].text, /^\{/);
assert.equal(chromeExtensionClaimPlan.structuredContent.safeMode, true);
assert.equal(chromeExtensionClaimPlan.structuredContent.secretValuesRead, false);
assert.match(chromeExtensionClaimPlan.structuredContent.snippets.openTabs, /browser\.user\.openTabs/);
assert.match(chromeExtensionClaimPlan.structuredContent.snippets.claimTab, /browser\.user\.claimTab/);

const status = await callTool(7, 'sba_objective_status', {
  format: 'compact'
});
assert.equal(status.isError, false);
assert.match(status.content[0].text, /^status: /m);
assert.match(status.content[0].text, /^human_action: /m);
assert.match(status.content[0].text, /^automation_blocker: /m);
assert.match(status.content[0].text, /^capture_blocked: /m);
assert.match(status.content[0].text, /^auth_state: /m);
assert.match(status.content[0].text, /^missing_artifact_count: /m);
assert.match(status.content[0].text, /^missing_artifacts: /m);
assert.match(status.content[0].text, /^handoff_auth_check_port_reachable: /m);
assert.match(status.content[0].text, /^auth_watch_(command|blocked_reason): /m);
assert.match(status.content[0].text, /^handoff_resume_command: /m);
assert.equal(typeof status.structuredContent.complete, 'boolean');

const proofGateStatus = await callTool(8, 'sba_proof_gate_status', {
  format: 'compact'
});
assert.equal(proofGateStatus.isError, false);
assert.match(proofGateStatus.content[0].text, /^status: /m);
assert.match(proofGateStatus.content[0].text, /^human_action: /m);
assert.match(proofGateStatus.content[0].text, /^automation_blocker: /m);
assert.match(proofGateStatus.content[0].text, /^capture_blocked: /m);
assert.match(proofGateStatus.content[0].text, /^auth_check_ok: /m);
assert.match(proofGateStatus.content[0].text, /^login_like: /m);
assert.match(proofGateStatus.content[0].text, /^auth_state: /m);
assert.match(proofGateStatus.content[0].text, /^auth_usable: /m);
assert.match(proofGateStatus.content[0].text, /^profile_auth_metadata_only: /m);
assert.match(proofGateStatus.content[0].text, /^auth_status_source: /m);
assert.match(proofGateStatus.content[0].text, /^auth_final_url: /m);
assert.match(proofGateStatus.content[0].text, /^handoff_auth_check_port: /m);
assert.match(proofGateStatus.content[0].text, /^handoff_auth_check_port_reachable: /m);
assert.match(proofGateStatus.content[0].text, /^missing_artifact_count: /m);
assert.match(proofGateStatus.content[0].text, /^next_artifact_action: /m);
assert.match(proofGateStatus.content[0].text, /^next_artifact_blocker: /m);
assert.match(proofGateStatus.content[0].text, /^artifact_command_covers: /m);
assert.match(proofGateStatus.content[0].text, /^auth_watch_(command|blocked_reason): /m);
assert.match(proofGateStatus.content[0].text, /^handoff_resume_command: /m);
assert.match(proofGateStatus.content[0].text, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(proofGateStatus.content[0].text, /^secret_values_read: no$/m);
assert.match(proofGateStatus.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(proofGateStatus.content[0].text, /^\{/);
assert.equal(proofGateStatus.structuredContent.safeMode, true);
assert.equal(proofGateStatus.structuredContent.secretValuesRead, false);
assert.equal(typeof proofGateStatus.structuredContent.nextArtifactAction, 'string');

const loginHandoffStatus = await callTool(66, 'sba_login_handoff_status', {
  format: 'compact'
});
assert.equal(loginHandoffStatus.isError, false);
assert.match(loginHandoffStatus.content[0].text, /^status: /m);
assert.match(loginHandoffStatus.content[0].text, /^login_required: /m);
assert.match(loginHandoffStatus.content[0].text, /^dedicated_browser_reachable: /m);
assert.match(loginHandoffStatus.content[0].text, /^safe_monitor_available: /m);
assert.match(loginHandoffStatus.content[0].text, /^opens_browser_now: no$/m);
assert.match(loginHandoffStatus.content[0].text, /^starts_capture_now: no$/m);
assert.match(loginHandoffStatus.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(loginHandoffStatus.content[0].text, /^\{/);
assert.equal(loginHandoffStatus.structuredContent.safeMode, true);
assert.equal(loginHandoffStatus.structuredContent.secretValuesRead, false);

const proofGateWatch = await callTool(9, 'sba_proof_gate_watch', {
  timeoutMs: 0,
  intervalMs: 1,
  format: 'compact'
});
assert.equal(proofGateWatch.isError, false);
assert.match(proofGateWatch.content[0].text, /^status: /m);
assert.match(proofGateWatch.content[0].text, /^complete: /m);
assert.match(proofGateWatch.content[0].text, /^attempts: /m);
assert.match(proofGateWatch.content[0].text, /^last_gate_status: /m);
assert.match(proofGateWatch.content[0].text, /^auth_check_ok: /m);
assert.match(proofGateWatch.content[0].text, /^login_like: /m);
assert.match(proofGateWatch.content[0].text, /^secret_values_read: no$/m);
assert.match(proofGateWatch.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(proofGateWatch.content[0].text, /^\{/);
assert.equal(proofGateWatch.structuredContent.safeMode, true);
assert.equal(proofGateWatch.structuredContent.secretValuesRead, false);

const backgroundMonitorPlan = await callTool(65, 'sba_background_monitor_plan', {
  timeoutMs: 120000,
  intervalMs: 2500,
  format: 'compact'
});
assert.equal(backgroundMonitorPlan.isError, false);
assert.match(backgroundMonitorPlan.content[0].text, /^monitor_only: yes$/m);
assert.match(backgroundMonitorPlan.content[0].text, /^opens_browser_now: no$/m);
assert.match(backgroundMonitorPlan.content[0].text, /^starts_capture: no$/m);
assert.match(backgroundMonitorPlan.content[0].text, /^background_watch_command: /m);
assert.match(backgroundMonitorPlan.content[0].text, /^poll_status_command: /m);
assert.match(backgroundMonitorPlan.content[0].text, /^secret_values_read: no$/m);
assert.match(backgroundMonitorPlan.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(backgroundMonitorPlan.content[0].text, /^\{/);
assert.equal(backgroundMonitorPlan.structuredContent.safeMode, true);
assert.equal(backgroundMonitorPlan.structuredContent.secretValuesRead, false);

const backgroundProofCapturePlan = await callTool(66, 'sba_background_proof_capture_plan', {
  timeoutMs: 120000,
  intervalMs: 2500,
  format: 'compact'
});
assert.equal(backgroundProofCapturePlan.isError, false);
assert.match(backgroundProofCapturePlan.content[0].text, /^plan_only: yes$/m);
assert.match(backgroundProofCapturePlan.content[0].text, /^opens_browser_now: no$/m);
assert.match(backgroundProofCapturePlan.content[0].text, /^starts_capture_now: no$/m);
assert.match(backgroundProofCapturePlan.content[0].text, /^background_no_open_wait_capture_available: /m);
assert.match(backgroundProofCapturePlan.content[0].text, /^background_no_open_wait_capture_opens_browser: no$/m);
assert.match(backgroundProofCapturePlan.content[0].text, /^operator_must_open_login_separately: /m);
assert.match(backgroundProofCapturePlan.content[0].text, /^secret_values_read: no$/m);
assert.match(backgroundProofCapturePlan.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(backgroundProofCapturePlan.content[0].text, /^\{/);
assert.equal(backgroundProofCapturePlan.structuredContent.safeMode, true);
assert.equal(backgroundProofCapturePlan.structuredContent.secretValuesRead, false);

const backgroundProofCaptureStatus = await callTool(67, 'sba_background_proof_capture_status', {
  maxLogLines: 2,
  format: 'compact'
});
assert.equal(backgroundProofCaptureStatus.isError, false);
assert.match(backgroundProofCaptureStatus.content[0].text, /^status_only: yes$/m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^opens_browser_now: no$/m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^starts_capture_now: no$/m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^monitor_running: /m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^capture_running: /m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^auth_watch_exists: /m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^handoff_wait_auth_exists: /m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^no_open_wait_capture_command: /m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^background_no_open_wait_capture_command: /m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^secret_values_read: no$/m);
assert.match(backgroundProofCaptureStatus.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(backgroundProofCaptureStatus.content[0].text, /--open-login/);
assert.doesNotMatch(backgroundProofCaptureStatus.content[0].text, /^\{/);
assert.equal(backgroundProofCaptureStatus.structuredContent.safeMode, true);
assert.equal(backgroundProofCaptureStatus.structuredContent.secretValuesRead, false);
assert.match(backgroundProofCaptureStatus.structuredContent.commands.noOpenWaitCapture.shell, /--wait-auth/);
assert.match(backgroundProofCaptureStatus.structuredContent.commands.backgroundNoOpenWaitCapture.shell, /--wait-auth/);
assert.doesNotMatch(backgroundProofCaptureStatus.structuredContent.commands.noOpenWaitCapture.shell, /--open-login/);
assert.doesNotMatch(backgroundProofCaptureStatus.structuredContent.commands.backgroundNoOpenWaitCapture.shell, /--open-login/);

const backgroundProofCaptureStart = await callTool(68, 'sba_background_proof_capture_start', {
  mode: 'capture',
  format: 'compact'
});
assert.equal(backgroundProofCaptureStart.isError, false);
assert.match(backgroundProofCaptureStart.content[0].text, /^status: planned$/m);
assert.match(backgroundProofCaptureStart.content[0].text, /^mode: capture$/m);
assert.match(backgroundProofCaptureStart.content[0].text, /^opens_browser_now: no$/m);
assert.match(backgroundProofCaptureStart.content[0].text, /^starts_capture_now: no$/m);
assert.match(backgroundProofCaptureStart.content[0].text, /^starts_background_process_now: no$/m);
assert.match(backgroundProofCaptureStart.content[0].text, /^operator_ok_accepted: no$/m);
assert.match(backgroundProofCaptureStart.content[0].text, /^phase_opens_browser: no$/m);
assert.match(backgroundProofCaptureStart.content[0].text, /^secret_values_read: no$/m);
assert.match(backgroundProofCaptureStart.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(backgroundProofCaptureStart.content[0].text, /^\{/);
assert.equal(backgroundProofCaptureStart.structuredContent.safeMode, true);
assert.equal(backgroundProofCaptureStart.structuredContent.secretValuesRead, false);

const objectiveNext = await callTool(10, 'sba_objective_next', {
  monitorTimeoutMs: 10000,
  monitorIntervalMs: 1000,
  format: 'compact'
});
assert.equal(objectiveNext.isError, false);
assert.match(objectiveNext.content[0].text, /^primary: /m);
assert.match(objectiveNext.content[0].text, /^operator_input: /m);
assert.match(objectiveNext.content[0].text, /^human_action: /m);
assert.match(objectiveNext.content[0].text, /^automation_blocker: /m);
assert.match(objectiveNext.content[0].text, /^capture_blocked: /m);
assert.match(objectiveNext.content[0].text, /^planned_primary_opens_browser: /m);
assert.match(objectiveNext.content[0].text, /^planned_primary_starts_capture: /m);
assert.match(objectiveNext.content[0].text, /^primary_requires_operator_approval: /m);
assert.match(objectiveNext.content[0].text, /^agent_must_not_run_primary_unattended: /m);
assert.match(objectiveNext.content[0].text, /^missing_artifact_count: /m);
assert.match(objectiveNext.content[0].text, /^missing_artifacts: /m);
assert.match(objectiveNext.content[0].text, /^next_artifact_action: /m);
assert.match(objectiveNext.content[0].text, /^next_artifact_blocker: /m);
assert.match(objectiveNext.content[0].text, /^artifact_command_covers: /m);
if (/^start_commands: /m.test(objectiveNext.content[0].text)) {
  assert.match(objectiveNext.content[0].text, /^start_command_requires_operator_approval_count: /m);
  assert.match(objectiveNext.content[0].text, /^start_command_agent_may_run_unattended_count: /m);
  assert.match(objectiveNext.content[0].text, /^start_operator_approval_required: /m);
}
assert.match(objectiveNext.content[0].text, /^secret_values_read: no$/m);
if (/^manual_handoff_resume_watch_command: /m.test(objectiveNext.content[0].text)) {
  assert.match(objectiveNext.content[0].text, /^manual_handoff_resume_watch_opens_browser: no$/m);
  assert.match(objectiveNext.content[0].text, /^manual_handoff_resume_watch_starts_capture: yes$/m);
  assert.match(objectiveNext.content[0].text, /^manual_handoff_resume_watch_command: .*'--monitor-timeout-ms' '10000'.*'--monitor-interval-ms' '1000'/m);
}
assert.doesNotMatch(objectiveNext.content[0].text, /^\{/);
assert.equal(objectiveNext.structuredContent.safeMode, true);
assert.equal(objectiveNext.structuredContent.destructiveActionsIncluded, false);
assert.equal(typeof objectiveNext.structuredContent.primaryAction.nextArtifactAction, 'string');
assert.equal(
  objectiveNext.structuredContent.primaryAction.startCommandCandidates.every((item) => item.safety && typeof item.safety.requiresOperatorApproval === 'boolean'),
  true
);

const objectiveHandoff = await callTool(11, 'sba_objective_handoff', {
  format: 'compact'
});
assert.equal(objectiveHandoff.isError, false);
assert.match(objectiveHandoff.content[0].text, /^primary: primary-action$/m);
assert.match(objectiveHandoff.content[0].text, /^human_action: /m);
assert.match(objectiveHandoff.content[0].text, /^automation_blocker: /m);
assert.match(objectiveHandoff.content[0].text, /^capture_blocked: /m);
assert.match(objectiveHandoff.content[0].text, /^missing_artifact_count: /m);
assert.match(objectiveHandoff.content[0].text, /^missing_artifacts: /m);
assert.match(objectiveHandoff.content[0].text, /^next_artifact_action: /m);
assert.match(objectiveHandoff.content[0].text, /^next_artifact_blocker: /m);
assert.match(objectiveHandoff.content[0].text, /^artifact_command_covers: /m);
assert.match(objectiveHandoff.content[0].text, /^secret_values_read: no$/m);
assert.doesNotMatch(objectiveHandoff.content[0].text, /^\{/);
assert.equal(objectiveHandoff.structuredContent.safeMode, true);
assert.equal(objectiveHandoff.structuredContent.destructiveActionsIncluded, false);
assert.equal(typeof objectiveHandoff.structuredContent.artifactAction.nextArtifactAction, 'string');

const objectiveCompletionAudit = await callTool(110, 'sba_objective_completion_audit', {
  write: true,
  out: 'operator/mcp-objective-completion-audit-smoke.json',
  format: 'compact'
});
assert.equal(objectiveCompletionAudit.isError, false);
assert.match(objectiveCompletionAudit.content[0].text, /^status: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^complete: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^remaining_count: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^next: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^agent_safe_action: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^agent_safe_command_id: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^agent_safe_command_monitor_only: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^agent_safe_command_may_open_browser: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^agent_safe_command_starts_capture: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^agent_safe_command_blocked_reason: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^auth_watch_handoff_port_reachable: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^missing_artifact_count: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^target_approval_resume_status: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^operator_approval_summary_requires_operator_ok: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^operator_approval_summary_operator_ok_accepted: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^operator_approval_summary_may_open_browser: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^operator_approval_summary_may_start_capture: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(objectiveCompletionAudit.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(objectiveCompletionAudit.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: /m);
assert.match(objectiveCompletionAudit.content[0].text, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(objectiveCompletionAudit.content[0].text, /^target_approval_resume_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(objectiveCompletionAudit.content[0].text, /^target_approval_resume_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
assert.match(objectiveCompletionAudit.content[0].text, /^target_approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
assert.match(objectiveCompletionAudit.content[0].text, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
if (objectiveCompletionAudit.structuredContent.executionPolicy.agentSafeCommand) {
  assert.match(objectiveCompletionAudit.content[0].text, /^agent_safe_command: /m);
} else {
  assert.doesNotMatch(objectiveCompletionAudit.content[0].text, /^agent_safe_command: /m);
}
assert.match(objectiveCompletionAudit.content[0].text, /^secret_values_read: no$/m);
assert.match(objectiveCompletionAudit.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(objectiveCompletionAudit.content[0].text, /^\{/);
assert.equal(objectiveCompletionAudit.structuredContent.safeMode, true);
assert.equal(objectiveCompletionAudit.structuredContent.destructiveActionsIncluded, false);
assert.equal(objectiveCompletionAudit.structuredContent.outputPath.endsWith('/runs/operator/mcp-objective-completion-audit-smoke.json'), true);

const objectiveCompletionAuditStatus = await callTool(112, 'sba_objective_completion_audit_status', {
  in: 'operator/mcp-objective-completion-audit-smoke.json',
  format: 'compact'
});
assert.equal(objectiveCompletionAuditStatus.isError, false);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^exists: yes$/m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^parse_ok: yes$/m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^saved_complete: /m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^remaining_count: /m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^agent_safe_next_command_id: /m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^agent_safe_next_opens_browser: no$/m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^agent_safe_next_starts_capture: no$/m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^agent_safe_next_reads_browser_storage: no$/m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^agent_safe_next_returns_page_content: no$/m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^secret_values_read: no$/m);
assert.match(objectiveCompletionAuditStatus.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(objectiveCompletionAuditStatus.content[0].text, /^\{/);
assert.equal(objectiveCompletionAuditStatus.structuredContent.safeMode, true);
assert.equal(objectiveCompletionAuditStatus.structuredContent.opensBrowserNow, false);
assert.equal(objectiveCompletionAuditStatus.structuredContent.startsCaptureNow, false);
assert.equal(objectiveCompletionAuditStatus.structuredContent.readsBrowserStorage, false);

const objectiveCompletionAuditWatch = await callTool(113, 'sba_objective_completion_audit_watch', {
  run: true,
  in: 'operator/mcp-objective-completion-audit-smoke.json',
  out: 'operator/mcp-objective-completion-audit-smoke.json',
  format: 'compact'
});
assert.equal(objectiveCompletionAuditWatch.isError, false);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^run_requested: yes$/m);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^executed: no$/m);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^opens_browser_now: no$/m);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^starts_capture_now: no$/m);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^reads_browser_storage: no$/m);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^secret_values_read: no$/m);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^destructive_actions: no$/m);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^after_exists: yes$/m);
assert.match(objectiveCompletionAuditWatch.content[0].text, /^after_parse_ok: yes$/m);
assert.doesNotMatch(objectiveCompletionAuditWatch.content[0].text, /^\{/);
assert.equal(objectiveCompletionAuditWatch.structuredContent.safeMode, true);
assert.equal(objectiveCompletionAuditWatch.structuredContent.opensBrowserNow, false);
assert.equal(objectiveCompletionAuditWatch.structuredContent.startsCaptureNow, false);
assert.equal(objectiveCompletionAuditWatch.structuredContent.readsBrowserStorage, false);

const objectiveSafeCommand = await callTool(111, 'sba_objective_safe_command', {
  monitorTimeoutMs: 10000,
  monitorIntervalMs: 1000,
  format: 'compact'
});
assert.equal(objectiveSafeCommand.isError, false);
assert.match(objectiveSafeCommand.content[0].text, /^status: /m);
assert.match(objectiveSafeCommand.content[0].text, /^agent_safe_action: /m);
assert.match(objectiveSafeCommand.content[0].text, /^agent_safe_command_id: /m);
assert.match(objectiveSafeCommand.content[0].text, /^agent_safe_command_monitor_only: /m);
assert.match(objectiveSafeCommand.content[0].text, /^agent_safe_command_may_open_browser: /m);
assert.match(objectiveSafeCommand.content[0].text, /^agent_safe_command_starts_capture: /m);
assert.match(objectiveSafeCommand.content[0].text, /^agent_safe_command_blocked_reason: /m);
assert.match(objectiveSafeCommand.content[0].text, /^auth_watch_handoff_port_reachable: /m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_plan_status: /m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_capture_blocked: /m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_monitor_available: /m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_capture_available: /m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_opens_browser_now: no$/m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_starts_capture_now: no$/m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_capture_start_ready: /m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_capture_start_blockers: /m);
assert.match(objectiveSafeCommand.content[0].text, /^handoff_resume_watch_available: /m);
assert.match(objectiveSafeCommand.content[0].text, /^handoff_resume_watch_may_open_browser: no$/m);
assert.match(objectiveSafeCommand.content[0].text, /^target_approval_resume_status: /m);
assert.match(objectiveSafeCommand.content[0].text, /^operator_approval_summary_requires_operator_ok: /m);
assert.match(objectiveSafeCommand.content[0].text, /^operator_approval_summary_operator_ok_accepted: /m);
assert.match(objectiveSafeCommand.content[0].text, /^operator_approval_summary_may_open_browser: /m);
assert.match(objectiveSafeCommand.content[0].text, /^operator_approval_summary_may_start_capture: /m);
assert.match(objectiveSafeCommand.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(objectiveSafeCommand.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(objectiveSafeCommand.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: /m);
assert.match(objectiveSafeCommand.content[0].text, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(objectiveSafeCommand.content[0].text, /^target_approval_resume_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
assert.match(objectiveSafeCommand.content[0].text, /^target_approval_resume_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
assert.match(objectiveSafeCommand.content[0].text, /^target_approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
assert.match(objectiveSafeCommand.content[0].text, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
if (objectiveSafeCommand.structuredContent.command) {
  assert.match(objectiveSafeCommand.content[0].text, /^command: /m);
  assert.match(objectiveSafeCommand.content[0].text, /^agent_loop_step_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json'( '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000')? '--timeout-ms' '300000' '--format' 'compact'$/m);
} else {
  assert.doesNotMatch(objectiveSafeCommand.content[0].text, /^command: /m);
  assert.doesNotMatch(objectiveSafeCommand.content[0].text, /^agent_loop_step_run_command: /m);
}
assert.match(objectiveSafeCommand.content[0].text, /^agent_loop_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json'( '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000')? '--format' 'compact'$/m);
assert.match(objectiveSafeCommand.content[0].text, /^agent_loop_step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
assert.match(objectiveSafeCommand.content[0].text, /^background_proof_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status'/m);
if (/^background_proof_capture_start_command: /m.test(objectiveSafeCommand.content[0].text)) {
  assert.match(objectiveSafeCommand.content[0].text, /^background_proof_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture'/m);
} else {
  assert.match(objectiveSafeCommand.content[0].text, /^background_proof_capture_start_ready: no$/m);
}
if (/^background_proof_monitor_start_command: /m.test(objectiveSafeCommand.content[0].text)) {
  assert.match(objectiveSafeCommand.content[0].text, /^background_proof_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor'/m);
} else {
  assert.match(objectiveSafeCommand.content[0].text, /^background_proof_monitor_start_ready: no$/m);
}
if (objectiveSafeCommand.structuredContent.handoffResumeWatch?.available) {
  assert.match(objectiveSafeCommand.content[0].text, /^handoff_resume_watch_plan_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
  if (/^handoff_resume_watch_run_command: /m.test(objectiveSafeCommand.content[0].text)) {
    assert.match(objectiveSafeCommand.content[0].text, /^handoff_resume_watch_run_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
  } else {
    assert.match(objectiveSafeCommand.content[0].text, /^handoff_resume_watch_blocked_reason: /m);
  }
}
assert.match(objectiveSafeCommand.content[0].text, /^secret_values_read: no$/m);
assert.match(objectiveSafeCommand.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(objectiveSafeCommand.content[0].text, /^\{/);
assert.equal(objectiveSafeCommand.structuredContent.safeMode, true);
assert.equal(objectiveSafeCommand.structuredContent.secretValuesRead, false);
assert.equal(objectiveSafeCommand.structuredContent.destructiveActionsIncluded, false);
assert.equal(typeof objectiveSafeCommand.structuredContent.backgroundProofCapture.planStatus, 'string');

const objectiveProofPipeline = await callTool(112, 'sba_objective_proof_pipeline', {
  monitorTimeoutMs: 10000,
  monitorIntervalMs: 1000,
  format: 'compact'
});
assert.equal(objectiveProofPipeline.isError, false);
assert.match(objectiveProofPipeline.content[0].text, /^status: /m);
assert.match(objectiveProofPipeline.content[0].text, /^recommended_now: /m);
assert.match(objectiveProofPipeline.content[0].text, /^monitor_auth_available: /m);
assert.match(objectiveProofPipeline.content[0].text, /^reopen_login_available: /m);
assert.match(objectiveProofPipeline.content[0].text, /^reopen_login_starts_capture: no$/m);
assert.match(objectiveProofPipeline.content[0].text, /^wait_auth_then_capture_available: /m);
if (objectiveProofPipeline.structuredContent.phases.monitorAuth.available) {
  assert.match(objectiveProofPipeline.content[0].text, /^monitor_auth_command: .*'--timeout-ms' '10000' '--interval-ms' '1000'/m);
}
if (objectiveProofPipeline.structuredContent.phases.reopenLogin.available) {
  assert.match(objectiveProofPipeline.content[0].text, /^reopen_login_command: /m);
}
assert.match(objectiveProofPipeline.content[0].text, /^secret_values_read: no$/m);
assert.match(objectiveProofPipeline.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(objectiveProofPipeline.content[0].text, /^\{/);
assert.equal(objectiveProofPipeline.structuredContent.safeMode, true);
assert.equal(objectiveProofPipeline.structuredContent.secretValuesRead, false);
assert.equal(objectiveProofPipeline.structuredContent.destructiveActionsIncluded, false);

const operatorPack = await callTool(12, 'sba_operator_pack', {
  chromeMcpStatusText: 'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29',
  chromeMcpListPagesText: 'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
  chromeMcpSource: 'mcp-compact-smoke',
  chromeExtensionBackendAvailable: 'no',
  chromeExtensionBackendLastError: 'Browser is not available: extension',
  monitorTimeoutMs: 10000,
  monitorIntervalMs: 1000,
  format: 'compact'
});
assert.equal(operatorPack.isError, false);
assert.match(operatorPack.content[0].text, /^status: /m);
assert.match(operatorPack.content[0].text, /^target: /m);
assert.match(operatorPack.content[0].text, /^human_action: /m);
assert.match(operatorPack.content[0].text, /^auth_state: /m);
assert.match(operatorPack.content[0].text, /^auth_usable: /m);
assert.match(operatorPack.content[0].text, /^profile_auth_metadata_only: /m);
assert.match(operatorPack.content[0].text, /^handoff_auth_check_port: /m);
assert.match(operatorPack.content[0].text, /^handoff_auth_check_port_reachable: /m);
assert.match(operatorPack.content[0].text, /^primary_command_opens_browser: /m);
assert.match(operatorPack.content[0].text, /^primary_command_waits_for_auth: /m);
assert.match(operatorPack.content[0].text, /^primary_command_starts_capture: /m);
assert.match(operatorPack.content[0].text, /^primary_command_requires_operator_approval: /m);
assert.match(operatorPack.content[0].text, /^primary_command_agent_may_run_unattended: /m);
assert.match(operatorPack.content[0].text, /^agent_safe_action: /m);
assert.match(operatorPack.content[0].text, /^agent_safe_command_id: /m);
assert.match(operatorPack.content[0].text, /^agent_safe_command_monitor_only: /m);
assert.match(operatorPack.content[0].text, /^agent_safe_command_may_open_browser: /m);
assert.match(operatorPack.content[0].text, /^agent_safe_command_starts_capture: /m);
assert.match(operatorPack.content[0].text, /^agent_next_proof_plan_available: /m);
assert.match(operatorPack.content[0].text, /^agent_next_proof_plan_may_run_without_approval: /m);
assert.match(operatorPack.content[0].text, /^agent_next_operator_approval_proof_plan_opens_browser: no$/m);
assert.match(operatorPack.content[0].text, /^agent_next_operator_approval_proof_plan_starts_capture: no$/m);
assert.match(operatorPack.content[0].text, /^agent_next_operator_approval_proof_plan_reads_browser_storage: no$/m);
assert.match(operatorPack.content[0].text, /^agent_next_operator_approval_proof_plan_returns_page_content: no$/m);
assert.match(operatorPack.content[0].text, /^agent_next_operator_approval_proof_plan_may_run_unattended: yes$/m);
assert.match(operatorPack.content[0].text, /^agent_next_provider_default_backend: /m);
assert.match(operatorPack.content[0].text, /^agent_next_provider_playwright_ready_for_authenticated_default: no$/m);
assert.match(operatorPack.content[0].text, /^agent_next_provider_playwright_storage_state_sensitive: /m);
assert.match(operatorPack.content[0].text, /^agent_next_provider_doctor_opens_browser: no$/m);
assert.match(operatorPack.content[0].text, /^agent_next_provider_doctor_starts_capture: no$/m);
assert.match(operatorPack.content[0].text, /^agent_next_provider_doctor_reads_browser_storage: no$/m);
assert.match(operatorPack.content[0].text, /^agent_next_provider_doctor_returns_page_content: no$/m);
assert.match(operatorPack.content[0].text, /^monitor_only_command_available: /m);
assert.match(operatorPack.content[0].text, /^auth_first_resume_available: /m);
assert.match(operatorPack.content[0].text, /^proof_capture_allowed_now: /m);
assert.match(operatorPack.content[0].text, /^proof_capture_blocked_until_auth: /m);
assert.match(operatorPack.content[0].text, /^auth_first_resume_may_open_browser: /m);
assert.match(operatorPack.content[0].text, /^auth_first_resume_starts_capture_after_auth_only: /m);
assert.match(operatorPack.content[0].text, /^operator_must_login: /m);
assert.match(operatorPack.content[0].text, /^proof_gate_next_artifact_action: /m);
assert.match(operatorPack.content[0].text, /^proof_gate_next_artifact_blocker: /m);
assert.match(operatorPack.content[0].text, /^proof_gate_artifact_command_covers: /m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_operator_resume_requires_operator_approval: /m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_operator_resume_opens_browser: /m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_operator_resume_starts_capture: /m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_operator_resume_agent_may_run_unattended: no$/m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_provider_default_backend: /m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_provider_playwright_ready_for_authenticated_default: no$/m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_provider_doctor_opens_browser: no$/m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_provider_doctor_reads_browser_storage: no$/m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
assert.match(operatorPack.content[0].text, /^agent_proof_closeout_operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
assert.match(operatorPack.content[0].text, /^login_handoff_status: /m);
assert.match(operatorPack.content[0].text, /^login_handoff_next_action: /m);
assert.match(operatorPack.content[0].text, /^login_handoff_safe_monitor_available: /m);
assert.match(operatorPack.content[0].text, /^login_handoff_opens_browser_now: no$/m);
assert.match(operatorPack.content[0].text, /^login_handoff_starts_capture_now: no$/m);
assert.match(operatorPack.content[0].text, /^background_proof_plan_status: /m);
assert.match(operatorPack.content[0].text, /^background_proof_capture_blocked: /m);
assert.match(operatorPack.content[0].text, /^background_proof_monitor_available: /m);
assert.match(operatorPack.content[0].text, /^background_proof_capture_available: /m);
assert.match(operatorPack.content[0].text, /^background_proof_monitor_running: /m);
assert.match(operatorPack.content[0].text, /^background_proof_capture_running: /m);
assert.match(operatorPack.content[0].text, /^background_proof_capture_start_ready: /m);
assert.match(operatorPack.content[0].text, /^background_proof_capture_start_blockers: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_prepared: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_available: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_observed_available: no$/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_ready: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_next_action: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_resume_action: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_operator_ok_required: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_user_permission_required: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_claim_plan_ready: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_claim_plan_next_action: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_claim_plan_next_tool: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_claim_plan_snippet_keys: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_check_plan_next_action: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_check_plan_next_tool: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_check_plan_snippet_keys: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_troubleshoot_next_action: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_mcp_page_list_timeout: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_mcp_use_everyday_now: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_mcp_timeout_plan_next_action: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_mcp_timeout_plan_findings: /m);
assert.match(operatorPack.content[0].text, /^regular_chrome_mcp_timeout_plan_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan'/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_check_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-backend-check-plan'/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_check_record_failure_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect' '--chrome-extension-prepared' 'yes' '--chrome-extension-backend-available' 'no'/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_check_record_success_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect' '--chrome-extension-prepared' 'yes' '--chrome-extension-backend-available' 'yes'/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_troubleshoot_command: 'node' 'src\/cli\.mjs' 'chrome-extension-troubleshoot'/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_claim_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-claim-plan'/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_backend_last_error: Browser is not available: extension$/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_resume_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume'/m);
assert.match(operatorPack.content[0].text, /^regular_chrome_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK'/m);
assert.match(operatorPack.content[0].text, /^backend_matrix_status: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_default_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_default_agent_interface: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_search_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_analyze_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_scrape_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_operate_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_authenticated_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_existing_tab_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_public_crawl_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_compatibility_backend: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_regular_chrome_status: /m);
assert.match(operatorPack.content[0].text, /^backend_matrix_saved_secret_values_read: no$/m);
assert.match(operatorPack.content[0].text, /^backend_matrix_saved_destructive_actions: no$/m);
assert.match(operatorPack.content[0].text, /^backend_matrix_refresh_command: 'node' 'src\/cli\.mjs' 'backend-matrix'/m);
assert.match(operatorPack.content[0].text, /^backend_matrix_status_command: 'node' 'src\/cli\.mjs' 'backend-matrix-status'/m);
assert.match(operatorPack.content[0].text, /^background_proof_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status'/m);
assert.match(operatorPack.content[0].text, /^background_proof_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture'/m);
assert.match(operatorPack.content[0].text, /^background_proof_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor'/m);
assert.match(operatorPack.content[0].text, /^login_handoff_status_command: 'node' 'src\/cli\.mjs' 'login-handoff-status'/m);
assert.match(operatorPack.content[0].text, /^agent_safe_command_id: /m);
if (/^agent_safe_command_blocked_reason: handoff-auth-check-port-unreachable$/m.test(operatorPack.content[0].text)) {
  assert.doesNotMatch(operatorPack.content[0].text, /^agent_safe_command: /m);
  assert.match(operatorPack.content[0].text, /^auth_first_reopen_login_command: /m);
} else {
  assert.match(operatorPack.content[0].text, /^agent_safe_command: /m);
}
assert.match(operatorPack.content[0].text, /^agent_loop_step_saved_exists: /m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_saved_stale: /m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_saved_status: /m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_saved_next_action: /m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_saved_recommended_command_id: /m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_saved_allowed_to_run: /m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_saved_executed: /m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
if (/^agent_loop_step_run_command: /m.test(operatorPack.content[0].text)) {
  assert.match(operatorPack.content[0].text, /^agent_loop_step_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--timeout-ms' '300000' '--format' 'compact'$/m);
}
assert.match(operatorPack.content[0].text, /^agent_loop_step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
assert.match(operatorPack.content[0].text, /^agent_next_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--real-external'.*'--format' 'compact'$/m);
assert.match(operatorPack.content[0].text, /^agent_next_operator_approval_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--real-external'.*'--format' 'compact'$/m);
assert.match(operatorPack.content[0].text, /^agent_next_provider_doctor_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_recommended_command: 'node' 'src\/cli\.mjs' 'agent-loop-step'/m);
assert.match(operatorPack.content[0].text, /^agent_loop_step_refresh_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
if (operatorPack.structuredContent.agentLoopStepStatus?.recommendedCommandId === 'run-agent-loop-step') {
  assert.match(operatorPack.content[0].text, /^agent_loop_step_saved_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--format' 'compact'$/m);
}
assert.match(operatorPack.content[0].text, /^monitor_only_command_available: /m);
if (/^auth_watch_command: /m.test(operatorPack.content[0].text)) {
  assert.match(operatorPack.content[0].text, /^auth_watch_command: /m);
}
assert.match(operatorPack.content[0].text, /^handoff_resume_command: /m);
assert.doesNotMatch(operatorPack.content[0].text, /open-chrome-window/);
assert.match(operatorPack.content[0].text, /^secret_env_handoff_mode: /m);
assert.match(operatorPack.content[0].text, /^secret_mutates_onepassword_now: no$/m);
assert.match(operatorPack.content[0].text, /^proof_gate_watch_status: /m);
assert.match(operatorPack.content[0].text, /^secret_values_read: no$/m);
assert.match(operatorPack.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(operatorPack.content[0].text, /^\{/);
assert.equal(operatorPack.structuredContent.safeMode, true);
assert.equal(operatorPack.structuredContent.secretValuesRead, false);
assert.equal(typeof operatorPack.structuredContent.proofGateArtifactAction.nextArtifactAction, 'string');
assert.equal(typeof operatorPack.structuredContent.loginHandoff.nextAction, 'string');
assert.equal(typeof operatorPack.structuredContent.backgroundProofCapture.planStatus, 'string');
assert.equal(typeof operatorPack.structuredContent.agentLoopStepStatus.recommendedCommandId, 'string');

const operatorPackStatus = await callTool(13, 'sba_operator_pack_status', {
  format: 'compact'
});
assert.equal(operatorPackStatus.isError, false);
assert.match(operatorPackStatus.content[0].text, /^status_only: yes$/m);
assert.match(operatorPackStatus.content[0].text, /^opens_browser_now: no$/m);
assert.match(operatorPackStatus.content[0].text, /^starts_capture_now: no$/m);
assert.match(operatorPackStatus.content[0].text, /^reads_browser_storage: no$/m);
assert.match(operatorPackStatus.content[0].text, /^page_content_returned: no$/m);
assert.match(operatorPackStatus.content[0].text, /^provider_public_benchmark_proof_ok: /m);
assert.equal(operatorPackStatus.structuredContent.statusOnly, true);
assert.equal(operatorPackStatus.structuredContent.secretValuesRead, false);
assert.equal(operatorPackStatus.structuredContent.opensBrowserNow, false);
assert.equal(operatorPackStatus.structuredContent.startsCaptureNow, false);

const operatorRunbook = await callTool(13, 'sba_operator_runbook', {
  monitorTimeoutMs: 10000,
  monitorIntervalMs: 1000,
  format: 'compact'
});
assert.equal(operatorRunbook.isError, false);
assert.match(operatorRunbook.content[0].text, /^status: /m);
assert.match(operatorRunbook.content[0].text, /^steps: /m);
assert.match(operatorRunbook.content[0].text, /^auth_state: /m);
assert.match(operatorRunbook.content[0].text, /^auth_usable: /m);
assert.match(operatorRunbook.content[0].text, /^profile_auth_metadata_only: /m);
assert.match(operatorRunbook.content[0].text, /^handoff_auth_check_port: /m);
assert.match(operatorRunbook.content[0].text, /^handoff_auth_check_port_reachable: /m);
assert.match(operatorRunbook.content[0].text, /^proof_gate_next_artifact_action: /m);
assert.match(operatorRunbook.content[0].text, /^proof_gate_next_artifact_blocker: /m);
assert.match(operatorRunbook.content[0].text, /^proof_gate_artifact_command_covers: /m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_operator_resume_requires_operator_approval: /m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_operator_resume_opens_browser: /m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_operator_resume_starts_capture: /m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_operator_resume_agent_may_run_unattended: no$/m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_provider_default_backend: /m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_provider_playwright_ready_for_authenticated_default: no$/m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_provider_doctor_opens_browser: no$/m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_provider_doctor_reads_browser_storage: no$/m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
assert.match(operatorRunbook.content[0].text, /^agent_proof_closeout_operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
assert.match(operatorRunbook.content[0].text, /^login_handoff_status: /m);
assert.match(operatorRunbook.content[0].text, /^login_handoff_next_action: /m);
assert.match(operatorRunbook.content[0].text, /^login_handoff_opens_browser_now: no$/m);
assert.match(operatorRunbook.content[0].text, /^login_handoff_starts_capture_now: no$/m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_status: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_default_backend: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_default_agent_interface: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_search_backend: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_analyze_backend: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_scrape_backend: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_operate_backend: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_authenticated_backend: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_existing_tab_backend: /m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_saved_secret_values_read: no$/m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_saved_destructive_actions: no$/m);
assert.match(operatorRunbook.content[0].text, /^agent_next_provider_default_backend: /m);
assert.match(operatorRunbook.content[0].text, /^agent_next_provider_playwright_ready_for_authenticated_default: no$/m);
assert.match(operatorRunbook.content[0].text, /^agent_next_provider_doctor_opens_browser: no$/m);
assert.match(operatorRunbook.content[0].text, /^agent_next_provider_doctor_reads_browser_storage: no$/m);
assert.match(operatorRunbook.content[0].text, /^background_proof_plan_status: /m);
assert.match(operatorRunbook.content[0].text, /^background_proof_capture_blocked: /m);
assert.match(operatorRunbook.content[0].text, /^background_proof_monitor_available: /m);
assert.match(operatorRunbook.content[0].text, /^background_proof_capture_available: /m);
assert.match(operatorRunbook.content[0].text, /^background_proof_monitor_running: /m);
assert.match(operatorRunbook.content[0].text, /^background_proof_capture_running: /m);
assert.match(operatorRunbook.content[0].text, /^background_proof_capture_start_ready: /m);
assert.match(operatorRunbook.content[0].text, /^background_proof_capture_start_blockers: /m);
assert.match(operatorRunbook.content[0].text, /^agent_loop_step_saved_exists: /m);
assert.match(operatorRunbook.content[0].text, /^agent_loop_step_saved_stale: /m);
assert.match(operatorRunbook.content[0].text, /^agent_loop_step_saved_status: /m);
assert.match(operatorRunbook.content[0].text, /^agent_loop_step_saved_recommended_command_id: /m);
assert.match(operatorRunbook.content[0].text, /^agent_loop_step_saved_allowed_to_run: /m);
assert.match(operatorRunbook.content[0].text, /^agent_loop_step_saved_executed: /m);
assert.match(operatorRunbook.content[0].text, /^secret_values_read: no$/m);
assert.match(operatorRunbook.content[0].text, /^opens_browser_now: no$/m);
if (/^auth_watch_command: /m.test(operatorRunbook.content[0].text)) {
  assert.match(operatorRunbook.content[0].text, /^auth_watch_command: /m);
} else {
  assert.match(operatorRunbook.content[0].text, /^login_handoff_safe_monitor_available: no$/m);
}
assert.match(operatorRunbook.content[0].text, /^backend_matrix_status_command: 'node' 'src\/cli\.mjs' 'backend-matrix-status'/m);
assert.match(operatorRunbook.content[0].text, /^backend_matrix_refresh_command: 'node' 'src\/cli\.mjs' 'backend-matrix'/m);
assert.match(operatorRunbook.content[0].text, /^agent_next_provider_doctor_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
assert.match(operatorRunbook.content[0].text, /^login_handoff_status_command: 'node' 'src\/cli\.mjs' 'login-handoff-status'/m);
assert.match(operatorRunbook.content[0].text, /^background_proof_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status'/m);
if (/^background_proof_capture_start_command: /m.test(operatorRunbook.content[0].text)) {
  assert.match(operatorRunbook.content[0].text, /^background_proof_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture'/m);
} else {
  assert.match(operatorRunbook.content[0].text, /^background_proof_capture_start_ready: no$/m);
}
if (/^background_proof_monitor_start_command: /m.test(operatorRunbook.content[0].text)) {
  assert.match(operatorRunbook.content[0].text, /^background_proof_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor'/m);
} else {
  assert.match(operatorRunbook.content[0].text, /^background_proof_monitor_available: no$/m);
}
assert.match(operatorRunbook.content[0].text, /^agent_loop_step_status_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
assert.match(operatorRunbook.content[0].text, /^agent_loop_step_recommended_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
assert.match(operatorRunbook.content[0].text, /^regular_chrome_resume_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume'/m);
assert.match(operatorRunbook.content[0].text, /^regular_chrome_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK'/m);
assert.doesNotMatch(operatorRunbook.content[0].text, /open-chrome-window/);
assert.doesNotMatch(operatorRunbook.content[0].text, /^\{/);
assert.equal(operatorRunbook.structuredContent.safeMode, true);
assert.equal(operatorRunbook.structuredContent.secretValuesRead, false);
assert.equal(typeof operatorRunbook.structuredContent.proofGateArtifactAction.nextArtifactAction, 'string');
assert.equal(typeof operatorRunbook.structuredContent.loginHandoff.nextAction, 'string');
assert.equal(typeof operatorRunbook.structuredContent.backendMatrix.defaultBackend, 'string');
assert.equal(typeof operatorRunbook.structuredContent.backgroundProofCapture.planStatus, 'string');
assert.equal(typeof operatorRunbook.structuredContent.agentLoopStepStatus.recommendedCommandId, 'string');

const resumePlan = await callTool(14, 'sba_objective_resume', {
  format: 'compact'
});
assert.equal(resumePlan.isError, false);
assert.match(resumePlan.content[0].text, /^status: /m);
assert.match(resumePlan.content[0].text, /^operator_ok_required: /m);
assert.match(resumePlan.content[0].text, /^operator_ok_accepted: /m);
assert.match(resumePlan.content[0].text, /^planned_command_opens_browser: /m);
assert.match(resumePlan.content[0].text, /^planned_command_starts_capture: /m);
assert.match(resumePlan.content[0].text, /^opens_browser_now: no$/m);
assert.match(resumePlan.content[0].text, /^starts_capture_now: no$/m);
assert.match(resumePlan.content[0].text, /^human_action: /m);
assert.match(resumePlan.content[0].text, /^automation_blocker: /m);
assert.match(resumePlan.content[0].text, /^capture_blocked: /m);
assert.match(resumePlan.content[0].text, /^next_artifact_action: /m);
assert.match(resumePlan.content[0].text, /^next_artifact_blocker: /m);
assert.match(resumePlan.content[0].text, /^artifact_command_covers: /m);
assert.equal(resumePlan.structuredContent.safeMode, true);
assert.equal(resumePlan.structuredContent.destructiveActionsIncluded, false);
assert.equal(typeof resumePlan.structuredContent.action.nextArtifactAction, 'string');

const secretAudit = await callTool(15, 'sba_secret_audit', {
  format: 'compact'
});
assert.equal(secretAudit.isError, false);
assert.match(secretAudit.content[0].text, /^headless_ready: /m);
assert.equal(secretAudit.structuredContent.secretValuesRead, false);

const secretSetupPlan = await callTool(16, 'sba_secret_setup_plan', {
  mode: 'service-account',
  format: 'compact'
});
assert.equal(secretSetupPlan.isError, false);
assert.match(secretSetupPlan.content[0].text, /^mode: service-account$/m);
assert.equal(secretSetupPlan.structuredContent.secretValuesRead, false);

const secretRunPlan = await callTool(17, 'sba_secret_run_plan', {
  mode: 'service-account',
  command: 'target-login-capture',
  targetDir: 'runs/target-packs/github',
  format: 'compact'
});
assert.equal(secretRunPlan.isError, false);
assert.match(secretRunPlan.content[0].text, /^command_id: target-login-capture$/m);
assert.match(secretRunPlan.content[0].text, /^run_opens_browser: yes$/m);
assert.match(secretRunPlan.content[0].text, /^run_starts_capture: yes$/m);
assert.match(secretRunPlan.content[0].text, /^run_requires_operator_approval: yes$/m);
assert.match(secretRunPlan.content[0].text, /^run_agent_may_run_unattended: no$/m);
assert.match(secretRunPlan.content[0].text, /^run: (?:'op' 'run' '--' 'node'|'sh' '-lc' .*'op.*'run)/m);
assert.doesNotMatch(secretRunPlan.content[0].text, /OP_SERVICE_ACCOUNT_TOKEN=/);
assert.equal(secretRunPlan.structuredContent.secretValuesRead, false);

const secretEnvHandoff = await callTool(18, 'sba_secret_env_handoff', {
  mode: 'environment-local-env',
  format: 'compact'
});
assert.equal(secretEnvHandoff.isError, false);
assert.match(secretEnvHandoff.content[0].text, /^mode: environment-local-env$/m);
assert.match(secretEnvHandoff.content[0].text, /^secret_values_read: no$/m);
assert.match(secretEnvHandoff.content[0].text, /^mutates_onepassword_now: no$/m);
assert.match(secretEnvHandoff.content[0].text, /^commands: /m);
assert.doesNotMatch(secretEnvHandoff.content[0].text, /^\{/);
assert.equal(secretEnvHandoff.structuredContent.secretValuesRead, false);

const proofNext = await callTool(19, 'sba_target_proof_next', {
  realExternal: true,
  format: 'compact'
});
assert.equal(proofNext.isError, false);
assert.match(proofNext.content[0].text, /^next: /m);
assert.match(proofNext.content[0].text, /^next_command_requires_operator_approval: /m);
assert.match(proofNext.content[0].text, /^next_command_agent_may_run_unattended: /m);
assert.match(proofNext.content[0].text, /^human_action: /m);
assert.match(proofNext.content[0].text, /^automation_blocker: /m);
assert.match(proofNext.content[0].text, /^capture_blocked: /m);
assert.match(proofNext.content[0].text, /^auth_usable: /m);
assert.match(proofNext.content[0].text, /^auth_state: /m);
assert.match(proofNext.content[0].text, /^profile_auth_metadata_only: /m);
assert.match(proofNext.content[0].text, /^missing_artifact_count: /m);
assert.match(proofNext.content[0].text, /^missing_artifacts: /m);
assert.match(proofNext.content[0].text, /^missing_output_files: /m);
if (/^start_commands: /m.test(proofNext.content[0].text)) {
  assert.match(proofNext.content[0].text, /^start_command_requires_operator_approval_count: /m);
  assert.match(proofNext.content[0].text, /^start_command_agent_may_run_unattended_count: /m);
  assert.match(proofNext.content[0].text, /^start_operator_approval_required: /m);
}
assert.match(proofNext.content[0].text, /^secret_values_read: no$/m);
assert.match(proofNext.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(proofNext.content[0].text, /^\{/);
assert.equal(proofNext.structuredContent.safeMode, true);
assert.equal(proofNext.structuredContent.destructiveActionsIncluded, false);
assert.equal(typeof proofNext.structuredContent.nextCommandSafety.requiresOperatorApproval, 'boolean');
assert.equal(typeof proofNext.structuredContent.nextCommandSafety.agentMayRunUnattended, 'boolean');
assert.equal(
  proofNext.structuredContent.startCommandCandidates.every((item) => item.safety && typeof item.safety.agentMayRunUnattended === 'boolean'),
  true
);

const proofInventory = await callTool(190, 'sba_target_proof_inventory', {
  realExternal: true,
  format: 'compact'
});
assert.equal(proofInventory.isError, false);
assert.match(proofInventory.content[0].text, /^complete: /m);
assert.match(proofInventory.content[0].text, /^target_packs: /m);
assert.match(proofInventory.content[0].text, /^summary_auth_usable: /m);
assert.match(proofInventory.content[0].text, /^targets_compact: /m);
assert.match(proofInventory.content[0].text, /^target: /m);
assert.match(proofInventory.content[0].text, /^next_command_requires_operator_approval: /m);
assert.match(proofInventory.content[0].text, /^next_command_agent_may_run_unattended: /m);
assert.match(proofInventory.content[0].text, /^auth_state: /m);
assert.match(proofInventory.content[0].text, /^missing_artifact_count: /m);
assert.match(proofInventory.content[0].text, /^secret_values_read: no$/m);
assert.match(proofInventory.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(proofInventory.content[0].text, /^\{/);
assert.equal(proofInventory.structuredContent.safeMode, true);
assert.equal(proofInventory.structuredContent.destructiveActionsIncluded, false);
assert.equal(
  proofInventory.structuredContent.targets.every((item) => item.nextCommandSafety && typeof item.nextCommandSafety.requiresOperatorApproval === 'boolean'),
  true
);

const proofPlan = await callTool(191, 'sba_target_proof_plan', {
  targetDir: 'runs/target-packs/example-public',
  realExternal: true,
  format: 'compact'
});
assert.equal(proofPlan.isError, false);
assert.match(proofPlan.content[0].text, /^safe_mode: yes$/m);
assert.match(proofPlan.content[0].text, /^status_only: yes$/m);
assert.match(proofPlan.content[0].text, /^proof_ready: /m);
assert.match(proofPlan.content[0].text, /^missing_artifacts: /m);
assert.match(proofPlan.content[0].text, /^next_command_opens_browser: /m);
assert.match(proofPlan.content[0].text, /^next_command_starts_capture: /m);
assert.match(proofPlan.content[0].text, /^next_command_requires_operator_approval: /m);
assert.match(proofPlan.content[0].text, /^next_command_agent_may_run_unattended: /m);
assert.match(proofPlan.content[0].text, /^next_command: /m);
assert.match(proofPlan.content[0].text, /^secret_values_read: no$/m);
assert.match(proofPlan.content[0].text, /^destructive_actions: no$/m);
assert.doesNotMatch(proofPlan.content[0].text, /^\{/);
assert.equal(proofPlan.structuredContent.safeMode, true);
assert.equal(proofPlan.structuredContent.destructiveActionsIncluded, false);
assert.equal(typeof proofPlan.structuredContent.nextAction.id, 'string');
assert.equal(typeof proofPlan.structuredContent.nextCommandSafety.opensBrowser, 'boolean');
assert.equal(typeof proofPlan.structuredContent.nextCommandSafety.startsCapture, 'boolean');
assert.equal(typeof proofPlan.structuredContent.nextCommandSafety.requiresOperatorApproval, 'boolean');
assert.equal(typeof proofPlan.structuredContent.nextCommandSafety.agentMayRunUnattended, 'boolean');
assert.equal(
  proofPlan.structuredContent.commands.every((item) => item.safety && typeof item.safety.requiresOperatorApproval === 'boolean'),
  true
);

const handoffStatus = await callTool(20, 'sba_target_handoff_status', {
  targetDir: 'runs/target-packs/example-public',
  handoff: 'operator-handoff.json',
  format: 'compact'
});
assert.equal(handoffStatus.isError, false);
assert.match(handoffStatus.content[0].text, /^available: /m);
assert.equal(handoffStatus.structuredContent.secretValuesRead, false);

const handoffResume = await callTool(21, 'sba_target_handoff_resume', {
  targetDir: 'runs/target-packs/example-public',
  handoff: 'operator-handoff.json',
  format: 'compact'
});
assert.equal(handoffResume.isError, false);
assert.match(handoffResume.content[0].text, /^status: planned$/m);
assert.equal(handoffResume.structuredContent.secretValuesRead, false);

const handoffResumeStatus = await callTool(211, 'sba_target_handoff_resume_status', {
  targetDir: 'runs/target-packs/example-public',
  handoff: 'operator-handoff.json',
  monitorTimeoutMs: 10000,
  monitorIntervalMs: 1000,
  format: 'compact'
});
assert.equal(handoffResumeStatus.isError, false);
assert.match(handoffResumeStatus.content[0].text, /^status_only: yes$/m);
assert.match(handoffResumeStatus.content[0].text, /^secret_values_read: no$/m);
assert.match(handoffResumeStatus.content[0].text, /^opens_browser_now: no$/m);
assert.match(handoffResumeStatus.content[0].text, /^starts_capture_now: no$/m);
if (handoffResumeStatus.structuredContent.recommendedCommand?.id === 'monitor-auth') {
  assert.match(handoffResumeStatus.content[0].text, /^command: .*'--timeout-ms' '10000' '--interval-ms' '1000'/m);
}
assert.doesNotMatch(handoffResumeStatus.content[0].text, /^\{/);
assert.equal(handoffResumeStatus.structuredContent.secretValuesRead, false);

const handoffResumeWatch = await callTool(212, 'sba_target_handoff_resume_watch', {
  targetDir: 'runs/target-packs/example-public',
  handoff: 'operator-handoff.json',
  monitorTimeoutMs: 10000,
  monitorIntervalMs: 1000,
  format: 'compact'
});
assert.equal(handoffResumeWatch.isError, false);
assert.match(handoffResumeWatch.content[0].text, /^status: planned$/m);
assert.match(handoffResumeWatch.content[0].text, /^run: no$/m);
assert.match(handoffResumeWatch.content[0].text, /^secret_values_read: no$/m);
assert.match(handoffResumeWatch.content[0].text, /^starts_capture_now: no$/m);
assert.match(handoffResumeWatch.content[0].text, /^operator_ok_required: no$/m);
assert.match(handoffResumeWatch.content[0].text, /^operator_ok_accepted: no$/m);
if (handoffResumeWatch.structuredContent.selectedCommand?.id === 'monitor-auth') {
  assert.match(handoffResumeWatch.content[0].text, /^command: .*'--timeout-ms' '10000' '--interval-ms' '1000'/m);
}
assert.doesNotMatch(handoffResumeWatch.content[0].text, /^\{/);
assert.equal(handoffResumeWatch.structuredContent.secretValuesRead, false);

const targetApprovalPack = await callTool(213, 'sba_target_approval_pack', {
  candidate: 'github',
  format: 'compact'
});
assert.equal(targetApprovalPack.isError, false);
assert.match(targetApprovalPack.content[0].text, /^safe_mode: yes$/m);
assert.match(targetApprovalPack.content[0].text, /^operator_approval_required: yes$/m);
assert.match(targetApprovalPack.content[0].text, /^operator_approval_summary_requires_operator_ok: yes$/m);
assert.match(targetApprovalPack.content[0].text, /^operator_approval_summary_operator_ok_accepted: no$/m);
assert.match(targetApprovalPack.content[0].text, /^operator_approval_summary_may_open_browser: yes$/m);
assert.match(targetApprovalPack.content[0].text, /^operator_approval_summary_may_start_capture: yes$/m);
assert.match(targetApprovalPack.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(targetApprovalPack.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(targetApprovalPack.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
assert.match(targetApprovalPack.content[0].text, /^selected_candidate: github$/m);
assert.match(targetApprovalPack.content[0].text, /^opens_browser_now: no$/m);
assert.match(targetApprovalPack.content[0].text, /^starts_capture_now: no$/m);
assert.match(targetApprovalPack.content[0].text, /^login_capture_command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
assert.doesNotMatch(targetApprovalPack.content[0].text, /^\{/);
assert.equal(targetApprovalPack.structuredContent.secretValuesRead, false);
assert.equal(targetApprovalPack.structuredContent.opensBrowserNow, false);
assert.equal(targetApprovalPack.structuredContent.startsCaptureNow, false);

const targetApprovalStatus = await callTool(214, 'sba_target_approval_status', {
  candidate: 'github',
  format: 'compact'
});
assert.equal(targetApprovalStatus.isError, false);
assert.match(targetApprovalStatus.content[0].text, /^safe_mode: yes$/m);
assert.match(targetApprovalStatus.content[0].text, /^selected_candidate: github$/m);
assert.match(targetApprovalStatus.content[0].text, /^opens_browser_now: no$/m);
assert.match(targetApprovalStatus.content[0].text, /^starts_capture_now: no$/m);
assert.match(targetApprovalStatus.content[0].text, /^target_next: /m);
assert.match(targetApprovalStatus.content[0].text, /^agent_safe_command_id: /m);
assert.match(targetApprovalStatus.content[0].text, /^agent_may_run_unattended: /m);
assert.match(targetApprovalStatus.content[0].text, /^operator_command_id: /m);
assert.match(targetApprovalStatus.content[0].text, /^operator_approval_required: /m);
assert.match(targetApprovalStatus.content[0].text, /^operator_approval_summary_requires_operator_ok: /m);
assert.match(targetApprovalStatus.content[0].text, /^operator_approval_summary_operator_ok_accepted: /m);
assert.match(targetApprovalStatus.content[0].text, /^operator_approval_summary_may_open_browser: /m);
assert.match(targetApprovalStatus.content[0].text, /^operator_approval_summary_may_start_capture: /m);
assert.match(targetApprovalStatus.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(targetApprovalStatus.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(targetApprovalStatus.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: /m);
assert.match(targetApprovalStatus.content[0].text, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
assert.match(targetApprovalStatus.content[0].text, /^approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
assert.match(targetApprovalStatus.content[0].text, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
assert.match(targetApprovalStatus.content[0].text, /^wait_auth_proof_capture_command: 'node' 'src\/cli\.mjs' 'target-proof-capture'.*'--wait-auth'/m);
assert.match(targetApprovalStatus.content[0].text, /^wait_auth_proof_capture_command: .*'--completion-audit' '--format' 'compact'$/m);
assert.match(targetApprovalStatus.content[0].text, /^approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--real-external'/m);
assert.match(targetApprovalStatus.content[0].text, /^approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
assert.doesNotMatch(targetApprovalStatus.content[0].text, /^\{/);
assert.equal(targetApprovalStatus.structuredContent.secretValuesRead, false);
assert.equal(targetApprovalStatus.structuredContent.opensBrowserNow, false);
assert.equal(targetApprovalStatus.structuredContent.startsCaptureNow, false);
assert.equal(typeof targetApprovalStatus.structuredContent.agentSafeCommandId, 'string');
assert.equal(typeof targetApprovalStatus.structuredContent.agentMayRunUnattended, 'boolean');
assert.equal(typeof targetApprovalStatus.structuredContent.operatorCommandId, 'string');
assert.equal(typeof targetApprovalStatus.structuredContent.operatorApprovalRequired, 'boolean');
assert.equal(targetApprovalStatus.structuredContent.commands.agentPreflight.args.includes('agent-preflight'), true);
assert.equal(targetApprovalStatus.structuredContent.commands.approvalPreflight.args.includes('--real-external'), true);
assert.equal(targetApprovalStatus.structuredContent.commands.waitAuthProofCapture.args.includes('--wait-auth'), true);
assert.equal(targetApprovalStatus.structuredContent.commands.approvalResumeRun.args.includes('--operator-ok'), true);

const targetApprovalPreflight = await callTool(216, 'sba_target_approval_preflight', {
  candidate: 'github',
  format: 'compact'
});
assert.equal(targetApprovalPreflight.isError, false);
assert.match(targetApprovalPreflight.content[0].text, /^safe_mode: yes$/m);
assert.match(targetApprovalPreflight.content[0].text, /^real_external_required: yes$/m);
assert.match(targetApprovalPreflight.content[0].text, /^real_external_inventory: yes$/m);
assert.match(targetApprovalPreflight.content[0].text, /^agent_safe_command_id: /m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_approval_required: /m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_approval_summary_requires_operator_ok: /m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_approval_summary_operator_ok_accepted: /m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_approval_summary_may_open_browser: /m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_approval_summary_may_start_capture: /m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: /m);
assert.match(targetApprovalPreflight.content[0].text, /^operator_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--real-external'.*'--operator-ok' 'OK'/m);
assert.match(targetApprovalPreflight.content[0].text, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--real-external'/m);
assert.match(targetApprovalPreflight.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
assert.doesNotMatch(targetApprovalPreflight.content[0].text, /^\{/);
assert.equal(targetApprovalPreflight.structuredContent.secretValuesRead, false);
assert.equal(targetApprovalPreflight.structuredContent.opensBrowserNow, false);

const targetApprovalResume = await callTool(215, 'sba_target_approval_resume', {
  candidate: 'github',
  realExternal: true,
  format: 'compact'
});
assert.equal(targetApprovalResume.isError, false);
assert.match(targetApprovalResume.content[0].text, /^safe_mode: yes$/m);
assert.match(targetApprovalResume.content[0].text, /^run_requested: no$/m);
assert.match(targetApprovalResume.content[0].text, /^operator_ok_required: yes$/m);
assert.match(targetApprovalResume.content[0].text, /^operator_approval_summary_requires_operator_ok: yes$/m);
assert.match(targetApprovalResume.content[0].text, /^operator_approval_summary_operator_ok_accepted: no$/m);
assert.match(targetApprovalResume.content[0].text, /^operator_approval_summary_may_open_browser: /m);
assert.match(targetApprovalResume.content[0].text, /^operator_approval_summary_may_start_capture: /m);
assert.match(targetApprovalResume.content[0].text, /^operator_approval_summary_reads_browser_storage: no$/m);
assert.match(targetApprovalResume.content[0].text, /^operator_approval_summary_returns_page_content: no$/m);
assert.match(targetApprovalResume.content[0].text, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
assert.match(targetApprovalResume.content[0].text, /^opens_browser_now: no$/m);
assert.match(targetApprovalResume.content[0].text, /^starts_capture_now: no$/m);
assert.match(targetApprovalResume.content[0].text, /^target_next: /m);
assert.match(targetApprovalResume.content[0].text, /^agent_safe_next_command_id: target-approval-preflight$/m);
assert.match(targetApprovalResume.content[0].text, /^agent_safe_next_may_run_unattended: yes$/m);
assert.match(targetApprovalResume.content[0].text, /^agent_safe_next_opens_browser: no$/m);
assert.match(targetApprovalResume.content[0].text, /^agent_safe_next_starts_capture: no$/m);
assert.match(targetApprovalResume.content[0].text, /^agent_safe_next_reads_browser_storage: no$/m);
assert.match(targetApprovalResume.content[0].text, /^agent_safe_next_returns_page_content: no$/m);
assert.match(targetApprovalResume.content[0].text, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
assert.match(targetApprovalResume.content[0].text, /^preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
assert.match(targetApprovalResume.content[0].text, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--real-external'/m);
assert.match(targetApprovalResume.content[0].text, /^run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
assert.doesNotMatch(targetApprovalResume.content[0].text, /^\{/);
assert.equal(targetApprovalResume.structuredContent.secretValuesRead, false);
assert.equal(targetApprovalResume.structuredContent.opensBrowserNow, false);
assert.equal(targetApprovalResume.structuredContent.startsCaptureNow, false);
assert.equal(targetApprovalResume.structuredContent.agentSafeNextCommandId, 'target-approval-preflight');
assert.equal(targetApprovalResume.structuredContent.agentSafeNextMayRunUnattended, true);
assert.equal(targetApprovalResume.structuredContent.agentSafeNextOpensBrowser, false);
assert.equal(targetApprovalResume.structuredContent.agentSafeNextStartsCapture, false);
assert.equal(targetApprovalResume.structuredContent.agentSafeNextCommand.args.includes('target-approval-preflight'), true);
assert.equal(targetApprovalResume.structuredContent.preflightCommand.args.includes('target-approval-preflight'), true);
assert.equal(targetApprovalResume.structuredContent.proofPlanCommand.args.includes('target-proof-plan'), true);

const candidates = resumePlan.structuredContent.action?.manualCommandCandidates || [];
if (candidates.some((candidate) => candidate.id === 'login-capture-wait')) {
  const boundedResume = await callTool(22, 'sba_objective_resume', {
    manualCandidate: 'login-capture-wait',
    waitAuthTimeoutMs: 10000,
    waitAuthIntervalMs: 1000,
    format: 'compact'
  });
  assert.equal(boundedResume.isError, false);
  assert.equal(boundedResume.structuredContent.selectedManualCandidate?.id, 'login-capture-wait');
  assert.match(boundedResume.content[0].text, /^manual_candidate: login-capture-wait$/m);
  assert.match(boundedResume.content[0].text, /--wait-auth-timeout-ms' '10000'/);
  assert.match(boundedResume.content[0].text, /--wait-auth-interval-ms' '1000'/);
  assert.match(boundedResume.content[0].text, /operator-handoff-probe\.json/);
  assert.match(boundedResume.content[0].text, /wait-auth-status-probe\.json/);
}

finishSmoke();
