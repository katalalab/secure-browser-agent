import fs from 'node:fs';
import path from 'node:path';
import { buildChromeAppleEventsStatus } from './chrome-apple-events-status.mjs';
import { buildChromeMcpObservationStatus } from './chrome-mcp-observation.mjs';
import { buildRegularChromeUse } from './regular-chrome-use.mjs';
import { toPosixPath } from './output.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function backgroundTabArgs(options = {}) {
  const args = [];
  const allowNewBackgroundTab = options.allowNewBackgroundTab ?? options['allow-new-background-tab'];
  const newBackgroundUrlEnv = options.newBackgroundUrlEnv ?? options['new-background-url-env'];
  if (allowNewBackgroundTab) args.push('--allow-new-background-tab', allowNewBackgroundTab);
  if (newBackgroundUrlEnv) args.push('--new-background-url-env', newBackgroundUrlEnv);
  return args;
}

function optionalRunsRelativePath(value, label) {
  if (!value) return '';
  return safeRunRelativePath(value, value, label);
}

function mcpObservationArgs(input) {
  return input ? ['--mcp-observation-in', input] : [];
}

function safeRunRelativePath(outPath, fallback, label) {
  const raw = String(outPath || fallback).replace(/^[/\\]+/, '');
  const normalized = path.normalize(raw);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`) || path.isAbsolute(normalized)) {
    throw new Error(`invalid regular Chrome refresh ${label} path: ${outPath}`);
  }
  return normalized;
}

function safeRunsPath(rootDir, runPath, fallback, label) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = safeRunRelativePath(runPath, fallback, label);
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid regular Chrome refresh ${label} path: ${runPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  return toPosixPath(path.relative(path.resolve(rootDir, 'runs'), filePath));
}

function readJsonStatus(filePath) {
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

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function ageSecondsFrom(value, generatedAt) {
  const timestamp = Date.parse(generatedAt || '');
  const now = Date.parse(value || '');
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - timestamp) / 1000));
}

export async function buildRegularChromeRefresh(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const intent = options.intent || 'inspect';
  const appleEventsOut = safeRunRelativePath(
    options.appleEventsOut || options['apple-events-out'],
    'operator/chrome-apple-events-status-latest.json',
    'apple-events-out'
  );
  const regularChromeOut = safeRunRelativePath(
    options.out || options.output || options.regularChromeOut || options['regular-chrome-out'],
    'operator/regular-chrome-use-latest.json',
    'regular-chrome-out'
  );
  const mcpObservationIn = optionalRunsRelativePath(
    options.mcpObservationIn || options['mcp-observation-in'],
    'mcp-observation-in'
  );

  const appleEventsStatus = options.appleEventsStatus || buildChromeAppleEventsStatus({
    rootDir,
    generatedAt,
    runner: options.runner,
    write: true,
    out: appleEventsOut
  });
  const regularChromeUse = await buildRegularChromeUse({
    rootDir,
    generatedAt,
    intent,
    statusText: options.statusText || '',
    listPagesText: options.listPagesText || '',
    source: options.source || '',
    chromeMcpConnected: options.chromeMcpConnected,
    chromeMcpTools: options.chromeMcpTools,
    chromeMcpPageListOk: options.chromeMcpPageListOk,
    chromeMcpPageCount: options.chromeMcpPageCount,
    chromeMcpLastError: options.chromeMcpLastError || '',
    chromeMcpSource: options.chromeMcpSource || '',
    chromeExtensionPrepared: options.chromeExtensionPrepared,
    chromeExtensionBackendAvailable: options.chromeExtensionBackendAvailable,
    chromeExtensionBackendLastError: options.chromeExtensionBackendLastError || '',
    chromeExtensionWindowRetryAttempted: options.chromeExtensionWindowRetryAttempted,
    allowNewBackgroundTab: options.allowNewBackgroundTab ?? options['allow-new-background-tab'],
    newBackgroundUrlEnv: options.newBackgroundUrlEnv ?? options['new-background-url-env'],
    mcpObservationIn,
    chromeExtensionStatus: options.chromeExtensionStatus,
    chromeExtensionHandoff: options.chromeExtensionHandoff,
    appleEventsStatusFile: appleEventsOut,
    write: true,
    out: regularChromeOut,
    pluginDir: options.pluginDir || ''
  });

  const refresh = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    usingEverydayChrome: true,
    intent,
    status: regularChromeUse.ready ? 'ready' : 'not-ready',
    ready: regularChromeUse.ready,
    selectedLane: regularChromeUse.selectedLane,
    backend: regularChromeUse.backend,
    canRunInBackground: regularChromeUse.canRunInBackground,
    nextAction: regularChromeUse.nextAction,
    appleEvents: {
      outputPath: appleEventsStatus.outputPath || path.resolve(rootDir, 'runs', appleEventsOut),
      reachable: Boolean(appleEventsStatus.chrome?.reachable),
      activeTabObserved: Boolean(appleEventsStatus.activeTab?.observed),
      javascriptAllowed: Boolean(appleEventsStatus.javascript?.allowed),
      urlRedacted: appleEventsStatus.activeTab?.urlRedacted || '',
      nextAction: appleEventsStatus.nextAction || ''
    },
    regularChromeUse: {
      outputPath: regularChromeUse.outputPath || path.resolve(rootDir, 'runs', regularChromeOut),
      ready: regularChromeUse.ready,
      selectedLane: regularChromeUse.selectedLane,
      backend: regularChromeUse.backend,
      blockedReason: regularChromeUse.blockedReason || '',
      command: regularChromeUse.command,
      approvalCommand: regularChromeUse.approvalCommand
    },
    scope: {
      existingTabsOnly: regularChromeUse.scope.existingTabsOnly,
      newBackgroundTabsAllowed: regularChromeUse.scope.newBackgroundTabsAllowed,
      operatorRequestedTabsOnly: true,
      storedAuthenticatedScrapingAllowed: false,
      directCdpDefaultProfileAllowed: false,
      dedicatedTargetProfileRequiredForStoredAuth: true
    },
    commands: {
      status: command([
        'node', 'src/cli.mjs', 'regular-chrome-use',
        '--apple-events-status-file', appleEventsOut,
        ...mcpObservationArgs(mcpObservationIn),
        ...backgroundTabArgs(options),
        '--format', 'compact'
      ]),
      refresh: command([
        'node', 'src/cli.mjs', 'regular-chrome-refresh',
        '--intent', intent,
        ...mcpObservationArgs(mcpObservationIn),
        ...backgroundTabArgs(options),
        '--format', 'compact'
      ])
    }
  };

  return refresh;
}

export function buildRegularChromeStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds ?? options['stale-after-seconds'], 900);
  const regularChromePath = safeRunsPath(rootDir, options.in || options.input, 'operator/regular-chrome-use-latest.json', 'in');
  const appleEventsPath = safeRunsPath(rootDir, options.appleEventsIn || options['apple-events-in'], 'operator/chrome-apple-events-status-latest.json', 'apple-events-in');
  const mcpObservationIn = safeRunRelativePath(
    options.mcpObservationIn || options['mcp-observation-in'],
    'operator/chrome-mcp-observation-latest.json',
    'mcp-observation-in'
  );
  const regularChrome = readJsonStatus(regularChromePath);
  const appleEvents = readJsonStatus(appleEventsPath);
  const chromeMcpObservation = buildChromeMcpObservationStatus({
    rootDir,
    generatedAt,
    in: mcpObservationIn,
    staleAfterSeconds
  });
  const ageSeconds = regularChrome.parseOk ? ageSecondsFrom(generatedAt, regularChrome.value?.generatedAt) : null;
  const stale = ageSeconds === null ? true : ageSeconds > staleAfterSeconds;
  const saved = regularChrome.value || {};
  const savedAppleEvents = appleEvents.value || {};
  const refreshNeeded = !regularChrome.exists || !regularChrome.parseOk || stale;
  const regularChromeIn = runsRelativePath(rootDir, regularChromePath);
  const appleEventsIn = runsRelativePath(rootDir, appleEventsPath);
  const refreshCommand = command([
    'node', 'src/cli.mjs', 'regular-chrome-refresh',
    '--out', regularChromeIn,
    '--apple-events-out', appleEventsIn,
    '--mcp-observation-in', mcpObservationIn,
    ...backgroundTabArgs(options),
    '--format', 'compact'
  ]);
  const watchCommand = command([
    'node', 'src/cli.mjs', 'regular-chrome-watch',
    '--run',
    '--in', regularChromeIn,
    '--apple-events-in', appleEventsIn,
    '--mcp-observation-in', mcpObservationIn,
    ...backgroundTabArgs(options),
    '--format', 'compact'
  ]);

  return {
    schemaVersion: 1,
    generatedAt,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    usingEverydayChrome: true,
    path: regularChromePath,
    appleEventsPath,
    exists: regularChrome.exists,
    parseOk: regularChrome.parseOk,
    parseError: regularChrome.error,
    staleAfterSeconds,
    ageSeconds,
    stale,
    ready: Boolean(regularChrome.parseOk && saved.ready),
    status: !regularChrome.exists
      ? 'missing'
      : !regularChrome.parseOk
      ? 'parse-error'
      : stale
      ? 'stale'
      : saved.ready
      ? 'ready'
      : 'not-ready',
    selectedLane: regularChrome.parseOk ? saved.selectedLane || '' : '',
    backend: regularChrome.parseOk ? saved.backend || '' : '',
    canRunInBackground: Boolean(regularChrome.parseOk && saved.canRunInBackground),
    nextAction: regularChrome.parseOk ? saved.nextAction || '' : '',
    blockedReason: regularChrome.parseOk ? saved.blockedReason || '' : '',
    chromeMcp: {
      newBackgroundTabAllowed: Boolean(regularChrome.parseOk && saved.chromeMcp?.newBackgroundTabAllowed),
      newBackgroundUrlEnv: regularChrome.parseOk ? saved.chromeMcp?.newBackgroundUrlEnv || '' : '',
      newBackgroundUrlValueRead: Boolean(regularChrome.parseOk && saved.chromeMcp?.newBackgroundUrlValueRead)
    },
    appleEvents: {
      exists: appleEvents.exists,
      parseOk: appleEvents.parseOk,
      activeTabObserved: Boolean(appleEvents.parseOk && savedAppleEvents.activeTab?.observed),
      javascriptAllowed: Boolean(appleEvents.parseOk && savedAppleEvents.javascript?.allowed),
      urlRedacted: appleEvents.parseOk ? savedAppleEvents.activeTab?.urlRedacted || '' : ''
    },
    chromeMcpObservation: {
      path: chromeMcpObservation.path,
      exists: chromeMcpObservation.exists,
      parseOk: chromeMcpObservation.parseOk,
      stale: chromeMcpObservation.stale,
      status: chromeMcpObservation.status,
      ageSeconds: chromeMcpObservation.ageSeconds,
      routeReady: chromeMcpObservation.routeReady,
      observedConnected: chromeMcpObservation.observed.connected,
      observedTools: chromeMcpObservation.observed.tools,
      observedPageListOk: chromeMcpObservation.observed.pageListOk,
      observedPageCount: chromeMcpObservation.observed.pageCount,
      listPagesTimedOut: chromeMcpObservation.observed.listPagesTimedOut,
      lastError: chromeMcpObservation.observed.lastError,
      command: chromeMcpObservation.commands.status,
      recordTemplateCommand: chromeMcpObservation.commands.recordTemplate,
      regularChromeUseWriteCommand: chromeMcpObservation.commands.regularChromeUseWrite
    },
    scope: {
      existingTabsOnly: Boolean(regularChrome.parseOk && saved.scope?.existingTabsOnly),
      newBackgroundTabsAllowed: Boolean(regularChrome.parseOk && saved.scope?.newBackgroundTabsAllowed),
      storedAuthenticatedScrapingAllowed: false,
      directCdpDefaultProfileAllowed: false,
      dedicatedTargetProfileRequiredForStoredAuth: true
    },
    agentSafeNextCommandId: refreshNeeded ? 'regular-chrome-watch-refresh' : 'none',
    agentSafeNextMayRunUnattended: refreshNeeded,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand: refreshNeeded ? watchCommand : null,
    commands: {
      refresh: refreshCommand,
      watch: watchCommand,
      chromeMcpObservationStatus: chromeMcpObservation.commands.status
    }
  };
}

export async function buildRegularChromeWatch(options = {}) {
  const runRequested = Boolean(options.run);
  const force = Boolean(options.force);
  const status = buildRegularChromeStatus(options);
  const shouldRefresh = force || !status.exists || !status.parseOk || status.stale;
  const watch = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    usingEverydayChrome: true,
    runRequested,
    force,
    statusBefore: status,
    shouldRefresh,
    status: runRequested
      ? shouldRefresh ? 'completed' : 'skipped'
      : 'planned',
    refresh: null,
    command: status.commands.watch
  };

  if (runRequested && shouldRefresh) {
    try {
      const refreshOptions = {
        ...options,
        out: options.out || options.output || options.in || options.input,
        appleEventsOut: options.appleEventsOut || options['apple-events-out'] || options.appleEventsIn || options['apple-events-in']
      };
      watch.refresh = await buildRegularChromeRefresh(refreshOptions);
      watch.statusAfter = buildRegularChromeStatus(options);
      watch.status = watch.refresh.ready ? 'completed' : 'completed-not-ready';
    } catch (error) {
      watch.status = 'failed';
      watch.error = error instanceof Error ? error.message : String(error);
    }
  }

  return watch;
}

export function formatRegularChromeRefreshCompact(refresh) {
  const lines = [
    `safe_mode: ${yesNo(refresh.safeMode)}`,
    `destructive_actions: ${yesNo(refresh.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(refresh.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(refresh.opensBrowserNow)}`,
    `reads_browser_storage: ${yesNo(refresh.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(refresh.pageContentReturned)}`,
    `using_everyday_chrome: ${yesNo(refresh.usingEverydayChrome)}`,
    `intent: ${refresh.intent}`,
    `status: ${refresh.status}`,
    `ready: ${yesNo(refresh.ready)}`,
    `selected_lane: ${refresh.selectedLane}`,
    `backend: ${refresh.backend}`,
    `can_run_in_background: ${yesNo(refresh.canRunInBackground)}`,
    `next_action: ${refresh.nextAction}`,
    `apple_events_output: ${refresh.appleEvents.outputPath}`,
    `apple_events_reachable: ${yesNo(refresh.appleEvents.reachable)}`,
    `apple_events_active_tab_observed: ${yesNo(refresh.appleEvents.activeTabObserved)}`,
    `apple_events_javascript_allowed: ${yesNo(refresh.appleEvents.javascriptAllowed)}`,
    `apple_events_url_redacted: ${clean(refresh.appleEvents.urlRedacted)}`,
    `regular_chrome_use_output: ${refresh.regularChromeUse.outputPath}`,
    `existing_tabs_only: ${yesNo(refresh.scope.existingTabsOnly)}`,
    `new_background_tabs_allowed: ${yesNo(refresh.scope.newBackgroundTabsAllowed)}`,
    `operator_requested_tabs_only: ${yesNo(refresh.scope.operatorRequestedTabsOnly)}`,
    `stored_authenticated_scraping_allowed: ${yesNo(refresh.scope.storedAuthenticatedScrapingAllowed)}`,
    `direct_cdp_default_profile_allowed: ${yesNo(refresh.scope.directCdpDefaultProfileAllowed)}`,
    `dedicated_target_profile_required_for_stored_auth: ${yesNo(refresh.scope.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `status_command: ${refresh.commands.status.shell}`,
    `refresh_command: ${refresh.commands.refresh.shell}`
  ];
  if (refresh.regularChromeUse.approvalCommand) lines.push(`approval_command: ${refresh.regularChromeUse.approvalCommand.shell}`);
  if (refresh.regularChromeUse.blockedReason) lines.push(`blocked_reason: ${refresh.regularChromeUse.blockedReason}`);
  return `${lines.join('\n')}\n`;
}

export function formatRegularChromeStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `using_everyday_chrome: ${yesNo(status.usingEverydayChrome)}`,
    `status: ${status.status}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `ready: ${yesNo(status.ready)}`,
    `selected_lane: ${clean(status.selectedLane)}`,
    `backend: ${clean(status.backend)}`,
    `can_run_in_background: ${yesNo(status.canRunInBackground)}`,
    `next_action: ${clean(status.nextAction)}`,
    `existing_tabs_only: ${yesNo(status.scope.existingTabsOnly)}`,
    `new_background_tabs_allowed: ${yesNo(status.scope.newBackgroundTabsAllowed)}`,
    `chrome_mcp_new_background_tab_allowed: ${yesNo(status.chromeMcp.newBackgroundTabAllowed)}`,
    `chrome_mcp_new_background_url_env: ${clean(status.chromeMcp.newBackgroundUrlEnv)}`,
    `chrome_mcp_new_background_url_value_read: ${yesNo(status.chromeMcp.newBackgroundUrlValueRead)}`,
    `apple_events_exists: ${yesNo(status.appleEvents.exists)}`,
    `apple_events_active_tab_observed: ${yesNo(status.appleEvents.activeTabObserved)}`,
    `apple_events_javascript_allowed: ${yesNo(status.appleEvents.javascriptAllowed)}`,
    `chrome_mcp_observation_exists: ${yesNo(status.chromeMcpObservation.exists)}`,
    `chrome_mcp_observation_parse_ok: ${yesNo(status.chromeMcpObservation.parseOk)}`,
    `chrome_mcp_observation_stale: ${yesNo(status.chromeMcpObservation.stale)}`,
    `chrome_mcp_observation_status: ${clean(status.chromeMcpObservation.status)}`,
    `chrome_mcp_observation_age_seconds: ${status.chromeMcpObservation.ageSeconds ?? 'unknown'}`,
    `chrome_mcp_observation_route_ready: ${yesNo(status.chromeMcpObservation.routeReady)}`,
    `chrome_mcp_observed_connected: ${status.chromeMcpObservation.observedConnected === null ? 'unknown' : yesNo(status.chromeMcpObservation.observedConnected)}`,
    `chrome_mcp_observed_tools: ${status.chromeMcpObservation.observedTools ?? 'unknown'}`,
    `chrome_mcp_observed_page_list_ok: ${status.chromeMcpObservation.observedPageListOk === null ? 'unknown' : yesNo(status.chromeMcpObservation.observedPageListOk)}`,
    `chrome_mcp_observed_page_count: ${status.chromeMcpObservation.observedPageCount ?? 'unknown'}`,
    `chrome_mcp_observed_list_pages_timed_out: ${yesNo(status.chromeMcpObservation.listPagesTimedOut)}`,
    `stored_authenticated_scraping_allowed: ${yesNo(status.scope.storedAuthenticatedScrapingAllowed)}`,
    `direct_cdp_default_profile_allowed: ${yesNo(status.scope.directCdpDefaultProfileAllowed)}`,
    `dedicated_target_profile_required_for_stored_auth: ${yesNo(status.scope.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `agent_safe_next_command_id: ${clean(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `agent_safe_next_command: ${status.agentSafeNextCommand?.shell || 'none'}`,
    `path: ${status.path}`,
    `apple_events_path: ${status.appleEventsPath}`,
    `chrome_mcp_observation_path: ${status.chromeMcpObservation.path}`,
    `refresh_command: ${status.commands.refresh.shell}`,
    `watch_command: ${status.commands.watch.shell}`,
    `chrome_mcp_observation_status_command: ${status.commands.chromeMcpObservationStatus.shell}`
  ];
  if (status.parseError) lines.push(`parse_error: ${clean(status.parseError)}`);
  if (status.chromeMcpObservation.lastError) lines.push(`chrome_mcp_observation_last_error: ${clean(status.chromeMcpObservation.lastError)}`);
  if (status.chromeMcpObservation.regularChromeUseWriteCommand) lines.push(`chrome_mcp_regular_chrome_use_write_command: ${status.chromeMcpObservation.regularChromeUseWriteCommand.shell}`);
  if (status.blockedReason) lines.push(`blocked_reason: ${status.blockedReason}`);
  return `${lines.join('\n')}\n`;
}

export function formatRegularChromeWatchCompact(watch) {
  const lines = [
    `safe_mode: ${yesNo(watch.safeMode)}`,
    `destructive_actions: ${yesNo(watch.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(watch.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(watch.opensBrowserNow)}`,
    `reads_browser_storage: ${yesNo(watch.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(watch.pageContentReturned)}`,
    `using_everyday_chrome: ${yesNo(watch.usingEverydayChrome)}`,
    `run_requested: ${yesNo(watch.runRequested)}`,
    `force: ${yesNo(watch.force)}`,
    `status: ${watch.status}`,
    `should_refresh: ${yesNo(watch.shouldRefresh)}`,
    `status_before: ${watch.statusBefore.status}`,
    `ready_before: ${yesNo(watch.statusBefore.ready)}`,
    `stale_before: ${yesNo(watch.statusBefore.stale)}`,
    `ready_after: ${watch.statusAfter ? yesNo(watch.statusAfter.ready) : 'unknown'}`,
    `command: ${watch.command.shell}`
  ];
  if (watch.refresh) lines.push(`refresh_status: ${watch.refresh.status}`);
  if (watch.error) lines.push(`error: ${clean(watch.error)}`);
  return `${lines.join('\n')}\n`;
}
