import { buildAgentBackendSelect } from './agent-backend-select.mjs';
import { buildObjectiveNext } from './objective-next.mjs';
import { buildObjectiveCompletionAuditStatus } from './objective-completion-audit.mjs';
import { buildObjectiveProofPipeline } from './objective-proof-pipeline.mjs';
import { buildProviderDoctorStatus } from './provider-doctor-status.mjs';
import { buildReadinessAudit } from './readiness-audit.mjs';
import { buildSecretRunSelect } from './secret-audit.mjs';
import {
  agentProofChecklistCommand,
  agentProofChecklistStatusCommand,
  agentProofChecklistWriteCommand,
  agentProofCloseoutCommand,
  agentProofCloseoutStatusCommand,
  agentProofCloseoutWriteCommand,
  completionProofBundleCommand,
  completionProofBundleStatusCommand,
  completionProofBundleWriteCommand,
  compactKey
} from './start-commands.mjs';
import { buildTargetApprovalResume, buildTargetApprovalStatus } from './target-approval-pack.mjs';
import fs from 'node:fs';
import path from 'node:path';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function shell(command) {
  return command?.shell || '';
}

function explicitBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function rootRelativeCommandArg(rootDir, value) {
  if (!value) return value;
  const text = String(value);
  if (!path.isAbsolute(text)) return text;
  const resolvedRoot = path.resolve(rootDir);
  const resolvedValue = path.resolve(text);
  if (resolvedValue === resolvedRoot || resolvedValue.startsWith(`${resolvedRoot}${path.sep}`)) {
    return path.relative(resolvedRoot, resolvedValue);
  }
  return text;
}

function normalizeTargetProofPlanCommand(rootDir, commandValue) {
  const args = commandValue?.args;
  if (!Array.isArray(args)) return commandValue || null;
  const commandIndex = args.indexOf('target-proof-plan');
  if (commandIndex < 0 || commandIndex + 1 >= args.length) return commandValue;
  const normalizedArgs = [...args];
  normalizedArgs[commandIndex + 1] = rootRelativeCommandArg(rootDir, normalizedArgs[commandIndex + 1]);
  return command(normalizedArgs);
}

function normalizeRootCommandArgs(rootDir, commandValue) {
  const args = commandValue?.args;
  if (!Array.isArray(args)) return commandValue || null;
  const normalizedArgs = args.map((arg) => rootRelativeCommandArg(rootDir, arg));
  if (normalizedArgs.every((arg, index) => arg === args[index])) return commandValue;
  return command(normalizedArgs);
}

function commandOpensBrowser(commandValue) {
  const args = commandValue?.args || [];
  return args.includes('target-login')
    || args.includes('target-login-capture')
    || (args.includes('target-handoff-resume') && args.includes('--open-login'));
}

function commandStartsCapture(commandValue) {
  const args = commandValue?.args || [];
  return args.includes('target-proof-capture')
    || args.includes('target-handoff-run')
    || args.includes('target-run')
    || args.includes('target-scrape')
    || (args.includes('target-handoff-resume-watch') && args.includes('--run'))
    || (args.includes('target-handoff-resume') && args.includes('--wait-auth'))
    || (args.includes('target-login-capture') && !args.includes('--open-only'));
}

function commandRequiresOperatorApproval(commandValue) {
  return commandOpensBrowser(commandValue) || commandStartsCapture(commandValue);
}

function objectiveCompletionAuditStatusCommand(inputPath = 'operator/objective-completion-audit-latest.json') {
  return command([
    'node',
    'src/cli.mjs',
    'objective-completion-audit-status',
    '--in',
    inputPath,
    '--format',
    'compact'
  ]);
}

function inferSavedTargetApprovalResumeSafety(saved = {}) {
  const runCommand = saved?.commands?.targetApprovalResumeRun || saved?.targetApproval?.resumeRunCommand || null;
  const hasRunCommand = Boolean(shell(runCommand) || (Array.isArray(runCommand?.args) && runCommand.args.length));
  return {
    runCommand,
    plannedOpensBrowser: explicitBoolean(saved?.targetApproval?.resumePlannedCommandOpensBrowser) ?? hasRunCommand,
    plannedStartsCapture: explicitBoolean(saved?.targetApproval?.resumePlannedCommandStartsCapture) ?? hasRunCommand,
    requiresOperatorApproval: explicitBoolean(saved?.targetApproval?.resumeRequiresOperatorApproval) ?? hasRunCommand,
    agentMayRunUnattended: explicitBoolean(saved?.targetApproval?.resumeAgentMayRunUnattended) ?? false
  };
}

function operatorApprovalReasons(safety = {}) {
  const reasons = [];
  if (safety.operatorInput) reasons.push('operator-input');
  if (safety.captureBlocked) reasons.push('capture-blocked');
  if (safety.commandOpensBrowser) reasons.push('command-opens-browser');
  if (safety.approvalCommandOpensBrowser) reasons.push('approval-command-opens-browser');
  return reasons;
}

function safeRunsPath(rootDir, value, fallback, label) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(value || fallback).replace(/^[/\\]+/, '');
  const filePath = path.resolve(runsRoot, relative);
  const insideRuns = filePath === runsRoot || filePath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent control plane ${label}: ${value}`);
  return filePath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  if (!(resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`))) {
    throw new Error(`invalid agent control plane path: ${filePath}`);
  }
  return path.relative(runsRoot, resolved);
}

function ageSeconds(filePath, nowMs) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return Math.max(0, Math.round((nowMs - fs.statSync(filePath).mtimeMs) / 1000));
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, parseOk: false, value: null, error: '' };
  }
  try {
    return {
      exists: true,
      parseOk: true,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
      error: ''
    };
  } catch (error) {
    return {
      exists: true,
      parseOk: false,
      value: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function taskCommand(task, options = {}) {
  const args = ['node', 'src/cli.mjs', 'agent-control-plane', '--task', task];
  if (options.targetDir) args.push('--target-dir', options.targetDir);
  if (options.query) args.push('--query', options.query);
  if (options.provider) args.push('--provider', options.provider);
  if (options.backendMatrixIn) args.push('--backend-matrix-in', options.backendMatrixIn);
  if (options.mcpObservationIn) args.push('--mcp-observation-in', options.mcpObservationIn);
  if (options.chromeMcpConnected) args.push('--chrome-mcp-connected', options.chromeMcpConnected);
  if (options.chromeMcpPageListOk) args.push('--chrome-mcp-page-list-ok', options.chromeMcpPageListOk);
  if (options.chromeMcpPageCount !== undefined && options.chromeMcpPageCount !== '') args.push('--chrome-mcp-page-count', String(options.chromeMcpPageCount));
  if (options.allowNewBackgroundTab) args.push('--allow-new-background-tab', options.allowNewBackgroundTab);
  if (options.newBackgroundUrlEnv) args.push('--new-background-url-env', options.newBackgroundUrlEnv);
  if (options.monitorTimeoutMs) args.push('--monitor-timeout-ms', String(options.monitorTimeoutMs));
  if (options.monitorIntervalMs) args.push('--monitor-interval-ms', String(options.monitorIntervalMs));
  args.push('--format', 'compact');
  return command(args);
}

function watchRefreshCommand(options = {}) {
  const args = ['node', 'src/cli.mjs', 'agent-control-plane-watch', '--run'];
  if (options.in) args.push('--in', options.in);
  if (options.out) args.push('--out', options.out);
  if (options.staleAfterSeconds) args.push('--stale-after-seconds', String(options.staleAfterSeconds));
  if (options.task) args.push('--task', options.task);
  if (options.targetDir) args.push('--target-dir', options.targetDir);
  if (options.query) args.push('--query', options.query);
  if (options.provider) args.push('--provider', options.provider);
  if (options.backendMatrixIn) args.push('--backend-matrix-in', options.backendMatrixIn);
  if (options.mcpObservationIn) args.push('--mcp-observation-in', options.mcpObservationIn);
  if (options.chromeMcpConnected) args.push('--chrome-mcp-connected', options.chromeMcpConnected);
  if (options.chromeMcpPageListOk) args.push('--chrome-mcp-page-list-ok', options.chromeMcpPageListOk);
  if (options.chromeMcpPageCount !== undefined && options.chromeMcpPageCount !== '') args.push('--chrome-mcp-page-count', String(options.chromeMcpPageCount));
  if (options.allowNewBackgroundTab) args.push('--allow-new-background-tab', options.allowNewBackgroundTab);
  if (options.newBackgroundUrlEnv) args.push('--new-background-url-env', options.newBackgroundUrlEnv);
  if (options.monitorTimeoutMs) args.push('--monitor-timeout-ms', String(options.monitorTimeoutMs));
  if (options.monitorIntervalMs) args.push('--monitor-interval-ms', String(options.monitorIntervalMs));
  args.push('--format', 'compact');
  return command(args);
}

function agentSafeNextForControlPlaneStatus({ stale = false, refreshCommand = null, saved = null } = {}) {
  if (!stale && saved?.agentNextPreflightAvailable && saved?.agentNextPreflightMayRunWithoutApproval && saved?.agentNextPreflightCommand) {
    return {
      agentSafeNextCommandId: 'target-approval-preflight',
      agentSafeNextMayRunUnattended: true,
      agentSafeNextOpensBrowser: false,
      agentSafeNextStartsCapture: false,
      agentSafeNextReadsBrowserStorage: false,
      agentSafeNextReturnsPageContent: false,
      agentSafeNextCommand: saved.agentNextPreflightCommand
    };
  }
  if (!stale && saved?.agentNextProofPlanAvailable && saved?.agentNextProofPlanMayRunWithoutApproval && saved?.agentNextProofPlanCommand) {
    return {
      agentSafeNextCommandId: 'target-proof-plan',
      agentSafeNextMayRunUnattended: true,
      agentSafeNextOpensBrowser: false,
      agentSafeNextStartsCapture: false,
      agentSafeNextReadsBrowserStorage: false,
      agentSafeNextReturnsPageContent: false,
      agentSafeNextCommand: saved.agentNextProofPlanCommand
    };
  }
  const objectiveCommandId = saved?.objectiveCompletionAuditAgentSafeNextCommandId || '';
  const objectiveCommand = objectiveCommandId === 'objective-completion-audit-refresh'
    ? saved?.objectiveCompletionAuditWatchCommand || saved?.objectiveCompletionAuditWriteCommand || null
    : objectiveCommandId === 'objective-completion-audit-strict'
      ? saved?.objectiveCompletionAuditStrictCommand || null
      : null;
  if (!stale && objectiveCommand && saved?.objectiveCompletionAuditAgentSafeNextMayRunUnattended) {
    return {
      agentSafeNextCommandId: objectiveCommandId,
      agentSafeNextMayRunUnattended: true,
      agentSafeNextOpensBrowser: false,
      agentSafeNextStartsCapture: false,
      agentSafeNextReadsBrowserStorage: false,
      agentSafeNextReturnsPageContent: false,
      agentSafeNextCommand: objectiveCommand
    };
  }
  return {
    agentSafeNextCommandId: stale ? 'agent-control-plane-refresh' : 'none',
    agentSafeNextMayRunUnattended: Boolean(stale && refreshCommand),
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand: stale ? refreshCommand : null
  };
}

function objectiveCompletionAuditSummary(rootDir, options = {}, embedded = {}) {
  const input = options.objectiveCompletionAuditIn
    || options['objective-completion-audit-in']
    || 'operator/objective-completion-audit-latest.json';
  const current = options.objectiveCompletionAuditStatus || buildObjectiveCompletionAuditStatus({
    rootDir,
    in: input,
    staleAfterSeconds: options.objectiveCompletionAuditStaleAfterSeconds ?? options['objective-completion-audit-stale-after-seconds']
  });
  const useCurrent = Boolean(current.exists);
  return {
    exists: useCurrent ? Boolean(current.exists) : Boolean(embedded.exists),
    parseOk: useCurrent ? Boolean(current.parseOk) : Boolean(embedded.parseOk),
    stale: useCurrent ? Boolean(current.stale) : Boolean(embedded.stale),
    savedComplete: useCurrent ? Boolean(current.savedComplete) : Boolean(embedded.savedComplete),
    savedStatus: useCurrent ? current.savedStatus || '' : embedded.savedStatus || '',
    remainingCount: useCurrent ? current.remainingCount ?? 0 : embedded.remainingCount ?? 0,
    remaining: useCurrent ? current.remaining || [] : embedded.remaining || [],
    refreshNeeded: useCurrent ? Boolean(current.refreshNeeded) : Boolean(embedded.refreshNeeded),
    agentSafeNextCommandId: useCurrent ? current.agentSafeNextCommandId || '' : embedded.agentSafeNextCommandId || '',
    agentSafeNextMayRunUnattended: useCurrent ? Boolean(current.agentSafeNextMayRunUnattended) : Boolean(embedded.agentSafeNextMayRunUnattended),
    agentSafeNextOpensBrowser: useCurrent ? Boolean(current.agentSafeNextOpensBrowser) : Boolean(embedded.agentSafeNextOpensBrowser),
    agentSafeNextStartsCapture: useCurrent ? Boolean(current.agentSafeNextStartsCapture) : Boolean(embedded.agentSafeNextStartsCapture),
    agentSafeNextReadsBrowserStorage: useCurrent ? Boolean(current.agentSafeNextReadsBrowserStorage) : Boolean(embedded.agentSafeNextReadsBrowserStorage),
    agentSafeNextReturnsPageContent: useCurrent ? Boolean(current.agentSafeNextReturnsPageContent) : Boolean(embedded.agentSafeNextReturnsPageContent),
    writeCommand: useCurrent ? current.refreshCommand || null : embedded.writeCommand || null,
    statusCommand: objectiveCompletionAuditStatusCommand(input),
    watchCommand: useCurrent ? current.watchCommand || null : embedded.watchCommand || null,
    strictCommand: useCurrent ? current.strictCommand || null : embedded.strictCommand || null
  };
}

export async function buildAgentControlPlane(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const task = options.task || 'auto';
  const readiness = options.readiness || buildReadinessAudit({ rootDir, generatedAt });
  const providerDoctorStatus = options.providerDoctorStatus || buildProviderDoctorStatus({
    generatedAt,
    providerOptions: { rootDir },
    playwrightOptions: { rootDir },
    seleniumOptions: { rootDir }
  });
  const backendSelection = options.backendSelection || await buildAgentBackendSelect({
    ...options,
    rootDir,
    generatedAt,
    task
  });
  const objectiveNext = options.objectiveNext || await buildObjectiveNext({
    rootDir,
    generatedAt,
    readiness,
    monitorTimeoutMs: options.monitorTimeoutMs,
    monitorIntervalMs: options.monitorIntervalMs
  });
  const objectiveProofPipeline = options.objectiveProofPipeline || await buildObjectiveProofPipeline({
    rootDir,
    generatedAt,
    monitorTimeoutMs: options.monitorTimeoutMs,
    monitorIntervalMs: options.monitorIntervalMs
  });
  const objectiveCompletionAuditIn = options.objectiveCompletionAuditIn
    || options['objective-completion-audit-in']
    || 'operator/objective-completion-audit-latest.json';
  const objectiveCompletionAuditStatus = options.objectiveCompletionAuditStatus || buildObjectiveCompletionAuditStatus({
    rootDir,
    in: objectiveCompletionAuditIn,
    staleAfterSeconds: options.objectiveCompletionAuditStaleAfterSeconds ?? options['objective-completion-audit-stale-after-seconds']
  });
  const targetApprovalStatus = options.targetApprovalStatus || await buildTargetApprovalStatus({
    ...options,
    rootDir,
    generatedAt,
    candidate: options.candidate || options.targetCandidate || 'github',
    realExternal: true
  });
  const targetApprovalResume = options.targetApprovalResume || await buildTargetApprovalResume({
    ...options,
    rootDir,
    generatedAt,
    status: targetApprovalStatus,
    candidate: targetApprovalStatus.selectedCandidate || options.candidate || options.targetCandidate || 'github',
    realExternal: true,
    run: false
  });
  const targetDirRaw = options.targetDir || options['target-dir'] || backendSelection.target?.dir || '';
  const targetDir = rootRelativeCommandArg(rootDir, targetDirRaw);
  const query = options.query || backendSelection.query || '';
  const provider = options.provider || backendSelection.provider || '';
  const backendMatrixIn = options.backendMatrixIn || options['backend-matrix-in'] || '';
  const proofCandidate = targetApprovalStatus.selectedCandidate || targetApprovalResume.selectedCandidate || options.candidate || options.targetCandidate || 'github';
  const targetApprovalResumeProofPlanCommand = normalizeTargetProofPlanCommand(rootDir, targetApprovalResume.proofPlanCommand);
  const targetApprovalCompletionProofBundleWithAuditCommand = targetApprovalResume.completionProofBundleWithAuditCommand || completionProofBundleWriteCommand(proofCandidate);
  const targetApprovalAgentProofCloseoutWriteCommand = targetApprovalResume.agentProofCloseoutWriteCommand || agentProofCloseoutWriteCommand(proofCandidate);
  const targetApprovalAgentProofCloseoutStatusCommand = targetApprovalResume.agentProofCloseoutStatusCommand || agentProofCloseoutStatusCommand();
  const targetApprovalObjectiveCompletionStrictCommand = targetApprovalResume.objectiveCompletionStrictCommand || objectiveCompletionAuditStatus.strictCommand || command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']);
  const secretRunSelect = options.secretRunSelect || buildSecretRunSelect({
    ...options,
    command: options.secretCommand || 'target-login-capture',
    targetDir: targetDir || `runs/target-packs/${proofCandidate}`
  });
  const approvalReasons = operatorApprovalReasons(backendSelection.safety);
  const operatorApprovalRequired = approvalReasons.length > 0;
  const agentUnattendedAllowed = Boolean(backendSelection.safety?.executionAllowed) && !operatorApprovalRequired;

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    task,
    readiness: {
      readyForLocalAuthenticatedDevelopment: Boolean(readiness.readyForLocalAuthenticatedDevelopment),
      completeAgainstObjective: Boolean(readiness.completeAgainstObjective),
      remainingCount: readiness.requirements?.filter((item) => item.status !== 'proved').length ?? 0,
      remaining: readiness.requirements?.filter((item) => item.status !== 'proved').map((item) => item.id) || []
    },
    provider: {
      defaultBackend: providerDoctorStatus.defaultBackend,
      defaultAgentInterface: providerDoctorStatus.defaultAgentInterface,
      adoptionNext: providerDoctorStatus.adoptionNext,
      agentBrowserCliExists: Boolean(providerDoctorStatus.agentBrowser?.cliExists),
      agentBrowserChromeForTestingExists: Boolean(providerDoctorStatus.agentBrowser?.chromeForTestingExists),
      agentBrowserReadyForEngineUse: Boolean(providerDoctorStatus.agentBrowser?.readyForEngineUse),
      agentBrowserMissingChecks: providerDoctorStatus.agentBrowser?.missingChecks || [],
      agentBrowserNext: providerDoctorStatus.agentBrowser?.next || '',
      agentBrowserInstallRequiresOperatorApproval: Boolean(providerDoctorStatus.agentBrowser?.installPlanRequiresOperatorApproval),
      agentBrowserInstallAgentMayRunUnattended: Boolean(providerDoctorStatus.agentBrowser?.installPlanAgentMayRunUnattended),
      agentBrowserInstallMutatesRuntime: Boolean(providerDoctorStatus.agentBrowser?.installPlanMutatesRuntime),
      publicBenchmarkProofExists: Boolean(providerDoctorStatus.publicBenchmark?.exists),
      publicBenchmarkProofOk: Boolean(providerDoctorStatus.publicBenchmark?.ok),
      publicBenchmarkProofPath: providerDoctorStatus.publicBenchmark?.path || '',
      publicBenchmarkFastestMeasuredProvider: providerDoctorStatus.publicBenchmark?.fastestMeasuredProvider || '',
      publicBenchmarkDirectCdpColdOk: Boolean(providerDoctorStatus.publicBenchmark?.directCdpColdOk),
      publicBenchmarkDirectCdpDaemonOk: Boolean(providerDoctorStatus.publicBenchmark?.directCdpDaemonOk),
      publicBenchmarkAgentBrowserChromeOk: Boolean(providerDoctorStatus.publicBenchmark?.agentBrowserChromeOk),
      publicBenchmarkPlaywrightOk: Boolean(providerDoctorStatus.publicBenchmark?.playwrightOk),
      publicBenchmarkAgentMayRunUnattended: Boolean(providerDoctorStatus.publicBenchmark?.agentMayRunUnattended),
      publicBenchmarkStartsBrowser: Boolean(providerDoctorStatus.publicBenchmark?.startsBrowser),
      publicBenchmarkReadsBrowserStorage: Boolean(providerDoctorStatus.publicBenchmark?.readsBrowserStorage),
      publicBenchmarkReturnsPageContent: Boolean(providerDoctorStatus.publicBenchmark?.returnsPageContent),
      publicBenchmarkCommand: providerDoctorStatus.publicBenchmark?.command || providerDoctorStatus.commands?.publicBenchmark || '',
      lightpandaReadyForPublicBenchmark: Boolean(providerDoctorStatus.lightpanda?.readyForPublicBenchmark),
      lightpandaMissingChecks: providerDoctorStatus.lightpanda?.missingChecks || [],
      lightpandaInstallRequiresOperatorApproval: Boolean(providerDoctorStatus.lightpanda?.installPlanRequiresOperatorApproval),
      lightpandaInstallAgentMayRunUnattended: Boolean(providerDoctorStatus.lightpanda?.installPlanAgentMayRunUnattended),
      lightpandaInstallMutatesRuntime: Boolean(providerDoctorStatus.lightpanda?.installPlanMutatesRuntime),
      lightpandaBenchmarkRequiresOperatorApproval: Boolean(providerDoctorStatus.lightpanda?.benchmarkRequiresOperatorApproval),
      lightpandaBenchmarkAgentMayRunUnattended: Boolean(providerDoctorStatus.lightpanda?.benchmarkAgentMayRunUnattended),
      lightpandaBenchmarkStartsBrowser: Boolean(providerDoctorStatus.lightpanda?.benchmarkStartsBrowser),
      lightpandaBenchmarkReadsBrowserStorage: Boolean(providerDoctorStatus.lightpanda?.benchmarkReadsBrowserStorage),
      lightpandaBenchmarkReturnsPageContent: Boolean(providerDoctorStatus.lightpanda?.benchmarkReturnsPageContent),
      lightpandaBenchmarkCommand: providerDoctorStatus.lightpanda?.benchmarkCommand || providerDoctorStatus.commands?.lightpandaBenchmark || '',
      playwrightReadyForPublicSmoke: Boolean(providerDoctorStatus.playwright?.readyForPublicSmoke),
      playwrightReadyForAuthenticatedDefault: Boolean(providerDoctorStatus.playwright?.readyForAuthenticatedDefault),
      playwrightMissingChecks: providerDoctorStatus.playwright?.missingChecks || [],
      playwrightStorageStateSensitive: Boolean(providerDoctorStatus.playwright?.storageStateSensitive),
      playwrightInstallRequiresOperatorApproval: Boolean(providerDoctorStatus.playwright?.installPlanRequiresOperatorApproval),
      playwrightInstallAgentMayRunUnattended: Boolean(providerDoctorStatus.playwright?.installPlanAgentMayRunUnattended),
      playwrightInstallMutatesRuntime: Boolean(providerDoctorStatus.playwright?.installPlanMutatesRuntime),
      playwrightSmokeRequiresOperatorApproval: Boolean(providerDoctorStatus.playwright?.smokeRequiresOperatorApproval),
      playwrightSmokeAgentMayRunUnattended: Boolean(providerDoctorStatus.playwright?.smokeAgentMayRunUnattended),
      playwrightSmokeStartsBrowser: Boolean(providerDoctorStatus.playwright?.smokeStartsBrowser),
      playwrightSmokeReadsBrowserStorage: Boolean(providerDoctorStatus.playwright?.smokeReadsBrowserStorage),
      playwrightSmokeReturnsPageContent: Boolean(providerDoctorStatus.playwright?.smokeReturnsPageContent),
      playwrightSmokeCommand: providerDoctorStatus.playwright?.smokeCommand || providerDoctorStatus.commands?.playwrightSmoke || '',
      seleniumReadyForLocalSmoke: Boolean(providerDoctorStatus.selenium?.readyForLocalSmoke),
      seleniumMissingChecks: providerDoctorStatus.selenium?.missingChecks || [],
      seleniumInstallRequiresOperatorApproval: Boolean(providerDoctorStatus.selenium?.installPlanRequiresOperatorApproval),
      seleniumInstallAgentMayRunUnattended: Boolean(providerDoctorStatus.selenium?.installPlanAgentMayRunUnattended),
      seleniumInstallMutatesRuntime: Boolean(providerDoctorStatus.selenium?.installPlanMutatesRuntime),
      seleniumSmokeRequiresOperatorApproval: Boolean(providerDoctorStatus.selenium?.smokeRequiresOperatorApproval),
      seleniumSmokeAgentMayRunUnattended: Boolean(providerDoctorStatus.selenium?.smokeAgentMayRunUnattended),
      seleniumSmokeStartsBrowser: Boolean(providerDoctorStatus.selenium?.smokeStartsBrowser),
      seleniumSmokeCommand: providerDoctorStatus.selenium?.smokeCommand || providerDoctorStatus.commands?.seleniumSmoke || ''
    },
    backendSelection: {
      backend: backendSelection.selection?.backend || '',
      lane: backendSelection.selection?.lane || '',
      agentInterface: backendSelection.selection?.agentInterface || '',
      backendAvailable: Boolean(backendSelection.selection?.backendAvailable),
      canRunInBackground: Boolean(backendSelection.selection?.canRunInBackground),
      executionAllowed: Boolean(backendSelection.safety?.executionAllowed),
      agentUnattendedAllowed,
      operatorApprovalRequired,
      operatorApprovalReasons: approvalReasons,
      blockedReason: backendSelection.safety?.blockedReason || '',
      operatorInput: Boolean(backendSelection.safety?.operatorInput),
      captureBlocked: Boolean(backendSelection.safety?.captureBlocked),
      commandOpensBrowser: Boolean(backendSelection.safety?.commandOpensBrowser),
      approvalCommandOpensBrowser: Boolean(backendSelection.safety?.approvalCommandOpensBrowser),
      opensBrowserNow: Boolean(backendSelection.opensBrowserNow),
      startsCaptureNow: Boolean(backendSelection.startsCaptureNow)
    },
    agentTask: {
      recommendedCommandId: backendSelection.agentTask?.recommendedCommandId || '',
      status: backendSelection.agentTask?.status || '',
      executionAllowed: Boolean(backendSelection.agentTask?.executionAllowed),
      blockedReason: backendSelection.agentTask?.blockedReason || '',
      authPreflightChecked: Boolean(backendSelection.agentTask?.authPreflightChecked),
      authPreflightParsed: Boolean(backendSelection.agentTask?.authPreflightParsed),
      authPreflightOk: backendSelection.agentTask?.authPreflightOk ?? null,
      authPreflightLoginLike: backendSelection.agentTask?.authPreflightLoginLike ?? null,
      authPreflightSameOrigin: backendSelection.agentTask?.authPreflightSameOrigin ?? null,
      authPreflightNextAction: backendSelection.agentTask?.authPreflightNextAction || ''
    },
    objectiveNext: {
      primary: objectiveNext.primaryAction?.id || '',
      requirement: objectiveNext.primaryAction?.requirementId || '',
      status: objectiveNext.primaryAction?.status || '',
      needsOperatorInput: Boolean(objectiveNext.primaryAction?.needsOperatorInput),
      captureBlocked: Boolean(objectiveNext.primaryAction?.operatorGuidance?.captureBlocked),
      humanAction: objectiveNext.primaryAction?.operatorGuidance?.humanAction || '',
      automationBlocker: objectiveNext.primaryAction?.operatorGuidance?.automationBlocker || '',
      primaryOpensBrowser: commandOpensBrowser(objectiveNext.primaryAction?.command),
      primaryStartsCapture: commandStartsCapture(objectiveNext.primaryAction?.command),
      primaryRequiresOperatorApproval: Boolean(objectiveNext.primaryAction?.needsOperatorInput)
        || commandRequiresOperatorApproval(objectiveNext.primaryAction?.command),
      agentMustNotRunPrimaryUnattended: Boolean(objectiveNext.primaryAction?.needsOperatorInput)
        || commandRequiresOperatorApproval(objectiveNext.primaryAction?.command),
      manualCommandCandidates: (objectiveNext.primaryAction?.manualCommandCandidates || []).map((candidate) => ({
        id: candidate.id || '',
        opensBrowser: commandOpensBrowser(candidate.command),
        startsCapture: commandStartsCapture(candidate.command),
        requiresOperatorApproval: commandRequiresOperatorApproval(candidate.command),
        agentMustNotRunUnattended: commandRequiresOperatorApproval(candidate.command),
        command: normalizeRootCommandArgs(rootDir, candidate.command)
      }))
    },
    proofPipeline: {
      status: objectiveProofPipeline.status || '',
      recommendedNow: objectiveProofPipeline.decision?.recommendedNow || '',
      proofCaptureAllowedNow: Boolean(objectiveProofPipeline.decision?.proofCaptureAllowedNow),
      nextArtifactAction: objectiveProofPipeline.decision?.nextArtifactAction || '',
      nextArtifactBlocker: objectiveProofPipeline.decision?.nextArtifactBlocker || '',
      monitorAuthAvailable: Boolean(objectiveProofPipeline.phases?.monitorAuth?.available),
      reopenLoginAvailable: Boolean(objectiveProofPipeline.phases?.reopenLogin?.available),
      reopenLoginOpensBrowser: commandOpensBrowser(objectiveProofPipeline.phases?.reopenLogin?.command),
      reopenLoginStartsCapture: Boolean(objectiveProofPipeline.phases?.reopenLogin?.startsCapture),
      reopenLoginRequiresOperatorApproval: Boolean(objectiveProofPipeline.phases?.reopenLogin?.available),
      reopenLoginAgentMustNotRunUnattended: Boolean(objectiveProofPipeline.phases?.reopenLogin?.available),
      backgroundMonitorStartAvailable: Boolean(objectiveProofPipeline.background?.monitorStartAvailable),
      backgroundCaptureStartAvailable: Boolean(objectiveProofPipeline.background?.captureStartAvailable),
      backgroundCommandsOperatorGated: Boolean(objectiveProofPipeline.background?.commandsAreOperatorGated)
    },
    objectiveCompletionAudit: {
      exists: Boolean(objectiveCompletionAuditStatus.exists),
      parseOk: Boolean(objectiveCompletionAuditStatus.parseOk),
      stale: Boolean(objectiveCompletionAuditStatus.stale),
      savedComplete: Boolean(objectiveCompletionAuditStatus.savedComplete),
      savedStatus: objectiveCompletionAuditStatus.savedStatus || '',
      readinessComplete: Boolean(objectiveCompletionAuditStatus.readinessComplete),
      allCriteriaProved: Boolean(objectiveCompletionAuditStatus.allCriteriaProved),
      remainingCount: objectiveCompletionAuditStatus.remainingCount ?? 0,
      remaining: objectiveCompletionAuditStatus.remaining || [],
      refreshNeeded: Boolean(objectiveCompletionAuditStatus.refreshNeeded),
      nextActionId: objectiveCompletionAuditStatus.nextActionId || '',
      nextStatus: objectiveCompletionAuditStatus.nextStatus || '',
      nextCommandRequiresOperatorApproval: Boolean(objectiveCompletionAuditStatus.nextCommandRequiresOperatorApproval),
      nextCommandAgentMayRunUnattended: Boolean(objectiveCompletionAuditStatus.nextCommandAgentMayRunUnattended),
      targetApprovalCandidate: objectiveCompletionAuditStatus.targetApprovalCandidate || '',
      targetApprovalResumeStatus: objectiveCompletionAuditStatus.targetApprovalResumeStatus || '',
      targetApprovalResumeRequiresOperatorApproval: Boolean(objectiveCompletionAuditStatus.targetApprovalResumeRequiresOperatorApproval),
      targetApprovalResumeAgentMayRunUnattended: Boolean(objectiveCompletionAuditStatus.targetApprovalResumeAgentMayRunUnattended),
      targetApprovalResumeOpensBrowser: Boolean(objectiveCompletionAuditStatus.targetApprovalResumeOpensBrowser),
      targetApprovalResumeStartsCapture: Boolean(objectiveCompletionAuditStatus.targetApprovalResumeStartsCapture),
      agentSafeNextCommandId: objectiveCompletionAuditStatus.agentSafeNextCommandId || '',
      agentSafeNextMayRunUnattended: Boolean(objectiveCompletionAuditStatus.agentSafeNextMayRunUnattended),
      agentSafeNextOpensBrowser: Boolean(objectiveCompletionAuditStatus.agentSafeNextOpensBrowser),
      agentSafeNextStartsCapture: Boolean(objectiveCompletionAuditStatus.agentSafeNextStartsCapture),
      agentSafeNextReadsBrowserStorage: Boolean(objectiveCompletionAuditStatus.agentSafeNextReadsBrowserStorage),
      agentSafeNextReturnsPageContent: Boolean(objectiveCompletionAuditStatus.agentSafeNextReturnsPageContent)
    },
    targetApproval: {
      approvalPackExists: Boolean(targetApprovalStatus.approvalPackExists),
      approvalPackParseOk: Boolean(targetApprovalStatus.approvalPackParseOk),
      selectedCandidate: targetApprovalStatus.selectedCandidate || targetApprovalResume.selectedCandidate || '',
      targetPackExists: Boolean(targetApprovalStatus.targetPackExists),
      targetNext: targetApprovalStatus.nextAction?.id || targetApprovalResume.targetNext || '',
      humanAction: targetApprovalStatus.target?.operatorGuidance?.humanAction || targetApprovalResume.humanAction || '',
      automationBlocker: targetApprovalStatus.target?.operatorGuidance?.automationBlocker || targetApprovalResume.automationBlocker || '',
      captureBlocked: Boolean(targetApprovalStatus.target?.operatorGuidance?.captureBlocked ?? true),
      resumeStatus: targetApprovalResume.status || '',
      resumeReadyToRun: Boolean(targetApprovalResume.readyToRun),
      resumePlannedCommandOpensBrowser: Boolean(targetApprovalResume.plannedCommandOpensBrowser),
      resumePlannedCommandStartsCapture: Boolean(targetApprovalResume.plannedCommandStartsCapture),
      statusCommand: targetApprovalResume.statusCommand || null,
      preflightCommand: command([
        'node',
        'src/cli.mjs',
        'target-approval-preflight',
        '--candidate',
        targetApprovalStatus.selectedCandidate || targetApprovalResume.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      resumePlanCommand: command([
        'node',
        'src/cli.mjs',
        'target-approval-resume',
        '--candidate',
        targetApprovalStatus.selectedCandidate || targetApprovalResume.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      resumeRunCommand: targetApprovalResume.runCommand || null,
      completionProofBundleWithAuditCommand: targetApprovalCompletionProofBundleWithAuditCommand,
      agentProofCloseoutWriteCommand: targetApprovalAgentProofCloseoutWriteCommand,
      agentProofCloseoutStatusCommand: targetApprovalAgentProofCloseoutStatusCommand,
      objectiveCompletionStrictCommand: targetApprovalObjectiveCompletionStrictCommand
    },
    secretRun: {
      commandId: secretRunSelect.commandId || '',
      targetDir: secretRunSelect.targetDir || '',
      opAvailable: Boolean(secretRunSelect.opAvailable),
      selectedCandidate: secretRunSelect.selectedCandidate || '',
      selectedMode: secretRunSelect.selectedMode || '',
      headless: Boolean(secretRunSelect.headless),
      readyToRunNow: Boolean(secretRunSelect.readyToRunNow),
      setupRequired: secretRunSelect.setupRequired || [],
      recommendedHeadlessMode: secretRunSelect.recommendedHeadlessMode || '',
      headlessReady: Boolean(secretRunSelect.headlessReady),
      headlessConfigAvailable: Boolean(secretRunSelect.headlessConfigAvailable),
      serviceAccountEnvFileUsable: Boolean(secretRunSelect.serviceAccountEnvFileUsable),
      desktopIntegrationLikely: Boolean(secretRunSelect.desktopIntegrationLikely),
      runCommandSafety: secretRunSelect.runCommandSafety || {},
      selectorCommand: command([
        'node',
        'src/cli.mjs',
        'secret-run-select',
        '--command',
        secretRunSelect.commandId || 'target-login-capture',
        ...(secretRunSelect.targetDir ? ['--target-dir', secretRunSelect.targetDir] : []),
        '--format',
        'compact'
      ]),
      wrappedCommand: secretRunSelect.command || null,
      setupCommand: secretRunSelect.setupCommand || null
    },
    agentNext: {
      action: agentUnattendedAllowed ? 'run-agent-task' : 'wait-operator-or-run-safe-preflight',
      canRunWithoutApproval: agentUnattendedAllowed,
      commandId: agentUnattendedAllowed ? (backendSelection.agentTask?.recommendedCommandId || 'agent-task') : 'none',
      preflightAvailable: Boolean(targetApprovalResume.preflightCommand),
      preflightAction: targetApprovalResume.preflightCommand ? 'run-operator-approval-preflight' : 'none',
      preflightMayRunWithoutApproval: Boolean(targetApprovalResume.preflightCommand),
      proofPlanAvailable: Boolean(targetApprovalResumeProofPlanCommand),
      proofPlanAction: targetApprovalResumeProofPlanCommand ? 'run-target-proof-plan' : 'none',
      proofPlanMayRunWithoutApproval: Boolean(targetApprovalResumeProofPlanCommand),
      operatorApprovalRequired: Boolean(targetApprovalResume.plannedCommandOpensBrowser || targetApprovalResume.plannedCommandStartsCapture),
      operatorApprovalPreflightOpensBrowser: false,
      operatorApprovalPreflightStartsCapture: false,
      operatorApprovalPreflightReadsBrowserStorage: false,
      operatorApprovalPreflightReturnsPageContent: false,
      operatorApprovalPreflightMayRunUnattended: Boolean(targetApprovalResume.preflightCommand),
      operatorApprovalProofPlanOpensBrowser: false,
      operatorApprovalProofPlanStartsCapture: false,
      operatorApprovalProofPlanReadsBrowserStorage: false,
      operatorApprovalProofPlanReturnsPageContent: false,
      operatorApprovalProofPlanMayRunUnattended: Boolean(targetApprovalResumeProofPlanCommand),
      operatorApprovalOpensBrowser: Boolean(targetApprovalResume.plannedCommandOpensBrowser),
      operatorApprovalStartsCapture: Boolean(targetApprovalResume.plannedCommandStartsCapture),
      operatorApprovalAgentMayRunUnattended: false,
      opensBrowserNow: false,
      startsCaptureNow: false
    },
    commands: {
      self: taskCommand(task, {
        targetDir,
        query,
        provider,
        backendMatrixIn,
        mcpObservationIn: options.mcpObservationIn,
        chromeMcpConnected: options.chromeMcpConnected,
        chromeMcpPageListOk: options.chromeMcpPageListOk,
        chromeMcpPageCount: options.chromeMcpPageCount,
        allowNewBackgroundTab: options.allowNewBackgroundTab,
        newBackgroundUrlEnv: options.newBackgroundUrlEnv,
        monitorTimeoutMs: options.monitorTimeoutMs,
        monitorIntervalMs: options.monitorIntervalMs
      }),
      backendSelector: normalizeRootCommandArgs(rootDir, backendSelection.commands?.selector),
      workflow: normalizeRootCommandArgs(rootDir, backendSelection.commands?.workflow),
      safeRun: normalizeRootCommandArgs(rootDir, backendSelection.commands?.safeRun),
      selectedDirect: normalizeRootCommandArgs(rootDir, backendSelection.commands?.selectedDirect),
      regularChromeStatus: backendSelection.commands?.regularChromeStatus || null,
      chromeExtensionBackendCheckPlan: backendSelection.commands?.chromeExtensionBackendCheckPlan || null,
      chromeExtensionClaimPlan: backendSelection.commands?.chromeExtensionClaimPlan || null,
      providerDoctorStatus: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']),
      readiness: command(['node', 'src/cli.mjs', 'readiness-audit', '--format', 'compact']),
      objectiveNext: command([
        'node',
        'src/cli.mjs',
        'objective-next',
        ...(options.monitorTimeoutMs ? ['--monitor-timeout-ms', String(options.monitorTimeoutMs)] : []),
        ...(options.monitorIntervalMs ? ['--monitor-interval-ms', String(options.monitorIntervalMs)] : []),
        '--format',
        'compact'
      ]),
      objectiveProofPipeline: command([
        'node',
        'src/cli.mjs',
        'objective-proof-pipeline',
        ...(options.monitorTimeoutMs ? ['--monitor-timeout-ms', String(options.monitorTimeoutMs)] : []),
        ...(options.monitorIntervalMs ? ['--monitor-interval-ms', String(options.monitorIntervalMs)] : []),
        '--format',
        'compact'
      ]),
      proofPipelineMonitorAuth: normalizeRootCommandArgs(rootDir, objectiveProofPipeline.phases?.monitorAuth?.command),
      proofPipelineReopenLogin: normalizeRootCommandArgs(rootDir, objectiveProofPipeline.phases?.reopenLogin?.command),
      proofPipelineBackgroundStatus: objectiveProofPipeline.background?.statusCommand || null,
      proofPipelineBackgroundMonitorStart: normalizeRootCommandArgs(rootDir, objectiveProofPipeline.background?.monitorStartCommand),
      proofPipelineBackgroundCaptureStart: normalizeRootCommandArgs(rootDir, objectiveProofPipeline.background?.captureStartCommand),
      targetApprovalStatus: targetApprovalResume.statusCommand || null,
      targetApprovalPreflight: command([
        'node',
        'src/cli.mjs',
        'target-approval-preflight',
        '--candidate',
        targetApprovalStatus.selectedCandidate || targetApprovalResume.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      targetApprovalResumePlan: command([
        'node',
        'src/cli.mjs',
        'target-approval-resume',
        '--candidate',
        targetApprovalStatus.selectedCandidate || targetApprovalResume.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      targetApprovalResumeRun: targetApprovalResume.runCommand || null,
      targetApprovalCompletionProofBundleWithAudit: targetApprovalCompletionProofBundleWithAuditCommand,
      targetApprovalAgentProofCloseoutWrite: targetApprovalAgentProofCloseoutWriteCommand,
      targetApprovalAgentProofCloseoutStatus: targetApprovalAgentProofCloseoutStatusCommand,
      targetApprovalObjectiveCompletionStrict: targetApprovalObjectiveCompletionStrictCommand,
      secretRunSelect: command([
        'node',
        'src/cli.mjs',
        'secret-run-select',
        '--command',
        secretRunSelect.commandId || 'target-login-capture',
        ...(secretRunSelect.targetDir ? ['--target-dir', secretRunSelect.targetDir] : []),
        '--format',
        'compact'
      ]),
      secretRunWrapped: secretRunSelect.command || null,
      secretRunSetup: secretRunSelect.setupCommand || null,
      agentNext: command([
        'node',
        'src/cli.mjs',
        'agent-next',
        ...(options.monitorTimeoutMs ? ['--monitor-timeout-ms', String(options.monitorTimeoutMs)] : []),
        ...(options.monitorIntervalMs ? ['--monitor-interval-ms', String(options.monitorIntervalMs)] : []),
        '--format',
        'compact'
      ]),
      agentNextPreflight: targetApprovalResume.preflightCommand || null,
      agentNextProofPlan: targetApprovalResumeProofPlanCommand,
      agentNextOperatorApprovalPlan: command([
        'node',
        'src/cli.mjs',
        'target-approval-resume',
        '--candidate',
        targetApprovalStatus.selectedCandidate || targetApprovalResume.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      agentNextOperatorApproval: targetApprovalResume.runCommand || null,
      agentProofChecklist: agentProofChecklistCommand(proofCandidate),
      agentProofChecklistWrite: agentProofChecklistWriteCommand(proofCandidate),
      agentProofChecklistStatus: agentProofChecklistStatusCommand(),
      completionProofBundle: completionProofBundleCommand(proofCandidate),
      completionProofBundleWrite: completionProofBundleWriteCommand(proofCandidate),
      completionProofBundleStatus: completionProofBundleStatusCommand(),
      objectiveCompletionAuditWrite: objectiveCompletionAuditStatus.refreshCommand || null,
      objectiveCompletionAuditStatus: objectiveCompletionAuditStatusCommand(objectiveCompletionAuditIn),
      objectiveCompletionAuditWatch: objectiveCompletionAuditStatus.watchCommand || null,
      objectiveCompletionAuditStrict: objectiveCompletionAuditStatus.strictCommand || null,
      agentProofCloseout: agentProofCloseoutCommand(proofCandidate),
      agentProofCloseoutWrite: agentProofCloseoutWriteCommand(proofCandidate),
      agentProofCloseoutStatus: agentProofCloseoutStatusCommand()
    }
  };
}

export function writeAgentControlPlane(rootDir, status, outPath = '') {
  const filePath = safeRunsPath(rootDir, outPath, 'operator/agent-control-plane-latest.json', 'output path');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  return runsRelativePath(rootDir, filePath);
}

export function buildAgentControlPlaneStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const nowMs = options.nowMs || Date.now();
  const filePath = safeRunsPath(rootDir, options.in || options.input, 'operator/agent-control-plane-latest.json', 'input path');
  const read = readJsonFile(filePath);
  const value = read.value || {};
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const fileAge = ageSeconds(filePath, nowMs);
  const stale = !read.exists || !read.parseOk || fileAge === null || fileAge > staleAfterSeconds;
  const targetApprovalResumeSafety = read.parseOk ? inferSavedTargetApprovalResumeSafety(value) : inferSavedTargetApprovalResumeSafety();
  const savedTargetApprovalCandidate = value.targetApproval?.selectedCandidate || 'github';
  const objectiveCompletionAudit = read.parseOk ? objectiveCompletionAuditSummary(rootDir, options, {
    exists: value.objectiveCompletionAudit?.exists,
    parseOk: value.objectiveCompletionAudit?.parseOk,
    stale: value.objectiveCompletionAudit?.stale,
    savedComplete: value.objectiveCompletionAudit?.savedComplete,
    savedStatus: value.objectiveCompletionAudit?.savedStatus,
    remainingCount: value.objectiveCompletionAudit?.remainingCount,
    remaining: value.objectiveCompletionAudit?.remaining,
    refreshNeeded: value.objectiveCompletionAudit?.refreshNeeded,
    agentSafeNextCommandId: value.objectiveCompletionAudit?.agentSafeNextCommandId,
    agentSafeNextMayRunUnattended: value.objectiveCompletionAudit?.agentSafeNextMayRunUnattended,
    agentSafeNextOpensBrowser: value.objectiveCompletionAudit?.agentSafeNextOpensBrowser,
    agentSafeNextStartsCapture: value.objectiveCompletionAudit?.agentSafeNextStartsCapture,
    agentSafeNextReadsBrowserStorage: value.objectiveCompletionAudit?.agentSafeNextReadsBrowserStorage,
    agentSafeNextReturnsPageContent: value.objectiveCompletionAudit?.agentSafeNextReturnsPageContent,
    writeCommand: value.commands?.objectiveCompletionAuditWrite || null,
    watchCommand: value.commands?.objectiveCompletionAuditWatch || null,
    strictCommand: value.commands?.objectiveCompletionAuditStrict || null
  }) : null;
  const refreshCommand = command(['node', 'src/cli.mjs', 'agent-control-plane', '--write', '--out', runsRelativePath(rootDir, filePath), '--format', 'compact']);
  return {
    schemaVersion: 1,
    generatedAt: new Date(nowMs).toISOString(),
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    path: runsRelativePath(rootDir, filePath),
    exists: read.exists,
    parseOk: read.parseOk,
    parseError: read.error,
    ageSeconds: fileAge,
    staleAfterSeconds,
    stale,
    saved: read.parseOk ? {
      generatedAt: value.generatedAt || '',
      task: value.task || '',
      readyForLocalAuthenticatedDevelopment: Boolean(value.readiness?.readyForLocalAuthenticatedDevelopment),
      completeAgainstObjective: Boolean(value.readiness?.completeAgainstObjective),
      remaining: value.readiness?.remaining || [],
      defaultBackend: value.provider?.defaultBackend || '',
      selectedBackend: value.backendSelection?.backend || '',
      selectedLane: value.backendSelection?.lane || '',
      executionAllowed: Boolean(value.backendSelection?.executionAllowed),
      blockedReason: value.backendSelection?.blockedReason || '',
      agentTaskRecommendedCommandId: value.agentTask?.recommendedCommandId || '',
      agentTaskStatus: value.agentTask?.status || '',
      agentTaskExecutionAllowed: Boolean(value.agentTask?.executionAllowed),
      agentTaskBlockedReason: value.agentTask?.blockedReason || '',
      agentTaskAuthPreflightChecked: Boolean(value.agentTask?.authPreflightChecked),
      agentTaskAuthPreflightParsed: Boolean(value.agentTask?.authPreflightParsed),
      agentTaskAuthPreflightOk: value.agentTask?.authPreflightOk ?? null,
      agentTaskAuthPreflightLoginLike: value.agentTask?.authPreflightLoginLike ?? null,
      agentTaskAuthPreflightSameOrigin: value.agentTask?.authPreflightSameOrigin ?? null,
      agentTaskAuthPreflightNextAction: value.agentTask?.authPreflightNextAction || '',
      objectivePrimary: value.objectiveNext?.primary || '',
      proofPipelineRecommendedNow: value.proofPipeline?.recommendedNow || '',
      objectiveCompletionAuditExists: Boolean(objectiveCompletionAudit?.exists),
      objectiveCompletionAuditParseOk: Boolean(objectiveCompletionAudit?.parseOk),
      objectiveCompletionAuditStale: Boolean(objectiveCompletionAudit?.stale),
      objectiveCompletionAuditSavedComplete: Boolean(objectiveCompletionAudit?.savedComplete),
      objectiveCompletionAuditSavedStatus: objectiveCompletionAudit?.savedStatus || '',
      objectiveCompletionAuditRemainingCount: objectiveCompletionAudit?.remainingCount ?? 0,
      objectiveCompletionAuditRemaining: objectiveCompletionAudit?.remaining || [],
      objectiveCompletionAuditRefreshNeeded: Boolean(objectiveCompletionAudit?.refreshNeeded),
      objectiveCompletionAuditAgentSafeNextCommandId: objectiveCompletionAudit?.agentSafeNextCommandId || '',
      objectiveCompletionAuditAgentSafeNextMayRunUnattended: Boolean(objectiveCompletionAudit?.agentSafeNextMayRunUnattended),
      objectiveCompletionAuditAgentSafeNextOpensBrowser: Boolean(objectiveCompletionAudit?.agentSafeNextOpensBrowser),
      objectiveCompletionAuditAgentSafeNextStartsCapture: Boolean(objectiveCompletionAudit?.agentSafeNextStartsCapture),
      objectiveCompletionAuditAgentSafeNextReadsBrowserStorage: Boolean(objectiveCompletionAudit?.agentSafeNextReadsBrowserStorage),
      objectiveCompletionAuditAgentSafeNextReturnsPageContent: Boolean(objectiveCompletionAudit?.agentSafeNextReturnsPageContent),
      objectiveCompletionAuditWriteCommand: objectiveCompletionAudit?.writeCommand || null,
      objectiveCompletionAuditStatusCommand: objectiveCompletionAudit?.statusCommand || null,
      objectiveCompletionAuditWatchCommand: objectiveCompletionAudit?.watchCommand || null,
      objectiveCompletionAuditStrictCommand: objectiveCompletionAudit?.strictCommand || null,
      agentNextAction: value.agentNext?.action || '',
      agentNextCanRunWithoutApproval: Boolean(value.agentNext?.canRunWithoutApproval),
      agentNextCommandId: value.agentNext?.commandId || '',
      agentNextPreflightAvailable: Boolean(value.agentNext?.preflightAvailable),
      agentNextPreflightMayRunWithoutApproval: Boolean(value.agentNext?.preflightMayRunWithoutApproval),
      agentNextProofPlanAvailable: Boolean(value.agentNext?.proofPlanAvailable),
      agentNextProofPlanMayRunWithoutApproval: Boolean(value.agentNext?.proofPlanMayRunWithoutApproval),
      agentNextOperatorApprovalRequired: Boolean(value.agentNext?.operatorApprovalRequired),
      agentNextOperatorApprovalOpensBrowser: Boolean(value.agentNext?.operatorApprovalOpensBrowser),
      agentNextOperatorApprovalStartsCapture: Boolean(value.agentNext?.operatorApprovalStartsCapture),
      agentNextOperatorApprovalAgentMayRunUnattended: Boolean(value.agentNext?.operatorApprovalAgentMayRunUnattended),
      agentNextCommand: value.commands?.agentNext || null,
      agentNextPreflightCommand: value.commands?.agentNextPreflight || null,
      agentNextProofPlanCommand: normalizeTargetProofPlanCommand(rootDir, value.commands?.agentNextProofPlan),
      agentNextOperatorApprovalPlanCommand: value.commands?.agentNextOperatorApprovalPlan || null,
      agentNextOperatorApprovalCommand: value.commands?.agentNextOperatorApproval || null,
      targetApprovalCandidate: value.targetApproval?.selectedCandidate || '',
      targetApprovalResumeStatus: value.targetApproval?.resumeStatus || '',
      targetApprovalResumeReadyToRun: Boolean(value.targetApproval?.resumeReadyToRun),
      targetApprovalResumePlannedOpensBrowser: targetApprovalResumeSafety.plannedOpensBrowser,
      targetApprovalResumePlannedStartsCapture: targetApprovalResumeSafety.plannedStartsCapture,
      targetApprovalResumeRequiresOperatorApproval: targetApprovalResumeSafety.requiresOperatorApproval,
      targetApprovalResumeAgentMayRunUnattended: targetApprovalResumeSafety.agentMayRunUnattended,
      targetApprovalResumeRunCommand: targetApprovalResumeSafety.runCommand,
      targetApprovalCompletionProofBundleWithAuditCommand: value.commands?.targetApprovalCompletionProofBundleWithAudit || value.targetApproval?.completionProofBundleWithAuditCommand || completionProofBundleWriteCommand(savedTargetApprovalCandidate),
      targetApprovalAgentProofCloseoutWriteCommand: value.commands?.targetApprovalAgentProofCloseoutWrite || value.targetApproval?.agentProofCloseoutWriteCommand || agentProofCloseoutWriteCommand(savedTargetApprovalCandidate),
      targetApprovalAgentProofCloseoutStatusCommand: value.commands?.targetApprovalAgentProofCloseoutStatus || value.targetApproval?.agentProofCloseoutStatusCommand || agentProofCloseoutStatusCommand(),
      targetApprovalObjectiveCompletionStrictCommand: value.commands?.targetApprovalObjectiveCompletionStrict || value.targetApproval?.objectiveCompletionStrictCommand || command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
      secretRunCommandId: value.secretRun?.commandId || '',
      secretRunTargetDir: value.secretRun?.targetDir || '',
      secretRunSelectedCandidate: value.secretRun?.selectedCandidate || '',
      secretRunSelectedMode: value.secretRun?.selectedMode || '',
      secretRunHeadless: Boolean(value.secretRun?.headless),
      secretRunReadyToRunNow: Boolean(value.secretRun?.readyToRunNow),
      secretRunSetupRequired: value.secretRun?.setupRequired || [],
      secretRunWrappedOpensBrowser: Boolean(value.secretRun?.runCommandSafety?.opensBrowser),
      secretRunWrappedStartsCapture: Boolean(value.secretRun?.runCommandSafety?.startsCapture),
      secretRunWrappedStartsBackground: Boolean(value.secretRun?.runCommandSafety?.startsBackground),
      secretRunWrappedRequiresOperatorApproval: Boolean(value.secretRun?.runCommandSafety?.requiresOperatorApproval),
      secretRunWrappedAgentMayRunUnattended: Boolean(value.secretRun?.runCommandSafety?.agentMayRunUnattended),
      secretRunSelectCommand: value.commands?.secretRunSelect || value.secretRun?.selectorCommand || null,
      secretRunWrappedCommand: value.commands?.secretRunWrapped || value.secretRun?.wrappedCommand || null,
      secretRunSetupCommand: value.commands?.secretRunSetup || value.secretRun?.setupCommand || null
    } : null,
    refreshCommand,
    ...agentSafeNextForControlPlaneStatus({
      stale,
      refreshCommand,
      saved: read.parseOk ? {
        objectiveCompletionAuditAgentSafeNextCommandId: objectiveCompletionAudit?.agentSafeNextCommandId || '',
        objectiveCompletionAuditAgentSafeNextMayRunUnattended: Boolean(objectiveCompletionAudit?.agentSafeNextMayRunUnattended),
        objectiveCompletionAuditWriteCommand: objectiveCompletionAudit?.writeCommand || null,
        objectiveCompletionAuditWatchCommand: objectiveCompletionAudit?.watchCommand || null,
        objectiveCompletionAuditStrictCommand: objectiveCompletionAudit?.strictCommand || null,
        agentNextPreflightAvailable: Boolean(value.agentNext?.preflightAvailable),
        agentNextPreflightMayRunWithoutApproval: Boolean(value.agentNext?.preflightMayRunWithoutApproval),
        agentNextPreflightCommand: value.commands?.agentNextPreflight || null,
        agentNextProofPlanAvailable: Boolean(value.agentNext?.proofPlanAvailable),
        agentNextProofPlanMayRunWithoutApproval: Boolean(value.agentNext?.proofPlanMayRunWithoutApproval),
        agentNextProofPlanCommand: normalizeTargetProofPlanCommand(rootDir, value.commands?.agentNextProofPlan)
      } : null
    })
  };
}

export async function buildAgentControlPlaneWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputRelative = runsRelativePath(
    rootDir,
    safeRunsPath(rootDir, options.in || options.input, 'operator/agent-control-plane-latest.json', 'input path')
  );
  const outputRelative = runsRelativePath(
    rootDir,
    safeRunsPath(rootDir, options.out || options.output || inputRelative, 'operator/agent-control-plane-latest.json', 'output path')
  );
  const statusBefore = buildAgentControlPlaneStatus({
    rootDir,
    in: inputRelative,
    staleAfterSeconds: options.staleAfterSeconds,
    nowMs: options.nowMs
  });
  const runRequested = Boolean(options.run);
  const shouldRefresh = !statusBefore.exists || !statusBefore.parseOk || statusBefore.stale;
  const allowedToRun = runRequested && shouldRefresh;
  const watch = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    statusOnly: false,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    runRequested,
    executed: false,
    status: shouldRefresh ? 'stale' : 'fresh',
    inputPath: inputRelative,
    outputPath: outputRelative,
    stale: shouldRefresh,
    allowedToRun,
    blockedReason: runRequested && !allowedToRun ? 'saved-control-plane-is-fresh' : '',
    statusBefore,
    statusAfter: null,
    refreshCommand: watchRefreshCommand({
      ...options,
      in: inputRelative,
      out: outputRelative,
      staleAfterSeconds: options.staleAfterSeconds,
      task: options.task
    })
  };
  if (!allowedToRun) return watch;

  const refreshed = await buildAgentControlPlane({
    ...options,
    rootDir,
    task: options.task || statusBefore.saved?.task || 'auto'
  });
  writeAgentControlPlane(rootDir, refreshed, outputRelative);
  watch.executed = true;
  watch.status = 'refreshed';
  watch.statusAfter = buildAgentControlPlaneStatus({
    rootDir,
    in: outputRelative,
    staleAfterSeconds: options.staleAfterSeconds
  });
  return watch;
}

export function formatAgentControlPlaneCompact(status) {
  const remaining = status.readiness?.remaining || [];
  const agentBrowserMissing = status.provider?.agentBrowserMissingChecks || [];
  const lightpandaMissing = status.provider?.lightpandaMissingChecks || [];
  const playwrightMissing = status.provider?.playwrightMissingChecks || [];
  const seleniumMissing = status.provider?.seleniumMissingChecks || [];
  const objectiveCompletionAuditRemaining = status.objectiveCompletionAudit?.remaining || [];
  const operatorApprovalReasonsList = status.backendSelection?.operatorApprovalReasons || [];
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `task: ${compact(status.task)}`,
    `ready_local_auth: ${yesNo(status.readiness?.readyForLocalAuthenticatedDevelopment)}`,
    `complete_against_objective: ${yesNo(status.readiness?.completeAgainstObjective)}`,
    `remaining_count: ${status.readiness?.remainingCount ?? 0}`,
    `remaining: ${remaining.length ? remaining.join(',') : 'none'}`,
    `default_backend: ${compact(status.provider?.defaultBackend)}`,
    `default_agent_interface: ${compact(status.provider?.defaultAgentInterface)}`,
    `provider_adoption_next: ${compact(status.provider?.adoptionNext)}`,
    `agent_browser_cli_exists: ${yesNo(status.provider?.agentBrowserCliExists)}`,
    `agent_browser_chrome_for_testing_exists: ${yesNo(status.provider?.agentBrowserChromeForTestingExists)}`,
    `agent_browser_ready_for_engine_use: ${yesNo(status.provider?.agentBrowserReadyForEngineUse)}`,
    `agent_browser_missing_checks: ${agentBrowserMissing.length ? agentBrowserMissing.join(',') : 'none'}`,
    `agent_browser_next: ${compact(status.provider?.agentBrowserNext)}`,
    `agent_browser_install_requires_operator_approval: ${yesNo(status.provider?.agentBrowserInstallRequiresOperatorApproval)}`,
    `agent_browser_install_agent_may_run_unattended: ${yesNo(status.provider?.agentBrowserInstallAgentMayRunUnattended)}`,
    `agent_browser_install_mutates_runtime: ${yesNo(status.provider?.agentBrowserInstallMutatesRuntime)}`,
    `public_benchmark_proof_exists: ${yesNo(status.provider?.publicBenchmarkProofExists)}`,
    `public_benchmark_proof_ok: ${yesNo(status.provider?.publicBenchmarkProofOk)}`,
    `public_benchmark_proof_path: ${compact(status.provider?.publicBenchmarkProofPath)}`,
    `public_benchmark_fastest_measured_provider: ${compact(status.provider?.publicBenchmarkFastestMeasuredProvider)}`,
    `public_benchmark_direct_cdp_cold_ok: ${yesNo(status.provider?.publicBenchmarkDirectCdpColdOk)}`,
    `public_benchmark_direct_cdp_daemon_ok: ${yesNo(status.provider?.publicBenchmarkDirectCdpDaemonOk)}`,
    `public_benchmark_agent_browser_chrome_ok: ${yesNo(status.provider?.publicBenchmarkAgentBrowserChromeOk)}`,
    `public_benchmark_playwright_ok: ${yesNo(status.provider?.publicBenchmarkPlaywrightOk)}`,
    `public_benchmark_agent_may_run_unattended: ${yesNo(status.provider?.publicBenchmarkAgentMayRunUnattended)}`,
    `public_benchmark_starts_browser: ${yesNo(status.provider?.publicBenchmarkStartsBrowser)}`,
    `public_benchmark_reads_browser_storage: ${yesNo(status.provider?.publicBenchmarkReadsBrowserStorage)}`,
    `public_benchmark_returns_page_content: ${yesNo(status.provider?.publicBenchmarkReturnsPageContent)}`,
    `public_benchmark_command: ${compact(status.provider?.publicBenchmarkCommand)}`,
    `lightpanda_ready_for_public_benchmark: ${yesNo(status.provider?.lightpandaReadyForPublicBenchmark)}`,
    `lightpanda_missing_checks: ${lightpandaMissing.length ? lightpandaMissing.join(',') : 'none'}`,
    `lightpanda_install_requires_operator_approval: ${yesNo(status.provider?.lightpandaInstallRequiresOperatorApproval)}`,
    `lightpanda_install_agent_may_run_unattended: ${yesNo(status.provider?.lightpandaInstallAgentMayRunUnattended)}`,
    `lightpanda_install_mutates_runtime: ${yesNo(status.provider?.lightpandaInstallMutatesRuntime)}`,
    `lightpanda_benchmark_requires_operator_approval: ${yesNo(status.provider?.lightpandaBenchmarkRequiresOperatorApproval)}`,
    `lightpanda_benchmark_agent_may_run_unattended: ${yesNo(status.provider?.lightpandaBenchmarkAgentMayRunUnattended)}`,
    `lightpanda_benchmark_starts_browser: ${yesNo(status.provider?.lightpandaBenchmarkStartsBrowser)}`,
    `lightpanda_benchmark_reads_browser_storage: ${yesNo(status.provider?.lightpandaBenchmarkReadsBrowserStorage)}`,
    `lightpanda_benchmark_returns_page_content: ${yesNo(status.provider?.lightpandaBenchmarkReturnsPageContent)}`,
    `lightpanda_benchmark_command: ${compact(status.provider?.lightpandaBenchmarkCommand)}`,
    `playwright_ready_for_public_smoke: ${yesNo(status.provider?.playwrightReadyForPublicSmoke)}`,
    `playwright_ready_for_authenticated_default: ${yesNo(status.provider?.playwrightReadyForAuthenticatedDefault)}`,
    `playwright_missing_checks: ${playwrightMissing.length ? playwrightMissing.join(',') : 'none'}`,
    `playwright_storage_state_sensitive: ${yesNo(status.provider?.playwrightStorageStateSensitive)}`,
    `playwright_install_requires_operator_approval: ${yesNo(status.provider?.playwrightInstallRequiresOperatorApproval)}`,
    `playwright_install_agent_may_run_unattended: ${yesNo(status.provider?.playwrightInstallAgentMayRunUnattended)}`,
    `playwright_install_mutates_runtime: ${yesNo(status.provider?.playwrightInstallMutatesRuntime)}`,
    `playwright_smoke_requires_operator_approval: ${yesNo(status.provider?.playwrightSmokeRequiresOperatorApproval)}`,
    `playwright_smoke_agent_may_run_unattended: ${yesNo(status.provider?.playwrightSmokeAgentMayRunUnattended)}`,
    `playwright_smoke_starts_browser: ${yesNo(status.provider?.playwrightSmokeStartsBrowser)}`,
    `playwright_smoke_reads_browser_storage: ${yesNo(status.provider?.playwrightSmokeReadsBrowserStorage)}`,
    `playwright_smoke_returns_page_content: ${yesNo(status.provider?.playwrightSmokeReturnsPageContent)}`,
    `playwright_smoke_command: ${compact(status.provider?.playwrightSmokeCommand)}`,
    `selenium_ready_for_local_smoke: ${yesNo(status.provider?.seleniumReadyForLocalSmoke)}`,
    `selenium_missing_checks: ${seleniumMissing.length ? seleniumMissing.join(',') : 'none'}`,
    `selenium_install_requires_operator_approval: ${yesNo(status.provider?.seleniumInstallRequiresOperatorApproval)}`,
    `selenium_install_agent_may_run_unattended: ${yesNo(status.provider?.seleniumInstallAgentMayRunUnattended)}`,
    `selenium_install_mutates_runtime: ${yesNo(status.provider?.seleniumInstallMutatesRuntime)}`,
    `selenium_smoke_requires_operator_approval: ${yesNo(status.provider?.seleniumSmokeRequiresOperatorApproval)}`,
    `selenium_smoke_agent_may_run_unattended: ${yesNo(status.provider?.seleniumSmokeAgentMayRunUnattended)}`,
    `selenium_smoke_starts_browser: ${yesNo(status.provider?.seleniumSmokeStartsBrowser)}`,
    `selenium_smoke_command: ${compact(status.provider?.seleniumSmokeCommand)}`,
    `selected_backend: ${compact(status.backendSelection?.backend)}`,
    `selected_lane: ${compact(status.backendSelection?.lane)}`,
    `selected_agent_interface: ${compact(status.backendSelection?.agentInterface)}`,
    `selected_backend_available: ${yesNo(status.backendSelection?.backendAvailable)}`,
    `selected_can_run_background: ${yesNo(status.backendSelection?.canRunInBackground)}`,
    `execution_allowed: ${yesNo(status.backendSelection?.executionAllowed)}`,
    `agent_unattended_allowed: ${yesNo(status.backendSelection?.agentUnattendedAllowed)}`,
    `operator_approval_required: ${yesNo(status.backendSelection?.operatorApprovalRequired)}`,
    `operator_approval_reasons: ${operatorApprovalReasonsList.length ? operatorApprovalReasonsList.join(',') : 'none'}`,
    `blocked_reason: ${compact(status.backendSelection?.blockedReason)}`,
    `operator_input: ${yesNo(status.backendSelection?.operatorInput)}`,
    `capture_blocked: ${yesNo(status.backendSelection?.captureBlocked)}`,
    `command_opens_browser: ${yesNo(status.backendSelection?.commandOpensBrowser)}`,
    `approval_command_opens_browser: ${yesNo(status.backendSelection?.approvalCommandOpensBrowser)}`,
    `agent_task_recommended_command_id: ${compact(status.agentTask?.recommendedCommandId)}`,
    `agent_task_status: ${compact(status.agentTask?.status)}`,
    `agent_task_execution_allowed: ${yesNo(status.agentTask?.executionAllowed)}`,
    `agent_task_may_run_unattended: ${yesNo(status.agentTask?.executionAllowed)}`,
    `agent_task_blocked_reason: ${compact(status.agentTask?.blockedReason)}`,
    `agent_task_auth_preflight_checked: ${yesNo(status.agentTask?.authPreflightChecked)}`,
    `objective_primary: ${compact(status.objectiveNext?.primary)}`,
    `objective_requirement: ${compact(status.objectiveNext?.requirement)}`,
    `objective_status: ${compact(status.objectiveNext?.status)}`,
    `objective_operator_input: ${yesNo(status.objectiveNext?.needsOperatorInput)}`,
    `objective_capture_blocked: ${yesNo(status.objectiveNext?.captureBlocked)}`,
    `objective_primary_opens_browser: ${yesNo(status.objectiveNext?.primaryOpensBrowser)}`,
    `objective_primary_starts_capture: ${yesNo(status.objectiveNext?.primaryStartsCapture)}`,
    `objective_primary_requires_operator_approval: ${yesNo(status.objectiveNext?.primaryRequiresOperatorApproval)}`,
    `objective_agent_must_not_run_primary_unattended: ${yesNo(status.objectiveNext?.agentMustNotRunPrimaryUnattended)}`,
    `human_action: ${compact(status.objectiveNext?.humanAction)}`,
    `automation_blocker: ${compact(status.objectiveNext?.automationBlocker)}`,
    `proof_pipeline_status: ${compact(status.proofPipeline?.status)}`,
    `proof_pipeline_recommended_now: ${compact(status.proofPipeline?.recommendedNow)}`,
    `proof_pipeline_capture_allowed_now: ${yesNo(status.proofPipeline?.proofCaptureAllowedNow)}`,
    `proof_pipeline_next_artifact_action: ${compact(status.proofPipeline?.nextArtifactAction)}`,
    `proof_pipeline_next_artifact_blocker: ${compact(status.proofPipeline?.nextArtifactBlocker)}`,
    `proof_pipeline_monitor_auth_available: ${yesNo(status.proofPipeline?.monitorAuthAvailable)}`,
    `proof_pipeline_reopen_login_available: ${yesNo(status.proofPipeline?.reopenLoginAvailable)}`,
    `proof_pipeline_reopen_login_opens_browser: ${yesNo(status.proofPipeline?.reopenLoginOpensBrowser)}`,
    `proof_pipeline_reopen_login_starts_capture: ${yesNo(status.proofPipeline?.reopenLoginStartsCapture)}`,
    `proof_pipeline_reopen_login_requires_operator_approval: ${yesNo(status.proofPipeline?.reopenLoginRequiresOperatorApproval)}`,
    `proof_pipeline_reopen_login_agent_must_not_run_unattended: ${yesNo(status.proofPipeline?.reopenLoginAgentMustNotRunUnattended)}`,
    `proof_pipeline_background_monitor_start_available: ${yesNo(status.proofPipeline?.backgroundMonitorStartAvailable)}`,
    `proof_pipeline_background_capture_start_available: ${yesNo(status.proofPipeline?.backgroundCaptureStartAvailable)}`,
    `proof_pipeline_background_commands_operator_gated: ${yesNo(status.proofPipeline?.backgroundCommandsOperatorGated)}`,
    `objective_completion_audit_exists: ${yesNo(status.objectiveCompletionAudit?.exists)}`,
    `objective_completion_audit_parse_ok: ${yesNo(status.objectiveCompletionAudit?.parseOk)}`,
    `objective_completion_audit_stale: ${yesNo(status.objectiveCompletionAudit?.stale)}`,
    `objective_completion_audit_saved_status: ${compact(status.objectiveCompletionAudit?.savedStatus)}`,
    `objective_completion_audit_saved_complete: ${yesNo(status.objectiveCompletionAudit?.savedComplete)}`,
    `objective_completion_audit_remaining_count: ${status.objectiveCompletionAudit?.remainingCount ?? 0}`,
    `objective_completion_audit_remaining: ${objectiveCompletionAuditRemaining.length ? objectiveCompletionAuditRemaining.join(',') : 'none'}`,
    `objective_completion_audit_refresh_needed: ${yesNo(status.objectiveCompletionAudit?.refreshNeeded)}`,
    `objective_completion_audit_agent_safe_next_command_id: ${compact(status.objectiveCompletionAudit?.agentSafeNextCommandId)}`,
    `objective_completion_audit_agent_safe_next_may_run_unattended: ${yesNo(status.objectiveCompletionAudit?.agentSafeNextMayRunUnattended)}`,
    `objective_completion_audit_agent_safe_next_opens_browser: ${yesNo(status.objectiveCompletionAudit?.agentSafeNextOpensBrowser)}`,
    `objective_completion_audit_agent_safe_next_starts_capture: ${yesNo(status.objectiveCompletionAudit?.agentSafeNextStartsCapture)}`,
    `objective_completion_audit_agent_safe_next_reads_browser_storage: ${yesNo(status.objectiveCompletionAudit?.agentSafeNextReadsBrowserStorage)}`,
    `objective_completion_audit_agent_safe_next_returns_page_content: ${yesNo(status.objectiveCompletionAudit?.agentSafeNextReturnsPageContent)}`,
    `target_approval_pack_exists: ${yesNo(status.targetApproval?.approvalPackExists)}`,
    `target_approval_pack_parse_ok: ${yesNo(status.targetApproval?.approvalPackParseOk)}`,
    `target_approval_candidate: ${compact(status.targetApproval?.selectedCandidate)}`,
    `target_approval_target_pack_exists: ${yesNo(status.targetApproval?.targetPackExists)}`,
    `target_approval_next: ${compact(status.targetApproval?.targetNext)}`,
    `target_approval_human_action: ${compact(status.targetApproval?.humanAction)}`,
    `target_approval_automation_blocker: ${compact(status.targetApproval?.automationBlocker)}`,
    `target_approval_capture_blocked: ${yesNo(status.targetApproval?.captureBlocked)}`,
    `target_approval_resume_status: ${compact(status.targetApproval?.resumeStatus)}`,
    `target_approval_resume_ready_to_run: ${yesNo(status.targetApproval?.resumeReadyToRun)}`,
    `target_approval_resume_planned_opens_browser: ${yesNo(status.targetApproval?.resumePlannedCommandOpensBrowser)}`,
    `target_approval_resume_planned_starts_capture: ${yesNo(status.targetApproval?.resumePlannedCommandStartsCapture)}`,
    `secret_run_command_id: ${compact(status.secretRun?.commandId)}`,
    `secret_run_target_dir: ${compact(status.secretRun?.targetDir)}`,
    `secret_run_op_cli_available: ${yesNo(status.secretRun?.opAvailable)}`,
    `secret_run_selected_candidate: ${compact(status.secretRun?.selectedCandidate)}`,
    `secret_run_selected_mode: ${compact(status.secretRun?.selectedMode)}`,
    `secret_run_headless: ${yesNo(status.secretRun?.headless)}`,
    `secret_run_ready_to_run_now: ${yesNo(status.secretRun?.readyToRunNow)}`,
    `secret_run_setup_required: ${status.secretRun?.setupRequired?.length ? status.secretRun.setupRequired.join(',') : 'none'}`,
    `secret_run_recommended_headless_mode: ${compact(status.secretRun?.recommendedHeadlessMode)}`,
    `secret_run_headless_ready: ${yesNo(status.secretRun?.headlessReady)}`,
    `secret_run_headless_config_available: ${yesNo(status.secretRun?.headlessConfigAvailable)}`,
    `secret_run_service_account_env_file_usable: ${yesNo(status.secretRun?.serviceAccountEnvFileUsable)}`,
    `secret_run_desktop_integration_likely: ${yesNo(status.secretRun?.desktopIntegrationLikely)}`,
    `secret_run_wrapped_opens_browser: ${yesNo(status.secretRun?.runCommandSafety?.opensBrowser)}`,
    `secret_run_wrapped_starts_capture: ${yesNo(status.secretRun?.runCommandSafety?.startsCapture)}`,
    `secret_run_wrapped_starts_background: ${yesNo(status.secretRun?.runCommandSafety?.startsBackground)}`,
    `secret_run_wrapped_requires_operator_approval: ${yesNo(status.secretRun?.runCommandSafety?.requiresOperatorApproval)}`,
    `secret_run_wrapped_agent_may_run_unattended: ${yesNo(status.secretRun?.runCommandSafety?.agentMayRunUnattended)}`,
    `agent_next_action: ${compact(status.agentNext?.action)}`,
    `agent_next_can_run_without_approval: ${yesNo(status.agentNext?.canRunWithoutApproval)}`,
    `agent_next_command_id: ${compact(status.agentNext?.commandId)}`,
    `agent_next_preflight_available: ${yesNo(status.agentNext?.preflightAvailable)}`,
    `agent_next_preflight_action: ${compact(status.agentNext?.preflightAction)}`,
    `agent_next_preflight_may_run_without_approval: ${yesNo(status.agentNext?.preflightMayRunWithoutApproval)}`,
    `agent_next_proof_plan_available: ${yesNo(status.agentNext?.proofPlanAvailable)}`,
    `agent_next_proof_plan_action: ${compact(status.agentNext?.proofPlanAction)}`,
    `agent_next_proof_plan_may_run_without_approval: ${yesNo(status.agentNext?.proofPlanMayRunWithoutApproval)}`,
    `agent_next_operator_approval_required: ${yesNo(status.agentNext?.operatorApprovalRequired)}`,
    `agent_next_operator_approval_preflight_opens_browser: ${yesNo(status.agentNext?.operatorApprovalPreflightOpensBrowser)}`,
    `agent_next_operator_approval_preflight_starts_capture: ${yesNo(status.agentNext?.operatorApprovalPreflightStartsCapture)}`,
    `agent_next_operator_approval_preflight_reads_browser_storage: ${yesNo(status.agentNext?.operatorApprovalPreflightReadsBrowserStorage)}`,
    `agent_next_operator_approval_preflight_returns_page_content: ${yesNo(status.agentNext?.operatorApprovalPreflightReturnsPageContent)}`,
    `agent_next_operator_approval_preflight_may_run_unattended: ${yesNo(status.agentNext?.operatorApprovalPreflightMayRunUnattended)}`,
    `agent_next_operator_approval_proof_plan_opens_browser: ${yesNo(status.agentNext?.operatorApprovalProofPlanOpensBrowser)}`,
    `agent_next_operator_approval_proof_plan_starts_capture: ${yesNo(status.agentNext?.operatorApprovalProofPlanStartsCapture)}`,
    `agent_next_operator_approval_proof_plan_reads_browser_storage: ${yesNo(status.agentNext?.operatorApprovalProofPlanReadsBrowserStorage)}`,
    `agent_next_operator_approval_proof_plan_returns_page_content: ${yesNo(status.agentNext?.operatorApprovalProofPlanReturnsPageContent)}`,
    `agent_next_operator_approval_proof_plan_may_run_unattended: ${yesNo(status.agentNext?.operatorApprovalProofPlanMayRunUnattended)}`,
    `agent_next_operator_approval_opens_browser: ${yesNo(status.agentNext?.operatorApprovalOpensBrowser)}`,
    `agent_next_operator_approval_starts_capture: ${yesNo(status.agentNext?.operatorApprovalStartsCapture)}`,
    `agent_next_operator_approval_agent_may_run_unattended: ${yesNo(status.agentNext?.operatorApprovalAgentMayRunUnattended)}`,
    `agent_next_opens_browser_now: ${yesNo(status.agentNext?.opensBrowserNow)}`,
    `agent_next_starts_capture_now: ${yesNo(status.agentNext?.startsCaptureNow)}`
  ];
  if (shell(status.commands?.self)) lines.push(`self_command: ${shell(status.commands.self)}`);
  if (status.agentTask?.authPreflightChecked) {
    lines.push(`agent_task_auth_preflight_parsed: ${yesNo(status.agentTask.authPreflightParsed)}`);
    if (status.agentTask.authPreflightOk !== null && status.agentTask.authPreflightOk !== undefined) {
      lines.push(`agent_task_auth_preflight_ok: ${yesNo(status.agentTask.authPreflightOk)}`);
    }
    if (status.agentTask.authPreflightLoginLike !== null && status.agentTask.authPreflightLoginLike !== undefined) {
      lines.push(`agent_task_auth_preflight_login_like: ${yesNo(status.agentTask.authPreflightLoginLike)}`);
    }
    if (status.agentTask.authPreflightSameOrigin !== null && status.agentTask.authPreflightSameOrigin !== undefined) {
      lines.push(`agent_task_auth_preflight_same_origin: ${yesNo(status.agentTask.authPreflightSameOrigin)}`);
    }
    if (status.agentTask.authPreflightNextAction) {
      lines.push(`agent_task_auth_preflight_next_action: ${compact(status.agentTask.authPreflightNextAction)}`);
    }
  }
  if (shell(status.commands?.backendSelector)) lines.push(`backend_selector_command: ${shell(status.commands.backendSelector)}`);
  if (shell(status.commands?.workflow)) lines.push(`workflow_command: ${shell(status.commands.workflow)}`);
  if (shell(status.commands?.safeRun)) lines.push(`agent_task_safe_run_command: ${shell(status.commands.safeRun)}`);
  if (shell(status.commands?.selectedDirect)) lines.push(`selected_direct_command: ${shell(status.commands.selectedDirect)}`);
  if (shell(status.commands?.regularChromeStatus)) lines.push(`regular_chrome_status_command: ${shell(status.commands.regularChromeStatus)}`);
  if (shell(status.commands?.chromeExtensionBackendCheckPlan)) lines.push(`chrome_extension_backend_check_plan_command: ${shell(status.commands.chromeExtensionBackendCheckPlan)}`);
  if (shell(status.commands?.chromeExtensionClaimPlan)) lines.push(`chrome_extension_claim_plan_command: ${shell(status.commands.chromeExtensionClaimPlan)}`);
  if (shell(status.commands?.providerDoctorStatus)) lines.push(`provider_doctor_status_command: ${shell(status.commands.providerDoctorStatus)}`);
  if (shell(status.commands?.readiness)) lines.push(`readiness_command: ${shell(status.commands.readiness)}`);
  if (shell(status.commands?.objectiveNext)) lines.push(`objective_next_command: ${shell(status.commands.objectiveNext)}`);
  if (Array.isArray(status.objectiveNext?.manualCommandCandidates) && status.objectiveNext.manualCommandCandidates.length) {
    lines.push(`objective_manual_candidates: ${status.objectiveNext.manualCommandCandidates.map((item) => item.id).join(',')}`);
    for (const candidate of status.objectiveNext.manualCommandCandidates) {
      const key = compactKey(candidate.id);
      lines.push(`objective_manual_${key}_opens_browser: ${yesNo(candidate.opensBrowser)}`);
      lines.push(`objective_manual_${key}_starts_capture: ${yesNo(candidate.startsCapture)}`);
      lines.push(`objective_manual_${key}_requires_operator_approval: ${yesNo(candidate.requiresOperatorApproval)}`);
      lines.push(`objective_manual_${key}_agent_must_not_run_unattended: ${yesNo(candidate.agentMustNotRunUnattended)}`);
      if (shell(candidate.command)) lines.push(`objective_manual_${key}_command: ${shell(candidate.command)}`);
    }
  }
  if (shell(status.commands?.objectiveProofPipeline)) lines.push(`objective_proof_pipeline_command: ${shell(status.commands.objectiveProofPipeline)}`);
  if (shell(status.commands?.proofPipelineMonitorAuth)) lines.push(`proof_pipeline_monitor_auth_command: ${shell(status.commands.proofPipelineMonitorAuth)}`);
  if (shell(status.commands?.proofPipelineReopenLogin)) lines.push(`proof_pipeline_reopen_login_command: ${shell(status.commands.proofPipelineReopenLogin)}`);
  if (shell(status.commands?.proofPipelineBackgroundStatus)) lines.push(`proof_pipeline_background_status_command: ${shell(status.commands.proofPipelineBackgroundStatus)}`);
  if (shell(status.commands?.proofPipelineBackgroundMonitorStart)) lines.push(`proof_pipeline_background_monitor_start_command: ${shell(status.commands.proofPipelineBackgroundMonitorStart)}`);
  if (shell(status.commands?.proofPipelineBackgroundCaptureStart)) lines.push(`proof_pipeline_background_capture_start_command: ${shell(status.commands.proofPipelineBackgroundCaptureStart)}`);
  if (shell(status.commands?.targetApprovalStatus)) lines.push(`target_approval_status_command: ${shell(status.commands.targetApprovalStatus)}`);
  if (shell(status.commands?.targetApprovalPreflight)) lines.push(`target_approval_preflight_command: ${shell(status.commands.targetApprovalPreflight)}`);
  if (shell(status.commands?.targetApprovalResumePlan)) lines.push(`target_approval_resume_plan_command: ${shell(status.commands.targetApprovalResumePlan)}`);
  if (shell(status.commands?.targetApprovalResumeRun)) lines.push(`target_approval_resume_run_command: ${shell(status.commands.targetApprovalResumeRun)}`);
  if (shell(status.commands?.targetApprovalCompletionProofBundleWithAudit)) lines.push(`target_approval_completion_proof_bundle_with_audit_command: ${shell(status.commands.targetApprovalCompletionProofBundleWithAudit)}`);
  if (shell(status.commands?.targetApprovalAgentProofCloseoutWrite)) lines.push(`target_approval_agent_proof_closeout_write_command: ${shell(status.commands.targetApprovalAgentProofCloseoutWrite)}`);
  if (shell(status.commands?.targetApprovalAgentProofCloseoutStatus)) lines.push(`target_approval_agent_proof_closeout_status_command: ${shell(status.commands.targetApprovalAgentProofCloseoutStatus)}`);
  if (shell(status.commands?.targetApprovalObjectiveCompletionStrict)) lines.push(`target_approval_objective_completion_strict_command: ${shell(status.commands.targetApprovalObjectiveCompletionStrict)}`);
  if (shell(status.commands?.secretRunSelect)) {
    lines.push('secret_run_select_opens_browser: no');
    lines.push('secret_run_select_starts_capture: no');
    lines.push('secret_run_select_starts_background: no');
    lines.push('secret_run_select_requires_operator_approval: no');
    lines.push('secret_run_select_agent_may_run_unattended: yes');
    lines.push(`secret_run_select_command: ${shell(status.commands.secretRunSelect)}`);
  }
  if (shell(status.commands?.secretRunWrapped)) lines.push(`secret_run_wrapped_command: ${shell(status.commands.secretRunWrapped)}`);
  if (shell(status.commands?.secretRunSetup)) lines.push(`secret_run_setup_command: ${shell(status.commands.secretRunSetup)}`);
  if (shell(status.commands?.agentNext)) lines.push(`agent_next_command: ${shell(status.commands.agentNext)}`);
  if (shell(status.commands?.agentNextPreflight)) lines.push(`agent_next_preflight_command: ${shell(status.commands.agentNextPreflight)}`);
  if (shell(status.commands?.agentNextProofPlan)) lines.push(`agent_next_proof_plan_command: ${shell(status.commands.agentNextProofPlan)}`);
  if (shell(status.commands?.agentNextOperatorApprovalPlan)) lines.push(`agent_next_operator_approval_plan_command: ${shell(status.commands.agentNextOperatorApprovalPlan)}`);
  if (shell(status.commands?.agentNextOperatorApproval)) lines.push(`agent_next_operator_approval_command: ${shell(status.commands.agentNextOperatorApproval)}`);
  if (shell(status.commands?.agentProofChecklist)) lines.push(`agent_proof_checklist_command: ${shell(status.commands.agentProofChecklist)}`);
  if (shell(status.commands?.agentProofChecklistWrite)) lines.push(`agent_proof_checklist_write_command: ${shell(status.commands.agentProofChecklistWrite)}`);
  if (shell(status.commands?.agentProofChecklistStatus)) lines.push(`agent_proof_checklist_status_command: ${shell(status.commands.agentProofChecklistStatus)}`);
  if (shell(status.commands?.completionProofBundle)) lines.push(`completion_proof_bundle_command: ${shell(status.commands.completionProofBundle)}`);
  if (shell(status.commands?.completionProofBundleWrite)) lines.push(`completion_proof_bundle_write_command: ${shell(status.commands.completionProofBundleWrite)}`);
  if (shell(status.commands?.completionProofBundleStatus)) lines.push(`completion_proof_bundle_status_command: ${shell(status.commands.completionProofBundleStatus)}`);
  if (shell(status.commands?.objectiveCompletionAuditWrite)) lines.push(`objective_completion_audit_write_command: ${shell(status.commands.objectiveCompletionAuditWrite)}`);
  if (shell(status.commands?.objectiveCompletionAuditStatus)) lines.push(`objective_completion_audit_status_command: ${shell(status.commands.objectiveCompletionAuditStatus)}`);
  if (shell(status.commands?.objectiveCompletionAuditWatch)) lines.push(`objective_completion_audit_watch_command: ${shell(status.commands.objectiveCompletionAuditWatch)}`);
  if (shell(status.commands?.objectiveCompletionAuditStrict)) lines.push(`objective_completion_audit_strict_command: ${shell(status.commands.objectiveCompletionAuditStrict)}`);
  if (shell(status.commands?.agentProofCloseout)) lines.push(`agent_proof_closeout_command: ${shell(status.commands.agentProofCloseout)}`);
  if (shell(status.commands?.agentProofCloseoutWrite)) lines.push(`agent_proof_closeout_write_command: ${shell(status.commands.agentProofCloseoutWrite)}`);
  if (shell(status.commands?.agentProofCloseoutStatus)) lines.push(`agent_proof_closeout_status_command: ${shell(status.commands.agentProofCloseoutStatus)}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentControlPlaneStatusCompact(status) {
  const remaining = status.saved?.remaining || [];
  const objectiveCompletionAuditRemaining = status.saved?.objectiveCompletionAuditRemaining || [];
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `agent_safe_next_command_id: ${compact(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `path: ${compact(status.path)}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds ?? 'unknown'}`,
    `task: ${compact(status.saved?.task)}`,
    `ready_local_auth: ${yesNo(status.saved?.readyForLocalAuthenticatedDevelopment)}`,
    `complete_against_objective: ${yesNo(status.saved?.completeAgainstObjective)}`,
    `remaining: ${remaining.length ? remaining.join(',') : 'none'}`,
    `default_backend: ${compact(status.saved?.defaultBackend)}`,
    `selected_backend: ${compact(status.saved?.selectedBackend)}`,
    `selected_lane: ${compact(status.saved?.selectedLane)}`,
    `execution_allowed: ${yesNo(status.saved?.executionAllowed)}`,
    `blocked_reason: ${compact(status.saved?.blockedReason)}`,
    `agent_task_recommended_command_id: ${compact(status.saved?.agentTaskRecommendedCommandId)}`,
    `agent_task_status: ${compact(status.saved?.agentTaskStatus)}`,
    `agent_task_execution_allowed: ${yesNo(status.saved?.agentTaskExecutionAllowed)}`,
    `agent_task_may_run_unattended: ${yesNo(status.saved?.agentTaskExecutionAllowed)}`,
    `agent_task_blocked_reason: ${compact(status.saved?.agentTaskBlockedReason)}`,
    `agent_task_auth_preflight_checked: ${yesNo(status.saved?.agentTaskAuthPreflightChecked)}`,
    `objective_primary: ${compact(status.saved?.objectivePrimary)}`,
    `proof_pipeline_recommended_now: ${compact(status.saved?.proofPipelineRecommendedNow)}`,
    `objective_completion_audit_exists: ${yesNo(status.saved?.objectiveCompletionAuditExists)}`,
    `objective_completion_audit_parse_ok: ${yesNo(status.saved?.objectiveCompletionAuditParseOk)}`,
    `objective_completion_audit_stale: ${yesNo(status.saved?.objectiveCompletionAuditStale)}`,
    `objective_completion_audit_saved_status: ${compact(status.saved?.objectiveCompletionAuditSavedStatus)}`,
    `objective_completion_audit_saved_complete: ${yesNo(status.saved?.objectiveCompletionAuditSavedComplete)}`,
    `objective_completion_audit_remaining_count: ${status.saved?.objectiveCompletionAuditRemainingCount ?? 0}`,
    `objective_completion_audit_remaining: ${objectiveCompletionAuditRemaining.length ? objectiveCompletionAuditRemaining.join(',') : 'none'}`,
    `objective_completion_audit_refresh_needed: ${yesNo(status.saved?.objectiveCompletionAuditRefreshNeeded)}`,
    `objective_completion_audit_agent_safe_next_command_id: ${compact(status.saved?.objectiveCompletionAuditAgentSafeNextCommandId)}`,
    `objective_completion_audit_agent_safe_next_may_run_unattended: ${yesNo(status.saved?.objectiveCompletionAuditAgentSafeNextMayRunUnattended)}`,
    `objective_completion_audit_agent_safe_next_opens_browser: ${yesNo(status.saved?.objectiveCompletionAuditAgentSafeNextOpensBrowser)}`,
    `objective_completion_audit_agent_safe_next_starts_capture: ${yesNo(status.saved?.objectiveCompletionAuditAgentSafeNextStartsCapture)}`,
    `objective_completion_audit_agent_safe_next_reads_browser_storage: ${yesNo(status.saved?.objectiveCompletionAuditAgentSafeNextReadsBrowserStorage)}`,
    `objective_completion_audit_agent_safe_next_returns_page_content: ${yesNo(status.saved?.objectiveCompletionAuditAgentSafeNextReturnsPageContent)}`,
    `agent_next_action: ${compact(status.saved?.agentNextAction)}`,
    `agent_next_can_run_without_approval: ${yesNo(status.saved?.agentNextCanRunWithoutApproval)}`,
    `agent_next_command_id: ${compact(status.saved?.agentNextCommandId)}`,
    `agent_next_preflight_available: ${yesNo(status.saved?.agentNextPreflightAvailable)}`,
    `agent_next_preflight_may_run_without_approval: ${yesNo(status.saved?.agentNextPreflightMayRunWithoutApproval)}`,
    `agent_next_proof_plan_available: ${yesNo(status.saved?.agentNextProofPlanAvailable)}`,
    `agent_next_proof_plan_may_run_without_approval: ${yesNo(status.saved?.agentNextProofPlanMayRunWithoutApproval)}`,
    `agent_next_operator_approval_required: ${yesNo(status.saved?.agentNextOperatorApprovalRequired)}`,
    `agent_next_operator_approval_opens_browser: ${yesNo(status.saved?.agentNextOperatorApprovalOpensBrowser)}`,
    `agent_next_operator_approval_starts_capture: ${yesNo(status.saved?.agentNextOperatorApprovalStartsCapture)}`,
    `agent_next_operator_approval_agent_may_run_unattended: ${yesNo(status.saved?.agentNextOperatorApprovalAgentMayRunUnattended)}`,
    `target_approval_candidate: ${compact(status.saved?.targetApprovalCandidate)}`,
    `target_approval_resume_status: ${compact(status.saved?.targetApprovalResumeStatus)}`,
    `target_approval_resume_ready_to_run: ${yesNo(status.saved?.targetApprovalResumeReadyToRun)}`,
    `target_approval_resume_planned_opens_browser: ${yesNo(status.saved?.targetApprovalResumePlannedOpensBrowser)}`,
    `target_approval_resume_planned_starts_capture: ${yesNo(status.saved?.targetApprovalResumePlannedStartsCapture)}`,
    `target_approval_resume_requires_operator_approval: ${yesNo(status.saved?.targetApprovalResumeRequiresOperatorApproval)}`,
    `target_approval_resume_agent_may_run_unattended: ${yesNo(status.saved?.targetApprovalResumeAgentMayRunUnattended)}`,
    `secret_run_command_id: ${compact(status.saved?.secretRunCommandId)}`,
    `secret_run_target_dir: ${compact(status.saved?.secretRunTargetDir)}`,
    `secret_run_selected_candidate: ${compact(status.saved?.secretRunSelectedCandidate)}`,
    `secret_run_selected_mode: ${compact(status.saved?.secretRunSelectedMode)}`,
    `secret_run_headless: ${yesNo(status.saved?.secretRunHeadless)}`,
    `secret_run_ready_to_run_now: ${yesNo(status.saved?.secretRunReadyToRunNow)}`,
    `secret_run_setup_required: ${status.saved?.secretRunSetupRequired?.length ? status.saved.secretRunSetupRequired.join(',') : 'none'}`,
    `secret_run_wrapped_opens_browser: ${yesNo(status.saved?.secretRunWrappedOpensBrowser)}`,
    `secret_run_wrapped_starts_capture: ${yesNo(status.saved?.secretRunWrappedStartsCapture)}`,
    `secret_run_wrapped_starts_background: ${yesNo(status.saved?.secretRunWrappedStartsBackground)}`,
    `secret_run_wrapped_requires_operator_approval: ${yesNo(status.saved?.secretRunWrappedRequiresOperatorApproval)}`,
    `secret_run_wrapped_agent_may_run_unattended: ${yesNo(status.saved?.secretRunWrappedAgentMayRunUnattended)}`
  ];
  if (status.parseError) lines.push(`parse_error: ${compact(status.parseError)}`);
  if (status.saved?.agentTaskAuthPreflightChecked) {
    lines.push(`agent_task_auth_preflight_parsed: ${yesNo(status.saved.agentTaskAuthPreflightParsed)}`);
    if (status.saved.agentTaskAuthPreflightOk !== null && status.saved.agentTaskAuthPreflightOk !== undefined) {
      lines.push(`agent_task_auth_preflight_ok: ${yesNo(status.saved.agentTaskAuthPreflightOk)}`);
    }
    if (status.saved.agentTaskAuthPreflightLoginLike !== null && status.saved.agentTaskAuthPreflightLoginLike !== undefined) {
      lines.push(`agent_task_auth_preflight_login_like: ${yesNo(status.saved.agentTaskAuthPreflightLoginLike)}`);
    }
    if (status.saved.agentTaskAuthPreflightSameOrigin !== null && status.saved.agentTaskAuthPreflightSameOrigin !== undefined) {
      lines.push(`agent_task_auth_preflight_same_origin: ${yesNo(status.saved.agentTaskAuthPreflightSameOrigin)}`);
    }
    if (status.saved.agentTaskAuthPreflightNextAction) {
      lines.push(`agent_task_auth_preflight_next_action: ${compact(status.saved.agentTaskAuthPreflightNextAction)}`);
    }
  }
  if (shell(status.saved?.agentNextCommand)) lines.push(`agent_next_command: ${shell(status.saved.agentNextCommand)}`);
  if (shell(status.saved?.agentNextPreflightCommand)) lines.push(`agent_next_preflight_command: ${shell(status.saved.agentNextPreflightCommand)}`);
  if (shell(status.saved?.agentNextProofPlanCommand)) lines.push(`agent_next_proof_plan_command: ${shell(status.saved.agentNextProofPlanCommand)}`);
  if (shell(status.saved?.agentNextOperatorApprovalPlanCommand)) lines.push(`agent_next_operator_approval_plan_command: ${shell(status.saved.agentNextOperatorApprovalPlanCommand)}`);
  if (shell(status.saved?.agentNextOperatorApprovalCommand)) lines.push(`agent_next_operator_approval_command: ${shell(status.saved.agentNextOperatorApprovalCommand)}`);
  if (shell(status.saved?.objectiveCompletionAuditWriteCommand)) lines.push(`objective_completion_audit_write_command: ${shell(status.saved.objectiveCompletionAuditWriteCommand)}`);
  if (shell(status.saved?.objectiveCompletionAuditStatusCommand)) lines.push(`objective_completion_audit_status_command: ${shell(status.saved.objectiveCompletionAuditStatusCommand)}`);
  if (shell(status.saved?.objectiveCompletionAuditWatchCommand)) lines.push(`objective_completion_audit_watch_command: ${shell(status.saved.objectiveCompletionAuditWatchCommand)}`);
  if (shell(status.saved?.objectiveCompletionAuditStrictCommand)) lines.push(`objective_completion_audit_strict_command: ${shell(status.saved.objectiveCompletionAuditStrictCommand)}`);
  if (shell(status.saved?.targetApprovalResumeRunCommand)) lines.push(`target_approval_resume_run_command: ${shell(status.saved.targetApprovalResumeRunCommand)}`);
  if (shell(status.saved?.targetApprovalCompletionProofBundleWithAuditCommand)) lines.push(`target_approval_completion_proof_bundle_with_audit_command: ${shell(status.saved.targetApprovalCompletionProofBundleWithAuditCommand)}`);
  if (shell(status.saved?.targetApprovalAgentProofCloseoutWriteCommand)) lines.push(`target_approval_agent_proof_closeout_write_command: ${shell(status.saved.targetApprovalAgentProofCloseoutWriteCommand)}`);
  if (shell(status.saved?.targetApprovalAgentProofCloseoutStatusCommand)) lines.push(`target_approval_agent_proof_closeout_status_command: ${shell(status.saved.targetApprovalAgentProofCloseoutStatusCommand)}`);
  if (shell(status.saved?.targetApprovalObjectiveCompletionStrictCommand)) lines.push(`target_approval_objective_completion_strict_command: ${shell(status.saved.targetApprovalObjectiveCompletionStrictCommand)}`);
  if (shell(status.saved?.secretRunSelectCommand)) {
    lines.push('secret_run_select_opens_browser: no');
    lines.push('secret_run_select_starts_capture: no');
    lines.push('secret_run_select_starts_background: no');
    lines.push('secret_run_select_requires_operator_approval: no');
    lines.push('secret_run_select_agent_may_run_unattended: yes');
    lines.push(`secret_run_select_command: ${shell(status.saved.secretRunSelectCommand)}`);
  }
  if (shell(status.saved?.secretRunWrappedCommand)) lines.push(`secret_run_wrapped_command: ${shell(status.saved.secretRunWrappedCommand)}`);
  if (shell(status.saved?.secretRunSetupCommand)) lines.push(`secret_run_setup_command: ${shell(status.saved.secretRunSetupCommand)}`);
  if (shell(status.agentSafeNextCommand)) lines.push(`agent_safe_next_command: ${shell(status.agentSafeNextCommand)}`);
  if (shell(status.refreshCommand)) lines.push(`refresh_command: ${shell(status.refreshCommand)}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentControlPlaneWatchCompact(watch) {
  const lines = [
    `safe_mode: ${yesNo(watch.safeMode)}`,
    `status_only: ${yesNo(watch.statusOnly)}`,
    `destructive_actions: ${yesNo(watch.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(watch.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(watch.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(watch.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(watch.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(watch.pageContentReturned)}`,
    `run_requested: ${yesNo(watch.runRequested)}`,
    `executed: ${yesNo(watch.executed)}`,
    `status: ${compact(watch.status)}`,
    `input_path: ${compact(watch.inputPath)}`,
    `output_path: ${compact(watch.outputPath)}`,
    `stale: ${yesNo(watch.stale)}`,
    `allowed_to_run: ${yesNo(watch.allowedToRun)}`,
    `blocked_reason: ${compact(watch.blockedReason)}`,
    `before_exists: ${yesNo(watch.statusBefore?.exists)}`,
    `before_parse_ok: ${yesNo(watch.statusBefore?.parseOk)}`,
    `before_stale: ${yesNo(watch.statusBefore?.stale)}`
  ];
  if (watch.statusAfter) {
    lines.push(`after_exists: ${yesNo(watch.statusAfter.exists)}`);
    lines.push(`after_parse_ok: ${yesNo(watch.statusAfter.parseOk)}`);
    lines.push(`after_stale: ${yesNo(watch.statusAfter.stale)}`);
    lines.push(`after_task: ${compact(watch.statusAfter.saved?.task)}`);
    lines.push(`after_selected_backend: ${compact(watch.statusAfter.saved?.selectedBackend)}`);
    lines.push(`after_objective_primary: ${compact(watch.statusAfter.saved?.objectivePrimary)}`);
  }
  if (shell(watch.refreshCommand)) lines.push(`refresh_command: ${shell(watch.refreshCommand)}`);
  return `${lines.join('\n')}\n`;
}
