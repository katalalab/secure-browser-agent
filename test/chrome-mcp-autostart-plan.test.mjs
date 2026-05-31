import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildChromeMcpAutostartPlan,
  buildChromeMcpAutostartPlanStatus,
  formatChromeMcpAutostartPlanCompact,
  formatChromeMcpAutostartPlanStatusCompact
} from '../src/chrome-mcp-autostart-plan.mjs';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-mcp-autostart-'));
}

test('chrome mcp autostart plan is safe and operator gated', () => {
  const rootDir = tempRoot();
  const plan = buildChromeMcpAutostartPlan({
    rootDir,
    generatedAt: '2026-05-31T00:00:00.000Z',
    label: 'local.test.chrome-devtools-mcp'
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.statusOnly, true);
  assert.equal(plan.opensBrowserNow, false);
  assert.equal(plan.startsCaptureNow, false);
  assert.equal(plan.startsBackgroundNow, false);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.browserUrl, 'http://127.0.0.1:9223');
  assert.deepEqual(plan.programArguments, [
    'npx',
    '-y',
    'chrome-devtools-mcp@latest',
    '--browserUrl',
    'http://127.0.0.1:9223'
  ]);
  assert.equal(plan.securityBoundary.requiresOperatorApprovalToInstall, true);
  assert.equal(plan.securityBoundary.agentMayInstallUnattended, false);
  assert.equal(plan.securityBoundary.exposesBrowserContentToAuthorizedMcpClient, true);
  assert.ok(plan.plist.includes('<key>KeepAlive</key>'));
  assert.ok(plan.commands.load.shell.includes("'launchctl' 'bootstrap'"));

  const compact = formatChromeMcpAutostartPlanCompact(plan);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_background_now: no$/m);
  assert.match(compact, /^browser_url: http:\/\/127\.0\.0\.1:9223$/m);
  assert.match(compact, /^install_requires_operator_approval: yes$/m);
  assert.match(compact, /^agent_may_install_unattended: no$/m);
  assert.match(compact, /^load_command: 'launchctl' 'bootstrap'/m);
});

test('chrome mcp autostart write stays under runs and status does not launch anything', () => {
  const rootDir = tempRoot();
  const plan = buildChromeMcpAutostartPlan({
    rootDir,
    generatedAt: '2026-05-31T00:00:00.000Z',
    write: true,
    out: 'operator/chrome-mcp-autostart-plan-latest.json',
    plist: 'operator/launchd/custom.plist',
    headless: 'yes'
  });

  assert.equal(plan.wrotePlist, true);
  assert.equal(plan.wroteJson, true);
  assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/chrome-mcp-autostart-plan-latest.json')), true);
  assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/launchd/custom.plist')), true);
  assert.equal(plan.programArguments.includes('--headless'), true);

  const status = buildChromeMcpAutostartPlanStatus({
    rootDir,
    generatedAt: '2026-05-31T00:01:00.000Z'
  });
  assert.equal(status.exists, true);
  assert.equal(status.parseOk, true);
  assert.equal(status.opensBrowserNow, false);
  assert.equal(status.startsBackgroundNow, false);
  assert.equal(status.plistExists, true);
  assert.equal(status.installRequiresOperatorApproval, true);
  assert.equal(status.agentMayInstallUnattended, false);

  const compact = formatChromeMcpAutostartPlanStatusCompact(status);
  assert.match(compact, /^exists: yes$/m);
  assert.match(compact, /^plist_exists: yes$/m);
  assert.match(compact, /^install_requires_operator_approval: yes$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-autostart-plan' '--write'/m);
});

test('chrome mcp autostart rejects output paths outside runs', () => {
  const rootDir = tempRoot();
  assert.throws(() => buildChromeMcpAutostartPlan({
    rootDir,
    write: true,
    plist: '../bad.plist'
  }), /invalid Chrome MCP autostart output path/);
});
