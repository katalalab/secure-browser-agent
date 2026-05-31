import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentWorkflow, formatAgentWorkflowCompact } from '../src/agent-workflow.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeTargetPack(rootDir) {
  const targetDir = path.join(rootDir, 'runs/target-packs/acme');
  writeJson(path.join(targetDir, 'policy.json'), {
    allowedOrigins: ['https://app.example.test', 'https://html.duckduckgo.com'],
    defaultProfile: 'acme',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: 'acme/outputs',
    profileDir: 'acme/profiles',
    redactKeys: ['cookie', 'authorization', 'token']
  });
  writeJson(path.join(targetDir, 'target.json'), {
    target: 'acme',
    origins: ['https://app.example.test'],
    loginUrl: 'https://app.example.test/login',
    pageUrl: 'https://app.example.test/dashboard',
    query: 'acme docs',
    searchProvider: 'duckduckgo',
    profile: 'acme'
  });
  return targetDir;
}

const proofGateStatus = {
  complete: false,
  status: 'waiting-for-login',
  target: 'acme',
  operatorInput: true,
  authCheckOk: false,
  loginLike: true,
  operatorGuidance: {
    captureBlocked: true
  },
  recommendedCommand: {
    command: {
      shell: "'node' 'src/cli.mjs' 'target-handoff-resume'",
      args: ['node', 'src/cli.mjs', 'target-handoff-resume']
    }
  }
};

const providerReport = {
  recommendation: {
    defaultBackend: 'direct-cdp-chrome',
    defaultAgentInterface: 'secure-browser-agent-mcp',
    publicCrawlAccelerator: 'lightpanda-pending-local-binary',
    richAutomationFallback: 'playwright-available-for-rich-tests'
  }
};

test('agent workflow plans target scrape through dedicated profile commands', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-workflow-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    const plan = await buildAgentWorkflow({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      task: 'scrape',
      targetDir,
      proofGateStatus,
      providerReport
    });

    assert.equal(plan.safeMode, true);
    assert.equal(plan.secretValuesRead, false);
    assert.equal(plan.opensBrowserNow, false);
    assert.equal(plan.target.available, true);
    assert.equal(plan.target.name, 'acme');
    assert.equal(plan.route.backend, 'direct-cdp-chrome');
    assert.equal(plan.route.agentUnattendedAllowed, false);
    assert.equal(plan.route.operatorApprovalRequired, true);
    assert.deepEqual(plan.route.operatorApprovalReasons, ['operator-input', 'capture-blocked']);
    assert.equal(plan.recommendedCommandId, 'auth-check-before-scrape');
    assert.match(plan.recommendedCommand.shell, /target-auth-check/);
    assert.match(plan.commands.authCheck.shell, /target-auth-check/);
    assert.match(plan.commands.daemonStart.shell, /target-daemon/);
    assert.match(plan.commands.scrapeStatus.shell, /target-run-status/);
    assert.match(plan.commands.scrapeStatus.shell, /scrape/);
    assert.equal(plan.guidance.useDedicatedTargetProfileForStoredAuth, true);
    assert.equal(plan.guidance.runAuthCheckBeforeTargetWorkflow, true);
    assert.equal(plan.guidance.authGateRequired, true);
    assert.equal(plan.guidance.authGateReason, 'target-auth-check-login-like');

    const compact = formatAgentWorkflowCompact(plan);
    assert.match(compact, /^target_available: yes$/m);
    assert.match(compact, /^agent_unattended_allowed: no$/m);
    assert.match(compact, /^operator_approval_required: yes$/m);
    assert.match(compact, /^operator_approval_reasons: operator-input,capture-blocked$/m);
    assert.match(compact, /^route_command_opens_browser: no$/m);
    assert.match(compact, /^route_approval_command_opens_browser: no$/m);
    assert.match(compact, /^recommended_command_id: auth-check-before-scrape$/m);
    assert.match(compact, /^recommended_requires_operator_approval: no$/m);
    assert.match(compact, /^recommended_agent_may_run_unattended: yes$/m);
    assert.match(compact, /^recommended_opens_browser: no$/m);
    assert.match(compact, /^recommended_starts_capture: no$/m);
    assert.match(compact, /^recommended_reads_browser_storage: no$/m);
    assert.match(compact, /^recommended_returns_page_content: no$/m);
    assert.match(compact, /^run_auth_check_before_target_workflow: yes$/m);
    assert.match(compact, /^auth_gate_required: yes$/m);
    assert.match(compact, /^auth_gate_reason: target-auth-check-login-like$/m);
    assert.match(compact, /^recommended_command: 'node' 'src\/cli\.mjs' 'target-auth-check'/m);
    assert.match(compact, /^scrape_command: 'node' 'src\/cli\.mjs' 'target-scrape'/m);
    assert.match(compact, /^scrape_status_command: 'node' 'src\/cli\.mjs' 'target-run-status'.*'scrape'/m);
    assert.match(compact, /^auth_check_command: 'node' 'src\/cli\.mjs' 'target-auth-check'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent workflow plans mutation through auth-check and selector templates', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-workflow-operate-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    const plan = await buildAgentWorkflow({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      task: 'operate',
      targetDir,
      proofGateStatus,
      providerReport
    });

    assert.equal(plan.recommendedCommandId, 'auth-check-before-operate');
    assert.equal(plan.guidance.runAuthCheckBeforeOperate, true);
    assert.equal(plan.guidance.runAuthCheckBeforeTargetWorkflow, true);
    assert.equal(plan.guidance.authGateRequired, true);
    assert.equal(plan.guidance.freshSnapshotRequiredForMutation, true);
    assert.match(plan.commands.operate.shell, /target-run/);
    assert.match(plan.commands.operate.shell, /operate/);
    assert.match(plan.commands.operateStatus.shell, /target-run-status/);
    assert.match(plan.commands.operateStatus.shell, /operate/);
    assert.match(plan.commands.operateAddFillTemplate.shell, /target-operate-add/);
    assert.match(plan.commands.operateAddFillTemplate.shell, /--value-env/);
    assert.match(plan.commands.operateAddClickTemplate.shell, /target-operate-add/);
    assert.match(plan.commands.clickTemplate.shell, /click-cdp/);
    assert.match(plan.commands.clickTemplate.shell, /<css-selector>/);
    assert.match(plan.commands.fillTemplate.shell, /fill-cdp/);
    assert.match(plan.commands.fillTemplate.shell, /<text>/);

    const compact = formatAgentWorkflowCompact(plan);
    assert.match(compact, /^run_auth_check_before_operate: yes$/m);
    assert.match(compact, /^run_auth_check_before_target_workflow: yes$/m);
    assert.match(compact, /^auth_gate_required: yes$/m);
    assert.match(compact, /^fresh_snapshot_required_for_mutation: yes$/m);
    assert.match(compact, /^operate_command: 'node' 'src\/cli\.mjs' 'target-run'.*'operate'/m);
    assert.match(compact, /^operate_status_command: 'node' 'src\/cli\.mjs' 'target-run-status'.*'operate'/m);
    assert.match(compact, /^operate_add_fill_template_command: 'node' 'src\/cli\.mjs' 'target-operate-add'.*'--value-env'/m);
    assert.match(compact, /^operate_add_click_template_command: 'node' 'src\/cli\.mjs' 'target-operate-add'/m);
    assert.match(compact, /^click_template_command: .*click-cdp/m);
    assert.match(compact, /^fill_template_command: .*fill-cdp/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent workflow keeps analyze as a first-class page structure task', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-workflow-analyze-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    const plan = await buildAgentWorkflow({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      task: 'analyze',
      targetDir,
      proofGateStatus,
      providerReport
    });

    assert.equal(plan.task, 'analyze');
    assert.equal(plan.target.available, true);
    assert.equal(plan.route.backend, 'direct-cdp-chrome');
    assert.equal(plan.recommendedCommandId, 'auth-check-before-analyze');
    assert.match(plan.recommendedCommand.shell, /target-auth-check/);
    assert.equal(plan.guidance.runAuthCheckBeforeTargetWorkflow, true);
    assert.equal(plan.guidance.authGateRequired, true);

    const compact = formatAgentWorkflowCompact(plan);
    assert.match(compact, /^task: analyze$/m);
    assert.match(compact, /^recommended_command_id: auth-check-before-analyze$/m);
    assert.match(compact, /^auth_gate_required: yes$/m);
    assert.match(compact, /^recommended_command: 'node' 'src\/cli\.mjs' 'target-auth-check'/m);
    assert.match(compact, /^analyze_command: 'node' 'src\/cli\.mjs' 'target-run'.*'inspect'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent workflow analyze without target returns analysis route guidance', async () => {
  const plan = await buildAgentWorkflow({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    task: 'analyze',
    providerReport,
    proofGateStatus: {
      ...proofGateStatus,
      targetDir: ''
    }
  });

  assert.equal(plan.task, 'analyze');
  assert.equal(plan.target.available, false);
  assert.equal(plan.route.selectedLane, 'direct-cdp-page-analysis');
  assert.equal(plan.recommendedCommandId, 'browser-route');
  assert.match(plan.recommendedCommand.shell, /browser-route/);
  assert.match(plan.recommendedCommand.shell, /--task' 'analyze/);

  const compact = formatAgentWorkflowCompact(plan);
  assert.match(compact, /^task: analyze$/m);
  assert.match(compact, /^route_lane: direct-cdp-page-analysis$/m);
});

test('agent workflow existing-tab returns regular Chrome and safe claim-plan handoff', async () => {
  const plan = await buildAgentWorkflow({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    task: 'existing-tab',
    intent: 'inspect',
    matchOrigin: 'https://github.com',
    matchPath: '/notifications',
    chromeMcpConnected: 'yes',
    chromeMcpPageListOk: 'no',
    chromeMcpLastError: 'Network.enable timed out',
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    mcpObservationIn: 'operator/chrome-mcp-observation-latest.json',
    chromeExtensionPrepared: 'yes',
    chromeExtensionBackendAvailable: 'yes',
    providerReport
  });

  assert.equal(plan.task, 'existing-tab');
  assert.equal(plan.target.available, false);
  assert.equal(plan.route.selectedLane, 'regular-chrome-mcp-new-background-tab');
  assert.equal(plan.route.backend, 'chrome-devtools-mcp');
  assert.equal(plan.recommendedCommandId, 'regular-chrome-use');
  assert.match(plan.recommendedCommand.shell, /regular-chrome-use/);
  assert.match(plan.recommendedCommand.shell, /--intent' 'inspect/);
  assert.match(plan.recommendedCommand.shell, /--allow-new-background-tab' 'yes/);
  assert.match(plan.recommendedCommand.shell, /--new-background-url-env' 'REGULAR_CHROME_URL/);
  assert.match(plan.recommendedCommand.shell, /--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json/);
  assert.match(plan.commands.regularChromeRefresh.shell, /--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json/);
  assert.match(plan.commands.regularChromeStatus.shell, /--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json/);
  assert.match(plan.commands.chromeMcpHandoff.shell, /--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json/);
  assert.match(plan.commands.chromeExtensionClaimPlan.shell, /chrome-extension-claim-plan/);
  assert.match(plan.commands.chromeExtensionClaimPlan.shell, /--match-origin' 'https:\/\/github\.com/);
  assert.match(plan.commands.chromeExtensionClaimPlan.shell, /--match-path' '\/notifications/);
  assert.match(plan.commands.chromeExtensionClaimPlan.shell, /--backend-ready' 'yes/);

  const compact = formatAgentWorkflowCompact(plan);
  assert.match(compact, /^task: existing-tab$/m);
  assert.match(compact, /^route_lane: regular-chrome-mcp-new-background-tab$/m);
  assert.match(compact, /^recommended_command_id: regular-chrome-use$/m);
  assert.match(compact, /^recommended_requires_operator_approval: no$/m);
  assert.match(compact, /^recommended_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^recommended_opens_browser: yes$/m);
  assert.match(compact, /^recommended_returns_page_content: no$/m);
  assert.match(compact, /^regular_chrome_use_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use'/m);
  assert.match(compact, /^regular_chrome_use_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
  assert.match(compact, /^regular_chrome_use_command: .*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(compact, /^regular_chrome_refresh_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
  assert.match(compact, /^regular_chrome_status_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
  assert.match(compact, /^chrome_mcp_handoff_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
  assert.match(compact, /^chrome_extension_claim_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-claim-plan'.*'--match-origin' 'https:\/\/github\.com'/m);
  assert.match(compact, /^chrome_extension_backend_check_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-backend-check-plan'/m);
  assert.doesNotMatch(compact, /^missing_target_action:/m);
});

test('agent workflow auto-detects proof-gate target for authenticated scrape tasks', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-workflow-auto-target-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    const plan = await buildAgentWorkflow({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      task: 'scrape',
      proofGateStatus: {
        ...proofGateStatus,
        targetDir
      },
      providerReport
    });

    assert.equal(plan.target.available, true);
    assert.equal(plan.target.autoDetected, true);
    assert.equal(plan.target.source, 'proof-gate-status');
    assert.equal(plan.target.dir, targetDir);
    assert.equal(plan.recommendedCommandId, 'auth-check-before-scrape');
    assert.match(plan.recommendedCommand.shell, /target-auth-check/);
    assert.equal(plan.guidance.authGateRequired, true);

    const compact = formatAgentWorkflowCompact(plan);
    assert.match(compact, /^target_available: yes$/m);
    assert.match(compact, /^target_auto_detected: yes$/m);
    assert.match(compact, /^target_source: proof-gate-status$/m);
    assert.match(compact, /^recommended_command_id: auth-check-before-scrape$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent workflow without a target returns public search and target-pack guidance', async () => {
  const plan = await buildAgentWorkflow({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-30T00:00:00.000Z',
    task: 'search',
    query: 'secure browser agent',
    provider: 'brave',
    providerReport,
    proofGateStatus: {
      ...proofGateStatus,
      targetDir: '/tmp/sba/runs/target-packs/acme'
    }
  });

  assert.equal(plan.target.available, false);
  assert.equal(plan.target.autoDetected, false);
  assert.equal(plan.target.source, 'none');
  assert.equal(plan.recommendedCommandId, 'public-search');
  assert.match(plan.recommendedCommand.shell, /search-cdp/);
  assert.match(plan.recommendedCommand.shell, /secure browser agent/);
  assert.equal(plan.guidance.missingTargetAction, 'pass --target-dir for authenticated target-pack workflows');

  const compact = formatAgentWorkflowCompact(plan);
  assert.match(compact, /^target_available: no$/m);
  assert.match(compact, /^target_auto_detected: no$/m);
  assert.match(compact, /^target_source: none$/m);
  assert.match(compact, /^recommended_requires_operator_approval: no$/m);
  assert.match(compact, /^recommended_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^recommended_opens_browser: yes$/m);
  assert.match(compact, /^recommended_returns_page_content: yes$/m);
  assert.match(compact, /^public_search_command: 'node' 'src\/cli\.mjs' 'search-cdp'/m);
  assert.match(compact, /^target_candidate_plan_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan'/m);
});

test('agent workflow CLI emits compact public search plan', () => {
  const result = spawnSync(process.execPath, [
    'src/cli.mjs',
    'agent-workflow',
    '--task',
    'search',
    '--query',
    'secure browser agent',
    '--format',
    'compact'
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30000
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^task: search$/m);
  assert.match(result.stdout, /^recommended_command_id: public-search$/m);
  assert.match(result.stdout, /^public_search_command: /m);
});

test('agent workflow CLI treats intent as task when task is omitted', () => {
  const result = spawnSync(process.execPath, [
    'src/cli.mjs',
    'agent-workflow',
    '--intent',
    'analyze',
    '--format',
    'compact'
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30000
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^task: analyze$/m);
  assert.match(result.stdout, /^recommended_command_id: /m);
});
