import { buildRuntimeAudit } from './runtime-audit.mjs';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseObservedConnected(value) {
  if (value === true || value === 'yes' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  return null;
}

function parseObservedOk(value) {
  if (value === true || value === 'yes' || value === 'true' || value === 'ok' || value === 'pass') return true;
  if (value === false || value === 'no' || value === 'false' || value === 'fail' || value === 'error' || value === 'timeout') return false;
  return null;
}

function parseObservedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function countMatching(items = [], pattern) {
  return items.filter((item) => pattern.test(String(item.command || ''))).length;
}

export function buildChromeMcpStatus(options = {}) {
  const runtime = options.runtimeAudit || buildRuntimeAudit(options);
  const chromeExtension = options.chromeExtensionStatus || buildChromeExtensionStatus({ env: options.env || process.env });
  const chromeDevtoolsMcp = runtime.processBreakdown?.chromeDevtoolsMcp || {};
  const chromeDevtoolsItems = runtime.groups?.chromeDevtoolsMcp?.items || [];
  const peekaboo = runtime.processBreakdown?.peekaboo || {};
  const autoConnectWrappers = countMatching(chromeDevtoolsItems, /chrome-devtools-mcp.*--auto-connect/i);
  const browserUrl9223Wrappers = countMatching(chromeDevtoolsItems, /chrome-devtools-mcp.*--browser-?url=http:\/\/127\.0\.0\.1:9223/i);
  const observedConnected = parseObservedConnected(options.observedConnected);
  const observedTools = parseObservedNumber(options.observedTools);
  const observedPageListOk = parseObservedOk(options.observedPageListOk);
  const observedPageCount = parseObservedNumber(options.observedPageCount);
  const observedLastError = clean(options.observedLastError || '');
  const observedListPagesTimedOut = /timed out|timeout|Network\.enable/i.test(observedLastError);
  const regularChromeOpen = (runtime.chromeApp?.regularProfiles || 0) > 0;
  const extensionPrepared = Boolean(chromeExtension.decision?.everydayChromeViaCodexExtensionPrepared);
  const extensionBackendReady = Boolean(chromeExtension.decision?.everydayChromeViaCodexExtensionReady);
  const devtools9223Ok = Boolean(runtime.chromeDevtools?.endpoint?.ok);
  const mcpProcessPresent = (chromeDevtoolsMcp.total || 0) > 0;
  const autoConnectPresent = autoConnectWrappers > 0;
  const chromeDevtoolsMcpUsableForEverydayTabs = observedConnected === true && observedPageListOk === true;
  const usableForEverydayChromeTabs = chromeDevtoolsMcpUsableForEverydayTabs || extensionBackendReady;
  const status = chromeDevtoolsMcpUsableForEverydayTabs
    ? 'usable-for-operator-requested-tabs'
    : observedConnected === true && observedPageListOk === false && observedListPagesTimedOut
    ? 'mcp-connected-page-list-timeout'
    : observedConnected === true && observedPageListOk === false
    ? 'mcp-connected-page-list-failed'
    : observedConnected === true
    ? 'mcp-connected-page-list-unproved'
    : observedConnected === false
    ? 'mcp-observed-disconnected'
    : extensionBackendReady
    ? 'extension-backend-ready-mcp-unproved'
    : autoConnectPresent
    ? 'mcp-process-present-unproved'
    : extensionPrepared
    ? 'extension-prepared-unproved'
    : 'not-ready';
  const nextAction = chromeDevtoolsMcpUsableForEverydayTabs
    ? 'use-existing-tab-route-for-operator-requested-work'
    : observedConnected === true && observedPageListOk === false && observedListPagesTimedOut
    ? 'repair-chrome-devtools-permission-or-reconnect-then-list-pages'
    : observedConnected === true && observedPageListOk === false
    ? 'inspect-chrome-devtools-mcp-page-list-error'
    : observedConnected === true
    ? 'observe-peekaboo-browser-list-pages-before-use'
    : observedConnected === false
    ? 'reconnect-chrome-devtools-mcp'
    : extensionBackendReady
    ? 'use-codex-extension-route-or-prove-chrome-mcp-list-pages'
    : autoConnectPresent
    ? 'observe-peekaboo-browser-status-before-use'
    : extensionPrepared
    ? 'verify-codex-chrome-extension-backend'
    : 'prepare-chrome-control-lane';

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    observedSource: options.observedSource || '',
    observed: {
      chromeDevtoolsMcpConnected: observedConnected,
      chromeDevtoolsMcpTools: observedTools,
      chromeDevtoolsMcpPageListOk: observedPageListOk,
      chromeDevtoolsMcpPageCount: observedPageCount,
      chromeDevtoolsMcpListPagesTimedOut: observedListPagesTimedOut,
      chromeDevtoolsMcpLastError: observedLastError
    },
    processes: {
      peekabooTotal: peekaboo.total || 0,
      peekabooServers: peekaboo.parts?.server || 0,
      chromeDevtoolsMcpTotal: chromeDevtoolsMcp.total || 0,
      chromeDevtoolsMcpServers: chromeDevtoolsMcp.parts?.server || 0,
      chromeDevtoolsMcpWatchdogs: chromeDevtoolsMcp.parts?.watchdog || 0,
      chromeDevtoolsMcpAutoConnectWrappers: autoConnectWrappers,
      chromeDevtoolsMcpBrowserUrl9223Wrappers: browserUrl9223Wrappers
    },
    chrome: {
      regularProfiles: runtime.chromeApp?.regularProfiles || 0,
      regularRemoteDebugging: runtime.chromeApp?.regularProfileRemoteDebugging || 0,
      codexBrowserAgentProfiles: runtime.chromeApp?.codexBrowserAgentProfiles || 0,
      targetPackProfiles: runtime.chromeApp?.targetPackProfiles || 0,
      devtools9223Ok,
      devtools9223Browser: runtime.chromeDevtools?.endpoint?.browser || '',
      dia9222Ok: Boolean(runtime.chromeDevtools?.diaEndpoint?.ok)
    },
    codexExtension: {
      prepared: extensionPrepared,
      backendReady: extensionBackendReady
    },
    decision: {
      status,
      mcpProcessPresent,
      autoConnectPresent,
      regularChromeOpen,
      chromeDevtoolsMcpUsableForEverydayTabs,
      usableForEverydayChromeTabs,
      dedicatedTargetProfileStillRequiredForStoredAuth: true,
      reason: chromeDevtoolsMcpUsableForEverydayTabs
        ? 'Chrome DevTools MCP is connected and has successfully listed pages, so operator-requested live tab work can use the MCP lane. Stored authenticated scraping still stays on dedicated target profiles.'
        : observedConnected === true && observedPageListOk === false && observedListPagesTimedOut
        ? 'Chrome DevTools MCP is connected, but page listing timed out. Do not claim everyday Chrome is controllable until list_pages succeeds.'
        : observedConnected === true
        ? 'Chrome DevTools MCP is connected, but page listing has not been proved. Do not treat connection status alone as live tab control.'
        : extensionBackendReady
        ? 'The Codex Chrome Extension backend is ready, but Chrome DevTools MCP still needs a live status and list_pages proof before selecting the MCP lane.'
        : autoConnectPresent
        ? 'Chrome DevTools MCP auto-connect processes exist, but this CLI has not observed a live browser tool connection; do not claim everyday Chrome is controllable from process presence alone.'
        : 'Everyday Chrome is not proved controllable through a safe MCP or extension lane.'
    },
    nextAction
  };
}

export function formatChromeMcpStatusCompact(status) {
  const observed = status.observed.chromeDevtoolsMcpConnected;
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `status: ${status.decision.status}`,
    `observed_source: ${clean(status.observedSource || 'none')}`,
    `observed_chrome_devtools_mcp_connected: ${observed === null ? 'unknown' : yesNo(observed)}`,
    `observed_chrome_devtools_mcp_tools: ${status.observed.chromeDevtoolsMcpTools ?? 'unknown'}`,
    `observed_chrome_devtools_mcp_page_list_ok: ${status.observed.chromeDevtoolsMcpPageListOk === null ? 'unknown' : yesNo(status.observed.chromeDevtoolsMcpPageListOk)}`,
    `observed_chrome_devtools_mcp_page_count: ${status.observed.chromeDevtoolsMcpPageCount ?? 'unknown'}`,
    `observed_chrome_devtools_mcp_list_pages_timed_out: ${yesNo(status.observed.chromeDevtoolsMcpListPagesTimedOut)}`,
    `peekaboo_servers: ${status.processes.peekabooServers}`,
    `chrome_devtools_mcp_servers: ${status.processes.chromeDevtoolsMcpServers}`,
    `chrome_devtools_mcp_auto_connect_wrappers: ${status.processes.chromeDevtoolsMcpAutoConnectWrappers}`,
    `chrome_devtools_mcp_9223_wrappers: ${status.processes.chromeDevtoolsMcpBrowserUrl9223Wrappers}`,
    `regular_chrome_open: ${yesNo(status.decision.regularChromeOpen)}`,
    `regular_chrome_remote_debugging: ${status.chrome.regularRemoteDebugging}`,
    `devtools_9223_ok: ${yesNo(status.chrome.devtools9223Ok)}`,
    `devtools_9223_browser: ${clean(status.chrome.devtools9223Browser || 'unknown')}`,
    `codex_extension_prepared: ${yesNo(status.codexExtension.prepared)}`,
    `codex_extension_backend_ready: ${yesNo(status.codexExtension.backendReady)}`,
    `chrome_devtools_mcp_usable_for_everyday_tabs: ${yesNo(status.decision.chromeDevtoolsMcpUsableForEverydayTabs)}`,
    `usable_for_everyday_chrome_tabs: ${yesNo(status.decision.usableForEverydayChromeTabs)}`,
    `dedicated_target_profile_required: ${yesNo(status.decision.dedicatedTargetProfileStillRequiredForStoredAuth)}`,
    `next_action: ${status.nextAction}`
  ];
  if (status.observed.chromeDevtoolsMcpLastError) lines.push(`observed_chrome_devtools_mcp_last_error: ${clean(status.observed.chromeDevtoolsMcpLastError)}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeMcpStatusMarkdown(status) {
  const observed = status.observed.chromeDevtoolsMcpConnected;
  return [
    '# Chrome MCP Status',
    '',
    `Generated: ${status.generatedAt}`,
    `Safe mode: ${status.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${status.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${status.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Status: ${status.decision.status}`,
    `- Usable for everyday Chrome tabs: ${status.decision.usableForEverydayChromeTabs ? 'yes' : 'no'}`,
    `- Dedicated target profile still required for stored auth: ${status.decision.dedicatedTargetProfileStillRequiredForStoredAuth ? 'yes' : 'no'}`,
    `- Reason: ${status.decision.reason}`,
    `- Next action: ${status.nextAction}`,
    '',
    '## Observed Backend',
    '',
    `- Source: ${status.observedSource || 'none'}`,
    `- Chrome DevTools MCP connected: ${observed === null ? 'unknown' : yesNo(observed)}`,
    `- Tool count: ${status.observed.chromeDevtoolsMcpTools ?? 'unknown'}`,
    `- Page list OK: ${status.observed.chromeDevtoolsMcpPageListOk === null ? 'unknown' : yesNo(status.observed.chromeDevtoolsMcpPageListOk)}`,
    `- Page count: ${status.observed.chromeDevtoolsMcpPageCount ?? 'unknown'}`,
    `- Page list timed out: ${status.observed.chromeDevtoolsMcpListPagesTimedOut ? 'yes' : 'no'}`,
    status.observed.chromeDevtoolsMcpLastError ? `- Last error: ${status.observed.chromeDevtoolsMcpLastError}` : '',
    '',
    '## Processes',
    '',
    `- Peekaboo servers: ${status.processes.peekabooServers}`,
    `- Chrome DevTools MCP servers: ${status.processes.chromeDevtoolsMcpServers}`,
    `- Chrome DevTools MCP auto-connect wrappers: ${status.processes.chromeDevtoolsMcpAutoConnectWrappers}`,
    `- Chrome DevTools MCP 9223 wrappers: ${status.processes.chromeDevtoolsMcpBrowserUrl9223Wrappers}`,
    '',
    '## Chrome',
    '',
    `- Regular Chrome open: ${status.decision.regularChromeOpen ? 'yes' : 'no'}`,
    `- Regular Chrome remote debugging processes: ${status.chrome.regularRemoteDebugging}`,
    `- DevTools 9223 OK: ${status.chrome.devtools9223Ok ? 'yes' : 'no'}`,
    `- DevTools 9223 browser: ${status.chrome.devtools9223Browser || 'unknown'}`,
    `- Codex extension prepared: ${status.codexExtension.prepared ? 'yes' : 'no'}`,
    `- Codex extension backend ready: ${status.codexExtension.backendReady ? 'yes' : 'no'}`,
    ''
  ].join('\n');
}
