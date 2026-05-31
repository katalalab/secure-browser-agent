import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLightpandaDecision, formatLightpandaDecisionMarkdown, writeLightpandaDecision } from '../src/lightpanda-decision.mjs';

const missingDoctor = {
  readyForPublicBenchmark: false,
  readyForSourceBuild: false,
  binary: {
    exists: false,
    path: '',
    version: ''
  },
  source: {
    cloneExists: true,
    cloneDir: '/tmp/lightpanda',
    minimumZigVersion: '0.15.2'
  },
  checks: [
    { name: 'binary.available', status: 'manual-required', detail: 'No executable found.' },
    { name: 'build.zig', status: 'missing', detail: 'Zig is not installed.' }
  ],
  benchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com'
};

test('Lightpanda decision builds a secret-free reject proof from doctor evidence', () => {
  const report = buildLightpandaDecision({
    generatedAt: '2026-05-28T00:00:00.000Z',
    decision: 'reject',
    doctor: missingDoctor
  });

  assert.equal(report.type, 'lightpanda-public-decision');
  assert.equal(report.provider, 'lightpanda');
  assert.equal(report.ok, true);
  assert.equal(report.result, 'rejected');
  assert.equal(report.publicOnly, true);
  assert.equal(report.secretFree, true);
  assert.equal(report.evidence.doctor.binaryExists, false);
  assert.equal(report.evidence.doctor.failingChecks.length, 2);
  assert.match(formatLightpandaDecisionMarkdown(report), /Decision: reject/);
});

test('Lightpanda decision refuses adopt without a benchmark-ready executable', () => {
  assert.throws(
    () => buildLightpandaDecision({ decision: 'adopt', doctor: missingDoctor }),
    /cannot be adopted/
  );
});

test('Lightpanda decision writes only under runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-lightpanda-decision-'));
  try {
    const report = buildLightpandaDecision({ decision: 'reject', doctor: missingDoctor });
    const written = writeLightpandaDecision(root, report);
    assert.equal(written, path.join(root, 'runs', 'provider-benchmarks', 'lightpanda-decision.json'));
    assert.throws(() => writeLightpandaDecision(root, report, '../leak.json'), /must stay under runs/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
