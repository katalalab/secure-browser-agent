import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAgentControlPlane, buildAgentControlPlaneStatus, buildAgentControlPlaneWatch, formatAgentControlPlaneCompact, formatAgentControlPlaneStatusCompact, formatAgentControlPlaneWatchCompact, writeAgentControlPlane } from '../src/agent-control-plane.mjs';

function cmd(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

test('agent control plane rolls readiness provider backend and objective state into one compact status', async () => {
  const status = await buildAgentControlPlane({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-31T00:00:00.000Z',
    task: 'scrape',
    readiness: {
      readyForLocalAuthenticatedDevelopment: true,
      completeAgainstObjective: false,
      requirements: [
        { id: 'agent-interface', status: 'proved' },
        { id: 'real-external-auth-target', status: 'manual-required' }
      ]
    },
    providerDoctorStatus: {
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      adoptionNext: 'keep-direct-cdp-default-and-run-provider-doctors-before-changing-backends',
      agentBrowser: {
        cliExists: false,
        chromeForTestingExists: true,
        readyForEngineUse: false,
        missingChecks: ['cli.agent-browser'],
        next: 'install-agent-browser-cli-or-run-agent-browser-install-before-engine-use',
        installPlanRequiresOperatorApproval: true,
        installPlanAgentMayRunUnattended: false,
        installPlanMutatesRuntime: true
      },
      publicBenchmark: {
        exists: true,
        ok: true,
        path: '/tmp/runs/provider-benchmarks/default-public.json',
        fastestMeasuredProvider: 'direct-cdp-daemon',
        directCdpColdOk: true,
        directCdpDaemonOk: true,
        agentBrowserChromeOk: true,
        playwrightOk: true,
        agentMayRunUnattended: true,
        startsBrowser: true,
        readsBrowserStorage: false,
        returnsPageContent: false,
        command: 'node src/cli.mjs benchmark --iterations 1 --write --out provider-benchmarks/default-public.json --format json'
      },
      lightpanda: {
        readyForPublicBenchmark: false,
        missingChecks: ['binary.available'],
        installPlanRequiresOperatorApproval: true,
        installPlanAgentMayRunUnattended: false,
        installPlanMutatesRuntime: true,
        benchmarkRequiresOperatorApproval: false,
        benchmarkAgentMayRunUnattended: false,
        benchmarkStartsBrowser: true,
        benchmarkReadsBrowserStorage: false,
        benchmarkReturnsPageContent: false,
        benchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json'
      },
      playwright: {
        readyForPublicSmoke: true,
        readyForAuthenticatedDefault: false,
        missingChecks: ['auth.storage-state-boundary'],
        storageStateSensitive: true,
        installPlanRequiresOperatorApproval: true,
        installPlanAgentMayRunUnattended: false,
        installPlanMutatesRuntime: true,
        smokeRequiresOperatorApproval: false,
        smokeAgentMayRunUnattended: true,
        smokeStartsBrowser: true,
        smokeReadsBrowserStorage: false,
        smokeReturnsPageContent: false,
        smokeCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'"
      },
      selenium: {
        readyForLocalSmoke: false,
        missingChecks: ['package.selenium-webdriver'],
        installPlanRequiresOperatorApproval: true,
        installPlanAgentMayRunUnattended: false,
        installPlanMutatesRuntime: true,
        smokeRequiresOperatorApproval: false,
        smokeAgentMayRunUnattended: true,
        smokeStartsBrowser: false,
        smokeCommand: 'node src/cli.mjs selenium-doctor --format compact'
      }
    },
    backendSelection: {
      query: '',
      provider: 'duckduckgo',
      target: { available: true, dir: '/tmp/sba/runs/target-packs/acme' },
      selection: {
        backend: 'direct-cdp-chrome',
        lane: 'target-pack-direct-cdp',
        agentInterface: 'secure-browser-agent-mcp',
        backendAvailable: true,
        canRunInBackground: true
      },
      safety: {
        executionAllowed: false,
        blockedReason: 'auth-check-before-scrape',
        operatorInput: true,
        captureBlocked: true
      },
      commands: {
        selector: cmd(['node', 'src/cli.mjs', 'agent-backend-select', '--task', 'scrape', '--target-dir', '/tmp/sba/runs/target-packs/acme', '--format', 'compact']),
        workflow: cmd(['node', 'src/cli.mjs', 'agent-workflow', '--task', 'scrape', '--target-dir', '/tmp/sba/runs/target-packs/acme', '--format', 'compact']),
        safeRun: cmd(['node', 'src/cli.mjs', 'agent-task', '--run', '--task', 'scrape', '--format', 'compact']),
        selectedDirect: cmd(['node', 'src/cli.mjs', 'target-run', '/tmp/sba/runs/target-packs/acme', 'observe', '--daemon']),
        regularChromeStatus: cmd(['node', 'src/cli.mjs', 'regular-chrome-status', '--format', 'compact']),
        chromeExtensionBackendCheckPlan: cmd(['node', 'src/cli.mjs', 'chrome-extension-backend-check-plan', '--format', 'compact']),
        chromeExtensionClaimPlan: cmd(['node', 'src/cli.mjs', 'chrome-extension-claim-plan', '--backend-ready', 'unknown', '--intent', 'inspect', '--format', 'compact'])
      },
      agentTask: {
        status: 'planned',
        recommendedCommandId: 'auth-check-before-scrape',
        executionAllowed: false,
        blockedReason: 'target-auth-gate-blocked',
        authPreflightChecked: true,
        authPreflightParsed: false,
        authPreflightOk: null,
        authPreflightLoginLike: null,
        authPreflightSameOrigin: null,
        authPreflightNextAction: ''
      }
    },
    objectiveNext: {
      primaryAction: {
        id: 'target-handoff-resume',
        requirementId: 'real-external-auth-target',
        status: 'ready',
        needsOperatorInput: true,
        command: cmd(['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/acme', '--handoff', 'operator-handoff.json', '--run', '--open-login', '--wait-auth', '--format', 'compact']),
        operatorGuidance: {
          captureBlocked: true,
          humanAction: 'Log in in the dedicated profile.',
          automationBlocker: 'Waiting for operator login.'
        },
        manualCommandCandidates: [
          {
            id: 'handoff-resume-watch',
            command: cmd(['node', 'src/cli.mjs', 'target-handoff-resume-watch', '/tmp/sba/runs/target-packs/acme', '--handoff', 'operator-handoff.json', '--run', '--format', 'compact'])
          },
          {
            id: 'auth-watch',
            command: cmd(['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/acme', '--real-external', '--handoff', 'operator-handoff.json', '--status-out', 'auth-watch-status.json', '--timeout-ms', '10000', '--interval-ms', '1000', '--format', 'compact'])
          }
        ]
      }
    },
    objectiveProofPipeline: {
      status: 'incomplete',
      decision: {
        recommendedNow: 'monitor-auth',
        proofCaptureAllowedNow: false,
        nextArtifactAction: 'wait-auth-then-capture-proof',
        nextArtifactBlocker: 'auth-check-not-ok'
      },
      phases: {
        monitorAuth: {
          available: true,
          command: cmd(['node', 'src/cli.mjs', 'target-auth-watch', '--timeout-ms', '10000', '--interval-ms', '1000', '--format', 'compact'])
        },
        reopenLogin: {
          available: true,
          startsCapture: false,
          command: cmd(['node', 'src/cli.mjs', 'target-handoff-resume', '/tmp/sba/runs/target-packs/acme', '--handoff', 'operator-handoff.json', '--run', '--open-login', '--format', 'compact'])
        }
      },
      background: {
        monitorStartAvailable: true,
        captureStartAvailable: true,
        commandsAreOperatorGated: true,
        statusCommand: cmd(['node', 'src/cli.mjs', 'background-proof-capture-status', '--format', 'compact']),
        monitorStartCommand: cmd(['node', 'src/cli.mjs', 'background-proof-capture-start', '--mode', 'monitor', '--monitor-timeout-ms', '10000', '--monitor-interval-ms', '1000', '--run', '--operator-ok', 'OK', '--format', 'compact']),
        captureStartCommand: cmd(['node', 'src/cli.mjs', 'background-proof-capture-start', '--mode', 'capture', '--timeout-ms', '300000', '--interval-ms', '5000', '--monitor-timeout-ms', '10000', '--monitor-interval-ms', '1000', '--run', '--operator-ok', 'OK', '--format', 'compact'])
      }
    },
    objectiveCompletionAuditStatus: {
      exists: true,
      parseOk: true,
      stale: false,
      savedComplete: false,
      savedStatus: 'incomplete',
      readinessComplete: false,
      allCriteriaProved: false,
      remainingCount: 1,
      remaining: ['real-external-auth-target'],
      refreshNeeded: false,
      nextActionId: 'target-handoff-resume',
      nextStatus: 'ready',
      nextCommandRequiresOperatorApproval: true,
      nextCommandAgentMayRunUnattended: false,
      targetApprovalCandidate: 'github',
      targetApprovalResumeStatus: 'planned',
      targetApprovalResumeRequiresOperatorApproval: true,
      targetApprovalResumeAgentMayRunUnattended: false,
      targetApprovalResumeOpensBrowser: true,
      targetApprovalResumeStartsCapture: true,
      refreshCommand: cmd(['node', 'src/cli.mjs', 'objective-completion-audit', '--write', '--out', 'operator/objective-completion-audit-latest.json', '--format', 'compact']),
      watchCommand: cmd(['node', 'src/cli.mjs', 'objective-completion-audit-watch', '--run', '--in', 'operator/objective-completion-audit-latest.json', '--out', 'operator/objective-completion-audit-latest.json', '--format', 'compact']),
      strictCommand: cmd(['node', 'src/cli.mjs', 'objective-completion-audit', '--strict', '--format', 'compact']),
      agentSafeNextCommandId: 'objective-completion-audit-strict',
      agentSafeNextMayRunUnattended: true,
      agentSafeNextOpensBrowser: false,
      agentSafeNextStartsCapture: false,
      agentSafeNextReadsBrowserStorage: false,
      agentSafeNextReturnsPageContent: false
    },
    targetApprovalStatus: {
      approvalPackExists: true,
      approvalPackParseOk: true,
      selectedCandidate: 'github',
      targetPackExists: true,
      nextAction: { id: 'handoff-resume' },
      target: {
        operatorGuidance: {
          humanAction: 'complete-login-in-dedicated-profile',
          automationBlocker: 'auth-check-not-ok',
          captureBlocked: true
        }
      }
    },
    targetApprovalResume: {
      status: 'planned',
      readyToRun: true,
      selectedCandidate: 'github',
      targetNext: 'handoff-resume',
      humanAction: 'complete-login-in-dedicated-profile',
      automationBlocker: 'auth-check-not-ok',
      plannedCommandOpensBrowser: true,
      plannedCommandStartsCapture: true,
      statusCommand: cmd(['node', 'src/cli.mjs', 'target-approval-status', '--candidate', 'github', '--real-external', '--format', 'compact']),
      preflightCommand: cmd(['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', 'github', '--real-external', '--format', 'compact']),
      proofPlanCommand: cmd(['node', 'src/cli.mjs', 'target-proof-plan', '/tmp/sba/runs/target-packs/acme', '--real-external', '--format', 'compact']),
      runCommand: cmd(['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', 'github', '--real-external', '--run', '--operator-ok', 'OK', '--format', 'compact'])
    },
    secretRunSelect: {
      commandId: 'target-login-capture',
      targetDir: 'runs/target-packs/acme',
      opAvailable: true,
      selectedCandidate: 'service-account-env-file',
      selectedMode: 'service-account',
      headless: true,
      readyToRunNow: true,
      setupRequired: [],
      recommendedHeadlessMode: 'not-configured',
      headlessReady: false,
      headlessConfigAvailable: true,
      serviceAccountEnvFileUsable: true,
      desktopIntegrationLikely: false,
      runCommandSafety: {
        opensBrowser: true,
        startsCapture: true,
        startsBackground: false,
        requiresOperatorApproval: true,
        agentMayRunUnattended: false
      },
      command: cmd(['sh', '-lc', "set -a; . '/Users/test/.config/ai-secret/1password.env'; set +a; exec 'op' 'run' '--' 'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/acme' '--real-external' '--format' 'markdown'"]),
      setupCommand: null
    }
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.readiness.readyForLocalAuthenticatedDevelopment, true);
  assert.equal(status.provider.defaultBackend, 'direct-cdp-chrome');
  assert.equal(status.provider.agentBrowserCliExists, false);
  assert.equal(status.provider.agentBrowserChromeForTestingExists, true);
  assert.equal(status.provider.agentBrowserReadyForEngineUse, false);
  assert.deepEqual(status.provider.agentBrowserMissingChecks, ['cli.agent-browser']);
  assert.equal(status.provider.agentBrowserInstallRequiresOperatorApproval, true);
  assert.equal(status.provider.agentBrowserInstallAgentMayRunUnattended, false);
  assert.equal(status.provider.agentBrowserInstallMutatesRuntime, true);
  assert.equal(status.provider.publicBenchmarkProofExists, true);
  assert.equal(status.provider.publicBenchmarkProofOk, true);
  assert.match(status.provider.publicBenchmarkProofPath, /default-public\.json/);
  assert.equal(status.provider.publicBenchmarkFastestMeasuredProvider, 'direct-cdp-daemon');
  assert.equal(status.provider.publicBenchmarkDirectCdpColdOk, true);
  assert.equal(status.provider.publicBenchmarkDirectCdpDaemonOk, true);
  assert.equal(status.provider.publicBenchmarkAgentBrowserChromeOk, true);
  assert.equal(status.provider.publicBenchmarkPlaywrightOk, true);
  assert.equal(status.provider.publicBenchmarkAgentMayRunUnattended, true);
  assert.equal(status.provider.publicBenchmarkStartsBrowser, true);
  assert.equal(status.provider.publicBenchmarkReadsBrowserStorage, false);
  assert.equal(status.provider.publicBenchmarkReturnsPageContent, false);
  assert.match(status.provider.publicBenchmarkCommand, /default-public\.json/);
  assert.equal(status.provider.lightpandaInstallRequiresOperatorApproval, true);
  assert.equal(status.provider.lightpandaBenchmarkAgentMayRunUnattended, false);
  assert.equal(status.provider.lightpandaBenchmarkReadsBrowserStorage, false);
  assert.equal(status.provider.lightpandaBenchmarkReturnsPageContent, false);
  assert.match(status.provider.lightpandaBenchmarkCommand, /lightpanda-public\.json/);
  assert.equal(status.provider.playwrightReadyForPublicSmoke, true);
  assert.equal(status.provider.playwrightReadyForAuthenticatedDefault, false);
  assert.deepEqual(status.provider.playwrightMissingChecks, ['auth.storage-state-boundary']);
  assert.equal(status.provider.playwrightStorageStateSensitive, true);
  assert.equal(status.provider.playwrightInstallRequiresOperatorApproval, true);
  assert.equal(status.provider.playwrightSmokeAgentMayRunUnattended, true);
  assert.equal(status.provider.playwrightSmokeStartsBrowser, true);
  assert.equal(status.provider.playwrightSmokeReadsBrowserStorage, false);
  assert.equal(status.provider.playwrightSmokeReturnsPageContent, false);
  assert.match(status.provider.playwrightSmokeCommand, /outline-playwright/);
  assert.equal(status.provider.seleniumInstallRequiresOperatorApproval, true);
  assert.equal(status.provider.seleniumSmokeAgentMayRunUnattended, true);
  assert.match(status.provider.seleniumSmokeCommand, /selenium-doctor/);
  assert.equal(status.backendSelection.backend, 'direct-cdp-chrome');
  assert.equal(status.backendSelection.agentUnattendedAllowed, false);
  assert.equal(status.backendSelection.operatorApprovalRequired, true);
  assert.deepEqual(status.backendSelection.operatorApprovalReasons, ['operator-input', 'capture-blocked']);
  assert.equal(status.agentTask.recommendedCommandId, 'auth-check-before-scrape');
  assert.equal(status.agentTask.executionAllowed, false);
  assert.equal(status.agentTask.blockedReason, 'target-auth-gate-blocked');
  assert.equal(status.agentTask.authPreflightChecked, true);
  assert.equal(status.objectiveNext.primary, 'target-handoff-resume');
  assert.equal(status.objectiveNext.primaryRequiresOperatorApproval, true);
  assert.equal(status.objectiveNext.agentMustNotRunPrimaryUnattended, true);
  assert.deepEqual(status.objectiveNext.manualCommandCandidates.map((item) => item.id), ['handoff-resume-watch', 'auth-watch']);
  assert.equal(status.proofPipeline.recommendedNow, 'monitor-auth');
  assert.equal(status.proofPipeline.reopenLoginAvailable, true);
  assert.equal(status.proofPipeline.reopenLoginOpensBrowser, true);
  assert.equal(status.proofPipeline.reopenLoginStartsCapture, false);
  assert.equal(status.proofPipeline.reopenLoginRequiresOperatorApproval, true);
  assert.equal(status.proofPipeline.reopenLoginAgentMustNotRunUnattended, true);
  assert.equal(status.proofPipeline.backgroundCommandsOperatorGated, true);
  assert.equal(status.objectiveCompletionAudit.savedStatus, 'incomplete');
  assert.deepEqual(status.objectiveCompletionAudit.remaining, ['real-external-auth-target']);
  assert.equal(status.objectiveCompletionAudit.agentSafeNextCommandId, 'objective-completion-audit-strict');
  assert.equal(status.objectiveCompletionAudit.agentSafeNextMayRunUnattended, true);
  assert.equal(status.objectiveCompletionAudit.agentSafeNextOpensBrowser, false);
  assert.equal(status.objectiveCompletionAudit.agentSafeNextStartsCapture, false);
  assert.equal(status.targetApproval.selectedCandidate, 'github');
  assert.equal(status.targetApproval.resumeReadyToRun, true);
  assert.equal(status.targetApproval.resumePlannedCommandOpensBrowser, true);
  assert.equal(status.targetApproval.resumePlannedCommandStartsCapture, true);
  assert.equal(status.agentNext.preflightAvailable, true);
  assert.equal(status.agentNext.preflightMayRunWithoutApproval, true);
  assert.equal(status.agentNext.proofPlanAvailable, true);
  assert.equal(status.agentNext.proofPlanMayRunWithoutApproval, true);
  assert.equal(status.agentNext.operatorApprovalRequired, true);
  assert.equal(status.agentNext.operatorApprovalOpensBrowser, true);
  assert.equal(status.agentNext.operatorApprovalStartsCapture, true);
  assert.equal(status.agentNext.operatorApprovalAgentMayRunUnattended, false);
  assert.equal(status.secretRun.selectedCandidate, 'service-account-env-file');
  assert.equal(status.secretRun.selectedMode, 'service-account');
  assert.equal(status.secretRun.headless, true);
  assert.equal(status.secretRun.readyToRunNow, true);
  assert.equal(status.secretRun.runCommandSafety.opensBrowser, true);
  assert.equal(status.secretRun.runCommandSafety.startsCapture, true);
  assert.equal(status.secretRun.runCommandSafety.requiresOperatorApproval, true);
  assert.equal(status.secretRun.runCommandSafety.agentMayRunUnattended, false);

  const compact = formatAgentControlPlaneCompact(status);
  assert.match(compact, /^safe_mode: yes$/m);
  assert.match(compact, /^ready_local_auth: yes$/m);
  assert.match(compact, /^complete_against_objective: no$/m);
  assert.match(compact, /^remaining: real-external-auth-target$/m);
  assert.match(compact, /^default_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^agent_browser_cli_exists: no$/m);
  assert.match(compact, /^agent_browser_chrome_for_testing_exists: yes$/m);
  assert.match(compact, /^agent_browser_ready_for_engine_use: no$/m);
  assert.match(compact, /^agent_browser_missing_checks: cli\.agent-browser$/m);
  assert.match(compact, /^agent_browser_next: install-agent-browser-cli-or-run-agent-browser-install-before-engine-use$/m);
  assert.match(compact, /^agent_browser_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^agent_browser_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_browser_install_mutates_runtime: yes$/m);
  assert.match(compact, /^public_benchmark_proof_exists: yes$/m);
  assert.match(compact, /^public_benchmark_proof_ok: yes$/m);
  assert.match(compact, /^public_benchmark_proof_path: \/tmp\/runs\/provider-benchmarks\/default-public\.json$/m);
  assert.match(compact, /^public_benchmark_fastest_measured_provider: direct-cdp-daemon$/m);
  assert.match(compact, /^public_benchmark_direct_cdp_cold_ok: yes$/m);
  assert.match(compact, /^public_benchmark_direct_cdp_daemon_ok: yes$/m);
  assert.match(compact, /^public_benchmark_agent_browser_chrome_ok: yes$/m);
  assert.match(compact, /^public_benchmark_playwright_ok: yes$/m);
  assert.match(compact, /^public_benchmark_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^public_benchmark_starts_browser: yes$/m);
  assert.match(compact, /^public_benchmark_reads_browser_storage: no$/m);
  assert.match(compact, /^public_benchmark_returns_page_content: no$/m);
  assert.match(compact, /^public_benchmark_command: node src\/cli\.mjs benchmark --iterations 1 --write --out provider-benchmarks\/default-public\.json --format json$/m);
  assert.match(compact, /^lightpanda_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^lightpanda_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^lightpanda_install_mutates_runtime: yes$/m);
  assert.match(compact, /^lightpanda_benchmark_requires_operator_approval: no$/m);
  assert.match(compact, /^lightpanda_benchmark_agent_may_run_unattended: no$/m);
  assert.match(compact, /^lightpanda_benchmark_starts_browser: yes$/m);
  assert.match(compact, /^lightpanda_benchmark_reads_browser_storage: no$/m);
  assert.match(compact, /^lightpanda_benchmark_returns_page_content: no$/m);
  assert.match(compact, /^lightpanda_benchmark_command: LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="\/tmp\/lightpanda" node src\/cli\.mjs benchmark --url https:\/\/example\.com --iterations 1 --write --out provider-benchmarks\/lightpanda-public\.json --format json$/m);
  assert.match(compact, /^playwright_ready_for_public_smoke: yes$/m);
  assert.match(compact, /^playwright_ready_for_authenticated_default: no$/m);
  assert.match(compact, /^playwright_missing_checks: auth\.storage-state-boundary$/m);
  assert.match(compact, /^playwright_storage_state_sensitive: yes$/m);
  assert.match(compact, /^playwright_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^playwright_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^playwright_install_mutates_runtime: yes$/m);
  assert.match(compact, /^playwright_smoke_requires_operator_approval: no$/m);
  assert.match(compact, /^playwright_smoke_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^playwright_smoke_starts_browser: yes$/m);
  assert.match(compact, /^playwright_smoke_reads_browser_storage: no$/m);
  assert.match(compact, /^playwright_smoke_returns_page_content: no$/m);
  assert.match(compact, /^playwright_smoke_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>'$/m);
  assert.match(compact, /^selenium_install_requires_operator_approval: yes$/m);
  assert.match(compact, /^selenium_install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^selenium_install_mutates_runtime: yes$/m);
  assert.match(compact, /^selenium_smoke_requires_operator_approval: no$/m);
  assert.match(compact, /^selenium_smoke_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^selenium_smoke_starts_browser: no$/m);
  assert.match(compact, /^selenium_smoke_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
  assert.match(compact, /^selected_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^execution_allowed: no$/m);
  assert.match(compact, /^agent_unattended_allowed: no$/m);
  assert.match(compact, /^operator_approval_required: yes$/m);
  assert.match(compact, /^operator_approval_reasons: operator-input,capture-blocked$/m);
  assert.match(compact, /^command_opens_browser: no$/m);
  assert.match(compact, /^approval_command_opens_browser: no$/m);
  assert.match(compact, /^agent_task_recommended_command_id: auth-check-before-scrape$/m);
  assert.match(compact, /^agent_task_status: planned$/m);
  assert.match(compact, /^agent_task_execution_allowed: no$/m);
  assert.match(compact, /^agent_task_may_run_unattended: no$/m);
  assert.match(compact, /^agent_task_blocked_reason: target-auth-gate-blocked$/m);
  assert.match(compact, /^agent_task_auth_preflight_checked: yes$/m);
  assert.match(compact, /^agent_task_auth_preflight_parsed: no$/m);
  assert.match(compact, /^objective_primary: target-handoff-resume$/m);
  assert.match(compact, /^objective_primary_opens_browser: yes$/m);
  assert.match(compact, /^objective_primary_starts_capture: yes$/m);
  assert.match(compact, /^objective_primary_requires_operator_approval: yes$/m);
  assert.match(compact, /^objective_agent_must_not_run_primary_unattended: yes$/m);
  assert.match(compact, /^proof_pipeline_recommended_now: monitor-auth$/m);
  assert.match(compact, /^proof_pipeline_capture_allowed_now: no$/m);
  assert.match(compact, /^proof_pipeline_reopen_login_available: yes$/m);
  assert.match(compact, /^proof_pipeline_reopen_login_opens_browser: yes$/m);
  assert.match(compact, /^proof_pipeline_reopen_login_starts_capture: no$/m);
  assert.match(compact, /^proof_pipeline_reopen_login_requires_operator_approval: yes$/m);
  assert.match(compact, /^proof_pipeline_reopen_login_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^proof_pipeline_background_commands_operator_gated: yes$/m);
  assert.match(compact, /^objective_completion_audit_exists: yes$/m);
  assert.match(compact, /^objective_completion_audit_parse_ok: yes$/m);
  assert.match(compact, /^objective_completion_audit_stale: no$/m);
  assert.match(compact, /^objective_completion_audit_saved_status: incomplete$/m);
  assert.match(compact, /^objective_completion_audit_saved_complete: no$/m);
  assert.match(compact, /^objective_completion_audit_remaining_count: 1$/m);
  assert.match(compact, /^objective_completion_audit_remaining: real-external-auth-target$/m);
  assert.match(compact, /^objective_completion_audit_agent_safe_next_command_id: objective-completion-audit-strict$/m);
  assert.match(compact, /^objective_completion_audit_agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^objective_completion_audit_agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^objective_completion_audit_agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^target_approval_pack_exists: yes$/m);
  assert.match(compact, /^target_approval_pack_parse_ok: yes$/m);
  assert.match(compact, /^target_approval_candidate: github$/m);
  assert.match(compact, /^target_approval_target_pack_exists: yes$/m);
  assert.match(compact, /^target_approval_next: handoff-resume$/m);
  assert.match(compact, /^target_approval_human_action: complete-login-in-dedicated-profile$/m);
  assert.match(compact, /^target_approval_automation_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^target_approval_capture_blocked: yes$/m);
  assert.match(compact, /^target_approval_resume_status: planned$/m);
  assert.match(compact, /^target_approval_resume_ready_to_run: yes$/m);
  assert.match(compact, /^target_approval_resume_planned_opens_browser: yes$/m);
  assert.match(compact, /^target_approval_resume_planned_starts_capture: yes$/m);
  assert.match(compact, /^secret_run_command_id: target-login-capture$/m);
  assert.match(compact, /^secret_run_target_dir: runs\/target-packs\/acme$/m);
  assert.match(compact, /^secret_run_op_cli_available: yes$/m);
  assert.match(compact, /^secret_run_selected_candidate: service-account-env-file$/m);
  assert.match(compact, /^secret_run_selected_mode: service-account$/m);
  assert.match(compact, /^secret_run_headless: yes$/m);
  assert.match(compact, /^secret_run_ready_to_run_now: yes$/m);
  assert.match(compact, /^secret_run_setup_required: none$/m);
  assert.match(compact, /^secret_run_headless_config_available: yes$/m);
  assert.match(compact, /^secret_run_service_account_env_file_usable: yes$/m);
  assert.match(compact, /^secret_run_wrapped_opens_browser: yes$/m);
  assert.match(compact, /^secret_run_wrapped_starts_capture: yes$/m);
  assert.match(compact, /^secret_run_wrapped_requires_operator_approval: yes$/m);
  assert.match(compact, /^secret_run_wrapped_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_next_action: wait-operator-or-run-safe-preflight$/m);
  assert.match(compact, /^agent_next_can_run_without_approval: no$/m);
  assert.match(compact, /^agent_next_command_id: none$/m);
  assert.match(compact, /^agent_next_preflight_available: yes$/m);
  assert.match(compact, /^agent_next_preflight_may_run_without_approval: yes$/m);
  assert.match(compact, /^agent_next_proof_plan_available: yes$/m);
  assert.match(compact, /^agent_next_proof_plan_may_run_without_approval: yes$/m);
  assert.match(compact, /^agent_next_operator_approval_required: yes$/m);
  assert.match(compact, /^agent_next_operator_approval_preflight_opens_browser: no$/m);
  assert.match(compact, /^agent_next_operator_approval_preflight_starts_capture: no$/m);
  assert.match(compact, /^agent_next_operator_approval_proof_plan_opens_browser: no$/m);
  assert.match(compact, /^agent_next_operator_approval_proof_plan_starts_capture: no$/m);
  assert.match(compact, /^agent_next_operator_approval_opens_browser: yes$/m);
  assert.match(compact, /^agent_next_operator_approval_starts_capture: yes$/m);
  assert.match(compact, /^agent_next_operator_approval_agent_may_run_unattended: no$/m);
  assert.match(compact, /^backend_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'scrape' '--target-dir' 'runs\/target-packs\/acme' '--format' 'compact'$/m);
  assert.match(compact, /^workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'scrape' '--target-dir' 'runs\/target-packs\/acme' '--format' 'compact'$/m);
  assert.match(compact, /^selected_direct_command: 'node' 'src\/cli\.mjs' 'target-run' 'runs\/target-packs\/acme' 'observe' '--daemon'$/m);
  assert.match(compact, /^regular_chrome_status_command: 'node' 'src\/cli\.mjs' 'regular-chrome-status' '--format' 'compact'$/m);
  assert.match(compact, /^chrome_extension_backend_check_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-backend-check-plan' '--format' 'compact'$/m);
  assert.match(compact, /^chrome_extension_claim_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-claim-plan' '--backend-ready' 'unknown' '--intent' 'inspect' '--format' 'compact'$/m);
  assert.match(compact, /^objective_proof_pipeline_command: 'node' 'src\/cli\.mjs' 'objective-proof-pipeline' '--format' 'compact'$/m);
  assert.match(compact, /^objective_manual_candidates: handoff-resume-watch,auth-watch$/m);
  assert.match(compact, /^objective_manual_handoff_resume_watch_opens_browser: no$/m);
  assert.match(compact, /^objective_manual_handoff_resume_watch_starts_capture: yes$/m);
  assert.match(compact, /^objective_manual_handoff_resume_watch_requires_operator_approval: yes$/m);
  assert.match(compact, /^objective_manual_handoff_resume_watch_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^objective_manual_handoff_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch' 'runs\/target-packs\/acme' '--handoff' 'operator-handoff\.json' '--run' '--format' 'compact'$/m);
  assert.match(compact, /^objective_manual_auth_watch_opens_browser: no$/m);
  assert.match(compact, /^objective_manual_auth_watch_starts_capture: no$/m);
  assert.match(compact, /^objective_manual_auth_watch_requires_operator_approval: no$/m);
  assert.match(compact, /^objective_manual_auth_watch_agent_must_not_run_unattended: no$/m);
  assert.match(compact, /^proof_pipeline_monitor_auth_command: 'node' 'src\/cli\.mjs' 'target-auth-watch' '--timeout-ms' '10000' '--interval-ms' '1000' '--format' 'compact'$/m);
  assert.match(compact, /^proof_pipeline_reopen_login_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume' 'runs\/target-packs\/acme' '--handoff' 'operator-handoff\.json' '--run' '--open-login' '--format' 'compact'$/m);
  assert.match(compact, /^proof_pipeline_background_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status' '--format' 'compact'$/m);
  assert.match(compact, /^proof_pipeline_background_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_status_command: 'node' 'src\/cli\.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--include-compact-command-audit' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^secret_run_select_opens_browser: no$/m);
  assert.match(compact, /^secret_run_select_starts_capture: no$/m);
  assert.match(compact, /^secret_run_select_requires_operator_approval: no$/m);
  assert.match(compact, /^secret_run_select_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^secret_run_select_command: 'node' 'src\/cli\.mjs' 'secret-run-select' '--command' 'target-login-capture' '--target-dir' 'runs\/target-packs\/acme' '--format' 'compact'$/m);
  assert.match(compact, /^secret_run_wrapped_command: 'sh' '-lc' /m);
  assert.match(compact, /^agent_next_command: 'node' 'src\/cli\.mjs' 'agent-next' '--format' 'compact'$/m);
  assert.match(compact, /^agent_next_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^agent_next_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/acme' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^agent_next_operator_approval_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^agent_next_operator_approval_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_checklist_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_checklist_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_checklist_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist-status' '--in' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^completion_proof_bundle_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'$/m);
  assert.match(compact, /^completion_proof_bundle_write_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status' '--in' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_audit_write_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--write' '--out' 'operator\/objective-completion-audit-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_audit_status_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit-status' '--in' 'operator\/objective-completion-audit-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_audit_watch_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit-watch' '--run' '--in' 'operator\/objective-completion-audit-latest\.json' '--out' 'operator\/objective-completion-audit-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_audit_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_closeout_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--include-compact-command-audit' '--format' 'compact'$/m);
  assert.match(compact, /^agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
});

test('agent control plane preserves short monitor settings in control and proof commands', async () => {
  const status = await buildAgentControlPlane({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-31T00:00:00.000Z',
    task: 'auth-proof',
    mcpObservationIn: 'operator/chrome-mcp-observation-latest.json',
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000,
    readiness: {
      readyForLocalAuthenticatedDevelopment: true,
      completeAgainstObjective: false,
      requirements: [{ id: 'real-external-auth-target', status: 'manual-required' }]
    },
    providerDoctorStatus: {
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      adoptionNext: 'keep-direct-cdp-default',
      lightpanda: { readyForPublicBenchmark: false, missingChecks: [] },
      playwright: { readyForPublicSmoke: false, readyForAuthenticatedDefault: false, missingChecks: [] },
      selenium: { readyForLocalSmoke: false, missingChecks: [] }
    },
    backendSelection: {
      provider: 'duckduckgo',
      target: { available: true, dir: 'runs/target-packs/acme' },
      selection: {
        backend: 'direct-cdp-chrome',
        lane: 'target-pack-direct-cdp',
        agentInterface: 'secure-browser-agent-mcp',
        backendAvailable: true,
        canRunInBackground: true
      },
      safety: {
        executionAllowed: false,
        blockedReason: 'auth-check-before-auth-proof',
        operatorInput: true,
        captureBlocked: true
      },
      commands: {}
    },
    objectiveNext: {
      primaryAction: {
        id: 'target-handoff-resume',
        requirementId: 'real-external-auth-target',
        status: 'ready',
        needsOperatorInput: true,
        operatorGuidance: { captureBlocked: true }
      }
    },
    objectiveProofPipeline: {
      status: 'incomplete',
      decision: {
        recommendedNow: 'monitor-auth',
        proofCaptureAllowedNow: false,
        nextArtifactAction: 'wait-auth-then-capture-proof',
        nextArtifactBlocker: 'auth-check-not-ok'
      },
      phases: {
        monitorAuth: {
          available: true,
          command: cmd(['node', 'src/cli.mjs', 'target-auth-watch', '--timeout-ms', '10000', '--interval-ms', '1000', '--format', 'compact'])
        }
      },
      background: {
        monitorStartAvailable: true,
        captureStartAvailable: true,
        commandsAreOperatorGated: true,
        statusCommand: cmd(['node', 'src/cli.mjs', 'background-proof-capture-status', '--format', 'compact']),
        monitorStartCommand: cmd(['node', 'src/cli.mjs', 'background-proof-capture-start', '--mode', 'monitor', '--monitor-timeout-ms', '10000', '--monitor-interval-ms', '1000', '--run', '--operator-ok', 'OK', '--format', 'compact'])
      }
    }
  });

  const compact = formatAgentControlPlaneCompact(status);
  assert.match(compact, /^self_command: .*'--mcp-observation-in' 'operator\/chrome-mcp-observation-latest\.json'/m);
  assert.match(compact, /^self_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
  assert.match(compact, /^objective_next_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
  assert.match(compact, /^objective_proof_pipeline_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
});

test('agent control plane writes and status reads only runs-scoped JSON', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-control-plane-'));
  const status = {
    generatedAt: '2026-05-31T00:00:00.000Z',
    safeMode: true,
    statusOnly: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    task: 'search',
    readiness: {
      readyForLocalAuthenticatedDevelopment: true,
      completeAgainstObjective: false,
      remaining: ['real-external-auth-target']
    },
    provider: {
      defaultBackend: 'direct-cdp-chrome'
    },
    backendSelection: {
      backend: 'direct-cdp-chrome',
      lane: 'direct-cdp-public',
      executionAllowed: true,
      blockedReason: ''
    },
    agentTask: {
      recommendedCommandId: 'public-search',
      status: 'planned',
      executionAllowed: true,
      blockedReason: '',
      authPreflightChecked: false
    },
    objectiveNext: {
      primary: 'target-handoff-resume'
    },
    proofPipeline: {
      recommendedNow: 'monitor-auth'
    },
    agentNext: {
      action: 'wait-operator-or-run-safe-preflight',
      canRunWithoutApproval: false,
      commandId: 'none',
      preflightAvailable: true,
      preflightMayRunWithoutApproval: true,
      proofPlanAvailable: true,
      proofPlanMayRunWithoutApproval: true,
      operatorApprovalRequired: true,
      operatorApprovalOpensBrowser: true,
      operatorApprovalStartsCapture: true,
      operatorApprovalAgentMayRunUnattended: false
    },
    targetApproval: {
      selectedCandidate: 'github',
      resumeStatus: 'planned',
      resumeReadyToRun: true,
      resumePlannedCommandOpensBrowser: true,
      resumePlannedCommandStartsCapture: true,
      resumeRequiresOperatorApproval: true,
      resumeAgentMayRunUnattended: false
    },
    objectiveCompletionAudit: {
      exists: true,
      parseOk: true,
      stale: false,
      savedComplete: false,
      savedStatus: 'incomplete',
      remainingCount: 1,
      remaining: ['real-external-auth-target'],
      refreshNeeded: false,
      agentSafeNextCommandId: 'objective-completion-audit-strict',
      agentSafeNextMayRunUnattended: true,
      agentSafeNextOpensBrowser: false,
      agentSafeNextStartsCapture: false,
      agentSafeNextReadsBrowserStorage: false,
      agentSafeNextReturnsPageContent: false
    },
    secretRun: {
      commandId: 'target-login-capture',
      targetDir: 'runs/target-packs/github',
      selectedCandidate: 'service-account-env-file',
      selectedMode: 'service-account',
      headless: true,
      readyToRunNow: true,
      setupRequired: [],
      runCommandSafety: {
        opensBrowser: true,
        startsCapture: true,
        startsBackground: false,
        requiresOperatorApproval: true,
        agentMayRunUnattended: false
      }
    },
    commands: {
      agentNext: {
        shell: "'node' 'src/cli.mjs' 'agent-next' '--format' 'compact'"
      },
      agentNextPreflight: {
        shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      agentNextProofPlan: cmd(['node', 'src/cli.mjs', 'target-proof-plan', path.join(rootDir, 'runs/target-packs/github'), '--real-external', '--format', 'compact']),
      agentNextOperatorApprovalPlan: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      agentNextOperatorApproval: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      },
      targetApprovalResumeRun: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      },
      objectiveCompletionAuditWrite: {
        shell: "'node' 'src/cli.mjs' 'objective-completion-audit' '--write' '--out' 'operator/objective-completion-audit-latest.json' '--format' 'compact'"
      },
      objectiveCompletionAuditStatus: {
        shell: "'node' 'src/cli.mjs' 'objective-completion-audit-status' '--in' 'operator/objective-completion-audit-latest.json' '--format' 'compact'"
      },
      objectiveCompletionAuditWatch: {
        shell: "'node' 'src/cli.mjs' 'objective-completion-audit-watch' '--run' '--in' 'operator/objective-completion-audit-latest.json' '--out' 'operator/objective-completion-audit-latest.json' '--format' 'compact'"
      },
      objectiveCompletionAuditStrict: {
        shell: "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'"
      },
      secretRunSelect: {
        shell: "'node' 'src/cli.mjs' 'secret-run-select' '--command' 'target-login-capture' '--target-dir' 'runs/target-packs/github' '--format' 'compact'"
      },
      secretRunWrapped: {
        shell: "'op' 'run' '--' 'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/github' '--real-external' '--format' 'markdown'"
      }
    }
  };

  const relative = writeAgentControlPlane(rootDir, status, 'operator/control.json');
  assert.equal(relative, 'operator/control.json');
  assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/control.json')), true);

  const saved = buildAgentControlPlaneStatus({
    rootDir,
    in: 'operator/control.json',
    nowMs: fs.statSync(path.join(rootDir, 'runs/operator/control.json')).mtimeMs,
    staleAfterSeconds: 900
  });
  assert.equal(saved.exists, true);
  assert.equal(saved.parseOk, true);
  assert.equal(saved.stale, false);
  assert.equal(saved.saved.task, 'search');
  assert.equal(saved.saved.defaultBackend, 'direct-cdp-chrome');
  assert.equal(saved.saved.selectedBackend, 'direct-cdp-chrome');
  assert.equal(saved.saved.agentTaskRecommendedCommandId, 'public-search');
  assert.equal(saved.saved.agentTaskStatus, 'planned');
  assert.equal(saved.saved.agentTaskExecutionAllowed, true);
  assert.equal(saved.saved.agentTaskBlockedReason, '');
  assert.equal(saved.saved.agentTaskAuthPreflightChecked, false);
  assert.equal(saved.saved.objectivePrimary, 'target-handoff-resume');
  assert.equal(saved.saved.agentNextAction, 'wait-operator-or-run-safe-preflight');
  assert.equal(saved.saved.agentNextCanRunWithoutApproval, false);
  assert.equal(saved.saved.agentNextCommandId, 'none');
  assert.equal(saved.saved.agentNextPreflightAvailable, true);
  assert.equal(saved.saved.agentNextPreflightMayRunWithoutApproval, true);
  assert.equal(saved.saved.agentNextProofPlanAvailable, true);
  assert.equal(saved.saved.agentNextProofPlanMayRunWithoutApproval, true);
  assert.equal(saved.saved.agentNextOperatorApprovalRequired, true);
  assert.equal(saved.saved.agentNextOperatorApprovalOpensBrowser, true);
  assert.equal(saved.saved.agentNextOperatorApprovalStartsCapture, true);
  assert.equal(saved.saved.agentNextOperatorApprovalAgentMayRunUnattended, false);
  assert.equal(saved.saved.agentNextCommand.shell, "'node' 'src/cli.mjs' 'agent-next' '--format' 'compact'");
  assert.equal(saved.saved.agentNextPreflightCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(saved.saved.agentNextProofPlanCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");
  assert.equal(saved.saved.agentNextOperatorApprovalPlanCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(saved.saved.agentNextOperatorApprovalCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'");
  assert.equal(saved.saved.objectiveCompletionAuditSavedStatus, 'incomplete');
  assert.equal(saved.saved.objectiveCompletionAuditSavedComplete, false);
  assert.equal(saved.saved.objectiveCompletionAuditRemainingCount, 1);
  assert.deepEqual(saved.saved.objectiveCompletionAuditRemaining, ['real-external-auth-target']);
  assert.equal(saved.saved.objectiveCompletionAuditAgentSafeNextCommandId, 'objective-completion-audit-strict');
  assert.equal(saved.saved.objectiveCompletionAuditAgentSafeNextMayRunUnattended, true);
  assert.equal(saved.saved.objectiveCompletionAuditAgentSafeNextOpensBrowser, false);
  assert.equal(saved.saved.objectiveCompletionAuditAgentSafeNextStartsCapture, false);
  assert.equal(saved.saved.objectiveCompletionAuditWriteCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--write' '--out' 'operator/objective-completion-audit-latest.json' '--format' 'compact'");
  assert.equal(saved.saved.objectiveCompletionAuditStatusCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit-status' '--in' 'operator/objective-completion-audit-latest.json' '--format' 'compact'");
  assert.equal(saved.saved.objectiveCompletionAuditWatchCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit-watch' '--run' '--in' 'operator/objective-completion-audit-latest.json' '--out' 'operator/objective-completion-audit-latest.json' '--format' 'compact'");
  assert.equal(saved.saved.objectiveCompletionAuditStrictCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");
  assert.equal(saved.saved.targetApprovalCandidate, 'github');
  assert.equal(saved.saved.targetApprovalResumeStatus, 'planned');
  assert.equal(saved.saved.targetApprovalResumeReadyToRun, true);
  assert.equal(saved.saved.targetApprovalResumePlannedOpensBrowser, true);
  assert.equal(saved.saved.targetApprovalResumePlannedStartsCapture, true);
  assert.equal(saved.saved.targetApprovalResumeRequiresOperatorApproval, true);
  assert.equal(saved.saved.targetApprovalResumeAgentMayRunUnattended, false);
  assert.equal(saved.saved.targetApprovalResumeRunCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'");
  assert.equal(saved.saved.targetApprovalCompletionProofBundleWithAuditCommand.shell, "'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator/completion-proof-bundle-latest.json' '--format' 'compact'");
  assert.equal(saved.saved.targetApprovalAgentProofCloseoutWriteCommand.shell, "'node' 'src/cli.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator/agent-proof-closeout-latest.json' '--include-compact-command-audit' '--format' 'compact'");
  assert.equal(saved.saved.targetApprovalAgentProofCloseoutStatusCommand.shell, "'node' 'src/cli.mjs' 'agent-proof-closeout-status' '--in' 'operator/agent-proof-closeout-latest.json' '--format' 'compact'");
  assert.equal(saved.saved.targetApprovalObjectiveCompletionStrictCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");
  assert.equal(saved.saved.secretRunCommandId, 'target-login-capture');
  assert.equal(saved.saved.secretRunTargetDir, 'runs/target-packs/github');
  assert.equal(saved.saved.secretRunSelectedCandidate, 'service-account-env-file');
  assert.equal(saved.saved.secretRunSelectedMode, 'service-account');
  assert.equal(saved.saved.secretRunHeadless, true);
  assert.equal(saved.saved.secretRunReadyToRunNow, true);
  assert.deepEqual(saved.saved.secretRunSetupRequired, []);
  assert.equal(saved.saved.secretRunWrappedOpensBrowser, true);
  assert.equal(saved.saved.secretRunWrappedStartsCapture, true);
  assert.equal(saved.saved.secretRunWrappedRequiresOperatorApproval, true);
  assert.equal(saved.saved.secretRunWrappedAgentMayRunUnattended, false);
  assert.equal(saved.saved.secretRunSelectCommand.shell, "'node' 'src/cli.mjs' 'secret-run-select' '--command' 'target-login-capture' '--target-dir' 'runs/target-packs/github' '--format' 'compact'");
  assert.equal(saved.saved.secretRunWrappedCommand.shell, "'op' 'run' '--' 'node' 'src/cli.mjs' 'target-login-capture' 'runs/target-packs/github' '--real-external' '--format' 'markdown'");
  assert.equal(saved.agentSafeNextCommandId, 'target-approval-preflight');
  assert.equal(saved.agentSafeNextMayRunUnattended, true);
  assert.equal(saved.agentSafeNextOpensBrowser, false);
  assert.equal(saved.agentSafeNextStartsCapture, false);
  assert.equal(saved.agentSafeNextReadsBrowserStorage, false);
  assert.equal(saved.agentSafeNextReturnsPageContent, false);
  assert.equal(saved.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");

  const compact = formatAgentControlPlaneStatusCompact(saved);
  assert.match(compact, /^status_only: yes$/m);
  assert.match(compact, /^path: operator\/control\.json$/m);
  assert.match(compact, /^exists: yes$/m);
  assert.match(compact, /^parse_ok: yes$/m);
  assert.match(compact, /^stale: no$/m);
  assert.match(compact, /^task: search$/m);
  assert.match(compact, /^selected_backend: direct-cdp-chrome$/m);
  assert.match(compact, /^agent_task_recommended_command_id: public-search$/m);
  assert.match(compact, /^agent_task_status: planned$/m);
  assert.match(compact, /^agent_task_execution_allowed: yes$/m);
  assert.match(compact, /^agent_task_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_task_blocked_reason: none$/m);
  assert.match(compact, /^agent_task_auth_preflight_checked: no$/m);
  assert.match(compact, /^agent_next_action: wait-operator-or-run-safe-preflight$/m);
  assert.match(compact, /^agent_next_can_run_without_approval: no$/m);
  assert.match(compact, /^agent_next_command_id: none$/m);
  assert.match(compact, /^agent_next_preflight_available: yes$/m);
  assert.match(compact, /^agent_next_preflight_may_run_without_approval: yes$/m);
  assert.match(compact, /^agent_next_proof_plan_available: yes$/m);
  assert.match(compact, /^agent_next_proof_plan_may_run_without_approval: yes$/m);
  assert.match(compact, /^agent_next_operator_approval_required: yes$/m);
  assert.match(compact, /^agent_next_operator_approval_opens_browser: yes$/m);
  assert.match(compact, /^agent_next_operator_approval_starts_capture: yes$/m);
  assert.match(compact, /^agent_next_operator_approval_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_next_command: 'node' 'src\/cli\.mjs' 'agent-next' '--format' 'compact'$/m);
  assert.match(compact, /^agent_next_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^agent_next_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^agent_next_operator_approval_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^agent_next_operator_approval_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
  assert.match(compact, /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_audit_saved_status: incomplete$/m);
  assert.match(compact, /^objective_completion_audit_saved_complete: no$/m);
  assert.match(compact, /^objective_completion_audit_remaining_count: 1$/m);
  assert.match(compact, /^objective_completion_audit_remaining: real-external-auth-target$/m);
  assert.match(compact, /^objective_completion_audit_agent_safe_next_command_id: objective-completion-audit-strict$/m);
  assert.match(compact, /^objective_completion_audit_agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^objective_completion_audit_agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^objective_completion_audit_agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^objective_completion_audit_write_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--write' '--out' 'operator\/objective-completion-audit-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_audit_status_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit-status' '--in' 'operator\/objective-completion-audit-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_audit_watch_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit-watch' '--run' '--in' 'operator\/objective-completion-audit-latest\.json' '--out' 'operator\/objective-completion-audit-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^objective_completion_audit_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_candidate: github$/m);
  assert.match(compact, /^target_approval_resume_status: planned$/m);
  assert.match(compact, /^target_approval_resume_ready_to_run: yes$/m);
  assert.match(compact, /^target_approval_resume_planned_opens_browser: yes$/m);
  assert.match(compact, /^target_approval_resume_planned_starts_capture: yes$/m);
  assert.match(compact, /^target_approval_resume_requires_operator_approval: yes$/m);
  assert.match(compact, /^target_approval_resume_agent_may_run_unattended: no$/m);
  assert.match(compact, /^secret_run_command_id: target-login-capture$/m);
  assert.match(compact, /^secret_run_target_dir: runs\/target-packs\/github$/m);
  assert.match(compact, /^secret_run_selected_candidate: service-account-env-file$/m);
  assert.match(compact, /^secret_run_selected_mode: service-account$/m);
  assert.match(compact, /^secret_run_headless: yes$/m);
  assert.match(compact, /^secret_run_ready_to_run_now: yes$/m);
  assert.match(compact, /^secret_run_setup_required: none$/m);
  assert.match(compact, /^secret_run_wrapped_opens_browser: yes$/m);
  assert.match(compact, /^secret_run_wrapped_starts_capture: yes$/m);
  assert.match(compact, /^secret_run_wrapped_requires_operator_approval: yes$/m);
  assert.match(compact, /^secret_run_wrapped_agent_may_run_unattended: no$/m);
  assert.match(compact, /^agent_safe_next_command_id: target-approval-preflight$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(compact, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume'.*'--operator-ok' 'OK'/m);
  assert.match(compact, /^secret_run_select_opens_browser: no$/m);
  assert.match(compact, /^secret_run_select_requires_operator_approval: no$/m);
  assert.match(compact, /^secret_run_select_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^secret_run_select_command: 'node' 'src\/cli\.mjs' 'secret-run-select' '--command' 'target-login-capture' '--target-dir' 'runs\/target-packs\/github' '--format' 'compact'$/m);
  assert.match(compact, /^secret_run_wrapped_command: 'op' 'run' '--' 'node' 'src\/cli\.mjs' 'target-login-capture' 'runs\/target-packs\/github'/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-control-plane' '--write' '--out' 'operator\/control\.json' '--format' 'compact'$/m);

  const stale = buildAgentControlPlaneStatus({
    rootDir,
    in: 'operator/control.json',
    nowMs: fs.statSync(path.join(rootDir, 'runs/operator/control.json')).mtimeMs + 1000000,
    staleAfterSeconds: 1
  });
  assert.equal(stale.stale, true);
  assert.equal(stale.agentSafeNextCommandId, 'agent-control-plane-refresh');
  assert.equal(stale.agentSafeNextMayRunUnattended, true);
  assert.equal(stale.agentSafeNextOpensBrowser, false);
  assert.equal(stale.agentSafeNextStartsCapture, false);
  assert.equal(stale.agentSafeNextReadsBrowserStorage, false);
  assert.equal(stale.agentSafeNextReturnsPageContent, false);
  assert.equal(stale.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'agent-control-plane' '--write' '--out' 'operator/control.json' '--format' 'compact'");
  const staleCompact = formatAgentControlPlaneStatusCompact(stale);
  assert.match(staleCompact, /^agent_safe_next_command_id: agent-control-plane-refresh$/m);
  assert.match(staleCompact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(staleCompact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-control-plane' '--write' '--out' 'operator\/control\.json' '--format' 'compact'$/m);

  assert.throws(() => writeAgentControlPlane(rootDir, status, '../outside.json'), /invalid agent control plane output path/);
  assert.throws(() => buildAgentControlPlaneStatus({ rootDir, in: '../outside.json' }), /invalid agent control plane input path/);
});

test('agent control plane status exposes safe refresh for missing saved decisions', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-control-plane-missing-'));
  const status = buildAgentControlPlaneStatus({
    rootDir,
    in: 'operator/missing-control.json'
  });

  assert.equal(status.exists, false);
  assert.equal(status.stale, true);
  assert.equal(status.agentSafeNextCommandId, 'agent-control-plane-refresh');
  assert.equal(status.agentSafeNextMayRunUnattended, true);
  assert.equal(status.agentSafeNextOpensBrowser, false);
  assert.equal(status.agentSafeNextStartsCapture, false);
  assert.equal(status.agentSafeNextReadsBrowserStorage, false);
  assert.equal(status.agentSafeNextReturnsPageContent, false);
  assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'agent-control-plane' '--write' '--out' 'operator/missing-control.json' '--format' 'compact'");

  const compact = formatAgentControlPlaneStatusCompact(status);
  assert.match(compact, /^exists: no$/m);
  assert.match(compact, /^stale: yes$/m);
  assert.match(compact, /^agent_safe_next_command_id: agent-control-plane-refresh$/m);
  assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
  assert.match(compact, /^agent_safe_next_opens_browser: no$/m);
  assert.match(compact, /^agent_safe_next_starts_capture: no$/m);
  assert.match(compact, /^agent_safe_next_reads_browser_storage: no$/m);
  assert.match(compact, /^agent_safe_next_returns_page_content: no$/m);
  assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-control-plane' '--write' '--out' 'operator\/missing-control\.json' '--format' 'compact'$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-control-plane' '--write' '--out' 'operator\/missing-control\.json' '--format' 'compact'$/m);
});

test('agent control plane status infers legacy target approval resume safety conservatively', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-control-plane-legacy-'));
  const status = {
    generatedAt: '2026-05-31T00:00:00.000Z',
    task: 'auth-proof',
    readiness: {
      readyForLocalAuthenticatedDevelopment: true,
      completeAgainstObjective: false,
      remaining: ['real-external-auth-target']
    },
    targetApproval: {
      selectedCandidate: 'github',
      resumeStatus: 'planned',
      resumeReadyToRun: true
    },
    commands: {
      targetApprovalResumeRun: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      }
    }
  };
  writeAgentControlPlane(rootDir, status, 'operator/legacy-control.json');

  const saved = buildAgentControlPlaneStatus({
    rootDir,
    in: 'operator/legacy-control.json',
    nowMs: fs.statSync(path.join(rootDir, 'runs/operator/legacy-control.json')).mtimeMs,
    staleAfterSeconds: 900
  });

  assert.equal(saved.saved.targetApprovalResumePlannedOpensBrowser, true);
  assert.equal(saved.saved.targetApprovalResumePlannedStartsCapture, true);
  assert.equal(saved.saved.targetApprovalResumeRequiresOperatorApproval, true);
  assert.equal(saved.saved.targetApprovalResumeAgentMayRunUnattended, false);

  const compact = formatAgentControlPlaneStatusCompact(saved);
  assert.match(compact, /^target_approval_resume_planned_opens_browser: yes$/m);
  assert.match(compact, /^target_approval_resume_planned_starts_capture: yes$/m);
  assert.match(compact, /^target_approval_resume_requires_operator_approval: yes$/m);
  assert.match(compact, /^target_approval_resume_agent_may_run_unattended: no$/m);
});

test('agent control plane watch refreshes stale saved JSON without browser or capture work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-agent-control-plane-watch-'));
  const staleStatus = {
    generatedAt: '2026-05-31T00:00:00.000Z',
    task: 'search',
    readiness: {
      readyForLocalAuthenticatedDevelopment: true,
      completeAgainstObjective: false,
      remaining: ['real-external-auth-target']
    },
    provider: { defaultBackend: 'direct-cdp-chrome' },
    backendSelection: {
      backend: 'direct-cdp-chrome',
      lane: 'direct-cdp-public',
      executionAllowed: true
    },
    objectiveNext: { primary: 'target-handoff-resume' },
    proofPipeline: { recommendedNow: 'monitor-auth' }
  };
  writeAgentControlPlane(rootDir, staleStatus, 'operator/control-watch.json');
  const filePath = path.join(rootDir, 'runs/operator/control-watch.json');
  const oldTime = new Date('2026-05-31T00:00:00.000Z');
  fs.utimesSync(filePath, oldTime, oldTime);

  const watch = await buildAgentControlPlaneWatch({
    rootDir,
    run: true,
    in: 'operator/control-watch.json',
    out: 'operator/control-watch.json',
    staleAfterSeconds: 1,
    nowMs: Date.parse('2026-05-31T00:10:00.000Z'),
    task: 'search',
    generatedAt: '2026-05-31T00:10:00.000Z',
    readiness: {
      readyForLocalAuthenticatedDevelopment: true,
      completeAgainstObjective: false,
      requirements: [{ id: 'real-external-auth-target', status: 'manual-required' }]
    },
    providerDoctorStatus: {
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      adoptionNext: 'keep-direct-cdp-default',
      lightpanda: { readyForPublicBenchmark: false, missingChecks: [] },
      playwright: { readyForPublicSmoke: false, readyForAuthenticatedDefault: false, missingChecks: [] },
      selenium: { readyForLocalSmoke: false, missingChecks: [] }
    },
    backendSelection: {
      query: '',
      provider: 'duckduckgo',
      target: { available: false, dir: '' },
      selection: {
        backend: 'direct-cdp-chrome',
        lane: 'direct-cdp-public',
        agentInterface: 'secure-browser-agent-mcp',
        backendAvailable: true,
        canRunInBackground: true
      },
      safety: {
        executionAllowed: true,
        blockedReason: '',
        operatorInput: false,
        captureBlocked: false
      },
      commands: {}
    },
    objectiveNext: {
      primaryAction: {
        id: 'target-handoff-resume',
        requirementId: 'real-external-auth-target',
        status: 'ready',
        needsOperatorInput: true,
        operatorGuidance: { captureBlocked: true }
      }
    },
    objectiveProofPipeline: {
      status: 'incomplete',
      decision: {
        recommendedNow: 'monitor-auth',
        proofCaptureAllowedNow: false
      },
      phases: {},
      background: { commandsAreOperatorGated: true }
    }
  });

  assert.equal(watch.executed, true);
  assert.equal(watch.status, 'refreshed');
  assert.equal(watch.opensBrowserNow, false);
  assert.equal(watch.startsCaptureNow, false);
  assert.equal(watch.statusAfter.exists, true);
  assert.equal(watch.statusAfter.saved.task, 'search');

  const compact = formatAgentControlPlaneWatchCompact(watch);
  assert.match(compact, /^run_requested: yes$/m);
  assert.match(compact, /^executed: yes$/m);
  assert.match(compact, /^status: refreshed$/m);
  assert.match(compact, /^after_task: search$/m);
  assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'agent-control-plane-watch' '--run' '--in' 'operator\/control-watch\.json' '--out' 'operator\/control-watch\.json' '--stale-after-seconds' '1' '--task' 'search' '--format' 'compact'$/m);

  const freshWatch = await buildAgentControlPlaneWatch({
    rootDir,
    run: true,
    in: 'operator/control-watch.json',
    out: 'operator/control-watch.json',
    staleAfterSeconds: 900
  });
  assert.equal(freshWatch.executed, false);
  assert.equal(freshWatch.status, 'fresh');
  assert.equal(freshWatch.blockedReason, 'saved-control-plane-is-fresh');

  const missingWatch = await buildAgentControlPlaneWatch({
    rootDir,
    in: 'operator/missing-control-watch.json',
    staleAfterSeconds: 900
  });
  assert.equal(missingWatch.runRequested, false);
  assert.equal(missingWatch.executed, false);
  assert.equal(missingWatch.status, 'stale');
  assert.equal(missingWatch.allowedToRun, false);
  assert.equal(missingWatch.opensBrowserNow, false);
  assert.equal(missingWatch.startsCaptureNow, false);
  assert.equal(missingWatch.readsBrowserStorage, false);

  await assert.rejects(
    () => buildAgentControlPlaneWatch({ rootDir, in: '../outside.json' }),
    /invalid agent control plane input path/
  );
  await assert.rejects(
    () => buildAgentControlPlaneWatch({ rootDir, out: '../outside.json' }),
    /invalid agent control plane output path/
  );
});
