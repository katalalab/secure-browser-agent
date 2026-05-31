import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { benchmarkDataUrl, findProviderBenchmarkProofs, formatProviderBenchmarkMarkdown, lightpandaPublicBenchmarkDecision, runProviderBenchmark, summarizeDurations, writeProviderBenchmarkReport } from '../src/provider-benchmark.mjs';

const missingStatus = {
  agentBrowser: { exists: false, path: '', version: '' },
  chromeForTesting: { exists: false, path: '' },
  secureBrowserAgentMcp: { exists: true, command: 'node src/cli.mjs mcp-stdio' },
  playwright: { coreExists: false, corePath: '' },
  lightpanda: { binaryExists: false, binaryPath: '' },
  chromeDevtoolsMcp: { npxExists: false, npxPath: '', packageCommand: 'npx -y chrome-devtools-mcp@latest' },
  selenium: { webdriverPackageExists: false, webdriverPackagePath: '' },
  localClones: {}
};

test('benchmark duration summary rounds core statistics', () => {
  assert.deepEqual(summarizeDurations([10.04, 20.16, 30.24]), {
    iterations: 3,
    minMs: 10,
    meanMs: 20.1,
    maxMs: 30.2
  });
});

test('benchmark data url contains encoded synthetic catalog', () => {
  const url = benchmarkDataUrl(2);
  assert.match(url, /^data:text\/html,/);
  assert.match(decodeURIComponent(url), /Item 001/);
  assert.match(decodeURIComponent(url), /Item 002/);
});

test('benchmark report records public URL fixtures without launching browsers', async () => {
  const report = await runProviderBenchmark({
    status: missingStatus,
    quick: true,
    iterations: 1,
    url: 'https://example.com/catalog'
  });
  assert.equal(report.fixture.rows, 0);
  assert.equal(report.fixture.urlKind, 'https://example.com');
  assert.equal(report.fixture.url, 'https://example.com/catalog');
  assert.equal(report.results.every((item) => item.skipped), true);
});

test('benchmark rejects non-web URL fixtures', async () => {
  await assert.rejects(
    () => runProviderBenchmark({
      status: missingStatus,
      quick: true,
      iterations: 1,
      url: 'file:///tmp/page.html'
    }),
    /only supports http\(s\) or data/
  );
});

test('benchmark report can render skipped providers without launching browsers', async () => {
  const report = await runProviderBenchmark({
    status: missingStatus,
    quick: true,
    iterations: 1,
    rowCount: 2
  });
  assert.equal(report.results.length, 2);
  assert.equal(report.results.every((item) => item.skipped), true);
  const markdown = formatProviderBenchmarkMarkdown(report);
  assert.match(markdown, /direct-cdp-cold/);
  assert.match(markdown, /skipped/);
  assert.match(markdown, /Decision:/);
});

test('provider benchmark writes proof artifacts only under runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-provider-bench-proof-'));
  try {
    const report = {
      generatedAt: '2026-05-28T00:00:00.000Z',
      fixture: {
        url: 'https://example.com',
        urlKind: 'https://example.com'
      },
      results: [
        { provider: 'lightpanda', ok: true, meanMs: 42, skipped: false }
      ]
    };
    const written = writeProviderBenchmarkReport(root, report, 'provider-benchmarks/lightpanda-public.json');
    assert.equal(written, path.join(root, 'runs', 'provider-benchmarks', 'lightpanda-public.json'));
    assert.equal(findProviderBenchmarkProofs(root).length, 1);
    assert.equal(lightpandaPublicBenchmarkDecision(report).result, 'proved');
    assert.throws(() => writeProviderBenchmarkReport(root, report, '../leak.json'), /must stay under runs/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Lightpanda public benchmark decision accepts explicit rejection proof', () => {
  const decision = lightpandaPublicBenchmarkDecision({
    fixture: { url: 'https://example.com' },
    results: [
      { provider: 'lightpanda', ok: false, skipped: false, reason: 'unsupported Web API' }
    ]
  });
  assert.equal(decision.result, 'rejected');
  assert.match(decision.reason, /unsupported Web API/);
});

test('Lightpanda public benchmark decision accepts standalone doctor-based rejection', () => {
  const decision = lightpandaPublicBenchmarkDecision({
    type: 'lightpanda-public-decision',
    provider: 'lightpanda',
    ok: true,
    decision: 'reject',
    reason: 'binary missing on this Mac'
  });
  assert.equal(decision.result, 'rejected');
  assert.equal(decision.adopted, false);
  assert.match(decision.reason, /binary missing/);
});
