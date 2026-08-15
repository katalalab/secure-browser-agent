import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildObjectiveCompletionAudit } from './objective-completion-audit.mjs';
import { sanitizeLogLine } from './policy.mjs';
import { buildTargetHandoffResumeWatch } from './target-handoff-run.mjs';
import { toPosixPath } from './output.mjs';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function valueAfter(args = [], option, fallback = '') {
  const index = args.indexOf(option);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1] || fallback;
}

function targetDirFromAudit(audit = {}) {
  const nextArgs = audit.nextAction?.command?.args || [];
  if (nextArgs[0] === 'node' && nextArgs[1] === 'src/cli.mjs' && nextArgs[2]?.startsWith('target-') && nextArgs[3] && !String(nextArgs[3]).startsWith('-')) {
    return nextArgs[3];
  }
  const safeArgs = audit.executionPolicy?.agentSafeCommand?.args || [];
  if (safeArgs[0] === 'node' && safeArgs[1] === 'src/cli.mjs' && safeArgs[2]?.startsWith('target-') && safeArgs[3] && !String(safeArgs[3]).startsWith('-')) {
    return safeArgs[3];
  }
  const target = audit.nextAction?.target || '';
  return target ? `runs/target-packs/${target}` : '';
}

function monitorArgs(options = {}) {
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  return [
    ...(timeoutMs === undefined || timeoutMs === null || timeoutMs === '' ? [] : ['--monitor-timeout-ms', String(timeoutMs)]),
    ...(intervalMs === undefined || intervalMs === null || intervalMs === '' ? [] : ['--monitor-interval-ms', String(intervalMs)])
  ];
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/agent-proof-step-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent proof step output path: ${outPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent proof step output path: ${filePath}`);
  return toPosixPath(path.relative(runsRoot, resolved));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function safeRunsPath(rootDir, value, defaultValue, label) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(value || defaultValue).replace(/^[/\\]+/, '');
  const filePath = path.resolve(runsRoot, relative);
  const insideRuns = filePath === runsRoot || filePath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent proof step ${label}: ${value}`);
  return filePath;
}

function fileAgeSeconds(filePath, nowMs) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return Math.max(0, Math.round((nowMs - stat.mtimeMs) / 1000));
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
  const filePath = safeRunsPath(rootDir, pidPath, 'operator/agent-proof-step.pid', 'pid-path');
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
  const filePath = safeRunsPath(rootDir, logPath, 'operator/agent-proof-step.log', 'log-path');
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

function readSavedStep(rootDir, inputPath, nowMs) {
  const filePath = safeRunPath(rootDir, inputPath);
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath,
      ageSeconds: null,
      parseError: '',
      step: null
    };
  }
  try {
    return {
      exists: true,
      path: filePath,
      ageSeconds: fileAgeSeconds(filePath, nowMs),
      parseError: '',
      step: JSON.parse(fs.readFileSync(filePath, 'utf8'))
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      ageSeconds: fileAgeSeconds(filePath, nowMs),
      parseError: error.message,
      step: null
    };
  }
}

function startDetached({ rootDir, commandValue, logPath, pidPath, spawnImpl = spawn }) {
  if (!commandValue?.args?.length) throw new Error('agent proof step command is unavailable');
  const resolvedLogPath = safeRunsPath(rootDir, logPath, 'operator/agent-proof-step.log', 'log-path');
  const resolvedPidPath = safeRunsPath(rootDir, pidPath, 'operator/agent-proof-step.pid', 'pid-path');
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
    if (!child?.pid) throw new Error('agent proof step background process did not report a pid');
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

function commandShapeAllowed(selected = {}) {
  const args = selected.command?.args || [];
  if (selected.id === 'completion-audit') {
    return args[0] === 'node' && args[1] === 'src/cli.mjs' && args[2] === 'objective-completion-audit';
  }
  return Boolean(
    selected.id === 'resume-capture'
    && selected.startsCapture
    && args[0] === 'node'
    && args[1] === 'src/cli.mjs'
    && args[2] === 'target-handoff-resume'
    && args.includes('--run')
    && args.includes('--wait-auth')
    && !args.includes('--open-login')
  );
}

function blockedReason({ targetDir, watch, shapeOk, authWatchUnavailable }) {
  if (!targetDir) return 'missing-target';
  if (authWatchUnavailable && watch?.selectedCommand?.id === 'monitor-auth') return 'handoff-auth-check-port-unreachable';
  if (!watch?.selectedCommand?.command) return 'no-selected-command';
  if (watch.selectedCommand?.id === 'monitor-auth') return 'auth-not-ready';
  if (watch.statusBefore?.captureCompleted) return '';
  if (watch.selectedCommand?.startsCapture && !watch.statusBefore?.latestAuthOk) return 'auth-not-ready';
  if (!shapeOk) return 'command-shape-not-allowed';
  return '';
}

export async function buildAgentProofStep(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const write = Boolean(options.write);
  const operatorOk = options.operatorOk || options['operator-ok'] || '';
  const operatorOkAccepted = operatorOk === 'OK';
  const timeoutMs = Number(options.timeoutMs || 300000);
  const audit = options.audit || await buildObjectiveCompletionAudit({
    ...options,
    rootDir,
    generatedAt
  });
  const targetDirRaw = options.targetDir || targetDirFromAudit(audit);
  const targetDir = targetDirRaw && !path.isAbsolute(targetDirRaw) ? path.join(rootDir, targetDirRaw) : targetDirRaw;
  const handoff = options.handoff || valueAfter(audit.nextAction?.command?.args || audit.executionPolicy?.agentSafeCommand?.args || [], '--handoff', 'operator-handoff.json');
  const outPath = safeRunPath(rootDir, options.out || options.output);
  const outRelative = runsRelativePath(rootDir, outPath);
  const loopArgs = monitorArgs(options);
  const targetArgs = [
    ...(targetDir ? ['--target-dir', targetDir] : []),
    ...(handoff ? ['--handoff', handoff] : [])
  ];
  const planCommand = command(['node', 'src/cli.mjs', 'agent-proof-step', ...targetArgs, ...loopArgs, '--format', 'compact']);
  const runCommand = command([
    'node',
    'src/cli.mjs',
    'agent-proof-step',
    '--run',
    ...(operatorOkAccepted ? ['--operator-ok', 'OK'] : []),
    '--write',
    '--out',
    outRelative,
    '--timeout-ms',
    String(timeoutMs),
    ...targetArgs,
    ...loopArgs,
    '--format',
    'compact'
  ]);
  const statusCommand = command(['node', 'src/cli.mjs', 'control-status', ...loopArgs, '--format', 'compact']);
  const watchBuilder = options.handoffResumeWatchBuilder || buildTargetHandoffResumeWatch;
  const watch = targetDir && !options.handoffResumeWatch && run
    ? await watchBuilder(targetDir, {
        ...options,
        rootDir,
        generatedAt,
        handoff,
        run: false
      })
    : options.handoffResumeWatch || null;
  const authWatchUnavailable = audit.executionPolicy?.authWatchHandoffPortReachable === false
    || audit.executionPolicy?.agentSafeCommandBlockedReason === 'handoff-auth-check-port-unreachable';
  const rawSelected = watch?.selectedCommand || {};
  const selected = authWatchUnavailable && rawSelected.id === 'monitor-auth'
    ? {
        id: 'reopen-login-required',
        startsCapture: false,
        command: null
      }
    : rawSelected;
  const shapeOk = commandShapeAllowed(selected);
  const captureReady = Boolean(
    selected.id === 'resume-capture'
    && selected.startsCapture
    && watch?.statusBefore?.latestAuthOk
    && !watch?.statusBefore?.captureCompleted
    && shapeOk
  );
  const completionReady = Boolean(selected.id === 'completion-audit' && shapeOk);
  const operatorOkRequired = Boolean(captureReady || selected.startsCapture);
  const allowedToRun = Boolean((captureReady || completionReady) && (!operatorOkRequired || operatorOkAccepted));
  const baseBlockedReason = blockedReason({ targetDir, watch, shapeOk, authWatchUnavailable });
  const reason = allowedToRun
    ? ''
    : baseBlockedReason === 'command-shape-not-allowed'
      ? baseBlockedReason
      : operatorOkRequired && !operatorOkAccepted
        ? 'operator-ok-required'
        : baseBlockedReason;

  const step = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    runRequested: run,
    operatorOkRequired,
    operatorOkAccepted,
    executed: false,
    status: run ? (allowedToRun ? 'ready-to-run' : 'blocked') : 'planned',
    targetDir,
    handoff,
    selectedCommandId: selected.id || '',
    selectedStartsCapture: Boolean(selected.startsCapture),
    latestAuthOk: Boolean(watch?.statusBefore?.latestAuthOk),
    captureCompleted: Boolean(watch?.statusBefore?.captureCompleted),
    opensBrowserNow: false,
    startsCaptureNow: Boolean(selected.startsCapture),
    allowedToRun,
    blockedReason: reason,
    command: selected.command || null,
    planCommand,
    runCommand: allowedToRun ? runCommand : null,
    statusCommand,
    watchPlan: watch,
    result: null,
    outputPath: write ? outPath : ''
  };

  if (run && allowedToRun && targetDir) {
    step.status = 'running';
    const result = await watchBuilder(targetDir, {
      ...options,
      rootDir,
      generatedAt,
      handoff,
      run: true,
      operatorOk,
      timeoutMs
    });
    step.executed = true;
    step.result = {
      status: result.status || '',
      selectedCommandId: result.selectedCommand?.id || '',
      selectedStartsCapture: Boolean(result.selectedCommand?.startsCapture),
      ok: Boolean(result.result?.ok),
      childStatus: result.result?.childStatus || '',
      childOk: result.result?.childOk ?? null,
      exitStatus: result.result?.status ?? null,
      error: result.result?.error || ''
    };
    step.status = result.status || (step.result.ok ? 'completed' : 'failed');
  }

  if (write) writeJson(outPath, step);
  return step;
}

export async function buildAgentProofStepStart(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const force = Boolean(options.force);
  const operatorOk = options.operatorOk || options['operator-ok'] || '';
  const operatorOkAccepted = operatorOk === 'OK';
  const timeoutMs = Number(options.timeoutMs || options['timeout-ms'] || 300000);
  const outRelative = runsRelativePath(rootDir, safeRunPath(rootDir, options.out || options.output));
  const logRelative = runsRelativePath(rootDir, safeRunsPath(rootDir, options.logPath || options['log-path'], 'operator/agent-proof-step.log', 'log-path'));
  const pidRelative = runsRelativePath(rootDir, safeRunsPath(rootDir, options.pidPath || options['pid-path'], 'operator/agent-proof-step.pid', 'pid-path'));
  const step = options.step || await buildAgentProofStep({
    ...options,
    rootDir,
    generatedAt,
    run: false,
    write: false,
    operatorOk,
    out: outRelative,
    timeoutMs
  });
  const loopArgs = monitorArgs(options);
  const targetArgs = [
    ...(step?.targetDir || options.targetDir ? ['--target-dir', step?.targetDir || options.targetDir] : []),
    ...(step?.handoff || options.handoff ? ['--handoff', step?.handoff || options.handoff] : [])
  ];
  const logPidArgs = [
    ...(options.logPath || options['log-path'] ? ['--log-path', logRelative] : []),
    ...(options.pidPath || options['pid-path'] ? ['--pid-path', pidRelative] : [])
  ];
  const startBaseArgs = [
    '--out',
    outRelative,
    '--timeout-ms',
    String(timeoutMs),
    ...targetArgs,
    ...loopArgs,
    ...logPidArgs
  ];
  const existing = existingPidStatus(rootDir, pidRelative);
  const alreadyRunning = existing.running && !force;
  const readyToRun = Boolean(operatorOkAccepted && step.allowedToRun && !alreadyRunning && step.runCommand?.args?.length);
  const blockers = [];
  if (!operatorOkAccepted) blockers.push('operator-ok-required');
  if (!step.allowedToRun) blockers.push(`agent-proof-step-not-allowed:${step.blockedReason || 'unknown'}`);
  if (alreadyRunning) blockers.push('agent-proof-step-already-running');
  if (step.runCommand?.args?.includes('--open-login')) blockers.push('proof-step-command-must-not-open-login');

  const result = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    startsBackgroundProcessNow: false,
    planOnly: !run,
    runRequested: run,
    operatorOkAccepted,
    status: run ? 'not-started' : 'planned',
    readyToRun,
    blockers,
    selectedCommandId: step.selectedCommandId || '',
    selectedStartsCapture: Boolean(step.selectedStartsCapture),
    latestAuthOk: Boolean(step.latestAuthOk),
    captureCompleted: Boolean(step.captureCompleted),
    output: outRelative,
    logPath: safeRunsPath(rootDir, logRelative, 'operator/agent-proof-step.log', 'log-path'),
    pidPath: safeRunsPath(rootDir, pidRelative, 'operator/agent-proof-step.pid', 'pid-path'),
    command: step.runCommand,
    existingProcess: existing,
    commands: {
      plan: command(['node', 'src/cli.mjs', 'agent-proof-step-start', ...startBaseArgs, '--format', 'compact']),
      approvedRun: command(['node', 'src/cli.mjs', 'agent-proof-step-start', '--run', '--operator-ok', 'OK', ...startBaseArgs, '--format', 'compact']),
      status: command(['node', 'src/cli.mjs', 'agent-proof-step-status', '--in', outRelative, ...logPidArgs, '--format', 'compact'])
    },
    step,
    started: null
  };

  if (!run) return result;
  if (!readyToRun || blockers.length) {
    result.status = alreadyRunning ? 'already-running' : 'blocked';
    return result;
  }
  const started = startDetached({
    rootDir,
    commandValue: step.runCommand,
    logPath: logRelative,
    pidPath: pidRelative,
    spawnImpl: options.spawnImpl || spawn
  });
  result.status = 'started';
  result.startsBackgroundProcessNow = true;
  result.startsCaptureNow = Boolean(step.startsCaptureNow);
  result.started = started;
  result.existingProcess = {
    exists: true,
    path: started.pidPath,
    pid: started.pid,
    running: true
  };
  return result;
}

export function buildAgentProofStepStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const nowMs = Number.isFinite(Date.parse(generatedAt)) ? Date.parse(generatedAt) : Date.now();
  const inputRelative = runsRelativePath(rootDir, safeRunPath(rootDir, options.in || options.input || options.path));
  const logRelative = runsRelativePath(rootDir, safeRunsPath(rootDir, options.logPath || options['log-path'], 'operator/agent-proof-step.log', 'log-path'));
  const pidRelative = runsRelativePath(rootDir, safeRunsPath(rootDir, options.pidPath || options['pid-path'], 'operator/agent-proof-step.pid', 'pid-path'));
  const saved = readSavedStep(rootDir, inputRelative, nowMs);
  const refreshCommand = command(['node', 'src/cli.mjs', 'agent-proof-step', '--write', '--out', inputRelative, '--format', 'compact']);
  const shouldRefresh = !saved.exists || Boolean(saved.parseError);
  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    statusOnly: true,
    input: inputRelative,
    process: existingPidStatus(rootDir, pidRelative),
    log: readLogFile(rootDir, logRelative, nowMs, options.maxLogLines ?? options['max-log-lines'] ?? 10),
    saved,
    agentSafeNextCommandId: shouldRefresh ? 'agent-proof-step-refresh' : 'none',
    agentSafeNextMayRunUnattended: shouldRefresh,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand: shouldRefresh ? refreshCommand : null,
    commands: {
      start: command(['node', 'src/cli.mjs', 'agent-proof-step-start', '--run', '--operator-ok', 'OK', '--out', inputRelative, '--format', 'compact']),
      refresh: refreshCommand
    }
  };
}

export function formatAgentProofStepCompact(step) {
  const lines = [
    `status: ${clean(step.status)}`,
    `run_requested: ${yesNo(step.runRequested)}`,
    `operator_ok_required: ${yesNo(step.operatorOkRequired)}`,
    `operator_ok_accepted: ${yesNo(step.operatorOkAccepted)}`,
    `executed: ${yesNo(step.executed)}`,
    `safe_mode: ${yesNo(step.safeMode)}`,
    `destructive_actions: ${yesNo(step.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(step.secretValuesRead)}`,
    `reads_browser_storage: ${yesNo(step.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(step.pageContentReturned)}`,
    `target_dir: ${clean(step.targetDir)}`,
    `selected_command: ${clean(step.selectedCommandId)}`,
    `selected_starts_capture: ${yesNo(step.selectedStartsCapture)}`,
    `latest_auth_ok: ${yesNo(step.latestAuthOk)}`,
    `capture_completed: ${yesNo(step.captureCompleted)}`,
    `opens_browser_now: ${yesNo(step.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(step.startsCaptureNow)}`,
    `allowed_to_run: ${yesNo(step.allowedToRun)}`,
    `blocked_reason: ${clean(step.blockedReason)}`
  ];
  if (step.command?.shell) lines.push(`command: ${step.command.shell}`);
  if (step.planCommand?.shell) lines.push(`plan_command: ${step.planCommand.shell}`);
  if (step.runCommand?.shell) lines.push(`run_command: ${step.runCommand.shell}`);
  if (step.statusCommand?.shell) lines.push(`status_command: ${step.statusCommand.shell}`);
  if (step.result) {
    lines.push(`result_status: ${clean(step.result.status)}`);
    lines.push(`result_ok: ${yesNo(step.result.ok)}`);
    if (step.result.childStatus) lines.push(`child_status: ${clean(step.result.childStatus)}`);
    if (step.result.childOk !== null && step.result.childOk !== undefined) lines.push(`child_ok: ${yesNo(step.result.childOk)}`);
    if (step.result.exitStatus !== null && step.result.exitStatus !== undefined) lines.push(`exit_status: ${step.result.exitStatus}`);
    if (step.result.error) lines.push(`error: ${clean(step.result.error)}`);
  }
  if (step.outputPath) lines.push(`output: ${step.outputPath}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentProofStepStartCompact(result) {
  const lines = [
    `status: ${clean(result.status)}`,
    `safe_mode: ${yesNo(result.safeMode)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `reads_browser_storage: ${yesNo(result.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(result.pageContentReturned)}`,
    `opens_browser_now: ${yesNo(result.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(result.startsCaptureNow)}`,
    `starts_background_process_now: ${yesNo(result.startsBackgroundProcessNow)}`,
    `plan_only: ${yesNo(result.planOnly)}`,
    `run_requested: ${yesNo(result.runRequested)}`,
    `operator_ok_accepted: ${yesNo(result.operatorOkAccepted)}`,
    `ready_to_run: ${yesNo(result.readyToRun)}`,
    `blockers: ${result.blockers.length ? result.blockers.join(',') : 'none'}`,
    `selected_command: ${clean(result.selectedCommandId)}`,
    `selected_starts_capture: ${yesNo(result.selectedStartsCapture)}`,
    `latest_auth_ok: ${yesNo(result.latestAuthOk)}`,
    `capture_completed: ${yesNo(result.captureCompleted)}`,
    `output: ${clean(result.output)}`,
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

export function formatAgentProofStepStatusCompact(status) {
  const savedStep = status.saved.step || {};
  const lines = [
    `status_only: ${yesNo(status.statusOnly)}`,
    `safe_mode: ${yesNo(status.safeMode)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `agent_safe_next_command_id: ${clean(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `input: ${clean(status.input)}`,
    `pid_exists: ${yesNo(status.process.exists)}`,
    `running: ${yesNo(status.process.running)}`,
    `pid: ${status.process.pid || 'none'}`,
    `pid_path: ${status.process.path}`,
    `log_exists: ${yesNo(status.log.exists)}`,
    `log_lines: ${status.log.lineCount || 0}`,
    `log_path: ${status.log.path}`,
    `saved_exists: ${yesNo(status.saved.exists)}`,
    `saved_age_seconds: ${status.saved.ageSeconds ?? 'none'}`,
    `saved_parse_error: ${clean(status.saved.parseError)}`,
    `saved_status: ${clean(savedStep.status)}`,
    `saved_executed: ${yesNo(savedStep.executed)}`,
    `saved_allowed_to_run: ${yesNo(savedStep.allowedToRun)}`,
    `saved_selected_command: ${clean(savedStep.selectedCommandId)}`,
    `saved_result_status: ${clean(savedStep.result?.status)}`,
    `start_command: ${status.commands.start.shell}`,
    `refresh_command: ${status.commands.refresh.shell}`
  ];
  if (status.agentSafeNextCommand?.shell) lines.push(`agent_safe_next_command: ${status.agentSafeNextCommand.shell}`);
  if (status.log.tail?.length) lines.push(`log_tail: ${status.log.tail.map((line) => clean(line)).join(' | ')}`);
  return `${lines.join('\n')}\n`;
}
