import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildTargetProofPlan } from './target-proof.mjs';
import { buildTargetAuthCheck } from './target-auth-check.mjs';
import { buildObjectiveCompletionAudit } from './objective-completion-audit.mjs';
import { toPosixPath } from './output.mjs';

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function commandById(plan, id) {
  return plan.commands.find((item) => item.id === id)?.command || null;
}

function stepFromPlan(plan, id, label = '') {
  const planned = commandById(plan, id);
  return {
    id,
    label: label || plan.commands.find((item) => item.id === id)?.title || id,
    command: planned
  };
}

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
  return {
    ok: Boolean(result.ok),
    status: result.status ?? null,
    signal: result.signal || '',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stdoutTail: stdout.split(/\r?\n/).slice(-3).join('\n').slice(-800),
    stderrTail: stderr.split(/\r?\n/).slice(-3).join('\n').slice(-800),
    error: result.error || ''
  };
}

function prerequisiteBlockers(plan) {
  return [
    !plan.realExternal ? 'Run with --real-external after choosing an operator-approved real service target.' : '',
    plan.externalOrigins.length === 0 ? 'Target pack has no real external origin.' : '',
    !plan.currentState.auditOk ? 'Target audit is not clean.' : '',
    !plan.currentState.profileLikelyAuthenticated ? 'Dedicated profile does not yet look authenticated.' : ''
  ].filter(Boolean);
}

function outputStepIds(missingOutputs) {
  const ids = [];
  if (missingOutputs.includes('observe.json')) ids.push('observe');
  if (missingOutputs.includes('inspect.json')) ids.push('inspect');
  if (missingOutputs.includes('scrape.csv')) ids.push('scrape');
  return ids;
}

function buildCaptureSteps(plan, options = {}) {
  const steps = [];
  if (plan.currentState.permissionsPending > 0 && options.applyPermissions) {
    steps.push(stepFromPlan(plan, 'permissions'));
  }
  if (!plan.currentState.daemonRunning && options.startDaemon !== false) {
    steps.push(stepFromPlan(plan, 'start-daemon'));
  }
  if (!plan.currentState.authCheck?.ok) {
    steps.push(stepFromPlan(plan, 'auth-check'));
  }
  for (const id of outputStepIds(plan.currentState.missingOutputs || [])) {
    steps.push(stepFromPlan(plan, id));
  }
  if (!plan.currentState.benchmark.ok) {
    steps.push(stepFromPlan(plan, 'benchmark'));
  }
  steps.push(stepFromPlan(plan, 'write-proof'));
  if (options.stopDaemon) {
    steps.push({
      id: 'stop-daemon',
      label: 'Stop the target background Chrome/CDP daemon',
      command: command(['node', 'src/cli.mjs', 'target-daemon', plan.dir, 'stop'])
    });
  }
  return steps.filter((step) => step.command);
}

function captureRunCommand(targetDir, plan, options = {}) {
  const args = [
    'node',
    'src/cli.mjs',
    'target-proof-capture',
    targetDir,
    ...(plan.realExternal ? ['--real-external'] : []),
    '--run'
  ];
  if (options.waitAuth || options['wait-auth']) args.push('--wait-auth');
  if (options.authCheckPort || options['auth-check-port']) args.push('--auth-check-port', String(options.authCheckPort || options['auth-check-port']));
  if (options.waitAuthTimeoutMs || options['wait-auth-timeout-ms']) args.push('--wait-auth-timeout-ms', String(options.waitAuthTimeoutMs || options['wait-auth-timeout-ms']));
  if (options.waitAuthIntervalMs || options['wait-auth-interval-ms']) args.push('--wait-auth-interval-ms', String(options.waitAuthIntervalMs || options['wait-auth-interval-ms']));
  const waitOut = waitAuthStatusOut(options);
  if (waitOut) args.push('--wait-auth-status-out', waitOut);
  if (options.benchmarkFile || options['benchmark-file']) args.push('--benchmark-file', String(options.benchmarkFile || options['benchmark-file']));
  if (options.applyPermissions || options['apply-permissions']) args.push('--apply-permissions');
  if (options.stopDaemon || options['stop-daemon']) args.push('--stop-daemon');
  if (options.completionAudit || options['completion-audit']) args.push('--completion-audit');
  if (options.cleanupOnFailure === false || options['no-cleanup-on-failure']) args.push('--no-cleanup-on-failure');
  args.push('--format', 'compact');
  return command(args);
}

function stopDaemonCommand(plan) {
  return command(['node', 'src/cli.mjs', 'target-daemon', plan.dir, 'stop']);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitAuthBlockers(plan) {
  return [
    !plan.realExternal ? 'Run with --real-external after choosing an operator-approved real service target.' : '',
    plan.externalOrigins.length === 0 ? 'Target pack has no real external origin.' : '',
    !plan.currentState.auditOk ? 'Target audit is not clean.' : ''
  ].filter(Boolean);
}

function buildWaitAuthStatus(options = {}) {
  return {
    enabled: Boolean(options.waitAuth || options['wait-auth']),
    timeoutMs: Number(options.waitAuthTimeoutMs || options['wait-auth-timeout-ms'] || 300000),
    intervalMs: Number(options.waitAuthIntervalMs || options['wait-auth-interval-ms'] || 5000),
    status: 'not-requested',
    attempts: [],
    outputPath: ''
  };
}

function waitAuthStatusOut(options = {}) {
  const value = options.waitAuthStatusOut || options['wait-auth-status-out'];
  if (!value) return '';
  if (value === true) return 'wait-auth-status.json';
  return String(value);
}

function targetOutputPath(plan, outPath) {
  const outputRoot = path.resolve(plan.dir, 'outputs');
  const relative = String(outPath || '').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(outputRoot, relative);
  const insideOutputRoot = outputPath === outputRoot || outputPath.startsWith(`${outputRoot}${path.sep}`);
  if (!insideOutputRoot) throw new Error(`invalid wait auth status output path: ${outPath}`);
  return outputPath;
}

function writeWaitAuthStatus(plan, waitAuth, options = {}) {
  const out = waitAuthStatusOut(options);
  if (!out) return '';
  const outputPath = targetOutputPath(plan, out);
  waitAuth.outputPath = toPosixPath(outputPath);
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: plan.target,
    dir: plan.dir,
    profile: plan.profile,
    realExternal: plan.realExternal,
    status: waitAuth.status,
    enabled: waitAuth.enabled,
    timeoutMs: waitAuth.timeoutMs,
    intervalMs: waitAuth.intervalMs,
    attempts: waitAuth.attempts
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const rootDir = plan.rootDir || path.resolve(path.dirname(path.dirname(plan.dir)));
  return toPosixPath(path.relative(path.resolve(rootDir), outputPath));
}

async function waitForAuthPlan(targetDir, plan, options = {}) {
  const waitAuth = buildWaitAuthStatus(options);
  if (!waitAuth.enabled) return { plan, waitAuth };

  const blockers = waitAuthBlockers(plan);
  if (blockers.length > 0) {
    waitAuth.status = 'blocked';
    writeWaitAuthStatus(plan, waitAuth, options);
    return { plan, waitAuth, blockers };
  }

  waitAuth.status = 'waiting';
  writeWaitAuthStatus(plan, waitAuth, options);
  const startedAt = Date.now();
  let attempt = 0;
  let currentPlan = plan;
  const sleeper = options.sleep || sleep;
  const authCheckBuilder = options.authCheckBuilder || buildTargetAuthCheck;
  const planBuilder = options.planBuilder || buildTargetProofPlan;
  while (Date.now() - startedAt <= waitAuth.timeoutMs) {
    attempt += 1;
    let authCheckRefresh = null;
    if (!currentPlan.currentState.authCheck?.ok) {
      try {
        const authCheck = await authCheckBuilder(targetDir, {
          ...options,
          write: true,
          daemon: Boolean(options.authCheckDaemon || options['auth-check-daemon']),
          cdpPort: options.authCheckPort || options['auth-check-port']
        });
        authCheckRefresh = {
          ok: Boolean(authCheck.ok),
          finalUrl: authCheck.finalUrl || '',
          loginLike: Boolean(authCheck.loginLike),
          error: ''
        };
        currentPlan = await planBuilder(targetDir, {
          ...options,
          realExternal: Boolean(options.realExternal || options['real-external']),
          benchmarkFile: options.benchmarkFile || options['benchmark-file']
        });
      } catch (error) {
        authCheckRefresh = {
          ok: false,
          finalUrl: '',
          loginLike: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    waitAuth.attempts.push({
      attempt,
      generatedAt: new Date().toISOString(),
      profileLikelyAuthenticated: Boolean(currentPlan.currentState.profileLikelyAuthenticated),
      authCheckOk: Boolean(currentPlan.currentState.authCheck?.ok),
      authCheckFinalUrl: currentPlan.currentState.authCheck?.finalUrl || '',
      authCheckRefresh
    });
    if (currentPlan.currentState.profileLikelyAuthenticated && currentPlan.currentState.authCheck?.ok) {
      waitAuth.status = 'authenticated';
      writeWaitAuthStatus(currentPlan, waitAuth, options);
      return { plan: currentPlan, waitAuth };
    }
    writeWaitAuthStatus(currentPlan, waitAuth, options);
    await sleeper(waitAuth.intervalMs);
    currentPlan = await planBuilder(targetDir, {
      ...options,
      realExternal: Boolean(options.realExternal || options['real-external']),
      benchmarkFile: options.benchmarkFile || options['benchmark-file']
    });
  }

  waitAuth.status = 'timed-out';
  writeWaitAuthStatus(currentPlan, waitAuth, options);
  return {
    plan: currentPlan,
    waitAuth,
    blockers: ['Timed out waiting for target auth-check to pass in the dedicated profile.']
  };
}

export async function buildTargetProofCapture(targetDir, options = {}) {
  const initialPlan = options.plan || await buildTargetProofPlan(targetDir, {
    ...options,
    realExternal: Boolean(options.realExternal || options['real-external']),
    benchmarkFile: options.benchmarkFile || options['benchmark-file']
  });
  const run = Boolean(options.run);
  const waited = run
    ? await waitForAuthPlan(targetDir, initialPlan, options)
    : { plan: initialPlan, waitAuth: buildWaitAuthStatus(options) };
  const plan = waited.plan;
  const blockers = prerequisiteBlockers(plan);
  const steps = buildCaptureSteps(plan, options).map((step) => ({
    ...step,
    status: 'pending',
    result: null
  }));
  const allBlockers = [...(waited.blockers || []), ...blockers];

  const capture = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    target: plan.target,
    dir: plan.dir,
    profile: plan.profile,
    realExternal: plan.realExternal,
    safeMode: true,
    destructiveActionsIncluded: false,
    writesLocalState: true,
    run,
    readyToRun: allBlockers.length === 0,
    status: allBlockers.length === 0 ? (run ? 'running' : 'planned') : 'blocked',
    blockers: allBlockers,
    waitAuth: waited.waitAuth,
    steps,
    cleanupOnFailure: options.cleanupOnFailure !== false,
    runCommand: captureRunCommand(targetDir, plan, options),
    cleanup: null,
    finalState: null,
    completionAudit: null
  };

  if (!run || allBlockers.length > 0) {
    capture.status = allBlockers.length > 0 ? 'blocked' : 'planned';
    return capture;
  }

  const runner = options.runner || defaultRunner;
  let failed = false;
  let startedDaemonByCapture = false;
  for (const step of capture.steps) {
    step.status = 'running';
    const result = summarizeRun(runner(step.command.args, {
      cwd: options.rootDir || process.cwd(),
      timeoutMs: options.timeoutMs
    }));
    step.result = result;
    step.status = result.ok ? 'completed' : 'failed';
    if (step.id === 'start-daemon' && result.ok && !plan.currentState.daemonRunning) {
      startedDaemonByCapture = true;
    }
    if (!result.ok) {
      failed = true;
      break;
    }
  }

  capture.status = failed ? 'failed' : 'completed';
  if (failed && capture.cleanupOnFailure && startedDaemonByCapture) {
    const cleanupCommand = stopDaemonCommand(plan);
    const cleanupResult = summarizeRun(runner(cleanupCommand.args, {
      cwd: options.rootDir || process.cwd(),
      timeoutMs: options.timeoutMs
    }));
    capture.cleanup = {
      id: 'stop-daemon-on-failure',
      label: 'Stop the target daemon because capture started it and a later step failed',
      command: cleanupCommand,
      status: cleanupResult.ok ? 'completed' : 'failed',
      result: cleanupResult
    };
  }
  if (!failed && !options.skipFinalPlan) {
    const finalPlan = await buildTargetProofPlan(plan.dir, {
      ...options,
      realExternal: plan.realExternal,
      benchmarkFile: options.benchmarkFile || options['benchmark-file']
    });
    capture.finalState = finalPlan.currentState;
  }
  if (!failed && (options.completionAudit || options['completion-audit'])) {
    const completionAuditBuilder = options.completionAuditBuilder || buildObjectiveCompletionAudit;
    const audit = await completionAuditBuilder({
      ...options,
      rootDir: options.rootDir || process.cwd()
    });
    capture.completionAudit = {
      complete: Boolean(audit.complete),
      status: audit.status || '',
      remainingCount: audit.finalGate?.remainingCount ?? 0,
      remaining: (audit.remaining || []).map((item) => item.id)
    };
  }
  return capture;
}

export function formatTargetProofCaptureCompact(capture) {
  const completed = capture.steps.filter((step) => step.status === 'completed').length;
  const failed = capture.steps.find((step) => step.status === 'failed');
  const next = capture.steps.find((step) => step.status === 'pending' || step.status === 'running');
  const lines = [
    `status: ${compactValue(capture.status)}`,
    `run: ${yesNo(capture.run)}`,
    `ready: ${yesNo(capture.readyToRun)}`,
    `real_external: ${yesNo(capture.realExternal)}`,
    `wait_auth: ${capture.waitAuth?.enabled ? compactValue(capture.waitAuth.status) : 'no'}`,
    `wait_auth_attempts: ${capture.waitAuth?.attempts?.length || 0}`,
    `blockers: ${capture.blockers.length}`,
    `steps: ${capture.steps.length}`,
    `completed_steps: ${completed}`
  ];
  if (failed) lines.push(`failed_step: ${compactValue(failed.id)}`);
  if (next) lines.push(`next_step: ${compactValue(next.id)}`);
  if (capture.cleanup) lines.push(`cleanup: ${compactValue(capture.cleanup.status)}`);
  if (capture.finalState) {
    lines.push(`proof_ready: ${yesNo(capture.finalState.proofReady)}`);
    lines.push(`auth_check_ok: ${yesNo(capture.finalState.authCheck?.ok)}`);
    lines.push(`missing_outputs: ${capture.finalState.missingOutputs.length}`);
    lines.push(`benchmark_ok: ${yesNo(capture.finalState.benchmark?.ok)}`);
  }
  if (capture.completionAudit) {
    lines.push(`completion_audit: ${capture.completionAudit.status || 'unknown'}`);
    lines.push(`completion_complete: ${yesNo(capture.completionAudit.complete)}`);
    lines.push(`completion_remaining: ${capture.completionAudit.remainingCount ?? 0}`);
  }
  if (capture.waitAuth?.outputPath) lines.push(`wait_auth_status: ${compactValue(capture.waitAuth.outputPath)}`);
  if (capture.blockers.length > 0) lines.push(`detail: ${compactValue(capture.blockers[0])}`);
  if (capture.runCommand?.shell) lines.push(`run_command: ${capture.runCommand.shell}`);
  if (!capture.run && next?.command?.shell) {
    lines.push(`command: ${next.command.shell}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetProofCaptureMarkdown(capture) {
  const lines = [
    '# Secure Browser Agent Target Proof Capture',
    '',
    `Generated: ${capture.generatedAt}`,
    `Target: ${capture.target}`,
    `Profile: ${capture.profile}`,
    `Real external: ${capture.realExternal ? 'yes' : 'no'}`,
    `Run mode: ${capture.run ? 'yes' : 'no'}`,
    `Ready to run: ${capture.readyToRun ? 'yes' : 'no'}`,
    `Status: ${capture.status}`,
    `Safe mode: ${capture.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${capture.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Wait auth: ${capture.waitAuth?.enabled ? `${capture.waitAuth.status} (${capture.waitAuth.attempts.length} attempt(s))` : 'no'}`,
    `Wait auth status: ${capture.waitAuth?.outputPath || 'none'}`,
    '',
    '## Blockers',
    ''
  ];
  if (capture.blockers.length === 0) {
    lines.push('- none');
  } else {
    for (const blocker of capture.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('', '## Steps', '');
  for (const step of capture.steps) {
    lines.push(`### ${step.id}`);
    lines.push('');
    lines.push(`- Status: ${step.status}`);
    lines.push(`- Label: ${step.label}`);
    if (step.command?.shell) {
      lines.push('', '```bash');
      lines.push(step.command.shell);
      lines.push('```');
    }
    if (step.result) {
      lines.push(`- Exit: ${step.result.status}`);
      if (step.result.stdoutTail) lines.push(`- Stdout tail: ${step.result.stdoutTail.replaceAll('\n', ' | ')}`);
      if (step.result.stderrTail) lines.push(`- Stderr tail: ${step.result.stderrTail.replaceAll('\n', ' | ')}`);
      if (step.result.error) lines.push(`- Error: ${step.result.error}`);
    }
    lines.push('');
  }
  if (capture.cleanup) {
    lines.push('## Cleanup', '');
    lines.push(`- ID: ${capture.cleanup.id}`);
    lines.push(`- Status: ${capture.cleanup.status}`);
    lines.push(`- Label: ${capture.cleanup.label}`);
    if (capture.cleanup.command?.shell) {
      lines.push('', '```bash');
      lines.push(capture.cleanup.command.shell);
      lines.push('```');
    }
    if (capture.cleanup.result) {
      lines.push(`- Exit: ${capture.cleanup.result.status}`);
      if (capture.cleanup.result.stdoutTail) lines.push(`- Stdout tail: ${capture.cleanup.result.stdoutTail.replaceAll('\n', ' | ')}`);
      if (capture.cleanup.result.stderrTail) lines.push(`- Stderr tail: ${capture.cleanup.result.stderrTail.replaceAll('\n', ' | ')}`);
      if (capture.cleanup.result.error) lines.push(`- Error: ${capture.cleanup.result.error}`);
    }
    lines.push('');
  }
  if (capture.finalState) {
    lines.push('## Final State', '');
    lines.push(`- Proof ready: ${capture.finalState.proofReady ? 'yes' : 'no'}`);
    lines.push(`- Auth-check OK: ${capture.finalState.authCheck?.ok ? 'yes' : 'no'}`);
    lines.push(`- Missing outputs: ${capture.finalState.missingOutputs.join(', ') || 'none'}`);
    lines.push(`- Benchmark ok: ${capture.finalState.benchmark.ok ? 'yes' : 'no'}`);
    lines.push('');
  }
  if (capture.completionAudit) {
    lines.push('## Completion Audit', '');
    lines.push(`- Complete: ${capture.completionAudit.complete ? 'yes' : 'no'}`);
    lines.push(`- Status: ${capture.completionAudit.status || 'unknown'}`);
    lines.push(`- Remaining count: ${capture.completionAudit.remainingCount ?? 0}`);
    lines.push(`- Remaining: ${capture.completionAudit.remaining.join(', ') || 'none'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
