#!/usr/bin/env node
// Re-records the golden digests that test/characterization.test.mjs compares against.
//
//   node scripts/record-characterization.mjs            record from the current tree
//   node scripts/record-characterization.mjs --dump DIR also write every normalized stdout/stderr to DIR
//
// Only run this when a behavior change is intended. Cases of tier "sandbox" can reach
// code paths that start a browser or touch the network, so they are recorded under a
// macOS `sandbox-exec` profile that denies network, writes outside the scratch area and
// launching browsers; recording therefore needs macOS.
import fs from 'node:fs';
import path from 'node:path';
import {
  FIXTURE_DIR, REPO_ROOT, createScratch, destroyScratch, exportSurface, loadFixture, runCase, runPool, stripRaw
} from '../test/support/characterization.mjs';

if (process.platform !== 'darwin') {
  console.error('recording needs macOS (sandbox-exec) so that sandbox-tier cases cannot reach a real browser or the network');
  process.exit(1);
}
const dumpIndex = process.argv.indexOf('--dump');
const dumpDir = dumpIndex >= 0 ? path.resolve(process.argv[dumpIndex + 1]) : null;

const cases = loadFixture('cases.json');
const scratch = createScratch();
const recorded = {};
try {
  await runPool(cases, 6, async (testCase) => {
    recorded[testCase.id] = await runCase(scratch, testCase, { sandbox: true });
  });
} finally {
  destroyScratch(scratch);
}

if (dumpDir) {
  fs.mkdirSync(dumpDir, { recursive: true });
  for (const [id, steps] of Object.entries(recorded)) {
    steps.forEach((step, index) => {
      const name = `${id.replace(/[^a-z0-9_.-]/gi, '_')}.${index}.txt`;
      fs.writeFileSync(path.join(dumpDir, name), `exit=${step.exit}\n--- stdout ---\n${step._stdout}\n--- stderr ---\n${step._stderr}\n`);
    });
  }
}

const golden = {
  meta: { platform: process.platform, nodeMajor: Number(process.versions.node.split('.')[0]), recordedBy: 'scripts/record-characterization.mjs' },
  cases: Object.fromEntries(Object.keys(recorded).sort().map((id) => [id, stripRaw(recorded[id])]))
};
fs.writeFileSync(path.join(FIXTURE_DIR, 'golden.json'), `${JSON.stringify(golden, null, 1)}\n`);

// Export surface of every module under src/ except the CLI entry (which has no exports and runs main() on import).
const exportsGolden = {};
for (const file of fs.readdirSync(path.join(REPO_ROOT, 'src')).filter((name) => name.endsWith('.mjs') && name !== 'cli.mjs').sort()) {
  exportsGolden[`src/${file}`] = await exportSurface(path.join(REPO_ROOT, 'src', file));
}
const { listMcpTools } = await import(path.join(REPO_ROOT, 'src', 'mcp-server.mjs'));
const { sha256 } = await import('../test/support/characterization.mjs');
const behavior = { 'src/mcp-server.mjs#listMcpTools': sha256(JSON.stringify(listMcpTools())) };
fs.writeFileSync(path.join(FIXTURE_DIR, 'exports.json'), `${JSON.stringify({ modules: exportsGolden, behavior }, null, 1)}\n`);
console.log(`recorded ${cases.length} cases and ${Object.keys(exportsGolden).length} module export surfaces`);
