import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackgroundMonitorPlan, formatBackgroundMonitorPlanCompact, formatBackgroundMonitorPlanMarkdown } from '../src/background-monitor-plan.mjs';

test('background monitor plan emits monitor-only proof gate watch commands', async () => {
  const plan = await buildBackgroundMonitorPlan({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    timeoutMs: 120000,
    intervalMs: 2500,
    safeCommand: {
      status: 'incomplete',
      complete: false,
      target: 'github',
      commandId: 'auth-watch',
      monitorOnly: true,
      mayOpenBrowser: false,
      startsCapture: false,
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'auth-check-not-ok'
    }
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.monitorOnly, true);
  assert.equal(plan.opensBrowserNow, false);
  assert.equal(plan.startsCapture, false);
  assert.equal(plan.currentSafeCommandId, 'auth-watch');
  assert.equal(plan.currentSafeCommandMonitorOnly, true);
  assert.equal(plan.currentSafeCommandMayOpenBrowser, false);
  assert.equal(plan.currentSafeCommandStartsCapture, false);
  assert.equal(plan.paths.statusOut, 'operator/background-proof-gate-watch-status.json');
  assert.match(plan.commands.foregroundWatch.shell, /proof-gate-watch/);
  assert.match(plan.commands.foregroundWatch.shell, /--write/);
  assert.match(plan.commands.foregroundWatch.shell, /--timeout-ms' '120000/);
  assert.match(plan.commands.backgroundWatch.shell, /^mkdir -p 'runs\/operator' && nohup /);
  assert.match(plan.commands.backgroundWatch.shell, /> 'runs\/operator\/background-proof-gate-watch\.log' 2>&1 & echo \$! > 'runs\/operator\/background-proof-gate-watch\.pid'$/);
  assert.match(plan.commands.pollStatus.shell, /proof-gate-status/);

  const compact = formatBackgroundMonitorPlanCompact(plan);
  assert.match(compact, /^monitor_only: yes$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture: no$/m);
  assert.match(compact, /^background_watch_command: mkdir -p 'runs\/operator' && nohup /m);
  assert.doesNotMatch(compact, /OP_SERVICE_ACCOUNT_TOKEN=/);

  const markdown = formatBackgroundMonitorPlanMarkdown(plan);
  assert.match(markdown, /Background Monitor Plan/);
  assert.match(markdown, /background-proof-gate-watch-status/);
});

test('background monitor plan rejects parent-relative paths', async () => {
  await assert.rejects(
    () => buildBackgroundMonitorPlan({
      rootDir: '/tmp/sba',
      statusOut: '../bad.json',
      safeCommand: {}
    }),
    /invalid background monitor path/
  );
  await assert.rejects(
    () => buildBackgroundMonitorPlan({
      rootDir: '/tmp/sba',
      logPath: '/tmp/bad.log',
      safeCommand: {}
    }),
    /invalid background monitor path/
  );
});
