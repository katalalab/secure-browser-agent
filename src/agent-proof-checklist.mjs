import fs from 'node:fs';
import path from 'node:path';
import { buildCompletionProofBundle } from './completion-proof-bundle.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
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

function shell(value) {
  return value?.shell || '';
}

function savedCommand(value, fallback) {
  return shell(value) ? value : fallback;
}

function targetProofPlanCommand(rootDir, candidate, targetDir = '') {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolvedTargetDir = targetDir ? path.resolve(targetDir) : '';
  const targetArg = resolvedTargetDir && (resolvedTargetDir === runsRoot || resolvedTargetDir.startsWith(`${runsRoot}${path.sep}`))
    ? path.join('runs', path.relative(runsRoot, resolvedTargetDir))
    : `runs/target-packs/${candidate}`;
  return command(['node', 'src/cli.mjs', 'target-proof-plan', targetArg, '--real-external', '--format', 'compact']);
}

function safeRunPath(rootDir, outPath, fallback = 'operator/agent-proof-checklist-latest.json') {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || fallback).replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid agent proof checklist output path: ${outPath}`);
  return outputPath;
}

function runsRelativePath(rootDir, filePath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(filePath);
  const insideRuns = resolved === runsRoot || resolved.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`path is outside runs: ${filePath}`);
  return path.relative(runsRoot, resolved);
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

export async function buildAgentProofChecklist(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const candidate = options.candidate || 'github';
  const outputPath = safeRunPath(rootDir, options.out || options.output);
  const outputRelative = runsRelativePath(rootDir, outputPath);
  const { write, out, output, ...bundleOptions } = options;
  const bundle = options.bundle || await buildCompletionProofBundle({
    ...bundleOptions,
    rootDir,
    candidate
  });
  const checklist = {
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
    complete: Boolean(bundle.complete),
    verdict: bundle.verdict || (bundle.complete ? 'complete' : 'not-complete'),
    targetDir: bundle.targetDir || '',
    authState: bundle.authState || '',
    authUsable: Boolean(bundle.authUsable),
    captureBlocked: Boolean(bundle.captureBlocked),
    automationBlocker: bundle.automationBlocker || '',
    acceptedExternalProofs: bundle.acceptedExternalProofs ?? 0,
    readinessRemainingCount: bundle.readinessRemainingCount ?? 0,
    readinessRemaining: Array.isArray(bundle.readinessRemaining) ? bundle.readinessRemaining : [],
    missingArtifacts: Array.isArray(bundle.missingArtifacts) ? bundle.missingArtifacts : [],
    nextOperatorAction: bundle.complete ? 'none' : 'complete-login-and-run-operator-resume',
    operatorApprovalRequired: Boolean(bundle.targetApprovalOperatorApprovalRequired),
    operatorCommandOpensBrowser: Boolean(bundle.targetApprovalOperatorCommandOpensBrowser),
    operatorCommandStartsCapture: Boolean(bundle.targetApprovalOperatorCommandStartsCapture),
    operatorApprovalToken: bundle.targetApprovalOperatorApprovalRequired ? 'OK' : '',
    agentMustNotRunOperatorResumeUnattended: Boolean(
      bundle.targetApprovalOperatorApprovalRequired
        || bundle.targetApprovalOperatorCommandOpensBrowser
        || bundle.targetApprovalOperatorCommandStartsCapture
    ),
    commands: {
      checklist: command(['node', 'src/cli.mjs', 'agent-proof-checklist', '--candidate', candidate, '--format', 'compact']),
      checklistWrite: command(['node', 'src/cli.mjs', 'agent-proof-checklist', '--candidate', candidate, '--write', '--out', outputRelative, '--format', 'compact']),
      checklistStatus: command(['node', 'src/cli.mjs', 'agent-proof-checklist-status', '--in', outputRelative, '--format', 'compact']),
      agentPreflight: bundle.commands?.agentPreflight || command(['node', 'src/cli.mjs', 'agent-preflight', '--candidate', candidate, '--format', 'compact']),
      completionProofBundle: bundle.commands?.completionProofBundle || command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', candidate, '--include-compact-command-audit', '--format', 'compact']),
      completionProofBundleWrite: bundle.commands?.completionProofBundleWrite || command(['node', 'src/cli.mjs', 'completion-proof-bundle', '--candidate', candidate, '--include-compact-command-audit', '--write', '--out', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']),
      completionProofBundleStatus: bundle.commands?.completionProofBundleStatus || command(['node', 'src/cli.mjs', 'completion-proof-bundle-status', '--in', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']),
      targetProofPlan: bundle.commands?.targetProofPlan || null,
      operatorResume: bundle.commands?.operatorResume || null,
      objectiveCompletionStrict: bundle.commands?.objectiveCompletionStrict || command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact'])
    },
    next: bundle.complete
      ? 'Real external authenticated proof is complete.'
      : 'Operator must complete login in the dedicated browser, then run the operator resume command; agents may only run the preflight/checklist/status commands unattended.'
  };
  if (options.write) {
    writeJson(outputPath, checklist);
    checklist.outputPath = outputPath;
  }
  return checklist;
}

export function buildAgentProofChecklistStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputPath = safeRunPath(rootDir, options.in || options.input || 'operator/agent-proof-checklist-latest.json');
  const exists = fs.existsSync(inputPath);
  const nowMs = Number(options.nowMs || Date.now());
  const staleAfterSeconds = Number(options.staleAfterSeconds ?? options['stale-after-seconds'] ?? 900);
  const stat = exists ? fs.statSync(inputPath) : null;
  const ageSeconds = stat ? Math.max(0, Math.round((nowMs - stat.mtimeMs) / 1000)) : null;
  const saved = exists ? readJson(inputPath) : null;
  const parseOk = Boolean(saved && !saved.parseError);
  const stale = exists && ageSeconds !== null && Number.isFinite(staleAfterSeconds) && staleAfterSeconds >= 0
    ? ageSeconds > staleAfterSeconds
    : false;
  const candidate = saved?.candidate || options.candidate || 'github';
  const inputRelative = runsRelativePath(rootDir, inputPath);
  const fallbackTargetProofPlanCommand = targetProofPlanCommand(rootDir, candidate, saved?.targetDir || '');
  const fallbackOperatorResumeCommand = command(['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', candidate, '--real-external', '--run', '--operator-ok', 'OK', '--format', 'compact']);
  const fallbackObjectiveCompletionStrictCommand = command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']);
  const fallbackCompletionProofBundleStatusCommand = command(['node', 'src/cli.mjs', 'completion-proof-bundle-status', '--in', 'operator/completion-proof-bundle-latest.json', '--format', 'compact']);
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
    ageSeconds,
    staleAfterSeconds,
    complete: Boolean(parseOk && saved.complete),
    verdict: parseOk ? saved.verdict || (saved.complete ? 'complete' : 'not-complete') : 'unknown',
    candidate,
    targetDir: saved?.targetDir || '',
    readinessRemainingCount: parseOk ? saved.readinessRemainingCount ?? 0 : 0,
    readinessRemaining: parseOk && Array.isArray(saved.readinessRemaining) ? saved.readinessRemaining : [],
    missingArtifacts: parseOk && Array.isArray(saved.missingArtifacts) ? saved.missingArtifacts : [],
    authState: saved?.authState || '',
    authUsable: Boolean(saved?.authUsable),
    captureBlocked: Boolean(saved?.captureBlocked),
    automationBlocker: saved?.automationBlocker || '',
    acceptedExternalProofs: saved?.acceptedExternalProofs ?? 0,
    operatorApprovalRequired: Boolean(saved?.operatorApprovalRequired),
    operatorCommandOpensBrowser: Boolean(saved?.operatorCommandOpensBrowser),
    operatorCommandStartsCapture: Boolean(saved?.operatorCommandStartsCapture),
    operatorApprovalToken: saved?.operatorApprovalToken || '',
    agentMustNotRunOperatorResumeUnattended: Boolean(saved?.agentMustNotRunOperatorResumeUnattended),
    refreshCommand: command(['node', 'src/cli.mjs', 'agent-proof-checklist', '--candidate', candidate, '--write', '--out', inputRelative, '--format', 'compact']),
    targetProofPlanCommand: savedCommand(saved?.commands?.targetProofPlan, fallbackTargetProofPlanCommand),
    operatorResumeCommand: savedCommand(saved?.commands?.operatorResume, fallbackOperatorResumeCommand),
    objectiveCompletionStrictCommand: savedCommand(saved?.commands?.objectiveCompletionStrict, fallbackObjectiveCompletionStrictCommand),
    completionProofBundleStatusCommand: savedCommand(saved?.commands?.completionProofBundleStatus, fallbackCompletionProofBundleStatusCommand),
    next: !exists
      ? 'Write a fresh agent proof checklist.'
      : !parseOk
        ? 'Refresh the agent proof checklist; saved JSON could not be parsed.'
        : stale
          ? 'Refresh the stale agent proof checklist.'
          : saved.complete
            ? 'Saved agent proof checklist is complete.'
            : 'Saved agent proof checklist is incomplete; continue real external proof lane.'
  };
}

export function formatAgentProofChecklistCompact(checklist) {
  const lines = [
    `safe_mode: ${yesNo(checklist.safeMode)}`,
    `status_only: ${yesNo(checklist.statusOnly)}`,
    `destructive_actions: ${yesNo(checklist.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(checklist.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(checklist.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(checklist.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(checklist.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(checklist.pageContentReturned)}`,
    `complete: ${yesNo(checklist.complete)}`,
    `verdict: ${compact(checklist.verdict)}`,
    `candidate: ${compact(checklist.candidate)}`,
    `target_dir: ${compact(checklist.targetDir)}`,
    `auth_state: ${compact(checklist.authState)}`,
    `auth_usable: ${yesNo(checklist.authUsable)}`,
    `capture_blocked: ${yesNo(checklist.captureBlocked)}`,
    `automation_blocker: ${compact(checklist.automationBlocker)}`,
    `accepted_external_proofs: ${checklist.acceptedExternalProofs}`,
    `readiness_remaining_count: ${checklist.readinessRemainingCount}`,
    `readiness_remaining: ${checklist.readinessRemaining.join(',') || 'none'}`,
    `missing_artifacts: ${checklist.missingArtifacts.join(',') || 'none'}`,
    `next_operator_action: ${compact(checklist.nextOperatorAction)}`,
    `operator_approval_required: ${yesNo(checklist.operatorApprovalRequired)}`,
    `operator_approval_token: ${compact(checklist.operatorApprovalToken)}`,
    `operator_command_opens_browser: ${yesNo(checklist.operatorCommandOpensBrowser)}`,
    `operator_command_starts_capture: ${yesNo(checklist.operatorCommandStartsCapture)}`,
    `agent_must_not_run_operator_resume_unattended: ${yesNo(checklist.agentMustNotRunOperatorResumeUnattended)}`
  ];
  if (shell(checklist.commands?.checklist)) lines.push(`agent_proof_checklist_command: ${shell(checklist.commands.checklist)}`);
  if (shell(checklist.commands?.checklistWrite)) lines.push(`agent_proof_checklist_write_command: ${shell(checklist.commands.checklistWrite)}`);
  if (shell(checklist.commands?.checklistStatus)) lines.push(`agent_proof_checklist_status_command: ${shell(checklist.commands.checklistStatus)}`);
  if (shell(checklist.commands?.agentPreflight)) lines.push(`agent_preflight_command: ${shell(checklist.commands.agentPreflight)}`);
  if (shell(checklist.commands?.completionProofBundle)) lines.push(`completion_proof_bundle_command: ${shell(checklist.commands.completionProofBundle)}`);
  if (shell(checklist.commands?.completionProofBundleWrite)) lines.push(`completion_proof_bundle_write_command: ${shell(checklist.commands.completionProofBundleWrite)}`);
  if (shell(checklist.commands?.completionProofBundleStatus)) lines.push(`completion_proof_bundle_status_command: ${shell(checklist.commands.completionProofBundleStatus)}`);
  if (shell(checklist.commands?.targetProofPlan)) lines.push(`target_proof_plan_command: ${shell(checklist.commands.targetProofPlan)}`);
  if (shell(checklist.commands?.operatorResume)) lines.push(`operator_resume_command: ${shell(checklist.commands.operatorResume)}`);
  if (shell(checklist.commands?.objectiveCompletionStrict)) lines.push(`objective_completion_strict_command: ${shell(checklist.commands.objectiveCompletionStrict)}`);
  if (checklist.outputPath) lines.push(`output_path: ${checklist.outputPath}`);
  lines.push(`next: ${checklist.next}`);
  return `${lines.join('\n')}\n`;
}

export function formatAgentProofChecklistStatusCompact(status) {
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
    `age_seconds: ${status.ageSeconds ?? 'none'}`,
    `complete: ${yesNo(status.complete)}`,
    `verdict: ${compact(status.verdict)}`,
    `candidate: ${compact(status.candidate)}`,
    `target_dir: ${compact(status.targetDir)}`,
    `readiness_remaining_count: ${status.readinessRemainingCount}`,
    `readiness_remaining: ${status.readinessRemaining.join(',') || 'none'}`,
    `auth_state: ${compact(status.authState)}`,
    `auth_usable: ${yesNo(status.authUsable)}`,
    `capture_blocked: ${yesNo(status.captureBlocked)}`,
    `automation_blocker: ${compact(status.automationBlocker)}`,
    `accepted_external_proofs: ${status.acceptedExternalProofs}`,
    `operator_approval_required: ${yesNo(status.operatorApprovalRequired)}`,
    `operator_approval_token: ${compact(status.operatorApprovalToken)}`,
    `operator_command_opens_browser: ${yesNo(status.operatorCommandOpensBrowser)}`,
    `operator_command_starts_capture: ${yesNo(status.operatorCommandStartsCapture)}`,
    `agent_must_not_run_operator_resume_unattended: ${yesNo(status.agentMustNotRunOperatorResumeUnattended)}`,
    `missing_artifacts: ${status.missingArtifacts.join(',') || 'none'}`
  ];
  if (status.parseError) lines.push(`parse_error: ${compact(status.parseError)}`);
  if (shell(status.completionProofBundleStatusCommand)) lines.push(`completion_proof_bundle_status_command: ${shell(status.completionProofBundleStatusCommand)}`);
  if (shell(status.targetProofPlanCommand)) lines.push(`target_proof_plan_command: ${shell(status.targetProofPlanCommand)}`);
  if (shell(status.operatorResumeCommand)) lines.push(`operator_resume_command: ${shell(status.operatorResumeCommand)}`);
  if (shell(status.objectiveCompletionStrictCommand)) lines.push(`objective_completion_strict_command: ${shell(status.objectiveCompletionStrictCommand)}`);
  if (shell(status.refreshCommand)) lines.push(`refresh_command: ${shell(status.refreshCommand)}`);
  lines.push(`next: ${status.next}`);
  return `${lines.join('\n')}\n`;
}
