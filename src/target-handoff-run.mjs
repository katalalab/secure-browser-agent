import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { safeOutputPath } from './output.mjs';
import { loadPolicy } from './policy.mjs';
import { buildTargetAuthCheck } from './target-auth-check.mjs';
import { buildTargetLoginCapture } from './target-login-capture.mjs';
import { resolveTargetPack } from './target-pack.mjs';

const ALLOWED_COMMANDS = new Set([
  'target-proof-capture',
  'target-auth-check',
  'control-status',
  'secret-run-plan',
  'target-proof-plan',
  'readiness-audit',
  'objective-completion-audit',
  'objective-next'
]);
const SYNTHESIZED_COMMAND_IDS = new Set(['auth-check-status', 'control-status', 'secret-run-plan']);

function defaultRunner(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: Number(options.timeoutMs || 300000)
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
  const okLine = stdout.match(/^OK:\s+(yes|no)$/m)?.[1] || stdout.match(/^ok:\s+(yes|no)$/m)?.[1] || '';
  const childOk = okLine ? okLine === 'yes' : null;
  const loginLikeLine = stdout.match(/^(?:- )?Login-like:\s+(yes|no)$/m)?.[1]
    || stdout.match(/^login_like:\s+(yes|no)$/m)?.[1]
    || '';
  const sameOriginLine = stdout.match(/^(?:- )?Same origin:\s+(yes|no)$/m)?.[1]
    || stdout.match(/^same_origin:\s+(yes|no)$/m)?.[1]
    || '';
  const childIncomplete = ['blocked', 'failed', 'timed-out'].includes(childStatus) || childOk === false;
  return {
    ok: Boolean(result.ok) && !childIncomplete,
    status: result.status ?? null,
    signal: result.signal || '',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stdoutTail: stdout.split(/\r?\n/).slice(-5).join('\n').slice(-1200),
    stderrTail: stderr.split(/\r?\n/).slice(-5).join('\n').slice(-1200),
    error: result.error || '',
    childStatus: childStatus || (childOk === false ? 'not-ok' : ''),
    childOk,
    finalUrl: parsedStdout?.finalUrl || stdout.match(/^Final URL:\s+(.+)$/m)?.[1]?.trim() || stdout.match(/^final_url:\s+(.+)$/m)?.[1]?.trim() || '',
    title: parsedStdout?.title || stdout.match(/^Title:\s+(.+)$/m)?.[1]?.trim() || stdout.match(/^title:\s+(.+)$/m)?.[1]?.trim() || '',
    loginLike: typeof parsedStdout?.loginLike === 'boolean' ? parsedStdout.loginLike : (loginLikeLine ? loginLikeLine === 'yes' : null),
    sameOrigin: typeof parsedStdout?.sameOrigin === 'boolean' ? parsedStdout.sameOrigin : (sameOriginLine ? sameOriginLine === 'yes' : null)
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function redactedValue(value) {
  return compactValue(value) === 'none' ? 'none' : '[redacted]';
}

function redactedTail(value) {
  return String(value || '')
    .replace(/((?:Final URL|Page URL|Title|final_url|page_url|title):\s*)[^|\r\n]+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s|]+/g, '[redacted]');
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function commandFromArgs(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function commandOpensBrowser(args) {
  return Array.isArray(args) && (args.includes('--open-login') || args.includes('target-login-capture'));
}

function commandStartsCapture(args) {
  if (!Array.isArray(args)) return false;
  if (!args.includes('--run')) return false;
  return args.includes('target-proof-capture')
    || args.includes('target-handoff-resume')
    || args.includes('target-handoff-run');
}

function loginCaptureWaitCommand(targetDir) {
  return commandFromArgs([
    'node',
    'src/cli.mjs',
    'target-login-capture',
    targetDir,
    '--real-external',
    '--handoff-out',
    'operator-handoff.json',
    '--wait-auth-status-out',
    'wait-auth-status.json',
    '--format',
    'markdown'
  ]);
}

function handoffResumeWaitCommand(targetDir, options = {}) {
  return commandFromArgs([
    'node',
    'src/cli.mjs',
    'target-handoff-resume',
    targetDir,
    '--handoff',
    options.handoff || 'operator-handoff.json',
    '--run',
    '--open-login',
    '--wait-auth',
    '--wait-auth-status-out',
    waitAuthStatusOut(options) || 'handoff-resume-wait-auth-status.json',
    '--out',
    options.out || 'handoff-resume-latest.json',
    '--format',
    'compact'
  ]);
}

function handoffResumeNoOpenCommand(targetDir, options = {}) {
  return commandFromArgs([
    'node',
    'src/cli.mjs',
    'target-handoff-resume',
    targetDir,
    '--handoff',
    options.handoff || 'operator-handoff.json',
    '--run',
    '--wait-auth',
    '--wait-auth-status-out',
    waitAuthStatusOut(options) || 'handoff-resume-wait-auth-status.json',
    '--out',
    options.out || 'handoff-resume-latest.json',
    '--format',
    'compact'
  ]);
}

function handoffResumeWatchCommand(targetDir, options = {}, { run = false } = {}) {
  return commandFromArgs([
    'node',
    'src/cli.mjs',
    'target-handoff-resume-watch',
    targetDir,
    '--handoff',
    options.handoff || 'operator-handoff.json',
    ...(run ? ['--run'] : []),
    '--monitor-timeout-ms',
    String(options.monitorTimeoutMs || 300000),
    '--monitor-interval-ms',
    String(options.monitorIntervalMs || 5000),
    '--format',
    'compact'
  ]);
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

function compactCommand(commandValue) {
  const args = Array.isArray(commandValue?.args) ? [...commandValue.args] : [];
  const formatIndex = args.indexOf('--format');
  if (formatIndex >= 0 && args[formatIndex + 1]) args[formatIndex + 1] = 'compact';
  return args.length ? commandFromArgs(args) : commandValue;
}

function targetProofCapturePlanCommand(targetDir, status = {}, options = {}) {
  return commandFromArgs([
    'node',
    'src/cli.mjs',
    'target-proof-capture',
    targetDir,
    ...(status.realExternal ? ['--real-external'] : []),
    '--wait-auth',
    ...(status.authCheckPort ? ['--auth-check-port', String(status.authCheckPort)] : []),
    '--wait-auth-status-out',
    waitAuthStatusOut(options) || 'handoff-resume-wait-auth-status.json',
    '--completion-audit',
    '--format',
    'compact'
  ]);
}

function withWaitAuthStatusOut(args) {
  if (!Array.isArray(args)) return args;
  if (args[2] !== 'target-proof-capture') return args;
  if (!args.includes('--wait-auth')) return args;
  if (args.includes('--wait-auth-status-out')) return args;
  const insert = ['--wait-auth-status-out', 'wait-auth-status.json'];
  const formatIndex = args.indexOf('--format');
  return formatIndex >= 0
    ? [...args.slice(0, formatIndex), ...insert, ...args.slice(formatIndex)]
    : [...args, ...insert];
}

function argAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return '';
  return args[index + 1] || '';
}

function normalizeOptions(options = {}) {
  return {
    ...options,
    handoff: options.handoff || 'operator-handoff.json',
    out: options.out || '',
    commandId: options.commandId || options.command || 'post-login-capture',
    run: Boolean(options.run),
    waitAuth: Boolean(options.waitAuth || options['wait-auth']),
    waitAuthTimeoutMs: Number(options.waitAuthTimeoutMs || options['wait-auth-timeout-ms'] || 300000),
    waitAuthIntervalMs: Number(options.waitAuthIntervalMs || options['wait-auth-interval-ms'] || 5000),
    monitorTimeoutMs: Number(options.monitorTimeoutMs || options['monitor-timeout-ms'] || 300000),
    monitorIntervalMs: Number(options.monitorIntervalMs || options['monitor-interval-ms'] || 5000),
    waitAuthStatusOut: options.waitAuthStatusOut || options['wait-auth-status-out'] || '',
    openLogin: Boolean(options.openLogin || options['open-login']),
    timeoutMs: options.timeoutMs || options['timeout-ms'],
    preflightAuth: options.preflightAuth !== false
      && options['preflight-auth'] !== false
      && options['no-preflight-auth'] !== true
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitAuthStatusOut(options = {}) {
  const value = options.waitAuthStatusOut || options['wait-auth-status-out'];
  if (!value) return '';
  if (value === true) return 'wait-auth-status.json';
  return String(value);
}

function buildResumeWaitAuth(normalized) {
  return {
    enabled: Boolean(normalized.waitAuth),
    timeoutMs: normalized.waitAuthTimeoutMs,
    intervalMs: normalized.waitAuthIntervalMs,
    status: normalized.waitAuth ? 'not-started' : 'not-requested',
    attempts: [],
    outputPath: ''
  };
}

function writeResumeWaitAuthStatus(policy, result, waitAuth, options = {}) {
  const out = waitAuthStatusOut(options);
  if (!out) return '';
  const outputPath = safeOutputPath(policy, out);
  waitAuth.outputPath = outputPath;
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: result.target,
    dir: result.dir,
    handoffPath: result.handoffPath,
    realExternal: Boolean(result.handoffStatus?.realExternal),
    status: waitAuth.status,
    enabled: waitAuth.enabled,
    timeoutMs: waitAuth.timeoutMs,
    intervalMs: waitAuth.intervalMs,
    attempts: waitAuth.attempts
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outputPath;
}

function validateCommandArgs(args) {
  if (!Array.isArray(args) || args.length < 3) {
    throw new Error('handoff command is missing structured args');
  }
  if (args[0] !== 'node' || args[1] !== 'src/cli.mjs') {
    throw new Error(`handoff command must start with node src/cli.mjs: ${args.join(' ')}`);
  }
  if (!ALLOWED_COMMANDS.has(args[2])) {
    throw new Error(`handoff command is not allowed: ${args[2]}`);
  }
}

function synthesizeHandoffCommand(commandId, handoff, target) {
  if (!SYNTHESIZED_COMMAND_IDS.has(commandId)) return null;
  const capture = (handoff.handoff?.commands || []).find((item) => item.id === 'post-login-capture');
  const captureArgs = Array.isArray(capture?.args) ? capture.args : [];
  const authCheckPort = argAfter(captureArgs, '--auth-check-port');
  const realExternal = Boolean(handoff.realExternal || captureArgs.includes('--real-external'));

  if (commandId === 'auth-check-status') {
    return {
      id: 'auth-check-status',
      title: 'Check whether the dedicated browser is past the login page without capturing proof artifacts',
      synthesized: true,
      args: [
        'node',
        'src/cli.mjs',
        'target-auth-check',
        target.dir,
        ...(realExternal ? ['--real-external'] : []),
        ...(authCheckPort ? ['--cdp-port', String(authCheckPort)] : []),
        '--format',
        'markdown'
      ]
    };
  }
  if (commandId === 'control-status') {
    return {
      id: 'control-status',
      title: 'Show the compact objective, runtime, and 1Password/headless status in one response',
      synthesized: true,
      args: ['node', 'src/cli.mjs', 'control-status', '--format', 'compact']
    };
  }
  return {
    id: 'secret-run-plan',
    title: 'Show the op run wrapper for headless 1Password Service Account execution',
    synthesized: true,
    args: [
      'node',
      'src/cli.mjs',
      'secret-run-plan',
      '--mode',
      'service-account',
      '--command',
      'target-login-capture',
      '--target-dir',
      target.dir,
      '--format',
      'compact'
    ]
  };
}

function normalizeHandoffCommand(item) {
  if (!item) return null;
  const base = {
    id: item.id || '',
    title: item.title || '',
    synthesized: Boolean(item.synthesized),
    commandName: Array.isArray(item.args) ? item.args[2] || '' : '',
    command: null,
    error: ''
  };
  try {
    validateCommandArgs(item.args);
    const args = withWaitAuthStatusOut(item.args);
    return {
      ...base,
      commandName: args[2],
      command: commandFromArgs(args)
    };
  } catch (error) {
    return {
      ...base,
      error: error.message
    };
  }
}

function availableHandoffCommands(handoff, target) {
  const commands = [];
  for (const item of handoff.handoff?.commands || []) {
    commands.push(normalizeHandoffCommand(item));
  }
  for (const id of SYNTHESIZED_COMMAND_IDS) {
    if (commands.some((item) => item.id === id)) continue;
    const synthesized = synthesizeHandoffCommand(id, handoff, target);
    if (synthesized) commands.push(normalizeHandoffCommand(synthesized));
  }
  return commands.filter(Boolean);
}

async function buildAuthPreflight(args, options = {}) {
  if (!options.preflightAuth) return null;
  if (args[2] !== 'target-proof-capture') return null;
  const targetDir = args[3];
  const cdpPort = argAfter(args, '--auth-check-port');
  if (!targetDir || !cdpPort) return null;
  const realExternal = args.includes('--real-external');
  const report = typeof options.authPreflight === 'function'
    ? await options.authPreflight({
      args,
      targetDir,
      cdpPort,
      realExternal,
      generatedAt: options.generatedAt
    })
    : await buildTargetAuthCheck(targetDir, {
      realExternal,
      cdpPort,
      generatedAt: options.generatedAt
    });
  const ok = Boolean(report?.ok);
  return {
    ok,
    kind: report?.kind || 'target-auth-check',
    targetDir,
    cdpPort: String(cdpPort),
    finalUrl: report?.finalUrl || '',
    title: report?.title || '',
    loginLike: Boolean(report?.loginLike),
    blocker: report?.blocker || (ok ? '' : 'Auth preflight failed: target still appears unauthenticated before handoff run.')
  };
}

function writeRunResult(policy, result, out) {
  if (!out) return result;
  const outputPath = safeOutputPath(policy, out);
  result.outputPath = outputPath;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

function readOutputJson(policy, outPath) {
  const outputPath = safeOutputPath(policy, outPath);
  if (!fs.existsSync(outputPath)) {
    return { path: outputPath, exists: false, parseOk: false, value: null, error: '' };
  }
  try {
    return {
      path: outputPath,
      exists: true,
      parseOk: true,
      value: JSON.parse(fs.readFileSync(outputPath, 'utf8')),
      error: ''
    };
  } catch (error) {
    return {
      path: outputPath,
      exists: true,
      parseOk: false,
      value: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function ageSeconds(generatedAt, savedGeneratedAt) {
  const now = Date.parse(generatedAt || '');
  const saved = Date.parse(savedGeneratedAt || '');
  if (!Number.isFinite(now) || !Number.isFinite(saved)) return null;
  return Math.max(0, Math.floor((now - saved) / 1000));
}

function savedOutputStatus(read, generatedAt) {
  const value = read.value || {};
  return {
    path: read.path,
    exists: read.exists,
    parseOk: read.parseOk,
    parseError: read.error,
    generatedAt: value.generatedAt || '',
    ageSeconds: read.parseOk ? ageSeconds(generatedAt, value.generatedAt) : null,
    status: read.parseOk ? value.status || '' : '',
    target: read.parseOk ? value.target || '' : '',
    secretValuesRead: Boolean(read.parseOk && value.secretValuesRead),
    destructiveActionsIncluded: Boolean(read.parseOk && value.destructiveActionsIncluded)
  };
}

export function buildTargetHandoffStatus(targetDir, options = {}) {
  const normalized = normalizeOptions(options);
  const target = resolveTargetPack(targetDir);
  const policy = loadPolicy(target.policy);
  const handoffPath = safeOutputPath(policy, normalized.handoff);
  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  const availableCommands = availableHandoffCommands(handoff, target);
  const postLogin = availableCommands.find((item) => item.id === 'post-login-capture');
  const authCheck = availableCommands.find((item) => item.id === 'auth-check-status');
  const authCheckPort = postLogin?.command?.args ? argAfter(postLogin.command.args, '--auth-check-port') : '';
  const invalidCommands = availableCommands.filter((item) => item.error);
  const recommended = authCheck && !authCheck.error ? authCheck : postLogin;
  const recommendedOpensBrowser = commandOpensBrowser(recommended?.command?.args);
  const recommendedStartsCapture = commandStartsCapture(recommended?.command?.args);
  const agentSafeNextCommand = recommended?.command && !recommendedOpensBrowser && !recommendedStartsCapture
    ? compactCommand(recommended.command)
    : commandFromArgs(['node', 'src/cli.mjs', 'target-handoff-resume-status', target.dir, '--handoff', normalized.handoff, '--format', 'compact']);
  return {
    schemaVersion: 1,
    generatedAt: normalized.generatedAt || new Date().toISOString(),
    target: target.metadata.target || handoff.target || '',
    dir: target.dir,
    handoffPath,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    status: invalidCommands.length ? 'has-invalid-commands' : 'ready',
    realExternal: Boolean(handoff.realExternal || postLogin?.command?.args?.includes('--real-external')),
    commandCount: availableCommands.length,
    synthesizedCount: availableCommands.filter((item) => item.synthesized).length,
    invalidCount: invalidCommands.length,
    authCheckPort: authCheckPort || '',
    availableCommands,
    recommendedCommand: recommended
      ? {
          id: recommended.id,
          reason: recommended.id === 'auth-check-status'
            ? 'Check the dedicated login browser state before running capture.'
            : 'Run the post-login proof capture command.',
          command: recommended.command
        }
      : null,
    agentSafeNext: recommended
      ? noBrowserSafeNext(
        recommendedOpensBrowser || recommendedStartsCapture ? 'target-handoff-resume-status' : recommended.id,
        agentSafeNextCommand,
        recommendedOpensBrowser || recommendedStartsCapture ? 'operator-approval-required' : 'none'
      )
      : noBrowserSafeNext('none', null, 'no-recommended-command')
  };
}

export function buildTargetHandoffResumeStatus(targetDir, options = {}) {
  const normalized = normalizeOptions(options);
  const generatedAt = normalized.generatedAt || new Date().toISOString();
  const target = resolveTargetPack(targetDir);
  const policy = loadPolicy(target.policy);
  const handoffStatus = buildTargetHandoffStatus(targetDir, normalized);
  const resume = readOutputJson(policy, options.in || options.input || 'handoff-resume-latest.json');
  const waitAuth = readOutputJson(policy, normalized.waitAuthStatusOut || 'handoff-resume-wait-auth-status.json');
  const authWatch = readOutputJson(policy, options.authWatchIn || options['auth-watch-in'] || 'auth-watch-status.json');
  const authCheck = readOutputJson(policy, options.authCheckIn || options['auth-check-in'] || 'auth-check-status.json');
  const resumeStatus = savedOutputStatus(resume, generatedAt);
  const waitAuthStatus = savedOutputStatus(waitAuth, generatedAt);
  const authWatchStatus = savedOutputStatus(authWatch, generatedAt);
  const authCheckStatus = savedOutputStatus(authCheck, generatedAt);
  const waitValue = waitAuth.value || {};
  const resumeValue = resume.value || {};
  const authWatchValue = authWatch.value || {};
  const latestAuthOk = Boolean(
    resumeValue.authCheck?.result?.ok
      || resumeValue.capture?.status === 'completed'
      || waitValue.status === 'authenticated'
      || authWatchValue.status === 'authenticated'
  );
  const captureCompleted = Boolean(resumeValue.capture?.status === 'completed' || resumeValue.status === 'completed');
  const waitingForLogin = Boolean(
    resumeValue.status === 'waiting-for-login'
      || waitValue.status === 'waiting'
      || waitValue.status === 'timed-out'
      || authWatchValue.status === 'waiting'
      || authWatchValue.status === 'timed-out'
  );
  const recommended = captureCompleted
    ? { id: 'completion-audit', command: commandFromArgs(['node', 'src/cli.mjs', 'objective-completion-audit', '--format', 'compact']) }
    : latestAuthOk
    ? { id: 'resume-capture', command: handoffResumeNoOpenCommand(target.dir, normalized) }
    : { id: 'monitor-auth', command: commandFromArgs([
        'node',
        'src/cli.mjs',
        'target-auth-watch',
        target.dir,
        ...(handoffStatus.realExternal ? ['--real-external'] : []),
        '--handoff',
        normalized.handoff,
        '--status-out',
        options.authWatchIn || options['auth-watch-in'] || 'auth-watch-status.json',
        '--timeout-ms',
        String(normalized.monitorTimeoutMs),
        '--interval-ms',
        String(normalized.monitorIntervalMs),
        '--format',
        'compact'
	      ]) };

  const recommendedOpensBrowser = commandOpensBrowser(recommended.command?.args);
  const recommendedStartsCapture = commandStartsCapture(recommended.command?.args);
  const recommendedRequiresOperatorApproval = Boolean(recommendedStartsCapture);
  const recommendedUsesWatchWrapper = recommended.id === 'monitor-auth';
  const recommendedMayRunUnattended = Boolean(!recommendedOpensBrowser && !recommendedStartsCapture && !recommendedUsesWatchWrapper);
  const recommendedWatchPlanCommand = handoffResumeWatchCommand(target.dir, normalized);
  const recommendedWatchRunCommand = handoffResumeWatchCommand(target.dir, normalized, { run: true });
  const capturePlanCommand = targetProofCapturePlanCommand(target.dir, handoffStatus, normalized);
  const agentSafeNext = captureCompleted
    ? noBrowserSafeNext('completion-audit', recommended.command, 'none')
    : recommended.id === 'monitor-auth'
      ? noBrowserSafeNext('target-handoff-resume-watch', recommendedWatchRunCommand, 'none')
      : noBrowserSafeNext('capture-plan', capturePlanCommand, 'operator-approval-required');

  return {
    schemaVersion: 1,
    generatedAt,
    target: handoffStatus.target,
    dir: target.dir,
    handoffPath: handoffStatus.handoffPath,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    pageContentReturned: false,
    status: captureCompleted ? 'completed' : latestAuthOk ? 'auth-ready' : waitingForLogin ? 'waiting-for-login' : 'no-saved-run',
    realExternal: handoffStatus.realExternal,
    authCheckPort: handoffStatus.authCheckPort,
    latestAuthOk,
    captureCompleted,
    waitingForLogin,
    resume: resumeStatus,
    waitAuth: {
      ...waitAuthStatus,
      enabled: Boolean(waitValue.enabled),
      attempts: Array.isArray(waitValue.attempts) ? waitValue.attempts.length : 0
    },
    authWatch: {
      ...authWatchStatus,
      attempts: Array.isArray(authWatchValue.attempts) ? authWatchValue.attempts.length : 0
    },
    authCheck: authCheckStatus,
    capturePlanCommand,
    recommendedCommand: {
      ...recommended,
      opensBrowser: recommendedOpensBrowser,
      startsCapture: recommendedStartsCapture,
      requiresOperatorApproval: recommendedRequiresOperatorApproval,
      mayRunUnattended: recommendedMayRunUnattended,
      agentRunCommand: recommendedMayRunUnattended ? recommended.command : null,
      operatorApprovalCommand: recommendedRequiresOperatorApproval ? recommended.command : null,
      watchPlanCommand: recommendedWatchPlanCommand,
      watchRunCommand: recommendedWatchRunCommand
    },
    agentSafeNext
  };
}

export async function buildTargetHandoffResumeWatch(targetDir, options = {}) {
  const normalized = normalizeOptions(options);
  const run = Boolean(options.run);
  const operatorOk = String(options.operatorOk || options['operator-ok'] || '');
  const operatorOkAccepted = operatorOk === 'OK';
  const status = buildTargetHandoffResumeStatus(targetDir, normalized);
  const authCheckPortReachable = options.authCheckPortReachable !== undefined
    ? options.authCheckPortReachable
    : normalized.runner
    ? null
    : await probeTcpPort(status.authCheckPort);
  const commandInfo = status.captureCompleted
    ? {
        id: 'completion-audit',
        startsCapture: false,
        command: commandFromArgs(['node', 'src/cli.mjs', 'objective-completion-audit', '--format', 'compact'])
      }
    : status.latestAuthOk
    ? {
        id: 'resume-capture',
        startsCapture: true,
        command: handoffResumeNoOpenCommand(status.dir, normalized)
      }
    : {
        id: 'monitor-auth',
        startsCapture: false,
        command: status.recommendedCommand?.command
      };
  const watch = {
    schemaVersion: 1,
    generatedAt: normalized.generatedAt || new Date().toISOString(),
    target: status.target,
    dir: status.dir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    run,
    status: run ? 'running' : 'planned',
    statusBefore: status,
    authCheckPort: status.authCheckPort,
    authCheckPortReachable,
    selectedCommand: commandInfo,
    selectedCommandAvailable: true,
    selectedCommandBlockedReason: 'none',
    selectedRequiresOperatorApproval: Boolean(commandInfo.startsCapture),
    selectedMayRunUnattended: false,
    selectedAgentRunCommand: null,
    selectedOperatorApprovalCommand: null,
    result: null
  };
  if (commandInfo.id === 'monitor-auth' && authCheckPortReachable === false) {
    watch.selectedCommandAvailable = false;
    watch.selectedCommandBlockedReason = 'handoff-auth-check-port-unreachable';
  }
  watch.selectedMayRunUnattended = Boolean(watch.selectedCommandAvailable && !watch.selectedRequiresOperatorApproval);
  watch.selectedAgentRunCommand = watch.selectedMayRunUnattended ? commandInfo.command : null;
  watch.selectedOperatorApprovalCommand = watch.selectedCommandAvailable && watch.selectedRequiresOperatorApproval ? commandInfo.command : null;
  watch.operatorOkRequired = Boolean(run && commandInfo.startsCapture);
  watch.operatorOkAccepted = operatorOkAccepted;
  watch.startsCaptureNow = Boolean(run && commandInfo.startsCapture && operatorOkAccepted);

  if (!run) {
    watch.status = 'planned';
    return watch;
  }

  if (watch.operatorOkRequired && !operatorOkAccepted) {
    watch.status = 'blocked';
    watch.result = {
      ok: false,
      error: 'Selected handoff continuation may start capture; re-run with --operator-ok OK after explicit operator approval.'
    };
    watch.startsCaptureNow = false;
    return watch;
  }

  if (!watch.selectedCommandAvailable) {
    watch.status = 'blocked';
    watch.result = {
      ok: false,
      error: 'Saved handoff auth-check port is not reachable; reopen the dedicated login browser before monitoring auth.'
    };
    watch.startsCaptureNow = false;
    return watch;
  }

  if (!commandInfo.command?.args) {
    watch.status = 'failed';
    watch.result = { ok: false, error: 'no recommended handoff resume watch command' };
    return watch;
  }

  const runner = normalized.runner || defaultRunner;
  const runResult = summarizeRun(runner(commandInfo.command.args, {
    cwd: normalized.rootDir || process.cwd(),
    timeoutMs: normalized.timeoutMs
  }));
  watch.result = runResult;
  watch.status = runResult.ok ? 'completed' : runResult.childStatus || 'failed';
  return watch;
}

export async function buildTargetHandoffRun(targetDir, options = {}) {
  const normalized = normalizeOptions(options);
  const target = resolveTargetPack(targetDir);
  const policy = loadPolicy(target.policy);
  const handoffPath = safeOutputPath(policy, normalized.handoff);
  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  const availableCommands = availableHandoffCommands(handoff, target);
  const handoffCommand = availableCommands.find((item) => item.id === normalized.commandId);
  if (!handoffCommand) {
    throw new Error(`handoff command not found: ${normalized.commandId}`);
  }
  if (handoffCommand.error) {
    throw new Error(handoffCommand.error);
  }
  const selected = {
    id: handoffCommand.id,
    title: handoffCommand.title || '',
    synthesized: Boolean(handoffCommand.synthesized),
    command: handoffCommand.command
  };
  const result = {
    schemaVersion: 1,
    generatedAt: normalized.generatedAt || new Date().toISOString(),
    target: target.metadata.target || handoff.target || '',
    dir: target.dir,
    handoffPath,
    commandId: selected.id,
    safeMode: true,
    destructiveActionsIncluded: false,
    run: normalized.run,
    readyToRun: true,
    status: normalized.run ? 'running' : 'planned',
    selected,
    availableCommands,
    authPreflight: null,
    nextAction: null,
    blockers: [],
    outputPath: '',
    result: null
  };

  if (!normalized.run) {
    result.status = 'planned';
    return writeRunResult(policy, result, normalized.out);
  }

  const preflight = await buildAuthPreflight(selected.command.args, normalized);
  result.authPreflight = preflight;
  if (preflight && !preflight.ok) {
    result.readyToRun = false;
    result.status = 'blocked';
    result.blockers = [preflight.blocker].filter(Boolean);
    result.nextAction = {
      id: 'login-capture-wait',
      label: 'Open the dedicated login browser, wait for auth-check, then retry capture',
      command: loginCaptureWaitCommand(target.dir)
    };
    return writeRunResult(policy, result, normalized.out);
  }

  const runner = normalized.runner || defaultRunner;
  const runResult = summarizeRun(runner(selected.command.args, {
    cwd: normalized.rootDir || process.cwd(),
    timeoutMs: normalized.timeoutMs
  }));
  result.result = runResult;
  result.status = runResult.ok ? 'completed' : 'failed';
  return writeRunResult(policy, result, normalized.out);
}

export async function buildTargetHandoffResume(targetDir, options = {}) {
  const normalized = normalizeOptions(options);
  const target = resolveTargetPack(targetDir);
  const policy = loadPolicy(target.policy);
  const status = buildTargetHandoffStatus(targetDir, normalized);
  const waitAuth = buildResumeWaitAuth(normalized);
  const result = {
    schemaVersion: 1,
    generatedAt: normalized.generatedAt || new Date().toISOString(),
    target: status.target,
    dir: target.dir,
    handoffPath: status.handoffPath,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    run: normalized.run,
    status: normalized.run ? 'running' : 'planned',
    handoffStatus: status,
    waitAuth,
    loginOpen: null,
    authCheck: null,
    capture: null,
    nextAction: status.recommendedCommand
      ? {
          id: status.recommendedCommand.id,
          label: status.recommendedCommand.reason,
          command: status.recommendedCommand.command
        }
      : null,
    blockers: [],
    outputPath: ''
  };

  if (!normalized.run) {
    return writeRunResult(policy, result, normalized.out);
  }

  const refreshHandoffStatus = () => {
    result.handoffStatus = buildTargetHandoffStatus(targetDir, normalized);
  };

  const runAuthCheck = async () => buildTargetHandoffRun(targetDir, {
    ...normalized,
    out: '',
    commandId: 'auth-check-status',
    run: true,
    preflightAuth: false
  });

  let authCheck = null;
  if (normalized.openLogin) {
    authCheck = await runAuthCheck();
    result.authCheck = authCheck;
    if (authCheck.status !== 'completed' || authCheck.result?.ok !== true) {
      result.loginOpen = await buildTargetLoginCapture(targetDir, {
        ...normalized,
        realExternal: Boolean(status.realExternal),
        waitAuthTimeoutMs: '',
        waitAuthIntervalMs: '',
        waitAuthStatusOut: 'wait-auth-status.json',
        completionAudit: true,
        openOnly: true,
        handoffOut: normalized.handoff,
        handoffFormat: 'json',
        captureBuilder: async () => {
          throw new Error('capture should not run when opening login browser from handoff resume');
        }
      });
      refreshHandoffStatus();
      result.nextAction = result.handoffStatus.recommendedCommand
        ? {
            id: result.handoffStatus.recommendedCommand.id,
            label: result.handoffStatus.recommendedCommand.reason,
            command: result.handoffStatus.recommendedCommand.command
          }
        : result.nextAction;
      authCheck = null;
    }
  }
  if (waitAuth.enabled) {
    waitAuth.status = 'waiting';
    writeResumeWaitAuthStatus(policy, result, waitAuth, normalized);
    const startedAt = Date.now();
    const sleeper = normalized.sleep || sleep;
    while (Date.now() - startedAt <= waitAuth.timeoutMs) {
      authCheck = await runAuthCheck();
      result.authCheck = authCheck;
      waitAuth.attempts.push({
        attempt: waitAuth.attempts.length + 1,
        generatedAt: new Date().toISOString(),
        status: authCheck.status,
        ok: Boolean(authCheck.result?.ok),
        childStatus: authCheck.result?.childStatus || '',
        childOk: authCheck.result?.childOk ?? null,
        finalUrl: authCheck.result?.finalUrl || '',
        title: authCheck.result?.title || '',
        loginLike: authCheck.result?.loginLike ?? null,
        sameOrigin: authCheck.result?.sameOrigin ?? null
      });
      if (authCheck.status === 'completed' && authCheck.result?.ok === true) {
        waitAuth.status = 'authenticated';
        writeResumeWaitAuthStatus(policy, result, waitAuth, normalized);
        break;
      }
      writeResumeWaitAuthStatus(policy, result, waitAuth, normalized);
      await sleeper(waitAuth.intervalMs);
    }
    if (waitAuth.status !== 'authenticated') {
      waitAuth.status = 'timed-out';
      writeResumeWaitAuthStatus(policy, result, waitAuth, normalized);
    }
  } else {
    authCheck = await runAuthCheck();
    result.authCheck = authCheck;
  }
  if (!authCheck) {
    authCheck = await runAuthCheck();
    result.authCheck = authCheck;
  }

  if (authCheck.status !== 'completed' || authCheck.result?.ok !== true) {
    result.status = 'waiting-for-login';
    result.blockers = [
      waitAuth.status === 'timed-out'
        ? 'Timed out waiting for the saved handoff auth-check to report OK: yes.'
        : '',
      authCheck.result?.childStatus === 'not-ok'
        ? 'Auth check is reachable but still reports OK: no.'
        : 'Auth check has not proved the dedicated browser is authenticated.'
    ].filter(Boolean);
    result.nextAction = {
      id: 'handoff-resume-wait',
      label: 'Complete login in the already-open dedicated browser, then run the auth-first resume command again.',
      command: handoffResumeWaitCommand(target.dir, normalized)
    };
    return writeRunResult(policy, result, normalized.out);
  }

  const capture = await buildTargetHandoffRun(targetDir, {
    ...normalized,
    out: '',
    commandId: 'post-login-capture',
    run: true,
    preflightAuth: true
  });
  result.capture = capture;
  result.status = capture.status === 'completed' ? 'completed' : capture.status;
  if (capture.blockers?.length) result.blockers = capture.blockers;
  if (capture.nextAction) result.nextAction = capture.nextAction;
  return writeRunResult(policy, result, normalized.out);
}

export function formatTargetHandoffStatusCompact(result) {
  const lines = [
    `status: ${compactValue(result.status)}`,
    `target: ${compactValue(result.target)}`,
    `real_external: ${yesNo(result.realExternal)}`,
    `commands: ${result.commandCount}`,
    `synthesized: ${result.synthesizedCount}`,
    `invalid: ${result.invalidCount}`,
    `auth_check_port: ${compactValue(result.authCheckPort)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `available: ${(result.availableCommands || []).map((item) => item.error ? `${item.id}:invalid` : (item.synthesized ? `${item.id}:synthesized` : item.id)).join(',') || 'none'}`
  ];
  if (result.recommendedCommand) {
    lines.push(`recommended_command: ${compactValue(result.recommendedCommand.id)}`);
    if (result.recommendedCommand.command?.shell) lines.push(`command: ${result.recommendedCommand.command.shell}`);
  }
  lines.push(`agent_safe_next_command_id: ${compactValue(result.agentSafeNext?.id || 'none')}`);
  lines.push(`agent_safe_next_may_run_unattended: ${yesNo(result.agentSafeNext?.mayRunUnattended)}`);
  lines.push(`agent_safe_next_opens_browser: ${yesNo(result.agentSafeNext?.opensBrowser)}`);
  lines.push(`agent_safe_next_starts_capture: ${yesNo(result.agentSafeNext?.startsCapture)}`);
  lines.push(`agent_safe_next_starts_background: ${yesNo(result.agentSafeNext?.startsBackground)}`);
  lines.push(`agent_safe_next_reads_browser_storage: ${yesNo(result.agentSafeNext?.readsBrowserStorage)}`);
  lines.push(`agent_safe_next_returns_page_content: ${yesNo(result.agentSafeNext?.returnsPageContent)}`);
  lines.push(`agent_safe_next_blocked_reason: ${compactValue(result.agentSafeNext?.blockedReason || 'none')}`);
  if (result.agentSafeNext?.command?.shell) lines.push(`agent_safe_next_command: ${result.agentSafeNext.command.shell}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetHandoffStatusMarkdown(result) {
  const lines = [
    '# Secure Browser Agent Target Handoff Status',
    '',
    `Generated: ${result.generatedAt}`,
    `Target: ${result.target}`,
    `Handoff: ${result.handoffPath}`,
    `Status: ${result.status}`,
    `Real external: ${result.realExternal ? 'yes' : 'no'}`,
    `Safe mode: ${result.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${result.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${result.secretValuesRead ? 'yes' : 'no'}`,
    `Auth-check port: ${result.authCheckPort || 'none'}`,
    '',
    '## Available Commands',
    ''
  ];
  for (const item of result.availableCommands || []) {
    lines.push(`- ${item.id}: ${item.error ? `invalid (${item.error})` : item.commandName}${item.synthesized ? ' [synthesized]' : ''}`);
  }
  if (result.recommendedCommand) {
    lines.push('', '## Recommended Command', '');
    lines.push(`- ID: ${result.recommendedCommand.id}`);
    lines.push(`- Reason: ${result.recommendedCommand.reason}`);
    if (result.recommendedCommand.command?.shell) {
      lines.push('', '```bash', result.recommendedCommand.command.shell, '```');
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetHandoffResumeCompact(result) {
  const lines = [
    `status: ${compactValue(result.status)}`,
    `run: ${yesNo(result.run)}`,
    `target: ${compactValue(result.target)}`,
    `real_external: ${yesNo(result.handoffStatus?.realExternal)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `login_open: ${compactValue(result.loginOpen?.status)}`,
    `wait_auth: ${result.waitAuth?.enabled ? compactValue(result.waitAuth.status) : 'no'}`,
    `wait_auth_attempts: ${result.waitAuth?.attempts?.length || 0}`,
    `auth_check_status: ${compactValue(result.authCheck?.status)}`,
    `auth_check_ok: ${yesNo(result.authCheck?.result?.ok)}`,
    `capture_status: ${compactValue(result.capture?.status)}`,
    `capture_ok: ${yesNo(result.capture?.result?.ok)}`,
    `blockers: ${result.blockers?.length || 0}`
  ];
  if (result.authCheck?.result?.childStatus) lines.push(`auth_child_status: ${compactValue(result.authCheck.result.childStatus)}`);
  if (result.authCheck?.result?.childOk !== null && result.authCheck?.result?.childOk !== undefined) {
    lines.push(`auth_child_ok: ${yesNo(result.authCheck.result.childOk)}`);
  }
  if (result.authCheck?.result?.loginLike !== null && result.authCheck?.result?.loginLike !== undefined) {
    lines.push(`auth_login_like: ${yesNo(result.authCheck.result.loginLike)}`);
  }
  if (result.authCheck?.result?.finalUrl) lines.push(`auth_final_url: ${redactedValue(result.authCheck.result.finalUrl)}`);
  if (result.authCheck?.result?.title) lines.push(`auth_title: ${redactedValue(result.authCheck.result.title)}`);
  if (result.nextAction) {
    lines.push(`next_action: ${compactValue(result.nextAction.id)}`);
    if (result.nextAction.command?.shell) lines.push(`next_command: ${result.nextAction.command.shell}`);
  }
  if (result.waitAuth?.outputPath) lines.push(`wait_auth_status: ${compactValue(result.waitAuth.outputPath)}`);
  if (result.loginOpen?.login?.port) lines.push(`login_open_port: ${compactValue(result.loginOpen.login.port)}`);
  if (result.outputPath) lines.push(`output: ${compactValue(result.outputPath)}`);
  if (result.blockers?.length) lines.push(`detail: ${compactValue(result.blockers[0])}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetHandoffResumeStatusCompact(result) {
  const lines = [
    `status: ${compactValue(result.status)}`,
    `status_only: ${yesNo(result.statusOnly)}`,
    `target: ${compactValue(result.target)}`,
    `real_external: ${yesNo(result.realExternal)}`,
    `safe_mode: ${yesNo(result.safeMode)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(result.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(result.startsCaptureNow)}`,
    `page_content_returned: ${yesNo(result.pageContentReturned)}`,
    `auth_check_port: ${compactValue(result.authCheckPort)}`,
    `latest_auth_ok: ${yesNo(result.latestAuthOk)}`,
    `capture_completed: ${yesNo(result.captureCompleted)}`,
    `waiting_for_login: ${yesNo(result.waitingForLogin)}`,
    `resume_exists: ${yesNo(result.resume.exists)}`,
    `resume_status: ${compactValue(result.resume.status)}`,
    `resume_age_seconds: ${result.resume.ageSeconds ?? 'unknown'}`,
    `wait_auth_exists: ${yesNo(result.waitAuth.exists)}`,
    `wait_auth_status: ${compactValue(result.waitAuth.status)}`,
    `wait_auth_attempts: ${result.waitAuth.attempts}`,
    `auth_watch_exists: ${yesNo(result.authWatch.exists)}`,
    `auth_watch_status: ${compactValue(result.authWatch.status)}`,
    `auth_watch_attempts: ${result.authWatch.attempts}`,
    `auth_check_exists: ${yesNo(result.authCheck.exists)}`,
    `auth_check_status: ${compactValue(result.authCheck.status)}`,
    `saved_secret_values_read: ${yesNo(result.resume.secretValuesRead || result.waitAuth.secretValuesRead || result.authWatch.secretValuesRead || result.authCheck.secretValuesRead)}`,
    `saved_destructive_actions: ${yesNo(result.resume.destructiveActionsIncluded || result.waitAuth.destructiveActionsIncluded || result.authWatch.destructiveActionsIncluded || result.authCheck.destructiveActionsIncluded)}`
  ];
  if (result.recommendedCommand) {
    lines.push(`recommended_command: ${compactValue(result.recommendedCommand.id)}`);
    lines.push(`recommended_opens_browser: ${yesNo(result.recommendedCommand.opensBrowser)}`);
    lines.push(`recommended_starts_capture: ${yesNo(result.recommendedCommand.startsCapture)}`);
    lines.push(`recommended_requires_operator_approval: ${yesNo(result.recommendedCommand.requiresOperatorApproval)}`);
    lines.push(`recommended_may_run_unattended: ${yesNo(result.recommendedCommand.mayRunUnattended)}`);
    lines.push(`recommended_agent_run_command: ${result.recommendedCommand.agentRunCommand?.shell || 'none'}`);
    lines.push(`recommended_operator_approval_command: ${result.recommendedCommand.operatorApprovalCommand?.shell || 'none'}`);
    lines.push(`recommended_watch_plan_command: ${result.recommendedCommand.watchPlanCommand?.shell || 'none'}`);
    lines.push(`recommended_watch_run_command: ${result.recommendedCommand.watchRunCommand?.shell || 'none'}`);
    if (result.recommendedCommand.command?.shell) lines.push(`command: ${result.recommendedCommand.command.shell}`);
  }
  lines.push(`agent_safe_next_command_id: ${compactValue(result.agentSafeNext?.id || 'none')}`);
  lines.push(`agent_safe_next_may_run_unattended: ${yesNo(result.agentSafeNext?.mayRunUnattended)}`);
  lines.push(`agent_safe_next_opens_browser: ${yesNo(result.agentSafeNext?.opensBrowser)}`);
  lines.push(`agent_safe_next_starts_capture: ${yesNo(result.agentSafeNext?.startsCapture)}`);
  lines.push(`agent_safe_next_starts_background: ${yesNo(result.agentSafeNext?.startsBackground)}`);
  lines.push(`agent_safe_next_reads_browser_storage: ${yesNo(result.agentSafeNext?.readsBrowserStorage)}`);
  lines.push(`agent_safe_next_returns_page_content: ${yesNo(result.agentSafeNext?.returnsPageContent)}`);
  lines.push(`agent_safe_next_blocked_reason: ${compactValue(result.agentSafeNext?.blockedReason || 'none')}`);
  if (result.agentSafeNext?.command?.shell) lines.push(`agent_safe_next_command: ${result.agentSafeNext.command.shell}`);
  if (result.capturePlanCommand?.shell) lines.push(`capture_plan_command: ${result.capturePlanCommand.shell}`);
  lines.push(`resume_path: ${result.resume.path}`);
  lines.push(`wait_auth_path: ${result.waitAuth.path}`);
  lines.push(`auth_watch_path: ${result.authWatch.path}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetHandoffResumeWatchCompact(result) {
  const lines = [
    `status: ${compactValue(result.status)}`,
    `run: ${yesNo(result.run)}`,
    `target: ${compactValue(result.target)}`,
    `safe_mode: ${yesNo(result.safeMode)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(result.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(result.startsCaptureNow)}`,
    `operator_ok_required: ${yesNo(result.operatorOkRequired)}`,
    `operator_ok_accepted: ${yesNo(result.operatorOkAccepted)}`,
    `auth_check_port: ${compactValue(result.authCheckPort)}`,
    `auth_check_port_reachable: ${result.authCheckPortReachable === null || result.authCheckPortReachable === undefined ? 'unknown' : yesNo(result.authCheckPortReachable)}`,
    `selected_command: ${compactValue(result.selectedCommand?.id)}`,
    `selected_command_available: ${yesNo(result.selectedCommandAvailable)}`,
    `selected_command_blocked_reason: ${compactValue(result.selectedCommandBlockedReason)}`,
    `selected_requires_operator_approval: ${yesNo(result.selectedRequiresOperatorApproval)}`,
    `selected_may_run_unattended: ${yesNo(result.selectedMayRunUnattended)}`,
    `selected_starts_capture: ${yesNo(result.selectedCommand?.startsCapture)}`,
    `before_status: ${compactValue(result.statusBefore?.status)}`,
    `before_latest_auth_ok: ${yesNo(result.statusBefore?.latestAuthOk)}`,
    `before_capture_completed: ${yesNo(result.statusBefore?.captureCompleted)}`
  ];
  lines.push(`selected_agent_run_command: ${result.selectedAgentRunCommand?.shell || 'none'}`);
  lines.push(`selected_operator_approval_command: ${result.selectedOperatorApprovalCommand?.shell || 'none'}`);
  if (result.selectedCommand?.command?.shell) lines.push(`command: ${result.selectedCommand.command.shell}`);
  if (result.result) {
    lines.push(`result_ok: ${yesNo(result.result.ok)}`);
    lines.push(`result_status: ${result.result.status ?? 'unknown'}`);
    if (result.result.childStatus) lines.push(`child_status: ${compactValue(result.result.childStatus)}`);
    if (result.result.childOk !== null && result.result.childOk !== undefined) lines.push(`child_ok: ${yesNo(result.result.childOk)}`);
    if (result.result.error) lines.push(`error: ${compactValue(result.result.error)}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetHandoffResumeMarkdown(result) {
  const lines = [
    '# Secure Browser Agent Target Handoff Resume',
    '',
    `Generated: ${result.generatedAt}`,
    `Target: ${result.target}`,
    `Handoff: ${result.handoffPath}`,
    `Run mode: ${result.run ? 'yes' : 'no'}`,
    `Status: ${result.status}`,
    `Safe mode: ${result.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${result.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${result.secretValuesRead ? 'yes' : 'no'}`,
    `Login open: ${result.loginOpen?.status || 'no'}`,
    `Wait auth: ${result.waitAuth?.enabled ? `${result.waitAuth.status} (${result.waitAuth.attempts.length} attempt(s))` : 'no'}`,
    `Wait auth status: ${result.waitAuth?.outputPath || 'none'}`
  ];
  if (result.authCheck) {
    lines.push('', '## Auth Check', '');
    lines.push(`- Status: ${result.authCheck.status}`);
    if (result.authCheck.result) {
      lines.push(`- OK: ${result.authCheck.result.ok ? 'yes' : 'no'}`);
      if (result.authCheck.result.childStatus) lines.push(`- Child status: ${result.authCheck.result.childStatus}`);
      if (result.authCheck.result.childOk !== null && result.authCheck.result.childOk !== undefined) {
        lines.push(`- Child OK: ${result.authCheck.result.childOk ? 'yes' : 'no'}`);
      }
    }
  }
  if (result.loginOpen) {
    lines.push('', '## Login Open', '');
    lines.push(`- Status: ${result.loginOpen.status}`);
    if (result.loginOpen.login?.ok !== undefined) lines.push(`- OK: ${result.loginOpen.login.ok ? 'yes' : 'no'}`);
    if (result.loginOpen.login?.port) lines.push(`- CDP port: ${result.loginOpen.login.port}`);
    if (result.loginOpen.handoffPath) lines.push(`- Handoff: ${result.loginOpen.handoffPath}`);
  }
  if (result.capture) {
    lines.push('', '## Capture', '');
    lines.push(`- Status: ${result.capture.status}`);
    if (result.capture.result) lines.push(`- OK: ${result.capture.result.ok ? 'yes' : 'no'}`);
  }
  if (result.blockers?.length) {
    lines.push('', '## Blockers', '');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.nextAction) {
    lines.push('', '## Next Action', '');
    lines.push(`- ID: ${result.nextAction.id}`);
    lines.push(`- Label: ${result.nextAction.label}`);
    if (result.nextAction.command?.shell) {
      lines.push('', '```bash', result.nextAction.command.shell, '```');
    }
  }
  if (result.outputPath) lines.push('', `Written: ${result.outputPath}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetHandoffRunCompact(result) {
  const lines = [
    `status: ${compactValue(result.status)}`,
    `run: ${yesNo(result.run)}`,
    `ready: ${yesNo(result.readyToRun)}`,
    `command_id: ${compactValue(result.commandId)}`,
    `selected: ${compactValue(result.selected?.id)}`,
    `synthesized: ${yesNo(result.selected?.synthesized)}`,
    `available: ${(result.availableCommands || []).map((item) => item.error ? `${item.id}:invalid` : item.id).join(',') || 'none'}`,
    `blockers: ${result.blockers?.length || 0}`
  ];
  if (result.authPreflight) {
    lines.push(`preflight_ok: ${yesNo(result.authPreflight.ok)}`);
    if (result.authPreflight.cdpPort) lines.push(`cdp_port: ${compactValue(result.authPreflight.cdpPort)}`);
    if (result.authPreflight.finalUrl) lines.push(`final_url: ${redactedValue(result.authPreflight.finalUrl)}`);
    lines.push(`login_like: ${yesNo(result.authPreflight.loginLike)}`);
  }
  if (result.result) {
    lines.push(`result_ok: ${yesNo(result.result.ok)}`);
    lines.push(`exit: ${result.result.status ?? 'none'}`);
    if (result.result.childStatus) lines.push(`child_status: ${compactValue(result.result.childStatus)}`);
    if (result.result.childOk !== null && result.result.childOk !== undefined) lines.push(`child_ok: ${yesNo(result.result.childOk)}`);
  }
  if (result.nextAction) {
    lines.push(`next_action: ${compactValue(result.nextAction.id)}`);
    if (result.nextAction.command?.shell) lines.push(`next_command: ${result.nextAction.command.shell}`);
  } else if (!result.run && result.selected?.command?.shell) {
    lines.push(`command: ${result.selected.command.shell}`);
  }
  if (result.outputPath) lines.push(`output: ${compactValue(result.outputPath)}`);
  if (result.blockers?.length) lines.push(`detail: ${compactValue(result.blockers[0])}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetHandoffRunMarkdown(result) {
  const lines = [
    '# Secure Browser Agent Target Handoff Run',
    '',
    `Generated: ${result.generatedAt}`,
    `Target: ${result.target}`,
    `Handoff: ${result.handoffPath}`,
    `Command: ${result.commandId}`,
    `Run mode: ${result.run ? 'yes' : 'no'}`,
    `Ready to run: ${result.readyToRun ? 'yes' : 'no'}`,
    `Status: ${result.status}`,
    `Safe mode: ${result.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${result.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Selected Command',
    '',
    `- ID: ${result.selected.id}`,
    `- Title: ${result.selected.title || 'none'}`,
    `- Synthesized: ${result.selected.synthesized ? 'yes' : 'no'}`,
    '',
    '```bash',
    result.selected.command.shell,
    '```'
  ];
  if (result.availableCommands?.length) {
    lines.push('', '## Available Commands', '');
    for (const item of result.availableCommands) {
      lines.push(`- ${item.id}: ${item.error ? `invalid (${item.error})` : item.commandName}${item.synthesized ? ' [synthesized]' : ''}`);
    }
  }
  if (result.authPreflight) {
    lines.push('', '## Auth Preflight', '');
    lines.push(`- Kind: ${result.authPreflight.kind}`);
    lines.push(`- OK: ${result.authPreflight.ok ? 'yes' : 'no'}`);
    lines.push(`- Target dir: ${result.authPreflight.targetDir}`);
    lines.push(`- CDP port: ${result.authPreflight.cdpPort}`);
    if (result.authPreflight.finalUrl) lines.push(`- Final URL: ${redactedValue(result.authPreflight.finalUrl)}`);
    if (result.authPreflight.title) lines.push(`- Title: ${redactedValue(result.authPreflight.title)}`);
    lines.push(`- Login-like: ${result.authPreflight.loginLike ? 'yes' : 'no'}`);
    if (result.authPreflight.blocker) lines.push(`- Blocker: ${result.authPreflight.blocker}`);
  }
  if (result.blockers?.length) {
    lines.push('', '## Blockers', '');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.nextAction) {
    lines.push('', '## Next Action', '');
    lines.push(`- ID: ${result.nextAction.id}`);
    lines.push(`- Label: ${result.nextAction.label}`);
    if (result.nextAction.command?.shell) {
      lines.push('', '```bash', result.nextAction.command.shell, '```');
    }
  }
  if (result.result) {
    lines.push('', '## Result', '');
    lines.push(`- OK: ${result.result.ok ? 'yes' : 'no'}`);
    lines.push(`- Exit: ${result.result.status}`);
    if (result.result.childStatus) lines.push(`- Child status: ${result.result.childStatus}`);
    if (result.result.childOk !== null && result.result.childOk !== undefined) lines.push(`- Child OK: ${result.result.childOk ? 'yes' : 'no'}`);
    if (result.result.stdoutTail) lines.push(`- Stdout tail: ${redactedTail(result.result.stdoutTail).replaceAll('\n', ' | ')}`);
    if (result.result.stderrTail) lines.push(`- Stderr tail: ${redactedTail(result.result.stderrTail).replaceAll('\n', ' | ')}`);
    if (result.result.error) lines.push(`- Error: ${result.result.error}`);
  }
  if (result.outputPath) lines.push('', `Written: ${result.outputPath}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
