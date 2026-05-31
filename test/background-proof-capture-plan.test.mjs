import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackgroundProofCapturePlan, formatBackgroundProofCapturePlanCompact, formatBackgroundProofCapturePlanMarkdown } from '../src/background-proof-capture-plan.mjs';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

const pipeline = {
  target: 'github',
  status: 'incomplete',
  complete: false,
  decision: {
    recommendedNow: 'monitor-auth',
    nextArtifactAction: 'wait-auth-then-capture-proof',
    nextArtifactBlocker: 'auth-check-not-ok'
  },
  operator: {
    captureBlocked: true
  },
  missingArtifactCount: 6,
  missingArtifacts: [
    { id: 'auth-check' },
    { id: 'output:observe.json' },
    { id: 'output:inspect.json' },
    { id: 'output:scrape.csv' },
    { id: 'benchmark' },
    { id: 'target-proof' }
  ],
  phases: {
    monitorAuth: {
      command: command(['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--format', 'compact'])
    },
    openLogin: {
      command: command(['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--open-login', '--wait-auth', '--format', 'compact'])
    },
    waitAuthThenCapture: {
      blockedReason: 'auth-check-not-ok',
      command: command(['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--open-login', '--wait-auth', '--wait-auth-status-out', 'handoff-resume-wait-auth-status.json', '--out', 'handoff-resume-latest.json', '--format', 'compact'])
    },
    waitAuthThenCaptureNoOpen: {
      blockedReason: 'auth-check-not-ok',
      command: command(['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--wait-auth', '--wait-auth-status-out', 'handoff-resume-wait-auth-status.json', '--out', 'handoff-resume-latest.json', '--format', 'compact'])
    }
  }
};

test('background proof capture plan emits no-open wait-auth capture commands', async () => {
  const plan = await buildBackgroundProofCapturePlan({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-29T00:00:00.000Z',
    timeoutMs: 120000,
    intervalMs: 2500,
    pipeline
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.planOnly, true);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.opensBrowserNow, false);
  assert.equal(plan.startsCaptureNow, false);
  assert.equal(plan.phases.monitorAuth.startsCapture, false);
  assert.equal(plan.phases.backgroundWaitAuthThenCaptureNoOpen.available, true);
  assert.equal(plan.phases.backgroundWaitAuthThenCaptureNoOpen.opensBrowser, false);
  assert.equal(plan.phases.backgroundWaitAuthThenCaptureNoOpen.startsCapture, true);
  assert.equal(plan.phases.backgroundWaitAuthThenCaptureNoOpen.operatorMustOpenLoginSeparately, true);
  assert.equal(plan.phases.backgroundWaitAuthThenCaptureNoOpen.runOnlyAfterOperatorStartsOrCompletesLogin, true);
  assert.ok(!plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.includes('--open-login'));
  assert.ok(plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.includes('--wait-auth'));
  assert.ok(plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.includes('--wait-auth-timeout-ms'));
  assert.ok(plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.includes('120000'));
  assert.ok(plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.includes('--wait-auth-interval-ms'));
  assert.ok(plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.includes('2500'));
  assert.ok(
    plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.indexOf('--wait-auth-timeout-ms')
      < plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.indexOf('--format')
  );
  assert.ok(
    plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.indexOf('--wait-auth-interval-ms')
      < plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.indexOf('--format')
  );
  assert.match(plan.phases.backgroundWaitAuthThenCaptureNoOpen.backgroundCommand.shell, /^mkdir -p 'runs\/operator' && nohup /);
  assert.match(plan.phases.backgroundWaitAuthThenCaptureNoOpen.backgroundCommand.shell, /> 'runs\/operator\/background-proof-capture\.log' 2>&1 & echo \$! > 'runs\/operator\/background-proof-capture\.pid'$/);

  const compact = formatBackgroundProofCapturePlanCompact(plan);
  assert.match(compact, /^plan_only: yes$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^background_no_open_wait_capture_available: yes$/m);
  assert.match(compact, /^background_no_open_wait_capture_opens_browser: no$/m);
  assert.match(compact, /^background_no_open_wait_capture_starts_capture: yes$/m);
  assert.match(compact, /^operator_must_open_login_separately: yes$/m);
  assert.match(compact, /^background_no_open_wait_capture_command: mkdir -p 'runs\/operator' && nohup /m);
  assert.doesNotMatch(compact.match(/^no_open_wait_capture_command: .+$/m)[0], /--open-login/);
  assert.doesNotMatch(compact.match(/^background_no_open_wait_capture_command: .+$/m)[0], /--open-login/);
  assert.doesNotMatch(compact, /OP_SERVICE_ACCOUNT_TOKEN=/);

  const markdown = formatBackgroundProofCapturePlanMarkdown(plan);
  assert.match(markdown, /Background Proof Capture Plan/);
  assert.match(markdown, /Background Wait Auth Then Capture Without Opening Browser/);
});

test('background proof capture plan can derive no-open command from older wait-capture pipeline', async () => {
  const legacyPipeline = {
    ...pipeline,
    phases: {
      ...pipeline.phases,
      waitAuthThenCaptureNoOpen: undefined
    }
  };

  const plan = await buildBackgroundProofCapturePlan({
    rootDir: '/tmp/sba',
    timeoutMs: 120000,
    intervalMs: 2500,
    pipeline: legacyPipeline
  });

  assert.equal(plan.phases.backgroundWaitAuthThenCaptureNoOpen.available, true);
  assert.equal(plan.phases.backgroundWaitAuthThenCaptureNoOpen.opensBrowser, false);
  assert.ok(!plan.phases.backgroundWaitAuthThenCaptureNoOpen.command.args.includes('--open-login'));
});

test('background proof capture plan rejects parent-relative paths', async () => {
  await assert.rejects(
    () => buildBackgroundProofCapturePlan({
      rootDir: '/tmp/sba',
      captureLogPath: '../bad.log',
      pipeline
    }),
    /invalid background proof capture path/
  );
  await assert.rejects(
    () => buildBackgroundProofCapturePlan({
      rootDir: '/tmp/sba',
      capturePidPath: '/tmp/bad.pid',
      pipeline
    }),
    /invalid background proof capture path/
  );
});
