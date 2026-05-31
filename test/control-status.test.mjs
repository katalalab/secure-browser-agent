import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentNext, buildControlStatus, formatAgentNextCompact, formatControlStatusCompact, formatControlStatusMarkdown } from '../src/control-status.mjs';

test('control status combines objective, runtime, and secret state without reading secrets', async () => {
  const status = await buildControlStatus({
    generatedAt: '2026-05-28T00:00:00.000Z',
    rootDir: '/tmp/sba',
    objectiveStatus: {
      complete: false,
      status: 'waiting-for-login',
      remainingCount: 1,
      nextAction: {
        id: 'target-handoff-capture',
        needsOperatorInput: true
      },
      recommendedCommand: {
        id: 'login-capture-wait',
        reason: 'Login is required.',
        command: {
          args: ['node', 'src/cli.mjs', 'target-login-capture'],
          shell: "'node' 'src/cli.mjs' 'target-login-capture'"
        }
      },
      latestHandoffResume: {
        status: 'waiting-for-login',
        loginOpen: {
          status: 'login-opened',
          port: '56789'
        },
        authCheck: {
          childStatus: 'not-ok'
        }
      },
      operatorHandoff: {
        exists: true,
        authCheckPort: '59036'
      },
      authWatchStatus: {
        exists: true,
        status: 'not-ok',
        active: true,
        stale: false,
        ok: false,
        loginLike: true
      },
      authWatchLatestStatus: {
        exists: true,
        status: 'timed-out',
        active: false,
        stale: false,
        ok: false,
        loginLike: true
      },
      commands: {
        status: { args: ['node'], shell: "'node'" },
        authCheck: { args: ['node', 'src/cli.mjs', 'target-auth-check', '--cdp-port', '59036'], shell: "'node' 'src/cli.mjs' 'target-auth-check' '--cdp-port' '59036'" },
        authWatch: { args: ['node', 'src/cli.mjs', 'target-auth-watch', '--cdp-port', '59036'], shell: "'node' 'src/cli.mjs' 'target-auth-watch' '--cdp-port' '59036'" },
        loginCaptureWait: { args: ['node', 'src/cli.mjs', 'target-login-capture'], shell: "'node' 'src/cli.mjs' 'target-login-capture'" },
        completionAudit: { args: ['node', 'src/cli.mjs', 'objective-completion-audit'], shell: "'node' 'src/cli.mjs' 'objective-completion-audit'" }
      }
    },
    objectiveSafeCommand: {
      agentSafeAction: 'monitor-auth-watch',
      commandId: 'auth-watch',
      monitorOnly: true,
      mayOpenBrowser: false,
      startsCapture: false,
      proofCaptureAllowedNow: false,
      nextArtifactAction: 'wait-auth-then-capture-proof',
      nextArtifactBlocker: 'auth-check-not-ok',
      command: {
        args: ['node', 'src/cli.mjs', 'target-auth-watch', '--cdp-port', '59036'],
        shell: "'node' 'src/cli.mjs' 'target-auth-watch' '--cdp-port' '59036'"
      },
      agentLoopStep: {
        planCommand: {
          args: ['node', 'src/cli.mjs', 'agent-loop-step', '--write', '--out', 'operator/agent-loop-step-latest.json', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'agent-loop-step' '--write' '--out' 'operator/agent-loop-step-latest.json' '--format' 'compact'"
        },
        runCommand: {
          args: ['node', 'src/cli.mjs', 'agent-loop-step', '--run', '--write', '--out', 'operator/agent-loop-step-latest.json', '--timeout-ms', '300000', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator/agent-loop-step-latest.json' '--timeout-ms' '300000' '--format' 'compact'"
        },
        statusCommand: {
          args: ['node', 'src/cli.mjs', 'agent-loop-step-status', '--in', 'operator/agent-loop-step-latest.json', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'agent-loop-step-status' '--in' 'operator/agent-loop-step-latest.json' '--format' 'compact'"
        }
      },
      backgroundProofCapture: {
        planStatus: 'waiting-for-login',
        captureBlocked: true,
        monitorAvailable: true,
        captureAvailable: true,
        opensBrowserNow: false,
        startsCaptureNow: false,
        captureStartReadyToRun: false,
        captureStartBlockers: ['operator-ok-required'],
        monitorStartReadyToRun: false,
        monitorStartBlockers: ['operator-ok-required'],
        statusCommand: {
          args: ['node', 'src/cli.mjs', 'background-proof-capture-status', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'background-proof-capture-status' '--format' 'compact'"
        },
        captureStartCommand: {
          args: ['node', 'src/cli.mjs', 'background-proof-capture-start', '--mode', 'capture', '--run', '--operator-ok', 'OK', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'background-proof-capture-start' '--mode' 'capture' '--run' '--operator-ok' 'OK' '--format' 'compact'"
        },
        monitorStartCommand: {
          args: ['node', 'src/cli.mjs', 'background-proof-capture-start', '--mode', 'monitor', '--run', '--operator-ok', 'OK', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'"
        },
        noOpenWaitCaptureCommand: {
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', '/tmp/sba/runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--wait-auth', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--wait-auth' '--format' 'compact'"
        },
        backgroundNoOpenWaitCaptureCommand: {
          shell: "mkdir -p 'runs/operator' && nohup 'node' 'src/cli.mjs' 'target-handoff-resume' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--wait-auth' '--format' 'compact' > 'runs/operator/background-proof-capture.log' 2>&1 & echo $! > 'runs/operator/background-proof-capture.pid'"
        }
      },
      agentProofStep: {
        startStatus: 'planned',
        startReadyToRun: false,
        startBlockers: ['operator-ok-required', 'agent-proof-step-not-allowed:auth-not-ready'],
        selectedCommandId: 'monitor-auth',
        selectedStartsCapture: false,
        latestAuthOk: false,
        captureCompleted: false,
        opensBrowserNow: false,
        startsCaptureNow: false,
        planCommand: {
          args: ['node', 'src/cli.mjs', 'agent-proof-step', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'agent-proof-step' '--format' 'compact'"
        },
        runCommand: null,
        startCommand: {
          args: ['node', 'src/cli.mjs', 'agent-proof-step-start', '--run', '--operator-ok', 'OK', '--out', 'operator/agent-proof-step-latest.json', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'agent-proof-step-start' '--run' '--operator-ok' 'OK' '--out' 'operator/agent-proof-step-latest.json' '--format' 'compact'"
        },
        statusCommand: {
          args: ['node', 'src/cli.mjs', 'agent-proof-step-status', '--in', 'operator/agent-proof-step-latest.json', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'agent-proof-step-status' '--in' 'operator/agent-proof-step-latest.json' '--format' 'compact'"
        }
      },
      targetApproval: {
        approvalPackExists: true,
        approvalPackParseOk: true,
        selectedCandidate: 'github',
        targetPackExists: true,
        targetNext: 'handoff-resume',
        humanAction: 'complete-login-in-open-dedicated-browser',
        automationBlocker: 'auth-check-not-ok',
        captureBlocked: true,
        nextCommandOpensBrowser: true,
        nextCommandStartsCapture: true,
        nextCommandRequiresOperatorApproval: true,
        nextCommandAgentMayRunUnattended: false,
        resumeStatus: 'planned',
        resumeReadyToRun: true,
        resumeOperatorOkRequired: true,
        resumeOperatorOkAccepted: false,
        resumeAgentMayRunUnattended: false,
        resumePlannedCommandOpensBrowser: true,
        resumePlannedCommandStartsCapture: true,
        operatorApprovalSummaryScope: 'real-external-auth-target-proof',
        operatorApprovalSummaryHumanAction: 'complete-login-in-open-dedicated-browser',
        operatorApprovalSummaryRequiresOperatorOk: true,
        operatorApprovalSummaryOperatorOkAccepted: false,
        operatorApprovalSummaryMayOpenBrowser: true,
        operatorApprovalSummaryMayStartCapture: true,
        operatorApprovalSummaryReadsBrowserStorage: false,
        operatorApprovalSummaryReturnsPageContent: false,
        operatorApprovalSummaryAgentMustNotRunUnattended: true,
        preflightCommand: {
          args: ['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', 'github', '--real-external', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
        },
        statusCommand: {
          args: ['node', 'src/cli.mjs', 'target-approval-status', '--candidate', 'github', '--real-external', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'"
        },
        resumePreflightCommand: {
          args: ['node', 'src/cli.mjs', 'target-approval-preflight', '--candidate', 'github', '--real-external', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'"
        },
        resumeProofPlanCommand: {
          args: ['node', 'src/cli.mjs', 'target-proof-plan', 'runs/target-packs/github', '--real-external', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'"
        },
        resumePlanCommand: {
          args: ['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', 'github', '--real-external', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'"
        },
        resumeStatusCommand: {
          args: ['node', 'src/cli.mjs', 'target-approval-resume-status', '--in', 'operator/target-approval-resume-latest.json', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'"
        },
        resumeWatchCommand: {
          args: ['node', 'src/cli.mjs', 'target-approval-resume-watch', '--run', '--in', 'operator/target-approval-resume-latest.json', '--out', 'operator/target-approval-resume-latest.json', '--candidate', 'github', '--real-external', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'"
        },
        resumeRunCommand: {
          args: ['node', 'src/cli.mjs', 'target-approval-resume', '--candidate', 'github', '--real-external', '--run', '--operator-ok', 'OK', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
        }
      }
    },
    targetCandidatePlan: {
      recommendedCandidate: 'github',
      candidates: [
        {
          id: 'github',
          name: 'github',
          readiness: {
            targetPackExists: true,
            metadataOk: true,
            authCheckExists: true,
            authCheckOk: false,
            authCheckLoginLike: true,
            benchmarkExists: false,
            benchmarkOk: false,
            proofExists: false,
            proofReady: false,
            proofAccepted: false,
            nextAction: 'operator-login-and-auth-check'
          }
        }
      ]
    },
    runtimeAudit: {
      chromeDevtools: {
        endpoint: { ok: true, browser: 'Chrome/149' },
        diaEndpoint: { ok: false }
      },
      chromeApp: {
        total: 3,
        regularProfiles: 1,
        regularProfileRemoteDebugging: 0,
        targetPackProfiles: 1,
        targetProfileRemoteDebugging: 1,
        codexBrowserAgentProfiles: 1
      },
      agentBrowser: {
        sessions: ['public'],
        staleSessions: []
      },
      agentOwners: [{ ownerPid: 1 }, { ownerPid: 2 }],
      processBreakdown: {
        peekaboo: { parts: { server: 3 } },
        chromeDevtoolsMcp: { parts: { server: 2 } },
        computerUse: { parts: { server: 1 } }
      },
      recommendations: [
        { level: 'warn', name: 'peekaboo.duplicated' },
        { level: 'pass', name: 'runtime.clean' }
      ]
    },
    secretAudit: {
      headlessReady: false,
      recommendedHeadlessMode: 'not-configured',
      op: {
        exists: true,
        version: '2.34.0-test'
      },
      capabilities: {
        desktopIntegrationLikely: true,
        serviceAccountConfigured: false,
        serviceAccountEnvFileUsable: false,
        headlessConfigAvailable: false,
        connectConfigured: false
      },
      serviceAccountEnvFile: {
        path: ''
      },
      processes: {
        onePasswordMcp: 4
      }
    },
    chromeExtensionStatus: {
      secretValuesRead: false,
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false,
        everydayChromeViaCdpAllowed: false
      },
      extension: {
        installed: true,
        enabled: true,
        selectedProfileDirectory: 'Default'
      },
      nativeHost: {
        correct: true
      },
      defaultBrowser: {
        http: 'Dia',
        https: 'Dia'
      }
    },
    backendMatrixStatus: {
      status: 'fresh',
      exists: true,
      stale: false,
      ageSeconds: 12,
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
      regularChromeStatus: 'stale',
      chromeMcpRouteReady: false,
      chromeMcpListPagesTimedOut: true,
      chromeMcpTimeoutPlanSource: 'latest-file',
      chromeMcpTimeoutPlanStatus: 'mcp-connected-page-list-timeout',
      chromeMcpTimeoutPlanStale: false,
      chromeMcpTimeoutPlanPreferExtensionResume: true,
      backendCount: 8,
      savedSecretValuesRead: false,
      savedDestructiveActions: false,
      commands: {
        refresh: {
          args: ['node', 'src/cli.mjs', 'backend-matrix', '--write', '--out', 'operator/backend-matrix-latest.json', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'backend-matrix' '--write' '--out' 'operator/backend-matrix-latest.json' '--format' 'compact'"
        },
        status: {
          args: ['node', 'src/cli.mjs', 'backend-matrix-status', '--in', 'operator/backend-matrix-latest.json', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'backend-matrix-status' '--in' 'operator/backend-matrix-latest.json' '--format' 'compact'"
        }
      }
    },
    providerDoctorStatus: {
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      adoptionNext: 'keep-direct-cdp-default-and-run-provider-doctors-before-changing-backends',
      agentBrowser: {
        cliExists: false,
        chromeForTestingExists: true,
        readyForEngineUse: false,
        missingChecks: ['cli.agent-browser']
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
        smokeAgentMayRunUnattended: true,
        smokeStartsBrowser: true,
        smokeReadsBrowserStorage: false,
        smokeReturnsPageContent: false,
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
        missingChecks: ['package.selenium-webdriver'],
        smokeAgentMayRunUnattended: true,
        smokeStartsBrowser: false,
        smokeCommand: 'node src/cli.mjs selenium-doctor --format compact'
      }
    },
    chromeMcpTimeoutPlanStatus: {
      status: 'mcp-connected-page-list-timeout',
      exists: true,
      parseOk: true,
      stale: false,
      ageSeconds: 30,
      connected: true,
      pageListOk: false,
      pageListTimeout: true,
      newBackgroundTabsAllowed: true,
      newBackgroundTabOption: 'yes',
      newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
      newBackgroundUrlValueRead: false,
      useEverydayChromeNow: false,
      preferExtensionResume: true,
      cleanupIsManual: true,
      doNotUseDefaultProfileCdp: true,
      dedicatedTargetProfileRequiredForStoredAuth: true,
      nextAction: 'use-gated-extension-resume-or-clean-stale-mcp',
      findings: ['page-list-timeout', 'duplicate-mcp-servers'],
      cleanup: {
        ownerSessionCount: 3,
        reviewOwnerPids: [200, 300]
      },
      commands: {
        status: {
          args: ['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan-status', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'chrome-mcp-timeout-plan-status' '--format' 'compact'"
        },
        refresh: {
          args: ['node', 'src/cli.mjs', 'chrome-mcp-timeout-plan', '--write', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'chrome-mcp-timeout-plan' '--write' '--format' 'compact'"
        },
        regularChromeUse: {
          args: ['node', 'src/cli.mjs', 'regular-chrome-use', '--intent', 'inspect'],
          shell: "'node' 'src/cli.mjs' 'regular-chrome-use' '--intent' 'inspect'"
        },
        runtimeCleanupPlan: {
          args: ['node', 'src/cli.mjs', 'runtime-cleanup-plan', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'runtime-cleanup-plan' '--format' 'compact'"
        },
        chromeExtensionResumeApproval: {
          args: ['node', 'src/cli.mjs', 'chrome-extension-resume', '--run', '--operator-ok', 'OK', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK' '--format' 'compact'"
        },
        chromeMcpStatusRetry: {
          args: ['node', 'src/cli.mjs', 'chrome-mcp-status', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'chrome-mcp-status' '--format' 'compact'"
        }
      }
    },
    chromeMcpAutostartPlanStatus: {
      exists: true,
      parseOk: true,
      label: 'local.secure-browser-agent.chrome-devtools-mcp',
      browserUrl: 'http://127.0.0.1:9223',
      plistExists: true,
      installPathExists: false,
      installRequiresOperatorApproval: true,
      agentMayInstallUnattended: false,
      statusCommand: {
        args: ['launchctl', 'print', 'gui/501/local.secure-browser-agent.chrome-devtools-mcp'],
        shell: "'launchctl' 'print' 'gui/501/local.secure-browser-agent.chrome-devtools-mcp'"
      },
      refreshCommand: {
        args: ['node', 'src/cli.mjs', 'chrome-mcp-autostart-plan', '--write', '--out', 'operator/chrome-mcp-autostart-plan-latest.json', '--format', 'compact'],
        shell: "'node' 'src/cli.mjs' 'chrome-mcp-autostart-plan' '--write' '--out' 'operator/chrome-mcp-autostart-plan-latest.json' '--format' 'compact'"
      }
    }
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.destructiveActionsIncluded, false);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.complete, false);
  assert.equal(status.objective.recommendedCommand.id, 'login-capture-wait');
  assert.equal(status.objective.handoffResume.loginOpenStatus, 'login-opened');
  assert.equal(status.objective.handoffResume.loginOpenPort, '59036');
  assert.equal(status.objective.handoffResume.latestResumeLoginOpenPort, '56789');
  assert.equal(status.objective.handoffResume.operatorHandoffAuthCheckPort, '59036');
  assert.equal(status.objective.authWatch.status, 'not-ok');
  assert.equal(status.objective.authWatch.active, true);
  assert.equal(status.objective.authWatchLatest.status, 'timed-out');
  assert.equal(status.objectiveSafeCommand.commandId, 'auth-watch');
  assert.equal(status.objectiveSafeCommand.monitorOnly, true);
  assert.equal(status.objectiveSafeCommand.mayOpenBrowser, false);
  assert.equal(status.objectiveSafeCommand.startsCapture, false);
  assert.equal(status.objectiveSafeCommand.backgroundProof.captureBlocked, true);
  assert.equal(status.objectiveSafeCommand.backgroundProof.captureStartBlockers[0], 'operator-ok-required');
  assert.equal(status.objectiveSafeCommand.agentProofStep.startReadyToRun, false);
  assert.equal(status.objectiveSafeCommand.agentProofStep.selectedCommandId, 'monitor-auth');
  assert.equal(status.objectiveSafeCommand.agentProofStep.opensBrowserNow, false);
  assert.equal(status.objectiveSafeCommand.agentProofStep.startsCaptureNow, false);
  assert.equal(status.objectiveSafeCommand.targetApproval.selectedCandidate, 'github');
  assert.equal(status.objectiveSafeCommand.targetApproval.resumeReadyToRun, true);
  assert.equal(status.objectiveSafeCommand.targetApproval.resumeOperatorOkRequired, true);
  assert.equal(status.objectiveSafeCommand.targetApproval.resumeOperatorOkAccepted, false);
  assert.equal(status.objectiveSafeCommand.targetApproval.resumeAgentMayRunUnattended, false);
  assert.equal(status.objectiveSafeCommand.targetApproval.resumePlannedCommandOpensBrowser, true);
  assert.equal(status.objectiveSafeCommand.targetApproval.resumePlannedCommandStartsCapture, true);
  assert.equal(status.objectiveSafeCommand.targetApproval.operatorApprovalSummaryRequiresOperatorOk, true);
  assert.equal(status.objectiveSafeCommand.targetApproval.operatorApprovalSummaryOperatorOkAccepted, false);
  assert.equal(status.objectiveSafeCommand.targetApproval.operatorApprovalSummaryMayOpenBrowser, true);
  assert.equal(status.objectiveSafeCommand.targetApproval.operatorApprovalSummaryMayStartCapture, true);
  assert.equal(status.objectiveSafeCommand.targetApproval.operatorApprovalSummaryReadsBrowserStorage, false);
  assert.equal(status.objectiveSafeCommand.targetApproval.operatorApprovalSummaryReturnsPageContent, false);
  assert.equal(status.objectiveSafeCommand.targetApproval.operatorApprovalSummaryAgentMustNotRunUnattended, true);
  assert.equal(status.objectiveSafeCommand.targetApproval.resumePreflightCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(status.objectiveSafeCommand.targetApproval.resumeProofPlanCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");
  assert.equal(status.objectiveSafeCommand.targetApproval.resumeStatusCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume-status' '--in' 'operator/target-approval-resume-latest.json' '--format' 'compact'");
  assert.equal(status.objectiveSafeCommand.targetApproval.resumeWatchCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator/target-approval-resume-latest.json' '--out' 'operator/target-approval-resume-latest.json' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(status.agentLoop.nextAction, 'run-monitor-only-command');
  assert.equal(status.agentLoop.canRunWithoutApproval, true);
  assert.equal(status.agentLoop.commandId, 'auth-watch');
  assert.equal(status.agentLoop.userApprovalRequiredForBackgroundStart, true);
  assert.equal(status.agentLoop.opensBrowserNow, false);
  assert.equal(status.agentLoop.startsCaptureNow, false);
  assert.equal(status.agentLoop.command.shell, "'node' 'src/cli.mjs' 'target-auth-watch' '--cdp-port' '59036'");
  assert.equal(status.agentLoop.stepPlanCommand.shell, "'node' 'src/cli.mjs' 'agent-loop-step' '--write' '--out' 'operator/agent-loop-step-latest.json' '--format' 'compact'");
  assert.equal(status.agentLoop.stepRunCommand.shell, "'node' 'src/cli.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator/agent-loop-step-latest.json' '--timeout-ms' '300000' '--format' 'compact'");
  assert.equal(status.agentLoop.stepStatusCommand.shell, "'node' 'src/cli.mjs' 'agent-loop-step-status' '--in' 'operator/agent-loop-step-latest.json' '--format' 'compact'");
  assert.equal(status.agentLoop.backgroundCaptureStartCommand.shell, "'node' 'src/cli.mjs' 'background-proof-capture-start' '--mode' 'capture' '--run' '--operator-ok' 'OK' '--format' 'compact'");
  assert.equal(status.agentLoop.backgroundMonitorStartCommand.shell, "'node' 'src/cli.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'");
  assert.equal(status.agentLoop.backgroundNoOpenWaitCaptureCommand, null);
  assert.equal(status.browser.devtoolsOk, true);
  assert.equal(status.browser.chromeAppProcesses, 3);
  assert.equal(status.browser.regularChromeProfiles, 1);
  assert.equal(status.browser.regularChromeDebuggable, false);
  assert.equal(status.browser.targetChromeProfiles, 1);
  assert.equal(status.browser.targetChromeDebuggable, true);
  assert.equal(status.browser.codexChromeProfiles, 1);
  assert.equal(status.browser.everydayChromeExtensionPrepared, true);
  assert.equal(status.browser.everydayChromeExtensionBackendAvailable, false);
  assert.equal(status.browser.everydayChromeExtensionReady, false);
  assert.equal(status.browser.everydayChromeCdpAllowed, false);
  assert.equal(status.browser.codexChromeExtensionEnabled, true);
  assert.equal(status.browser.codexChromeExtensionNativeHostCorrect, true);
  assert.equal(status.browser.codexChromeExtensionSelectedProfile, 'Default');
  assert.equal(status.browser.defaultBrowserHttps, 'Dia');
  assert.equal(status.browser.ownerSessions, 2);
  assert.equal(status.backendMatrix.status, 'fresh');
  assert.equal(status.backendMatrix.defaultBackend, 'direct-cdp-chrome');
  assert.equal(status.backendMatrix.searchBackend, 'direct-cdp-chrome');
  assert.equal(status.backendMatrix.operateBackend, 'direct-cdp-chrome');
  assert.equal(status.backendMatrix.authenticatedBackend, 'direct-cdp-chrome');
  assert.equal(status.backendMatrix.existingTabBackend, 'codex-chrome-extension');
  assert.equal(status.backendMatrix.chromeMcpListPagesTimedOut, true);
  assert.equal(status.backendMatrix.chromeMcpTimeoutPlanSource, 'latest-file');
  assert.equal(status.backendMatrix.chromeMcpTimeoutPlanStatus, 'mcp-connected-page-list-timeout');
  assert.equal(status.backendMatrix.chromeMcpTimeoutPlanStale, false);
  assert.equal(status.backendMatrix.chromeMcpTimeoutPlanPreferExtensionResume, true);
  assert.equal(status.backendMatrix.savedSecretValuesRead, false);
  assert.equal(status.providerDoctorStatus.defaultBackend, 'direct-cdp-chrome');
  assert.equal(status.providerDoctorStatus.agentBrowserCliExists, false);
  assert.equal(status.providerDoctorStatus.agentBrowserChromeForTestingExists, true);
  assert.deepEqual(status.providerDoctorStatus.agentBrowserMissingChecks, ['cli.agent-browser']);
  assert.equal(status.providerDoctorStatus.publicBenchmarkProofExists, true);
  assert.equal(status.providerDoctorStatus.publicBenchmarkProofOk, true);
  assert.match(status.providerDoctorStatus.publicBenchmarkProofPath, /default-public\.json/);
  assert.equal(status.providerDoctorStatus.publicBenchmarkFastestMeasuredProvider, 'direct-cdp-daemon');
  assert.equal(status.providerDoctorStatus.publicBenchmarkDirectCdpColdOk, true);
  assert.equal(status.providerDoctorStatus.publicBenchmarkDirectCdpDaemonOk, true);
  assert.equal(status.providerDoctorStatus.publicBenchmarkAgentBrowserChromeOk, true);
  assert.equal(status.providerDoctorStatus.publicBenchmarkPlaywrightOk, true);
  assert.equal(status.providerDoctorStatus.publicBenchmarkAgentMayRunUnattended, true);
  assert.equal(status.providerDoctorStatus.publicBenchmarkStartsBrowser, true);
  assert.equal(status.providerDoctorStatus.publicBenchmarkReadsBrowserStorage, false);
  assert.equal(status.providerDoctorStatus.publicBenchmarkReturnsPageContent, false);
  assert.match(status.providerDoctorStatus.publicBenchmarkCommand, /default-public\.json/);
  assert.equal(status.providerDoctorStatus.lightpandaReadyForPublicBenchmark, false);
  assert.deepEqual(status.providerDoctorStatus.lightpandaMissingChecks, ['binary.available']);
  assert.equal(status.providerDoctorStatus.lightpandaBenchmarkStartsBrowser, true);
  assert.equal(status.providerDoctorStatus.lightpandaBenchmarkReadsBrowserStorage, false);
  assert.equal(status.providerDoctorStatus.lightpandaBenchmarkReturnsPageContent, false);
  assert.match(status.providerDoctorStatus.lightpandaBenchmarkCommand, /lightpanda-public\.json/);
  assert.equal(status.providerDoctorStatus.playwrightReadyForPublicSmoke, true);
  assert.equal(status.providerDoctorStatus.playwrightReadyForAuthenticatedDefault, false);
  assert.deepEqual(status.providerDoctorStatus.playwrightMissingChecks, ['auth.storage-state-boundary']);
  assert.equal(status.providerDoctorStatus.playwrightStorageStateSensitive, true);
  assert.equal(status.providerDoctorStatus.playwrightSmokeAgentMayRunUnattended, true);
  assert.equal(status.providerDoctorStatus.playwrightSmokeStartsBrowser, true);
  assert.equal(status.providerDoctorStatus.playwrightSmokeReadsBrowserStorage, false);
  assert.equal(status.providerDoctorStatus.playwrightSmokeReturnsPageContent, false);
  assert.match(status.providerDoctorStatus.playwrightSmokeCommand, /outline-playwright/);
  assert.equal(status.providerDoctorStatus.playwrightPublicSmokeProofExists, true);
  assert.equal(status.providerDoctorStatus.playwrightPublicSmokeProofOk, true);
  assert.match(status.providerDoctorStatus.playwrightPublicSmokeProofPath, /playwright-public-smoke\.json/);
  assert.equal(status.providerDoctorStatus.playwrightPublicSmokeProofHeadingCount, 1);
  assert.equal(status.providerDoctorStatus.playwrightPublicSmokeProofLinkCount, 1);
  assert.match(status.providerDoctorStatus.playwrightSmokeProofCommand, /playwright-public-smoke\.json/);
  assert.equal(status.providerDoctorStatus.playwrightSmokeProofAgentMayRunUnattended, true);
  assert.equal(status.providerDoctorStatus.playwrightSmokeProofStartsBrowser, true);
  assert.equal(status.providerDoctorStatus.playwrightSmokeProofReadsBrowserStorage, false);
  assert.equal(status.providerDoctorStatus.playwrightSmokeProofReturnsPageContent, false);
  assert.equal(status.providerDoctorStatus.seleniumReadyForLocalSmoke, false);
  assert.deepEqual(status.providerDoctorStatus.seleniumMissingChecks, ['package.selenium-webdriver']);
  assert.match(status.providerDoctorStatus.seleniumSmokeCommand, /selenium-doctor/);
  assert.equal(status.chromeMcpTimeoutPlan.status, 'mcp-connected-page-list-timeout');
  assert.equal(status.chromeMcpTimeoutPlan.exists, true);
  assert.equal(status.chromeMcpTimeoutPlan.pageListTimeout, true);
  assert.equal(status.chromeMcpTimeoutPlan.newBackgroundTabsAllowed, true);
  assert.equal(status.chromeMcpTimeoutPlan.newBackgroundUrlEnv, 'REGULAR_CHROME_URL');
  assert.equal(status.chromeMcpTimeoutPlan.newBackgroundUrlValueRead, false);
  assert.equal(status.chromeMcpTimeoutPlan.preferExtensionResume, true);
  assert.deepEqual(status.chromeMcpTimeoutPlan.findings, ['page-list-timeout', 'duplicate-mcp-servers']);
  assert.deepEqual(status.chromeMcpTimeoutPlan.cleanupReviewOwnerPids, [200, 300]);
  assert.equal(status.chromeMcpAutostartPlan.exists, true);
  assert.equal(status.chromeMcpAutostartPlan.browserUrl, 'http://127.0.0.1:9223');
  assert.equal(status.chromeMcpAutostartPlan.plistExists, true);
  assert.equal(status.chromeMcpAutostartPlan.installPathExists, false);
  assert.equal(status.chromeMcpAutostartPlan.installRequiresOperatorApproval, true);
  assert.equal(status.chromeMcpAutostartPlan.agentMayInstallUnattended, false);
  assert.equal(status.runGate.okForAgentLoops, true);
  assert.equal(status.runGate.unguardedAgentDangerous, 0);
  assert.equal(status.runGate.operatorGated, 9);
  assert.equal(status.runGate.directOperator, 3);
  assert.equal(status.secret.headlessReady, false);
  assert.equal(status.secret.runSelect.selectedCandidate, 'local-desktop');
  assert.equal(status.secret.runSelect.selectedMode, 'local-desktop');
  assert.equal(status.secret.runSelect.readyToRunNow, true);
  assert.equal(status.secret.runSelect.runCommandSafety.opensBrowser, true);
  assert.equal(status.secret.runSelect.runCommandSafety.startsCapture, true);
  assert.equal(status.secret.runSelect.runCommandSafety.requiresOperatorApproval, true);
  assert.equal(status.secret.runSelect.runCommandSafety.agentMayRunUnattended, false);
  assert.equal(status.objectiveSafeCommand.targetCandidatePlan.selectedCandidate, 'github');
  assert.equal(status.objectiveSafeCommand.targetCandidatePlan.targetPackExists, true);
  assert.equal(status.objectiveSafeCommand.targetCandidatePlan.authCheckOk, false);
  assert.equal(status.objectiveSafeCommand.targetCandidatePlan.authCheckLoginLike, true);
  assert.equal(status.objectiveSafeCommand.targetCandidatePlan.nextAction, 'operator-login-and-auth-check');
  assert.ok(status.warnings.includes('peekaboo.duplicated'));
  assert.ok(status.warnings.includes('secret.headless-not-configured'));
  assert.ok(status.warnings.includes('objective.target-handoff-capture'));
  const compact = formatControlStatusCompact(status);
  assert.match(compact, /^objective_status: waiting-for-login/m);
  assert.match(compact, /^handoff_resume_login_open: login-opened/m);
  assert.match(compact, /^handoff_resume_login_port: 59036/m);
  assert.match(compact, /^handoff_auth_check_port: 59036/m);
  assert.match(compact, /^auth_check_command: 'node' 'src\/cli\.mjs' 'target-auth-check' '--cdp-port' '59036'/m);
  assert.match(compact, /^auth_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch' '--cdp-port' '59036'/m);
  assert.match(compact, /^login_capture_wait_command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
  assert.match(compact, /^auth_watch: not-ok/m);
  assert.match(compact, /^auth_watch_active: yes/m);
  assert.match(compact, /^auth_watch_latest: timed-out/m);
  assert.match(compact, /^objective_safe_action: monitor-auth-watch/m);
  assert.match(compact, /^objective_safe_command_id: auth-watch/m);
  assert.match(compact, /^objective_safe_command_monitor_only: yes/m);
  assert.match(compact, /^objective_safe_command_may_open_browser: no/m);
  assert.match(compact, /^objective_safe_command_starts_capture: no/m);
  assert.match(compact, /^background_proof_plan_status: waiting-for-login/m);
  assert.match(compact, /^background_proof_capture_blocked: yes/m);
  assert.match(compact, /^background_proof_monitor_available: yes/m);
  assert.match(compact, /^background_proof_capture_available: yes/m);
  assert.match(compact, /^background_proof_opens_browser_now: no/m);
  assert.match(compact, /^background_proof_starts_capture_now: no/m);
  assert.match(compact, /^background_proof_capture_start_ready: no/m);
  assert.match(compact, /^background_proof_capture_start_blockers: operator-ok-required/m);
  assert.match(compact, /^agent_proof_step_start_status: planned/m);
  assert.match(compact, /^agent_proof_step_start_ready: no/m);
  assert.match(compact, /^agent_proof_step_start_blockers: operator-ok-required,agent-proof-step-not-allowed:auth-not-ready/m);
  assert.match(compact, /^agent_proof_step_selected_command: monitor-auth/m);
  assert.match(compact, /^agent_proof_step_opens_browser_now: no/m);
  assert.match(compact, /^agent_proof_step_starts_capture_now: no/m);
  assert.match(compact, /^target_approval_pack_exists: yes/m);
  assert.match(compact, /^target_approval_pack_parse_ok: yes/m);
  assert.match(compact, /^target_approval_candidate: github/m);
  assert.match(compact, /^target_approval_target_pack_exists: yes/m);
  assert.match(compact, /^target_approval_next: handoff-resume/m);
  assert.match(compact, /^target_approval_human_action: complete-login-in-open-dedicated-browser/m);
  assert.match(compact, /^target_approval_automation_blocker: auth-check-not-ok/m);
  assert.match(compact, /^target_approval_capture_blocked: yes/m);
  assert.match(compact, /^target_approval_next_command_opens_browser: yes/m);
  assert.match(compact, /^target_approval_next_command_starts_capture: yes/m);
  assert.match(compact, /^target_approval_next_command_requires_operator_approval: yes/m);
  assert.match(compact, /^target_approval_next_command_agent_may_run_unattended: no/m);
  assert.match(compact, /^target_approval_resume_status: planned/m);
  assert.match(compact, /^target_approval_resume_ready_to_run: yes/m);
  assert.match(compact, /^target_approval_resume_operator_ok_required: yes/m);
  assert.match(compact, /^target_approval_resume_operator_ok_accepted: no/m);
  assert.match(compact, /^target_approval_resume_agent_may_run_unattended: no/m);
  assert.match(compact, /^target_approval_resume_planned_opens_browser: yes/m);
  assert.match(compact, /^target_approval_resume_planned_starts_capture: yes/m);
  assert.match(compact, /^target_candidate_plan_candidate: github/m);
  assert.match(compact, /^target_candidate_target_pack_exists: yes/m);
  assert.match(compact, /^target_candidate_metadata_ok: yes/m);
  assert.match(compact, /^target_candidate_auth_check_exists: yes/m);
  assert.match(compact, /^target_candidate_auth_check_ok: no/m);
  assert.match(compact, /^target_candidate_auth_check_login_like: true/m);
  assert.match(compact, /^target_candidate_benchmark_exists: no/m);
  assert.match(compact, /^target_candidate_proof_ready: no/m);
  assert.match(compact, /^target_candidate_proof_accepted: no/m);
  assert.match(compact, /^target_candidate_next_action: operator-login-and-auth-check/m);
  assert.match(compact, /^operator_approval_summary_scope: real-external-auth-target-proof/m);
  assert.match(compact, /^operator_approval_summary_human_action: complete-login-in-open-dedicated-browser/m);
  assert.match(compact, /^operator_approval_summary_requires_operator_ok: yes/m);
  assert.match(compact, /^operator_approval_summary_operator_ok_accepted: no/m);
  assert.match(compact, /^operator_approval_summary_may_open_browser: yes/m);
  assert.match(compact, /^operator_approval_summary_may_start_capture: yes/m);
  assert.match(compact, /^operator_approval_summary_reads_browser_storage: no/m);
  assert.match(compact, /^operator_approval_summary_returns_page_content: no/m);
  assert.match(compact, /^operator_approval_summary_agent_must_not_run_unattended: yes/m);
  assert.match(compact, /^agent_loop_next_action: run-monitor-only-command/m);
  assert.match(compact, /^agent_loop_can_run_without_approval: yes/m);
  assert.match(compact, /^agent_loop_command_id: auth-watch/m);
  assert.match(compact, /^agent_loop_user_approval_required_for_background_start: yes/m);
  assert.match(compact, /^agent_loop_opens_browser_now: no/m);
  assert.match(compact, /^agent_loop_starts_capture_now: no/m);
  assert.match(compact, /^devtools_9223_ok: yes/m);
  assert.match(compact, /^regular_chrome_profiles: 1/m);
  assert.match(compact, /^regular_chrome_debuggable: no/m);
  assert.match(compact, /^target_chrome_profiles: 1/m);
  assert.match(compact, /^target_chrome_debuggable: yes/m);
  assert.match(compact, /^everyday_chrome_extension_prepared: yes/m);
  assert.match(compact, /^everyday_chrome_extension_backend_available: no/m);
  assert.match(compact, /^everyday_chrome_extension_ready: no/m);
  assert.match(compact, /^everyday_chrome_cdp_allowed: no/m);
  assert.match(compact, /^codex_chrome_extension_enabled: yes/m);
  assert.match(compact, /^codex_chrome_extension_native_host: yes/m);
  assert.match(compact, /^codex_chrome_extension_profile: Default/m);
  assert.match(compact, /^default_browser_https: Dia/m);
  assert.match(compact, /^backend_matrix_status: fresh/m);
  assert.match(compact, /^backend_matrix_default_backend: direct-cdp-chrome/m);
  assert.match(compact, /^backend_matrix_search_backend: direct-cdp-chrome/m);
  assert.match(compact, /^backend_matrix_analyze_backend: direct-cdp-chrome/m);
  assert.match(compact, /^backend_matrix_scrape_backend: direct-cdp-chrome/m);
  assert.match(compact, /^backend_matrix_operate_backend: direct-cdp-chrome/m);
  assert.match(compact, /^backend_matrix_authenticated_backend: direct-cdp-chrome/m);
  assert.match(compact, /^backend_matrix_existing_tab_backend: codex-chrome-extension/m);
  assert.match(compact, /^backend_matrix_chrome_mcp_list_pages_timed_out: yes/m);
  assert.match(compact, /^backend_matrix_chrome_mcp_timeout_plan_source: latest-file/m);
  assert.match(compact, /^backend_matrix_chrome_mcp_timeout_plan_status: mcp-connected-page-list-timeout/m);
  assert.match(compact, /^backend_matrix_chrome_mcp_timeout_plan_stale: no/m);
  assert.match(compact, /^backend_matrix_chrome_mcp_timeout_plan_prefer_extension_resume: yes/m);
  assert.match(compact, /^backend_matrix_saved_secret_values_read: no/m);
  assert.match(compact, /^provider_doctor_default_backend: direct-cdp-chrome/m);
  assert.match(compact, /^provider_doctor_default_agent_interface: secure-browser-agent-mcp/m);
  assert.match(compact, /^provider_doctor_agent_browser_cli_exists: no/m);
  assert.match(compact, /^provider_doctor_agent_browser_chrome_for_testing_exists: yes/m);
  assert.match(compact, /^provider_doctor_agent_browser_missing_checks: cli\.agent-browser/m);
  assert.match(compact, /^provider_doctor_public_benchmark_proof_exists: yes/m);
  assert.match(compact, /^provider_doctor_public_benchmark_proof_ok: yes/m);
  assert.match(compact, /^provider_doctor_public_benchmark_proof_path: \/tmp\/runs\/provider-benchmarks\/default-public\.json/m);
  assert.match(compact, /^provider_doctor_public_benchmark_fastest_measured_provider: direct-cdp-daemon/m);
  assert.match(compact, /^provider_doctor_public_benchmark_direct_cdp_cold_ok: yes/m);
  assert.match(compact, /^provider_doctor_public_benchmark_direct_cdp_daemon_ok: yes/m);
  assert.match(compact, /^provider_doctor_public_benchmark_agent_browser_chrome_ok: yes/m);
  assert.match(compact, /^provider_doctor_public_benchmark_playwright_ok: yes/m);
  assert.match(compact, /^provider_doctor_public_benchmark_agent_may_run_unattended: yes/m);
  assert.match(compact, /^provider_doctor_public_benchmark_starts_browser: yes/m);
  assert.match(compact, /^provider_doctor_public_benchmark_reads_browser_storage: no/m);
  assert.match(compact, /^provider_doctor_public_benchmark_returns_page_content: no/m);
  assert.match(compact, /^provider_doctor_public_benchmark_command: node src\/cli\.mjs benchmark --iterations 1 --write --out provider-benchmarks\/default-public\.json --format json/m);
  assert.match(compact, /^provider_doctor_lightpanda_ready_for_public_benchmark: no/m);
  assert.match(compact, /^provider_doctor_lightpanda_missing_checks: binary\.available/m);
  assert.match(compact, /^provider_doctor_lightpanda_benchmark_starts_browser: yes/m);
  assert.match(compact, /^provider_doctor_lightpanda_benchmark_reads_browser_storage: no/m);
  assert.match(compact, /^provider_doctor_lightpanda_benchmark_returns_page_content: no/m);
  assert.match(compact, /^provider_doctor_lightpanda_benchmark_command: LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="\/tmp\/lightpanda" node src\/cli\.mjs benchmark --url https:\/\/example\.com --iterations 1 --write --out provider-benchmarks\/lightpanda-public\.json --format json/m);
  assert.match(compact, /^provider_doctor_playwright_ready_for_public_smoke: yes/m);
  assert.match(compact, /^provider_doctor_playwright_ready_for_authenticated_default: no/m);
  assert.match(compact, /^provider_doctor_playwright_missing_checks: auth\.storage-state-boundary/m);
  assert.match(compact, /^provider_doctor_playwright_storage_state_sensitive: yes/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_agent_may_run_unattended: yes/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_starts_browser: yes/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_reads_browser_storage: no/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_returns_page_content: no/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>'/m);
  assert.match(compact, /^provider_doctor_playwright_public_smoke_proof_exists: yes/m);
  assert.match(compact, /^provider_doctor_playwright_public_smoke_proof_ok: yes/m);
  assert.match(compact, /^provider_doctor_playwright_public_smoke_proof_path: \/tmp\/runs\/provider-benchmarks\/playwright-public-smoke\.json/m);
  assert.match(compact, /^provider_doctor_playwright_public_smoke_proof_heading_count: 1/m);
  assert.match(compact, /^provider_doctor_playwright_public_smoke_proof_link_count: 1/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_proof_agent_may_run_unattended: yes/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_proof_starts_browser: yes/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_proof_reads_browser_storage: no/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_proof_returns_page_content: no/m);
  assert.match(compact, /^provider_doctor_playwright_smoke_proof_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>' --out provider-benchmarks\/playwright-public-smoke\.json/m);
  assert.match(compact, /^provider_doctor_selenium_ready_for_local_smoke: no/m);
  assert.match(compact, /^provider_doctor_selenium_missing_checks: package\.selenium-webdriver/m);
  assert.match(compact, /^provider_doctor_selenium_smoke_command: node src\/cli\.mjs selenium-doctor --format compact/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_status: mcp-connected-page-list-timeout/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_exists: yes/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_page_list_timeout: yes/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_new_background_tabs_allowed: yes/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_new_background_url_env: REGULAR_CHROME_URL/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_new_background_url_value_read: no/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_prefer_extension_resume: yes/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_next_action: use-gated-extension-resume-or-clean-stale-mcp/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_findings: page-list-timeout,duplicate-mcp-servers/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_cleanup_review_owner_pids: 200,300/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_exists: yes/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_browser_url: http:\/\/127\.0\.0\.1:9223/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_plist_exists: yes/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_install_path_exists: no/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_install_requires_operator_approval: yes/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_agent_may_install_unattended: no/m);
  assert.match(compact, /^run_gate_ok_for_agent_loops: yes$/m);
  assert.match(compact, /^run_gate_unguarded_agent_dangerous: 0$/m);
  assert.match(compact, /^run_gate_operator_gated: 9$/m);
  assert.match(compact, /^run_gate_direct_operator: 3$/m);
  assert.match(compact, /^run_gate_opens_browser_now: no$/m);
  assert.match(compact, /^run_gate_starts_capture_now: no$/m);
  assert.match(compact, /^secret_values_read: no/m);
  assert.match(compact, /^secret_run_command_id: target-login-capture/m);
  assert.match(compact, /^secret_run_selected_candidate: local-desktop/m);
  assert.match(compact, /^secret_run_selected_mode: local-desktop/m);
  assert.match(compact, /^secret_run_headless: no/m);
  assert.match(compact, /^secret_run_ready_to_run_now: yes/m);
  assert.match(compact, /^secret_run_setup_required: none/m);
  assert.match(compact, /^secret_run_wrapped_opens_browser: yes/m);
  assert.match(compact, /^secret_run_wrapped_starts_capture: yes/m);
  assert.match(compact, /^secret_run_wrapped_requires_operator_approval: yes/m);
  assert.match(compact, /^secret_run_wrapped_agent_may_run_unattended: no/m);
  assert.doesNotMatch(compact, /^command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
  assert.match(compact, /^command: 'node' 'src\/cli\.mjs' 'target-auth-watch' '--cdp-port' '59036'/m);
  assert.match(compact, /^login_capture_wait_opens_browser: yes$/m);
  assert.match(compact, /^login_capture_wait_requires_operator_approval: yes$/m);
  assert.match(compact, /^login_capture_wait_agent_may_run_unattended: no$/m);
  assert.doesNotMatch(compact, /\/tmp\/sba\/runs\/target-packs\/github/);
  assert.match(compact, /^objective_safe_command: 'node' 'src\/cli\.mjs' 'objective-safe-command' '--format' 'compact'/m);
  assert.match(compact, /^provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'/m);
  assert.match(compact, /^runtime_audit_command: 'node' 'src\/cli\.mjs' 'runtime-audit' '--format' 'compact'/m);
  assert.match(compact, /^runtime_cleanup_plan_command: 'node' 'src\/cli\.mjs' 'runtime-cleanup-plan' '--format' 'compact'/m);
  assert.match(compact, /^backend_matrix_refresh_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--write' '--out' 'operator\/backend-matrix-latest\.json' '--format' 'compact'/m);
  assert.match(compact, /^backend_matrix_status_command: 'node' 'src\/cli\.mjs' 'backend-matrix-status' '--in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_status_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan-status' '--format' 'compact'/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_refresh_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan' '--write' '--format' 'compact'/m);
  assert.match(compact, /^run_gate_audit_command: 'node' 'src\/cli\.mjs' 'run-gate-audit' '--format' 'compact'/m);
  assert.match(compact, /^secret_run_select_opens_browser: no$/m);
  assert.match(compact, /^secret_run_select_starts_capture: no$/m);
  assert.match(compact, /^secret_run_select_requires_operator_approval: no$/m);
  assert.match(compact, /^secret_run_select_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^secret_run_select_command: 'node' 'src\/cli\.mjs' 'secret-run-select' '--command' 'target-login-capture' '--target-dir' 'runs\/target-packs\/github' '--format' 'compact'/m);
  assert.match(compact, /^secret_run_wrapped_command: 'op' 'run' '--' 'node' 'src\/cli\.mjs' 'target-login-capture' 'runs\/target-packs\/github'/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_regular_chrome_use_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect'/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_runtime_cleanup_command: 'node' 'src\/cli\.mjs' 'runtime-cleanup-plan' '--format' 'compact'/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_extension_resume_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK' '--format' 'compact'/m);
  assert.match(compact, /^chrome_mcp_timeout_plan_retry_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-status' '--format' 'compact'/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-autostart-plan' '--format' 'compact'/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_status_command: 'launchctl' 'print' 'gui\/501\/local\.secure-browser-agent\.chrome-devtools-mcp'/m);
  assert.match(compact, /^chrome_mcp_autostart_plan_refresh_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-autostart-plan' '--write' '--out' 'operator\/chrome-mcp-autostart-plan-latest\.json' '--format' 'compact'/m);
  assert.match(compact, /^background_proof_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status' '--format' 'compact'/m);
  assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_command: /m);
  assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_background_command: /m);
  assert.match(compact, /^background_proof_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture' '--run' '--operator-ok' 'OK' '--format' 'compact'/m);
  assert.match(compact, /^background_proof_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'/m);
  assert.match(compact, /^agent_proof_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-proof-step' '--format' 'compact'/m);
  assert.match(compact, /^agent_proof_step_start_command: 'node' 'src\/cli\.mjs' 'agent-proof-step-start' '--run' '--operator-ok' 'OK' '--out' 'operator\/agent-proof-step-latest\.json' '--format' 'compact'/m);
  assert.match(compact, /^agent_proof_step_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-step-status' '--in' 'operator\/agent-proof-step-latest\.json' '--format' 'compact'/m);
  assert.match(compact, /^target_approval_status_command: 'node' 'src\/cli\.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'/m);
  assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'/m);
  assert.match(compact, /^target_approval_resume_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'/m);
  assert.match(compact, /^target_approval_resume_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'/m);
  assert.match(compact, /^target_approval_resume_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'/m);
  assert.match(compact, /^target_approval_resume_status_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-status' '--in' 'operator\/target-approval-resume-latest\.json' '--format' 'compact'/m);
  assert.match(compact, /^target_approval_resume_watch_opens_browser: no$/m);
  assert.match(compact, /^target_approval_resume_watch_starts_capture: no$/m);
  assert.match(compact, /^target_approval_resume_watch_requires_operator_approval: no$/m);
  assert.match(compact, /^target_approval_resume_watch_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^target_approval_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-approval-resume-watch' '--run' '--in' 'operator\/target-approval-resume-latest\.json' '--out' 'operator\/target-approval-resume-latest\.json' '--candidate' 'github' '--real-external' '--format' 'compact'/m);
  assert.match(compact, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'/m);
  assert.match(compact, /^target_candidate_plan_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan' '--candidate' 'github' '--format' 'compact'/m);
  assert.match(compact, /^agent_loop_status_command: 'node' 'src\/cli\.mjs' 'control-status' '--format' 'compact'/m);
  assert.match(compact, /^agent_loop_command: 'node' 'src\/cli\.mjs' 'target-auth-watch' '--cdp-port' '59036'/m);
  assert.match(compact, /^agent_loop_poll_command: 'node' 'src\/cli\.mjs' 'target-auth-watch' '--cdp-port' '59036'/m);
  assert.match(compact, /^agent_loop_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'/m);
  assert.match(compact, /^agent_loop_step_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'/m);
  assert.match(compact, /^agent_loop_step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'/m);
  assert.match(compact, /^agent_loop_background_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status' '--format' 'compact'/m);
  assert.doesNotMatch(compact, /^agent_loop_background_no_open_wait_capture_command: /m);
  assert.doesNotMatch(compact, /^agent_loop_background_no_open_wait_capture_background_command: /m);
  assert.match(compact, /^agent_loop_background_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture' '--run' '--operator-ok' 'OK' '--format' 'compact'/m);
  assert.match(compact, /^agent_loop_background_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'/m);
  const markdown = formatControlStatusMarkdown(status);
  assert.match(markdown, /Control Status/);
  assert.match(markdown, /Recommended command: login-capture-wait/);
  assert.match(markdown, /Handoff resume login open: login-opened/);
  assert.match(markdown, /Auth watch active: yes/);
  assert.match(markdown, /Objective safe command ID: auth-watch/);
  assert.match(markdown, /Background proof capture blocked: yes/);
  assert.match(markdown, /Target approval candidate: github/);
  assert.match(markdown, /Target approval resume status: planned/);
  assert.match(markdown, /Target approval resume planned opens browser: yes/);
  assert.match(markdown, /Agent loop next action: run-monitor-only-command/);
  assert.match(markdown, /Agent loop user approval required for background start: yes/);
  assert.match(markdown, /Regular Chrome remote debugging: no/);
  assert.match(markdown, /Target-pack Chrome remote debugging: yes/);
  assert.match(markdown, /Everyday Chrome via Codex Extension prepared: yes/);
  assert.match(markdown, /Everyday Chrome via Codex Extension backend available: no/);
  assert.match(markdown, /Everyday Chrome via Codex Extension ready: no/);
  assert.match(markdown, /Everyday Chrome via CDP allowed: no/);
  assert.match(markdown, /Codex Chrome Extension selected profile: Default/);
  assert.match(markdown, /Default backend: direct-cdp-chrome/);
  assert.match(markdown, /Existing tab backend: codex-chrome-extension/);
  assert.match(markdown, /Chrome MCP Timeout Plan/);
  assert.match(markdown, /Page list timeout: yes/);
  assert.match(markdown, /Run Gate/);
  assert.match(markdown, /Unguarded agent dangerous: 0/);

  const next = buildAgentNext(status);
  assert.equal(next.safeMode, true);
  assert.equal(next.complete, false);
  assert.equal(next.nextAction, 'run-monitor-only-command');
  assert.equal(next.agentCanRunWithoutApproval, true);
  assert.equal(next.agentCommandId, 'auth-watch');
  assert.equal(next.agentRunCommand.shell, "'node' 'src/cli.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator/agent-loop-step-latest.json' '--timeout-ms' '300000' '--format' 'compact'");
  assert.equal(next.agentPollCommand.shell, "'node' 'src/cli.mjs' 'target-auth-watch' '--cdp-port' '59036'");
  assert.equal(next.agentPreflightAvailable, true);
  assert.equal(next.agentPreflightAction, 'run-operator-approval-preflight');
  assert.equal(next.agentPreflightMayRunWithoutApproval, true);
  assert.equal(next.agentPreflightCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(next.agentProofPlanAvailable, true);
  assert.equal(next.agentProofPlanAction, 'run-target-proof-plan');
  assert.equal(next.agentProofPlanMayRunWithoutApproval, true);
  assert.equal(next.agentProofPlanCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");
  assert.equal(next.operatorApprovalRequired, true);
  assert.equal(next.operatorApprovalCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'");
  assert.equal(next.operatorApprovalPreflightCommand.shell, "'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(next.operatorApprovalProofPlanCommand.shell, "'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'");
  assert.equal(next.operatorApprovalPlanCommand.shell, "'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'");
  assert.equal(next.objectiveCompletionStrictCommand.shell, "'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'");
  assert.equal(next.operatorApprovalPreflightOpensBrowser, false);
  assert.equal(next.operatorApprovalPreflightStartsCapture, false);
  assert.equal(next.operatorApprovalPreflightReadsBrowserStorage, false);
  assert.equal(next.operatorApprovalPreflightReturnsPageContent, false);
  assert.equal(next.operatorApprovalPreflightMayRunUnattended, true);
  assert.equal(next.operatorApprovalProofPlanOpensBrowser, false);
  assert.equal(next.operatorApprovalProofPlanStartsCapture, false);
  assert.equal(next.operatorApprovalProofPlanReadsBrowserStorage, false);
  assert.equal(next.operatorApprovalProofPlanReturnsPageContent, false);
  assert.equal(next.operatorApprovalProofPlanMayRunUnattended, true);
  assert.equal(next.operatorApprovalCommandOpensBrowser, true);
  assert.equal(next.operatorApprovalCommandStartsCapture, true);
  assert.equal(next.operatorApprovalCommandAgentMayRunUnattended, false);
  assert.equal(next.opensBrowserNow, false);
  assert.equal(next.startsCaptureNow, false);
  assert.equal(next.runGateUnguardedAgentDangerous, 0);
  assert.equal(next.defaultBackend, 'direct-cdp-chrome');
  assert.equal(next.existingTabBackend, 'codex-chrome-extension');
  assert.equal(next.providerDefaultBackend, 'direct-cdp-chrome');
  assert.equal(next.providerDefaultAgentInterface, 'secure-browser-agent-mcp');
  assert.equal(next.providerPublicBenchmarkProofExists, true);
  assert.equal(next.providerPublicBenchmarkProofOk, true);
  assert.match(next.providerPublicBenchmarkProofPath, /default-public\.json/);
  assert.equal(next.providerPublicBenchmarkFastestMeasuredProvider, 'direct-cdp-daemon');
  assert.equal(next.providerPublicBenchmarkDirectCdpColdOk, true);
  assert.equal(next.providerPublicBenchmarkDirectCdpDaemonOk, true);
  assert.equal(next.providerPublicBenchmarkAgentBrowserChromeOk, true);
  assert.equal(next.providerPublicBenchmarkPlaywrightOk, true);
  assert.equal(next.providerPublicBenchmarkAgentMayRunUnattended, true);
  assert.equal(next.providerPublicBenchmarkStartsBrowser, true);
  assert.equal(next.providerPublicBenchmarkReadsBrowserStorage, false);
  assert.equal(next.providerPublicBenchmarkReturnsPageContent, false);
  assert.match(next.providerPublicBenchmarkCommand, /default-public\.json/);
  assert.equal(next.providerLightpandaReadyForPublicBenchmark, false);
  assert.equal(next.providerLightpandaBenchmarkAgentMayRunUnattended, false);
  assert.equal(next.providerLightpandaBenchmarkStartsBrowser, true);
  assert.equal(next.providerLightpandaBenchmarkReadsBrowserStorage, false);
  assert.equal(next.providerLightpandaBenchmarkReturnsPageContent, false);
  assert.match(next.providerLightpandaBenchmarkCommand, /lightpanda-public\.json/);
  assert.equal(next.providerPlaywrightReadyForPublicSmoke, true);
  assert.equal(next.providerPlaywrightReadyForAuthenticatedDefault, false);
  assert.equal(next.providerPlaywrightStorageStateSensitive, true);
  assert.equal(next.providerPlaywrightSmokeCommand, "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'");
  assert.equal(next.providerSeleniumReadyForLocalSmoke, false);
  assert.equal(next.providerSeleniumSmokeAgentMayRunUnattended, true);
  assert.equal(next.providerSeleniumSmokeStartsBrowser, false);
  assert.equal(next.providerSeleniumSmokeCommand, 'node src/cli.mjs selenium-doctor --format compact');
  assert.equal(next.providerDoctorCommand.shell, "'node' 'src/cli.mjs' 'provider-doctor-status' '--format' 'compact'");
  assert.equal(next.providerDoctorOpensBrowser, false);
  assert.equal(next.providerDoctorStartsCapture, false);
  assert.equal(next.providerDoctorReadsBrowserStorage, false);
  assert.equal(next.providerDoctorReturnsPageContent, false);
  assert.equal(next.providerDoctorMayRunUnattended, true);
  assert.equal(next.secretValuesRead, false);
  const nextCompact = formatAgentNextCompact(next);
  assert.match(nextCompact, /^agent_next_action: run-monitor-only-command$/m);
  assert.match(nextCompact, /^agent_can_run_without_approval: yes$/m);
  assert.match(nextCompact, /^agent_preflight_available: yes$/m);
  assert.match(nextCompact, /^agent_preflight_action: run-operator-approval-preflight$/m);
  assert.match(nextCompact, /^agent_preflight_may_run_without_approval: yes$/m);
  assert.match(nextCompact, /^agent_proof_plan_available: yes$/m);
  assert.match(nextCompact, /^agent_proof_plan_action: run-target-proof-plan$/m);
  assert.match(nextCompact, /^agent_proof_plan_may_run_without_approval: yes$/m);
  assert.match(nextCompact, /^operator_approval_required: yes$/m);
  assert.match(nextCompact, /^operator_approval_preflight_opens_browser: no$/m);
  assert.match(nextCompact, /^operator_approval_preflight_starts_capture: no$/m);
  assert.match(nextCompact, /^operator_approval_preflight_reads_browser_storage: no$/m);
  assert.match(nextCompact, /^operator_approval_preflight_returns_page_content: no$/m);
  assert.match(nextCompact, /^operator_approval_preflight_may_run_unattended: yes$/m);
  assert.match(nextCompact, /^operator_approval_proof_plan_opens_browser: no$/m);
  assert.match(nextCompact, /^operator_approval_proof_plan_starts_capture: no$/m);
  assert.match(nextCompact, /^operator_approval_proof_plan_reads_browser_storage: no$/m);
  assert.match(nextCompact, /^operator_approval_proof_plan_returns_page_content: no$/m);
  assert.match(nextCompact, /^operator_approval_proof_plan_may_run_unattended: yes$/m);
  assert.match(nextCompact, /^operator_approval_opens_browser: yes$/m);
  assert.match(nextCompact, /^operator_approval_starts_capture: yes$/m);
  assert.match(nextCompact, /^operator_approval_agent_may_run_unattended: no$/m);
  assert.match(nextCompact, /^opens_browser_now: no$/m);
  assert.match(nextCompact, /^starts_capture_now: no$/m);
  assert.match(nextCompact, /^default_backend: direct-cdp-chrome$/m);
  assert.match(nextCompact, /^existing_tab_backend: codex-chrome-extension$/m);
  assert.match(nextCompact, /^provider_default_backend: direct-cdp-chrome$/m);
  assert.match(nextCompact, /^provider_default_agent_interface: secure-browser-agent-mcp$/m);
  assert.match(nextCompact, /^provider_public_benchmark_proof_exists: yes$/m);
  assert.match(nextCompact, /^provider_public_benchmark_proof_ok: yes$/m);
  assert.match(nextCompact, /^provider_public_benchmark_proof_path: \/tmp\/runs\/provider-benchmarks\/default-public\.json$/m);
  assert.match(nextCompact, /^provider_public_benchmark_fastest_measured_provider: direct-cdp-daemon$/m);
  assert.match(nextCompact, /^provider_public_benchmark_direct_cdp_cold_ok: yes$/m);
  assert.match(nextCompact, /^provider_public_benchmark_direct_cdp_daemon_ok: yes$/m);
  assert.match(nextCompact, /^provider_public_benchmark_agent_browser_chrome_ok: yes$/m);
  assert.match(nextCompact, /^provider_public_benchmark_playwright_ok: yes$/m);
  assert.match(nextCompact, /^provider_public_benchmark_agent_may_run_unattended: yes$/m);
  assert.match(nextCompact, /^provider_public_benchmark_starts_browser: yes$/m);
  assert.match(nextCompact, /^provider_public_benchmark_reads_browser_storage: no$/m);
  assert.match(nextCompact, /^provider_public_benchmark_returns_page_content: no$/m);
  assert.match(nextCompact, /^provider_public_benchmark_command: node src\/cli\.mjs benchmark --iterations 1 --write --out provider-benchmarks\/default-public\.json --format json$/m);
  assert.match(nextCompact, /^provider_lightpanda_ready_for_public_benchmark: no$/m);
  assert.match(nextCompact, /^provider_lightpanda_benchmark_agent_may_run_unattended: no$/m);
  assert.match(nextCompact, /^provider_lightpanda_benchmark_starts_browser: yes$/m);
  assert.match(nextCompact, /^provider_lightpanda_benchmark_reads_browser_storage: no$/m);
  assert.match(nextCompact, /^provider_lightpanda_benchmark_returns_page_content: no$/m);
  assert.match(nextCompact, /^provider_lightpanda_benchmark_command: LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="\/tmp\/lightpanda" node src\/cli\.mjs benchmark --url https:\/\/example\.com --iterations 1 --write --out provider-benchmarks\/lightpanda-public\.json --format json$/m);
  assert.match(nextCompact, /^provider_playwright_ready_for_public_smoke: yes$/m);
  assert.match(nextCompact, /^provider_playwright_ready_for_authenticated_default: no$/m);
  assert.match(nextCompact, /^provider_playwright_storage_state_sensitive: yes$/m);
  assert.match(nextCompact, /^provider_playwright_smoke_command: node src\/cli\.mjs outline-playwright 'data:text\/html,<h1>PW<\/h1>'$/m);
  assert.match(nextCompact, /^provider_selenium_ready_for_local_smoke: no$/m);
  assert.match(nextCompact, /^provider_selenium_smoke_agent_may_run_unattended: yes$/m);
  assert.match(nextCompact, /^provider_selenium_smoke_starts_browser: no$/m);
  assert.match(nextCompact, /^provider_selenium_smoke_command: node src\/cli\.mjs selenium-doctor --format compact$/m);
  assert.match(nextCompact, /^provider_doctor_opens_browser: no$/m);
  assert.match(nextCompact, /^provider_doctor_starts_capture: no$/m);
  assert.match(nextCompact, /^provider_doctor_reads_browser_storage: no$/m);
  assert.match(nextCompact, /^provider_doctor_returns_page_content: no$/m);
  assert.match(nextCompact, /^provider_doctor_may_run_unattended: yes$/m);
  assert.match(nextCompact, /^agent_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
  assert.match(nextCompact, /^objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
  assert.match(nextCompact, /^provider_doctor_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
  assert.match(nextCompact, /^agent_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(nextCompact, /^agent_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
  assert.match(nextCompact, /^operator_approval_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
  assert.match(nextCompact, /^operator_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(nextCompact, /^operator_approval_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
  assert.match(nextCompact, /^operator_approval_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
});

test('agent next never exposes unsafe browser-opening commands as agent run commands', () => {
  const next = buildAgentNext({
    safeMode: true,
    complete: false,
    secretValuesRead: false,
    objective: {
      status: 'waiting-for-login',
      operatorInput: true,
      recommendedCommand: {
        command: {
          shell: "'node' 'src/cli.mjs' 'target-login-capture' '--run'"
        }
      }
    },
    objectiveSafeCommand: {
      commandId: 'none',
      blockedReason: 'handoff-auth-check-port-unreachable',
      targetApproval: {
        humanAction: 'complete-login-in-open-dedicated-browser',
        automationBlocker: 'auth-check-not-ok',
        resumeOperatorOkRequired: true,
        nextCommandRequiresOperatorApproval: true,
        nextCommandOpensBrowser: true,
        nextCommandStartsCapture: true
      }
    },
    agentLoop: {
      nextAction: 'reopen-login-browser-required',
      canRunWithoutApproval: false,
      commandId: 'none',
      command: {
        shell: "'node' 'src/cli.mjs' 'target-login-capture' '--run'"
      },
      statusCommand: {
        shell: "'node' 'src/cli.mjs' 'control-status' '--format' 'compact'"
      },
      opensBrowserNow: false,
      startsCaptureNow: false
    },
    runGate: {
      okForAgentLoops: true,
      unguardedAgentDangerous: 0
    },
    backendMatrix: {
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      authenticatedBackend: 'direct-cdp-chrome',
      existingTabBackend: 'codex-chrome-extension'
    },
    browser: {},
    secret: {},
    warnings: ['objective.target-handoff-resume']
  });
  assert.equal(next.agentCanRunWithoutApproval, false);
  assert.equal(next.agentRunCommand, null);
  assert.equal(next.operatorApprovalRequired, true);
  assert.equal(next.operatorApprovalCommandOpensBrowser, true);
  assert.equal(next.operatorApprovalCommandStartsCapture, true);
  assert.equal(next.operatorApprovalCommandAgentMayRunUnattended, false);
  const compact = formatAgentNextCompact(next);
  assert.doesNotMatch(compact, /^agent_run_command:/m);
  assert.match(compact, /^operator_approval_opens_browser: yes$/m);
  assert.match(compact, /^operator_approval_starts_capture: yes$/m);
  assert.match(compact, /^operator_approval_agent_may_run_unattended: no$/m);
  assert.match(compact, /^operator_approval_command: 'node' 'src\/cli\.mjs' 'target-login-capture' '--run'$/m);
});
