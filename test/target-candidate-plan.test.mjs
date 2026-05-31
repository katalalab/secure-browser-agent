import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTargetCandidatePlan, buildTargetCandidatePlanStatus, buildTargetCandidatePlanWatch, formatTargetCandidatePlanCompact, formatTargetCandidatePlanMarkdown, formatTargetCandidatePlanStatusCompact, formatTargetCandidatePlanWatchCompact, writeTargetCandidatePlan } from '../src/target-candidate-plan.mjs';
import { buildTargetApprovalPack, buildTargetApprovalPreflight, buildTargetApprovalResume, buildTargetApprovalResumeStatus, buildTargetApprovalResumeWatch, buildTargetApprovalStatus, formatTargetApprovalPackCompact, formatTargetApprovalPreflightCompact, formatTargetApprovalResumeCompact, formatTargetApprovalResumeStatusCompact, formatTargetApprovalResumeWatchCompact, formatTargetApprovalStatusCompact, writeTargetApprovalPack } from '../src/target-approval-pack.mjs';

test('target candidate plan lists real external bootstrap commands', () => {
  const plan = buildTargetCandidatePlan({
    generatedAt: '2026-05-28T00:00:00.000Z'
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.writesLocalState, false);
  assert.equal(plan.recommendedCandidate, 'github');
  assert.ok(plan.candidates.length >= 3);
  const github = plan.candidates.find((candidate) => candidate.id === 'github');
  assert.equal(github.realExternal, true);
  assert.deepEqual(github.origins, ['https://github.com']);
  assert.match(github.bootstrapPlanCommand.shell, /target-bootstrap-plan/);
  assert.match(github.bootstrapPlanCompactCommand.shell, /--format' 'compact/);
  assert.match(github.bootstrapPlanCommand.shell, /github/);
  const compact = formatTargetCandidatePlanCompact(plan);
  assert.match(compact, /^recommended_candidate: github$/m);
  assert.match(compact, /^recommended_bootstrap_plan_command: 'node' 'src\/cli\.mjs' 'target-bootstrap-plan'/m);
  assert.match(compact, /^candidate_github_bootstrap_plan_command: 'node' 'src\/cli\.mjs' 'target-bootstrap-plan'/m);
  assert.match(formatTargetCandidatePlanMarkdown(plan), /GitHub/);
});

test('target candidate plan can focus one candidate', () => {
  const plan = buildTargetCandidatePlan({ candidate: 'notion' });
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].id, 'notion');
  assert.match(plan.candidates[0].bootstrapPlanCommand.shell, /notion/);
});

test('target candidate plan reports saved target-pack proof readiness without browser work', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-candidate-readiness-'));
  try {
    const targetDir = path.join(rootDir, 'runs/target-packs/github');
    fs.mkdirSync(path.join(targetDir, 'proof'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'target.json'), '{"name":"github"}\n', 'utf8');
    fs.writeFileSync(path.join(targetDir, 'policy.json'), '{"allowedOrigins":["https://github.com"]}\n', 'utf8');
    fs.writeFileSync(path.join(targetDir, 'proof/auth-check.json'), '{"ok":false,"loginLike":true}\n', 'utf8');

    const plan = buildTargetCandidatePlan({
      rootDir,
      candidate: 'github',
      generatedAt: '2026-05-31T00:00:00.000Z'
    });
    const github = plan.candidates[0];
    assert.equal(github.readiness.targetPackExists, true);
    assert.equal(github.readiness.metadataOk, true);
    assert.equal(github.readiness.authCheckExists, true);
    assert.equal(github.readiness.authCheckOk, false);
    assert.equal(github.readiness.authCheckLoginLike, true);
    assert.equal(github.readiness.benchmarkExists, false);
    assert.equal(github.readiness.proofReady, false);
    assert.equal(github.readiness.nextAction, 'operator-login-and-auth-check');

    const compact = formatTargetCandidatePlanCompact(plan);
    assert.match(compact, /^candidate_github_target_pack_exists: yes$/m);
    assert.match(compact, /^candidate_github_metadata_ok: yes$/m);
    assert.match(compact, /^candidate_github_auth_check_login_like: true$/m);
    assert.match(compact, /^candidate_github_next_action: operator-login-and-auth-check$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('target candidate plan rejects unknown candidates', () => {
  assert.throws(() => buildTargetCandidatePlan({ candidate: 'missing' }), /unknown target candidate/);
});

test('target candidate plan status reads saved plan without browser work', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-candidate-status-'));
  try {
    const plan = buildTargetCandidatePlan({
      rootDir,
      candidate: 'github',
      generatedAt: '2026-05-31T00:00:00.000Z'
    });
    writeTargetCandidatePlan(rootDir, plan, 'operator/candidates.json');
    const status = buildTargetCandidatePlanStatus({
      rootDir,
      in: 'operator/candidates.json'
    });
    assert.equal(status.safeMode, true);
    assert.equal(status.statusOnly, true);
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.opensBrowserNow, false);
    assert.equal(status.startsCaptureNow, false);
    assert.equal(status.readsBrowserStorage, false);
    assert.equal(status.exists, true);
    assert.equal(status.parseOk, true);
    assert.equal(status.recommendedCandidate, 'github');
    assert.deepEqual(status.candidateIds, ['github']);
    assert.equal(status.candidateReadiness[0].nextAction, 'scaffold-target-pack');
    const compact = formatTargetCandidatePlanStatusCompact(status);
    assert.match(compact, /^recommended_candidate: github$/m);
    assert.match(compact, /^candidate_readiness: github:scaffold-target-pack$/m);
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan-watch'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('target candidate plan watch refreshes missing saved plan only when run is requested', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-candidate-watch-'));
  try {
    const planned = buildTargetCandidatePlanWatch({ rootDir });
    assert.equal(planned.executed, false);
    assert.equal(planned.status, 'refresh-required');
    assert.equal(planned.blockedReason, 'run-not-requested');
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/target-candidate-plan-latest.json')), false);

    const refreshed = buildTargetCandidatePlanWatch({ rootDir, run: true, candidate: 'notion' });
    assert.equal(refreshed.executed, true);
    assert.equal(refreshed.status, 'refreshed');
    assert.equal(refreshed.secretValuesRead, false);
    assert.equal(refreshed.opensBrowserNow, false);
    assert.equal(refreshed.afterRecommendedCandidate, 'notion');
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/target-candidate-plan-latest.json')), true);
    assert.match(formatTargetCandidatePlanWatchCompact(refreshed), /^after_stale: no$/m);

    const fresh = buildTargetCandidatePlanWatch({ rootDir, run: true, candidate: 'notion' });
    assert.equal(fresh.executed, false);
    assert.equal(fresh.blockedReason, 'saved-target-candidate-plan-is-fresh');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('target candidate plan status and watch reject paths outside runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-target-candidate-path-'));
  try {
    assert.throws(
      () => buildTargetCandidatePlanStatus({ rootDir, in: '../candidate.json' }),
      /invalid target candidate plan output path/
    );
    assert.throws(
      () => buildTargetCandidatePlanWatch({ rootDir, out: '../candidate.json', run: true }),
      /invalid target candidate plan output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('target approval pack packages the recommended candidate without opening browser work', () => {
  const pack = buildTargetApprovalPack({
    candidate: 'github',
    generatedAt: '2026-05-31T00:00:00.000Z',
    rootDir: '/tmp/sba'
  });

  assert.equal(pack.safeMode, true);
  assert.equal(pack.statusOnly, true);
  assert.equal(pack.opensBrowserNow, false);
  assert.equal(pack.startsCaptureNow, false);
  assert.equal(pack.secretValuesRead, false);
  assert.equal(pack.selectedCandidate, 'github');
  assert.equal(pack.operatorApproval.required, true);
  assert.equal(pack.operatorApprovalSummaryScope, 'create-target-pack-and-login-to-real-external-service-in-dedicated-profile');
  assert.equal(pack.operatorApprovalSummaryRequiresOperatorOk, true);
  assert.equal(pack.operatorApprovalSummaryOperatorOkAccepted, false);
  assert.equal(pack.operatorApprovalSummaryMayOpenBrowser, true);
  assert.equal(pack.operatorApprovalSummaryMayStartCapture, true);
  assert.equal(pack.operatorApprovalSummaryReadsBrowserStorage, false);
  assert.equal(pack.operatorApprovalSummaryReturnsPageContent, false);
  assert.equal(pack.operatorApprovalSummaryAgentMustNotRunUnattended, true);
  assert.equal(pack.bootstrap.ready, true);
  assert.match(pack.bootstrap.commands.scaffold.shell, /scaffold-target/);
  assert.match(pack.bootstrap.commands.loginCapture.shell, /target-login-capture/);

  const compact = formatTargetApprovalPackCompact(pack);
  assert.match(compact, /^operator_approval_required: yes$/m);
  assert.match(compact, /^operator_approval_summary_scope: create-target-pack-and-login-to-real-external-service-in-dedicated-profile$/m);
  assert.match(compact, /^operator_approval_summary_requires_operator_ok: yes$/m);
  assert.match(compact, /^operator_approval_summary_operator_ok_accepted: no$/m);
  assert.match(compact, /^operator_approval_summary_may_open_browser: yes$/m);
  assert.match(compact, /^operator_approval_summary_may_start_capture: yes$/m);
  assert.match(compact, /^operator_approval_summary_reads_browser_storage: no$/m);
  assert.match(compact, /^operator_approval_summary_returns_page_content: no$/m);
  assert.match(compact, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^selected_candidate: github$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^scaffold_command: 'node' 'src\/cli\.mjs' 'scaffold-target'/m);
  assert.match(compact, /^login_capture_command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
});

test('target approval status reads saved approval without browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-approval-status-'));
  const pack = buildTargetApprovalPack({
    candidate: 'github',
    generatedAt: '2026-05-31T00:00:00.000Z',
    rootDir
  });
  const outputPath = writeTargetApprovalPack(rootDir, pack, 'operator/target-approval-github.json');

  const status = await buildTargetApprovalStatus({
    candidate: 'github',
    rootDir,
    in: outputPath,
    generatedAt: '2026-05-31T00:00:01.000Z'
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.statusOnly, true);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.opensBrowserNow, false);
  assert.equal(status.startsCaptureNow, false);
  assert.equal(status.readsBrowserStorage, false);
  assert.equal(status.approvalPackExists, true);
  assert.equal(status.approvalPackParseOk, true);
  assert.equal(status.selectedCandidate, 'github');
  assert.equal(status.targetPackExists, false);
  assert.equal(status.nextAction.id, 'scaffold-target');
  assert.match(status.nextAction.command.shell, /scaffold-target/);
  assert.equal(status.nextCommandOpensBrowser, false);
  assert.equal(status.nextCommandStartsCapture, false);
  assert.equal(status.nextCommandRequiresOperatorApproval, true);
  assert.equal(status.nextCommandAgentMayRunUnattended, false);
  assert.equal(status.agentSafeCommandId, 'none');
  assert.equal(status.agentMayRunUnattended, false);
  assert.equal(status.agentSafeCommand, null);
  assert.equal(status.agentSafeNextCommandId, 'target-approval-preflight');
  assert.equal(status.agentSafeNextMayRunUnattended, true);
  assert.equal(status.agentSafeNextOpensBrowser, false);
  assert.equal(status.agentSafeNextStartsCapture, false);
  assert.equal(status.agentSafeNextReadsBrowserStorage, false);
  assert.equal(status.agentSafeNextReturnsPageContent, false);
  assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(status.operatorCommandId, 'scaffold-target');
  assert.equal(status.operatorApprovalRequired, true);
  assert.equal(status.operatorCommandOpensBrowser, false);
  assert.equal(status.operatorCommandStartsCapture, false);
  assert.equal(status.operatorCommandAgentMayRunUnattended, false);
  assert.equal(status.operatorApprovalSummaryScope, 'create-target-pack-and-login-to-real-external-service-in-dedicated-profile');
  assert.equal(status.operatorApprovalSummaryRequiresOperatorOk, true);
  assert.equal(status.operatorApprovalSummaryOperatorOkAccepted, false);
  assert.equal(status.operatorApprovalSummaryMayOpenBrowser, true);
  assert.equal(status.operatorApprovalSummaryMayStartCapture, true);
  assert.equal(status.operatorApprovalSummaryReadsBrowserStorage, false);
  assert.equal(status.operatorApprovalSummaryReturnsPageContent, false);
  assert.equal(status.operatorApprovalSummaryAgentMustNotRunUnattended, true);
  assert.equal(status.commands.agentPreflight.shell, "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(status.commands.approvalPreflight.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");

  const compact = formatTargetApprovalStatusCompact(status);
  assert.match(compact, /^approval_pack_exists: yes$/m);
  assert.match(compact, /^target_pack_exists: no$/m);
  assert.match(compact, /^target_next: scaffold-target$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^next_command_opens_browser: no$/m);
  assert.match(compact, /^next_command_starts_capture: no$/m);
  assert.match(compact, /^next_command_requires_operator_approval: yes$/m);
  assert.match(compact, /^next_command_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_safe_command_id: none$/m);
  assert.match(compact, /^agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^operator_command_id: scaffold-target$/m);
  assert.match(compact, /^operator_approval_required: yes$/m);
  assert.match(compact, /^operator_command_opens_browser: no$/m);
  assert.match(compact, /^operator_command_starts_capture: no$/m);
  assert.match(compact, /^operator_command_agent_may_run_unattended: no$/m);
  assert.match(compact, /^operator_approval_summary_scope: create-target-pack-and-login-to-real-external-service-in-dedicated-profile$/m);
  assert.match(compact, /^operator_approval_summary_requires_operator_ok: yes$/m);
  assert.match(compact, /^operator_approval_summary_operator_ok_accepted: no$/m);
  assert.match(compact, /^operator_approval_summary_may_open_browser: yes$/m);
  assert.match(compact, /^operator_approval_summary_may_start_capture: yes$/m);
  assert.match(compact, /^operator_approval_summary_reads_browser_storage: no$/m);
  assert.match(compact, /^operator_approval_summary_returns_page_content: no$/m);
  assert.match(compact, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^agent_safe_command: /m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^next_command: 'node' 'src\/cli\.mjs' 'scaffold-target'/m);
  assert.match(compact, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^wait_auth_proof_capture_command: 'node' 'src\/cli\.mjs' 'target-proof-capture' 'runs\/target-packs\/github' '--real-external' '--run' '--wait-auth'/m);
  assert.match(compact, /^wait_auth_proof_capture_command: .*'--completion-audit' '--format' 'compact'$/m);
  assert.match(compact, /^approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.equal(status.commands.approvalResumeRun.args.includes('--operator-ok'), true);
});

test('target approval resume plans the next command without running browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-approval-resume-plan-'));
  const pack = buildTargetApprovalPack({
    candidate: 'github',
    generatedAt: '2026-05-31T00:00:00.000Z',
    rootDir
  });
  writeTargetApprovalPack(rootDir, pack, 'operator/target-approval-github.json');

  const resume = await buildTargetApprovalResume({
    candidate: 'github',
    rootDir,
    generatedAt: '2026-05-31T00:00:01.000Z'
  });

  assert.equal(resume.safeMode, true);
  assert.equal(resume.runRequested, false);
  assert.equal(resume.operatorOkRequired, true);
  assert.equal(resume.operatorOkAccepted, false);
  assert.equal(resume.status, 'planned');
  assert.equal(resume.readyToRun, true);
  assert.equal(resume.opensBrowserNow, false);
  assert.equal(resume.startsCaptureNow, false);
  assert.equal(resume.plannedCommandOpensBrowser, false);
  assert.equal(resume.plannedCommandStartsCapture, false);
  assert.equal(resume.operatorApprovalSummaryScope, 'real-external-auth-target-proof');
  assert.equal(resume.operatorApprovalSummaryRequiresOperatorOk, true);
  assert.equal(resume.operatorApprovalSummaryOperatorOkAccepted, false);
  assert.equal(resume.operatorApprovalSummaryMayOpenBrowser, false);
  assert.equal(resume.operatorApprovalSummaryMayStartCapture, false);
  assert.equal(resume.operatorApprovalSummaryReadsBrowserStorage, false);
  assert.equal(resume.operatorApprovalSummaryReturnsPageContent, false);
  assert.equal(resume.operatorApprovalSummaryAgentMustNotRunUnattended, true);
  assert.equal(resume.agentSafeNextCommandId, 'target-approval-preflight');
  assert.equal(resume.agentSafeNextMayRunUnattended, true);
  assert.equal(resume.agentSafeNextOpensBrowser, false);
  assert.equal(resume.agentSafeNextStartsCapture, false);
  assert.equal(resume.agentSafeNextReadsBrowserStorage, false);
  assert.equal(resume.agentSafeNextReturnsPageContent, false);
  assert.equal(resume.agentSafeNextBlockedReason, 'operator-approval-required');
  assert.equal(resume.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(resume.targetNext, 'scaffold-target');
  assert.match(resume.command.shell, /scaffold-target/);
  assert.equal(resume.preflightCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(resume.proofPlanCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");

  const compact = formatTargetApprovalResumeCompact(resume);
  assert.match(compact, /^run_requested: no$/m);
  assert.match(compact, /^operator_ok_required: yes$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^planned_command_opens_browser: no$/m);
  assert.match(compact, /^operator_approval_summary_scope: real-external-auth-target-proof$/m);
  assert.match(compact, /^operator_approval_summary_requires_operator_ok: yes$/m);
  assert.match(compact, /^operator_approval_summary_operator_ok_accepted: no$/m);
  assert.match(compact, /^operator_approval_summary_may_open_browser: no$/m);
  assert.match(compact, /^operator_approval_summary_may_start_capture: no$/m);
  assert.match(compact, /^operator_approval_summary_reads_browser_storage: no$/m);
  assert.match(compact, /^operator_approval_summary_returns_page_content: no$/m);
  assert.match(compact, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_blocked_reason: operator-approval-required$/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'scaffold-target'/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
});

test('target approval resume status reads saved plan without browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-approval-resume-status-'));
  try {
    const pack = buildTargetApprovalPack({ candidate: 'github', rootDir });
    writeTargetApprovalPack(rootDir, pack, 'operator/target-approval-github.json');
    await buildTargetApprovalResume({
      candidate: 'github',
      rootDir,
      realExternal: true,
      write: true,
      out: 'operator/resume.json',
      generatedAt: '2026-05-31T00:00:01.000Z'
    });

    const status = buildTargetApprovalResumeStatus({
      rootDir,
      in: 'operator/resume.json',
      nowMs: Date.now()
    });
    assert.equal(status.safeMode, true);
    assert.equal(status.statusOnly, true);
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.opensBrowserNow, false);
    assert.equal(status.startsCaptureNow, false);
    assert.equal(status.readsBrowserStorage, false);
    assert.equal(status.exists, true);
    assert.equal(status.parseOk, true);
    assert.equal(status.selectedCandidate, 'github');
    assert.equal(status.savedStatus, 'planned');
    assert.equal(status.operatorApprovalSummaryScope, 'real-external-auth-target-proof');
    assert.equal(status.operatorApprovalSummaryRequiresOperatorOk, true);
    assert.equal(status.operatorApprovalSummaryOperatorOkAccepted, false);
    assert.equal(status.operatorApprovalSummaryMayOpenBrowser, false);
    assert.equal(status.operatorApprovalSummaryMayStartCapture, false);
    assert.equal(status.operatorApprovalSummaryReadsBrowserStorage, false);
    assert.equal(status.operatorApprovalSummaryReturnsPageContent, false);
    assert.equal(status.operatorApprovalSummaryAgentMustNotRunUnattended, true);
    assert.equal(status.agentSafeNextCommandId, 'target-proof-plan');
    assert.equal(status.agentSafeNextMayRunUnattended, true);
    assert.equal(status.agentSafeNextOpensBrowser, false);
    assert.equal(status.agentSafeNextStartsCapture, false);
    assert.equal(status.agentSafeNextReadsBrowserStorage, false);
    assert.equal(status.agentSafeNextReturnsPageContent, false);
    assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");
    assert.equal(status.proofPlanCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");
    assert.equal(status.completionProofBundleWithAuditCommand.shell, "'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator/completion-proof-bundle-latest.json' '--format' 'compact'");
    assert.equal(status.agentProofCloseoutWriteCommand.shell, "'node' 'src/cli.mjs' 'agent-proof-closeout' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator/agent-proof-closeout-latest.json' '--format' 'compact'");
    assert.equal(status.agentProofCloseoutStatusCommand.shell, "'node' 'src/cli.mjs' 'agent-proof-closeout-status' '--in' 'operator/agent-proof-closeout-latest.json' '--format' 'compact'");
    assert.equal(status.objectiveCompletionStrictCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");

    const compact = formatTargetApprovalResumeStatusCompact(status);
    assert.match(compact, /^saved_status: planned$/m);
    assert.match(compact, /^opens_browser_now: no$/m);
    assert.match(compact, /^operator_approval_summary_scope: real-external-auth-target-proof$/m);
    assert.match(compact, /^operator_approval_summary_requires_operator_ok: yes$/m);
    assert.match(compact, /^operator_approval_summary_operator_ok_accepted: no$/m);
    assert.match(compact, /^operator_approval_summary_may_open_browser: no$/m);
    assert.match(compact, /^operator_approval_summary_may_start_capture: no$/m);
    assert.match(compact, /^operator_approval_summary_reads_browser_storage: no$/m);
    assert.match(compact, /^operator_approval_summary_returns_page_content: no$/m);
    assert.match(compact, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
    assert.match(compact, /^starts_capture_now: no$/m);
    assert.match(compact, /^agent_safe_next_command_id: target-proof-plan$/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch'/m);
    assert.match(compact, /^proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
    assert.match(compact, /^completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('target approval resume watch refreshes only the non-running plan', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-approval-resume-watch-'));
  try {
    const pack = buildTargetApprovalPack({ candidate: 'github', rootDir });
    writeTargetApprovalPack(rootDir, pack, 'operator/target-approval-github.json');
    const planned = await buildTargetApprovalResumeWatch({ rootDir, candidate: 'github', realExternal: true });
    assert.equal(planned.executed, false);
    assert.equal(planned.status, 'refresh-required');
    assert.equal(planned.blockedReason, 'run-not-requested');
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/target-approval-resume-latest.json')), false);

    const refreshed = await buildTargetApprovalResumeWatch({ rootDir, candidate: 'github', realExternal: true, run: true });
    assert.equal(refreshed.executed, true);
    assert.equal(refreshed.status, 'refreshed');
    assert.equal(refreshed.secretValuesRead, false);
    assert.equal(refreshed.opensBrowserNow, false);
    assert.equal(refreshed.startsCaptureNow, false);
    assert.equal(refreshed.afterSavedStatus, 'planned');
    assert.equal(refreshed.afterPlannedCommandOpensBrowser, false);
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/target-approval-resume-latest.json')), true);
    assert.match(formatTargetApprovalResumeWatchCompact(refreshed), /^after_saved_status: planned$/m);

    const fresh = await buildTargetApprovalResumeWatch({ rootDir, candidate: 'github', realExternal: true, run: true });
    assert.equal(fresh.executed, false);
    assert.equal(fresh.blockedReason, 'saved-target-approval-resume-is-fresh');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('target approval resume status and watch reject paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-approval-resume-path-'));
  try {
    assert.throws(
      () => buildTargetApprovalResumeStatus({ rootDir, in: '../resume.json' }),
      /invalid target approval pack output path/
    );
    await assert.rejects(
      () => buildTargetApprovalResumeWatch({ rootDir, out: '../resume.json', run: true }),
      /invalid target approval pack output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('target approval preflight forces real-external inventory and separates operator command from agent-safe command', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-approval-preflight-'));
  const pack = buildTargetApprovalPack({
    candidate: 'github',
    generatedAt: '2026-05-31T00:00:00.000Z',
    rootDir
  });
  writeTargetApprovalPack(rootDir, pack, 'operator/target-approval-github.json');

  const preflight = await buildTargetApprovalPreflight({
    candidate: 'github',
    rootDir,
    generatedAt: '2026-05-31T00:00:01.000Z'
  });

  assert.equal(preflight.safeMode, true);
  assert.equal(preflight.statusOnly, true);
  assert.equal(preflight.realExternalRequired, true);
  assert.equal(preflight.realExternalInventory, true);
  assert.equal(preflight.defaultInventoryRealExternal, false);
  assert.equal(preflight.defaultModeWouldChangeNext, true);
  assert.equal(preflight.defaultModeNextAction, 'scaffold-target');
  assert.equal(preflight.nextAction, 'scaffold-target');
  assert.equal(preflight.agentSafeCommandId, 'none');
  assert.equal(preflight.agentMayRunUnattended, false);
  assert.equal(preflight.agentSafeNextCommandId, 'target-proof-plan');
  assert.equal(preflight.agentSafeNextMayRunUnattended, true);
  assert.equal(preflight.agentSafeNextOpensBrowser, false);
  assert.equal(preflight.agentSafeNextStartsCapture, false);
  assert.equal(preflight.agentSafeNextReadsBrowserStorage, false);
  assert.equal(preflight.agentSafeNextReturnsPageContent, false);
  assert.equal(preflight.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");
  assert.equal(preflight.operatorApprovalRequired, true);
  assert.equal(preflight.operatorApprovalSummaryScope, 'real-external-auth-target-proof');
  assert.equal(preflight.operatorApprovalSummaryRequiresOperatorOk, true);
  assert.equal(preflight.operatorApprovalSummaryOperatorOkAccepted, false);
  assert.equal(preflight.operatorApprovalSummaryMayOpenBrowser, false);
  assert.equal(preflight.operatorApprovalSummaryMayStartCapture, false);
  assert.equal(preflight.operatorApprovalSummaryReadsBrowserStorage, false);
  assert.equal(preflight.operatorApprovalSummaryReturnsPageContent, false);
  assert.equal(preflight.operatorApprovalSummaryAgentMustNotRunUnattended, true);
  assert.equal(preflight.agentPreflightCommand.shell, "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(preflight.objectiveCompletionStrictCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");
  assert.match(preflight.operatorCommand.shell, /target-approval-resume/);
  assert.match(preflight.operatorCommand.shell, /'--real-external'/);
  assert.match(preflight.operatorCommand.shell, /'--operator-ok' 'OK'/);

  const compact = formatTargetApprovalPreflightCompact(preflight);
  assert.match(compact, /^real_external_required: yes$/m);
  assert.match(compact, /^real_external_inventory: yes$/m);
  assert.match(compact, /^default_inventory_real_external: no$/m);
  assert.match(compact, /^default_mode_would_change_next: yes$/m);
  assert.match(compact, /^agent_safe_command_id: none$/m);
  assert.match(compact, /^agent_safe_next_command_id: target-proof-plan$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /^agent_safe_command: /m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^operator_command_opens_browser: no$/m);
  assert.match(compact, /^operator_command_starts_capture: no$/m);
  assert.match(compact, /^operator_command_agent_may_run_unattended: no$/m);
  assert.match(compact, /^operator_approval_summary_scope: real-external-auth-target-proof$/m);
  assert.match(compact, /^operator_approval_summary_requires_operator_ok: yes$/m);
  assert.match(compact, /^operator_approval_summary_operator_ok_accepted: no$/m);
  assert.match(compact, /^operator_approval_summary_may_open_browser: no$/m);
  assert.match(compact, /^operator_approval_summary_may_start_capture: no$/m);
  assert.match(compact, /^operator_approval_summary_reads_browser_storage: no$/m);
  assert.match(compact, /^operator_approval_summary_returns_page_content: no$/m);
  assert.match(compact, /^operator_approval_summary_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^operator_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^approval_status_command: 'node' 'src\/cli\.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
});

test('target approval preflight exposes operator resume browser and capture risk flags', async () => {
  const runCommand = {
    args: ['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', 'github', '--real-external', '--run', '--operator-ok', 'OK', '--format', 'compact'],
    shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
  };
  const resumePlanCommand = {
    args: ['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', 'github', '--real-external', '--format', 'compact'],
    shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'"
  };
  const realExternalStatus = {
    inventory: { complete: false, realExternal: true, summary: { acceptedExternalProofs: 0 } },
    nextAction: { id: 'handoff-resume' },
    targetDir: 'runs/target-packs/github',
    targetPackExists: true,
    approvalPackExists: true,
    approvalPackParseOk: true,
    target: {
      authState: 'metadata-only-login-like',
      authUsable: false,
      operatorGuidance: {
        captureBlocked: true,
        humanAction: 'complete-login-in-open-dedicated-browser',
        automationBlocker: 'auth-check-not-ok'
      },
      missingArtifacts: [{ id: 'auth-check' }]
    },
    nextCommandOpensBrowser: true,
    nextCommandStartsCapture: true,
    nextCommandRequiresOperatorApproval: true,
    nextCommandAgentMayRunUnattended: false,
    commands: {
      approvalResumePlan: resumePlanCommand,
      approvalResumeRun: runCommand
    }
  };
  const preflight = await buildTargetApprovalPreflight({
    candidate: 'github',
    rootDir: process.cwd(),
    generatedAt: '2026-05-31T00:00:01.000Z',
    realExternalStatus,
    defaultStatus: realExternalStatus,
    resume: {
      plannedCommandOpensBrowser: true,
      plannedCommandStartsCapture: true
    }
  });

  assert.equal(preflight.operatorCommandOpensBrowser, true);
  assert.equal(preflight.operatorCommandStartsCapture, true);
  assert.equal(preflight.operatorCommandAgentMayRunUnattended, false);
  assert.equal(preflight.operatorApprovalSummaryMayOpenBrowser, true);
  assert.equal(preflight.operatorApprovalSummaryMayStartCapture, true);

  const compact = formatTargetApprovalPreflightCompact(preflight);
  assert.match(compact, /^operator_command_opens_browser: yes$/m);
  assert.match(compact, /^operator_command_starts_capture: yes$/m);
  assert.match(compact, /^operator_command_agent_may_run_unattended: no$/m);
  assert.match(compact, /^operator_approval_summary_may_open_browser: yes$/m);
  assert.match(compact, /^operator_approval_summary_may_start_capture: yes$/m);
  assert.match(compact, /^operator_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
});

test('target approval resume blocks run without exact operator OK', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-approval-resume-block-'));
  const pack = buildTargetApprovalPack({ candidate: 'github', rootDir });
  writeTargetApprovalPack(rootDir, pack, 'operator/target-approval-github.json');

  const resume = await buildTargetApprovalResume({
    candidate: 'github',
    rootDir,
    run: true,
    operatorOk: 'yes'
  });

  assert.equal(resume.status, 'blocked');
  assert.equal(resume.readyToRun, false);
  assert.deepEqual(resume.blockers, ['operator-ok-required']);
  assert.equal(resume.operatorApprovalSummaryOperatorOkAccepted, false);
  assert.equal(resume.opensBrowserNow, false);
  assert.equal(resume.startsCaptureNow, false);
});

test('target approval resume summarizes child output without echoing stdout or stderr text', async () => {
  const resume = await buildTargetApprovalResume({
    status: {
      selectedCandidate: 'github',
      targetDir: '/tmp/sba-target',
      inventory: { realExternal: true },
      nextAction: {
        id: 'target-proof-capture',
        command: {
          args: ['node', 'src/cli.mjs', 'target-proof-capture', 'runs/target-packs/github', '--run'],
          shell: "'node' 'src/cli.mjs' 'target-proof-capture' 'runs/target-packs/github' '--run'"
        }
      },
      target: {
        operatorGuidance: {
          humanAction: 'monitor-auth-then-capture',
          automationBlocker: 'none'
        }
      }
    },
    rootDir: '/tmp',
    run: true,
    operatorOk: 'OK',
    runner: () => ({
      ok: true,
      status: 0,
      stdout: 'status: complete\nsecret=should-not-echo',
      stderr: 'private stderr should not echo'
    })
  });

  assert.equal(resume.status, 'complete');
  assert.equal(resume.opensBrowserNow, false);
  assert.equal(resume.startsCaptureNow, true);
  assert.equal(resume.child.ok, true);
  assert.equal(resume.child.childStatus, 'complete');
  assert.ok(resume.child.stdoutBytes > 0);
  assert.ok(resume.child.stderrBytes > 0);

  const compact = formatTargetApprovalResumeCompact(resume);
  assert.match(compact, /^child_ok: yes$/m);
  assert.match(compact, /^child_stdout_bytes: [1-9][0-9]*$/m);
  assert.doesNotMatch(compact, /should-not-echo/);
  assert.doesNotMatch(compact, /private stderr/);
});
