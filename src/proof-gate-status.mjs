import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { buildObjectiveStatus } from './objective-status.mjs';
import { buildTargetProofNext } from './target-proof.mjs';

function compactValue(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function redactedValue(value) {
  return compactValue(value, '') ? '[redacted]' : 'none';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function yesNoUnknown(value) {
  if (value === null || value === undefined) return 'unknown';
  return value ? 'yes' : 'no';
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildCommand(args) {
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

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/proof-gate-status-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid proof gate status output path: ${outPath}`);
  return outputPath;
}

function missingOutputFiles(missingArtifacts) {
  return missingArtifacts
    .filter((item) => item.kind === 'output')
    .map((item) => item.path || String(item.id || '').replace(/^output:/, ''))
    .filter(Boolean);
}

function deriveStatus(objectiveStatus, proofNext) {
  const actionId = proofNext.nextAction?.id || '';
  if (proofNext.complete) return 'complete';
  if (objectiveStatus.status === 'waiting-for-login') return 'waiting-for-login';
  if (['handoff-resume', 'login-capture'].includes(actionId)) return 'waiting-for-login';
  if (['capture', 'handoff-capture'].includes(actionId)) return 'ready-for-capture';
  if (actionId === 'write-proof') return 'ready-to-write-proof';
  if (actionId === 'permissions') return 'permissions-required';
  if (actionId === 'audit') return 'audit-required';
  if (actionId === 'create-real-target-pack') return 'needs-target';
  return objectiveStatus.status || 'action-required';
}

function deriveLoginLike(objectiveStatus) {
  return Boolean(
    objectiveStatus.authWatchLatestStatus?.loginLike
      || objectiveStatus.authWatchStatus?.loginLike
      || objectiveStatus.latestHandoffResume?.authCheck?.childStatus === 'not-ok'
      || objectiveStatus.handoffResumeWaitAuthStatus?.lastAttempt?.childStatus === 'not-ok'
      || objectiveStatus.waitAuthStatus?.lastAttempt?.childStatus === 'not-ok'
  );
}

function deriveAuthCheckOk(objectiveStatus, proofTarget) {
  if (typeof proofTarget.authCheckOk === 'boolean') return proofTarget.authCheckOk;
  if (typeof objectiveStatus.authWatchLatestStatus?.ok === 'boolean') return objectiveStatus.authWatchLatestStatus.ok;
  if (typeof objectiveStatus.authWatchStatus?.ok === 'boolean') return objectiveStatus.authWatchStatus.ok;
  if (typeof objectiveStatus.operatorReadyPreflight?.ok === 'boolean') return objectiveStatus.operatorReadyPreflight.ok;
  return false;
}

function authUsable({ profileLikelyAuthenticated, authCheckOk, loginLike }) {
  return Boolean(profileLikelyAuthenticated && authCheckOk && !loginLike);
}

function deriveAuthState({
  complete,
  usableAuth,
  profileLikelyAuthenticated,
  authCheckOk,
  loginLike,
  authStatusSource
}) {
  if (complete) return 'accepted-proof';
  if (usableAuth) return 'usable';
  if (profileLikelyAuthenticated && loginLike) return 'metadata-only-login-like';
  if (profileLikelyAuthenticated && authStatusSource === 'none') return 'metadata-only-unchecked';
  if (profileLikelyAuthenticated && authCheckOk === false) return 'metadata-only-auth-check-failed';
  if (profileLikelyAuthenticated) return 'metadata-only-not-usable';
  return 'not-authenticated';
}

function deriveAuthStatus(objectiveStatus) {
  const candidates = [
    ['auth-watch-latest', objectiveStatus.authWatchLatestStatus],
    ['auth-watch', objectiveStatus.authWatchStatus],
    ['handoff-resume-wait-auth', objectiveStatus.handoffResumeWaitAuthStatus?.lastAttempt],
    ['latest-handoff-resume-auth-check', objectiveStatus.latestHandoffResume?.authCheck],
    ['wait-auth', objectiveStatus.waitAuthStatus?.lastAttempt],
    ['latest-handoff-run-preflight', objectiveStatus.latestHandoffRun?.authPreflight],
    ['operator-ready-preflight', objectiveStatus.operatorReadyPreflight]
  ];
  for (const [source, value] of candidates) {
    if (!value) continue;
    const finalUrl = value.finalUrl || value.authCheckFinalUrl || '';
    const title = value.title || '';
    const ok = value.ok ?? value.authCheckOk ?? value.profileLikelyAuthenticated ?? null;
    const loginLike = value.loginLike ?? null;
    const childStatus = value.childStatus || '';
    if (finalUrl || title || ok !== null || loginLike !== null || childStatus) {
      return {
        source,
        ok,
        loginLike,
        finalUrl,
        title,
        childStatus
      };
    }
  }
  return {
    source: 'none',
    ok: null,
    loginLike: null,
    finalUrl: '',
    title: '',
    childStatus: ''
  };
}

function deriveHandoffAuthCheckPort(objectiveStatus) {
  return objectiveStatus.operatorHandoff?.authCheckPort
    || objectiveStatus.latestHandoffResume?.loginOpen?.port
    || objectiveStatus.operatorReadyPreflight?.cdpPort
    || '';
}

function deriveApprovalCandidate(proofTarget) {
  if (proofTarget.target) return proofTarget.target;
  if (proofTarget.dir) return path.basename(String(proofTarget.dir));
  return 'github';
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

function deriveArtifactAction({ missingArtifacts, authCheckOk, benchmarkOk, nextActionId }) {
  const ids = new Set((missingArtifacts || []).map((item) => item.id).filter(Boolean));
  const outputCount = (missingArtifacts || []).filter((item) => item.kind === 'output').length;
  const captureAction = ['handoff-resume', 'login-capture', 'capture', 'handoff-capture'].includes(nextActionId);

  if (ids.size === 0) {
    return {
      nextArtifactAction: 'none',
      nextArtifactBlocker: 'none',
      artifactCommandCovers: []
    };
  }
  if (ids.has('auth-check') && !authCheckOk) {
    return {
      nextArtifactAction: captureAction ? 'wait-auth-then-capture-proof' : 'prove-auth-check',
      nextArtifactBlocker: 'auth-check-not-ok',
      artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof']
    };
  }
  if (outputCount > 0 || !benchmarkOk || ids.has('benchmark')) {
    return {
      nextArtifactAction: captureAction ? 'run-proof-capture' : 'prepare-proof-capture',
      nextArtifactBlocker: 'none',
      artifactCommandCovers: ['observe', 'inspect', 'scrape', 'benchmark', 'target-proof']
    };
  }
  if (ids.has('target-proof')) {
    return {
      nextArtifactAction: nextActionId === 'write-proof' ? 'write-target-proof' : 'prepare-target-proof',
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

function refineGuidanceForReachableLoginBrowser(guidance, {
  authCheckOk,
  handoffAuthCheckPortReachable,
  nextActionId
}) {
  if (authCheckOk || handoffAuthCheckPortReachable !== true) return guidance;
  if (!['handoff-resume', 'login-capture'].includes(nextActionId)) return guidance;
  return {
    ...guidance,
    humanAction: 'complete-login-in-open-dedicated-browser',
    automationBlocker: 'auth-check-not-ok',
    captureBlocked: true
  };
}

export async function buildProofGateStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const objectiveStatus = options.objectiveStatus || await buildObjectiveStatus({
    ...options,
    rootDir,
    generatedAt,
    write: false,
    out: ''
  });
  const proofNext = options.targetProofNext || await buildTargetProofNext(rootDir, {
    ...options,
    realExternal: true
  });
  const proofTarget = proofNext.target || {};
  const proofGuidance = proofTarget.operatorGuidance || {};
  const objectiveGuidance = objectiveStatus.operatorGuidance || {};
  const baseGuidance = {
    humanAction: objectiveGuidance.humanAction || proofGuidance.humanAction || 'unknown',
    automationBlocker: objectiveGuidance.automationBlocker || proofGuidance.automationBlocker || 'unknown',
    captureBlocked: Boolean(objectiveGuidance.captureBlocked ?? proofGuidance.captureBlocked)
  };
  const missingArtifacts = Array.isArray(proofTarget.missingArtifacts) && proofTarget.missingArtifacts.length
    ? proofTarget.missingArtifacts
    : Array.isArray(objectiveStatus.nextAction?.missingArtifacts)
      ? objectiveStatus.nextAction.missingArtifacts
      : [];
  const command = objectiveStatus.recommendedCommand?.command
    || proofNext.nextAction?.command
    || objectiveStatus.nextAction?.command
    || null;
  const authStatus = deriveAuthStatus(objectiveStatus);
  const nextActionId = proofNext.nextAction?.id || objectiveStatus.nextAction?.id || '';
  const authCheckOk = deriveAuthCheckOk(objectiveStatus, proofTarget);
  const loginLike = deriveLoginLike(objectiveStatus);
  const profileLikelyAuthenticated = Boolean(proofTarget.profileLikelyAuthenticated);
  const handoffAuthCheckPort = deriveHandoffAuthCheckPort(objectiveStatus);
  const handoffAuthCheckPortReachable = typeof options.handoffPortReachable === 'boolean'
    ? options.handoffPortReachable
    : options.probeHandoffPort === false
      ? null
      : await (options.handoffPortProbe || probeTcpPort)(
        handoffAuthCheckPort,
        Number(options.handoffPortTimeoutMs || options['handoff-port-timeout-ms'] || 150)
      );
  const usableAuth = authUsable({
    profileLikelyAuthenticated,
    authCheckOk,
    loginLike
  });
  const authState = deriveAuthState({
    complete: Boolean(proofNext.complete),
    usableAuth,
    profileLikelyAuthenticated,
    authCheckOk,
    loginLike,
    authStatusSource: authStatus.source || 'none'
  });
  const artifactAction = deriveArtifactAction({
    missingArtifacts,
    authCheckOk,
    benchmarkOk: Boolean(proofTarget.benchmarkOk),
    nextActionId
  });
  const guidance = refineGuidanceForReachableLoginBrowser(baseGuidance, {
    authCheckOk,
    handoffAuthCheckPortReachable,
    nextActionId
  });
  const targetApprovalPreflightCommand = buildCommand([
    'node',
    'src/cli.mjs',
    'target-approval-preflight',
    '--candidate',
    deriveApprovalCandidate(proofTarget),
    '--real-external',
    '--format',
    'compact'
  ]);
  const agentSafeNext = proofNext.complete
    ? noBrowserSafeNext('none', null, 'complete')
    : objectiveStatus.commands?.authWatch && handoffAuthCheckPortReachable !== false
      ? noBrowserSafeNext('auth-watch', objectiveStatus.commands.authWatch, 'none')
      : noBrowserSafeNext('target-approval-preflight', targetApprovalPreflightCommand, guidance.captureBlocked ? 'operator-approval-required' : 'auth-watch-unavailable');
  const status = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    complete: Boolean(proofNext.complete),
    objectiveComplete: Boolean(objectiveStatus.complete),
    status: deriveStatus(objectiveStatus, proofNext),
    target: proofTarget.target || '',
    targetDir: proofTarget.dir || '',
    nextAction: {
      id: nextActionId,
      label: proofNext.nextAction?.label || objectiveStatus.nextAction?.label || '',
      command
    },
    operatorInput: Boolean(objectiveStatus.nextAction?.needsOperatorInput || guidance.captureBlocked),
    operatorGuidance: guidance,
    authCheckOk,
    loginLike,
    authState,
    authUsable: usableAuth,
    profileAuthMetadataOnly: Boolean(profileLikelyAuthenticated && !usableAuth),
    authStatus,
    authFinalUrl: authStatus.finalUrl || '',
    authTitle: authStatus.title || '',
    authStatusSource: authStatus.source || 'none',
    authChildStatus: authStatus.childStatus || '',
    handoffAuthCheckPort,
    handoffAuthCheckPortReachable,
    proofReady: Boolean(proofTarget.proofReady),
    profileLikelyAuthenticated,
    auditOk: Boolean(proofTarget.auditOk),
    benchmarkOk: Boolean(proofTarget.benchmarkOk),
    missingArtifacts,
    missingOutputFiles: missingOutputFiles(missingArtifacts),
    ...artifactAction,
    acceptedExternalProofs: proofNext.acceptedExternalProofs || [],
    summary: proofNext.summary || {},
    recommendedCommand: objectiveStatus.recommendedCommand || (command ? {
      id: proofNext.nextAction?.id || '',
      reason: proofNext.nextAction?.label || '',
      command
    } : null),
    monitorCommand: handoffAuthCheckPortReachable === false ? null : objectiveStatus.commands?.authWatch || null,
    monitorBlockedReason: handoffAuthCheckPortReachable === false ? 'handoff-auth-check-port-unreachable' : '',
    resumeCommand: objectiveStatus.commands?.handoffResume || null,
    targetApprovalPreflightCommand,
    agentSafeNext,
    outputPath: ''
  };
  status.missingArtifactCount = status.missingArtifacts.length;
  status.acceptedExternalProofCount = Number(status.summary.acceptedExternalProofs ?? status.acceptedExternalProofs.length);
  status.targetPackCount = Number(status.summary.targetPacks ?? 0);
  if (options.write || options.out || options.output) {
    const outputPath = safeRunPath(rootDir, options.out || options.output);
    status.outputPath = outputPath;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  }
  return status;
}

export function formatProofGateStatusCompact(status) {
  const missingArtifactIds = (status.missingArtifacts || []).map((item) => item.id).filter(Boolean);
  const lines = [
    `complete: ${yesNo(status.complete)}`,
    `objective_complete: ${yesNo(status.objectiveComplete)}`,
    `status: ${compactValue(status.status)}`,
    `target: ${compactValue(status.target)}`,
    `target_dir: ${compactValue(status.targetDir)}`,
    `next: ${compactValue(status.nextAction?.id)}`,
    `operator_input: ${yesNo(status.operatorInput)}`,
    `human_action: ${compactValue(status.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(status.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(status.operatorGuidance?.captureBlocked)}`,
    `auth_check_ok: ${yesNo(status.authCheckOk)}`,
    `login_like: ${yesNo(status.loginLike)}`,
    `auth_state: ${compactValue(status.authState)}`,
    `auth_usable: ${yesNo(status.authUsable)}`,
    `profile_auth_metadata_only: ${yesNo(status.profileAuthMetadataOnly)}`,
    `auth_status_source: ${compactValue(status.authStatusSource)}`,
    `auth_final_url: ${redactedValue(status.authFinalUrl)}`,
    `auth_title: ${redactedValue(status.authTitle)}`,
    `auth_child_status: ${compactValue(status.authChildStatus)}`,
    `handoff_auth_check_port: ${compactValue(status.handoffAuthCheckPort)}`,
    `handoff_auth_check_port_reachable: ${yesNoUnknown(status.handoffAuthCheckPortReachable)}`,
    `proof_ready: ${yesNo(status.proofReady)}`,
    `profile_authenticated: ${yesNo(status.profileLikelyAuthenticated)}`,
    `audit_ok: ${yesNo(status.auditOk)}`,
    `benchmark_ok: ${yesNo(status.benchmarkOk)}`,
    `missing_artifact_count: ${status.missingArtifactCount ?? 0}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`,
    `missing_output_files: ${status.missingOutputFiles?.length ? status.missingOutputFiles.join(',') : 'none'}`,
    `next_artifact_action: ${compactValue(status.nextArtifactAction)}`,
    `next_artifact_blocker: ${compactValue(status.nextArtifactBlocker)}`,
    `artifact_command_covers: ${status.artifactCommandCovers?.length ? status.artifactCommandCovers.join(',') : 'none'}`,
    `accepted_external_proofs: ${status.acceptedExternalProofCount ?? 0}`,
    `target_packs: ${status.targetPackCount ?? 0}`,
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
  if (status.nextAction?.command?.shell) lines.push(`command: ${status.nextAction.command.shell}`);
  if (status.monitorBlockedReason) lines.push(`auth_watch_blocked_reason: ${status.monitorBlockedReason}`);
  if (status.monitorCommand?.shell) lines.push(`auth_watch_command: ${status.monitorCommand.shell}`);
  if (status.resumeCommand?.shell) lines.push(`handoff_resume_command: ${status.resumeCommand.shell}`);
  if (status.targetApprovalPreflightCommand?.shell) lines.push(`target_approval_preflight_command: ${status.targetApprovalPreflightCommand.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatProofGateStatusMarkdown(status) {
  const lines = [
    '# Secure Browser Agent Proof Gate Status',
    '',
    `Generated: ${status.generatedAt}`,
    `Root: ${status.rootDir}`,
    `Complete: ${status.complete ? 'yes' : 'no'}`,
    `Objective complete: ${status.objectiveComplete ? 'yes' : 'no'}`,
    `Status: ${status.status}`,
    `Safe mode: ${status.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${status.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${status.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Target',
    '',
    `- Target: ${status.target || 'none'}`,
    `- Directory: ${status.targetDir || 'none'}`,
    `- Target packs: ${status.targetPackCount}`,
    `- Accepted external proofs: ${status.acceptedExternalProofCount}`,
    `- Auth-check OK: ${status.authCheckOk ? 'yes' : 'no'}`,
    `- Login-like: ${status.loginLike ? 'yes' : 'no'}`,
    `- Auth state: ${status.authState || 'unknown'}`,
    `- Auth usable for capture: ${status.authUsable ? 'yes' : 'no'}`,
    `- Profile auth metadata only: ${status.profileAuthMetadataOnly ? 'yes' : 'no'}`,
    `- Auth status source: ${status.authStatusSource || 'none'}`,
    `- Auth final URL: ${redactedValue(status.authFinalUrl)}`,
    `- Auth title: ${redactedValue(status.authTitle)}`,
    `- Auth child status: ${status.authChildStatus || 'none'}`,
    `- Handoff auth-check port: ${status.handoffAuthCheckPort || 'none'}`,
    `- Handoff auth-check port reachable: ${yesNoUnknown(status.handoffAuthCheckPortReachable)}`,
    `- Proof ready: ${status.proofReady ? 'yes' : 'no'}`,
    `- Output path: ${status.outputPath || 'none'}`,
    '',
    '## Next Action',
    '',
    `- ID: ${status.nextAction?.id || 'none'}`,
    `- Label: ${status.nextAction?.label || 'none'}`,
    `- Operator input: ${status.operatorInput ? 'yes' : 'no'}`,
    `- Human action: ${status.operatorGuidance?.humanAction || 'unknown'}`,
    `- Automation blocker: ${status.operatorGuidance?.automationBlocker || 'unknown'}`,
    `- Capture blocked: ${status.operatorGuidance?.captureBlocked ? 'yes' : 'no'}`
  ];
  if (status.nextAction?.command?.shell) {
    lines.push('', '```bash', status.nextAction.command.shell, '```');
  }
  if (status.monitorCommand?.shell || status.resumeCommand?.shell) {
    lines.push('', '## Login Monitoring Commands', '');
    if (status.monitorCommand?.shell) {
      lines.push('- Auth watch:');
      lines.push('```bash', status.monitorCommand.shell, '```');
    }
    if (status.resumeCommand?.shell) {
      lines.push('- Handoff resume:');
      lines.push('```bash', status.resumeCommand.shell, '```');
    }
    if (status.targetApprovalPreflightCommand?.shell) {
      lines.push('- Target approval preflight:');
      lines.push('```bash', status.targetApprovalPreflightCommand.shell, '```');
    }
  }
  lines.push('', '## Missing Artifacts', '');
  if (!status.missingArtifacts?.length) {
    lines.push('- none');
  } else {
    for (const item of status.missingArtifacts) {
      const location = item.path ? ` (${item.path})` : '';
      lines.push(`- ${item.id}${location}: ${item.detail || item.kind || 'missing'}`);
    }
  }
  lines.push('', '## Artifact Action', '');
  lines.push(`- Next artifact action: ${status.nextArtifactAction || 'none'}`);
  lines.push(`- Next artifact blocker: ${status.nextArtifactBlocker || 'none'}`);
  lines.push(`- Command covers: ${status.artifactCommandCovers?.length ? status.artifactCommandCovers.join(', ') : 'none'}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
