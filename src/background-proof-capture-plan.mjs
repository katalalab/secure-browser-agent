import path from 'node:path';
import { buildObjectiveProofPipeline } from './objective-proof-pipeline.mjs';
import { toPosixPath } from './output.mjs';

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

function safeRunRelative(value, fallback) {
  const raw = String(value || fallback);
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new Error(`invalid background proof capture path: ${value}`);
  }
  const normalized = path.normalize(raw);
  if (normalized.startsWith('..')) {
    throw new Error(`invalid background proof capture path: ${value}`);
  }
  return toPosixPath(normalized);
}

function backgroundShell({ foreground, logPath, pidPath }) {
  return [
    'mkdir',
    '-p',
    shellQuote(path.dirname(logPath)),
    '&&',
    'nohup',
    foreground.shell,
    '>',
    shellQuote(logPath),
    '2>&1',
    '&',
    'echo',
    '$!',
    '>',
    shellQuote(pidPath)
  ].join(' ');
}

function removeFlag(args = [], flag) {
  return args.filter((item) => item !== flag);
}

function appendBeforeFormat(args = [], values = []) {
  const formatIndex = args.indexOf('--format');
  return formatIndex >= 0
    ? [...args.slice(0, formatIndex), ...values, ...args.slice(formatIndex)]
    : [...args, ...values];
}

function withWaitFlags(args = [], options = {}) {
  let output = [...args];
  if (!output.includes('--wait-auth')) output.push('--wait-auth');
  if (!output.includes('--wait-auth-timeout-ms')) output = appendBeforeFormat(output, ['--wait-auth-timeout-ms', String(options.timeoutMs)]);
  if (!output.includes('--wait-auth-interval-ms')) output = appendBeforeFormat(output, ['--wait-auth-interval-ms', String(options.intervalMs)]);
  return output;
}

function makeNoOpenWaitCaptureCommand(sourceCommand, options = {}) {
  const args = sourceCommand?.args || [];
  if (!args.length) return null;
  const noOpen = removeFlag(args, '--open-login');
  return command(withWaitFlags(noOpen, options));
}

function commandKind(commandValue) {
  const args = commandValue?.args || [];
  return {
    available: Boolean(commandValue),
    opensBrowser: args.includes('--open-login') || args.includes('--open-only') || args.includes('target-login-capture'),
    waitsForAuth: args.includes('--wait-auth') || args.includes('target-login-capture'),
    startsCapture: Boolean(commandValue) && !args.includes('target-auth-watch') && !args.includes('--open-only')
  };
}

export async function buildBackgroundProofCapturePlan(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const timeoutMs = Number(options.timeoutMs ?? options['timeout-ms'] ?? 300000);
  const intervalMs = Number(options.intervalMs ?? options['interval-ms'] ?? 5000);
  const monitorLogPath = safeRunRelative(options.monitorLogPath || options['monitor-log-path'], 'runs/operator/background-auth-monitor.log');
  const monitorPidPath = safeRunRelative(options.monitorPidPath || options['monitor-pid-path'], 'runs/operator/background-auth-monitor.pid');
  const captureLogPath = safeRunRelative(options.captureLogPath || options['capture-log-path'], 'runs/operator/background-proof-capture.log');
  const capturePidPath = safeRunRelative(options.capturePidPath || options['capture-pid-path'], 'runs/operator/background-proof-capture.pid');
  const pipeline = options.pipeline || await buildObjectiveProofPipeline({
    ...options,
    rootDir,
    generatedAt
  });
  const monitorCommand = pipeline.phases?.monitorAuth?.command || null;
  const openLoginCommand = pipeline.phases?.openLogin?.command || null;
  const waitCaptureCommand = pipeline.phases?.waitAuthThenCapture?.command || null;
  const waitCaptureNoOpen = makeNoOpenWaitCaptureCommand(
    pipeline.phases?.waitAuthThenCaptureNoOpen?.command || waitCaptureCommand,
    { timeoutMs, intervalMs }
  );
  const monitorKind = commandKind(monitorCommand);
  const waitCaptureKind = commandKind(waitCaptureCommand);
  const noOpenKind = commandKind(waitCaptureNoOpen);

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    planOnly: true,
    target: pipeline.target || '',
    status: pipeline.status || 'unknown',
    complete: Boolean(pipeline.complete),
    recommendedNow: pipeline.decision?.recommendedNow || '',
    captureBlocked: Boolean(pipeline.operator?.captureBlocked),
    nextArtifactAction: pipeline.decision?.nextArtifactAction || '',
    nextArtifactBlocker: pipeline.decision?.nextArtifactBlocker || '',
    missingArtifactCount: pipeline.missingArtifactCount || 0,
    missingArtifacts: pipeline.missingArtifacts || [],
    paths: {
      monitorLogPath,
      monitorPidPath,
      captureLogPath,
      capturePidPath
    },
    phases: {
      monitorAuth: {
        ...monitorKind,
        command: monitorCommand,
        backgroundCommand: monitorCommand
          ? { shell: backgroundShell({ foreground: monitorCommand, logPath: monitorLogPath, pidPath: monitorPidPath }) }
          : null
      },
      openLogin: {
        ...commandKind(openLoginCommand),
        command: openLoginCommand,
        operatorActionRequired: Boolean(openLoginCommand)
      },
      waitAuthThenCapture: {
        ...waitCaptureKind,
        command: waitCaptureCommand,
        blockedReason: pipeline.phases?.waitAuthThenCapture?.blockedReason || ''
      },
      backgroundWaitAuthThenCaptureNoOpen: {
        ...noOpenKind,
        command: waitCaptureNoOpen,
        backgroundCommand: waitCaptureNoOpen
          ? { shell: backgroundShell({ foreground: waitCaptureNoOpen, logPath: captureLogPath, pidPath: capturePidPath }) }
          : null,
        opensBrowser: false,
        operatorMustOpenLoginSeparately: Boolean(waitCaptureNoOpen),
        runOnlyAfterOperatorStartsOrCompletesLogin: true
      }
    },
    commands: {
      pollStatus: command(['node', 'src/cli.mjs', 'objective-status', '--format', 'compact']),
      completionAudit: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
      tailMonitorLog: command(['tail', '-n', '80', monitorLogPath]),
      tailCaptureLog: command(['tail', '-n', '80', captureLogPath])
    },
    guidance: {
      recommendedOperatorFlow: waitCaptureNoOpen
        ? 'Open or finish login in the dedicated browser, then run the no-open background wait-capture command. It waits for auth and captures only after auth-check passes.'
        : 'Use the monitor command until the proof pipeline exposes a wait-auth capture command.',
      doNotRunWithoutOperatorLogin: true,
      doesNotReadSecrets: true,
      doesNotCopyBrowserStorage: true
    }
  };
}

export function formatBackgroundProofCapturePlanCompact(plan) {
  const missingIds = (plan.missingArtifacts || []).map((item) => item.id).filter(Boolean);
  const lines = [
    `status: ${compactValue(plan.status)}`,
    `complete: ${yesNo(plan.complete)}`,
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(plan.startsCaptureNow)}`,
    `plan_only: ${yesNo(plan.planOnly)}`,
    `target: ${compactValue(plan.target)}`,
    `recommended_now: ${compactValue(plan.recommendedNow)}`,
    `capture_blocked: ${yesNo(plan.captureBlocked)}`,
    `next_artifact_action: ${compactValue(plan.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(plan.nextArtifactBlocker)}`,
    `missing_artifact_count: ${plan.missingArtifactCount}`,
    `missing_artifacts: ${missingIds.length ? missingIds.join(',') : 'none'}`,
    `monitor_auth_available: ${yesNo(plan.phases.monitorAuth.available)}`,
    `monitor_auth_opens_browser: ${yesNo(plan.phases.monitorAuth.opensBrowser)}`,
    `monitor_auth_starts_capture: ${yesNo(plan.phases.monitorAuth.startsCapture)}`,
    `open_login_available: ${yesNo(plan.phases.openLogin.available)}`,
    `wait_capture_available: ${yesNo(plan.phases.waitAuthThenCapture.available)}`,
    `wait_capture_opens_browser: ${yesNo(plan.phases.waitAuthThenCapture.opensBrowser)}`,
    `wait_capture_starts_capture: ${yesNo(plan.phases.waitAuthThenCapture.startsCapture)}`,
    `background_no_open_wait_capture_available: ${yesNo(plan.phases.backgroundWaitAuthThenCaptureNoOpen.available)}`,
    `background_no_open_wait_capture_opens_browser: ${yesNo(plan.phases.backgroundWaitAuthThenCaptureNoOpen.opensBrowser)}`,
    `background_no_open_wait_capture_starts_capture: ${yesNo(plan.phases.backgroundWaitAuthThenCaptureNoOpen.startsCapture)}`,
    `operator_must_open_login_separately: ${yesNo(plan.phases.backgroundWaitAuthThenCaptureNoOpen.operatorMustOpenLoginSeparately)}`,
    `monitor_log_path: ${plan.paths.monitorLogPath}`,
    `monitor_pid_path: ${plan.paths.monitorPidPath}`,
    `capture_log_path: ${plan.paths.captureLogPath}`,
    `capture_pid_path: ${plan.paths.capturePidPath}`,
    `poll_status_command: ${plan.commands.pollStatus.shell}`,
    `completion_audit_command: ${plan.commands.completionAudit.shell}`,
    `tail_monitor_log_command: ${plan.commands.tailMonitorLog.shell}`,
    `tail_capture_log_command: ${plan.commands.tailCaptureLog.shell}`
  ];
  if (plan.phases.monitorAuth.command?.shell) lines.push(`monitor_auth_command: ${plan.phases.monitorAuth.command.shell}`);
  if (plan.phases.monitorAuth.backgroundCommand?.shell) lines.push(`background_monitor_auth_command: ${plan.phases.monitorAuth.backgroundCommand.shell}`);
  if (plan.phases.openLogin.command?.shell) lines.push(`open_login_command: ${plan.phases.openLogin.command.shell}`);
  if (plan.phases.waitAuthThenCapture.blockedReason) lines.push(`wait_capture_blocked_reason: ${plan.phases.waitAuthThenCapture.blockedReason}`);
  if (plan.phases.waitAuthThenCapture.command?.shell) lines.push(`wait_capture_command: ${plan.phases.waitAuthThenCapture.command.shell}`);
  if (plan.phases.backgroundWaitAuthThenCaptureNoOpen.command?.shell) lines.push(`no_open_wait_capture_command: ${plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.shell}`);
  if (plan.phases.backgroundWaitAuthThenCaptureNoOpen.backgroundCommand?.shell) lines.push(`background_no_open_wait_capture_command: ${plan.phases.backgroundWaitAuthThenCaptureNoOpen.backgroundCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatBackgroundProofCapturePlanMarkdown(plan) {
  const lines = [
    '# Secure Browser Agent Background Proof Capture Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Target: ${plan.target || 'none'}`,
    `Status: ${plan.status}`,
    `Plan only: ${plan.planOnly ? 'yes' : 'no'}`,
    `Opens browser now: ${plan.opensBrowserNow ? 'yes' : 'no'}`,
    `Starts capture now: ${plan.startsCaptureNow ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Recommended Flow',
    '',
    `- ${plan.guidance.recommendedOperatorFlow}`,
    '',
    '## Commands',
    ''
  ];
  if (plan.phases.monitorAuth.backgroundCommand?.shell) {
    lines.push('### Background Auth Monitor', '', '```bash', plan.phases.monitorAuth.backgroundCommand.shell, '```', '');
  }
  if (plan.phases.openLogin.command?.shell) {
    lines.push('### Open Login', '', '```bash', plan.phases.openLogin.command.shell, '```', '');
  }
  if (plan.phases.backgroundWaitAuthThenCaptureNoOpen.backgroundCommand?.shell) {
    lines.push('### Background Wait Auth Then Capture Without Opening Browser', '', '```bash', plan.phases.backgroundWaitAuthThenCaptureNoOpen.backgroundCommand.shell, '```', '');
  }
  return `${lines.join('\n')}\n`;
}
