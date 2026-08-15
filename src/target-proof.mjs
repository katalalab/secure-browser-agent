import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { loadPolicy } from './policy.mjs';
import { auditTargetPack } from './security-audit.mjs';
import { buildStartCommandCandidates, compactKey } from './start-commands.mjs';
import { resolveTargetPack } from './target-pack.mjs';
import { toPosixPath } from './output.mjs';

function csv(value, fallback = []) {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function rootRelativeCommandArg(rootDir, value) {
  if (!value) return value;
  const text = String(value);
  if (!path.isAbsolute(text)) return text;
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const resolvedValue = path.resolve(text);
  if (resolvedValue === resolvedRoot || resolvedValue.startsWith(`${resolvedRoot}${path.sep}`)) {
    return toPosixPath(path.relative(resolvedRoot, resolvedValue));
  }
  return text;
}

function commandDisplayShell(rootDir, commandValue) {
  const args = commandValue?.args;
  if (!Array.isArray(args)) return commandValue?.shell || '';
  return command(args.map((arg) => rootRelativeCommandArg(rootDir, arg))).shell;
}

function rootDirFromTargetPackDir(targetDir) {
  const resolved = path.resolve(String(targetDir || ''));
  const marker = `${path.sep}runs${path.sep}target-packs${path.sep}`;
  const index = resolved.lastIndexOf(marker);
  if (index >= 0) return resolved.slice(0, index) || path.sep;
  return process.cwd();
}

function rootRelativePath(rootDir, value) {
  return rootRelativeCommandArg(rootDir, value);
}

function statSummary(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      bytes: stat.size,
      mtime: stat.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      bytes: 0,
      mtime: ''
    };
  }
}

function isPrivateIp(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  const ipVersion = net.isIP(host);
  if (!ipVersion) return false;
  if (ipVersion === 4) {
    if (host.startsWith('127.')) return true;
    if (host === '0.0.0.0') return true;
    if (host.startsWith('10.')) return true;
    if (host.startsWith('192.168.')) return true;
    if (host.startsWith('169.254.')) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
    const match = host.match(/^172\.(\d+)\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  }
  return host === '::'
    || host === '::1'
    || host.startsWith('fe80:')
    || host.startsWith('fc')
    || host.startsWith('fd');
}

export function isRealExternalOrigin(origin) {
  if (!origin || origin === 'data:') return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
  if (hostname === 'example.com' || hostname.endsWith('.example')) return false;
  if (hostname.endsWith('.test') || hostname.endsWith('.invalid')) return false;
  if (isPrivateIp(hostname)) return false;
  return true;
}

function summarizeJson(value) {
  if (!value || typeof value !== 'object') return { type: typeof value };
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  return {
    type: 'object',
    keys: Object.keys(value).sort(),
    stepCount: Array.isArray(value.steps) ? value.steps.length : 0,
    pageCount: Array.isArray(value.pages) ? value.pages.length : 0
  };
}

function summarizeCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0] || '';
  return {
    type: 'csv',
    rows: Math.max(0, lines.length - 1),
    columns: header ? header.replace(/^\uFEFF/, '').split(',').length : 0
  };
}

function summarizeOutput(filePath) {
  const stat = statSummary(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = {
    path: filePath,
    relativePath: path.basename(filePath),
    ...stat
  };
  if (!stat.exists || stat.bytes === 0) return { ...base, shape: {} };
  if (ext === '.json') {
    return {
      ...base,
      shape: summarizeJson(readJson(filePath))
    };
  }
  if (ext === '.csv') {
    return {
      ...base,
      shape: summarizeCsv(fs.readFileSync(filePath, 'utf8'))
    };
  }
  return {
    ...base,
    shape: { type: ext.replace(/^\./, '') || 'file' }
  };
}

function defaultBenchmarkCandidates(packDir) {
  return [
    path.join(packDir, 'proof', 'target-benchmark.json'),
    path.join(packDir, 'outputs', 'target-benchmark.json'),
    path.join(packDir, 'outputs', 'benchmark.json')
  ];
}

function defaultAuthCheckCandidates(packDir) {
  return [
    path.join(packDir, 'proof', 'auth-check.json'),
    path.join(packDir, 'outputs', 'auth-check.json')
  ];
}

function summarizeBenchmark(filePath) {
  const stat = statSummary(filePath);
  if (!stat.exists || stat.bytes === 0) {
    return {
      path: filePath || '',
      ...stat,
      ok: false,
      fastestMode: '',
      fastestRecipe: '',
      resultCount: 0
    };
  }
  const parsed = readJson(filePath);
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  return {
    path: filePath,
    ...stat,
    ok: Boolean(parsed?.preflight?.ok) && results.some((item) => item.ok),
    preflightOk: Boolean(parsed?.preflight?.ok),
    fastestMode: parsed?.recommendation?.fastestMode || '',
    fastestRecipe: parsed?.recommendation?.fastestRecipe || '',
    resultCount: results.length,
    okResults: results.filter((item) => item.ok).length
  };
}

function summarizeAuthCheck(filePath) {
  const stat = statSummary(filePath);
  if (!stat.exists || stat.bytes === 0) {
    return {
      path: filePath || '',
      ...stat,
      ok: false,
      finalUrl: '',
      loginLike: null,
      sameOrigin: null
    };
  }
  const parsed = readJson(filePath);
  return {
    path: filePath,
    ...stat,
    ok: Boolean(parsed?.ok),
    finalUrl: parsed?.finalUrl || '',
    loginLike: parsed?.loginLike ?? null,
    sameOrigin: parsed?.sameOrigin ?? null
  };
}

function resolveBenchmarkFile(packDir, options = {}) {
  if (options.benchmarkFile) return path.resolve(options.benchmarkFile);
  return defaultBenchmarkCandidates(packDir).find((candidate) => fs.existsSync(candidate)) || '';
}

function resolveAuthCheckFile(packDir, options = {}) {
  if (options.authCheckFile) return path.resolve(options.authCheckFile);
  if (options['auth-check-file']) return path.resolve(options['auth-check-file']);
  return defaultAuthCheckCandidates(packDir).find((candidate) => fs.existsSync(candidate)) || path.join(packDir, 'proof', 'auth-check.json');
}

function summarizeOperatorHandoff(policy, handoffName = 'operator-handoff.json') {
  const handoffPath = path.join(policy.outputDir, handoffName);
  const handoff = readJson(handoffPath);
  const commandItem = (handoff?.handoff?.commands || []).find((item) => item.id === 'post-login-capture');
  const args = Array.isArray(commandItem?.args) ? commandItem.args : [];
  const authCheckPortIndex = args.indexOf('--auth-check-port');
  const authCheckPort = authCheckPortIndex >= 0 ? args[authCheckPortIndex + 1] || '' : '';
  return {
    exists: Boolean(handoff && commandItem),
    path: handoffPath,
    commandId: commandItem?.id || '',
    hasStructuredArgs: Array.isArray(commandItem?.args),
    hasAuthCheckPort: Boolean(authCheckPort),
    authCheckPort
  };
}

function relativePackPath(packDir, filePath, fallback) {
  if (!filePath) return fallback;
  const relative = path.relative(packDir, filePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return toPosixPath(relative);
  return fallback;
}

function buildTargetMissingArtifacts(plan) {
  const artifacts = [];
  const add = (id, kind, detail, extra = {}) => {
    artifacts.push({
      id,
      kind,
      detail,
      ...extra
    });
  };

  if (!plan.realExternal) {
    add('real-external-assertion', 'assertion', 'operator has not asserted this is an approved real external target');
  }
  if (plan.externalOrigins.length === 0) {
    add('external-origin', 'target-pack', 'target pack has no accepted real external origin');
  }
  if (!plan.currentState.auditOk) {
    add('target-audit', 'audit', 'target audit is not clean');
  }
  if (!plan.currentState.profileLikelyAuthenticated) {
    add('authenticated-profile', 'profile', 'dedicated profile does not have local auth-state artifacts');
  }
  if (!plan.currentState.authCheck.ok) {
    add('auth-check', 'proof', 'auth-check proof is missing or still login-like', {
      path: relativePackPath(plan.dir, plan.currentState.authCheck.path, 'proof/auth-check.json')
    });
  }
  for (const outputName of plan.currentState.missingOutputs) {
    add(`output:${outputName}`, 'output', 'required output file is missing or empty', {
      path: outputName
    });
  }
  if (!plan.currentState.benchmark.ok) {
    add('benchmark', 'proof', 'target benchmark proof is missing or has no successful run', {
      path: relativePackPath(plan.dir, plan.currentState.benchmark.path, 'proof/target-benchmark.json')
    });
  }
  add('target-proof', 'proof', plan.currentState.proofReady
    ? 'accepted target proof has not been written yet'
    : 'accepted target proof is blocked until missing gates are satisfied', {
    path: 'proof/target-proof.json',
    blocked: !plan.currentState.proofReady
  });
  return artifacts;
}

function check(level, name, ok, detail = '') {
  return { level: ok ? 'pass' : level, name, ok, detail };
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

function commandFor(plan, id) {
  return plan.commands.find((item) => item.id === id)?.command || null;
}

function commandName(commandValue = {}) {
  const args = Array.isArray(commandValue?.args) ? commandValue.args : [];
  return args[2] || '';
}

function commandHas(commandValue = {}, value) {
  const args = Array.isArray(commandValue?.args) ? commandValue.args : [];
  return args.includes(value);
}

function commandOpensBrowser(commandValue = {}) {
  const name = commandName(commandValue);
  if (name === 'target-login' || name === 'target-login-capture') return true;
  if (name === 'target-handoff-resume' && commandHas(commandValue, '--open-login')) return true;
  if (name === 'target-daemon' && commandHas(commandValue, 'start')) return true;
  return false;
}

function commandStartsCapture(commandValue = {}) {
  const name = commandName(commandValue);
  return name === 'target-login-capture'
    || name === 'target-proof-capture'
    || name === 'target-handoff-run'
    || name === 'target-handoff-resume'
    || name === 'target-run'
    || name === 'target-scrape'
    || name === 'target-benchmark';
}

function commandStartsBackground(commandValue = {}) {
  return commandName(commandValue) === 'target-daemon' && commandHas(commandValue, 'start');
}

function commandRequiresOperatorApproval(commandValue = {}) {
  if (!commandValue) return false;
  return commandOpensBrowser(commandValue)
    || commandStartsCapture(commandValue)
    || commandStartsBackground(commandValue)
    || commandHas(commandValue, '--run')
    || commandName(commandValue) === 'target-permissions';
}

function commandSafety(commandValue = null) {
  const requiresOperatorApproval = commandRequiresOperatorApproval(commandValue);
  return {
    opensBrowser: commandOpensBrowser(commandValue),
    startsCapture: commandStartsCapture(commandValue),
    startsBackground: commandStartsBackground(commandValue),
    requiresOperatorApproval,
    agentMayRunUnattended: Boolean(commandValue && !requiresOperatorApproval)
  };
}

function targetProofPlanSafeNext(plan, action = null, safety = null) {
  const nextAction = action || plan.nextAction || nextTargetProofAction(plan);
  const nextSafety = safety || plan.nextCommandSafety || commandSafety(nextAction.command || null);
  return targetProofSafeNext({
    targetName: plan.target || path.basename(plan.dir),
    action: nextAction,
    safety: nextSafety
  });
}

function targetProofSafeNext({ targetName = '', action = null, safety = null, complete = false } = {}) {
  if (complete) {
    return {
      id: 'none',
      command: null,
      mayRunUnattended: false,
      opensBrowser: false,
      startsCapture: false,
      startsBackground: false,
      readsBrowserStorage: false,
      returnsPageContent: false,
      blockedReason: 'complete'
    };
  }
  const nextAction = action || {};
  const nextSafety = safety || commandSafety(nextAction.command || null);
  if (nextSafety.agentMayRunUnattended && nextAction.command) {
    return {
      id: nextAction.id || 'next-command',
      command: nextAction.command,
      mayRunUnattended: true,
      opensBrowser: nextSafety.opensBrowser,
      startsCapture: nextSafety.startsCapture,
      startsBackground: nextSafety.startsBackground,
      readsBrowserStorage: false,
      returnsPageContent: false,
      blockedReason: 'none'
    };
  }
  if (!targetName) {
    return {
      id: 'target-candidate-plan',
      command: command(['node', 'src/cli.mjs', 'target-candidate-plan', '--format', 'compact']),
      mayRunUnattended: true,
      opensBrowser: false,
      startsCapture: false,
      startsBackground: false,
      readsBrowserStorage: false,
      returnsPageContent: false,
      blockedReason: nextAction.command ? 'operator-approval-required' : 'target-not-selected'
    };
  }
  return {
    id: 'target-approval-preflight',
    command: command(['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', targetName, '--real-external', '--format', 'compact']),
    mayRunUnattended: true,
    opensBrowser: false,
    startsCapture: false,
    startsBackground: false,
    readsBrowserStorage: false,
    returnsPageContent: false,
    blockedReason: nextAction.command ? 'operator-approval-required' : 'next-command-unavailable'
  };
}

function authUsable({ profileLikelyAuthenticated, authCheckOk, loginLike }) {
  return Boolean(profileLikelyAuthenticated && authCheckOk && !loginLike);
}

function authState({ profileLikelyAuthenticated, authCheckOk, loginLike, authCheckExists }) {
  if (profileLikelyAuthenticated && authCheckOk && !loginLike) return 'usable';
  if (profileLikelyAuthenticated && loginLike) return 'metadata-only-login-like';
  if (profileLikelyAuthenticated && authCheckExists && !authCheckOk) return 'metadata-only-auth-check-failed';
  if (profileLikelyAuthenticated) return 'metadata-only-unchecked';
  if (loginLike) return 'login-like';
  if (authCheckExists && !authCheckOk) return 'auth-check-failed';
  return 'unchecked';
}

function nextTargetProofAction(plan) {
  if (plan.currentState.proofReady) {
    return {
      id: 'write-proof',
      label: 'Write accepted target proof',
      command: commandFor(plan, 'write-proof')
    };
  }
  if (!plan.realExternal) {
    return {
      id: 'assert-real-external',
      label: 'Re-run inventory or plan with --real-external only for an operator-approved real service target',
      command: null
    };
  }
  if (plan.externalOrigins.length === 0) {
    return {
      id: 'create-real-target-pack',
      label: 'Create or select a target pack with a real external origin; example.com, local, test, and private origins are not accepted',
      command: null
    };
  }
  if (!plan.currentState.auditOk) {
    return {
      id: 'audit',
      label: 'Fix target audit findings before login or scraping',
      command: commandFor(plan, 'audit-before-login')
    };
  }
  if (plan.currentState.authCheck.exists && !plan.currentState.authCheck.ok && plan.currentState.authCheck.loginLike) {
    return {
      id: plan.currentState.operatorHandoff.exists ? 'handoff-resume' : 'login-capture',
      label: plan.currentState.operatorHandoff.exists
        ? 'Auth-check still sees login; continue through the auth-first handoff resume lane'
        : 'Auth-check says the target page is still a login screen; open the dedicated profile, complete login, then capture proof',
      command: commandFor(plan, plan.currentState.operatorHandoff.exists ? 'handoff-resume' : 'login-capture')
    };
  }
  if (!plan.currentState.profileLikelyAuthenticated) {
    return {
      id: 'login-capture',
      label: 'Open the dedicated profile, complete operator-owned login, then capture proof',
      command: commandFor(plan, 'login-capture')
    };
  }
  if (plan.currentState.permissionsPending > 0) {
    return {
      id: 'permissions',
      label: 'Apply pack-scoped Chrome permissions',
      command: commandFor(plan, 'permissions')
    };
  }
  if (!plan.currentState.authCheck.ok && plan.currentState.operatorHandoff.exists) {
    return {
      id: 'handoff-resume',
      label: 'Run the auth-first handoff resume lane; capture starts only after auth-check passes',
      command: commandFor(plan, 'handoff-resume')
    };
  }
  if (!plan.currentState.authCheck.ok || plan.currentState.missingOutputs.length || !plan.currentState.benchmark.ok) {
    return {
      id: plan.currentState.operatorHandoff.exists ? 'handoff-capture' : 'capture',
      label: plan.currentState.operatorHandoff.exists
        ? 'Run the saved post-login handoff capture for auth-check, observe, inspect, scrape, benchmark, and proof'
        : 'Run the post-login capture sequence for auth-check, observe, inspect, scrape, benchmark, and proof',
      command: plan.currentState.operatorHandoff.exists
        ? commandFor(plan, 'handoff-capture')
        : command([
          'node',
          'src/cli.mjs',
          'target-proof-capture',
          plan.dir,
          '--real-external',
          '--run',
          '--completion-audit',
          '--format',
          'markdown'
        ])
    };
  }
  return {
    id: 'review-blockers',
    label: 'Review blockers in target proof plan',
    command: commandFor(plan, 'audit-before-login')
  };
}

function deriveTargetProofGuidance(target, action = {}) {
  const missingArtifacts = Array.isArray(target?.missingArtifacts) ? target.missingArtifacts : [];
  const missingArtifactIds = new Set(missingArtifacts.map((item) => item.id));
  const actionId = action.id || '';

  if (actionId === 'complete') {
    return {
      humanAction: 'none',
      automationBlocker: 'none',
      captureBlocked: false
    };
  }
  if (actionId === 'write-proof') {
    return {
      humanAction: 'write-target-proof',
      automationBlocker: 'none',
      captureBlocked: false
    };
  }
  if (actionId === 'handoff-resume') {
    return {
      humanAction: target?.operatorHandoff?.hasAuthCheckPort
        ? 'complete-login-in-open-dedicated-browser'
        : 'run-handoff-resume-to-open-login',
      automationBlocker: 'auth-check-not-ok',
      captureBlocked: true
    };
  }
  if (actionId === 'login-capture') {
    return {
      humanAction: 'run-login-capture-wait',
      automationBlocker: target?.profileLikelyAuthenticated ? 'auth-check-not-ok' : 'operator-login-required',
      captureBlocked: true
    };
  }
  if (actionId === 'permissions') {
    return {
      humanAction: 'apply-target-permissions',
      automationBlocker: 'target-permissions-pending',
      captureBlocked: true
    };
  }
  if (actionId === 'capture' || actionId === 'handoff-capture') {
    return {
      humanAction: actionId === 'handoff-capture' ? 'run-saved-post-login-capture' : 'run-post-login-capture',
      automationBlocker: missingArtifactIds.has('auth-check') ? 'auth-check-missing' : 'missing-proof-artifacts',
      captureBlocked: false
    };
  }
  if (actionId === 'audit') {
    return {
      humanAction: 'fix-target-audit',
      automationBlocker: 'target-audit-not-clean',
      captureBlocked: true
    };
  }
  if (actionId === 'assert-real-external' || actionId === 'create-real-target-pack') {
    return {
      humanAction: actionId,
      automationBlocker: 'real-external-target-not-ready',
      captureBlocked: true
    };
  }
  return {
    humanAction: actionId || 'review-target-proof-plan',
    automationBlocker: missingArtifacts.length ? 'missing-proof-artifacts' : 'unknown',
    captureBlocked: missingArtifacts.length > 0
  };
}

export async function buildTargetProofPlan(targetDir, options = {}) {
  const pack = resolveTargetPack(targetDir);
  const policy = loadPolicy(pack.policy);
  const audit = options.audit || await auditTargetPack(pack.dir, options);
  const outputNames = csv(options.outputs, ['observe.json', 'inspect.json', 'scrape.csv']);
  const benchmarkFile = options.benchmarkFile
    ? path.resolve(options.benchmarkFile)
    : path.join(pack.dir, 'proof', 'target-benchmark.json');
  const authCheckFile = resolveAuthCheckFile(pack.dir, options);
  const origins = pack.metadata.origins || pack.targetPolicy.allowedOrigins || [];
  const externalOrigins = origins.filter(isRealExternalOrigin);
  const profile = audit.profile?.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || '';
  const needsLogin = !audit.profile?.likelyAuthenticated;
  const permissionsPending = Number(audit.permissions?.pending || 0);
  const outputStatus = outputNames.map((name) => summarizeOutput(path.join(policy.outputDir, name)));
  const missingOutputs = outputStatus
    .filter((item) => !item.exists || item.bytes <= 0)
    .map((item) => item.relativePath);
  const benchmark = summarizeBenchmark(benchmarkFile);
  const benchmarkRelative = toPosixPath(path.relative(pack.dir, benchmarkFile));
  const benchmarkOut = benchmarkRelative && !benchmarkRelative.startsWith('..') && !path.isAbsolute(benchmarkRelative)
    ? benchmarkRelative
    : path.join('proof', 'target-benchmark.json');
  const authCheck = summarizeAuthCheck(authCheckFile);
  const operatorHandoff = summarizeOperatorHandoff(policy);
  const realExternal = Boolean(options.realExternal || options['real-external']);
  const blockers = [
    !realExternal ? 'Run this plan with --real-external only for an operator-approved real external target.' : '',
    !audit.ok ? 'Target audit is not clean.' : '',
    externalOrigins.length === 0 ? 'Target pack has no real external origin.' : '',
    needsLogin ? 'Dedicated profile does not yet look authenticated.' : '',
    !authCheck.ok ? 'Target auth-check proof file is not present or says the page still looks logged out.' : '',
    missingOutputs.length ? `Required output files are missing or empty: ${missingOutputs.join(', ')}` : '',
    !benchmark.ok ? 'Target benchmark proof file is not present yet.' : ''
  ].filter(Boolean);

  const commands = [
    {
      id: 'doctor',
      title: 'Validate target pack configuration',
      status: 'ready',
      writes: false,
      command: command(['node', 'src/cli.mjs', 'target-doctor', pack.dir])
    },
    {
      id: 'audit-before-login',
      title: 'Audit current target state before login or scraping',
      status: 'ready',
      writes: false,
      command: command(['node', 'src/cli.mjs', 'target-audit', pack.dir])
    },
    {
      id: 'login',
      title: 'Open the dedicated headed Chrome profile and complete login manually',
      status: needsLogin ? 'manual-required' : 'already-satisfied',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-login', pack.dir, ...(realExternal ? ['--real-external'] : [])])
    },
    {
      id: 'login-capture',
      title: 'Open login browser, wait for auth-check, and capture proof',
      status: needsLogin || !authCheck.ok ? 'manual-required' : 'already-satisfied',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-login-capture', pack.dir, ...(realExternal ? ['--real-external'] : []), '--handoff-out', 'operator-handoff.json', '--wait-auth-status-out', 'wait-auth-status.json', ...(realExternal ? ['--completion-audit'] : []), '--format', 'markdown'])
    },
    {
      id: 'handoff-capture',
      title: 'Run the saved post-login handoff capture command',
      status: operatorHandoff.exists ? 'ready' : 'unavailable',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-handoff-run', pack.dir, '--handoff', 'operator-handoff.json', '--command', 'post-login-capture', '--run', '--out', 'handoff-run-latest.json', '--format', 'markdown'])
    },
    {
      id: 'handoff-resume',
      title: 'Check auth first, wait if needed, then run the saved handoff capture command',
      status: operatorHandoff.exists ? 'ready' : 'unavailable',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-handoff-resume', pack.dir, '--handoff', 'operator-handoff.json', '--run', '--open-login', '--wait-auth', '--wait-auth-status-out', 'handoff-resume-wait-auth-status.json', '--out', 'handoff-resume-latest.json', '--format', 'compact'])
    },
    {
      id: 'permissions',
      title: 'Apply pack-scoped Chrome permissions after the login browser is closed',
      status: permissionsPending > 0 ? 'ready' : 'already-satisfied',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-permissions', pack.dir, 'apply'])
    },
    {
      id: 'start-daemon',
      title: 'Start reusable background Chrome/CDP for the target profile',
      status: audit.daemon?.ok ? 'already-satisfied' : 'ready',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-daemon', pack.dir, 'start'])
    },
    {
      id: 'auth-check',
      title: 'Verify the target page is not still a login screen',
      status: authCheck.ok ? 'already-satisfied' : 'ready',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-auth-check', pack.dir, '--write', '--daemon', '--strict', '--format', 'json'])
    },
    {
      id: 'observe',
      title: 'Capture compact page structure',
      status: outputStatus.find((item) => item.relativePath === 'observe.json')?.exists ? 'already-satisfied' : 'ready',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-run', pack.dir, 'observe', '--daemon'])
    },
    {
      id: 'inspect',
      title: 'Capture scraping candidates and structural hints',
      status: outputStatus.find((item) => item.relativePath === 'inspect.json')?.exists ? 'already-satisfied' : 'ready',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-run', pack.dir, 'inspect', '--daemon'])
    },
    {
      id: 'scrape',
      title: 'Write the default CSV scrape output',
      status: outputStatus.find((item) => item.relativePath === 'scrape.csv')?.exists ? 'already-satisfied' : 'ready',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-scrape', pack.dir, '--daemon'])
    },
    {
      id: 'benchmark',
      title: 'Benchmark cold target execution versus daemon reuse',
      status: benchmark.ok ? 'already-satisfied' : 'ready',
      writes: true,
      command: command(['node', 'src/cli.mjs', 'target-benchmark', pack.dir, '--write', '--out', benchmarkOut, '--format', 'json'])
    },
    {
      id: 'write-proof',
      title: 'Write the secret-free accepted target proof',
      status: blockers.length === 0 ? 'ready' : 'manual-required',
      writes: true,
      command: command([
        'node',
        'src/cli.mjs',
        'target-proof',
        pack.dir,
        '--real-external',
        '--write',
        '--benchmark-file',
        benchmarkFile,
        '--auth-check-file',
        authCheckFile,
        '--outputs',
        outputNames.join(',')
      ])
    },
    {
      id: 'readiness',
      title: 'Confirm readiness now accepts the real external proof',
      status: 'ready',
      writes: false,
      command: command(['node', 'src/cli.mjs', 'readiness-audit', '--format', 'markdown'])
    }
  ].map((item) => ({
    ...item,
    safety: commandSafety(item.command || null)
  }));

  const plan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rootDir: rootDirFromTargetPackDir(pack.dir),
    target: pack.metadata.target || pack.targetPolicy.defaultProfile || path.basename(pack.dir),
    dir: pack.dir,
    policy: pack.policy,
    profile,
    realExternal,
    origins,
    externalOrigins,
    safeMode: true,
    destructiveActionsIncluded: false,
    currentState: {
      auditOk: Boolean(audit.ok),
      profileLikelyAuthenticated: Boolean(audit.profile?.likelyAuthenticated),
      permissionsPending,
      daemonRunning: Boolean(audit.daemon?.ok),
      outputDir: policy.outputDir,
      missingOutputs,
      outputs: outputStatus,
      authCheck,
      operatorHandoff,
      benchmark,
      proofReady: blockers.length === 0
    },
    blockers,
    commands
  };
  plan.currentState.missingArtifacts = buildTargetMissingArtifacts(plan);
  plan.currentState.authUsable = authUsable({
    profileLikelyAuthenticated: plan.currentState.profileLikelyAuthenticated,
    authCheckOk: plan.currentState.authCheck.ok,
    loginLike: plan.currentState.authCheck.loginLike === true
  });
  plan.currentState.authState = authState({
    profileLikelyAuthenticated: plan.currentState.profileLikelyAuthenticated,
    authCheckOk: plan.currentState.authCheck.ok,
    loginLike: plan.currentState.authCheck.loginLike === true,
    authCheckExists: plan.currentState.authCheck.exists
  });
  plan.currentState.profileAuthMetadataOnly = Boolean(plan.currentState.profileLikelyAuthenticated && !plan.currentState.authUsable);
  plan.nextAction = nextTargetProofAction(plan);
  plan.nextCommandSafety = commandSafety(plan.nextAction.command || null);
  plan.agentSafeNext = targetProofPlanSafeNext(plan, plan.nextAction, plan.nextCommandSafety);
  if (['github', 'google-drive', 'notion'].includes(plan.target)) {
    plan.operatorApprovalPlanCommand = command(['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', plan.target, '--real-external', '--format', 'compact']);
    plan.operatorApprovalCommand = command(['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', plan.target, '--real-external', '--run', '--operator-ok', 'OK', '--format', 'compact']);
  }
  plan.objectiveCompletionStrictCommand = command(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']);
  return plan;
}

export async function buildTargetProof(targetDir, options = {}) {
  const pack = resolveTargetPack(targetDir);
  const policy = loadPolicy(pack.policy);
  const audit = options.audit || await auditTargetPack(pack.dir, options);
  const outputNames = csv(options.outputs, ['observe.json', 'inspect.json', 'scrape.csv']);
  const outputs = outputNames.map((name) => summarizeOutput(path.join(policy.outputDir, name)));
  const authCheckFile = resolveAuthCheckFile(pack.dir, options);
  const authCheck = summarizeAuthCheck(authCheckFile);
  const benchmarkFile = resolveBenchmarkFile(pack.dir, options);
  const benchmark = summarizeBenchmark(benchmarkFile);
  const origins = pack.metadata.origins || pack.targetPolicy.allowedOrigins || [];
  const realExternal = Boolean(options.realExternal || options['real-external']);
  const externalOrigins = origins.filter(isRealExternalOrigin);
  const profileLikelyAuthenticated = Boolean(audit.profile?.likelyAuthenticated);
  const allOutputsPresent = outputs.every((item) => item.exists && item.bytes > 0);
  const requireBenchmark = Boolean(options.requireBenchmark || options['require-benchmark'] || realExternal);

  const checks = [
    check('error', 'target.audit.ok', Boolean(audit.ok), audit.ok ? 'target audit passed' : 'target audit failed'),
    check('error', 'profile.likelyAuthenticated', profileLikelyAuthenticated, profileLikelyAuthenticated ? audit.profile.profile : 'profile has no local auth artifacts'),
    check(realExternal ? 'error' : 'warn', 'target.realExternalAssertion', realExternal, realExternal ? 'operator asserted real external target' : 'pass --real-external after operator-owned real service login'),
    check(realExternal ? 'error' : 'warn', 'target.externalOrigins', externalOrigins.length > 0, externalOrigins.join(',') || 'no non-local/non-example origin'),
    check(realExternal ? 'error' : 'warn', 'authCheck.ok', Boolean(authCheck.ok), authCheck.ok ? authCheck.finalUrl : 'target auth-check JSON missing or login-like'),
    check('error', 'outputs.present', allOutputsPresent, outputs.map((item) => `${path.basename(item.path)}=${item.exists ? item.bytes : 'missing'}`).join(', ')),
    check(requireBenchmark ? 'error' : 'warn', 'benchmark.present', Boolean(benchmark.ok), benchmark.ok ? `${benchmark.fastestMode}/${benchmark.fastestRecipe}` : 'target benchmark JSON not found or has no successful result')
  ];

  const proof = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: pack.metadata.target || pack.targetPolicy.defaultProfile || path.basename(pack.dir),
    dir: pack.dir,
    policy: pack.policy,
    profile: audit.profile?.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || '',
    realExternal,
    origins,
    externalOrigins,
    profileLikelyAuthenticated,
    audit: {
      ok: audit.ok,
      checks: (audit.checks || []).map((item) => ({
        level: item.level,
        name: item.name,
        ok: item.ok,
        detail: item.detail
      })),
      permissionPending: audit.permissions?.pending ?? null,
      daemonRunning: Boolean(audit.daemon?.ok),
      autostartLoaded: Boolean(audit.autostart?.loaded),
      secretFindings: audit.secrets?.findings?.length || 0
    },
    outputs,
    authCheck,
    benchmark,
    checks
  };
  proof.ok = checks.every((item) => item.ok || item.level !== 'error');

  if (options.write) {
    const proofPath = path.join(pack.dir, 'proof', 'target-proof.json');
    writeJson(proofPath, proof);
    proof.proofPath = toPosixPath(path.relative(pack.dir, proofPath));
  }

  return proof;
}

export function findTargetProofs(rootDir = process.cwd()) {
  const targetPacksDir = path.join(rootDir, 'runs', 'target-packs');
  if (!fs.existsSync(targetPacksDir)) return [];
  return fs.readdirSync(targetPacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(targetPacksDir, entry.name, 'proof', 'target-proof.json'))
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({
      path: candidate,
      proof: readJson(candidate)
    }))
    .filter((item) => item.proof);
}

export function isAcceptedExternalProof(proof) {
  if (!proof || typeof proof !== 'object') return false;
  const outputs = Array.isArray(proof.outputs) ? proof.outputs : [];
  const checks = Array.isArray(proof.checks) ? proof.checks : [];
  return proof.ok === true
    && proof.realExternal === true
    && Array.isArray(proof.externalOrigins)
    && proof.externalOrigins.length > 0
    && proof.profileLikelyAuthenticated === true
    && proof.audit?.ok === true
    && proof.authCheck?.ok === true
    && proof.authCheck?.loginLike === false
    && proof.benchmark?.ok === true
    && outputs.length > 0
    && outputs.every((item) => item?.exists === true && Number(item?.bytes || 0) > 0)
    && checks.length > 0
    && checks.every((item) => item?.ok === true || item?.level !== 'error');
}

function listTargetPackDirs(rootDir) {
  const targetPacksDir = path.join(rootDir, 'runs', 'target-packs');
  if (!fs.existsSync(targetPacksDir)) return [];
  return fs.readdirSync(targetPacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(targetPacksDir, entry.name))
    .sort();
}

export async function buildTargetProofInventory(rootDir = process.cwd(), options = {}) {
  const realExternal = Boolean(options.realExternal || options['real-external']);
  const targets = [];
  for (const dir of listTargetPackDirs(rootDir)) {
    try {
      const plan = await buildTargetProofPlan(dir, {
        ...options,
        realExternal
      });
      const nextAction = plan.nextAction || nextTargetProofAction(plan);
      const target = {
        target: plan.target,
        dir: plan.dir,
        profile: plan.profile,
        externalOrigins: plan.externalOrigins,
        profileLikelyAuthenticated: plan.currentState.profileLikelyAuthenticated,
        authCheckOk: plan.currentState.authCheck.ok,
        authState: plan.currentState.authState,
        authUsable: plan.currentState.authUsable,
        profileAuthMetadataOnly: plan.currentState.profileAuthMetadataOnly,
        auditOk: plan.currentState.auditOk,
        benchmarkOk: plan.currentState.benchmark.ok,
        missingOutputs: plan.currentState.missingOutputs,
        missingArtifacts: plan.currentState.missingArtifacts,
        proofReady: plan.currentState.proofReady,
        operatorHandoff: plan.currentState.operatorHandoff,
        nextAction,
        nextCommandSafety: plan.nextCommandSafety || commandSafety(nextAction.command || null),
        blockers: plan.blockers
      };
      target.operatorGuidance = deriveTargetProofGuidance(target, nextAction);
      target.agentSafeNext = targetProofSafeNext({
        targetName: target.target,
        action: target.nextAction,
        safety: target.nextCommandSafety
      });
      targets.push(target);
    } catch (error) {
      const target = {
        target: path.basename(dir),
        dir,
        profile: '',
        externalOrigins: [],
        profileLikelyAuthenticated: false,
        authState: 'unchecked',
        authUsable: false,
        profileAuthMetadataOnly: false,
        auditOk: false,
        benchmarkOk: false,
        missingOutputs: [],
        missingArtifacts: [{
          id: 'target-pack',
          kind: 'target-pack',
          detail: error?.message || String(error)
        }],
        proofReady: false,
        nextAction: {
          id: 'fix-target-pack',
          label: 'Fix target pack so it can be audited',
          command: null
        },
        nextCommandSafety: commandSafety(null),
        blockers: [error?.message || String(error)]
      };
      target.operatorGuidance = deriveTargetProofGuidance(target, target.nextAction);
      target.agentSafeNext = targetProofSafeNext({
        targetName: target.target,
        action: target.nextAction,
        safety: target.nextCommandSafety
      });
      targets.push(target);
    }
  }
  const proofs = findTargetProofs(rootDir);
  const acceptedExternalProofs = proofs.filter((item) => isAcceptedExternalProof(item.proof));
  const complete = acceptedExternalProofs.length > 0;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rootDir,
    realExternal,
    safeMode: true,
    destructiveActionsIncluded: false,
    complete,
    summary: {
      targetPacks: targets.length,
      proofReady: targets.filter((item) => item.proofReady).length,
      withExternalOrigins: targets.filter((item) => item.externalOrigins.length > 0).length,
      likelyAuthenticated: targets.filter((item) => item.profileLikelyAuthenticated).length,
      authCheckOk: targets.filter((item) => item.authCheckOk).length,
      authUsable: targets.filter((item) => item.authUsable).length,
      targetProofs: proofs.length,
      acceptedExternalProofs: acceptedExternalProofs.length
    },
    acceptedExternalProofs: acceptedExternalProofs.map((item) => ({
      target: item.proof.target || path.basename(path.dirname(path.dirname(item.path))),
      path: item.path
    })),
    targets
  };
}

function targetProofNextRank(target) {
  if (target.proofReady) return 10;
  if (target.externalOrigins.length > 0 && target.profileLikelyAuthenticated) return 20;
  if (target.externalOrigins.length > 0) return 30;
  if (target.auditOk) return 40;
  return 50;
}

export async function buildTargetProofNext(rootDir = process.cwd(), options = {}) {
  const inventory = await buildTargetProofInventory(rootDir, options);
  if (inventory.complete) {
    return {
      schemaVersion: 1,
      generatedAt: inventory.generatedAt,
      rootDir,
      realExternal: inventory.realExternal,
      safeMode: true,
      destructiveActionsIncluded: false,
      complete: true,
      summary: inventory.summary,
      acceptedExternalProofs: inventory.acceptedExternalProofs,
      startCommandCandidates: [],
      target: null,
      nextAction: {
        id: 'complete',
        label: 'Accepted real external target proof already exists',
        command: null
      },
      nextCommandSafety: commandSafety(null),
      agentSafeNext: targetProofSafeNext({ complete: true })
    };
  }

  const realExternalTargets = inventory.targets.filter((target) => target.externalOrigins.length > 0);
  const candidates = realExternalTargets.length > 0 ? realExternalTargets : inventory.targets;
  const target = candidates
    .filter((item) => item.nextAction)
    .sort((left, right) => targetProofNextRank(left) - targetProofNextRank(right) || left.target.localeCompare(right.target))[0] || null;

  if (!target) {
    return {
      schemaVersion: 1,
      generatedAt: inventory.generatedAt,
      rootDir,
      realExternal: inventory.realExternal,
      safeMode: true,
      destructiveActionsIncluded: false,
      complete: false,
      summary: inventory.summary,
      acceptedExternalProofs: inventory.acceptedExternalProofs,
      startCommandCandidates: buildStartCommandCandidates({
        includeBootstrap: true,
        realExternal: inventory.realExternal
      }),
      target: null,
      nextAction: {
        id: 'create-real-target-pack',
        label: 'Create or select a target pack with a real external origin',
        command: null
      },
      nextCommandSafety: commandSafety(null),
      agentSafeNext: targetProofSafeNext()
    };
  }

  return {
    schemaVersion: 1,
    generatedAt: inventory.generatedAt,
    rootDir,
    realExternal: inventory.realExternal,
    safeMode: true,
    destructiveActionsIncluded: false,
    complete: false,
    summary: inventory.summary,
    acceptedExternalProofs: inventory.acceptedExternalProofs,
    startCommandCandidates: buildStartCommandCandidates({
      targetDir: target.dir,
      includeBootstrap: false,
      realExternal: inventory.realExternal
    }),
    target,
    nextAction: target.nextAction,
    nextCommandSafety: target.nextCommandSafety || commandSafety(target.nextAction?.command || null),
    agentSafeNext: target.agentSafeNext || targetProofSafeNext({
      targetName: target.target,
      action: target.nextAction,
      safety: target.nextCommandSafety || commandSafety(target.nextAction?.command || null)
    })
  };
}

export function formatTargetProofMarkdown(proof) {
  const lines = [
    '# Secure Browser Agent Target Proof',
    '',
    `Generated: ${proof.generatedAt}`,
    `Target: ${proof.target}`,
    `Profile: ${proof.profile}`,
    `Real external: ${proof.realExternal ? 'yes' : 'no'}`,
    `OK: ${proof.ok ? 'yes' : 'no'}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Detail |',
    '| --- | --- | --- |'
  ];
  for (const item of proof.checks) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : item.level} | ${String(item.detail || '').replaceAll('|', '\\|')} |`);
  }
  lines.push('', '## Outputs', '', '| File | Exists | Bytes | Shape |', '| --- | --- | ---: | --- |');
  for (const output of proof.outputs) {
    lines.push(`| ${path.basename(output.path)} | ${output.exists ? 'yes' : 'no'} | ${output.bytes} | ${JSON.stringify(output.shape).replaceAll('|', '\\|')} |`);
  }
  lines.push('', '## Benchmark', '');
  lines.push(`- Present and ok: ${proof.benchmark.ok ? 'yes' : 'no'}`);
  lines.push(`- Fastest: ${proof.benchmark.fastestMode || 'none'}${proof.benchmark.fastestRecipe ? ` / ${proof.benchmark.fastestRecipe}` : ''}`);
  lines.push('', '## Auth Check', '');
  lines.push(`- Present and ok: ${proof.authCheck.ok ? 'yes' : 'no'}`);
  lines.push(`- Final URL: ${proof.authCheck.finalUrl || 'unknown'}`);
  lines.push(`- Login-like: ${proof.authCheck.loginLike === null ? 'unknown' : (proof.authCheck.loginLike ? 'yes' : 'no')}`);
  if (proof.proofPath) lines.push(`- Written: ${proof.proofPath}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetProofNextMarkdown(next) {
  const lines = [
    '# Secure Browser Agent Target Proof Next Action',
    '',
    `Generated: ${next.generatedAt}`,
    `Root: ${next.rootDir}`,
    `Real external assertion: ${next.realExternal ? 'yes' : 'no'}`,
    `Safe mode: ${next.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${next.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Complete: ${next.complete ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Target packs: ${next.summary.targetPacks}`,
    `- Proof ready: ${next.summary.proofReady}`,
    `- With external origins: ${next.summary.withExternalOrigins}`,
    `- Likely authenticated: ${next.summary.likelyAuthenticated}`,
    `- Auth-check OK: ${next.summary.authCheckOk}`,
    `- Auth usable: ${next.summary.authUsable ?? 0}`,
    `- Target proofs: ${next.summary.targetProofs}`,
    `- Accepted external proofs: ${next.summary.acceptedExternalProofs}`,
    '',
    '## Next Action',
    '',
    `- ID: ${next.nextAction.id}`,
    `- Label: ${next.nextAction.label}`,
    `- Target: ${next.target?.target || 'none'}`,
    `- Directory: ${next.target?.dir || 'none'}`,
    `- Auth state: ${next.target?.authState || 'none'}`,
    ''
  ];
  if (next.nextAction.command?.shell) {
    lines.push('```bash');
    lines.push(next.nextAction.command.shell);
    lines.push('```');
    lines.push('');
  } else {
    lines.push('- Command: none');
    lines.push('');
  }
  if (next.target?.operatorGuidance) {
    lines.push('## Operator Guidance', '');
    lines.push(`- Human action: ${next.target.operatorGuidance.humanAction}`);
    lines.push(`- Automation blocker: ${next.target.operatorGuidance.automationBlocker}`);
    lines.push(`- Capture blocked: ${next.target.operatorGuidance.captureBlocked ? 'yes' : 'no'}`);
    lines.push('');
  }
  if (next.target?.blockers?.length) {
    lines.push('## Target Blockers', '');
    for (const blocker of next.target.blockers) lines.push(`- ${blocker}`);
    lines.push('');
  }
  if (next.target?.missingArtifacts?.length) {
    lines.push('## Missing Artifacts', '');
    for (const item of next.target.missingArtifacts) {
      const location = item.path ? ` (${item.path})` : '';
      lines.push(`- ${item.id}${location}: ${item.detail}`);
    }
    lines.push('');
  }
  if (next.startCommandCandidates?.length) {
    lines.push('## Start Command Candidates', '');
    for (const candidate of next.startCommandCandidates) {
      lines.push(`- ${candidate.id}: ${candidate.label || 'Start command'}`);
      if (candidate.command?.shell) lines.push(`  \`${candidate.command.shell.replaceAll('`', '\\`')}\``);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

export function formatTargetProofNextCompact(next) {
  const target = next.target || {};
  const rootDir = next.rootDir || rootDirFromTargetPackDir(target.dir);
  const action = next.nextAction || {};
  const safety = next.nextCommandSafety || target.nextCommandSafety || commandSafety(action.command || null);
  const safeNext = next.agentSafeNext || target.agentSafeNext || targetProofSafeNext({
    targetName: target.target || '',
    action,
    safety,
    complete: Boolean(next.complete)
  });
  const summary = next.summary || {};
  const missingArtifacts = Array.isArray(target.missingArtifacts) ? target.missingArtifacts : [];
  const missingArtifactIds = missingArtifacts.map((item) => item.id).filter(Boolean);
  const missingOutputFiles = missingArtifacts
    .filter((item) => item.kind === 'output')
    .map((item) => item.path || item.id.replace(/^output:/, ''))
    .filter(Boolean);
  const lines = [
    `complete: ${yesNo(next.complete)}`,
    `real_external: ${yesNo(next.realExternal)}`,
    `next: ${compactValue(action.id)}`,
    `next_command_opens_browser: ${yesNo(safety.opensBrowser)}`,
    `next_command_starts_capture: ${yesNo(safety.startsCapture)}`,
    `next_command_starts_background: ${yesNo(safety.startsBackground)}`,
    `next_command_requires_operator_approval: ${yesNo(safety.requiresOperatorApproval)}`,
    `next_command_agent_may_run_unattended: ${yesNo(safety.agentMayRunUnattended)}`,
    `agent_safe_next_command_id: ${compactValue(safeNext.id)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(safeNext.mayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(safeNext.opensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(safeNext.startsCapture)}`,
    `agent_safe_next_starts_background: ${yesNo(safeNext.startsBackground)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(safeNext.readsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(safeNext.returnsPageContent)}`,
    `agent_safe_next_blocked_reason: ${compactValue(safeNext.blockedReason)}`,
    `target: ${compactValue(target.target)}`,
    `target_dir: ${compactValue(rootRelativePath(rootDir, target.dir))}`,
    `human_action: ${compactValue(target.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(target.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(target.operatorGuidance?.captureBlocked)}`,
    `proof_ready: ${yesNo(target.proofReady)}`,
    `profile_authenticated: ${yesNo(target.profileLikelyAuthenticated)}`,
    `auth_check_ok: ${yesNo(target.authCheckOk)}`,
    `auth_state: ${compactValue(target.authState)}`,
    `auth_usable: ${yesNo(target.authUsable)}`,
    `profile_auth_metadata_only: ${yesNo(target.profileAuthMetadataOnly)}`,
    `audit_ok: ${yesNo(target.auditOk)}`,
    `benchmark_ok: ${yesNo(target.benchmarkOk)}`,
    `missing_outputs: ${Array.isArray(target.missingOutputs) ? target.missingOutputs.length : 0}`,
    `missing_artifact_count: ${missingArtifacts.length}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`,
    `missing_output_files: ${missingOutputFiles.length ? missingOutputFiles.join(',') : 'none'}`,
    `accepted_external_proofs: ${summary.acceptedExternalProofs ?? 0}`,
    `target_packs: ${summary.targetPacks ?? 0}`,
    `secret_values_read: no`,
    `destructive_actions: ${yesNo(next.destructiveActionsIncluded)}`
  ];
  if (action.command?.shell) lines.push(`command: ${commandDisplayShell(rootDir, action.command)}`);
  if (safeNext.command?.shell) lines.push(`agent_safe_next_command: ${commandDisplayShell(rootDir, safeNext.command)}`);
  if (Array.isArray(target.blockers) && target.blockers.length) {
    lines.push(`blockers: ${target.blockers.length}`);
    lines.push(`first_blocker: ${compactValue(target.blockers[0])}`);
  }
  if (Array.isArray(next.startCommandCandidates) && next.startCommandCandidates.length) {
    const startRequiresOperatorApproval = next.startCommandCandidates.filter((item) => item.safety?.requiresOperatorApproval);
    const startMayRunUnattended = next.startCommandCandidates.filter((item) => item.safety?.agentMayRunUnattended);
    lines.push(`start_commands: ${next.startCommandCandidates.map((item) => item.id).join(',')}`);
    lines.push(`start_command_requires_operator_approval_count: ${startRequiresOperatorApproval.length}`);
    lines.push(`start_command_agent_may_run_unattended_count: ${startMayRunUnattended.length}`);
    lines.push(`start_operator_approval_required: ${startRequiresOperatorApproval.length ? startRequiresOperatorApproval.map((item) => item.id).join(',') : 'none'}`);
    for (const candidate of next.startCommandCandidates) {
      if (candidate.command?.shell) lines.push(`start_${compactKey(candidate.id)}_command: ${commandDisplayShell(rootDir, candidate.command)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function formatTargetProofInventoryCompact(inventory) {
  const rootDir = inventory.rootDir || process.cwd();
  const summary = inventory.summary || {};
  const candidates = (Array.isArray(inventory.targets) ? inventory.targets : [])
    .filter((target) => target.externalOrigins?.length > 0 || !inventory.realExternal);
  const target = (candidates.length ? candidates : (inventory.targets || []))
    .filter((item) => item.nextAction)
    .sort((left, right) => targetProofNextRank(left) - targetProofNextRank(right) || left.target.localeCompare(right.target))[0] || null;
  const missingArtifacts = Array.isArray(target?.missingArtifacts) ? target.missingArtifacts : [];
  const safety = target?.nextCommandSafety || commandSafety(target?.nextAction?.command || null);
  const safeNext = target?.agentSafeNext || targetProofSafeNext({
    targetName: target?.target || '',
    action: target?.nextAction || {},
    safety,
    complete: Boolean(inventory.complete)
  });
  const missingArtifactIds = missingArtifacts.map((item) => item.id).filter(Boolean);
  const missingOutputFiles = missingArtifacts
    .filter((item) => item.kind === 'output')
    .map((item) => item.path || item.id.replace(/^output:/, ''))
    .filter(Boolean);
  const targetsCompact = (inventory.targets || [])
    .map((item) => `${compactValue(item.target)}:${compactValue(item.authState)}:${compactValue(item.nextAction?.id)}`)
    .join(',');
  const lines = [
    `complete: ${yesNo(inventory.complete)}`,
    `real_external: ${yesNo(inventory.realExternal)}`,
    `target_packs: ${summary.targetPacks ?? 0}`,
    `proof_ready: ${summary.proofReady ?? 0}`,
    `with_external_origins: ${summary.withExternalOrigins ?? 0}`,
    `likely_authenticated: ${summary.likelyAuthenticated ?? 0}`,
    `summary_auth_check_ok: ${summary.authCheckOk ?? 0}`,
    `summary_auth_usable: ${summary.authUsable ?? 0}`,
    `target_proofs: ${summary.targetProofs ?? 0}`,
    `accepted_external_proofs: ${summary.acceptedExternalProofs ?? 0}`,
    `targets: ${Array.isArray(inventory.targets) ? inventory.targets.length : 0}`,
    `targets_compact: ${targetsCompact || 'none'}`,
    `target: ${compactValue(target?.target)}`,
    `target_dir: ${compactValue(rootRelativePath(rootDir, target?.dir))}`,
    `next: ${compactValue(target?.nextAction?.id)}`,
    `next_command_opens_browser: ${yesNo(safety.opensBrowser)}`,
    `next_command_starts_capture: ${yesNo(safety.startsCapture)}`,
    `next_command_starts_background: ${yesNo(safety.startsBackground)}`,
    `next_command_requires_operator_approval: ${yesNo(safety.requiresOperatorApproval)}`,
    `next_command_agent_may_run_unattended: ${yesNo(safety.agentMayRunUnattended)}`,
    `agent_safe_next_command_id: ${compactValue(safeNext.id)}`,
    `agent_safe_next_may_run_unattended: ${yesNo(safeNext.mayRunUnattended)}`,
    `agent_safe_next_opens_browser: ${yesNo(safeNext.opensBrowser)}`,
    `agent_safe_next_starts_capture: ${yesNo(safeNext.startsCapture)}`,
    `agent_safe_next_starts_background: ${yesNo(safeNext.startsBackground)}`,
    `agent_safe_next_reads_browser_storage: ${yesNo(safeNext.readsBrowserStorage)}`,
    `agent_safe_next_returns_page_content: ${yesNo(safeNext.returnsPageContent)}`,
    `agent_safe_next_blocked_reason: ${compactValue(safeNext.blockedReason)}`,
    `human_action: ${compactValue(target?.operatorGuidance?.humanAction)}`,
    `automation_blocker: ${compactValue(target?.operatorGuidance?.automationBlocker)}`,
    `capture_blocked: ${yesNo(target?.operatorGuidance?.captureBlocked)}`,
    `proof_ready_target: ${yesNo(target?.proofReady)}`,
    `profile_authenticated: ${yesNo(target?.profileLikelyAuthenticated)}`,
    `target_auth_check_ok: ${yesNo(target?.authCheckOk)}`,
    `auth_state: ${compactValue(target?.authState)}`,
    `target_auth_usable: ${yesNo(target?.authUsable)}`,
    `profile_auth_metadata_only: ${yesNo(target?.profileAuthMetadataOnly)}`,
    `missing_outputs: ${Array.isArray(target?.missingOutputs) ? target.missingOutputs.length : 0}`,
    `missing_artifact_count: ${missingArtifacts.length}`,
    `missing_artifacts: ${missingArtifactIds.length ? missingArtifactIds.join(',') : 'none'}`,
    `missing_output_files: ${missingOutputFiles.length ? missingOutputFiles.join(',') : 'none'}`,
    `blockers: ${Array.isArray(target?.blockers) ? target.blockers.length : 0}`,
    `secret_values_read: no`,
    `destructive_actions: ${yesNo(inventory.destructiveActionsIncluded)}`
  ];
  if (target?.nextAction?.command?.shell) lines.push(`command: ${commandDisplayShell(rootDir, target.nextAction.command)}`);
  if (safeNext.command?.shell) lines.push(`agent_safe_next_command: ${commandDisplayShell(rootDir, safeNext.command)}`);
  if (Array.isArray(target?.blockers) && target.blockers.length) {
    lines.push(`first_blocker: ${compactValue(target.blockers[0])}`);
  }
  return `${lines.join('\n')}\n`;
}

export function formatTargetProofInventoryMarkdown(inventory) {
  const lines = [
    '# Secure Browser Agent Target Proof Inventory',
    '',
    `Generated: ${inventory.generatedAt}`,
    `Root: ${inventory.rootDir}`,
    `Real external assertion: ${inventory.realExternal ? 'yes' : 'no'}`,
    `Safe mode: ${inventory.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${inventory.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Complete: ${inventory.complete ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Target packs: ${inventory.summary.targetPacks}`,
    `- Proof ready: ${inventory.summary.proofReady}`,
    `- With external origins: ${inventory.summary.withExternalOrigins}`,
    `- Likely authenticated: ${inventory.summary.likelyAuthenticated}`,
    `- Auth-check OK: ${inventory.summary.authCheckOk}`,
    `- Auth usable: ${inventory.summary.authUsable ?? 0}`,
    `- Target proofs: ${inventory.summary.targetProofs}`,
    `- Accepted external proofs: ${inventory.summary.acceptedExternalProofs}`,
    '',
    '## Accepted External Proofs',
    ''
  ];
  if (inventory.acceptedExternalProofs.length === 0) {
    lines.push('- none');
  } else {
    for (const item of inventory.acceptedExternalProofs) lines.push(`- ${item.target}: ${item.path}`);
  }
  lines.push(
    '',
    '## Targets',
    '',
    '| Target | External | Auth | Auth State | Auth Check | Outputs Missing | Benchmark | Ready | Next Action | Blockers |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  );
  for (const item of inventory.targets) {
    lines.push([
      item.target,
      item.externalOrigins.length ? 'yes' : 'no',
      item.profileLikelyAuthenticated ? 'yes' : 'no',
      item.authState || 'unchecked',
      item.authCheckOk ? 'yes' : 'no',
      item.missingOutputs.join(', ') || 'none',
      item.benchmarkOk ? 'yes' : 'no',
      item.proofReady ? 'yes' : 'no',
      item.nextAction?.id || '',
      item.blockers.length
    ].map((value) => String(value).replaceAll('|', '\\|')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetProofPlanMarkdown(plan) {
  const lines = [
    '# Secure Browser Agent Target Proof Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Target: ${plan.target}`,
    `Profile: ${plan.profile}`,
    `Real external assertion: ${plan.realExternal ? 'yes' : 'no'}`,
    `Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    '',
    '## Current State',
    '',
    `- Audit OK: ${plan.currentState.auditOk ? 'yes' : 'no'}`,
    `- Profile likely authenticated: ${plan.currentState.profileLikelyAuthenticated ? 'yes' : 'no'}`,
    `- Auth state: ${plan.currentState.authState || 'unchecked'}`,
    `- Auth-check OK: ${plan.currentState.authCheck.ok ? 'yes' : 'no'}`,
    `- Auth-check final URL: ${plan.currentState.authCheck.finalUrl || 'unknown'}`,
    `- Operator handoff ready: ${plan.currentState.operatorHandoff.exists ? 'yes' : 'no'}`,
    `- Operator handoff auth-check port: ${plan.currentState.operatorHandoff.hasAuthCheckPort ? 'yes' : 'no'}`,
    `- Permissions pending: ${plan.currentState.permissionsPending}`,
    `- Daemon running: ${plan.currentState.daemonRunning ? 'yes' : 'no'}`,
    `- Real external origins: ${plan.externalOrigins.join(', ') || 'none'}`,
    `- Benchmark OK: ${plan.currentState.benchmark.ok ? 'yes' : 'no'}`,
    `- Required outputs missing: ${plan.currentState.missingOutputs.join(', ') || 'none'}`,
    `- Proof ready: ${plan.currentState.proofReady ? 'yes' : 'no'}`,
    '',
    'Profile likely authenticated only means the dedicated browser profile has local state artifacts.',
    'Auth-check OK is the proof gate for whether the target page currently behaves as logged in.',
    '',
    '## Blockers',
    ''
  ];
  if (plan.blockers.length === 0) {
    lines.push('- none');
  } else {
    for (const blocker of plan.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('', '## Missing Artifacts', '');
  if (plan.currentState.missingArtifacts.length === 0) {
    lines.push('- none');
  } else {
    for (const item of plan.currentState.missingArtifacts) {
      const location = item.path ? ` (${item.path})` : '';
      lines.push(`- ${item.id}${location}: ${item.detail}`);
    }
  }
  lines.push('', '## Commands', '');
  for (const step of plan.commands) {
    lines.push(`### ${step.id}`);
    lines.push(`- ${step.title}`);
    lines.push(`- Status: ${step.status}`);
    lines.push(`- Writes local state: ${step.writes ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('```bash');
    lines.push(step.command.shell);
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function formatTargetProofPlanCompact(plan) {
  const action = plan.nextAction || nextTargetProofAction(plan);
  const nextCommand = action.command || null;
  const rootDir = plan.rootDir || rootDirFromTargetPackDir(plan.dir);
  const shell = commandDisplayShell(rootDir, nextCommand);
  const safety = plan.nextCommandSafety || commandSafety(nextCommand);
  const safeNext = plan.agentSafeNext || targetProofPlanSafeNext(plan, action, safety);
  const lines = [
    `safe_mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `status_only: yes`,
    `destructive_actions: ${plan.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `secret_values_read: no`,
    `opens_browser_now: no`,
    `starts_capture_now: no`,
    `reads_browser_storage: no`,
    `page_content_returned: no`,
    `target: ${plan.target}`,
    `target_dir: ${rootRelativePath(rootDir, plan.dir)}`,
    `real_external_assertion: ${plan.realExternal ? 'yes' : 'no'}`,
    `external_origin_count: ${plan.externalOrigins.length}`,
    `audit_ok: ${plan.currentState.auditOk ? 'yes' : 'no'}`,
    `auth_state: ${plan.currentState.authState || 'unchecked'}`,
    `auth_usable: ${plan.currentState.authUsable ? 'yes' : 'no'}`,
    `profile_auth_metadata_only: ${plan.currentState.profileAuthMetadataOnly ? 'yes' : 'no'}`,
    `auth_check_ok: ${plan.currentState.authCheck.ok ? 'yes' : 'no'}`,
    `operator_handoff_ready: ${plan.currentState.operatorHandoff.exists ? 'yes' : 'no'}`,
    `operator_handoff_auth_check_port: ${plan.currentState.operatorHandoff.hasAuthCheckPort ? 'yes' : 'no'}`,
    `permissions_pending: ${plan.currentState.permissionsPending}`,
    `missing_outputs: ${plan.currentState.missingOutputs.join(',') || 'none'}`,
    `benchmark_ok: ${plan.currentState.benchmark.ok ? 'yes' : 'no'}`,
    `proof_ready: ${plan.currentState.proofReady ? 'yes' : 'no'}`,
    `blocker_count: ${plan.blockers.length}`,
    `missing_artifacts: ${plan.currentState.missingArtifacts.map((item) => item.id).join(',') || 'none'}`,
    `next_action: ${action.id}`,
    `next_action_label: ${action.label}`,
    `next_command_opens_browser: ${safety.opensBrowser ? 'yes' : 'no'}`,
    `next_command_starts_capture: ${safety.startsCapture ? 'yes' : 'no'}`,
    `next_command_starts_background: ${safety.startsBackground ? 'yes' : 'no'}`,
    `next_command_requires_operator_approval: ${safety.requiresOperatorApproval ? 'yes' : 'no'}`,
    `next_command_agent_may_run_unattended: ${safety.agentMayRunUnattended ? 'yes' : 'no'}`,
    `agent_safe_next_command_id: ${safeNext.id || 'none'}`,
    `agent_safe_next_may_run_unattended: ${safeNext.mayRunUnattended ? 'yes' : 'no'}`,
    `agent_safe_next_opens_browser: ${safeNext.opensBrowser ? 'yes' : 'no'}`,
    `agent_safe_next_starts_capture: ${safeNext.startsCapture ? 'yes' : 'no'}`,
    `agent_safe_next_starts_background: ${safeNext.startsBackground ? 'yes' : 'no'}`,
    `agent_safe_next_reads_browser_storage: ${safeNext.readsBrowserStorage ? 'yes' : 'no'}`,
    `agent_safe_next_returns_page_content: ${safeNext.returnsPageContent ? 'yes' : 'no'}`,
    `agent_safe_next_blocked_reason: ${safeNext.blockedReason || 'none'}`,
    `next_command: ${shell || 'none'}`
  ];
  if (safeNext.command?.shell) lines.push(`agent_safe_next_command: ${commandDisplayShell(rootDir, safeNext.command)}`);
  if (safety.requiresOperatorApproval && plan.operatorApprovalPlanCommand?.shell) lines.push(`operator_approval_plan_command: ${commandDisplayShell(rootDir, plan.operatorApprovalPlanCommand)}`);
  if (safety.requiresOperatorApproval && plan.operatorApprovalCommand?.shell) lines.push(`operator_approval_command: ${commandDisplayShell(rootDir, plan.operatorApprovalCommand)}`);
  if (plan.objectiveCompletionStrictCommand?.shell) lines.push(`objective_completion_strict_command: ${plan.objectiveCompletionStrictCommand.shell}`);
  return `${lines.join('\n')}\n`;
}
