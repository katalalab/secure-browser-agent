import fs from 'node:fs';
import path from 'node:path';
import { runRecipeWithCdp, startCdpDaemon, stopCdpDaemon } from './cdp-backend.mjs';
import { assertAllowedUrl, loadPolicy, profilePath } from './policy.mjs';
import { auditTargetPack } from './security-audit.mjs';
import { resolveTargetPack, resolveTargetRun } from './target-pack.mjs';
import { summarizeDurations } from './provider-benchmark.mjs';

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function csv(value, fallback = []) {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safePackArtifactPath(packDir, outPath) {
  const target = path.resolve(packDir, outPath || path.join('proof', 'target-benchmark.json'));
  const relative = path.relative(packDir, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`target benchmark output must stay under target pack: ${outPath}`);
  }
  return target;
}

export function writeTargetBenchmarkReport(targetDir, report, outPath = '') {
  const pack = resolveTargetPack(targetDir);
  const target = safePackArtifactPath(pack.dir, outPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return target;
}

function searchUrl(provider, query) {
  const encoded = encodeURIComponent(query);
  if (provider === 'brave') return `https://search.brave.com/search?q=${encoded}`;
  if (provider === 'google') return `https://www.google.com/search?igu=1&q=${encoded}`;
  return `https://html.duckduckgo.com/html/?q=${encoded}`;
}

export function expandBenchmarkRecipe(recipe) {
  const copy = JSON.parse(JSON.stringify(recipe));
  copy.steps = (copy.steps || []).flatMap((step, index) => {
    if ((step.type || step.action) !== 'search') return [step];
    if (!step.query) throw new Error(`recipe step ${index + 1} search requires query`);
    const as = step.as || `search${index + 1}`;
    const provider = step.provider || copy.provider || 'duckduckgo';
    return [
      { type: 'goto', url: searchUrl(provider, step.query), as: `${as}_goto` },
      { type: 'outline', as, linkLimit: step.linkLimit || 50 },
      { type: 'search-status', provider, query: step.query, from: as, as: `${as}_status`, linkLimit: step.linkLimit || 50 }
    ];
  });
  return copy;
}

export function assertBenchmarkRecipeAllowed(recipe, policy) {
  if (recipe.url) assertAllowedUrl(recipe.url, policy);
  for (const url of recipe.urls || []) assertAllowedUrl(url, policy);
  for (const step of recipe.steps || []) {
    if (step.url) assertAllowedUrl(step.url, policy);
  }
}

function collectCounts(value, counts = { links: 0, controls: 0, rows: 0 }) {
  if (!value || typeof value !== 'object') return counts;
  if (Array.isArray(value)) {
    for (const item of value) collectCounts(item, counts);
    return counts;
  }
  if (Array.isArray(value.links)) counts.links += value.links.length;
  if (Array.isArray(value.controls)) counts.controls += value.controls.length;
  if (Array.isArray(value.rows)) counts.rows += value.rows.length;
  for (const item of Object.values(value)) collectCounts(item, counts);
  return counts;
}

export function benchmarkOutputShape(output) {
  const counts = collectCounts(output);
  return {
    steps: Array.isArray(output?.steps) ? output.steps.length : 0,
    pages: Array.isArray(output?.pages) ? output.pages.length : 0,
    links: counts.links,
    controls: counts.controls,
    rows: counts.rows
  };
}

function failed(mode, recipe, error) {
  return {
    mode,
    recipe,
    ok: false,
    reason: error?.message || String(error),
    iterations: 0,
    minMs: 0,
    meanMs: 0,
    maxMs: 0
  };
}

async function measureRecipe({ mode, recipeName, recipe, iterations, profileDir, runRecipe, daemon }) {
  const durationsMs = [];
  let shape = {};
  for (let index = 0; index < iterations; index += 1) {
    const started = nowMs();
    const output = await runRecipe(recipe, profileDir, {
      daemon,
      artifactManifest: false
    });
    durationsMs.push(nowMs() - started);
    shape = benchmarkOutputShape(output);
  }
  return {
    mode,
    recipe: recipeName,
    ok: true,
    ...summarizeDurations(durationsMs),
    outputShape: shape
  };
}

function loadRecipes(targetDir, recipeNames, options = {}) {
  return recipeNames.map((recipeName) => {
    const target = resolveTargetRun(targetDir, recipeName, options);
    const recipe = expandBenchmarkRecipe(readJson(target.recipe));
    return {
      recipeName,
      recipeFile: target.recipe,
      recipe
    };
  });
}

function auditErrorMessage(audit) {
  const errors = (audit.checks || []).filter((item) => !item.ok && item.level === 'error');
  return `target-benchmark preflight failed: ${errors.map((item) => `${item.name}=${item.detail}`).join('; ')}`;
}

export async function runTargetBenchmark(targetDir, options = {}) {
  const pack = resolveTargetPack(targetDir);
  const policy = loadPolicy(pack.policy);
  const profile = options.profile || pack.metadata.profile || pack.targetPolicy.defaultProfile || pack.metadata.target || path.basename(pack.dir);
  const iterations = Math.max(1, Number(options.iterations || 1));
  const recipeNames = csv(options.recipes, ['observe', 'inspect']);
  const modes = csv(options.modes, ['cold', 'daemon']);
  const runRecipe = options.runRecipe || runRecipeWithCdp;
  const startDaemon = options.startDaemon || startCdpDaemon;
  const stopDaemon = options.stopDaemon || stopCdpDaemon;
  const targetProfileDir = profilePath(policy, profile);
  const preflight = options.audit === false
    ? { ok: true, skipped: true, checks: [] }
    : (options.preflight || await auditTargetPack(pack.dir, { profile }));

  if (!preflight.ok && options.enforceAudit !== false) {
    throw new Error(auditErrorMessage(preflight));
  }

  fs.mkdirSync(targetProfileDir, { recursive: true });
  if (pack.metadata.pageUrl) assertAllowedUrl(pack.metadata.pageUrl, policy);

  const recipes = loadRecipes(pack.dir, recipeNames, { profile });
  for (const item of recipes) assertBenchmarkRecipeAllowed(item.recipe, policy);

  const results = [];
  if (modes.includes('cold')) {
    for (const item of recipes) {
      try {
        results.push(await measureRecipe({
          mode: 'target-cdp-cold',
          recipeName: item.recipeName,
          recipe: item.recipe,
          iterations,
          profileDir: targetProfileDir,
          runRecipe,
          daemon: false
        }));
      } catch (error) {
        results.push(failed('target-cdp-cold', item.recipeName, error));
      }
    }
  }

  let daemonStarted = null;
  let setupMs = 0;
  if (modes.includes('daemon')) {
    try {
      const started = nowMs();
      daemonStarted = await startDaemon(targetProfileDir, {
        initialUrl: pack.metadata.pageUrl || 'about:blank'
      });
      setupMs = round(nowMs() - started);
      for (const item of recipes) {
        try {
          results.push({
            ...(await measureRecipe({
              mode: 'target-cdp-daemon',
              recipeName: item.recipeName,
              recipe: item.recipe,
              iterations,
              profileDir: targetProfileDir,
              runRecipe,
              daemon: true
            })),
            setupMs
          });
        } catch (error) {
          results.push(failed('target-cdp-daemon', item.recipeName, error));
        }
      }
    } catch (error) {
      for (const item of recipes) results.push(failed('target-cdp-daemon', item.recipeName, error));
    } finally {
      if (daemonStarted?.started && !daemonStarted.reused) {
        await stopDaemon(targetProfileDir).catch(() => {});
      }
    }
  }

  const successful = results.filter((item) => item.ok);
  const fastest = successful.length
    ? successful.reduce((best, item) => (item.meanMs < best.meanMs ? item : best), successful[0])
    : null;

  return {
    generatedAt: new Date().toISOString(),
    target: pack.metadata.target || path.basename(pack.dir),
    dir: pack.dir,
    policy: pack.policy,
    profile,
    iterations,
    recipes: recipes.map((item) => ({
      name: item.recipeName,
      file: item.recipeFile
    })),
    preflight: {
      ok: preflight.ok,
      skipped: Boolean(preflight.skipped),
      checks: (preflight.checks || []).map((item) => ({
        level: item.level,
        name: item.name,
        ok: item.ok,
        detail: item.detail
      }))
    },
    recommendation: {
      fastestMode: fastest?.mode || '',
      fastestRecipe: fastest?.recipe || '',
      note: 'Use daemon mode for repeated authenticated target-pack work when the preflight audit is clean.'
    },
    results
  };
}

export function formatTargetBenchmarkMarkdown(report) {
  const lines = [
    '# Secure Browser Agent Target Benchmark',
    '',
    `Generated: ${report.generatedAt}`,
    `Target: ${report.target}`,
    `Profile: ${report.profile}`,
    `Iterations: ${report.iterations}`,
    `Preflight: ${report.preflight.ok ? 'ok' : 'failed'}${report.preflight.skipped ? ' (skipped)' : ''}`,
    `Fastest: ${report.recommendation.fastestMode || 'none'}${report.recommendation.fastestRecipe ? ` / ${report.recommendation.fastestRecipe}` : ''}`,
    '',
    '| Mode | Recipe | Status | Mean ms | Min ms | Max ms | Shape | Notes |',
    '| --- | --- | --- | ---: | ---: | ---: | --- | --- |'
  ];

  for (const item of report.results) {
    const status = item.ok ? 'ok' : 'failed';
    const shape = item.outputShape
      ? `steps=${item.outputShape.steps || 0}, pages=${item.outputShape.pages || 0}, links=${item.outputShape.links || 0}, controls=${item.outputShape.controls || 0}, rows=${item.outputShape.rows || 0}`
      : '';
    const note = item.setupMs ? `setup ${item.setupMs} ms` : (item.reason || '');
    lines.push(`| ${item.mode} | ${item.recipe} | ${status} | ${item.meanMs} | ${item.minMs} | ${item.maxMs} | ${shape} | ${note} |`);
  }

  lines.push(
    '',
    `Decision: ${report.recommendation.note}`
  );
  if (report.outputPath) lines.push(`Written: ${report.outputPath}`);
  lines.push('');
  return lines.join('\n');
}
