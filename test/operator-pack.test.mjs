import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPosixPath } from '../src/output.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperatorPack, buildOperatorPackStatus, formatOperatorPackCompact, formatOperatorPackMarkdown, formatOperatorPackStatusCompact } from '../src/operator-pack.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Provider detection reads the real machine, so the default backend flipped to
// agent-browser-chrome on any box without a Chrome for Testing cache. Pin the inputs so the
// assertions describe this code's behaviour rather than the developer's install state.
const PROVIDER_OPTIONS = {
  status: {
    agentBrowser: { exists: true },
    chromeForTesting: { exists: true, path: '/pinned/chrome-for-testing' },
    secureBrowserAgentMcp: { exists: true },
    playwright: { coreExists: false },
    lightpanda: { binaryExists: false, binaryPath: '' },
    selenium: { webdriverPackageExists: false },
    localClones: {}
  }
};

function fixtures(rootDir) {
  const command = {
    shell: "'node' 'src/cli.mjs' 'target-handoff-resume'",
    args: ['node', 'src/cli.mjs', 'target-handoff-resume']
  };
  const authWatchCommand = {
    shell: "'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--real-external' '--handoff' 'operator-handoff.json' '--write' '--out' 'auth-watch-status.json'",
    args: ['node', 'src/cli.mjs', 'target-auth-watch', 'runs/target-packs/github', '--real-external', '--handoff', 'operator-handoff.json', '--write', '--out', 'auth-watch-status.json']
  };
  const handoffResumeCommand = {
    shell: "'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth' '--wait-auth-status-out' 'handoff-resume-wait-auth-status.json' '--out' 'handoff-resume-latest.json' '--format' 'compact'",
    args: ['node', 'src/cli.mjs', 'target-handoff-resume', 'runs/target-packs/github', '--run', '--open-login', '--wait-auth', '--wait-auth-status-out', 'handoff-resume-wait-auth-status.json', '--out', 'handoff-resume-latest.json', '--format', 'compact']
  };
  const capturePlanCommand = {
    shell: "'node' 'src/cli.mjs' 'target-proof-capture' 'runs/target-packs/github' '--real-external' '--wait-auth' '--auth-check-port' '59036' '--wait-auth-status-out' 'handoff-resume-wait-auth-status.json' '--completion-audit' '--format' 'compact'",
    args: ['node', 'src/cli.mjs', 'target-proof-capture', 'runs/target-packs/github', '--real-external', '--wait-auth', '--auth-check-port', '59036', '--wait-auth-status-out', 'handoff-resume-wait-auth-status.json', '--completion-audit', '--format', 'compact']
  };
  const agentLoopRefreshCommand = {
    shell: "'node' 'src/cli.mjs' 'agent-loop-step' '--write' '--out' 'operator/agent-loop-step-latest.json' '--format' 'compact'",
    args: ['node', 'src/cli.mjs', 'agent-loop-step', '--write', '--out', 'operator/agent-loop-step-latest.json', '--format', 'compact']
  };
  const agentLoopRunCommand = {
    shell: "'node' 'src/cli.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator/agent-loop-step-latest.json' '--timeout-ms' '300000' '--format' 'compact'",
    args: ['node', 'src/cli.mjs', 'agent-loop-step', '--run', '--write', '--out', 'operator/agent-loop-step-latest.json', '--timeout-ms', '300000', '--format', 'compact']
  };
  return {
    providerOptions: PROVIDER_OPTIONS,
    controlStatus: {
      complete: false,
      safeMode: true,
      secretValuesRead: false,
      providerDoctorStatus: {
        defaultBackend: 'direct-cdp-chrome',
        defaultAgentInterface: 'secure-browser-agent-mcp',
        publicBenchmarkProofExists: true,
        publicBenchmarkProofOk: true,
        publicBenchmarkProofPath: '/tmp/runs/provider-benchmarks/default-public.json',
        publicBenchmarkFastestMeasuredProvider: 'direct-cdp-daemon',
        publicBenchmarkDirectCdpColdOk: true,
        publicBenchmarkDirectCdpDaemonOk: true,
        publicBenchmarkAgentBrowserChromeOk: true,
        publicBenchmarkPlaywrightOk: true,
        publicBenchmarkAgentMayRunUnattended: true,
        publicBenchmarkStartsBrowser: true,
        publicBenchmarkReadsBrowserStorage: false,
        publicBenchmarkReturnsPageContent: false,
        publicBenchmarkCommand: 'node src/cli.mjs benchmark --iterations 1 --write --out provider-benchmarks/default-public.json --format json',
        lightpandaReadyForPublicBenchmark: false,
        lightpandaBenchmarkAgentMayRunUnattended: false,
        lightpandaBenchmarkStartsBrowser: true,
        lightpandaBenchmarkReadsBrowserStorage: false,
        lightpandaBenchmarkReturnsPageContent: false,
        lightpandaBenchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json',
        playwrightSmokeCommand: "node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'",
        playwrightReadyForPublicSmoke: true,
        playwrightReadyForAuthenticatedDefault: false,
        playwrightStorageStateSensitive: true,
        seleniumReadyForLocalSmoke: false,
        seleniumSmokeAgentMayRunUnattended: true,
        seleniumSmokeStartsBrowser: false,
        seleniumSmokeCommand: 'node src/cli.mjs selenium-doctor --format compact'
      },
      commands: {
        providerDoctorStatus: {
          shell: "'node' 'src/cli.mjs' 'provider-doctor-status' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'provider-doctor-status', '--format', 'compact']
        }
      }
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
      commands: {
        authWatch: authWatchCommand,
        handoffResume: handoffResumeCommand
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
      monitorCommand: authWatchCommand,
      resumeCommand: handoffResumeCommand,
      authCheckOk: false,
      loginLike: true,
      authState: 'metadata-only-login-like',
      authUsable: false,
      profileAuthMetadataOnly: true,
      handoffAuthCheckPort: '59036',
      handoffAuthCheckPortReachable: false,
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
    targetHandoffResumeStatus: {
      status: 'waiting-for-login',
      latestAuthOk: false,
      captureCompleted: false,
      waitingForLogin: true,
      recommendedCommand: {
        id: 'monitor-auth',
        command: authWatchCommand
      },
      capturePlanCommand
    },
    chromeExtensionStatus: {
      outputPath: path.join(rootDir, 'runs/operator/chrome-extension-status-latest.json'),
      plugin: {
        available: true
      },
      chrome: {
        installed: true,
        running: true
      },
      decision: {
        everydayChromeViaCodexExtensionPrepared: true,
        everydayChromeViaCodexExtensionBackendAvailable: false,
        everydayChromeViaCodexExtensionReady: false,
        everydayChromeViaCdpAllowed: false
      },
      extension: {
        selectedProfileDirectory: 'Default',
        installed: true,
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
      outputPath: path.join(rootDir, 'runs/operator/chrome-extension-handoff.json'),
      commands: [
        {
          id: 'open-selected-profile-window',
          command: {
            shell: "'node' '/tmp/plugin/scripts/open-chrome-window.js'"
          }
        }
      ]
    },
    chromeMcpTimeoutPlan: {
      nextAction: 'use-gated-extension-resume-or-clean-stale-mcp',
      status: {
        pageListTimeout: true
      },
      guidance: {
        useEverydayChromeNow: false
      },
      findings: [
        { id: 'page-list-timeout' },
        { id: 'regular-chrome-not-debuggable' }
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
        route: {
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume'",
          args: ['node', 'src/cli.mjs', 'target-handoff-resume']
        },
        status: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'authenticated-scrape' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'authenticated-scrape', '--format', 'compact']
        }
      }
    },
    backendMatrix: {
      schemaVersion: 1,
      generatedAt: '2026-05-28T00:00:00.000Z',
      rootDir,
      safeMode: true,
      statusOnly: true,
      destructiveActionsIncluded: false,
      secretValuesRead: false,
      opensBrowserNow: false,
      readsBrowserStorage: false,
      pageContentReturned: false,
      defaultBackend: 'direct-cdp-chrome',
      defaultAgentInterface: 'secure-browser-agent-mcp',
      searchBackend: 'direct-cdp-chrome',
      analyzeBackend: 'direct-cdp-chrome',
      scrapeBackend: 'direct-cdp-chrome',
      operateBackend: 'direct-cdp-chrome',
      tasks: {
        search: {
          selectedLane: 'public-search-direct-cdp',
          backend: 'direct-cdp-chrome',
          profileMode: 'public-profile',
          operatorInput: false,
          userPermissionRequired: false,
          canRunInBackground: true,
          startsCapture: false,
          captureBlocked: false,
          commandOpensBrowser: false
        },
        analyze: {
          selectedLane: 'direct-cdp-page-analysis',
          backend: 'direct-cdp-chrome',
          profileMode: 'public-or-dedicated-target-profile',
          operatorInput: false,
          userPermissionRequired: false,
          canRunInBackground: true,
          startsCapture: false,
          captureBlocked: false,
          commandOpensBrowser: false
        },
        scrape: {
          selectedLane: 'target-pack-direct-cdp',
          backend: 'direct-cdp-chrome',
          profileMode: 'dedicated-target-profile',
          operatorInput: true,
          userPermissionRequired: true,
          canRunInBackground: true,
          startsCapture: false,
          captureBlocked: true,
          commandOpensBrowser: false
        },
        operate: {
          selectedLane: 'target-pack-direct-cdp-operate',
          backend: 'direct-cdp-chrome',
          profileMode: 'dedicated-target-profile',
          operatorInput: true,
          userPermissionRequired: true,
          canRunInBackground: true,
          startsCapture: false,
          captureBlocked: true,
          commandOpensBrowser: false
        },
        'authenticated-scrape': {
          selectedLane: 'target-pack-direct-cdp',
          backend: 'direct-cdp-chrome',
          profileMode: 'dedicated-target-profile',
          operatorInput: true,
          userPermissionRequired: true,
          canRunInBackground: true,
          startsCapture: false,
          captureBlocked: true,
          commandOpensBrowser: false
        },
        'existing-tab': {
          selectedLane: 'regular-chrome-extension-resume',
          backend: 'codex-chrome-extension',
          profileMode: 'everyday-chrome-profile',
          operatorInput: true,
          userPermissionRequired: true,
          canRunInBackground: false,
          startsCapture: false,
          captureBlocked: false,
          commandOpensBrowser: false
        },
        'public-crawl': {
          selectedLane: 'direct-cdp-public',
          backend: 'direct-cdp-chrome',
          profileMode: 'ephemeral-profile',
          operatorInput: false,
          userPermissionRequired: false,
          canRunInBackground: true,
          startsCapture: false,
          captureBlocked: false,
          commandOpensBrowser: false
        },
        'compatibility-test': {
          selectedLane: 'direct-cdp-compatibility',
          backend: 'direct-cdp-chrome',
          profileMode: 'ephemeral-profile',
          operatorInput: false,
          userPermissionRequired: false,
          canRunInBackground: true,
          startsCapture: false,
          captureBlocked: false,
          commandOpensBrowser: false
        }
      },
      regularChrome: {
        status: 'not-ready',
        ready: false,
        stale: false,
        selectedLane: 'regular-chrome-extension-resume',
        backend: 'codex-chrome-extension',
        canRunInBackground: false,
        blockedReason: 'operator OK required',
        chromeMcpRouteReady: false,
        chromeMcpListPagesTimedOut: true
      },
      chromeMcpTimeoutPlan: {
        status: 'mcp-connected-page-list-timeout',
        stale: false,
        pageListTimeout: true,
        preferExtensionResume: true,
        findings: ['page-list-timeout']
      },
      backends: [
        { id: 'direct-cdp-chrome' },
        { id: 'secure-browser-agent-mcp' },
        { id: 'chrome-devtools-mcp' },
        { id: 'codex-chrome-extension' }
      ],
      commands: {
        write: {
          shell: "'node' 'src/cli.mjs' 'backend-matrix' '--write' '--out' 'operator/backend-matrix-latest.json' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'backend-matrix', '--write', '--out', 'operator/backend-matrix-latest.json', '--format', 'compact']
        },
        status: {
          shell: "'node' 'src/cli.mjs' 'backend-matrix-status' '--in' 'operator/backend-matrix-latest.json' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'backend-matrix-status', '--in', 'operator/backend-matrix-latest.json', '--format', 'compact']
        },
        searchRoute: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'search' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'search', '--format', 'compact']
        },
        analyzeRoute: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'analyze' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'analyze', '--format', 'compact']
        },
        scrapeRoute: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'scrape' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'scrape', '--format', 'compact']
        },
        operateRoute: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'operate' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'operate', '--format', 'compact']
        },
        existingTabRoute: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'existing-tab' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'existing-tab', '--format', 'compact']
        },
        authenticatedRoute: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'authenticated-scrape' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'authenticated-scrape', '--format', 'compact']
        },
        publicRoute: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'public-crawl' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'public-crawl', '--format', 'compact']
        },
        compatibilityRoute: {
          shell: "'node' 'src/cli.mjs' 'browser-route' '--task' 'compatibility-test' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'browser-route', '--task', 'compatibility-test', '--format', 'compact']
        },
        searchWorkflow: {
          shell: "'node' 'src/cli.mjs' 'agent-workflow' '--task' 'search' '--query' '<query>' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'agent-workflow', '--task', 'search', '--query', '<query>', '--format', 'compact']
        },
        operateWorkflow: {
          shell: "'node' 'src/cli.mjs' 'agent-workflow' '--task' 'operate' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'agent-workflow', '--task', 'operate', '--format', 'compact']
        },
        operateSelector: {
          shell: "'node' 'src/cli.mjs' 'agent-backend-select' '--task' 'operate' '--backend-matrix-in' 'operator/backend-matrix-latest.json' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'agent-backend-select', '--task', 'operate', '--format', 'compact']
        },
        existingTabSelector: {
          shell: "'node' 'src/cli.mjs' 'agent-backend-select' '--task' 'existing-tab' '--backend-matrix-in' 'operator/backend-matrix-latest.json' '--format' 'compact'",
          args: ['node', 'src/cli.mjs', 'agent-backend-select', '--task', 'existing-tab', '--format', 'compact']
        }
      }
    },
    secretEnvHandoff: {
      mode: 'environment-local-env',
      headlessReady: false,
      headlessConfigAvailable: true,
      requiresOnePasswordApproval: true,
      mutatesOnePasswordNow: false,
      nextAction: 'authenticate-onepassword-mcp-and-select-environment',
      outputPath: path.join(rootDir, 'runs/operator/secret-env-handoff.json')
    },
    objectiveHandoff: {
      commands: [
        { id: 'primary-action', shell: command.shell },
        { id: 'proof-gate-watch', shell: "'node' 'src/cli.mjs' 'proof-gate-watch' '--write'" }
      ],
      outputPath: path.join(rootDir, 'runs/operator/objective-handoff.json')
    },
    agentLoopStepStatus: {
      exists: true,
      stale: false,
      stepStatus: 'planned',
      nextAction: 'monitor-auth-watch',
      recommendedCommandId: 'run-agent-loop-step',
      commandId: 'auth-watch',
      allowedToRun: true,
      executed: false,
      blockedReason: '',
      opensBrowserNow: false,
      startsCaptureNow: false,
      ageSeconds: 12,
      staleAfterSeconds: 900,
      path: path.join(rootDir, 'runs/operator/agent-loop-step-latest.json'),
      recommendedCommand: agentLoopRunCommand,
      refreshCommand: agentLoopRefreshCommand,
      runCommand: agentLoopRunCommand
    }
  };
}

test('operator pack summarizes handoff, proof gate, and monitor files without secrets', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-'));
  try {
    const pack = await buildOperatorPack({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      write: true,
      out: 'operator/pack.json',
      ...fixtures(rootDir)
    });

    assert.equal(pack.complete, false);
    assert.equal(pack.status, 'waiting-for-login');
    assert.equal(pack.target, 'github');
    assert.equal(pack.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
    assert.equal(pack.authState, 'metadata-only-login-like');
    assert.equal(pack.authUsable, false);
    assert.equal(pack.profileAuthMetadataOnly, true);
    assert.equal(pack.handoffAuthCheckPort, '59036');
    assert.equal(pack.handoffAuthCheckPortReachable, false);
    assert.equal(pack.regularChrome.prepared, true);
    assert.equal(pack.regularChrome.ready, false);
    assert.equal(pack.regularChrome.nextAction, 'verify-codex-chrome-extension-backend');
    assert.equal(pack.regularChrome.handoffAction, 'ask-user-ok-to-open-selected-profile-window-and-retry');
    assert.equal(pack.regularChrome.resumeAction, 'plan-requires-operator-ok');
    assert.equal(pack.regularChrome.operatorOkRequired, true);
    assert.equal(pack.regularChrome.userPermissionRequired, true);
    assert.equal(pack.regularChrome.claimPlanReady, false);
    assert.equal(pack.regularChrome.claimPlanNextAction, 'run-chrome-extension-troubleshoot-or-resume');
    assert.equal(pack.regularChrome.claimPlanNextTool, 'none');
    assert.deepEqual(pack.regularChrome.claimPlanSnippetKeys, []);
    assert.equal(pack.regularChrome.backendCheckPlanNextAction, 'run-node-repl-backend-probe');
    assert.equal(pack.regularChrome.backendCheckPlanNextTool, 'mcp__node_repl__js');
    assert.deepEqual(pack.regularChrome.backendCheckPlanSnippetKeys, ['probe']);
    assert.equal(pack.regularChrome.mcpPageListTimeout, true);
    assert.equal(pack.regularChrome.mcpUseEverydayChromeNow, false);
    assert.equal(pack.regularChrome.mcpTimeoutPlanNextAction, 'use-gated-extension-resume-or-clean-stale-mcp');
    assert.deepEqual(pack.regularChrome.mcpTimeoutPlanFindings, ['page-list-timeout', 'regular-chrome-not-debuggable']);
    assert.equal(pack.regularChrome.usableNow, false);
    assert.equal(pack.regularChrome.backgroundCapableNow, false);
    assert.match(pack.regularChrome.blockedReason, /operator OK/);
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /chrome-mcp-timeout-plan/);
    assert.match(pack.regularChrome.backendCheckPlanCommand.shell, /chrome-extension-backend-check-plan/);
    assert.match(pack.regularChrome.backendCheckPlanRecordFailureCommand.shell, /regular-chrome-use/);
    assert.match(pack.regularChrome.backendCheckPlanRecordFailureCommand.shell, /--chrome-extension-backend-available' 'no/);
    assert.match(pack.regularChrome.backendCheckPlanRecordSuccessCommand.shell, /regular-chrome-use/);
    assert.match(pack.regularChrome.backendCheckPlanRecordSuccessCommand.shell, /--chrome-extension-backend-available' 'yes/);
    assert.match(pack.regularChrome.claimPlanCommand.shell, /chrome-extension-claim-plan/);
    assert.equal(pack.authWatchCommand, null);
    assert.match(pack.handoffResumeCommand.shell, /target-handoff-resume/);
    assert.match(pack.handoffResumeCommand.shell, /--wait-auth/);
    assert.equal(pack.executionPolicy.agentSafeAction, 'reopen-login-browser-required');
    assert.equal(pack.executionPolicy.agentSafeCommandId, 'none');
    assert.equal(pack.executionPolicy.agentSafeCommand, null);
    assert.equal(pack.executionPolicy.agentSafeCommandBlockedReason, 'handoff-auth-check-port-unreachable');
    assert.match(pack.executionPolicy.authFirstReopenLoginCommand.shell, /target-handoff-resume/);
    assert.match(pack.executionPolicy.authFirstReopenLoginCommand.shell, /--open-login/);
    assert.doesNotMatch(pack.executionPolicy.authFirstReopenLoginCommand.shell, /--wait-auth/);
    assert.match(pack.executionPolicy.agentLoopStepPlanCommand.shell, /agent-loop-step/);
    assert.match(pack.executionPolicy.agentLoopStepPlanCommand.shell, /--write/);
    assert.equal(pack.executionPolicy.agentLoopStepRunCommand, null);
    assert.match(pack.executionPolicy.agentLoopStepStatusCommand.shell, /agent-loop-step-status/);
    assert.equal(pack.agentLoopStepStatus.exists, true);
    assert.equal(pack.agentLoopStepStatus.stale, false);
    assert.equal(pack.agentLoopStepStatus.status, 'planned');
    assert.equal(pack.agentLoopStepStatus.recommendedCommandId, 'run-agent-loop-step');
    assert.equal(pack.agentLoopStepStatus.commandId, 'auth-watch');
    assert.equal(pack.agentLoopStepStatus.allowedToRun, true);
    assert.equal(pack.agentLoopStepStatus.executed, false);
    assert.equal(pack.agentLoopStepStatus.opensBrowserNow, false);
    assert.equal(pack.agentLoopStepStatus.startsCaptureNow, false);
    assert.match(pack.agentLoopStepStatus.recommendedCommand.shell, /agent-loop-step/);
    assert.match(pack.agentLoopStepStatus.refreshCommand.shell, /agent-loop-step/);
    assert.match(pack.agentLoopStepStatus.runCommand.shell, /agent-loop-step/);
    assert.equal(pack.executionPolicy.agentSafeCommandMonitorOnly, false);
    assert.equal(pack.executionPolicy.agentSafeCommandMayOpenBrowser, false);
    assert.equal(pack.executionPolicy.agentSafeCommandStartsCapture, false);
    assert.equal(pack.executionPolicy.monitorOnlyCommandAvailable, false);
    assert.equal(pack.executionPolicy.authFirstResumeAvailable, true);
    assert.equal(pack.executionPolicy.proofCaptureAllowedNow, false);
    assert.equal(pack.executionPolicy.proofCaptureBlockedUntilAuth, true);
    assert.equal(pack.executionPolicy.authFirstResumeMayOpenBrowser, true);
    assert.equal(pack.executionPolicy.authFirstResumeStartsCaptureAfterAuthOnly, true);
    assert.equal(pack.executionPolicy.operatorMustLogin, true);
    assert.equal(pack.proofGateArtifactAction.nextArtifactAction, 'wait-auth-then-capture-proof');
    assert.equal(pack.proofGateArtifactAction.nextArtifactBlocker, 'auth-check-not-ok');
    assert.deepEqual(pack.proofGateArtifactAction.artifactCommandCovers, ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof']);
    assert.equal(pack.loginHandoff.status, 'waiting-for-login');
    assert.equal(pack.loginHandoff.nextAction, 'open-login-browser');
    assert.equal(pack.loginHandoff.loginRequired, true);
    assert.equal(pack.loginHandoff.authUsable, false);
    assert.equal(pack.loginHandoff.safeMonitorAvailable, false);
    assert.equal(pack.loginHandoff.safeMonitorOnly, true);
    assert.equal(pack.loginHandoff.dedicatedBrowserPort, '59036');
    assert.equal(pack.loginHandoff.dedicatedBrowserReachable, false);
    assert.equal(pack.loginHandoff.opensBrowserNow, false);
    assert.equal(pack.loginHandoff.startsCaptureNow, false);
    assert.equal(pack.loginHandoff.captureAllowedNow, false);
    assert.equal(pack.loginHandoff.proofCaptureBlockedUntilAuth, true);
    assert.equal(pack.loginHandoff.safeMonitorCommand, null);
    assert.match(pack.loginHandoff.authFirstResumeCommand.shell, /target-handoff-resume/);
    assert.match(pack.loginHandoff.statusCommand.shell, /login-handoff-status/);
    assert.equal(pack.handoffResumeStatus.status, 'waiting-for-login');
    assert.equal(pack.handoffResumeStatus.latestAuthOk, false);
    assert.equal(pack.handoffResumeStatus.captureCompleted, false);
    assert.equal(pack.handoffResumeStatus.waitingForLogin, true);
    assert.equal(pack.handoffResumeStatus.recommendedCommandId, 'reopen-login-browser');
    assert.equal(pack.handoffResumeStatus.recommendedCommand, null);
    assert.match(pack.handoffResumeStatus.capturePlanCommand.shell, /target-proof-capture/);
    assert.match(pack.handoffResumeStatus.capturePlanCommand.shell, /--auth-check-port' '59036/);
    assert.equal(pack.browserRoute.selectedLane, 'target-pack-direct-cdp');
    assert.equal(pack.browserRoute.backend, 'direct-cdp-chrome');
    assert.equal(pack.browserRoute.commandOpensBrowser, false);
    assert.equal(pack.browserRoute.commandRunOnlyAfterUserSays, '');
    assert.equal(pack.browserRoute.everydayChromeCdpAllowed, false);
    assert.equal(pack.backendMatrix.status, 'fresh');
    assert.equal(pack.backendMatrix.exists, true);
    assert.equal(pack.backendMatrix.stale, false);
    assert.equal(pack.backendMatrix.defaultBackend, 'direct-cdp-chrome');
    assert.equal(pack.backendMatrix.defaultAgentInterface, 'secure-browser-agent-mcp');
    assert.equal(pack.backendMatrix.searchBackend, 'direct-cdp-chrome');
    assert.equal(pack.backendMatrix.analyzeBackend, 'direct-cdp-chrome');
    assert.equal(pack.backendMatrix.scrapeBackend, 'direct-cdp-chrome');
    assert.equal(pack.backendMatrix.operateBackend, 'direct-cdp-chrome');
    assert.equal(pack.backendMatrix.authenticatedBackend, 'direct-cdp-chrome');
    assert.equal(pack.backendMatrix.existingTabBackend, 'codex-chrome-extension');
    assert.equal(pack.backendMatrix.publicCrawlBackend, 'direct-cdp-chrome');
    assert.equal(pack.backendMatrix.compatibilityBackend, 'direct-cdp-chrome');
    assert.equal(pack.backendMatrix.regularChromeStatus, 'not-ready');
    assert.equal(pack.backendMatrix.chromeMcpRouteReady, false);
    assert.equal(pack.backendMatrix.chromeMcpListPagesTimedOut, true);
    assert.equal(pack.backendMatrix.chromeMcpTimeoutPlanSource, 'embedded-matrix');
    assert.equal(pack.backendMatrix.chromeMcpTimeoutPlanStatus, 'mcp-connected-page-list-timeout');
    assert.equal(pack.backendMatrix.chromeMcpTimeoutPlanStale, false);
    assert.equal(pack.backendMatrix.chromeMcpTimeoutPlanPreferExtensionResume, true);
    assert.equal(pack.backendMatrix.backendCount, 4);
    assert.equal(pack.backendMatrix.savedSecretValuesRead, false);
    assert.equal(pack.backendMatrix.savedDestructiveActions, false);
    assert.match(pack.backendMatrix.refreshCommand.shell, /backend-matrix/);
    assert.match(pack.backendMatrix.statusCommand.shell, /backend-matrix-status/);
    assert.match(pack.backendMatrix.existingTabRouteCommand.shell, /existing-tab/);
    assert.match(pack.backendMatrix.publicCrawlRouteCommand.shell, /public-crawl/);
    assert.match(pack.backendMatrix.compatibilityRouteCommand.shell, /compatibility-test/);
    assert.match(pack.backendMatrix.operateWorkflowCommand.shell, /agent-workflow/);
    assert.match(pack.backendMatrix.operateSelectorCommand.shell, /agent-backend-select/);
    assert.match(pack.backendMatrix.existingTabSelectorCommand.shell, /existing-tab/);
    assert.equal(pack.proofPipeline.status, 'waiting-for-login');
    assert.equal(pack.proofPipeline.recommendedNow, 'reopen-login-browser');
    assert.equal(pack.proofPipeline.proofCaptureAllowedNow, false);
    assert.equal(pack.proofPipeline.waitAuthThenCaptureAvailable, true);
    assert.equal(pack.proofPipeline.monitorAuthAvailable, false);
    assert.equal(pack.proofPipeline.monitorAuthOpensBrowser, false);
    assert.equal(pack.proofPipeline.monitorAuthStartsCapture, false);
    assert.equal(pack.proofPipeline.openLoginAvailable, false);
    assert.equal(pack.proofPipeline.reopenLoginAvailable, true);
    assert.equal(pack.proofPipeline.reopenLoginOpensBrowser, true);
    assert.equal(pack.proofPipeline.reopenLoginStartsCapture, false);
    assert.equal(pack.proofPipeline.waitCaptureOpensBrowser, true);
    assert.equal(pack.proofPipeline.waitCaptureWaitsForAuth, true);
    assert.equal(pack.proofPipeline.waitCaptureStartsCapture, true);
    assert.match(pack.proofPipeline.command.shell, /objective-proof-pipeline/);
    assert.equal(pack.proofPipeline.monitorAuthCommand, null);
    assert.match(pack.proofPipeline.reopenLoginCommand.shell, /target-handoff-resume/);
    assert.doesNotMatch(pack.proofPipeline.reopenLoginCommand.shell, /--wait-auth/);
    assert.match(pack.proofPipeline.waitCaptureCommand.shell, /target-handoff-resume/);
    assert.equal(pack.backgroundProofCapture.planStatus, 'waiting-for-login');
    assert.equal(pack.backgroundProofCapture.captureBlocked, true);
    assert.equal(pack.backgroundProofCapture.backgroundMonitorAvailable, false);
    assert.equal(pack.backgroundProofCapture.backgroundCaptureAvailable, false);
    assert.equal(pack.backgroundProofCapture.captureBlockedReason, 'handoff-auth-check-port-unreachable');
    assert.equal(pack.backgroundProofCapture.monitorRunning, false);
    assert.equal(pack.backgroundProofCapture.captureRunning, false);
    assert.equal(pack.backgroundProofCapture.captureStartStatus, 'planned');
    assert.equal(pack.backgroundProofCapture.captureStartReadyToRun, false);
    assert.deepEqual(pack.backgroundProofCapture.captureStartBlockers, ['operator-ok-required']);
    assert.match(pack.backgroundProofCapture.statusCommand.shell, /background-proof-capture-status/);
    assert.equal(pack.backgroundProofCapture.noOpenWaitCaptureCommand, null);
    assert.equal(pack.backgroundProofCapture.backgroundNoOpenWaitCaptureCommand, null);
    assert.match(pack.backgroundProofCapture.captureStartCommand.shell, /background-proof-capture-start/);
    assert.match(pack.backgroundProofCapture.monitorStartCommand.shell, /background-proof-capture-start/);
    assert.equal(pack.objectiveSafeCommand.status, 'waiting-for-login');
    assert.equal(pack.objectiveSafeCommand.commandId, 'none');
    assert.equal(pack.objectiveSafeCommand.monitorOnly, false);
    assert.equal(pack.objectiveSafeCommand.mayOpenBrowser, false);
    assert.equal(pack.objectiveSafeCommand.startsCapture, false);
    assert.equal(pack.objectiveSafeCommand.blockedReason, 'handoff-auth-check-port-unreachable');
    assert.equal(pack.objectiveSafeCommand.proofCaptureAllowedNow, false);
    assert.equal(pack.objectiveSafeCommand.outputPath, path.join(rootDir, 'runs/operator/objective-safe-command-latest.json'));
    assert.equal(pack.agentProofChecklist.complete, false);
    assert.equal(pack.agentProofChecklist.verdict, 'not-complete');
    assert.equal(pack.agentProofChecklist.candidate, 'github');
    assert.equal(pack.agentProofChecklist.operatorApprovalRequired, true);
    assert.equal(pack.agentProofChecklist.operatorApprovalToken, 'OK');
    assert.equal(pack.agentProofChecklist.operatorCommandOpensBrowser, false);
    assert.equal(pack.agentProofChecklist.operatorCommandStartsCapture, false);
    assert.equal(pack.agentProofChecklist.agentMustNotRunOperatorResumeUnattended, true);
    assert.match(pack.agentProofChecklist.command.shell, /agent-proof-checklist/);
    assert.match(pack.agentProofChecklist.statusCommand.shell, /agent-proof-checklist-status/);
    assert.match(pack.agentProofChecklist.operatorResumeCommand.shell, /target-approval-resume/);
    assert.equal(pack.agentProofChecklist.outputPath, path.join(rootDir, 'runs/operator/agent-proof-checklist-latest.json'));
    assert.equal(pack.agentProofCloseout.complete, false);
    assert.equal(pack.agentProofCloseout.verdict, 'not-complete');
    assert.equal(pack.agentProofCloseout.candidate, 'github');
    assert.equal(pack.agentProofCloseout.checklistExists, true);
    assert.equal(pack.agentProofCloseout.checklistParseOk, true);
    assert.equal(pack.agentProofCloseout.operatorResumeRequiresOperatorApproval, true);
    assert.equal(pack.agentProofCloseout.operatorResumeOpensBrowser, false);
    assert.equal(pack.agentProofCloseout.operatorResumeStartsCapture, false);
    assert.equal(pack.agentProofCloseout.operatorResumeAgentMayRunUnattended, false);
    assert.equal(pack.agentProofCloseout.providerDefaultBackend, 'direct-cdp-chrome');
    assert.equal(pack.agentProofCloseout.providerDefaultAgentInterface, 'secure-browser-agent-mcp');
    assert.equal(typeof pack.agentProofCloseout.providerPlaywrightReadyForPublicSmoke, 'boolean');
    assert.equal(pack.agentProofCloseout.providerPlaywrightReadyForAuthenticatedDefault, false);
    assert.equal(typeof pack.agentProofCloseout.providerPlaywrightStorageStateSensitive, 'boolean');
    assert.equal(pack.agentProofCloseout.providerDoctorOpensBrowser, false);
    assert.equal(pack.agentProofCloseout.providerDoctorStartsCapture, false);
    assert.equal(pack.agentProofCloseout.providerDoctorReadsBrowserStorage, false);
    assert.equal(pack.agentProofCloseout.providerDoctorReturnsPageContent, false);
    assert.equal(pack.agentProofCloseout.providerDoctorMayRunUnattended, true);
    assert.match(pack.agentProofCloseout.command.shell, /agent-proof-closeout/);
    assert.match(pack.agentProofCloseout.writeCommand.shell, /agent-proof-closeout/);
    assert.match(pack.agentProofCloseout.statusCommand.shell, /agent-proof-closeout-status/);
    assert.match(pack.agentProofCloseout.completionProofBundleCommand.shell, /completion-proof-bundle/);
    assert.match(pack.agentProofCloseout.completionProofBundleStatusCommand.shell, /completion-proof-bundle-status/);
    assert.match(pack.agentProofCloseout.objectiveCompletionCommand.shell, /objective-completion-audit/);
    assert.match(pack.agentProofCloseout.objectiveCompletionStrictCommand.shell, /objective-completion-audit.*--strict/);
    assert.equal(pack.agentProofCloseout.agentSafeNextCommandId, 'agent-preflight');
    assert.equal(pack.agentProofCloseout.agentSafeNextMayRunUnattended, true);
    assert.equal(pack.agentProofCloseout.agentSafeNextOpensBrowser, false);
    assert.equal(pack.agentProofCloseout.agentSafeNextStartsCapture, false);
    assert.equal(pack.agentProofCloseout.agentSafeNextReadsBrowserStorage, false);
    assert.equal(pack.agentProofCloseout.agentSafeNextReturnsPageContent, false);
    assert.equal(pack.agentProofCloseout.targetApprovalPreflightMayRunUnattended, true);
    assert.equal(pack.agentProofCloseout.targetApprovalPreflightOpensBrowser, false);
    assert.equal(pack.agentProofCloseout.targetApprovalPreflightStartsCapture, false);
    assert.equal(pack.agentProofCloseout.targetProofPlanMayRunUnattended, true);
    assert.equal(pack.agentProofCloseout.targetProofPlanOpensBrowser, false);
    assert.equal(pack.agentProofCloseout.targetProofPlanStartsCapture, false);
    assert.match(pack.agentProofCloseout.agentSafeNextCommand.shell, /agent-preflight/);
    assert.match(pack.agentProofCloseout.targetApprovalPreflightCommand.shell, /target-approval-preflight/);
    assert.match(pack.agentProofCloseout.targetProofPlanCommand.shell, /target-proof-plan/);
    assert.match(pack.agentProofCloseout.providerDoctorStatusCommand.shell, /provider-doctor-status/);
    assert.equal(pack.agentProofCloseout.outputPath, path.join(rootDir, 'runs/operator/agent-proof-closeout-latest.json'));
    assert.equal(pack.secrets.handoffMode, 'environment-local-env');
    assert.equal(pack.secrets.headlessConfigAvailable, true);
    assert.equal(pack.secrets.mutatesOnePasswordNow, false);
    assert.equal(pack.secretValuesRead, false);
    assert.equal(pack.destructiveActionsIncluded, false);
    // Reported paths are POSIX by contract; the same value is still readable by fs below.
    assert.equal(pack.files.operatorPack, toPosixPath(path.join(rootDir, 'runs/operator/pack.json')));
    assert.equal(pack.files.loginHandoffStatus, toPosixPath(path.join(rootDir, 'runs/operator/login-handoff-status-latest.json')));
    assert.equal(pack.files.agentLoopStepStatus, toPosixPath(path.join(rootDir, 'runs/operator/agent-loop-step-latest.json')));
    assert.equal(pack.files.browserRoute, toPosixPath(path.join(rootDir, 'runs/operator/browser-route-latest.json')));
    assert.equal(pack.files.backendMatrix, toPosixPath(path.join(rootDir, 'runs/operator/backend-matrix-latest.json')));
    assert.equal(pack.files.chromeExtensionTroubleshoot, toPosixPath(path.join(rootDir, 'runs/operator/chrome-extension-troubleshoot-latest.json')));
    assert.equal(pack.files.chromeExtensionBackendCheckPlan, toPosixPath(path.join(rootDir, 'runs/operator/chrome-extension-backend-check-plan-latest.json')));
    assert.equal(pack.files.chromeExtensionClaimPlan, toPosixPath(path.join(rootDir, 'runs/operator/chrome-extension-claim-plan-latest.json')));
    assert.equal(pack.files.chromeMcpTimeoutPlan, toPosixPath(path.join(rootDir, 'runs/operator/chrome-mcp-timeout-plan-latest.json')));
    assert.equal(pack.files.backgroundProofCapturePlan, toPosixPath(path.join(rootDir, 'runs/operator/background-proof-capture-plan-latest.json')));
    assert.equal(pack.files.backgroundProofCaptureStatus, toPosixPath(path.join(rootDir, 'runs/operator/background-proof-capture-status-latest.json')));
    assert.equal(pack.files.backgroundProofCaptureStart, toPosixPath(path.join(rootDir, 'runs/operator/background-proof-capture-start-latest.json')));
    assert.equal(pack.files.backgroundProofMonitorStart, toPosixPath(path.join(rootDir, 'runs/operator/background-auth-monitor-start-latest.json')));
    assert.equal(pack.files.objectiveProofPipeline, toPosixPath(path.join(rootDir, 'runs/operator/objective-proof-pipeline-latest.json')));
    assert.equal(pack.files.objectiveSafeCommand, toPosixPath(path.join(rootDir, 'runs/operator/objective-safe-command-latest.json')));
    assert.equal(pack.files.agentProofChecklist, toPosixPath(path.join(rootDir, 'runs/operator/agent-proof-checklist-latest.json')));
    assert.equal(pack.files.agentProofCloseout, toPosixPath(path.join(rootDir, 'runs/operator/agent-proof-closeout-latest.json')));
    const written = JSON.parse(fs.readFileSync(pack.files.operatorPack, 'utf8'));
    const writtenRoute = JSON.parse(fs.readFileSync(pack.files.browserRoute, 'utf8'));
    const writtenBackendMatrix = JSON.parse(fs.readFileSync(pack.files.backendMatrix, 'utf8'));
    const writtenTroubleshoot = JSON.parse(fs.readFileSync(pack.files.chromeExtensionTroubleshoot, 'utf8'));
    const writtenBackendCheckPlan = JSON.parse(fs.readFileSync(pack.files.chromeExtensionBackendCheckPlan, 'utf8'));
    const writtenClaimPlan = JSON.parse(fs.readFileSync(pack.files.chromeExtensionClaimPlan, 'utf8'));
    const writtenChromeMcpTimeoutPlan = JSON.parse(fs.readFileSync(pack.files.chromeMcpTimeoutPlan, 'utf8'));
    const writtenLoginHandoffStatus = JSON.parse(fs.readFileSync(pack.files.loginHandoffStatus, 'utf8'));
    const writtenBackgroundPlan = JSON.parse(fs.readFileSync(pack.files.backgroundProofCapturePlan, 'utf8'));
    const writtenBackgroundStatus = JSON.parse(fs.readFileSync(pack.files.backgroundProofCaptureStatus, 'utf8'));
    const writtenBackgroundStart = JSON.parse(fs.readFileSync(pack.files.backgroundProofCaptureStart, 'utf8'));
    const writtenProofPipeline = JSON.parse(fs.readFileSync(pack.files.objectiveProofPipeline, 'utf8'));
    const writtenObjectiveSafeCommand = JSON.parse(fs.readFileSync(pack.files.objectiveSafeCommand, 'utf8'));
    const writtenAgentProofChecklist = JSON.parse(fs.readFileSync(pack.files.agentProofChecklist, 'utf8'));
    const writtenAgentProofCloseout = JSON.parse(fs.readFileSync(pack.files.agentProofCloseout, 'utf8'));
    assert.equal(written.target, 'github');
    assert.equal(writtenRoute.selectedLane, 'target-pack-direct-cdp');
    assert.equal(writtenBackendMatrix.defaultBackend, 'direct-cdp-chrome');
    assert.equal(writtenBackendMatrix.secretValuesRead, false);
    assert.equal(writtenBackendMatrix.destructiveActionsIncluded, false);
    assert.equal(writtenTroubleshoot.opensBrowserNow, false);
    assert.equal(writtenTroubleshoot.secretValuesRead, false);
    assert.equal(writtenBackendCheckPlan.nextAction, 'run-node-repl-backend-probe');
    assert.equal(writtenBackendCheckPlan.opensBrowserNow, false);
    assert.equal(writtenClaimPlan.ready, false);
    assert.equal(writtenClaimPlan.opensBrowserNow, false);
    assert.equal(writtenChromeMcpTimeoutPlan.nextAction, 'use-gated-extension-resume-or-clean-stale-mcp');
    assert.equal(writtenLoginHandoffStatus.nextAction, 'open-login-browser');
    assert.equal(writtenLoginHandoffStatus.opensBrowserNow, false);
    assert.equal(writtenLoginHandoffStatus.startsCaptureNow, false);
    assert.equal(writtenLoginHandoffStatus.secretValuesRead, false);
    assert.equal(writtenBackgroundPlan.opensBrowserNow, false);
    assert.equal(writtenBackgroundPlan.startsCaptureNow, false);
    assert.equal(writtenBackgroundStatus.statusOnly, true);
    assert.equal(writtenBackgroundStatus.secretValuesRead, false);
    assert.equal(writtenBackgroundStart.status, 'planned');
    assert.equal(writtenBackgroundStart.runRequested, false);
    assert.equal(writtenProofPipeline.decision.recommendedNow, 'reopen-login-browser');
    assert.equal(writtenProofPipeline.opensBrowserNow, false);
    assert.equal(writtenProofPipeline.startsCaptureNow, false);
    assert.equal(writtenProofPipeline.secretValuesRead, false);
    assert.equal(writtenObjectiveSafeCommand.commandId, 'none');
    assert.equal(writtenObjectiveSafeCommand.monitorOnly, false);
    assert.equal(writtenObjectiveSafeCommand.mayOpenBrowser, false);
    assert.equal(writtenObjectiveSafeCommand.startsCapture, false);
    assert.equal(writtenObjectiveSafeCommand.blockedReason, 'handoff-auth-check-port-unreachable');
    assert.equal(writtenObjectiveSafeCommand.secretValuesRead, false);
    assert.equal(writtenAgentProofChecklist.statusOnly, true);
    assert.equal(writtenAgentProofChecklist.secretValuesRead, false);
    assert.equal(writtenAgentProofChecklist.opensBrowserNow, false);
    assert.equal(writtenAgentProofChecklist.startsCaptureNow, false);
    assert.equal(writtenAgentProofChecklist.agentMustNotRunOperatorResumeUnattended, true);
    assert.equal(writtenAgentProofCloseout.statusOnly, true);
    assert.equal(writtenAgentProofCloseout.secretValuesRead, false);
    assert.equal(writtenAgentProofCloseout.opensBrowserNow, false);
    assert.equal(writtenAgentProofCloseout.startsCaptureNow, false);
    assert.equal(writtenAgentProofCloseout.checklistExists, true);
    assert.equal(JSON.stringify(written).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenRoute).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenBackendMatrix).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenTroubleshoot).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenClaimPlan).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenChromeMcpTimeoutPlan).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenLoginHandoffStatus).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenBackgroundPlan).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenBackgroundStatus).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenBackgroundStart).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenProofPipeline).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenObjectiveSafeCommand).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenAgentProofChecklist).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(writtenAgentProofCloseout).includes('OP_SERVICE_ACCOUNT_TOKEN='), false);
    assert.equal(JSON.stringify(written).includes('secret-token'), false);
    assert.equal(JSON.stringify(writtenBackendMatrix).includes('secret-token'), false);
    assert.equal(pack.primaryCommand.opensBrowser, true);
    assert.equal(pack.primaryCommand.waitsForAuth, true);
    assert.equal(pack.primaryCommand.startsCapture, true);
    assert.equal(pack.primaryCommand.requiresOperatorApproval, true);
    assert.equal(pack.primaryCommand.agentMayRunUnattended, false);
    const compact = formatOperatorPackCompact(pack);
    assert.match(compact, /^status: waiting-for-login$/m);
    assert.match(compact, /^primary_command_opens_browser: yes$/m);
    assert.match(compact, /^primary_command_waits_for_auth: yes$/m);
    assert.match(compact, /^primary_command_starts_capture: yes$/m);
    assert.match(compact, /^primary_command_requires_operator_approval: yes$/m);
    assert.match(compact, /^primary_command_agent_may_run_unattended: no$/m);
    assert.match(compact, /^auth_state: metadata-only-login-like$/m);
    assert.match(compact, /^auth_usable: no$/m);
    assert.match(compact, /^profile_auth_metadata_only: yes$/m);
    assert.match(compact, /^handoff_auth_check_port: 59036$/m);
    assert.match(compact, /^handoff_auth_check_port_reachable: no$/m);
    assert.match(compact, /^agent_safe_action: reopen-login-browser-required$/m);
    assert.match(compact, /^agent_safe_command_id: none$/m);
    assert.match(compact, /^agent_safe_command_monitor_only: no$/m);
    assert.match(compact, /^agent_safe_command_may_open_browser: no$/m);
    assert.match(compact, /^agent_safe_command_starts_capture: no$/m);
    assert.match(compact, /^agent_safe_command_blocked_reason: handoff-auth-check-port-unreachable$/m);
    assert.match(compact, /^agent_next_action: reopen-login-browser-required$/m);
    assert.match(compact, /^agent_next_can_run_without_approval: no$/m);
    assert.match(compact, /^agent_next_command_id: none$/m);
    assert.match(compact, /^agent_next_preflight_available: yes$/m);
    assert.match(compact, /^agent_next_preflight_action: run-operator-approval-preflight$/m);
    assert.match(compact, /^agent_next_preflight_may_run_without_approval: yes$/m);
    assert.match(compact, /^agent_next_proof_plan_available: yes$/m);
    assert.match(compact, /^agent_next_proof_plan_action: run-target-proof-plan$/m);
    assert.match(compact, /^agent_next_proof_plan_may_run_without_approval: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_required: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_opens_browser: no$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_starts_capture: no$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_returns_page_content: no$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_proof_plan_opens_browser: no$/m);
    assert.match(compact, /^agent_next_operator_approval_proof_plan_starts_capture: no$/m);
    assert.match(compact, /^agent_next_operator_approval_proof_plan_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_next_operator_approval_proof_plan_returns_page_content: no$/m);
    assert.match(compact, /^agent_next_operator_approval_proof_plan_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_next_operator_approval_opens_browser: no$/m);
    assert.match(compact, /^agent_next_operator_approval_starts_capture: no$/m);
    assert.match(compact, /^agent_next_operator_approval_agent_may_run_unattended: no$/m);
    assert.match(compact, /^agent_next_human_action: complete-login-in-open-dedicated-browser$/m);
    assert.match(compact, /^agent_next_automation_blocker: auth-check-not-ok$/m);
    assert.match(compact, /^agent_next_opens_browser_now: no$/m);
    assert.match(compact, /^agent_next_starts_capture_now: no$/m);
    assert.match(compact, /^agent_next_provider_default_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^agent_next_provider_default_agent_interface: secure-browser-agent-mcp$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_proof_exists: yes$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_proof_ok: yes$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_proof_path: \/tmp\/runs\/provider-benchmarks\/default-public\.json$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_fastest_measured_provider: direct-cdp-daemon$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_direct_cdp_cold_ok: yes$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_direct_cdp_daemon_ok: yes$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_agent_browser_chrome_ok: yes$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_playwright_ok: yes$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_agent_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_starts_browser: yes$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_returns_page_content: no$/m);
    assert.match(compact, /^agent_next_provider_public_benchmark_command: node src\/cli\.mjs benchmark --iterations 1 --write --out provider-benchmarks\/default-public\.json --format json$/m);
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
    assert.match(compact, /^agent_proof_checklist_complete: no$/m);
    assert.match(compact, /^agent_proof_checklist_verdict: not-complete$/m);
    assert.match(compact, /^agent_proof_checklist_operator_approval_required: yes$/m);
    assert.match(compact, /^agent_proof_checklist_operator_approval_token: OK$/m);
    assert.match(compact, /^agent_proof_checklist_operator_command_opens_browser: no$/m);
    assert.match(compact, /^agent_proof_checklist_operator_command_starts_capture: no$/m);
    assert.match(compact, /^agent_proof_checklist_agent_must_not_run_operator_resume_unattended: yes$/m);
    assert.match(compact, /^agent_proof_closeout_complete: no$/m);
    assert.match(compact, /^agent_proof_closeout_verdict: not-complete$/m);
    assert.match(compact, /^agent_proof_closeout_checklist_exists: yes$/m);
    assert.match(compact, /^agent_proof_closeout_checklist_parse_ok: yes$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_requires_operator_approval: yes$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_opens_browser: no$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_starts_capture: no$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_agent_may_run_unattended: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_default_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^agent_proof_closeout_provider_default_agent_interface: secure-browser-agent-mcp$/m);
    assert.match(compact, /^agent_proof_closeout_provider_playwright_ready_for_public_smoke: /m);
    assert.match(compact, /^agent_proof_closeout_provider_playwright_ready_for_authenticated_default: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_playwright_storage_state_sensitive: /m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_opens_browser: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_starts_capture: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_returns_page_content: no$/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_may_run_unattended: yes$/m);
    assert.match(compact, /^monitor_only_command_available: no$/m);
    assert.match(compact, /^auth_first_resume_available: yes$/m);
    assert.match(compact, /^proof_capture_allowed_now: no$/m);
    assert.match(compact, /^proof_capture_blocked_until_auth: yes$/m);
    assert.match(compact, /^auth_first_resume_may_open_browser: yes$/m);
    assert.match(compact, /^auth_first_resume_starts_capture_after_auth_only: yes$/m);
    assert.match(compact, /^operator_must_login: yes$/m);
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
    assert.match(compact, /^agent_loop_step_saved_age_seconds: 12$/m);
    assert.match(compact, /^agent_loop_step_saved_stale_after_seconds: 900$/m);
    assert.match(compact, /^proof_gate_next_artifact_action: wait-auth-then-capture-proof$/m);
    assert.match(compact, /^proof_gate_next_artifact_blocker: auth-check-not-ok$/m);
    assert.match(compact, /^proof_gate_artifact_command_covers: auth-check,observe,inspect,scrape,benchmark,target-proof$/m);
    assert.match(compact, /^login_handoff_status: waiting-for-login$/m);
    assert.match(compact, /^login_handoff_next_action: open-login-browser$/m);
    assert.match(compact, /^login_handoff_required: yes$/m);
    assert.match(compact, /^login_handoff_auth_usable: no$/m);
    assert.match(compact, /^login_handoff_safe_monitor_available: no$/m);
    assert.match(compact, /^login_handoff_safe_monitor_only: yes$/m);
    assert.match(compact, /^login_handoff_dedicated_browser_port: 59036$/m);
    assert.match(compact, /^login_handoff_dedicated_browser_reachable: no$/m);
    assert.match(compact, /^login_handoff_opens_browser_now: no$/m);
    assert.match(compact, /^login_handoff_starts_capture_now: no$/m);
    assert.match(compact, /^login_handoff_capture_allowed_now: no$/m);
    assert.match(compact, /^login_handoff_proof_capture_blocked_until_auth: yes$/m);
    assert.match(compact, /^handoff_resume_status: waiting-for-login$/m);
    assert.match(compact, /^handoff_resume_latest_auth_ok: no$/m);
    assert.match(compact, /^handoff_resume_capture_completed: no$/m);
    assert.match(compact, /^handoff_resume_waiting_for_login: yes$/m);
    assert.match(compact, /^handoff_resume_recommended_command_id: reopen-login-browser$/m);
    assert.match(compact, /^regular_chrome_prepared: yes$/m);
    assert.match(compact, /^browser_route_lane: target-pack-direct-cdp$/m);
    assert.match(compact, /^browser_route_backend: direct-cdp-chrome$/m);
    assert.match(compact, /^browser_route_command_opens_browser: no$/m);
    assert.match(compact, /^browser_route_command_run_only_after_user_says: none$/m);
    assert.match(compact, /^browser_route_everyday_chrome_cdp_allowed: no$/m);
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
    assert.match(compact, /^backend_matrix_chrome_mcp_timeout_plan_source: embedded-matrix$/m);
    assert.match(compact, /^backend_matrix_chrome_mcp_timeout_plan_status: mcp-connected-page-list-timeout$/m);
    assert.match(compact, /^backend_matrix_chrome_mcp_timeout_plan_stale: no$/m);
    assert.match(compact, /^backend_matrix_chrome_mcp_timeout_plan_prefer_extension_resume: yes$/m);
    assert.match(compact, /^backend_matrix_backend_count: 4$/m);
    assert.match(compact, /^backend_matrix_saved_secret_values_read: no$/m);
    assert.match(compact, /^backend_matrix_saved_destructive_actions: no$/m);
    assert.match(compact, /^browser_route_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'$/m);
    assert.match(compact, /^proof_pipeline_status: waiting-for-login$/m);
    assert.match(compact, /^proof_pipeline_recommended_now: reopen-login-browser$/m);
    assert.match(compact, /^proof_pipeline_proof_capture_allowed_now: no$/m);
    assert.match(compact, /^proof_pipeline_wait_auth_then_capture_available: yes$/m);
    assert.match(compact, /^proof_pipeline_monitor_auth_available: no$/m);
    assert.match(compact, /^proof_pipeline_monitor_auth_opens_browser: no$/m);
    assert.match(compact, /^proof_pipeline_monitor_auth_starts_capture: no$/m);
    assert.match(compact, /^proof_pipeline_reopen_login_available: yes$/m);
    assert.match(compact, /^proof_pipeline_reopen_login_opens_browser: yes$/m);
    assert.match(compact, /^proof_pipeline_reopen_login_starts_capture: no$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_opens_browser: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_waits_for_auth: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_starts_capture: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_available: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_opens_browser: no$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_waits_for_auth: yes$/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_starts_capture: yes$/m);
    assert.match(compact, /^run_gate_ok_for_agent_loops: yes$/m);
    assert.match(compact, /^run_gate_unguarded_agent_dangerous: 0$/m);
    assert.match(compact, /^run_gate_operator_gated: 9$/m);
    assert.match(compact, /^run_gate_direct_operator: 3$/m);
    assert.match(compact, /^run_gate_opens_browser_now: no$/m);
    assert.match(compact, /^run_gate_starts_capture_now: no$/m);
    assert.match(compact, /^target_approval_pack_exists: /m);
    assert.match(compact, /^target_approval_pack_parse_ok: /m);
    assert.match(compact, /^target_approval_candidate: github$/m);
    assert.match(compact, /^target_approval_next: /m);
    assert.match(compact, /^target_approval_next_command_opens_browser: no$/m);
    assert.match(compact, /^target_approval_next_command_starts_capture: no$/m);
    assert.match(compact, /^target_approval_next_command_requires_operator_approval: yes$/m);
    assert.match(compact, /^target_approval_next_command_agent_may_run_unattended: no$/m);
    assert.match(compact, /^target_approval_resume_status: planned$/m);
    assert.match(compact, /^target_approval_resume_ready_to_run: yes$/m);
    assert.match(compact, /^target_approval_resume_operator_ok_required: yes$/m);
    assert.match(compact, /^target_approval_resume_operator_ok_accepted: no$/m);
    assert.match(compact, /^target_approval_resume_agent_may_run_unattended: no$/m);
    assert.match(compact, /^target_approval_resume_planned_opens_browser: no$/m);
    assert.match(compact, /^target_approval_resume_planned_starts_capture: no$/m);
    assert.match(compact, /^target_approval_status_command: 'node' 'src\/cli\.mjs' 'target-approval-status' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^target_approval_resume_run_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_command: 'node' 'src\/cli\.mjs' 'agent-next' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_operator_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_operator_approval_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan' 'runs\/target-packs\/github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_operator_approval_plan_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--format' 'compact'$/m);
    assert.match(compact, /^agent_next_operator_approval_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_checklist_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_checklist_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_checklist_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-checklist-status' '--in' 'operator\/agent-proof-checklist-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_checklist_operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_write_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout' '--candidate' 'github' '--write' '--out' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_status_command: 'node' 'src\/cli\.mjs' 'agent-proof-closeout-status' '--in' 'operator\/agent-proof-closeout-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_command_id: agent-preflight$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_opens_browser: no$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_starts_capture: no$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_reads_browser_storage: no$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_returns_page_content: no$/m);
    assert.match(compact, /^agent_proof_closeout_target_approval_preflight_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_proof_closeout_target_approval_preflight_opens_browser: no$/m);
    assert.match(compact, /^agent_proof_closeout_target_approval_preflight_starts_capture: no$/m);
    assert.match(compact, /^agent_proof_closeout_target_proof_plan_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_proof_closeout_target_proof_plan_opens_browser: no$/m);
    assert.match(compact, /^agent_proof_closeout_target_proof_plan_starts_capture: no$/m);
    assert.match(compact, /^agent_proof_closeout_agent_safe_next_command: 'node' 'src\/cli\.mjs' 'agent-preflight'/m);
    assert.match(compact, /^agent_proof_closeout_target_approval_preflight_command: 'node' 'src\/cli\.mjs' 'target-approval-preflight'/m);
    assert.match(compact, /^agent_proof_closeout_target_proof_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-plan'/m);
    assert.match(compact, /^agent_proof_closeout_provider_doctor_status_command: 'node' 'src\/cli\.mjs' 'provider-doctor-status' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_operator_resume_command: 'node' 'src\/cli\.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_completion_proof_bundle_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_completion_proof_bundle_with_audit_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--write' '--out' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_completion_proof_bundle_status_command: 'node' 'src\/cli\.mjs' 'completion-proof-bundle-status' '--in' 'operator\/completion-proof-bundle-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_compact_command_audit_all_command: 'node' 'src\/cli\.mjs' 'compact-command-audit' '--source' 'all' '--strict' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_objective_completion_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--format' 'compact'$/m);
    assert.match(compact, /^agent_proof_closeout_objective_completion_strict_command: 'node' 'src\/cli\.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^agent_next_run_command: /m);
    assert.match(compact, /^background_proof_plan_status: waiting-for-login$/m);
    assert.match(compact, /^background_proof_capture_blocked: yes$/m);
    assert.match(compact, /^background_proof_capture_blocked_reason: handoff-auth-check-port-unreachable$/m);
    assert.match(compact, /^background_proof_monitor_available: no$/m);
    assert.match(compact, /^background_proof_capture_available: no$/m);
    assert.match(compact, /^background_proof_monitor_running: no$/m);
    assert.match(compact, /^background_proof_capture_running: no$/m);
    assert.match(compact, /^background_proof_capture_start_status: planned$/m);
    assert.match(compact, /^background_proof_capture_start_ready: no$/m);
    assert.match(compact, /^background_proof_capture_start_blockers: operator-ok-required$/m);
    assert.match(compact, /^objective_safe_command_status: waiting-for-login$/m);
    assert.match(compact, /^objective_safe_command_id: none$/m);
    assert.match(compact, /^objective_safe_command_monitor_only: no$/m);
    assert.match(compact, /^objective_safe_command_may_open_browser: no$/m);
    assert.match(compact, /^objective_safe_command_starts_capture: no$/m);
    assert.match(compact, /^objective_safe_command_blocked_reason: handoff-auth-check-port-unreachable$/m);
    assert.match(compact, /^objective_safe_command_proof_capture_allowed_now: no$/m);
    assert.match(compact, /^background_proof_status_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-status' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_command: /m);
    assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_background_command: /m);
    assert.match(compact, /^background_proof_capture_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'capture' '--timeout-ms' '300000' '--interval-ms' '5000' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.match(compact, /^background_proof_monitor_start_command: 'node' 'src\/cli\.mjs' 'background-proof-capture-start' '--mode' 'monitor' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^login_handoff_safe_monitor_command: /m);
    assert.match(compact, /^login_handoff_auth_first_resume_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.match(compact, /^login_handoff_status_command: 'node' 'src\/cli\.mjs' 'login-handoff-status' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^handoff_resume_recommended_command: /m);
    assert.match(compact, /^handoff_resume_capture_plan_command: 'node' 'src\/cli\.mjs' 'target-proof-capture'/m);
    assert.match(compact, /^regular_chrome_backend_available: no$/m);
    assert.match(compact, /^regular_chrome_next_action: verify-codex-chrome-extension-backend$/m);
    assert.match(compact, /^regular_chrome_handoff_action: ask-user-ok-to-open-selected-profile-window-and-retry$/m);
    assert.match(compact, /^regular_chrome_resume_action: plan-requires-operator-ok$/m);
    assert.match(compact, /^regular_chrome_operator_ok_required: yes$/m);
    assert.match(compact, /^regular_chrome_user_permission_required: yes$/m);
    assert.match(compact, /^regular_chrome_claim_plan_ready: no$/m);
    assert.match(compact, /^regular_chrome_claim_plan_next_action: run-chrome-extension-troubleshoot-or-resume$/m);
    assert.match(compact, /^regular_chrome_claim_plan_next_tool: none$/m);
    assert.match(compact, /^regular_chrome_claim_plan_snippet_keys: none$/m);
    assert.match(compact, /^regular_chrome_backend_check_plan_next_action: run-node-repl-backend-probe$/m);
    assert.match(compact, /^regular_chrome_backend_check_plan_next_tool: mcp__node_repl__js$/m);
    assert.match(compact, /^regular_chrome_backend_check_plan_snippet_keys: probe$/m);
    assert.match(compact, /^regular_chrome_mcp_page_list_timeout: yes$/m);
    assert.match(compact, /^regular_chrome_mcp_use_everyday_now: no$/m);
    assert.match(compact, /^regular_chrome_mcp_timeout_plan_next_action: use-gated-extension-resume-or-clean-stale-mcp$/m);
    assert.match(compact, /^regular_chrome_mcp_timeout_plan_findings: page-list-timeout,regular-chrome-not-debuggable$/m);
    assert.match(compact, /^regular_chrome_usable_now: no$/m);
    assert.match(compact, /^regular_chrome_background_capable_now: no$/m);
    assert.match(compact, /^regular_chrome_blocked_reason: .*operator OK/m);
    assert.match(compact, /^regular_chrome_mcp_timeout_plan_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan'/m);
    assert.match(compact, /^regular_chrome_backend_check_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-backend-check-plan' '--format' 'compact'$/m);
    assert.match(compact, /^regular_chrome_backend_check_record_failure_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect' '--chrome-extension-prepared' 'yes' '--chrome-extension-backend-available' 'no'/m);
    assert.match(compact, /^regular_chrome_backend_check_record_success_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect' '--chrome-extension-prepared' 'yes' '--chrome-extension-backend-available' 'yes'/m);
    assert.match(compact, /^regular_chrome_claim_plan_command: 'node' 'src\/cli\.mjs' 'chrome-extension-claim-plan' '--backend-ready' 'no' '--intent' 'inspect' '--format' 'compact'$/m);
    assert.match(compact, /^regular_chrome_resume_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--format' 'compact'$/m);
    assert.match(compact, /^regular_chrome_approval_command: 'node' 'src\/cli\.mjs' 'chrome-extension-resume' '--run' '--operator-ok' 'OK' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^agent_safe_command: /m);
    assert.match(compact, /^auth_first_reopen_login_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.match(compact, /^agent_loop_step_plan_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
    if (/^agent_loop_step_run_command: /m.test(compact)) {
      assert.match(compact, /^agent_loop_step_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
    }
    assert.match(compact, /^agent_loop_step_status_command: 'node' 'src\/cli\.mjs' 'agent-loop-step-status' '--in' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_loop_step_recommended_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
    assert.match(compact, /^agent_loop_step_refresh_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^agent_loop_step_saved_run_command: 'node' 'src\/cli\.mjs' 'agent-loop-step' '--run' '--write' '--out' 'operator\/agent-loop-step-latest\.json' '--timeout-ms' '300000' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^auth_watch_command: /m);
    assert.match(compact, /^handoff_resume_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.doesNotMatch(compact, /^command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.doesNotMatch(compact, /open-chrome-window/);
    assert.match(compact, /^secret_env_handoff_mode: environment-local-env$/m);
    assert.match(compact, /^secret_headless_config_available: yes$/m);
    assert.match(compact, /^secret_mutates_onepassword_now: no$/m);
    assert.match(compact, /^operator_pack: .*operator\/pack\.json$/m);
    assert.match(compact, /^login_handoff_status_file: .*operator\/login-handoff-status-latest\.json$/m);
    assert.match(compact, /^agent_loop_step_status_file: .*operator\/agent-loop-step-latest\.json$/m);
    assert.match(compact, /^browser_route: .*operator\/browser-route-latest\.json$/m);
    assert.match(compact, /^backend_matrix: .*operator\/backend-matrix-latest\.json$/m);
    assert.match(compact, /^chrome_extension_status: .*operator\/chrome-extension-status-latest\.json$/m);
    assert.match(compact, /^chrome_extension_handoff: .*operator\/chrome-extension-handoff\.json$/m);
    assert.match(compact, /^chrome_extension_resume: .*operator\/chrome-extension-resume-latest\.json$/m);
    assert.match(compact, /^chrome_extension_troubleshoot: .*operator\/chrome-extension-troubleshoot-latest\.json$/m);
    assert.match(compact, /^chrome_extension_claim_plan: .*operator\/chrome-extension-claim-plan-latest\.json$/m);
    assert.match(compact, /^chrome_mcp_timeout_plan: .*operator\/chrome-mcp-timeout-plan-latest\.json$/m);
    assert.match(compact, /^background_proof_capture_plan: .*operator\/background-proof-capture-plan-latest\.json$/m);
    assert.match(compact, /^background_proof_capture_status: .*operator\/background-proof-capture-status-latest\.json$/m);
    assert.match(compact, /^background_proof_capture_start: .*operator\/background-proof-capture-start-latest\.json$/m);
    assert.match(compact, /^background_proof_monitor_start: .*operator\/background-auth-monitor-start-latest\.json$/m);
    assert.match(compact, /^objective_proof_pipeline: .*operator\/objective-proof-pipeline-latest\.json$/m);
    assert.match(compact, /^objective_safe_command: .*operator\/objective-safe-command-latest\.json$/m);
    assert.match(compact, /^agent_proof_checklist: .*operator\/agent-proof-checklist-latest\.json$/m);
    assert.match(compact, /^agent_proof_closeout: .*operator\/agent-proof-closeout-latest\.json$/m);
    assert.match(compact, /^secret_env_handoff: .*operator\/secret-env-handoff\.json$/m);
    assert.match(compact, /^backend_matrix_refresh_command: 'node' 'src\/cli\.mjs' 'backend-matrix' '--write' '--out' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_status_command: 'node' 'src\/cli\.mjs' 'backend-matrix-status' '--in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_existing_tab_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'existing-tab' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_public_crawl_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'public-crawl' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_compatibility_route_command: 'node' 'src\/cli\.mjs' 'browser-route' '--task' 'compatibility-test' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_search_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'search' '--query' '<query>' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_operate_workflow_command: 'node' 'src\/cli\.mjs' 'agent-workflow' '--task' 'operate' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_operate_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'operate' '--backend-matrix-in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^backend_matrix_existing_tab_selector_command: 'node' 'src\/cli\.mjs' 'agent-backend-select' '--task' 'existing-tab' '--backend-matrix-in' 'operator\/backend-matrix-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^proof_pipeline_command: 'node' 'src\/cli\.mjs' 'objective-proof-pipeline' '--format' 'compact'$/m);
    assert.doesNotMatch(compact, /^proof_pipeline_monitor_auth_command: /m);
    assert.match(compact, /^proof_pipeline_reopen_login_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.doesNotMatch(compact, /^proof_pipeline_reopen_login_command: .*--wait-auth/m);
    assert.match(compact, /^proof_pipeline_wait_capture_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.match(compact, /^proof_pipeline_wait_capture_no_open_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume'/m);
    assert.doesNotMatch(compact, /^proof_pipeline_wait_capture_no_open_command: .*--open-login/m);
    assert.doesNotMatch(compact, /^background_proof_no_open_wait_capture_command: /m);
    assert.match(compact, /^proof_gate_watch_command: 'node' 'src\/cli\.mjs' 'proof-gate-watch'/m);
    const markdown = formatOperatorPackMarkdown(pack);
    assert.match(markdown, /Operator Pack/);
    assert.match(markdown, /Login Handoff/);
    assert.match(markdown, /Login Monitor Commands/);
    assert.match(markdown, /Login Handoff Status Command/);
    assert.match(markdown, /Background Proof Capture/);
    assert.match(markdown, /Backend Matrix/);
    assert.match(markdown, /Proof Pipeline/);
    assert.match(markdown, /Run Gate/);
    assert.match(markdown, /Unguarded agent dangerous: 0/);
    assert.match(markdown, /Objective Safe Command/);
    assert.doesNotMatch(markdown, /target-auth-watch/);
    assert.match(markdown, /target-handoff-resume/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack rejects output paths outside runs', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-bad-out-'));
  try {
    await assert.rejects(
      () => buildOperatorPack({
        rootDir,
        out: '../pack.json',
        ...fixtures(rootDir)
      }),
      /invalid operator pack output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack status reads saved JSON without recomputing browser work', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-status-'));
  try {
    await buildOperatorPack({
      rootDir,
      generatedAt: '2026-05-31T00:00:00.000Z',
      write: true,
      out: 'operator/operator-pack-latest.json',
      ...fixtures(rootDir)
    });

    const status = buildOperatorPackStatus({
      rootDir,
      in: 'operator/operator-pack-latest.json'
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
    assert.equal(status.stale, false);
    assert.equal(status.savedComplete, false);
    assert.equal(status.savedStatus, 'waiting-for-login');
    assert.equal(status.savedTarget, 'github');
    assert.equal(status.readinessRemaining.includes('real-external-auth-target'), true);
    assert.equal(status.providerPublicBenchmarkProofExists, true);
    assert.equal(status.providerPublicBenchmarkProofOk, true);
    assert.equal(status.providerPublicBenchmarkFastestMeasuredProvider, 'direct-cdp-daemon');
    assert.equal(status.providerPublicBenchmarkAgentMayRunUnattended, true);
    assert.equal(status.providerPublicBenchmarkReadsBrowserStorage, false);
    assert.equal(status.providerPublicBenchmarkReturnsPageContent, false);

    const compact = formatOperatorPackStatusCompact(status);
    assert.match(compact, /^status_only: yes$/m);
    assert.match(compact, /^input_path: operator\/operator-pack-latest\.json$/m);
    assert.match(compact, /^saved_status: waiting-for-login$/m);
    assert.match(compact, /^readiness_remaining: .*real-external-auth-target/m);
    assert.match(compact, /^provider_public_benchmark_proof_ok: yes$/m);
    assert.match(compact, /^provider_public_benchmark_fastest_measured_provider: direct-cdp-daemon$/m);
    assert.match(compact, /^provider_public_benchmark_reads_browser_storage: no$/m);
    assert.match(compact, /^provider_public_benchmark_returns_page_content: no$/m);
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'operator-pack' '--write'/m);
    assert.match(compact, /^status_command: 'node' 'src\/cli\.mjs' 'operator-pack-status'/m);
    assert.equal(compact.includes(rootDir), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack status reports missing stale files and rejects paths outside runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-status-missing-'));
  try {
    const missing = buildOperatorPackStatus({
      rootDir,
      in: 'operator/missing-pack.json'
    });
    assert.equal(missing.exists, false);
    assert.equal(missing.stale, true);
    assert.equal(missing.agentSafeNextCommandId, 'operator-pack-refresh');
    assert.equal(missing.agentSafeNextMayRunUnattended, true);
    assert.match(formatOperatorPackStatusCompact(missing), /^refresh_command: 'node' 'src\/cli\.mjs' 'operator-pack' '--write'/m);

    assert.throws(
      () => buildOperatorPackStatus({ rootDir, in: '../pack.json' }),
      /invalid operator pack input path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack preserves short monitor settings in agent loop commands', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-monitor-'));
  try {
    const input = fixtures(rootDir);
    delete input.agentLoopStepStatus;
    const pack = await buildOperatorPack({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      monitorTimeoutMs: 10000,
      monitorIntervalMs: 1000,
      ...input
    });

    const compact = formatOperatorPackCompact(pack);
    assert.match(pack.executionPolicy.agentLoopStepPlanCommand.shell, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
    assert.equal(pack.executionPolicy.agentLoopStepRunCommand, null);
    assert.match(pack.executionPolicy.agentLoopStepStatusCommand.shell, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
    assert.match(pack.agentLoopStepStatus.refreshCommand.shell, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
    assert.match(pack.objectiveSafeCommand.agentProofStep.planCommand.shell, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
    assert.match(pack.proofPipeline.command.shell, /'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/);
    assert.equal(pack.proofPipeline.monitorAuthCommand, null);
    assert.match(pack.proofPipeline.reopenLoginCommand.shell, /target-handoff-resume/);
    assert.doesNotMatch(pack.proofPipeline.reopenLoginCommand.shell, /--wait-auth/);
    assert.doesNotMatch(pack.proofPipeline.waitCaptureCommand.shell, /'--timeout-ms' '10000'/);
    assert.equal(pack.authWatchCommand, null);
    assert.equal(pack.executionPolicy.agentSafeCommand, null);
    assert.match(pack.executionPolicy.authFirstReopenLoginCommand.shell, /target-handoff-resume/);
    assert.doesNotMatch(pack.executionPolicy.authFirstReopenLoginCommand.shell, /--wait-auth/);
    assert.equal(pack.loginHandoff.safeMonitorCommand, null);
    assert.doesNotMatch(pack.loginHandoff.authFirstResumeCommand.shell, /'--timeout-ms' '10000'/);
    assert.match(compact, /^agent_loop_step_plan_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
    assert.doesNotMatch(compact, /^agent_loop_step_run_command: /m);
    assert.match(compact, /^agent_loop_step_status_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
    assert.match(compact, /^proof_pipeline_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
    assert.doesNotMatch(compact, /^proof_pipeline_monitor_auth_command: /m);
    assert.match(compact, /^proof_pipeline_reopen_login_command: /m);
    assert.match(compact, /^background_proof_capture_start_command: .*'--timeout-ms' '300000' '--interval-ms' '5000'/m);
    assert.match(compact, /^background_proof_monitor_start_command: .*'--monitor-timeout-ms' '10000' '--monitor-interval-ms' '1000'/m);
    assert.doesNotMatch(compact, /^login_handoff_safe_monitor_command: /m);
    assert.doesNotMatch(compact, /^agent_safe_command: /m);
    assert.match(compact, /^auth_first_reopen_login_command: .*target-handoff-resume/m);
    assert.doesNotMatch(compact, /^auth_first_reopen_login_command: .*--wait-auth/m);
    assert.doesNotMatch(compact, /^auth_watch_command: /m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack normalizes raw Chrome MCP observations into timeout guidance', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-mcp-text-'));
  try {
    const data = fixtures(rootDir);
    delete data.chromeMcpTimeoutPlan;
    const pack = await buildOperatorPack({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      write: false,
      ...data,
      runtimeAudit: {
        processBreakdown: {
          chromeDevtoolsMcp: { total: 1, parts: { server: 1 } },
          peekaboo: { total: 1, parts: { server: 1 } }
        },
        groups: {
          chromeDevtoolsMcp: { items: [] }
        },
        chromeApp: {
          regularProfiles: 1,
          regularProfileRemoteDebugging: 0,
          codexBrowserAgentProfiles: 1,
          targetPackProfiles: 0
        },
        chromeDevtools: {
          endpoint: { ok: false },
          diaEndpoint: { ok: false }
        }
      },
      runtimeCleanupPlan: {
        summary: {
          ownerSessionCount: 1,
          listedOwnerSessions: 1
        },
        ownerSessions: []
      },
      chromeMcpStatusText: `Chrome DevTools MCP Status

Connected: yes
Tools: 29`,
      chromeMcpListPagesText: 'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
      chromeMcpSource: 'peekaboo.browser.status+list_pages',
      chromeExtensionBackendAvailable: 'no',
      chromeExtensionBackendLastError: 'Browser is not available: extension',
      appleEventsActiveTabObserved: 'yes',
      appleEventsJavascriptAllowed: 'no'
    });

    assert.equal(pack.regularChrome.mcpPageListTimeout, true);
    assert.equal(pack.regularChrome.usePlanReady, false);
    assert.equal(pack.regularChrome.usePlanSelectedLane, 'regular-chrome-extension-resume');
    assert.equal(pack.regularChrome.usePlanBackend, 'codex-chrome-extension');
    assert.equal(pack.regularChrome.mcpTimeoutPlanNextAction, 'use-gated-extension-resume-or-clean-stale-mcp');
    assert.equal(pack.regularChrome.backendObservedAvailable, false);
    assert.equal(pack.regularChrome.backendObservedLastError, 'Browser is not available: extension');
    assert.equal(pack.regularChrome.troubleshootNextAction, 'open-selected-profile-window-after-operator-ok');
    assert.equal(pack.regularChrome.appleEventsObserved, true);
    assert.equal(pack.regularChrome.appleEventsActiveTabObserved, true);
    assert.equal(pack.regularChrome.appleEventsJavascriptAllowed, false);
    assert.equal(pack.regularChrome.appleEventsUsableForInspect, false);
    assert.equal(pack.regularChrome.appleEventsNextAction, 'enable-javascript-from-apple-events-if-operator-approves');
    assert.equal(pack.summaries.chromeMcpObservation.decision.status, 'page-list-timeout');
    assert.equal(pack.summaries.chromeMcpObservation.observed.tools, 29);
    assert.equal(pack.summaries.chromeExtensionTroubleshoot.observedBackendAvailable, false);
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /--observed-connected' 'yes/);
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /--observed-page-list-ok' 'no/);
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /--observed-last-error/);
    assert.match(pack.regularChrome.troubleshootCommand.shell, /--backend-available' 'no/);
    assert.match(pack.regularChrome.troubleshootCommand.shell, /Browser is not available: extension/);

    const compact = formatOperatorPackCompact(pack);
    assert.match(compact, /^regular_chrome_backend_observed_available: no$/m);
    assert.match(compact, /^regular_chrome_use_plan_lane: regular-chrome-extension-resume$/m);
    assert.match(compact, /^regular_chrome_apple_events_observed: yes$/m);
    assert.match(compact, /^regular_chrome_apple_events_javascript_allowed: no$/m);
    assert.match(compact, /^regular_chrome_apple_events_next_action: enable-javascript-from-apple-events-if-operator-approves$/m);
    assert.match(compact, /^regular_chrome_mcp_page_list_timeout: yes$/m);
    assert.match(compact, /^regular_chrome_mcp_timeout_plan_next_action: use-gated-extension-resume-or-clean-stale-mcp$/m);
    assert.match(compact, /^regular_chrome_troubleshoot_next_action: open-selected-profile-window-after-operator-ok$/m);
    assert.match(compact, /^regular_chrome_backend_last_error: Browser is not available: extension$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack accepts short Chrome MCP text aliases', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-short-alias-'));
  try {
    const pack = await buildOperatorPack({
      rootDir,
      ...fixtures(rootDir),
      'chrome-status-text': 'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29',
      'chrome-list-pages-text': 'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
      'chrome-extension-backend-available': 'no',
      'chrome-extension-backend-last-error': 'Transport closed',
      monitorTimeoutMs: 10000,
      monitorIntervalMs: 1000
    });
    const compact = formatOperatorPackCompact(pack);

    assert.match(compact, /^regular_chrome_mcp_page_list_timeout: yes$/m);
    assert.match(compact, /^regular_chrome_mcp_timeout_plan_next_action: use-gated-extension-resume-or-clean-stale-mcp$/m);
    assert.match(compact, /^regular_chrome_mcp_timeout_plan_command: .*--observed-connected' 'yes'.*--observed-page-list-ok' 'no'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack records profile-window retry failures as Chrome plugin reinstall guidance', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-extension-retry-'));
  try {
    const data = fixtures(rootDir);
    delete data.chromeMcpTimeoutPlan;
    const pack = await buildOperatorPack({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      write: false,
      ...data,
      runtimeAudit: {
        processBreakdown: {
          chromeDevtoolsMcp: { total: 1, parts: { server: 1 } },
          peekaboo: { total: 1, parts: { server: 1 } }
        },
        groups: {
          chromeDevtoolsMcp: { items: [] }
        },
        chromeApp: {
          regularProfiles: 1,
          regularProfileRemoteDebugging: 0,
          codexBrowserAgentProfiles: 1,
          targetPackProfiles: 0
        },
        chromeDevtools: {
          endpoint: { ok: false },
          diaEndpoint: { ok: false }
        }
      },
      runtimeCleanupPlan: {
        summary: {
          ownerSessionCount: 1,
          listedOwnerSessions: 1
        },
        ownerSessions: []
      },
      chromeMcpStatusText: 'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29',
      chromeMcpListPagesText: 'Chrome DevTools MCP failed: Execution failed: Request timed out after 30000ms',
      chromeExtensionBackendAvailable: 'no',
      chromeExtensionBackendLastError: 'Transport closed',
      chromeExtensionWindowRetryAttempted: 'yes'
    });

    assert.equal(pack.regularChrome.profileWindowRetryAttempted, true);
    assert.equal(pack.regularChrome.backendFailureAfterProfileWindowRetry, true);
    assert.equal(pack.regularChrome.extensionReinstallRecommended, true);
    assert.equal(pack.regularChrome.troubleshootNextAction, 'reinstall-codex-chrome-plugin-from-ui');
    assert.equal(pack.regularChrome.usePlanSelectedLane, 'regular-chrome-extension-reinstall-required');
    assert.equal(pack.regularChrome.usePlanNextAction, 'reinstall-codex-chrome-plugin-from-ui');
    assert.match(pack.regularChrome.troubleshootCommand.shell, /--profile-window-retry-attempted' 'yes/);

    const compact = formatOperatorPackCompact(pack);
    assert.match(compact, /^regular_chrome_profile_window_retry_attempted: yes$/m);
    assert.match(compact, /^regular_chrome_backend_failure_after_profile_window_retry: yes$/m);
    assert.match(compact, /^regular_chrome_extension_reinstall_recommended: yes$/m);
    assert.match(compact, /^regular_chrome_use_plan_lane: regular-chrome-extension-reinstall-required$/m);
    assert.match(compact, /^regular_chrome_use_plan_next_action: reinstall-codex-chrome-plugin-from-ui$/m);
    assert.match(compact, /^regular_chrome_troubleshoot_next_action: reinstall-codex-chrome-plugin-from-ui$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack can hydrate Apple Events state from a saved status file', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-apple-events-file-'));
  try {
    const statusPath = path.join(rootDir, 'runs/operator/chrome-apple-events-status-latest.json');
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    fs.writeFileSync(statusPath, `${JSON.stringify({
      activeTab: {
        observed: true,
        urlRedacted: 'https://example.com/private'
      },
      javascript: {
        allowed: false
      },
      nextAction: 'enable-javascript-from-apple-events-if-operator-approves'
    }, null, 2)}\n`, 'utf8');

    const pack = await buildOperatorPack({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      write: false,
      ...fixtures(rootDir),
      appleEventsStatusFile: 'operator/chrome-apple-events-status-latest.json'
    });

    assert.equal(pack.regularChrome.appleEventsObserved, true);
    assert.equal(pack.regularChrome.appleEventsActiveTabObserved, true);
    assert.equal(pack.regularChrome.appleEventsJavascriptAllowed, false);
    assert.equal(pack.regularChrome.appleEventsStatusFile, statusPath);
    assert.equal(pack.summaries.appleEventsObservation.statusFile, statusPath);
    assert.match(pack.regularChrome.savedUsePlanRefreshCommand.shell, /--apple-events-status-file' 'operator\/chrome-apple-events-status-latest\.json/);

    const compact = formatOperatorPackCompact(pack);
    assert.match(compact, /^regular_chrome_apple_events_observed: yes$/m);
    assert.match(compact, /^regular_chrome_apple_events_status_file: .*chrome-apple-events-status-latest\.json$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack reuses a fresh saved regular Chrome observation when live observations are absent', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-saved-regular-chrome-'));
  try {
    const savedPath = path.join(rootDir, 'runs/operator/regular-chrome-use-latest.json');
    fs.mkdirSync(path.dirname(savedPath), { recursive: true });
    fs.writeFileSync(savedPath, `${JSON.stringify({
      safeMode: true,
      destructiveActionsIncluded: false,
      secretValuesRead: false,
      opensBrowserNow: false,
      ready: false,
      selectedLane: 'regular-chrome-extension-reinstall-required',
      backend: 'codex-chrome-extension',
      nextAction: 'reinstall-codex-chrome-plugin-from-ui',
      command: {
        shell: "'node' 'src/cli.mjs' 'chrome-extension-troubleshoot' '--format' 'compact'",
        args: ['node', 'src/cli.mjs', 'chrome-extension-troubleshoot', '--format', 'compact']
      },
      approvalCommand: null,
      chromeMcp: {
        observedConnected: true,
        observedTools: 29,
        observedPageListOk: false,
        observedPageCount: null,
        listPagesTimedOut: true,
        lastError: 'Network.enable timed out',
        source: 'peekaboo.browser.status+list_pages.live'
      },
      extension: {
        backendAvailable: false,
        profileWindowRetryAttempted: true,
        reinstallRecommended: true,
        backendLastError: 'Transport closed'
      },
      appleEvents: {
        observed: true,
        activeTabObserved: true,
        javascriptAllowed: false,
        usableForInspect: false,
        nextAction: 'enable-javascript-from-apple-events-if-operator-approves'
      },
      outputPath: savedPath
    }, null, 2)}\n`, 'utf8');

    const pack = await buildOperatorPack({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      write: false,
      ...fixtures(rootDir)
    });

    assert.equal(pack.regularChrome.savedUsePlanAvailable, true);
    assert.equal(pack.regularChrome.savedUsePlanUsed, true);
    assert.equal(pack.regularChrome.savedUsePlanStale, false);
    assert.deepEqual(pack.regularChrome.savedUsePlanRefreshCommand.args, [
      'node',
      'src/cli.mjs',
      'regular-chrome-use',
      '--intent',
      'inspect',
      '--write',
      '--out',
      'operator/regular-chrome-use-latest.json',
      '--format',
      'compact'
    ]);
    assert.equal(pack.regularChrome.backendObservedAvailable, false);
    assert.equal(pack.regularChrome.backendObservedLastError, 'Transport closed');
    assert.equal(pack.regularChrome.profileWindowRetryAttempted, true);
    assert.equal(pack.regularChrome.backendFailureAfterProfileWindowRetry, true);
    assert.equal(pack.regularChrome.extensionReinstallRecommended, true);
    assert.equal(pack.regularChrome.troubleshootNextAction, 'reinstall-codex-chrome-plugin-from-ui');
    assert.equal(pack.regularChrome.usePlanSelectedLane, 'regular-chrome-extension-reinstall-required');
    assert.equal(pack.regularChrome.usePlanNextAction, 'reinstall-codex-chrome-plugin-from-ui');
    assert.equal(pack.regularChrome.mcpPageListTimeout, true);
    assert.equal(pack.regularChrome.mcpTimeoutPlanNextAction, 'use-gated-extension-resume-or-clean-stale-mcp');
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /--observed-connected' 'yes/);
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /--observed-tools' '29/);
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /--observed-page-list-ok' 'no/);
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /--observed-last-error' 'Network\.enable timed out/);
    assert.match(pack.regularChrome.mcpTimeoutPlanCommand.shell, /--observed-source' 'peekaboo\.browser\.status\+list_pages\.live/);
    assert.equal(pack.regularChrome.appleEventsObserved, true);
    assert.equal(pack.regularChrome.appleEventsActiveTabObserved, true);
    assert.equal(pack.regularChrome.appleEventsJavascriptAllowed, false);

    const compact = formatOperatorPackCompact(pack);
    assert.match(compact, /^regular_chrome_saved_use_plan_available: yes$/m);
    assert.match(compact, /^regular_chrome_saved_use_plan_used: yes$/m);
    assert.match(compact, /^regular_chrome_saved_use_plan_stale: no$/m);
    assert.match(compact, /^regular_chrome_saved_use_plan_refresh_command: 'node' 'src\/cli\.mjs' 'regular-chrome-use' '--intent' 'inspect' '--write' '--out' 'operator\/regular-chrome-use-latest\.json' '--format' 'compact'$/m);
    assert.match(compact, /^regular_chrome_backend_observed_available: no$/m);
    assert.match(compact, /^regular_chrome_profile_window_retry_attempted: yes$/m);
    assert.match(compact, /^regular_chrome_backend_failure_after_profile_window_retry: yes$/m);
    assert.match(compact, /^regular_chrome_extension_reinstall_recommended: yes$/m);
    assert.match(compact, /^regular_chrome_troubleshoot_next_action: reinstall-codex-chrome-plugin-from-ui$/m);
    assert.match(compact, /^regular_chrome_use_plan_lane: regular-chrome-extension-reinstall-required$/m);
    assert.match(compact, /^regular_chrome_mcp_page_list_timeout: yes$/m);
    assert.match(compact, /^regular_chrome_mcp_timeout_plan_next_action: use-gated-extension-resume-or-clean-stale-mcp$/m);
    assert.match(compact, /^regular_chrome_mcp_timeout_plan_command: .*--observed-connected' 'yes'.*--observed-page-list-ok' 'no'.*Network\.enable timed out/m);
    assert.match(compact, /^regular_chrome_backend_last_error: Transport closed$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('operator pack compact uses the freshly built backend matrix when no status input is explicit', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-operator-pack-fresh-backend-matrix-'));
  try {
    const staleStatusPath = path.join(rootDir, 'runs/operator/backend-matrix-latest.json');
    fs.mkdirSync(path.dirname(staleStatusPath), { recursive: true });
    fs.writeFileSync(staleStatusPath, '{not-json', 'utf8');

    const pack = await buildOperatorPack({
      rootDir,
      generatedAt: '2026-05-28T00:00:00.000Z',
      write: false,
      ...fixtures(rootDir)
    });
    const compact = formatOperatorPackCompact(pack);

    assert.equal(pack.backendMatrix.status, 'fresh');
    assert.equal(pack.backendMatrix.exists, true);
    assert.equal(pack.backendMatrix.stale, false);
    assert.match(compact, /^backend_matrix_status: fresh$/m);
    assert.doesNotMatch(compact, /^backend_matrix_status: parse-error$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
