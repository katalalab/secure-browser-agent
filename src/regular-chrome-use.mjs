import fs from 'node:fs';
import path from 'node:path';
import { buildChromeExtensionHandoff } from './chrome-extension-handoff.mjs';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';
import { buildChromeMcpHandoff } from './chrome-mcp-handoff.mjs';
import { buildChromeMcpObservation } from './chrome-mcp-observation.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function toolLineId(id) {
  return String(id || 'tool').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'tool';
}

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/regular-chrome-use-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid regular Chrome use output path: ${outPath}`);
  return outputPath;
}

function safeRunInputPath(rootDir, inPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(inPath || '').replace(/^[/\\]+/, '');
  const inputPath = path.resolve(runsRoot, relative);
  const insideRuns = inputPath === runsRoot || inputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid regular Chrome use input path: ${inPath}`);
  return inputPath;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeIntent(intent) {
  const value = String(intent || 'inspect').toLowerCase();
  if (['inspect', 'snapshot', 'analyze', 'read'].includes(value)) return 'inspect';
  if (['operate', 'click', 'fill'].includes(value)) return 'operate';
  if (['screenshot', 'visual'].includes(value)) return 'screenshot';
  if (['console', 'logs'].includes(value)) return 'console';
  if (['network', 'requests'].includes(value)) return 'network';
  return 'inspect';
}

function toolIdsForIntent(intent) {
  const common = ['status', 'list-pages', 'select-page', 'snapshot'];
  if (intent === 'operate') return [...common, 'click', 'fill'];
  if (intent === 'screenshot') return [...common, 'screenshot'];
  if (intent === 'console') return [...common, 'console'];
  if (intent === 'network') return [...common, 'network'];
  return common;
}

function resumePlanCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--format', 'compact']);
}

function resumeApprovalCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--run', '--operator-ok', 'OK', '--format', 'compact']);
}

function appleEventsStatusCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-apple-events-status', '--format', 'compact']);
}

function appleEventsOutlinePlanCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-apple-events-outline', '--format', 'compact']);
}

function appleEventsOutlineApprovalCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-apple-events-outline', '--run', '--operator-ok', 'OK', '--format', 'compact']);
}

function flagToBoolean(value) {
  if (value === true || value === 'yes' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function extensionWindowRetryAttempted(options = {}) {
  return Boolean(flagToBoolean(
    options.chromeExtensionWindowRetryAttempted
      ?? options.chromeExtensionProfileWindowRetryAttempted
      ?? options.profileWindowRetryAttempted
      ?? options.windowRetryAttempted
  ));
}

function appleEventsStatusFromFile(options = {}) {
  const input = options.appleEventsStatusFile
    ?? options['apple-events-status-file']
    ?? options.appleEventsStatusIn
    ?? options['apple-events-status-in'];
  if (!input) return null;
  const inputPath = safeRunInputPath(options.rootDir || process.cwd(), input);
  const status = readJsonIfExists(inputPath);
  if (!status) {
    return {
      path: inputPath,
      exists: false,
      activeTabObserved: null,
      javascriptAllowed: null
    };
  }
  return {
    path: inputPath,
    exists: true,
    activeTabObserved: Boolean(status.activeTab?.observed),
    javascriptAllowed: Boolean(status.javascript?.allowed),
    nextAction: status.nextAction || '',
    urlRedacted: status.activeTab?.urlRedacted || ''
  };
}

function chromeMcpObservationFromFile(options = {}) {
  const input = options.mcpObservationIn
    ?? options['mcp-observation-in']
    ?? options.chromeMcpObservationFile
    ?? options['chrome-mcp-observation-file'];
  if (!input) return null;
  const inputPath = safeRunInputPath(options.rootDir || process.cwd(), input);
  const observation = readJsonIfExists(inputPath);
  if (!observation) {
    return {
      path: inputPath,
      exists: false,
      parseOk: false,
      status: '',
      routeReady: null,
      source: '',
      flags: {}
    };
  }
  const observed = observation.observed || {};
  const pageListOk = observed.pageListOk;
  const connected = observed.connected;
  return {
    path: inputPath,
    exists: true,
    parseOk: true,
    status: observation.decision?.status || '',
    routeReady: observation.decision?.routeReady ?? null,
    source: observation.source || 'chrome-mcp-observation-file',
    flags: {
      chromeMcpConnected: connected === true || connected === false ? yesNo(connected) : undefined,
      chromeMcpTools: observed.tools ?? undefined,
      chromeMcpPageListOk: pageListOk === true || pageListOk === false ? yesNo(pageListOk) : undefined,
      chromeMcpPageCount: observed.pageCount ?? undefined,
      chromeMcpLastError: observed.lastError || '',
      chromeMcpSource: observation.source || 'chrome-mcp-observation-file'
    }
  };
}

function observedAppleEventsStatus(options = {}) {
  const fileStatus = appleEventsStatusFromFile(options);
  const activeTabObserved = flagToBoolean(options.appleEventsActiveTabObserved) ?? fileStatus?.activeTabObserved ?? null;
  const javascriptAllowed = flagToBoolean(options.appleEventsJavascriptAllowed) ?? fileStatus?.javascriptAllowed ?? null;
  if (activeTabObserved === null && javascriptAllowed === null) return null;
  return {
    activeTabObserved: activeTabObserved === true,
    javascriptAllowed: javascriptAllowed === true,
    observeMetadataAvailable: activeTabObserved === true,
    inspectDomAvailable: javascriptAllowed === true,
    source: fileStatus?.path ? 'apple-events-status-file' : 'explicit-flags',
    statusPath: fileStatus?.path || '',
    statusFileExists: fileStatus?.exists ?? null,
    urlRedacted: fileStatus?.urlRedacted || '',
    nextAction: javascriptAllowed === true
      ? 'run-gated-apple-events-outline-if-operator-approves'
      : activeTabObserved === true
      ? 'enable-javascript-from-apple-events-if-operator-approves'
      : 'run-apple-events-status'
  };
}

function observedChromeExtensionStatus(options = {}) {
  const prepared = flagToBoolean(options.chromeExtensionPrepared);
  const backendAvailable = flagToBoolean(options.chromeExtensionBackendAvailable ?? options.extensionBackendAvailable);
  if (prepared === null && backendAvailable === null) return null;
  const extensionPrepared = prepared ?? backendAvailable === true;
  const extensionReady = extensionPrepared && backendAvailable === true;
  const retryAttempted = extensionWindowRetryAttempted(options);
  const reinstallRecommended = extensionPrepared && backendAvailable === false && retryAttempted;
  return {
    decision: {
      everydayChromeViaCodexExtensionPrepared: extensionPrepared,
      everydayChromeViaCodexExtensionBackendAvailable: backendAvailable === true,
      everydayChromeViaCodexExtensionReady: extensionReady,
      everydayChromeViaCodexExtensionReinstallRecommended: reinstallRecommended
    },
    extension: {
      selectedProfileDirectory: options.chromeExtensionSelectedProfile || 'Default',
      selectedProfileEnabled: extensionPrepared,
      enabled: extensionPrepared
    },
    nativeHost: {
      correct: extensionPrepared
    },
    observedBackendLastError: options.chromeExtensionBackendLastError || options.extensionBackendLastError || '',
    profileWindowRetryAttempted: retryAttempted,
    nextAction: extensionReady
      ? 'claim-or-open-everyday-chrome-tab'
      : reinstallRecommended
      ? 'reinstall-codex-chrome-plugin-from-ui'
      : 'verify-codex-chrome-extension-backend'
  };
}

export async function buildRegularChromeUse(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const intent = normalizeIntent(options.intent);
  const allowNewBackgroundTab = flagToBoolean(options.allowNewBackgroundTab ?? options['allow-new-background-tab']) === true;
  const newBackgroundUrlEnv = String(
    options.newBackgroundUrlEnv
      ?? options['new-background-url-env']
      ?? options.urlEnv
      ?? options['url-env']
      ?? ''
  ).trim();
  const savedChromeMcpObservation = chromeMcpObservationFromFile({ ...options, rootDir });
  const rawObservation = options.statusText || options.listPagesText
    ? buildChromeMcpObservation({
        generatedAt,
        statusText: options.statusText || '',
        listPagesText: options.listPagesText || '',
        source: options.source || options.chromeMcpSource || '',
        intent
      })
    : null;
  const observationFlags = rawObservation
    ? {
        chromeMcpConnected: rawObservation.observed.connected === null ? undefined : yesNo(rawObservation.observed.connected),
        chromeMcpTools: rawObservation.observed.tools ?? undefined,
        chromeMcpPageListOk: rawObservation.observed.pageListOk === null ? undefined : yesNo(rawObservation.observed.pageListOk),
        chromeMcpPageCount: rawObservation.observed.pageCount ?? undefined,
        chromeMcpLastError: rawObservation.observed.lastError || '',
        chromeMcpSource: rawObservation.source || ''
      }
    : {
        chromeMcpConnected: options.chromeMcpConnected ?? savedChromeMcpObservation?.flags.chromeMcpConnected,
        chromeMcpTools: options.chromeMcpTools ?? savedChromeMcpObservation?.flags.chromeMcpTools,
        chromeMcpPageListOk: options.chromeMcpPageListOk ?? savedChromeMcpObservation?.flags.chromeMcpPageListOk,
        chromeMcpPageCount: options.chromeMcpPageCount ?? savedChromeMcpObservation?.flags.chromeMcpPageCount,
        chromeMcpLastError: firstNonEmpty(options.chromeMcpLastError, savedChromeMcpObservation?.flags.chromeMcpLastError, ''),
        chromeMcpSource: firstNonEmpty(options.chromeMcpSource, savedChromeMcpObservation?.flags.chromeMcpSource, '')
      };
  const chromeMcpHandoff = options.chromeMcpHandoff || await buildChromeMcpHandoff({
    ...options,
    ...observationFlags,
    rootDir,
    generatedAt,
    task: 'existing-tab',
    allowNewBackgroundTab,
    newBackgroundUrlEnv
  });
  const mcpReady = Boolean(chromeMcpHandoff.ready);
  const chromeExtensionStatus = options.chromeExtensionStatus || (mcpReady
    ? {
        decision: {
          everydayChromeViaCodexExtensionPrepared: false,
          everydayChromeViaCodexExtensionBackendAvailable: false,
          everydayChromeViaCodexExtensionReady: false
        },
        extension: {},
        nativeHost: {},
        nextAction: ''
      }
    : observedChromeExtensionStatus(options) || buildChromeExtensionStatus({
        ...options,
        rootDir,
        generatedAt,
        pluginDir: options.pluginDir || ''
      }));
  const chromeExtensionHandoff = options.chromeExtensionHandoff || (mcpReady
    ? { commands: [] }
    : buildChromeExtensionHandoff({
        ...options,
        rootDir,
        generatedAt,
        pluginDir: options.pluginDir || '',
        chromeExtensionStatus
      }));
  const allowedToolIds = toolIdsForIntent(intent);
  if (allowNewBackgroundTab && !allowedToolIds.includes('new-background-page')) {
    allowedToolIds.splice(1, 0, 'new-background-page');
  }
  const allowedMcpToolCalls = chromeMcpHandoff.ready
    ? chromeMcpHandoff.toolCalls.filter((call) => allowedToolIds.includes(call.id))
    : [];
  const extensionPrepared = Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionPrepared);
  const observedBackendAvailable = flagToBoolean(options.chromeExtensionBackendAvailable ?? options.extensionBackendAvailable);
  const effectiveBackendAvailable = observedBackendAvailable === null
    ? Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionBackendAvailable)
    : observedBackendAvailable;
  const extensionReady = extensionPrepared && effectiveBackendAvailable === true;
  const extensionBackendLastError = chromeExtensionStatus.observedBackendLastError
    || options.chromeExtensionBackendLastError
    || options.extensionBackendLastError
    || '';
  const extensionRetryAttempted = Boolean(chromeExtensionStatus.profileWindowRetryAttempted)
    || extensionWindowRetryAttempted(options);
  const extensionReinstallRecommended = Boolean(chromeExtensionStatus.decision?.everydayChromeViaCodexExtensionReinstallRecommended)
    || Boolean(extensionPrepared && effectiveBackendAvailable === false && extensionRetryAttempted);
  const appleEvents = observedAppleEventsStatus({ ...options, rootDir });
  const appleEventsUsableForInspect = Boolean(appleEvents?.inspectDomAvailable && intent === 'inspect');
  const mcpNewBackgroundTab = mcpReady && chromeMcpHandoff.selectedLane === 'regular-chrome-mcp-new-background-tab';
  const extensionOpenCommand = chromeExtensionHandoff.commands?.find((item) => item.id === 'open-selected-profile-window');
  const selectedLane = mcpReady
    ? chromeMcpHandoff.selectedLane || 'regular-chrome-mcp'
    : extensionReady
    ? 'regular-chrome-extension'
    : appleEventsUsableForInspect
    ? 'regular-chrome-apple-events-outline'
    : extensionReinstallRecommended
    ? 'regular-chrome-extension-reinstall-required'
    : extensionPrepared
    ? 'regular-chrome-extension-resume'
    : 'regular-chrome-not-ready';
  const backend = mcpReady
    ? 'chrome-devtools-mcp'
    : extensionReady
    ? 'codex-chrome-extension'
    : appleEventsUsableForInspect
    ? 'chrome-apple-events'
    : extensionPrepared
    ? 'codex-chrome-extension'
    : 'none';
  const nextAction = mcpReady
    ? chromeMcpHandoff.nextAction
    : extensionReady
    ? 'use-codex-chrome-extension-existing-tab'
    : appleEventsUsableForInspect
    ? 'run-gated-apple-events-outline-if-operator-approves'
    : extensionReinstallRecommended
    ? 'reinstall-codex-chrome-plugin-from-ui'
    : extensionPrepared
    ? 'verify-or-resume-codex-chrome-extension-backend'
    : chromeExtensionStatus.nextAction || 'prepare-everyday-chrome-control';
  const ready = mcpReady || extensionReady || appleEventsUsableForInspect;
  const commandPlan = mcpReady
    ? command(['node', 'src/cli.mjs', 'chrome-mcp-handoff',
        '--chrome-mcp-connected', 'yes',
        '--chrome-mcp-tools', String(chromeMcpHandoff.routeEvidence?.chromeMcpObservedTools ?? 0),
        '--chrome-mcp-page-list-ok', mcpNewBackgroundTab ? 'no' : 'yes',
        '--chrome-mcp-page-count', String(chromeMcpHandoff.routeEvidence?.chromeMcpObservedPageCount ?? 0),
        ...(chromeMcpHandoff.routeEvidence?.chromeMcpLastError ? ['--chrome-mcp-last-error', chromeMcpHandoff.routeEvidence.chromeMcpLastError] : []),
        '--chrome-mcp-source', chromeMcpHandoff.routeEvidence?.chromeMcpStatus || 'regular-chrome-use',
        ...(mcpNewBackgroundTab ? ['--allow-new-background-tab', 'yes'] : []),
        ...(mcpNewBackgroundTab && newBackgroundUrlEnv ? ['--new-background-url-env', newBackgroundUrlEnv] : []),
        '--format', 'compact'])
    : appleEventsUsableForInspect
    ? appleEventsOutlinePlanCommand()
    : extensionReinstallRecommended
    ? command(['node', 'src/cli.mjs', 'chrome-extension-troubleshoot',
        '--backend-available', 'no',
        extensionBackendLastError ? '--backend-last-error' : '',
        extensionBackendLastError,
        '--profile-window-retry-attempted', 'yes',
        '--format', 'compact'].filter(Boolean))
    : extensionPrepared || extensionReady
    ? resumePlanCommand()
    : command(['node', 'src/cli.mjs', 'chrome-extension-status', '--format', 'compact']);
  const approvalCommand = appleEventsUsableForInspect
    ? appleEventsOutlineApprovalCommand()
    : !mcpReady && !extensionReady && !extensionReinstallRecommended && extensionPrepared
    ? resumeApprovalCommand()
    : null;

  const plan = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    usingEverydayChrome: true,
    intent,
    ready,
    selectedLane,
    backend,
    nextAction,
    command: commandPlan,
    approvalCommand,
    appleEventsStatusCommand: appleEventsStatusCommand(),
    appleEventsOutlineCommand: appleEventsOutlinePlanCommand(),
    appleEventsOutlineApprovalCommand: appleEventsOutlineApprovalCommand(),
    userPermissionRequired: Boolean(approvalCommand),
    runOnlyAfterUserSays: approvalCommand ? 'OK' : '',
    canRunInBackground: mcpReady || extensionReady || appleEventsUsableForInspect,
    scope: {
      existingTabsOnly: !mcpNewBackgroundTab,
      newBackgroundTabsAllowed: mcpNewBackgroundTab,
      operatorRequestedTabsOnly: true,
      storedAuthenticatedScrapingAllowed: false,
      directCdpDefaultProfileAllowed: false,
      dedicatedTargetProfileRequiredForStoredAuth: true
    },
    chromeMcp: {
      ready: mcpReady,
      rawObservationStatus: rawObservation?.decision?.status || '',
      rawObservationRouteReady: rawObservation ? rawObservation.decision.routeReady : null,
      savedObservationPath: savedChromeMcpObservation?.path || '',
      savedObservationExists: savedChromeMcpObservation?.exists ?? null,
      savedObservationParseOk: savedChromeMcpObservation?.parseOk ?? null,
      savedObservationStatus: savedChromeMcpObservation?.status || '',
      savedObservationRouteReady: savedChromeMcpObservation?.routeReady ?? null,
      savedObservationSource: savedChromeMcpObservation?.source || '',
      nextToolCall: chromeMcpHandoff.nextToolCall || null,
      allowedToolIds,
      allowedToolCalls: allowedMcpToolCalls,
      newBackgroundTabAllowed: mcpNewBackgroundTab,
      newBackgroundUrlEnv: chromeMcpHandoff.security?.newBackgroundUrlEnv || newBackgroundUrlEnv,
      newBackgroundUrlValueRead: Boolean(chromeMcpHandoff.security?.newBackgroundUrlValueRead),
      observedConnected: chromeMcpHandoff.routeEvidence?.chromeMcpObservedConnected ?? null,
      observedTools: chromeMcpHandoff.routeEvidence?.chromeMcpObservedTools ?? null,
      observedPageListOk: chromeMcpHandoff.routeEvidence?.chromeMcpObservedPageListOk ?? null,
      observedPageCount: chromeMcpHandoff.routeEvidence?.chromeMcpObservedPageCount ?? null,
      listPagesTimedOut: Boolean(chromeMcpHandoff.routeEvidence?.chromeMcpListPagesTimedOut),
      lastError: chromeMcpHandoff.routeEvidence?.chromeMcpLastError || '',
      source: chromeMcpHandoff.routeEvidence?.chromeMcpStatus || rawObservation?.source || '',
      blockedReason: chromeMcpHandoff.blockedReason || ''
    },
    extension: {
      prepared: extensionPrepared,
      ready: extensionReady,
      backendAvailable: effectiveBackendAvailable === true,
      selectedProfileDirectory: chromeExtensionStatus.extension?.selectedProfileDirectory || '',
      selectedProfileEnabled: Boolean(chromeExtensionStatus.extension?.selectedProfileEnabled),
      nativeHostCorrect: Boolean(chromeExtensionStatus.nativeHost?.correct),
      nextAction: chromeExtensionStatus.nextAction || '',
      reinstallRecommended: extensionReinstallRecommended,
      profileWindowRetryAttempted: extensionRetryAttempted,
      backendLastError: extensionBackendLastError
    },
    appleEvents: {
      observed: Boolean(appleEvents),
      activeTabObserved: Boolean(appleEvents?.activeTabObserved),
      javascriptAllowed: Boolean(appleEvents?.javascriptAllowed),
      observeMetadataAvailable: Boolean(appleEvents?.observeMetadataAvailable),
      inspectDomAvailable: Boolean(appleEvents?.inspectDomAvailable),
      usableForInspect: appleEventsUsableForInspect,
      operatorApprovalRequiredForOutline: Boolean(appleEventsUsableForInspect),
      source: appleEvents?.source || '',
      statusPath: appleEvents?.statusPath || '',
      statusFileExists: appleEvents?.statusFileExists ?? null,
      urlRedacted: appleEvents?.urlRedacted || '',
      nextAction: appleEvents?.nextAction || 'run-apple-events-status'
    },
    security: {
      cookieValuesRead: false,
      passwordStoreRead: false,
      browserStorageRead: false,
      pageOutputTrusted: false,
      freshSnapshotRequiredForMutation: intent === 'operate',
      secretInputAllowedFromPrompt: false
    },
    blockedReason: ready
      ? ''
      : mcpReady
      ? ''
      : extensionReinstallRecommended
      ? 'Codex Chrome Extension backend still fails after the selected profile window retry; reinstall the Chrome plugin from the Codex plugin UI before using everyday Chrome control.'
      : extensionPrepared
      ? 'Everyday Chrome extension is prepared, but this agent session has not proved the backend yet; use the gated resume command and require operator OK before opening Chrome.'
      : chromeMcpHandoff.blockedReason || chromeExtensionStatus.decision?.reason || 'Everyday Chrome is not prepared for agent control.'
  };

  if (options.write || options.out || options.output) {
    plan.outputPath = safeRunPath(rootDir, options.out || options.output);
    writeJson(plan.outputPath, plan);
  }

  return plan;
}

export function formatRegularChromeUseCompact(plan) {
  const lines = [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `using_everyday_chrome: ${yesNo(plan.usingEverydayChrome)}`,
    `intent: ${plan.intent}`,
    `ready: ${yesNo(plan.ready)}`,
    `selected_lane: ${plan.selectedLane}`,
    `backend: ${plan.backend}`,
    `next_action: ${plan.nextAction}`,
    `can_run_in_background: ${yesNo(plan.canRunInBackground)}`,
    `user_permission_required: ${yesNo(plan.userPermissionRequired)}`,
    `run_only_after_user_says: ${clean(plan.runOnlyAfterUserSays)}`,
    `existing_tabs_only: ${yesNo(plan.scope.existingTabsOnly)}`,
    `new_background_tabs_allowed: ${yesNo(plan.scope.newBackgroundTabsAllowed)}`,
    `operator_requested_tabs_only: ${yesNo(plan.scope.operatorRequestedTabsOnly)}`,
    `stored_authenticated_scraping_allowed: ${yesNo(plan.scope.storedAuthenticatedScrapingAllowed)}`,
    `direct_cdp_default_profile_allowed: ${yesNo(plan.scope.directCdpDefaultProfileAllowed)}`,
    `dedicated_target_profile_required_for_stored_auth: ${yesNo(plan.scope.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `chrome_mcp_ready: ${yesNo(plan.chromeMcp.ready)}`,
    `chrome_mcp_raw_observation_status: ${clean(plan.chromeMcp.rawObservationStatus)}`,
    `chrome_mcp_raw_observation_route_ready: ${plan.chromeMcp.rawObservationRouteReady === null ? 'unknown' : yesNo(plan.chromeMcp.rawObservationRouteReady)}`,
    `chrome_mcp_saved_observation_exists: ${plan.chromeMcp.savedObservationExists === null ? 'unknown' : yesNo(plan.chromeMcp.savedObservationExists)}`,
    `chrome_mcp_saved_observation_parse_ok: ${plan.chromeMcp.savedObservationParseOk === null ? 'unknown' : yesNo(plan.chromeMcp.savedObservationParseOk)}`,
    `chrome_mcp_saved_observation_status: ${clean(plan.chromeMcp.savedObservationStatus)}`,
    `chrome_mcp_saved_observation_route_ready: ${plan.chromeMcp.savedObservationRouteReady === null ? 'unknown' : yesNo(plan.chromeMcp.savedObservationRouteReady)}`,
    `chrome_mcp_saved_observation_source: ${clean(plan.chromeMcp.savedObservationSource)}`,
    `chrome_mcp_observed_connected: ${plan.chromeMcp.observedConnected === null ? 'unknown' : yesNo(plan.chromeMcp.observedConnected)}`,
    `chrome_mcp_observed_tools: ${plan.chromeMcp.observedTools ?? 'unknown'}`,
    `chrome_mcp_observed_page_list_ok: ${plan.chromeMcp.observedPageListOk === null ? 'unknown' : yesNo(plan.chromeMcp.observedPageListOk)}`,
    `chrome_mcp_observed_page_count: ${plan.chromeMcp.observedPageCount ?? 'unknown'}`,
    `chrome_mcp_list_pages_timed_out: ${yesNo(plan.chromeMcp.listPagesTimedOut)}`,
    `chrome_mcp_observed_source: ${clean(plan.chromeMcp.source)}`,
    `chrome_mcp_allowed_tool_ids: ${plan.chromeMcp.allowedToolIds.join(',')}`,
    `chrome_mcp_allowed_tool_call_count: ${plan.chromeMcp.allowedToolCalls.length}`,
    `chrome_mcp_new_background_tab_allowed: ${yesNo(plan.chromeMcp.newBackgroundTabAllowed)}`,
    `chrome_mcp_new_background_url_env: ${clean(plan.chromeMcp.newBackgroundUrlEnv)}`,
    `chrome_mcp_new_background_url_value_read: ${yesNo(plan.chromeMcp.newBackgroundUrlValueRead)}`,
    `extension_prepared: ${yesNo(plan.extension.prepared)}`,
    `extension_ready: ${yesNo(plan.extension.ready)}`,
    `extension_backend_available: ${yesNo(plan.extension.backendAvailable)}`,
    `extension_profile_window_retry_attempted: ${yesNo(plan.extension.profileWindowRetryAttempted)}`,
    `extension_reinstall_recommended: ${yesNo(plan.extension.reinstallRecommended)}`,
    `apple_events_status_command: ${plan.appleEventsStatusCommand.shell}`,
    `apple_events_observed: ${yesNo(plan.appleEvents.observed)}`,
    `apple_events_source: ${clean(plan.appleEvents.source)}`,
    `apple_events_active_tab_observed: ${yesNo(plan.appleEvents.activeTabObserved)}`,
    `apple_events_javascript_allowed: ${yesNo(plan.appleEvents.javascriptAllowed)}`,
    `apple_events_usable_for_inspect: ${yesNo(plan.appleEvents.usableForInspect)}`,
    `apple_events_operator_approval_required_for_outline: ${yesNo(plan.appleEvents.operatorApprovalRequiredForOutline)}`,
    `apple_events_next_action: ${clean(plan.appleEvents.nextAction)}`,
    `apple_events_status_file: ${clean(plan.appleEvents.statusPath)}`,
    `apple_events_outline_command: ${plan.appleEventsOutlineCommand.shell}`,
    `apple_events_outline_approval_command: ${plan.appleEventsOutlineApprovalCommand.shell}`,
    `page_output_trusted: ${yesNo(plan.security.pageOutputTrusted)}`,
    `fresh_snapshot_required_for_mutation: ${yesNo(plan.security.freshSnapshotRequiredForMutation)}`,
    `secret_input_allowed_from_prompt: ${yesNo(plan.security.secretInputAllowedFromPrompt)}`,
    `command: ${plan.command.shell}`
  ];
  if (plan.chromeMcp.savedObservationPath) lines.push(`chrome_mcp_saved_observation_path: ${plan.chromeMcp.savedObservationPath}`);
  if (plan.chromeMcp.nextToolCall) lines.push(`next_tool_args: ${JSON.stringify(plan.chromeMcp.nextToolCall.args)}`);
  for (const call of plan.chromeMcp.allowedToolCalls || []) {
    const id = toolLineId(call.id);
    lines.push(`chrome_mcp_tool_${id}_args: ${JSON.stringify(call.args || {})}`);
    if (call.mayMutatePage) lines.push(`chrome_mcp_tool_${id}_requires_fresh_snapshot: ${yesNo(call.requiresFreshSnapshot)}`);
    if (call.requiresOperatorTask) lines.push(`chrome_mcp_tool_${id}_requires_operator_task: ${yesNo(call.requiresOperatorTask)}`);
  }
  if (plan.chromeMcp.lastError) lines.push(`chrome_mcp_last_error: ${clean(plan.chromeMcp.lastError)}`);
  if (plan.approvalCommand) lines.push(`approval_command: ${plan.approvalCommand.shell}`);
  if (plan.extension.backendLastError) lines.push(`extension_backend_last_error: ${clean(plan.extension.backendLastError)}`);
  if (plan.blockedReason) lines.push(`blocked_reason: ${plan.blockedReason}`);
  if (plan.outputPath) lines.push(`output: ${plan.outputPath}`);
  return `${lines.join('\n')}\n`;
}

export function formatRegularChromeUseMarkdown(plan) {
  const lines = [
    '# Regular Chrome Use',
    '',
    `Generated: ${plan.generatedAt}`,
    `Ready: ${plan.ready ? 'yes' : 'no'}`,
    `Selected lane: ${plan.selectedLane}`,
    `Backend: ${plan.backend}`,
    `Intent: ${plan.intent}`,
    `Can run in background: ${plan.canRunInBackground ? 'yes' : 'no'}`,
    `Opens browser now: ${plan.opensBrowserNow ? 'yes' : 'no'}`,
    '',
    '## Scope',
    '',
    `- Existing tabs only: ${plan.scope.existingTabsOnly ? 'yes' : 'no'}`,
    `- New background tabs allowed: ${plan.scope.newBackgroundTabsAllowed ? 'yes' : 'no'}`,
    `- Operator requested tabs only: ${plan.scope.operatorRequestedTabsOnly ? 'yes' : 'no'}`,
    `- Stored authenticated scraping allowed: ${plan.scope.storedAuthenticatedScrapingAllowed ? 'yes' : 'no'}`,
    `- Direct CDP default profile allowed: ${plan.scope.directCdpDefaultProfileAllowed ? 'yes' : 'no'}`,
    `- Dedicated target profile required for stored auth: ${plan.scope.dedicatedTargetProfileRequiredForStoredAuth ? 'yes' : 'no'}`,
    '',
    '## Next',
    '',
    '```bash',
    plan.command.shell,
    '```'
  ];
  if (plan.approvalCommand) {
    lines.push('', 'Run only after the operator says OK:', '', '```bash', plan.approvalCommand.shell, '```');
  }
  if (plan.chromeMcp.allowedToolCalls.length > 0) {
    lines.push('', '## Allowed MCP Calls', '');
    for (const call of plan.chromeMcp.allowedToolCalls) {
      lines.push(`- ${call.id}: ${call.tool} ${JSON.stringify(call.args)}`);
    }
  }
  if (plan.blockedReason) {
    lines.push('', '## Blocked Reason', '', plan.blockedReason);
  }
  lines.push('');
  return lines.join('\n');
}
