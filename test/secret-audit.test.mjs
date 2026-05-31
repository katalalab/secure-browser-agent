import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSecretAudit, buildSecretRunPlan, buildSecretRunSelect, buildSecretSetupPlan, formatSecretAuditCompact, formatSecretAuditMarkdown, formatSecretRunPlanCompact, formatSecretRunPlanMarkdown, formatSecretRunSelectCompact, formatSecretSetupPlanCompact, formatSecretSetupPlanMarkdown } from '../src/secret-audit.mjs';

function makeExecutable(filePath, body = '#!/bin/sh\necho "2.34.0-test"\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
  fs.chmodSync(filePath, 0o755);
}

test('secret audit reports no headless mode without service or connect env', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-audit-missing-'));
  const report = buildSecretAudit({
    generatedAt: '2026-05-28T00:00:00.000Z',
    env: { PATH: '' },
    processList: '',
    serviceAccountEnvFile: ''
  });

  assert.equal(report.safeMode, true);
  assert.equal(report.destructiveActionsIncluded, false);
  assert.equal(report.secretValuesRead, false);
  assert.equal(report.headlessReady, false);
  assert.equal(report.recommendedHeadlessMode, 'not-configured');
  assert.equal(report.op.exists, false);
  assert.equal(report.env.OP_SERVICE_ACCOUNT_TOKEN, false);
  assert.equal(report.processes.onePasswordMcp, 0);
  assert.ok(report.next.join('\n').includes('Service Account'));
  assert.match(formatSecretAuditMarkdown(report), /Secret values read: no/);
  assert.match(formatSecretAuditCompact(report), /^headless_ready: no/m);
  fs.rmSync(rootDir, { recursive: true, force: true });
});

test('secret audit accepts service account env without exposing value', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-audit-service-'));
  const binDir = path.join(rootDir, 'bin');
  makeExecutable(path.join(binDir, 'op'));
  const processList = [
    '1595 1 /Applications/1Password.app/Contents/MacOS/1Password',
    '11010 1 op daemon',
    '7812 54471 /Applications/1Password.app/Contents/MacOS/onepassword-mcp',
    '14177 32047 /Applications/1Password.app/Contents/Library/LoginItems/1Password Browser Helper.app/Contents/MacOS/1Password-BrowserSupport'
  ].join('\n');

  const report = buildSecretAudit({
    generatedAt: '2026-05-28T00:00:00.000Z',
    env: {
      PATH: binDir,
      OP_SERVICE_ACCOUNT_TOKEN: 'never-print-this-token',
      OP_ACCOUNT: 'example.1password.com'
    },
    processList,
    serviceAccountEnvFile: ''
  });

  assert.equal(report.headlessReady, true);
  assert.equal(report.recommendedHeadlessMode, 'service-account');
  assert.equal(report.capabilities.serviceAccountConfigured, true);
  assert.equal(report.capabilities.connectConfigured, false);
  assert.equal(report.capabilities.desktopIntegrationLikely, true);
  assert.equal(report.capabilities.environmentsMcpLikely, true);
  assert.equal(report.op.version, '2.34.0-test');
  assert.equal(report.processes.onePasswordApp, 1);
  assert.equal(report.processes.opDaemon, 1);
  assert.equal(report.processes.onePasswordMcp, 1);
  assert.equal(JSON.stringify(report).includes('never-print-this-token'), false);
  const markdown = formatSecretAuditMarkdown(report);
  assert.match(markdown, /Headless ready: yes/);
  assert.match(markdown, /Service account token env: set/);
  assert.doesNotMatch(markdown, /never-print-this-token/);
  const compact = formatSecretAuditCompact(report);
  assert.match(compact, /^recommended_headless_mode: service-account/m);
  assert.match(compact, /^service_account: yes/m);
  assert.doesNotMatch(compact, /never-print-this-token/);
});

test('secret audit prefers connect when both connect and service account env are present', () => {
  const report = buildSecretAudit({
    generatedAt: '2026-05-28T00:00:00.000Z',
    env: {
      PATH: '',
      OP_SERVICE_ACCOUNT_TOKEN: 'service-token',
      OP_CONNECT_HOST: 'https://connect.example.test',
      OP_CONNECT_TOKEN: 'connect-token'
    },
    processList: '',
    serviceAccountEnvFile: ''
  });

  assert.equal(report.headlessReady, true);
  assert.equal(report.recommendedHeadlessMode, 'connect-server');
  assert.equal(report.capabilities.serviceAccountConfigured, true);
  assert.equal(report.capabilities.connectConfigured, true);
  assert.equal(JSON.stringify(report).includes('service-token'), false);
  assert.equal(JSON.stringify(report).includes('connect-token'), false);
});

test('secret audit detects a local service account env file without reading it', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-audit-env-file-'));
  const envFile = path.join(rootDir, '1password.env');
  fs.writeFileSync(envFile, 'OP_SERVICE_ACCOUNT_TOKEN=do-not-read-this\n', { mode: 0o600 });

  const report = buildSecretAudit({
    generatedAt: '2026-05-28T00:00:00.000Z',
    env: { PATH: '' },
    processList: '',
    serviceAccountEnvFile: envFile
  });

  assert.equal(report.headlessReady, false);
  assert.equal(report.headlessConfigAvailable, true);
  assert.equal(report.recommendedHeadlessMode, 'service-account');
  assert.equal(report.capabilities.serviceAccountEnvFilePresent, true);
  assert.equal(report.capabilities.serviceAccountEnvFileStrict, true);
  assert.equal(report.capabilities.serviceAccountEnvFileUsable, true);
  assert.equal(report.serviceAccountEnvFile.path, envFile);
  assert.equal(report.serviceAccountEnvFile.mode, '600');
  assert.equal(JSON.stringify(report).includes('do-not-read-this'), false);
  assert.match(formatSecretAuditCompact(report), /^service_account_env_file: yes/m);
  assert.match(formatSecretAuditCompact(report), /^headless_config_available: yes/m);
  assert.match(formatSecretAuditCompact(report), /^recommended_headless_mode: service-account/m);
  assert.match(formatSecretAuditMarkdown(report), /Service account env file:/);
  assert.doesNotMatch(formatSecretAuditMarkdown(report), /do-not-read-this/);

  const setup = buildSecretSetupPlan({ mode: 'service-account', audit: report });
  assert.equal(setup.readyForMode, false);
  assert.ok(setup.commands.some((item) => item.id === 'source-service-account-env-file'));
  assert.match(formatSecretSetupPlanCompact(setup), /^service_account_env_file: yes/m);

  const runPlan = buildSecretRunPlan({
    mode: 'service-account',
    command: 'control-status',
    audit: report
  });
  assert.equal(runPlan.readyForMode, false);
  assert.deepEqual(runPlan.requiredSetupCommandIds, ['source-service-account-env-file']);
  assert.match(formatSecretRunPlanCompact(runPlan), /^run: 'sh' '-lc' /m);
  assert.match(formatSecretRunPlanCompact(runPlan), /1password\.env/);
  assert.match(formatSecretRunPlanCompact(runPlan), /source the local env file inline/);
  assert.doesNotMatch(formatSecretRunPlanCompact(runPlan), /do-not-read-this/);
});

test('secret setup plan builds service account commands without exposing token values', () => {
  const plan = buildSecretSetupPlan({
    generatedAt: '2026-05-28T00:00:00.000Z',
    mode: 'service-account',
    audit: buildSecretAudit({
      generatedAt: '2026-05-28T00:00:00.000Z',
      env: {
        PATH: '',
        OP_SERVICE_ACCOUNT_TOKEN: 'actual-token'
      },
      processList: '',
      serviceAccountEnvFile: ''
    })
  });

  assert.equal(plan.mode, 'service-account');
  assert.equal(plan.readyForMode, true);
  assert.equal(plan.headlessMode, true);
  assert.equal(plan.secretValuesRead, false);
  assert.ok(plan.commands.some((item) => item.id === 'export-service-account-token' && item.operatorOnly));
  assert.ok(plan.commands.some((item) => item.id === 'run-with-secret-env'));
  assert.equal(JSON.stringify(plan).includes('actual-token'), false);
  const markdown = formatSecretSetupPlanMarkdown(plan);
  assert.match(markdown, /Secret Setup Plan/);
  assert.match(markdown, /export-service-account-token/);
  assert.doesNotMatch(markdown, /actual-token/);
  const compact = formatSecretSetupPlanCompact(plan);
  assert.match(compact, /^mode: service-account/m);
  assert.match(compact, /^ready: yes/m);
});

test('secret setup plan supports connect and local desktop modes', () => {
  const connect = buildSecretSetupPlan({
    mode: 'connect',
    audit: buildSecretAudit({
      env: {
        PATH: '',
        OP_CONNECT_HOST: 'https://connect.example.test',
        OP_CONNECT_TOKEN: 'actual-connect-secret'
      },
      processList: '',
      serviceAccountEnvFile: ''
    })
  });
  assert.equal(connect.readyForMode, true);
  assert.ok(connect.commands.some((item) => item.id === 'export-connect-token'));
  assert.equal(JSON.stringify(connect).includes('actual-connect-secret'), false);

  const localDesktop = buildSecretSetupPlan({
    mode: 'local-desktop',
    audit: buildSecretAudit({
      env: { PATH: '' },
      processList: '',
      serviceAccountEnvFile: ''
    })
  });
  assert.equal(localDesktop.headlessMode, false);
  assert.equal(localDesktop.readyForMode, false);
  assert.ok(localDesktop.commands.some((item) => item.id === 'verify-account'));
});

test('secret setup plan rejects unknown modes', () => {
  assert.throws(
    () => buildSecretSetupPlan({ mode: 'bad-mode', env: { PATH: '' }, processList: '' }),
    /invalid secret setup mode/
  );
});

test('secret run plan wraps agent commands with op run without reading secrets', () => {
  const plan = buildSecretRunPlan({
    generatedAt: '2026-05-28T00:00:00.000Z',
    mode: 'service-account',
    command: 'target-login-capture',
    targetDir: 'runs/target-packs/github',
    audit: buildSecretAudit({
      generatedAt: '2026-05-28T00:00:00.000Z',
      env: {
        PATH: '',
        OP_SERVICE_ACCOUNT_TOKEN: 'do-not-print-me'
      },
      processList: '',
      serviceAccountEnvFile: ''
    })
  });

  assert.equal(plan.mode, 'service-account');
  assert.equal(plan.readyForMode, true);
  assert.equal(plan.headlessMode, true);
  assert.equal(plan.commandId, 'target-login-capture');
  assert.equal(plan.secretValuesRead, false);
  assert.deepEqual(plan.requiredSetupCommandIds, []);
  assert.equal(JSON.stringify(plan).includes('do-not-print-me'), false);
  const wrapped = plan.commands.find((item) => item.id === 'wrapped-agent-command');
  assert.ok(wrapped.command.args.includes('op'));
  assert.ok(wrapped.command.shell.includes("'target-login-capture'"));
  assert.ok(wrapped.command.shell.includes("'runs/target-packs/github'"));
  const markdown = formatSecretRunPlanMarkdown(plan);
  assert.match(markdown, /Secret Run Plan/);
  assert.doesNotMatch(markdown, /do-not-print-me/);
  const compact = formatSecretRunPlanCompact(plan);
  assert.match(compact, /^command_id: target-login-capture$/m);
  assert.match(compact, /^setup_required: none$/m);
  assert.doesNotMatch(compact, /do-not-print-me/);
});

test('secret run plan uses HOME-relative service account env file command for compact handoff', () => {
  const homeEnvFile = path.join(os.homedir(), '.config/ai-secret/1password.env');
  const plan = buildSecretRunPlan({
    generatedAt: '2026-05-28T00:00:00.000Z',
    mode: 'service-account',
    command: 'control-status',
    audit: {
      headlessReady: false,
      recommendedHeadlessMode: 'service-account',
      op: { exists: true, version: 'op 2.0.0' },
      capabilities: {
        connectConfigured: false,
        serviceAccountConfigured: false,
        serviceAccountEnvFileUsable: true,
        desktopIntegrationLikely: false
      },
      serviceAccountEnvFile: {
        path: homeEnvFile
      }
    }
  });

  const compact = formatSecretRunPlanCompact(plan);
  assert.match(compact, /\$\{HOME\}\/\.config\/ai-secret\/1password\.env/);
  assert.doesNotMatch(compact, new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(compact, /^run: 'sh' '-lc' /m);
});

test('secret run plan lists setup prerequisites when headless mode is not configured', () => {
  const plan = buildSecretRunPlan({
    generatedAt: '2026-05-28T00:00:00.000Z',
    mode: 'connect',
    command: 'control-status',
    audit: buildSecretAudit({
      generatedAt: '2026-05-28T00:00:00.000Z',
      env: { PATH: '' },
      processList: '',
      serviceAccountEnvFile: ''
    })
  });

  assert.equal(plan.readyForMode, false);
  assert.deepEqual(plan.requiredSetupCommandIds, ['export-connect-host', 'export-connect-token']);
  assert.match(formatSecretRunPlanCompact(plan), /^setup_required: export-connect-host,export-connect-token$/m);
});

test('secret run selector chooses connect, service account, env file, or setup without reading values', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-run-select-'));
  try {
    const binDir = path.join(rootDir, 'bin');
    makeExecutable(path.join(binDir, 'op'));
    const envFile = path.join(rootDir, '1password.env');
    fs.writeFileSync(envFile, 'OP_SERVICE_ACCOUNT_TOKEN=do-not-read-this\n', { mode: 0o600 });

    const connect = buildSecretRunSelect({
      generatedAt: '2026-05-30T00:00:00.000Z',
      command: 'target-proof-capture',
      targetDir: 'runs/target-packs/github',
      audit: buildSecretAudit({
        env: {
          PATH: binDir,
          OP_CONNECT_HOST: 'https://connect.example.test',
          OP_CONNECT_TOKEN: 'secret-connect-token'
        },
        processList: '',
        serviceAccountEnvFile: ''
      })
    });
    assert.equal(connect.selectedMode, 'connect');
    assert.equal(connect.selectedCandidate, 'connect');
    assert.equal(connect.readyToRunNow, true);
    assert.equal(connect.secretValuesRead, false);
    assert.equal(connect.runCommandSafety.opensBrowser, false);
    assert.equal(connect.runCommandSafety.startsCapture, true);
    assert.equal(connect.runCommandSafety.requiresOperatorApproval, true);
    assert.equal(connect.runCommandSafety.agentMayRunUnattended, false);
    assert.equal(JSON.stringify(connect).includes('secret-connect-token'), false);

    const service = buildSecretRunSelect({
      audit: buildSecretAudit({
        env: {
          PATH: binDir,
          OP_SERVICE_ACCOUNT_TOKEN: 'secret-service-token'
        },
        processList: '',
        serviceAccountEnvFile: ''
      })
    });
    assert.equal(service.selectedMode, 'service-account');
    assert.equal(service.selectedCandidate, 'service-account');
    assert.equal(service.readyToRunNow, true);
    assert.equal(JSON.stringify(service).includes('secret-service-token'), false);

    const fileBacked = buildSecretRunSelect({
      audit: buildSecretAudit({
        env: { PATH: binDir },
        processList: '',
        serviceAccountEnvFile: envFile
      })
    });
    assert.equal(fileBacked.selectedMode, 'service-account');
    assert.equal(fileBacked.selectedCandidate, 'service-account-env-file');
    assert.equal(fileBacked.readyToRunNow, true);
    assert.match(fileBacked.command.shell, /1password\.env/);
    assert.equal(JSON.stringify(fileBacked).includes('do-not-read-this'), false);
    assert.match(formatSecretRunSelectCompact(fileBacked), /^service_account_env_file_ready: yes$/m);
    assert.match(formatSecretRunSelectCompact(fileBacked), /^run_requires_operator_approval: no$/m);
    assert.match(formatSecretRunSelectCompact(connect), /^run_starts_capture: yes$/m);
    assert.match(formatSecretRunSelectCompact(connect), /^run_requires_operator_approval: yes$/m);
    assert.match(formatSecretRunSelectCompact(connect), /^run_agent_may_run_unattended: no$/m);

    const missing = buildSecretRunSelect({
      audit: buildSecretAudit({
        env: { PATH: '' },
        processList: '',
        serviceAccountEnvFile: ''
      })
    });
    assert.equal(missing.readyToRunNow, false);
    assert.equal(missing.setupRequired.includes('install-1password-cli'), true);
    assert.match(formatSecretRunSelectCompact(missing), /^ready_to_run_now: no$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('secret run plan rejects unknown command ids', () => {
  assert.throws(
    () => buildSecretRunPlan({ command: 'bad-command', env: { PATH: '' }, processList: '' }),
    /invalid secret run command/
  );
});
