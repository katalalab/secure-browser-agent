import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCompletionProofBundle, buildCompletionProofBundleStatus, buildCompletionProofBundleWatch, formatCompletionProofBundleCompact, formatCompletionProofBundleStatusCompact, formatCompletionProofBundleWatchCompact } from '../src/completion-proof-bundle.mjs';
import { buildStartCommandCandidates } from '../src/start-commands.mjs';
import { COMPACT_COMMAND_AUDIT_SOURCES } from '../src/compact-command-audit.mjs';

function safeCompactCommandAudit() {
  return {
    complete: true,
    safeForStrictAgentLoops: true,
    commandCount: 308,
    riskyCommandCount: 55,
    unclassifiedRiskCount: 0,
    missingApprovalCount: 0,
    staleHandoffConflictCount: 0,
    sources: COMPACT_COMMAND_AUDIT_SOURCES.map((source) => ({ source }))
  };
}

function providerDoctorStatusFixture() {
  return {
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
  };
}

test('completion proof package probes keep compact command audit enabled', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

  assert.match(packageJson.scripts['probe:completion-proof-bundle'], /completion-proof-bundle --include-compact-command-audit --format compact/);
  assert.match(packageJson.scripts['probe:completion-proof-bundle-audit'], /completion-proof-bundle --include-compact-command-audit --format compact/);
  assert.match(packageJson.scripts['probe:completion-proof-bundle-status'], /completion-proof-bundle --include-compact-command-audit --write --out operator\/completion-proof-bundle-latest\.json --format compact/);
  assert.match(packageJson.scripts['probe:completion-proof-bundle-watch'], /completion-proof-bundle-watch --run --in operator\/completion-proof-bundle-latest\.json --out operator\/completion-proof-bundle-latest\.json --format compact/);
  assert.doesNotMatch(packageJson.scripts['probe:completion-proof-bundle'], /completion-proof-bundle --format compact/);
  assert.doesNotMatch(packageJson.scripts['probe:completion-proof-bundle-status'], /completion-proof-bundle --write --out/);
});

test('completion proof watch start command is classified as unattended-safe', () => {
  const watch = buildStartCommandCandidates({ candidate: 'github' })
    .find((item) => item.id === 'completion-proof-bundle-watch');

  assert.ok(watch);
  assert.equal(watch.safety.opensBrowser, false);
  assert.equal(watch.safety.startsCapture, false);
  assert.equal(watch.safety.startsBackground, false);
  assert.equal(watch.safety.requiresOperatorApproval, false);
  assert.equal(watch.safety.agentMayRunUnattended, true);
});

test('completion proof bundle summarizes incomplete real external proof without browser work', async () => {
  const bundle = await buildCompletionProofBundle({
    rootDir: '/tmp/sba-test-root',
    generatedAt: '2026-05-31T00:00:00.000Z',
    candidate: 'github',
    readiness: {
      completeAgainstObjective: false,
      remaining: [{ id: 'real-external-auth-target' }]
    },
    completionAudit: {
      complete: false,
      finalGate: { remainingCount: 1 }
    },
    compactCommandAudit: safeCompactCommandAudit(),
    providerDoctorStatus: providerDoctorStatusFixture(),
    proofGateStatus: {
      complete: false,
      status: 'waiting-for-login',
      authState: 'metadata-only-login-like',
      authUsable: false,
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'auth-check-not-ok',
      artifactCommandCovers: ['auth-check', 'observe', 'scrape', 'benchmark', 'target-proof'],
      operatorGuidance: {
        captureBlocked: true,
        automationBlocker: 'auth-check-not-ok'
      },
      acceptedExternalProofCount: 0
    },
    targetApprovalPreflight: {
      candidate: 'github',
      targetDir: '/tmp/sba-test-root/runs/target-packs/github',
      complete: false,
      nextAction: 'handoff-resume',
      agentSafeCommandId: 'none',
      operatorApprovalRequired: true,
      operatorCommandOpensBrowser: true,
      operatorCommandStartsCapture: true,
      authState: 'metadata-only-login-like',
      authUsable: false,
      captureBlocked: true,
      automationBlocker: 'auth-check-not-ok',
      acceptedExternalProofs: 0,
      missingArtifacts: [
        { id: 'auth-check' },
        { id: 'output:observe.json' },
        { id: 'benchmark' },
        { id: 'target-proof' }
      ],
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      proofPlanCommand: {
        shell: "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'"
      },
      approvalResumeWriteCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator/target-approval-resume-latest.json' '--format' 'compact'"
      },
      approvalResumeStatusCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'"
      },
      approvalResumeWatchCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      agentPreflightCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      operatorCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      }
    },
    targetProofPlan: {
      currentState: {
        proofReady: false,
        authState: 'metadata-only-login-like',
        authUsable: false,
        missingArtifacts: [
          { id: 'auth-check' },
          { id: 'output:observe.json' },
          { id: 'benchmark' },
          { id: 'target-proof' }
        ]
      }
    }
  });

  assert.equal(bundle.safeMode, true);
  assert.equal(bundle.statusOnly, true);
  assert.equal(bundle.complete, false);
  assert.equal(bundle.targetApprovalOperatorApprovalRequired, true);
  assert.equal(bundle.targetApprovalOperatorCommandOpensBrowser, true);
  assert.equal(bundle.targetApprovalOperatorCommandStartsCapture, true);
  assert.equal(bundle.compactCommandAuditComplete, true);
  assert.equal(bundle.compactCommandAuditSafeForStrictAgentLoops, true);
  assert.equal(bundle.compactCommandAuditSkipped, false);
  assert.equal(bundle.compactCommandAuditUnclassifiedRiskCount, 0);
  assert.equal(bundle.compactCommandAuditMissingApprovalCount, 0);
  assert.equal(bundle.compactCommandAuditSourceCount, COMPACT_COMMAND_AUDIT_SOURCES.length);
  assert.deepEqual(bundle.compactCommandAuditSources, COMPACT_COMMAND_AUDIT_SOURCES);
  assert.equal(bundle.providerDefaultBackend, 'direct-cdp-chrome');
  assert.equal(bundle.providerDefaultAgentInterface, 'secure-browser-agent-mcp');
  assert.equal(bundle.providerLightpandaReadyForPublicBenchmark, false);
  assert.equal(bundle.providerLightpandaBenchmarkAgentMayRunUnattended, false);
  assert.equal(bundle.providerLightpandaBenchmarkStartsBrowser, true);
  assert.equal(bundle.providerLightpandaBenchmarkReadsBrowserStorage, false);
  assert.equal(bundle.providerLightpandaBenchmarkReturnsPageContent, false);
  assert.match(bundle.providerLightpandaBenchmarkCommand, /lightpanda-public\.json/);
  assert.equal(bundle.providerPlaywrightReadyForPublicSmoke, true);
  assert.equal(bundle.providerPlaywrightReadyForAuthenticatedDefault, false);
  assert.equal(bundle.providerPlaywrightStorageStateSensitive, true);
  assert.match(bundle.providerPlaywrightSmokeCommand, /outline-playwright/);
  assert.equal(bundle.providerPlaywrightPublicSmokeProofExists, true);
  assert.equal(bundle.providerPlaywrightPublicSmokeProofOk, true);
  assert.match(bundle.providerPlaywrightPublicSmokeProofPath, /playwright-public-smoke\.json/);
  assert.equal(bundle.providerPlaywrightPublicSmokeProofHeadingCount, 1);
  assert.equal(bundle.providerPlaywrightPublicSmokeProofLinkCount, 1);
  assert.match(bundle.providerPlaywrightSmokeProofCommand, /playwright-public-smoke\.json/);
  assert.equal(bundle.providerPlaywrightSmokeProofAgentMayRunUnattended, true);
  assert.equal(bundle.providerPlaywrightSmokeProofStartsBrowser, true);
  assert.equal(bundle.providerPlaywrightSmokeProofReadsBrowserStorage, false);
  assert.equal(bundle.providerPlaywrightSmokeProofReturnsPageContent, false);
  assert.equal(bundle.providerSeleniumReadyForLocalSmoke, false);
  assert.equal(bundle.providerSeleniumSmokeAgentMayRunUnattended, true);
  assert.equal(bundle.providerSeleniumSmokeStartsBrowser, false);
  assert.match(bundle.providerSeleniumSmokeCommand, /selenium-doctor/);
  assert.equal(bundle.providerDoctorOpensBrowser, false);
  assert.equal(bundle.providerDoctorStartsCapture, false);
  assert.equal(bundle.providerDoctorReadsBrowserStorage, false);
  assert.equal(bundle.providerDoctorReturnsPageContent, false);
  assert.equal(bundle.providerDoctorMayRunUnattended, true);
  assert.equal(bundle.operatorResumeRequiresOperatorApproval, true);
  assert.equal(bundle.operatorResumeOpensBrowser, true);
  assert.equal(bundle.operatorResumeStartsCapture, true);
  assert.equal(bundle.operatorResumeAgentMayRunUnattended, false);
  assert.equal(bundle.agentSafeNextCommandId, 'agent-preflight');
  assert.equal(bundle.agentSafeNextMayRunUnattended, true);
  assert.equal(bundle.agentSafeNextOpensBrowser, false);
  assert.equal(bundle.agentSafeNextStartsCapture, false);
  assert.equal(bundle.agentSafeNextReadsBrowserStorage, false);
  assert.equal(bundle.agentSafeNextReturnsPageContent, false);
  assert.equal(bundle.targetApprovalPreflightMayRunUnattended, true);
  assert.equal(bundle.targetApprovalPreflightOpensBrowser, false);
  assert.equal(bundle.targetApprovalPreflightStartsCapture, false);
  assert.equal(bundle.targetApprovalPreflightReadsBrowserStorage, false);
  assert.equal(bundle.targetApprovalPreflightReturnsPageContent, false);
  assert.equal(bundle.targetProofPlanMayRunUnattended, true);
  assert.equal(bundle.targetProofPlanOpensBrowser, false);
  assert.equal(bundle.targetProofPlanStartsCapture, false);
  assert.equal(bundle.targetProofPlanReadsBrowserStorage, false);
  assert.equal(bundle.targetProofPlanReturnsPageContent, false);
  assert.equal(bundle.targetApprovalResumeWriteMayRunUnattended, true);
  assert.equal(bundle.targetApprovalResumeWriteOpensBrowser, false);
  assert.equal(bundle.targetApprovalResumeWriteStartsCapture, false);
  assert.equal(bundle.targetApprovalResumeWatchMayRunUnattended, true);
  assert.equal(bundle.targetApprovalResumeWatchOpensBrowser, false);
  assert.equal(bundle.targetApprovalResumeWatchStartsCapture, false);
  assert.equal(bundle.targetApprovalResumeWatchRequiresOperatorApproval, false);
  assert.equal(bundle.targetProofReady, false);
  assert.equal(bundle.nextArtifactAction, 'wait-auth-then-capture-proof');
  assert.equal(bundle.nextArtifactBlocker, 'auth-check-not-ok');
  assert.deepEqual(bundle.artifactCommandCovers, ['auth-check', 'observe', 'scrape', 'benchmark', 'target-proof']);
  assert.equal(bundle.missingArtifactCount, 4);
  assert.deepEqual(bundle.missingArtifacts, ['auth-check', 'output:observe.json', 'benchmark', 'target-proof']);

  const compact = formatCompletionProofBundleCompact(bundle);
  assert.match(compact, /^safe_mode: yes$/m);
  assert.match(compact, /^status_only: yes$/m);
  assert.match(compact, /^opens_browser_now: no$/m);
  assert.match(compact, /^starts_capture_now: no$/m);
  assert.match(compact, /^reads_browser_storage: no$/m);
  assert.match(compact, /^page_content_returned: no$/m);
  assert.match(compact, /^complete: no$/m);
  assert.match(compact, /^readiness_remaining: real-external-auth-target$/m);
  assert.match(compact, /^target_approval_agent_safe_command_id: none$/m);
  assert.match(compact, /^target_approval_operator_approval_required: yes$/m);
  assert.match(compact, /^target_approval_operator_command_opens_browser: yes$/m);
  assert.match(compact, /^target_approval_operator_command_starts_capture: yes$/m);
  assert.match(compact, /^compact_command_audit_complete: yes$/m);
  assert.match(compact, /^compact_command_audit_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^compact_command_audit_skipped: no$/m);
  assert.match(compact, /^compact_command_audit_unclassified_risk_count: 0$/m);
  assert.match(compact, /^compact_command_audit_missing_approval_count: 0$/m);
  assert.match(compact, new RegExp(`^compact_command_audit_source_count: ${COMPACT_COMMAND_AUDIT_SOURCES.length}$`, 'm'));
  assert.match(compact, new RegExp(`^compact_command_audit_sources: ${COMPACT_COMMAND_AUDIT_SOURCES.join(',')}$`, 'm'));
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
  assert.match(compact, /^operator_resume_requires_operator_approval: yes$/m);
  assert.match(compact, /^operator_resume_opens_browser: yes$/m);
  assert.match(compact, /^operator_resume_starts_capture: yes$/m);
  assert.match(compact, /^operator_resume_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_safe_next_command_id: agent-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^target_approval_preflight_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_preflight_opens_browser: no$/m);
  assert.match(compact, /^target_approval_preflight_starts_capture: no$/m);
  assert.match(compact, /^target_approval_preflight_reads_browser_storage: no$/m);
  assert.match(compact, /^target_approval_preflight_returns_page_content: no$/m);
  assert.match(compact, /^target_proof_plan_may_run_unattended: yes$/m);
  assert.match(compact, /^target_proof_plan_opens_browser: no$/m);
  assert.match(compact, /^target_proof_plan_starts_capture: no$/m);
  assert.match(compact, /^target_proof_plan_reads_browser_storage: no$/m);
  assert.match(compact, /^target_proof_plan_returns_page_content: no$/m);
  assert.match(compact, /^target_approval_resume_write_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_resume_write_opens_browser: no$/m);
  assert.match(compact, /^target_approval_resume_write_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_watch_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_resume_watch_opens_browser: no$/m);
  assert.match(compact, /^target_approval_resume_watch_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_watch_requires_operator_approval: no$/m);
  assert.match(compact, /^target_proof_ready: no$/m);
  assert.match(compact, /^next_artifact_action: wait-auth-then-capture-proof$/m);
  assert.match(compact, /^next_artifact_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^artifact_command_covers: auth-check,observe,scrape,benchmark,target-proof$/m);
  assert.match(compact, /^missing_artifact_count: 4$/m);
  assert.match(compact, /^missing_artifacts: auth-check,output:observe\.json,benchmark,target-proof$/m);
  assert.match(compact, /^completion_proof_bundle_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'$/m);
  assert.match(compact, /^completion_proof_bundle_write_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status' '--in' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_control_plane_command: 'node' 'src\/cli\.mjs' 'agent-control-plane' '--task' 'auth-proof' '--format' 'compact'$/m);
  assert.match(compact, /^agent_control_plane_write_command: 'node' 'src\/cli\.mjs' 'agent-control-plane' '--task' 'auth-proof' '--write' '--out' 'operator\/agent-control-plane-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_control_plane_status_command: 'node' 'src\/cli\.mjs' 'agent-control-plane-status' '--in' 'operator\/agent-control-plane-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^compact_command_audit_all_command: 'node' 'src\/cli\.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
  assert.match(compact, /^target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'.*'--format' 'compact'/m);
  assert.match(compact, /^target_approval_resume_write_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_status_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-status' '--in' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator\/target-approval-resume-latest\.json' '--out' 'operator\/target-approval-resume-latest\.json' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
});

test('completion proof bundle reports complete only when every proof layer is complete', async () => {
  const bundle = await buildCompletionProofBundle({
    rootDir: '/tmp/sba-test-root',
    generatedAt: '2026-05-31T00:00:00.000Z',
    readiness: { completeAgainstObjective: true, remaining: [] },
    completionAudit: { complete: true, finalGate: { remainingCount: 0 } },
    compactCommandAudit: safeCompactCommandAudit(),
    proofGateStatus: { complete: true, status: 'complete', acceptedExternalProofCount: 1 },
    targetApprovalPreflight: { complete: true, acceptedExternalProofs: 1, targetDir: '/tmp/sba-test-root/runs/target-packs/github' },
    targetProofPlan: { currentState: { proofReady: true, missingArtifacts: [], authState: 'usable', authUsable: true } }
  });

  assert.equal(bundle.complete, true);
  assert.equal(bundle.verdict, 'complete');
  assert.equal(bundle.agentSafeNextCommandId, 'none');
  assert.equal(bundle.agentSafeNextMayRunUnattended, false);
  assert.match(formatCompletionProofBundleCompact(bundle), /^complete: yes$/m);
});

test('completion proof bundle stays incomplete when compact command audit is unsafe', async () => {
  const bundle = await buildCompletionProofBundle({
    rootDir: '/tmp/sba-test-root',
    generatedAt: '2026-05-31T00:00:00.000Z',
    readiness: { completeAgainstObjective: true, remaining: [] },
    completionAudit: { complete: true, finalGate: { remainingCount: 0 } },
    compactCommandAudit: {
      complete: false,
      safeForStrictAgentLoops: false,
      commandCount: 1,
      riskyCommandCount: 1,
      unclassifiedRiskCount: 1,
      missingApprovalCount: 1,
      staleHandoffConflictCount: 0
    },
    proofGateStatus: { complete: true, status: 'complete', acceptedExternalProofCount: 1 },
    targetApprovalPreflight: { complete: true, acceptedExternalProofs: 1, targetDir: '/tmp/sba-test-root/runs/target-packs/github' },
    targetProofPlan: { currentState: { proofReady: true, missingArtifacts: [], authState: 'usable', authUsable: true } }
  });
  const compact = formatCompletionProofBundleCompact(bundle);

  assert.equal(bundle.complete, false);
  assert.equal(bundle.compactCommandAuditSafeForStrictAgentLoops, false);
  assert.match(compact, /^complete: no$/m);
  assert.match(compact, /^compact_command_audit_safe_for_strict_agent_loops: no$/m);
  assert.match(compact, /^compact_command_audit_unclassified_risk_count: 1$/m);
  assert.match(compact, /^compact_command_audit_missing_approval_count: 1$/m);
});

test('completion proof bundle status reads saved bundle without recomputing browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-completion-status-'));
  fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'runs/operator/completion-proof-bundle-latest.json'), `${JSON.stringify({
    complete: false,
    verdict: 'not-complete',
    candidate: 'github',
    targetDir: path.join(rootDir, 'runs/target-packs/github'),
    readinessRemainingCount: 1,
    readinessRemaining: ['real-external-auth-target'],
    missingArtifactCount: 2,
    missingArtifacts: ['auth-check', 'target-proof'],
    nextArtifactAction: 'wait-auth-then-capture-proof',
    nextArtifactBlocker: 'auth-check-not-ok',
    artifactCommandCovers: ['auth-check', 'target-proof'],
    authState: 'metadata-only-login-like',
    authUsable: false,
    captureBlocked: true,
    automationBlocker: 'auth-check-not-ok',
    operatorResumeRequiresOperatorApproval: true,
    operatorResumeOpensBrowser: true,
    operatorResumeStartsCapture: true,
    operatorResumeAgentMayRunUnattended: false,
    compactCommandAuditComplete: true,
    compactCommandAuditSafeForStrictAgentLoops: true,
    compactCommandAuditCommandCount: 308,
    compactCommandAuditRiskyCommandCount: 55,
    compactCommandAuditUnclassifiedRiskCount: 0,
    compactCommandAuditMissingApprovalCount: 0,
    compactCommandAuditStaleHandoffConflictCount: 0,
    compactCommandAuditSourceCount: COMPACT_COMMAND_AUDIT_SOURCES.length,
    compactCommandAuditSources: COMPACT_COMMAND_AUDIT_SOURCES,
    providerDefaultBackend: 'direct-cdp-chrome',
    providerDefaultAgentInterface: 'secure-browser-agent-mcp',
    providerLightpandaReadyForPublicBenchmark: false,
    providerLightpandaBenchmarkAgentMayRunUnattended: false,
    providerLightpandaBenchmarkStartsBrowser: true,
    providerLightpandaBenchmarkReadsBrowserStorage: false,
    providerLightpandaBenchmarkReturnsPageContent: false,
    providerLightpandaBenchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json',
    providerPlaywrightReadyForPublicSmoke: true,
    providerPlaywrightReadyForAuthenticatedDefault: false,
    providerPlaywrightStorageStateSensitive: true,
    providerPlaywrightSmokeCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'",
    providerPlaywrightPublicSmokeProofExists: true,
    providerPlaywrightPublicSmokeProofOk: true,
    providerPlaywrightPublicSmokeProofPath: '/tmp/runs/provider-benchmarks/playwright-public-smoke.json',
    providerPlaywrightPublicSmokeProofHeadingCount: 1,
    providerPlaywrightPublicSmokeProofLinkCount: 1,
    providerPlaywrightSmokeProofCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>' --out provider-benchmarks/playwright-public-smoke.json",
    providerPlaywrightSmokeProofAgentMayRunUnattended: true,
    providerPlaywrightSmokeProofStartsBrowser: true,
    providerPlaywrightSmokeProofReadsBrowserStorage: false,
    providerPlaywrightSmokeProofReturnsPageContent: false,
    providerSeleniumReadyForLocalSmoke: false,
    providerSeleniumSmokeAgentMayRunUnattended: true,
    providerSeleniumSmokeStartsBrowser: false,
    providerSeleniumSmokeCommand: 'node src/cli.mjs selenium-doctor --format compact',
    providerDoctorOpensBrowser: false,
    providerDoctorStartsCapture: false,
    providerDoctorReadsBrowserStorage: false,
    providerDoctorReturnsPageContent: false,
    providerDoctorMayRunUnattended: true,
    acceptedExternalProofs: 0,
    commands: {
      agentPreflight: {
        shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      targetApprovalPreflight: {
        shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      targetProofPlan: {
        shell: "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'"
      },
      targetApprovalResumeWrite: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator/target-approval-resume-latest.json' '--format' 'compact'"
      },
      targetApprovalResumeStatus: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'"
      },
      targetApprovalResumeWatch: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      operatorResume: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      },
      compactCommandAuditAll: {
        shell: "'node' 'src/cli.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'"
      },
      providerDoctorStatus: {
        shell: "'node' 'src/cli.mjs' 'provider-doctor-status' '--format' 'compact'"
      }
    }
  })}\n`, 'utf8');

  const status = buildCompletionProofBundleStatus({
    rootDir,
    in: 'operator/completion-proof-bundle-latest.json',
    nowMs: Date.now(),
    staleAfterSeconds: 900
  });
  assert.equal(status.safeMode, true);
  assert.equal(status.exists, true);
  assert.equal(status.parseOk, true);
  assert.equal(status.complete, false);
  assert.equal(status.missingArtifactCount, 2);
  assert.deepEqual(status.missingArtifacts, ['auth-check', 'target-proof']);
  assert.equal(status.nextArtifactAction, 'wait-auth-then-capture-proof');
  assert.equal(status.nextArtifactBlocker, 'auth-check-not-ok');
  assert.deepEqual(status.artifactCommandCovers, ['auth-check', 'target-proof']);
  assert.equal(status.operatorResumeRequiresOperatorApproval, true);
  assert.equal(status.operatorResumeOpensBrowser, true);
  assert.equal(status.operatorResumeStartsCapture, true);
  assert.equal(status.operatorResumeAgentMayRunUnattended, false);
  assert.equal(status.compactCommandAuditComplete, true);
  assert.equal(status.compactCommandAuditSafeForStrictAgentLoops, true);
  assert.equal(status.compactCommandAuditSkipped, false);
  assert.equal(status.compactCommandAuditUnclassifiedRiskCount, 0);
  assert.equal(status.compactCommandAuditMissingApprovalCount, 0);
  assert.equal(status.compactCommandAuditSourceCount, COMPACT_COMMAND_AUDIT_SOURCES.length);
  assert.deepEqual(status.compactCommandAuditSources, COMPACT_COMMAND_AUDIT_SOURCES);
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
  assert.equal(status.providerPlaywrightPublicSmokeProofExists, true);
  assert.equal(status.providerPlaywrightPublicSmokeProofOk, true);
  assert.match(status.providerPlaywrightPublicSmokeProofPath, /playwright-public-smoke\.json/);
  assert.equal(status.providerPlaywrightPublicSmokeProofHeadingCount, 1);
  assert.equal(status.providerPlaywrightPublicSmokeProofLinkCount, 1);
  assert.match(status.providerPlaywrightSmokeProofCommand, /playwright-public-smoke\.json/);
  assert.equal(status.providerPlaywrightSmokeProofAgentMayRunUnattended, true);
  assert.equal(status.providerPlaywrightSmokeProofStartsBrowser, true);
  assert.equal(status.providerPlaywrightSmokeProofReadsBrowserStorage, false);
  assert.equal(status.providerPlaywrightSmokeProofReturnsPageContent, false);
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
  assert.equal(status.agentSafeNextReadsBrowserStorage, false);
  assert.equal(status.agentSafeNextReturnsPageContent, false);
  assert.equal(status.targetApprovalPreflightMayRunUnattended, true);
  assert.equal(status.targetApprovalPreflightOpensBrowser, false);
  assert.equal(status.targetApprovalPreflightStartsCapture, false);
  assert.equal(status.targetApprovalPreflightReadsBrowserStorage, false);
  assert.equal(status.targetApprovalPreflightReturnsPageContent, false);
  assert.equal(status.targetProofPlanMayRunUnattended, true);
  assert.equal(status.targetProofPlanOpensBrowser, false);
  assert.equal(status.targetProofPlanStartsCapture, false);
  assert.equal(status.targetProofPlanReadsBrowserStorage, false);
  assert.equal(status.targetProofPlanReturnsPageContent, false);
  assert.equal(status.targetApprovalResumeWriteMayRunUnattended, true);
  assert.equal(status.targetApprovalResumeWriteOpensBrowser, false);
  assert.equal(status.targetApprovalResumeWriteStartsCapture, false);
  assert.equal(status.targetApprovalResumeWatchMayRunUnattended, true);
  assert.equal(status.targetApprovalResumeWatchOpensBrowser, false);
  assert.equal(status.targetApprovalResumeWatchStartsCapture, false);
  assert.equal(status.targetApprovalResumeWatchRequiresOperatorApproval, false);
  assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(status.targetApprovalPreflightCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(status.targetProofPlanCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");
  assert.equal(status.targetApprovalResumeWriteCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--write' '--out' 'operator/target-approval-resume-latest.json' '--format' 'compact'");
  assert.equal(status.targetApprovalResumeStatusCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'");
  assert.equal(status.targetApprovalResumeWatchCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(status.operatorResumeCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'");
  assert.equal(status.objectiveCompletionStrictCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");
  assert.equal(status.compactCommandAuditAllCommand.shell, "'node' 'src/cli.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'");
  assert.equal(status.providerDoctorStatusCommand.shell, "'node' 'src/cli.mjs' 'provider-doctor-status' '--format' 'compact'");

  const compact = formatCompletionProofBundleStatusCompact(status);
  assert.match(compact, /^input_path: runs\/operator\/completion-proof-bundle-latest\.json$/m);
  assert.match(compact, /^target_dir: runs\/target-packs\/github$/m);
  assert.equal(compact.includes(rootDir), false);
  assert.match(compact, /^exists: yes$/m);
  assert.match(compact, /^parse_ok: yes$/m);
  assert.match(compact, /^complete: no$/m);
  assert.match(compact, /^next_artifact_action: wait-auth-then-capture-proof$/m);
  assert.match(compact, /^next_artifact_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^artifact_command_covers: auth-check,target-proof$/m);
  assert.match(compact, /^missing_artifact_count: 2$/m);
  assert.match(compact, /^missing_artifacts: auth-check,target-proof$/m);
  assert.match(compact, /^operator_resume_requires_operator_approval: yes$/m);
  assert.match(compact, /^operator_resume_opens_browser: yes$/m);
  assert.match(compact, /^operator_resume_starts_capture: yes$/m);
  assert.match(compact, /^operator_resume_agent_may_run_unattended: no$/m);
  assert.match(compact, /^compact_command_audit_complete: yes$/m);
  assert.match(compact, /^compact_command_audit_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^compact_command_audit_skipped: no$/m);
  assert.match(compact, /^compact_command_audit_unclassified_risk_count: 0$/m);
  assert.match(compact, /^compact_command_audit_missing_approval_count: 0$/m);
  assert.match(compact, new RegExp(`^compact_command_audit_source_count: ${COMPACT_COMMAND_AUDIT_SOURCES.length}$`, 'm'));
  assert.match(compact, new RegExp(`^compact_command_audit_sources: ${COMPACT_COMMAND_AUDIT_SOURCES.join(',')}$`, 'm'));
  assert.match(compact, /^provider_default_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^provider_lightpanda_benchmark_starts_browser: yes$/m);
  assert.match(compact, /^provider_playwright_ready_for_public_smoke: yes$/m);
  assert.match(compact, /^provider_playwright_public_smoke_proof_ok: yes$/m);
  assert.match(compact, /^provider_playwright_smoke_proof_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^provider_selenium_smoke_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^provider_doctor_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_command_id: agent-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^target_approval_preflight_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_preflight_opens_browser: no$/m);
  assert.match(compact, /^target_approval_preflight_starts_capture: no$/m);
  assert.match(compact, /^target_approval_preflight_reads_browser_storage: no$/m);
  assert.match(compact, /^target_approval_preflight_returns_page_content: no$/m);
  assert.match(compact, /^target_proof_plan_may_run_unattended: yes$/m);
  assert.match(compact, /^target_proof_plan_opens_browser: no$/m);
  assert.match(compact, /^target_proof_plan_starts_capture: no$/m);
  assert.match(compact, /^target_proof_plan_reads_browser_storage: no$/m);
  assert.match(compact, /^target_proof_plan_returns_page_content: no$/m);
  assert.match(compact, /^target_approval_resume_write_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_resume_write_opens_browser: no$/m);
  assert.match(compact, /^target_approval_resume_write_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_watch_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_resume_watch_opens_browser: no$/m);
  assert.match(compact, /^target_approval_resume_watch_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_watch_requires_operator_approval: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
  assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
  assert.match(compact, /^target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
  assert.match(compact, /^target_approval_resume_write_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--write'/m);
  assert.match(compact, /^target_approval_resume_status_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-status'/m);
  assert.match(compact, /^target_approval_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch'.*'--run'/m);
  assert.match(compact, /^operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
  assert.match(compact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^compact_command_audit_all_command: 'node' 'src\/cli\.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-watch' '--run' '--in' 'operator\/completion-proof-bundle-latest\.json' '--out' 'operator\/completion-proof-bundle-latest\.json' '--stale-after-seconds' '900' '--candidate' 'github' '--format' 'compact'$/m);
});

test('completion proof bundle status infers legacy operator resume command safety conservatively', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-completion-legacy-status-'));
  fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'runs/operator/completion-proof-bundle-latest.json'), `${JSON.stringify({
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

  const status = buildCompletionProofBundleStatus({
    rootDir,
    in: 'operator/completion-proof-bundle-latest.json',
    nowMs: Date.now(),
    staleAfterSeconds: 900
  });

  assert.equal(status.operatorResumeRequiresOperatorApproval, true);
  assert.equal(status.operatorResumeOpensBrowser, true);
  assert.equal(status.operatorResumeStartsCapture, true);
  assert.equal(status.operatorResumeAgentMayRunUnattended, false);

  const compact = formatCompletionProofBundleStatusCompact(status);
  assert.match(compact, /^operator_resume_requires_operator_approval: yes$/m);
  assert.match(compact, /^operator_resume_opens_browser: yes$/m);
  assert.match(compact, /^operator_resume_starts_capture: yes$/m);
  assert.match(compact, /^operator_resume_agent_may_run_unattended: no$/m);
});

test('completion proof bundle status promotes current objective audit safe next when saved bundle is fresh', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-completion-objective-next-'));
  try {
    fs.mkdirSync(path.join(rootDir, 'runs/operator'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'runs/operator/completion-proof-bundle-latest.json'), `${JSON.stringify({
      complete: false,
      verdict: 'not-complete',
      candidate: 'github',
      targetDir: 'runs/target-packs/github',
      readinessRemainingCount: 1,
      readinessRemaining: ['real-external-auth-target'],
      agentSafeNextCommandId: 'agent-preflight',
      agentSafeNextMayRunUnattended: true,
      commands: {
        agentPreflight: {
          shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
        }
      }
    })}\n`, 'utf8');

    const status = buildCompletionProofBundleStatus({
      rootDir,
      in: 'operator/completion-proof-bundle-latest.json',
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

    const compact = formatCompletionProofBundleStatusCompact(status);
    assert.match(compact, /^objective_completion_audit_exists: yes$/m);
    assert.match(compact, /^objective_completion_audit_remaining: real-external-auth-target$/m);
    assert.match(compact, /^agent_safe_next_command_id: objective-completion-audit-strict$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('completion proof bundle status exposes refresh as safe next when saved bundle is missing', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-completion-missing-status-'));
  try {
    const status = buildCompletionProofBundleStatus({
      rootDir,
      in: 'operator/missing-completion-proof-bundle.json',
      nowMs: Date.now(),
      staleAfterSeconds: 900
    });

    assert.equal(status.exists, false);
    assert.equal(status.parseOk, false);
    assert.equal(status.agentSafeNextCommandId, 'completion-proof-bundle-refresh');
    assert.equal(status.agentSafeNextMayRunUnattended, true);
    assert.equal(status.agentSafeNextOpensBrowser, false);
    assert.equal(status.agentSafeNextStartsCapture, false);
    assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'completion-proof-bundle-watch' '--run' '--in' 'operator/missing-completion-proof-bundle.json' '--out' 'operator/missing-completion-proof-bundle.json' '--stale-after-seconds' '900' '--candidate' 'github' '--format' 'compact'");

    const compact = formatCompletionProofBundleStatusCompact(status);
    assert.match(compact, /^exists: no$/m);
    assert.match(compact, /^agent_safe_next_command_id: completion-proof-bundle-refresh$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-watch'.*'--run'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('completion proof bundle watch refreshes missing saved bundle only when run is requested', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-completion-watch-'));
  const refreshedBundle = {
    complete: false,
    verdict: 'not-complete',
    candidate: 'github',
    targetDir: 'runs/target-packs/github',
    readinessRemainingCount: 1,
    readinessRemaining: ['real-external-auth-target'],
    missingArtifactCount: 1,
    missingArtifacts: ['target-proof'],
    nextArtifactAction: 'wait-auth-then-capture-proof',
    compactCommandAuditComplete: true,
    compactCommandAuditSafeForStrictAgentLoops: true,
    compactCommandAuditSourceCount: COMPACT_COMMAND_AUDIT_SOURCES.length,
    compactCommandAuditSources: COMPACT_COMMAND_AUDIT_SOURCES,
    commands: {
      agentPreflight: {
        shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      }
    }
  };

  try {
    const planned = await buildCompletionProofBundleWatch({
      rootDir,
      in: 'operator/completion-watch.json',
      out: 'operator/completion-watch.json',
      candidate: 'github'
    });
    assert.equal(planned.runRequested, false);
    assert.equal(planned.executed, false);
    assert.equal(planned.allowedToRun, false);
    assert.equal(planned.stale, true);
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/completion-watch.json')), false);

    const watch = await buildCompletionProofBundleWatch({
      rootDir,
      run: true,
      in: 'operator/completion-watch.json',
      out: 'operator/completion-watch.json',
      staleAfterSeconds: 1,
      candidate: 'github',
      refreshedBundle
    });

    assert.equal(watch.safeMode, true);
    assert.equal(watch.opensBrowserNow, false);
    assert.equal(watch.startsCaptureNow, false);
    assert.equal(watch.readsBrowserStorage, false);
    assert.equal(watch.pageContentReturned, false);
    assert.equal(watch.executed, true);
    assert.equal(watch.status, 'refreshed');
    assert.equal(watch.statusAfter.exists, true);
    assert.equal(watch.statusAfter.parseOk, true);
    assert.equal(watch.statusAfter.compactCommandAuditSourceCount, COMPACT_COMMAND_AUDIT_SOURCES.length);

    const compact = formatCompletionProofBundleWatchCompact(watch);
    assert.match(compact, /^run_requested: yes$/m);
    assert.match(compact, /^executed: yes$/m);
    assert.match(compact, /^status: refreshed$/m);
    assert.match(compact, /^after_parse_ok: yes$/m);
    assert.match(compact, new RegExp(`^after_compact_command_audit_source_count: ${COMPACT_COMMAND_AUDIT_SOURCES.length}$`, 'm'));
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-watch' '--run' '--in' 'operator\/completion-watch\.json' '--out' 'operator\/completion-watch\.json' '--stale-after-seconds' '1' '--candidate' 'github' '--format' 'compact'$/m);

    const fresh = await buildCompletionProofBundleWatch({
      rootDir,
      run: true,
      in: 'operator/completion-watch.json',
      out: 'operator/completion-watch.json',
      staleAfterSeconds: 900,
      candidate: 'github',
      refreshedBundle: { ...refreshedBundle, complete: true }
    });
    assert.equal(fresh.executed, false);
    assert.equal(fresh.status, 'fresh');
    assert.equal(fresh.blockedReason, 'saved-completion-proof-bundle-is-fresh');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('completion proof bundle watch rejects paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-completion-watch-path-'));
  try {
    await assert.rejects(
      () => buildCompletionProofBundleWatch({ rootDir, in: '../outside.json' }),
      /invalid completion proof bundle output path/
    );
    await assert.rejects(
      () => buildCompletionProofBundleWatch({ rootDir, out: '../outside.json' }),
      /invalid completion proof bundle output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
