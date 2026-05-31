import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAgentProofCloseout,
  buildAgentProofCloseoutStatus,
  formatAgentProofCloseoutCompact,
  formatAgentProofCloseoutStatusCompact
} from '../src/agent-proof-closeout.mjs';

test('agent proof closeout package probes keep compact command audit enabled', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

  assert.match(packageJson.scripts['probe:agent-proof-closeout'], /agent-proof-closeout --include-compact-command-audit --format compact/);
  assert.match(packageJson.scripts['probe:agent-proof-closeout-status'], /agent-proof-closeout --include-compact-command-audit --write --out operator\/agent-proof-closeout-latest\.json --format compact/);
  assert.doesNotMatch(packageJson.scripts['probe:agent-proof-closeout'], /agent-proof-closeout --format compact/);
  assert.doesNotMatch(packageJson.scripts['probe:agent-proof-closeout-status'], /agent-proof-closeout --write --out/);
});

test('agent proof closeout summarizes incomplete final proof without browser work', async () => {
  const closeout = await buildAgentProofCloseout({
    rootDir: '/tmp/sba-closeout-test',
    generatedAt: '2026-05-31T00:00:00.000Z',
    candidate: 'github',
    includeCompactCommandAudit: true,
    bundle: {
      complete: false,
      verdict: 'not-complete',
      targetDir: '/tmp/sba-closeout-test/runs/target-packs/github',
      readinessComplete: false,
      readinessRemainingCount: 1,
      readinessRemaining: ['real-external-auth-target'],
      objectiveCompletionComplete: false,
      proofGateComplete: false,
      targetApprovalComplete: false,
      targetProofReady: false,
      authState: 'metadata-only-login-like',
      authUsable: false,
      captureBlocked: true,
      automationBlocker: 'auth-check-not-ok',
      acceptedExternalProofs: 0,
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'auth-check-not-ok',
      artifactCommandCovers: ['auth-check', 'target-proof'],
      missingArtifactCount: 2,
      missingArtifacts: ['auth-check', 'target-proof'],
      operatorResumeRequiresOperatorApproval: true,
      operatorResumeOpensBrowser: true,
      operatorResumeStartsCapture: true,
      operatorResumeAgentMayRunUnattended: false,
      targetApprovalOperatorApprovalRequired: true,
      targetApprovalOperatorCommandOpensBrowser: true,
      targetApprovalOperatorCommandStartsCapture: true,
      agentSafeNextCommandId: 'agent-preflight',
      agentSafeNextMayRunUnattended: true,
      agentSafeNextOpensBrowser: false,
      agentSafeNextStartsCapture: false,
      agentSafeNextReadsBrowserStorage: false,
      agentSafeNextReturnsPageContent: false,
      targetApprovalPreflightMayRunUnattended: true,
      targetApprovalPreflightOpensBrowser: false,
      targetApprovalPreflightStartsCapture: false,
      targetApprovalPreflightReadsBrowserStorage: false,
      targetApprovalPreflightReturnsPageContent: false,
      targetProofPlanMayRunUnattended: true,
      targetProofPlanOpensBrowser: false,
      targetProofPlanStartsCapture: false,
      targetProofPlanReadsBrowserStorage: false,
      targetProofPlanReturnsPageContent: false,
      targetApprovalResumeWriteMayRunUnattended: true,
      targetApprovalResumeWriteOpensBrowser: false,
      targetApprovalResumeWriteStartsCapture: false,
      targetApprovalResumeWatchMayRunUnattended: true,
      targetApprovalResumeWatchOpensBrowser: false,
      targetApprovalResumeWatchStartsCapture: false,
      targetApprovalResumeWatchRequiresOperatorApproval: false,
      commands: {
        agentPreflight: { shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'" },
        targetApprovalPreflight: { shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'" },
        targetProofPlan: { shell: "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'" },
        targetApprovalResumeWrite: { shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator/target-approval-resume-latest.json' '--format' 'compact'" },
        targetApprovalResumeStatus: { shell: "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'" },
        targetApprovalResumeWatch: { shell: "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'" },
        operatorResume: { shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'" }
      }
    },
    checklistStatus: {
      exists: true,
      parseOk: true,
      stale: false,
      operatorApprovalRequired: true,
      operatorCommandOpensBrowser: true,
      operatorCommandStartsCapture: true
    },
    providerDoctorStatus: {
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      lightpanda: {
        readyForPublicBenchmark: false,
        benchmarkAgentMayRunUnattended: false,
        benchmarkStartsBrowser: true,
        benchmarkReadsBrowserStorage: false,
        benchmarkReturnsPageContent: false,
        benchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json'
      },
      playwright: {
        readyForPublicSmoke: true,
        readyForAuthenticatedDefault: false,
        storageStateSensitive: true,
        smokeCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'",
        publicSmokeProofExists: true,
        publicSmokeProofOk: true,
        publicSmokeProofPath: '/tmp/runs/provider-benchmarks/playwright-public-smoke.json',
        publicSmokeProofHeadingCount: 1,
        publicSmokeProofLinkCount: 1,
        smokeProofCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>' --out provider-benchmarks/playwright-public-smoke.json",
        smokeProofAgentMayRunUnattended: true,
        smokeProofStartsBrowser: true,
        smokeProofReadsBrowserStorage: false,
        smokeProofReturnsPageContent: false
      },
      selenium: {
        readyForLocalSmoke: false,
        smokeAgentMayRunUnattended: true,
        smokeStartsBrowser: false,
        smokeCommand: 'node src/cli.mjs selenium-doctor --format compact'
      }
    }
  });

  assert.equal(closeout.safeMode, true);
  assert.equal(closeout.statusOnly, true);
  assert.equal(closeout.secretValuesRead, false);
  assert.equal(closeout.opensBrowserNow, false);
  assert.equal(closeout.startsCaptureNow, false);
  assert.equal(closeout.readsBrowserStorage, false);
  assert.equal(closeout.pageContentReturned, false);
  assert.equal(closeout.complete, false);
  assert.equal(closeout.checklistExists, true);
  assert.equal(closeout.checklistParseOk, true);
  assert.equal(closeout.operatorApprovalRequired, true);
  assert.equal(closeout.operatorResumeRequiresOperatorApproval, true);
  assert.equal(closeout.operatorResumeOpensBrowser, true);
  assert.equal(closeout.operatorResumeStartsCapture, true);
  assert.equal(closeout.operatorResumeAgentMayRunUnattended, false);
  assert.equal(closeout.agentSafeNextCommandId, 'agent-preflight');
  assert.equal(closeout.agentSafeNextMayRunUnattended, true);
  assert.equal(closeout.agentSafeNextOpensBrowser, false);
  assert.equal(closeout.agentSafeNextStartsCapture, false);
  assert.equal(closeout.agentSafeNextReadsBrowserStorage, false);
  assert.equal(closeout.agentSafeNextReturnsPageContent, false);
  assert.equal(closeout.targetApprovalPreflightMayRunUnattended, true);
  assert.equal(closeout.targetApprovalPreflightOpensBrowser, false);
  assert.equal(closeout.targetApprovalPreflightStartsCapture, false);
  assert.equal(closeout.targetProofPlanMayRunUnattended, true);
  assert.equal(closeout.targetProofPlanOpensBrowser, false);
  assert.equal(closeout.targetProofPlanStartsCapture, false);
  assert.equal(closeout.targetApprovalResumeWriteMayRunUnattended, true);
  assert.equal(closeout.targetApprovalResumeWriteOpensBrowser, false);
  assert.equal(closeout.targetApprovalResumeWriteStartsCapture, false);
  assert.equal(closeout.targetApprovalResumeWatchMayRunUnattended, true);
  assert.equal(closeout.targetApprovalResumeWatchOpensBrowser, false);
  assert.equal(closeout.targetApprovalResumeWatchStartsCapture, false);
  assert.equal(closeout.targetApprovalResumeWatchRequiresOperatorApproval, false);
  assert.equal(closeout.providerDefaultBackend, 'direct-cdp-chrome');
  assert.equal(closeout.providerDefaultAgentInterface, 'secure-browser-agent-mcp');
  assert.equal(closeout.providerLightpandaReadyForPublicBenchmark, false);
  assert.equal(closeout.providerLightpandaBenchmarkAgentMayRunUnattended, false);
  assert.equal(closeout.providerLightpandaBenchmarkStartsBrowser, true);
  assert.equal(closeout.providerLightpandaBenchmarkReadsBrowserStorage, false);
  assert.equal(closeout.providerLightpandaBenchmarkReturnsPageContent, false);
  assert.match(closeout.providerLightpandaBenchmarkCommand, /lightpanda-public\.json/);
  assert.equal(closeout.providerPlaywrightReadyForPublicSmoke, true);
  assert.equal(closeout.providerPlaywrightReadyForAuthenticatedDefault, false);
  assert.equal(closeout.providerPlaywrightStorageStateSensitive, true);
  assert.match(closeout.providerPlaywrightSmokeCommand, /outline-playwright/);
  assert.equal(closeout.providerPlaywrightPublicSmokeProofExists, true);
  assert.equal(closeout.providerPlaywrightPublicSmokeProofOk, true);
  assert.match(closeout.providerPlaywrightPublicSmokeProofPath, /playwright-public-smoke\.json/);
  assert.equal(closeout.providerPlaywrightPublicSmokeProofHeadingCount, 1);
  assert.equal(closeout.providerPlaywrightPublicSmokeProofLinkCount, 1);
  assert.match(closeout.providerPlaywrightSmokeProofCommand, /playwright-public-smoke\.json/);
  assert.equal(closeout.providerPlaywrightSmokeProofAgentMayRunUnattended, true);
  assert.equal(closeout.providerPlaywrightSmokeProofStartsBrowser, true);
  assert.equal(closeout.providerPlaywrightSmokeProofReadsBrowserStorage, false);
  assert.equal(closeout.providerPlaywrightSmokeProofReturnsPageContent, false);
  assert.equal(closeout.providerSeleniumReadyForLocalSmoke, false);
  assert.equal(closeout.providerSeleniumSmokeAgentMayRunUnattended, true);
  assert.equal(closeout.providerSeleniumSmokeStartsBrowser, false);
  assert.match(closeout.providerSeleniumSmokeCommand, /selenium-doctor/);
  assert.equal(closeout.providerDoctorOpensBrowser, false);
  assert.equal(closeout.providerDoctorStartsCapture, false);
  assert.equal(closeout.providerDoctorReadsBrowserStorage, false);
  assert.equal(closeout.providerDoctorReturnsPageContent, false);
  assert.equal(closeout.providerDoctorMayRunUnattended, true);
  assert.equal(closeout.nextArtifactAction, 'wait-auth-then-capture-proof');
  assert.equal(closeout.nextArtifactBlocker, 'auth-check-not-ok');
  assert.deepEqual(closeout.artifactCommandCovers, ['auth-check', 'target-proof']);
  assert.equal(closeout.missingArtifactCount, 2);
  assert.deepEqual(closeout.missingArtifacts, ['auth-check', 'target-proof']);

  const compact = formatAgentProofCloseoutCompact(closeout);
  assert.match(compact, /^safe_mode: yes$/m);
  assert.match(compact, /^complete: no$/m);
  assert.match(compact, /^readiness_remaining: real-external-auth-target$/m);
  assert.match(compact, /^agent_proof_closeout_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout'.*'--include-compact-command-audit'/m);
  assert.match(compact, /^agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout'.*'--write'.*'--include-compact-command-audit'/m);
  assert.match(compact, /^agent_safe_next_command_id: agent-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^target_approval_preflight_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_preflight_opens_browser: no$/m);
  assert.match(compact, /^target_approval_preflight_starts_capture: no$/m);
  assert.match(compact, /^target_proof_plan_may_run_unattended: yes$/m);
  assert.match(compact, /^target_proof_plan_opens_browser: no$/m);
  assert.match(compact, /^target_proof_plan_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_write_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_resume_write_opens_browser: no$/m);
  assert.match(compact, /^target_approval_resume_write_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_watch_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_resume_watch_opens_browser: no$/m);
  assert.match(compact, /^target_approval_resume_watch_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_watch_requires_operator_approval: no$/m);
  assert.match(compact, /^provider_default_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^provider_default_agent_interface: secure-browser-agent-mcp$/m);
  assert.match(compact, /^provider_lightpanda_ready_for_public_benchmark: no$/m);
  assert.match(compact, /^provider_lightpanda_benchmark_agent_may_run_unattended: no$/m);
  assert.match(compact, /^provider_lightpanda_benchmark_starts_browser: yes$/m);
  assert.match(compact, /^provider_lightpanda_benchmark_reads_browser_storage: no$/m);
  assert.match(compact, /^provider_lightpanda_benchmark_returns_page_content: no$/m);
  assert.match(compact, /^provider_lightpanda_benchmark_command: LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="\/tmp\/lightpanda" node src\/cli\.mjs benchmark --url https:\/\/example\.com --iterations 1 --write --out provider-benchmarks\/lightpanda-public\.json --format json$/m);
  assert.match(compact, /^provider_playwright_ready_for_public_smoke: yes$/m);
  assert.match(compact, /^provider_playwright_ready_for_authenticated_default: no$/m);
  assert.match(compact, /^provider_playwright_storage_state_sensitive: yes$/m);
  assert.match(compact, /^provider_playwright_smoke_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>'$/m);
  assert.match(compact, /^provider_playwright_public_smoke_proof_exists: yes$/m);
  assert.match(compact, /^provider_playwright_public_smoke_proof_ok: yes$/m);
  assert.match(compact, /^provider_playwright_public_smoke_proof_path: \/tmp\/runs\/provider-benchmarks\/playwright-public-smoke\.json$/m);
  assert.match(compact, /^provider_playwright_public_smoke_proof_heading_count: 1$/m);
  assert.match(compact, /^provider_playwright_public_smoke_proof_link_count: 1$/m);
  assert.match(compact, /^provider_playwright_smoke_proof_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>' --out provider-benchmarks\/playwright-public-smoke\.json$/m);
  assert.match(compact, /^provider_playwright_smoke_proof_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^provider_playwright_smoke_proof_starts_browser: yes$/m);
  assert.match(compact, /^provider_playwright_smoke_proof_reads_browser_storage: no$/m);
  assert.match(compact, /^provider_playwright_smoke_proof_returns_page_content: no$/m);
  assert.match(compact, /^provider_selenium_ready_for_local_smoke: no$/m);
  assert.match(compact, /^provider_selenium_smoke_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^provider_selenium_smoke_starts_browser: no$/m);
  assert.match(compact, /^provider_selenium_smoke_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
  assert.match(compact, /^provider_doctor_opens_browser: no$/m);
  assert.match(compact, /^provider_doctor_starts_capture: no$/m);
  assert.match(compact, /^provider_doctor_reads_browser_storage: no$/m);
  assert.match(compact, /^provider_doctor_returns_page_content: no$/m);
  assert.match(compact, /^provider_doctor_may_run_unattended: yes$/m);
  assert.match(compact, /^next_artifact_action: wait-auth-then-capture-proof$/m);
  assert.match(compact, /^next_artifact_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^artifact_command_covers: auth-check,target-proof$/m);
  assert.match(compact, /^missing_artifact_count: 2$/m);
  assert.match(compact, /^missing_artifacts: auth-check,target-proof$/m);
  assert.match(compact, /^operator_resume_requires_operator_approval: yes$/m);
  assert.match(compact, /^operator_resume_opens_browser: yes$/m);
  assert.match(compact, /^operator_resume_starts_capture: yes$/m);
  assert.match(compact, /^operator_resume_agent_may_run_unattended: no$/m);
  assert.match(compact, /^completion_proof_bundle_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle'.*'--include-compact-command-audit'/m);
  assert.match(compact, /^completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle'.*'--include-compact-command-audit'/m);
  assert.match(compact, /^compact_command_audit_all_command: 'node' 'src\/cli\.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit'/m);
  assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
  assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
  assert.match(compact, /^target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
  assert.match(compact, /^target_approval_resume_write_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_status_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-status' '--in' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator\/target-approval-resume-latest\.json' '--out' 'operator\/target-approval-resume-latest\.json' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
  assert.match(compact, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'/m);
  assert.doesNotMatch(compact, /^\{/);
});

test('agent proof closeout writes only runs-scoped JSON', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-proof-closeout-'));
  const closeout = await buildAgentProofCloseout({
    rootDir,
    generatedAt: '2026-05-31T00:00:00.000Z',
    candidate: 'github',
    write: true,
    out: 'operator/agent-proof-closeout-latest.json',
    bundle: {
      complete: true,
      verdict: 'complete',
      targetDir: path.join(rootDir, 'runs/target-packs/github'),
      readinessComplete: true,
      readinessRemainingCount: 0,
      readinessRemaining: [],
      objectiveCompletionComplete: true,
      proofGateComplete: true,
      targetApprovalComplete: true,
      targetProofReady: true,
      authState: 'authenticated',
      authUsable: true,
      captureBlocked: false,
      acceptedExternalProofs: 1,
      missingArtifacts: []
    },
    checklistStatus: {
      exists: true,
      parseOk: true,
      stale: false
    },
    providerDoctorStatus: {
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      lightpanda: {
        readyForPublicBenchmark: false,
        benchmarkAgentMayRunUnattended: false,
        benchmarkStartsBrowser: true,
        benchmarkReadsBrowserStorage: false,
        benchmarkReturnsPageContent: false,
        benchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json'
      },
      playwright: {
        readyForPublicSmoke: true,
        readyForAuthenticatedDefault: false,
        storageStateSensitive: true,
        smokeCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'"
      },
      selenium: {
        readyForLocalSmoke: false,
        smokeAgentMayRunUnattended: true,
        smokeStartsBrowser: false,
        smokeCommand: 'node src/cli.mjs selenium-doctor --format compact'
      }
    }
  });

  assert.equal(closeout.complete, true);
  assert.equal(closeout.outputPath, path.join(rootDir, 'runs/operator/agent-proof-closeout-latest.json'));
  assert.equal(fs.existsSync(closeout.outputPath), true);
  const saved = JSON.parse(fs.readFileSync(closeout.outputPath, 'utf8'));
  assert.equal(saved.complete, true);
  assert.equal(saved.secretValuesRead, false);

  await assert.rejects(
    () => buildAgentProofCloseout({ rootDir, out: '../outside.json', bundle: { complete: true }, checklistStatus: {} }),
    /invalid agent proof closeout output path/
  );
});

test('agent proof closeout status reads saved closeout without recomputing browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-proof-closeout-status-'));
  try {
    const closeout = await buildAgentProofCloseout({
      rootDir,
      generatedAt: '2026-05-31T00:00:00.000Z',
      candidate: 'github',
      includeCompactCommandAudit: true,
      write: true,
      out: 'operator/agent-proof-closeout-latest.json',
      bundle: {
        complete: false,
        verdict: 'not-complete',
        targetDir: path.join(rootDir, 'runs/target-packs/github'),
        readinessRemainingCount: 1,
        readinessRemaining: ['real-external-auth-target'],
        authState: 'metadata-only-login-like',
        authUsable: false,
        captureBlocked: true,
        automationBlocker: 'auth-check-not-ok',
        acceptedExternalProofs: 0,
        nextArtifactAction: 'wait-auth-then-capture-proof',
        nextArtifactBlocker: 'auth-check-not-ok',
        artifactCommandCovers: ['auth-check', 'target-proof'],
        missingArtifactCount: 1,
        missingArtifacts: ['auth-check'],
        operatorResumeRequiresOperatorApproval: true,
        operatorResumeOpensBrowser: true,
        operatorResumeStartsCapture: true,
        operatorResumeAgentMayRunUnattended: false,
        agentSafeNextCommandId: 'agent-preflight',
        agentSafeNextMayRunUnattended: true,
        agentSafeNextOpensBrowser: false,
        agentSafeNextStartsCapture: false,
        targetApprovalPreflightMayRunUnattended: true,
        targetProofPlanMayRunUnattended: false,
        targetApprovalResumeWriteMayRunUnattended: true,
        targetApprovalResumeWriteOpensBrowser: false,
        targetApprovalResumeWriteStartsCapture: false,
        targetApprovalResumeWatchMayRunUnattended: true,
        targetApprovalResumeWatchOpensBrowser: false,
        targetApprovalResumeWatchStartsCapture: false,
        targetApprovalResumeWatchRequiresOperatorApproval: false,
        commands: {
          agentPreflight: { shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'" },
          targetApprovalPreflight: { shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'" },
          targetApprovalResumeWrite: { shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator/target-approval-resume-latest.json' '--format' 'compact'" },
          targetApprovalResumeStatus: { shell: "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'" },
          targetApprovalResumeWatch: { shell: "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'" },
          operatorResume: { shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'" }
        }
      },
      checklistStatus: {
        exists: true,
        parseOk: true,
        stale: false
      },
      providerDoctorStatus: {
        defaultBackend: 'direct-cdp-chrome',
        defaultAgentInterface: 'secure-browser-agent-mcp',
        lightpanda: {
          readyForPublicBenchmark: false,
          benchmarkAgentMayRunUnattended: false,
          benchmarkStartsBrowser: true,
          benchmarkReadsBrowserStorage: false,
          benchmarkReturnsPageContent: false,
          benchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json'
        },
        playwright: {
          readyForPublicSmoke: true,
          readyForAuthenticatedDefault: false,
          storageStateSensitive: true,
          smokeCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'"
        },
        selenium: {
          readyForLocalSmoke: false,
          smokeAgentMayRunUnattended: true,
          smokeStartsBrowser: false,
          smokeCommand: 'node src/cli.mjs selenium-doctor --format compact'
        }
      }
    });

    const status = buildAgentProofCloseoutStatus({
      rootDir,
      in: 'operator/agent-proof-closeout-latest.json',
      nowMs: new Date('2026-05-31T00:00:01.000Z').getTime()
    });

    assert.equal(status.safeMode, true);
    assert.equal(status.statusOnly, true);
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.opensBrowserNow, false);
    assert.equal(status.startsCaptureNow, false);
    assert.equal(status.readsBrowserStorage, false);
    assert.equal(status.pageContentReturned, false);
    assert.equal(status.exists, true);
    assert.equal(status.parseOk, true);
    assert.equal(status.complete, false);
    assert.equal(status.inputPath, closeout.outputPath);
    assert.deepEqual(status.readinessRemaining, ['real-external-auth-target']);
    assert.equal(status.nextArtifactAction, 'wait-auth-then-capture-proof');
    assert.equal(status.nextArtifactBlocker, 'auth-check-not-ok');
    assert.deepEqual(status.artifactCommandCovers, ['auth-check', 'target-proof']);
    assert.equal(status.missingArtifactCount, 1);
    assert.deepEqual(status.missingArtifacts, ['auth-check']);
    assert.equal(status.operatorResumeRequiresOperatorApproval, true);
    assert.equal(status.operatorResumeOpensBrowser, true);
    assert.equal(status.operatorResumeStartsCapture, true);
    assert.equal(status.operatorResumeAgentMayRunUnattended, false);
    assert.equal(status.targetApprovalResumeWriteMayRunUnattended, true);
    assert.equal(status.targetApprovalResumeWriteOpensBrowser, false);
    assert.equal(status.targetApprovalResumeWriteStartsCapture, false);
    assert.equal(status.targetApprovalResumeWatchMayRunUnattended, true);
    assert.equal(status.targetApprovalResumeWatchOpensBrowser, false);
    assert.equal(status.targetApprovalResumeWatchStartsCapture, false);
    assert.equal(status.targetApprovalResumeWatchRequiresOperatorApproval, false);
    assert.equal(status.providerDefaultBackend, 'direct-cdp-chrome');
    assert.equal(status.providerDefaultAgentInterface, 'secure-browser-agent-mcp');
    assert.equal(status.providerLightpandaReadyForPublicBenchmark, false);
    assert.equal(status.providerLightpandaBenchmarkAgentMayRunUnattended, false);
    assert.equal(status.providerLightpandaBenchmarkStartsBrowser, true);
    assert.equal(status.providerLightpandaBenchmarkReadsBrowserStorage, false);
    assert.equal(status.providerLightpandaBenchmarkReturnsPageContent, false);
    assert.match(status.providerLightpandaBenchmarkCommand, /lightpanda-public\.json/);
    assert.equal(status.providerPlaywrightReadyForPublicSmoke, true);
    assert.equal(status.providerPlaywrightReadyForAuthenticatedDefault, false);
    assert.equal(status.providerPlaywrightStorageStateSensitive, true);
    assert.match(status.providerPlaywrightSmokeCommand, /outline-playwright/);
    assert.equal(status.providerSeleniumReadyForLocalSmoke, false);
    assert.equal(status.providerSeleniumSmokeAgentMayRunUnattended, true);
    assert.equal(status.providerSeleniumSmokeStartsBrowser, false);
    assert.match(status.providerSeleniumSmokeCommand, /selenium-doctor/);
    assert.equal(status.providerDoctorOpensBrowser, false);
    assert.equal(status.providerDoctorStartsCapture, false);
    assert.equal(status.providerDoctorReadsBrowserStorage, false);
    assert.equal(status.providerDoctorReturnsPageContent, false);
    assert.equal(status.providerDoctorMayRunUnattended, true);
    assert.equal(status.agentSafeNextCommandId, 'agent-preflight');
    assert.equal(status.agentSafeNextMayRunUnattended, true);
    assert.equal(status.agentSafeNextOpensBrowser, false);
    assert.equal(status.agentSafeNextStartsCapture, false);
    assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
    assert.equal(status.targetApprovalPreflightCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
    assert.equal(status.targetApprovalResumeWriteCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator/target-approval-resume-latest.json' '--format' 'compact'");
    assert.equal(status.targetApprovalResumeStatusCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'");
    assert.equal(status.targetApprovalResumeWatchCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'");
    assert.equal(status.providerDoctorStatusCommand.shell, "'node' 'src/cli.mjs' 'provider-doctor-status' '--format' 'compact'");
    assert.equal(status.operatorResumeCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'");
    assert.equal(status.completionProofBundleCommand.shell, "'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator/completion-proof-bundle-latest.json' '--format' 'compact'");
    assert.equal(status.completionProofBundleWithAuditCommand.shell, "'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator/completion-proof-bundle-latest.json' '--format' 'compact'");
    assert.equal(status.compactCommandAuditAllCommand.shell, "'node' 'src/cli.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'");
    assert.equal(status.objectiveCompletionStrictCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");
    assert.equal(status.refreshCommand.shell, "'node' 'src/cli.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator/agent-proof-closeout-latest.json' '--include-compact-command-audit' '--format' 'compact'");

    const compact = formatAgentProofCloseoutStatusCompact(status);
    assert.match(compact, /^safe_mode: yes$/m);
    assert.match(compact, /^input_path: runs\/operator\/agent-proof-closeout-latest\.json$/m);
    assert.match(compact, /^target_dir: runs\/target-packs\/github$/m);
    assert.equal(compact.includes(rootDir), false);
    assert.match(compact, /^exists: yes$/m);
    assert.match(compact, /^parse_ok: yes$/m);
    assert.match(compact, /^complete: no$/m);
    assert.match(compact, /^readiness_remaining: real-external-auth-target$/m);
    assert.match(compact, /^next_artifact_action: wait-auth-then-capture-proof$/m);
    assert.match(compact, /^next_artifact_blocker: auth-check-not-ok$/m);
    assert.match(compact, /^artifact_command_covers: auth-check,target-proof$/m);
    assert.match(compact, /^missing_artifact_count: 1$/m);
    assert.match(compact, /^missing_artifacts: auth-check$/m);
    assert.match(compact, /^operator_resume_requires_operator_approval: yes$/m);
    assert.match(compact, /^operator_resume_opens_browser: yes$/m);
    assert.match(compact, /^operator_resume_starts_capture: yes$/m);
    assert.match(compact, /^operator_resume_agent_may_run_unattended: no$/m);
    assert.match(compact, /^target_approval_resume_write_may_run_unattended: yes$/m);
    assert.match(compact, /^target_approval_resume_write_opens_browser: no$/m);
    assert.match(compact, /^target_approval_resume_write_starts_capture: no$/m);
    assert.match(compact, /^target_approval_resume_watch_may_run_unattended: yes$/m);
    assert.match(compact, /^target_approval_resume_watch_opens_browser: no$/m);
    assert.match(compact, /^target_approval_resume_watch_starts_capture: no$/m);
    assert.match(compact, /^target_approval_resume_watch_requires_operator_approval: no$/m);
    assert.match(compact, /^provider_default_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^provider_default_agent_interface: secure-browser-agent-mcp$/m);
    assert.match(compact, /^provider_lightpanda_ready_for_public_benchmark: no$/m);
    assert.match(compact, /^provider_lightpanda_benchmark_agent_may_run_unattended: no$/m);
    assert.match(compact, /^provider_lightpanda_benchmark_starts_browser: yes$/m);
    assert.match(compact, /^provider_lightpanda_benchmark_reads_browser_storage: no$/m);
    assert.match(compact, /^provider_lightpanda_benchmark_returns_page_content: no$/m);
    assert.match(compact, /^provider_lightpanda_benchmark_command: LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="\/tmp\/lightpanda" node src\/cli\.mjs benchmark --url https:\/\/example\.com --iterations 1 --write --out provider-benchmarks\/lightpanda-public\.json --format json$/m);
    assert.match(compact, /^provider_playwright_ready_for_public_smoke: yes$/m);
    assert.match(compact, /^provider_playwright_ready_for_authenticated_default: no$/m);
    assert.match(compact, /^provider_playwright_storage_state_sensitive: yes$/m);
    assert.match(compact, /^provider_playwright_smoke_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>'$/m);
    assert.match(compact, /^provider_selenium_ready_for_local_smoke: no$/m);
    assert.match(compact, /^provider_selenium_smoke_agent_may_run_unattended: yes$/m);
    assert.match(compact, /^provider_selenium_smoke_starts_browser: no$/m);
    assert.match(compact, /^provider_selenium_smoke_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
    assert.match(compact, /^provider_doctor_opens_browser: no$/m);
    assert.match(compact, /^provider_doctor_starts_capture: no$/m);
    assert.match(compact, /^provider_doctor_reads_browser_storage: no$/m);
    assert.match(compact, /^provider_doctor_returns_page_content: no$/m);
    assert.match(compact, /^provider_doctor_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_command_id: agent-preflight$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
    assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
    assert.match(compact, /^target_approval_resume_write_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--write'/m);
    assert.match(compact, /^target_approval_resume_status_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-status'/m);
    assert.match(compact, /^target_approval_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch'.*'--run'/m);
    assert.match(compact, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
    assert.match(compact, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
    assert.match(compact, /^completion_proof_bundle_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle'.*'--include-compact-command-audit'/m);
    assert.match(compact, /^completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle'.*'--include-compact-command-audit'/m);
    assert.match(compact, /^compact_command_audit_all_command: 'node' 'src\/cli\.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'$/m);
    assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout'.*'--include-compact-command-audit'/m);
    assert.doesNotMatch(compact, /^\{/);

    assert.throws(
      () => buildAgentProofCloseoutStatus({ rootDir, in: '../outside.json' }),
      /invalid agent proof closeout output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent proof closeout status exposes refresh as safe next when saved closeout is missing', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-proof-closeout-missing-status-'));
  try {
    const status = buildAgentProofCloseoutStatus({
      rootDir,
      in: 'operator/missing-agent-proof-closeout.json',
      nowMs: new Date('2026-05-31T00:00:01.000Z').getTime()
    });

    assert.equal(status.exists, false);
    assert.equal(status.parseOk, false);
    assert.equal(status.agentSafeNextCommandId, 'agent-proof-closeout-refresh');
    assert.equal(status.agentSafeNextMayRunUnattended, true);
    assert.equal(status.agentSafeNextOpensBrowser, false);
    assert.equal(status.agentSafeNextStartsCapture, false);
    assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator/missing-agent-proof-closeout.json' '--include-compact-command-audit' '--format' 'compact'");

    const compact = formatAgentProofCloseoutStatusCompact(status);
    assert.match(compact, /^exists: no$/m);
    assert.match(compact, /^agent_safe_next_command_id: agent-proof-closeout-refresh$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout'.*'--write'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent proof closeout status promotes current objective audit safe next when saved closeout is fresh', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-proof-closeout-objective-next-'));
  try {
    fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'runs/operator/agent-proof-closeout-latest.json'), `${JSON.stringify({
      complete: false,
      verdict: 'not-complete',
      candidate: 'github',
      targetDir: 'runs/target-packs/github',
      readinessRemainingCount: 1,
      readinessRemaining: ['real-external-auth-target'],
      agentSafeNextCommandId: 'agent-preflight',
      agentSafeNextMayRunUnattended: true,
      commands: {
        agentSafeNext: {
          shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
        }
      }
    })}\n`, 'utf8');

    const status = buildAgentProofCloseoutStatus({
      rootDir,
      in: 'operator/agent-proof-closeout-latest.json',
      nowMs: Date.now(),
      staleAfterSeconds: 900,
      objectiveCompletionAuditStatus: {
        exists: true,
        parseOk: true,
        stale: false,
        savedComplete: false,
        savedStatus: 'incomplete',
        remainingCount: 1,
        remaining: ['real-external-auth-target'],
        agentSafeNextCommandId: 'objective-completion-audit-strict',
        agentSafeNextMayRunUnattended: true,
        agentSafeNextOpensBrowser: false,
        agentSafeNextStartsCapture: false,
        agentSafeNextReadsBrowserStorage: false,
        agentSafeNextReturnsPageContent: false,
        strictCommand: {
          shell: "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'"
        }
      }
    });

    assert.equal(status.agentSafeNextCommandId, 'objective-completion-audit-strict');
    assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");
    assert.equal(status.objectiveCompletionAuditExists, true);
    assert.equal(status.objectiveCompletionAuditStale, false);
    assert.deepEqual(status.objectiveCompletionAuditRemaining, ['real-external-auth-target']);

    const compact = formatAgentProofCloseoutStatusCompact(status);
    assert.match(compact, /^objective_completion_audit_exists: yes$/m);
    assert.match(compact, /^objective_completion_audit_remaining: real-external-auth-target$/m);
    assert.match(compact, /^agent_safe_next_command_id: objective-completion-audit-strict$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('agent proof closeout status infers legacy operator resume safety conservatively', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-proof-closeout-legacy-status-'));
  try {
    fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'runs/operator/agent-proof-closeout-latest.json'), `${JSON.stringify({
      complete: false,
      verdict: 'not-complete',
      candidate: 'github',
      targetDir: 'runs/target-packs/github',
      readinessRemainingCount: 1,
      readinessRemaining: ['real-external-auth-target'],
      missingArtifacts: ['auth-check', 'target-proof'],
      commands: {
        operatorResume: {
          shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
        }
      }
    })}\n`, 'utf8');

    const status = buildAgentProofCloseoutStatus({
      rootDir,
      in: 'operator/agent-proof-closeout-latest.json',
      nowMs: Date.now(),
      staleAfterSeconds: 900
    });

    assert.equal(status.operatorResumeRequiresOperatorApproval, true);
    assert.equal(status.operatorResumeOpensBrowser, true);
    assert.equal(status.operatorResumeStartsCapture, true);
    assert.equal(status.operatorResumeAgentMayRunUnattended, false);
    assert.equal(status.operatorResumeCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'");

    const compact = formatAgentProofCloseoutStatusCompact(status);
    assert.match(compact, /^operator_resume_requires_operator_approval: yes$/m);
    assert.match(compact, /^operator_resume_opens_browser: yes$/m);
    assert.match(compact, /^operator_resume_starts_capture: yes$/m);
    assert.match(compact, /^operator_resume_agent_may_run_unattended: no$/m);
    assert.match(compact, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
