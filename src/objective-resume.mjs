import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildObjectiveNext } from './objective-next.mjs';
import { buildTargetAuthCheck } from './target-auth-check.mjs';
import { buildTargetHandoffRun } from './target-handoff-run.mjs';

function defaultRunner(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: Number(options.timeoutMs || 120000)
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

function summarizeRun(result) {
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  let parsedStdout = null;
  try {
    parsedStdout = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsedStdout = null;
  }
  const childStatus = parsedStdout?.status
    || stdout.match(/^Status:\s+(.+)$/m)?.[1]?.trim()
    || stdout.match(/^status:\s+(.+)$/m)?.[1]?.trim()
    || '';
  const childIncomplete = ['blocked', 'failed', 'timed-out', 'waiting-for-login'].includes(childStatus);
  return {
    ok: Boolean(result.ok) && !childIncomplete,
    status: result.status ?? null,
    signal: result.signal || '',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stdoutTail: stdout.split(/\r?\n/).slice(-5).join('\n').slice(-1200),
    stderrTail: stderr.split(/\r?\n/).slice(-5).join('\n').slice(-1200),
    error: result.error || '',
    childStatus,
    handoff: parsedStdout?.handoff || null
  };
}

function runnable(action) {
  return Boolean(action?.command?.args?.length);
}

function argAfter(args, flag) {
  const index = Array.isArray(args) ? args.indexOf(flag) : -1;
  return index >= 0 ? args[index + 1] : '';
}

function hasWaitAuthOverrides(options = {}) {
  return Boolean(
    optionValue(options, 'waitAuthTimeoutMs', 'wait-auth-timeout-ms') ||
    optionValue(options, 'waitAuthIntervalMs', 'wait-auth-interval-ms')
  );
}

function defaultResumeOutputPath(options = {}) {
  return hasWaitAuthOverrides(options)
    ? 'operator/objective-resume-probe-latest.json'
    : 'operator/objective-resume-latest.json';
}

function runsOutputPath(rootDir, outPath, options = {}) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || defaultResumeOutputPath(options)).replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) {
    throw new Error(`invalid resume output path: ${outPath}`);
  }
  return outputPath;
}

function writeResumeResult(resume, options = {}) {
  if (!options.write && !options.out && !options.output) return resume;
  const outputPath = runsOutputPath(resume.rootDir, options.out || options.output, options);
  resume.outputPath = outputPath;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(resume, null, 2)}\n`, 'utf8');
  return resume;
}

function selectAction(next, options = {}) {
  const primaryAction = next.primaryAction;
  const requested = options.manualCandidate || options['manual-candidate'];
  if (!requested) {
    return {
      action: primaryAction,
      selectedManualCandidate: null,
      selectionBlocker: ''
    };
  }

  const candidates = primaryAction?.manualCommandCandidates || [];
  const selected = /^\d+$/.test(String(requested))
    ? candidates[Number(requested) - 1]
    : candidates.find((candidate) => candidate.id === requested);
  if (!selected) {
    return {
      action: primaryAction,
      selectedManualCandidate: null,
      selectionBlocker: `Manual command candidate not found: ${requested}`
    };
  }
  return {
    action: {
      ...primaryAction,
      id: `${primaryAction.id}:${selected.id}`,
      label: selected.label || primaryAction.label,
      command: selected.command
    },
    selectedManualCandidate: {
      id: selected.id,
      label: selected.label || '',
      command: selected.command
    },
    selectionBlocker: ''
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
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

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function optionValue(options, camelName, kebabName) {
  const value = options[camelName] ?? options[kebabName];
  if (value === undefined || value === null || value === true || value === '') return '';
  return String(value);
}

function withCommandOption(args, flag, value) {
  if (!value) return args;
  const next = [...args];
  const index = next.indexOf(flag);
  if (index >= 0) {
    next[index + 1] = String(value);
    return next;
  }
  const formatIndex = next.indexOf('--format');
  return formatIndex >= 0
    ? [...next.slice(0, formatIndex), flag, String(value), ...next.slice(formatIndex)]
    : [...next, flag, String(value)];
}

function withProbeHandoffOut(args, options = {}) {
  if (!hasWaitAuthOverrides(options)) return args;
  if (!Array.isArray(args) || !args.includes('target-login-capture')) return args;
  const index = args.indexOf('--handoff-out');
  if (index < 0) return args;
  const current = args[index + 1] || '';
  if (current !== 'operator-handoff.json') return args;
  const next = [...args];
  next[index + 1] = 'operator-handoff-probe.json';
  return next;
}

function withProbeWaitAuthStatusOut(args, options = {}) {
  if (!hasWaitAuthOverrides(options)) return args;
  if (!Array.isArray(args) || !args.includes('target-login-capture')) return args;
  const index = args.indexOf('--wait-auth-status-out');
  if (index < 0) return args;
  const current = args[index + 1] || '';
  if (current !== 'wait-auth-status.json') return args;
  const next = [...args];
  next[index + 1] = 'wait-auth-status-probe.json';
  return next;
}

function applyWaitAuthOverrides(action, selectedManualCandidate, options = {}) {
  const args = action?.command?.args || [];
  const commandName = args.find((arg) => arg === 'target-login-capture' || arg === 'target-proof-capture');
  if (!commandName) return { action, selectedManualCandidate };

  const timeoutMs = optionValue(options, 'waitAuthTimeoutMs', 'wait-auth-timeout-ms');
  const intervalMs = optionValue(options, 'waitAuthIntervalMs', 'wait-auth-interval-ms');
  let nextArgs = withProbeHandoffOut(args, options);
  nextArgs = withProbeWaitAuthStatusOut(nextArgs, options);
  nextArgs = withCommandOption(nextArgs, '--wait-auth-timeout-ms', timeoutMs);
  nextArgs = withCommandOption(nextArgs, '--wait-auth-interval-ms', intervalMs);
  if (nextArgs === args) return { action, selectedManualCandidate };

  const nextCommand = command(nextArgs);
  return {
    action: {
      ...action,
      command: nextCommand
    },
    selectedManualCandidate: selectedManualCandidate
      ? {
          ...selectedManualCandidate,
          command: nextCommand
        }
      : selectedManualCandidate
  };
}

function durableHandoffRunAction(action) {
  const args = action?.command?.args || [];
  if (action?.id !== 'target-handoff-capture' || !Array.isArray(args) || args.includes('--out')) {
    return action;
  }
  const formatIndex = args.indexOf('--format');
  const outputArgs = ['--out', 'handoff-run-latest.json'];
  const nextArgs = formatIndex >= 0
    ? [...args.slice(0, formatIndex), ...outputArgs, ...args.slice(formatIndex)]
    : [...args, ...outputArgs];
  return {
    ...action,
    command: command(nextArgs)
  };
}

function waitAuthTimeoutMsForAction(action) {
  const args = action?.command?.args || [];
  const configured = Number(argAfter(args, '--wait-auth-timeout-ms') || 0);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (args.includes('target-login-capture') && !args.includes('--open-only')) return 300000;
  if (args.includes('target-proof-capture') && args.includes('--wait-auth')) return 300000;
  if (args.includes('target-handoff-resume') && args.includes('--wait-auth')) return 300000;
  return 0;
}

function runnerTimeoutMsForAction(action, options = {}) {
  const explicit = Number(options.timeoutMs || options['timeout-ms'] || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const waitAuthTimeoutMs = waitAuthTimeoutMsForAction(action);
  return waitAuthTimeoutMs > 0 ? waitAuthTimeoutMs + 60000 : 120000;
}

async function defaultOperatorReadyPreflight(action, options = {}) {
  if (action?.id !== 'target-handoff-capture') return null;
  const args = action.command?.args || [];
  const handoffRunIndex = args.indexOf('target-handoff-run');
  const targetDir = handoffRunIndex >= 0 ? args[handoffRunIndex + 1] : '';
  if (!targetDir) {
    return {
      ok: false,
      kind: 'target-auth-check',
      blocker: 'Operator-ready preflight could not find target-handoff-run target directory.'
    };
  }
  const handoffPlan = await buildTargetHandoffRun(targetDir, {
    handoff: argAfter(args, '--handoff') || 'operator-handoff.json',
    command: argAfter(args, '--command') || 'post-login-capture',
    rootDir: options.rootDir || process.cwd(),
    run: false
  });
  const captureArgs = handoffPlan.selected?.command?.args || [];
  const proofCaptureIndex = captureArgs.indexOf('target-proof-capture');
  const captureTargetDir = proofCaptureIndex >= 0 ? captureArgs[proofCaptureIndex + 1] : targetDir;
  const cdpPort = argAfter(captureArgs, '--auth-check-port');
  if (!cdpPort) {
    return {
      ok: false,
      kind: 'target-auth-check',
      targetDir: captureTargetDir,
      blocker: 'Operator-ready preflight could not find --auth-check-port in the saved handoff capture command.'
    };
  }
  const authCheck = await buildTargetAuthCheck(captureTargetDir, {
    realExternal: true,
    cdpPort,
    generatedAt: options.generatedAt
  });
  return {
    ok: Boolean(authCheck.ok),
    kind: 'target-auth-check',
    targetDir: captureTargetDir,
    cdpPort,
    finalUrl: authCheck.finalUrl || '',
    loginLike: Boolean(authCheck.loginLike),
    blocker: authCheck.ok
      ? ''
      : `Operator-ready preflight failed: auth-check still sees login or non-authenticated page at ${authCheck.finalUrl || 'unknown'}.`
  };
}

export async function buildObjectiveResume(options = {}) {
  const next = options.next || await buildObjectiveNext(options);
  const run = Boolean(options.run);
  const operatorReady = Boolean(options.operatorReady || options['operator-ready']);
  const operatorOk = String(options.operatorOk || options['operator-ok'] || '');
  const operatorOkAccepted = operatorOk === 'OK';
  const selected = selectAction(next, options);
  const actionWithDurableHandoff = durableHandoffRunAction(selected.action);
  const overridden = applyWaitAuthOverrides(actionWithDurableHandoff, selected.selectedManualCandidate, options);
  const action = overridden.action;
  const selectedManualCandidate = overridden.selectedManualCandidate;
  const { selectionBlocker } = selected;
  const plannedCommandOpensBrowser = commandOpensBrowser(action?.command);
  const plannedCommandStartsCapture = commandStartsCapture(action?.command);
  const operatorOkRequired = Boolean(run && (plannedCommandOpensBrowser || plannedCommandStartsCapture));
  const preflight = operatorReady && action?.id === 'target-handoff-capture'
    ? await (options.operatorReadyPreflight || defaultOperatorReadyPreflight)(action, {
      ...options,
      rootDir: options.rootDir || next.rootDir
    })
    : null;
  const blockers = [
    selectionBlocker,
    !action ? 'No primary action is available.' : '',
    action?.status === 'satisfied' ? 'Objective already reports satisfied.' : '',
    action?.needsOperatorInput && action?.id === 'target-handoff-capture' && !operatorReady
      ? 'Action requires operator input before running: complete login in the already-open dedicated browser, then re-run with --operator-ready.'
      : '',
    operatorOkRequired && !operatorOkAccepted
      ? 'Action may open a browser or start capture; re-run with --operator-ok OK after explicit operator approval.'
      : '',
    preflight && !preflight.ok ? preflight.blocker || 'Operator-ready preflight failed.' : '',
    !runnable(action) ? 'Primary action has no structured command args and must be run manually.' : ''
  ].filter(Boolean);
  const resume = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    rootDir: next.rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    run,
    operatorReady,
    operatorOkRequired,
    operatorOkAccepted,
    plannedCommandOpensBrowser,
    plannedCommandStartsCapture,
    opensBrowserNow: Boolean(run && blockers.length === 0 && plannedCommandOpensBrowser),
    startsCaptureNow: Boolean(run && blockers.length === 0 && plannedCommandStartsCapture),
    readyToRun: blockers.length === 0,
    status: blockers.length === 0 ? (run ? 'running' : 'planned') : 'blocked',
    action,
    selectedManualCandidate,
    operatorReadyPreflight: preflight,
    blockers,
    result: null,
    nextAfterRun: null,
    outputPath: ''
  };

  if (!run || blockers.length > 0) {
    resume.status = blockers.length > 0 ? 'blocked' : 'planned';
    return writeResumeResult(resume, options);
  }

  const runner = options.runner || defaultRunner;
  const result = summarizeRun(runner(action.command.args, {
    cwd: options.rootDir || next.rootDir || process.cwd(),
    timeoutMs: runnerTimeoutMsForAction(action, options)
  }));
  resume.result = result;
  resume.status = result.ok ? 'completed' : 'failed';
  if (result.ok && !options.skipNextAfterRun) {
    resume.nextAfterRun = await buildObjectiveNext({
      ...options,
      rootDir: next.rootDir
    });
  }
  return writeResumeResult(resume, options);
}

export function formatObjectiveResumeCompact(resume) {
  const lines = [
    `status: ${compactValue(resume.status)}`,
    `run: ${yesNo(resume.run)}`,
    `ready: ${yesNo(resume.readyToRun)}`,
    `operator_ready: ${yesNo(resume.operatorReady)}`,
    `operator_ok_required: ${yesNo(resume.operatorOkRequired)}`,
    `operator_ok_accepted: ${yesNo(resume.operatorOkAccepted)}`,
    `planned_command_opens_browser: ${yesNo(resume.plannedCommandOpensBrowser)}`,
    `planned_command_starts_capture: ${yesNo(resume.plannedCommandStartsCapture)}`,
    `opens_browser_now: ${yesNo(resume.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(resume.startsCaptureNow)}`,
    `action: ${compactValue(resume.action?.id)}`,
    `needs_operator_input: ${yesNo(resume.action?.needsOperatorInput)}`,
    `human_action: ${compactValue(resume.action?.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(resume.action?.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(resume.action?.operatorGuidance?.captureBlocked)}`,
    `next_artifact_action: ${compactValue(resume.action?.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(resume.action?.nextArtifactBlocker)}`,
    `artifact_command_covers: ${resume.action?.artifactCommandCovers?.length ? resume.action.artifactCommandCovers.join(',') : 'none'}`,
    `blockers: ${resume.blockers.length}`
  ];
  if (resume.selectedManualCandidate?.id) {
    lines.push(`manual_candidate: ${compactValue(resume.selectedManualCandidate.id)}`);
  }
  if (resume.operatorReadyPreflight) {
    lines.push(`preflight_ok: ${yesNo(resume.operatorReadyPreflight.ok)}`);
    lines.push(`preflight_kind: ${compactValue(resume.operatorReadyPreflight.kind)}`);
    if (resume.operatorReadyPreflight.cdpPort) {
      lines.push(`cdp_port: ${compactValue(resume.operatorReadyPreflight.cdpPort)}`);
    }
    if (resume.operatorReadyPreflight.finalUrl) {
      lines.push(`final_url: ${compactValue(resume.operatorReadyPreflight.finalUrl)}`);
    }
  }
  if (resume.result) {
    lines.push(`result_ok: ${yesNo(resume.result.ok)}`);
    lines.push(`exit: ${resume.result.status ?? 'none'}`);
    if (resume.result.childStatus) lines.push(`child_status: ${compactValue(resume.result.childStatus)}`);
  }
  if (resume.nextAfterRun) {
    lines.push(`complete_after_run: ${yesNo(resume.nextAfterRun.complete)}`);
    lines.push(`next_after_run: ${compactValue(resume.nextAfterRun.primaryAction?.id)}`);
  }
  if (resume.outputPath) lines.push(`output: ${compactValue(resume.outputPath)}`);
  if (resume.blockers.length > 0) lines.push(`detail: ${compactValue(resume.blockers[0])}`);
  if (resume.action?.command?.shell) lines.push(`command: ${resume.action.command.shell}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatObjectiveResumeMarkdown(resume) {
  const lines = [
    '# Secure Browser Agent Objective Resume',
    '',
    `Generated: ${resume.generatedAt}`,
    `Root: ${resume.rootDir}`,
    `Run mode: ${resume.run ? 'yes' : 'no'}`,
    `Operator ready: ${resume.operatorReady ? 'yes' : 'no'}`,
    `Operator OK required: ${resume.operatorOkRequired ? 'yes' : 'no'}`,
    `Operator OK accepted: ${resume.operatorOkAccepted ? 'yes' : 'no'}`,
    `Planned command opens browser: ${resume.plannedCommandOpensBrowser ? 'yes' : 'no'}`,
    `Planned command starts capture: ${resume.plannedCommandStartsCapture ? 'yes' : 'no'}`,
    `Opens browser now: ${resume.opensBrowserNow ? 'yes' : 'no'}`,
    `Starts capture now: ${resume.startsCaptureNow ? 'yes' : 'no'}`,
    `Ready to run: ${resume.readyToRun ? 'yes' : 'no'}`,
    `Status: ${resume.status}`,
    `Safe mode: ${resume.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${resume.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Action',
    '',
    `- ID: ${resume.action?.id || 'none'}`,
    `- Label: ${resume.action?.label || 'none'}`,
    `- Needs operator input: ${resume.action?.needsOperatorInput ? 'yes' : 'no'}`,
    `- Writes local state: ${resume.action?.writesLocalState ? 'yes' : 'no'}`
  ];
  if (resume.action?.operatorGuidance) {
    lines.push('', '## Operator Guidance', '');
    lines.push(`- Human action: ${resume.action.operatorGuidance.humanAction || 'none'}`);
    lines.push(`- Automation blocker: ${resume.action.operatorGuidance.automationBlocker || 'none'}`);
    lines.push(`- Capture blocked: ${resume.action.operatorGuidance.captureBlocked ? 'yes' : 'no'}`);
  }
  lines.push('', '## Artifact Action', '');
  lines.push(`- Next artifact action: ${resume.action?.nextArtifactAction || 'none'}`);
  lines.push(`- Next artifact blocker: ${resume.action?.nextArtifactBlocker || 'none'}`);
  lines.push(`- Artifact command covers: ${resume.action?.artifactCommandCovers?.length ? resume.action.artifactCommandCovers.join(', ') : 'none'}`);
  if (resume.selectedManualCandidate) {
    lines.push(`- Manual candidate: ${resume.selectedManualCandidate.id} - ${resume.selectedManualCandidate.label || ''}`);
  }
  if (resume.action?.command?.shell) {
    lines.push('', '```bash', resume.action.command.shell, '```');
  }
  lines.push('', '## Blockers', '');
  if (resume.blockers.length === 0) {
    lines.push('- none');
  } else {
    for (const blocker of resume.blockers) lines.push(`- ${blocker}`);
  }
  if (resume.result) {
    lines.push('', '## Result', '');
    lines.push(`- OK: ${resume.result.ok ? 'yes' : 'no'}`);
    lines.push(`- Exit: ${resume.result.status}`);
    if (resume.result.childStatus) lines.push(`- Child status: ${resume.result.childStatus}`);
    if (resume.result.stdoutTail) lines.push(`- Stdout tail: ${resume.result.stdoutTail.replaceAll('\n', ' | ')}`);
    if (resume.result.stderrTail) lines.push(`- Stderr tail: ${resume.result.stderrTail.replaceAll('\n', ' | ')}`);
    if (resume.result.error) lines.push(`- Error: ${resume.result.error}`);
  }
  if (resume.operatorReadyPreflight) {
    lines.push('', '## Operator Ready Preflight', '');
    lines.push(`- OK: ${resume.operatorReadyPreflight.ok ? 'yes' : 'no'}`);
    lines.push(`- Kind: ${resume.operatorReadyPreflight.kind || 'unknown'}`);
    if (resume.operatorReadyPreflight.targetDir) lines.push(`- Target: ${resume.operatorReadyPreflight.targetDir}`);
    if (resume.operatorReadyPreflight.cdpPort) lines.push(`- CDP port: ${resume.operatorReadyPreflight.cdpPort}`);
    if (resume.operatorReadyPreflight.finalUrl) lines.push(`- Final URL: ${resume.operatorReadyPreflight.finalUrl}`);
    if (resume.operatorReadyPreflight.blocker) lines.push(`- Detail: ${resume.operatorReadyPreflight.blocker}`);
  }
  if (resume.outputPath) {
    lines.push('', '## Written Resume', '');
    lines.push(`- Path: ${resume.outputPath}`);
  }
  if (resume.result?.handoff) {
    lines.push('', '## Operator Handoff', '');
    for (const item of resume.result.handoff.instructions || []) {
      lines.push(`- ${item}`);
    }
    for (const item of resume.result.handoff.commands || []) {
      lines.push('', `### ${item.id}`);
      lines.push('');
      lines.push(`- ${item.title}`);
      if (item.shell) {
        lines.push('', '```bash');
        lines.push(item.shell);
        lines.push('```');
      }
    }
  }
  if (resume.nextAfterRun) {
    lines.push('', '## Next After Run', '');
    lines.push(`- Complete: ${resume.nextAfterRun.complete ? 'yes' : 'no'}`);
    lines.push(`- Primary action: ${resume.nextAfterRun.primaryAction?.id || 'none'}`);
    lines.push(`- Label: ${resume.nextAfterRun.primaryAction?.label || 'none'}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
