import { buildObjectiveStatus } from './objective-status.mjs';
import { buildRuntimeAudit } from './runtime-audit.mjs';
import { buildSecretAudit, buildSecretRunSelect } from './secret-audit.mjs';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';
import { buildObjectiveSafeCommand } from './objective-safe-command.mjs';
import { buildBackendMatrixStatus } from './backend-matrix.mjs';
import { buildProviderDoctorStatus } from './provider-doctor-status.mjs';
import { buildChromeMcpTimeoutPlanStatus } from './chrome-mcp-timeout-plan.mjs';
import { buildChromeMcpAutostartPlanStatus } from './chrome-mcp-autostart-plan.mjs';
import { buildRegularChromeStatus } from './regular-chrome-refresh.mjs';
import { buildRunGateAudit } from './run-gate-audit.mjs';
import { buildTargetCandidatePlan } from './target-candidate-plan.mjs';
import path from 'node:path';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function commandShell(command) {
  return command?.shell || '';
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

function normalizeRootCommandArgs(rootDir, commandValue) {
  const args = commandValue?.args;
  if (!Array.isArray(args)) return commandValue || null;
  const normalizedArgs = args.map((arg) => rootRelativeCommandArg(rootDir, arg));
  if (normalizedArgs.every((arg, index) => arg === args[index])) return commandValue;
  return command(normalizedArgs);
}

function monitorOverrideArgs(options = {}) {
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  return [
    ...(timeoutMs === undefined || timeoutMs === null || timeoutMs === '' ? [] : ['--monitor-timeout-ms', String(timeoutMs)]),
    ...(intervalMs === undefined || intervalMs === null || intervalMs === '' ? [] : ['--monitor-interval-ms', String(intervalMs)])
  ];
}

function replaceOption(args, option, value) {
  const next = [...args];
  const index = next.indexOf(option);
  if (index >= 0) {
    next[index + 1] = String(value);
    return next;
  }
  next.push(option, String(value));
  return next;
}

function rewriteMonitorCommand(commandValue, options = {}) {
  let args = [...(commandValue?.args || [])];
  if (args[2] !== 'target-auth-watch') return commandValue;
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  if (timeoutMs !== undefined && timeoutMs !== null && timeoutMs !== '') args = replaceOption(args, '--timeout-ms', timeoutMs);
  if (intervalMs !== undefined && intervalMs !== null && intervalMs !== '') args = replaceOption(args, '--interval-ms', intervalMs);
  return command(args);
}

function backgroundTabOptions(regularChrome = {}, options = {}) {
  const allowNewBackgroundTab = options.allowNewBackgroundTab
    ?? options['allow-new-background-tab']
    ?? (regularChrome.scope?.newBackgroundTabsAllowed || regularChrome.chromeMcp?.newBackgroundTabAllowed ? 'yes' : '');
  const newBackgroundUrlEnv = options.newBackgroundUrlEnv
    ?? options['new-background-url-env']
    ?? regularChrome.chromeMcp?.newBackgroundUrlEnv
    ?? '';
  return {
    ...(allowNewBackgroundTab ? { allowNewBackgroundTab } : {}),
    ...(newBackgroundUrlEnv ? { newBackgroundUrlEnv } : {})
  };
}

function buildAgentLoop({ complete, objective, objectiveSafeCommand }) {
  const monitorArgs = objectiveSafeCommand.monitorArgs || [];
  const safeCommand = objectiveSafeCommand.command || null;
  const proofCaptureAllowedNow = Boolean(objectiveSafeCommand.proofCaptureAllowedNow);
  const pollCommand = objectiveSafeCommand.monitorOnly
    ? rewriteMonitorCommand(safeCommand, objectiveSafeCommand)
    : null;
  const canRunWithoutApproval = Boolean(
    safeCommand
    && !objectiveSafeCommand.mayOpenBrowser
    && (!objectiveSafeCommand.startsCapture || proofCaptureAllowedNow)
  );
  const nextAction = complete
    ? 'stop-complete'
    : objectiveSafeCommand.blockedReason === 'handoff-auth-check-port-unreachable'
      ? 'reopen-login-browser-required'
    : canRunWithoutApproval && objectiveSafeCommand.monitorOnly
      ? 'run-monitor-only-command'
      : canRunWithoutApproval
        ? 'run-safe-command'
        : objectiveSafeCommand.backgroundProof?.captureBlocked || objective.operatorInput
          ? 'wait-operator-login-or-run-monitor'
          : 'inspect-operator-pack';
  return {
    nextAction,
    canRunWithoutApproval,
    commandId: objectiveSafeCommand.commandId || 'none',
    command: safeCommand,
    statusCommand: command(['node', 'src/cli.mjs', 'control-status', ...monitorArgs, '--format', 'compact']),
    pollCommand,
    stepPlanCommand: objectiveSafeCommand.agentLoopStep?.planCommand || null,
    stepRunCommand: objectiveSafeCommand.agentLoopStep?.runCommand || null,
    stepStatusCommand: objectiveSafeCommand.agentLoopStep?.statusCommand || null,
    backgroundStatusCommand: objectiveSafeCommand.backgroundProof?.statusCommand || null,
    backgroundNoOpenWaitCaptureCommand: proofCaptureAllowedNow
      ? objectiveSafeCommand.backgroundProof?.noOpenWaitCaptureCommand || null
      : null,
    backgroundNoOpenWaitCaptureBackgroundCommand: proofCaptureAllowedNow
      ? objectiveSafeCommand.backgroundProof?.backgroundNoOpenWaitCaptureCommand || null
      : null,
    backgroundCaptureStartCommand: objectiveSafeCommand.backgroundProof?.captureStartCommand || null,
    backgroundMonitorStartCommand: objectiveSafeCommand.backgroundProof?.monitorStartCommand || null,
    userApprovalRequiredForBackgroundStart: Boolean(
      objectiveSafeCommand.backgroundProof?.captureStartCommand
      || objectiveSafeCommand.backgroundProof?.monitorStartCommand
    ),
    backgroundStartRequiresOperatorOk: Boolean(
      objectiveSafeCommand.backgroundProof?.captureStartCommand
      || objectiveSafeCommand.backgroundProof?.monitorStartCommand
    ),
    opensBrowserNow: false,
    startsCaptureNow: false
  };
}

export async function buildControlStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const monitorArgs = monitorOverrideArgs(options);
  const objective = options.objectiveStatus || await buildObjectiveStatus({
    ...options,
    rootDir,
    generatedAt
  });
  const runtime = options.runtimeAudit || buildRuntimeAudit();
  const secret = options.secretAudit || buildSecretAudit({ env: options.env || process.env });
  const chromeExtension = options.chromeExtensionStatus || buildChromeExtensionStatus({
    ...options,
    env: options.env || process.env
  });
  const regularChrome = options.regularChromeStatus || buildRegularChromeStatus({
    ...options,
    rootDir,
    generatedAt
  });
  const backgroundOptions = backgroundTabOptions(regularChrome, options);
  const backendMatrix = options.backendMatrixStatus || buildBackendMatrixStatus({
    ...options,
    ...backgroundOptions,
    rootDir,
    generatedAt
  });
  const providerRootDir = options.providerRootDir || options.sourceRootDir || process.cwd();
  const providerDoctorStatus = options.providerDoctorStatus || buildProviderDoctorStatus({
    generatedAt,
    providerOptions: { rootDir: providerRootDir },
    playwrightOptions: { rootDir: providerRootDir },
    seleniumOptions: { rootDir: providerRootDir }
  });
  const chromeMcpTimeoutPlan = options.chromeMcpTimeoutPlanStatus || buildChromeMcpTimeoutPlanStatus({
    ...options,
    ...backgroundOptions,
    rootDir,
    generatedAt
  });
  const chromeMcpAutostartPlan = options.chromeMcpAutostartPlanStatus || buildChromeMcpAutostartPlanStatus({
    ...options,
    rootDir,
    generatedAt
  });
  const runGateAudit = options.runGateAudit || buildRunGateAudit({ generatedAt });
  const objectiveSafeCommand = options.objectiveSafeCommand || await buildObjectiveSafeCommand({
    ...options,
    rootDir,
    generatedAt
  });
  const targetCandidate = objectiveSafeCommand.targetApproval?.selectedCandidate
    || objectiveSafeCommand.handoffResumeWatch?.target
    || objective.nextAction?.target
    || 'github';
  const targetCandidatePlan = options.targetCandidatePlan || buildTargetCandidatePlan({
    rootDir,
    candidate: targetCandidate,
    generatedAt
  });
  const selectedTargetCandidate = targetCandidatePlan.candidates?.find((candidate) => candidate.id === targetCandidate || candidate.name === targetCandidate)
    || targetCandidatePlan.candidates?.[0]
    || null;
  const targetDirRaw = objectiveSafeCommand.handoffResumeWatch?.targetDir
    || (targetCandidate ? `runs/target-packs/${targetCandidate}` : '');
  const targetDir = rootRelativeCommandArg(rootDir, targetDirRaw);
  const secretRunSelect = options.secretRunSelect || buildSecretRunSelect({
    ...options,
    audit: secret,
    command: options.secretCommand || 'target-login-capture',
    targetDir
  });
  const port9223 = runtime.chromeDevtools?.endpoint || null;
  const port9222 = runtime.chromeDevtools?.diaEndpoint || null;
  const processBreakdown = runtime.processBreakdown || {};
  const chromeApp = runtime.chromeApp || {};
  const recommended = objective.recommendedCommand || null;
  const proofCaptureAllowedNow = Boolean(objectiveSafeCommand.proofCaptureAllowedNow);
  const handoffAuthCheckPort = objective.operatorHandoff?.authCheckPort
    || objective.latestHandoffResume?.loginOpen?.port
    || '';
  const warnings = [
    ...((runtime.recommendations || []).filter((item) => item.level !== 'pass').map((item) => item.name)),
    ...(secret.headlessReady ? [] : [secret.capabilities?.serviceAccountEnvFileUsable ? 'secret.headless-env-file-not-sourced' : 'secret.headless-not-configured']),
    ...(runGateAudit.summary?.okForAgentLoops ? [] : ['run-gate.unguarded-agent-dangerous']),
    ...(objective.complete ? [] : [`objective.${objective.nextAction?.id || 'action-required'}`])
  ];

  return {
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    readyForLocalAuthenticatedDevelopment: true,
    complete: Boolean(objective.complete),
    objective: {
      status: objective.status,
      complete: Boolean(objective.complete),
      remainingCount: objective.remainingCount ?? 0,
      nextAction: objective.nextAction?.id || '',
      operatorInput: Boolean(objective.nextAction?.needsOperatorInput),
      recommendedCommand: recommended
        ? {
            id: recommended.id || '',
            reason: recommended.reason || '',
            command: recommended.command || null
          }
        : null,
      handoffResume: objective.latestHandoffResume
        ? {
            status: objective.latestHandoffResume.status || '',
            loginOpenStatus: objective.latestHandoffResume.loginOpen?.status || '',
            loginOpenPort: handoffAuthCheckPort,
            latestResumeLoginOpenPort: objective.latestHandoffResume.loginOpen?.port || '',
            operatorHandoffAuthCheckPort: objective.operatorHandoff?.authCheckPort || '',
            authChildStatus: objective.latestHandoffResume.authCheck?.childStatus || ''
          }
        : null,
      authWatch: objective.authWatchStatus?.exists
        ? {
            status: objective.authWatchStatus.status || '',
            active: Boolean(objective.authWatchStatus.active),
            stale: Boolean(objective.authWatchStatus.stale),
            ok: Boolean(objective.authWatchStatus.ok),
            loginLike: Boolean(objective.authWatchStatus.loginLike)
          }
        : null,
      authWatchLatest: objective.authWatchLatestStatus?.exists
        ? {
            status: objective.authWatchLatestStatus.status || '',
            active: Boolean(objective.authWatchLatestStatus.active),
            stale: Boolean(objective.authWatchLatestStatus.stale),
            ok: Boolean(objective.authWatchLatestStatus.ok),
            loginLike: Boolean(objective.authWatchLatestStatus.loginLike)
        }
        : null
    },
    objectiveSafeCommand: {
      action: objectiveSafeCommand.agentSafeAction || '',
      commandId: objectiveSafeCommand.commandId || 'none',
      monitorOnly: Boolean(objectiveSafeCommand.monitorOnly),
      mayOpenBrowser: Boolean(objectiveSafeCommand.mayOpenBrowser),
      startsCapture: Boolean(objectiveSafeCommand.startsCapture),
      blockedReason: objectiveSafeCommand.blockedReason || '',
      authWatchHandoffPort: objectiveSafeCommand.authWatchHandoffPort ?? null,
      authWatchHandoffPortReachable: objectiveSafeCommand.authWatchHandoffPortReachable ?? null,
      proofCaptureAllowedNow: Boolean(objectiveSafeCommand.proofCaptureAllowedNow),
      nextArtifactAction: objectiveSafeCommand.nextArtifactAction || '',
      nextArtifactBlocker: objectiveSafeCommand.nextArtifactBlocker || '',
      command: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.command),
      backgroundProof: {
        planStatus: objectiveSafeCommand.backgroundProofCapture?.planStatus || '',
        captureBlocked: Boolean(objectiveSafeCommand.backgroundProofCapture?.captureBlocked),
        monitorAvailable: Boolean(objectiveSafeCommand.backgroundProofCapture?.monitorAvailable),
        captureAvailable: Boolean(objectiveSafeCommand.backgroundProofCapture?.captureAvailable),
        opensBrowserNow: Boolean(objectiveSafeCommand.backgroundProofCapture?.opensBrowserNow),
        startsCaptureNow: Boolean(objectiveSafeCommand.backgroundProofCapture?.startsCaptureNow),
        captureStartReadyToRun: Boolean(objectiveSafeCommand.backgroundProofCapture?.captureStartReadyToRun),
        captureStartBlockers: objectiveSafeCommand.backgroundProofCapture?.captureStartBlockers || [],
        monitorStartReadyToRun: Boolean(objectiveSafeCommand.backgroundProofCapture?.monitorStartReadyToRun),
        monitorStartBlockers: objectiveSafeCommand.backgroundProofCapture?.monitorStartBlockers || [],
        noOpenWaitCaptureCommand: proofCaptureAllowedNow
          ? normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.noOpenWaitCaptureCommand)
          : null,
        backgroundNoOpenWaitCaptureCommand: proofCaptureAllowedNow
          ? objectiveSafeCommand.backgroundProofCapture?.backgroundNoOpenWaitCaptureCommand || null
          : null,
        statusCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.statusCommand),
        captureStartCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.captureStartCommand),
        monitorStartCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.monitorStartCommand)
      },
      agentProofStep: {
        startStatus: objectiveSafeCommand.agentProofStep?.startStatus || '',
        startReadyToRun: Boolean(objectiveSafeCommand.agentProofStep?.startReadyToRun),
        startBlockers: objectiveSafeCommand.agentProofStep?.startBlockers || [],
        selectedCommandId: objectiveSafeCommand.agentProofStep?.selectedCommandId || '',
        selectedStartsCapture: Boolean(objectiveSafeCommand.agentProofStep?.selectedStartsCapture),
        latestAuthOk: Boolean(objectiveSafeCommand.agentProofStep?.latestAuthOk),
        captureCompleted: Boolean(objectiveSafeCommand.agentProofStep?.captureCompleted),
        opensBrowserNow: Boolean(objectiveSafeCommand.agentProofStep?.opensBrowserNow),
        startsCaptureNow: Boolean(objectiveSafeCommand.agentProofStep?.startsCaptureNow),
        planCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.planCommand),
        runCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.runCommand),
        startCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.startCommand),
        statusCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.statusCommand)
      },
      handoffResumeWatch: {
        available: Boolean(objectiveSafeCommand.handoffResumeWatch?.available),
        status: objectiveSafeCommand.handoffResumeWatch?.status || '',
        selectedCommandId: objectiveSafeCommand.handoffResumeWatch?.selectedCommandId || '',
        selectedStartsCapture: Boolean(objectiveSafeCommand.handoffResumeWatch?.selectedStartsCapture),
        beforeStatus: objectiveSafeCommand.handoffResumeWatch?.beforeStatus || '',
        beforeLatestAuthOk: Boolean(objectiveSafeCommand.handoffResumeWatch?.beforeLatestAuthOk),
        beforeCaptureCompleted: Boolean(objectiveSafeCommand.handoffResumeWatch?.beforeCaptureCompleted),
        mayOpenBrowser: Boolean(objectiveSafeCommand.handoffResumeWatch?.mayOpenBrowser),
        planCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.handoffResumeWatch?.planCommand),
        runCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.handoffResumeWatch?.runCommand),
        error: objectiveSafeCommand.handoffResumeWatch?.error || ''
      },
      targetApproval: {
        approvalPackExists: Boolean(objectiveSafeCommand.targetApproval?.approvalPackExists),
        approvalPackParseOk: Boolean(objectiveSafeCommand.targetApproval?.approvalPackParseOk),
        selectedCandidate: objectiveSafeCommand.targetApproval?.selectedCandidate || '',
        targetPackExists: Boolean(objectiveSafeCommand.targetApproval?.targetPackExists),
        targetNext: objectiveSafeCommand.targetApproval?.targetNext || '',
        humanAction: objectiveSafeCommand.targetApproval?.humanAction || '',
        automationBlocker: objectiveSafeCommand.targetApproval?.automationBlocker || '',
        captureBlocked: Boolean(objectiveSafeCommand.targetApproval?.captureBlocked),
        nextCommandOpensBrowser: Boolean(objectiveSafeCommand.targetApproval?.nextCommandOpensBrowser),
        nextCommandStartsCapture: Boolean(objectiveSafeCommand.targetApproval?.nextCommandStartsCapture),
        nextCommandRequiresOperatorApproval: Boolean(objectiveSafeCommand.targetApproval?.nextCommandRequiresOperatorApproval),
        nextCommandAgentMayRunUnattended: Boolean(objectiveSafeCommand.targetApproval?.nextCommandAgentMayRunUnattended),
        resumeStatus: objectiveSafeCommand.targetApproval?.resumeStatus || '',
        resumeReadyToRun: Boolean(objectiveSafeCommand.targetApproval?.resumeReadyToRun),
        resumeOperatorOkRequired: Boolean(objectiveSafeCommand.targetApproval?.resumeOperatorOkRequired),
        resumeOperatorOkAccepted: Boolean(objectiveSafeCommand.targetApproval?.resumeOperatorOkAccepted),
        resumeAgentMayRunUnattended: Boolean(objectiveSafeCommand.targetApproval?.resumeAgentMayRunUnattended),
        resumePlannedCommandOpensBrowser: Boolean(objectiveSafeCommand.targetApproval?.resumePlannedCommandOpensBrowser),
        resumePlannedCommandStartsCapture: Boolean(objectiveSafeCommand.targetApproval?.resumePlannedCommandStartsCapture),
        operatorApprovalSummaryScope: objectiveSafeCommand.targetApproval?.operatorApprovalSummaryScope || '',
        operatorApprovalSummaryHumanAction: objectiveSafeCommand.targetApproval?.operatorApprovalSummaryHumanAction || '',
        operatorApprovalSummaryRequiresOperatorOk: Boolean(objectiveSafeCommand.targetApproval?.operatorApprovalSummaryRequiresOperatorOk),
        operatorApprovalSummaryOperatorOkAccepted: Boolean(objectiveSafeCommand.targetApproval?.operatorApprovalSummaryOperatorOkAccepted),
        operatorApprovalSummaryMayOpenBrowser: Boolean(objectiveSafeCommand.targetApproval?.operatorApprovalSummaryMayOpenBrowser),
        operatorApprovalSummaryMayStartCapture: Boolean(objectiveSafeCommand.targetApproval?.operatorApprovalSummaryMayStartCapture),
        operatorApprovalSummaryReadsBrowserStorage: Boolean(objectiveSafeCommand.targetApproval?.operatorApprovalSummaryReadsBrowserStorage),
        operatorApprovalSummaryReturnsPageContent: Boolean(objectiveSafeCommand.targetApproval?.operatorApprovalSummaryReturnsPageContent),
        operatorApprovalSummaryAgentMustNotRunUnattended: Boolean(objectiveSafeCommand.targetApproval?.operatorApprovalSummaryAgentMustNotRunUnattended),
        statusCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.statusCommand),
        preflightCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.preflightCommand),
        resumePreflightCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumePreflightCommand),
        resumeProofPlanCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumeProofPlanCommand),
        resumePlanCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumePlanCommand),
        resumeStatusCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumeStatusCommand),
        resumeWatchCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumeWatchCommand),
        resumeRunCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumeRunCommand)
      },
      targetCandidatePlan: {
        selectedCandidate: selectedTargetCandidate?.id || targetCandidate || '',
        recommendedCandidate: targetCandidatePlan.recommendedCandidate || '',
        candidateCount: targetCandidatePlan.candidates?.length || 0,
        targetPackExists: Boolean(selectedTargetCandidate?.readiness?.targetPackExists),
        metadataOk: Boolean(selectedTargetCandidate?.readiness?.metadataOk),
        authCheckExists: Boolean(selectedTargetCandidate?.readiness?.authCheckExists),
        authCheckOk: Boolean(selectedTargetCandidate?.readiness?.authCheckOk),
        authCheckLoginLike: selectedTargetCandidate?.readiness?.authCheckLoginLike ?? null,
        benchmarkExists: Boolean(selectedTargetCandidate?.readiness?.benchmarkExists),
        benchmarkOk: Boolean(selectedTargetCandidate?.readiness?.benchmarkOk),
        proofExists: Boolean(selectedTargetCandidate?.readiness?.proofExists),
        proofReady: Boolean(selectedTargetCandidate?.readiness?.proofReady),
        proofAccepted: Boolean(selectedTargetCandidate?.readiness?.proofAccepted),
        nextAction: selectedTargetCandidate?.readiness?.nextAction || '',
        command: command([
          'node',
          'src/cli.mjs',
          'target-candidate-plan',
          '--candidate',
          selectedTargetCandidate?.id || targetCandidate || 'github',
          '--format',
          'compact'
        ])
      }
    },
    agentLoop: buildAgentLoop({
      complete: Boolean(objective.complete),
      objective: {
        operatorInput: Boolean(objective.nextAction?.needsOperatorInput)
      },
      objectiveSafeCommand: {
        commandId: objectiveSafeCommand.commandId || 'none',
        monitorOnly: Boolean(objectiveSafeCommand.monitorOnly),
        mayOpenBrowser: Boolean(objectiveSafeCommand.mayOpenBrowser),
        startsCapture: Boolean(objectiveSafeCommand.startsCapture),
        blockedReason: objectiveSafeCommand.blockedReason || '',
        proofCaptureAllowedNow: Boolean(objectiveSafeCommand.proofCaptureAllowedNow),
        command: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.command),
        agentLoopStep: objectiveSafeCommand.agentLoopStep || null,
        backgroundProof: {
          captureBlocked: Boolean(objectiveSafeCommand.backgroundProofCapture?.captureBlocked),
          statusCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.statusCommand),
          noOpenWaitCaptureCommand: proofCaptureAllowedNow
            ? normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.noOpenWaitCaptureCommand)
            : null,
          backgroundNoOpenWaitCaptureCommand: proofCaptureAllowedNow
            ? objectiveSafeCommand.backgroundProofCapture?.backgroundNoOpenWaitCaptureCommand || null
            : null,
          captureStartCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.captureStartCommand),
        monitorStartCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.monitorStartCommand)
        },
        agentProofStep: {
          ...objectiveSafeCommand.agentProofStep,
          planCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.planCommand),
          runCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.runCommand),
          startCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.startCommand),
          statusCommand: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.statusCommand)
        },
        monitorArgs,
        monitorTimeoutMs: options.monitorTimeoutMs,
        monitorIntervalMs: options.monitorIntervalMs
      }
    }),
    browser: {
      devtoolsPort: 9223,
      devtoolsOk: Boolean(port9223?.ok),
      devtoolsBrowser: port9223?.browser || '',
      diaPort: 9222,
      diaDevtoolsOk: Boolean(port9222?.ok),
      chromeAppProcesses: chromeApp.total || 0,
      regularChromeProfiles: chromeApp.regularProfiles || 0,
      regularChromeDebuggable: (chromeApp.regularProfileRemoteDebugging || 0) > 0,
      targetChromeProfiles: chromeApp.targetPackProfiles || 0,
      targetChromeDebuggable: (chromeApp.targetProfileRemoteDebugging || 0) > 0,
      codexChromeProfiles: chromeApp.codexBrowserAgentProfiles || 0,
      everydayChromeExtensionPrepared: Boolean(chromeExtension.decision?.everydayChromeViaCodexExtensionPrepared),
      everydayChromeExtensionBackendAvailable: Boolean(chromeExtension.decision?.everydayChromeViaCodexExtensionBackendAvailable),
      everydayChromeExtensionReady: Boolean(chromeExtension.decision?.everydayChromeViaCodexExtensionReady),
      everydayChromeCdpAllowed: Boolean(chromeExtension.decision?.everydayChromeViaCdpAllowed),
      codexChromeExtensionInstalled: Boolean(chromeExtension.extension?.installed),
      codexChromeExtensionEnabled: Boolean(chromeExtension.extension?.enabled),
      codexChromeExtensionNativeHostCorrect: Boolean(chromeExtension.nativeHost?.correct),
      codexChromeExtensionSelectedProfile: chromeExtension.extension?.selectedProfileDirectory || '',
      defaultBrowserHttp: chromeExtension.defaultBrowser?.http || '',
      defaultBrowserHttps: chromeExtension.defaultBrowser?.https || '',
      agentBrowserSessions: runtime.agentBrowser?.sessions?.length || 0,
      staleAgentBrowserSessions: runtime.agentBrowser?.staleSessions?.length || 0,
      ownerSessions: runtime.agentOwners?.length || 0,
      peekabooServers: processBreakdown.peekaboo?.parts?.server || 0,
      chromeDevtoolsMcpServers: processBreakdown.chromeDevtoolsMcp?.parts?.server || 0,
      computerUseMcp: processBreakdown.computerUse?.parts?.server || 0
    },
    backendMatrix: {
      status: backendMatrix.status || '',
      exists: Boolean(backendMatrix.exists),
      stale: Boolean(backendMatrix.stale),
      ageSeconds: backendMatrix.ageSeconds ?? null,
      defaultBackend: backendMatrix.defaultBackend || '',
      defaultAgentInterface: backendMatrix.defaultAgentInterface || '',
      searchBackend: backendMatrix.searchBackend || '',
      analyzeBackend: backendMatrix.analyzeBackend || '',
      scrapeBackend: backendMatrix.scrapeBackend || '',
      operateBackend: backendMatrix.operateBackend || '',
      authenticatedBackend: backendMatrix.authenticatedBackend || '',
      existingTabBackend: backendMatrix.existingTabBackend || '',
      publicCrawlBackend: backendMatrix.publicCrawlBackend || '',
      compatibilityBackend: backendMatrix.compatibilityBackend || '',
      regularChromeStatus: backendMatrix.regularChromeStatus || '',
      regularChromeNewBackgroundTabsAllowed: Boolean(backendMatrix.regularChromeNewBackgroundTabsAllowed),
      chromeMcpNewBackgroundTabAllowed: Boolean(backendMatrix.chromeMcpNewBackgroundTabAllowed),
      chromeMcpNewBackgroundUrlEnv: backendMatrix.chromeMcpNewBackgroundUrlEnv || '',
      chromeMcpNewBackgroundUrlValueRead: Boolean(backendMatrix.chromeMcpNewBackgroundUrlValueRead),
      chromeMcpRouteReady: Boolean(backendMatrix.chromeMcpRouteReady),
      chromeMcpListPagesTimedOut: Boolean(backendMatrix.chromeMcpListPagesTimedOut),
      chromeMcpTimeoutPlanSource: backendMatrix.chromeMcpTimeoutPlanSource || '',
      chromeMcpTimeoutPlanStatus: backendMatrix.chromeMcpTimeoutPlanStatus || '',
      chromeMcpTimeoutPlanStale: Boolean(backendMatrix.chromeMcpTimeoutPlanStale),
      chromeMcpTimeoutPlanPreferExtensionResume: Boolean(backendMatrix.chromeMcpTimeoutPlanPreferExtensionResume),
      backendCount: backendMatrix.backendCount ?? 0,
      savedSecretValuesRead: Boolean(backendMatrix.savedSecretValuesRead),
      savedDestructiveActions: Boolean(backendMatrix.savedDestructiveActions),
      refreshCommand: backendMatrix.commands?.refresh || null,
      statusCommand: backendMatrix.commands?.status || null
    },
    providerDoctorStatus: {
      defaultBackend: providerDoctorStatus.defaultBackend || '',
      defaultAgentInterface: providerDoctorStatus.defaultAgentInterface || '',
      adoptionNext: providerDoctorStatus.adoptionNext || '',
      agentBrowserCliExists: Boolean(providerDoctorStatus.agentBrowser?.cliExists),
      agentBrowserChromeForTestingExists: Boolean(providerDoctorStatus.agentBrowser?.chromeForTestingExists),
      agentBrowserReadyForEngineUse: Boolean(providerDoctorStatus.agentBrowser?.readyForEngineUse),
      agentBrowserMissingChecks: providerDoctorStatus.agentBrowser?.missingChecks || [],
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
      lightpandaBenchmarkAgentMayRunUnattended: Boolean(providerDoctorStatus.lightpanda?.benchmarkAgentMayRunUnattended),
      lightpandaBenchmarkStartsBrowser: Boolean(providerDoctorStatus.lightpanda?.benchmarkStartsBrowser),
      lightpandaBenchmarkReadsBrowserStorage: Boolean(providerDoctorStatus.lightpanda?.benchmarkReadsBrowserStorage),
      lightpandaBenchmarkReturnsPageContent: Boolean(providerDoctorStatus.lightpanda?.benchmarkReturnsPageContent),
      lightpandaBenchmarkCommand: providerDoctorStatus.lightpanda?.benchmarkCommand || providerDoctorStatus.commands?.lightpandaBenchmark || '',
      playwrightReadyForPublicSmoke: Boolean(providerDoctorStatus.playwright?.readyForPublicSmoke),
      playwrightReadyForAuthenticatedDefault: Boolean(providerDoctorStatus.playwright?.readyForAuthenticatedDefault),
      playwrightMissingChecks: providerDoctorStatus.playwright?.missingChecks || [],
      playwrightStorageStateSensitive: Boolean(providerDoctorStatus.playwright?.storageStateSensitive),
      playwrightSmokeAgentMayRunUnattended: Boolean(providerDoctorStatus.playwright?.smokeAgentMayRunUnattended),
      playwrightSmokeStartsBrowser: Boolean(providerDoctorStatus.playwright?.smokeStartsBrowser),
      playwrightSmokeReadsBrowserStorage: Boolean(providerDoctorStatus.playwright?.smokeReadsBrowserStorage),
      playwrightSmokeReturnsPageContent: Boolean(providerDoctorStatus.playwright?.smokeReturnsPageContent),
      playwrightSmokeCommand: providerDoctorStatus.playwright?.smokeCommand || providerDoctorStatus.commands?.playwrightSmoke || '',
      playwrightPublicSmokeProofExists: Boolean(providerDoctorStatus.playwright?.publicSmokeProofExists),
      playwrightPublicSmokeProofOk: Boolean(providerDoctorStatus.playwright?.publicSmokeProofOk),
      playwrightPublicSmokeProofPath: providerDoctorStatus.playwright?.publicSmokeProofPath || '',
      playwrightPublicSmokeProofHeadingCount: providerDoctorStatus.playwright?.publicSmokeProofHeadingCount ?? 0,
      playwrightPublicSmokeProofLinkCount: providerDoctorStatus.playwright?.publicSmokeProofLinkCount ?? 0,
      playwrightSmokeProofCommand: providerDoctorStatus.playwright?.smokeProofCommand || providerDoctorStatus.commands?.playwrightSmokeProof || '',
      playwrightSmokeProofAgentMayRunUnattended: Boolean(providerDoctorStatus.playwright?.smokeProofAgentMayRunUnattended),
      playwrightSmokeProofStartsBrowser: Boolean(providerDoctorStatus.playwright?.smokeProofStartsBrowser),
      playwrightSmokeProofReadsBrowserStorage: Boolean(providerDoctorStatus.playwright?.smokeProofReadsBrowserStorage),
      playwrightSmokeProofReturnsPageContent: Boolean(providerDoctorStatus.playwright?.smokeProofReturnsPageContent),
      seleniumReadyForLocalSmoke: Boolean(providerDoctorStatus.selenium?.readyForLocalSmoke),
      seleniumMissingChecks: providerDoctorStatus.selenium?.missingChecks || [],
      seleniumSmokeAgentMayRunUnattended: Boolean(providerDoctorStatus.selenium?.smokeAgentMayRunUnattended),
      seleniumSmokeStartsBrowser: Boolean(providerDoctorStatus.selenium?.smokeStartsBrowser),
      seleniumSmokeCommand: providerDoctorStatus.selenium?.smokeCommand || providerDoctorStatus.commands?.seleniumSmoke || '',
      command: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact'])
    },
    chromeMcpTimeoutPlan: {
      status: chromeMcpTimeoutPlan.status || '',
      exists: Boolean(chromeMcpTimeoutPlan.exists),
      parseOk: Boolean(chromeMcpTimeoutPlan.parseOk),
      stale: Boolean(chromeMcpTimeoutPlan.stale),
      ageSeconds: chromeMcpTimeoutPlan.ageSeconds ?? null,
      connected: Boolean(chromeMcpTimeoutPlan.connected),
      pageListOk: Boolean(chromeMcpTimeoutPlan.pageListOk),
      pageListTimeout: Boolean(chromeMcpTimeoutPlan.pageListTimeout),
      newBackgroundTabsAllowed: Boolean(chromeMcpTimeoutPlan.newBackgroundTabsAllowed),
      newBackgroundTabOption: chromeMcpTimeoutPlan.newBackgroundTabOption || '',
      newBackgroundUrlEnv: chromeMcpTimeoutPlan.newBackgroundUrlEnv || '',
      newBackgroundUrlValueRead: Boolean(chromeMcpTimeoutPlan.newBackgroundUrlValueRead),
      useEverydayChromeNow: Boolean(chromeMcpTimeoutPlan.useEverydayChromeNow),
      preferExtensionResume: Boolean(chromeMcpTimeoutPlan.preferExtensionResume),
      cleanupIsManual: Boolean(chromeMcpTimeoutPlan.cleanupIsManual),
      doNotUseDefaultProfileCdp: Boolean(chromeMcpTimeoutPlan.doNotUseDefaultProfileCdp),
      dedicatedTargetProfileRequiredForStoredAuth: Boolean(chromeMcpTimeoutPlan.dedicatedTargetProfileRequiredForStoredAuth),
      nextAction: chromeMcpTimeoutPlan.nextAction || '',
      findingCount: chromeMcpTimeoutPlan.findings?.length || 0,
      findings: chromeMcpTimeoutPlan.findings || [],
      cleanupOwnerSessions: chromeMcpTimeoutPlan.cleanup?.ownerSessionCount || 0,
      cleanupReviewOwnerPids: chromeMcpTimeoutPlan.cleanup?.reviewOwnerPids || [],
      statusCommand: chromeMcpTimeoutPlan.commands?.status || null,
      refreshCommand: chromeMcpTimeoutPlan.commands?.refresh || null,
      regularChromeUseCommand: chromeMcpTimeoutPlan.commands?.regularChromeUse || null,
      runtimeCleanupPlanCommand: chromeMcpTimeoutPlan.commands?.runtimeCleanupPlan || null,
      chromeExtensionResumeApprovalCommand: chromeMcpTimeoutPlan.commands?.chromeExtensionResumeApproval || null,
      chromeMcpStatusRetryCommand: chromeMcpTimeoutPlan.commands?.chromeMcpStatusRetry || null
    },
    chromeMcpAutostartPlan: {
      exists: Boolean(chromeMcpAutostartPlan.exists),
      parseOk: Boolean(chromeMcpAutostartPlan.parseOk),
      label: chromeMcpAutostartPlan.label || '',
      browserUrl: chromeMcpAutostartPlan.browserUrl || '',
      plistExists: Boolean(chromeMcpAutostartPlan.plistExists),
      installPathExists: Boolean(chromeMcpAutostartPlan.installPathExists),
      installRequiresOperatorApproval: Boolean(chromeMcpAutostartPlan.installRequiresOperatorApproval),
      agentMayInstallUnattended: Boolean(chromeMcpAutostartPlan.agentMayInstallUnattended),
      statusCommand: chromeMcpAutostartPlan.statusCommand || null,
      refreshCommand: chromeMcpAutostartPlan.refreshCommand || null,
      planCommand: command(['node', 'src/cli.mjs', 'chrome-mcp-autostart-plan', '--format', 'compact'])
    },
    runGate: {
      okForAgentLoops: Boolean(runGateAudit.summary?.okForAgentLoops),
      unguardedAgentDangerous: runGateAudit.summary?.unguardedAgentDangerous ?? 0,
      agentSafeUnattended: runGateAudit.summary?.agentSafeUnattended ?? 0,
      operatorGated: runGateAudit.summary?.operatorGated ?? 0,
      exactOperatorOk: runGateAudit.summary?.exactOperatorOk ?? 0,
      directOperator: runGateAudit.summary?.directOperator ?? 0,
      totalSurfaces: runGateAudit.summary?.total ?? 0,
      opensBrowserNow: Boolean(runGateAudit.opensBrowserNow),
      startsCaptureNow: Boolean(runGateAudit.startsCaptureNow),
      startsBackgroundProcessNow: Boolean(runGateAudit.startsBackgroundProcessNow),
      nextAction: runGateAudit.nextAction || '',
      command: command(['node', 'src/cli.mjs', 'run-gate-audit', '--format', 'compact'])
    },
    secret: {
      headlessReady: Boolean(secret.headlessReady),
      recommendedHeadlessMode: secret.recommendedHeadlessMode || '',
      desktopIntegrationLikely: Boolean(secret.capabilities?.desktopIntegrationLikely),
      serviceAccountConfigured: Boolean(secret.capabilities?.serviceAccountConfigured),
      serviceAccountEnvFileUsable: Boolean(secret.capabilities?.serviceAccountEnvFileUsable),
      headlessConfigAvailable: Boolean(secret.capabilities?.headlessConfigAvailable),
      connectConfigured: Boolean(secret.capabilities?.connectConfigured),
      onePasswordMcp: secret.processes?.onePasswordMcp || 0,
      runSelect: {
        commandId: secretRunSelect.commandId || '',
        selectedCandidate: secretRunSelect.selectedCandidate || '',
        selectedMode: secretRunSelect.selectedMode || '',
        headless: Boolean(secretRunSelect.headless),
        readyToRunNow: Boolean(secretRunSelect.readyToRunNow),
        setupRequired: secretRunSelect.setupRequired || [],
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
        runCommand: secretRunSelect.command || null,
        setupCommand: normalizeRootCommandArgs(rootDir, secretRunSelect.setupCommand)
      }
    },
    warnings,
    commands: {
      status: objective.commands?.status || null,
      recommended: recommended?.command || null,
      runtimeAudit: command(['node', 'src/cli.mjs', 'runtime-audit', '--format', 'compact']),
      runtimeCleanup: {
        args: ['node', 'src/cli.mjs', 'runtime-cleanup-plan', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'runtime-cleanup-plan' '--format' 'compact'"
      },
      authCheck: normalizeRootCommandArgs(rootDir, objective.commands?.authCheck),
      authWatch: normalizeRootCommandArgs(rootDir, objective.commands?.authWatch),
      loginCaptureWait: normalizeRootCommandArgs(rootDir, objective.commands?.loginCaptureWait),
      objectiveSafeCommand: {
        ...command(['node', 'src/cli.mjs', 'objective-safe-command', ...monitorArgs, '--format', 'compact'])
      },
      providerDoctorStatus: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']),
      backendMatrix: backendMatrix.commands?.refresh || null,
      backendMatrixStatus: backendMatrix.commands?.status || null,
      chromeMcpTimeoutPlanStatus: chromeMcpTimeoutPlan.commands?.status || null,
      chromeMcpTimeoutPlanRefresh: chromeMcpTimeoutPlan.commands?.refresh || null,
      chromeMcpAutostartPlan: command(['node', 'src/cli.mjs', 'chrome-mcp-autostart-plan', '--format', 'compact']),
      chromeMcpAutostartPlanStatus: chromeMcpAutostartPlan.statusCommand || command(['node', 'src/cli.mjs', 'chrome-mcp-autostart-plan-status', '--format', 'compact']),
      chromeMcpAutostartPlanRefresh: chromeMcpAutostartPlan.refreshCommand || null,
      runGateAudit: command(['node', 'src/cli.mjs', 'run-gate-audit', '--format', 'compact']),
      backgroundProofStatus: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.statusCommand),
      backgroundProofNoOpenWaitCapture: proofCaptureAllowedNow
        ? normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.noOpenWaitCaptureCommand)
        : null,
      backgroundProofNoOpenWaitCaptureBackground: proofCaptureAllowedNow
        ? objectiveSafeCommand.backgroundProofCapture?.backgroundNoOpenWaitCaptureCommand || null
        : null,
      backgroundProofCaptureStart: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.captureStartCommand),
      backgroundProofMonitorStart: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.backgroundProofCapture?.monitorStartCommand),
      agentProofStepPlan: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.planCommand),
      agentProofStepRun: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.runCommand),
      agentProofStepStart: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.startCommand),
      agentProofStepStatus: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.agentProofStep?.statusCommand),
      handoffResumeWatch: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.handoffResumeWatch?.planCommand),
      handoffResumeWatchRun: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.handoffResumeWatch?.runCommand),
      targetApprovalStatus: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.statusCommand),
      targetApprovalPreflight: objectiveSafeCommand.targetApproval?.preflightCommand || command([
        'node',
        'src/cli.mjs',
        'target-approval-preflight',
        '--candidate',
        objectiveSafeCommand.targetApproval?.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      targetApprovalResumePreflight: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumePreflightCommand),
      targetApprovalResumeProofPlan: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumeProofPlanCommand),
      targetApprovalResumePlan: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumePlanCommand),
      targetApprovalResumeStatus: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumeStatusCommand),
      targetApprovalResumeWatch: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumeWatchCommand),
      targetApprovalResumeRun: normalizeRootCommandArgs(rootDir, objectiveSafeCommand.targetApproval?.resumeRunCommand),
      targetCandidatePlan: command([
        'node',
        'src/cli.mjs',
        'target-candidate-plan',
        '--candidate',
        selectedTargetCandidate?.id || targetCandidate || 'github',
        '--format',
        'compact'
      ]),
      secretAudit: {
        args: ['node', 'src/cli.mjs', 'secret-audit', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'secret-audit' '--format' 'compact'"
      },
      completionAudit: objective.commands?.completionAudit || null
    }
  };
}

export function formatControlStatusCompact(status) {
  const lines = [
    `complete: ${yesNo(status.complete)}`,
    `objective_status: ${clean(status.objective.status)}`,
    `remaining: ${status.objective.remainingCount ?? 0}`,
    `next: ${clean(status.objective.nextAction || 'none')}`,
    `operator_input: ${yesNo(status.objective.operatorInput)}`,
    `recommended_command: ${clean(status.objective.recommendedCommand?.id || 'none')}`,
    `handoff_resume: ${clean(status.objective.handoffResume?.status || 'none')}`,
    `handoff_resume_login_open: ${clean(status.objective.handoffResume?.loginOpenStatus || 'none')}`,
    `auth_watch: ${clean(status.objective.authWatch?.status || 'none')}`,
    `auth_watch_active: ${yesNo(status.objective.authWatch?.active)}`,
    `auth_watch_latest: ${clean(status.objective.authWatchLatest?.status || 'none')}`,
    `auth_watch_latest_active: ${yesNo(status.objective.authWatchLatest?.active)}`,
    `objective_safe_action: ${clean(status.objectiveSafeCommand?.action || 'none')}`,
    `objective_safe_command_id: ${clean(status.objectiveSafeCommand?.commandId || 'none')}`,
    `objective_safe_command_monitor_only: ${yesNo(status.objectiveSafeCommand?.monitorOnly)}`,
    `objective_safe_command_may_open_browser: ${yesNo(status.objectiveSafeCommand?.mayOpenBrowser)}`,
    `objective_safe_command_starts_capture: ${yesNo(status.objectiveSafeCommand?.startsCapture)}`,
    `objective_safe_command_blocked_reason: ${clean(status.objectiveSafeCommand?.blockedReason || 'none')}`,
    `objective_safe_auth_watch_handoff_port: ${clean(status.objectiveSafeCommand?.authWatchHandoffPort ?? 'none')}`,
    `objective_safe_auth_watch_handoff_port_reachable: ${status.objectiveSafeCommand?.authWatchHandoffPortReachable === null || status.objectiveSafeCommand?.authWatchHandoffPortReachable === undefined ? 'unknown' : yesNo(status.objectiveSafeCommand.authWatchHandoffPortReachable)}`,
    `objective_safe_proof_capture_allowed_now: ${yesNo(status.objectiveSafeCommand?.proofCaptureAllowedNow)}`,
    `background_proof_plan_status: ${clean(status.objectiveSafeCommand?.backgroundProof?.planStatus || 'none')}`,
    `background_proof_capture_blocked: ${yesNo(status.objectiveSafeCommand?.backgroundProof?.captureBlocked)}`,
    `background_proof_monitor_available: ${yesNo(status.objectiveSafeCommand?.backgroundProof?.monitorAvailable)}`,
    `background_proof_capture_available: ${yesNo(status.objectiveSafeCommand?.backgroundProof?.captureAvailable)}`,
    `background_proof_opens_browser_now: ${yesNo(status.objectiveSafeCommand?.backgroundProof?.opensBrowserNow)}`,
    `background_proof_starts_capture_now: ${yesNo(status.objectiveSafeCommand?.backgroundProof?.startsCaptureNow)}`,
    `background_proof_capture_start_ready: ${yesNo(status.objectiveSafeCommand?.backgroundProof?.captureStartReadyToRun)}`,
    `background_proof_capture_start_blockers: ${status.objectiveSafeCommand?.backgroundProof?.captureStartBlockers?.length ? status.objectiveSafeCommand.backgroundProof.captureStartBlockers.join(',') : 'none'}`,
    `agent_proof_step_start_status: ${clean(status.objectiveSafeCommand?.agentProofStep?.startStatus || 'none')}`,
    `agent_proof_step_start_ready: ${yesNo(status.objectiveSafeCommand?.agentProofStep?.startReadyToRun)}`,
    `agent_proof_step_start_blockers: ${status.objectiveSafeCommand?.agentProofStep?.startBlockers?.length ? status.objectiveSafeCommand.agentProofStep.startBlockers.join(',') : 'none'}`,
    `agent_proof_step_selected_command: ${clean(status.objectiveSafeCommand?.agentProofStep?.selectedCommandId || 'none')}`,
    `agent_proof_step_selected_starts_capture: ${yesNo(status.objectiveSafeCommand?.agentProofStep?.selectedStartsCapture)}`,
    `agent_proof_step_latest_auth_ok: ${yesNo(status.objectiveSafeCommand?.agentProofStep?.latestAuthOk)}`,
    `agent_proof_step_capture_completed: ${yesNo(status.objectiveSafeCommand?.agentProofStep?.captureCompleted)}`,
    `agent_proof_step_opens_browser_now: ${yesNo(status.objectiveSafeCommand?.agentProofStep?.opensBrowserNow)}`,
    `agent_proof_step_starts_capture_now: ${yesNo(status.objectiveSafeCommand?.agentProofStep?.startsCaptureNow)}`,
    `handoff_resume_watch_available: ${yesNo(status.objectiveSafeCommand?.handoffResumeWatch?.available)}`,
    `handoff_resume_watch_status: ${clean(status.objectiveSafeCommand?.handoffResumeWatch?.status || 'none')}`,
    `handoff_resume_watch_selected_command: ${clean(status.objectiveSafeCommand?.handoffResumeWatch?.selectedCommandId || 'none')}`,
    `handoff_resume_watch_selected_starts_capture: ${yesNo(status.objectiveSafeCommand?.handoffResumeWatch?.selectedStartsCapture)}`,
    `handoff_resume_watch_before_status: ${clean(status.objectiveSafeCommand?.handoffResumeWatch?.beforeStatus || 'none')}`,
    `handoff_resume_watch_before_latest_auth_ok: ${yesNo(status.objectiveSafeCommand?.handoffResumeWatch?.beforeLatestAuthOk)}`,
    `handoff_resume_watch_before_capture_completed: ${yesNo(status.objectiveSafeCommand?.handoffResumeWatch?.beforeCaptureCompleted)}`,
    `handoff_resume_watch_may_open_browser: ${yesNo(status.objectiveSafeCommand?.handoffResumeWatch?.mayOpenBrowser)}`,
    `target_approval_pack_exists: ${yesNo(status.objectiveSafeCommand?.targetApproval?.approvalPackExists)}`,
    `target_approval_pack_parse_ok: ${yesNo(status.objectiveSafeCommand?.targetApproval?.approvalPackParseOk)}`,
    `target_approval_candidate: ${clean(status.objectiveSafeCommand?.targetApproval?.selectedCandidate || 'none')}`,
    `target_approval_target_pack_exists: ${yesNo(status.objectiveSafeCommand?.targetApproval?.targetPackExists)}`,
    `target_approval_next: ${clean(status.objectiveSafeCommand?.targetApproval?.targetNext || 'none')}`,
    `target_approval_human_action: ${clean(status.objectiveSafeCommand?.targetApproval?.humanAction || 'none')}`,
    `target_approval_automation_blocker: ${clean(status.objectiveSafeCommand?.targetApproval?.automationBlocker || 'none')}`,
    `target_approval_capture_blocked: ${yesNo(status.objectiveSafeCommand?.targetApproval?.captureBlocked)}`,
    `target_approval_next_command_opens_browser: ${yesNo(status.objectiveSafeCommand?.targetApproval?.nextCommandOpensBrowser)}`,
    `target_approval_next_command_starts_capture: ${yesNo(status.objectiveSafeCommand?.targetApproval?.nextCommandStartsCapture)}`,
    `target_approval_next_command_requires_operator_approval: ${yesNo(status.objectiveSafeCommand?.targetApproval?.nextCommandRequiresOperatorApproval)}`,
    `target_approval_next_command_agent_may_run_unattended: ${yesNo(status.objectiveSafeCommand?.targetApproval?.nextCommandAgentMayRunUnattended)}`,
    `target_approval_resume_status: ${clean(status.objectiveSafeCommand?.targetApproval?.resumeStatus || 'none')}`,
    `target_approval_resume_ready_to_run: ${yesNo(status.objectiveSafeCommand?.targetApproval?.resumeReadyToRun)}`,
    `target_approval_resume_operator_ok_required: ${yesNo(status.objectiveSafeCommand?.targetApproval?.resumeOperatorOkRequired)}`,
    `target_approval_resume_operator_ok_accepted: ${yesNo(status.objectiveSafeCommand?.targetApproval?.resumeOperatorOkAccepted)}`,
    `target_approval_resume_agent_may_run_unattended: ${yesNo(status.objectiveSafeCommand?.targetApproval?.resumeAgentMayRunUnattended)}`,
    `target_approval_resume_planned_opens_browser: ${yesNo(status.objectiveSafeCommand?.targetApproval?.resumePlannedCommandOpensBrowser)}`,
    `target_approval_resume_planned_starts_capture: ${yesNo(status.objectiveSafeCommand?.targetApproval?.resumePlannedCommandStartsCapture)}`,
    `target_candidate_plan_candidate: ${clean(status.objectiveSafeCommand?.targetCandidatePlan?.selectedCandidate || 'none')}`,
    `target_candidate_plan_recommended_candidate: ${clean(status.objectiveSafeCommand?.targetCandidatePlan?.recommendedCandidate || 'none')}`,
    `target_candidate_plan_candidate_count: ${status.objectiveSafeCommand?.targetCandidatePlan?.candidateCount ?? 0}`,
    `target_candidate_target_pack_exists: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.targetPackExists)}`,
    `target_candidate_metadata_ok: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.metadataOk)}`,
    `target_candidate_auth_check_exists: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.authCheckExists)}`,
    `target_candidate_auth_check_ok: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.authCheckOk)}`,
    `target_candidate_auth_check_login_like: ${status.objectiveSafeCommand?.targetCandidatePlan?.authCheckLoginLike ?? 'unknown'}`,
    `target_candidate_benchmark_exists: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.benchmarkExists)}`,
    `target_candidate_benchmark_ok: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.benchmarkOk)}`,
    `target_candidate_proof_exists: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.proofExists)}`,
    `target_candidate_proof_ready: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.proofReady)}`,
    `target_candidate_proof_accepted: ${yesNo(status.objectiveSafeCommand?.targetCandidatePlan?.proofAccepted)}`,
    `target_candidate_next_action: ${clean(status.objectiveSafeCommand?.targetCandidatePlan?.nextAction || 'none')}`,
    `operator_approval_summary_scope: ${clean(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryScope || 'none')}`,
    `operator_approval_summary_human_action: ${clean(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryHumanAction || 'none')}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(status.objectiveSafeCommand?.targetApproval?.operatorApprovalSummaryAgentMustNotRunUnattended)}`,
    `agent_loop_next_action: ${clean(status.agentLoop?.nextAction || 'none')}`,
    `agent_loop_can_run_without_approval: ${yesNo(status.agentLoop?.canRunWithoutApproval)}`,
    `agent_loop_command_id: ${clean(status.agentLoop?.commandId || 'none')}`,
    `agent_loop_user_approval_required_for_background_start: ${yesNo(status.agentLoop?.userApprovalRequiredForBackgroundStart)}`,
    `agent_loop_background_start_requires_operator_ok: ${yesNo(status.agentLoop?.backgroundStartRequiresOperatorOk)}`,
    `agent_loop_opens_browser_now: ${yesNo(status.agentLoop?.opensBrowserNow)}`,
    `agent_loop_starts_capture_now: ${yesNo(status.agentLoop?.startsCaptureNow)}`,
    `devtools_9223_ok: ${yesNo(status.browser.devtoolsOk)}`,
    `devtools_browser: ${clean(status.browser.devtoolsBrowser || 'unknown')}`,
    `dia_9222_devtools_ok: ${yesNo(status.browser.diaDevtoolsOk)}`,
    `chrome_app_processes: ${status.browser.chromeAppProcesses}`,
    `regular_chrome_profiles: ${status.browser.regularChromeProfiles}`,
    `regular_chrome_debuggable: ${yesNo(status.browser.regularChromeDebuggable)}`,
    `target_chrome_profiles: ${status.browser.targetChromeProfiles}`,
    `target_chrome_debuggable: ${yesNo(status.browser.targetChromeDebuggable)}`,
    `codex_chrome_profiles: ${status.browser.codexChromeProfiles}`,
    `everyday_chrome_extension_prepared: ${yesNo(status.browser.everydayChromeExtensionPrepared)}`,
    `everyday_chrome_extension_backend_available: ${yesNo(status.browser.everydayChromeExtensionBackendAvailable)}`,
    `everyday_chrome_extension_ready: ${yesNo(status.browser.everydayChromeExtensionReady)}`,
    `everyday_chrome_cdp_allowed: ${yesNo(status.browser.everydayChromeCdpAllowed)}`,
    `codex_chrome_extension_enabled: ${yesNo(status.browser.codexChromeExtensionEnabled)}`,
    `codex_chrome_extension_native_host: ${yesNo(status.browser.codexChromeExtensionNativeHostCorrect)}`,
    `codex_chrome_extension_profile: ${clean(status.browser.codexChromeExtensionSelectedProfile || 'unknown')}`,
    `default_browser_http: ${clean(status.browser.defaultBrowserHttp || 'unknown')}`,
    `default_browser_https: ${clean(status.browser.defaultBrowserHttps || 'unknown')}`,
    `owner_sessions: ${status.browser.ownerSessions}`,
    `peekaboo_servers: ${status.browser.peekabooServers}`,
    `chrome_devtools_mcp_servers: ${status.browser.chromeDevtoolsMcpServers}`,
    `backend_matrix_status: ${clean(status.backendMatrix?.status || 'none')}`,
    `backend_matrix_exists: ${yesNo(status.backendMatrix?.exists)}`,
    `backend_matrix_stale: ${yesNo(status.backendMatrix?.stale)}`,
    `backend_matrix_age_seconds: ${status.backendMatrix?.ageSeconds ?? 'unknown'}`,
    `backend_matrix_default_backend: ${clean(status.backendMatrix?.defaultBackend || 'none')}`,
    `backend_matrix_default_agent_interface: ${clean(status.backendMatrix?.defaultAgentInterface || 'none')}`,
    `backend_matrix_search_backend: ${clean(status.backendMatrix?.searchBackend || 'none')}`,
    `backend_matrix_analyze_backend: ${clean(status.backendMatrix?.analyzeBackend || 'none')}`,
    `backend_matrix_scrape_backend: ${clean(status.backendMatrix?.scrapeBackend || 'none')}`,
    `backend_matrix_operate_backend: ${clean(status.backendMatrix?.operateBackend || 'none')}`,
    `backend_matrix_authenticated_backend: ${clean(status.backendMatrix?.authenticatedBackend || 'none')}`,
    `backend_matrix_existing_tab_backend: ${clean(status.backendMatrix?.existingTabBackend || 'none')}`,
    `backend_matrix_public_crawl_backend: ${clean(status.backendMatrix?.publicCrawlBackend || 'none')}`,
    `backend_matrix_compatibility_backend: ${clean(status.backendMatrix?.compatibilityBackend || 'none')}`,
    `backend_matrix_regular_chrome_status: ${clean(status.backendMatrix?.regularChromeStatus || 'none')}`,
    `backend_matrix_regular_chrome_new_background_tabs_allowed: ${yesNo(status.backendMatrix?.regularChromeNewBackgroundTabsAllowed)}`,
    `backend_matrix_chrome_mcp_new_background_tab_allowed: ${yesNo(status.backendMatrix?.chromeMcpNewBackgroundTabAllowed)}`,
    `backend_matrix_chrome_mcp_new_background_url_env: ${clean(status.backendMatrix?.chromeMcpNewBackgroundUrlEnv || 'none')}`,
    `backend_matrix_chrome_mcp_new_background_url_value_read: ${yesNo(status.backendMatrix?.chromeMcpNewBackgroundUrlValueRead)}`,
    `backend_matrix_chrome_mcp_route_ready: ${yesNo(status.backendMatrix?.chromeMcpRouteReady)}`,
    `backend_matrix_chrome_mcp_list_pages_timed_out: ${yesNo(status.backendMatrix?.chromeMcpListPagesTimedOut)}`,
    `backend_matrix_chrome_mcp_timeout_plan_source: ${clean(status.backendMatrix?.chromeMcpTimeoutPlanSource || 'none')}`,
    `backend_matrix_chrome_mcp_timeout_plan_status: ${clean(status.backendMatrix?.chromeMcpTimeoutPlanStatus || 'none')}`,
    `backend_matrix_chrome_mcp_timeout_plan_stale: ${yesNo(status.backendMatrix?.chromeMcpTimeoutPlanStale)}`,
    `backend_matrix_chrome_mcp_timeout_plan_prefer_extension_resume: ${yesNo(status.backendMatrix?.chromeMcpTimeoutPlanPreferExtensionResume)}`,
    `backend_matrix_backend_count: ${status.backendMatrix?.backendCount ?? 0}`,
    `backend_matrix_saved_secret_values_read: ${yesNo(status.backendMatrix?.savedSecretValuesRead)}`,
    `backend_matrix_saved_destructive_actions: ${yesNo(status.backendMatrix?.savedDestructiveActions)}`,
    `provider_doctor_default_backend: ${clean(status.providerDoctorStatus?.defaultBackend || 'none')}`,
    `provider_doctor_default_agent_interface: ${clean(status.providerDoctorStatus?.defaultAgentInterface || 'none')}`,
    `provider_doctor_adoption_next: ${clean(status.providerDoctorStatus?.adoptionNext || 'none')}`,
    `provider_doctor_agent_browser_cli_exists: ${yesNo(status.providerDoctorStatus?.agentBrowserCliExists)}`,
    `provider_doctor_agent_browser_chrome_for_testing_exists: ${yesNo(status.providerDoctorStatus?.agentBrowserChromeForTestingExists)}`,
    `provider_doctor_agent_browser_ready_for_engine_use: ${yesNo(status.providerDoctorStatus?.agentBrowserReadyForEngineUse)}`,
    `provider_doctor_agent_browser_missing_checks: ${status.providerDoctorStatus?.agentBrowserMissingChecks?.length ? status.providerDoctorStatus.agentBrowserMissingChecks.join(',') : 'none'}`,
    `provider_doctor_public_benchmark_proof_exists: ${yesNo(status.providerDoctorStatus?.publicBenchmarkProofExists)}`,
    `provider_doctor_public_benchmark_proof_ok: ${yesNo(status.providerDoctorStatus?.publicBenchmarkProofOk)}`,
    `provider_doctor_public_benchmark_proof_path: ${clean(status.providerDoctorStatus?.publicBenchmarkProofPath || 'none')}`,
    `provider_doctor_public_benchmark_fastest_measured_provider: ${clean(status.providerDoctorStatus?.publicBenchmarkFastestMeasuredProvider || 'none')}`,
    `provider_doctor_public_benchmark_direct_cdp_cold_ok: ${yesNo(status.providerDoctorStatus?.publicBenchmarkDirectCdpColdOk)}`,
    `provider_doctor_public_benchmark_direct_cdp_daemon_ok: ${yesNo(status.providerDoctorStatus?.publicBenchmarkDirectCdpDaemonOk)}`,
    `provider_doctor_public_benchmark_agent_browser_chrome_ok: ${yesNo(status.providerDoctorStatus?.publicBenchmarkAgentBrowserChromeOk)}`,
    `provider_doctor_public_benchmark_playwright_ok: ${yesNo(status.providerDoctorStatus?.publicBenchmarkPlaywrightOk)}`,
    `provider_doctor_public_benchmark_agent_may_run_unattended: ${yesNo(status.providerDoctorStatus?.publicBenchmarkAgentMayRunUnattended)}`,
    `provider_doctor_public_benchmark_starts_browser: ${yesNo(status.providerDoctorStatus?.publicBenchmarkStartsBrowser)}`,
    `provider_doctor_public_benchmark_reads_browser_storage: ${yesNo(status.providerDoctorStatus?.publicBenchmarkReadsBrowserStorage)}`,
    `provider_doctor_public_benchmark_returns_page_content: ${yesNo(status.providerDoctorStatus?.publicBenchmarkReturnsPageContent)}`,
    `provider_doctor_public_benchmark_command: ${clean(status.providerDoctorStatus?.publicBenchmarkCommand || 'none')}`,
    `provider_doctor_lightpanda_ready_for_public_benchmark: ${yesNo(status.providerDoctorStatus?.lightpandaReadyForPublicBenchmark)}`,
    `provider_doctor_lightpanda_missing_checks: ${status.providerDoctorStatus?.lightpandaMissingChecks?.length ? status.providerDoctorStatus.lightpandaMissingChecks.join(',') : 'none'}`,
    `provider_doctor_lightpanda_benchmark_agent_may_run_unattended: ${yesNo(status.providerDoctorStatus?.lightpandaBenchmarkAgentMayRunUnattended)}`,
    `provider_doctor_lightpanda_benchmark_starts_browser: ${yesNo(status.providerDoctorStatus?.lightpandaBenchmarkStartsBrowser)}`,
    `provider_doctor_lightpanda_benchmark_reads_browser_storage: ${yesNo(status.providerDoctorStatus?.lightpandaBenchmarkReadsBrowserStorage)}`,
    `provider_doctor_lightpanda_benchmark_returns_page_content: ${yesNo(status.providerDoctorStatus?.lightpandaBenchmarkReturnsPageContent)}`,
    `provider_doctor_lightpanda_benchmark_command: ${clean(status.providerDoctorStatus?.lightpandaBenchmarkCommand || 'none')}`,
    `provider_doctor_playwright_ready_for_public_smoke: ${yesNo(status.providerDoctorStatus?.playwrightReadyForPublicSmoke)}`,
    `provider_doctor_playwright_ready_for_authenticated_default: ${yesNo(status.providerDoctorStatus?.playwrightReadyForAuthenticatedDefault)}`,
    `provider_doctor_playwright_missing_checks: ${status.providerDoctorStatus?.playwrightMissingChecks?.length ? status.providerDoctorStatus.playwrightMissingChecks.join(',') : 'none'}`,
    `provider_doctor_playwright_storage_state_sensitive: ${yesNo(status.providerDoctorStatus?.playwrightStorageStateSensitive)}`,
    `provider_doctor_playwright_smoke_agent_may_run_unattended: ${yesNo(status.providerDoctorStatus?.playwrightSmokeAgentMayRunUnattended)}`,
    `provider_doctor_playwright_smoke_starts_browser: ${yesNo(status.providerDoctorStatus?.playwrightSmokeStartsBrowser)}`,
    `provider_doctor_playwright_smoke_reads_browser_storage: ${yesNo(status.providerDoctorStatus?.playwrightSmokeReadsBrowserStorage)}`,
    `provider_doctor_playwright_smoke_returns_page_content: ${yesNo(status.providerDoctorStatus?.playwrightSmokeReturnsPageContent)}`,
    `provider_doctor_playwright_smoke_command: ${clean(status.providerDoctorStatus?.playwrightSmokeCommand || 'none')}`,
    `provider_doctor_playwright_public_smoke_proof_exists: ${yesNo(status.providerDoctorStatus?.playwrightPublicSmokeProofExists)}`,
    `provider_doctor_playwright_public_smoke_proof_ok: ${yesNo(status.providerDoctorStatus?.playwrightPublicSmokeProofOk)}`,
    `provider_doctor_playwright_public_smoke_proof_path: ${clean(status.providerDoctorStatus?.playwrightPublicSmokeProofPath || 'none')}`,
    `provider_doctor_playwright_public_smoke_proof_heading_count: ${status.providerDoctorStatus?.playwrightPublicSmokeProofHeadingCount ?? 0}`,
    `provider_doctor_playwright_public_smoke_proof_link_count: ${status.providerDoctorStatus?.playwrightPublicSmokeProofLinkCount ?? 0}`,
    `provider_doctor_playwright_smoke_proof_agent_may_run_unattended: ${yesNo(status.providerDoctorStatus?.playwrightSmokeProofAgentMayRunUnattended)}`,
    `provider_doctor_playwright_smoke_proof_starts_browser: ${yesNo(status.providerDoctorStatus?.playwrightSmokeProofStartsBrowser)}`,
    `provider_doctor_playwright_smoke_proof_reads_browser_storage: ${yesNo(status.providerDoctorStatus?.playwrightSmokeProofReadsBrowserStorage)}`,
    `provider_doctor_playwright_smoke_proof_returns_page_content: ${yesNo(status.providerDoctorStatus?.playwrightSmokeProofReturnsPageContent)}`,
    `provider_doctor_playwright_smoke_proof_command: ${clean(status.providerDoctorStatus?.playwrightSmokeProofCommand || 'none')}`,
    `provider_doctor_selenium_ready_for_local_smoke: ${yesNo(status.providerDoctorStatus?.seleniumReadyForLocalSmoke)}`,
    `provider_doctor_selenium_missing_checks: ${status.providerDoctorStatus?.seleniumMissingChecks?.length ? status.providerDoctorStatus.seleniumMissingChecks.join(',') : 'none'}`,
    `provider_doctor_selenium_smoke_agent_may_run_unattended: ${yesNo(status.providerDoctorStatus?.seleniumSmokeAgentMayRunUnattended)}`,
    `provider_doctor_selenium_smoke_starts_browser: ${yesNo(status.providerDoctorStatus?.seleniumSmokeStartsBrowser)}`,
    `provider_doctor_selenium_smoke_command: ${clean(status.providerDoctorStatus?.seleniumSmokeCommand || 'none')}`,
    `chrome_mcp_timeout_plan_status: ${clean(status.chromeMcpTimeoutPlan?.status || 'none')}`,
    `chrome_mcp_timeout_plan_exists: ${yesNo(status.chromeMcpTimeoutPlan?.exists)}`,
    `chrome_mcp_timeout_plan_stale: ${yesNo(status.chromeMcpTimeoutPlan?.stale)}`,
    `chrome_mcp_timeout_plan_age_seconds: ${status.chromeMcpTimeoutPlan?.ageSeconds ?? 'unknown'}`,
    `chrome_mcp_timeout_plan_connected: ${yesNo(status.chromeMcpTimeoutPlan?.connected)}`,
    `chrome_mcp_timeout_plan_page_list_ok: ${yesNo(status.chromeMcpTimeoutPlan?.pageListOk)}`,
    `chrome_mcp_timeout_plan_page_list_timeout: ${yesNo(status.chromeMcpTimeoutPlan?.pageListTimeout)}`,
    `chrome_mcp_timeout_plan_new_background_tabs_allowed: ${yesNo(status.chromeMcpTimeoutPlan?.newBackgroundTabsAllowed)}`,
    `chrome_mcp_timeout_plan_new_background_tab_option: ${clean(status.chromeMcpTimeoutPlan?.newBackgroundTabOption || 'none')}`,
    `chrome_mcp_timeout_plan_new_background_url_env: ${clean(status.chromeMcpTimeoutPlan?.newBackgroundUrlEnv || 'none')}`,
    `chrome_mcp_timeout_plan_new_background_url_value_read: ${yesNo(status.chromeMcpTimeoutPlan?.newBackgroundUrlValueRead)}`,
    `chrome_mcp_timeout_plan_use_everyday_chrome_now: ${yesNo(status.chromeMcpTimeoutPlan?.useEverydayChromeNow)}`,
    `chrome_mcp_timeout_plan_prefer_extension_resume: ${yesNo(status.chromeMcpTimeoutPlan?.preferExtensionResume)}`,
    `chrome_mcp_timeout_plan_cleanup_is_manual: ${yesNo(status.chromeMcpTimeoutPlan?.cleanupIsManual)}`,
    `chrome_mcp_timeout_plan_next_action: ${clean(status.chromeMcpTimeoutPlan?.nextAction || 'none')}`,
    `chrome_mcp_timeout_plan_findings: ${status.chromeMcpTimeoutPlan?.findings?.length ? status.chromeMcpTimeoutPlan.findings.join(',') : 'none'}`,
    `chrome_mcp_timeout_plan_cleanup_owner_sessions: ${status.chromeMcpTimeoutPlan?.cleanupOwnerSessions ?? 0}`,
    `chrome_mcp_timeout_plan_cleanup_review_owner_pids: ${status.chromeMcpTimeoutPlan?.cleanupReviewOwnerPids?.length ? status.chromeMcpTimeoutPlan.cleanupReviewOwnerPids.join(',') : 'none'}`,
    `chrome_mcp_autostart_plan_exists: ${yesNo(status.chromeMcpAutostartPlan?.exists)}`,
    `chrome_mcp_autostart_plan_parse_ok: ${yesNo(status.chromeMcpAutostartPlan?.parseOk)}`,
    `chrome_mcp_autostart_plan_label: ${clean(status.chromeMcpAutostartPlan?.label || 'none')}`,
    `chrome_mcp_autostart_plan_browser_url: ${clean(status.chromeMcpAutostartPlan?.browserUrl || 'none')}`,
    `chrome_mcp_autostart_plan_plist_exists: ${yesNo(status.chromeMcpAutostartPlan?.plistExists)}`,
    `chrome_mcp_autostart_plan_install_path_exists: ${yesNo(status.chromeMcpAutostartPlan?.installPathExists)}`,
    `chrome_mcp_autostart_plan_install_requires_operator_approval: ${yesNo(status.chromeMcpAutostartPlan?.installRequiresOperatorApproval)}`,
    `chrome_mcp_autostart_plan_agent_may_install_unattended: ${yesNo(status.chromeMcpAutostartPlan?.agentMayInstallUnattended)}`,
    `run_gate_ok_for_agent_loops: ${yesNo(status.runGate?.okForAgentLoops)}`,
    `run_gate_unguarded_agent_dangerous: ${status.runGate?.unguardedAgentDangerous ?? 0}`,
    `run_gate_agent_safe_unattended: ${status.runGate?.agentSafeUnattended ?? 0}`,
    `run_gate_operator_gated: ${status.runGate?.operatorGated ?? 0}`,
    `run_gate_exact_operator_ok: ${status.runGate?.exactOperatorOk ?? 0}`,
    `run_gate_direct_operator: ${status.runGate?.directOperator ?? 0}`,
    `run_gate_total_surfaces: ${status.runGate?.totalSurfaces ?? 0}`,
    `run_gate_opens_browser_now: ${yesNo(status.runGate?.opensBrowserNow)}`,
    `run_gate_starts_capture_now: ${yesNo(status.runGate?.startsCaptureNow)}`,
    `run_gate_starts_background_process_now: ${yesNo(status.runGate?.startsBackgroundProcessNow)}`,
    `run_gate_next_action: ${clean(status.runGate?.nextAction || 'none')}`,
    `secret_headless_ready: ${yesNo(status.secret.headlessReady)}`,
    `secret_mode: ${clean(status.secret.recommendedHeadlessMode || 'unknown')}`,
    `secret_env_file: ${yesNo(status.secret.serviceAccountEnvFileUsable)}`,
    `secret_config_available: ${yesNo(status.secret.headlessConfigAvailable)}`,
    `secret_run_command_id: ${clean(status.secret.runSelect?.commandId || 'none')}`,
    `secret_run_selected_candidate: ${clean(status.secret.runSelect?.selectedCandidate || 'none')}`,
    `secret_run_selected_mode: ${clean(status.secret.runSelect?.selectedMode || 'none')}`,
    `secret_run_headless: ${yesNo(status.secret.runSelect?.headless)}`,
    `secret_run_ready_to_run_now: ${yesNo(status.secret.runSelect?.readyToRunNow)}`,
    `secret_run_setup_required: ${status.secret.runSelect?.setupRequired?.length ? status.secret.runSelect.setupRequired.join(',') : 'none'}`,
    `secret_run_wrapped_opens_browser: ${yesNo(status.secret.runSelect?.runCommandSafety?.opensBrowser)}`,
    `secret_run_wrapped_starts_capture: ${yesNo(status.secret.runSelect?.runCommandSafety?.startsCapture)}`,
    `secret_run_wrapped_starts_background: ${yesNo(status.secret.runSelect?.runCommandSafety?.startsBackground)}`,
    `secret_run_wrapped_requires_operator_approval: ${yesNo(status.secret.runSelect?.runCommandSafety?.requiresOperatorApproval)}`,
    `secret_run_wrapped_agent_may_run_unattended: ${yesNo(status.secret.runSelect?.runCommandSafety?.agentMayRunUnattended)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `warnings: ${status.warnings.length}`
  ];
  if (status.agentLoop?.canRunWithoutApproval && commandShell(status.agentLoop?.command)) {
    lines.push(`command: ${status.agentLoop.command.shell}`);
  }
  if (status.commands.loginCaptureWait?.shell) {
    lines.push('login_capture_wait_opens_browser: yes');
    lines.push('login_capture_wait_starts_capture: no');
    lines.push('login_capture_wait_requires_operator_approval: yes');
    lines.push('login_capture_wait_agent_may_run_unattended: no');
  }
  if (status.objective.handoffResume?.loginOpenPort) {
    lines.push(`handoff_resume_login_port: ${clean(status.objective.handoffResume.loginOpenPort)}`);
  }
  if (status.objective.handoffResume?.operatorHandoffAuthCheckPort) {
    lines.push(`handoff_auth_check_port: ${clean(status.objective.handoffResume.operatorHandoffAuthCheckPort)}`);
  }
  if (status.commands.authCheck?.shell) lines.push(`auth_check_command: ${status.commands.authCheck.shell}`);
  if (status.commands.authWatch?.shell) lines.push(`auth_watch_command: ${status.commands.authWatch.shell}`);
  if (status.commands.loginCaptureWait?.shell) lines.push(`login_capture_wait_command: ${status.commands.loginCaptureWait.shell}`);
  if (status.commands.objectiveSafeCommand?.shell) lines.push(`objective_safe_command: ${status.commands.objectiveSafeCommand.shell}`);
  if (status.commands.providerDoctorStatus?.shell) lines.push(`provider_doctor_status_command: ${status.commands.providerDoctorStatus.shell}`);
  if (status.commands.runtimeAudit?.shell) lines.push(`runtime_audit_command: ${status.commands.runtimeAudit.shell}`);
  if (status.commands.runtimeCleanup?.shell) lines.push(`runtime_cleanup_plan_command: ${status.commands.runtimeCleanup.shell}`);
  if (status.commands.backendMatrix?.shell) lines.push(`backend_matrix_refresh_command: ${status.commands.backendMatrix.shell}`);
  if (status.commands.backendMatrixStatus?.shell) lines.push(`backend_matrix_status_command: ${status.commands.backendMatrixStatus.shell}`);
  if (status.commands.chromeMcpTimeoutPlanStatus?.shell) lines.push(`chrome_mcp_timeout_plan_status_command: ${status.commands.chromeMcpTimeoutPlanStatus.shell}`);
  if (status.commands.chromeMcpTimeoutPlanRefresh?.shell) lines.push(`chrome_mcp_timeout_plan_refresh_command: ${status.commands.chromeMcpTimeoutPlanRefresh.shell}`);
  if (status.commands.chromeMcpAutostartPlan?.shell) lines.push(`chrome_mcp_autostart_plan_command: ${status.commands.chromeMcpAutostartPlan.shell}`);
  if (status.commands.chromeMcpAutostartPlanStatus?.shell) lines.push(`chrome_mcp_autostart_plan_status_command: ${status.commands.chromeMcpAutostartPlanStatus.shell}`);
  if (status.commands.chromeMcpAutostartPlanRefresh?.shell) lines.push(`chrome_mcp_autostart_plan_refresh_command: ${status.commands.chromeMcpAutostartPlanRefresh.shell}`);
  if (status.commands.runGateAudit?.shell) lines.push(`run_gate_audit_command: ${status.commands.runGateAudit.shell}`);
  if (status.secret.runSelect?.selectorCommand?.shell) {
    lines.push('secret_run_select_opens_browser: no');
    lines.push('secret_run_select_starts_capture: no');
    lines.push('secret_run_select_starts_background: no');
    lines.push('secret_run_select_requires_operator_approval: no');
    lines.push('secret_run_select_agent_may_run_unattended: yes');
    lines.push(`secret_run_select_command: ${status.secret.runSelect.selectorCommand.shell}`);
  }
  if (status.secret.runSelect?.runCommand?.shell) lines.push(`secret_run_wrapped_command: ${status.secret.runSelect.runCommand.shell}`);
  if (status.secret.runSelect?.setupCommand?.shell) lines.push(`secret_run_setup_command: ${status.secret.runSelect.setupCommand.shell}`);
  if (status.chromeMcpTimeoutPlan?.regularChromeUseCommand?.shell) lines.push(`chrome_mcp_timeout_plan_regular_chrome_use_command: ${status.chromeMcpTimeoutPlan.regularChromeUseCommand.shell}`);
  if (status.chromeMcpTimeoutPlan?.runtimeCleanupPlanCommand?.shell) lines.push(`chrome_mcp_timeout_plan_runtime_cleanup_command: ${status.chromeMcpTimeoutPlan.runtimeCleanupPlanCommand.shell}`);
  if (status.chromeMcpTimeoutPlan?.chromeExtensionResumeApprovalCommand?.shell) lines.push(`chrome_mcp_timeout_plan_extension_resume_approval_command: ${status.chromeMcpTimeoutPlan.chromeExtensionResumeApprovalCommand.shell}`);
  if (status.chromeMcpTimeoutPlan?.chromeMcpStatusRetryCommand?.shell) lines.push(`chrome_mcp_timeout_plan_retry_command: ${status.chromeMcpTimeoutPlan.chromeMcpStatusRetryCommand.shell}`);
  if (status.commands.backgroundProofStatus?.shell) lines.push(`background_proof_status_command: ${status.commands.backgroundProofStatus.shell}`);
  if (status.commands.backgroundProofNoOpenWaitCapture?.shell) lines.push(`background_proof_no_open_wait_capture_command: ${status.commands.backgroundProofNoOpenWaitCapture.shell}`);
  if (status.commands.backgroundProofNoOpenWaitCaptureBackground?.shell) lines.push(`background_proof_no_open_wait_capture_background_command: ${status.commands.backgroundProofNoOpenWaitCaptureBackground.shell}`);
  if (status.commands.backgroundProofCaptureStart?.shell) lines.push(`background_proof_capture_start_command: ${status.commands.backgroundProofCaptureStart.shell}`);
  if (status.commands.backgroundProofMonitorStart?.shell) lines.push(`background_proof_monitor_start_command: ${status.commands.backgroundProofMonitorStart.shell}`);
  if (status.commands.agentProofStepPlan?.shell) lines.push(`agent_proof_step_plan_command: ${status.commands.agentProofStepPlan.shell}`);
  if (status.commands.agentProofStepRun?.shell) lines.push(`agent_proof_step_run_command: ${status.commands.agentProofStepRun.shell}`);
  if (status.commands.agentProofStepStart?.shell) lines.push(`agent_proof_step_start_command: ${status.commands.agentProofStepStart.shell}`);
  if (status.commands.agentProofStepStatus?.shell) lines.push(`agent_proof_step_status_command: ${status.commands.agentProofStepStatus.shell}`);
  if (status.commands.handoffResumeWatch?.shell) lines.push(`handoff_resume_watch_plan_command: ${status.commands.handoffResumeWatch.shell}`);
  if (status.commands.handoffResumeWatchRun?.shell) lines.push(`handoff_resume_watch_run_command: ${status.commands.handoffResumeWatchRun.shell}`);
  if (status.commands.targetApprovalStatus?.shell) lines.push(`target_approval_status_command: ${status.commands.targetApprovalStatus.shell}`);
  if (status.commands.targetApprovalPreflight?.shell) lines.push(`target_approval_preflight_command: ${status.commands.targetApprovalPreflight.shell}`);
  if (status.commands.targetApprovalResumePreflight?.shell) lines.push(`target_approval_resume_preflight_command: ${status.commands.targetApprovalResumePreflight.shell}`);
  if (status.commands.targetApprovalResumeProofPlan?.shell) lines.push(`target_approval_resume_proof_plan_command: ${status.commands.targetApprovalResumeProofPlan.shell}`);
  if (status.commands.targetApprovalResumePlan?.shell) lines.push(`target_approval_resume_plan_command: ${status.commands.targetApprovalResumePlan.shell}`);
  if (status.commands.targetApprovalResumeStatus?.shell) lines.push(`target_approval_resume_status_command: ${status.commands.targetApprovalResumeStatus.shell}`);
  if (status.commands.targetApprovalResumeWatch?.shell) {
    lines.push('target_approval_resume_watch_opens_browser: no');
    lines.push('target_approval_resume_watch_starts_capture: no');
    lines.push('target_approval_resume_watch_requires_operator_approval: no');
    lines.push('target_approval_resume_watch_agent_may_run_unattended: yes');
    lines.push(`target_approval_resume_watch_command: ${status.commands.targetApprovalResumeWatch.shell}`);
  }
  if (status.commands.targetApprovalResumeRun?.shell) lines.push(`target_approval_resume_run_command: ${status.commands.targetApprovalResumeRun.shell}`);
  if (status.commands.targetCandidatePlan?.shell) lines.push(`target_candidate_plan_command: ${status.commands.targetCandidatePlan.shell}`);
  if (commandShell(status.agentLoop?.statusCommand)) lines.push(`agent_loop_status_command: ${status.agentLoop.statusCommand.shell}`);
  if (commandShell(status.agentLoop?.command)) lines.push(`agent_loop_command: ${status.agentLoop.command.shell}`);
  if (commandShell(status.agentLoop?.pollCommand)) lines.push(`agent_loop_poll_command: ${status.agentLoop.pollCommand.shell}`);
  if (commandShell(status.agentLoop?.stepPlanCommand)) lines.push(`agent_loop_step_plan_command: ${status.agentLoop.stepPlanCommand.shell}`);
  if (commandShell(status.agentLoop?.stepRunCommand)) lines.push(`agent_loop_step_run_command: ${status.agentLoop.stepRunCommand.shell}`);
  if (commandShell(status.agentLoop?.stepStatusCommand)) lines.push(`agent_loop_step_status_command: ${status.agentLoop.stepStatusCommand.shell}`);
  if (commandShell(status.agentLoop?.backgroundStatusCommand)) lines.push(`agent_loop_background_status_command: ${status.agentLoop.backgroundStatusCommand.shell}`);
  if (commandShell(status.agentLoop?.backgroundNoOpenWaitCaptureCommand)) lines.push(`agent_loop_background_no_open_wait_capture_command: ${status.agentLoop.backgroundNoOpenWaitCaptureCommand.shell}`);
  if (commandShell(status.agentLoop?.backgroundNoOpenWaitCaptureBackgroundCommand)) lines.push(`agent_loop_background_no_open_wait_capture_background_command: ${status.agentLoop.backgroundNoOpenWaitCaptureBackgroundCommand.shell}`);
  if (commandShell(status.agentLoop?.backgroundCaptureStartCommand)) lines.push(`agent_loop_background_capture_start_command: ${status.agentLoop.backgroundCaptureStartCommand.shell}`);
  if (commandShell(status.agentLoop?.backgroundMonitorStartCommand)) lines.push(`agent_loop_background_monitor_start_command: ${status.agentLoop.backgroundMonitorStartCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function buildAgentNext(status) {
  const loop = status.agentLoop || {};
  const safeCommand = loop.canRunWithoutApproval
    ? (loop.stepRunCommand || loop.command || loop.pollCommand || null)
    : null;
  const pollCommand = loop.canRunWithoutApproval
    ? (loop.pollCommand || loop.command || null)
    : null;
  const operatorApprovalCommand = status.commands?.targetApprovalResumeRun
    || status.commands?.loginCaptureWait
    || status.objective?.recommendedCommand?.command
    || null;
  const operatorApprovalPreflightCommand = status.commands?.targetApprovalPreflight || null;
  const operatorApprovalProofPlanCommand = status.commands?.targetApprovalResumeProofPlan || null;
  const operatorApprovalPlanCommand = status.commands?.targetApprovalResumePlan || null;
  const agentPreflightMayRunWithoutApproval = Boolean(operatorApprovalPreflightCommand);
  const agentProofPlanMayRunWithoutApproval = Boolean(operatorApprovalProofPlanCommand);
  const targetApproval = status.objectiveSafeCommand?.targetApproval || {};
  const operatorApprovalCommandOpensBrowser = Boolean(
    targetApproval.resumePlannedCommandOpensBrowser
    || targetApproval.nextCommandOpensBrowser
    || operatorApprovalCommand?.args?.includes?.('--open-login')
    || operatorApprovalCommand?.args?.includes?.('target-login-capture')
  );
  const operatorApprovalCommandStartsCapture = Boolean(
    targetApproval.resumePlannedCommandStartsCapture
    || targetApproval.nextCommandStartsCapture
    || operatorApprovalCommand?.args?.includes?.('--wait-auth')
    || operatorApprovalCommand?.args?.includes?.('target-login-capture')
  );
  const operatorApprovalRequired = Boolean(
    status.objective?.operatorInput
    || targetApproval.resumeOperatorOkRequired
    || targetApproval.nextCommandRequiresOperatorApproval
  );
  const blockedReason = status.objectiveSafeCommand?.blockedReason
    || targetApproval.automationBlocker
    || '';
  return {
    safeMode: Boolean(status.safeMode),
    complete: Boolean(status.complete),
    objectiveStatus: status.objective?.status || '',
    nextAction: loop.nextAction || status.objective?.nextAction || 'none',
    agentCanRunWithoutApproval: Boolean(loop.canRunWithoutApproval),
    agentCommandId: loop.commandId || status.objectiveSafeCommand?.commandId || 'none',
    agentRunCommand: safeCommand,
    agentPollCommand: pollCommand,
    agentStatusCommand: loop.statusCommand || status.commands?.status || null,
    agentStepPlanCommand: loop.stepPlanCommand || null,
    agentStepStatusCommand: loop.stepStatusCommand || null,
    objectiveCompletionStrictCommand: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
    agentPreflightAvailable: Boolean(operatorApprovalPreflightCommand),
    agentPreflightAction: agentPreflightMayRunWithoutApproval ? 'run-operator-approval-preflight' : 'none',
    agentPreflightMayRunWithoutApproval,
    agentPreflightCommand: operatorApprovalPreflightCommand,
    agentProofPlanAvailable: Boolean(operatorApprovalProofPlanCommand),
    agentProofPlanAction: agentProofPlanMayRunWithoutApproval ? 'run-target-proof-plan' : 'none',
    agentProofPlanMayRunWithoutApproval,
    agentProofPlanCommand: operatorApprovalProofPlanCommand,
    operatorApprovalRequired,
    operatorApprovalCommand,
    operatorApprovalPreflightCommand,
    operatorApprovalProofPlanCommand,
    operatorApprovalPlanCommand,
    operatorApprovalPreflightOpensBrowser: false,
    operatorApprovalPreflightStartsCapture: false,
    operatorApprovalPreflightReadsBrowserStorage: false,
    operatorApprovalPreflightReturnsPageContent: false,
    operatorApprovalPreflightMayRunUnattended: Boolean(operatorApprovalPreflightCommand),
    operatorApprovalProofPlanOpensBrowser: false,
    operatorApprovalProofPlanStartsCapture: false,
    operatorApprovalProofPlanReadsBrowserStorage: false,
    operatorApprovalProofPlanReturnsPageContent: false,
    operatorApprovalProofPlanMayRunUnattended: Boolean(operatorApprovalProofPlanCommand),
    operatorApprovalCommandOpensBrowser,
    operatorApprovalCommandStartsCapture,
    operatorApprovalCommandAgentMayRunUnattended: false,
    humanAction: targetApproval.humanAction || '',
    automationBlocker: targetApproval.automationBlocker || blockedReason,
    blockedReason,
    opensBrowserNow: Boolean(loop.opensBrowserNow),
    startsCaptureNow: Boolean(loop.startsCaptureNow),
    runGateOkForAgentLoops: Boolean(status.runGate?.okForAgentLoops),
    runGateUnguardedAgentDangerous: status.runGate?.unguardedAgentDangerous ?? 0,
    defaultBackend: status.backendMatrix?.defaultBackend || '',
    defaultAgentInterface: status.backendMatrix?.defaultAgentInterface || '',
    authenticatedBackend: status.backendMatrix?.authenticatedBackend || '',
    existingTabBackend: status.backendMatrix?.existingTabBackend || '',
    providerDefaultBackend: status.providerDoctorStatus?.defaultBackend || status.backendMatrix?.defaultBackend || '',
    providerDefaultAgentInterface: status.providerDoctorStatus?.defaultAgentInterface || status.backendMatrix?.defaultAgentInterface || '',
    providerPublicBenchmarkProofExists: Boolean(status.providerDoctorStatus?.publicBenchmarkProofExists),
    providerPublicBenchmarkProofOk: Boolean(status.providerDoctorStatus?.publicBenchmarkProofOk),
    providerPublicBenchmarkProofPath: status.providerDoctorStatus?.publicBenchmarkProofPath || '',
    providerPublicBenchmarkFastestMeasuredProvider: status.providerDoctorStatus?.publicBenchmarkFastestMeasuredProvider || '',
    providerPublicBenchmarkDirectCdpColdOk: Boolean(status.providerDoctorStatus?.publicBenchmarkDirectCdpColdOk),
    providerPublicBenchmarkDirectCdpDaemonOk: Boolean(status.providerDoctorStatus?.publicBenchmarkDirectCdpDaemonOk),
    providerPublicBenchmarkAgentBrowserChromeOk: Boolean(status.providerDoctorStatus?.publicBenchmarkAgentBrowserChromeOk),
    providerPublicBenchmarkPlaywrightOk: Boolean(status.providerDoctorStatus?.publicBenchmarkPlaywrightOk),
    providerPublicBenchmarkAgentMayRunUnattended: Boolean(status.providerDoctorStatus?.publicBenchmarkAgentMayRunUnattended),
    providerPublicBenchmarkStartsBrowser: Boolean(status.providerDoctorStatus?.publicBenchmarkStartsBrowser),
    providerPublicBenchmarkReadsBrowserStorage: Boolean(status.providerDoctorStatus?.publicBenchmarkReadsBrowserStorage),
    providerPublicBenchmarkReturnsPageContent: Boolean(status.providerDoctorStatus?.publicBenchmarkReturnsPageContent),
    providerPublicBenchmarkCommand: status.providerDoctorStatus?.publicBenchmarkCommand || '',
    providerLightpandaReadyForPublicBenchmark: Boolean(status.providerDoctorStatus?.lightpandaReadyForPublicBenchmark),
    providerLightpandaBenchmarkAgentMayRunUnattended: Boolean(status.providerDoctorStatus?.lightpandaBenchmarkAgentMayRunUnattended),
    providerLightpandaBenchmarkStartsBrowser: Boolean(status.providerDoctorStatus?.lightpandaBenchmarkStartsBrowser),
    providerLightpandaBenchmarkReadsBrowserStorage: Boolean(status.providerDoctorStatus?.lightpandaBenchmarkReadsBrowserStorage),
    providerLightpandaBenchmarkReturnsPageContent: Boolean(status.providerDoctorStatus?.lightpandaBenchmarkReturnsPageContent),
    providerLightpandaBenchmarkCommand: status.providerDoctorStatus?.lightpandaBenchmarkCommand
      || status.providerDoctorStatus?.lightpanda?.benchmarkCommand
      || status.providerDoctorStatus?.commands?.lightpandaBenchmark
      || '',
    providerPlaywrightReadyForPublicSmoke: Boolean(status.providerDoctorStatus?.playwrightReadyForPublicSmoke),
    providerPlaywrightReadyForAuthenticatedDefault: Boolean(status.providerDoctorStatus?.playwrightReadyForAuthenticatedDefault),
    providerPlaywrightStorageStateSensitive: Boolean(status.providerDoctorStatus?.playwrightStorageStateSensitive),
    providerPlaywrightSmokeCommand: status.providerDoctorStatus?.playwrightSmokeCommand
      || status.providerDoctorStatus?.playwright?.smokeCommand
      || status.providerDoctorStatus?.commands?.playwrightSmoke?.shell
      || '',
    providerPlaywrightPublicSmokeProofExists: Boolean(status.providerDoctorStatus?.playwrightPublicSmokeProofExists),
    providerPlaywrightPublicSmokeProofOk: Boolean(status.providerDoctorStatus?.playwrightPublicSmokeProofOk),
    providerPlaywrightPublicSmokeProofPath: status.providerDoctorStatus?.playwrightPublicSmokeProofPath || '',
    providerPlaywrightPublicSmokeProofHeadingCount: status.providerDoctorStatus?.playwrightPublicSmokeProofHeadingCount ?? 0,
    providerPlaywrightPublicSmokeProofLinkCount: status.providerDoctorStatus?.playwrightPublicSmokeProofLinkCount ?? 0,
    providerPlaywrightSmokeProofCommand: status.providerDoctorStatus?.playwrightSmokeProofCommand || '',
    providerPlaywrightSmokeProofAgentMayRunUnattended: Boolean(status.providerDoctorStatus?.playwrightSmokeProofAgentMayRunUnattended),
    providerPlaywrightSmokeProofStartsBrowser: Boolean(status.providerDoctorStatus?.playwrightSmokeProofStartsBrowser),
    providerPlaywrightSmokeProofReadsBrowserStorage: Boolean(status.providerDoctorStatus?.playwrightSmokeProofReadsBrowserStorage),
    providerPlaywrightSmokeProofReturnsPageContent: Boolean(status.providerDoctorStatus?.playwrightSmokeProofReturnsPageContent),
    providerSeleniumReadyForLocalSmoke: Boolean(status.providerDoctorStatus?.seleniumReadyForLocalSmoke),
    providerSeleniumSmokeAgentMayRunUnattended: Boolean(status.providerDoctorStatus?.seleniumSmokeAgentMayRunUnattended),
    providerSeleniumSmokeStartsBrowser: Boolean(status.providerDoctorStatus?.seleniumSmokeStartsBrowser),
    providerSeleniumSmokeCommand: status.providerDoctorStatus?.seleniumSmokeCommand
      || status.providerDoctorStatus?.selenium?.smokeCommand
      || status.providerDoctorStatus?.commands?.seleniumSmoke
      || '',
    providerDoctorCommand: status.commands?.providerDoctorStatus || status.providerDoctorStatus?.command || null,
    providerDoctorOpensBrowser: false,
    providerDoctorStartsCapture: false,
    providerDoctorReadsBrowserStorage: false,
    providerDoctorReturnsPageContent: false,
    providerDoctorMayRunUnattended: Boolean(status.commands?.providerDoctorStatus || status.providerDoctorStatus?.command),
    chromeMcpRouteReady: Boolean(status.backendMatrix?.chromeMcpRouteReady),
    chromeMcpPageListTimeout: Boolean(status.backendMatrix?.chromeMcpListPagesTimedOut),
    everydayChromeExtensionReady: Boolean(status.browser?.everydayChromeExtensionReady),
    everydayChromeCdpAllowed: Boolean(status.browser?.everydayChromeCdpAllowed),
    secretHeadlessReady: Boolean(status.secret?.headlessReady),
    secretValuesRead: Boolean(status.secretValuesRead),
    warnings: status.warnings || []
  };
}

export function formatAgentNextCompact(next) {
  const lines = [
    `safe_mode: ${yesNo(next.safeMode)}`,
    `complete: ${yesNo(next.complete)}`,
    `objective_status: ${clean(next.objectiveStatus || 'none')}`,
    `agent_next_action: ${clean(next.nextAction || 'none')}`,
    `agent_can_run_without_approval: ${yesNo(next.agentCanRunWithoutApproval)}`,
    `agent_command_id: ${clean(next.agentCommandId || 'none')}`,
    `agent_preflight_available: ${yesNo(next.agentPreflightAvailable)}`,
    `agent_preflight_action: ${clean(next.agentPreflightAction || 'none')}`,
    `agent_preflight_may_run_without_approval: ${yesNo(next.agentPreflightMayRunWithoutApproval)}`,
    `agent_proof_plan_available: ${yesNo(next.agentProofPlanAvailable)}`,
    `agent_proof_plan_action: ${clean(next.agentProofPlanAction || 'none')}`,
    `agent_proof_plan_may_run_without_approval: ${yesNo(next.agentProofPlanMayRunWithoutApproval)}`,
    `operator_approval_required: ${yesNo(next.operatorApprovalRequired)}`,
    `operator_approval_preflight_opens_browser: ${yesNo(next.operatorApprovalPreflightOpensBrowser)}`,
    `operator_approval_preflight_starts_capture: ${yesNo(next.operatorApprovalPreflightStartsCapture)}`,
    `operator_approval_preflight_reads_browser_storage: ${yesNo(next.operatorApprovalPreflightReadsBrowserStorage)}`,
    `operator_approval_preflight_returns_page_content: ${yesNo(next.operatorApprovalPreflightReturnsPageContent)}`,
    `operator_approval_preflight_may_run_unattended: ${yesNo(next.operatorApprovalPreflightMayRunUnattended)}`,
    `operator_approval_proof_plan_opens_browser: ${yesNo(next.operatorApprovalProofPlanOpensBrowser)}`,
    `operator_approval_proof_plan_starts_capture: ${yesNo(next.operatorApprovalProofPlanStartsCapture)}`,
    `operator_approval_proof_plan_reads_browser_storage: ${yesNo(next.operatorApprovalProofPlanReadsBrowserStorage)}`,
    `operator_approval_proof_plan_returns_page_content: ${yesNo(next.operatorApprovalProofPlanReturnsPageContent)}`,
    `operator_approval_proof_plan_may_run_unattended: ${yesNo(next.operatorApprovalProofPlanMayRunUnattended)}`,
    `operator_approval_opens_browser: ${yesNo(next.operatorApprovalCommandOpensBrowser)}`,
    `operator_approval_starts_capture: ${yesNo(next.operatorApprovalCommandStartsCapture)}`,
    `operator_approval_agent_may_run_unattended: ${yesNo(next.operatorApprovalCommandAgentMayRunUnattended)}`,
    `human_action: ${clean(next.humanAction || 'none')}`,
    `automation_blocker: ${clean(next.automationBlocker || next.blockedReason || 'none')}`,
    `opens_browser_now: ${yesNo(next.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(next.startsCaptureNow)}`,
    `run_gate_ok_for_agent_loops: ${yesNo(next.runGateOkForAgentLoops)}`,
    `run_gate_unguarded_agent_dangerous: ${next.runGateUnguardedAgentDangerous ?? 0}`,
    `default_backend: ${clean(next.defaultBackend || 'none')}`,
    `default_agent_interface: ${clean(next.defaultAgentInterface || 'none')}`,
    `authenticated_backend: ${clean(next.authenticatedBackend || 'none')}`,
    `existing_tab_backend: ${clean(next.existingTabBackend || 'none')}`,
    `provider_default_backend: ${clean(next.providerDefaultBackend || 'none')}`,
    `provider_default_agent_interface: ${clean(next.providerDefaultAgentInterface || 'none')}`,
    `provider_public_benchmark_proof_exists: ${yesNo(next.providerPublicBenchmarkProofExists)}`,
    `provider_public_benchmark_proof_ok: ${yesNo(next.providerPublicBenchmarkProofOk)}`,
    `provider_public_benchmark_proof_path: ${clean(next.providerPublicBenchmarkProofPath || 'none')}`,
    `provider_public_benchmark_fastest_measured_provider: ${clean(next.providerPublicBenchmarkFastestMeasuredProvider || 'none')}`,
    `provider_public_benchmark_direct_cdp_cold_ok: ${yesNo(next.providerPublicBenchmarkDirectCdpColdOk)}`,
    `provider_public_benchmark_direct_cdp_daemon_ok: ${yesNo(next.providerPublicBenchmarkDirectCdpDaemonOk)}`,
    `provider_public_benchmark_agent_browser_chrome_ok: ${yesNo(next.providerPublicBenchmarkAgentBrowserChromeOk)}`,
    `provider_public_benchmark_playwright_ok: ${yesNo(next.providerPublicBenchmarkPlaywrightOk)}`,
    `provider_public_benchmark_agent_may_run_unattended: ${yesNo(next.providerPublicBenchmarkAgentMayRunUnattended)}`,
    `provider_public_benchmark_starts_browser: ${yesNo(next.providerPublicBenchmarkStartsBrowser)}`,
    `provider_public_benchmark_reads_browser_storage: ${yesNo(next.providerPublicBenchmarkReadsBrowserStorage)}`,
    `provider_public_benchmark_returns_page_content: ${yesNo(next.providerPublicBenchmarkReturnsPageContent)}`,
    `provider_public_benchmark_command: ${clean(next.providerPublicBenchmarkCommand || 'none')}`,
    `provider_lightpanda_ready_for_public_benchmark: ${yesNo(next.providerLightpandaReadyForPublicBenchmark)}`,
    `provider_lightpanda_benchmark_agent_may_run_unattended: ${yesNo(next.providerLightpandaBenchmarkAgentMayRunUnattended)}`,
    `provider_lightpanda_benchmark_starts_browser: ${yesNo(next.providerLightpandaBenchmarkStartsBrowser)}`,
    `provider_lightpanda_benchmark_reads_browser_storage: ${yesNo(next.providerLightpandaBenchmarkReadsBrowserStorage)}`,
    `provider_lightpanda_benchmark_returns_page_content: ${yesNo(next.providerLightpandaBenchmarkReturnsPageContent)}`,
    `provider_lightpanda_benchmark_command: ${clean(next.providerLightpandaBenchmarkCommand || 'none')}`,
    `provider_playwright_ready_for_public_smoke: ${yesNo(next.providerPlaywrightReadyForPublicSmoke)}`,
    `provider_playwright_ready_for_authenticated_default: ${yesNo(next.providerPlaywrightReadyForAuthenticatedDefault)}`,
    `provider_playwright_storage_state_sensitive: ${yesNo(next.providerPlaywrightStorageStateSensitive)}`,
    `provider_playwright_smoke_command: ${clean(next.providerPlaywrightSmokeCommand || 'none')}`,
    `provider_playwright_public_smoke_proof_exists: ${yesNo(next.providerPlaywrightPublicSmokeProofExists)}`,
    `provider_playwright_public_smoke_proof_ok: ${yesNo(next.providerPlaywrightPublicSmokeProofOk)}`,
    `provider_playwright_public_smoke_proof_path: ${clean(next.providerPlaywrightPublicSmokeProofPath || 'none')}`,
    `provider_playwright_public_smoke_proof_heading_count: ${next.providerPlaywrightPublicSmokeProofHeadingCount ?? 0}`,
    `provider_playwright_public_smoke_proof_link_count: ${next.providerPlaywrightPublicSmokeProofLinkCount ?? 0}`,
    `provider_playwright_smoke_proof_command: ${clean(next.providerPlaywrightSmokeProofCommand || 'none')}`,
    `provider_playwright_smoke_proof_agent_may_run_unattended: ${yesNo(next.providerPlaywrightSmokeProofAgentMayRunUnattended)}`,
    `provider_playwright_smoke_proof_starts_browser: ${yesNo(next.providerPlaywrightSmokeProofStartsBrowser)}`,
    `provider_playwright_smoke_proof_reads_browser_storage: ${yesNo(next.providerPlaywrightSmokeProofReadsBrowserStorage)}`,
    `provider_playwright_smoke_proof_returns_page_content: ${yesNo(next.providerPlaywrightSmokeProofReturnsPageContent)}`,
    `provider_selenium_ready_for_local_smoke: ${yesNo(next.providerSeleniumReadyForLocalSmoke)}`,
    `provider_selenium_smoke_agent_may_run_unattended: ${yesNo(next.providerSeleniumSmokeAgentMayRunUnattended)}`,
    `provider_selenium_smoke_starts_browser: ${yesNo(next.providerSeleniumSmokeStartsBrowser)}`,
    `provider_selenium_smoke_command: ${clean(next.providerSeleniumSmokeCommand || 'none')}`,
    `provider_doctor_opens_browser: ${yesNo(next.providerDoctorOpensBrowser)}`,
    `provider_doctor_starts_capture: ${yesNo(next.providerDoctorStartsCapture)}`,
    `provider_doctor_reads_browser_storage: ${yesNo(next.providerDoctorReadsBrowserStorage)}`,
    `provider_doctor_returns_page_content: ${yesNo(next.providerDoctorReturnsPageContent)}`,
    `provider_doctor_may_run_unattended: ${yesNo(next.providerDoctorMayRunUnattended)}`,
    `chrome_mcp_route_ready: ${yesNo(next.chromeMcpRouteReady)}`,
    `chrome_mcp_page_list_timeout: ${yesNo(next.chromeMcpPageListTimeout)}`,
    `everyday_chrome_extension_ready: ${yesNo(next.everydayChromeExtensionReady)}`,
    `everyday_chrome_cdp_allowed: ${yesNo(next.everydayChromeCdpAllowed)}`,
    `secret_headless_ready: ${yesNo(next.secretHeadlessReady)}`,
    `secret_values_read: ${yesNo(next.secretValuesRead)}`,
    `warnings: ${next.warnings?.length || 0}`
  ];
  if (next.agentStatusCommand?.shell) lines.push(`agent_status_command: ${next.agentStatusCommand.shell}`);
  if (next.agentStepPlanCommand?.shell) lines.push(`agent_step_plan_command: ${next.agentStepPlanCommand.shell}`);
  if (next.agentStepStatusCommand?.shell) lines.push(`agent_step_status_command: ${next.agentStepStatusCommand.shell}`);
  if (next.objectiveCompletionStrictCommand?.shell) lines.push(`objective_completion_strict_command: ${next.objectiveCompletionStrictCommand.shell}`);
  if (next.agentPollCommand?.shell) lines.push(`agent_poll_command: ${next.agentPollCommand.shell}`);
  if (next.agentRunCommand?.shell) lines.push(`agent_run_command: ${next.agentRunCommand.shell}`);
  if (next.agentPreflightCommand?.shell) lines.push(`agent_preflight_command: ${next.agentPreflightCommand.shell}`);
  if (next.operatorApprovalPreflightCommand?.shell) lines.push(`operator_approval_preflight_command: ${next.operatorApprovalPreflightCommand.shell}`);
  if (next.agentProofPlanCommand?.shell) lines.push(`agent_proof_plan_command: ${next.agentProofPlanCommand.shell}`);
  if (next.operatorApprovalProofPlanCommand?.shell) lines.push(`operator_approval_proof_plan_command: ${next.operatorApprovalProofPlanCommand.shell}`);
  if (next.providerDoctorCommand?.shell) lines.push(`provider_doctor_command: ${next.providerDoctorCommand.shell}`);
  if (next.operatorApprovalPlanCommand?.shell) lines.push(`operator_approval_plan_command: ${next.operatorApprovalPlanCommand.shell}`);
  if (next.operatorApprovalCommand?.shell) lines.push(`operator_approval_command: ${next.operatorApprovalCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatControlStatusMarkdown(status) {
  const lines = [
    '# Secure Browser Agent Control Status',
    '',
    `Generated: ${status.generatedAt}`,
    `Safe mode: ${status.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${status.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${status.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Objective',
    '',
    `- Complete: ${status.complete ? 'yes' : 'no'}`,
    `- Status: ${status.objective.status}`,
    `- Remaining: ${status.objective.remainingCount}`,
    `- Next: ${status.objective.nextAction || 'none'}`,
    `- Operator input: ${status.objective.operatorInput ? 'yes' : 'no'}`,
    `- Recommended command: ${status.objective.recommendedCommand?.id || 'none'}`,
    `- Handoff resume: ${status.objective.handoffResume?.status || 'none'}`,
    `- Handoff resume login open: ${status.objective.handoffResume?.loginOpenStatus || 'none'}`,
    `- Auth watch: ${status.objective.authWatch?.status || 'none'}`,
    `- Auth watch active: ${status.objective.authWatch?.active ? 'yes' : 'no'}`,
    `- Auth watch latest: ${status.objective.authWatchLatest?.status || 'none'}`,
    `- Auth watch latest active: ${status.objective.authWatchLatest?.active ? 'yes' : 'no'}`,
    `- Objective safe action: ${status.objectiveSafeCommand?.action || 'none'}`,
    `- Objective safe command ID: ${status.objectiveSafeCommand?.commandId || 'none'}`,
    `- Objective safe command monitor-only: ${status.objectiveSafeCommand?.monitorOnly ? 'yes' : 'no'}`,
    `- Objective safe command may open browser: ${status.objectiveSafeCommand?.mayOpenBrowser ? 'yes' : 'no'}`,
    `- Objective safe command starts capture: ${status.objectiveSafeCommand?.startsCapture ? 'yes' : 'no'}`,
    `- Background proof capture blocked: ${status.objectiveSafeCommand?.backgroundProof?.captureBlocked ? 'yes' : 'no'}`,
    `- Background proof capture start blockers: ${status.objectiveSafeCommand?.backgroundProof?.captureStartBlockers?.length ? status.objectiveSafeCommand.backgroundProof.captureStartBlockers.join(', ') : 'none'}`,
    `- Target approval candidate: ${status.objectiveSafeCommand?.targetApproval?.selectedCandidate || 'none'}`,
    `- Target approval resume status: ${status.objectiveSafeCommand?.targetApproval?.resumeStatus || 'none'}`,
    `- Target approval resume ready to run: ${status.objectiveSafeCommand?.targetApproval?.resumeReadyToRun ? 'yes' : 'no'}`,
    `- Target approval resume operator OK required: ${status.objectiveSafeCommand?.targetApproval?.resumeOperatorOkRequired ? 'yes' : 'no'}`,
    `- Target approval resume agent may run unattended: ${status.objectiveSafeCommand?.targetApproval?.resumeAgentMayRunUnattended ? 'yes' : 'no'}`,
    `- Target approval resume planned opens browser: ${status.objectiveSafeCommand?.targetApproval?.resumePlannedCommandOpensBrowser ? 'yes' : 'no'}`,
    `- Target approval resume planned starts capture: ${status.objectiveSafeCommand?.targetApproval?.resumePlannedCommandStartsCapture ? 'yes' : 'no'}`,
    `- Agent loop next action: ${status.agentLoop?.nextAction || 'none'}`,
    `- Agent loop can run without approval: ${status.agentLoop?.canRunWithoutApproval ? 'yes' : 'no'}`,
    `- Agent loop user approval required for background start: ${status.agentLoop?.userApprovalRequiredForBackgroundStart ? 'yes' : 'no'}`,
    '',
    '## Browser',
    '',
    `- 9223 DevTools OK: ${status.browser.devtoolsOk ? 'yes' : 'no'}`,
    `- 9223 browser: ${status.browser.devtoolsBrowser || 'unknown'}`,
    `- 9222 Dia DevTools JSON OK: ${status.browser.diaDevtoolsOk ? 'yes' : 'no'}`,
    `- Chrome app parent processes: ${status.browser.chromeAppProcesses}`,
    `- Regular Chrome profiles: ${status.browser.regularChromeProfiles}`,
    `- Regular Chrome remote debugging: ${status.browser.regularChromeDebuggable ? 'yes' : 'no'}`,
    `- Target-pack Chrome profiles: ${status.browser.targetChromeProfiles}`,
    `- Target-pack Chrome remote debugging: ${status.browser.targetChromeDebuggable ? 'yes' : 'no'}`,
    `- Codex Browser Agent Chrome profiles: ${status.browser.codexChromeProfiles}`,
    `- Everyday Chrome via Codex Extension prepared: ${status.browser.everydayChromeExtensionPrepared ? 'yes' : 'no'}`,
    `- Everyday Chrome via Codex Extension backend available: ${status.browser.everydayChromeExtensionBackendAvailable ? 'yes' : 'no'}`,
    `- Everyday Chrome via Codex Extension ready: ${status.browser.everydayChromeExtensionReady ? 'yes' : 'no'}`,
    `- Everyday Chrome via CDP allowed: ${status.browser.everydayChromeCdpAllowed ? 'yes' : 'no'}`,
    `- Codex Chrome Extension enabled: ${status.browser.codexChromeExtensionEnabled ? 'yes' : 'no'}`,
    `- Codex Chrome Extension Native Host correct: ${status.browser.codexChromeExtensionNativeHostCorrect ? 'yes' : 'no'}`,
    `- Codex Chrome Extension selected profile: ${status.browser.codexChromeExtensionSelectedProfile || 'unknown'}`,
    `- Default HTTP browser: ${status.browser.defaultBrowserHttp || 'unknown'}`,
    `- Default HTTPS browser: ${status.browser.defaultBrowserHttps || 'unknown'}`,
    `- Owner sessions: ${status.browser.ownerSessions}`,
    `- Peekaboo servers: ${status.browser.peekabooServers}`,
    `- Chrome DevTools MCP servers: ${status.browser.chromeDevtoolsMcpServers}`,
    '',
    '## Backend Matrix',
    '',
    `- Status: ${status.backendMatrix?.status || 'none'}`,
    `- Exists: ${status.backendMatrix?.exists ? 'yes' : 'no'}`,
    `- Stale: ${status.backendMatrix?.stale ? 'yes' : 'no'}`,
    `- Default backend: ${status.backendMatrix?.defaultBackend || 'none'}`,
    `- Search backend: ${status.backendMatrix?.searchBackend || 'none'}`,
    `- Analyze backend: ${status.backendMatrix?.analyzeBackend || 'none'}`,
    `- Scrape backend: ${status.backendMatrix?.scrapeBackend || 'none'}`,
    `- Operate backend: ${status.backendMatrix?.operateBackend || 'none'}`,
    `- Authenticated backend: ${status.backendMatrix?.authenticatedBackend || 'none'}`,
    `- Existing tab backend: ${status.backendMatrix?.existingTabBackend || 'none'}`,
    `- Chrome MCP route ready: ${status.backendMatrix?.chromeMcpRouteReady ? 'yes' : 'no'}`,
    '',
    '## Chrome MCP Timeout Plan',
    '',
    `- Status: ${status.chromeMcpTimeoutPlan?.status || 'none'}`,
    `- Exists: ${status.chromeMcpTimeoutPlan?.exists ? 'yes' : 'no'}`,
    `- Stale: ${status.chromeMcpTimeoutPlan?.stale ? 'yes' : 'no'}`,
    `- Page list timeout: ${status.chromeMcpTimeoutPlan?.pageListTimeout ? 'yes' : 'no'}`,
    `- Use everyday Chrome now: ${status.chromeMcpTimeoutPlan?.useEverydayChromeNow ? 'yes' : 'no'}`,
    `- Prefer extension resume: ${status.chromeMcpTimeoutPlan?.preferExtensionResume ? 'yes' : 'no'}`,
    `- Next action: ${status.chromeMcpTimeoutPlan?.nextAction || 'none'}`,
    '',
    '## Run Gate',
    '',
    `- OK for agent loops: ${status.runGate?.okForAgentLoops ? 'yes' : 'no'}`,
    `- Unguarded agent dangerous: ${status.runGate?.unguardedAgentDangerous ?? 0}`,
    `- Agent-safe unattended: ${status.runGate?.agentSafeUnattended ?? 0}`,
    `- Operator gated: ${status.runGate?.operatorGated ?? 0}`,
    `- Exact operator OK: ${status.runGate?.exactOperatorOk ?? 0}`,
    `- Direct operator: ${status.runGate?.directOperator ?? 0}`,
    `- Next action: ${status.runGate?.nextAction || 'none'}`,
    '',
    '## Secrets',
    '',
    `- Headless ready: ${status.secret.headlessReady ? 'yes' : 'no'}`,
    `- Mode: ${status.secret.recommendedHeadlessMode || 'unknown'}`,
    `- Service Account env file usable: ${status.secret.serviceAccountEnvFileUsable ? 'yes' : 'no'}`,
    `- Headless config available: ${status.secret.headlessConfigAvailable ? 'yes' : 'no'}`,
    `- Desktop integration likely: ${status.secret.desktopIntegrationLikely ? 'yes' : 'no'}`,
    `- onepassword-mcp: ${status.secret.onePasswordMcp}`,
    '',
    '## Warnings',
    ''
  ];
  if (status.warnings.length === 0) {
    lines.push('- none');
  } else {
    for (const warning of status.warnings) lines.push(`- ${warning}`);
  }
  if (status.objective.recommendedCommand?.command?.shell) {
    lines.push('', '## Command', '', '```bash', status.objective.recommendedCommand.command.shell, '```');
  }
  lines.push('');
  return lines.join('\n');
}
