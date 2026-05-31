import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy, profilePath } from '../src/policy.mjs';
import { scaffoldTargetPack } from '../src/target-pack.mjs';
import { buildTargetProof, buildTargetProofInventory, buildTargetProofNext, buildTargetProofPlan, findTargetProofs, formatTargetProofInventoryCompact, formatTargetProofInventoryMarkdown, formatTargetProofMarkdown, formatTargetProofNextCompact, formatTargetProofNextMarkdown, formatTargetProofPlanCompact, formatTargetProofPlanMarkdown, isAcceptedExternalProof, isRealExternalOrigin } from '../src/target-proof.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeFixturePolicy(root) {
  const configDir = path.join(root, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const policyPath = path.join(configDir, 'policy.json');
  writeJson(policyPath, {
    allowedOrigins: [
      'https://accounts.vendor-service.com',
      'https://app.vendor-service.com',
      'https://html.duckduckgo.com'
    ],
    defaultProfile: 'default',
    defaultEngine: 'chrome',
    allowedEngines: ['chrome'],
    authenticatedEngines: ['chrome'],
    outputDir: 'runs',
    profileDir: 'profiles',
    redactKeys: ['authorization', 'cookie', 'password', 'token', 'secret'],
    maxEvalBytes: 12000
  });
  return policyPath;
}

function seedAuthenticatedProfile(policy, profile) {
  const dir = profilePath(policy, profile);
  fs.mkdirSync(path.join(dir, 'Default', 'Network'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Local State'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Default', 'Network', 'Cookies'), 'cookie-db-placeholder', 'utf8');
}

function seedOutputs(outputDir) {
  writeJson(path.join(outputDir, 'observe.json'), {
    ok: true,
    steps: [{ output: { counts: { links: 2 } } }]
  });
  writeJson(path.join(outputDir, 'inspect.json'), {
    ok: true,
    steps: [{ output: { candidates: [{ selector: '.row', count: 2 }] } }]
  });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'scrape.csv'), '\uFEFFtext,href\nAlpha,/a\nBeta,/b\n', 'utf8');
}

function seedBenchmark(packDir) {
  const file = path.join(packDir, 'proof', 'target-benchmark.json');
  writeJson(file, {
    preflight: { ok: true },
    recommendation: {
      fastestMode: 'target-cdp-daemon',
      fastestRecipe: 'observe'
    },
    results: [
      { mode: 'target-cdp-daemon', recipe: 'observe', ok: true, meanMs: 120 }
    ]
  });
  return file;
}

function seedAuthCheck(packDir, finalUrl = 'https://app.vendor-service.com/dashboard') {
  const file = path.join(packDir, 'proof', 'auth-check.json');
  writeJson(file, {
    ok: true,
    sameOrigin: true,
    loginLike: false,
    finalUrl
  });
  return file;
}

function seedFailedAuthCheck(packDir) {
  const file = path.join(packDir, 'proof', 'auth-check.json');
  writeJson(file, {
    ok: false,
    sameOrigin: true,
    loginLike: true,
    finalUrl: 'https://accounts.vendor-service.com/login'
  });
  return file;
}

function seedOperatorHandoff(outputDir, packDir) {
  writeJson(path.join(outputDir, 'operator-handoff.json'), {
    schemaVersion: 1,
    target: 'vendor-service',
    handoff: {
      commands: [
        {
          id: 'post-login-capture',
          title: 'Wait for auth-check and capture proof artifacts',
          args: [
            'node',
            'src/cli.mjs',
            'target-proof-capture',
            packDir,
            '--real-external',
            '--run',
            '--wait-auth',
            '--auth-check-port',
            '45678',
            '--format',
            'markdown'
          ]
        }
      ]
    }
  });
}

test('real external origin detection rejects local, data, and example targets', () => {
  assert.equal(isRealExternalOrigin('data:'), false);
  assert.equal(isRealExternalOrigin('http://127.0.0.1:3000'), false);
  assert.equal(isRealExternalOrigin('http://127.0.0.2:3000'), false);
  assert.equal(isRealExternalOrigin('http://10.0.0.10'), false);
  assert.equal(isRealExternalOrigin('http://172.16.0.10'), false);
  assert.equal(isRealExternalOrigin('http://192.168.0.10'), false);
  assert.equal(isRealExternalOrigin('http://169.254.1.1'), false);
  assert.equal(isRealExternalOrigin('http://[::1]:3000'), false);
  assert.equal(isRealExternalOrigin('http://[fe80::1]'), false);
  assert.equal(isRealExternalOrigin('http://[fd00::1]'), false);
  assert.equal(isRealExternalOrigin('https://example.com'), false);
  assert.equal(isRealExternalOrigin('https://app.vendor-service.com'), true);
});

test('target proof writes a secret-free accepted external proof', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const pack = scaffoldTargetPack(policy, {
      name: 'vendor-service',
      origins: 'https://accounts.vendor-service.com,https://app.vendor-service.com',
      loginUrl: 'https://accounts.vendor-service.com/login',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      permissions: 'clipboard',
      force: true
    });
    const targetPolicy = loadPolicy(pack.policy);
    seedAuthenticatedProfile(targetPolicy, 'vendor-service');
    seedOutputs(targetPolicy.outputDir);
    seedBenchmark(pack.dir);
    seedAuthCheck(pack.dir);

    const proof = await buildTargetProof(pack.dir, {
      realExternal: true,
      write: true
    });

    assert.equal(proof.ok, true);
    assert.equal(proof.realExternal, true);
    assert.equal(proof.profileLikelyAuthenticated, true);
    assert.equal(proof.authCheck.ok, true);
    assert.equal(proof.outputs.every((item) => item.exists && !JSON.stringify(item).includes('Alpha')), true);
    assert.equal(proof.benchmark.ok, true);
    assert.equal(isAcceptedExternalProof(proof), true);
    assert.ok(proof.proofPath.endsWith('proof/target-proof.json'));
    assert.match(formatTargetProofMarkdown(proof), /Real external: yes/);

    const found = findTargetProofs(root);
    assert.equal(found.length, 1);
    assert.equal(found[0].proof.ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof inventory rejects weak real-external proof files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-weak-'));
  try {
    writeJson(path.join(root, 'runs', 'target-packs', 'vendor-service', 'proof', 'target-proof.json'), {
      ok: true,
      realExternal: true,
      target: 'vendor-service'
    });

    const inventory = await buildTargetProofInventory(root, { realExternal: true });

    assert.equal(inventory.summary.targetProofs, 1);
    assert.equal(inventory.summary.acceptedExternalProofs, 0);
    assert.equal(inventory.complete, false);
    assert.equal(isAcceptedExternalProof({ ok: true, realExternal: true }), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof plan returns a safe real external operator checklist', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-plan-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const pack = scaffoldTargetPack(policy, {
      name: 'vendor-service',
      origins: 'https://accounts.vendor-service.com,https://app.vendor-service.com',
      loginUrl: 'https://accounts.vendor-service.com/login',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      permissions: 'clipboard',
      force: true
    });
    const targetPolicy = loadPolicy(pack.policy);
    seedAuthenticatedProfile(targetPolicy, 'vendor-service');
    seedOutputs(targetPolicy.outputDir);
    const benchmarkFile = seedBenchmark(pack.dir);
    const authCheckFile = seedAuthCheck(pack.dir);

    const plan = await buildTargetProofPlan(pack.dir, {
      realExternal: true,
      benchmarkFile,
      authCheckFile
    });

    assert.equal(plan.safeMode, true);
    assert.equal(plan.destructiveActionsIncluded, false);
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.currentState.proofReady, true);
    assert.deepEqual(plan.currentState.missingOutputs, []);
    assert.equal(plan.currentState.authCheck.ok, true);
    assert.equal(plan.nextAction.id, 'write-proof');
    assert.equal(plan.nextCommandSafety.opensBrowser, false);
    assert.equal(plan.nextCommandSafety.startsCapture, false);
    assert.equal(plan.nextCommandSafety.requiresOperatorApproval, false);
    assert.equal(plan.nextCommandSafety.agentMayRunUnattended, true);
    assert.equal(plan.commands.find((step) => step.id === 'login').safety.opensBrowser, true);
    assert.equal(plan.commands.find((step) => step.id === 'login').safety.requiresOperatorApproval, true);
    assert.equal(plan.commands.find((step) => step.id === 'auth-check').safety.requiresOperatorApproval, false);
    assert.equal(plan.commands.find((step) => step.id === 'write-proof').safety.agentMayRunUnattended, true);
    assert.ok(plan.externalOrigins.includes('https://app.vendor-service.com'));
    assert.ok(plan.commands.some((step) => step.id === 'auth-check' && step.status === 'already-satisfied'));
    assert.ok(plan.commands.some((step) => step.id === 'benchmark' && step.command.shell.includes('--write') && step.command.shell.includes('proof/target-benchmark.json')));
    assert.ok(plan.commands.some((step) => step.id === 'write-proof' && step.command.shell.includes('--real-external') && step.command.shell.includes('--auth-check-file')));
    assert.equal(JSON.stringify(plan).includes('Alpha'), false);
    assert.match(formatTargetProofPlanMarkdown(plan), /Target Proof Plan/);
    assert.match(formatTargetProofPlanMarkdown(plan), /Proof ready: yes/);
    assert.match(formatTargetProofPlanMarkdown(plan), /Auth-check OK is the proof gate/);
    assert.match(formatTargetProofPlanCompact(plan), /^safe_mode: yes/m);
    assert.match(formatTargetProofPlanCompact(plan), /^proof_ready: yes/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_action: write-proof/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command_opens_browser: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command_starts_capture: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command_requires_operator_approval: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command_agent_may_run_unattended: yes/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_command_id: write-proof/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_may_run_unattended: yes/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_opens_browser: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_starts_capture: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_reads_browser_storage: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_returns_page_content: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_blocked_reason: none/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command: 'node' 'src\/cli\.mjs' 'target-proof'.*'--real-external'/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-proof'.*'--real-external'/m);
    assert.match(formatTargetProofPlanCompact(plan), /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof plan blocks strict automation when required outputs are missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-plan-missing-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const pack = scaffoldTargetPack(policy, {
      name: 'vendor-service',
      origins: 'https://app.vendor-service.com',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const targetPolicy = loadPolicy(pack.policy);
    seedAuthenticatedProfile(targetPolicy, 'vendor-service');
    seedBenchmark(pack.dir);
    seedAuthCheck(pack.dir);

    const plan = await buildTargetProofPlan(pack.dir, { realExternal: true });

    assert.equal(plan.currentState.proofReady, false);
    assert.deepEqual(plan.currentState.missingOutputs, ['observe.json', 'inspect.json', 'scrape.csv']);
    assert.deepEqual(
      plan.currentState.missingArtifacts.map((item) => item.id),
      ['output:observe.json', 'output:inspect.json', 'output:scrape.csv', 'target-proof']
    );
    assert.ok(plan.blockers.some((item) => item.includes('Required output files')));
    assert.equal(plan.nextAction.id, 'capture');
    assert.equal(plan.nextCommandSafety.opensBrowser, false);
    assert.equal(plan.nextCommandSafety.startsCapture, true);
    assert.equal(plan.nextCommandSafety.requiresOperatorApproval, true);
    assert.equal(plan.nextCommandSafety.agentMayRunUnattended, false);
    assert.equal(plan.commands.find((step) => step.id === 'start-daemon').safety.startsBackground, true);
    assert.equal(plan.commands.find((step) => step.id === 'handoff-resume').safety.opensBrowser, true);
    assert.equal(plan.commands.find((step) => step.id === 'handoff-resume').safety.startsCapture, true);
    assert.equal(plan.commands.find((step) => step.id === 'handoff-resume').safety.requiresOperatorApproval, true);
    assert.equal(plan.commands.find((step) => step.id === 'write-proof').status, 'manual-required');
    assert.match(formatTargetProofPlanMarkdown(plan), /Proof ready: no/);
    assert.match(formatTargetProofPlanMarkdown(plan), /Missing Artifacts/);
    assert.match(formatTargetProofPlanCompact(plan), /^proof_ready: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^missing_artifacts: output:observe\.json,output:inspect\.json,output:scrape\.csv,target-proof/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_action: capture/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command_opens_browser: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command_starts_capture: yes/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command_requires_operator_approval: yes/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command_agent_may_run_unattended: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_command_id: target-approval-preflight/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_may_run_unattended: yes/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_opens_browser: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_starts_capture: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_reads_browser_storage: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_returns_page_content: no/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_blocked_reason: operator-approval-required/m);
    assert.match(formatTargetProofPlanCompact(plan), /^next_command: 'node' 'src\/cli\.mjs' 'target-proof-capture'.*'--completion-audit'/m);
    assert.match(formatTargetProofPlanCompact(plan), /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'.*'--real-external'/m);
    assert.match(formatTargetProofPlanCompact(plan), /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof inventory summarizes all packs without output rows or secrets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-inventory-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const ready = scaffoldTargetPack(policy, {
      name: 'vendor-ready',
      origins: 'https://app.vendor-service.com',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const missing = scaffoldTargetPack(policy, {
      name: 'vendor-missing',
      origins: 'https://app.vendor-service.com',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const readyPolicy = loadPolicy(ready.policy);
    seedAuthenticatedProfile(readyPolicy, 'vendor-ready');
    seedOutputs(readyPolicy.outputDir);
    seedBenchmark(ready.dir);
    seedAuthCheck(ready.dir);
    const missingPolicy = loadPolicy(missing.policy);
    seedAuthenticatedProfile(missingPolicy, 'vendor-missing');

    const inventory = await buildTargetProofInventory(root, { realExternal: true });

    assert.equal(inventory.safeMode, true);
    assert.equal(inventory.destructiveActionsIncluded, false);
    assert.equal(inventory.summary.targetPacks, 2);
    assert.equal(inventory.summary.proofReady, 1);
    assert.equal(inventory.complete, false);
    assert.deepEqual(inventory.acceptedExternalProofs, []);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').proofReady, true);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').authState, 'usable');
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').authCheckOk, true);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').authUsable, true);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').profileAuthMetadataOnly, false);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').nextAction.id, 'write-proof');
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').nextCommandSafety.requiresOperatorApproval, false);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').nextCommandSafety.agentMayRunUnattended, true);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').agentSafeNext.id, 'write-proof');
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').agentSafeNext.mayRunUnattended, true);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').agentSafeNext.opensBrowser, false);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-ready').agentSafeNext.startsCapture, false);
    assert.match(inventory.targets.find((item) => item.target === 'vendor-ready').nextAction.command.shell, /target-proof/);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-missing').proofReady, false);
    assert.ok(inventory.targets.find((item) => item.target === 'vendor-missing').missingArtifacts.some((item) => item.id === 'benchmark'));
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-missing').nextAction.id, 'capture');
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-missing').nextCommandSafety.startsCapture, true);
    assert.equal(inventory.targets.find((item) => item.target === 'vendor-missing').nextCommandSafety.requiresOperatorApproval, true);
    assert.match(inventory.targets.find((item) => item.target === 'vendor-missing').nextAction.command.shell, /target-proof-capture/);
    assert.equal(JSON.stringify(inventory).includes('Alpha'), false);
    assert.match(formatTargetProofInventoryMarkdown(inventory), /Target Proof Inventory/);
    assert.match(formatTargetProofInventoryMarkdown(inventory), /Complete: no/);
    assert.match(formatTargetProofInventoryMarkdown(inventory), /Auth usable: 1/);
    assert.match(formatTargetProofInventoryMarkdown(inventory), /Auth State/);
    assert.match(formatTargetProofInventoryMarkdown(inventory), /vendor-ready .* usable /);
    assert.match(formatTargetProofInventoryMarkdown(inventory), /write-proof/);
    const compact = formatTargetProofInventoryCompact(inventory);
    assert.match(compact, /^complete: no$/m);
    assert.match(compact, /^real_external: yes$/m);
    assert.match(compact, /^target_packs: 2$/m);
    assert.match(compact, /^summary_auth_usable: 1$/m);
    assert.match(compact, /^targets_compact: vendor-missing:metadata-only-unchecked:capture,vendor-ready:usable:write-proof$/m);
    assert.match(compact, /^target: vendor-ready$/m);
    assert.match(compact, /^next: write-proof$/m);
    assert.match(compact, /^next_command_requires_operator_approval: no$/m);
    assert.match(compact, /^next_command_agent_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_command_id: write-proof$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
    assert.match(compact, /^agent_safe_next_blocked_reason: none$/m);
    assert.match(compact, /^target_auth_check_ok: yes$/m);
    assert.match(compact, /^auth_state: usable$/m);
    assert.match(compact, /^target_auth_usable: yes$/m);
    assert.match(compact, /^missing_artifact_count: 1$/m);
    assert.match(compact, /^missing_artifacts: target-proof$/m);
    assert.match(compact, /^secret_values_read: no$/m);
    assert.match(compact, /^destructive_actions: no$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-proof'.*'--real-external'/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof next selects the highest-value next safe action', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-next-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const ready = scaffoldTargetPack(policy, {
      name: 'vendor-ready',
      origins: 'https://app.vendor-service.com',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const missing = scaffoldTargetPack(policy, {
      name: 'vendor-missing',
      origins: 'https://app.vendor-service.com',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const readyPolicy = loadPolicy(ready.policy);
    seedAuthenticatedProfile(readyPolicy, 'vendor-ready');
    seedOutputs(readyPolicy.outputDir);
    seedBenchmark(ready.dir);
    seedAuthCheck(ready.dir);
    const missingPolicy = loadPolicy(missing.policy);
    seedAuthenticatedProfile(missingPolicy, 'vendor-missing');

    const next = await buildTargetProofNext(root, { realExternal: true });

    assert.equal(next.safeMode, true);
    assert.equal(next.destructiveActionsIncluded, false);
    assert.equal(next.complete, false);
    assert.equal(next.target.target, 'vendor-ready');
    assert.equal(next.nextAction.id, 'write-proof');
    assert.equal(next.nextCommandSafety.requiresOperatorApproval, false);
    assert.equal(next.nextCommandSafety.agentMayRunUnattended, true);
    assert.equal(next.agentSafeNext.id, 'write-proof');
    assert.equal(next.agentSafeNext.mayRunUnattended, true);
    assert.equal(next.agentSafeNext.opensBrowser, false);
    assert.equal(next.agentSafeNext.startsCapture, false);
    assert.match(next.nextAction.command.shell, /target-proof/);
    assert.equal(JSON.stringify(next).includes('Alpha'), false);
    assert.match(formatTargetProofNextMarkdown(next), /Target Proof Next Action/);
    assert.match(formatTargetProofNextMarkdown(next), /write-proof/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof next returns login after a failed login-like auth check', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-next-login-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const pack = scaffoldTargetPack(policy, {
      name: 'vendor-service',
      origins: 'https://accounts.vendor-service.com,https://app.vendor-service.com',
      loginUrl: 'https://accounts.vendor-service.com/login',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const targetPolicy = loadPolicy(pack.policy);
    seedAuthenticatedProfile(targetPolicy, 'vendor-service');
    seedFailedAuthCheck(pack.dir);

    const next = await buildTargetProofNext(root, { realExternal: true });

    assert.equal(next.target.target, 'vendor-service');
    assert.equal(next.target.authState, 'metadata-only-login-like');
    assert.equal(next.nextAction.id, 'login-capture');
    assert.equal(next.nextCommandSafety.opensBrowser, true);
    assert.equal(next.nextCommandSafety.startsCapture, true);
    assert.equal(next.nextCommandSafety.requiresOperatorApproval, true);
    assert.equal(next.nextCommandSafety.agentMayRunUnattended, false);
    assert.equal(next.agentSafeNext.id, 'target-approval-preflight');
    assert.equal(next.agentSafeNext.mayRunUnattended, true);
    assert.equal(next.agentSafeNext.opensBrowser, false);
    assert.equal(next.agentSafeNext.startsCapture, false);
    assert.equal(next.agentSafeNext.blockedReason, 'operator-approval-required');
    assert.match(next.nextAction.label, /login screen/);
    assert.match(next.nextAction.command.shell, /target-login-capture/);
    assert.match(next.nextAction.command.shell, /--real-external/);
    assert.match(next.nextAction.command.shell, /--wait-auth-status-out/);
    assert.match(next.nextAction.command.shell, /wait-auth-status\.json/);
    assert.match(next.nextAction.command.shell, /markdown/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof next prefers auth-first saved handoff resume after login browser is opened', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-next-handoff-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const pack = scaffoldTargetPack(policy, {
      name: 'vendor-service',
      origins: 'https://accounts.vendor-service.com,https://app.vendor-service.com',
      loginUrl: 'https://accounts.vendor-service.com/login',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const targetPolicy = loadPolicy(pack.policy);
    seedAuthenticatedProfile(targetPolicy, 'vendor-service');
    seedFailedAuthCheck(pack.dir);
    seedOperatorHandoff(targetPolicy.outputDir, pack.dir);

    const next = await buildTargetProofNext(root, { realExternal: true });
    const plan = await buildTargetProofPlan(pack.dir, { realExternal: true });
    const markdown = formatTargetProofPlanMarkdown(plan);

    assert.equal(next.target.target, 'vendor-service');
    assert.equal(plan.currentState.operatorHandoff.exists, true);
    assert.equal(plan.currentState.operatorHandoff.hasAuthCheckPort, true);
    assert.equal(plan.currentState.operatorHandoff.authCheckPort, '45678');
    assert.equal(next.target.operatorHandoff.authCheckPort, '45678');
    assert.equal(next.target.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
    assert.equal(next.target.operatorGuidance.automationBlocker, 'auth-check-not-ok');
    assert.equal(next.target.operatorGuidance.captureBlocked, true);
    assert.equal(plan.currentState.authState, 'metadata-only-login-like');
    assert.equal(next.target.authState, 'metadata-only-login-like');
    assert.equal(next.target.authUsable, false);
    assert.equal(next.target.profileAuthMetadataOnly, true);
    assert.ok(plan.commands.some((step) => step.id === 'handoff-resume' && step.status === 'ready'));
    assert.ok(plan.commands.some((step) => step.id === 'handoff-capture' && step.status === 'ready'));
    assert.match(markdown, /Operator handoff ready: yes/);
    assert.match(markdown, /Auth state: metadata-only-login-like/);
    assert.match(markdown, /### handoff-resume/);
    assert.match(markdown, /### handoff-capture/);
    assert.equal(next.nextAction.id, 'handoff-resume');
    assert.equal(next.nextCommandSafety.opensBrowser, true);
    assert.equal(next.nextCommandSafety.startsCapture, true);
    assert.equal(next.nextCommandSafety.requiresOperatorApproval, true);
    assert.equal(next.nextCommandSafety.agentMayRunUnattended, false);
    assert.match(next.nextAction.command.shell, /target-handoff-resume/);
    assert.match(next.nextAction.command.shell, /--wait-auth/);
    assert.match(next.nextAction.command.shell, /handoff-resume-wait-auth-status\.json/);
    assert.deepEqual(
      next.target.missingArtifacts.map((item) => item.id),
      ['auth-check', 'output:observe.json', 'output:inspect.json', 'output:scrape.csv', 'benchmark', 'target-proof']
    );
    const compact = formatTargetProofNextCompact(next);
    assert.match(compact, /^complete: no/m);
    assert.match(compact, /^next: handoff-resume/m);
    assert.match(compact, /^next_command_opens_browser: yes/m);
    assert.match(compact, /^next_command_starts_capture: yes/m);
    assert.match(compact, /^next_command_requires_operator_approval: yes/m);
    assert.match(compact, /^next_command_agent_may_run_unattended: no/m);
    assert.match(compact, /^agent_safe_next_command_id: target-approval-preflight/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no/m);
    assert.match(compact, /^agent_safe_next_reads_browser_storage: no/m);
    assert.match(compact, /^agent_safe_next_returns_page_content: no/m);
    assert.match(compact, /^agent_safe_next_blocked_reason: operator-approval-required/m);
    assert.match(compact, /^target: vendor-service/m);
    assert.match(compact, /^human_action: complete-login-in-open-dedicated-browser/m);
    assert.match(compact, /^automation_blocker: auth-check-not-ok/m);
    assert.match(compact, /^capture_blocked: yes/m);
    assert.match(compact, /^auth_check_ok: no/m);
    assert.match(compact, /^auth_state: metadata-only-login-like/m);
    assert.match(compact, /^auth_usable: no/m);
    assert.match(compact, /^profile_auth_metadata_only: yes/m);
    assert.match(compact, /^missing_artifact_count: 6$/m);
    assert.match(compact, /^missing_artifacts: auth-check,output:observe\.json,output:inspect\.json,output:scrape\.csv,benchmark,target-proof$/m);
    assert.match(compact, /^missing_output_files: observe\.json,inspect\.json,scrape\.csv$/m);
    assert.match(compact, /^secret_values_read: no/m);
    assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'vendor-service' '--real-external' '--format' 'compact'$/m);
    assert.equal(next.startCommandCandidates.every((item) => item.safety && typeof item.safety.requiresOperatorApproval === 'boolean'), true);
    assert.equal(next.startCommandCandidates.find((item) => item.id === 'workflow-scrape').safety.agentMayRunUnattended, true);
    assert.equal(next.startCommandCandidates.find((item) => item.id === 'target-approval-resume').safety.requiresOperatorApproval, false);
    assert.match(compact, /^start_commands: regular-chrome-use,chrome-mcp-observation-status,chrome-mcp-timeout-plan-status,chrome-mcp-autostart-plan,chrome-mcp-autostart-plan-status,backend-matrix-status,backend-matrix-refresh,lightpanda-doctor,playwright-doctor,selenium-doctor,workflow-search,workflow-analyze,workflow-scrape,workflow-operate,target-candidate-plan,target-candidate-plan-status,target-candidate-plan-watch,target-approval-status,target-approval-preflight,target-approval-resume,target-approval-resume-status,target-approval-resume-watch,completion-proof-bundle,completion-proof-bundle-write,completion-proof-bundle-status,completion-proof-bundle-watch,agent-proof-checklist,agent-proof-checklist-write,agent-proof-checklist-status,agent-proof-closeout,agent-proof-closeout-write,agent-proof-closeout-status,secret-run-select,secret-env-handoff,secret-env-handoff-status,secret-env-handoff-watch$/m);
    assert.match(compact, /^start_command_requires_operator_approval_count: 0$/m);
    assert.match(compact, /^start_command_agent_may_run_unattended_count: 36$/m);
    assert.match(compact, /^start_operator_approval_required: none$/m);
    assert.match(compact, /^start_regular_chrome_use_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect' '--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_chrome_mcp_observation_status_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-observation-status' '--format' 'compact'$/m);
    assert.match(compact, /^start_chrome_mcp_timeout_plan_status_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan-status' '--format' 'compact'$/m);
    assert.match(compact, /^start_chrome_mcp_autostart_plan_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-autostart-plan' '--write' '--out' 'operator\/chrome-mcp-autostart-plan-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_chrome_mcp_autostart_plan_status_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-autostart-plan-status' '--in' 'operator\/chrome-mcp-autostart-plan-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_backend_matrix_status_command: 'node' 'src\/cli\.mjs' 'backend-matrix-status' '--in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_backend_matrix_refresh_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--write' '--out' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_lightpanda_doctor_command: 'node' 'src\/cli\.mjs' 'lightpanda-doctor' '--format' 'compact'$/m);
    assert.match(compact, /^start_playwright_doctor_command: 'node' 'src\/cli\.mjs' 'playwright-doctor' '--format' 'compact'$/m);
    assert.match(compact, /^start_selenium_doctor_command: 'node' 'src\/cli\.mjs' 'selenium-doctor' '--format' 'compact'$/m);
    assert.match(compact, /^start_workflow_search_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'search' '--query' '<query>' '--format' 'compact'$/m);
    assert.match(compact, /^start_workflow_analyze_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'analyze' '--format' 'compact'$/m);
    assert.match(compact, /^start_workflow_scrape_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'scrape' '--format' 'compact'$/m);
    assert.match(compact, /^start_workflow_operate_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'operate' '--format' 'compact'$/m);
    assert.match(compact, /^start_target_candidate_plan_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan' '--format' 'compact'$/m);
    assert.match(compact, /^start_target_candidate_plan_status_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan-status' '--in' 'operator\/target-candidate-plan-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_target_candidate_plan_watch_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan-watch' '--run' '--in' 'operator\/target-candidate-plan-latest\.json' '--out' 'operator\/target-candidate-plan-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_target_approval_status_command: 'node' 'src\/cli\.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^start_target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^start_target_approval_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^start_target_approval_resume_status_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-status' '--in' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_target_approval_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator\/target-approval-resume-latest\.json' '--out' 'operator\/target-approval-resume-latest\.json' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^start_completion_proof_bundle_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'$/m);
    assert.match(compact, /^start_completion_proof_bundle_write_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status' '--in' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_agent_proof_checklist_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--format' 'compact'$/m);
    assert.match(compact, /^start_agent_proof_checklist_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_agent_proof_checklist_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist-status' '--in' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_agent_proof_closeout_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'$/m);
    assert.match(compact, /^start_agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--include-compact-command-audit' '--format' 'compact'$/m);
    assert.match(compact, /^start_agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_secret_run_select_command: 'node' 'src\/cli\.mjs' 'secret-run-select' '--command' 'target-login-capture' '--target-dir' 'runs\/target-packs\/vendor-service' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /\/runs\/target-packs\/vendor-service/);
    assert.match(compact, /^start_secret_env_handoff_command: 'node' 'src\/cli\.mjs' 'secret-env-handoff' '--format' 'compact'$/m);
    assert.match(compact, /^start_secret_env_handoff_status_command: 'node' 'src\/cli\.mjs' 'secret-env-handoff-status' '--in' 'operator\/secret-env-handoff\.json' '--format' 'compact'$/m);
    assert.match(compact, /^start_secret_env_handoff_watch_command: 'node' 'src\/cli\.mjs' 'secret-env-handoff-watch' '--run' '--in' 'operator\/secret-env-handoff\.json' '--out' 'operator\/secret-env-handoff\.json' '--format' 'compact'$/m);
    const nextMarkdown = formatTargetProofNextMarkdown(next);
    assert.match(nextMarkdown, /Operator Guidance/);
    assert.match(nextMarkdown, /Auth state: metadata-only-login-like/);
    assert.match(nextMarkdown, /Human action: complete-login-in-open-dedicated-browser/);
    assert.match(nextMarkdown, /Automation blocker: auth-check-not-ok/);
    assert.match(nextMarkdown, /Capture blocked: yes/);
    assert.match(nextMarkdown, /Start Command Candidates/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof inventory is complete when an accepted external proof exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-inventory-complete-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const pack = scaffoldTargetPack(policy, {
      name: 'vendor-ready',
      origins: 'https://app.vendor-service.com',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const targetPolicy = loadPolicy(pack.policy);
    seedAuthenticatedProfile(targetPolicy, 'vendor-ready');
    seedOutputs(targetPolicy.outputDir);
    seedBenchmark(pack.dir);
    seedAuthCheck(pack.dir);
    await buildTargetProof(pack.dir, { realExternal: true, write: true });

    const inventory = await buildTargetProofInventory(root, { realExternal: true });

    assert.equal(inventory.complete, true);
    assert.equal(inventory.summary.acceptedExternalProofs, 1);
    assert.equal(inventory.acceptedExternalProofs[0].target, 'vendor-ready');
    assert.match(formatTargetProofInventoryMarkdown(inventory), /Complete: yes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target proof next reports completion when an accepted external proof exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-proof-next-complete-'));
  try {
    const policy = loadPolicy(writeFixturePolicy(root));
    const pack = scaffoldTargetPack(policy, {
      name: 'vendor-ready',
      origins: 'https://app.vendor-service.com',
      pageUrl: 'https://app.vendor-service.com/dashboard',
      force: true
    });
    const targetPolicy = loadPolicy(pack.policy);
    seedAuthenticatedProfile(targetPolicy, 'vendor-ready');
    seedOutputs(targetPolicy.outputDir);
    seedBenchmark(pack.dir);
    seedAuthCheck(pack.dir);
    await buildTargetProof(pack.dir, { realExternal: true, write: true });

    const next = await buildTargetProofNext(root, { realExternal: true });

    assert.equal(next.complete, true);
    assert.equal(next.target, null);
    assert.equal(next.nextAction.id, 'complete');
    assert.equal(next.nextCommandSafety.requiresOperatorApproval, false);
    assert.equal(next.nextCommandSafety.agentMayRunUnattended, false);
    assert.match(formatTargetProofNextMarkdown(next), /Complete: yes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
