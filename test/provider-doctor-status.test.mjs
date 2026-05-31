import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderDoctorStatus, formatProviderDoctorStatusCompact } from '../src/provider-doctor-status.mjs';

const providerReport = {
  recommendation: {
    defaultBackend: 'direct-cdp-chrome',
    defaultAgentInterface: 'secure-browser-agent-mcp',
    adoptionNext: 'keep-direct-cdp-default-and-run-provider-doctors-before-changing-backends',
    lightpandaNext: 'install-or-configure-lightpanda-binary-then-benchmark',
    playwrightNext: 'use-playwright-for-public-smoke-and-structured-tests-only',
    seleniumNext: 'install-selenium-webdriver-only-if-grid-compatibility-is-needed'
  },
  localStatus: {
    agentBrowser: {
      exists: false,
      path: '',
      version: ''
    },
    chromeForTesting: {
      exists: true,
      path: '/tmp/chrome-for-testing'
    }
  }
};

const lightpandaDoctor = {
  readyForPublicBenchmark: false,
  readyForSourceBuild: true,
  binary: {
    exists: false,
    versionOk: false
  },
  installPlanRequiresOperatorApproval: true,
  installPlanAgentMayRunUnattended: false,
  installPlanMutatesRuntime: true,
  benchmarkRequiresOperatorApproval: false,
  benchmarkAgentMayRunUnattended: false,
  benchmarkStartsBrowser: true,
  benchmarkReadsBrowserStorage: false,
  benchmarkReturnsPageContent: false,
  benchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json',
  checks: [
    { name: 'binary.available', status: 'manual-required' },
    { name: 'build.zig', status: 'pass' }
  ]
};

const seleniumDoctor = {
  role: 'compatibility-bridge',
  readyForLocalSmoke: false,
  localDriverReady: false,
  gridReady: false,
  package: {
    exists: false
  },
  drivers: {
    chromedriver: { exists: false }
  },
  installPlanRequiresOperatorApproval: true,
  installPlanAgentMayRunUnattended: false,
  installPlanMutatesRuntime: true,
  smokeRequiresOperatorApproval: false,
  smokeAgentMayRunUnattended: true,
  smokeStartsBrowser: false,
  smokeCommand: 'node src/cli.mjs selenium-doctor --format compact',
  checks: [
    { name: 'package.selenium-webdriver', status: 'missing' },
    { name: 'driver.chromedriver', status: 'missing' },
    { name: 'runtime.node', status: 'pass' }
  ]
};

const playwrightDoctor = {
  role: 'test-rich-automation-adapter',
  readyForPublicSmoke: false,
  readyForAuthenticatedDefault: false,
  storageStateSensitive: true,
  core: {
    packageExists: true,
    indexExists: false
  },
  browser: {
    chromeForTesting: { exists: true }
  },
  installPlanRequiresOperatorApproval: true,
  installPlanAgentMayRunUnattended: false,
  installPlanMutatesRuntime: true,
  smokeRequiresOperatorApproval: false,
  smokeAgentMayRunUnattended: false,
  smokeStartsBrowser: true,
  smokeReadsBrowserStorage: false,
  smokeReturnsPageContent: false,
  smokeCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'",
  publicSmokeProof: {
    exists: true,
    ok: true,
    path: '/tmp/runs/provider-benchmarks/playwright-public-smoke.json',
    headingCount: 1,
    linkCount: 0
  },
  smokeProofCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>' --out provider-benchmarks/playwright-public-smoke.json",
  smokeProofAgentMayRunUnattended: false,
  smokeProofStartsBrowser: true,
  smokeProofReadsBrowserStorage: false,
  smokeProofReturnsPageContent: false,
  checks: [
    { name: 'package.playwright-core', status: 'pass' },
    { name: 'core.index', status: 'missing' },
    { name: 'browser.chrome-for-testing', status: 'pass' },
    { name: 'auth.storage-state-boundary', status: 'manual-required' }
  ]
};

const publicBenchmarkProof = {
  exists: true,
  ok: true,
  path: '/tmp/runs/provider-benchmarks/default-public.json',
  fastestMeasuredProvider: 'direct-cdp-daemon',
  directCdpColdOk: true,
  directCdpDaemonOk: true,
  agentBrowserChromeOk: true,
  playwrightOk: true,
  lightpandaSkipped: true,
  seleniumSkipped: true,
  directCdpDaemonMeanMs: 64,
  agentBrowserChromeMeanMs: 1296.1,
  playwrightMeanMs: 1668.9
};

test('provider doctor status rolls provider and bridge doctors into compact lines', () => {
  const status = buildProviderDoctorStatus({
    providerReport,
    lightpandaDoctor,
    playwrightDoctor,
    seleniumDoctor,
    publicBenchmarkProof,
    generatedAt: '2026-05-31T00:00:00.000Z'
  });
  assert.equal(status.defaultBackend, 'direct-cdp-chrome');
  assert.equal(status.publicBenchmark.ok, true);
  assert.equal(status.publicBenchmark.fastestMeasuredProvider, 'direct-cdp-daemon');
  assert.equal(status.publicBenchmark.agentBrowserChromeOk, true);
  assert.equal(status.publicBenchmark.playwrightOk, true);
  assert.equal(status.publicBenchmark.agentMayRunUnattended, true);
  assert.equal(status.publicBenchmark.startsBrowser, true);
  assert.equal(status.publicBenchmark.readsBrowserStorage, false);
  assert.equal(status.publicBenchmark.returnsPageContent, false);
  assert.equal(status.agentBrowser.cliExists, false);
  assert.equal(status.agentBrowser.chromeForTestingExists, true);
  assert.equal(status.agentBrowser.readyForEngineUse, false);
  assert.deepEqual(status.agentBrowser.missingChecks, ['cli.agent-browser']);
  assert.equal(status.agentBrowser.installPlanRequiresOperatorApproval, true);
  assert.equal(status.agentBrowser.installPlanAgentMayRunUnattended, false);
  assert.equal(status.agentBrowser.installPlanMutatesRuntime, true);
  assert.equal(status.lightpanda.missingChecks.includes('binary.available'), true);
  assert.equal(status.lightpanda.installPlanRequiresOperatorApproval, true);
  assert.equal(status.lightpanda.benchmarkAgentMayRunUnattended, false);
  assert.match(status.lightpanda.benchmarkCommand, /lightpanda-public\.json/);
  assert.equal(status.playwright.missingChecks.includes('core.index'), true);
  assert.equal(status.playwright.missingChecks.includes('auth.storage-state-boundary'), true);
  assert.equal(status.playwright.installPlanRequiresOperatorApproval, true);
  assert.equal(status.playwright.smokeStartsBrowser, true);
  assert.equal(status.playwright.smokeReadsBrowserStorage, false);
  assert.match(status.playwright.smokeCommand, /outline-playwright/);
  assert.equal(status.playwright.publicSmokeProofExists, true);
  assert.equal(status.playwright.publicSmokeProofOk, true);
  assert.equal(status.playwright.publicSmokeProofHeadingCount, 1);
  assert.equal(status.playwright.publicSmokeProofLinkCount, 0);
  assert.match(status.playwright.publicSmokeProofPath, /playwright-public-smoke\.json/);
  assert.match(status.playwright.smokeProofCommand, /playwright-public-smoke\.json/);
  assert.equal(status.playwright.smokeProofAgentMayRunUnattended, false);
  assert.equal(status.playwright.smokeProofStartsBrowser, true);
  assert.equal(status.playwright.smokeProofReadsBrowserStorage, false);
  assert.equal(status.playwright.smokeProofReturnsPageContent, false);
  assert.equal(status.selenium.missingChecks.includes('package.selenium-webdriver'), true);
  assert.equal(status.selenium.installPlanRequiresOperatorApproval, true);
  assert.equal(status.selenium.smokeAgentMayRunUnattended, true);
  assert.match(status.selenium.smokeCommand, /selenium-doctor/);

  const compact = formatProviderDoctorStatusCompact(status);
  assert.match(compact, /^default_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^default_agent_interface: secure-browser-agent-mcp$/m);
  assert.match(compact, /^public_benchmark_proof_exists: yes$/m);
  assert.match(compact, /^public_benchmark_proof_ok: yes$/m);
  assert.match(compact, /^public_benchmark_fastest_measured_provider: direct-cdp-daemon$/m);
  assert.match(compact, /^public_benchmark_direct_cdp_cold_ok: yes$/m);
  assert.match(compact, /^public_benchmark_direct_cdp_daemon_ok: yes$/m);
  assert.match(compact, /^public_benchmark_agent_browser_chrome_ok: yes$/m);
  assert.match(compact, /^public_benchmark_playwright_ok: yes$/m);
  assert.match(compact, /^public_benchmark_lightpanda_skipped: yes$/m);
  assert.match(compact, /^public_benchmark_selenium_skipped: yes$/m);
  assert.match(compact, /^public_benchmark_direct_cdp_daemon_mean_ms: 64$/m);
  assert.match(compact, /^public_benchmark_agent_browser_chrome_mean_ms: 1296\.1$/m);
  assert.match(compact, /^public_benchmark_playwright_mean_ms: 1668\.9$/m);
  assert.match(compact, /^public_benchmark_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^public_benchmark_starts_browser: yes$/m);
  assert.match(compact, /^public_benchmark_reads_browser_storage: no$/m);
  assert.match(compact, /^public_benchmark_returns_page_content: no$/m);
  assert.match(compact, /^public_benchmark_command: node src\/cli\.mjs benchmark --iterations 1 --write --out provider-benchmarks\/default-public\.json --format json$/m);
  assert.match(compact, /^agent_browser_cli_exists: no$/m);
  assert.match(compact, /^agent_browser_chrome_for_testing_exists: yes$/m);
  assert.match(compact, /^agent_browser_ready_for_engine_use: no$/m);
  assert.match(compact, /^agent_browser_missing_checks: cli\.agent-browser$/m);
  assert.match(compact, /^agent_browser_next: install-agent-browser-cli-or-run-agent-browser-install-before-engine-use$/m);
  assert.match(compact, /^lightpanda_ready_for_public_benchmark: no$/m);
  assert.match(compact, /^lightpanda_missing_checks: binary\.available$/m);
  assert.match(compact, /^lightpanda_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^lightpanda_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^lightpanda_install_mutates_runtime: yes$/m);
  assert.match(compact, /^lightpanda_benchmark_requires_operator_approval: no$/m);
  assert.match(compact, /^lightpanda_benchmark_agent_may_run_unattended: no$/m);
  assert.match(compact, /^lightpanda_benchmark_starts_browser: yes$/m);
  assert.match(compact, /^lightpanda_benchmark_reads_browser_storage: no$/m);
  assert.match(compact, /^lightpanda_benchmark_returns_page_content: no$/m);
  assert.match(compact, /^lightpanda_benchmark_command: LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="\/tmp\/lightpanda" node src\/cli\.mjs benchmark --url https:\/\/example\.com --iterations 1 --write --out provider-benchmarks\/lightpanda-public\.json --format json$/m);
  assert.match(compact, /^playwright_role: test-rich-automation-adapter$/m);
  assert.match(compact, /^playwright_ready_for_public_smoke: no$/m);
  assert.match(compact, /^playwright_ready_for_authenticated_default: no$/m);
  assert.match(compact, /^playwright_core_package_exists: yes$/m);
  assert.match(compact, /^playwright_core_index_exists: no$/m);
  assert.match(compact, /^playwright_chrome_for_testing_exists: yes$/m);
  assert.match(compact, /^playwright_storage_state_sensitive: yes$/m);
  assert.match(compact, /^playwright_missing_checks: core\.index,auth\.storage-state-boundary$/m);
  assert.match(compact, /^playwright_next: use-playwright-for-public-smoke-and-structured-tests-only$/m);
  assert.match(compact, /^playwright_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^playwright_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^playwright_install_mutates_runtime: yes$/m);
  assert.match(compact, /^playwright_smoke_requires_operator_approval: no$/m);
  assert.match(compact, /^playwright_smoke_agent_may_run_unattended: no$/m);
  assert.match(compact, /^playwright_smoke_starts_browser: yes$/m);
  assert.match(compact, /^playwright_smoke_reads_browser_storage: no$/m);
  assert.match(compact, /^playwright_smoke_returns_page_content: no$/m);
  assert.match(compact, /^playwright_smoke_run_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>'$/m);
  assert.match(compact, /^playwright_public_smoke_proof_exists: yes$/m);
  assert.match(compact, /^playwright_public_smoke_proof_ok: yes$/m);
  assert.match(compact, /^playwright_public_smoke_proof_heading_count: 1$/m);
  assert.match(compact, /^playwright_public_smoke_proof_link_count: 0$/m);
  assert.match(compact, /^playwright_smoke_proof_agent_may_run_unattended: no$/m);
  assert.match(compact, /^playwright_smoke_proof_starts_browser: yes$/m);
  assert.match(compact, /^playwright_smoke_proof_reads_browser_storage: no$/m);
  assert.match(compact, /^playwright_smoke_proof_returns_page_content: no$/m);
  assert.match(compact, /^playwright_smoke_proof_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>' --out provider-benchmarks\/playwright-public-smoke\.json$/m);
  assert.match(compact, /^selenium_role: compatibility-bridge$/m);
  assert.match(compact, /^selenium_ready_for_local_smoke: no$/m);
  assert.match(compact, /^selenium_missing_checks: package\.selenium-webdriver,driver\.chromedriver$/m);
  assert.match(compact, /^selenium_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^selenium_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^selenium_install_mutates_runtime: yes$/m);
  assert.match(compact, /^selenium_smoke_requires_operator_approval: no$/m);
  assert.match(compact, /^selenium_smoke_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^selenium_smoke_starts_browser: no$/m);
  assert.match(compact, /^selenium_smoke_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
  assert.match(compact, /^agent_browser_doctor_command: node src\/cli\.mjs agent-browser-doctor --format compact$/m);
  assert.match(compact, /^agent_browser_cli_doctor_command: command -v agent-browser && agent-browser --version$/m);
  assert.match(compact, /^agent_browser_install_plan_command: npm i -g agent-browser && agent-browser install$/m);
  assert.match(compact, /^public_benchmark_run_command: node src\/cli\.mjs benchmark --iterations 1 --write --out provider-benchmarks\/default-public\.json --format json$/m);
  assert.match(compact, /^agent_browser_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^agent_browser_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_browser_install_mutates_runtime: yes$/m);
  assert.match(compact, /^lightpanda_doctor_command: node src\/cli\.mjs lightpanda-doctor --format compact$/m);
  assert.match(compact, /^lightpanda_benchmark_run_command: LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="\/tmp\/lightpanda" node src\/cli\.mjs benchmark --url https:\/\/example\.com --iterations 1 --write --out provider-benchmarks\/lightpanda-public\.json --format json$/m);
  assert.match(compact, /^playwright_doctor_command: node src\/cli\.mjs playwright-doctor --format compact$/m);
  assert.match(compact, /^playwright_smoke_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>'$/m);
  assert.match(compact, /^playwright_smoke_proof_run_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>' --out provider-benchmarks\/playwright-public-smoke\.json$/m);
  assert.match(compact, /^selenium_doctor_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
  assert.match(compact, /^selenium_smoke_run_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
  assert.match(compact, /^playwright_public_smoke_proof_path: \/tmp\/runs\/provider-benchmarks\/playwright-public-smoke\.json$/m);
  assert.match(compact, /^public_benchmark_proof_path: \/tmp\/runs\/provider-benchmarks\/default-public\.json$/m);
});
