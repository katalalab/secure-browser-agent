import fs from 'node:fs';
import path from 'node:path';
import { cdpDaemonStatus } from './cdp-backend.mjs';
import { loadPolicy, profilePath } from './policy.mjs';
import { resolveTargetPack } from './target-pack.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/\s+/g, ' ').trim() || 'none';
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return { args, shell: args.map(shellQuote).join(' ') };
}

function listTargetPackDirs(rootDir, targetDir = '') {
  if (targetDir) return [path.resolve(targetDir)];
  const packsRoot = path.join(rootDir, 'runs', 'target-packs');
  if (!fs.existsSync(packsRoot)) return [];
  return fs.readdirSync(packsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packsRoot, entry.name))
    .sort();
}

export async function buildTargetWorkerPool(rootDir = process.cwd(), options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const workers = [];
  const errors = [];
  for (const dir of listTargetPackDirs(rootDir, options.targetDir || options['target-dir'])) {
    try {
      const pack = resolveTargetPack(dir);
      const policy = loadPolicy(pack.policy);
      const profile = options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || path.basename(pack.dir);
      const profileDir = profilePath(policy, profile);
      const daemon = await cdpDaemonStatus(profileDir);
      const profileArgs = ['--profile', profile];
      workers.push({
        target: pack.metadata.target || path.basename(pack.dir),
        dir: pack.dir,
        profile,
        profileDir,
        daemonRunning: Boolean(daemon.ok),
        pid: daemon.pid || null,
        port: daemon.port || null,
        startedAt: daemon.startedAt || '',
        startCommand: command(['node', 'src/cli.mjs', 'target-daemon', pack.dir, 'start', ...profileArgs]),
        stopCommand: command(['node', 'src/cli.mjs', 'target-daemon', pack.dir, 'stop', ...profileArgs]),
        statusCommand: command(['node', 'src/cli.mjs', 'target-daemon', pack.dir, 'status', ...profileArgs])
      });
    } catch (error) {
      errors.push({
        dir,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    workerCount: workers.length,
    runningCount: workers.filter((worker) => worker.daemonRunning).length,
    workers,
    errors
  };
}

export function formatTargetWorkerPoolCompact(pool) {
  const lines = [
    `safe_mode: ${yesNo(pool.safeMode)}`,
    `status_only: ${yesNo(pool.statusOnly)}`,
    `destructive_actions: ${yesNo(pool.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(pool.secretValuesRead)}`,
    `workers: ${pool.workerCount}`,
    `running: ${pool.runningCount}`,
    `errors: ${pool.errors.length}`
  ];
  for (const worker of pool.workers.slice(0, 10)) {
    lines.push(`worker_${worker.target}: running=${yesNo(worker.daemonRunning)} profile=${compactValue(worker.profile)} port=${compactValue(worker.port)}`);
    lines.push(`worker_${worker.target}_start_command: ${worker.startCommand.shell}`);
    lines.push(`worker_${worker.target}_stop_command: ${worker.stopCommand.shell}`);
  }
  for (const error of pool.errors.slice(0, 5)) lines.push(`error_${path.basename(error.dir)}: ${compactValue(error.error)}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
