import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildAgentWorkflow } from './agent-workflow.mjs';
import { sanitizeLogLine } from './policy.mjs';
import { publicSearchHttp } from './public-search-http.mjs';
import { toPosixPath } from './output.mjs';

const ALLOWED_COMMAND_IDS = new Set([
  'public-search',
  'observe',
  'inspect',
  'analyze',
  'scrape',
  'search',
  'screenshot',
  'diagnose',
  'crawl',
  'links',
  'auth-check-before-observe',
  'auth-check-before-inspect',
  'auth-check-before-analyze',
  'auth-check-before-scrape',
  'auth-check-before-operate',
  'auth-check-before-search',
  'auth-check-before-screenshot',
  'auth-check-before-diagnose',
  'auth-check-before-crawl',
  'auth-check-before-links',
  'proof-plan',
  'browser-route',
  'regular-chrome-use'
]);

const AUTH_GATE_SAFE_COMMAND_IDS = new Set([
  'auth-check-before-observe',
  'auth-check-before-inspect',
  'auth-check-before-analyze',
  'auth-check-before-scrape',
  'auth-check-before-operate',
  'auth-check-before-search',
  'auth-check-before-screenshot',
  'auth-check-before-diagnose',
  'auth-check-before-crawl',
  'auth-check-before-links',
  'proof-plan',
  'browser-route'
]);

const STATUS_COMMAND_BY_TASK = new Map([
  ['search', 'searchStatus'],
  ['observe', 'observeStatus'],
  ['inspect', 'inspectStatus'],
  ['analyze', 'analyzeStatus'],
  ['scrape', 'scrapeStatus'],
  ['operate', 'operateStatus'],
  ['screenshot', 'screenshotStatus'],
  ['diagnose', 'diagnoseStatus'],
  ['crawl', 'crawlStatus'],
  ['links', 'linksStatus']
]);

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function operatorApprovalReasons(route = {}) {
  const reasons = route.operatorApprovalReasons || [];
  if (Array.isArray(reasons) && reasons.length) return reasons;
  const next = [];
  if (route.operatorInput) next.push('operator-input');
  if (route.captureBlocked) next.push('capture-blocked');
  if (route.commandOpensBrowser) next.push('command-opens-browser');
  if (route.approvalCommandOpensBrowser) next.push('approval-command-opens-browser');
  return next;
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

function linePreview(text, maxLines = 20) {
  return String(text || '').split(/\r?\n/).filter(Boolean).slice(0, maxLines);
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/agent-task-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent task output path: ${outPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent task output path: ${filePath}`);
  return toPosixPath(path.relative(runsRoot, resolved));
}

function safeStatusPath(rootDir, inputPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(inputPath || 'operator/agent-task-latest.json').replace(/^[/\\]+/, '');
  const filePath = path.resolve(runsRoot, relative);
  const insideRuns = filePath === runsRoot || filePath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent task status input path: ${inputPath}`);
  return filePath;
}

function fileAgeSeconds(filePath, nowMs) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return Math.max(0, Math.round((nowMs - stat.mtimeMs) / 1000));
}

function safeRunsPath(rootDir, value, defaultValue, label) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(value || defaultValue).replace(/^[/\\]+/, '');
  const filePath = path.resolve(runsRoot, relative);
  const insideRuns = filePath === runsRoot || filePath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent task watch ${label}: ${value}`);
  return filePath;
}

function processAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function existingPidStatus(rootDir, pidPath) {
  const filePath = safeRunsPath(rootDir, pidPath, 'operator/agent-task-watch.pid', 'pid-path');
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath,
      pid: null,
      running: false
    };
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const pid = Number(raw);
  const valid = Number.isInteger(pid) && pid > 0;
  return {
    exists: true,
    path: filePath,
    pid: valid ? pid : null,
    running: valid ? processAlive(pid) : false,
    parseError: valid ? '' : `invalid pid: ${raw}`
  };
}

function readLogFile(rootDir, logPath, nowMs, maxLines = 10) {
  const filePath = safeRunsPath(rootDir, logPath, 'operator/agent-task-watch.log', 'log-path');
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath,
      ageSeconds: null,
      lineCount: 0,
      tail: []
    };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return {
    exists: true,
    path: filePath,
    ageSeconds: fileAgeSeconds(filePath, nowMs),
    lineCount: lines.length,
    tail: lines.slice(-Math.max(0, Number(maxLines) || 0)).map(sanitizeLogLine)
  };
}

function defaultRunner(command, options = {}) {
  const args = command?.args || [];
  if (args.length === 0) throw new Error('agent task command has no args');
  const result = spawnSync(args[0], args.slice(1), {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    env: options.env || process.env
  });
  return {
    status: result.status,
    signal: result.signal || '',
    error: result.error ? result.error.message : '',
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function commandShapeAllowed(command) {
  const args = command?.args || [];
  return args[0] === 'node' && args[1] === 'src/cli.mjs';
}

function agentTaskCommandAllowed(commandValue) {
  const args = commandValue?.args || [];
  return args[0] === 'node' && args[1] === 'src/cli.mjs' && args[2] === 'agent-task';
}

function targetAuthWatchCommandAllowed(commandValue) {
  const args = commandValue?.args || [];
  if (!(args[0] === 'node' && args[1] === 'src/cli.mjs' && args[2] === 'target-auth-watch')) return false;
  if (args.length < 4 || !args[3] || String(args[3]).startsWith('-')) return false;
  if (args.includes('--run')) return false;
  const allowedOptions = new Set(['--handoff', '--status-out', '--timeout-ms', '--interval-ms', '--format']);
  for (let index = 4; index < args.length; index += 2) {
    const option = args[index];
    if (!allowedOptions.has(option)) return false;
    if (index + 1 >= args.length || String(args[index + 1]).startsWith('--')) return false;
  }
  return true;
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

function commandWithProvider(commandValue, provider) {
  return command(replaceOption(commandValue?.args || [], '--provider', provider));
}

function appendOption(args, option, value) {
  if (value === undefined || value === null || value === '') return args;
  return [...args, option, String(value)];
}

function taskCommand(args, options = {}) {
  let next = [...args];
  next = appendOption(next, '--target-dir', options.targetDir || options['target-dir']);
  next = appendOption(next, '--query', options.query);
  next = appendOption(next, '--provider', options.provider);
  next = appendOption(next, '--search-providers', options.searchProviders || options['search-providers']);
  next = appendOption(next, '--intent', options.intent);
  next = appendOption(next, '--match-title', options.matchTitle);
  next = appendOption(next, '--match-url', options.matchUrl);
  next = appendOption(next, '--match-origin', options.matchOrigin);
  next = appendOption(next, '--match-path', options.matchPath);
  next = appendOption(next, '--tab-index', options.tabIndex);
  next = appendOption(next, '--chrome-mcp-connected', options.chromeMcpConnected);
  next = appendOption(next, '--chrome-mcp-tools', options.chromeMcpTools);
  next = appendOption(next, '--chrome-mcp-page-list-ok', options.chromeMcpPageListOk);
  next = appendOption(next, '--chrome-mcp-page-count', options.chromeMcpPageCount);
  next = appendOption(next, '--chrome-mcp-last-error', options.chromeMcpLastError);
  next = appendOption(next, '--chrome-mcp-source', options.chromeMcpSource);
  next = appendOption(next, '--mcp-observation-in', options.mcpObservationIn || options['mcp-observation-in']);
  next = appendOption(next, '--allow-new-background-tab', options.allowNewBackgroundTab);
  next = appendOption(next, '--new-background-url-env', options.newBackgroundUrlEnv);
  next = appendOption(next, '--chrome-extension-prepared', options.chromeExtensionPrepared);
  next = appendOption(next, '--chrome-extension-backend-available', options.chromeExtensionBackendAvailable);
  next = appendOption(next, '--chrome-extension-backend-last-error', options.chromeExtensionBackendLastError);
  return command(next);
}

function selectedStatusCommandForTask(task, workflow) {
  const key = STATUS_COMMAND_BY_TASK.get(String(task || ''));
  return key ? workflow?.commands?.[key] || null : null;
}

function inputRelativePath(rootDir, inputPath) {
  return runsRelativePath(rootDir, safeStatusPath(rootDir, inputPath));
}

function searchProviders(primary, override = '') {
  const requested = String(override || '').split(',').map((item) => item.trim()).filter(Boolean);
  const base = requested.length ? requested : [primary || 'duckduckgo', 'brave', 'google', 'duckduckgo'];
  return Array.from(new Set(base.filter((provider) => ['duckduckgo', 'brave', 'google'].includes(provider))));
}

function positiveInteger(value, fallback) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function searchSignal(stdout) {
  try {
    const parsed = JSON.parse(stdout || '{}');
    const search = parsed.search || {};
    return {
      parsed: true,
      provider: search.provider || '',
      challenge: Boolean(search.challenge),
      resultLinks: Number(search.resultLinks || 0),
      usable: Boolean(!search.challenge && Number(search.resultLinks || 0) > 0)
    };
  } catch {
    return {
      parsed: false,
      provider: '',
      challenge: false,
      resultLinks: 0,
      usable: null
    };
  }
}

function keyValueLines(text) {
  const entries = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (match) entries.set(match[1], match[2].trim());
  }
  return entries;
}

function parseBooleanText(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['yes', 'true', '1', 'ok'].includes(text)) return true;
  if (['no', 'false', '0'].includes(text)) return false;
  return null;
}

function authPreflightSignal(stdout) {
  const lines = keyValueLines(stdout);
  const ok = parseBooleanText(lines.get('ok') ?? lines.get('auth_check_ok'));
  const loginLike = parseBooleanText(lines.get('login_like'));
  const sameOrigin = parseBooleanText(lines.get('same_origin'));
  const nextAction = lines.get('next_action') || '';
  const parsed = ok !== null || loginLike !== null || sameOrigin !== null || Boolean(nextAction);
  return {
    parsed,
    ok,
    loginLike,
    sameOrigin,
    nextAction
  };
}

function isAuthPreflightCommandId(commandId) {
  return String(commandId || '').startsWith('auth-check-before-');
}

function authPreflightWatchCommand(targetDir, options = {}) {
  if (!targetDir) return null;
  return command([
    'node',
    'src/cli.mjs',
    'target-auth-watch',
    targetDir,
    '--handoff',
    options.handoff || options.handoffPath || 'operator-handoff.json',
    '--status-out',
    options.authWatchOut || options['auth-watch-out'] || options.authWatchIn || options['auth-watch-in'] || 'auth-watch-status.json',
    '--timeout-ms',
    String(options.monitorTimeoutMs || options['monitor-timeout-ms'] || 300000),
    '--interval-ms',
    String(options.monitorIntervalMs || options['monitor-interval-ms'] || 5000),
    '--format',
    'compact'
  ]);
}

function authPreflightResumeStatusCommand(targetDir, options = {}) {
  if (!targetDir) return null;
  const args = [
    'node',
    'src/cli.mjs',
    'target-handoff-resume-status',
    targetDir,
    '--handoff',
    options.handoff || options.handoffPath || 'operator-handoff.json'
  ];
  if (options.monitorTimeoutMs || options['monitor-timeout-ms']) args.push('--monitor-timeout-ms', String(options.monitorTimeoutMs || options['monitor-timeout-ms']));
  if (options.monitorIntervalMs || options['monitor-interval-ms']) args.push('--monitor-interval-ms', String(options.monitorIntervalMs || options['monitor-interval-ms']));
  args.push('--format', 'compact');
  return command(args);
}

function runPublicSearchWithFallback(sourceCommand, options = {}) {
  const providers = searchProviders(options.provider, options.searchProviders || options['search-providers']);
  const attempts = [];
  let selected = null;
  for (const provider of providers) {
    const nextCommand = commandWithProvider(sourceCommand, provider);
    const child = (options.runner || defaultRunner)(nextCommand, {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      env: options.env || process.env
    });
    const signal = searchSignal(child.stdout);
    const attempt = {
      provider,
      command: nextCommand,
      status: child.status,
      signal: child.signal || '',
      error: child.error || '',
      stdout: child.stdout || '',
      stderr: child.stderr || '',
      searchParsed: signal.parsed,
      searchChallenge: signal.challenge,
      searchResultLinks: signal.resultLinks,
      searchUsable: signal.usable
    };
    attempts.push(attempt);
    if (child.status === 0 && !child.error && signal.usable !== false) {
      selected = attempt;
      break;
    }
  }
  return {
    selected: selected || attempts[attempts.length - 1] || null,
    attempts
  };
}

async function runHttpSearchFallback(options = {}) {
  const output = await publicSearchHttp(options.query || '', {
    provider: 'duckduckgo',
    limit: Number(options.searchLimit || options['search-limit'] || 10),
    fetcher: options.fetcher
  });
  const stdout = `${JSON.stringify(output, null, 2)}\n`;
  const signal = searchSignal(stdout);
  return {
    provider: 'duckduckgo-http',
    command: command(['node', 'src/cli.mjs', 'search-http', options.query || '', '--provider', 'duckduckgo']),
    status: 0,
    signal: '',
    error: '',
    stdout,
    stderr: '',
    searchParsed: signal.parsed,
    searchChallenge: signal.challenge,
    searchResultLinks: signal.resultLinks,
    searchUsable: signal.usable
  };
}

function executionGate(plan) {
  const commandId = plan.recommendedCommandId || '';
  const command = plan.recommendedCommand || null;
  if (!command) return { allowed: false, reason: 'no-recommended-command' };
  if (!ALLOWED_COMMAND_IDS.has(commandId)) return { allowed: false, reason: 'command-id-not-allowed' };
  if (!commandShapeAllowed(command)) return { allowed: false, reason: 'command-shape-not-allowed' };
  if (plan.route.commandOpensBrowser || plan.route.approvalCommandOpensBrowser) {
    return { allowed: false, reason: 'opens-browser-or-needs-approval-browser-open' };
  }
  if (plan.route.captureBlocked && plan.target.available && !AUTH_GATE_SAFE_COMMAND_IDS.has(commandId)) {
    return { allowed: false, reason: 'target-auth-gate-blocked' };
  }
  if (plan.route.operatorInput && plan.target.available && !AUTH_GATE_SAFE_COMMAND_IDS.has(commandId)) {
    return { allowed: false, reason: 'operator-input-required' };
  }
  return { allowed: true, reason: '' };
}

export async function buildAgentTask(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const write = Boolean(options.write);
  const timeoutMs = Number(options.timeoutMs || options['timeout-ms'] || 120000);
  const plannedOutputPath = safeRunPath(rootDir, options.out || options.output);
  const plannedOutputRelative = runsRelativePath(rootDir, plannedOutputPath);
  const outputPath = write ? plannedOutputPath : '';
  const workflow = options.workflow || await buildAgentWorkflow({
    ...options,
    rootDir,
    generatedAt
  });
  const gate = executionGate(workflow);
  const routeApprovalReasons = operatorApprovalReasons(workflow.route);
  const routeOperatorApprovalRequired = Boolean(workflow.route?.operatorApprovalRequired) || routeApprovalReasons.length > 0;
  const selectedCommand = workflow.recommendedCommand || null;
  const selectedStatusCommand = selectedStatusCommandForTask(workflow.task, workflow);
  const authPreflightChecked = isAuthPreflightCommandId(workflow.recommendedCommandId);
  const authPreflightWatch = authPreflightChecked ? authPreflightWatchCommand(workflow.target?.dir, options) : null;
  const authPreflightResumeStatus = authPreflightChecked ? authPreflightResumeStatusCommand(workflow.target?.dir, options) : null;
  const result = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    runRequested: run,
    writeRequested: write,
    executed: false,
    status: run ? (gate.allowed ? 'ready-to-run' : 'blocked') : 'planned',
    task: workflow.task,
    query: workflow.query,
    target: workflow.target,
    route: workflow.route,
    recommendedCommandId: workflow.recommendedCommandId,
    selectedCommand,
    selectedStatusCommand,
    executionAllowed: gate.allowed,
    agentUnattendedAllowed: gate.allowed,
    selectedCommandUnattendedAllowed: gate.allowed,
    routeOperatorApprovalRequired,
    routeOperatorApprovalReasons: routeApprovalReasons,
    blockedReason: gate.reason,
    exitStatus: null,
    signal: '',
    error: '',
    stdoutPreview: [],
    stderrPreview: [],
    searchFallbackUsed: false,
    searchProvider: '',
    searchUsable: null,
    searchChallenge: null,
    searchResultLinks: null,
    searchAttempts: [],
    authPreflightChecked,
    authPreflightParsed: false,
    authPreflightOk: null,
    authPreflightLoginLike: null,
    authPreflightSameOrigin: null,
    authPreflightNextAction: '',
    authPreflightWatchCommand: authPreflightWatch,
    authPreflightResumeStatusCommand: authPreflightResumeStatus,
    outputPath,
    outputRelative: write ? plannedOutputRelative : '',
    writeCommand: taskCommand(['node', 'src/cli.mjs', 'agent-task', '--write', '--out', plannedOutputRelative, '--task', workflow.task, '--format', 'compact'], {
      targetDir: options.targetDir || options['target-dir'],
      query: workflow.query,
      provider: workflow.provider,
      searchProviders: options.searchProviders || options['search-providers'],
      intent: options.intent,
      matchTitle: options.matchTitle,
      matchUrl: options.matchUrl,
      matchOrigin: options.matchOrigin,
      matchPath: options.matchPath,
      tabIndex: options.tabIndex,
      chromeMcpConnected: options.chromeMcpConnected,
      chromeMcpTools: options.chromeMcpTools,
      chromeMcpPageListOk: options.chromeMcpPageListOk,
      chromeMcpPageCount: options.chromeMcpPageCount,
      chromeMcpLastError: options.chromeMcpLastError,
      chromeMcpSource: options.chromeMcpSource,
      mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in'],
      allowNewBackgroundTab: options.allowNewBackgroundTab,
      newBackgroundUrlEnv: options.newBackgroundUrlEnv,
      chromeExtensionPrepared: options.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: options.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: options.chromeExtensionBackendLastError
    }),
    runCommand: taskCommand(['node', 'src/cli.mjs', 'agent-task', '--run', '--write', '--out', plannedOutputRelative, '--task', workflow.task, '--timeout-ms', String(timeoutMs), '--format', 'compact'], {
      targetDir: options.targetDir || options['target-dir'],
      query: workflow.query,
      provider: workflow.provider,
      searchProviders: options.searchProviders || options['search-providers'],
      intent: options.intent,
      matchTitle: options.matchTitle,
      matchUrl: options.matchUrl,
      matchOrigin: options.matchOrigin,
      matchPath: options.matchPath,
      tabIndex: options.tabIndex,
      chromeMcpConnected: options.chromeMcpConnected,
      chromeMcpTools: options.chromeMcpTools,
      chromeMcpPageListOk: options.chromeMcpPageListOk,
      chromeMcpPageCount: options.chromeMcpPageCount,
      chromeMcpLastError: options.chromeMcpLastError,
      chromeMcpSource: options.chromeMcpSource,
      mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in'],
      allowNewBackgroundTab: options.allowNewBackgroundTab,
      newBackgroundUrlEnv: options.newBackgroundUrlEnv,
      chromeExtensionPrepared: options.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: options.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: options.chromeExtensionBackendLastError
    }),
    workflow
  };

  if (run && gate.allowed) {
    const searchFallback = workflow.recommendedCommandId === 'public-search'
      ? runPublicSearchWithFallback(selectedCommand, {
        ...options,
        cwd: rootDir,
        timeoutMs,
        provider: workflow.provider
      })
      : null;
    let child = searchFallback?.selected || (options.runner || defaultRunner)(selectedCommand, {
      cwd: rootDir,
      timeoutMs,
      env: options.env || process.env
    });
    if (searchFallback && child?.searchUsable === false && options.httpFallback !== false) {
      child = await runHttpSearchFallback({
        ...options,
        query: workflow.query
      });
      searchFallback.attempts.push(child);
    }
    result.executed = true;
    if (searchFallback) {
      result.selectedCommand = child.command || selectedCommand;
      result.searchFallbackUsed = searchFallback.attempts.length > 1;
      result.searchProvider = child.provider || '';
      result.searchUsable = child.searchUsable;
      result.searchChallenge = child.searchChallenge;
      result.searchResultLinks = child.searchResultLinks;
      result.searchAttempts = searchFallback.attempts.map((attempt) => ({
        provider: attempt.provider,
        status: attempt.status,
        searchParsed: attempt.searchParsed,
        searchChallenge: attempt.searchChallenge,
        searchResultLinks: attempt.searchResultLinks,
        searchUsable: attempt.searchUsable
      }));
    }
    if (isAuthPreflightCommandId(workflow.recommendedCommandId)) {
      const authPreflight = authPreflightSignal(child.stdout);
      result.authPreflightParsed = authPreflight.parsed;
      result.authPreflightOk = authPreflight.ok;
      result.authPreflightLoginLike = authPreflight.loginLike;
      result.authPreflightSameOrigin = authPreflight.sameOrigin;
      result.authPreflightNextAction = authPreflight.nextAction;
    }
    result.exitStatus = child.status;
    result.signal = child.signal || '';
    result.error = child.error || '';
    result.stdoutPreview = linePreview(child.stdout, Number(options.stdoutPreviewLines || 20));
    result.stderrPreview = linePreview(child.stderr, Number(options.stderrPreviewLines || 20));
    result.status = child.status === 0 && !child.error
      ? result.authPreflightParsed && result.authPreflightOk === false
        ? 'auth-pending'
        : result.authPreflightParsed && result.authPreflightOk === true
          ? 'auth-ready'
          : searchFallback && child.searchUsable === false
        ? 'degraded'
        : 'executed'
      : 'failed';
  }

  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }

  return result;
}

function recommendedTaskCommand({ exists, stale, parseError, saved, refreshCommand, runCommand, authWatchCommand }) {
  if (!exists || stale || parseError) {
    return {
      id: 'refresh-agent-task',
      command: refreshCommand
    };
  }
  if (
    authWatchCommand
    && saved?.authPreflightChecked
    && (saved?.status === 'auth-pending' || saved?.authPreflightOk === false)
  ) {
    return {
      id: 'monitor-auth-preflight',
      command: authWatchCommand
    };
  }
  if (saved?.runRequested && !saved?.executed && saved?.executionAllowed && runCommand) {
    return {
      id: 'run-agent-task',
      command: runCommand
    };
  }
  return {
    id: 'refresh-agent-task',
    command: refreshCommand
  };
}

function agentSafeNextForTaskStatus(recommendation = {}) {
  const isRefresh = recommendation.id === 'refresh-agent-task';
  return {
    agentSafeNextCommandId: isRefresh ? 'agent-task-refresh' : 'none',
    agentSafeNextMayRunUnattended: isRefresh,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand: isRefresh ? recommendation.command : null
  };
}

export function buildAgentTaskStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const nowMs = options.nowMs ?? Date.parse(generatedAt);
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? 900);
  const filePath = safeStatusPath(rootDir, options.in || options.input || options.path);
  const relativePath = runsRelativePath(rootDir, filePath);
  const refreshCommand = taskCommand(['node', 'src/cli.mjs', 'agent-task', '--write', '--out', relativePath, '--format', 'compact'], {
    mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
  });
  const runCommand = taskCommand(['node', 'src/cli.mjs', 'agent-task', '--run', '--write', '--out', relativePath, '--timeout-ms', String(options.timeoutMs || 120000), '--format', 'compact'], {
    mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
  });
  const base = {
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    statusOnly: true,
    path: filePath,
    exists: false,
    parseError: '',
    ageSeconds: null,
    staleAfterSeconds,
    stale: true,
    taskStatus: 'none',
    task: 'none',
    queryPresent: false,
    targetAvailable: false,
    targetName: '',
    targetDir: '',
    routeLane: '',
    routeBackend: '',
    runRequested: false,
    writeRequested: false,
    executed: false,
    executionAllowed: false,
    agentUnattendedAllowed: false,
    selectedCommandUnattendedAllowed: false,
    routeOperatorApprovalRequired: false,
    routeOperatorApprovalReasons: [],
    blockedReason: 'no-saved-task',
    opensBrowserNow: false,
    startsCaptureNow: false,
    recommendedCommandId: 'refresh-agent-task',
    selectedCommandId: '',
    selectedStatusCommand: null,
    exitStatus: null,
    signal: '',
    error: '',
    searchProvider: '',
    searchUsable: null,
    searchChallenge: null,
    searchResultLinks: null,
    searchAttemptCount: 0,
    authPreflightChecked: false,
    authPreflightParsed: false,
    authPreflightOk: null,
    authPreflightLoginLike: null,
    authPreflightSameOrigin: null,
    authPreflightNextAction: '',
    authPreflightWatchCommand: null,
    authPreflightResumeStatusCommand: null,
    refreshCommand,
    runCommand,
    recommendedCommand: refreshCommand,
    ...agentSafeNextForTaskStatus({ id: 'refresh-agent-task', command: refreshCommand })
  };

  if (!fs.existsSync(filePath)) return base;

  const ageSeconds = fileAgeSeconds(filePath, Number.isFinite(nowMs) ? nowMs : Date.now());
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const recommendation = recommendedTaskCommand({
      exists: true,
      stale: true,
      parseError: error.message,
      saved: null,
      refreshCommand,
      runCommand
    });
    return {
      ...base,
      exists: true,
      parseError: error.message,
      ageSeconds,
      stale: true,
      taskStatus: 'parse-error',
      blockedReason: 'parse-error',
      recommendedCommandId: recommendation.id,
      recommendedCommand: recommendation.command,
      ...agentSafeNextForTaskStatus(recommendation)
    };
  }

  const stale = ageSeconds === null || ageSeconds > staleAfterSeconds;
  const savedRefreshCommand = saved.writeCommand || refreshCommand;
  const savedRunCommand = saved.runCommand || runCommand;
  const savedAuthPreflightChecked = Boolean(saved.authPreflightChecked);
  const savedTargetDir = saved.target?.dir || '';
  const savedAuthPreflightWatchCommand = saved.authPreflightWatchCommand || (savedAuthPreflightChecked ? authPreflightWatchCommand(savedTargetDir, options) : null);
  const savedAuthPreflightResumeStatusCommand = saved.authPreflightResumeStatusCommand || (savedAuthPreflightChecked ? authPreflightResumeStatusCommand(savedTargetDir, options) : null);
  const recommendation = recommendedTaskCommand({
    exists: true,
    stale,
    parseError: '',
    saved,
    refreshCommand: savedRefreshCommand,
    runCommand: savedRunCommand,
    authWatchCommand: savedAuthPreflightWatchCommand
  });
  return {
    ...base,
    exists: true,
    ageSeconds,
    stale,
    taskStatus: saved.status || 'unknown',
    task: saved.task || 'none',
    queryPresent: Boolean(saved.query),
    targetAvailable: Boolean(saved.target?.available),
    targetName: saved.target?.name || '',
    targetDir: saved.target?.dir || '',
    routeLane: saved.route?.selectedLane || '',
    routeBackend: saved.route?.backend || '',
    runRequested: Boolean(saved.runRequested),
    writeRequested: Boolean(saved.writeRequested),
    executed: Boolean(saved.executed),
    executionAllowed: Boolean(saved.executionAllowed),
    agentUnattendedAllowed: Boolean(saved.agentUnattendedAllowed),
    selectedCommandUnattendedAllowed: Boolean(saved.selectedCommandUnattendedAllowed),
    routeOperatorApprovalRequired: Boolean(saved.routeOperatorApprovalRequired),
    routeOperatorApprovalReasons: Array.isArray(saved.routeOperatorApprovalReasons) ? saved.routeOperatorApprovalReasons : [],
    blockedReason: saved.blockedReason || '',
    opensBrowserNow: Boolean(saved.opensBrowserNow),
    startsCaptureNow: Boolean(saved.startsCaptureNow),
    recommendedCommandId: recommendation.id,
    selectedCommandId: saved.recommendedCommandId || '',
    selectedStatusCommand: saved.selectedStatusCommand || selectedStatusCommandForTask(saved.task, saved.workflow),
    exitStatus: saved.exitStatus ?? null,
    signal: saved.signal || '',
    error: saved.error || '',
    searchProvider: saved.searchProvider || '',
    searchUsable: saved.searchUsable ?? null,
    searchChallenge: saved.searchChallenge ?? null,
    searchResultLinks: saved.searchResultLinks ?? null,
    searchAttemptCount: Array.isArray(saved.searchAttempts) ? saved.searchAttempts.length : 0,
    authPreflightChecked: savedAuthPreflightChecked,
    authPreflightParsed: Boolean(saved.authPreflightParsed),
    authPreflightOk: saved.authPreflightOk ?? null,
    authPreflightLoginLike: saved.authPreflightLoginLike ?? null,
    authPreflightSameOrigin: saved.authPreflightSameOrigin ?? null,
    authPreflightNextAction: saved.authPreflightNextAction || '',
    authPreflightWatchCommand: savedAuthPreflightWatchCommand,
    authPreflightResumeStatusCommand: savedAuthPreflightResumeStatusCommand,
    refreshCommand: savedRefreshCommand,
    runCommand: savedRunCommand,
    recommendedCommand: recommendation.command,
    ...agentSafeNextForTaskStatus(recommendation)
  };
}

export function buildAgentTaskWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const timeoutMs = Number(options.timeoutMs || options['timeout-ms'] || 120000);
  const status = buildAgentTaskStatus({
    ...options,
    rootDir,
    generatedAt,
    timeoutMs
  });
  const selectedCommand = status.recommendedCommand || null;
  const commandAllowed = status.recommendedCommandId === 'monitor-auth-preflight'
    ? targetAuthWatchCommandAllowed(selectedCommand)
    : ['refresh-agent-task', 'run-agent-task'].includes(status.recommendedCommandId) && agentTaskCommandAllowed(selectedCommand);
  const allowedToRun = Boolean(
    selectedCommand
    && commandAllowed
  );
  const watch = {
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    runRequested: run,
    executed: false,
    status: run ? (allowedToRun ? 'ready-to-run' : 'blocked') : 'planned',
    statusOnly: false,
    taskStatus: status.taskStatus,
    task: status.task,
    stale: status.stale,
    exists: status.exists,
    recommendedCommandId: status.recommendedCommandId,
    selectedCommand,
    allowedToRun,
    agentUnattendedAllowed: status.agentUnattendedAllowed,
    selectedCommandUnattendedAllowed: status.selectedCommandUnattendedAllowed,
    routeOperatorApprovalRequired: status.routeOperatorApprovalRequired,
    routeOperatorApprovalReasons: status.routeOperatorApprovalReasons || [],
    blockedReason: allowedToRun ? '' : !selectedCommand ? 'no-recommended-command' : 'command-shape-not-allowed',
    opensBrowserNow: false,
    startsCaptureNow: false,
    statusBefore: status,
    statusAfter: null,
    child: null
  };

  if (!run || !allowedToRun) return watch;

  const child = (options.runner || defaultRunner)(selectedCommand, {
    cwd: rootDir,
    timeoutMs,
    env: options.env || process.env
  });
  watch.executed = true;
  watch.child = {
    exitCode: child.status,
    signal: child.signal || '',
    error: child.error || '',
    stdoutPreview: linePreview(child.stdout, Number(options.stdoutPreviewLines || 20)),
    stderrPreview: linePreview(child.stderr, Number(options.stderrPreviewLines || 20))
  };
  watch.status = child.status === 0 && !child.error ? 'ran' : 'failed';
  if (child.status === 0 && !child.error) {
    watch.statusAfter = buildAgentTaskStatus({
      ...options,
      rootDir,
      generatedAt: new Date().toISOString(),
      timeoutMs
    });
  }
  return watch;
}

function startDetached({ rootDir, commandValue, logPath, pidPath, spawnImpl = spawn }) {
  if (!commandValue?.args?.length) throw new Error('agent task watch command is unavailable');
  const resolvedLogPath = safeRunsPath(rootDir, logPath, 'operator/agent-task-watch.log', 'log-path');
  const resolvedPidPath = safeRunsPath(rootDir, pidPath, 'operator/agent-task-watch.pid', 'pid-path');
  fs.mkdirSync(path.dirname(resolvedLogPath), { recursive: true });
  fs.mkdirSync(path.dirname(resolvedPidPath), { recursive: true });
  const outFd = fs.openSync(resolvedLogPath, 'a');
  let child;
  try {
    child = spawnImpl(commandValue.args[0], commandValue.args.slice(1), {
      cwd: rootDir,
      detached: true,
      stdio: ['ignore', outFd, outFd]
    });
    if (!child?.pid) throw new Error('agent task watch background process did not report a pid');
    fs.writeFileSync(resolvedPidPath, `${child.pid}\n`);
    if (typeof child.unref === 'function') child.unref();
  } finally {
    fs.closeSync(outFd);
  }
  return {
    pid: child.pid,
    logPath: resolvedLogPath,
    pidPath: resolvedPidPath
  };
}

export function buildAgentTaskWatchStart(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const force = Boolean(options.force);
  const operatorOk = options.operatorOk || options['operator-ok'] || '';
  const operatorOkAccepted = operatorOk === 'OK';
  const timeoutMs = Number(options.timeoutMs || options['timeout-ms'] || 120000);
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const inputRelative = inputRelativePath(rootDir, options.in || options.input || options.path);
  const logRelative = runsRelativePath(rootDir, safeRunsPath(rootDir, options.logPath || options['log-path'], 'operator/agent-task-watch.log', 'log-path'));
  const pidRelative = runsRelativePath(rootDir, safeRunsPath(rootDir, options.pidPath || options['pid-path'], 'operator/agent-task-watch.pid', 'pid-path'));
  const watchCommand = taskCommand([
    'node',
    'src/cli.mjs',
    'agent-task-watch',
    '--run',
    '--in',
    inputRelative,
    '--stale-after-seconds',
    String(staleAfterSeconds),
    '--timeout-ms',
    String(timeoutMs),
    '--format',
    'compact'
  ], {
    mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
  });
  const existing = existingPidStatus(rootDir, pidRelative);
  const alreadyRunning = existing.running && !force;
  const readyToRun = operatorOkAccepted && !alreadyRunning;
  const blockers = [];
  if (!operatorOkAccepted) blockers.push('operator-ok-required');
  if (alreadyRunning) blockers.push('agent-task-watch-already-running');
  const result = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    startsBackgroundProcessNow: false,
    planOnly: !run,
    runRequested: run,
    operatorOkAccepted,
    status: run ? 'not-started' : 'planned',
    readyToRun,
    blockers,
    input: inputRelative,
    logPath: safeRunsPath(rootDir, logRelative, 'operator/agent-task-watch.log', 'log-path'),
    pidPath: safeRunsPath(rootDir, pidRelative, 'operator/agent-task-watch.pid', 'pid-path'),
    command: watchCommand,
    existingProcess: existing,
    commands: {
      plan: taskCommand(['node', 'src/cli.mjs', 'agent-task-watch-start', '--in', inputRelative, '--format', 'compact'], {
        mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
      }),
      approvedRun: taskCommand(['node', 'src/cli.mjs', 'agent-task-watch-start', '--run', '--operator-ok', 'OK', '--in', inputRelative, '--format', 'compact'], {
        mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
      }),
      status: taskCommand(['node', 'src/cli.mjs', 'agent-task-watch-status', '--in', inputRelative, '--format', 'compact'], {
        mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
      })
    },
    started: null
  };

  if (!run) return result;
  if (!readyToRun || blockers.length) {
    result.status = alreadyRunning ? 'already-running' : 'blocked';
    return result;
  }
  const started = startDetached({
    rootDir,
    commandValue: watchCommand,
    logPath: logRelative,
    pidPath: pidRelative,
    spawnImpl: options.spawnImpl || spawn
  });
  result.status = 'started';
  result.startsBackgroundProcessNow = true;
  result.started = started;
  result.existingProcess = {
    exists: true,
    path: started.pidPath,
    pid: started.pid,
    running: true
  };
  return result;
}

export function buildAgentTaskWatchStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const nowMs = Number.isFinite(Date.parse(generatedAt)) ? Date.parse(generatedAt) : Date.now();
  const inputRelative = inputRelativePath(rootDir, options.in || options.input || options.path);
  const logRelative = runsRelativePath(rootDir, safeRunsPath(rootDir, options.logPath || options['log-path'], 'operator/agent-task-watch.log', 'log-path'));
  const pidRelative = runsRelativePath(rootDir, safeRunsPath(rootDir, options.pidPath || options['pid-path'], 'operator/agent-task-watch.pid', 'pid-path'));
  const taskStatus = buildAgentTaskStatus({
    ...options,
    rootDir,
    generatedAt,
    in: inputRelative
  });
  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    statusOnly: true,
    input: inputRelative,
    process: existingPidStatus(rootDir, pidRelative),
    log: readLogFile(rootDir, logRelative, nowMs, options.maxLogLines ?? options['max-log-lines'] ?? 10),
    taskStatus,
    commands: {
      start: taskCommand(['node', 'src/cli.mjs', 'agent-task-watch-start', '--run', '--operator-ok', 'OK', '--in', inputRelative, '--format', 'compact'], {
        mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
      }),
      refresh: taskCommand(['node', 'src/cli.mjs', 'agent-task-watch', '--run', '--in', inputRelative, '--format', 'compact'], {
        mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
      })
    }
  };
}

function loopShouldRun(status) {
  return Boolean(
    !status.exists
    || status.stale
    || status.parseError
    || (status.runRequested && !status.executed && status.executionAllowed)
  );
}

export async function buildAgentTaskLoop(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const iterations = positiveInteger(options.iterations, 3);
  const intervalMs = nonNegativeInteger(options.intervalMs ?? options['interval-ms'], 0);
  const timeoutMs = Number(options.timeoutMs || options['timeout-ms'] || 120000);
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const inputRelative = inputRelativePath(rootDir, options.in || options.input || options.path);
  const statusOutPath = safeRunsPath(rootDir, options.statusOut || options['status-out'], 'operator/agent-task-loop-status.json', 'status-out');
  const statusOutRelative = runsRelativePath(rootDir, statusOutPath);
  const write = Boolean(options.write || options.statusOut || options['status-out']);
  const result = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    runRequested: run,
    writeRequested: write,
    status: run ? 'running' : 'planned',
    input: inputRelative,
    iterations,
    intervalMs,
    timeoutMs,
    staleAfterSeconds,
    executedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    steps: [],
    finalTaskStatus: null,
    statusOutPath: write ? statusOutPath : '',
    commands: {
      run: taskCommand(['node', 'src/cli.mjs', 'agent-task-loop', '--run', '--in', inputRelative, '--iterations', String(iterations), '--interval-ms', String(intervalMs), '--timeout-ms', String(timeoutMs), '--status-out', statusOutRelative, '--format', 'compact'], {
        mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
      }),
      status: taskCommand(['node', 'src/cli.mjs', 'agent-task-watch-status', '--in', inputRelative, '--format', 'compact'], {
        mcpObservationIn: options.mcpObservationIn || options['mcp-observation-in']
      })
    }
  };

  const persist = () => {
    if (!write) return;
    fs.mkdirSync(path.dirname(statusOutPath), { recursive: true });
    fs.writeFileSync(statusOutPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  };

  if (!run) {
    const status = buildAgentTaskStatus({
      ...options,
      rootDir,
      generatedAt,
      in: inputRelative,
      staleAfterSeconds,
      timeoutMs
    });
    result.finalTaskStatus = status;
    result.status = 'planned';
    persist();
    return result;
  }

  for (let index = 0; index < iterations; index += 1) {
    const stepGeneratedAt = new Date().toISOString();
    const before = buildAgentTaskStatus({
      ...options,
      rootDir,
      generatedAt: stepGeneratedAt,
      in: inputRelative,
      staleAfterSeconds,
      timeoutMs
    });
    const shouldRun = loopShouldRun(before);
    const watch = buildAgentTaskWatch({
      ...options,
      rootDir,
      generatedAt: stepGeneratedAt,
      run: shouldRun,
      in: inputRelative,
      staleAfterSeconds,
      timeoutMs
    });
    const after = shouldRun
      ? watch.statusAfter || buildAgentTaskStatus({
        ...options,
        rootDir,
        generatedAt: new Date().toISOString(),
        in: inputRelative,
        staleAfterSeconds,
        timeoutMs
      })
      : before;
    const failed = shouldRun && watch.status === 'failed';
    result.steps.push({
      index,
      action: shouldRun ? 'run-watch' : 'status-only',
      watchStatus: watch.status,
      taskStatusBefore: before.taskStatus,
      taskStatusAfter: after.taskStatus,
      staleBefore: before.stale,
      staleAfter: after.stale,
      executed: Boolean(watch.executed),
      failed,
      recommendedCommandId: before.recommendedCommandId
    });
    if (shouldRun && watch.executed) result.executedCount += 1;
    if (!shouldRun) result.skippedCount += 1;
    if (failed) result.failedCount += 1;
    result.finalTaskStatus = after;
    persist();
    if (failed) break;
    if (index < iterations - 1 && intervalMs > 0) await sleep(intervalMs);
  }

  result.status = result.failedCount > 0 ? 'failed' : 'completed';
  persist();
  return result;
}

export function formatAgentTaskCompact(task) {
  const routeOperatorApprovalReasons = task.routeOperatorApprovalReasons || [];
  const lines = [
    `safe_mode: ${yesNo(task.safeMode)}`,
    `destructive_actions: ${yesNo(task.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(task.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(task.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(task.startsCaptureNow)}`,
    `run_requested: ${yesNo(task.runRequested)}`,
    `write_requested: ${yesNo(task.writeRequested)}`,
    `executed: ${yesNo(task.executed)}`,
    `status: ${clean(task.status)}`,
    `task: ${clean(task.task)}`,
    `target_available: ${yesNo(task.target?.available)}`,
    `target_auto_detected: ${yesNo(task.target?.autoDetected)}`,
    `target_source: ${clean(task.target?.source)}`,
    `target: ${clean(task.target?.name)}`,
    `target_dir: ${clean(task.target?.dir)}`,
    `route_lane: ${clean(task.route?.selectedLane)}`,
    `route_backend: ${clean(task.route?.backend)}`,
    `route_background: ${yesNo(task.route?.canRunInBackground)}`,
    `route_operator_input: ${yesNo(task.route?.operatorInput)}`,
    `route_capture_blocked: ${yesNo(task.route?.captureBlocked)}`,
    `recommended_command_id: ${clean(task.recommendedCommandId)}`,
    `execution_allowed: ${yesNo(task.executionAllowed)}`,
    `agent_unattended_allowed: ${yesNo(task.agentUnattendedAllowed)}`,
    `selected_command_unattended_allowed: ${yesNo(task.selectedCommandUnattendedAllowed)}`,
    `route_operator_approval_required: ${yesNo(task.routeOperatorApprovalRequired)}`,
    `route_operator_approval_reasons: ${routeOperatorApprovalReasons.length ? routeOperatorApprovalReasons.join(',') : 'none'}`,
    `blocked_reason: ${clean(task.blockedReason)}`
  ];
  if (task.query) lines.push(`query: ${clean(task.query)}`);
  if (task.selectedCommand?.shell) lines.push(`command: ${task.selectedCommand.shell}`);
  if (task.selectedStatusCommand?.shell) lines.push(`selected_status_command: ${task.selectedStatusCommand.shell}`);
  if (task.exitStatus !== null) lines.push(`exit_status: ${task.exitStatus}`);
  if (task.signal) lines.push(`signal: ${clean(task.signal)}`);
  if (task.error) lines.push(`error: ${clean(task.error)}`);
  if (task.searchProvider) lines.push(`search_provider: ${clean(task.searchProvider)}`);
  if (task.searchUsable !== null && task.searchUsable !== undefined) lines.push(`search_usable: ${yesNo(task.searchUsable)}`);
  if (task.searchChallenge !== null && task.searchChallenge !== undefined) lines.push(`search_challenge: ${yesNo(task.searchChallenge)}`);
  if (task.searchResultLinks !== null && task.searchResultLinks !== undefined) lines.push(`search_result_links: ${task.searchResultLinks}`);
  if (task.searchAttempts?.length) lines.push(`search_attempts: ${task.searchAttempts.map((attempt) => `${attempt.provider}:${attempt.status}:${attempt.searchResultLinks}:${attempt.searchChallenge ? 'challenge' : 'ok'}`).join(',')}`);
  if (task.authPreflightChecked) {
    lines.push('auth_preflight_checked: yes');
    lines.push(`auth_preflight_parsed: ${yesNo(task.authPreflightParsed)}`);
    if (task.authPreflightOk !== null && task.authPreflightOk !== undefined) lines.push(`auth_preflight_ok: ${yesNo(task.authPreflightOk)}`);
    if (task.authPreflightLoginLike !== null && task.authPreflightLoginLike !== undefined) lines.push(`auth_preflight_login_like: ${yesNo(task.authPreflightLoginLike)}`);
    if (task.authPreflightSameOrigin !== null && task.authPreflightSameOrigin !== undefined) lines.push(`auth_preflight_same_origin: ${yesNo(task.authPreflightSameOrigin)}`);
    if (task.authPreflightNextAction) lines.push(`auth_preflight_next_action: ${clean(task.authPreflightNextAction)}`);
    if (task.authPreflightWatchCommand?.shell) lines.push(`auth_preflight_watch_command: ${task.authPreflightWatchCommand.shell}`);
    if (task.authPreflightResumeStatusCommand?.shell) lines.push(`auth_preflight_resume_status_command: ${task.authPreflightResumeStatusCommand.shell}`);
  }
  if (task.outputPath) lines.push(`output_path: ${task.outputPath}`);
  if (task.writeCommand?.shell) lines.push(`write_command: ${task.writeCommand.shell}`);
  if (task.runCommand?.shell) lines.push(`run_command: ${task.runCommand.shell}`);
  if (task.stdoutPreview?.length) lines.push(`stdout_preview: ${task.stdoutPreview.map((line) => clean(line)).join(' | ')}`);
  if (task.stderrPreview?.length) lines.push(`stderr_preview: ${task.stderrPreview.map((line) => clean(line)).join(' | ')}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentTaskStatusCompact(status) {
  const routeOperatorApprovalReasons = status.routeOperatorApprovalReasons || [];
  const lines = [
    `status_only: ${yesNo(status.statusOnly)}`,
    `exists: ${yesNo(status.exists)}`,
    `stale: ${yesNo(status.stale)}`,
    `safe_mode: ${yesNo(status.safeMode)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `task_status: ${clean(status.taskStatus)}`,
    `task: ${clean(status.task)}`,
    `query_present: ${yesNo(status.queryPresent)}`,
    `target_available: ${yesNo(status.targetAvailable)}`,
    `target: ${clean(status.targetName)}`,
    `target_dir: ${clean(status.targetDir)}`,
    `route_lane: ${clean(status.routeLane)}`,
    `route_backend: ${clean(status.routeBackend)}`,
    `run_requested: ${yesNo(status.runRequested)}`,
    `write_requested: ${yesNo(status.writeRequested)}`,
    `executed: ${yesNo(status.executed)}`,
    `execution_allowed: ${yesNo(status.executionAllowed)}`,
    `agent_unattended_allowed: ${yesNo(status.agentUnattendedAllowed)}`,
    `selected_command_unattended_allowed: ${yesNo(status.selectedCommandUnattendedAllowed)}`,
    `route_operator_approval_required: ${yesNo(status.routeOperatorApprovalRequired)}`,
    `route_operator_approval_reasons: ${routeOperatorApprovalReasons.length ? routeOperatorApprovalReasons.join(',') : 'none'}`,
    `blocked_reason: ${clean(status.blockedReason)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `agent_safe_next_command_id: ${clean(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `agent_safe_next_command: ${status.agentSafeNextCommand?.shell || 'none'}`,
    `recommended_command_id: ${clean(status.recommendedCommandId)}`,
    `selected_command_id: ${clean(status.selectedCommandId)}`,
    `exit_status: ${status.exitStatus ?? 'none'}`,
    `signal: ${clean(status.signal)}`,
    `error: ${clean(status.error)}`,
    `age_seconds: ${status.ageSeconds ?? 'none'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `parse_error: ${clean(status.parseError)}`,
    `path: ${status.path}`
  ];
  if (status.searchProvider) lines.push(`search_provider: ${clean(status.searchProvider)}`);
  if (status.searchUsable !== null && status.searchUsable !== undefined) lines.push(`search_usable: ${yesNo(status.searchUsable)}`);
  if (status.searchChallenge !== null && status.searchChallenge !== undefined) lines.push(`search_challenge: ${yesNo(status.searchChallenge)}`);
  if (status.searchResultLinks !== null && status.searchResultLinks !== undefined) lines.push(`search_result_links: ${status.searchResultLinks}`);
  if (status.searchAttemptCount) lines.push(`search_attempt_count: ${status.searchAttemptCount}`);
  if (status.authPreflightChecked) {
    lines.push('auth_preflight_checked: yes');
    lines.push(`auth_preflight_parsed: ${yesNo(status.authPreflightParsed)}`);
    if (status.authPreflightOk !== null && status.authPreflightOk !== undefined) lines.push(`auth_preflight_ok: ${yesNo(status.authPreflightOk)}`);
    if (status.authPreflightLoginLike !== null && status.authPreflightLoginLike !== undefined) lines.push(`auth_preflight_login_like: ${yesNo(status.authPreflightLoginLike)}`);
    if (status.authPreflightSameOrigin !== null && status.authPreflightSameOrigin !== undefined) lines.push(`auth_preflight_same_origin: ${yesNo(status.authPreflightSameOrigin)}`);
    if (status.authPreflightNextAction) lines.push(`auth_preflight_next_action: ${clean(status.authPreflightNextAction)}`);
    if (status.authPreflightWatchCommand?.shell) lines.push(`auth_preflight_watch_command: ${status.authPreflightWatchCommand.shell}`);
    if (status.authPreflightResumeStatusCommand?.shell) lines.push(`auth_preflight_resume_status_command: ${status.authPreflightResumeStatusCommand.shell}`);
  }
  if (status.selectedStatusCommand?.shell) lines.push(`selected_status_command: ${status.selectedStatusCommand.shell}`);
  if (status.recommendedCommand?.shell) lines.push(`recommended_command: ${status.recommendedCommand.shell}`);
  if (status.refreshCommand?.shell) lines.push(`refresh_command: ${status.refreshCommand.shell}`);
  if (status.executionAllowed && status.runCommand?.shell) lines.push(`run_command: ${status.runCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentTaskWatchCompact(watch) {
  const routeOperatorApprovalReasons = watch.routeOperatorApprovalReasons || [];
  const lines = [
    `safe_mode: ${yesNo(watch.safeMode)}`,
    `destructive_actions: ${yesNo(watch.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(watch.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(watch.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(watch.startsCaptureNow)}`,
    `run_requested: ${yesNo(watch.runRequested)}`,
    `executed: ${yesNo(watch.executed)}`,
    `status: ${clean(watch.status)}`,
    `task_status: ${clean(watch.taskStatus)}`,
    `task: ${clean(watch.task)}`,
    `exists: ${yesNo(watch.exists)}`,
    `stale: ${yesNo(watch.stale)}`,
    `recommended_command_id: ${clean(watch.recommendedCommandId)}`,
    `allowed_to_run: ${yesNo(watch.allowedToRun)}`,
    `agent_unattended_allowed: ${yesNo(watch.agentUnattendedAllowed)}`,
    `selected_command_unattended_allowed: ${yesNo(watch.selectedCommandUnattendedAllowed)}`,
    `route_operator_approval_required: ${yesNo(watch.routeOperatorApprovalRequired)}`,
    `route_operator_approval_reasons: ${routeOperatorApprovalReasons.length ? routeOperatorApprovalReasons.join(',') : 'none'}`,
    `blocked_reason: ${clean(watch.blockedReason)}`
  ];
  if (watch.selectedCommand?.shell) lines.push(`command: ${watch.selectedCommand.shell}`);
  if (watch.child) {
    lines.push(`child_exit_code: ${watch.child.exitCode ?? 'none'}`);
    lines.push(`child_signal: ${clean(watch.child.signal)}`);
    lines.push(`child_error: ${clean(watch.child.error)}`);
  }
  if (watch.statusAfter) {
    lines.push(`after_task_status: ${clean(watch.statusAfter.taskStatus)}`);
    lines.push(`after_executed: ${yesNo(watch.statusAfter.executed)}`);
    lines.push(`after_stale: ${yesNo(watch.statusAfter.stale)}`);
    if (watch.statusAfter.searchResultLinks !== null && watch.statusAfter.searchResultLinks !== undefined) {
      lines.push(`after_search_result_links: ${watch.statusAfter.searchResultLinks}`);
    }
  }
  if (watch.child?.stdoutPreview?.length) lines.push(`stdout_preview: ${watch.child.stdoutPreview.map((line) => clean(line)).join(' | ')}`);
  if (watch.child?.stderrPreview?.length) lines.push(`stderr_preview: ${watch.child.stderrPreview.map((line) => clean(line)).join(' | ')}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentTaskWatchStartCompact(result) {
  const lines = [
    `status: ${clean(result.status)}`,
    `safe_mode: ${yesNo(result.safeMode)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(result.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(result.startsCaptureNow)}`,
    `starts_background_process_now: ${yesNo(result.startsBackgroundProcessNow)}`,
    `plan_only: ${yesNo(result.planOnly)}`,
    `run_requested: ${yesNo(result.runRequested)}`,
    `operator_ok_accepted: ${yesNo(result.operatorOkAccepted)}`,
    `ready_to_run: ${yesNo(result.readyToRun)}`,
    `blockers: ${result.blockers.length ? result.blockers.join(',') : 'none'}`,
    `input: ${clean(result.input)}`,
    `pid_exists: ${yesNo(result.existingProcess.exists)}`,
    `running: ${yesNo(result.existingProcess.running)}`,
    `pid: ${result.existingProcess.pid || 'none'}`,
    `log_path: ${result.logPath}`,
    `pid_path: ${result.pidPath}`,
    `status_command: ${result.commands.status.shell}`,
    `approved_run_command: ${result.commands.approvedRun.shell}`
  ];
  if (result.command?.shell) lines.push(`foreground_command: ${result.command.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentTaskWatchStatusCompact(status) {
  const routeOperatorApprovalReasons = status.taskStatus.routeOperatorApprovalReasons || [];
  const lines = [
    `status_only: ${yesNo(status.statusOnly)}`,
    `safe_mode: ${yesNo(status.safeMode)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `input: ${clean(status.input)}`,
    `pid_exists: ${yesNo(status.process.exists)}`,
    `running: ${yesNo(status.process.running)}`,
    `pid: ${status.process.pid || 'none'}`,
    `pid_path: ${status.process.path}`,
    `log_exists: ${yesNo(status.log.exists)}`,
    `log_lines: ${status.log.lineCount || 0}`,
    `log_path: ${status.log.path}`,
    `task_status: ${clean(status.taskStatus.taskStatus)}`,
    `task: ${clean(status.taskStatus.task)}`,
    `task_stale: ${yesNo(status.taskStatus.stale)}`,
    `task_executed: ${yesNo(status.taskStatus.executed)}`,
    `task_recommended_command_id: ${clean(status.taskStatus.recommendedCommandId)}`,
    `task_agent_unattended_allowed: ${yesNo(status.taskStatus.agentUnattendedAllowed)}`,
    `task_selected_command_unattended_allowed: ${yesNo(status.taskStatus.selectedCommandUnattendedAllowed)}`,
    `task_route_operator_approval_required: ${yesNo(status.taskStatus.routeOperatorApprovalRequired)}`,
    `task_route_operator_approval_reasons: ${routeOperatorApprovalReasons.length ? routeOperatorApprovalReasons.join(',') : 'none'}`,
    `start_command: ${status.commands.start.shell}`,
    `refresh_command: ${status.commands.refresh.shell}`
  ];
  if (status.taskStatus.searchResultLinks !== null && status.taskStatus.searchResultLinks !== undefined) {
    lines.push(`task_search_result_links: ${status.taskStatus.searchResultLinks}`);
  }
  if (status.log.tail?.length) lines.push(`log_tail: ${status.log.tail.map((line) => clean(line)).join(' | ')}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentTaskLoopCompact(loop) {
  const lines = [
    `safe_mode: ${yesNo(loop.safeMode)}`,
    `destructive_actions: ${yesNo(loop.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(loop.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(loop.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(loop.startsCaptureNow)}`,
    `run_requested: ${yesNo(loop.runRequested)}`,
    `write_requested: ${yesNo(loop.writeRequested)}`,
    `status: ${clean(loop.status)}`,
    `input: ${clean(loop.input)}`,
    `iterations: ${loop.iterations}`,
    `interval_ms: ${loop.intervalMs}`,
    `executed_count: ${loop.executedCount}`,
    `skipped_count: ${loop.skippedCount}`,
    `failed_count: ${loop.failedCount}`
  ];
  if (loop.finalTaskStatus) {
    lines.push(`final_task_status: ${clean(loop.finalTaskStatus.taskStatus)}`);
    lines.push(`final_task_stale: ${yesNo(loop.finalTaskStatus.stale)}`);
    lines.push(`final_task_executed: ${yesNo(loop.finalTaskStatus.executed)}`);
    if (loop.finalTaskStatus.searchResultLinks !== null && loop.finalTaskStatus.searchResultLinks !== undefined) {
      lines.push(`final_search_result_links: ${loop.finalTaskStatus.searchResultLinks}`);
    }
  }
  if (loop.statusOutPath) lines.push(`status_out: ${loop.statusOutPath}`);
  if (loop.commands?.run?.shell) lines.push(`run_command: ${loop.commands.run.shell}`);
  if (loop.commands?.status?.shell) lines.push(`status_command: ${loop.commands.status.shell}`);
  if (loop.steps?.length) {
    lines.push(`steps: ${loop.steps.map((step) => `${step.index}:${step.action}:${step.watchStatus}:${step.taskStatusAfter}:${step.staleAfter ? 'stale' : 'fresh'}`).join(',')}`);
  }
  return `${lines.join('\n')}\n`;
}
