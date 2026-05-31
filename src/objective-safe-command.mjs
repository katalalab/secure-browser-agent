import fs from 'node:fs';
import path from 'node:path';
import { buildObjectiveCompletionAudit } from './objective-completion-audit.mjs';
import { buildBackgroundProofCapturePlan } from './background-proof-capture-plan.mjs';
import { buildBackgroundProofCaptureStart } from './background-proof-capture-start.mjs';
import { buildTargetHandoffResumeWatch } from './target-handoff-run.mjs';
import { buildAgentProofStepStart } from './agent-proof-step.mjs';

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function commandArgs(item) {
  return Array.isArray(item?.args) ? item.args : [];
}

function commandShell(item) {
  return String(item?.shell || '');
}

function commandHas(item, value) {
  return commandArgs(item).includes(value) || commandShell(item).includes(value);
}

function commandName(item) {
  const args = commandArgs(item);
  if (args[0] === 'node' && args[1] === 'src/cli.mjs' && args[2]) return args[2];
  const match = commandShell(item).match(/\b(target-[\w-]+|objective-[\w-]+|chrome-extension-resume)\b/);
  return match ? match[1] : '';
}

function commandOpensBrowser(item) {
  const name = commandName(item);
  return Boolean(
    name === 'target-login-capture'
      || (name === 'target-handoff-resume' && commandHas(item, '--open-login'))
      || (name === 'chrome-extension-resume' && commandHas(item, '--run'))
  );
}

function commandStartsCapture(item) {
  const name = commandName(item);
  return Boolean(
    (name === 'target-proof-capture' && commandHas(item, '--run'))
      || (name === 'target-login-capture' && !commandHas(item, '--open-only'))
      || (name === 'target-handoff-resume' && commandHas(item, '--run') && commandHas(item, '--wait-auth'))
      || (name === 'target-handoff-resume-watch' && commandHas(item, '--run'))
      || (name === 'objective-resume' && commandHas(item, '--run') && commandHas(item, '--operator-ready'))
  );
}

function sanitizeAgentSafeCommand(executionPolicy = {}) {
  const originalCommand = executionPolicy.agentSafeCommand || null;
  const monitorOnly = Boolean(executionPolicy.agentSafeCommandMonitorOnly);
  const mayOpenBrowser = Boolean(executionPolicy.agentSafeCommandMayOpenBrowser || commandOpensBrowser(originalCommand));
  const startsCapture = Boolean(executionPolicy.agentSafeCommandStartsCapture || commandStartsCapture(originalCommand));
  const unsafe = Boolean(originalCommand && (mayOpenBrowser || startsCapture) && !monitorOnly);
  if (!unsafe) {
    return {
      action: executionPolicy.agentSafeAction || 'wait-operator',
      commandId: executionPolicy.agentSafeCommandId || 'none',
      command: originalCommand,
      monitorOnly,
      mayOpenBrowser,
      startsCapture,
      blockedReason: executionPolicy.agentSafeCommandBlockedReason || ''
    };
  }
  return {
    action: 'operator-approval-required',
    commandId: 'none',
    command: null,
    monitorOnly: false,
    mayOpenBrowser: false,
    startsCapture: false,
    blockedReason: executionPolicy.agentSafeCommandBlockedReason || 'operator-approval-required'
  };
}

function buildAgentSafeNext({ safeCommand, targetApproval }) {
  if (safeCommand.command) {
    return {
      commandId: safeCommand.commandId || 'none',
      command: safeCommand.command,
      mayRunUnattended: !safeCommand.mayOpenBrowser && !safeCommand.startsCapture,
      opensBrowser: safeCommand.mayOpenBrowser,
      startsCapture: safeCommand.startsCapture,
      readsBrowserStorage: false,
      returnsPageContent: false,
      blockedReason: safeCommand.blockedReason || ''
    };
  }
  if (targetApproval?.preflightCommand) {
    return {
      commandId: 'target-approval-preflight',
      command: targetApproval.preflightCommand,
      mayRunUnattended: true,
      opensBrowser: false,
      startsCapture: false,
      readsBrowserStorage: false,
      returnsPageContent: false,
      blockedReason: safeCommand.blockedReason || 'operator-approval-required'
    };
  }
  return {
    commandId: 'none',
    command: null,
    mayRunUnattended: false,
    opensBrowser: false,
    startsCapture: false,
    readsBrowserStorage: false,
    returnsPageContent: false,
    blockedReason: safeCommand.blockedReason || 'no-safe-command'
  };
}

function monitorOverrideArgs(options = {}) {
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  return [
    ...(timeoutMs === undefined || timeoutMs === null || timeoutMs === '' ? [] : ['--monitor-timeout-ms', String(timeoutMs)]),
    ...(intervalMs === undefined || intervalMs === null || intervalMs === '' ? [] : ['--monitor-interval-ms', String(intervalMs)])
  ];
}

function valueAfter(args = [], option, fallback = '') {
  const index = args.indexOf(option);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1] || fallback;
}

function targetDirFromAudit(audit = {}) {
  const nextArgs = audit.nextAction?.command?.args || [];
  if (nextArgs[0] === 'node' && nextArgs[1] === 'src/cli.mjs' && nextArgs[2]?.startsWith('target-') && nextArgs[3]) {
    return nextArgs[3];
  }
  const safeArgs = audit.executionPolicy?.agentSafeCommand?.args || [];
  if (safeArgs[0] === 'node' && safeArgs[1] === 'src/cli.mjs' && safeArgs[2]?.startsWith('target-') && safeArgs[3]) {
    return safeArgs[3];
  }
  const target = audit.nextAction?.target || '';
  return target ? `runs/target-packs/${target}` : '';
}

async function buildHandoffResumeWatchSummary({ rootDir, generatedAt, audit, options }) {
  const targetDir = targetDirFromAudit(audit);
  const blockedReason = audit.executionPolicy?.authWatchHandoffPortReachable === false
    ? audit.executionPolicy?.agentSafeCommandBlockedReason || 'handoff-auth-check-port-unreachable'
    : '';
  if (!targetDir) {
    return {
      available: false,
      status: 'missing-target',
      blockedReason,
      selectedCommandId: '',
      selectedStartsCapture: false,
      beforeStatus: '',
      beforeLatestAuthOk: false,
      beforeCaptureCompleted: false,
      capturePlanCommand: null,
      planCommand: null,
      runCommand: null,
      error: ''
    };
  }
  const handoff = valueAfter(audit.nextAction?.command?.args || audit.executionPolicy?.agentSafeCommand?.args || [], '--handoff', 'operator-handoff.json');
  const monitorArgs = monitorOverrideArgs(options);
  const planCommand = command(['node', 'src/cli.mjs', 'target-handoff-resume-watch', targetDir, '--handoff', handoff, ...monitorArgs, '--format', 'compact']);
  const runCommand = blockedReason
    ? null
    : command(['node', 'src/cli.mjs', 'target-handoff-resume-watch', targetDir, '--handoff', handoff, '--run', ...monitorArgs, '--format', 'compact']);
  try {
    const watch = options.handoffResumeWatch || await buildTargetHandoffResumeWatch(targetDir, {
      ...options,
      rootDir,
      generatedAt,
      handoff,
      run: false
    });
    const watchBlockedReason = blockedReason || (watch.selectedCommandAvailable === false
      ? watch.selectedCommandBlockedReason || 'selected-command-unavailable'
      : '');
    return {
      available: true,
      status: watch.status || 'planned',
      blockedReason: watchBlockedReason,
      target: watch.target || '',
      targetDir,
      selectedCommandId: watch.selectedCommand?.id || '',
      selectedStartsCapture: Boolean(watch.selectedCommand?.startsCapture),
      beforeStatus: watch.statusBefore?.status || '',
      beforeLatestAuthOk: Boolean(watch.statusBefore?.latestAuthOk),
      beforeCaptureCompleted: Boolean(watch.statusBefore?.captureCompleted),
      capturePlanCommand: watch.statusBefore?.capturePlanCommand || null,
      planCommand,
      runCommand: watchBlockedReason ? null : runCommand,
      error: ''
    };
  } catch (error) {
    return {
	      available: false,
	      status: 'unavailable',
	      blockedReason,
	      target: '',
      targetDir,
      selectedCommandId: '',
      selectedStartsCapture: false,
      beforeStatus: '',
      beforeLatestAuthOk: false,
      beforeCaptureCompleted: false,
      capturePlanCommand: null,
	      planCommand,
	      runCommand,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/objective-safe-command-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid objective safe command output path: ${outPath}`);
  return outputPath;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function buildObjectiveSafeCommand(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const audit = options.audit || await buildObjectiveCompletionAudit({
    ...options,
    rootDir
  });
  const generatedAt = options.generatedAt || audit.generatedAt || new Date().toISOString();
  const outputPath = options.write || options.out || options.output
    ? safeRunPath(rootDir, options.out || options.output)
    : '';
  const executionPolicy = audit.executionPolicy || {};
  const safeCommand = sanitizeAgentSafeCommand(executionPolicy);
  const nextAction = audit.nextAction || {};
  const targetApproval = audit.targetApproval || {};
  const backgroundProofCapturePlan = options.backgroundProofCapturePlan || await buildBackgroundProofCapturePlan({
    ...options,
    rootDir,
    generatedAt,
    audit
  });
  const backgroundProofCaptureStart = options.backgroundProofCaptureStart || await buildBackgroundProofCaptureStart({
    ...options,
    rootDir,
    generatedAt,
    plan: backgroundProofCapturePlan,
    mode: 'capture',
    run: false
  });
  const backgroundProofMonitorStart = options.backgroundProofMonitorStart || await buildBackgroundProofCaptureStart({
    ...options,
    rootDir,
    generatedAt,
    plan: backgroundProofCapturePlan,
    mode: 'monitor',
    run: false
  });
  const handoffResumeWatch = await buildHandoffResumeWatchSummary({
    rootDir,
    generatedAt,
    audit,
    options
  });
  const agentProofStepStart = options.agentProofStepStart || await buildAgentProofStepStart({
    ...options,
    rootDir,
    generatedAt,
    audit,
    run: false
  });
  const agentLoopMonitorArgs = monitorOverrideArgs(options);
  const targetApprovalPreflightCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-preflight',
    '--candidate',
    targetApproval.selectedCandidate || nextAction.target || 'github',
    '--real-external',
    '--format',
    'compact'
  ]);
  const agentSafeNext = buildAgentSafeNext({
    safeCommand,
    targetApproval: {
      ...targetApproval,
      preflightCommand: targetApproval.preflightCommand || targetApprovalPreflightCommand
    }
  });
  const handoffAuthCheckPortUnreachable = executionPolicy.authWatchHandoffPortReachable === false
    || handoffResumeWatch.blockedReason === 'handoff-auth-check-port-unreachable';
  const backgroundNoOpenWaitCaptureCommand = handoffAuthCheckPortUnreachable
    ? null
    : backgroundProofCapturePlan.phases?.backgroundWaitAuthThenCaptureNoOpen?.command || null;
  const backgroundNoOpenWaitCaptureShellCommand = handoffAuthCheckPortUnreachable
    ? null
    : backgroundProofCapturePlan.phases?.backgroundWaitAuthThenCaptureNoOpen?.backgroundCommand || null;
  const result = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    source: 'objective-completion-audit',
    complete: Boolean(audit.complete),
    status: audit.status || 'unknown',
    remainingCount: audit.finalGate?.remainingCount ?? 0,
    target: nextAction.target || '',
    next: nextAction.id || '',
    operatorInput: Boolean(nextAction.needsOperatorInput),
    humanAction: nextAction.operatorGuidance?.humanAction || '',
    automationBlocker: nextAction.operatorGuidance?.automationBlocker || '',
    captureBlocked: Boolean(nextAction.operatorGuidance?.captureBlocked),
    agentSafeAction: safeCommand.action,
    commandId: safeCommand.commandId,
    command: safeCommand.command,
    monitorOnly: safeCommand.monitorOnly,
    mayOpenBrowser: safeCommand.mayOpenBrowser,
    startsCapture: safeCommand.startsCapture,
    blockedReason: safeCommand.blockedReason,
    agentSafeNext,
    authWatchHandoffPort: executionPolicy.authWatchHandoffPort ?? null,
    authWatchHandoffPortReachable: executionPolicy.authWatchHandoffPortReachable ?? null,
    proofCaptureAllowedNow: !safeCommand.monitorOnly && Boolean(safeCommand.command),
    nextArtifactAction: nextAction.nextArtifactAction || '',
    nextArtifactBlocker: nextAction.nextArtifactBlocker || '',
    missingArtifactCount: Array.isArray(nextAction.missingArtifacts) ? nextAction.missingArtifacts.length : 0,
    agentLoopStep: {
      planCommand: command(['node', 'src/cli.mjs', 'agent-loop-step', '--write', '--out', 'operator/agent-loop-step-latest.json', ...agentLoopMonitorArgs, '--format', 'compact']),
      runCommand: safeCommand.monitorOnly && safeCommand.command
        ? command(['node', 'src/cli.mjs', 'agent-loop-step', '--run', '--write', '--out', 'operator/agent-loop-step-latest.json', '--timeout-ms', '300000', ...agentLoopMonitorArgs, '--format', 'compact'])
        : null,
      statusCommand: command(['node', 'src/cli.mjs', 'agent-loop-step-status', '--in', 'operator/agent-loop-step-latest.json', '--format', 'compact'])
    },
    backgroundProofCapture: {
      planStatus: backgroundProofCapturePlan.status || '',
      target: backgroundProofCapturePlan.target || '',
      captureBlocked: Boolean(backgroundProofCapturePlan.captureBlocked),
      monitorAvailable: Boolean(backgroundProofCapturePlan.phases?.monitorAuth?.backgroundCommand),
      captureAvailable: Boolean(backgroundNoOpenWaitCaptureShellCommand),
      captureBlockedReason: handoffAuthCheckPortUnreachable ? 'handoff-auth-check-port-unreachable' : '',
      opensBrowserNow: false,
      startsCaptureNow: false,
      captureStartReadyToRun: Boolean(!handoffAuthCheckPortUnreachable && backgroundProofCaptureStart.readyToRun),
      captureStartBlockers: handoffAuthCheckPortUnreachable
        ? [...new Set([...(backgroundProofCaptureStart.blockers || []), 'handoff-auth-check-port-unreachable'])]
        : backgroundProofCaptureStart.blockers || [],
      monitorStartReadyToRun: Boolean(backgroundProofMonitorStart.readyToRun),
      monitorStartBlockers: backgroundProofMonitorStart.blockers || [],
      noOpenWaitCaptureCommand: backgroundNoOpenWaitCaptureCommand,
      backgroundNoOpenWaitCaptureCommand: backgroundNoOpenWaitCaptureShellCommand,
      statusCommand: backgroundProofCaptureStart.commands?.status || null,
      captureStartCommand: handoffAuthCheckPortUnreachable ? null : backgroundProofCaptureStart.commands?.approvedRun || null,
      monitorStartCommand: backgroundProofCapturePlan.phases?.monitorAuth?.backgroundCommand
        ? backgroundProofMonitorStart.commands?.approvedRun || null
        : null
    },
    agentProofStep: {
      startStatus: agentProofStepStart.status || '',
      startReadyToRun: Boolean(agentProofStepStart.readyToRun),
      startBlockers: agentProofStepStart.blockers || [],
      selectedCommandId: agentProofStepStart.selectedCommandId || '',
      selectedStartsCapture: Boolean(agentProofStepStart.selectedStartsCapture),
      latestAuthOk: Boolean(agentProofStepStart.latestAuthOk),
      captureCompleted: Boolean(agentProofStepStart.captureCompleted),
      opensBrowserNow: Boolean(agentProofStepStart.opensBrowserNow),
      startsCaptureNow: Boolean(agentProofStepStart.startsCaptureNow),
      startsBackgroundProcessNow: Boolean(agentProofStepStart.startsBackgroundProcessNow),
      planCommand: agentProofStepStart.step?.planCommand || null,
      runCommand: agentProofStepStart.step?.runCommand || null,
      startCommand: agentProofStepStart.commands?.approvedRun || null,
      statusCommand: agentProofStepStart.commands?.status || null
    },
    handoffResumeWatch: {
      available: Boolean(handoffResumeWatch.available),
      status: handoffResumeWatch.status || '',
      blockedReason: handoffResumeWatch.blockedReason || '',
      target: handoffResumeWatch.target || nextAction.target || '',
      targetDir: handoffResumeWatch.targetDir || '',
      selectedCommandId: handoffResumeWatch.selectedCommandId || '',
      selectedStartsCapture: Boolean(handoffResumeWatch.selectedStartsCapture),
      beforeStatus: handoffResumeWatch.beforeStatus || '',
      beforeLatestAuthOk: Boolean(handoffResumeWatch.beforeLatestAuthOk),
      beforeCaptureCompleted: Boolean(handoffResumeWatch.beforeCaptureCompleted),
      mayOpenBrowser: false,
      capturePlanCommand: handoffResumeWatch.capturePlanCommand || null,
      planCommand: handoffResumeWatch.planCommand || null,
      runCommand: handoffResumeWatch.runCommand || null,
      error: handoffResumeWatch.error || ''
    },
    targetApproval: {
      approvalPackExists: Boolean(targetApproval.approvalPackExists),
      approvalPackParseOk: Boolean(targetApproval.approvalPackParseOk),
      selectedCandidate: targetApproval.selectedCandidate || nextAction.target || '',
      targetPackExists: Boolean(targetApproval.targetPackExists),
      targetNext: targetApproval.targetNext || '',
      humanAction: targetApproval.humanAction || '',
      automationBlocker: targetApproval.automationBlocker || '',
      captureBlocked: Boolean(targetApproval.captureBlocked),
      nextCommandOpensBrowser: Boolean(targetApproval.nextCommandOpensBrowser),
      nextCommandStartsCapture: Boolean(targetApproval.nextCommandStartsCapture),
      nextCommandRequiresOperatorApproval: Boolean(targetApproval.nextCommandRequiresOperatorApproval),
      nextCommandAgentMayRunUnattended: Boolean(targetApproval.nextCommandAgentMayRunUnattended),
      resumeStatus: targetApproval.resumeStatus || '',
      resumeReadyToRun: Boolean(targetApproval.resumeReadyToRun),
      resumeOperatorOkRequired: Boolean(targetApproval.resumeOperatorOkRequired),
      resumeOperatorOkAccepted: Boolean(targetApproval.resumeOperatorOkAccepted),
      resumeAgentMayRunUnattended: Boolean(targetApproval.resumeAgentMayRunUnattended),
      resumePlannedCommandOpensBrowser: Boolean(targetApproval.resumePlannedCommandOpensBrowser),
      resumePlannedCommandStartsCapture: Boolean(targetApproval.resumePlannedCommandStartsCapture),
      operatorApprovalSummaryScope: targetApproval.operatorApprovalSummaryScope || '',
      operatorApprovalSummaryHumanAction: targetApproval.operatorApprovalSummaryHumanAction || '',
      operatorApprovalSummaryRequiresOperatorOk: Boolean(targetApproval.operatorApprovalSummaryRequiresOperatorOk),
      operatorApprovalSummaryOperatorOkAccepted: Boolean(targetApproval.operatorApprovalSummaryOperatorOkAccepted),
      operatorApprovalSummaryMayOpenBrowser: Boolean(targetApproval.operatorApprovalSummaryMayOpenBrowser),
      operatorApprovalSummaryMayStartCapture: Boolean(targetApproval.operatorApprovalSummaryMayStartCapture),
      operatorApprovalSummaryReadsBrowserStorage: Boolean(targetApproval.operatorApprovalSummaryReadsBrowserStorage),
      operatorApprovalSummaryReturnsPageContent: Boolean(targetApproval.operatorApprovalSummaryReturnsPageContent),
      operatorApprovalSummaryAgentMustNotRunUnattended: Boolean(targetApproval.operatorApprovalSummaryAgentMustNotRunUnattended),
      statusCommand: targetApproval.statusCommand || null,
      preflightCommand: targetApproval.preflightCommand || targetApprovalPreflightCommand,
      resumePreflightCommand: targetApproval.resumePreflightCommand || null,
      resumeProofPlanCommand: targetApproval.resumeProofPlanCommand || null,
      resumePlanCommand: targetApproval.resumePlanCommand || null,
      resumeStatusCommand: targetApproval.resumeStatusCommand || null,
      resumeWatchCommand: targetApproval.resumeWatchCommand || null,
      resumeRunCommand: targetApproval.resumeRunCommand || null
    }
  };

  if (options.write || options.out || options.output) {
    result.outputPath = outputPath;
    writeJson(result.outputPath, result);
  }

  return result;
}

export function formatObjectiveSafeCommandCompact(result) {
  const lines = [
    `status: ${compactValue(result.status)}`,
    `complete: ${yesNo(result.complete)}`,
    `remaining_count: ${result.remainingCount ?? 0}`,
    `target: ${compactValue(result.target)}`,
    `next: ${compactValue(result.next)}`,
    `operator_input: ${yesNo(result.operatorInput)}`,
    `human_action: ${compactValue(result.humanAction)}`,
    `automation_blocker: ${compactValue(result.automationBlocker)}`,
    `capture_blocked: ${yesNo(result.captureBlocked)}`,
    `agent_safe_action: ${compactValue(result.agentSafeAction)}`,
    `agent_safe_command_id: ${compactValue(result.commandId)}`,
    `agent_safe_command_monitor_only: ${yesNo(result.monitorOnly)}`,
    `agent_safe_command_may_open_browser: ${yesNo(result.mayOpenBrowser)}`,
    `agent_safe_command_starts_capture: ${yesNo(result.startsCapture)}`,
    `agent_safe_command_blocked_reason: ${compactValue(result.blockedReason)}`,
    `agent_safe_next_command_id: ${compactValue(result.agentSafeNext?.commandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(result.agentSafeNext?.mayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(result.agentSafeNext?.opensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(result.agentSafeNext?.startsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(result.agentSafeNext?.readsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(result.agentSafeNext?.returnsPageContent)}`,
    `agent_safe_next_blocked_reason: ${compactValue(result.agentSafeNext?.blockedReason)}`,
    `auth_watch_handoff_port: ${compactValue(result.authWatchHandoffPort)}`,
    `auth_watch_handoff_port_reachable: ${result.authWatchHandoffPortReachable === null || result.authWatchHandoffPortReachable === undefined ? 'unknown' : yesNo(result.authWatchHandoffPortReachable)}`,
    `proof_capture_allowed_now: ${yesNo(result.proofCaptureAllowedNow)}`,
    `next_artifact_action: ${compactValue(result.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(result.nextArtifactBlocker)}`,
    `missing_artifact_count: ${result.missingArtifactCount ?? 0}`,
    `background_proof_plan_status: ${compactValue(result.backgroundProofCapture?.planStatus)}`,
    `background_proof_capture_blocked: ${yesNo(result.backgroundProofCapture?.captureBlocked)}`,
    `background_proof_capture_blocked_reason: ${compactValue(result.backgroundProofCapture?.captureBlockedReason)}`,
    `background_proof_monitor_available: ${yesNo(result.backgroundProofCapture?.monitorAvailable)}`,
    `background_proof_capture_available: ${yesNo(result.backgroundProofCapture?.captureAvailable)}`,
    `background_proof_opens_browser_now: ${yesNo(result.backgroundProofCapture?.opensBrowserNow)}`,
    `background_proof_starts_capture_now: ${yesNo(result.backgroundProofCapture?.startsCaptureNow)}`,
    `background_proof_capture_start_ready: ${yesNo(result.backgroundProofCapture?.captureStartReadyToRun)}`,
    `background_proof_capture_start_blockers: ${result.backgroundProofCapture?.captureStartBlockers?.length ? result.backgroundProofCapture.captureStartBlockers.join(',') : 'none'}`,
    `background_proof_monitor_start_ready: ${yesNo(result.backgroundProofCapture?.monitorStartReadyToRun)}`,
    `background_proof_monitor_start_blockers: ${result.backgroundProofCapture?.monitorStartBlockers?.length ? result.backgroundProofCapture.monitorStartBlockers.join(',') : 'none'}`,
    `agent_proof_step_start_status: ${compactValue(result.agentProofStep?.startStatus)}`,
    `agent_proof_step_start_ready: ${yesNo(result.agentProofStep?.startReadyToRun)}`,
    `agent_proof_step_start_blockers: ${result.agentProofStep?.startBlockers?.length ? result.agentProofStep.startBlockers.join(',') : 'none'}`,
    `agent_proof_step_selected_command: ${compactValue(result.agentProofStep?.selectedCommandId)}`,
    `agent_proof_step_selected_starts_capture: ${yesNo(result.agentProofStep?.selectedStartsCapture)}`,
    `agent_proof_step_latest_auth_ok: ${yesNo(result.agentProofStep?.latestAuthOk)}`,
    `agent_proof_step_capture_completed: ${yesNo(result.agentProofStep?.captureCompleted)}`,
    `agent_proof_step_opens_browser_now: ${yesNo(result.agentProofStep?.opensBrowserNow)}`,
    `agent_proof_step_starts_capture_now: ${yesNo(result.agentProofStep?.startsCaptureNow)}`,
    `handoff_resume_watch_available: ${yesNo(result.handoffResumeWatch?.available)}`,
    `handoff_resume_watch_status: ${compactValue(result.handoffResumeWatch?.status)}`,
    `handoff_resume_watch_blocked_reason: ${compactValue(result.handoffResumeWatch?.blockedReason)}`,
    `handoff_resume_watch_selected_command: ${compactValue(result.handoffResumeWatch?.selectedCommandId)}`,
    `handoff_resume_watch_selected_starts_capture: ${yesNo(result.handoffResumeWatch?.selectedStartsCapture)}`,
    `handoff_resume_watch_before_status: ${compactValue(result.handoffResumeWatch?.beforeStatus)}`,
    `handoff_resume_watch_before_latest_auth_ok: ${yesNo(result.handoffResumeWatch?.beforeLatestAuthOk)}`,
    `handoff_resume_watch_before_capture_completed: ${yesNo(result.handoffResumeWatch?.beforeCaptureCompleted)}`,
    `handoff_resume_watch_may_open_browser: ${yesNo(result.handoffResumeWatch?.mayOpenBrowser)}`,
    `target_approval_pack_exists: ${yesNo(result.targetApproval?.approvalPackExists)}`,
    `target_approval_pack_parse_ok: ${yesNo(result.targetApproval?.approvalPackParseOk)}`,
    `target_approval_candidate: ${compactValue(result.targetApproval?.selectedCandidate)}`,
    `target_approval_target_pack_exists: ${yesNo(result.targetApproval?.targetPackExists)}`,
    `target_approval_next: ${compactValue(result.targetApproval?.targetNext)}`,
    `target_approval_human_action: ${compactValue(result.targetApproval?.humanAction)}`,
    `target_approval_automation_blocker: ${compactValue(result.targetApproval?.automationBlocker)}`,
    `target_approval_capture_blocked: ${yesNo(result.targetApproval?.captureBlocked)}`,
    `target_approval_next_command_opens_browser: ${yesNo(result.targetApproval?.nextCommandOpensBrowser)}`,
    `target_approval_next_command_starts_capture: ${yesNo(result.targetApproval?.nextCommandStartsCapture)}`,
    `target_approval_next_command_requires_operator_approval: ${yesNo(result.targetApproval?.nextCommandRequiresOperatorApproval)}`,
    `target_approval_next_command_agent_may_run_unattended: ${yesNo(result.targetApproval?.nextCommandAgentMayRunUnattended)}`,
    `target_approval_resume_status: ${compactValue(result.targetApproval?.resumeStatus)}`,
    `target_approval_resume_ready_to_run: ${yesNo(result.targetApproval?.resumeReadyToRun)}`,
    `target_approval_resume_operator_ok_required: ${yesNo(result.targetApproval?.resumeOperatorOkRequired)}`,
    `target_approval_resume_operator_ok_accepted: ${yesNo(result.targetApproval?.resumeOperatorOkAccepted)}`,
    `target_approval_resume_agent_may_run_unattended: ${yesNo(result.targetApproval?.resumeAgentMayRunUnattended)}`,
    `target_approval_resume_planned_opens_browser: ${yesNo(result.targetApproval?.resumePlannedCommandOpensBrowser)}`,
    `target_approval_resume_planned_starts_capture: ${yesNo(result.targetApproval?.resumePlannedCommandStartsCapture)}`,
    `operator_approval_summary_scope: ${compactValue(result.targetApproval?.operatorApprovalSummaryScope)}`,
    `operator_approval_summary_human_action: ${compactValue(result.targetApproval?.operatorApprovalSummaryHumanAction)}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(result.targetApproval?.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(result.targetApproval?.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(result.targetApproval?.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(result.targetApproval?.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(result.targetApproval?.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(result.targetApproval?.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(result.targetApproval?.operatorApprovalSummaryAgentMustNotRunUnattended)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`
  ];
  if (result.command?.shell) lines.push(`command: ${result.command.shell}`);
  if (result.agentSafeNext?.command?.shell) lines.push(`agent_safe_next_command: ${result.agentSafeNext.command.shell}`);
  if (result.agentLoopStep?.planCommand?.shell) lines.push(`agent_loop_step_plan_command: ${result.agentLoopStep.planCommand.shell}`);
  if (result.agentLoopStep?.runCommand?.shell) lines.push(`agent_loop_step_run_command: ${result.agentLoopStep.runCommand.shell}`);
  if (result.agentLoopStep?.statusCommand?.shell) lines.push(`agent_loop_step_status_command: ${result.agentLoopStep.statusCommand.shell}`);
  if (result.backgroundProofCapture?.statusCommand?.shell) lines.push(`background_proof_status_command: ${result.backgroundProofCapture.statusCommand.shell}`);
  if (result.backgroundProofCapture?.noOpenWaitCaptureCommand?.shell) lines.push(`background_proof_no_open_wait_capture_command: ${result.backgroundProofCapture.noOpenWaitCaptureCommand.shell}`);
  if (result.backgroundProofCapture?.backgroundNoOpenWaitCaptureCommand?.shell) lines.push(`background_proof_no_open_wait_capture_background_command: ${result.backgroundProofCapture.backgroundNoOpenWaitCaptureCommand.shell}`);
  if (result.backgroundProofCapture?.captureStartCommand?.shell) lines.push(`background_proof_capture_start_command: ${result.backgroundProofCapture.captureStartCommand.shell}`);
  if (result.backgroundProofCapture?.monitorStartCommand?.shell) lines.push(`background_proof_monitor_start_command: ${result.backgroundProofCapture.monitorStartCommand.shell}`);
  if (result.agentProofStep?.planCommand?.shell) lines.push(`agent_proof_step_plan_command: ${result.agentProofStep.planCommand.shell}`);
  if (result.agentProofStep?.runCommand?.shell) lines.push(`agent_proof_step_run_command: ${result.agentProofStep.runCommand.shell}`);
  if (result.agentProofStep?.startCommand?.shell) lines.push(`agent_proof_step_start_command: ${result.agentProofStep.startCommand.shell}`);
  if (result.agentProofStep?.statusCommand?.shell) lines.push(`agent_proof_step_status_command: ${result.agentProofStep.statusCommand.shell}`);
  if (result.handoffResumeWatch?.planCommand?.shell) lines.push(`handoff_resume_watch_plan_command: ${result.handoffResumeWatch.planCommand.shell}`);
  if (result.handoffResumeWatch?.runCommand?.shell) lines.push(`handoff_resume_watch_run_command: ${result.handoffResumeWatch.runCommand.shell}`);
  if (result.handoffResumeWatch?.capturePlanCommand?.shell) lines.push(`handoff_resume_capture_plan_command: ${result.handoffResumeWatch.capturePlanCommand.shell}`);
  if (result.handoffResumeWatch?.error) lines.push(`handoff_resume_watch_error: ${compactValue(result.handoffResumeWatch.error)}`);
  if (result.targetApproval?.statusCommand?.shell) lines.push(`target_approval_status_command: ${result.targetApproval.statusCommand.shell}`);
  if (result.targetApproval?.preflightCommand?.shell) lines.push(`target_approval_preflight_command: ${result.targetApproval.preflightCommand.shell}`);
  if (result.targetApproval?.resumePreflightCommand?.shell) lines.push(`target_approval_resume_preflight_command: ${result.targetApproval.resumePreflightCommand.shell}`);
  if (result.targetApproval?.resumeProofPlanCommand?.shell) lines.push(`target_approval_resume_proof_plan_command: ${result.targetApproval.resumeProofPlanCommand.shell}`);
  if (result.targetApproval?.resumePlanCommand?.shell) lines.push(`target_approval_resume_plan_command: ${result.targetApproval.resumePlanCommand.shell}`);
  if (result.targetApproval?.resumeStatusCommand?.shell) lines.push(`target_approval_resume_status_command: ${result.targetApproval.resumeStatusCommand.shell}`);
  if (result.targetApproval?.resumeWatchCommand?.shell) {
    lines.push('target_approval_resume_watch_opens_browser: no');
    lines.push('target_approval_resume_watch_starts_capture: no');
    lines.push('target_approval_resume_watch_requires_operator_approval: no');
    lines.push('target_approval_resume_watch_agent_may_run_unattended: yes');
    lines.push(`target_approval_resume_watch_command: ${result.targetApproval.resumeWatchCommand.shell}`);
  }
  if (result.targetApproval?.resumeRunCommand?.shell) lines.push(`target_approval_resume_run_command: ${result.targetApproval.resumeRunCommand.shell}`);
  if (result.outputPath) lines.push(`output: ${result.outputPath}`);
  return `${lines.join('\n')}\n`;
}
