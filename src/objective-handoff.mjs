import fs from 'node:fs';
import path from 'node:path';
import { buildObjectiveCompletionAudit } from './objective-completion-audit.mjs';

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function rootRelativeCommandArg(rootDir, value) {
  if (!value) return value;
  const text = String(value);
  if (!path.isAbsolute(text)) return text;
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const resolvedValue = path.resolve(text);
  if (resolvedValue === resolvedRoot || resolvedValue.startsWith(`${resolvedRoot}${path.sep}`)) {
    return path.relative(resolvedRoot, resolvedValue);
  }
  return text;
}

function commandDisplayShell(rootDir, commandValue) {
  const args = commandValue?.args;
  if (Array.isArray(args)) return command(args.map((arg) => rootRelativeCommandArg(rootDir, arg))).shell;
  return rootRelativeShell(rootDir, commandValue?.shell || '');
}

function rootRelativeShell(rootDir, shell) {
  if (!shell) return '';
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  return String(shell).replaceAll(`${resolvedRoot}${path.sep}`, '');
}

function monitorOverrideArgs(options = {}) {
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  return [
    ...(timeoutMs === undefined || timeoutMs === null || timeoutMs === '' ? [] : ['--monitor-timeout-ms', String(timeoutMs)]),
    ...(intervalMs === undefined || intervalMs === null || intervalMs === '' ? [] : ['--monitor-interval-ms', String(intervalMs)])
  ];
}

function watchOverrideArgs(options = {}) {
  const timeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const intervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  return [
    '--timeout-ms',
    String(timeoutMs ?? 300000),
    '--interval-ms',
    String(intervalMs ?? 5000)
  ];
}

function safeRunPath(rootDir, outPath) {
  const relative = outPath || 'objective-handoff.json';
  const safeName = String(relative).replace(/^[/\\]+/, '');
  if (safeName.includes('..')) throw new Error(`invalid handoff output path: ${outPath}`);
  return path.join(rootDir, 'runs', safeName);
}

function commandItem(id, title, shell) {
  return { id, title, shell };
}

function buildCommands(audit, options = {}) {
  const rootDir = options.rootDir || audit.rootDir || process.cwd();
  const commands = [];
  if (audit.nextAction?.command?.shell) {
    commands.push(commandItem('primary-action', audit.nextAction.label || 'Run the current primary action', commandDisplayShell(rootDir, audit.nextAction.command)));
  }
  if (!audit.complete) {
    commands.push(commandItem(
      'objective-status',
      'Poll the low-token objective status and recommended command after each login or resume attempt',
      command(['node', 'src/cli.mjs', 'objective-status', '--format', 'compact']).shell
    ));
    commands.push(commandItem(
      'proof-gate-watch',
      'Keep a low-token proof-gate watch file fresh without starting browser capture',
      command(['node', 'src/cli.mjs', 'proof-gate-watch', '--write', ...watchOverrideArgs(options), '--format', 'compact']).shell
    ));
  }
  if (audit.nextAction?.id === 'target-handoff-capture' && audit.nextAction?.needsOperatorInput) {
    commands.push(commandItem(
      'operator-ready-resume',
      'After completing login in the dedicated browser, run the objective resume gate with auth preflight',
      command(['node', 'src/cli.mjs', 'objective-resume', '--run', '--operator-ready', '--format', 'markdown']).shell
    ));
  }
  const manualCandidates = audit.nextAction?.manualCommandCandidates || [];
  if (manualCandidates.length > 0) {
    for (const candidate of manualCandidates) {
      commands.push(commandItem(
        `manual-candidate-${candidate.id}`,
        candidate.label || 'Optional manual command candidate for the same next action',
        commandDisplayShell(rootDir, candidate.command)
      ));
    }
  } else {
    for (const [index, shell] of (audit.nextAction?.manualCommands || []).entries()) {
      commands.push(commandItem(
        `manual-candidate-${index + 1}`,
        'Optional manual command candidate for the same next action',
        rootRelativeShell(rootDir, shell)
      ));
    }
  }
  commands.push(commandItem(
    'completion-audit',
    'Run the strict final completion gate after the primary action finishes',
    command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'markdown']).shell
  ));
  commands.push(commandItem(
    'objective-next',
    'Show the next required action if completion still fails',
    command(['node', 'src/cli.mjs', 'objective-next', ...monitorOverrideArgs(options), '--format', 'markdown']).shell
  ));
  return commands;
}

function instructionsForAudit(audit) {
  if (audit.complete) {
    return ['The completion audit is already complete. No operator action is required.'];
  }
  const instructions = [
    'Run the primary action command from the repository root.',
    'Complete credentials, cookies, tokens, and 2FA only inside the opened dedicated browser profile.',
    'Do not paste credentials, cookies, tokens, or 2FA codes into the terminal, chat, logs, target pack files, or handoff files.'
  ];
  if (audit.nextAction?.id === 'target-handoff-resume') {
    instructions.push('The primary handoff-resume command checks auth first and runs proof capture only after login is proved.');
  }
  instructions.push('After the primary action finishes, run the strict completion audit command.');
  return instructions;
}

function operatorGuidanceForAudit(audit) {
  const guidance = audit.nextAction?.operatorGuidance;
  if (!guidance || typeof guidance !== 'object') {
    return {
      humanAction: 'none',
      automationBlocker: 'none',
      captureBlocked: false
    };
  }
  return {
    humanAction: guidance.humanAction || 'none',
    automationBlocker: guidance.automationBlocker || 'none',
    captureBlocked: Boolean(guidance.captureBlocked)
  };
}

export async function buildObjectiveHandoff(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const audit = options.audit || await buildObjectiveCompletionAudit({
    ...options,
    rootDir
  });
  const handoff = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir,
    objective: audit.objective,
    safeMode: true,
    destructiveActionsIncluded: false,
    complete: audit.complete,
    status: audit.complete ? 'complete' : 'action-required',
    remaining: audit.remaining.map((item) => ({
      id: item.id,
      status: item.status,
      next: item.next || ''
    })),
    operatorGuidance: operatorGuidanceForAudit(audit),
    missingArtifacts: audit.nextAction?.missingArtifacts || [],
    artifactAction: {
      nextArtifactAction: audit.nextAction?.nextArtifactAction || '',
      nextArtifactBlocker: audit.nextAction?.nextArtifactBlocker || '',
      artifactCommandCovers: Array.isArray(audit.nextAction?.artifactCommandCovers)
        ? audit.nextAction.artifactCommandCovers
        : []
    },
    instructions: instructionsForAudit(audit),
    commands: buildCommands(audit, options),
    completionAudit: {
      complete: audit.complete,
      status: audit.status,
      remainingCount: audit.finalGate.remainingCount,
      remaining: audit.remaining.map((item) => item.id)
    },
    outputPath: ''
  };

  if (options.write || options.out) {
    const outputPath = safeRunPath(rootDir, options.out || options.output || 'objective-handoff.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
    handoff.outputPath = outputPath;
  }

  return handoff;
}

export function formatObjectiveHandoffMarkdown(handoff) {
  const lines = [
    '# Secure Browser Agent Objective Handoff',
    '',
    `Generated: ${handoff.generatedAt}`,
    `Root: ${handoff.rootDir}`,
    `Complete: ${handoff.complete ? 'yes' : 'no'}`,
    `Status: ${handoff.status}`,
    `Safe mode: ${handoff.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${handoff.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Instructions',
    ''
  ];
  for (const item of handoff.instructions) lines.push(`- ${item}`);
  if (handoff.operatorGuidance) {
    lines.push('', '## Operator Guidance', '');
    lines.push(`- Human action: ${handoff.operatorGuidance.humanAction || 'none'}`);
    lines.push(`- Automation blocker: ${handoff.operatorGuidance.automationBlocker || 'none'}`);
    lines.push(`- Capture blocked: ${handoff.operatorGuidance.captureBlocked ? 'yes' : 'no'}`);
    lines.push(`- Next artifact action: ${handoff.artifactAction?.nextArtifactAction || 'none'}`);
    lines.push(`- Next artifact blocker: ${handoff.artifactAction?.nextArtifactBlocker || 'none'}`);
    lines.push(`- Artifact command covers: ${handoff.artifactAction?.artifactCommandCovers?.length ? handoff.artifactAction.artifactCommandCovers.join(', ') : 'none'}`);
  }
  lines.push('', '## Remaining', '');
  if (handoff.remaining.length === 0) {
    lines.push('- none');
  } else {
    for (const item of handoff.remaining) {
      lines.push(`- ${item.id}: ${item.status}${item.next ? ` - ${item.next}` : ''}`);
    }
  }
  if (handoff.missingArtifacts?.length) {
    lines.push('', '## Missing Artifacts', '');
    for (const item of handoff.missingArtifacts) {
      const location = item.path ? ` (${item.path})` : '';
      lines.push(`- ${item.id}${location}: ${item.detail || item.kind || 'missing'}`);
    }
  }
  lines.push('', '## Commands', '');
  for (const item of handoff.commands) {
    lines.push(`### ${item.id}`, '');
    lines.push(`- ${item.title}`);
    if (item.shell) {
      lines.push('', '```bash');
      lines.push(item.shell);
      lines.push('```');
    }
    lines.push('');
  }
  lines.push('## Completion Audit', '');
  lines.push(`- Complete: ${handoff.completionAudit.complete ? 'yes' : 'no'}`);
  lines.push(`- Status: ${handoff.completionAudit.status}`);
  lines.push(`- Remaining count: ${handoff.completionAudit.remainingCount}`);
  if (handoff.outputPath) {
    lines.push('', '## Written Handoff', '');
    lines.push(`- Path: ${handoff.outputPath}`);
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

function compactKey(value) {
  return String(value || 'candidate').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'candidate';
}

export function formatObjectiveHandoffCompact(handoff) {
  const primary = handoff.commands.find((item) => item.id === 'primary-action') || {};
  const proofGateWatch = handoff.commands.find((item) => item.id === 'proof-gate-watch') || {};
  const missingArtifacts = Array.isArray(handoff.missingArtifacts) ? handoff.missingArtifacts : [];
  const missingArtifactIds = missingArtifacts.map((item) => item.id).filter(Boolean);
  const missingOutputFiles = missingArtifacts
    .filter((item) => item.kind === 'output')
    .map((item) => item.path || item.id.replace(/^output:/, ''))
    .filter(Boolean);
  const manualCandidateCommands = handoff.commands
    .filter((item) => item.id.startsWith('manual-candidate-'))
    .map((item) => ({
      id: item.id.replace(/^manual-candidate-/, ''),
      shell: item.shell || ''
    }));
  const lines = [
    `complete: ${yesNo(handoff.complete)}`,
    `status: ${compactValue(handoff.status)}`,
    `safe_mode: ${yesNo(handoff.safeMode)}`,
    `destructive_actions: ${yesNo(handoff.destructiveActionsIncluded)}`,
    `remaining: ${Array.isArray(handoff.remaining) ? handoff.remaining.length : 0}`,
    `commands: ${Array.isArray(handoff.commands) ? handoff.commands.length : 0}`,
    `primary: ${compactValue(primary.id)}`,
    `primary_title: ${compactValue(primary.title)}`,
    `human_action: ${compactValue(handoff.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(handoff.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(handoff.operatorGuidance?.captureBlocked)}`,
    `completion_remaining: ${handoff.completionAudit?.remainingCount ?? 0}`,
    `missing_artifact_count: ${missingArtifacts.length}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`,
    `missing_output_files: ${missingOutputFiles.length ? missingOutputFiles.join(',') : 'none'}`,
    `next_artifact_action: ${compactValue(handoff.artifactAction?.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(handoff.artifactAction?.nextArtifactBlocker)}`,
    `artifact_command_covers: ${handoff.artifactAction?.artifactCommandCovers?.length ? handoff.artifactAction.artifactCommandCovers.join(',') : 'none'}`,
    'secret_values_read: no'
  ];
  if (primary.shell) lines.push(`command: ${primary.shell}`);
  if (proofGateWatch.shell) lines.push(`proof_gate_watch_command: ${proofGateWatch.shell}`);
  if (manualCandidateCommands.length) {
    lines.push(`manual_candidates: ${manualCandidateCommands.map((item) => item.id).join(',')}`);
    for (const candidate of manualCandidateCommands) {
      if (candidate.shell) lines.push(`manual_${compactKey(candidate.id)}_command: ${candidate.shell}`);
    }
  }
  if (handoff.outputPath) lines.push(`output: ${handoff.outputPath}`);
  return `${lines.join('\n')}\n`;
}
