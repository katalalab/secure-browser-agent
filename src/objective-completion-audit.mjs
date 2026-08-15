import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { buildReadinessAudit } from './readiness-audit.mjs';
import { buildObjectiveNext } from './objective-next.mjs';
import { buildTargetApprovalResume, buildTargetApprovalStatus } from './target-approval-pack.mjs';
import { toPosixPath } from './output.mjs';

function criterionFromRequirement(item) {
  const proved = item.status === 'proved';
  return {
    id: item.id,
    requirement: item.requirement,
    status: item.status,
    proved,
    verdict: proved ? 'proved-current' : 'not-proved-current',
    evidence: item.evidence || [],
    next: item.next || ''
  };
}

function argAfter(args, flag) {
  const index = Array.isArray(args) ? args.indexOf(flag) : -1;
  return index >= 0 ? args[index + 1] || '' : '';
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

function rootRelativeCommandArg(rootDir, value) {
  if (!value) return value;
  const text = String(value);
  if (!path.isAbsolute(text)) return text;
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const resolvedValue = path.resolve(text);
  if (resolvedValue === resolvedRoot || resolvedValue.startsWith(`${resolvedRoot}${path.sep}`)) {
    return toPosixPath(path.relative(resolvedRoot, resolvedValue));
  }
  return text;
}

function commandDisplayShell(rootDir, commandValue) {
  const args = commandValue?.args;
  if (!Array.isArray(args)) return commandValue?.shell || '';
  return command(args.map((arg) => rootRelativeCommandArg(rootDir, arg))).shell;
}

function safeRunPath(rootDir, outPath, fallback = 'operator/objective-completion-audit-latest.json') {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || fallback).replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid objective completion audit path: ${outPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`path is outside runs: ${filePath}`);
  return toPosixPath(path.relative(runsRoot, resolved));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function ageSeconds(filePath, nowMs) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return Math.max(0, Math.round((nowMs - stat.mtimeMs) / 1000));
}

function commandArgs(item) {
  if (Array.isArray(item?.args)) return item.args;
  return [];
}

function commandShell(item) {
  return String(item?.shell || '');
}

function commandHas(item, value) {
  const args = commandArgs(item);
  return args.includes(value) || commandShell(item).includes(value);
}

function commandName(item) {
  const args = commandArgs(item);
  if (args[0] === 'node' && args[1] === 'src/cli.mjs' && args[2]) return args[2];
  const shell = commandShell(item);
  const match = shell.match(/\b(target-[\w-]+|objective-[\w-]+|chrome-extension-resume)\b/);
  return match ? match[1] : '';
}

function commandOpensBrowser(item) {
  const name = commandName(item);
  return Boolean(
    name === 'target-login-capture'
      || (name === 'target-handoff-resume' && commandHas(item, '--open-login'))
      || (name === 'chrome-extension-resume' && commandHas(item, '--run'))
  );
}

function commandStartsCapture(item) {
  const name = commandName(item);
  return Boolean(
    (name === 'target-proof-capture' && commandHas(item, '--run'))
      || (name === 'target-login-capture' && !commandHas(item, '--open-only'))
      || (name === 'target-handoff-resume' && commandHas(item, '--run') && commandHas(item, '--wait-auth'))
      || (name === 'objective-resume' && commandHas(item, '--run') && commandHas(item, '--operator-ready'))
  );
}

function nextCommandSafety(nextAction = {}) {
  const commandValue = nextAction.command || null;
  const opensBrowser = commandOpensBrowser(commandValue);
  const startsCapture = commandStartsCapture(commandValue);
  const requiresOperatorApproval = Boolean(commandValue && (nextAction.needsOperatorInput || opensBrowser || startsCapture));
  const agentMayRunUnattended = Boolean(commandValue && !requiresOperatorApproval);
  return {
    opensBrowser,
    startsCapture,
    requiresOperatorApproval,
    agentMayRunUnattended,
    agentRunCommand: agentMayRunUnattended ? commandValue : null,
    operatorApprovalCommand: requiresOperatorApproval ? commandValue : null
  };
}

function preferredOperatorApprovalCommand(nextSafety = {}, targetApproval = {}) {
  const operatorCommand = nextSafety.operatorApprovalCommand || null;
  if (
    operatorCommand
    && commandName(operatorCommand) === 'target-handoff-resume'
    && targetApproval.resumeRunCommand?.shell
  ) {
    return targetApproval.resumeRunCommand;
  }
  return operatorCommand;
}

function monitorOverrideArgs(options = {}) {
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  return [
    ...(timeoutMs === undefined || timeoutMs === null || timeoutMs === '' ? [] : ['--monitor-timeout-ms', String(timeoutMs)]),
    ...(intervalMs === undefined || intervalMs === null || intervalMs === '' ? [] : ['--monitor-interval-ms', String(intervalMs)])
  ];
}

function commandTargetDir(command = {}) {
  const args = command.args || [];
  const index = Array.isArray(args) ? args.indexOf('target-auth-watch') : -1;
  return index >= 0 ? args[index + 1] || '' : '';
}

function targetDirFromCommand(command = {}) {
  if (!command) return '';
  const args = command.args || [];
  if (args[0] === 'node' && args[1] === 'src/cli.mjs' && String(args[2] || '').startsWith('target-') && args[3]) return args[3];
  const shell = String(command.shell || '');
  const match = shell.match(/\btarget-[\w-]+\s+('([^']+)'|"([^"]+)"|([^\s]+))/);
  if (match) return match[2] || match[3] || match[4] || '';
  return '';
}

function targetDirFromAction(nextAction = {}, executionPolicy = {}) {
  return targetDirFromCommand(executionPolicy.agentSafeCommand)
    || targetDirFromCommand(nextAction.command)
    || '';
}

function handoffPathForAuthWatch(rootDir, command = {}) {
  const args = command.args || [];
  const targetDir = commandTargetDir(command);
  const handoff = argAfter(args, '--handoff');
  if (!targetDir || !handoff) return '';
  return path.join(path.resolve(rootDir, targetDir), 'outputs', handoff);
}

function portFromArgs(args = []) {
  const port = argAfter(args, '--auth-check-port') || argAfter(args, '--cdp-port');
  const numeric = Number(port);
  return Number.isInteger(numeric) && numeric > 0 && numeric <= 65535 ? numeric : null;
}

function portFromHandoff(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const handoff = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const commands = Array.isArray(handoff?.handoff?.commands) ? handoff.handoff.commands : [];
    for (const item of commands) {
      const port = portFromArgs(item.args || []);
      if (port) return port;
    }
  } catch {
    return null;
  }
  return null;
}

function probeTcpPort(port, timeoutMs = 150) {
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort <= 0 || numericPort > 65535) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: numericPort });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function authWatchStatus(rootDir, command, options = {}) {
  const handoffPath = handoffPathForAuthWatch(rootDir, command);
  const port = portFromHandoff(handoffPath);
  const reachable = typeof options.authWatchHandoffPortReachable === 'boolean'
    ? options.authWatchHandoffPortReachable
    : await (options.authWatchHandoffPortProbe || probeTcpPort)(
      port,
      Number(options.authWatchHandoffPortTimeoutMs || options['auth-watch-handoff-port-timeout-ms'] || 150)
    );
  return {
    handoffPath,
    port,
    reachable,
    stale: port !== null && reachable === false
  };
}

async function chooseAgentSafeCommand(rootDir, nextAction = {}, options = {}) {
  const candidates = Array.isArray(nextAction.manualCommandCandidates)
    ? nextAction.manualCommandCandidates
    : [];
  const authWatch = candidates.find((item) => item.id === 'auth-watch' || item.command?.shell?.includes('target-auth-watch'));
  const preferMonitor = Boolean(nextAction.operatorGuidance?.captureBlocked || nextAction.needsOperatorInput);
  const authWatchProbe = authWatch?.command
    ? await authWatchStatus(rootDir, authWatch.command, options)
    : {
        handoffPath: '',
        port: null,
        reachable: null,
        stale: false
      };
  if (preferMonitor && authWatch?.command && authWatchProbe.stale) {
    return {
      agentSafeAction: 'reopen-login-browser-required',
      agentSafeCommandId: 'none',
      agentSafeCommand: null,
      agentSafeCommandMonitorOnly: false,
      agentSafeCommandMayOpenBrowser: false,
      agentSafeCommandStartsCapture: false,
      agentSafeCommandBlockedReason: 'handoff-auth-check-port-unreachable',
      authWatchHandoffPath: authWatchProbe.handoffPath,
      authWatchHandoffPort: authWatchProbe.port,
      authWatchHandoffPortReachable: authWatchProbe.reachable
    };
  }
  if (preferMonitor && !authWatch?.command) {
    return {
      agentSafeAction: 'operator-approval-required',
      agentSafeCommandId: 'none',
      agentSafeCommand: null,
      agentSafeCommandMonitorOnly: false,
      agentSafeCommandMayOpenBrowser: false,
      agentSafeCommandStartsCapture: false,
      agentSafeCommandBlockedReason: 'operator-approval-required',
      authWatchHandoffPath: authWatchProbe.handoffPath,
      authWatchHandoffPort: authWatchProbe.port,
      authWatchHandoffPortReachable: authWatchProbe.reachable
    };
  }
  const nextSafety = nextCommandSafety(nextAction);
  const command = preferMonitor && authWatch?.command
    ? authWatch.command
    : nextSafety.agentRunCommand || null;
  const commandId = command === authWatch?.command ? 'auth-watch' : nextAction.id || 'none';
  if (!command) {
    return {
      agentSafeAction: 'operator-approval-required',
      agentSafeCommandId: 'none',
      agentSafeCommand: null,
      agentSafeCommandMonitorOnly: false,
      agentSafeCommandMayOpenBrowser: false,
      agentSafeCommandStartsCapture: false,
      agentSafeCommandBlockedReason: nextSafety.requiresOperatorApproval ? 'operator-approval-required' : 'no-agent-safe-command',
      authWatchHandoffPath: authWatchProbe.handoffPath,
      authWatchHandoffPort: authWatchProbe.port,
      authWatchHandoffPortReachable: authWatchProbe.reachable
    };
  }
  return {
    agentSafeAction: commandId === 'auth-watch' ? 'monitor-auth-watch' : compactAction(nextAction.id),
    agentSafeCommandId: command ? commandId : 'none',
    agentSafeCommand: command,
    agentSafeCommandMonitorOnly: commandId === 'auth-watch',
    agentSafeCommandMayOpenBrowser: commandId !== 'auth-watch' && Boolean(command?.args?.includes('--open-login') || command?.shell?.includes('target-login-capture')),
    agentSafeCommandStartsCapture: commandId !== 'auth-watch' && Boolean(command),
    agentSafeCommandBlockedReason: '',
    authWatchHandoffPath: authWatchProbe.handoffPath,
    authWatchHandoffPort: authWatchProbe.port,
    authWatchHandoffPortReachable: authWatchProbe.reachable
  };
}

function buildAgentProofStepHandoff(nextAction = {}, executionPolicy = {}, options = {}) {
  const targetDir = targetDirFromAction(nextAction, executionPolicy);
  const handoff = argAfter(executionPolicy.agentSafeCommand?.args || [], '--handoff')
    || argAfter(nextAction.command?.args || [], '--handoff')
    || 'operator-handoff.json';
  const monitorArgs = monitorOverrideArgs(options);
  const timeoutMs = options.timeoutMs ?? options['timeout-ms'] ?? 300000;
  const targetArgs = [
    ...(targetDir ? ['--target-dir', targetDir] : []),
    ...(handoff ? ['--handoff', handoff] : [])
  ];
  const planCommand = command(['node', 'src/cli.mjs', 'agent-proof-step', ...targetArgs, ...monitorArgs, '--format', 'compact']);
  const startCommand = command(['node', 'src/cli.mjs', 'agent-proof-step-start', '--run', '--operator-ok', 'OK', '--out', 'operator/agent-proof-step-latest.json', '--timeout-ms', String(timeoutMs), ...targetArgs, ...monitorArgs, '--format', 'compact']);
  const statusCommand = command(['node', 'src/cli.mjs', 'agent-proof-step-status', '--in', 'operator/agent-proof-step-latest.json', '--format', 'compact']);
  const authNotReady = Boolean(executionPolicy.agentSafeCommandMonitorOnly || nextAction.operatorGuidance?.captureBlocked || nextAction.needsOperatorInput);
  return {
    available: Boolean(targetDir),
    targetDir,
    handoff,
    startReadyToRun: false,
    startBlockers: authNotReady
      ? ['operator-ok-required', 'agent-proof-step-not-allowed:auth-not-ready']
      : ['operator-ok-required'],
    opensBrowserNow: false,
    startsCaptureNow: false,
    planCommand,
    startCommand,
    statusCommand
  };
}

async function buildTargetApprovalSummary(rootDir, generatedAt, options = {}) {
  const candidate = options.candidate || options.id || 'github';
  const status = options.targetApprovalStatus || await buildTargetApprovalStatus({
    rootDir,
    generatedAt,
    candidate,
    realExternal: true
  });
  const selectedCandidate = status.selectedCandidate || candidate || 'github';
  const resume = options.targetApprovalResume || await buildTargetApprovalResume({
    rootDir,
    generatedAt,
    candidate: selectedCandidate,
    realExternal: true,
    run: false,
    status
  });
  const inventoryRealExternal = status.inventory?.realExternal !== false;
  const statusCommand = resume.statusCommand || command([
    'node',
    'src/cli.mjs',
    'target-approval-status',
    '--candidate',
    selectedCandidate,
    ...(inventoryRealExternal ? ['--real-external'] : []),
    '--format',
    'compact'
  ]);
  const resumePlanCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-resume',
    '--candidate',
    selectedCandidate,
    ...(inventoryRealExternal ? ['--real-external'] : []),
    '--format',
    'compact'
  ]);
  const resumeStatusCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-resume-status',
    '--in',
    'operator/target-approval-resume-latest.json',
    '--format',
    'compact'
  ]);
  const resumeWatchCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-resume-watch',
    '--run',
    '--in',
    'operator/target-approval-resume-latest.json',
    '--out',
    'operator/target-approval-resume-latest.json',
    '--candidate',
    selectedCandidate,
    '--real-external',
    '--format',
    'compact'
  ]);
  const preflightCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-preflight',
    '--candidate',
    selectedCandidate,
    '--real-external',
    '--format',
    'compact'
  ]);
  const resumePreflightCommand = resume.preflightCommand || preflightCommand;
  const resumeProofPlanCommand = resume.proofPlanCommand || status.commands?.proofPlan || null;
  const resumeRunCommand = resume.runCommand || command([
    'node',
    'src/cli.mjs',
    'target-approval-resume',
    '--candidate',
    selectedCandidate,
    ...(inventoryRealExternal ? ['--real-external'] : []),
    '--run',
    '--operator-ok',
    'OK',
    '--format',
    'compact'
  ]);
  return {
    approvalPackExists: Boolean(status.approvalPackExists),
    approvalPackParseOk: Boolean(status.approvalPackParseOk),
    selectedCandidate,
    targetPackExists: Boolean(status.targetPackExists),
    targetNext: status.nextAction?.id || resume.targetNext || '',
    humanAction: status.target?.operatorGuidance?.humanAction || resume.humanAction || status.nextAction?.id || '',
    automationBlocker: status.target?.operatorGuidance?.automationBlocker || resume.automationBlocker || '',
    captureBlocked: Boolean(status.target?.operatorGuidance?.captureBlocked ?? true),
    nextCommandOpensBrowser: Boolean(status.nextCommandOpensBrowser),
    nextCommandStartsCapture: Boolean(status.nextCommandStartsCapture),
    nextCommandRequiresOperatorApproval: Boolean(status.nextCommandRequiresOperatorApproval),
    nextCommandAgentMayRunUnattended: Boolean(status.nextCommandAgentMayRunUnattended),
    operatorApprovalSummaryScope: status.operatorApprovalSummaryScope || resume.operatorApprovalSummaryScope || 'real-external-auth-target-proof',
    operatorApprovalSummaryHumanAction: status.operatorApprovalSummaryHumanAction || resume.operatorApprovalSummaryHumanAction || status.target?.operatorGuidance?.humanAction || resume.humanAction || status.nextAction?.id || '',
    operatorApprovalSummaryRequiresOperatorOk: Boolean(status.operatorApprovalSummaryRequiresOperatorOk ?? resume.operatorApprovalSummaryRequiresOperatorOk ?? resume.operatorOkRequired ?? status.nextCommandRequiresOperatorApproval),
    operatorApprovalSummaryOperatorOkAccepted: Boolean(status.operatorApprovalSummaryOperatorOkAccepted ?? resume.operatorApprovalSummaryOperatorOkAccepted ?? resume.operatorOkAccepted),
    operatorApprovalSummaryMayOpenBrowser: Boolean(status.operatorApprovalSummaryMayOpenBrowser ?? resume.operatorApprovalSummaryMayOpenBrowser ?? status.nextCommandOpensBrowser ?? resume.plannedCommandOpensBrowser),
    operatorApprovalSummaryMayStartCapture: Boolean(status.operatorApprovalSummaryMayStartCapture ?? resume.operatorApprovalSummaryMayStartCapture ?? status.nextCommandStartsCapture ?? resume.plannedCommandStartsCapture),
    operatorApprovalSummaryReadsBrowserStorage: Boolean(status.operatorApprovalSummaryReadsBrowserStorage ?? resume.operatorApprovalSummaryReadsBrowserStorage),
    operatorApprovalSummaryReturnsPageContent: Boolean(status.operatorApprovalSummaryReturnsPageContent ?? resume.operatorApprovalSummaryReturnsPageContent),
    operatorApprovalSummaryAgentMustNotRunUnattended: Boolean(status.operatorApprovalSummaryAgentMustNotRunUnattended ?? resume.operatorApprovalSummaryAgentMustNotRunUnattended ?? status.nextCommandRequiresOperatorApproval ?? resume.operatorOkRequired),
    resumeStatus: resume.status || '',
    resumeReadyToRun: Boolean(resume.readyToRun),
    resumeOperatorOkRequired: Boolean(resume.operatorOkRequired),
    resumeOperatorOkAccepted: Boolean(resume.operatorOkAccepted),
    resumeAgentMayRunUnattended: false,
    resumePlannedCommandOpensBrowser: Boolean(resume.plannedCommandOpensBrowser),
    resumePlannedCommandStartsCapture: Boolean(resume.plannedCommandStartsCapture),
    statusCommand,
    preflightCommand,
    resumePreflightCommand,
    resumeProofPlanCommand,
    resumePlanCommand,
    resumeStatusCommand,
    resumeWatchCommand,
    resumeRunCommand,
    completionProofBundleWithAuditCommand: resume.completionProofBundleWithAuditCommand || command([
      'node',
      'src/cli.mjs',
      'completion-proof-bundle',
      '--candidate',
      selectedCandidate,
      '--include-compact-command-audit',
      '--write',
      '--out',
      'operator/completion-proof-bundle-latest.json',
      '--format',
      'compact'
    ]),
    agentProofCloseoutWriteCommand: resume.agentProofCloseoutWriteCommand || command([
      'node',
      'src/cli.mjs',
      'agent-proof-closeout',
      '--candidate',
      selectedCandidate,
      '--include-compact-command-audit',
      '--write',
      '--out',
      'operator/agent-proof-closeout-latest.json',
      '--format',
      'compact'
    ]),
    agentProofCloseoutStatusCommand: resume.agentProofCloseoutStatusCommand || command([
      'node',
      'src/cli.mjs',
      'agent-proof-closeout-status',
      '--in',
      'operator/agent-proof-closeout-latest.json',
      '--format',
      'compact'
    ]),
    objectiveCompletionStrictCommand: resume.objectiveCompletionStrictCommand || command([
      'node',
      'src/cli.mjs',
      'objective-completion-audit',
      '--strict',
      '--format',
      'compact'
    ])
  };
}

function compactAction(id) {
  return id ? `run-${id}` : 'wait-operator';
}

export async function buildObjectiveCompletionAudit(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const outputPath = options.write ? safeRunPath(rootDir, options.out || options.output) : '';
  const outputRelative = outputPath ? runsRelativePath(rootDir, outputPath) : '';
  const readiness = options.readiness || buildReadinessAudit({
    ...options,
    rootDir
  });
  const criteria = readiness.requirements.map(criterionFromRequirement);
  const remaining = criteria.filter((item) => !item.proved);
  const complete = Boolean(readiness.completeAgainstObjective && remaining.length === 0);
  const next = options.next || await buildObjectiveNext({
    ...options,
    rootDir,
    readiness
  });

  const nextAction = next.primaryAction || next.nextAction || null;
  const executionPolicy = await chooseAgentSafeCommand(rootDir, nextAction || {}, options);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const audit = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    objective: readiness.objective,
    safeMode: true,
    destructiveActionsIncluded: false,
    complete,
    status: complete ? 'complete' : 'incomplete',
    finalGate: {
      readinessComplete: Boolean(readiness.completeAgainstObjective),
      allCriteriaProved: remaining.length === 0,
      readyForLocalAuthenticatedDevelopment: Boolean(readiness.readyForLocalAuthenticatedDevelopment),
      remainingCount: remaining.length
    },
    criteria,
    remaining,
    nextAction,
    executionPolicy,
    agentProofStep: buildAgentProofStepHandoff(nextAction || {}, executionPolicy, options),
    targetApproval: await buildTargetApprovalSummary(rootDir, generatedAt, options),
    commands: {
      audit: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--format', 'compact']),
      auditStrict: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
      auditWrite: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--write', '--out', outputRelative || 'operator/objective-completion-audit-latest.json', '--format', 'compact']),
      auditStatus: command(['node', 'src/cli.mjs', 'objective-completion-audit-status', '--in', outputRelative || 'operator/objective-completion-audit-latest.json', '--format', 'compact']),
      auditWatch: command(['node', 'src/cli.mjs', 'objective-completion-audit-watch', '--run', '--in', outputRelative || 'operator/objective-completion-audit-latest.json', '--out', outputRelative || 'operator/objective-completion-audit-latest.json', '--format', 'compact'])
    }
  };
  if (outputPath) {
    writeJson(outputPath, audit);
    audit.outputPath = outputPath;
  }
  return audit;
}

export function buildObjectiveCompletionAuditStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputPath = safeRunPath(rootDir, options.in || options.input || 'operator/objective-completion-audit-latest.json');
  const nowMs = Number(options.nowMs || Date.now());
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const exists = fs.existsSync(inputPath);
  const saved = exists ? readJson(inputPath) : null;
  const parseOk = Boolean(saved && !saved.parseError);
  const age = ageSeconds(inputPath, nowMs);
  const stale = exists && age !== null && Number.isFinite(staleAfterSeconds) && staleAfterSeconds >= 0
    ? age > staleAfterSeconds
    : false;
  const inputRelative = runsRelativePath(rootDir, inputPath);
  const refreshCommand = command(['node', 'src/cli.mjs', 'objective-completion-audit', '--write', '--out', inputRelative, '--format', 'compact']);
  const strictCommand = command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']);
  const watchCommand = command(['node', 'src/cli.mjs', 'objective-completion-audit-watch', '--run', '--in', inputRelative, '--out', inputRelative, '--format', 'compact']);
  const targetApproval = parseOk ? saved.targetApproval || {} : {};
  const nextAction = parseOk ? saved.nextAction || {} : {};
  return {
    schemaVersion: 1,
    generatedAt: new Date(nowMs).toISOString(),
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    inputPath,
    exists,
    parseOk,
    parseError: saved?.parseError || '',
    stale,
    ageSeconds: age,
    staleAfterSeconds,
    savedComplete: Boolean(parseOk && saved.complete),
    savedStatus: parseOk ? saved.status || '' : '',
    readinessComplete: Boolean(parseOk && saved.finalGate?.readinessComplete),
    allCriteriaProved: Boolean(parseOk && saved.finalGate?.allCriteriaProved),
    remainingCount: parseOk ? saved.finalGate?.remainingCount ?? 0 : 0,
    remaining: parseOk && Array.isArray(saved.remaining) ? saved.remaining.map((item) => item.id).filter(Boolean) : [],
    readyForLocalAuthenticatedDevelopment: Boolean(parseOk && saved.finalGate?.readyForLocalAuthenticatedDevelopment),
    nextActionId: nextAction.id || '',
    nextStatus: nextAction.status || '',
    nextCommandRequiresOperatorApproval: Boolean(parseOk && nextCommandSafety(nextAction).requiresOperatorApproval),
    nextCommandAgentMayRunUnattended: Boolean(parseOk && nextCommandSafety(nextAction).agentMayRunUnattended),
    targetApprovalCandidate: targetApproval.selectedCandidate || '',
    targetApprovalResumeStatus: targetApproval.resumeStatus || '',
    targetApprovalResumeRequiresOperatorApproval: Boolean(targetApproval.resumeOperatorOkRequired),
    targetApprovalResumeAgentMayRunUnattended: Boolean(targetApproval.resumeAgentMayRunUnattended),
    targetApprovalResumeOpensBrowser: Boolean(targetApproval.resumePlannedCommandOpensBrowser),
    targetApprovalResumeStartsCapture: Boolean(targetApproval.resumePlannedCommandStartsCapture),
    operatorApprovalSummaryScope: targetApproval.operatorApprovalSummaryScope || '',
    operatorApprovalSummaryHumanAction: targetApproval.operatorApprovalSummaryHumanAction || '',
    operatorApprovalSummaryRequiresOperatorOk: Boolean(targetApproval.operatorApprovalSummaryRequiresOperatorOk),
    operatorApprovalSummaryOperatorOkAccepted: Boolean(targetApproval.operatorApprovalSummaryOperatorOkAccepted),
    operatorApprovalSummaryMayOpenBrowser: Boolean(targetApproval.operatorApprovalSummaryMayOpenBrowser),
    operatorApprovalSummaryMayStartCapture: Boolean(targetApproval.operatorApprovalSummaryMayStartCapture),
    operatorApprovalSummaryReadsBrowserStorage: Boolean(targetApproval.operatorApprovalSummaryReadsBrowserStorage),
    operatorApprovalSummaryReturnsPageContent: Boolean(targetApproval.operatorApprovalSummaryReturnsPageContent),
    operatorApprovalSummaryAgentMustNotRunUnattended: Boolean(targetApproval.operatorApprovalSummaryAgentMustNotRunUnattended),
    refreshNeeded: Boolean(!exists || !parseOk || stale),
    refreshCommand,
    watchCommand,
    strictCommand,
    agentSafeNextCommandId: !exists || !parseOk || stale ? 'objective-completion-audit-refresh' : 'objective-completion-audit-strict',
    agentSafeNextMayRunUnattended: true,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    next: !exists
      ? 'Write a fresh objective completion audit.'
      : !parseOk
        ? 'Refresh the objective completion audit; saved JSON could not be parsed.'
        : stale
          ? 'Refresh the stale objective completion audit.'
          : saved.complete
            ? 'Saved objective completion audit is complete; run strict live audit before closing the goal.'
            : 'Saved objective completion audit remains incomplete; continue the real external proof lane.'
  };
}

export function formatObjectiveCompletionAuditStatusCompact(status) {
  const lines = [
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${compactValue(status.ageSeconds)}`,
    `stale_after_seconds: ${compactValue(status.staleAfterSeconds)}`,
    `saved_status: ${compactValue(status.savedStatus)}`,
    `saved_complete: ${yesNo(status.savedComplete)}`,
    `readiness_complete: ${yesNo(status.readinessComplete)}`,
    `all_criteria_proved: ${yesNo(status.allCriteriaProved)}`,
    `remaining_count: ${compactValue(status.remainingCount)}`,
    `remaining: ${Array.isArray(status.remaining) && status.remaining.length ? status.remaining.join(',') : 'none'}`,
    `ready_for_local_authenticated_development: ${yesNo(status.readyForLocalAuthenticatedDevelopment)}`,
    `next: ${compactValue(status.nextActionId)}`,
    `next_status: ${compactValue(status.nextStatus)}`,
    `next_command_requires_operator_approval: ${yesNo(status.nextCommandRequiresOperatorApproval)}`,
    `next_command_agent_may_run_unattended: ${yesNo(status.nextCommandAgentMayRunUnattended)}`,
    `target_approval_candidate: ${compactValue(status.targetApprovalCandidate)}`,
    `target_approval_resume_status: ${compactValue(status.targetApprovalResumeStatus)}`,
    `target_approval_resume_requires_operator_approval: ${yesNo(status.targetApprovalResumeRequiresOperatorApproval)}`,
    `target_approval_resume_agent_may_run_unattended: ${yesNo(status.targetApprovalResumeAgentMayRunUnattended)}`,
    `target_approval_resume_opens_browser: ${yesNo(status.targetApprovalResumeOpensBrowser)}`,
    `target_approval_resume_starts_capture: ${yesNo(status.targetApprovalResumeStartsCapture)}`,
    `operator_approval_summary_scope: ${compactValue(status.operatorApprovalSummaryScope)}`,
    `operator_approval_summary_human_action: ${compactValue(status.operatorApprovalSummaryHumanAction)}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(status.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(status.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(status.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(status.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(status.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(status.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(status.operatorApprovalSummaryAgentMustNotRunUnattended)}`,
    `agent_safe_next_command_id: ${compactValue(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `message: ${compactValue(status.next)}`
  ];
  if (status.refreshCommand?.shell) lines.push(`refresh_command: ${status.refreshCommand.shell}`);
  if (status.watchCommand?.shell) lines.push(`watch_command: ${status.watchCommand.shell}`);
  if (status.strictCommand?.shell) lines.push(`strict_command: ${status.strictCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatObjectiveCompletionAuditWatchCompact(watch) {
  const after = watch.after || {};
  const lines = [
    `run_requested: ${yesNo(watch.runRequested)}`,
    `executed: ${yesNo(watch.executed)}`,
    `safe_mode: ${yesNo(watch.safeMode)}`,
    `opens_browser_now: ${yesNo(watch.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(watch.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(watch.readsBrowserStorage)}`,
    `secret_values_read: ${yesNo(watch.secretValuesRead)}`,
    `destructive_actions: ${yesNo(watch.destructiveActionsIncluded)}`,
    `after_exists: ${yesNo(after.exists)}`,
    `after_parse_ok: ${yesNo(after.parseOk)}`,
    `after_stale: ${yesNo(after.stale)}`,
    `after_saved_status: ${compactValue(after.savedStatus)}`,
    `after_saved_complete: ${yesNo(after.savedComplete)}`,
    `after_remaining_count: ${compactValue(after.remainingCount)}`,
    `after_remaining: ${Array.isArray(after.remaining) && after.remaining.length ? after.remaining.join(',') : 'none'}`,
    `after_agent_safe_next_command_id: ${compactValue(after.agentSafeNextCommandId)}`,
    `after_agent_safe_next_may_run_unattended: ${yesNo(after.agentSafeNextMayRunUnattended)}`,
    `after_agent_safe_next_opens_browser: ${yesNo(after.agentSafeNextOpensBrowser)}`,
    `after_agent_safe_next_starts_capture: ${yesNo(after.agentSafeNextStartsCapture)}`
  ];
  if (after.refreshCommand?.shell) lines.push(`refresh_command: ${after.refreshCommand.shell}`);
  if (after.strictCommand?.shell) lines.push(`strict_command: ${after.strictCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export async function buildObjectiveCompletionAuditWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputPath = safeRunPath(rootDir, options.in || options.input || 'operator/objective-completion-audit-latest.json');
  const outPath = safeRunPath(rootDir, options.out || options.output || runsRelativePath(rootDir, inputPath));
  const before = buildObjectiveCompletionAuditStatus({
    ...options,
    rootDir,
    in: runsRelativePath(rootDir, inputPath)
  });
  let executed = false;
  let refreshed = null;
  if (options.run && before.refreshNeeded) {
    refreshed = await buildObjectiveCompletionAudit({
      ...options,
      rootDir,
      write: true,
      out: runsRelativePath(rootDir, outPath)
    });
    executed = true;
  }
  const after = buildObjectiveCompletionAuditStatus({
    ...options,
    rootDir,
    in: runsRelativePath(rootDir, outPath)
  });
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    runRequested: Boolean(options.run),
    executed,
    before,
    refreshed,
    after
  };
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function criterionEvidenceValue(criteria = [], id, key) {
  const criterion = criteria.find((item) => item.id === id) || {};
  const evidence = Array.isArray(criterion.evidence) ? criterion.evidence : [];
  const prefix = `${key}=`;
  const found = evidence.find((item) => String(item).startsWith(prefix));
  return found ? found.slice(prefix.length) || 'none' : 'none';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

export function formatObjectiveCompletionAuditCompact(audit) {
  const rootDir = audit.rootDir || process.cwd();
  const nextAction = audit.nextAction || {};
  const executionPolicy = audit.executionPolicy || {};
  const targetApproval = audit.targetApproval || {};
  const nextSafety = nextCommandSafety(nextAction);
  const operatorApprovalCommand = preferredOperatorApprovalCommand(nextSafety, targetApproval);
  const remainingIds = (audit.remaining || []).map((item) => item.id).filter(Boolean);
  const missingArtifacts = Array.isArray(nextAction.missingArtifacts) ? nextAction.missingArtifacts : [];
  const missingArtifactIds = missingArtifacts.map((item) => item.id).filter(Boolean);
  const agentInterface = (audit.criteria || []).find((item) => item.id === 'agent-interface') || {};
  const lines = [
    `status: ${compactValue(audit.status)}`,
    `complete: ${yesNo(audit.complete)}`,
    `readiness_complete: ${yesNo(audit.finalGate?.readinessComplete)}`,
    `all_criteria_proved: ${yesNo(audit.finalGate?.allCriteriaProved)}`,
    `ready_for_local_authenticated_development: ${yesNo(audit.finalGate?.readyForLocalAuthenticatedDevelopment)}`,
    `remaining_count: ${audit.finalGate?.remainingCount ?? 0}`,
    `remaining: ${remainingIds.length ? remainingIds.join(',') : 'none'}`,
    `agent_interface_status: ${compactValue(agentInterface.status)}`,
    `agent_interface_agent_next: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentNext')}`,
    `agent_interface_mcp_agent_next: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpAgentNext')}`,
    `agent_interface_agent_next_proof_plan: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentNextProofPlan')}`,
    `agent_interface_agent_proof_checklist: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentProofChecklist')}`,
    `agent_interface_agent_proof_checklist_status: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentProofChecklistStatus')}`,
    `agent_interface_agent_proof_closeout: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentProofCloseout')}`,
    `agent_interface_agent_proof_closeout_status: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentProofCloseoutStatus')}`,
    `agent_interface_mcp_agent_proof_checklist: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpAgentProofChecklist')}`,
    `agent_interface_mcp_agent_proof_checklist_status: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpAgentProofChecklistStatus')}`,
    `agent_interface_mcp_agent_proof_closeout: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpAgentProofCloseout')}`,
    `agent_interface_mcp_agent_proof_closeout_status: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpAgentProofCloseoutStatus')}`,
    `agent_interface_agent_control_plane: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentControlPlane')}`,
    `agent_interface_mcp_agent_control_plane: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpAgentControlPlane')}`,
    `agent_interface_agent_control_plane_status: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentControlPlaneStatus')}`,
    `agent_interface_mcp_agent_control_plane_status: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpAgentControlPlaneStatus')}`,
    `agent_interface_agent_control_plane_watch: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'agentControlPlaneWatch')}`,
    `agent_interface_mcp_agent_control_plane_watch: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpAgentControlPlaneWatch')}`,
    `agent_interface_operator_runbook: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'operatorRunbook')}`,
    `agent_interface_mcp_operator_runbook: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpOperatorRunbook')}`,
    `agent_interface_mcp_handoff_compact: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpCompactHandoff')}`,
    `agent_interface_mcp_next_action_compact: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'mcpCompactNextActions')}`,
    `agent_interface_run_gate_audit: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'runGateAudit')}`,
    `agent_interface_run_gate_unguarded_agent_dangerous: ${criterionEvidenceValue(audit.criteria, 'agent-interface', 'runGateUnguardedAgentDangerous')}`,
    `next: ${compactValue(nextAction.id)}`,
    `next_status: ${compactValue(nextAction.status)}`,
    `target: ${compactValue(nextAction.target)}`,
    `operator_input: ${yesNo(nextAction.needsOperatorInput)}`,
    `next_command_opens_browser: ${yesNo(nextSafety.opensBrowser)}`,
    `next_command_starts_capture: ${yesNo(nextSafety.startsCapture)}`,
    `next_command_requires_operator_approval: ${yesNo(nextSafety.requiresOperatorApproval)}`,
    `next_command_agent_may_run_unattended: ${yesNo(nextSafety.agentMayRunUnattended)}`,
    `human_action: ${compactValue(nextAction.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(nextAction.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(nextAction.operatorGuidance?.captureBlocked)}`,
    `agent_safe_action: ${compactValue(executionPolicy.agentSafeAction)}`,
    `agent_safe_command_id: ${compactValue(executionPolicy.agentSafeCommandId)}`,
    `agent_safe_command_monitor_only: ${yesNo(executionPolicy.agentSafeCommandMonitorOnly)}`,
    `agent_safe_command_may_open_browser: ${yesNo(executionPolicy.agentSafeCommandMayOpenBrowser)}`,
    `agent_safe_command_starts_capture: ${yesNo(executionPolicy.agentSafeCommandStartsCapture)}`,
    `agent_safe_command_blocked_reason: ${compactValue(executionPolicy.agentSafeCommandBlockedReason)}`,
    `auth_watch_handoff_port: ${compactValue(executionPolicy.authWatchHandoffPort)}`,
    `auth_watch_handoff_port_reachable: ${executionPolicy.authWatchHandoffPortReachable === null || executionPolicy.authWatchHandoffPortReachable === undefined ? 'unknown' : yesNo(executionPolicy.authWatchHandoffPortReachable)}`,
    `next_artifact_action: ${compactValue(nextAction.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(nextAction.nextArtifactBlocker)}`,
    `artifact_command_covers: ${Array.isArray(nextAction.artifactCommandCovers) && nextAction.artifactCommandCovers.length ? nextAction.artifactCommandCovers.join(',') : 'none'}`,
    `missing_artifact_count: ${missingArtifacts.length}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`,
    `agent_proof_step_available: ${yesNo(audit.agentProofStep?.available)}`,
    `agent_proof_step_start_ready: ${yesNo(audit.agentProofStep?.startReadyToRun)}`,
    `agent_proof_step_start_blockers: ${audit.agentProofStep?.startBlockers?.length ? audit.agentProofStep.startBlockers.join(',') : 'none'}`,
    `agent_proof_step_opens_browser_now: ${yesNo(audit.agentProofStep?.opensBrowserNow)}`,
    `agent_proof_step_starts_capture_now: ${yesNo(audit.agentProofStep?.startsCaptureNow)}`,
    `target_approval_pack_exists: ${yesNo(targetApproval.approvalPackExists)}`,
    `target_approval_pack_parse_ok: ${yesNo(targetApproval.approvalPackParseOk)}`,
    `target_approval_candidate: ${compactValue(targetApproval.selectedCandidate)}`,
    `target_approval_target_pack_exists: ${yesNo(targetApproval.targetPackExists)}`,
    `target_approval_next: ${compactValue(targetApproval.targetNext)}`,
    `target_approval_human_action: ${compactValue(targetApproval.humanAction)}`,
    `target_approval_automation_blocker: ${compactValue(targetApproval.automationBlocker)}`,
    `target_approval_capture_blocked: ${yesNo(targetApproval.captureBlocked)}`,
    `target_approval_next_command_opens_browser: ${yesNo(targetApproval.nextCommandOpensBrowser)}`,
    `target_approval_next_command_starts_capture: ${yesNo(targetApproval.nextCommandStartsCapture)}`,
    `target_approval_next_command_requires_operator_approval: ${yesNo(targetApproval.nextCommandRequiresOperatorApproval)}`,
    `target_approval_next_command_agent_may_run_unattended: ${yesNo(targetApproval.nextCommandAgentMayRunUnattended)}`,
    `target_approval_resume_status: ${compactValue(targetApproval.resumeStatus)}`,
    `target_approval_resume_ready_to_run: ${yesNo(targetApproval.resumeReadyToRun)}`,
    `target_approval_resume_operator_ok_required: ${yesNo(targetApproval.resumeOperatorOkRequired)}`,
    `target_approval_resume_operator_ok_accepted: ${yesNo(targetApproval.resumeOperatorOkAccepted)}`,
    `target_approval_resume_agent_may_run_unattended: ${yesNo(targetApproval.resumeAgentMayRunUnattended)}`,
    `target_approval_resume_planned_opens_browser: ${yesNo(targetApproval.resumePlannedCommandOpensBrowser)}`,
    `target_approval_resume_planned_starts_capture: ${yesNo(targetApproval.resumePlannedCommandStartsCapture)}`,
    `operator_approval_summary_scope: ${compactValue(targetApproval.operatorApprovalSummaryScope)}`,
    `operator_approval_summary_human_action: ${compactValue(targetApproval.operatorApprovalSummaryHumanAction)}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(targetApproval.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(targetApproval.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(targetApproval.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(targetApproval.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(targetApproval.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(targetApproval.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(targetApproval.operatorApprovalSummaryAgentMustNotRunUnattended)}`,
    `secret_values_read: no`,
    `destructive_actions: ${yesNo(audit.destructiveActionsIncluded)}`
  ];
  if (executionPolicy.agentSafeCommand?.shell) lines.push(`agent_safe_command: ${commandDisplayShell(rootDir, executionPolicy.agentSafeCommand)}`);
  if (audit.agentProofStep?.planCommand?.shell) lines.push(`agent_proof_step_plan_command: ${commandDisplayShell(rootDir, audit.agentProofStep.planCommand)}`);
  if (audit.agentProofStep?.startCommand?.shell) lines.push(`agent_proof_step_start_command: ${commandDisplayShell(rootDir, audit.agentProofStep.startCommand)}`);
  if (audit.agentProofStep?.statusCommand?.shell) lines.push(`agent_proof_step_status_command: ${commandDisplayShell(rootDir, audit.agentProofStep.statusCommand)}`);
  if (targetApproval.statusCommand?.shell) lines.push(`target_approval_status_command: ${commandDisplayShell(rootDir, targetApproval.statusCommand)}`);
  if (targetApproval.preflightCommand?.shell) lines.push(`target_approval_preflight_command: ${commandDisplayShell(rootDir, targetApproval.preflightCommand)}`);
  if (targetApproval.resumePreflightCommand?.shell) lines.push(`target_approval_resume_preflight_command: ${commandDisplayShell(rootDir, targetApproval.resumePreflightCommand)}`);
  if (targetApproval.resumeProofPlanCommand?.shell) lines.push(`target_approval_resume_proof_plan_command: ${commandDisplayShell(rootDir, targetApproval.resumeProofPlanCommand)}`);
  if (targetApproval.resumePlanCommand?.shell) lines.push(`target_approval_resume_plan_command: ${commandDisplayShell(rootDir, targetApproval.resumePlanCommand)}`);
  if (targetApproval.resumeStatusCommand?.shell) lines.push(`target_approval_resume_status_command: ${commandDisplayShell(rootDir, targetApproval.resumeStatusCommand)}`);
  if (targetApproval.resumeWatchCommand?.shell) {
    lines.push('target_approval_resume_watch_opens_browser: no');
    lines.push('target_approval_resume_watch_starts_capture: no');
    lines.push('target_approval_resume_watch_requires_operator_approval: no');
    lines.push('target_approval_resume_watch_agent_may_run_unattended: yes');
    lines.push(`target_approval_resume_watch_command: ${commandDisplayShell(rootDir, targetApproval.resumeWatchCommand)}`);
  }
  if (targetApproval.resumeRunCommand?.shell) lines.push(`target_approval_resume_run_command: ${commandDisplayShell(rootDir, targetApproval.resumeRunCommand)}`);
  if (targetApproval.completionProofBundleWithAuditCommand?.shell) lines.push(`target_approval_completion_proof_bundle_with_audit_command: ${commandDisplayShell(rootDir, targetApproval.completionProofBundleWithAuditCommand)}`);
  if (targetApproval.agentProofCloseoutWriteCommand?.shell) lines.push(`target_approval_agent_proof_closeout_write_command: ${commandDisplayShell(rootDir, targetApproval.agentProofCloseoutWriteCommand)}`);
  if (targetApproval.agentProofCloseoutStatusCommand?.shell) lines.push(`target_approval_agent_proof_closeout_status_command: ${commandDisplayShell(rootDir, targetApproval.agentProofCloseoutStatusCommand)}`);
  if (targetApproval.objectiveCompletionStrictCommand?.shell) lines.push(`target_approval_objective_completion_strict_command: ${commandDisplayShell(rootDir, targetApproval.objectiveCompletionStrictCommand)}`);
  if (nextSafety.agentRunCommand?.shell) lines.push(`next_agent_run_command: ${commandDisplayShell(rootDir, nextSafety.agentRunCommand)}`);
  if (operatorApprovalCommand?.shell) lines.push(`next_operator_approval_command: ${commandDisplayShell(rootDir, operatorApprovalCommand)}`);
  if (nextSafety.agentRunCommand?.shell) lines.push(`command: ${commandDisplayShell(rootDir, nextSafety.agentRunCommand)}`);
  if (audit.remaining?.[0]?.next) lines.push(`first_remaining_next: ${compactValue(audit.remaining[0].next)}`);
  return `${lines.join('\n')}\n`;
}

export function formatObjectiveCompletionAuditMarkdown(audit) {
  const lines = [
    '# Secure Browser Agent Objective Completion Audit',
    '',
    `Generated: ${audit.generatedAt}`,
    `Root: ${audit.rootDir}`,
    `Complete: ${audit.complete ? 'yes' : 'no'}`,
    `Status: ${audit.status}`,
    `Safe mode: ${audit.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${audit.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Final Gate',
    '',
    `- Readiness complete: ${audit.finalGate.readinessComplete ? 'yes' : 'no'}`,
    `- All criteria proved: ${audit.finalGate.allCriteriaProved ? 'yes' : 'no'}`,
    `- Ready for local authenticated development: ${audit.finalGate.readyForLocalAuthenticatedDevelopment ? 'yes' : 'no'}`,
    `- Remaining count: ${audit.finalGate.remainingCount}`,
    '',
    '## Remaining',
    ''
  ];
  if (audit.remaining.length === 0) {
    lines.push('- none');
  } else {
    for (const item of audit.remaining) {
      lines.push(`- ${item.id}: ${item.status}${item.next ? ` - ${item.next}` : ''}`);
    }
  }
  lines.push('', '## Criteria', '');
  for (const item of audit.criteria) {
    lines.push(`### ${item.id}`, '');
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Verdict: ${item.verdict}`);
    lines.push(`- Requirement: ${item.requirement}`);
    for (const evidence of item.evidence) lines.push(`- Evidence: ${evidence}`);
    if (item.next) lines.push(`- Next: ${item.next}`);
    lines.push('');
  }
  if (audit.nextAction) {
    lines.push('## Next Action', '');
    lines.push(`- ID: ${audit.nextAction.id || 'none'}`);
    lines.push(`- Status: ${audit.nextAction.status || 'unknown'}`);
    lines.push(`- Label: ${audit.nextAction.label || 'none'}`);
    lines.push(`- Needs operator input: ${audit.nextAction.needsOperatorInput ? 'yes' : 'no'}`);
    if (audit.executionPolicy) {
      lines.push(`- Agent safe action: ${audit.executionPolicy.agentSafeAction || 'none'}`);
      lines.push(`- Agent safe command ID: ${audit.executionPolicy.agentSafeCommandId || 'none'}`);
      lines.push(`- Agent safe command monitor-only: ${audit.executionPolicy.agentSafeCommandMonitorOnly ? 'yes' : 'no'}`);
      lines.push(`- Agent safe command may open browser: ${audit.executionPolicy.agentSafeCommandMayOpenBrowser ? 'yes' : 'no'}`);
      lines.push(`- Agent safe command starts capture: ${audit.executionPolicy.agentSafeCommandStartsCapture ? 'yes' : 'no'}`);
      lines.push(`- Agent safe command blocked reason: ${audit.executionPolicy.agentSafeCommandBlockedReason || 'none'}`);
      lines.push(`- Auth-watch handoff port: ${audit.executionPolicy.authWatchHandoffPort || 'none'}`);
      lines.push(`- Auth-watch handoff port reachable: ${audit.executionPolicy.authWatchHandoffPortReachable === null || audit.executionPolicy.authWatchHandoffPortReachable === undefined ? 'unknown' : yesNo(audit.executionPolicy.authWatchHandoffPortReachable)}`);
      if (audit.executionPolicy.agentSafeCommand?.shell) {
        lines.push('', '### Agent Safe Command', '', '```bash');
        lines.push(audit.executionPolicy.agentSafeCommand.shell);
        lines.push('```');
      }
    }
    lines.push(`- Next artifact action: ${audit.nextAction.nextArtifactAction || 'none'}`);
    lines.push(`- Next artifact blocker: ${audit.nextAction.nextArtifactBlocker || 'none'}`);
    lines.push(`- Artifact command covers: ${audit.nextAction.artifactCommandCovers?.length ? audit.nextAction.artifactCommandCovers.join(', ') : 'none'}`);
    if (audit.nextAction.command?.shell) {
      lines.push('', '```bash');
      lines.push(audit.nextAction.command.shell);
      lines.push('```');
    }
    if (audit.nextAction.missingArtifacts?.length) {
      lines.push('', '### Missing Artifacts');
      for (const item of audit.nextAction.missingArtifacts) {
        const location = item.path ? ` (${item.path})` : '';
        lines.push(`- ${item.id}${location}: ${item.detail || item.kind || 'missing'}`);
      }
    }
    if (audit.nextAction.manualCommands?.length) {
      lines.push('', '### Manual Command Candidates');
      if (audit.nextAction.manualCommandCandidates?.length) {
        for (const candidate of audit.nextAction.manualCommandCandidates) {
          lines.push(`- ${candidate.id}: ${candidate.label || 'Manual command'}`);
          if (candidate.command?.shell) lines.push(`  \`${candidate.command.shell.replaceAll('`', '\\`')}\``);
        }
      } else {
        for (const manualCommand of audit.nextAction.manualCommands) {
          lines.push(`- \`${manualCommand.replaceAll('`', '\\`')}\``);
        }
      }
    }
    lines.push('');
  }
  if (audit.targetApproval) {
    lines.push('## Target Approval Resume', '');
    lines.push(`- Approval pack exists: ${yesNo(audit.targetApproval.approvalPackExists)}`);
    lines.push(`- Approval pack parse OK: ${yesNo(audit.targetApproval.approvalPackParseOk)}`);
    lines.push(`- Candidate: ${audit.targetApproval.selectedCandidate || 'none'}`);
    lines.push(`- Target pack exists: ${yesNo(audit.targetApproval.targetPackExists)}`);
    lines.push(`- Target next: ${audit.targetApproval.targetNext || 'none'}`);
    lines.push(`- Human action: ${audit.targetApproval.humanAction || 'none'}`);
    lines.push(`- Automation blocker: ${audit.targetApproval.automationBlocker || 'none'}`);
    lines.push(`- Capture blocked: ${yesNo(audit.targetApproval.captureBlocked)}`);
    lines.push(`- Resume status: ${audit.targetApproval.resumeStatus || 'none'}`);
    lines.push(`- Resume ready to run: ${yesNo(audit.targetApproval.resumeReadyToRun)}`);
    lines.push(`- Resume operator OK required: ${yesNo(audit.targetApproval.resumeOperatorOkRequired)}`);
    lines.push(`- Resume agent may run unattended: ${yesNo(audit.targetApproval.resumeAgentMayRunUnattended)}`);
    lines.push(`- Resume planned opens browser: ${yesNo(audit.targetApproval.resumePlannedCommandOpensBrowser)}`);
    lines.push(`- Resume planned starts capture: ${yesNo(audit.targetApproval.resumePlannedCommandStartsCapture)}`);
    for (const item of [
      ['Status Command', audit.targetApproval.statusCommand],
      ['Preflight Command', audit.targetApproval.preflightCommand],
      ['Resume Preflight Command', audit.targetApproval.resumePreflightCommand],
      ['Resume Proof Plan Command', audit.targetApproval.resumeProofPlanCommand],
      ['Resume Plan Command', audit.targetApproval.resumePlanCommand],
      ['Resume Status Command', audit.targetApproval.resumeStatusCommand],
      ['Resume Watch Command', audit.targetApproval.resumeWatchCommand],
      ['Resume Run Command', audit.targetApproval.resumeRunCommand]
    ]) {
      if (!item[1]?.shell) continue;
      lines.push('', `### Target Approval ${item[0]}`, '', '```bash');
      lines.push(item[1].shell);
      lines.push('```');
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
