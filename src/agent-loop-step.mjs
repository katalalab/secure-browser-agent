import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildControlStatus } from './control-status.mjs';
import { toPosixPath } from './output.mjs';

const ALLOWED_RUN_COMMAND_IDS = new Set(['auth-watch']);

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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

function boundedNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
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

function rewriteMonitorCommand(commandValue, { monitorTimeoutMs = 0, monitorIntervalMs = 0 } = {}) {
  let args = [...(commandValue?.args || [])];
  if (args[2] !== 'target-auth-watch') return commandValue;
  if (monitorTimeoutMs > 0) args = replaceOption(args, '--timeout-ms', monitorTimeoutMs);
  if (monitorIntervalMs > 0) args = replaceOption(args, '--interval-ms', monitorIntervalMs);
  return command(args);
}

function linePreview(text, maxLines = 40) {
  return String(text || '').split(/\r?\n/).filter(Boolean).slice(0, maxLines);
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/agent-loop-step-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent loop step output path: ${outPath}`);
  return outputPath;
}

function safeStatusPath(rootDir, inputPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(inputPath || 'operator/agent-loop-step-latest.json').replace(/^[/\\]+/, '');
  const filePath = path.resolve(runsRoot, relative);
  const insideRuns = filePath === runsRoot || filePath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent loop step status input path: ${inputPath}`);
  return filePath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent loop step status input path: ${filePath}`);
  return toPosixPath(path.relative(runsRoot, resolved));
}

function fileAgeSeconds(filePath, nowMs) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return Math.max(0, Math.round((nowMs - stat.mtimeMs) / 1000));
}

function recommendedStepCommand({ exists, stale, parseError, allowedToRun, executed, refreshCommand, runCommand }) {
  if (!exists || stale || parseError) {
    return {
      id: 'refresh-agent-loop-step',
      command: refreshCommand
    };
  }
  if (allowedToRun && !executed && runCommand) {
    return {
      id: 'run-agent-loop-step',
      command: runCommand
    };
  }
  return {
    id: 'refresh-agent-loop-step',
    command: refreshCommand
  };
}

function agentSafeNextForStepStatus(recommendation = {}) {
  const isRefresh = recommendation.id === 'refresh-agent-loop-step';
  const isRun = recommendation.id === 'run-agent-loop-step';
  return {
    agentSafeNextCommandId: isRefresh ? 'agent-loop-step-refresh' : (isRun ? 'agent-loop-step-run' : 'none'),
    agentSafeNextMayRunUnattended: isRefresh || isRun,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand: isRefresh || isRun ? recommendation.command : null
  };
}

function defaultRunner(command, options = {}) {
  const args = command?.args || [];
  if (args.length === 0) throw new Error('agent loop command has no args');
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

function commandIsAllowed(agentLoop = {}) {
  const commandId = agentLoop.commandId || '';
  const command = agentLoop.command || null;
  const args = command?.args || [];
  return Boolean(
    agentLoop.canRunWithoutApproval
    && !agentLoop.opensBrowserNow
    && !agentLoop.startsCaptureNow
    && ALLOWED_RUN_COMMAND_IDS.has(commandId)
    && args[0] === 'node'
    && args[1] === 'src/cli.mjs'
    && args[2] === 'target-auth-watch'
  );
}

function commandBlockedReason(agentLoop = {}, selectedCommand = agentLoop.command || null) {
  if (commandIsAllowed({ ...agentLoop, command: selectedCommand })) return '';
  if (!selectedCommand) return 'no-agent-loop-command';
  if (!agentLoop.canRunWithoutApproval) return 'approval-required';
  if (agentLoop.opensBrowserNow) return 'opens-browser';
  if (agentLoop.startsCaptureNow) return 'starts-capture';
  if (!ALLOWED_RUN_COMMAND_IDS.has(agentLoop.commandId || '')) return 'command-id-not-allowed';
  if (selectedCommand?.args?.[2] !== 'target-auth-watch') return 'command-target-not-allowed';
  return 'command-shape-not-allowed';
}

export async function buildAgentLoopStep(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const write = Boolean(options.write);
  const timeoutMs = Number(options.timeoutMs || 300000);
  const monitorTimeoutMs = boundedNumber(options.monitorTimeoutMs ?? options['monitor-timeout-ms']);
  const monitorIntervalMs = boundedNumber(options.monitorIntervalMs ?? options['monitor-interval-ms']);
  const plannedOutputPath = safeRunPath(rootDir, options.out || options.output);
  const plannedOutputRelative = runsRelativePath(rootDir, plannedOutputPath);
  const outputPath = write ? plannedOutputPath : '';
  const monitorArgs = [
    ...(monitorTimeoutMs > 0 ? ['--monitor-timeout-ms', String(monitorTimeoutMs)] : []),
    ...(monitorIntervalMs > 0 ? ['--monitor-interval-ms', String(monitorIntervalMs)] : [])
  ];
  const stepWriteCommand = command(['node', 'src/cli.mjs', 'agent-loop-step', '--write', '--out', plannedOutputRelative, ...monitorArgs, '--format', 'compact']);
  const stepStatusCommand = command(['node', 'src/cli.mjs', 'agent-loop-step-status', '--in', plannedOutputRelative, '--format', 'compact']);
  const controlStatus = options.controlStatus || await buildControlStatus({
    ...options,
    rootDir,
    generatedAt
  });
  const agentLoop = controlStatus.agentLoop || {};
  const sourceCommand = agentLoop.command || null;
  const selectedCommand = sourceCommand && agentLoop.commandId === 'auth-watch'
    ? rewriteMonitorCommand(sourceCommand, { monitorTimeoutMs, monitorIntervalMs })
    : sourceCommand;
  const allowedToRun = commandIsAllowed(agentLoop);
  const blockedReason = commandBlockedReason(agentLoop, selectedCommand);

  const step = {
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    runRequested: run,
    executed: false,
    status: run ? (allowedToRun ? 'ready-to-run' : 'blocked') : 'planned',
    nextAction: agentLoop.nextAction || 'none',
    commandId: agentLoop.commandId || 'none',
    canRunWithoutApproval: Boolean(agentLoop.canRunWithoutApproval),
    allowedToRun,
    blockedReason,
    opensBrowserNow: Boolean(agentLoop.opensBrowserNow),
    startsCaptureNow: Boolean(agentLoop.startsCaptureNow),
    userApprovalRequiredForBackgroundStart: Boolean(agentLoop.userApprovalRequiredForBackgroundStart),
    monitorTimeoutMs,
    monitorIntervalMs,
    command: selectedCommand,
    statusCommand: agentLoop.statusCommand || null,
    backgroundStatusCommand: agentLoop.backgroundStatusCommand || null,
    backgroundCaptureStartCommand: agentLoop.backgroundCaptureStartCommand || null,
    backgroundMonitorStartCommand: agentLoop.backgroundMonitorStartCommand || null,
    stepWriteCommand,
    stepRunCommand: allowedToRun
      ? command([
          'node',
          'src/cli.mjs',
          'agent-loop-step',
          '--run',
          '--write',
          '--out',
          plannedOutputRelative,
          '--timeout-ms',
          String(timeoutMs),
          ...monitorArgs,
          '--format',
          'compact'
        ])
      : null,
    stepStatusCommand,
    outputPath,
    child: null
  };

  if (!run || !allowedToRun) {
    if (write) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(step, null, 2)}\n`, 'utf8');
    }
    return step;
  }

  const runner = options.runner || defaultRunner;
  const child = runner(selectedCommand, {
    cwd: rootDir,
    timeoutMs,
    env: options.env
  });
  step.executed = true;
  step.status = child.status === 0 ? 'ran' : 'failed';
  step.child = {
    exitCode: child.status,
    signal: child.signal || '',
    error: child.error || '',
    stdoutLineCount: linePreview(child.stdout, Number.MAX_SAFE_INTEGER).length,
    stderrLineCount: linePreview(child.stderr, Number.MAX_SAFE_INTEGER).length,
    stdoutPreview: linePreview(child.stdout, options.maxPreviewLines || 40),
    stderrPreview: linePreview(child.stderr, options.maxPreviewLines || 20)
  };
  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(step, null, 2)}\n`, 'utf8');
  }
  return step;
}

export function formatAgentLoopStepCompact(step) {
  const lines = [
    `status: ${clean(step.status)}`,
    `run_requested: ${yesNo(step.runRequested)}`,
    `executed: ${yesNo(step.executed)}`,
    `safe_mode: ${yesNo(step.safeMode)}`,
    `destructive_actions: ${yesNo(step.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(step.secretValuesRead)}`,
    `next_action: ${clean(step.nextAction || 'none')}`,
    `command_id: ${clean(step.commandId || 'none')}`,
    `can_run_without_approval: ${yesNo(step.canRunWithoutApproval)}`,
    `allowed_to_run: ${yesNo(step.allowedToRun)}`,
    `blocked_reason: ${clean(step.blockedReason || 'none')}`,
    `opens_browser_now: ${yesNo(step.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(step.startsCaptureNow)}`,
    `user_approval_required_for_background_start: ${yesNo(step.userApprovalRequiredForBackgroundStart)}`,
    `monitor_timeout_ms: ${step.monitorTimeoutMs || 0}`,
    `monitor_interval_ms: ${step.monitorIntervalMs || 0}`
  ];
  if (step.command?.shell) lines.push(`command: ${step.command.shell}`);
  if (step.statusCommand?.shell) lines.push(`status_command: ${step.statusCommand.shell}`);
  if (step.backgroundStatusCommand?.shell) lines.push(`background_status_command: ${step.backgroundStatusCommand.shell}`);
  if (step.backgroundCaptureStartCommand?.shell) lines.push(`background_capture_start_command: ${step.backgroundCaptureStartCommand.shell}`);
  if (step.backgroundMonitorStartCommand?.shell) lines.push(`background_monitor_start_command: ${step.backgroundMonitorStartCommand.shell}`);
  if (step.stepWriteCommand?.shell) lines.push(`step_write_command: ${step.stepWriteCommand.shell}`);
  if (step.stepRunCommand?.shell) lines.push(`step_run_command: ${step.stepRunCommand.shell}`);
  if (step.stepStatusCommand?.shell) lines.push(`step_status_command: ${step.stepStatusCommand.shell}`);
  if (step.outputPath) lines.push(`output: ${step.outputPath}`);
  if (step.child) {
    lines.push(`child_exit_code: ${step.child.exitCode ?? 'none'}`);
    lines.push(`child_signal: ${clean(step.child.signal || 'none')}`);
    lines.push(`child_error: ${clean(step.child.error || 'none')}`);
    lines.push(`child_stdout_lines: ${step.child.stdoutLineCount ?? 0}`);
    lines.push(`child_stderr_lines: ${step.child.stderrLineCount ?? 0}`);
  }
  return `${lines.join('\n')}\n`;
}

export function buildAgentLoopStepStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const nowMs = options.nowMs ?? Date.parse(generatedAt);
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? 900);
  const monitorTimeoutMs = boundedNumber(options.monitorTimeoutMs ?? options['monitor-timeout-ms']);
  const monitorIntervalMs = boundedNumber(options.monitorIntervalMs ?? options['monitor-interval-ms']);
  const filePath = safeStatusPath(rootDir, options.in || options.input || options.path);
  const monitorArgs = [
    ...(monitorTimeoutMs > 0 ? ['--monitor-timeout-ms', String(monitorTimeoutMs)] : []),
    ...(monitorIntervalMs > 0 ? ['--monitor-interval-ms', String(monitorIntervalMs)] : [])
  ];
  const refreshCommand = command([
    'node',
    'src/cli.mjs',
    'agent-loop-step',
    '--write',
    '--out',
    runsRelativePath(rootDir, filePath),
    ...monitorArgs,
    '--format',
    'compact'
  ]);
  const runCommand = command([
    'node',
    'src/cli.mjs',
    'agent-loop-step',
    '--run',
    '--write',
    '--out',
    runsRelativePath(rootDir, filePath),
    '--timeout-ms',
    String(options.timeoutMs || 300000),
    ...monitorArgs,
    '--format',
    'compact'
  ]);
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
    stepStatus: 'none',
    nextAction: 'refresh-agent-loop-step',
    commandId: 'none',
    runRequested: false,
    executed: false,
    allowedToRun: false,
    blockedReason: 'no-saved-step',
    opensBrowserNow: false,
    startsCaptureNow: false,
    userApprovalRequiredForBackgroundStart: false,
    monitorTimeoutMs,
    monitorIntervalMs,
    childExitCode: null,
    childSignal: '',
    childError: '',
    childStdoutLines: 0,
    childStderrLines: 0,
    refreshCommand,
    runCommand,
    runCommandAllowed: false,
    recommendedCommandId: 'refresh-agent-loop-step',
    recommendedCommand: refreshCommand,
    ...agentSafeNextForStepStatus({ id: 'refresh-agent-loop-step', command: refreshCommand })
  };

  if (!fs.existsSync(filePath)) return base;

  const ageSeconds = fileAgeSeconds(filePath, Number.isFinite(nowMs) ? nowMs : Date.now());
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const recommendation = recommendedStepCommand({
      exists: true,
      stale: true,
      parseError: error.message,
      allowedToRun: false,
      executed: false,
      refreshCommand,
      runCommand
    });
    return {
      ...base,
      exists: true,
      parseError: error.message,
      ageSeconds,
      stale: true,
      stepStatus: 'parse-error',
      blockedReason: 'parse-error',
      recommendedCommandId: recommendation.id,
      recommendedCommand: recommendation.command,
      ...agentSafeNextForStepStatus(recommendation)
    };
  }

  const stale = ageSeconds === null || ageSeconds > staleAfterSeconds;
  const child = saved.child || null;
  const savedAllowedToRun = commandIsAllowed({
    canRunWithoutApproval: Boolean(saved.canRunWithoutApproval),
    opensBrowserNow: Boolean(saved.opensBrowserNow),
    startsCaptureNow: Boolean(saved.startsCaptureNow),
    commandId: saved.commandId || '',
    command: saved.command || null
  });
  const savedBlockedReason = savedAllowedToRun
    ? ''
    : commandBlockedReason({
        canRunWithoutApproval: Boolean(saved.canRunWithoutApproval),
        opensBrowserNow: Boolean(saved.opensBrowserNow),
        startsCaptureNow: Boolean(saved.startsCaptureNow),
        commandId: saved.commandId || '',
        command: saved.command || null
      });
  const recommendation = recommendedStepCommand({
    exists: true,
    stale,
    parseError: '',
    allowedToRun: savedAllowedToRun,
    executed: Boolean(saved.executed),
    refreshCommand,
    runCommand
  });
  return {
    ...base,
    exists: true,
    ageSeconds,
    stale,
    stepStatus: saved.status || 'unknown',
    nextAction: stale ? 'refresh-agent-loop-step' : saved.nextAction || 'none',
    commandId: saved.commandId || 'none',
    runRequested: Boolean(saved.runRequested),
    executed: Boolean(saved.executed),
    allowedToRun: savedAllowedToRun,
    blockedReason: savedAllowedToRun ? '' : (savedBlockedReason || saved.blockedReason || ''),
    opensBrowserNow: Boolean(saved.opensBrowserNow),
    startsCaptureNow: Boolean(saved.startsCaptureNow),
    userApprovalRequiredForBackgroundStart: Boolean(saved.userApprovalRequiredForBackgroundStart),
    monitorTimeoutMs: saved.monitorTimeoutMs || monitorTimeoutMs,
    monitorIntervalMs: saved.monitorIntervalMs || monitorIntervalMs,
    childExitCode: child?.exitCode ?? null,
    childSignal: child?.signal || '',
    childError: child?.error || '',
    childStdoutLines: child?.stdoutLineCount ?? 0,
    childStderrLines: child?.stderrLineCount ?? 0,
    runCommandAllowed: recommendation.id === 'run-agent-loop-step',
    recommendedCommandId: recommendation.id,
    recommendedCommand: recommendation.command,
    ...agentSafeNextForStepStatus(recommendation)
  };
}

export function formatAgentLoopStepStatusCompact(status) {
  const lines = [
    `status_only: ${yesNo(status.statusOnly)}`,
    `exists: ${yesNo(status.exists)}`,
    `stale: ${yesNo(status.stale)}`,
    `safe_mode: ${yesNo(status.safeMode)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `step_status: ${clean(status.stepStatus || 'none')}`,
    `next_action: ${clean(status.nextAction || 'none')}`,
    `recommended_command_id: ${clean(status.recommendedCommandId || 'none')}`,
    `agent_safe_next_command_id: ${clean(status.agentSafeNextCommandId || 'none')}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `run_command_allowed: ${yesNo(status.runCommandAllowed)}`,
    `command_id: ${clean(status.commandId || 'none')}`,
    `run_requested: ${yesNo(status.runRequested)}`,
    `executed: ${yesNo(status.executed)}`,
    `allowed_to_run: ${yesNo(status.allowedToRun)}`,
    `blocked_reason: ${clean(status.blockedReason || 'none')}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `user_approval_required_for_background_start: ${yesNo(status.userApprovalRequiredForBackgroundStart)}`,
    `monitor_timeout_ms: ${status.monitorTimeoutMs || 0}`,
    `monitor_interval_ms: ${status.monitorIntervalMs || 0}`,
    `age_seconds: ${status.ageSeconds ?? 'none'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `parse_error: ${clean(status.parseError || 'none')}`,
    `child_exit_code: ${status.childExitCode ?? 'none'}`,
    `child_signal: ${clean(status.childSignal || 'none')}`,
    `child_error: ${clean(status.childError || 'none')}`,
    `child_stdout_lines: ${status.childStdoutLines ?? 0}`,
    `child_stderr_lines: ${status.childStderrLines ?? 0}`,
    `path: ${status.path}`
  ];
  if (status.agentSafeNextCommand?.shell) lines.push(`agent_safe_next_command: ${status.agentSafeNextCommand.shell}`);
  if (status.recommendedCommand?.shell) lines.push(`recommended_command: ${status.recommendedCommand.shell}`);
  if (status.refreshCommand?.shell) lines.push(`refresh_command: ${status.refreshCommand.shell}`);
  if (status.runCommandAllowed && status.runCommand?.shell) lines.push(`run_command: ${status.runCommand.shell}`);
  return `${lines.join('\n')}\n`;
}
