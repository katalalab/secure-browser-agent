import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function configuredExecutable(command, configuredPath, env) {
  const candidate = configuredPath || findExecutable(command, env);
  if (!candidate) return { exists: false, path: '', configuredPath, configuredExists: false };
  const exists = executableExists(candidate);
  return {
    exists,
    path: exists ? candidate : '',
    configuredPath,
    configuredExists: configuredPath ? exists : false
  };
}

export function buildSeleniumDoctor(options = {}) {
  const env = options.env || process.env;
  const rootDir = options.rootDir || process.cwd();
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const seleniumPackageJson = options.seleniumPackageJson || path.join(rootDir, 'node_modules/selenium-webdriver/package.json');
  const webdriverPackageExists = fs.existsSync(seleniumPackageJson);
  const seleniumVersion = webdriverPackageExists ? packageVersion(seleniumPackageJson) : '';
  const chromedriver = configuredExecutable('chromedriver', env.SBA_CHROMEDRIVER_PATH || '', env);
  const geckodriver = configuredExecutable('geckodriver', env.SBA_GECKODRIVER_PATH || '', env);
  const seleniumManager = commandStatus('selenium-manager', ['--version'], env);
  const seleniumServer = configuredExecutable('selenium-server', env.SBA_SELENIUM_SERVER_PATH || '', env);
  const java = commandStatus('java', ['-version'], env);
  const node = commandStatus('node', ['--version'], env);
  const npm = commandStatus('npm', ['--version'], env);

  const localDriverReady = webdriverPackageExists && chromedriver.exists;
  const gridReady = seleniumServer.exists && java.ok;
  const bidiCandidate = webdriverPackageExists && (chromedriver.exists || seleniumManager.exists || gridReady);
  const readyForLocalSmoke = localDriverReady || gridReady;

  const checks = [
    {
      name: 'package.selenium-webdriver',
      status: webdriverPackageExists ? 'pass' : 'missing',
      detail: webdriverPackageExists ? `${seleniumPackageJson} ${seleniumVersion}` : 'node_modules/selenium-webdriver/package.json not found.'
    },
    {
      name: 'driver.chromedriver',
      status: chromedriver.exists ? 'pass' : 'missing',
      detail: chromedriver.exists ? chromedriver.path : 'chromedriver not found in SBA_CHROMEDRIVER_PATH or PATH.'
    },
    {
      name: 'driver.geckodriver',
      status: geckodriver.exists ? 'pass' : 'optional',
      detail: geckodriver.exists ? geckodriver.path : 'geckodriver not found; only needed for Firefox compatibility checks.'
    },
    {
      name: 'selenium-manager',
      status: seleniumManager.exists ? 'pass' : 'optional',
      detail: seleniumManager.exists ? `${seleniumManager.path} ${seleniumManager.version}` : 'selenium-manager not found on PATH.'
    },
    {
      name: 'grid.selenium-server',
      status: seleniumServer.exists ? 'pass' : 'optional',
      detail: seleniumServer.exists ? seleniumServer.path : 'SBA_SELENIUM_SERVER_PATH or selenium-server executable not found.'
    },
    {
      name: 'grid.java',
      status: java.ok ? 'pass' : 'optional',
      detail: java.ok ? `${java.path} ${java.version}` : (java.exists ? `${java.path} ${java.error || java.version || 'java -version failed'}` : 'java not found; only needed for standalone Selenium Server/Grid.')
    },
    {
      name: 'runtime.node',
      status: node.exists && npm.exists ? 'pass' : 'missing',
      detail: node.exists && npm.exists ? `${node.version}; npm ${npm.version}` : 'node/npm are required for selenium-webdriver package installation.'
    }
  ];

  const installCommands = [
    'npm install --save-dev selenium-webdriver',
    'brew install chromedriver',
    'node src/cli.mjs selenium-doctor --format compact'
  ];
  const smokeCommand = 'node src/cli.mjs selenium-doctor --format compact';

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    platform,
    arch,
    role: 'compatibility-bridge',
    readyForLocalSmoke,
    localDriverReady,
    gridReady,
    bidiCandidate,
    package: {
      exists: webdriverPackageExists,
      path: webdriverPackageExists ? seleniumPackageJson : '',
      version: seleniumVersion
    },
    drivers: {
      chromedriver,
      geckodriver,
      seleniumManager
    },
    grid: {
      seleniumServer,
      java
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
    smokeAgentMayRunUnattended: true,
    smokeStartsBrowser: false,
    next: readyForLocalSmoke
      ? [
          smokeCommand,
          'Keep Selenium as a compatibility bridge; do not make it the authenticated default unless an existing Grid/WebDriver estate requires it.'
        ]
      : [
          'Install selenium-webdriver and a browser driver only if WebDriver/BiDi compatibility testing is required.',
          ...installCommands
        ]
  };
}

export function formatSeleniumDoctorMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Selenium Doctor',
    '',
    `Generated: ${report.generatedAt}`,
    `Platform: ${report.platform}/${report.arch}`,
    '',
    '## Summary',
    '',
    `- Role: ${report.role}`,
    `- Ready for local smoke: ${report.readyForLocalSmoke ? 'yes' : 'no'}`,
    `- Local driver ready: ${report.localDriverReady ? 'yes' : 'no'}`,
    `- Grid ready: ${report.gridReady ? 'yes' : 'no'}`,
    `- WebDriver BiDi candidate: ${report.bidiCandidate ? 'yes' : 'no'}`,
    `- selenium-webdriver: ${report.package.exists ? `${report.package.version} at ${report.package.path}` : 'missing'}`,
    `- chromedriver: ${report.drivers.chromedriver.exists ? report.drivers.chromedriver.path : 'missing'}`,
    `- selenium-manager: ${report.drivers.seleniumManager.exists ? report.drivers.seleniumManager.path : 'missing'}`,
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
  lines.push('', '## Next', '');
  for (const item of report.next) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

export function formatSeleniumDoctorCompact(report) {
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const statusFor = (name) => compact(checks.find((item) => item.name === name)?.status);
  const missingChecks = checks
    .filter((item) => ['missing', 'manual-required'].includes(item.status))
    .map((item) => item.name);
  const lines = [
    `role: ${compact(report.role)}`,
    `ready_for_local_smoke: ${yesNo(report.readyForLocalSmoke)}`,
    `local_driver_ready: ${yesNo(report.localDriverReady)}`,
    `grid_ready: ${yesNo(report.gridReady)}`,
    `bidi_candidate: ${yesNo(report.bidiCandidate)}`,
    `selenium_webdriver_exists: ${yesNo(report.package?.exists)}`,
    `selenium_webdriver_present: ${yesNo(report.package?.exists)}`,
    `selenium_webdriver_version: ${compact(report.package?.version)}`,
    `chromedriver_present: ${yesNo(report.drivers?.chromedriver?.exists)}`,
    `geckodriver_present: ${yesNo(report.drivers?.geckodriver?.exists)}`,
    `selenium_manager_present: ${yesNo(report.drivers?.seleniumManager?.exists)}`,
    `selenium_server_present: ${yesNo(report.grid?.seleniumServer?.exists)}`,
    `java_status: ${statusFor('grid.java')}`,
    `node_status: ${statusFor('runtime.node')}`,
    `missing_checks: ${missingChecks.length ? missingChecks.join(',') : 'none'}`,
    `install_command_count: ${report.installCommands?.length ?? 0}`,
    `install_requires_operator_approval: ${yesNo(report.installPlanRequiresOperatorApproval)}`,
    `install_agent_may_run_unattended: ${yesNo(report.installPlanAgentMayRunUnattended)}`,
    `install_mutates_runtime: ${yesNo(report.installPlanMutatesRuntime)}`,
    `smoke_command: ${compact(report.smokeCommand)}`,
    `smoke_requires_operator_approval: ${yesNo(report.smokeRequiresOperatorApproval)}`,
    `smoke_agent_may_run_unattended: ${yesNo(report.smokeAgentMayRunUnattended)}`,
    `smoke_starts_browser: ${yesNo(report.smokeStartsBrowser)}`,
    `next: ${Array.isArray(report.next) && report.next.length ? report.next.map((item) => compact(item)).join(' | ') : 'none'}`
  ];
  if (report.package?.path) lines.push(`selenium_webdriver_path: ${report.package.path}`);
  if (report.drivers?.chromedriver?.path) lines.push(`chromedriver_path: ${report.drivers.chromedriver.path}`);
  return `${lines.join('\n')}\n`;
}
