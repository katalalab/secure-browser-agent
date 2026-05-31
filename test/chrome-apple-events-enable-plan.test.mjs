import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildChromeAppleEventsEnablePlan, formatChromeAppleEventsEnablePlanCompact, formatChromeAppleEventsEnablePlanMarkdown } from '../src/chrome-apple-events-enable-plan.mjs';

function status({ javascriptAllowed = false } = {}) {
  return {
    chrome: { reachable: true },
    activeTab: {
      observed: true,
      urlRedacted: 'https://example.com/private',
      fullUrlReturned: false
    },
    javascript: {
      allowed: javascriptAllowed,
      error: javascriptAllowed ? '' : 'javascript-from-apple-events-disabled'
    }
  };
}

test('chrome apple events enable plan is read-only and points to manual permission steps', () => {
  const plan = buildChromeAppleEventsEnablePlan({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    status: status({ javascriptAllowed: false })
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.opensBrowserNow, false);
  assert.equal(plan.changesChromeSettingsNow, false);
  assert.equal(plan.readsBrowserStorage, false);
  assert.equal(plan.pageContentReturned, false);
  assert.equal(plan.officialHelpUrl, 'https://support.google.com/chrome/?p=applescript');
  assert.equal(plan.readyForOutline, false);
  assert.equal(plan.userActionRequired, true);
  assert.equal(plan.operatorSteps.length, 3);
  assert.match(plan.operatorSteps.join('\n'), /Allow JavaScript from Apple Events/);
  assert.equal(plan.nextAction, 'enable-javascript-from-apple-events-if-operator-approves');
  assert.deepEqual(plan.statusCommand.args, ['node', 'src/cli.mjs', 'chrome-apple-events-status', '--format', 'compact']);
  assert.deepEqual(plan.outlineApprovalCommand.args, ['node', 'src/cli.mjs', 'chrome-apple-events-outline', '--run', '--operator-ok', 'OK', '--format', 'compact']);
  assert.deepEqual(plan.regularChromeUseCommand.args, ['node', 'src/cli.mjs', 'regular-chrome-use', '--intent', 'inspect', '--apple-events-active-tab-observed', 'yes', '--apple-events-javascript-allowed', 'no', '--format', 'compact']);

  const compact = formatChromeAppleEventsEnablePlanCompact(plan);
  assert.match(compact, /^changes_chrome_settings_now: no$/m);
  assert.match(compact, /^javascript_from_apple_events_allowed: no$/m);
  assert.match(compact, /^user_action_required: yes$/m);
  assert.match(compact, /^operator_step_2: Enable Allow JavaScript from Apple Events\.$/m);
  assert.doesNotMatch(compact, /token=secret/);

  const markdown = formatChromeAppleEventsEnablePlanMarkdown(plan);
  assert.match(markdown, /Chrome Apple Events Enable Plan/);
  assert.match(markdown, /Official help: https:\/\/support\.google\.com\/chrome\/\?p=applescript/);
});

test('chrome apple events enable plan reports ready when JavaScript is already allowed', () => {
  const plan = buildChromeAppleEventsEnablePlan({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    status: status({ javascriptAllowed: true })
  });

  assert.equal(plan.readyForOutline, true);
  assert.equal(plan.userActionRequired, false);
  assert.equal(plan.operatorSteps.length, 0);
  assert.equal(plan.nextAction, 'run-gated-apple-events-outline-if-operator-approves');
  assert.deepEqual(plan.regularChromeUseCommand.args, ['node', 'src/cli.mjs', 'regular-chrome-use', '--intent', 'inspect', '--apple-events-active-tab-observed', 'yes', '--apple-events-javascript-allowed', 'yes', '--format', 'compact']);

  const compact = formatChromeAppleEventsEnablePlanCompact(plan);
  assert.match(compact, /^ready_for_outline: yes$/m);
  assert.match(compact, /^user_action_required: no$/m);
});

test('chrome apple events enable plan can write under runs only', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-apple-events-enable-plan-'));
  try {
    const plan = buildChromeAppleEventsEnablePlan({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      status: status(),
      write: true
    });

    assert.equal(plan.outputPath, path.join(rootDir, 'runs/operator/chrome-apple-events-enable-plan-latest.json'));
    const saved = JSON.parse(fs.readFileSync(plan.outputPath, 'utf8'));
    assert.equal(saved.secretValuesRead, false);
    assert.equal(saved.changesChromeSettingsNow, false);
    assert.equal(saved.officialHelpUrl, 'https://support.google.com/chrome/?p=applescript');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }

  assert.throws(
    () => buildChromeAppleEventsEnablePlan({
      rootDir: '/tmp/sba',
      status: status(),
      write: true,
      out: '../apple-events-enable-plan.json'
    }),
    /invalid Chrome Apple Events enable plan output path/
  );
});
