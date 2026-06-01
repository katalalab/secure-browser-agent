import { buildTargetProofCapture, formatTargetProofCaptureCompact } from './target-proof-capture.mjs';
import { buildTargetProofPlan } from './target-proof.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return { args, shell: args.map(shellQuote).join(' ') };
}

export async function buildTargetBatch(targetDir, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const realExternal = Boolean(options.realExternal || options['real-external']);
  const capture = await buildTargetProofCapture(targetDir, {
    ...options,
    generatedAt,
    realExternal,
    run,
    waitAuth: Boolean(options.waitAuth || options['wait-auth'])
  });
  const plan = run ? null : (options.plan || await buildTargetProofPlan(targetDir, {
    ...options,
    generatedAt,
    realExternal,
    benchmarkFile: options.benchmarkFile || options['benchmark-file']
  }));
  return {
    schemaVersion: 1,
    generatedAt,
    targetDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    run,
    realExternal,
    status: capture.status,
    readyToRun: Boolean(capture.readyToRun),
    blockerCount: capture.blockers.length,
    blockers: capture.blockers,
    waitAuth: capture.waitAuth,
    stepCount: capture.steps.length,
    completedSteps: capture.steps.filter((step) => step.status === 'completed').length,
    nextStep: capture.steps.find((step) => step.status === 'pending' || step.status === 'running')?.id || '',
    capture,
    plan,
    runCommand: command([
      'node',
      'src/cli.mjs',
      'target-batch',
      targetDir,
      ...(realExternal ? ['--real-external'] : []),
      '--run',
      ...(options.waitAuth || options['wait-auth'] ? ['--wait-auth'] : []),
      '--format',
      'compact'
    ])
  };
}

export function formatTargetBatchCompact(batch) {
  const lines = [
    `safe_mode: ${yesNo(batch.safeMode)}`,
    `destructive_actions: ${yesNo(batch.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(batch.secretValuesRead)}`,
    `run: ${yesNo(batch.run)}`,
    `real_external: ${yesNo(batch.realExternal)}`,
    `status: ${compactValue(batch.status)}`,
    `ready: ${yesNo(batch.readyToRun)}`,
    `blockers: ${batch.blockerCount}`,
    `wait_auth: ${batch.waitAuth?.enabled ? compactValue(batch.waitAuth.status) : 'no'}`,
    `steps: ${batch.stepCount}`,
    `completed_steps: ${batch.completedSteps}`,
    `next_step: ${compactValue(batch.nextStep)}`,
    `run_command: ${batch.runCommand.shell}`
  ];
  if (batch.blockers[0]) lines.push(`detail: ${compactValue(batch.blockers[0])}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetBatchMarkdown(batch) {
  return `# Secure Browser Agent Target Batch\n\n${formatTargetBatchCompact(batch)}\n## Capture\n\n\`\`\`text\n${formatTargetProofCaptureCompact(batch.capture)}\`\`\`\n`;
}
