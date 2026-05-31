import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildBackgroundProofCapturePlan } from './background-proof-capture-plan.mjs';

function compactValue(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
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

function valuePresent(value) {
  return value !== undefined && value !== null && value !== '';
}

function startCommandArgs(mode, options = {}) {
  const timeoutMs = options.timeoutMs ?? options['timeout-ms'];
  const intervalMs = options.intervalMs ?? options['interval-ms'];
  const monitorTimeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const monitorIntervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  const args = ['node', 'src/cli.mjs', 'background-proof-capture-start', '--mode', mode];
  if (mode === 'capture' || valuePresent(timeoutMs) || valuePresent(intervalMs)) {
    args.push('--timeout-ms', String(timeoutMs ?? 300000), '--interval-ms', String(intervalMs ?? 5000));
  }
  if (valuePresent(monitorTimeoutMs)) args.push('--monitor-timeout-ms', String(monitorTimeoutMs));
  if (valuePresent(monitorIntervalMs)) args.push('--monitor-interval-ms', String(monitorIntervalMs));
  return args;
}

function safeRootRelative(rootDir, relativePath, label) {
  const raw = String(relativePath || '');
  if (!raw || path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new Error(`invalid background proof capture start ${label}: ${relativePath}`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, path.normalize(raw));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`invalid background proof capture start ${label}: ${relativePath}`);
  }
  return resolved;
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
  const filePath = safeRootRelative(rootDir, pidPath, 'pid-path');
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

function selectedPhase(plan, mode) {
  if (mode === 'monitor') {
    return {
      mode,
      id: 'monitor-auth',
      command: plan.phases.monitorAuth.command,
      logPath: plan.paths.monitorLogPath,
      pidPath: plan.paths.monitorPidPath,
      opensBrowser: Boolean(plan.phases.monitorAuth.opensBrowser),
      startsCapture: Boolean(plan.phases.monitorAuth.startsCapture),
      operatorMustOpenLoginSeparately: false
    };
  }
  return {
    mode: 'capture',
    id: 'no-open-wait-auth-capture',
    command: plan.phases.backgroundWaitAuthThenCaptureNoOpen.command,
    logPath: plan.paths.captureLogPath,
    pidPath: plan.paths.capturePidPath,
    opensBrowser: false,
    startsCapture: Boolean(plan.phases.backgroundWaitAuthThenCaptureNoOpen.startsCapture),
    operatorMustOpenLoginSeparately: Boolean(plan.phases.backgroundWaitAuthThenCaptureNoOpen.operatorMustOpenLoginSeparately)
  };
}

function startDetached({ rootDir, phase, spawnImpl = spawn }) {
  if (!phase.command?.args?.length) throw new Error(`background ${phase.mode} command is unavailable`);
  const logPath = safeRootRelative(rootDir, phase.logPath, 'log-path');
  const pidPath = safeRootRelative(rootDir, phase.pidPath, 'pid-path');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });
  const outFd = fs.openSync(logPath, 'a');
  let child;
  try {
    child = spawnImpl(phase.command.args[0], phase.command.args.slice(1), {
      cwd: rootDir,
      detached: true,
      stdio: ['ignore', outFd, outFd]
    });
    if (!child?.pid) throw new Error('background process did not report a pid');
    fs.writeFileSync(pidPath, `${child.pid}\n`);
    if (typeof child.unref === 'function') child.unref();
  } finally {
    fs.closeSync(outFd);
  }
  return {
    pid: child.pid,
    logPath,
    pidPath
  };
}

export async function buildBackgroundProofCaptureStart(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const mode = options.mode === 'monitor' ? 'monitor' : 'capture';
  const run = Boolean(options.run);
  const force = Boolean(options.force);
  const operatorOk = options.operatorOk || options['operator-ok'] || '';
  const plan = options.plan || await buildBackgroundProofCapturePlan({
    ...options,
    rootDir,
    generatedAt
  });
  const phase = selectedPhase(plan, mode);
  const existing = existingPidStatus(rootDir, phase.pidPath);
  const available = Boolean(phase.command?.args?.length);
  const operatorOkAccepted = operatorOk === 'OK';
  const alreadyRunning = existing.running && !force;
  const readyToRun = available && operatorOkAccepted && !alreadyRunning;
  const blockers = [];
  if (!available) blockers.push(`${mode}-command-unavailable`);
  if (!operatorOkAccepted) blockers.push('operator-ok-required');
  if (alreadyRunning) blockers.push(`${mode}-already-running`);
  if (mode === 'capture' && phase.command?.args?.includes('--open-login')) blockers.push('capture-command-must-not-open-login');

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
    mode,
    target: plan.target || '',
    status: run ? 'not-started' : 'planned',
    readyToRun,
    blockers,
    phase: {
      id: phase.id,
      opensBrowser: phase.opensBrowser,
      startsCapture: phase.startsCapture,
      operatorMustOpenLoginSeparately: phase.operatorMustOpenLoginSeparately,
      command: phase.command || null,
      logPath: phase.logPath,
      pidPath: phase.pidPath
    },
    existingProcess: existing,
    commands: {
      plan: command([...startCommandArgs(mode, options), '--format', 'compact']),
      approvedRun: command([...startCommandArgs(mode, options), '--run', '--operator-ok', 'OK', '--format', 'compact']),
      status: command(['node', 'src/cli.mjs', 'background-proof-capture-status', '--format', 'compact'])
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
    phase,
    spawnImpl: options.spawnImpl || spawn
  });
  result.status = 'started';
  result.startsBackgroundProcessNow = true;
  result.startsCaptureNow = mode === 'capture';
  result.started = started;
  result.existingProcess = {
    exists: true,
    path: started.pidPath,
    pid: started.pid,
    running: true
  };
  return result;
}

export function formatBackgroundProofCaptureStartCompact(result) {
  const lines = [
    `status: ${compactValue(result.status)}`,
    `mode: ${compactValue(result.mode)}`,
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
    `target: ${compactValue(result.target)}`,
    `blockers: ${result.blockers.length ? result.blockers.join(',') : 'none'}`,
    `phase: ${compactValue(result.phase.id)}`,
    `phase_opens_browser: ${yesNo(result.phase.opensBrowser)}`,
    `phase_starts_capture: ${yesNo(result.phase.startsCapture)}`,
    `operator_must_open_login_separately: ${yesNo(result.phase.operatorMustOpenLoginSeparately)}`,
    `pid_exists: ${yesNo(result.existingProcess.exists)}`,
    `running: ${yesNo(result.existingProcess.running)}`,
    `pid: ${result.existingProcess.pid || 'none'}`,
    `log_path: ${result.phase.logPath}`,
    `pid_path: ${result.phase.pidPath}`,
    `status_command: ${result.commands.status.shell}`,
    `approved_run_command: ${result.commands.approvedRun.shell}`
  ];
  if (result.phase.command?.shell) lines.push(`foreground_command: ${result.phase.command.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatBackgroundProofCaptureStartMarkdown(result) {
  return [
    '# Secure Browser Agent Background Proof Capture Start',
    '',
    `Status: ${result.status}`,
    `Mode: ${result.mode}`,
    `Run requested: ${result.runRequested ? 'yes' : 'no'}`,
    `Operator OK accepted: ${result.operatorOkAccepted ? 'yes' : 'no'}`,
    `Ready to run: ${result.readyToRun ? 'yes' : 'no'}`,
    `Opens browser now: ${result.opensBrowserNow ? 'yes' : 'no'}`,
    `Starts capture now: ${result.startsCaptureNow ? 'yes' : 'no'}`,
    `Secret values read: ${result.secretValuesRead ? 'yes' : 'no'}`,
    `Blockers: ${result.blockers.length ? result.blockers.join(', ') : 'none'}`,
    '',
    '## Command',
    '',
    '```bash',
    result.phase.command?.shell || '',
    '```',
    ''
  ].join('\n');
}
