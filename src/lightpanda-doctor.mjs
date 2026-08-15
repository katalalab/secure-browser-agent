import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NIGHTLY_RELEASE = 'https://github.com/lightpanda-io/browser/releases/download/nightly';

function findExecutable(command, env = process.env) {
  const paths = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep scanning PATH.
    }
  }
  return '';
}

function executableExists(filePath) {
  if (!filePath) return false;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    env,
    encoding: 'utf8',
    timeout: 10000
  });
  if (result.error && process.platform === 'win32') {
    const shell = findExecutable('sh.exe', process.env);
    if (shell) {
      const shellPath = command
        .replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`)
        .replaceAll('\\', '/');
      const script = [shellPath, ...args]
        .map((value) => `'${String(value).replaceAll("'", "'\\''")}'`)
        .join(' ');
      const fallback = spawnSync(shell, ['-c', script], { env, encoding: 'utf8', timeout: 10000 });
      return {
        ok: fallback.status === 0,
        status: fallback.status,
        stdout: String(fallback.stdout || ''),
        stderr: String(fallback.stderr || ''),
        error: fallback.error ? fallback.error.message : ''
      };
    }
  }
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error ? result.error.message : ''
  };
}

function commandStatus(command, args = ['--version'], env = process.env) {
  const executable = findExecutable(command, env);
  if (!executable) return { exists: false, path: '', version: '' };
  const result = run(executable, args, env);
  return {
    exists: true,
    path: executable,
    ok: result.ok,
    version: (result.stdout || result.stderr || '').trim().split('\n')[0] || '',
    status: result.status,
    error: result.error || result.stderr.trim()
  };
}

function lightpandaVersion(binaryPath, env = process.env) {
  if (!binaryPath || !executableExists(binaryPath)) return { ok: false, version: '' };
  const result = run(binaryPath, ['version'], {
    ...env,
    LIGHTPANDA_DISABLE_TELEMETRY: env.LIGHTPANDA_DISABLE_TELEMETRY || 'true'
  });
  return {
    ok: result.ok,
    version: (result.stdout || result.stderr || '').trim().split('\n')[0] || '',
    status: result.status,
    error: result.error || result.stderr.trim()
  };
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function parseMinimumZigVersion(cloneDir) {
  const zon = readText(path.join(cloneDir, 'build.zig.zon'));
  return zon.match(/\.minimum_zig_version\s*=\s*"([^"]+)"/)?.[1] || '';
}

function parseRepoVersion(cloneDir) {
  const zon = readText(path.join(cloneDir, 'build.zig.zon'));
  return zon.match(/\.version\s*=\s*"([^"]+)"/)?.[1] || '';
}

function parseGitHead(cloneDir) {
  const gitDir = path.join(cloneDir, '.git');
  const head = readText(path.join(gitDir, 'HEAD')).trim();
  if (!head) return '';
  const ref = head.match(/^ref:\s*(.+)$/)?.[1];
  const value = ref ? readText(path.join(gitDir, ref)).trim() : head;
  return value || '';
}

function parseGitRemoteOrigin(cloneDir) {
  const config = readText(path.join(cloneDir, '.git/config'));
  const originSection = config.match(/\[remote "origin"\]([\s\S]*?)(?:\n\[|$)/)?.[1] || '';
  return originSection.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim() || '';
}

function binaryDownloadFor(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') return `${NIGHTLY_RELEASE}/lightpanda-aarch64-macos`;
  if (platform === 'darwin' && arch === 'x64') return `${NIGHTLY_RELEASE}/lightpanda-x86_64-macos`;
  if (platform === 'linux' && arch === 'arm64') return `${NIGHTLY_RELEASE}/lightpanda-aarch64-linux`;
  if (platform === 'linux' && arch === 'x64') return `${NIGHTLY_RELEASE}/lightpanda-x86_64-linux`;
  return '';
}

function installCommands({ platform, arch, downloadUrl, destination }) {
  const commands = [];
  if (platform === 'darwin') {
    commands.push('brew install lightpanda-io/browser/lightpanda');
  }
  if (downloadUrl) {
    commands.push(`mkdir -p "${path.dirname(destination)}"`);
    commands.push(`curl -L -o "${destination}" "${downloadUrl}"`);
    commands.push(`chmod a+x "${destination}"`);
    commands.push(`LIGHTPANDA_DISABLE_TELEMETRY=true "${destination}" version`);
  }
  return commands;
}

export function buildLightpandaDoctor(options = {}) {
  const env = options.env || process.env;
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const configuredPath = env.SBA_LIGHTPANDA_PATH || '';
  const pathBinary = findExecutable('lightpanda', env);
  const binaryPath = configuredPath || pathBinary;
  const binaryExists = executableExists(binaryPath);
  const cloneDir = options.cloneDir || path.join(homeDir, 'src/lightpanda-io_browser');
  const cloneExists = fs.existsSync(cloneDir);
  const downloadUrl = binaryDownloadFor(platform, arch);
  const destination = options.destination || path.join(homeDir, '.local/bin/lightpanda');
  const version = lightpandaVersion(binaryPath, env);
  const zig = commandStatus('zig', ['version'], env);
  const cmake = commandStatus('cmake', ['--version'], env);
  const cargo = commandStatus('cargo', ['--version'], env);
  const rustc = commandStatus('rustc', ['--version'], env);

  const checks = [
    {
      name: 'binary.available',
      status: binaryExists ? 'pass' : 'manual-required',
      detail: binaryExists ? binaryPath : 'No executable found in SBA_LIGHTPANDA_PATH or PATH.'
    },
    {
      name: 'telemetry.disabled',
      status: env.LIGHTPANDA_DISABLE_TELEMETRY === 'true' ? 'pass' : 'recommend',
      detail: env.LIGHTPANDA_DISABLE_TELEMETRY === 'true'
        ? 'LIGHTPANDA_DISABLE_TELEMETRY=true'
        : 'Set LIGHTPANDA_DISABLE_TELEMETRY=true for repeatable local benchmarks.'
    },
    {
      name: 'source.clone',
      status: cloneExists ? 'pass' : 'missing',
      detail: cloneExists ? cloneDir : 'Local Lightpanda clone not found.'
    },
    {
      name: 'build.zig',
      status: zig.exists ? 'pass' : 'missing',
      detail: zig.exists ? `${zig.path} ${zig.version}` : 'Zig is not installed.'
    },
    {
      name: 'build.cmake',
      status: cmake.exists ? 'pass' : 'missing',
      detail: cmake.exists ? `${cmake.path} ${cmake.version}` : 'cmake is not installed.'
    },
    {
      name: 'build.rust',
      status: cargo.exists && rustc.exists ? 'pass' : 'missing',
      detail: cargo.exists && rustc.exists ? `${cargo.version}; ${rustc.version}` : 'cargo/rustc are not installed.'
    }
  ];

  const readyForPublicBenchmark = binaryExists && version.ok;
  const readyForSourceBuild = cloneExists && zig.exists && cmake.exists && cargo.exists && rustc.exists;
  const benchmarkCommand = binaryExists
    ? `LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="${binaryPath}" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json`
    : `LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="${destination}" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json`;

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    platform,
    arch,
    readyForPublicBenchmark,
    readyForSourceBuild,
    binary: {
      exists: binaryExists,
      path: binaryExists ? binaryPath : '',
      configuredPath,
      pathBinary,
      version: version.version,
      versionOk: version.ok,
      versionError: version.error || ''
    },
    source: {
      cloneExists,
      cloneDir,
      repoVersion: cloneExists ? parseRepoVersion(cloneDir) : '',
      minimumZigVersion: cloneExists ? parseMinimumZigVersion(cloneDir) : '',
      commit: cloneExists ? parseGitHead(cloneDir) : '',
      remoteOrigin: cloneExists ? parseGitRemoteOrigin(cloneDir) : ''
    },
    buildTools: { zig, cmake, cargo, rustc },
    download: {
      nightlyUrl: downloadUrl,
      destination,
      commands: installCommands({ platform, arch, downloadUrl, destination })
    },
    installPlanRequiresOperatorApproval: true,
    installPlanAgentMayRunUnattended: false,
    installPlanMutatesRuntime: true,
    benchmarkCommand,
    benchmarkRequiresOperatorApproval: false,
    benchmarkAgentMayRunUnattended: readyForPublicBenchmark,
    benchmarkStartsBrowser: true,
    benchmarkReadsBrowserStorage: false,
    benchmarkReturnsPageContent: false,
    checks,
    next: readyForPublicBenchmark
      ? [
          benchmarkCommand,
          'If Lightpanda passes the public URL benchmark, keep it public-profile only until target compatibility is proven.'
        ]
      : [
          'Install Lightpanda with Homebrew or download the nightly binary, then re-run lightpanda-doctor.',
          benchmarkCommand
        ]
  };
}

export function formatLightpandaDoctorMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Lightpanda Doctor',
    '',
    `Generated: ${report.generatedAt}`,
    `Platform: ${report.platform}/${report.arch}`,
    '',
    '## Summary',
    '',
    `- Ready for public benchmark: ${report.readyForPublicBenchmark ? 'yes' : 'no'}`,
    `- Ready to build from source: ${report.readyForSourceBuild ? 'yes' : 'no'}`,
    `- Binary: ${report.binary.exists ? report.binary.path : 'missing'}`,
    `- Version: ${report.binary.version || 'unknown'}`,
    `- Source clone: ${report.source.cloneExists ? report.source.cloneDir : 'missing'}`,
    `- Source commit: ${report.source.commit ? report.source.commit.slice(0, 12) : 'unknown'}`,
    `- Minimum Zig from clone: ${report.source.minimumZigVersion || 'unknown'}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Detail |',
    '| --- | --- | --- |'
  ];
  for (const check of report.checks) {
    lines.push(`| ${check.name} | ${check.status} | ${String(check.detail || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('', '## Install Plan', '');
  if (report.download.commands.length) {
    for (const command of report.download.commands) lines.push(`- \`${command}\``);
  } else {
    lines.push('- No binary download URL is known for this platform/arch.');
  }
  lines.push('', '## Benchmark', '');
  lines.push(`- \`${report.benchmarkCommand}\``);
  lines.push('', '## Next', '');
  for (const item of report.next) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

export function formatLightpandaDoctorCompact(report) {
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const statusFor = (name) => compact(checks.find((item) => item.name === name)?.status);
  const missingChecks = checks
    .filter((item) => ['missing', 'manual-required'].includes(item.status))
    .map((item) => item.name);
  const lines = [
    `ready_for_public_benchmark: ${yesNo(report.readyForPublicBenchmark)}`,
    `ready_for_source_build: ${yesNo(report.readyForSourceBuild)}`,
    `binary_exists: ${yesNo(report.binary?.exists)}`,
    `binary_configured: ${yesNo(Boolean(report.binary?.configuredPath))}`,
    `version_ok: ${yesNo(report.binary?.versionOk)}`,
    `binary_version_ok: ${yesNo(report.binary?.versionOk)}`,
    `source_clone_exists: ${yesNo(report.source?.cloneExists)}`,
    `source_repo_version: ${compact(report.source?.repoVersion)}`,
    `source_minimum_zig_version: ${compact(report.source?.minimumZigVersion)}`,
    `source_commit: ${compact(report.source?.commit ? report.source.commit.slice(0, 12) : '')}`,
    `source_remote_origin: ${compact(report.source?.remoteOrigin)}`,
    `telemetry_disabled: ${yesNo(statusFor('telemetry.disabled') === 'pass')}`,
    `zig_status: ${statusFor('build.zig')}`,
    `cmake_status: ${statusFor('build.cmake')}`,
    `rust_status: ${statusFor('build.rust')}`,
    `missing_checks: ${missingChecks.length ? missingChecks.join(',') : 'none'}`,
    `download_available: ${yesNo(Boolean(report.download?.nightlyUrl))}`,
    `install_command_count: ${report.download?.commands?.length ?? 0}`,
    `install_requires_operator_approval: ${yesNo(report.installPlanRequiresOperatorApproval)}`,
    `install_agent_may_run_unattended: ${yesNo(report.installPlanAgentMayRunUnattended)}`,
    `install_mutates_runtime: ${yesNo(report.installPlanMutatesRuntime)}`,
    `benchmark_command: ${compact(report.benchmarkCommand)}`,
    `benchmark_requires_operator_approval: ${yesNo(report.benchmarkRequiresOperatorApproval)}`,
    `benchmark_agent_may_run_unattended: ${yesNo(report.benchmarkAgentMayRunUnattended)}`,
    `benchmark_starts_browser: ${yesNo(report.benchmarkStartsBrowser)}`,
    `benchmark_reads_browser_storage: ${yesNo(report.benchmarkReadsBrowserStorage)}`,
    `benchmark_returns_page_content: ${yesNo(report.benchmarkReturnsPageContent)}`,
    `next: ${Array.isArray(report.next) && report.next.length ? report.next.map((item) => compact(item)).join(' | ') : 'none'}`
  ];
  if (report.binary?.path) lines.push(`binary_path: ${report.binary.path}`);
  if (report.download?.destination) lines.push(`download_destination: ${report.download.destination}`);
  return `${lines.join('\n')}\n`;
}
