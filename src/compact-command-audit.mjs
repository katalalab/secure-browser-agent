import { buildOperatorPack, formatOperatorPackCompact } from './operator-pack.mjs';
import { buildControlStatus, formatControlStatusCompact } from './control-status.mjs';
import { buildRunGateAudit, formatRunGateAuditCompact } from './run-gate-audit.mjs';
import { buildObjectiveSafeCommand, formatObjectiveSafeCommandCompact } from './objective-safe-command.mjs';
import { buildObjectiveCompletionAudit, formatObjectiveCompletionAuditCompact } from './objective-completion-audit.mjs';
import { buildAgentControlPlane, formatAgentControlPlaneCompact } from './agent-control-plane.mjs';
import { buildCompletionProofBundle, formatCompletionProofBundleCompact } from './completion-proof-bundle.mjs';
import { buildAgentProofChecklist, formatAgentProofChecklistCompact } from './agent-proof-checklist.mjs';
import { buildAgentProofCloseout, formatAgentProofCloseoutCompact } from './agent-proof-closeout.mjs';
import { buildOperatorRunbook, formatOperatorRunbookCompact } from './operator-runbook.mjs';
import { buildAgentWorkflow, formatAgentWorkflowCompact } from './agent-workflow.mjs';
import { buildAgentBackendSelect, formatAgentBackendSelectCompact } from './agent-backend-select.mjs';
import { buildAgentTask, formatAgentTaskCompact } from './agent-task.mjs';
import { buildChromeMcpAutostartPlan, formatChromeMcpAutostartPlanCompact } from './chrome-mcp-autostart-plan.mjs';

function compactValue(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function parseCompact(text) {
  const lines = String(text || '').split(/\r?\n/);
  const entries = [];
  const values = new Map();
  for (const line of lines) {
    const match = /^([a-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    const trimmed = value.trim();
    values.set(key, trimmed);
    entries.push({ key, value: trimmed });
  }
  return { entries, values };
}

function isCommandKey(key) {
  return key === 'command' || key.endsWith('_command');
}

function commandBase(key) {
  if (key === 'command') return 'primary_command';
  return key.slice(0, -'_command'.length);
}

function hasUsefulCommand(value) {
  return Boolean(value && value !== 'none' && value !== 'null' && value !== 'undefined');
}

function classifyCommand(commandText) {
  const text = String(commandText || '');
  const hasRun = /'--run'/.test(text) || /(?:^|\s)--run(?:\s|$|\])/.test(text);
  const hasOperatorOk = /'--operator-ok' 'OK'/.test(text) || /(?:^|\s)--operator-ok\s+OK(?:\s|$|\])/.test(text);
  const opensBrowser = /\btarget-login-capture\b/.test(text)
    || /'--open-login'/.test(text)
    || /(?:^|\s)--open-login(?:\s|$|\])/.test(text)
    || /'--open-only'/.test(text)
    || /(?:^|\s)--open-only(?:\s|$|\])/.test(text)
    || (/\bchrome-extension-resume\b/.test(text) && hasRun)
    || (/\btarget-approval-resume\b/.test(text) && hasRun)
    || (/\bchrome-apple-events-outline\b/.test(text) && hasRun);
  const monitorOnly = /\btarget-auth-watch\b/.test(text)
    || /\bproof-gate-watch\b/.test(text)
    || /\bagent-loop-step-status\b/.test(text)
    || /\bobjective-safe-command\b/.test(text);
  const planOnly = !hasRun
    || /\bstatus\b/.test(text)
    || /\bplan\b/.test(text)
    || /\baudit\b/.test(text)
    || /\bdoctor\b/.test(text);
  const startsCapture = !monitorOnly
    && (/\btarget-login-capture\b/.test(text)
      || (/\btarget-proof-capture\b/.test(text) && hasRun)
      || (/\bagent-proof-step\b/.test(text) && hasRun)
      || (/\bagent-proof-step-start\b/.test(text) && hasRun)
      || (/\bbackground-proof-capture-start\b/.test(text) && hasRun)
      || (/\btarget-approval-resume\b/.test(text) && hasRun)
      || (/\btarget-handoff-resume\b/.test(text) && hasRun && (/'--wait-auth'/.test(text) || /(?:^|\s)--wait-auth(?:\s|$|\])/.test(text))));
  const startsBackground = /nohup\b/.test(text)
    || /> 'runs\/operator\/.*\.log' 2>&1 &/.test(text)
    || /'launchctl'\s+'bootstrap'/.test(text)
    || /\blaunchctl\s+bootstrap\b/.test(text)
    || (/\bbackground-proof-capture-start\b/.test(text) && hasRun)
    || (/\bagent-task-watch-start\b/.test(text) && hasRun)
    || (/\bagent-proof-step-start\b/.test(text) && hasRun);
  const mutatesRuntime = /'launchctl'\s+'(bootstrap|bootout)'/.test(text)
    || /\blaunchctl\s+(bootstrap|bootout)\b/.test(text)
    || (/^'cp'\s/.test(text) && /\/Library\/LaunchAgents\//.test(text))
    || (/^'rm'\s/.test(text) && /\/Library\/LaunchAgents\//.test(text));
  const operatorOk = hasOperatorOk;
  return {
    opensBrowser,
    startsCapture,
    startsBackground,
    mutatesRuntime,
    monitorOnly,
    planOnly,
    operatorOk,
    risky: opensBrowser || startsCapture || startsBackground || mutatesRuntime
  };
}

function hasAnyKey(values, keys) {
  return keys.some((key) => values.has(key));
}

function staleHandoffCaptureConflicts(values) {
  const stalePortBlocked = [
    'agent_safe_command_blocked_reason',
    'objective_safe_command_blocked_reason',
    'auth_watch_blocked_reason',
    'background_proof_capture_blocked_reason',
    'handoff_resume_watch_blocked_reason'
  ].some((key) => values.get(key) === 'handoff-auth-check-port-unreachable');
  if (!stalePortBlocked) return [];
  return [
    'auth_watch_command',
    'login_handoff_safe_monitor_command',
    'background_proof_no_open_wait_capture_command',
    'background_proof_no_open_wait_capture_background_command',
    'handoff_resume_watch_run_command'
  ]
    .filter((key) => hasUsefulCommand(values.get(key)))
    .map((key) => ({
      key,
      blockedReason: 'handoff-auth-check-port-unreachable'
    }));
}

function coverageForCommand(values, key) {
  const base = commandBase(key);
  const exactPrefix = key;
  const riskKeys = [
    `${base}_opens_browser`,
    `${base}_may_open_browser`,
    `${base}_starts_capture`,
    `${base}_starts_background`,
    `${base}_starts_background_process`,
    `${base}_mutates_runtime`,
    `${exactPrefix}_opens_browser`,
    `${exactPrefix}_may_open_browser`,
    `${exactPrefix}_starts_capture`,
    `${exactPrefix}_mutates_runtime`
  ];
  const approvalKeys = [
    `${base}_requires_operator_approval`,
    `${base}_operator_ok_required`,
    `${base}_agent_may_run_unattended`,
    `${base}_agent_must_not_run_unattended`,
    `${exactPrefix}_requires_operator_approval`,
    `${exactPrefix}_operator_ok_required`,
    `${exactPrefix}_agent_may_run_unattended`,
    `${exactPrefix}_agent_must_not_run_unattended`
  ];
  const blockerKeys = [
    `${base}_blocked_reason`,
    `${exactPrefix}_blocked_reason`
  ];
  return {
    riskClassified: hasAnyKey(values, riskKeys),
    approvalClassified: hasAnyKey(values, approvalKeys),
    blockerClassified: hasAnyKey(values, blockerKeys)
  };
}

export const COMPACT_COMMAND_AUDIT_SOURCES = [
  'operator-pack',
  'control-status',
  'objective-completion-audit',
  'objective-safe-command',
  'run-gate-audit',
  'agent-control-plane',
  'completion-proof-bundle',
  'agent-proof-checklist',
  'agent-proof-closeout',
  'operator-runbook',
  'agent-workflow',
  'agent-backend-select',
  'agent-task',
  'chrome-mcp-autostart-plan'
];

function combineAudits(audits, options = {}) {
  const unclassifiedRisk = audits.flatMap((audit) => audit.unclassifiedRisk.map((item) => ({
    ...item,
    key: `${audit.source}:${item.key}`
  })));
  const missingApproval = audits.flatMap((audit) => audit.missingApproval.map((item) => ({
    ...item,
    key: `${audit.source}:${item.key}`
  })));
  const staleHandoffConflicts = audits.flatMap((audit) => (audit.staleHandoffConflicts || []).map((item) => ({
    ...item,
    key: `${audit.source}:${item.key}`
  })));
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: 'all',
    sources: audits.map((audit) => ({
      source: audit.source,
      complete: audit.complete,
      safeForStrictAgentLoops: audit.safeForStrictAgentLoops,
      commandCount: audit.commandCount,
      riskyCommandCount: audit.riskyCommandCount,
      unclassifiedRiskCount: audit.unclassifiedRiskCount,
      missingApprovalCount: audit.missingApprovalCount,
      staleHandoffConflictCount: audit.staleHandoffConflictCount
    })),
    complete: audits.every((audit) => audit.complete),
    safeForStrictAgentLoops: audits.every((audit) => audit.safeForStrictAgentLoops),
    commandCount: audits.reduce((sum, audit) => sum + audit.commandCount, 0),
    riskyCommandCount: audits.reduce((sum, audit) => sum + audit.riskyCommandCount, 0),
    opensBrowserCommandCount: audits.reduce((sum, audit) => sum + audit.opensBrowserCommandCount, 0),
    startsCaptureCommandCount: audits.reduce((sum, audit) => sum + audit.startsCaptureCommandCount, 0),
    startsBackgroundCommandCount: audits.reduce((sum, audit) => sum + audit.startsBackgroundCommandCount, 0),
    mutatesRuntimeCommandCount: audits.reduce((sum, audit) => sum + audit.mutatesRuntimeCommandCount, 0),
    unclassifiedRiskCount: unclassifiedRisk.length,
    missingApprovalCount: missingApproval.length,
    staleHandoffConflictCount: staleHandoffConflicts.length,
    commands: audits.flatMap((audit) => audit.commands.map((command) => ({
      ...command,
      source: audit.source,
      key: `${audit.source}:${command.key}`
    }))),
    unclassifiedRisk,
    missingApproval,
    staleHandoffConflicts
  };
}

export async function buildCompactCommandAudit(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const source = options.source || 'operator-pack';
  const monitorTimeoutMs = options.monitorTimeoutMs ?? options['monitor-timeout-ms'];
  const monitorIntervalMs = options.monitorIntervalMs ?? options['monitor-interval-ms'];
  if (source === 'all') {
    const audits = [];
    for (const childSource of COMPACT_COMMAND_AUDIT_SOURCES) {
      audits.push(await buildCompactCommandAudit({
        ...options,
        source: childSource,
        compactText: options.compactTexts?.[childSource]
      }));
    }
    return combineAudits(audits, options);
  }
  if (!COMPACT_COMMAND_AUDIT_SOURCES.includes(source)) throw new Error(`unsupported compact command audit source: ${source}`);

  const compact = options.compactText || (source === 'control-status'
    ? formatControlStatusCompact(options.controlStatus || await buildControlStatus({
      rootDir,
      monitorTimeoutMs,
      monitorIntervalMs
    }))
    : source === 'agent-control-plane'
      ? formatAgentControlPlaneCompact(options.agentControlPlane || await buildAgentControlPlane({
        rootDir,
        monitorTimeoutMs,
        monitorIntervalMs,
        task: options.task || 'existing-tab'
      }))
    : source === 'completion-proof-bundle'
      ? formatCompletionProofBundleCompact(options.completionProofBundle || await buildCompletionProofBundle({
        rootDir,
        generatedAt: options.generatedAt,
        candidate: options.candidate || 'github'
      }))
    : source === 'agent-proof-checklist'
      ? formatAgentProofChecklistCompact(options.agentProofChecklist || await buildAgentProofChecklist({
        rootDir,
        generatedAt: options.generatedAt,
        candidate: options.candidate || 'github'
      }))
    : source === 'agent-proof-closeout'
      ? formatAgentProofCloseoutCompact(options.agentProofCloseout || await buildAgentProofCloseout({
        rootDir,
        generatedAt: options.generatedAt,
        candidate: options.candidate || 'github'
      }))
    : source === 'operator-runbook'
      ? formatOperatorRunbookCompact(options.operatorRunbook || await buildOperatorRunbook({
        rootDir,
        generatedAt: options.generatedAt,
        monitorTimeoutMs,
        monitorIntervalMs
      }))
    : source === 'agent-workflow'
      ? formatAgentWorkflowCompact(options.agentWorkflow || await buildAgentWorkflow({
        rootDir,
        generatedAt: options.generatedAt,
        task: options.task || 'existing-tab'
      }))
    : source === 'agent-backend-select'
      ? formatAgentBackendSelectCompact(options.agentBackendSelect || await buildAgentBackendSelect({
        rootDir,
        generatedAt: options.generatedAt,
        task: options.task || 'existing-tab'
      }))
    : source === 'agent-task'
      ? formatAgentTaskCompact(options.agentTask || await buildAgentTask({
        rootDir,
        generatedAt: options.generatedAt,
        task: options.task || 'existing-tab',
        mcpObservationIn: options.mcpObservationIn || 'operator/chrome-mcp-observation-latest.json'
      }))
    : source === 'chrome-mcp-autostart-plan'
      ? formatChromeMcpAutostartPlanCompact(options.chromeMcpAutostartPlan || buildChromeMcpAutostartPlan({
        rootDir,
        generatedAt: options.generatedAt
      }))
    : source === 'objective-safe-command'
      ? formatObjectiveSafeCommandCompact(options.objectiveSafeCommand || await buildObjectiveSafeCommand({
        rootDir,
        monitorTimeoutMs,
        monitorIntervalMs
      }))
    : source === 'objective-completion-audit'
      ? formatObjectiveCompletionAuditCompact(options.objectiveCompletionAudit || await buildObjectiveCompletionAudit({
        rootDir,
        monitorTimeoutMs,
        monitorIntervalMs
      }))
    : source === 'run-gate-audit'
      ? formatRunGateAuditCompact(options.runGateAudit || buildRunGateAudit({
        rootDir
      }))
    : formatOperatorPackCompact(options.pack || await buildOperatorPack({
      rootDir,
      monitorTimeoutMs,
      monitorIntervalMs
    })));
  const parsed = parseCompact(compact);
  const commands = parsed.entries
    .filter((entry) => isCommandKey(entry.key) && hasUsefulCommand(entry.value))
    .map((entry) => {
      const classification = classifyCommand(entry.value);
      const coverage = coverageForCommand(parsed.values, entry.key);
      const riskClassified = !classification.risky || coverage.riskClassified || classification.operatorOk;
      const approvalClassified = !classification.risky
        || coverage.approvalClassified
        || coverage.blockerClassified
        || classification.operatorOk;
      return {
        key: entry.key,
        command: entry.value,
        ...classification,
        ...coverage,
        riskClassified,
        approvalClassified
      };
    });
  const riskyCommands = commands.filter((command) => command.risky);
  const unclassifiedRisk = riskyCommands.filter((command) => !command.riskClassified);
  const missingApproval = riskyCommands.filter((command) => !command.approvalClassified);
  const staleHandoffConflicts = staleHandoffCaptureConflicts(parsed.values);
  const backgroundCommands = commands.filter((command) => command.startsBackground);
  const opensBrowserCommands = commands.filter((command) => command.opensBrowser);
  const captureCommands = commands.filter((command) => command.startsCapture);
  const runtimeMutationCommands = commands.filter((command) => command.mutatesRuntime);
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    source,
    complete: unclassifiedRisk.length === 0 && staleHandoffConflicts.length === 0,
    safeForStrictAgentLoops: unclassifiedRisk.length === 0 && missingApproval.length === 0 && staleHandoffConflicts.length === 0,
    commandCount: commands.length,
    riskyCommandCount: riskyCommands.length,
    opensBrowserCommandCount: opensBrowserCommands.length,
    startsCaptureCommandCount: captureCommands.length,
    startsBackgroundCommandCount: backgroundCommands.length,
    mutatesRuntimeCommandCount: runtimeMutationCommands.length,
    unclassifiedRiskCount: unclassifiedRisk.length,
    missingApprovalCount: missingApproval.length,
    staleHandoffConflictCount: staleHandoffConflicts.length,
    commands,
    unclassifiedRisk: unclassifiedRisk.map(({ key, opensBrowser, startsCapture, startsBackground, mutatesRuntime }) => ({
      key,
      opensBrowser,
      startsCapture,
      startsBackground,
      mutatesRuntime
    })),
    missingApproval: missingApproval.map(({ key, opensBrowser, startsCapture, startsBackground, mutatesRuntime }) => ({
      key,
      opensBrowser,
      startsCapture,
      startsBackground,
      mutatesRuntime
    })),
    staleHandoffConflicts
  };
}

export function formatCompactCommandAuditCompact(audit) {
  const lines = [
    `source: ${compactValue(audit.source)}`,
    `complete: ${yesNo(audit.complete)}`,
    `safe_for_strict_agent_loops: ${yesNo(audit.safeForStrictAgentLoops)}`,
    `command_count: ${audit.commandCount}`,
    `risky_command_count: ${audit.riskyCommandCount}`,
    `opens_browser_command_count: ${audit.opensBrowserCommandCount}`,
    `starts_capture_command_count: ${audit.startsCaptureCommandCount}`,
    `starts_background_command_count: ${audit.startsBackgroundCommandCount}`,
    `mutates_runtime_command_count: ${audit.mutatesRuntimeCommandCount || 0}`,
    `unclassified_risk_count: ${audit.unclassifiedRiskCount}`,
    `missing_approval_count: ${audit.missingApprovalCount}`,
    `stale_handoff_conflict_count: ${audit.staleHandoffConflictCount ?? 0}`
  ];
  for (const source of audit.sources || []) {
    lines.push(`source_${source.source}_complete: ${yesNo(source.complete)}`);
    lines.push(`source_${source.source}_safe_for_strict_agent_loops: ${yesNo(source.safeForStrictAgentLoops)}`);
    lines.push(`source_${source.source}_command_count: ${source.commandCount}`);
    lines.push(`source_${source.source}_risky_command_count: ${source.riskyCommandCount}`);
    lines.push(`source_${source.source}_unclassified_risk_count: ${source.unclassifiedRiskCount}`);
    lines.push(`source_${source.source}_missing_approval_count: ${source.missingApprovalCount}`);
    lines.push(`source_${source.source}_stale_handoff_conflict_count: ${source.staleHandoffConflictCount ?? 0}`);
  }
  for (const item of audit.unclassifiedRisk.slice(0, 10)) {
    lines.push(`unclassified_risk_${item.key}: opens_browser=${yesNo(item.opensBrowser)} starts_capture=${yesNo(item.startsCapture)} starts_background=${yesNo(item.startsBackground)} mutates_runtime=${yesNo(item.mutatesRuntime)}`);
  }
  for (const item of audit.missingApproval.slice(0, 10)) {
    lines.push(`missing_approval_${item.key}: opens_browser=${yesNo(item.opensBrowser)} starts_capture=${yesNo(item.startsCapture)} starts_background=${yesNo(item.startsBackground)} mutates_runtime=${yesNo(item.mutatesRuntime)}`);
  }
  for (const item of (audit.staleHandoffConflicts || []).slice(0, 10)) {
    lines.push(`stale_handoff_conflict_${item.key}: blocked_reason=${compactValue(item.blockedReason)}`);
  }
  return `${lines.join('\n')}\n`;
}
