// Tool handlers 3114-3885 of the former callMcpTool() in src/mcp-server.mjs; src/mcp-server.mjs runs the parts in order until one handles the tool.
import { analyzeWithCdp, cdpDaemonStatus, runRecipeWithCdp, scrapeWithCdp, startCdpDaemon, stopCdpDaemon } from './cdp-backend.mjs';
import { assertAllowedUrl, assertEngineAllowed, loadPolicy, profilePath, redact } from './policy.mjs';
import { writeOutput } from './output.mjs';
import { addTargetOperateStep, applyTargetPermissions, buildTargetRunStatus, formatTargetRunStatusCompact, resolveTargetDaemon, resolveTargetPermissions, resolveTargetRun, resolveTargetScrape, targetPermissionStatus, writeTargetPermissions } from './target-pack.mjs';
import { buildCompletionProofBundleStatus, buildCompletionProofBundleWatch, formatCompletionProofBundleStatusCompact, formatCompletionProofBundleWatchCompact } from './completion-proof-bundle.mjs';
import { buildProviderReport, formatProviderReportCompact } from './provider-report.mjs';
import { buildAgentBrowserDoctor, formatAgentBrowserDoctorCompact } from './agent-browser-doctor.mjs';
import { buildProviderDoctorStatus, formatProviderDoctorStatusCompact } from './provider-doctor-status.mjs';
import { buildBackendMatrix, buildBackendMatrixStatus, formatBackendMatrixCompact, formatBackendMatrixStatusCompact } from './backend-matrix.mjs';
import { runProviderBenchmark, writeProviderBenchmarkReport } from './provider-benchmark.mjs';
import { runTargetBenchmark, writeTargetBenchmarkReport } from './target-benchmark.mjs';
import { buildSourceAudit, formatSourceAuditCompact } from './source-audit.mjs';
import { buildReadinessAudit, formatReadinessAuditCompact } from './readiness-audit.mjs';
import { buildObjectiveNext, formatObjectiveNextCompact } from './objective-next.mjs';
import { buildObjectiveResume, formatObjectiveResumeCompact } from './objective-resume.mjs';
import { buildObjectiveStatus, formatObjectiveStatusCompact } from './objective-status.mjs';
import { buildObjectiveCompletionAudit, buildObjectiveCompletionAuditStatus, buildObjectiveCompletionAuditWatch, formatObjectiveCompletionAuditCompact, formatObjectiveCompletionAuditStatusCompact, formatObjectiveCompletionAuditWatchCompact } from './objective-completion-audit.mjs';
import { buildObjectiveSafeCommand, formatObjectiveSafeCommandCompact } from './objective-safe-command.mjs';
import { buildObjectiveProofPipeline, formatObjectiveProofPipelineCompact } from './objective-proof-pipeline.mjs';
import { buildObjectiveHandoff, formatObjectiveHandoffCompact } from './objective-handoff.mjs';
import { buildTargetProof, buildTargetProofInventory, buildTargetProofNext, buildTargetProofPlan, formatTargetProofInventoryCompact, formatTargetProofNextCompact, formatTargetProofPlanCompact } from './target-proof.mjs';
import { buildTargetProofCapture, formatTargetProofCaptureCompact } from './target-proof-capture.mjs';
import { buildTargetLoginCapture } from './target-login-capture.mjs';
import { buildTargetHandoffResume, buildTargetHandoffResumeStatus, buildTargetHandoffResumeWatch, buildTargetHandoffRun, buildTargetHandoffStatus, formatTargetHandoffResumeCompact, formatTargetHandoffResumeStatusCompact, formatTargetHandoffResumeWatchCompact, formatTargetHandoffRunCompact, formatTargetHandoffStatusCompact } from './target-handoff-run.mjs';
import { buildTargetAuthCheck, buildTargetAuthWatch, formatTargetAuthCheckCompact, formatTargetAuthWatchCompact } from './target-auth-check.mjs';
import { buildTargetBootstrapPlan, formatTargetBootstrapPlanCompact } from './target-bootstrap-plan.mjs';
import { buildTargetCandidatePlan, buildTargetCandidatePlanStatus, buildTargetCandidatePlanWatch, formatTargetCandidatePlanCompact, formatTargetCandidatePlanStatusCompact, formatTargetCandidatePlanWatchCompact } from './target-candidate-plan.mjs';
import { buildTargetApprovalPack, buildTargetApprovalPreflight, buildTargetApprovalResume, buildTargetApprovalResumeStatus, buildTargetApprovalResumeWatch, buildTargetApprovalStatus, formatTargetApprovalPackCompact, formatTargetApprovalPreflightCompact, formatTargetApprovalResumeCompact, formatTargetApprovalResumeStatusCompact, formatTargetApprovalResumeWatchCompact, formatTargetApprovalStatusCompact, writeTargetApprovalPack } from './target-approval-pack.mjs';
import { buildLightpandaDoctor, formatLightpandaDoctorCompact } from './lightpanda-doctor.mjs';
import { buildLightpandaDecision, writeLightpandaDecision } from './lightpanda-decision.mjs';
import { buildPlaywrightDoctor, formatPlaywrightDoctorCompact } from './playwright-doctor.mjs';
import { buildSeleniumDoctor, formatSeleniumDoctorCompact } from './selenium-doctor.mjs';
import { buildSecretAudit, buildSecretRunPlan, buildSecretRunSelect, buildSecretSetupPlan, formatSecretAuditCompact, formatSecretRunPlanCompact, formatSecretRunSelectCompact, formatSecretSetupPlanCompact } from './secret-audit.mjs';
import { buildSecretEnvHandoff, buildSecretEnvHandoffStatus, buildSecretEnvHandoffWatch, formatSecretEnvHandoffCompact, formatSecretEnvHandoffStatusCompact, formatSecretEnvHandoffWatchCompact } from './secret-env-handoff.mjs';
import { buildProofGateStatus, formatProofGateStatusCompact } from './proof-gate-status.mjs';
import { buildProofGateWatch, formatProofGateWatchCompact } from './proof-gate-watch.mjs';
import { buildLoginHandoffStatus, formatLoginHandoffStatusCompact } from './login-handoff-status.mjs';
import { buildOperatorPack, buildOperatorPackStatus, formatOperatorPackCompact, formatOperatorPackStatusCompact } from './operator-pack.mjs';
import { buildOperatorRunbook, buildOperatorRunbookStatus, buildOperatorRunbookWatch, formatOperatorRunbookCompact, formatOperatorRunbookStatusCompact, formatOperatorRunbookWatchCompact } from './operator-runbook.mjs';
import { buildBackgroundMonitorPlan, formatBackgroundMonitorPlanCompact } from './background-monitor-plan.mjs';
import { buildBackgroundProofCapturePlan, formatBackgroundProofCapturePlanCompact } from './background-proof-capture-plan.mjs';
import { buildBackgroundProofCaptureStatus, formatBackgroundProofCaptureStatusCompact } from './background-proof-capture-status.mjs';
import { buildBackgroundProofCaptureStart, formatBackgroundProofCaptureStartCompact } from './background-proof-capture-start.mjs';
import { NOT_HANDLED, assertRecipeAllowed, cachedChromeControlPlan, cachedChromeExtensionStatus, cachedChromeMcpStatus, cachedLoginHandoffStatus, cachedObjectiveStatus, cachedProofGateStatus, cachedRuntimeAudit, cachedRuntimeCleanupPlan, csv, ensureDirs, expandRecipeSearchSteps, readJson, textResult } from './mcp-support.mjs';

export async function callMcpToolPart2({ name, args, rootDir, useCache }) {
if (name === 'sba_completion_proof_bundle_status') {
    const status = buildCompletionProofBundleStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate || 'github'
    });
    return textResult(status, false, args.format === 'compact' ? formatCompletionProofBundleStatusCompact(status) : '');
  }

  if (name === 'sba_completion_proof_bundle_watch') {
    const watch = await buildCompletionProofBundleWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in,
      out: args.out,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate || 'github'
    });
    return textResult(watch, false, args.format === 'compact' ? formatCompletionProofBundleWatchCompact(watch) : '');
  }

  if (name === 'sba_source_audit') {
    const audit = buildSourceAudit();
    return textResult(audit, false, args.format === 'compact' ? formatSourceAuditCompact(audit) : '');
  }

  if (name === 'sba_lightpanda_doctor') {
    const report = buildLightpandaDoctor();
    return textResult(report, false, args.format === 'compact' ? formatLightpandaDoctorCompact(report) : '');
  }

  if (name === 'sba_agent_browser_doctor') {
    const report = buildAgentBrowserDoctor({ rootDir });
    return textResult(report, false, args.format === 'compact' ? formatAgentBrowserDoctorCompact(report) : '');
  }

  if (name === 'sba_provider_doctor_status') {
    const status = buildProviderDoctorStatus({ seleniumOptions: { rootDir } });
    return textResult(status, false, args.format === 'compact' ? formatProviderDoctorStatusCompact(status) : '');
  }

  if (name === 'sba_playwright_doctor') {
    const report = buildPlaywrightDoctor({ rootDir });
    return textResult(report, false, args.format === 'compact' ? formatPlaywrightDoctorCompact(report) : '');
  }

  if (name === 'sba_lightpanda_decision') {
    const report = buildLightpandaDecision({
      decision: args.decision || 'reject',
      reason: args.reason || '',
      force: Boolean(args.force)
    });
    if (args.write || args.out) {
      report.outputPath = writeLightpandaDecision(rootDir, report, args.out || '');
    }
    return textResult(report);
  }

  if (name === 'sba_selenium_doctor') {
    const report = buildSeleniumDoctor({ rootDir });
    return textResult(report, false, args.format === 'compact' ? formatSeleniumDoctorCompact(report) : '');
  }

  if (name === 'sba_secret_audit') {
    const report = buildSecretAudit();
    return textResult(report, false, args.format === 'compact' ? formatSecretAuditCompact(report) : '');
  }

  if (name === 'sba_secret_setup_plan') {
    const plan = buildSecretSetupPlan({ mode: args.mode });
    return textResult(plan, false, args.format === 'compact' ? formatSecretSetupPlanCompact(plan) : '');
  }

  if (name === 'sba_secret_run_plan') {
    const plan = buildSecretRunPlan({
      mode: args.mode,
      command: args.command,
      targetDir: args.targetDir
    });
    return textResult(plan, false, args.format === 'compact' ? formatSecretRunPlanCompact(plan) : '');
  }

  if (name === 'sba_secret_run_select') {
    const selection = buildSecretRunSelect({
      command: args.command,
      targetDir: args.targetDir
    });
    return textResult(selection, false, args.format === 'compact' ? formatSecretRunSelectCompact(selection) : '');
  }

  if (name === 'sba_secret_env_handoff') {
    const handoff = buildSecretEnvHandoff({
      rootDir,
      mode: args.mode,
      environmentName: args.environmentName,
      mountPath: args.mountPath,
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(handoff, false, args.format === 'compact' ? formatSecretEnvHandoffCompact(handoff) : '');
  }

  if (name === 'sba_secret_env_handoff_status') {
    const status = buildSecretEnvHandoffStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatSecretEnvHandoffStatusCompact(status) : '');
  }

  if (name === 'sba_secret_env_handoff_watch') {
    const watch = buildSecretEnvHandoffWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in,
      out: args.out,
      staleAfterSeconds: args.staleAfterSeconds,
      mode: args.mode,
      environmentName: args.environmentName,
      mountPath: args.mountPath
    });
    return textResult(watch, false, args.format === 'compact' ? formatSecretEnvHandoffWatchCompact(watch) : '');
  }

  if (name === 'sba_providers') {
    const report = buildProviderReport({ rootDir });
    return textResult(report, false, args.format === 'compact' ? formatProviderReportCompact(report) : '');
  }

  if (name === 'sba_backend_matrix') {
    const matrix = await buildBackendMatrix({
      rootDir,
      write: Boolean(args.write),
      out: args.out,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv
    });
    return textResult(matrix, false, args.format === 'compact' ? formatBackendMatrixCompact(matrix) : '');
  }

  if (name === 'sba_backend_matrix_status') {
    const status = buildBackendMatrixStatus({
      rootDir,
      in: args.in || args.input || args.path,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatBackendMatrixStatusCompact(status) : '');
  }

  if (name === 'sba_provider_benchmark') {
    const report = await runProviderBenchmark({
      quick: Boolean(args.quick),
      iterations: Number(args.iterations || 2),
      rowCount: Number(args.rows || 40),
      url: args.url,
      rootDir
    });
    if (args.write || args.out) {
      report.outputPath = writeProviderBenchmarkReport(rootDir, report, args.out || '');
    }
    return textResult(report);
  }

  if (name === 'sba_readiness_audit') {
    const audit = buildReadinessAudit({ rootDir });
    return textResult(audit, false, args.format === 'compact' ? formatReadinessAuditCompact(audit) : '');
  }

  if (name === 'sba_objective_completion_audit') {
    const audit = await buildObjectiveCompletionAudit({
      rootDir,
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(audit, false, args.format === 'compact' ? formatObjectiveCompletionAuditCompact(audit) : '');
  }

  if (name === 'sba_objective_completion_audit_status') {
    const status = buildObjectiveCompletionAuditStatus({
      rootDir,
      in: args.in || args.input || args.path,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatObjectiveCompletionAuditStatusCompact(status) : '');
  }

  if (name === 'sba_objective_completion_audit_watch') {
    const watch = await buildObjectiveCompletionAuditWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in || args.input || args.path,
      out: args.out,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(watch, false, args.format === 'compact' ? formatObjectiveCompletionAuditWatchCompact(watch) : '');
  }

  if (name === 'sba_objective_safe_command') {
    const result = await buildObjectiveSafeCommand({
      rootDir,
      write: Boolean(args.write),
      out: args.out,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(result, false, args.format === 'compact' ? formatObjectiveSafeCommandCompact(result) : '');
  }

  if (name === 'sba_objective_proof_pipeline') {
    const pipeline = await buildObjectiveProofPipeline({
      rootDir,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(pipeline, false, args.format === 'compact' ? formatObjectiveProofPipelineCompact(pipeline) : '');
  }

  if (name === 'sba_objective_handoff') {
    const handoff = await buildObjectiveHandoff({
      rootDir,
      write: Boolean(args.write),
      out: args.out,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(handoff, false, args.format === 'compact' ? formatObjectiveHandoffCompact(handoff) : '');
  }

  if (name === 'sba_operator_pack') {
    const hasRawChromeMcpObservation = Boolean(args.chromeMcpStatusText || args.chromeMcpListPagesText);
    const hasChromeExtensionBackendObservation = args.chromeExtensionBackendAvailable !== undefined
      || Boolean(args.chromeExtensionBackendLastError);
    const cachedInputs = useCache ? {
      objectiveStatus: await cachedObjectiveStatus(rootDir),
      proofGateStatus: await cachedProofGateStatus(rootDir),
      runtimeAudit: await cachedRuntimeAudit(rootDir),
      runtimeCleanupPlan: await cachedRuntimeCleanupPlan(rootDir, args.ownerLimit),
      ...(!hasChromeExtensionBackendObservation ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir) } : {}),
      ...(!hasChromeExtensionBackendObservation ? { chromeControlPlan: await cachedChromeControlPlan(rootDir, args.lane || 'auto') } : {}),
      ...(!hasRawChromeMcpObservation ? { chromeMcpStatus: await cachedChromeMcpStatus(rootDir, {
        observedConnected: args.chromeMcpConnected,
        observedTools: args.chromeMcpTools,
        observedPageListOk: args.chromeMcpPageListOk,
        observedPageCount: args.chromeMcpPageCount,
        observedLastError: args.chromeMcpLastError || '',
        observedSource: args.chromeMcpSource || ''
      }) } : {})
    } : {};
    const pack = await buildOperatorPack({
      rootDir,
      ...cachedInputs,
      write: Boolean(args.write),
      out: args.out,
      agentLoopStepStatusIn: args.agentLoopStepStatusIn,
      agentLoopStepTimeoutMs: args.agentLoopStepTimeoutMs,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs,
      chromeMcpStatusText: args.chromeMcpStatusText || '',
      chromeMcpListPagesText: args.chromeMcpListPagesText || '',
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: args.chromeExtensionBackendLastError || '',
      chromeExtensionWindowRetryAttempted: args.chromeExtensionWindowRetryAttempted,
      appleEventsActiveTabObserved: args.appleEventsActiveTabObserved,
      appleEventsJavascriptAllowed: args.appleEventsJavascriptAllowed
    });
    return textResult(pack, false, args.format === 'compact' ? formatOperatorPackCompact(pack) : '');
  }

  if (name === 'sba_operator_runbook') {
    const operatorPack = useCache ? await buildOperatorPack({
      rootDir,
      write: false,
      objectiveStatus: await cachedObjectiveStatus(rootDir),
      proofGateStatus: await cachedProofGateStatus(rootDir),
      runtimeAudit: await cachedRuntimeAudit(rootDir),
      runtimeCleanupPlan: await cachedRuntimeCleanupPlan(rootDir),
      chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir),
      chromeControlPlan: await cachedChromeControlPlan(rootDir),
      chromeMcpStatus: await cachedChromeMcpStatus(rootDir),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    }) : null;
    const runbook = await buildOperatorRunbook({
      rootDir,
      ...(operatorPack ? { operatorPack } : {}),
      write: Boolean(args.write),
      out: args.out,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(runbook, false, args.format === 'compact' ? formatOperatorRunbookCompact(runbook) : '');
  }

  if (name === 'sba_operator_pack_status') {
    const status = buildOperatorPackStatus({
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatOperatorPackStatusCompact(status) : '');
  }

  if (name === 'sba_operator_runbook_status') {
    const status = buildOperatorRunbookStatus({
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatOperatorRunbookStatusCompact(status) : '');
  }

  if (name === 'sba_operator_runbook_watch') {
    const watch = await buildOperatorRunbookWatch({
      ...args,
      rootDir
    });
    return textResult(watch, false, args.format === 'compact' ? formatOperatorRunbookWatchCompact(watch) : '');
  }

  if (name === 'sba_objective_next') {
    const next = await buildObjectiveNext({
      rootDir,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(next, false, args.format === 'compact' ? formatObjectiveNextCompact(next) : '');
  }

  if (name === 'sba_objective_status') {
    const status = useCache
      ? await cachedObjectiveStatus(rootDir)
      : await buildObjectiveStatus({
        rootDir,
        write: Boolean(args.write),
        out: args.out
      });
    return textResult(status, false, args.format === 'compact' ? formatObjectiveStatusCompact(status) : '');
  }

  if (name === 'sba_proof_gate_status') {
    const status = useCache
      ? await cachedProofGateStatus(rootDir)
      : await buildProofGateStatus({
        rootDir,
        write: Boolean(args.write),
        out: args.out
      });
    return textResult(status, false, args.format === 'compact' ? formatProofGateStatusCompact(status) : '');
  }

  if (name === 'sba_proof_gate_watch') {
    const watch = await buildProofGateWatch({
      rootDir,
      write: Boolean(args.write),
      out: args.out,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs
    });
    return textResult(watch, false, args.format === 'compact' ? formatProofGateWatchCompact(watch) : '');
  }

  if (name === 'sba_login_handoff_status') {
    const status = useCache
      ? await cachedLoginHandoffStatus(rootDir)
      : await buildLoginHandoffStatus({
        rootDir,
        write: Boolean(args.write),
        out: args.out
      });
    return textResult(status, false, args.format === 'compact' ? formatLoginHandoffStatusCompact(status) : '');
  }

  if (name === 'sba_background_monitor_plan') {
    const plan = await buildBackgroundMonitorPlan({
      rootDir,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      statusOut: args.statusOut,
      logPath: args.logPath,
      pidPath: args.pidPath
    });
    return textResult(plan, false, args.format === 'compact' ? formatBackgroundMonitorPlanCompact(plan) : '');
  }

  if (name === 'sba_background_proof_capture_plan') {
    const plan = await buildBackgroundProofCapturePlan({
      rootDir,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      monitorLogPath: args.monitorLogPath,
      monitorPidPath: args.monitorPidPath,
      captureLogPath: args.captureLogPath,
      capturePidPath: args.capturePidPath
    });
    return textResult(plan, false, args.format === 'compact' ? formatBackgroundProofCapturePlanCompact(plan) : '');
  }

  if (name === 'sba_background_proof_capture_status') {
    const status = await buildBackgroundProofCaptureStatus({
      rootDir,
      targetDir: args.targetDir,
      maxLogLines: args.maxLogLines
    });
    return textResult(status, false, args.format === 'compact' ? formatBackgroundProofCaptureStatusCompact(status) : '');
  }

  if (name === 'sba_background_proof_capture_start') {
    const result = await buildBackgroundProofCaptureStart({
      rootDir,
      mode: args.mode,
      run: Boolean(args.run),
      operatorOk: args.operatorOk || '',
      force: Boolean(args.force),
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(result, false, args.format === 'compact' ? formatBackgroundProofCaptureStartCompact(result) : '');
  }

  if (name === 'sba_objective_resume') {
    const resume = await buildObjectiveResume({
      rootDir,
      run: Boolean(args.run),
      operatorOk: args.operatorOk || '',
      operatorReady: Boolean(args.operatorReady),
      manualCandidate: args.manualCandidate,
      waitAuthTimeoutMs: args.waitAuthTimeoutMs,
      waitAuthIntervalMs: args.waitAuthIntervalMs,
      timeoutMs: args.timeoutMs,
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(resume, false, args.format === 'compact' ? formatObjectiveResumeCompact(resume) : '');
  }

  if (name === 'sba_target_benchmark') {
    const report = await runTargetBenchmark(args.targetDir, {
      profile: args.profile,
      recipes: args.recipes,
      modes: args.modes,
      iterations: Number(args.iterations || 1)
    });
    if (args.write || args.out) {
      report.outputPath = writeTargetBenchmarkReport(args.targetDir, report, args.out || '');
    }
    return textResult(report);
  }

  if (name === 'sba_target_proof') {
    return textResult(await buildTargetProof(args.targetDir, args));
  }

  if (name === 'sba_target_bootstrap_plan') {
    const plan = buildTargetBootstrapPlan(args);
    return textResult(plan, false, args.format === 'compact' ? formatTargetBootstrapPlanCompact(plan) : '');
  }

  if (name === 'sba_target_candidate_plan') {
    const plan = buildTargetCandidatePlan({ ...args, rootDir });
    return textResult(plan, false, args.format === 'compact' ? formatTargetCandidatePlanCompact(plan) : '');
  }

  if (name === 'sba_target_candidate_plan_status') {
    const status = buildTargetCandidatePlanStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetCandidatePlanStatusCompact(status) : '');
  }

  if (name === 'sba_target_candidate_plan_watch') {
    const watch = buildTargetCandidatePlanWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in,
      out: args.out,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate
    });
    return textResult(watch, false, args.format === 'compact' ? formatTargetCandidatePlanWatchCompact(watch) : '');
  }

  if (name === 'sba_target_approval_pack') {
    const pack = buildTargetApprovalPack({
      ...args,
      rootDir
    });
    if (args.write || args.out) {
      pack.outputPath = writeTargetApprovalPack(rootDir, pack, args.out || '');
    }
    return textResult(pack, false, args.format === 'compact' ? formatTargetApprovalPackCompact(pack) : '');
  }

  if (name === 'sba_target_approval_status') {
    const status = await buildTargetApprovalStatus({
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetApprovalStatusCompact(status) : '');
  }

  if (name === 'sba_target_approval_preflight') {
    const preflight = await buildTargetApprovalPreflight({
      ...args,
      rootDir
    });
    return textResult(preflight, false, args.format === 'compact' ? formatTargetApprovalPreflightCompact(preflight) : '');
  }

  if (name === 'sba_target_approval_resume') {
    const resume = await buildTargetApprovalResume({
      ...args,
      rootDir
    });
    return textResult(resume, false, args.format === 'compact' ? formatTargetApprovalResumeCompact(resume) : '');
  }

  if (name === 'sba_target_approval_resume_status') {
    const status = buildTargetApprovalResumeStatus({
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetApprovalResumeStatusCompact(status) : '');
  }

  if (name === 'sba_target_approval_resume_watch') {
    const watch = await buildTargetApprovalResumeWatch({
      ...args,
      rootDir
    });
    return textResult(watch, false, args.format === 'compact' ? formatTargetApprovalResumeWatchCompact(watch) : '');
  }

  if (name === 'sba_target_proof_plan') {
    const plan = await buildTargetProofPlan(args.targetDir, args);
    return textResult(plan, false, args.format === 'compact' ? formatTargetProofPlanCompact(plan) : '');
  }

  if (name === 'sba_target_auth_check') {
    const authCheck = await buildTargetAuthCheck(args.targetDir, {
      ...args,
      write: Boolean(args.write),
      daemon: Boolean(args.daemon)
    });
    return textResult(authCheck, false, args.format === 'compact' ? formatTargetAuthCheckCompact(authCheck) : '');
  }

  if (name === 'sba_target_auth_watch') {
    const watch = await buildTargetAuthWatch(args.targetDir, {
      ...args,
      daemon: Boolean(args.daemon)
    });
    return textResult(watch, false, args.format === 'compact' ? formatTargetAuthWatchCompact(watch) : '');
  }

  if (name === 'sba_target_proof_capture') {
    const capture = await buildTargetProofCapture(args.targetDir, {
      ...args,
      realExternal: Boolean(args.realExternal),
      benchmarkFile: args.benchmarkFile,
      run: Boolean(args.run),
      waitAuth: Boolean(args.waitAuth),
      waitAuthTimeoutMs: args.waitAuthTimeoutMs,
      waitAuthIntervalMs: args.waitAuthIntervalMs,
      waitAuthStatusOut: args.waitAuthStatusOut,
      completionAudit: Boolean(args.completionAudit),
      cleanupOnFailure: args.cleanupOnFailure !== false
    });
    return textResult(capture, false, args.format === 'compact' ? formatTargetProofCaptureCompact(capture) : '');
  }

  if (name === 'sba_target_login_capture') {
    return textResult(await buildTargetLoginCapture(args.targetDir, {
      ...args,
      realExternal: Boolean(args.realExternal),
      dryRun: Boolean(args.dryRun),
      openOnly: Boolean(args.openOnly),
      handoffOut: args.handoffOut,
      handoffFormat: args.handoffFormat,
      waitAuthTimeoutMs: args.waitAuthTimeoutMs,
      waitAuthIntervalMs: args.waitAuthIntervalMs,
      waitAuthStatusOut: args.waitAuthStatusOut
    }));
  }

  if (name === 'sba_target_handoff_run') {
    const handoffRun = await buildTargetHandoffRun(args.targetDir, {
      ...args,
      rootDir,
      commandId: args.command,
      run: Boolean(args.run),
      preflightAuth: args.preflightAuth !== false
    });
    return textResult(handoffRun, false, args.format === 'compact' ? formatTargetHandoffRunCompact(handoffRun) : '');
  }

  if (name === 'sba_target_handoff_status') {
    const status = buildTargetHandoffStatus(args.targetDir, {
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetHandoffStatusCompact(status) : '');
  }

  if (name === 'sba_target_handoff_resume') {
    const resume = await buildTargetHandoffResume(args.targetDir, {
      ...args,
      rootDir,
      operatorOk: args.operatorOk || '',
      run: Boolean(args.run)
    });
    return textResult(resume, false, args.format === 'compact' ? formatTargetHandoffResumeCompact(resume) : '');
  }

  if (name === 'sba_target_handoff_resume_status') {
    const status = buildTargetHandoffResumeStatus(args.targetDir, {
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetHandoffResumeStatusCompact(status) : '');
  }

  if (name === 'sba_target_handoff_resume_watch') {
    const watch = await buildTargetHandoffResumeWatch(args.targetDir, {
      ...args,
      rootDir,
      run: Boolean(args.run)
    });
    return textResult(watch, watch.status === 'failed', args.format === 'compact' ? formatTargetHandoffResumeWatchCompact(watch) : '');
  }

  if (name === 'sba_target_proof_inventory') {
    const inventory = await buildTargetProofInventory(rootDir, args);
    return textResult(inventory, false, args.format === 'compact' ? formatTargetProofInventoryCompact(inventory) : '');
  }

  if (name === 'sba_target_proof_next') {
    const next = await buildTargetProofNext(rootDir, args);
    return textResult(next, false, args.format === 'compact' ? formatTargetProofNextCompact(next) : '');
  }

  if (name === 'sba_target_permissions') {
    const target = resolveTargetPermissions(args.targetDir, args.action || 'status', args);
    const policy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, policy);
    const targetProfilePath = profilePath(policy, target.profile);
    if (target.action === 'set') return textResult(writeTargetPermissions(target));
    if (target.action === 'apply') {
      const daemon = await cdpDaemonStatus(targetProfilePath);
      if (daemon.ok && !args.force) throw new Error(`target profile daemon is running: ${target.profile}`);
      ensureDirs(policy, target.profile);
      return textResult(applyTargetPermissions(target, targetProfilePath));
    }
    if (target.action === 'status') return textResult(targetPermissionStatus(target, targetProfilePath));
    return textResult(target);
  }

  if (name === 'sba_target_daemon') {
    const target = resolveTargetDaemon(args.targetDir, args.action || 'status', args);
    const policy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, policy);
    const targetProfilePath = profilePath(policy, target.profile);
    if (target.action === 'start') {
      if (target.initialUrl !== 'about:blank') assertAllowedUrl(target.initialUrl, policy);
      ensureDirs(policy, target.profile);
      return textResult(await startCdpDaemon(targetProfilePath, {
        headed: Boolean(args.headed),
        initialUrl: target.initialUrl
      }));
    }
    if (target.action === 'stop') return textResult(await stopCdpDaemon(targetProfilePath));
    return textResult(await cdpDaemonStatus(targetProfilePath));
  }

  if (name === 'sba_target_run') {
    const target = resolveTargetRun(args.targetDir, args.recipe || 'outline', args);
    const policy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, policy);
    ensureDirs(policy, target.profile);
    const recipe = expandRecipeSearchSteps(readJson(target.recipe));
    assertRecipeAllowed(recipe, policy);
    const output = await runRecipeWithCdp(recipe, profilePath(policy, target.profile), {
      daemon: Boolean(args.daemon),
      afterActionMs: Number(args.afterActionMs || 100),
      allowedOrigins: policy.allowedOrigins || [],
      artifactDir: policy.outputDir,
      artifactManifest: args.manifest !== false,
      artifactPolicy: policy.source
    });
    const redacted = redact(output, policy);
    if (args.out) {
      writeOutput(policy, { ...args, out: args.out, format: args.format || target.format, result: args.result || target.result, manifest: args.manifest !== false }, redacted, {
        command: 'mcp:sba_target_run',
        profile: target.profile,
        targetDir: target.dir,
        recipe: target.recipe
      });
    }
    return textResult(redacted);
  }

  if (name === 'sba_target_run_status') {
    const status = buildTargetRunStatus(args.targetDir, args.recipe || 'outline', {
      ...args,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetRunStatusCompact(status) : '');
  }

  if (name === 'sba_target_operate_add') {
    return textResult(addTargetOperateStep(args.targetDir, args.action, {
      ...args,
      dryRun: Boolean(args.dryRun)
    }));
  }

  if (name === 'sba_target_scrape') {
    const target = resolveTargetScrape(args.targetDir, args);
    const policy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, policy);
    assertAllowedUrl(target.url, policy);
    ensureDirs(policy, target.profile);
    const output = await scrapeWithCdp(target.url, profilePath(policy, target.profile), {
      daemon: Boolean(args.daemon),
      selector: args.selector || '',
      suggestion: args.suggestion ?? 0,
      fields: csv(args.fields),
      limit: Number(args.limit || 50),
      waitMs: Number(args.waitMs || 300),
      linkLimit: Number(args.linkLimit || 25),
      controlLimit: Number(args.controlLimit || 40),
      textLimit: Number(args.textLimit || 600),
      candidateLimit: Number(args.candidateLimit || 20),
      sampleLimit: Number(args.sampleLimit || 3),
      suggestionLimit: Number(args.suggestionLimit || 8),
      consoleLimit: Number(args.consoleLimit || 100),
      maxConsoleArgLength: Number(args.maxConsoleArgLength || 300)
    });
    const redacted = redact(output, policy);
    if (args.out) {
      writeOutput(policy, { ...args, out: args.out, format: args.format || target.format, result: args.result || target.result, manifest: args.manifest !== false }, redacted, {
        command: 'mcp:sba_target_scrape',
        profile: target.profile,
        targetDir: target.dir,
        url: target.url
      });
    }
    return textResult(redacted);
  }

  if (name === 'sba_cdp_analyze') {
    const policy = loadPolicy(args.policy);
    const profile = args.profile || policy.defaultProfile || 'default';
    assertEngineAllowed('chrome', profile, policy);
    assertAllowedUrl(args.url, policy);
    ensureDirs(policy, profile);
    const output = await analyzeWithCdp(args.url, profilePath(policy, profile), { daemon: Boolean(args.daemon) });
    return textResult(redact(output, policy));
  }

  return NOT_HANDLED;
}
