import fs from 'node:fs';
import path from 'node:path';
import { buildProviderReport } from './provider-report.mjs';
import { buildPlaywrightDoctor } from './playwright-doctor.mjs';
import { buildSourceAudit } from './source-audit.mjs';
import { findTargetProofs, isAcceptedExternalProof } from './target-proof.mjs';
import { findProviderBenchmarkProofs, lightpandaPublicBenchmarkDecision } from './provider-benchmark.mjs';
import { buildSeleniumDoctor } from './selenium-doctor.mjs';
import { buildSecretAudit, buildSecretRunSelect } from './secret-audit.mjs';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';
import { buildRunGateAudit } from './run-gate-audit.mjs';

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function hasAll(value, needles) {
  return needles.every((needle) => value.includes(needle));
}

function statusFrom(pass, partial = false) {
  if (pass) return 'proved';
  if (partial) return 'partial';
  return 'missing';
}

function requirement({ id, requirement, status, evidence, next = '' }) {
  return {
    id,
    requirement,
    status,
    evidence: evidence.filter(Boolean),
    ...(next ? { next } : {})
  };
}

function commandEvidence(cliText, commands) {
  return commands.filter((command) => cliText.includes(`command === '${command}'`) || cliText.includes(`  ${command}`));
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compactEvidence(item = {}, key) {
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const prefix = `${key}=`;
  const found = evidence.find((line) => String(line).startsWith(prefix));
  return found ? found.slice(prefix.length) || 'none' : 'none';
}

export function buildReadinessAudit(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const packageJson = readJson(path.join(rootDir, 'package.json')) || {};
  const scripts = packageJson.scripts || {};
  const cliText = readText(path.join(rootDir, 'src/cli.mjs'));
  const mcpText = readText(path.join(rootDir, 'src/mcp-server.mjs'));
  const controlStatusText = readText(path.join(rootDir, 'src/control-status.mjs'));
  const policy = readJson(path.join(rootDir, 'config/example-policy.json')) || {};
  const gitignore = readText(path.join(rootDir, '.gitignore'));
  const verifyScript = readText(path.join(rootDir, 'scripts/verify.sh'));
  const mcpCompactSmokeScript = readText(path.join(rootDir, 'scripts/mcp-compact-smoke.mjs'));
  const providerReport = options.providerReport || buildProviderReport({ rootDir, env: options.env || process.env });
  const playwrightDoctor = options.playwrightDoctor || buildPlaywrightDoctor({ rootDir, env: options.env || process.env });
  const sourceAudit = options.sourceAudit || buildSourceAudit({ rootDir, env: options.env || process.env });
  const seleniumDoctor = options.seleniumDoctor || buildSeleniumDoctor({ rootDir, env: options.env || process.env });
  const secretAudit = options.secretAudit || buildSecretAudit({ env: options.env || process.env });
  const secretRunSelect = options.secretRunSelect || buildSecretRunSelect({
    command: 'target-login-capture',
    targetDir: 'runs/target-packs/github',
    audit: secretAudit,
    env: options.env || process.env
  });
  const chromeExtensionStatus = options.chromeExtensionStatus || buildChromeExtensionStatus({
    ...options,
    env: options.env || process.env
  });
  const runGateAudit = options.runGateAudit || buildRunGateAudit({ generatedAt });
  const targetProofs = options.targetProofs || findTargetProofs(rootDir);
  const providerBenchmarkProofs = options.providerBenchmarkProofs || findProviderBenchmarkProofs(rootDir);
  const acceptedExternalProofs = targetProofs.filter((item) => isAcceptedExternalProof(item.proof));
  const lightpandaBenchmarkProofs = providerBenchmarkProofs
    .map((item) => ({ ...item, decision: lightpandaPublicBenchmarkDecision(item.report) }))
    .filter((item) => item.decision?.ok);
  const lightpandaStatus = providerReport.status?.lightpanda || providerReport.localStatus?.lightpanda || {};

  const cliCommands = {
    provider: commandEvidence(cliText, ['providers', 'provider-doctor-status', 'benchmark', 'source-audit', 'runtime-audit', 'runtime-cleanup-plan', 'run-gate-audit', 'compact-command-audit', 'lightpanda-doctor', 'selenium-doctor', 'secret-audit', 'secret-run-plan', 'secret-run-select', 'secret-env-handoff', 'agent-next', 'agent-preflight', 'agent-proof-checklist', 'agent-proof-checklist-status', 'agent-proof-closeout', 'agent-proof-closeout-status', 'control-status', 'agent-workflow', 'agent-backend-select', 'agent-control-plane', 'agent-control-plane-status', 'agent-control-plane-watch', 'agent-task', 'agent-task-status', 'agent-loop-step', 'chrome-control-plan', 'chrome-mcp-observation', 'chrome-mcp-status', 'chrome-mcp-handoff', 'chrome-mcp-timeout-plan', 'regular-chrome-use', 'regular-chrome-refresh', 'regular-chrome-status', 'regular-chrome-watch', 'browser-route', 'backend-matrix', 'backend-matrix-status', 'chrome-apple-events-status', 'chrome-apple-events-enable-plan', 'chrome-apple-events-outline', 'chrome-extension-status', 'chrome-extension-handoff', 'chrome-extension-resume', 'chrome-extension-troubleshoot', 'chrome-extension-backend-check-plan', 'chrome-extension-claim-plan', 'objective-safe-command', 'objective-proof-pipeline', 'background-proof-capture-plan', 'background-proof-capture-status', 'target-approval-preflight', 'operator-runbook']),
    target: commandEvidence(cliText, ['scaffold-target', 'target-doctor', 'target-audit', 'target-status', 'target-login', 'target-login-capture', 'target-handoff-status', 'target-handoff-run', 'target-handoff-resume', 'target-permissions', 'target-bootstrap-plan', 'target-candidate-plan', 'target-approval-pack', 'target-approval-status', 'target-approval-resume', 'target-auth-check', 'target-auth-watch', 'target-proof-inventory', 'target-proof-next', 'target-proof-plan', 'target-proof-capture']),
    operate: commandEvidence(cliText, ['search-cdp', 'fill-cdp', 'click-cdp', 'wait-cdp', 'analyze-cdp', 'inspect-cdp', 'scrape-cdp', 'run-cdp']),
    background: commandEvidence(cliText, ['cdp-start', 'cdp-status', 'cdp-stop', 'target-daemon', 'target-autostart'])
  };

  const mcpTools = [
    'sba_profile_status',
    'sba_agent_next',
    'sba_agent_preflight',
    'sba_agent_proof_checklist',
    'sba_agent_proof_checklist_status',
    'sba_agent_proof_closeout',
    'sba_agent_proof_closeout_status',
    'sba_control_status',
    'sba_agent_workflow',
    'sba_agent_backend_select',
    'sba_agent_control_plane',
    'sba_agent_control_plane_status',
    'sba_agent_control_plane_watch',
    'sba_agent_task',
    'sba_agent_task_status',
    'sba_agent_task_watch',
    'sba_agent_task_loop',
    'sba_agent_task_watch_start',
    'sba_agent_task_watch_status',
    'sba_agent_loop_step',
    'sba_agent_loop_step_status',
    'sba_chrome_control_plan',
    'sba_chrome_mcp_observation',
    'sba_chrome_mcp_status',
    'sba_chrome_mcp_handoff',
    'sba_chrome_mcp_timeout_plan',
    'sba_regular_chrome_use',
    'sba_regular_chrome_refresh',
    'sba_regular_chrome_status',
    'sba_regular_chrome_watch',
    'sba_browser_route',
    'sba_chrome_apple_events_status',
    'sba_chrome_apple_events_enable_plan',
    'sba_chrome_apple_events_outline',
    'sba_chrome_extension_status',
    'sba_chrome_extension_handoff',
    'sba_chrome_extension_resume',
    'sba_chrome_extension_troubleshoot',
    'sba_chrome_extension_backend_check_plan',
    'sba_chrome_extension_claim_plan',
    'sba_target_status',
    'sba_target_audit',
    'sba_target_permissions',
    'sba_target_daemon',
    'sba_target_run',
    'sba_target_scrape',
    'sba_cdp_analyze',
    'sba_runtime_audit',
    'sba_runtime_cleanup_plan',
    'sba_run_gate_audit',
    'sba_compact_command_audit',
    'sba_source_audit',
    'sba_lightpanda_doctor',
    'sba_lightpanda_decision',
    'sba_selenium_doctor',
    'sba_secret_audit',
    'sba_secret_setup_plan',
    'sba_secret_run_plan',
    'sba_secret_run_select',
    'sba_secret_env_handoff',
    'sba_provider_benchmark',
    'sba_backend_matrix',
    'sba_backend_matrix_status',
    'sba_readiness_audit',
    'sba_objective_completion_audit',
    'sba_objective_safe_command',
    'sba_objective_proof_pipeline',
    'sba_objective_handoff',
    'sba_operator_pack',
    'sba_operator_runbook',
    'sba_objective_next',
    'sba_objective_status',
    'sba_proof_gate_status',
    'sba_proof_gate_watch',
    'sba_background_proof_capture_plan',
    'sba_background_proof_capture_status',
    'sba_background_proof_capture_start',
    'sba_objective_resume',
    'sba_target_benchmark',
    'sba_target_bootstrap_plan',
    'sba_target_candidate_plan',
    'sba_target_approval_pack',
    'sba_target_approval_status',
    'sba_target_approval_preflight',
    'sba_target_approval_resume',
    'sba_target_auth_check',
    'sba_target_auth_watch',
    'sba_target_proof_inventory',
    'sba_target_proof_next',
    'sba_target_proof_plan',
    'sba_target_proof_capture',
    'sba_target_login_capture',
    'sba_target_handoff_status',
    'sba_target_handoff_run',
    'sba_target_handoff_resume',
    'sba_target_proof'
  ].filter((tool) => mcpText.includes(tool));

  const hasPolicyBoundary = Array.isArray(policy.allowedOrigins)
    && Array.isArray(policy.authenticatedEngines)
    && policy.authenticatedEngines.includes('chrome')
    && policy.profileDir === 'profiles'
    && policy.outputDir === 'runs'
    && gitignore.includes('profiles/')
    && gitignore.includes('runs/');

  const hasTargetAuthSmoke = exists(path.join(rootDir, 'scripts/target-auth-smoke.mjs'))
    && scripts['probe:target-auth']
    && verifyScript.includes('target-auth-smoke.mjs');
  const hasBenchmarkSmoke = scripts['probe:benchmark'] && scripts['probe:target-benchmark'] && verifyScript.includes('target-benchmark');
  const hasRuntimeAudit = scripts['probe:runtime-audit'] && cliCommands.provider.includes('runtime-audit');
  const hasRuntimeCleanupPlan = scripts['probe:runtime-cleanup-plan'] && cliCommands.provider.includes('runtime-cleanup-plan') && mcpTools.includes('sba_runtime_cleanup_plan');
  const hasRunGateAudit = scripts['probe:run-gate-audit']
    && cliCommands.provider.includes('run-gate-audit')
    && mcpTools.includes('sba_run_gate_audit')
    && runGateAudit.summary?.okForAgentLoops === true
    && Number(runGateAudit.summary?.unguardedAgentDangerous || 0) === 0;
  const hasMcpCompactSmoke = scripts['probe:mcp-compact']
    && exists(path.join(rootDir, 'scripts/mcp-compact-smoke.mjs'))
    && scripts.verify?.includes('probe:mcp-compact');
  const hasMcpNextActionCompactSmoke = hasMcpCompactSmoke
    && mcpCompactSmokeScript.includes('sba_agent_next')
    && mcpCompactSmokeScript.includes('sba_agent_preflight')
    && mcpCompactSmokeScript.includes('sba_agent_proof_checklist')
    && mcpCompactSmokeScript.includes('sba_agent_proof_checklist_status')
    && mcpCompactSmokeScript.includes('sba_agent_proof_closeout')
    && mcpCompactSmokeScript.includes('sba_agent_proof_closeout_status')
    && mcpCompactSmokeScript.includes('sba_objective_next')
    && mcpCompactSmokeScript.includes('sba_target_proof_next')
    && mcpCompactSmokeScript.includes('sba_proof_gate_status')
    && mcpCompactSmokeScript.includes('sba_proof_gate_watch');
  const hasMcpHandoffCompactSmoke = hasMcpCompactSmoke
    && mcpCompactSmokeScript.includes('sba_objective_handoff')
    && mcpCompactSmokeScript.includes('sba_operator_pack')
    && mcpCompactSmokeScript.includes('sba_operator_runbook');
  const hasMcpChromeControlPlanCompactSmoke = hasMcpCompactSmoke
    && mcpCompactSmokeScript.includes('sba_chrome_control_plan');
  const hasMcpBrowserRouteCompactSmoke = hasMcpCompactSmoke
    && mcpCompactSmokeScript.includes('sba_browser_route');
  const hasMcpChromeExtensionStatusCompactSmoke = hasMcpCompactSmoke
    && mcpCompactSmokeScript.includes('sba_chrome_extension_status');
  const hasMcpChromeExtensionHandoffCompactSmoke = hasMcpCompactSmoke
    && mcpCompactSmokeScript.includes('sba_chrome_extension_handoff');
  const hasMcpChromeExtensionResumeCompactSmoke = hasMcpCompactSmoke
    && mcpCompactSmokeScript.includes('sba_chrome_extension_resume');
  const hasControlStatus = scripts['probe:control-status'] && cliCommands.provider.includes('control-status');
  const hasControlStatusMcp = mcpTools.includes('sba_control_status');
  const hasAgentNext = scripts['probe:agent-next'] && cliCommands.provider.includes('agent-next');
  const hasAgentNextMcp = mcpTools.includes('sba_agent_next');
  const hasAgentNextProofPlan = hasAgentNext
    && controlStatusText.includes('agentProofPlanCommand')
    && controlStatusText.includes('operatorApprovalProofPlanCommand')
    && mcpCompactSmokeScript.includes('agent_proof_plan_available')
    && mcpCompactSmokeScript.includes('operator_approval_proof_plan_opens_browser');
  const hasAgentPreflight = scripts['probe:agent-preflight'] && cliCommands.provider.includes('agent-preflight');
  const hasAgentPreflightMcp = mcpTools.includes('sba_agent_preflight');
  const hasAgentProofChecklist = scripts['probe:agent-proof-checklist'] && cliCommands.provider.includes('agent-proof-checklist');
  const hasAgentProofChecklistStatus = scripts['probe:agent-proof-checklist-status'] && cliCommands.provider.includes('agent-proof-checklist-status');
  const hasAgentProofCloseout = scripts['probe:agent-proof-closeout'] && cliCommands.provider.includes('agent-proof-closeout');
  const hasAgentProofCloseoutStatus = scripts['probe:agent-proof-closeout-status'] && cliCommands.provider.includes('agent-proof-closeout-status');
  const hasAgentProofChecklistMcp = mcpTools.includes('sba_agent_proof_checklist');
  const hasAgentProofChecklistStatusMcp = mcpTools.includes('sba_agent_proof_checklist_status');
  const hasAgentProofCloseoutMcp = mcpTools.includes('sba_agent_proof_closeout');
  const hasAgentProofCloseoutStatusMcp = mcpTools.includes('sba_agent_proof_closeout_status');
  const hasAgentWorkflow = cliCommands.provider.includes('agent-workflow');
  const hasAgentWorkflowMcp = mcpTools.includes('sba_agent_workflow');
  const hasAgentBackendSelect = cliCommands.provider.includes('agent-backend-select');
  const hasAgentBackendSelectMcp = mcpTools.includes('sba_agent_backend_select');
  const hasAgentControlPlane = scripts['probe:agent-control-plane'] && cliCommands.provider.includes('agent-control-plane');
  const hasAgentControlPlaneMcp = mcpTools.includes('sba_agent_control_plane');
  const hasAgentControlPlaneStatus = scripts['probe:agent-control-plane-status'] && cliCommands.provider.includes('agent-control-plane-status');
  const hasAgentControlPlaneStatusMcp = mcpTools.includes('sba_agent_control_plane_status');
  const hasAgentControlPlaneWatch = scripts['probe:agent-control-plane-watch'] && cliCommands.provider.includes('agent-control-plane-watch');
  const hasAgentControlPlaneWatchMcp = mcpTools.includes('sba_agent_control_plane_watch');
  const hasAgentTask = cliCommands.provider.includes('agent-task');
  const hasAgentTaskMcp = mcpTools.includes('sba_agent_task');
  const hasAgentTaskWatchMcp = mcpTools.includes('sba_agent_task_watch') && mcpTools.includes('sba_agent_task_loop');
  const hasAgentLoopStep = cliCommands.provider.includes('agent-loop-step');
  const hasAgentLoopStepMcp = mcpTools.includes('sba_agent_loop_step');
  const hasBackendMatrix = scripts['probe:backend-matrix'] && cliCommands.provider.includes('backend-matrix');
  const hasBackendMatrixMcp = mcpTools.includes('sba_backend_matrix') && mcpTools.includes('sba_backend_matrix_status');
  const hasObjectiveSafeCommand = cliCommands.provider.includes('objective-safe-command') && mcpTools.includes('sba_objective_safe_command');
  const hasObjectiveProofPipeline = scripts['probe:objective-proof-pipeline'] && cliCommands.provider.includes('objective-proof-pipeline');
  const hasObjectiveProofPipelineMcp = mcpTools.includes('sba_objective_proof_pipeline');
  const hasBackgroundProofMcp = mcpTools.includes('sba_background_proof_capture_plan')
    && mcpTools.includes('sba_background_proof_capture_status')
    && mcpTools.includes('sba_background_proof_capture_start');
  const hasOperatorRunbook = scripts['probe:operator-runbook'] && cliCommands.provider.includes('operator-runbook');
  const hasOperatorRunbookMcp = mcpTools.includes('sba_operator_runbook');
  const hasChromeControlPlan = scripts['probe:chrome-control-plan'] && cliCommands.provider.includes('chrome-control-plan');
  const hasChromeControlPlanMcp = mcpTools.includes('sba_chrome_control_plan');
  const hasBrowserRoute = scripts['probe:browser-route'] && cliCommands.provider.includes('browser-route');
  const hasBrowserRouteMcp = mcpTools.includes('sba_browser_route');
  const hasChromeExtensionStatus = scripts['probe:chrome-extension-status'] && cliCommands.provider.includes('chrome-extension-status');
  const hasChromeExtensionStatusMcp = mcpTools.includes('sba_chrome_extension_status');
  const hasChromeExtensionHandoff = scripts['probe:chrome-extension-handoff'] && cliCommands.provider.includes('chrome-extension-handoff');
  const hasChromeExtensionHandoffMcp = mcpTools.includes('sba_chrome_extension_handoff');
  const hasChromeExtensionResume = scripts['probe:chrome-extension-resume'] && cliCommands.provider.includes('chrome-extension-resume');
  const hasChromeExtensionResumeMcp = mcpTools.includes('sba_chrome_extension_resume');
  const hasChromeAppleEventsStatus = scripts['probe:chrome-apple-events-status'] && cliCommands.provider.includes('chrome-apple-events-status');
  const hasChromeAppleEventsStatusMcp = mcpTools.includes('sba_chrome_apple_events_status');
  const hasChromeAppleEventsEnablePlan = scripts['probe:chrome-apple-events-enable-plan'] && cliCommands.provider.includes('chrome-apple-events-enable-plan');
  const hasChromeAppleEventsEnablePlanMcp = mcpTools.includes('sba_chrome_apple_events_enable_plan');
  const hasChromeAppleEventsOutline = scripts['probe:chrome-apple-events-outline'] && cliCommands.provider.includes('chrome-apple-events-outline');
  const hasChromeAppleEventsOutlineMcp = mcpTools.includes('sba_chrome_apple_events_outline');
  const hasSourceAudit = scripts['probe:sources'] && sourceAudit.summary?.presentTargets > 0;
  const hasLightpandaDoctor = scripts['probe:lightpanda-doctor'] && cliCommands.provider.includes('lightpanda-doctor');
  const hasLightpandaDoctorMcp = mcpTools.includes('sba_lightpanda_doctor');
  const hasSeleniumDoctor = scripts['probe:selenium-doctor'] && cliCommands.provider.includes('selenium-doctor');
  const hasSeleniumDoctorMcp = mcpTools.includes('sba_selenium_doctor');
  const hasSecretAudit = scripts['probe:secret-audit'] && cliCommands.provider.includes('secret-audit');
  const hasSecretSetupPlan = scripts['probe:secret-setup-plan'] && cliText.includes(`command === 'secret-setup-plan'`);
  const hasSecretRunPlan = scripts['probe:secret-run-plan'] && cliText.includes(`command === 'secret-run-plan'`);
  const hasSecretRunSelect = scripts['probe:secret-run-select'] && cliText.includes(`command === 'secret-run-select'`);
  const hasSecretEnvHandoff = scripts['probe:secret-env-handoff'] && cliText.includes(`command === 'secret-env-handoff'`);
  const hasSecretAuditMcp = mcpTools.includes('sba_secret_audit');
  const hasSecretSetupPlanMcp = mcpTools.includes('sba_secret_setup_plan');
  const hasSecretRunPlanMcp = mcpTools.includes('sba_secret_run_plan');
  const hasSecretRunSelectMcp = mcpTools.includes('sba_secret_run_select');
  const hasSecretEnvHandoffMcp = mcpTools.includes('sba_secret_env_handoff');
  const hasCoreAgentInterface = exists(path.join(rootDir, 'src/mcp-server.mjs'))
    && hasAgentNext
    && hasAgentNextMcp
    && hasAgentPreflight
    && hasAgentPreflightMcp
    && hasAgentProofChecklist
    && hasAgentProofChecklistStatus
    && hasAgentProofCloseout
    && hasAgentProofCloseoutStatus
    && hasAgentProofChecklistMcp
    && hasAgentProofChecklistStatusMcp
    && hasAgentProofCloseoutMcp
    && hasAgentProofCloseoutStatusMcp
    && hasControlStatus
    && hasControlStatusMcp
    && hasAgentControlPlane
    && hasAgentControlPlaneMcp
    && hasAgentControlPlaneStatus
    && hasAgentControlPlaneStatusMcp
    && hasAgentControlPlaneWatch
    && hasAgentControlPlaneWatchMcp
    && hasRunGateAudit
    && hasMcpCompactSmoke
    && hasMcpNextActionCompactSmoke;

  const requirements = [
    requirement({
      id: 'provider-decision',
      requirement: 'Choose and justify a default backend across Chrome MCP, direct CDP, Playwright, Lightpanda, and Selenium.',
      status: statusFrom(providerReport.recommendation?.defaultBackend === 'direct-cdp-chrome' && providerReport.providers?.length >= 5),
      evidence: [
        `defaultBackend=${providerReport.recommendation?.defaultBackend || 'unknown'}`,
        `defaultAgentInterface=${providerReport.recommendation?.defaultAgentInterface || 'unknown'}`,
        `providerAdoptionNext=${providerReport.recommendation?.adoptionNext || 'unknown'}`,
        `lightpandaNext=${providerReport.recommendation?.lightpandaNext || 'unknown'}`,
        `playwrightNext=${providerReport.recommendation?.playwrightNext || 'unknown'}`,
        `playwrightReadyForPublicSmoke=${Boolean(playwrightDoctor.readyForPublicSmoke)}`,
        `playwrightPublicSmokeProofOk=${Boolean(playwrightDoctor.publicSmokeProof?.ok)}`,
        `playwrightPublicSmokeProofPath=${playwrightDoctor.publicSmokeProof?.path || 'missing'}`,
        `playwrightSmokeProofCommand=${playwrightDoctor.smokeProofCommand || 'missing'}`,
        `playwrightSmokeProofAgentMayRunUnattended=${Boolean(playwrightDoctor.smokeProofAgentMayRunUnattended)}`,
        `playwrightSmokeProofStartsBrowser=${Boolean(playwrightDoctor.smokeProofStartsBrowser)}`,
        `playwrightSmokeProofReadsBrowserStorage=${Boolean(playwrightDoctor.smokeProofReadsBrowserStorage)}`,
        `seleniumNext=${providerReport.recommendation?.seleniumNext || 'unknown'}`,
        `providers=${providerReport.providers?.map((item) => item.id).join(',') || 'none'}`,
        `sources=${providerReport.sources?.length || 0}`,
        `seleniumDoctor=${hasSeleniumDoctor && hasSeleniumDoctorMcp ? 'present' : 'missing'}`
      ],
      next: 'Re-run providers after changing provider versions or credential boundaries.'
    }),
    requirement({
      id: 'credential-boundary',
      requirement: 'Keep authenticated user state in dedicated target profiles with allowlisted origins and redacted outputs.',
      status: statusFrom(hasPolicyBoundary && cliCommands.target.length >= 6),
      evidence: [
        `authenticatedEngines=${(policy.authenticatedEngines || []).join(',') || 'none'}`,
        `profileDir=${policy.profileDir || 'missing'}`,
        `outputDir=${policy.outputDir || 'missing'}`,
        `.gitignore profiles/runs=${gitignore.includes('profiles/') && gitignore.includes('runs/')}`,
        `targetCommands=${cliCommands.target.join(',')}`,
        `secretAudit=${hasSecretAudit ? 'present' : 'missing'}`,
        `mcpSecretAudit=${hasSecretAuditMcp ? 'present' : 'missing'}`,
        `secretSetupPlan=${hasSecretSetupPlan ? 'present' : 'missing'}`,
        `mcpSecretSetupPlan=${hasSecretSetupPlanMcp ? 'present' : 'missing'}`,
        `secretRunPlan=${hasSecretRunPlan ? 'present' : 'missing'}`,
        `secretRunSelect=${hasSecretRunSelect ? 'present' : 'missing'}`,
        `secretEnvHandoff=${hasSecretEnvHandoff ? 'present' : 'missing'}`,
        `mcpSecretRunPlan=${hasSecretRunPlanMcp ? 'present' : 'missing'}`,
        `mcpSecretRunSelect=${hasSecretRunSelectMcp ? 'present' : 'missing'}`,
        `mcpSecretEnvHandoff=${hasSecretEnvHandoffMcp ? 'present' : 'missing'}`,
        `onePasswordHeadlessReady=${Boolean(secretAudit.headlessReady)}`,
        `headlessConfigAvailable=${Boolean(secretAudit.headlessConfigAvailable)}`,
        `onePasswordMode=${secretAudit.recommendedHeadlessMode || 'unknown'}`,
        `secretRunReady=${Boolean(secretRunSelect.readyToRunNow)}`,
        `secretRunCandidate=${secretRunSelect.selectedCandidate || 'unknown'}`,
        `secretRunHeadless=${Boolean(secretRunSelect.headless)}`,
        `secretValuesRead=${Boolean(secretAudit.secretValuesRead)}`
      ],
      next: 'Run target-audit before any real account target pack.'
    }),
    requirement({
      id: 'agent-interface',
      requirement: 'Expose low-token browser operations through a bounded CLI and MCP tool surface.',
      status: statusFrom(hasCoreAgentInterface && mcpTools.length >= 10),
      evidence: [
        `mcpTools=${mcpTools.join(',')}`,
        `mcpProbe=${scripts['probe:mcp'] ? 'present' : 'missing'}`,
        `mcpCompactSmoke=${hasMcpCompactSmoke ? 'present' : 'missing'}`,
        `agentNext=${hasAgentNext ? 'present' : 'missing'}`,
        `mcpAgentNext=${hasAgentNextMcp ? 'present' : 'missing'}`,
        `agentNextProofPlan=${hasAgentNextProofPlan ? 'present' : 'missing'}`,
        `agentPreflight=${hasAgentPreflight ? 'present' : 'missing'}`,
        `mcpAgentPreflight=${hasAgentPreflightMcp ? 'present' : 'missing'}`,
        `agentProofChecklist=${hasAgentProofChecklist ? 'present' : 'missing'}`,
        `agentProofChecklistStatus=${hasAgentProofChecklistStatus ? 'present' : 'missing'}`,
        `agentProofCloseout=${hasAgentProofCloseout ? 'present' : 'missing'}`,
        `agentProofCloseoutStatus=${hasAgentProofCloseoutStatus ? 'present' : 'missing'}`,
        `mcpAgentProofChecklist=${hasAgentProofChecklistMcp ? 'present' : 'missing'}`,
        `mcpAgentProofChecklistStatus=${hasAgentProofChecklistStatusMcp ? 'present' : 'missing'}`,
        `mcpAgentProofCloseout=${hasAgentProofCloseoutMcp ? 'present' : 'missing'}`,
        `mcpAgentProofCloseoutStatus=${hasAgentProofCloseoutStatusMcp ? 'present' : 'missing'}`,
        `runGateAudit=${hasRunGateAudit ? 'present' : 'missing'}`,
        `runGateOkForAgentLoops=${Boolean(runGateAudit.summary?.okForAgentLoops)}`,
        `runGateUnguardedAgentDangerous=${runGateAudit.summary?.unguardedAgentDangerous ?? 'none'}`,
        `runGateOperatorGated=${runGateAudit.summary?.operatorGated ?? 'none'}`,
        `runGateDirectOperator=${runGateAudit.summary?.directOperator ?? 'none'}`,
        `mcpCompactNextActions=${hasMcpNextActionCompactSmoke ? 'present' : 'missing'}`,
        `mcpProofGateStatus=${mcpTools.includes('sba_proof_gate_status') ? 'present' : 'missing'}`,
        `mcpProofGateWatch=${mcpTools.includes('sba_proof_gate_watch') ? 'present' : 'missing'}`,
        `mcpOperatorPack=${mcpTools.includes('sba_operator_pack') ? 'present' : 'missing'}`,
        `operatorRunbook=${hasOperatorRunbook ? 'present' : 'missing'}`,
        `mcpOperatorRunbook=${hasOperatorRunbookMcp ? 'present' : 'missing'}`,
        `mcpCompactHandoff=${hasMcpHandoffCompactSmoke ? 'present' : 'missing'}`,
        `mcpCompactChromeControlPlan=${hasMcpChromeControlPlanCompactSmoke ? 'present' : 'missing'}`,
        `mcpCompactBrowserRoute=${hasMcpBrowserRouteCompactSmoke ? 'present' : 'missing'}`,
        `mcpCompactChromeExtensionStatus=${hasMcpChromeExtensionStatusCompactSmoke ? 'present' : 'missing'}`,
        `mcpCompactChromeExtensionHandoff=${hasMcpChromeExtensionHandoffCompactSmoke ? 'present' : 'missing'}`,
        `mcpCompactChromeExtensionResume=${hasMcpChromeExtensionResumeCompactSmoke ? 'present' : 'missing'}`,
        `controlStatus=${hasControlStatus ? 'present' : 'missing'}`,
        `mcpControlStatus=${hasControlStatusMcp ? 'present' : 'missing'}`,
        `chromeControlPlan=${hasChromeControlPlan ? 'present' : 'missing'}`,
        `mcpChromeControlPlan=${hasChromeControlPlanMcp ? 'present' : 'missing'}`,
        `browserRoute=${hasBrowserRoute ? 'present' : 'missing'}`,
        `mcpBrowserRoute=${hasBrowserRouteMcp ? 'present' : 'missing'}`,
        `chromeExtensionStatus=${hasChromeExtensionStatus ? 'present' : 'missing'}`,
        `mcpChromeExtensionStatus=${hasChromeExtensionStatusMcp ? 'present' : 'missing'}`,
        `chromeExtensionHandoff=${hasChromeExtensionHandoff ? 'present' : 'missing'}`,
        `mcpChromeExtensionHandoff=${hasChromeExtensionHandoffMcp ? 'present' : 'missing'}`,
        `chromeExtensionResume=${hasChromeExtensionResume ? 'present' : 'missing'}`,
        `mcpChromeExtensionResume=${hasChromeExtensionResumeMcp ? 'present' : 'missing'}`,
        `chromeAppleEventsStatus=${hasChromeAppleEventsStatus ? 'present' : 'missing'}`,
        `mcpChromeAppleEventsStatus=${hasChromeAppleEventsStatusMcp ? 'present' : 'missing'}`,
        `chromeAppleEventsEnablePlan=${hasChromeAppleEventsEnablePlan ? 'present' : 'missing'}`,
        `mcpChromeAppleEventsEnablePlan=${hasChromeAppleEventsEnablePlanMcp ? 'present' : 'missing'}`,
        `chromeAppleEventsOutline=${hasChromeAppleEventsOutline ? 'present' : 'missing'}`,
        `mcpChromeAppleEventsOutline=${hasChromeAppleEventsOutlineMcp ? 'present' : 'missing'}`,
        `everydayChromeAppleEventsInspectFallback=${hasChromeAppleEventsStatus && hasChromeAppleEventsStatusMcp && hasChromeAppleEventsEnablePlan && hasChromeAppleEventsEnablePlanMcp && hasChromeAppleEventsOutline && hasChromeAppleEventsOutlineMcp ? 'present' : 'missing'}`,
        `agentWorkflow=${hasAgentWorkflow ? 'present' : 'missing'}`,
        `mcpAgentWorkflow=${hasAgentWorkflowMcp ? 'present' : 'missing'}`,
        `agentBackendSelect=${hasAgentBackendSelect ? 'present' : 'missing'}`,
        `mcpAgentBackendSelect=${hasAgentBackendSelectMcp ? 'present' : 'missing'}`,
        `agentControlPlane=${hasAgentControlPlane ? 'present' : 'missing'}`,
        `mcpAgentControlPlane=${hasAgentControlPlaneMcp ? 'present' : 'missing'}`,
        `agentControlPlaneStatus=${hasAgentControlPlaneStatus ? 'present' : 'missing'}`,
        `mcpAgentControlPlaneStatus=${hasAgentControlPlaneStatusMcp ? 'present' : 'missing'}`,
        `agentControlPlaneWatch=${hasAgentControlPlaneWatch ? 'present' : 'missing'}`,
        `mcpAgentControlPlaneWatch=${hasAgentControlPlaneWatchMcp ? 'present' : 'missing'}`,
        `agentTask=${hasAgentTask ? 'present' : 'missing'}`,
        `mcpAgentTask=${hasAgentTaskMcp ? 'present' : 'missing'}`,
        `mcpAgentTaskWatchLoop=${hasAgentTaskWatchMcp ? 'present' : 'missing'}`,
        `agentLoopStep=${hasAgentLoopStep ? 'present' : 'missing'}`,
        `mcpAgentLoopStep=${hasAgentLoopStepMcp ? 'present' : 'missing'}`,
        `backendMatrix=${hasBackendMatrix ? 'present' : 'missing'}`,
        `mcpBackendMatrix=${hasBackendMatrixMcp ? 'present' : 'missing'}`,
        `objectiveSafeCommand=${hasObjectiveSafeCommand ? 'present' : 'missing'}`,
        `objectiveProofPipeline=${hasObjectiveProofPipeline ? 'present' : 'missing'}`,
        `mcpObjectiveProofPipeline=${hasObjectiveProofPipelineMcp ? 'present' : 'missing'}`,
        `mcpBackgroundProofCapture=${hasBackgroundProofMcp ? 'present' : 'missing'}`,
        `everydayChromeExtensionPrepared=${Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionPrepared)}`,
        `everydayChromeExtensionBackendAvailable=${Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionBackendAvailable)}`,
        `everydayChromeExtensionReady=${Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionReady)}`,
        `everydayChromeCdpAllowed=${Boolean(chromeExtensionStatus.decision?.everydayChromeViaCdpAllowed)}`,
        `chromeExtensionSecretValuesRead=${Boolean(chromeExtensionStatus.secretValuesRead)}`
      ],
      next: 'Keep full DevTools MCP as a debug companion, not the default credential holder.'
    }),
    requirement({
      id: 'operate-analyze-scrape',
      requirement: 'Support search, page operation, structure analysis, screenshots, recipes, and CSV/JSON scraping.',
      status: statusFrom(cliCommands.operate.length >= 8),
      evidence: [
        `commands=${cliCommands.operate.join(',')}`,
        `examples=${exists(path.join(rootDir, 'examples/cdp-form-recipe.json'))}`,
        `csvManifestProbe=${scripts['probe:recipe-csv'] ? 'present' : 'missing'}`
      ]
    }),
    requirement({
      id: 'background-browser',
      requirement: 'Operate without keeping the browser in front by reusing background Chrome/CDP daemons.',
      status: statusFrom(cliCommands.background.length >= 5),
      evidence: [
        `commands=${cliCommands.background.join(',')}`,
        `targetDaemonProbe=${scripts['probe:target-daemon'] ? 'present' : 'missing'}`,
        `targetAutostartProbe=${scripts['probe:target-autostart'] ? 'present' : 'missing'}`
      ]
    }),
    requirement({
      id: 'authenticated-target-pack-smoke',
      requirement: 'Verify the full target-pack flow with authenticated state before touching a real account.',
      status: statusFrom(Boolean(hasTargetAuthSmoke)),
      evidence: [
        `script=scripts/target-auth-smoke.mjs ${exists(path.join(rootDir, 'scripts/target-auth-smoke.mjs')) ? 'present' : 'missing'}`,
        `packageScript=${scripts['probe:target-auth'] ? 'present' : 'missing'}`,
        `verifyHook=${verifyScript.includes('target-auth-smoke.mjs') ? 'present' : 'missing'}`
      ],
      next: 'Use a real target pack only after operator-owned login and target-audit pass.'
    }),
    requirement({
      id: 'performance-evidence',
      requirement: 'Measure cold browser startup versus daemon reuse and provider alternatives.',
      status: statusFrom(Boolean(hasBenchmarkSmoke)),
      evidence: [
        `probe:benchmark=${scripts['probe:benchmark'] ? 'present' : 'missing'}`,
        `probe:target-benchmark=${scripts['probe:target-benchmark'] ? 'present' : 'missing'}`,
        `verifyHook=${verifyScript.includes('target-benchmark') ? 'present' : 'missing'}`
      ],
      next: 'Repeat public URL benchmarks when Lightpanda binary becomes available.'
    }),
    requirement({
      id: 'runtime-hygiene',
      requirement: 'Audit currently running browser-agent processes before cleanup or long-running automation.',
      status: statusFrom(Boolean(hasRuntimeAudit && hasRuntimeCleanupPlan)),
      evidence: [
        `probe:runtime-audit=${scripts['probe:runtime-audit'] ? 'present' : 'missing'}`,
        `probe:runtime-cleanup-plan=${scripts['probe:runtime-cleanup-plan'] ? 'present' : 'missing'}`,
        `runtimeAuditModule=${exists(path.join(rootDir, 'src/runtime-audit.mjs')) ? 'present' : 'missing'}`,
        `mcpRuntimeCleanupPlan=${hasRuntimeCleanupPlan ? 'present' : 'missing'}`
      ],
      next: 'Close stale parent Codex/Claude sessions before killing MCP children directly.'
    }),
    requirement({
      id: 'reference-research',
      requirement: 'Clone or inventory comparable tools and keep adoption decisions reproducible.',
      status: statusFrom(Boolean(hasSourceAudit), sourceAudit.summary?.presentTargets > 0),
      evidence: [
        `presentTargets=${sourceAudit.summary?.presentTargets ?? 0}/${sourceAudit.summary?.totalTargets ?? sourceAudit.summary?.targets ?? 0}`,
        `agentBrowserReady=${Boolean(sourceAudit.summary?.readiness?.agentBrowser)}`,
        `lightpandaBinary=${Boolean(sourceAudit.summary?.readiness?.lightpandaBinary)}`,
        `seleniumWebdriver=${Boolean(sourceAudit.summary?.readiness?.seleniumWebdriver)}`,
        `seleniumDoctor=${hasSeleniumDoctor ? 'present' : 'missing'}`,
        `mcpSeleniumDoctor=${hasSeleniumDoctorMcp ? 'present' : 'missing'}`,
        `seleniumReadyForLocalSmoke=${Boolean(seleniumDoctor.readyForLocalSmoke)}`,
        `seleniumBidiCandidate=${Boolean(seleniumDoctor.bidiCandidate)}`
      ],
      next: 'Keep Lightpanda and Selenium as benchmark/compatibility candidates until local binaries/packages are verified.'
    }),
    requirement({
      id: 'real-external-auth-target',
      requirement: 'Prove the workflow against at least one real external authenticated target pack.',
      status: acceptedExternalProofs.length > 0 ? 'proved' : 'manual-required',
      evidence: [
        'local authenticated fixture is covered by scripts/target-auth-smoke.mjs',
        `targetBootstrapPlan=${mcpTools.includes('sba_target_bootstrap_plan') ? 'present' : 'missing'}`,
        `targetCandidatePlan=${scripts['probe:target-candidate-plan'] && mcpTools.includes('sba_target_candidate_plan') ? 'present' : 'missing'}`,
        `targetApprovalPack=${scripts['probe:target-approval-pack'] && mcpTools.includes('sba_target_approval_pack') ? 'present' : 'missing'}`,
        `targetApprovalStatus=${scripts['probe:target-approval-status'] && mcpTools.includes('sba_target_approval_status') ? 'present' : 'missing'}`,
        `targetApprovalResume=${scripts['probe:target-approval-resume'] && mcpTools.includes('sba_target_approval_resume') ? 'present' : 'missing'}`,
        `targetProofInventory=${mcpTools.includes('sba_target_proof_inventory') ? 'present' : 'missing'}`,
        `targetProofNext=${mcpTools.includes('sba_target_proof_next') ? 'present' : 'missing'}`,
        `targetProofPlan=${scripts['probe:target-proof-plan'] && mcpTools.includes('sba_target_proof_plan') ? 'present' : 'missing'}`,
        `targetAuthCheck=${scripts['probe:target-auth-check'] && mcpTools.includes('sba_target_auth_check') ? 'present' : 'missing'}`,
        `targetAuthWatch=${mcpTools.includes('sba_target_auth_watch') ? 'present' : 'missing'}`,
        `targetProofCapture=${scripts['probe:target-proof-capture'] && mcpTools.includes('sba_target_proof_capture') ? 'present' : 'missing'}`,
        `targetLoginCapture=${scripts['probe:target-login-capture'] && mcpTools.includes('sba_target_login_capture') ? 'present' : 'missing'}`,
        `targetHandoffStatus=${scripts['probe:target-handoff-status'] && mcpTools.includes('sba_target_handoff_status') ? 'present' : 'missing'}`,
        `targetHandoffRun=${scripts['probe:target-handoff-run'] && mcpTools.includes('sba_target_handoff_run') ? 'present' : 'missing'}`,
        `targetHandoffResume=${scripts['probe:target-handoff-resume'] && mcpTools.includes('sba_target_handoff_resume') ? 'present' : 'missing'}`,
        `targetProofs=${targetProofs.length}`,
        `acceptedExternalProofs=${acceptedExternalProofs.length}`,
        ...acceptedExternalProofs.map((item) => `${item.proof.target}: ${item.path}`)
      ],
      next: 'Create an operator-approved target pack, log in manually, run target-audit, target-run observe/scrape, and target-benchmark.'
    }),
    requirement({
      id: 'lightpanda-public-benchmark',
      requirement: 'Prove or reject Lightpanda as the public crawl accelerator on this Mac.',
      status: lightpandaBenchmarkProofs.length > 0 ? 'proved' : (lightpandaStatus.binaryExists ? 'partial' : 'manual-required'),
      evidence: [
        `binaryExists=${Boolean(lightpandaStatus.binaryExists)}`,
        `binaryPath=${lightpandaStatus.binaryPath || 'missing'}`,
        `doctor=${hasLightpandaDoctor ? 'present' : 'missing'}`,
        `mcpDoctor=${hasLightpandaDoctorMcp ? 'present' : 'missing'}`,
        `providerBenchmarkProofs=${providerBenchmarkProofs.length}`,
        `lightpandaPublicDecisions=${lightpandaBenchmarkProofs.length}`,
        ...lightpandaBenchmarkProofs.map((item) => `${item.decision.result}: ${item.path}`)
      ],
      next: 'Run lightpanda-decision --decision reject --write for the current-Mac decision, or configure SBA_LIGHTPANDA_PATH and run a public URL benchmark before adopting it.'
    })
  ];

  const summary = requirements.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const missing = requirements.filter((item) => item.status === 'missing');
  const manualRequired = requirements.filter((item) => item.status === 'manual-required');

  return {
    generatedAt,
    rootDir,
    objective: 'Fast, secure, credential-aware browser search, operation, page analysis, and scraping for agents.',
    readyForLocalAuthenticatedDevelopment: missing.length === 0,
    completeAgainstObjective: missing.length === 0 && manualRequired.length === 0,
    summary,
    requirements,
    next: [
      ...missing.map((item) => `${item.id}: ${item.next || 'restore missing implementation'}`),
      ...manualRequired.map((item) => `${item.id}: ${item.next}`)
    ]
  };
}

export function formatReadinessAuditMarkdown(audit) {
  const lines = [
    '# Secure Browser Agent Readiness Audit',
    '',
    `Generated: ${audit.generatedAt}`,
    `Root: ${audit.rootDir}`,
    '',
    '## Summary',
    '',
    `- Ready for local authenticated development: ${audit.readyForLocalAuthenticatedDevelopment ? 'yes' : 'no'}`,
    `- Complete against objective: ${audit.completeAgainstObjective ? 'yes' : 'no'}`,
    `- Proved: ${audit.summary.proved || 0}`,
    `- Partial: ${audit.summary.partial || 0}`,
    `- Manual required: ${audit.summary['manual-required'] || 0}`,
    `- Missing: ${audit.summary.missing || 0}`,
    '',
    '## Requirements',
    ''
  ];
  for (const item of audit.requirements) {
    lines.push(`### ${item.id}`);
    lines.push('');
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Requirement: ${item.requirement}`);
    for (const evidence of item.evidence) lines.push(`- Evidence: ${evidence}`);
    if (item.next) lines.push(`- Next: ${item.next}`);
    lines.push('');
  }
  if (audit.next.length) {
    lines.push('## Next');
    lines.push('');
    for (const item of audit.next) lines.push(`- ${item}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function formatReadinessAuditCompact(audit) {
  const requirements = Array.isArray(audit.requirements) ? audit.requirements : [];
  const remaining = requirements.filter((item) => item.status !== 'proved');
  const byId = new Map(requirements.map((item) => [item.id, item]));
  const provider = byId.get('provider-decision') || {};
  const credential = byId.get('credential-boundary') || {};
  const agentInterface = byId.get('agent-interface') || {};
  const reference = byId.get('reference-research') || {};
  const realExternal = byId.get('real-external-auth-target') || {};
  const lightpanda = byId.get('lightpanda-public-benchmark') || {};
  const lines = [
    `ready_for_local_authenticated_development: ${yesNo(audit.readyForLocalAuthenticatedDevelopment)}`,
    `complete_against_objective: ${yesNo(audit.completeAgainstObjective)}`,
    `proved: ${audit.summary?.proved || 0}`,
    `partial: ${audit.summary?.partial || 0}`,
    `manual_required: ${audit.summary?.['manual-required'] || 0}`,
    `missing: ${audit.summary?.missing || 0}`,
    `remaining_count: ${remaining.length}`,
    `remaining: ${remaining.length ? remaining.map((item) => item.id).join(',') : 'none'}`,
    `provider_default_backend: ${compactEvidence(provider, 'defaultBackend')}`,
    `provider_default_agent_interface: ${compactEvidence(provider, 'defaultAgentInterface')}`,
    `provider_adoption_next: ${compactEvidence(provider, 'providerAdoptionNext')}`,
    `provider_lightpanda_next: ${compactEvidence(provider, 'lightpandaNext')}`,
    `provider_playwright_next: ${compactEvidence(provider, 'playwrightNext')}`,
    `provider_playwright_ready_for_public_smoke: ${compactEvidence(provider, 'playwrightReadyForPublicSmoke')}`,
    `provider_playwright_public_smoke_proof_ok: ${compactEvidence(provider, 'playwrightPublicSmokeProofOk')}`,
    `provider_playwright_public_smoke_proof_path: ${compactEvidence(provider, 'playwrightPublicSmokeProofPath')}`,
    `provider_playwright_smoke_proof_command: ${compactEvidence(provider, 'playwrightSmokeProofCommand')}`,
    `provider_playwright_smoke_proof_agent_may_run_unattended: ${compactEvidence(provider, 'playwrightSmokeProofAgentMayRunUnattended')}`,
    `provider_playwright_smoke_proof_starts_browser: ${compactEvidence(provider, 'playwrightSmokeProofStartsBrowser')}`,
    `provider_playwright_smoke_proof_reads_browser_storage: ${compactEvidence(provider, 'playwrightSmokeProofReadsBrowserStorage')}`,
    `provider_selenium_next: ${compactEvidence(provider, 'seleniumNext')}`,
    `credential_profile_dir: ${compactEvidence(credential, 'profileDir')}`,
    `credential_output_dir: ${compactEvidence(credential, 'outputDir')}`,
    `secret_values_read: ${compactEvidence(credential, 'secretValuesRead')}`,
    `onepassword_headless_ready: ${compactEvidence(credential, 'onePasswordHeadlessReady')}`,
    `onepassword_headless_config_available: ${compactEvidence(credential, 'headlessConfigAvailable')}`,
    `onepassword_secret_run_ready: ${compactEvidence(credential, 'secretRunReady')}`,
    `onepassword_secret_run_candidate: ${compactEvidence(credential, 'secretRunCandidate')}`,
    `onepassword_secret_run_headless: ${compactEvidence(credential, 'secretRunHeadless')}`,
    `onepassword_secret_run_select: ${compactEvidence(credential, 'secretRunSelect')}`,
    `onepassword_mcp_secret_run_select: ${compactEvidence(credential, 'mcpSecretRunSelect')}`,
    `agent_interface_mcp_tools_present: ${compactEvidence(agentInterface, 'mcpProbe')}`,
    `agent_interface_compact_smoke: ${compactEvidence(agentInterface, 'mcpCompactSmoke')}`,
    `agent_interface_agent_next: ${compactEvidence(agentInterface, 'agentNext')}`,
    `agent_interface_mcp_agent_next: ${compactEvidence(agentInterface, 'mcpAgentNext')}`,
    `agent_interface_agent_next_proof_plan: ${compactEvidence(agentInterface, 'agentNextProofPlan')}`,
    `agent_interface_agent_preflight: ${compactEvidence(agentInterface, 'agentPreflight')}`,
    `agent_interface_mcp_agent_preflight: ${compactEvidence(agentInterface, 'mcpAgentPreflight')}`,
    `agent_interface_agent_proof_checklist: ${compactEvidence(agentInterface, 'agentProofChecklist')}`,
    `agent_interface_agent_proof_checklist_status: ${compactEvidence(agentInterface, 'agentProofChecklistStatus')}`,
    `agent_interface_agent_proof_closeout: ${compactEvidence(agentInterface, 'agentProofCloseout')}`,
    `agent_interface_agent_proof_closeout_status: ${compactEvidence(agentInterface, 'agentProofCloseoutStatus')}`,
    `agent_interface_mcp_agent_proof_checklist: ${compactEvidence(agentInterface, 'mcpAgentProofChecklist')}`,
    `agent_interface_mcp_agent_proof_checklist_status: ${compactEvidence(agentInterface, 'mcpAgentProofChecklistStatus')}`,
    `agent_interface_mcp_agent_proof_closeout: ${compactEvidence(agentInterface, 'mcpAgentProofCloseout')}`,
    `agent_interface_mcp_agent_proof_closeout_status: ${compactEvidence(agentInterface, 'mcpAgentProofCloseoutStatus')}`,
    `agent_interface_agent_control_plane: ${compactEvidence(agentInterface, 'agentControlPlane')}`,
    `agent_interface_mcp_agent_control_plane: ${compactEvidence(agentInterface, 'mcpAgentControlPlane')}`,
    `agent_interface_agent_control_plane_status: ${compactEvidence(agentInterface, 'agentControlPlaneStatus')}`,
    `agent_interface_mcp_agent_control_plane_status: ${compactEvidence(agentInterface, 'mcpAgentControlPlaneStatus')}`,
    `agent_interface_agent_control_plane_watch: ${compactEvidence(agentInterface, 'agentControlPlaneWatch')}`,
    `agent_interface_mcp_agent_control_plane_watch: ${compactEvidence(agentInterface, 'mcpAgentControlPlaneWatch')}`,
    `agent_interface_operator_runbook: ${compactEvidence(agentInterface, 'operatorRunbook')}`,
    `agent_interface_mcp_operator_runbook: ${compactEvidence(agentInterface, 'mcpOperatorRunbook')}`,
    `agent_interface_mcp_handoff_compact: ${compactEvidence(agentInterface, 'mcpCompactHandoff')}`,
    `agent_interface_mcp_next_action_compact: ${compactEvidence(agentInterface, 'mcpCompactNextActions')}`,
    `agent_interface_run_gate_audit: ${compactEvidence(agentInterface, 'runGateAudit')}`,
    `agent_interface_run_gate_ok_for_agent_loops: ${compactEvidence(agentInterface, 'runGateOkForAgentLoops')}`,
    `agent_interface_run_gate_unguarded_agent_dangerous: ${compactEvidence(agentInterface, 'runGateUnguardedAgentDangerous')}`,
    `agent_interface_run_gate_operator_gated: ${compactEvidence(agentInterface, 'runGateOperatorGated')}`,
    `agent_interface_run_gate_direct_operator: ${compactEvidence(agentInterface, 'runGateDirectOperator')}`,
    `everyday_chrome_extension_prepared: ${compactEvidence(agentInterface, 'everydayChromeExtensionPrepared')}`,
    `everyday_chrome_extension_backend_available: ${compactEvidence(agentInterface, 'everydayChromeExtensionBackendAvailable')}`,
    `everyday_chrome_cdp_allowed: ${compactEvidence(agentInterface, 'everydayChromeCdpAllowed')}`,
    `everyday_chrome_apple_events_status: ${compactEvidence(agentInterface, 'chromeAppleEventsStatus')}`,
    `everyday_chrome_apple_events_enable_plan: ${compactEvidence(agentInterface, 'chromeAppleEventsEnablePlan')}`,
    `everyday_chrome_apple_events_outline: ${compactEvidence(agentInterface, 'chromeAppleEventsOutline')}`,
    `everyday_chrome_apple_events_mcp_status: ${compactEvidence(agentInterface, 'mcpChromeAppleEventsStatus')}`,
    `everyday_chrome_apple_events_mcp_enable_plan: ${compactEvidence(agentInterface, 'mcpChromeAppleEventsEnablePlan')}`,
    `everyday_chrome_apple_events_mcp_outline: ${compactEvidence(agentInterface, 'mcpChromeAppleEventsOutline')}`,
    `everyday_chrome_apple_events_inspect_fallback: ${compactEvidence(agentInterface, 'everydayChromeAppleEventsInspectFallback')}`,
    `reference_present_targets: ${compactEvidence(reference, 'presentTargets')}`,
    `lightpanda_binary: ${compactEvidence(reference, 'lightpandaBinary')}`,
    `selenium_webdriver: ${compactEvidence(reference, 'seleniumWebdriver')}`,
    `real_external_status: ${clean(realExternal.status)}`,
    `target_proofs: ${compactEvidence(realExternal, 'targetProofs')}`,
    `accepted_external_proofs: ${compactEvidence(realExternal, 'acceptedExternalProofs')}`,
    `lightpanda_public_status: ${clean(lightpanda.status)}`,
    `lightpanda_public_decisions: ${compactEvidence(lightpanda, 'lightpandaPublicDecisions')}`
  ];
  for (const item of remaining) {
    lines.push(`remaining_${item.id}_status: ${clean(item.status)}`);
    if (item.next) lines.push(`remaining_${item.id}_next: ${clean(item.next)}`);
  }
  const next = Array.isArray(audit.next) ? audit.next : [];
  if (next.length) lines.push(`next: ${next.map((item) => clean(item)).join(' | ')}`);
  return `${lines.join('\n')}\n`;
}
