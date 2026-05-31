import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkOutputShape, expandBenchmarkRecipe, formatTargetBenchmarkMarkdown, runTargetBenchmark, writeTargetBenchmarkReport } from '../src/target-benchmark.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makePack() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-bench-test-'));
  const pack = path.join(root, 'pack');
  writeJson(path.join(pack, 'policy.json'), {
    allowedOrigins: ['data:', 'https://html.duckduckgo.com'],
    defaultProfile: 'bench',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: 'pack/outputs',
    profileDir: 'pack/profiles',
    redactKeys: ['cookie', 'authorization']
  });
  writeJson(path.join(pack, 'target.json'), {
    schemaVersion: 1,
    target: 'bench',
    profile: 'bench',
    pageUrl: 'data:text/html,%3Ch1%3EBench%3C%2Fh1%3E',
    query: 'example domain',
    searchProvider: 'duckduckgo'
  });
  writeJson(path.join(pack, 'recipes', 'observe.json'), {
    url: 'data:text/html,%3Ch1%3EBench%3C%2Fh1%3E',
    steps: [{ type: 'observe', as: 'page' }]
  });
  return { root, pack };
}

test('target benchmark expands search recipes into allowed CDP steps', () => {
  const recipe = expandBenchmarkRecipe({
    provider: 'duckduckgo',
    steps: [{ type: 'search', query: 'agent browser', as: 'search' }]
  });
  assert.deepEqual(recipe.steps.map((step) => step.type), ['goto', 'outline', 'search-status']);
  assert.match(recipe.steps[0].url, /^https:\/\/html\.duckduckgo\.com\/html\/\?q=/);
});

test('target benchmark summarizes output without page text', () => {
  const shape = benchmarkOutputShape({
    steps: [
      {
        output: {
          links: [{ text: 'A', href: '/a' }],
          controls: [{ tag: 'input' }],
          rows: [{ text: 'row' }]
        }
      }
    ]
  });
  assert.deepEqual(shape, {
    steps: 1,
    pages: 0,
    links: 1,
    controls: 1,
    rows: 1
  });
});

test('target benchmark measures cold and daemon modes with injected runner', async () => {
  const { root, pack } = makePack();
  const calls = [];
  let stopped = false;
  try {
    const report = await runTargetBenchmark(pack, {
      audit: false,
      iterations: 2,
      recipes: 'observe',
      runRecipe: async (recipe, profileDir, options) => {
        calls.push({ recipe, profileDir, daemon: Boolean(options.daemon) });
        return {
          ok: true,
          steps: [
            {
              output: {
                links: [{ text: 'A', href: '/a' }],
                controls: [{ tag: 'input' }]
              }
            }
          ]
        };
      },
      startDaemon: async () => ({ ok: true, started: true, reused: false }),
      stopDaemon: async () => {
        stopped = true;
        return { ok: true, stopped: true };
      }
    });

    assert.equal(report.target, 'bench');
    assert.equal(report.results.length, 2);
    assert.deepEqual(report.results.map((item) => item.mode), ['target-cdp-cold', 'target-cdp-daemon']);
    assert.equal(calls.length, 4);
    assert.equal(calls.filter((item) => item.daemon).length, 2);
    assert.equal(stopped, true);
    assert.match(formatTargetBenchmarkMarkdown(report), /target-cdp-daemon/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target benchmark writes JSON proof artifacts only under the target pack', () => {
  const { root, pack } = makePack();
  try {
    const report = {
      generatedAt: '2026-05-27T00:00:00.000Z',
      target: 'bench',
      preflight: { ok: true },
      recommendation: { fastestMode: 'target-cdp-daemon', fastestRecipe: 'observe' },
      results: [{ ok: true, mode: 'target-cdp-daemon', recipe: 'observe' }]
    };
    const written = writeTargetBenchmarkReport(pack, report, 'proof/target-benchmark.json');
    assert.equal(written, path.join(pack, 'proof', 'target-benchmark.json'));
    assert.equal(JSON.parse(fs.readFileSync(written, 'utf8')).target, 'bench');
    assert.throws(() => writeTargetBenchmarkReport(pack, report, '../leak.json'), /must stay under target pack/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
