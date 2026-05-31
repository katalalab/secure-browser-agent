import fs from 'node:fs';
import path from 'node:path';
import { buildRuntimeAudit } from './runtime-audit.mjs';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';

const REMOTE_DEBUGGING_SOURCE = {
  title: 'Changes to remote debugging switches to improve security',
  url: 'https://developer.chrome.com/blog/remote-debugging-port',
  retrievedAt: '2026-05-28',
  summary: 'Chrome 136+ requires remote debugging switches to use a non-default user data directory; Chrome continues to recommend custom user data dirs to isolate debugging from real profiles.'
};

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

function githubHandoffCommand(rootDir) {
  const targetDir = path.resolve(rootDir, 'runs/target-packs/github');
  const handoffExists = [
    path.join(targetDir, 'operator-handoff.json'),
    path.join(targetDir, 'outputs/operator-handoff.json')
  ].some((candidate) => fs.existsSync(candidate));
  if (!handoffExists) return null;
  return command([
    'node',
    'src/cli.mjs',
    'target-handoff-resume',
    targetDir,
    '--handoff',
    'operator-handoff.json',
    '--run',
    '--open-login',
    '--wait-auth',
    '--wait-auth-status-out',
    'handoff-resume-wait-auth-status.json',
    '--out',
    'handoff-resume-latest.json',
    '--format',
    'compact'
  ]);
}

function chromeResumePlanCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--format', 'compact']);
}

function chromeResumeApprovalCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--run', '--operator-ok', 'OK', '--format', 'compact']);
}

function flagToBoolean(value) {
  if (value === true || value === 'yes' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  return null;
}

function regularChromeArgs(options = {}) {
  const mcpObservationIn = options.mcpObservationIn ?? options['mcp-observation-in'] ?? '';
  const allowNewBackgroundTab = flagToBoolean(options.allowNewBackgroundTab ?? options['allow-new-background-tab']) === true;
  const newBackgroundUrlEnv = String(options.newBackgroundUrlEnv ?? options['new-background-url-env'] ?? '').trim();
  return [
    ...(mcpObservationIn ? ['--mcp-observation-in', mcpObservationIn] : []),
    ...(allowNewBackgroundTab ? ['--allow-new-background-tab', 'yes'] : []),
    ...(newBackgroundUrlEnv ? ['--new-background-url-env', newBackgroundUrlEnv] : [])
  ];
}

function regularChromeUseCommand(options = {}) {
  return command(['node', 'src/cli.mjs', 'regular-chrome-use', '--intent', 'inspect', ...regularChromeArgs(options), '--format', 'compact']);
}

function regularChromeStatusCommand(options = {}) {
  return command(['node', 'src/cli.mjs', 'regular-chrome-status', ...regularChromeArgs(options), '--format', 'compact']);
}

function chromeMcpObservationStatusCommand(options = {}) {
  const mcpObservationIn = options.mcpObservationIn ?? options['mcp-observation-in'] ?? '';
  return command(['node', 'src/cli.mjs', 'chrome-mcp-observation-status', ...(mcpObservationIn ? ['--in', mcpObservationIn] : []), '--format', 'compact']);
}

export function buildChromeControlPlan(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const runtime = options.runtimeAudit || buildRuntimeAudit(options);
  const chromeExtension = options.chromeExtensionStatus || buildChromeExtensionStatus({ env: options.env || process.env });
  const chrome = runtime.chromeApp || {};
  const requestedLane = options.lane || 'auto';
  const mcpObservationIn = options.mcpObservationIn ?? options['mcp-observation-in'] ?? '';
  const allowNewBackgroundTab = flagToBoolean(options.allowNewBackgroundTab ?? options['allow-new-background-tab']) === true;
  const newBackgroundUrlEnv = String(options.newBackgroundUrlEnv ?? options['new-background-url-env'] ?? '').trim();
  const regularPresent = (chrome.regularProfiles || 0) > 0;
  const regularDebuggable = (chrome.regularProfileRemoteDebugging || 0) > 0;
  const regularExtensionPrepared = Boolean(chromeExtension.decision?.everydayChromeViaCodexExtensionPrepared);
  const regularExtensionBackendAvailable = Boolean(chromeExtension.decision?.everydayChromeViaCodexExtensionBackendAvailable);
  const regularExtensionReady = Boolean(chromeExtension.decision?.everydayChromeViaCodexExtensionReady);
  const targetDebuggable = (chrome.targetProfileRemoteDebugging || 0) > 0;
  const codexDebuggable = Boolean(runtime.chromeDevtools?.endpoint?.ok);
  const recommendedLane = targetDebuggable
    ? 'target-pack'
    : codexDebuggable
    ? 'codex-browser-agent'
    : regularExtensionReady
    ? 'regular-chrome-extension'
    : regularDebuggable
    ? 'regular-chrome'
    : 'dedicated-profile';
  const regularStatus = !regularPresent
    ? 'not-running'
    : regularDebuggable
    ? 'debuggable'
    : regularExtensionPrepared
    ? 'extension-prepared-not-proved'
    : 'open-not-debuggable';
  const regularAllowedForAuth = requestedLane === 'regular-chrome' && (regularDebuggable || regularExtensionReady);
  const regularChromeNeedsBackendRetry = Boolean(regularExtensionPrepared && !regularExtensionReady);
  const handoff = githubHandoffCommand(rootDir);
  const actions = [
    {
      id: 'control-status',
      label: 'Refresh the low-token browser control status',
      command: command(['node', 'src/cli.mjs', 'control-status', '--format', 'compact'])
    },
    regularChromeNeedsBackendRetry
      ? {
          id: 'chrome-extension-resume-plan',
          label: 'Plan the permission-gated everyday Chrome extension backend retry without opening Chrome',
          opensBrowser: false,
          permissionRequired: false,
          command: chromeResumePlanCommand()
        }
      : null,
    regularChromeNeedsBackendRetry
      ? {
          id: 'chrome-extension-resume-approval',
          label: 'Retry everyday Chrome extension backend only after the operator says OK',
          opensBrowser: true,
          permissionRequired: true,
          runOnlyAfterUserSays: 'OK',
          command: chromeResumeApprovalCommand()
        }
      : null,
    handoff
      ? {
          id: 'target-handoff-resume',
          label: 'Continue the real external GitHub proof through the dedicated target profile',
          command: handoff
        }
      : null
  ].filter(Boolean);

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    requestedLane,
    recommendedLane,
    chrome: {
      appProcesses: chrome.total || 0,
      regularProfiles: chrome.regularProfiles || 0,
      regularStatus,
      regularDebuggable,
      regularExtensionPrepared,
      regularExtensionBackendAvailable,
      regularExtensionReady,
      regularAllowedForAuthenticatedAutomation: regularAllowedForAuth,
      targetPackProfiles: chrome.targetPackProfiles || 0,
      targetDebuggable,
      codexBrowserAgentProfiles: chrome.codexBrowserAgentProfiles || 0,
      codexDebuggable
    },
    decision: {
      useEverydayChrome: regularAllowedForAuth,
      useDedicatedProfile: !regularAllowedForAuth,
      reason: regularAllowedForAuth
        ? 'The operator-requested regular Chrome lane has a proved control backend, but dedicated target profiles remain the default for stored authenticated scraping.'
        : regularExtensionPrepared
        ? 'Everyday Chrome has the Codex extension prepared, but the extension backend is not proved available in this session. Use a dedicated target profile for authenticated automation.'
        : 'Use a dedicated target profile for authenticated automation. Do not try to force remote debugging onto the default everyday Chrome profile.'
    },
    regularChrome: {
      userPermissionRequired: regularChromeNeedsBackendRetry,
      approvalCommandOpensBrowser: regularChromeNeedsBackendRetry,
      commandRunOnlyAfterUserSays: regularChromeNeedsBackendRetry ? 'OK' : '',
      mcpObservationIn,
      newBackgroundTabsAllowed: allowNewBackgroundTab,
      newBackgroundUrlEnv,
      newBackgroundUrlValueRead: false,
      useCommand: regularChromeUseCommand({ mcpObservationIn, allowNewBackgroundTab, newBackgroundUrlEnv }),
      statusCommand: regularChromeStatusCommand({ mcpObservationIn, allowNewBackgroundTab, newBackgroundUrlEnv }),
      observationStatusCommand: chromeMcpObservationStatusCommand({ mcpObservationIn }),
      resumeCommand: regularChromeNeedsBackendRetry ? chromeResumePlanCommand() : null,
      approvalCommand: regularChromeNeedsBackendRetry ? chromeResumeApprovalCommand() : null
    },
    officialSource: REMOTE_DEBUGGING_SOURCE,
    operatorNotes: [
      'This plan does not read cookies, history, password stores, or browser profile databases.',
      'Regular Chrome may be open while still not being controllable through DevTools.',
      'Codex Chrome Extension installed/enabled is only a prepared state; backend availability must be proved before claiming live everyday Chrome tabs.',
      'For Chrome 136+, remote debugging should use a non-default user data directory; this is why target-pack profiles are the default lane.',
      'Restarting or relaunching everyday Chrome is an operator-owned action and is intentionally not automated here.'
    ],
    actions
  };
}

export function formatChromeControlPlanCompact(plan) {
  const lines = [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `requested_lane: ${plan.requestedLane}`,
    `recommended_lane: ${plan.recommendedLane}`,
    `chrome_app_processes: ${plan.chrome.appProcesses}`,
    `regular_chrome_profiles: ${plan.chrome.regularProfiles}`,
    `regular_chrome_status: ${plan.chrome.regularStatus}`,
    `regular_chrome_debuggable: ${yesNo(plan.chrome.regularDebuggable)}`,
    `regular_chrome_extension_prepared: ${yesNo(plan.chrome.regularExtensionPrepared)}`,
    `regular_chrome_extension_backend_available: ${yesNo(plan.chrome.regularExtensionBackendAvailable)}`,
    `regular_chrome_extension_ready: ${yesNo(plan.chrome.regularExtensionReady)}`,
    `regular_chrome_user_permission_required: ${yesNo(plan.regularChrome?.userPermissionRequired)}`,
    `regular_chrome_approval_command_opens_browser: ${yesNo(plan.regularChrome?.approvalCommandOpensBrowser)}`,
    `regular_chrome_command_run_only_after_user_says: ${plan.regularChrome?.commandRunOnlyAfterUserSays || 'none'}`,
    `target_chrome_profiles: ${plan.chrome.targetPackProfiles}`,
    `target_chrome_debuggable: ${yesNo(plan.chrome.targetDebuggable)}`,
    `codex_chrome_profiles: ${plan.chrome.codexBrowserAgentProfiles}`,
    `codex_chrome_debuggable: ${yesNo(plan.chrome.codexDebuggable)}`,
    `use_everyday_chrome: ${yesNo(plan.decision.useEverydayChrome)}`,
    `use_dedicated_profile: ${yesNo(plan.decision.useDedicatedProfile)}`,
    `source: ${plan.officialSource.url}`,
    `actions: ${plan.actions.length}`
  ];
  const next = plan.actions.find((item) => item.id === 'target-handoff-resume') || plan.actions[0];
  if (next?.command?.shell) lines.push(`command: ${next.command.shell}`);
  if (plan.regularChrome?.mcpObservationIn) lines.push(`regular_chrome_mcp_observation_in: ${plan.regularChrome.mcpObservationIn}`);
  lines.push(`regular_chrome_new_background_tabs_allowed: ${yesNo(plan.regularChrome?.newBackgroundTabsAllowed)}`);
  lines.push(`regular_chrome_new_background_url_env: ${plan.regularChrome?.newBackgroundUrlEnv || 'none'}`);
  lines.push(`regular_chrome_new_background_url_value_read: ${yesNo(plan.regularChrome?.newBackgroundUrlValueRead)}`);
  if (plan.regularChrome?.useCommand?.shell) lines.push(`regular_chrome_use_command: ${plan.regularChrome.useCommand.shell}`);
  if (plan.regularChrome?.statusCommand?.shell) lines.push(`regular_chrome_status_command: ${plan.regularChrome.statusCommand.shell}`);
  if (plan.regularChrome?.observationStatusCommand?.shell) lines.push(`regular_chrome_mcp_observation_status_command: ${plan.regularChrome.observationStatusCommand.shell}`);
  if (plan.regularChrome?.resumeCommand?.shell) lines.push(`regular_chrome_resume_command: ${plan.regularChrome.resumeCommand.shell}`);
  if (plan.regularChrome?.approvalCommand?.shell) lines.push(`regular_chrome_approval_command: ${plan.regularChrome.approvalCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeControlPlanMarkdown(plan) {
  const lines = [
    '# Chrome Control Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Requested lane: ${plan.requestedLane}`,
    `- Recommended lane: ${plan.recommendedLane}`,
    `- Use everyday Chrome: ${plan.decision.useEverydayChrome ? 'yes' : 'no'}`,
    `- Use dedicated profile: ${plan.decision.useDedicatedProfile ? 'yes' : 'no'}`,
    `- Regular Chrome user permission required: ${plan.regularChrome?.userPermissionRequired ? 'yes' : 'no'}`,
    `- Regular Chrome approval command opens browser: ${plan.regularChrome?.approvalCommandOpensBrowser ? 'yes' : 'no'}`,
    `- Reason: ${plan.decision.reason}`,
    '',
    '## Chrome',
    '',
    `- App parent processes: ${plan.chrome.appProcesses}`,
    `- Regular Chrome profiles: ${plan.chrome.regularProfiles}`,
    `- Regular Chrome status: ${plan.chrome.regularStatus}`,
    `- Regular Chrome remote-debuggable: ${plan.chrome.regularDebuggable ? 'yes' : 'no'}`,
    `- Regular Chrome extension prepared: ${plan.chrome.regularExtensionPrepared ? 'yes' : 'no'}`,
    `- Regular Chrome extension backend available: ${plan.chrome.regularExtensionBackendAvailable ? 'yes' : 'no'}`,
    `- Regular Chrome extension ready: ${plan.chrome.regularExtensionReady ? 'yes' : 'no'}`,
    `- Target-pack profiles: ${plan.chrome.targetPackProfiles}`,
    `- Target-pack remote-debuggable: ${plan.chrome.targetDebuggable ? 'yes' : 'no'}`,
    `- Codex Browser Agent profiles: ${plan.chrome.codexBrowserAgentProfiles}`,
    `- Codex Browser Agent remote-debuggable: ${plan.chrome.codexDebuggable ? 'yes' : 'no'}`,
    '',
    '## Operator Notes',
    ''
  ];
  for (const note of plan.operatorNotes) lines.push(`- ${note}`);
  lines.push('', '## Official Source', '');
  lines.push(`- ${plan.officialSource.title}: ${plan.officialSource.url}`);
  lines.push(`- Retrieved: ${plan.officialSource.retrievedAt}`);
  lines.push(`- Summary: ${plan.officialSource.summary}`);
  if (plan.actions.length > 0) {
    lines.push('', '## Commands', '');
    for (const action of plan.actions) {
      lines.push(`- ${action.id}: ${action.label}`);
      lines.push('```bash', action.command.shell, '```');
    }
  }
  lines.push('');
  return lines.join('\n');
}
