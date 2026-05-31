import test from 'node:test';
import assert from 'node:assert/strict';
import { buildObjectiveNext, formatObjectiveNextCompact, formatObjectiveNextMarkdown } from '../src/objective-next.mjs';

const baseReadiness = {
  completeAgainstObjective: false,
  readyForLocalAuthenticatedDevelopment: true,
  summary: {
    proved: 9,
    'manual-required': 2
  },
  requirements: [
    { id: 'real-external-auth-target', status: 'manual-required', next: 'Create a target pack.' },
    { id: 'lightpanda-public-benchmark', status: 'manual-required', next: 'Install Lightpanda.' }
  ]
};

const missingProofArtifacts = [
  { id: 'auth-check', kind: 'proof', path: 'proof/auth-check.json', detail: 'auth-check proof is missing or still login-like' },
  { id: 'output:observe.json', kind: 'output', path: 'observe.json', detail: 'required output file is missing or empty' },
  { id: 'output:inspect.json', kind: 'output', path: 'inspect.json', detail: 'required output file is missing or empty' },
  { id: 'output:scrape.csv', kind: 'output', path: 'scrape.csv', detail: 'required output file is missing or empty' },
  { id: 'benchmark', kind: 'proof', path: 'proof/target-benchmark.json', detail: 'target benchmark proof is missing or has no successful run' },
  { id: 'target-proof', kind: 'proof', path: 'proof/target-proof.json', detail: 'accepted target proof is blocked until missing gates are satisfied' }
];

const backgroundRegularChromeStatus = {
  scope: {
    newBackgroundTabsAllowed: true
  },
  chromeMcp: {
    newBackgroundTabAllowed: true,
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL',
    newBackgroundUrlValueRead: false
  }
};

test('objective next chooses a real target candidate when no real external proof exists', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    handoffPortReachable: true,
    generatedAt: '2026-05-28T00:00:00.000Z',
    readiness: baseReadiness,
    targetNext: {
      complete: false,
      nextAction: {
        id: 'create-real-target-pack',
        label: 'Create or select a target pack with a real external origin',
        command: null
      },
      target: {
        target: 'example-public',
        blockers: ['Target pack has no real external origin.']
      }
    },
    lightpanda: {
      readyForPublicBenchmark: false,
      benchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true node src/cli.mjs benchmark --url https://example.com',
      checks: [
        { name: 'binary.available', status: 'manual-required', detail: 'No executable found.' },
        { name: 'source.clone', status: 'pass', detail: '/tmp/lightpanda' }
      ],
      download: {
        commands: ['curl -L -o "$HOME/.local/bin/lightpanda" https://example.invalid/lightpanda']
      }
    }
  });

  assert.equal(next.safeMode, true);
  assert.equal(next.destructiveActionsIncluded, false);
  assert.equal(next.complete, false);
  assert.equal(next.primaryAction.id, 'target-candidate-plan');
  assert.equal(next.primaryAction.needsOperatorInput, true);
  assert.match(next.primaryAction.command.shell, /target-bootstrap-plan/);
  assert.match(next.primaryAction.command.shell, /github/);
  assert.match(next.primaryAction.command.shell, /'compact'/);
  assert.deepEqual(next.primaryAction.startCommandCandidates.map((item) => item.id), [
    'regular-chrome-use',
    'chrome-mcp-observation-status',
    'chrome-mcp-timeout-plan-status',
    'chrome-mcp-autostart-plan',
    'chrome-mcp-autostart-plan-status',
    'backend-matrix-status',
    'backend-matrix-refresh',
    'lightpanda-doctor',
    'playwright-doctor',
    'selenium-doctor',
    'workflow-search',
    'workflow-analyze',
    'workflow-scrape',
    'workflow-operate',
    'target-candidate-plan',
    'target-candidate-plan-status',
    'target-candidate-plan-watch',
    'target-approval-status',
    'target-approval-preflight',
    'target-approval-resume',
    'target-approval-resume-status',
    'target-approval-resume-watch',
    'completion-proof-bundle',
    'completion-proof-bundle-write',
    'completion-proof-bundle-status',
    'completion-proof-bundle-watch',
    'agent-proof-checklist',
    'agent-proof-checklist-write',
    'agent-proof-checklist-status',
    'agent-proof-closeout',
    'agent-proof-closeout-write',
    'agent-proof-closeout-status',
    'target-bootstrap-plan',
    'secret-env-handoff',
    'secret-env-handoff-status',
    'secret-env-handoff-watch'
  ]);
  assert.equal(next.actions.find((item) => item.id === 'lightpanda-record-reject-decision').status, 'ready');
  assert.match(next.actions.find((item) => item.id === 'lightpanda-record-reject-decision').command.shell, /lightpanda-decision/);
  assert.equal(next.actions.length, 2);
  assert.equal(next.remainingRequirements.length, 2);
  assert.match(formatObjectiveNextMarkdown(next), /Objective Next/);
  assert.match(formatObjectiveNextMarkdown(next), /target-candidate-plan/);
  assert.match(formatObjectiveNextMarkdown(next), /Start Command Candidates/);
});

test('objective next chooses Lightpanda benchmark after real external proof is satisfied', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    handoffPortReachable: true,
    readiness: {
      ...baseReadiness,
      requirements: [
        { id: 'real-external-auth-target', status: 'proved' },
        { id: 'lightpanda-public-benchmark', status: 'manual-required', next: 'Benchmark Lightpanda.' }
      ]
    },
    targetNext: {
      complete: true
    },
    lightpanda: {
      readyForPublicBenchmark: true,
      benchmarkCommand: 'LIGHTPANDA_DISABLE_TELEMETRY=true SBA_LIGHTPANDA_PATH="/tmp/lightpanda" node src/cli.mjs benchmark --url https://example.com --write',
      checks: [],
      download: { commands: [] }
    }
  });

  assert.equal(next.primaryAction.id, 'lightpanda-public-benchmark');
  assert.equal(next.primaryAction.status, 'ready');
  assert.match(next.primaryAction.command.shell, /SBA_LIGHTPANDA_PATH/);
  assert.equal(next.remainingRequirements.length, 1);
});

test('objective next upgrades login action to one-shot login capture', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    readiness: {
      ...baseReadiness,
      requirements: [
        { id: 'real-external-auth-target', status: 'manual-required', next: 'Log in and capture proof.' },
        { id: 'lightpanda-public-benchmark', status: 'proved' }
      ]
    },
    targetNext: {
      complete: false,
      nextAction: {
        id: 'login',
        label: 'Target page still looks like a login screen',
        command: {
          args: ['node', 'src/cli.mjs', 'target-login', '/tmp/sba/runs/target-packs/github', '--real-external'],
          shell: "'node' 'src/cli.mjs' 'target-login' '/tmp/sba/runs/target-packs/github' '--real-external'"
        }
      },
      target: {
        target: 'github',
        blockers: []
      }
    },
    lightpanda: {
      readyForPublicBenchmark: false,
      checks: [],
      download: { commands: [] }
    }
  });

  assert.equal(next.primaryAction.id, 'target-login-capture');
  assert.equal(next.primaryAction.needsOperatorInput, true);
  assert.match(next.primaryAction.command.shell, /target-login-capture/);
  assert.match(next.primaryAction.command.shell, /--real-external/);
  assert.match(next.primaryAction.command.shell, /--handoff-out/);
  assert.match(next.primaryAction.command.shell, /--wait-auth-status-out/);
  assert.match(next.primaryAction.command.shell, /wait-auth-status\.json/);
  assert.match(next.primaryAction.command.shell, /--completion-audit/);
  assert.match(next.primaryAction.command.shell, /--format/);
  assert.match(next.primaryAction.command.shell, /'markdown'/);
  assert.equal(next.primaryAction.manualCommands.length, 1);
  assert.match(next.primaryAction.manualCommands[0], /--open-only/);
  assert.match(formatObjectiveNextMarkdown(next), /--open-only/);
});

test('objective next adds open-only alternative for existing login-capture action', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    readiness: {
      ...baseReadiness,
      requirements: [
        { id: 'real-external-auth-target', status: 'manual-required', next: 'Log in and capture proof.' },
        { id: 'lightpanda-public-benchmark', status: 'proved' }
      ]
    },
    targetNext: {
      complete: false,
      nextAction: {
        id: 'login-capture',
        label: 'Open the dedicated profile and capture proof',
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-login-capture',
            '/tmp/sba/runs/target-packs/github',
            '--real-external',
            '--handoff-out',
            'operator-handoff.json',
            '--wait-auth-status-out',
            'wait-auth-status.json',
            '--format',
            'markdown'
          ],
          shell: "'node' 'src/cli.mjs' 'target-login-capture' '/tmp/sba/runs/target-packs/github' '--real-external' '--handoff-out' 'operator-handoff.json' '--wait-auth-status-out' 'wait-auth-status.json' '--format' 'markdown'"
        }
      },
      target: {
        target: 'github',
        blockers: []
      }
    },
    lightpanda: {
      readyForPublicBenchmark: false,
      checks: [],
      download: { commands: [] }
    }
  });

  assert.equal(next.primaryAction.id, 'target-login-capture');
  assert.match(next.primaryAction.command.shell, /target-login-capture/);
  assert.match(next.primaryAction.command.shell, /--completion-audit/);
  assert.equal(next.primaryAction.manualCommands.length, 1);
  assert.match(next.primaryAction.manualCommands[0], /--open-only/);
});

test('objective next routes saved handoff state through auth-first resume', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    handoffPortReachable: true,
    readiness: {
      ...baseReadiness,
      requirements: [
        { id: 'real-external-auth-target', status: 'manual-required', next: 'Log in and capture proof.' },
        { id: 'lightpanda-public-benchmark', status: 'proved' }
      ]
    },
    targetNext: {
      complete: false,
      nextAction: {
        id: 'handoff-capture',
        label: 'Auth-check still sees login; complete login in the already-open browser, then run the saved handoff capture',
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-run',
            '/tmp/sba/runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--command',
            'post-login-capture',
            '--run',
            '--out',
            'handoff-run-latest.json',
            '--format',
            'markdown'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-run' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--command' 'post-login-capture' '--run' '--out' 'handoff-run-latest.json' '--format' 'markdown'"
        }
      },
      target: {
        target: 'github',
        dir: '/tmp/sba/runs/target-packs/github',
        operatorHandoff: {
          authCheckPort: '45678'
        },
        operatorGuidance: {
          humanAction: 'complete-login-in-open-dedicated-browser',
          automationBlocker: 'auth-check-not-ok',
          captureBlocked: true
        },
        missingArtifacts: missingProofArtifacts,
        blockers: ['Target auth-check proof file is not present or says the page still looks logged out.']
      }
    },
    lightpanda: {
      readyForPublicBenchmark: false,
      checks: [],
      download: { commands: [] }
    }
  });

  assert.equal(next.primaryAction.id, 'target-handoff-resume');
  assert.equal(next.primaryAction.needsOperatorInput, true);
  assert.equal(next.primaryAction.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
  assert.equal(next.primaryAction.operatorGuidance.automationBlocker, 'auth-check-not-ok');
  assert.equal(next.primaryAction.operatorGuidance.captureBlocked, true);
  assert.equal(next.primaryAction.nextArtifactAction, 'wait-auth-then-capture-proof');
  assert.equal(next.primaryAction.nextArtifactBlocker, 'auth-check-not-ok');
  assert.deepEqual(next.primaryAction.artifactCommandCovers, ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof']);
  assert.match(next.primaryAction.command.shell, /target-handoff-resume/);
  assert.match(next.primaryAction.command.shell, /--open-login/);
  assert.match(next.primaryAction.command.shell, /--wait-auth/);
  assert.match(next.primaryAction.command.shell, /handoff-resume-wait-auth-status\.json/);
  assert.match(next.primaryAction.command.shell, /handoff-resume-latest\.json/);
  assert.doesNotMatch(next.primaryAction.command.shell, /target-handoff-run/);
  assert.deepEqual(next.primaryAction.manualCommandCandidates.map((item) => item.id), ['handoff-resume-watch', 'auth-watch', 'login-capture-wait']);
  assert.match(next.primaryAction.manualCommands[0], /target-handoff-resume-watch/);
  assert.match(next.primaryAction.manualCommands[0], /--run/);
  assert.match(next.primaryAction.manualCommands[1], /target-auth-watch/);
  assert.match(next.primaryAction.manualCommands[1], /--handoff' 'operator-handoff\.json/);
  assert.doesNotMatch(next.primaryAction.manualCommands[1], /--cdp-port/);
  assert.match(next.primaryAction.manualCommands[1], /auth-watch-status\.json/);
  assert.match(next.primaryAction.manualCommands[2], /target-login-capture/);
  assert.match(next.primaryAction.manualCommands[2], /operator-handoff\.json/);
  assert.match(next.primaryAction.manualCommands[2], /wait-auth-status\.json/);
  assert.match(next.primaryAction.manualCommands[2], /--completion-audit/);
  assert.doesNotMatch(next.primaryAction.manualCommands[2], /--open-only/);
  assert.match(formatObjectiveNextMarkdown(next), /Needs operator input: yes/);
  assert.match(formatObjectiveNextMarkdown(next), /Human action: complete-login-in-open-dedicated-browser/);
  assert.match(formatObjectiveNextMarkdown(next), /Automation blocker: auth-check-not-ok/);
  assert.match(formatObjectiveNextMarkdown(next), /Capture blocked: yes/);
  assert.match(formatObjectiveNextMarkdown(next), /Next artifact action: wait-auth-then-capture-proof/);
  assert.match(formatObjectiveNextMarkdown(next), /login-capture-wait/);
});

test('objective next preserves auth-first direct handoff resume and compact output', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    handoffPortReachable: true,
    readiness: {
      ...baseReadiness,
      requirements: [
        { id: 'real-external-auth-target', status: 'manual-required', next: 'Log in and capture proof.' },
        { id: 'lightpanda-public-benchmark', status: 'proved' }
      ]
    },
    targetNext: {
      complete: false,
      nextAction: {
        id: 'handoff-resume',
        label: 'Auth-check still sees login; continue through the auth-first handoff resume lane',
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-resume',
            '/tmp/sba/runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--run',
            '--open-login',
            '--wait-auth',
            '--wait-auth-status-out',
            'handoff-resume-wait-auth-status.json',
            '--out',
            'handoff-resume-latest.json',
            '--format',
            'compact'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--open-login' '--wait-auth' '--wait-auth-status-out' 'handoff-resume-wait-auth-status.json' '--out' 'handoff-resume-latest.json' '--format' 'compact'"
        }
      },
      target: {
        target: 'github',
        dir: '/tmp/sba/runs/target-packs/github',
        operatorHandoff: {
          authCheckPort: '45678'
        },
        operatorGuidance: {
          humanAction: 'complete-login-in-open-dedicated-browser',
          automationBlocker: 'auth-check-not-ok',
          captureBlocked: true
        },
        missingArtifacts: missingProofArtifacts,
        blockers: ['Target auth-check proof file is not present or says the page still looks logged out.']
      }
    },
    lightpanda: {
      readyForPublicBenchmark: false,
      checks: [],
      download: { commands: [] }
    }
  });

  assert.equal(next.primaryAction.id, 'target-handoff-resume');
  assert.equal(next.primaryAction.needsOperatorInput, true);
  assert.equal(next.primaryAction.operatorGuidance.humanAction, 'complete-login-in-open-dedicated-browser');
  assert.equal(next.primaryAction.operatorGuidance.automationBlocker, 'auth-check-not-ok');
  assert.equal(next.primaryAction.operatorGuidance.captureBlocked, true);
  assert.equal(next.primaryAction.nextArtifactAction, 'wait-auth-then-capture-proof');
  assert.equal(next.primaryAction.nextArtifactBlocker, 'auth-check-not-ok');
  assert.deepEqual(next.primaryAction.artifactCommandCovers, ['auth-check', 'observe', 'inspect', 'scrape', 'benchmark', 'target-proof']);
  assert.match(next.primaryAction.command.shell, /target-handoff-resume/);
  assert.equal(next.primaryAction.missingArtifacts.length, 6);
  assert.deepEqual(next.primaryAction.manualCommandCandidates.map((item) => item.id), ['handoff-resume-watch', 'auth-watch', 'login-capture-wait']);
  const compact = formatObjectiveNextCompact(next);
  assert.match(compact, /^primary: target-handoff-resume/m);
  assert.match(compact, /^operator_input: yes/m);
  assert.match(compact, /^human_action: complete-login-in-open-dedicated-browser/m);
  assert.match(compact, /^automation_blocker: auth-check-not-ok/m);
  assert.match(compact, /^capture_blocked: yes/m);
  assert.match(compact, /^planned_primary_opens_browser: yes$/m);
  assert.match(compact, /^planned_primary_starts_capture: yes$/m);
  assert.match(compact, /^primary_requires_operator_approval: yes$/m);
  assert.match(compact, /^agent_must_not_run_primary_unattended: yes$/m);
  assert.match(compact, /^missing_artifact_count: 6$/m);
  assert.match(compact, /^missing_artifacts: auth-check,output:observe\.json,output:inspect\.json,output:scrape\.csv,benchmark,target-proof$/m);
  assert.match(compact, /^missing_output_files: observe\.json,inspect\.json,scrape\.csv$/m);
  assert.match(compact, /^next_artifact_action: wait-auth-then-capture-proof$/m);
  assert.match(compact, /^next_artifact_blocker: auth-check-not-ok$/m);
  assert.match(compact, /^artifact_command_covers: auth-check,observe,inspect,scrape,benchmark,target-proof$/m);
  assert.match(compact, /^manual_candidates: handoff-resume-watch,auth-watch,login-capture-wait/m);
  assert.match(compact, /^manual_handoff_resume_watch_opens_browser: no$/m);
  assert.match(compact, /^manual_handoff_resume_watch_starts_capture: yes$/m);
  assert.match(compact, /^manual_handoff_resume_watch_requires_operator_approval: yes$/m);
  assert.match(compact, /^manual_handoff_resume_watch_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^manual_handoff_resume_watch_command: 'node' 'src\/cli\.mjs' 'target-handoff-resume-watch' 'runs\/target-packs\/github' '--handoff' 'operator-handoff\.json' '--run' '--format' 'compact'$/m);
  assert.match(compact, /^manual_auth_watch_opens_browser: no$/m);
  assert.match(compact, /^manual_auth_watch_starts_capture: no$/m);
  assert.match(compact, /^manual_auth_watch_requires_operator_approval: no$/m);
  assert.match(compact, /^manual_auth_watch_agent_must_not_run_unattended: no$/m);
  assert.match(compact, /^manual_auth_watch_command: 'node' 'src\/cli\.mjs' 'target-auth-watch'/m);
  assert.match(compact, /^manual_auth_watch_command: .*'--timeout-ms' '300000'.*'--interval-ms' '5000'/m);
  assert.match(compact, /^manual_login_capture_wait_opens_browser: yes$/m);
  assert.match(compact, /^manual_login_capture_wait_starts_capture: yes$/m);
  assert.match(compact, /^manual_login_capture_wait_requires_operator_approval: yes$/m);
  assert.match(compact, /^manual_login_capture_wait_agent_must_not_run_unattended: yes$/m);
  assert.match(compact, /^manual_login_capture_wait_command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
  assert.equal(next.primaryAction.startCommandCandidates.every((item) => item.safety && typeof item.safety.agentMayRunUnattended === 'boolean'), true);
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
  assert.match(compact, /^start_target_candidate_plan_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan' '--candidate' 'github' '--format' 'compact'$/m);
  assert.match(compact, /^start_target_candidate_plan_status_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan-status' '--in' 'operator\/target-candidate-plan-latest\.json' '--format' 'compact'$/m);
  assert.match(compact, /^start_target_candidate_plan_watch_command: 'node' 'src\/cli\.mjs' 'target-candidate-plan-watch' '--run' '--in' 'operator\/target-candidate-plan-latest\.json' '--out' 'operator\/target-candidate-plan-latest\.json' '--candidate' 'github' '--format' 'compact'$/m);
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
  assert.match(compact, /^start_secret_run_select_command: 'node' 'src\/cli\.mjs' 'secret-run-select' '--command' 'target-login-capture' '--target-dir' 'runs\/target-packs\/github' '--format' 'compact'$/m);
  assert.doesNotMatch(compact, /\/tmp\/sba\/runs\/target-packs\/github/);
  assert.match(compact, /^start_secret_env_handoff_command: 'node' 'src\/cli\.mjs' 'secret-env-handoff' '--format' 'compact'$/m);
  assert.match(compact, /^start_secret_env_handoff_status_command: 'node' 'src\/cli\.mjs' 'secret-env-handoff-status' '--in' 'operator\/secret-env-handoff\.json' '--format' 'compact'$/m);
  assert.match(compact, /^start_secret_env_handoff_watch_command: 'node' 'src\/cli\.mjs' 'secret-env-handoff-watch' '--run' '--in' 'operator\/secret-env-handoff\.json' '--out' 'operator\/secret-env-handoff\.json' '--format' 'compact'$/m);
  assert.match(compact, /^secret_values_read: no$/m);
  assert.doesNotMatch(compact, /^\{/);
});

test('objective next can shorten handoff resume watch and auth watch monitor settings', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    handoffPortReachable: true,
    monitorTimeoutMs: 10000,
    monitorIntervalMs: 1000,
    readiness: {
      ...baseReadiness,
      requirements: [
        { id: 'real-external-auth-target', status: 'manual-required', next: 'Log in and capture proof.' },
        { id: 'lightpanda-public-benchmark', status: 'proved' }
      ]
    },
    targetNext: {
      complete: false,
      nextAction: {
        id: 'handoff-resume',
        label: 'Auth-check still sees login; continue through the auth-first handoff resume lane',
        command: {
          args: [
            'node',
            'src/cli.mjs',
            'target-handoff-resume',
            '/tmp/sba/runs/target-packs/github',
            '--handoff',
            'operator-handoff.json',
            '--run',
            '--open-login',
            '--wait-auth',
            '--wait-auth-status-out',
            'handoff-resume-wait-auth-status.json',
            '--out',
            'handoff-resume-latest.json',
            '--format',
            'compact'
          ],
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--open-login' '--wait-auth' '--wait-auth-status-out' 'handoff-resume-wait-auth-status.json' '--out' 'handoff-resume-latest.json' '--format' 'compact'"
        }
      },
      target: {
        target: 'github',
        dir: '/tmp/sba/runs/target-packs/github',
        operatorHandoff: true,
        authCheckOk: false,
        missingArtifacts: missingProofArtifacts,
        blockers: ['auth-check-not-ok']
      }
    },
    lightpanda: {
      readyForPublicBenchmark: false,
      checks: [],
      download: { commands: [] }
    }
  });

  const compact = formatObjectiveNextCompact(next);
  assert.match(compact, /^manual_handoff_resume_watch_command: .*'--monitor-timeout-ms' '10000'.*'--monitor-interval-ms' '1000'/m);
  assert.match(compact, /^manual_auth_watch_command: .*'--timeout-ms' '10000'.*'--interval-ms' '1000'/m);
  assert.doesNotMatch(compact, /^manual_auth_watch_command: .*'--timeout-ms' '300000'/m);
});

test('objective next suppresses no-open handoff watchers when saved handoff port is stale', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    handoffPortReachable: false,
    readiness: {
      ...baseReadiness,
      requirements: [
        { id: 'real-external-auth-target', status: 'manual-required', next: 'Log in and capture proof.' },
        { id: 'lightpanda-public-benchmark', status: 'proved' }
      ]
    },
    targetNext: {
      complete: false,
      nextAction: {
        id: 'handoff-resume',
        label: 'Continue through the auth-first handoff resume lane',
        command: {
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', '/tmp/sba/runs/target-packs/github', '--handoff', 'operator-handoff.json', '--run', '--open-login', '--wait-auth', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--run' '--open-login' '--wait-auth' '--format' 'compact'"
        }
      },
      target: {
        target: 'github',
        dir: '/tmp/sba/runs/target-packs/github',
        operatorHandoff: { authCheckPort: '45678' },
        missingArtifacts: missingProofArtifacts,
        blockers: ['auth-check-not-ok']
      }
    },
    lightpanda: {
      readyForPublicBenchmark: false,
      checks: [],
      download: { commands: [] }
    }
  });

  const compact = formatObjectiveNextCompact(next);
  assert.deepEqual(next.primaryAction.manualCommandCandidates.map((item) => item.id), ['login-capture-wait']);
  assert.doesNotMatch(compact, /^manual_auth_watch_command: /m);
  assert.doesNotMatch(compact, /^manual_handoff_resume_watch_command: /m);
  assert.match(compact, /^manual_login_capture_wait_command: 'node' 'src\/cli\.mjs' 'target-login-capture'/m);
});

test('objective next preserves everyday Chrome background-tab opt-in in start commands', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    generatedAt: '2026-05-28T00:00:00.000Z',
    readiness: {
      ...baseReadiness,
      requirements: [
        { id: 'real-external-auth-target', status: 'manual-required', next: 'Create a target pack.' },
        { id: 'lightpanda-public-benchmark', status: 'proved', next: '' }
      ]
    },
    regularChromeStatus: backgroundRegularChromeStatus,
    targetNext: {
      complete: false,
      nextAction: {
        id: 'handoff-resume',
        label: 'Resume saved handoff',
        command: {
          args: ['node', 'src/cli.mjs', 'target-handoff-resume', '/tmp/sba/runs/target-packs/github', '--handoff', 'operator-handoff.json', '--format', 'compact'],
          shell: "'node' 'src/cli.mjs' 'target-handoff-resume' '/tmp/sba/runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'"
        }
      },
      target: {
        target: 'github',
        dir: '/tmp/sba/runs/target-packs/github',
        operatorHandoff: true,
        authCheckOk: false,
        missingArtifacts: missingProofArtifacts,
        blockers: ['auth-check-not-ok']
      }
    },
    lightpanda: {
      readyForPublicBenchmark: false,
      checks: [],
      download: { commands: [] }
    }
  });

  const compact = formatObjectiveNextCompact(next);
  assert.match(compact, /^start_regular_chrome_use_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(compact, /^start_chrome_mcp_timeout_plan_status_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(compact, /^start_backend_matrix_status_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
  assert.match(compact, /^start_backend_matrix_refresh_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
});

test('objective next reports completion when readiness is complete', async () => {
  const next = await buildObjectiveNext({
    rootDir: '/tmp/sba',
    readiness: {
      completeAgainstObjective: true,
      readyForLocalAuthenticatedDevelopment: true,
      summary: { proved: 11 },
      requirements: [
        { id: 'real-external-auth-target', status: 'proved' },
        { id: 'lightpanda-public-benchmark', status: 'proved' }
      ]
    },
    targetNext: { complete: true },
    lightpanda: { readyForPublicBenchmark: true, checks: [], download: { commands: [] } }
  });

  assert.equal(next.complete, true);
  assert.equal(next.primaryAction.id, 'complete');
  assert.deepEqual(next.actions, []);
  assert.deepEqual(next.remainingRequirements, []);
});
