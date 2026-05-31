import { buildChromeMcpStatus } from './chrome-mcp-status.mjs';
import { buildRuntimeCleanupPlan } from './runtime-audit.mjs';
import fs from 'node:fs';
import path from 'node:path';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function compactCommand(args) {
  return command(args.filter((value) => value !== undefined && value !== null && value !== ''));
}

function backgroundTabArgs(options = {}) {
  const allowNewBackgroundTab = options.allowNewBackgroundTab ?? options['allow-new-background-tab'] ?? '';
  const newBackgroundUrlEnv = options.newBackgroundUrlEnv ?? options['new-background-url-env'] ?? '';
  return [
    ...(allowNewBackgroundTab ? ['--allow-new-background-tab', String(allowNewBackgroundTab)] : []),
    ...(newBackgroundUrlEnv ? ['--new-background-url-env', String(newBackgroundUrlEnv)] : [])
  ];
}

function backgroundTabState(options = {}) {
  const allowNewBackgroundTab = options.allowNewBackgroundTab ?? options['allow-new-background-tab'] ?? '';
  const newBackgroundUrlEnv = options.newBackgroundUrlEnv ?? options['new-background-url-env'] ?? '';
  return {
    newBackgroundTabsAllowed: String(allowNewBackgroundTab).toLowerCase() === 'yes',
    newBackgroundTabOption: allowNewBackgroundTab ? String(allowNewBackgroundTab) : '',
    newBackgroundUrlEnv: newBackgroundUrlEnv ? String(newBackgroundUrlEnv) : '',
    newBackgroundUrlValueRead: false
  };
}

function withBackgroundTabArgs(commandValue, options = {}) {
  const extra = backgroundTabArgs(options);
  if (!commandValue || !extra.length) return commandValue || null;
  const args = [...(commandValue.args || [])];
  for (let index = 0; index < extra.length; index += 2) {
    const option = extra[index];
    const value = extra[index + 1];
    const existing = args.indexOf(option);
    if (existing >= 0) {
      args[existing + 1] = value;
    } else {
      const formatIndex = args.indexOf('--format');
      if (formatIndex >= 0) args.splice(formatIndex, 0, option, value);
      else args.push(option, value);
    }
  }
  return command(args);
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir || process.cwd(), 'runs');
  const relative = String(outPath || 'operator/chrome-mcp-timeout-plan-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid Chrome MCP timeout plan output path: ${outPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir || process.cwd(), 'runs');
  const resolved = path.resolve(filePath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid Chrome MCP timeout plan output path: ${filePath}`);
  return path.relative(runsRoot, resolved);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonStatus(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, parseOk: false, value: null, error: '' };
  }
  try {
    return {
      exists: true,
      parseOk: true,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
      error: ''
    };
  } catch (error) {
    return {
      exists: true,
      parseOk: false,
      value: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function ageSecondsFrom(now, generatedAt) {
  const timestamp = Date.parse(generatedAt || '');
  const current = Date.parse(now || '');
  if (!Number.isFinite(timestamp) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.floor((current - timestamp) / 1000));
}

function observedLastError(options) {
  if (Object.prototype.hasOwnProperty.call(options, 'observedLastError')
    || Object.prototype.hasOwnProperty.call(options, 'lastError')) {
    const value = options.observedLastError ?? options.lastError ?? '';
    return typeof value === 'string' ? clean(value, '') : '';
  }
  return clean(options.observedLastError || options.lastError || 'Network.enable timed out');
}

function timeoutLikely(status) {
  return Boolean(status.observed?.chromeDevtoolsMcpListPagesTimedOut)
    || /timed out|timeout|Network\.enable/i.test(status.observed?.chromeDevtoolsMcpLastError || '');
}

function buildFindings(status, cleanupPlan) {
  const findings = [];
  if (timeoutLikely(status)) {
    findings.push({
      id: 'page-list-timeout',
      severity: 'blocking',
      summary: 'Chrome DevTools MCP is connected but list_pages timed out, so everyday Chrome page control is not proved.'
    });
  }
  if ((status.processes?.chromeDevtoolsMcpServers || 0) > 1 || (status.processes?.peekabooServers || 0) > 1) {
    findings.push({
      id: 'duplicate-mcp-servers',
      severity: 'warning',
      summary: 'Multiple Chrome DevTools MCP or Peekaboo servers are present; stale agent sessions may be competing for the same Chrome lane.'
    });
  }
  if ((status.chrome?.regularRemoteDebugging || 0) === 0 && (status.chrome?.regularProfiles || 0) > 0) {
    findings.push({
      id: 'regular-chrome-not-debuggable',
      severity: 'info',
      summary: 'Regular everyday Chrome is open but not directly remote-debuggable, which is expected for the safe default-profile boundary.'
    });
  }
  if (status.chrome?.devtools9223Ok && (status.processes?.chromeDevtoolsMcpBrowserUrl9223Wrappers || 0) > 0) {
    findings.push({
      id: 'codex-browser-agent-9223',
      severity: 'info',
      summary: 'The 9223 Chrome lane is reachable and should be treated as the Codex Browser Agent lane, not proof of regular Chrome tab control.'
    });
  }
  if (cleanupPlan?.summary?.ownerSessionCount > 1) {
    findings.push({
      id: 'owner-session-review',
      severity: 'info',
      summary: 'Runtime cleanup can identify agent owner sessions to review before manually closing stale MCP helpers.'
    });
  }
  return findings;
}

function cleanupReviewOwners(cleanupPlan) {
  return (cleanupPlan?.ownerSessions || [])
    .filter((owner) => !owner.current)
    .map((owner) => ({
      ownerPid: owner.ownerPid || null,
      ownerCommand: owner.ownerCommand || '',
      childCount: owner.childCount || 0,
      chromeDevtoolsMcp: owner.groups?.chromeDevtoolsMcp || 0,
      peekaboo: owner.groups?.peekaboo || 0,
      inspectCommand: owner.inspectCommand || '',
      inspectChildrenCommand: owner.inspectChildrenCommand || '',
      cleanupImpact: owner.cleanupImpact || 'unknown',
      expectedReduction: owner.expectedReduction || {
        chromeDevtoolsMcp: owner.groups?.chromeDevtoolsMcp || 0,
        peekaboo: owner.groups?.peekaboo || 0,
        totalBrowserMcp: (owner.groups?.chromeDevtoolsMcp || 0) + (owner.groups?.peekaboo || 0)
      }
    }));
}

export function buildChromeMcpTimeoutPlan(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const status = options.chromeMcpStatus || buildChromeMcpStatus({
    ...options,
    observedConnected: options.observedConnected ?? 'yes',
    observedTools: options.observedTools,
    observedPageListOk: options.observedPageListOk ?? 'no',
    observedPageCount: options.observedPageCount,
    observedLastError: observedLastError(options),
    observedSource: options.observedSource || options.source || 'chrome-mcp-timeout-plan'
  });
  const cleanupPlan = options.runtimeCleanupPlan || buildRuntimeCleanupPlan({
    ownerLimit: options.ownerLimit || 8
  });
  const reviewOwners = cleanupReviewOwners(cleanupPlan);
  const findings = buildFindings(status, cleanupPlan);
  const connected = status.observed?.chromeDevtoolsMcpConnected === true;
  const pageListOk = status.observed?.chromeDevtoolsMcpPageListOk === true;
  const pageListTimeout = timeoutLikely(status);
  const extensionPrepared = Boolean(status.codexExtension?.prepared);
  const nextAction = pageListOk
    ? 'use-regular-chrome-mcp'
    : pageListTimeout
    ? extensionPrepared
      ? 'use-gated-extension-resume-or-clean-stale-mcp'
      : 'clean-stale-mcp-then-retry-list-pages'
    : connected
    ? 'retry-list-pages-before-use'
    : 'connect-before-use';
  const regularChromeUseCommand = compactCommand([
    'node',
    'src/cli.mjs',
    'regular-chrome-use',
    '--intent',
    options.intent || 'inspect',
    '--chrome-mcp-connected',
    connected ? 'yes' : connected === false ? 'no' : 'unknown',
    '--chrome-mcp-page-list-ok',
    pageListOk ? 'yes' : pageListTimeout ? 'no' : 'unknown',
    status.observed?.chromeDevtoolsMcpLastError ? '--chrome-mcp-last-error' : '',
    status.observed?.chromeDevtoolsMcpLastError || '',
    '--chrome-mcp-source',
    status.observedSource || 'chrome-mcp-timeout-plan',
    ...backgroundTabArgs(options),
    '--format',
    'compact'
  ]);
  const commands = {
    regularChromeUse: regularChromeUseCommand,
    runtimeCleanupPlan: command(['node', 'src/cli.mjs', 'runtime-cleanup-plan', '--format', 'compact', '--owner-limit', String(options.ownerLimit || 8)]),
    chromeExtensionResumePlan: command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--format', 'compact']),
    chromeExtensionResumeApproval: command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--run', '--operator-ok', 'OK', '--format', 'compact']),
    chromeMcpStatusRetry: compactCommand([
      'node',
      'src/cli.mjs',
      'chrome-mcp-status',
      '--observed-connected',
      connected ? 'yes' : 'unknown',
      '--observed-page-list-ok',
      pageListOk ? 'yes' : 'no',
      status.observed?.chromeDevtoolsMcpLastError ? '--observed-last-error' : '',
      status.observed?.chromeDevtoolsMcpLastError || '',
      '--observed-source',
      status.observedSource || 'chrome-mcp-timeout-plan',
      '--format',
      'compact'
    ])
  };

  const plan = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    pageOutputTrusted: false,
    status: {
      decision: status.decision.status,
      connected,
      pageListOk,
      pageListTimeout,
      lastError: status.observed?.chromeDevtoolsMcpLastError || '',
      peekabooServers: status.processes?.peekabooServers || 0,
      chromeDevtoolsMcpServers: status.processes?.chromeDevtoolsMcpServers || 0,
      chromeDevtoolsMcp9223Wrappers: status.processes?.chromeDevtoolsMcpBrowserUrl9223Wrappers || 0,
      regularChromeOpen: Boolean(status.decision?.regularChromeOpen),
      regularChromeRemoteDebugging: status.chrome?.regularRemoteDebugging || 0,
      devtools9223Ok: Boolean(status.chrome?.devtools9223Ok),
      codexExtensionPrepared: extensionPrepared,
      codexExtensionBackendReady: Boolean(status.codexExtension?.backendReady)
    },
    nextAction,
    findings,
    cleanup: {
      ownerSessionCount: cleanupPlan?.summary?.ownerSessionCount || 0,
      listedOwnerSessions: cleanupPlan?.summary?.listedOwnerSessions || 0,
      currentOwnerPid: (cleanupPlan?.ownerSessions || []).find((owner) => owner.current)?.ownerPid || null,
      reviewOwners
    },
    guidance: {
      useEverydayChromeNow: pageListOk || Boolean(status.codexExtension?.backendReady),
      preferExtensionResume: !pageListOk && extensionPrepared,
      cleanupIsManual: true,
      doNotKillProcessesAutomatically: true,
      doNotUseDefaultProfileCdp: true,
      dedicatedTargetProfileRequiredForStoredAuth: true
    },
    commands
  };

  if (options.write || options.out || options.output) {
    plan.outputPath = safeRunPath(rootDir, options.out || options.output);
    writeJson(plan.outputPath, plan);
  }

  return plan;
}

export function buildChromeMcpTimeoutPlanStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds ?? options['stale-after-seconds'], 900);
  const planPath = safeRunPath(rootDir, options.in || options.input || options.path);
  const saved = readJsonStatus(planPath);
  const plan = saved.value || {};
  const ageSeconds = saved.parseOk ? ageSecondsFrom(generatedAt, plan.generatedAt) : null;
  const stale = ageSeconds === null ? true : ageSeconds > staleAfterSeconds;
  const status = plan.status || {};
  const guidance = plan.guidance || {};
  const cleanup = plan.cleanup || {};
  const commands = plan.commands || {};
  const backgroundTab = backgroundTabState(options);
  const planRelativePath = runsRelativePath(rootDir, planPath);
  const refreshCommand = command([
    'node',
    'src/cli.mjs',
    'chrome-mcp-timeout-plan',
    '--write',
    '--out',
    planRelativePath,
    ...backgroundTabArgs(options),
    '--format',
    'compact'
  ]);
  const shouldRefresh = !saved.exists || !saved.parseOk || stale;

  return {
    schemaVersion: 1,
    generatedAt,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    pageOutputTrusted: false,
    agentSafeNextCommandId: shouldRefresh ? 'chrome-mcp-timeout-plan-refresh' : 'none',
    agentSafeNextMayRunUnattended: shouldRefresh,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand: shouldRefresh ? refreshCommand : null,
    newBackgroundTabsAllowed: backgroundTab.newBackgroundTabsAllowed,
    newBackgroundTabOption: backgroundTab.newBackgroundTabOption,
    newBackgroundUrlEnv: backgroundTab.newBackgroundUrlEnv,
    newBackgroundUrlValueRead: backgroundTab.newBackgroundUrlValueRead,
    path: planPath,
    exists: saved.exists,
    parseOk: saved.parseOk,
    parseError: saved.error,
    staleAfterSeconds,
    ageSeconds,
    stale,
    status: !saved.exists
      ? 'missing'
      : !saved.parseOk
      ? 'parse-error'
      : stale
      ? 'stale'
      : status.decision || 'unknown',
    connected: saved.parseOk ? Boolean(status.connected) : false,
    pageListOk: saved.parseOk ? Boolean(status.pageListOk) : false,
    pageListTimeout: saved.parseOk ? Boolean(status.pageListTimeout) : false,
    useEverydayChromeNow: saved.parseOk ? Boolean(guidance.useEverydayChromeNow) : false,
    preferExtensionResume: saved.parseOk ? Boolean(guidance.preferExtensionResume) : false,
    cleanupIsManual: saved.parseOk ? Boolean(guidance.cleanupIsManual) : false,
    doNotUseDefaultProfileCdp: saved.parseOk ? Boolean(guidance.doNotUseDefaultProfileCdp) : true,
    dedicatedTargetProfileRequiredForStoredAuth: saved.parseOk ? Boolean(guidance.dedicatedTargetProfileRequiredForStoredAuth) : true,
    nextAction: saved.parseOk && !stale
      ? plan.nextAction || 'read-timeout-plan'
      : 'refresh-chrome-mcp-timeout-plan',
    findings: saved.parseOk && Array.isArray(plan.findings)
      ? plan.findings.map((finding) => finding.id || '').filter(Boolean)
      : [],
    cleanup: {
      ownerSessionCount: saved.parseOk ? cleanup.ownerSessionCount || 0 : 0,
      listedOwnerSessions: saved.parseOk ? cleanup.listedOwnerSessions || 0 : 0,
      currentOwnerPid: saved.parseOk ? cleanup.currentOwnerPid || null : null,
      reviewOwnerPids: saved.parseOk && Array.isArray(cleanup.reviewOwners)
        ? cleanup.reviewOwners.map((owner) => owner.ownerPid || 'unowned')
        : []
    },
    commands: {
      status: command(['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan-status', '--in', planRelativePath, ...backgroundTabArgs(options), '--format', 'compact']),
      refresh: refreshCommand,
      regularChromeUse: withBackgroundTabArgs(commands.regularChromeUse, options),
      runtimeCleanupPlan: commands.runtimeCleanupPlan || null,
      chromeExtensionResumePlan: commands.chromeExtensionResumePlan || null,
      chromeExtensionResumeApproval: commands.chromeExtensionResumeApproval || null,
      chromeMcpStatusRetry: commands.chromeMcpStatusRetry || null
    }
  };
}

export function formatChromeMcpTimeoutPlanCompact(plan) {
  const cleanupReviewInspect = plan.cleanup.reviewOwners.slice(0, 5).map((owner) => {
    const pid = owner.ownerPid || 'unowned';
    const inspectCommand = owner.inspectCommand || 'none';
    return `${pid}='${inspectCommand.replaceAll("'", "'\\''")}'`;
  }).join(';') || 'none';
  const cleanupReviewChildren = plan.cleanup.reviewOwners.slice(0, 5).map((owner) => {
    const pid = owner.ownerPid || 'unowned';
    const inspectCommand = owner.inspectChildrenCommand || 'none';
    return `${pid}='${inspectCommand.replaceAll("'", "'\\''")}'`;
  }).join(';') || 'none';
  const cleanupReviewImpact = plan.cleanup.reviewOwners.slice(0, 5).map((owner) => {
    const reduction = owner.expectedReduction || {};
    return `${owner.ownerPid || 'unowned'}:${owner.cleanupImpact || 'unknown'},chromeMcp=${reduction.chromeDevtoolsMcp || owner.chromeDevtoolsMcp || 0},peekaboo=${reduction.peekaboo || owner.peekaboo || 0}`;
  }).join(';') || 'none';
  const lines = [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `page_output_trusted: ${yesNo(plan.pageOutputTrusted)}`,
    `status: ${plan.status.decision}`,
    `connected: ${yesNo(plan.status.connected)}`,
    `page_list_ok: ${yesNo(plan.status.pageListOk)}`,
    `page_list_timeout: ${yesNo(plan.status.pageListTimeout)}`,
    `peekaboo_servers: ${plan.status.peekabooServers}`,
    `chrome_devtools_mcp_servers: ${plan.status.chromeDevtoolsMcpServers}`,
    `chrome_devtools_mcp_9223_wrappers: ${plan.status.chromeDevtoolsMcp9223Wrappers}`,
    `regular_chrome_open: ${yesNo(plan.status.regularChromeOpen)}`,
    `regular_chrome_remote_debugging: ${plan.status.regularChromeRemoteDebugging}`,
    `devtools_9223_ok: ${yesNo(plan.status.devtools9223Ok)}`,
    `codex_extension_prepared: ${yesNo(plan.status.codexExtensionPrepared)}`,
    `codex_extension_backend_ready: ${yesNo(plan.status.codexExtensionBackendReady)}`,
    `next_action: ${plan.nextAction}`,
    `use_everyday_chrome_now: ${yesNo(plan.guidance.useEverydayChromeNow)}`,
    `prefer_extension_resume: ${yesNo(plan.guidance.preferExtensionResume)}`,
    `cleanup_is_manual: ${yesNo(plan.guidance.cleanupIsManual)}`,
    `do_not_kill_processes_automatically: ${yesNo(plan.guidance.doNotKillProcessesAutomatically)}`,
    `do_not_use_default_profile_cdp: ${yesNo(plan.guidance.doNotUseDefaultProfileCdp)}`,
    `dedicated_target_profile_required_for_stored_auth: ${yesNo(plan.guidance.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `finding_count: ${plan.findings.length}`,
    `findings: ${plan.findings.map((finding) => finding.id).join(',') || 'none'}`,
    `cleanup_owner_sessions: ${plan.cleanup.ownerSessionCount}`,
    `cleanup_listed_owner_sessions: ${plan.cleanup.listedOwnerSessions}`,
    `cleanup_current_owner_pid: ${plan.cleanup.currentOwnerPid || 'none'}`,
    `cleanup_review_owner_pids: ${plan.cleanup.reviewOwners.map((owner) => owner.ownerPid || 'unowned').join(',') || 'none'}`,
    `cleanup_review_top: ${plan.cleanup.reviewOwners.slice(0, 5).map((owner) => `${owner.ownerPid || 'unowned'}:children=${owner.childCount},chromeMcp=${owner.chromeDevtoolsMcp},peekaboo=${owner.peekaboo}`).join(';') || 'none'}`,
    `cleanup_review_inspect: ${cleanupReviewInspect}`,
    `cleanup_review_children: ${cleanupReviewChildren}`,
    `cleanup_review_impact: ${cleanupReviewImpact}`,
    `regular_chrome_use_command: ${plan.commands.regularChromeUse.shell}`,
    `runtime_cleanup_plan_command: ${plan.commands.runtimeCleanupPlan.shell}`,
    `chrome_extension_resume_plan_command: ${plan.commands.chromeExtensionResumePlan.shell}`,
    `chrome_extension_resume_approval_command: ${plan.commands.chromeExtensionResumeApproval.shell}`,
    `chrome_mcp_status_retry_command: ${plan.commands.chromeMcpStatusRetry.shell}`
  ];
  if (plan.status.lastError) lines.push(`last_error: ${clean(plan.status.lastError)}`);
  if (plan.outputPath) lines.push(`output: ${plan.outputPath}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeMcpTimeoutPlanStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `page_output_trusted: ${yesNo(status.pageOutputTrusted)}`,
    `agent_safe_next_command_id: ${clean(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `new_background_tabs_allowed: ${yesNo(status.newBackgroundTabsAllowed)}`,
    `new_background_tab_option: ${clean(status.newBackgroundTabOption || 'none')}`,
    `new_background_url_env: ${clean(status.newBackgroundUrlEnv || 'none')}`,
    `new_background_url_value_read: ${yesNo(status.newBackgroundUrlValueRead)}`,
    `status: ${status.status}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `connected: ${yesNo(status.connected)}`,
    `page_list_ok: ${yesNo(status.pageListOk)}`,
    `page_list_timeout: ${yesNo(status.pageListTimeout)}`,
    `use_everyday_chrome_now: ${yesNo(status.useEverydayChromeNow)}`,
    `prefer_extension_resume: ${yesNo(status.preferExtensionResume)}`,
    `cleanup_is_manual: ${yesNo(status.cleanupIsManual)}`,
    `do_not_use_default_profile_cdp: ${yesNo(status.doNotUseDefaultProfileCdp)}`,
    `dedicated_target_profile_required_for_stored_auth: ${yesNo(status.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `next_action: ${clean(status.nextAction)}`,
    `finding_count: ${status.findings.length}`,
    `findings: ${status.findings.join(',') || 'none'}`,
    `cleanup_owner_sessions: ${status.cleanup.ownerSessionCount}`,
    `cleanup_listed_owner_sessions: ${status.cleanup.listedOwnerSessions}`,
    `cleanup_current_owner_pid: ${status.cleanup.currentOwnerPid || 'none'}`,
    `cleanup_review_owner_pids: ${status.cleanup.reviewOwnerPids.join(',') || 'none'}`,
    `path: ${status.path}`,
    `status_command: ${status.commands.status.shell}`,
    `refresh_command: ${status.commands.refresh.shell}`
  ];
  if (status.agentSafeNextCommand?.shell) lines.push(`agent_safe_next_command: ${status.agentSafeNextCommand.shell}`);
  if (status.commands.regularChromeUse) lines.push(`regular_chrome_use_command: ${status.commands.regularChromeUse.shell}`);
  if (status.commands.runtimeCleanupPlan) lines.push(`runtime_cleanup_plan_command: ${status.commands.runtimeCleanupPlan.shell}`);
  if (status.commands.chromeExtensionResumePlan) lines.push(`chrome_extension_resume_plan_command: ${status.commands.chromeExtensionResumePlan.shell}`);
  if (status.commands.chromeExtensionResumeApproval) lines.push(`chrome_extension_resume_approval_command: ${status.commands.chromeExtensionResumeApproval.shell}`);
  if (status.commands.chromeMcpStatusRetry) lines.push(`chrome_mcp_status_retry_command: ${status.commands.chromeMcpStatusRetry.shell}`);
  if (status.parseError) lines.push(`parse_error: ${clean(status.parseError)}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeMcpTimeoutPlanMarkdown(plan) {
  const lines = [
    '# Chrome MCP Timeout Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `Opens browser now: ${plan.opensBrowserNow ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Status',
    '',
    `- Decision: ${plan.status.decision}`,
    `- Connected: ${plan.status.connected ? 'yes' : 'no'}`,
    `- Page list OK: ${plan.status.pageListOk ? 'yes' : 'no'}`,
    `- Page list timeout: ${plan.status.pageListTimeout ? 'yes' : 'no'}`,
    `- Next action: ${plan.nextAction}`,
    '',
    '## Findings',
    ''
  ];
  for (const finding of plan.findings) {
    lines.push(`- ${finding.severity}: ${finding.id} - ${finding.summary}`);
  }
  lines.push(
    '',
    '## Commands',
    '',
    '```bash',
    plan.commands.regularChromeUse.shell,
    plan.commands.runtimeCleanupPlan.shell,
    plan.commands.chromeExtensionResumePlan.shell,
    plan.commands.chromeExtensionResumeApproval.shell,
    plan.commands.chromeMcpStatusRetry.shell,
    '```',
    ''
  );
  return lines.join('\n');
}
