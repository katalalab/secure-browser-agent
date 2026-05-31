import fs from 'node:fs';
import path from 'node:path';
import { buildAgentProofChecklistStatus } from './agent-proof-checklist.mjs';
import { buildCompletionProofBundle } from './completion-proof-bundle.mjs';
import { buildObjectiveCompletionAuditStatus } from './objective-completion-audit.mjs';
import { buildProviderDoctorStatus } from './provider-doctor-status.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
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

function optionEnabled(options, camelName, kebabName, defaultValue = false) {
  const value = options?.[camelName] ?? options?.[kebabName];
  if (value === undefined) return defaultValue;
  if (value === false) return false;
  const text = String(value).trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(text);
}

function maybeCompactAuditArgs(args, enabled) {
  return enabled ? [...args, '--include-compact-command-audit'] : args;
}

function shell(value) {
  return value?.shell || '';
}

function explicitBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function inferOperatorResumeSafety(saved = {}) {
  const operatorResumeCommand = saved?.commands?.operatorResume || null;
  const hasOperatorResumeCommand = Boolean(shell(operatorResumeCommand) || (Array.isArray(operatorResumeCommand?.args) && operatorResumeCommand.args.length));
  return {
    command: operatorResumeCommand,
    requiresOperatorApproval: explicitBoolean(saved?.operatorResumeRequiresOperatorApproval) ?? explicitBoolean(saved?.operatorApprovalRequired) ?? hasOperatorResumeCommand,
    opensBrowser: explicitBoolean(saved?.operatorResumeOpensBrowser) ?? explicitBoolean(saved?.operatorCommandOpensBrowser) ?? hasOperatorResumeCommand,
    startsCapture: explicitBoolean(saved?.operatorResumeStartsCapture) ?? explicitBoolean(saved?.operatorCommandStartsCapture) ?? hasOperatorResumeCommand,
    agentMayRunUnattended: explicitBoolean(saved?.operatorResumeAgentMayRunUnattended) ?? false
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

function safeRunPath(rootDir, outPath, fallback = 'operator/agent-proof-closeout-latest.json') {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || fallback).replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent proof closeout output path: ${outPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`path is outside runs: ${filePath}`);
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function buildAgentProofCloseout(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const candidate = options.candidate || 'github';
  const outputPath = safeRunPath(rootDir, options.out || options.output);
  const outputRelative = runsRelativePath(rootDir, outputPath);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const includeCompactCommandAudit = optionEnabled(options, 'includeCompactCommandAudit', 'include-compact-command-audit');
  const bundle = options.bundle || await buildCompletionProofBundle({
    ...options,
    rootDir,
    generatedAt,
    candidate,
    includeCompactCommandAudit,
    write: false,
    out: ''
  });
  const checklistStatus = options.checklistStatus || buildAgentProofChecklistStatus({
    rootDir,
    in: options.checklistIn || options['checklist-in'] || 'operator/agent-proof-checklist-latest.json',
    candidate
  });
  const providerDoctorStatus = options.providerDoctorStatus || buildProviderDoctorStatus({
    ...options,
    rootDir
  });
  const complete = Boolean(bundle.complete);
  const closeout = {
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
    candidate,
    includeCompactCommandAudit,
    complete,
    verdict: bundle.verdict || (complete ? 'complete' : 'not-complete'),
    targetDir: bundle.targetDir || checklistStatus.targetDir || '',
    readinessComplete: Boolean(bundle.readinessComplete),
    readinessRemainingCount: bundle.readinessRemainingCount ?? checklistStatus.readinessRemainingCount ?? 0,
    readinessRemaining: Array.isArray(bundle.readinessRemaining) ? bundle.readinessRemaining : checklistStatus.readinessRemaining || [],
    objectiveCompletionComplete: Boolean(bundle.objectiveCompletionComplete),
    proofGateComplete: Boolean(bundle.proofGateComplete),
    targetApprovalComplete: Boolean(bundle.targetApprovalComplete),
    targetProofReady: Boolean(bundle.targetProofReady),
    authState: bundle.authState || checklistStatus.authState || '',
    authUsable: Boolean(bundle.authUsable || checklistStatus.authUsable),
    captureBlocked: Boolean(bundle.captureBlocked || checklistStatus.captureBlocked),
    automationBlocker: bundle.automationBlocker || checklistStatus.automationBlocker || '',
    acceptedExternalProofs: bundle.acceptedExternalProofs ?? checklistStatus.acceptedExternalProofs ?? 0,
    nextArtifactAction: bundle.nextArtifactAction || checklistStatus.nextArtifactAction || '',
    nextArtifactBlocker: bundle.nextArtifactBlocker || checklistStatus.nextArtifactBlocker || '',
    artifactCommandCovers: Array.isArray(bundle.artifactCommandCovers) ? bundle.artifactCommandCovers : checklistStatus.artifactCommandCovers || [],
    missingArtifactCount: bundle.missingArtifactCount ?? (Array.isArray(bundle.missingArtifacts) ? bundle.missingArtifacts.length : checklistStatus.missingArtifactCount ?? 0),
    missingArtifacts: Array.isArray(bundle.missingArtifacts) ? bundle.missingArtifacts : checklistStatus.missingArtifacts || [],
    checklistExists: Boolean(checklistStatus.exists),
    checklistParseOk: Boolean(checklistStatus.parseOk),
    checklistStale: Boolean(checklistStatus.stale),
    operatorApprovalRequired: Boolean(checklistStatus.operatorApprovalRequired || bundle.targetApprovalOperatorApprovalRequired),
    operatorCommandOpensBrowser: Boolean(checklistStatus.operatorCommandOpensBrowser || bundle.targetApprovalOperatorCommandOpensBrowser),
    operatorCommandStartsCapture: Boolean(checklistStatus.operatorCommandStartsCapture || bundle.targetApprovalOperatorCommandStartsCapture),
    operatorResumeRequiresOperatorApproval: Boolean(bundle.operatorResumeRequiresOperatorApproval ?? checklistStatus.operatorApprovalRequired ?? bundle.targetApprovalOperatorApprovalRequired),
    operatorResumeOpensBrowser: Boolean(bundle.operatorResumeOpensBrowser ?? checklistStatus.operatorCommandOpensBrowser ?? bundle.targetApprovalOperatorCommandOpensBrowser),
    operatorResumeStartsCapture: Boolean(bundle.operatorResumeStartsCapture ?? checklistStatus.operatorCommandStartsCapture ?? bundle.targetApprovalOperatorCommandStartsCapture),
    operatorResumeAgentMayRunUnattended: Boolean(bundle.operatorResumeAgentMayRunUnattended),
    agentSafeNextCommandId: complete ? 'none' : bundle.agentSafeNextCommandId || 'agent-preflight',
    agentSafeNextMayRunUnattended: Boolean(!complete && (bundle.agentSafeNextMayRunUnattended ?? true)),
    agentSafeNextOpensBrowser: Boolean(bundle.agentSafeNextOpensBrowser),
    agentSafeNextStartsCapture: Boolean(bundle.agentSafeNextStartsCapture),
    agentSafeNextReadsBrowserStorage: Boolean(bundle.agentSafeNextReadsBrowserStorage),
    agentSafeNextReturnsPageContent: Boolean(bundle.agentSafeNextReturnsPageContent),
    targetApprovalPreflightMayRunUnattended: Boolean(bundle.targetApprovalPreflightMayRunUnattended ?? true),
    targetApprovalPreflightOpensBrowser: Boolean(bundle.targetApprovalPreflightOpensBrowser),
    targetApprovalPreflightStartsCapture: Boolean(bundle.targetApprovalPreflightStartsCapture),
    targetApprovalPreflightReadsBrowserStorage: Boolean(bundle.targetApprovalPreflightReadsBrowserStorage),
    targetApprovalPreflightReturnsPageContent: Boolean(bundle.targetApprovalPreflightReturnsPageContent),
    targetProofPlanMayRunUnattended: Boolean(bundle.targetProofPlanMayRunUnattended),
    targetProofPlanOpensBrowser: Boolean(bundle.targetProofPlanOpensBrowser),
    targetProofPlanStartsCapture: Boolean(bundle.targetProofPlanStartsCapture),
    targetProofPlanReadsBrowserStorage: Boolean(bundle.targetProofPlanReadsBrowserStorage),
    targetProofPlanReturnsPageContent: Boolean(bundle.targetProofPlanReturnsPageContent),
    targetApprovalResumeWriteMayRunUnattended: Boolean(bundle.targetApprovalResumeWriteMayRunUnattended),
    targetApprovalResumeWriteOpensBrowser: Boolean(bundle.targetApprovalResumeWriteOpensBrowser),
    targetApprovalResumeWriteStartsCapture: Boolean(bundle.targetApprovalResumeWriteStartsCapture),
    targetApprovalResumeWatchMayRunUnattended: Boolean(bundle.targetApprovalResumeWatchMayRunUnattended),
    targetApprovalResumeWatchOpensBrowser: Boolean(bundle.targetApprovalResumeWatchOpensBrowser),
    targetApprovalResumeWatchStartsCapture: Boolean(bundle.targetApprovalResumeWatchStartsCapture),
    targetApprovalResumeWatchRequiresOperatorApproval: Boolean(bundle.targetApprovalResumeWatchRequiresOperatorApproval),
    providerDefaultBackend: providerDoctorStatus.defaultBackend || '',
    providerDefaultAgentInterface: providerDoctorStatus.defaultAgentInterface || '',
    providerPublicBenchmarkProofExists: Boolean(providerDoctorStatus.publicBenchmark?.exists),
    providerPublicBenchmarkProofOk: Boolean(providerDoctorStatus.publicBenchmark?.ok),
    providerPublicBenchmarkProofPath: providerDoctorStatus.publicBenchmark?.path || '',
    providerPublicBenchmarkFastestMeasuredProvider: providerDoctorStatus.publicBenchmark?.fastestMeasuredProvider || '',
    providerPublicBenchmarkDirectCdpColdOk: Boolean(providerDoctorStatus.publicBenchmark?.directCdpColdOk),
    providerPublicBenchmarkDirectCdpDaemonOk: Boolean(providerDoctorStatus.publicBenchmark?.directCdpDaemonOk),
    providerPublicBenchmarkAgentBrowserChromeOk: Boolean(providerDoctorStatus.publicBenchmark?.agentBrowserChromeOk),
    providerPublicBenchmarkPlaywrightOk: Boolean(providerDoctorStatus.publicBenchmark?.playwrightOk),
    providerPublicBenchmarkAgentMayRunUnattended: Boolean(providerDoctorStatus.publicBenchmark?.agentMayRunUnattended),
    providerPublicBenchmarkStartsBrowser: Boolean(providerDoctorStatus.publicBenchmark?.startsBrowser),
    providerPublicBenchmarkReadsBrowserStorage: Boolean(providerDoctorStatus.publicBenchmark?.readsBrowserStorage),
    providerPublicBenchmarkReturnsPageContent: Boolean(providerDoctorStatus.publicBenchmark?.returnsPageContent),
    providerPublicBenchmarkCommand: providerDoctorStatus.publicBenchmark?.command || providerDoctorStatus.commands?.publicBenchmark || '',
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
    providerPlaywrightPublicSmokeProofExists: Boolean(providerDoctorStatus.playwright?.publicSmokeProofExists),
    providerPlaywrightPublicSmokeProofOk: Boolean(providerDoctorStatus.playwright?.publicSmokeProofOk),
    providerPlaywrightPublicSmokeProofPath: providerDoctorStatus.playwright?.publicSmokeProofPath || '',
    providerPlaywrightPublicSmokeProofHeadingCount: providerDoctorStatus.playwright?.publicSmokeProofHeadingCount ?? 0,
    providerPlaywrightPublicSmokeProofLinkCount: providerDoctorStatus.playwright?.publicSmokeProofLinkCount ?? 0,
    providerPlaywrightSmokeProofCommand: providerDoctorStatus.playwright?.smokeProofCommand || providerDoctorStatus.commands?.playwrightSmokeProof || '',
    providerPlaywrightSmokeProofAgentMayRunUnattended: Boolean(providerDoctorStatus.playwright?.smokeProofAgentMayRunUnattended),
    providerPlaywrightSmokeProofStartsBrowser: Boolean(providerDoctorStatus.playwright?.smokeProofStartsBrowser),
    providerPlaywrightSmokeProofReadsBrowserStorage: Boolean(providerDoctorStatus.playwright?.smokeProofReadsBrowserStorage),
    providerPlaywrightSmokeProofReturnsPageContent: Boolean(providerDoctorStatus.playwright?.smokeProofReturnsPageContent),
    providerSeleniumReadyForLocalSmoke: Boolean(providerDoctorStatus.selenium?.readyForLocalSmoke),
    providerSeleniumSmokeAgentMayRunUnattended: Boolean(providerDoctorStatus.selenium?.smokeAgentMayRunUnattended),
    providerSeleniumSmokeStartsBrowser: Boolean(providerDoctorStatus.selenium?.smokeStartsBrowser),
    providerSeleniumSmokeCommand: providerDoctorStatus.selenium?.smokeCommand || providerDoctorStatus.commands?.seleniumSmoke || '',
    providerDoctorOpensBrowser: false,
    providerDoctorStartsCapture: false,
    providerDoctorReadsBrowserStorage: false,
    providerDoctorReturnsPageContent: false,
    providerDoctorMayRunUnattended: true,
    commands: {
      closeout: command(maybeCompactAuditArgs(['node', 'src/cli.mjs', 'agent-proof-closeout', '--candidate', candidate], includeCompactCommandAudit).concat(['--format', 'compact'])),
      closeoutWrite: command(maybeCompactAuditArgs(['node', 'src/cli.mjs', 'agent-proof-closeout', '--candidate', candidate, '--write', '--out', outputRelative], includeCompactCommandAudit).concat(['--format', 'compact'])),
      closeoutStatus: command(['node', 'src/cli.mjs', 'agent-proof-closeout-status', '--in', outputRelative, '--format', 'compact']),
      checklistRefresh: command(['node', 'src/cli.mjs', 'agent-proof-checklist', '--candidate', candidate, '--write', '--out', 'operator/agent-proof-checklist-latest.json', '--format', 'compact']),
      checklistStatus: command(['node', 'src/cli.mjs', 'agent-proof-checklist-status', '--in', 'operator/agent-proof-checklist-latest.json', '--format', 'compact']),
      completionProofBundle: command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', candidate, '--include-compact-command-audit', '--write', '--out', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']),
      completionProofBundleWithAudit: command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', candidate, '--include-compact-command-audit', '--write', '--out', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']),
      completionProofBundleStatus: command(['node', 'src/cli.mjs', 'completion-proof-bundle-status', '--in', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']),
      compactCommandAuditAll: command(['node', 'src/cli.mjs', 'compact-command-audit', '--source', 'all', '--strict', '--format', 'compact']),
      readiness: command(['node', 'src/cli.mjs', 'readiness-audit', '--format', 'compact']),
      objectiveCompletion: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--format', 'compact']),
      objectiveCompletionStrict: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
      agentSafeNext: bundle.commands?.agentPreflight || command(['node', 'src/cli.mjs', 'agent-preflight', '--candidate', candidate, '--real-external', '--format', 'compact']),
      targetApprovalPreflight: bundle.commands?.targetApprovalPreflight || command(['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', candidate, '--real-external', '--format', 'compact']),
      targetProofPlan: bundle.commands?.targetProofPlan || null,
      targetApprovalResumeWrite: bundle.commands?.targetApprovalResumeWrite || null,
      targetApprovalResumeStatus: bundle.commands?.targetApprovalResumeStatus || null,
      targetApprovalResumeWatch: bundle.commands?.targetApprovalResumeWatch || null,
      providerDoctorStatus: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']),
      operatorResume: bundle.commands?.operatorResume || null
    },
    next: complete
      ? 'Real external authenticated proof is complete; run objective-completion-audit --strict before closing the goal.'
      : 'Real external proof remains incomplete; refresh the checklist and run the operator resume command only with explicit operator approval after login.'
  };
  if (options.write) {
    writeJson(outputPath, closeout);
    closeout.outputPath = outputPath;
  }
  return closeout;
}

export function buildAgentProofCloseoutStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputPath = safeRunPath(rootDir, options.in || options.input || 'operator/agent-proof-closeout-latest.json');
  const exists = fs.existsSync(inputPath);
  const nowMs = Number(options.nowMs || Date.now());
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const stat = exists ? fs.statSync(inputPath) : null;
  const ageSeconds = stat ? Math.max(0, Math.round((nowMs - stat.mtimeMs) / 1000)) : null;
  const saved = exists ? readJson(inputPath) : null;
  const parseOk = Boolean(saved && !saved.parseError);
  const stale = exists && ageSeconds !== null && Number.isFinite(staleAfterSeconds) && staleAfterSeconds >= 0
    ? ageSeconds > staleAfterSeconds
    : false;
  const candidate = saved?.candidate || options.candidate || 'github';
  const operatorResumeSafety = parseOk ? inferOperatorResumeSafety(saved) : inferOperatorResumeSafety();
  const inputRelative = runsRelativePath(rootDir, inputPath);
  const includeCompactCommandAudit = parseOk
    ? optionEnabled(saved, 'includeCompactCommandAudit', 'include-compact-command-audit')
    : true;
  const refreshCommand = command(maybeCompactAuditArgs(['node', 'src/cli.mjs', 'agent-proof-closeout', '--candidate', candidate, '--write', '--out', inputRelative], includeCompactCommandAudit).concat(['--format', 'compact']));
  const refreshNeeded = !exists || !parseOk || stale;
  const objectiveSafeNext = refreshNeeded ? null : currentObjectiveAuditSafeNext(rootDir, options);
  const agentSafeNextCommand = refreshNeeded
    ? refreshCommand
    : objectiveSafeNext?.command
      ? objectiveSafeNext.command
      : saved?.commands?.agentSafeNext || command(['node', 'src/cli.mjs', 'agent-preflight', '--candidate', candidate, '--real-external', '--format', 'compact']);
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
    inputPath,
    exists,
    parseOk,
    parseError: saved?.parseError || '',
    stale,
    ageSeconds,
    staleAfterSeconds,
    complete: Boolean(parseOk && saved.complete),
    verdict: parseOk ? saved.verdict || (saved.complete ? 'complete' : 'not-complete') : 'unknown',
    candidate,
    includeCompactCommandAudit,
    targetDir: saved?.targetDir || '',
    readinessRemainingCount: parseOk ? saved.readinessRemainingCount ?? 0 : 0,
    readinessRemaining: parseOk && Array.isArray(saved.readinessRemaining) ? saved.readinessRemaining : [],
    authState: saved?.authState || '',
    authUsable: Boolean(saved?.authUsable),
    captureBlocked: Boolean(saved?.captureBlocked),
    automationBlocker: saved?.automationBlocker || '',
    acceptedExternalProofs: saved?.acceptedExternalProofs ?? 0,
    nextArtifactAction: saved?.nextArtifactAction || '',
    nextArtifactBlocker: saved?.nextArtifactBlocker || '',
    artifactCommandCovers: parseOk && Array.isArray(saved.artifactCommandCovers) ? saved.artifactCommandCovers : [],
    missingArtifactCount: parseOk ? saved.missingArtifactCount ?? (Array.isArray(saved.missingArtifacts) ? saved.missingArtifacts.length : 0) : 0,
    missingArtifacts: parseOk && Array.isArray(saved.missingArtifacts) ? saved.missingArtifacts : [],
    checklistExists: Boolean(saved?.checklistExists),
    checklistParseOk: Boolean(saved?.checklistParseOk),
    checklistStale: Boolean(saved?.checklistStale),
    operatorApprovalRequired: Boolean(saved?.operatorApprovalRequired),
    operatorCommandOpensBrowser: Boolean(saved?.operatorCommandOpensBrowser),
    operatorCommandStartsCapture: Boolean(saved?.operatorCommandStartsCapture),
    operatorResumeRequiresOperatorApproval: operatorResumeSafety.requiresOperatorApproval,
    operatorResumeOpensBrowser: operatorResumeSafety.opensBrowser,
    operatorResumeStartsCapture: operatorResumeSafety.startsCapture,
    operatorResumeAgentMayRunUnattended: operatorResumeSafety.agentMayRunUnattended,
    objectiveCompletionAuditExists: Boolean(objectiveSafeNext?.status?.exists),
    objectiveCompletionAuditParseOk: Boolean(objectiveSafeNext?.status?.parseOk),
    objectiveCompletionAuditStale: Boolean(objectiveSafeNext?.status?.stale),
    objectiveCompletionAuditSavedComplete: Boolean(objectiveSafeNext?.status?.savedComplete),
    objectiveCompletionAuditSavedStatus: objectiveSafeNext?.status?.savedStatus || '',
    objectiveCompletionAuditRemainingCount: objectiveSafeNext?.status?.remainingCount ?? 0,
    objectiveCompletionAuditRemaining: Array.isArray(objectiveSafeNext?.status?.remaining) ? objectiveSafeNext.status.remaining : [],
    agentSafeNextCommandId: refreshNeeded
      ? 'agent-proof-closeout-refresh'
      : objectiveSafeNext?.status?.agentSafeNextCommandId
        ? objectiveSafeNext.status.agentSafeNextCommandId
        : parseOk && !saved.complete
          ? saved.agentSafeNextCommandId || 'agent-preflight'
          : 'none',
    agentSafeNextMayRunUnattended: Boolean(refreshNeeded || objectiveSafeNext?.status?.agentSafeNextMayRunUnattended || (parseOk && !saved.complete && (saved.agentSafeNextMayRunUnattended ?? true))),
    agentSafeNextOpensBrowser: Boolean(objectiveSafeNext?.status?.agentSafeNextOpensBrowser ?? saved?.agentSafeNextOpensBrowser),
    agentSafeNextStartsCapture: Boolean(objectiveSafeNext?.status?.agentSafeNextStartsCapture ?? saved?.agentSafeNextStartsCapture),
    agentSafeNextReadsBrowserStorage: Boolean(objectiveSafeNext?.status?.agentSafeNextReadsBrowserStorage ?? saved?.agentSafeNextReadsBrowserStorage),
    agentSafeNextReturnsPageContent: Boolean(objectiveSafeNext?.status?.agentSafeNextReturnsPageContent ?? saved?.agentSafeNextReturnsPageContent),
    targetApprovalPreflightMayRunUnattended: Boolean(parseOk && (saved.targetApprovalPreflightMayRunUnattended ?? true)),
    targetApprovalPreflightOpensBrowser: Boolean(saved?.targetApprovalPreflightOpensBrowser),
    targetApprovalPreflightStartsCapture: Boolean(saved?.targetApprovalPreflightStartsCapture),
    targetApprovalPreflightReadsBrowserStorage: Boolean(saved?.targetApprovalPreflightReadsBrowserStorage),
    targetApprovalPreflightReturnsPageContent: Boolean(saved?.targetApprovalPreflightReturnsPageContent),
    targetProofPlanMayRunUnattended: Boolean(saved?.targetProofPlanMayRunUnattended),
    targetProofPlanOpensBrowser: Boolean(saved?.targetProofPlanOpensBrowser),
    targetProofPlanStartsCapture: Boolean(saved?.targetProofPlanStartsCapture),
    targetProofPlanReadsBrowserStorage: Boolean(saved?.targetProofPlanReadsBrowserStorage),
    targetProofPlanReturnsPageContent: Boolean(saved?.targetProofPlanReturnsPageContent),
    targetApprovalResumeWriteMayRunUnattended: Boolean(saved?.targetApprovalResumeWriteMayRunUnattended),
    targetApprovalResumeWriteOpensBrowser: Boolean(saved?.targetApprovalResumeWriteOpensBrowser),
    targetApprovalResumeWriteStartsCapture: Boolean(saved?.targetApprovalResumeWriteStartsCapture),
    targetApprovalResumeWatchMayRunUnattended: Boolean(saved?.targetApprovalResumeWatchMayRunUnattended),
    targetApprovalResumeWatchOpensBrowser: Boolean(saved?.targetApprovalResumeWatchOpensBrowser),
    targetApprovalResumeWatchStartsCapture: Boolean(saved?.targetApprovalResumeWatchStartsCapture),
    targetApprovalResumeWatchRequiresOperatorApproval: Boolean(saved?.targetApprovalResumeWatchRequiresOperatorApproval),
    providerDefaultBackend: saved?.providerDefaultBackend || '',
    providerDefaultAgentInterface: saved?.providerDefaultAgentInterface || '',
    providerPublicBenchmarkProofExists: Boolean(saved?.providerPublicBenchmarkProofExists),
    providerPublicBenchmarkProofOk: Boolean(saved?.providerPublicBenchmarkProofOk),
    providerPublicBenchmarkProofPath: saved?.providerPublicBenchmarkProofPath || '',
    providerPublicBenchmarkFastestMeasuredProvider: saved?.providerPublicBenchmarkFastestMeasuredProvider || '',
    providerPublicBenchmarkDirectCdpColdOk: Boolean(saved?.providerPublicBenchmarkDirectCdpColdOk),
    providerPublicBenchmarkDirectCdpDaemonOk: Boolean(saved?.providerPublicBenchmarkDirectCdpDaemonOk),
    providerPublicBenchmarkAgentBrowserChromeOk: Boolean(saved?.providerPublicBenchmarkAgentBrowserChromeOk),
    providerPublicBenchmarkPlaywrightOk: Boolean(saved?.providerPublicBenchmarkPlaywrightOk),
    providerPublicBenchmarkAgentMayRunUnattended: Boolean(saved?.providerPublicBenchmarkAgentMayRunUnattended),
    providerPublicBenchmarkStartsBrowser: Boolean(saved?.providerPublicBenchmarkStartsBrowser),
    providerPublicBenchmarkReadsBrowserStorage: Boolean(saved?.providerPublicBenchmarkReadsBrowserStorage),
    providerPublicBenchmarkReturnsPageContent: Boolean(saved?.providerPublicBenchmarkReturnsPageContent),
    providerPublicBenchmarkCommand: saved?.providerPublicBenchmarkCommand || '',
    providerLightpandaReadyForPublicBenchmark: Boolean(saved?.providerLightpandaReadyForPublicBenchmark),
    providerLightpandaBenchmarkAgentMayRunUnattended: Boolean(saved?.providerLightpandaBenchmarkAgentMayRunUnattended),
    providerLightpandaBenchmarkStartsBrowser: Boolean(saved?.providerLightpandaBenchmarkStartsBrowser),
    providerLightpandaBenchmarkReadsBrowserStorage: Boolean(saved?.providerLightpandaBenchmarkReadsBrowserStorage),
    providerLightpandaBenchmarkReturnsPageContent: Boolean(saved?.providerLightpandaBenchmarkReturnsPageContent),
    providerLightpandaBenchmarkCommand: saved?.providerLightpandaBenchmarkCommand || '',
    providerPlaywrightReadyForPublicSmoke: Boolean(saved?.providerPlaywrightReadyForPublicSmoke),
    providerPlaywrightReadyForAuthenticatedDefault: Boolean(saved?.providerPlaywrightReadyForAuthenticatedDefault),
    providerPlaywrightStorageStateSensitive: Boolean(saved?.providerPlaywrightStorageStateSensitive),
    providerPlaywrightSmokeCommand: saved?.providerPlaywrightSmokeCommand || '',
    providerPlaywrightPublicSmokeProofExists: Boolean(saved?.providerPlaywrightPublicSmokeProofExists),
    providerPlaywrightPublicSmokeProofOk: Boolean(saved?.providerPlaywrightPublicSmokeProofOk),
    providerPlaywrightPublicSmokeProofPath: saved?.providerPlaywrightPublicSmokeProofPath || '',
    providerPlaywrightPublicSmokeProofHeadingCount: saved?.providerPlaywrightPublicSmokeProofHeadingCount ?? 0,
    providerPlaywrightPublicSmokeProofLinkCount: saved?.providerPlaywrightPublicSmokeProofLinkCount ?? 0,
    providerPlaywrightSmokeProofCommand: saved?.providerPlaywrightSmokeProofCommand || '',
    providerPlaywrightSmokeProofAgentMayRunUnattended: Boolean(saved?.providerPlaywrightSmokeProofAgentMayRunUnattended),
    providerPlaywrightSmokeProofStartsBrowser: Boolean(saved?.providerPlaywrightSmokeProofStartsBrowser),
    providerPlaywrightSmokeProofReadsBrowserStorage: Boolean(saved?.providerPlaywrightSmokeProofReadsBrowserStorage),
    providerPlaywrightSmokeProofReturnsPageContent: Boolean(saved?.providerPlaywrightSmokeProofReturnsPageContent),
    providerSeleniumReadyForLocalSmoke: Boolean(saved?.providerSeleniumReadyForLocalSmoke),
    providerSeleniumSmokeAgentMayRunUnattended: Boolean(saved?.providerSeleniumSmokeAgentMayRunUnattended),
    providerSeleniumSmokeStartsBrowser: Boolean(saved?.providerSeleniumSmokeStartsBrowser),
    providerSeleniumSmokeCommand: saved?.providerSeleniumSmokeCommand || '',
    providerDoctorOpensBrowser: Boolean(saved?.providerDoctorOpensBrowser),
    providerDoctorStartsCapture: Boolean(saved?.providerDoctorStartsCapture),
    providerDoctorReadsBrowserStorage: Boolean(saved?.providerDoctorReadsBrowserStorage),
    providerDoctorReturnsPageContent: Boolean(saved?.providerDoctorReturnsPageContent),
    providerDoctorMayRunUnattended: Boolean(saved?.providerDoctorMayRunUnattended ?? true),
    agentSafeNextCommand,
    targetApprovalPreflightCommand: saved?.commands?.targetApprovalPreflight || command(['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', candidate, '--real-external', '--format', 'compact']),
    targetProofPlanCommand: saved?.commands?.targetProofPlan || null,
    targetApprovalResumeWriteCommand: saved?.commands?.targetApprovalResumeWrite || null,
    targetApprovalResumeStatusCommand: saved?.commands?.targetApprovalResumeStatus || null,
    targetApprovalResumeWatchCommand: saved?.commands?.targetApprovalResumeWatch || null,
    providerDoctorStatusCommand: saved?.commands?.providerDoctorStatus || command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']),
    operatorResumeCommand: operatorResumeSafety.command,
    completionProofBundleCommand: saved?.commands?.completionProofBundle || command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', candidate, '--include-compact-command-audit', '--write', '--out', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']),
    completionProofBundleWithAuditCommand: saved?.commands?.completionProofBundleWithAudit || command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', candidate, '--include-compact-command-audit', '--write', '--out', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']),
    compactCommandAuditAllCommand: saved?.commands?.compactCommandAuditAll || command(['node', 'src/cli.mjs', 'compact-command-audit', '--source', 'all', '--strict', '--format', 'compact']),
    objectiveCompletionStrictCommand: saved?.commands?.objectiveCompletionStrict || command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
    refreshCommand,
    next: !exists
      ? 'Write a fresh agent proof closeout.'
      : !parseOk
        ? 'Refresh the agent proof closeout; saved JSON could not be parsed.'
        : stale
          ? 'Refresh the stale agent proof closeout.'
          : saved.complete
            ? 'Saved agent proof closeout is complete; run objective-completion-audit --strict before closing.'
            : 'Saved agent proof closeout is incomplete; continue the real external proof lane.'
  };
}

export function formatAgentProofCloseoutCompact(closeout) {
  const lines = [
    `safe_mode: ${yesNo(closeout.safeMode)}`,
    `status_only: ${yesNo(closeout.statusOnly)}`,
    `destructive_actions: ${yesNo(closeout.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(closeout.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(closeout.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(closeout.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(closeout.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(closeout.pageContentReturned)}`,
    `complete: ${yesNo(closeout.complete)}`,
    `verdict: ${compact(closeout.verdict)}`,
    `candidate: ${compact(closeout.candidate)}`,
    `target_dir: ${compact(rootRelativePath(closeout.rootDir, closeout.targetDir))}`,
    `readiness_complete: ${yesNo(closeout.readinessComplete)}`,
    `readiness_remaining_count: ${closeout.readinessRemainingCount}`,
    `readiness_remaining: ${closeout.readinessRemaining.join(',') || 'none'}`,
    `objective_completion_complete: ${yesNo(closeout.objectiveCompletionComplete)}`,
    `proof_gate_complete: ${yesNo(closeout.proofGateComplete)}`,
    `target_approval_complete: ${yesNo(closeout.targetApprovalComplete)}`,
    `target_proof_ready: ${yesNo(closeout.targetProofReady)}`,
    `auth_state: ${compact(closeout.authState)}`,
    `auth_usable: ${yesNo(closeout.authUsable)}`,
    `capture_blocked: ${yesNo(closeout.captureBlocked)}`,
    `automation_blocker: ${compact(closeout.automationBlocker)}`,
    `accepted_external_proofs: ${closeout.acceptedExternalProofs}`,
    `next_artifact_action: ${compact(closeout.nextArtifactAction)}`,
    `next_artifact_blocker: ${compact(closeout.nextArtifactBlocker)}`,
    `artifact_command_covers: ${closeout.artifactCommandCovers.join(',') || 'none'}`,
    `missing_artifact_count: ${closeout.missingArtifactCount}`,
    `missing_artifacts: ${closeout.missingArtifacts.join(',') || 'none'}`,
    `checklist_exists: ${yesNo(closeout.checklistExists)}`,
    `checklist_parse_ok: ${yesNo(closeout.checklistParseOk)}`,
    `checklist_stale: ${yesNo(closeout.checklistStale)}`,
    `operator_approval_required: ${yesNo(closeout.operatorApprovalRequired)}`,
    `operator_command_opens_browser: ${yesNo(closeout.operatorCommandOpensBrowser)}`,
    `operator_command_starts_capture: ${yesNo(closeout.operatorCommandStartsCapture)}`,
    `operator_resume_requires_operator_approval: ${yesNo(closeout.operatorResumeRequiresOperatorApproval)}`,
    `operator_resume_opens_browser: ${yesNo(closeout.operatorResumeOpensBrowser)}`,
    `operator_resume_starts_capture: ${yesNo(closeout.operatorResumeStartsCapture)}`,
    `operator_resume_agent_may_run_unattended: ${yesNo(closeout.operatorResumeAgentMayRunUnattended)}`,
    `agent_safe_next_command_id: ${compact(closeout.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(closeout.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(closeout.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(closeout.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(closeout.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(closeout.agentSafeNextReturnsPageContent)}`,
    `target_approval_preflight_may_run_unattended: ${yesNo(closeout.targetApprovalPreflightMayRunUnattended)}`,
    `target_approval_preflight_opens_browser: ${yesNo(closeout.targetApprovalPreflightOpensBrowser)}`,
    `target_approval_preflight_starts_capture: ${yesNo(closeout.targetApprovalPreflightStartsCapture)}`,
    `target_approval_preflight_reads_browser_storage: ${yesNo(closeout.targetApprovalPreflightReadsBrowserStorage)}`,
    `target_approval_preflight_returns_page_content: ${yesNo(closeout.targetApprovalPreflightReturnsPageContent)}`,
    `target_proof_plan_may_run_unattended: ${yesNo(closeout.targetProofPlanMayRunUnattended)}`,
    `target_proof_plan_opens_browser: ${yesNo(closeout.targetProofPlanOpensBrowser)}`,
    `target_proof_plan_starts_capture: ${yesNo(closeout.targetProofPlanStartsCapture)}`,
    `target_proof_plan_reads_browser_storage: ${yesNo(closeout.targetProofPlanReadsBrowserStorage)}`,
    `target_proof_plan_returns_page_content: ${yesNo(closeout.targetProofPlanReturnsPageContent)}`,
    `target_approval_resume_write_may_run_unattended: ${yesNo(closeout.targetApprovalResumeWriteMayRunUnattended)}`,
    `target_approval_resume_write_opens_browser: ${yesNo(closeout.targetApprovalResumeWriteOpensBrowser)}`,
    `target_approval_resume_write_starts_capture: ${yesNo(closeout.targetApprovalResumeWriteStartsCapture)}`,
    `target_approval_resume_watch_may_run_unattended: ${yesNo(closeout.targetApprovalResumeWatchMayRunUnattended)}`,
    `target_approval_resume_watch_agent_may_run_unattended: ${yesNo(closeout.targetApprovalResumeWatchMayRunUnattended)}`,
    `target_approval_resume_watch_opens_browser: ${yesNo(closeout.targetApprovalResumeWatchOpensBrowser)}`,
    `target_approval_resume_watch_starts_capture: ${yesNo(closeout.targetApprovalResumeWatchStartsCapture)}`,
    `target_approval_resume_watch_requires_operator_approval: ${yesNo(closeout.targetApprovalResumeWatchRequiresOperatorApproval)}`,
    `provider_default_backend: ${compact(closeout.providerDefaultBackend)}`,
    `provider_default_agent_interface: ${compact(closeout.providerDefaultAgentInterface)}`,
    `provider_public_benchmark_proof_exists: ${yesNo(closeout.providerPublicBenchmarkProofExists)}`,
    `provider_public_benchmark_proof_ok: ${yesNo(closeout.providerPublicBenchmarkProofOk)}`,
    `provider_public_benchmark_proof_path: ${compact(closeout.providerPublicBenchmarkProofPath)}`,
    `provider_public_benchmark_fastest_measured_provider: ${compact(closeout.providerPublicBenchmarkFastestMeasuredProvider)}`,
    `provider_public_benchmark_direct_cdp_cold_ok: ${yesNo(closeout.providerPublicBenchmarkDirectCdpColdOk)}`,
    `provider_public_benchmark_direct_cdp_daemon_ok: ${yesNo(closeout.providerPublicBenchmarkDirectCdpDaemonOk)}`,
    `provider_public_benchmark_agent_browser_chrome_ok: ${yesNo(closeout.providerPublicBenchmarkAgentBrowserChromeOk)}`,
    `provider_public_benchmark_playwright_ok: ${yesNo(closeout.providerPublicBenchmarkPlaywrightOk)}`,
    `provider_public_benchmark_agent_may_run_unattended: ${yesNo(closeout.providerPublicBenchmarkAgentMayRunUnattended)}`,
    `provider_public_benchmark_starts_browser: ${yesNo(closeout.providerPublicBenchmarkStartsBrowser)}`,
    `provider_public_benchmark_reads_browser_storage: ${yesNo(closeout.providerPublicBenchmarkReadsBrowserStorage)}`,
    `provider_public_benchmark_returns_page_content: ${yesNo(closeout.providerPublicBenchmarkReturnsPageContent)}`,
    `provider_public_benchmark_command: ${compact(closeout.providerPublicBenchmarkCommand)}`,
    `provider_lightpanda_ready_for_public_benchmark: ${yesNo(closeout.providerLightpandaReadyForPublicBenchmark)}`,
    `provider_lightpanda_benchmark_agent_may_run_unattended: ${yesNo(closeout.providerLightpandaBenchmarkAgentMayRunUnattended)}`,
    `provider_lightpanda_benchmark_starts_browser: ${yesNo(closeout.providerLightpandaBenchmarkStartsBrowser)}`,
    `provider_lightpanda_benchmark_reads_browser_storage: ${yesNo(closeout.providerLightpandaBenchmarkReadsBrowserStorage)}`,
    `provider_lightpanda_benchmark_returns_page_content: ${yesNo(closeout.providerLightpandaBenchmarkReturnsPageContent)}`,
    `provider_lightpanda_benchmark_command: ${compact(closeout.providerLightpandaBenchmarkCommand)}`,
    `provider_playwright_ready_for_public_smoke: ${yesNo(closeout.providerPlaywrightReadyForPublicSmoke)}`,
    `provider_playwright_ready_for_authenticated_default: ${yesNo(closeout.providerPlaywrightReadyForAuthenticatedDefault)}`,
    `provider_playwright_storage_state_sensitive: ${yesNo(closeout.providerPlaywrightStorageStateSensitive)}`,
    `provider_playwright_smoke_command: ${compact(closeout.providerPlaywrightSmokeCommand)}`,
    `provider_playwright_public_smoke_proof_exists: ${yesNo(closeout.providerPlaywrightPublicSmokeProofExists)}`,
    `provider_playwright_public_smoke_proof_ok: ${yesNo(closeout.providerPlaywrightPublicSmokeProofOk)}`,
    `provider_playwright_public_smoke_proof_path: ${compact(closeout.providerPlaywrightPublicSmokeProofPath)}`,
    `provider_playwright_public_smoke_proof_heading_count: ${closeout.providerPlaywrightPublicSmokeProofHeadingCount ?? 0}`,
    `provider_playwright_public_smoke_proof_link_count: ${closeout.providerPlaywrightPublicSmokeProofLinkCount ?? 0}`,
    `provider_playwright_smoke_proof_command: ${compact(closeout.providerPlaywrightSmokeProofCommand)}`,
    `provider_playwright_smoke_proof_agent_may_run_unattended: ${yesNo(closeout.providerPlaywrightSmokeProofAgentMayRunUnattended)}`,
    `provider_playwright_smoke_proof_starts_browser: ${yesNo(closeout.providerPlaywrightSmokeProofStartsBrowser)}`,
    `provider_playwright_smoke_proof_reads_browser_storage: ${yesNo(closeout.providerPlaywrightSmokeProofReadsBrowserStorage)}`,
    `provider_playwright_smoke_proof_returns_page_content: ${yesNo(closeout.providerPlaywrightSmokeProofReturnsPageContent)}`,
    `provider_selenium_ready_for_local_smoke: ${yesNo(closeout.providerSeleniumReadyForLocalSmoke)}`,
    `provider_selenium_smoke_agent_may_run_unattended: ${yesNo(closeout.providerSeleniumSmokeAgentMayRunUnattended)}`,
    `provider_selenium_smoke_starts_browser: ${yesNo(closeout.providerSeleniumSmokeStartsBrowser)}`,
    `provider_selenium_smoke_command: ${compact(closeout.providerSeleniumSmokeCommand)}`,
    `provider_doctor_opens_browser: ${yesNo(closeout.providerDoctorOpensBrowser)}`,
    `provider_doctor_starts_capture: ${yesNo(closeout.providerDoctorStartsCapture)}`,
    `provider_doctor_reads_browser_storage: ${yesNo(closeout.providerDoctorReadsBrowserStorage)}`,
    `provider_doctor_returns_page_content: ${yesNo(closeout.providerDoctorReturnsPageContent)}`,
    `provider_doctor_may_run_unattended: ${yesNo(closeout.providerDoctorMayRunUnattended)}`
  ];
  if (shell(closeout.commands?.closeout)) lines.push(`agent_proof_closeout_command: ${shell(closeout.commands.closeout)}`);
  if (shell(closeout.commands?.closeoutWrite)) lines.push(`agent_proof_closeout_write_command: ${shell(closeout.commands.closeoutWrite)}`);
  if (shell(closeout.commands?.closeoutStatus)) lines.push(`agent_proof_closeout_status_command: ${shell(closeout.commands.closeoutStatus)}`);
  if (shell(closeout.commands?.checklistRefresh)) lines.push(`agent_proof_checklist_refresh_command: ${shell(closeout.commands.checklistRefresh)}`);
  if (shell(closeout.commands?.checklistStatus)) lines.push(`agent_proof_checklist_status_command: ${shell(closeout.commands.checklistStatus)}`);
  if (shell(closeout.commands?.completionProofBundle)) lines.push(`completion_proof_bundle_command: ${shell(closeout.commands.completionProofBundle)}`);
  if (shell(closeout.commands?.completionProofBundleWithAudit)) lines.push(`completion_proof_bundle_with_audit_command: ${shell(closeout.commands.completionProofBundleWithAudit)}`);
  if (shell(closeout.commands?.completionProofBundleStatus)) lines.push(`completion_proof_bundle_status_command: ${shell(closeout.commands.completionProofBundleStatus)}`);
  if (shell(closeout.commands?.compactCommandAuditAll)) lines.push(`compact_command_audit_all_command: ${shell(closeout.commands.compactCommandAuditAll)}`);
  if (shell(closeout.commands?.readiness)) lines.push(`readiness_command: ${shell(closeout.commands.readiness)}`);
  if (shell(closeout.commands?.objectiveCompletion)) lines.push(`objective_completion_command: ${shell(closeout.commands.objectiveCompletion)}`);
  if (shell(closeout.commands?.objectiveCompletionStrict)) lines.push(`objective_completion_strict_command: ${shell(closeout.commands.objectiveCompletionStrict)}`);
  if (shell(closeout.commands?.agentSafeNext)) lines.push(`agent_safe_next_command: ${shell(closeout.commands.agentSafeNext)}`);
  if (shell(closeout.commands?.targetApprovalPreflight)) lines.push(`target_approval_preflight_command: ${shell(closeout.commands.targetApprovalPreflight)}`);
  if (shell(closeout.commands?.targetProofPlan)) lines.push(`target_proof_plan_command: ${shell(closeout.commands.targetProofPlan)}`);
  if (shell(closeout.commands?.targetApprovalResumeWrite)) lines.push(`target_approval_resume_write_command: ${shell(closeout.commands.targetApprovalResumeWrite)}`);
  if (shell(closeout.commands?.targetApprovalResumeStatus)) lines.push(`target_approval_resume_status_command: ${shell(closeout.commands.targetApprovalResumeStatus)}`);
  if (shell(closeout.commands?.targetApprovalResumeWatch)) lines.push(`target_approval_resume_watch_command: ${shell(closeout.commands.targetApprovalResumeWatch)}`);
  if (shell(closeout.commands?.providerDoctorStatus)) lines.push(`provider_doctor_status_command: ${shell(closeout.commands.providerDoctorStatus)}`);
  if (shell(closeout.commands?.operatorResume)) lines.push(`operator_resume_command: ${shell(closeout.commands.operatorResume)}`);
  if (closeout.outputPath) lines.push(`output_path: ${rootRelativePath(closeout.rootDir, closeout.outputPath)}`);
  lines.push(`next: ${closeout.next}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentProofCloseoutStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `input_path: ${compact(rootRelativePath(status.rootDir, status.inputPath))}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'none'}`,
    `complete: ${yesNo(status.complete)}`,
    `verdict: ${compact(status.verdict)}`,
    `candidate: ${compact(status.candidate)}`,
    `target_dir: ${compact(rootRelativePath(status.rootDir, status.targetDir))}`,
    `readiness_remaining_count: ${status.readinessRemainingCount}`,
    `readiness_remaining: ${status.readinessRemaining.join(',') || 'none'}`,
    `auth_state: ${compact(status.authState)}`,
    `auth_usable: ${yesNo(status.authUsable)}`,
    `capture_blocked: ${yesNo(status.captureBlocked)}`,
    `automation_blocker: ${compact(status.automationBlocker)}`,
    `accepted_external_proofs: ${status.acceptedExternalProofs}`,
    `next_artifact_action: ${compact(status.nextArtifactAction)}`,
    `next_artifact_blocker: ${compact(status.nextArtifactBlocker)}`,
    `artifact_command_covers: ${status.artifactCommandCovers.join(',') || 'none'}`,
    `missing_artifact_count: ${status.missingArtifactCount}`,
    `missing_artifacts: ${status.missingArtifacts.join(',') || 'none'}`,
    `checklist_exists: ${yesNo(status.checklistExists)}`,
    `checklist_parse_ok: ${yesNo(status.checklistParseOk)}`,
    `checklist_stale: ${yesNo(status.checklistStale)}`,
    `operator_approval_required: ${yesNo(status.operatorApprovalRequired)}`,
    `operator_command_opens_browser: ${yesNo(status.operatorCommandOpensBrowser)}`,
    `operator_command_starts_capture: ${yesNo(status.operatorCommandStartsCapture)}`,
    `operator_resume_requires_operator_approval: ${yesNo(status.operatorResumeRequiresOperatorApproval)}`,
    `operator_resume_opens_browser: ${yesNo(status.operatorResumeOpensBrowser)}`,
    `operator_resume_starts_capture: ${yesNo(status.operatorResumeStartsCapture)}`,
    `operator_resume_agent_may_run_unattended: ${yesNo(status.operatorResumeAgentMayRunUnattended)}`,
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
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `target_approval_preflight_may_run_unattended: ${yesNo(status.targetApprovalPreflightMayRunUnattended)}`,
    `target_approval_preflight_opens_browser: ${yesNo(status.targetApprovalPreflightOpensBrowser)}`,
    `target_approval_preflight_starts_capture: ${yesNo(status.targetApprovalPreflightStartsCapture)}`,
    `target_approval_preflight_reads_browser_storage: ${yesNo(status.targetApprovalPreflightReadsBrowserStorage)}`,
    `target_approval_preflight_returns_page_content: ${yesNo(status.targetApprovalPreflightReturnsPageContent)}`,
    `target_proof_plan_may_run_unattended: ${yesNo(status.targetProofPlanMayRunUnattended)}`,
    `target_proof_plan_opens_browser: ${yesNo(status.targetProofPlanOpensBrowser)}`,
    `target_proof_plan_starts_capture: ${yesNo(status.targetProofPlanStartsCapture)}`,
    `target_proof_plan_reads_browser_storage: ${yesNo(status.targetProofPlanReadsBrowserStorage)}`,
    `target_proof_plan_returns_page_content: ${yesNo(status.targetProofPlanReturnsPageContent)}`,
    `target_approval_resume_write_may_run_unattended: ${yesNo(status.targetApprovalResumeWriteMayRunUnattended)}`,
    `target_approval_resume_write_opens_browser: ${yesNo(status.targetApprovalResumeWriteOpensBrowser)}`,
    `target_approval_resume_write_starts_capture: ${yesNo(status.targetApprovalResumeWriteStartsCapture)}`,
    `target_approval_resume_watch_may_run_unattended: ${yesNo(status.targetApprovalResumeWatchMayRunUnattended)}`,
    `target_approval_resume_watch_agent_may_run_unattended: ${yesNo(status.targetApprovalResumeWatchMayRunUnattended)}`,
    `target_approval_resume_watch_opens_browser: ${yesNo(status.targetApprovalResumeWatchOpensBrowser)}`,
    `target_approval_resume_watch_starts_capture: ${yesNo(status.targetApprovalResumeWatchStartsCapture)}`,
    `target_approval_resume_watch_requires_operator_approval: ${yesNo(status.targetApprovalResumeWatchRequiresOperatorApproval)}`,
    `provider_default_backend: ${compact(status.providerDefaultBackend)}`,
    `provider_default_agent_interface: ${compact(status.providerDefaultAgentInterface)}`,
    `provider_public_benchmark_proof_exists: ${yesNo(status.providerPublicBenchmarkProofExists)}`,
    `provider_public_benchmark_proof_ok: ${yesNo(status.providerPublicBenchmarkProofOk)}`,
    `provider_public_benchmark_proof_path: ${compact(status.providerPublicBenchmarkProofPath)}`,
    `provider_public_benchmark_fastest_measured_provider: ${compact(status.providerPublicBenchmarkFastestMeasuredProvider)}`,
    `provider_public_benchmark_direct_cdp_cold_ok: ${yesNo(status.providerPublicBenchmarkDirectCdpColdOk)}`,
    `provider_public_benchmark_direct_cdp_daemon_ok: ${yesNo(status.providerPublicBenchmarkDirectCdpDaemonOk)}`,
    `provider_public_benchmark_agent_browser_chrome_ok: ${yesNo(status.providerPublicBenchmarkAgentBrowserChromeOk)}`,
    `provider_public_benchmark_playwright_ok: ${yesNo(status.providerPublicBenchmarkPlaywrightOk)}`,
    `provider_public_benchmark_agent_may_run_unattended: ${yesNo(status.providerPublicBenchmarkAgentMayRunUnattended)}`,
    `provider_public_benchmark_starts_browser: ${yesNo(status.providerPublicBenchmarkStartsBrowser)}`,
    `provider_public_benchmark_reads_browser_storage: ${yesNo(status.providerPublicBenchmarkReadsBrowserStorage)}`,
    `provider_public_benchmark_returns_page_content: ${yesNo(status.providerPublicBenchmarkReturnsPageContent)}`,
    `provider_public_benchmark_command: ${compact(status.providerPublicBenchmarkCommand)}`,
    `provider_lightpanda_ready_for_public_benchmark: ${yesNo(status.providerLightpandaReadyForPublicBenchmark)}`,
    `provider_lightpanda_benchmark_agent_may_run_unattended: ${yesNo(status.providerLightpandaBenchmarkAgentMayRunUnattended)}`,
    `provider_lightpanda_benchmark_starts_browser: ${yesNo(status.providerLightpandaBenchmarkStartsBrowser)}`,
    `provider_lightpanda_benchmark_reads_browser_storage: ${yesNo(status.providerLightpandaBenchmarkReadsBrowserStorage)}`,
    `provider_lightpanda_benchmark_returns_page_content: ${yesNo(status.providerLightpandaBenchmarkReturnsPageContent)}`,
    `provider_lightpanda_benchmark_command: ${compact(status.providerLightpandaBenchmarkCommand)}`,
    `provider_playwright_ready_for_public_smoke: ${yesNo(status.providerPlaywrightReadyForPublicSmoke)}`,
    `provider_playwright_ready_for_authenticated_default: ${yesNo(status.providerPlaywrightReadyForAuthenticatedDefault)}`,
    `provider_playwright_storage_state_sensitive: ${yesNo(status.providerPlaywrightStorageStateSensitive)}`,
    `provider_playwright_smoke_command: ${compact(status.providerPlaywrightSmokeCommand)}`,
    `provider_playwright_public_smoke_proof_exists: ${yesNo(status.providerPlaywrightPublicSmokeProofExists)}`,
    `provider_playwright_public_smoke_proof_ok: ${yesNo(status.providerPlaywrightPublicSmokeProofOk)}`,
    `provider_playwright_public_smoke_proof_path: ${compact(status.providerPlaywrightPublicSmokeProofPath)}`,
    `provider_playwright_public_smoke_proof_heading_count: ${status.providerPlaywrightPublicSmokeProofHeadingCount ?? 0}`,
    `provider_playwright_public_smoke_proof_link_count: ${status.providerPlaywrightPublicSmokeProofLinkCount ?? 0}`,
    `provider_playwright_smoke_proof_command: ${compact(status.providerPlaywrightSmokeProofCommand)}`,
    `provider_playwright_smoke_proof_agent_may_run_unattended: ${yesNo(status.providerPlaywrightSmokeProofAgentMayRunUnattended)}`,
    `provider_playwright_smoke_proof_starts_browser: ${yesNo(status.providerPlaywrightSmokeProofStartsBrowser)}`,
    `provider_playwright_smoke_proof_reads_browser_storage: ${yesNo(status.providerPlaywrightSmokeProofReadsBrowserStorage)}`,
    `provider_playwright_smoke_proof_returns_page_content: ${yesNo(status.providerPlaywrightSmokeProofReturnsPageContent)}`,
    `provider_selenium_ready_for_local_smoke: ${yesNo(status.providerSeleniumReadyForLocalSmoke)}`,
    `provider_selenium_smoke_agent_may_run_unattended: ${yesNo(status.providerSeleniumSmokeAgentMayRunUnattended)}`,
    `provider_selenium_smoke_starts_browser: ${yesNo(status.providerSeleniumSmokeStartsBrowser)}`,
    `provider_selenium_smoke_command: ${compact(status.providerSeleniumSmokeCommand)}`,
    `provider_doctor_opens_browser: ${yesNo(status.providerDoctorOpensBrowser)}`,
    `provider_doctor_starts_capture: ${yesNo(status.providerDoctorStartsCapture)}`,
    `provider_doctor_reads_browser_storage: ${yesNo(status.providerDoctorReadsBrowserStorage)}`,
    `provider_doctor_returns_page_content: ${yesNo(status.providerDoctorReturnsPageContent)}`,
    `provider_doctor_may_run_unattended: ${yesNo(status.providerDoctorMayRunUnattended)}`
  ];
  if (status.parseError) lines.push(`parse_error: ${compact(status.parseError)}`);
  if (shell(status.agentSafeNextCommand)) lines.push(`agent_safe_next_command: ${shell(status.agentSafeNextCommand)}`);
  if (shell(status.targetApprovalPreflightCommand)) lines.push(`target_approval_preflight_command: ${shell(status.targetApprovalPreflightCommand)}`);
  if (shell(status.targetProofPlanCommand)) lines.push(`target_proof_plan_command: ${shell(status.targetProofPlanCommand)}`);
  if (shell(status.targetApprovalResumeWriteCommand)) lines.push(`target_approval_resume_write_command: ${shell(status.targetApprovalResumeWriteCommand)}`);
  if (shell(status.targetApprovalResumeStatusCommand)) lines.push(`target_approval_resume_status_command: ${shell(status.targetApprovalResumeStatusCommand)}`);
  if (shell(status.targetApprovalResumeWatchCommand)) lines.push(`target_approval_resume_watch_command: ${shell(status.targetApprovalResumeWatchCommand)}`);
  if (shell(status.providerDoctorStatusCommand)) lines.push(`provider_doctor_status_command: ${shell(status.providerDoctorStatusCommand)}`);
  if (shell(status.operatorResumeCommand)) lines.push(`operator_resume_command: ${shell(status.operatorResumeCommand)}`);
  if (shell(status.completionProofBundleCommand)) lines.push(`completion_proof_bundle_command: ${shell(status.completionProofBundleCommand)}`);
  if (shell(status.completionProofBundleWithAuditCommand)) lines.push(`completion_proof_bundle_with_audit_command: ${shell(status.completionProofBundleWithAuditCommand)}`);
  if (shell(status.compactCommandAuditAllCommand)) lines.push(`compact_command_audit_all_command: ${shell(status.compactCommandAuditAllCommand)}`);
  if (shell(status.objectiveCompletionStrictCommand)) lines.push(`objective_completion_strict_command: ${shell(status.objectiveCompletionStrictCommand)}`);
  if (shell(status.refreshCommand)) lines.push(`refresh_command: ${shell(status.refreshCommand)}`);
  lines.push(`next: ${status.next}`);
  return `${lines.join('\n')}\n`;
}
