import fs from 'node:fs';
import path from 'node:path';
import { buildProofGateStatus } from './proof-gate-status.mjs';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function noBrowserSafeNext(id, commandValue, blockedReason = 'none') {
  return {
    id,
    command: commandValue,
    mayRunUnattended: Boolean(commandValue),
    opensBrowser: false,
    startsCapture: false,
    startsBackground: false,
    readsBrowserStorage: false,
    returnsPageContent: false,
    blockedReason
  };
}

function compactValue(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function yesNoUnknown(value) {
  if (value === null || value === undefined) return 'unknown';
  return value ? 'yes' : 'no';
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/login-handoff-status-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid login handoff status output path: ${outPath}`);
  return outputPath;
}

function deriveNextAction(gate) {
  if (gate.complete) return 'completion-audit';
  if (gate.authUsable) return 'run-auth-first-proof-capture';
  if (gate.handoffAuthCheckPortReachable === true && gate.monitorCommand?.shell) return 'monitor-login';
  if (gate.handoffAuthCheckPort && gate.handoffAuthCheckPortReachable === false) return 'open-login-browser';
  if (gate.resumeCommand?.shell) return 'open-or-wait-login';
  return gate.nextAction?.id || 'review-proof-gate';
}

export async function buildLoginHandoffStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const proofGateStatus = options.proofGateStatus || await buildProofGateStatus({
    ...options,
    rootDir,
    generatedAt,
    write: false,
    out: ''
  });
  const loginRequired = !proofGateStatus.complete && !proofGateStatus.authUsable;
  const safeMonitorAvailable = Boolean(
    proofGateStatus.monitorCommand?.shell
      && proofGateStatus.handoffAuthCheckPortReachable === true
      && !proofGateStatus.authUsable
  );
  const captureAllowedNow = Boolean(proofGateStatus.authUsable && !proofGateStatus.loginLike);
  const completionAuditCommand = command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']);
  const fallbackSafeNext = proofGateStatus.agentSafeNext?.id
    ? {
      id: proofGateStatus.agentSafeNext.id,
      command: proofGateStatus.agentSafeNext.command || null,
      mayRunUnattended: Boolean(proofGateStatus.agentSafeNext.mayRunUnattended),
      opensBrowser: Boolean(proofGateStatus.agentSafeNext.opensBrowser),
      startsCapture: Boolean(proofGateStatus.agentSafeNext.startsCapture),
      startsBackground: Boolean(proofGateStatus.agentSafeNext.startsBackground),
      readsBrowserStorage: Boolean(proofGateStatus.agentSafeNext.readsBrowserStorage),
      returnsPageContent: Boolean(proofGateStatus.agentSafeNext.returnsPageContent),
      blockedReason: proofGateStatus.agentSafeNext.blockedReason || 'none'
    }
    : noBrowserSafeNext('proof-gate-status', command(['node', 'src/cli.mjs', 'proof-gate-status', '--format', 'compact']), 'no-monitor-command');
  const agentSafeNext = proofGateStatus.complete
    ? noBrowserSafeNext('objective-completion-audit', completionAuditCommand, 'none')
    : safeMonitorAvailable
      ? noBrowserSafeNext('auth-watch', proofGateStatus.monitorCommand, 'none')
      : fallbackSafeNext;
  const status = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    complete: Boolean(proofGateStatus.complete),
    status: proofGateStatus.status || 'unknown',
    nextAction: deriveNextAction(proofGateStatus),
    target: proofGateStatus.target || '',
    targetDir: proofGateStatus.targetDir || '',
    loginRequired,
    authCheckOk: Boolean(proofGateStatus.authCheckOk),
    loginLike: Boolean(proofGateStatus.loginLike),
    authState: proofGateStatus.authState || 'unknown',
    authUsable: Boolean(proofGateStatus.authUsable),
    dedicatedBrowserPort: proofGateStatus.handoffAuthCheckPort || '',
    dedicatedBrowserReachable: proofGateStatus.handoffAuthCheckPortReachable,
    safeMonitorAvailable,
    safeMonitorOnly: true,
    safeMonitorCommand: proofGateStatus.monitorCommand || null,
    authFirstResumeAvailable: Boolean(proofGateStatus.resumeCommand?.shell),
    authFirstResumeMayOpenBrowser: Boolean(proofGateStatus.resumeCommand?.shell),
    authFirstResumeStartsCaptureAfterAuthOnly: true,
    authFirstResumeCommand: proofGateStatus.resumeCommand || null,
    captureAllowedNow,
    proofCaptureBlockedUntilAuth: Boolean(!captureAllowedNow && proofGateStatus.operatorGuidance?.captureBlocked),
    humanAction: proofGateStatus.operatorGuidance?.humanAction || 'unknown',
    automationBlocker: proofGateStatus.operatorGuidance?.automationBlocker || 'unknown',
    nextArtifactAction: proofGateStatus.nextArtifactAction || '',
    nextArtifactBlocker: proofGateStatus.nextArtifactBlocker || '',
    missingArtifactCount: proofGateStatus.missingArtifactCount ?? 0,
    missingArtifacts: (proofGateStatus.missingArtifacts || []).map((item) => item.id).filter(Boolean),
    missingOutputFiles: proofGateStatus.missingOutputFiles || [],
    commands: {
      status: command(['node', 'src/cli.mjs', 'login-handoff-status', '--format', 'compact']),
      proofGateStatus: command(['node', 'src/cli.mjs', 'proof-gate-status', '--format', 'compact']),
      objectiveStatus: command(['node', 'src/cli.mjs', 'objective-status', '--format', 'compact']),
      completionAudit: completionAuditCommand,
      monitor: proofGateStatus.monitorCommand || null,
      resume: proofGateStatus.resumeCommand || null
    },
    agentSafeNext,
    outputPath: ''
  };
  if (options.write || options.out || options.output) {
    const outputPath = safeRunPath(rootDir, options.out || options.output);
    status.outputPath = outputPath;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  }
  return status;
}

export function formatLoginHandoffStatusCompact(status) {
  const lines = [
    `status: ${compactValue(status.status)}`,
    `complete: ${yesNo(status.complete)}`,
    `next_action: ${compactValue(status.nextAction)}`,
    `target: ${compactValue(status.target)}`,
    `target_dir: ${compactValue(status.targetDir)}`,
    `login_required: ${yesNo(status.loginRequired)}`,
    `auth_check_ok: ${yesNo(status.authCheckOk)}`,
    `login_like: ${yesNo(status.loginLike)}`,
    `auth_state: ${compactValue(status.authState)}`,
    `auth_usable: ${yesNo(status.authUsable)}`,
    `dedicated_browser_port: ${compactValue(status.dedicatedBrowserPort)}`,
    `dedicated_browser_reachable: ${yesNoUnknown(status.dedicatedBrowserReachable)}`,
    `safe_monitor_available: ${yesNo(status.safeMonitorAvailable)}`,
    `safe_monitor_only: ${yesNo(status.safeMonitorOnly)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `capture_allowed_now: ${yesNo(status.captureAllowedNow)}`,
    `proof_capture_blocked_until_auth: ${yesNo(status.proofCaptureBlockedUntilAuth)}`,
    `human_action: ${compactValue(status.humanAction)}`,
    `automation_blocker: ${compactValue(status.automationBlocker)}`,
    `next_artifact_action: ${compactValue(status.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(status.nextArtifactBlocker)}`,
    `missing_artifact_count: ${status.missingArtifactCount ?? 0}`,
    `missing_artifacts: ${status.missingArtifacts?.length ? status.missingArtifacts.join(',') : 'none'}`,
    `missing_output_files: ${status.missingOutputFiles?.length ? status.missingOutputFiles.join(',') : 'none'}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`
  ];
  if (status.outputPath) lines.push(`output_path: ${status.outputPath}`);
  lines.push(`agent_safe_next_command_id: ${compactValue(status.agentSafeNext?.id)}`);
  lines.push(`agent_safe_next_may_run_unattended: ${yesNo(status.agentSafeNext?.mayRunUnattended)}`);
  lines.push(`agent_safe_next_opens_browser: ${yesNo(status.agentSafeNext?.opensBrowser)}`);
  lines.push(`agent_safe_next_starts_capture: ${yesNo(status.agentSafeNext?.startsCapture)}`);
  lines.push(`agent_safe_next_starts_background: ${yesNo(status.agentSafeNext?.startsBackground)}`);
  lines.push(`agent_safe_next_reads_browser_storage: ${yesNo(status.agentSafeNext?.readsBrowserStorage)}`);
  lines.push(`agent_safe_next_returns_page_content: ${yesNo(status.agentSafeNext?.returnsPageContent)}`);
  lines.push(`agent_safe_next_blocked_reason: ${compactValue(status.agentSafeNext?.blockedReason)}`);
  if (status.agentSafeNext?.command?.shell) lines.push(`agent_safe_next_command: ${status.agentSafeNext.command.shell}`);
  if (status.safeMonitorCommand?.shell) lines.push(`safe_monitor_command: ${status.safeMonitorCommand.shell}`);
  if (status.authFirstResumeCommand?.shell) lines.push(`auth_first_resume_command: ${status.authFirstResumeCommand.shell}`);
  if (status.commands?.status?.shell) lines.push(`status_command: ${status.commands.status.shell}`);
  if (status.commands?.completionAudit?.shell) lines.push(`completion_audit_command: ${status.commands.completionAudit.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatLoginHandoffStatusMarkdown(status) {
  const lines = [
    '# Secure Browser Agent Login Handoff Status',
    '',
    `Generated: ${status.generatedAt}`,
    `Root: ${status.rootDir}`,
    `Status: ${status.status}`,
    `Complete: ${status.complete ? 'yes' : 'no'}`,
    `Safe mode: ${status.safeMode ? 'yes' : 'no'}`,
    `Secret values read: ${status.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Login Gate',
    '',
    `- Target: ${status.target || 'none'}`,
    `- Target dir: ${status.targetDir || 'none'}`,
    `- Login required: ${status.loginRequired ? 'yes' : 'no'}`,
    `- Auth-check OK: ${status.authCheckOk ? 'yes' : 'no'}`,
    `- Login-like: ${status.loginLike ? 'yes' : 'no'}`,
    `- Auth state: ${status.authState || 'unknown'}`,
    `- Auth usable: ${status.authUsable ? 'yes' : 'no'}`,
    `- Dedicated browser port: ${status.dedicatedBrowserPort || 'none'}`,
    `- Dedicated browser reachable: ${yesNoUnknown(status.dedicatedBrowserReachable)}`,
    '',
    '## Next',
    '',
    `- Next action: ${status.nextAction || 'none'}`,
    `- Human action: ${status.humanAction || 'unknown'}`,
    `- Automation blocker: ${status.automationBlocker || 'unknown'}`,
    `- Safe monitor available: ${status.safeMonitorAvailable ? 'yes' : 'no'}`,
    `- Capture allowed now: ${status.captureAllowedNow ? 'yes' : 'no'}`,
    `- Proof capture blocked until auth: ${status.proofCaptureBlockedUntilAuth ? 'yes' : 'no'}`
  ];
  if (status.safeMonitorCommand?.shell) {
    lines.push('', '### Safe Monitor', '', '```bash', status.safeMonitorCommand.shell, '```');
  }
  if (status.authFirstResumeCommand?.shell) {
    lines.push('', '### Auth-First Resume', '', '```bash', status.authFirstResumeCommand.shell, '```');
  }
  lines.push('', '## Missing Artifacts', '');
  if (!status.missingArtifacts?.length) {
    lines.push('- none');
  } else {
    for (const item of status.missingArtifacts) lines.push(`- ${item}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
