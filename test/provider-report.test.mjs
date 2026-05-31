import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderReport, detectProviderStatus, formatProviderReportCompact, formatProviderReportMarkdown, recommendProviders } from '../src/provider-report.mjs';

const readyStatus = {
  agentBrowser: { exists: true, path: '/usr/local/bin/agent-browser', version: 'agent-browser 0.27.0', ok: true },
  chromeForTesting: { exists: true, path: '/tmp/chrome' },
  secureBrowserAgentMcp: { exists: true, command: 'node src/cli.mjs mcp-stdio' },
  playwright: { coreExists: true, corePath: '/tmp/playwright-core/index.js' },
  lightpanda: { binaryExists: false, binaryPath: '' },
  chromeDevtoolsMcp: { npxExists: true, npxPath: '/usr/local/bin/npx', packageCommand: 'npx -y chrome-devtools-mcp@latest' },
  selenium: { webdriverPackageExists: false, webdriverPackagePath: '/tmp/node_modules/selenium-webdriver/package.json' },
  localClones: {
    agentBrowser: { exists: true, path: '/tmp/agent-browser' },
    browserUse: { exists: true, path: '/tmp/browser-use' },
    lightpanda: { exists: true, path: '/tmp/lightpanda' },
    browserMcp: { exists: true, path: '/tmp/browsermcp' },
    skyvern: { exists: true, path: '/tmp/skyvern' },
    scrapling: { exists: true, path: '/tmp/scrapling' }
  }
};

test('provider recommendation keeps direct CDP as authenticated default when Chrome is ready', () => {
  const recommendation = recommendProviders(readyStatus);
  assert.equal(recommendation.defaultBackend, 'direct-cdp-chrome');
  assert.equal(recommendation.defaultAgentInterface, 'secure-browser-agent-mcp');
  assert.match(recommendation.decision, /direct CDP as the default/);
  assert.match(recommendation.publicCrawlAccelerator, /lightpanda-pending/);
});

test('provider report includes official-source backed provider roles', () => {
  const report = buildProviderReport({
    status: readyStatus,
    generatedAt: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.providers.some((provider) => provider.id === 'chrome-devtools-mcp'), true);
  assert.equal(report.providers.some((provider) => provider.id === 'lightpanda'), true);
  assert.equal(report.sources.some((source) => source.id === 'playwright-auth'), true);
  assert.equal(report.sources.some((source) => source.id === 'browsermcp'), true);
  assert.equal(report.sources.some((source) => source.id === 'skyvern'), true);
  assert.equal(report.sources.some((source) => source.id === 'scrapling'), true);
});

test('provider markdown renders the decision and local availability', () => {
  const report = buildProviderReport({
    status: readyStatus,
    generatedAt: '2026-05-28T00:00:00.000Z'
  });
  const markdown = formatProviderReportMarkdown(report);
  assert.match(markdown, /Default backend: direct-cdp-chrome/);
  assert.match(markdown, /Lightpanda binary: missing/);
  assert.match(markdown, /Chrome DevTools MCP/);
});

test('provider compact output gives low-token backend decision', () => {
  const report = buildProviderReport({
    status: readyStatus,
    generatedAt: '2026-05-28T00:00:00.000Z'
  });
  const compact = formatProviderReportCompact(report);
  assert.match(compact, /^default_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^default_agent_interface: secure-browser-agent-mcp$/m);
  assert.match(compact, /^provider_adoption_next: keep-direct-cdp-default-and-run-provider-doctors-before-changing-backends$/m);
  assert.match(compact, /^lightpanda_next: install-or-configure-lightpanda-binary-then-benchmark$/m);
  assert.match(compact, /^playwright_next: use-for-rich-tests-not-default-auth-scraping$/m);
  assert.match(compact, /^selenium_next: install-selenium-webdriver-only-if-grid-compatibility-is-needed$/m);
  assert.match(compact, /^agent_browser_present: yes$/m);
  assert.match(compact, /^chrome_for_testing_present: yes$/m);
  assert.match(compact, /^lightpanda_binary_present: no$/m);
  assert.match(compact, /^clone_browsermcp_present: yes$/m);
  assert.match(compact, /^clone_skyvern_present: yes$/m);
  assert.match(compact, /^clone_scrapling_present: yes$/m);
  assert.match(compact, /^provider_count: 6$/m);
  assert.match(compact, /^source_count: 10$/m);
  assert.match(compact, /^provider_doctor_command: 'node' 'src\/cli\.mjs' 'providers' '--format' 'compact'$/m);
  assert.match(compact, /^backend_matrix_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--format' 'compact'$/m);
  assert.match(compact, /^lightpanda_doctor_command: 'node' 'src\/cli\.mjs' 'lightpanda-doctor' '--format' 'compact'$/m);
  assert.match(compact, /^lightpanda_benchmark_command: 'node' 'src\/cli\.mjs' 'benchmark' '--url' 'https:\/\/example\.com' '--iterations' '1' '--write' '--out' 'provider-benchmarks\/lightpanda-public\.json' '--format' 'json'$/m);
  assert.match(compact, /^selenium_doctor_command: 'node' 'src\/cli\.mjs' 'selenium-doctor' '--format' 'compact'$/m);
  assert.match(compact, /^decision: Keep secure-browser-agent direct CDP as the default/m);
});

test('provider status reports configured missing Lightpanda binary without treating it as ready', () => {
  const status = detectProviderStatus({
    rootDir: '/tmp/sba-missing-root',
    homeDir: '/tmp/sba-missing-home',
    env: {
      PATH: '',
      SBA_LIGHTPANDA_PATH: '/missing/lightpanda'
    }
  });
  assert.equal(status.lightpanda.binaryExists, false);
  assert.equal(status.lightpanda.binaryPath, '');
  assert.equal(status.lightpanda.configuredPath, '/missing/lightpanda');
  assert.equal(status.lightpanda.configuredExists, false);
  assert.match(recommendProviders(status).publicCrawlAccelerator, /lightpanda-pending/);
});
