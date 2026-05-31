import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentTask, buildAgentTaskLoop, buildAgentTaskStatus, buildAgentTaskWatch, buildAgentTaskWatchStart, buildAgentTaskWatchStatus, formatAgentTaskCompact, formatAgentTaskLoopCompact, formatAgentTaskStatusCompact, formatAgentTaskWatchCompact, formatAgentTaskWatchStartCompact, formatAgentTaskWatchStatusCompact } from '../src/agent-task.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeTargetPack(rootDir) {
  const targetDir = path.join(rootDir, 'runs/target-packs/acme');
  writeJson(path.join(targetDir, 'policy.json'), {
    allowedOrigins: ['https://app.example.test', 'https://html.duckduckgo.com'],
    defaultProfile: 'acme',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: 'acme/outputs',
    profileDir: 'acme/profiles',
    redactKeys: ['cookie', 'authorization', 'token']
  });
  writeJson(path.join(targetDir, 'target.json'), {
    target: 'acme',
    origins: ['https://app.example.test'],
    loginUrl: 'https://app.example.test/login',
    pageUrl: 'https://app.example.test/dashboard',
    profile: 'acme'
  });
  writeJson(path.join(targetDir, 'recipes/observe.json'), {
    url: 'https://app.example.test/dashboard',
    steps: [{ type: 'observe', as: 'observe' }]
  });
  return targetDir;
}

const providerReport = {
  recommendation: {
    defaultBackend: 'direct-cdp-chrome',
    defaultAgentInterface: 'secure-browser-agent-mcp',
    publicCrawlAccelerator: 'lightpanda-pending-local-binary',
    richAutomationFallback: 'playwright-available-for-rich-tests'
  }
};

const publicRouteOptions = {
  providerReport,
  lightpandaDoctor: { readyForPublicBenchmark: false }
};

test('agent task plans public search without running by default', async () => {
  const task = await buildAgentTask({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    task: 'search',
    query: 'secure browser agent',
    provider: 'brave',
    ...publicRouteOptions
  });

  assert.equal(task.status, 'planned');
  assert.equal(task.runRequested, false);
  assert.equal(task.executed, false);
  assert.equal(task.executionAllowed, true);
  assert.equal(task.recommendedCommandId, 'public-search');
  assert.match(task.selectedCommand.shell, /search-cdp/);

  const compact = formatAgentTaskCompact(task);
  assert.match(compact, /^status: planned$/m);
  assert.match(compact, /^execution_allowed: yes$/m);
  assert.match(compact, /^recommended_command_id: public-search$/m);
});

test('agent task allows read-only existing-tab regular Chrome handoff', async () => {
  const task = await buildAgentTask({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    task: 'existing-tab',
    intent: 'inspect',
    mcpObservationIn: 'operator/chrome-mcp-observation-latest.json',
    matchOrigin: 'https://github.com',
    matchPath: '/notifications',
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'yes',
    ...publicRouteOptions
  });

  assert.equal(task.status, 'planned');
  assert.equal(task.executionAllowed, true);
  assert.equal(task.recommendedCommandId, 'regular-chrome-use');
  assert.match(task.selectedCommand.shell, /regular-chrome-use/);
  assert.match(task.selectedCommand.shell, /--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json/);
  assert.match(task.writeCommand.shell, /--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json/);
  assert.match(task.runCommand.shell, /--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json/);
  assert.match(task.runCommand.shell, /--match-origin' 'https:\/\/github\.com/);
  assert.match(task.runCommand.shell, /--match-path' '\/notifications/);
  assert.match(task.runCommand.shell, /--chrome-extension-backend-available' 'yes/);

  const compact = formatAgentTaskCompact(task);
  assert.match(compact, /^execution_allowed: yes$/m);
  assert.match(compact, /^recommended_command_id: regular-chrome-use$/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'regular-chrome-use'/m);
  assert.match(compact, /^command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
});

test('agent task preserves regular Chrome new background tab opt-in through safe run wrapper', async () => {
  let receivedCommand = null;
  const task = await buildAgentTask({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    run: true,
    task: 'existing-tab',
    intent: 'inspect',
    chromeMcpConnected: 'yes',
    chromeMcpTools: 29,
    chromeMcpPageListOk: 'no',
    chromeMcpLastError: 'Network.enable timed out',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'no',
    runner: (commandValue) => {
      receivedCommand = commandValue;
      return {
        status: 0,
        signal: '',
        error: '',
        stdout: 'ready: yes\nselected_lane: regular-chrome-mcp-new-background-tab\nnext_tool_args: {"action":"new_page","url":"<env:REGULAR_CHROME_URL>","background":true}\n',
        stderr: ''
      };
    },
    ...publicRouteOptions
  });

  assert.equal(task.status, 'executed');
  assert.equal(task.executionAllowed, true);
  assert.equal(task.route.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(task.route.backend, 'chrome-devtools-mcp');
  assert.equal(task.recommendedCommandId, 'regular-chrome-use');
  assert.deepEqual(receivedCommand.args.slice(0, 3), ['node', 'src/cli.mjs', 'regular-chrome-use']);
  assert.ok(receivedCommand.args.includes('--allow-new-background-tab'));
  assert.ok(receivedCommand.args.includes('--new-background-url-env'));
  assert.ok(task.writeCommand.args.includes('--allow-new-background-tab'));
  assert.ok(task.writeCommand.args.includes('--new-background-url-env'));
  assert.ok(task.runCommand.args.includes('--allow-new-background-tab'));
  assert.ok(task.runCommand.args.includes('--new-background-url-env'));

  const compact = formatAgentTaskCompact(task);
  assert.match(compact, /^executed: yes$/m);
  assert.match(compact, /^route_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'regular-chrome-use'.*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(compact, /selected_lane: regular-chrome-mcp-new-background-tab/);
  assert.doesNotMatch(compact, /https:\/\/github\.com/);
});

test('agent task runs an allowed public search through an injected runner', async () => {
  let receivedCommand = null;
  const task = await buildAgentTask({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    run: true,
    task: 'search',
    query: 'secure browser agent',
    provider: 'duckduckgo',
    ...publicRouteOptions,
    runner(command) {
      receivedCommand = command;
      return {
        status: 0,
        signal: '',
        error: '',
        stdout: '/tmp/sba/public/search.json\n',
        stderr: ''
      };
    }
  });

  assert.equal(task.status, 'executed');
  assert.equal(task.executed, true);
  assert.equal(task.exitStatus, 0);
  assert.match(receivedCommand.shell, /search-cdp/);
  assert.deepEqual(task.stdoutPreview, ['/tmp/sba/public/search.json']);
});

test('agent task falls back to another public search provider when the first result is challenged', async () => {
  const calls = [];
  const task = await buildAgentTask({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    run: true,
    task: 'search',
    query: 'secure browser agent',
    provider: 'duckduckgo',
    searchProviders: 'duckduckgo,brave,google',
    ...publicRouteOptions,
    runner(command) {
      const provider = command.args[command.args.indexOf('--provider') + 1];
      calls.push(provider);
      if (provider === 'duckduckgo') {
        return {
          status: 0,
          signal: '',
          error: '',
          stdout: JSON.stringify({ search: { provider, challenge: true, resultLinks: 0 }, page: {} }),
          stderr: ''
        };
      }
      return {
        status: 0,
        signal: '',
        error: '',
        stdout: JSON.stringify({ search: { provider, challenge: false, resultLinks: 3 }, page: {} }),
        stderr: ''
      };
    }
  });

  assert.equal(task.status, 'executed');
  assert.deepEqual(calls, ['duckduckgo', 'brave']);
  assert.equal(task.searchFallbackUsed, true);
  assert.equal(task.searchProvider, 'brave');
  assert.equal(task.searchUsable, true);
  assert.equal(task.searchResultLinks, 3);
  assert.equal(task.searchAttempts.length, 2);
  assert.match(task.selectedCommand.shell, /'--provider' 'brave'/);

  const compact = formatAgentTaskCompact(task);
  assert.match(compact, /^search_provider: brave$/m);
  assert.match(compact, /^search_usable: yes$/m);
  assert.match(compact, /^search_attempts: duckduckgo:0:0:challenge,brave:0:3:ok$/m);
});

test('agent task falls back to HTTP public search after browser providers are challenged', async () => {
  const task = await buildAgentTask({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    run: true,
    task: 'search',
    query: 'secure browser agent',
    provider: 'duckduckgo',
    searchProviders: 'duckduckgo,brave',
    ...publicRouteOptions,
    runner(command) {
      const provider = command.args[command.args.indexOf('--provider') + 1];
      return {
        status: 0,
        signal: '',
        error: '',
        stdout: JSON.stringify({ search: { provider, challenge: true, resultLinks: 0 }, page: {} }),
        stderr: ''
      };
    },
    fetcher: async () => ({
      status: 200,
      text: async () => `
        <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fone">One result</a>
        <a class="result__a" href="https://example.com/two">Two result</a>
      `
    })
  });

  assert.equal(task.status, 'executed');
  assert.equal(task.searchFallbackUsed, true);
  assert.equal(task.searchProvider, 'duckduckgo-http');
  assert.equal(task.searchUsable, true);
  assert.equal(task.searchResultLinks, 2);
  assert.equal(task.searchAttempts.length, 3);
  assert.match(task.selectedCommand.shell, /search-http/);

  const compact = formatAgentTaskCompact(task);
  assert.match(compact, /^search_provider: duckduckgo-http$/m);
  assert.match(compact, /^search_attempts: duckduckgo:0:0:challenge,brave:0:0:challenge,duckduckgo-http:0:2:ok$/m);
});

test('agent task writes compact handoff json under runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-write-'));
  try {
    const task = await buildAgentTask({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      write: true,
      out: 'operator/search-task.json',
      task: 'search',
      query: 'secure browser agent',
      ...publicRouteOptions
    });

    assert.equal(task.outputPath, path.join(rootDir, 'runs/operator/search-task.json'));
    assert.equal(task.outputRelative, 'operator/search-task.json');
    assert.match(task.writeCommand.shell, /agent-task/);
    assert.match(task.runCommand.shell, /--run/);
    assert.ok(fs.existsSync(task.outputPath));
    const saved = JSON.parse(fs.readFileSync(task.outputPath, 'utf8'));
    assert.equal(saved.secretValuesRead, false);
    assert.equal(saved.outputRelative, 'operator/search-task.json');

    const compact = formatAgentTaskCompact(task);
    assert.match(compact, /^write_requested: yes$/m);
    assert.match(compact, /^output_path: /m);
    assert.match(compact, /^run_command: 'node' 'src\/cli\.mjs' 'agent-task'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task rejects output paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-bad-out-'));
  try {
    await assert.rejects(
      buildAgentTask({
        rootDir,
        write: true,
        out: '../outside.json',
        task: 'search',
        query: 'secure browser agent',
        ...publicRouteOptions
      }),
      /invalid agent task output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task status summarizes saved results without rerunning browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-status-'));
  try {
    const task = await buildAgentTask({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      run: true,
      write: true,
      out: 'operator/search-task.json',
      task: 'search',
      query: 'secure browser agent',
      searchProviders: 'duckduckgo,brave',
      ...publicRouteOptions,
      runner() {
        return {
          status: 0,
          signal: '',
          error: '',
          stdout: JSON.stringify({ search: { provider: 'duckduckgo', challenge: false, resultLinks: 4 }, page: {} }),
          stderr: ''
        };
      }
    });
    assert.equal(task.status, 'executed');

    const status = buildAgentTaskStatus({
      rootDir,
      generatedAt: '2026-05-30T00:00:05.000Z',
      in: 'operator/search-task.json'
    });

    assert.equal(status.exists, true);
    assert.equal(status.stale, false);
    assert.equal(status.taskStatus, 'executed');
    assert.equal(status.executed, true);
    assert.equal(status.searchProvider, 'duckduckgo');
    assert.equal(status.searchResultLinks, 4);
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.recommendedCommandId, 'refresh-agent-task');
    assert.equal(status.agentSafeNextCommandId, 'agent-task-refresh');
    assert.equal(status.agentSafeNextMayRunUnattended, true);
    assert.match(status.refreshCommand.shell, /'--search-providers' 'duckduckgo,brave'/);
    assert.match(status.runCommand.shell, /'--run'/);

    const compact = formatAgentTaskStatusCompact(status);
    assert.match(compact, /^status_only: yes$/m);
    assert.match(compact, /^task_status: executed$/m);
    assert.match(compact, /^search_result_links: 4$/m);
    assert.match(compact, /^agent_safe_next_command_id: agent-task-refresh$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-task'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task status reports missing parse errors stale files and rejects paths outside runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-status-bad-'));
  try {
    const missing = buildAgentTaskStatus({
      rootDir,
      in: 'operator/missing.json',
      mcpObservationIn: 'operator/chrome-mcp-observation-latest.json'
    });
    assert.equal(missing.exists, false);
    assert.equal(missing.stale, true);
    assert.equal(missing.blockedReason, 'no-saved-task');
    assert.equal(missing.agentSafeNextCommandId, 'agent-task-refresh');
    assert.equal(missing.agentSafeNextMayRunUnattended, true);
    assert.equal(missing.agentSafeNextOpensBrowser, false);
    assert.equal(missing.agentSafeNextStartsCapture, false);
    assert.deepEqual(missing.agentSafeNextCommand.args, [
      'node', 'src/cli.mjs', 'agent-task',
      '--write', '--out', 'operator/missing.json',
      '--format', 'compact',
      '--mcp-observation-in', 'operator/chrome-mcp-observation-latest.json'
    ]);
    const missingCompact = formatAgentTaskStatusCompact(missing);
    assert.match(missingCompact, /^agent_safe_next_command_id: agent-task-refresh$/m);
    assert.match(missingCompact, /^agent_safe_next_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);

    fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'runs/operator/bad.json'), '{not-json', 'utf8');
    const bad = buildAgentTaskStatus({
      rootDir,
      in: 'operator/bad.json'
    });
    assert.equal(bad.exists, true);
    assert.equal(bad.taskStatus, 'parse-error');
    assert.equal(bad.blockedReason, 'parse-error');
    assert.match(bad.parseError, /JSON/);
    assert.equal(bad.agentSafeNextCommandId, 'agent-task-refresh');

    assert.throws(
      () => buildAgentTaskStatus({
        rootDir,
        in: '../outside.json'
      }),
      /invalid agent task status input path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task watch plans and runs only safe agent-task refresh commands', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-watch-'));
  try {
    const planned = buildAgentTaskWatch({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      in: 'operator/missing.json',
      mcpObservationIn: 'operator/chrome-mcp-observation-latest.json'
    });
    assert.equal(planned.status, 'planned');
    assert.equal(planned.allowedToRun, true);
    assert.equal(planned.recommendedCommandId, 'refresh-agent-task');
    assert.match(planned.selectedCommand.shell, /'agent-task'/);
    assert.match(planned.selectedCommand.shell, /'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/);

    const ran = buildAgentTaskWatch({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      run: true,
      in: 'operator/missing.json',
      runner(command) {
        assert.match(command.shell, /'agent-task'/);
        writeJson(path.join(rootDir, 'runs/operator/missing.json'), {
          safeMode: true,
          destructiveActionsIncluded: false,
          secretValuesRead: false,
          status: 'planned',
          task: 'search',
          runRequested: false,
          writeRequested: true,
          executed: false,
          executionAllowed: true,
          target: { available: false },
          route: { selectedLane: 'direct-cdp-public', backend: 'direct-cdp-chrome' },
          recommendedCommandId: 'public-search'
        });
        return { status: 0, signal: '', error: '', stdout: 'refreshed\n', stderr: '' };
      }
    });
    assert.equal(ran.status, 'ran');
    assert.equal(ran.executed, true);
    assert.equal(ran.statusAfter.taskStatus, 'planned');

    const compact = formatAgentTaskWatchCompact(ran);
    assert.match(compact, /^status: ran$/m);
    assert.match(compact, /^after_task_status: planned$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task watch refuses non agent-task saved commands', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-watch-block-'));
  try {
    const filePath = path.join(rootDir, 'runs/operator/task.json');
    writeJson(filePath, {
      safeMode: true,
      destructiveActionsIncluded: false,
      secretValuesRead: false,
      status: 'planned',
      task: 'search',
      runRequested: false,
      writeRequested: true,
      executed: false,
      executionAllowed: true,
      target: { available: false },
      route: { selectedLane: 'direct-cdp-public', backend: 'direct-cdp-chrome' },
      recommendedCommandId: 'public-search',
      writeCommand: { args: ['node', 'other.js'], shell: "'node' 'other.js'" }
    });
    fs.utimesSync(filePath, new Date('2026-05-30T00:00:00.000Z'), new Date('2026-05-30T00:00:00.000Z'));

    const watch = buildAgentTaskWatch({
      rootDir,
      generatedAt: '2026-05-30T00:30:00.000Z',
      run: true,
      in: 'operator/task.json',
      staleAfterSeconds: 1
    });
    assert.equal(watch.status, 'blocked');
    assert.equal(watch.allowedToRun, false);
    assert.equal(watch.blockedReason, 'command-shape-not-allowed');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task watch start is operator gated and writes pid under runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-watch-start-'));
  try {
    const planned = buildAgentTaskWatchStart({
      rootDir,
      in: 'operator/task.json'
    });
    assert.equal(planned.status, 'planned');
    assert.equal(planned.readyToRun, false);
    assert.deepEqual(planned.blockers, ['operator-ok-required']);
    assert.match(planned.command.shell, /'agent-task-watch'/);

    const blocked = buildAgentTaskWatchStart({
      rootDir,
      run: true,
      in: 'operator/task.json'
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.startsBackgroundProcessNow, false);

    const started = buildAgentTaskWatchStart({
      rootDir,
      run: true,
      operatorOk: 'OK',
      in: 'operator/task.json',
      logPath: 'operator/watch.log',
      pidPath: 'operator/watch.pid',
      spawnImpl(commandName, args, options) {
        assert.equal(commandName, 'node');
        assert.deepEqual(args.slice(0, 2), ['src/cli.mjs', 'agent-task-watch']);
        assert.equal(options.detached, true);
        return { pid: 424242, unref() {} };
      }
    });
    assert.equal(started.status, 'started');
    assert.equal(started.startsBackgroundProcessNow, true);
    assert.equal(fs.readFileSync(path.join(rootDir, 'runs/operator/watch.pid'), 'utf8').trim(), '424242');

    const compact = formatAgentTaskWatchStartCompact(started);
    assert.match(compact, /^status: started$/m);
    assert.match(compact, /^starts_background_process_now: yes$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task watch status reads pid log and saved task status without secrets', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-watch-status-'));
  try {
    writeJson(path.join(rootDir, 'runs/operator/task.json'), {
      safeMode: true,
      destructiveActionsIncluded: false,
      secretValuesRead: false,
      status: 'executed',
      task: 'search',
      query: 'secure browser agent',
      runRequested: true,
      writeRequested: true,
      executed: true,
      executionAllowed: true,
      agentUnattendedAllowed: true,
      selectedCommandUnattendedAllowed: true,
      routeOperatorApprovalRequired: false,
      routeOperatorApprovalReasons: [],
      target: { available: false },
      route: { selectedLane: 'direct-cdp-public', backend: 'direct-cdp-chrome' },
      recommendedCommandId: 'public-search',
      searchResultLinks: 5,
      writeCommand: { args: ['node', 'src/cli.mjs', 'agent-task', '--write'], shell: "'node' 'src/cli.mjs' 'agent-task' '--write'" }
    });
    fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'runs/operator/watch.pid'), '424242\n', 'utf8');
    fs.writeFileSync(path.join(rootDir, 'runs/operator/watch.log'), 'ok token=secret-value\nfinished\n', 'utf8');

    const status = buildAgentTaskWatchStatus({
      rootDir,
      in: 'operator/task.json',
      logPath: 'operator/watch.log',
      pidPath: 'operator/watch.pid',
      maxLogLines: 2
    });
    assert.equal(status.safeMode, true);
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.process.exists, true);
    assert.equal(status.log.exists, true);
    assert.equal(status.taskStatus.taskStatus, 'executed');
    assert.equal(status.taskStatus.searchResultLinks, 5);
    assert.equal(status.taskStatus.agentUnattendedAllowed, true);
    assert.equal(status.taskStatus.routeOperatorApprovalRequired, false);
    assert.match(status.log.tail[0], /token=\[redacted\]/);

    const compact = formatAgentTaskWatchStatusCompact(status);
    assert.match(compact, /^status_only: yes$/m);
    assert.match(compact, /^task_status: executed$/m);
    assert.match(compact, /^task_agent_unattended_allowed: yes$/m);
    assert.match(compact, /^task_selected_command_unattended_allowed: yes$/m);
    assert.match(compact, /^task_route_operator_approval_required: no$/m);
    assert.match(compact, /^task_route_operator_approval_reasons: none$/m);
    assert.match(compact, /^task_search_result_links: 5$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task watch start and status reject paths outside runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-watch-paths-'));
  try {
    assert.throws(
      () => buildAgentTaskWatchStart({ rootDir, logPath: '../bad.log' }),
      /invalid agent task watch log-path/
    );
    assert.throws(
      () => buildAgentTaskWatchStatus({ rootDir, pidPath: '../bad.pid' }),
      /invalid agent task watch pid-path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task loop runs only stale or missing saved tasks and writes status', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-loop-'));
  try {
    const calls = [];
    const loop = await buildAgentTaskLoop({
      rootDir,
      run: true,
      in: 'operator/task.json',
      iterations: 2,
      intervalMs: 0,
      statusOut: 'operator/loop-status.json',
      runner(commandValue) {
        calls.push(commandValue.shell);
        writeJson(path.join(rootDir, 'runs/operator/task.json'), {
          safeMode: true,
          destructiveActionsIncluded: false,
          secretValuesRead: false,
          status: 'executed',
          task: 'search',
          query: 'secure browser agent',
          runRequested: true,
          writeRequested: true,
          executed: true,
          executionAllowed: true,
          target: { available: false },
          route: { selectedLane: 'direct-cdp-public', backend: 'direct-cdp-chrome' },
          recommendedCommandId: 'public-search',
          searchResultLinks: 7
        });
        return { status: 0, signal: '', error: '', stdout: 'ok\n', stderr: '' };
      }
    });

    assert.equal(loop.status, 'completed');
    assert.equal(loop.executedCount, 1);
    assert.equal(loop.skippedCount, 1);
    assert.equal(loop.finalTaskStatus.searchResultLinks, 7);
    assert.equal(calls.length, 1);
    assert.ok(fs.existsSync(path.join(rootDir, 'runs/operator/loop-status.json')));

    const compact = formatAgentTaskLoopCompact(loop);
    assert.match(compact, /^status: completed$/m);
    assert.match(compact, /^executed_count: 1$/m);
    assert.match(compact, /^final_search_result_links: 7$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task loop rejects status output paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-loop-path-'));
  try {
    await assert.rejects(
      buildAgentTaskLoop({
        rootDir,
        statusOut: '../bad.json'
      }),
      /invalid agent task watch status-out/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task runs only auth-check preflight for target scrape while the auth gate is closed', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-auth-check-scrape-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    let receivedCommand = null;
    const task = await buildAgentTask({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      run: true,
      write: true,
      out: 'operator/scrape-auth-check-task.json',
      task: 'scrape',
      proofGateStatus: {
        complete: false,
        status: 'waiting-for-login',
        target: 'acme',
        targetDir,
        operatorInput: true,
        operatorGuidance: { captureBlocked: true },
        authCheckOk: false,
        loginLike: true
      },
      providerReport,
      runner(command) {
        receivedCommand = command;
        return {
          status: 0,
          signal: '',
          error: '',
          stdout: 'ok: no\nsame_origin: yes\nlogin_like: yes\nnext_action: handoff-resume\n',
          stderr: ''
        };
      }
    });

    assert.equal(task.status, 'auth-pending');
    assert.equal(task.executed, true);
    assert.equal(task.executionAllowed, true);
    assert.equal(task.agentUnattendedAllowed, true);
    assert.equal(task.selectedCommandUnattendedAllowed, true);
    assert.equal(task.routeOperatorApprovalRequired, true);
    assert.deepEqual(task.routeOperatorApprovalReasons, ['operator-input', 'capture-blocked']);
    assert.equal(task.blockedReason, '');
    assert.equal(task.recommendedCommandId, 'auth-check-before-scrape');
    assert.equal(task.authPreflightChecked, true);
    assert.equal(task.authPreflightParsed, true);
    assert.equal(task.authPreflightOk, false);
    assert.equal(task.authPreflightLoginLike, true);
    assert.equal(task.authPreflightSameOrigin, true);
    assert.equal(task.authPreflightNextAction, 'handoff-resume');
    assert.match(task.authPreflightWatchCommand.shell, /target-auth-watch/);
    assert.match(task.authPreflightWatchCommand.shell, /--status-out' 'auth-watch-status\.json/);
    assert.match(task.authPreflightResumeStatusCommand.shell, /target-handoff-resume-status/);
    assert.equal(task.target.autoDetected, true);
    assert.match(receivedCommand.shell, /target-auth-check/);
    assert.doesNotMatch(receivedCommand.shell, /target-scrape/);
    assert.match(task.selectedStatusCommand.shell, /target-run-status/);
    assert.match(task.selectedStatusCommand.shell, /scrape/);

    const compact = formatAgentTaskCompact(task);
    assert.match(compact, /^target_auto_detected: yes$/m);
    assert.match(compact, /^recommended_command_id: auth-check-before-scrape$/m);
    assert.match(compact, /^execution_allowed: yes$/m);
    assert.match(compact, /^agent_unattended_allowed: yes$/m);
    assert.match(compact, /^selected_command_unattended_allowed: yes$/m);
    assert.match(compact, /^route_operator_approval_required: yes$/m);
    assert.match(compact, /^route_operator_approval_reasons: operator-input,capture-blocked$/m);
    assert.match(compact, /^blocked_reason: none$/m);
    assert.match(compact, /^status: auth-pending$/m);
    assert.match(compact, /^auth_preflight_checked: yes$/m);
    assert.match(compact, /^auth_preflight_ok: no$/m);
    assert.match(compact, /^auth_preflight_login_like: yes$/m);
    assert.match(compact, /^auth_preflight_next_action: handoff-resume$/m);
    assert.match(compact, /^auth_preflight_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
    assert.match(compact, /^auth_preflight_resume_status_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-status'/m);
    assert.match(compact, /^selected_status_command: 'node' 'src\/cli\.mjs' 'target-run-status'/m);

    const status = buildAgentTaskStatus({
      rootDir,
      generatedAt: '2026-05-30T00:00:01.000Z',
      in: 'operator/scrape-auth-check-task.json'
    });
    assert.equal(status.taskStatus, 'auth-pending');
    assert.equal(status.agentUnattendedAllowed, true);
    assert.equal(status.selectedCommandUnattendedAllowed, true);
    assert.equal(status.routeOperatorApprovalRequired, true);
    assert.deepEqual(status.routeOperatorApprovalReasons, ['operator-input', 'capture-blocked']);
    assert.equal(status.recommendedCommandId, 'monitor-auth-preflight');
    assert.match(status.recommendedCommand.shell, /target-auth-watch/);
    assert.equal(status.authPreflightOk, false);
    assert.equal(status.authPreflightLoginLike, true);
    assert.equal(status.authPreflightNextAction, 'handoff-resume');
    assert.match(status.authPreflightWatchCommand.shell, /target-auth-watch/);
    assert.match(status.authPreflightResumeStatusCommand.shell, /target-handoff-resume-status/);
    const statusCompact = formatAgentTaskStatusCompact(status);
    assert.match(statusCompact, /^recommended_command_id: monitor-auth-preflight$/m);
    assert.match(statusCompact, /^agent_unattended_allowed: yes$/m);
    assert.match(statusCompact, /^selected_command_unattended_allowed: yes$/m);
    assert.match(statusCompact, /^route_operator_approval_required: yes$/m);
    assert.match(statusCompact, /^route_operator_approval_reasons: operator-input,capture-blocked$/m);
    assert.match(statusCompact, /^auth_preflight_ok: no$/m);
    assert.match(statusCompact, /^auth_preflight_next_action: handoff-resume$/m);
    assert.match(statusCompact, /^auth_preflight_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
    assert.match(statusCompact, /^auth_preflight_resume_status_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-status'/m);

    let watchCommand = null;
    const watch = buildAgentTaskWatch({
      rootDir,
      generatedAt: '2026-05-30T00:00:02.000Z',
      run: true,
      in: 'operator/scrape-auth-check-task.json',
      runner(command) {
        watchCommand = command;
        return {
          status: 0,
          signal: '',
          error: '',
          stdout: 'status: waiting-for-login\n',
          stderr: ''
        };
      }
    });
    assert.equal(watch.status, 'ran');
    assert.equal(watch.executed, true);
    assert.equal(watch.allowedToRun, true);
    assert.equal(watch.agentUnattendedAllowed, true);
    assert.equal(watch.selectedCommandUnattendedAllowed, true);
    assert.equal(watch.routeOperatorApprovalRequired, true);
    assert.deepEqual(watch.routeOperatorApprovalReasons, ['operator-input', 'capture-blocked']);
    assert.equal(watch.recommendedCommandId, 'monitor-auth-preflight');
    assert.match(watchCommand.shell, /target-auth-watch/);
    assert.doesNotMatch(watchCommand.shell, /target-scrape/);
    const watchCompact = formatAgentTaskWatchCompact(watch);
    assert.match(watchCompact, /^recommended_command_id: monitor-auth-preflight$/m);
    assert.match(watchCompact, /^agent_unattended_allowed: yes$/m);
    assert.match(watchCompact, /^selected_command_unattended_allowed: yes$/m);
    assert.match(watchCompact, /^route_operator_approval_required: yes$/m);
    assert.match(watchCompact, /^route_operator_approval_reasons: operator-input,capture-blocked$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task runs only auth-check preflight for target analyze while the auth gate is closed', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-auth-check-analyze-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    let receivedCommand = null;
    const task = await buildAgentTask({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      run: true,
      task: 'analyze',
      proofGateStatus: {
        complete: false,
        status: 'waiting-for-login',
        target: 'acme',
        targetDir,
        operatorInput: true,
        operatorGuidance: { captureBlocked: true },
        authCheckOk: false,
        loginLike: true
      },
      providerReport,
      runner(command) {
        receivedCommand = command;
        return {
          status: 0,
          signal: '',
          error: '',
          stdout: 'auth_check_ok: no\nlogin_like: yes\n',
          stderr: ''
        };
      }
    });

    assert.equal(task.status, 'auth-pending');
    assert.equal(task.executed, true);
    assert.equal(task.executionAllowed, true);
    assert.equal(task.blockedReason, '');
    assert.equal(task.recommendedCommandId, 'auth-check-before-analyze');
    assert.equal(task.authPreflightParsed, true);
    assert.equal(task.authPreflightOk, false);
    assert.equal(task.authPreflightLoginLike, true);
    assert.match(receivedCommand.shell, /target-auth-check/);
    assert.doesNotMatch(receivedCommand.shell, /target-run/);

    const compact = formatAgentTaskCompact(task);
    assert.match(compact, /^task: analyze$/m);
    assert.match(compact, /^recommended_command_id: auth-check-before-analyze$/m);
    assert.match(compact, /^execution_allowed: yes$/m);
    assert.match(compact, /^blocked_reason: none$/m);
    assert.match(compact, /^status: auth-pending$/m);
    assert.match(compact, /^auth_preflight_ok: no$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent task can run target scrape after the auth gate is open', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-task-run-target-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    let receivedCommand = null;
    const task = await buildAgentTask({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      run: true,
      write: true,
      out: 'operator/scrape-task.json',
      task: 'scrape',
      proofGateStatus: {
        complete: false,
        status: 'ready-for-capture',
        target: 'acme',
        targetDir,
        operatorInput: false,
        operatorGuidance: { captureBlocked: false },
        authCheckOk: true,
        loginLike: false
      },
      providerReport,
      runner(command) {
        receivedCommand = command;
        return {
          status: 0,
          signal: '',
          error: '',
          stdout: path.join(rootDir, 'runs/target-packs/acme/acme/outputs/scrape.csv'),
          stderr: ''
        };
      }
    });

    assert.equal(task.status, 'executed');
    assert.equal(task.executed, true);
    assert.equal(task.executionAllowed, true);
    assert.match(receivedCommand.shell, /target-scrape/);
    assert.equal(task.target.source, 'proof-gate-status');
    assert.match(task.selectedStatusCommand.shell, /target-run-status/);
    assert.match(task.selectedStatusCommand.shell, /scrape/);

    const status = buildAgentTaskStatus({
      rootDir,
      generatedAt: '2026-05-30T00:00:01.000Z',
      in: 'operator/scrape-task.json'
    });
    assert.equal(status.taskStatus, 'executed');
    assert.match(status.selectedStatusCommand.shell, /target-run-status/);

    const compact = formatAgentTaskStatusCompact(status);
    assert.match(compact, /^selected_status_command: 'node' 'src\/cli\.mjs' 'target-run-status'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
