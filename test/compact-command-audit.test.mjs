import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildCompactCommandAudit, COMPACT_COMMAND_AUDIT_SOURCES, formatCompactCommandAuditCompact } from '../src/compact-command-audit.mjs';

test('compact command audit CLI help derives source list from implementation constant', () => {
  const result = spawnSync(process.execPath, ['src/cli.mjs', 'help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 30000
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`compact-command-audit \\[--source ${COMPACT_COMMAND_AUDIT_SOURCES.join('\\|')}\\|all\\]`)
  );
});

test('compact command audit treats primary command flags as coverage for top-level command', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    compactText: [
      'primary_command_opens_browser: yes',
      'primary_command_starts_capture: yes',
      'primary_command_requires_operator_approval: yes',
      "command: 'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth' '--format' 'compact'"
    ].join('\n')
  });

  assert.equal(audit.commandCount, 1);
  assert.equal(audit.riskyCommandCount, 1);
  assert.equal(audit.unclassifiedRiskCount, 0);
  assert.equal(audit.missingApprovalCount, 0);
  assert.equal(audit.complete, true);
  assert.equal(audit.safeForStrictAgentLoops, true);
});

test('compact command audit reports risky command lines without adjacent safety flags', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    compactText: [
      "unsafe_resume_command: 'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth' '--format' 'compact'"
    ].join('\n')
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.commandCount, 1);
  assert.equal(audit.riskyCommandCount, 1);
  assert.equal(audit.unclassifiedRiskCount, 1);
  assert.equal(audit.missingApprovalCount, 1);
  assert.equal(audit.complete, false);
  assert.equal(audit.safeForStrictAgentLoops, false);
  assert.match(compact, /^unclassified_risk_count: 1$/m);
  assert.match(compact, /^missing_approval_count: 1$/m);
  assert.match(compact, /^unclassified_risk_unsafe_resume_command: opens_browser=yes starts_capture=yes starts_background=no mutates_runtime=no$/m);
});

test('compact command audit reports stale handoff port capture command conflicts', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    compactText: [
      'agent_safe_command_blocked_reason: handoff-auth-check-port-unreachable',
      'auth_watch_blocked_reason: handoff-auth-check-port-unreachable',
      'background_proof_capture_blocked_reason: handoff-auth-check-port-unreachable',
      "auth_watch_command: 'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'",
      "background_proof_no_open_wait_capture_command: 'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--wait-auth' '--format' 'compact'",
      "background_proof_no_open_wait_capture_background_command: mkdir -p 'runs/operator' && nohup 'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--wait-auth' '--format' 'compact' > 'runs/operator/background-proof-capture.log' 2>&1 & echo $! > 'runs/operator/background-proof-capture.pid'"
    ].join('\n')
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.commandCount, 3);
  assert.equal(audit.staleHandoffConflictCount, 3);
  assert.equal(audit.complete, false);
  assert.equal(audit.safeForStrictAgentLoops, false);
  assert.match(compact, /^stale_handoff_conflict_count: 3$/m);
  assert.match(compact, /^stale_handoff_conflict_auth_watch_command: blocked_reason=handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^stale_handoff_conflict_background_proof_no_open_wait_capture_command: blocked_reason=handoff-auth-check-port-unreachable$/m);
  assert.match(compact, /^stale_handoff_conflict_background_proof_no_open_wait_capture_background_command: blocked_reason=handoff-auth-check-port-unreachable$/m);
});

test('compact command audit supports control-status compact source', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    source: 'control-status',
    compactText: [
      'agent_loop_can_run_without_approval: no',
      'objective_safe_proof_capture_allowed_now: no',
      "target_approval_resume_run_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
    ].join('\n')
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.source, 'control-status');
  assert.equal(audit.commandCount, 1);
  assert.equal(audit.riskyCommandCount, 1);
  assert.equal(audit.opensBrowserCommandCount, 1);
  assert.equal(audit.startsCaptureCommandCount, 1);
  assert.equal(audit.unclassifiedRiskCount, 0);
  assert.equal(audit.missingApprovalCount, 0);
  assert.equal(audit.complete, true);
  assert.equal(audit.safeForStrictAgentLoops, true);
  assert.match(compact, /^source: control-status$/m);
});

test('compact command audit supports run-gate-audit compact source with hyphenated surface keys', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    source: 'run-gate-audit',
    compactText: [
      'surface_target-login-capture_agent_may_run_unattended: no',
      'surface_target-login-capture_operator_ok_required: no',
      'surface_target-login-capture_may_open_browser: yes',
      'surface_target-login-capture_may_start_capture: yes',
      'surface_target-login-capture_command: target-login-capture',
      'surface_agent-proof-step-start_agent_may_run_unattended: no',
      'surface_agent-proof-step-start_operator_ok_required: yes',
      'surface_agent-proof-step-start_may_open_browser: no',
      'surface_agent-proof-step-start_may_start_capture: yes',
      'surface_agent-proof-step-start_may_start_background: yes',
      'surface_agent-proof-step-start_command: agent-proof-step-start --run --operator-ok OK'
    ].join('\n')
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.source, 'run-gate-audit');
  assert.equal(audit.commandCount, 2);
  assert.equal(audit.riskyCommandCount, 2);
  assert.equal(audit.opensBrowserCommandCount, 1);
  assert.equal(audit.startsCaptureCommandCount, 2);
  assert.equal(audit.startsBackgroundCommandCount, 1);
  assert.equal(audit.unclassifiedRiskCount, 0);
  assert.equal(audit.missingApprovalCount, 0);
  assert.equal(audit.complete, true);
  assert.equal(audit.safeForStrictAgentLoops, true);
  assert.match(compact, /^source: run-gate-audit$/m);
});

test('compact command audit supports objective-safe-command compact source', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    source: 'objective-safe-command',
    compactText: [
      'agent_safe_command_monitor_only: no',
      'agent_safe_command_may_open_browser: no',
      'agent_safe_command_starts_capture: no',
      'background_proof_capture_blocked_reason: handoff-auth-check-port-unreachable',
      "target_approval_resume_run_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'",
      "handoff_resume_watch_plan_command: 'node' 'src/cli.mjs' 'target-handoff-resume-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'"
    ].join('\n')
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.source, 'objective-safe-command');
  assert.equal(audit.commandCount, 2);
  assert.equal(audit.riskyCommandCount, 1);
  assert.equal(audit.opensBrowserCommandCount, 1);
  assert.equal(audit.startsCaptureCommandCount, 1);
  assert.equal(audit.unclassifiedRiskCount, 0);
  assert.equal(audit.missingApprovalCount, 0);
  assert.equal(audit.staleHandoffConflictCount, 0);
  assert.equal(audit.complete, true);
  assert.equal(audit.safeForStrictAgentLoops, true);
  assert.match(compact, /^source: objective-safe-command$/m);
});

test('compact command audit supports agent-control-plane compact source', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    source: 'agent-control-plane',
    compactText: [
      'agent_next_operator_approval_opens_browser: yes',
      'agent_next_operator_approval_starts_capture: yes',
      'agent_next_operator_approval_agent_may_run_unattended: no',
      'target_approval_resume_planned_opens_browser: yes',
      'target_approval_resume_planned_starts_capture: yes',
      "agent_next_preflight_command: 'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'",
      "agent_next_proof_plan_command: 'node' 'src/cli.mjs' 'target-proof-plan' 'runs/target-packs/github' '--real-external' '--format' 'compact'",
      "agent_next_operator_approval_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
    ].join('\n')
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.source, 'agent-control-plane');
  assert.equal(audit.commandCount, 3);
  assert.equal(audit.riskyCommandCount, 1);
  assert.equal(audit.opensBrowserCommandCount, 1);
  assert.equal(audit.startsCaptureCommandCount, 1);
  assert.equal(audit.unclassifiedRiskCount, 0);
  assert.equal(audit.missingApprovalCount, 0);
  assert.equal(audit.complete, true);
  assert.equal(audit.safeForStrictAgentLoops, true);
  assert.match(compact, /^source: agent-control-plane$/m);
});

test('compact command audit supports workflow selector compact sources', async () => {
  for (const source of ['agent-workflow', 'agent-backend-select']) {
    const audit = await buildCompactCommandAudit({
      generatedAt: '2026-05-31T00:00:00.000Z',
      source,
      compactText: [
        'recommended_requires_operator_approval: no',
        'recommended_agent_may_run_unattended: yes',
        'recommended_opens_browser: no',
        'recommended_starts_capture: no',
        'recommended_reads_browser_storage: no',
        'recommended_returns_page_content: no',
        "recommended_command: 'node' 'src/cli.mjs' 'regular-chrome-use' '--intent' 'inspect' '--format' 'compact'",
        "regular_chrome_status_command: 'node' 'src/cli.mjs' 'regular-chrome-status' '--format' 'compact'"
      ].join('\n')
    });
    const compact = formatCompactCommandAuditCompact(audit);

    assert.equal(audit.source, source);
    assert.equal(audit.commandCount, 2);
    assert.equal(audit.riskyCommandCount, 0);
    assert.equal(audit.unclassifiedRiskCount, 0);
    assert.equal(audit.missingApprovalCount, 0);
    assert.equal(audit.complete, true);
    assert.equal(audit.safeForStrictAgentLoops, true);
    assert.match(compact, new RegExp(`^source: ${source}$`, 'm'));
  }
});

test('compact command audit supports agent-task compact source', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    source: 'agent-task',
    compactText: [
      'route_operator_approval_required: yes',
      'agent_unattended_allowed: no',
      'selected_command_unattended_allowed: no',
      'blocked_reason: opens-browser-or-needs-approval-browser-open',
      "command: 'node' 'src/cli.mjs' 'regular-chrome-use' '--intent' 'inspect' '--mcp-observation-in' 'operator/chrome-mcp-observation-latest.json' '--format' 'compact'",
      "write_command: 'node' 'src/cli.mjs' 'agent-task' '--write' '--out' 'operator/agent-task-latest.json' '--task' 'existing-tab' '--format' 'compact' '--provider' 'duckduckgo' '--mcp-observation-in' 'operator/chrome-mcp-observation-latest.json'",
      "run_command: 'node' 'src/cli.mjs' 'agent-task' '--run' '--write' '--out' 'operator/agent-task-latest.json' '--task' 'existing-tab' '--timeout-ms' '120000' '--format' 'compact' '--provider' 'duckduckgo' '--mcp-observation-in' 'operator/chrome-mcp-observation-latest.json'"
    ].join('\n')
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.source, 'agent-task');
  assert.equal(audit.commandCount, 3);
  assert.equal(audit.riskyCommandCount, 0);
  assert.equal(audit.unclassifiedRiskCount, 0);
  assert.equal(audit.missingApprovalCount, 0);
  assert.equal(audit.complete, true);
  assert.equal(audit.safeForStrictAgentLoops, true);
  assert.match(compact, /^source: agent-task$/m);
});

test('compact command audit supports Chrome MCP autostart runtime mutation source', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    source: 'chrome-mcp-autostart-plan',
    compactText: [
      'install_mutates_runtime: yes',
      'install_requires_operator_approval: yes',
      'install_agent_may_run_unattended: no',
      'load_starts_background: yes',
      'load_mutates_runtime: yes',
      'load_requires_operator_approval: yes',
      'load_agent_may_run_unattended: no',
      'unload_mutates_runtime: yes',
      'unload_requires_operator_approval: yes',
      'unload_agent_may_run_unattended: no',
      'remove_mutates_runtime: yes',
      'remove_requires_operator_approval: yes',
      'remove_agent_may_run_unattended: no',
      "write_command: 'node' 'src/cli.mjs' 'chrome-mcp-autostart-plan' '--write' '--out' 'operator/chrome-mcp-autostart-plan-latest.json' '--format' 'compact'",
      "install_command: 'cp' 'runs/operator/launchd/local.secure-browser-agent.chrome-devtools-mcp.plist' '/Users/test/Library/LaunchAgents/local.secure-browser-agent.chrome-devtools-mcp.plist'",
      "load_command: 'launchctl' 'bootstrap' 'gui/501' '/Users/test/Library/LaunchAgents/local.secure-browser-agent.chrome-devtools-mcp.plist'",
      "unload_command: 'launchctl' 'bootout' 'gui/501/local.secure-browser-agent.chrome-devtools-mcp'",
      "status_command: 'launchctl' 'print' 'gui/501/local.secure-browser-agent.chrome-devtools-mcp'",
      "remove_command: 'rm' '-f' '/Users/test/Library/LaunchAgents/local.secure-browser-agent.chrome-devtools-mcp.plist'"
    ].join('\n')
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.source, 'chrome-mcp-autostart-plan');
  assert.equal(audit.commandCount, 6);
  assert.equal(audit.riskyCommandCount, 4);
  assert.equal(audit.startsBackgroundCommandCount, 1);
  assert.equal(audit.mutatesRuntimeCommandCount, 4);
  assert.equal(audit.unclassifiedRiskCount, 0);
  assert.equal(audit.missingApprovalCount, 0);
  assert.equal(audit.complete, true);
  assert.equal(audit.safeForStrictAgentLoops, true);
  assert.match(compact, /^source: chrome-mcp-autostart-plan$/m);
  assert.match(compact, /^mutates_runtime_command_count: 4$/m);
});

test('compact command audit supports final proof compact sources', async () => {
  for (const source of ['completion-proof-bundle', 'agent-proof-checklist', 'agent-proof-closeout']) {
    const audit = await buildCompactCommandAudit({
      generatedAt: '2026-05-31T00:00:00.000Z',
      source,
      compactText: [
        'operator_resume_requires_operator_approval: yes',
        'operator_resume_opens_browser: yes',
        'operator_resume_starts_capture: yes',
        'operator_resume_agent_may_run_unattended: no',
        "completion_proof_bundle_command: 'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'",
        "operator_resume_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      ].join('\n')
    });
    const compact = formatCompactCommandAuditCompact(audit);

    assert.equal(audit.source, source);
    assert.equal(audit.commandCount, 2);
    assert.equal(audit.riskyCommandCount, 1);
    assert.equal(audit.opensBrowserCommandCount, 1);
    assert.equal(audit.startsCaptureCommandCount, 1);
    assert.equal(audit.unclassifiedRiskCount, 0);
    assert.equal(audit.missingApprovalCount, 0);
    assert.equal(audit.complete, true);
    assert.equal(audit.safeForStrictAgentLoops, true);
    assert.match(compact, new RegExp(`^source: ${source}$`, 'm'));
  }
});

test('compact command audit can combine every compact source for one strict gate', async () => {
  const audit = await buildCompactCommandAudit({
    generatedAt: '2026-05-31T00:00:00.000Z',
    source: 'all',
    compactTexts: {
      'operator-pack': [
        'primary_command_opens_browser: yes',
        'primary_command_starts_capture: yes',
        'primary_command_requires_operator_approval: yes',
        "command: 'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth' '--format' 'compact'"
      ].join('\n'),
      'control-status': [
        'agent_safe_command_monitor_only: yes',
        'agent_safe_command_may_open_browser: no',
        'agent_safe_command_starts_capture: no',
        "agent_safe_command: 'node' 'src/cli.mjs' 'target-auth-watch' 'runs/target-packs/github' '--format' 'compact'"
      ].join('\n'),
      'objective-completion-audit': [
        'next_command_opens_browser: yes',
        'next_command_starts_capture: yes',
        'next_command_requires_operator_approval: yes',
        "strict_command: 'node' 'src/cli.mjs' 'objective-completion-audit' '--strict' '--format' 'compact'",
        "next_operator_approval_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      ].join('\n'),
      'objective-safe-command': [
        'background_proof_capture_blocked_reason: handoff-auth-check-port-unreachable',
        "target_approval_resume_run_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'",
        "handoff_resume_watch_plan_command: 'node' 'src/cli.mjs' 'target-handoff-resume-watch' 'runs/target-packs/github' '--handoff' 'operator-handoff.json' '--format' 'compact'"
      ].join('\n'),
      'run-gate-audit': [
        'surface_agent-proof-step-start_agent_may_run_unattended: no',
        'surface_agent-proof-step-start_operator_ok_required: yes',
        'surface_agent-proof-step-start_may_open_browser: no',
        'surface_agent-proof-step-start_may_start_capture: yes',
        'surface_agent-proof-step-start_may_start_background: yes',
        'surface_agent-proof-step-start_command: agent-proof-step-start --run --operator-ok OK'
      ].join('\n'),
      'agent-control-plane': [
        'agent_next_operator_approval_opens_browser: yes',
        'agent_next_operator_approval_starts_capture: yes',
        'agent_next_operator_approval_agent_may_run_unattended: no',
        "agent_next_preflight_command: 'node' 'src/cli.mjs' 'target-approval-preflight' '--candidate' 'github' '--real-external' '--format' 'compact'",
        "agent_next_operator_approval_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      ].join('\n'),
      'agent-workflow': [
        'recommended_requires_operator_approval: no',
        'recommended_agent_may_run_unattended: yes',
        'recommended_opens_browser: no',
        'recommended_starts_capture: no',
        "recommended_command: 'node' 'src/cli.mjs' 'regular-chrome-use' '--intent' 'inspect' '--format' 'compact'",
        "regular_chrome_status_command: 'node' 'src/cli.mjs' 'regular-chrome-status' '--format' 'compact'"
      ].join('\n'),
      'agent-backend-select': [
        'recommended_requires_operator_approval: no',
        'recommended_agent_may_run_unattended: yes',
        'recommended_opens_browser: no',
        'recommended_starts_capture: no',
        "selected_direct_command: 'node' 'src/cli.mjs' 'regular-chrome-use' '--intent' 'inspect' '--format' 'compact'",
        "agent_task_safe_run_command: 'node' 'src/cli.mjs' 'agent-task' '--run' '--task' 'existing-tab' '--format' 'compact'"
      ].join('\n'),
      'agent-task': [
        'route_operator_approval_required: yes',
        'agent_unattended_allowed: no',
        'selected_command_unattended_allowed: no',
        'blocked_reason: opens-browser-or-needs-approval-browser-open',
        "command: 'node' 'src/cli.mjs' 'regular-chrome-use' '--intent' 'inspect' '--format' 'compact'",
        "write_command: 'node' 'src/cli.mjs' 'agent-task' '--write' '--out' 'operator/agent-task-latest.json' '--task' 'existing-tab' '--format' 'compact'",
        "run_command: 'node' 'src/cli.mjs' 'agent-task' '--run' '--write' '--out' 'operator/agent-task-latest.json' '--task' 'existing-tab' '--format' 'compact'"
      ].join('\n'),
      'chrome-mcp-autostart-plan': [
        'install_mutates_runtime: yes',
        'install_requires_operator_approval: yes',
        'install_agent_may_run_unattended: no',
        'load_starts_background: yes',
        'load_mutates_runtime: yes',
        'load_requires_operator_approval: yes',
        'load_agent_may_run_unattended: no',
        'unload_mutates_runtime: yes',
        'unload_requires_operator_approval: yes',
        'unload_agent_may_run_unattended: no',
        'remove_mutates_runtime: yes',
        'remove_requires_operator_approval: yes',
        'remove_agent_may_run_unattended: no',
        "write_command: 'node' 'src/cli.mjs' 'chrome-mcp-autostart-plan' '--write' '--out' 'operator/chrome-mcp-autostart-plan-latest.json' '--format' 'compact'",
        "install_command: 'cp' 'runs/operator/launchd/local.secure-browser-agent.chrome-devtools-mcp.plist' '/Users/test/Library/LaunchAgents/local.secure-browser-agent.chrome-devtools-mcp.plist'",
        "load_command: 'launchctl' 'bootstrap' 'gui/501' '/Users/test/Library/LaunchAgents/local.secure-browser-agent.chrome-devtools-mcp.plist'",
        "unload_command: 'launchctl' 'bootout' 'gui/501/local.secure-browser-agent.chrome-devtools-mcp'",
        "status_command: 'launchctl' 'print' 'gui/501/local.secure-browser-agent.chrome-devtools-mcp'",
        "remove_command: 'rm' '-f' '/Users/test/Library/LaunchAgents/local.secure-browser-agent.chrome-devtools-mcp.plist'"
      ].join('\n'),
      'completion-proof-bundle': [
        'operator_resume_requires_operator_approval: yes',
        'operator_resume_opens_browser: yes',
        'operator_resume_starts_capture: yes',
        'operator_resume_agent_may_run_unattended: no',
        "completion_proof_bundle_command: 'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'",
        "operator_resume_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      ].join('\n'),
      'agent-proof-checklist': [
        'operator_command_opens_browser: yes',
        'operator_command_starts_capture: yes',
        'agent_must_not_run_operator_resume_unattended: yes',
        "completion_proof_bundle_command: 'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'",
        "operator_resume_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      ].join('\n'),
      'agent-proof-closeout': [
        'operator_resume_requires_operator_approval: yes',
        'operator_resume_opens_browser: yes',
        'operator_resume_starts_capture: yes',
        'operator_resume_agent_may_run_unattended: no',
        "completion_proof_bundle_command: 'node' 'src/cli.mjs' 'completion-proof-bundle' '--candidate' 'github' '--include-compact-command-audit' '--format' 'compact'",
        "operator_resume_command: 'node' 'src/cli.mjs' 'target-approval-resume' '--candidate' 'github' '--real-external' '--run' '--operator-ok' 'OK' '--format' 'compact'"
      ].join('\n'),
      'operator-runbook': [
        'primary_command_opens_browser: yes',
        'primary_command_starts_capture: yes',
        'primary_command_requires_operator_approval: yes',
        'primary_command_agent_may_run_unattended: no',
        "primary_command: 'node' 'src/cli.mjs' 'target-handoff-resume' 'runs/target-packs/github' '--run' '--open-login' '--wait-auth' '--format' 'compact'"
      ].join('\n')
    }
  });
  const compact = formatCompactCommandAuditCompact(audit);

  assert.equal(audit.source, 'all');
  assert.equal(audit.sources.length, COMPACT_COMMAND_AUDIT_SOURCES.length);
  assert.equal(audit.commandCount, 29);
  assert.equal(audit.riskyCommandCount, 13);
  assert.equal(audit.mutatesRuntimeCommandCount, 4);
  assert.equal(audit.unclassifiedRiskCount, 0);
  assert.equal(audit.missingApprovalCount, 0);
  assert.equal(audit.complete, true);
  assert.equal(audit.safeForStrictAgentLoops, true);
  assert.match(compact, /^source: all$/m);
  assert.match(compact, /^source_operator-pack_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_control-status_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_objective-completion-audit_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_objective-safe-command_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_run-gate-audit_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_agent-control-plane_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_agent-workflow_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_agent-backend-select_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_agent-task_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_chrome-mcp-autostart-plan_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_completion-proof-bundle_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_agent-proof-checklist_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_agent-proof-closeout_safe_for_strict_agent_loops: yes$/m);
  assert.match(compact, /^source_operator-runbook_safe_for_strict_agent_loops: yes$/m);
});
