import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAgentProofStepStatus, formatAgentProofStepStatusCompact } from '../src/agent-proof-step.mjs';
import { buildAgentTaskWatchStatus, formatAgentTaskWatchStatusCompact } from '../src/agent-task.mjs';
import { buildBackgroundProofCaptureStatus, formatBackgroundProofCaptureStatusCompact, formatBackgroundProofCaptureStatusMarkdown } from '../src/background-proof-capture-status.mjs';
import { buildChromeAppleEventsStatus, formatChromeAppleEventsStatusCompact, formatChromeAppleEventsStatusMarkdown } from '../src/chrome-apple-events-status.mjs';
import { buildCompactCommandAudit, formatCompactCommandAuditCompact } from '../src/compact-command-audit.mjs';
import { summarizeHarFile } from '../src/har.mjs';
import { loadPolicy, redact, sanitizeLogLine } from '../src/policy.mjs';
import { buildSecretAudit, buildSecretRunPlan, buildSecretRunSelect, buildSecretSetupPlan, formatSecretAuditCompact, formatSecretAuditMarkdown, formatSecretRunPlanCompact, formatSecretRunPlanMarkdown, formatSecretRunSelectCompact, formatSecretSetupPlanCompact, formatSecretSetupPlanMarkdown } from '../src/secret-audit.mjs';
import { scanTargetPackForSecrets } from '../src/security-audit.mjs';
import { buildTargetBatch, formatTargetBatchCompact, formatTargetBatchMarkdown } from '../src/target-batch.mjs';
import { addTargetOperateStep, scaffoldTargetPack } from '../src/target-pack.mjs';

// Every fixture value is invented and carries the `sbafx-` sentinel so a single scan
// can prove no output surface echoed it. Values are composed from a readable label
// instead of a dense literal so secret scanners do not score the corpus as a real leak.
const fixtureValue = (label) => `sbafx-${label}-fixture-value`;

const FIXTURE = {
  token: 'ghp_sbafx0000000000000000000000000000',
  cookie: fixtureValue('cookie'),
  password: fixtureValue('password'),
  otp: fixtureValue('otp'),
  authHeader: fixtureValue('bearer-jwt'),
  queryParam: fixtureValue('query-access'),
  pageBody: fixtureValue('page-body-recovery-phrase'),
  privateKey: `-----BEGIN RSA PRIVATE KEY-----\n${fixtureValue('private-key')}\n-----END RSA PRIVATE KEY-----`
};

const FIXTURE_URL = `https://app.target.example/callback?access_token=${FIXTURE.queryParam}&otp=${FIXTURE.otp}#frag`;

function asText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function assertNoFixtureSecret(label, value, kinds = Object.keys(FIXTURE)) {
  const text = asText(value);
  for (const kind of kinds) {
    assert.equal(text.includes(FIXTURE[kind]), false, `${label} leaked the ${kind} fixture`);
  }
  assert.doesNotMatch(text, /sbafx-/, `${label} leaked a corpus sentinel`);
}

// A tail that silently truncates would satisfy the no-secret assertions while destroying
// the operator's log surface, so every log tail is also checked for intact redaction.
function assertRedactedTail(label, tail) {
  assert.equal(tail.length, 6, `${label} lost log lines`);
  assert.equal(tail.filter((line) => line.includes('[redacted]')).length, 6, `${label} tail is not fully redacted`);
  assert.ok(tail[1].startsWith('set-cookie:'), `${label} truncated the cookie line`);
}

function writeLogFixture(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    `token=${FIXTURE.token}`,
    `set-cookie: sba_session=${FIXTURE.cookie}; Path=/; HttpOnly`,
    `password=${FIXTURE.password}`,
    `otp=${FIXTURE.otp}`,
    `authorization: Bearer ${FIXTURE.authHeader}`,
    `GET ${FIXTURE_URL} 200`,
    ''
  ].join('\n'));
}

test('redaction corpus: log line sanitizer covers every secret fixture kind', () => {
  const covered = [
    `token=${FIXTURE.token}`,
    `set-cookie: sba_session=${FIXTURE.cookie}; Path=/; HttpOnly`,
    `password=${FIXTURE.password}`,
    `otp=${FIXTURE.otp}`,
    `authorization: Bearer ${FIXTURE.authHeader}`,
    `proxy rejected Bearer ${FIXTURE.authHeader}`,
    `GET ${FIXTURE_URL} 200`
  ];
  for (const line of covered) {
    const sanitized = sanitizeLogLine(line);
    assertNoFixtureSecret(`sanitizeLogLine(${line.slice(0, 24)})`, sanitized);
    assert.match(sanitized, /\[redacted\]/);
  }
  assert.equal(sanitizeLogLine('exitcode=0 statusCode=200'), 'exitcode=0 statusCode=200');
});

test('redaction corpus: policy redaction clears secret-keyed values and auth schemes', () => {
  const policy = loadPolicy();
  const output = redact({
    headers: {
      authorization: `Bearer ${FIXTURE.authHeader}`,
      cookie: `sba_session=${FIXTURE.cookie}`,
      'set-cookie': `sba_session=${FIXTURE.cookie}`
    },
    form: {
      password: FIXTURE.password,
      one_time_password: FIXTURE.otp,
      otp_token: FIXTURE.otp,
      api_key: FIXTURE.token
    },
    sessions: [{ access_token: FIXTURE.token, secret: FIXTURE.privateKey }],
    note: `retry with Bearer ${FIXTURE.authHeader}`
  }, policy);

  assert.equal(output.headers.authorization, '[REDACTED]');
  assert.equal(output.headers.cookie, '[REDACTED]');
  assert.equal(output.headers['set-cookie'], '[REDACTED]');
  assert.equal(output.form.password, '[REDACTED]');
  assert.equal(output.form.one_time_password, '[REDACTED]');
  assert.equal(output.form.otp_token, '[REDACTED]');
  assert.equal(output.form.api_key, '[REDACTED]');
  assert.equal(output.sessions[0].access_token, '[REDACTED]');
  assert.equal(output.note, 'retry with Bearer [REDACTED]');
  assertNoFixtureSecret('policy redact', output);
});

test('redaction corpus: har summary drops query strings, headers, and page bodies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-redaction-har-'));
  const harFile = path.join(dir, 'session.har');
  fs.writeFileSync(harFile, JSON.stringify({
    log: {
      pages: [{ id: 'page_1', title: FIXTURE.pageBody }],
      entries: [{
        request: {
          method: 'GET',
          url: FIXTURE_URL,
          headers: [
            { name: 'authorization', value: `Bearer ${FIXTURE.authHeader}` },
            { name: 'cookie', value: `sba_session=${FIXTURE.cookie}` }
          ],
          postData: { text: `password=${FIXTURE.password}` }
        },
        response: {
          status: 200,
          bodySize: 4096,
          headers: [{ name: 'set-cookie', value: `sba_session=${FIXTURE.cookie}` }],
          content: { mimeType: 'text/html', size: 4096, text: `<p>${FIXTURE.pageBody}</p>` }
        }
      }]
    }
  }));

  const summary = summarizeHarFile(harFile, loadPolicy());
  assert.equal(summary.entries, 1);
  assert.equal(summary.resources[0].path, '/callback');
  assertNoFixtureSecret('har summary', summary);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('redaction corpus: target pack secret scan reports rules without echoing matches', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-redaction-scan-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  fs.writeFileSync(path.join(pack.dir, 'notes.md'), [
    `authorization: Bearer ${FIXTURE.authHeader}`,
    `github: ${FIXTURE.token}`,
    `mirror: https://operator:${FIXTURE.password}@target.example/repo`,
    FIXTURE.privateKey,
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(pack.dir, 'leaked.json'), JSON.stringify({
    cookie: `sba_session=${FIXTURE.cookie}`,
    access_token: FIXTURE.token
  }));

  const findings = scanTargetPackForSecrets(pack.dir);
  const rules = findings.map((finding) => finding.rule);
  assert.ok(rules.includes('authorization-header'));
  assert.ok(rules.includes('github-token'));
  assert.ok(rules.includes('private-key'));
  assert.ok(rules.includes('url-userinfo'));
  assert.ok(rules.includes('sensitive-json-key'));
  for (const finding of findings.filter((item) => item.sample)) {
    assert.equal(finding.sample, '[REDACTED_MATCH]');
  }
  assertNoFixtureSecret('target pack secret scan', findings);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('redaction corpus: proof step status keeps the log tail free of fixture secrets', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-redaction-proof-'));
  fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'runs/operator/agent-proof-step-latest.json'), `${JSON.stringify({
    status: 'completed',
    executed: true,
    allowedToRun: true,
    selectedCommandId: 'resume-capture',
    result: { status: 'completed' }
  })}\n`);
  writeLogFixture(path.join(rootDir, 'runs/operator/agent-proof-step.log'));

  const status = buildAgentProofStepStatus({
    rootDir,
    generatedAt: '2026-08-08T00:00:00.000Z',
    in: 'operator/agent-proof-step-latest.json',
    maxLogLines: 10
  });

  assertRedactedTail('agent proof step status', status.log.tail);
  assertNoFixtureSecret('agent proof step status', status);
  assertNoFixtureSecret('agent proof step compact', formatAgentProofStepStatusCompact(status));
  fs.rmSync(rootDir, { recursive: true, force: true });
});

test('redaction corpus: agent task watch status keeps the log tail free of fixture secrets', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-redaction-task-'));
  writeLogFixture(path.join(rootDir, 'runs/operator/agent-task-watch.log'));

  const status = buildAgentTaskWatchStatus({
    rootDir,
    generatedAt: '2026-08-08T00:00:00.000Z',
    maxLogLines: 10
  });

  assert.equal(status.log.exists, true);
  assertRedactedTail('agent task watch status', status.log.tail);
  assertNoFixtureSecret('agent task watch status', status);
  assertNoFixtureSecret('agent task watch compact', formatAgentTaskWatchStatusCompact(status));
  fs.rmSync(rootDir, { recursive: true, force: true });
});

test('redaction corpus: background capture status keeps the log tail free of fixture secrets', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-redaction-background-'));
  writeLogFixture(path.join(rootDir, 'runs/operator/background-auth-monitor.log'));
  writeLogFixture(path.join(rootDir, 'runs/operator/background-proof-capture.log'));

  const status = await buildBackgroundProofCaptureStatus({
    rootDir,
    generatedAt: '2026-08-08T00:00:00.000Z',
    maxLogLines: 10,
    plan: {
      target: 'target.example',
      status: 'incomplete',
      complete: false,
      captureBlocked: true,
      paths: {
        monitorLogPath: 'runs/operator/background-auth-monitor.log',
        monitorPidPath: 'runs/operator/background-auth-monitor.pid',
        captureLogPath: 'runs/operator/background-proof-capture.log',
        capturePidPath: 'runs/operator/background-proof-capture.pid'
      },
      phases: {
        monitorAuth: {},
        backgroundWaitAuthThenCaptureNoOpen: {}
      }
    }
  });

  assert.equal(status.logs.monitor.exists, true);
  assert.equal(status.logs.capture.exists, true);
  assertRedactedTail('background capture monitor log', status.logs.monitor.tail);
  assertRedactedTail('background capture log', status.logs.capture.tail);
  assertNoFixtureSecret('background capture status', status);
  assertNoFixtureSecret('background capture compact', formatBackgroundProofCaptureStatusCompact(status));
  assertNoFixtureSecret('background capture markdown', formatBackgroundProofCaptureStatusMarkdown(status));
  fs.rmSync(rootDir, { recursive: true, force: true });
});

test('redaction corpus: chrome status hides page title and URL query in every format', () => {
  const runner = (command, args) => {
    assert.equal(command, 'osascript');
    if (String(args.at(-1)).includes('execute active tab')) {
      return { status: 0, stdout: `${FIXTURE.pageBody}\n`, stderr: '' };
    }
    return { status: 0, stdout: `${FIXTURE.pageBody}\n${FIXTURE_URL}\n`, stderr: '' };
  };

  const status = buildChromeAppleEventsStatus({
    generatedAt: '2026-08-08T00:00:00.000Z',
    runner
  });

  assert.equal(status.activeTab.urlRedacted, 'https://app.target.example/callback');
  assert.equal(status.activeTab.queryPresent, true);
  assert.equal(status.activeTab.fullUrlReturned, false);
  assertNoFixtureSecret('chrome apple events status', status);
  assertNoFixtureSecret('chrome apple events compact', formatChromeAppleEventsStatusCompact(status));
  assertNoFixtureSecret('chrome apple events markdown', formatChromeAppleEventsStatusMarkdown(status));
});

test('redaction corpus: target batch output carries no captured auth URL or page text', async () => {
  const batch = await buildTargetBatch('/tmp/sba-redaction-batch-target', {
    generatedAt: '2026-08-08T00:00:00.000Z',
    realExternal: true,
    plan: {
      target: 'target.example',
      dir: '/tmp/sba-redaction-batch-target',
      profile: 'target.example',
      realExternal: true,
      externalOrigins: ['https://app.target.example'],
      currentState: {
        auditOk: true,
        profileLikelyAuthenticated: true,
        permissionsPending: 0,
        daemonRunning: false,
        authCheck: { ok: false, finalUrl: FIXTURE_URL, title: FIXTURE.pageBody },
        missingOutputs: ['observe.json'],
        benchmark: { ok: true },
        proofReady: false
      },
      commands: [{
        id: 'auth-check',
        title: 'Auth check',
        command: {
          args: ['node', 'src/cli.mjs', 'target-auth-check', '/tmp/sba-redaction-batch-target'],
          shell: `'node' 'src/cli.mjs' 'target-auth-check' '/tmp/sba-redaction-batch-target'`
        }
      }]
    }
  });

  assertNoFixtureSecret('target batch compact', formatTargetBatchCompact(batch));
  assertNoFixtureSecret('target batch markdown', formatTargetBatchMarkdown(batch));
});

test('redaction corpus: compact command audit never echoes command text back', async () => {
  const compactText = [
    'status: planned',
    `auth_check_command: 'node' 'src/cli.mjs' 'target-auth-check' '${FIXTURE_URL}'`,
    `login_command: 'node' 'src/cli.mjs' 'target-login-capture' '--run' '--password' '${FIXTURE.password}'`,
    `page_text_sample: ${FIXTURE.pageBody}`,
    ''
  ].join('\n');

  const single = await buildCompactCommandAudit({
    source: 'operator-pack',
    generatedAt: '2026-08-08T00:00:00.000Z',
    compactText
  });
  assert.ok(single.commandCount >= 2);
  assertNoFixtureSecret('compact command audit compact', formatCompactCommandAuditCompact(single));

  const combined = await buildCompactCommandAudit({
    source: 'all',
    generatedAt: '2026-08-08T00:00:00.000Z',
    compactTexts: Object.fromEntries(['operator-pack', 'control-status', 'objective-completion-audit', 'objective-safe-command', 'run-gate-audit', 'agent-control-plane', 'completion-proof-bundle', 'agent-proof-checklist', 'agent-proof-closeout', 'operator-runbook', 'agent-workflow', 'agent-backend-select', 'agent-task', 'chrome-mcp-autostart-plan'].map((source) => [source, compactText]))
  });
  assertNoFixtureSecret('compact command audit all', formatCompactCommandAuditCompact(combined));
});

test('redaction corpus: secret audit surfaces never print 1Password token values', () => {
  const audit = buildSecretAudit({
    generatedAt: '2026-08-08T00:00:00.000Z',
    env: {
      PATH: '',
      OP_SERVICE_ACCOUNT_TOKEN: FIXTURE.token,
      OP_CONNECT_HOST: 'https://connect.target.example',
      OP_CONNECT_TOKEN: FIXTURE.authHeader
    },
    processList: '',
    serviceAccountEnvFile: ''
  });
  const setupPlan = buildSecretSetupPlan({ mode: 'connect', audit });
  const runPlan = buildSecretRunPlan({ mode: 'connect', command: 'control-status', audit });
  const selection = buildSecretRunSelect({ command: 'control-status', audit });

  for (const [label, value] of [
    ['secret audit', audit],
    ['secret audit compact', formatSecretAuditCompact(audit)],
    ['secret audit markdown', formatSecretAuditMarkdown(audit)],
    ['secret setup plan', setupPlan],
    ['secret setup plan compact', formatSecretSetupPlanCompact(setupPlan)],
    ['secret setup plan markdown', formatSecretSetupPlanMarkdown(setupPlan)],
    ['secret run plan', runPlan],
    ['secret run plan compact', formatSecretRunPlanCompact(runPlan)],
    ['secret run plan markdown', formatSecretRunPlanMarkdown(runPlan)],
    ['secret run select', selection],
    ['secret run select compact', formatSecretRunSelectCompact(selection)]
  ]) {
    assertNoFixtureSecret(label, value);
  }
  assert.equal(audit.secretValuesRead, false);
});

test('redaction corpus: operate steps refuse inline OTP and password values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-redaction-operate-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });

  assert.throws(
    () => addTargetOperateStep(pack.dir, 'fill', { selector: '#otp', value: FIXTURE.otp }),
    /use --value-env/
  );
  assert.throws(
    () => addTargetOperateStep(pack.dir, 'fill', { selector: 'input[type=password]', value: FIXTURE.password }),
    /use --value-env/
  );

  const added = addTargetOperateStep(pack.dir, 'fill', {
    selector: '#search',
    as: 'fill_search',
    value: FIXTURE.pageBody,
    dryRun: true
  });
  assert.equal(added.added.value, '<inline-value-redacted>');
  assert.equal(added.added.valueLength, FIXTURE.pageBody.length);
  assertNoFixtureSecret('target operate add', added);
  assertNoFixtureSecret('operate recipe file', fs.readFileSync(pack.recipes.operate, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
});
