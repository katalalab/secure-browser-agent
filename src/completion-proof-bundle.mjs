import fs from 'node:fs';
import path from 'node:path';
import { buildObjectiveCompletionAudit } from './objective-completion-audit.mjs';
import { buildProofGateStatus } from './proof-gate-status.mjs';
import { buildReadinessAudit } from './readiness-audit.mjs';
import { buildTargetApprovalPreflight } from './target-approval-pack.mjs';
import { buildTargetProofPlan } from './target-proof.mjs';
import { buildCompactCommandAudit } from './compact-command-audit.mjs';
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

function safeRunPath(rootDir, outPath, fallback = 'operator/completion-proof-bundle-latest.json') {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || fallback).replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid completion proof bundle output path: ${outPath}`);
  return outputPath;
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
    requiresOperatorApproval: explicitBoolean(saved?.operatorResumeRequiresOperatorApproval) ?? hasOperatorResumeCommand,
    opensBrowser: explicitBoolean(saved?.operatorResumeOpensBrowser) ?? hasOperatorResumeCommand,
    startsCapture: explicitBoolean(saved?.operatorResumeStartsCapture) ?? hasOperatorResumeCommand,
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

function targetDirCommandArg(rootDir, targetDir) {
  if (!targetDir) return '';
  const text = String(targetDir);
  if (!path.isAbsolute(text)) return text;
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(text);
  if (resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    return path.relative(resolvedRoot, resolvedTarget);
  }
  return text;
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

function buildTargetProofPlanCommand(rootDir, preflight) {
  const targetDirArg = targetDirCommandArg(rootDir, preflight?.targetDir || '');
  if (targetDirArg) {
    return command(['node', 'src/cli.mjs', 'target-proof-plan', targetDirArg, '--real-external', '--format', 'compact']);
  }
  return preflight?.proofPlanCommand || null;
}

function missingArtifactIds(source) {
  const artifacts = Array.isArray(source) ? source : [];
  return artifacts.map((item) => item.id || '').filter(Boolean);
}

function readinessRemaining(readiness = {}) {
  if (Array.isArray(readiness.remaining)) {
    return readiness.remaining.map((item) => item.id || item).filter(Boolean);
  }
  if (Array.isArray(readiness.requirements)) {
    return readiness.requirements
      .filter((item) => item.status !== 'proved')
      .map((item) => item.id || item.requirement || '')
      .filter(Boolean);
  }
  return [];
}

function providerProofFields(providerDoctorStatus = {}) {
  return {
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
    providerLightpandaBenchmarkCommand: providerDoctorStatus.lightpanda?.benchmarkCommand || '',
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
    providerDoctorMayRunUnattended: true
  };
}

function providerCompactLines(source = {}) {
  return [
    `provider_default_backend: ${compact(source.providerDefaultBackend)}`,
    `provider_default_agent_interface: ${compact(source.providerDefaultAgentInterface)}`,
    `provider_public_benchmark_proof_exists: ${yesNo(source.providerPublicBenchmarkProofExists)}`,
    `provider_public_benchmark_proof_ok: ${yesNo(source.providerPublicBenchmarkProofOk)}`,
    `provider_public_benchmark_proof_path: ${compact(source.providerPublicBenchmarkProofPath)}`,
    `provider_public_benchmark_fastest_measured_provider: ${compact(source.providerPublicBenchmarkFastestMeasuredProvider)}`,
    `provider_public_benchmark_direct_cdp_cold_ok: ${yesNo(source.providerPublicBenchmarkDirectCdpColdOk)}`,
    `provider_public_benchmark_direct_cdp_daemon_ok: ${yesNo(source.providerPublicBenchmarkDirectCdpDaemonOk)}`,
    `provider_public_benchmark_agent_browser_chrome_ok: ${yesNo(source.providerPublicBenchmarkAgentBrowserChromeOk)}`,
    `provider_public_benchmark_playwright_ok: ${yesNo(source.providerPublicBenchmarkPlaywrightOk)}`,
    `provider_public_benchmark_agent_may_run_unattended: ${yesNo(source.providerPublicBenchmarkAgentMayRunUnattended)}`,
    `provider_public_benchmark_starts_browser: ${yesNo(source.providerPublicBenchmarkStartsBrowser)}`,
    `provider_public_benchmark_reads_browser_storage: ${yesNo(source.providerPublicBenchmarkReadsBrowserStorage)}`,
    `provider_public_benchmark_returns_page_content: ${yesNo(source.providerPublicBenchmarkReturnsPageContent)}`,
    `provider_public_benchmark_command: ${compact(source.providerPublicBenchmarkCommand)}`,
    `provider_lightpanda_ready_for_public_benchmark: ${yesNo(source.providerLightpandaReadyForPublicBenchmark)}`,
    `provider_lightpanda_benchmark_agent_may_run_unattended: ${yesNo(source.providerLightpandaBenchmarkAgentMayRunUnattended)}`,
    `provider_lightpanda_benchmark_starts_browser: ${yesNo(source.providerLightpandaBenchmarkStartsBrowser)}`,
    `provider_lightpanda_benchmark_reads_browser_storage: ${yesNo(source.providerLightpandaBenchmarkReadsBrowserStorage)}`,
    `provider_lightpanda_benchmark_returns_page_content: ${yesNo(source.providerLightpandaBenchmarkReturnsPageContent)}`,
    `provider_lightpanda_benchmark_command: ${compact(source.providerLightpandaBenchmarkCommand)}`,
    `provider_playwright_ready_for_public_smoke: ${yesNo(source.providerPlaywrightReadyForPublicSmoke)}`,
    `provider_playwright_ready_for_authenticated_default: ${yesNo(source.providerPlaywrightReadyForAuthenticatedDefault)}`,
    `provider_playwright_storage_state_sensitive: ${yesNo(source.providerPlaywrightStorageStateSensitive)}`,
    `provider_playwright_smoke_command: ${compact(source.providerPlaywrightSmokeCommand)}`,
    `provider_playwright_public_smoke_proof_exists: ${yesNo(source.providerPlaywrightPublicSmokeProofExists)}`,
    `provider_playwright_public_smoke_proof_ok: ${yesNo(source.providerPlaywrightPublicSmokeProofOk)}`,
    `provider_playwright_public_smoke_proof_path: ${compact(source.providerPlaywrightPublicSmokeProofPath)}`,
    `provider_playwright_public_smoke_proof_heading_count: ${source.providerPlaywrightPublicSmokeProofHeadingCount ?? 0}`,
    `provider_playwright_public_smoke_proof_link_count: ${source.providerPlaywrightPublicSmokeProofLinkCount ?? 0}`,
    `provider_playwright_smoke_proof_command: ${compact(source.providerPlaywrightSmokeProofCommand)}`,
    `provider_playwright_smoke_proof_agent_may_run_unattended: ${yesNo(source.providerPlaywrightSmokeProofAgentMayRunUnattended)}`,
    `provider_playwright_smoke_proof_starts_browser: ${yesNo(source.providerPlaywrightSmokeProofStartsBrowser)}`,
    `provider_playwright_smoke_proof_reads_browser_storage: ${yesNo(source.providerPlaywrightSmokeProofReadsBrowserStorage)}`,
    `provider_playwright_smoke_proof_returns_page_content: ${yesNo(source.providerPlaywrightSmokeProofReturnsPageContent)}`,
    `provider_selenium_ready_for_local_smoke: ${yesNo(source.providerSeleniumReadyForLocalSmoke)}`,
    `provider_selenium_smoke_agent_may_run_unattended: ${yesNo(source.providerSeleniumSmokeAgentMayRunUnattended)}`,
    `provider_selenium_smoke_starts_browser: ${yesNo(source.providerSeleniumSmokeStartsBrowser)}`,
    `provider_selenium_smoke_command: ${compact(source.providerSeleniumSmokeCommand)}`,
    `provider_doctor_opens_browser: ${yesNo(source.providerDoctorOpensBrowser)}`,
    `provider_doctor_starts_capture: ${yesNo(source.providerDoctorStartsCapture)}`,
    `provider_doctor_reads_browser_storage: ${yesNo(source.providerDoctorReadsBrowserStorage)}`,
    `provider_doctor_returns_page_content: ${yesNo(source.providerDoctorReturnsPageContent)}`,
    `provider_doctor_may_run_unattended: ${yesNo(source.providerDoctorMayRunUnattended)}`
  ];
}

async function maybeBuildTargetProofPlan(preflight, options = {}) {
  if (options.targetProofPlan) return options.targetProofPlan;
  const targetDir = options.targetDir || preflight?.targetDir || '';
  if (!targetDir || !fs.existsSync(targetDir)) return null;
  try {
    return await buildTargetProofPlan(targetDir, {
      ...options,
      realExternal: true
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function maybeBuildCompactCommandAudit(options = {}) {
  if (options.compactCommandAudit) return options.compactCommandAudit;
  if (options.includeCompactCommandAudit || options['include-compact-command-audit']) {
    return buildCompactCommandAudit({
      ...options,
      source: 'all'
    });
  }
  return {
    complete: false,
    safeForStrictAgentLoops: false,
    skipped: true,
    commandCount: 0,
    riskyCommandCount: 0,
    unclassifiedRiskCount: 0,
    missingApprovalCount: 0,
    staleHandoffConflictCount: 0
  };
}

export async function buildCompletionProofBundle(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const candidate = options.candidate || 'github';
  const readiness = options.readiness || buildReadinessAudit({
    ...options,
    rootDir
  });
  const completionAudit = options.completionAudit || await buildObjectiveCompletionAudit({
    ...options,
    rootDir,
    generatedAt
  });
  const proofGate = options.proofGateStatus || await buildProofGateStatus({
    ...options,
    rootDir,
    generatedAt,
    write: false,
    out: ''
  });
  const preflight = options.targetApprovalPreflight || await buildTargetApprovalPreflight({
    ...options,
    rootDir,
    generatedAt,
    candidate
  });
  const compactCommandAudit = await maybeBuildCompactCommandAudit({
    ...options,
    rootDir,
    generatedAt,
  });
  const providerDoctorStatus = options.providerDoctorStatus || buildProviderDoctorStatus({
    ...options,
    rootDir,
    generatedAt
  });
  const targetProofPlan = await maybeBuildTargetProofPlan(preflight, options);
  const proofPlanReady = Boolean(targetProofPlan?.currentState?.proofReady);
  const complete = Boolean(
    readiness.completeAgainstObjective
      && completionAudit.complete
      && proofGate.complete
      && preflight.complete
      && compactCommandAudit.safeForStrictAgentLoops
      && proofPlanReady
  );
  const proofPlanMissing = targetProofPlan?.currentState?.missingArtifacts || [];
  const preflightMissing = preflight.missingArtifacts || [];
  const missingArtifacts = missingArtifactIds(proofPlanMissing.length ? proofPlanMissing : preflightMissing);
  const readinessRemainingIds = readinessRemaining(readiness);
  const nextArtifactAction = proofGate.nextArtifactAction || completionAudit.nextAction?.nextArtifactAction || '';
  const nextArtifactBlocker = proofGate.nextArtifactBlocker || completionAudit.nextAction?.nextArtifactBlocker || '';
  const artifactCommandCovers = Array.isArray(proofGate.artifactCommandCovers)
    ? proofGate.artifactCommandCovers
    : Array.isArray(completionAudit.nextAction?.artifactCommandCovers)
      ? completionAudit.nextAction.artifactCommandCovers
      : [];

  const bundle = {
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
    complete,
    verdict: complete ? 'complete' : 'not-complete',
    candidate,
    targetDir: preflight.targetDir || proofGate.targetDir || targetProofPlan?.dir || '',
    readinessComplete: Boolean(readiness.completeAgainstObjective),
    readinessRemainingCount: readinessRemainingIds.length,
    readinessRemaining: readinessRemainingIds,
    objectiveCompletionComplete: Boolean(completionAudit.complete),
    objectiveRemainingCount: completionAudit.finalGate?.remainingCount ?? completionAudit.remaining?.length ?? 0,
    proofGateComplete: Boolean(proofGate.complete),
    proofGateStatus: proofGate.status || '',
    targetApprovalComplete: Boolean(preflight.complete),
    targetApprovalNextAction: preflight.nextAction || '',
    targetApprovalAgentSafeCommandId: preflight.agentSafeCommandId || 'none',
    targetApprovalOperatorApprovalRequired: Boolean(preflight.operatorApprovalRequired),
    targetApprovalOperatorCommandOpensBrowser: Boolean(preflight.operatorCommandOpensBrowser),
    targetApprovalOperatorCommandStartsCapture: Boolean(preflight.operatorCommandStartsCapture),
    compactCommandAuditComplete: Boolean(compactCommandAudit.complete),
    compactCommandAuditSafeForStrictAgentLoops: Boolean(compactCommandAudit.safeForStrictAgentLoops),
    compactCommandAuditSkipped: Boolean(compactCommandAudit.skipped),
    compactCommandAuditCommandCount: compactCommandAudit.commandCount ?? 0,
    compactCommandAuditRiskyCommandCount: compactCommandAudit.riskyCommandCount ?? 0,
    compactCommandAuditUnclassifiedRiskCount: compactCommandAudit.unclassifiedRiskCount ?? 0,
    compactCommandAuditMissingApprovalCount: compactCommandAudit.missingApprovalCount ?? 0,
    compactCommandAuditStaleHandoffConflictCount: compactCommandAudit.staleHandoffConflictCount ?? 0,
    compactCommandAuditSourceCount: Array.isArray(compactCommandAudit.sources) ? compactCommandAudit.sources.length : 0,
    compactCommandAuditSources: Array.isArray(compactCommandAudit.sources)
      ? compactCommandAudit.sources.map((source) => source.source || '').filter(Boolean)
      : [],
    ...providerProofFields(providerDoctorStatus),
    operatorResumeRequiresOperatorApproval: Boolean(preflight.operatorApprovalRequired || preflight.operatorCommand),
    operatorResumeOpensBrowser: Boolean(preflight.operatorCommandOpensBrowser),
    operatorResumeStartsCapture: Boolean(preflight.operatorCommandStartsCapture),
    operatorResumeAgentMayRunUnattended: false,
    agentSafeNextCommandId: complete ? 'none' : 'agent-preflight',
    agentSafeNextMayRunUnattended: !complete,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    targetApprovalPreflightMayRunUnattended: true,
    targetApprovalPreflightOpensBrowser: false,
    targetApprovalPreflightStartsCapture: false,
    targetApprovalPreflightReadsBrowserStorage: false,
    targetApprovalPreflightReturnsPageContent: false,
    targetProofPlanMayRunUnattended: Boolean(preflight.proofPlanCommand || preflight.targetDir),
    targetProofPlanOpensBrowser: false,
    targetProofPlanStartsCapture: false,
    targetProofPlanReadsBrowserStorage: false,
    targetProofPlanReturnsPageContent: false,
    targetApprovalResumeWriteMayRunUnattended: Boolean(preflight.approvalResumeWriteCommand),
    targetApprovalResumeWriteOpensBrowser: false,
    targetApprovalResumeWriteStartsCapture: false,
    targetApprovalResumeWatchMayRunUnattended: Boolean(preflight.approvalResumeWatchCommand),
    targetApprovalResumeWatchOpensBrowser: false,
    targetApprovalResumeWatchStartsCapture: false,
    targetApprovalResumeWatchRequiresOperatorApproval: false,
    targetProofPlanAvailable: Boolean(targetProofPlan && !targetProofPlan.error),
    targetProofPlanError: targetProofPlan?.error || '',
    targetProofReady: proofPlanReady,
    authState: targetProofPlan?.currentState?.authState || preflight.authState || proofGate.authState || '',
    authUsable: Boolean(targetProofPlan?.currentState?.authUsable ?? preflight.authUsable ?? proofGate.authUsable),
    captureBlocked: Boolean(preflight.captureBlocked ?? proofGate.operatorGuidance?.captureBlocked),
    automationBlocker: preflight.automationBlocker || proofGate.operatorGuidance?.automationBlocker || '',
    nextArtifactAction,
    nextArtifactBlocker,
    artifactCommandCovers,
    missingArtifactCount: missingArtifacts.length,
    missingArtifacts,
    acceptedExternalProofs: preflight.acceptedExternalProofs ?? proofGate.acceptedExternalProofCount ?? readiness.acceptedExternalProofs ?? 0,
    commands: {
      completionProofBundle: command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', candidate, '--include-compact-command-audit', '--format', 'compact']),
      completionProofBundleWrite: command([
        'node',
        'src/cli.mjs',
        'completion-proof-bundle',
        '--candidate',
        candidate,
        '--include-compact-command-audit',
        '--write',
        '--out',
        'operator/completion-proof-bundle-latest.json',
        '--format',
        'compact'
      ]),
      completionProofBundleStatus: command(['node', 'src/cli.mjs', 'completion-proof-bundle-status', '--in', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']),
      agentControlPlane: command(['node', 'src/cli.mjs', 'agent-control-plane', '--task', 'auth-proof', '--format', 'compact']),
      agentControlPlaneWrite: command(['node', 'src/cli.mjs', 'agent-control-plane', '--task', 'auth-proof', '--write', '--out', 'operator/agent-control-plane-latest.json', '--format', 'compact']),
      agentControlPlaneStatus: command(['node', 'src/cli.mjs', 'agent-control-plane-status', '--in', 'operator/agent-control-plane-latest.json', '--format', 'compact']),
      readiness: command(['node', 'src/cli.mjs', 'readiness-audit', '--format', 'compact']),
      objectiveCompletion: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--format', 'compact']),
      objectiveCompletionStrict: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
      compactCommandAuditAll: command(['node', 'src/cli.mjs', 'compact-command-audit', '--source', 'all', '--strict', '--format', 'compact']),
      providerDoctorStatus: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']),
      proofGateStatus: command(['node', 'src/cli.mjs', 'proof-gate-status', '--format', 'compact']),
	      agentPreflight: preflight.agentPreflightCommand || command(['node', 'src/cli.mjs', 'agent-preflight', '--candidate', candidate, '--real-external', '--format', 'compact']),
      targetApprovalPreflight: preflight.statusCommand || command(['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', candidate, '--real-external', '--format', 'compact']),
      targetProofPlan: buildTargetProofPlanCommand(rootDir, preflight),
      targetApprovalResumeWrite: preflight.approvalResumeWriteCommand || null,
      targetApprovalResumeStatus: preflight.approvalResumeStatusCommand || null,
      targetApprovalResumeWatch: preflight.approvalResumeWatchCommand || null,
      operatorResume: preflight.operatorCommand || null
    },
    next: complete
      ? 'Objective proof bundle is complete.'
      : 'Completion remains blocked until a real external authenticated target proof is accepted.'
  };
  if (options.write || options.out || options.output) {
    const outputPath = safeRunPath(rootDir, options.out || options.output);
    writeJson(outputPath, bundle);
    bundle.outputPath = outputPath;
  }
  return bundle;
}

export function buildCompletionProofBundleStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputPath = safeRunPath(rootDir, options.in || options.input || 'operator/completion-proof-bundle-latest.json');
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
  const inputRelative = path.relative(path.resolve(rootDir, 'runs'), inputPath);
  const refreshCommand = watchRefreshCommand({
    in: inputRelative,
    out: inputRelative,
    staleAfterSeconds: options.staleAfterSeconds ?? options['stale-after-seconds'],
    candidate
  });
  const refreshNeeded = !exists || !parseOk || stale;
  const objectiveSafeNext = refreshNeeded ? null : currentObjectiveAuditSafeNext(rootDir, options);
  const agentSafeNextCommand = refreshNeeded
    ? refreshCommand
    : objectiveSafeNext?.command
      ? objectiveSafeNext.command
    : parseOk
		      ? saved?.commands?.agentPreflight || command(['node', 'src/cli.mjs', 'agent-preflight', '--candidate', candidate, '--real-external', '--format', 'compact'])
    : null;
  const targetApprovalPreflightCommand = parseOk
    ? saved?.commands?.targetApprovalPreflight || command(['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', candidate, '--real-external', '--format', 'compact'])
    : null;
  const targetProofPlanCommand = parseOk ? saved?.commands?.targetProofPlan || null : null;
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
    targetDir: saved?.targetDir || '',
    readinessRemainingCount: parseOk ? saved.readinessRemainingCount ?? 0 : 0,
    readinessRemaining: parseOk && Array.isArray(saved.readinessRemaining) ? saved.readinessRemaining : [],
    missingArtifacts: parseOk && Array.isArray(saved.missingArtifacts) ? saved.missingArtifacts : [],
    missingArtifactCount: parseOk ? saved.missingArtifactCount ?? (Array.isArray(saved.missingArtifacts) ? saved.missingArtifacts.length : 0) : 0,
    nextArtifactAction: saved?.nextArtifactAction || '',
    nextArtifactBlocker: saved?.nextArtifactBlocker || '',
    artifactCommandCovers: parseOk && Array.isArray(saved.artifactCommandCovers) ? saved.artifactCommandCovers : [],
    authState: saved?.authState || '',
    authUsable: Boolean(saved?.authUsable),
    captureBlocked: Boolean(saved?.captureBlocked),
    automationBlocker: saved?.automationBlocker || '',
    operatorResumeRequiresOperatorApproval: operatorResumeSafety.requiresOperatorApproval,
    operatorResumeOpensBrowser: operatorResumeSafety.opensBrowser,
    operatorResumeStartsCapture: operatorResumeSafety.startsCapture,
    operatorResumeAgentMayRunUnattended: operatorResumeSafety.agentMayRunUnattended,
    compactCommandAuditComplete: Boolean(saved?.compactCommandAuditComplete),
    compactCommandAuditSafeForStrictAgentLoops: Boolean(saved?.compactCommandAuditSafeForStrictAgentLoops),
    compactCommandAuditSkipped: Boolean(saved?.compactCommandAuditSkipped),
    compactCommandAuditCommandCount: saved?.compactCommandAuditCommandCount ?? 0,
    compactCommandAuditRiskyCommandCount: saved?.compactCommandAuditRiskyCommandCount ?? 0,
    compactCommandAuditUnclassifiedRiskCount: saved?.compactCommandAuditUnclassifiedRiskCount ?? 0,
    compactCommandAuditMissingApprovalCount: saved?.compactCommandAuditMissingApprovalCount ?? 0,
    compactCommandAuditStaleHandoffConflictCount: saved?.compactCommandAuditStaleHandoffConflictCount ?? 0,
    compactCommandAuditSourceCount: saved?.compactCommandAuditSourceCount ?? (Array.isArray(saved?.compactCommandAuditSources) ? saved.compactCommandAuditSources.length : 0),
    compactCommandAuditSources: Array.isArray(saved?.compactCommandAuditSources) ? saved.compactCommandAuditSources : [],
    ...providerProofFields(parseOk ? {
      defaultBackend: saved?.providerDefaultBackend,
      defaultAgentInterface: saved?.providerDefaultAgentInterface,
      publicBenchmark: {
        exists: saved?.providerPublicBenchmarkProofExists,
        ok: saved?.providerPublicBenchmarkProofOk,
        path: saved?.providerPublicBenchmarkProofPath,
        fastestMeasuredProvider: saved?.providerPublicBenchmarkFastestMeasuredProvider,
        directCdpColdOk: saved?.providerPublicBenchmarkDirectCdpColdOk,
        directCdpDaemonOk: saved?.providerPublicBenchmarkDirectCdpDaemonOk,
        agentBrowserChromeOk: saved?.providerPublicBenchmarkAgentBrowserChromeOk,
        playwrightOk: saved?.providerPublicBenchmarkPlaywrightOk,
        agentMayRunUnattended: saved?.providerPublicBenchmarkAgentMayRunUnattended,
        startsBrowser: saved?.providerPublicBenchmarkStartsBrowser,
        readsBrowserStorage: saved?.providerPublicBenchmarkReadsBrowserStorage,
        returnsPageContent: saved?.providerPublicBenchmarkReturnsPageContent,
        command: saved?.providerPublicBenchmarkCommand
      },
      lightpanda: {
        readyForPublicBenchmark: saved?.providerLightpandaReadyForPublicBenchmark,
        benchmarkAgentMayRunUnattended: saved?.providerLightpandaBenchmarkAgentMayRunUnattended,
        benchmarkStartsBrowser: saved?.providerLightpandaBenchmarkStartsBrowser,
        benchmarkReadsBrowserStorage: saved?.providerLightpandaBenchmarkReadsBrowserStorage,
        benchmarkReturnsPageContent: saved?.providerLightpandaBenchmarkReturnsPageContent,
        benchmarkCommand: saved?.providerLightpandaBenchmarkCommand
      },
      playwright: {
        readyForPublicSmoke: saved?.providerPlaywrightReadyForPublicSmoke,
        readyForAuthenticatedDefault: saved?.providerPlaywrightReadyForAuthenticatedDefault,
        storageStateSensitive: saved?.providerPlaywrightStorageStateSensitive,
        smokeCommand: saved?.providerPlaywrightSmokeCommand,
        publicSmokeProofExists: saved?.providerPlaywrightPublicSmokeProofExists,
        publicSmokeProofOk: saved?.providerPlaywrightPublicSmokeProofOk,
        publicSmokeProofPath: saved?.providerPlaywrightPublicSmokeProofPath,
        publicSmokeProofHeadingCount: saved?.providerPlaywrightPublicSmokeProofHeadingCount,
        publicSmokeProofLinkCount: saved?.providerPlaywrightPublicSmokeProofLinkCount,
        smokeProofCommand: saved?.providerPlaywrightSmokeProofCommand,
        smokeProofAgentMayRunUnattended: saved?.providerPlaywrightSmokeProofAgentMayRunUnattended,
        smokeProofStartsBrowser: saved?.providerPlaywrightSmokeProofStartsBrowser,
        smokeProofReadsBrowserStorage: saved?.providerPlaywrightSmokeProofReadsBrowserStorage,
        smokeProofReturnsPageContent: saved?.providerPlaywrightSmokeProofReturnsPageContent
      },
      selenium: {
        readyForLocalSmoke: saved?.providerSeleniumReadyForLocalSmoke,
        smokeAgentMayRunUnattended: saved?.providerSeleniumSmokeAgentMayRunUnattended,
        smokeStartsBrowser: saved?.providerSeleniumSmokeStartsBrowser,
        smokeCommand: saved?.providerSeleniumSmokeCommand
      }
    } : {}),
    objectiveCompletionAuditExists: Boolean(objectiveSafeNext?.status?.exists),
    objectiveCompletionAuditParseOk: Boolean(objectiveSafeNext?.status?.parseOk),
    objectiveCompletionAuditStale: Boolean(objectiveSafeNext?.status?.stale),
    objectiveCompletionAuditSavedComplete: Boolean(objectiveSafeNext?.status?.savedComplete),
    objectiveCompletionAuditSavedStatus: objectiveSafeNext?.status?.savedStatus || '',
    objectiveCompletionAuditRemainingCount: objectiveSafeNext?.status?.remainingCount ?? 0,
    objectiveCompletionAuditRemaining: Array.isArray(objectiveSafeNext?.status?.remaining) ? objectiveSafeNext.status.remaining : [],
    agentSafeNextCommandId: refreshNeeded
      ? 'completion-proof-bundle-refresh'
      : objectiveSafeNext?.status?.agentSafeNextCommandId
        ? objectiveSafeNext.status.agentSafeNextCommandId
        : parseOk && !saved.complete
          ? saved.agentSafeNextCommandId || 'agent-preflight'
          : 'none',
    agentSafeNextMayRunUnattended: Boolean(refreshNeeded || objectiveSafeNext?.status?.agentSafeNextMayRunUnattended || (parseOk && !saved.complete)),
    agentSafeNextOpensBrowser: Boolean(objectiveSafeNext?.status?.agentSafeNextOpensBrowser),
    agentSafeNextStartsCapture: Boolean(objectiveSafeNext?.status?.agentSafeNextStartsCapture),
    agentSafeNextReadsBrowserStorage: Boolean(objectiveSafeNext?.status?.agentSafeNextReadsBrowserStorage),
    agentSafeNextReturnsPageContent: Boolean(objectiveSafeNext?.status?.agentSafeNextReturnsPageContent),
    targetApprovalPreflightMayRunUnattended: Boolean(parseOk),
    targetApprovalPreflightOpensBrowser: false,
    targetApprovalPreflightStartsCapture: false,
    targetApprovalPreflightReadsBrowserStorage: false,
    targetApprovalPreflightReturnsPageContent: false,
    targetProofPlanMayRunUnattended: Boolean(parseOk && targetProofPlanCommand),
    targetProofPlanOpensBrowser: false,
    targetProofPlanStartsCapture: false,
    targetProofPlanReadsBrowserStorage: false,
    targetProofPlanReturnsPageContent: false,
    targetApprovalResumeWriteMayRunUnattended: Boolean(parseOk && saved?.commands?.targetApprovalResumeWrite),
    targetApprovalResumeWriteOpensBrowser: false,
    targetApprovalResumeWriteStartsCapture: false,
    targetApprovalResumeWatchMayRunUnattended: Boolean(parseOk && saved?.commands?.targetApprovalResumeWatch),
    targetApprovalResumeWatchOpensBrowser: false,
    targetApprovalResumeWatchStartsCapture: false,
    targetApprovalResumeWatchRequiresOperatorApproval: false,
    acceptedExternalProofs: saved?.acceptedExternalProofs ?? 0,
    agentSafeNextCommand,
    targetApprovalPreflightCommand,
    targetProofPlanCommand,
    targetApprovalResumeWriteCommand: saved?.commands?.targetApprovalResumeWrite || null,
    targetApprovalResumeStatusCommand: saved?.commands?.targetApprovalResumeStatus || null,
    targetApprovalResumeWatchCommand: saved?.commands?.targetApprovalResumeWatch || null,
    operatorResumeCommand: operatorResumeSafety.command,
    objectiveCompletionStrictCommand: saved?.commands?.objectiveCompletionStrict || command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
    compactCommandAuditAllCommand: saved?.commands?.compactCommandAuditAll || command(['node', 'src/cli.mjs', 'compact-command-audit', '--source', 'all', '--strict', '--format', 'compact']),
    providerDoctorStatusCommand: saved?.commands?.providerDoctorStatus || command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']),
    refreshCommand,
    next: !exists
      ? 'Write a fresh completion proof bundle.'
      : !parseOk
        ? 'Refresh the completion proof bundle; saved JSON could not be parsed.'
        : stale
          ? 'Refresh the stale completion proof bundle.'
          : saved.complete
            ? 'Saved completion proof bundle is complete.'
            : 'Saved completion proof bundle is incomplete; continue real external proof lane.'
  };
}

function watchRefreshCommand(options = {}) {
  const args = ['node', 'src/cli.mjs', 'completion-proof-bundle-watch', '--run'];
  if (options.in) args.push('--in', options.in);
  if (options.out) args.push('--out', options.out);
  if (options.staleAfterSeconds) args.push('--stale-after-seconds', String(options.staleAfterSeconds));
  if (options.candidate) args.push('--candidate', options.candidate);
  args.push('--format', 'compact');
  return command(args);
}

export async function buildCompletionProofBundleWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputPath = safeRunPath(rootDir, options.in || options.input || 'operator/completion-proof-bundle-latest.json');
  const outputPath = safeRunPath(
    rootDir,
    options.out || options.output || path.relative(path.resolve(rootDir, 'runs'), inputPath)
  );
  const inputRelative = path.relative(path.resolve(rootDir, 'runs'), inputPath);
  const outputRelative = path.relative(path.resolve(rootDir, 'runs'), outputPath);
  const candidate = options.candidate || 'github';
  const staleAfterSeconds = options.staleAfterSeconds ?? options['stale-after-seconds'];
  const statusBefore = buildCompletionProofBundleStatus({
    rootDir,
    in: inputRelative,
    staleAfterSeconds,
    nowMs: options.nowMs,
    candidate
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
    blockedReason: runRequested && !allowedToRun ? 'saved-completion-proof-bundle-is-fresh' : '',
    statusBefore,
    statusAfter: null,
    refreshCommand: watchRefreshCommand({
      in: inputRelative,
      out: outputRelative,
      staleAfterSeconds,
      candidate
    })
  };
  if (!allowedToRun) return watch;

  const refreshed = options.refreshedBundle || await buildCompletionProofBundle({
    ...options,
    rootDir,
    candidate,
    includeCompactCommandAudit: true,
    write: false,
    out: ''
  });
  writeJson(outputPath, {
    ...refreshed,
    outputPath
  });
  watch.executed = true;
  watch.status = 'refreshed';
  watch.statusAfter = buildCompletionProofBundleStatus({
    rootDir,
    in: outputRelative,
    staleAfterSeconds,
    candidate
  });
  return watch;
}

export function formatCompletionProofBundleCompact(bundle) {
  const lines = [
    `safe_mode: ${yesNo(bundle.safeMode)}`,
    `status_only: ${yesNo(bundle.statusOnly)}`,
    `destructive_actions: ${yesNo(bundle.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(bundle.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(bundle.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(bundle.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(bundle.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(bundle.pageContentReturned)}`,
    `complete: ${yesNo(bundle.complete)}`,
    `verdict: ${compact(bundle.verdict)}`,
    `candidate: ${compact(bundle.candidate)}`,
    `target_dir: ${compact(rootRelativePath(bundle.rootDir, bundle.targetDir))}`,
    `readiness_complete: ${yesNo(bundle.readinessComplete)}`,
    `readiness_remaining_count: ${bundle.readinessRemainingCount}`,
    `readiness_remaining: ${bundle.readinessRemaining.join(',') || 'none'}`,
    `objective_completion_complete: ${yesNo(bundle.objectiveCompletionComplete)}`,
    `objective_remaining_count: ${bundle.objectiveRemainingCount}`,
    `proof_gate_complete: ${yesNo(bundle.proofGateComplete)}`,
    `proof_gate_status: ${compact(bundle.proofGateStatus)}`,
    `target_approval_complete: ${yesNo(bundle.targetApprovalComplete)}`,
    `target_approval_next_action: ${compact(bundle.targetApprovalNextAction)}`,
    `target_approval_agent_safe_command_id: ${compact(bundle.targetApprovalAgentSafeCommandId)}`,
    `target_approval_operator_approval_required: ${yesNo(bundle.targetApprovalOperatorApprovalRequired)}`,
    `target_approval_operator_command_opens_browser: ${yesNo(bundle.targetApprovalOperatorCommandOpensBrowser)}`,
    `target_approval_operator_command_starts_capture: ${yesNo(bundle.targetApprovalOperatorCommandStartsCapture)}`,
    `compact_command_audit_complete: ${yesNo(bundle.compactCommandAuditComplete)}`,
    `compact_command_audit_safe_for_strict_agent_loops: ${yesNo(bundle.compactCommandAuditSafeForStrictAgentLoops)}`,
    `compact_command_audit_skipped: ${yesNo(bundle.compactCommandAuditSkipped)}`,
    `compact_command_audit_command_count: ${bundle.compactCommandAuditCommandCount}`,
    `compact_command_audit_risky_command_count: ${bundle.compactCommandAuditRiskyCommandCount}`,
    `compact_command_audit_unclassified_risk_count: ${bundle.compactCommandAuditUnclassifiedRiskCount}`,
    `compact_command_audit_missing_approval_count: ${bundle.compactCommandAuditMissingApprovalCount}`,
    `compact_command_audit_stale_handoff_conflict_count: ${bundle.compactCommandAuditStaleHandoffConflictCount}`,
    `compact_command_audit_source_count: ${bundle.compactCommandAuditSourceCount}`,
    `compact_command_audit_sources: ${bundle.compactCommandAuditSources.join(',') || 'none'}`,
    ...providerCompactLines(bundle),
    `operator_resume_requires_operator_approval: ${yesNo(bundle.operatorResumeRequiresOperatorApproval)}`,
    `operator_resume_opens_browser: ${yesNo(bundle.operatorResumeOpensBrowser)}`,
    `operator_resume_starts_capture: ${yesNo(bundle.operatorResumeStartsCapture)}`,
    `operator_resume_agent_may_run_unattended: ${yesNo(bundle.operatorResumeAgentMayRunUnattended)}`,
    `agent_safe_next_command_id: ${compact(bundle.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(bundle.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(bundle.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(bundle.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(bundle.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(bundle.agentSafeNextReturnsPageContent)}`,
    `target_approval_preflight_may_run_unattended: ${yesNo(bundle.targetApprovalPreflightMayRunUnattended)}`,
    `target_approval_preflight_opens_browser: ${yesNo(bundle.targetApprovalPreflightOpensBrowser)}`,
    `target_approval_preflight_starts_capture: ${yesNo(bundle.targetApprovalPreflightStartsCapture)}`,
    `target_approval_preflight_reads_browser_storage: ${yesNo(bundle.targetApprovalPreflightReadsBrowserStorage)}`,
    `target_approval_preflight_returns_page_content: ${yesNo(bundle.targetApprovalPreflightReturnsPageContent)}`,
    `target_proof_plan_may_run_unattended: ${yesNo(bundle.targetProofPlanMayRunUnattended)}`,
    `target_proof_plan_opens_browser: ${yesNo(bundle.targetProofPlanOpensBrowser)}`,
    `target_proof_plan_starts_capture: ${yesNo(bundle.targetProofPlanStartsCapture)}`,
    `target_proof_plan_reads_browser_storage: ${yesNo(bundle.targetProofPlanReadsBrowserStorage)}`,
    `target_proof_plan_returns_page_content: ${yesNo(bundle.targetProofPlanReturnsPageContent)}`,
    `target_approval_resume_write_may_run_unattended: ${yesNo(bundle.targetApprovalResumeWriteMayRunUnattended)}`,
    `target_approval_resume_write_opens_browser: ${yesNo(bundle.targetApprovalResumeWriteOpensBrowser)}`,
    `target_approval_resume_write_starts_capture: ${yesNo(bundle.targetApprovalResumeWriteStartsCapture)}`,
    `target_approval_resume_watch_may_run_unattended: ${yesNo(bundle.targetApprovalResumeWatchMayRunUnattended)}`,
    `target_approval_resume_watch_agent_may_run_unattended: ${yesNo(bundle.targetApprovalResumeWatchMayRunUnattended)}`,
    `target_approval_resume_watch_opens_browser: ${yesNo(bundle.targetApprovalResumeWatchOpensBrowser)}`,
    `target_approval_resume_watch_starts_capture: ${yesNo(bundle.targetApprovalResumeWatchStartsCapture)}`,
    `target_approval_resume_watch_requires_operator_approval: ${yesNo(bundle.targetApprovalResumeWatchRequiresOperatorApproval)}`,
    `target_proof_plan_available: ${yesNo(bundle.targetProofPlanAvailable)}`,
    `target_proof_ready: ${yesNo(bundle.targetProofReady)}`,
    `auth_state: ${compact(bundle.authState)}`,
    `auth_usable: ${yesNo(bundle.authUsable)}`,
    `capture_blocked: ${yesNo(bundle.captureBlocked)}`,
    `automation_blocker: ${compact(bundle.automationBlocker)}`,
    `accepted_external_proofs: ${bundle.acceptedExternalProofs}`,
    `next_artifact_action: ${compact(bundle.nextArtifactAction)}`,
    `next_artifact_blocker: ${compact(bundle.nextArtifactBlocker)}`,
    `artifact_command_covers: ${bundle.artifactCommandCovers.join(',') || 'none'}`,
    `missing_artifact_count: ${bundle.missingArtifactCount}`,
    `missing_artifacts: ${bundle.missingArtifacts.join(',') || 'none'}`
  ];
  if (bundle.targetProofPlanError) lines.push(`target_proof_plan_error: ${compact(bundle.targetProofPlanError)}`);
  if (shell(bundle.commands?.completionProofBundle)) lines.push(`completion_proof_bundle_command: ${shell(bundle.commands.completionProofBundle)}`);
  if (shell(bundle.commands?.completionProofBundleWrite)) lines.push(`completion_proof_bundle_write_command: ${shell(bundle.commands.completionProofBundleWrite)}`);
  if (shell(bundle.commands?.completionProofBundleStatus)) lines.push(`completion_proof_bundle_status_command: ${shell(bundle.commands.completionProofBundleStatus)}`);
  if (shell(bundle.commands?.agentControlPlane)) lines.push(`agent_control_plane_command: ${shell(bundle.commands.agentControlPlane)}`);
  if (shell(bundle.commands?.agentControlPlaneWrite)) lines.push(`agent_control_plane_write_command: ${shell(bundle.commands.agentControlPlaneWrite)}`);
  if (shell(bundle.commands?.agentControlPlaneStatus)) lines.push(`agent_control_plane_status_command: ${shell(bundle.commands.agentControlPlaneStatus)}`);
  if (shell(bundle.commands?.readiness)) lines.push(`readiness_command: ${shell(bundle.commands.readiness)}`);
  if (shell(bundle.commands?.objectiveCompletion)) lines.push(`objective_completion_command: ${shell(bundle.commands.objectiveCompletion)}`);
  if (shell(bundle.commands?.objectiveCompletionStrict)) lines.push(`objective_completion_strict_command: ${shell(bundle.commands.objectiveCompletionStrict)}`);
  if (shell(bundle.commands?.compactCommandAuditAll)) lines.push(`compact_command_audit_all_command: ${shell(bundle.commands.compactCommandAuditAll)}`);
  if (shell(bundle.commands?.providerDoctorStatus)) lines.push(`provider_doctor_status_command: ${shell(bundle.commands.providerDoctorStatus)}`);
  if (shell(bundle.commands?.proofGateStatus)) lines.push(`proof_gate_status_command: ${shell(bundle.commands.proofGateStatus)}`);
  if (shell(bundle.commands?.agentPreflight)) lines.push(`agent_safe_next_command: ${shell(bundle.commands.agentPreflight)}`);
  if (shell(bundle.commands?.agentPreflight)) lines.push(`agent_preflight_command: ${shell(bundle.commands.agentPreflight)}`);
  if (shell(bundle.commands?.targetApprovalPreflight)) lines.push(`target_approval_preflight_command: ${shell(bundle.commands.targetApprovalPreflight)}`);
  if (shell(bundle.commands?.targetProofPlan)) lines.push(`target_proof_plan_command: ${shell(bundle.commands.targetProofPlan)}`);
  if (shell(bundle.commands?.targetApprovalResumeWrite)) lines.push(`target_approval_resume_write_command: ${shell(bundle.commands.targetApprovalResumeWrite)}`);
  if (shell(bundle.commands?.targetApprovalResumeStatus)) lines.push(`target_approval_resume_status_command: ${shell(bundle.commands.targetApprovalResumeStatus)}`);
  if (shell(bundle.commands?.targetApprovalResumeWatch)) lines.push(`target_approval_resume_watch_command: ${shell(bundle.commands.targetApprovalResumeWatch)}`);
  if (shell(bundle.commands?.operatorResume)) lines.push(`operator_resume_command: ${shell(bundle.commands.operatorResume)}`);
  if (bundle.outputPath) lines.push(`output_path: ${rootRelativePath(bundle.rootDir, bundle.outputPath)}`);
  lines.push(`next: ${bundle.next}`);
  return `${lines.join('\n')}\n`;
}

export function formatCompletionProofBundleStatusCompact(status) {
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
    `operator_resume_requires_operator_approval: ${yesNo(status.operatorResumeRequiresOperatorApproval)}`,
    `operator_resume_opens_browser: ${yesNo(status.operatorResumeOpensBrowser)}`,
    `operator_resume_starts_capture: ${yesNo(status.operatorResumeStartsCapture)}`,
    `operator_resume_agent_may_run_unattended: ${yesNo(status.operatorResumeAgentMayRunUnattended)}`,
    `compact_command_audit_complete: ${yesNo(status.compactCommandAuditComplete)}`,
    `compact_command_audit_safe_for_strict_agent_loops: ${yesNo(status.compactCommandAuditSafeForStrictAgentLoops)}`,
    `compact_command_audit_skipped: ${yesNo(status.compactCommandAuditSkipped)}`,
    `compact_command_audit_command_count: ${status.compactCommandAuditCommandCount}`,
    `compact_command_audit_risky_command_count: ${status.compactCommandAuditRiskyCommandCount}`,
    `compact_command_audit_unclassified_risk_count: ${status.compactCommandAuditUnclassifiedRiskCount}`,
    `compact_command_audit_missing_approval_count: ${status.compactCommandAuditMissingApprovalCount}`,
	    `compact_command_audit_stale_handoff_conflict_count: ${status.compactCommandAuditStaleHandoffConflictCount}`,
	    `compact_command_audit_source_count: ${status.compactCommandAuditSourceCount}`,
	    `compact_command_audit_sources: ${status.compactCommandAuditSources.join(',') || 'none'}`,
    ...providerCompactLines(status),
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
    `accepted_external_proofs: ${status.acceptedExternalProofs}`,
    `next_artifact_action: ${compact(status.nextArtifactAction)}`,
    `next_artifact_blocker: ${compact(status.nextArtifactBlocker)}`,
    `artifact_command_covers: ${status.artifactCommandCovers.join(',') || 'none'}`,
    `missing_artifact_count: ${status.missingArtifactCount}`,
    `missing_artifacts: ${status.missingArtifacts.join(',') || 'none'}`
  ];
  if (status.parseError) lines.push(`parse_error: ${compact(status.parseError)}`);
  if (shell(status.agentSafeNextCommand)) lines.push(`agent_safe_next_command: ${shell(status.agentSafeNextCommand)}`);
  if (shell(status.targetApprovalPreflightCommand)) lines.push(`target_approval_preflight_command: ${shell(status.targetApprovalPreflightCommand)}`);
  if (shell(status.targetProofPlanCommand)) lines.push(`target_proof_plan_command: ${shell(status.targetProofPlanCommand)}`);
  if (shell(status.targetApprovalResumeWriteCommand)) lines.push(`target_approval_resume_write_command: ${shell(status.targetApprovalResumeWriteCommand)}`);
  if (shell(status.targetApprovalResumeStatusCommand)) lines.push(`target_approval_resume_status_command: ${shell(status.targetApprovalResumeStatusCommand)}`);
  if (shell(status.targetApprovalResumeWatchCommand)) lines.push(`target_approval_resume_watch_command: ${shell(status.targetApprovalResumeWatchCommand)}`);
  if (shell(status.operatorResumeCommand)) lines.push(`operator_resume_command: ${shell(status.operatorResumeCommand)}`);
  if (shell(status.objectiveCompletionStrictCommand)) lines.push(`objective_completion_strict_command: ${shell(status.objectiveCompletionStrictCommand)}`);
  if (shell(status.compactCommandAuditAllCommand)) lines.push(`compact_command_audit_all_command: ${shell(status.compactCommandAuditAllCommand)}`);
  if (shell(status.providerDoctorStatusCommand)) lines.push(`provider_doctor_status_command: ${shell(status.providerDoctorStatusCommand)}`);
  if (shell(status.refreshCommand)) lines.push(`refresh_command: ${shell(status.refreshCommand)}`);
  lines.push(`next: ${status.next}`);
  return `${lines.join('\n')}\n`;
}

export function formatCompletionProofBundleWatchCompact(watch) {
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
    `input_path: ${compact(rootRelativePath(watch.rootDir, watch.inputPath))}`,
    `output_path: ${compact(rootRelativePath(watch.rootDir, watch.outputPath))}`,
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
    lines.push(`after_complete: ${yesNo(watch.statusAfter.complete)}`);
    lines.push(`after_readiness_remaining: ${watch.statusAfter.readinessRemaining.join(',') || 'none'}`);
    lines.push(`after_compact_command_audit_source_count: ${watch.statusAfter.compactCommandAuditSourceCount}`);
  }
  if (shell(watch.refreshCommand)) lines.push(`refresh_command: ${shell(watch.refreshCommand)}`);
  return `${lines.join('\n')}\n`;
}
