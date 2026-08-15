import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildTargetBootstrapPlan } from './target-bootstrap-plan.mjs';
import { buildTargetCandidatePlan } from './target-candidate-plan.mjs';
import { buildTargetProofInventory } from './target-proof.mjs';
import { toPosixPath } from './output.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function shell(command) {
  return command?.shell || '';
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

function commandById(plan, id) {
  return plan.commands.find((item) => item.id === id)?.command || null;
}

function safeRunsPath(rootDir, value, fallback) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(value || fallback).replace(/^[/\\]+/, '');
  const filePath = path.resolve(runsRoot, relative);
  const insideRuns = filePath === runsRoot || filePath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid target approval pack output path: ${value}`);
  return filePath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  if (!(resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`))) {
    throw new Error(`invalid target approval pack path: ${filePath}`);
  }
  return toPosixPath(path.relative(runsRoot, resolved));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function fileSummary(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      bytes: stat.size,
      mtime: stat.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      bytes: 0,
      mtime: ''
    };
  }
}

function defaultRunner(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: Number(options.timeoutMs || 300000)
  });
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal || '',
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error ? result.error.message : ''
  };
}

function summarizeChild(result = {}) {
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const childStatus = stdout.match(/^status:\s*(.+)$/m)?.[1]?.trim()
    || stdout.match(/^Status:\s*(.+)$/m)?.[1]?.trim()
    || '';
  const childIncomplete = ['blocked', 'failed', 'timed-out', 'waiting-for-login'].includes(childStatus);
  return {
    ok: Boolean(result.ok) && !childIncomplete,
    status: result.status ?? null,
    signal: result.signal || '',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    childStatus,
    error: result.error || ''
  };
}

function resolveTargetDir(rootDir, pack) {
  const targetDir = pack?.bootstrap?.targetDir || `runs/target-packs/${pack?.selectedCandidate || 'github'}`;
  return path.isAbsolute(targetDir) ? path.resolve(targetDir) : path.resolve(rootDir, targetDir);
}

function findInventoryTarget(inventory, pack, targetDir) {
  const resolvedTargetDir = path.resolve(targetDir);
  return (inventory.targets || []).find((target) => path.resolve(target.dir) === resolvedTargetDir)
    || (inventory.targets || []).find((target) => target.target === pack.selectedCandidate)
    || null;
}

export function buildTargetApprovalPack(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const candidatePlan = buildTargetCandidatePlan({
    candidate: options.candidate || options.id || '',
    generatedAt: options.generatedAt
  });
  const candidate = candidatePlan.candidates.find((item) => item.id === candidatePlan.recommendedCandidate)
    || candidatePlan.candidates[0]
    || null;
  if (!candidate) throw new Error('target approval pack requires a known candidate');

  const bootstrapPlan = buildTargetBootstrapPlan({
    name: candidate.name,
    origin: candidate.origins.join(','),
    loginUrl: candidate.loginUrl,
    pageUrl: candidate.pageUrl,
    query: candidate.query,
    permissions: candidate.permissions.join(','),
    searchProvider: options.searchProvider || options['search-provider'] || 'duckduckgo'
  });
  const approvalOut = options.out || options.output || `operator/target-approval-${candidate.id}.json`;

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
    writesLocalStateNow: false,
    plannedCommandsIncludeLocalWrites: true,
    plannedCommandsRequireOperatorApproval: true,
    selectedCandidate: candidate.id,
    candidate: {
      id: candidate.id,
      label: candidate.label,
      description: candidate.description,
      origins: candidate.origins,
      loginUrl: candidate.loginUrl,
      pageUrl: candidate.pageUrl,
      query: candidate.query,
      permissions: candidate.permissions
    },
    bootstrap: {
      ready: bootstrapPlan.ready,
      blockers: bootstrapPlan.blockers,
      target: bootstrapPlan.target,
      targetDir: bootstrapPlan.targetDir,
      origins: bootstrapPlan.origins,
      loginUrl: bootstrapPlan.loginUrl,
      pageUrl: bootstrapPlan.pageUrl,
      commands: {
        scaffold: commandById(bootstrapPlan, 'scaffold-target'),
        secretRunSelect: commandById(bootstrapPlan, 'secret-run-select-login-capture'),
        loginCapture: commandById(bootstrapPlan, 'login-capture'),
        audit: commandById(bootstrapPlan, 'audit'),
        permissions: commandById(bootstrapPlan, 'permissions'),
        authCheck: commandById(bootstrapPlan, 'auth-check'),
        observe: commandById(bootstrapPlan, 'observe'),
        inspect: commandById(bootstrapPlan, 'inspect'),
        scrape: commandById(bootstrapPlan, 'scrape'),
        benchmark: commandById(bootstrapPlan, 'benchmark'),
        writeProof: commandById(bootstrapPlan, 'write-proof'),
        readiness: commandById(bootstrapPlan, 'readiness')
      }
    },
    operatorApproval: {
      required: true,
      approvalScope: 'create-target-pack-and-login-to-real-external-service-in-dedicated-profile',
      humanAction: 'approve-candidate-and-complete-login-in-dedicated-browser-profile',
      automationBlocker: 'operator-login-required',
      captureBlockedUntilAuthCheckOk: true
    },
    operatorApprovalSummaryScope: 'create-target-pack-and-login-to-real-external-service-in-dedicated-profile',
    operatorApprovalSummaryHumanAction: 'approve-candidate-and-complete-login-in-dedicated-browser-profile',
    operatorApprovalSummaryRequiresOperatorOk: true,
    operatorApprovalSummaryOperatorOkAccepted: false,
    operatorApprovalSummaryMayOpenBrowser: true,
    operatorApprovalSummaryMayStartCapture: true,
    operatorApprovalSummaryReadsBrowserStorage: false,
    operatorApprovalSummaryReturnsPageContent: false,
    operatorApprovalSummaryAgentMustNotRunUnattended: true,
    next: bootstrapPlan.ready
      ? 'Operator approves candidate, then run scaffold_command followed by secret_run_select_command or login_capture_command.'
      : 'Fix bootstrap blockers before asking for operator approval.',
    outputPath: null,
    writeCommand: {
      args: ['node', 'src/cli.mjs', 'target-approval-pack', '--candidate', candidate.id, '--write', '--out', approvalOut, '--format', 'compact'],
      shell: `'node' 'src/cli.mjs' 'target-approval-pack' '--candidate' '${candidate.id}' '--write' '--out' '${approvalOut}' '--format' 'compact'`
    }
  };
}

export function writeTargetApprovalPack(rootDir, pack, outPath = '') {
  const filePath = safeRunsPath(rootDir, outPath, `operator/target-approval-${pack.selectedCandidate || 'candidate'}.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  return runsRelativePath(rootDir, filePath);
}

export async function buildTargetApprovalStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const candidate = options.candidate || options.id || 'github';
  const inputRelative = options.in || options.input || options.out || `operator/target-approval-${candidate}.json`;
  const inputPath = safeRunsPath(rootDir, inputRelative, `operator/target-approval-${candidate}.json`);
  const input = fileSummary(inputPath);
  const savedPack = input.exists ? readJson(inputPath) : null;
  const pack = savedPack || buildTargetApprovalPack({
    ...options,
    candidate,
    rootDir
  });
  const targetDir = resolveTargetDir(rootDir, pack);
  const commandTargetDir = pack?.bootstrap?.targetDir || targetDir;
  const targetPack = fileSummary(targetDir);
  const inventory = await buildTargetProofInventory(rootDir, {
    ...options,
    realExternal: Boolean(options.realExternal || options['real-external'])
  });
  const target = findInventoryTarget(inventory, pack, targetDir);
  const nextAction = !input.exists
    ? {
      id: 'write-approval-pack',
      label: 'Persist the target approval pack under runs/ before handing off to another agent.',
      command: pack.writeCommand
    }
    : !savedPack
      ? {
        id: 'repair-approval-pack',
        label: 'Approval pack JSON could not be parsed; regenerate it.',
        command: pack.writeCommand
      }
      : !targetPack.exists
        ? {
          id: 'scaffold-target',
          label: 'Create the target pack after operator approval.',
          command: pack.bootstrap?.commands?.scaffold || null
        }
        : target?.nextAction || {
          id: 'inspect-target-proof-inventory',
          label: 'Inspect target proof inventory for the selected target.',
          command: null
        };
  const nextCommand = nextAction?.command || null;
  const nextCommandOpensBrowser = commandOpensBrowser(nextCommand);
  const nextCommandStartsCapture = commandStartsCapture(nextCommand);
  const nextCommandRequiresOperatorApproval = Boolean(
    pack.operatorApproval?.required
    || nextCommandOpensBrowser
    || nextCommandStartsCapture
  );
  const nextCommandAgentMayRunUnattended = Boolean(
    nextCommand?.args?.length
    && !nextCommandRequiresOperatorApproval
    && !nextCommandOpensBrowser
    && !nextCommandStartsCapture
  );
  const agentSafeCommandId = nextCommandAgentMayRunUnattended ? nextAction?.id || 'next-command' : 'none';
  const agentSafeCommand = nextCommandAgentMayRunUnattended ? nextCommand : null;
  const approvalPreflightCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-preflight',
    '--candidate',
    pack.selectedCandidate || candidate,
    '--real-external',
    '--format',
    'compact'
  ]);

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
    inputPath: runsRelativePath(rootDir, inputPath),
    input,
    approvalPackExists: input.exists,
    approvalPackParseOk: !input.exists || Boolean(savedPack),
    selectedCandidate: pack.selectedCandidate,
    candidate: pack.candidate,
    targetDir,
    targetPackExists: targetPack.exists,
    inventory: {
      complete: inventory.complete,
      realExternal: inventory.realExternal,
      summary: inventory.summary
    },
    target: target ? {
      target: target.target,
      dir: target.dir,
      externalOrigins: target.externalOrigins,
      profileLikelyAuthenticated: target.profileLikelyAuthenticated,
      authCheckOk: target.authCheckOk,
      authState: target.authState,
      authUsable: target.authUsable,
      proofReady: target.proofReady,
      missingOutputs: target.missingOutputs,
      missingArtifacts: target.missingArtifacts,
      nextAction: target.nextAction,
      operatorGuidance: target.operatorGuidance,
      blockers: target.blockers
    } : null,
    nextAction,
    nextCommandOpensBrowser,
    nextCommandStartsCapture,
    nextCommandRequiresOperatorApproval,
    nextCommandAgentMayRunUnattended,
    agentSafeCommandId,
    agentMayRunUnattended: nextCommandAgentMayRunUnattended,
    agentSafeCommand,
    agentSafeNextCommandId: 'target-approval-preflight',
    agentSafeNextMayRunUnattended: true,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand: approvalPreflightCommand,
    operatorCommandId: nextCommandAgentMayRunUnattended ? 'none' : nextAction?.id || 'none',
    operatorApprovalRequired: nextCommandRequiresOperatorApproval,
    operatorCommandOpensBrowser: nextCommandOpensBrowser,
    operatorCommandStartsCapture: nextCommandStartsCapture,
    operatorCommandAgentMayRunUnattended: false,
    operatorApprovalSummaryScope: pack.operatorApproval?.approvalScope || 'real-external-auth-target-proof',
    operatorApprovalSummaryHumanAction: pack.operatorApproval?.humanAction || nextAction?.label || '',
    operatorApprovalSummaryRequiresOperatorOk: nextCommandRequiresOperatorApproval,
    operatorApprovalSummaryOperatorOkAccepted: false,
    operatorApprovalSummaryMayOpenBrowser: nextCommandOpensBrowser || Boolean(pack.bootstrap?.commands?.loginCapture),
    operatorApprovalSummaryMayStartCapture: nextCommandStartsCapture || Boolean(pack.bootstrap?.commands?.loginCapture),
    operatorApprovalSummaryReadsBrowserStorage: false,
    operatorApprovalSummaryReturnsPageContent: false,
    operatorApprovalSummaryAgentMustNotRunUnattended: nextCommandRequiresOperatorApproval,
    commands: {
      writeApprovalPack: pack.writeCommand,
      scaffold: pack.bootstrap?.commands?.scaffold || null,
      secretRunSelect: pack.bootstrap?.commands?.secretRunSelect || null,
      loginCapture: pack.bootstrap?.commands?.loginCapture || null,
      proofPlan: command(['node', 'src/cli.mjs', 'target-proof-plan', commandTargetDir, '--real-external', '--format', 'compact']),
      waitAuthProofCapture: command([
        'node',
        'src/cli.mjs',
        'target-proof-capture',
        commandTargetDir,
        '--real-external',
        '--run',
        '--wait-auth',
        '--wait-auth-status-out',
        'wait-auth-status.json',
        '--completion-audit',
        '--format',
        'compact'
      ]),
      proofInventory: {
        args: ['node', 'src/cli.mjs', 'target-proof-inventory', '--real-external', '--format', 'compact'],
        shell: `'node' 'src/cli.mjs' 'target-proof-inventory' '--real-external' '--format' 'compact'`
      },
      approvalResumePlan: command([
        'node',
        'src/cli.mjs',
        'target-approval-resume',
        '--candidate',
        pack.selectedCandidate || candidate,
        '--real-external',
        '--format',
        'compact'
      ]),
      approvalResumeRun: command([
        'node',
        'src/cli.mjs',
        'target-approval-resume',
        '--candidate',
        pack.selectedCandidate || candidate,
        '--real-external',
        '--run',
        '--operator-ok',
        'OK',
        '--format',
        'compact'
      ]),
      agentPreflight: command([
	      'node',
	      'src/cli.mjs',
	      'agent-preflight',
	      '--candidate',
	      pack.selectedCandidate || candidate,
	      '--real-external',
	      '--format',
	      'compact'
	    ]),
      approvalPreflight: approvalPreflightCommand,
      readiness: pack.bootstrap?.commands?.readiness || null
    },
    next: nextAction.label
  };
}

function commandOpensBrowser(commandValue) {
  const args = commandValue?.args || [];
  return args.includes('target-login-capture')
    || args.includes('target-login')
    || (args.includes('target-handoff-resume') && args.includes('--open-login'));
}

function commandStartsCapture(commandValue) {
  const args = commandValue?.args || [];
  return args.includes('target-proof-capture')
    || args.includes('target-handoff-run')
    || args.includes('target-run')
    || args.includes('target-scrape')
    || (args.includes('target-handoff-resume') && args.includes('--wait-auth'));
}

function writeResumeResult(rootDir, result, outPath = '') {
  const outputPath = safeRunsPath(rootDir, outPath, 'operator/target-approval-resume-latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return runsRelativePath(rootDir, outputPath);
}

function resumeInputPath(rootDir, value = '') {
  return safeRunsPath(rootDir, value, 'operator/target-approval-resume-latest.json');
}

function ageSeconds(summary, nowMs = Date.now()) {
  if (!summary?.exists || !summary.mtime) return null;
  const mtimeMs = Date.parse(summary.mtime);
  if (!Number.isFinite(mtimeMs)) return null;
  return Math.max(0, Math.floor((nowMs - mtimeMs) / 1000));
}

function targetDirCommandArg(rootDir, targetDir) {
  if (!targetDir) return '';
  const text = String(targetDir);
  if (!path.isAbsolute(text)) return text;
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(text);
  if (resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    return toPosixPath(path.relative(resolvedRoot, resolvedTarget));
  }
  return text;
}

function savedProofPlanCommand(rootDir, saved) {
  const targetDirArg = targetDirCommandArg(rootDir, saved?.targetDir || '');
  if (targetDirArg) {
    return command(['node', 'src/cli.mjs', 'target-proof-plan', targetDirArg, '--real-external', '--format', 'compact']);
  }
  return saved?.proofPlanCommand || null;
}

function postApprovalCloseoutCommands(candidate = 'github') {
  return {
    completionProofBundleWithAudit: command([
      'node',
      'src/cli.mjs',
      'completion-proof-bundle',
      '--candidate',
      candidate,
      '--include-compact-command-audit',
      '--write',
      '--out',
      'operator/completion-proof-bundle-latest.json',
      '--format',
      'compact'
    ]),
    agentProofCloseoutWrite: command([
      'node',
      'src/cli.mjs',
      'agent-proof-closeout',
      '--candidate',
      candidate,
      '--include-compact-command-audit',
      '--write',
      '--out',
      'operator/agent-proof-closeout-latest.json',
      '--format',
      'compact'
    ]),
    agentProofCloseoutStatus: command([
      'node',
      'src/cli.mjs',
      'agent-proof-closeout-status',
      '--in',
      'operator/agent-proof-closeout-latest.json',
      '--format',
      'compact'
    ]),
    objectiveCompletionStrict: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact'])
  };
}

export function buildTargetApprovalResumeStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const filePath = resumeInputPath(rootDir, options.in || options.input || '');
  const input = fileSummary(filePath);
  const saved = input.exists ? readJson(filePath) : null;
  const parseOk = !input.exists || Boolean(saved);
  const age = ageSeconds(input, options.nowMs || Date.now());
  const stale = !input.exists || !parseOk || age === null || age > staleAfterSeconds;
  const selectedCandidate = saved?.selectedCandidate || options.candidate || 'github';
  const refreshCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-resume-watch',
    '--run',
    '--in',
    runsRelativePath(rootDir, filePath),
    '--out',
    runsRelativePath(rootDir, filePath),
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
  const proofPlanCommand = savedProofPlanCommand(rootDir, saved);
  const closeoutCommands = postApprovalCloseoutCommands(selectedCandidate);
  const agentSafeNextCommand = stale ? refreshCommand : (proofPlanCommand || preflightCommand);
  const agentSafeNextCommandId = stale
    ? 'target-approval-resume-refresh'
    : (proofPlanCommand ? 'target-proof-plan' : 'target-approval-preflight');
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
    inputPath: runsRelativePath(rootDir, filePath),
    exists: input.exists,
    parseOk,
    stale,
    ageSeconds: age,
    staleAfterSeconds,
    selectedCandidate,
    savedStatus: saved?.status || '',
    runRequested: Boolean(saved?.runRequested),
    readyToRun: Boolean(saved?.readyToRun),
    targetNext: saved?.targetNext || '',
    humanAction: saved?.humanAction || '',
    automationBlocker: saved?.automationBlocker || '',
    plannedCommandOpensBrowser: Boolean(saved?.plannedCommandOpensBrowser),
    plannedCommandStartsCapture: Boolean(saved?.plannedCommandStartsCapture),
    operatorOkRequired: saved?.operatorOkRequired !== false,
    operatorOkAccepted: Boolean(saved?.operatorOkAccepted),
    operatorApprovalSummaryScope: saved?.operatorApprovalSummaryScope || 'real-external-auth-target-proof',
    operatorApprovalSummaryHumanAction: saved?.operatorApprovalSummaryHumanAction || saved?.humanAction || '',
    operatorApprovalSummaryRequiresOperatorOk: saved?.operatorApprovalSummaryRequiresOperatorOk ?? (saved?.operatorOkRequired !== false),
    operatorApprovalSummaryOperatorOkAccepted: saved?.operatorApprovalSummaryOperatorOkAccepted ?? Boolean(saved?.operatorOkAccepted),
    operatorApprovalSummaryMayOpenBrowser: saved?.operatorApprovalSummaryMayOpenBrowser ?? Boolean(saved?.plannedCommandOpensBrowser),
    operatorApprovalSummaryMayStartCapture: saved?.operatorApprovalSummaryMayStartCapture ?? Boolean(saved?.plannedCommandStartsCapture),
    operatorApprovalSummaryReadsBrowserStorage: false,
    operatorApprovalSummaryReturnsPageContent: false,
    operatorApprovalSummaryAgentMustNotRunUnattended: saved?.operatorApprovalSummaryAgentMustNotRunUnattended ?? true,
    agentSafeNextCommandId,
    agentSafeNextMayRunUnattended: true,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand,
    refreshCommand,
    preflightCommand,
    proofPlanCommand,
    runCommand: saved?.runCommand || null,
    completionProofBundleWithAuditCommand: saved?.completionProofBundleWithAuditCommand || closeoutCommands.completionProofBundleWithAudit,
    agentProofCloseoutWriteCommand: saved?.agentProofCloseoutWriteCommand || closeoutCommands.agentProofCloseoutWrite,
    agentProofCloseoutStatusCommand: saved?.agentProofCloseoutStatusCommand || closeoutCommands.agentProofCloseoutStatus,
    objectiveCompletionStrictCommand: saved?.objectiveCompletionStrictCommand || closeoutCommands.objectiveCompletionStrict,
    outputPath: saved?.outputPath || ''
  };
}

export async function buildTargetApprovalResumeWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const input = buildTargetApprovalResumeStatus(options);
  const run = Boolean(options.run);
  const outPath = options.out || options.output || input.inputPath;
  const shouldRefresh = input.stale;
  const result = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    runRequested: run,
    inputPath: input.inputPath,
    outputPath: outPath,
    beforeExists: input.exists,
    beforeParseOk: input.parseOk,
    beforeStale: input.stale,
    executed: false,
    status: shouldRefresh ? 'refresh-required' : 'fresh',
    blockedReason: shouldRefresh && !run ? 'run-not-requested' : (!shouldRefresh ? 'saved-target-approval-resume-is-fresh' : ''),
    afterExists: input.exists,
    afterParseOk: input.parseOk,
    afterStale: input.stale,
    afterSavedStatus: input.savedStatus,
    afterTargetNext: input.targetNext,
    afterPlannedCommandOpensBrowser: input.plannedCommandOpensBrowser,
    afterPlannedCommandStartsCapture: input.plannedCommandStartsCapture
  };
  if (!shouldRefresh || !run) return result;

  const resume = await buildTargetApprovalResume({
    ...options,
    rootDir,
    candidate: options.candidate || input.selectedCandidate,
    realExternal: options.realExternal ?? options['real-external'] ?? true,
    run: false,
    write: true,
    out: outPath
  });
  const after = buildTargetApprovalResumeStatus({ ...options, rootDir, in: outPath });
  result.executed = true;
  result.status = 'refreshed';
  result.blockedReason = '';
  result.afterExists = after.exists;
  result.afterParseOk = after.parseOk;
  result.afterStale = after.stale;
  result.afterSavedStatus = resume.status || after.savedStatus;
  result.afterTargetNext = resume.targetNext || after.targetNext;
  result.afterPlannedCommandOpensBrowser = Boolean(resume.plannedCommandOpensBrowser);
  result.afterPlannedCommandStartsCapture = Boolean(resume.plannedCommandStartsCapture);
  return result;
}

export async function buildTargetApprovalResume(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const status = options.status || await buildTargetApprovalStatus({
    ...options,
    rootDir,
    realExternal: Boolean(options.realExternal || options['real-external'])
  });
  const selectedCommand = status.nextAction?.command || null;
  const run = Boolean(options.run);
  const operatorOk = String(options.operatorOk || options['operator-ok'] || '');
  const operatorOkRequired = true;
  const operatorOkAccepted = operatorOk === 'OK';
  const blockers = [
    !selectedCommand?.args?.length ? 'next-command-unavailable' : '',
    run && !operatorOkAccepted ? 'operator-ok-required' : ''
  ].filter(Boolean);
  const statusCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-status',
    '--candidate',
    status.selectedCandidate || 'github',
    ...(status.inventory?.realExternal ? ['--real-external'] : []),
    '--format',
    'compact'
  ]);
  const preflightCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-preflight',
    '--candidate',
    status.selectedCandidate || 'github',
    '--real-external',
    '--format',
    'compact'
  ]);
  const runCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-resume',
    '--candidate',
    status.selectedCandidate || 'github',
    ...(status.inventory?.realExternal ? ['--real-external'] : []),
    '--run',
    '--operator-ok',
    'OK',
    '--format',
    'compact'
  ]);
  const closeoutCommands = postApprovalCloseoutCommands(status.selectedCandidate || 'github');
  const result = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    runRequested: run,
    operatorOkRequired,
    operatorOkAccepted,
    status: blockers.length ? 'blocked' : (run ? 'running' : 'planned'),
    readyToRun: blockers.length === 0,
    selectedCandidate: status.selectedCandidate,
    targetDir: status.targetDir,
    targetNext: status.nextAction?.id || '',
    humanAction: status.target?.operatorGuidance?.humanAction || status.nextAction?.id || '',
    automationBlocker: status.target?.operatorGuidance?.automationBlocker || 'operator-approval-required',
    opensBrowserNow: Boolean(run && commandOpensBrowser(selectedCommand)),
    startsCaptureNow: Boolean(run && commandStartsCapture(selectedCommand)),
    plannedCommandOpensBrowser: commandOpensBrowser(selectedCommand),
    plannedCommandStartsCapture: commandStartsCapture(selectedCommand),
    operatorApprovalSummaryScope: 'real-external-auth-target-proof',
    operatorApprovalSummaryHumanAction: status.target?.operatorGuidance?.humanAction || status.nextAction?.id || '',
    operatorApprovalSummaryRequiresOperatorOk: operatorOkRequired,
    operatorApprovalSummaryOperatorOkAccepted: operatorOkAccepted,
    operatorApprovalSummaryMayOpenBrowser: commandOpensBrowser(selectedCommand),
    operatorApprovalSummaryMayStartCapture: commandStartsCapture(selectedCommand),
    operatorApprovalSummaryReadsBrowserStorage: false,
    operatorApprovalSummaryReturnsPageContent: false,
    operatorApprovalSummaryAgentMustNotRunUnattended: true,
    agentSafeNextCommandId: 'target-approval-preflight',
    agentSafeNextMayRunUnattended: true,
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextBlockedReason: run ? '' : 'operator-approval-required',
    agentSafeNextCommand: preflightCommand,
    command: selectedCommand,
    statusCommand,
    preflightCommand,
    proofPlanCommand: status.commands?.proofPlan || null,
    runCommand,
    completionProofBundleWithAuditCommand: closeoutCommands.completionProofBundleWithAudit,
    agentProofCloseoutWriteCommand: closeoutCommands.agentProofCloseoutWrite,
    agentProofCloseoutStatusCommand: closeoutCommands.agentProofCloseoutStatus,
    objectiveCompletionStrictCommand: closeoutCommands.objectiveCompletionStrict,
    child: null,
    blockers
  };

  if (!run || blockers.length) {
    if (options.write || options.out || options.output) {
      result.outputPath = writeResumeResult(rootDir, result, options.out || options.output || '');
    }
    return result;
  }

  const runner = options.runner || defaultRunner;
  result.child = summarizeChild(runner(selectedCommand.args, {
    cwd: rootDir,
    timeoutMs: options.timeoutMs || options['timeout-ms'] || 300000
  }));
  result.status = result.child.ok ? 'complete' : 'failed';
  result.readyToRun = false;
  if (options.write || options.out || options.output) {
    result.outputPath = writeResumeResult(rootDir, result, options.out || options.output || '');
  }
  return result;
}

export async function buildTargetApprovalPreflight(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const candidate = options.candidate || options.id || 'github';
  const realExternalStatus = options.realExternalStatus || await buildTargetApprovalStatus({
    ...options,
    rootDir,
    candidate,
    realExternal: true
  });
  const defaultStatus = options.defaultStatus || await buildTargetApprovalStatus({
    ...options,
    rootDir,
    candidate,
    realExternal: false
  });
  const resume = options.resume || await buildTargetApprovalResume({
    ...options,
    rootDir,
    candidate,
    status: realExternalStatus,
    run: false
  });
  const acceptedExternalProofs = realExternalStatus.inventory?.summary?.acceptedExternalProofs ?? 0;
  const complete = Boolean(realExternalStatus.inventory?.complete && acceptedExternalProofs > 0);
  const defaultModeWouldChangeNext = defaultStatus.nextAction?.id !== realExternalStatus.nextAction?.id
    || Boolean(defaultStatus.inventory?.realExternal) !== Boolean(realExternalStatus.inventory?.realExternal);
  const agentSafeCommand = realExternalStatus.nextCommandAgentMayRunUnattended
    ? realExternalStatus.nextAction?.command || null
    : null;
  const agentSafeCommandId = agentSafeCommand ? realExternalStatus.nextAction?.id || 'next-command' : 'none';
  const operatorCommand = realExternalStatus.commands?.approvalResumeRun || null;
  const nextActionId = complete ? 'complete' : (realExternalStatus.nextAction?.id || 'none');
  const proofPlanCommand = realExternalStatus.commands?.proofPlan || null;
  const agentSafeNextCommand = !complete ? proofPlanCommand : null;
  const approvalResumeWriteCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-resume',
    '--candidate',
    candidate,
    '--real-external',
    '--write',
    '--out',
    'operator/target-approval-resume-latest.json',
    '--format',
    'compact'
  ]);
  const approvalResumeStatusCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-resume-status',
    '--in',
    'operator/target-approval-resume-latest.json',
    '--format',
    'compact'
  ]);
  const approvalResumeWatchCommand = command([
    'node',
    'src/cli.mjs',
    'target-approval-resume-watch',
    '--run',
    '--in',
    'operator/target-approval-resume-latest.json',
    '--out',
    'operator/target-approval-resume-latest.json',
    '--candidate',
    candidate,
    '--real-external',
    '--format',
    'compact'
  ]);
  const closeoutCommands = postApprovalCloseoutCommands(candidate);
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
    candidate,
    targetDir: realExternalStatus.targetDir,
    complete,
    realExternalRequired: true,
    realExternalInventory: Boolean(realExternalStatus.inventory?.realExternal),
    defaultInventoryRealExternal: Boolean(defaultStatus.inventory?.realExternal),
    defaultModeWouldChangeNext,
    defaultModeNextAction: defaultStatus.nextAction?.id || '',
    nextAction: nextActionId,
    acceptedExternalProofs,
    targetPackExists: Boolean(realExternalStatus.targetPackExists),
    approvalPackExists: Boolean(realExternalStatus.approvalPackExists),
    approvalPackParseOk: Boolean(realExternalStatus.approvalPackParseOk),
    authState: realExternalStatus.target?.authState || '',
    authUsable: Boolean(realExternalStatus.target?.authUsable),
    captureBlocked: Boolean(realExternalStatus.target?.operatorGuidance?.captureBlocked ?? !complete),
    humanAction: complete ? 'none' : (realExternalStatus.target?.operatorGuidance?.humanAction || realExternalStatus.nextAction?.id || ''),
    automationBlocker: complete ? 'none' : (realExternalStatus.target?.operatorGuidance?.automationBlocker || 'operator-approval-required'),
    missingArtifacts: Array.isArray(realExternalStatus.target?.missingArtifacts) ? realExternalStatus.target.missingArtifacts : [],
    nextCommandOpensBrowser: Boolean(realExternalStatus.nextCommandOpensBrowser),
    nextCommandStartsCapture: Boolean(realExternalStatus.nextCommandStartsCapture),
    nextCommandRequiresOperatorApproval: Boolean(realExternalStatus.nextCommandRequiresOperatorApproval),
    nextCommandAgentMayRunUnattended: Boolean(realExternalStatus.nextCommandAgentMayRunUnattended),
    agentSafeCommandId,
    agentMayRunUnattended: Boolean(agentSafeCommand),
    agentSafeCommand,
    agentSafeNextCommandId: agentSafeNextCommand ? 'target-proof-plan' : 'none',
    agentSafeNextMayRunUnattended: Boolean(agentSafeNextCommand),
    agentSafeNextOpensBrowser: false,
    agentSafeNextStartsCapture: false,
    agentSafeNextReadsBrowserStorage: false,
    agentSafeNextReturnsPageContent: false,
    agentSafeNextCommand,
    operatorCommandId: complete ? 'none' : nextActionId,
    operatorApprovalRequired: !complete,
    operatorCommandOpensBrowser: Boolean(resume.plannedCommandOpensBrowser),
    operatorCommandStartsCapture: Boolean(resume.plannedCommandStartsCapture),
    operatorCommandAgentMayRunUnattended: false,
    operatorApprovalSummaryScope: 'real-external-auth-target-proof',
    operatorApprovalSummaryHumanAction: complete ? 'none' : (realExternalStatus.target?.operatorGuidance?.humanAction || realExternalStatus.nextAction?.id || ''),
    operatorApprovalSummaryRequiresOperatorOk: !complete,
    operatorApprovalSummaryOperatorOkAccepted: false,
    operatorApprovalSummaryMayOpenBrowser: Boolean(resume.plannedCommandOpensBrowser),
    operatorApprovalSummaryMayStartCapture: Boolean(resume.plannedCommandStartsCapture),
    operatorApprovalSummaryReadsBrowserStorage: false,
    operatorApprovalSummaryReturnsPageContent: false,
    operatorApprovalSummaryAgentMustNotRunUnattended: !complete,
    operatorCommand,
    agentPreflightCommand: command([
	      'node',
	      'src/cli.mjs',
	      'agent-preflight',
	      '--candidate',
	      candidate,
	      '--real-external',
	      '--format',
	      'compact'
	    ]),
    statusCommand: command([
      'node',
      'src/cli.mjs',
      'target-approval-preflight',
      '--candidate',
      candidate,
      '--real-external',
      '--format',
      'compact'
    ]),
    approvalStatusCommand: realExternalStatus.commands?.approvalResumePlan
      ? command(['node', 'src/cli.mjs', 'target-approval-status', '--candidate', candidate, '--real-external', '--format', 'compact'])
      : null,
    approvalResumePlanCommand: realExternalStatus.commands?.approvalResumePlan || null,
    approvalResumeWriteCommand,
    approvalResumeStatusCommand,
    approvalResumeWatchCommand,
    approvalResumeRunCommand: realExternalStatus.commands?.approvalResumeRun || null,
    proofPlanCommand,
    proofInventoryCommand: realExternalStatus.commands?.proofInventory || null,
    completionProofBundleWithAuditCommand: closeoutCommands.completionProofBundleWithAudit,
    agentProofCloseoutWriteCommand: closeoutCommands.agentProofCloseoutWrite,
    agentProofCloseoutStatusCommand: closeoutCommands.agentProofCloseoutStatus,
    objectiveCompletionStrictCommand: closeoutCommands.objectiveCompletionStrict,
    readinessCommand: realExternalStatus.commands?.readiness || null,
    next: complete
      ? 'Real external target proof is complete.'
      : 'Use only the real-external approval resume command after explicit operator OK; do not run default target-approval-status without --real-external for completion proof.'
  };
}

export function formatTargetApprovalPackCompact(pack) {
  const lines = [
    `safe_mode: ${yesNo(pack.safeMode)}`,
    `status_only: ${yesNo(pack.statusOnly)}`,
    `destructive_actions: ${yesNo(pack.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(pack.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(pack.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(pack.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(pack.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(pack.pageContentReturned)}`,
    `writes_local_state_now: ${yesNo(pack.writesLocalStateNow)}`,
    `planned_commands_include_local_writes: ${yesNo(pack.plannedCommandsIncludeLocalWrites)}`,
    `operator_approval_required: ${yesNo(pack.operatorApproval?.required)}`,
    `operator_approval_summary_scope: ${compact(pack.operatorApprovalSummaryScope)}`,
    `operator_approval_summary_human_action: ${compact(pack.operatorApprovalSummaryHumanAction)}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(pack.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(pack.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(pack.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(pack.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(pack.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(pack.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(pack.operatorApprovalSummaryAgentMustNotRunUnattended)}`,
    `selected_candidate: ${compact(pack.selectedCandidate)}`,
    `candidate_label: ${compact(pack.candidate?.label)}`,
    `target_dir: ${compact(pack.bootstrap?.targetDir)}`,
    `origins: ${(pack.bootstrap?.origins || []).join(',') || 'none'}`,
    `login_url_origin: ${pack.candidate?.loginUrl ? new URL(pack.candidate.loginUrl).origin : 'none'}`,
    `page_url_origin: ${pack.candidate?.pageUrl ? new URL(pack.candidate.pageUrl).origin : 'none'}`,
    `bootstrap_ready: ${yesNo(pack.bootstrap?.ready)}`,
    `blockers: ${(pack.bootstrap?.blockers || []).join(' | ') || 'none'}`,
    `human_action: ${compact(pack.operatorApproval?.humanAction)}`,
    `automation_blocker: ${compact(pack.operatorApproval?.automationBlocker)}`,
    `capture_blocked_until_auth_check_ok: ${yesNo(pack.operatorApproval?.captureBlockedUntilAuthCheckOk)}`
  ];
  if (shell(pack.bootstrap?.commands?.scaffold)) lines.push(`scaffold_command: ${shell(pack.bootstrap.commands.scaffold)}`);
  if (shell(pack.bootstrap?.commands?.secretRunSelect)) lines.push(`secret_run_select_command: ${shell(pack.bootstrap.commands.secretRunSelect)}`);
  if (shell(pack.bootstrap?.commands?.loginCapture)) lines.push(`login_capture_command: ${shell(pack.bootstrap.commands.loginCapture)}`);
  if (shell(pack.bootstrap?.commands?.authCheck)) lines.push(`auth_check_command: ${shell(pack.bootstrap.commands.authCheck)}`);
  if (shell(pack.bootstrap?.commands?.observe)) lines.push(`observe_command: ${shell(pack.bootstrap.commands.observe)}`);
  if (shell(pack.bootstrap?.commands?.inspect)) lines.push(`inspect_command: ${shell(pack.bootstrap.commands.inspect)}`);
  if (shell(pack.bootstrap?.commands?.scrape)) lines.push(`scrape_command: ${shell(pack.bootstrap.commands.scrape)}`);
  if (shell(pack.bootstrap?.commands?.benchmark)) lines.push(`benchmark_command: ${shell(pack.bootstrap.commands.benchmark)}`);
  if (shell(pack.bootstrap?.commands?.writeProof)) lines.push(`write_proof_command: ${shell(pack.bootstrap.commands.writeProof)}`);
  if (shell(pack.bootstrap?.commands?.readiness)) lines.push(`readiness_command: ${shell(pack.bootstrap.commands.readiness)}`);
  if (pack.outputPath) lines.push(`output_path: ${pack.outputPath}`);
  if (shell(pack.writeCommand)) lines.push(`write_command: ${shell(pack.writeCommand)}`);
  lines.push(`next: ${pack.next}`);
  return `${lines.join('\n')}\n`;
}

export function formatTargetApprovalStatusCompact(status) {
  const missingArtifacts = Array.isArray(status.target?.missingArtifacts) ? status.target.missingArtifacts : [];
  const missingArtifactIds = missingArtifacts.map((item) => item.id).filter(Boolean);
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `approval_pack: ${compact(status.inputPath)}`,
    `approval_pack_exists: ${yesNo(status.approvalPackExists)}`,
    `approval_pack_parse_ok: ${yesNo(status.approvalPackParseOk)}`,
    `selected_candidate: ${compact(status.selectedCandidate)}`,
    `target_dir: ${compact(status.targetDir)}`,
    `target_pack_exists: ${yesNo(status.targetPackExists)}`,
    `proof_inventory_complete: ${yesNo(status.inventory?.complete)}`,
    `real_external_inventory: ${yesNo(status.inventory?.realExternal)}`,
    `accepted_external_proofs: ${status.inventory?.summary?.acceptedExternalProofs ?? 0}`,
    `target_next: ${compact(status.nextAction?.id)}`,
    `human_action: ${compact(status.target?.operatorGuidance?.humanAction || status.nextAction?.id)}`,
    `automation_blocker: ${compact(status.target?.operatorGuidance?.automationBlocker || 'operator-approval-or-target-proof-required')}`,
    `capture_blocked: ${yesNo(status.target?.operatorGuidance?.captureBlocked ?? true)}`,
    `next_command_opens_browser: ${yesNo(status.nextCommandOpensBrowser)}`,
    `next_command_starts_capture: ${yesNo(status.nextCommandStartsCapture)}`,
    `next_command_requires_operator_approval: ${yesNo(status.nextCommandRequiresOperatorApproval)}`,
    `next_command_agent_may_run_unattended: ${yesNo(status.nextCommandAgentMayRunUnattended)}`,
    `agent_safe_command_id: ${compact(status.agentSafeCommandId)}`,
    `agent_may_run_unattended: ${yesNo(status.agentMayRunUnattended)}`,
    `agent_safe_next_command_id: ${compact(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`,
    `operator_command_id: ${compact(status.operatorCommandId)}`,
    `operator_approval_required: ${yesNo(status.operatorApprovalRequired)}`,
    `operator_command_opens_browser: ${yesNo(status.operatorCommandOpensBrowser)}`,
    `operator_command_starts_capture: ${yesNo(status.operatorCommandStartsCapture)}`,
    `operator_command_agent_may_run_unattended: ${yesNo(status.operatorCommandAgentMayRunUnattended)}`,
    `operator_approval_summary_scope: ${compact(status.operatorApprovalSummaryScope)}`,
    `operator_approval_summary_human_action: ${compact(status.operatorApprovalSummaryHumanAction)}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(status.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(status.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(status.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(status.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(status.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(status.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(status.operatorApprovalSummaryAgentMustNotRunUnattended)}`,
    `auth_state: ${compact(status.target?.authState)}`,
    `target_auth_usable: ${yesNo(status.target?.authUsable)}`,
    `proof_ready_target: ${yesNo(status.target?.proofReady)}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`
  ];
  if (shell(status.commands?.agentPreflight)) lines.push(`agent_preflight_command: ${shell(status.commands.agentPreflight)}`);
  if (shell(status.agentSafeCommand)) lines.push(`agent_safe_command: ${shell(status.agentSafeCommand)}`);
  if (shell(status.agentSafeNextCommand)) lines.push(`agent_safe_next_command: ${shell(status.agentSafeNextCommand)}`);
  if (shell(status.commands?.approvalPreflight)) lines.push(`approval_preflight_command: ${shell(status.commands.approvalPreflight)}`);
  if (shell(status.nextAction?.command)) lines.push(`next_command: ${shell(status.nextAction.command)}`);
  if (shell(status.commands?.writeApprovalPack)) lines.push(`write_approval_pack_command: ${shell(status.commands.writeApprovalPack)}`);
  if (shell(status.commands?.scaffold)) lines.push(`scaffold_command: ${shell(status.commands.scaffold)}`);
  if (shell(status.commands?.secretRunSelect)) lines.push(`secret_run_select_command: ${shell(status.commands.secretRunSelect)}`);
  if (shell(status.commands?.loginCapture)) lines.push(`login_capture_command: ${shell(status.commands.loginCapture)}`);
  if (shell(status.commands?.proofPlan)) lines.push(`proof_plan_command: ${shell(status.commands.proofPlan)}`);
  if (shell(status.commands?.waitAuthProofCapture)) lines.push(`wait_auth_proof_capture_command: ${shell(status.commands.waitAuthProofCapture)}`);
  if (shell(status.commands?.proofInventory)) lines.push(`proof_inventory_command: ${shell(status.commands.proofInventory)}`);
  if (shell(status.commands?.approvalResumePlan)) lines.push(`approval_resume_plan_command: ${shell(status.commands.approvalResumePlan)}`);
  if (shell(status.commands?.approvalResumeRun)) lines.push(`approval_resume_run_command: ${shell(status.commands.approvalResumeRun)}`);
  if (shell(status.commands?.readiness)) lines.push(`readiness_command: ${shell(status.commands.readiness)}`);
  lines.push(`next: ${status.next}`);
  return `${lines.join('\n')}\n`;
}

export function formatTargetApprovalResumeCompact(resume) {
  const lines = [
    `safe_mode: ${yesNo(resume.safeMode)}`,
    `destructive_actions: ${yesNo(resume.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(resume.secretValuesRead)}`,
    `reads_browser_storage: ${yesNo(resume.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(resume.pageContentReturned)}`,
    `run_requested: ${yesNo(resume.runRequested)}`,
    `operator_ok_required: ${yesNo(resume.operatorOkRequired)}`,
    `operator_ok_accepted: ${yesNo(resume.operatorOkAccepted)}`,
    `status: ${compact(resume.status)}`,
    `ready_to_run: ${yesNo(resume.readyToRun)}`,
    `selected_candidate: ${compact(resume.selectedCandidate)}`,
    `target_dir: ${compact(resume.targetDir)}`,
    `target_next: ${compact(resume.targetNext)}`,
    `human_action: ${compact(resume.humanAction)}`,
    `automation_blocker: ${compact(resume.automationBlocker)}`,
    `opens_browser_now: ${yesNo(resume.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(resume.startsCaptureNow)}`,
    `planned_command_opens_browser: ${yesNo(resume.plannedCommandOpensBrowser)}`,
    `planned_command_starts_capture: ${yesNo(resume.plannedCommandStartsCapture)}`,
    `operator_approval_summary_scope: ${compact(resume.operatorApprovalSummaryScope)}`,
    `operator_approval_summary_human_action: ${compact(resume.operatorApprovalSummaryHumanAction)}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(resume.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(resume.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(resume.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(resume.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(resume.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(resume.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(resume.operatorApprovalSummaryAgentMustNotRunUnattended)}`,
    `agent_safe_next_command_id: ${compact(resume.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(resume.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(resume.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(resume.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(resume.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(resume.agentSafeNextReturnsPageContent)}`,
    `agent_safe_next_blocked_reason: ${compact(resume.agentSafeNextBlockedReason)}`,
    `blockers: ${resume.blockers?.length ? resume.blockers.join(',') : 'none'}`
  ];
  if (resume.child) {
    lines.push(`child_ok: ${yesNo(resume.child.ok)}`);
    lines.push(`child_status: ${compact(resume.child.childStatus || resume.child.status)}`);
    lines.push(`child_stdout_bytes: ${resume.child.stdoutBytes ?? 0}`);
    lines.push(`child_stderr_bytes: ${resume.child.stderrBytes ?? 0}`);
    if (resume.child.error) lines.push(`child_error: ${compact(resume.child.error)}`);
  }
  if (resume.outputPath) lines.push(`output_path: ${resume.outputPath}`);
  if (shell(resume.command)) lines.push(`command: ${shell(resume.command)}`);
  if (shell(resume.agentSafeNextCommand)) lines.push(`agent_safe_next_command: ${shell(resume.agentSafeNextCommand)}`);
  if (shell(resume.statusCommand)) lines.push(`status_command: ${shell(resume.statusCommand)}`);
  if (shell(resume.preflightCommand)) lines.push(`preflight_command: ${shell(resume.preflightCommand)}`);
  if (shell(resume.proofPlanCommand)) lines.push(`proof_plan_command: ${shell(resume.proofPlanCommand)}`);
  if (shell(resume.runCommand)) lines.push(`run_command: ${shell(resume.runCommand)}`);
  if (shell(resume.completionProofBundleWithAuditCommand)) lines.push(`completion_proof_bundle_with_audit_command: ${shell(resume.completionProofBundleWithAuditCommand)}`);
  if (shell(resume.agentProofCloseoutWriteCommand)) lines.push(`agent_proof_closeout_write_command: ${shell(resume.agentProofCloseoutWriteCommand)}`);
  if (shell(resume.agentProofCloseoutStatusCommand)) lines.push(`agent_proof_closeout_status_command: ${shell(resume.agentProofCloseoutStatusCommand)}`);
  if (shell(resume.objectiveCompletionStrictCommand)) lines.push(`objective_completion_strict_command: ${shell(resume.objectiveCompletionStrictCommand)}`);
  return `${lines.join('\n')}\n`;
}

export function formatTargetApprovalResumeStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `input_path: ${compact(status.inputPath)}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `stale: ${yesNo(status.stale)}`,
    `age_seconds: ${status.ageSeconds ?? 'unknown'}`,
    `stale_after_seconds: ${status.staleAfterSeconds}`,
    `selected_candidate: ${compact(status.selectedCandidate)}`,
    `saved_status: ${compact(status.savedStatus)}`,
    `run_requested: ${yesNo(status.runRequested)}`,
    `ready_to_run: ${yesNo(status.readyToRun)}`,
    `target_next: ${compact(status.targetNext)}`,
    `human_action: ${compact(status.humanAction)}`,
    `automation_blocker: ${compact(status.automationBlocker)}`,
    `planned_command_opens_browser: ${yesNo(status.plannedCommandOpensBrowser)}`,
    `planned_command_starts_capture: ${yesNo(status.plannedCommandStartsCapture)}`,
    `operator_ok_required: ${yesNo(status.operatorOkRequired)}`,
    `operator_ok_accepted: ${yesNo(status.operatorOkAccepted)}`,
    `operator_approval_summary_scope: ${compact(status.operatorApprovalSummaryScope)}`,
    `operator_approval_summary_human_action: ${compact(status.operatorApprovalSummaryHumanAction)}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(status.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(status.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(status.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(status.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(status.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(status.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(status.operatorApprovalSummaryAgentMustNotRunUnattended)}`,
    `agent_safe_next_command_id: ${compact(status.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(status.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(status.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNextReturnsPageContent)}`
  ];
  if (shell(status.agentSafeNextCommand)) lines.push(`agent_safe_next_command: ${shell(status.agentSafeNextCommand)}`);
  if (shell(status.refreshCommand)) lines.push(`refresh_command: ${shell(status.refreshCommand)}`);
  if (shell(status.preflightCommand)) lines.push(`preflight_command: ${shell(status.preflightCommand)}`);
  if (shell(status.proofPlanCommand)) lines.push(`proof_plan_command: ${shell(status.proofPlanCommand)}`);
  if (shell(status.runCommand)) lines.push(`run_command: ${shell(status.runCommand)}`);
  if (shell(status.completionProofBundleWithAuditCommand)) lines.push(`completion_proof_bundle_with_audit_command: ${shell(status.completionProofBundleWithAuditCommand)}`);
  if (shell(status.agentProofCloseoutWriteCommand)) lines.push(`agent_proof_closeout_write_command: ${shell(status.agentProofCloseoutWriteCommand)}`);
  if (shell(status.agentProofCloseoutStatusCommand)) lines.push(`agent_proof_closeout_status_command: ${shell(status.agentProofCloseoutStatusCommand)}`);
  if (shell(status.objectiveCompletionStrictCommand)) lines.push(`objective_completion_strict_command: ${shell(status.objectiveCompletionStrictCommand)}`);
  return `${lines.join('\n')}\n`;
}

export function formatTargetApprovalResumeWatchCompact(watch) {
  const lines = [
    `safe_mode: ${yesNo(watch.safeMode)}`,
    `destructive_actions: ${yesNo(watch.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(watch.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(watch.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(watch.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(watch.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(watch.pageContentReturned)}`,
    `run_requested: ${yesNo(watch.runRequested)}`,
    `executed: ${yesNo(watch.executed)}`,
    `status: ${compact(watch.status)}`,
    `blocked_reason: ${compact(watch.blockedReason)}`,
    `input_path: ${compact(watch.inputPath)}`,
    `output_path: ${compact(watch.outputPath)}`,
    `before_exists: ${yesNo(watch.beforeExists)}`,
    `before_parse_ok: ${yesNo(watch.beforeParseOk)}`,
    `before_stale: ${yesNo(watch.beforeStale)}`,
    `after_exists: ${yesNo(watch.afterExists)}`,
    `after_parse_ok: ${yesNo(watch.afterParseOk)}`,
    `after_stale: ${yesNo(watch.afterStale)}`,
    `after_saved_status: ${compact(watch.afterSavedStatus)}`,
    `after_target_next: ${compact(watch.afterTargetNext)}`,
    `after_planned_command_opens_browser: ${yesNo(watch.afterPlannedCommandOpensBrowser)}`,
    `after_planned_command_starts_capture: ${yesNo(watch.afterPlannedCommandStartsCapture)}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatTargetApprovalPreflightCompact(preflight) {
  const missingArtifactIds = (preflight.missingArtifacts || []).map((item) => item.id).filter(Boolean);
  const lines = [
    `safe_mode: ${yesNo(preflight.safeMode)}`,
    `status_only: ${yesNo(preflight.statusOnly)}`,
    `destructive_actions: ${yesNo(preflight.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(preflight.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(preflight.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(preflight.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(preflight.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(preflight.pageContentReturned)}`,
    `complete: ${yesNo(preflight.complete)}`,
    `candidate: ${compact(preflight.candidate)}`,
    `target_dir: ${compact(preflight.targetDir)}`,
    `real_external_required: ${yesNo(preflight.realExternalRequired)}`,
    `real_external_inventory: ${yesNo(preflight.realExternalInventory)}`,
    `default_inventory_real_external: ${yesNo(preflight.defaultInventoryRealExternal)}`,
    `default_mode_would_change_next: ${yesNo(preflight.defaultModeWouldChangeNext)}`,
    `default_mode_next_action: ${compact(preflight.defaultModeNextAction)}`,
    `next_action: ${compact(preflight.nextAction)}`,
    `accepted_external_proofs: ${preflight.acceptedExternalProofs ?? 0}`,
    `target_pack_exists: ${yesNo(preflight.targetPackExists)}`,
    `approval_pack_exists: ${yesNo(preflight.approvalPackExists)}`,
    `approval_pack_parse_ok: ${yesNo(preflight.approvalPackParseOk)}`,
    `auth_state: ${compact(preflight.authState)}`,
    `auth_usable: ${yesNo(preflight.authUsable)}`,
    `capture_blocked: ${yesNo(preflight.captureBlocked)}`,
    `human_action: ${compact(preflight.humanAction)}`,
    `automation_blocker: ${compact(preflight.automationBlocker)}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`,
    `next_command_opens_browser: ${yesNo(preflight.nextCommandOpensBrowser)}`,
    `next_command_starts_capture: ${yesNo(preflight.nextCommandStartsCapture)}`,
    `next_command_requires_operator_approval: ${yesNo(preflight.nextCommandRequiresOperatorApproval)}`,
    `next_command_agent_may_run_unattended: ${yesNo(preflight.nextCommandAgentMayRunUnattended)}`,
    `agent_safe_command_id: ${compact(preflight.agentSafeCommandId)}`,
    `agent_may_run_unattended: ${yesNo(preflight.agentMayRunUnattended)}`,
    `agent_safe_next_command_id: ${compact(preflight.agentSafeNextCommandId)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(preflight.agentSafeNextMayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(preflight.agentSafeNextOpensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(preflight.agentSafeNextStartsCapture)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(preflight.agentSafeNextReadsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(preflight.agentSafeNextReturnsPageContent)}`,
    `operator_command_id: ${compact(preflight.operatorCommandId)}`,
    `operator_approval_required: ${yesNo(preflight.operatorApprovalRequired)}`,
    `operator_command_opens_browser: ${yesNo(preflight.operatorCommandOpensBrowser)}`,
    `operator_command_starts_capture: ${yesNo(preflight.operatorCommandStartsCapture)}`,
    `operator_command_agent_may_run_unattended: ${yesNo(preflight.operatorCommandAgentMayRunUnattended)}`,
    `operator_approval_summary_scope: ${compact(preflight.operatorApprovalSummaryScope)}`,
    `operator_approval_summary_human_action: ${compact(preflight.operatorApprovalSummaryHumanAction)}`,
    `operator_approval_summary_requires_operator_ok: ${yesNo(preflight.operatorApprovalSummaryRequiresOperatorOk)}`,
    `operator_approval_summary_operator_ok_accepted: ${yesNo(preflight.operatorApprovalSummaryOperatorOkAccepted)}`,
    `operator_approval_summary_may_open_browser: ${yesNo(preflight.operatorApprovalSummaryMayOpenBrowser)}`,
    `operator_approval_summary_may_start_capture: ${yesNo(preflight.operatorApprovalSummaryMayStartCapture)}`,
    `operator_approval_summary_reads_browser_storage: ${yesNo(preflight.operatorApprovalSummaryReadsBrowserStorage)}`,
    `operator_approval_summary_returns_page_content: ${yesNo(preflight.operatorApprovalSummaryReturnsPageContent)}`,
    `operator_approval_summary_agent_must_not_run_unattended: ${yesNo(preflight.operatorApprovalSummaryAgentMustNotRunUnattended)}`
  ];
  if (shell(preflight.agentPreflightCommand)) lines.push(`agent_preflight_command: ${shell(preflight.agentPreflightCommand)}`);
  if (shell(preflight.agentSafeCommand)) lines.push(`agent_safe_command: ${shell(preflight.agentSafeCommand)}`);
  if (shell(preflight.agentSafeNextCommand)) lines.push(`agent_safe_next_command: ${shell(preflight.agentSafeNextCommand)}`);
  if (shell(preflight.operatorCommand)) lines.push(`operator_command: ${shell(preflight.operatorCommand)}`);
  if (shell(preflight.statusCommand)) lines.push(`status_command: ${shell(preflight.statusCommand)}`);
  if (shell(preflight.approvalStatusCommand)) lines.push(`approval_status_command: ${shell(preflight.approvalStatusCommand)}`);
  if (shell(preflight.approvalResumePlanCommand)) lines.push(`approval_resume_plan_command: ${shell(preflight.approvalResumePlanCommand)}`);
  if (shell(preflight.approvalResumeWriteCommand)) lines.push(`approval_resume_write_command: ${shell(preflight.approvalResumeWriteCommand)}`);
  if (shell(preflight.approvalResumeStatusCommand)) lines.push(`approval_resume_status_command: ${shell(preflight.approvalResumeStatusCommand)}`);
  if (shell(preflight.approvalResumeWatchCommand)) lines.push(`approval_resume_watch_command: ${shell(preflight.approvalResumeWatchCommand)}`);
  if (shell(preflight.approvalResumeRunCommand)) lines.push(`approval_resume_run_command: ${shell(preflight.approvalResumeRunCommand)}`);
  if (shell(preflight.proofPlanCommand)) lines.push(`proof_plan_command: ${shell(preflight.proofPlanCommand)}`);
  if (shell(preflight.proofInventoryCommand)) lines.push(`proof_inventory_command: ${shell(preflight.proofInventoryCommand)}`);
  if (shell(preflight.completionProofBundleWithAuditCommand)) lines.push(`completion_proof_bundle_with_audit_command: ${shell(preflight.completionProofBundleWithAuditCommand)}`);
  if (shell(preflight.agentProofCloseoutWriteCommand)) lines.push(`agent_proof_closeout_write_command: ${shell(preflight.agentProofCloseoutWriteCommand)}`);
  if (shell(preflight.agentProofCloseoutStatusCommand)) lines.push(`agent_proof_closeout_status_command: ${shell(preflight.agentProofCloseoutStatusCommand)}`);
  if (shell(preflight.objectiveCompletionStrictCommand)) lines.push(`objective_completion_strict_command: ${shell(preflight.objectiveCompletionStrictCommand)}`);
  if (shell(preflight.readinessCommand)) lines.push(`readiness_command: ${shell(preflight.readinessCommand)}`);
  lines.push(`next: ${preflight.next}`);
  return `${lines.join('\n')}\n`;
}

export function formatTargetApprovalPackMarkdown(pack) {
  const lines = [
    '# Secure Browser Agent Target Approval Pack',
    '',
    `Generated: ${pack.generatedAt}`,
    `Selected candidate: ${pack.selectedCandidate}`,
    `Safe mode: ${yesNo(pack.safeMode)}`,
    `Opens browser now: ${yesNo(pack.opensBrowserNow)}`,
    `Starts capture now: ${yesNo(pack.startsCaptureNow)}`,
    `Operator approval required: ${yesNo(pack.operatorApproval?.required)}`,
    '',
    '## Candidate',
    '',
    `- Label: ${pack.candidate.label}`,
    `- Origins: ${pack.candidate.origins.join(', ')}`,
    `- Login URL: ${pack.candidate.loginUrl}`,
    `- Page URL: ${pack.candidate.pageUrl}`,
    `- Target dir: ${pack.bootstrap.targetDir}`,
    '',
    '## Commands',
    ''
  ];
  for (const [id, item] of Object.entries(pack.bootstrap.commands)) {
    if (!item?.shell) continue;
    lines.push(`### ${id}`, '', '```bash', item.shell, '```', '');
  }
  lines.push('## Next', '', `- ${pack.next}`, '');
  return `${lines.join('\n')}\n`;
}
