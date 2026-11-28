// Pins the externally observable behavior of the CLI and the MCP server so that
// large mechanical refactors (such as splitting src/cli.mjs and src/mcp-server.mjs
// into parts) can be shown to change nothing. Golden data lives in
// test/fixtures/characterization and is produced by scripts/record-characterization.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT, createScratch, destroyScratch, exportSurface, loadFixture, runCase, runPool, sha256, stripRaw
} from './support/characterization.mjs';

const golden = loadFixture('golden.json');
const cases = loadFixture('cases.json');
const exportsGolden = loadFixture('exports.json');
const platformSkip = process.platform === golden.meta.platform
  ? false
  : `golden digests were recorded on ${golden.meta.platform}; this is ${process.platform}`;
// Sandbox-tier cases can reach browser/network code paths. They only run on macOS, under sandbox-exec.
const includeSandboxTier = process.env.SBA_CHARACTERIZE_SANDBOX === '1' && process.platform === 'darwin';

// Functions listed here were intentionally restructured; their source text may change
// while their name, kind and length (and, for listMcpTools, their output) may not.
// buildReadinessAudit now reads the entry files plus their split parts (cli-*.mjs, mcp-*.mjs);
// its output is pinned by the bare:readiness-audit and mcp:sba_readiness_audit cases.
const SOURCE_MAY_CHANGE = new Set([
  'src/mcp-server.mjs#callMcpTool',
  'src/mcp-server.mjs#listMcpTools',
  'src/readiness-audit.mjs#buildReadinessAudit'
]);

test('CLI and MCP outputs match the recorded digests', { skip: platformSkip, timeout: 900000 }, async () => {
  const selected = cases.filter((testCase) => testCase.tier === 'safe' || includeSandboxTier);
  const scratch = createScratch();
  const mismatches = [];
  try {
    await runPool(selected, 8, async (testCase) => {
      const actual = stripRaw(await runCase(scratch, testCase, { sandbox: testCase.tier !== 'safe' }));
      const expected = golden.cases[testCase.id];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(`${testCase.id}: expected ${JSON.stringify(expected)} actual ${JSON.stringify(actual)}`);
      }
    });
  } finally {
    destroyScratch(scratch);
  }
  assert.deepEqual(mismatches.sort(), [], `${mismatches.length} of ${selected.length} cases changed behavior`);
});

test('every recorded case still exists in the case list', () => {
  assert.deepEqual(Object.keys(golden.cases).sort(), cases.map((testCase) => testCase.id).sort());
});

test('module export surfaces match the recorded surfaces', async () => {
  for (const [file, expected] of Object.entries(exportsGolden.modules)) {
    const actual = await exportSurface(path.join(REPO_ROOT, file));
    assert.deepEqual(Object.keys(actual), Object.keys(expected), `${file}: export names changed`);
    for (const name of Object.keys(expected)) {
      const want = { ...expected[name] };
      const have = { ...actual[name] };
      if (SOURCE_MAY_CHANGE.has(`${file}#${name}`)) {
        delete want.sourceSha256;
        delete have.sourceSha256;
      }
      assert.deepEqual(have, want, `${file}#${name}: export changed`);
    }
  }
});

test('listMcpTools returns the same tool definitions', async () => {
  const { listMcpTools } = await import(path.join(REPO_ROOT, 'src', 'mcp-server.mjs'));
  assert.equal(sha256(JSON.stringify(listMcpTools())), exportsGolden.behavior['src/mcp-server.mjs#listMcpTools']);
});

test('src/cli.mjs stays an export-free executable entry point declared as the sba bin', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'cli.mjs'), 'utf8');
  assert.ok(source.startsWith('#!/usr/bin/env node\n'));
  assert.doesNotMatch(source, /^export\s/m);
  assert.equal(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).bin.sba, './src/cli.mjs');
});
