import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetBatch, formatTargetBatchCompact } from '../src/target-batch.mjs';

function command(id) {
  return {
    args: ['node', 'src/cli.mjs', id],
    shell: `'node' 'src/cli.mjs' '${id}'`
  };
}

function plan() {
  return {
    target: 'vendor-service',
    dir: '/tmp/vendor-service',
    profile: 'vendor-service',
    realExternal: true,
    externalOrigins: ['https://app.vendor-service.com'],
    currentState: {
      auditOk: true,
      profileLikelyAuthenticated: true,
      permissionsPending: 0,
      daemonRunning: false,
      authCheck: { ok: false },
      missingOutputs: ['observe.json'],
      benchmark: { ok: true },
      proofReady: false
    },
    commands: [
      { id: 'start-daemon', title: 'Start daemon', command: command('target-daemon') },
      { id: 'auth-check', title: 'Auth check', command: command('target-auth-check') },
      { id: 'observe', title: 'Observe', command: command('target-run-observe') },
      { id: 'write-proof', title: 'Write proof', command: command('target-proof') }
    ]
  };
}

test('target batch wraps capture planning in a compact low-token surface', async () => {
  const batch = await buildTargetBatch('/tmp/vendor-service', {
    generatedAt: '2026-06-01T00:00:00.000Z',
    realExternal: true,
    plan: plan()
  });
  assert.equal(batch.run, false);
  assert.equal(batch.status, 'planned');
  assert.equal(batch.stepCount, 4);
  assert.equal(batch.nextStep, 'start-daemon');
  const compact = formatTargetBatchCompact(batch);
  assert.match(compact, /^status: planned$/m);
  assert.match(compact, /^run_command: 'node' 'src\/cli\.mjs' 'target-batch'/m);
});
