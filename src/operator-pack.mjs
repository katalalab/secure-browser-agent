import fs from 'node:fs';
import path from 'node:path';
import { buildAgentNext, buildControlStatus } from './control-status.mjs';
import { buildRuntimeAudit, buildRuntimeCleanupPlan } from './runtime-audit.mjs';
import { buildChromeControlPlan } from './chrome-control-plan.mjs';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';
import { buildChromeExtensionHandoff } from './chrome-extension-handoff.mjs';
import { buildChromeExtensionResume } from './chrome-extension-resume.mjs';
import { buildChromeExtensionTroubleshoot } from './chrome-extension-troubleshoot.mjs';
import { buildChromeExtensionBackendCheckPlan } from './chrome-extension-backend-check-plan.mjs';
import { buildChromeExtensionClaimPlan } from './chrome-extension-claim-plan.mjs';
import { buildChromeMcpTimeoutPlan } from './chrome-mcp-timeout-plan.mjs';
import { buildChromeMcpStatus } from './chrome-mcp-status.mjs';
import { buildChromeMcpObservation } from './chrome-mcp-observation.mjs';
import { buildRegularChromeUse } from './regular-chrome-use.mjs';
import { buildSecretEnvHandoff } from './secret-env-handoff.mjs';
import { buildObjectiveHandoff } from './objective-handoff.mjs';
import { buildObjectiveStatus } from './objective-status.mjs';
import { buildObjectiveSafeCommand } from './objective-safe-command.mjs';
import { buildProofGateStatus } from './proof-gate-status.mjs';
import { buildProofGateWatch } from './proof-gate-watch.mjs';
import { buildLoginHandoffStatus } from './login-handoff-status.mjs';
import { buildTargetHandoffResumeStatus } from './target-handoff-run.mjs';
import { buildTargetApprovalResume, buildTargetApprovalStatus } from './target-approval-pack.mjs';
import { buildBrowserRoute } from './browser-route.mjs';
import { buildBackendMatrix, buildBackendMatrixStatus } from './backend-matrix.mjs';
import { buildBackgroundProofCapturePlan } from './background-proof-capture-plan.mjs';
import { buildBackgroundProofCaptureStatus } from './background-proof-capture-status.mjs';
import { buildBackgroundProofCaptureStart } from './background-proof-capture-start.mjs';
import { buildAgentLoopStepStatus } from './agent-loop-step.mjs';
import { buildAgentProofChecklist } from './agent-proof-checklist.mjs';
import { buildAgentProofCloseout } from './agent-proof-closeout.mjs';
import { withMonitorOverrides } from './objective-proof-pipeline.mjs';
import { buildRunGateAudit } from './run-gate-audit.mjs';
import { toPosixPath } from './output.mjs';

function compactValue(value, fallback = 'none') {
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

function boolFromFlag(value) {
  if (value === true || value === 'yes' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  return null;
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/operator-pack-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid operator pack output path: ${outPath}`);
  return outputPath;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

function monitorOverrideArgs(options = {}) {
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  return [
    ...(timeoutMs === undefined || timeoutMs === null || timeoutMs === '' ? [] : ['--monitor-timeout-ms', String(timeoutMs)]),
    ...(intervalMs === undefined || intervalMs === null || intervalMs === '' ? [] : ['--monitor-interval-ms', String(intervalMs)])
  ];
}

function childPath(value) {
  return value?.outputPath || '';
}

function safeRunInputPath(rootDir, inPath, fallback) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(inPath || fallback).replace(/^[/\\]+/, '');
  const inputPath = path.resolve(runsRoot, relative);
  const insideRuns = inputPath === runsRoot || inputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid operator pack input path: ${inPath}`);
  return inputPath;
}

function runsRelativePath(rootDir, inputPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(inputPath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid runs-relative source path: ${inputPath}`);
  return toPosixPath(path.relative(runsRoot, resolved));
}

function fileSummary(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs
    };
  } catch {
    return {
      exists: false,
      bytes: 0,
      mtime: '',
      mtimeMs: null
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

function summaryAgeSeconds(summary, nowMs = Date.now()) {
  if (!summary?.exists || !Number.isFinite(summary.mtimeMs)) return null;
  return Math.max(0, Math.floor((nowMs - summary.mtimeMs) / 1000));
}

function numericOption(value, fallback) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function hasExplicitRegularChromeObservation(options = {}) {
  const keys = [
    'chromeMcpStatusText',
    'chrome-mcp-status-text',
    'chromeStatusText',
    'chrome-status-text',
    'statusText',
    'chromeMcpListPagesText',
    'chrome-mcp-list-pages-text',
    'chromeListPagesText',
    'chrome-list-pages-text',
    'listPagesText',
    'observedConnected',
    'chromeMcpConnected',
    'chrome-mcp-connected',
    'observedPageListOk',
    'chromeMcpPageListOk',
    'chrome-mcp-page-list-ok',
    'observedLastError',
    'chromeMcpLastError',
    'chrome-mcp-last-error',
    'chromeExtensionBackendAvailable',
    'chrome-extension-backend-available',
    'chromeExtensionBackendLastError',
    'chrome-extension-backend-last-error',
    'chromeExtensionWindowRetryAttempted',
    'chrome-extension-window-retry-attempted',
    'appleEventsActiveTabObserved',
    'apple-events-active-tab-observed',
    'appleEventsJavascriptAllowed',
    'apple-events-javascript-allowed'
  ];
  return keys.some((key) => options[key] !== undefined && options[key] !== '');
}

function readSavedRegularChromeUse(rootDir, options = {}) {
  const maxAgeSeconds = numericOption(
    options.savedRegularChromeMaxAgeSeconds ?? options['saved-regular-chrome-max-age-seconds'],
    900
  );
  const inputPath = safeRunInputPath(
    rootDir,
    options.regularChromeUseIn ?? options['regular-chrome-use-in'],
    'operator/regular-chrome-use-latest.json'
  );
  if (!fs.existsSync(inputPath)) {
    return {
      path: inputPath,
      available: false,
      used: false,
      stale: false,
      ageSeconds: null,
      maxAgeSeconds,
      plan: null
    };
  }
  const stat = fs.statSync(inputPath);
  const ageSeconds = Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000));
  const stale = maxAgeSeconds > 0 && ageSeconds > maxAgeSeconds;
  return {
    path: inputPath,
    available: true,
    used: false,
    stale,
    ageSeconds,
    maxAgeSeconds,
    plan: JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  };
}

function savedRegularChromeMcpObservation(savedRegularChromeUse) {
  const plan = savedRegularChromeUse?.plan || null;
  const chromeMcp = plan?.chromeMcp || {};
  if (!plan || !chromeMcp || Object.keys(chromeMcp).length === 0) return null;
  const observedConnected = typeof chromeMcp.observedConnected === 'boolean'
    ? yesNo(chromeMcp.observedConnected)
    : 'unknown';
  const observedPageListOk = typeof chromeMcp.observedPageListOk === 'boolean'
    ? yesNo(chromeMcp.observedPageListOk)
    : chromeMcp.listPagesTimedOut
      ? 'no'
      : 'unknown';
  const observedLastError = chromeMcp.lastError
    || (chromeMcp.listPagesTimedOut ? 'list_pages timed out' : '');
  const hasObservation = observedConnected !== 'unknown'
    || observedPageListOk !== 'unknown'
    || chromeMcp.observedTools !== undefined
    || chromeMcp.observedPageCount !== undefined
    || Boolean(observedLastError)
    || Boolean(chromeMcp.source);
  if (!hasObservation) return null;
  return {
    observedConnected,
    observedTools: chromeMcp.observedTools ?? undefined,
    observedPageListOk,
    observedPageCount: chromeMcp.observedPageCount ?? undefined,
    observedLastError,
    observedSource: chromeMcp.source || chromeMcp.rawObservationStatus || 'saved-regular-chrome-use',
    observation: null
  };
}

function freshBackendMatrixStatusFromMatrix(matrix = {}, generatedAt) {
  const tasks = matrix.tasks || {};
  return {
    schemaVersion: 1,
    generatedAt,
    rootDir: matrix.rootDir || '',
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    path: matrix.outputPath || '',
    exists: true,
    parseOk: true,
    parseError: '',
    staleAfterSeconds: 900,
    ageSeconds: 0,
    stale: false,
    status: 'fresh',
    defaultBackend: matrix.defaultBackend || '',
    defaultAgentInterface: matrix.defaultAgentInterface || '',
    authenticatedBackend: tasks['authenticated-scrape']?.backend || '',
    searchBackend: tasks.search?.backend || '',
    analyzeBackend: tasks.analyze?.backend || '',
    scrapeBackend: tasks.scrape?.backend || '',
    operateBackend: tasks.operate?.backend || '',
    existingTabBackend: tasks['existing-tab']?.backend || '',
    publicCrawlBackend: tasks['public-crawl']?.backend || '',
    compatibilityBackend: tasks['compatibility-test']?.backend || '',
    regularChromeStatus: matrix.regularChrome?.status || '',
    regularChromeNewBackgroundTabsAllowed: Boolean(matrix.regularChrome?.newBackgroundTabsAllowed),
    chromeMcpNewBackgroundTabAllowed: Boolean(matrix.regularChrome?.chromeMcpNewBackgroundTabAllowed),
    chromeMcpNewBackgroundUrlEnv: matrix.regularChrome?.chromeMcpNewBackgroundUrlEnv || '',
    chromeMcpNewBackgroundUrlValueRead: Boolean(matrix.regularChrome?.chromeMcpNewBackgroundUrlValueRead),
    chromeMcpRouteReady: Boolean(matrix.regularChrome?.chromeMcpRouteReady),
    chromeMcpListPagesTimedOut: Boolean(matrix.regularChrome?.chromeMcpListPagesTimedOut),
    chromeMcpTimeoutPlanStatus: matrix.chromeMcpTimeoutPlan?.status || '',
    chromeMcpTimeoutPlanStale: Boolean(matrix.chromeMcpTimeoutPlan?.stale),
    chromeMcpTimeoutPlanPageListTimeout: Boolean(matrix.chromeMcpTimeoutPlan?.pageListTimeout),
    chromeMcpTimeoutPlanUseEverydayChromeNow: Boolean(matrix.chromeMcpTimeoutPlan?.useEverydayChromeNow),
    chromeMcpTimeoutPlanPreferExtensionResume: Boolean(matrix.chromeMcpTimeoutPlan?.preferExtensionResume),
    chromeMcpTimeoutPlanFindings: Array.isArray(matrix.chromeMcpTimeoutPlan?.findings) ? matrix.chromeMcpTimeoutPlan.findings : [],
    backendCount: Array.isArray(matrix.backends) ? matrix.backends.length : 0,
    savedSecretValuesRead: Boolean(matrix.secretValuesRead),
    savedDestructiveActions: Boolean(matrix.destructiveActionsIncluded),
    commands: {
      refresh: matrix.commands?.write || null,
      status: matrix.commands?.status || null,
      chromeMcpTimeoutPlanStatus: matrix.commands?.chromeMcpTimeoutPlanStatus || null,
      chromeMcpTimeoutPlanRefresh: matrix.commands?.chromeMcpTimeoutPlanRefresh || null,
      searchRoute: matrix.commands?.searchRoute || null,
      analyzeRoute: matrix.commands?.analyzeRoute || null,
      scrapeRoute: matrix.commands?.scrapeRoute || null,
      operateRoute: matrix.commands?.operateRoute || null,
      existingTabRoute: matrix.commands?.existingTabRoute || null,
      authenticatedRoute: matrix.commands?.authenticatedRoute || null,
      publicRoute: matrix.commands?.publicRoute || null,
      compatibilityRoute: matrix.commands?.compatibilityRoute || null,
      searchWorkflow: matrix.commands?.searchWorkflow || null,
      analyzeWorkflow: matrix.commands?.analyzeWorkflow || null,
      scrapeWorkflow: matrix.commands?.scrapeWorkflow || null,
      operateWorkflow: matrix.commands?.operateWorkflow || null,
      searchSelector: matrix.commands?.searchSelector || null,
      analyzeSelector: matrix.commands?.analyzeSelector || null,
      scrapeSelector: matrix.commands?.scrapeSelector || null,
      operateSelector: matrix.commands?.operateSelector || null,
      existingTabSelector: matrix.commands?.existingTabSelector || null,
      publicCrawlSelector: matrix.commands?.publicCrawlSelector || null
    }
  };
}

function summarizeCommand(commandValue) {
  const args = commandValue?.args || [];
  const handoffResumeOpenOnly = args.includes('target-handoff-resume') && args.includes('--open-login') && !args.includes('--wait-auth');
  return {
    command: commandValue || null,
    opensBrowser: Boolean(args.includes('--open-login') || args.includes('--open-only') || args.includes('target-login-capture')),
    waitsForAuth: Boolean(args.includes('--wait-auth') || args.includes('target-login-capture')),
    startsCapture: Boolean(commandValue) && !args.includes('target-auth-watch') && !args.includes('--open-only') && !handoffResumeOpenOnly
  };
}

function removeFlag(args, flag) {
  return (args || []).filter((arg) => arg !== flag);
}

function removeOption(args, option) {
  const next = [];
  for (let index = 0; index < (args || []).length; index += 1) {
    if (args[index] === option) {
      index += 1;
      continue;
    }
    next.push(args[index]);
  }
  return next;
}

function noOpenWaitCaptureCommand(commandValue) {
  const args = commandValue?.args || [];
  if (!args.includes('target-handoff-resume')) return null;
  if (!args.includes('--run') || !args.includes('--wait-auth')) return null;
  if (!args.includes('--open-login')) return commandValue;
  return command(removeFlag(args, '--open-login'));
}

function reopenLoginCommand(commandValue) {
  const args = commandValue?.args || [];
  if (!args.includes('target-handoff-resume')) return null;
  if (!args.includes('--run') || !args.includes('--open-login')) return null;
  let reopenArgs = removeFlag(args, '--wait-auth');
  reopenArgs = removeOption(reopenArgs, '--wait-auth-status-out');
  reopenArgs = removeOption(reopenArgs, '--wait-auth-timeout-ms');
  reopenArgs = removeOption(reopenArgs, '--wait-auth-interval-ms');
  return command(reopenArgs);
}

function buildPackProofPipeline({ rootDir, generatedAt, objectiveStatus, proofGateStatus, executionPolicy, options = {} }) {
  const resumeCommand = proofGateStatus.resumeCommand || objectiveStatus.commands?.handoffResume || objectiveStatus.nextAction?.command || null;
  const authWatchUnavailable = proofGateStatus.handoffAuthCheckPortReachable === false;
  const monitorCommand = authWatchUnavailable
    ? null
    : withMonitorOverrides(proofGateStatus.monitorCommand || objectiveStatus.commands?.authWatch || null, options);
  const noOpenResumeCommand = noOpenWaitCaptureCommand(resumeCommand);
  const reopenCommand = reopenLoginCommand(resumeCommand);
  const captureBlocked = Boolean(proofGateStatus.operatorGuidance?.captureBlocked || objectiveStatus.nextAction?.needsOperatorInput);
  const missingArtifacts = Array.isArray(proofGateStatus.missingArtifacts)
    ? proofGateStatus.missingArtifacts
    : [];
  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    source: 'operator-pack',
    complete: Boolean(proofGateStatus.complete && objectiveStatus.complete),
    status: proofGateStatus.status || objectiveStatus.status || 'unknown',
    target: proofGateStatus.target || '',
    next: objectiveStatus.nextAction?.id || proofGateStatus.nextAction?.id || '',
    remainingCount: objectiveStatus.remainingCount ?? proofGateStatus.missingArtifactCount ?? 0,
    missingArtifacts,
    missingArtifactCount: proofGateStatus.missingArtifactCount ?? missingArtifacts.length,
    artifactCommandCovers: Array.isArray(proofGateStatus.artifactCommandCovers)
      ? proofGateStatus.artifactCommandCovers
      : [],
    operator: {
      inputRequired: Boolean(proofGateStatus.operatorInput || objectiveStatus.nextAction?.needsOperatorInput),
      humanAction: proofGateStatus.operatorGuidance?.humanAction || '',
      automationBlocker: proofGateStatus.operatorGuidance?.automationBlocker || '',
      captureBlocked
    },
    phases: {
      monitorAuth: {
        available: Boolean(monitorCommand),
        runNow: Boolean(monitorCommand),
        monitorOnly: true,
        ...summarizeCommand(monitorCommand)
      },
      openLogin: {
        available: false,
        runNow: false,
        monitorOnly: false,
        ...summarizeCommand(null)
      },
      reopenLogin: {
        available: Boolean(reopenCommand),
        runNow: Boolean(reopenCommand),
        monitorOnly: false,
        ...summarizeCommand(reopenCommand)
      },
      waitAuthThenCapture: {
        available: Boolean(resumeCommand),
        runNow: Boolean(resumeCommand) && !captureBlocked,
        blockedReason: captureBlocked ? (proofGateStatus.operatorGuidance?.automationBlocker || 'operator-login-required') : '',
        monitorOnly: false,
        ...summarizeCommand(resumeCommand)
      },
      waitAuthThenCaptureNoOpen: {
        available: Boolean(noOpenResumeCommand),
        runNow: Boolean(noOpenResumeCommand) && !captureBlocked,
        blockedReason: captureBlocked ? (proofGateStatus.operatorGuidance?.automationBlocker || 'operator-login-required') : '',
        monitorOnly: false,
        ...summarizeCommand(noOpenResumeCommand)
      }
    },
    decision: {
      recommendedNow: monitorCommand && executionPolicy.agentSafeCommandId === 'auth-watch'
        ? 'monitor-auth'
        : authWatchUnavailable && reopenCommand
          ? 'reopen-login-browser'
        : resumeCommand && !captureBlocked
          ? 'wait-auth-then-capture'
          : 'wait-operator',
      proofCaptureAllowedNow: Boolean(resumeCommand) && !captureBlocked,
      waitAuthThenCaptureAvailable: Boolean(resumeCommand),
      nextArtifactAction: proofGateStatus.nextArtifactAction || '',
      nextArtifactBlocker: proofGateStatus.nextArtifactBlocker || ''
    }
  };
}

function normalizedChromeMcpObservation(options) {
  const statusText = options.chromeMcpStatusText
    ?? options.statusText
    ?? options['chrome-mcp-status-text']
    ?? options['chrome-status-text']
    ?? '';
  const listPagesText = options.chromeMcpListPagesText
    ?? options.listPagesText
    ?? options['chrome-mcp-list-pages-text']
    ?? options['chrome-list-pages-text']
    ?? '';
  if (statusText || listPagesText) {
    const observation = buildChromeMcpObservation({
      generatedAt: options.generatedAt,
      statusText,
      listPagesText,
      source: options.chromeMcpSource ?? options.observedSource ?? options['chrome-mcp-source'] ?? 'operator-pack'
    });
    return {
      observedConnected: observation.observed.connected === null ? 'unknown' : yesNo(observation.observed.connected),
      observedTools: observation.observed.tools ?? undefined,
      observedPageListOk: observation.observed.pageListOk === null ? 'unknown' : yesNo(observation.observed.pageListOk),
      observedPageCount: observation.observed.pageCount ?? undefined,
      observedLastError: observation.observed.lastError || '',
      observedSource: observation.source || 'operator-pack',
      observation
    };
  }
  const connected = options.observedConnected
    ?? options.chromeMcpConnected
    ?? options['chrome-mcp-connected']
    ?? 'unknown';
  const pageListOk = options.observedPageListOk
    ?? options.chromeMcpPageListOk
    ?? options['chrome-mcp-page-list-ok']
    ?? 'unknown';
  const lastError = options.observedLastError
    ?? options.chromeMcpLastError
    ?? options['chrome-mcp-last-error']
    ?? '';
  return {
    observedConnected: connected,
    observedTools: options.observedTools ?? options.chromeMcpTools ?? options['chrome-mcp-tools'],
    observedPageListOk: pageListOk,
    observedPageCount: options.observedPageCount ?? options.chromeMcpPageCount ?? options['chrome-mcp-page-count'],
    observedLastError: lastError,
    observedSource: options.observedSource
      ?? options.chromeMcpSource
      ?? options['chrome-mcp-source']
      ?? 'operator-pack',
    observation: null
  };
}

function normalizedChromeExtensionBackendObservation(options) {
  const rawAvailable = options.chromeExtensionBackendAvailable
    ?? options['chrome-extension-backend-available']
    ?? options.extensionBackendAvailable
    ?? options.backendAvailable;
  const lastError = compactValue(
    options.chromeExtensionBackendLastError
      ?? options['chrome-extension-backend-last-error']
      ?? options.extensionBackendLastError
      ?? options.backendLastError
      ?? '',
    ''
  );
  const available = boolFromFlag(rawAvailable);
  const attempted = rawAvailable !== undefined || Boolean(lastError);
  return {
    attempted,
    available,
    lastError,
    probe: attempted
      ? {
          attemptedByCli: true,
          available,
          note: lastError || 'Observed by caller before building the operator pack.'
        }
      : undefined,
    availableFlag: available === null ? 'unknown' : yesNo(available)
  };
}

function normalizedChromeExtensionWindowRetry(options) {
  return boolFromFlag(
    options.chromeExtensionWindowRetryAttempted
      ?? options['chrome-extension-window-retry-attempted']
      ?? options.profileWindowRetryAttempted
      ?? options['profile-window-retry-attempted']
      ?? options.windowRetryAttempted
      ?? options['window-retry-attempted']
  );
}

function normalizedAppleEventsObservation(options) {
  const appleEventsStatusFile = options.appleEventsStatusFile
    ?? options['apple-events-status-file']
    ?? options.appleEventsStatusIn
    ?? options['apple-events-status-in'];
  let fileStatus = null;
  if (appleEventsStatusFile) {
    const inputPath = safeRunInputPath(options.rootDir || process.cwd(), appleEventsStatusFile, 'operator/chrome-apple-events-status-latest.json');
    if (fs.existsSync(inputPath)) {
      const status = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      fileStatus = {
        path: inputPath,
        activeTabObserved: status.activeTab?.observed ? 'yes' : 'no',
        javascriptAllowed: status.javascript?.allowed ? 'yes' : 'no'
      };
    } else {
      fileStatus = {
        path: inputPath,
        activeTabObserved: undefined,
        javascriptAllowed: undefined
      };
    }
  }
  const activeTabObserved = options.appleEventsActiveTabObserved
    ?? options['apple-events-active-tab-observed']
    ?? options.appleEventsActiveTab
    ?? options['apple-events-active-tab']
    ?? fileStatus?.activeTabObserved;
  const javascriptAllowed = options.appleEventsJavascriptAllowed
    ?? options['apple-events-javascript-allowed']
    ?? options.appleEventsJsAllowed
    ?? options['apple-events-js-allowed']
    ?? fileStatus?.javascriptAllowed;
  return {
    activeTabObserved,
    javascriptAllowed,
    observed: activeTabObserved !== undefined || javascriptAllowed !== undefined,
    statusFile: fileStatus?.path || ''
  };
}

export async function buildOperatorPack(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const write = Boolean(options.write || options.out || options.output);
  const writeChildren = Boolean(options.writeChildren ?? options['write-children'] ?? write);

  const objectiveStatus = options.objectiveStatus || await buildObjectiveStatus({
    ...options,
    rootDir,
    generatedAt,
    write: writeChildren,
    out: writeChildren ? 'operator/objective-status-latest.json' : ''
  });
  const proofGateStatus = options.proofGateStatus || await buildProofGateStatus({
    ...options,
    rootDir,
    generatedAt,
    write: writeChildren,
    out: writeChildren ? 'operator/proof-gate-status-latest.json' : ''
  });
  const targetApprovalCandidate = options.candidate || proofGateStatus.target || 'github';
  const targetApprovalStatus = options.targetApprovalStatus || await buildTargetApprovalStatus({
    ...options,
    rootDir,
    generatedAt,
    candidate: targetApprovalCandidate,
    in: options.targetApprovalIn || options['target-approval-in'] || `operator/target-approval-${targetApprovalCandidate}.json`,
    out: '',
    output: '',
    realExternal: true
  });
  const targetApprovalResume = options.targetApprovalResume || await buildTargetApprovalResume({
    ...options,
    rootDir,
    generatedAt,
    status: targetApprovalStatus,
    candidate: targetApprovalStatus.selectedCandidate || targetApprovalCandidate,
    realExternal: true,
    run: false,
    out: '',
    output: ''
  });
  const proofGateWatch = options.proofGateWatch || await buildProofGateWatch({
    ...options,
    rootDir,
    generatedAt,
    timeoutMs: 0,
    intervalMs: 1,
    statusBuilder: async () => proofGateStatus,
    write: writeChildren,
    out: writeChildren ? 'operator/proof-gate-watch-status.json' : ''
  });
  const loginHandoffStatus = options.loginHandoffStatus || await buildLoginHandoffStatus({
    ...options,
    rootDir,
    generatedAt,
    proofGateStatus,
    write: writeChildren,
    out: writeChildren ? 'operator/login-handoff-status-latest.json' : ''
  });
  let targetHandoffResumeStatus = options.targetHandoffResumeStatus || null;
  if (!targetHandoffResumeStatus && proofGateStatus.targetDir) {
    try {
      targetHandoffResumeStatus = buildTargetHandoffResumeStatus(proofGateStatus.targetDir, {
        ...options,
        rootDir,
        generatedAt,
        handoff: options.handoff || options.handoffPath || 'operator-handoff.json',
        waitAuthStatusOut: options.waitAuthStatusOut || options['wait-auth-status-out'] || 'handoff-resume-wait-auth-status.json'
      });
    } catch (error) {
      targetHandoffResumeStatus = {
        status: 'unavailable',
        latestAuthOk: false,
        captureCompleted: false,
        waitingForLogin: Boolean(proofGateStatus.operatorInput),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  const chromeExtensionBackendObservation = normalizedChromeExtensionBackendObservation(options);
  const chromeExtensionStatus = options.chromeExtensionStatus || buildChromeExtensionStatus({
    ...options,
    rootDir,
    generatedAt,
    backendProbe: chromeExtensionBackendObservation.probe ?? options.backendProbe
  });
  let chromeExtensionStatusOutputPath = childPath(chromeExtensionStatus);
  if (writeChildren && !options.chromeExtensionStatus) {
    chromeExtensionStatusOutputPath = safeRunPath(rootDir, 'operator/chrome-extension-status-latest.json');
    writeJson(chromeExtensionStatusOutputPath, chromeExtensionStatus);
  }
  const chromeExtensionHandoff = options.chromeExtensionHandoff || buildChromeExtensionHandoff({
    ...options,
    rootDir,
    generatedAt,
    chromeExtensionStatus,
    write: writeChildren && !options.chromeExtensionHandoff,
    out: writeChildren && !options.chromeExtensionHandoff ? 'operator/chrome-extension-handoff.json' : ''
  });
  const chromeExtensionResume = options.chromeExtensionResume || buildChromeExtensionResume({
    ...options,
    rootDir,
    generatedAt,
    chromeExtensionStatus,
    chromeExtensionHandoff,
    run: false
  });
  let chromeExtensionResumeOutputPath = childPath(chromeExtensionResume);
  if (writeChildren && !chromeExtensionResumeOutputPath) {
    chromeExtensionResumeOutputPath = safeRunPath(rootDir, 'operator/chrome-extension-resume-latest.json');
    chromeExtensionResume.outputPath = chromeExtensionResumeOutputPath;
    writeJson(chromeExtensionResumeOutputPath, chromeExtensionResume);
  }
  const chromeExtensionWindowRetryAttempted = normalizedChromeExtensionWindowRetry(options);
  const chromeExtensionTroubleshoot = options.chromeExtensionTroubleshoot || buildChromeExtensionTroubleshoot({
    ...options,
    rootDir,
    generatedAt,
    backendAvailable: chromeExtensionBackendObservation.availableFlag,
    backendLastError: chromeExtensionBackendObservation.lastError,
    profileWindowRetryAttempted: chromeExtensionWindowRetryAttempted,
    chromeExtensionStatus,
    chromeExtensionHandoff
  });
  let chromeExtensionTroubleshootOutputPath = childPath(chromeExtensionTroubleshoot);
  if (writeChildren && !chromeExtensionTroubleshootOutputPath) {
    chromeExtensionTroubleshootOutputPath = safeRunPath(rootDir, 'operator/chrome-extension-troubleshoot-latest.json');
    chromeExtensionTroubleshoot.outputPath = chromeExtensionTroubleshootOutputPath;
    writeJson(chromeExtensionTroubleshootOutputPath, chromeExtensionTroubleshoot);
  }
  const chromeExtensionBackendCheckPlan = options.chromeExtensionBackendCheckPlan || buildChromeExtensionBackendCheckPlan({
    ...options,
    rootDir,
    generatedAt,
    backendAvailable: chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionReady
      ? 'yes'
      : chromeExtensionBackendObservation.attempted
        ? chromeExtensionBackendObservation.availableFlag
        : 'unknown',
    chromeExtensionStatus
  });
  let chromeExtensionBackendCheckPlanOutputPath = childPath(chromeExtensionBackendCheckPlan);
  if (writeChildren && !chromeExtensionBackendCheckPlanOutputPath) {
    chromeExtensionBackendCheckPlanOutputPath = safeRunPath(rootDir, 'operator/chrome-extension-backend-check-plan-latest.json');
    chromeExtensionBackendCheckPlan.outputPath = chromeExtensionBackendCheckPlanOutputPath;
    writeJson(chromeExtensionBackendCheckPlanOutputPath, chromeExtensionBackendCheckPlan);
  }
  const chromeExtensionClaimPlan = options.chromeExtensionClaimPlan || buildChromeExtensionClaimPlan({
    ...options,
    rootDir,
    generatedAt,
    backendReady: chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionReady ? 'yes' : 'no',
    intent: options.regularChromeIntent || options.intent || 'inspect',
    chromeExtensionStatus
  });
  let chromeExtensionClaimPlanOutputPath = childPath(chromeExtensionClaimPlan);
  if (writeChildren && !chromeExtensionClaimPlanOutputPath) {
    chromeExtensionClaimPlanOutputPath = safeRunPath(rootDir, 'operator/chrome-extension-claim-plan-latest.json');
    chromeExtensionClaimPlan.outputPath = chromeExtensionClaimPlanOutputPath;
    writeJson(chromeExtensionClaimPlanOutputPath, chromeExtensionClaimPlan);
  }
  const savedRegularChromeUse = options.savedRegularChromeUse || readSavedRegularChromeUse(rootDir, options);
  const useSavedRegularChrome = !options.regularChromeUse
    && !hasExplicitRegularChromeObservation(options)
    && savedRegularChromeUse.available
    && !savedRegularChromeUse.stale
    && savedRegularChromeUse.plan;
  savedRegularChromeUse.used = Boolean(useSavedRegularChrome);
  const chromeMcpObservation = normalizedChromeMcpObservation(options);
  const effectiveChromeMcpObservation = useSavedRegularChrome
    ? (savedRegularChromeMcpObservation(savedRegularChromeUse) || chromeMcpObservation)
    : chromeMcpObservation;
  const runtimeAudit = options.runtimeAudit || buildRuntimeAudit({
    ...options,
    rootDir,
    generatedAt
  });
  const chromeMcpStatus = options.chromeMcpStatus || buildChromeMcpStatus({
    ...options,
    ...effectiveChromeMcpObservation,
    rootDir,
    generatedAt,
    runtimeAudit,
    chromeExtensionStatus
  });
  const runtimeCleanupPlan = options.runtimeCleanupPlan || buildRuntimeCleanupPlan({
    audit: runtimeAudit,
    ownerLimit: options.ownerLimit || options['owner-limit'] || 8
  });
  const chromeMcpTimeoutPlan = options.chromeMcpTimeoutPlan || buildChromeMcpTimeoutPlan({
    ...options,
    ...effectiveChromeMcpObservation,
    rootDir,
    generatedAt,
    chromeMcpStatus,
    runtimeCleanupPlan,
    ownerLimit: options.ownerLimit || options['owner-limit'] || 8
  });
  let chromeMcpTimeoutPlanOutputPath = childPath(chromeMcpTimeoutPlan);
  if (writeChildren && !chromeMcpTimeoutPlanOutputPath) {
    chromeMcpTimeoutPlanOutputPath = safeRunPath(rootDir, 'operator/chrome-mcp-timeout-plan-latest.json');
    chromeMcpTimeoutPlan.outputPath = chromeMcpTimeoutPlanOutputPath;
    writeJson(chromeMcpTimeoutPlanOutputPath, chromeMcpTimeoutPlan);
  }
  const appleEventsObservation = normalizedAppleEventsObservation(options);
  const chromeControlPlan = options.chromeControlPlan || buildChromeControlPlan({
    ...options,
    rootDir,
    generatedAt,
    runtimeAudit,
    chromeExtensionStatus,
    lane: options.lane || 'auto'
  });
  const secretEnvHandoff = options.secretEnvHandoff || buildSecretEnvHandoff({
    ...options,
    rootDir,
    generatedAt,
    write: writeChildren && !options.secretEnvHandoff,
    out: writeChildren && !options.secretEnvHandoff ? 'operator/secret-env-handoff.json' : ''
  });
  const objectiveHandoff = options.objectiveHandoff || await buildObjectiveHandoff({
    ...options,
    rootDir,
    generatedAt,
    write: writeChildren,
    out: writeChildren ? 'operator/objective-handoff.json' : ''
  });
  const controlStatus = options.controlStatus || await buildControlStatus({
    ...options,
    rootDir,
    generatedAt,
    objectiveStatus,
    runtimeAudit,
    chromeExtensionStatus
  });
  const runGateAudit = options.runGateAudit || controlStatus.runGate || buildRunGateAudit({ generatedAt });
  const browserRoute = options.browserRoute || await buildBrowserRoute({
    ...options,
    rootDir,
    generatedAt,
    proofGateStatus,
    chromeExtensionHandoff,
    chromeControlPlan,
    chromeMcpStatus,
    task: options.task || 'auto'
  });
  browserRoute.safeMode ??= true;
  browserRoute.destructiveActionsIncluded ??= false;
  browserRoute.secretValuesRead ??= false;
  browserRoute.opensBrowserNow ??= false;
  let browserRouteOutputPath = childPath(browserRoute);
  if (writeChildren && !browserRouteOutputPath) {
    browserRouteOutputPath = safeRunPath(rootDir, 'operator/browser-route-latest.json');
    browserRoute.outputPath = browserRouteOutputPath;
    writeJson(browserRouteOutputPath, browserRoute);
  }
  const regularChromeUse = options.regularChromeUse || (useSavedRegularChrome
    ? savedRegularChromeUse.plan
    : await buildRegularChromeUse({
        ...options,
        ...effectiveChromeMcpObservation,
        rootDir,
        generatedAt,
        write: false,
        out: '',
        output: '',
        intent: options.regularChromeIntent || options.intent || 'inspect',
        chromeMcpConnected: effectiveChromeMcpObservation.observedConnected,
        chromeMcpTools: effectiveChromeMcpObservation.observedTools,
        chromeMcpPageListOk: effectiveChromeMcpObservation.observedPageListOk,
        chromeMcpPageCount: effectiveChromeMcpObservation.observedPageCount,
        chromeMcpLastError: effectiveChromeMcpObservation.observedLastError,
        chromeMcpSource: effectiveChromeMcpObservation.observedSource,
        chromeExtensionStatus,
        chromeExtensionHandoff,
        chromeExtensionPrepared: chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionPrepared ? 'yes' : 'no',
        chromeExtensionBackendAvailable: chromeExtensionBackendObservation.attempted
          ? chromeExtensionBackendObservation.availableFlag
          : chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionBackendAvailable
            ? 'yes'
            : 'unknown',
        chromeExtensionBackendLastError: chromeExtensionBackendObservation.lastError,
        chromeExtensionWindowRetryAttempted: chromeExtensionWindowRetryAttempted === null ? undefined : yesNo(chromeExtensionWindowRetryAttempted),
        appleEventsActiveTabObserved: appleEventsObservation.activeTabObserved,
        appleEventsJavascriptAllowed: appleEventsObservation.javascriptAllowed,
        appleEventsStatusFile: appleEventsObservation.statusFile ? runsRelativePath(rootDir, appleEventsObservation.statusFile) : undefined
      }));
  let regularChromeUseOutputPath = childPath(regularChromeUse);
  if (writeChildren && !regularChromeUseOutputPath) {
    regularChromeUseOutputPath = safeRunPath(rootDir, 'operator/regular-chrome-use-latest.json');
    regularChromeUse.outputPath = regularChromeUseOutputPath;
    writeJson(regularChromeUseOutputPath, regularChromeUse);
  }
  const backendMatrixRegularChromeStatus = {
    status: regularChromeUse.status || (regularChromeUse.ready ? 'ready' : 'not-ready'),
    ready: Boolean(regularChromeUse.ready),
    stale: Boolean(savedRegularChromeUse.stale),
    selectedLane: regularChromeUse.selectedLane || '',
    backend: regularChromeUse.backend || '',
    canRunInBackground: Boolean(regularChromeUse.canRunInBackground),
    blockedReason: regularChromeUse.blockedReason || '',
    appleEvents: regularChromeUse.appleEvents || {},
    chromeMcpObservation: {
      status: regularChromeUse.chromeMcp?.rawObservationStatus || regularChromeUse.chromeMcp?.source || '',
      routeReady: Boolean(regularChromeUse.chromeMcp?.rawObservationRouteReady ?? regularChromeUse.chromeMcp?.ready),
      observedConnected: regularChromeUse.chromeMcp?.observedConnected ?? null,
      observedTools: regularChromeUse.chromeMcp?.observedTools ?? null,
      observedPageListOk: regularChromeUse.chromeMcp?.observedPageListOk ?? null,
      observedPageCount: regularChromeUse.chromeMcp?.observedPageCount ?? null,
      listPagesTimedOut: Boolean(regularChromeUse.chromeMcp?.listPagesTimedOut),
      lastError: regularChromeUse.chromeMcp?.lastError || ''
    }
  };
  const backendMatrix = options.backendMatrix || await buildBackendMatrix({
    ...options,
    rootDir,
    generatedAt,
    write: false,
    out: '',
    output: '',
    regularChromeStatus: backendMatrixRegularChromeStatus
  });
  let backendMatrixOutputPath = childPath(backendMatrix);
  if (writeChildren && !backendMatrixOutputPath) {
    backendMatrixOutputPath = safeRunPath(rootDir, 'operator/backend-matrix-latest.json');
    backendMatrix.outputPath = backendMatrixOutputPath;
    writeJson(backendMatrixOutputPath, backendMatrix);
  }
  const backendMatrixStatusInput = backendMatrixOutputPath
    ? runsRelativePath(rootDir, backendMatrixOutputPath)
    : options.backendMatrixStatusIn || options['backend-matrix-status-in'] || 'operator/backend-matrix-latest.json';
  const explicitBackendMatrixStatusInput = Boolean(
    options.backendMatrixStatusIn
    || options['backend-matrix-status-in']
    || options.backendMatrixStatusIn === ''
    || options['backend-matrix-status-in'] === ''
  );
  const backendMatrixStatus = options.backendMatrixStatus
    || (!backendMatrixOutputPath && !explicitBackendMatrixStatusInput
      ? freshBackendMatrixStatusFromMatrix(backendMatrix, generatedAt)
      : buildBackendMatrixStatus({
          ...options,
          rootDir,
          generatedAt,
          in: backendMatrixStatusInput
        }));

  const files = {
    operatorPack: '',
    objectiveStatus: childPath(objectiveStatus),
    proofGateStatus: childPath(proofGateStatus),
    proofGateWatch: childPath(proofGateWatch),
    loginHandoffStatus: childPath(loginHandoffStatus),
    browserRoute: browserRouteOutputPath,
    backendMatrix: backendMatrixOutputPath,
    regularChromeUse: regularChromeUseOutputPath,
    chromeExtensionStatus: chromeExtensionStatusOutputPath,
    chromeExtensionHandoff: childPath(chromeExtensionHandoff),
    chromeExtensionResume: chromeExtensionResumeOutputPath,
    chromeExtensionTroubleshoot: chromeExtensionTroubleshootOutputPath,
    chromeExtensionBackendCheckPlan: chromeExtensionBackendCheckPlanOutputPath,
    chromeExtensionClaimPlan: chromeExtensionClaimPlanOutputPath,
    chromeMcpTimeoutPlan: chromeMcpTimeoutPlanOutputPath,
    secretEnvHandoff: childPath(secretEnvHandoff),
    objectiveHandoff: childPath(objectiveHandoff)
  };
  const chromeResumePlanCommand = command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--format', 'compact']);
  const chromeResumeApprovalCommand = command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--run', '--operator-ok', 'OK', '--format', 'compact']);
  const chromeBackendCheckPlanCommand = command(['node', 'src/cli.mjs', 'chrome-extension-backend-check-plan', '--format', 'compact']);
  const chromeTroubleshootArgs = [
    'node',
    'src/cli.mjs',
    'chrome-extension-troubleshoot',
    '--backend-available',
    chromeExtensionBackendObservation.attempted ? chromeExtensionBackendObservation.availableFlag : 'unknown'
  ];
  if (chromeExtensionBackendObservation.lastError) {
    chromeTroubleshootArgs.push('--backend-last-error', chromeExtensionBackendObservation.lastError);
  }
  if (chromeExtensionWindowRetryAttempted !== null) {
    chromeTroubleshootArgs.push('--profile-window-retry-attempted', yesNo(chromeExtensionWindowRetryAttempted));
  }
  chromeTroubleshootArgs.push('--format', 'compact');
  const chromeTroubleshootCommand = command(chromeTroubleshootArgs);
  const chromeClaimPlanCommand = command(['node', 'src/cli.mjs', 'chrome-extension-claim-plan', '--backend-ready', chromeExtensionClaimPlan.ready ? 'yes' : 'no', '--intent', chromeExtensionClaimPlan.intent || 'inspect', '--format', 'compact']);
  const chromeMcpTimeoutPlanArgs = [
    'node',
    'src/cli.mjs',
    'chrome-mcp-timeout-plan',
    '--observed-connected',
    effectiveChromeMcpObservation.observedConnected || 'unknown'
  ];
  if (effectiveChromeMcpObservation.observedTools !== undefined) {
    chromeMcpTimeoutPlanArgs.push('--observed-tools', String(effectiveChromeMcpObservation.observedTools));
  }
  if (effectiveChromeMcpObservation.observedPageListOk && effectiveChromeMcpObservation.observedPageListOk !== 'unknown') {
    chromeMcpTimeoutPlanArgs.push('--observed-page-list-ok', effectiveChromeMcpObservation.observedPageListOk);
  }
  if (effectiveChromeMcpObservation.observedPageCount !== undefined) {
    chromeMcpTimeoutPlanArgs.push('--observed-page-count', String(effectiveChromeMcpObservation.observedPageCount));
  }
  if (effectiveChromeMcpObservation.observedLastError) {
    chromeMcpTimeoutPlanArgs.push('--observed-last-error', effectiveChromeMcpObservation.observedLastError);
  }
  if (effectiveChromeMcpObservation.observedSource) {
    chromeMcpTimeoutPlanArgs.push('--observed-source', effectiveChromeMcpObservation.observedSource);
  }
  chromeMcpTimeoutPlanArgs.push('--format', 'compact');
  const chromeMcpTimeoutPlanCommand = command(chromeMcpTimeoutPlanArgs);
  const authWatchUnavailable = proofGateStatus.handoffAuthCheckPortReachable === false;
  const authWatchCommand = authWatchUnavailable
    ? null
    : withMonitorOverrides(proofGateStatus.monitorCommand || objectiveStatus.commands?.authWatch || null, options);
  const handoffResumeCommand = proofGateStatus.resumeCommand || objectiveStatus.commands?.handoffResume || null;
  const handoffReopenLoginCommand = reopenLoginCommand(handoffResumeCommand);
  const proofCaptureAllowedNow = Boolean(proofGateStatus.authCheckOk && proofGateStatus.authUsable && !proofGateStatus.loginLike);
  const handoffResumeMayOpenBrowser = Boolean(handoffResumeCommand?.args?.includes('--open-login'));
  const operatorReopenLoginCommand = authWatchUnavailable ? handoffReopenLoginCommand : null;
  const agentSafeCommandId = proofCaptureAllowedNow && handoffResumeCommand
    ? 'handoff-resume'
    : authWatchCommand
      ? 'auth-watch'
      : handoffResumeCommand
        ? (authWatchUnavailable ? 'none' : 'handoff-resume')
        : 'none';
  const agentSafeCommand = agentSafeCommandId === 'auth-watch'
    ? authWatchCommand
    : agentSafeCommandId === 'handoff-resume'
      ? handoffResumeCommand
      : null;
  const agentSafeCommandBlockedReason = !agentSafeCommand && authWatchUnavailable
    ? 'handoff-auth-check-port-unreachable'
    : '';
  const monitorArgs = monitorOverrideArgs(options);
  const agentLoopStepPlanCommand = command(['node', 'src/cli.mjs', 'agent-loop-step', '--write', '--out', 'operator/agent-loop-step-latest.json', ...monitorArgs, '--format', 'compact']);
  const agentLoopStepRunCommand = agentSafeCommandId === 'auth-watch' && agentSafeCommand
    ? command(['node', 'src/cli.mjs', 'agent-loop-step', '--run', '--write', '--out', 'operator/agent-loop-step-latest.json', ...monitorArgs, '--timeout-ms', '300000', '--format', 'compact'])
    : null;
  const agentLoopStepStatusCommand = command(['node', 'src/cli.mjs', 'agent-loop-step-status', '--in', 'operator/agent-loop-step-latest.json', ...monitorArgs, '--format', 'compact']);
  const agentLoopStepStatusInput = options.agentLoopStepStatusIn || options['agent-loop-step-status-in'] || 'operator/agent-loop-step-latest.json';
  const agentLoopStepStatus = options.agentLoopStepStatus || buildAgentLoopStepStatus({
    rootDir,
    generatedAt,
    in: agentLoopStepStatusInput,
    timeoutMs: options.agentLoopStepTimeoutMs || options['agent-loop-step-timeout-ms'] || 300000,
    monitorTimeoutMs: options.monitorTimeoutMs ?? options['monitor-timeout-ms'],
    monitorIntervalMs: options.monitorIntervalMs ?? options['monitor-interval-ms']
  });
  const executionPolicy = {
    agentSafeAction: proofCaptureAllowedNow
      ? 'run-auth-first-resume'
      : authWatchCommand
        ? 'monitor-auth-watch'
        : handoffResumeCommand
          ? authWatchUnavailable
            ? 'reopen-login-browser-required'
            : 'run-auth-first-resume'
          : 'wait-operator',
    agentSafeCommandId,
    agentSafeCommand,
    agentSafeCommandMonitorOnly: agentSafeCommandId === 'auth-watch',
    agentSafeCommandMayOpenBrowser: (agentSafeCommandId === 'handoff-resume' && handoffResumeMayOpenBrowser) || agentSafeCommandId === 'reopen-login',
    agentSafeCommandStartsCapture: agentSafeCommandId === 'handoff-resume',
    agentSafeCommandBlockedReason,
    monitorOnlyCommandAvailable: Boolean(authWatchCommand),
    authWatchHandoffPort: proofGateStatus.handoffAuthCheckPort || null,
    authWatchHandoffPortReachable: proofGateStatus.handoffAuthCheckPortReachable ?? null,
    authFirstResumeAvailable: Boolean(handoffResumeCommand),
    proofCaptureAllowedNow,
    proofCaptureBlockedUntilAuth: Boolean(handoffResumeCommand && !proofCaptureAllowedNow),
    authFirstResumeMayOpenBrowser: handoffResumeMayOpenBrowser,
    authFirstResumeStartsCaptureAfterAuthOnly: Boolean(handoffResumeCommand),
    authFirstReopenLoginCommand: operatorReopenLoginCommand,
    operatorMustLogin: Boolean(proofGateStatus.operatorInput || objectiveStatus.nextAction?.needsOperatorInput),
    agentLoopStepPlanCommand,
    agentLoopStepRunCommand,
    agentLoopStepStatusCommand
  };
  const savedAgentLoopStep = {
    exists: Boolean(agentLoopStepStatus.exists),
    stale: Boolean(agentLoopStepStatus.stale),
    status: agentLoopStepStatus.stepStatus || '',
    nextAction: agentLoopStepStatus.nextAction || '',
    recommendedCommandId: agentLoopStepStatus.recommendedCommandId || '',
    commandId: agentLoopStepStatus.commandId || '',
    allowedToRun: Boolean(agentLoopStepStatus.allowedToRun),
    executed: Boolean(agentLoopStepStatus.executed),
    blockedReason: agentLoopStepStatus.blockedReason || '',
    opensBrowserNow: Boolean(agentLoopStepStatus.opensBrowserNow),
    startsCaptureNow: Boolean(agentLoopStepStatus.startsCaptureNow),
    ageSeconds: agentLoopStepStatus.ageSeconds,
    staleAfterSeconds: agentLoopStepStatus.staleAfterSeconds,
    path: agentLoopStepStatus.path || safeRunInputPath(rootDir, agentLoopStepStatusInput, 'operator/agent-loop-step-latest.json'),
    recommendedCommand: agentLoopStepStatus.recommendedCommand || null,
    refreshCommand: agentLoopStepStatus.refreshCommand || null,
    runCommand: agentLoopStepStatus.recommendedCommandId === 'run-agent-loop-step' ? agentLoopStepStatus.runCommand : null
  };
  files.agentLoopStepStatus = savedAgentLoopStep.path;
  const backgroundProofPipeline = options.objectiveProofPipeline || buildPackProofPipeline({
    rootDir,
    generatedAt,
    objectiveStatus,
    proofGateStatus,
    executionPolicy,
    options
  });
  let objectiveProofPipelineOutputPath = childPath(backgroundProofPipeline);
  if (writeChildren && !objectiveProofPipelineOutputPath) {
    objectiveProofPipelineOutputPath = safeRunPath(rootDir, 'operator/objective-proof-pipeline-latest.json');
    backgroundProofPipeline.outputPath = objectiveProofPipelineOutputPath;
    writeJson(objectiveProofPipelineOutputPath, backgroundProofPipeline);
  }
  const objectiveProofPipelineCommand = command(['node', 'src/cli.mjs', 'objective-proof-pipeline', ...monitorArgs, '--format', 'compact']);
  const proofPipeline = {
    status: backgroundProofPipeline.status || '',
    complete: Boolean(backgroundProofPipeline.complete),
    recommendedNow: backgroundProofPipeline.decision?.recommendedNow || '',
    proofCaptureAllowedNow: Boolean(backgroundProofPipeline.decision?.proofCaptureAllowedNow),
    waitAuthThenCaptureAvailable: Boolean(backgroundProofPipeline.decision?.waitAuthThenCaptureAvailable),
    nextArtifactAction: backgroundProofPipeline.decision?.nextArtifactAction || '',
    nextArtifactBlocker: backgroundProofPipeline.decision?.nextArtifactBlocker || '',
    missingArtifactCount: backgroundProofPipeline.missingArtifactCount || 0,
    monitorAuthAvailable: Boolean(backgroundProofPipeline.phases?.monitorAuth?.available),
    monitorAuthOpensBrowser: Boolean(backgroundProofPipeline.phases?.monitorAuth?.opensBrowser),
    monitorAuthStartsCapture: Boolean(backgroundProofPipeline.phases?.monitorAuth?.startsCapture),
    openLoginAvailable: Boolean(backgroundProofPipeline.phases?.openLogin?.available),
    reopenLoginAvailable: Boolean(backgroundProofPipeline.phases?.reopenLogin?.available),
    reopenLoginOpensBrowser: Boolean(backgroundProofPipeline.phases?.reopenLogin?.opensBrowser),
    reopenLoginStartsCapture: Boolean(backgroundProofPipeline.phases?.reopenLogin?.startsCapture),
    waitCaptureOpensBrowser: Boolean(backgroundProofPipeline.phases?.waitAuthThenCapture?.opensBrowser),
    waitCaptureWaitsForAuth: Boolean(backgroundProofPipeline.phases?.waitAuthThenCapture?.waitsForAuth),
    waitCaptureStartsCapture: Boolean(backgroundProofPipeline.phases?.waitAuthThenCapture?.startsCapture),
    waitCaptureNoOpenAvailable: Boolean(backgroundProofPipeline.phases?.waitAuthThenCaptureNoOpen?.available),
    waitCaptureNoOpenOpensBrowser: Boolean(backgroundProofPipeline.phases?.waitAuthThenCaptureNoOpen?.opensBrowser),
    waitCaptureNoOpenWaitsForAuth: Boolean(backgroundProofPipeline.phases?.waitAuthThenCaptureNoOpen?.waitsForAuth),
    waitCaptureNoOpenStartsCapture: Boolean(backgroundProofPipeline.phases?.waitAuthThenCaptureNoOpen?.startsCapture),
    command: objectiveProofPipelineCommand,
    monitorAuthCommand: backgroundProofPipeline.phases?.monitorAuth?.command || null,
    openLoginCommand: backgroundProofPipeline.phases?.openLogin?.command || null,
    reopenLoginCommand: backgroundProofPipeline.phases?.reopenLogin?.command || null,
    waitCaptureCommand: backgroundProofPipeline.phases?.waitAuthThenCapture?.command || null,
    waitCaptureNoOpenCommand: backgroundProofPipeline.phases?.waitAuthThenCaptureNoOpen?.command || null,
    outputPath: objectiveProofPipelineOutputPath || ''
  };
  const backgroundProofCapturePlan = options.backgroundProofCapturePlan || await buildBackgroundProofCapturePlan({
    ...options,
    rootDir,
    generatedAt,
    pipeline: backgroundProofPipeline
  });
  let backgroundProofCapturePlanOutputPath = childPath(backgroundProofCapturePlan);
  if (writeChildren && !backgroundProofCapturePlanOutputPath) {
    backgroundProofCapturePlanOutputPath = safeRunPath(rootDir, 'operator/background-proof-capture-plan-latest.json');
    backgroundProofCapturePlan.outputPath = backgroundProofCapturePlanOutputPath;
    writeJson(backgroundProofCapturePlanOutputPath, backgroundProofCapturePlan);
  }
  const backgroundProofCaptureStatus = options.backgroundProofCaptureStatus || await buildBackgroundProofCaptureStatus({
    ...options,
    rootDir,
    generatedAt,
    plan: backgroundProofCapturePlan,
    targetDir: proofGateStatus.targetDir || options.targetDir || options['target-dir'] || ''
  });
  let backgroundProofCaptureStatusOutputPath = childPath(backgroundProofCaptureStatus);
  if (writeChildren && !backgroundProofCaptureStatusOutputPath) {
    backgroundProofCaptureStatusOutputPath = safeRunPath(rootDir, 'operator/background-proof-capture-status-latest.json');
    backgroundProofCaptureStatus.outputPath = backgroundProofCaptureStatusOutputPath;
    writeJson(backgroundProofCaptureStatusOutputPath, backgroundProofCaptureStatus);
  }
  const backgroundProofCaptureStart = options.backgroundProofCaptureStart || await buildBackgroundProofCaptureStart({
    ...options,
    rootDir,
    generatedAt,
    plan: backgroundProofCapturePlan,
    mode: 'capture',
    run: false
  });
  let backgroundProofCaptureStartOutputPath = childPath(backgroundProofCaptureStart);
  if (writeChildren && !backgroundProofCaptureStartOutputPath) {
    backgroundProofCaptureStartOutputPath = safeRunPath(rootDir, 'operator/background-proof-capture-start-latest.json');
    backgroundProofCaptureStart.outputPath = backgroundProofCaptureStartOutputPath;
    writeJson(backgroundProofCaptureStartOutputPath, backgroundProofCaptureStart);
  }
  const backgroundProofMonitorStart = options.backgroundProofMonitorStart || await buildBackgroundProofCaptureStart({
    ...options,
    rootDir,
    generatedAt,
    plan: backgroundProofCapturePlan,
    mode: 'monitor',
    run: false
  });
  let backgroundProofMonitorStartOutputPath = childPath(backgroundProofMonitorStart);
  if (writeChildren && !backgroundProofMonitorStartOutputPath) {
    backgroundProofMonitorStartOutputPath = safeRunPath(rootDir, 'operator/background-auth-monitor-start-latest.json');
    backgroundProofMonitorStart.outputPath = backgroundProofMonitorStartOutputPath;
    writeJson(backgroundProofMonitorStartOutputPath, backgroundProofMonitorStart);
  }
  const backgroundProofStatusCommand = command(['node', 'src/cli.mjs', 'background-proof-capture-status', '--format', 'compact']);
  const backgroundNoOpenWaitCaptureCommand = authWatchUnavailable
    ? null
    : backgroundProofCapturePlan.phases?.backgroundWaitAuthThenCaptureNoOpen?.command || null;
  const backgroundNoOpenWaitCaptureShellCommand = authWatchUnavailable
    ? null
    : backgroundProofCapturePlan.phases?.backgroundWaitAuthThenCaptureNoOpen?.backgroundCommand || null;
  const backgroundProofCapture = {
    planStatus: backgroundProofCaptureStatus.planStatus || backgroundProofCapturePlan.status || '',
    target: backgroundProofCaptureStatus.target || backgroundProofCapturePlan.target || '',
    targetDir: backgroundProofCaptureStatus.targetDir || proofGateStatus.targetDir || '',
    captureBlocked: Boolean(backgroundProofCaptureStatus.captureBlocked || backgroundProofCapturePlan.captureBlocked),
    backgroundMonitorAvailable: Boolean(backgroundProofCaptureStatus.backgroundMonitorAvailable),
    backgroundCaptureAvailable: Boolean(!authWatchUnavailable && backgroundProofCaptureStatus.backgroundCaptureAvailable),
    captureBlockedReason: authWatchUnavailable ? 'handoff-auth-check-port-unreachable' : '',
    monitorRunning: Boolean(backgroundProofCaptureStatus.processes?.monitor?.running),
    captureRunning: Boolean(backgroundProofCaptureStatus.processes?.capture?.running),
    authWatchExists: Boolean(backgroundProofCaptureStatus.targetOutputs?.authWatchStatus?.exists),
    authWatchStatus: backgroundProofCaptureStatus.targetOutputs?.authWatchStatus?.status || '',
    authWatchOk: Boolean(backgroundProofCaptureStatus.targetOutputs?.authWatchStatus?.ok),
    handoffWaitAuthExists: Boolean(backgroundProofCaptureStatus.targetOutputs?.handoffWaitAuthStatus?.exists),
    handoffWaitAuthStatus: backgroundProofCaptureStatus.targetOutputs?.handoffWaitAuthStatus?.status || '',
    handoffResumeLatestExists: Boolean(backgroundProofCaptureStatus.targetOutputs?.handoffResumeLatest?.exists),
    handoffResumeLatestStatus: backgroundProofCaptureStatus.targetOutputs?.handoffResumeLatest?.status || '',
    captureStartStatus: backgroundProofCaptureStart.status || '',
    captureStartReadyToRun: Boolean(backgroundProofCaptureStart.readyToRun),
    captureStartOperatorOkAccepted: Boolean(backgroundProofCaptureStart.operatorOkAccepted),
    captureStartBlockers: backgroundProofCaptureStart.blockers || [],
    monitorStartStatus: backgroundProofMonitorStart.status || '',
    monitorStartReadyToRun: Boolean(backgroundProofMonitorStart.readyToRun),
    monitorStartBlockers: backgroundProofMonitorStart.blockers || [],
    statusCommand: backgroundProofStatusCommand,
    noOpenWaitCaptureCommand: backgroundNoOpenWaitCaptureCommand,
    backgroundNoOpenWaitCaptureCommand: backgroundNoOpenWaitCaptureShellCommand,
    captureStartCommand: backgroundProofCaptureStart.commands?.approvedRun || null,
    monitorStartCommand: backgroundProofMonitorStart.commands?.approvedRun || null
  };
  files.backgroundProofCapturePlan = backgroundProofCapturePlanOutputPath;
  files.backgroundProofCaptureStatus = backgroundProofCaptureStatusOutputPath;
  files.backgroundProofCaptureStart = backgroundProofCaptureStartOutputPath;
  files.backgroundProofMonitorStart = backgroundProofMonitorStartOutputPath;
  files.objectiveProofPipeline = objectiveProofPipelineOutputPath;
  const objectiveSafeCommandAudit = {
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    complete: Boolean(proofGateStatus.complete && objectiveStatus.complete),
    status: proofGateStatus.status || objectiveStatus.status || 'unknown',
    finalGate: {
      remainingCount: proofGateStatus.missingArtifactCount ?? objectiveStatus.remainingCount ?? 0
    },
    nextAction: {
      ...(proofGateStatus.nextAction || objectiveStatus.nextAction || {}),
      id: proofGateStatus.nextAction?.id || objectiveStatus.nextAction?.id || '',
      target: proofGateStatus.target || objectiveStatus.nextAction?.target || '',
      needsOperatorInput: Boolean(proofGateStatus.operatorInput || objectiveStatus.nextAction?.needsOperatorInput),
      operatorGuidance: proofGateStatus.operatorGuidance || objectiveStatus.operatorGuidance || objectiveStatus.nextAction?.operatorGuidance || {},
      nextArtifactAction: proofGateStatus.nextArtifactAction || '',
      nextArtifactBlocker: proofGateStatus.nextArtifactBlocker || '',
      missingArtifacts: Array.isArray(proofGateStatus.missingArtifacts) ? proofGateStatus.missingArtifacts : []
    },
    executionPolicy
  };
  const objectiveSafeCommand = options.objectiveSafeCommand || await buildObjectiveSafeCommand({
    ...options,
    rootDir,
    generatedAt,
    audit: objectiveSafeCommandAudit,
    backgroundProofCapturePlan,
    backgroundProofCaptureStart,
    backgroundProofMonitorStart,
    write: false,
    out: '',
    output: ''
  });
  let objectiveSafeCommandOutputPath = childPath(objectiveSafeCommand);
  if (writeChildren && !objectiveSafeCommandOutputPath) {
    objectiveSafeCommandOutputPath = safeRunPath(rootDir, 'operator/objective-safe-command-latest.json');
    objectiveSafeCommand.outputPath = objectiveSafeCommandOutputPath;
    writeJson(objectiveSafeCommandOutputPath, objectiveSafeCommand);
  }
  files.objectiveSafeCommand = objectiveSafeCommandOutputPath;
  const agentProofChecklist = options.agentProofChecklist || await buildAgentProofChecklist({
    ...options,
    rootDir,
    generatedAt,
    candidate: targetApprovalStatus.selectedCandidate || targetApprovalCandidate,
    write: writeChildren && !options.agentProofChecklist,
    out: writeChildren && !options.agentProofChecklist ? 'operator/agent-proof-checklist-latest.json' : '',
    output: ''
  });
  let agentProofChecklistOutputPath = childPath(agentProofChecklist);
  if (writeChildren && !agentProofChecklistOutputPath) {
    agentProofChecklistOutputPath = safeRunPath(rootDir, 'operator/agent-proof-checklist-latest.json');
    agentProofChecklist.outputPath = agentProofChecklistOutputPath;
    writeJson(agentProofChecklistOutputPath, agentProofChecklist);
  }
  files.agentProofChecklist = agentProofChecklistOutputPath;
  const agentProofCloseout = options.agentProofCloseout || await buildAgentProofCloseout({
    ...options,
    rootDir,
    generatedAt,
    candidate: targetApprovalStatus.selectedCandidate || targetApprovalCandidate,
    write: writeChildren && !options.agentProofCloseout,
    out: writeChildren && !options.agentProofCloseout ? 'operator/agent-proof-closeout-latest.json' : '',
    output: '',
    checklistStatus: {
      exists: Boolean(agentProofChecklistOutputPath),
      parseOk: true,
      stale: false,
      complete: Boolean(agentProofChecklist.complete),
      verdict: agentProofChecklist.verdict || '',
      candidate: agentProofChecklist.candidate || '',
      targetDir: agentProofChecklist.targetDir || '',
      readinessRemainingCount: agentProofChecklist.readinessRemainingCount ?? 0,
      readinessRemaining: Array.isArray(agentProofChecklist.readinessRemaining) ? agentProofChecklist.readinessRemaining : [],
      missingArtifacts: Array.isArray(agentProofChecklist.missingArtifacts) ? agentProofChecklist.missingArtifacts : [],
      authState: agentProofChecklist.authState || '',
      authUsable: Boolean(agentProofChecklist.authUsable),
      captureBlocked: Boolean(agentProofChecklist.captureBlocked),
      automationBlocker: agentProofChecklist.automationBlocker || '',
      acceptedExternalProofs: agentProofChecklist.acceptedExternalProofs ?? 0,
      operatorApprovalRequired: Boolean(agentProofChecklist.operatorApprovalRequired),
      operatorCommandOpensBrowser: Boolean(agentProofChecklist.operatorCommandOpensBrowser),
      operatorCommandStartsCapture: Boolean(agentProofChecklist.operatorCommandStartsCapture)
    }
  });
  let agentProofCloseoutOutputPath = childPath(agentProofCloseout);
  if (writeChildren && !agentProofCloseoutOutputPath) {
    agentProofCloseoutOutputPath = safeRunPath(rootDir, 'operator/agent-proof-closeout-latest.json');
    agentProofCloseout.outputPath = agentProofCloseoutOutputPath;
    writeJson(agentProofCloseoutOutputPath, agentProofCloseout);
  }
  files.agentProofCloseout = agentProofCloseoutOutputPath;
  const savedRegularChromeExtension = savedRegularChromeUse.used ? regularChromeUse.extension || {} : {};
  const savedRegularChromeMcp = savedRegularChromeUse.used ? regularChromeUse.chromeMcp || {} : {};
  const savedBackendAvailable = typeof savedRegularChromeExtension.backendAvailable === 'boolean'
    ? savedRegularChromeExtension.backendAvailable
    : null;
  const savedProfileWindowRetryAttempted = typeof savedRegularChromeExtension.profileWindowRetryAttempted === 'boolean'
    ? savedRegularChromeExtension.profileWindowRetryAttempted
    : null;
  const effectiveBackendObservedAvailable = chromeExtensionBackendObservation.available ?? savedBackendAvailable;
  const effectiveProfileWindowRetryAttempted = chromeExtensionWindowRetryAttempted ?? savedProfileWindowRetryAttempted;
  const effectiveBackendObservedLastError = chromeExtensionBackendObservation.lastError || savedRegularChromeExtension.backendLastError || '';
  const effectiveBackendFailureAfterProfileWindowRetry = Boolean(chromeExtensionTroubleshoot.backendFailureAfterProfileWindowRetry)
    || Boolean(effectiveBackendObservedAvailable === false && effectiveProfileWindowRetryAttempted === true);
  const effectiveExtensionReinstallRecommended = Boolean(chromeExtensionTroubleshoot.extensionReinstallRecommended)
    || Boolean(savedRegularChromeExtension.reinstallRecommended)
    || regularChromeUse.selectedLane === 'regular-chrome-extension-reinstall-required';
  const effectiveMcpPageListTimeout = Boolean(chromeMcpTimeoutPlan.status?.pageListTimeout)
    || Boolean(savedRegularChromeMcp.listPagesTimedOut);
  const effectiveMcpUseEverydayChromeNow = Boolean(chromeMcpTimeoutPlan.guidance?.useEverydayChromeNow)
    || regularChromeUse.selectedLane === 'regular-chrome-mcp';
  const effectiveTroubleshootNextAction = effectiveExtensionReinstallRecommended
    ? 'reinstall-codex-chrome-plugin-from-ui'
    : chromeExtensionTroubleshoot.nextAction || '';
  const regularChromeRefreshArgs = [
    'node',
    'src/cli.mjs',
    'regular-chrome-use',
    '--intent',
    options.regularChromeIntent || options.intent || 'inspect',
    '--write',
    '--out',
    runsRelativePath(rootDir, savedRegularChromeUse.path),
  ];
  if (appleEventsObservation.statusFile) {
    regularChromeRefreshArgs.push('--apple-events-status-file', runsRelativePath(rootDir, appleEventsObservation.statusFile));
  }
  regularChromeRefreshArgs.push(
    '--format',
    'compact'
  );
  const regularChromeRefreshCommand = command(regularChromeRefreshArgs);
  const regularChrome = {
    prepared: Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionPrepared),
    backendAvailable: Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionBackendAvailable),
    backendObservedAvailable: effectiveBackendObservedAvailable,
    backendObservedLastError: effectiveBackendObservedLastError,
    profileWindowRetryAttempted: effectiveProfileWindowRetryAttempted,
    backendFailureAfterProfileWindowRetry: effectiveBackendFailureAfterProfileWindowRetry,
    extensionReinstallRecommended: effectiveExtensionReinstallRecommended,
    ready: Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionReady),
    cdpAllowed: Boolean(chromeExtensionStatus.decision?.everydayChromeViaCdpAllowed),
    selectedProfile: chromeExtensionStatus.extension?.selectedProfileDirectory || '',
    extensionEnabled: Boolean(chromeExtensionStatus.extension?.enabled),
    nativeHostCorrect: Boolean(chromeExtensionStatus.nativeHost?.correct),
    nextAction: chromeExtensionStatus.nextAction || '',
    handoffAction: chromeExtensionHandoff.action || '',
    resumeAction: chromeExtensionResume.action || '',
    operatorOkRequired: Boolean(chromeExtensionResume.operatorOkRequired),
    userPermissionRequired: Boolean(chromeExtensionHandoff.needsUserPermission),
    canOpenSelectedProfileWindow: Boolean(chromeExtensionHandoff.canOpenSelectedProfileWindow),
    commandRunOnlyAfterUserSays: chromeExtensionResume.commandRunOnlyAfterUserSays || 'OK',
    claimPlanReady: Boolean(chromeExtensionClaimPlan.ready),
    claimPlanNextAction: chromeExtensionClaimPlan.nextAction || '',
    claimPlanNextTool: chromeExtensionClaimPlan.nextTool || '',
    claimPlanSnippetKeys: Object.keys(chromeExtensionClaimPlan.snippets || []),
    backendCheckPlanNextAction: chromeExtensionBackendCheckPlan.nextAction || '',
    backendCheckPlanNextTool: chromeExtensionBackendCheckPlan.nextTool || '',
    backendCheckPlanSnippetKeys: Object.keys(chromeExtensionBackendCheckPlan.snippets || []),
    troubleshootNextAction: effectiveTroubleshootNextAction,
    savedUsePlanAvailable: Boolean(savedRegularChromeUse.available),
    savedUsePlanUsed: Boolean(savedRegularChromeUse.used),
    savedUsePlanStale: Boolean(savedRegularChromeUse.stale),
    savedUsePlanAgeSeconds: savedRegularChromeUse.ageSeconds,
    savedUsePlanMaxAgeSeconds: savedRegularChromeUse.maxAgeSeconds,
    savedUsePlanPath: savedRegularChromeUse.path,
    savedUsePlanRefreshCommand: regularChromeRefreshCommand,
    usableNow: Boolean(regularChromeUse.ready),
    backgroundCapableNow: Boolean(regularChromeUse.canRunInBackground),
    blockedReason: regularChromeUse.blockedReason || '',
    usePlanReady: Boolean(regularChromeUse.ready),
    usePlanSelectedLane: regularChromeUse.selectedLane || '',
    usePlanBackend: regularChromeUse.backend || '',
    usePlanNextAction: regularChromeUse.nextAction || '',
    usePlanCommand: regularChromeUse.command || null,
    usePlanApprovalCommand: regularChromeUse.approvalCommand || null,
    mcpTimeoutPlanNextAction: chromeMcpTimeoutPlan.nextAction || '',
    mcpPageListTimeout: effectiveMcpPageListTimeout,
    mcpUseEverydayChromeNow: effectiveMcpUseEverydayChromeNow,
    mcpTimeoutPlanFindings: (chromeMcpTimeoutPlan.findings || []).map((finding) => finding.id),
    mcpTimeoutPlanCommand: chromeMcpTimeoutPlanCommand,
    backendCheckPlanCommand: chromeBackendCheckPlanCommand,
    backendCheckPlanRecordFailureCommand: chromeExtensionBackendCheckPlan.commands?.recordFailure || null,
    backendCheckPlanRecordSuccessCommand: chromeExtensionBackendCheckPlan.commands?.recordSuccess || null,
    troubleshootCommand: chromeTroubleshootCommand,
    claimPlanCommand: chromeClaimPlanCommand,
    resumeCommand: chromeResumePlanCommand,
    approvalCommand: chromeExtensionHandoff.canOpenSelectedProfileWindow ? chromeResumeApprovalCommand : null,
    appleEventsObserved: Boolean(regularChromeUse.appleEvents?.observed),
    appleEventsActiveTabObserved: Boolean(regularChromeUse.appleEvents?.activeTabObserved),
    appleEventsJavascriptAllowed: Boolean(regularChromeUse.appleEvents?.javascriptAllowed),
    appleEventsUsableForInspect: Boolean(regularChromeUse.appleEvents?.usableForInspect),
    appleEventsNextAction: regularChromeUse.appleEvents?.nextAction || '',
    appleEventsOutlineCommand: regularChromeUse.appleEventsOutlineCommand || null,
    appleEventsOutlineApprovalCommand: regularChromeUse.appleEventsOutlineApprovalCommand || null,
    appleEventsStatusFile: regularChromeUse.appleEvents?.statusPath || appleEventsObservation.statusFile || '',
    openCommand: null
  };
  const primaryAction = proofGateStatus.nextAction || objectiveStatus.nextAction || {};
  const primaryCommandValue = primaryAction?.id === 'handoff-resume' && handoffResumeCommand
    ? handoffResumeCommand
    : primaryAction?.command || null;
  const primaryCommandSummary = summarizeCommand(primaryCommandValue);
  const primaryCommandRequiresOperatorApproval = Boolean(
    primaryCommandSummary.command
    && (primaryCommandSummary.opensBrowser
      || primaryCommandSummary.startsCapture
      || proofGateStatus.operatorInput
      || objectiveStatus.nextAction?.needsOperatorInput)
  );
  const pack = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    complete: Boolean(proofGateStatus.complete && objectiveStatus.complete),
    status: proofGateStatus.status || objectiveStatus.status || 'unknown',
    target: proofGateStatus.target || '',
    targetDir: proofGateStatus.targetDir || '',
    operatorInput: Boolean(proofGateStatus.operatorInput || objectiveStatus.nextAction?.needsOperatorInput),
    operatorGuidance: proofGateStatus.operatorGuidance || objectiveStatus.operatorGuidance || null,
    nextAction: proofGateStatus.nextAction || objectiveStatus.nextAction || null,
    primaryCommand: {
      ...primaryCommandSummary,
      requiresOperatorApproval: primaryCommandRequiresOperatorApproval,
      agentMayRunUnattended: Boolean(primaryCommandSummary.command && !primaryCommandRequiresOperatorApproval)
    },
    recommendedCommand: proofGateStatus.recommendedCommand || objectiveStatus.recommendedCommand || null,
    authWatchCommand,
    handoffResumeCommand,
    executionPolicy,
    agentLoopStepStatus: savedAgentLoopStep,
    missingArtifactCount: proofGateStatus.missingArtifactCount ?? 0,
    acceptedExternalProofCount: proofGateStatus.acceptedExternalProofCount ?? 0,
    authCheckOk: Boolean(proofGateStatus.authCheckOk),
    loginLike: Boolean(proofGateStatus.loginLike),
    authState: proofGateStatus.authState || '',
    authUsable: Boolean(proofGateStatus.authUsable),
    profileAuthMetadataOnly: Boolean(proofGateStatus.profileAuthMetadataOnly),
    handoffAuthCheckPort: proofGateStatus.handoffAuthCheckPort || '',
    handoffAuthCheckPortReachable: proofGateStatus.handoffAuthCheckPortReachable ?? null,
    proofGateArtifactAction: {
      nextArtifactAction: proofGateStatus.nextArtifactAction || '',
      nextArtifactBlocker: proofGateStatus.nextArtifactBlocker || '',
      artifactCommandCovers: Array.isArray(proofGateStatus.artifactCommandCovers)
        ? proofGateStatus.artifactCommandCovers
        : []
    },
    targetApproval: {
      approvalPackExists: Boolean(targetApprovalStatus.approvalPackExists),
      approvalPackParseOk: Boolean(targetApprovalStatus.approvalPackParseOk),
      selectedCandidate: targetApprovalStatus.selectedCandidate || '',
      targetPackExists: Boolean(targetApprovalStatus.targetPackExists),
      proofInventoryComplete: Boolean(targetApprovalStatus.inventory?.complete),
      realExternalInventory: Boolean(targetApprovalStatus.inventory?.realExternal),
      acceptedExternalProofs: targetApprovalStatus.inventory?.summary?.acceptedExternalProofs ?? 0,
      targetNext: targetApprovalStatus.nextAction?.id || '',
      authState: targetApprovalStatus.target?.authState || '',
      authUsable: Boolean(targetApprovalStatus.target?.authUsable),
      proofReadyTarget: Boolean(targetApprovalStatus.target?.proofReady),
      automationBlocker: targetApprovalStatus.target?.operatorGuidance?.automationBlocker || '',
      humanAction: targetApprovalStatus.target?.operatorGuidance?.humanAction || '',
      captureBlocked: Boolean(targetApprovalStatus.target?.operatorGuidance?.captureBlocked),
      nextCommandOpensBrowser: Boolean(targetApprovalStatus.nextCommandOpensBrowser),
      nextCommandStartsCapture: Boolean(targetApprovalStatus.nextCommandStartsCapture),
      nextCommandRequiresOperatorApproval: Boolean(targetApprovalStatus.nextCommandRequiresOperatorApproval),
      nextCommandAgentMayRunUnattended: Boolean(targetApprovalStatus.nextCommandAgentMayRunUnattended),
      resumeStatus: targetApprovalResume.status || '',
      resumeReadyToRun: Boolean(targetApprovalResume.readyToRun),
      resumeOperatorOkRequired: Boolean(targetApprovalResume.operatorOkRequired),
      resumeOperatorOkAccepted: Boolean(targetApprovalResume.operatorOkAccepted),
      resumeAgentMayRunUnattended: false,
      resumePlannedCommandOpensBrowser: Boolean(targetApprovalResume.plannedCommandOpensBrowser),
      resumePlannedCommandStartsCapture: Boolean(targetApprovalResume.plannedCommandStartsCapture),
      resumePlanCommand: command([
        'node',
        'src/cli.mjs',
        'target-approval-resume',
        '--candidate',
        targetApprovalStatus.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      resumeRunCommand: targetApprovalResume.runCommand || null,
      preflightCommand: command([
        'node',
        'src/cli.mjs',
        'target-approval-preflight',
        '--candidate',
        targetApprovalStatus.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ]),
      resumePreflightCommand: targetApprovalResume.preflightCommand || null,
      resumeProofPlanCommand: targetApprovalResume.proofPlanCommand || null,
      nextCommand: targetApprovalStatus.nextAction?.command || null,
      statusCommand: command([
        'node',
        'src/cli.mjs',
        'target-approval-status',
        '--candidate',
        targetApprovalStatus.selectedCandidate || 'github',
        '--real-external',
        '--format',
        'compact'
      ])
    },
    loginHandoff: {
      status: loginHandoffStatus.status || '',
      nextAction: loginHandoffStatus.nextAction || '',
      loginRequired: Boolean(loginHandoffStatus.loginRequired),
      authUsable: Boolean(loginHandoffStatus.authUsable),
      safeMonitorAvailable: Boolean(loginHandoffStatus.safeMonitorAvailable),
      safeMonitorOnly: Boolean(loginHandoffStatus.safeMonitorOnly),
      dedicatedBrowserPort: loginHandoffStatus.dedicatedBrowserPort || '',
      dedicatedBrowserReachable: loginHandoffStatus.dedicatedBrowserReachable ?? null,
      opensBrowserNow: Boolean(loginHandoffStatus.opensBrowserNow),
      startsCaptureNow: Boolean(loginHandoffStatus.startsCaptureNow),
      captureAllowedNow: Boolean(loginHandoffStatus.captureAllowedNow),
      proofCaptureBlockedUntilAuth: Boolean(loginHandoffStatus.proofCaptureBlockedUntilAuth),
      humanAction: loginHandoffStatus.humanAction || '',
      automationBlocker: loginHandoffStatus.automationBlocker || '',
      safeMonitorCommand: loginHandoffStatus.safeMonitorAvailable
        ? withMonitorOverrides(loginHandoffStatus.safeMonitorCommand || null, options)
        : null,
      authFirstResumeCommand: loginHandoffStatus.authFirstResumeCommand || null,
      statusCommand: loginHandoffStatus.commands?.status || null,
      completionAuditCommand: loginHandoffStatus.commands?.completionAudit || null
    },
    handoffResumeStatus: targetHandoffResumeStatus
      ? {
          status: targetHandoffResumeStatus.status || '',
          latestAuthOk: Boolean(targetHandoffResumeStatus.latestAuthOk),
          captureCompleted: Boolean(targetHandoffResumeStatus.captureCompleted),
          waitingForLogin: Boolean(targetHandoffResumeStatus.waitingForLogin),
          recommendedCommandId: authWatchUnavailable && targetHandoffResumeStatus.recommendedCommand?.id === 'monitor-auth'
            ? 'reopen-login-browser'
            : targetHandoffResumeStatus.recommendedCommand?.id || '',
          recommendedCommand: authWatchUnavailable && targetHandoffResumeStatus.recommendedCommand?.id === 'monitor-auth'
            ? null
            : targetHandoffResumeStatus.recommendedCommand?.command || null,
          capturePlanCommand: targetHandoffResumeStatus.capturePlanCommand || null
        }
      : null,
    browserRoute: {
      requestedTask: browserRoute.requestedTask || '',
      task: browserRoute.task || '',
      selectedLane: browserRoute.selectedLane || '',
      backend: browserRoute.backend || '',
      profileMode: browserRoute.profileMode || '',
      operatorInput: Boolean(browserRoute.operatorInput),
      userPermissionRequired: Boolean(browserRoute.userPermissionRequired),
      canRunInBackground: Boolean(browserRoute.canRunInBackground),
      opensBrowserNow: Boolean(browserRoute.opensBrowserNow),
      startsCapture: Boolean(browserRoute.startsCapture),
      captureBlocked: Boolean(browserRoute.captureBlocked),
      commandOpensBrowser: Boolean(browserRoute.commandOpensBrowser),
      approvalCommandOpensBrowser: Boolean(browserRoute.approvalCommandOpensBrowser),
      commandRunOnlyAfterUserSays: browserRoute.commandRunOnlyAfterUserSays || '',
      everydayChromeCdpAllowed: Boolean(browserRoute.security?.everydayChromeCdpAllowed),
      dedicatedTargetProfileForStoredAuth: Boolean(browserRoute.security?.dedicatedTargetProfileForStoredAuth),
      command: browserRoute.commands?.route || null,
      approvalCommand: browserRoute.commands?.approval || null,
      statusCommand: browserRoute.commands?.status || null
    },
    backendMatrix: {
      status: backendMatrixStatus.status || '',
      exists: Boolean(backendMatrixStatus.exists),
      stale: Boolean(backendMatrixStatus.stale),
      defaultBackend: backendMatrixStatus.defaultBackend || backendMatrix.defaultBackend || '',
      defaultAgentInterface: backendMatrixStatus.defaultAgentInterface || backendMatrix.defaultAgentInterface || '',
      searchBackend: backendMatrixStatus.searchBackend || backendMatrix.tasks?.search?.backend || '',
      analyzeBackend: backendMatrixStatus.analyzeBackend || backendMatrix.tasks?.analyze?.backend || '',
      scrapeBackend: backendMatrixStatus.scrapeBackend || backendMatrix.tasks?.scrape?.backend || '',
      operateBackend: backendMatrixStatus.operateBackend || backendMatrix.tasks?.operate?.backend || '',
      authenticatedBackend: backendMatrixStatus.authenticatedBackend || backendMatrix.tasks?.['authenticated-scrape']?.backend || '',
      existingTabBackend: backendMatrixStatus.existingTabBackend || backendMatrix.tasks?.['existing-tab']?.backend || '',
      publicCrawlBackend: backendMatrixStatus.publicCrawlBackend || backendMatrix.tasks?.['public-crawl']?.backend || '',
      compatibilityBackend: backendMatrixStatus.compatibilityBackend || backendMatrix.tasks?.['compatibility-test']?.backend || '',
      regularChromeStatus: backendMatrixStatus.regularChromeStatus || backendMatrix.regularChrome?.status || '',
      chromeMcpRouteReady: Boolean(backendMatrixStatus.chromeMcpRouteReady || backendMatrix.regularChrome?.chromeMcpRouteReady),
      chromeMcpListPagesTimedOut: Boolean(backendMatrixStatus.chromeMcpListPagesTimedOut || backendMatrix.regularChrome?.chromeMcpListPagesTimedOut),
      chromeMcpTimeoutPlanSource: backendMatrixStatus.chromeMcpTimeoutPlanSource || 'embedded-matrix',
      chromeMcpTimeoutPlanStatus: backendMatrixStatus.chromeMcpTimeoutPlanStatus || backendMatrix.chromeMcpTimeoutPlan?.status || '',
      chromeMcpTimeoutPlanStale: Boolean(backendMatrixStatus.chromeMcpTimeoutPlanStale || backendMatrix.chromeMcpTimeoutPlan?.stale),
      chromeMcpTimeoutPlanPreferExtensionResume: Boolean(backendMatrixStatus.chromeMcpTimeoutPlanPreferExtensionResume || backendMatrix.chromeMcpTimeoutPlan?.preferExtensionResume),
      backendCount: backendMatrixStatus.backendCount || backendMatrix.backends?.length || 0,
      savedSecretValuesRead: Boolean(backendMatrixStatus.savedSecretValuesRead || backendMatrix.secretValuesRead),
      savedDestructiveActions: Boolean(backendMatrixStatus.savedDestructiveActions || backendMatrix.destructiveActionsIncluded),
      refreshCommand: backendMatrixStatus.commands?.refresh || backendMatrix.commands?.write || null,
      statusCommand: backendMatrixStatus.commands?.status || backendMatrix.commands?.status || null,
      searchRouteCommand: backendMatrixStatus.commands?.searchRoute || backendMatrix.commands?.searchRoute || null,
      analyzeRouteCommand: backendMatrixStatus.commands?.analyzeRoute || backendMatrix.commands?.analyzeRoute || null,
      scrapeRouteCommand: backendMatrixStatus.commands?.scrapeRoute || backendMatrix.commands?.scrapeRoute || null,
      operateRouteCommand: backendMatrixStatus.commands?.operateRoute || backendMatrix.commands?.operateRoute || null,
      existingTabRouteCommand: backendMatrixStatus.commands?.existingTabRoute || backendMatrix.commands?.existingTabRoute || null,
      authenticatedRouteCommand: backendMatrixStatus.commands?.authenticatedRoute || backendMatrix.commands?.authenticatedRoute || null,
      publicCrawlRouteCommand: backendMatrixStatus.commands?.publicRoute || backendMatrix.commands?.publicRoute || null,
      compatibilityRouteCommand: backendMatrixStatus.commands?.compatibilityRoute || backendMatrix.commands?.compatibilityRoute || null,
      searchWorkflowCommand: backendMatrixStatus.commands?.searchWorkflow || backendMatrix.commands?.searchWorkflow || null,
      analyzeWorkflowCommand: backendMatrixStatus.commands?.analyzeWorkflow || backendMatrix.commands?.analyzeWorkflow || null,
      scrapeWorkflowCommand: backendMatrixStatus.commands?.scrapeWorkflow || backendMatrix.commands?.scrapeWorkflow || null,
      operateWorkflowCommand: backendMatrixStatus.commands?.operateWorkflow || backendMatrix.commands?.operateWorkflow || null,
      searchSelectorCommand: backendMatrixStatus.commands?.searchSelector || backendMatrix.commands?.searchSelector || null,
      analyzeSelectorCommand: backendMatrixStatus.commands?.analyzeSelector || backendMatrix.commands?.analyzeSelector || null,
      scrapeSelectorCommand: backendMatrixStatus.commands?.scrapeSelector || backendMatrix.commands?.scrapeSelector || null,
      operateSelectorCommand: backendMatrixStatus.commands?.operateSelector || backendMatrix.commands?.operateSelector || null,
      existingTabSelectorCommand: backendMatrixStatus.commands?.existingTabSelector || backendMatrix.commands?.existingTabSelector || null,
      publicCrawlSelectorCommand: backendMatrixStatus.commands?.publicCrawlSelector || backendMatrix.commands?.publicCrawlSelector || null
    },
    proofPipeline,
    backgroundProofCapture,
    runGate: {
      okForAgentLoops: Boolean(runGateAudit.summary?.okForAgentLoops ?? runGateAudit.okForAgentLoops),
      unguardedAgentDangerous: runGateAudit.summary?.unguardedAgentDangerous ?? runGateAudit.unguardedAgentDangerous ?? 0,
      agentSafeUnattended: runGateAudit.summary?.agentSafeUnattended ?? runGateAudit.agentSafeUnattended ?? 0,
      operatorGated: runGateAudit.summary?.operatorGated ?? runGateAudit.operatorGated ?? 0,
      exactOperatorOk: runGateAudit.summary?.exactOperatorOk ?? runGateAudit.exactOperatorOk ?? 0,
      directOperator: runGateAudit.summary?.directOperator ?? runGateAudit.directOperator ?? 0,
      totalSurfaces: runGateAudit.summary?.total ?? runGateAudit.totalSurfaces ?? 0,
      opensBrowserNow: Boolean(runGateAudit.opensBrowserNow),
      startsCaptureNow: Boolean(runGateAudit.startsCaptureNow),
      startsBackgroundProcessNow: Boolean(runGateAudit.startsBackgroundProcessNow),
      nextAction: runGateAudit.nextAction || '',
      command: command(['node', 'src/cli.mjs', 'run-gate-audit', '--format', 'compact'])
    },
    objectiveSafeCommand: {
      status: objectiveSafeCommand.status || '',
      complete: Boolean(objectiveSafeCommand.complete),
      commandId: objectiveSafeCommand.commandId || '',
      monitorOnly: Boolean(objectiveSafeCommand.monitorOnly),
      mayOpenBrowser: Boolean(objectiveSafeCommand.mayOpenBrowser),
      startsCapture: Boolean(objectiveSafeCommand.startsCapture),
      blockedReason: objectiveSafeCommand.blockedReason || '',
      proofCaptureAllowedNow: Boolean(objectiveSafeCommand.proofCaptureAllowedNow),
      agentProofStep: objectiveSafeCommand.agentProofStep
        ? {
            startStatus: objectiveSafeCommand.agentProofStep.startStatus || '',
            startReadyToRun: Boolean(objectiveSafeCommand.agentProofStep.startReadyToRun),
            startBlockers: objectiveSafeCommand.agentProofStep.startBlockers || [],
            selectedCommandId: objectiveSafeCommand.agentProofStep.selectedCommandId || '',
            selectedStartsCapture: Boolean(objectiveSafeCommand.agentProofStep.selectedStartsCapture),
            latestAuthOk: Boolean(objectiveSafeCommand.agentProofStep.latestAuthOk),
            captureCompleted: Boolean(objectiveSafeCommand.agentProofStep.captureCompleted),
            opensBrowserNow: Boolean(objectiveSafeCommand.agentProofStep.opensBrowserNow),
            startsCaptureNow: Boolean(objectiveSafeCommand.agentProofStep.startsCaptureNow),
            planCommand: objectiveSafeCommand.agentProofStep.planCommand || null,
            runCommand: objectiveSafeCommand.agentProofStep.runCommand || null,
            startCommand: objectiveSafeCommand.agentProofStep.startCommand || null,
            statusCommand: objectiveSafeCommand.agentProofStep.statusCommand || null
          }
        : null,
      outputPath: objectiveSafeCommandOutputPath || ''
    },
    agentProofChecklist: {
      complete: Boolean(agentProofChecklist.complete),
      verdict: agentProofChecklist.verdict || '',
      candidate: agentProofChecklist.candidate || '',
      readinessRemainingCount: agentProofChecklist.readinessRemainingCount ?? 0,
      readinessRemaining: Array.isArray(agentProofChecklist.readinessRemaining) ? agentProofChecklist.readinessRemaining : [],
      authState: agentProofChecklist.authState || '',
      authUsable: Boolean(agentProofChecklist.authUsable),
      captureBlocked: Boolean(agentProofChecklist.captureBlocked),
      automationBlocker: agentProofChecklist.automationBlocker || '',
      operatorApprovalRequired: Boolean(agentProofChecklist.operatorApprovalRequired),
      operatorApprovalToken: agentProofChecklist.operatorApprovalToken || '',
      operatorCommandOpensBrowser: Boolean(agentProofChecklist.operatorCommandOpensBrowser),
      operatorCommandStartsCapture: Boolean(agentProofChecklist.operatorCommandStartsCapture),
      agentMustNotRunOperatorResumeUnattended: Boolean(agentProofChecklist.agentMustNotRunOperatorResumeUnattended),
      command: agentProofChecklist.commands?.checklist || null,
      writeCommand: agentProofChecklist.commands?.checklistWrite || null,
      statusCommand: agentProofChecklist.commands?.checklistStatus || null,
      operatorResumeCommand: agentProofChecklist.commands?.operatorResume || null,
      outputPath: agentProofChecklistOutputPath || ''
    },
    agentProofCloseout: {
      complete: Boolean(agentProofCloseout.complete),
      verdict: agentProofCloseout.verdict || '',
      candidate: agentProofCloseout.candidate || '',
      readinessRemainingCount: agentProofCloseout.readinessRemainingCount ?? 0,
      readinessRemaining: Array.isArray(agentProofCloseout.readinessRemaining) ? agentProofCloseout.readinessRemaining : [],
      authState: agentProofCloseout.authState || '',
      authUsable: Boolean(agentProofCloseout.authUsable),
      captureBlocked: Boolean(agentProofCloseout.captureBlocked),
      automationBlocker: agentProofCloseout.automationBlocker || '',
      acceptedExternalProofs: agentProofCloseout.acceptedExternalProofs ?? 0,
      missingArtifacts: Array.isArray(agentProofCloseout.missingArtifacts) ? agentProofCloseout.missingArtifacts : [],
      checklistExists: Boolean(agentProofCloseout.checklistExists),
      checklistParseOk: Boolean(agentProofCloseout.checklistParseOk),
      checklistStale: Boolean(agentProofCloseout.checklistStale),
      operatorResumeRequiresOperatorApproval: Boolean(agentProofCloseout.operatorResumeRequiresOperatorApproval),
      operatorResumeOpensBrowser: Boolean(agentProofCloseout.operatorResumeOpensBrowser),
      operatorResumeStartsCapture: Boolean(agentProofCloseout.operatorResumeStartsCapture),
      operatorResumeAgentMayRunUnattended: Boolean(agentProofCloseout.operatorResumeAgentMayRunUnattended),
      providerDefaultBackend: agentProofCloseout.providerDefaultBackend || '',
      providerDefaultAgentInterface: agentProofCloseout.providerDefaultAgentInterface || '',
      providerPlaywrightReadyForPublicSmoke: Boolean(agentProofCloseout.providerPlaywrightReadyForPublicSmoke),
      providerPlaywrightReadyForAuthenticatedDefault: Boolean(agentProofCloseout.providerPlaywrightReadyForAuthenticatedDefault),
      providerPlaywrightStorageStateSensitive: Boolean(agentProofCloseout.providerPlaywrightStorageStateSensitive),
      providerDoctorOpensBrowser: Boolean(agentProofCloseout.providerDoctorOpensBrowser),
      providerDoctorStartsCapture: Boolean(agentProofCloseout.providerDoctorStartsCapture),
      providerDoctorReadsBrowserStorage: Boolean(agentProofCloseout.providerDoctorReadsBrowserStorage),
      providerDoctorReturnsPageContent: Boolean(agentProofCloseout.providerDoctorReturnsPageContent),
      providerDoctorMayRunUnattended: Boolean(agentProofCloseout.providerDoctorMayRunUnattended),
      agentSafeNextCommandId: agentProofCloseout.agentSafeNextCommandId || 'none',
      agentSafeNextMayRunUnattended: Boolean(agentProofCloseout.agentSafeNextMayRunUnattended),
      agentSafeNextOpensBrowser: Boolean(agentProofCloseout.agentSafeNextOpensBrowser),
      agentSafeNextStartsCapture: Boolean(agentProofCloseout.agentSafeNextStartsCapture),
      agentSafeNextReadsBrowserStorage: Boolean(agentProofCloseout.agentSafeNextReadsBrowserStorage),
      agentSafeNextReturnsPageContent: Boolean(agentProofCloseout.agentSafeNextReturnsPageContent),
      targetApprovalPreflightMayRunUnattended: Boolean(agentProofCloseout.targetApprovalPreflightMayRunUnattended),
      targetApprovalPreflightOpensBrowser: Boolean(agentProofCloseout.targetApprovalPreflightOpensBrowser),
      targetApprovalPreflightStartsCapture: Boolean(agentProofCloseout.targetApprovalPreflightStartsCapture),
      targetProofPlanMayRunUnattended: Boolean(agentProofCloseout.targetProofPlanMayRunUnattended),
      targetProofPlanOpensBrowser: Boolean(agentProofCloseout.targetProofPlanOpensBrowser),
      targetProofPlanStartsCapture: Boolean(agentProofCloseout.targetProofPlanStartsCapture),
      command: agentProofCloseout.commands?.closeout || null,
      writeCommand: agentProofCloseout.commands?.closeoutWrite || null,
      statusCommand: agentProofCloseout.commands?.closeoutStatus || null,
      checklistRefreshCommand: agentProofCloseout.commands?.checklistRefresh || null,
      checklistStatusCommand: agentProofCloseout.commands?.checklistStatus || null,
      completionProofBundleCommand: agentProofCloseout.commands?.completionProofBundle || null,
      completionProofBundleWithAuditCommand: agentProofCloseout.commands?.completionProofBundleWithAudit || null,
      completionProofBundleStatusCommand: agentProofCloseout.commands?.completionProofBundleStatus || null,
      compactCommandAuditAllCommand: agentProofCloseout.commands?.compactCommandAuditAll || null,
      objectiveCompletionCommand: agentProofCloseout.commands?.objectiveCompletion || null,
      objectiveCompletionStrictCommand: agentProofCloseout.commands?.objectiveCompletionStrict || null,
      agentSafeNextCommand: agentProofCloseout.commands?.agentSafeNext || null,
      targetApprovalPreflightCommand: agentProofCloseout.commands?.targetApprovalPreflight || null,
      targetProofPlanCommand: agentProofCloseout.commands?.targetProofPlan || null,
      providerDoctorStatusCommand: agentProofCloseout.commands?.providerDoctorStatus || null,
      operatorResumeCommand: agentProofCloseout.commands?.operatorResume || null,
      outputPath: agentProofCloseoutOutputPath || ''
    },
    regularChrome,
    secrets: {
      handoffMode: secretEnvHandoff.mode || '',
      headlessReady: Boolean(secretEnvHandoff.headlessReady),
      headlessConfigAvailable: Boolean(secretEnvHandoff.headlessConfigAvailable),
      requiresOnePasswordApproval: Boolean(secretEnvHandoff.requiresOnePasswordApproval),
      mutatesOnePasswordNow: Boolean(secretEnvHandoff.mutatesOnePasswordNow),
      nextAction: secretEnvHandoff.nextAction || ''
    },
    proofGateWatchStatus: proofGateWatch.status || '',
    commandCount: objectiveHandoff.commands?.length || 0,
    files,
    summaries: {
      controlStatus,
      objectiveStatus,
      proofGateStatus,
      proofGateWatch,
      loginHandoffStatus,
      runtimeAudit,
      runtimeCleanupPlan,
      chromeControlPlan,
      chromeMcpStatus,
      browserRoute,
      backendMatrix,
      backendMatrixStatus,
      chromeExtensionStatus,
      chromeExtensionHandoff,
      chromeExtensionResume,
      chromeExtensionTroubleshoot,
      chromeExtensionBackendCheckPlan,
      chromeExtensionClaimPlan,
      savedRegularChromeUse: {
        path: savedRegularChromeUse.path,
        available: savedRegularChromeUse.available,
        used: savedRegularChromeUse.used,
        stale: savedRegularChromeUse.stale,
        ageSeconds: savedRegularChromeUse.ageSeconds,
        maxAgeSeconds: savedRegularChromeUse.maxAgeSeconds
      },
      appleEventsObservation: {
        observed: appleEventsObservation.observed,
        activeTabObserved: appleEventsObservation.activeTabObserved,
        javascriptAllowed: appleEventsObservation.javascriptAllowed,
        statusFile: appleEventsObservation.statusFile
      },
      chromeMcpObservation: chromeMcpObservation.observation,
      chromeMcpTimeoutPlan,
      agentLoopStepStatus,
      backgroundProofPipeline,
      backgroundProofCapturePlan,
      backgroundProofCaptureStatus,
      backgroundProofCaptureStart,
      backgroundProofMonitorStart,
      runGateAudit,
      objectiveSafeCommand,
      agentProofChecklist,
      agentProofCloseout,
      secretEnvHandoff,
      objectiveHandoff
    }
  };
  const agentNextCommand = command(['node', 'src/cli.mjs', 'agent-next', ...monitorArgs, '--format', 'compact']);
  const agentNext = buildAgentNext({
    ...controlStatus,
    complete: pack.complete,
    objective: {
      ...(controlStatus.objective || {}),
      status: pack.status,
      operatorInput: pack.operatorInput,
      nextAction: pack.executionPolicy?.agentSafeAction || pack.nextAction?.id || ''
    },
    objectiveSafeCommand: {
      ...(controlStatus.objectiveSafeCommand || {}),
      action: pack.executionPolicy?.agentSafeAction || '',
      commandId: pack.executionPolicy?.agentSafeCommandId || 'none',
      monitorOnly: Boolean(pack.executionPolicy?.agentSafeCommandMonitorOnly),
      mayOpenBrowser: Boolean(pack.executionPolicy?.agentSafeCommandMayOpenBrowser),
      startsCapture: Boolean(pack.executionPolicy?.agentSafeCommandStartsCapture),
      blockedReason: pack.executionPolicy?.agentSafeCommandBlockedReason || '',
      proofCaptureAllowedNow: Boolean(pack.executionPolicy?.proofCaptureAllowedNow),
      command: pack.executionPolicy?.agentSafeCommand || null,
      targetApproval: {
        humanAction: pack.targetApproval?.humanAction || pack.operatorGuidance?.humanAction || '',
        automationBlocker: pack.targetApproval?.automationBlocker || pack.operatorGuidance?.automationBlocker || '',
        resumeOperatorOkRequired: Boolean(pack.targetApproval?.resumeOperatorOkRequired),
        nextCommandRequiresOperatorApproval: Boolean(pack.targetApproval?.nextCommandRequiresOperatorApproval),
        resumePlannedCommandOpensBrowser: Boolean(pack.targetApproval?.resumePlannedCommandOpensBrowser),
        resumePlannedCommandStartsCapture: Boolean(pack.targetApproval?.resumePlannedCommandStartsCapture),
        nextCommandOpensBrowser: Boolean(pack.targetApproval?.nextCommandOpensBrowser),
        nextCommandStartsCapture: Boolean(pack.targetApproval?.nextCommandStartsCapture)
      }
    },
    agentLoop: controlStatus.agentLoop || {
      nextAction: pack.executionPolicy?.agentSafeAction || 'none',
      canRunWithoutApproval: Boolean(
        pack.executionPolicy?.agentSafeCommand
        && !pack.executionPolicy?.agentSafeCommandMayOpenBrowser
        && (!pack.executionPolicy?.agentSafeCommandStartsCapture || pack.executionPolicy?.proofCaptureAllowedNow)
      ),
      commandId: pack.executionPolicy?.agentSafeCommandId || 'none',
      command: pack.executionPolicy?.agentSafeCommand || null,
      statusCommand: command(['node', 'src/cli.mjs', 'control-status', ...monitorArgs, '--format', 'compact']),
      stepPlanCommand: pack.executionPolicy?.agentLoopStepPlanCommand || null,
      stepStatusCommand: pack.executionPolicy?.agentLoopStepStatusCommand || null,
      opensBrowserNow: false,
      startsCaptureNow: false
    },
    commands: {
      ...(controlStatus.commands || {}),
      providerDoctorStatus: controlStatus.commands?.providerDoctorStatus || {
        shell: command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact'])
      },
      targetApprovalPreflight: pack.targetApproval?.preflightCommand || null,
      targetApprovalResumeProofPlan: pack.targetApproval?.resumeProofPlanCommand || null,
      targetApprovalResumePlan: pack.targetApproval?.resumePlanCommand || null,
      targetApprovalResumeRun: pack.targetApproval?.resumeRunCommand || null
    },
    backendMatrix: {
      ...(controlStatus.backendMatrix || {}),
      defaultBackend: pack.backendMatrix?.defaultBackend || '',
      defaultAgentInterface: pack.backendMatrix?.defaultAgentInterface || '',
      authenticatedBackend: pack.backendMatrix?.authenticatedBackend || '',
      existingTabBackend: pack.backendMatrix?.existingTabBackend || '',
      chromeMcpRouteReady: Boolean(pack.backendMatrix?.chromeMcpRouteReady),
      chromeMcpListPagesTimedOut: Boolean(pack.backendMatrix?.chromeMcpListPagesTimedOut)
    },
    browser: {
      ...(controlStatus.browser || {}),
      everydayChromeExtensionReady: Boolean(pack.regularChrome?.ready),
      everydayChromeCdpAllowed: Boolean(pack.regularChrome?.cdpAllowed)
    },
    secret: {
      ...(controlStatus.secret || {}),
      headlessReady: Boolean(pack.secrets?.headlessReady)
    },
    runGate: pack.runGate
  });
  if (!agentNext.providerDoctorCommand?.shell) {
    agentNext.providerDoctorCommand = command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']);
  }
  agentNext.providerDoctorMayRunUnattended = Boolean(agentNext.providerDoctorCommand);
  pack.agentNext = {
    ...agentNext,
    command: agentNextCommand
  };

  // Reported file paths are CLI contract - they land in runs/ JSON, get compared across
  // machines and pasted back as arguments - so they are normalised in one place rather than
  // at each of the two dozen assignment sites. fs still accepts forward slashes on Windows.
  for (const [key, value] of Object.entries(files)) {
    if (typeof value === 'string' && value) files[key] = toPosixPath(value);
  }

  if (write) {
    const outputPath = safeRunPath(rootDir, options.out || options.output);
    files.operatorPack = toPosixPath(outputPath);
    writeJson(outputPath, pack);
  }

  return pack;
}

export function buildOperatorPackStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const inputPath = safeRunInputPath(rootDir, options.in || options.input || 'operator/operator-pack-latest.json', 'operator/operator-pack-latest.json');
  const input = fileSummary(inputPath);
  const saved = input.exists ? readJson(inputPath) : null;
  const parseOk = !input.exists || Boolean(saved);
  const age = summaryAgeSeconds(input, options.nowMs || Date.now());
  const stale = !input.exists || !parseOk || age === null || age > staleAfterSeconds;
  const relativeInput = runsRelativePath(rootDir, inputPath);
  const refreshCommand = command(['node', 'src/cli.mjs', 'operator-pack', '--write', '--out', relativeInput, '--format', 'compact']);
  const statusCommand = command(['node', 'src/cli.mjs', 'operator-pack-status', '--in', relativeInput, '--format', 'compact']);
  const agentNext = saved?.agentNext || {};
  const closeout = saved?.agentProofCloseout || {};
  const checklist = saved?.agentProofChecklist || {};
  const remaining = Array.isArray(closeout.readinessRemaining)
    ? closeout.readinessRemaining
    : Array.isArray(checklist.readinessRemaining)
      ? checklist.readinessRemaining
      : [];
  const savedAgentCommandId = agentNext.agentCommandId && agentNext.agentCommandId !== 'none'
    ? agentNext.agentCommandId
    : '';
  const savedAgentCommand = agentNext.agentCanRunWithoutApproval && agentNext.agentRunCommand
    ? agentNext.agentRunCommand
    : agentNext.agentPollCommand || agentNext.agentStatusCommand || null;
  const agentSafeNextCommand = stale ? refreshCommand : savedAgentCommand;
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
    inputPath: relativeInput,
    exists: input.exists,
    parseOk,
    stale,
    ageSeconds: age,
    staleAfterSeconds,
    savedComplete: Boolean(saved?.complete),
    savedStatus: saved?.status || '',
    savedTarget: saved?.target || '',
    savedOperatorInput: Boolean(saved?.operatorInput),
    readinessRemainingCount: remaining.length,
    readinessRemaining: remaining,
    agentProofChecklistComplete: Boolean(checklist.complete),
    agentProofCloseoutComplete: Boolean(closeout.complete),
    agentSafeNextCommandId: stale
      ? 'operator-pack-refresh'
      : savedAgentCommandId || (savedAgentCommand ? 'agent-status' : 'none'),
    agentSafeNextMayRunUnattended: Boolean(stale || savedAgentCommand),
    agentSafeNextOpensBrowser: stale ? false : Boolean(agentNext.opensBrowserNow),
    agentSafeNextStartsCapture: stale ? false : Boolean(agentNext.startsCaptureNow),
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    providerDefaultBackend: agentNext.providerDefaultBackend || '',
    providerDefaultAgentInterface: agentNext.providerDefaultAgentInterface || '',
    providerPublicBenchmarkProofExists: Boolean(agentNext.providerPublicBenchmarkProofExists),
    providerPublicBenchmarkProofOk: Boolean(agentNext.providerPublicBenchmarkProofOk),
    providerPublicBenchmarkProofPath: agentNext.providerPublicBenchmarkProofPath || '',
    providerPublicBenchmarkFastestMeasuredProvider: agentNext.providerPublicBenchmarkFastestMeasuredProvider || '',
    providerPublicBenchmarkAgentMayRunUnattended: Boolean(agentNext.providerPublicBenchmarkAgentMayRunUnattended),
    providerPublicBenchmarkStartsBrowser: Boolean(agentNext.providerPublicBenchmarkStartsBrowser),
    providerPublicBenchmarkReadsBrowserStorage: Boolean(agentNext.providerPublicBenchmarkReadsBrowserStorage),
    providerPublicBenchmarkReturnsPageContent: Boolean(agentNext.providerPublicBenchmarkReturnsPageContent),
    refreshCommand,
    statusCommand,
    agentSafeNextCommand
  };
}

export function formatOperatorPackCompact(pack) {
  const lines = [
    `complete: ${yesNo(pack.complete)}`,
    `status: ${compactValue(pack.status)}`,
    `target: ${compactValue(pack.target)}`,
    `target_dir: ${compactValue(pack.targetDir)}`,
    `operator_input: ${yesNo(pack.operatorInput)}`,
    `human_action: ${compactValue(pack.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(pack.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(pack.operatorGuidance?.captureBlocked)}`,
    `primary_command_opens_browser: ${yesNo(pack.primaryCommand?.opensBrowser)}`,
    `primary_command_waits_for_auth: ${yesNo(pack.primaryCommand?.waitsForAuth)}`,
    `primary_command_starts_capture: ${yesNo(pack.primaryCommand?.startsCapture)}`,
    `primary_command_requires_operator_approval: ${yesNo(pack.primaryCommand?.requiresOperatorApproval)}`,
    `primary_command_agent_may_run_unattended: ${yesNo(pack.primaryCommand?.agentMayRunUnattended)}`,
    `auth_check_ok: ${yesNo(pack.authCheckOk)}`,
    `login_like: ${yesNo(pack.loginLike)}`,
    `auth_state: ${compactValue(pack.authState)}`,
    `auth_usable: ${yesNo(pack.authUsable)}`,
    `profile_auth_metadata_only: ${yesNo(pack.profileAuthMetadataOnly)}`,
    `handoff_auth_check_port: ${compactValue(pack.handoffAuthCheckPort)}`,
    `handoff_auth_check_port_reachable: ${yesNoUnknown(pack.handoffAuthCheckPortReachable)}`,
    `agent_safe_action: ${compactValue(pack.executionPolicy?.agentSafeAction)}`,
    `agent_safe_command_id: ${compactValue(pack.executionPolicy?.agentSafeCommandId)}`,
    `agent_safe_command_monitor_only: ${yesNo(pack.executionPolicy?.agentSafeCommandMonitorOnly)}`,
    `agent_safe_command_may_open_browser: ${yesNo(pack.executionPolicy?.agentSafeCommandMayOpenBrowser)}`,
    `agent_safe_command_starts_capture: ${yesNo(pack.executionPolicy?.agentSafeCommandStartsCapture)}`,
    `agent_safe_command_blocked_reason: ${compactValue(pack.executionPolicy?.agentSafeCommandBlockedReason)}`,
    `agent_next_action: ${compactValue(pack.agentNext?.nextAction)}`,
    `agent_next_can_run_without_approval: ${yesNo(pack.agentNext?.agentCanRunWithoutApproval)}`,
    `agent_next_command_id: ${compactValue(pack.agentNext?.agentCommandId)}`,
    `agent_next_preflight_available: ${yesNo(pack.agentNext?.agentPreflightAvailable)}`,
    `agent_next_preflight_action: ${compactValue(pack.agentNext?.agentPreflightAction)}`,
    `agent_next_preflight_may_run_without_approval: ${yesNo(pack.agentNext?.agentPreflightMayRunWithoutApproval)}`,
    `agent_next_proof_plan_available: ${yesNo(pack.agentNext?.agentProofPlanAvailable)}`,
    `agent_next_proof_plan_action: ${compactValue(pack.agentNext?.agentProofPlanAction)}`,
    `agent_next_proof_plan_may_run_without_approval: ${yesNo(pack.agentNext?.agentProofPlanMayRunWithoutApproval)}`,
    `agent_next_operator_approval_required: ${yesNo(pack.agentNext?.operatorApprovalRequired)}`,
    `agent_next_operator_approval_preflight_opens_browser: ${yesNo(pack.agentNext?.operatorApprovalPreflightOpensBrowser)}`,
    `agent_next_operator_approval_preflight_starts_capture: ${yesNo(pack.agentNext?.operatorApprovalPreflightStartsCapture)}`,
    `agent_next_operator_approval_preflight_reads_browser_storage: ${yesNo(pack.agentNext?.operatorApprovalPreflightReadsBrowserStorage)}`,
    `agent_next_operator_approval_preflight_returns_page_content: ${yesNo(pack.agentNext?.operatorApprovalPreflightReturnsPageContent)}`,
    `agent_next_operator_approval_preflight_may_run_unattended: ${yesNo(pack.agentNext?.operatorApprovalPreflightMayRunUnattended)}`,
    `agent_next_operator_approval_proof_plan_opens_browser: ${yesNo(pack.agentNext?.operatorApprovalProofPlanOpensBrowser)}`,
    `agent_next_operator_approval_proof_plan_starts_capture: ${yesNo(pack.agentNext?.operatorApprovalProofPlanStartsCapture)}`,
    `agent_next_operator_approval_proof_plan_reads_browser_storage: ${yesNo(pack.agentNext?.operatorApprovalProofPlanReadsBrowserStorage)}`,
    `agent_next_operator_approval_proof_plan_returns_page_content: ${yesNo(pack.agentNext?.operatorApprovalProofPlanReturnsPageContent)}`,
    `agent_next_operator_approval_proof_plan_may_run_unattended: ${yesNo(pack.agentNext?.operatorApprovalProofPlanMayRunUnattended)}`,
    `agent_next_operator_approval_opens_browser: ${yesNo(pack.agentNext?.operatorApprovalCommandOpensBrowser)}`,
    `agent_next_operator_approval_starts_capture: ${yesNo(pack.agentNext?.operatorApprovalCommandStartsCapture)}`,
    `agent_next_operator_approval_agent_may_run_unattended: ${yesNo(pack.agentNext?.operatorApprovalCommandAgentMayRunUnattended)}`,
    `agent_next_human_action: ${compactValue(pack.agentNext?.humanAction)}`,
    `agent_next_automation_blocker: ${compactValue(pack.agentNext?.automationBlocker || pack.agentNext?.blockedReason)}`,
    `agent_next_opens_browser_now: ${yesNo(pack.agentNext?.opensBrowserNow)}`,
    `agent_next_starts_capture_now: ${yesNo(pack.agentNext?.startsCaptureNow)}`,
    `agent_next_provider_default_backend: ${compactValue(pack.agentNext?.providerDefaultBackend)}`,
    `agent_next_provider_default_agent_interface: ${compactValue(pack.agentNext?.providerDefaultAgentInterface)}`,
    `agent_next_provider_public_benchmark_proof_exists: ${yesNo(pack.agentNext?.providerPublicBenchmarkProofExists)}`,
    `agent_next_provider_public_benchmark_proof_ok: ${yesNo(pack.agentNext?.providerPublicBenchmarkProofOk)}`,
    `agent_next_provider_public_benchmark_proof_path: ${compactValue(pack.agentNext?.providerPublicBenchmarkProofPath)}`,
    `agent_next_provider_public_benchmark_fastest_measured_provider: ${compactValue(pack.agentNext?.providerPublicBenchmarkFastestMeasuredProvider)}`,
    `agent_next_provider_public_benchmark_direct_cdp_cold_ok: ${yesNo(pack.agentNext?.providerPublicBenchmarkDirectCdpColdOk)}`,
    `agent_next_provider_public_benchmark_direct_cdp_daemon_ok: ${yesNo(pack.agentNext?.providerPublicBenchmarkDirectCdpDaemonOk)}`,
    `agent_next_provider_public_benchmark_agent_browser_chrome_ok: ${yesNo(pack.agentNext?.providerPublicBenchmarkAgentBrowserChromeOk)}`,
    `agent_next_provider_public_benchmark_playwright_ok: ${yesNo(pack.agentNext?.providerPublicBenchmarkPlaywrightOk)}`,
    `agent_next_provider_public_benchmark_agent_may_run_unattended: ${yesNo(pack.agentNext?.providerPublicBenchmarkAgentMayRunUnattended)}`,
    `agent_next_provider_public_benchmark_starts_browser: ${yesNo(pack.agentNext?.providerPublicBenchmarkStartsBrowser)}`,
    `agent_next_provider_public_benchmark_reads_browser_storage: ${yesNo(pack.agentNext?.providerPublicBenchmarkReadsBrowserStorage)}`,
    `agent_next_provider_public_benchmark_returns_page_content: ${yesNo(pack.agentNext?.providerPublicBenchmarkReturnsPageContent)}`,
    `agent_next_provider_public_benchmark_command: ${compactValue(pack.agentNext?.providerPublicBenchmarkCommand)}`,
    `agent_next_provider_lightpanda_ready_for_public_benchmark: ${yesNo(pack.agentNext?.providerLightpandaReadyForPublicBenchmark)}`,
    `agent_next_provider_lightpanda_benchmark_agent_may_run_unattended: ${yesNo(pack.agentNext?.providerLightpandaBenchmarkAgentMayRunUnattended)}`,
    `agent_next_provider_lightpanda_benchmark_starts_browser: ${yesNo(pack.agentNext?.providerLightpandaBenchmarkStartsBrowser)}`,
    `agent_next_provider_lightpanda_benchmark_reads_browser_storage: ${yesNo(pack.agentNext?.providerLightpandaBenchmarkReadsBrowserStorage)}`,
    `agent_next_provider_lightpanda_benchmark_returns_page_content: ${yesNo(pack.agentNext?.providerLightpandaBenchmarkReturnsPageContent)}`,
    `agent_next_provider_lightpanda_benchmark_command: ${compactValue(pack.agentNext?.providerLightpandaBenchmarkCommand)}`,
    `agent_next_provider_playwright_ready_for_public_smoke: ${yesNo(pack.agentNext?.providerPlaywrightReadyForPublicSmoke)}`,
    `agent_next_provider_playwright_ready_for_authenticated_default: ${yesNo(pack.agentNext?.providerPlaywrightReadyForAuthenticatedDefault)}`,
    `agent_next_provider_playwright_storage_state_sensitive: ${yesNo(pack.agentNext?.providerPlaywrightStorageStateSensitive)}`,
    `agent_next_provider_playwright_smoke_command: ${compactValue(pack.agentNext?.providerPlaywrightSmokeCommand)}`,
    `agent_next_provider_selenium_ready_for_local_smoke: ${yesNo(pack.agentNext?.providerSeleniumReadyForLocalSmoke)}`,
    `agent_next_provider_selenium_smoke_agent_may_run_unattended: ${yesNo(pack.agentNext?.providerSeleniumSmokeAgentMayRunUnattended)}`,
    `agent_next_provider_selenium_smoke_starts_browser: ${yesNo(pack.agentNext?.providerSeleniumSmokeStartsBrowser)}`,
    `agent_next_provider_selenium_smoke_command: ${compactValue(pack.agentNext?.providerSeleniumSmokeCommand)}`,
    `agent_next_provider_doctor_opens_browser: ${yesNo(pack.agentNext?.providerDoctorOpensBrowser)}`,
    `agent_next_provider_doctor_starts_capture: ${yesNo(pack.agentNext?.providerDoctorStartsCapture)}`,
    `agent_next_provider_doctor_reads_browser_storage: ${yesNo(pack.agentNext?.providerDoctorReadsBrowserStorage)}`,
    `agent_next_provider_doctor_returns_page_content: ${yesNo(pack.agentNext?.providerDoctorReturnsPageContent)}`,
    `agent_next_provider_doctor_may_run_unattended: ${yesNo(pack.agentNext?.providerDoctorMayRunUnattended)}`,
    `agent_proof_checklist_complete: ${yesNo(pack.agentProofChecklist?.complete)}`,
    `agent_proof_checklist_verdict: ${compactValue(pack.agentProofChecklist?.verdict)}`,
    `agent_proof_checklist_readiness_remaining_count: ${pack.agentProofChecklist?.readinessRemainingCount ?? 0}`,
    `agent_proof_checklist_readiness_remaining: ${pack.agentProofChecklist?.readinessRemaining?.length ? pack.agentProofChecklist.readinessRemaining.join(',') : 'none'}`,
    `agent_proof_checklist_auth_state: ${compactValue(pack.agentProofChecklist?.authState)}`,
    `agent_proof_checklist_auth_usable: ${yesNo(pack.agentProofChecklist?.authUsable)}`,
    `agent_proof_checklist_capture_blocked: ${yesNo(pack.agentProofChecklist?.captureBlocked)}`,
    `agent_proof_checklist_automation_blocker: ${compactValue(pack.agentProofChecklist?.automationBlocker)}`,
    `agent_proof_checklist_operator_approval_required: ${yesNo(pack.agentProofChecklist?.operatorApprovalRequired)}`,
    `agent_proof_checklist_operator_approval_token: ${compactValue(pack.agentProofChecklist?.operatorApprovalToken)}`,
    `agent_proof_checklist_operator_command_opens_browser: ${yesNo(pack.agentProofChecklist?.operatorCommandOpensBrowser)}`,
    `agent_proof_checklist_operator_command_starts_capture: ${yesNo(pack.agentProofChecklist?.operatorCommandStartsCapture)}`,
    `agent_proof_checklist_agent_must_not_run_operator_resume_unattended: ${yesNo(pack.agentProofChecklist?.agentMustNotRunOperatorResumeUnattended)}`,
    `agent_proof_closeout_complete: ${yesNo(pack.agentProofCloseout?.complete)}`,
    `agent_proof_closeout_verdict: ${compactValue(pack.agentProofCloseout?.verdict)}`,
    `agent_proof_closeout_readiness_remaining_count: ${pack.agentProofCloseout?.readinessRemainingCount ?? 0}`,
    `agent_proof_closeout_readiness_remaining: ${pack.agentProofCloseout?.readinessRemaining?.length ? pack.agentProofCloseout.readinessRemaining.join(',') : 'none'}`,
    `agent_proof_closeout_auth_state: ${compactValue(pack.agentProofCloseout?.authState)}`,
    `agent_proof_closeout_auth_usable: ${yesNo(pack.agentProofCloseout?.authUsable)}`,
    `agent_proof_closeout_capture_blocked: ${yesNo(pack.agentProofCloseout?.captureBlocked)}`,
    `agent_proof_closeout_automation_blocker: ${compactValue(pack.agentProofCloseout?.automationBlocker)}`,
    `agent_proof_closeout_accepted_external_proofs: ${pack.agentProofCloseout?.acceptedExternalProofs ?? 0}`,
    `agent_proof_closeout_checklist_exists: ${yesNo(pack.agentProofCloseout?.checklistExists)}`,
    `agent_proof_closeout_checklist_parse_ok: ${yesNo(pack.agentProofCloseout?.checklistParseOk)}`,
    `agent_proof_closeout_operator_resume_requires_operator_approval: ${yesNo(pack.agentProofCloseout?.operatorResumeRequiresOperatorApproval)}`,
    `agent_proof_closeout_operator_resume_opens_browser: ${yesNo(pack.agentProofCloseout?.operatorResumeOpensBrowser)}`,
    `agent_proof_closeout_operator_resume_starts_capture: ${yesNo(pack.agentProofCloseout?.operatorResumeStartsCapture)}`,
    `agent_proof_closeout_operator_resume_agent_may_run_unattended: ${yesNo(pack.agentProofCloseout?.operatorResumeAgentMayRunUnattended)}`,
    `agent_proof_closeout_provider_default_backend: ${compactValue(pack.agentProofCloseout?.providerDefaultBackend)}`,
    `agent_proof_closeout_provider_default_agent_interface: ${compactValue(pack.agentProofCloseout?.providerDefaultAgentInterface)}`,
    `agent_proof_closeout_provider_playwright_ready_for_public_smoke: ${yesNo(pack.agentProofCloseout?.providerPlaywrightReadyForPublicSmoke)}`,
    `agent_proof_closeout_provider_playwright_ready_for_authenticated_default: ${yesNo(pack.agentProofCloseout?.providerPlaywrightReadyForAuthenticatedDefault)}`,
    `agent_proof_closeout_provider_playwright_storage_state_sensitive: ${yesNo(pack.agentProofCloseout?.providerPlaywrightStorageStateSensitive)}`,
    `agent_proof_closeout_provider_doctor_opens_browser: ${yesNo(pack.agentProofCloseout?.providerDoctorOpensBrowser)}`,
    `agent_proof_closeout_provider_doctor_starts_capture: ${yesNo(pack.agentProofCloseout?.providerDoctorStartsCapture)}`,
    `agent_proof_closeout_provider_doctor_reads_browser_storage: ${yesNo(pack.agentProofCloseout?.providerDoctorReadsBrowserStorage)}`,
    `agent_proof_closeout_provider_doctor_returns_page_content: ${yesNo(pack.agentProofCloseout?.providerDoctorReturnsPageContent)}`,
    `agent_proof_closeout_provider_doctor_may_run_unattended: ${yesNo(pack.agentProofCloseout?.providerDoctorMayRunUnattended)}`,
    `monitor_only_command_available: ${yesNo(pack.executionPolicy?.monitorOnlyCommandAvailable)}`,
    `auth_first_resume_available: ${yesNo(pack.executionPolicy?.authFirstResumeAvailable)}`,
    `proof_capture_allowed_now: ${yesNo(pack.executionPolicy?.proofCaptureAllowedNow)}`,
    `proof_capture_blocked_until_auth: ${yesNo(pack.executionPolicy?.proofCaptureBlockedUntilAuth)}`,
    `auth_first_resume_may_open_browser: ${yesNo(pack.executionPolicy?.authFirstResumeMayOpenBrowser)}`,
    `auth_first_resume_starts_capture_after_auth_only: ${yesNo(pack.executionPolicy?.authFirstResumeStartsCaptureAfterAuthOnly)}`,
    `operator_must_login: ${yesNo(pack.executionPolicy?.operatorMustLogin)}`,
    `agent_loop_step_saved_exists: ${yesNo(pack.agentLoopStepStatus?.exists)}`,
    `agent_loop_step_saved_stale: ${yesNo(pack.agentLoopStepStatus?.stale)}`,
    `agent_loop_step_saved_status: ${compactValue(pack.agentLoopStepStatus?.status)}`,
    `agent_loop_step_saved_next_action: ${compactValue(pack.agentLoopStepStatus?.nextAction)}`,
    `agent_loop_step_saved_recommended_command_id: ${compactValue(pack.agentLoopStepStatus?.recommendedCommandId)}`,
    `agent_loop_step_saved_command_id: ${compactValue(pack.agentLoopStepStatus?.commandId)}`,
    `agent_loop_step_saved_allowed_to_run: ${yesNo(pack.agentLoopStepStatus?.allowedToRun)}`,
    `agent_loop_step_saved_executed: ${yesNo(pack.agentLoopStepStatus?.executed)}`,
    `agent_loop_step_saved_blocked_reason: ${compactValue(pack.agentLoopStepStatus?.blockedReason)}`,
    `agent_loop_step_saved_opens_browser_now: ${yesNo(pack.agentLoopStepStatus?.opensBrowserNow)}`,
    `agent_loop_step_saved_starts_capture_now: ${yesNo(pack.agentLoopStepStatus?.startsCaptureNow)}`,
    `agent_loop_step_saved_age_seconds: ${pack.agentLoopStepStatus?.ageSeconds ?? 'unknown'}`,
    `agent_loop_step_saved_stale_after_seconds: ${pack.agentLoopStepStatus?.staleAfterSeconds ?? 'unknown'}`,
    `proof_gate_next_artifact_action: ${compactValue(pack.proofGateArtifactAction?.nextArtifactAction)}`,
    `proof_gate_next_artifact_blocker: ${compactValue(pack.proofGateArtifactAction?.nextArtifactBlocker)}`,
    `proof_gate_artifact_command_covers: ${pack.proofGateArtifactAction?.artifactCommandCovers?.length ? pack.proofGateArtifactAction.artifactCommandCovers.join(',') : 'none'}`,
    `target_approval_pack_exists: ${yesNo(pack.targetApproval?.approvalPackExists)}`,
    `target_approval_pack_parse_ok: ${yesNo(pack.targetApproval?.approvalPackParseOk)}`,
    `target_approval_candidate: ${compactValue(pack.targetApproval?.selectedCandidate)}`,
    `target_approval_target_pack_exists: ${yesNo(pack.targetApproval?.targetPackExists)}`,
    `target_approval_inventory_complete: ${yesNo(pack.targetApproval?.proofInventoryComplete)}`,
    `target_approval_real_external_inventory: ${yesNo(pack.targetApproval?.realExternalInventory)}`,
    `target_approval_accepted_external_proofs: ${pack.targetApproval?.acceptedExternalProofs ?? 0}`,
    `target_approval_next: ${compactValue(pack.targetApproval?.targetNext)}`,
    `target_approval_human_action: ${compactValue(pack.targetApproval?.humanAction)}`,
    `target_approval_automation_blocker: ${compactValue(pack.targetApproval?.automationBlocker)}`,
    `target_approval_capture_blocked: ${yesNo(pack.targetApproval?.captureBlocked)}`,
    `target_approval_next_command_opens_browser: ${yesNo(pack.targetApproval?.nextCommandOpensBrowser)}`,
    `target_approval_next_command_starts_capture: ${yesNo(pack.targetApproval?.nextCommandStartsCapture)}`,
    `target_approval_next_command_requires_operator_approval: ${yesNo(pack.targetApproval?.nextCommandRequiresOperatorApproval)}`,
    `target_approval_next_command_agent_may_run_unattended: ${yesNo(pack.targetApproval?.nextCommandAgentMayRunUnattended)}`,
    `target_approval_auth_state: ${compactValue(pack.targetApproval?.authState)}`,
    `target_approval_auth_usable: ${yesNo(pack.targetApproval?.authUsable)}`,
    `target_approval_proof_ready_target: ${yesNo(pack.targetApproval?.proofReadyTarget)}`,
    `target_approval_resume_status: ${compactValue(pack.targetApproval?.resumeStatus)}`,
    `target_approval_resume_ready_to_run: ${yesNo(pack.targetApproval?.resumeReadyToRun)}`,
    `target_approval_resume_operator_ok_required: ${yesNo(pack.targetApproval?.resumeOperatorOkRequired)}`,
    `target_approval_resume_operator_ok_accepted: ${yesNo(pack.targetApproval?.resumeOperatorOkAccepted)}`,
    `target_approval_resume_agent_may_run_unattended: ${yesNo(pack.targetApproval?.resumeAgentMayRunUnattended)}`,
    `target_approval_resume_planned_opens_browser: ${yesNo(pack.targetApproval?.resumePlannedCommandOpensBrowser)}`,
    `target_approval_resume_planned_starts_capture: ${yesNo(pack.targetApproval?.resumePlannedCommandStartsCapture)}`,
    `login_handoff_status: ${compactValue(pack.loginHandoff?.status)}`,
    `login_handoff_next_action: ${compactValue(pack.loginHandoff?.nextAction)}`,
    `login_handoff_required: ${yesNo(pack.loginHandoff?.loginRequired)}`,
    `login_handoff_auth_usable: ${yesNo(pack.loginHandoff?.authUsable)}`,
    `login_handoff_safe_monitor_available: ${yesNo(pack.loginHandoff?.safeMonitorAvailable)}`,
    `login_handoff_safe_monitor_only: ${yesNo(pack.loginHandoff?.safeMonitorOnly)}`,
    `login_handoff_dedicated_browser_port: ${compactValue(pack.loginHandoff?.dedicatedBrowserPort)}`,
    `login_handoff_dedicated_browser_reachable: ${yesNoUnknown(pack.loginHandoff?.dedicatedBrowserReachable)}`,
    `login_handoff_opens_browser_now: ${yesNo(pack.loginHandoff?.opensBrowserNow)}`,
    `login_handoff_starts_capture_now: ${yesNo(pack.loginHandoff?.startsCaptureNow)}`,
    `login_handoff_capture_allowed_now: ${yesNo(pack.loginHandoff?.captureAllowedNow)}`,
    `login_handoff_proof_capture_blocked_until_auth: ${yesNo(pack.loginHandoff?.proofCaptureBlockedUntilAuth)}`,
    `handoff_resume_status: ${compactValue(pack.handoffResumeStatus?.status)}`,
    `handoff_resume_latest_auth_ok: ${yesNo(pack.handoffResumeStatus?.latestAuthOk)}`,
    `handoff_resume_capture_completed: ${yesNo(pack.handoffResumeStatus?.captureCompleted)}`,
    `handoff_resume_waiting_for_login: ${yesNo(pack.handoffResumeStatus?.waitingForLogin)}`,
    `handoff_resume_recommended_command_id: ${compactValue(pack.handoffResumeStatus?.recommendedCommandId)}`,
    `browser_route_task: ${compactValue(pack.browserRoute?.task)}`,
    `browser_route_lane: ${compactValue(pack.browserRoute?.selectedLane)}`,
    `browser_route_backend: ${compactValue(pack.browserRoute?.backend)}`,
    `browser_route_profile_mode: ${compactValue(pack.browserRoute?.profileMode)}`,
    `browser_route_operator_input: ${yesNo(pack.browserRoute?.operatorInput)}`,
    `browser_route_user_permission_required: ${yesNo(pack.browserRoute?.userPermissionRequired)}`,
    `browser_route_background: ${yesNo(pack.browserRoute?.canRunInBackground)}`,
    `browser_route_capture_blocked: ${yesNo(pack.browserRoute?.captureBlocked)}`,
    `browser_route_command_opens_browser: ${yesNo(pack.browserRoute?.commandOpensBrowser)}`,
    `browser_route_command_starts_capture: ${yesNo(pack.browserRoute?.command?.args?.includes('--wait-auth'))}`,
    `browser_route_command_requires_operator_approval: ${yesNo(pack.browserRoute?.operatorInput || pack.browserRoute?.userPermissionRequired || pack.browserRoute?.commandRunOnlyAfterUserSays)}`,
    `browser_route_command_agent_may_run_unattended: ${yesNo(pack.browserRoute?.command && !(pack.browserRoute?.operatorInput || pack.browserRoute?.userPermissionRequired || pack.browserRoute?.commandRunOnlyAfterUserSays))}`,
    `browser_route_approval_command_opens_browser: ${yesNo(pack.browserRoute?.approvalCommandOpensBrowser)}`,
    `browser_route_command_run_only_after_user_says: ${compactValue(pack.browserRoute?.commandRunOnlyAfterUserSays)}`,
    `browser_route_everyday_chrome_cdp_allowed: ${yesNo(pack.browserRoute?.everydayChromeCdpAllowed)}`,
    `backend_matrix_status: ${compactValue(pack.backendMatrix?.status)}`,
    `backend_matrix_exists: ${yesNo(pack.backendMatrix?.exists)}`,
    `backend_matrix_stale: ${yesNo(pack.backendMatrix?.stale)}`,
    `backend_matrix_default_backend: ${compactValue(pack.backendMatrix?.defaultBackend)}`,
    `backend_matrix_default_agent_interface: ${compactValue(pack.backendMatrix?.defaultAgentInterface)}`,
    `backend_matrix_search_backend: ${compactValue(pack.backendMatrix?.searchBackend)}`,
    `backend_matrix_analyze_backend: ${compactValue(pack.backendMatrix?.analyzeBackend)}`,
    `backend_matrix_scrape_backend: ${compactValue(pack.backendMatrix?.scrapeBackend)}`,
    `backend_matrix_operate_backend: ${compactValue(pack.backendMatrix?.operateBackend)}`,
    `backend_matrix_authenticated_backend: ${compactValue(pack.backendMatrix?.authenticatedBackend)}`,
    `backend_matrix_existing_tab_backend: ${compactValue(pack.backendMatrix?.existingTabBackend)}`,
    `backend_matrix_public_crawl_backend: ${compactValue(pack.backendMatrix?.publicCrawlBackend)}`,
    `backend_matrix_compatibility_backend: ${compactValue(pack.backendMatrix?.compatibilityBackend)}`,
    `backend_matrix_regular_chrome_status: ${compactValue(pack.backendMatrix?.regularChromeStatus)}`,
    `backend_matrix_chrome_mcp_route_ready: ${yesNo(pack.backendMatrix?.chromeMcpRouteReady)}`,
    `backend_matrix_chrome_mcp_list_pages_timed_out: ${yesNo(pack.backendMatrix?.chromeMcpListPagesTimedOut)}`,
    `backend_matrix_chrome_mcp_timeout_plan_source: ${compactValue(pack.backendMatrix?.chromeMcpTimeoutPlanSource)}`,
    `backend_matrix_chrome_mcp_timeout_plan_status: ${compactValue(pack.backendMatrix?.chromeMcpTimeoutPlanStatus)}`,
    `backend_matrix_chrome_mcp_timeout_plan_stale: ${yesNo(pack.backendMatrix?.chromeMcpTimeoutPlanStale)}`,
    `backend_matrix_chrome_mcp_timeout_plan_prefer_extension_resume: ${yesNo(pack.backendMatrix?.chromeMcpTimeoutPlanPreferExtensionResume)}`,
    `backend_matrix_backend_count: ${pack.backendMatrix?.backendCount ?? 0}`,
    `backend_matrix_saved_secret_values_read: ${yesNo(pack.backendMatrix?.savedSecretValuesRead)}`,
    `backend_matrix_saved_destructive_actions: ${yesNo(pack.backendMatrix?.savedDestructiveActions)}`,
    `proof_pipeline_status: ${compactValue(pack.proofPipeline?.status)}`,
    `proof_pipeline_recommended_now: ${compactValue(pack.proofPipeline?.recommendedNow)}`,
    `proof_pipeline_proof_capture_allowed_now: ${yesNo(pack.proofPipeline?.proofCaptureAllowedNow)}`,
    `proof_pipeline_wait_auth_then_capture_available: ${yesNo(pack.proofPipeline?.waitAuthThenCaptureAvailable)}`,
    `proof_pipeline_monitor_auth_available: ${yesNo(pack.proofPipeline?.monitorAuthAvailable)}`,
    `proof_pipeline_monitor_auth_opens_browser: ${yesNo(pack.proofPipeline?.monitorAuthOpensBrowser)}`,
    `proof_pipeline_monitor_auth_starts_capture: ${yesNo(pack.proofPipeline?.monitorAuthStartsCapture)}`,
    `proof_pipeline_open_login_available: ${yesNo(pack.proofPipeline?.openLoginAvailable)}`,
    `proof_pipeline_reopen_login_available: ${yesNo(pack.proofPipeline?.reopenLoginAvailable)}`,
    `proof_pipeline_reopen_login_opens_browser: ${yesNo(pack.proofPipeline?.reopenLoginOpensBrowser)}`,
    `proof_pipeline_reopen_login_starts_capture: ${yesNo(pack.proofPipeline?.reopenLoginStartsCapture)}`,
    `proof_pipeline_reopen_login_requires_operator_approval: ${yesNo(pack.proofPipeline?.reopenLoginAvailable)}`,
    `proof_pipeline_reopen_login_agent_may_run_unattended: no`,
    `proof_pipeline_wait_capture_opens_browser: ${yesNo(pack.proofPipeline?.waitCaptureOpensBrowser)}`,
    `proof_pipeline_wait_capture_waits_for_auth: ${yesNo(pack.proofPipeline?.waitCaptureWaitsForAuth)}`,
    `proof_pipeline_wait_capture_starts_capture: ${yesNo(pack.proofPipeline?.waitCaptureStartsCapture)}`,
    `proof_pipeline_wait_capture_requires_operator_approval: ${yesNo(pack.proofPipeline?.waitAuthThenCaptureAvailable)}`,
    `proof_pipeline_wait_capture_agent_may_run_unattended: no`,
    `proof_pipeline_wait_capture_no_open_available: ${yesNo(pack.proofPipeline?.waitCaptureNoOpenAvailable)}`,
    `proof_pipeline_wait_capture_no_open_opens_browser: ${yesNo(pack.proofPipeline?.waitCaptureNoOpenOpensBrowser)}`,
    `proof_pipeline_wait_capture_no_open_waits_for_auth: ${yesNo(pack.proofPipeline?.waitCaptureNoOpenWaitsForAuth)}`,
    `proof_pipeline_wait_capture_no_open_starts_capture: ${yesNo(pack.proofPipeline?.waitCaptureNoOpenStartsCapture)}`,
    `proof_pipeline_wait_capture_no_open_requires_operator_approval: ${yesNo(pack.proofPipeline?.waitCaptureNoOpenAvailable)}`,
    `proof_pipeline_wait_capture_no_open_agent_may_run_unattended: no`,
    `proof_pipeline_next_artifact_action: ${compactValue(pack.proofPipeline?.nextArtifactAction)}`,
    `proof_pipeline_next_artifact_blocker: ${compactValue(pack.proofPipeline?.nextArtifactBlocker)}`,
    `proof_pipeline_missing_artifact_count: ${pack.proofPipeline?.missingArtifactCount ?? 0}`,
    `run_gate_ok_for_agent_loops: ${yesNo(pack.runGate?.okForAgentLoops)}`,
    `run_gate_unguarded_agent_dangerous: ${pack.runGate?.unguardedAgentDangerous ?? 0}`,
    `run_gate_agent_safe_unattended: ${pack.runGate?.agentSafeUnattended ?? 0}`,
    `run_gate_operator_gated: ${pack.runGate?.operatorGated ?? 0}`,
    `run_gate_exact_operator_ok: ${pack.runGate?.exactOperatorOk ?? 0}`,
    `run_gate_direct_operator: ${pack.runGate?.directOperator ?? 0}`,
    `run_gate_total_surfaces: ${pack.runGate?.totalSurfaces ?? 0}`,
    `run_gate_opens_browser_now: ${yesNo(pack.runGate?.opensBrowserNow)}`,
    `run_gate_starts_capture_now: ${yesNo(pack.runGate?.startsCaptureNow)}`,
    `run_gate_starts_background_process_now: ${yesNo(pack.runGate?.startsBackgroundProcessNow)}`,
    `run_gate_next_action: ${compactValue(pack.runGate?.nextAction)}`,
    `background_proof_plan_status: ${compactValue(pack.backgroundProofCapture?.planStatus)}`,
    `background_proof_capture_blocked: ${yesNo(pack.backgroundProofCapture?.captureBlocked)}`,
    `background_proof_capture_blocked_reason: ${compactValue(pack.backgroundProofCapture?.captureBlockedReason)}`,
    `background_proof_monitor_available: ${yesNo(pack.backgroundProofCapture?.backgroundMonitorAvailable)}`,
    `background_proof_capture_available: ${yesNo(pack.backgroundProofCapture?.backgroundCaptureAvailable)}`,
    `background_proof_monitor_running: ${yesNo(pack.backgroundProofCapture?.monitorRunning)}`,
    `background_proof_capture_running: ${yesNo(pack.backgroundProofCapture?.captureRunning)}`,
    `background_proof_auth_watch_exists: ${yesNo(pack.backgroundProofCapture?.authWatchExists)}`,
    `background_proof_auth_watch_status: ${compactValue(pack.backgroundProofCapture?.authWatchStatus)}`,
    `background_proof_auth_watch_ok: ${yesNo(pack.backgroundProofCapture?.authWatchOk)}`,
    `background_proof_handoff_wait_auth_exists: ${yesNo(pack.backgroundProofCapture?.handoffWaitAuthExists)}`,
    `background_proof_handoff_wait_auth_status: ${compactValue(pack.backgroundProofCapture?.handoffWaitAuthStatus)}`,
    `background_proof_handoff_resume_latest_exists: ${yesNo(pack.backgroundProofCapture?.handoffResumeLatestExists)}`,
    `background_proof_handoff_resume_latest_status: ${compactValue(pack.backgroundProofCapture?.handoffResumeLatestStatus)}`,
    `background_proof_capture_start_status: ${compactValue(pack.backgroundProofCapture?.captureStartStatus)}`,
    `background_proof_capture_start_ready: ${yesNo(pack.backgroundProofCapture?.captureStartReadyToRun)}`,
    `background_proof_capture_start_operator_ok_accepted: ${yesNo(pack.backgroundProofCapture?.captureStartOperatorOkAccepted)}`,
    `background_proof_capture_start_blockers: ${pack.backgroundProofCapture?.captureStartBlockers?.length ? pack.backgroundProofCapture.captureStartBlockers.join(',') : 'none'}`,
    `background_proof_no_open_wait_capture_opens_browser: no`,
    `background_proof_no_open_wait_capture_starts_capture: ${yesNo(pack.backgroundProofCapture?.noOpenWaitCaptureCommand)}`,
    `background_proof_no_open_wait_capture_starts_background: no`,
    `background_proof_no_open_wait_capture_requires_operator_approval: ${yesNo(pack.backgroundProofCapture?.noOpenWaitCaptureCommand)}`,
    `background_proof_no_open_wait_capture_agent_may_run_unattended: no`,
    `background_proof_no_open_wait_capture_background_opens_browser: no`,
    `background_proof_no_open_wait_capture_background_starts_capture: ${yesNo(pack.backgroundProofCapture?.backgroundNoOpenWaitCaptureCommand)}`,
    `background_proof_no_open_wait_capture_background_starts_background: ${yesNo(pack.backgroundProofCapture?.backgroundNoOpenWaitCaptureCommand)}`,
    `background_proof_no_open_wait_capture_background_requires_operator_approval: ${yesNo(pack.backgroundProofCapture?.backgroundNoOpenWaitCaptureCommand)}`,
    `background_proof_no_open_wait_capture_background_agent_may_run_unattended: no`,
    `background_proof_monitor_start_status: ${compactValue(pack.backgroundProofCapture?.monitorStartStatus)}`,
    `background_proof_monitor_start_ready: ${yesNo(pack.backgroundProofCapture?.monitorStartReadyToRun)}`,
    `background_proof_monitor_start_blockers: ${pack.backgroundProofCapture?.monitorStartBlockers?.length ? pack.backgroundProofCapture.monitorStartBlockers.join(',') : 'none'}`,
    `objective_safe_command_status: ${compactValue(pack.objectiveSafeCommand?.status)}`,
    `objective_safe_command_id: ${compactValue(pack.objectiveSafeCommand?.commandId)}`,
    `objective_safe_command_monitor_only: ${yesNo(pack.objectiveSafeCommand?.monitorOnly)}`,
    `objective_safe_command_may_open_browser: ${yesNo(pack.objectiveSafeCommand?.mayOpenBrowser)}`,
    `objective_safe_command_starts_capture: ${yesNo(pack.objectiveSafeCommand?.startsCapture)}`,
    `objective_safe_command_blocked_reason: ${compactValue(pack.objectiveSafeCommand?.blockedReason)}`,
    `objective_safe_command_proof_capture_allowed_now: ${yesNo(pack.objectiveSafeCommand?.proofCaptureAllowedNow)}`,
    `agent_proof_step_start_status: ${compactValue(pack.objectiveSafeCommand?.agentProofStep?.startStatus)}`,
    `agent_proof_step_start_ready: ${yesNo(pack.objectiveSafeCommand?.agentProofStep?.startReadyToRun)}`,
    `agent_proof_step_start_blockers: ${pack.objectiveSafeCommand?.agentProofStep?.startBlockers?.length ? pack.objectiveSafeCommand.agentProofStep.startBlockers.join(',') : 'none'}`,
    `agent_proof_step_selected_command: ${compactValue(pack.objectiveSafeCommand?.agentProofStep?.selectedCommandId)}`,
    `agent_proof_step_selected_starts_capture: ${yesNo(pack.objectiveSafeCommand?.agentProofStep?.selectedStartsCapture)}`,
    `agent_proof_step_latest_auth_ok: ${yesNo(pack.objectiveSafeCommand?.agentProofStep?.latestAuthOk)}`,
    `agent_proof_step_capture_completed: ${yesNo(pack.objectiveSafeCommand?.agentProofStep?.captureCompleted)}`,
    `agent_proof_step_opens_browser_now: ${yesNo(pack.objectiveSafeCommand?.agentProofStep?.opensBrowserNow)}`,
    `agent_proof_step_starts_capture_now: ${yesNo(pack.objectiveSafeCommand?.agentProofStep?.startsCaptureNow)}`,
    `regular_chrome_prepared: ${yesNo(pack.regularChrome?.prepared)}`,
    `regular_chrome_backend_available: ${yesNo(pack.regularChrome?.backendAvailable)}`,
    `regular_chrome_backend_observed_available: ${yesNoUnknown(pack.regularChrome?.backendObservedAvailable)}`,
    `regular_chrome_profile_window_retry_attempted: ${yesNoUnknown(pack.regularChrome?.profileWindowRetryAttempted)}`,
    `regular_chrome_backend_failure_after_profile_window_retry: ${yesNo(pack.regularChrome?.backendFailureAfterProfileWindowRetry)}`,
    `regular_chrome_extension_reinstall_recommended: ${yesNo(pack.regularChrome?.extensionReinstallRecommended)}`,
    `regular_chrome_ready: ${yesNo(pack.regularChrome?.ready)}`,
    `regular_chrome_cdp_allowed: ${yesNo(pack.regularChrome?.cdpAllowed)}`,
    `regular_chrome_selected_profile: ${compactValue(pack.regularChrome?.selectedProfile)}`,
    `regular_chrome_next_action: ${compactValue(pack.regularChrome?.nextAction)}`,
    `regular_chrome_handoff_action: ${compactValue(pack.regularChrome?.handoffAction)}`,
    `regular_chrome_resume_action: ${compactValue(pack.regularChrome?.resumeAction)}`,
    `regular_chrome_operator_ok_required: ${yesNo(pack.regularChrome?.operatorOkRequired)}`,
    `regular_chrome_user_permission_required: ${yesNo(pack.regularChrome?.userPermissionRequired)}`,
    `regular_chrome_can_open_selected_profile_window: ${yesNo(pack.regularChrome?.canOpenSelectedProfileWindow)}`,
    `regular_chrome_command_run_only_after_user_says: ${compactValue(pack.regularChrome?.commandRunOnlyAfterUserSays)}`,
    `regular_chrome_claim_plan_ready: ${yesNo(pack.regularChrome?.claimPlanReady)}`,
    `regular_chrome_claim_plan_next_action: ${compactValue(pack.regularChrome?.claimPlanNextAction)}`,
    `regular_chrome_claim_plan_next_tool: ${compactValue(pack.regularChrome?.claimPlanNextTool)}`,
    `regular_chrome_claim_plan_snippet_keys: ${pack.regularChrome?.claimPlanSnippetKeys?.length ? pack.regularChrome.claimPlanSnippetKeys.join(',') : 'none'}`,
    `regular_chrome_backend_check_plan_next_action: ${compactValue(pack.regularChrome?.backendCheckPlanNextAction)}`,
    `regular_chrome_backend_check_plan_next_tool: ${compactValue(pack.regularChrome?.backendCheckPlanNextTool)}`,
    `regular_chrome_backend_check_plan_snippet_keys: ${pack.regularChrome?.backendCheckPlanSnippetKeys?.length ? pack.regularChrome.backendCheckPlanSnippetKeys.join(',') : 'none'}`,
    `regular_chrome_troubleshoot_next_action: ${compactValue(pack.regularChrome?.troubleshootNextAction)}`,
    `regular_chrome_saved_use_plan_available: ${yesNo(pack.regularChrome?.savedUsePlanAvailable)}`,
    `regular_chrome_saved_use_plan_used: ${yesNo(pack.regularChrome?.savedUsePlanUsed)}`,
    `regular_chrome_saved_use_plan_stale: ${yesNo(pack.regularChrome?.savedUsePlanStale)}`,
    `regular_chrome_saved_use_plan_age_seconds: ${pack.regularChrome?.savedUsePlanAgeSeconds ?? 'unknown'}`,
    `regular_chrome_saved_use_plan_max_age_seconds: ${pack.regularChrome?.savedUsePlanMaxAgeSeconds ?? 'unknown'}`,
    `regular_chrome_usable_now: ${yesNo(pack.regularChrome?.usableNow)}`,
    `regular_chrome_background_capable_now: ${yesNo(pack.regularChrome?.backgroundCapableNow)}`,
    `regular_chrome_blocked_reason: ${compactValue(pack.regularChrome?.blockedReason)}`,
    `regular_chrome_use_plan_ready: ${yesNo(pack.regularChrome?.usePlanReady)}`,
    `regular_chrome_use_plan_lane: ${compactValue(pack.regularChrome?.usePlanSelectedLane)}`,
    `regular_chrome_use_plan_backend: ${compactValue(pack.regularChrome?.usePlanBackend)}`,
    `regular_chrome_use_plan_next_action: ${compactValue(pack.regularChrome?.usePlanNextAction)}`,
    `regular_chrome_apple_events_observed: ${yesNo(pack.regularChrome?.appleEventsObserved)}`,
    `regular_chrome_apple_events_active_tab_observed: ${yesNo(pack.regularChrome?.appleEventsActiveTabObserved)}`,
    `regular_chrome_apple_events_javascript_allowed: ${yesNo(pack.regularChrome?.appleEventsJavascriptAllowed)}`,
    `regular_chrome_apple_events_usable_for_inspect: ${yesNo(pack.regularChrome?.appleEventsUsableForInspect)}`,
    `regular_chrome_apple_events_next_action: ${compactValue(pack.regularChrome?.appleEventsNextAction)}`,
    `regular_chrome_apple_events_status_file: ${compactValue(pack.regularChrome?.appleEventsStatusFile)}`,
    `regular_chrome_mcp_page_list_timeout: ${yesNo(pack.regularChrome?.mcpPageListTimeout)}`,
    `regular_chrome_mcp_use_everyday_now: ${yesNo(pack.regularChrome?.mcpUseEverydayChromeNow)}`,
    `regular_chrome_mcp_timeout_plan_next_action: ${compactValue(pack.regularChrome?.mcpTimeoutPlanNextAction)}`,
    `regular_chrome_mcp_timeout_plan_findings: ${pack.regularChrome?.mcpTimeoutPlanFindings?.length ? pack.regularChrome.mcpTimeoutPlanFindings.join(',') : 'none'}`,
    `secret_env_handoff_mode: ${compactValue(pack.secrets?.handoffMode)}`,
    `secret_headless_ready: ${yesNo(pack.secrets?.headlessReady)}`,
    `secret_headless_config_available: ${yesNo(pack.secrets?.headlessConfigAvailable)}`,
    `secret_onepassword_approval_required: ${yesNo(pack.secrets?.requiresOnePasswordApproval)}`,
    `secret_mutates_onepassword_now: ${yesNo(pack.secrets?.mutatesOnePasswordNow)}`,
    `secret_next_action: ${compactValue(pack.secrets?.nextAction)}`,
    `missing_artifact_count: ${pack.missingArtifactCount ?? 0}`,
    `accepted_external_proofs: ${pack.acceptedExternalProofCount ?? 0}`,
    `proof_gate_watch_status: ${compactValue(pack.proofGateWatchStatus)}`,
    `commands: ${pack.commandCount || 0}`,
    `secret_values_read: ${yesNo(pack.secretValuesRead)}`,
    `destructive_actions: ${yesNo(pack.destructiveActionsIncluded)}`,
    `login_handoff_auth_first_resume_opens_browser: ${yesNo(pack.loginHandoff?.authFirstResumeCommand)}`,
    `login_handoff_auth_first_resume_starts_capture: ${yesNo(pack.loginHandoff?.authFirstResumeCommand?.args?.includes('--wait-auth'))}`,
    `login_handoff_auth_first_resume_requires_operator_approval: ${yesNo(pack.loginHandoff?.authFirstResumeCommand)}`,
    `login_handoff_auth_first_resume_agent_may_run_unattended: no`,
    `auth_first_reopen_login_opens_browser: ${yesNo(pack.executionPolicy?.authFirstReopenLoginCommand)}`,
    `auth_first_reopen_login_starts_capture: no`,
    `auth_first_reopen_login_requires_operator_approval: ${yesNo(pack.executionPolicy?.authFirstReopenLoginCommand)}`,
    `auth_first_reopen_login_agent_may_run_unattended: no`,
    `handoff_resume_opens_browser: ${yesNo(pack.handoffResumeCommand?.args?.includes('--open-login'))}`,
    `handoff_resume_starts_capture: ${yesNo(pack.handoffResumeCommand?.args?.includes('--wait-auth'))}`,
    `handoff_resume_requires_operator_approval: ${yesNo(pack.handoffResumeCommand)}`,
    `handoff_resume_agent_may_run_unattended: no`
  ];
  if (pack.files?.operatorPack) lines.push(`operator_pack: ${pack.files.operatorPack}`);
  if (pack.files?.objectiveStatus) lines.push(`objective_status: ${pack.files.objectiveStatus}`);
  if (pack.files?.proofGateStatus) lines.push(`proof_gate_status: ${pack.files.proofGateStatus}`);
  if (pack.files?.proofGateWatch) lines.push(`proof_gate_watch: ${pack.files.proofGateWatch}`);
  if (pack.files?.loginHandoffStatus) lines.push(`login_handoff_status_file: ${pack.files.loginHandoffStatus}`);
  if (pack.files?.agentLoopStepStatus) lines.push(`agent_loop_step_status_file: ${pack.files.agentLoopStepStatus}`);
  if (pack.files?.backgroundProofCapturePlan) lines.push(`background_proof_capture_plan: ${pack.files.backgroundProofCapturePlan}`);
  if (pack.files?.backgroundProofCaptureStatus) lines.push(`background_proof_capture_status: ${pack.files.backgroundProofCaptureStatus}`);
  if (pack.files?.backgroundProofCaptureStart) lines.push(`background_proof_capture_start: ${pack.files.backgroundProofCaptureStart}`);
  if (pack.files?.backgroundProofMonitorStart) lines.push(`background_proof_monitor_start: ${pack.files.backgroundProofMonitorStart}`);
  if (pack.files?.objectiveProofPipeline) lines.push(`objective_proof_pipeline: ${pack.files.objectiveProofPipeline}`);
  if (pack.files?.objectiveSafeCommand) lines.push(`objective_safe_command: ${pack.files.objectiveSafeCommand}`);
  if (pack.files?.agentProofChecklist) lines.push(`agent_proof_checklist: ${pack.files.agentProofChecklist}`);
  if (pack.files?.agentProofCloseout) lines.push(`agent_proof_closeout: ${pack.files.agentProofCloseout}`);
  if (pack.files?.browserRoute) lines.push(`browser_route: ${pack.files.browserRoute}`);
  if (pack.files?.backendMatrix) lines.push(`backend_matrix: ${pack.files.backendMatrix}`);
  if (pack.files?.regularChromeUse) lines.push(`regular_chrome_use: ${pack.files.regularChromeUse}`);
  if (pack.files?.chromeExtensionStatus) lines.push(`chrome_extension_status: ${pack.files.chromeExtensionStatus}`);
  if (pack.files?.chromeExtensionHandoff) lines.push(`chrome_extension_handoff: ${pack.files.chromeExtensionHandoff}`);
  if (pack.files?.chromeExtensionResume) lines.push(`chrome_extension_resume: ${pack.files.chromeExtensionResume}`);
  if (pack.files?.chromeExtensionTroubleshoot) lines.push(`chrome_extension_troubleshoot: ${pack.files.chromeExtensionTroubleshoot}`);
  if (pack.files?.chromeExtensionBackendCheckPlan) lines.push(`chrome_extension_backend_check_plan: ${pack.files.chromeExtensionBackendCheckPlan}`);
  if (pack.files?.chromeExtensionClaimPlan) lines.push(`chrome_extension_claim_plan: ${pack.files.chromeExtensionClaimPlan}`);
  if (pack.files?.chromeMcpTimeoutPlan) lines.push(`chrome_mcp_timeout_plan: ${pack.files.chromeMcpTimeoutPlan}`);
  if (pack.files?.secretEnvHandoff) lines.push(`secret_env_handoff: ${pack.files.secretEnvHandoff}`);
  if (pack.files?.objectiveHandoff) lines.push(`objective_handoff: ${pack.files.objectiveHandoff}`);
  if (pack.browserRoute?.command?.shell) lines.push(`browser_route_command: ${pack.browserRoute.command.shell}`);
  if (pack.browserRoute?.approvalCommand?.shell) lines.push(`browser_route_approval_command: ${pack.browserRoute.approvalCommand.shell}`);
  if (pack.backendMatrix?.refreshCommand?.shell) lines.push(`backend_matrix_refresh_command: ${pack.backendMatrix.refreshCommand.shell}`);
  if (pack.backendMatrix?.statusCommand?.shell) lines.push(`backend_matrix_status_command: ${pack.backendMatrix.statusCommand.shell}`);
  if (pack.backendMatrix?.searchRouteCommand?.shell) lines.push(`backend_matrix_search_route_command: ${pack.backendMatrix.searchRouteCommand.shell}`);
  if (pack.backendMatrix?.analyzeRouteCommand?.shell) lines.push(`backend_matrix_analyze_route_command: ${pack.backendMatrix.analyzeRouteCommand.shell}`);
  if (pack.backendMatrix?.scrapeRouteCommand?.shell) lines.push(`backend_matrix_scrape_route_command: ${pack.backendMatrix.scrapeRouteCommand.shell}`);
  if (pack.backendMatrix?.operateRouteCommand?.shell) lines.push(`backend_matrix_operate_route_command: ${pack.backendMatrix.operateRouteCommand.shell}`);
  if (pack.backendMatrix?.existingTabRouteCommand?.shell) lines.push(`backend_matrix_existing_tab_route_command: ${pack.backendMatrix.existingTabRouteCommand.shell}`);
  if (pack.backendMatrix?.authenticatedRouteCommand?.shell) lines.push(`backend_matrix_authenticated_route_command: ${pack.backendMatrix.authenticatedRouteCommand.shell}`);
  if (pack.backendMatrix?.publicCrawlRouteCommand?.shell) lines.push(`backend_matrix_public_crawl_route_command: ${pack.backendMatrix.publicCrawlRouteCommand.shell}`);
  if (pack.backendMatrix?.compatibilityRouteCommand?.shell) lines.push(`backend_matrix_compatibility_route_command: ${pack.backendMatrix.compatibilityRouteCommand.shell}`);
  if (pack.backendMatrix?.searchWorkflowCommand?.shell) lines.push(`backend_matrix_search_workflow_command: ${pack.backendMatrix.searchWorkflowCommand.shell}`);
  if (pack.backendMatrix?.analyzeWorkflowCommand?.shell) lines.push(`backend_matrix_analyze_workflow_command: ${pack.backendMatrix.analyzeWorkflowCommand.shell}`);
  if (pack.backendMatrix?.scrapeWorkflowCommand?.shell) lines.push(`backend_matrix_scrape_workflow_command: ${pack.backendMatrix.scrapeWorkflowCommand.shell}`);
  if (pack.backendMatrix?.operateWorkflowCommand?.shell) lines.push(`backend_matrix_operate_workflow_command: ${pack.backendMatrix.operateWorkflowCommand.shell}`);
  if (pack.backendMatrix?.searchSelectorCommand?.shell) lines.push(`backend_matrix_search_selector_command: ${pack.backendMatrix.searchSelectorCommand.shell}`);
  if (pack.backendMatrix?.analyzeSelectorCommand?.shell) lines.push(`backend_matrix_analyze_selector_command: ${pack.backendMatrix.analyzeSelectorCommand.shell}`);
  if (pack.backendMatrix?.scrapeSelectorCommand?.shell) lines.push(`backend_matrix_scrape_selector_command: ${pack.backendMatrix.scrapeSelectorCommand.shell}`);
  if (pack.backendMatrix?.operateSelectorCommand?.shell) lines.push(`backend_matrix_operate_selector_command: ${pack.backendMatrix.operateSelectorCommand.shell}`);
  if (pack.backendMatrix?.existingTabSelectorCommand?.shell) lines.push(`backend_matrix_existing_tab_selector_command: ${pack.backendMatrix.existingTabSelectorCommand.shell}`);
  if (pack.backendMatrix?.publicCrawlSelectorCommand?.shell) lines.push(`backend_matrix_public_crawl_selector_command: ${pack.backendMatrix.publicCrawlSelectorCommand.shell}`);
  if (pack.proofPipeline?.command?.shell) lines.push(`proof_pipeline_command: ${pack.proofPipeline.command.shell}`);
  if (pack.proofPipeline?.monitorAuthCommand?.shell) lines.push(`proof_pipeline_monitor_auth_command: ${pack.proofPipeline.monitorAuthCommand.shell}`);
  if (pack.proofPipeline?.openLoginCommand?.shell) lines.push(`proof_pipeline_open_login_command: ${pack.proofPipeline.openLoginCommand.shell}`);
  if (pack.proofPipeline?.reopenLoginCommand?.shell) lines.push(`proof_pipeline_reopen_login_command: ${pack.proofPipeline.reopenLoginCommand.shell}`);
  if (pack.proofPipeline?.waitCaptureCommand?.shell) lines.push(`proof_pipeline_wait_capture_command: ${pack.proofPipeline.waitCaptureCommand.shell}`);
  if (pack.proofPipeline?.waitCaptureNoOpenCommand?.shell) lines.push(`proof_pipeline_wait_capture_no_open_command: ${pack.proofPipeline.waitCaptureNoOpenCommand.shell}`);
  if (pack.targetApproval?.statusCommand?.shell) lines.push(`target_approval_status_command: ${pack.targetApproval.statusCommand.shell}`);
  if (pack.targetApproval?.preflightCommand?.shell) lines.push(`target_approval_preflight_command: ${pack.targetApproval.preflightCommand.shell}`);
  if (pack.targetApproval?.resumePreflightCommand?.shell) lines.push(`target_approval_resume_preflight_command: ${pack.targetApproval.resumePreflightCommand.shell}`);
  if (pack.targetApproval?.resumeProofPlanCommand?.shell) lines.push(`target_approval_resume_proof_plan_command: ${pack.targetApproval.resumeProofPlanCommand.shell}`);
  if (pack.targetApproval?.resumeRunCommand?.shell) lines.push(`target_approval_resume_run_command: ${pack.targetApproval.resumeRunCommand.shell}`);
  if (pack.targetApproval?.nextCommand?.shell) lines.push(`target_approval_next_command: ${pack.targetApproval.nextCommand.shell}`);
  if (pack.backgroundProofCapture?.statusCommand?.shell) lines.push(`background_proof_status_command: ${pack.backgroundProofCapture.statusCommand.shell}`);
  if (pack.backgroundProofCapture?.noOpenWaitCaptureCommand?.shell) lines.push(`background_proof_no_open_wait_capture_command: ${pack.backgroundProofCapture.noOpenWaitCaptureCommand.shell}`);
  if (pack.backgroundProofCapture?.backgroundNoOpenWaitCaptureCommand?.shell) lines.push(`background_proof_no_open_wait_capture_background_command: ${pack.backgroundProofCapture.backgroundNoOpenWaitCaptureCommand.shell}`);
  if (pack.backgroundProofCapture?.captureStartCommand?.shell) lines.push(`background_proof_capture_start_command: ${pack.backgroundProofCapture.captureStartCommand.shell}`);
  if (pack.backgroundProofCapture?.monitorStartCommand?.shell) lines.push(`background_proof_monitor_start_command: ${pack.backgroundProofCapture.monitorStartCommand.shell}`);
  if (pack.objectiveSafeCommand?.agentProofStep?.planCommand?.shell) lines.push(`agent_proof_step_plan_command: ${pack.objectiveSafeCommand.agentProofStep.planCommand.shell}`);
  if (pack.objectiveSafeCommand?.agentProofStep?.runCommand?.shell) lines.push(`agent_proof_step_run_command: ${pack.objectiveSafeCommand.agentProofStep.runCommand.shell}`);
  if (pack.objectiveSafeCommand?.agentProofStep?.startCommand?.shell) lines.push(`agent_proof_step_start_command: ${pack.objectiveSafeCommand.agentProofStep.startCommand.shell}`);
  if (pack.objectiveSafeCommand?.agentProofStep?.statusCommand?.shell) lines.push(`agent_proof_step_status_command: ${pack.objectiveSafeCommand.agentProofStep.statusCommand.shell}`);
  if (pack.loginHandoff?.safeMonitorCommand?.shell) lines.push(`login_handoff_safe_monitor_command: ${pack.loginHandoff.safeMonitorCommand.shell}`);
  if (pack.loginHandoff?.authFirstResumeCommand?.shell) lines.push(`login_handoff_auth_first_resume_command: ${pack.loginHandoff.authFirstResumeCommand.shell}`);
  if (pack.loginHandoff?.statusCommand?.shell) lines.push(`login_handoff_status_command: ${pack.loginHandoff.statusCommand.shell}`);
  if (pack.handoffResumeStatus?.recommendedCommand?.shell) lines.push(`handoff_resume_recommended_command: ${pack.handoffResumeStatus.recommendedCommand.shell}`);
  if (pack.handoffResumeStatus?.capturePlanCommand?.shell) lines.push(`handoff_resume_capture_plan_command: ${pack.handoffResumeStatus.capturePlanCommand.shell}`);
  if (pack.regularChrome?.mcpTimeoutPlanCommand?.shell) lines.push(`regular_chrome_mcp_timeout_plan_command: ${pack.regularChrome.mcpTimeoutPlanCommand.shell}`);
  if (pack.regularChrome?.savedUsePlanRefreshCommand?.shell) lines.push(`regular_chrome_saved_use_plan_refresh_command: ${pack.regularChrome.savedUsePlanRefreshCommand.shell}`);
  if (pack.regularChrome?.usePlanCommand?.shell) lines.push(`regular_chrome_use_plan_command: ${pack.regularChrome.usePlanCommand.shell}`);
  if (pack.regularChrome?.usePlanApprovalCommand?.shell) lines.push(`regular_chrome_use_plan_approval_command: ${pack.regularChrome.usePlanApprovalCommand.shell}`);
  if (pack.regularChrome?.backendCheckPlanCommand?.shell) lines.push(`regular_chrome_backend_check_plan_command: ${pack.regularChrome.backendCheckPlanCommand.shell}`);
  if (pack.regularChrome?.backendCheckPlanRecordFailureCommand?.shell) lines.push(`regular_chrome_backend_check_record_failure_command: ${pack.regularChrome.backendCheckPlanRecordFailureCommand.shell}`);
  if (pack.regularChrome?.backendCheckPlanRecordSuccessCommand?.shell) lines.push(`regular_chrome_backend_check_record_success_command: ${pack.regularChrome.backendCheckPlanRecordSuccessCommand.shell}`);
  if (pack.regularChrome?.troubleshootCommand?.shell) lines.push(`regular_chrome_troubleshoot_command: ${pack.regularChrome.troubleshootCommand.shell}`);
  if (pack.regularChrome?.claimPlanCommand?.shell) lines.push(`regular_chrome_claim_plan_command: ${pack.regularChrome.claimPlanCommand.shell}`);
  if (pack.regularChrome?.backendObservedLastError) lines.push(`regular_chrome_backend_last_error: ${compactValue(pack.regularChrome.backendObservedLastError)}`);
  if (pack.regularChrome?.resumeCommand?.shell) lines.push(`regular_chrome_resume_command: ${pack.regularChrome.resumeCommand.shell}`);
  if (pack.regularChrome?.approvalCommand?.shell) lines.push(`regular_chrome_approval_command: ${pack.regularChrome.approvalCommand.shell}`);
  if (pack.regularChrome?.appleEventsOutlineCommand?.shell) lines.push(`regular_chrome_apple_events_outline_command: ${pack.regularChrome.appleEventsOutlineCommand.shell}`);
  if (pack.regularChrome?.appleEventsOutlineApprovalCommand?.shell) lines.push(`regular_chrome_apple_events_outline_approval_command: ${pack.regularChrome.appleEventsOutlineApprovalCommand.shell}`);
  if (pack.executionPolicy?.agentSafeCommand?.shell) lines.push(`agent_safe_command: ${pack.executionPolicy.agentSafeCommand.shell}`);
  if (pack.agentNext?.command?.shell) lines.push(`agent_next_command: ${pack.agentNext.command.shell}`);
  if (pack.agentNext?.agentStatusCommand?.shell) lines.push(`agent_next_status_command: ${pack.agentNext.agentStatusCommand.shell}`);
  if (pack.agentNext?.agentStepPlanCommand?.shell) lines.push(`agent_next_step_plan_command: ${pack.agentNext.agentStepPlanCommand.shell}`);
  if (pack.agentNext?.agentStepStatusCommand?.shell) lines.push(`agent_next_step_status_command: ${pack.agentNext.agentStepStatusCommand.shell}`);
  if (pack.agentNext?.objectiveCompletionStrictCommand?.shell) lines.push(`agent_next_objective_completion_strict_command: ${pack.agentNext.objectiveCompletionStrictCommand.shell}`);
  if (pack.agentNext?.agentPollCommand?.shell) lines.push(`agent_next_poll_command: ${pack.agentNext.agentPollCommand.shell}`);
  if (pack.agentNext?.agentRunCommand?.shell) lines.push(`agent_next_run_command: ${pack.agentNext.agentRunCommand.shell}`);
  if (pack.agentNext?.agentPreflightCommand?.shell) lines.push(`agent_next_preflight_command: ${pack.agentNext.agentPreflightCommand.shell}`);
  if (pack.agentNext?.operatorApprovalPreflightCommand?.shell) lines.push(`agent_next_operator_approval_preflight_command: ${pack.agentNext.operatorApprovalPreflightCommand.shell}`);
  if (pack.agentNext?.agentProofPlanCommand?.shell) lines.push(`agent_next_proof_plan_command: ${pack.agentNext.agentProofPlanCommand.shell}`);
  if (pack.agentNext?.operatorApprovalProofPlanCommand?.shell) lines.push(`agent_next_operator_approval_proof_plan_command: ${pack.agentNext.operatorApprovalProofPlanCommand.shell}`);
  lines.push(`agent_next_provider_doctor_command: ${pack.agentNext?.providerDoctorCommand?.shell || command(['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact'])}`);
  if (pack.agentNext?.operatorApprovalPlanCommand?.shell) lines.push(`agent_next_operator_approval_plan_command: ${pack.agentNext.operatorApprovalPlanCommand.shell}`);
  if (pack.agentNext?.operatorApprovalCommand?.shell) lines.push(`agent_next_operator_approval_command: ${pack.agentNext.operatorApprovalCommand.shell}`);
  if (pack.agentProofChecklist?.command?.shell) lines.push(`agent_proof_checklist_command: ${pack.agentProofChecklist.command.shell}`);
  if (pack.agentProofChecklist?.writeCommand?.shell) lines.push(`agent_proof_checklist_write_command: ${pack.agentProofChecklist.writeCommand.shell}`);
  if (pack.agentProofChecklist?.statusCommand?.shell) lines.push(`agent_proof_checklist_status_command: ${pack.agentProofChecklist.statusCommand.shell}`);
  if (pack.agentProofChecklist?.operatorResumeCommand?.shell) lines.push(`agent_proof_checklist_operator_resume_command: ${pack.agentProofChecklist.operatorResumeCommand.shell}`);
  if (pack.agentProofCloseout?.command?.shell) lines.push(`agent_proof_closeout_command: ${pack.agentProofCloseout.command.shell}`);
  if (pack.agentProofCloseout?.writeCommand?.shell) lines.push(`agent_proof_closeout_write_command: ${pack.agentProofCloseout.writeCommand.shell}`);
  if (pack.agentProofCloseout?.statusCommand?.shell) lines.push(`agent_proof_closeout_status_command: ${pack.agentProofCloseout.statusCommand.shell}`);
  if (pack.agentProofCloseout?.checklistRefreshCommand?.shell) lines.push(`agent_proof_closeout_checklist_refresh_command: ${pack.agentProofCloseout.checklistRefreshCommand.shell}`);
  if (pack.agentProofCloseout?.checklistStatusCommand?.shell) lines.push(`agent_proof_closeout_checklist_status_command: ${pack.agentProofCloseout.checklistStatusCommand.shell}`);
  lines.push(`agent_proof_closeout_agent_safe_next_command_id: ${compactValue(pack.agentProofCloseout?.agentSafeNextCommandId)}`);
  lines.push(`agent_proof_closeout_agent_safe_next_may_run_unattended: ${yesNo(pack.agentProofCloseout?.agentSafeNextMayRunUnattended)}`);
  lines.push(`agent_proof_closeout_agent_safe_next_opens_browser: ${yesNo(pack.agentProofCloseout?.agentSafeNextOpensBrowser)}`);
  lines.push(`agent_proof_closeout_agent_safe_next_starts_capture: ${yesNo(pack.agentProofCloseout?.agentSafeNextStartsCapture)}`);
  lines.push(`agent_proof_closeout_agent_safe_next_reads_browser_storage: ${yesNo(pack.agentProofCloseout?.agentSafeNextReadsBrowserStorage)}`);
  lines.push(`agent_proof_closeout_agent_safe_next_returns_page_content: ${yesNo(pack.agentProofCloseout?.agentSafeNextReturnsPageContent)}`);
  lines.push(`agent_proof_closeout_target_approval_preflight_may_run_unattended: ${yesNo(pack.agentProofCloseout?.targetApprovalPreflightMayRunUnattended)}`);
  lines.push(`agent_proof_closeout_target_approval_preflight_opens_browser: ${yesNo(pack.agentProofCloseout?.targetApprovalPreflightOpensBrowser)}`);
  lines.push(`agent_proof_closeout_target_approval_preflight_starts_capture: ${yesNo(pack.agentProofCloseout?.targetApprovalPreflightStartsCapture)}`);
  lines.push(`agent_proof_closeout_target_proof_plan_may_run_unattended: ${yesNo(pack.agentProofCloseout?.targetProofPlanMayRunUnattended)}`);
  lines.push(`agent_proof_closeout_target_proof_plan_opens_browser: ${yesNo(pack.agentProofCloseout?.targetProofPlanOpensBrowser)}`);
  lines.push(`agent_proof_closeout_target_proof_plan_starts_capture: ${yesNo(pack.agentProofCloseout?.targetProofPlanStartsCapture)}`);
  if (pack.agentProofCloseout?.agentSafeNextCommand?.shell) lines.push(`agent_proof_closeout_agent_safe_next_command: ${pack.agentProofCloseout.agentSafeNextCommand.shell}`);
  if (pack.agentProofCloseout?.targetApprovalPreflightCommand?.shell) lines.push(`agent_proof_closeout_target_approval_preflight_command: ${pack.agentProofCloseout.targetApprovalPreflightCommand.shell}`);
  if (pack.agentProofCloseout?.targetProofPlanCommand?.shell) lines.push(`agent_proof_closeout_target_proof_plan_command: ${pack.agentProofCloseout.targetProofPlanCommand.shell}`);
  if (pack.agentProofCloseout?.providerDoctorStatusCommand?.shell) lines.push(`agent_proof_closeout_provider_doctor_status_command: ${pack.agentProofCloseout.providerDoctorStatusCommand.shell}`);
  if (pack.agentProofCloseout?.operatorResumeCommand?.shell) lines.push(`agent_proof_closeout_operator_resume_command: ${pack.agentProofCloseout.operatorResumeCommand.shell}`);
  if (pack.agentProofCloseout?.completionProofBundleCommand?.shell) lines.push(`agent_proof_closeout_completion_proof_bundle_command: ${pack.agentProofCloseout.completionProofBundleCommand.shell}`);
  if (pack.agentProofCloseout?.completionProofBundleWithAuditCommand?.shell) lines.push(`agent_proof_closeout_completion_proof_bundle_with_audit_command: ${pack.agentProofCloseout.completionProofBundleWithAuditCommand.shell}`);
  if (pack.agentProofCloseout?.completionProofBundleStatusCommand?.shell) lines.push(`agent_proof_closeout_completion_proof_bundle_status_command: ${pack.agentProofCloseout.completionProofBundleStatusCommand.shell}`);
  if (pack.agentProofCloseout?.compactCommandAuditAllCommand?.shell) lines.push(`agent_proof_closeout_compact_command_audit_all_command: ${pack.agentProofCloseout.compactCommandAuditAllCommand.shell}`);
  if (pack.agentProofCloseout?.objectiveCompletionCommand?.shell) lines.push(`agent_proof_closeout_objective_completion_command: ${pack.agentProofCloseout.objectiveCompletionCommand.shell}`);
  if (pack.agentProofCloseout?.objectiveCompletionStrictCommand?.shell) lines.push(`agent_proof_closeout_objective_completion_strict_command: ${pack.agentProofCloseout.objectiveCompletionStrictCommand.shell}`);
  if (pack.executionPolicy?.authFirstReopenLoginCommand?.shell) lines.push(`auth_first_reopen_login_command: ${pack.executionPolicy.authFirstReopenLoginCommand.shell}`);
  if (pack.executionPolicy?.agentLoopStepPlanCommand?.shell) lines.push(`agent_loop_step_plan_command: ${pack.executionPolicy.agentLoopStepPlanCommand.shell}`);
  if (pack.executionPolicy?.agentLoopStepRunCommand?.shell) lines.push(`agent_loop_step_run_command: ${pack.executionPolicy.agentLoopStepRunCommand.shell}`);
  if (pack.executionPolicy?.agentLoopStepStatusCommand?.shell) lines.push(`agent_loop_step_status_command: ${pack.executionPolicy.agentLoopStepStatusCommand.shell}`);
  if (pack.agentLoopStepStatus?.recommendedCommand?.shell) lines.push(`agent_loop_step_recommended_command: ${pack.agentLoopStepStatus.recommendedCommand.shell}`);
  if (pack.agentLoopStepStatus?.refreshCommand?.shell) lines.push(`agent_loop_step_refresh_command: ${pack.agentLoopStepStatus.refreshCommand.shell}`);
  if (pack.agentLoopStepStatus?.runCommand?.shell) lines.push(`agent_loop_step_saved_run_command: ${pack.agentLoopStepStatus.runCommand.shell}`);
  if (pack.authWatchCommand?.shell) lines.push(`auth_watch_command: ${pack.authWatchCommand.shell}`);
  if (pack.handoffResumeCommand?.shell) lines.push(`handoff_resume_command: ${pack.handoffResumeCommand.shell}`);
  if (pack.primaryCommand?.agentMayRunUnattended && pack.nextAction?.command?.shell) {
    lines.push(`command: ${pack.nextAction.command.shell}`);
  }
  if (pack.summaries?.objectiveHandoff?.commands) {
    const watch = pack.summaries.objectiveHandoff.commands.find((item) => item.id === 'proof-gate-watch');
    if (watch?.shell) lines.push(`proof_gate_watch_command: ${watch.shell}`);
  }
  return `${lines.join('\n')}\n`;
}

export function formatOperatorPackStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `input_path: ${compactValue(status.inputPath)}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `saved_complete: ${yesNo(status.savedComplete)}`,
    `saved_status: ${compactValue(status.savedStatus)}`,
    `saved_target: ${compactValue(status.savedTarget)}`,
    `saved_operator_input: ${yesNo(status.savedOperatorInput)}`,
    `readiness_remaining_count: ${status.readinessRemainingCount ?? 0}`,
    `readiness_remaining: ${status.readinessRemaining?.length ? status.readinessRemaining.join(',') : 'none'}`,
    `agent_proof_checklist_complete: ${yesNo(status.agentProofChecklistComplete)}`,
    `agent_proof_closeout_complete: ${yesNo(status.agentProofCloseoutComplete)}`,
    `agent_safe_next_command_id: ${compactValue(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `provider_default_backend: ${compactValue(status.providerDefaultBackend)}`,
    `provider_default_agent_interface: ${compactValue(status.providerDefaultAgentInterface)}`,
    `provider_public_benchmark_proof_exists: ${yesNo(status.providerPublicBenchmarkProofExists)}`,
    `provider_public_benchmark_proof_ok: ${yesNo(status.providerPublicBenchmarkProofOk)}`,
    `provider_public_benchmark_proof_path: ${compactValue(status.providerPublicBenchmarkProofPath)}`,
    `provider_public_benchmark_fastest_measured_provider: ${compactValue(status.providerPublicBenchmarkFastestMeasuredProvider)}`,
    `provider_public_benchmark_agent_may_run_unattended: ${yesNo(status.providerPublicBenchmarkAgentMayRunUnattended)}`,
    `provider_public_benchmark_starts_browser: ${yesNo(status.providerPublicBenchmarkStartsBrowser)}`,
    `provider_public_benchmark_reads_browser_storage: ${yesNo(status.providerPublicBenchmarkReadsBrowserStorage)}`,
    `provider_public_benchmark_returns_page_content: ${yesNo(status.providerPublicBenchmarkReturnsPageContent)}`
  ];
  if (status.agentSafeNextCommand?.shell) lines.push(`agent_safe_next_command: ${status.agentSafeNextCommand.shell}`);
  if (status.refreshCommand?.shell) lines.push(`refresh_command: ${status.refreshCommand.shell}`);
  if (status.statusCommand?.shell) lines.push(`status_command: ${status.statusCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatOperatorPackMarkdown(pack) {
  const lines = [
    '# Secure Browser Agent Operator Pack',
    '',
    `Generated: ${pack.generatedAt}`,
    `Root: ${pack.rootDir}`,
    `Complete: ${pack.complete ? 'yes' : 'no'}`,
    `Status: ${pack.status}`,
    `Safe mode: ${pack.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${pack.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${pack.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Current Gate',
    '',
    `- Target: ${pack.target || 'none'}`,
    `- Target directory: ${pack.targetDir || 'none'}`,
    `- Operator input: ${pack.operatorInput ? 'yes' : 'no'}`,
    `- Human action: ${pack.operatorGuidance?.humanAction || 'none'}`,
    `- Automation blocker: ${pack.operatorGuidance?.automationBlocker || 'none'}`,
    `- Capture blocked: ${pack.operatorGuidance?.captureBlocked ? 'yes' : 'no'}`,
    `- Auth-check OK: ${pack.authCheckOk ? 'yes' : 'no'}`,
    `- Login-like: ${pack.loginLike ? 'yes' : 'no'}`,
    `- Auth state: ${pack.authState || 'unknown'}`,
    `- Auth usable for capture: ${pack.authUsable ? 'yes' : 'no'}`,
    `- Profile auth metadata only: ${pack.profileAuthMetadataOnly ? 'yes' : 'no'}`,
    `- Handoff auth-check port: ${pack.handoffAuthCheckPort || 'none'}`,
    `- Handoff auth-check port reachable: ${yesNoUnknown(pack.handoffAuthCheckPortReachable)}`,
    `- Agent safe action: ${pack.executionPolicy?.agentSafeAction || 'none'}`,
    `- Agent safe command ID: ${pack.executionPolicy?.agentSafeCommandId || 'none'}`,
    `- Agent safe command monitor-only: ${pack.executionPolicy?.agentSafeCommandMonitorOnly ? 'yes' : 'no'}`,
    `- Agent safe command may open browser: ${pack.executionPolicy?.agentSafeCommandMayOpenBrowser ? 'yes' : 'no'}`,
    `- Agent safe command starts capture: ${pack.executionPolicy?.agentSafeCommandStartsCapture ? 'yes' : 'no'}`,
    `- Agent safe command blocked reason: ${pack.executionPolicy?.agentSafeCommandBlockedReason || 'none'}`,
    `- Monitor-only command available: ${pack.executionPolicy?.monitorOnlyCommandAvailable ? 'yes' : 'no'}`,
    `- Auth-first resume available: ${pack.executionPolicy?.authFirstResumeAvailable ? 'yes' : 'no'}`,
    `- Proof capture allowed now: ${pack.executionPolicy?.proofCaptureAllowedNow ? 'yes' : 'no'}`,
    `- Proof capture blocked until auth: ${pack.executionPolicy?.proofCaptureBlockedUntilAuth ? 'yes' : 'no'}`,
    `- Auth-first resume may open browser: ${pack.executionPolicy?.authFirstResumeMayOpenBrowser ? 'yes' : 'no'}`,
    `- Auth-first resume starts capture after auth only: ${pack.executionPolicy?.authFirstResumeStartsCaptureAfterAuthOnly ? 'yes' : 'no'}`,
    `- Operator must login: ${pack.executionPolicy?.operatorMustLogin ? 'yes' : 'no'}`,
    `- Next artifact action: ${pack.proofGateArtifactAction?.nextArtifactAction || 'none'}`,
    `- Next artifact blocker: ${pack.proofGateArtifactAction?.nextArtifactBlocker || 'none'}`,
    `- Artifact command covers: ${pack.proofGateArtifactAction?.artifactCommandCovers?.length ? pack.proofGateArtifactAction.artifactCommandCovers.join(', ') : 'none'}`,
    `- Missing artifact count: ${pack.missingArtifactCount ?? 0}`,
    `- Accepted external proofs: ${pack.acceptedExternalProofCount ?? 0}`,
    '',
    '## Login Handoff',
    '',
    `- Status: ${pack.loginHandoff?.status || 'none'}`,
    `- Next action: ${pack.loginHandoff?.nextAction || 'none'}`,
    `- Login required: ${pack.loginHandoff?.loginRequired ? 'yes' : 'no'}`,
    `- Auth usable: ${pack.loginHandoff?.authUsable ? 'yes' : 'no'}`,
    `- Safe monitor available: ${pack.loginHandoff?.safeMonitorAvailable ? 'yes' : 'no'}`,
    `- Safe monitor only: ${pack.loginHandoff?.safeMonitorOnly ? 'yes' : 'no'}`,
    `- Dedicated browser port: ${pack.loginHandoff?.dedicatedBrowserPort || 'none'}`,
    `- Dedicated browser reachable: ${yesNoUnknown(pack.loginHandoff?.dedicatedBrowserReachable)}`,
    `- Opens browser now: ${pack.loginHandoff?.opensBrowserNow ? 'yes' : 'no'}`,
    `- Starts capture now: ${pack.loginHandoff?.startsCaptureNow ? 'yes' : 'no'}`,
    `- Capture allowed now: ${pack.loginHandoff?.captureAllowedNow ? 'yes' : 'no'}`,
    `- Proof capture blocked until auth: ${pack.loginHandoff?.proofCaptureBlockedUntilAuth ? 'yes' : 'no'}`,
    '',
    '## Browser Route',
    '',
    `- Task: ${pack.browserRoute?.task || 'none'}`,
    `- Lane: ${pack.browserRoute?.selectedLane || 'none'}`,
    `- Backend: ${pack.browserRoute?.backend || 'none'}`,
    `- Profile mode: ${pack.browserRoute?.profileMode || 'none'}`,
    `- Operator input: ${pack.browserRoute?.operatorInput ? 'yes' : 'no'}`,
    `- User permission required: ${pack.browserRoute?.userPermissionRequired ? 'yes' : 'no'}`,
    `- Can run in background: ${pack.browserRoute?.canRunInBackground ? 'yes' : 'no'}`,
    `- Capture blocked: ${pack.browserRoute?.captureBlocked ? 'yes' : 'no'}`,
    `- Command opens browser: ${pack.browserRoute?.commandOpensBrowser ? 'yes' : 'no'}`,
    `- Approval command opens browser: ${pack.browserRoute?.approvalCommandOpensBrowser ? 'yes' : 'no'}`,
    `- Command run only after user says: ${pack.browserRoute?.commandRunOnlyAfterUserSays || 'none'}`,
    `- Everyday Chrome CDP allowed: ${pack.browserRoute?.everydayChromeCdpAllowed ? 'yes' : 'no'}`,
    '',
    '## Backend Matrix',
    '',
    `- Status: ${pack.backendMatrix?.status || 'none'}`,
    `- Default backend: ${pack.backendMatrix?.defaultBackend || 'none'}`,
    `- Default agent interface: ${pack.backendMatrix?.defaultAgentInterface || 'none'}`,
    `- Search backend: ${pack.backendMatrix?.searchBackend || 'none'}`,
    `- Analyze backend: ${pack.backendMatrix?.analyzeBackend || 'none'}`,
    `- Scrape backend: ${pack.backendMatrix?.scrapeBackend || 'none'}`,
    `- Operate backend: ${pack.backendMatrix?.operateBackend || 'none'}`,
    `- Authenticated backend: ${pack.backendMatrix?.authenticatedBackend || 'none'}`,
    `- Existing-tab backend: ${pack.backendMatrix?.existingTabBackend || 'none'}`,
    `- Public-crawl backend: ${pack.backendMatrix?.publicCrawlBackend || 'none'}`,
    `- Compatibility backend: ${pack.backendMatrix?.compatibilityBackend || 'none'}`,
    `- Regular Chrome status: ${pack.backendMatrix?.regularChromeStatus || 'none'}`,
    `- Chrome MCP route ready: ${pack.backendMatrix?.chromeMcpRouteReady ? 'yes' : 'no'}`,
    `- Chrome MCP list_pages timed out: ${pack.backendMatrix?.chromeMcpListPagesTimedOut ? 'yes' : 'no'}`,
    `- Backend count: ${pack.backendMatrix?.backendCount ?? 0}`,
    `- Saved secret values read: ${pack.backendMatrix?.savedSecretValuesRead ? 'yes' : 'no'}`,
    `- Saved destructive actions: ${pack.backendMatrix?.savedDestructiveActions ? 'yes' : 'no'}`,
    '',
    '## Proof Pipeline',
    '',
    `- Status: ${pack.proofPipeline?.status || 'none'}`,
    `- Recommended now: ${pack.proofPipeline?.recommendedNow || 'none'}`,
    `- Proof capture allowed now: ${pack.proofPipeline?.proofCaptureAllowedNow ? 'yes' : 'no'}`,
    `- Wait-auth capture available: ${pack.proofPipeline?.waitAuthThenCaptureAvailable ? 'yes' : 'no'}`,
    `- Monitor auth available: ${pack.proofPipeline?.monitorAuthAvailable ? 'yes' : 'no'}`,
    `- Monitor auth opens browser: ${pack.proofPipeline?.monitorAuthOpensBrowser ? 'yes' : 'no'}`,
    `- Monitor auth starts capture: ${pack.proofPipeline?.monitorAuthStartsCapture ? 'yes' : 'no'}`,
    `- Open login available: ${pack.proofPipeline?.openLoginAvailable ? 'yes' : 'no'}`,
    `- Reopen login available: ${pack.proofPipeline?.reopenLoginAvailable ? 'yes' : 'no'}`,
    `- Reopen login starts capture: ${pack.proofPipeline?.reopenLoginStartsCapture ? 'yes' : 'no'}`,
    `- Wait-capture opens browser: ${pack.proofPipeline?.waitCaptureOpensBrowser ? 'yes' : 'no'}`,
    `- Wait-capture waits for auth: ${pack.proofPipeline?.waitCaptureWaitsForAuth ? 'yes' : 'no'}`,
    `- Wait-capture starts capture: ${pack.proofPipeline?.waitCaptureStartsCapture ? 'yes' : 'no'}`,
    `- Next artifact action: ${pack.proofPipeline?.nextArtifactAction || 'none'}`,
    `- Next artifact blocker: ${pack.proofPipeline?.nextArtifactBlocker || 'none'}`,
    `- Output path: ${pack.proofPipeline?.outputPath || 'none'}`,
    '',
    '## Run Gate',
    '',
    `- OK for agent loops: ${pack.runGate?.okForAgentLoops ? 'yes' : 'no'}`,
    `- Unguarded agent dangerous: ${pack.runGate?.unguardedAgentDangerous ?? 0}`,
    `- Agent-safe unattended: ${pack.runGate?.agentSafeUnattended ?? 0}`,
    `- Operator gated: ${pack.runGate?.operatorGated ?? 0}`,
    `- Exact operator OK: ${pack.runGate?.exactOperatorOk ?? 0}`,
    `- Direct operator: ${pack.runGate?.directOperator ?? 0}`,
    `- Next action: ${pack.runGate?.nextAction || 'none'}`,
    '',
    '## Background Proof Capture',
    '',
    `- Plan status: ${pack.backgroundProofCapture?.planStatus || 'none'}`,
    `- Capture blocked: ${pack.backgroundProofCapture?.captureBlocked ? 'yes' : 'no'}`,
    `- Monitor available: ${pack.backgroundProofCapture?.backgroundMonitorAvailable ? 'yes' : 'no'}`,
    `- Capture available: ${pack.backgroundProofCapture?.backgroundCaptureAvailable ? 'yes' : 'no'}`,
    `- Monitor running: ${pack.backgroundProofCapture?.monitorRunning ? 'yes' : 'no'}`,
    `- Capture running: ${pack.backgroundProofCapture?.captureRunning ? 'yes' : 'no'}`,
    `- Auth watch status: ${pack.backgroundProofCapture?.authWatchStatus || 'none'}`,
    `- Handoff wait-auth status: ${pack.backgroundProofCapture?.handoffWaitAuthStatus || 'none'}`,
    `- Capture start blockers: ${pack.backgroundProofCapture?.captureStartBlockers?.length ? pack.backgroundProofCapture.captureStartBlockers.join(', ') : 'none'}`,
    '',
    '## Objective Safe Command',
    '',
    `- Status: ${pack.objectiveSafeCommand?.status || 'none'}`,
    `- Command ID: ${pack.objectiveSafeCommand?.commandId || 'none'}`,
    `- Monitor only: ${pack.objectiveSafeCommand?.monitorOnly ? 'yes' : 'no'}`,
    `- May open browser: ${pack.objectiveSafeCommand?.mayOpenBrowser ? 'yes' : 'no'}`,
    `- Starts capture: ${pack.objectiveSafeCommand?.startsCapture ? 'yes' : 'no'}`,
    `- Blocked reason: ${pack.objectiveSafeCommand?.blockedReason || 'none'}`,
    `- Output path: ${pack.objectiveSafeCommand?.outputPath || 'none'}`,
    '',
    '## Regular Chrome',
    '',
    `- Prepared through Codex Chrome Extension: ${pack.regularChrome?.prepared ? 'yes' : 'no'}`,
    `- Backend available: ${pack.regularChrome?.backendAvailable ? 'yes' : 'no'}`,
    `- Profile window retry attempted: ${yesNoUnknown(pack.regularChrome?.profileWindowRetryAttempted)}`,
    `- Backend failure after profile window retry: ${pack.regularChrome?.backendFailureAfterProfileWindowRetry ? 'yes' : 'no'}`,
    `- Extension reinstall recommended: ${pack.regularChrome?.extensionReinstallRecommended ? 'yes' : 'no'}`,
    `- Ready: ${pack.regularChrome?.ready ? 'yes' : 'no'}`,
    `- CDP allowed: ${pack.regularChrome?.cdpAllowed ? 'yes' : 'no'}`,
    `- Selected profile: ${pack.regularChrome?.selectedProfile || 'unknown'}`,
    `- Next action: ${pack.regularChrome?.nextAction || 'none'}`,
    `- Handoff action: ${pack.regularChrome?.handoffAction || 'none'}`,
    `- Resume action: ${pack.regularChrome?.resumeAction || 'none'}`,
    `- Operator OK required: ${pack.regularChrome?.operatorOkRequired ? 'yes' : 'no'}`,
    `- User permission required: ${pack.regularChrome?.userPermissionRequired ? 'yes' : 'no'}`,
    `- Can open selected profile window: ${pack.regularChrome?.canOpenSelectedProfileWindow ? 'yes' : 'no'}`,
    `- Command run only after user says: ${pack.regularChrome?.commandRunOnlyAfterUserSays || 'none'}`,
    `- Claim plan ready: ${pack.regularChrome?.claimPlanReady ? 'yes' : 'no'}`,
    `- Claim plan next action: ${pack.regularChrome?.claimPlanNextAction || 'none'}`,
    `- Claim plan next tool: ${pack.regularChrome?.claimPlanNextTool || 'none'}`,
    `- Claim plan snippet keys: ${pack.regularChrome?.claimPlanSnippetKeys?.length ? pack.regularChrome.claimPlanSnippetKeys.join(', ') : 'none'}`,
    `- Backend check plan next action: ${pack.regularChrome?.backendCheckPlanNextAction || 'none'}`,
    `- Backend check plan next tool: ${pack.regularChrome?.backendCheckPlanNextTool || 'none'}`,
    `- Backend check plan snippet keys: ${pack.regularChrome?.backendCheckPlanSnippetKeys?.length ? pack.regularChrome.backendCheckPlanSnippetKeys.join(', ') : 'none'}`,
    `- MCP page-list timeout: ${pack.regularChrome?.mcpPageListTimeout ? 'yes' : 'no'}`,
    `- MCP use everyday Chrome now: ${pack.regularChrome?.mcpUseEverydayChromeNow ? 'yes' : 'no'}`,
    `- MCP timeout plan next action: ${pack.regularChrome?.mcpTimeoutPlanNextAction || 'none'}`,
    `- MCP timeout plan findings: ${pack.regularChrome?.mcpTimeoutPlanFindings?.length ? pack.regularChrome.mcpTimeoutPlanFindings.join(', ') : 'none'}`,
    '',
    '## Secrets',
    '',
    `- Handoff mode: ${pack.secrets?.handoffMode || 'none'}`,
    `- Headless ready: ${pack.secrets?.headlessReady ? 'yes' : 'no'}`,
    `- Headless config available: ${pack.secrets?.headlessConfigAvailable ? 'yes' : 'no'}`,
    `- 1Password approval required: ${pack.secrets?.requiresOnePasswordApproval ? 'yes' : 'no'}`,
    `- Mutates 1Password now: ${pack.secrets?.mutatesOnePasswordNow ? 'yes' : 'no'}`,
    `- Next action: ${pack.secrets?.nextAction || 'none'}`,
    '',
    '## Files',
    ''
  ];
  for (const [key, value] of Object.entries(pack.files || {})) {
    lines.push(`- ${key}: ${value || 'not written'}`);
  }
  if (pack.nextAction?.command?.shell) {
    lines.push('', '## Next Command', '', '```bash', pack.nextAction.command.shell, '```');
  }
  if (pack.authWatchCommand?.shell || pack.handoffResumeCommand?.shell) {
    lines.push('', '## Login Monitor Commands');
    if (pack.authWatchCommand?.shell) {
      lines.push('', '### Auth Watch', '', '```bash', pack.authWatchCommand.shell, '```');
    }
    if (pack.handoffResumeCommand?.shell) {
      lines.push('', '### Handoff Resume', '', '```bash', pack.handoffResumeCommand.shell, '```');
    }
  }
  if (pack.loginHandoff?.statusCommand?.shell) {
    lines.push('', '## Login Handoff Status Command', '', '```bash', pack.loginHandoff.statusCommand.shell, '```');
  }
  const watch = pack.summaries?.objectiveHandoff?.commands?.find((item) => item.id === 'proof-gate-watch');
  if (watch?.shell) {
    lines.push('', '## Watch Command', '', '```bash', watch.shell, '```');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
