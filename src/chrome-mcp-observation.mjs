import fs from 'node:fs';
import path from 'node:path';
import { toPosixPath } from './output.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function firstLine(value) {
  return clean(String(value ?? '').split(/\r?\n/).find((line) => clean(line, '')) || '').slice(0, 180);
}

function parseConnected(text) {
  const match = String(text || '').match(/\bConnected:\s*(yes|no|true|false)\b/i);
  if (!match) return null;
  return /yes|true/i.test(match[1]);
}

function parseTools(text) {
  const match = String(text || '').match(/\bTools:\s*(\d+)\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
}

function countPages(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const idLines = lines.filter((line) => /^(?:[-*]\s*)?(?:page\s*)?#?\d+\s*[:.)-]/i.test(line));
  if (idLines.length > 0) return idLines.length;
  const urlLines = lines.filter((line) => /\b(?:https?|chrome|about):\/\//i.test(line));
  if (urlLines.length > 0) return urlLines.length;
  const jsonIds = raw.match(/"id"\s*:\s*(?:"[^"]+"|\d+)/g);
  if (jsonIds?.length) return jsonIds.length;
  return null;
}

function parsePageList(text) {
  const raw = String(text || '');
  const normalized = clean(raw, '');
  if (!normalized) {
    return {
      ok: null,
      pageCount: null,
      timedOut: false,
      error: ''
    };
  }

  const timedOut = /timed out|timeout|Network\.enable/i.test(normalized);
  const failed = timedOut || /failed|error|cannot communicate|enable browser control/i.test(normalized);
  if (failed) {
    return {
      ok: false,
      pageCount: null,
      timedOut,
      error: firstLine(normalized)
    };
  }

  if (/\bno pages\b|\b0 pages\b/i.test(normalized)) {
    return {
      ok: true,
      pageCount: 0,
      timedOut: false,
      error: ''
    };
  }

  return {
    ok: true,
    pageCount: countPages(raw),
    timedOut: false,
    error: ''
  };
}

function flagToBoolean(value) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined || value === '') return null;
  if (/^(yes|true|1)$/i.test(String(value))) return true;
  if (/^(no|false|0)$/i.test(String(value))) return false;
  return null;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/chrome-mcp-observation-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid Chrome MCP observation output path: ${outPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid Chrome MCP observation output path: ${filePath}`);
  return toPosixPath(path.relative(runsRoot, resolved));
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function statusOnlyRecordTemplateCommand(outPath = '') {
  return command([
    'node',
    'src/cli.mjs',
    'chrome-mcp-observation',
    '--observed-connected',
    '<yes|no>',
    '--observed-tools',
    '<tool-count>',
    '--source',
    'peekaboo.browser.status-normalized',
    '--write',
    ...(outPath ? ['--out', outPath] : []),
    '--format',
    'compact'
  ]);
}

export function buildChromeMcpObservation(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const statusText = options.statusText || '';
  const listPagesText = options.listPagesText || '';
  const connected = flagToBoolean(options.observedConnected ?? options.chromeMcpConnected);
  const parsedConnected = connected === null ? parseConnected(statusText) : connected;
  const tools = optionalNumber(options.observedTools ?? options.chromeMcpTools) ?? parseTools(statusText);
  const pageList = parsePageList(listPagesText);
  const pageListOk = flagToBoolean(options.observedPageListOk ?? options.chromeMcpPageListOk);
  const pageCount = optionalNumber(options.observedPageCount ?? options.chromeMcpPageCount);
  const lastError = clean(options.observedLastError ?? options.chromeMcpLastError ?? '', '');
  const listPagesTimedOut = flagToBoolean(options.observedListPagesTimedOut ?? options.chromeMcpListPagesTimedOut);
  const observedPageList = {
    ok: pageListOk === null ? pageList.ok : pageListOk,
    pageCount: pageCount ?? pageList.pageCount,
    timedOut: listPagesTimedOut === null ? pageList.timedOut : listPagesTimedOut,
    error: lastError || pageList.error
  };
  const source = options.source || [
    statusText ? 'status' : '',
    listPagesText ? 'list_pages' : '',
    connected !== null || pageListOk !== null ? 'observed-flags' : ''
  ].filter(Boolean).join('+');
  const observedConnected = parsedConnected === null ? 'unknown' : yesNo(parsedConnected);
  const observedPageListOk = observedPageList.ok === null ? 'unknown' : yesNo(observedPageList.ok);
  const statusArgs = [
    'node',
    'src/cli.mjs',
    'chrome-mcp-status',
    '--observed-connected',
    observedConnected
  ];
  if (tools !== null) statusArgs.push('--observed-tools', String(tools));
  if (observedPageList.ok !== null) statusArgs.push('--observed-page-list-ok', observedPageListOk);
  if (observedPageList.pageCount !== null) statusArgs.push('--observed-page-count', String(observedPageList.pageCount));
  if (observedPageList.error) statusArgs.push('--observed-last-error', observedPageList.error);
  if (source) statusArgs.push('--observed-source', source);
  statusArgs.push('--format', 'compact');

  const routeArgs = [
    'node',
    'src/cli.mjs',
    'browser-route',
    '--task',
    'existing-tab',
    '--chrome-mcp-connected',
    observedConnected
  ];
  if (tools !== null) routeArgs.push('--chrome-mcp-tools', String(tools));
  if (observedPageList.ok !== null) routeArgs.push('--chrome-mcp-page-list-ok', observedPageListOk);
  if (observedPageList.pageCount !== null) routeArgs.push('--chrome-mcp-page-count', String(observedPageList.pageCount));
  if (observedPageList.error) routeArgs.push('--chrome-mcp-last-error', observedPageList.error);
  if (source) routeArgs.push('--chrome-mcp-source', source);
  routeArgs.push('--format', 'compact');

  const intent = options.intent || 'inspect';
  const regularChromeUseArgs = [
    'node',
    'src/cli.mjs',
    'regular-chrome-use',
    '--intent',
    intent,
    '--chrome-mcp-connected',
    observedConnected
  ];
  if (tools !== null) regularChromeUseArgs.push('--chrome-mcp-tools', String(tools));
  if (observedPageList.ok !== null) regularChromeUseArgs.push('--chrome-mcp-page-list-ok', observedPageListOk);
  if (observedPageList.pageCount !== null) regularChromeUseArgs.push('--chrome-mcp-page-count', String(observedPageList.pageCount));
  if (observedPageList.error) regularChromeUseArgs.push('--chrome-mcp-last-error', observedPageList.error);
  if (source) regularChromeUseArgs.push('--chrome-mcp-source', source);
  regularChromeUseArgs.push('--format', 'compact');
  const regularChromeUseWriteArgs = [...regularChromeUseArgs.slice(0, -2), '--write', '--format', 'compact'];
  const handoffArgs = [
    'node',
    'src/cli.mjs',
    'chrome-mcp-handoff',
    '--chrome-mcp-connected',
    observedConnected
  ];
  if (tools !== null) handoffArgs.push('--chrome-mcp-tools', String(tools));
  if (observedPageList.ok !== null) handoffArgs.push('--chrome-mcp-page-list-ok', observedPageListOk);
  if (observedPageList.pageCount !== null) handoffArgs.push('--chrome-mcp-page-count', String(observedPageList.pageCount));
  if (observedPageList.error) handoffArgs.push('--chrome-mcp-last-error', observedPageList.error);
  if (source) handoffArgs.push('--chrome-mcp-source', source);
  handoffArgs.push('--format', 'compact');

  const observation = {
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    pageOutputTrusted: false,
    source,
    observed: {
      connected: parsedConnected,
      tools,
      pageListOk: observedPageList.ok,
      pageCount: observedPageList.pageCount,
      listPagesTimedOut: observedPageList.timedOut,
      lastError: observedPageList.error
    },
    decision: {
      routeReady: parsedConnected === true && observedPageList.ok === true,
      status: parsedConnected === true && observedPageList.ok === true
        ? 'ready-for-route'
        : parsedConnected === true && observedPageList.ok === false && observedPageList.timedOut
        ? 'page-list-timeout'
        : parsedConnected === true && observedPageList.ok === false
        ? 'page-list-failed'
        : parsedConnected === true
        ? 'page-list-unproved'
        : parsedConnected === false
        ? 'disconnected'
        : 'unknown',
      nextAction: parsedConnected === true && observedPageList.ok === true
        ? 'run-browser-route-existing-tab'
        : parsedConnected === true && observedPageList.ok === null
        ? 'run-list-pages'
        : parsedConnected === true && observedPageList.ok === false
        ? 'repair-or-reconnect-before-route'
        : 'run-status'
    },
    commands: {
      chromeMcpStatus: command(statusArgs),
      browserRoute: command(routeArgs),
      regularChromeUse: command(regularChromeUseArgs),
      regularChromeUseWrite: command(regularChromeUseWriteArgs),
      chromeMcpHandoff: command(handoffArgs)
    }
  };

  if (options.write || options.out || options.output) {
    observation.outputPath = safeRunPath(rootDir, options.out || options.output);
    writeJson(observation.outputPath, observation);
  }

  return observation;
}

export function buildChromeMcpObservationStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds ?? options['stale-after-seconds'], 900);
  const observationPath = safeRunPath(rootDir, options.in || options.input || options.observationIn);
  const saved = readJsonStatus(observationPath);
  const observation = saved.value || {};
  const ageSeconds = saved.parseOk ? ageSecondsFrom(generatedAt, observation.generatedAt) : null;
  const stale = ageSeconds === null ? true : ageSeconds > staleAfterSeconds;
  const observed = observation.observed || {};
  const decision = observation.decision || {};
  const routeReady = Boolean(saved.parseOk && decision.routeReady);
  const observationRelativePath = runsRelativePath(rootDir, observationPath);
  const needsFreshObservation = !saved.exists || !saved.parseOk || stale;

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
    pageOutputTrusted: false,
    agentSafeNextCommandId: 'none',
    agentSafeNextMayRunUnattended: false,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextBlockedReason: needsFreshObservation ? 'live-chrome-mcp-observation-required' : 'no-refresh-needed',
    agentSafeNextCommand: null,
    path: observationPath,
    exists: saved.exists,
    parseOk: saved.parseOk,
    parseError: saved.error,
    staleAfterSeconds,
    ageSeconds,
    stale,
    status: !saved.exists
      ? 'missing'
      : !saved.parseOk
      ? 'parse-error'
      : stale
      ? 'stale'
      : routeReady
      ? 'ready-for-route'
      : decision.status || 'not-ready',
    routeReady,
    source: saved.parseOk ? observation.source || '' : '',
    observed: {
      connected: saved.parseOk ? observed.connected ?? null : null,
      tools: saved.parseOk ? observed.tools ?? null : null,
      pageListOk: saved.parseOk ? observed.pageListOk ?? null : null,
      pageCount: saved.parseOk ? observed.pageCount ?? null : null,
      listPagesTimedOut: Boolean(saved.parseOk && observed.listPagesTimedOut),
      lastError: saved.parseOk ? observed.lastError || '' : ''
    },
    nextAction: saved.parseOk && !stale
      ? decision.nextAction || 'read-observation'
      : 'rerun-peekaboo-status-and-record-status-only-or-list-pages',
    commands: {
      status: command(['node', 'src/cli.mjs', 'chrome-mcp-observation-status', '--in', observationRelativePath, '--format', 'compact']),
      recordTemplate: command(['node', 'src/cli.mjs', 'chrome-mcp-observation', '--status-text', '<mcp status text>', '--list-pages-text', '<mcp list_pages text>', '--source', 'peekaboo.browser.status+list_pages', '--write', '--out', observationRelativePath, '--format', 'compact']),
      recordStatusOnlyTemplate: statusOnlyRecordTemplateCommand(observationRelativePath),
      regularChromeUseWrite: saved.parseOk && observation.commands?.regularChromeUseWrite
        ? observation.commands.regularChromeUseWrite
        : null,
      chromeMcpHandoff: saved.parseOk && observation.commands?.chromeMcpHandoff
        ? observation.commands.chromeMcpHandoff
        : command(['node', 'src/cli.mjs', 'chrome-mcp-handoff', '--mcp-observation-in', observationRelativePath, '--format', 'compact'])
    }
  };
}

export function formatChromeMcpObservationCompact(observation) {
  const lines = [
    `safe_mode: ${yesNo(observation.safeMode)}`,
    `destructive_actions: ${yesNo(observation.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(observation.secretValuesRead)}`,
    `page_output_trusted: ${yesNo(observation.pageOutputTrusted)}`,
    `source: ${clean(observation.source)}`,
    `status: ${observation.decision.status}`,
    `route_ready: ${yesNo(observation.decision.routeReady)}`,
    `observed_connected: ${observation.observed.connected === null ? 'unknown' : yesNo(observation.observed.connected)}`,
    `observed_tools: ${observation.observed.tools ?? 'unknown'}`,
    `observed_page_list_ok: ${observation.observed.pageListOk === null ? 'unknown' : yesNo(observation.observed.pageListOk)}`,
    `observed_page_count: ${observation.observed.pageCount ?? 'unknown'}`,
    `observed_list_pages_timed_out: ${yesNo(observation.observed.listPagesTimedOut)}`,
    `next_action: ${observation.decision.nextAction}`,
    `status_command: ${observation.commands.chromeMcpStatus.shell}`,
    `route_command: ${observation.commands.browserRoute.shell}`,
    `regular_chrome_use_command: ${observation.commands.regularChromeUse.shell}`,
    `regular_chrome_use_write_command: ${observation.commands.regularChromeUseWrite.shell}`,
    `chrome_mcp_handoff_command: ${observation.commands.chromeMcpHandoff.shell}`
  ];
  if (observation.observed.lastError) lines.push(`observed_last_error: ${clean(observation.observed.lastError)}`);
  if (observation.outputPath) lines.push(`output: ${observation.outputPath}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeMcpObservationStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `page_output_trusted: ${yesNo(status.pageOutputTrusted)}`,
    `agent_safe_next_command_id: ${clean(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `agent_safe_next_blocked_reason: ${clean(status.agentSafeNextBlockedReason)}`,
    `status: ${status.status}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `route_ready: ${yesNo(status.routeReady)}`,
    `source: ${clean(status.source)}`,
    `observed_connected: ${status.observed.connected === null ? 'unknown' : yesNo(status.observed.connected)}`,
    `observed_tools: ${status.observed.tools ?? 'unknown'}`,
    `observed_page_list_ok: ${status.observed.pageListOk === null ? 'unknown' : yesNo(status.observed.pageListOk)}`,
    `observed_page_count: ${status.observed.pageCount ?? 'unknown'}`,
    `observed_list_pages_timed_out: ${yesNo(status.observed.listPagesTimedOut)}`,
    `next_action: ${clean(status.nextAction)}`,
    `path: ${status.path}`,
    `status_command: ${status.commands.status.shell}`,
    `record_template_command: ${status.commands.recordTemplate.shell}`,
    `record_status_only_template_command: ${status.commands.recordStatusOnlyTemplate.shell}`
  ];
  if (status.observed.lastError) lines.push(`observed_last_error: ${clean(status.observed.lastError)}`);
  if (status.commands.regularChromeUseWrite) lines.push(`regular_chrome_use_write_command: ${status.commands.regularChromeUseWrite.shell}`);
  if (status.commands.chromeMcpHandoff) lines.push(`chrome_mcp_handoff_command: ${status.commands.chromeMcpHandoff.shell}`);
  if (status.parseError) lines.push(`parse_error: ${clean(status.parseError)}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeMcpObservationMarkdown(observation) {
  return [
    '# Chrome MCP Observation',
    '',
    `Generated: ${observation.generatedAt}`,
    `Safe mode: ${observation.safeMode ? 'yes' : 'no'}`,
    `Secret values read: ${observation.secretValuesRead ? 'yes' : 'no'}`,
    `Page output trusted: ${observation.pageOutputTrusted ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Status: ${observation.decision.status}`,
    `- Route ready: ${observation.decision.routeReady ? 'yes' : 'no'}`,
    `- Next action: ${observation.decision.nextAction}`,
    '',
    '## Observed',
    '',
    `- Connected: ${observation.observed.connected === null ? 'unknown' : yesNo(observation.observed.connected)}`,
    `- Tools: ${observation.observed.tools ?? 'unknown'}`,
    `- Page list OK: ${observation.observed.pageListOk === null ? 'unknown' : yesNo(observation.observed.pageListOk)}`,
    `- Page count: ${observation.observed.pageCount ?? 'unknown'}`,
    `- List pages timed out: ${observation.observed.listPagesTimedOut ? 'yes' : 'no'}`,
    observation.observed.lastError ? `- Last error: ${observation.observed.lastError}` : '',
    '',
    '## Commands',
    '',
    `- Status: ${observation.commands.chromeMcpStatus.shell}`,
    `- Route: ${observation.commands.browserRoute.shell}`,
    `- Regular Chrome use: ${observation.commands.regularChromeUse.shell}`,
    `- Save regular Chrome use: ${observation.commands.regularChromeUseWrite.shell}`,
    `- Chrome MCP handoff: ${observation.commands.chromeMcpHandoff.shell}`,
    ''
  ].filter((line) => line !== '').join('\n');
}
