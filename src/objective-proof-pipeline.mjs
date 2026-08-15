import path from 'node:path';
import { buildObjectiveCompletionAudit } from './objective-completion-audit.mjs';
import { toPosixPath } from './output.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function candidateById(nextAction, id) {
  return (nextAction?.manualCommandCandidates || []).find((item) => item.id === id) || null;
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

function rootRelativeCommandArg(rootDir, value) {
  if (!value) return value;
  const text = String(value);
  if (!path.isAbsolute(text)) return text;
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const resolvedValue = path.resolve(text);
  if (resolvedValue === resolvedRoot || resolvedValue.startsWith(`${resolvedRoot}${path.sep}`)) {
    return toPosixPath(path.relative(resolvedRoot, resolvedValue));
  }
  return text;
}

function commandDisplayShell(rootDir, commandValue) {
  const args = commandValue?.args;
  if (!Array.isArray(args)) return commandValue?.shell || '';
  return command(args.map((arg) => rootRelativeCommandArg(rootDir, arg))).shell;
}

function valuePresent(value) {
  return value !== undefined && value !== null && value !== '';
}

function backgroundStartCommand(mode, options = {}) {
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
  args.push('--run', '--operator-ok', 'OK', '--format', 'compact');
  return command(args);
}

function replaceOption(args, option, value) {
  const next = [...args];
  const index = next.indexOf(option);
  if (index >= 0) {
    next[index + 1] = String(value);
  } else {
    next.push(option, String(value));
  }
  return next;
}

function removeFlag(args, flag) {
  const next = [];
  for (const arg of args || []) {
    if (arg === flag) continue;
    next.push(arg);
  }
  return next;
}

function removeOption(args, option) {
  const next = [];
  for (let index = 0; index < (args || []).length; index += 1) {
    if (args[index] === option) {
      index += 1;
      continue;
    }
    next.push(args[index]);
  }
  return next;
}

export function withMonitorOverrides(commandValue, options = {}) {
  const args = commandValue?.args || [];
  if (!args.includes('target-auth-watch')) return commandValue || null;
  let nextArgs = [...args];
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  if (timeoutMs !== undefined && timeoutMs !== null && timeoutMs !== '') {
    nextArgs = replaceOption(nextArgs, '--timeout-ms', timeoutMs);
  }
  if (intervalMs !== undefined && intervalMs !== null && intervalMs !== '') {
    nextArgs = replaceOption(nextArgs, '--interval-ms', intervalMs);
  }
  return command(nextArgs);
}

function commandKind(command) {
  const args = command?.args || [];
  const handoffResumeOpenOnly = args.includes('target-handoff-resume') && args.includes('--open-login') && !args.includes('--wait-auth');
  return {
    opensBrowser: Boolean(args.includes('--open-login') || args.includes('--open-only') || args.includes('target-login-capture')),
    waitsForAuth: Boolean(args.includes('--wait-auth') || args.includes('target-login-capture')),
    startsCapture: Boolean(command) && !args.includes('target-auth-watch') && !args.includes('--open-only') && !handoffResumeOpenOnly
  };
}

function commandSummary(command) {
  const kind = commandKind(command);
  return {
    command,
    opensBrowser: kind.opensBrowser,
    waitsForAuth: kind.waitsForAuth,
    startsCapture: kind.startsCapture
  };
}

function noOpenWaitCaptureCommand(commandValue) {
  const args = commandValue?.args || [];
  if (!args.includes('target-handoff-resume')) return null;
  if (!args.includes('--run') || !args.includes('--wait-auth')) return null;
  const noOpenArgs = removeFlag(args, '--open-login');
  if (noOpenArgs.length === args.length) return commandValue;
  return command(noOpenArgs);
}

function reopenLoginCommand(commandValue) {
  const args = commandValue?.args || [];
  if (!args.includes('target-handoff-resume')) return null;
  if (!args.includes('--run') || !args.includes('--open-login')) return null;
  let reopenArgs = removeFlag(args, '--wait-auth');
  reopenArgs = removeOption(reopenArgs, '--wait-auth-status-out');
  reopenArgs = removeOption(reopenArgs, '--wait-auth-timeout-ms');
  reopenArgs = removeOption(reopenArgs, '--wait-auth-interval-ms');
  return command(reopenArgs);
}

export async function buildObjectiveProofPipeline(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const audit = options.audit || await buildObjectiveCompletionAudit({
    ...options,
    rootDir
  });
  const nextAction = audit.nextAction || {};
  const executionPolicy = audit.executionPolicy || {};
  const authWatch = candidateById(nextAction, 'auth-watch');
  const openOnly = candidateById(nextAction, 'open-only');
  const loginCaptureWait = candidateById(nextAction, 'login-capture-wait');
  const safeCommandBlockedReason = executionPolicy.agentSafeCommandBlockedReason || '';
  const authWatchHandoffPortReachable = executionPolicy.authWatchHandoffPortReachable;
  const authWatchUnavailable = safeCommandBlockedReason === 'handoff-auth-check-port-unreachable';
  const baseMonitorCommand = executionPolicy.agentSafeCommandMonitorOnly
    ? executionPolicy.agentSafeCommand
    : authWatch?.command || null;
  const monitorCommand = authWatchUnavailable ? null : withMonitorOverrides(baseMonitorCommand, options);
  const oneShotCommand = nextAction.command || loginCaptureWait?.command || null;
  const noOpenCaptureCommand = noOpenWaitCaptureCommand(oneShotCommand);
  const reopenCommand = reopenLoginCommand(oneShotCommand);
  const captureBlocked = Boolean(nextAction.operatorGuidance?.captureBlocked);
  const missingArtifacts = Array.isArray(nextAction.missingArtifacts) ? nextAction.missingArtifacts : [];
  const oneShotKind = commandKind(oneShotCommand);

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || audit.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    source: 'objective-completion-audit',
    complete: Boolean(audit.complete),
    status: audit.status || 'unknown',
    target: nextAction.target || '',
    next: nextAction.id || '',
    remainingCount: audit.finalGate?.remainingCount ?? 0,
    missingArtifacts,
    missingArtifactCount: missingArtifacts.length,
    artifactCommandCovers: Array.isArray(nextAction.artifactCommandCovers) ? nextAction.artifactCommandCovers : [],
    operator: {
      inputRequired: Boolean(nextAction.needsOperatorInput),
      humanAction: nextAction.operatorGuidance?.humanAction || '',
      automationBlocker: nextAction.operatorGuidance?.automationBlocker || '',
      captureBlocked,
      safeCommandBlockedReason,
      authWatchHandoffPort: executionPolicy.authWatchHandoffPort ?? null,
      authWatchHandoffPortReachable
    },
    phases: {
      monitorAuth: {
        available: Boolean(monitorCommand),
        runNow: Boolean(monitorCommand),
        blockedReason: authWatchUnavailable ? safeCommandBlockedReason : '',
        monitorOnly: true,
        ...commandSummary(monitorCommand)
      },
      openLogin: {
        available: Boolean(openOnly?.command),
        runNow: Boolean(openOnly?.command),
        monitorOnly: false,
        ...commandSummary(openOnly?.command || null)
      },
      reopenLogin: {
        available: Boolean(reopenCommand),
        runNow: Boolean(reopenCommand),
        monitorOnly: false,
        ...commandSummary(reopenCommand)
      },
      waitAuthThenCapture: {
        available: Boolean(oneShotCommand),
        runNow: Boolean(oneShotCommand) && !captureBlocked,
        blockedReason: captureBlocked ? (nextAction.operatorGuidance?.automationBlocker || 'operator-login-required') : '',
        monitorOnly: false,
        ...commandSummary(oneShotCommand)
      },
      waitAuthThenCaptureNoOpen: {
        available: Boolean(noOpenCaptureCommand),
        runNow: Boolean(noOpenCaptureCommand) && !captureBlocked,
        blockedReason: captureBlocked ? (nextAction.operatorGuidance?.automationBlocker || 'operator-login-required') : '',
        monitorOnly: false,
        ...commandSummary(noOpenCaptureCommand)
      }
    },
    background: {
      monitorStartAvailable: Boolean(monitorCommand),
      captureStartAvailable: Boolean(noOpenCaptureCommand),
      commandsAreOperatorGated: true,
      statusCommand: command(['node', 'src/cli.mjs', 'background-proof-capture-status', '--format', 'compact']),
      monitorStartCommand: monitorCommand ? backgroundStartCommand('monitor', options) : null,
      captureStartCommand: noOpenCaptureCommand ? backgroundStartCommand('capture', options) : null
    },
    decision: {
      recommendedNow: monitorCommand
        ? 'monitor-auth'
        : authWatchUnavailable && oneShotKind.opensBrowser
        ? 'reopen-login-browser'
        : openOnly?.command
        ? 'open-login'
        : oneShotCommand && !captureBlocked
        ? 'wait-auth-then-capture'
        : 'wait-operator',
      proofCaptureAllowedNow: Boolean(oneShotCommand) && !captureBlocked,
      waitAuthThenCaptureAvailable: Boolean(oneShotCommand),
      nextArtifactAction: nextAction.nextArtifactAction || '',
      nextArtifactBlocker: nextAction.nextArtifactBlocker || '',
      safeCommandBlockedReason
    }
  };
}

export function formatObjectiveProofPipelineCompact(pipeline) {
  const missingIds = pipeline.missingArtifacts.map((item) => item.id).filter(Boolean);
  const rootDir = pipeline.rootDir || process.cwd();
  const lines = [
    `status: ${compactValue(pipeline.status)}`,
    `complete: ${yesNo(pipeline.complete)}`,
    `safe_mode: ${yesNo(pipeline.safeMode)}`,
    `destructive_actions: ${yesNo(pipeline.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(pipeline.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(pipeline.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(pipeline.startsCaptureNow)}`,
    `target: ${compactValue(pipeline.target)}`,
    `next: ${compactValue(pipeline.next)}`,
    `remaining_count: ${pipeline.remainingCount ?? 0}`,
    `operator_input: ${yesNo(pipeline.operator.inputRequired)}`,
    `human_action: ${compactValue(pipeline.operator.humanAction)}`,
    `automation_blocker: ${compactValue(pipeline.operator.automationBlocker)}`,
    `capture_blocked: ${yesNo(pipeline.operator.captureBlocked)}`,
    `agent_safe_blocked_reason: ${compactValue(pipeline.operator.safeCommandBlockedReason)}`,
    `auth_watch_handoff_port: ${compactValue(pipeline.operator.authWatchHandoffPort)}`,
    `auth_watch_handoff_port_reachable: ${pipeline.operator.authWatchHandoffPortReachable === undefined || pipeline.operator.authWatchHandoffPortReachable === null ? 'unknown' : yesNo(pipeline.operator.authWatchHandoffPortReachable)}`,
    `recommended_now: ${pipeline.decision.recommendedNow}`,
    `proof_capture_allowed_now: ${yesNo(pipeline.decision.proofCaptureAllowedNow)}`,
    `wait_auth_then_capture_available: ${yesNo(pipeline.decision.waitAuthThenCaptureAvailable)}`,
    `next_artifact_action: ${compactValue(pipeline.decision.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(pipeline.decision.nextArtifactBlocker)}`,
    `artifact_command_covers: ${pipeline.artifactCommandCovers.length ? pipeline.artifactCommandCovers.join(',') : 'none'}`,
    `missing_artifact_count: ${pipeline.missingArtifactCount}`,
    `missing_artifacts: ${missingIds.length ? missingIds.join(',') : 'none'}`,
    `monitor_auth_available: ${yesNo(pipeline.phases.monitorAuth.available)}`,
    `monitor_auth_opens_browser: ${yesNo(pipeline.phases.monitorAuth.opensBrowser)}`,
    `monitor_auth_starts_capture: ${yesNo(pipeline.phases.monitorAuth.startsCapture)}`,
    `open_login_available: ${yesNo(pipeline.phases.openLogin.available)}`,
    `reopen_login_available: ${yesNo(pipeline.phases.reopenLogin.available)}`,
    `reopen_login_opens_browser: ${yesNo(pipeline.phases.reopenLogin.opensBrowser)}`,
    `reopen_login_starts_capture: ${yesNo(pipeline.phases.reopenLogin.startsCapture)}`,
    `wait_capture_opens_browser: ${yesNo(pipeline.phases.waitAuthThenCapture.opensBrowser)}`,
    `wait_capture_waits_for_auth: ${yesNo(pipeline.phases.waitAuthThenCapture.waitsForAuth)}`,
    `wait_capture_starts_capture: ${yesNo(pipeline.phases.waitAuthThenCapture.startsCapture)}`,
    `wait_capture_no_open_available: ${yesNo(pipeline.phases.waitAuthThenCaptureNoOpen.available)}`,
    `wait_capture_no_open_opens_browser: ${yesNo(pipeline.phases.waitAuthThenCaptureNoOpen.opensBrowser)}`,
    `wait_capture_no_open_waits_for_auth: ${yesNo(pipeline.phases.waitAuthThenCaptureNoOpen.waitsForAuth)}`,
    `wait_capture_no_open_starts_capture: ${yesNo(pipeline.phases.waitAuthThenCaptureNoOpen.startsCapture)}`,
    `background_commands_operator_gated: ${yesNo(pipeline.background?.commandsAreOperatorGated)}`,
    `background_monitor_start_available: ${yesNo(pipeline.background?.monitorStartAvailable)}`,
    `background_capture_start_available: ${yesNo(pipeline.background?.captureStartAvailable)}`
  ];
  if (pipeline.phases.monitorAuth.blockedReason) lines.push(`monitor_auth_blocked_reason: ${pipeline.phases.monitorAuth.blockedReason}`);
  if (pipeline.phases.monitorAuth.command?.shell) lines.push(`monitor_auth_command: ${commandDisplayShell(rootDir, pipeline.phases.monitorAuth.command)}`);
  if (pipeline.phases.openLogin.command?.shell) lines.push(`open_login_command: ${commandDisplayShell(rootDir, pipeline.phases.openLogin.command)}`);
  if (pipeline.phases.reopenLogin.command?.shell) lines.push(`reopen_login_command: ${commandDisplayShell(rootDir, pipeline.phases.reopenLogin.command)}`);
  if (pipeline.phases.waitAuthThenCapture.blockedReason) lines.push(`wait_capture_blocked_reason: ${pipeline.phases.waitAuthThenCapture.blockedReason}`);
  if (pipeline.phases.waitAuthThenCapture.command?.shell) lines.push(`wait_capture_command: ${commandDisplayShell(rootDir, pipeline.phases.waitAuthThenCapture.command)}`);
  if (pipeline.phases.waitAuthThenCaptureNoOpen.blockedReason) lines.push(`wait_capture_no_open_blocked_reason: ${pipeline.phases.waitAuthThenCaptureNoOpen.blockedReason}`);
  if (pipeline.phases.waitAuthThenCaptureNoOpen.command?.shell) lines.push(`wait_capture_no_open_command: ${commandDisplayShell(rootDir, pipeline.phases.waitAuthThenCaptureNoOpen.command)}`);
  if (pipeline.background?.statusCommand?.shell) lines.push(`background_status_command: ${commandDisplayShell(rootDir, pipeline.background.statusCommand)}`);
  if (pipeline.background?.monitorStartCommand?.shell) lines.push(`background_monitor_start_command: ${commandDisplayShell(rootDir, pipeline.background.monitorStartCommand)}`);
  if (pipeline.background?.captureStartCommand?.shell) lines.push(`background_capture_start_command: ${commandDisplayShell(rootDir, pipeline.background.captureStartCommand)}`);
  return `${lines.join('\n')}\n`;
}

export function formatObjectiveProofPipelineMarkdown(pipeline) {
  const rootDir = pipeline.rootDir || process.cwd();
  const lines = [
    '# Objective Proof Pipeline',
    '',
    `Generated: ${pipeline.generatedAt}`,
    `Complete: ${pipeline.complete ? 'yes' : 'no'}`,
    `Safe mode: ${pipeline.safeMode ? 'yes' : 'no'}`,
    `Secret values read: ${pipeline.secretValuesRead ? 'yes' : 'no'}`,
    `Opens browser now: ${pipeline.opensBrowserNow ? 'yes' : 'no'}`,
    `Starts capture now: ${pipeline.startsCaptureNow ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Recommended now: ${pipeline.decision.recommendedNow}`,
    `- Proof capture allowed now: ${pipeline.decision.proofCaptureAllowedNow ? 'yes' : 'no'}`,
    `- Next artifact action: ${pipeline.decision.nextArtifactAction || 'none'}`,
    `- Next artifact blocker: ${pipeline.decision.nextArtifactBlocker || 'none'}`,
    '',
    '## Commands',
    ''
  ];
  if (pipeline.phases.monitorAuth.command?.shell) {
    lines.push('### Monitor Auth', '', '```bash', commandDisplayShell(rootDir, pipeline.phases.monitorAuth.command), '```', '');
  }
  if (pipeline.phases.openLogin.command?.shell) {
    lines.push('### Open Login', '', '```bash', commandDisplayShell(rootDir, pipeline.phases.openLogin.command), '```', '');
  }
  if (pipeline.phases.waitAuthThenCapture.command?.shell) {
    lines.push('### Wait Auth Then Capture', '', '```bash', commandDisplayShell(rootDir, pipeline.phases.waitAuthThenCapture.command), '```', '');
  }
  if (pipeline.phases.waitAuthThenCaptureNoOpen.command?.shell) {
    lines.push('### Wait Auth Then Capture No Open', '', '```bash', commandDisplayShell(rootDir, pipeline.phases.waitAuthThenCaptureNoOpen.command), '```', '');
  }
  return `${lines.join('\n')}\n`;
}
