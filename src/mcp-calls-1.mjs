// Tool handlers 2337-3112 of the former callMcpTool() in src/mcp-server.mjs; src/mcp-server.mjs runs the parts in order until one handles the tool.
import { loadPolicy } from './policy.mjs';
import { resolveTargetPack } from './target-pack.mjs';
import { profileStatus } from './profile-status.mjs';
import { auditTargetPack } from './security-audit.mjs';
import { buildRuntimeAudit, buildRuntimeCleanupPlan, formatRuntimeAuditCompact, formatRuntimeCleanupPlanCompact, writeRuntimeAuditReport, writeRuntimeCleanupPlanReport } from './runtime-audit.mjs';
import { buildRunGateAudit, formatRunGateAuditCompact } from './run-gate-audit.mjs';
import { buildCompactCommandAudit, formatCompactCommandAuditCompact } from './compact-command-audit.mjs';
import { buildCompletionProofBundle, formatCompletionProofBundleCompact } from './completion-proof-bundle.mjs';
import { buildTargetApprovalPreflight, formatTargetApprovalPreflightCompact } from './target-approval-pack.mjs';
import { buildAgentNext, buildControlStatus, formatAgentNextCompact, formatControlStatusCompact } from './control-status.mjs';
import { buildAgentProofCloseout, buildAgentProofCloseoutStatus, formatAgentProofCloseoutCompact, formatAgentProofCloseoutStatusCompact } from './agent-proof-closeout.mjs';
import { buildAgentProofChecklist, buildAgentProofChecklistStatus, formatAgentProofChecklistCompact, formatAgentProofChecklistStatusCompact } from './agent-proof-checklist.mjs';
import { buildAgentLoopStep, buildAgentLoopStepStatus, formatAgentLoopStepCompact, formatAgentLoopStepStatusCompact } from './agent-loop-step.mjs';
import { buildAgentProofStep, buildAgentProofStepStart, buildAgentProofStepStatus, formatAgentProofStepCompact, formatAgentProofStepStartCompact, formatAgentProofStepStatusCompact } from './agent-proof-step.mjs';
import { buildAgentWorkflow, formatAgentWorkflowCompact } from './agent-workflow.mjs';
import { buildAgentBackendSelect, formatAgentBackendSelectCompact } from './agent-backend-select.mjs';
import { buildAgentControlPlane, buildAgentControlPlaneStatus, buildAgentControlPlaneWatch, formatAgentControlPlaneCompact, formatAgentControlPlaneStatusCompact, formatAgentControlPlaneWatchCompact, writeAgentControlPlane } from './agent-control-plane.mjs';
import { buildAgentTask, buildAgentTaskLoop, buildAgentTaskStatus, buildAgentTaskWatch, buildAgentTaskWatchStart, buildAgentTaskWatchStatus, formatAgentTaskCompact, formatAgentTaskLoopCompact, formatAgentTaskStatusCompact, formatAgentTaskWatchCompact, formatAgentTaskWatchStartCompact, formatAgentTaskWatchStatusCompact } from './agent-task.mjs';
import { buildChromeControlPlan, formatChromeControlPlanCompact } from './chrome-control-plan.mjs';
import { buildChromeMcpObservation, buildChromeMcpObservationStatus, formatChromeMcpObservationCompact, formatChromeMcpObservationStatusCompact } from './chrome-mcp-observation.mjs';
import { buildChromeMcpStatus, formatChromeMcpStatusCompact } from './chrome-mcp-status.mjs';
import { buildChromeMcpHandoff, formatChromeMcpHandoffCompact } from './chrome-mcp-handoff.mjs';
import { buildChromeMcpTimeoutPlan, buildChromeMcpTimeoutPlanStatus, formatChromeMcpTimeoutPlanCompact, formatChromeMcpTimeoutPlanStatusCompact } from './chrome-mcp-timeout-plan.mjs';
import { buildChromeMcpAutostartPlan, buildChromeMcpAutostartPlanStatus, formatChromeMcpAutostartPlanCompact, formatChromeMcpAutostartPlanStatusCompact } from './chrome-mcp-autostart-plan.mjs';
import { buildRegularChromeUse, formatRegularChromeUseCompact } from './regular-chrome-use.mjs';
import { buildRegularChromeRefresh, buildRegularChromeStatus, buildRegularChromeWatch, formatRegularChromeRefreshCompact, formatRegularChromeStatusCompact, formatRegularChromeWatchCompact } from './regular-chrome-refresh.mjs';
import { buildBrowserRoute, formatBrowserRouteCompact } from './browser-route.mjs';
import { buildChromeAppleEventsOutline, buildChromeAppleEventsStatus, formatChromeAppleEventsOutlineCompact, formatChromeAppleEventsStatusCompact } from './chrome-apple-events-status.mjs';
import { buildChromeAppleEventsEnablePlan, formatChromeAppleEventsEnablePlanCompact } from './chrome-apple-events-enable-plan.mjs';
import { buildChromeExtensionStatus, formatChromeExtensionStatusCompact } from './chrome-extension-status.mjs';
import { buildChromeExtensionHandoff, formatChromeExtensionHandoffCompact } from './chrome-extension-handoff.mjs';
import { buildChromeExtensionResume, formatChromeExtensionResumeCompact } from './chrome-extension-resume.mjs';
import { buildChromeExtensionTroubleshoot, formatChromeExtensionTroubleshootCompact } from './chrome-extension-troubleshoot.mjs';
import { buildChromeExtensionBackendCheckPlan, formatChromeExtensionBackendCheckPlanCompact } from './chrome-extension-backend-check-plan.mjs';
import { buildChromeExtensionClaimPlan, formatChromeExtensionClaimPlanCompact } from './chrome-extension-claim-plan.mjs';
import { NOT_HANDLED, cachedChromeAppleEventsStatus, cachedChromeControlPlan, cachedChromeExtensionStatus, cachedChromeMcpStatus, cachedControlStatus, cachedProofGateStatus, cachedRuntimeAudit, cachedRuntimeCleanupPlan, textResult } from './mcp-support.mjs';

export async function callMcpToolPart1({ name, args, rootDir, useCache }) {
if (name === 'sba_control_status') {
    const hasMonitorOverride = args.monitorTimeoutMs !== undefined || args.monitorIntervalMs !== undefined;
    const status = useCache && !hasMonitorOverride
      ? await cachedControlStatus(rootDir)
      : await buildControlStatus({
          rootDir,
          monitorTimeoutMs: args.monitorTimeoutMs,
          monitorIntervalMs: args.monitorIntervalMs
        });
    return textResult(status, false, args.format === 'compact' ? formatControlStatusCompact(status) : '');
  }

  if (name === 'sba_agent_next') {
    const hasMonitorOverride = args.monitorTimeoutMs !== undefined || args.monitorIntervalMs !== undefined;
    const status = useCache && !hasMonitorOverride
      ? await cachedControlStatus(rootDir)
      : await buildControlStatus({
          rootDir,
          monitorTimeoutMs: args.monitorTimeoutMs,
          monitorIntervalMs: args.monitorIntervalMs
        });
    const next = buildAgentNext(status);
    return textResult(next, false, args.format === 'compact' ? formatAgentNextCompact(next) : '');
  }

  if (name === 'sba_agent_preflight') {
    const preflight = await buildTargetApprovalPreflight({
      ...args,
      candidate: args.candidate || 'github',
      realExternal: true,
      rootDir
    });
    return textResult(preflight, false, args.format === 'compact' ? formatTargetApprovalPreflightCompact(preflight) : '');
  }

  if (name === 'sba_agent_proof_checklist') {
    const checklist = await buildAgentProofChecklist({
      ...args,
      candidate: args.candidate || 'github',
      rootDir
    });
    return textResult(checklist, false, args.format === 'compact' ? formatAgentProofChecklistCompact(checklist) : '');
  }

  if (name === 'sba_agent_proof_checklist_status') {
    const status = buildAgentProofChecklistStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate || 'github'
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentProofChecklistStatusCompact(status) : '');
  }

  if (name === 'sba_agent_proof_closeout') {
    const closeout = await buildAgentProofCloseout({
      ...args,
      candidate: args.candidate || 'github',
      checklistIn: args.checklistIn,
      rootDir
    });
    return textResult(closeout, false, args.format === 'compact' ? formatAgentProofCloseoutCompact(closeout) : '');
  }

  if (name === 'sba_agent_proof_closeout_status') {
    const status = buildAgentProofCloseoutStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate || 'github'
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentProofCloseoutStatusCompact(status) : '');
  }

  if (name === 'sba_agent_workflow') {
    const workflow = await buildAgentWorkflow({
      rootDir,
      task: args.task || args.intent || 'auto',
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      intent: args.intent,
      matchOrigin: args.matchOrigin,
      matchPath: args.matchPath,
      tabIndex: args.tabIndex,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError,
      chromeMcpSource: args.chromeMcpSource,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      chromeExtensionPrepared: args.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable
    });
    return textResult(workflow, false, args.format === 'compact' ? formatAgentWorkflowCompact(workflow) : '');
  }

  if (name === 'sba_agent_backend_select') {
    const selection = await buildAgentBackendSelect({
      rootDir,
      task: args.task,
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      backendMatrixIn: args.backendMatrixIn,
      mcpObservationIn: args.mcpObservationIn,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError,
      chromeMcpSource: args.chromeMcpSource,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      matchOrigin: args.matchOrigin,
      matchPath: args.matchPath,
      tabIndex: args.tabIndex
    });
    return textResult(selection, false, args.format === 'compact' ? formatAgentBackendSelectCompact(selection) : '');
  }

  if (name === 'sba_agent_control_plane') {
    const status = await buildAgentControlPlane({
      rootDir,
      task: args.task,
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      backendMatrixIn: args.backendMatrixIn,
      mcpObservationIn: args.mcpObservationIn,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    if (args.write || args.out) {
      status.outputPath = writeAgentControlPlane(rootDir, status, args.out || '');
    }
    return textResult(status, false, args.format === 'compact' ? formatAgentControlPlaneCompact(status) : '');
  }

  if (name === 'sba_agent_control_plane_status') {
    const status = buildAgentControlPlaneStatus({
      rootDir,
      in: args.in || args.input || args.path,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentControlPlaneStatusCompact(status) : '');
  }

  if (name === 'sba_agent_control_plane_watch') {
    const watch = await buildAgentControlPlaneWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in || args.input || args.path,
      out: args.out || args.output,
      staleAfterSeconds: args.staleAfterSeconds,
      task: args.task,
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      backendMatrixIn: args.backendMatrixIn,
      mcpObservationIn: args.mcpObservationIn,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(watch, false, args.format === 'compact' ? formatAgentControlPlaneWatchCompact(watch) : '');
  }

  if (name === 'sba_agent_task') {
    const task = await buildAgentTask({
      rootDir,
      run: Boolean(args.run),
      operatorOk: args.operatorOk || args['operator-ok'] || '',
      write: Boolean(args.write),
      out: args.out || args.output,
      task: args.task,
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      searchProviders: args.searchProviders,
      intent: args.intent,
      matchOrigin: args.matchOrigin,
      matchPath: args.matchPath,
      tabIndex: args.tabIndex,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError,
      chromeMcpSource: args.chromeMcpSource,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      chromeExtensionPrepared: args.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable,
      timeoutMs: args.timeoutMs
    });
    return textResult(task, task.status === 'failed', args.format === 'compact' ? formatAgentTaskCompact(task) : '');
  }

  if (name === 'sba_agent_task_status') {
    const status = buildAgentTaskStatus({
      rootDir,
      in: args.in || args.input || args.path,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentTaskStatusCompact(status) : '');
  }

  if (name === 'sba_agent_task_watch') {
    const watch = buildAgentTaskWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in || args.input || args.path,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(watch, watch.status === 'failed', args.format === 'compact' ? formatAgentTaskWatchCompact(watch) : '');
  }

  if (name === 'sba_agent_task_loop') {
    const loop = await buildAgentTaskLoop({
      rootDir,
      run: Boolean(args.run),
      in: args.in || args.input || args.path,
      iterations: args.iterations,
      intervalMs: args.intervalMs,
      statusOut: args.statusOut,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(loop, loop.status === 'failed', args.format === 'compact' ? formatAgentTaskLoopCompact(loop) : '');
  }

  if (name === 'sba_agent_task_watch_start') {
    const started = buildAgentTaskWatchStart({
      rootDir,
      run: Boolean(args.run),
      force: Boolean(args.force),
      operatorOk: args.operatorOk || args['operator-ok'] || '',
      in: args.in || args.input || args.path,
      logPath: args.logPath,
      pidPath: args.pidPath,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(started, false, args.format === 'compact' ? formatAgentTaskWatchStartCompact(started) : '');
  }

  if (name === 'sba_agent_task_watch_status') {
    const status = buildAgentTaskWatchStatus({
      rootDir,
      in: args.in || args.input || args.path,
      logPath: args.logPath,
      pidPath: args.pidPath,
      maxLogLines: args.maxLogLines,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentTaskWatchStatusCompact(status) : '');
  }

  if (name === 'sba_agent_loop_step') {
    const step = await buildAgentLoopStep({
      rootDir,
      run: Boolean(args.run),
      write: Boolean(args.write),
      out: args.out || args.output,
      timeoutMs: Number(args.timeoutMs || 300000),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs,
      controlStatus: args.run ? undefined : await cachedControlStatus(rootDir)
    });
    return textResult(step, false, args.format === 'compact' ? formatAgentLoopStepCompact(step) : '');
  }

  if (name === 'sba_agent_loop_step_status') {
    const status = buildAgentLoopStepStatus({
      rootDir,
      in: args.in || args.input || args.path,
      staleAfterSeconds: Number(args.staleAfterSeconds || 900),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentLoopStepStatusCompact(status) : '');
  }

  if (name === 'sba_agent_proof_step') {
    const step = await buildAgentProofStep({
      rootDir,
      run: Boolean(args.run),
      write: Boolean(args.write),
      out: args.out || args.output,
      targetDir: args.targetDir,
      handoff: args.handoff,
      timeoutMs: Number(args.timeoutMs || 300000),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(step, step.status === 'failed', args.format === 'compact' ? formatAgentProofStepCompact(step) : '');
  }

  if (name === 'sba_agent_proof_step_start') {
    const started = await buildAgentProofStepStart({
      rootDir,
      run: Boolean(args.run),
      force: Boolean(args.force),
      operatorOk: args.operatorOk || args['operator-ok'] || '',
      out: args.out || args.output,
      logPath: args.logPath,
      pidPath: args.pidPath,
      targetDir: args.targetDir,
      handoff: args.handoff,
      timeoutMs: Number(args.timeoutMs || 300000),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(started, false, args.format === 'compact' ? formatAgentProofStepStartCompact(started) : '');
  }

  if (name === 'sba_agent_proof_step_status') {
    const status = buildAgentProofStepStatus({
      rootDir,
      in: args.in || args.input || args.path,
      logPath: args.logPath,
      pidPath: args.pidPath,
      maxLogLines: args.maxLogLines
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentProofStepStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_control_plan') {
    const chromeOptions = {
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv
    };
    const plan = useCache
      ? await cachedChromeControlPlan(rootDir, args.lane || 'auto', '', chromeOptions)
      : buildChromeControlPlan({ rootDir, lane: args.lane || 'auto', ...chromeOptions });
    return textResult(plan, false, args.format === 'compact' ? formatChromeControlPlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_mcp_observation') {
    const observation = buildChromeMcpObservation({
      rootDir,
      statusText: args.statusText || '',
      listPagesText: args.listPagesText || '',
      observedConnected: args.observedConnected,
      observedTools: args.observedTools,
      observedPageListOk: args.observedPageListOk,
      observedPageCount: args.observedPageCount,
      observedListPagesTimedOut: args.observedListPagesTimedOut,
      observedLastError: args.observedLastError,
      source: args.source || '',
      intent: args.intent || 'inspect',
      write: Boolean(args.write),
      out: args.out || args.output
    });
    return textResult(observation, false, args.format === 'compact' ? formatChromeMcpObservationCompact(observation) : '');
  }

  if (name === 'sba_chrome_mcp_observation_status') {
    const status = buildChromeMcpObservationStatus({
      rootDir,
      in: args.in || args.input,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatChromeMcpObservationStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_mcp_status') {
    const status = useCache
      ? await cachedChromeMcpStatus(rootDir, args)
      : buildChromeMcpStatus({
        rootDir,
        observedConnected: args.observedConnected,
        observedTools: args.observedTools,
        observedPageListOk: args.observedPageListOk,
        observedPageCount: args.observedPageCount,
        observedLastError: args.observedLastError || '',
        observedSource: args.observedSource || ''
      });
    return textResult(status, false, args.format === 'compact' ? formatChromeMcpStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_mcp_handoff') {
    const chromeMcpStatus = useCache ? await cachedChromeMcpStatus(rootDir, args) : null;
    const chromeControlPlan = useCache ? await cachedChromeControlPlan(rootDir, args.lane || 'auto') : null;
    const handoff = await buildChromeMcpHandoff({
      rootDir,
      ...(chromeMcpStatus ? { chromeMcpStatus } : {}),
      ...(chromeControlPlan ? { chromeControlPlan } : {}),
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv
    });
    return textResult(handoff, false, args.format === 'compact' ? formatChromeMcpHandoffCompact(handoff) : '');
  }

  if (name === 'sba_chrome_mcp_timeout_plan') {
    const plan = useCache
      ? buildChromeMcpTimeoutPlan({
        rootDir,
        observedConnected: args.observedConnected,
        observedTools: args.observedTools,
        observedPageListOk: args.observedPageListOk,
        observedPageCount: args.observedPageCount,
        observedLastError: args.observedLastError || '',
        observedSource: args.observedSource || '',
        ownerLimit: args.ownerLimit,
        allowNewBackgroundTab: args.allowNewBackgroundTab,
        newBackgroundUrlEnv: args.newBackgroundUrlEnv,
        write: Boolean(args.write),
        out: args.out || args.output,
        chromeMcpStatus: await cachedChromeMcpStatus(rootDir, args),
        runtimeCleanupPlan: await cachedRuntimeCleanupPlan(rootDir, args.ownerLimit)
      })
      : buildChromeMcpTimeoutPlan({
        rootDir,
        observedConnected: args.observedConnected,
        observedTools: args.observedTools,
        observedPageListOk: args.observedPageListOk,
        observedPageCount: args.observedPageCount,
        observedLastError: args.observedLastError || '',
        observedSource: args.observedSource || '',
        ownerLimit: args.ownerLimit,
        allowNewBackgroundTab: args.allowNewBackgroundTab,
        newBackgroundUrlEnv: args.newBackgroundUrlEnv,
        write: Boolean(args.write),
        out: args.out || args.output
      });
    return textResult(plan, false, args.format === 'compact' ? formatChromeMcpTimeoutPlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_mcp_timeout_plan_status') {
    const status = buildChromeMcpTimeoutPlanStatus({
      rootDir,
      in: args.in || args.input,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatChromeMcpTimeoutPlanStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_mcp_autostart_plan') {
    const plan = buildChromeMcpAutostartPlan({
      rootDir,
      write: Boolean(args.write),
      out: args.out || args.output,
      label: args.label,
      browserUrl: args.browserUrl,
      headless: args.headless,
      packageSpec: args.packageSpec,
      plist: args.plist,
      installPath: args.installPath
    });
    return textResult(plan, false, args.format === 'compact' ? formatChromeMcpAutostartPlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_mcp_autostart_plan_status') {
    const status = buildChromeMcpAutostartPlanStatus({
      rootDir,
      in: args.in || args.input
    });
    return textResult(status, false, args.format === 'compact' ? formatChromeMcpAutostartPlanStatusCompact(status) : '');
  }

  if (name === 'sba_regular_chrome_use') {
    const useRegularChromeCache = useCache && !args.statusText && !args.listPagesText && !args.mcpObservationIn;
    const chromeMcpHandoff = useRegularChromeCache
      ? await buildChromeMcpHandoff({
        rootDir,
        browserRoute: await buildBrowserRoute({
          rootDir,
          task: 'existing-tab',
          chromeMcpStatus: await cachedChromeMcpStatus(rootDir, args),
          chromeControlPlan: await cachedChromeControlPlan(rootDir, args.lane || 'auto')
        }),
        allowNewBackgroundTab: args.allowNewBackgroundTab,
        newBackgroundUrlEnv: args.newBackgroundUrlEnv
      })
      : null;
    const plan = await buildRegularChromeUse({
      rootDir,
      ...(chromeMcpHandoff ? { chromeMcpHandoff } : {}),
      intent: args.intent || 'inspect',
      statusText: args.statusText || '',
      listPagesText: args.listPagesText || '',
      mcpObservationIn: args.mcpObservationIn,
      source: args.source || args.chromeMcpSource || '',
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      chromeExtensionPrepared: args.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: args.chromeExtensionBackendLastError || '',
      chromeExtensionWindowRetryAttempted: args.chromeExtensionWindowRetryAttempted,
      appleEventsActiveTabObserved: args.appleEventsActiveTabObserved,
      appleEventsJavascriptAllowed: args.appleEventsJavascriptAllowed,
      pluginDir: args.pluginDir || ''
    });
    return textResult(plan, false, args.format === 'compact' ? formatRegularChromeUseCompact(plan) : '');
  }

  if (name === 'sba_regular_chrome_refresh') {
    const refresh = await buildRegularChromeRefresh({
      rootDir,
      intent: args.intent || 'inspect',
      appleEventsOut: args.appleEventsOut || args.appleEventsOutput,
      out: args.out || args.output,
      statusText: args.statusText || '',
      listPagesText: args.listPagesText || '',
      mcpObservationIn: args.mcpObservationIn,
      source: args.source || args.chromeMcpSource || '',
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      chromeExtensionPrepared: args.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: args.chromeExtensionBackendLastError || '',
      chromeExtensionWindowRetryAttempted: args.chromeExtensionWindowRetryAttempted,
      pluginDir: args.pluginDir || ''
    });
    return textResult(refresh, false, args.format === 'compact' ? formatRegularChromeRefreshCompact(refresh) : '');
  }

  if (name === 'sba_regular_chrome_status') {
    const status = buildRegularChromeStatus({
      rootDir,
      in: args.in || args.input,
      appleEventsIn: args.appleEventsIn,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatRegularChromeStatusCompact(status) : '');
  }

  if (name === 'sba_regular_chrome_watch') {
    const watch = await buildRegularChromeWatch({
      rootDir,
      run: Boolean(args.run),
      force: Boolean(args.force),
      in: args.in || args.input,
      appleEventsIn: args.appleEventsIn,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      staleAfterSeconds: args.staleAfterSeconds,
      intent: args.intent || 'inspect'
    });
    return textResult(watch, watch.status === 'failed', args.format === 'compact' ? formatRegularChromeWatchCompact(watch) : '');
  }

  if (name === 'sba_chrome_apple_events_status') {
    const status = useCache
      ? await cachedChromeAppleEventsStatus(rootDir)
      : buildChromeAppleEventsStatus();
    return textResult(status, false, args.format === 'compact' ? formatChromeAppleEventsStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_apple_events_enable_plan') {
    const status = useCache ? await cachedChromeAppleEventsStatus(rootDir) : null;
    const plan = buildChromeAppleEventsEnablePlan({
      rootDir,
      ...(status ? { status } : {})
    });
    return textResult(plan, false, args.format === 'compact' ? formatChromeAppleEventsEnablePlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_apple_events_outline') {
    const status = useCache ? await cachedChromeAppleEventsStatus(rootDir) : null;
    const outline = buildChromeAppleEventsOutline({
      ...(status ? { status } : {}),
      run: Boolean(args.run),
      operatorOk: args.operatorOk || ''
    });
    return textResult(outline, false, args.format === 'compact' ? formatChromeAppleEventsOutlineCompact(outline) : '');
  }

  if (name === 'sba_browser_route') {
    const proofGateStatus = useCache && (args.task || 'auto') === 'auto'
      ? await cachedProofGateStatus(rootDir)
      : null;
    const route = await buildBrowserRoute({
      rootDir,
      ...(proofGateStatus ? { proofGateStatus } : {}),
      ...(useCache && (args.task || 'auto') === 'existing-tab' ? { chromeMcpStatus: await cachedChromeMcpStatus(rootDir, args) } : {}),
      ...(useCache && (args.task || 'auto') === 'existing-tab' ? { chromeControlPlan: await cachedChromeControlPlan(rootDir, args.lane || 'auto') } : {}),
      task: args.task || 'auto',
      lane: args.lane || 'auto',
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv
    });
    return textResult(route, false, args.format === 'compact' ? formatBrowserRouteCompact(route) : '');
  }

  if (name === 'sba_chrome_extension_status') {
    const status = useCache
      ? await cachedChromeExtensionStatus(rootDir, args.pluginDir || '')
      : buildChromeExtensionStatus({ pluginDir: args.pluginDir || '' });
    return textResult(status, false, args.format === 'compact' ? formatChromeExtensionStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_extension_handoff') {
    const handoff = buildChromeExtensionHandoff({
      rootDir,
      pluginDir: args.pluginDir || '',
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {}),
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(handoff, false, args.format === 'compact' ? formatChromeExtensionHandoffCompact(handoff) : '');
  }

  if (name === 'sba_chrome_extension_resume') {
    const result = buildChromeExtensionResume({
      rootDir,
      pluginDir: args.pluginDir || '',
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {}),
      run: Boolean(args.run),
      operatorOk: args.operatorOk || '',
      dryRun: Boolean(args.dryRun)
    });
    return textResult(result, false, args.format === 'compact' ? formatChromeExtensionResumeCompact(result) : '');
  }

  if (name === 'sba_chrome_extension_troubleshoot') {
    const result = buildChromeExtensionTroubleshoot({
      rootDir,
      pluginDir: args.pluginDir || '',
      backendAvailable: args.backendAvailable,
      backendLastError: args.backendLastError || '',
      profileWindowRetryAttempted: args.profileWindowRetryAttempted,
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {})
    });
    return textResult(result, false, args.format === 'compact' ? formatChromeExtensionTroubleshootCompact(result) : '');
  }

  if (name === 'sba_chrome_extension_backend_check_plan') {
    const plan = buildChromeExtensionBackendCheckPlan({
      rootDir,
      pluginDir: args.pluginDir || '',
      backendAvailable: args.backendAvailable,
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {})
    });
    return textResult(plan, false, args.format === 'compact' ? formatChromeExtensionBackendCheckPlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_extension_claim_plan') {
    const plan = buildChromeExtensionClaimPlan({
      rootDir,
      pluginDir: args.pluginDir || '',
      backendReady: args.backendReady,
      intent: args.intent || 'inspect',
      matchTitle: args.matchTitle || '',
      matchUrl: args.matchUrl || '',
      matchOrigin: args.matchOrigin || '',
      matchPath: args.matchPath || '',
      tabIndex: args.tabIndex,
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {})
    });
    return textResult(plan, false, args.format === 'compact' ? formatChromeExtensionClaimPlanCompact(plan) : '');
  }

  if (name === 'sba_profile_status') {
    const policy = loadPolicy(args.policy);
    const profile = args.profile || policy.defaultProfile || 'default';
    return textResult(profileStatus(policy, profile));
  }

  if (name === 'sba_target_status') {
    const target = resolveTargetPack(args.targetDir);
    const policy = loadPolicy(target.policy);
    const targetProfile = args.profile || target.metadata.profile || target.targetPolicy.defaultProfile || target.metadata.target;
    return textResult({
      target: target.metadata.target || targetProfile,
      dir: target.dir,
      policy: target.policy,
      metadata: target.metadataFile,
      ...profileStatus(policy, targetProfile)
    });
  }

  if (name === 'sba_target_audit') {
    const audit = await auditTargetPack(args.targetDir, args);
    return textResult(audit, !audit.ok);
  }

  if (name === 'sba_runtime_audit') {
    const audit = useCache ? await cachedRuntimeAudit(rootDir) : buildRuntimeAudit();
    if (args.write || args.out) {
      audit.outputPath = writeRuntimeAuditReport(rootDir, audit, args.out || '');
    }
    return textResult(audit, false, args.format === 'compact' ? formatRuntimeAuditCompact(audit) : '');
  }

  if (name === 'sba_runtime_cleanup_plan') {
    const plan = useCache
      ? await cachedRuntimeCleanupPlan(rootDir, args.ownerLimit)
      : buildRuntimeCleanupPlan({ ownerLimit: args.ownerLimit });
    if (args.write || args.out) {
      plan.outputPath = writeRuntimeCleanupPlanReport(rootDir, plan, args.out || '');
    }
    return textResult(plan, false, args.format === 'compact' ? formatRuntimeCleanupPlanCompact(plan) : '');
  }

  if (name === 'sba_run_gate_audit') {
    const audit = buildRunGateAudit();
    return textResult(audit, false, args.format === 'compact' ? formatRunGateAuditCompact(audit) : '');
  }

  if (name === 'sba_compact_command_audit') {
    const audit = await buildCompactCommandAudit({
      rootDir,
      source: args.source || 'operator-pack',
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(audit, false, args.format === 'compact' ? formatCompactCommandAuditCompact(audit) : '');
  }

  if (name === 'sba_completion_proof_bundle') {
    const bundle = await buildCompletionProofBundle({
      rootDir,
      candidate: args.candidate || 'github',
      includeCompactCommandAudit: Boolean(args.includeCompactCommandAudit),
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(bundle, false, args.format === 'compact' ? formatCompletionProofBundleCompact(bundle) : '');
  }

  return NOT_HANDLED;
}
