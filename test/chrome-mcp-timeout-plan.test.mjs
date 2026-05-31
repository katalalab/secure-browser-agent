import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildChromeMcpTimeoutPlan, buildChromeMcpTimeoutPlanStatus, formatChromeMcpTimeoutPlanCompact, formatChromeMcpTimeoutPlanMarkdown, formatChromeMcpTimeoutPlanStatusCompact } from '../src/chrome-mcp-timeout-plan.mjs';

function status(overrides = {}) {
  return {
    observedSource: 'unit',
    observed: {
      chromeDevtoolsMcpConnected: true,
      chromeDevtoolsMcpTools: 29,
      chromeDevtoolsMcpPageListOk: false,
      chromeDevtoolsMcpPageCount: null,
      chromeDevtoolsMcpListPagesTimedOut: true,
      chromeDevtoolsMcpLastError: 'Network.enable timed out'
    },
    processes: {
      peekabooServers: 7,
      chromeDevtoolsMcpServers: 9,
      chromeDevtoolsMcpBrowserUrl9223Wrappers: 8
    },
    chrome: {
      regularProfiles: 1,
      regularRemoteDebugging: 0,
      devtools9223Ok: true
    },
    codexExtension: {
      prepared: true,
      backendReady: false
    },
    decision: {
      status: 'mcp-connected-page-list-timeout',
      regularChromeOpen: true
    },
    ...overrides
  };
}

test('chrome mcp timeout plan keeps timeout recovery read-only and operator gated', () => {
  const plan = buildChromeMcpTimeoutPlan({
    generatedAt: '2026-05-29T00:00:00.000Z',
    chromeMcpStatus: status(),
    runtimeCleanupPlan: {
      summary: {
        ownerSessionCount: 3,
        listedOwnerSessions: 2
      },
      ownerSessions: [
        {
          ownerPid: 100,
          ownerCommand: 'codex',
          current: true,
          childCount: 4,
          groups: {
            chromeDevtoolsMcp: 2,
            peekaboo: 2
          },
          inspectCommand: 'ps -p 100 -o pid,ppid,etime,stat,command'
        },
        {
          ownerPid: 200,
          ownerCommand: 'Codex.app',
          current: false,
          childCount: 20,
          groups: {
            chromeDevtoolsMcp: 8,
            peekaboo: 6
          },
          inspectCommand: 'ps -p 200 -o pid,ppid,etime,stat,command',
          inspectChildrenCommand: "pgrep -P 200 -fl 'chrome-devtools-mcp|peekaboo|mcp'",
          cleanupImpact: 'high',
          expectedReduction: {
            chromeDevtoolsMcp: 8,
            peekaboo: 6,
            totalBrowserMcp: 14
          }
        }
      ]
    }
  });

  assert.equal(plan.safeMode, true);
  assert.equal(plan.destructiveActionsIncluded, false);
  assert.equal(plan.secretValuesRead, false);
  assert.equal(plan.opensBrowserNow, false);
  assert.equal(plan.pageOutputTrusted, false);
  assert.equal(plan.status.pageListTimeout, true);
  assert.equal(plan.nextAction, 'use-gated-extension-resume-or-clean-stale-mcp');
  assert.equal(plan.guidance.preferExtensionResume, true);
  assert.equal(plan.guidance.cleanupIsManual, true);
  assert.equal(plan.guidance.doNotKillProcessesAutomatically, true);
  assert.equal(plan.guidance.doNotUseDefaultProfileCdp, true);
  assert.ok(plan.findings.some((finding) => finding.id === 'page-list-timeout'));
  assert.ok(plan.findings.some((finding) => finding.id === 'duplicate-mcp-servers'));
  assert.equal(plan.cleanup.currentOwnerPid, 100);
  assert.equal(plan.cleanup.reviewOwners[0].ownerPid, 200);
  assert.equal(plan.cleanup.reviewOwners[0].chromeDevtoolsMcp, 8);
  assert.equal(plan.cleanup.reviewOwners[0].inspectChildrenCommand, "pgrep -P 200 -fl 'chrome-devtools-mcp|peekaboo|mcp'");
  assert.equal(plan.cleanup.reviewOwners[0].cleanupImpact, 'high');
  assert.match(plan.commands.chromeExtensionResumeApproval.shell, /--operator-ok' 'OK/);

  const compact = formatChromeMcpTimeoutPlanCompact(plan);
  assert.match(compact, /^page_list_timeout: yes$/m);
  assert.match(compact, /^prefer_extension_resume: yes$/m);
  assert.match(compact, /^do_not_use_default_profile_cdp: yes$/m);
  assert.match(compact, /^cleanup_review_owner_pids: 200$/m);
  assert.match(compact, /^cleanup_review_top: 200:children=20,chromeMcp=8,peekaboo=6$/m);
  assert.match(compact, /^cleanup_review_inspect: 200='ps -p 200 -o pid,ppid,etime,stat,command'$/m);
  assert.match(compact, /^cleanup_review_children: 200='pgrep -P 200 -fl '\\''chrome-devtools-mcp\|peekaboo\|mcp'\\'''$/m);
  assert.match(compact, /^cleanup_review_impact: 200:high,chromeMcp=8,peekaboo=6$/m);
  assert.match(compact, /^findings: page-list-timeout,duplicate-mcp-servers,regular-chrome-not-debuggable,codex-browser-agent-9223,owner-session-review$/m);
  assert.match(compact, /^runtime_cleanup_plan_command: 'node' 'src\/cli\.mjs' 'runtime-cleanup-plan'/m);

  const markdown = formatChromeMcpTimeoutPlanMarkdown(plan);
  assert.match(markdown, /Chrome MCP Timeout Plan/);
  assert.match(markdown, /page-list-timeout/);
});

test('chrome mcp timeout plan reports usable MCP when page listing is proved', () => {
  const plan = buildChromeMcpTimeoutPlan({
    chromeMcpStatus: status({
      observed: {
        chromeDevtoolsMcpConnected: true,
        chromeDevtoolsMcpTools: 29,
        chromeDevtoolsMcpPageListOk: true,
        chromeDevtoolsMcpPageCount: 2,
        chromeDevtoolsMcpListPagesTimedOut: false,
        chromeDevtoolsMcpLastError: ''
      },
      decision: {
        status: 'usable-for-operator-requested-tabs',
        regularChromeOpen: true
      }
    }),
    runtimeCleanupPlan: {
      summary: {
        ownerSessionCount: 1
      }
    }
  });

  assert.equal(plan.status.pageListOk, true);
  assert.equal(plan.status.pageListTimeout, false);
  assert.equal(plan.nextAction, 'use-regular-chrome-mcp');
  assert.equal(plan.guidance.useEverydayChromeNow, true);

  const compact = formatChromeMcpTimeoutPlanCompact(plan);
  assert.match(compact, /^use_everyday_chrome_now: yes$/m);
  assert.match(compact, /^page_list_ok: yes$/m);
});

test('chrome mcp timeout plan preserves background-tab opt-in in recovery commands', () => {
  const plan = buildChromeMcpTimeoutPlan({
    chromeMcpStatus: status(),
    runtimeCleanupPlan: {
      summary: {
        ownerSessionCount: 1
      }
    },
    allowNewBackgroundTab: 'yes',
    newBackgroundUrlEnv: 'REGULAR_CHROME_URL'
  });

  assert.match(plan.commands.regularChromeUse.shell, /'--allow-new-background-tab' 'yes'/);
  assert.match(plan.commands.regularChromeUse.shell, /'--new-background-url-env' 'REGULAR_CHROME_URL'/);
  assert.match(formatChromeMcpTimeoutPlanCompact(plan), /^regular_chrome_use_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
});

test('chrome mcp timeout plan can persist a low-token recovery handoff under runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-mcp-timeout-plan-'));
  try {
    const plan = buildChromeMcpTimeoutPlan({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      chromeMcpStatus: status(),
      runtimeCleanupPlan: {
        summary: {
          ownerSessionCount: 1,
          listedOwnerSessions: 0
        },
        ownerSessions: []
      },
      write: true
    });

    assert.equal(plan.outputPath, path.join(rootDir, 'runs/operator/chrome-mcp-timeout-plan-latest.json'));
    assert.equal(fs.existsSync(plan.outputPath), true);
    const saved = JSON.parse(fs.readFileSync(plan.outputPath, 'utf8'));
    assert.equal(saved.safeMode, true);
    assert.equal(saved.secretValuesRead, false);
    assert.equal(saved.opensBrowserNow, false);
    assert.equal(saved.status.pageListTimeout, true);
    assert.equal(saved.guidance.doNotUseDefaultProfileCdp, true);
    assert.match(formatChromeMcpTimeoutPlanCompact(plan), /^output: .*chrome-mcp-timeout-plan-latest\.json$/m);

    assert.throws(() => buildChromeMcpTimeoutPlan({
      rootDir,
      chromeMcpStatus: status(),
      runtimeCleanupPlan: {
        summary: {},
        ownerSessions: []
      },
      write: true,
      out: '../outside.json'
    }), /invalid Chrome MCP timeout plan output path/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('chrome mcp timeout plan status summarizes saved timeout recovery without rescanning', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-mcp-timeout-plan-status-'));
  try {
    buildChromeMcpTimeoutPlan({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      chromeMcpStatus: status(),
      runtimeCleanupPlan: {
        summary: {
          ownerSessionCount: 2,
          listedOwnerSessions: 1
        },
        ownerSessions: [
          {
            ownerPid: 300,
            current: false,
            childCount: 10,
            groups: {
              chromeDevtoolsMcp: 4,
              peekaboo: 3
            }
          }
        ]
      },
      write: true
    });

    const saved = buildChromeMcpTimeoutPlanStatus({
      rootDir,
      generatedAt: '2026-05-30T00:05:00.000Z',
      staleAfterSeconds: 900
    });

    assert.equal(saved.statusOnly, true);
    assert.equal(saved.exists, true);
    assert.equal(saved.parseOk, true);
    assert.equal(saved.stale, false);
    assert.equal(saved.ageSeconds, 300);
    assert.equal(saved.status, 'mcp-connected-page-list-timeout');
    assert.equal(saved.pageListTimeout, true);
    assert.equal(saved.useEverydayChromeNow, false);
    assert.equal(saved.preferExtensionResume, true);
    assert.equal(saved.agentSafeNextCommandId, 'none');
    assert.equal(saved.agentSafeNextMayRunUnattended, false);
    assert.equal(saved.commands.status.shell, "'node' 'src/cli.mjs' 'chrome-mcp-timeout-plan-status' '--in' 'operator/chrome-mcp-timeout-plan-latest.json' '--format' 'compact'");
    assert.equal(saved.commands.refresh.shell, "'node' 'src/cli.mjs' 'chrome-mcp-timeout-plan' '--write' '--out' 'operator/chrome-mcp-timeout-plan-latest.json' '--format' 'compact'");
    assert.equal(saved.cleanup.ownerSessionCount, 2);
    assert.deepEqual(saved.cleanup.reviewOwnerPids, [300]);
    assert.equal(saved.commands.regularChromeUse.args.includes('regular-chrome-use'), true);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^status: mcp-connected-page-list-timeout$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^agent_safe_next_command_id: none$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^agent_safe_next_may_run_unattended: no$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^refresh_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan' '--write' '--out' 'operator\/chrome-mcp-timeout-plan-latest\.json' '--format' 'compact'$/m);

    const stale = buildChromeMcpTimeoutPlanStatus({
      rootDir,
      generatedAt: '2026-05-30T00:16:00.000Z',
      staleAfterSeconds: 900
    });
    assert.equal(stale.status, 'stale');
    assert.equal(stale.nextAction, 'refresh-chrome-mcp-timeout-plan');
    assert.equal(stale.agentSafeNextCommandId, 'chrome-mcp-timeout-plan-refresh');
    assert.equal(stale.agentSafeNextMayRunUnattended, true);
    assert.equal(stale.agentSafeNextOpensBrowser, false);
    assert.equal(stale.agentSafeNextStartsCapture, false);
    assert.equal(stale.agentSafeNextReadsBrowserStorage, false);
    assert.equal(stale.agentSafeNextReturnsPageContent, false);
    assert.equal(stale.agentSafeNextCommand.shell, "'node' 'src/cli.mjs' 'chrome-mcp-timeout-plan' '--write' '--out' 'operator/chrome-mcp-timeout-plan-latest.json' '--format' 'compact'");
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(stale), /^agent_safe_next_command_id: chrome-mcp-timeout-plan-refresh$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(stale), /^agent_safe_next_may_run_unattended: yes$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(stale), /^agent_safe_next_opens_browser: no$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(stale), /^agent_safe_next_starts_capture: no$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(stale), /^agent_safe_next_reads_browser_storage: no$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(stale), /^agent_safe_next_returns_page_content: no$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(stale), /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan' '--write' '--out' 'operator\/chrome-mcp-timeout-plan-latest\.json' '--format' 'compact'$/m);

    assert.throws(() => buildChromeMcpTimeoutPlanStatus({
      rootDir,
      in: '../outside.json'
    }), /invalid Chrome MCP timeout plan output path/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('chrome mcp timeout plan status exposes safe refresh for missing custom paths', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-mcp-timeout-plan-status-missing-'));
  try {
    const missing = buildChromeMcpTimeoutPlanStatus({
      rootDir,
      in: 'operator/custom-timeout-plan.json'
    });

    assert.equal(missing.exists, false);
    assert.equal(missing.status, 'missing');
    assert.equal(missing.agentSafeNextCommandId, 'chrome-mcp-timeout-plan-refresh');
    assert.equal(missing.agentSafeNextMayRunUnattended, true);
    assert.equal(missing.agentSafeNextOpensBrowser, false);
    assert.equal(missing.agentSafeNextStartsCapture, false);
    assert.equal(missing.agentSafeNextReadsBrowserStorage, false);
    assert.equal(missing.agentSafeNextReturnsPageContent, false);
    assert.equal(missing.commands.status.shell, "'node' 'src/cli.mjs' 'chrome-mcp-timeout-plan-status' '--in' 'operator/custom-timeout-plan.json' '--format' 'compact'");
    assert.equal(missing.commands.refresh.shell, "'node' 'src/cli.mjs' 'chrome-mcp-timeout-plan' '--write' '--out' 'operator/custom-timeout-plan.json' '--format' 'compact'");
    assert.equal(missing.agentSafeNextCommand.shell, missing.commands.refresh.shell);

    const compact = formatChromeMcpTimeoutPlanStatusCompact(missing);
    assert.match(compact, /^status: missing$/m);
    assert.match(compact, /^agent_safe_next_command_id: chrome-mcp-timeout-plan-refresh$/m);
    assert.match(compact, /^agent_safe_next_may_run_unattended: yes$/m);
    assert.match(compact, /^agent_safe_next_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan' '--write' '--out' 'operator\/custom-timeout-plan\.json' '--format' 'compact'$/m);
    assert.match(compact, /^status_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan-status' '--in' 'operator\/custom-timeout-plan\.json' '--format' 'compact'$/m);
    assert.match(compact, /^refresh_command: 'node' 'src\/cli\.mjs' 'chrome-mcp-timeout-plan' '--write' '--out' 'operator\/custom-timeout-plan\.json' '--format' 'compact'$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('chrome mcp timeout plan status preserves background-tab opt-in in regenerated commands', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-chrome-mcp-timeout-plan-status-bg-'));
  try {
    buildChromeMcpTimeoutPlan({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      chromeMcpStatus: status(),
      runtimeCleanupPlan: {
        summary: {
          ownerSessionCount: 1
        },
        ownerSessions: []
      },
      write: true
    });

    const saved = buildChromeMcpTimeoutPlanStatus({
      rootDir,
      generatedAt: '2026-05-30T00:01:00.000Z',
      allowNewBackgroundTab: 'yes',
      newBackgroundUrlEnv: 'REGULAR_CHROME_URL'
    });

    assert.equal(saved.newBackgroundTabsAllowed, true);
    assert.equal(saved.newBackgroundTabOption, 'yes');
    assert.equal(saved.newBackgroundUrlEnv, 'REGULAR_CHROME_URL');
    assert.equal(saved.newBackgroundUrlValueRead, false);
    assert.match(saved.commands.status.shell, /'--allow-new-background-tab' 'yes'/);
    assert.match(saved.commands.status.shell, /'--in' 'operator\/chrome-mcp-timeout-plan-latest\.json'/);
    assert.match(saved.commands.status.shell, /'--new-background-url-env' 'REGULAR_CHROME_URL'/);
    assert.match(saved.commands.refresh.shell, /'--out' 'operator\/chrome-mcp-timeout-plan-latest\.json'/);
    assert.match(saved.commands.refresh.shell, /'--allow-new-background-tab' 'yes'/);
    assert.match(saved.commands.refresh.shell, /'--new-background-url-env' 'REGULAR_CHROME_URL'/);
    assert.match(saved.commands.regularChromeUse.shell, /'--allow-new-background-tab' 'yes'/);
    assert.match(saved.commands.regularChromeUse.shell, /'--new-background-url-env' 'REGULAR_CHROME_URL'/);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^status_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^refresh_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^regular_chrome_use_command: .*'--allow-new-background-tab' 'yes'.*'--new-background-url-env' 'REGULAR_CHROME_URL'/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^new_background_tabs_allowed: yes$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^new_background_url_env: REGULAR_CHROME_URL$/m);
    assert.match(formatChromeMcpTimeoutPlanStatusCompact(saved), /^new_background_url_value_read: no$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
