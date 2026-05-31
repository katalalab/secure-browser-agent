import path from 'node:path';
import { buildObjectiveSafeCommand } from './objective-safe-command.mjs';

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
    throw new Error(`invalid background monitor path: ${value}`);
  }
  const normalized = path.normalize(raw);
  if (normalized.startsWith('..')) {
    throw new Error(`invalid background monitor path: ${value}`);
  }
  return normalized;
}

function backgroundShell({ foreground, logPath, pidPath }) {
  const quotedCommand = foreground.shell;
  return [
    'mkdir',
    '-p',
    shellQuote(path.dirname(logPath)),
    '&&',
    'nohup',
    quotedCommand,
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

export async function buildBackgroundMonitorPlan(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const timeoutMs = Number(options.timeoutMs ?? options['timeout-ms'] ?? 300000);
  const intervalMs = Number(options.intervalMs ?? options['interval-ms'] ?? 5000);
  const statusOut = safeRunRelative(options.statusOut || options['status-out'], 'operator/background-proof-gate-watch-status.json');
  const logPath = safeRunRelative(options.logPath || options['log-path'], 'runs/operator/background-proof-gate-watch.log');
  const pidPath = safeRunRelative(options.pidPath || options['pid-path'], 'runs/operator/background-proof-gate-watch.pid');
  const safeCommand = options.safeCommand || await buildObjectiveSafeCommand({
    ...options,
    rootDir,
    generatedAt
  });
  const foreground = command([
    'node',
    'src/cli.mjs',
    'proof-gate-watch',
    '--write',
    '--out',
    statusOut,
    '--timeout-ms',
    String(timeoutMs),
    '--interval-ms',
    String(intervalMs),
    '--format',
    'compact'
  ]);

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCapture: false,
    monitorOnly: true,
    status: safeCommand.status || 'unknown',
    complete: Boolean(safeCommand.complete),
    target: safeCommand.target || '',
    currentSafeCommandId: safeCommand.commandId || 'none',
    currentSafeCommandMonitorOnly: Boolean(safeCommand.monitorOnly),
    currentSafeCommandMayOpenBrowser: Boolean(safeCommand.mayOpenBrowser),
    currentSafeCommandStartsCapture: Boolean(safeCommand.startsCapture),
    nextArtifactAction: safeCommand.nextArtifactAction || '',
    nextArtifactBlocker: safeCommand.nextArtifactBlocker || '',
    paths: {
      statusOut,
      logPath,
      pidPath
    },
    commands: {
      foregroundWatch: foreground,
      backgroundWatch: {
        shell: backgroundShell({ foreground, logPath, pidPath })
      },
      pollStatus: command(['node', 'src/cli.mjs', 'proof-gate-status', '--format', 'compact']),
      readWatchFile: command(['node', '-e', `console.log(require('fs').readFileSync(${JSON.stringify(path.join(rootDir, 'runs', statusOut))}, 'utf8'))`]),
      tailLog: command(['tail', '-n', '80', logPath])
    }
  };
}

export function formatBackgroundMonitorPlanCompact(plan) {
  const lines = [
    `status: ${compactValue(plan.status)}`,
    `complete: ${yesNo(plan.complete)}`,
    `target: ${compactValue(plan.target)}`,
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `monitor_only: ${yesNo(plan.monitorOnly)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `starts_capture: ${yesNo(plan.startsCapture)}`,
    `current_safe_command_id: ${compactValue(plan.currentSafeCommandId)}`,
    `current_safe_command_monitor_only: ${yesNo(plan.currentSafeCommandMonitorOnly)}`,
    `current_safe_command_may_open_browser: ${yesNo(plan.currentSafeCommandMayOpenBrowser)}`,
    `current_safe_command_starts_capture: ${yesNo(plan.currentSafeCommandStartsCapture)}`,
    `next_artifact_action: ${compactValue(plan.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(plan.nextArtifactBlocker)}`,
    `status_out: ${plan.paths.statusOut}`,
    `log_path: ${plan.paths.logPath}`,
    `pid_path: ${plan.paths.pidPath}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `foreground_watch_command: ${plan.commands.foregroundWatch.shell}`,
    `background_watch_command: ${plan.commands.backgroundWatch.shell}`,
    `poll_status_command: ${plan.commands.pollStatus.shell}`,
    `read_watch_file_command: ${plan.commands.readWatchFile.shell}`,
    `tail_log_command: ${plan.commands.tailLog.shell}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatBackgroundMonitorPlanMarkdown(plan) {
  return [
    '# Secure Browser Agent Background Monitor Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Root: ${plan.rootDir}`,
    `Status: ${plan.status}`,
    `Target: ${plan.target || 'none'}`,
    `Monitor only: ${plan.monitorOnly ? 'yes' : 'no'}`,
    `Opens browser now: ${plan.opensBrowserNow ? 'yes' : 'no'}`,
    `Starts capture: ${plan.startsCapture ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Files',
    '',
    `- Status: ${plan.paths.statusOut}`,
    `- Log: ${plan.paths.logPath}`,
    `- PID: ${plan.paths.pidPath}`,
    '',
    '## Commands',
    '',
    '```bash',
    plan.commands.backgroundWatch.shell,
    '```',
    ''
  ].join('\n');
}
