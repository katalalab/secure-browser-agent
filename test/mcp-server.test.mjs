import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcpMessage, listMcpTools, MCP_PROTOCOL_VERSION } from '../src/mcp-server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scaffoldTargetPack } from '../src/target-pack.mjs';

test('mcp server initializes with tool capability', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'test', version: '0' }
    }
  });
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
});

test('mcp server lists stable browser tools', async () => {
  const direct = listMcpTools();
  assert.ok(direct.some((tool) => tool.name === 'sba_control_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_next'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_preflight'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_proof_checklist'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_proof_checklist_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_proof_closeout'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_workflow'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_control_plane'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_control_plane_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_control_plane_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_task'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_task_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_task_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_task_loop'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_task_watch_start'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_task_watch_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_loop_step'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_loop_step_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_proof_step'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_proof_step_start'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_proof_step_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_control_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_mcp_observation'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_mcp_observation_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_mcp_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_mcp_handoff'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_mcp_timeout_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_mcp_timeout_plan_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_mcp_autostart_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_mcp_autostart_plan_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_regular_chrome_use'));
  assert.ok(direct.some((tool) => tool.name === 'sba_regular_chrome_refresh'));
  assert.ok(direct.some((tool) => tool.name === 'sba_regular_chrome_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_regular_chrome_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_apple_events_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_apple_events_enable_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_apple_events_outline'));
  assert.ok(direct.some((tool) => tool.name === 'sba_browser_route'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_extension_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_extension_handoff'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_extension_resume'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_extension_troubleshoot'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_extension_backend_check_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_chrome_extension_claim_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_run'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_run_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_operate_add'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_scrape'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_daemon'));
  assert.ok(direct.some((tool) => tool.name === 'sba_runtime_audit'));
  assert.ok(direct.some((tool) => tool.name === 'sba_run_gate_audit'));
  assert.ok(direct.some((tool) => tool.name === 'sba_compact_command_audit'));
  assert.deepEqual(
    direct.find((tool) => tool.name === 'sba_compact_command_audit').inputSchema.properties.source.enum,
    ['operator-pack', 'control-status', 'objective-completion-audit', 'objective-safe-command', 'run-gate-audit', 'agent-control-plane', 'completion-proof-bundle', 'agent-proof-checklist', 'agent-proof-closeout', 'operator-runbook', 'agent-workflow', 'agent-backend-select', 'agent-task', 'chrome-mcp-autostart-plan', 'all']
  );
  assert.ok(direct.some((tool) => tool.name === 'sba_completion_proof_bundle'));
  assert.ok(direct.some((tool) => tool.name === 'sba_completion_proof_bundle_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_completion_proof_bundle_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_source_audit'));
  assert.ok(direct.some((tool) => tool.name === 'sba_readiness_audit'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_completion_audit'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_completion_audit_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_completion_audit_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_safe_command'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_proof_pipeline'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_handoff'));
  assert.ok(direct.some((tool) => tool.name === 'sba_operator_pack'));
  assert.ok(direct.some((tool) => tool.name === 'sba_operator_pack_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_operator_runbook'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_next'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_proof_gate_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_proof_gate_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_background_monitor_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_background_proof_capture_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_background_proof_capture_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_background_proof_capture_start'));
  assert.ok(direct.some((tool) => tool.name === 'sba_objective_resume'));
  assert.ok(direct.some((tool) => tool.name === 'sba_providers'));
  assert.ok(direct.some((tool) => tool.name === 'sba_backend_matrix'));
  assert.ok(direct.some((tool) => tool.name === 'sba_backend_matrix_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_provider_benchmark'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_benchmark'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_bootstrap_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_candidate_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_candidate_plan_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_candidate_plan_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_approval_pack'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_approval_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_approval_preflight'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_approval_resume'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_proof_inventory'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_proof_next'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_proof_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_auth_check'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_auth_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_proof_capture'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_login_capture'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_handoff_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_handoff_run'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_handoff_resume'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_handoff_resume_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_handoff_resume_watch'));
  assert.ok(direct.some((tool) => tool.name === 'sba_target_proof'));
  assert.ok(direct.some((tool) => tool.name === 'sba_runtime_cleanup_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_agent_browser_doctor'));
  assert.ok(direct.some((tool) => tool.name === 'sba_lightpanda_doctor'));
  assert.ok(direct.some((tool) => tool.name === 'sba_provider_doctor_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_lightpanda_decision'));
  assert.ok(direct.some((tool) => tool.name === 'sba_playwright_doctor'));
  assert.ok(direct.some((tool) => tool.name === 'sba_selenium_doctor'));
  assert.ok(direct.some((tool) => tool.name === 'sba_secret_audit'));
  assert.ok(direct.some((tool) => tool.name === 'sba_secret_setup_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_secret_run_plan'));
  assert.ok(direct.some((tool) => tool.name === 'sba_secret_run_select'));
  assert.ok(direct.some((tool) => tool.name === 'sba_secret_env_handoff'));
  assert.ok(direct.some((tool) => tool.name === 'sba_secret_env_handoff_status'));
  assert.ok(direct.some((tool) => tool.name === 'sba_secret_env_handoff_watch'));
  const runtimeAuditTool = direct.find((tool) => tool.name === 'sba_runtime_audit');
  const controlStatusTool = direct.find((tool) => tool.name === 'sba_control_status');
  const agentNextTool = direct.find((tool) => tool.name === 'sba_agent_next');
  const agentPreflightTool = direct.find((tool) => tool.name === 'sba_agent_preflight');
  const agentProofChecklistTool = direct.find((tool) => tool.name === 'sba_agent_proof_checklist');
  const agentProofChecklistStatusTool = direct.find((tool) => tool.name === 'sba_agent_proof_checklist_status');
  const agentProofCloseoutTool = direct.find((tool) => tool.name === 'sba_agent_proof_closeout');
  const agentProofCloseoutStatusTool = direct.find((tool) => tool.name === 'sba_agent_proof_closeout_status');
  const agentWorkflowTool = direct.find((tool) => tool.name === 'sba_agent_workflow');
  const agentBackendSelectTool = direct.find((tool) => tool.name === 'sba_agent_backend_select');
  const agentControlPlaneTool = direct.find((tool) => tool.name === 'sba_agent_control_plane');
  const agentControlPlaneStatusTool = direct.find((tool) => tool.name === 'sba_agent_control_plane_status');
  const agentControlPlaneWatchTool = direct.find((tool) => tool.name === 'sba_agent_control_plane_watch');
  const agentTaskTool = direct.find((tool) => tool.name === 'sba_agent_task');
  const agentTaskStatusTool = direct.find((tool) => tool.name === 'sba_agent_task_status');
  const agentTaskWatchTool = direct.find((tool) => tool.name === 'sba_agent_task_watch');
  const agentTaskLoopTool = direct.find((tool) => tool.name === 'sba_agent_task_loop');
  const agentTaskWatchStartTool = direct.find((tool) => tool.name === 'sba_agent_task_watch_start');
  const agentTaskWatchStatusTool = direct.find((tool) => tool.name === 'sba_agent_task_watch_status');
  const agentLoopStepTool = direct.find((tool) => tool.name === 'sba_agent_loop_step');
  const agentLoopStepStatusTool = direct.find((tool) => tool.name === 'sba_agent_loop_step_status');
  const agentProofStepTool = direct.find((tool) => tool.name === 'sba_agent_proof_step');
  const agentProofStepStartTool = direct.find((tool) => tool.name === 'sba_agent_proof_step_start');
  const agentProofStepStatusTool = direct.find((tool) => tool.name === 'sba_agent_proof_step_status');
  const chromeControlPlanTool = direct.find((tool) => tool.name === 'sba_chrome_control_plan');
  const chromeMcpObservationTool = direct.find((tool) => tool.name === 'sba_chrome_mcp_observation');
  const chromeMcpObservationStatusTool = direct.find((tool) => tool.name === 'sba_chrome_mcp_observation_status');
  const chromeMcpStatusTool = direct.find((tool) => tool.name === 'sba_chrome_mcp_status');
  const chromeMcpHandoffTool = direct.find((tool) => tool.name === 'sba_chrome_mcp_handoff');
  const chromeMcpTimeoutPlanTool = direct.find((tool) => tool.name === 'sba_chrome_mcp_timeout_plan');
  const chromeMcpTimeoutPlanStatusTool = direct.find((tool) => tool.name === 'sba_chrome_mcp_timeout_plan_status');
  const chromeMcpAutostartPlanTool = direct.find((tool) => tool.name === 'sba_chrome_mcp_autostart_plan');
  const chromeMcpAutostartPlanStatusTool = direct.find((tool) => tool.name === 'sba_chrome_mcp_autostart_plan_status');
  const regularChromeUseTool = direct.find((tool) => tool.name === 'sba_regular_chrome_use');
  const regularChromeRefreshTool = direct.find((tool) => tool.name === 'sba_regular_chrome_refresh');
  const regularChromeStatusTool = direct.find((tool) => tool.name === 'sba_regular_chrome_status');
  const regularChromeWatchTool = direct.find((tool) => tool.name === 'sba_regular_chrome_watch');
  const chromeAppleEventsStatusTool = direct.find((tool) => tool.name === 'sba_chrome_apple_events_status');
  const chromeAppleEventsEnablePlanTool = direct.find((tool) => tool.name === 'sba_chrome_apple_events_enable_plan');
  const chromeAppleEventsOutlineTool = direct.find((tool) => tool.name === 'sba_chrome_apple_events_outline');
  const browserRouteTool = direct.find((tool) => tool.name === 'sba_browser_route');
  const chromeExtensionStatusTool = direct.find((tool) => tool.name === 'sba_chrome_extension_status');
  const chromeExtensionHandoffTool = direct.find((tool) => tool.name === 'sba_chrome_extension_handoff');
  const chromeExtensionResumeTool = direct.find((tool) => tool.name === 'sba_chrome_extension_resume');
  const chromeExtensionTroubleshootTool = direct.find((tool) => tool.name === 'sba_chrome_extension_troubleshoot');
  const chromeExtensionBackendCheckPlanTool = direct.find((tool) => tool.name === 'sba_chrome_extension_backend_check_plan');
  const chromeExtensionClaimPlanTool = direct.find((tool) => tool.name === 'sba_chrome_extension_claim_plan');
  const runGateAuditTool = direct.find((tool) => tool.name === 'sba_run_gate_audit');
  const objectiveProofPipelineTool = direct.find((tool) => tool.name === 'sba_objective_proof_pipeline');
  assert.deepEqual(controlStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(controlStatusTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(controlStatusTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.match(controlStatusTool.description, /control plane/);
  assert.deepEqual(agentNextTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentNextTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(agentNextTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.match(agentNextTool.description, /agent_run_command only when/);
  assert.deepEqual(agentPreflightTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentPreflightTool.inputSchema.properties.candidate.enum, ['github', 'google-drive', 'notion']);
  assert.match(agentPreflightTool.description, /real-external proof preflight/);
  assert.deepEqual(agentProofChecklistTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentProofChecklistTool.inputSchema.properties.candidate.enum, ['github', 'google-drive', 'notion']);
  assert.equal(agentProofChecklistTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(agentProofChecklistTool.inputSchema.properties.out.type, 'string');
  assert.match(agentProofChecklistTool.description, /operator checklist/);
  assert.deepEqual(agentProofChecklistStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentProofChecklistStatusTool.inputSchema.properties.candidate.enum, ['github', 'google-drive', 'notion']);
  assert.equal(agentProofChecklistStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentProofChecklistStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(agentProofCloseoutTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentProofCloseoutTool.inputSchema.properties.candidate.enum, ['github', 'google-drive', 'notion']);
  assert.equal(agentProofCloseoutTool.inputSchema.properties.includeCompactCommandAudit.type, 'boolean');
  assert.equal(agentProofCloseoutTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(agentProofCloseoutTool.inputSchema.properties.out.type, 'string');
  assert.equal(agentProofCloseoutTool.inputSchema.properties.checklistIn.type, 'string');
  assert.deepEqual(agentProofCloseoutStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentProofCloseoutStatusTool.inputSchema.properties.candidate.enum, ['github', 'google-drive', 'notion']);
  assert.equal(agentProofCloseoutStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentProofCloseoutStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.equal(agentTaskTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(agentTaskTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(agentTaskTool.inputSchema.properties.out.type, 'string');
  assert.equal(agentTaskTool.inputSchema.properties.searchProviders.type, 'string');
  assert.deepEqual(agentTaskTool.inputSchema.properties.intent.enum, ['inspect', 'operate', 'screenshot', 'console', 'network']);
  assert.equal(agentTaskTool.inputSchema.properties.matchOrigin.type, 'string');
  assert.equal(agentTaskTool.inputSchema.properties.matchPath.type, 'string');
  assert.equal(agentTaskTool.inputSchema.properties.tabIndex.type, 'number');
  assert.deepEqual(agentTaskTool.inputSchema.properties.chromeMcpConnected.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(agentTaskTool.inputSchema.properties.chromeMcpPageListOk.enum, ['yes', 'no', 'unknown']);
  assert.equal(agentTaskTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(agentTaskTool.inputSchema.properties.chromeExtensionPrepared.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(agentTaskTool.inputSchema.properties.chromeExtensionBackendAvailable.enum, ['yes', 'no', 'unknown']);
  assert.equal(agentTaskTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.deepEqual(agentTaskTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentTaskStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentTaskStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.equal(agentTaskStatusTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.deepEqual(agentTaskStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentTaskWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(agentTaskWatchTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentTaskWatchTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.equal(agentTaskWatchTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.deepEqual(agentTaskWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentTaskLoopTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(agentTaskLoopTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentTaskLoopTool.inputSchema.properties.iterations.type, 'number');
  assert.equal(agentTaskLoopTool.inputSchema.properties.intervalMs.type, 'number');
  assert.equal(agentTaskLoopTool.inputSchema.properties.statusOut.type, 'string');
  assert.deepEqual(agentTaskLoopTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentTaskWatchStartTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(agentTaskWatchStartTool.inputSchema.properties.operatorOk.type, 'string');
  assert.equal(agentTaskWatchStartTool.inputSchema.properties.force.type, 'boolean');
  assert.equal(agentTaskWatchStartTool.inputSchema.properties.logPath.type, 'string');
  assert.equal(agentTaskWatchStartTool.inputSchema.properties.pidPath.type, 'string');
  assert.deepEqual(agentTaskWatchStartTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentTaskWatchStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentTaskWatchStatusTool.inputSchema.properties.logPath.type, 'string');
  assert.equal(agentTaskWatchStatusTool.inputSchema.properties.pidPath.type, 'string');
  assert.equal(chromeMcpObservationTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(chromeMcpObservationTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(chromeMcpObservationTool.inputSchema.properties.intent.enum, ['inspect', 'operate', 'screenshot', 'console', 'network']);
  assert.equal(chromeMcpObservationStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(chromeMcpObservationStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.equal(regularChromeUseTool.inputSchema.properties.mcpObservationIn.type, 'string');
  assert.equal(regularChromeStatusTool.inputSchema.properties.mcpObservationIn.type, 'string');
  assert.equal(regularChromeWatchTool.inputSchema.properties.mcpObservationIn.type, 'string');
  assert.equal(agentTaskWatchStatusTool.inputSchema.properties.maxLogLines.type, 'number');
  assert.deepEqual(agentTaskWatchStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentWorkflowTool.inputSchema.properties.intent.enum, ['inspect', 'operate', 'screenshot', 'console', 'network']);
  assert.equal(agentWorkflowTool.inputSchema.properties.matchOrigin.type, 'string');
  assert.equal(agentWorkflowTool.inputSchema.properties.matchPath.type, 'string');
  assert.equal(agentWorkflowTool.inputSchema.properties.tabIndex.type, 'number');
  assert.deepEqual(agentWorkflowTool.inputSchema.properties.chromeMcpConnected.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(agentWorkflowTool.inputSchema.properties.chromeMcpPageListOk.enum, ['yes', 'no', 'unknown']);
  assert.equal(agentWorkflowTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(agentWorkflowTool.inputSchema.properties.chromeExtensionPrepared.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(agentWorkflowTool.inputSchema.properties.chromeExtensionBackendAvailable.enum, ['yes', 'no', 'unknown']);
  assert.equal(agentLoopStepTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(agentLoopStepTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(agentLoopStepTool.inputSchema.properties.out.type, 'string');
  assert.equal(agentLoopStepTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.deepEqual(agentLoopStepTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentLoopStepStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentLoopStepStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(agentLoopStepStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentProofStepTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(agentProofStepTool.inputSchema.properties.operatorOk.type, 'string');
  assert.equal(agentProofStepTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(agentProofStepTool.inputSchema.properties.out.type, 'string');
  assert.equal(agentProofStepTool.inputSchema.properties.targetDir.type, 'string');
  assert.equal(agentProofStepTool.inputSchema.properties.handoff.type, 'string');
  assert.equal(agentProofStepTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.equal(agentProofStepTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(agentProofStepTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(agentProofStepTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentProofStepStartTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(agentProofStepStartTool.inputSchema.properties.operatorOk.type, 'string');
  assert.equal(agentProofStepStartTool.inputSchema.properties.force.type, 'boolean');
  assert.equal(agentProofStepStartTool.inputSchema.properties.out.type, 'string');
  assert.equal(agentProofStepStartTool.inputSchema.properties.logPath.type, 'string');
  assert.equal(agentProofStepStartTool.inputSchema.properties.pidPath.type, 'string');
  assert.equal(agentProofStepStartTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.deepEqual(agentProofStepStartTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentProofStepStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentProofStepStatusTool.inputSchema.properties.logPath.type, 'string');
  assert.equal(agentProofStepStatusTool.inputSchema.properties.pidPath.type, 'string');
  assert.equal(agentProofStepStatusTool.inputSchema.properties.maxLogLines.type, 'number');
  assert.deepEqual(agentProofStepStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(chromeControlPlanTool.inputSchema.properties.lane.enum, ['auto', 'target-pack', 'regular-chrome', 'codex-browser-agent']);
  assert.equal(chromeControlPlanTool.inputSchema.properties.mcpObservationIn.type, 'string');
  assert.deepEqual(chromeControlPlanTool.inputSchema.properties.allowNewBackgroundTab.enum, ['yes', 'no', 'unknown']);
  assert.equal(chromeControlPlanTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(chromeControlPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(chromeMcpObservationTool.inputSchema.properties.statusText.type, 'string');
  assert.equal(chromeMcpObservationTool.inputSchema.properties.listPagesText.type, 'string');
  assert.deepEqual(chromeMcpObservationTool.inputSchema.properties.observedConnected.enum, ['yes', 'no', 'unknown']);
  assert.equal(chromeMcpObservationTool.inputSchema.properties.observedTools.type, 'number');
  assert.deepEqual(chromeMcpObservationTool.inputSchema.properties.observedPageListOk.enum, ['yes', 'no', 'unknown']);
  assert.equal(chromeMcpObservationTool.inputSchema.properties.observedPageCount.type, 'number');
  assert.deepEqual(chromeMcpObservationTool.inputSchema.properties.observedListPagesTimedOut.enum, ['yes', 'no', 'unknown']);
  assert.equal(chromeMcpObservationTool.inputSchema.properties.observedLastError.type, 'string');
  assert.deepEqual(chromeMcpObservationTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(chromeMcpStatusTool.inputSchema.properties.observedConnected.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(chromeMcpStatusTool.inputSchema.properties.observedPageListOk.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(chromeMcpStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(chromeMcpHandoffTool.inputSchema.properties.chromeMcpConnected.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(chromeMcpHandoffTool.inputSchema.properties.chromeMcpPageListOk.enum, ['yes', 'no', 'unknown']);
  assert.equal(chromeMcpHandoffTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(chromeMcpHandoffTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(chromeMcpTimeoutPlanTool.inputSchema.properties.observedConnected.enum, ['yes', 'no', 'unknown']);
  assert.equal(chromeMcpTimeoutPlanTool.inputSchema.properties.observedTools.type, 'number');
  assert.equal(chromeMcpTimeoutPlanTool.inputSchema.properties.observedLastError.type, 'string');
  assert.equal(chromeMcpTimeoutPlanTool.inputSchema.properties.ownerLimit.type, 'number');
  assert.equal(chromeMcpTimeoutPlanTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(chromeMcpTimeoutPlanTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(chromeMcpTimeoutPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(chromeMcpTimeoutPlanStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(chromeMcpTimeoutPlanStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(chromeMcpTimeoutPlanStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(chromeMcpAutostartPlanTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(chromeMcpAutostartPlanTool.inputSchema.properties.out.type, 'string');
  assert.equal(chromeMcpAutostartPlanTool.inputSchema.properties.browserUrl.type, 'string');
  assert.deepEqual(chromeMcpAutostartPlanTool.inputSchema.properties.headless.enum, ['yes', 'no']);
  assert.equal(chromeMcpAutostartPlanTool.inputSchema.properties.packageSpec.type, 'string');
  assert.deepEqual(chromeMcpAutostartPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(chromeMcpAutostartPlanStatusTool.inputSchema.properties.in.type, 'string');
  assert.deepEqual(chromeMcpAutostartPlanStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(regularChromeUseTool.inputSchema.properties.intent.enum, ['inspect', 'operate', 'screenshot', 'console', 'network']);
  assert.equal(regularChromeUseTool.inputSchema.properties.statusText.type, 'string');
  assert.equal(regularChromeUseTool.inputSchema.properties.listPagesText.type, 'string');
  assert.deepEqual(regularChromeUseTool.inputSchema.properties.chromeMcpConnected.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(regularChromeUseTool.inputSchema.properties.chromeMcpPageListOk.enum, ['yes', 'no', 'unknown']);
  assert.equal(regularChromeUseTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(regularChromeUseTool.inputSchema.properties.chromeExtensionPrepared.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(regularChromeUseTool.inputSchema.properties.chromeExtensionBackendAvailable.enum, ['yes', 'no', 'unknown']);
  assert.equal(regularChromeUseTool.inputSchema.properties.pluginDir.type, 'string');
  assert.deepEqual(regularChromeUseTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(regularChromeRefreshTool.inputSchema.properties.intent.enum, ['inspect', 'operate', 'screenshot', 'console', 'network']);
  assert.equal(regularChromeRefreshTool.inputSchema.properties.appleEventsOut.type, 'string');
  assert.equal(regularChromeRefreshTool.inputSchema.properties.out.type, 'string');
  assert.equal(regularChromeRefreshTool.inputSchema.properties.statusText.type, 'string');
  assert.deepEqual(regularChromeRefreshTool.inputSchema.properties.allowNewBackgroundTab.enum, ['yes', 'no', 'unknown']);
  assert.equal(regularChromeRefreshTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(regularChromeRefreshTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(regularChromeStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(regularChromeStatusTool.inputSchema.properties.appleEventsIn.type, 'string');
  assert.deepEqual(regularChromeStatusTool.inputSchema.properties.allowNewBackgroundTab.enum, ['yes', 'no', 'unknown']);
  assert.equal(regularChromeStatusTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.equal(regularChromeStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(regularChromeStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(regularChromeWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(regularChromeWatchTool.inputSchema.properties.force.type, 'boolean');
  assert.deepEqual(regularChromeWatchTool.inputSchema.properties.intent.enum, ['inspect', 'operate', 'screenshot', 'console', 'network']);
  assert.deepEqual(regularChromeWatchTool.inputSchema.properties.allowNewBackgroundTab.enum, ['yes', 'no', 'unknown']);
  assert.equal(regularChromeWatchTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(regularChromeWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(chromeAppleEventsStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.match(chromeAppleEventsStatusTool.description, /Apple Events/);
  assert.deepEqual(chromeAppleEventsEnablePlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.match(chromeAppleEventsEnablePlanTool.description, /Does not change Chrome settings/);
  assert.equal(chromeAppleEventsOutlineTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(chromeAppleEventsOutlineTool.inputSchema.properties.operatorOk.type, 'string');
  assert.deepEqual(chromeAppleEventsOutlineTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(browserRouteTool.inputSchema.properties.task.enum, ['auto', 'search', 'analyze', 'scrape', 'operate', 'existing-tab', 'authenticated-scrape', 'public-crawl', 'compatibility-test']);
  assert.deepEqual(browserRouteTool.inputSchema.properties.lane.enum, ['auto', 'target-pack', 'regular-chrome', 'codex-browser-agent']);
  assert.deepEqual(browserRouteTool.inputSchema.properties.chromeMcpConnected.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(browserRouteTool.inputSchema.properties.chromeMcpPageListOk.enum, ['yes', 'no', 'unknown']);
  assert.equal(browserRouteTool.inputSchema.properties.chromeMcpTools.type, 'number');
  assert.deepEqual(browserRouteTool.inputSchema.properties.allowNewBackgroundTab.enum, ['yes', 'no', 'unknown']);
  assert.equal(browserRouteTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(browserRouteTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(objectiveProofPipelineTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const readinessAuditTool = direct.find((tool) => tool.name === 'sba_readiness_audit');
  assert.deepEqual(readinessAuditTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const completionProofBundleTool = direct.find((tool) => tool.name === 'sba_completion_proof_bundle');
  assert.deepEqual(completionProofBundleTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(completionProofBundleTool.inputSchema.properties.candidate.enum, ['github', 'google-drive', 'notion']);
  assert.equal(completionProofBundleTool.inputSchema.properties.includeCompactCommandAudit.type, 'boolean');
  assert.equal(completionProofBundleTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(completionProofBundleTool.inputSchema.properties.out.type, 'string');
  const completionProofBundleStatusTool = direct.find((tool) => tool.name === 'sba_completion_proof_bundle_status');
  assert.deepEqual(completionProofBundleStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(completionProofBundleStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(completionProofBundleStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  const completionProofBundleWatchTool = direct.find((tool) => tool.name === 'sba_completion_proof_bundle_watch');
  assert.deepEqual(completionProofBundleWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(completionProofBundleWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(completionProofBundleWatchTool.inputSchema.properties.in.type, 'string');
  assert.equal(completionProofBundleWatchTool.inputSchema.properties.out.type, 'string');
  assert.equal(completionProofBundleWatchTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(chromeExtensionStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(chromeExtensionStatusTool.inputSchema.properties.pluginDir.type, 'string');
  assert.deepEqual(chromeExtensionHandoffTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(chromeExtensionHandoffTool.inputSchema.properties.pluginDir.type, 'string');
  assert.equal(chromeExtensionHandoffTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(chromeExtensionHandoffTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(chromeExtensionResumeTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(chromeExtensionResumeTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(chromeExtensionResumeTool.inputSchema.properties.operatorOk.type, 'string');
  assert.equal(chromeExtensionResumeTool.inputSchema.properties.dryRun.type, 'boolean');
  assert.deepEqual(chromeExtensionTroubleshootTool.inputSchema.properties.backendAvailable.enum, ['yes', 'no', 'unknown']);
  assert.equal(chromeExtensionTroubleshootTool.inputSchema.properties.backendLastError.type, 'string');
  assert.deepEqual(chromeExtensionTroubleshootTool.inputSchema.properties.profileWindowRetryAttempted.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(chromeExtensionTroubleshootTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(chromeExtensionBackendCheckPlanTool.inputSchema.properties.backendAvailable.enum, ['yes', 'no', 'unknown']);
  assert.equal(chromeExtensionBackendCheckPlanTool.inputSchema.properties.pluginDir.type, 'string');
  assert.deepEqual(chromeExtensionBackendCheckPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(chromeExtensionClaimPlanTool.inputSchema.properties.backendReady.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(chromeExtensionClaimPlanTool.inputSchema.properties.intent.enum, ['inspect', 'operate', 'screenshot', 'console', 'network']);
  assert.equal(chromeExtensionClaimPlanTool.inputSchema.properties.matchTitle.type, 'string');
  assert.equal(chromeExtensionClaimPlanTool.inputSchema.properties.matchUrl.type, 'string');
  assert.equal(chromeExtensionClaimPlanTool.inputSchema.properties.matchOrigin.type, 'string');
  assert.equal(chromeExtensionClaimPlanTool.inputSchema.properties.matchPath.type, 'string');
  assert.equal(chromeExtensionClaimPlanTool.inputSchema.properties.tabIndex.type, 'number');
  assert.deepEqual(chromeExtensionClaimPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(runtimeAuditTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(runtimeAuditTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(runtimeAuditTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const runtimeCleanupTool = direct.find((tool) => tool.name === 'sba_runtime_cleanup_plan');
  assert.equal(runtimeCleanupTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(runtimeCleanupTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(runtimeCleanupTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(runGateAuditTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentWorkflowTool.inputSchema.properties.task.enum, ['auto', 'search', 'observe', 'inspect', 'analyze', 'scrape', 'operate', 'screenshot', 'diagnose', 'crawl', 'links', 'existing-tab', 'public-crawl', 'auth-proof']);
  assert.equal(agentWorkflowTool.inputSchema.properties.targetDir.type, 'string');
  assert.deepEqual(agentWorkflowTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentBackendSelectTool.inputSchema.properties.task.enum, ['auto', 'search', 'observe', 'inspect', 'analyze', 'scrape', 'operate', 'screenshot', 'diagnose', 'crawl', 'links', 'existing-tab', 'public-crawl', 'auth-proof']);
  assert.equal(agentBackendSelectTool.inputSchema.properties.targetDir.type, 'string');
  assert.equal(agentBackendSelectTool.inputSchema.properties.backendMatrixIn.type, 'string');
  assert.deepEqual(agentBackendSelectTool.inputSchema.properties.chromeMcpConnected.enum, ['yes', 'no', 'unknown']);
  assert.equal(agentBackendSelectTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.equal(agentBackendSelectTool.inputSchema.properties.matchOrigin.type, 'string');
  assert.equal(agentBackendSelectTool.inputSchema.properties.matchPath.type, 'string');
  assert.equal(agentBackendSelectTool.inputSchema.properties.tabIndex.type, 'number');
  assert.deepEqual(agentBackendSelectTool.inputSchema.properties.chromeMcpPageListOk.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(agentBackendSelectTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.deepEqual(agentControlPlaneTool.inputSchema.properties.task.enum, ['auto', 'search', 'analyze', 'scrape', 'operate', 'existing-tab', 'public-crawl', 'auth-proof']);
  assert.equal(agentControlPlaneTool.inputSchema.properties.targetDir.type, 'string');
  assert.equal(agentControlPlaneTool.inputSchema.properties.backendMatrixIn.type, 'string');
  assert.equal(agentControlPlaneTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(agentControlPlaneTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(agentControlPlaneTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentControlPlaneStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentControlPlaneStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(agentControlPlaneStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(agentControlPlaneWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(agentControlPlaneWatchTool.inputSchema.properties.in.type, 'string');
  assert.equal(agentControlPlaneWatchTool.inputSchema.properties.out.type, 'string');
  assert.equal(agentControlPlaneWatchTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(agentControlPlaneWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const benchmarkTool = direct.find((tool) => tool.name === 'sba_target_benchmark');
  assert.equal(benchmarkTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(benchmarkTool.inputSchema.properties.out.type, 'string');
  const providerBenchmarkTool = direct.find((tool) => tool.name === 'sba_provider_benchmark');
  const providersTool = direct.find((tool) => tool.name === 'sba_providers');
  const backendMatrixTool = direct.find((tool) => tool.name === 'sba_backend_matrix');
  const backendMatrixStatusTool = direct.find((tool) => tool.name === 'sba_backend_matrix_status');
  assert.deepEqual(providersTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(backendMatrixTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(backendMatrixTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(backendMatrixTool.inputSchema.properties.allowNewBackgroundTab.enum, ['yes', 'no', 'unknown']);
  assert.equal(backendMatrixTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.deepEqual(backendMatrixTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(backendMatrixStatusTool.inputSchema.properties.in.type, 'string');
  assert.deepEqual(backendMatrixStatusTool.inputSchema.properties.allowNewBackgroundTab.enum, ['yes', 'no', 'unknown']);
  assert.equal(backendMatrixStatusTool.inputSchema.properties.newBackgroundUrlEnv.type, 'string');
  assert.equal(backendMatrixStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(backendMatrixStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(providerBenchmarkTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(providerBenchmarkTool.inputSchema.properties.out.type, 'string');
  const lightpandaDecisionTool = direct.find((tool) => tool.name === 'sba_lightpanda_decision');
  assert.equal(lightpandaDecisionTool.inputSchema.properties.decision.enum.includes('reject'), true);
  assert.equal(lightpandaDecisionTool.inputSchema.properties.write.type, 'boolean');
  const lightpandaDoctorTool = direct.find((tool) => tool.name === 'sba_lightpanda_doctor');
  assert.deepEqual(lightpandaDoctorTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const agentBrowserDoctorTool = direct.find((tool) => tool.name === 'sba_agent_browser_doctor');
  assert.deepEqual(agentBrowserDoctorTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const providerDoctorStatusTool = direct.find((tool) => tool.name === 'sba_provider_doctor_status');
  assert.deepEqual(providerDoctorStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const playwrightDoctorTool = direct.find((tool) => tool.name === 'sba_playwright_doctor');
  assert.deepEqual(playwrightDoctorTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const seleniumDoctorTool = direct.find((tool) => tool.name === 'sba_selenium_doctor');
  assert.equal(seleniumDoctorTool.inputSchema.type, 'object');
  assert.deepEqual(seleniumDoctorTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const secretAuditTool = direct.find((tool) => tool.name === 'sba_secret_audit');
  assert.deepEqual(secretAuditTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const secretSetupPlanTool = direct.find((tool) => tool.name === 'sba_secret_setup_plan');
  assert.deepEqual(secretSetupPlanTool.inputSchema.properties.mode.enum, ['service-account', 'connect', 'local-desktop']);
  assert.deepEqual(secretSetupPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const secretRunPlanTool = direct.find((tool) => tool.name === 'sba_secret_run_plan');
  assert.deepEqual(secretRunPlanTool.inputSchema.properties.mode.enum, ['service-account', 'connect']);
  assert.equal(secretRunPlanTool.inputSchema.properties.targetDir.type, 'string');
  assert.deepEqual(secretRunPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const secretRunSelectTool = direct.find((tool) => tool.name === 'sba_secret_run_select');
  assert.equal(secretRunSelectTool.inputSchema.properties.targetDir.type, 'string');
  assert.deepEqual(secretRunSelectTool.inputSchema.properties.command.enum, ['control-status', 'secret-audit', 'target-login-capture', 'target-proof-capture']);
  assert.deepEqual(secretRunSelectTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const secretEnvHandoffTool = direct.find((tool) => tool.name === 'sba_secret_env_handoff');
  assert.deepEqual(secretEnvHandoffTool.inputSchema.properties.mode.enum, ['environment-local-env', 'service-account', 'connect', 'local-desktop']);
  assert.equal(secretEnvHandoffTool.inputSchema.properties.environmentName.type, 'string');
  assert.equal(secretEnvHandoffTool.inputSchema.properties.mountPath.type, 'string');
  assert.equal(secretEnvHandoffTool.inputSchema.properties.write.type, 'boolean');
  assert.deepEqual(secretEnvHandoffTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const secretEnvHandoffStatusTool = direct.find((tool) => tool.name === 'sba_secret_env_handoff_status');
  assert.equal(secretEnvHandoffStatusTool.inputSchema.properties.in.type, 'string');
  assert.deepEqual(secretEnvHandoffStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const secretEnvHandoffWatchTool = direct.find((tool) => tool.name === 'sba_secret_env_handoff_watch');
  assert.equal(secretEnvHandoffWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.deepEqual(secretEnvHandoffWatchTool.inputSchema.properties.mode.enum, ['environment-local-env', 'service-account', 'connect', 'local-desktop']);
  assert.deepEqual(secretEnvHandoffWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const objectiveResumeTool = direct.find((tool) => tool.name === 'sba_objective_resume');
  const objectiveNextTool = direct.find((tool) => tool.name === 'sba_objective_next');
  const objectiveHandoffTool = direct.find((tool) => tool.name === 'sba_objective_handoff');
  const objectiveCompletionAuditTool = direct.find((tool) => tool.name === 'sba_objective_completion_audit');
  const objectiveCompletionAuditStatusTool = direct.find((tool) => tool.name === 'sba_objective_completion_audit_status');
  const objectiveCompletionAuditWatchTool = direct.find((tool) => tool.name === 'sba_objective_completion_audit_watch');
  const objectiveSafeCommandTool = direct.find((tool) => tool.name === 'sba_objective_safe_command');
  const objectiveProofPipelineToolForSchema = direct.find((tool) => tool.name === 'sba_objective_proof_pipeline');
  assert.equal(objectiveCompletionAuditTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(objectiveCompletionAuditTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(objectiveCompletionAuditTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(objectiveCompletionAuditStatusTool.inputSchema.properties.in.type, 'string');
  assert.deepEqual(objectiveCompletionAuditStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(objectiveCompletionAuditWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(objectiveCompletionAuditWatchTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(objectiveCompletionAuditWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(objectiveSafeCommandTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(objectiveSafeCommandTool.inputSchema.properties.out.type, 'string');
  assert.equal(objectiveSafeCommandTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(objectiveSafeCommandTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(objectiveSafeCommandTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(objectiveNextTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(objectiveNextTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(objectiveNextTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(objectiveHandoffTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(objectiveHandoffTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(objectiveHandoffTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(objectiveProofPipelineToolForSchema.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(objectiveProofPipelineToolForSchema.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(objectiveProofPipelineToolForSchema.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(objectiveResumeTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(objectiveResumeTool.inputSchema.properties.operatorOk.type, 'string');
  assert.equal(objectiveResumeTool.inputSchema.properties.operatorReady.type, 'boolean');
  assert.equal(objectiveResumeTool.inputSchema.properties.manualCandidate.type, 'string');
  assert.match(objectiveResumeTool.inputSchema.properties.manualCandidate.description, /login-capture-wait/);
  assert.equal(objectiveResumeTool.inputSchema.properties.waitAuthTimeoutMs.type, 'number');
  assert.equal(objectiveResumeTool.inputSchema.properties.waitAuthIntervalMs.type, 'number');
  assert.equal(objectiveResumeTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.equal(objectiveResumeTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(objectiveResumeTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(objectiveResumeTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const objectiveStatusTool = direct.find((tool) => tool.name === 'sba_objective_status');
  assert.equal(objectiveStatusTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(objectiveStatusTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(objectiveStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const proofGateStatusTool = direct.find((tool) => tool.name === 'sba_proof_gate_status');
  assert.equal(proofGateStatusTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(proofGateStatusTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(proofGateStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const proofGateWatchTool = direct.find((tool) => tool.name === 'sba_proof_gate_watch');
  assert.equal(proofGateWatchTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(proofGateWatchTool.inputSchema.properties.out.type, 'string');
  assert.equal(proofGateWatchTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.equal(proofGateWatchTool.inputSchema.properties.intervalMs.type, 'number');
  assert.deepEqual(proofGateWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const backgroundMonitorTool = direct.find((tool) => tool.name === 'sba_background_monitor_plan');
  assert.equal(backgroundMonitorTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.equal(backgroundMonitorTool.inputSchema.properties.intervalMs.type, 'number');
  assert.equal(backgroundMonitorTool.inputSchema.properties.statusOut.type, 'string');
  assert.equal(backgroundMonitorTool.inputSchema.properties.logPath.type, 'string');
  assert.equal(backgroundMonitorTool.inputSchema.properties.pidPath.type, 'string');
  assert.deepEqual(backgroundMonitorTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const backgroundProofCaptureTool = direct.find((tool) => tool.name === 'sba_background_proof_capture_plan');
  assert.equal(backgroundProofCaptureTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.equal(backgroundProofCaptureTool.inputSchema.properties.intervalMs.type, 'number');
  assert.equal(backgroundProofCaptureTool.inputSchema.properties.monitorLogPath.type, 'string');
  assert.equal(backgroundProofCaptureTool.inputSchema.properties.monitorPidPath.type, 'string');
  assert.equal(backgroundProofCaptureTool.inputSchema.properties.captureLogPath.type, 'string');
  assert.equal(backgroundProofCaptureTool.inputSchema.properties.capturePidPath.type, 'string');
  assert.deepEqual(backgroundProofCaptureTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const backgroundProofCaptureStatusTool = direct.find((tool) => tool.name === 'sba_background_proof_capture_status');
  assert.equal(backgroundProofCaptureStatusTool.inputSchema.properties.targetDir.type, 'string');
  assert.equal(backgroundProofCaptureStatusTool.inputSchema.properties.maxLogLines.type, 'number');
  assert.deepEqual(backgroundProofCaptureStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const backgroundProofCaptureStartTool = direct.find((tool) => tool.name === 'sba_background_proof_capture_start');
  assert.deepEqual(backgroundProofCaptureStartTool.inputSchema.properties.mode.enum, ['monitor', 'capture']);
  assert.equal(backgroundProofCaptureStartTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(backgroundProofCaptureStartTool.inputSchema.properties.operatorOk.type, 'string');
  assert.equal(backgroundProofCaptureStartTool.inputSchema.properties.force.type, 'boolean');
  assert.equal(backgroundProofCaptureStartTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.equal(backgroundProofCaptureStartTool.inputSchema.properties.intervalMs.type, 'number');
  assert.equal(backgroundProofCaptureStartTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(backgroundProofCaptureStartTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(backgroundProofCaptureStartTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(objectiveHandoffTool.inputSchema.properties.write.type, 'boolean');
  assert.deepEqual(objectiveHandoffTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const operatorPackTool = direct.find((tool) => tool.name === 'sba_operator_pack');
  assert.equal(operatorPackTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(operatorPackTool.inputSchema.properties.out.type, 'string');
  assert.equal(operatorPackTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(operatorPackTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(operatorPackTool.inputSchema.properties.chromeExtensionBackendAvailable.enum, ['yes', 'no', 'unknown']);
  assert.equal(operatorPackTool.inputSchema.properties.chromeExtensionBackendLastError.type, 'string');
  assert.deepEqual(operatorPackTool.inputSchema.properties.chromeExtensionWindowRetryAttempted.enum, ['yes', 'no', 'unknown']);
  assert.deepEqual(operatorPackTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const operatorPackStatusTool = direct.find((tool) => tool.name === 'sba_operator_pack_status');
  assert.equal(operatorPackStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(operatorPackStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(operatorPackStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const operatorRunbookTool = direct.find((tool) => tool.name === 'sba_operator_runbook');
  assert.equal(operatorRunbookTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(operatorRunbookTool.inputSchema.properties.out.type, 'string');
  assert.equal(operatorRunbookTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(operatorRunbookTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(operatorRunbookTool.inputSchema.properties.format.enum, ['json', 'compact']);
	  const operatorRunbookStatusTool = direct.find((tool) => tool.name === 'sba_operator_runbook_status');
	  assert.equal(operatorRunbookStatusTool.inputSchema.properties.in.type, 'string');
	  assert.equal(operatorRunbookStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
	  assert.equal(operatorRunbookStatusTool.inputSchema.properties.objectiveCompletionAuditIn.type, 'string');
	  assert.equal(operatorRunbookStatusTool.inputSchema.properties.objectiveCompletionAuditStaleAfterSeconds.type, 'number');
	  assert.deepEqual(operatorRunbookStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const operatorRunbookWatchTool = direct.find((tool) => tool.name === 'sba_operator_runbook_watch');
  assert.equal(operatorRunbookWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(operatorRunbookWatchTool.inputSchema.properties.out.type, 'string');
  assert.equal(operatorRunbookWatchTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.deepEqual(operatorRunbookWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const bootstrapPlanTool = direct.find((tool) => tool.name === 'sba_target_bootstrap_plan');
  assert.equal(bootstrapPlanTool.inputSchema.properties.name.type, 'string');
  assert.equal(bootstrapPlanTool.inputSchema.properties.origin.type, 'string');
  assert.deepEqual(bootstrapPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const candidatePlanTool = direct.find((tool) => tool.name === 'sba_target_candidate_plan');
  assert.equal(candidatePlanTool.inputSchema.properties.candidate.enum.includes('github'), true);
  assert.deepEqual(candidatePlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const candidatePlanStatusTool = direct.find((tool) => tool.name === 'sba_target_candidate_plan_status');
  assert.equal(candidatePlanStatusTool.inputSchema.properties.in.type, 'string');
  assert.deepEqual(candidatePlanStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const candidatePlanWatchTool = direct.find((tool) => tool.name === 'sba_target_candidate_plan_watch');
  assert.equal(candidatePlanWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(candidatePlanWatchTool.inputSchema.properties.candidate.enum.includes('github'), true);
  assert.deepEqual(candidatePlanWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const approvalPackTool = direct.find((tool) => tool.name === 'sba_target_approval_pack');
  assert.equal(approvalPackTool.inputSchema.properties.candidate.enum.includes('github'), true);
  assert.equal(approvalPackTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(approvalPackTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(approvalPackTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const approvalStatusTool = direct.find((tool) => tool.name === 'sba_target_approval_status');
  assert.equal(approvalStatusTool.inputSchema.properties.candidate.enum.includes('github'), true);
  assert.equal(approvalStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(approvalStatusTool.inputSchema.properties.realExternal.type, 'boolean');
  assert.deepEqual(approvalStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const approvalResumeTool = direct.find((tool) => tool.name === 'sba_target_approval_resume');
  assert.equal(approvalResumeTool.inputSchema.properties.candidate.enum.includes('github'), true);
  assert.equal(approvalResumeTool.inputSchema.properties.realExternal.type, 'boolean');
  assert.equal(approvalResumeTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(approvalResumeTool.inputSchema.properties.operatorOk.type, 'string');
  assert.equal(approvalResumeTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.deepEqual(approvalResumeTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const approvalResumeStatusTool = direct.find((tool) => tool.name === 'sba_target_approval_resume_status');
  assert.equal(approvalResumeStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(approvalResumeStatusTool.inputSchema.properties.staleAfterSeconds.type, 'number');
  assert.deepEqual(approvalResumeStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const approvalResumeWatchTool = direct.find((tool) => tool.name === 'sba_target_approval_resume_watch');
  assert.equal(approvalResumeWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(approvalResumeWatchTool.inputSchema.properties.candidate.enum.includes('github'), true);
  assert.equal(approvalResumeWatchTool.inputSchema.properties.realExternal.type, 'boolean');
  assert.deepEqual(approvalResumeWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const proofPlanTool = direct.find((tool) => tool.name === 'sba_target_proof_plan');
  assert.equal(proofPlanTool.inputSchema.properties.strict.type, 'boolean');
  assert.deepEqual(proofPlanTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const authCheckTool = direct.find((tool) => tool.name === 'sba_target_auth_check');
  assert.equal(authCheckTool.inputSchema.properties.write.type, 'boolean');
  assert.equal(authCheckTool.inputSchema.properties.statusOut.type, 'string');
  assert.equal(authCheckTool.inputSchema.properties.daemon.type, 'boolean');
  assert.equal(authCheckTool.inputSchema.properties.cdpPort.type, 'number');
  assert.deepEqual(authCheckTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const authWatchTool = direct.find((tool) => tool.name === 'sba_target_auth_watch');
  assert.equal(authWatchTool.inputSchema.properties.statusOut.type, 'string');
  assert.equal(authWatchTool.inputSchema.properties.timeoutMs.type, 'number');
  assert.equal(authWatchTool.inputSchema.properties.intervalMs.type, 'number');
  assert.deepEqual(authWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const proofCaptureTool = direct.find((tool) => tool.name === 'sba_target_proof_capture');
  assert.equal(proofCaptureTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(proofCaptureTool.inputSchema.properties.authCheckPort.type, 'number');
  assert.equal(proofCaptureTool.inputSchema.properties.waitAuthStatusOut.type, 'string');
  assert.equal(proofCaptureTool.inputSchema.properties.completionAudit.type, 'boolean');
  assert.equal(proofCaptureTool.inputSchema.properties.cleanupOnFailure.type, 'boolean');
  assert.deepEqual(proofCaptureTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const loginCaptureTool = direct.find((tool) => tool.name === 'sba_target_login_capture');
  assert.equal(loginCaptureTool.inputSchema.properties.realExternal.type, 'boolean');
  assert.equal(loginCaptureTool.inputSchema.properties.dryRun.type, 'boolean');
  assert.equal(loginCaptureTool.inputSchema.properties.openOnly.type, 'boolean');
  assert.equal(loginCaptureTool.inputSchema.properties.handoffOut.type, 'string');
  assert.equal(loginCaptureTool.inputSchema.properties.waitAuthTimeoutMs.type, 'number');
  assert.equal(loginCaptureTool.inputSchema.properties.waitAuthStatusOut.type, 'string');
  const handoffRunTool = direct.find((tool) => tool.name === 'sba_target_handoff_run');
  const handoffStatusTool = direct.find((tool) => tool.name === 'sba_target_handoff_status');
  const handoffResumeTool = direct.find((tool) => tool.name === 'sba_target_handoff_resume');
  const handoffResumeStatusTool = direct.find((tool) => tool.name === 'sba_target_handoff_resume_status');
  const handoffResumeWatchTool = direct.find((tool) => tool.name === 'sba_target_handoff_resume_watch');
  assert.equal(handoffStatusTool.inputSchema.properties.handoff.type, 'string');
  assert.deepEqual(handoffStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(handoffRunTool.inputSchema.properties.handoff.type, 'string');
  assert.equal(handoffRunTool.inputSchema.properties.command.type, 'string');
  assert.equal(handoffRunTool.inputSchema.properties.out.type, 'string');
  assert.equal(handoffRunTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(handoffRunTool.inputSchema.properties.preflightAuth.type, 'boolean');
  assert.deepEqual(handoffRunTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(handoffResumeTool.inputSchema.properties.handoff.type, 'string');
  assert.equal(handoffResumeTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(handoffResumeTool.inputSchema.properties.waitAuth.type, 'boolean');
  assert.equal(handoffResumeTool.inputSchema.properties.waitAuthTimeoutMs.type, 'number');
  assert.equal(handoffResumeTool.inputSchema.properties.waitAuthIntervalMs.type, 'number');
  assert.equal(handoffResumeTool.inputSchema.properties.waitAuthStatusOut.type, 'string');
  assert.equal(handoffResumeTool.inputSchema.properties.out.type, 'string');
  assert.deepEqual(handoffResumeTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(handoffResumeStatusTool.inputSchema.properties.handoff.type, 'string');
  assert.equal(handoffResumeStatusTool.inputSchema.properties.in.type, 'string');
  assert.equal(handoffResumeStatusTool.inputSchema.properties.waitAuthStatusOut.type, 'string');
  assert.equal(handoffResumeStatusTool.inputSchema.properties.authWatchIn.type, 'string');
  assert.equal(handoffResumeStatusTool.inputSchema.properties.authCheckIn.type, 'string');
  assert.equal(handoffResumeStatusTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(handoffResumeStatusTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(handoffResumeStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  assert.equal(handoffResumeWatchTool.inputSchema.properties.run.type, 'boolean');
  assert.equal(handoffResumeWatchTool.inputSchema.properties.operatorOk.type, 'string');
  assert.equal(handoffResumeWatchTool.inputSchema.properties.in.type, 'string');
  assert.equal(handoffResumeWatchTool.inputSchema.properties.authWatchIn.type, 'string');
  assert.equal(handoffResumeWatchTool.inputSchema.properties.monitorTimeoutMs.type, 'number');
  assert.equal(handoffResumeWatchTool.inputSchema.properties.monitorIntervalMs.type, 'number');
  assert.deepEqual(handoffResumeWatchTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const proofInventoryTool = direct.find((tool) => tool.name === 'sba_target_proof_inventory');
  assert.equal(proofInventoryTool.inputSchema.properties.realExternal.type, 'boolean');
  assert.equal(proofInventoryTool.inputSchema.properties.strict.type, 'boolean');
  assert.deepEqual(proofInventoryTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const targetRunTool = direct.find((tool) => tool.name === 'sba_target_run');
  assert.ok(targetRunTool.inputSchema.properties.recipe.enum.includes('operate'));
  assert.ok(targetRunTool.inputSchema.properties.recipe.enum.includes('analyze'));
  const targetRunStatusTool = direct.find((tool) => tool.name === 'sba_target_run_status');
  assert.ok(targetRunStatusTool.inputSchema.properties.recipe.enum.includes('operate'));
  assert.ok(targetRunStatusTool.inputSchema.properties.recipe.enum.includes('scrape'));
  assert.deepEqual(targetRunStatusTool.inputSchema.properties.format.enum, ['json', 'compact']);
  const targetOperateAddTool = direct.find((tool) => tool.name === 'sba_target_operate_add');
  assert.ok(targetOperateAddTool.inputSchema.properties.action.enum.includes('fill'));
  assert.equal(targetOperateAddTool.inputSchema.properties.valueEnv.type, 'string');
  const proofNextTool = direct.find((tool) => tool.name === 'sba_target_proof_next');
  assert.equal(proofNextTool.inputSchema.properties.realExternal.type, 'boolean');
  assert.equal(proofNextTool.inputSchema.properties.strict.type, 'boolean');
  assert.deepEqual(proofNextTool.inputSchema.properties.format.enum, ['json', 'compact']);

  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });
  assert.equal(response.result.tools.length, direct.length);
  assert.equal(response.result.tools[0].inputSchema.type, 'object');
});

test('mcp server calls read-only runtime cleanup and Lightpanda doctor tools', async () => {
  const cleanup = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'sba_runtime_cleanup_plan',
      arguments: { ownerLimit: 1 }
    }
  });
  assert.equal(cleanup.result.isError, false);
  assert.equal(cleanup.result.structuredContent.safeMode, true);
  assert.equal(cleanup.result.structuredContent.destructiveActionsIncluded, false);

  const lightpanda = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'sba_lightpanda_doctor',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(lightpanda.result.isError, false);
  assert.match(lightpanda.result.content[0].text, /^ready_for_public_benchmark: /m);
  assert.match(lightpanda.result.content[0].text, /^benchmark_command: /m);
  assert.doesNotMatch(lightpanda.result.content[0].text, /^\{/);
  assert.ok(lightpanda.result.structuredContent.checks.some((check) => check.name === 'binary.available'));

  const agentBrowserDoctor = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 71,
    method: 'tools/call',
    params: {
      name: 'sba_agent_browser_doctor',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(agentBrowserDoctor.result.isError, false);
  assert.match(agentBrowserDoctor.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(agentBrowserDoctor.result.content[0].text, /^agent_browser_cli_exists: /m);
  assert.match(agentBrowserDoctor.result.content[0].text, /^agent_browser_chrome_for_testing_exists: /m);
  assert.doesNotMatch(agentBrowserDoctor.result.content[0].text, /^\{/);
  assert.equal(agentBrowserDoctor.result.structuredContent.secretValuesRead, false);
  assert.equal(agentBrowserDoctor.result.structuredContent.opensBrowserNow, false);

  const playwright = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 72,
    method: 'tools/call',
    params: {
      name: 'sba_playwright_doctor',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(playwright.result.isError, false);
  assert.match(playwright.result.content[0].text, /^role: test-rich-automation-adapter$/m);
  assert.match(playwright.result.content[0].text, /^ready_for_public_smoke: /m);
  assert.match(playwright.result.content[0].text, /^ready_for_authenticated_default: no$/m);
  assert.match(playwright.result.content[0].text, /^storage_state_sensitive: yes$/m);
  assert.match(playwright.result.content[0].text, /^smoke_command: /m);
  assert.doesNotMatch(playwright.result.content[0].text, /^\{/);
  assert.ok(playwright.result.structuredContent.checks.some((check) => check.name === 'package.playwright-core'));

  const selenium = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'sba_selenium_doctor',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(selenium.result.isError, false);
  assert.match(selenium.result.content[0].text, /^role: compatibility-bridge$/m);
  assert.match(selenium.result.content[0].text, /^ready_for_local_smoke: /m);
  assert.match(selenium.result.content[0].text, /^smoke_command: /m);
  assert.doesNotMatch(selenium.result.content[0].text, /^\{/);
  assert.ok(selenium.result.structuredContent.checks.some((check) => check.name === 'package.selenium-webdriver'));

  const providerDoctorStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'sba_provider_doctor_status',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(providerDoctorStatus.result.isError, false);
  assert.match(providerDoctorStatus.result.content[0].text, /^default_backend: /m);
  assert.match(providerDoctorStatus.result.content[0].text, /^lightpanda_ready_for_public_benchmark: /m);
  assert.match(providerDoctorStatus.result.content[0].text, /^playwright_ready_for_public_smoke: /m);
  assert.match(providerDoctorStatus.result.content[0].text, /^selenium_ready_for_local_smoke: /m);
  assert.doesNotMatch(providerDoctorStatus.result.content[0].text, /^\{/);
  assert.equal(Array.isArray(providerDoctorStatus.result.structuredContent.lightpanda.missingChecks), true);
  assert.equal(Array.isArray(providerDoctorStatus.result.structuredContent.playwright.missingChecks), true);

  const chromeMcpAutostartPlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 91,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_mcp_autostart_plan',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(chromeMcpAutostartPlan.result.isError, false);
  assert.match(chromeMcpAutostartPlan.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(chromeMcpAutostartPlan.result.content[0].text, /^opens_browser_now: no$/m);
  assert.match(chromeMcpAutostartPlan.result.content[0].text, /^starts_background_now: no$/m);
  assert.match(chromeMcpAutostartPlan.result.content[0].text, /^install_requires_operator_approval: yes$/m);
  assert.match(chromeMcpAutostartPlan.result.content[0].text, /^agent_may_install_unattended: no$/m);
  assert.doesNotMatch(chromeMcpAutostartPlan.result.content[0].text, /^\{/);
  assert.equal(chromeMcpAutostartPlan.result.structuredContent.secretValuesRead, false);
  assert.equal(chromeMcpAutostartPlan.result.structuredContent.opensBrowserNow, false);
  assert.equal(chromeMcpAutostartPlan.result.structuredContent.startsBackgroundNow, false);

  const chromeMcpAutostartStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 92,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_mcp_autostart_plan_status',
      arguments: { format: 'compact', in: 'operator/nonexistent-chrome-mcp-autostart-plan.json' }
    }
  });
  assert.equal(chromeMcpAutostartStatus.result.isError, false);
  assert.match(chromeMcpAutostartStatus.result.content[0].text, /^exists: no$/m);
  assert.match(chromeMcpAutostartStatus.result.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-autostart-plan' '--write'/m);
  assert.equal(chromeMcpAutostartStatus.result.structuredContent.secretValuesRead, false);
  assert.equal(chromeMcpAutostartStatus.result.structuredContent.opensBrowserNow, false);

  const secretAudit = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'sba_secret_audit',
      arguments: {}
    }
  });
  assert.equal(secretAudit.result.isError, false);
  assert.equal(secretAudit.result.structuredContent.secretValuesRead, false);
  assert.ok(secretAudit.result.structuredContent.checks.some((check) => check.name === 'cli.op'));

  const secretSetupPlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'sba_secret_setup_plan',
      arguments: { mode: 'service-account' }
    }
  });
  assert.equal(secretSetupPlan.result.isError, false);
  assert.equal(secretSetupPlan.result.structuredContent.mode, 'service-account');
  assert.equal(secretSetupPlan.result.structuredContent.secretValuesRead, false);
  assert.ok(secretSetupPlan.result.structuredContent.commands.some((item) => item.id === 'export-service-account-token'));

  const secretRunPlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {
      name: 'sba_secret_run_plan',
      arguments: {
        mode: 'service-account',
        command: 'target-login-capture',
        targetDir: 'runs/target-packs/github'
      }
    }
  });
  assert.equal(secretRunPlan.result.isError, false);
  assert.equal(secretRunPlan.result.structuredContent.commandId, 'target-login-capture');
  assert.equal(secretRunPlan.result.structuredContent.secretValuesRead, false);
  assert.ok(secretRunPlan.result.structuredContent.commands.some((item) => item.id === 'wrapped-agent-command'));

  const secretRunSelect = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 161,
    method: 'tools/call',
    params: {
      name: 'sba_secret_run_select',
      arguments: {
        command: 'target-login-capture',
        targetDir: 'runs/target-packs/github'
      }
    }
  });
  assert.equal(secretRunSelect.result.isError, false);
  assert.equal(secretRunSelect.result.structuredContent.commandId, 'target-login-capture');
  assert.equal(secretRunSelect.result.structuredContent.secretValuesRead, false);
  assert.equal(secretRunSelect.result.structuredContent.readsSecretValues, false);
});

test('mcp server can return compact text while preserving structured content', async () => {
  const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-mcp-server-'));
  const oldEnv = process.env.SBA_ROOT_DIR;
  process.env.SBA_ROOT_DIR = testTmpDir;
  const targetPack = scaffoldTargetPack({
    outputDir: path.join(testTmpDir, 'runs'),
    redactKeys: ['authorization', 'cookie', 'password', 'token', 'secret'],
    maxEvalBytes: 12000
  }, {
    name: 'github',
    origins: 'https://github.com',
    loginUrl: 'https://github.com/login',
    pageUrl: 'https://github.com/'
  });
  try {
    const control = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 15,
    method: 'tools/call',
    params: {
      name: 'sba_control_status',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(control.result.isError, false);
  assert.match(control.result.content[0].text, /^objective_status: /m);
  assert.match(control.result.content[0].text, /^runtime_audit_command: 'node' 'src\/cli\.mjs' 'runtime-audit'/m);
  assert.match(control.result.content[0].text, /^runtime_cleanup_plan_command: 'node' 'src\/cli\.mjs' 'runtime-cleanup-plan'/m);
  assert.equal(control.result.structuredContent.secretValuesRead, false);

  const agentNext = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1501,
    method: 'tools/call',
    params: {
      name: 'sba_agent_next',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(agentNext.result.isError, false);
  assert.match(agentNext.result.content[0].text, /^agent_next_action: /m);
  assert.match(agentNext.result.content[0].text, /^agent_can_run_without_approval: /m);
  assert.equal(agentNext.result.structuredContent.secretValuesRead, false);

  const agentPreflight = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1502,
    method: 'tools/call',
    params: {
      name: 'sba_agent_preflight',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(agentPreflight.result.isError, false);
  assert.match(agentPreflight.result.content[0].text, /^real_external_required: yes$/m);
  assert.match(agentPreflight.result.content[0].text, /^opens_browser_now: no$/m);
  assert.match(agentPreflight.result.content[0].text, /^starts_capture_now: no$/m);
  assert.equal(agentPreflight.result.structuredContent.secretValuesRead, false);
  assert.equal(agentPreflight.result.structuredContent.realExternalRequired, true);

  const agentProofChecklist = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1503,
    method: 'tools/call',
    params: {
      name: 'sba_agent_proof_checklist',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(agentProofChecklist.result.isError, false);
  assert.match(agentProofChecklist.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(agentProofChecklist.result.content[0].text, /^status_only: yes$/m);
  assert.match(agentProofChecklist.result.content[0].text, /^opens_browser_now: no$/m);
  assert.match(agentProofChecklist.result.content[0].text, /^starts_capture_now: no$/m);
  assert.match(agentProofChecklist.result.content[0].text, /^reads_browser_storage: no$/m);
  assert.match(agentProofChecklist.result.content[0].text, /^page_content_returned: no$/m);
  assert.match(agentProofChecklist.result.content[0].text, /^agent_proof_checklist_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist'/m);
  assert.match(agentProofChecklist.result.content[0].text, /^agent_proof_checklist_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist'.*'--write'/m);
  assert.match(agentProofChecklist.result.content[0].text, /^agent_proof_checklist_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist-status'/m);
  assert.match(agentProofChecklist.result.content[0].text, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
  assert.match(agentProofChecklist.result.content[0].text, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
  assert.doesNotMatch(agentProofChecklist.result.content[0].text, /^\{/);
  assert.equal(agentProofChecklist.result.structuredContent.secretValuesRead, false);
  assert.equal(agentProofChecklist.result.structuredContent.opensBrowserNow, false);
  assert.equal(agentProofChecklist.result.structuredContent.startsCaptureNow, false);
  assert.equal(agentProofChecklist.result.structuredContent.readsBrowserStorage, false);
  assert.equal(agentProofChecklist.result.structuredContent.pageContentReturned, false);

  const agentProofChecklistStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1504,
    method: 'tools/call',
    params: {
      name: 'sba_agent_proof_checklist_status',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(agentProofChecklistStatus.result.isError, false);
  assert.match(agentProofChecklistStatus.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(agentProofChecklistStatus.result.content[0].text, /^exists: /m);
  assert.match(agentProofChecklistStatus.result.content[0].text, /^target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
  assert.match(agentProofChecklistStatus.result.content[0].text, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
  assert.match(agentProofChecklistStatus.result.content[0].text, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(agentProofChecklistStatus.result.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist'/m);
  assert.doesNotMatch(agentProofChecklistStatus.result.content[0].text, /^\{/);
  assert.equal(agentProofChecklistStatus.result.structuredContent.secretValuesRead, false);
  assert.equal(agentProofChecklistStatus.result.structuredContent.opensBrowserNow, false);
  assert.equal(agentProofChecklistStatus.result.structuredContent.startsCaptureNow, false);

  const agentProofCloseout = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1505,
    method: 'tools/call',
    params: {
      name: 'sba_agent_proof_closeout',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(agentProofCloseout.result.isError, false);
  assert.match(agentProofCloseout.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(agentProofCloseout.result.content[0].text, /^status_only: yes$/m);
  assert.match(agentProofCloseout.result.content[0].text, /^opens_browser_now: no$/m);
  assert.match(agentProofCloseout.result.content[0].text, /^starts_capture_now: no$/m);
  assert.match(agentProofCloseout.result.content[0].text, /^agent_proof_closeout_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout'/m);
  assert.match(agentProofCloseout.result.content[0].text, /^objective_completion_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit'/m);
  assert.doesNotMatch(agentProofCloseout.result.content[0].text, /^\{/);
  assert.equal(agentProofCloseout.result.structuredContent.secretValuesRead, false);
  assert.equal(agentProofCloseout.result.structuredContent.opensBrowserNow, false);
  assert.equal(agentProofCloseout.result.structuredContent.startsCaptureNow, false);
  assert.equal(agentProofCloseout.result.structuredContent.readsBrowserStorage, false);

  const agentProofCloseoutStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1506,
    method: 'tools/call',
    params: {
      name: 'sba_agent_proof_closeout_status',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(agentProofCloseoutStatus.result.isError, false);
  assert.match(agentProofCloseoutStatus.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(agentProofCloseoutStatus.result.content[0].text, /^exists: /m);
  assert.match(agentProofCloseoutStatus.result.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout'/m);
  assert.doesNotMatch(agentProofCloseoutStatus.result.content[0].text, /^\{/);
  assert.equal(agentProofCloseoutStatus.result.structuredContent.secretValuesRead, false);
  assert.equal(agentProofCloseoutStatus.result.structuredContent.opensBrowserNow, false);
  assert.equal(agentProofCloseoutStatus.result.structuredContent.startsCaptureNow, false);

  const workflow = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 151,
    method: 'tools/call',
    params: {
      name: 'sba_agent_workflow',
      arguments: {
        task: 'search',
        query: 'secure browser agent',
        write: true,
        out: 'operator/agent-control-plane-test.json',
        format: 'compact'
      }
    }
  });
  assert.equal(workflow.result.isError, false);
  assert.match(workflow.result.content[0].text, /^task: search$/m);
  assert.match(workflow.result.content[0].text, /^recommended_command_id: public-search$/m);
  assert.equal(workflow.result.structuredContent.secretValuesRead, false);

  const controlPlane = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1511,
    method: 'tools/call',
    params: {
      name: 'sba_agent_control_plane',
      arguments: {
        task: 'search',
        query: 'secure browser agent',
        write: true,
        out: 'operator/agent-control-plane-test.json',
        format: 'compact'
      }
    }
  });
  assert.equal(controlPlane.result.isError, false);
  assert.match(controlPlane.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(controlPlane.result.content[0].text, /^task: search$/m);
  assert.match(controlPlane.result.content[0].text, /^default_backend: /m);
  assert.match(controlPlane.result.content[0].text, /^selected_backend: /m);
  assert.match(controlPlane.result.content[0].text, /^objective_primary: /m);
  assert.equal(controlPlane.result.structuredContent.secretValuesRead, false);
  assert.equal(controlPlane.result.structuredContent.opensBrowserNow, false);
  assert.equal(controlPlane.result.structuredContent.outputPath, 'operator/agent-control-plane-test.json');

  const controlPlaneStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1512,
    method: 'tools/call',
    params: {
      name: 'sba_agent_control_plane_status',
      arguments: {
        in: 'operator/agent-control-plane-test.json',
        format: 'compact'
      }
    }
  });
  assert.equal(controlPlaneStatus.result.isError, false);
  assert.match(controlPlaneStatus.result.content[0].text, /^status_only: yes$/m);
  assert.match(controlPlaneStatus.result.content[0].text, /^exists: yes$/m);
  assert.match(controlPlaneStatus.result.content[0].text, /^parse_ok: yes$/m);
  assert.match(controlPlaneStatus.result.content[0].text, /^task: search$/m);
  assert.equal(controlPlaneStatus.result.structuredContent.secretValuesRead, false);
  assert.equal(controlPlaneStatus.result.structuredContent.opensBrowserNow, false);

  const controlPlaneWatch = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1513,
    method: 'tools/call',
    params: {
      name: 'sba_agent_control_plane_watch',
      arguments: {
        in: 'operator/agent-control-plane-test.json',
        format: 'compact'
      }
    }
  });
  assert.equal(controlPlaneWatch.result.isError, false);
  assert.match(controlPlaneWatch.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(controlPlaneWatch.result.content[0].text, /^run_requested: no$/m);
  assert.match(controlPlaneWatch.result.content[0].text, /^executed: no$/m);
  assert.match(controlPlaneWatch.result.content[0].text, /^before_exists: yes$/m);
  assert.match(controlPlaneWatch.result.content[0].text, /^before_parse_ok: yes$/m);
  assert.equal(controlPlaneWatch.result.structuredContent.secretValuesRead, false);
  assert.equal(controlPlaneWatch.result.structuredContent.opensBrowserNow, false);
  assert.equal(controlPlaneWatch.result.structuredContent.startsCaptureNow, false);

  const task = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 152,
    method: 'tools/call',
    params: {
      name: 'sba_agent_task',
      arguments: {
        task: 'search',
        query: 'secure browser agent',
        format: 'compact'
      }
    }
  });
  assert.equal(task.result.isError, false);
  assert.match(task.result.content[0].text, /^status: planned$/m);
  assert.match(task.result.content[0].text, /^execution_allowed: yes$/m);
  assert.equal(task.result.structuredContent.secretValuesRead, false);

  const readiness = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 153,
    method: 'tools/call',
    params: {
      name: 'sba_readiness_audit',
      arguments: {
        format: 'compact'
      }
    }
  });
  assert.equal(readiness.result.isError, false);
  assert.match(readiness.result.content[0].text, /^ready_for_local_authenticated_development: /m);
  assert.match(readiness.result.content[0].text, /^complete_against_objective: /m);
  assert.match(readiness.result.content[0].text, /^provider_adoption_next: /m);
  assert.match(readiness.result.content[0].text, /^provider_lightpanda_next: /m);
  assert.match(readiness.result.content[0].text, /^provider_playwright_next: /m);
  assert.match(readiness.result.content[0].text, /^provider_selenium_next: /m);
  assert.equal(readiness.result.structuredContent.objective, 'Fast, secure, credential-aware browser search, operation, page analysis, and scraping for agents.');

  const completionProofBundle = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 15301,
    method: 'tools/call',
    params: {
      name: 'sba_completion_proof_bundle',
      arguments: {
        candidate: 'github',
        format: 'compact'
      }
    }
  });
  assert.equal(completionProofBundle.result.isError, false);
  assert.match(completionProofBundle.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(completionProofBundle.result.content[0].text, /^status_only: yes$/m);
  assert.match(completionProofBundle.result.content[0].text, /^complete: /m);
  assert.match(completionProofBundle.result.content[0].text, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
  assert.match(completionProofBundle.result.content[0].text, /^completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status'/m);
  assert.match(completionProofBundle.result.content[0].text, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
  assert.match(completionProofBundle.result.content[0].text, /^target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--format' 'compact'/m);
  assert.doesNotMatch(completionProofBundle.result.content[0].text, /^\{/);
  assert.equal(completionProofBundle.result.structuredContent.safeMode, true);
  assert.equal(completionProofBundle.result.structuredContent.statusOnly, true);
  assert.equal(completionProofBundle.result.structuredContent.opensBrowserNow, false);
  assert.equal(completionProofBundle.result.structuredContent.startsCaptureNow, false);
  assert.equal(completionProofBundle.result.structuredContent.readsBrowserStorage, false);

  const completionProofBundleStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 15302,
    method: 'tools/call',
    params: {
      name: 'sba_completion_proof_bundle_status',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(completionProofBundleStatus.result.isError, false);
  assert.match(completionProofBundleStatus.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(completionProofBundleStatus.result.content[0].text, /^exists: /m);
  assert.match(completionProofBundleStatus.result.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-watch'/m);
  assert.equal(completionProofBundleStatus.result.structuredContent.safeMode, true);
  assert.equal(completionProofBundleStatus.result.structuredContent.opensBrowserNow, false);

  const completionProofBundleWatch = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 15303,
    method: 'tools/call',
    params: {
      name: 'sba_completion_proof_bundle_watch',
      arguments: {
        run: false,
        format: 'compact'
      }
    }
  });
  assert.equal(completionProofBundleWatch.result.isError, false);
  assert.match(completionProofBundleWatch.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(completionProofBundleWatch.result.content[0].text, /^run_requested: no$/m);
  assert.match(completionProofBundleWatch.result.content[0].text, /^executed: no$/m);
  assert.equal(completionProofBundleWatch.result.structuredContent.safeMode, true);
  assert.equal(completionProofBundleWatch.result.structuredContent.opensBrowserNow, false);
  assert.equal(completionProofBundleWatch.result.structuredContent.startsCaptureNow, false);

  const sourceAudit = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1530,
    method: 'tools/call',
    params: {
      name: 'sba_source_audit',
      arguments: {
        format: 'compact'
      }
    }
  });
  assert.equal(sourceAudit.result.isError, false);
  assert.match(sourceAudit.result.content[0].text, /^source_targets: /m);
  assert.match(sourceAudit.result.content[0].text, /^source_present_targets: /m);
  assert.match(sourceAudit.result.content[0].text, /^readiness_agent_browser: /m);
  assert.match(sourceAudit.result.content[0].text, /^source_browsermcp_present: /m);
  assert.doesNotMatch(sourceAudit.result.content[0].text, /^\{/);
  assert.equal(Array.isArray(sourceAudit.result.structuredContent.targets), true);

  const backgroundProofCaptureStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 15301,
    method: 'tools/call',
    params: {
      name: 'sba_background_proof_capture_status',
      arguments: {
        format: 'compact'
      }
    }
  });
  assert.equal(backgroundProofCaptureStatus.result.isError, false);
  assert.match(backgroundProofCaptureStatus.result.content[0].text, /^no_open_wait_capture_command: /m);
  assert.match(backgroundProofCaptureStatus.result.content[0].text, /^background_no_open_wait_capture_command: /m);
  assert.doesNotMatch(backgroundProofCaptureStatus.result.content[0].text, /--open-login/);
  assert.match(backgroundProofCaptureStatus.result.structuredContent.commands.noOpenWaitCapture.shell, /--wait-auth/);
  assert.match(backgroundProofCaptureStatus.result.structuredContent.commands.backgroundNoOpenWaitCapture.shell, /--wait-auth/);
  assert.doesNotMatch(backgroundProofCaptureStatus.result.structuredContent.commands.noOpenWaitCapture.shell, /--open-login/);
  assert.doesNotMatch(backgroundProofCaptureStatus.result.structuredContent.commands.backgroundNoOpenWaitCapture.shell, /--open-login/);

  const targetCandidatePlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1531,
    method: 'tools/call',
    params: {
      name: 'sba_target_candidate_plan',
      arguments: {
        candidate: 'github',
        format: 'compact'
      }
    }
  });
  assert.equal(targetCandidatePlan.result.isError, false);
  assert.match(targetCandidatePlan.result.content[0].text, /^recommended_candidate: github$/m);
  assert.match(targetCandidatePlan.result.content[0].text, /^recommended_bootstrap_plan_command: 'node' 'src\/cli\.mjs' 'target-bootstrap-plan'/m);
  assert.equal(targetCandidatePlan.result.structuredContent.safeMode, true);

  const candidatePlanOut = `operator/target-candidate-plan-${Date.now()}.json`;
  const targetCandidatePlanWatch = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1532,
    method: 'tools/call',
    params: {
      name: 'sba_target_candidate_plan_watch',
      arguments: {
        run: true,
        in: candidatePlanOut,
        out: candidatePlanOut,
        candidate: 'github',
        format: 'compact'
      }
    }
  });
  assert.equal(targetCandidatePlanWatch.result.isError, false);
  assert.match(targetCandidatePlanWatch.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(targetCandidatePlanWatch.result.content[0].text, /^secret_values_read: no$/m);
  assert.match(targetCandidatePlanWatch.result.content[0].text, /^opens_browser_now: no$/m);
  assert.equal(targetCandidatePlanWatch.result.structuredContent.executed, true);
  assert.equal(targetCandidatePlanWatch.result.structuredContent.opensBrowserNow, false);

  const targetCandidatePlanStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1533,
    method: 'tools/call',
    params: {
      name: 'sba_target_candidate_plan_status',
      arguments: {
        in: candidatePlanOut,
        format: 'compact'
      }
    }
  });
  assert.equal(targetCandidatePlanStatus.result.isError, false);
  assert.match(targetCandidatePlanStatus.result.content[0].text, /^exists: yes$/m);
  assert.match(targetCandidatePlanStatus.result.content[0].text, /^recommended_candidate: github$/m);
  assert.match(targetCandidatePlanStatus.result.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan-watch'/m);
  assert.equal(targetCandidatePlanStatus.result.structuredContent.secretValuesRead, false);

  const targetApprovalPack = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1533,
    method: 'tools/call',
    params: {
      name: 'sba_target_approval_pack',
      arguments: {
        candidate: 'github',
        format: 'compact'
      }
    }
  });
  assert.equal(targetApprovalPack.result.isError, false);
  assert.match(targetApprovalPack.result.content[0].text, /^operator_approval_required: yes$/m);
  assert.match(targetApprovalPack.result.content[0].text, /^selected_candidate: github$/m);
  assert.match(targetApprovalPack.result.content[0].text, /^opens_browser_now: no$/m);
  assert.match(targetApprovalPack.result.content[0].text, /^login_capture_command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
  assert.equal(targetApprovalPack.result.structuredContent.secretValuesRead, false);
  assert.equal(targetApprovalPack.result.structuredContent.opensBrowserNow, false);

  const targetApprovalStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1534,
    method: 'tools/call',
    params: {
      name: 'sba_target_approval_status',
      arguments: {
        candidate: 'github',
        format: 'compact'
      }
    }
  });
  assert.equal(targetApprovalStatus.result.isError, false);
  assert.match(targetApprovalStatus.result.content[0].text, /^selected_candidate: github$/m);
  assert.match(targetApprovalStatus.result.content[0].text, /^opens_browser_now: no$/m);
  assert.match(targetApprovalStatus.result.content[0].text, /^starts_capture_now: no$/m);
  assert.match(targetApprovalStatus.result.content[0].text, /^target_next: /m);
  assert.match(targetApprovalStatus.result.content[0].text, /^agent_safe_command_id: /m);
  assert.match(targetApprovalStatus.result.content[0].text, /^agent_may_run_unattended: /m);
  assert.match(targetApprovalStatus.result.content[0].text, /^operator_command_id: /m);
  assert.match(targetApprovalStatus.result.content[0].text, /^operator_approval_required: /m);
  assert.match(targetApprovalStatus.result.content[0].text, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
  assert.match(targetApprovalStatus.result.content[0].text, /^approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
  assert.match(targetApprovalStatus.result.content[0].text, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
  assert.match(targetApprovalStatus.result.content[0].text, /^wait_auth_proof_capture_command: 'node' 'src\/cli\.mjs' 'target-proof-capture'.*'--wait-auth'/m);
  assert.match(targetApprovalStatus.result.content[0].text, /^approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--real-external'/m);
  assert.match(targetApprovalStatus.result.content[0].text, /^approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
  assert.equal(targetApprovalStatus.result.structuredContent.secretValuesRead, false);
  assert.equal(targetApprovalStatus.result.structuredContent.opensBrowserNow, false);
  assert.equal(typeof targetApprovalStatus.result.structuredContent.agentSafeCommandId, 'string');
  assert.equal(typeof targetApprovalStatus.result.structuredContent.agentMayRunUnattended, 'boolean');
  assert.equal(typeof targetApprovalStatus.result.structuredContent.operatorCommandId, 'string');
  assert.equal(typeof targetApprovalStatus.result.structuredContent.operatorApprovalRequired, 'boolean');
  assert.equal(targetApprovalStatus.result.structuredContent.commands.agentPreflight.args.includes('agent-preflight'), true);
  assert.equal(targetApprovalStatus.result.structuredContent.commands.approvalPreflight.args.includes('--real-external'), true);
  assert.equal(targetApprovalStatus.result.structuredContent.commands.waitAuthProofCapture.args.includes('--wait-auth'), true);
  assert.equal(targetApprovalStatus.result.structuredContent.commands.approvalResumeRun.args.includes('--operator-ok'), true);

  const targetApprovalPreflight = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 15345,
    method: 'tools/call',
    params: {
      name: 'sba_target_approval_preflight',
      arguments: {
        candidate: 'github',
        format: 'compact'
      }
    }
  });
  assert.equal(targetApprovalPreflight.result.isError, false);
  assert.match(targetApprovalPreflight.result.content[0].text, /^real_external_required: yes$/m);
  assert.match(targetApprovalPreflight.result.content[0].text, /^real_external_inventory: yes$/m);
  assert.match(targetApprovalPreflight.result.content[0].text, /^agent_safe_command_id: /m);
  assert.match(targetApprovalPreflight.result.content[0].text, /^operator_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--real-external'.*'--operator-ok' 'OK'/m);
  assert.match(targetApprovalPreflight.result.content[0].text, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--real-external'/m);
  assert.equal(targetApprovalPreflight.result.structuredContent.secretValuesRead, false);
  assert.equal(targetApprovalPreflight.result.structuredContent.opensBrowserNow, false);

  const targetProofPlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 15346,
    method: 'tools/call',
    params: {
      name: 'sba_target_proof_plan',
      arguments: {
        targetDir: targetPack.dir,
        realExternal: true,
        format: 'compact'
      }
    }
  });
  assert.equal(targetProofPlan.result.isError, false);
  assert.match(targetProofPlan.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(targetProofPlan.result.content[0].text, /^status_only: yes$/m);
  assert.match(targetProofPlan.result.content[0].text, /^proof_ready: /m);
  assert.match(targetProofPlan.result.content[0].text, /^missing_artifacts: /m);
  assert.match(targetProofPlan.result.content[0].text, /^next_command: /m);
  assert.doesNotMatch(targetProofPlan.result.content[0].text, /^\{/);
  assert.equal(targetProofPlan.result.structuredContent.safeMode, true);
  assert.equal(targetProofPlan.result.structuredContent.destructiveActionsIncluded, false);

  const targetApprovalResume = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1535,
    method: 'tools/call',
    params: {
      name: 'sba_target_approval_resume',
      arguments: {
        candidate: 'github',
        realExternal: true,
        format: 'compact'
      }
    }
  });
  assert.equal(targetApprovalResume.result.isError, false);
  assert.match(targetApprovalResume.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^run_requested: no$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^operator_ok_required: yes$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^opens_browser_now: no$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^starts_capture_now: no$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^target_next: /m);
  assert.match(targetApprovalResume.result.content[0].text, /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^agent_safe_next_opens_browser: no$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^agent_safe_next_starts_capture: no$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(targetApprovalResume.result.content[0].text, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
  assert.match(targetApprovalResume.result.content[0].text, /^preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
  assert.match(targetApprovalResume.result.content[0].text, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--real-external'/m);
  assert.match(targetApprovalResume.result.content[0].text, /^run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
  assert.equal(targetApprovalResume.result.structuredContent.secretValuesRead, false);
  assert.equal(targetApprovalResume.result.structuredContent.opensBrowserNow, false);
  assert.equal(targetApprovalResume.result.structuredContent.startsCaptureNow, false);
  assert.equal(targetApprovalResume.result.structuredContent.agentSafeNextCommandId, 'target-approval-preflight');
  assert.equal(targetApprovalResume.result.structuredContent.agentSafeNextMayRunUnattended, true);
  assert.equal(targetApprovalResume.result.structuredContent.agentSafeNextOpensBrowser, false);
  assert.equal(targetApprovalResume.result.structuredContent.agentSafeNextStartsCapture, false);
  assert.equal(targetApprovalResume.result.structuredContent.agentSafeNextCommand.args.includes('target-approval-preflight'), true);
  assert.equal(targetApprovalResume.result.structuredContent.preflightCommand.args.includes('target-approval-preflight'), true);
  assert.equal(targetApprovalResume.result.structuredContent.proofPlanCommand.args.includes('target-proof-plan'), true);

  const targetApprovalResumeWatch = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1536,
    method: 'tools/call',
    params: {
      name: 'sba_target_approval_resume_watch',
      arguments: {
        candidate: 'github',
        realExternal: true,
        run: true,
        in: 'operator/mcp-target-approval-resume.json',
        out: 'operator/mcp-target-approval-resume.json',
        staleAfterSeconds: -1,
        format: 'compact'
      }
    }
  });
  assert.equal(targetApprovalResumeWatch.result.isError, false);
  assert.match(targetApprovalResumeWatch.result.content[0].text, /^executed: yes$/m);
  assert.match(targetApprovalResumeWatch.result.content[0].text, /^opens_browser_now: no$/m);
  assert.match(targetApprovalResumeWatch.result.content[0].text, /^starts_capture_now: no$/m);
  assert.match(targetApprovalResumeWatch.result.content[0].text, /^after_saved_status: planned$/m);
  assert.equal(targetApprovalResumeWatch.result.structuredContent.secretValuesRead, false);
  assert.equal(targetApprovalResumeWatch.result.structuredContent.opensBrowserNow, false);
  assert.equal(targetApprovalResumeWatch.result.structuredContent.startsCaptureNow, false);

  const targetApprovalResumeStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1537,
    method: 'tools/call',
    params: {
      name: 'sba_target_approval_resume_status',
      arguments: {
        in: 'operator/mcp-target-approval-resume.json',
        format: 'compact'
      }
    }
  });
  assert.equal(targetApprovalResumeStatus.result.isError, false);
  assert.match(targetApprovalResumeStatus.result.content[0].text, /^saved_status: planned$/m);
  assert.match(targetApprovalResumeStatus.result.content[0].text, /^agent_safe_next_command_id: target-proof-plan$/m);
  assert.match(targetApprovalResumeStatus.result.content[0].text, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--real-external'/m);
  assert.equal(targetApprovalResumeStatus.result.structuredContent.agentSafeNextMayRunUnattended, true);
  assert.equal(targetApprovalResumeStatus.result.structuredContent.agentSafeNextCommand.args.includes('target-proof-plan'), true);

  const targetBootstrapPlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1532,
    method: 'tools/call',
    params: {
      name: 'sba_target_bootstrap_plan',
      arguments: {
        name: 'vendor-service',
        origin: 'https://app.vendor-service.com,https://accounts.vendor-service.com',
        loginUrl: 'https://accounts.vendor-service.com/login',
        pageUrl: 'https://app.vendor-service.com/dashboard',
        format: 'compact'
      }
    }
  });
  assert.equal(targetBootstrapPlan.result.isError, false);
  assert.match(targetBootstrapPlan.result.content[0].text, /^ready: yes$/m);
  assert.match(targetBootstrapPlan.result.content[0].text, /^secret_run_select_command: 'node' 'src\/cli\.mjs' 'secret-run-select'/m);
  assert.equal(targetBootstrapPlan.result.structuredContent.safeMode, true);

  const chromePlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_control_plan',
      arguments: {
        mcpObservationIn: 'operator/chrome-mcp-observation-latest.json',
        allowNewBackgroundTab: 'yes',
        newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
        format: 'compact'
      }
    }
  });
  assert.equal(chromePlan.result.isError, false);
  assert.match(chromePlan.result.content[0].text, /^recommended_lane: /m);
  assert.match(chromePlan.result.content[0].text, /^regular_chrome_new_background_tabs_allowed: yes$/m);
  assert.match(chromePlan.result.content[0].text, /^regular_chrome_new_background_url_env: REGULAR_CHROME_URL$/m);
  assert.match(chromePlan.result.content[0].text, /^regular_chrome_new_background_url_value_read: no$/m);
  assert.match(chromePlan.result.content[0].text, /^regular_chrome_use_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(chromePlan.result.content[0].text, /^source: https:\/\/developer\.chrome\.com\/blog\/remote-debugging-port/m);
  assert.equal(chromePlan.result.structuredContent.safeMode, true);
  assert.equal(chromePlan.result.structuredContent.secretValuesRead, false);
  assert.equal(chromePlan.result.structuredContent.regularChrome.newBackgroundUrlValueRead, false);

  const chromeMcpObservation = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 160,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_mcp_observation',
      arguments: {
        format: 'compact',
        statusText: 'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29',
        listPagesText: 'Pages:\n- 0: Example https://example.com/',
        source: 'test',
        intent: 'operate'
      }
    }
  });
  assert.equal(chromeMcpObservation.result.isError, false);
  assert.match(chromeMcpObservation.result.content[0].text, /^route_ready: yes$/m);
  assert.match(chromeMcpObservation.result.content[0].text, /^observed_page_list_ok: yes$/m);
  assert.match(chromeMcpObservation.result.content[0].text, /^secret_values_read: no$/m);
  assert.match(chromeMcpObservation.result.content[0].text, /^regular_chrome_use_write_command: .*'--write'/m);
  assert.equal(chromeMcpObservation.result.structuredContent.safeMode, true);
  assert.equal(chromeMcpObservation.result.structuredContent.secretValuesRead, false);

  const chromeMcpObservationStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1601,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_mcp_observation_status',
      arguments: {
        format: 'compact',
        in: 'operator/nonexistent-mcp-observation-test.json'
      }
    }
  });
  assert.equal(chromeMcpObservationStatus.result.isError, false);
  assert.match(chromeMcpObservationStatus.result.content[0].text, /^status: missing$/m);
  assert.match(chromeMcpObservationStatus.result.content[0].text, /^record_template_command: /m);
  assert.equal(chromeMcpObservationStatus.result.structuredContent.safeMode, true);
  assert.equal(chromeMcpObservationStatus.result.structuredContent.secretValuesRead, false);

  const chromeAppleEventsEnablePlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1602,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_apple_events_enable_plan',
      arguments: {
        format: 'compact'
      }
    }
  });
  assert.equal(chromeAppleEventsEnablePlan.result.isError, false);
  assert.match(chromeAppleEventsEnablePlan.result.content[0].text, /^changes_chrome_settings_now: no$/m);
  assert.match(chromeAppleEventsEnablePlan.result.content[0].text, /^official_help_url: https:\/\/support\.google\.com\/chrome\/\?p=applescript$/m);
  assert.match(chromeAppleEventsEnablePlan.result.content[0].text, /^status_command: 'node' 'src\/cli\.mjs' 'chrome-apple-events-status'/m);
  assert.equal(chromeAppleEventsEnablePlan.result.structuredContent.secretValuesRead, false);
  assert.equal(chromeAppleEventsEnablePlan.result.structuredContent.changesChromeSettingsNow, false);

  const chromeMcp = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 161,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_mcp_status',
      arguments: {
        format: 'compact',
        observedConnected: 'yes',
        observedTools: 29,
        observedPageListOk: 'yes',
        observedPageCount: 3,
        observedSource: 'test'
      }
    }
  });
  assert.equal(chromeMcp.result.isError, false);
  assert.match(chromeMcp.result.content[0].text, /^status: /m);
  assert.match(chromeMcp.result.content[0].text, /^observed_chrome_devtools_mcp_connected: yes$/m);
  assert.match(chromeMcp.result.content[0].text, /^observed_chrome_devtools_mcp_page_list_ok: yes$/m);
  assert.match(chromeMcp.result.content[0].text, /^chrome_devtools_mcp_usable_for_everyday_tabs: yes$/m);
  assert.match(chromeMcp.result.content[0].text, /^usable_for_everyday_chrome_tabs: yes$/m);
  assert.match(chromeMcp.result.content[0].text, /^secret_values_read: no$/m);
  assert.equal(chromeMcp.result.structuredContent.safeMode, true);
  assert.equal(chromeMcp.result.structuredContent.secretValuesRead, false);

  const chromeMcpHandoff = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 162,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_mcp_handoff',
      arguments: {
        format: 'compact',
        chromeMcpConnected: 'yes',
        chromeMcpTools: 29,
        chromeMcpPageListOk: 'yes',
        chromeMcpPageCount: 3,
        chromeMcpSource: 'test'
      }
    }
  });
  assert.equal(chromeMcpHandoff.result.isError, false);
  assert.match(chromeMcpHandoff.result.content[0].text, /^ready: yes$/m);
  assert.match(chromeMcpHandoff.result.content[0].text, /^next_tool: mcp__peekaboo__\.browser$/m);
  assert.match(chromeMcpHandoff.result.content[0].text, /^next_tool_args: \{"action":"list_pages"\}$/m);
  assert.match(chromeMcpHandoff.result.content[0].text, /^chrome_mcp_observed_page_list_ok: yes$/m);
  assert.match(chromeMcpHandoff.result.content[0].text, /^secret_values_read: no$/m);
  assert.equal(chromeMcpHandoff.result.structuredContent.safeMode, true);
  assert.equal(chromeMcpHandoff.result.structuredContent.secretValuesRead, false);

  const chromeExtension = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_extension_status',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(chromeExtension.result.isError, false);
  assert.match(chromeExtension.result.content[0].text, /^chrome_running: /m);
  assert.match(chromeExtension.result.content[0].text, /^extension_enabled: /m);
  assert.match(chromeExtension.result.content[0].text, /^secret_values_read: no$/m);
  assert.equal(chromeExtension.result.structuredContent.safeMode, true);
  assert.equal(chromeExtension.result.structuredContent.secretValuesRead, false);

  const chromeResume = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 18,
    method: 'tools/call',
    params: {
      name: 'sba_chrome_extension_resume',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(chromeResume.result.isError, false);
  assert.match(chromeResume.result.content[0].text, /^operator_ok_required: yes$/m);
  assert.match(chromeResume.result.content[0].text, /^opens_browser_now: no$/m);
  assert.equal(chromeResume.result.structuredContent.safeMode, true);
  assert.equal(chromeResume.result.structuredContent.secretValuesRead, false);

  const objectiveNext = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 19,
    method: 'tools/call',
    params: {
      name: 'sba_objective_next',
      arguments: { monitorTimeoutMs: 10000, monitorIntervalMs: 1000, format: 'compact' }
    }
  });
  assert.equal(objectiveNext.result.isError, false);
  assert.match(objectiveNext.result.content[0].text, /^primary: /m);
  assert.match(objectiveNext.result.content[0].text, /^planned_primary_opens_browser: /m);
  assert.match(objectiveNext.result.content[0].text, /^planned_primary_starts_capture: /m);
  assert.match(objectiveNext.result.content[0].text, /^primary_requires_operator_approval: /m);
  assert.match(objectiveNext.result.content[0].text, /^agent_must_not_run_primary_unattended: /m);
  assert.match(objectiveNext.result.content[0].text, /^secret_values_read: no$/m);
  if (/^manual_handoff_resume_watch_opens_browser: /m.test(objectiveNext.result.content[0].text)) {
    assert.match(objectiveNext.result.content[0].text, /^manual_handoff_resume_watch_opens_browser: no$/m);
    assert.match(objectiveNext.result.content[0].text, /^manual_handoff_resume_watch_starts_capture: yes$/m);
    assert.match(objectiveNext.result.content[0].text, /^manual_handoff_resume_watch_command: .*'--monitor-timeout-ms' '10000'.*'--monitor-interval-ms' '1000'/m);
  } else {
    // manual_* keys only appear for handoff-capture/handoff-resume states. This fixture is in
    // waiting-for-login, so assert the approval gate the state actually publishes.
    assert.match(objectiveNext.result.content[0].text, /^human_action: run-login-capture-wait$/m);
    assert.match(objectiveNext.result.content[0].text, /^primary_requires_operator_approval: yes$/m);
    assert.match(objectiveNext.result.content[0].text, /^agent_must_not_run_primary_unattended: yes$/m);
    assert.doesNotMatch(objectiveNext.result.content[0].text, /^manual_handoff_resume_watch_command: /m);
  }
  assert.equal(objectiveNext.result.structuredContent.safeMode, true);

  const objectiveHandoff = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 191,
    method: 'tools/call',
    params: {
      name: 'sba_objective_handoff',
      arguments: { monitorTimeoutMs: 10000, monitorIntervalMs: 1000, format: 'compact' }
    }
  });
  assert.equal(objectiveHandoff.result.isError, false);
  assert.match(objectiveHandoff.result.content[0].text, /^primary: /m);
  assert.match(objectiveHandoff.result.content[0].text, /^secret_values_read: no$/m);
  if (/^manual_handoff_resume_watch_command: /m.test(objectiveHandoff.result.content[0].text)) {
    assert.match(objectiveHandoff.result.content[0].text, /^manual_handoff_resume_watch_command: .*'--monitor-timeout-ms' '10000'.*'--monitor-interval-ms' '1000'/m);
  } else {
    // Same reason as above: this fixture never reaches a handoff-* action, so the manual_*
    // command block is not published. Assert the primary the handoff actually names.
    assert.match(objectiveHandoff.result.content[0].text, /^human_action: run-login-capture-wait$/m);
    assert.match(objectiveHandoff.result.content[0].text, /^primary: primary-action$/m);
    assert.doesNotMatch(objectiveHandoff.result.content[0].text, /^manual_handoff_resume_watch_command: /m);
  }
  assert.match(objectiveHandoff.result.structuredContent.commands.find((item) => item.id === 'objective-next').shell, /'--monitor-timeout-ms' '10000'.*'--monitor-interval-ms' '1000'/);
  assert.equal(objectiveHandoff.result.structuredContent.safeMode, true);

  const providers = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 190,
    method: 'tools/call',
    params: {
      name: 'sba_providers',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(providers.result.isError, false);
  assert.match(providers.result.content[0].text, /^default_backend: /m);
  assert.match(providers.result.content[0].text, /^provider_adoption_next: /m);
  assert.match(providers.result.content[0].text, /^lightpanda_next: /m);
  assert.match(providers.result.content[0].text, /^playwright_next: /m);
  assert.match(providers.result.content[0].text, /^selenium_next: /m);
  assert.match(providers.result.content[0].text, /^lightpanda_binary_present: /m);
  assert.match(providers.result.content[0].text, /^backend_matrix_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--format' 'compact'$/m);
  assert.match(providers.result.content[0].text, /^lightpanda_doctor_command: 'node' 'src\/cli\.mjs' 'lightpanda-doctor' '--format' 'compact'$/m);
  assert.match(providers.result.content[0].text, /^playwright_doctor_command: 'node' 'src\/cli\.mjs' 'playwright-doctor' '--format' 'compact'$/m);
  assert.match(providers.result.content[0].text, /^selenium_doctor_command: 'node' 'src\/cli\.mjs' 'selenium-doctor' '--format' 'compact'$/m);
  assert.match(providers.result.content[0].text, /^decision: /m);
  assert.equal(Array.isArray(providers.result.structuredContent.providers), true);

  const cleanup = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'sba_runtime_cleanup_plan',
      arguments: { ownerLimit: 1, format: 'compact' }
    }
  });

  assert.equal(cleanup.result.isError, false);
  assert.equal(cleanup.result.structuredContent.safeMode, true);
  assert.match(cleanup.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(cleanup.result.content[0].text, /^destructive_actions: no$/m);
  assert.doesNotMatch(cleanup.result.content[0].text, /^\{/);

  const secretAudit = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'sba_secret_audit',
      arguments: { format: 'compact' }
    }
  });
  assert.equal(secretAudit.result.isError, false);
  assert.match(secretAudit.result.content[0].text, /^headless_ready: /m);
  assert.equal(secretAudit.result.structuredContent.secretValuesRead, false);

  const secretSetupPlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'sba_secret_setup_plan',
      arguments: { mode: 'connect', format: 'compact' }
    }
  });
  assert.equal(secretSetupPlan.result.isError, false);
  assert.match(secretSetupPlan.result.content[0].text, /^mode: connect$/m);
  assert.equal(secretSetupPlan.result.structuredContent.secretValuesRead, false);

  const secretRunPlan = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: {
      name: 'sba_secret_run_plan',
      arguments: {
        mode: 'service-account',
        command: 'control-status',
        format: 'compact'
      }
    }
  });
  assert.equal(secretRunPlan.result.isError, false);
  assert.match(secretRunPlan.result.content[0].text, /^command_id: control-status$/m);
  assert.match(secretRunPlan.result.content[0].text, /^run: (?:'op' 'run' '--' 'node'|'sh' '-lc' .*'op.*'run)/m);
  assert.doesNotMatch(secretRunPlan.result.content[0].text, /OP_SERVICE_ACCOUNT_TOKEN=/);
  assert.equal(secretRunPlan.result.structuredContent.secretValuesRead, false);

  const secretRunSelect = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 171,
    method: 'tools/call',
    params: {
      name: 'sba_secret_run_select',
      arguments: {
        command: 'control-status',
        format: 'compact'
      }
    }
  });
  assert.equal(secretRunSelect.result.isError, false);
  assert.match(secretRunSelect.result.content[0].text, /^selected_mode: /m);
  assert.match(secretRunSelect.result.content[0].text, /^ready_to_run_now: /m);
  assert.match(secretRunSelect.result.content[0].text, /^run_requires_operator_approval: /m);
  assert.match(secretRunSelect.result.content[0].text, /^run_agent_may_run_unattended: /m);
  assert.match(secretRunSelect.result.content[0].text, /^run_command: /m);
  assert.doesNotMatch(secretRunSelect.result.content[0].text, /OP_SERVICE_ACCOUNT_TOKEN=/);
  assert.equal(secretRunSelect.result.structuredContent.secretValuesRead, false);
  assert.equal(secretRunSelect.result.structuredContent.readsSecretValues, false);

  const secretEnvOut = `operator/secret-env-handoff-${Date.now()}.json`;
  const secretEnvHandoffWatch = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 172,
    method: 'tools/call',
    params: {
      name: 'sba_secret_env_handoff_watch',
      arguments: {
        run: true,
        in: secretEnvOut,
        out: secretEnvOut,
        format: 'compact'
      }
    }
  });
  assert.equal(secretEnvHandoffWatch.result.isError, false);
  assert.match(secretEnvHandoffWatch.result.content[0].text, /^safe_mode: yes$/m);
  assert.match(secretEnvHandoffWatch.result.content[0].text, /^secret_values_read: no$/m);
  assert.match(secretEnvHandoffWatch.result.content[0].text, /^opens_browser_now: no$/m);
  assert.equal(secretEnvHandoffWatch.result.structuredContent.secretValuesRead, false);
  assert.equal(secretEnvHandoffWatch.result.structuredContent.opensBrowserNow, false);

  const secretEnvHandoffStatus = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 173,
    method: 'tools/call',
    params: {
      name: 'sba_secret_env_handoff_status',
      arguments: {
        in: secretEnvOut,
        format: 'compact'
      }
    }
  });
  assert.equal(secretEnvHandoffStatus.result.isError, false);
  assert.match(secretEnvHandoffStatus.result.content[0].text, /^exists: yes$/m);
  assert.match(secretEnvHandoffStatus.result.content[0].text, /^parse_ok: yes$/m);
  assert.match(secretEnvHandoffStatus.result.content[0].text, /^refresh_command: 'node' 'src\/cli\.mjs' 'secret-env-handoff-watch'/m);
  assert.equal(secretEnvHandoffStatus.result.structuredContent.secretValuesRead, false);

  const proofNext = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 18,
    method: 'tools/call',
    params: {
      name: 'sba_target_proof_next',
      arguments: { realExternal: true, format: 'compact' }
    }
  });
  assert.equal(proofNext.result.isError, false);
  assert.match(proofNext.result.content[0].text, /^complete: /m);
  assert.match(proofNext.result.content[0].text, /^next: /m);
  assert.match(proofNext.result.content[0].text, /^auth_usable: /m);
  assert.match(proofNext.result.content[0].text, /^profile_auth_metadata_only: /m);
  assert.match(proofNext.result.content[0].text, /^missing_artifact_count: /m);
  assert.match(proofNext.result.content[0].text, /^missing_artifacts: /m);
  assert.match(proofNext.result.content[0].text, /^secret_values_read: no$/m);
  assert.equal(proofNext.result.structuredContent.safeMode, true);
  } finally {
    process.env.SBA_ROOT_DIR = oldEnv;
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
});

test('mcp server reuses read-only status cache within ttl', async () => {
  const previousTtl = process.env.SBA_MCP_CACHE_TTL_MS;
  process.env.SBA_MCP_CACHE_TTL_MS = '60000';
  try {
    const source = `cache-test-${Date.now()}`;
    const first = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 600,
      method: 'tools/call',
      params: {
        name: 'sba_chrome_mcp_status',
        arguments: {
          observedConnected: 'yes',
          observedPageListOk: 'no',
          observedLastError: 'Network.enable timed out',
          observedSource: source,
          format: 'compact'
        }
      }
    });
    const second = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 601,
      method: 'tools/call',
      params: {
        name: 'sba_chrome_mcp_status',
        arguments: {
          observedConnected: 'yes',
          observedPageListOk: 'no',
          observedLastError: 'Network.enable timed out',
          observedSource: source,
          format: 'compact'
        }
      }
    });
    assert.equal(first.result.isError, false);
    assert.equal(second.result.isError, false);
    assert.equal(first.result.structuredContent.generatedAt, second.result.structuredContent.generatedAt);
    assert.match(second.result.content[0].text, /^status: mcp-connected-page-list-timeout/m);
  } finally {
    if (previousTtl === undefined) delete process.env.SBA_MCP_CACHE_TTL_MS;
    else process.env.SBA_MCP_CACHE_TTL_MS = previousTtl;
  }
});

test('mcp server calls profile status without reading secret values', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'sba_profile_status',
      arguments: { profile: 'public' }
    }
  });
  assert.equal(response.id, 3);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.profile, 'public');
  assert.ok(Array.isArray(response.result.structuredContent.artifacts));
});

test('mcp server calls objective handoff as a safe operator handoff', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'sba_objective_handoff',
      arguments: {}
    }
  });

  assert.equal(response.id, 9);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.safeMode, true);
  assert.equal(response.result.structuredContent.destructiveActionsIncluded, false);
  assert.ok(Array.isArray(response.result.structuredContent.commands));
  assert.ok(response.result.structuredContent.commands.some((item) => item.id === 'completion-audit'));
  assert.ok(response.result.structuredContent.instructions.join('\n').includes('Do not paste credentials'));
});

test('mcp server returns compact objective handoff text without dropping structured content', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 19,
    method: 'tools/call',
    params: {
      name: 'sba_objective_handoff',
      arguments: { format: 'compact' }
    }
  });

  assert.equal(response.id, 19);
  assert.equal(response.result.isError, false);
  assert.match(response.result.content[0].text, /^complete: /m);
  assert.match(response.result.content[0].text, /^primary: primary-action$/m);
  assert.match(response.result.content[0].text, /^secret_values_read: no$/m);
  assert.equal(response.result.structuredContent.safeMode, true);
});

test('mcp server returns protocol errors for unknown methods and tools', async () => {
  const unknownMethod = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'unknown'
  });
  assert.equal(unknownMethod.error.code, -32601);

  const unknownTool = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'missing_tool', arguments: {} }
  });
  assert.equal(unknownTool.error.code, -32000);
  assert.match(unknownTool.error.message, /Unknown tool/);
});
