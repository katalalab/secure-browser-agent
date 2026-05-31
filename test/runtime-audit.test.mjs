import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeRuntimeState, buildRuntimeCleanupPlan, formatRuntimeAuditCompact, formatRuntimeAuditMarkdown, formatRuntimeCleanupPlanCompact, formatRuntimeCleanupPlanMarkdown, parseAgentBrowserSessions, parseDevtoolsVersionProbe, parseProcessTable, summarizeAgentOwners, writeRuntimeAuditReport, writeRuntimeCleanupPlanReport } from '../src/runtime-audit.mjs';

test('runtime audit parses ps output with elapsed time and command', () => {
  const processes = parseProcessTable(`  PID  PPID     ELAPSED STAT COMMAND
  100     1    01:02:03 Ss   npm exec @steipete/peekaboo mcp
  101   100       02:03 S    peekaboo mcp
  200     1    00:00:05 S    /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9223
`);
  assert.equal(processes.length, 3);
  assert.equal(processes[0].pid, 100);
  assert.equal(processes[0].etime, '01:02:03');
  assert.match(processes[2].command, /remote-debugging-port=9223/);
});

test('runtime audit parses agent-browser session list', () => {
  assert.deepEqual(parseAgentBrowserSessions(`Active sessions:
  public
  verify-123
  pw-probe
`), ['public', 'verify-123', 'pw-probe']);
});

test('runtime audit parses DevTools version probes without exposing websocket URLs', () => {
  const ok = parseDevtoolsVersionProbe(9223, {
    ok: true,
    stdout: '{"Browser":"Chrome/149.0.1","Protocol-Version":"1.3","webSocketDebuggerUrl":"ws://127.0.0.1/devtools/browser/secret"}\n200',
    stderr: ''
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.httpStatus, 200);
  assert.equal(ok.browser, 'Chrome/149.0.1');
  assert.equal(ok.protocolVersion, '1.3');
  assert.equal(ok.webSocketDebuggerUrlPresent, true);
  assert.equal(JSON.stringify(ok).includes('secret'), false);

  const notJson = parseDevtoolsVersionProbe(9222, {
    ok: true,
    stdout: '<html>not found</html>\n404',
    stderr: ''
  });
  assert.equal(notJson.ok, false);
  assert.equal(notJson.httpStatus, 404);
  assert.match(notJson.error, /Unexpected token|HTTP 404/);
});

test('runtime audit classifies duplicate tools and stale sessions', () => {
  const audit = analyzeRuntimeState({
    sessions: ['public', 'verify-123', 'pw-probe'],
    port9223Listeners: ['Google 200 user TCP 127.0.0.1:9223 (LISTEN)'],
    port9222Listeners: ['Dia 42627 user TCP 127.0.0.1:9222 (LISTEN)'],
    devtoolsEndpoints: {
      port9223: { port: 9223, ok: true, httpStatus: 200, browser: 'Chrome/149.0.1', webSocketDebuggerUrlPresent: true, error: '' },
      port9222: { port: 9222, ok: false, httpStatus: 404, browser: '', webSocketDebuggerUrlPresent: false, error: 'HTTP 404' }
    },
    launchAgents: [
      { label: 'com.s30519.agent-chrome-devtools', loaded: true, state: 'not running' },
      { label: 'com.katala.chrome-devtools-browser-agent', loaded: true, state: 'not running' }
    ],
    processes: [
      { pid: 100, ppid: 1, etime: '01:00', stat: 'S', command: 'npm exec @steipete/peekaboo mcp' },
      { pid: 101, ppid: 100, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 102, ppid: 1, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 103, ppid: 1, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 104, ppid: 1, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 105, ppid: 1, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 106, ppid: 1, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 107, ppid: 1, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 108, ppid: 1, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 120, ppid: 1, etime: '01:00', stat: 'S', command: 'npm exec chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9223' },
      { pid: 121, ppid: 120, etime: '01:00', stat: 'S', command: 'chrome-devtools-mcp NODE=/Users/test/.nvm/bin/node' },
      { pid: 122, ppid: 121, etime: '01:00', stat: 'S', command: 'node /repo/chrome-devtools-mcp/build/src/telemetry/watchdog/main.js' },
      { pid: 190, ppid: 1, etime: '02:00', stat: 'S', command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { pid: 195, ppid: 1, etime: '02:00', stat: 'S', command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=0 --user-data-dir=/Users/test/work/agent-tools/secure-browser-agent/runs/target-packs/github/profiles/github https://github.com/login' },
      { pid: 200, ppid: 1, etime: '02:00', stat: 'S', command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9223 --user-data-dir=/Users/test/Library/Application Support/Codex Browser Agent/Chrome' },
      { pid: 210, ppid: 1, etime: '02:00', stat: 'S', command: '/Applications/Dia.app/Contents/MacOS/Dia --some-flag' },
      { pid: 300, ppid: 1, etime: '02:00', stat: 'S', command: '/Users/test/.nvm/bin/agent-browser-darwin-arm64' }
    ]
  });
  assert.equal(audit.groups.peekaboo.count, 9);
  assert.equal(audit.groups.chromeDevtoolsMcp.count, 3);
  assert.equal(audit.groups.dia.count, 1);
  assert.equal(audit.processBreakdown.peekaboo.parts.wrapper, 1);
  assert.equal(audit.processBreakdown.peekaboo.parts.server, 8);
  assert.equal(audit.processBreakdown.chromeDevtoolsMcp.parts.wrapper, 1);
  assert.equal(audit.processBreakdown.chromeDevtoolsMcp.parts.server, 1);
  assert.equal(audit.processBreakdown.chromeDevtoolsMcp.parts.watchdog, 1);
  assert.equal(audit.chromeDevtools.diaListeners.length, 1);
  assert.equal(audit.chromeDevtools.endpoint.ok, true);
  assert.equal(audit.chromeDevtools.diaEndpoint.ok, false);
  assert.equal(audit.chromeApp.total, 3);
  assert.equal(audit.chromeApp.regularProfiles, 1);
  assert.equal(audit.chromeApp.regularProfileRemoteDebugging, 0);
  assert.equal(audit.chromeApp.targetPackProfiles, 1);
  assert.equal(audit.chromeApp.targetProfileRemoteDebugging, 1);
  assert.equal(audit.chromeApp.codexBrowserAgentProfiles, 1);
  assert.deepEqual(audit.agentBrowser.staleSessions, ['verify-123', 'pw-probe']);
  assert.equal(audit.chromeDevtools.duplicateLaunchAgents, true);
  assert.equal(audit.recommendations.some((item) => item.name === 'agent-browser.staleSessions'), true);
  assert.equal(audit.recommendations.some((item) => item.name === 'chrome-devtools.duplicateLaunchAgents'), true);
  assert.equal(audit.recommendations.some((item) => item.name === 'dia.notDevtoolsJson'), true);

  const compact = formatRuntimeAuditCompact(audit);
  assert.match(compact, /^ok: no/m);
  assert.match(compact, /^peekaboo_total: 9/m);
  assert.match(compact, /^peekaboo_servers: 8/m);
  assert.match(compact, /^chrome_devtools_mcp_total: 3/m);
  assert.match(compact, /^chrome_devtools_mcp_servers: 1/m);
  assert.match(compact, /^chrome_devtools_mcp_watchdogs: 1/m);
  assert.match(compact, /^agent_browser_sessions: 3/m);
  assert.match(compact, /^stale_agent_browser_sessions: 2/m);
  assert.match(compact, /^chrome_app_processes: 3/m);
  assert.match(compact, /^regular_chrome_profiles: 1/m);
  assert.match(compact, /^regular_chrome_debuggable: no/m);
  assert.match(compact, /^target_chrome_profiles: 1/m);
  assert.match(compact, /^target_chrome_debuggable: yes/m);
  assert.match(compact, /^codex_chrome_profiles: 1/m);
  assert.match(compact, /^port_9223_listeners: 1/m);
  assert.match(compact, /^port_9223_ok: yes/m);
  assert.match(compact, /^port_9223_browser: Chrome\/149\.0\.1/m);
  assert.match(compact, /^port_9222_listeners: 1/m);
  assert.match(compact, /^port_9222_ok: no/m);
  assert.match(compact, /^duplicate_devtools_launchagents: yes/m);
  assert.match(compact, /^next: peekaboo\.duplicated/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'runtime-cleanup-plan' '--format' 'compact'/m);
});

test('runtime audit groups MCP children by agent owner sessions', () => {
  const processes = [
    { pid: 10, ppid: 1, etime: '01:00', stat: 'S+', command: 'codex' },
    { pid: 20, ppid: 10, etime: '01:00', stat: 'S', command: 'npm exec @steipete/peekaboo mcp' },
    { pid: 21, ppid: 20, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
    { pid: 30, ppid: 10, etime: '01:00', stat: 'S', command: '/Applications/1Password.app/Contents/MacOS/onepassword-mcp' },
    { pid: 40, ppid: 1, etime: '02:00', stat: 'S+', command: 'claude' },
    { pid: 41, ppid: 40, etime: '02:00', stat: 'S', command: 'node /repo/node_modules/@playwright/mcp/cli.js --browser chrome' }
  ];
  const audit = analyzeRuntimeState({ processes });
  assert.equal(audit.agentOwners.length, 2);
  assert.equal(audit.agentOwners[0].ownerPid, 10);
  assert.deepEqual(audit.agentOwners[0].groups, { peekaboo: 2, onepassword: 1 });
  assert.equal(audit.agentOwners[1].ownerPid, 40);

  const direct = summarizeAgentOwners(processes, audit.groups);
  assert.equal(direct[0].childCount, 3);
});

test('runtime audit marks current owner session', () => {
  const processes = [
    { pid: 10, ppid: 1, etime: '01:00', stat: 'S+', command: 'codex' },
    { pid: 20, ppid: 10, etime: '01:00', stat: 'S', command: 'node_repl' },
    { pid: 21, ppid: 20, etime: '01:00', stat: 'S', command: 'codex app-server --listen stdio://' },
    { pid: 30, ppid: 10, etime: '01:00', stat: 'S', command: 'npm exec @steipete/peekaboo mcp' },
    { pid: 31, ppid: 30, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
    { pid: 40, ppid: 1, etime: '02:00', stat: 'S+', command: 'codex' },
    { pid: 41, ppid: 40, etime: '02:00', stat: 'S', command: 'peekaboo mcp' }
  ];
  const audit = analyzeRuntimeState({ processes, currentPid: 21 });
  const currentOwner = audit.agentOwners.find((owner) => owner.current);

  assert.equal(currentOwner.ownerPid, 10);
  assert.equal(audit.currentSession.ownerPid, 10);

  const markdown = formatRuntimeAuditMarkdown({
    generatedAt: '2026-05-28T00:00:00.000Z',
    groups: audit.groups,
    agentOwners: audit.agentOwners,
    agentBrowser: audit.agentBrowser,
    chromeDevtools: audit.chromeDevtools,
    recommendations: audit.recommendations
  });
  assert.match(markdown, /codex \(pid=10 etime=01:00 current=yes\)/);
});

test('runtime audit markdown includes cleanup commands', () => {
  const audit = analyzeRuntimeState({
    sessions: ['verify-123'],
    launchAgents: [],
    processes: []
  });
  const markdown = formatRuntimeAuditMarkdown({
    generatedAt: '2026-05-28T00:00:00.000Z',
    groups: audit.groups,
    agentBrowser: audit.agentBrowser,
    chromeDevtools: audit.chromeDevtools,
    recommendations: audit.recommendations
  });
  assert.match(markdown, /Secure Browser Agent Runtime Audit/);
  assert.match(markdown, /Process Breakdown/);
  assert.match(markdown, /Dia 9222 listeners: 0/);
  assert.match(markdown, /agent-browser --session verify-123 close/);
});

test('runtime audit markdown lists agent session owners', () => {
  const audit = analyzeRuntimeState({
    processes: [
      { pid: 10, ppid: 1, etime: '01:00', stat: 'S+', command: 'codex' },
      { pid: 11, ppid: 10, etime: '01:00', stat: 'S', command: 'npm exec chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9223' },
      { pid: 12, ppid: 11, etime: '01:00', stat: 'S', command: 'chrome-devtools-mcp' }
    ]
  });
  const markdown = formatRuntimeAuditMarkdown({
    generatedAt: '2026-05-28T00:00:00.000Z',
    groups: audit.groups,
    agentOwners: audit.agentOwners,
    agentBrowser: audit.agentBrowser,
    chromeDevtools: audit.chromeDevtools,
    recommendations: audit.recommendations
  });
  assert.match(markdown, /Agent Session Owners/);
  assert.match(markdown, /codex \(pid=10 etime=01:00\): children=2; chromeDevtoolsMcp=2/);
});

test('runtime cleanup plan lists parent sessions without destructive commands', () => {
  const audit = analyzeRuntimeState({
    sessions: ['verify-123'],
    port9223Listeners: ['Google 200 user TCP 127.0.0.1:9223 (LISTEN)'],
    processes: [
      { pid: 10, ppid: 1, etime: '01:00', stat: 'S', command: 'codex' },
      { pid: 11, ppid: 10, etime: '01:00', stat: 'S', command: 'npm exec @steipete/peekaboo mcp' },
      { pid: 12, ppid: 11, etime: '01:00', stat: 'S', command: 'peekaboo mcp' }
    ]
  });
  const plan = buildRuntimeCleanupPlan({
    audit: {
      generatedAt: '2026-05-28T00:00:00.000Z',
      ...audit
    },
    ownerLimit: 1
  });
  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.ownerSessions.length, 1);
  assert.equal(plan.ownerSessions[0].inspectCommand, 'ps -p 10 -o pid,ppid,etime,stat,command');
  assert.equal(plan.ownerSessions[0].inspectChildrenCommand, "pgrep -P 10 -fl 'chrome-devtools-mcp|peekaboo|mcp'");
  assert.deepEqual(plan.ownerSessions[0].expectedReduction, {
    chromeDevtoolsMcp: 0,
    peekaboo: 2,
    mcpdoc: 0,
    computerUse: 0,
    totalBrowserMcp: 2
  });
  assert.equal(plan.ownerSessions[0].cleanupImpact, 'low');
  assert.match(plan.chromeMcpRetry.timeoutPlanCommand, /chrome-mcp-timeout-plan/);
  assert.deepEqual(plan.staleAgentBrowserSessionSteps.map((step) => step.command), ['agent-browser --session verify-123 close']);

  const markdown = formatRuntimeCleanupPlanMarkdown(plan);
  assert.match(markdown, /Runtime Cleanup Plan/);
  assert.match(markdown, /Peekaboo MCP servers/);
  assert.match(markdown, /inspect children: `pgrep -P 10 -fl 'chrome-devtools-mcp\|peekaboo\|mcp'`/);
  assert.match(markdown, /expected reduction: ChromeMCP=0, Peekaboo=2, impact=low/);
  assert.match(markdown, /Chrome MCP Retry/);
  assert.match(markdown, /Do not kill Peekaboo/);
  assert.doesNotMatch(markdown, /kill -9/);

  const compact = formatRuntimeCleanupPlanCompact(plan);
  assert.match(compact, /^safe_mode: yes/m);
  assert.match(compact, /^destructive_actions: no/m);
  assert.match(compact, /^owner_sessions: 1/m);
  assert.match(compact, /^listed_owner_sessions: 1/m);
  assert.match(compact, /^review_owner_pid: 10/m);
  assert.match(compact, /^review_owner_pids: 10/m);
  assert.match(compact, /^review_owner_top: 10:children=2,chromeMcp=0,peekaboo=2/m);
  assert.match(compact, /^review_owner_inspect: 10='ps -p 10 -o pid,ppid,etime,stat,command'/m);
  assert.match(compact, /^review_owner_children: 10='pgrep -P 10 -fl '\\''chrome-devtools-mcp\|peekaboo\|mcp'\\'''/m);
  assert.match(compact, /^review_owner_impact: 10:low,chromeMcp=0,peekaboo=2/m);
  assert.match(compact, /^stale_agent_browser_sessions: 1/m);
  assert.match(compact, /^peekaboo_servers: 1/m);
  assert.match(compact, /^next: close-stale-agent-browser-sessions/m);
  assert.match(compact, /^post_cleanup_validate: 'node' 'src\/cli\.mjs' 'runtime-cleanup-plan' '--format' 'compact' '--owner-limit' '1'/m);
  assert.match(compact, /^chrome_mcp_retry_plan: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan'/m);
  assert.match(compact, /^validate: 'npm' 'run' 'probe:runtime-audit'/m);
});

test('runtime cleanup plan keeps current owner listed even when owner limit is low', () => {
  const audit = analyzeRuntimeState({
    currentPid: 51,
    processes: [
      { pid: 10, ppid: 1, etime: '01:00', stat: 'S', command: 'codex' },
      { pid: 11, ppid: 10, etime: '01:00', stat: 'S', command: 'peekaboo mcp' },
      { pid: 12, ppid: 10, etime: '01:00', stat: 'S', command: 'mcpdoc' },
      { pid: 50, ppid: 1, etime: '00:10', stat: 'S', command: 'codex' },
      { pid: 51, ppid: 50, etime: '00:10', stat: 'S', command: 'node_repl' },
      { pid: 52, ppid: 51, etime: '00:10', stat: 'S', command: 'peekaboo mcp' }
    ]
  });
  const plan = buildRuntimeCleanupPlan({
    audit: {
      generatedAt: '2026-05-28T00:00:00.000Z',
      ...audit
    },
    ownerLimit: 1
  });

  assert.equal(plan.ownerSessions.length, 1);
  assert.equal(plan.ownerSessions[0].ownerPid, 50);
  assert.equal(plan.ownerSessions[0].current, true);
  assert.match(plan.ownerSessions[0].recommendedAction, /Keep this current agent session/);
  assert.match(formatRuntimeCleanupPlanCompact(plan), /^review_owner_pids: none$/m);

  const markdown = formatRuntimeCleanupPlanMarkdown(plan);
  assert.match(markdown, /pid=50 etime=00:10 current=yes/);
});

test('runtime reports write JSON only under runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-runtime-report-'));
  const audit = {
    generatedAt: '2026-05-28T00:00:00.000Z',
    groups: {},
    processBreakdown: {},
    agentOwners: [],
    agentBrowser: { sessions: [], staleSessions: [] },
    chromeDevtools: { port: 9223, listeners: [], diaListeners: [], launchAgents: [] },
    recommendations: []
  };
  const plan = {
    generatedAt: audit.generatedAt,
    safeMode: true,
    destructiveActionsIncluded: false,
    summary: {
      ownerSessionCount: 0,
      listedOwnerSessions: 0,
      staleAgentBrowserSessionCount: 0,
      duplicateDevtoolsLaunchAgents: false,
      port9223Listeners: 0,
      port9222Listeners: 0,
      peekabooServers: 0,
      chromeDevtoolsMcpServers: 0
    },
    keep: [],
    ownerSessions: [],
    staleAgentBrowserSessionSteps: [],
    launchAgentSteps: [],
    doNotDo: [],
    validationCommands: []
  };

  const auditPath = writeRuntimeAuditReport(rootDir, audit, 'runtime/audit.json');
  const planPath = writeRuntimeCleanupPlanReport(rootDir, plan, 'runtime/cleanup-plan.json');

  assert.equal(JSON.parse(fs.readFileSync(auditPath, 'utf8')).generatedAt, audit.generatedAt);
  assert.equal(JSON.parse(fs.readFileSync(planPath, 'utf8')).safeMode, true);
  assert.match(formatRuntimeAuditMarkdown({ ...audit, outputPath: auditPath }), /Written Report/);
  assert.match(formatRuntimeCleanupPlanMarkdown({ ...plan, outputPath: planPath }), /Written Report/);
  assert.throws(() => writeRuntimeAuditReport(rootDir, audit, '../audit.json'), /must stay under runs/);
  assert.throws(() => writeRuntimeCleanupPlanReport(rootDir, plan, '/tmp/cleanup.json'), /must stay under runs/);
});
