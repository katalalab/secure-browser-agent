// Behavior-pinning harness for the src/cli.mjs and src/mcp-server.mjs split.
//
// Every case runs the real CLI entry (`node src/cli.mjs ...`) offline, from a
// throw-away copy of the repository, with a PATH that contains only `node`, so
// no real browser, `agent-browser`, `gh`, `ps` or network access is reachable.
// Stdout/stderr are normalized (paths, timestamps, pids) and reduced to a
// digest, so a golden record can be compared before and after a refactor.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'characterization');
const COPY_EXCLUDES = new Set(['.git', 'worktree', 'worktrees', 'node_modules', 'runs', 'profiles', 'test']);
const CASE_TIMEOUT_MS = 60000;

const MCP_INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'characterization', version: '0' } }
};

// A case is either explicit CLI `steps`, or an MCP tool call replayed through `mcp-stdio`.
export function caseSteps(testCase) {
  if (!testCase.mcpTool) return testCase.steps;
  const request = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: testCase.mcpTool, arguments: testCase.mcpArguments || {} } };
  return [{ argv: ['mcp-stdio'], stdin: `${JSON.stringify(MCP_INITIALIZE)}\n${JSON.stringify(request)}\n` }];
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

// A scratch area holding a `node`-only bin dir, an empty HOME and the repo copy template.
export function createScratch(repoRoot = REPO_ROOT) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sba-char-')));
  const bin = path.join(base, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  fs.mkdirSync(path.join(base, 'home'));
  const template = path.join(base, 'template');
  fs.cpSync(repoRoot, template, {
    recursive: true,
    filter: (source) => !COPY_EXCLUDES.has(path.basename(source)) || path.dirname(source) !== repoRoot
  });
  const sandboxProfile = path.join(base, 'sandbox.sb');
  fs.writeFileSync(sandboxProfile, [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(deny file-write*)',
    `(allow file-write* (subpath "${base}") (subpath "/dev") (subpath "/private/var/folders"))`,
    '(deny file-read* (subpath "/Applications"))',
    '(deny process-exec* (literal "/usr/bin/open") (literal "/usr/bin/osascript") (literal "/bin/launchctl") (literal "/usr/bin/pgrep") (subpath "/Applications"))',
    '(deny signal (target others))',
    ''
  ].join('\n'));
  return { base, bin, template, sandboxProfile, repoRoot, counter: 0 };
}

export function destroyScratch(scratch) {
  fs.rmSync(scratch.base, { recursive: true, force: true });
}

export function normalize(text, replacements) {
  let out = text;
  for (const [from, to] of replacements) out = out.split(from).join(to);
  return out
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?/g, '<TS>')
    .replace(/\b1[0-9]{12}\b/g, '<MS>')
    .replace(/(\\*"(?:pid|ppid|uid|durationMs|elapsedMs|elapsed_ms|duration_ms)\\*": ?)\d+/g, '$1<N>')
    .replace(/\b(pid|ppid|elapsed_ms|duration_ms)(=|: ?)\d+/g, '$1$2<N>');
}

function spawnStep(scratch, workDir, step, useSandbox) {
  return new Promise((resolve) => {
    const env = {
      PATH: scratch.bin,
      HOME: path.join(scratch.base, 'home'),
      TMPDIR: `${scratch.base}/`,
      LANG: 'C',
      NO_COLOR: '1',
      TZ: 'UTC'
    };
    const command = useSandbox ? '/usr/bin/sandbox-exec' : process.execPath;
    const args = [...(useSandbox ? ['-f', scratch.sandboxProfile, process.execPath] : []), path.join(workDir, step.script || 'src/cli.mjs'), ...step.argv];
    const child = spawn(command, args, { cwd: workDir, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, step.timeoutMs || CASE_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', () => {});
    child.stdin.end(step.stdin || '');
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stdout, stderr });
    });
  });
}

// Run one case (a sequence of CLI invocations sharing one working copy) and
// return a JSON-serializable digest record.
export async function runCase(scratch, testCase, { sandbox = false } = {}) {
  scratch.counter += 1;
  const workDir = path.join(scratch.base, `case-${scratch.counter}`);
  fs.cpSync(scratch.template, workDir, { recursive: true });
  const replacements = [[workDir, '<ROOT>'], [scratch.repoRoot, '<ORIG>'], [scratch.base, '<TMP>'], [os.homedir(), '<HOME>']]
    .sort((a, b) => b[0].length - a[0].length);
  const steps = [];
  for (const step of caseSteps(testCase)) {
    const result = await spawnStep(scratch, workDir, step, sandbox);
    const stdout = normalize(result.stdout, replacements);
    const stderr = normalize(result.stderr, replacements);
    steps.push({
      argv: [step.script, ...step.argv].filter(Boolean).join(' ').slice(0, 80),
      exit: result.timedOut ? 'timeout' : result.code,
      stdoutBytes: Buffer.byteLength(stdout),
      stdoutSha256: sha256(stdout),
      stderrBytes: Buffer.byteLength(stderr),
      stderrSha256: sha256(stderr),
      _stdout: stdout,
      _stderr: stderr
    });
  }
  fs.rmSync(workDir, { recursive: true, force: true });
  return steps;
}

export function stripRaw(steps) {
  return steps.map(({ _stdout, _stderr, ...rest }) => rest);
}

export async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

// Export surface of an ES module: name, kind and, for functions, length and a
// hash of the source text. Classes and plain values are hashed structurally.
export async function exportSurface(file) {
  const namespace = await import(pathToFileURL(file).href);
  const surface = {};
  for (const name of Object.keys(namespace).sort()) {
    const value = namespace[name];
    if (typeof value === 'function') {
      surface[name] = {
        kind: /^class\s/.test(Function.prototype.toString.call(value)) ? 'class' : 'function',
        length: value.length,
        sourceSha256: sha256(Function.prototype.toString.call(value))
      };
    } else {
      surface[name] = { kind: typeof value, valueSha256: sha256(JSON.stringify(value) ?? String(value)) };
    }
  }
  return surface;
}
