import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPlaywrightDoctor, formatPlaywrightDoctorCompact, formatPlaywrightDoctorMarkdown } from '../src/playwright-doctor.mjs';

function makeExecutable(filePath, body = '#!/bin/sh\necho "ok"\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
  fs.chmodSync(filePath, 0o755);
}

test('playwright doctor reports missing core package and browser cache', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-playwright-missing-'));
  const report = buildPlaywrightDoctor({
    rootDir,
    siblingRootDir: path.join(rootDir, 'missing-sibling'),
    homeDir: path.join(rootDir, 'home'),
    generatedAt: '2026-05-31T00:00:00.000Z',
    env: { PATH: '' }
  });
  assert.equal(report.role, 'test-rich-automation-adapter');
  assert.equal(report.readyForPublicSmoke, false);
  assert.equal(report.readyForAuthenticatedDefault, false);
  assert.equal(report.storageStateSensitive, true);
  assert.equal(report.core.packageExists, false);
  assert.equal(report.core.indexExists, false);
  assert.equal(report.browser.chromeForTesting.exists, false);
  assert.equal(report.checks.find((item) => item.name === 'auth.storage-state-boundary').status, 'manual-required');
  assert.match(report.installCommands.join('\n'), /npm install --save-dev playwright-core/);
  assert.equal(report.installPlanRequiresOperatorApproval, true);
  assert.equal(report.installPlanAgentMayRunUnattended, false);
  assert.equal(report.installPlanMutatesRuntime, true);
  assert.equal(report.smokeRequiresOperatorApproval, false);
  assert.equal(report.smokeAgentMayRunUnattended, false);
  assert.equal(report.smokeStartsBrowser, true);
  assert.equal(report.smokeReadsBrowserStorage, false);
  assert.equal(report.smokeReturnsPageContent, false);
  assert.equal(report.publicSmokeProof.exists, false);
  assert.equal(report.publicSmokeProof.ok, false);
  assert.match(report.publicSmokeProof.path, /runs\/provider-benchmarks\/playwright-public-smoke\.json$/);
  assert.match(report.smokeProofCommand, /provider-benchmarks\/playwright-public-smoke\.json/);
  assert.equal(report.smokeProofAgentMayRunUnattended, false);
  assert.equal(report.smokeProofStartsBrowser, true);
  assert.equal(report.smokeProofReadsBrowserStorage, false);
  assert.equal(report.smokeProofReturnsPageContent, false);

  const compact = formatPlaywrightDoctorCompact(report);
  assert.match(compact, /^role: test-rich-automation-adapter$/m);
  assert.match(compact, /^ready_for_public_smoke: no$/m);
  assert.match(compact, /^ready_for_authenticated_default: no$/m);
  assert.match(compact, /^core_package_exists: no$/m);
  assert.match(compact, /^core_index_exists: no$/m);
  assert.match(compact, /^chrome_for_testing_exists: no$/m);
  assert.match(compact, /^storage_state_sensitive: yes$/m);
  assert.match(compact, /^missing_checks: package\.playwright-core,core\.index,browser\.chrome-for-testing,runtime\.node,auth\.storage-state-boundary$/m);
  assert.match(compact, /^install_requires_operator_approval: yes$/m);
  assert.match(compact, /^install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^install_mutates_runtime: yes$/m);
  assert.match(compact, /^smoke_command: node src\/cli\.mjs outline-playwright /m);
  assert.match(compact, /^smoke_agent_may_run_unattended: no$/m);
  assert.match(compact, /^smoke_starts_browser: yes$/m);
  assert.match(compact, /^smoke_reads_browser_storage: no$/m);
  assert.match(compact, /^public_smoke_proof_exists: no$/m);
  assert.match(compact, /^public_smoke_proof_ok: no$/m);
  assert.match(compact, /^smoke_proof_command: node src\/cli\.mjs outline-playwright .*--out provider-benchmarks\/playwright-public-smoke\.json$/m);
  assert.match(compact, /^smoke_proof_agent_may_run_unattended: no$/m);
  assert.match(compact, /^smoke_proof_starts_browser: yes$/m);
  assert.match(compact, /^smoke_proof_reads_browser_storage: no$/m);
  assert.match(compact, /^smoke_proof_returns_page_content: no$/m);
  assert.doesNotMatch(compact, /^\{/);
});

test('playwright doctor accepts local package and configured Chrome for Testing', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-playwright-ready-'));
  const packageJson = path.join(rootDir, 'node_modules/playwright-core/package.json');
  fs.mkdirSync(path.dirname(packageJson), { recursive: true });
  fs.writeFileSync(packageJson, JSON.stringify({ version: '1.99.0-test' }));
  fs.writeFileSync(path.join(path.dirname(packageJson), 'index.js'), 'export const chromium = {};\n');
  const binDir = path.join(rootDir, 'bin');
  makeExecutable(path.join(binDir, 'node'), '#!/bin/sh\necho "v22.0.0-test"\n');
  makeExecutable(path.join(binDir, 'npm'), '#!/bin/sh\necho "11.0.0-test"\n');
  const chrome = path.join(rootDir, 'chrome-for-testing');
  makeExecutable(chrome);
  const proofPath = path.join(rootDir, 'runs/provider-benchmarks/playwright-public-smoke.json');
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, JSON.stringify({
    headings: [{ level: 'h1', text: 'PW' }],
    links: [{ text: 'A', href: 'https://example.com/a' }]
  }));

  const report = buildPlaywrightDoctor({
    rootDir,
    siblingRootDir: path.join(rootDir, 'missing-sibling'),
    generatedAt: '2026-05-31T00:00:00.000Z',
    env: {
      PATH: binDir,
      PLAYWRIGHT_CHROMIUM_EXECUTABLE: chrome
    }
  });
  assert.equal(report.readyForPublicSmoke, true);
  assert.equal(report.core.packageExists, true);
  assert.equal(report.core.indexExists, true);
  assert.equal(report.core.version, '1.99.0-test');
  assert.equal(report.browser.chromeForTesting.exists, true);
  assert.equal(report.smokeAgentMayRunUnattended, true);
  assert.equal(report.publicSmokeProof.exists, true);
  assert.equal(report.publicSmokeProof.ok, true);
  assert.equal(report.publicSmokeProof.headingCount, 1);
  assert.equal(report.publicSmokeProof.linkCount, 1);
  assert.equal(report.smokeProofAgentMayRunUnattended, true);
  const markdown = formatPlaywrightDoctorMarkdown(report);
  assert.match(markdown, /Ready for public smoke: yes/);
  assert.match(markdown, /Ready for authenticated default: no/);
  assert.match(markdown, /Saved proof: .*playwright-public-smoke\.json/);
  const compact = formatPlaywrightDoctorCompact(report);
  assert.match(compact, /^ready_for_public_smoke: yes$/m);
  assert.match(compact, /^core_version: 1\.99\.0-test$/m);
  assert.match(compact, /^configured_core_path_exists: no$/m);
  assert.match(compact, /^smoke_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^public_smoke_proof_exists: yes$/m);
  assert.match(compact, /^public_smoke_proof_ok: yes$/m);
  assert.match(compact, /^public_smoke_proof_heading_count: 1$/m);
  assert.match(compact, /^public_smoke_proof_link_count: 1$/m);
  assert.match(compact, /^smoke_proof_agent_may_run_unattended: yes$/m);
});
