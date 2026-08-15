import net from 'node:net';
import path from 'node:path';
import { buildLightpandaDoctor } from './lightpanda-doctor.mjs';
import { buildReadinessAudit } from './readiness-audit.mjs';
import { buildRegularChromeStatus } from './regular-chrome-refresh.mjs';
import { buildStartCommandCandidates, compactKey } from './start-commands.mjs';
import { buildTargetProofNext } from './target-proof.mjs';
import { buildTargetCandidatePlan } from './target-candidate-plan.mjs';
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

async function probeTcpPort(port, timeoutMs = 150) {
  if (!port) return null;
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: Number(port) });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function requirement(readiness, id) {
  return readiness.requirements.find((item) => item.id === id) || null;
}

function loginCaptureCommand(loginCommand) {
  const args = loginCommand?.args;
  if (!Array.isArray(args)) return null;
  const loginIndex = args.indexOf('target-login');
  const targetDir = loginIndex >= 0 ? args[loginIndex + 1] : '';
  if (!targetDir) return null;
  return command([
    'node',
    'src/cli.mjs',
    'target-login-capture',
    targetDir,
    ...(args.includes('--real-external') ? ['--real-external'] : []),
    '--handoff-out',
    'operator-handoff.json',
    '--wait-auth-status-out',
    'wait-auth-status.json',
    ...(args.includes('--real-external') ? ['--completion-audit'] : []),
    '--format',
    'markdown'
  ]);
}

function openOnlyLoginCaptureCommand(loginCapture) {
  if (!loginCapture?.args?.length) return null;
  return command([
    ...loginCapture.args.slice(0, -2),
    '--open-only',
    ...loginCapture.args.slice(-2)
  ]);
}

function completionAuditLoginCaptureCommand(commandValue) {
  const args = commandValue?.args || [];
  if (!Array.isArray(args)
    || !args.includes('target-login-capture')
    || !args.includes('--real-external')
    || args.includes('--completion-audit')) {
    return commandValue;
  }
  const formatIndex = args.indexOf('--format');
  const nextArgs = formatIndex >= 0
    ? [...args.slice(0, formatIndex), '--completion-audit', ...args.slice(formatIndex)]
    : [...args, '--completion-audit'];
  return command(nextArgs);
}

function durableHandoffRunCommand(commandValue) {
  const args = commandValue?.args || [];
  if (!Array.isArray(args) || !args.includes('target-handoff-run') || args.includes('--out')) {
    return commandValue;
  }
  const formatIndex = args.indexOf('--format');
  const outputArgs = ['--out', 'handoff-run-latest.json'];
  const nextArgs = formatIndex >= 0
    ? [...args.slice(0, formatIndex), ...outputArgs, ...args.slice(formatIndex)]
    : [...args, ...outputArgs];
  return command(nextArgs);
}

function handoffResumeCommand(commandValue) {
  const args = commandValue?.args || [];
  if (!Array.isArray(args)) return null;
  if (args.includes('target-handoff-resume')) return commandValue;
  if (!args.includes('target-handoff-run')) return null;
  const index = args.indexOf('target-handoff-run');
  const targetDir = args[index + 1] || '';
  if (!targetDir) return null;
  return command([
    'node',
    'src/cli.mjs',
    'target-handoff-resume',
    targetDir,
    '--handoff',
    argAfter(args, '--handoff') || 'operator-handoff.json',
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

function loginCaptureWaitCommand(handoffCommand) {
  const args = handoffCommand?.args || [];
  const handoffIndex = Array.isArray(args)
    ? Math.max(args.indexOf('target-handoff-run'), args.indexOf('target-handoff-resume'))
    : -1;
  const targetDir = handoffIndex >= 0 ? args[handoffIndex + 1] : '';
  if (!targetDir) return null;
  return command([
    'node',
    'src/cli.mjs',
    'target-login-capture',
    targetDir,
    '--real-external',
    '--handoff-out',
    'operator-handoff.json',
    '--wait-auth-status-out',
    'wait-auth-status.json',
    '--completion-audit',
    '--format',
    'markdown'
  ]);
}

function monitorArgs(options = {}) {
  return [
    ...(options.monitorTimeoutMs ? ['--timeout-ms', String(options.monitorTimeoutMs)] : []),
    ...(options.monitorIntervalMs ? ['--interval-ms', String(options.monitorIntervalMs)] : [])
  ];
}

function handoffMonitorArgs(options = {}) {
  return [
    ...(options.monitorTimeoutMs ? ['--monitor-timeout-ms', String(options.monitorTimeoutMs)] : []),
    ...(options.monitorIntervalMs ? ['--monitor-interval-ms', String(options.monitorIntervalMs)] : [])
  ];
}

function authWatchCommand(targetNext, options = {}) {
  if (options.handoffAuthCheckPortReachable === false) return null;
  const targetDir = targetNext?.target?.dir || '';
  const handoffPath = targetNext?.target?.operatorHandoff ? 'operator-handoff.json' : '';
  if (!targetDir || !handoffPath) return null;
  return command([
    'node',
    'src/cli.mjs',
    'target-auth-watch',
    targetDir,
    '--real-external',
    '--handoff',
    handoffPath,
    '--status-out',
    'auth-watch-status.json',
    ...monitorArgs(options),
    ...(options.monitorTimeoutMs ? [] : ['--timeout-ms', '300000']),
    ...(options.monitorIntervalMs ? [] : ['--interval-ms', '5000']),
    '--format',
    'compact'
  ]);
}

function handoffResumeWatchCommand(targetNext, options = {}) {
  if (options.handoffAuthCheckPortReachable === false) return null;
  const targetDir = targetNext?.target?.dir || '';
  const handoffPath = targetNext?.target?.operatorHandoff ? 'operator-handoff.json' : '';
  if (!targetDir || !handoffPath) return null;
  return command([
    'node',
    'src/cli.mjs',
    'target-handoff-resume-watch',
    targetDir,
    '--handoff',
    handoffPath,
    ...(options.run ? ['--run'] : []),
    ...handoffMonitorArgs(options),
    '--format',
    'compact'
  ]);
}

function operatorGuidance(targetNext) {
  const guidance = targetNext?.target?.operatorGuidance;
  if (!guidance || typeof guidance !== 'object') return null;
  return {
    humanAction: guidance.humanAction || 'none',
    automationBlocker: guidance.automationBlocker || 'none',
    captureBlocked: Boolean(guidance.captureBlocked)
  };
}

function deriveArtifactAction(targetNext) {
  const target = targetNext?.target || {};
  const missingArtifacts = Array.isArray(target.missingArtifacts) ? target.missingArtifacts : [];
  const ids = new Set(missingArtifacts.map((item) => item.id).filter(Boolean));
  const outputCount = missingArtifacts.filter((item) => item.kind === 'output').length;
  const actionId = targetNext?.nextAction?.id || '';
  const captureAction = ['handoff-resume', 'login-capture', 'capture', 'handoff-capture'].includes(actionId);

  if (ids.size === 0) {
    return {
      nextArtifactAction: 'none',
      nextArtifactBlocker: 'none',
      artifactCommandCovers: []
    };
  }
  if (ids.has('auth-check') && !target.authCheckOk) {
    return {
      nextArtifactAction: captureAction ? 'wait-auth-then-capture-proof' : 'prove-auth-check',
      nextArtifactBlocker: 'auth-check-not-ok',
      artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof']
    };
  }
  if (outputCount > 0 || !target.benchmarkOk || ids.has('benchmark')) {
    return {
      nextArtifactAction: captureAction ? 'run-proof-capture' : 'prepare-proof-capture',
      nextArtifactBlocker: 'none',
      artifactCommandCovers: ['observe', 'inspect', 'scrape', 'benchmark', 'target-proof']
    };
  }
  if (ids.has('target-proof')) {
    return {
      nextArtifactAction: actionId === 'write-proof' ? 'write-target-proof' : 'prepare-target-proof',
      nextArtifactBlocker: 'none',
      artifactCommandCovers: ['target-proof']
    };
  }
  return {
    nextArtifactAction: 'review-missing-artifacts',
    nextArtifactBlocker: 'missing-proof-artifacts',
    artifactCommandCovers: Array.from(ids)
  };
}

function argAfter(args, flag) {
  const index = Array.isArray(args) ? args.indexOf(flag) : -1;
  return index >= 0 ? args[index + 1] || '' : '';
}

function targetAction(targetNext, options = {}) {
  const artifactAction = deriveArtifactAction(targetNext);
  const targetDir = targetNext?.target?.dir || '';
  const startCommandCandidates = buildStartCommandCandidates({
    targetDir,
    candidate: targetNext?.target?.target || 'github',
    realExternal: Boolean(targetDir),
    includeBootstrap: !targetDir,
    regularChromeStatus: options.regularChromeStatus
  });
  if (targetNext.complete) {
    return {
      id: 'target-proof-complete',
      requirementId: 'real-external-auth-target',
      priority: 90,
      status: 'satisfied',
      label: 'Accepted real external target proof already exists',
      writesLocalState: false,
      needsOperatorInput: false,
      command: null,
      startCommandCandidates,
      blockers: [],
      ...artifactAction
    };
  }

  if (targetNext.nextAction?.command) {
    const guidance = operatorGuidance(targetNext);
    const loginCapture = targetNext.nextAction.id === 'login'
      ? completionAuditLoginCaptureCommand(loginCaptureCommand(targetNext.nextAction.command))
      : targetNext.nextAction.id === 'login-capture'
      ? completionAuditLoginCaptureCommand(targetNext.nextAction.command)
      : null;
    const openOnlyLoginCapture = openOnlyLoginCaptureCommand(loginCapture);
    const isHandoffAction = ['handoff-capture', 'handoff-resume'].includes(targetNext.nextAction.id);
    const handoffLoginCaptureWait = isHandoffAction
      ? loginCaptureWaitCommand(targetNext.nextAction.command)
      : null;
    const handoffResume = isHandoffAction
      ? handoffResumeCommand(targetNext.nextAction.command)
      : null;
    const handoffAuthWatch = isHandoffAction
      ? authWatchCommand(targetNext, options)
      : null;
    const handoffResumeWatch = isHandoffAction
      ? handoffResumeWatchCommand(targetNext, { ...options, run: true })
      : null;
    const manualCommandCandidates = [
      handoffResumeWatch
        ? {
            id: 'handoff-resume-watch',
            label: 'Run the no-open resume watcher: monitor auth now, then capture proof only after saved auth is ready',
            command: handoffResumeWatch
          }
        : null,
      handoffAuthWatch
        ? {
            id: 'auth-watch',
            label: 'Poll the dedicated login browser auth-check without starting proof capture',
            command: handoffAuthWatch
          }
        : null,
      openOnlyLoginCapture
        ? {
            id: 'open-only',
            label: 'Open the dedicated login browser and return without running capture',
            command: openOnlyLoginCapture
          }
        : null,
      handoffLoginCaptureWait
        ? {
            id: 'login-capture-wait',
            label: 'Open the dedicated login browser, wait for auth-check, then capture proof',
            command: handoffLoginCaptureWait
          }
        : null
    ].filter(Boolean);
    return {
      id: handoffResume ? 'target-handoff-resume' : (loginCapture ? 'target-login-capture' : `target-${targetNext.nextAction.id}`),
      requirementId: 'real-external-auth-target',
      priority: 10,
      status: 'ready',
      label: loginCapture
        ? 'Open the dedicated profile, complete login, then wait and capture real target proof'
        : handoffResume
        ? 'Check saved handoff auth state, then capture proof only after login is proved'
        : targetNext.nextAction.label,
      writesLocalState: true,
      needsOperatorInput: ['login', 'login-capture', 'handoff-capture', 'handoff-resume'].includes(targetNext.nextAction.id),
      target: targetNext.target?.target || '',
      command: loginCapture || handoffResume || durableHandoffRunCommand(targetNext.nextAction.command),
      startCommandCandidates,
      operatorGuidance: guidance,
      manualCommands: manualCommandCandidates.map((item) => item.command.shell),
      manualCommandCandidates,
      blockers: targetNext.target?.blockers || [],
      missingArtifacts: targetNext.target?.missingArtifacts || [],
      ...artifactAction
    };
  }

  const candidatePlan = buildTargetCandidatePlan();
  const recommended = candidatePlan.candidates.find((candidate) => candidate.id === candidatePlan.recommendedCandidate)
    || candidatePlan.candidates[0];
  return {
    id: 'target-candidate-plan',
    requirementId: 'real-external-auth-target',
    priority: 10,
    status: 'needs-input',
    label: 'Choose a real external service candidate and generate the target bootstrap plan',
    writesLocalState: false,
    needsOperatorInput: true,
    command: recommended?.bootstrapPlanCompactCommand || command(['node', 'src/cli.mjs', 'target-candidate-plan', '--format', 'compact']),
    startCommandCandidates: buildStartCommandCandidates({
      includeBootstrap: true,
      candidate: recommended?.id || 'github',
      regularChromeStatus: options.regularChromeStatus
    }),
    operatorGuidance: operatorGuidance(targetNext),
    blockers: targetNext.target?.blockers || ['No accepted real external target proof exists yet.'],
    missingArtifacts: targetNext.target?.missingArtifacts || [],
    ...artifactAction
  };
}

function lightpandaAction(doctor) {
  if (doctor.readyForPublicBenchmark) {
    return {
      id: 'lightpanda-public-benchmark',
      requirementId: 'lightpanda-public-benchmark',
      priority: 20,
      status: 'ready',
      label: 'Run the public URL benchmark to adopt or reject Lightpanda for public crawling',
      writesLocalState: true,
      needsOperatorInput: false,
      command: {
        args: [],
        shell: doctor.benchmarkCommand
      },
      blockers: []
    };
  }

  return {
    id: 'lightpanda-record-reject-decision',
    requirementId: 'lightpanda-public-benchmark',
    priority: 20,
    status: 'ready',
    label: 'Record the current-Mac Lightpanda reject decision from doctor evidence',
    writesLocalState: true,
    needsOperatorInput: false,
    command: command([
      'node',
      'src/cli.mjs',
      'lightpanda-decision',
      '--decision',
      'reject',
      '--write',
      '--format',
      'markdown'
    ]),
    manualCommands: doctor.download?.commands || [],
    blockers: doctor.checks
      .filter((check) => check.status !== 'pass' && check.status !== 'recommend')
      .map((check) => `${check.name}: ${check.detail}`)
  };
}

export async function buildObjectiveNext(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const readiness = options.readiness || buildReadinessAudit({ rootDir });
  const targetNext = options.targetNext || await buildTargetProofNext(rootDir, { realExternal: true });
  const lightpanda = options.lightpanda || buildLightpandaDoctor(options.lightpandaOptions || {});
  const regularChromeStatus = options.regularChromeStatus || buildRegularChromeStatus({
    ...options,
    rootDir,
    generatedAt
  });
  const handoffAuthCheckPort = targetNext?.target?.operatorHandoff?.authCheckPort || '';
  const handoffAuthCheckPortReachable = typeof options.handoffPortReachable === 'boolean'
    ? options.handoffPortReachable
    : options.probeHandoffPort === false
      ? null
      : await (options.handoffPortProbe || probeTcpPort)(
        handoffAuthCheckPort,
        Number(options.handoffPortTimeoutMs || options['handoff-port-timeout-ms'] || 150)
      );
  const targetRequirement = requirement(readiness, 'real-external-auth-target');
  const lightpandaRequirement = requirement(readiness, 'lightpanda-public-benchmark');
  const actions = [];

  if (targetRequirement?.status !== 'proved') {
    actions.push(targetAction(targetNext, {
      regularChromeStatus,
      handoffAuthCheckPortReachable,
      monitorTimeoutMs: options.monitorTimeoutMs,
      monitorIntervalMs: options.monitorIntervalMs
    }));
  }
  if (lightpandaRequirement?.status !== 'proved') actions.push(lightpandaAction(lightpanda));
  actions.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    complete: Boolean(readiness.completeAgainstObjective),
    readyForLocalAuthenticatedDevelopment: Boolean(readiness.readyForLocalAuthenticatedDevelopment),
    summary: readiness.summary,
    primaryAction: actions[0] || {
      id: 'complete',
      requirementId: '',
      priority: 100,
      status: 'satisfied',
      label: 'Objective is complete',
      writesLocalState: false,
      needsOperatorInput: false,
      command: null,
      blockers: []
    },
    actions,
    remainingRequirements: readiness.requirements
      .filter((item) => item.status !== 'proved')
      .map((item) => ({
        id: item.id,
        status: item.status,
        next: item.next || ''
      }))
  };
}

export function formatObjectiveNextMarkdown(next) {
  const lines = [
    '# Secure Browser Agent Objective Next',
    '',
    `Generated: ${next.generatedAt}`,
    `Root: ${next.rootDir}`,
    `Complete: ${next.complete ? 'yes' : 'no'}`,
    `Ready for local authenticated development: ${next.readyForLocalAuthenticatedDevelopment ? 'yes' : 'no'}`,
    `Safe mode: ${next.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${next.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Summary',
    ''
  ];
  for (const [status, count] of Object.entries(next.summary || {})) {
    lines.push(`- ${status}: ${count}`);
  }
  lines.push('', '## Primary Action', '');
  const primary = next.primaryAction;
  lines.push(`- ID: ${primary.id}`);
  lines.push(`- Requirement: ${primary.requirementId || 'none'}`);
  lines.push(`- Status: ${primary.status}`);
  lines.push(`- Label: ${primary.label}`);
  lines.push(`- Writes local state: ${primary.writesLocalState ? 'yes' : 'no'}`);
  lines.push(`- Needs operator input: ${primary.needsOperatorInput ? 'yes' : 'no'}`);
  lines.push(`- Next artifact action: ${primary.nextArtifactAction || 'none'}`);
  lines.push(`- Next artifact blocker: ${primary.nextArtifactBlocker || 'none'}`);
  lines.push(`- Artifact command covers: ${primary.artifactCommandCovers?.length ? primary.artifactCommandCovers.join(', ') : 'none'}`);
  if (primary.operatorGuidance) {
    lines.push('', '## Operator Guidance', '');
    lines.push(`- Human action: ${primary.operatorGuidance.humanAction || 'none'}`);
    lines.push(`- Automation blocker: ${primary.operatorGuidance.automationBlocker || 'none'}`);
    lines.push(`- Capture blocked: ${primary.operatorGuidance.captureBlocked ? 'yes' : 'no'}`);
  }
  if (primary.command?.shell) {
    lines.push('', '```bash');
    lines.push(primary.command.shell);
    lines.push('```');
  } else {
    lines.push('- Command: none');
  }
  if (primary.blockers?.length) {
    lines.push('', '### Blockers');
    for (const blocker of primary.blockers) lines.push(`- ${blocker}`);
  }
  if (primary.missingArtifacts?.length) {
    lines.push('', '### Missing Artifacts');
    for (const item of primary.missingArtifacts) {
      const location = item.path ? ` (${item.path})` : '';
      lines.push(`- ${item.id}${location}: ${item.detail || item.kind || 'missing'}`);
    }
  }
  if (primary.manualCommands?.length) {
    lines.push('', '### Manual Command Candidates');
    if (primary.manualCommandCandidates?.length) {
      for (const candidate of primary.manualCommandCandidates) {
        lines.push(`- ${candidate.id}: ${candidate.label || 'Manual command'}`);
        if (candidate.command?.shell) lines.push(`  \`${candidate.command.shell.replaceAll('`', '\\`')}\``);
      }
    } else {
      for (const manualCommand of primary.manualCommands) lines.push(`- \`${manualCommand.replaceAll('`', '\\`')}\``);
    }
  }
  if (primary.startCommandCandidates?.length) {
    lines.push('', '### Start Command Candidates');
    for (const candidate of primary.startCommandCandidates) {
      lines.push(`- ${candidate.id}: ${candidate.label || 'Start command'}`);
      if (candidate.command?.shell) lines.push(`  \`${candidate.command.shell.replaceAll('`', '\\`')}\``);
    }
  }
  lines.push('', '## All Actions', '');
  for (const action of next.actions) {
    lines.push(`- ${action.id}: ${action.status} - ${action.label}`);
  }
  lines.push('', '## Remaining Requirements', '');
  if (next.remainingRequirements.length === 0) {
    lines.push('- none');
  } else {
    for (const item of next.remainingRequirements) {
      lines.push(`- ${item.id}: ${item.status}${item.next ? ` - ${item.next}` : ''}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function commandOpensBrowser(commandValue) {
  const args = commandValue?.args || [];
  return args.includes('target-login')
    || args.includes('target-login-capture')
    || (args.includes('target-handoff-resume') && args.includes('--open-login'));
}

function commandStartsCapture(commandValue) {
  const args = commandValue?.args || [];
  return args.includes('target-proof-capture')
    || args.includes('target-handoff-run')
    || args.includes('target-run')
    || args.includes('target-scrape')
    || (args.includes('target-handoff-resume-watch') && args.includes('--run'))
    || (args.includes('target-handoff-resume') && args.includes('--wait-auth'))
    || (args.includes('target-login-capture') && !args.includes('--open-only'));
}

function commandRequiresOperatorApproval(commandValue) {
  return commandOpensBrowser(commandValue) || commandStartsCapture(commandValue);
}

export function formatObjectiveNextCompact(next) {
  const primary = next.primaryAction || {};
  const summary = next.summary || {};
  const missingArtifacts = Array.isArray(primary.missingArtifacts) ? primary.missingArtifacts : [];
  const missingArtifactIds = missingArtifacts.map((item) => item.id).filter(Boolean);
  const missingOutputFiles = missingArtifacts
    .filter((item) => item.kind === 'output')
    .map((item) => item.path || item.id.replace(/^output:/, ''))
    .filter(Boolean);
  const lines = [
    `complete: ${yesNo(next.complete)}`,
    `ready_local_auth: ${yesNo(next.readyForLocalAuthenticatedDevelopment)}`,
    `primary: ${compactValue(primary.id)}`,
    `requirement: ${compactValue(primary.requirementId)}`,
    `status: ${compactValue(primary.status)}`,
    `target: ${compactValue(primary.target)}`,
    `operator_input: ${yesNo(primary.needsOperatorInput)}`,
    `human_action: ${compactValue(primary.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(primary.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(primary.operatorGuidance?.captureBlocked)}`,
    `planned_primary_opens_browser: ${yesNo(commandOpensBrowser(primary.command))}`,
    `planned_primary_starts_capture: ${yesNo(commandStartsCapture(primary.command))}`,
    `primary_requires_operator_approval: ${yesNo(primary.needsOperatorInput || commandRequiresOperatorApproval(primary.command))}`,
    `agent_must_not_run_primary_unattended: ${yesNo(primary.needsOperatorInput || commandRequiresOperatorApproval(primary.command))}`,
    `writes_local_state: ${yesNo(primary.writesLocalState)}`,
    `actions: ${Array.isArray(next.actions) ? next.actions.length : 0}`,
    `remaining: ${Array.isArray(next.remainingRequirements) ? next.remainingRequirements.length : 0}`,
    `proved: ${summary.proved ?? 0}`,
    `manual_required: ${summary['manual-required'] ?? 0}`,
    `missing_artifact_count: ${missingArtifacts.length}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`,
    `missing_output_files: ${missingOutputFiles.length ? missingOutputFiles.join(',') : 'none'}`,
    `next_artifact_action: ${compactValue(primary.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(primary.nextArtifactBlocker)}`,
    `artifact_command_covers: ${primary.artifactCommandCovers?.length ? primary.artifactCommandCovers.join(',') : 'none'}`,
    `secret_values_read: no`,
    `destructive_actions: ${yesNo(next.destructiveActionsIncluded)}`
  ];
  if (primary.command?.shell) lines.push(`command: ${commandDisplayShell(next.rootDir, primary.command)}`);
  if (Array.isArray(primary.blockers) && primary.blockers.length) {
    lines.push(`blockers: ${primary.blockers.length}`);
    lines.push(`first_blocker: ${compactValue(primary.blockers[0])}`);
  }
  if (Array.isArray(primary.manualCommandCandidates) && primary.manualCommandCandidates.length) {
    lines.push(`manual_candidates: ${primary.manualCommandCandidates.map((item) => item.id).join(',')}`);
    for (const candidate of primary.manualCommandCandidates) {
      lines.push(`manual_${compactKey(candidate.id)}_opens_browser: ${yesNo(commandOpensBrowser(candidate.command))}`);
      lines.push(`manual_${compactKey(candidate.id)}_starts_capture: ${yesNo(commandStartsCapture(candidate.command))}`);
      lines.push(`manual_${compactKey(candidate.id)}_requires_operator_approval: ${yesNo(commandRequiresOperatorApproval(candidate.command))}`);
      lines.push(`manual_${compactKey(candidate.id)}_agent_must_not_run_unattended: ${yesNo(commandRequiresOperatorApproval(candidate.command))}`);
      if (candidate.command?.shell) lines.push(`manual_${compactKey(candidate.id)}_command: ${commandDisplayShell(next.rootDir, candidate.command)}`);
    }
  }
  if (Array.isArray(primary.startCommandCandidates) && primary.startCommandCandidates.length) {
    const startRequiresOperatorApproval = primary.startCommandCandidates.filter((item) => item.safety?.requiresOperatorApproval);
    const startMayRunUnattended = primary.startCommandCandidates.filter((item) => item.safety?.agentMayRunUnattended);
    lines.push(`start_commands: ${primary.startCommandCandidates.map((item) => item.id).join(',')}`);
    lines.push(`start_command_requires_operator_approval_count: ${startRequiresOperatorApproval.length}`);
    lines.push(`start_command_agent_may_run_unattended_count: ${startMayRunUnattended.length}`);
    lines.push(`start_operator_approval_required: ${startRequiresOperatorApproval.length ? startRequiresOperatorApproval.map((item) => item.id).join(',') : 'none'}`);
    for (const candidate of primary.startCommandCandidates) {
      if (candidate.command?.shell) lines.push(`start_${compactKey(candidate.id)}_command: ${commandDisplayShell(next.rootDir, candidate.command)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
