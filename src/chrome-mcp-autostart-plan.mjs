import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function plistEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function plistArray(values) {
  return values.map((value) => `    <string>${plistEscape(value)}</string>`).join('\n');
}

function buildLaunchAgentPlist({ label, programArguments, stdoutPath, stderrPath }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
${plistArray(programArguments)}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${plistEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(stderrPath)}</string>
</dict>
</plist>
`;
}

function parseYes(value) {
  return value === true || String(value || '').toLowerCase() === 'yes' || String(value || '').toLowerCase() === 'true';
}

function currentUid() {
  if (typeof process.getuid === 'function') return process.getuid();
  return Number(process.env.UID || 0);
}

function safeLabel(value) {
  const label = String(value || 'local.secure-browser-agent.chrome-devtools-mcp')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!label) throw new Error('chrome-mcp-autostart-plan label is required');
  return label;
}

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir || process.cwd(), 'runs');
  const relative = String(outPath || 'operator/chrome-mcp-autostart-plan-latest.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid Chrome MCP autostart output path: ${outPath}`);
  return outputPath;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, parseOk: false, value: null, error: '' };
  try {
    return {
      exists: true,
      parseOk: true,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
      error: ''
    };
  } catch (error) {
    return {
      exists: true,
      parseOk: false,
      value: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function buildChromeMcpAutostartPlan(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const label = safeLabel(options.label);
  const browserUrl = String(options.browserUrl || options['browser-url'] || 'http://127.0.0.1:9223').trim();
  const headless = parseYes(options.headless);
  const packageSpec = String(options.packageSpec || options.package || 'chrome-devtools-mcp@latest').trim();
  const npxCommand = String(options.npx || 'npx').trim();
  const uid = Number(options.uid || currentUid());
  const domain = `gui/${uid}`;
  const serviceTarget = `${domain}/${label}`;
  const localDir = path.resolve(rootDir, 'runs', 'operator', 'launchd');
  const installPath = options.installPath
    ? path.resolve(options.installPath)
    : path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const plistPath = options.plist
    ? safeRunPath(rootDir, options.plist)
    : path.join(localDir, `${label}.plist`);
  const stdoutPath = path.join(localDir, `${label}.out.log`);
  const stderrPath = path.join(localDir, `${label}.err.log`);
  const programArguments = [npxCommand, '-y', packageSpec];
  if (browserUrl) programArguments.push('--browserUrl', browserUrl);
  if (headless) programArguments.push('--headless');
  const plist = buildLaunchAgentPlist({ label, programArguments, stdoutPath, stderrPath });
  const plan = {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    statusOnly: !options.write,
    destructiveActions: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    startsBackgroundNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    target: 'chrome-devtools-mcp',
    action: options.write ? 'write' : 'plan',
    label,
    browserUrl,
    headless,
    packageSpec,
    npxCommand,
    uid,
    domain,
    serviceTarget,
    plistPath,
    installPath,
    stdoutPath,
    stderrPath,
    programArguments,
    plist,
    officialDocs: [
      'https://www.npmjs.com/package/chrome-devtools-mcp',
      'https://developer.chrome.com/docs/devtools/agents/get-started'
    ],
    securityBoundary: {
      requiresOperatorApprovalToInstall: true,
      agentMayInstallUnattended: false,
      connectsToExistingDebugChromeByDefault: Boolean(browserUrl),
      readsSecrets: false,
      readsCookies: false,
      exposesBrowserContentToAuthorizedMcpClient: true
    },
    commands: {
      write: command([
        'node', 'src/cli.mjs', 'chrome-mcp-autostart-plan',
        '--write',
        '--out', 'operator/chrome-mcp-autostart-plan-latest.json',
        '--format', 'compact'
      ]),
      install: command(['cp', plistPath, installPath]),
      load: command(['launchctl', 'bootstrap', domain, installPath]),
      unload: command(['launchctl', 'bootout', serviceTarget]),
      status: command(['launchctl', 'print', serviceTarget]),
      remove: command(['rm', '-f', installPath])
    }
  };
  if (options.write) {
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.mkdirSync(path.dirname(stdoutPath), { recursive: true });
    fs.writeFileSync(plistPath, plist, 'utf8');
    const outputPath = safeRunPath(rootDir, options.out || 'operator/chrome-mcp-autostart-plan-latest.json');
    plan.outputPath = outputPath;
    plan.wrotePlist = true;
    plan.wroteJson = true;
    writeJson(outputPath, plan);
  }
  return plan;
}

export function buildChromeMcpAutostartPlanStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputPath = safeRunPath(rootDir, options.in || options.input || 'operator/chrome-mcp-autostart-plan-latest.json');
  const saved = readJson(inputPath);
  const plan = saved.value || {};
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    statusOnly: true,
    destructiveActions: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    startsBackgroundNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    inputPath,
    exists: saved.exists,
    parseOk: saved.parseOk,
    error: saved.error,
    label: plan.label || '',
    browserUrl: plan.browserUrl || '',
    plistPath: plan.plistPath || '',
    installPath: plan.installPath || '',
    plistExists: Boolean(plan.plistPath && fs.existsSync(plan.plistPath)),
    installPathExists: Boolean(plan.installPath && fs.existsSync(plan.installPath)),
    installRequiresOperatorApproval: true,
    agentMayInstallUnattended: false,
    statusCommand: plan.commands?.status || null,
    refreshCommand: command([
      'node', 'src/cli.mjs', 'chrome-mcp-autostart-plan',
      '--write',
      '--out', 'operator/chrome-mcp-autostart-plan-latest.json',
      '--format', 'compact'
    ])
  };
}

export function formatChromeMcpAutostartPlanCompact(plan) {
  return [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `status_only: ${yesNo(plan.statusOnly)}`,
    `destructive_actions: ${yesNo(plan.destructiveActions)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(plan.startsCaptureNow)}`,
    `starts_background_now: ${yesNo(plan.startsBackgroundNow)}`,
    `reads_browser_storage: ${yesNo(plan.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(plan.pageContentReturned)}`,
    `label: ${clean(plan.label)}`,
    `browser_url: ${clean(plan.browserUrl)}`,
    `headless: ${yesNo(plan.headless)}`,
    `package_spec: ${clean(plan.packageSpec)}`,
    `plist_path: ${clean(plan.plistPath)}`,
    `install_path: ${clean(plan.installPath)}`,
    `connects_to_existing_debug_chrome_by_default: ${yesNo(plan.securityBoundary?.connectsToExistingDebugChromeByDefault)}`,
    `install_requires_operator_approval: ${yesNo(plan.securityBoundary?.requiresOperatorApprovalToInstall)}`,
    `install_mutates_runtime: yes`,
    `install_agent_may_run_unattended: no`,
    `load_starts_background: yes`,
    `load_mutates_runtime: yes`,
    `load_requires_operator_approval: yes`,
    `load_agent_may_run_unattended: no`,
    `unload_mutates_runtime: yes`,
    `unload_requires_operator_approval: yes`,
    `unload_agent_may_run_unattended: no`,
    `remove_mutates_runtime: yes`,
    `remove_requires_operator_approval: yes`,
    `remove_agent_may_run_unattended: no`,
    `agent_may_install_unattended: ${yesNo(plan.securityBoundary?.agentMayInstallUnattended)}`,
    `exposes_browser_content_to_authorized_mcp_client: ${yesNo(plan.securityBoundary?.exposesBrowserContentToAuthorizedMcpClient)}`,
    `write_command: ${plan.commands?.write?.shell || 'none'}`,
    `install_command: ${plan.commands?.install?.shell || 'none'}`,
    `load_command: ${plan.commands?.load?.shell || 'none'}`,
    `unload_command: ${plan.commands?.unload?.shell || 'none'}`,
    `status_command: ${plan.commands?.status?.shell || 'none'}`,
    `remove_command: ${plan.commands?.remove?.shell || 'none'}`
  ].join('\n') + '\n';
}

export function formatChromeMcpAutostartPlanStatusCompact(status) {
  return [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `status_only: ${yesNo(status.statusOnly)}`,
    `destructive_actions: ${yesNo(status.destructiveActions)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(status.startsCaptureNow)}`,
    `starts_background_now: ${yesNo(status.startsBackgroundNow)}`,
    `reads_browser_storage: ${yesNo(status.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(status.pageContentReturned)}`,
    `exists: ${yesNo(status.exists)}`,
    `parse_ok: ${yesNo(status.parseOk)}`,
    `error: ${clean(status.error)}`,
    `label: ${clean(status.label)}`,
    `browser_url: ${clean(status.browserUrl)}`,
    `plist_path: ${clean(status.plistPath)}`,
    `install_path: ${clean(status.installPath)}`,
    `plist_exists: ${yesNo(status.plistExists)}`,
    `install_path_exists: ${yesNo(status.installPathExists)}`,
    `install_requires_operator_approval: ${yesNo(status.installRequiresOperatorApproval)}`,
    `agent_may_install_unattended: ${yesNo(status.agentMayInstallUnattended)}`,
    `status_command: ${status.statusCommand?.shell || 'none'}`,
    `refresh_command: ${status.refreshCommand?.shell || 'none'}`
  ].join('\n') + '\n';
}
