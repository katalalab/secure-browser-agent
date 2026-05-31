import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { buildObjectiveCompletionAudit } from './objective-completion-audit.mjs';
import { buildObjectiveResume } from './objective-resume.mjs';

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

function targetDirFromAction(action) {
  const args = action?.command?.args || [];
  for (const commandName of ['target-handoff-resume', 'target-handoff-run', 'target-login-capture', 'target-auth-check', 'target-proof-capture']) {
    const index = args.indexOf(commandName);
    if (index >= 0 && args[index + 1]) return args[index + 1];
  }
  return '';
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/objective-status-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid status output path: ${outPath}`);
  return outputPath;
}

function readSavedResume(rootDir, resumePath = '') {
  const defaultPath = path.join(rootDir, 'runs/operator/objective-resume-latest.json');
  const filePath = resumePath ? safeRunPath(rootDir, resumePath) : defaultPath;
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath
    };
  }
  try {
    const resume = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      exists: true,
      path: filePath,
      generatedAt: resume.generatedAt || '',
      status: resume.status || 'unknown',
      readyToRun: Boolean(resume.readyToRun),
      actionId: resume.action?.id || '',
      actionCommand: resume.action?.command || null,
      selectedManualCandidate: resume.selectedManualCandidate
        ? {
            id: resume.selectedManualCandidate.id || '',
            label: resume.selectedManualCandidate.label || '',
            command: resume.selectedManualCandidate.command || null
          }
        : null,
      blockers: resume.blockers || [],
      outputPath: resume.outputPath || ''
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      parseError: error.message
    };
  }
}

function targetPackPath(rootDir, targetDir, relativePath) {
  if (!targetDir) return '';
  return path.join(path.resolve(rootDir, targetDir), relativePath);
}

function argAfter(args, flag) {
  const index = Array.isArray(args) ? args.indexOf(flag) : -1;
  return index >= 0 ? args[index + 1] || '' : '';
}

function commandArgs(item) {
  if (Array.isArray(item?.args)) return item.args;
  if (Array.isArray(item?.command?.args)) return item.command.args;
  return [];
}

function commandOpensBrowser(item) {
  const args = commandArgs(item);
  const commandName = args[2] || '';
  return Boolean(
    (commandName === 'target-login-capture')
      || (commandName === 'target-handoff-resume' && args.includes('--open-login'))
      || (commandName === 'chrome-extension-resume' && args.includes('--run'))
  );
}

function commandStartsCapture(item) {
  const args = commandArgs(item);
  const commandName = args[2] || '';
  return Boolean(
    (commandName === 'target-proof-capture' && args.includes('--run'))
      || (commandName === 'target-login-capture' && !args.includes('--open-only'))
      || (commandName === 'target-handoff-resume' && args.includes('--run') && args.includes('--wait-auth'))
      || (commandName === 'objective-resume' && args.includes('--run') && args.includes('--operator-ready'))
  );
}

function enrichRecommendedCommand(recommended) {
  if (!recommended) return recommended;
  const opensBrowser = commandOpensBrowser(recommended.command);
  const startsCapture = commandStartsCapture(recommended.command);
  const requiresOperatorApproval = Boolean(opensBrowser || startsCapture);
  const mayRunUnattended = Boolean(recommended.command && !requiresOperatorApproval);
  return {
    ...recommended,
    opensBrowser,
    startsCapture,
    requiresOperatorApproval,
    mayRunUnattended,
    agentRunCommand: mayRunUnattended ? recommended.command : null,
    operatorApprovalCommand: requiresOperatorApproval ? recommended.command : null
  };
}

function deriveAgentSafeNext(status) {
  const compactStatusCommand = command(['node', 'src/cli.mjs', 'objective-status', '--format', 'compact']);
  const loginHandoffStatusCommand = command(['node', 'src/cli.mjs', 'login-handoff-status', '--format', 'compact']);
  const completionAuditCommand = command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']);
  if (status.complete) return noBrowserSafeNext('objective-completion-audit', completionAuditCommand, 'none');
  if (status.status === 'waiting-for-login'
    && status.commands?.authWatch?.shell
    && status.handoffAuthCheckPortReachable !== false) {
    return noBrowserSafeNext('auth-watch', status.commands.authWatch, 'none');
  }
  if (status.recommendedCommand?.mayRunUnattended) {
    const commandValue = status.recommendedCommand.id === 'status'
      ? compactStatusCommand
      : status.recommendedCommand.agentRunCommand || compactStatusCommand;
    return noBrowserSafeNext(status.recommendedCommand.id || 'objective-status', commandValue, 'none');
  }
  if (status.recommendedCommand?.requiresOperatorApproval) {
    return noBrowserSafeNext('login-handoff-status', loginHandoffStatusCommand, 'operator-approval-required');
  }
  return noBrowserSafeNext('objective-status', compactStatusCommand, 'none');
}

function readOperatorHandoff(rootDir, targetDir) {
  const filePath = targetPackPath(rootDir, targetDir, 'outputs/operator-handoff.json');
  if (!filePath) {
    return {
      exists: false,
      path: ''
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath
    };
  }
  try {
    const handoff = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const commands = Array.isArray(handoff.commands)
      ? handoff.commands
      : Array.isArray(handoff.handoff?.commands)
      ? handoff.handoff.commands
      : [];
    const postLogin = commands.find((item) => item.id === 'post-login-capture') || null;
    const authCheck = commands.find((item) => item.id === 'auth-check-status') || null;
    const authCheckPort = argAfter(commandArgs(postLogin), '--auth-check-port')
      || argAfter(commandArgs(authCheck), '--cdp-port');
    return {
      exists: true,
      path: filePath,
      generatedAt: handoff.generatedAt || '',
      target: handoff.target || '',
      realExternal: Boolean(handoff.realExternal),
      commandCount: commands.length,
      authCheckPort: authCheckPort ? String(authCheckPort) : ''
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      parseError: error.message
    };
  }
}

function readLatestHandoffRun(rootDir, targetDir) {
  const filePath = targetPackPath(rootDir, targetDir, 'outputs/handoff-run-latest.json');
  if (!filePath) {
    return {
      exists: false,
      path: ''
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath
    };
  }
  try {
    const run = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      exists: true,
      path: filePath,
      generatedAt: run.generatedAt || '',
      status: run.status || 'unknown',
      readyToRun: Boolean(run.readyToRun),
      target: run.target || '',
      commandId: run.commandId || run.selected?.id || '',
      blockerCount: Array.isArray(run.blockers) ? run.blockers.length : 0,
      authPreflight: run.authPreflight
        ? {
            ok: Boolean(run.authPreflight.ok),
            cdpPort: run.authPreflight.cdpPort || '',
            finalUrl: run.authPreflight.finalUrl || '',
            loginLike: Boolean(run.authPreflight.loginLike)
          }
        : null,
      nextAction: run.nextAction
        ? {
            id: run.nextAction.id || '',
            label: run.nextAction.label || '',
            command: run.nextAction.command || null
          }
        : null,
      result: run.result
        ? {
            ok: Boolean(run.result.ok),
            status: run.result.status ?? null,
            stdoutBytes: run.result.stdoutBytes ?? 0,
            stderrBytes: run.result.stderrBytes ?? 0
          }
        : null
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      parseError: error.message
    };
  }
}

function readLatestHandoffResume(rootDir, targetDir) {
  const filePath = targetPackPath(rootDir, targetDir, 'outputs/handoff-resume-latest.json');
  if (!filePath) {
    return {
      exists: false,
      path: ''
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath
    };
  }
  try {
    const run = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      exists: true,
      path: filePath,
      generatedAt: run.generatedAt || '',
      status: run.status || 'unknown',
      target: run.target || '',
      blockerCount: Array.isArray(run.blockers) ? run.blockers.length : 0,
      loginOpen: run.loginOpen
        ? {
            status: run.loginOpen.status || '',
            ok: run.loginOpen.login?.ok ?? null,
            port: run.loginOpen.login?.port ? String(run.loginOpen.login.port) : '',
            handoffPath: run.loginOpen.handoffPath || ''
          }
        : null,
      authCheck: run.authCheck
        ? {
            status: run.authCheck.status || '',
            ok: Boolean(run.authCheck.result?.ok),
            childStatus: run.authCheck.result?.childStatus || '',
            childOk: run.authCheck.result?.childOk ?? null,
            finalUrl: run.authCheck.result?.finalUrl || '',
            title: run.authCheck.result?.title || '',
            loginLike: run.authCheck.result?.loginLike ?? null,
            sameOrigin: run.authCheck.result?.sameOrigin ?? null
          }
        : null,
      capture: run.capture
        ? {
            status: run.capture.status || '',
            ok: Boolean(run.capture.result?.ok)
          }
        : null,
      nextAction: run.nextAction
        ? {
            id: run.nextAction.id || '',
            label: run.nextAction.label || '',
            command: run.nextAction.command || null
          }
        : null
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      parseError: error.message
    };
  }
}

function parseTimestamp(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function waitAuthFreshness(waitAuth, attempts, { now = new Date().toISOString() } = {}) {
  const lastAttempt = attempts.at(-1) || null;
  const updatedAt = lastAttempt?.generatedAt || waitAuth.generatedAt || '';
  const updatedMs = parseTimestamp(updatedAt);
  const nowMs = parseTimestamp(now) || Date.now();
  const ageSeconds = updatedMs ? Math.max(0, Math.round((nowMs - updatedMs) / 1000)) : null;
  const intervalMs = Number(waitAuth.intervalMs || 0);
  const staleAfterSeconds = Math.max(300, Math.ceil((intervalMs * 3) / 1000));
  const stale = ageSeconds !== null && ageSeconds > staleAfterSeconds;
  const active = Boolean(waitAuth.enabled) && waitAuth.status === 'waiting' && !stale;
  return {
    updatedAt,
    ageSeconds,
    staleAfterSeconds,
    stale,
    active
  };
}

function authWatchFreshness(authWatch, { now = new Date().toISOString() } = {}) {
  const authCheck = authWatch.authCheck || authWatch;
  const hasWatchStatus = Boolean(authWatch.status);
  const updatedAt = authCheck.generatedAt || authWatch.generatedAt || '';
  const updatedMs = parseTimestamp(updatedAt);
  const nowMs = parseTimestamp(now) || Date.now();
  const ageSeconds = updatedMs ? Math.max(0, Math.round((nowMs - updatedMs) / 1000)) : null;
  const intervalMs = Number(authWatch.intervalMs || 0);
  const staleAfterSeconds = Math.max(300, Math.ceil((intervalMs * 3) / 1000));
  const stale = ageSeconds !== null && ageSeconds > staleAfterSeconds;
  const terminal = ['authenticated', 'timed-out'].includes(authWatch.status);
  const ok = Boolean(authCheck.ok ?? authWatch.ok);
  const active = hasWatchStatus && !ok && !terminal && !stale;
  return {
    updatedAt,
    ageSeconds,
    staleAfterSeconds,
    stale,
    active
  };
}

function readWaitAuthStatus(rootDir, targetDir, fileName = 'wait-auth-status.json', options = {}) {
  const filePath = targetPackPath(rootDir, targetDir, `outputs/${fileName}`);
  if (!filePath) {
    return {
      exists: false,
      path: ''
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath
    };
  }
  try {
    const waitAuth = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const attempts = Array.isArray(waitAuth.attempts) ? waitAuth.attempts : [];
    const lastAttempt = attempts.at(-1) || null;
    const freshness = waitAuthFreshness(waitAuth, attempts, options);
    return {
      exists: true,
      path: filePath,
      generatedAt: waitAuth.generatedAt || '',
      status: waitAuth.status || 'unknown',
      enabled: Boolean(waitAuth.enabled),
      ...freshness,
      target: waitAuth.target || '',
      profile: waitAuth.profile || '',
      timeoutMs: waitAuth.timeoutMs ?? null,
      intervalMs: waitAuth.intervalMs ?? null,
      attemptCount: attempts.length,
      lastAttempt: lastAttempt
        ? {
            attempt: lastAttempt.attempt || attempts.length,
            generatedAt: lastAttempt.generatedAt || '',
            status: lastAttempt.status || '',
            profileLikelyAuthenticated: Boolean(lastAttempt.profileLikelyAuthenticated),
            authCheckOk: Boolean(lastAttempt.authCheckOk ?? lastAttempt.ok),
            authCheckFinalUrl: lastAttempt.authCheckFinalUrl || lastAttempt.finalUrl || '',
            childStatus: lastAttempt.childStatus || '',
            childOk: lastAttempt.childOk ?? null,
            finalUrl: lastAttempt.finalUrl || lastAttempt.authCheckFinalUrl || '',
            title: lastAttempt.title || '',
            loginLike: lastAttempt.loginLike ?? null,
            sameOrigin: lastAttempt.sameOrigin ?? null,
            authCheckRefresh: lastAttempt.authCheckRefresh
              ? {
                  ok: Boolean(lastAttempt.authCheckRefresh.ok),
                  finalUrl: lastAttempt.authCheckRefresh.finalUrl || '',
                  loginLike: Boolean(lastAttempt.authCheckRefresh.loginLike),
                  error: lastAttempt.authCheckRefresh.error || ''
                }
              : null
          }
        : null
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      parseError: error.message
    };
  }
}

function readAuthWatchStatus(rootDir, targetDir, fileName = 'auth-watch-status.json', options = {}) {
  const filePath = targetPackPath(rootDir, targetDir, `outputs/${fileName}`);
  if (!filePath) {
    return {
      exists: false,
      path: ''
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath
    };
  }
  try {
    const authWatch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const authCheck = authWatch.authCheck || authWatch;
    const status = authWatch.status || (authCheck.ok ? 'authenticated' : 'not-ok');
    const freshness = authWatchFreshness(authWatch, options);
    return {
      exists: true,
      path: filePath,
      generatedAt: authWatch.generatedAt || '',
      status,
      ...freshness,
      target: authWatch.target || authCheck.target || '',
      profile: authWatch.profile || authCheck.profile || '',
      ok: Boolean(authCheck.ok ?? authWatch.ok),
      sameOrigin: Boolean(authCheck.sameOrigin),
      loginLike: Boolean(authCheck.loginLike),
      finalUrl: authCheck.finalUrl || '',
      title: authCheck.title || '',
      timeoutMs: authWatch.timeoutMs ?? null,
      intervalMs: authWatch.intervalMs ?? null,
      attemptCount: authWatch.attemptCount ?? (Array.isArray(authWatch.attempts) ? authWatch.attempts.length : null),
      nextAction: (authWatch.nextAction || authCheck.nextAction)
        ? {
            id: (authWatch.nextAction || authCheck.nextAction).id || '',
            label: (authWatch.nextAction || authCheck.nextAction).label || '',
            command: (authWatch.nextAction || authCheck.nextAction).command || null
          }
        : null,
      statusPath: authWatch.statusPath || authCheck.statusPath || ''
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      parseError: error.message
    };
  }
}

function summarizeAction(action) {
  if (!action) return null;
  return {
    id: action.id || '',
    status: action.status || '',
    label: action.label || '',
    needsOperatorInput: Boolean(action.needsOperatorInput),
    writesLocalState: Boolean(action.writesLocalState),
    command: action.command || null,
    missingArtifacts: action.missingArtifacts || []
  };
}

function summarizeResume(resume) {
  if (!resume) return null;
  return {
    status: resume.status || 'unknown',
    readyToRun: Boolean(resume.readyToRun),
    run: Boolean(resume.run),
    operatorReady: Boolean(resume.operatorReady),
    actionId: resume.action?.id || '',
    blockers: resume.blockers || [],
    outputPath: resume.outputPath || ''
  };
}

function deriveStatus(audit, resume, operatorReadyResume) {
  if (audit.complete) return 'complete';
  const preflight = operatorReadyResume?.operatorReadyPreflight;
  if (preflight) return preflight.ok ? 'operator-ready' : 'waiting-for-login';
  if (audit.nextAction?.id === 'target-handoff-resume') return 'waiting-for-login';
  if (resume?.status === 'blocked') return 'blocked';
  return 'action-required';
}

function recommendObjectiveStatusCommand(status) {
  const commands = status.commands || {};
  const preflight = status.operatorReadyPreflight || {};
  const waitAuth = status.waitAuthStatus || {};
  const handoffResumeWaitAuth = status.handoffResumeWaitAuthStatus || {};
  const authWatch = status.authWatchStatus || {};
  const authWatchLatest = status.authWatchLatestStatus || {};
  if (status.complete) {
    return {
      id: 'completion-audit',
      reason: 'Objective reports complete; verify the final gate.',
      command: commands.completionAudit || null
    };
  }
  if (preflight.ok && commands.operatorReadyResume) {
    return {
      id: 'operator-ready-resume',
      reason: 'Auth preflight passed; run the saved post-login capture.',
      command: commands.operatorReadyResume
    };
  }
  if (status.status === 'waiting-for-login') {
    if ((waitAuth.active || handoffResumeWaitAuth.active || authWatch.active || authWatchLatest.active) && commands.status) {
      return {
        id: 'status',
        reason: 'A login, auth-watch, or handoff-resume wait is already active; keep polling objective status.',
        command: commands.status
      };
    }
    if (commands.handoffResume) {
      return {
        id: 'handoff-resume',
        reason: 'Use the saved handoff resume lane; it checks auth first and captures only after login is proved.',
        command: commands.handoffResume
      };
    }
    if (commands.savedResumeRun) {
      return {
        id: 'saved-resume-run',
        reason: 'Login is still required and the saved wait is stale or inactive; replay the saved login wait candidate.',
        command: commands.savedResumeRun
      };
    }
    if (commands.loginCaptureWait) {
      return {
        id: 'login-capture-wait',
        reason: 'Login is still required; open the dedicated browser and wait for auth-check before capture.',
        command: commands.loginCaptureWait
      };
    }
  }
  if (commands.resumePlan) {
    return {
      id: 'resume-plan',
      reason: 'Review the current resume plan before running.',
      command: commands.resumePlan
    };
  }
  return {
    id: 'status',
    reason: 'Refresh objective status.',
    command: commands.status || null
  };
}

function deriveAuthState(status) {
  if (status.complete) return 'accepted-proof';
  if (status.operatorReadyPreflight?.ok) return 'usable';

  const authSources = [
    status.authWatchLatestStatus,
    status.authWatchStatus,
    status.handoffResumeWaitAuthStatus?.lastAttempt,
    status.latestHandoffResume?.authCheck,
    status.waitAuthStatus?.lastAttempt,
    status.waitAuthProbeStatus?.lastAttempt,
    status.latestHandoffRun?.authPreflight,
    status.operatorReadyPreflight
  ].filter(Boolean);

  const profileLikelyAuthenticated = authSources.some((source) => source.profileLikelyAuthenticated === true);
  const authCheckOk = authSources.some((source) => source.ok === true || source.authCheckOk === true || source.childOk === true);
  const authCheckFailed = authSources.some((source) => source.ok === false || source.authCheckOk === false || source.childOk === false || source.childStatus === 'not-ok');
  const loginLike = authSources.some((source) => source.loginLike === true || source.authCheckRefresh?.loginLike === true || source.childStatus === 'not-ok');

  if (profileLikelyAuthenticated && authCheckOk && !loginLike) return 'usable';
  if (profileLikelyAuthenticated && loginLike) return 'metadata-only-login-like';
  if (profileLikelyAuthenticated && authCheckFailed) return 'metadata-only-auth-check-failed';
  if (profileLikelyAuthenticated) return 'metadata-only-unchecked';
  if (loginLike) return 'login-like';
  if (authCheckFailed) return 'auth-check-failed';
  return 'unchecked';
}

function deriveOperatorGuidance(status) {
  if (status.complete) {
    return {
      humanAction: 'none',
      automationBlocker: 'none',
      captureBlocked: false,
      resumeCommand: status.commands?.completionAudit || null
    };
  }

  const missingArtifacts = Array.isArray(status.nextAction?.missingArtifacts) ? status.nextAction.missingArtifacts : [];
  const authMissing = missingArtifacts.some((item) => item.id === 'auth-check');
  const handoffLoginOpen = status.latestHandoffResume?.loginOpen?.status === 'login-opened';
  const handoffPortReachable = status.handoffAuthCheckPortReachable === true;
  const authLooksLogin = Boolean(
    status.authWatchStatus?.loginLike
      || status.authWatchLatestStatus?.loginLike
      || status.latestHandoffResume?.authCheck?.childStatus === 'not-ok'
      || status.handoffResumeWaitAuthStatus?.lastAttempt?.childStatus === 'not-ok'
  );
  const waitActive = Boolean(
    status.waitAuthStatus?.active
      || status.handoffResumeWaitAuthStatus?.active
      || status.authWatchStatus?.active
      || status.authWatchLatestStatus?.active
  );

  if (status.operatorReadyPreflight?.ok) {
    return {
      humanAction: 'run-operator-ready-resume',
      automationBlocker: 'none',
      captureBlocked: false,
      resumeCommand: status.commands?.operatorReadyResume || status.recommendedCommand?.command || null
    };
  }

  if (status.status === 'waiting-for-login') {
    let humanAction = 'run-login-capture-wait';
    if (waitActive) humanAction = 'wait-or-poll-active-login-check';
    else if (handoffLoginOpen || handoffPortReachable) humanAction = 'complete-login-in-open-dedicated-browser';
    else if (status.commands?.handoffResume) humanAction = 'run-handoff-resume-to-open-login';

    return {
      humanAction,
      automationBlocker: authMissing || authLooksLogin ? 'auth-check-not-ok' : 'operator-login-required',
      captureBlocked: true,
      resumeCommand: status.recommendedCommand?.command || status.commands?.handoffResume || status.commands?.loginCaptureWait || null
    };
  }

  return {
    humanAction: status.recommendedCommand?.id || 'refresh-status',
    automationBlocker: missingArtifacts.length ? 'missing-proof-artifacts' : 'none',
    captureBlocked: missingArtifacts.length > 0,
    resumeCommand: status.recommendedCommand?.command || null
  };
}

export async function buildObjectiveStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const audit = options.audit || await buildObjectiveCompletionAudit({
    ...options,
    rootDir
  });
  const next = {
    rootDir,
    complete: audit.complete,
    primaryAction: audit.nextAction
  };
  const resume = options.resume || await buildObjectiveResume({
    ...options,
    rootDir,
    next,
    run: false,
    write: false,
    out: ''
  });
  const shouldPreflight = audit.nextAction?.id === 'target-handoff-capture';
  const operatorReadyResume = options.operatorReadyResume || (shouldPreflight
    ? await buildObjectiveResume({
        ...options,
        rootDir,
        next,
        run: false,
        operatorReady: true,
        write: false,
        out: ''
      })
    : null);
  const targetDir = targetDirFromAction(audit.nextAction);
  const operatorHandoff = readOperatorHandoff(rootDir, targetDir);
  const cdpPort = operatorHandoff.authCheckPort
    || operatorReadyResume?.operatorReadyPreflight?.cdpPort
    || '';
  const handoffAuthCheckPortReachable = typeof options.handoffPortReachable === 'boolean'
    ? options.handoffPortReachable
    : options.probeHandoffPort === false
      ? null
      : await (options.handoffPortProbe || probeTcpPort)(
        cdpPort,
        Number(options.handoffPortTimeoutMs || options['handoff-port-timeout-ms'] || 150)
      );
  const savedResume = readSavedResume(rootDir, options.resumePath);
  const savedProbeResume = readSavedResume(rootDir, options.probeResumePath || 'operator/objective-resume-probe-latest.json');
  const savedManualCandidateId = savedResume.selectedManualCandidate?.id || '';
  const waitAuthOptions = { now: generatedAt };
  const status = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    complete: Boolean(audit.complete),
    status: deriveStatus(audit, resume, operatorReadyResume),
    remainingCount: audit.finalGate?.remainingCount ?? audit.remaining?.length ?? 0,
    remaining: (audit.remaining || []).map((item) => ({
      id: item.id,
      status: item.status,
      next: item.next || ''
    })),
    nextAction: summarizeAction(audit.nextAction),
    resume: summarizeResume(resume),
    operatorReadyPreflight: operatorReadyResume?.operatorReadyPreflight || null,
    savedResume,
    savedProbeResume,
    operatorHandoff,
    latestHandoffRun: readLatestHandoffRun(rootDir, targetDir),
    latestHandoffResume: readLatestHandoffResume(rootDir, targetDir),
    handoffAuthCheckPortReachable,
    waitAuthStatus: readWaitAuthStatus(rootDir, targetDir, 'wait-auth-status.json', waitAuthOptions),
    waitAuthProbeStatus: readWaitAuthStatus(rootDir, targetDir, 'wait-auth-status-probe.json', waitAuthOptions),
    handoffResumeWaitAuthStatus: readWaitAuthStatus(rootDir, targetDir, 'handoff-resume-wait-auth-status.json', waitAuthOptions),
    authWatchStatus: readAuthWatchStatus(rootDir, targetDir, 'auth-watch-status.json', waitAuthOptions),
    authWatchLatestStatus: readAuthWatchStatus(rootDir, targetDir, 'auth-watch-status-latest.json', waitAuthOptions),
    commands: {
      status: command(['node', 'src/cli.mjs', 'objective-status', '--write', '--format', 'markdown']),
      resumePlan: command(['node', 'src/cli.mjs', 'objective-resume', '--write', '--format', 'markdown']),
      loginOpen: targetDir
        ? command(['node', 'src/cli.mjs', 'target-login-capture', targetDir, '--real-external', '--open-only', '--handoff-out', 'operator-handoff-open-only.json', '--format', 'markdown'])
        : null,
      loginCaptureWait: targetDir
        ? command(['node', 'src/cli.mjs', 'target-login-capture', targetDir, '--real-external', '--handoff-out', 'operator-handoff.json', '--wait-auth-status-out', 'wait-auth-status.json', '--completion-audit', '--format', 'markdown'])
        : null,
      authCheck: targetDir
        ? command([
            'node',
            'src/cli.mjs',
            'target-auth-check',
            targetDir,
            '--real-external',
            ...(operatorHandoff.authCheckPort ? ['--handoff', 'operator-handoff.json'] : cdpPort ? ['--cdp-port', String(cdpPort)] : []),
            '--format',
            'markdown'
          ])
        : null,
      authWatch: targetDir && handoffAuthCheckPortReachable !== false
        ? command(['node', 'src/cli.mjs', 'target-auth-watch', targetDir, '--real-external', ...(operatorHandoff.authCheckPort ? ['--handoff', 'operator-handoff.json'] : cdpPort ? ['--cdp-port', String(cdpPort)] : []), '--status-out', 'auth-watch-status.json', '--timeout-ms', '300000', '--interval-ms', '5000', '--format', 'compact'])
        : null,
      handoffResume: targetDir
        ? command(['node', 'src/cli.mjs', 'target-handoff-resume', targetDir, '--handoff', 'operator-handoff.json', '--run', '--open-login', '--wait-auth', '--wait-auth-status-out', 'handoff-resume-wait-auth-status.json', '--out', 'handoff-resume-latest.json', '--format', 'compact'])
        : null,
      operatorReadyResume: shouldPreflight
        ? command(['node', 'src/cli.mjs', 'objective-resume', '--run', '--operator-ready', '--write', '--format', 'markdown'])
        : null,
      savedResumeRun: savedManualCandidateId
        ? command(['node', 'src/cli.mjs', 'objective-resume', '--run', '--manual-candidate', savedManualCandidateId, '--write', '--format', 'markdown'])
        : null,
      completionAudit: command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'markdown'])
    },
    recommendedCommand: null,
    outputPath: ''
  };
  status.recommendedCommand = enrichRecommendedCommand(recommendObjectiveStatusCommand(status));
  status.authState = deriveAuthState(status);
  status.operatorGuidance = deriveOperatorGuidance(status);
  status.agentSafeNext = deriveAgentSafeNext(status);

  if (options.write || options.out) {
    const outputPath = safeRunPath(rootDir, options.out || options.output);
    status.outputPath = outputPath;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  }

  return status;
}

export function formatObjectiveStatusMarkdown(status) {
  const lines = [
    '# Secure Browser Agent Objective Status',
    '',
    `Generated: ${status.generatedAt}`,
    `Root: ${status.rootDir}`,
    `Complete: ${status.complete ? 'yes' : 'no'}`,
    `Status: ${status.status}`,
    `Auth state: ${status.authState || 'unknown'}`,
    `Remaining count: ${status.remainingCount}`,
    `Safe mode: ${status.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${status.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Next Action',
    '',
    `- ID: ${status.nextAction?.id || 'none'}`,
    `- Label: ${status.nextAction?.label || 'none'}`,
    `- Needs operator input: ${status.nextAction?.needsOperatorInput ? 'yes' : 'no'}`
  ];
  if (status.nextAction?.command?.shell) {
    lines.push('', '```bash', status.nextAction.command.shell, '```');
  }
  if (status.nextAction?.missingArtifacts?.length) {
    lines.push('', '### Missing Artifacts');
    for (const item of status.nextAction.missingArtifacts) {
      const location = item.path ? ` (${item.path})` : '';
      lines.push(`- ${item.id}${location}: ${item.detail || item.kind || 'missing'}`);
    }
  }
  lines.push('', '## Resume', '');
  if (status.resume) {
    lines.push(`- Status: ${status.resume.status}`);
    lines.push(`- Ready to run: ${status.resume.readyToRun ? 'yes' : 'no'}`);
    lines.push(`- Operator ready: ${status.resume.operatorReady ? 'yes' : 'no'}`);
    if (status.resume.blockers.length === 0) {
      lines.push('- Blockers: none');
    } else {
      for (const blocker of status.resume.blockers) lines.push(`- Blocker: ${blocker}`);
    }
  } else {
    lines.push('- none');
  }
  if (status.operatorReadyPreflight) {
    lines.push('', '## Operator Ready Preflight', '');
    lines.push(`- OK: ${status.operatorReadyPreflight.ok ? 'yes' : 'no'}`);
    if (status.operatorReadyPreflight.targetDir) lines.push(`- Target: ${status.operatorReadyPreflight.targetDir}`);
    if (status.operatorReadyPreflight.cdpPort) lines.push(`- CDP port: ${status.operatorReadyPreflight.cdpPort}`);
    if (status.operatorReadyPreflight.finalUrl) lines.push(`- Final URL: ${redactedValue(status.operatorReadyPreflight.finalUrl)}`);
    if (status.operatorReadyPreflight.blocker) lines.push(`- Detail: ${status.operatorReadyPreflight.blocker}`);
  }
  lines.push('', '## Saved Resume', '');
  lines.push(`- Exists: ${status.savedResume.exists ? 'yes' : 'no'}`);
  lines.push(`- Path: ${status.savedResume.path}`);
  if (status.savedResume.exists && !status.savedResume.parseError) {
    lines.push(`- Status: ${status.savedResume.status}`);
    lines.push(`- Ready to run: ${status.savedResume.readyToRun ? 'yes' : 'no'}`);
    lines.push(`- Action: ${status.savedResume.actionId || 'none'}`);
    if (status.savedResume.selectedManualCandidate) {
      lines.push(`- Manual candidate: ${status.savedResume.selectedManualCandidate.id || 'none'}`);
      if (status.savedResume.selectedManualCandidate.label) {
        lines.push(`- Manual candidate label: ${status.savedResume.selectedManualCandidate.label}`);
      }
      if (status.savedResume.selectedManualCandidate.command?.shell) {
        lines.push('', '```bash', status.savedResume.selectedManualCandidate.command.shell, '```');
      }
    } else if (status.savedResume.actionCommand?.shell) {
      lines.push('', '```bash', status.savedResume.actionCommand.shell, '```');
    }
  }
  if (status.savedResume.parseError) lines.push(`- Parse error: ${status.savedResume.parseError}`);
  lines.push('', '## Saved Probe Resume', '');
  lines.push(`- Exists: ${status.savedProbeResume.exists ? 'yes' : 'no'}`);
  lines.push(`- Path: ${status.savedProbeResume.path}`);
  if (status.savedProbeResume.exists && !status.savedProbeResume.parseError) {
    lines.push(`- Status: ${status.savedProbeResume.status}`);
    lines.push(`- Ready to run: ${status.savedProbeResume.readyToRun ? 'yes' : 'no'}`);
    lines.push(`- Action: ${status.savedProbeResume.actionId || 'none'}`);
    if (status.savedProbeResume.selectedManualCandidate?.id) {
      lines.push(`- Manual candidate: ${status.savedProbeResume.selectedManualCandidate.id}`);
    }
  }
  if (status.savedProbeResume.parseError) lines.push(`- Parse error: ${status.savedProbeResume.parseError}`);
  lines.push('', '## Latest Handoff Run', '');
  lines.push(`- Exists: ${status.latestHandoffRun.exists ? 'yes' : 'no'}`);
  if (status.latestHandoffRun.path) lines.push(`- Path: ${status.latestHandoffRun.path}`);
  if (status.latestHandoffRun.exists && !status.latestHandoffRun.parseError) {
    lines.push(`- Status: ${status.latestHandoffRun.status}`);
    lines.push(`- Ready to run: ${status.latestHandoffRun.readyToRun ? 'yes' : 'no'}`);
    lines.push(`- Command: ${status.latestHandoffRun.commandId || 'none'}`);
    lines.push(`- Blocker count: ${status.latestHandoffRun.blockerCount}`);
    if (status.latestHandoffRun.authPreflight) {
      lines.push(`- Auth preflight OK: ${status.latestHandoffRun.authPreflight.ok ? 'yes' : 'no'}`);
      if (status.latestHandoffRun.authPreflight.finalUrl) lines.push(`- Auth preflight final URL: ${redactedValue(status.latestHandoffRun.authPreflight.finalUrl)}`);
    }
    if (status.latestHandoffRun.nextAction) {
      lines.push(`- Next action: ${status.latestHandoffRun.nextAction.id || 'none'}`);
      if (status.latestHandoffRun.nextAction.label) lines.push(`- Next action label: ${status.latestHandoffRun.nextAction.label}`);
      if (status.latestHandoffRun.nextAction.command?.shell) {
        lines.push('', '```bash', status.latestHandoffRun.nextAction.command.shell, '```');
      }
    }
    if (status.latestHandoffRun.result) {
      lines.push(`- Result OK: ${status.latestHandoffRun.result.ok ? 'yes' : 'no'}`);
      lines.push(`- Result exit: ${status.latestHandoffRun.result.status}`);
    }
  }
  if (status.latestHandoffRun.parseError) lines.push(`- Parse error: ${status.latestHandoffRun.parseError}`);
  lines.push('', '## Latest Handoff Resume', '');
  lines.push(`- Exists: ${status.latestHandoffResume.exists ? 'yes' : 'no'}`);
  if (status.latestHandoffResume.path) lines.push(`- Path: ${status.latestHandoffResume.path}`);
  if (status.latestHandoffResume.exists && !status.latestHandoffResume.parseError) {
    lines.push(`- Status: ${status.latestHandoffResume.status}`);
    lines.push(`- Blocker count: ${status.latestHandoffResume.blockerCount}`);
    if (status.latestHandoffResume.loginOpen) {
      lines.push(`- Login open status: ${status.latestHandoffResume.loginOpen.status || 'none'}`);
      if (status.latestHandoffResume.loginOpen.ok !== null && status.latestHandoffResume.loginOpen.ok !== undefined) {
        lines.push(`- Login open OK: ${status.latestHandoffResume.loginOpen.ok ? 'yes' : 'no'}`);
      }
      if (status.latestHandoffResume.loginOpen.port) lines.push(`- Login open CDP port: ${status.latestHandoffResume.loginOpen.port}`);
    }
    if (status.latestHandoffResume.authCheck) {
      lines.push(`- Auth check status: ${status.latestHandoffResume.authCheck.status || 'none'}`);
      lines.push(`- Auth check OK: ${status.latestHandoffResume.authCheck.ok ? 'yes' : 'no'}`);
      if (status.latestHandoffResume.authCheck.childStatus) lines.push(`- Auth child status: ${status.latestHandoffResume.authCheck.childStatus}`);
      if (status.latestHandoffResume.authCheck.loginLike !== null && status.latestHandoffResume.authCheck.loginLike !== undefined) {
        lines.push(`- Auth login-like: ${status.latestHandoffResume.authCheck.loginLike ? 'yes' : 'no'}`);
      }
      if (status.latestHandoffResume.authCheck.finalUrl) lines.push(`- Auth final URL: ${redactedValue(status.latestHandoffResume.authCheck.finalUrl)}`);
      if (status.latestHandoffResume.authCheck.title) lines.push(`- Auth title: ${redactedValue(status.latestHandoffResume.authCheck.title)}`);
    }
    if (status.latestHandoffResume.capture) {
      lines.push(`- Capture status: ${status.latestHandoffResume.capture.status || 'none'}`);
      lines.push(`- Capture OK: ${status.latestHandoffResume.capture.ok ? 'yes' : 'no'}`);
    }
    if (status.latestHandoffResume.nextAction) {
      lines.push(`- Next action: ${status.latestHandoffResume.nextAction.id || 'none'}`);
      if (status.latestHandoffResume.nextAction.label) lines.push(`- Next action label: ${status.latestHandoffResume.nextAction.label}`);
      if (status.latestHandoffResume.nextAction.command?.shell) {
        lines.push('', '```bash', status.latestHandoffResume.nextAction.command.shell, '```');
      }
    }
  }
  if (status.latestHandoffResume.parseError) lines.push(`- Parse error: ${status.latestHandoffResume.parseError}`);
  lines.push('', '## Wait Auth Status', '');
  lines.push(`- Exists: ${status.waitAuthStatus.exists ? 'yes' : 'no'}`);
  if (status.waitAuthStatus.path) lines.push(`- Path: ${status.waitAuthStatus.path}`);
  if (status.waitAuthStatus.exists && !status.waitAuthStatus.parseError) {
    lines.push(`- Status: ${status.waitAuthStatus.status}`);
    lines.push(`- Enabled: ${status.waitAuthStatus.enabled ? 'yes' : 'no'}`);
    if (status.waitAuthStatus.updatedAt) lines.push(`- Last updated: ${status.waitAuthStatus.updatedAt}`);
    if (status.waitAuthStatus.ageSeconds !== null) lines.push(`- Age seconds: ${status.waitAuthStatus.ageSeconds}`);
    lines.push(`- Stale: ${status.waitAuthStatus.stale ? 'yes' : 'no'}`);
    lines.push(`- Active wait: ${status.waitAuthStatus.active ? 'yes' : 'no'}`);
    lines.push(`- Attempts: ${status.waitAuthStatus.attemptCount}`);
    if (status.waitAuthStatus.lastAttempt) {
      lines.push(`- Last attempt: ${status.waitAuthStatus.lastAttempt.attempt}`);
      lines.push(`- Last auth-check OK: ${status.waitAuthStatus.lastAttempt.authCheckOk ? 'yes' : 'no'}`);
      if (status.waitAuthStatus.lastAttempt.authCheckFinalUrl) lines.push(`- Last auth-check final URL: ${redactedValue(status.waitAuthStatus.lastAttempt.authCheckFinalUrl)}`);
      if (status.waitAuthStatus.lastAttempt.authCheckRefresh) {
        lines.push(`- Last refresh OK: ${status.waitAuthStatus.lastAttempt.authCheckRefresh.ok ? 'yes' : 'no'}`);
        if (status.waitAuthStatus.lastAttempt.authCheckRefresh.finalUrl) lines.push(`- Last refresh final URL: ${redactedValue(status.waitAuthStatus.lastAttempt.authCheckRefresh.finalUrl)}`);
        if (status.waitAuthStatus.lastAttempt.authCheckRefresh.error) lines.push(`- Last refresh error: ${status.waitAuthStatus.lastAttempt.authCheckRefresh.error}`);
      }
    }
  }
  if (status.waitAuthStatus.parseError) lines.push(`- Parse error: ${status.waitAuthStatus.parseError}`);
  lines.push('', '## Wait Auth Probe Status', '');
  lines.push(`- Exists: ${status.waitAuthProbeStatus.exists ? 'yes' : 'no'}`);
  if (status.waitAuthProbeStatus.path) lines.push(`- Path: ${status.waitAuthProbeStatus.path}`);
  if (status.waitAuthProbeStatus.exists && !status.waitAuthProbeStatus.parseError) {
    lines.push(`- Status: ${status.waitAuthProbeStatus.status}`);
    lines.push(`- Enabled: ${status.waitAuthProbeStatus.enabled ? 'yes' : 'no'}`);
    if (status.waitAuthProbeStatus.updatedAt) lines.push(`- Last updated: ${status.waitAuthProbeStatus.updatedAt}`);
    if (status.waitAuthProbeStatus.ageSeconds !== null) lines.push(`- Age seconds: ${status.waitAuthProbeStatus.ageSeconds}`);
    lines.push(`- Stale: ${status.waitAuthProbeStatus.stale ? 'yes' : 'no'}`);
    lines.push(`- Active wait: ${status.waitAuthProbeStatus.active ? 'yes' : 'no'}`);
    lines.push(`- Attempts: ${status.waitAuthProbeStatus.attemptCount}`);
    if (status.waitAuthProbeStatus.lastAttempt) {
      lines.push(`- Last attempt: ${status.waitAuthProbeStatus.lastAttempt.attempt}`);
      lines.push(`- Last auth-check OK: ${status.waitAuthProbeStatus.lastAttempt.authCheckOk ? 'yes' : 'no'}`);
      if (status.waitAuthProbeStatus.lastAttempt.authCheckFinalUrl) lines.push(`- Last auth-check final URL: ${redactedValue(status.waitAuthProbeStatus.lastAttempt.authCheckFinalUrl)}`);
    }
  }
  if (status.waitAuthProbeStatus.parseError) lines.push(`- Parse error: ${status.waitAuthProbeStatus.parseError}`);
  lines.push('', '## Handoff Resume Wait Auth Status', '');
  lines.push(`- Exists: ${status.handoffResumeWaitAuthStatus.exists ? 'yes' : 'no'}`);
  if (status.handoffResumeWaitAuthStatus.path) lines.push(`- Path: ${status.handoffResumeWaitAuthStatus.path}`);
  if (status.handoffResumeWaitAuthStatus.exists && !status.handoffResumeWaitAuthStatus.parseError) {
    lines.push(`- Status: ${status.handoffResumeWaitAuthStatus.status}`);
    lines.push(`- Enabled: ${status.handoffResumeWaitAuthStatus.enabled ? 'yes' : 'no'}`);
    if (status.handoffResumeWaitAuthStatus.updatedAt) lines.push(`- Last updated: ${status.handoffResumeWaitAuthStatus.updatedAt}`);
    if (status.handoffResumeWaitAuthStatus.ageSeconds !== null) lines.push(`- Age seconds: ${status.handoffResumeWaitAuthStatus.ageSeconds}`);
    lines.push(`- Stale: ${status.handoffResumeWaitAuthStatus.stale ? 'yes' : 'no'}`);
    lines.push(`- Active wait: ${status.handoffResumeWaitAuthStatus.active ? 'yes' : 'no'}`);
    lines.push(`- Attempts: ${status.handoffResumeWaitAuthStatus.attemptCount}`);
    if (status.handoffResumeWaitAuthStatus.lastAttempt) {
      lines.push(`- Last attempt: ${status.handoffResumeWaitAuthStatus.lastAttempt.attempt}`);
      if (status.handoffResumeWaitAuthStatus.lastAttempt.status) lines.push(`- Last attempt status: ${status.handoffResumeWaitAuthStatus.lastAttempt.status}`);
      lines.push(`- Last auth-check OK: ${status.handoffResumeWaitAuthStatus.lastAttempt.authCheckOk ? 'yes' : 'no'}`);
      if (status.handoffResumeWaitAuthStatus.lastAttempt.childStatus) lines.push(`- Last auth child status: ${status.handoffResumeWaitAuthStatus.lastAttempt.childStatus}`);
    }
  }
  if (status.handoffResumeWaitAuthStatus.parseError) lines.push(`- Parse error: ${status.handoffResumeWaitAuthStatus.parseError}`);
  for (const [heading, authWatch] of [
    ['Auth Watch Status', status.authWatchStatus],
    ['Auth Watch Latest Status', status.authWatchLatestStatus]
  ]) {
    lines.push('', `## ${heading}`, '');
    lines.push(`- Exists: ${authWatch?.exists ? 'yes' : 'no'}`);
    if (authWatch?.path) lines.push(`- Path: ${authWatch.path}`);
    if (authWatch?.exists && !authWatch.parseError) {
      lines.push(`- Status: ${authWatch.status}`);
      lines.push(`- OK: ${authWatch.ok ? 'yes' : 'no'}`);
      if (authWatch.updatedAt) lines.push(`- Last updated: ${authWatch.updatedAt}`);
      if (authWatch.ageSeconds !== null) lines.push(`- Age seconds: ${authWatch.ageSeconds}`);
      lines.push(`- Stale: ${authWatch.stale ? 'yes' : 'no'}`);
      lines.push(`- Active watch: ${authWatch.active ? 'yes' : 'no'}`);
      lines.push(`- Login-like: ${authWatch.loginLike ? 'yes' : 'no'}`);
      lines.push(`- Same origin: ${authWatch.sameOrigin ? 'yes' : 'no'}`);
      if (authWatch.finalUrl) lines.push(`- Final URL: ${redactedValue(authWatch.finalUrl)}`);
      if (authWatch.title) lines.push(`- Title: ${redactedValue(authWatch.title)}`);
      if (authWatch.attemptCount !== null && authWatch.attemptCount !== undefined) lines.push(`- Attempts: ${authWatch.attemptCount}`);
      if (authWatch.nextAction?.id) {
        lines.push(`- Next action: ${authWatch.nextAction.id}`);
        if (authWatch.nextAction.label) lines.push(`- Next action label: ${authWatch.nextAction.label}`);
        if (authWatch.nextAction.command?.shell) {
          lines.push('', '```bash', authWatch.nextAction.command.shell, '```');
        }
      }
    }
    if (authWatch?.parseError) lines.push(`- Parse error: ${authWatch.parseError}`);
  }
  lines.push('', '## Commands', '');
  lines.push('### status', '', '```bash', status.commands.status.shell, '```', '');
  lines.push('### resume-plan', '', '```bash', status.commands.resumePlan.shell, '```', '');
  if (status.commands.loginOpen) {
    lines.push('### login-open', '', '```bash', status.commands.loginOpen.shell, '```', '');
  }
  if (status.commands.loginCaptureWait) {
    lines.push('### login-capture-wait', '', '```bash', status.commands.loginCaptureWait.shell, '```', '');
  }
  if (status.commands.authCheck) {
    lines.push('### auth-check', '', '```bash', status.commands.authCheck.shell, '```', '');
  }
  if (status.commands.authWatch) {
    lines.push('### auth-watch', '', '```bash', status.commands.authWatch.shell, '```', '');
  }
  if (status.commands.handoffResume) {
    lines.push('### handoff-resume', '', '```bash', status.commands.handoffResume.shell, '```', '');
  }
  if (status.commands.operatorReadyResume) {
    lines.push('### operator-ready-resume', '', '```bash', status.commands.operatorReadyResume.shell, '```', '');
  }
  if (status.commands.savedResumeRun) {
    lines.push('### saved-resume-run', '', '```bash', status.commands.savedResumeRun.shell, '```', '');
  }
  lines.push('### completion-audit', '', '```bash', status.commands.completionAudit.shell, '```');
  if (status.outputPath) {
    lines.push('', '## Written Status', '');
    lines.push(`- Path: ${status.outputPath}`);
  }
  if (status.recommendedCommand?.command?.shell) {
    lines.push('', '## Recommended Command', '');
    lines.push(`- ID: ${status.recommendedCommand.id}`);
    lines.push(`- Reason: ${status.recommendedCommand.reason}`);
    lines.push('', '```bash', status.recommendedCommand.command.shell, '```');
  }
  if (status.operatorGuidance) {
    lines.push('', '## Operator Guidance', '');
    lines.push(`- Human action: ${status.operatorGuidance.humanAction}`);
    lines.push(`- Automation blocker: ${status.operatorGuidance.automationBlocker}`);
    lines.push(`- Capture blocked: ${status.operatorGuidance.captureBlocked ? 'yes' : 'no'}`);
    if (status.operatorGuidance.resumeCommand?.shell) {
      lines.push('', '```bash', status.operatorGuidance.resumeCommand.shell, '```');
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function compactValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function redactedValue(value) {
  return compactValue(value) ? '[redacted]' : 'none';
}

export function formatObjectiveStatusCompact(status) {
  const waitAuth = status.waitAuthStatus || {};
  const waitProbe = status.waitAuthProbeStatus || {};
  const authWatch = status.authWatchStatus || {};
  const authWatchLatest = status.authWatchLatestStatus || {};
  const preflight = status.operatorReadyPreflight || {};
  const recommended = status.recommendedCommand || {};
  const guidance = status.operatorGuidance || {};
  const nextCommand = recommended.command?.shell
    || status.nextAction?.command?.shell
    || '';
  const missingArtifacts = Array.isArray(status.nextAction?.missingArtifacts) ? status.nextAction.missingArtifacts : [];
  const missingArtifactIds = missingArtifacts.map((item) => item.id).filter(Boolean);
  const missingOutputFiles = missingArtifacts
    .filter((item) => item.kind === 'output')
    .map((item) => item.path || item.id.replace(/^output:/, ''))
    .filter(Boolean);
  const lines = [
    `status: ${compactValue(status.status)}`,
    `complete: ${status.complete ? 'yes' : 'no'}`,
    `remaining: ${status.remainingCount ?? 0}`,
    `next: ${compactValue(status.nextAction?.id || 'none')}`,
    `operator_input: ${status.nextAction?.needsOperatorInput ? 'yes' : 'no'}`,
    `human_action: ${compactValue(guidance.humanAction || 'unknown')}`,
    `automation_blocker: ${compactValue(guidance.automationBlocker || 'unknown')}`,
    `capture_blocked: ${guidance.captureBlocked ? 'yes' : 'no'}`,
    `auth_state: ${compactValue(status.authState || 'unknown')}`,
    `missing_artifact_count: ${missingArtifacts.length}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`,
    `missing_output_files: ${missingOutputFiles.length ? missingOutputFiles.join(',') : 'none'}`
  ];
  if (preflight.targetDir || preflight.cdpPort || preflight.finalUrl) {
    lines.push(`preflight_ok: ${preflight.ok ? 'yes' : 'no'}`);
    if (preflight.cdpPort) lines.push(`cdp_port: ${compactValue(preflight.cdpPort)}`);
    if (preflight.finalUrl) lines.push(`final_url: ${redactedValue(preflight.finalUrl)}`);
  }
  if (waitAuth.exists) {
    lines.push(`wait_auth: ${compactValue(waitAuth.status || 'unknown')}`);
    lines.push(`wait_auth_active: ${waitAuth.active ? 'yes' : 'no'}`);
    lines.push(`wait_auth_stale: ${waitAuth.stale ? 'yes' : 'no'}`);
    if (waitAuth.ageSeconds !== null && waitAuth.ageSeconds !== undefined) lines.push(`wait_auth_age_seconds: ${waitAuth.ageSeconds}`);
  }
  if (waitProbe.exists) {
    lines.push(`wait_auth_probe: ${compactValue(waitProbe.status || 'unknown')}`);
    lines.push(`wait_auth_probe_stale: ${waitProbe.stale ? 'yes' : 'no'}`);
  }
  if (status.handoffResumeWaitAuthStatus?.exists) {
    lines.push(`handoff_resume_wait_auth: ${compactValue(status.handoffResumeWaitAuthStatus.status || 'unknown')}`);
    lines.push(`handoff_resume_wait_auth_active: ${status.handoffResumeWaitAuthStatus.active ? 'yes' : 'no'}`);
    lines.push(`handoff_resume_wait_auth_stale: ${status.handoffResumeWaitAuthStatus.stale ? 'yes' : 'no'}`);
  }
  if (status.operatorHandoff?.exists && status.operatorHandoff.authCheckPort) {
    lines.push(`handoff_auth_check_port: ${compactValue(status.operatorHandoff.authCheckPort)}`);
    lines.push(`handoff_auth_check_port_reachable: ${status.handoffAuthCheckPortReachable === null || status.handoffAuthCheckPortReachable === undefined ? 'unknown' : status.handoffAuthCheckPortReachable ? 'yes' : 'no'}`);
  }
  if (authWatch.exists) {
    lines.push(`auth_watch: ${compactValue(authWatch.status || 'unknown')}`);
    lines.push(`auth_watch_active: ${authWatch.active ? 'yes' : 'no'}`);
    lines.push(`auth_watch_stale: ${authWatch.stale ? 'yes' : 'no'}`);
    lines.push(`auth_watch_ok: ${authWatch.ok ? 'yes' : 'no'}`);
    lines.push(`auth_watch_login_like: ${authWatch.loginLike ? 'yes' : 'no'}`);
    if (authWatch.ageSeconds !== null && authWatch.ageSeconds !== undefined) lines.push(`auth_watch_age_seconds: ${authWatch.ageSeconds}`);
  }
  if (authWatchLatest.exists) {
    lines.push(`auth_watch_latest: ${compactValue(authWatchLatest.status || 'unknown')}`);
    lines.push(`auth_watch_latest_active: ${authWatchLatest.active ? 'yes' : 'no'}`);
    lines.push(`auth_watch_latest_stale: ${authWatchLatest.stale ? 'yes' : 'no'}`);
    lines.push(`auth_watch_latest_ok: ${authWatchLatest.ok ? 'yes' : 'no'}`);
    lines.push(`auth_watch_latest_login_like: ${authWatchLatest.loginLike ? 'yes' : 'no'}`);
    if (authWatchLatest.ageSeconds !== null && authWatchLatest.ageSeconds !== undefined) lines.push(`auth_watch_latest_age_seconds: ${authWatchLatest.ageSeconds}`);
  }
  if (status.latestHandoffResume?.exists) {
    lines.push(`handoff_resume: ${compactValue(status.latestHandoffResume.status || 'unknown')}`);
    if (status.latestHandoffResume.loginOpen?.status) {
      lines.push(`handoff_resume_login_open: ${compactValue(status.latestHandoffResume.loginOpen.status)}`);
    }
    if (status.latestHandoffResume.loginOpen?.port) {
      lines.push(`handoff_resume_login_port: ${compactValue(status.latestHandoffResume.loginOpen.port)}`);
    }
    if (status.latestHandoffResume.authCheck?.childStatus) {
      lines.push(`handoff_resume_auth_child_status: ${compactValue(status.latestHandoffResume.authCheck.childStatus)}`);
    }
    if (status.latestHandoffResume.authCheck?.loginLike !== null && status.latestHandoffResume.authCheck?.loginLike !== undefined) {
      lines.push(`handoff_resume_auth_login_like: ${status.latestHandoffResume.authCheck.loginLike ? 'yes' : 'no'}`);
    }
    if (status.latestHandoffResume.authCheck?.finalUrl) {
      lines.push(`handoff_resume_auth_final_url: ${redactedValue(status.latestHandoffResume.authCheck.finalUrl)}`);
    }
    if (status.latestHandoffResume.authCheck?.title) {
      lines.push(`handoff_resume_auth_title: ${redactedValue(status.latestHandoffResume.authCheck.title)}`);
    }
  }
  if (recommended.id) {
    lines.push(`recommended_command: ${compactValue(recommended.id)}`);
    lines.push(`recommended_opens_browser: ${recommended.opensBrowser ? 'yes' : 'no'}`);
    lines.push(`recommended_starts_capture: ${recommended.startsCapture ? 'yes' : 'no'}`);
    lines.push(`recommended_requires_operator_approval: ${recommended.requiresOperatorApproval ? 'yes' : 'no'}`);
    lines.push(`recommended_may_run_unattended: ${recommended.mayRunUnattended ? 'yes' : 'no'}`);
    lines.push(`recommended_agent_run_command: ${recommended.agentRunCommand?.shell || 'none'}`);
    lines.push(`recommended_operator_approval_command: ${recommended.operatorApprovalCommand?.shell || 'none'}`);
  }
  lines.push(`agent_safe_next_command_id: ${compactValue(status.agentSafeNext?.id || 'none')}`);
  lines.push(`agent_safe_next_may_run_unattended: ${status.agentSafeNext?.mayRunUnattended ? 'yes' : 'no'}`);
  lines.push(`agent_safe_next_opens_browser: ${status.agentSafeNext?.opensBrowser ? 'yes' : 'no'}`);
  lines.push(`agent_safe_next_starts_capture: ${status.agentSafeNext?.startsCapture ? 'yes' : 'no'}`);
  lines.push(`agent_safe_next_starts_background: ${status.agentSafeNext?.startsBackground ? 'yes' : 'no'}`);
  lines.push(`agent_safe_next_reads_browser_storage: ${status.agentSafeNext?.readsBrowserStorage ? 'yes' : 'no'}`);
  lines.push(`agent_safe_next_returns_page_content: ${status.agentSafeNext?.returnsPageContent ? 'yes' : 'no'}`);
  lines.push(`agent_safe_next_blocked_reason: ${compactValue(status.agentSafeNext?.blockedReason || 'none')}`);
  if (status.agentSafeNext?.command?.shell) lines.push(`agent_safe_next_command: ${status.agentSafeNext.command.shell}`);
  if (nextCommand) lines.push(`command: ${nextCommand}`);
  if (status.status === 'waiting-for-login'
    && status.operatorHandoff?.exists
    && status.operatorHandoff.authCheckPort
    && status.handoffAuthCheckPortReachable === false) {
    lines.push('auth_watch_blocked_reason: handoff-auth-check-port-unreachable');
  }
  if (status.status === 'waiting-for-login' && status.commands?.authWatch?.shell) {
    lines.push(`auth_watch_command: ${status.commands.authWatch.shell}`);
  }
  if (status.status === 'waiting-for-login' && status.commands?.handoffResume?.shell) {
    lines.push(`handoff_resume_command: ${status.commands.handoffResume.shell}`);
  }
  return `${lines.join('\n')}\n`;
}
