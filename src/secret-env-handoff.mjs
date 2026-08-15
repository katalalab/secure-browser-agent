import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSecretAudit } from './secret-audit.mjs';
import { toPosixPath } from './output.mjs';

const DOCS = [
  {
    id: 'onepassword-environments',
    url: 'https://www.1password.dev/environments/',
    retrievedAt: '2026-05-29',
    note: '1Password Environments store environment variables in a vault and inject them into developer workflows.'
  },
  {
    id: 'onepassword-local-env-file',
    url: 'https://www.1password.dev/environments/local-env-file/',
    retrievedAt: '2026-05-29',
    note: 'Local .env files can be mounted from 1Password Environments on macOS and Linux.'
  }
];

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
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

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/secret-env-handoff.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid secret env handoff output path: ${outPath}`);
  return outputPath;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonStatus(filePath) {
  try {
    const stat = fs.statSync(filePath);
    try {
      const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        exists: true,
        parseOk: true,
        value,
        mtimeMs: stat.mtimeMs,
        ageSeconds: Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000)),
        error: ''
      };
    } catch (error) {
      return {
        exists: true,
        parseOk: false,
        value: null,
        mtimeMs: stat.mtimeMs,
        ageSeconds: Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000)),
        error: error.message
      };
    }
  } catch (error) {
    return {
      exists: false,
      parseOk: false,
      value: null,
      mtimeMs: 0,
      ageSeconds: null,
      error: error.code === 'ENOENT' ? 'missing' : error.message
    };
  }
}

function defaultMountPath(rootDir, environmentName) {
  const slug = String(environmentName || 'secure-browser-agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'secure-browser-agent';
  return path.join(rootDir, 'runs', 'operator', `${slug}.env`);
}

export function buildSecretEnvHandoff(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const audit = options.audit || buildSecretAudit(options);
  const environmentName = options.environmentName || options['environment-name'] || 'Secure Browser Agent';
  const mountPath = path.resolve(options.mountPath || options['mount-path'] || defaultMountPath(rootDir, environmentName));
  const mode = options.mode || 'environment-local-env';
  const validModes = new Set(['environment-local-env', 'service-account', 'connect', 'local-desktop']);
  if (!validModes.has(mode)) throw new Error(`invalid secret env handoff mode: ${mode}`);

  const isEnvironmentMode = mode === 'environment-local-env';
  const localEnvFileSupported = audit.capabilities.localEnvMountSupported;
  const requiresOnePasswordApproval = isEnvironmentMode || mode === 'local-desktop';
  const ready = mode === 'service-account'
    ? audit.capabilities.serviceAccountConfigured
    : mode === 'connect'
    ? audit.capabilities.connectConfigured
    : isEnvironmentMode
    ? localEnvFileSupported
    : audit.capabilities.desktopIntegrationLikely;
  const commands = [
    {
      id: 'audit',
      label: 'Refresh read-only 1Password/headless status',
      mutatesOnePassword: false,
      requiresUserApproval: false,
      command: command(['node', 'src/cli.mjs', 'secret-audit', '--format', 'compact'])
    },
    {
      id: 'setup-plan',
      label: `Print the safe setup plan for ${mode}`,
      mutatesOnePassword: false,
      requiresUserApproval: false,
      command: command(['node', 'src/cli.mjs', 'secret-setup-plan', '--mode', mode === 'environment-local-env' ? 'local-desktop' : mode, '--format', 'compact'])
    }
  ];

  if (isEnvironmentMode) {
    commands.push(
      {
        id: 'open-1password-labs',
        label: 'Open 1Password Labs so the operator can enable the local MCP server',
        mutatesOnePassword: false,
        requiresUserApproval: true,
        runOnlyAfterUserSays: 'OK',
        command: command(['open', 'onepassword://settings/labs'])
      },
      {
        id: 'mcp-authenticate',
        label: 'Authenticate the 1Password MCP session and get accountId after user approval',
        mutatesOnePassword: false,
        requiresUserApproval: true,
        toolCall: {
          server: 'onepassword',
          tool: 'authenticate',
          arguments: {}
        }
      },
      {
        id: 'mcp-list-environments',
        label: 'List Environments after authentication; this returns names/ids, not secret values',
        mutatesOnePassword: false,
        requiresUserApproval: true,
        toolCall: {
          server: 'onepassword',
          tool: 'list_environments',
          arguments: { accountId: '<account-id-from-authenticate>' }
        }
      },
      {
        id: 'mcp-create-environment',
        label: 'Optional: create a dedicated Environment for non-browser agent secrets',
        mutatesOnePassword: true,
        requiresUserApproval: true,
        toolCall: {
          server: 'onepassword',
          tool: 'create_environment',
          arguments: {
            accountId: '<account-id-from-authenticate>',
            environmentName
          }
        }
      },
      {
        id: 'mcp-list-local-env-files',
        label: 'List local .env mounts for the selected Environment',
        mutatesOnePassword: false,
        requiresUserApproval: true,
        toolCall: {
          server: 'onepassword',
          tool: 'list_local_env_files',
          arguments: {
            accountId: '<account-id-from-authenticate>',
            environmentId: '<environment-id>'
          }
        }
      }
    );
  }

  const handoff = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    mutatesOnePasswordNow: false,
    mode,
    ready,
    requiresOnePasswordApproval,
    environmentName,
    mountPath,
    platform: os.platform(),
    localEnvFileSupported,
    recommendedHeadlessMode: audit.recommendedHeadlessMode,
    headlessReady: audit.headlessReady,
    headlessConfigAvailable: audit.headlessConfigAvailable,
    onePasswordMcpProcesses: audit.processes.onePasswordMcp,
    desktopIntegrationLikely: audit.capabilities.desktopIntegrationLikely,
    nextAction: ready
      ? 'run-audit-or-op-wrapped-agent-command'
      : isEnvironmentMode
      ? 'authenticate-onepassword-mcp-and-select-environment'
      : 'complete-operator-secret-setup',
    rules: [
      'Do not store website passwords in target packs, runs outputs, docs, prompts, or shell history.',
      'Use 1Password Environments, Service Account, Connect, or op run for API keys and non-browser secrets.',
      'Keep website login sessions in dedicated Chrome target profiles; do not paste passwords through the agent.',
      '1Password MCP Environment access requires user approval and should be treated as an operator-owned boundary.'
    ],
    docs: DOCS,
    commands,
    outputPath: ''
  };

  if (options.write || options.out || options.output) {
    const outputPath = safeRunPath(rootDir, options.out || options.output);
    handoff.outputPath = outputPath;
    writeJson(outputPath, handoff);
  }

  return handoff;
}

export function buildSecretEnvHandoffStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inPath = safeRunPath(rootDir, options.in || options.input || 'operator/secret-env-handoff.json');
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const saved = readJsonStatus(inPath);
  const stale = !saved.exists || !saved.parseOk || (Number.isFinite(staleAfterSeconds) && staleAfterSeconds >= 0 && saved.ageSeconds !== null && saved.ageSeconds > staleAfterSeconds);
  const handoff = saved.parseOk ? saved.value : {};
  const refreshCommand = command([
    'node',
    'src/cli.mjs',
    'secret-env-handoff-watch',
    '--run',
    '--in',
    toPosixPath(path.relative(path.resolve(rootDir, 'runs'), inPath)),
    '--out',
    toPosixPath(path.relative(path.resolve(rootDir, 'runs'), inPath)),
    '--format',
    'compact'
  ]);
  return {
    schemaVersion: 1,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    mutatesOnePasswordNow: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    inputPath: inPath,
    exists: saved.exists,
    parseOk: saved.parseOk,
    stale,
    ageSeconds: saved.ageSeconds,
    staleAfterSeconds,
    error: saved.error,
    mode: handoff.mode || '',
    ready: Boolean(handoff.ready),
    requiresOnePasswordApproval: Boolean(handoff.requiresOnePasswordApproval),
    headlessReady: Boolean(handoff.headlessReady),
    headlessConfigAvailable: Boolean(handoff.headlessConfigAvailable),
    recommendedHeadlessMode: handoff.recommendedHeadlessMode || '',
    nextAction: handoff.nextAction || (saved.exists ? 'refresh-secret-env-handoff' : 'create-secret-env-handoff'),
    commandsCount: Array.isArray(handoff.commands) ? handoff.commands.length : 0,
    agentSafeNextCommandId: stale ? 'secret-env-handoff-refresh' : 'none',
    agentSafeNextMayRunUnattended: stale,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    refreshCommand
  };
}

export function buildSecretEnvHandoffWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inRelative = options.in || options.input || 'operator/secret-env-handoff.json';
  const outRelative = options.out || options.output || inRelative;
  const status = buildSecretEnvHandoffStatus({
    rootDir,
    in: inRelative,
    staleAfterSeconds: options.staleAfterSeconds ?? options['stale-after-seconds']
  });
  const runRequested = Boolean(options.run);
  const shouldRefresh = status.stale;
  const allowedToRun = runRequested && shouldRefresh;
  let refreshed = null;
  if (allowedToRun) {
    refreshed = buildSecretEnvHandoff({
      rootDir,
      mode: options.mode,
      environmentName: options.environmentName || options['environment-name'],
      mountPath: options.mountPath || options['mount-path'],
      audit: options.audit,
      write: true,
      out: outRelative
    });
  }
  const after = refreshed
    ? buildSecretEnvHandoffStatus({
      rootDir,
      in: outRelative,
      staleAfterSeconds: options.staleAfterSeconds ?? options['stale-after-seconds']
    })
    : status;
  return {
    schemaVersion: 1,
    safeMode: true,
    statusOnly: false,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    mutatesOnePasswordNow: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    runRequested,
    executed: Boolean(refreshed),
    status: refreshed ? 'refreshed' : shouldRefresh ? 'refresh-required' : 'fresh',
    inputPath: status.inputPath,
    outputPath: safeRunPath(rootDir, outRelative),
    stale: shouldRefresh,
    allowedToRun,
    blockedReason: !runRequested && shouldRefresh
      ? 'run-not-requested'
      : runRequested && !shouldRefresh
      ? 'saved-secret-env-handoff-is-fresh'
      : 'none',
    beforeExists: status.exists,
    beforeParseOk: status.parseOk,
    beforeStale: status.stale,
    afterExists: after.exists,
    afterParseOk: after.parseOk,
    afterStale: after.stale,
    afterReady: after.ready,
    afterNextAction: after.nextAction,
    refreshCommand: status.refreshCommand
  };
}

export function formatSecretEnvHandoffCompact(handoff) {
  const lines = [
    `safe_mode: ${yesNo(handoff.safeMode)}`,
    `destructive_actions: ${yesNo(handoff.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(handoff.secretValuesRead)}`,
    `mutates_onepassword_now: ${yesNo(handoff.mutatesOnePasswordNow)}`,
    `mode: ${handoff.mode}`,
    `ready: ${yesNo(handoff.ready)}`,
    `requires_onepassword_approval: ${yesNo(handoff.requiresOnePasswordApproval)}`,
    `environment_name: ${clean(handoff.environmentName)}`,
    `mount_path: ${clean(handoff.mountPath)}`,
    `local_env_file_supported: ${yesNo(handoff.localEnvFileSupported)}`,
    `headless_ready: ${yesNo(handoff.headlessReady)}`,
    `headless_config_available: ${yesNo(handoff.headlessConfigAvailable)}`,
    `recommended_headless_mode: ${handoff.recommendedHeadlessMode}`,
    `onepassword_mcp_processes: ${handoff.onePasswordMcpProcesses}`,
    `next_action: ${handoff.nextAction}`,
    `commands: ${handoff.commands.length}`
  ];
  if (handoff.outputPath) lines.push(`output: ${handoff.outputPath}`);
  const auth = handoff.commands.find((item) => item.id === 'mcp-authenticate');
  if (auth?.toolCall) lines.push(`mcp_authenticate_tool: ${auth.toolCall.server}.${auth.toolCall.tool}`);
  const openLabs = handoff.commands.find((item) => item.id === 'open-1password-labs');
  if (openLabs?.command?.shell) lines.push(`open_labs_command: ${openLabs.command.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatSecretEnvHandoffStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `mutates_onepassword_now: ${yesNo(status.mutatesOnePasswordNow)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `mode: ${clean(status.mode)}`,
    `ready: ${yesNo(status.ready)}`,
    `requires_onepassword_approval: ${yesNo(status.requiresOnePasswordApproval)}`,
    `headless_ready: ${yesNo(status.headlessReady)}`,
    `headless_config_available: ${yesNo(status.headlessConfigAvailable)}`,
    `recommended_headless_mode: ${clean(status.recommendedHeadlessMode)}`,
    `next_action: ${clean(status.nextAction)}`,
    `commands: ${status.commandsCount}`,
    `agent_safe_next_command_id: ${status.agentSafeNextCommandId}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`
  ];
  if (status.refreshCommand?.shell) lines.push(`refresh_command: ${status.refreshCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatSecretEnvHandoffWatchCompact(watch) {
  const lines = [
    `safe_mode: ${yesNo(watch.safeMode)}`,
    `status_only: ${yesNo(watch.statusOnly)}`,
    `destructive_actions: ${yesNo(watch.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(watch.secretValuesRead)}`,
    `mutates_onepassword_now: ${yesNo(watch.mutatesOnePasswordNow)}`,
    `opens_browser_now: ${yesNo(watch.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(watch.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(watch.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(watch.pageContentReturned)}`,
    `run_requested: ${yesNo(watch.runRequested)}`,
    `executed: ${yesNo(watch.executed)}`,
    `status: ${watch.status}`,
    `input_path: ${clean(toPosixPath(path.relative(path.resolve(path.dirname(watch.inputPath), '..'), watch.inputPath)), watch.inputPath)}`,
    `output_path: ${clean(toPosixPath(path.relative(path.resolve(path.dirname(watch.outputPath), '..'), watch.outputPath)), watch.outputPath)}`,
    `stale: ${yesNo(watch.stale)}`,
    `allowed_to_run: ${yesNo(watch.allowedToRun)}`,
    `blocked_reason: ${watch.blockedReason}`,
    `before_exists: ${yesNo(watch.beforeExists)}`,
    `before_parse_ok: ${yesNo(watch.beforeParseOk)}`,
    `before_stale: ${yesNo(watch.beforeStale)}`,
    `after_exists: ${yesNo(watch.afterExists)}`,
    `after_parse_ok: ${yesNo(watch.afterParseOk)}`,
    `after_stale: ${yesNo(watch.afterStale)}`,
    `after_ready: ${yesNo(watch.afterReady)}`,
    `after_next_action: ${clean(watch.afterNextAction)}`
  ];
  if (watch.refreshCommand?.shell) lines.push(`refresh_command: ${watch.refreshCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatSecretEnvHandoffMarkdown(handoff) {
  const lines = [
    '# Secure Browser Agent Secret Environment Handoff',
    '',
    `Generated: ${handoff.generatedAt}`,
    `Safe mode: ${handoff.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${handoff.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${handoff.secretValuesRead ? 'yes' : 'no'}`,
    `Mutates 1Password now: ${handoff.mutatesOnePasswordNow ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Mode: ${handoff.mode}`,
    `- Ready: ${handoff.ready ? 'yes' : 'no'}`,
    `- Requires 1Password approval: ${handoff.requiresOnePasswordApproval ? 'yes' : 'no'}`,
    `- Environment name: ${handoff.environmentName}`,
    `- Mount path: ${handoff.mountPath}`,
    `- Local .env supported: ${handoff.localEnvFileSupported ? 'yes' : 'no'}`,
    `- Headless ready: ${handoff.headlessReady ? 'yes' : 'no'}`,
    `- Headless config available: ${handoff.headlessConfigAvailable ? 'yes' : 'no'}`,
    `- Recommended headless mode: ${handoff.recommendedHeadlessMode}`,
    `- Next action: ${handoff.nextAction}`,
    '',
    '## Commands And Tool Calls',
    ''
  ];
  for (const item of handoff.commands) {
    lines.push(`### ${item.id}`, '');
    lines.push(`- ${item.label}`);
    lines.push(`- Mutates 1Password: ${item.mutatesOnePassword ? 'yes' : 'no'}`);
    lines.push(`- Requires approval: ${item.requiresUserApproval ? 'yes' : 'no'}`);
    if (item.runOnlyAfterUserSays) lines.push(`- Run only after user says: ${item.runOnlyAfterUserSays}`);
    if (item.command?.shell) lines.push('', '```bash', item.command.shell, '```');
    if (item.toolCall) lines.push('', '```json', JSON.stringify(item.toolCall, null, 2), '```');
    lines.push('');
  }
  lines.push('## Rules', '');
  for (const rule of handoff.rules) lines.push(`- ${rule}`);
  lines.push('', '## Docs', '');
  for (const doc of handoff.docs) {
    lines.push(`- ${doc.url} (retrieved ${doc.retrievedAt}): ${doc.note}`);
  }
  lines.push('');
  return lines.join('\n');
}
