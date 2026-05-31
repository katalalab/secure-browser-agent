import fs from 'node:fs';
import path from 'node:path';
import { buildLightpandaDoctor } from './lightpanda-doctor.mjs';
import { buildPlaywrightDoctor } from './playwright-doctor.mjs';
import { buildProviderReport } from './provider-report.mjs';
import { buildSeleniumDoctor } from './selenium-doctor.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function missingCheckNames(report) {
  return (Array.isArray(report?.checks) ? report.checks : [])
    .filter((check) => ['missing', 'manual-required'].includes(check.status))
    .map((check) => check.name);
}

function publicBenchmarkProofStatus(rootDir) {
  const proofPath = path.join(rootDir, 'runs/provider-benchmarks/default-public.json');
  try {
    const report = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    const results = Array.isArray(report.results) ? report.results : [];
    const byProvider = new Map(results.map((item) => [item.provider, item]));
    return {
      exists: true,
      ok: results.some((item) => item.ok),
      path: proofPath,
      fastestMeasuredProvider: report.recommendation?.fastestMeasuredProvider || '',
      directCdpColdOk: Boolean(byProvider.get('direct-cdp-cold')?.ok),
      directCdpDaemonOk: Boolean(byProvider.get('direct-cdp-daemon')?.ok),
      agentBrowserChromeOk: Boolean(byProvider.get('agent-browser-chrome')?.ok),
      playwrightOk: Boolean(byProvider.get('playwright')?.ok),
      lightpandaSkipped: Boolean(byProvider.get('lightpanda')?.skipped),
      seleniumSkipped: Boolean(byProvider.get('selenium')?.skipped),
      directCdpDaemonMeanMs: byProvider.get('direct-cdp-daemon')?.meanMs ?? 0,
      agentBrowserChromeMeanMs: byProvider.get('agent-browser-chrome')?.meanMs ?? 0,
      playwrightMeanMs: byProvider.get('playwright')?.meanMs ?? 0,
      error: ''
    };
  } catch (error) {
    return {
      exists: false,
      ok: false,
      path: proofPath,
      fastestMeasuredProvider: '',
      directCdpColdOk: false,
      directCdpDaemonOk: false,
      agentBrowserChromeOk: false,
      playwrightOk: false,
      lightpandaSkipped: false,
      seleniumSkipped: false,
      directCdpDaemonMeanMs: 0,
      agentBrowserChromeMeanMs: 0,
      playwrightMeanMs: 0,
      error: error?.code === 'ENOENT' ? '' : (error instanceof Error ? error.message : String(error))
    };
  }
}

export function buildProviderDoctorStatus(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const providerReport = options.providerReport || buildProviderReport(options.providerOptions || {});
  const lightpandaDoctor = options.lightpandaDoctor || buildLightpandaDoctor(options.lightpandaOptions || {});
  const playwrightDoctor = options.playwrightDoctor || buildPlaywrightDoctor(options.playwrightOptions || {});
  const seleniumDoctor = options.seleniumDoctor || buildSeleniumDoctor(options.seleniumOptions || {});
  const publicBenchmarkProof = options.publicBenchmarkProof || publicBenchmarkProofStatus(rootDir);
  const lightpandaMissing = missingCheckNames(lightpandaDoctor);
  const playwrightMissing = missingCheckNames(playwrightDoctor);
  const seleniumMissing = missingCheckNames(seleniumDoctor);
  const agentBrowserStatus = providerReport.localStatus?.agentBrowser || {};
  const chromeForTestingStatus = providerReport.localStatus?.chromeForTesting || {};
  const agentBrowserMissing = [
    ...(!agentBrowserStatus.exists ? ['cli.agent-browser'] : []),
    ...(!chromeForTestingStatus.exists ? ['browser.chrome-for-testing-cache'] : [])
  ];

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    defaultBackend: providerReport.recommendation?.defaultBackend || '',
    defaultAgentInterface: providerReport.recommendation?.defaultAgentInterface || '',
    adoptionNext: providerReport.recommendation?.adoptionNext || '',
    publicBenchmark: {
      ...publicBenchmarkProof,
      command: "node src/cli.mjs benchmark --iterations 1 --write --out provider-benchmarks/default-public.json --format json",
      agentMayRunUnattended: true,
      startsBrowser: true,
      readsBrowserStorage: false,
      returnsPageContent: false
    },
    agentBrowser: {
      cliExists: Boolean(agentBrowserStatus.exists),
      cliPath: agentBrowserStatus.path || '',
      version: agentBrowserStatus.version || '',
      chromeForTestingExists: Boolean(chromeForTestingStatus.exists),
      chromeForTestingPath: chromeForTestingStatus.path || '',
      readyForEngineUse: Boolean(agentBrowserStatus.exists && chromeForTestingStatus.exists),
      missingChecks: agentBrowserMissing,
      next: agentBrowserMissing.length
        ? 'install-agent-browser-cli-or-run-agent-browser-install-before-engine-use'
        : 'agent-browser-engine-ready-for-explicit-benchmark',
      installPlanRequiresOperatorApproval: true,
      installPlanAgentMayRunUnattended: false,
      installPlanMutatesRuntime: true
    },
    lightpanda: {
      readyForPublicBenchmark: Boolean(lightpandaDoctor.readyForPublicBenchmark),
      readyForSourceBuild: Boolean(lightpandaDoctor.readyForSourceBuild),
      binaryExists: Boolean(lightpandaDoctor.binary?.exists),
      binaryVersionOk: Boolean(lightpandaDoctor.binary?.versionOk),
      missingChecks: lightpandaMissing,
      installPlanRequiresOperatorApproval: Boolean(lightpandaDoctor.installPlanRequiresOperatorApproval),
      installPlanAgentMayRunUnattended: Boolean(lightpandaDoctor.installPlanAgentMayRunUnattended),
      installPlanMutatesRuntime: Boolean(lightpandaDoctor.installPlanMutatesRuntime),
      benchmarkRequiresOperatorApproval: Boolean(lightpandaDoctor.benchmarkRequiresOperatorApproval),
      benchmarkAgentMayRunUnattended: Boolean(lightpandaDoctor.benchmarkAgentMayRunUnattended),
      benchmarkStartsBrowser: Boolean(lightpandaDoctor.benchmarkStartsBrowser),
      benchmarkReadsBrowserStorage: Boolean(lightpandaDoctor.benchmarkReadsBrowserStorage),
      benchmarkReturnsPageContent: Boolean(lightpandaDoctor.benchmarkReturnsPageContent),
      benchmarkCommand: lightpandaDoctor.benchmarkCommand || '',
      next: providerReport.recommendation?.lightpandaNext || ''
    },
    playwright: {
      role: playwrightDoctor.role || 'test-rich-automation-adapter',
      readyForPublicSmoke: Boolean(playwrightDoctor.readyForPublicSmoke),
      readyForAuthenticatedDefault: Boolean(playwrightDoctor.readyForAuthenticatedDefault),
      corePackageExists: Boolean(playwrightDoctor.core?.packageExists),
      coreIndexExists: Boolean(playwrightDoctor.core?.indexExists),
      chromeForTestingExists: Boolean(playwrightDoctor.browser?.chromeForTesting?.exists),
      storageStateSensitive: Boolean(playwrightDoctor.storageStateSensitive),
      missingChecks: playwrightMissing,
      installPlanRequiresOperatorApproval: Boolean(playwrightDoctor.installPlanRequiresOperatorApproval),
      installPlanAgentMayRunUnattended: Boolean(playwrightDoctor.installPlanAgentMayRunUnattended),
      installPlanMutatesRuntime: Boolean(playwrightDoctor.installPlanMutatesRuntime),
      smokeRequiresOperatorApproval: Boolean(playwrightDoctor.smokeRequiresOperatorApproval),
      smokeAgentMayRunUnattended: Boolean(playwrightDoctor.smokeAgentMayRunUnattended),
      smokeStartsBrowser: Boolean(playwrightDoctor.smokeStartsBrowser),
      smokeReadsBrowserStorage: Boolean(playwrightDoctor.smokeReadsBrowserStorage),
      smokeReturnsPageContent: Boolean(playwrightDoctor.smokeReturnsPageContent),
      smokeCommand: playwrightDoctor.smokeCommand || '',
      publicSmokeProofExists: Boolean(playwrightDoctor.publicSmokeProof?.exists),
      publicSmokeProofOk: Boolean(playwrightDoctor.publicSmokeProof?.ok),
      publicSmokeProofPath: playwrightDoctor.publicSmokeProof?.path || '',
      publicSmokeProofHeadingCount: playwrightDoctor.publicSmokeProof?.headingCount ?? 0,
      publicSmokeProofLinkCount: playwrightDoctor.publicSmokeProof?.linkCount ?? 0,
      smokeProofCommand: playwrightDoctor.smokeProofCommand || '',
      smokeProofAgentMayRunUnattended: Boolean(playwrightDoctor.smokeProofAgentMayRunUnattended),
      smokeProofStartsBrowser: Boolean(playwrightDoctor.smokeProofStartsBrowser),
      smokeProofReadsBrowserStorage: Boolean(playwrightDoctor.smokeProofReadsBrowserStorage),
      smokeProofReturnsPageContent: Boolean(playwrightDoctor.smokeProofReturnsPageContent),
      next: providerReport.recommendation?.playwrightNext || ''
    },
    selenium: {
      role: seleniumDoctor.role || 'compatibility-bridge',
      readyForLocalSmoke: Boolean(seleniumDoctor.readyForLocalSmoke),
      localDriverReady: Boolean(seleniumDoctor.localDriverReady),
      gridReady: Boolean(seleniumDoctor.gridReady),
      seleniumWebdriverExists: Boolean(seleniumDoctor.package?.exists),
      chromedriverExists: Boolean(seleniumDoctor.drivers?.chromedriver?.exists),
      missingChecks: seleniumMissing,
      installPlanRequiresOperatorApproval: Boolean(seleniumDoctor.installPlanRequiresOperatorApproval),
      installPlanAgentMayRunUnattended: Boolean(seleniumDoctor.installPlanAgentMayRunUnattended),
      installPlanMutatesRuntime: Boolean(seleniumDoctor.installPlanMutatesRuntime),
      smokeRequiresOperatorApproval: Boolean(seleniumDoctor.smokeRequiresOperatorApproval),
      smokeAgentMayRunUnattended: Boolean(seleniumDoctor.smokeAgentMayRunUnattended),
      smokeStartsBrowser: Boolean(seleniumDoctor.smokeStartsBrowser),
      smokeCommand: seleniumDoctor.smokeCommand || '',
      next: providerReport.recommendation?.seleniumNext || ''
    },
    commands: {
      providers: "node src/cli.mjs providers --format compact",
      agentBrowserDoctor: "node src/cli.mjs agent-browser-doctor --format compact",
      agentBrowserCliDoctor: "command -v agent-browser && agent-browser --version",
      agentBrowserInstallPlan: "npm i -g agent-browser && agent-browser install",
      publicBenchmark: "node src/cli.mjs benchmark --iterations 1 --write --out provider-benchmarks/default-public.json --format json",
      lightpandaDoctor: "node src/cli.mjs lightpanda-doctor --format compact",
      lightpandaBenchmark: lightpandaDoctor.benchmarkCommand || '',
      playwrightDoctor: "node src/cli.mjs playwright-doctor --format compact",
      playwrightSmoke: playwrightDoctor.smokeCommand || "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'",
      playwrightSmokeProof: playwrightDoctor.smokeProofCommand || "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>' --out provider-benchmarks/playwright-public-smoke.json",
      seleniumDoctor: "node src/cli.mjs selenium-doctor --format compact",
      seleniumSmoke: seleniumDoctor.smokeCommand || "node src/cli.mjs selenium-doctor --format compact",
      backendMatrix: "node src/cli.mjs backend-matrix --format compact"
    }
  };
}

export function formatProviderDoctorStatusCompact(status) {
  const lightpandaMissing = status.lightpanda?.missingChecks || [];
  const playwrightMissing = status.playwright?.missingChecks || [];
  const seleniumMissing = status.selenium?.missingChecks || [];
  const agentBrowserMissing = status.agentBrowser?.missingChecks || [];
  const lines = [
    `default_backend: ${compact(status.defaultBackend)}`,
    `default_agent_interface: ${compact(status.defaultAgentInterface)}`,
    `provider_adoption_next: ${compact(status.adoptionNext)}`,
    `public_benchmark_proof_exists: ${yesNo(status.publicBenchmark?.exists)}`,
    `public_benchmark_proof_ok: ${yesNo(status.publicBenchmark?.ok)}`,
    `public_benchmark_fastest_measured_provider: ${compact(status.publicBenchmark?.fastestMeasuredProvider)}`,
    `public_benchmark_direct_cdp_cold_ok: ${yesNo(status.publicBenchmark?.directCdpColdOk)}`,
    `public_benchmark_direct_cdp_daemon_ok: ${yesNo(status.publicBenchmark?.directCdpDaemonOk)}`,
    `public_benchmark_agent_browser_chrome_ok: ${yesNo(status.publicBenchmark?.agentBrowserChromeOk)}`,
    `public_benchmark_playwright_ok: ${yesNo(status.publicBenchmark?.playwrightOk)}`,
    `public_benchmark_lightpanda_skipped: ${yesNo(status.publicBenchmark?.lightpandaSkipped)}`,
    `public_benchmark_selenium_skipped: ${yesNo(status.publicBenchmark?.seleniumSkipped)}`,
    `public_benchmark_direct_cdp_daemon_mean_ms: ${status.publicBenchmark?.directCdpDaemonMeanMs ?? 0}`,
    `public_benchmark_agent_browser_chrome_mean_ms: ${status.publicBenchmark?.agentBrowserChromeMeanMs ?? 0}`,
    `public_benchmark_playwright_mean_ms: ${status.publicBenchmark?.playwrightMeanMs ?? 0}`,
    `public_benchmark_agent_may_run_unattended: ${yesNo(status.publicBenchmark?.agentMayRunUnattended)}`,
    `public_benchmark_starts_browser: ${yesNo(status.publicBenchmark?.startsBrowser)}`,
    `public_benchmark_reads_browser_storage: ${yesNo(status.publicBenchmark?.readsBrowserStorage)}`,
    `public_benchmark_returns_page_content: ${yesNo(status.publicBenchmark?.returnsPageContent)}`,
    `public_benchmark_command: ${compact(status.publicBenchmark?.command || status.commands?.publicBenchmark)}`,
    `agent_browser_cli_exists: ${yesNo(status.agentBrowser?.cliExists)}`,
    `agent_browser_chrome_for_testing_exists: ${yesNo(status.agentBrowser?.chromeForTestingExists)}`,
    `agent_browser_ready_for_engine_use: ${yesNo(status.agentBrowser?.readyForEngineUse)}`,
    `agent_browser_missing_checks: ${agentBrowserMissing.length ? agentBrowserMissing.join(',') : 'none'}`,
    `agent_browser_next: ${compact(status.agentBrowser?.next)}`,
    `lightpanda_ready_for_public_benchmark: ${yesNo(status.lightpanda?.readyForPublicBenchmark)}`,
    `lightpanda_ready_for_source_build: ${yesNo(status.lightpanda?.readyForSourceBuild)}`,
    `lightpanda_binary_exists: ${yesNo(status.lightpanda?.binaryExists)}`,
    `lightpanda_binary_version_ok: ${yesNo(status.lightpanda?.binaryVersionOk)}`,
    `lightpanda_missing_checks: ${lightpandaMissing.length ? lightpandaMissing.join(',') : 'none'}`,
    `lightpanda_next: ${compact(status.lightpanda?.next)}`,
    `lightpanda_install_requires_operator_approval: ${yesNo(status.lightpanda?.installPlanRequiresOperatorApproval)}`,
    `lightpanda_install_agent_may_run_unattended: ${yesNo(status.lightpanda?.installPlanAgentMayRunUnattended)}`,
    `lightpanda_install_mutates_runtime: ${yesNo(status.lightpanda?.installPlanMutatesRuntime)}`,
    `lightpanda_benchmark_requires_operator_approval: ${yesNo(status.lightpanda?.benchmarkRequiresOperatorApproval)}`,
    `lightpanda_benchmark_agent_may_run_unattended: ${yesNo(status.lightpanda?.benchmarkAgentMayRunUnattended)}`,
    `lightpanda_benchmark_starts_browser: ${yesNo(status.lightpanda?.benchmarkStartsBrowser)}`,
    `lightpanda_benchmark_reads_browser_storage: ${yesNo(status.lightpanda?.benchmarkReadsBrowserStorage)}`,
    `lightpanda_benchmark_returns_page_content: ${yesNo(status.lightpanda?.benchmarkReturnsPageContent)}`,
    `lightpanda_benchmark_command: ${compact(status.lightpanda?.benchmarkCommand || status.commands?.lightpandaBenchmark)}`,
    `playwright_role: ${compact(status.playwright?.role)}`,
    `playwright_ready_for_public_smoke: ${yesNo(status.playwright?.readyForPublicSmoke)}`,
    `playwright_ready_for_authenticated_default: ${yesNo(status.playwright?.readyForAuthenticatedDefault)}`,
    `playwright_core_package_exists: ${yesNo(status.playwright?.corePackageExists)}`,
    `playwright_core_index_exists: ${yesNo(status.playwright?.coreIndexExists)}`,
    `playwright_chrome_for_testing_exists: ${yesNo(status.playwright?.chromeForTestingExists)}`,
    `playwright_storage_state_sensitive: ${yesNo(status.playwright?.storageStateSensitive)}`,
    `playwright_missing_checks: ${playwrightMissing.length ? playwrightMissing.join(',') : 'none'}`,
    `playwright_next: ${compact(status.playwright?.next)}`,
    `playwright_install_requires_operator_approval: ${yesNo(status.playwright?.installPlanRequiresOperatorApproval)}`,
    `playwright_install_agent_may_run_unattended: ${yesNo(status.playwright?.installPlanAgentMayRunUnattended)}`,
    `playwright_install_mutates_runtime: ${yesNo(status.playwright?.installPlanMutatesRuntime)}`,
    `playwright_smoke_requires_operator_approval: ${yesNo(status.playwright?.smokeRequiresOperatorApproval)}`,
    `playwright_smoke_agent_may_run_unattended: ${yesNo(status.playwright?.smokeAgentMayRunUnattended)}`,
    `playwright_smoke_starts_browser: ${yesNo(status.playwright?.smokeStartsBrowser)}`,
    `playwright_smoke_reads_browser_storage: ${yesNo(status.playwright?.smokeReadsBrowserStorage)}`,
    `playwright_smoke_returns_page_content: ${yesNo(status.playwright?.smokeReturnsPageContent)}`,
    `playwright_smoke_run_command: ${compact(status.playwright?.smokeCommand || status.commands?.playwrightSmoke)}`,
    `playwright_public_smoke_proof_exists: ${yesNo(status.playwright?.publicSmokeProofExists)}`,
    `playwright_public_smoke_proof_ok: ${yesNo(status.playwright?.publicSmokeProofOk)}`,
    `playwright_public_smoke_proof_heading_count: ${status.playwright?.publicSmokeProofHeadingCount ?? 0}`,
    `playwright_public_smoke_proof_link_count: ${status.playwright?.publicSmokeProofLinkCount ?? 0}`,
    `playwright_smoke_proof_agent_may_run_unattended: ${yesNo(status.playwright?.smokeProofAgentMayRunUnattended)}`,
    `playwright_smoke_proof_starts_browser: ${yesNo(status.playwright?.smokeProofStartsBrowser)}`,
    `playwright_smoke_proof_reads_browser_storage: ${yesNo(status.playwright?.smokeProofReadsBrowserStorage)}`,
    `playwright_smoke_proof_returns_page_content: ${yesNo(status.playwright?.smokeProofReturnsPageContent)}`,
    `playwright_smoke_proof_command: ${compact(status.playwright?.smokeProofCommand || status.commands?.playwrightSmokeProof)}`,
    `selenium_role: ${compact(status.selenium?.role)}`,
    `selenium_ready_for_local_smoke: ${yesNo(status.selenium?.readyForLocalSmoke)}`,
    `selenium_local_driver_ready: ${yesNo(status.selenium?.localDriverReady)}`,
    `selenium_grid_ready: ${yesNo(status.selenium?.gridReady)}`,
    `selenium_webdriver_exists: ${yesNo(status.selenium?.seleniumWebdriverExists)}`,
    `selenium_chromedriver_exists: ${yesNo(status.selenium?.chromedriverExists)}`,
    `selenium_missing_checks: ${seleniumMissing.length ? seleniumMissing.join(',') : 'none'}`,
    `selenium_next: ${compact(status.selenium?.next)}`,
    `selenium_install_requires_operator_approval: ${yesNo(status.selenium?.installPlanRequiresOperatorApproval)}`,
    `selenium_install_agent_may_run_unattended: ${yesNo(status.selenium?.installPlanAgentMayRunUnattended)}`,
    `selenium_install_mutates_runtime: ${yesNo(status.selenium?.installPlanMutatesRuntime)}`,
    `selenium_smoke_requires_operator_approval: ${yesNo(status.selenium?.smokeRequiresOperatorApproval)}`,
    `selenium_smoke_agent_may_run_unattended: ${yesNo(status.selenium?.smokeAgentMayRunUnattended)}`,
    `selenium_smoke_starts_browser: ${yesNo(status.selenium?.smokeStartsBrowser)}`,
    `selenium_smoke_command: ${compact(status.selenium?.smokeCommand || status.commands?.seleniumSmoke)}`,
    `providers_command: ${compact(status.commands?.providers)}`,
    `agent_browser_doctor_command: ${compact(status.commands?.agentBrowserDoctor)}`,
    `agent_browser_cli_doctor_command: ${compact(status.commands?.agentBrowserCliDoctor)}`,
    `agent_browser_install_plan_command: ${compact(status.commands?.agentBrowserInstallPlan)}`,
    `public_benchmark_run_command: ${compact(status.commands?.publicBenchmark)}`,
    `agent_browser_install_requires_operator_approval: ${yesNo(status.agentBrowser?.installPlanRequiresOperatorApproval)}`,
    `agent_browser_install_agent_may_run_unattended: ${yesNo(status.agentBrowser?.installPlanAgentMayRunUnattended)}`,
    `agent_browser_install_mutates_runtime: ${yesNo(status.agentBrowser?.installPlanMutatesRuntime)}`,
    `lightpanda_doctor_command: ${compact(status.commands?.lightpandaDoctor)}`,
    `lightpanda_benchmark_run_command: ${compact(status.commands?.lightpandaBenchmark)}`,
    `playwright_doctor_command: ${compact(status.commands?.playwrightDoctor)}`,
    `playwright_smoke_command: ${compact(status.commands?.playwrightSmoke)}`,
    `playwright_smoke_proof_run_command: ${compact(status.commands?.playwrightSmokeProof)}`,
    `selenium_doctor_command: ${compact(status.commands?.seleniumDoctor)}`,
    `selenium_smoke_run_command: ${compact(status.commands?.seleniumSmoke)}`,
    `backend_matrix_command: ${compact(status.commands?.backendMatrix)}`
  ];
  if (status.agentBrowser?.cliPath) lines.push(`agent_browser_cli_path: ${status.agentBrowser.cliPath}`);
  if (status.agentBrowser?.version) lines.push(`agent_browser_version: ${status.agentBrowser.version}`);
  if (status.agentBrowser?.chromeForTestingPath) lines.push(`agent_browser_chrome_for_testing_path: ${status.agentBrowser.chromeForTestingPath}`);
  if (status.publicBenchmark?.path) lines.push(`public_benchmark_proof_path: ${status.publicBenchmark.path}`);
  if (status.publicBenchmark?.error) lines.push(`public_benchmark_proof_error: ${compact(status.publicBenchmark.error)}`);
  if (status.playwright?.publicSmokeProofPath) lines.push(`playwright_public_smoke_proof_path: ${status.playwright.publicSmokeProofPath}`);
  return `${lines.join('\n')}\n`;
}
