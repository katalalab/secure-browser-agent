import fs from 'node:fs';
import path from 'node:path';
import { buildOperatorPack } from './operator-pack.mjs';
import { buildObjectiveCompletionAuditStatus } from './objective-completion-audit.mjs';

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function yesNoUnknown(value) {
  if (value === null || value === undefined) return 'unknown';
  return value ? 'yes' : 'no';
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/operator-runbook.md').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid operator runbook output path: ${outPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  if (!(resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`))) {
    throw new Error(`invalid operator runbook output path: ${filePath}`);
  }
  return path.relative(runsRoot, resolved);
}

function rootRelativePath(rootDir, filePath) {
  if (!filePath) return '';
  const text = String(filePath);
  if (!path.isAbsolute(text)) return text;
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const resolvedPath = path.resolve(text);
  if (resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return path.relative(resolvedRoot, resolvedPath) || '.';
  }
  return text;
}

function fileSummary(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      bytes: stat.size,
      mtime: stat.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      bytes: 0,
      mtime: ''
    };
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function ageSeconds(summary, nowMs = Date.now()) {
  if (!summary?.exists || !summary.mtime) return null;
  const mtimeMs = Date.parse(summary.mtime);
  if (!Number.isFinite(mtimeMs)) return null;
  return Math.max(0, Math.floor((nowMs - mtimeMs) / 1000));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function commandById(commands, id) {
  return (commands || []).find((item) => item.id === id || item.id === `manual-candidate-${id}`) || null;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return args.map(quote).join(' ');
}

function commandObject(args) {
  return {
    args,
    shell: command(args)
  };
}

function currentObjectiveAuditSafeNext(rootDir, options = {}) {
  const status = options.objectiveCompletionAuditStatus || buildObjectiveCompletionAuditStatus({
    rootDir,
    in: options.objectiveCompletionAuditIn || options['objective-completion-audit-in'] || 'operator/objective-completion-audit-latest.json',
    staleAfterSeconds: options.objectiveCompletionAuditStaleAfterSeconds ?? options['objective-completion-audit-stale-after-seconds']
  });
  if (!status.exists || !status.agentSafeNextMayRunUnattended) return null;
  const commandValue = status.agentSafeNextCommandId === 'objective-completion-audit-refresh'
    ? status.watchCommand || status.refreshCommand || null
    : status.agentSafeNextCommandId === 'objective-completion-audit-strict'
      ? status.strictCommand || null
      : null;
  if (!commandValue) return null;
  return {
    status,
    command: commandValue
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

function step(id, title, detail, command = null, options = {}) {
  return {
    id,
    title,
    detail,
    command,
    runAfterUserApproval: Boolean(options.runAfterUserApproval),
    opensBrowser: Boolean(options.opensBrowser),
    startsCapture: Boolean(options.startsCapture)
  };
}

export async function buildOperatorRunbook(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const write = Boolean(options.write || options.out || options.output);
  const writeChildren = Boolean(options.writeChildren ?? options['write-children'] ?? write);
  const pack = options.operatorPack || await buildOperatorPack({
    ...options,
    rootDir,
    generatedAt,
    write: writeChildren,
    out: 'operator/operator-pack-latest.json'
  });
  const objectiveCommands = pack.summaries?.objectiveHandoff?.commands || [];
  const chromeResume = pack.regularChrome?.resumeCommand || {
    shell: "'node' 'src/cli.mjs' 'chrome-extension-resume' '--format' 'compact'"
  };
  const chromeApproval = pack.regularChrome?.approvalCommand || null;
  const primaryCommand = pack.nextAction?.command || null;
  const browserRouteCommand = pack.browserRoute?.statusCommand?.shell
    || "'node' 'src/cli.mjs' 'browser-route' '--format' 'compact'";
  const backendMatrix = pack.backendMatrix || {};
  const backendMatrixStatusCommand = backendMatrix.statusCommand?.shell
    || "'node' 'src/cli.mjs' 'backend-matrix-status' '--in' 'operator/backend-matrix-latest.json' '--format' 'compact'";
  const proofPipeline = pack.proofPipeline || {};
  const proofPipelineCommand = proofPipeline.command?.shell
    || "'node' 'src/cli.mjs' 'objective-proof-pipeline' '--format' 'compact'";
  const loginHandoff = pack.loginHandoff || {};
  const watchCommand = commandById(objectiveCommands, 'proof-gate-watch')?.shell || '';
  const authWatchCommand = loginHandoff.safeMonitorAvailable === false
    ? ''
    : commandById(objectiveCommands, 'auth-watch')?.shell || '';
  const statusCommand = "'node' 'src/cli.mjs' 'proof-gate-status' '--format' 'compact'";
  const completionAuditCommand = commandById(objectiveCommands, 'completion-audit')?.shell
    || "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'markdown'";
  const compactCommandAuditAllCommand = command(['node', 'src/cli.mjs', 'compact-command-audit', '--source', 'all', '--strict', '--format', 'compact']);
  const monitorArgs = monitorOverrideArgs(options);
  const operatorPackCommand = command(['node', 'src/cli.mjs', 'operator-pack', '--write', ...monitorArgs, '--format', 'compact']);
  const secretHandoffCommand = "'node' 'src/cli.mjs' 'secret-env-handoff' '--format' 'compact'";
  const chromeHandoffCommand = "'node' 'src/cli.mjs' 'chrome-extension-handoff' '--format' 'compact'";
  const backgroundProof = pack.backgroundProofCapture || {};
  const loginHandoffStatusCommand = loginHandoff.statusCommand?.shell
    || "'node' 'src/cli.mjs' 'login-handoff-status' '--format' 'compact'";
  const backgroundProofStatusCommand = backgroundProof.statusCommand?.shell
    || "'node' 'src/cli.mjs' 'background-proof-capture-status' '--format' 'compact'";
  const backgroundProofNoOpenWaitCaptureCommand = backgroundProof.noOpenWaitCaptureCommand?.shell || '';
  const backgroundProofNoOpenWaitCaptureBackgroundCommand = backgroundProof.backgroundNoOpenWaitCaptureCommand?.shell || '';
  const backgroundProofCaptureStartCommand = backgroundProof.backgroundCaptureAvailable
    ? backgroundProof.captureStartCommand?.shell || ''
    : '';
  const backgroundProofMonitorStartCommand = backgroundProof.monitorStartCommand?.shell || '';
  const agentLoopStepStatus = pack.agentLoopStepStatus || {};
  const executionPolicy = pack.executionPolicy || {};
  const targetApproval = pack.targetApproval || {};
  const targetApprovalCandidate = targetApproval.selectedCandidate || pack.target || 'github';
  const targetApprovalStatusCommand = targetApproval.statusCommand?.shell
    || command(['node', 'src/cli.mjs', 'target-approval-status', '--candidate', targetApprovalCandidate, '--real-external', '--format', 'compact']);
  const targetApprovalPreflightCommand = targetApproval.preflightCommand?.shell
    || command(['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', targetApprovalCandidate, '--real-external', '--format', 'compact']);
  const targetApprovalResumePlanCommand = command(['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', targetApprovalCandidate, '--real-external', '--format', 'compact']);
  const targetApprovalResumeRunCommand = targetApproval.resumeRunCommand?.shell || '';
  const agentLoopStepStatusCommand = executionPolicy.agentLoopStepStatusCommand?.shell
    || "'node' 'src/cli.mjs' 'agent-loop-step-status' '--in' 'operator/agent-loop-step-latest.json' '--format' 'compact'";
  const agentLoopStepRecommendationCommand = agentLoopStepStatus.recommendedCommand?.shell || '';
  const agentLoopStepRunCommand = agentLoopStepStatus.recommendedCommandId === 'run-agent-loop-step'
    ? agentLoopStepStatus.recommendedCommand || agentLoopStepStatus.runCommand || null
    : null;
  const providerDoctorStatus = pack.providerDoctorStatus || {};
  const agentNext = pack.agentNext || {
    nextAction: agentLoopStepStatus.nextAction || executionPolicy.agentSafeAction || 'none',
    agentCanRunWithoutApproval: Boolean(
      agentLoopStepRunCommand
      && !agentLoopStepStatus.opensBrowserNow
      && !agentLoopStepStatus.startsCaptureNow
    ),
    agentCommandId: agentLoopStepStatus.commandId || executionPolicy.agentSafeCommandId || 'none',
    agentRunCommand: agentLoopStepRunCommand,
    agentStatusCommand: executionPolicy.agentLoopStepStatusCommand || null,
    agentStepPlanCommand: executionPolicy.agentLoopStepPlanCommand || null,
    agentStepStatusCommand: executionPolicy.agentLoopStepStatusCommand || null,
    agentPreflightAvailable: true,
    agentPreflightAction: 'run-operator-approval-preflight',
    agentPreflightMayRunWithoutApproval: true,
    agentPreflightCommand: targetApproval.preflightCommand || { shell: targetApprovalPreflightCommand },
    operatorApprovalRequired: Boolean(
      pack.operatorInput
      || targetApproval.resumeOperatorOkRequired
      || targetApproval.nextCommandRequiresOperatorApproval
    ),
    operatorApprovalCommand: targetApproval.resumeRunCommand || null,
    operatorApprovalPreflightCommand: targetApproval.preflightCommand || { shell: targetApprovalPreflightCommand },
    operatorApprovalPlanCommand: targetApproval.resumePlanCommand || { shell: targetApprovalResumePlanCommand },
    operatorApprovalPreflightOpensBrowser: false,
    operatorApprovalPreflightStartsCapture: false,
    operatorApprovalPreflightReadsBrowserStorage: false,
    operatorApprovalPreflightReturnsPageContent: false,
    operatorApprovalPreflightMayRunUnattended: true,
    operatorApprovalCommandOpensBrowser: Boolean(
      targetApproval.resumePlannedCommandOpensBrowser
      || targetApproval.nextCommandOpensBrowser
    ),
    operatorApprovalCommandStartsCapture: Boolean(
      targetApproval.resumePlannedCommandStartsCapture
      || targetApproval.nextCommandStartsCapture
    ),
    operatorApprovalCommandAgentMayRunUnattended: false,
    humanAction: targetApproval.humanAction || pack.operatorGuidance?.humanAction || '',
    automationBlocker: targetApproval.automationBlocker || pack.operatorGuidance?.automationBlocker || '',
    opensBrowserNow: false,
    startsCaptureNow: false,
    providerDefaultBackend: providerDoctorStatus.defaultBackend || pack.backendMatrix?.defaultBackend || '',
    providerDefaultAgentInterface: providerDoctorStatus.defaultAgentInterface || pack.backendMatrix?.defaultAgentInterface || '',
    providerLightpandaReadyForPublicBenchmark: Boolean(providerDoctorStatus.lightpanda?.readyForPublicBenchmark),
    providerLightpandaBenchmarkAgentMayRunUnattended: Boolean(providerDoctorStatus.lightpanda?.benchmarkAgentMayRunUnattended),
    providerLightpandaBenchmarkStartsBrowser: Boolean(providerDoctorStatus.lightpanda?.benchmarkStartsBrowser),
    providerLightpandaBenchmarkReadsBrowserStorage: Boolean(providerDoctorStatus.lightpanda?.benchmarkReadsBrowserStorage),
    providerLightpandaBenchmarkReturnsPageContent: Boolean(providerDoctorStatus.lightpanda?.benchmarkReturnsPageContent),
    providerLightpandaBenchmarkCommand: providerDoctorStatus.lightpanda?.benchmarkCommand || providerDoctorStatus.commands?.lightpandaBenchmark || '',
    providerPlaywrightReadyForPublicSmoke: Boolean(providerDoctorStatus.playwright?.readyForPublicSmoke),
    providerPlaywrightReadyForAuthenticatedDefault: Boolean(providerDoctorStatus.playwright?.readyForAuthenticatedDefault),
    providerPlaywrightStorageStateSensitive: Boolean(providerDoctorStatus.playwright?.storageStateSensitive),
    providerPlaywrightSmokeCommand: providerDoctorStatus.playwright?.smokeCommand || providerDoctorStatus.commands?.playwrightSmoke || '',
    providerSeleniumReadyForLocalSmoke: Boolean(providerDoctorStatus.selenium?.readyForLocalSmoke),
    providerSeleniumSmokeAgentMayRunUnattended: Boolean(providerDoctorStatus.selenium?.smokeAgentMayRunUnattended),
    providerSeleniumSmokeStartsBrowser: Boolean(providerDoctorStatus.selenium?.smokeStartsBrowser),
    providerSeleniumSmokeCommand: providerDoctorStatus.selenium?.smokeCommand || providerDoctorStatus.commands?.seleniumSmoke || '',
    providerDoctorCommand: { shell: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']) },
    providerDoctorOpensBrowser: false,
    providerDoctorStartsCapture: false,
    providerDoctorReadsBrowserStorage: false,
    providerDoctorReturnsPageContent: false,
    providerDoctorMayRunUnattended: true
  };
  const agentNextCommand = agentNext.command?.shell
    || command(['node', 'src/cli.mjs', 'agent-next', ...monitorArgs, '--format', 'compact']);
  if (!agentNext.objectiveCompletionStrictCommand?.shell) {
    agentNext.objectiveCompletionStrictCommand = {
      shell: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact'])
    };
  }
  if (!agentNext.providerDefaultBackend) agentNext.providerDefaultBackend = pack.backendMatrix?.defaultBackend || '';
  if (!agentNext.providerDefaultAgentInterface) agentNext.providerDefaultAgentInterface = pack.backendMatrix?.defaultAgentInterface || '';
  if (!agentNext.providerLightpandaBenchmarkCommand) {
    agentNext.providerLightpandaBenchmarkCommand = providerDoctorStatus.lightpanda?.benchmarkCommand || providerDoctorStatus.commands?.lightpandaBenchmark || '';
  }
  if (!agentNext.providerPlaywrightSmokeCommand) {
    agentNext.providerPlaywrightSmokeCommand = providerDoctorStatus.playwright?.smokeCommand || providerDoctorStatus.commands?.playwrightSmoke || '';
  }
  if (!agentNext.providerSeleniumSmokeCommand) {
    agentNext.providerSeleniumSmokeCommand = providerDoctorStatus.selenium?.smokeCommand || providerDoctorStatus.commands?.seleniumSmoke || '';
  }
  if (!agentNext.providerDoctorCommand?.shell) {
    agentNext.providerDoctorCommand = {
      shell: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact'])
    };
  }
  agentNext.providerDoctorOpensBrowser = Boolean(agentNext.providerDoctorOpensBrowser);
  agentNext.providerDoctorStartsCapture = Boolean(agentNext.providerDoctorStartsCapture);
  agentNext.providerDoctorReadsBrowserStorage = Boolean(agentNext.providerDoctorReadsBrowserStorage);
  agentNext.providerDoctorReturnsPageContent = Boolean(agentNext.providerDoctorReturnsPageContent);
  agentNext.providerDoctorMayRunUnattended = true;
  const savedAgentProofChecklist = pack.agentProofChecklist || {};
  const agentProofChecklistCommand = savedAgentProofChecklist.command?.shell
    || command(['node', 'src/cli.mjs', 'agent-proof-checklist', '--candidate', targetApprovalCandidate, '--format', 'compact']);
  const agentProofChecklistWriteCommand = savedAgentProofChecklist.writeCommand?.shell
    || command(['node', 'src/cli.mjs', 'agent-proof-checklist', '--candidate', targetApprovalCandidate, '--write', '--out', 'operator/agent-proof-checklist-latest.json', '--format', 'compact']);
  const agentProofChecklistStatusCommand = savedAgentProofChecklist.statusCommand?.shell
    || command(['node', 'src/cli.mjs', 'agent-proof-checklist-status', '--in', 'operator/agent-proof-checklist-latest.json', '--format', 'compact']);
  const agentProofChecklistOperatorResumeCommand = savedAgentProofChecklist.operatorResumeCommand?.shell || targetApprovalResumeRunCommand || '';
  const agentProofChecklist = {
    ...savedAgentProofChecklist,
    command: { ...(savedAgentProofChecklist.command || {}), shell: agentProofChecklistCommand },
    writeCommand: { ...(savedAgentProofChecklist.writeCommand || {}), shell: agentProofChecklistWriteCommand },
    statusCommand: { ...(savedAgentProofChecklist.statusCommand || {}), shell: agentProofChecklistStatusCommand },
    ...(agentProofChecklistOperatorResumeCommand
      ? { operatorResumeCommand: { ...(savedAgentProofChecklist.operatorResumeCommand || {}), shell: agentProofChecklistOperatorResumeCommand } }
      : {})
  };
  const savedAgentProofCloseout = pack.agentProofCloseout || {};
  const agentProofCloseoutCommand = savedAgentProofCloseout.command?.shell
    && savedAgentProofCloseout.command.shell.includes('--include-compact-command-audit')
    ? savedAgentProofCloseout.command.shell
    : command(['node', 'src/cli.mjs', 'agent-proof-closeout', '--candidate', targetApprovalCandidate, '--include-compact-command-audit', '--format', 'compact']);
  const agentProofCloseoutWriteCommand = savedAgentProofCloseout.writeCommand?.shell
    && savedAgentProofCloseout.writeCommand.shell.includes('--include-compact-command-audit')
    ? savedAgentProofCloseout.writeCommand.shell
    : command(['node', 'src/cli.mjs', 'agent-proof-closeout', '--candidate', targetApprovalCandidate, '--write', '--out', 'operator/agent-proof-closeout-latest.json', '--include-compact-command-audit', '--format', 'compact']);
  const agentProofCloseoutStatusCommand = savedAgentProofCloseout.statusCommand?.shell
    || command(['node', 'src/cli.mjs', 'agent-proof-closeout-status', '--in', 'operator/agent-proof-closeout-latest.json', '--format', 'compact']);
  const agentProofCloseoutChecklistRefreshCommand = savedAgentProofCloseout.checklistRefreshCommand?.shell
    || agentProofChecklistWriteCommand;
  const agentProofCloseoutChecklistStatusCommand = savedAgentProofCloseout.checklistStatusCommand?.shell
    || agentProofChecklistStatusCommand;
  const agentProofCloseoutCompletionProofBundleCommand = savedAgentProofCloseout.completionProofBundleCommand?.shell
    || command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', targetApprovalCandidate, '--include-compact-command-audit', '--write', '--out', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']);
  const agentProofCloseoutCompletionProofBundleWithAuditCommand = savedAgentProofCloseout.completionProofBundleWithAuditCommand?.shell
    || command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', targetApprovalCandidate, '--include-compact-command-audit', '--write', '--out', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']);
  const agentProofCloseoutCompletionProofBundleStatusCommand = savedAgentProofCloseout.completionProofBundleStatusCommand?.shell
    || command(['node', 'src/cli.mjs', 'completion-proof-bundle-status', '--in', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']);
  const agentProofCloseoutCompactCommandAuditAllCommand = savedAgentProofCloseout.compactCommandAuditAllCommand?.shell
    || compactCommandAuditAllCommand;
  const agentProofCloseoutObjectiveCompletionCommand = savedAgentProofCloseout.objectiveCompletionCommand?.shell
    || command(['node', 'src/cli.mjs', 'objective-completion-audit', '--format', 'compact']);
  const agentProofCloseoutObjectiveCompletionStrictCommand = savedAgentProofCloseout.objectiveCompletionStrictCommand?.shell
    || command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']);
  const agentProofCloseoutAgentSafeNextCommand = savedAgentProofCloseout.agentSafeNextCommand?.shell
    || command(['node', 'src/cli.mjs', 'agent-preflight', '--candidate', targetApprovalCandidate, '--real-external', '--format', 'compact']);
  const agentProofCloseoutTargetApprovalPreflightCommand = savedAgentProofCloseout.targetApprovalPreflightCommand?.shell
    || command(['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', targetApprovalCandidate, '--real-external', '--format', 'compact']);
  const agentProofCloseoutOperatorResumeCommand = savedAgentProofCloseout.operatorResumeCommand?.shell
    || targetApprovalResumeRunCommand
    || '';
  const agentProofCloseoutOperatorResumeRequiresOperatorApproval = savedAgentProofCloseout.operatorResumeRequiresOperatorApproval
    ?? Boolean(agentProofCloseoutOperatorResumeCommand);
  const agentProofCloseoutOperatorResumeOpensBrowser = savedAgentProofCloseout.operatorResumeOpensBrowser
    ?? Boolean(targetApproval.resumePlannedCommandOpensBrowser || targetApproval.nextCommandOpensBrowser);
  const agentProofCloseoutOperatorResumeStartsCapture = savedAgentProofCloseout.operatorResumeStartsCapture
    ?? Boolean(targetApproval.resumePlannedCommandStartsCapture || targetApproval.nextCommandStartsCapture);
  const agentProofCloseoutOperatorResumeAgentMayRunUnattended = savedAgentProofCloseout.operatorResumeAgentMayRunUnattended
    ?? false;
  const agentProofCloseoutProviderDoctorStatusCommand = savedAgentProofCloseout.providerDoctorStatusCommand?.shell
    || command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']);
  const targetApprovalCompletionProofBundleWithAuditCommand = targetApproval.completionProofBundleWithAuditCommand?.shell
    || agentProofCloseoutCompletionProofBundleWithAuditCommand;
  const targetApprovalAgentProofCloseoutWriteCommand = targetApproval.agentProofCloseoutWriteCommand?.shell
    || agentProofCloseoutWriteCommand;
  const targetApprovalAgentProofCloseoutStatusCommand = targetApproval.agentProofCloseoutStatusCommand?.shell
    || agentProofCloseoutStatusCommand;
  const targetApprovalObjectiveCompletionStrictCommand = targetApproval.objectiveCompletionStrictCommand?.shell
    || agentProofCloseoutObjectiveCompletionStrictCommand;
  const enrichedTargetApproval = {
    ...targetApproval,
    completionProofBundleWithAuditCommand: {
      ...(targetApproval.completionProofBundleWithAuditCommand || {}),
      shell: targetApprovalCompletionProofBundleWithAuditCommand
    },
    agentProofCloseoutWriteCommand: {
      ...(targetApproval.agentProofCloseoutWriteCommand || {}),
      shell: targetApprovalAgentProofCloseoutWriteCommand
    },
    agentProofCloseoutStatusCommand: {
      ...(targetApproval.agentProofCloseoutStatusCommand || {}),
      shell: targetApprovalAgentProofCloseoutStatusCommand
    },
    objectiveCompletionStrictCommand: {
      ...(targetApproval.objectiveCompletionStrictCommand || {}),
      shell: targetApprovalObjectiveCompletionStrictCommand
    }
  };
  const agentProofCloseout = {
    ...savedAgentProofCloseout,
    agentSafeNextCommandId: savedAgentProofCloseout.agentSafeNextCommandId || 'agent-preflight',
    agentSafeNextMayRunUnattended: savedAgentProofCloseout.agentSafeNextMayRunUnattended ?? true,
    agentSafeNextOpensBrowser: Boolean(savedAgentProofCloseout.agentSafeNextOpensBrowser),
    agentSafeNextStartsCapture: Boolean(savedAgentProofCloseout.agentSafeNextStartsCapture),
    operatorResumeRequiresOperatorApproval: Boolean(agentProofCloseoutOperatorResumeRequiresOperatorApproval),
    operatorResumeOpensBrowser: Boolean(agentProofCloseoutOperatorResumeOpensBrowser),
    operatorResumeStartsCapture: Boolean(agentProofCloseoutOperatorResumeStartsCapture),
    operatorResumeAgentMayRunUnattended: Boolean(agentProofCloseoutOperatorResumeAgentMayRunUnattended),
    providerDefaultBackend: savedAgentProofCloseout.providerDefaultBackend || agentNext.providerDefaultBackend || '',
    providerDefaultAgentInterface: savedAgentProofCloseout.providerDefaultAgentInterface || agentNext.providerDefaultAgentInterface || '',
    providerPlaywrightReadyForPublicSmoke: Boolean(savedAgentProofCloseout.providerPlaywrightReadyForPublicSmoke ?? agentNext.providerPlaywrightReadyForPublicSmoke),
    providerPlaywrightReadyForAuthenticatedDefault: Boolean(savedAgentProofCloseout.providerPlaywrightReadyForAuthenticatedDefault ?? agentNext.providerPlaywrightReadyForAuthenticatedDefault),
    providerPlaywrightStorageStateSensitive: Boolean(savedAgentProofCloseout.providerPlaywrightStorageStateSensitive ?? agentNext.providerPlaywrightStorageStateSensitive),
    providerDoctorOpensBrowser: Boolean(savedAgentProofCloseout.providerDoctorOpensBrowser),
    providerDoctorStartsCapture: Boolean(savedAgentProofCloseout.providerDoctorStartsCapture),
    providerDoctorReadsBrowserStorage: Boolean(savedAgentProofCloseout.providerDoctorReadsBrowserStorage),
    providerDoctorReturnsPageContent: Boolean(savedAgentProofCloseout.providerDoctorReturnsPageContent),
    providerDoctorMayRunUnattended: Boolean(savedAgentProofCloseout.providerDoctorMayRunUnattended ?? true),
    command: { ...(savedAgentProofCloseout.command || {}), shell: agentProofCloseoutCommand },
    writeCommand: { ...(savedAgentProofCloseout.writeCommand || {}), shell: agentProofCloseoutWriteCommand },
    statusCommand: { ...(savedAgentProofCloseout.statusCommand || {}), shell: agentProofCloseoutStatusCommand },
    checklistRefreshCommand: { ...(savedAgentProofCloseout.checklistRefreshCommand || {}), shell: agentProofCloseoutChecklistRefreshCommand },
    checklistStatusCommand: { ...(savedAgentProofCloseout.checklistStatusCommand || {}), shell: agentProofCloseoutChecklistStatusCommand },
    completionProofBundleCommand: { ...(savedAgentProofCloseout.completionProofBundleCommand || {}), shell: agentProofCloseoutCompletionProofBundleCommand },
    completionProofBundleWithAuditCommand: { ...(savedAgentProofCloseout.completionProofBundleWithAuditCommand || {}), shell: agentProofCloseoutCompletionProofBundleWithAuditCommand },
    completionProofBundleStatusCommand: { ...(savedAgentProofCloseout.completionProofBundleStatusCommand || {}), shell: agentProofCloseoutCompletionProofBundleStatusCommand },
    compactCommandAuditAllCommand: { ...(savedAgentProofCloseout.compactCommandAuditAllCommand || {}), shell: agentProofCloseoutCompactCommandAuditAllCommand },
    objectiveCompletionCommand: { ...(savedAgentProofCloseout.objectiveCompletionCommand || {}), shell: agentProofCloseoutObjectiveCompletionCommand },
    objectiveCompletionStrictCommand: { ...(savedAgentProofCloseout.objectiveCompletionStrictCommand || {}), shell: agentProofCloseoutObjectiveCompletionStrictCommand },
    agentSafeNextCommand: { ...(savedAgentProofCloseout.agentSafeNextCommand || {}), shell: agentProofCloseoutAgentSafeNextCommand },
    targetApprovalPreflightCommand: { ...(savedAgentProofCloseout.targetApprovalPreflightCommand || {}), shell: agentProofCloseoutTargetApprovalPreflightCommand },
    providerDoctorStatusCommand: { ...(savedAgentProofCloseout.providerDoctorStatusCommand || {}), shell: agentProofCloseoutProviderDoctorStatusCommand },
    ...(agentProofCloseoutOperatorResumeCommand
      ? { operatorResumeCommand: { ...(savedAgentProofCloseout.operatorResumeCommand || {}), shell: agentProofCloseoutOperatorResumeCommand } }
      : {})
  };
  const runbookSteps = [];

  runbookSteps.push(step(
    'status',
    'Refresh proof gate status',
    'Use this before and after any browser/login action. It does not open a browser or read secrets.',
    statusCommand
  ));
  runbookSteps.push(step(
    'browser-route',
    'Check the safe browser lane',
    'Use this to choose between everyday Chrome extension, dedicated target profile, Lightpanda public crawl, and Selenium compatibility lanes without opening a browser.',
    browserRouteCommand
  ));
  runbookSteps.push(step(
    'backend-matrix',
    'Check backend matrix freshness and selected backends',
    'Use this to confirm the current default, authenticated, existing-tab, public-crawl, and compatibility backends without opening Chrome or reading browser storage.',
    backendMatrixStatusCommand
  ));
  runbookSteps.push(step(
    'proof-pipeline',
    'Check the three-phase proof pipeline',
    'Use this to see the current monitor-auth, reopen-login, and wait-auth-capture commands without opening a browser or starting capture.',
    proofPipelineCommand
  ));
  runbookSteps.push(step(
    'agent-next',
    'Check the next agent-safe action',
    'Use this as the low-token handoff for whether an agent may run now or must wait for operator approval. It never opens Chrome or starts capture.',
    agentNextCommand
  ));
  runbookSteps.push(step(
    'agent-proof-checklist',
    'Check the short proof checklist and approval boundary',
    'Use this to see remaining proof gates and the operator-only resume command. It never opens Chrome, starts capture, reads browser storage, or returns page content.',
    agentProofChecklistCommand
  ));
  runbookSteps.push(step(
    'agent-proof-closeout',
    'Run the final proof closeout summary',
    'Use this after an operator login/resume attempt to confirm whether the real-external proof is complete. It never opens Chrome, starts capture, reads browser storage, or returns page content.',
    agentProofCloseoutCommand
  ));
  if (pack.regularChrome?.userPermissionRequired && chromeApproval?.shell) {
    runbookSteps.push(step(
      'regular-chrome-resume-plan',
      'Plan everyday Chrome extension retry',
      'This reports the gated resume state and does not open Chrome.',
      chromeResume.shell
    ));
    runbookSteps.push(step(
      'regular-chrome-retry',
      'Optional everyday Chrome extension retry',
      'Run only after the operator explicitly says OK. This uses chrome-extension-resume so the selected everyday Chrome profile opens only with the OK gate.',
      chromeApproval.shell,
      { runAfterUserApproval: true, opensBrowser: true }
    ));
  } else {
    runbookSteps.push(step(
      'regular-chrome-status',
      'Check everyday Chrome extension handoff',
      'Use this to inspect regular Chrome readiness without opening Chrome.',
      chromeHandoffCommand
    ));
  }
  runbookSteps.push(step(
    'secret-boundary',
    'Check 1Password and non-browser secret boundary',
    'Use this when API keys or non-browser secret environment are needed. Website login remains in dedicated Chrome target profiles.',
    secretHandoffCommand
  ));
  if (watchCommand) {
    runbookSteps.push(step(
      'watch',
      'Start a low-token proof-gate watcher',
      'This writes a status file and never starts capture. Use it while the operator completes login.',
      watchCommand
    ));
  }
  if (authWatchCommand) {
    runbookSteps.push(step(
      'target-auth-watch',
      'Poll the dedicated login browser auth state',
      'This watches the saved target auth-check without opening a browser or starting proof capture.',
      authWatchCommand
    ));
  }
  runbookSteps.push(step(
    'login-handoff-status',
    'Check the shortest login handoff state',
    'This condenses the proof gate into monitor/open-login/capture-after-auth decisions. It never opens a browser or starts capture.',
    loginHandoffStatusCommand
  ));
  runbookSteps.push(step(
    'target-approval-status',
    'Check target approval and proof inventory',
    'This reads the saved approval pack and target proof inventory without opening Chrome, starting capture, reading browser storage, or returning page content.',
    targetApprovalStatusCommand
  ));
  runbookSteps.push(step(
    'target-approval-preflight',
    'Check real-external target approval preflight',
    'Use this before any target approval resume. It forces real-external inventory semantics and separates agent-safe polling from operator-only login/capture commands.',
    targetApprovalPreflightCommand
  ));
  runbookSteps.push(step(
    'compact-command-audit-all',
    'Check every compact command surface before approval',
    'Use this before any operator-approved browser or capture command. It audits operator-pack, control-status, and run-gate-audit compact output for unclassified browser/capture/background commands.',
    compactCommandAuditAllCommand
  ));
  runbookSteps.push(step(
    'target-approval-resume-plan',
    'Plan the target approval resume command',
    'This reports the current selected next command and whether it would open Chrome or start capture. It does not execute the command.',
    targetApprovalResumePlanCommand
  ));
  if (targetApprovalResumeRunCommand) {
    runbookSteps.push(step(
      'target-approval-resume-run',
      'Optional gated target approval resume',
      'Run only after the operator explicitly says OK. This routes through target-approval-resume and preserves the operator-ok gate before any browser open or capture path.',
      targetApprovalResumeRunCommand,
      {
        runAfterUserApproval: true,
        opensBrowser: Boolean(targetApproval.resumePlannedCommandOpensBrowser),
        startsCapture: Boolean(targetApproval.resumePlannedCommandStartsCapture)
      }
    ));
  }
  runbookSteps.push(step(
    'background-proof-status',
    'Check background proof capture status',
    'This reads PID files, sanitized logs, and target status files. It does not open a browser, start capture, or read secrets.',
    backgroundProofStatusCommand
  ));
  runbookSteps.push(step(
    'agent-loop-step-status',
    'Check the saved agent loop step',
    'This reads the persisted monitor-wrapper decision and reports whether it is fresh, stale, runnable, or should be refreshed.',
    agentLoopStepStatusCommand
  ));
  if (agentLoopStepRecommendationCommand) {
    const recommendedId = agentLoopStepStatus.recommendedCommandId || 'refresh-agent-loop-step';
    runbookSteps.push(step(
      'agent-loop-step-recommendation',
      recommendedId === 'run-agent-loop-step'
        ? 'Run the saved monitor-only agent loop step'
        : 'Refresh the saved agent loop step',
      recommendedId === 'run-agent-loop-step'
        ? 'This runs only the saved allowlisted monitor command. It must not open Chrome or start proof capture.'
        : 'This refreshes the saved wrapper from current control status without opening Chrome, starting capture, or reading secrets.',
      agentLoopStepRecommendationCommand,
      {
        opensBrowser: Boolean(agentLoopStepStatus.opensBrowserNow),
        startsCapture: Boolean(agentLoopStepStatus.startsCaptureNow)
      }
    ));
  }
  if (backgroundProofMonitorStartCommand) {
    runbookSteps.push(step(
      'background-auth-monitor-start',
      'Optional gated background auth monitor',
      'Run only after the operator explicitly says OK. This starts the monitor-only auth watch in the background and never starts proof capture.',
      backgroundProofMonitorStartCommand,
      { runAfterUserApproval: true }
    ));
  }
  if (backgroundProofNoOpenWaitCaptureCommand) {
    runbookSteps.push(step(
      'background-proof-no-open-wait-capture',
      'No-open wait-auth proof capture',
      'Use only after the operator has opened or completed login separately. This does not open Chrome and waits for auth before proof capture.',
      backgroundProofNoOpenWaitCaptureCommand,
      { runAfterUserApproval: true, startsCapture: true }
    ));
  }
  if (backgroundProofNoOpenWaitCaptureBackgroundCommand) {
    runbookSteps.push(step(
      'background-proof-no-open-wait-capture-background',
      'No-open wait-auth proof capture in background',
      'Use only after the operator has opened or completed login separately. This starts the no-open wait-auth capture lane in the background.',
      backgroundProofNoOpenWaitCaptureBackgroundCommand,
      { runAfterUserApproval: true, startsCapture: true }
    ));
  }
  if (backgroundProofCaptureStartCommand) {
    runbookSteps.push(step(
      'background-proof-capture-start',
      'Optional gated no-open background proof capture',
      'Run only after the operator explicitly says OK and has opened or completed login separately. This waits for auth and captures only after auth-check passes.',
      backgroundProofCaptureStartCommand,
      { runAfterUserApproval: true, startsCapture: true }
    ));
  }
  if (primaryCommand?.shell) {
    runbookSteps.push(step(
      'primary',
      'Run the current real external proof lane',
      'This command checks auth first and should only capture proof after the dedicated browser login is proved.',
      primaryCommand.shell,
      { opensBrowser: primaryCommand.shell.includes('--open-login'), startsCapture: true }
    ));
  }
  runbookSteps.push(step(
    'operator-pack',
    'Refresh the combined operator pack',
    'Writes current objective, proof gate, Chrome, 1Password, and handoff state under runs/operator.',
    operatorPackCommand
  ));
  runbookSteps.push(step(
    'completion-audit',
    'Run the strict completion audit',
    'This is the final gate. It exits non-zero until all objective requirements are proved.',
    completionAuditCommand
  ));

  const runbook = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    complete: Boolean(pack.complete),
    status: pack.status || 'unknown',
    target: pack.target || '',
    targetDir: pack.targetDir || '',
    operatorInput: Boolean(pack.operatorInput),
    operatorGuidance: pack.operatorGuidance || null,
    authState: pack.authState || '',
    authUsable: Boolean(pack.authUsable),
    profileAuthMetadataOnly: Boolean(pack.profileAuthMetadataOnly),
    handoffAuthCheckPort: pack.handoffAuthCheckPort || '',
    handoffAuthCheckPortReachable: pack.handoffAuthCheckPortReachable ?? null,
    missingArtifacts: pack.summaries?.proofGateStatus?.missingArtifacts || [],
    missingArtifactCount: pack.missingArtifactCount || 0,
    acceptedExternalProofCount: pack.acceptedExternalProofCount || 0,
    proofGateArtifactAction: pack.proofGateArtifactAction || {},
    loginHandoff,
    browserRoute: pack.browserRoute || {},
    backendMatrix,
    proofPipeline,
    agentNext,
    agentProofChecklist,
    agentProofCloseout,
    targetApproval: enrichedTargetApproval,
    backgroundProofCapture: backgroundProof,
    agentLoopStepStatus,
    regularChrome: pack.regularChrome || {},
    secrets: pack.secrets || {},
    files: pack.files || {},
    steps: runbookSteps,
    outputPath: ''
  };

  if (write) {
    const outputPath = safeRunPath(rootDir, options.out || options.output);
    runbook.outputPath = outputPath;
    const content = outputPath.endsWith('.md')
      ? formatOperatorRunbookMarkdown(runbook)
      : `${JSON.stringify(runbook, null, 2)}\n`;
    writeFile(outputPath, content);
  }

  return runbook;
}

export function buildOperatorRunbookStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const inputPath = safeRunPath(rootDir, options.in || options.input || 'operator/operator-runbook-latest.json');
  const input = fileSummary(inputPath);
  const saved = input.exists ? readJson(inputPath) : null;
  const parseOk = !input.exists || Boolean(saved);
  const age = ageSeconds(input, options.nowMs || Date.now());
  const stale = !input.exists || !parseOk || age === null || age > staleAfterSeconds;
  const steps = Array.isArray(saved?.steps) ? saved.steps : [];
  const refreshCommand = commandObject([
    'node',
    'src/cli.mjs',
    'operator-runbook-watch',
    '--run',
    '--in',
    runsRelativePath(rootDir, inputPath),
    '--out',
    runsRelativePath(rootDir, inputPath),
    '--format',
    'compact'
  ]);
  const objectiveSafeNext = stale ? null : currentObjectiveAuditSafeNext(rootDir, options);
  const agentSafeNextCommand = stale ? refreshCommand : objectiveSafeNext?.command || null;
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    inputPath: runsRelativePath(rootDir, inputPath),
    exists: input.exists,
    parseOk,
    stale,
    ageSeconds: age,
    staleAfterSeconds,
    savedComplete: Boolean(saved?.complete),
    savedStatus: saved?.status || '',
    savedTarget: saved?.target || '',
    savedOperatorInput: Boolean(saved?.operatorInput),
    savedAuthState: saved?.authState || '',
    savedAuthUsable: Boolean(saved?.authUsable),
    savedMissingArtifactCount: saved?.missingArtifactCount ?? 0,
    savedAcceptedExternalProofCount: saved?.acceptedExternalProofCount ?? 0,
    savedStepCount: steps.length,
    savedOperatorApprovalStepCount: steps.filter((item) => item.runAfterUserApproval).length,
    savedBrowserStepCount: steps.filter((item) => item.opensBrowser).length,
    savedCaptureStepCount: steps.filter((item) => item.startsCapture).length,
    objectiveCompletionAuditExists: Boolean(objectiveSafeNext?.status?.exists),
    objectiveCompletionAuditParseOk: Boolean(objectiveSafeNext?.status?.parseOk),
    objectiveCompletionAuditStale: Boolean(objectiveSafeNext?.status?.stale),
    objectiveCompletionAuditSavedComplete: Boolean(objectiveSafeNext?.status?.savedComplete),
    objectiveCompletionAuditSavedStatus: objectiveSafeNext?.status?.savedStatus || '',
    objectiveCompletionAuditRemainingCount: objectiveSafeNext?.status?.remainingCount ?? 0,
    objectiveCompletionAuditRemaining: Array.isArray(objectiveSafeNext?.status?.remaining) ? objectiveSafeNext.status.remaining : [],
    agentSafeNextCommandId: stale
      ? 'operator-runbook-refresh'
      : objectiveSafeNext?.status?.agentSafeNextCommandId || 'none',
    agentSafeNextMayRunUnattended: Boolean(stale || objectiveSafeNext?.status?.agentSafeNextMayRunUnattended),
    agentSafeNextOpensBrowser: Boolean(objectiveSafeNext?.status?.agentSafeNextOpensBrowser),
    agentSafeNextStartsCapture: Boolean(objectiveSafeNext?.status?.agentSafeNextStartsCapture),
    agentSafeNextReadsBrowserStorage: Boolean(objectiveSafeNext?.status?.agentSafeNextReadsBrowserStorage),
    agentSafeNextReturnsPageContent: Boolean(objectiveSafeNext?.status?.agentSafeNextReturnsPageContent),
    agentSafeNextCommand,
    refreshCommand,
    savedOutputPath: saved?.outputPath || ''
  };
}

export async function buildOperatorRunbookWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const before = buildOperatorRunbookStatus(options);
  const run = Boolean(options.run);
  const outPath = options.out || options.output || before.inputPath || 'operator/operator-runbook-latest.json';
  safeRunPath(rootDir, outPath);
  const result = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    runRequested: run,
    inputPath: before.inputPath,
    outputPath: outPath,
    beforeExists: before.exists,
    beforeParseOk: before.parseOk,
    beforeStale: before.stale,
    executed: false,
    status: before.stale ? 'refresh-required' : 'fresh',
    blockedReason: before.stale && !run ? 'run-not-requested' : (!before.stale ? 'saved-operator-runbook-is-fresh' : ''),
    afterExists: before.exists,
    afterParseOk: before.parseOk,
    afterStale: before.stale,
    afterSavedStatus: before.savedStatus,
    afterSavedTarget: before.savedTarget,
    afterSavedStepCount: before.savedStepCount
  };
  if (!before.stale || !run) return result;

  const runbook = await buildOperatorRunbook({
    ...options,
    rootDir,
    write: true,
    out: outPath,
    writeChildren: options.writeChildren ?? options['write-children'] ?? true
  });
  const after = buildOperatorRunbookStatus({ ...options, rootDir, in: outPath });
  result.executed = true;
  result.status = 'refreshed';
  result.blockedReason = '';
  result.afterExists = after.exists;
  result.afterParseOk = after.parseOk;
  result.afterStale = after.stale;
  result.afterSavedStatus = runbook.status || after.savedStatus;
  result.afterSavedTarget = runbook.target || after.savedTarget;
  result.afterSavedStepCount = runbook.steps?.length ?? after.savedStepCount;
  return result;
}

export function formatOperatorRunbookCompact(runbook) {
  const lines = [
    `complete: ${yesNo(runbook.complete)}`,
    `status: ${compact(runbook.status)}`,
    `target: ${compact(runbook.target)}`,
    `target_dir: ${compact(rootRelativePath(runbook.rootDir, runbook.targetDir))}`,
    `operator_input: ${yesNo(runbook.operatorInput)}`,
    `human_action: ${compact(runbook.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compact(runbook.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(runbook.operatorGuidance?.captureBlocked)}`,
    `auth_state: ${compact(runbook.authState)}`,
    `auth_usable: ${yesNo(runbook.authUsable)}`,
    `profile_auth_metadata_only: ${yesNo(runbook.profileAuthMetadataOnly)}`,
    `handoff_auth_check_port: ${compact(runbook.handoffAuthCheckPort)}`,
    `handoff_auth_check_port_reachable: ${yesNoUnknown(runbook.handoffAuthCheckPortReachable)}`,
    `missing_artifact_count: ${runbook.missingArtifactCount}`,
    `accepted_external_proofs: ${runbook.acceptedExternalProofCount}`,
    `proof_gate_next_artifact_action: ${compact(runbook.proofGateArtifactAction?.nextArtifactAction)}`,
    `proof_gate_next_artifact_blocker: ${compact(runbook.proofGateArtifactAction?.nextArtifactBlocker)}`,
    `proof_gate_artifact_command_covers: ${runbook.proofGateArtifactAction?.artifactCommandCovers?.length ? runbook.proofGateArtifactAction.artifactCommandCovers.join(',') : 'none'}`,
    `login_handoff_status: ${compact(runbook.loginHandoff?.status)}`,
    `login_handoff_next_action: ${compact(runbook.loginHandoff?.nextAction)}`,
    `login_handoff_required: ${yesNo(runbook.loginHandoff?.loginRequired)}`,
    `login_handoff_safe_monitor_available: ${yesNo(runbook.loginHandoff?.safeMonitorAvailable)}`,
    `login_handoff_opens_browser_now: ${yesNo(runbook.loginHandoff?.opensBrowserNow)}`,
    `login_handoff_starts_capture_now: ${yesNo(runbook.loginHandoff?.startsCaptureNow)}`,
    `login_handoff_capture_allowed_now: ${yesNo(runbook.loginHandoff?.captureAllowedNow)}`,
    `browser_route_lane: ${compact(runbook.browserRoute?.selectedLane)}`,
    `browser_route_backend: ${compact(runbook.browserRoute?.backend)}`,
    `browser_route_user_permission_required: ${yesNo(runbook.browserRoute?.userPermissionRequired)}`,
    `browser_route_command_opens_browser: ${yesNo(runbook.browserRoute?.commandOpensBrowser)}`,
    `browser_route_approval_command_opens_browser: ${yesNo(runbook.browserRoute?.approvalCommandOpensBrowser)}`,
    `browser_route_command_run_only_after_user_says: ${compact(runbook.browserRoute?.commandRunOnlyAfterUserSays)}`,
    `backend_matrix_status: ${compact(runbook.backendMatrix?.status)}`,
    `backend_matrix_exists: ${yesNo(runbook.backendMatrix?.exists)}`,
    `backend_matrix_stale: ${yesNo(runbook.backendMatrix?.stale)}`,
    `backend_matrix_default_backend: ${compact(runbook.backendMatrix?.defaultBackend)}`,
    `backend_matrix_default_agent_interface: ${compact(runbook.backendMatrix?.defaultAgentInterface)}`,
    `backend_matrix_search_backend: ${compact(runbook.backendMatrix?.searchBackend)}`,
    `backend_matrix_analyze_backend: ${compact(runbook.backendMatrix?.analyzeBackend)}`,
    `backend_matrix_scrape_backend: ${compact(runbook.backendMatrix?.scrapeBackend)}`,
    `backend_matrix_operate_backend: ${compact(runbook.backendMatrix?.operateBackend)}`,
    `backend_matrix_authenticated_backend: ${compact(runbook.backendMatrix?.authenticatedBackend)}`,
    `backend_matrix_existing_tab_backend: ${compact(runbook.backendMatrix?.existingTabBackend)}`,
    `backend_matrix_public_crawl_backend: ${compact(runbook.backendMatrix?.publicCrawlBackend)}`,
    `backend_matrix_compatibility_backend: ${compact(runbook.backendMatrix?.compatibilityBackend)}`,
    `backend_matrix_regular_chrome_status: ${compact(runbook.backendMatrix?.regularChromeStatus)}`,
    `backend_matrix_chrome_mcp_route_ready: ${yesNo(runbook.backendMatrix?.chromeMcpRouteReady)}`,
    `backend_matrix_chrome_mcp_list_pages_timed_out: ${yesNo(runbook.backendMatrix?.chromeMcpListPagesTimedOut)}`,
    `backend_matrix_backend_count: ${runbook.backendMatrix?.backendCount ?? 0}`,
    `backend_matrix_saved_secret_values_read: ${yesNo(runbook.backendMatrix?.savedSecretValuesRead)}`,
    `backend_matrix_saved_destructive_actions: ${yesNo(runbook.backendMatrix?.savedDestructiveActions)}`,
    `proof_pipeline_status: ${compact(runbook.proofPipeline?.status)}`,
    `proof_pipeline_recommended_now: ${compact(runbook.proofPipeline?.recommendedNow)}`,
    `proof_pipeline_proof_capture_allowed_now: ${yesNo(runbook.proofPipeline?.proofCaptureAllowedNow)}`,
    `proof_pipeline_wait_auth_then_capture_available: ${yesNo(runbook.proofPipeline?.waitAuthThenCaptureAvailable)}`,
    `proof_pipeline_monitor_auth_available: ${yesNo(runbook.proofPipeline?.monitorAuthAvailable)}`,
    `proof_pipeline_monitor_auth_opens_browser: ${yesNo(runbook.proofPipeline?.monitorAuthOpensBrowser)}`,
    `proof_pipeline_monitor_auth_starts_capture: ${yesNo(runbook.proofPipeline?.monitorAuthStartsCapture)}`,
    `proof_pipeline_open_login_available: ${yesNo(runbook.proofPipeline?.openLoginAvailable)}`,
    `proof_pipeline_reopen_login_available: ${yesNo(runbook.proofPipeline?.reopenLoginAvailable)}`,
    `proof_pipeline_reopen_login_opens_browser: ${yesNo(runbook.proofPipeline?.reopenLoginOpensBrowser)}`,
    `proof_pipeline_reopen_login_starts_capture: ${yesNo(runbook.proofPipeline?.reopenLoginStartsCapture)}`,
    `proof_pipeline_reopen_login_requires_operator_approval: ${yesNo(runbook.proofPipeline?.reopenLoginAvailable)}`,
    `proof_pipeline_reopen_login_agent_may_run_unattended: no`,
    `proof_pipeline_wait_capture_opens_browser: ${yesNo(runbook.proofPipeline?.waitCaptureOpensBrowser)}`,
    `proof_pipeline_wait_capture_waits_for_auth: ${yesNo(runbook.proofPipeline?.waitCaptureWaitsForAuth)}`,
    `proof_pipeline_wait_capture_starts_capture: ${yesNo(runbook.proofPipeline?.waitCaptureStartsCapture)}`,
    `proof_pipeline_wait_capture_requires_operator_approval: ${yesNo(runbook.proofPipeline?.waitAuthThenCaptureAvailable)}`,
    `proof_pipeline_wait_capture_agent_may_run_unattended: no`,
    `proof_pipeline_wait_capture_no_open_available: ${yesNo(runbook.proofPipeline?.waitCaptureNoOpenAvailable)}`,
    `proof_pipeline_wait_capture_no_open_opens_browser: ${yesNo(runbook.proofPipeline?.waitCaptureNoOpenOpensBrowser)}`,
    `proof_pipeline_wait_capture_no_open_waits_for_auth: ${yesNo(runbook.proofPipeline?.waitCaptureNoOpenWaitsForAuth)}`,
    `proof_pipeline_wait_capture_no_open_starts_capture: ${yesNo(runbook.proofPipeline?.waitCaptureNoOpenStartsCapture)}`,
    `proof_pipeline_wait_capture_no_open_requires_operator_approval: ${yesNo(runbook.proofPipeline?.waitCaptureNoOpenAvailable)}`,
    `proof_pipeline_wait_capture_no_open_agent_may_run_unattended: no`,
    `proof_pipeline_next_artifact_action: ${compact(runbook.proofPipeline?.nextArtifactAction)}`,
    `proof_pipeline_next_artifact_blocker: ${compact(runbook.proofPipeline?.nextArtifactBlocker)}`,
    `proof_pipeline_missing_artifact_count: ${runbook.proofPipeline?.missingArtifactCount ?? 0}`,
    `agent_next_action: ${compact(runbook.agentNext?.nextAction)}`,
    `agent_next_can_run_without_approval: ${yesNo(runbook.agentNext?.agentCanRunWithoutApproval)}`,
    `agent_next_command_id: ${compact(runbook.agentNext?.agentCommandId)}`,
    `agent_next_preflight_available: ${yesNo(runbook.agentNext?.agentPreflightAvailable)}`,
    `agent_next_preflight_action: ${compact(runbook.agentNext?.agentPreflightAction)}`,
    `agent_next_preflight_may_run_without_approval: ${yesNo(runbook.agentNext?.agentPreflightMayRunWithoutApproval)}`,
    `agent_next_operator_approval_required: ${yesNo(runbook.agentNext?.operatorApprovalRequired)}`,
    `agent_next_operator_approval_preflight_opens_browser: ${yesNo(runbook.agentNext?.operatorApprovalPreflightOpensBrowser)}`,
    `agent_next_operator_approval_preflight_starts_capture: ${yesNo(runbook.agentNext?.operatorApprovalPreflightStartsCapture)}`,
    `agent_next_operator_approval_preflight_reads_browser_storage: ${yesNo(runbook.agentNext?.operatorApprovalPreflightReadsBrowserStorage)}`,
    `agent_next_operator_approval_preflight_returns_page_content: ${yesNo(runbook.agentNext?.operatorApprovalPreflightReturnsPageContent)}`,
    `agent_next_operator_approval_preflight_may_run_unattended: ${yesNo(runbook.agentNext?.operatorApprovalPreflightMayRunUnattended)}`,
    `agent_next_operator_approval_opens_browser: ${yesNo(runbook.agentNext?.operatorApprovalCommandOpensBrowser)}`,
    `agent_next_operator_approval_starts_capture: ${yesNo(runbook.agentNext?.operatorApprovalCommandStartsCapture)}`,
    `agent_next_operator_approval_agent_may_run_unattended: ${yesNo(runbook.agentNext?.operatorApprovalCommandAgentMayRunUnattended)}`,
    `agent_next_human_action: ${compact(runbook.agentNext?.humanAction)}`,
    `agent_next_automation_blocker: ${compact(runbook.agentNext?.automationBlocker || runbook.agentNext?.blockedReason)}`,
    `agent_next_opens_browser_now: ${yesNo(runbook.agentNext?.opensBrowserNow)}`,
    `agent_next_starts_capture_now: ${yesNo(runbook.agentNext?.startsCaptureNow)}`,
    `agent_next_provider_default_backend: ${compact(runbook.agentNext?.providerDefaultBackend)}`,
    `agent_next_provider_default_agent_interface: ${compact(runbook.agentNext?.providerDefaultAgentInterface)}`,
    `agent_next_provider_lightpanda_ready_for_public_benchmark: ${yesNo(runbook.agentNext?.providerLightpandaReadyForPublicBenchmark)}`,
    `agent_next_provider_lightpanda_benchmark_agent_may_run_unattended: ${yesNo(runbook.agentNext?.providerLightpandaBenchmarkAgentMayRunUnattended)}`,
    `agent_next_provider_lightpanda_benchmark_starts_browser: ${yesNo(runbook.agentNext?.providerLightpandaBenchmarkStartsBrowser)}`,
    `agent_next_provider_lightpanda_benchmark_reads_browser_storage: ${yesNo(runbook.agentNext?.providerLightpandaBenchmarkReadsBrowserStorage)}`,
    `agent_next_provider_lightpanda_benchmark_returns_page_content: ${yesNo(runbook.agentNext?.providerLightpandaBenchmarkReturnsPageContent)}`,
    `agent_next_provider_lightpanda_benchmark_command: ${compact(runbook.agentNext?.providerLightpandaBenchmarkCommand)}`,
    `agent_next_provider_playwright_ready_for_public_smoke: ${yesNo(runbook.agentNext?.providerPlaywrightReadyForPublicSmoke)}`,
    `agent_next_provider_playwright_ready_for_authenticated_default: ${yesNo(runbook.agentNext?.providerPlaywrightReadyForAuthenticatedDefault)}`,
    `agent_next_provider_playwright_storage_state_sensitive: ${yesNo(runbook.agentNext?.providerPlaywrightStorageStateSensitive)}`,
    `agent_next_provider_playwright_smoke_command: ${compact(runbook.agentNext?.providerPlaywrightSmokeCommand)}`,
    `agent_next_provider_selenium_ready_for_local_smoke: ${yesNo(runbook.agentNext?.providerSeleniumReadyForLocalSmoke)}`,
    `agent_next_provider_selenium_smoke_agent_may_run_unattended: ${yesNo(runbook.agentNext?.providerSeleniumSmokeAgentMayRunUnattended)}`,
    `agent_next_provider_selenium_smoke_starts_browser: ${yesNo(runbook.agentNext?.providerSeleniumSmokeStartsBrowser)}`,
    `agent_next_provider_selenium_smoke_command: ${compact(runbook.agentNext?.providerSeleniumSmokeCommand)}`,
    `agent_next_provider_doctor_opens_browser: ${yesNo(runbook.agentNext?.providerDoctorOpensBrowser)}`,
    `agent_next_provider_doctor_starts_capture: ${yesNo(runbook.agentNext?.providerDoctorStartsCapture)}`,
    `agent_next_provider_doctor_reads_browser_storage: ${yesNo(runbook.agentNext?.providerDoctorReadsBrowserStorage)}`,
    `agent_next_provider_doctor_returns_page_content: ${yesNo(runbook.agentNext?.providerDoctorReturnsPageContent)}`,
    `agent_next_provider_doctor_may_run_unattended: ${yesNo(runbook.agentNext?.providerDoctorMayRunUnattended)}`,
    `agent_proof_checklist_complete: ${yesNo(runbook.agentProofChecklist?.complete)}`,
    `agent_proof_checklist_verdict: ${compact(runbook.agentProofChecklist?.verdict)}`,
    `agent_proof_checklist_candidate: ${compact(runbook.agentProofChecklist?.candidate)}`,
    `agent_proof_checklist_readiness_remaining_count: ${runbook.agentProofChecklist?.readinessRemainingCount ?? 0}`,
    `agent_proof_checklist_readiness_remaining: ${runbook.agentProofChecklist?.readinessRemaining?.length ? runbook.agentProofChecklist.readinessRemaining.join(',') : 'none'}`,
    `agent_proof_checklist_auth_state: ${compact(runbook.agentProofChecklist?.authState)}`,
    `agent_proof_checklist_auth_usable: ${yesNo(runbook.agentProofChecklist?.authUsable)}`,
    `agent_proof_checklist_capture_blocked: ${yesNo(runbook.agentProofChecklist?.captureBlocked)}`,
    `agent_proof_checklist_automation_blocker: ${compact(runbook.agentProofChecklist?.automationBlocker)}`,
    `agent_proof_checklist_operator_approval_required: ${yesNo(runbook.agentProofChecklist?.operatorApprovalRequired)}`,
    `agent_proof_checklist_operator_approval_token: ${compact(runbook.agentProofChecklist?.operatorApprovalToken)}`,
    `agent_proof_checklist_operator_command_opens_browser: ${yesNo(runbook.agentProofChecklist?.operatorCommandOpensBrowser)}`,
    `agent_proof_checklist_operator_command_starts_capture: ${yesNo(runbook.agentProofChecklist?.operatorCommandStartsCapture)}`,
    `agent_proof_checklist_agent_must_not_run_operator_resume_unattended: ${yesNo(runbook.agentProofChecklist?.agentMustNotRunOperatorResumeUnattended)}`,
    `agent_proof_closeout_complete: ${yesNo(runbook.agentProofCloseout?.complete)}`,
    `agent_proof_closeout_verdict: ${compact(runbook.agentProofCloseout?.verdict)}`,
    `agent_proof_closeout_candidate: ${compact(runbook.agentProofCloseout?.candidate)}`,
    `agent_proof_closeout_readiness_remaining_count: ${runbook.agentProofCloseout?.readinessRemainingCount ?? 0}`,
    `agent_proof_closeout_readiness_remaining: ${runbook.agentProofCloseout?.readinessRemaining?.length ? runbook.agentProofCloseout.readinessRemaining.join(',') : 'none'}`,
    `agent_proof_closeout_auth_state: ${compact(runbook.agentProofCloseout?.authState)}`,
    `agent_proof_closeout_auth_usable: ${yesNo(runbook.agentProofCloseout?.authUsable)}`,
    `agent_proof_closeout_capture_blocked: ${yesNo(runbook.agentProofCloseout?.captureBlocked)}`,
    `agent_proof_closeout_automation_blocker: ${compact(runbook.agentProofCloseout?.automationBlocker)}`,
    `agent_proof_closeout_accepted_external_proofs: ${runbook.agentProofCloseout?.acceptedExternalProofs ?? 0}`,
    `agent_proof_closeout_checklist_exists: ${yesNo(runbook.agentProofCloseout?.checklistExists)}`,
    `agent_proof_closeout_checklist_parse_ok: ${yesNo(runbook.agentProofCloseout?.checklistParseOk)}`,
    `agent_proof_closeout_operator_resume_requires_operator_approval: ${yesNo(runbook.agentProofCloseout?.operatorResumeRequiresOperatorApproval)}`,
    `agent_proof_closeout_operator_resume_opens_browser: ${yesNo(runbook.agentProofCloseout?.operatorResumeOpensBrowser)}`,
    `agent_proof_closeout_operator_resume_starts_capture: ${yesNo(runbook.agentProofCloseout?.operatorResumeStartsCapture)}`,
    `agent_proof_closeout_operator_resume_agent_may_run_unattended: ${yesNo(runbook.agentProofCloseout?.operatorResumeAgentMayRunUnattended)}`,
    `agent_proof_closeout_provider_default_backend: ${compact(runbook.agentProofCloseout?.providerDefaultBackend)}`,
    `agent_proof_closeout_provider_default_agent_interface: ${compact(runbook.agentProofCloseout?.providerDefaultAgentInterface)}`,
    `agent_proof_closeout_provider_playwright_ready_for_public_smoke: ${yesNo(runbook.agentProofCloseout?.providerPlaywrightReadyForPublicSmoke)}`,
    `agent_proof_closeout_provider_playwright_ready_for_authenticated_default: ${yesNo(runbook.agentProofCloseout?.providerPlaywrightReadyForAuthenticatedDefault)}`,
    `agent_proof_closeout_provider_playwright_storage_state_sensitive: ${yesNo(runbook.agentProofCloseout?.providerPlaywrightStorageStateSensitive)}`,
    `agent_proof_closeout_provider_doctor_opens_browser: ${yesNo(runbook.agentProofCloseout?.providerDoctorOpensBrowser)}`,
    `agent_proof_closeout_provider_doctor_starts_capture: ${yesNo(runbook.agentProofCloseout?.providerDoctorStartsCapture)}`,
    `agent_proof_closeout_provider_doctor_reads_browser_storage: ${yesNo(runbook.agentProofCloseout?.providerDoctorReadsBrowserStorage)}`,
    `agent_proof_closeout_provider_doctor_returns_page_content: ${yesNo(runbook.agentProofCloseout?.providerDoctorReturnsPageContent)}`,
    `agent_proof_closeout_provider_doctor_may_run_unattended: ${yesNo(runbook.agentProofCloseout?.providerDoctorMayRunUnattended)}`,
    `target_approval_pack_exists: ${yesNo(runbook.targetApproval?.approvalPackExists)}`,
    `target_approval_pack_parse_ok: ${yesNo(runbook.targetApproval?.approvalPackParseOk)}`,
    `target_approval_candidate: ${compact(runbook.targetApproval?.selectedCandidate)}`,
    `target_approval_next: ${compact(runbook.targetApproval?.targetNext)}`,
    `target_approval_resume_status: ${compact(runbook.targetApproval?.resumeStatus)}`,
    `target_approval_resume_ready_to_run: ${yesNo(runbook.targetApproval?.resumeReadyToRun)}`,
    `target_approval_resume_planned_opens_browser: ${yesNo(runbook.targetApproval?.resumePlannedCommandOpensBrowser)}`,
    `target_approval_resume_planned_starts_capture: ${yesNo(runbook.targetApproval?.resumePlannedCommandStartsCapture)}`,
    `background_proof_plan_status: ${compact(runbook.backgroundProofCapture?.planStatus)}`,
    `background_proof_capture_blocked: ${yesNo(runbook.backgroundProofCapture?.captureBlocked)}`,
    `background_proof_capture_blocked_reason: ${compact(runbook.backgroundProofCapture?.captureBlockedReason)}`,
    `background_proof_monitor_available: ${yesNo(runbook.backgroundProofCapture?.backgroundMonitorAvailable)}`,
    `background_proof_capture_available: ${yesNo(runbook.backgroundProofCapture?.backgroundCaptureAvailable)}`,
    `background_proof_monitor_running: ${yesNo(runbook.backgroundProofCapture?.monitorRunning)}`,
    `background_proof_capture_running: ${yesNo(runbook.backgroundProofCapture?.captureRunning)}`,
    `background_proof_capture_start_ready: ${yesNo(runbook.backgroundProofCapture?.captureStartReadyToRun)}`,
    `background_proof_capture_start_blockers: ${runbook.backgroundProofCapture?.captureStartBlockers?.length ? runbook.backgroundProofCapture.captureStartBlockers.join(',') : 'none'}`,
    `agent_loop_step_saved_exists: ${yesNo(runbook.agentLoopStepStatus?.exists)}`,
    `agent_loop_step_saved_stale: ${yesNo(runbook.agentLoopStepStatus?.stale)}`,
    `agent_loop_step_saved_status: ${compact(runbook.agentLoopStepStatus?.status)}`,
    `agent_loop_step_saved_next_action: ${compact(runbook.agentLoopStepStatus?.nextAction)}`,
    `agent_loop_step_saved_recommended_command_id: ${compact(runbook.agentLoopStepStatus?.recommendedCommandId)}`,
    `agent_loop_step_saved_command_id: ${compact(runbook.agentLoopStepStatus?.commandId)}`,
    `agent_loop_step_saved_allowed_to_run: ${yesNo(runbook.agentLoopStepStatus?.allowedToRun)}`,
    `agent_loop_step_saved_executed: ${yesNo(runbook.agentLoopStepStatus?.executed)}`,
    `agent_loop_step_saved_opens_browser_now: ${yesNo(runbook.agentLoopStepStatus?.opensBrowserNow)}`,
    `agent_loop_step_saved_starts_capture_now: ${yesNo(runbook.agentLoopStepStatus?.startsCaptureNow)}`,
    `regular_chrome_user_permission_required: ${yesNo(runbook.regularChrome?.userPermissionRequired)}`,
    `regular_chrome_operator_ok_required: ${yesNo(runbook.regularChrome?.operatorOkRequired)}`,
    `secret_onepassword_approval_required: ${yesNo(runbook.secrets?.requiresOnePasswordApproval)}`,
    `secret_values_read: ${yesNo(runbook.secretValuesRead)}`,
    `destructive_actions: ${yesNo(runbook.destructiveActionsIncluded)}`,
    `opens_browser_now: ${yesNo(runbook.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(runbook.startsCaptureNow)}`,
    `steps: ${runbook.steps.length}`
  ];
  if (runbook.outputPath) lines.push(`output: ${runbook.outputPath}`);
  const primary = runbook.steps.find((item) => item.id === 'primary');
  if (primary?.command) lines.push(`primary_command_opens_browser: ${yesNo(primary.opensBrowser)}`);
  if (primary?.command) lines.push(`primary_command_starts_capture: ${yesNo(primary.startsCapture)}`);
  if (primary?.command) lines.push(`primary_command_requires_operator_approval: yes`);
  if (primary?.command) lines.push(`primary_command_agent_may_run_unattended: no`);
  if (primary?.command) lines.push(`primary_command: ${primary.command}`);
  const browserRoute = runbook.steps.find((item) => item.id === 'browser-route');
  if (browserRoute?.command) lines.push(`browser_route_command: ${browserRoute.command}`);
  const backendMatrix = runbook.steps.find((item) => item.id === 'backend-matrix');
  if (backendMatrix?.command) lines.push(`backend_matrix_status_command: ${backendMatrix.command}`);
  if (runbook.backendMatrix?.refreshCommand?.shell) lines.push(`backend_matrix_refresh_command: ${runbook.backendMatrix.refreshCommand.shell}`);
  const proofPipeline = runbook.steps.find((item) => item.id === 'proof-pipeline');
  if (proofPipeline?.command) lines.push(`proof_pipeline_command: ${proofPipeline.command}`);
  if (runbook.proofPipeline?.monitorAuthCommand?.shell) lines.push(`proof_pipeline_monitor_auth_command: ${runbook.proofPipeline.monitorAuthCommand.shell}`);
  if (runbook.proofPipeline?.openLoginCommand?.shell) lines.push(`proof_pipeline_open_login_command: ${runbook.proofPipeline.openLoginCommand.shell}`);
  if (runbook.proofPipeline?.reopenLoginCommand?.shell) lines.push(`proof_pipeline_reopen_login_command: ${runbook.proofPipeline.reopenLoginCommand.shell}`);
  if (runbook.proofPipeline?.waitCaptureCommand?.shell) lines.push(`proof_pipeline_wait_capture_command: ${runbook.proofPipeline.waitCaptureCommand.shell}`);
  if (runbook.proofPipeline?.waitCaptureNoOpenCommand?.shell) lines.push(`proof_pipeline_wait_capture_no_open_command: ${runbook.proofPipeline.waitCaptureNoOpenCommand.shell}`);
  const agentNextStep = runbook.steps.find((item) => item.id === 'agent-next');
  if (agentNextStep?.command) lines.push(`agent_next_command: ${agentNextStep.command}`);
  if (runbook.agentNext?.agentStatusCommand?.shell) lines.push(`agent_next_status_command: ${runbook.agentNext.agentStatusCommand.shell}`);
  if (runbook.agentNext?.agentStepPlanCommand?.shell) lines.push(`agent_next_step_plan_command: ${runbook.agentNext.agentStepPlanCommand.shell}`);
  if (runbook.agentNext?.agentStepStatusCommand?.shell) lines.push(`agent_next_step_status_command: ${runbook.agentNext.agentStepStatusCommand.shell}`);
  if (runbook.agentNext?.objectiveCompletionStrictCommand?.shell) lines.push(`agent_next_objective_completion_strict_command: ${runbook.agentNext.objectiveCompletionStrictCommand.shell}`);
  if (runbook.agentNext?.agentPollCommand?.shell) lines.push(`agent_next_poll_command: ${runbook.agentNext.agentPollCommand.shell}`);
  if (runbook.agentNext?.agentRunCommand?.shell) lines.push(`agent_next_run_command: ${runbook.agentNext.agentRunCommand.shell}`);
  if (runbook.agentNext?.agentPreflightCommand?.shell) lines.push(`agent_next_preflight_command: ${runbook.agentNext.agentPreflightCommand.shell}`);
  if (runbook.agentNext?.operatorApprovalPreflightCommand?.shell) lines.push(`agent_next_operator_approval_preflight_command: ${runbook.agentNext.operatorApprovalPreflightCommand.shell}`);
  if (runbook.agentNext?.providerDoctorCommand?.shell) lines.push(`agent_next_provider_doctor_command: ${runbook.agentNext.providerDoctorCommand.shell}`);
  if (runbook.agentNext?.operatorApprovalPlanCommand?.shell) lines.push(`agent_next_operator_approval_plan_command: ${runbook.agentNext.operatorApprovalPlanCommand.shell}`);
  if (runbook.agentNext?.operatorApprovalCommand?.shell) lines.push(`agent_next_operator_approval_command: ${runbook.agentNext.operatorApprovalCommand.shell}`);
  const agentProofChecklist = runbook.steps.find((item) => item.id === 'agent-proof-checklist');
  if (agentProofChecklist?.command) lines.push(`agent_proof_checklist_command: ${agentProofChecklist.command}`);
  if (runbook.agentProofChecklist?.writeCommand?.shell) lines.push(`agent_proof_checklist_write_command: ${runbook.agentProofChecklist.writeCommand.shell}`);
  if (runbook.agentProofChecklist?.statusCommand?.shell) lines.push(`agent_proof_checklist_status_command: ${runbook.agentProofChecklist.statusCommand.shell}`);
  if (runbook.agentProofChecklist?.operatorResumeCommand?.shell) lines.push(`agent_proof_checklist_operator_resume_command: ${runbook.agentProofChecklist.operatorResumeCommand.shell}`);
  const agentProofCloseout = runbook.steps.find((item) => item.id === 'agent-proof-closeout');
  if (agentProofCloseout?.command) lines.push(`agent_proof_closeout_command: ${agentProofCloseout.command}`);
  if (runbook.agentProofCloseout?.writeCommand?.shell) lines.push(`agent_proof_closeout_write_command: ${runbook.agentProofCloseout.writeCommand.shell}`);
  if (runbook.agentProofCloseout?.statusCommand?.shell) lines.push(`agent_proof_closeout_status_command: ${runbook.agentProofCloseout.statusCommand.shell}`);
  if (runbook.agentProofCloseout?.checklistRefreshCommand?.shell) lines.push(`agent_proof_closeout_checklist_refresh_command: ${runbook.agentProofCloseout.checklistRefreshCommand.shell}`);
  if (runbook.agentProofCloseout?.checklistStatusCommand?.shell) lines.push(`agent_proof_closeout_checklist_status_command: ${runbook.agentProofCloseout.checklistStatusCommand.shell}`);
  lines.push(`agent_proof_closeout_agent_safe_next_command_id: ${compact(runbook.agentProofCloseout?.agentSafeNextCommandId)}`);
  lines.push(`agent_proof_closeout_agent_safe_next_may_run_unattended: ${yesNo(runbook.agentProofCloseout?.agentSafeNextMayRunUnattended)}`);
  lines.push(`agent_proof_closeout_agent_safe_next_opens_browser: ${yesNo(runbook.agentProofCloseout?.agentSafeNextOpensBrowser)}`);
  lines.push(`agent_proof_closeout_agent_safe_next_starts_capture: ${yesNo(runbook.agentProofCloseout?.agentSafeNextStartsCapture)}`);
  if (runbook.agentProofCloseout?.agentSafeNextCommand?.shell) lines.push(`agent_proof_closeout_agent_safe_next_command: ${runbook.agentProofCloseout.agentSafeNextCommand.shell}`);
  if (runbook.agentProofCloseout?.targetApprovalPreflightCommand?.shell) lines.push(`agent_proof_closeout_target_approval_preflight_command: ${runbook.agentProofCloseout.targetApprovalPreflightCommand.shell}`);
  if (runbook.agentProofCloseout?.providerDoctorStatusCommand?.shell) lines.push(`agent_proof_closeout_provider_doctor_status_command: ${runbook.agentProofCloseout.providerDoctorStatusCommand.shell}`);
  if (runbook.agentProofCloseout?.operatorResumeCommand?.shell) lines.push(`agent_proof_closeout_operator_resume_command: ${runbook.agentProofCloseout.operatorResumeCommand.shell}`);
  if (runbook.agentProofCloseout?.completionProofBundleCommand?.shell) lines.push(`agent_proof_closeout_completion_proof_bundle_command: ${runbook.agentProofCloseout.completionProofBundleCommand.shell}`);
  if (runbook.agentProofCloseout?.completionProofBundleWithAuditCommand?.shell) lines.push(`agent_proof_closeout_completion_proof_bundle_with_audit_command: ${runbook.agentProofCloseout.completionProofBundleWithAuditCommand.shell}`);
  if (runbook.agentProofCloseout?.completionProofBundleStatusCommand?.shell) lines.push(`agent_proof_closeout_completion_proof_bundle_status_command: ${runbook.agentProofCloseout.completionProofBundleStatusCommand.shell}`);
  if (runbook.agentProofCloseout?.compactCommandAuditAllCommand?.shell) lines.push(`agent_proof_closeout_compact_command_audit_all_command: ${runbook.agentProofCloseout.compactCommandAuditAllCommand.shell}`);
  if (runbook.agentProofCloseout?.objectiveCompletionCommand?.shell) lines.push(`agent_proof_closeout_objective_completion_command: ${runbook.agentProofCloseout.objectiveCompletionCommand.shell}`);
  if (runbook.agentProofCloseout?.objectiveCompletionStrictCommand?.shell) lines.push(`agent_proof_closeout_objective_completion_strict_command: ${runbook.agentProofCloseout.objectiveCompletionStrictCommand.shell}`);
  const watch = runbook.steps.find((item) => item.id === 'watch');
  if (watch?.command) lines.push(`watch_command: ${watch.command}`);
  const authWatch = runbook.steps.find((item) => item.id === 'target-auth-watch');
  if (authWatch?.command) lines.push(`auth_watch_command: ${authWatch.command}`);
  const loginHandoffStatus = runbook.steps.find((item) => item.id === 'login-handoff-status');
  if (loginHandoffStatus?.command) lines.push(`login_handoff_status_command: ${loginHandoffStatus.command}`);
  const targetApprovalStatus = runbook.steps.find((item) => item.id === 'target-approval-status');
  if (targetApprovalStatus?.command) lines.push(`target_approval_status_command: ${targetApprovalStatus.command}`);
  const targetApprovalPreflight = runbook.steps.find((item) => item.id === 'target-approval-preflight');
  if (targetApprovalPreflight?.command) lines.push(`target_approval_preflight_command: ${targetApprovalPreflight.command}`);
  const compactCommandAuditAll = runbook.steps.find((item) => item.id === 'compact-command-audit-all');
  if (compactCommandAuditAll?.command) lines.push(`compact_command_audit_all_command: ${compactCommandAuditAll.command}`);
  const targetApprovalResumePlan = runbook.steps.find((item) => item.id === 'target-approval-resume-plan');
  if (targetApprovalResumePlan?.command) lines.push(`target_approval_resume_plan_command: ${targetApprovalResumePlan.command}`);
  const targetApprovalResumeRun = runbook.steps.find((item) => item.id === 'target-approval-resume-run');
  if (targetApprovalResumeRun?.command) lines.push(`target_approval_resume_run_command: ${targetApprovalResumeRun.command}`);
  if (runbook.targetApproval?.completionProofBundleWithAuditCommand?.shell) lines.push(`target_approval_completion_proof_bundle_with_audit_command: ${runbook.targetApproval.completionProofBundleWithAuditCommand.shell}`);
  if (runbook.targetApproval?.agentProofCloseoutWriteCommand?.shell) lines.push(`target_approval_agent_proof_closeout_write_command: ${runbook.targetApproval.agentProofCloseoutWriteCommand.shell}`);
  if (runbook.targetApproval?.agentProofCloseoutStatusCommand?.shell) lines.push(`target_approval_agent_proof_closeout_status_command: ${runbook.targetApproval.agentProofCloseoutStatusCommand.shell}`);
  if (runbook.targetApproval?.objectiveCompletionStrictCommand?.shell) lines.push(`target_approval_objective_completion_strict_command: ${runbook.targetApproval.objectiveCompletionStrictCommand.shell}`);
  const backgroundProofStatus = runbook.steps.find((item) => item.id === 'background-proof-status');
  if (backgroundProofStatus?.command) lines.push(`background_proof_status_command: ${backgroundProofStatus.command}`);
  const backgroundNoOpenWaitCapture = runbook.steps.find((item) => item.id === 'background-proof-no-open-wait-capture');
  if (backgroundNoOpenWaitCapture?.command) lines.push(`background_proof_no_open_wait_capture_requires_operator_approval: ${yesNo(backgroundNoOpenWaitCapture.runAfterUserApproval)}`);
  if (backgroundNoOpenWaitCapture?.command) lines.push(`background_proof_no_open_wait_capture_agent_may_run_unattended: no`);
  if (backgroundNoOpenWaitCapture?.command) lines.push(`background_proof_no_open_wait_capture_command: ${backgroundNoOpenWaitCapture.command}`);
  const backgroundNoOpenWaitCaptureBackground = runbook.steps.find((item) => item.id === 'background-proof-no-open-wait-capture-background');
  if (backgroundNoOpenWaitCaptureBackground?.command) lines.push(`background_proof_no_open_wait_capture_background_requires_operator_approval: ${yesNo(backgroundNoOpenWaitCaptureBackground.runAfterUserApproval)}`);
  if (backgroundNoOpenWaitCaptureBackground?.command) lines.push(`background_proof_no_open_wait_capture_background_agent_may_run_unattended: no`);
  if (backgroundNoOpenWaitCaptureBackground?.command) lines.push(`background_proof_no_open_wait_capture_background_command: ${backgroundNoOpenWaitCaptureBackground.command}`);
  const backgroundProofCaptureStart = runbook.steps.find((item) => item.id === 'background-proof-capture-start');
  if (backgroundProofCaptureStart?.command) lines.push(`background_proof_capture_start_command: ${backgroundProofCaptureStart.command}`);
  const backgroundAuthMonitorStart = runbook.steps.find((item) => item.id === 'background-auth-monitor-start');
  if (backgroundAuthMonitorStart?.command) lines.push(`background_proof_monitor_start_command: ${backgroundAuthMonitorStart.command}`);
  const agentLoopStepStatus = runbook.steps.find((item) => item.id === 'agent-loop-step-status');
  if (agentLoopStepStatus?.command) lines.push(`agent_loop_step_status_command: ${agentLoopStepStatus.command}`);
  const agentLoopStepRecommendation = runbook.steps.find((item) => item.id === 'agent-loop-step-recommendation');
  if (agentLoopStepRecommendation?.command) lines.push(`agent_loop_step_recommended_command: ${agentLoopStepRecommendation.command}`);
  const chromePlan = runbook.steps.find((item) => item.id === 'regular-chrome-resume-plan');
  if (chromePlan?.command) lines.push(`regular_chrome_resume_command: ${chromePlan.command}`);
  const chromeRetry = runbook.steps.find((item) => item.id === 'regular-chrome-retry');
  if (chromeRetry?.command) lines.push(`regular_chrome_approval_command: ${chromeRetry.command}`);
  const completion = runbook.steps.find((item) => item.id === 'completion-audit');
  if (completion?.command) lines.push(`completion_audit_command: ${completion.command}`);
  return `${lines.join('\n')}\n`;
}

export function formatOperatorRunbookStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `input_path: ${compact(status.inputPath)}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `saved_complete: ${yesNo(status.savedComplete)}`,
    `saved_status: ${compact(status.savedStatus)}`,
    `saved_target: ${compact(status.savedTarget)}`,
    `saved_operator_input: ${yesNo(status.savedOperatorInput)}`,
    `saved_auth_state: ${compact(status.savedAuthState)}`,
    `saved_auth_usable: ${yesNo(status.savedAuthUsable)}`,
    `saved_missing_artifact_count: ${status.savedMissingArtifactCount}`,
    `saved_accepted_external_proofs: ${status.savedAcceptedExternalProofCount}`,
	    `saved_step_count: ${status.savedStepCount}`,
	    `saved_operator_approval_step_count: ${status.savedOperatorApprovalStepCount}`,
	    `saved_browser_step_count: ${status.savedBrowserStepCount}`,
	    `saved_capture_step_count: ${status.savedCaptureStepCount}`,
	    `objective_completion_audit_exists: ${yesNo(status.objectiveCompletionAuditExists)}`,
	    `objective_completion_audit_parse_ok: ${yesNo(status.objectiveCompletionAuditParseOk)}`,
	    `objective_completion_audit_stale: ${yesNo(status.objectiveCompletionAuditStale)}`,
	    `objective_completion_audit_saved_complete: ${yesNo(status.objectiveCompletionAuditSavedComplete)}`,
	    `objective_completion_audit_saved_status: ${compact(status.objectiveCompletionAuditSavedStatus)}`,
	    `objective_completion_audit_remaining_count: ${status.objectiveCompletionAuditRemainingCount}`,
	    `objective_completion_audit_remaining: ${status.objectiveCompletionAuditRemaining.join(',') || 'none'}`,
	    `agent_safe_next_command_id: ${compact(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`
  ];
  if (status.savedOutputPath) lines.push(`saved_output_path: ${rootRelativePath(status.rootDir, status.savedOutputPath)}`);
  if (status.agentSafeNextCommand?.shell) lines.push(`agent_safe_next_command: ${status.agentSafeNextCommand.shell}`);
  if (status.refreshCommand?.shell) lines.push(`refresh_command: ${status.refreshCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatOperatorRunbookWatchCompact(watch) {
  const lines = [
    `safe_mode: ${yesNo(watch.safeMode)}`,
    `destructive_actions: ${yesNo(watch.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(watch.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(watch.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(watch.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(watch.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(watch.pageContentReturned)}`,
    `run_requested: ${yesNo(watch.runRequested)}`,
    `executed: ${yesNo(watch.executed)}`,
    `status: ${compact(watch.status)}`,
    `blocked_reason: ${compact(watch.blockedReason)}`,
    `input_path: ${compact(rootRelativePath(watch.rootDir, watch.inputPath))}`,
    `output_path: ${compact(rootRelativePath(watch.rootDir, watch.outputPath))}`,
    `before_exists: ${yesNo(watch.beforeExists)}`,
    `before_parse_ok: ${yesNo(watch.beforeParseOk)}`,
    `before_stale: ${yesNo(watch.beforeStale)}`,
    `after_exists: ${yesNo(watch.afterExists)}`,
    `after_parse_ok: ${yesNo(watch.afterParseOk)}`,
    `after_stale: ${yesNo(watch.afterStale)}`,
    `after_saved_status: ${compact(watch.afterSavedStatus)}`,
    `after_saved_target: ${compact(watch.afterSavedTarget)}`,
    `after_saved_step_count: ${watch.afterSavedStepCount ?? 0}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatOperatorRunbookMarkdown(runbook) {
  const lines = [
    '# Secure Browser Agent Operator Runbook',
    '',
    `Generated: ${runbook.generatedAt}`,
    `Root: ${runbook.rootDir}`,
    `Complete: ${runbook.complete ? 'yes' : 'no'}`,
    `Status: ${runbook.status}`,
    `Safe mode: ${runbook.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${runbook.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${runbook.secretValuesRead ? 'yes' : 'no'}`,
    `Opens browser now: ${runbook.opensBrowserNow ? 'yes' : 'no'}`,
    `Starts capture now: ${runbook.startsCaptureNow ? 'yes' : 'no'}`,
    '',
    '## Current Gate',
    '',
    `- Target: ${runbook.target || 'none'}`,
    `- Target directory: ${runbook.targetDir || 'none'}`,
    `- Operator input: ${runbook.operatorInput ? 'yes' : 'no'}`,
    `- Human action: ${runbook.operatorGuidance?.humanAction || 'none'}`,
    `- Automation blocker: ${runbook.operatorGuidance?.automationBlocker || 'none'}`,
    `- Capture blocked: ${runbook.operatorGuidance?.captureBlocked ? 'yes' : 'no'}`,
    `- Auth state: ${runbook.authState || 'unknown'}`,
    `- Auth usable for capture: ${runbook.authUsable ? 'yes' : 'no'}`,
    `- Profile auth metadata only: ${runbook.profileAuthMetadataOnly ? 'yes' : 'no'}`,
    `- Handoff auth-check port: ${runbook.handoffAuthCheckPort || 'none'}`,
    `- Handoff auth-check port reachable: ${yesNoUnknown(runbook.handoffAuthCheckPortReachable)}`,
    `- Missing artifact count: ${runbook.missingArtifactCount}`,
    `- Accepted external proofs: ${runbook.acceptedExternalProofCount}`,
    `- Next artifact action: ${runbook.proofGateArtifactAction?.nextArtifactAction || 'none'}`,
    `- Next artifact blocker: ${runbook.proofGateArtifactAction?.nextArtifactBlocker || 'none'}`,
    `- Artifact command covers: ${runbook.proofGateArtifactAction?.artifactCommandCovers?.length ? runbook.proofGateArtifactAction.artifactCommandCovers.join(', ') : 'none'}`,
    '',
    '## Login Handoff',
    '',
    `- Status: ${runbook.loginHandoff?.status || 'none'}`,
    `- Next action: ${runbook.loginHandoff?.nextAction || 'none'}`,
    `- Login required: ${runbook.loginHandoff?.loginRequired ? 'yes' : 'no'}`,
    `- Auth usable: ${runbook.loginHandoff?.authUsable ? 'yes' : 'no'}`,
    `- Safe monitor available: ${runbook.loginHandoff?.safeMonitorAvailable ? 'yes' : 'no'}`,
    `- Safe monitor only: ${runbook.loginHandoff?.safeMonitorOnly ? 'yes' : 'no'}`,
    `- Dedicated browser port: ${runbook.loginHandoff?.dedicatedBrowserPort || 'none'}`,
    `- Dedicated browser reachable: ${yesNoUnknown(runbook.loginHandoff?.dedicatedBrowserReachable)}`,
    `- Opens browser now: ${runbook.loginHandoff?.opensBrowserNow ? 'yes' : 'no'}`,
    `- Starts capture now: ${runbook.loginHandoff?.startsCaptureNow ? 'yes' : 'no'}`,
    `- Capture allowed now: ${runbook.loginHandoff?.captureAllowedNow ? 'yes' : 'no'}`,
    `- Proof capture blocked until auth: ${runbook.loginHandoff?.proofCaptureBlockedUntilAuth ? 'yes' : 'no'}`,
    '',
    '## Browser Route',
    '',
    `- Lane: ${runbook.browserRoute?.selectedLane || 'none'}`,
    `- Backend: ${runbook.browserRoute?.backend || 'none'}`,
    `- Profile mode: ${runbook.browserRoute?.profileMode || 'none'}`,
    `- User permission required: ${runbook.browserRoute?.userPermissionRequired ? 'yes' : 'no'}`,
    `- Command opens browser: ${runbook.browserRoute?.commandOpensBrowser ? 'yes' : 'no'}`,
    `- Approval command opens browser: ${runbook.browserRoute?.approvalCommandOpensBrowser ? 'yes' : 'no'}`,
    `- Command run only after user says: ${runbook.browserRoute?.commandRunOnlyAfterUserSays || 'none'}`,
    '',
    '## Backend Matrix',
    '',
    `- Status: ${runbook.backendMatrix?.status || 'none'}`,
    `- Default backend: ${runbook.backendMatrix?.defaultBackend || 'none'}`,
    `- Default agent interface: ${runbook.backendMatrix?.defaultAgentInterface || 'none'}`,
    `- Search backend: ${runbook.backendMatrix?.searchBackend || 'none'}`,
    `- Analyze backend: ${runbook.backendMatrix?.analyzeBackend || 'none'}`,
    `- Scrape backend: ${runbook.backendMatrix?.scrapeBackend || 'none'}`,
    `- Operate backend: ${runbook.backendMatrix?.operateBackend || 'none'}`,
    `- Authenticated backend: ${runbook.backendMatrix?.authenticatedBackend || 'none'}`,
    `- Existing-tab backend: ${runbook.backendMatrix?.existingTabBackend || 'none'}`,
    `- Public-crawl backend: ${runbook.backendMatrix?.publicCrawlBackend || 'none'}`,
    `- Compatibility backend: ${runbook.backendMatrix?.compatibilityBackend || 'none'}`,
    `- Regular Chrome status: ${runbook.backendMatrix?.regularChromeStatus || 'none'}`,
    `- Chrome MCP route ready: ${runbook.backendMatrix?.chromeMcpRouteReady ? 'yes' : 'no'}`,
    `- Chrome MCP list_pages timed out: ${runbook.backendMatrix?.chromeMcpListPagesTimedOut ? 'yes' : 'no'}`,
    `- Backend count: ${runbook.backendMatrix?.backendCount ?? 0}`,
    `- Saved secret values read: ${runbook.backendMatrix?.savedSecretValuesRead ? 'yes' : 'no'}`,
    `- Saved destructive actions: ${runbook.backendMatrix?.savedDestructiveActions ? 'yes' : 'no'}`,
    '',
    '## Proof Pipeline',
    '',
    `- Status: ${runbook.proofPipeline?.status || 'none'}`,
    `- Recommended now: ${runbook.proofPipeline?.recommendedNow || 'none'}`,
    `- Proof capture allowed now: ${runbook.proofPipeline?.proofCaptureAllowedNow ? 'yes' : 'no'}`,
    `- Wait-auth capture available: ${runbook.proofPipeline?.waitAuthThenCaptureAvailable ? 'yes' : 'no'}`,
    `- Monitor auth available: ${runbook.proofPipeline?.monitorAuthAvailable ? 'yes' : 'no'}`,
    `- Monitor auth opens browser: ${runbook.proofPipeline?.monitorAuthOpensBrowser ? 'yes' : 'no'}`,
    `- Monitor auth starts capture: ${runbook.proofPipeline?.monitorAuthStartsCapture ? 'yes' : 'no'}`,
    `- Open login available: ${runbook.proofPipeline?.openLoginAvailable ? 'yes' : 'no'}`,
    `- Reopen login available: ${runbook.proofPipeline?.reopenLoginAvailable ? 'yes' : 'no'}`,
    `- Reopen login starts capture: ${runbook.proofPipeline?.reopenLoginStartsCapture ? 'yes' : 'no'}`,
    `- Wait-capture opens browser: ${runbook.proofPipeline?.waitCaptureOpensBrowser ? 'yes' : 'no'}`,
    `- Wait-capture waits for auth: ${runbook.proofPipeline?.waitCaptureWaitsForAuth ? 'yes' : 'no'}`,
    `- Wait-capture starts capture: ${runbook.proofPipeline?.waitCaptureStartsCapture ? 'yes' : 'no'}`,
    `- Next artifact action: ${runbook.proofPipeline?.nextArtifactAction || 'none'}`,
    `- Next artifact blocker: ${runbook.proofPipeline?.nextArtifactBlocker || 'none'}`,
    '',
    '## Agent Next',
    '',
    `- Next action: ${runbook.agentNext?.nextAction || 'none'}`,
    `- Agent can run without approval: ${runbook.agentNext?.agentCanRunWithoutApproval ? 'yes' : 'no'}`,
    `- Agent command id: ${runbook.agentNext?.agentCommandId || 'none'}`,
    `- Operator approval required: ${runbook.agentNext?.operatorApprovalRequired ? 'yes' : 'no'}`,
    `- Human action: ${runbook.agentNext?.humanAction || 'none'}`,
    `- Automation blocker: ${runbook.agentNext?.automationBlocker || runbook.agentNext?.blockedReason || 'none'}`,
    `- Opens browser now: ${runbook.agentNext?.opensBrowserNow ? 'yes' : 'no'}`,
    `- Starts capture now: ${runbook.agentNext?.startsCaptureNow ? 'yes' : 'no'}`,
    '',
    '## Agent Proof Checklist',
    '',
    `- Complete: ${runbook.agentProofChecklist?.complete ? 'yes' : 'no'}`,
    `- Verdict: ${runbook.agentProofChecklist?.verdict || 'none'}`,
    `- Candidate: ${runbook.agentProofChecklist?.candidate || 'none'}`,
    `- Readiness remaining count: ${runbook.agentProofChecklist?.readinessRemainingCount ?? 0}`,
    `- Readiness remaining: ${runbook.agentProofChecklist?.readinessRemaining?.length ? runbook.agentProofChecklist.readinessRemaining.join(', ') : 'none'}`,
    `- Auth state: ${runbook.agentProofChecklist?.authState || 'none'}`,
    `- Auth usable: ${runbook.agentProofChecklist?.authUsable ? 'yes' : 'no'}`,
    `- Capture blocked: ${runbook.agentProofChecklist?.captureBlocked ? 'yes' : 'no'}`,
    `- Automation blocker: ${runbook.agentProofChecklist?.automationBlocker || 'none'}`,
    `- Operator approval required: ${runbook.agentProofChecklist?.operatorApprovalRequired ? 'yes' : 'no'}`,
    `- Operator approval token: ${runbook.agentProofChecklist?.operatorApprovalToken || 'none'}`,
    `- Operator command opens browser: ${runbook.agentProofChecklist?.operatorCommandOpensBrowser ? 'yes' : 'no'}`,
    `- Operator command starts capture: ${runbook.agentProofChecklist?.operatorCommandStartsCapture ? 'yes' : 'no'}`,
    `- Agent must not run operator resume unattended: ${runbook.agentProofChecklist?.agentMustNotRunOperatorResumeUnattended ? 'yes' : 'no'}`,
    '',
    '## Agent Proof Closeout',
    '',
    `- Complete: ${runbook.agentProofCloseout?.complete ? 'yes' : 'no'}`,
    `- Verdict: ${runbook.agentProofCloseout?.verdict || 'none'}`,
    `- Candidate: ${runbook.agentProofCloseout?.candidate || 'none'}`,
    `- Readiness remaining count: ${runbook.agentProofCloseout?.readinessRemainingCount ?? 0}`,
    `- Readiness remaining: ${runbook.agentProofCloseout?.readinessRemaining?.length ? runbook.agentProofCloseout.readinessRemaining.join(', ') : 'none'}`,
    `- Auth state: ${runbook.agentProofCloseout?.authState || 'none'}`,
    `- Auth usable: ${runbook.agentProofCloseout?.authUsable ? 'yes' : 'no'}`,
    `- Capture blocked: ${runbook.agentProofCloseout?.captureBlocked ? 'yes' : 'no'}`,
    `- Automation blocker: ${runbook.agentProofCloseout?.automationBlocker || 'none'}`,
    `- Accepted external proofs: ${runbook.agentProofCloseout?.acceptedExternalProofs ?? 0}`,
    `- Checklist exists: ${runbook.agentProofCloseout?.checklistExists ? 'yes' : 'no'}`,
    `- Checklist parse ok: ${runbook.agentProofCloseout?.checklistParseOk ? 'yes' : 'no'}`,
    '',
    '## Target Approval',
    '',
    `- Approval pack exists: ${runbook.targetApproval?.approvalPackExists ? 'yes' : 'no'}`,
    `- Approval pack parse ok: ${runbook.targetApproval?.approvalPackParseOk ? 'yes' : 'no'}`,
    `- Candidate: ${runbook.targetApproval?.selectedCandidate || 'none'}`,
    `- Target next: ${runbook.targetApproval?.targetNext || 'none'}`,
    `- Resume status: ${runbook.targetApproval?.resumeStatus || 'none'}`,
    `- Resume ready to run: ${runbook.targetApproval?.resumeReadyToRun ? 'yes' : 'no'}`,
    `- Resume planned opens browser: ${runbook.targetApproval?.resumePlannedCommandOpensBrowser ? 'yes' : 'no'}`,
    `- Resume planned starts capture: ${runbook.targetApproval?.resumePlannedCommandStartsCapture ? 'yes' : 'no'}`,
    '',
    '## Background Proof Capture',
    '',
    `- Plan status: ${runbook.backgroundProofCapture?.planStatus || 'none'}`,
    `- Capture blocked: ${runbook.backgroundProofCapture?.captureBlocked ? 'yes' : 'no'}`,
    `- Capture blocked reason: ${runbook.backgroundProofCapture?.captureBlockedReason || 'none'}`,
    `- Monitor available: ${runbook.backgroundProofCapture?.backgroundMonitorAvailable ? 'yes' : 'no'}`,
    `- Capture available: ${runbook.backgroundProofCapture?.backgroundCaptureAvailable ? 'yes' : 'no'}`,
    `- Monitor running: ${runbook.backgroundProofCapture?.monitorRunning ? 'yes' : 'no'}`,
    `- Capture running: ${runbook.backgroundProofCapture?.captureRunning ? 'yes' : 'no'}`,
    `- Capture start ready: ${runbook.backgroundProofCapture?.captureStartReadyToRun ? 'yes' : 'no'}`,
    `- Capture start blockers: ${runbook.backgroundProofCapture?.captureStartBlockers?.length ? runbook.backgroundProofCapture.captureStartBlockers.join(', ') : 'none'}`,
    '',
    '## Agent Loop Step',
    '',
    `- Saved step exists: ${runbook.agentLoopStepStatus?.exists ? 'yes' : 'no'}`,
    `- Saved step stale: ${runbook.agentLoopStepStatus?.stale ? 'yes' : 'no'}`,
    `- Saved step status: ${runbook.agentLoopStepStatus?.status || 'none'}`,
    `- Saved step next action: ${runbook.agentLoopStepStatus?.nextAction || 'none'}`,
    `- Recommended command id: ${runbook.agentLoopStepStatus?.recommendedCommandId || 'none'}`,
    `- Command id: ${runbook.agentLoopStepStatus?.commandId || 'none'}`,
    `- Allowed to run: ${runbook.agentLoopStepStatus?.allowedToRun ? 'yes' : 'no'}`,
    `- Executed: ${runbook.agentLoopStepStatus?.executed ? 'yes' : 'no'}`,
    `- Opens browser now: ${runbook.agentLoopStepStatus?.opensBrowserNow ? 'yes' : 'no'}`,
    `- Starts capture now: ${runbook.agentLoopStepStatus?.startsCaptureNow ? 'yes' : 'no'}`,
    '',
    '## Steps',
    ''
  ];
  for (const item of runbook.steps) {
    lines.push(`### ${item.id}`, '');
    lines.push(`- ${item.title}`);
    lines.push(`- ${item.detail}`);
    lines.push(`- Opens browser: ${item.opensBrowser ? 'yes' : 'no'}`);
    lines.push(`- Starts capture: ${item.startsCapture ? 'yes' : 'no'}`);
    lines.push(`- Run after user approval: ${item.runAfterUserApproval ? 'yes' : 'no'}`);
    if (item.command) {
      lines.push('', '```bash', item.command, '```');
    }
    lines.push('');
  }
  if (runbook.missingArtifacts?.length) {
    lines.push('## Missing Artifacts', '');
    for (const item of runbook.missingArtifacts) {
      const location = item.path ? ` (${item.path})` : '';
      lines.push(`- ${item.id}${location}: ${item.detail || item.kind || 'missing'}`);
    }
    lines.push('');
  }
  if (runbook.outputPath) {
    lines.push('## Written Runbook', '', `- Path: ${runbook.outputPath}`, '');
  }
  return lines.join('\n');
}
