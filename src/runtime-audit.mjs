import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CHROME_DEVTOOLS_LABELS = [
  'com.s30519.agent-chrome-devtools',
  'com.katala.chrome-devtools-browser-agent'
];

function run(command, args, runner = spawnSync) {
  const result = runner(command, args, { encoding: 'utf8', timeout: 10000 });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error ? result.error.message : ''
  };
}

export function parseDevtoolsVersionProbe(port, result = {}) {
  const lines = String(result.stdout || '').split('\n');
  const maybeStatus = lines.at(-1)?.trim();
  const httpStatus = /^\d{3}$/.test(maybeStatus) ? Number(maybeStatus) : null;
  const body = httpStatus === null ? String(result.stdout || '') : lines.slice(0, -1).join('\n');
  let parsed = null;
  let parseError = '';
  if (body.trim()) {
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }
  const ok = Boolean(result.ok && httpStatus && httpStatus >= 200 && httpStatus < 300 && parsed);
  return {
    port,
    ok,
    httpStatus,
    curlOk: Boolean(result.ok),
    browser: parsed?.Browser || '',
    protocolVersion: parsed?.['Protocol-Version'] || '',
    webSocketDebuggerUrlPresent: Boolean(parsed?.webSocketDebuggerUrl),
    error: ok ? '' : (result.error || String(result.stderr || '').trim() || parseError || (httpStatus ? `HTTP ${httpStatus}` : 'No HTTP status'))
  };
}

function probeDevtoolsVersion(port, runner) {
  const result = run('curl', [
    '--silent',
    '--show-error',
    '--max-time',
    '2',
    '--write-out',
    '\n%{http_code}',
    `http://127.0.0.1:${port}/json/version`
  ], runner);
  return parseDevtoolsVersionProbe(port, result);
}

export function parseProcessTable(text) {
  return String(text || '')
    .split('\n')
    .slice(1)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        etime: match[3],
        stat: match[4],
        command: match[5]
      };
    })
    .filter(Boolean);
}

export function parseAgentBrowserSessions(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== 'Active sessions:')
    .map((line) => line.replace(/^\*\s*/, '').trim());
}

function commandMatches(command, patterns) {
  const haystack = String(command || '').toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern));
}

function groupProcesses(processes, name, patterns) {
  const items = processes.filter((proc) => commandMatches(proc.command, patterns));
  return {
    name,
    count: items.length,
    pids: items.map((proc) => proc.pid),
    items
  };
}

function parseChromeFlag(command, name) {
  const text = String(command || '');
  const equals = text.match(new RegExp(`${name}=([^\\s]+)`));
  if (equals) return equals[1];
  const spaced = text.match(new RegExp(`${name}\\s+([^\\s]+)`));
  return spaced?.[1] || '';
}

function classifyChromeProfile(command) {
  const lower = String(command || '').toLowerCase();
  const userDataDir = parseChromeFlag(command, '--user-data-dir');
  const userDataDirLower = userDataDir.toLowerCase();
  if (!userDataDir) return 'regular-profile';
  if (lower.includes('/runs/target-packs/') || userDataDirLower.includes('/runs/target-packs/')) return 'target-pack-profile';
  if (lower.includes('codex browser agent/chrome') || userDataDirLower.includes('codex browser agent/chrome')) return 'codex-browser-agent-profile';
  if (lower.includes('secure-browser-agent') || userDataDirLower.includes('secure-browser-agent')) return 'secure-browser-agent-profile';
  if (lower.includes('google chrome for testing')) return 'chrome-for-testing-profile';
  return 'dedicated-profile';
}

function summarizeChromeAppProcesses(processes) {
  const parents = processes.filter((proc) => String(proc.command || '').includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  const byProfile = {};
  let remoteDebuggingEnabled = 0;
  let regularProfileRemoteDebugging = 0;
  let targetProfileRemoteDebugging = 0;
  let ephemeralRemoteDebugging = 0;
  let fixedRemoteDebugging = 0;

  for (const proc of parents) {
    const profileClass = classifyChromeProfile(proc.command);
    byProfile[profileClass] = (byProfile[profileClass] || 0) + 1;
    const port = parseChromeFlag(proc.command, '--remote-debugging-port');
    const hasRemoteDebugging = Boolean(port || String(proc.command || '').includes('--remote-debugging-port'));
    if (!hasRemoteDebugging) continue;
    remoteDebuggingEnabled += 1;
    if (port === '0') ephemeralRemoteDebugging += 1;
    else fixedRemoteDebugging += 1;
    if (profileClass === 'regular-profile') regularProfileRemoteDebugging += 1;
    if (profileClass === 'target-pack-profile') targetProfileRemoteDebugging += 1;
  }

  return {
    total: parents.length,
    byProfile,
    regularProfiles: byProfile['regular-profile'] || 0,
    targetPackProfiles: byProfile['target-pack-profile'] || 0,
    codexBrowserAgentProfiles: byProfile['codex-browser-agent-profile'] || 0,
    secureBrowserAgentProfiles: byProfile['secure-browser-agent-profile'] || 0,
    dedicatedProfiles: byProfile['dedicated-profile'] || 0,
    remoteDebuggingEnabled,
    ephemeralRemoteDebugging,
    fixedRemoteDebugging,
    regularProfileRemoteDebugging,
    targetProfileRemoteDebugging
  };
}

function assignProcessParts(processes, definitions) {
  const output = {};
  for (const definition of definitions) {
    const parts = {};
    const pids = {};
    for (const part of definition.parts) {
      parts[part.name] = 0;
      pids[part.name] = [];
    }
    parts.other = 0;
    pids.other = [];

    for (const proc of processes) {
      const command = String(proc.command || '').toLowerCase();
      if (!definition.any.some((pattern) => command.includes(pattern))) continue;
      const match = definition.parts.find((part) => part.patterns.some((pattern) => command.includes(pattern)));
      const partName = match?.name || 'other';
      parts[partName] += 1;
      pids[partName].push(proc.pid);
    }

    output[definition.key] = {
      name: definition.name,
      total: Object.values(parts).reduce((sum, count) => sum + count, 0),
      parts,
      pids
    };
  }
  return output;
}

function buildProcessBreakdown(processes) {
  return assignProcessParts(processes, [
    {
      key: 'peekaboo',
      name: 'peekaboo',
      any: ['peekaboo mcp', '@steipete/peekaboo'],
      parts: [
        { name: 'wrapper', patterns: ['@steipete/peekaboo'] },
        { name: 'server', patterns: ['peekaboo mcp'] }
      ]
    },
    {
      key: 'chromeDevtoolsMcp',
      name: 'chrome-devtools-mcp',
      any: ['chrome-devtools-mcp'],
      parts: [
        { name: 'wrapper', patterns: ['npm exec chrome-devtools-mcp'] },
        { name: 'watchdog', patterns: ['telemetry/watchdog'] },
        { name: 'server', patterns: ['chrome-devtools-mcp'] }
      ]
    },
    {
      key: 'mcpdoc',
      name: 'mcpdoc',
      any: ['mcpdoc'],
      parts: [
        { name: 'wrapper', patterns: ['uvx --from mcpdoc', 'uv tool uvx --from mcpdoc'] },
        { name: 'server', patterns: ['/bin/mcpdoc'] }
      ]
    },
    {
      key: 'notion',
      name: 'notion-mcp',
      any: ['notion-mcp-server'],
      parts: [
        { name: 'wrapper', patterns: ['@notionhq/notion-mcp-server'] },
        { name: 'server', patterns: ['notion-mcp-server --transport stdio'] }
      ]
    },
    {
      key: 'hermes',
      name: 'hermes-mcp',
      any: ['hermes_cli.main mcp serve'],
      parts: [
        { name: 'server', patterns: ['hermes_cli.main mcp serve'] }
      ]
    },
    {
      key: 'onepassword',
      name: '1password-mcp',
      any: ['onepassword-mcp'],
      parts: [
        { name: 'server', patterns: ['onepassword-mcp'] }
      ]
    },
    {
      key: 'computerUse',
      name: 'computer-use-mcp',
      any: ['skycomputeruseclient mcp'],
      parts: [
        { name: 'server', patterns: ['skycomputeruseclient mcp'] }
      ]
    }
  ]);
}

function shortCommand(command) {
  const value = String(command || '').trim();
  if (!value) return '';
  if (value === 'codex' || value === 'Codex' || value === 'claude') return value;
  if (value.includes('/Applications/Codex.app/Contents/MacOS/Codex')) return 'Codex.app';
  if (value.includes('/Applications/Claude.app/Contents/MacOS/Claude')) return 'Claude.app';
  if (value.includes('codex app-server')) return 'codex app-server';
  if (value.includes('node_repl')) return 'node_repl';
  if (value.includes('chrome-devtools-mcp')) return 'chrome-devtools-mcp';
  if (value.includes('@steipete/peekaboo') || value.includes('peekaboo mcp')) return 'peekaboo mcp';
  return value.split(/\s+/).slice(0, 3).join(' ');
}

function isAgentRoot(proc) {
  const command = String(proc?.command || '').trim();
  return command === 'codex'
    || command === 'Codex'
    || command === 'claude'
    || command.includes('/Applications/Codex.app/Contents/MacOS/Codex')
    || command.includes('/Applications/Claude.app/Contents/MacOS/Claude');
}

function findAgentRoot(proc, byPid) {
  let cursor = proc;
  const seen = new Set();
  for (let depth = 0; cursor && depth < 32; depth += 1) {
    if (seen.has(cursor.pid)) return null;
    seen.add(cursor.pid);
    if (isAgentRoot(cursor)) return cursor;
    cursor = byPid.get(cursor.ppid);
  }
  return null;
}

function findOwnerForPid(pid, processes) {
  if (!pid) return null;
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]));
  return findAgentRoot(byPid.get(pid), byPid);
}

export function summarizeAgentOwners(processes, groups, options = {}) {
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]));
  const currentRoot = findOwnerForPid(options.currentPid, processes);
  const ownerGroups = [
    'peekaboo',
    'mcpdoc',
    'hermes',
    'onepassword',
    'notion',
    'computerUse',
    'nodeRepl',
    'codexAppServer',
    'chromeDevtoolsMcp',
    'playwrightMcp'
  ];
  const owners = new Map();

  for (const groupName of ownerGroups) {
    for (const proc of groups[groupName]?.items || []) {
      const root = findAgentRoot(proc, byPid);
      const ownerKey = root ? String(root.pid) : `unowned:${proc.ppid || 0}`;
      if (!owners.has(ownerKey)) {
        owners.set(ownerKey, {
          ownerPid: root?.pid || null,
          ownerCommand: root ? shortCommand(root.command) : `unowned parent ${proc.ppid || 'unknown'}`,
          ownerEtime: root?.etime || '',
          current: Boolean(currentRoot?.pid && root?.pid === currentRoot.pid),
          childCount: 0,
          childPids: [],
          groups: {}
        });
      }
      const owner = owners.get(ownerKey);
      owner.childCount += 1;
      owner.childPids.push(proc.pid);
      owner.groups[groupName] = (owner.groups[groupName] || 0) + 1;
    }
  }

  return [...owners.values()]
    .sort((left, right) => right.childCount - left.childCount || String(left.ownerCommand).localeCompare(String(right.ownerCommand)));
}

function parseLaunchctlPrint(label, output, ok) {
  const state = output.match(/state = ([^\n]+)/)?.[1]?.trim() || (ok ? 'loaded' : 'missing');
  const runs = output.match(/runs = (\d+)/)?.[1] || '';
  const path = output.match(/path = ([^\n]+)/)?.[1]?.trim() || '';
  return {
    label,
    loaded: ok,
    state,
    runs: runs ? Number(runs) : null,
    path
  };
}

function staleAgentBrowserSessions(sessions) {
  return sessions.filter((session) => /^verify-\d+$/.test(session) || session === 'pw-probe');
}

function recommendation(level, name, detail, commands = []) {
  return { level, name, detail, commands };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function shellCommand(args) {
  return args.map(shellQuote).join(' ');
}

function safeRuntimeArtifactPath(rootDir, outPath, defaultName) {
  const runsDir = path.resolve(rootDir, 'runs');
  const target = path.resolve(runsDir, outPath || path.join('runtime', defaultName));
  const relative = path.relative(runsDir, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`runtime output must stay under runs/: ${outPath}`);
  }
  return target;
}

export function analyzeRuntimeState({
  processes = [],
  sessions = [],
  launchAgents = [],
  port9223Listeners = [],
  port9222Listeners = [],
  devtoolsEndpoints = {},
  currentPid = process.pid
} = {}) {
  const groups = {
    peekaboo: groupProcesses(processes, 'peekaboo', ['peekaboo mcp', '@steipete/peekaboo']),
    mcpdoc: groupProcesses(processes, 'mcpdoc', ['mcpdoc']),
    hermes: groupProcesses(processes, 'hermes', ['hermes_cli.main mcp serve']),
    onepassword: groupProcesses(processes, 'onepassword', ['onepassword-mcp']),
    notion: groupProcesses(processes, 'notion', ['notion-mcp-server']),
    computerUse: groupProcesses(processes, 'computer-use', ['skycomputeruseclient mcp']),
    nodeRepl: groupProcesses(processes, 'node-repl', ['node_repl']),
    codexAppServer: groupProcesses(processes, 'codex-app-server', ['codex app-server']),
    chromeDevtoolsMcp: groupProcesses(processes, 'chrome-devtools-mcp', ['chrome-devtools-mcp']),
    playwrightMcp: groupProcesses(processes, 'playwright-mcp', ['@playwright/mcp', 'playwright-mcp/node_modules/@playwright/mcp']),
    agentBrowser: groupProcesses(processes, 'agent-browser', ['agent-browser-darwin-arm64']),
    agentBrowserChrome: groupProcesses(processes, 'agent-browser-chrome', ['google chrome for testing', 'secure-browser-agent/profiles']),
    devtoolsChrome: groupProcesses(processes, 'devtools-chrome', ['remote-debugging-port=9223', 'codex browser agent/chrome']),
    dia: groupProcesses(processes, 'dia', ['/applications/dia.app/contents/macos/dia']),
    selenium: groupProcesses(processes, 'selenium', ['selenium', 'chromedriver']),
    lightpanda: groupProcesses(processes, 'lightpanda', ['lightpanda'])
  };
  const processBreakdown = buildProcessBreakdown(processes);
  const chromeApp = summarizeChromeAppProcesses(processes);
  const staleSessions = staleAgentBrowserSessions(sessions);
  const loadedDevtoolsAgents = launchAgents.filter((agent) => agent.loaded);
  const duplicateDevtoolsAgents = loadedDevtoolsAgents.length > 1;
  const agentOwners = summarizeAgentOwners(processes, groups, { currentPid });
  const recommendations = [];

  if (groups.peekaboo.count > 8) {
    recommendations.push(recommendation(
      'warn',
      'peekaboo.duplicated',
      `${groups.peekaboo.count} Peekaboo MCP wrapper/process entries are running. They usually belong to separate Codex/Claude sessions; close stale parent sessions instead of killing children blindly.`
    ));
  }
  if (agentOwners.length > 6) {
    recommendations.push(recommendation(
      'cleanup',
      'agent-session.manyOwners',
      `${agentOwners.length} Codex/Claude owner session(s) have browser/MCP helper children. Close stale parent sessions first; this preserves active sessions and lets their children exit naturally.`
    ));
  }
  if (staleSessions.length > 0) {
    recommendations.push(recommendation(
      'cleanup',
      'agent-browser.staleSessions',
      `${staleSessions.length} stale agent-browser session(s): ${staleSessions.join(', ')}`,
      staleSessions.map((session) => `agent-browser --session ${session} close`)
    ));
  }
  if (duplicateDevtoolsAgents) {
    recommendations.push(recommendation(
      'cleanup',
      'chrome-devtools.duplicateLaunchAgents',
      `${loadedDevtoolsAgents.length} LaunchAgents manage the same 127.0.0.1:9223 Chrome profile. Keep one.`,
      ['launchctl bootout "gui/$(id -u)/com.katala.chrome-devtools-browser-agent"']
    ));
  }
  if (groups.devtoolsChrome.count > 0 && port9223Listeners.length === 0) {
    recommendations.push(recommendation(
      'warn',
      'chrome-devtools.listenerMissing',
      'DevTools Chrome process was found but no 127.0.0.1:9223 listener was detected.'
    ));
  }
  if (port9223Listeners.length > 0 && devtoolsEndpoints.port9223 && !devtoolsEndpoints.port9223.ok) {
    recommendations.push(recommendation(
      'warn',
      'chrome-devtools.endpointUnhealthy',
      `127.0.0.1:9223 is listening but /json/version did not return DevTools JSON: ${devtoolsEndpoints.port9223.error || 'unknown error'}`
    ));
  }
  if (port9222Listeners.length > 0 && devtoolsEndpoints.port9222 && !devtoolsEndpoints.port9222.ok) {
    recommendations.push(recommendation(
      'info',
      'dia.notDevtoolsJson',
      `127.0.0.1:9222 is listening but /json/version is not a DevTools JSON endpoint: ${devtoolsEndpoints.port9222.error || 'unknown error'}`
    ));
  }
  if (groups.chromeDevtoolsMcp.count > 0 && groups.devtoolsChrome.count === 0) {
    recommendations.push(recommendation(
      'warn',
      'chrome-devtools.mcpWithoutBrowser',
      'Chrome DevTools MCP is running but the dedicated 9223 Chrome process was not found.'
    ));
  }
  if (recommendations.length === 0) {
    recommendations.push(recommendation('pass', 'runtime.clean', 'No obvious duplicate browser-agent runtime state detected.'));
  }

  return {
    ok: recommendations.every((item) => item.level !== 'warn'),
    groups,
    processBreakdown,
    chromeApp,
    agentOwners,
    agentBrowser: {
      sessions,
      staleSessions,
      closeCommands: staleSessions.map((session) => `agent-browser --session ${session} close`)
    },
    chromeDevtools: {
      port: 9223,
      listeners: port9223Listeners,
      endpoint: devtoolsEndpoints.port9223 || null,
      diaPort: 9222,
      diaListeners: port9222Listeners,
      diaEndpoint: devtoolsEndpoints.port9222 || null,
      launchAgents,
      duplicateLaunchAgents: duplicateDevtoolsAgents
    },
    currentSession: {
      pid: currentPid,
      ownerPid: agentOwners.find((owner) => owner.current)?.ownerPid || null
    },
    recommendations
  };
}

export function collectRuntimeState(options = {}) {
  const runner = options.runner || spawnSync;
  // ps and lsof are POSIX-only. On Windows every one of these returned non-zero, so the audit
  // reported an empty machine instead of admitting it could not look. commandStatus.ps.ok in
  // the return value is what tells the two apart.
  const ps = process.platform === 'win32'
    ? run('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId) 00:00 R $($_.CommandLine)\" }"], runner)
    : run('ps', ['-axo', 'pid,ppid,etime,stat,command'], runner);
  const processes = ps.ok ? parseProcessTable(ps.stdout) : [];
  const sessionList = run('agent-browser', ['session', 'list'], runner);
  const sessions = sessionList.ok ? parseAgentBrowserSessions(sessionList.stdout) : [];
  const lsof = run('lsof', ['-nP', '-iTCP:9223', '-sTCP:LISTEN'], runner);
  const port9223Listeners = lsof.ok
    ? lsof.stdout.split('\n').slice(1).map((line) => line.trim()).filter(Boolean)
    : [];
  const lsof9222 = run('lsof', ['-nP', '-iTCP:9222', '-sTCP:LISTEN'], runner);
  const port9222Listeners = lsof9222.ok
    ? lsof9222.stdout.split('\n').slice(1).map((line) => line.trim()).filter(Boolean)
    : [];
  const port9223Endpoint = probeDevtoolsVersion(9223, runner);
  const port9222Endpoint = probeDevtoolsVersion(9222, runner);
  const uid = typeof process.getuid === 'function' ? process.getuid() : Number(process.env.UID || 0);
  const launchAgents = CHROME_DEVTOOLS_LABELS.map((label) => {
    const result = run('launchctl', ['print', `gui/${uid}/${label}`], runner);
    return parseLaunchctlPrint(label, result.stdout || result.stderr, result.ok);
  });
  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    uid,
    commandStatus: {
      ps: { ok: ps.ok, status: ps.status, error: ps.error || ps.stderr.trim() },
      agentBrowserSessionList: { ok: sessionList.ok, status: sessionList.status, error: sessionList.error || sessionList.stderr.trim() },
      lsof9223: { ok: lsof.ok, status: lsof.status, error: lsof.error || lsof.stderr.trim() },
      lsof9222: { ok: lsof9222.ok, status: lsof9222.status, error: lsof9222.error || lsof9222.stderr.trim() },
      devtoolsVersion9223: { ok: port9223Endpoint.ok, status: port9223Endpoint.httpStatus, error: port9223Endpoint.error },
      devtoolsVersion9222: { ok: port9222Endpoint.ok, status: port9222Endpoint.httpStatus, error: port9222Endpoint.error }
    },
    processes,
    sessions,
    port9223Listeners,
    port9222Listeners,
    devtoolsEndpoints: {
      port9223: port9223Endpoint,
      port9222: port9222Endpoint
    },
    launchAgents,
    currentPid: process.pid
  };
}

export function buildRuntimeAudit(options = {}) {
  const state = collectRuntimeState(options);
  return {
    generatedAt: state.generatedAt,
    platform: state.platform,
    uid: state.uid,
    commandStatus: state.commandStatus,
    ...analyzeRuntimeState(state)
  };
}

export function buildRuntimeCleanupPlan(options = {}) {
  const audit = options.audit || buildRuntimeAudit(options);
  const ownerLimit = Number(options.ownerLimit || 12);
  const allOwners = audit.agentOwners || [];
  const currentOwners = allOwners.filter((owner) => owner.current);
  const listedOwners = [
    ...currentOwners,
    ...allOwners.filter((owner) => !owner.current).slice(0, Math.max(0, ownerLimit - currentOwners.length))
  ];
  const ownerSessions = listedOwners.map((owner) => ({
    ownerPid: owner.ownerPid,
    ownerCommand: owner.ownerCommand,
    ownerEtime: owner.ownerEtime,
    childCount: owner.childCount,
    groups: owner.groups,
    inspectCommand: owner.ownerPid ? `ps -p ${owner.ownerPid} -o pid,ppid,etime,stat,command` : '',
    inspectChildrenCommand: owner.ownerPid ? `pgrep -P ${owner.ownerPid} -fl 'chrome-devtools-mcp|peekaboo|mcp'` : '',
    expectedReduction: {
      chromeDevtoolsMcp: owner.groups?.chromeDevtoolsMcp || 0,
      peekaboo: owner.groups?.peekaboo || 0,
      mcpdoc: owner.groups?.mcpdoc || 0,
      computerUse: owner.groups?.computerUse || 0,
      totalBrowserMcp: (owner.groups?.chromeDevtoolsMcp || 0) + (owner.groups?.peekaboo || 0)
    },
    cleanupImpact: ((owner.groups?.chromeDevtoolsMcp || 0) + (owner.groups?.peekaboo || 0)) >= 20
      ? 'high'
      : ((owner.groups?.chromeDevtoolsMcp || 0) + (owner.groups?.peekaboo || 0)) >= 5
      ? 'medium'
      : 'low',
    current: Boolean(owner.current),
    recommendedAction: owner.current
      ? 'Keep this current agent session open while this run is active; close only after the conversation is finished.'
      : owner.ownerPid
      ? 'Review this parent agent session and close its Codex/Claude window or terminal if it is stale.'
      : 'Review the unowned parent process before taking any action.'
  }));
  const staleAgentBrowserSessionSteps = (audit.agentBrowser?.staleSessions || []).map((session) => ({
    session,
    command: `agent-browser --session ${session} close`,
    reason: 'Matches a known temporary probe session name.'
  }));
  const launchAgentSteps = [];
  if (audit.chromeDevtools?.duplicateLaunchAgents) {
    launchAgentSteps.push({
      action: 'keep-one-launchagent',
      reason: 'More than one LaunchAgent appears to manage the same 127.0.0.1:9223 Chrome profile.',
      inspectCommand: 'launchctl list | rg "chrome-devtools|browser-agent"',
      manualAction: 'Choose one Chrome DevTools LaunchAgent and unload only the duplicate after review.'
    });
  }
  return {
    generatedAt: audit.generatedAt,
    safeMode: true,
    destructiveActionsIncluded: false,
    summary: {
      ownerSessionCount: audit.agentOwners?.length || 0,
      listedOwnerSessions: ownerSessions.length,
      staleAgentBrowserSessionCount: audit.agentBrowser?.staleSessions?.length || 0,
      duplicateDevtoolsLaunchAgents: Boolean(audit.chromeDevtools?.duplicateLaunchAgents),
      port9223Listeners: audit.chromeDevtools?.listeners?.length || 0,
      port9222Listeners: audit.chromeDevtools?.diaListeners?.length || 0,
      port9223EndpointOk: Boolean(audit.chromeDevtools?.endpoint?.ok),
      port9222EndpointOk: Boolean(audit.chromeDevtools?.diaEndpoint?.ok),
      peekabooServers: audit.processBreakdown?.peekaboo?.parts?.server || 0,
      chromeDevtoolsMcpServers: audit.processBreakdown?.chromeDevtoolsMcp?.parts?.server || 0
    },
    keep: [
      'Keep the 127.0.0.1:9223 Chrome DevTools browser if background authenticated browsing is desired.',
      'Keep browser-use-reap style cleanup jobs when they are bounded to known browser-use state.',
      'Keep active Codex/Claude sessions that are still in use.'
    ],
    ownerSessions,
    staleAgentBrowserSessionSteps,
    launchAgentSteps,
    doNotDo: [
      'Do not kill Peekaboo, mcpdoc, 1Password MCP, or Chrome DevTools MCP child processes blindly.',
      'Do not unload LaunchAgents until the matching browser/session owner is understood.',
      'Do not copy Chrome cookies, session DBs, or auth artifacts into shared docs or logs.'
    ],
    validationCommands: [
      'npm run probe:runtime-audit',
      shellCommand(['node', 'src/cli.mjs', 'runtime-cleanup-plan', '--format', 'compact', '--owner-limit', String(ownerLimit)]),
      shellCommand(['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan', '--observed-connected', 'yes', '--observed-page-list-ok', 'no', '--observed-last-error', 'Network.enable timed out', '--observed-source', 'post-cleanup-retry', '--format', 'compact']),
      'lsof -nP -iTCP:9223 -sTCP:LISTEN',
      'launchctl list | rg -i "chrome|devtools|browser|agent"'
    ],
    chromeMcpRetry: {
      afterParentSessionReview: 'Run Peekaboo browser status, reconnect if needed, then list_pages. Only treat everyday Chrome as operable after list_pages succeeds.',
      statusTool: 'mcp__peekaboo__.browser action=status',
      connectTool: 'mcp__peekaboo__.browser action=connect',
      listPagesTool: 'mcp__peekaboo__.browser action=list_pages',
      timeoutPlanCommand: shellCommand(['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan', '--observed-connected', 'yes', '--observed-page-list-ok', 'no', '--observed-last-error', 'Network.enable timed out', '--observed-source', 'post-cleanup-retry', '--format', 'compact'])
    }
  };
}

export function writeRuntimeAuditReport(rootDir, audit, outPath = '') {
  const target = safeRuntimeArtifactPath(rootDir, outPath, 'runtime-audit.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return target;
}

export function writeRuntimeCleanupPlanReport(rootDir, plan, outPath = '') {
  const target = safeRuntimeArtifactPath(rootDir, outPath, 'runtime-cleanup-plan.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return target;
}

export function formatRuntimeAuditMarkdown(audit) {
  const lines = [
    '# Secure Browser Agent Runtime Audit',
    '',
    `Generated: ${audit.generatedAt}`,
    '',
    '## Counts',
    '',
    '| Group | Count |',
    '| --- | ---: |'
  ];
  for (const group of Object.values(audit.groups)) {
    lines.push(`| ${group.name} | ${group.count} |`);
  }
  lines.push('', '## Process Breakdown', '');
  lines.push('| Tool | Total | Wrapper | Server | Watchdog | Other |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const item of Object.values(audit.processBreakdown || {})) {
    lines.push(`| ${item.name} | ${item.total} | ${item.parts.wrapper || 0} | ${item.parts.server || 0} | ${item.parts.watchdog || 0} | ${item.parts.other || 0} |`);
  }
  lines.push('', '## Agent Browser', '');
  lines.push(`- Sessions: ${audit.agentBrowser.sessions.join(', ') || 'none'}`);
  lines.push(`- Stale sessions: ${audit.agentBrowser.staleSessions.join(', ') || 'none'}`);
  lines.push('', '## Agent Session Owners', '');
  if (!audit.agentOwners || audit.agentOwners.length === 0) {
    lines.push('- none');
  } else {
    for (const owner of audit.agentOwners.slice(0, 20)) {
      const groupSummary = Object.entries(owner.groups)
        .map(([name, count]) => `${name}=${count}`)
        .join(', ');
      const pid = owner.ownerPid ? `pid=${owner.ownerPid}` : 'pid=unknown';
      const etime = owner.ownerEtime ? ` etime=${owner.ownerEtime}` : '';
      const current = owner.current ? ' current=yes' : '';
      lines.push(`- ${owner.ownerCommand} (${pid}${etime}${current}): children=${owner.childCount}; ${groupSummary}`);
    }
    if (audit.agentOwners.length > 20) {
      lines.push(`- ... ${audit.agentOwners.length - 20} more owner session(s)`);
    }
  }
  lines.push('', '## Chrome DevTools', '');
  if (audit.chromeApp) {
    lines.push(`- Chrome app parent processes: ${audit.chromeApp.total}`);
    lines.push(`- Regular Chrome profiles: ${audit.chromeApp.regularProfiles}`);
    lines.push(`- Regular Chrome remote debugging: ${audit.chromeApp.regularProfileRemoteDebugging > 0 ? 'yes' : 'no'}`);
    lines.push(`- Target-pack Chrome profiles: ${audit.chromeApp.targetPackProfiles}`);
    lines.push(`- Target-pack Chrome remote debugging: ${audit.chromeApp.targetProfileRemoteDebugging > 0 ? 'yes' : 'no'}`);
    lines.push(`- Codex Browser Agent Chrome profiles: ${audit.chromeApp.codexBrowserAgentProfiles}`);
  }
  lines.push(`- Port: ${audit.chromeDevtools.port}`);
  lines.push(`- 9223 listeners: ${audit.chromeDevtools.listeners.length}`);
  if (audit.chromeDevtools.endpoint) {
    const endpoint = audit.chromeDevtools.endpoint;
    const details = endpoint.ok
      ? `${endpoint.browser || 'DevTools JSON'}; websocket=${endpoint.webSocketDebuggerUrlPresent ? 'yes' : 'no'}`
      : endpoint.error || 'not available';
    lines.push(`- 9223 /json/version: ${endpoint.ok ? 'ok' : 'not ok'} (${details})`);
  }
  lines.push(`- Dia 9222 listeners: ${audit.chromeDevtools.diaListeners?.length || 0}`);
  if (audit.chromeDevtools.diaEndpoint) {
    const endpoint = audit.chromeDevtools.diaEndpoint;
    const details = endpoint.ok
      ? `${endpoint.browser || 'DevTools JSON'}; websocket=${endpoint.webSocketDebuggerUrlPresent ? 'yes' : 'no'}`
      : endpoint.error || 'not available';
    lines.push(`- 9222 /json/version: ${endpoint.ok ? 'ok' : 'not ok'} (${details})`);
  }
  for (const agent of audit.chromeDevtools.launchAgents) {
    lines.push(`- LaunchAgent ${agent.label}: ${agent.loaded ? 'loaded' : 'missing'} (${agent.state})`);
  }
  lines.push('', '## Recommendations', '');
  for (const item of audit.recommendations) {
    lines.push(`- ${item.level}: ${item.name} - ${item.detail}`);
    for (const command of item.commands || []) {
      lines.push(`  - \`${command}\``);
    }
  }
  if (audit.outputPath) {
    lines.push('', '## Written Report', '');
    lines.push(`- Path: ${audit.outputPath}`);
  }
  return `${lines.join('\n')}\n`;
}

function compactValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

export function formatRuntimeAuditCompact(audit) {
  const processBreakdown = audit.processBreakdown || {};
  const chromeDevtools = audit.chromeDevtools || {};
  const chromeApp = audit.chromeApp || {};
  const recommendations = audit.recommendations || [];
  const firstAction = recommendations.find((item) => item.level !== 'pass') || recommendations[0] || null;
  const lines = [
    `ok: ${yesNo(audit.ok)}`,
    `owner_sessions: ${audit.agentOwners?.length || 0}`,
    `current_owner_pid: ${audit.currentSession?.ownerPid || 'none'}`,
    `peekaboo_total: ${processBreakdown.peekaboo?.total || 0}`,
    `peekaboo_servers: ${processBreakdown.peekaboo?.parts?.server || 0}`,
    `chrome_devtools_mcp_total: ${processBreakdown.chromeDevtoolsMcp?.total || 0}`,
    `chrome_devtools_mcp_servers: ${processBreakdown.chromeDevtoolsMcp?.parts?.server || 0}`,
    `chrome_devtools_mcp_watchdogs: ${processBreakdown.chromeDevtoolsMcp?.parts?.watchdog || 0}`,
    `computer_use_mcp: ${processBreakdown.computerUse?.parts?.server || 0}`,
    `agent_browser_sessions: ${audit.agentBrowser?.sessions?.length || 0}`,
    `stale_agent_browser_sessions: ${audit.agentBrowser?.staleSessions?.length || 0}`,
    `chrome_app_processes: ${chromeApp.total || 0}`,
    `regular_chrome_profiles: ${chromeApp.regularProfiles || 0}`,
    `regular_chrome_debuggable: ${yesNo((chromeApp.regularProfileRemoteDebugging || 0) > 0)}`,
    `target_chrome_profiles: ${chromeApp.targetPackProfiles || 0}`,
    `target_chrome_debuggable: ${yesNo((chromeApp.targetProfileRemoteDebugging || 0) > 0)}`,
    `codex_chrome_profiles: ${chromeApp.codexBrowserAgentProfiles || 0}`,
    `port_9223_listeners: ${chromeDevtools.listeners?.length || 0}`,
    `port_9223_ok: ${yesNo(chromeDevtools.endpoint?.ok)}`,
    `port_9223_browser: ${compactValue(chromeDevtools.endpoint?.browser || 'none')}`,
    `port_9222_listeners: ${chromeDevtools.diaListeners?.length || 0}`,
    `port_9222_ok: ${yesNo(chromeDevtools.diaEndpoint?.ok)}`,
    `duplicate_devtools_launchagents: ${yesNo(chromeDevtools.duplicateLaunchAgents)}`,
    `recommendations: ${recommendations.length}`,
    `next: ${compactValue(firstAction?.name || 'none')}`
  ];
  if (firstAction?.detail) lines.push(`detail: ${compactValue(firstAction.detail)}`);
  if (recommendations.some((item) => item.level !== 'pass')) {
    lines.push("command: 'node' 'src/cli.mjs' 'runtime-cleanup-plan' '--format' 'compact'");
  }
  return `${lines.join('\n')}\n`;
}

export function formatRuntimeCleanupPlanMarkdown(plan) {
  const lines = [
    '# Secure Browser Agent Runtime Cleanup Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    '',
    '## Safety',
    '',
    `- Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `- Destructive actions included: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Owner sessions with browser/MCP children: ${plan.summary.ownerSessionCount}`,
    `- Owner sessions listed for review: ${plan.summary.listedOwnerSessions}`,
    `- Stale agent-browser sessions: ${plan.summary.staleAgentBrowserSessionCount}`,
    `- Duplicate DevTools LaunchAgents: ${plan.summary.duplicateDevtoolsLaunchAgents ? 'yes' : 'no'}`,
    `- 9223 listeners: ${plan.summary.port9223Listeners}`,
    `- 9223 /json/version OK: ${plan.summary.port9223EndpointOk ? 'yes' : 'no'}`,
    `- Dia 9222 listeners: ${plan.summary.port9222Listeners}`,
    `- Dia 9222 /json/version OK: ${plan.summary.port9222EndpointOk ? 'yes' : 'no'}`,
    `- Peekaboo MCP servers: ${plan.summary.peekabooServers}`,
    `- Chrome DevTools MCP servers: ${plan.summary.chromeDevtoolsMcpServers}`,
    '',
    '## Keep',
    ''
  ];
  for (const item of plan.keep) lines.push(`- ${item}`);
  lines.push('', '## Review Parent Sessions First', '');
  if (plan.ownerSessions.length === 0) {
    lines.push('- none');
  } else {
    for (const owner of plan.ownerSessions) {
      const groupSummary = Object.entries(owner.groups || {})
        .map(([name, count]) => `${name}=${count}`)
        .join(', ');
      const pid = owner.ownerPid ? `pid=${owner.ownerPid}` : 'pid=unknown';
      const etime = owner.ownerEtime ? ` etime=${owner.ownerEtime}` : '';
      const current = owner.current ? ' current=yes' : '';
      lines.push(`- ${owner.ownerCommand} (${pid}${etime}${current}): children=${owner.childCount}; ${groupSummary}`);
      if (owner.inspectCommand) lines.push(`  - inspect: \`${owner.inspectCommand}\``);
      if (owner.inspectChildrenCommand) lines.push(`  - inspect children: \`${owner.inspectChildrenCommand}\``);
      if (owner.expectedReduction) {
        lines.push(`  - expected reduction: ChromeMCP=${owner.expectedReduction.chromeDevtoolsMcp}, Peekaboo=${owner.expectedReduction.peekaboo}, impact=${owner.cleanupImpact}`);
      }
      lines.push(`  - action: ${owner.recommendedAction}`);
    }
  }
  lines.push('', '## Stale Agent-Browser Sessions', '');
  if (plan.staleAgentBrowserSessionSteps.length === 0) {
    lines.push('- none');
  } else {
    for (const step of plan.staleAgentBrowserSessionSteps) {
      lines.push(`- ${step.session}: \`${step.command}\` - ${step.reason}`);
    }
  }
  lines.push('', '## LaunchAgents', '');
  if (plan.launchAgentSteps.length === 0) {
    lines.push('- no duplicate Chrome DevTools LaunchAgent action planned');
  } else {
    for (const step of plan.launchAgentSteps) {
      lines.push(`- ${step.action}: ${step.reason}`);
      lines.push(`  - inspect: \`${step.inspectCommand}\``);
      lines.push(`  - manual action: ${step.manualAction}`);
    }
  }
  lines.push('', '## Do Not Do', '');
  for (const item of plan.doNotDo) lines.push(`- ${item}`);
  lines.push('', '## Validate After Cleanup', '');
  for (const command of plan.validationCommands) lines.push(`- \`${command}\``);
  if (plan.chromeMcpRetry) {
    lines.push('', '## Chrome MCP Retry', '');
    lines.push(`- ${plan.chromeMcpRetry.afterParentSessionReview}`);
    lines.push(`- Status: \`${plan.chromeMcpRetry.statusTool}\``);
    lines.push(`- Connect: \`${plan.chromeMcpRetry.connectTool}\``);
    lines.push(`- List pages: \`${plan.chromeMcpRetry.listPagesTool}\``);
    lines.push(`- Timeout plan: \`${plan.chromeMcpRetry.timeoutPlanCommand}\``);
  }
  if (plan.outputPath) {
    lines.push('', '## Written Report', '');
    lines.push(`- Path: ${plan.outputPath}`);
  }
  return `${lines.join('\n')}\n`;
}

export function formatRuntimeCleanupPlanCompact(plan) {
  const currentOwner = (plan.ownerSessions || []).find((owner) => owner.current);
  const firstReviewOwner = (plan.ownerSessions || []).find((owner) => !owner.current) || null;
  const reviewOwners = (plan.ownerSessions || []).filter((owner) => !owner.current);
  const reviewOwnerPids = reviewOwners.map((owner) => owner.ownerPid || 'unowned').join(',') || 'none';
  const reviewOwnerTop = reviewOwners.slice(0, 5).map((owner) => {
    const chromeMcp = owner.groups?.chromeDevtoolsMcp || 0;
    const peekaboo = owner.groups?.peekaboo || 0;
    return `${owner.ownerPid || 'unowned'}:children=${owner.childCount},chromeMcp=${chromeMcp},peekaboo=${peekaboo}`;
  }).join(';') || 'none';
  const reviewOwnerInspect = reviewOwners.slice(0, 5).map((owner) => {
    const pid = owner.ownerPid || 'unowned';
    const inspectCommand = owner.inspectCommand || 'none';
    return `${pid}='${inspectCommand.replaceAll("'", "'\\''")}'`;
  }).join(';') || 'none';
  const reviewOwnerChildren = reviewOwners.slice(0, 5).map((owner) => {
    const pid = owner.ownerPid || 'unowned';
    const inspectCommand = owner.inspectChildrenCommand || 'none';
    return `${pid}='${inspectCommand.replaceAll("'", "'\\''")}'`;
  }).join(';') || 'none';
  const reviewOwnerImpact = reviewOwners.slice(0, 5).map((owner) => {
    const reduction = owner.expectedReduction || {};
    return `${owner.ownerPid || 'unowned'}:${owner.cleanupImpact || 'unknown'},chromeMcp=${reduction.chromeDevtoolsMcp || 0},peekaboo=${reduction.peekaboo || 0}`;
  }).join(';') || 'none';
  let next = 'none';
  if (plan.summary?.staleAgentBrowserSessionCount > 0) next = 'close-stale-agent-browser-sessions';
  else if (plan.summary?.duplicateDevtoolsLaunchAgents) next = 'review-duplicate-devtools-launchagents';
  else if (firstReviewOwner) next = 'review-parent-agent-sessions';
  const lines = [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `owner_sessions: ${plan.summary?.ownerSessionCount || 0}`,
    `listed_owner_sessions: ${plan.summary?.listedOwnerSessions || 0}`,
    `current_owner_pid: ${currentOwner?.ownerPid || 'none'}`,
    `review_owner_pid: ${firstReviewOwner?.ownerPid || 'none'}`,
    `review_owner_pids: ${reviewOwnerPids}`,
    `review_owner_top: ${reviewOwnerTop}`,
    `review_owner_inspect: ${reviewOwnerInspect}`,
    `review_owner_children: ${reviewOwnerChildren}`,
    `review_owner_impact: ${reviewOwnerImpact}`,
    `stale_agent_browser_sessions: ${plan.summary?.staleAgentBrowserSessionCount || 0}`,
    `duplicate_devtools_launchagents: ${yesNo(plan.summary?.duplicateDevtoolsLaunchAgents)}`,
    `peekaboo_servers: ${plan.summary?.peekabooServers || 0}`,
    `chrome_devtools_mcp_servers: ${plan.summary?.chromeDevtoolsMcpServers || 0}`,
    `port_9223_listeners: ${plan.summary?.port9223Listeners || 0}`,
    `port_9223_ok: ${yesNo(plan.summary?.port9223EndpointOk)}`,
    `port_9222_listeners: ${plan.summary?.port9222Listeners || 0}`,
    `port_9222_ok: ${yesNo(plan.summary?.port9222EndpointOk)}`,
    `next: ${next}`,
    `post_cleanup_validate: ${shellCommand(['node', 'src/cli.mjs', 'runtime-cleanup-plan', '--format', 'compact', '--owner-limit', String((plan.ownerSessions || []).length || 8)])}`,
    `chrome_mcp_retry_plan: ${plan.chromeMcpRetry?.timeoutPlanCommand || shellCommand(['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan', '--format', 'compact'])}`,
    "validate: 'npm' 'run' 'probe:runtime-audit'"
  ];
  return `${lines.join('\n')}\n`;
}
