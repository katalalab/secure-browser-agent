import { spawn } from 'node:child_process';
import { allowedDomains, profilePath, statePath } from './policy.mjs';

export function lightpandaExecutablePath(policy = {}, options = {}) {
  return options.executablePath
    || policy.lightpandaExecutable
    || policy.engines?.lightpanda?.executablePath
    || process.env.SBA_LIGHTPANDA_PATH
    || '';
}

export function runAgentBrowser(args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 30000;
    const child = spawn('agent-browser', args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      const error = new Error(`agent-browser timed out after ${timeoutMs}ms: ${args.join(' ')}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      const error = new Error(`agent-browser exited ${code}: ${stderr || stdout}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });

    if (options.stdin) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

export function sessionArgs(policy, profileName, options = {}) {
  const args = [
    '--session',
    profileName,
    '--session-name',
    profileName
  ];
  if (options.engine === 'lightpanda') {
    // Lightpanda is a fast public-page backend; agent-browser does not support Chrome profiles there.
  } else if (options.stateOnly) {
    args.push('--state', statePath(policy, profileName));
  } else {
    args.push('--profile', profilePath(policy, profileName));
  }
  const domains = allowedDomains(policy);
  if (!options.skipAllowedDomains && domains.length > 0) args.push('--allowed-domains', domains.join(','));
  if (options.engine && options.engine !== 'chrome') args.push('--engine', options.engine);
  if (options.engine === 'lightpanda') {
    const executablePath = lightpandaExecutablePath(policy, options);
    if (executablePath) args.push('--executable-path', executablePath);
  }
  return args;
}
