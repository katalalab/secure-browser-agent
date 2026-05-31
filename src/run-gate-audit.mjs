function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

const SURFACES = [
  {
    id: 'agent-loop-step',
    command: 'agent-loop-step --run',
    mcpTool: 'sba_agent_loop_step',
    category: 'agent-monitor',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: true,
    preferredAgentSurface: 'agent-loop-step --run',
    guard: 'allowlisted monitor-only target-auth-watch shape; saved agent-loop-step-status revalidates command target and hides stale run_command'
  },
  {
    id: 'agent-task-run',
    command: 'agent-task --run',
    mcpTool: 'sba_agent_task',
    category: 'agent-task',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: true,
    preferredAgentSurface: 'agent-task --run',
    guard: 'allowlisted non-destructive workflow commands plus auth preflight'
  },
  {
    id: 'agent-task-watch',
    command: 'agent-task-watch --run',
    mcpTool: 'sba_agent_task_watch',
    category: 'agent-monitor',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: true,
    preferredAgentSurface: 'agent-task-watch --run',
    guard: 'saved agent-task refresh/run or monitor-auth-preflight shape only'
  },
  {
    id: 'agent-task-loop',
    command: 'agent-task-loop --run',
    mcpTool: 'sba_agent_task_loop',
    category: 'agent-monitor',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: true,
    preferredAgentSurface: 'agent-task-loop --run',
    guard: 'bounded loop over agent-task-watch only'
  },
  {
    id: 'agent-control-plane-watch',
    command: 'agent-control-plane-watch --run',
    mcpTool: 'sba_agent_control_plane_watch',
    category: 'agent-refresh',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: true,
    preferredAgentSurface: 'agent-control-plane-watch --run',
    guard: 'refreshes runs-scoped control-plane JSON only'
  },
  {
    id: 'regular-chrome-watch',
    command: 'regular-chrome-watch --run',
    mcpTool: 'sba_regular_chrome_watch',
    category: 'agent-refresh',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: true,
    preferredAgentSurface: 'regular-chrome-watch --run',
    guard: 'refreshes saved regular Chrome decision without opening Chrome'
  },
  {
    id: 'proof-gate-watch',
    command: 'proof-gate-watch',
    mcpTool: 'sba_proof_gate_watch',
    category: 'agent-monitor',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: true,
    preferredAgentSurface: 'proof-gate-watch',
    guard: 'polls proof-gate-status only'
  },
  {
    id: 'target-auth-watch',
    command: 'target-auth-watch',
    mcpTool: 'sba_target_auth_watch',
    category: 'agent-monitor',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: true,
    preferredAgentSurface: 'target-auth-watch',
    guard: 'polls secret-free auth-check only'
  },
  {
    id: 'agent-task-watch-start',
    command: 'agent-task-watch-start --run --operator-ok OK',
    mcpTool: 'sba_agent_task_watch_start',
    category: 'operator-gated-background',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: true,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'agent-task-watch-start --run --operator-ok OK',
    guard: 'exact operator-ok plus duplicate pid check'
  },
  {
    id: 'agent-proof-step',
    command: 'agent-proof-step --run --operator-ok OK',
    mcpTool: 'sba_agent_proof_step',
    category: 'operator-gated-capture',
    mayOpenBrowser: false,
    mayStartCapture: true,
    mayStartBackground: false,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'agent-proof-step --run --operator-ok OK',
    guard: 'auth-ready no-open capture requires operator-ok'
  },
  {
    id: 'agent-proof-step-start',
    command: 'agent-proof-step-start --run --operator-ok OK',
    mcpTool: 'sba_agent_proof_step_start',
    category: 'operator-gated-background-capture',
    mayOpenBrowser: false,
    mayStartCapture: true,
    mayStartBackground: true,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'agent-proof-step-start --run --operator-ok OK',
    guard: 'exact operator-ok plus no-open proof command shape'
  },
  {
    id: 'background-proof-capture-start',
    command: 'background-proof-capture-start --run --operator-ok OK',
    mcpTool: 'sba_background_proof_capture_start',
    category: 'operator-gated-background-capture',
    mayOpenBrowser: false,
    mayStartCapture: true,
    mayStartBackground: true,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'background-proof-capture-start --run --operator-ok OK',
    guard: 'exact operator-ok and capture command must not include open-login'
  },
  {
    id: 'objective-resume',
    command: 'objective-resume --run --operator-ok OK',
    mcpTool: 'sba_objective_resume',
    category: 'operator-gated-objective',
    mayOpenBrowser: true,
    mayStartCapture: true,
    mayStartBackground: false,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'objective-resume --run --operator-ok OK',
    guard: 'browser-opening or capture-capable primary commands require operator-ok'
  },
  {
    id: 'target-approval-resume',
    command: 'target-approval-resume --run --operator-ok OK',
    mcpTool: 'sba_target_approval_resume',
    category: 'operator-gated-target',
    mayOpenBrowser: true,
    mayStartCapture: true,
    mayStartBackground: false,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'target-approval-resume --run --operator-ok OK',
    guard: 'exact operator-ok for selected real-target next command'
  },
  {
    id: 'target-handoff-resume-watch',
    command: 'target-handoff-resume-watch --run [--operator-ok OK]',
    mcpTool: 'sba_target_handoff_resume_watch',
    category: 'conditional-agent-monitor-or-capture',
    mayOpenBrowser: false,
    mayStartCapture: true,
    mayStartBackground: false,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'target-handoff-resume-watch --run --operator-ok OK',
    guard: 'monitor-auth can run without approval; resume-capture requires operator-ok'
  },
  {
    id: 'chrome-extension-resume',
    command: 'chrome-extension-resume --run --operator-ok OK',
    mcpTool: 'sba_chrome_extension_resume',
    category: 'operator-gated-browser-open',
    mayOpenBrowser: true,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'chrome-extension-resume --run --operator-ok OK',
    guard: 'exact operator-ok before opening everyday Chrome profile'
  },
  {
    id: 'chrome-apple-events-outline',
    command: 'chrome-apple-events-outline --run --operator-ok OK',
    mcpTool: 'sba_chrome_apple_events_outline',
    category: 'operator-gated-existing-tab',
    mayOpenBrowser: false,
    mayStartCapture: false,
    mayStartBackground: false,
    operatorOkRequired: true,
    exactOperatorOkRequired: true,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'chrome-apple-events-outline --run --operator-ok OK',
    guard: 'exact operator-ok before active-tab JavaScript structure probe'
  },
  {
    id: 'target-login-capture',
    command: 'target-login-capture',
    mcpTool: 'sba_target_login_capture',
    category: 'direct-operator-browser-capture',
    mayOpenBrowser: true,
    mayStartCapture: true,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'target-approval-resume --run --operator-ok OK',
    guard: 'operator-facing low-level command; wrappers must gate unattended use'
  },
  {
    id: 'target-proof-capture',
    command: 'target-proof-capture --run',
    mcpTool: 'sba_target_proof_capture',
    category: 'direct-operator-capture',
    mayOpenBrowser: false,
    mayStartCapture: true,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'target-approval-resume --run --operator-ok OK',
    guard: 'operator-facing low-level command; wrappers must gate unattended use'
  },
  {
    id: 'target-handoff-resume',
    command: 'target-handoff-resume --run [--open-login] [--wait-auth]',
    mcpTool: 'sba_target_handoff_resume',
    category: 'direct-operator-browser-capture',
    mayOpenBrowser: true,
    mayStartCapture: true,
    mayStartBackground: false,
    operatorOkRequired: false,
    exactOperatorOkRequired: false,
    agentMayRunUnattended: false,
    preferredAgentSurface: 'target-handoff-resume-watch --run --operator-ok OK',
    guard: 'operator-facing low-level command; use target-handoff-resume-watch for agent loops'
  }
];

function summarize(surfaces) {
  const agentSafeUnattended = surfaces.filter((surface) => surface.agentMayRunUnattended);
  const operatorGated = surfaces.filter((surface) => surface.operatorOkRequired);
  const exactOperatorOk = surfaces.filter((surface) => surface.exactOperatorOkRequired);
  const directOperator = surfaces.filter((surface) => !surface.agentMayRunUnattended && !surface.operatorOkRequired);
  const unguardedAgentDangerous = surfaces.filter((surface) => (
    surface.agentMayRunUnattended
    && (surface.mayOpenBrowser || surface.mayStartCapture || surface.mayStartBackground)
    && !surface.operatorOkRequired
  ));
  return {
    total: surfaces.length,
    agentSafeUnattended: agentSafeUnattended.length,
    operatorGated: operatorGated.length,
    exactOperatorOk: exactOperatorOk.length,
    directOperator: directOperator.length,
    unguardedAgentDangerous: unguardedAgentDangerous.length,
    okForAgentLoops: unguardedAgentDangerous.length === 0
  };
}

export function buildRunGateAudit(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const surfaces = SURFACES.map((surface) => ({ ...surface }));
  const summary = summarize(surfaces);
  return {
    schemaVersion: 1,
    generatedAt,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCaptureNow: false,
    startsBackgroundProcessNow: false,
    summary,
    surfaces,
    nextAction: summary.okForAgentLoops
      ? 'use-agent-safe-surfaces-or-operator-ok-gated-wrappers'
      : 'fix-unguarded-agent-dangerous-surfaces-before-running-agent-loops'
  };
}

export function formatRunGateAuditCompact(audit) {
  const lines = [
    `safe_mode: ${yesNo(audit.safeMode)}`,
    `destructive_actions: ${yesNo(audit.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(audit.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(audit.opensBrowserNow)}`,
    `starts_capture_now: ${yesNo(audit.startsCaptureNow)}`,
    `starts_background_process_now: ${yesNo(audit.startsBackgroundProcessNow)}`,
    `total_surfaces: ${audit.summary.total}`,
    `agent_safe_unattended: ${audit.summary.agentSafeUnattended}`,
    `operator_gated: ${audit.summary.operatorGated}`,
    `exact_operator_ok_required: ${audit.summary.exactOperatorOk}`,
    `direct_operator: ${audit.summary.directOperator}`,
    `unguarded_agent_dangerous: ${audit.summary.unguardedAgentDangerous}`,
    `ok_for_agent_loops: ${yesNo(audit.summary.okForAgentLoops)}`,
    `next: ${clean(audit.nextAction)}`
  ];
  for (const surface of audit.surfaces) {
    lines.push(`surface_${surface.id}_category: ${surface.category}`);
    lines.push(`surface_${surface.id}_agent_may_run_unattended: ${yesNo(surface.agentMayRunUnattended)}`);
    lines.push(`surface_${surface.id}_operator_ok_required: ${yesNo(surface.operatorOkRequired)}`);
    lines.push(`surface_${surface.id}_exact_operator_ok_required: ${yesNo(surface.exactOperatorOkRequired)}`);
    lines.push(`surface_${surface.id}_may_open_browser: ${yesNo(surface.mayOpenBrowser)}`);
    lines.push(`surface_${surface.id}_may_start_capture: ${yesNo(surface.mayStartCapture)}`);
    lines.push(`surface_${surface.id}_may_start_background: ${yesNo(surface.mayStartBackground)}`);
    lines.push(`surface_${surface.id}_preferred_agent_surface: ${surface.preferredAgentSurface || 'none'}`);
    lines.push(`surface_${surface.id}_guard: ${surface.guard || 'none'}`);
    lines.push(`surface_${surface.id}_command: ${surface.command}`);
  }
  return `${lines.join('\n')}\n`;
}
