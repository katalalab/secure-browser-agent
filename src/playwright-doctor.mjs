import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { toPosixPath } from './output.mjs';

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

function fileExists(filePath) {
  if (!filePath) return false;
  try {
    return fs.statSync(filePath).isFile();
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

function packageVersion(packageJson) {
  try {
    return JSON.parse(fs.readFileSync(packageJson, 'utf8')).version || '';
  } catch {
    return '';
  }
}

function publicSmokeProofStatus(rootDir) {
  const proofPath = path.join(rootDir, 'runs/provider-benchmarks/playwright-public-smoke.json');
  if (!fileExists(proofPath)) {
    return {
      exists: false,
      ok: false,
      path: toPosixPath(path.relative(rootDir, proofPath)),
      headingCount: 0,
      linkCount: 0,
      error: ''
    };
  }
  try {
    const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    const headingCount = Array.isArray(proof.headings) ? proof.headings.length : 0;
    const linkCount = Array.isArray(proof.links) ? proof.links.length : 0;
    return {
      exists: true,
      ok: headingCount > 0 || linkCount > 0 || Boolean(proof.title),
      path: toPosixPath(path.relative(rootDir, proofPath)),
      headingCount,
      linkCount,
      error: ''
    };
  } catch (error) {
    return {
      exists: true,
      ok: false,
      path: toPosixPath(path.relative(rootDir, proofPath)),
      headingCount: 0,
      linkCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function chromeForTestingCandidates(homeDir, env) {
  const candidates = [];
  if (env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) candidates.push(env.PLAYWRIGHT_CHROMIUM_EXECUTABLE);
  const browserRoot = path.join(homeDir, '.agent-browser/browsers');
  try {
    for (const name of fs.readdirSync(browserRoot).filter((item) => item.startsWith('chrome-')).sort().reverse()) {
      candidates.push(path.join(browserRoot, name, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    }
  } catch {
    // Missing agent-browser cache is reported as a failed check below.
  }
  return candidates;
}

function findChromeForTesting(homeDir, env) {
  const configuredPath = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '';
  for (const candidate of chromeForTestingCandidates(homeDir, env)) {
    if (executableExists(candidate)) {
      return {
        exists: true,
        path: candidate,
        configuredPath,
        configuredExists: configuredPath ? candidate === configuredPath : false
      };
    }
  }
  return {
    exists: false,
    path: '',
    configuredPath,
    configuredExists: false
  };
}

function packageCandidate(rootDir, packageJson) {
  return {
    packageJson,
    index: path.join(path.dirname(packageJson), 'index.js'),
    rootDir
  };
}

export function buildPlaywrightDoctor(options = {}) {
  const env = options.env || process.env;
  const rootDir = options.rootDir || process.cwd();
  const siblingRootDir = options.siblingRootDir || path.resolve(rootDir, '../playwright-mcp');
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const configuredCorePath = env.PLAYWRIGHT_CORE_PATH || '';
  const packageCandidates = [
    packageCandidate(rootDir, path.join(rootDir, 'node_modules/playwright-core/package.json')),
    packageCandidate(siblingRootDir, path.join(siblingRootDir, 'node_modules/playwright-core/package.json'))
  ];
  const configuredCoreExists = fileExists(configuredCorePath);
  const packageInfo = packageCandidates.find((candidate) => fileExists(candidate.packageJson)) || null;
  const coreIndexPath = configuredCoreExists ? configuredCorePath : (packageInfo?.index || '');
  const corePackageExists = Boolean(packageInfo);
  const coreIndexExists = fileExists(coreIndexPath);
  const chromeForTesting = findChromeForTesting(homeDir, env);
  const node = commandStatus('node', ['--version'], env);
  const npm = commandStatus('npm', ['--version'], env);
  const coreVersion = packageInfo ? packageVersion(packageInfo.packageJson) : '';
  const readyForPublicSmoke = coreIndexExists && chromeForTesting.exists;
  const readyForAuthenticatedDefault = false;

  const checks = [
    {
      name: 'package.playwright-core',
      status: corePackageExists || configuredCoreExists ? 'pass' : 'missing',
      detail: corePackageExists
        ? `${packageInfo.packageJson} ${coreVersion}`
        : (configuredCoreExists ? configuredCorePath : 'playwright-core package not found locally or in sibling playwright-mcp.')
    },
    {
      name: 'core.index',
      status: coreIndexExists ? 'pass' : 'missing',
      detail: coreIndexExists ? coreIndexPath : 'playwright-core index.js not found; set PLAYWRIGHT_CORE_PATH or install playwright-core.'
    },
    {
      name: 'browser.chrome-for-testing',
      status: chromeForTesting.exists ? 'pass' : 'missing',
      detail: chromeForTesting.exists ? chromeForTesting.path : 'Chrome for Testing not found in PLAYWRIGHT_CHROMIUM_EXECUTABLE or ~/.agent-browser/browsers.'
    },
    {
      name: 'runtime.node',
      status: node.exists && npm.exists ? 'pass' : 'missing',
      detail: node.exists && npm.exists ? `${node.version}; npm ${npm.version}` : 'node/npm are required for local Playwright package installation.'
    },
    {
      name: 'auth.storage-state-boundary',
      status: 'manual-required',
      detail: 'Playwright storageState can contain cookies/tokens; do not make it the authenticated default without an explicit target pack and operator approval.'
    }
  ];

  const installCommands = [
    'npm install --save-dev playwright-core',
    'node src/cli.mjs playwright-doctor --format compact'
  ];
  const smokeCommand = "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'";
  const smokeProofCommand = "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>' --out provider-benchmarks/playwright-public-smoke.json";
  const publicSmokeProof = publicSmokeProofStatus(rootDir);

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    platform,
    arch,
    role: 'test-rich-automation-adapter',
    readyForPublicSmoke,
    readyForAuthenticatedDefault,
    storageStateSensitive: true,
    core: {
      packageExists: corePackageExists,
      packageJson: packageInfo?.packageJson || '',
      packageRootDir: packageInfo?.rootDir || '',
      indexExists: coreIndexExists,
      indexPath: coreIndexExists ? coreIndexPath : '',
      configuredPath: configuredCorePath,
      configuredPathExists: configuredCoreExists,
      version: coreVersion
    },
    browser: {
      chromeForTesting
    },
    runtime: {
      node,
      npm
    },
    checks,
    installCommands,
    installPlanRequiresOperatorApproval: true,
    installPlanAgentMayRunUnattended: false,
    installPlanMutatesRuntime: true,
    smokeCommand,
    smokeRequiresOperatorApproval: false,
    smokeAgentMayRunUnattended: readyForPublicSmoke,
    smokeStartsBrowser: true,
    smokeReadsBrowserStorage: false,
    smokeReturnsPageContent: false,
    smokeProofCommand,
    smokeProofAgentMayRunUnattended: readyForPublicSmoke,
    smokeProofStartsBrowser: true,
    smokeProofReadsBrowserStorage: false,
    smokeProofReturnsPageContent: false,
    publicSmokeProof,
    next: readyForPublicSmoke
      ? [
          publicSmokeProof.ok ? 'Playwright public smoke proof is saved under runs/provider-benchmarks.' : smokeProofCommand,
          'Keep Playwright in the public smoke / structured testing lane; direct CDP remains the authenticated default.'
        ]
      : [
          'Install playwright-core or expose PLAYWRIGHT_CORE_PATH, and provide Chrome for Testing before running Playwright smoke checks.',
          ...installCommands
        ]
  };
}

export function formatPlaywrightDoctorMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Playwright Doctor',
    '',
    `Generated: ${report.generatedAt}`,
    `Platform: ${report.platform}/${report.arch}`,
    '',
    '## Summary',
    '',
    `- Role: ${report.role}`,
    `- Ready for public smoke: ${report.readyForPublicSmoke ? 'yes' : 'no'}`,
    `- Ready for authenticated default: ${report.readyForAuthenticatedDefault ? 'yes' : 'no'}`,
    `- Storage state sensitive: ${report.storageStateSensitive ? 'yes' : 'no'}`,
    `- playwright-core: ${report.core.packageExists ? `${report.core.version} at ${report.core.packageJson}` : 'missing'}`,
    `- core index: ${report.core.indexExists ? report.core.indexPath : 'missing'}`,
    `- Chrome for Testing: ${report.browser.chromeForTesting.exists ? report.browser.chromeForTesting.path : 'missing'}`,
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
  for (const command of report.installCommands) lines.push(`- \`${command}\``);
  lines.push('', '## Smoke', '');
  lines.push(`- \`${report.smokeCommand}\``);
  lines.push(`- Proof command: \`${report.smokeProofCommand}\``);
  lines.push(`- Saved proof: ${report.publicSmokeProof?.ok ? report.publicSmokeProof.path : 'missing'}`);
  lines.push('', '## Next', '');
  for (const item of report.next) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

export function formatPlaywrightDoctorCompact(report) {
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const statusFor = (name) => compact(checks.find((item) => item.name === name)?.status);
  const missing = checks
    .filter((item) => ['missing', 'manual-required'].includes(item.status))
    .map((item) => item.name);
  const lines = [
    `role: ${compact(report.role)}`,
    `ready_for_public_smoke: ${yesNo(report.readyForPublicSmoke)}`,
    `ready_for_authenticated_default: ${yesNo(report.readyForAuthenticatedDefault)}`,
    `core_package_exists: ${yesNo(report.core?.packageExists)}`,
    `core_index_exists: ${yesNo(report.core?.indexExists)}`,
    `core_version: ${compact(report.core?.version)}`,
    `configured_core_path_exists: ${yesNo(report.core?.configuredPathExists)}`,
    `chrome_for_testing_exists: ${yesNo(report.browser?.chromeForTesting?.exists)}`,
    `storage_state_sensitive: ${yesNo(report.storageStateSensitive)}`,
    `package_playwright_core_status: ${statusFor('package.playwright-core')}`,
    `core_index_status: ${statusFor('core.index')}`,
    `chrome_for_testing_status: ${statusFor('browser.chrome-for-testing')}`,
    `runtime_node_status: ${statusFor('runtime.node')}`,
    `auth_storage_state_boundary_status: ${statusFor('auth.storage-state-boundary')}`,
    `missing_checks: ${missing.length ? missing.join(',') : 'none'}`,
    `install_requires_operator_approval: ${yesNo(report.installPlanRequiresOperatorApproval)}`,
    `install_agent_may_run_unattended: ${yesNo(report.installPlanAgentMayRunUnattended)}`,
    `install_mutates_runtime: ${yesNo(report.installPlanMutatesRuntime)}`,
    `smoke_command: ${compact(report.smokeCommand)}`,
    `smoke_requires_operator_approval: ${yesNo(report.smokeRequiresOperatorApproval)}`,
    `smoke_agent_may_run_unattended: ${yesNo(report.smokeAgentMayRunUnattended)}`,
    `smoke_starts_browser: ${yesNo(report.smokeStartsBrowser)}`,
    `smoke_reads_browser_storage: ${yesNo(report.smokeReadsBrowserStorage)}`,
    `smoke_returns_page_content: ${yesNo(report.smokeReturnsPageContent)}`,
    `public_smoke_proof_exists: ${yesNo(report.publicSmokeProof?.exists)}`,
    `public_smoke_proof_ok: ${yesNo(report.publicSmokeProof?.ok)}`,
    `public_smoke_proof_heading_count: ${report.publicSmokeProof?.headingCount ?? 0}`,
    `public_smoke_proof_link_count: ${report.publicSmokeProof?.linkCount ?? 0}`,
    `smoke_proof_command: ${compact(report.smokeProofCommand)}`,
    `smoke_proof_agent_may_run_unattended: ${yesNo(report.smokeProofAgentMayRunUnattended)}`,
    `smoke_proof_starts_browser: ${yesNo(report.smokeProofStartsBrowser)}`,
    `smoke_proof_reads_browser_storage: ${yesNo(report.smokeProofReadsBrowserStorage)}`,
    `smoke_proof_returns_page_content: ${yesNo(report.smokeProofReturnsPageContent)}`
  ];
  if (report.publicSmokeProof?.path) lines.push(`public_smoke_proof_path: ${report.publicSmokeProof.path}`);
  if (report.publicSmokeProof?.error) lines.push(`public_smoke_proof_error: ${compact(report.publicSmokeProof.error)}`);
  if (report.core?.packageJson) lines.push(`core_package_json: ${report.core.packageJson}`);
  if (report.core?.indexPath) lines.push(`core_index_path: ${report.core.indexPath}`);
  if (report.core?.configuredPath) lines.push(`configured_core_path: ${report.core.configuredPath}`);
  if (report.browser?.chromeForTesting?.path) lines.push(`chrome_for_testing_path: ${report.browser.chromeForTesting.path}`);
  if (report.runtime?.node?.version) lines.push(`node_version: ${report.runtime.node.version}`);
  if (report.runtime?.npm?.version) lines.push(`npm_version: ${report.runtime.npm.version}`);
  return `${lines.join('\n')}\n`;
}
