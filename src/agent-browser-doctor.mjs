import { detectProviderStatus } from './provider-report.mjs';

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

export function buildAgentBrowserDoctor(options = {}) {
  const status = options.status || detectProviderStatus(options);
  const agentBrowser = status.agentBrowser || {};
  const chromeForTesting = status.chromeForTesting || {};
  const cliExists = Boolean(agentBrowser.exists);
  const chromeForTestingExists = Boolean(chromeForTesting.exists);
  const missingChecks = [
    ...(!cliExists ? ['cli.agent-browser'] : []),
    ...(!chromeForTestingExists ? ['browser.chrome-for-testing-cache'] : [])
  ];
  const readyForEngineUse = cliExists && chromeForTestingExists;
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    cli: {
      exists: cliExists,
      path: agentBrowser.path || '',
      version: agentBrowser.version || '',
      ok: Boolean(agentBrowser.ok)
    },
    chromeForTesting: {
      exists: chromeForTestingExists,
      path: chromeForTesting.path || ''
    },
    readyForEngineUse,
    missingChecks,
    next: missingChecks.length
      ? 'install-agent-browser-cli-or-run-agent-browser-install-before-engine-use'
      : 'agent-browser-engine-ready-for-explicit-benchmark',
    installPlanRequiresOperatorApproval: true,
    installPlanAgentMayRunUnattended: false,
    installPlanMutatesRuntime: true,
    commands: {
      doctor: 'node src/cli.mjs agent-browser-doctor --format compact',
      cliDoctor: 'command -v agent-browser && agent-browser --version',
      installPlan: 'npm i -g agent-browser && agent-browser install',
      providers: 'node src/cli.mjs providers --format compact',
      providerDoctorStatus: 'node src/cli.mjs provider-doctor-status --format compact'
    }
  };
}

export function formatAgentBrowserDoctorCompact(report) {
  const missingChecks = report.missingChecks || [];
  const lines = [
    `safe_mode: ${yesNo(report.safeMode)}`,
    `status_only: ${yesNo(report.statusOnly)}`,
    `destructive_actions: ${yesNo(report.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(report.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(report.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(report.startsCaptureNow)}`,
    `reads_browser_storage: ${yesNo(report.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(report.pageContentReturned)}`,
    `agent_browser_cli_exists: ${yesNo(report.cli?.exists)}`,
    `agent_browser_cli_ok: ${yesNo(report.cli?.ok)}`,
    `agent_browser_chrome_for_testing_exists: ${yesNo(report.chromeForTesting?.exists)}`,
    `agent_browser_ready_for_engine_use: ${yesNo(report.readyForEngineUse)}`,
    `agent_browser_missing_checks: ${missingChecks.length ? missingChecks.join(',') : 'none'}`,
    `agent_browser_next: ${compact(report.next)}`,
    `agent_browser_doctor_command: ${compact(report.commands?.doctor)}`,
    `agent_browser_cli_doctor_command: ${compact(report.commands?.cliDoctor)}`,
    `agent_browser_install_plan_command: ${compact(report.commands?.installPlan)}`,
    `agent_browser_install_requires_operator_approval: ${yesNo(report.installPlanRequiresOperatorApproval)}`,
    `agent_browser_install_agent_may_run_unattended: ${yesNo(report.installPlanAgentMayRunUnattended)}`,
    `agent_browser_install_mutates_runtime: ${yesNo(report.installPlanMutatesRuntime)}`,
    `providers_command: ${compact(report.commands?.providers)}`,
    `provider_doctor_status_command: ${compact(report.commands?.providerDoctorStatus)}`
  ];
  if (report.cli?.path) lines.push(`agent_browser_cli_path: ${report.cli.path}`);
  if (report.cli?.version) lines.push(`agent_browser_version: ${report.cli.version}`);
  if (report.chromeForTesting?.path) lines.push(`agent_browser_chrome_for_testing_path: ${report.chromeForTesting.path}`);
  return `${lines.join('\n')}\n`;
}
