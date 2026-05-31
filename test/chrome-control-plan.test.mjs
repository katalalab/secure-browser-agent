import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildChromeControlPlan, formatChromeControlPlanCompact, formatChromeControlPlanMarkdown } from '../src/chrome-control-plan.mjs';

function runtimeAudit(chromeApp, endpointOk = true) {
  return {
    chromeApp,
    chromeDevtools: {
      endpoint: { ok: endpointOk }
    }
  };
}

test('chrome control plan recommends target-pack lane over everyday Chrome default profile', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-plan-'));
  const handoffDir = path.join(rootDir, 'runs/target-packs/github/outputs');
  fs.mkdirSync(handoffDir, { recursive: true });
  fs.writeFileSync(path.join(handoffDir, 'operator-handoff.json'), '{}\n', 'utf8');

  const plan = buildChromeControlPlan({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    runtimeAudit: runtimeAudit({
      total: 3,
      regularProfiles: 1,
      regularProfileRemoteDebugging: 0,
      targetPackProfiles: 1,
      targetProfileRemoteDebugging: 1,
      codexBrowserAgentProfiles: 1
    }),
    chromeExtensionStatus: {
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false
      }
    }
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.recommendedLane, 'target-pack');
  assert.equal(plan.chrome.regularStatus, 'extension-prepared-not-proved');
  assert.equal(plan.chrome.regularExtensionPrepared, true);
  assert.equal(plan.chrome.regularExtensionBackendAvailable, false);
  assert.equal(plan.chrome.regularExtensionReady, false);
  assert.equal(plan.decision.useEverydayChrome, false);
  assert.equal(plan.decision.useDedicatedProfile, true);
  assert.equal(plan.regularChrome.userPermissionRequired, true);
  assert.equal(plan.regularChrome.approvalCommandOpensBrowser, true);
  assert.equal(plan.regularChrome.commandRunOnlyAfterUserSays, 'OK');
  assert.match(plan.regularChrome.resumeCommand.shell, /chrome-extension-resume/);
  assert.match(plan.regularChrome.approvalCommand.shell, /--operator-ok' 'OK/);
  assert.equal(plan.actions.some((action) => action.id === 'chrome-extension-resume-plan'), true);
  assert.equal(plan.actions.some((action) => action.id === 'chrome-extension-resume-approval'), true);
  assert.equal(plan.actions.some((action) => action.id === 'target-handoff-resume'), true);
  assert.match(plan.officialSource.url, /developer\.chrome\.com\/blog\/remote-debugging-port/);

  const compact = formatChromeControlPlanCompact(plan);
  assert.match(compact, /^recommended_lane: target-pack/m);
  assert.match(compact, /^regular_chrome_status: extension-prepared-not-proved/m);
  assert.match(compact, /^regular_chrome_debuggable: no/m);
  assert.match(compact, /^regular_chrome_extension_prepared: yes/m);
  assert.match(compact, /^regular_chrome_extension_backend_available: no/m);
  assert.match(compact, /^regular_chrome_extension_ready: no/m);
  assert.match(compact, /^regular_chrome_user_permission_required: yes/m);
  assert.match(compact, /^regular_chrome_approval_command_opens_browser: yes/m);
  assert.match(compact, /^regular_chrome_command_run_only_after_user_says: OK/m);
  assert.match(compact, /^target_chrome_debuggable: yes/m);
  assert.match(compact, /^use_everyday_chrome: no/m);
  assert.match(compact, /^source: https:\/\/developer\.chrome\.com\/blog\/remote-debugging-port/m);
  assert.match(compact, /target-handoff-resume/);
  assert.match(compact, /^regular_chrome_resume_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--format' 'compact'/m);
  assert.match(compact, /^regular_chrome_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK' '--format' 'compact'/m);
});

test('chrome control plan can report an explicitly requested debuggable regular lane', () => {
  const plan = buildChromeControlPlan({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    lane: 'regular-chrome',
    runtimeAudit: runtimeAudit({
      total: 1,
      regularProfiles: 1,
      regularProfileRemoteDebugging: 1,
      targetPackProfiles: 0,
      targetProfileRemoteDebugging: 0,
      codexBrowserAgentProfiles: 0
    }, false),
    chromeExtensionStatus: {
      decision: {
        everydayChromeViaCodexExtensionPrepared: false,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false
      }
    }
  });

  assert.equal(plan.recommendedLane, 'regular-chrome');
  assert.equal(plan.chrome.regularStatus, 'debuggable');
  assert.equal(plan.decision.useEverydayChrome, true);
  assert.equal(plan.decision.useDedicatedProfile, false);
  assert.equal(plan.regularChrome.userPermissionRequired, false);
  assert.equal(plan.regularChrome.approvalCommand, null);

  const markdown = formatChromeControlPlanMarkdown(plan);
  assert.match(markdown, /Chrome Control Plan/);
  assert.match(markdown, /Use everyday Chrome: yes/);
  assert.match(markdown, /Regular Chrome user permission required: no/);
  assert.match(markdown, /Chrome 136\+/);
});

test('chrome control plan preserves saved MCP observation and background-tab opt-in', () => {
  const plan = buildChromeControlPlan({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-31T00:00:00.000Z',
    mcpObservationIn: 'operator/chrome-mcp-observation-latest.json',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    runtimeAudit: runtimeAudit({
      total: 1,
      regularProfiles: 1,
      regularProfileRemoteDebugging: 0,
      targetPackProfiles: 0,
      targetProfileRemoteDebugging: 0,
      codexBrowserAgentProfiles: 0
    }, false),
    chromeExtensionStatus: {
      decision: {
        everydayChromeViaCodexExtensionPrepared: false,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false
      }
    }
  });

  assert.equal(plan.regularChrome.mcpObservationIn, 'operator/chrome-mcp-observation-latest.json');
  assert.equal(plan.regularChrome.newBackgroundTabsAllowed, true);
  assert.equal(plan.regularChrome.newBackgroundUrlEnv, 'REGULAR_CHROME_URL');
  assert.equal(plan.regularChrome.newBackgroundUrlValueRead, false);
  assert.match(plan.regularChrome.useCommand.shell, /'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/);
  assert.match(plan.regularChrome.useCommand.shell, /'--allow-new-background-tab' 'yes'/);
  assert.match(plan.regularChrome.useCommand.shell, /'--new-background-url-env' 'REGULAR_CHROME_URL'/);
  assert.match(plan.regularChrome.statusCommand.shell, /'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/);
  assert.match(plan.regularChrome.observationStatusCommand.shell, /'chrome-mcp-observation-status' '--in' 'operator\/chrome-mcp-observation-latest\.json'/);

  const compact = formatChromeControlPlanCompact(plan);
  assert.match(compact, /^regular_chrome_mcp_observation_in: operator\/chrome-mcp-observation-latest\.json$/m);
  assert.match(compact, /^regular_chrome_new_background_tabs_allowed: yes$/m);
  assert.match(compact, /^regular_chrome_new_background_url_env: REGULAR_CHROME_URL$/m);
  assert.match(compact, /^regular_chrome_new_background_url_value_read: no$/m);
  assert.match(compact, /^regular_chrome_use_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(compact, /^regular_chrome_status_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
  assert.match(compact, /^regular_chrome_mcp_observation_status_command: .*'--in' 'operator\/chrome-mcp-observation-latest\.json'/m);
});
