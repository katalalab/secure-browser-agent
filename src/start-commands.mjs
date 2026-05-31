import { buildTargetCandidatePlan } from './target-candidate-plan.mjs';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function commandName(commandValue = {}) {
  const args = Array.isArray(commandValue?.args) ? commandValue.args : [];
  return args[2] || '';
}

function commandHas(commandValue = {}, value) {
  const args = Array.isArray(commandValue?.args) ? commandValue.args : [];
  return args.includes(value);
}

function commandOpensBrowser(commandValue = {}) {
  const name = commandName(commandValue);
  if (name === 'target-login' || name === 'target-login-capture') return true;
  if (name === 'target-handoff-resume' && commandHas(commandValue, '--open-login')) return true;
  if (name === 'target-daemon' && commandHas(commandValue, 'start')) return true;
  return false;
}

function commandStartsCapture(commandValue = {}) {
  const name = commandName(commandValue);
  return name === 'target-login-capture'
    || name === 'target-proof-capture'
    || name === 'target-handoff-run'
    || name === 'target-handoff-resume'
    || name === 'target-run'
    || name === 'target-scrape'
    || name === 'target-benchmark';
}

function commandStartsBackground(commandValue = {}) {
  return commandName(commandValue) === 'target-daemon' && commandHas(commandValue, 'start');
}

function commandRequiresOperatorApproval(commandValue = {}) {
  if (!commandValue) return false;
  const name = commandName(commandValue);
  const safeRunWrappers = new Set([
    'completion-proof-bundle-watch',
    'secret-env-handoff-watch',
    'target-candidate-plan-watch',
    'target-approval-resume-watch'
  ]);
  return commandOpensBrowser(commandValue)
    || commandStartsCapture(commandValue)
    || commandStartsBackground(commandValue)
    || (commandHas(commandValue, '--run') && !safeRunWrappers.has(name))
    || name === 'target-permissions';
}

function commandSafety(commandValue = null) {
  const requiresOperatorApproval = commandRequiresOperatorApproval(commandValue);
  return {
    opensBrowser: commandOpensBrowser(commandValue),
    startsCapture: commandStartsCapture(commandValue),
    startsBackground: commandStartsBackground(commandValue),
    requiresOperatorApproval,
    agentMayRunUnattended: Boolean(commandValue && !requiresOperatorApproval)
  };
}

function backgroundTabArgs(options = {}) {
  const regularChrome = options.regularChromeStatus || {};
  const allowNewBackgroundTab = options.allowNewBackgroundTab
    ?? options['allow-new-background-tab']
    ?? (regularChrome.scope?.newBackgroundTabsAllowed || regularChrome.chromeMcp?.newBackgroundTabAllowed ? 'yes' : '');
  const newBackgroundUrlEnv = options.newBackgroundUrlEnv
    ?? options['new-background-url-env']
    ?? regularChrome.chromeMcp?.newBackgroundUrlEnv
    ?? '';
  const args = [];
  if (allowNewBackgroundTab) args.push('--allow-new-background-tab', allowNewBackgroundTab);
  if (newBackgroundUrlEnv) args.push('--new-background-url-env', newBackgroundUrlEnv);
  return args;
}

export function regularChromeUseCommand(intent = 'inspect', options = {}) {
  return command([
    'node',
    'src/cli.mjs',
    'regular-chrome-use',
    '--intent',
    intent,
    '--mcp-observation-in',
    'operator/chrome-mcp-observation-latest.json',
    ...backgroundTabArgs(options),
    '--format',
    'compact'
  ]);
}

export function chromeMcpObservationStatusCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-mcp-observation-status', '--format', 'compact']);
}

export function chromeMcpTimeoutPlanStatusCommand(options = {}) {
  return command([
    'node',
    'src/cli.mjs',
    'chrome-mcp-timeout-plan-status',
    ...backgroundTabArgs(options),
    '--format',
    'compact'
  ]);
}

export function chromeMcpAutostartPlanCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'chrome-mcp-autostart-plan',
    '--write',
    '--out',
    'operator/chrome-mcp-autostart-plan-latest.json',
    '--format',
    'compact'
  ]);
}

export function chromeMcpAutostartPlanStatusCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'chrome-mcp-autostart-plan-status',
    '--in',
    'operator/chrome-mcp-autostart-plan-latest.json',
    '--format',
    'compact'
  ]);
}

export function backendMatrixStatusCommand(options = {}) {
  return command([
    'node',
    'src/cli.mjs',
    'backend-matrix-status',
    '--in',
    'operator/backend-matrix-latest.json',
    ...backgroundTabArgs(options),
    '--format',
    'compact'
  ]);
}

export function backendMatrixRefreshCommand(options = {}) {
  return command([
    'node',
    'src/cli.mjs',
    'backend-matrix',
    '--write',
    '--out',
    'operator/backend-matrix-latest.json',
    ...backgroundTabArgs(options),
    '--format',
    'compact'
  ]);
}

export function lightpandaDoctorCommand() {
  return command(['node', 'src/cli.mjs', 'lightpanda-doctor', '--format', 'compact']);
}

export function playwrightDoctorCommand() {
  return command(['node', 'src/cli.mjs', 'playwright-doctor', '--format', 'compact']);
}

export function seleniumDoctorCommand() {
  return command(['node', 'src/cli.mjs', 'selenium-doctor', '--format', 'compact']);
}

export function agentWorkflowCommand(task, extra = []) {
  return command(['node', 'src/cli.mjs', 'agent-workflow', '--task', task, ...extra, '--format', 'compact']);
}

export function targetCandidatePlanCommand(candidate = '') {
  return command([
    'node',
    'src/cli.mjs',
    'target-candidate-plan',
    ...(candidate ? ['--candidate', candidate] : []),
    '--format',
    'compact'
  ]);
}

export function targetCandidatePlanStatusCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'target-candidate-plan-status',
    '--in',
    'operator/target-candidate-plan-latest.json',
    '--format',
    'compact'
  ]);
}

export function targetCandidatePlanWatchCommand(candidate = '') {
  return command([
    'node',
    'src/cli.mjs',
    'target-candidate-plan-watch',
    '--run',
    '--in',
    'operator/target-candidate-plan-latest.json',
    '--out',
    'operator/target-candidate-plan-latest.json',
    ...(candidate ? ['--candidate', candidate] : []),
    '--format',
    'compact'
  ]);
}

export function targetApprovalStatusCommand(candidate = 'github', options = {}) {
  return command([
    'node',
    'src/cli.mjs',
    'target-approval-status',
    '--candidate',
    candidate || 'github',
    ...(options.realExternal || options['real-external'] ? ['--real-external'] : []),
    '--format',
    'compact'
  ]);
}

export function targetApprovalPreflightCommand(candidate = 'github', options = {}) {
  return command([
    'node',
    'src/cli.mjs',
    'target-approval-preflight',
    '--candidate',
    candidate || 'github',
    ...(options.realExternal || options['real-external'] ? ['--real-external'] : []),
    '--format',
    'compact'
  ]);
}

export function targetApprovalResumeCommand(candidate = 'github', options = {}) {
  return command([
    'node',
    'src/cli.mjs',
    'target-approval-resume',
    '--candidate',
    candidate || 'github',
    ...(options.realExternal || options['real-external'] ? ['--real-external'] : []),
    '--format',
    'compact'
  ]);
}

export function targetApprovalResumeStatusCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'target-approval-resume-status',
    '--in',
    'operator/target-approval-resume-latest.json',
    '--format',
    'compact'
  ]);
}

export function targetApprovalResumeWatchCommand(candidate = 'github') {
  return command([
    'node',
    'src/cli.mjs',
    'target-approval-resume-watch',
    '--run',
    '--in',
    'operator/target-approval-resume-latest.json',
    '--out',
    'operator/target-approval-resume-latest.json',
    '--candidate',
    candidate || 'github',
    '--real-external',
    '--format',
    'compact'
  ]);
}

export function completionProofBundleCommand(candidate = 'github') {
  return command([
    'node',
    'src/cli.mjs',
    'completion-proof-bundle',
    '--candidate',
    candidate || 'github',
    '--include-compact-command-audit',
    '--format',
    'compact'
  ]);
}

export function completionProofBundleWriteCommand(candidate = 'github') {
  return command([
    'node',
    'src/cli.mjs',
    'completion-proof-bundle',
    '--candidate',
    candidate || 'github',
    '--include-compact-command-audit',
    '--write',
    '--out',
    'operator/completion-proof-bundle-latest.json',
    '--format',
    'compact'
  ]);
}

export function completionProofBundleStatusCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'completion-proof-bundle-status',
    '--in',
    'operator/completion-proof-bundle-latest.json',
    '--format',
    'compact'
  ]);
}

export function completionProofBundleWatchCommand(candidate = 'github') {
  return command([
    'node',
    'src/cli.mjs',
    'completion-proof-bundle-watch',
    '--run',
    '--in',
    'operator/completion-proof-bundle-latest.json',
    '--out',
    'operator/completion-proof-bundle-latest.json',
    '--candidate',
    candidate || 'github',
    '--format',
    'compact'
  ]);
}

export function agentProofChecklistCommand(candidate = 'github') {
  return command([
    'node',
    'src/cli.mjs',
    'agent-proof-checklist',
    '--candidate',
    candidate || 'github',
    '--format',
    'compact'
  ]);
}

export function agentProofChecklistWriteCommand(candidate = 'github') {
  return command([
    'node',
    'src/cli.mjs',
    'agent-proof-checklist',
    '--candidate',
    candidate || 'github',
    '--write',
    '--out',
    'operator/agent-proof-checklist-latest.json',
    '--format',
    'compact'
  ]);
}

export function agentProofChecklistStatusCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'agent-proof-checklist-status',
    '--in',
    'operator/agent-proof-checklist-latest.json',
    '--format',
    'compact'
  ]);
}

export function agentProofCloseoutCommand(candidate = 'github') {
  return command([
    'node',
    'src/cli.mjs',
    'agent-proof-closeout',
    '--candidate',
    candidate || 'github',
    '--include-compact-command-audit',
    '--format',
    'compact'
  ]);
}

export function agentProofCloseoutWriteCommand(candidate = 'github') {
  return command([
    'node',
    'src/cli.mjs',
    'agent-proof-closeout',
    '--candidate',
    candidate || 'github',
    '--write',
    '--out',
    'operator/agent-proof-closeout-latest.json',
    '--include-compact-command-audit',
    '--format',
    'compact'
  ]);
}

export function agentProofCloseoutStatusCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'agent-proof-closeout-status',
    '--in',
    'operator/agent-proof-closeout-latest.json',
    '--format',
    'compact'
  ]);
}

export function recommendedBootstrapPlanCommand(options = {}) {
  const plan = buildTargetCandidatePlan({ candidate: normalizedCandidate(options.candidate || '') });
  const recommended = plan.candidates.find((candidate) => candidate.id === plan.recommendedCandidate)
    || plan.candidates[0]
    || null;
  return recommended?.bootstrapPlanCompactCommand || null;
}

function normalizedCandidate(candidate = '') {
  if (!candidate) return '';
  try {
    buildTargetCandidatePlan({ candidate });
    return candidate;
  } catch {
    return '';
  }
}

export function secretRunSelectCommand(targetDir, commandId = 'target-login-capture') {
  if (!targetDir) return null;
  return command([
    'node',
    'src/cli.mjs',
    'secret-run-select',
    '--command',
    commandId,
    '--target-dir',
    targetDir,
    '--format',
    'compact'
  ]);
}

export function secretEnvHandoffCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'secret-env-handoff',
    '--format',
    'compact'
  ]);
}

export function secretEnvHandoffStatusCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'secret-env-handoff-status',
    '--in',
    'operator/secret-env-handoff.json',
    '--format',
    'compact'
  ]);
}

export function secretEnvHandoffWatchCommand() {
  return command([
    'node',
    'src/cli.mjs',
    'secret-env-handoff-watch',
    '--run',
    '--in',
    'operator/secret-env-handoff.json',
    '--out',
    'operator/secret-env-handoff.json',
    '--format',
    'compact'
  ]);
}

export function buildStartCommandCandidates(options = {}) {
  const candidate = normalizedCandidate(options.candidate || '');
  const commands = [
    {
      id: 'regular-chrome-use',
      label: 'Check the operator-requested everyday Chrome lane without opening Chrome or reading browser storage',
      command: regularChromeUseCommand(options.intent || 'inspect', options)
    },
    {
      id: 'chrome-mcp-observation-status',
      label: 'Read the saved normalized Chrome MCP observation without listing tabs again',
      command: chromeMcpObservationStatusCommand()
    },
    {
      id: 'chrome-mcp-timeout-plan-status',
      label: 'Read the saved Chrome MCP timeout recovery plan without rescanning processes',
      command: chromeMcpTimeoutPlanStatusCommand(options)
    },
    {
      id: 'chrome-mcp-autostart-plan',
      label: 'Write the Chrome DevTools MCP LaunchAgent plan under runs/ without loading it',
      command: chromeMcpAutostartPlanCommand()
    },
    {
      id: 'chrome-mcp-autostart-plan-status',
      label: 'Read the saved Chrome DevTools MCP LaunchAgent plan without running launchctl',
      command: chromeMcpAutostartPlanStatusCommand()
    },
    {
      id: 'backend-matrix-status',
      label: 'Read the saved backend matrix for search, analyze, scrape, operate, and existing-tab routing',
      command: backendMatrixStatusCommand(options)
    },
    {
      id: 'backend-matrix-refresh',
      label: 'Refresh the backend matrix under runs/ without opening browsers or reading secrets',
      command: backendMatrixRefreshCommand(options)
    },
    {
      id: 'lightpanda-doctor',
      label: 'Check Lightpanda binary/source prerequisites without opening browsers or reading secrets',
      command: lightpandaDoctorCommand()
    },
    {
      id: 'playwright-doctor',
      label: 'Check Playwright package/cache prerequisites without opening browsers or reading secrets',
      command: playwrightDoctorCommand()
    },
    {
      id: 'selenium-doctor',
      label: 'Check Selenium local/grid prerequisites without opening browsers or reading secrets',
      command: seleniumDoctorCommand()
    },
    {
      id: 'workflow-search',
      label: 'Plan a public search workflow with the current backend selector',
      command: agentWorkflowCommand('search', ['--query', '<query>'])
    },
    {
      id: 'workflow-analyze',
      label: 'Plan page-structure analysis through the current safe backend',
      command: agentWorkflowCommand('analyze')
    },
    {
      id: 'workflow-scrape',
      label: 'Plan authenticated scraping through the current target pack',
      command: agentWorkflowCommand('scrape')
    },
    {
      id: 'workflow-operate',
      label: 'Plan authenticated operation through auth-check and fresh-snapshot gates',
      command: agentWorkflowCommand('operate')
    },
    {
      id: 'target-candidate-plan',
      label: 'List real external target candidates and compact bootstrap commands',
      command: targetCandidatePlanCommand(candidate)
    },
    {
      id: 'target-candidate-plan-status',
      label: 'Read the saved real external target candidate plan without recomputing candidates',
      command: targetCandidatePlanStatusCommand()
    },
    {
      id: 'target-candidate-plan-watch',
      label: 'Refresh the saved target candidate plan only when missing stale or parse-broken',
      command: targetCandidatePlanWatchCommand(candidate)
    },
    {
      id: 'target-approval-status',
      label: 'Read the saved target approval pack and proof inventory without opening Chrome or reading browser storage',
      command: targetApprovalStatusCommand(candidate || 'github', options)
    },
    {
      id: 'target-approval-preflight',
      label: 'Read the real-external target approval preflight and avoid default inventory ambiguity',
      command: targetApprovalPreflightCommand(candidate || 'github', options)
    },
    {
      id: 'target-approval-resume',
      label: 'Plan the current target approval next command without running it; execution still requires operator OK',
      command: targetApprovalResumeCommand(candidate || 'github', options)
    },
    {
      id: 'target-approval-resume-status',
      label: 'Read the saved target approval resume plan without recomputing proof state',
      command: targetApprovalResumeStatusCommand()
    },
    {
      id: 'target-approval-resume-watch',
      label: 'Refresh the saved target approval resume plan only when missing stale or parse-broken',
      command: targetApprovalResumeWatchCommand(candidate || 'github')
    },
    {
      id: 'completion-proof-bundle',
      label: 'Read the full completion proof bundle without opening Chrome, starting capture, or reading browser storage',
      command: completionProofBundleCommand(candidate || 'github')
    },
    {
      id: 'completion-proof-bundle-write',
      label: 'Persist the completion proof bundle under runs/ for later agents without opening browsers or reading secrets',
      command: completionProofBundleWriteCommand(candidate || 'github')
    },
    {
      id: 'completion-proof-bundle-status',
      label: 'Read the saved completion proof bundle freshness and refresh command without recomputing proof state',
      command: completionProofBundleStatusCommand()
    },
    {
      id: 'completion-proof-bundle-watch',
      label: 'Refresh the saved completion proof bundle only when missing stale or parse-broken, without opening browsers or reading secrets',
      command: completionProofBundleWatchCommand(candidate || 'github')
    },
    {
      id: 'agent-proof-checklist',
      label: 'Read the short agent proof checklist with unattended-run boundaries and operator-only resume command',
      command: agentProofChecklistCommand(candidate || 'github')
    },
    {
      id: 'agent-proof-checklist-write',
      label: 'Persist the short agent proof checklist under runs/ for low-token polling by later agents',
      command: agentProofChecklistWriteCommand(candidate || 'github')
    },
    {
      id: 'agent-proof-checklist-status',
      label: 'Read the saved agent proof checklist freshness and operator approval boundary without recomputing proof state',
      command: agentProofChecklistStatusCommand()
    },
    {
      id: 'agent-proof-closeout',
      label: 'Read the final proof closeout summary without opening Chrome, starting capture, or reading browser storage',
      command: agentProofCloseoutCommand(candidate || 'github')
    },
    {
      id: 'agent-proof-closeout-write',
      label: 'Persist the final proof closeout under runs/ for later low-token status polling',
      command: agentProofCloseoutWriteCommand(candidate || 'github')
    },
    {
      id: 'agent-proof-closeout-status',
      label: 'Read the saved final proof closeout freshness and refresh command without recomputing proof state',
      command: agentProofCloseoutStatusCommand()
    }
  ];

  if (options.includeBootstrap !== false) {
    const bootstrap = recommendedBootstrapPlanCommand({ candidate });
    if (bootstrap) {
      commands.push({
        id: 'target-bootstrap-plan',
        label: 'Print the compact scaffold, login, capture, benchmark, and proof command sequence for the recommended target',
        command: bootstrap
      });
    }
  }

  const secret = secretRunSelectCommand(options.targetDir || '', options.secretCommand || 'target-login-capture');
  if (secret) {
    commands.push({
      id: 'secret-run-select',
      label: 'Choose the safest 1Password headless wrapper for the selected target command without reading secret values',
      command: secret
    });
  }

  commands.push({
    id: 'secret-env-handoff',
    label: 'Print the 1Password Environments handoff for headless non-browser secrets without reading secret values',
    command: secretEnvHandoffCommand()
  }, {
    id: 'secret-env-handoff-status',
    label: 'Read the saved 1Password Environments handoff without recomputing secret posture',
    command: secretEnvHandoffStatusCommand()
  }, {
    id: 'secret-env-handoff-watch',
    label: 'Refresh the saved 1Password Environments handoff only when missing stale or parse-broken',
    command: secretEnvHandoffWatchCommand()
  });

  return commands.map((item) => ({
    ...item,
    safety: commandSafety(item.command || null)
  }));
}

export function compactKey(value) {
  return String(value || 'command').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'command';
}
