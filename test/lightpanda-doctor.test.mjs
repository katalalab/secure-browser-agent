import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLightpandaDoctor, formatLightpandaDoctorCompact, formatLightpandaDoctorMarkdown } from '../src/lightpanda-doctor.mjs';

function makeClone(root) {
  const cloneDir = path.join(root, 'src/lightpanda-io_browser');
  fs.mkdirSync(cloneDir, { recursive: true });
  fs.writeFileSync(path.join(cloneDir, 'build.zig.zon'), `
.{
    .version = "0.0.0-test",
    .minimum_zig_version = "0.15.2",
}
`);
  fs.mkdirSync(path.join(cloneDir, '.git/refs/heads'), { recursive: true });
  fs.writeFileSync(path.join(cloneDir, '.git/HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(cloneDir, '.git/refs/heads/main'), '1234567890abcdef1234567890abcdef12345678\n');
  fs.writeFileSync(path.join(cloneDir, '.git/config'), '[remote "origin"]\n\turl = https://github.com/lightpanda-io/browser.git\n');
  return cloneDir;
}

test('lightpanda doctor reports missing binary with install and benchmark commands', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-lightpanda-missing-'));
  makeClone(homeDir);
  const report = buildLightpandaDoctor({
    homeDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    platform: 'darwin',
    arch: 'arm64',
    env: { PATH: '' }
  });
  assert.equal(report.readyForPublicBenchmark, false);
  assert.equal(report.source.minimumZigVersion, '0.15.2');
  assert.equal(report.source.commit, '1234567890abcdef1234567890abcdef12345678');
  assert.equal(report.source.remoteOrigin, 'https://github.com/lightpanda-io/browser.git');
  assert.equal(report.download.nightlyUrl.endsWith('/lightpanda-aarch64-macos'), true);
  assert.match(report.benchmarkCommand, /SBA_LIGHTPANDA_PATH=/);
  assert.match(report.benchmarkCommand, /--write --out provider-benchmarks\/lightpanda-public\.json/);
  assert.equal(report.installPlanRequiresOperatorApproval, true);
  assert.equal(report.installPlanAgentMayRunUnattended, false);
  assert.equal(report.installPlanMutatesRuntime, true);
  assert.equal(report.benchmarkRequiresOperatorApproval, false);
  assert.equal(report.benchmarkAgentMayRunUnattended, false);
  assert.equal(report.benchmarkStartsBrowser, true);
  assert.equal(report.benchmarkReadsBrowserStorage, false);
  assert.equal(report.benchmarkReturnsPageContent, false);
  assert.equal(report.checks.find((item) => item.name === 'binary.available').status, 'manual-required');
  const compact = formatLightpandaDoctorCompact(report);
  assert.match(compact, /^ready_for_public_benchmark: no$/m);
  assert.match(compact, /^binary_exists: no$/m);
  assert.match(compact, /^binary_configured: no$/m);
  assert.match(compact, /^source_minimum_zig_version: 0\.15\.2$/m);
  assert.match(compact, /^source_commit: 1234567890ab$/m);
  assert.match(compact, /^source_remote_origin: https:\/\/github\.com\/lightpanda-io\/browser\.git$/m);
  assert.match(compact, /^install_requires_operator_approval: yes$/m);
  assert.match(compact, /^install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^install_mutates_runtime: yes$/m);
  assert.match(compact, /^benchmark_command: /m);
  assert.match(compact, /^benchmark_requires_operator_approval: no$/m);
  assert.match(compact, /^benchmark_agent_may_run_unattended: no$/m);
  assert.match(compact, /^benchmark_starts_browser: yes$/m);
  assert.match(compact, /^benchmark_reads_browser_storage: no$/m);
  assert.match(compact, /^benchmark_returns_page_content: no$/m);
  assert.doesNotMatch(compact, /^\{/);
});

test('lightpanda doctor accepts configured executable and renders markdown', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-lightpanda-ready-'));
  makeClone(homeDir);
  const binDir = path.join(homeDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const binary = path.join(binDir, 'lightpanda');
  fs.writeFileSync(binary, '#!/bin/sh\necho "Lightpanda 0.0.0-test"\n');
  fs.chmodSync(binary, 0o755);
  const report = buildLightpandaDoctor({
    homeDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    env: {
      PATH: '',
      SBA_LIGHTPANDA_PATH: binary,
      LIGHTPANDA_DISABLE_TELEMETRY: 'true'
    }
  });
  assert.equal(report.readyForPublicBenchmark, true);
  assert.equal(report.binary.path, binary);
  assert.match(report.binary.version, /Lightpanda 0.0.0-test/);
  const markdown = formatLightpandaDoctorMarkdown(report);
  assert.match(markdown, /Ready for public benchmark: yes/);
  assert.match(markdown, /LIGHTPANDA_DISABLE_TELEMETRY=true/);
  const compact = formatLightpandaDoctorCompact(report);
  assert.match(compact, /^ready_for_public_benchmark: yes$/m);
  assert.match(compact, /^binary_exists: yes$/m);
  assert.match(compact, /^binary_version_ok: yes$/m);
  assert.match(compact, /^telemetry_disabled: yes$/m);
  assert.match(compact, /^benchmark_agent_may_run_unattended: yes$/m);
});
