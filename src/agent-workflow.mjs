import { buildBrowserRoute } from './browser-route.mjs';
import { buildProofGateStatus } from './proof-gate-status.mjs';
import { buildProviderReport } from './provider-report.mjs';
import { resolveTargetPack } from './target-pack.mjs';

const TASK_ALIASES = new Map([
  ['auto', 'auto'],
  ['search', 'search'],
  ['find', 'search'],
  ['observe', 'observe'],
  ['read', 'observe'],
  ['inspect', 'inspect'],
  ['analyze', 'analyze'],
  ['analysis', 'analyze'],
  ['structure', 'analyze'],
  ['page-structure', 'analyze'],
  ['scrape', 'scrape'],
  ['extract', 'scrape'],
  ['operate', 'operate'],
  ['click', 'operate'],
  ['fill', 'operate'],
  ['screenshot', 'screenshot'],
  ['diagnose', 'diagnose'],
  ['crawl', 'crawl'],
  ['links', 'links'],
  ['existing-tab', 'existing-tab'],
  ['public-crawl', 'public-crawl'],
  ['auth-proof', 'auth-proof'],
  ['proof', 'auth-proof']
]);

function normalizeTask(task) {
  return TASK_ALIASES.get(String(task || 'auto')) || 'auto';
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

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function operatorApprovalReasons(route = {}) {
  const reasons = [];
  if (route.operatorInput) reasons.push('operator-input');
  if (route.captureBlocked) reasons.push('capture-blocked');
  if (route.commandOpensBrowser) reasons.push('command-opens-browser');
  if (route.approvalCommandOpensBrowser) reasons.push('approval-command-opens-browser');
  return reasons;
}

function recipeForTask(task) {
  if (task === 'search') return 'search';
  if (task === 'observe') return 'observe';
  if (task === 'inspect') return 'inspect';
  if (task === 'analyze') return 'inspect';
  if (task === 'operate') return 'operate';
  if (task === 'screenshot') return 'screenshot';
  if (task === 'diagnose') return 'diagnose';
  if (task === 'crawl') return 'crawl';
  if (task === 'links') return 'links';
  return '';
}

function routeTaskForWorkflow(task, hasTarget) {
  if (task === 'existing-tab') return 'existing-tab';
  if (task === 'public-crawl' || (!hasTarget && task === 'search')) return 'public-crawl';
  if (!hasTarget && task === 'analyze') return 'analyze';
  if (hasTarget) return 'authenticated-scrape';
  return 'public-crawl';
}

function shouldAutoDetectTarget(task) {
  return !['search', 'existing-tab', 'public-crawl'].includes(task);
}

function missingTargetAction(task, hasTarget) {
  if (hasTarget || task === 'existing-tab' || task === 'public-crawl') return '';
  return 'pass --target-dir for authenticated target-pack workflows';
}

function targetRunStatusCommand(targetDir, recipe) {
  return command(['node', 'src/cli.mjs', 'target-run-status', targetDir, recipe, '--format', 'compact']);
}

function existingTabIntent(task, options = {}) {
  const value = String(options.intent || options.existingTabIntent || task || 'inspect').toLowerCase();
  if (['operate', 'click', 'fill'].includes(value)) return 'operate';
  if (['screenshot', 'visual'].includes(value)) return 'screenshot';
  if (['console', 'logs'].includes(value)) return 'console';
  if (['network', 'requests'].includes(value)) return 'network';
  return 'inspect';
}

function appendChromeObservationArgs(args, options = {}) {
  const mcpObservationIn = options.mcpObservationIn ?? options['mcp-observation-in'];
  if (mcpObservationIn) args.push('--mcp-observation-in', mcpObservationIn);
  if (options.chromeMcpConnected) args.push('--chrome-mcp-connected', options.chromeMcpConnected);
  if (options.chromeMcpTools !== undefined && options.chromeMcpTools !== '') args.push('--chrome-mcp-tools', String(options.chromeMcpTools));
  if (options.chromeMcpPageListOk) args.push('--chrome-mcp-page-list-ok', options.chromeMcpPageListOk);
  if (options.chromeMcpPageCount !== undefined && options.chromeMcpPageCount !== '') args.push('--chrome-mcp-page-count', String(options.chromeMcpPageCount));
  if (options.chromeMcpLastError) args.push('--chrome-mcp-last-error', options.chromeMcpLastError);
  if (options.chromeMcpSource) args.push('--chrome-mcp-source', options.chromeMcpSource);
  if (options.allowNewBackgroundTab) args.push('--allow-new-background-tab', options.allowNewBackgroundTab);
  if (options.newBackgroundUrlEnv) args.push('--new-background-url-env', options.newBackgroundUrlEnv);
  if (options.chromeExtensionPrepared) args.push('--chrome-extension-prepared', options.chromeExtensionPrepared);
  if (options.chromeExtensionBackendAvailable) args.push('--chrome-extension-backend-available', options.chromeExtensionBackendAvailable);
  if (options.chromeExtensionBackendLastError) args.push('--chrome-extension-backend-last-error', options.chromeExtensionBackendLastError);
  if (options.chromeExtensionWindowRetryAttempted) args.push('--chrome-extension-window-retry-attempted', options.chromeExtensionWindowRetryAttempted);
  if (options.appleEventsActiveTabObserved) args.push('--apple-events-active-tab-observed', options.appleEventsActiveTabObserved);
  if (options.appleEventsJavascriptAllowed) args.push('--apple-events-javascript-allowed', options.appleEventsJavascriptAllowed);
  if (options.appleEventsStatusFile) args.push('--apple-events-status-file', options.appleEventsStatusFile);
}

function existingTabCommands(task, options = {}) {
  const intent = existingTabIntent(task, options);
  const mcpObservationIn = options.mcpObservationIn ?? options['mcp-observation-in'] ?? 'operator/chrome-mcp-observation-latest.json';
  const regularChromeUse = ['node', 'src/cli.mjs', 'regular-chrome-use', '--intent', intent];
  const hasChromeObservationArgs = Boolean(
    options.mcpObservationIn
    || options['mcp-observation-in']
    || options.chromeMcpConnected
    || options.chromeMcpPageListOk
    || options.chromeMcpLastError
    || options.chromeMcpSource
    || options.statusText
    || options.listPagesText
  );
  if (!hasChromeObservationArgs) {
    regularChromeUse.push('--mcp-observation-in', mcpObservationIn);
  }
  appendChromeObservationArgs(regularChromeUse, options);
  regularChromeUse.push('--format', 'compact');

  const claimPlan = ['node', 'src/cli.mjs', 'chrome-extension-claim-plan', '--backend-ready', options.chromeExtensionBackendAvailable === 'yes' ? 'yes' : 'unknown', '--intent', intent];
  if (options.matchTitle) claimPlan.push('--match-title', options.matchTitle);
  if (options.matchUrl) claimPlan.push('--match-url', options.matchUrl);
  if (options.matchOrigin) claimPlan.push('--match-origin', options.matchOrigin);
  if (options.matchPath) claimPlan.push('--match-path', options.matchPath);
  if (options.tabIndex !== undefined && options.tabIndex !== '') claimPlan.push('--tab-index', String(options.tabIndex));
  claimPlan.push('--format', 'compact');

  return {
    regularChromeUse: command(regularChromeUse),
    regularChromeRefresh: command(['node', 'src/cli.mjs', 'regular-chrome-refresh', '--intent', intent, '--mcp-observation-in', mcpObservationIn, '--format', 'compact']),
    regularChromeStatus: command(['node', 'src/cli.mjs', 'regular-chrome-status', '--mcp-observation-in', mcpObservationIn, '--format', 'compact']),
    chromeMcpHandoff: command(['node', 'src/cli.mjs', 'chrome-mcp-handoff', '--mcp-observation-in', mcpObservationIn, '--format', 'compact']),
    chromeExtensionBackendCheckPlan: command(['node', 'src/cli.mjs', 'chrome-extension-backend-check-plan', '--format', 'compact']),
    chromeExtensionClaimPlan: command(claimPlan)
  };
}

function targetCommands({ targetDir, pack, task, query, provider }) {
  const profile = pack.metadata.profile || pack.targetPolicy.defaultProfile || pack.metadata.target || '';
  const pageUrl = pack.metadata.pageUrl || '';
  const commands = {
    daemonStatus: command(['node', 'src/cli.mjs', 'target-daemon', targetDir, 'status']),
    daemonStart: command(['node', 'src/cli.mjs', 'target-daemon', targetDir, 'start']),
    daemonStop: command(['node', 'src/cli.mjs', 'target-daemon', targetDir, 'stop']),
    authCheck: command(['node', 'src/cli.mjs', 'target-auth-check', targetDir, '--daemon', '--format', 'compact']),
    observe: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'observe', '--daemon']),
    observeStatus: targetRunStatusCommand(targetDir, 'observe'),
    inspect: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'inspect', '--daemon']),
    inspectStatus: targetRunStatusCommand(targetDir, 'inspect'),
    analyze: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'inspect', '--daemon']),
    analyzeStatus: targetRunStatusCommand(targetDir, 'analyze'),
    operate: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'operate', '--daemon']),
    operateStatus: targetRunStatusCommand(targetDir, 'operate'),
    scrape: command(['node', 'src/cli.mjs', 'target-scrape', targetDir, '--daemon']),
    scrapeStatus: targetRunStatusCommand(targetDir, 'scrape'),
    search: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'search', '--daemon']),
    searchStatus: targetRunStatusCommand(targetDir, 'search'),
    screenshot: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'screenshot', '--daemon']),
    screenshotStatus: targetRunStatusCommand(targetDir, 'screenshot'),
    diagnose: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'diagnose', '--daemon']),
    diagnoseStatus: targetRunStatusCommand(targetDir, 'diagnose'),
    crawl: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'crawl', '--daemon']),
    crawlStatus: targetRunStatusCommand(targetDir, 'crawl'),
    links: command(['node', 'src/cli.mjs', 'target-run', targetDir, 'links', '--daemon']),
    linksStatus: targetRunStatusCommand(targetDir, 'links'),
    operateAddFillTemplate: command(['node', 'src/cli.mjs', 'target-operate-add', targetDir, 'fill', '--selector', '<css-selector>', '--value-env', '<ENV_NAME>', '--as', '<step_name>']),
    operateAddClickTemplate: command(['node', 'src/cli.mjs', 'target-operate-add', targetDir, 'click', '--selector', '<css-selector>', '--as', '<step_name>']),
    operateAddWaitTemplate: command(['node', 'src/cli.mjs', 'target-operate-add', targetDir, 'wait-for', '--selector', '<css-selector>', '--text', '<expected-text>', '--as', '<step_name>']),
    clickTemplate: pageUrl ? command(['node', 'src/cli.mjs', 'click-cdp', pageUrl, '--policy', pack.policy, '--profile', profile, '--selector', '<css-selector>', '--daemon', '--out', 'click.json']) : null,
    fillTemplate: pageUrl ? command(['node', 'src/cli.mjs', 'fill-cdp', pageUrl, '--policy', pack.policy, '--profile', profile, '--selector', '<css-selector>', '--value', '<text>', '--daemon', '--out', 'fill.json']) : null,
    proofPlan: command(['node', 'src/cli.mjs', 'target-proof-plan', targetDir, '--real-external', '--format', 'markdown']),
    proofCapture: command(['node', 'src/cli.mjs', 'target-proof-capture', targetDir, '--real-external', '--run', '--wait-auth', '--wait-auth-status-out', 'wait-auth-status.json', '--format', 'compact'])
  };
  if (query) {
    commands.publicSearch = command(['node', 'src/cli.mjs', 'search-cdp', query, '--provider', provider, '--profile', profile, '--policy', pack.policy, '--daemon']);
  }
  return commands;
}

const AUTH_GATED_TARGET_TASKS = new Set([
  'observe',
  'inspect',
  'analyze',
  'scrape',
  'operate',
  'search',
  'screenshot',
  'diagnose',
  'crawl',
  'links'
]);

function authGateRequired({ task, hasTarget, route, proofGateStatus }) {
  if (!hasTarget || !AUTH_GATED_TARGET_TASKS.has(task)) return false;
  return Boolean(
    route.captureBlocked
    || proofGateStatus?.authCheckOk === false
    || proofGateStatus?.loginLike === true
    || proofGateStatus?.operatorGuidance?.captureBlocked === true
  );
}

function authGateReason({ route, proofGateStatus }) {
  if (proofGateStatus?.loginLike === true) return 'target-auth-check-login-like';
  if (proofGateStatus?.authCheckOk === false) return 'target-auth-check-not-ok';
  if (route.captureBlocked) return 'route-capture-blocked';
  if (proofGateStatus?.operatorGuidance?.captureBlocked === true) return 'operator-guidance-capture-blocked';
  return '';
}

function selectRecommendedCommand({ task, hasTarget, commands, route, proofGateStatus }) {
  if (hasTarget) {
    if (authGateRequired({ task, hasTarget, route, proofGateStatus })) {
      return [`auth-check-before-${task}`, commands.authCheck];
    }
    if (task === 'search') return ['search', commands.search];
    if (task === 'observe') return ['observe', commands.observe];
    if (task === 'inspect') return ['inspect', commands.inspect];
    if (task === 'analyze') return ['analyze', commands.analyze];
    if (task === 'scrape') return ['scrape', commands.scrape];
    if (task === 'operate') return ['auth-check-before-operate', commands.authCheck];
    if (task === 'screenshot') return ['screenshot', commands.screenshot];
    if (task === 'diagnose') return ['diagnose', commands.diagnose];
    if (task === 'crawl') return ['crawl', commands.crawl];
    if (task === 'links') return ['links', commands.links];
    if (task === 'auth-proof') return ['proof-plan', commands.proofPlan];
    return ['observe', commands.observe];
  }
  if (task === 'existing-tab') return ['regular-chrome-use', commands.regularChromeUse || route.commands?.route || null];
  if (task === 'search') return ['public-search', commands.publicSearch];
  if (task === 'analyze') return ['browser-route', route.commands?.status || route.commands?.route || null];
  return ['browser-route', route.commands?.route || null];
}

function recommendedCommandSafety({ recommendedCommandId, task, commands, options = {} }) {
  const id = String(recommendedCommandId || '');
  const recommendedArgs = id === 'regular-chrome-use'
    ? commands.regularChromeUse?.args || []
    : [];
  const isAuthCheck = id.startsWith('auth-check-before-');
  const isTargetRead = [
    'observe',
    'inspect',
    'analyze',
    'scrape',
    'search',
    'screenshot',
    'diagnose',
    'crawl',
    'links'
  ].includes(id);
  const isPublicSearch = id === 'public-search';
  const isExistingTab = id === 'regular-chrome-use';
  const isProofPlan = id === 'proof-plan';
  const isBrowserRoute = id === 'browser-route';
  const opensExistingTabBackground = recommendedArgs.includes('--allow-new-background-tab')
    && recommendedArgs.includes('yes');
  const opensBrowser = Boolean(
    isPublicSearch
    || (isExistingTab && opensExistingTabBackground)
    || id === 'proof-capture'
  );
  const startsCapture = id === 'proof-capture';
  const returnsPageContent = Boolean(isTargetRead || isPublicSearch);
  const requiresOperatorApproval = Boolean(startsCapture || (isExistingTab && opensExistingTabBackground && !options.newBackgroundUrlEnv));
  const agentMayRunUnattended = Boolean(
    (isAuthCheck || isTargetRead || isPublicSearch || isProofPlan || isBrowserRoute || isExistingTab)
    && !requiresOperatorApproval
  );
  return {
    requiresOperatorApproval,
    agentMayRunUnattended,
    opensBrowser,
    startsCapture,
    readsBrowserStorage: false,
    returnsPageContent,
    mutatesRuntime: false
  };
}

export async function buildAgentWorkflow(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const task = normalizeTask(options.task);
  const explicitTargetDir = options.targetDir || options['target-dir'] || '';
  const provider = options.provider || 'duckduckgo';
  const query = options.query || '';
  const autoDetectTarget = !explicitTargetDir && shouldAutoDetectTarget(task);
  const proofGateStatus = options.proofGateStatus || (autoDetectTarget
    ? await buildProofGateStatus({ ...options, rootDir, generatedAt })
    : null);
  const autoTargetDir = autoDetectTarget ? proofGateStatus?.targetDir || '' : '';
  const targetDir = explicitTargetDir || autoTargetDir;
  const targetSource = explicitTargetDir ? 'explicit' : autoTargetDir ? 'proof-gate-status' : 'none';
  let targetPack = null;
  let targetError = '';
  if (targetDir) {
    try {
      targetPack = resolveTargetPack(targetDir);
    } catch (error) {
      targetError = error.message;
    }
  }
  const hasTarget = Boolean(targetPack);
  const route = await buildBrowserRoute({
    ...options,
    rootDir,
    generatedAt,
    proofGateStatus,
    task: routeTaskForWorkflow(task, hasTarget)
  });
  const providerReport = options.providerReport || buildProviderReport({ rootDir });
  const commands = hasTarget
    ? targetCommands({ targetDir: targetPack.dir, pack: targetPack, task, query, provider })
    : {
        publicSearch: command(['node', 'src/cli.mjs', 'search-cdp', query || '<query>', '--provider', provider, '--profile', 'public', '--daemon']),
        browserRoute: route.commands?.route || null,
        targetCandidatePlan: command(['node', 'src/cli.mjs', 'target-candidate-plan', '--format', 'markdown']),
        ...(task === 'existing-tab' ? existingTabCommands(task, options) : {})
      };
  const [recommendedCommandId, recommendedCommand] = selectRecommendedCommand({
    task,
    hasTarget,
    commands,
    route,
    proofGateStatus
  });
  const recommendedSafety = recommendedCommandSafety({
    recommendedCommandId,
    task,
    commands,
    options
  });
  const targetAuthGateRequired = authGateRequired({ task, hasTarget, route, proofGateStatus });
  const targetAuthGateReason = authGateReason({ route, proofGateStatus });
  const approvalReasons = operatorApprovalReasons(route);
  const operatorApprovalRequired = approvalReasons.length > 0;

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    task,
    query,
    provider,
    target: {
      available: hasTarget,
      autoDetected: targetSource === 'proof-gate-status',
      source: targetSource,
      dir: targetPack?.dir || targetDir,
      name: targetPack?.metadata.target || '',
      profile: targetPack?.metadata.profile || targetPack?.targetPolicy.defaultProfile || '',
      pageUrl: targetPack?.metadata.pageUrl || '',
      loginUrl: targetPack?.metadata.loginUrl || '',
      error: targetError
    },
    route: {
      selectedLane: route.selectedLane,
      backend: route.backend,
      profileMode: route.profileMode,
      canRunInBackground: route.canRunInBackground,
      operatorInput: route.operatorInput,
      captureBlocked: route.captureBlocked,
      operatorApprovalRequired,
      operatorApprovalReasons: approvalReasons,
      agentUnattendedAllowed: !operatorApprovalRequired,
      commandOpensBrowser: route.commandOpensBrowser,
      approvalCommandOpensBrowser: route.approvalCommandOpensBrowser
    },
    providerDecision: {
      defaultBackend: providerReport.recommendation.defaultBackend,
      defaultAgentInterface: providerReport.recommendation.defaultAgentInterface,
      publicCrawlAccelerator: providerReport.recommendation.publicCrawlAccelerator,
      richAutomationFallback: providerReport.recommendation.richAutomationFallback
    },
    recommendedCommandId,
    recommendedCommand,
    recommendedCommandSafety: recommendedSafety,
    commands,
    guidance: {
      useDedicatedTargetProfileForStoredAuth: true,
      runAuthCheckBeforeOperate: targetAuthGateRequired && task === 'operate',
      runAuthCheckBeforeTargetWorkflow: targetAuthGateRequired,
      authGateRequired: targetAuthGateRequired,
      authGateReason: targetAuthGateRequired ? targetAuthGateReason : '',
      freshSnapshotRequiredForMutation: task === 'operate',
      pageOutputTrusted: false,
      missingTargetAction: missingTargetAction(task, hasTarget)
    }
  };
}

export function formatAgentWorkflowCompact(plan) {
  const operatorApprovalReasonsList = plan.route.operatorApprovalReasons || [];
  const lines = [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(plan.startsCaptureNow)}`,
    `task: ${clean(plan.task)}`,
    `target_available: ${yesNo(plan.target.available)}`,
    `target_auto_detected: ${yesNo(plan.target.autoDetected)}`,
    `target_source: ${clean(plan.target.source)}`,
    `target: ${clean(plan.target.name)}`,
    `target_dir: ${clean(plan.target.dir)}`,
    `target_profile: ${clean(plan.target.profile)}`,
    `route_lane: ${clean(plan.route.selectedLane)}`,
    `route_backend: ${clean(plan.route.backend)}`,
    `route_profile_mode: ${clean(plan.route.profileMode)}`,
    `route_background: ${yesNo(plan.route.canRunInBackground)}`,
    `route_operator_input: ${yesNo(plan.route.operatorInput)}`,
    `route_capture_blocked: ${yesNo(plan.route.captureBlocked)}`,
    `agent_unattended_allowed: ${yesNo(plan.route.agentUnattendedAllowed)}`,
    `operator_approval_required: ${yesNo(plan.route.operatorApprovalRequired)}`,
    `operator_approval_reasons: ${operatorApprovalReasonsList.length ? operatorApprovalReasonsList.join(',') : 'none'}`,
    `route_command_opens_browser: ${yesNo(plan.route.commandOpensBrowser)}`,
    `route_approval_command_opens_browser: ${yesNo(plan.route.approvalCommandOpensBrowser)}`,
    `provider_default_backend: ${clean(plan.providerDecision.defaultBackend)}`,
    `provider_default_agent_interface: ${clean(plan.providerDecision.defaultAgentInterface)}`,
    `provider_public_crawl_accelerator: ${clean(plan.providerDecision.publicCrawlAccelerator)}`,
    `recommended_command_id: ${clean(plan.recommendedCommandId)}`,
    `recommended_requires_operator_approval: ${yesNo(plan.recommendedCommandSafety?.requiresOperatorApproval)}`,
    `recommended_agent_may_run_unattended: ${yesNo(plan.recommendedCommandSafety?.agentMayRunUnattended)}`,
    `recommended_opens_browser: ${yesNo(plan.recommendedCommandSafety?.opensBrowser)}`,
    `recommended_starts_capture: ${yesNo(plan.recommendedCommandSafety?.startsCapture)}`,
    `recommended_reads_browser_storage: ${yesNo(plan.recommendedCommandSafety?.readsBrowserStorage)}`,
    `recommended_returns_page_content: ${yesNo(plan.recommendedCommandSafety?.returnsPageContent)}`,
    `recommended_mutates_runtime: ${yesNo(plan.recommendedCommandSafety?.mutatesRuntime)}`,
    `dedicated_target_profile_for_stored_auth: ${yesNo(plan.guidance.useDedicatedTargetProfileForStoredAuth)}`,
    `run_auth_check_before_operate: ${yesNo(plan.guidance.runAuthCheckBeforeOperate)}`,
    `run_auth_check_before_target_workflow: ${yesNo(plan.guidance.runAuthCheckBeforeTargetWorkflow)}`,
    `auth_gate_required: ${yesNo(plan.guidance.authGateRequired)}`,
    `auth_gate_reason: ${clean(plan.guidance.authGateReason)}`,
    `fresh_snapshot_required_for_mutation: ${yesNo(plan.guidance.freshSnapshotRequiredForMutation)}`,
    `page_output_trusted: ${yesNo(plan.guidance.pageOutputTrusted)}`
  ];
  if (plan.query) lines.push(`query: ${clean(plan.query)}`);
  if (plan.target.error) lines.push(`target_error: ${clean(plan.target.error)}`);
  if (plan.guidance.missingTargetAction) lines.push(`missing_target_action: ${clean(plan.guidance.missingTargetAction)}`);
  if (plan.recommendedCommand?.shell) lines.push(`recommended_command: ${plan.recommendedCommand.shell}`);
  if (plan.commands.daemonStatus?.shell) lines.push(`daemon_status_command: ${plan.commands.daemonStatus.shell}`);
  if (plan.commands.daemonStart?.shell) lines.push(`daemon_start_command: ${plan.commands.daemonStart.shell}`);
  if (plan.commands.authCheck?.shell) lines.push(`auth_check_command: ${plan.commands.authCheck.shell}`);
  if (plan.commands.observe?.shell) lines.push(`observe_command: ${plan.commands.observe.shell}`);
  if (plan.commands.observeStatus?.shell) lines.push(`observe_status_command: ${plan.commands.observeStatus.shell}`);
  if (plan.commands.inspect?.shell) lines.push(`inspect_command: ${plan.commands.inspect.shell}`);
  if (plan.commands.inspectStatus?.shell) lines.push(`inspect_status_command: ${plan.commands.inspectStatus.shell}`);
  if (plan.commands.analyze?.shell) lines.push(`analyze_command: ${plan.commands.analyze.shell}`);
  if (plan.commands.analyzeStatus?.shell) lines.push(`analyze_status_command: ${plan.commands.analyzeStatus.shell}`);
  if (plan.commands.operate?.shell) lines.push(`operate_command: ${plan.commands.operate.shell}`);
  if (plan.commands.operateStatus?.shell) lines.push(`operate_status_command: ${plan.commands.operateStatus.shell}`);
  if (plan.commands.operateAddFillTemplate?.shell) lines.push(`operate_add_fill_template_command: ${plan.commands.operateAddFillTemplate.shell}`);
  if (plan.commands.operateAddClickTemplate?.shell) lines.push(`operate_add_click_template_command: ${plan.commands.operateAddClickTemplate.shell}`);
  if (plan.commands.operateAddWaitTemplate?.shell) lines.push(`operate_add_wait_template_command: ${plan.commands.operateAddWaitTemplate.shell}`);
  if (plan.commands.scrape?.shell) lines.push(`scrape_command: ${plan.commands.scrape.shell}`);
  if (plan.commands.scrapeStatus?.shell) lines.push(`scrape_status_command: ${plan.commands.scrapeStatus.shell}`);
  if (plan.commands.search?.shell) lines.push(`search_command: ${plan.commands.search.shell}`);
  if (plan.commands.searchStatus?.shell) lines.push(`search_status_command: ${plan.commands.searchStatus.shell}`);
  if (plan.commands.publicSearch?.shell) lines.push(`public_search_command: ${plan.commands.publicSearch.shell}`);
  if (plan.commands.regularChromeUse?.shell) lines.push(`regular_chrome_use_command: ${plan.commands.regularChromeUse.shell}`);
  if (plan.commands.regularChromeRefresh?.shell) lines.push(`regular_chrome_refresh_command: ${plan.commands.regularChromeRefresh.shell}`);
  if (plan.commands.regularChromeStatus?.shell) lines.push(`regular_chrome_status_command: ${plan.commands.regularChromeStatus.shell}`);
  if (plan.commands.chromeMcpHandoff?.shell) lines.push(`chrome_mcp_handoff_command: ${plan.commands.chromeMcpHandoff.shell}`);
  if (plan.commands.chromeExtensionBackendCheckPlan?.shell) lines.push(`chrome_extension_backend_check_plan_command: ${plan.commands.chromeExtensionBackendCheckPlan.shell}`);
  if (plan.commands.chromeExtensionClaimPlan?.shell) lines.push(`chrome_extension_claim_plan_command: ${plan.commands.chromeExtensionClaimPlan.shell}`);
  if (plan.commands.clickTemplate?.shell) lines.push(`click_template_command: ${plan.commands.clickTemplate.shell}`);
  if (plan.commands.fillTemplate?.shell) lines.push(`fill_template_command: ${plan.commands.fillTemplate.shell}`);
  if (plan.commands.proofPlan?.shell) lines.push(`proof_plan_command: ${plan.commands.proofPlan.shell}`);
  if (plan.commands.proofCapture?.shell) lines.push(`proof_capture_command: ${plan.commands.proofCapture.shell}`);
  if (plan.commands.targetCandidatePlan?.shell) lines.push(`target_candidate_plan_command: ${plan.commands.targetCandidatePlan.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentWorkflowMarkdown(plan) {
  const lines = [
    '# Secure Browser Agent Workflow',
    '',
    `Generated: ${plan.generatedAt}`,
    `Task: ${plan.task}`,
    `Target: ${plan.target.available ? plan.target.name : 'none'}`,
    `Backend: ${plan.route.backend}`,
    `Selected lane: ${plan.route.selectedLane}`,
    `Recommended command: ${plan.recommendedCommandId}`,
    '',
    '## Safety',
    '',
    `- Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `- Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    `- Opens browser now: ${plan.opensBrowserNow ? 'yes' : 'no'}`,
    `- Dedicated target profile for stored auth: ${plan.guidance.useDedicatedTargetProfileForStoredAuth ? 'yes' : 'no'}`,
    `- Fresh snapshot required for mutation: ${plan.guidance.freshSnapshotRequiredForMutation ? 'yes' : 'no'}`,
    '',
    '## Command',
    '',
    '```bash',
    plan.recommendedCommand?.shell || '',
    '```',
    ''
  ];
  return lines.join('\n');
}
