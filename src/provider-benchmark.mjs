import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAgentBrowser, sessionArgs } from './agent-browser.mjs';
import { observeWithCdp, startCdpDaemon, stopCdpDaemon } from './cdp-backend.mjs';
import { buildObserveScript } from './extract-script.mjs';
import { outlineWithPlaywright } from './playwright-adapter.mjs';
import { detectProviderStatus, recommendProviders } from './provider-report.mjs';

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function safeRunsArtifactPath(rootDir, outPath) {
  const runsDir = path.resolve(rootDir, 'runs');
  const target = path.resolve(runsDir, outPath || path.join('provider-benchmarks', 'latest.json'));
  const relative = path.relative(runsDir, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`provider benchmark output must stay under runs/: ${outPath}`);
  }
  return target;
}

export function writeProviderBenchmarkReport(rootDir, report, outPath = '') {
  const target = safeRunsArtifactPath(rootDir, outPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return target;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function findProviderBenchmarkProofs(rootDir = process.cwd()) {
  const dir = path.join(rootDir, 'runs', 'provider-benchmarks');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(dir, entry.name))
    .map((filePath) => ({
      path: filePath,
      report: readJson(filePath)
    }))
    .filter((item) => item.report);
}

export function lightpandaPublicBenchmarkDecision(report) {
  if (report?.type === 'lightpanda-public-decision' && report.provider === 'lightpanda' && report.ok) {
    const adopted = report.decision === 'adopt';
    if (!adopted && report.decision !== 'reject') return null;
    return {
      ok: true,
      adopted,
      result: adopted ? 'proved' : 'rejected',
      reason: report.reason || (adopted ? 'operator adopted Lightpanda' : 'operator rejected Lightpanda')
    };
  }
  const lightpanda = (report?.results || []).find((item) => item.provider === 'lightpanda');
  const publicUrl = Boolean(report?.fixture?.url && /^https?:\/\//.test(report.fixture.url));
  if (!publicUrl || !lightpanda || lightpanda.skipped) return null;
  return {
    ok: true,
    adopted: Boolean(lightpanda.ok),
    result: lightpanda.ok ? 'proved' : 'rejected',
    reason: lightpanda.ok ? `meanMs=${lightpanda.meanMs}` : (lightpanda.reason || 'lightpanda benchmark failed')
  };
}

export function summarizeDurations(durationsMs) {
  if (!durationsMs.length) {
    return { iterations: 0, minMs: 0, meanMs: 0, maxMs: 0 };
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const total = durationsMs.reduce((sum, value) => sum + value, 0);
  return {
    iterations: durationsMs.length,
    minMs: round(sorted[0]),
    meanMs: round(total / durationsMs.length),
    maxMs: round(sorted[sorted.length - 1])
  };
}

function fixtureHtml(rowCount = 40) {
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const id = String(index + 1).padStart(3, '0');
    return `<li class="item"><a href="/item/${id}">Item ${id}</a><span class="price">${1000 + index}</span></li>`;
  }).join('');
  return `<!doctype html>
<html>
  <head><title>SBA Benchmark</title></head>
  <body>
    <main>
      <h1>Catalog</h1>
      <label>Search<input name="q"></label>
      <ul>${rows}</ul>
    </main>
  </body>
</html>`;
}

export function benchmarkDataUrl(rowCount = 40) {
  return `data:text/html,${encodeURIComponent(fixtureHtml(rowCount))}`;
}

function benchmarkOrigin(rawUrl) {
  if (!rawUrl) return 'data:';
  if (String(rawUrl).startsWith('data:')) return 'data:';
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`benchmark --url only supports http(s) or data: URLs: ${url.protocol}`);
  }
  return url.origin;
}

function outputShape(output) {
  return {
    headings: output?.headings?.length || 0,
    links: output?.links?.length || 0,
    controls: output?.controls?.length || 0,
    textBytes: Buffer.byteLength(output?.textSample || output?.title || '', 'utf8')
  };
}

async function measureProvider(provider, iterations, runOnce) {
  const durationsMs = [];
  let lastShape = {};
  for (let index = 0; index < iterations; index += 1) {
    const started = nowMs();
    const output = await runOnce(index);
    durationsMs.push(nowMs() - started);
    lastShape = outputShape(output);
  }
  return {
    provider,
    ok: true,
    ...summarizeDurations(durationsMs),
    outputShape: lastShape
  };
}

function skipped(provider, reason) {
  return {
    provider,
    ok: false,
    skipped: true,
    reason,
    iterations: 0,
    minMs: 0,
    meanMs: 0,
    maxMs: 0
  };
}

function failed(provider, error) {
  return {
    provider,
    ok: false,
    skipped: false,
    reason: error?.message || String(error),
    iterations: 0,
    minMs: 0,
    meanMs: 0,
    maxMs: 0
  };
}

async function runAgentBrowserObserve({ url, profileName, policy, engine = 'chrome', executablePath = '' }) {
  const args = sessionArgs(policy, profileName, {
    engine,
    executablePath,
    skipAllowedDomains: String(url).startsWith('data:')
  });
  try {
    await runAgentBrowser([...args, 'open', url], { timeoutMs: 15000 });
    const result = await runAgentBrowser([...args, 'eval', '--stdin'], {
      stdin: buildObserveScript({ linkLimit: 20, controlLimit: 20, textLimit: 400 }),
      timeoutMs: 15000
    });
    return JSON.parse(result.stdout);
  } finally {
    await runAgentBrowser(['--session', profileName, 'close'], { timeoutMs: 5000 }).catch(() => {});
  }
}

async function benchmarkDirectCdpCold({ status, url, profileDir, iterations }) {
  if (!status.chromeForTesting?.exists) return skipped('direct-cdp-cold', 'Chrome for Testing is missing');
  return measureProvider('direct-cdp-cold', iterations, (index) => observeWithCdp(url, path.join(profileDir, `direct-cold-${index}`), {
    linkLimit: 20,
    controlLimit: 20,
    textLimit: 400
  })).catch((error) => failed('direct-cdp-cold', error));
}

async function benchmarkDirectCdpDaemon({ status, url, profileDir, iterations }) {
  if (!status.chromeForTesting?.exists) return skipped('direct-cdp-daemon', 'Chrome for Testing is missing');
  const daemonProfile = path.join(profileDir, 'direct-daemon');
  let setupMs = 0;
  try {
    const started = nowMs();
    await startCdpDaemon(daemonProfile);
    setupMs = round(nowMs() - started);
    const result = await measureProvider('direct-cdp-daemon', iterations, () => observeWithCdp(url, daemonProfile, {
      daemon: true,
      linkLimit: 20,
      controlLimit: 20,
      textLimit: 400
    }));
    return { ...result, setupMs };
  } catch (error) {
    return failed('direct-cdp-daemon', error);
  } finally {
    await stopCdpDaemon(daemonProfile).catch(() => {});
  }
}

async function benchmarkAgentBrowser({ status, url, policy, iterations }) {
  if (!status.agentBrowser?.exists) return skipped('agent-browser-chrome', 'agent-browser CLI is missing');
  return measureProvider('agent-browser-chrome', iterations, (index) => runAgentBrowserObserve({
    url,
    profileName: `bench-agent-browser-${index}`,
    policy,
    engine: 'chrome'
  })).catch((error) => failed('agent-browser-chrome', error));
}

async function benchmarkPlaywright({ status, url, iterations }) {
  if (!status.playwright?.coreExists) return skipped('playwright', 'playwright-core is missing');
  return measureProvider('playwright', iterations, () => outlineWithPlaywright(url, { linkLimit: 20 }))
    .catch((error) => failed('playwright', error));
}

async function benchmarkLightpanda({ status, url, policy, iterations }) {
  if (!status.lightpanda?.binaryExists) return skipped('lightpanda', 'lightpanda binary is missing');
  return measureProvider('lightpanda', iterations, (index) => runAgentBrowserObserve({
    url,
    profileName: `bench-lightpanda-${index}`,
    policy,
    engine: 'lightpanda',
    executablePath: status.lightpanda.binaryPath
  })).catch((error) => failed('lightpanda', error));
}

export async function runProviderBenchmark(options = {}) {
  const iterations = Math.max(1, Number(options.iterations || 2));
  const rowCount = Math.max(1, Number(options.rowCount || 40));
  const quick = Boolean(options.quick);
  const rootDir = options.rootDir || process.cwd();
  const status = options.status || detectProviderStatus({ rootDir });
  const url = options.url || benchmarkDataUrl(rowCount);
  const origin = benchmarkOrigin(url);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-provider-bench-'));
  const profileDir = path.join(tempDir, 'profiles');
  const outputDir = path.join(tempDir, 'runs');
  const policy = {
    source: 'provider-benchmark',
    allowedOrigins: [origin],
    allowedEngines: ['chrome', 'lightpanda'],
    authenticatedEngines: ['chrome'],
    defaultProfile: 'benchmark',
    profileDir,
    outputDir,
    maxEvalBytes: 100000,
    redactKeys: ['cookie', 'authorization', 'token', 'secret', 'password']
  };

  try {
    const results = [
      await benchmarkDirectCdpCold({ status, url, profileDir, iterations }),
      await benchmarkDirectCdpDaemon({ status, url, profileDir, iterations })
    ];

    if (!quick) {
      results.push(
        await benchmarkAgentBrowser({ status, url, policy, iterations }),
        await benchmarkPlaywright({ status, url, iterations }),
        await benchmarkLightpanda({ status, url, policy, iterations }),
        skipped('selenium', status.selenium?.webdriverPackageExists ? 'benchmark adapter not implemented; Selenium remains compatibility-only' : 'selenium-webdriver package is missing')
      );
    }

    const successful = results.filter((item) => item.ok);
    const fastest = successful.length
      ? successful.reduce((best, item) => (item.meanMs < best.meanMs ? item : best), successful[0]).provider
      : '';

    return {
      generatedAt: new Date().toISOString(),
      fixture: {
        rows: options.url ? 0 : rowCount,
        urlKind: origin === 'data:' ? 'data:text/html' : origin,
        url: options.url ? url : '',
        note: options.url
          ? 'Public URL smoke benchmark. Uses temporary profiles only; use target packs for authenticated-site validation.'
          : 'Synthetic local fixture; use target packs for real authenticated-site validation.'
      },
      iterations,
      quick,
      recommendation: {
        ...recommendProviders(status),
        fastestMeasuredProvider: fastest
      },
      results
    };
  } finally {
    if (!options.keepArtifacts) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function formatProviderBenchmarkMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Benchmark',
    '',
    `Generated: ${report.generatedAt}`,
    `Fixture: ${report.fixture.rows} synthetic rows (${report.fixture.urlKind})`,
    `Iterations: ${report.iterations}`,
    `Fastest measured provider: ${report.recommendation.fastestMeasuredProvider || 'none'}`,
    '',
    '| Provider | Status | Mean ms | Min ms | Max ms | Notes |',
    '| --- | --- | ---: | ---: | ---: | --- |'
  ];

  for (const item of report.results) {
    const status = item.ok ? 'ok' : (item.skipped ? 'skipped' : 'failed');
    const note = item.setupMs ? `setup ${item.setupMs} ms` : (item.reason || '');
    lines.push(`| ${item.provider} | ${status} | ${item.meanMs} | ${item.minMs} | ${item.maxMs} | ${note} |`);
  }

  lines.push(
    '',
    `Decision: ${report.recommendation.decision}`
  );
  if (report.outputPath) lines.push(`Written: ${report.outputPath}`);
  lines.push('');
  return lines.join('\n');
}
