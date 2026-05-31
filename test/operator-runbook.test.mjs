import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperatorRunbook, buildOperatorRunbookStatus, buildOperatorRunbookWatch, formatOperatorRunbookCompact, formatOperatorRunbookMarkdown, formatOperatorRunbookStatusCompact, formatOperatorRunbookWatchCompact } from '../src/operator-runbook.mjs';

function operatorPackFixture(rootDir) {
  return {
    complete: false,
    status: 'waiting-for-login',
    target: 'github',
    targetDir: path.join(rootDir, 'runs/target-packs/github'),
    operatorInput: true,
    operatorGuidance: {
      humanAction: 'complete-login-in-open-dedicated-browser',
      automationBlocker: 'auth-check-not-ok',
      captureBlocked: true
    },
    authState: 'metadata-only-login-like',
    authUsable: false,
    profileAuthMetadataOnly: true,
    handoffAuthCheckPort: '59036',
    handoffAuthCheckPortReachable: true,
    missingArtifactCount: 6,
    acceptedExternalProofCount: 0,
    proofGateArtifactAction: {
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'auth-check-not-ok',
      artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof']
    },
    loginHandoff: {
      status: 'waiting-for-login',
      nextAction: 'monitor-login',
      loginRequired: true,
      authUsable: false,
      safeMonitorAvailable: true,
      safeMonitorOnly: true,
      dedicatedBrowserPort: '59036',
      dedicatedBrowserReachable: true,
      opensBrowserNow: false,
      startsCaptureNow: false,
      captureAllowedNow: false,
      proofCaptureBlockedUntilAuth: true,
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'login-handoff-status' '--format' 'compact'"
      }
    },
    browserRoute: {
      selectedLane: 'target-pack-direct-cdp',
      backend: 'direct-cdp-chrome',
      profileMode: 'dedicated-target-profile',
      userPermissionRequired: true,
      commandOpensBrowser: false,
      commandRunOnlyAfterUserSays: '',
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'authenticated-scrape' '--format' 'compact'"
      }
    },
    backendMatrix: {
      status: 'fresh',
      exists: true,
      stale: false,
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      searchBackend: 'direct-cdp-chrome',
      analyzeBackend: 'direct-cdp-chrome',
      scrapeBackend: 'direct-cdp-chrome',
      operateBackend: 'direct-cdp-chrome',
      authenticatedBackend: 'direct-cdp-chrome',
      existingTabBackend: 'codex-chrome-extension',
      publicCrawlBackend: 'direct-cdp-chrome',
      compatibilityBackend: 'direct-cdp-chrome',
      regularChromeStatus: 'not-ready',
      chromeMcpRouteReady: false,
      chromeMcpListPagesTimedOut: true,
      backendCount: 8,
      savedSecretValuesRead: false,
      savedDestructiveActions: false,
      refreshCommand: {
        shell: "'node' 'src/cli.mjs' 'backend-matrix' '--write' '--out' 'operator/backend-matrix-latest.json' '--format' 'compact'"
      },
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'backend-matrix-status' '--in' 'operator/backend-matrix-latest.json' '--format' 'compact'"
      }
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
    },
    proofPipeline: {
      status: 'waiting-for-login',
      recommendedNow: 'monitor-auth',
      proofCaptureAllowedNow: false,
      waitAuthThenCaptureAvailable: true,
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'auth-check-not-ok',
      missingArtifactCount: 6,
      monitorAuthAvailable: true,
      monitorAuthOpensBrowser: false,
      monitorAuthStartsCapture: false,
      openLoginAvailable: false,
      waitCaptureOpensBrowser: true,
      waitCaptureWaitsForAuth: true,
      waitCaptureStartsCapture: true,
      waitCaptureNoOpenAvailable: true,
      waitCaptureNoOpenOpensBrowser: false,
      waitCaptureNoOpenWaitsForAuth: true,
      waitCaptureNoOpenStartsCapture: true,
      command: {
        shell: "'node' 'src/cli.mjs' 'objective-proof-pipeline' '--format' 'compact'"
      },
      monitorAuthCommand: {
        shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'"
      },
      waitCaptureCommand: {
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth'"
      },
      waitCaptureNoOpenCommand: {
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--wait-auth'"
      }
    },
    targetApproval: {
      approvalPackExists: true,
      approvalPackParseOk: true,
      selectedCandidate: 'github',
      targetNext: 'handoff-resume',
      resumeStatus: 'planned',
      resumeReadyToRun: true,
      resumePlannedCommandOpensBrowser: true,
      resumePlannedCommandStartsCapture: true,
      preflightCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      resumeRunCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      }
    },
    backgroundProofCapture: {
      planStatus: 'waiting-for-login',
      captureBlocked: true,
      backgroundMonitorAvailable: true,
      backgroundCaptureAvailable: true,
      monitorRunning: false,
      captureRunning: false,
      captureStartReadyToRun: false,
      captureStartBlockers: ['operator-ok-required'],
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'background-proof-capture-status' '--format' 'compact'"
      },
      noOpenWaitCaptureCommand: {
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--wait-auth'"
      },
      backgroundNoOpenWaitCaptureCommand: {
        shell: "mkdir -p 'runs/operator' && nohup 'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--wait-auth' > 'runs/operator/background-proof-capture.log' 2>&1 & echo $! > 'runs/operator/background-proof-capture.pid'"
      },
      captureStartCommand: {
        shell: "'node' 'src/cli.mjs' 'background-proof-capture-start' '--mode' 'capture' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      },
      monitorStartCommand: {
        shell: "'node' 'src/cli.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      }
    },
    executionPolicy: {
      agentLoopStepStatusCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-loop-step-status' '--in' 'operator/agent-loop-step-latest.json' '--format' 'compact'"
      }
    },
    agentLoopStepStatus: {
      exists: true,
      stale: false,
      status: 'planned',
      nextAction: 'monitor-auth-watch',
      recommendedCommandId: 'run-agent-loop-step',
      commandId: 'auth-watch',
      allowedToRun: true,
      executed: false,
      opensBrowserNow: false,
      startsCaptureNow: false,
      recommendedCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator/agent-loop-step-latest.json' '--timeout-ms' '300000' '--format' 'compact'"
      }
    },
    agentProofChecklist: {
      complete: false,
      verdict: 'not-complete',
      candidate: 'github',
      readinessRemainingCount: 1,
      readinessRemaining: ['real-external-auth-target'],
      authState: 'metadata-only-login-like',
      authUsable: false,
      captureBlocked: true,
      automationBlocker: 'auth-check-not-ok',
      operatorApprovalRequired: true,
      operatorApprovalToken: 'OK',
      operatorCommandOpensBrowser: true,
      operatorCommandStartsCapture: true,
      agentMustNotRunOperatorResumeUnattended: true,
      command: {
        shell: "'node' 'src/cli.mjs' 'agent-proof-checklist' '--candidate' 'github' '--format' 'compact'"
      },
      writeCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator/agent-proof-checklist-latest.json' '--format' 'compact'"
      },
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-proof-checklist-status' '--in' 'operator/agent-proof-checklist-latest.json' '--format' 'compact'"
      },
      operatorResumeCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      }
    },
    agentProofCloseout: {
      complete: false,
      verdict: 'not-complete',
      candidate: 'github',
      readinessRemainingCount: 1,
      readinessRemaining: ['real-external-auth-target'],
      authState: 'metadata-only-login-like',
      authUsable: false,
      captureBlocked: true,
      automationBlocker: 'auth-check-not-ok',
      acceptedExternalProofs: 0,
      checklistExists: true,
      checklistParseOk: true,
      providerDefaultBackend: 'direct-cdp-chrome',
      providerDefaultAgentInterface: 'secure-browser-agent-mcp',
      providerPlaywrightReadyForPublicSmoke: false,
      providerPlaywrightReadyForAuthenticatedDefault: false,
      providerPlaywrightStorageStateSensitive: false,
      providerDoctorOpensBrowser: false,
      providerDoctorStartsCapture: false,
      providerDoctorReadsBrowserStorage: false,
      providerDoctorReturnsPageContent: false,
      providerDoctorMayRunUnattended: true,
      command: {
        shell: "'node' 'src/cli.mjs' 'agent-proof-closeout' '--candidate' 'github' '--format' 'compact'"
      },
      writeCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator/agent-proof-closeout-latest.json' '--format' 'compact'"
      },
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-proof-closeout-status' '--in' 'operator/agent-proof-closeout-latest.json' '--format' 'compact'"
      },
      checklistRefreshCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator/agent-proof-checklist-latest.json' '--format' 'compact'"
      },
      checklistStatusCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-proof-checklist-status' '--in' 'operator/agent-proof-checklist-latest.json' '--format' 'compact'"
      },
      completionProofBundleCommand: {
        shell: "'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator/completion-proof-bundle-latest.json' '--format' 'compact'"
      },
      completionProofBundleStatusCommand: {
        shell: "'node' 'src/cli.mjs' 'completion-proof-bundle-status' '--in' 'operator/completion-proof-bundle-latest.json' '--format' 'compact'"
      },
      objectiveCompletionCommand: {
        shell: "'node' 'src/cli.mjs' 'objective-completion-audit' '--format' 'compact'"
      },
      agentSafeNextCommand: {
        shell: "'node' 'src/cli.mjs' 'agent-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      targetApprovalPreflightCommand: {
        shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
      },
      providerDoctorStatusCommand: {
        shell: "'node' 'src/cli.mjs' 'provider-doctor-status' '--format' 'compact'"
      }
    },
    regularChrome: {
      userPermissionRequired: true,
      operatorOkRequired: true,
      resumeCommand: {
        shell: "'node' 'src/cli.mjs' 'chrome-extension-resume' '--format' 'compact'"
      },
      approvalCommand: {
        shell: "'node' 'src/cli.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      }
    },
    secrets: {
      requiresOnePasswordApproval: true
    },
    nextAction: {
      command: {
        shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth'"
      }
    },
    summaries: {
      objectiveHandoff: {
        commands: [
          { id: 'proof-gate-watch', shell: "'node' 'src/cli.mjs' 'proof-gate-watch' '--write' '--format' 'compact'" },
          { id: 'manual-candidate-auth-watch', shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'" },
          { id: 'completion-audit', shell: "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'markdown'" }
        ]
      },
      proofGateStatus: {
        missingArtifacts: [
          { id: 'auth-check', detail: 'target auth check has not passed' }
        ]
      }
    },
    files: {}
  };
}

function packBuilderFixtures(rootDir) {
  const command = {
    shell: "'node' 'src/cli.mjs' 'target-handoff-resume'",
    args: ['node', 'src/cli.mjs', 'target-handoff-resume']
  };
  return {
    controlStatus: {
      complete: false,
      safeMode: true,
      secretValuesRead: false
    },
    objectiveStatus: {
      complete: false,
      status: 'waiting-for-login',
      nextAction: {
        id: 'handoff-resume',
        needsOperatorInput: true,
        command
      },
      recommendedCommand: {
        id: 'handoff-resume',
        command
      },
      outputPath: path.join(rootDir, 'runs/operator/objective-status-latest.json')
    },
    proofGateStatus: {
      complete: false,
      status: 'waiting-for-login',
      target: 'github',
      targetDir: path.join(rootDir, 'runs/target-packs/github'),
      operatorInput: true,
      operatorGuidance: {
        humanAction: 'complete-login-in-open-dedicated-browser',
        automationBlocker: 'auth-check-not-ok',
        captureBlocked: true
      },
      nextAction: {
        id: 'handoff-resume',
        command
      },
      recommendedCommand: {
        id: 'handoff-resume',
        command
      },
      authCheckOk: false,
      loginLike: true,
      authState: 'metadata-only-login-like',
      missingArtifactCount: 6,
      acceptedExternalProofCount: 0,
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'auth-check-not-ok',
      artifactCommandCovers: ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof'],
      outputPath: path.join(rootDir, 'runs/operator/proof-gate-status-latest.json')
    },
    proofGateWatch: {
      status: 'timed-out',
      outputPath: path.join(rootDir, 'runs/operator/proof-gate-watch-status.json')
    },
    chromeExtensionStatus: {
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false,
        everydayChromeViaCdpAllowed: false
      },
      extension: {
        selectedProfileDirectory: 'Default',
        enabled: true
      },
      nativeHost: {
        correct: true
      },
      nextAction: 'verify-codex-chrome-extension-backend'
    },
    chromeExtensionHandoff: {
      action: 'ask-user-ok-to-open-selected-profile-window-and-retry',
      needsUserPermission: true,
      canOpenSelectedProfileWindow: true,
      commands: [
        {
          id: 'open-selected-profile-window',
          command: {
            shell: "'node' '/tmp/plugin/scripts/open-chrome-window.js'"
          }
        }
      ]
    },
    browserRoute: {
      requestedTask: 'auto',
      task: 'authenticated-scrape',
      selectedLane: 'target-pack-direct-cdp',
      backend: 'direct-cdp-chrome',
      profileMode: 'dedicated-target-profile',
      operatorInput: true,
      userPermissionRequired: true,
      canRunInBackground: true,
      opensBrowserNow: false,
      startsCapture: false,
      captureBlocked: true,
      commandOpensBrowser: false,
      commandRunOnlyAfterUserSays: '',
      security: {
        everydayChromeCdpAllowed: false,
        dedicatedTargetProfileForStoredAuth: true
      },
      commands: {
        route: command,
        status: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'authenticated-scrape' '--format' 'compact'"
        }
      }
    },
    secretEnvHandoff: {
      mode: 'environment-local-env',
      headlessReady: false,
      headlessConfigAvailable: true,
      requiresOnePasswordApproval: true,
      mutatesOnePasswordNow: false,
      nextAction: 'authenticate-onepassword-mcp-and-select-environment'
    },
    objectiveHandoff: {
      commands: [
        { id: 'primary-action', shell: command.shell },
        { id: 'proof-gate-watch', shell: "'node' 'src/cli.mjs' 'proof-gate-watch' '--write'" },
        { id: 'completion-audit', shell: "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'markdown'" }
      ],
      outputPath: path.join(rootDir, 'runs/operator/objective-handoff.json')
    }
  };
}

test('operator runbook writes a safe operator checklist without starting browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-'));
  try {
    const runbook = await buildOperatorRunbook({
      rootDir,
      generatedAt: '2026-05-29T00:00:00.000Z',
      write: true,
      out: 'operator/runbook.md',
      operatorPack: operatorPackFixture(rootDir)
    });

    assert.equal(runbook.safeMode, true);
    assert.equal(runbook.destructiveActionsIncluded, false);
    assert.equal(runbook.secretValuesRead, false);
    assert.equal(runbook.opensBrowserNow, false);
    assert.equal(runbook.startsCaptureNow, false);
    assert.equal(runbook.status, 'waiting-for-login');
    assert.equal(runbook.target, 'github');
    assert.equal(runbook.authState, 'metadata-only-login-like');
    assert.equal(runbook.authUsable, false);
    assert.equal(runbook.profileAuthMetadataOnly, true);
    assert.equal(runbook.handoffAuthCheckPort, '59036');
    assert.equal(runbook.handoffAuthCheckPortReachable, true);
    assert.equal(runbook.loginHandoff.nextAction, 'monitor-login');
    assert.equal(runbook.loginHandoff.safeMonitorAvailable, true);
    assert.equal(runbook.loginHandoff.opensBrowserNow, false);
    assert.equal(runbook.loginHandoff.startsCaptureNow, false);
    assert.equal(runbook.steps.some((item) => item.id === 'regular-chrome-resume-plan' && !item.opensBrowser), true);
    assert.equal(runbook.steps.some((item) => item.id === 'regular-chrome-retry' && item.runAfterUserApproval), true);
    assert.equal(runbook.steps.some((item) => item.id === 'browser-route' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'backend-matrix' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'proof-pipeline' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'agent-proof-checklist' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'agent-proof-closeout' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'target-auth-watch' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'login-handoff-status' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'target-approval-status' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'target-approval-preflight' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'compact-command-audit-all' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'target-approval-resume-plan' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'target-approval-resume-run' && item.runAfterUserApproval && item.opensBrowser && item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'background-proof-status' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'agent-loop-step-status' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'agent-loop-step-recommendation' && !item.opensBrowser && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'background-auth-monitor-start' && item.runAfterUserApproval && !item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'background-proof-capture-start' && item.runAfterUserApproval && item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'primary' && item.opensBrowser && item.startsCapture), true);
    assert.equal(runbook.steps.some((item) => item.id === 'completion-audit'), true);
    assert.equal(runbook.outputPath, path.join(rootDir, 'runs/operator/runbook.md'));

    const written = fs.readFileSync(runbook.outputPath, 'utf8');
    assert.match(written, /Secure Browser Agent Operator Runbook/);
    assert.equal(written.includes('OP_SERVICE_ACCOUNT_TOKEN='), false);

    const compact = formatOperatorRunbookCompact(runbook);
    assert.match(compact, /^status: waiting-for-login$/m);
    assert.match(compact, /^proof_gate_next_artifact_action: wait-auth-then-capture-proof$/m);
    assert.match(compact, /^auth_state: metadata-only-login-like$/m);
    assert.match(compact, /^auth_usable: no$/m);
    assert.match(compact, /^profile_auth_metadata_only: yes$/m);
    assert.match(compact, /^handoff_auth_check_port: 59036$/m);
    assert.match(compact, /^handoff_auth_check_port_reachable: yes$/m);
    assert.match(compact, /^proof_gate_next_artifact_blocker: auth-check-not-ok$/m);
    assert.match(compact, /^proof_gate_artifact_command_covers: auth-check,observe,inspect,scrape,benchmark,target-proof$/m);
    assert.match(compact, /^login_handoff_status: waiting-for-login$/m);
    assert.match(compact, /^login_handoff_next_action: monitor-login$/m);
    assert.match(compact, /^login_handoff_required: yes$/m);
    assert.match(compact, /^login_handoff_safe_monitor_available: yes$/m);
    assert.match(compact, /^login_handoff_opens_browser_now: no$/m);
    assert.match(compact, /^login_handoff_starts_capture_now: no$/m);
    assert.match(compact, /^login_handoff_capture_allowed_now: no$/m);
    assert.match(compact, /^browser_route_lane: target-pack-direct-cdp$/m);
    assert.match(compact, /^browser_route_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^browser_route_command_opens_browser: no$/m);
    assert.match(compact, /^browser_route_command_run_only_after_user_says: none$/m);
    assert.match(compact, /^browser_route_command: 'node' 'src\/cli\.mjs' 'browser-route'/m);
    assert.match(compact, /^backend_matrix_status: fresh$/m);
    assert.match(compact, /^backend_matrix_exists: yes$/m);
    assert.match(compact, /^backend_matrix_stale: no$/m);
    assert.match(compact, /^backend_matrix_default_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^backend_matrix_default_agent_interface: secure-browser-agent-mcp$/m);
    assert.match(compact, /^backend_matrix_search_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^backend_matrix_analyze_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^backend_matrix_scrape_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^backend_matrix_operate_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^backend_matrix_authenticated_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^backend_matrix_existing_tab_backend: codex-chrome-extension$/m);
    assert.match(compact, /^backend_matrix_public_crawl_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^backend_matrix_compatibility_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^backend_matrix_regular_chrome_status: not-ready$/m);
    assert.match(compact, /^backend_matrix_chrome_mcp_route_ready: no$/m);
    assert.match(compact, /^backend_matrix_chrome_mcp_list_pages_timed_out: yes$/m);
    assert.match(compact, /^backend_matrix_backend_count: 8$/m);
    assert.match(compact, /^backend_matrix_saved_secret_values_read: no$/m);
    assert.match(compact, /^backend_matrix_saved_destructive_actions: no$/m);
    assert.match(compact, /^backend_matrix_status_command: 'node' 'src\/cli\.mjs' 'backend-matrix-status' '--in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_refresh_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--write' '--out' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^proof_pipeline_status: waiting-for-login$/m);
    assert.match(compact, /^proof_pipeline_recommended_now: monitor-auth$/m);
    assert.match(compact, /^proof_pipeline_proof_capture_allowed_now: no$/m);
    assert.match(compact, /^proof_pipeline_wait_auth_then_capture_available: yes$/m);
    assert.match(compact, /^proof_pipeline_monitor_auth_available: yes$/m);
    assert.match(compact, /^proof_pipeline_monitor_auth_opens_browser: no$/m);
    assert.match(compact, /^proof_pipeline_monitor_auth_starts_capture: no$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_opens_browser: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_waits_for_auth: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_starts_capture: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_requires_operator_approval: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_agent_may_run_unattended: no$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_available: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_opens_browser: no$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_waits_for_auth: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_starts_capture: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_requires_operator_approval: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_agent_may_run_unattended: no$/m);
    assert.match(compact, /^proof_pipeline_command: 'node' 'src\/cli\.mjs' 'objective-proof-pipeline' '--format' 'compact'$/m);
    assert.match(compact, /^proof_pipeline_monitor_auth_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
    assert.match(compact, /^proof_pipeline_wait_capture_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.doesNotMatch(compact, /^proof_pipeline_wait_capture_no_open_command: .*--open-login/m);
    assert.match(compact, /^agent_next_action: monitor-auth-watch$/m);
    assert.match(compact, /^agent_next_can_run_without_approval: yes$/m);
    assert.match(compact, /^agent_next_command_id: auth-watch$/m);
    assert.match(compact, /^agent_next_preflight_available: yes$/m);
    assert.match(compact, /^agent_next_preflight_action: run-operator-approval-preflight$/m);
    assert.match(compact, /^agent_next_preflight_may_run_without_approval: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_required: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_opens_browser: no$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_starts_capture: no$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_returns_page_content: no$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_opens_browser: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_starts_capture: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_agent_may_run_unattended: no$/m);
    assert.match(compact, /^agent_next_opens_browser_now: no$/m);
    assert.match(compact, /^agent_next_starts_capture_now: no$/m);
    assert.match(compact, /^agent_next_provider_default_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^agent_next_provider_default_agent_interface: secure-browser-agent-mcp$/m);
    assert.match(compact, /^agent_next_provider_lightpanda_ready_for_public_benchmark: no$/m);
    assert.match(compact, /^agent_next_provider_lightpanda_benchmark_agent_may_run_unattended: no$/m);
    assert.match(compact, /^agent_next_provider_lightpanda_benchmark_starts_browser: yes$/m);
    assert.match(compact, /^agent_next_provider_lightpanda_benchmark_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_next_provider_lightpanda_benchmark_returns_page_content: no$/m);
    assert.match(compact, /^agent_next_provider_lightpanda_benchmark_command: LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="\/tmp\/lightpanda" node src\/cli\.mjs benchmark --url https:\/\/example\.com --iterations 1 --write --out provider-benchmarks\/lightpanda-public\.json --format json$/m);
    assert.match(compact, /^agent_next_provider_playwright_ready_for_public_smoke: yes$/m);
    assert.match(compact, /^agent_next_provider_playwright_ready_for_authenticated_default: no$/m);
    assert.match(compact, /^agent_next_provider_playwright_storage_state_sensitive: yes$/m);
    assert.match(compact, /^agent_next_provider_playwright_smoke_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>'$/m);
    assert.match(compact, /^agent_next_provider_selenium_ready_for_local_smoke: no$/m);
    assert.match(compact, /^agent_next_provider_selenium_smoke_agent_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_next_provider_selenium_smoke_starts_browser: no$/m);
    assert.match(compact, /^agent_next_provider_selenium_smoke_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
    assert.match(compact, /^agent_next_provider_doctor_opens_browser: no$/m);
    assert.match(compact, /^agent_next_provider_doctor_starts_capture: no$/m);
    assert.match(compact, /^agent_next_provider_doctor_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_next_provider_doctor_returns_page_content: no$/m);
    assert.match(compact, /^agent_next_provider_doctor_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_next_command: 'node' 'src\/cli\.mjs' 'agent-next' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_provider_doctor_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_operator_approval_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_checklist_complete: no$/m);
    assert.match(compact, /^agent_proof_checklist_verdict: not-complete$/m);
    assert.match(compact, /^agent_proof_checklist_candidate: github$/m);
    assert.match(compact, /^agent_proof_checklist_readiness_remaining_count: 1$/m);
    assert.match(compact, /^agent_proof_checklist_readiness_remaining: real-external-auth-target$/m);
    assert.match(compact, /^agent_proof_checklist_auth_state: metadata-only-login-like$/m);
    assert.match(compact, /^agent_proof_checklist_auth_usable: no$/m);
    assert.match(compact, /^agent_proof_checklist_capture_blocked: yes$/m);
    assert.match(compact, /^agent_proof_checklist_automation_blocker: auth-check-not-ok$/m);
    assert.match(compact, /^agent_proof_checklist_operator_approval_required: yes$/m);
    assert.match(compact, /^agent_proof_checklist_operator_approval_token: OK$/m);
    assert.match(compact, /^agent_proof_checklist_operator_command_opens_browser: yes$/m);
    assert.match(compact, /^agent_proof_checklist_operator_command_starts_capture: yes$/m);
    assert.match(compact, /^agent_proof_checklist_agent_must_not_run_operator_resume_unattended: yes$/m);
    assert.match(compact, /^agent_proof_checklist_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_checklist_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_checklist_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist-status' '--in' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_checklist_operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_complete: no$/m);
    assert.match(compact, /^agent_proof_closeout_verdict: not-complete$/m);
    assert.match(compact, /^agent_proof_closeout_candidate: github$/m);
    assert.match(compact, /^agent_proof_closeout_readiness_remaining_count: 1$/m);
    assert.match(compact, /^agent_proof_closeout_readiness_remaining: real-external-auth-target$/m);
    assert.match(compact, /^agent_proof_closeout_auth_state: metadata-only-login-like$/m);
    assert.match(compact, /^agent_proof_closeout_auth_usable: no$/m);
    assert.match(compact, /^agent_proof_closeout_capture_blocked: yes$/m);
    assert.match(compact, /^agent_proof_closeout_automation_blocker: auth-check-not-ok$/m);
    assert.match(compact, /^agent_proof_closeout_accepted_external_proofs: 0$/m);
    assert.match(compact, /^agent_proof_closeout_checklist_exists: yes$/m);
    assert.match(compact, /^agent_proof_closeout_checklist_parse_ok: yes$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_requires_operator_approval: yes$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_opens_browser: yes$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_starts_capture: yes$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_agent_may_run_unattended: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_default_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^agent_proof_closeout_provider_default_agent_interface: secure-browser-agent-mcp$/m);
    assert.match(compact, /^agent_proof_closeout_provider_playwright_ready_for_public_smoke: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_playwright_ready_for_authenticated_default: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_playwright_storage_state_sensitive: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_opens_browser: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_starts_capture: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_returns_page_content: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_proof_closeout_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--include-compact-command-audit' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_checklist_refresh_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_checklist_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist-status' '--in' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_command_id: agent-preflight$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
    assert.match(compact, /^agent_proof_closeout_target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_completion_proof_bundle_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status' '--in' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_compact_command_audit_all_command: 'node' 'src\/cli\.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_objective_completion_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_pack_exists: yes$/m);
    assert.match(compact, /^target_approval_pack_parse_ok: yes$/m);
    assert.match(compact, /^target_approval_candidate: github$/m);
    assert.match(compact, /^target_approval_next: handoff-resume$/m);
    assert.match(compact, /^target_approval_resume_status: planned$/m);
    assert.match(compact, /^target_approval_resume_ready_to_run: yes$/m);
    assert.match(compact, /^target_approval_resume_planned_opens_browser: yes$/m);
    assert.match(compact, /^target_approval_resume_planned_starts_capture: yes$/m);
    assert.match(compact, /^background_proof_plan_status: waiting-for-login$/m);
    assert.match(compact, /^background_proof_capture_blocked: yes$/m);
    assert.match(compact, /^background_proof_capture_blocked_reason: none$/m);
    assert.match(compact, /^background_proof_monitor_available: yes$/m);
    assert.match(compact, /^background_proof_capture_available: yes$/m);
    assert.match(compact, /^background_proof_monitor_running: no$/m);
    assert.match(compact, /^background_proof_capture_running: no$/m);
    assert.match(compact, /^background_proof_capture_start_ready: no$/m);
    assert.match(compact, /^background_proof_capture_start_blockers: operator-ok-required$/m);
    assert.match(compact, /^background_proof_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status' '--format' 'compact'$/m);
    assert.match(compact, /^background_proof_no_open_wait_capture_requires_operator_approval: yes$/m);
    assert.match(compact, /^background_proof_no_open_wait_capture_agent_may_run_unattended: no$/m);
    assert.match(compact, /^background_proof_no_open_wait_capture_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_command: .*--open-login/m);
    assert.match(compact, /^background_proof_no_open_wait_capture_background_requires_operator_approval: yes$/m);
    assert.match(compact, /^background_proof_no_open_wait_capture_background_agent_may_run_unattended: no$/m);
    assert.match(compact, /^background_proof_no_open_wait_capture_background_command: mkdir -p 'runs\/operator' && nohup /m);
    assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_background_command: .*--open-login/m);
    assert.match(compact, /^agent_loop_step_saved_exists: yes$/m);
    assert.match(compact, /^agent_loop_step_saved_stale: no$/m);
    assert.match(compact, /^agent_loop_step_saved_status: planned$/m);
    assert.match(compact, /^agent_loop_step_saved_next_action: monitor-auth-watch$/m);
    assert.match(compact, /^agent_loop_step_saved_recommended_command_id: run-agent-loop-step$/m);
    assert.match(compact, /^agent_loop_step_saved_command_id: auth-watch$/m);
    assert.match(compact, /^agent_loop_step_saved_allowed_to_run: yes$/m);
    assert.match(compact, /^agent_loop_step_saved_executed: no$/m);
    assert.match(compact, /^agent_loop_step_saved_opens_browser_now: no$/m);
    assert.match(compact, /^agent_loop_step_saved_starts_capture_now: no$/m);
    assert.match(compact, /^agent_loop_step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_loop_step_recommended_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
    assert.match(compact, /^background_proof_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^background_proof_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^regular_chrome_user_permission_required: yes$/m);
    assert.match(compact, /^regular_chrome_operator_ok_required: yes$/m);
    assert.match(compact, /^regular_chrome_resume_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--format' 'compact'$/m);
    assert.match(compact, /^regular_chrome_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /open-chrome-window/);
    assert.match(compact, /^secret_onepassword_approval_required: yes$/m);
    assert.match(compact, /^opens_browser_now: no$/m);
    assert.match(compact, /^primary_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.match(compact, /^watch_command: 'node' 'src\/cli\.mjs' 'proof-gate-watch'/m);
    assert.match(compact, /^auth_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
    assert.match(compact, /^login_handoff_status_command: 'node' 'src\/cli\.mjs' 'login-handoff-status' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_status_command: 'node' 'src\/cli\.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^compact_command_audit_all_command: 'node' 'src\/cli\.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--include-compact-command-audit' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
    assert.match(formatOperatorRunbookMarkdown(runbook), /Login Handoff/);
    assert.match(formatOperatorRunbookMarkdown(runbook), /Backend Matrix/);
    assert.match(formatOperatorRunbookMarkdown(runbook), /Proof Pipeline/);
    assert.match(formatOperatorRunbookMarkdown(runbook), /Agent Proof Checklist/);
    assert.match(formatOperatorRunbookMarkdown(runbook), /Agent Proof Closeout/);
    assert.match(formatOperatorRunbookMarkdown(runbook), /Target Approval/);
    assert.match(formatOperatorRunbookMarkdown(runbook), /Background Proof Capture/);
    assert.match(formatOperatorRunbookMarkdown(runbook), /Agent Loop Step/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator runbook status reads saved JSON without recomputing browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-status-'));
  try {
    await buildOperatorRunbook({
      rootDir,
      generatedAt: '2026-05-29T00:00:00.000Z',
      write: true,
      out: 'operator/operator-runbook-latest.json',
      operatorPack: operatorPackFixture(rootDir)
    });

    const status = buildOperatorRunbookStatus({
      rootDir,
      in: 'operator/operator-runbook-latest.json'
    });
    assert.equal(status.safeMode, true);
    assert.equal(status.statusOnly, true);
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.opensBrowserNow, false);
    assert.equal(status.startsCaptureNow, false);
    assert.equal(status.readsBrowserStorage, false);
    assert.equal(status.exists, true);
    assert.equal(status.parseOk, true);
    assert.equal(status.savedStatus, 'waiting-for-login');
    assert.equal(status.savedTarget, 'github');
    assert.equal(status.savedOperatorInput, true);
    assert.equal(status.savedBrowserStepCount > 0, true);
    assert.equal(status.savedCaptureStepCount > 0, true);

    const compact = formatOperatorRunbookStatusCompact(status);
    assert.match(compact, /^input_path: operator\/operator-runbook-latest\.json$/m);
    assert.match(compact, /^saved_output_path: runs\/operator\/operator-runbook-latest\.json$/m);
    assert.equal(compact.includes(rootDir), false);
    assert.match(compact, /^saved_status: waiting-for-login$/m);
    assert.match(compact, /^saved_target: github$/m);
    assert.match(compact, /^opens_browser_now: no$/m);
    assert.match(compact, /^starts_capture_now: no$/m);
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'operator-runbook-watch'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator runbook status promotes current objective audit safe next when saved runbook is fresh', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-objective-next-'));
  try {
    await buildOperatorRunbook({
      rootDir,
      generatedAt: '2026-05-29T00:00:00.000Z',
      write: true,
      out: 'operator/operator-runbook-latest.json',
      operatorPack: operatorPackFixture(rootDir)
    });

    const status = buildOperatorRunbookStatus({
      rootDir,
      in: 'operator/operator-runbook-latest.json',
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

    assert.equal(status.stale, false);
    assert.equal(status.objectiveCompletionAuditExists, true);
    assert.equal(status.objectiveCompletionAuditStale, false);
    assert.deepEqual(status.objectiveCompletionAuditRemaining, ['real-external-auth-target']);
    assert.equal(status.agentSafeNextCommandId, 'objective-completion-audit-strict');
    assert.equal(status.agentSafeNextMayRunUnattended, true);
    assert.equal(status.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");

    const compact = formatOperatorRunbookStatusCompact(status);
    assert.match(compact, /^objective_completion_audit_exists: yes$/m);
    assert.match(compact, /^objective_completion_audit_remaining: real-external-auth-target$/m);
    assert.match(compact, /^agent_safe_next_command_id: objective-completion-audit-strict$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator runbook watch refreshes missing saved JSON only when run is requested', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-watch-'));
  try {
    const planned = await buildOperatorRunbookWatch({
      rootDir,
      operatorPack: operatorPackFixture(rootDir),
      in: 'operator/operator-runbook-latest.json',
      out: 'operator/operator-runbook-latest.json'
    });
    assert.equal(planned.executed, false);
    assert.equal(planned.status, 'refresh-required');
    assert.equal(planned.blockedReason, 'run-not-requested');
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/operator-runbook-latest.json')), false);

    const refreshed = await buildOperatorRunbookWatch({
      rootDir,
      operatorPack: operatorPackFixture(rootDir),
      in: 'operator/operator-runbook-latest.json',
      out: 'operator/operator-runbook-latest.json',
      run: true
    });
    assert.equal(refreshed.executed, true);
    assert.equal(refreshed.status, 'refreshed');
    assert.equal(refreshed.secretValuesRead, false);
    assert.equal(refreshed.opensBrowserNow, false);
    assert.equal(refreshed.startsCaptureNow, false);
    assert.equal(refreshed.afterSavedStatus, 'waiting-for-login');
    assert.equal(refreshed.afterSavedTarget, 'github');
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/operator-runbook-latest.json')), true);
    assert.match(formatOperatorRunbookWatchCompact(refreshed), /^after_saved_status: waiting-for-login$/m);

    const fresh = await buildOperatorRunbookWatch({
      rootDir,
      operatorPack: operatorPackFixture(rootDir),
      in: 'operator/operator-runbook-latest.json',
      out: 'operator/operator-runbook-latest.json',
      run: true
    });
    assert.equal(fresh.executed, false);
    assert.equal(fresh.blockedReason, 'saved-operator-runbook-is-fresh');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator runbook status and watch reject paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-status-path-'));
  try {
    assert.throws(
      () => buildOperatorRunbookStatus({ rootDir, in: '../runbook.json' }),
      /invalid operator runbook output path/
    );
    await assert.rejects(
      () => buildOperatorRunbookWatch({ rootDir, out: '../runbook.json', run: true }),
      /invalid operator runbook output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator runbook hides background capture start when saved handoff port is stale', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-stale-'));
  try {
    const stalePack = operatorPackFixture(rootDir);
    stalePack.handoffAuthCheckPortReachable = false;
    stalePack.loginHandoff.safeMonitorAvailable = false;
    stalePack.backgroundProofCapture.backgroundCaptureAvailable = false;
    stalePack.backgroundProofCapture.captureBlockedReason = 'handoff-auth-check-port-unreachable';
    stalePack.backgroundProofCapture.noOpenWaitCaptureCommand = null;
    stalePack.backgroundProofCapture.backgroundNoOpenWaitCaptureCommand = null;

    const runbook = await buildOperatorRunbook({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      operatorPack: stalePack
    });

    assert.equal(runbook.backgroundProofCapture.backgroundCaptureAvailable, false);
    assert.equal(runbook.backgroundProofCapture.captureBlockedReason, 'handoff-auth-check-port-unreachable');
    assert.equal(runbook.steps.some((item) => item.id === 'target-auth-watch'), false);
    assert.equal(runbook.steps.some((item) => item.id === 'background-proof-no-open-wait-capture'), false);
    assert.equal(runbook.steps.some((item) => item.id === 'background-proof-no-open-wait-capture-background'), false);
    assert.equal(runbook.steps.some((item) => item.id === 'background-proof-capture-start'), false);

    const compact = formatOperatorRunbookCompact(runbook);
    assert.match(compact, /^background_proof_capture_available: no$/m);
    assert.match(compact, /^background_proof_capture_blocked_reason: handoff-auth-check-port-unreachable$/m);
    assert.doesNotMatch(compact, /^auth_watch_command: /m);
    assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_command: /m);
    assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_background_command: /m);
    assert.doesNotMatch(compact, /^background_proof_capture_start_command: /m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator runbook write refreshes operator pack child files by default', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-children-'));
  try {
    const runbook = await buildOperatorRunbook({
      rootDir,
      generatedAt: '2026-05-29T00:00:00.000Z',
      write: true,
      out: 'operator/runbook.md',
      ...packBuilderFixtures(rootDir)
    });

    assert.equal(runbook.files.operatorPack, path.join(rootDir, 'runs/operator/operator-pack-latest.json'));
    assert.equal(runbook.files.loginHandoffStatus, path.join(rootDir, 'runs/operator/login-handoff-status-latest.json'));
    assert.equal(runbook.files.browserRoute, path.join(rootDir, 'runs/operator/browser-route-latest.json'));
    assert.equal(runbook.files.backendMatrix, path.join(rootDir, 'runs/operator/backend-matrix-latest.json'));
    assert.equal(runbook.files.backgroundProofCapturePlan, path.join(rootDir, 'runs/operator/background-proof-capture-plan-latest.json'));
    assert.equal(runbook.files.backgroundProofCaptureStatus, path.join(rootDir, 'runs/operator/background-proof-capture-status-latest.json'));
    assert.equal(runbook.files.agentProofChecklist, path.join(rootDir, 'runs/operator/agent-proof-checklist-latest.json'));
    assert.equal(runbook.files.agentProofCloseout, path.join(rootDir, 'runs/operator/agent-proof-closeout-latest.json'));
    assert.equal(fs.existsSync(runbook.files.operatorPack), true);
    assert.equal(fs.existsSync(runbook.files.loginHandoffStatus), true);
    assert.equal(fs.existsSync(runbook.files.browserRoute), true);
    assert.equal(fs.existsSync(runbook.files.backendMatrix), true);
    assert.equal(fs.existsSync(runbook.files.backgroundProofCapturePlan), true);
    assert.equal(fs.existsSync(runbook.files.backgroundProofCaptureStatus), true);
    assert.equal(fs.existsSync(runbook.files.agentProofChecklist), true);
    assert.equal(fs.existsSync(runbook.files.agentProofCloseout), true);
    const writtenRoute = JSON.parse(fs.readFileSync(runbook.files.browserRoute, 'utf8'));
    const writtenBackendMatrix = JSON.parse(fs.readFileSync(runbook.files.backendMatrix, 'utf8'));
    const writtenLoginHandoffStatus = JSON.parse(fs.readFileSync(runbook.files.loginHandoffStatus, 'utf8'));
    const writtenAgentProofChecklist = JSON.parse(fs.readFileSync(runbook.files.agentProofChecklist, 'utf8'));
    const writtenAgentProofCloseout = JSON.parse(fs.readFileSync(runbook.files.agentProofCloseout, 'utf8'));
    assert.equal(writtenRoute.selectedLane, 'target-pack-direct-cdp');
    assert.equal(writtenRoute.secretValuesRead, false);
    assert.equal(writtenRoute.opensBrowserNow, false);
    assert.equal(writtenBackendMatrix.secretValuesRead, false);
    assert.equal(writtenBackendMatrix.opensBrowserNow, false);
    assert.equal(writtenLoginHandoffStatus.opensBrowserNow, false);
    assert.equal(writtenLoginHandoffStatus.startsCaptureNow, false);
    assert.equal(writtenLoginHandoffStatus.secretValuesRead, false);
    assert.equal(writtenAgentProofChecklist.complete, false);
    assert.equal(writtenAgentProofChecklist.secretValuesRead, false);
    assert.equal(writtenAgentProofCloseout.complete, false);
    assert.equal(writtenAgentProofCloseout.secretValuesRead, false);
    assert.equal(writtenAgentProofCloseout.opensBrowserNow, false);
    assert.equal(writtenAgentProofCloseout.startsCaptureNow, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator runbook preserves short monitor settings from generated operator pack', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-monitor-'));
  try {
    const runbook = await buildOperatorRunbook({
      rootDir,
      generatedAt: '2026-05-29T00:00:00.000Z',
      monitorTimeoutMs: 10000,
      monitorIntervalMs: 1000,
      ...packBuilderFixtures(rootDir)
    });

    const compact = formatOperatorRunbookCompact(runbook);
    const operatorPackStep = runbook.steps.find((item) => item.id === 'operator-pack');
    assert.match(operatorPackStep.command, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
    assert.match(runbook.agentLoopStepStatus.refreshCommand.shell, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
    assert.match(compact, /^agent_loop_step_status_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
    assert.match(compact, /^agent_loop_step_recommended_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
    assert.match(compact, /^background_proof_monitor_start_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator runbook rejects output paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-runbook-bad-out-'));
  try {
    await assert.rejects(
      () => buildOperatorRunbook({
        rootDir,
        out: '../runbook.md',
        operatorPack: operatorPackFixture(rootDir)
      }),
      /invalid operator runbook output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
