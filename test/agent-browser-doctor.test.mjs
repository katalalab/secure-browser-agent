import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildAgentBrowserDoctor, formatAgentBrowserDoctorCompact } from '../src/agent-browser-doctor.mjs';

test('agent-browser doctor reports CLI and Chrome cache readiness without side effects', () => {
  const report = buildAgentBrowserDoctor({
    generatedAt: '2026-05-31T00:00:00.000Z',
    status: {
      agentBrowser: {
        exists: false,
        path: '',
        version: '',
        ok: false
      },
      chromeForTesting: {
        exists: true,
        path: '/tmp/chrome-for-testing'
      }
    }
  });

  assert.equal(report.safeMode, true);
  assert.equal(report.statusOnly, true);
  assert.equal(report.destructiveActionsIncluded, false);
  assert.equal(report.secretValuesRead, false);
  assert.equal(report.opensBrowserNow, false);
  assert.equal(report.startsCaptureNow, false);
  assert.equal(report.readsBrowserStorage, false);
  assert.equal(report.pageContentReturned, false);
  assert.equal(report.cli.exists, false);
  assert.equal(report.chromeForTesting.exists, true);
  assert.equal(report.readyForEngineUse, false);
  assert.deepEqual(report.missingChecks, ['cli.agent-browser']);
  assert.equal(report.installPlanRequiresOperatorApproval, true);
  assert.equal(report.installPlanAgentMayRunUnattended, false);
  assert.equal(report.installPlanMutatesRuntime, true);

  const compact = formatAgentBrowserDoctorCompact(report);
  assert.match(compact, /^safe_mode: yes$/m);
  assert.match(compact, /^status_only: yes$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^reads_browser_storage: no$/m);
  assert.match(compact, /^page_content_returned: no$/m);
  assert.match(compact, /^agent_browser_cli_exists: no$/m);
  assert.match(compact, /^agent_browser_chrome_for_testing_exists: yes$/m);
  assert.match(compact, /^agent_browser_ready_for_engine_use: no$/m);
  assert.match(compact, /^agent_browser_missing_checks: cli\.agent-browser$/m);
  assert.match(compact, /^agent_browser_next: install-agent-browser-cli-or-run-agent-browser-install-before-engine-use$/m);
  assert.match(compact, /^agent_browser_install_plan_command: npm i -g agent-browser && agent-browser install$/m);
  assert.match(compact, /^agent_browser_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^agent_browser_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_browser_install_mutates_runtime: yes$/m);
  assert.match(compact, /^agent_browser_chrome_for_testing_path: \/tmp\/chrome-for-testing$/m);
});

test('agent-browser doctor reports ready engine when CLI and browser cache exist', () => {
  const report = buildAgentBrowserDoctor({
    generatedAt: '2026-05-31T00:00:00.000Z',
    status: {
      agentBrowser: {
        exists: true,
        path: '/usr/local/bin/agent-browser',
        version: 'agent-browser 1.2.3',
        ok: true
      },
      chromeForTesting: {
        exists: true,
        path: '/tmp/chrome-for-testing'
      }
    }
  });

  assert.equal(report.readyForEngineUse, true);
  assert.deepEqual(report.missingChecks, []);
  const compact = formatAgentBrowserDoctorCompact(report);
  assert.match(compact, /^agent_browser_cli_exists: yes$/m);
  assert.match(compact, /^agent_browser_cli_ok: yes$/m);
  assert.match(compact, /^agent_browser_missing_checks: none$/m);
  assert.match(compact, /^agent_browser_next: agent-browser-engine-ready-for-explicit-benchmark$/m);
  assert.match(compact, /^agent_browser_cli_path: \/usr\/local\/bin\/agent-browser$/m);
  assert.match(compact, /^agent_browser_version: agent-browser 1\.2\.3$/m);
});

test('offline CLI doctor succeeds without agent-browser on PATH', () => {
  const result = spawnSync(process.execPath, ['src/cli.mjs', 'doctor', '--offline'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: ''
    },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^safe_mode: yes$/m);
  assert.match(result.stdout, /^status_only: yes$/m);
  assert.match(result.stdout, /^agent_browser_cli_exists: no$/m);
  assert.equal(result.stderr, '');
});
