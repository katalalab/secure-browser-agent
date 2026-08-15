import fs from 'node:fs';
import path from 'node:path';
import { openCdpProfile } from './cdp-backend.mjs';
import { safeOutputPath } from './output.mjs';
import { assertAllowedUrl, assertEngineAllowed, loadPolicy, profilePath } from './policy.mjs';
import { resolveTargetLogin } from './target-pack.mjs';
import { buildTargetProofCapture, formatTargetProofCaptureMarkdown } from './target-proof-capture.mjs';
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

function buildHandoff(target, captureCommand) {
  const authCheckPortIndex = captureCommand.args.indexOf('--auth-check-port');
  const authCheckPort = authCheckPortIndex >= 0 ? captureCommand.args[authCheckPortIndex + 1] : '';
  const authCheckCommand = command([
    'node',
    'src/cli.mjs',
    'target-auth-check',
    target.dir,
    ...(target.realExternal ? ['--real-external'] : []),
    ...(authCheckPort ? ['--cdp-port', String(authCheckPort)] : []),
    '--format',
    'markdown'
  ]);
  const controlStatusCommand = command(['node', 'src/cli.mjs', 'control-status', '--format', 'compact']);
  const secretRunPlanCommand = command([
    'node',
    'src/cli.mjs',
    'secret-run-plan',
    '--mode',
    'service-account',
    '--command',
    'target-login-capture',
    '--target-dir',
    target.dir,
    '--format',
    'compact'
  ]);
  const proofPlanCommand = command([
    'node',
    'src/cli.mjs',
    'target-proof-plan',
    target.dir,
    ...(target.realExternal ? ['--real-external'] : []),
    '--format',
    'markdown'
  ]);
  const readinessAuditCommand = command(['node', 'src/cli.mjs', 'readiness-audit', '--format', 'markdown']);
  const completionAuditCommand = command(['node', 'src/cli.mjs', 'objective-completion-audit', '--format', 'markdown']);
  const objectiveNextCommand = command(['node', 'src/cli.mjs', 'objective-next', '--format', 'markdown']);
  return {
    instructions: [
      'Complete login only inside the opened dedicated Chrome profile.',
      'Do not paste credentials, cookies, tokens, or 2FA codes into the terminal, chat, logs, or target pack files.',
      'Keep the login browser open until auth-check passes and the capture phase finishes or reports timed out.'
    ],
    commands: [
      {
        id: 'post-login-capture',
        title: 'Wait for auth-check and capture observe, inspect, scrape, benchmark, and proof artifacts',
        args: captureCommand.args,
        shell: captureCommand.shell
      },
      {
        id: 'auth-check-status',
        title: 'Check whether the dedicated browser is past the login page without capturing proof artifacts',
        args: authCheckCommand.args,
        shell: authCheckCommand.shell
      },
      {
        id: 'control-status',
        title: 'Show the compact objective, runtime, and 1Password/headless status in one response',
        args: controlStatusCommand.args,
        shell: controlStatusCommand.shell
      },
      {
        id: 'secret-run-plan',
        title: 'Show the op run wrapper for headless 1Password Service Account execution',
        args: secretRunPlanCommand.args,
        shell: secretRunPlanCommand.shell
      },
      {
        id: 'proof-plan-status',
        title: 'Inspect the current proof state without mutating the target profile',
        args: proofPlanCommand.args,
        shell: proofPlanCommand.shell
      },
      {
        id: 'readiness-audit',
        title: 'Confirm whether the overall objective now accepts the real external proof',
        args: readinessAuditCommand.args,
        shell: readinessAuditCommand.shell
      },
      {
        id: 'objective-completion-audit',
        title: 'Run the strict final completion gate for the full browser-agent objective',
        args: completionAuditCommand.args,
        shell: completionAuditCommand.shell
      },
      {
        id: 'objective-next',
        title: 'Show the next required action after the capture attempt',
        args: objectiveNextCommand.args,
        shell: objectiveNextCommand.shell
      }
    ]
  };
}

function buildCaptureCommand(target, normalized, extraArgs = []) {
  return command([
    'node',
    'src/cli.mjs',
    'target-proof-capture',
    target.dir,
    ...(normalized.realExternal ? ['--real-external'] : []),
    '--run',
    ...(normalized.waitAuth ? ['--wait-auth'] : []),
    ...(normalized.waitAuthTimeoutMs ? ['--wait-auth-timeout-ms', String(normalized.waitAuthTimeoutMs)] : []),
    ...(normalized.waitAuthIntervalMs ? ['--wait-auth-interval-ms', String(normalized.waitAuthIntervalMs)] : []),
    ...(normalized.waitAuthStatusOut ? ['--wait-auth-status-out', String(normalized.waitAuthStatusOut)] : []),
    ...(normalized.benchmarkFile ? ['--benchmark-file', String(normalized.benchmarkFile)] : []),
    ...(normalized.applyPermissions ? ['--apply-permissions'] : []),
    ...(normalized.stopDaemon ? ['--stop-daemon'] : []),
    ...(normalized.completionAudit ? ['--completion-audit'] : []),
    ...(normalized.cleanupOnFailure === false ? ['--no-cleanup-on-failure'] : []),
    ...extraArgs,
    '--format',
    'markdown'
  ]);
}

function handoffFormat(outPath, explicitFormat) {
  if (explicitFormat) return explicitFormat;
  return String(outPath || '').endsWith('.md') ? 'markdown' : 'json';
}

function handoffPayload(result) {
  return {
    schemaVersion: 1,
    generatedAt: result.generatedAt,
    target: result.target,
    dir: result.dir,
    profile: result.profile,
    loginUrl: result.loginUrl,
    realExternal: result.realExternal,
    safeMode: result.safeMode,
    destructiveActionsIncluded: result.destructiveActionsIncluded,
    handoff: result.handoff
  };
}

function formatHandoffMarkdown(result) {
  const lines = [
    '# Secure Browser Agent Operator Handoff',
    '',
    `Generated: ${result.generatedAt}`,
    `Target: ${result.target}`,
    `Profile: ${result.profile}`,
    `Login URL: ${result.loginUrl}`,
    `Real external: ${result.realExternal ? 'yes' : 'no'}`,
    `Safe mode: ${result.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${result.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Instructions',
    ''
  ];
  for (const item of result.handoff?.instructions || []) {
    lines.push(`- ${item}`);
  }
  lines.push('', '## Commands', '');
  for (const item of result.handoff?.commands || []) {
    lines.push(`### ${item.id}`, '');
    lines.push(`- ${item.title}`);
    if (item.shell) {
      lines.push('', '```bash');
      lines.push(item.shell);
      lines.push('```');
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function writeHandoff(policy, result, options = {}) {
  if (!options.handoffOut) return null;
  const target = safeOutputPath(policy, options.handoffOut);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const format = handoffFormat(options.handoffOut, options.handoffFormat);
  if (format === 'markdown' || format === 'md') {
    fs.writeFileSync(target, formatHandoffMarkdown(result), 'utf8');
  } else if (format === 'json') {
    fs.writeFileSync(target, `${JSON.stringify(handoffPayload(result), null, 2)}\n`, 'utf8');
  } else {
    throw new Error(`unsupported handoff format: ${format}`);
  }
  const rootDir = path.resolve(policy.outputDir, '..');
  return toPosixPath(path.relative(rootDir, target));
}

function normalizeOptions(options = {}) {
  return {
    ...options,
    realExternal: Boolean(options.realExternal || options['real-external']),
    waitAuth: options.waitAuth !== false && options['wait-auth'] !== false,
    waitAuthTimeoutMs: options.waitAuthTimeoutMs || options['wait-auth-timeout-ms'],
    waitAuthIntervalMs: options.waitAuthIntervalMs || options['wait-auth-interval-ms'],
    waitAuthStatusOut: options.waitAuthStatusOut || options['wait-auth-status-out'] || 'wait-auth-status.json',
    benchmarkFile: options.benchmarkFile || options['benchmark-file'],
    applyPermissions: Boolean(options.applyPermissions || options['apply-permissions']),
    startDaemon: options.startDaemon !== false && options['start-daemon'] !== false,
    stopDaemon: Boolean(options.stopDaemon || options['stop-daemon']),
    completionAudit: options.completionAudit ?? options['completion-audit'] ?? Boolean(options.realExternal || options['real-external']),
    cleanupOnFailure: options.cleanupOnFailure !== false && options['no-cleanup-on-failure'] !== true,
    dryRun: Boolean(options.dryRun || options['dry-run']),
    openOnly: Boolean(options.openOnly || options['open-only']),
    handoffOut: options.handoffOut || options['handoff-out'],
    handoffFormat: options.handoffFormat || options['handoff-format']
  };
}

export async function buildTargetLoginCapture(targetDir, options = {}) {
  const normalized = normalizeOptions(options);
  const target = resolveTargetLogin(targetDir, normalized);
  const policy = loadPolicy(target.policy);
  assertEngineAllowed('chrome', target.profile, policy);
  assertAllowedUrl(target.loginUrl, policy);
  const targetProfilePath = profilePath(policy, target.profile);

  const result = {
    schemaVersion: 1,
    generatedAt: normalized.generatedAt || new Date().toISOString(),
    target: target.target,
    dir: target.dir,
    profile: target.profile,
    loginUrl: target.loginUrl,
    realExternal: normalized.realExternal,
    safeMode: true,
    destructiveActionsIncluded: false,
    writesLocalState: true,
    dryRun: normalized.dryRun,
    openOnly: normalized.openOnly,
    status: normalized.dryRun ? 'planned' : 'running',
    login: null,
    captureCommand: buildCaptureCommand(target, normalized),
    handoff: null,
    handoffPath: '',
    capture: null
  };
  result.handoff = buildHandoff({ ...target, realExternal: normalized.realExternal }, result.captureCommand);

  if (normalized.dryRun) {
    result.handoffPath = writeHandoff(policy, result, normalized) || '';
    return result;
  }

  fs.mkdirSync(policy.outputDir, { recursive: true });
  fs.mkdirSync(targetProfilePath, { recursive: true });
  const opener = normalized.opener || openCdpProfile;
  const captureBuilder = normalized.captureBuilder || buildTargetProofCapture;
  result.login = await opener(target.loginUrl, targetProfilePath, { headed: true });
  if (result.login?.port) {
    result.captureCommand = buildCaptureCommand(target, normalized, ['--auth-check-port', String(result.login.port)]);
    result.handoff = buildHandoff({ ...target, realExternal: normalized.realExternal }, result.captureCommand);
    result.handoffPath = writeHandoff(policy, result, normalized) || result.handoffPath;
  }
  if (normalized.openOnly) {
    result.status = 'login-opened';
    return result;
  }
  result.capture = await captureBuilder(target.dir, {
    ...normalized,
    rootDir: normalized.rootDir || process.cwd(),
    realExternal: normalized.realExternal,
    authCheckPort: result.login?.port,
    benchmarkFile: normalized.benchmarkFile,
    applyPermissions: normalized.applyPermissions,
    startDaemon: normalized.startDaemon,
    stopDaemon: normalized.stopDaemon,
    completionAudit: normalized.completionAudit,
    cleanupOnFailure: normalized.cleanupOnFailure,
    run: true,
    waitAuth: normalized.waitAuth,
    waitAuthStatusOut: normalized.waitAuthStatusOut
  });
  result.status = result.capture.status;
  return result;
}

export function formatTargetLoginCaptureMarkdown(result) {
  const lines = [
    '# Secure Browser Agent Target Login Capture',
    '',
    `Generated: ${result.generatedAt}`,
    `Target: ${result.target}`,
    `Profile: ${result.profile}`,
    `Real external: ${result.realExternal ? 'yes' : 'no'}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Open only: ${result.openOnly ? 'yes' : 'no'}`,
    `Status: ${result.status}`,
    `Safe mode: ${result.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${result.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Flow',
    '',
    '- Open the dedicated headed Chrome profile at the target login URL.',
    '- The operator completes login only inside that browser profile.',
    '- The capture phase waits for auth-check to pass, then writes observe, inspect, scrape, benchmark, and proof artifacts.',
    '',
    '## Capture Command',
    '',
    '```bash',
    result.captureCommand.shell,
    '```',
    ''
  ];
  if (result.handoff) {
    lines.push('## Operator Handoff', '');
    for (const item of result.handoff.instructions || []) {
      lines.push(`- ${item}`);
    }
    for (const item of result.handoff.commands || []) {
      lines.push('', `### ${item.id}`, '');
      lines.push(`- ${item.title}`);
      if (item.shell) {
        lines.push('', '```bash');
        lines.push(item.shell);
        lines.push('```');
      }
    }
    lines.push('');
  }
  if (result.login) {
    lines.push('## Login Open', '');
    lines.push(`- OK: ${result.login.ok ? 'yes' : 'no'}`);
    if (result.login.url) lines.push(`- URL: ${result.login.url}`);
    if (result.login.port) lines.push(`- CDP port: ${result.login.port}`);
    lines.push('');
  }
  if (result.capture) {
    lines.push('## Capture Result', '');
    lines.push(formatTargetProofCaptureMarkdown(result.capture).trim());
    lines.push('');
  }
  if (result.handoffPath) {
    lines.push('## Written Handoff', '');
    lines.push(`- Path: ${result.handoffPath}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
