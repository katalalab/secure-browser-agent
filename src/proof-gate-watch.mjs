import fs from 'node:fs';
import path from 'node:path';
import { buildProofGateStatus } from './proof-gate-status.mjs';
import { toPosixPath } from './output.mjs';

function compactValue(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/proof-gate-watch-status.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid proof gate watch output path: ${outPath}`);
  return outputPath;
}

function attemptFromStatus(status, attempt) {
  return {
    attempt,
    generatedAt: status.generatedAt || '',
    complete: Boolean(status.complete),
    objectiveComplete: Boolean(status.objectiveComplete),
    status: status.status || '',
    target: status.target || '',
    nextAction: status.nextAction?.id || '',
    authCheckOk: Boolean(status.authCheckOk),
    loginLike: Boolean(status.loginLike),
    authStatusSource: status.authStatusSource || '',
    authFinalUrl: status.authFinalUrl || '',
    authTitle: status.authTitle || '',
    acceptedExternalProofCount: status.acceptedExternalProofCount ?? 0,
    missingArtifactCount: status.missingArtifactCount ?? 0
  };
}

function reportFromState({ rootDir, generatedAt, timeoutMs, intervalMs, attempts, lastStatus, status, outputPath }) {
  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    status,
    complete: Boolean(lastStatus?.complete),
    objectiveComplete: Boolean(lastStatus?.objectiveComplete),
    timeoutMs,
    intervalMs,
    attemptCount: attempts.length,
    attempts,
    lastStatus,
    nextAction: lastStatus?.nextAction || null,
    operatorGuidance: lastStatus?.operatorGuidance || null,
    recommendedCommand: lastStatus?.recommendedCommand || null,
    outputPath: outputPath || ''
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function buildProofGateWatch(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const timeoutMs = Number(options.timeoutMs ?? options['timeout-ms'] ?? 300000);
  const intervalMs = Number(options.intervalMs ?? options['interval-ms'] ?? 5000);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const now = options.now || (() => Date.now());
  const sleeper = options.sleep || sleep;
  const statusBuilder = options.statusBuilder || buildProofGateStatus;
  const writeWatch = Boolean(options.write || options.out || options.output);
  const outputPath = writeWatch ? toPosixPath(safeRunPath(rootDir, options.out || options.output)) : '';
  const writeStatus = Boolean(options.writeStatus || options['write-status']);
  const statusOut = options.statusOut || options['status-out'] || 'operator/proof-gate-status-latest.json';
  const startedAtMs = now();
  const attempts = [];
  let lastStatus = null;
  let status = 'waiting';

  while (true) {
    lastStatus = await statusBuilder({
      ...options,
      rootDir,
      write: writeStatus,
      out: writeStatus ? statusOut : ''
    });
    attempts.push(attemptFromStatus(lastStatus, attempts.length + 1));

    if (lastStatus.complete) {
      status = 'complete';
    } else if (now() - startedAtMs >= timeoutMs) {
      status = 'timed-out';
    }

    const report = reportFromState({
      rootDir,
      generatedAt,
      timeoutMs,
      intervalMs,
      attempts,
      lastStatus,
      status,
      outputPath
    });
    if (outputPath) writeJson(outputPath, report);
    if (status !== 'waiting') return report;
    await sleeper(intervalMs);
  }
}

export function formatProofGateWatchCompact(report) {
  const last = report.lastStatus || {};
  const lines = [
    `status: ${compactValue(report.status)}`,
    `complete: ${yesNo(report.complete)}`,
    `objective_complete: ${yesNo(report.objectiveComplete)}`,
    `attempts: ${report.attemptCount || 0}`,
    `timeout_ms: ${report.timeoutMs}`,
    `interval_ms: ${report.intervalMs}`,
    `last_gate_status: ${compactValue(last.status)}`,
    `target: ${compactValue(last.target)}`,
    `next: ${compactValue(report.nextAction?.id)}`,
    `human_action: ${compactValue(report.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(report.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(report.operatorGuidance?.captureBlocked)}`,
    `auth_check_ok: ${yesNo(last.authCheckOk)}`,
    `login_like: ${yesNo(last.loginLike)}`,
    `auth_status_source: ${compactValue(last.authStatusSource)}`,
    `auth_final_url: ${compactValue(last.authFinalUrl)}`,
    `missing_artifact_count: ${last.missingArtifactCount ?? 0}`,
    `accepted_external_proofs: ${last.acceptedExternalProofCount ?? 0}`,
    `secret_values_read: ${yesNo(report.secretValuesRead)}`,
    `destructive_actions: ${yesNo(report.destructiveActionsIncluded)}`
  ];
  if (report.outputPath) lines.push(`output_path: ${toPosixPath(report.outputPath)}`);
  if (report.nextAction?.command?.shell) lines.push(`command: ${report.nextAction.command.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatProofGateWatchMarkdown(report) {
  const last = report.lastStatus || {};
  const lines = [
    '# Secure Browser Agent Proof Gate Watch',
    '',
    `Generated: ${report.generatedAt}`,
    `Root: ${report.rootDir}`,
    `Status: ${report.status}`,
    `Complete: ${report.complete ? 'yes' : 'no'}`,
    `Objective complete: ${report.objectiveComplete ? 'yes' : 'no'}`,
    `Attempts: ${report.attemptCount || 0}`,
    `Timeout ms: ${report.timeoutMs}`,
    `Interval ms: ${report.intervalMs}`,
    `Output path: ${report.outputPath || 'none'}`,
    `Safe mode: ${report.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${report.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${report.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Last Gate Status',
    '',
    `- Status: ${last.status || 'none'}`,
    `- Target: ${last.target || 'none'}`,
    `- Auth-check OK: ${last.authCheckOk ? 'yes' : 'no'}`,
    `- Login-like: ${last.loginLike ? 'yes' : 'no'}`,
    `- Auth status source: ${last.authStatusSource || 'none'}`,
    `- Auth final URL: ${last.authFinalUrl || 'none'}`,
    `- Missing artifact count: ${last.missingArtifactCount ?? 0}`,
    `- Accepted external proofs: ${last.acceptedExternalProofCount ?? 0}`,
    '',
    '## Next Action',
    '',
    `- ID: ${report.nextAction?.id || 'none'}`,
    `- Human action: ${report.operatorGuidance?.humanAction || 'unknown'}`,
    `- Automation blocker: ${report.operatorGuidance?.automationBlocker || 'unknown'}`,
    `- Capture blocked: ${report.operatorGuidance?.captureBlocked ? 'yes' : 'no'}`
  ];
  if (report.nextAction?.command?.shell) {
    lines.push('', '```bash', report.nextAction.command.shell, '```');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
