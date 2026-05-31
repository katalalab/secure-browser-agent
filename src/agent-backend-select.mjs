import fs from 'node:fs';
import path from 'node:path';
import { buildAgentTask } from './agent-task.mjs';
import { buildAgentWorkflow } from './agent-workflow.mjs';
import { buildBackendMatrix } from './backend-matrix.mjs';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function appendObservedChromeArgs(args, options = {}) {
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
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function operatorApprovalReasons(safety = {}) {
  const reasons = [];
  if (safety.operatorInput) reasons.push('operator-input');
  if (safety.captureBlocked) reasons.push('capture-blocked');
  if (safety.commandOpensBrowser) reasons.push('command-opens-browser');
  if (safety.approvalCommandOpensBrowser) reasons.push('approval-command-opens-browser');
  return reasons;
}

function safeRunInputPath(rootDir, inPath, fallback) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(inPath || fallback).replace(/^[/\\]+/, '');
  const inputPath = path.resolve(runsRoot, relative);
  const insideRuns = inputPath === runsRoot || inputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent backend selector matrix input path: ${inPath}`);
  return inputPath;
}

function runsRelativePath(rootDir, inputPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(inputPath);
  return resolved.startsWith(`${runsRoot}${path.sep}`) ? path.relative(runsRoot, resolved) : inputPath;
}

function readSavedBackendMatrix(rootDir, options = {}) {
  const inPath = options.backendMatrixIn || options['backend-matrix-in'] || options.matrixIn || options['matrix-in'] || '';
  if (!inPath) {
    return {
      requested: false,
      path: '',
      relativePath: '',
      exists: false,
      parseOk: false,
      parseError: '',
      value: null
    };
  }
  const filePath = safeRunInputPath(rootDir, inPath, 'operator/backend-matrix-latest.json');
  if (!fs.existsSync(filePath)) {
    return {
      requested: true,
      path: filePath,
      relativePath: runsRelativePath(rootDir, filePath),
      exists: false,
      parseOk: false,
      parseError: '',
      value: null
    };
  }
  try {
    return {
      requested: true,
      path: filePath,
      relativePath: runsRelativePath(rootDir, filePath),
      exists: true,
      parseOk: true,
      parseError: '',
      value: JSON.parse(fs.readFileSync(filePath, 'utf8'))
    };
  } catch (error) {
    return {
      requested: true,
      path: filePath,
      relativePath: runsRelativePath(rootDir, filePath),
      exists: true,
      parseOk: false,
      parseError: error instanceof Error ? error.message : String(error),
      value: null
    };
  }
}

function workflowCommand(task, options = {}) {
  const args = ['node', 'src/cli.mjs', 'agent-workflow', '--task', task];
  if (options.targetDir) args.push('--target-dir', options.targetDir);
  if (options.query) args.push('--query', options.query);
  if (options.provider) args.push('--provider', options.provider);
  appendObservedChromeArgs(args, options);
  args.push('--format', 'compact');
  return command(args);
}

function existingTabIntent(task, options = {}) {
  return options.intent || (task === 'existing-tab' ? 'inspect' : task || 'inspect');
}

function existingTabCommands(task, options = {}) {
  const intent = existingTabIntent(task, options);
  const mcpObservationIn = options.mcpObservationIn ?? options['mcp-observation-in'];
  const claimPlan = ['node', 'src/cli.mjs', 'chrome-extension-claim-plan', '--backend-ready', options.chromeExtensionBackendAvailable === 'yes' ? 'yes' : 'unknown', '--intent', intent];
  if (options.matchTitle) claimPlan.push('--match-title', options.matchTitle);
  if (options.matchUrl) claimPlan.push('--match-url', options.matchUrl);
  if (options.matchOrigin) claimPlan.push('--match-origin', options.matchOrigin);
  if (options.matchPath) claimPlan.push('--match-path', options.matchPath);
  if (options.tabIndex !== undefined && options.tabIndex !== '') claimPlan.push('--tab-index', String(options.tabIndex));
  claimPlan.push('--format', 'compact');
  const regularChromeStatus = ['node', 'src/cli.mjs', 'regular-chrome-status'];
  if (mcpObservationIn) regularChromeStatus.push('--mcp-observation-in', mcpObservationIn);
  regularChromeStatus.push('--format', 'compact');
  return {
    regularChromeStatus: command(regularChromeStatus),
    chromeExtensionBackendCheckPlan: command(['node', 'src/cli.mjs', 'chrome-extension-backend-check-plan', '--format', 'compact']),
    chromeExtensionClaimPlan: command(claimPlan)
  };
}

function selectorCommand(task, options = {}) {
  const args = ['node', 'src/cli.mjs', 'agent-backend-select', '--task', task];
  if (options.targetDir) args.push('--target-dir', options.targetDir);
  if (options.query) args.push('--query', options.query);
  if (options.provider) args.push('--provider', options.provider);
  if (options.backendMatrixIn || options['backend-matrix-in']) args.push('--backend-matrix-in', options.backendMatrixIn || options['backend-matrix-in']);
  appendObservedChromeArgs(args, options);
  args.push('--format', 'compact');
  return command(args);
}

function selectedBackend(matrix, backendId) {
  return (matrix.backends || []).find((backend) => backend.id === backendId) || null;
}

function matrixTaskForWorkflow(workflow) {
  const task = workflow.task || '';
  if (task === 'existing-tab') return 'existing-tab';
  if (task === 'search') return 'search';
  if (task === 'public-crawl') return 'public-crawl';
  if (task === 'operate') return 'operate';
  if (task === 'scrape') return 'scrape';
  if (workflow.target?.available) return 'authenticated-scrape';
  if (task === 'analyze' || task === 'inspect' || task === 'observe') return 'analyze';
  return 'public-crawl';
}

export async function buildAgentBackendSelect(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const workflow = options.workflow || await buildAgentWorkflow({
    ...options,
    rootDir,
    generatedAt
  });
  const agentTask = options.agentTask || await buildAgentTask({
    ...options,
    rootDir,
    generatedAt,
    workflow,
    run: false,
    write: false
  });
  const savedBackendMatrix = readSavedBackendMatrix(rootDir, options);
  const backendMatrixSource = options.backendMatrix
    ? 'injected'
    : savedBackendMatrix.parseOk
      ? 'saved'
      : 'live';
  const backendMatrix = options.backendMatrix || savedBackendMatrix.value || await buildBackendMatrix({
    ...options,
    rootDir,
    generatedAt
  });
  const backend = selectedBackend(backendMatrix, workflow.route?.backend);
  const matrixTask = matrixTaskForWorkflow(workflow);
  const matrixTaskDecision = backendMatrix.tasks?.[matrixTask] || {};
  const targetDir = options.targetDir || options['target-dir'] || workflow.target?.dir || '';
  const query = options.query || workflow.query || '';
  const provider = options.provider || workflow.provider || '';
  const existingTabHandoff = workflow.task === 'existing-tab' ? existingTabCommands(workflow.task, options) : {};
  const safety = {
    executionAllowed: Boolean(agentTask.executionAllowed),
    blockedReason: agentTask.blockedReason || '',
    operatorInput: Boolean(workflow.route?.operatorInput),
    captureBlocked: Boolean(workflow.route?.captureBlocked),
    commandOpensBrowser: Boolean(workflow.route?.commandOpensBrowser),
    approvalCommandOpensBrowser: Boolean(workflow.route?.approvalCommandOpensBrowser),
    storedAuthenticatedScrapingOnEverydayChrome: false,
    dedicatedTargetProfileForStoredAuth: true,
    pageOutputTrusted: false
  };
  const approvalReasons = operatorApprovalReasons(safety);
  safety.operatorApprovalRequired = approvalReasons.length > 0;
  safety.operatorApprovalReasons = approvalReasons;
  safety.agentUnattendedAllowed = safety.executionAllowed && !safety.operatorApprovalRequired;

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    task: workflow.task,
    query,
    provider,
    target: workflow.target,
    selection: {
      backend: workflow.route?.backend || '',
      lane: workflow.route?.selectedLane || '',
      profileMode: workflow.route?.profileMode || '',
      matrixTask,
      matrixTaskBackend: matrixTaskDecision.backend || '',
      matrixTaskLane: matrixTaskDecision.selectedLane || '',
      agentInterface: backendMatrix.defaultAgentInterface || '',
      backendAvailable: Boolean(backend?.available),
      backendRole: backend?.role || '',
      backendStatus: backend?.status || '',
      canRunInBackground: Boolean(workflow.route?.canRunInBackground),
      existingTabCapable: Boolean(backend?.supportsExistingTabs),
      publicCrawlCapable: Boolean(backend?.supportsPublicCrawl),
      compatibilityCapable: Boolean(backend?.supportsCompatibility)
    },
    safety,
    regularChrome: {
      status: backendMatrix.regularChrome?.status || '',
      ready: Boolean(backendMatrix.regularChrome?.ready),
      backend: backendMatrix.regularChrome?.backend || '',
      chromeMcpRouteReady: Boolean(backendMatrix.regularChrome?.chromeMcpRouteReady),
      chromeMcpListPagesTimedOut: Boolean(backendMatrix.regularChrome?.chromeMcpListPagesTimedOut)
    },
    backendMatrix: {
      source: backendMatrixSource,
      inputRequested: Boolean(savedBackendMatrix.requested),
      inputPath: savedBackendMatrix.relativePath,
      inputExists: Boolean(savedBackendMatrix.exists),
      inputParseOk: Boolean(savedBackendMatrix.parseOk),
      inputParseError: savedBackendMatrix.parseError || '',
      generatedAt: backendMatrix.generatedAt || ''
    },
    commands: {
      selector: selectorCommand(workflow.task, { ...options, targetDir, query, provider }),
      workflow: workflowCommand(workflow.task, { ...options, targetDir, query, provider }),
      backendMatrix: backendMatrix.commands?.matrix || command(['node', 'src/cli.mjs', 'backend-matrix', '--format', 'compact']),
      backendMatrixStatus: backendMatrix.commands?.status || command(['node', 'src/cli.mjs', 'backend-matrix-status', '--in', 'operator/backend-matrix-latest.json', '--format', 'compact']),
      selectedDirect: workflow.recommendedCommand || null,
      selectedStatus: agentTask.selectedStatusCommand || null,
      authPreflightWatch: agentTask.authPreflightWatchCommand || null,
      authPreflightResumeStatus: agentTask.authPreflightResumeStatusCommand || null,
      regularChromeStatus: existingTabHandoff.regularChromeStatus || null,
      chromeExtensionBackendCheckPlan: existingTabHandoff.chromeExtensionBackendCheckPlan || null,
      chromeExtensionClaimPlan: existingTabHandoff.chromeExtensionClaimPlan || null,
      safePlan: agentTask.writeCommand || null,
      safeRun: agentTask.runCommand || null
    },
    workflow,
    agentTask: {
      status: agentTask.status,
      recommendedCommandId: agentTask.recommendedCommandId,
      recommendedCommandSafety: workflow.recommendedCommandSafety || {},
      executionAllowed: Boolean(agentTask.executionAllowed),
      blockedReason: agentTask.blockedReason || '',
      authPreflightChecked: Boolean(agentTask.authPreflightChecked),
      authPreflightParsed: Boolean(agentTask.authPreflightParsed),
      authPreflightOk: agentTask.authPreflightOk ?? null,
      authPreflightLoginLike: agentTask.authPreflightLoginLike ?? null,
      authPreflightSameOrigin: agentTask.authPreflightSameOrigin ?? null,
      authPreflightNextAction: agentTask.authPreflightNextAction || ''
    }
  };
}

export function formatAgentBackendSelectCompact(result) {
  const operatorApprovalReasonsList = result.safety?.operatorApprovalReasons || [];
  const lines = [
    `safe_mode: ${yesNo(result.safeMode)}`,
    `status_only: ${yesNo(result.statusOnly)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(result.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(result.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(result.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(result.pageContentReturned)}`,
    `task: ${clean(result.task)}`,
    `query: ${clean(result.query)}`,
    `target_available: ${yesNo(result.target?.available)}`,
    `target_source: ${clean(result.target?.source)}`,
    `target_dir: ${clean(result.target?.dir)}`,
    `selected_backend: ${clean(result.selection?.backend)}`,
    `selected_lane: ${clean(result.selection?.lane)}`,
    `selected_profile_mode: ${clean(result.selection?.profileMode)}`,
    `selected_agent_interface: ${clean(result.selection?.agentInterface)}`,
    `selected_backend_available: ${yesNo(result.selection?.backendAvailable)}`,
    `selected_backend_role: ${clean(result.selection?.backendRole)}`,
    `selected_backend_status: ${clean(result.selection?.backendStatus)}`,
    `selected_can_run_background: ${yesNo(result.selection?.canRunInBackground)}`,
    `matrix_task: ${clean(result.selection?.matrixTask)}`,
    `matrix_task_backend: ${clean(result.selection?.matrixTaskBackend)}`,
    `execution_allowed: ${yesNo(result.safety?.executionAllowed)}`,
    `agent_unattended_allowed: ${yesNo(result.safety?.agentUnattendedAllowed)}`,
    `operator_approval_required: ${yesNo(result.safety?.operatorApprovalRequired)}`,
    `operator_approval_reasons: ${operatorApprovalReasonsList.length ? operatorApprovalReasonsList.join(',') : 'none'}`,
    `blocked_reason: ${clean(result.safety?.blockedReason)}`,
    `operator_input: ${yesNo(result.safety?.operatorInput)}`,
    `capture_blocked: ${yesNo(result.safety?.captureBlocked)}`,
    `command_opens_browser: ${yesNo(result.safety?.commandOpensBrowser)}`,
    `approval_command_opens_browser: ${yesNo(result.safety?.approvalCommandOpensBrowser)}`,
    `stored_authenticated_scraping_on_everyday_chrome: ${yesNo(result.safety?.storedAuthenticatedScrapingOnEverydayChrome)}`,
    `dedicated_target_profile_for_stored_auth: ${yesNo(result.safety?.dedicatedTargetProfileForStoredAuth)}`,
    `page_output_trusted: ${yesNo(result.safety?.pageOutputTrusted)}`,
    `regular_chrome_status: ${clean(result.regularChrome?.status)}`,
    `regular_chrome_ready: ${yesNo(result.regularChrome?.ready)}`,
    `regular_chrome_backend: ${clean(result.regularChrome?.backend)}`,
    `chrome_mcp_route_ready: ${yesNo(result.regularChrome?.chromeMcpRouteReady)}`,
    `chrome_mcp_list_pages_timed_out: ${yesNo(result.regularChrome?.chromeMcpListPagesTimedOut)}`,
    `backend_matrix_source: ${clean(result.backendMatrix?.source)}`,
    `backend_matrix_input_requested: ${yesNo(result.backendMatrix?.inputRequested)}`,
    `backend_matrix_input_exists: ${yesNo(result.backendMatrix?.inputExists)}`,
    `backend_matrix_input_parse_ok: ${yesNo(result.backendMatrix?.inputParseOk)}`,
    `recommended_command_id: ${clean(result.agentTask?.recommendedCommandId)}`,
    `recommended_requires_operator_approval: ${yesNo(result.agentTask?.recommendedCommandSafety?.requiresOperatorApproval)}`,
    `recommended_agent_may_run_unattended: ${yesNo(result.agentTask?.recommendedCommandSafety?.agentMayRunUnattended)}`,
    `recommended_opens_browser: ${yesNo(result.agentTask?.recommendedCommandSafety?.opensBrowser)}`,
    `recommended_starts_capture: ${yesNo(result.agentTask?.recommendedCommandSafety?.startsCapture)}`,
    `recommended_reads_browser_storage: ${yesNo(result.agentTask?.recommendedCommandSafety?.readsBrowserStorage)}`,
    `recommended_returns_page_content: ${yesNo(result.agentTask?.recommendedCommandSafety?.returnsPageContent)}`,
    `recommended_mutates_runtime: ${yesNo(result.agentTask?.recommendedCommandSafety?.mutatesRuntime)}`
  ];
  if (result.agentTask?.authPreflightChecked) {
    lines.push('auth_preflight_checked: yes');
    lines.push(`auth_preflight_parsed: ${yesNo(result.agentTask.authPreflightParsed)}`);
    if (result.agentTask.authPreflightOk !== null && result.agentTask.authPreflightOk !== undefined) lines.push(`auth_preflight_ok: ${yesNo(result.agentTask.authPreflightOk)}`);
    if (result.agentTask.authPreflightLoginLike !== null && result.agentTask.authPreflightLoginLike !== undefined) lines.push(`auth_preflight_login_like: ${yesNo(result.agentTask.authPreflightLoginLike)}`);
    if (result.agentTask.authPreflightSameOrigin !== null && result.agentTask.authPreflightSameOrigin !== undefined) lines.push(`auth_preflight_same_origin: ${yesNo(result.agentTask.authPreflightSameOrigin)}`);
    if (result.agentTask.authPreflightNextAction) lines.push(`auth_preflight_next_action: ${clean(result.agentTask.authPreflightNextAction)}`);
  }
  if (result.backendMatrix?.inputPath) lines.push(`backend_matrix_input: ${clean(result.backendMatrix.inputPath)}`);
  if (result.backendMatrix?.inputParseError) lines.push(`backend_matrix_input_parse_error: ${clean(result.backendMatrix.inputParseError)}`);
  if (result.commands?.selector?.shell) lines.push(`selector_command: ${result.commands.selector.shell}`);
  if (result.commands?.workflow?.shell) lines.push(`workflow_command: ${result.commands.workflow.shell}`);
  if (result.commands?.backendMatrix?.shell) lines.push(`backend_matrix_command: ${result.commands.backendMatrix.shell}`);
  if (result.commands?.backendMatrixStatus?.shell) lines.push(`backend_matrix_status_command: ${result.commands.backendMatrixStatus.shell}`);
  if (result.commands?.selectedDirect?.shell) lines.push(`selected_direct_command: ${result.commands.selectedDirect.shell}`);
  if (result.commands?.selectedStatus?.shell) lines.push(`selected_status_command: ${result.commands.selectedStatus.shell}`);
  if (result.commands?.authPreflightWatch?.shell) lines.push(`auth_preflight_watch_command: ${result.commands.authPreflightWatch.shell}`);
  if (result.commands?.authPreflightResumeStatus?.shell) lines.push(`auth_preflight_resume_status_command: ${result.commands.authPreflightResumeStatus.shell}`);
  if (result.commands?.regularChromeStatus?.shell) lines.push(`regular_chrome_status_command: ${result.commands.regularChromeStatus.shell}`);
  if (result.commands?.chromeExtensionBackendCheckPlan?.shell) lines.push(`chrome_extension_backend_check_plan_command: ${result.commands.chromeExtensionBackendCheckPlan.shell}`);
  if (result.commands?.chromeExtensionClaimPlan?.shell) lines.push(`chrome_extension_claim_plan_command: ${result.commands.chromeExtensionClaimPlan.shell}`);
  if (result.commands?.safePlan?.shell) lines.push(`agent_task_plan_command: ${result.commands.safePlan.shell}`);
  if (result.commands?.safeRun?.shell) lines.push(`agent_task_safe_run_command: ${result.commands.safeRun.shell}`);
  return `${lines.join('\n')}\n`;
}
