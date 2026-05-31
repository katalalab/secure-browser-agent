import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function findExecutable(command, env = process.env) {
  const paths = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep scanning PATH.
    }
  }
  return '';
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    env,
    encoding: 'utf8',
    timeout: 10000
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error ? result.error.message : ''
  };
}

function commandStatus(command, args = ['--version'], env = process.env) {
  const executable = findExecutable(command, env);
  if (!executable) return { exists: false, path: '', ok: false, version: '' };
  const result = run(executable, args, env);
  return {
    exists: true,
    path: executable,
    ok: result.ok,
    version: (result.stdout || result.stderr || '').trim().split('\n')[0] || '',
    status: result.status,
    error: result.error || result.stderr.trim()
  };
}

function defaultProcessList() {
  const result = spawnSync('ps', ['-axo', 'pid,ppid,command'], {
    encoding: 'utf8',
    timeout: 10000
  });
  return String(result.stdout || '');
}

function countMatches(text, patterns) {
  const lines = String(text || '').split('\n').filter(Boolean);
  return lines.filter((line) => patterns.some((pattern) => pattern.test(line))).length;
}

function envFlag(env, name) {
  return Object.prototype.hasOwnProperty.call(env, name) && String(env[name] || '') !== '';
}

function agentCommandName(args = []) {
  return Array.isArray(args) ? args[2] || '' : '';
}

function agentCommandHas(args = [], value) {
  return Array.isArray(args) && args.includes(value);
}

function agentCommandOpensBrowser(args = []) {
  const name = agentCommandName(args);
  if (name === 'target-login' || name === 'target-login-capture') return true;
  if (name === 'target-handoff-resume' && agentCommandHas(args, '--open-login')) return true;
  if (name === 'target-daemon' && agentCommandHas(args, 'start')) return true;
  return false;
}

function agentCommandStartsCapture(args = []) {
  const name = agentCommandName(args);
  return name === 'target-login-capture'
    || name === 'target-proof-capture'
    || name === 'target-handoff-run'
    || name === 'target-handoff-resume'
    || name === 'target-run'
    || name === 'target-scrape'
    || name === 'target-benchmark';
}

function agentCommandStartsBackground(args = []) {
  return agentCommandName(args) === 'target-daemon' && agentCommandHas(args, 'start');
}

function agentCommandSafety(args = []) {
  const opensBrowser = agentCommandOpensBrowser(args);
  const startsCapture = agentCommandStartsCapture(args);
  const startsBackground = agentCommandStartsBackground(args);
  const requiresOperatorApproval = opensBrowser
    || startsCapture
    || startsBackground
    || agentCommandHas(args, '--run')
    || agentCommandName(args) === 'target-permissions';
  return {
    opensBrowser,
    startsCapture,
    startsBackground,
    requiresOperatorApproval,
    agentMayRunUnattended: Boolean(Array.isArray(args) && args.length && !requiresOperatorApproval)
  };
}

function buildEnvStatus(env) {
  return {
    OP_SERVICE_ACCOUNT_TOKEN: envFlag(env, 'OP_SERVICE_ACCOUNT_TOKEN'),
    OP_CONNECT_HOST: envFlag(env, 'OP_CONNECT_HOST'),
    OP_CONNECT_TOKEN: envFlag(env, 'OP_CONNECT_TOKEN'),
    OP_ACCOUNT: envFlag(env, 'OP_ACCOUNT'),
    OP_BIOMETRIC_UNLOCK_ENABLED: envFlag(env, 'OP_BIOMETRIC_UNLOCK_ENABLED'),
    OP_CACHE: envFlag(env, 'OP_CACHE')
  };
}

function defaultServiceAccountEnvFile() {
  return path.join(os.homedir(), '.config/ai-secret/1password.env');
}

function inspectEnvFile(filePath) {
  const resolvedPath = String(filePath || '');
  if (!resolvedPath) {
    return {
      exists: false,
      path: '',
      strictPermissions: false,
      sizeBytes: 0,
      mode: '',
      modifiedAt: ''
    };
  }
  try {
    const stat = fs.statSync(resolvedPath);
    const mode = stat.mode & 0o777;
    return {
      exists: stat.isFile(),
      path: resolvedPath,
      strictPermissions: (mode & 0o077) === 0,
      sizeBytes: stat.size,
      mode: mode.toString(8).padStart(3, '0'),
      modifiedAt: stat.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      path: resolvedPath,
      strictPermissions: false,
      sizeBytes: 0,
      mode: '',
      modifiedAt: ''
    };
  }
}

export function buildSecretAudit(options = {}) {
  const env = options.env || process.env;
  const processList = options.processList ?? defaultProcessList();
  const op = options.op || commandStatus('op', ['--version'], env);
  const envStatus = buildEnvStatus(env);
  const serviceAccountEnvFile = inspectEnvFile(
    options.serviceAccountEnvFile === undefined
      ? defaultServiceAccountEnvFile()
      : options.serviceAccountEnvFile
  );
  const processes = {
    onePasswordApp: countMatches(processList, [/\/1Password(?:\.app)?\/Contents\/MacOS\/1Password(?:\s|$)/]),
    opDaemon: countMatches(processList, [/(^|\s)op daemon(\s|$)/]),
    onePasswordMcp: countMatches(processList, [/onepassword-mcp/]),
    browserHelper: countMatches(processList, [/1Password Browser Helper|1Password-BrowserSupport|com\.1password\.browser-helper/])
  };
  const serviceAccountConfigured = envStatus.OP_SERVICE_ACCOUNT_TOKEN;
  const connectConfigured = envStatus.OP_CONNECT_HOST && envStatus.OP_CONNECT_TOKEN;
  const desktopIntegrationLikely = op.exists && processes.onePasswordApp > 0 && processes.opDaemon > 0;
  const environmentsMcpLikely = processes.onePasswordMcp > 0;
  const localEnvMountSupported = processes.onePasswordApp > 0 && (process.platform === 'darwin' || process.platform === 'linux');
  const headlessReady = serviceAccountConfigured || connectConfigured;
  const serviceAccountEnvFileUsable = serviceAccountEnvFile.exists && serviceAccountEnvFile.strictPermissions && serviceAccountEnvFile.sizeBytes > 0;
  const headlessConfigAvailable = headlessReady || serviceAccountEnvFileUsable;

  const checks = [
    {
      name: 'cli.op',
      status: op.exists ? 'pass' : 'missing',
      detail: op.exists ? `${op.path} ${op.version}` : '1Password CLI not found on PATH.'
    },
    {
      name: 'headless.service-account',
      status: serviceAccountConfigured ? 'pass' : 'optional',
      detail: serviceAccountConfigured
        ? 'OP_SERVICE_ACCOUNT_TOKEN is set; value redacted.'
        : 'Unset. Use for CI or unattended headless access.'
    },
    {
      name: 'headless.service-account-env-file',
      status: serviceAccountEnvFileUsable ? 'pass' : (serviceAccountEnvFile.exists ? 'warn' : 'optional'),
      detail: serviceAccountEnvFile.exists
        ? `Service Account env file exists at ${serviceAccountEnvFile.path}; mode ${serviceAccountEnvFile.mode}; value not read.`
        : `No local Service Account env file detected at ${serviceAccountEnvFile.path}.`
    },
    {
      name: 'headless.connect',
      status: connectConfigured ? 'pass' : 'optional',
      detail: connectConfigured
        ? 'OP_CONNECT_HOST and OP_CONNECT_TOKEN are set; token value redacted.'
        : 'Unset. Use for a long-lived private secrets automation service.'
    },
    {
      name: 'local.desktop-integration',
      status: desktopIntegrationLikely ? 'pass' : 'optional',
      detail: desktopIntegrationLikely
        ? '1Password app and op daemon are running; commands may still require unlock/approval.'
        : 'Desktop app integration is not fully evident from process state.'
    },
    {
      name: 'local.environments-mcp',
      status: environmentsMcpLikely ? 'pass' : 'optional',
      detail: environmentsMcpLikely
        ? 'onepassword-mcp process is running for Environments management.'
        : 'onepassword-mcp process not detected.'
    },
    {
      name: 'local.env-mount',
      status: localEnvMountSupported ? 'optional' : 'missing',
      detail: localEnvMountSupported
        ? 'Mac/Linux local .env mounts are possible but require user authorization and are not ideal for concurrent readers.'
        : 'Local .env mounts require 1Password for Mac or Linux.'
    }
  ];

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    headlessReady,
    headlessConfigAvailable,
    recommendedHeadlessMode: connectConfigured
      ? 'connect-server'
      : (serviceAccountConfigured || serviceAccountEnvFileUsable ? 'service-account' : 'not-configured'),
    localAgentMode: desktopIntegrationLikely ? 'desktop-app-integration' : 'manual-setup-required',
    op,
    env: envStatus,
    serviceAccountEnvFile,
    localFiles: {
      serviceAccountEnvFile
    },
    processes,
    capabilities: {
      serviceAccountConfigured,
      connectConfigured,
      serviceAccountEnvFilePresent: serviceAccountEnvFile.exists,
      serviceAccountEnvFileStrict: serviceAccountEnvFile.strictPermissions,
      serviceAccountEnvFileUsable,
      headlessConfigAvailable,
      desktopIntegrationLikely,
      environmentsMcpLikely,
      localEnvMountSupported
    },
    checks,
    docs: [
      'https://www.1password.dev/cli/app-integration',
      'https://www.1password.dev/service-accounts/use-with-1password-cli',
      'https://www.1password.dev/connect/cli',
      'https://www.1password.dev/environments/local-env-file'
    ],
    next: headlessReady
      ? [
          'Use op read/op inject/op run with the configured headless mode for API keys and non-browser secrets.',
          'Keep website login sessions in dedicated Chrome target profiles; do not paste passwords through agent prompts.'
        ]
      : (serviceAccountEnvFileUsable
          ? [
              `Source ${serviceAccountEnvFile.path} in the operator shell, then re-run secret-audit to prove OP_SERVICE_ACCOUNT_TOKEN is loaded.`,
              'Use op run for non-browser secrets after the env file is loaded; keep website login sessions in dedicated Chrome target profiles.'
            ]
          : [
              'For unattended headless use, configure a 1Password Service Account or Connect Server and expose only the required token through the operator environment.',
              'For local semi-headless use, keep 1Password desktop integration enabled and expect unlock/approval prompts.'
            ])
  };
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

function shellCommand(script) {
  return command(['sh', '-lc', script]);
}

function shellSourcePath(filePath) {
  const text = String(filePath || '');
  if (!text) return shellQuote(text);
  const resolvedPath = path.resolve(text);
  const homeDir = path.resolve(os.homedir());
  if (resolvedPath === homeDir || resolvedPath.startsWith(`${homeDir}${path.sep}`)) {
    const relative = path.relative(homeDir, resolvedPath).split(path.sep).join('/');
    const escaped = relative.replace(/["\\$`]/g, '\\$&');
    return `"${'${HOME}'}${relative ? `/${escaped}` : ''}"`;
  }
  return shellQuote(text);
}

function serviceAccountEnvFileSourceScript(audit, nextCommand = 'op vault list') {
  const envFilePath = audit?.serviceAccountEnvFile?.path || defaultServiceAccountEnvFile();
  return `set -a; . ${shellSourcePath(envFilePath)}; set +a; ${nextCommand}`;
}

function setupCommandsForMode(mode, audit = null) {
  if (mode === 'connect') {
    return [
      {
        id: 'export-connect-host',
        label: 'Set the Connect Server URL in the operator environment',
        operatorOnly: true,
        command: command(['export', 'OP_CONNECT_HOST=https://connect.example.internal'])
      },
      {
        id: 'export-connect-token',
        label: 'Set the Connect token in the operator environment',
        operatorOnly: true,
        command: command(['export', 'OP_CONNECT_TOKEN=<connect-token>'])
      },
      {
        id: 'verify-connect',
        label: 'Verify Connect access without printing secret values',
        operatorOnly: false,
        command: command(['op', 'vault', 'list'])
      }
    ];
  }
  if (mode === 'local-desktop') {
    return [
      {
        id: 'verify-account',
        label: 'Verify local desktop app integration account access',
        operatorOnly: false,
        command: command(['op', 'account', 'list'])
      },
      {
        id: 'verify-vaults',
        label: 'Verify vault listing after unlock or approval',
        operatorOnly: false,
        command: command(['op', 'vault', 'list'])
      },
      {
        id: 'read-reference',
        label: 'Read a named reference only when the operator provides the op:// path',
        operatorOnly: true,
        command: command(['op', 'read', 'op://vault/item/field'])
      }
    ];
  }
  const commands = [];
  if (audit?.capabilities?.serviceAccountEnvFileUsable) {
    commands.push({
      id: 'source-service-account-env-file',
      label: 'Verify the local Service Account env file without printing secret values',
      operatorOnly: true,
      command: shellCommand(serviceAccountEnvFileSourceScript(audit, 'op vault list'))
    });
  }
  commands.push(
    {
      id: 'export-service-account-token',
      label: 'Set the Service Account token in the operator environment',
      operatorOnly: true,
      command: command(['export', 'OP_SERVICE_ACCOUNT_TOKEN=<service-account-token>'])
    },
    {
      id: 'verify-service-account',
      label: 'Verify Service Account access without printing secret values',
      operatorOnly: false,
      command: command(['op', 'vault', 'list'])
    },
    {
      id: 'run-with-secret-env',
      label: 'Run an agent command with secrets injected by op, not by prompt text',
      operatorOnly: false,
      command: command(['op', 'run', '--', 'node', 'src/cli.mjs', 'secret-audit', '--format', 'compact'])
    }
  );
  return commands;
}

export function buildSecretSetupPlan(options = {}) {
  const audit = options.audit || buildSecretAudit(options);
  const requestedMode = options.mode || '';
  const defaultMode = audit.capabilities.connectConfigured
    ? 'connect'
    : (audit.capabilities.serviceAccountConfigured ? 'service-account' : 'service-account');
  const mode = requestedMode || defaultMode;
  const validModes = new Set(['service-account', 'connect', 'local-desktop']);
  if (!validModes.has(mode)) throw new Error(`invalid secret setup mode: ${mode}`);
  const readyForMode = mode === 'connect'
    ? audit.capabilities.connectConfigured
    : (mode === 'service-account'
        ? audit.capabilities.serviceAccountConfigured
        : audit.capabilities.desktopIntegrationLikely);
  const commands = setupCommandsForMode(mode, audit);
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    mode,
    readyForMode,
    headlessMode: mode !== 'local-desktop',
    audit: {
      headlessReady: audit.headlessReady,
      recommendedHeadlessMode: audit.recommendedHeadlessMode,
      opExists: audit.op.exists,
      opVersion: audit.op.version || '',
      serviceAccountConfigured: audit.capabilities.serviceAccountConfigured,
      connectConfigured: audit.capabilities.connectConfigured,
      serviceAccountEnvFileUsable: audit.capabilities.serviceAccountEnvFileUsable,
      serviceAccountEnvFilePath: audit.serviceAccountEnvFile?.path || '',
      desktopIntegrationLikely: audit.capabilities.desktopIntegrationLikely
    },
    commands,
    rules: [
      'Do not place Service Account or Connect tokens in target packs, runs outputs, prompts, shell history, or shared docs.',
      'Use 1Password only for API keys and non-browser secrets; keep website login sessions in dedicated Chrome target profiles.',
      'Prefer op:// references, op run, Service Account, or Connect over copying secret values into agent-visible text.'
    ],
    next: readyForMode
      ? `Mode ${mode} is configured; use the verify command and then run agent commands through op run or op read references.`
      : (mode === 'service-account' && audit.capabilities.serviceAccountEnvFileUsable
          ? `Mode ${mode} has a local env file; run source-service-account-env-file or source it in the operator shell, then re-run secret-audit.`
          : `Mode ${mode} is not configured; complete the operator-only export/setup step outside shared logs, then re-run secret-audit.`)
  };
}

function agentCommandArgs(commandId, options = {}) {
  const targetDir = options.targetDir || '<target-pack-dir>';
  if (commandId === 'secret-audit') {
    return ['node', 'src/cli.mjs', 'secret-audit', '--format', 'compact'];
  }
  if (commandId === 'target-login-capture') {
    return [
      'node',
      'src/cli.mjs',
      'target-login-capture',
      targetDir,
      '--real-external',
      '--handoff-out',
      'operator-handoff.json',
      '--wait-auth-status-out',
      'wait-auth-status.json',
      '--format',
      'markdown'
    ];
  }
  if (commandId === 'target-proof-capture') {
    return [
      'node',
      'src/cli.mjs',
      'target-proof-capture',
      targetDir,
      '--real-external',
      '--run',
      '--wait-auth',
      '--wait-auth-status-out',
      'wait-auth-status.json',
      '--format',
      'compact'
    ];
  }
  if (commandId === 'control-status') {
    return ['node', 'src/cli.mjs', 'control-status', '--format', 'compact'];
  }
  throw new Error(`invalid secret run command: ${commandId}`);
}

export function buildSecretRunPlan(options = {}) {
  const audit = options.audit || buildSecretAudit(options);
  const mode = options.mode || (audit.capabilities.connectConfigured ? 'connect' : 'service-account');
  const setupPlan = options.setupPlan || buildSecretSetupPlan({ ...options, mode, audit });
  const commandId = options.command || 'control-status';
  const plainArgs = agentCommandArgs(commandId, options);
  const runCommandSafety = agentCommandSafety(plainArgs);
  const wrappedArgs = ['op', 'run', '--', ...plainArgs];
  const wrappedCommand = !setupPlan.readyForMode && setupPlan.mode === 'service-account' && audit.capabilities.serviceAccountEnvFileUsable
    ? shellCommand(serviceAccountEnvFileSourceScript(audit, `exec ${wrappedArgs.map(shellQuote).join(' ')}`))
    : command(wrappedArgs);
  const canSourceServiceAccountEnvFile = setupPlan.mode === 'service-account' && audit.capabilities.serviceAccountEnvFileUsable;
  const requiredSetupCommandIds = setupPlan.readyForMode
    ? []
    : (canSourceServiceAccountEnvFile
        ? ['source-service-account-env-file']
        : setupPlan.commands.filter((item) => item.operatorOnly).map((item) => item.id));

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    mode: setupPlan.mode,
    readyForMode: setupPlan.readyForMode,
    headlessMode: setupPlan.headlessMode,
    commandId,
    targetDir: options.targetDir || '',
    runCommandSafety,
    requiredSetupCommandIds,
    commands: [
      {
        id: 'wrapped-agent-command',
        label: 'Run the selected SBA command through 1Password CLI secret injection',
        operatorOnly: false,
        command: wrappedCommand
      },
      {
        id: 'plain-agent-command',
        label: 'Equivalent command without 1Password wrapping for comparison or local profile-only browser sessions',
        operatorOnly: false,
        command: command(plainArgs)
      }
    ],
    rules: [
      'The plan never reads or prints secret values.',
      'op run is for API keys and non-browser secret environment; website login state remains in the target Chrome profile.',
      'If the mode is not ready, complete the operator-only setup command outside shared logs before running the wrapped command.'
    ],
    next: setupPlan.readyForMode
      ? 'Run wrapped-agent-command when the command needs non-browser secrets; use dedicated target profiles for website authentication.'
      : (canSourceServiceAccountEnvFile
          ? 'Run wrapped-agent-command to source the local env file inline, then execute through op run without printing secret values.'
          : `Configure ${setupPlan.mode} first: ${requiredSetupCommandIds.join(', ') || 'operator setup required'}.`)
  };
}

export function buildSecretRunSelect(options = {}) {
  const audit = options.audit || buildSecretAudit(options);
  const commandId = options.command || 'control-status';
  const targetDir = options.targetDir || '';
  const opAvailable = Boolean(audit.op.exists);
  const candidates = [
    {
      id: 'connect',
      mode: 'connect',
      headless: true,
      ready: Boolean(opAvailable && audit.capabilities.connectConfigured),
      configured: Boolean(audit.capabilities.connectConfigured),
      setup: ['export-connect-host', 'export-connect-token']
    },
    {
      id: 'service-account',
      mode: 'service-account',
      headless: true,
      ready: Boolean(opAvailable && audit.capabilities.serviceAccountConfigured),
      configured: Boolean(audit.capabilities.serviceAccountConfigured),
      setup: ['export-service-account-token']
    },
    {
      id: 'service-account-env-file',
      mode: 'service-account',
      headless: true,
      ready: Boolean(opAvailable && audit.capabilities.serviceAccountEnvFileUsable),
      configured: Boolean(audit.capabilities.serviceAccountEnvFileUsable),
      setup: ['source-service-account-env-file']
    },
    {
      id: 'local-desktop',
      mode: 'local-desktop',
      headless: false,
      ready: Boolean(opAvailable && audit.capabilities.desktopIntegrationLikely),
      configured: Boolean(audit.capabilities.desktopIntegrationLikely),
      setup: ['unlock-1password-desktop', 'verify-account']
    }
  ];
  const selected = candidates.find((item) => item.ready)
    || candidates.find((item) => item.configured)
    || candidates.find((item) => item.id === 'service-account-env-file')
    || candidates.find((item) => item.id === 'service-account');
  const selectedRunPlan = buildSecretRunPlan({
    ...options,
    mode: selected.mode,
    command: commandId,
    targetDir,
    audit
  });
  const setupPlan = buildSecretSetupPlan({
    ...options,
    mode: selected.mode,
    audit
  });
  const requiredSetupCommandIds = selected.ready
    ? []
    : (!opAvailable ? ['install-1password-cli'] : selectedRunPlan.requiredSetupCommandIds.length ? selectedRunPlan.requiredSetupCommandIds : selected.setup);
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    readsSecretValues: false,
    commandId,
    targetDir,
    opAvailable,
    selectedMode: selected.mode,
    selectedCandidate: selected.id,
    headless: selected.headless,
    readyToRunNow: selected.ready,
    setupRequired: requiredSetupCommandIds,
    recommendedHeadlessMode: audit.recommendedHeadlessMode,
    headlessReady: audit.headlessReady,
    headlessConfigAvailable: audit.headlessConfigAvailable,
    serviceAccountEnvFileUsable: Boolean(audit.capabilities.serviceAccountEnvFileUsable),
    desktopIntegrationLikely: Boolean(audit.capabilities.desktopIntegrationLikely),
    candidates,
    runPlan: selectedRunPlan,
    setupPlan,
    runCommandSafety: selectedRunPlan.runCommandSafety,
    command: selectedRunPlan.commands.find((item) => item.id === 'wrapped-agent-command')?.command || null,
    setupCommand: setupPlan.commands.find((item) => requiredSetupCommandIds.includes(item.id))?.command || null,
    next: selected.ready
      ? 'Run the selected wrapped command when the SBA command needs non-browser secrets; browser login remains in dedicated target profiles.'
      : (!opAvailable
          ? 'Install or expose the 1Password CLI on PATH, then re-run secret-run-select.'
          : `Complete setup for ${selected.id}: ${requiredSetupCommandIds.join(', ') || 'operator setup required'}.`)
  };
}

export function formatSecretAuditCompact(report) {
  const lines = [
    `headless_ready: ${yesNo(report.headlessReady)}`,
    `recommended_headless_mode: ${report.recommendedHeadlessMode}`,
    `op_cli: ${yesNo(report.op.exists)}`,
    `op_version: ${String(report.op.version || '').replace(/\s+/g, ' ').trim() || 'unknown'}`,
    `service_account: ${yesNo(report.capabilities.serviceAccountConfigured)}`,
    `service_account_env_file: ${yesNo(report.capabilities.serviceAccountEnvFilePresent)}`,
    `service_account_env_file_strict: ${yesNo(report.capabilities.serviceAccountEnvFileStrict)}`,
    `headless_config_available: ${yesNo(report.capabilities.headlessConfigAvailable)}`,
    `connect: ${yesNo(report.capabilities.connectConfigured)}`,
    `desktop_integration_likely: ${yesNo(report.capabilities.desktopIntegrationLikely)}`,
    `onepassword_mcp: ${report.processes.onePasswordMcp}`,
    `secret_values_read: ${yesNo(report.secretValuesRead)}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatSecretSetupPlanCompact(plan) {
  const lines = [
    `mode: ${plan.mode}`,
    `ready: ${yesNo(plan.readyForMode)}`,
    `headless: ${yesNo(plan.headlessMode)}`,
    `op_cli: ${yesNo(plan.audit.opExists)}`,
    `service_account: ${yesNo(plan.audit.serviceAccountConfigured)}`,
    `service_account_env_file: ${yesNo(plan.audit.serviceAccountEnvFileUsable)}`,
    `connect: ${yesNo(plan.audit.connectConfigured)}`,
    `desktop_integration_likely: ${yesNo(plan.audit.desktopIntegrationLikely)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `commands: ${plan.commands.length}`,
    `next: ${plan.next}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatSecretAuditMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Secret Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Safe mode: ${report.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${report.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${report.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Headless ready: ${report.headlessReady ? 'yes' : 'no'}`,
    `- Recommended headless mode: ${report.recommendedHeadlessMode}`,
    `- Local agent mode: ${report.localAgentMode}`,
    `- 1Password CLI: ${report.op.exists ? `${report.op.version} at ${report.op.path}` : 'missing'}`,
    `- Service account token env: ${report.env.OP_SERVICE_ACCOUNT_TOKEN ? 'set' : 'unset'}`,
    `- Service account env file: ${report.serviceAccountEnvFile.exists ? `${report.serviceAccountEnvFile.path} mode ${report.serviceAccountEnvFile.mode}` : 'missing'}`,
    `- Headless config available: ${report.headlessConfigAvailable ? 'yes' : 'no'}`,
    `- Connect env: ${report.env.OP_CONNECT_HOST && report.env.OP_CONNECT_TOKEN ? 'set' : 'unset'}`,
    `- 1Password app processes: ${report.processes.onePasswordApp}`,
    `- op daemon processes: ${report.processes.opDaemon}`,
    `- onepassword-mcp processes: ${report.processes.onePasswordMcp}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Detail |',
    '| --- | --- | --- |'
  ];
  for (const check of report.checks) {
    lines.push(`| ${check.name} | ${check.status} | ${String(check.detail || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('', '## Next', '');
  for (const item of report.next) lines.push(`- ${item}`);
  lines.push('', '## Docs', '');
  for (const url of report.docs) lines.push(`- ${url}`);
  lines.push('');
  return lines.join('\n');
}

export function formatSecretRunPlanCompact(plan) {
  const lines = [
    `mode: ${plan.mode}`,
    `ready: ${yesNo(plan.readyForMode)}`,
    `headless: ${yesNo(plan.headlessMode)}`,
    `command_id: ${plan.commandId}`,
    `target_dir: ${plan.targetDir || 'none'}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `setup_required: ${plan.requiredSetupCommandIds.length ? plan.requiredSetupCommandIds.join(',') : 'none'}`,
    `run_opens_browser: ${yesNo(plan.runCommandSafety?.opensBrowser)}`,
    `run_starts_capture: ${yesNo(plan.runCommandSafety?.startsCapture)}`,
    `run_starts_background: ${yesNo(plan.runCommandSafety?.startsBackground)}`,
    `run_requires_operator_approval: ${yesNo(plan.runCommandSafety?.requiresOperatorApproval)}`,
    `run_agent_may_run_unattended: ${yesNo(plan.runCommandSafety?.agentMayRunUnattended)}`,
    `run: ${plan.commands.find((item) => item.id === 'wrapped-agent-command').command.shell}`,
    `next: ${plan.next}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatSecretRunSelectCompact(selection) {
  const lines = [
    `safe_mode: ${yesNo(selection.safeMode)}`,
    `destructive_actions: ${yesNo(selection.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(selection.secretValuesRead)}`,
    `reads_secret_values: ${yesNo(selection.readsSecretValues)}`,
    `command_id: ${selection.commandId}`,
    `target_dir: ${selection.targetDir || 'none'}`,
    `op_cli_available: ${yesNo(selection.opAvailable)}`,
    `selected_mode: ${selection.selectedMode}`,
    `selected_candidate: ${selection.selectedCandidate}`,
    `headless: ${yesNo(selection.headless)}`,
    `ready_to_run_now: ${yesNo(selection.readyToRunNow)}`,
    `setup_required: ${selection.setupRequired.length ? selection.setupRequired.join(',') : 'none'}`,
    `recommended_headless_mode: ${selection.recommendedHeadlessMode}`,
    `headless_ready: ${yesNo(selection.headlessReady)}`,
    `headless_config_available: ${yesNo(selection.headlessConfigAvailable)}`,
    `service_account_env_file_usable: ${yesNo(selection.serviceAccountEnvFileUsable)}`,
    `desktop_integration_likely: ${yesNo(selection.desktopIntegrationLikely)}`,
    `connect_ready: ${yesNo(selection.candidates.find((item) => item.id === 'connect')?.ready)}`,
    `service_account_ready: ${yesNo(selection.candidates.find((item) => item.id === 'service-account')?.ready)}`,
    `service_account_env_file_ready: ${yesNo(selection.candidates.find((item) => item.id === 'service-account-env-file')?.ready)}`,
    `local_desktop_ready: ${yesNo(selection.candidates.find((item) => item.id === 'local-desktop')?.ready)}`,
    `run_opens_browser: ${yesNo(selection.runCommandSafety?.opensBrowser)}`,
    `run_starts_capture: ${yesNo(selection.runCommandSafety?.startsCapture)}`,
    `run_starts_background: ${yesNo(selection.runCommandSafety?.startsBackground)}`,
    `run_requires_operator_approval: ${yesNo(selection.runCommandSafety?.requiresOperatorApproval)}`,
    `run_agent_may_run_unattended: ${yesNo(selection.runCommandSafety?.agentMayRunUnattended)}`,
    `run_command: ${selection.command?.shell || 'none'}`,
    `setup_command: ${selection.setupCommand?.shell || 'none'}`,
    `next: ${selection.next}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatSecretSetupPlanMarkdown(plan) {
  const lines = [
    '# Secure Browser Agent Secret Setup Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Mode: ${plan.mode}`,
    `- Ready for mode: ${plan.readyForMode ? 'yes' : 'no'}`,
    `- Headless mode: ${plan.headlessMode ? 'yes' : 'no'}`,
    `- op CLI: ${plan.audit.opExists ? `${plan.audit.opVersion || 'present'}` : 'missing'}`,
    `- Service Account configured: ${plan.audit.serviceAccountConfigured ? 'yes' : 'no'}`,
    `- Service Account env file usable: ${plan.audit.serviceAccountEnvFileUsable ? 'yes' : 'no'}`,
    `- Service Account env file path: ${plan.audit.serviceAccountEnvFilePath || 'none'}`,
    `- Connect configured: ${plan.audit.connectConfigured ? 'yes' : 'no'}`,
    `- Desktop integration likely: ${plan.audit.desktopIntegrationLikely ? 'yes' : 'no'}`,
    '',
    '## Commands',
    ''
  ];
  for (const item of plan.commands) {
    lines.push(`### ${item.id}`);
    lines.push('');
    lines.push(`- ${item.label}`);
    lines.push(`- Operator only: ${item.operatorOnly ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('```bash');
    lines.push(item.command.shell);
    lines.push('```');
    lines.push('');
  }
  lines.push('## Rules', '');
  for (const rule of plan.rules) lines.push(`- ${rule}`);
  lines.push('', '## Next', '', `- ${plan.next}`, '');
  return lines.join('\n');
}

export function formatSecretRunPlanMarkdown(plan) {
  const lines = [
    '# Secure Browser Agent Secret Run Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Mode: ${plan.mode}`,
    `- Ready for mode: ${plan.readyForMode ? 'yes' : 'no'}`,
    `- Headless mode: ${plan.headlessMode ? 'yes' : 'no'}`,
    `- Command: ${plan.commandId}`,
    `- Target dir: ${plan.targetDir || 'none'}`,
    `- Setup required: ${plan.requiredSetupCommandIds.length ? plan.requiredSetupCommandIds.join(', ') : 'none'}`,
    '',
    '## Commands',
    ''
  ];
  for (const item of plan.commands) {
    lines.push(`### ${item.id}`);
    lines.push('');
    lines.push(`- ${item.label}`);
    lines.push(`- Operator only: ${item.operatorOnly ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('```bash');
    lines.push(item.command.shell);
    lines.push('```');
    lines.push('');
  }
  lines.push('## Rules', '');
  for (const rule of plan.rules) lines.push(`- ${rule}`);
  lines.push('', '## Next', '', `- ${plan.next}`, '');
  return lines.join('\n');
}
