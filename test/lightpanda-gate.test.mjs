import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLightpandaGate, formatLightpandaGateCompact } from '../src/lightpanda-gate.mjs';

function writeProof(root, report) {
  const file = path.join(root, 'runs', 'provider-benchmarks', 'lightpanda-public.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

test('lightpanda gate accepts only summarized public benchmark proof', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-lightpanda-gate-'));
  try {
    let gate = buildLightpandaGate(root, { generatedAt: '2026-06-01T00:00:00.000Z' });
    assert.equal(gate.accepted, false);
    assert.equal(gate.status, 'missing-proof');

    writeProof(root, {
      generatedAt: '2026-06-01T00:00:00.000Z',
      fixture: { url: 'https://example.com/catalog' },
      results: [{ provider: 'lightpanda', ok: true, skipped: false, meanMs: 12 }]
    });
    gate = buildLightpandaGate(root, { generatedAt: '2026-06-01T00:00:01.000Z' });
    assert.equal(gate.accepted, true);
    assert.equal(gate.authenticatedProfilesAllowed, false);
    assert.match(formatLightpandaGateCompact(gate), /^accepted: yes$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
