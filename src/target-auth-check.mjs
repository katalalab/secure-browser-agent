import fs from 'node:fs';
import path from 'node:path';
import { observeWithCdp, observeWithCdpPort } from './cdp-backend.mjs';
import { safeOutputPath } from './output.mjs';
import { assertAllowedUrl, loadPolicy, profilePath } from './policy.mjs';
import { resolveTargetPack } from './target-pack.mjs';
import { toPosixPath } from './output.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function statusOut(options = {}) {
  return options.statusOut || options['status-out'] || '';
}

function normalizeUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function samePath(left, right) {
  return left && right && left.origin === right.origin && left.pathname.replace(/\/+$/, '') === right.pathname.replace(/\/+$/, '');
}

function loginLikeSignal(observe, loginUrl) {
  const finalUrl = normalizeUrl(observe?.url || '');
  const login = normalizeUrl(loginUrl || '');
  const title = String(observe?.title || '').toLowerCase();
  const controls = observe?.controls || [];
  const forms = observe?.forms || [];
  const hasPassword = controls.some((control) => String(control.type || '').toLowerCase() === 'password')
    || forms.some((form) => (form.controls || []).some((control) => String(control.type || '').toLowerCase() === 'password'));
  const hasSignInTitle = /\b(sign in|log in|login)\b/.test(title);
  const onLoginUrl = samePath(finalUrl, login);
  return {
    loginLike: Boolean(onLoginUrl || hasPassword || hasSignInTitle),
    onLoginUrl,
    hasPassword,
    hasSignInTitle
  };
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

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function redactedValue(value, empty = 'none') {
  return compactValue(value) === 'none' ? empty : '[redacted]';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function handoffPathFor(policy, options = {}) {
  const handoff = options.handoff || options.handoffPath || 'operator-handoff.json';
  try {
    const candidate = safeOutputPath(policy, handoff);
    return fs.existsSync(candidate) ? handoff : '';
  } catch {
    return '';
  }
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

function handoffAuthCheckPort(policy, options = {}) {
  const handoff = options.handoff || options.handoffPath || '';
  if (!handoff) return '';
  const handoffPath = safeOutputPath(policy, handoff);
  if (!fs.existsSync(handoffPath)) return '';
  const payload = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  const commands = Array.isArray(payload.commands)
    ? payload.commands
    : Array.isArray(payload.handoff?.commands)
    ? payload.handoff.commands
    : [];
  const postLogin = commands.find((item) => item.id === 'post-login-capture') || null;
  const authCheck = commands.find((item) => item.id === 'auth-check-status') || null;
  return argAfter(commandArgs(postLogin), '--auth-check-port')
    || argAfter(commandArgs(authCheck), '--cdp-port')
    || '';
}

function handoffResumeCommand(packDir, handoff = 'operator-handoff.json') {
  return command([
    'node',
    'src/cli.mjs',
    'target-handoff-resume',
    packDir,
    '--handoff',
    handoff,
    '--run',
    '--open-login',
    '--wait-auth',
    '--wait-auth-status-out',
    'handoff-resume-wait-auth-status.json',
    '--out',
    'handoff-resume-latest.json',
    '--format',
    'compact'
  ]);
}

function nextActionFor(report, packDir, policy, options = {}) {
  if (report.ok) {
    return {
      id: 'capture',
      label: 'Auth-check passed; continue the post-login capture/proof sequence',
      command: command(['node', 'src/cli.mjs', 'target-proof-capture', packDir, '--real-external', '--run', '--format', 'markdown'])
    };
  }
  if (report.loginLike) {
    const handoff = handoffPathFor(policy, options);
    if (handoff) {
      return {
        id: 'handoff-resume',
        label: 'Target page still looks like a login screen; continue through the saved auth-first handoff resume lane',
        command: handoffResumeCommand(packDir, handoff)
      };
    }
    return {
      id: 'login-capture',
      label: 'Target page still looks like a login screen; open the dedicated profile, complete login, then wait and capture proof',
      command: command(['node', 'src/cli.mjs', 'target-login-capture', packDir, '--real-external', '--handoff-out', 'operator-handoff.json', '--wait-auth-status-out', 'wait-auth-status.json', '--format', 'markdown'])
    };
  }
  return {
    id: 'review',
    label: 'Auth-check failed without a login-screen signal; review target policy, redirects, and page URL',
    command: command(['node', 'src/cli.mjs', 'target-proof-plan', packDir, '--real-external', '--format', 'markdown'])
  };
}

export async function buildTargetAuthCheck(targetDir, options = {}) {
  const pack = resolveTargetPack(targetDir);
  const policy = loadPolicy(pack.policy);
  const profile = options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || pack.metadata.target || path.basename(pack.dir);
  const pageUrl = options.url || pack.metadata.pageUrl;
  if (!pageUrl) throw new Error(`target pageUrl not found: ${pack.metadataFile}`);
  assertAllowedUrl(pageUrl, policy);
  const observeOptions = {
    daemon: Boolean(options.daemon),
    linkLimit: Number(options.linkLimit || 10),
    controlLimit: Number(options.controlLimit || 20),
    textLimit: 0
  };
  const cdpPort = options.cdpPort || options['cdp-port'] || handoffAuthCheckPort(policy, options);
  const observe = options.observe || (cdpPort
    ? await observeWithCdpPort(pageUrl, Number(cdpPort), observeOptions)
    : await observeWithCdp(pageUrl, profilePath(policy, profile), observeOptions));
  const signal = loginLikeSignal(observe, pack.metadata.loginUrl);
  const finalUrl = observe?.url || '';
  const final = normalizeUrl(finalUrl);
  const requested = normalizeUrl(pageUrl);
  const sameOrigin = Boolean(final && requested && final.origin === requested.origin);
  const ok = Boolean(sameOrigin && !signal.loginLike);
  const report = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    target: pack.metadata.target || path.basename(pack.dir),
    dir: pack.dir,
    profile,
    pageUrl,
    loginUrl: pack.metadata.loginUrl || '',
    cdpPort: cdpPort ? String(cdpPort) : '',
    finalUrl,
    title: observe?.title || '',
    ok,
    sameOrigin,
    loginLike: signal.loginLike,
    signals: signal,
    counts: observe?.counts || {},
    proofPath: '',
    statusPath: ''
  };
  report.nextAction = nextActionFor(report, pack.dir, policy, options);
  const statusOutput = statusOut(options);
  if (statusOutput) {
    const statusPath = safeOutputPath(policy, statusOutput);
    report.statusPath = toPosixPath(statusPath);
    writeJson(statusPath, report);
  }
  if (options.write) {
    const proofPath = path.join(pack.dir, 'proof', 'auth-check.json');
    report.proofPath = toPosixPath(proofPath);
    writeJson(proofPath, report);
  }
  return report;
}

export async function buildTargetAuthWatch(targetDir, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? options['timeout-ms'] ?? 300000);
  const intervalMs = Number(options.intervalMs ?? options['interval-ms'] ?? 5000);
  const statusOutput = statusOut(options) || 'auth-watch-status.json';
  const sleeper = options.sleep || sleep;
  const now = options.now || (() => Date.now());
  const authCheckBuilder = options.authCheckBuilder || buildTargetAuthCheck;
  const startedAtMs = now();
  const attempts = [];
  let lastAuthCheck = null;
  let status = 'waiting';

  const buildWatchReport = () => ({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: lastAuthCheck?.target || '',
    dir: lastAuthCheck?.dir || '',
    profile: lastAuthCheck?.profile || '',
    status,
    ok: Boolean(lastAuthCheck?.ok),
    timeoutMs,
    intervalMs,
    attempts,
    attemptCount: attempts.length,
    statusPath: lastAuthCheck?.statusPath || '',
    authCheck: lastAuthCheck,
    nextAction: lastAuthCheck?.nextAction || null,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false
  });

  const writeWatchReport = () => {
    if (lastAuthCheck?.statusPath) writeJson(lastAuthCheck.statusPath, buildWatchReport());
  };

  while (true) {
    lastAuthCheck = await authCheckBuilder(targetDir, {
      ...options,
      statusOut: statusOutput,
      'status-out': statusOutput,
      write: false
    });
    attempts.push({
      attempt: attempts.length + 1,
      generatedAt: lastAuthCheck.generatedAt,
      ok: Boolean(lastAuthCheck.ok),
      loginLike: Boolean(lastAuthCheck.loginLike),
      sameOrigin: Boolean(lastAuthCheck.sameOrigin),
      finalUrl: lastAuthCheck.finalUrl || '',
      title: lastAuthCheck.title || '',
      nextAction: lastAuthCheck.nextAction?.id || ''
    });
    if (lastAuthCheck.ok) {
      status = 'authenticated';
      writeWatchReport();
      break;
    }
    if (now() - startedAtMs >= timeoutMs) {
      status = 'timed-out';
      writeWatchReport();
      break;
    }
    writeWatchReport();
    await sleeper(intervalMs);
  }

  return buildWatchReport();
}

export function formatTargetAuthCheckMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Target Auth Check',
    '',
    `Generated: ${report.generatedAt}`,
    `Target: ${report.target}`,
    `Profile: ${report.profile}`,
    `OK: ${report.ok ? 'yes' : 'no'}`,
    `Page URL: ${redactedValue(report.pageUrl)}`,
    `Final URL: ${redactedValue(report.finalUrl)}`,
    `Title: ${redactedValue(report.title, 'unknown')}`,
    '',
    '## Signals',
    '',
    `- Same origin: ${report.sameOrigin ? 'yes' : 'no'}`,
    `- Login-like: ${report.loginLike ? 'yes' : 'no'}`,
    `- On login URL: ${report.signals.onLoginUrl ? 'yes' : 'no'}`,
    `- Password control present: ${report.signals.hasPassword ? 'yes' : 'no'}`,
    `- Sign-in title: ${report.signals.hasSignInTitle ? 'yes' : 'no'}`
  ];
  if (report.nextAction) {
    lines.push(
      '',
      '## Next Action',
      '',
      `- ID: ${report.nextAction.id}`,
      `- Label: ${report.nextAction.label}`
    );
    if (report.nextAction.command?.shell) {
      lines.push('', '```bash', report.nextAction.command.shell, '```');
    }
  }
  if (report.proofPath) lines.push('', `Written: ${report.proofPath}`);
  if (report.statusPath) lines.push('', `Status written: ${report.statusPath}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetAuthCheckCompact(report) {
  const lines = [
    `ok: ${yesNo(report.ok)}`,
    `target: ${compactValue(report.target)}`,
    `profile: ${compactValue(report.profile)}`,
    `same_origin: ${yesNo(report.sameOrigin)}`,
    `login_like: ${yesNo(report.loginLike)}`,
    `on_login_url: ${yesNo(report.signals?.onLoginUrl)}`,
    `password_control: ${yesNo(report.signals?.hasPassword)}`,
    `sign_in_title: ${yesNo(report.signals?.hasSignInTitle)}`,
    `final_url: ${redactedValue(report.finalUrl)}`,
    `title: ${redactedValue(report.title)}`
  ];
  if (report.nextAction) {
    lines.push(`next_action: ${compactValue(report.nextAction.id)}`);
    if (report.nextAction.command?.shell) lines.push(`command: ${report.nextAction.command.shell}`);
  }
  if (report.proofPath) lines.push(`proof: ${compactValue(report.proofPath)}`);
  if (report.statusPath) lines.push(`status: ${compactValue(report.statusPath)}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetAuthWatchCompact(report) {
  const lines = [
    `status: ${compactValue(report.status)}`,
    `ok: ${yesNo(report.ok)}`,
    `target: ${compactValue(report.target)}`,
    `profile: ${compactValue(report.profile)}`,
    `attempts: ${report.attemptCount || 0}`,
    `timeout_ms: ${report.timeoutMs}`,
    `interval_ms: ${report.intervalMs}`,
    `login_like: ${yesNo(report.authCheck?.loginLike)}`,
    `final_url: ${redactedValue(report.authCheck?.finalUrl)}`,
    `title: ${redactedValue(report.authCheck?.title)}`,
    `next_action: ${compactValue(report.nextAction?.id)}`,
    `status_file: ${compactValue(report.statusPath)}`,
    `secret_values_read: ${yesNo(report.secretValuesRead)}`
  ];
  if (report.nextAction?.command?.shell) lines.push(`command: ${report.nextAction.command.shell}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function formatTargetAuthWatchMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Target Auth Watch',
    '',
    `Generated: ${report.generatedAt}`,
    `Target: ${report.target || 'unknown'}`,
    `Profile: ${report.profile || 'unknown'}`,
    `Status: ${report.status}`,
    `OK: ${report.ok ? 'yes' : 'no'}`,
    `Attempts: ${report.attemptCount || 0}`,
    `Timeout ms: ${report.timeoutMs}`,
    `Interval ms: ${report.intervalMs}`,
    `Status file: ${report.statusPath || 'none'}`,
    `Secret values read: ${report.secretValuesRead ? 'yes' : 'no'}`
  ];
  if (report.authCheck) {
    lines.push(
      '',
      '## Last Auth Check',
      '',
      `- Same origin: ${report.authCheck.sameOrigin ? 'yes' : 'no'}`,
      `- Login-like: ${report.authCheck.loginLike ? 'yes' : 'no'}`,
      `- Final URL: ${redactedValue(report.authCheck.finalUrl)}`,
      `- Title: ${redactedValue(report.authCheck.title, 'unknown')}`
    );
  }
  if (report.nextAction) {
    lines.push('', '## Next Action', '', `- ID: ${report.nextAction.id}`, `- Label: ${report.nextAction.label}`);
    if (report.nextAction.command?.shell) lines.push('', '```bash', report.nextAction.command.shell, '```');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
