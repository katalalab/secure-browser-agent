import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentBackendSelect, formatAgentBackendSelectCompact } from '../src/agent-backend-select.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeTargetPack(rootDir) {
  const targetDir = path.join(rootDir, 'runs/target-packs/acme');
  writeJson(path.join(targetDir, 'policy.json'), {
    allowedOrigins: ['https://app.example.test'],
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

function cmd(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
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
    command: cmd(['node', 'src/cli.mjs', 'target-handoff-resume'])
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

const backendMatrix = {
  defaultAgentInterface: 'secure-browser-agent-mcp',
  regularChrome: {
    status: 'not-ready',
    ready: false,
    backend: 'codex-chrome-extension',
    chromeMcpRouteReady: false,
    chromeMcpListPagesTimedOut: true
  },
  tasks: {
    scrape: {
      backend: 'direct-cdp-chrome',
      selectedLane: 'target-pack-direct-cdp'
    },
    'authenticated-scrape': {
      backend: 'direct-cdp-chrome',
      selectedLane: 'target-pack-direct-cdp'
    }
  },
  backends: [
    {
      id: 'direct-cdp-chrome',
      available: true,
      role: 'authenticated-default',
      status: 'selected-for-authenticated-scrape',
      supportsExistingTabs: false,
      supportsPublicCrawl: true,
      supportsCompatibility: true
    }
  ],
  commands: {
    matrix: cmd(['node', 'src/cli.mjs', 'backend-matrix', '--format', 'compact']),
    status: cmd(['node', 'src/cli.mjs', 'backend-matrix-status', '--in', 'operator/backend-matrix-latest.json', '--format', 'compact'])
  }
};

function chromeMcpBackendMatrix() {
  return {
    defaultAgentInterface: 'secure-browser-agent-mcp',
    regularChrome: {
      status: 'ready',
      ready: true,
      backend: 'chrome-devtools-mcp',
      chromeMcpRouteReady: true,
      chromeMcpListPagesTimedOut: false
    },
    tasks: {
      'existing-tab': {
        backend: 'chrome-devtools-mcp',
        selectedLane: 'regular-chrome-mcp'
      }
    },
    backends: [
      {
        id: 'chrome-devtools-mcp',
        available: true,
        role: 'everyday-chrome-existing-tabs',
        status: 'selected-for-existing-tab',
        supportsExistingTabs: true,
        supportsPublicCrawl: false,
        supportsCompatibility: false
      }
    ],
    commands: {
      matrix: cmd(['node', 'src/cli.mjs', 'backend-matrix', '--format', 'compact']),
      status: cmd(['node', 'src/cli.mjs', 'backend-matrix-status', '--in', 'operator/backend-matrix-latest.json', '--format', 'compact'])
    }
  };
}

function writeProjectMatrix(name, value) {
  const relativePath = `operator/${name}-${process.pid}.json`;
  const filePath = path.join(projectRoot, 'runs', relativePath);
  writeJson(filePath, value);
  return { relativePath, filePath };
}

test('agent backend selector separates backend choice from safe execution gate', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-backend-select-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    const result = await buildAgentBackendSelect({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      task: 'scrape',
      targetDir,
      proofGateStatus,
      providerReport,
      backendMatrix
    });

    assert.equal(result.safeMode, true);
    assert.equal(result.secretValuesRead, false);
    assert.equal(result.opensBrowserNow, false);
    assert.equal(result.readsBrowserStorage, false);
    assert.equal(result.pageContentReturned, false);
    assert.equal(result.selection.backend, 'direct-cdp-chrome');
    assert.equal(result.selection.agentInterface, 'secure-browser-agent-mcp');
    assert.equal(result.selection.backendAvailable, true);
    assert.equal(result.selection.matrixTask, 'scrape');
    assert.equal(result.safety.executionAllowed, true);
    assert.equal(result.safety.agentUnattendedAllowed, false);
    assert.equal(result.safety.operatorApprovalRequired, true);
    assert.deepEqual(result.safety.operatorApprovalReasons, ['operator-input', 'capture-blocked']);
    assert.equal(result.safety.blockedReason, '');
    assert.equal(result.safety.dedicatedTargetProfileForStoredAuth, true);
    assert.equal(result.safety.storedAuthenticatedScrapingOnEverydayChrome, false);
    assert.equal(result.agentTask.recommendedCommandId, 'auth-check-before-scrape');
    assert.equal(result.agentTask.authPreflightChecked, true);
    assert.match(result.commands.selectedDirect.shell, /target-auth-check/);
    assert.doesNotMatch(result.commands.selectedDirect.shell, /target-scrape/);
    assert.match(result.commands.authPreflightWatch.shell, /target-auth-watch/);
    assert.match(result.commands.authPreflightResumeStatus.shell, /target-handoff-resume-status/);
    assert.match(result.commands.safeRun.shell, /agent-task/);
    assert.match(result.commands.safeRun.shell, /--run/);

    const compact = formatAgentBackendSelectCompact(result);
    assert.match(compact, /^selected_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^selected_agent_interface: secure-browser-agent-mcp$/m);
    assert.match(compact, /^execution_allowed: yes$/m);
    assert.match(compact, /^agent_unattended_allowed: no$/m);
    assert.match(compact, /^operator_approval_required: yes$/m);
    assert.match(compact, /^operator_approval_reasons: operator-input,capture-blocked$/m);
    assert.match(compact, /^blocked_reason: none$/m);
    assert.match(compact, /^recommended_command_id: auth-check-before-scrape$/m);
    assert.match(compact, /^recommended_requires_operator_approval: no$/m);
    assert.match(compact, /^recommended_agent_may_run_unattended: yes$/m);
    assert.match(compact, /^recommended_opens_browser: no$/m);
    assert.match(compact, /^recommended_starts_capture: no$/m);
    assert.match(compact, /^recommended_reads_browser_storage: no$/m);
    assert.match(compact, /^recommended_returns_page_content: no$/m);
    assert.match(compact, /^auth_preflight_checked: yes$/m);
    assert.match(compact, /^stored_authenticated_scraping_on_everyday_chrome: no$/m);
    assert.match(compact, /^auth_preflight_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
    assert.match(compact, /^auth_preflight_resume_status_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-status'/m);
    assert.match(compact, /^agent_task_safe_run_command: 'node' 'src\/cli\.mjs' 'agent-task' '--run'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent backend selector can reuse a saved backend matrix from runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-backend-select-saved-'));
  try {
    const targetDir = makeTargetPack(rootDir);
    writeJson(path.join(rootDir, 'runs/operator/backend-matrix-latest.json'), backendMatrix);
    const result = await buildAgentBackendSelect({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      task: 'scrape',
      targetDir,
      proofGateStatus,
      providerReport,
      backendMatrixIn: 'operator/backend-matrix-latest.json'
    });

    assert.equal(result.backendMatrix.source, 'saved');
    assert.equal(result.backendMatrix.inputRequested, true);
    assert.equal(result.backendMatrix.inputExists, true);
    assert.equal(result.backendMatrix.inputParseOk, true);
    assert.equal(result.backendMatrix.inputPath, 'operator/backend-matrix-latest.json');
    assert.equal(result.selection.backend, 'direct-cdp-chrome');

    const compact = formatAgentBackendSelectCompact(result);
    assert.match(compact, /^backend_matrix_source: saved$/m);
    assert.match(compact, /^backend_matrix_input_requested: yes$/m);
    assert.match(compact, /^backend_matrix_input_parse_ok: yes$/m);
    assert.match(compact, /^backend_matrix_input: operator\/backend-matrix-latest\.json$/m);
    assert.match(compact, /^selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'scrape'.*'--backend-matrix-in' 'operator\/backend-matrix-latest\.json'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent backend selector CLI prints compact command handoff', () => {
  const matrix = writeProjectMatrix('backend-matrix-agent-backend-select-cli', chromeMcpBackendMatrix());
  try {
    const result = spawnSync(process.execPath, [
      'src/cli.mjs',
      'agent-backend-select',
      '--task',
      'existing-tab',
      '--chrome-mcp-connected',
      'yes',
      '--chrome-mcp-page-list-ok',
      'yes',
      '--chrome-mcp-page-count',
      '1',
      '--backend-matrix-in',
      matrix.relativePath,
      '--mcp-observation-in',
      'operator/chrome-mcp-observation-latest.json',
      '--match-origin',
      'https://github.com',
      '--match-path',
      '/notifications',
      '--tab-index',
      '2',
      '--format',
      'compact'
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 40000
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^task: existing-tab$/m);
    assert.match(result.stdout, /^selected_backend: chrome-devtools-mcp$/m);
    assert.match(result.stdout, /^execution_allowed: yes$/m);
    assert.match(result.stdout, /^backend_matrix_source: saved$/m);
    assert.match(result.stdout, /^recommended_opens_browser: no$/m);
    assert.match(result.stdout, /^recommended_agent_may_run_unattended: yes$/m);
    assert.match(result.stdout, /^workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'existing-tab'.*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
    assert.match(result.stdout, /^selector_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
    assert.match(result.stdout, /^regular_chrome_status_command: 'node' 'src\/cli\.mjs' 'regular-chrome-status' '--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json' '--format' 'compact'$/m);
    assert.match(result.stdout, /^chrome_extension_backend_check_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-backend-check-plan' '--format' 'compact'$/m);
    assert.match(result.stdout, /^chrome_extension_claim_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-claim-plan' '--backend-ready' 'unknown' '--intent' 'inspect'.*'--match-origin' 'https:\/\/github\.com'.*'--match-path' '\/notifications'.*'--tab-index' '2'.*'--format' 'compact'$/m);
  } finally {
    fs.rmSync(matrix.filePath, { force: true });
  }
});

test('agent backend selector CLI preserves regular Chrome background-tab opt-in', () => {
  const matrixValue = chromeMcpBackendMatrix();
  matrixValue.regularChrome.chromeMcpRouteReady = false;
  matrixValue.regularChrome.chromeMcpListPagesTimedOut = true;
  matrixValue.tasks['existing-tab'].selectedLane = 'regular-chrome-mcp-new-background-tab';
  const matrix = writeProjectMatrix('backend-matrix-agent-backend-select-bg', matrixValue);
  try {
    const result = spawnSync(process.execPath, [
      'src/cli.mjs',
      'agent-backend-select',
      '--task',
      'existing-tab',
      '--chrome-mcp-connected',
      'yes',
      '--chrome-mcp-tools',
      '29',
      '--chrome-mcp-page-list-ok',
      'no',
      '--chrome-mcp-last-error',
      'Network.enable timed out',
      '--allow-new-background-tab',
      'yes',
      '--new-background-url-env',
      'REGULAR_CHROME_URL',
      '--backend-matrix-in',
      matrix.relativePath,
      '--format',
      'compact'
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 40000
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^task: existing-tab$/m);
    assert.match(result.stdout, /^selected_lane: regular-chrome-mcp-new-background-tab$/m);
    assert.match(result.stdout, /^selected_backend: chrome-devtools-mcp$/m);
    assert.match(result.stdout, /^execution_allowed: yes$/m);
    assert.match(result.stdout, /^backend_matrix_source: saved$/m);
    assert.match(result.stdout, /^recommended_opens_browser: yes$/m);
    assert.match(result.stdout, /^recommended_agent_may_run_unattended: yes$/m);
    assert.match(result.stdout, /^workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'existing-tab'.*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
    assert.match(result.stdout, /^regular_chrome_status_command: 'node' 'src\/cli\.mjs' 'regular-chrome-status' '--format' 'compact'$/m);
    assert.match(result.stdout, /^chrome_extension_backend_check_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-backend-check-plan' '--format' 'compact'$/m);
    assert.match(result.stdout, /^agent_task_safe_run_command: 'node' 'src\/cli\.mjs' 'agent-task' '--run'.*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  } finally {
    fs.rmSync(matrix.filePath, { force: true });
  }
});
