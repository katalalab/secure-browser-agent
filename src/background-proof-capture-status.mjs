import fs from 'node:fs';
import path from 'node:path';
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

function noBrowserSafeNext(id, commandValue, blockedReason = 'none') {
  return {
    id,
    command: commandValue,
    mayRunUnattended: Boolean(commandValue),
    opensBrowser: false,
    startsCapture: false,
    startsBackground: false,
    readsBrowserStorage: false,
    returnsPageContent: false,
    blockedReason
  };
}

function safeRelative(value, label) {
  const raw = String(value || '');
  if (!raw) return '';
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new Error(`invalid background proof capture status ${label}: ${value}`);
  }
  const normalized = path.normalize(raw);
  if (normalized.startsWith('..')) {
    throw new Error(`invalid background proof capture status ${label}: ${value}`);
  }
  return normalized;
}

function resolveRootRelative(rootDir, relativePath, label) {
  const safe = safeRelative(relativePath, label);
  if (!safe) return '';
  return path.resolve(rootDir, safe);
}

function resolveTargetOutput(rootDir, targetDir, relativePath) {
  if (!targetDir) return '';
  const root = path.resolve(rootDir);
  const safeTargetDir = path.isAbsolute(targetDir)
    ? path.resolve(targetDir)
    : resolveRootRelative(rootDir, targetDir, 'target-dir');
  if (safeTargetDir !== root && !safeTargetDir.startsWith(`${root}${path.sep}`)) {
    throw new Error(`invalid background proof capture status target-dir: ${targetDir}`);
  }
  const outputsRoot = path.resolve(safeTargetDir, 'outputs');
  const safeRelativePath = safeRelative(relativePath, 'target-output');
  const outputPath = path.resolve(outputsRoot, safeRelativePath);
  if (outputPath !== outputsRoot && !outputPath.startsWith(`${outputsRoot}${path.sep}`)) {
    throw new Error(`invalid background proof capture status target output: ${relativePath}`);
  }
  return outputPath;
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

function readPidFile(rootDir, relativePath, nowMs) {
  const filePath = resolveRootRelative(rootDir, relativePath, 'pid-path');
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath,
      pid: null,
      running: false,
      ageSeconds: null
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
    ageSeconds: fileAgeSeconds(filePath, nowMs),
    parseError: valid ? '' : `invalid pid: ${raw}`
  };
}

function sanitizeLogLine(line) {
  return String(line || '')
    .replace(/([?&](?:token|key|code|secret|password|session|auth)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function readLogFile(rootDir, relativePath, nowMs, maxLines = 5) {
  const filePath = resolveRootRelative(rootDir, relativePath, 'log-path');
  if (!filePath || !fs.existsSync(filePath)) {
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
  const tail = lines.slice(-Math.max(0, Number(maxLines) || 0)).map(sanitizeLogLine);
  return {
    exists: true,
    path: filePath,
    ageSeconds: fileAgeSeconds(filePath, nowMs),
    lineCount: lines.length,
    tail,
    lastLine: tail.at(-1) || ''
  };
}

function summarizeJsonFile(filePath, nowMs) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath
    };
  }
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const attempts = Array.isArray(value.attempts) ? value.attempts : [];
    const lastAttempt = attempts.at(-1) || null;
    const authCheck = value.authCheck || lastAttempt || value;
    return {
      exists: true,
      path: filePath,
      generatedAt: value.generatedAt || '',
      ageSeconds: fileAgeSeconds(filePath, nowMs),
      status: value.status || (authCheck.ok ? 'authenticated' : 'unknown'),
      enabled: value.enabled ?? null,
      active: value.status === 'waiting',
      ok: Boolean(authCheck.ok ?? value.ok),
      loginLike: authCheck.loginLike ?? value.loginLike ?? null,
      finalUrl: authCheck.finalUrl || authCheck.authCheckFinalUrl || value.finalUrl || '',
      attemptCount: value.attemptCount ?? attempts.length,
      childStatus: lastAttempt?.childStatus || value.childStatus || '',
      childOk: lastAttempt?.childOk ?? value.childOk ?? null
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      parseError: error.message
    };
  }
}

function targetDirFromCommand(commandValue) {
  const args = commandValue?.args || [];
  for (const commandName of ['target-handoff-resume', 'target-auth-watch', 'target-proof-capture', 'target-login-capture']) {
    const index = args.indexOf(commandName);
    if (index >= 0 && args[index + 1]) return args[index + 1];
  }
  return '';
}

function targetDirFromPlan(plan) {
  return targetDirFromCommand(plan.phases?.backgroundWaitAuthThenCaptureNoOpen?.command)
    || targetDirFromCommand(plan.phases?.waitAuthThenCapture?.command)
    || targetDirFromCommand(plan.phases?.monitorAuth?.command)
    || '';
}

export async function buildBackgroundProofCaptureStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const parsedNowMs = new Date(generatedAt).getTime();
  const nowMs = Number.isFinite(parsedNowMs) ? parsedNowMs : Date.now();
  const plan = options.plan || await buildBackgroundProofCapturePlan({
    ...options,
    rootDir,
    generatedAt
  });
  const maxLogLines = Number(options.maxLogLines ?? options['max-log-lines'] ?? 5);
  const targetDir = options.targetDir || options['target-dir'] || targetDirFromPlan(plan);
  const monitorPid = readPidFile(rootDir, plan.paths.monitorPidPath, nowMs);
  const capturePid = readPidFile(rootDir, plan.paths.capturePidPath, nowMs);
  const monitorLog = readLogFile(rootDir, plan.paths.monitorLogPath, nowMs, maxLogLines);
  const captureLog = readLogFile(rootDir, plan.paths.captureLogPath, nowMs, maxLogLines);
  const authWatchStatus = summarizeJsonFile(resolveTargetOutput(rootDir, targetDir, 'auth-watch-status.json'), nowMs);
  const handoffWaitAuthStatus = summarizeJsonFile(resolveTargetOutput(rootDir, targetDir, 'handoff-resume-wait-auth-status.json'), nowMs);
  const handoffResumeLatest = summarizeJsonFile(resolveTargetOutput(rootDir, targetDir, 'handoff-resume-latest.json'), nowMs);
  const planCommand = command(['node', 'src/cli.mjs', 'background-proof-capture-plan', '--format', 'compact']);

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
    target: plan.target || '',
    targetDir,
    planStatus: plan.status || 'unknown',
    complete: Boolean(plan.complete),
    captureBlocked: Boolean(plan.captureBlocked),
    nextArtifactAction: plan.nextArtifactAction || '',
    nextArtifactBlocker: plan.nextArtifactBlocker || '',
    missingArtifactCount: plan.missingArtifactCount || 0,
    backgroundMonitorAvailable: Boolean(plan.phases.monitorAuth.backgroundCommand),
    backgroundCaptureAvailable: Boolean(plan.phases.backgroundWaitAuthThenCaptureNoOpen.backgroundCommand),
    processes: {
      monitor: monitorPid,
      capture: capturePid
    },
    logs: {
      monitor: monitorLog,
      capture: captureLog
    },
    targetOutputs: {
      authWatchStatus,
      handoffWaitAuthStatus,
      handoffResumeLatest
    },
    commands: {
      plan: planCommand,
      noOpenWaitCapture: plan.phases?.backgroundWaitAuthThenCaptureNoOpen?.command || null,
      backgroundNoOpenWaitCapture: plan.phases?.backgroundWaitAuthThenCaptureNoOpen?.backgroundCommand || null,
      pollObjective: command(['node', 'src/cli.mjs', 'objective-status', '--format', 'compact']),
      completionAudit: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
      tailMonitorLog: command(['tail', '-n', '80', plan.paths.monitorLogPath]),
      tailCaptureLog: command(['tail', '-n', '80', plan.paths.captureLogPath])
    },
    agentSafeNext: plan.complete
      ? noBrowserSafeNext('objective-completion-audit', command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']), 'none')
      : noBrowserSafeNext('background-proof-capture-plan', planCommand, plan.captureBlocked ? 'operator-approval-required' : 'none')
  };
}

export function formatBackgroundProofCaptureStatusCompact(status) {
  const lines = [
    `status_only: ${yesNo(status.statusOnly)}`,
    `safe_mode: ${yesNo(status.safeMode)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `target: ${compactValue(status.target)}`,
    `target_dir: ${compactValue(status.targetDir)}`,
    `plan_status: ${compactValue(status.planStatus)}`,
    `complete: ${yesNo(status.complete)}`,
    `capture_blocked: ${yesNo(status.captureBlocked)}`,
    `next_artifact_action: ${compactValue(status.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(status.nextArtifactBlocker)}`,
    `missing_artifact_count: ${status.missingArtifactCount}`,
    `background_monitor_available: ${yesNo(status.backgroundMonitorAvailable)}`,
    `background_capture_available: ${yesNo(status.backgroundCaptureAvailable)}`,
    `monitor_pid_exists: ${yesNo(status.processes.monitor.exists)}`,
    `monitor_running: ${yesNo(status.processes.monitor.running)}`,
    `capture_pid_exists: ${yesNo(status.processes.capture.exists)}`,
    `capture_running: ${yesNo(status.processes.capture.running)}`,
    `monitor_log_exists: ${yesNo(status.logs.monitor.exists)}`,
    `monitor_log_lines: ${status.logs.monitor.lineCount || 0}`,
    `capture_log_exists: ${yesNo(status.logs.capture.exists)}`,
    `capture_log_lines: ${status.logs.capture.lineCount || 0}`,
    `auth_watch_exists: ${yesNo(status.targetOutputs.authWatchStatus.exists)}`,
    `auth_watch_status: ${compactValue(status.targetOutputs.authWatchStatus.status)}`,
    `auth_watch_ok: ${yesNo(status.targetOutputs.authWatchStatus.ok)}`,
    `auth_watch_login_like: ${status.targetOutputs.authWatchStatus.loginLike === null || status.targetOutputs.authWatchStatus.loginLike === undefined ? 'unknown' : yesNo(status.targetOutputs.authWatchStatus.loginLike)}`,
    `handoff_wait_auth_exists: ${yesNo(status.targetOutputs.handoffWaitAuthStatus.exists)}`,
    `handoff_wait_auth_status: ${compactValue(status.targetOutputs.handoffWaitAuthStatus.status)}`,
    `handoff_wait_auth_active: ${yesNo(status.targetOutputs.handoffWaitAuthStatus.active)}`,
    `handoff_wait_auth_attempts: ${status.targetOutputs.handoffWaitAuthStatus.attemptCount ?? 0}`,
    `handoff_resume_latest_exists: ${yesNo(status.targetOutputs.handoffResumeLatest.exists)}`,
    `handoff_resume_latest_status: ${compactValue(status.targetOutputs.handoffResumeLatest.status)}`,
    `agent_safe_next_command_id: ${compactValue(status.agentSafeNext?.id)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNext?.mayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNext?.opensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNext?.startsCapture)}`,
    `agent_safe_next_starts_background: ${yesNo(status.agentSafeNext?.startsBackground)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNext?.readsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNext?.returnsPageContent)}`,
    `agent_safe_next_blocked_reason: ${compactValue(status.agentSafeNext?.blockedReason)}`,
    ...(status.agentSafeNext?.command?.shell ? [`agent_safe_next_command: ${status.agentSafeNext.command.shell}`] : []),
    `plan_command: ${status.commands.plan.shell}`,
    ...(status.commands.noOpenWaitCapture?.shell ? [`no_open_wait_capture_command: ${status.commands.noOpenWaitCapture.shell}`] : []),
    ...(status.commands.backgroundNoOpenWaitCapture?.shell ? [`background_no_open_wait_capture_command: ${status.commands.backgroundNoOpenWaitCapture.shell}`] : []),
    `poll_objective_command: ${status.commands.pollObjective.shell}`,
    `completion_audit_command: ${status.commands.completionAudit.shell}`,
    `tail_monitor_log_command: ${status.commands.tailMonitorLog.shell}`,
    `tail_capture_log_command: ${status.commands.tailCaptureLog.shell}`
  ];
  if (status.logs.monitor.lastLine) lines.push(`monitor_log_last_line: ${status.logs.monitor.lastLine}`);
  if (status.logs.capture.lastLine) lines.push(`capture_log_last_line: ${status.logs.capture.lastLine}`);
  return `${lines.join('\n')}\n`;
}

export function formatBackgroundProofCaptureStatusMarkdown(status) {
  return [
    '# Secure Browser Agent Background Proof Capture Status',
    '',
    `Generated: ${status.generatedAt}`,
    `Target: ${status.target || 'none'}`,
    `Target dir: ${status.targetDir || 'none'}`,
    `Status only: ${status.statusOnly ? 'yes' : 'no'}`,
    `Secret values read: ${status.secretValuesRead ? 'yes' : 'no'}`,
    `Monitor running: ${status.processes.monitor.running ? 'yes' : 'no'}`,
    `Capture running: ${status.processes.capture.running ? 'yes' : 'no'}`,
    `Auth watch: ${status.targetOutputs.authWatchStatus.status || 'none'}`,
    `Handoff wait auth: ${status.targetOutputs.handoffWaitAuthStatus.status || 'none'}`,
    `Handoff resume latest: ${status.targetOutputs.handoffResumeLatest.status || 'none'}`,
    '',
    '## Commands',
    '',
    '```bash',
    status.commands.plan.shell,
    ...(status.commands.noOpenWaitCapture?.shell ? [status.commands.noOpenWaitCapture.shell] : []),
    ...(status.commands.backgroundNoOpenWaitCapture?.shell ? [status.commands.backgroundNoOpenWaitCapture.shell] : []),
    status.commands.pollObjective.shell,
    status.commands.completionAudit.shell,
    '```',
    ''
  ].join('\n');
}
