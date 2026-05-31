import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackgroundProofCaptureStart, formatBackgroundProofCaptureStartCompact, formatBackgroundProofCaptureStartMarkdown } from '../src/background-proof-capture-start.mjs';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function makePlan(rootDir) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-29T00:00:00.000Z',
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    target: 'github',
    status: 'incomplete',
    paths: {
      monitorLogPath: 'runs/operator/background-auth-monitor.log',
      monitorPidPath: 'runs/operator/background-auth-monitor.pid',
      captureLogPath: 'runs/operator/background-proof-capture.log',
      capturePidPath: 'runs/operator/background-proof-capture.pid'
    },
    phases: {
      monitorAuth: {
        opensBrowser: false,
        startsCapture: false,
        command: command(['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--format', 'compact'])
      },
      backgroundWaitAuthThenCaptureNoOpen: {
        opensBrowser: false,
        startsCapture: true,
        operatorMustOpenLoginSeparately: true,
        command: command(['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--wait-auth', '--format', 'compact'])
      }
    }
  };
}

test('background proof capture start plans without running by default', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-bg-start-'));
  const result = await buildBackgroundProofCaptureStart({
    rootDir,
    plan: makePlan(rootDir),
    mode: 'capture'
  });

  assert.equal(result.status, 'planned');
  assert.equal(result.planOnly, true);
  assert.equal(result.runRequested, false);
  assert.equal(result.readyToRun, false);
  assert.equal(result.operatorOkAccepted, false);
  assert.deepEqual(result.blockers, ['operator-ok-required']);
  assert.equal(result.opensBrowserNow, false);
  assert.equal(result.startsCaptureNow, false);
  assert.equal(result.startsBackgroundProcessNow, false);
  assert.equal(result.phase.opensBrowser, false);
  assert.equal(result.phase.startsCapture, true);
  assert.ok(!result.phase.command.args.includes('--open-login'));

  const compact = formatBackgroundProofCaptureStartCompact(result);
  assert.match(compact, /^status: planned$/m);
  assert.match(compact, /^operator_ok_accepted: no$/m);
  assert.match(compact, /^blockers: operator-ok-required$/m);
  assert.match(compact, /^approved_run_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture' '--timeout-ms' '300000' '--interval-ms' '5000' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);

  const markdown = formatBackgroundProofCaptureStartMarkdown(result);
  assert.match(markdown, /Background Proof Capture Start/);
});

test('background proof capture start preserves wait and monitor settings in returned commands', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-bg-start-'));
  const capture = await buildBackgroundProofCaptureStart({
    rootDir,
    plan: makePlan(rootDir),
    mode: 'capture',
    timeoutMs: 12000,
    intervalMs: 750,
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000
  });
  const monitor = await buildBackgroundProofCaptureStart({
    rootDir,
    plan: makePlan(rootDir),
    mode: 'monitor',
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000
  });

  assert.match(capture.commands.plan.shell, /'--timeout-ms' '12000' '--interval-ms' '750'/);
  assert.match(capture.commands.approvedRun.shell, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
  assert.match(monitor.commands.approvedRun.shell, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
});

test('background proof capture start refuses run without operator OK', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-bg-start-'));
  const result = await buildBackgroundProofCaptureStart({
    rootDir,
    plan: makePlan(rootDir),
    mode: 'capture',
    run: true
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.runRequested, true);
  assert.equal(result.operatorOkAccepted, false);
  assert.equal(result.startsBackgroundProcessNow, false);
  assert.deepEqual(result.blockers, ['operator-ok-required']);
});

test('background proof capture start writes pid and log paths through detached spawn', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-bg-start-'));
  const calls = [];
  const result = await buildBackgroundProofCaptureStart({
    rootDir,
    plan: makePlan(rootDir),
    mode: 'capture',
    run: true,
    operatorOk: 'OK',
    spawnImpl(commandName, args, options) {
      calls.push({ commandName, args, options });
      return {
        pid: 424242,
        unref() {}
      };
    }
  });

  assert.equal(result.status, 'started');
  assert.equal(result.readyToRun, true);
  assert.equal(result.startsBackgroundProcessNow, true);
  assert.equal(result.startsCaptureNow, true);
  assert.equal(result.started.pid, 424242);
  assert.equal(fs.readFileSync(path.join(rootDir, 'runs/operator/background-proof-capture.pid'), 'utf8'), '424242\n');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].commandName, 'node');
  assert.deepEqual(calls[0].args, ['src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--wait-auth', '--format', 'compact']);
  assert.equal(calls[0].options.cwd, rootDir);
  assert.equal(calls[0].options.detached, true);
});

test('background proof capture start avoids duplicate live pid unless forced', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-bg-start-'));
  fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'runs/operator/background-auth-monitor.pid'), `${process.pid}\n`);

  const result = await buildBackgroundProofCaptureStart({
    rootDir,
    plan: makePlan(rootDir),
    mode: 'monitor',
    run: true,
    operatorOk: 'OK'
  });

  assert.equal(result.status, 'already-running');
  assert.equal(result.startsBackgroundProcessNow, false);
  assert.deepEqual(result.blockers, ['monitor-already-running']);
  assert.equal(result.existingProcess.running, true);
});
