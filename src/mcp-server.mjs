import fs from 'node:fs';
import readline from 'node:readline';
import { analyzeWithCdp, cdpDaemonStatus, runRecipeWithCdp, scrapeWithCdp, startCdpDaemon, stopCdpDaemon } from './cdp-backend.mjs';
import { assertAllowedUrl, assertEngineAllowed, loadPolicy, profilePath, redact } from './policy.mjs';
import { writeOutput } from './output.mjs';
import { addTargetOperateStep, applyTargetPermissions, buildTargetRunStatus, formatTargetRunStatusCompact, resolveTargetDaemon, resolveTargetPack, resolveTargetPermissions, resolveTargetRun, resolveTargetScrape, targetPermissionStatus, writeTargetPermissions } from './target-pack.mjs';
import { profileStatus } from './profile-status.mjs';
import { auditTargetPack } from './security-audit.mjs';
import { buildRuntimeAudit, buildRuntimeCleanupPlan, formatRuntimeAuditCompact, formatRuntimeCleanupPlanCompact, writeRuntimeAuditReport, writeRuntimeCleanupPlanReport } from './runtime-audit.mjs';
import { buildRunGateAudit, formatRunGateAuditCompact } from './run-gate-audit.mjs';
import { buildCompactCommandAudit, COMPACT_COMMAND_AUDIT_SOURCES, formatCompactCommandAuditCompact } from './compact-command-audit.mjs';
import { buildCompletionProofBundle, buildCompletionProofBundleStatus, buildCompletionProofBundleWatch, formatCompletionProofBundleCompact, formatCompletionProofBundleStatusCompact, formatCompletionProofBundleWatchCompact } from './completion-proof-bundle.mjs';
import { buildProviderReport, formatProviderReportCompact } from './provider-report.mjs';
import { buildAgentBrowserDoctor, formatAgentBrowserDoctorCompact } from './agent-browser-doctor.mjs';
import { buildProviderDoctorStatus, formatProviderDoctorStatusCompact } from './provider-doctor-status.mjs';
import { buildBackendMatrix, buildBackendMatrixStatus, formatBackendMatrixCompact, formatBackendMatrixStatusCompact } from './backend-matrix.mjs';
import { runProviderBenchmark, writeProviderBenchmarkReport } from './provider-benchmark.mjs';
import { runTargetBenchmark, writeTargetBenchmarkReport } from './target-benchmark.mjs';
import { buildSourceAudit, formatSourceAuditCompact } from './source-audit.mjs';
import { buildReadinessAudit, formatReadinessAuditCompact } from './readiness-audit.mjs';
import { buildObjectiveNext, formatObjectiveNextCompact } from './objective-next.mjs';
import { buildObjectiveResume, formatObjectiveResumeCompact } from './objective-resume.mjs';
import { buildObjectiveStatus, formatObjectiveStatusCompact } from './objective-status.mjs';
import { buildObjectiveCompletionAudit, buildObjectiveCompletionAuditStatus, buildObjectiveCompletionAuditWatch, formatObjectiveCompletionAuditCompact, formatObjectiveCompletionAuditStatusCompact, formatObjectiveCompletionAuditWatchCompact } from './objective-completion-audit.mjs';
import { buildObjectiveSafeCommand, formatObjectiveSafeCommandCompact } from './objective-safe-command.mjs';
import { buildObjectiveProofPipeline, formatObjectiveProofPipelineCompact } from './objective-proof-pipeline.mjs';
import { buildObjectiveHandoff, formatObjectiveHandoffCompact } from './objective-handoff.mjs';
import { buildTargetProof, buildTargetProofInventory, buildTargetProofNext, buildTargetProofPlan, formatTargetProofInventoryCompact, formatTargetProofNextCompact, formatTargetProofPlanCompact } from './target-proof.mjs';
import { buildTargetProofCapture, formatTargetProofCaptureCompact } from './target-proof-capture.mjs';
import { buildTargetLoginCapture } from './target-login-capture.mjs';
import { buildTargetHandoffResume, buildTargetHandoffResumeStatus, buildTargetHandoffResumeWatch, buildTargetHandoffRun, buildTargetHandoffStatus, formatTargetHandoffResumeCompact, formatTargetHandoffResumeStatusCompact, formatTargetHandoffResumeWatchCompact, formatTargetHandoffRunCompact, formatTargetHandoffStatusCompact } from './target-handoff-run.mjs';
import { buildTargetAuthCheck, buildTargetAuthWatch, formatTargetAuthCheckCompact, formatTargetAuthWatchCompact } from './target-auth-check.mjs';
import { buildTargetBootstrapPlan, formatTargetBootstrapPlanCompact } from './target-bootstrap-plan.mjs';
import { buildTargetCandidatePlan, buildTargetCandidatePlanStatus, buildTargetCandidatePlanWatch, formatTargetCandidatePlanCompact, formatTargetCandidatePlanStatusCompact, formatTargetCandidatePlanWatchCompact } from './target-candidate-plan.mjs';
import { buildTargetApprovalPack, buildTargetApprovalPreflight, buildTargetApprovalResume, buildTargetApprovalResumeStatus, buildTargetApprovalResumeWatch, buildTargetApprovalStatus, formatTargetApprovalPackCompact, formatTargetApprovalPreflightCompact, formatTargetApprovalResumeCompact, formatTargetApprovalResumeStatusCompact, formatTargetApprovalResumeWatchCompact, formatTargetApprovalStatusCompact, writeTargetApprovalPack } from './target-approval-pack.mjs';
import { buildLightpandaDoctor, formatLightpandaDoctorCompact } from './lightpanda-doctor.mjs';
import { buildLightpandaDecision, writeLightpandaDecision } from './lightpanda-decision.mjs';
import { buildPlaywrightDoctor, formatPlaywrightDoctorCompact } from './playwright-doctor.mjs';
import { buildSeleniumDoctor, formatSeleniumDoctorCompact } from './selenium-doctor.mjs';
import { buildSecretAudit, buildSecretRunPlan, buildSecretRunSelect, buildSecretSetupPlan, formatSecretAuditCompact, formatSecretRunPlanCompact, formatSecretRunSelectCompact, formatSecretSetupPlanCompact } from './secret-audit.mjs';
import { buildSecretEnvHandoff, buildSecretEnvHandoffStatus, buildSecretEnvHandoffWatch, formatSecretEnvHandoffCompact, formatSecretEnvHandoffStatusCompact, formatSecretEnvHandoffWatchCompact } from './secret-env-handoff.mjs';
import { buildAgentNext, buildControlStatus, formatAgentNextCompact, formatControlStatusCompact } from './control-status.mjs';
import { buildAgentProofCloseout, buildAgentProofCloseoutStatus, formatAgentProofCloseoutCompact, formatAgentProofCloseoutStatusCompact } from './agent-proof-closeout.mjs';
import { buildAgentProofChecklist, buildAgentProofChecklistStatus, formatAgentProofChecklistCompact, formatAgentProofChecklistStatusCompact } from './agent-proof-checklist.mjs';
import { buildAgentLoopStep, buildAgentLoopStepStatus, formatAgentLoopStepCompact, formatAgentLoopStepStatusCompact } from './agent-loop-step.mjs';
import { buildAgentProofStep, buildAgentProofStepStart, buildAgentProofStepStatus, formatAgentProofStepCompact, formatAgentProofStepStartCompact, formatAgentProofStepStatusCompact } from './agent-proof-step.mjs';
import { buildAgentWorkflow, formatAgentWorkflowCompact } from './agent-workflow.mjs';
import { buildAgentBackendSelect, formatAgentBackendSelectCompact } from './agent-backend-select.mjs';
import { buildAgentControlPlane, buildAgentControlPlaneStatus, buildAgentControlPlaneWatch, formatAgentControlPlaneCompact, formatAgentControlPlaneStatusCompact, formatAgentControlPlaneWatchCompact, writeAgentControlPlane } from './agent-control-plane.mjs';
import { buildAgentTask, buildAgentTaskLoop, buildAgentTaskStatus, buildAgentTaskWatch, buildAgentTaskWatchStart, buildAgentTaskWatchStatus, formatAgentTaskCompact, formatAgentTaskLoopCompact, formatAgentTaskStatusCompact, formatAgentTaskWatchCompact, formatAgentTaskWatchStartCompact, formatAgentTaskWatchStatusCompact } from './agent-task.mjs';
import { buildChromeControlPlan, formatChromeControlPlanCompact } from './chrome-control-plan.mjs';
import { buildChromeMcpObservation, buildChromeMcpObservationStatus, formatChromeMcpObservationCompact, formatChromeMcpObservationStatusCompact } from './chrome-mcp-observation.mjs';
import { buildChromeMcpStatus, formatChromeMcpStatusCompact } from './chrome-mcp-status.mjs';
import { buildChromeMcpHandoff, formatChromeMcpHandoffCompact } from './chrome-mcp-handoff.mjs';
import { buildChromeMcpTimeoutPlan, buildChromeMcpTimeoutPlanStatus, formatChromeMcpTimeoutPlanCompact, formatChromeMcpTimeoutPlanStatusCompact } from './chrome-mcp-timeout-plan.mjs';
import { buildChromeMcpAutostartPlan, buildChromeMcpAutostartPlanStatus, formatChromeMcpAutostartPlanCompact, formatChromeMcpAutostartPlanStatusCompact } from './chrome-mcp-autostart-plan.mjs';
import { buildRegularChromeUse, formatRegularChromeUseCompact } from './regular-chrome-use.mjs';
import { buildRegularChromeRefresh, buildRegularChromeStatus, buildRegularChromeWatch, formatRegularChromeRefreshCompact, formatRegularChromeStatusCompact, formatRegularChromeWatchCompact } from './regular-chrome-refresh.mjs';
import { buildBrowserRoute, formatBrowserRouteCompact } from './browser-route.mjs';
import { buildChromeAppleEventsOutline, buildChromeAppleEventsStatus, formatChromeAppleEventsOutlineCompact, formatChromeAppleEventsStatusCompact } from './chrome-apple-events-status.mjs';
import { buildChromeAppleEventsEnablePlan, formatChromeAppleEventsEnablePlanCompact } from './chrome-apple-events-enable-plan.mjs';
import { buildChromeExtensionStatus, formatChromeExtensionStatusCompact } from './chrome-extension-status.mjs';
import { buildChromeExtensionHandoff, formatChromeExtensionHandoffCompact } from './chrome-extension-handoff.mjs';
import { buildChromeExtensionResume, formatChromeExtensionResumeCompact } from './chrome-extension-resume.mjs';
import { buildChromeExtensionTroubleshoot, formatChromeExtensionTroubleshootCompact } from './chrome-extension-troubleshoot.mjs';
import { buildChromeExtensionBackendCheckPlan, formatChromeExtensionBackendCheckPlanCompact } from './chrome-extension-backend-check-plan.mjs';
import { buildChromeExtensionClaimPlan, formatChromeExtensionClaimPlanCompact } from './chrome-extension-claim-plan.mjs';
import { buildProofGateStatus, formatProofGateStatusCompact } from './proof-gate-status.mjs';
import { buildProofGateWatch, formatProofGateWatchCompact } from './proof-gate-watch.mjs';
import { buildLoginHandoffStatus, formatLoginHandoffStatusCompact } from './login-handoff-status.mjs';
import { buildOperatorPack, buildOperatorPackStatus, formatOperatorPackCompact, formatOperatorPackStatusCompact } from './operator-pack.mjs';
import { buildOperatorRunbook, buildOperatorRunbookStatus, buildOperatorRunbookWatch, formatOperatorRunbookCompact, formatOperatorRunbookStatusCompact, formatOperatorRunbookWatchCompact } from './operator-runbook.mjs';
import { buildBackgroundMonitorPlan, formatBackgroundMonitorPlanCompact } from './background-monitor-plan.mjs';
import { buildBackgroundProofCapturePlan, formatBackgroundProofCapturePlanCompact } from './background-proof-capture-plan.mjs';
import { buildBackgroundProofCaptureStatus, formatBackgroundProofCaptureStatusCompact } from './background-proof-capture-status.mjs';
import { buildBackgroundProofCaptureStart, formatBackgroundProofCaptureStartCompact } from './background-proof-capture-start.mjs';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

function ensureDirs(policy, profileName) {
  fs.mkdirSync(policy.outputDir, { recursive: true });
  fs.mkdirSync(profilePath(policy, profileName), { recursive: true });
}

function csv(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function textResult(value, isError = false, text = '') {
  return {
    content: [{ type: 'text', text: text || JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError
  };
}

const MCP_CACHE_DEFAULT_TTL_MS = 15000;
const mcpCache = new Map();

function mcpCacheTtlMs() {
  const raw = process.env.SBA_MCP_CACHE_TTL_MS;
  if (raw === '0') return 0;
  const ttl = Number(raw ?? MCP_CACHE_DEFAULT_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : MCP_CACHE_DEFAULT_TTL_MS;
}

function canUseReadOnlyMcpCache(args = {}) {
  return !args.write && !args.out && !args.output && !args.run;
}

function mcpCacheKey(name, parts = {}) {
  return JSON.stringify([name, parts]);
}

async function cachedMcpValue(name, parts, builder) {
  const ttlMs = mcpCacheTtlMs();
  if (!ttlMs) return builder();
  const key = mcpCacheKey(name, parts);
  const now = Date.now();
  const existing = mcpCache.get(key);
  if (existing && existing.expiresAt > now) return existing.value;
  const value = Promise.resolve().then(builder);
  mcpCache.set(key, { expiresAt: now + ttlMs, value });
  try {
    return await value;
  } catch (error) {
    if (mcpCache.get(key)?.value === value) mcpCache.delete(key);
    throw error;
  }
}

async function cachedRuntimeAudit(rootDir) {
  return cachedMcpValue('runtime-audit', { rootDir }, () => buildRuntimeAudit({ rootDir }));
}

async function cachedRuntimeCleanupPlan(rootDir, ownerLimit) {
  const normalizedOwnerLimit = ownerLimit || 8;
  return cachedMcpValue('runtime-cleanup-plan', { rootDir, ownerLimit: normalizedOwnerLimit }, async () => buildRuntimeCleanupPlan({
    audit: await cachedRuntimeAudit(rootDir),
    ownerLimit: normalizedOwnerLimit
  }));
}

async function cachedObjectiveStatus(rootDir) {
  return cachedMcpValue('objective-status', { rootDir }, () => buildObjectiveStatus({ rootDir }));
}

async function cachedProofGateStatus(rootDir) {
  return cachedMcpValue('proof-gate-status', { rootDir }, () => buildProofGateStatus({ rootDir }));
}

async function cachedLoginHandoffStatus(rootDir) {
  return cachedMcpValue('login-handoff-status', { rootDir }, async () => buildLoginHandoffStatus({
    rootDir,
    proofGateStatus: await cachedProofGateStatus(rootDir)
  }));
}

async function cachedChromeExtensionStatus(rootDir, pluginDir = '') {
  return cachedMcpValue('chrome-extension-status', { rootDir, pluginDir }, () => buildChromeExtensionStatus({ pluginDir }));
}

async function cachedChromeControlPlan(rootDir, lane = 'auto', pluginDir = '', options = {}) {
  return cachedMcpValue('chrome-control-plan', { rootDir, lane, pluginDir, ...options }, async () => buildChromeControlPlan({
    rootDir,
    lane,
    ...options,
    runtimeAudit: await cachedRuntimeAudit(rootDir),
    chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, pluginDir)
  }));
}

function chromeMcpStatusParts(args = {}) {
  return {
    observedConnected: args.observedConnected ?? args.chromeMcpConnected,
    observedTools: args.observedTools ?? args.chromeMcpTools,
    observedPageListOk: args.observedPageListOk ?? args.chromeMcpPageListOk,
    observedPageCount: args.observedPageCount ?? args.chromeMcpPageCount,
    observedLastError: args.observedLastError ?? args.chromeMcpLastError ?? '',
    observedSource: args.observedSource ?? args.chromeMcpSource ?? ''
  };
}

async function cachedChromeMcpStatus(rootDir, args = {}) {
  const parts = chromeMcpStatusParts(args);
  return cachedMcpValue('chrome-mcp-status', { rootDir, ...parts }, async () => buildChromeMcpStatus({
    rootDir,
    ...parts,
    runtimeAudit: await cachedRuntimeAudit(rootDir),
    chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir)
  }));
}

async function cachedChromeAppleEventsStatus(rootDir) {
  return cachedMcpValue('chrome-apple-events-status', { rootDir }, () => buildChromeAppleEventsStatus());
}

async function cachedControlStatus(rootDir, options = {}) {
  return cachedMcpValue('control-status', { rootDir }, async () => buildControlStatus({
    rootDir,
    monitorTimeoutMs: options.monitorTimeoutMs,
    monitorIntervalMs: options.monitorIntervalMs,
    objectiveStatus: await cachedObjectiveStatus(rootDir),
    runtimeAudit: await cachedRuntimeAudit(rootDir),
    chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir)
  }));
}

function expandRecipeSearchSteps(recipe) {
  const searchUrl = (provider, query) => {
    const encoded = encodeURIComponent(query);
    if (provider === 'brave') return `https://search.brave.com/search?q=${encoded}`;
    if (provider === 'google') return `https://www.google.com/search?igu=1&q=${encoded}`;
    return `https://html.duckduckgo.com/html/?q=${encoded}`;
  };
  const copy = JSON.parse(JSON.stringify(recipe));
  copy.steps = (copy.steps || []).flatMap((step, index) => {
    if ((step.type || step.action) !== 'search') return [step];
    if (!step.query) throw new Error(`recipe step ${index + 1} search requires query`);
    const as = step.as || `search${index + 1}`;
    const provider = step.provider || copy.provider || 'duckduckgo';
    return [
      { type: 'goto', url: searchUrl(provider, step.query), as: `${as}_goto` },
      { type: 'outline', as, linkLimit: step.linkLimit || 50 },
      { type: 'search-status', provider, query: step.query, from: as, as: `${as}_status`, linkLimit: step.linkLimit || 50 }
    ];
  });
  return copy;
}

function assertRecipeAllowed(recipe, policy) {
  if (recipe.url) assertAllowedUrl(recipe.url, policy);
  for (const url of recipe.urls || []) assertAllowedUrl(url, policy);
  for (const step of recipe.steps || []) {
    if (step.url) assertAllowedUrl(step.url, policy);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function listMcpTools() {
  return [
    {
      name: 'sba_control_status',
      title: 'Secure Browser Agent Control Status',
      description: 'Low-token combined status for the browser automation control plane: objective, DevTools lanes, duplicated MCP helpers, 1Password/headless secret boundary, and next command.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in agent-loop-step commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in agent-loop-step commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_next',
      title: 'Secure Browser Agent Next Action',
      description: 'Smallest safe next-action handoff for agent loops. It exposes an agent_run_command only when the command is safe without operator approval; browser-opening or capture-capable commands are separated as operator_approval_command.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in agent-loop commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in agent-loop commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_preflight',
      title: 'Secure Browser Agent Preflight',
      description: 'Shortest safe real-external proof preflight for agent loops. It is read-only, never opens a browser, never starts capture, and defaults to the real-external completion lane.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Real external target candidate to preflight. Defaults to github.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_checklist',
      title: 'Secure Browser Agent Proof Checklist',
      description: 'Read-only low-token operator checklist for the remaining real-external proof lane. It resolves the current candidate to proof status, safe polling commands, and operator-only resume command.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Real external target candidate. Defaults to github.' },
          write: { type: 'boolean', description: 'Write the checklist JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/agent-proof-checklist-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_checklist_status',
      title: 'Secure Browser Agent Proof Checklist Status',
      description: 'Read-only status for the saved agent proof checklist under runs/, including freshness and refresh command.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved checklist path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved checklist status.' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Fallback candidate for refresh command when no saved checklist exists.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_closeout',
      title: 'Secure Browser Agent Proof Closeout',
      description: 'Read-only low-token final proof closeout. It combines the current completion proof bundle and saved checklist status, then reports whether the real-external authenticated proof is complete.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Real external target candidate. Defaults to github.' },
          includeCompactCommandAudit: { type: 'boolean', description: 'Include the strict all-source compact command audit in the live closeout.' },
          write: { type: 'boolean', description: 'Write the closeout JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/agent-proof-closeout-latest.json when write is true.' },
          checklistIn: { type: 'string', description: 'runs/-relative saved agent proof checklist path.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_closeout_status',
      title: 'Secure Browser Agent Proof Closeout Status',
      description: 'Read-only status for the saved final proof closeout under runs/, including freshness and refresh command.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved closeout path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved closeout status.' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Fallback candidate for refresh command when no saved closeout exists.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_workflow',
      title: 'Secure Browser Agent Workflow',
      description: 'Read-only low-token command palette for search, observe, inspect, scrape, operate, screenshot, crawl, existing-tab, and auth-proof workflows. Authenticated tasks auto-detect the current proof-gate target when targetDir is omitted.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['auto', 'search', 'observe', 'inspect', 'analyze', 'scrape', 'operate', 'screenshot', 'diagnose', 'crawl', 'links', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          matchOrigin: { type: 'string', description: 'Existing-tab safe selection origin for Codex Chrome Extension claim-plan.' },
          matchPath: { type: 'string', description: 'Existing-tab safe selection path for Codex Chrome Extension claim-plan.' },
          tabIndex: { type: 'number', description: 'Existing-tab index from safe openTabs metadata.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          chromeExtensionPrepared: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_backend_select',
      title: 'Secure Browser Agent Backend Select',
      description: 'Read-only task-to-backend selector combining workflow, execution gate, and backend matrix into one compact handoff. It never opens Chrome, reads browser storage, or starts capture.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['auto', 'search', 'observe', 'inspect', 'analyze', 'scrape', 'operate', 'screenshot', 'diagnose', 'crawl', 'links', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          backendMatrixIn: { type: 'string', description: 'runs/-relative saved backend matrix JSON path. Defaults to live recomputation when omitted or unavailable.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          matchOrigin: { type: 'string', description: 'Optional origin selector metadata for existing-tab claim plans; raw tab URLs are not read by this tool.' },
          matchPath: { type: 'string', description: 'Optional path selector metadata for existing-tab claim plans.' },
          tabIndex: { type: 'number', description: 'Optional operator-provided tab index selector for existing-tab claim plans.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_control_plane',
      title: 'Secure Browser Agent Control Plane',
      description: 'Read-only low-token rollup of readiness, provider doctors, backend selection, objective-next, and objective-proof-pipeline for a requested browser task.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['auto', 'search', 'analyze', 'scrape', 'operate', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          backendMatrixIn: { type: 'string', description: 'runs/-relative saved backend matrix path.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no'] },
          newBackgroundUrlEnv: { type: 'string' },
          monitorTimeoutMs: { type: 'number' },
          monitorIntervalMs: { type: 'number' },
          write: { type: 'boolean', description: 'Write JSON status under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/agent-control-plane-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_control_plane_status',
      title: 'Secure Browser Agent Control Plane Status',
      description: 'Read-only status reader for a saved agent-control-plane JSON under runs/; does not recompute provider, browser, or objective state.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative input path. Defaults to operator/agent-control-plane-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_control_plane_watch',
      title: 'Secure Browser Agent Control Plane Watch',
      description: 'Read-only-by-default saved control-plane freshness check; with run=true, refreshes only the saved JSON under runs/ and does not open browsers or start capture.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative input path. Defaults to operator/agent-control-plane-latest.json.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number' },
          task: { type: 'string', enum: ['auto', 'search', 'analyze', 'scrape', 'operate', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          backendMatrixIn: { type: 'string' },
          mcpObservationIn: { type: 'string' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          newBackgroundUrlEnv: { type: 'string' },
          monitorTimeoutMs: { type: 'number' },
          monitorIntervalMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task',
      title: 'Secure Browser Agent Task',
      description: 'Plan or run one safe agent browser task from the workflow command palette. Run mode executes only allowlisted non-destructive commands and blocks target tasks while the auth gate is closed.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the selected safe command only when true. Default is plan-only.' },
          write: { type: 'boolean', description: 'Persist the task result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path for write mode. Defaults to operator/agent-task-latest.json.' },
          task: { type: 'string', enum: ['auto', 'search', 'observe', 'inspect', 'analyze', 'scrape', 'operate', 'screenshot', 'diagnose', 'crawl', 'links', 'existing-tab', 'public-crawl', 'auth-proof'] },
          targetDir: { type: 'string' },
          query: { type: 'string' },
          provider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          searchProviders: { type: 'string', description: 'Comma-separated public search fallback providers, for example brave,google,duckduckgo.' },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          matchOrigin: { type: 'string' },
          matchPath: { type: 'string' },
          tabIndex: { type: 'number' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          chromeExtensionPrepared: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_status',
      title: 'Secure Browser Agent Task Status',
      description: 'Read a saved agent-task result from runs/ and return compact low-token status without rerunning browser work.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved agent-task JSON path. Defaults to operator/agent-task-latest.json.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for refresh/run recommendations.' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_watch',
      title: 'Secure Browser Agent Task Watch',
      description: 'One safe low-token watch step for saved agent-task results. Plan mode only reads status; run mode executes only the saved safe agent-task refresh/run command.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the safe recommended agent-task command only when true. Default is status-only plan.' },
          in: { type: 'string', description: 'runs/-relative saved agent-task JSON path. Defaults to operator/agent-task-latest.json.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for refresh/run recommendations.' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_loop',
      title: 'Secure Browser Agent Task Loop',
      description: 'Bounded low-token polling loop for saved agent-task results. Run mode executes safe agent-task-watch steps only when the saved task is missing, stale, parse-broken, or pending execution.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string' },
          iterations: { type: 'number' },
          intervalMs: { type: 'number' },
          statusOut: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for refresh/run recommendations.' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_watch_start',
      title: 'Secure Browser Agent Task Watch Start',
      description: 'Plan or start a detached one-shot agent-task-watch process. Run mode requires operatorOk: OK and writes pid/log files under runs/.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          operatorOk: { type: 'string' },
          force: { type: 'boolean' },
          in: { type: 'string' },
          logPath: { type: 'string' },
          pidPath: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for watch commands.' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_task_watch_status',
      title: 'Secure Browser Agent Task Watch Status',
      description: 'Read detached agent-task-watch pid/log state and the current saved agent-task status without starting browser work.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string' },
          logPath: { type: 'string' },
          pidPath: { type: 'string' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation for refresh/start commands.' },
          maxLogLines: { type: 'number' },
          staleAfterSeconds: { type: 'number' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_loop_step',
      title: 'Secure Browser Agent Loop Step',
      description: 'Plan or run one safe agent-loop step. Execution is limited to the monitor-only auth watch command; browser opening, capture start, and background starts are refused.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'When true, execute the allowed monitor-only command. Default is plan-only.' },
          write: { type: 'boolean', description: 'Write the step result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path for write mode.' },
          timeoutMs: { type: 'number', description: 'Runner timeout for the monitor-only child command.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for short monitor-only probes.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for short monitor-only probes.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_loop_step_status',
      title: 'Secure Browser Agent Loop Step Status',
      description: 'Read-only summary of the last saved agent-loop-step result under runs/. It reports freshness, execution state, and safety flags without returning child stdout text.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved agent-loop-step JSON path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved results.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional timeout override to embed in returned run command.' },
          monitorIntervalMs: { type: 'number', description: 'Optional interval override to embed in returned run command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_step',
      title: 'Secure Browser Agent Proof Step',
      description: 'Plan or run one post-login proof step for regular Chrome handoff. Plan mode is read-only; capture-capable run mode requires operatorOk=OK and executes only no-open resume-capture after saved auth is ready; completion audit remains read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the selected proof continuation only when true. Capture-capable continuations also require operatorOk exactly OK.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run=true and the selected continuation may start capture.' },
          write: { type: 'boolean', description: 'Write the step result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path for write mode.' },
          targetDir: { type: 'string', description: 'Target pack directory. Defaults from objective-completion-audit.' },
          handoff: { type: 'string', description: 'Target handoff JSON filename. Defaults to operator-handoff.json.' },
          timeoutMs: { type: 'number', description: 'Runner timeout for the selected proof continuation.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for short monitor probes.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for short monitor probes.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_step_start',
      title: 'Secure Browser Agent Proof Step Start',
      description: 'Plan or start a detached post-login proof step. Run mode requires operatorOk: OK and starts only when the selected proof step is no-open and allowed now.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          operatorOk: { type: 'string' },
          force: { type: 'boolean' },
          out: { type: 'string', description: 'runs/-relative saved agent-proof-step JSON path.' },
          logPath: { type: 'string', description: 'runs/-relative log path.' },
          pidPath: { type: 'string', description: 'runs/-relative pid path.' },
          targetDir: { type: 'string' },
          handoff: { type: 'string' },
          timeoutMs: { type: 'number' },
          monitorTimeoutMs: { type: 'number' },
          monitorIntervalMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_proof_step_status',
      title: 'Secure Browser Agent Proof Step Status',
      description: 'Read-only detached proof-step status. It reports pid/log state and the saved proof-step JSON without opening Chrome, reading browser storage, or returning page content.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved agent-proof-step JSON path.' },
          logPath: { type: 'string', description: 'runs/-relative log path.' },
          pidPath: { type: 'string', description: 'runs/-relative pid path.' },
          maxLogLines: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_control_plan',
      title: 'Secure Browser Agent Chrome Control Plan',
      description: 'Read-only plan for choosing everyday Chrome, target-pack Chrome, or Codex Browser Agent Chrome based on current runtime state and Chrome remote debugging security constraints.',
      inputSchema: {
        type: 'object',
        properties: {
          lane: { type: 'string', enum: ['auto', 'target-pack', 'regular-chrome', 'codex-browser-agent'] },
          mcpObservationIn: { type: 'string', description: 'Saved normalized Chrome MCP observation path relative to runs/.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve operator opt-in for a fresh everyday-Chrome background tab in returned regular Chrome commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL; the value is never read.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_observation',
      title: 'Secure Browser Agent Chrome MCP Observation',
      description: 'Read-only parser that normalizes raw or already-summarized Peekaboo/Chrome DevTools MCP status and list_pages observations into low-token flags for Chrome MCP routing.',
      inputSchema: {
        type: 'object',
        properties: {
          statusText: { type: 'string', description: 'Raw text returned by mcp__peekaboo__.browser action=status.' },
          listPagesText: { type: 'string', description: 'Raw text returned by mcp__peekaboo__.browser action=list_pages.' },
          observedConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Normalized observed connection flag. Prefer this over raw text when page titles or URLs must not enter CLI arguments.' },
          observedTools: { type: 'number', description: 'Normalized observed tool count.' },
          observedPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Normalized list_pages success flag.' },
          observedPageCount: { type: 'number', description: 'Normalized page count without titles or URLs.' },
          observedListPagesTimedOut: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether list_pages timed out.' },
          observedLastError: { type: 'string', description: 'Short sanitized error summary such as Network.enable timed out.' },
          source: { type: 'string', description: 'Short source label for the observation.' },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'], description: 'Regular Chrome intent used when generating follow-up commands.' },
          write: { type: 'boolean', description: 'Persist the normalized secret-free observation under runs/.' },
          out: { type: 'string', description: 'Output path relative to runs/ when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_observation_status',
      title: 'Secure Browser Agent Chrome MCP Observation Status',
      description: 'Read-only status for the latest saved normalized Peekaboo/Chrome DevTools MCP observation, with stale detection and low-token follow-up commands.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'Saved observation path relative to runs/.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold before the saved observation is considered stale.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_status',
      title: 'Secure Browser Agent Chrome MCP Status',
      description: 'Read-only status for using everyday Chrome through Peekaboo/Chrome DevTools MCP without opening tabs, reading cookies, or treating process presence as a proved backend.',
      inputSchema: {
        type: 'object',
        properties: {
          observedConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional externally observed browser tool status from Peekaboo/Chrome DevTools MCP.' },
          observedTools: { type: 'number', description: 'Optional externally observed tool count.' },
          observedPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether list_pages has succeeded for this MCP connection.' },
          observedPageCount: { type: 'number', description: 'Optional page count from a successful list_pages observation.' },
          observedLastError: { type: 'string', description: 'Short error text from the latest list_pages attempt, if any.' },
          observedSource: { type: 'string', description: 'Short source label for the observed status.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_handoff',
      title: 'Secure Browser Agent Chrome MCP Handoff',
      description: 'Read-only handoff for using the connected Peekaboo/Chrome DevTools MCP lane: next safe tool call, allowed browser actions, and security constraints for everyday Chrome tabs.',
      inputSchema: {
        type: 'object',
        properties: {
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional externally observed Chrome DevTools MCP status.' },
          chromeMcpTools: { type: 'number', description: 'Optional externally observed Chrome DevTools MCP tool count.' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether list_pages has succeeded for this MCP connection.' },
          chromeMcpPageCount: { type: 'number', description: 'Optional page count from a successful list_pages observation.' },
          chromeMcpLastError: { type: 'string', description: 'Short error text from the latest list_pages attempt, if any.' },
          chromeMcpSource: { type: 'string', description: 'Short source label for the observed Chrome MCP status.' },
          mcpObservationIn: { type: 'string', description: 'Saved normalized Chrome MCP observation path relative to runs/.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_timeout_plan',
      title: 'Secure Browser Agent Chrome MCP Timeout Plan',
      description: 'Read-only diagnostic plan for Chrome DevTools MCP list_pages timeouts: duplicate MCP signals, safe fallback commands, and manual cleanup guidance.',
      inputSchema: {
        type: 'object',
        properties: {
          observedConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          observedTools: { type: 'number' },
          observedPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          observedPageCount: { type: 'number' },
          observedLastError: { type: 'string' },
          observedSource: { type: 'string' },
          ownerLimit: { type: 'number' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve operator opt-in for a fresh everyday-Chrome background tab in generated regular-chrome-use commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL; the value is never read by this tool.' },
          write: { type: 'boolean', description: 'Persist the timeout plan under runs/.' },
          out: { type: 'string', description: 'Output path relative to runs/ when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_timeout_plan_status',
      title: 'Secure Browser Agent Chrome MCP Timeout Plan Status',
      description: 'Read-only status for the saved Chrome MCP timeout recovery handoff under runs/ without rescanning processes.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'Input path relative to runs/. Defaults to operator/chrome-mcp-timeout-plan-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve operator opt-in for a fresh everyday-Chrome background tab in regenerated status/refresh commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL; the value is never read by this tool.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_autostart_plan',
      title: 'Secure Browser Agent Chrome MCP Autostart Plan',
      description: 'Safe LaunchAgent plan for keeping Chrome DevTools MCP available. It can write a plist and JSON under runs/, but never loads launchd, starts MCP, opens Chrome, reads browser storage, or returns page content.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the LaunchAgent plist and plan JSON under runs/ only. Does not install or load it.' },
          out: { type: 'string', description: 'Output JSON path relative to runs/ when write is true.' },
          label: { type: 'string', description: 'LaunchAgent label. Defaults to local.secure-browser-agent.chrome-devtools-mcp.' },
          browserUrl: { type: 'string', description: 'Chrome DevTools URL passed to chrome-devtools-mcp --browserUrl. Defaults to http://127.0.0.1:9223.' },
          headless: { type: 'string', enum: ['yes', 'no'], description: 'Whether to add --headless to the planned MCP command.' },
          packageSpec: { type: 'string', description: 'npm package spec. Defaults to chrome-devtools-mcp@latest.' },
          plist: { type: 'string', description: 'Plist path relative to runs/. Defaults under operator/launchd/.' },
          installPath: { type: 'string', description: 'Operator install target path, usually ~/Library/LaunchAgents/<label>.plist.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_mcp_autostart_plan_status',
      title: 'Secure Browser Agent Chrome MCP Autostart Plan Status',
      description: 'Read-only status for the saved Chrome DevTools MCP LaunchAgent plan. It checks saved files only and does not run launchctl.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'Input JSON path relative to runs/. Defaults to operator/chrome-mcp-autostart-plan-latest.json.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_regular_chrome_use',
      title: 'Secure Browser Agent Regular Chrome Use',
      description: 'Read-only plan for using the operator everyday Chrome safely: Chrome MCP existing-tab lane when proved, otherwise gated extension resume without direct default-profile CDP.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          statusText: { type: 'string', description: 'Raw Chrome MCP status output to parse into connection flags.' },
          listPagesText: { type: 'string', description: 'Raw Chrome MCP list_pages output to parse into page-list readiness flags.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to return a background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name that will contain the operator-provided URL for a fresh background tab; the value is never read by this tool.' },
          chromeExtensionPrepared: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Codex Chrome Extension prerequisite readiness to avoid live helper probes.' },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Codex Chrome Extension backend availability.' },
          chromeExtensionBackendLastError: { type: 'string', description: 'Optional observed Codex Chrome Extension backend error, for example Transport closed.' },
          chromeExtensionWindowRetryAttempted: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Set yes after opening the selected Chrome profile window and retrying the extension backend once.' },
          appleEventsActiveTabObserved: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome Apple Events active-tab metadata availability.' },
          appleEventsJavascriptAllowed: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome Apple Events JavaScript permission state.' },
          pluginDir: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_regular_chrome_refresh',
      title: 'Secure Browser Agent Regular Chrome Refresh',
      description: 'Refreshes the low-token everyday-Chrome decision by running the safe Apple Events metadata diagnostic and writing both status files under runs/.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          appleEventsOut: { type: 'string', description: 'runs/-relative output path for Chrome Apple Events status.' },
          out: { type: 'string', description: 'runs/-relative output path for the regular Chrome use decision.' },
          statusText: { type: 'string', description: 'Optional raw Chrome MCP status output to parse into connection flags.' },
          listPagesText: { type: 'string', description: 'Optional raw Chrome MCP list_pages output to parse into page-list readiness flags.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpTools: { type: 'number' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeMcpPageCount: { type: 'number' },
          chromeMcpLastError: { type: 'string' },
          chromeMcpSource: { type: 'string' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in for a fresh everyday-Chrome background tab.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          chromeExtensionPrepared: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          chromeExtensionBackendLastError: { type: 'string' },
          chromeExtensionWindowRetryAttempted: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          pluginDir: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_regular_chrome_status',
      title: 'Secure Browser Agent Regular Chrome Status',
      description: 'Reads the saved everyday-Chrome decision under runs/ without touching Chrome or browser storage.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved regular Chrome use decision.' },
          appleEventsIn: { type: 'string', description: 'runs/-relative saved Apple Events status.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in in generated refresh/watch commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_regular_chrome_watch',
      title: 'Secure Browser Agent Regular Chrome Watch',
      description: 'Plans or runs one guarded refresh step for saved everyday-Chrome readiness when the saved status is missing, stale, or broken.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          force: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative saved regular Chrome use decision.' },
          appleEventsIn: { type: 'string', description: 'runs/-relative saved Apple Events status.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in when a guarded refresh is needed.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          staleAfterSeconds: { type: 'number' },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_apple_events_status',
      title: 'Secure Browser Agent Chrome Apple Events Status',
      description: 'Read-only diagnostic for macOS Google Chrome Apple Events: active-tab URL/title metadata availability and JavaScript-from-Apple-Events permission without returning title text or full URLs.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for the monitor-auth command.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for the monitor-auth command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_apple_events_enable_plan',
      title: 'Secure Browser Agent Chrome Apple Events Enable Plan',
      description: 'Read-only plan for enabling Chrome JavaScript from Apple Events and rechecking the active-tab outline lane. Does not change Chrome settings or open Chrome.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for the monitor-auth command.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for the monitor-auth command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_apple_events_outline',
      title: 'Secure Browser Agent Chrome Apple Events Outline',
      description: 'Operator-gated active-tab page structure outline through macOS Chrome Apple Events. Requires run=true and operatorOk=OK before executing JavaScript; returns counts and redacted URL metadata, not page text.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the outline probe only when true.' },
          operatorOk: { type: 'string', description: 'Must be OK when run is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_browser_route',
      title: 'Secure Browser Agent Browser Route',
      description: 'Read-only routing decision for search, analysis, scrape, operate, existing Chrome tabs, public crawl acceleration, or Selenium compatibility work.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['auto', 'search', 'analyze', 'scrape', 'operate', 'existing-tab', 'authenticated-scrape', 'public-crawl', 'compatibility-test'] },
          lane: { type: 'string', enum: ['auto', 'target-pack', 'regular-chrome', 'codex-browser-agent'] },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional externally observed Chrome DevTools MCP status for everyday Chrome existing-tab routing.' },
          chromeMcpTools: { type: 'number', description: 'Optional externally observed Chrome DevTools MCP tool count.' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether list_pages has succeeded for this MCP connection.' },
          chromeMcpPageCount: { type: 'number', description: 'Optional page count from a successful list_pages observation.' },
          chromeMcpLastError: { type: 'string', description: 'Short error text from the latest list_pages attempt, if any.' },
          chromeMcpSource: { type: 'string', description: 'Short source label for the observed Chrome MCP status.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Allow a connected MCP backend to route to a fresh background new_page template without listing existing tabs.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_status',
      title: 'Secure Browser Agent Codex Chrome Extension Status',
      description: 'Read-only status for controlling the user everyday Chrome through the Codex Chrome Extension: Chrome running, selected profile extension state, native host state, and safe next action.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_handoff',
      title: 'Secure Browser Agent Codex Chrome Extension Handoff',
      description: 'Read-only operator handoff for everyday Chrome control: current extension readiness, user permission requirement, and the exact open-selected-profile command to run only after approval.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          write: { type: 'boolean', description: 'Write the handoff JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative handoff path. Defaults to operator/chrome-extension-handoff.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_resume',
      title: 'Secure Browser Agent Codex Chrome Extension Resume',
      description: 'Permission-gated everyday Chrome resume path. Plans by default; only opens the selected Chrome profile when run is true and operatorOk is exactly OK.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          run: { type: 'boolean', description: 'Attempt the open-and-refresh flow only with operatorOk exactly OK.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK to open the selected everyday Chrome profile.' },
          dryRun: { type: 'boolean', description: 'Exercise the approved path without opening Chrome.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_troubleshoot',
      title: 'Secure Browser Agent Codex Chrome Extension Troubleshoot',
      description: 'Read-only diagnostic for Codex Chrome Extension backend failures: classifies the observed backend error and returns gated retry commands without opening Chrome or reading browser storage.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          backendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Observed extension backend availability from a live Chrome plugin check.' },
          backendLastError: { type: 'string', description: 'Short backend error text such as Browser is not available: extension.' },
          profileWindowRetryAttempted: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether the selected Chrome profile window was already opened and the backend probe still failed.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_backend_check_plan',
      title: 'Secure Browser Agent Codex Chrome Extension Backend Check Plan',
      description: 'Read-only plan for probing the Codex Chrome Extension backend through node_repl openTabs(), then routing success to claim-plan or failure to troubleshoot without opening Chrome or reading browser storage.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          backendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional previously observed extension backend availability.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_chrome_extension_claim_plan',
      title: 'Secure Browser Agent Codex Chrome Extension Claim Plan',
      description: 'Read-only plan for listing and claiming an existing user Chrome tab through the Codex Chrome Extension backend. Compact output stays low-token; structured content includes guarded node_repl snippets.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginDir: { type: 'string', description: 'Optional Codex Chrome plugin directory override.' },
          backendReady: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether the Codex Chrome Extension backend has already been proved available.' },
          intent: { type: 'string', enum: ['inspect', 'operate', 'screenshot', 'console', 'network'] },
          matchTitle: { type: 'string', description: 'Optional substring for selecting one of the tabs returned by openTabs().' },
          matchUrl: { type: 'string', description: 'Optional URL substring for selecting one of the tabs returned by openTabs().' },
          matchOrigin: { type: 'string', description: 'Optional exact redacted origin from openTabs safe metadata, preferred over raw URL matching.' },
          matchPath: { type: 'string', description: 'Optional exact redacted path from openTabs safe metadata, preferred over raw URL matching.' },
          tabIndex: { type: 'number', description: 'Optional index from the current openTabs() result.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_profile_status',
      title: 'Secure Browser Agent Profile Status',
      description: 'Read dedicated browser profile metadata without reading cookie values or secrets.',
      inputSchema: {
        type: 'object',
        properties: {
          profile: { type: 'string', description: 'Profile name. Defaults to policy default profile.' },
          policy: { type: 'string', description: 'Optional policy JSON path.' }
        }
      }
    },
    {
      name: 'sba_target_status',
      title: 'Secure Browser Agent Target Status',
      description: 'Inspect a target pack and its dedicated profile metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_audit',
      title: 'Secure Browser Agent Target Audit',
      description: 'Audit a target pack before authenticated automation: policy scope, profile metadata, permissions, daemon/autostart state, and config secret scan.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_runtime_audit',
      title: 'Secure Browser Agent Runtime Audit',
      description: 'Read-only audit of local browser-agent runtime state: Peekaboo/MCP duplicates, agent-browser sessions, Chrome DevTools browser, and cleanup command suggestions.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write JSON runtime audit under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to runtime/runtime-audit.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_runtime_cleanup_plan',
      title: 'Secure Browser Agent Runtime Cleanup Plan',
      description: 'Read-only cleanup plan that groups duplicate MCP children by parent Codex/Claude session and lists safe manual review steps before any destructive action.',
      inputSchema: {
        type: 'object',
        properties: {
          ownerLimit: { type: 'number', description: 'Maximum parent sessions to list for manual review.' },
          write: { type: 'boolean', description: 'Write JSON runtime cleanup plan under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to runtime/runtime-cleanup-plan.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_run_gate_audit',
      title: 'Secure Browser Agent Run Gate Audit',
      description: 'Read-only inventory of CLI/MCP run-capable surfaces, separating agent-safe monitor commands, operator-ok gated wrappers, and direct operator-only browser/capture commands.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_compact_command_audit',
      title: 'Secure Browser Agent Compact Command Audit',
      description: 'Read-only audit of compact handoff command lines, checking that browser/capture/background commands have adjacent risk and operator/unattended flags.',
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: [...COMPACT_COMMAND_AUDIT_SOURCES, 'all'],
            description: 'Compact handoff source to audit. Defaults to operator-pack.'
          },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed before auditing operator-pack.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed before auditing operator-pack.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_completion_proof_bundle',
      title: 'Secure Browser Agent Completion Proof Bundle',
      description: 'Read-only one-shot bundle of readiness, strict objective completion, proof-gate, target approval preflight, and target proof plan state.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Approved real-external proof candidate. Defaults to github.' },
          includeCompactCommandAudit: { type: 'boolean', description: 'Also run compact-command-audit --source all while building the bundle. Defaults to false to keep the status bundle fast.' },
          write: { type: 'boolean', description: 'Write the bundle JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/completion-proof-bundle-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_completion_proof_bundle_status',
      title: 'Secure Browser Agent Completion Proof Bundle Status',
      description: 'Read-only status for the saved completion proof bundle under runs/, including freshness and refresh command.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved bundle path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved bundle status.' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Fallback candidate for refresh command when no saved bundle exists.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_completion_proof_bundle_watch',
      title: 'Secure Browser Agent Completion Proof Bundle Watch',
      description: 'Executable safe watcher that refreshes the saved completion proof bundle only when it is missing, stale, or parse-broken. It never opens Chrome or starts capture.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Actually refresh when the saved bundle is missing, stale, or parse-broken.' },
          in: { type: 'string', description: 'runs/-relative saved bundle path.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved bundle status.' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'], description: 'Fallback candidate for refresh command when no saved bundle exists.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_source_audit',
      title: 'Secure Browser Agent Source Audit',
      description: 'Inventory local reference clones and installed provider signals used to justify browser backend choices.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_agent_browser_doctor',
      title: 'Secure Browser Agent agent-browser Doctor',
      description: 'Read-only agent-browser readiness check: CLI availability, Chrome for Testing cache, safe install plan, and provider follow-up commands.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_lightpanda_doctor',
      title: 'Secure Browser Agent Lightpanda Doctor',
      description: 'Read-only Lightpanda readiness check: configured binary, local source clone, build tools, telemetry posture, install plan, and benchmark command.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_provider_doctor_status',
      title: 'Secure Browser Agent Provider Doctor Status',
      description: 'Read-only compact rollup of provider recommendation, Lightpanda doctor, Playwright doctor, and Selenium doctor for low-token backend health checks.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_playwright_doctor',
      title: 'Secure Browser Agent Playwright Doctor',
      description: 'Read-only Playwright readiness check: playwright-core package, Chrome for Testing cache, storageState boundary, install plan, and public smoke command.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_lightpanda_decision',
      title: 'Secure Browser Agent Lightpanda Decision',
      description: 'Write or preview a secret-free Lightpanda public-crawl adopt/reject decision from doctor evidence.',
      inputSchema: {
        type: 'object',
        properties: {
          decision: { type: 'string', enum: ['reject', 'adopt'] },
          reason: { type: 'string' },
          write: { type: 'boolean', description: 'Write JSON decision proof under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to provider-benchmarks/lightpanda-decision.json when write is true.' },
          force: { type: 'boolean', description: 'Allow adopt without a benchmark-ready executable. Prefer benchmark proof instead.' }
        }
      }
    },
    {
      name: 'sba_selenium_doctor',
      title: 'Secure Browser Agent Selenium Doctor',
      description: 'Read-only Selenium/WebDriver BiDi readiness check: selenium-webdriver package, browser drivers, Selenium Server/Grid, Java, Node, and local smoke readiness.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_audit',
      title: 'Secure Browser Agent Secret Audit',
      description: 'Read-only 1Password/headless secret boundary audit. Reports configured modes and process signals without reading secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_setup_plan',
      title: 'Secure Browser Agent Secret Setup Plan',
      description: 'Read-only operator plan for configuring 1Password Service Account, Connect, or local desktop secret access without exposing secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['service-account', 'connect', 'local-desktop'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_run_plan',
      title: 'Secure Browser Agent Secret Run Plan',
      description: 'Read-only op run wrapper plan for running selected SBA commands with 1Password secret injection while keeping browser login state in target profiles.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['service-account', 'connect'] },
          command: { type: 'string', enum: ['control-status', 'secret-audit', 'target-login-capture', 'target-proof-capture'] },
          targetDir: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_run_select',
      title: 'Secure Browser Agent Secret Run Selector',
      description: 'Read-only selector for choosing the safest currently available 1Password headless or desktop secret mode and the matching op-run command.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: ['control-status', 'secret-audit', 'target-login-capture', 'target-proof-capture'] },
          targetDir: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_env_handoff',
      title: 'Secure Browser Agent Secret Environment Handoff',
      description: 'Read-only 1Password Environments handoff for non-browser secrets: MCP approval steps, optional local .env mount plan, and op-run boundaries without reading secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['environment-local-env', 'service-account', 'connect', 'local-desktop'] },
          environmentName: { type: 'string' },
          mountPath: { type: 'string' },
          write: { type: 'boolean', description: 'Write the handoff JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative handoff path. Defaults to operator/secret-env-handoff.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_env_handoff_status',
      title: 'Secure Browser Agent Secret Environment Handoff Status',
      description: 'Read saved 1Password Environments handoff JSON under runs/ without recomputing secret posture or reading secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative handoff path. Defaults to operator/secret-env-handoff.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_secret_env_handoff_watch',
      title: 'Secure Browser Agent Secret Environment Handoff Watch',
      description: 'Guarded one-step refresh for saved 1Password Environments handoff JSON; writes only under runs/ and never reads secret values.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative handoff path. Defaults to operator/secret-env-handoff.json.' },
          out: { type: 'string', description: 'runs/-relative handoff path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number' },
          mode: { type: 'string', enum: ['environment-local-env', 'service-account', 'connect', 'local-desktop'] },
          environmentName: { type: 'string' },
          mountPath: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_providers',
      title: 'Secure Browser Agent Provider Report',
      description: 'Read-only provider recommendation and local availability for Chrome CDP, secure-browser-agent MCP, Chrome DevTools MCP, Playwright, Lightpanda, and Selenium.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_backend_matrix',
      title: 'Secure Browser Agent Backend Matrix',
      description: 'Read-only task-by-backend decision matrix for search, analysis, scrape, operate, everyday Chrome, authenticated scraping, public crawling, and compatibility lanes.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Persist the matrix JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Default: operator/backend-matrix-latest.json.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in for a fresh everyday-Chrome background tab in existing-tab route and selector commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_backend_matrix_status',
      title: 'Secure Browser Agent Backend Matrix Status',
      description: 'Read the latest saved backend matrix without recomputing provider, Chrome, or route status.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved matrix JSON. Default: operator/backend-matrix-latest.json.' },
          mcpObservationIn: { type: 'string', description: 'runs/-relative saved normalized Chrome MCP observation.' },
          allowNewBackgroundTab: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Preserve the operator opt-in in generated refresh/status/existing-tab commands.' },
          newBackgroundUrlEnv: { type: 'string', description: 'Environment variable name for the operator-provided background tab URL; the value is never read.' },
          staleAfterSeconds: { type: 'number', description: 'Freshness threshold for the saved matrix. Default: 900.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_provider_benchmark',
      title: 'Secure Browser Agent Provider Benchmark',
      description: 'Benchmark public or synthetic pages across provider candidates and optionally write a proof JSON under runs/provider-benchmarks.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Optional public http(s) URL. Omit for synthetic data fixture.' },
          quick: { type: 'boolean', description: 'Only benchmark direct CDP cold and daemon modes.' },
          iterations: { type: 'number' },
          rows: { type: 'number', description: 'Synthetic row count when url is omitted.' },
          write: { type: 'boolean', description: 'Write JSON benchmark proof under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to provider-benchmarks/latest.json when write is true.' }
        }
      }
    },
    {
      name: 'sba_readiness_audit',
      title: 'Secure Browser Agent Readiness Audit',
      description: 'Map the full browser-agent objective to current proof, partial coverage, manual validation, and missing implementation.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_completion_audit',
      title: 'Secure Browser Agent Objective Completion Audit',
      description: 'Strict completion gate for the full browser-agent objective. Reports complete only when every readiness criterion is proved.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Persist the completion audit JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Default: operator/objective-completion-audit-latest.json.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_completion_audit_status',
      title: 'Secure Browser Agent Objective Completion Audit Status',
      description: 'Read a saved objective-completion-audit JSON without recomputing browser state. Does not open Chrome, start capture, read browser storage, or read secrets.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved objective completion audit JSON path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved audits.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_completion_audit_watch',
      title: 'Secure Browser Agent Objective Completion Audit Watch',
      description: 'Refresh a missing, stale, or parse-broken saved objective completion audit only when run is true. It remains no-browser and no-secret.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative saved objective completion audit JSON path.' },
          out: { type: 'string', description: 'runs/-relative output path.' },
          staleAfterSeconds: { type: 'number', description: 'Age threshold for stale saved audits.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_safe_command',
      title: 'Secure Browser Agent Objective Safe Command',
      description: 'Return the single safest current objective command, preferring monitor-only auth polling while proof capture is blocked on human login.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Persist the safe-command handoff JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Default: operator/objective-safe-command-latest.json.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in target-handoff-resume-watch commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in target-handoff-resume-watch commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_proof_pipeline',
      title: 'Secure Browser Agent Objective Proof Pipeline',
      description: 'Read-only low-token plan for the remaining real external auth proof: monitor auth now, open login when needed, and wait-auth-then-capture proof after login.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for the monitor-auth command.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for the monitor-auth command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_handoff',
      title: 'Secure Browser Agent Objective Handoff',
      description: 'Operator-safe handoff for the current objective: primary action, credential rules, completion audit, and next-action commands.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the handoff JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative handoff path. Defaults to objective-handoff.json when write is true.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in manual watch and objective-next commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in manual watch and objective-next commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_operator_pack',
      title: 'Secure Browser Agent Operator Pack',
      description: 'Generate one operator handoff bundle: control status, everyday Chrome extension readiness, objective status, proof gate status/watch, and objective handoff summaries.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the operator pack and child status JSON files under runs/operator/.' },
          out: { type: 'string', description: 'runs/-relative operator pack path. Defaults to operator/operator-pack-latest.json when write is true.' },
          agentLoopStepStatusIn: { type: 'string', description: 'runs/-relative saved agent loop step status path. Defaults to operator/agent-loop-step-latest.json.' },
          agentLoopStepTimeoutMs: { type: 'number', description: 'Timeout to embed in the saved agent loop run command. Defaults to 300000.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in low-token agent loop and handoff commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in low-token agent loop and handoff commands.' },
          chromeMcpStatusText: { type: 'string', description: 'Raw Chrome DevTools MCP status output to normalize into low-token flags.' },
          chromeMcpListPagesText: { type: 'string', description: 'Raw Chrome DevTools MCP list_pages output to normalize into low-token flags.' },
          chromeMcpConnected: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome DevTools MCP connection state.' },
          chromeMcpTools: { type: 'number', description: 'Optional observed Chrome DevTools MCP tool count.' },
          chromeMcpPageListOk: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether Chrome DevTools MCP list_pages succeeded.' },
          chromeMcpPageCount: { type: 'number', description: 'Optional page count from list_pages.' },
          chromeMcpLastError: { type: 'string', description: 'Short latest Chrome DevTools MCP list_pages error.' },
          chromeMcpSource: { type: 'string', description: 'Source label for the observed Chrome MCP result.' },
          chromeExtensionBackendAvailable: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Codex Chrome Extension backend availability from a live node_repl probe.' },
          chromeExtensionBackendLastError: { type: 'string', description: 'Short latest Codex Chrome Extension backend error.' },
          chromeExtensionWindowRetryAttempted: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Whether the selected everyday Chrome profile was already opened before a failed extension backend retry.' },
          appleEventsActiveTabObserved: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome Apple Events active-tab metadata availability.' },
          appleEventsJavascriptAllowed: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Optional observed Chrome Apple Events JavaScript permission state.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_operator_runbook',
      title: 'Secure Browser Agent Operator Runbook',
      description: 'Generate a low-token or markdown runbook for the current proof gate: status, Chrome retry, 1Password boundary, proof watch, primary proof command, and completion audit.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the runbook under runs/.' },
          out: { type: 'string', description: 'runs/-relative runbook path. Defaults to operator/operator-runbook.md when write is true.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in low-token operator pack and agent loop commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in low-token operator pack and agent loop commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_operator_pack_status',
      title: 'Secure Browser Agent Operator Pack Status',
      description: 'Read the saved JSON operator pack without recomputing children, opening Chrome, starting capture, or reading browser storage.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved JSON operator pack. Defaults to operator/operator-pack-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_operator_runbook_status',
      title: 'Secure Browser Agent Operator Runbook Status',
      description: 'Read the saved JSON operator runbook without recomputing operator pack, opening Chrome, starting capture, or reading browser storage.',
	      inputSchema: {
	        type: 'object',
	        properties: {
	          in: { type: 'string', description: 'runs/-relative saved JSON runbook. Defaults to operator/operator-runbook-latest.json.' },
	          staleAfterSeconds: { type: 'number' },
	          objectiveCompletionAuditIn: { type: 'string', description: 'runs/-relative saved objective completion audit JSON. Defaults to operator/objective-completion-audit-latest.json.' },
	          objectiveCompletionAuditStaleAfterSeconds: { type: 'number', description: 'Freshness window for the saved objective completion audit used to promote the runbook safe-next command.' },
	          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
	        }
	      }
    },
    {
      name: 'sba_operator_runbook_watch',
      title: 'Secure Browser Agent Operator Runbook Watch',
      description: 'Refresh the saved JSON operator runbook only when missing, stale, or parse-broken. It does not open Chrome or start capture.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative saved JSON runbook. Defaults to operator/operator-runbook-latest.json.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to input path.' },
          staleAfterSeconds: { type: 'number' },
          monitorTimeoutMs: { type: 'number' },
          monitorIntervalMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_next',
      title: 'Secure Browser Agent Objective Next',
      description: 'Read-only next-action selector across the full objective: real external authenticated proof and Lightpanda public benchmark.',
      inputSchema: {
        type: 'object',
        properties: {
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override to embed in manual watch commands.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override to embed in manual watch commands.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_status',
      title: 'Secure Browser Agent Objective Status',
      description: 'Low-token objective status: completion gate, current resume plan, saved resume, and operator-ready auth preflight when applicable.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the status JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative status output path. Defaults to operator/objective-status-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_proof_gate_status',
      title: 'Secure Browser Agent Proof Gate Status',
      description: 'Read-only proof-gate status that combines objective status and target-proof-next into one low-token external-auth proof view.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the status JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative status output path. Defaults to operator/proof-gate-status-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_proof_gate_watch',
      title: 'Secure Browser Agent Proof Gate Watch',
      description: 'Poll proof-gate status without starting proof capture, optionally writing a low-token watch JSON under runs/.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the watch JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative watch output path. Defaults to operator/proof-gate-watch-status.json when write is true.' },
          timeoutMs: { type: 'number' },
          intervalMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_login_handoff_status',
      title: 'Secure Browser Agent Login Handoff Status',
      description: 'Very small read-only status for login handoff: whether to monitor, open login, or wait-auth-then-capture without reading secrets or starting work.',
      inputSchema: {
        type: 'object',
        properties: {
          write: { type: 'boolean', description: 'Write the status JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative status output path. Defaults to operator/login-handoff-status-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_background_monitor_plan',
      title: 'Secure Browser Agent Background Monitor Plan',
      description: 'Read-only plan for running proof-gate-watch as a background monitor that writes status JSON without opening browsers or starting capture.',
      inputSchema: {
        type: 'object',
        properties: {
          timeoutMs: { type: 'number' },
          intervalMs: { type: 'number' },
          statusOut: { type: 'string', description: 'runs/-relative proof-gate watch status path.' },
          logPath: { type: 'string', description: 'Log path for the suggested background shell command.' },
          pidPath: { type: 'string', description: 'PID path for the suggested background shell command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_background_proof_capture_plan',
      title: 'Secure Browser Agent Background Proof Capture Plan',
      description: 'Read-only plan for monitor-only auth polling plus a no-open background wait-auth proof capture command after the operator completes login.',
      inputSchema: {
        type: 'object',
        properties: {
          timeoutMs: { type: 'number' },
          intervalMs: { type: 'number' },
          monitorLogPath: { type: 'string', description: 'Log path for the suggested background auth monitor command.' },
          monitorPidPath: { type: 'string', description: 'PID path for the suggested background auth monitor command.' },
          captureLogPath: { type: 'string', description: 'Log path for the suggested no-open wait-auth proof capture command.' },
          capturePidPath: { type: 'string', description: 'PID path for the suggested no-open wait-auth proof capture command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_background_proof_capture_status',
      title: 'Secure Browser Agent Background Proof Capture Status',
      description: 'Read-only status for background auth monitor and no-open proof capture jobs: PID liveness, log summaries, and target wait-auth status files without opening browsers or reading secrets.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string', description: 'Optional target pack directory. Defaults to the target discovered from the current background proof capture plan.' },
          maxLogLines: { type: 'number', description: 'Maximum sanitized log tail lines to include in structured content.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_background_proof_capture_start',
      title: 'Secure Browser Agent Background Proof Capture Start',
      description: 'Permission-gated starter for background auth monitor or no-open wait-auth proof capture. Plans by default; run requires operatorOk=OK and never adds --open-login.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['monitor', 'capture'], description: 'monitor starts auth-watch only; capture starts the no-open wait-auth capture command.' },
          run: { type: 'boolean', description: 'Start the detached background process only when true.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run is true.' },
          force: { type: 'boolean', description: 'Allow starting even if an existing PID file appears alive.' },
          timeoutMs: { type: 'number', description: 'Wait-auth timeout for capture mode.' },
          intervalMs: { type: 'number', description: 'Wait-auth polling interval for capture mode.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for monitor mode.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for monitor mode.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_objective_resume',
      title: 'Secure Browser Agent Objective Resume',
      description: 'Plan or run the current primary next action across the full objective. Run mode executes only the structured command selected by objective-next; browser-opening or capture-capable commands require operatorOk=OK.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Execute the selected next command. Omit for read-only plan mode.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run=true and the selected command may open a browser or start capture.' },
          operatorReady: { type: 'boolean', description: 'Assert the operator completed required manual login/input before running an operator-gated handoff capture.' },
          manualCandidate: { type: 'string', description: 'Select a structured manual command candidate by 1-based index or id, for example open-only or login-capture-wait.' },
          waitAuthTimeoutMs: { type: 'number', description: 'When selecting login-capture-wait, add --wait-auth-timeout-ms to the generated command.' },
          waitAuthIntervalMs: { type: 'number', description: 'When selecting login-capture-wait, add --wait-auth-interval-ms to the generated command.' },
          timeoutMs: { type: 'number', description: 'Maximum child command runtime in milliseconds when run=true.' },
          write: { type: 'boolean', description: 'Write the resume result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative resume output path. Defaults to operator/objective-resume-latest.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_benchmark',
      title: 'Secure Browser Agent Target Benchmark',
      description: 'Benchmark target-pack recipes against cold Chrome CDP and reusable background daemon mode after a safe preflight audit.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' },
          recipes: { type: 'string', description: 'Comma-separated recipes such as observe,inspect,crawl-links.' },
          modes: { type: 'string', description: 'Comma-separated modes: cold,daemon.' },
          iterations: { type: 'number' },
          write: { type: 'boolean', description: 'Write JSON benchmark proof under the target pack.' },
          out: { type: 'string', description: 'Target-pack relative output path. Defaults to proof/target-benchmark.json when write is true.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_proof',
      title: 'Secure Browser Agent Target Proof',
      description: 'Build or write a secret-free proof summary for a target pack after authenticated observe/scrape/benchmark runs.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          realExternal: { type: 'boolean' },
          write: { type: 'boolean' },
          outputs: { type: 'string', description: 'Comma-separated output filenames under the pack outputs dir.' },
          benchmarkFile: { type: 'string' },
          requireBenchmark: { type: 'boolean' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_bootstrap_plan',
      title: 'Secure Browser Agent Target Bootstrap Plan',
      description: 'Read-only command plan for creating a real external authenticated target pack and producing accepted proof evidence.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Filesystem-safe target service identifier.' },
          origin: { type: 'string', description: 'Comma-separated real external origins.' },
          loginUrl: { type: 'string' },
          pageUrl: { type: 'string' },
          query: { type: 'string' },
          permissions: { type: 'string', description: 'Comma-separated permissions such as clipboard,downloads.' },
          searchProvider: { type: 'string', enum: ['duckduckgo', 'brave', 'google'] },
          strict: { type: 'boolean', description: 'Return ready=false in structured content when required inputs are missing; MCP calls do not exit.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_candidate_plan',
      title: 'Secure Browser Agent Target Candidate Plan',
      description: 'Read-only candidate list for choosing a real external authenticated service target and generating exact bootstrap-plan commands.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_candidate_plan_status',
      title: 'Secure Browser Agent Target Candidate Plan Status',
      description: 'Read saved real-external target candidate plan JSON under runs/ without recomputing candidate commands.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative candidate plan path. Defaults to operator/target-candidate-plan-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_candidate_plan_watch',
      title: 'Secure Browser Agent Target Candidate Plan Watch',
      description: 'Guarded one-step refresh for saved target candidate plan JSON; writes only under runs/ and never opens browser work.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean' },
          in: { type: 'string', description: 'runs/-relative candidate plan path. Defaults to operator/target-candidate-plan-latest.json.' },
          out: { type: 'string', description: 'runs/-relative candidate plan path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_pack',
      title: 'Secure Browser Agent Target Approval Pack',
      description: 'Read-only-by-default approval bundle for a real external authenticated candidate: selected target, safety flags, and exact scaffold/login/proof commands. Write mode saves JSON under runs/.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          write: { type: 'boolean' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/target-approval-<candidate>.json when write is true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_status',
      title: 'Secure Browser Agent Target Approval Status',
      description: 'Read-only low-token status for a saved target approval pack, joined with target proof inventory. It does not open Chrome, start capture, read storage, or return page content.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          in: { type: 'string', description: 'runs/-relative approval pack path. Defaults to operator/target-approval-<candidate>.json.' },
          realExternal: { type: 'boolean', description: 'Assert the saved target is operator-approved real external for inventory gating.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_preflight',
      title: 'Secure Browser Agent Target Approval Preflight',
      description: 'Read-only real-external preflight for the selected approved target. It avoids default inventory ambiguity, separates agent-safe from operator-ok proof commands, and emits saved resume plan/status/watch handoffs.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_resume',
      title: 'Secure Browser Agent Target Approval Resume',
      description: 'Operator-gated wrapper for the current target approval next command. Plans by default; only executes when run=true and operatorOk is exactly OK. Child stdout/stderr text is not returned.',
      inputSchema: {
        type: 'object',
        properties: {
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          realExternal: { type: 'boolean', description: 'Assert the saved target is operator-approved real external for inventory gating.' },
          run: { type: 'boolean', description: 'Execute the selected next command only with operatorOk exactly OK.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run is true.' },
          write: { type: 'boolean', description: 'Write the resume result JSON under runs/.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to operator/target-approval-resume-latest.json when write is true.' },
          timeoutMs: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_resume_status',
      title: 'Secure Browser Agent Target Approval Resume Status',
      description: 'Read the saved target approval resume plan without opening Chrome, starting capture, reading storage, or returning page content.',
      inputSchema: {
        type: 'object',
        properties: {
          in: { type: 'string', description: 'runs/-relative saved resume JSON. Defaults to operator/target-approval-resume-latest.json.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_approval_resume_watch',
      title: 'Secure Browser Agent Target Approval Resume Watch',
      description: 'Refresh the saved target approval resume plan only when missing, stale, or parse-broken. It never executes the browser-opening resume command.',
      inputSchema: {
        type: 'object',
        properties: {
          run: { type: 'boolean', description: 'Refresh the saved non-executing plan only when needed.' },
          in: { type: 'string', description: 'runs/-relative saved resume JSON. Defaults to operator/target-approval-resume-latest.json.' },
          out: { type: 'string', description: 'runs/-relative output path. Defaults to the input path.' },
          staleAfterSeconds: { type: 'number' },
          candidate: { type: 'string', enum: ['github', 'google-drive', 'notion'] },
          realExternal: { type: 'boolean' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_proof_plan',
      title: 'Secure Browser Agent Target Proof Plan',
      description: 'Read-only operator checklist for producing an accepted real external target proof from a target pack.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          realExternal: { type: 'boolean' },
          strict: { type: 'boolean', description: 'Return proofReady=false in structured content when blockers remain; MCP calls do not exit.' },
          outputs: { type: 'string', description: 'Comma-separated output filenames under the pack outputs dir.' },
          benchmarkFile: { type: 'string' },
          format: { type: 'string', enum: ['json', 'compact'] }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_auth_check',
      title: 'Secure Browser Agent Target Auth Check',
      description: 'Verify a target pack page resolves to a same-origin non-login page without reading cookie values or page text samples.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' },
          cdpPort: { type: 'number', description: 'Use an already-open login browser CDP port for the auth check.' },
          write: { type: 'boolean', description: 'Write proof/auth-check.json under the target pack.' },
          statusOut: { type: 'string', description: 'Write a non-proof auth status JSON under the target outputs dir.' },
          daemon: { type: 'boolean', description: 'Use the target profile CDP daemon.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Use compact for low-token polling text while structuredContent stays complete.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_auth_watch',
      title: 'Secure Browser Agent Target Auth Watch',
      description: 'Poll target auth-check without starting proof capture, updating a non-proof status JSON under target outputs.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          profile: { type: 'string' },
          cdpPort: { type: 'number', description: 'Use an already-open login browser CDP port for auth polling.' },
          statusOut: { type: 'string', description: 'Target outputs/-relative JSON status file updated after each polling attempt.' },
          timeoutMs: { type: 'number' },
          intervalMs: { type: 'number' },
          daemon: { type: 'boolean', description: 'Use the target profile CDP daemon.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Use compact for low-token polling text while structuredContent stays complete.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_proof_capture',
      title: 'Secure Browser Agent Target Proof Capture',
      description: 'Plan or run the post-login real external proof capture sequence: observe, inspect, scrape, benchmark, and secret-free proof write.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          realExternal: { type: 'boolean' },
          run: { type: 'boolean', description: 'Execute the capture sequence. Omit for read-only plan mode.' },
          waitAuth: { type: 'boolean', description: 'When run=true, poll target auth-check until the dedicated profile is authenticated before capture.' },
          authCheckPort: { type: 'number', description: 'Use an already-open login browser CDP port for auth-check polling.' },
          waitAuthTimeoutMs: { type: 'number', description: 'Maximum auth wait time in milliseconds.' },
          waitAuthIntervalMs: { type: 'number', description: 'Polling interval in milliseconds.' },
          waitAuthStatusOut: { type: 'string', description: 'Target outputs/-relative JSON status file updated after each auth wait attempt.' },
          benchmarkFile: { type: 'string' },
          applyPermissions: { type: 'boolean' },
          startDaemon: { type: 'boolean' },
          stopDaemon: { type: 'boolean' },
          completionAudit: { type: 'boolean', description: 'Include the objective completion audit summary after a successful run.' },
          cleanupOnFailure: { type: 'boolean', description: 'Defaults to true. Stop a daemon started by this capture if a later step fails.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_login_capture',
      title: 'Secure Browser Agent Target Login Capture',
      description: 'Open the dedicated headed login profile and then run the wait-auth proof capture sequence. Credentials stay in the browser profile.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          realExternal: { type: 'boolean' },
          dryRun: { type: 'boolean' },
          openOnly: { type: 'boolean', description: 'Open the headed login browser and write a post-login handoff, but do not run capture yet.' },
          handoffOut: { type: 'string', description: 'Target output-dir relative handoff path.' },
          handoffFormat: { type: 'string', enum: ['json', 'markdown'] },
          waitAuthTimeoutMs: { type: 'number', description: 'Maximum auth wait time in milliseconds.' },
          waitAuthIntervalMs: { type: 'number', description: 'Polling interval in milliseconds.' },
          waitAuthStatusOut: { type: 'string', description: 'Target outputs/-relative JSON status file updated after each auth wait attempt. Defaults to wait-auth-status.json.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_run',
      title: 'Secure Browser Agent Target Handoff Run',
      description: 'Plan or run a structured command from a target operator handoff JSON, such as post-login-capture. Shell-only handoffs are not executed.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          command: { type: 'string', description: 'Handoff command id. Defaults to post-login-capture.' },
          out: { type: 'string', description: 'Target output-dir relative path for saving the handoff-run result JSON.' },
          run: { type: 'boolean', description: 'Execute the selected handoff command. Omit for read-only plan mode.' },
          preflightAuth: { type: 'boolean', description: 'Check auth state before running post-login capture. Defaults to true.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_status',
      title: 'Secure Browser Agent Target Handoff Status',
      description: 'Read-only summary of a target operator handoff: available command IDs, synthesized status commands, auth-check port, and recommended next command.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_resume',
      title: 'Secure Browser Agent Target Handoff Resume',
      description: 'Plan or run the safest handoff continuation: check the dedicated login browser auth state first, then run post-login proof capture only when auth is proved.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          out: { type: 'string', description: 'Target output-dir relative path for saving the resume result JSON.' },
          run: { type: 'boolean', description: 'Execute auth-check and, only if authenticated, the post-login capture. Omit for read-only plan mode.' },
          openLogin: { type: 'boolean', description: 'When run=true and auth is not yet proved, open the dedicated headed login browser before waiting.' },
          waitAuth: { type: 'boolean', description: 'When run=true, poll the saved handoff auth-check before capture.' },
          waitAuthTimeoutMs: { type: 'number', description: 'Maximum auth wait time in milliseconds.' },
          waitAuthIntervalMs: { type: 'number', description: 'Polling interval in milliseconds.' },
          waitAuthStatusOut: { type: 'string', description: 'Target outputs/-relative JSON status file updated after each auth wait attempt.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_resume_status',
      title: 'Secure Browser Agent Target Handoff Resume Status',
      description: 'Read-only low-token status for saved handoff resume, wait-auth, auth-watch, and auth-check files without opening browsers or starting capture.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          in: { type: 'string', description: 'Target output-dir relative saved handoff resume JSON. Defaults to handoff-resume-latest.json.' },
          waitAuthStatusOut: { type: 'string', description: 'Target output-dir relative wait-auth status JSON. Defaults to handoff-resume-wait-auth-status.json.' },
          authWatchIn: { type: 'string', description: 'Target output-dir relative auth-watch status JSON. Defaults to auth-watch-status.json.' },
          authCheckIn: { type: 'string', description: 'Target output-dir relative auth-check status JSON. Defaults to auth-check-status.json.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for the recommended monitor-auth command.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for the recommended monitor-auth command.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_handoff_resume_watch',
      title: 'Secure Browser Agent Target Handoff Resume Watch',
      description: 'Plan or run one low-token handoff continuation step: monitor auth while logged out, run no-open auth-first resume when auth is ready, or audit when capture is complete. Capture-capable continuations require operatorOk=OK.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          handoff: { type: 'string', description: 'Target output-dir relative handoff path. Defaults to operator-handoff.json.' },
          run: { type: 'boolean', description: 'Execute the selected safe continuation command. Omit for read-only plan mode.' },
          operatorOk: { type: 'string', description: 'Must be exactly OK when run=true and the selected continuation may start capture.' },
          in: { type: 'string', description: 'Target output-dir relative saved handoff resume JSON. Defaults to handoff-resume-latest.json.' },
          waitAuthStatusOut: { type: 'string', description: 'Target output-dir relative wait-auth status JSON. Defaults to handoff-resume-wait-auth-status.json.' },
          authWatchIn: { type: 'string', description: 'Target output-dir relative auth-watch status JSON. Defaults to auth-watch-status.json.' },
          authCheckIn: { type: 'string', description: 'Target output-dir relative auth-check status JSON. Defaults to auth-check-status.json.' },
          monitorTimeoutMs: { type: 'number', description: 'Optional target-auth-watch timeout override for short monitor-only probes.' },
          monitorIntervalMs: { type: 'number', description: 'Optional target-auth-watch interval override for short monitor-only probes.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_proof_inventory',
      title: 'Secure Browser Agent Target Proof Inventory',
      description: 'Read-only inventory of all target packs and their real external proof readiness.',
      inputSchema: {
        type: 'object',
        properties: {
          realExternal: { type: 'boolean' },
          strict: { type: 'boolean', description: 'Return complete=false in structured content when accepted external proof is missing; MCP calls do not exit.' },
          outputs: { type: 'string', description: 'Comma-separated output filenames under each pack outputs dir.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_proof_next',
      title: 'Secure Browser Agent Target Proof Next Action',
      description: 'Read-only next action selector for moving from target-pack inventory to an accepted real external proof.',
      inputSchema: {
        type: 'object',
        properties: {
          realExternal: { type: 'boolean' },
          strict: { type: 'boolean', description: 'Return complete=false in structured content when accepted external proof is missing; MCP calls do not exit.' },
          outputs: { type: 'string', description: 'Comma-separated output filenames under each pack outputs dir.' },
          format: { type: 'string', enum: ['json', 'compact'], description: 'Text content format. structuredContent always remains JSON.' }
        }
      }
    },
    {
      name: 'sba_target_permissions',
      title: 'Secure Browser Agent Target Permissions',
      description: 'Plan, set, apply, or inspect pack-scoped Chrome site permissions for a dedicated profile.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          action: { type: 'string', enum: ['status', 'plan', 'set', 'apply'] },
          allow: { type: 'string', description: 'Comma-separated permissions such as clipboard,downloads.' },
          origin: { type: 'string' },
          profile: { type: 'string' },
          force: { type: 'boolean' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_daemon',
      title: 'Secure Browser Agent Target Daemon',
      description: 'Start, stop, or inspect a pack-scoped background Chrome/CDP process.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          action: { type: 'string', enum: ['start', 'status', 'stop'] },
          profile: { type: 'string' },
          url: { type: 'string' },
          headed: { type: 'boolean' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_run',
      title: 'Secure Browser Agent Target Recipe Run',
      description: 'Run a scaffolded target recipe and return structured output. Uses target pack policy and profile.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          recipe: { type: 'string', enum: ['diagnose', 'observe', 'inspect', 'analyze', 'operate', 'screenshot', 'crawl', 'crawl-links', 'outline', 'links', 'search'] },
          profile: { type: 'string' },
          daemon: { type: 'boolean' },
          out: { type: 'string' },
          format: { type: 'string', enum: ['json', 'csv'] },
          result: { type: 'string' }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_run_status',
      title: 'Secure Browser Agent Target Recipe Run Status',
      description: 'Read-only low-token summary of a saved target-run output. Reports freshness and result shape without returning page text or row data.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          recipe: { type: 'string', enum: ['diagnose', 'observe', 'inspect', 'analyze', 'operate', 'scrape', 'screenshot', 'crawl', 'crawl-links', 'outline', 'links', 'search'] },
          in: { type: 'string', description: 'Output path relative to the target outputDir. Defaults to the recipe output.' },
          staleAfterSeconds: { type: 'number' },
          format: { type: 'string', enum: ['json', 'compact'] }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_target_operate_add',
      title: 'Secure Browser Agent Target Operate Step Add',
      description: 'Append a guarded fill/click/wait/observe/inspect/extract step to recipes/operate.json for a target pack. Use valueEnv for sensitive fill values.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          action: { type: 'string', enum: ['fill', 'click', 'wait-for', 'wait', 'observe', 'inspect', 'extract'] },
          selector: { type: 'string' },
          value: { type: 'string', description: 'Inline non-secret fill value. Use valueEnv for passwords, tokens, or account secrets.' },
          valueEnv: { type: 'string', description: 'Environment variable name resolved at runtime for fill values.' },
          text: { type: 'string' },
          urlIncludes: { type: 'string' },
          as: { type: 'string' },
          fields: { type: 'string' },
          limit: { type: 'number' },
          afterMs: { type: 'number' },
          timeoutMs: { type: 'number' },
          pollMs: { type: 'number' },
          dryRun: { type: 'boolean' }
        },
        required: ['targetDir', 'action']
      }
    },
    {
      name: 'sba_target_scrape',
      title: 'Secure Browser Agent Target Scrape',
      description: 'Analyze a target page and extract rows using the best suggested selector or a supplied selector.',
      inputSchema: {
        type: 'object',
        properties: {
          targetDir: { type: 'string' },
          url: { type: 'string' },
          selector: { type: 'string' },
          suggestion: { type: 'number' },
          fields: { type: 'string', description: 'Comma-separated fields such as text,href.' },
          profile: { type: 'string' },
          daemon: { type: 'boolean' },
          limit: { type: 'number' },
          out: { type: 'string' },
          format: { type: 'string', enum: ['json', 'csv'] }
        },
        required: ['targetDir']
      }
    },
    {
      name: 'sba_cdp_analyze',
      title: 'Secure Browser Agent CDP Analyze',
      description: 'Analyze one allowlisted URL with direct CDP and return compact page, console, network, and extractor suggestions.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          profile: { type: 'string' },
          policy: { type: 'string' },
          daemon: { type: 'boolean' }
        },
        required: ['url']
      }
    }
  ];
}

export async function callMcpTool(name, args = {}) {
  // Allow tests to override rootDir via env; production uses cwd to prevent test remnants polluting repo
  const rootDir = process.env.SBA_ROOT_DIR || process.cwd();
  const useCache = canUseReadOnlyMcpCache(args);

  if (name === 'sba_control_status') {
    const hasMonitorOverride = args.monitorTimeoutMs !== undefined || args.monitorIntervalMs !== undefined;
    const status = useCache && !hasMonitorOverride
      ? await cachedControlStatus(rootDir)
      : await buildControlStatus({
          rootDir,
          monitorTimeoutMs: args.monitorTimeoutMs,
          monitorIntervalMs: args.monitorIntervalMs
        });
    return textResult(status, false, args.format === 'compact' ? formatControlStatusCompact(status) : '');
  }

  if (name === 'sba_agent_next') {
    const hasMonitorOverride = args.monitorTimeoutMs !== undefined || args.monitorIntervalMs !== undefined;
    const status = useCache && !hasMonitorOverride
      ? await cachedControlStatus(rootDir)
      : await buildControlStatus({
          rootDir,
          monitorTimeoutMs: args.monitorTimeoutMs,
          monitorIntervalMs: args.monitorIntervalMs
        });
    const next = buildAgentNext(status);
    return textResult(next, false, args.format === 'compact' ? formatAgentNextCompact(next) : '');
  }

  if (name === 'sba_agent_preflight') {
    const preflight = await buildTargetApprovalPreflight({
      ...args,
      candidate: args.candidate || 'github',
      realExternal: true,
      rootDir
    });
    return textResult(preflight, false, args.format === 'compact' ? formatTargetApprovalPreflightCompact(preflight) : '');
  }

  if (name === 'sba_agent_proof_checklist') {
    const checklist = await buildAgentProofChecklist({
      ...args,
      candidate: args.candidate || 'github',
      rootDir
    });
    return textResult(checklist, false, args.format === 'compact' ? formatAgentProofChecklistCompact(checklist) : '');
  }

  if (name === 'sba_agent_proof_checklist_status') {
    const status = buildAgentProofChecklistStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate || 'github'
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentProofChecklistStatusCompact(status) : '');
  }

  if (name === 'sba_agent_proof_closeout') {
    const closeout = await buildAgentProofCloseout({
      ...args,
      candidate: args.candidate || 'github',
      checklistIn: args.checklistIn,
      rootDir
    });
    return textResult(closeout, false, args.format === 'compact' ? formatAgentProofCloseoutCompact(closeout) : '');
  }

  if (name === 'sba_agent_proof_closeout_status') {
    const status = buildAgentProofCloseoutStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate || 'github'
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentProofCloseoutStatusCompact(status) : '');
  }

  if (name === 'sba_agent_workflow') {
    const workflow = await buildAgentWorkflow({
      rootDir,
      task: args.task || args.intent || 'auto',
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      intent: args.intent,
      matchOrigin: args.matchOrigin,
      matchPath: args.matchPath,
      tabIndex: args.tabIndex,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError,
      chromeMcpSource: args.chromeMcpSource,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      chromeExtensionPrepared: args.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable
    });
    return textResult(workflow, false, args.format === 'compact' ? formatAgentWorkflowCompact(workflow) : '');
  }

  if (name === 'sba_agent_backend_select') {
    const selection = await buildAgentBackendSelect({
      rootDir,
      task: args.task,
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      backendMatrixIn: args.backendMatrixIn,
      mcpObservationIn: args.mcpObservationIn,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError,
      chromeMcpSource: args.chromeMcpSource,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      matchOrigin: args.matchOrigin,
      matchPath: args.matchPath,
      tabIndex: args.tabIndex
    });
    return textResult(selection, false, args.format === 'compact' ? formatAgentBackendSelectCompact(selection) : '');
  }

  if (name === 'sba_agent_control_plane') {
    const status = await buildAgentControlPlane({
      rootDir,
      task: args.task,
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      backendMatrixIn: args.backendMatrixIn,
      mcpObservationIn: args.mcpObservationIn,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    if (args.write || args.out) {
      status.outputPath = writeAgentControlPlane(rootDir, status, args.out || '');
    }
    return textResult(status, false, args.format === 'compact' ? formatAgentControlPlaneCompact(status) : '');
  }

  if (name === 'sba_agent_control_plane_status') {
    const status = buildAgentControlPlaneStatus({
      rootDir,
      in: args.in || args.input || args.path,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentControlPlaneStatusCompact(status) : '');
  }

  if (name === 'sba_agent_control_plane_watch') {
    const watch = await buildAgentControlPlaneWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in || args.input || args.path,
      out: args.out || args.output,
      staleAfterSeconds: args.staleAfterSeconds,
      task: args.task,
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      backendMatrixIn: args.backendMatrixIn,
      mcpObservationIn: args.mcpObservationIn,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(watch, false, args.format === 'compact' ? formatAgentControlPlaneWatchCompact(watch) : '');
  }

  if (name === 'sba_agent_task') {
    const task = await buildAgentTask({
      rootDir,
      run: Boolean(args.run),
      operatorOk: args.operatorOk || args['operator-ok'] || '',
      write: Boolean(args.write),
      out: args.out || args.output,
      task: args.task,
      targetDir: args.targetDir,
      query: args.query,
      provider: args.provider,
      searchProviders: args.searchProviders,
      intent: args.intent,
      matchOrigin: args.matchOrigin,
      matchPath: args.matchPath,
      tabIndex: args.tabIndex,
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError,
      chromeMcpSource: args.chromeMcpSource,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      chromeExtensionPrepared: args.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable,
      timeoutMs: args.timeoutMs
    });
    return textResult(task, task.status === 'failed', args.format === 'compact' ? formatAgentTaskCompact(task) : '');
  }

  if (name === 'sba_agent_task_status') {
    const status = buildAgentTaskStatus({
      rootDir,
      in: args.in || args.input || args.path,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentTaskStatusCompact(status) : '');
  }

  if (name === 'sba_agent_task_watch') {
    const watch = buildAgentTaskWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in || args.input || args.path,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(watch, watch.status === 'failed', args.format === 'compact' ? formatAgentTaskWatchCompact(watch) : '');
  }

  if (name === 'sba_agent_task_loop') {
    const loop = await buildAgentTaskLoop({
      rootDir,
      run: Boolean(args.run),
      in: args.in || args.input || args.path,
      iterations: args.iterations,
      intervalMs: args.intervalMs,
      statusOut: args.statusOut,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(loop, loop.status === 'failed', args.format === 'compact' ? formatAgentTaskLoopCompact(loop) : '');
  }

  if (name === 'sba_agent_task_watch_start') {
    const started = buildAgentTaskWatchStart({
      rootDir,
      run: Boolean(args.run),
      force: Boolean(args.force),
      operatorOk: args.operatorOk || args['operator-ok'] || '',
      in: args.in || args.input || args.path,
      logPath: args.logPath,
      pidPath: args.pidPath,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(started, false, args.format === 'compact' ? formatAgentTaskWatchStartCompact(started) : '');
  }

  if (name === 'sba_agent_task_watch_status') {
    const status = buildAgentTaskWatchStatus({
      rootDir,
      in: args.in || args.input || args.path,
      logPath: args.logPath,
      pidPath: args.pidPath,
      maxLogLines: args.maxLogLines,
      mcpObservationIn: args.mcpObservationIn,
      staleAfterSeconds: args.staleAfterSeconds,
      timeoutMs: args.timeoutMs
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentTaskWatchStatusCompact(status) : '');
  }

  if (name === 'sba_agent_loop_step') {
    const step = await buildAgentLoopStep({
      rootDir,
      run: Boolean(args.run),
      write: Boolean(args.write),
      out: args.out || args.output,
      timeoutMs: Number(args.timeoutMs || 300000),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs,
      controlStatus: args.run ? undefined : await cachedControlStatus(rootDir)
    });
    return textResult(step, false, args.format === 'compact' ? formatAgentLoopStepCompact(step) : '');
  }

  if (name === 'sba_agent_loop_step_status') {
    const status = buildAgentLoopStepStatus({
      rootDir,
      in: args.in || args.input || args.path,
      staleAfterSeconds: Number(args.staleAfterSeconds || 900),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentLoopStepStatusCompact(status) : '');
  }

  if (name === 'sba_agent_proof_step') {
    const step = await buildAgentProofStep({
      rootDir,
      run: Boolean(args.run),
      write: Boolean(args.write),
      out: args.out || args.output,
      targetDir: args.targetDir,
      handoff: args.handoff,
      timeoutMs: Number(args.timeoutMs || 300000),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(step, step.status === 'failed', args.format === 'compact' ? formatAgentProofStepCompact(step) : '');
  }

  if (name === 'sba_agent_proof_step_start') {
    const started = await buildAgentProofStepStart({
      rootDir,
      run: Boolean(args.run),
      force: Boolean(args.force),
      operatorOk: args.operatorOk || args['operator-ok'] || '',
      out: args.out || args.output,
      logPath: args.logPath,
      pidPath: args.pidPath,
      targetDir: args.targetDir,
      handoff: args.handoff,
      timeoutMs: Number(args.timeoutMs || 300000),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(started, false, args.format === 'compact' ? formatAgentProofStepStartCompact(started) : '');
  }

  if (name === 'sba_agent_proof_step_status') {
    const status = buildAgentProofStepStatus({
      rootDir,
      in: args.in || args.input || args.path,
      logPath: args.logPath,
      pidPath: args.pidPath,
      maxLogLines: args.maxLogLines
    });
    return textResult(status, false, args.format === 'compact' ? formatAgentProofStepStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_control_plan') {
    const chromeOptions = {
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv
    };
    const plan = useCache
      ? await cachedChromeControlPlan(rootDir, args.lane || 'auto', '', chromeOptions)
      : buildChromeControlPlan({ rootDir, lane: args.lane || 'auto', ...chromeOptions });
    return textResult(plan, false, args.format === 'compact' ? formatChromeControlPlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_mcp_observation') {
    const observation = buildChromeMcpObservation({
      rootDir,
      statusText: args.statusText || '',
      listPagesText: args.listPagesText || '',
      observedConnected: args.observedConnected,
      observedTools: args.observedTools,
      observedPageListOk: args.observedPageListOk,
      observedPageCount: args.observedPageCount,
      observedListPagesTimedOut: args.observedListPagesTimedOut,
      observedLastError: args.observedLastError,
      source: args.source || '',
      intent: args.intent || 'inspect',
      write: Boolean(args.write),
      out: args.out || args.output
    });
    return textResult(observation, false, args.format === 'compact' ? formatChromeMcpObservationCompact(observation) : '');
  }

  if (name === 'sba_chrome_mcp_observation_status') {
    const status = buildChromeMcpObservationStatus({
      rootDir,
      in: args.in || args.input,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatChromeMcpObservationStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_mcp_status') {
    const status = useCache
      ? await cachedChromeMcpStatus(rootDir, args)
      : buildChromeMcpStatus({
        rootDir,
        observedConnected: args.observedConnected,
        observedTools: args.observedTools,
        observedPageListOk: args.observedPageListOk,
        observedPageCount: args.observedPageCount,
        observedLastError: args.observedLastError || '',
        observedSource: args.observedSource || ''
      });
    return textResult(status, false, args.format === 'compact' ? formatChromeMcpStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_mcp_handoff') {
    const chromeMcpStatus = useCache ? await cachedChromeMcpStatus(rootDir, args) : null;
    const chromeControlPlan = useCache ? await cachedChromeControlPlan(rootDir, args.lane || 'auto') : null;
    const handoff = await buildChromeMcpHandoff({
      rootDir,
      ...(chromeMcpStatus ? { chromeMcpStatus } : {}),
      ...(chromeControlPlan ? { chromeControlPlan } : {}),
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv
    });
    return textResult(handoff, false, args.format === 'compact' ? formatChromeMcpHandoffCompact(handoff) : '');
  }

  if (name === 'sba_chrome_mcp_timeout_plan') {
    const plan = useCache
      ? buildChromeMcpTimeoutPlan({
        rootDir,
        observedConnected: args.observedConnected,
        observedTools: args.observedTools,
        observedPageListOk: args.observedPageListOk,
        observedPageCount: args.observedPageCount,
        observedLastError: args.observedLastError || '',
        observedSource: args.observedSource || '',
        ownerLimit: args.ownerLimit,
        allowNewBackgroundTab: args.allowNewBackgroundTab,
        newBackgroundUrlEnv: args.newBackgroundUrlEnv,
        write: Boolean(args.write),
        out: args.out || args.output,
        chromeMcpStatus: await cachedChromeMcpStatus(rootDir, args),
        runtimeCleanupPlan: await cachedRuntimeCleanupPlan(rootDir, args.ownerLimit)
      })
      : buildChromeMcpTimeoutPlan({
        rootDir,
        observedConnected: args.observedConnected,
        observedTools: args.observedTools,
        observedPageListOk: args.observedPageListOk,
        observedPageCount: args.observedPageCount,
        observedLastError: args.observedLastError || '',
        observedSource: args.observedSource || '',
        ownerLimit: args.ownerLimit,
        allowNewBackgroundTab: args.allowNewBackgroundTab,
        newBackgroundUrlEnv: args.newBackgroundUrlEnv,
        write: Boolean(args.write),
        out: args.out || args.output
      });
    return textResult(plan, false, args.format === 'compact' ? formatChromeMcpTimeoutPlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_mcp_timeout_plan_status') {
    const status = buildChromeMcpTimeoutPlanStatus({
      rootDir,
      in: args.in || args.input,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatChromeMcpTimeoutPlanStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_mcp_autostart_plan') {
    const plan = buildChromeMcpAutostartPlan({
      rootDir,
      write: Boolean(args.write),
      out: args.out || args.output,
      label: args.label,
      browserUrl: args.browserUrl,
      headless: args.headless,
      packageSpec: args.packageSpec,
      plist: args.plist,
      installPath: args.installPath
    });
    return textResult(plan, false, args.format === 'compact' ? formatChromeMcpAutostartPlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_mcp_autostart_plan_status') {
    const status = buildChromeMcpAutostartPlanStatus({
      rootDir,
      in: args.in || args.input
    });
    return textResult(status, false, args.format === 'compact' ? formatChromeMcpAutostartPlanStatusCompact(status) : '');
  }

  if (name === 'sba_regular_chrome_use') {
    const useRegularChromeCache = useCache && !args.statusText && !args.listPagesText && !args.mcpObservationIn;
    const chromeMcpHandoff = useRegularChromeCache
      ? await buildChromeMcpHandoff({
        rootDir,
        browserRoute: await buildBrowserRoute({
          rootDir,
          task: 'existing-tab',
          chromeMcpStatus: await cachedChromeMcpStatus(rootDir, args),
          chromeControlPlan: await cachedChromeControlPlan(rootDir, args.lane || 'auto')
        }),
        allowNewBackgroundTab: args.allowNewBackgroundTab,
        newBackgroundUrlEnv: args.newBackgroundUrlEnv
      })
      : null;
    const plan = await buildRegularChromeUse({
      rootDir,
      ...(chromeMcpHandoff ? { chromeMcpHandoff } : {}),
      intent: args.intent || 'inspect',
      statusText: args.statusText || '',
      listPagesText: args.listPagesText || '',
      mcpObservationIn: args.mcpObservationIn,
      source: args.source || args.chromeMcpSource || '',
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      chromeExtensionPrepared: args.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: args.chromeExtensionBackendLastError || '',
      chromeExtensionWindowRetryAttempted: args.chromeExtensionWindowRetryAttempted,
      appleEventsActiveTabObserved: args.appleEventsActiveTabObserved,
      appleEventsJavascriptAllowed: args.appleEventsJavascriptAllowed,
      pluginDir: args.pluginDir || ''
    });
    return textResult(plan, false, args.format === 'compact' ? formatRegularChromeUseCompact(plan) : '');
  }

  if (name === 'sba_regular_chrome_refresh') {
    const refresh = await buildRegularChromeRefresh({
      rootDir,
      intent: args.intent || 'inspect',
      appleEventsOut: args.appleEventsOut || args.appleEventsOutput,
      out: args.out || args.output,
      statusText: args.statusText || '',
      listPagesText: args.listPagesText || '',
      mcpObservationIn: args.mcpObservationIn,
      source: args.source || args.chromeMcpSource || '',
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      chromeExtensionPrepared: args.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: args.chromeExtensionBackendLastError || '',
      chromeExtensionWindowRetryAttempted: args.chromeExtensionWindowRetryAttempted,
      pluginDir: args.pluginDir || ''
    });
    return textResult(refresh, false, args.format === 'compact' ? formatRegularChromeRefreshCompact(refresh) : '');
  }

  if (name === 'sba_regular_chrome_status') {
    const status = buildRegularChromeStatus({
      rootDir,
      in: args.in || args.input,
      appleEventsIn: args.appleEventsIn,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatRegularChromeStatusCompact(status) : '');
  }

  if (name === 'sba_regular_chrome_watch') {
    const watch = await buildRegularChromeWatch({
      rootDir,
      run: Boolean(args.run),
      force: Boolean(args.force),
      in: args.in || args.input,
      appleEventsIn: args.appleEventsIn,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      staleAfterSeconds: args.staleAfterSeconds,
      intent: args.intent || 'inspect'
    });
    return textResult(watch, watch.status === 'failed', args.format === 'compact' ? formatRegularChromeWatchCompact(watch) : '');
  }

  if (name === 'sba_chrome_apple_events_status') {
    const status = useCache
      ? await cachedChromeAppleEventsStatus(rootDir)
      : buildChromeAppleEventsStatus();
    return textResult(status, false, args.format === 'compact' ? formatChromeAppleEventsStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_apple_events_enable_plan') {
    const status = useCache ? await cachedChromeAppleEventsStatus(rootDir) : null;
    const plan = buildChromeAppleEventsEnablePlan({
      rootDir,
      ...(status ? { status } : {})
    });
    return textResult(plan, false, args.format === 'compact' ? formatChromeAppleEventsEnablePlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_apple_events_outline') {
    const status = useCache ? await cachedChromeAppleEventsStatus(rootDir) : null;
    const outline = buildChromeAppleEventsOutline({
      ...(status ? { status } : {}),
      run: Boolean(args.run),
      operatorOk: args.operatorOk || ''
    });
    return textResult(outline, false, args.format === 'compact' ? formatChromeAppleEventsOutlineCompact(outline) : '');
  }

  if (name === 'sba_browser_route') {
    const proofGateStatus = useCache && (args.task || 'auto') === 'auto'
      ? await cachedProofGateStatus(rootDir)
      : null;
    const route = await buildBrowserRoute({
      rootDir,
      ...(proofGateStatus ? { proofGateStatus } : {}),
      ...(useCache && (args.task || 'auto') === 'existing-tab' ? { chromeMcpStatus: await cachedChromeMcpStatus(rootDir, args) } : {}),
      ...(useCache && (args.task || 'auto') === 'existing-tab' ? { chromeControlPlan: await cachedChromeControlPlan(rootDir, args.lane || 'auto') } : {}),
      task: args.task || 'auto',
      lane: args.lane || 'auto',
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv
    });
    return textResult(route, false, args.format === 'compact' ? formatBrowserRouteCompact(route) : '');
  }

  if (name === 'sba_chrome_extension_status') {
    const status = useCache
      ? await cachedChromeExtensionStatus(rootDir, args.pluginDir || '')
      : buildChromeExtensionStatus({ pluginDir: args.pluginDir || '' });
    return textResult(status, false, args.format === 'compact' ? formatChromeExtensionStatusCompact(status) : '');
  }

  if (name === 'sba_chrome_extension_handoff') {
    const handoff = buildChromeExtensionHandoff({
      rootDir,
      pluginDir: args.pluginDir || '',
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {}),
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(handoff, false, args.format === 'compact' ? formatChromeExtensionHandoffCompact(handoff) : '');
  }

  if (name === 'sba_chrome_extension_resume') {
    const result = buildChromeExtensionResume({
      rootDir,
      pluginDir: args.pluginDir || '',
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {}),
      run: Boolean(args.run),
      operatorOk: args.operatorOk || '',
      dryRun: Boolean(args.dryRun)
    });
    return textResult(result, false, args.format === 'compact' ? formatChromeExtensionResumeCompact(result) : '');
  }

  if (name === 'sba_chrome_extension_troubleshoot') {
    const result = buildChromeExtensionTroubleshoot({
      rootDir,
      pluginDir: args.pluginDir || '',
      backendAvailable: args.backendAvailable,
      backendLastError: args.backendLastError || '',
      profileWindowRetryAttempted: args.profileWindowRetryAttempted,
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {})
    });
    return textResult(result, false, args.format === 'compact' ? formatChromeExtensionTroubleshootCompact(result) : '');
  }

  if (name === 'sba_chrome_extension_backend_check_plan') {
    const plan = buildChromeExtensionBackendCheckPlan({
      rootDir,
      pluginDir: args.pluginDir || '',
      backendAvailable: args.backendAvailable,
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {})
    });
    return textResult(plan, false, args.format === 'compact' ? formatChromeExtensionBackendCheckPlanCompact(plan) : '');
  }

  if (name === 'sba_chrome_extension_claim_plan') {
    const plan = buildChromeExtensionClaimPlan({
      rootDir,
      pluginDir: args.pluginDir || '',
      backendReady: args.backendReady,
      intent: args.intent || 'inspect',
      matchTitle: args.matchTitle || '',
      matchUrl: args.matchUrl || '',
      matchOrigin: args.matchOrigin || '',
      matchPath: args.matchPath || '',
      tabIndex: args.tabIndex,
      ...(useCache ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir, args.pluginDir || '') } : {})
    });
    return textResult(plan, false, args.format === 'compact' ? formatChromeExtensionClaimPlanCompact(plan) : '');
  }

  if (name === 'sba_profile_status') {
    const policy = loadPolicy(args.policy);
    const profile = args.profile || policy.defaultProfile || 'default';
    return textResult(profileStatus(policy, profile));
  }

  if (name === 'sba_target_status') {
    const target = resolveTargetPack(args.targetDir);
    const policy = loadPolicy(target.policy);
    const targetProfile = args.profile || target.metadata.profile || target.targetPolicy.defaultProfile || target.metadata.target;
    return textResult({
      target: target.metadata.target || targetProfile,
      dir: target.dir,
      policy: target.policy,
      metadata: target.metadataFile,
      ...profileStatus(policy, targetProfile)
    });
  }

  if (name === 'sba_target_audit') {
    const audit = await auditTargetPack(args.targetDir, args);
    return textResult(audit, !audit.ok);
  }

  if (name === 'sba_runtime_audit') {
    const audit = useCache ? await cachedRuntimeAudit(rootDir) : buildRuntimeAudit();
    if (args.write || args.out) {
      audit.outputPath = writeRuntimeAuditReport(rootDir, audit, args.out || '');
    }
    return textResult(audit, false, args.format === 'compact' ? formatRuntimeAuditCompact(audit) : '');
  }

  if (name === 'sba_runtime_cleanup_plan') {
    const plan = useCache
      ? await cachedRuntimeCleanupPlan(rootDir, args.ownerLimit)
      : buildRuntimeCleanupPlan({ ownerLimit: args.ownerLimit });
    if (args.write || args.out) {
      plan.outputPath = writeRuntimeCleanupPlanReport(rootDir, plan, args.out || '');
    }
    return textResult(plan, false, args.format === 'compact' ? formatRuntimeCleanupPlanCompact(plan) : '');
  }

  if (name === 'sba_run_gate_audit') {
    const audit = buildRunGateAudit();
    return textResult(audit, false, args.format === 'compact' ? formatRunGateAuditCompact(audit) : '');
  }

  if (name === 'sba_compact_command_audit') {
    const audit = await buildCompactCommandAudit({
      rootDir,
      source: args.source || 'operator-pack',
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(audit, false, args.format === 'compact' ? formatCompactCommandAuditCompact(audit) : '');
  }

  if (name === 'sba_completion_proof_bundle') {
    const bundle = await buildCompletionProofBundle({
      rootDir,
      candidate: args.candidate || 'github',
      includeCompactCommandAudit: Boolean(args.includeCompactCommandAudit),
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(bundle, false, args.format === 'compact' ? formatCompletionProofBundleCompact(bundle) : '');
  }

  if (name === 'sba_completion_proof_bundle_status') {
    const status = buildCompletionProofBundleStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate || 'github'
    });
    return textResult(status, false, args.format === 'compact' ? formatCompletionProofBundleStatusCompact(status) : '');
  }

  if (name === 'sba_completion_proof_bundle_watch') {
    const watch = await buildCompletionProofBundleWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in,
      out: args.out,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate || 'github'
    });
    return textResult(watch, false, args.format === 'compact' ? formatCompletionProofBundleWatchCompact(watch) : '');
  }

  if (name === 'sba_source_audit') {
    const audit = buildSourceAudit();
    return textResult(audit, false, args.format === 'compact' ? formatSourceAuditCompact(audit) : '');
  }

  if (name === 'sba_lightpanda_doctor') {
    const report = buildLightpandaDoctor();
    return textResult(report, false, args.format === 'compact' ? formatLightpandaDoctorCompact(report) : '');
  }

  if (name === 'sba_agent_browser_doctor') {
    const report = buildAgentBrowserDoctor({ rootDir });
    return textResult(report, false, args.format === 'compact' ? formatAgentBrowserDoctorCompact(report) : '');
  }

  if (name === 'sba_provider_doctor_status') {
    const status = buildProviderDoctorStatus({ seleniumOptions: { rootDir } });
    return textResult(status, false, args.format === 'compact' ? formatProviderDoctorStatusCompact(status) : '');
  }

  if (name === 'sba_playwright_doctor') {
    const report = buildPlaywrightDoctor({ rootDir });
    return textResult(report, false, args.format === 'compact' ? formatPlaywrightDoctorCompact(report) : '');
  }

  if (name === 'sba_lightpanda_decision') {
    const report = buildLightpandaDecision({
      decision: args.decision || 'reject',
      reason: args.reason || '',
      force: Boolean(args.force)
    });
    if (args.write || args.out) {
      report.outputPath = writeLightpandaDecision(rootDir, report, args.out || '');
    }
    return textResult(report);
  }

  if (name === 'sba_selenium_doctor') {
    const report = buildSeleniumDoctor({ rootDir });
    return textResult(report, false, args.format === 'compact' ? formatSeleniumDoctorCompact(report) : '');
  }

  if (name === 'sba_secret_audit') {
    const report = buildSecretAudit();
    return textResult(report, false, args.format === 'compact' ? formatSecretAuditCompact(report) : '');
  }

  if (name === 'sba_secret_setup_plan') {
    const plan = buildSecretSetupPlan({ mode: args.mode });
    return textResult(plan, false, args.format === 'compact' ? formatSecretSetupPlanCompact(plan) : '');
  }

  if (name === 'sba_secret_run_plan') {
    const plan = buildSecretRunPlan({
      mode: args.mode,
      command: args.command,
      targetDir: args.targetDir
    });
    return textResult(plan, false, args.format === 'compact' ? formatSecretRunPlanCompact(plan) : '');
  }

  if (name === 'sba_secret_run_select') {
    const selection = buildSecretRunSelect({
      command: args.command,
      targetDir: args.targetDir
    });
    return textResult(selection, false, args.format === 'compact' ? formatSecretRunSelectCompact(selection) : '');
  }

  if (name === 'sba_secret_env_handoff') {
    const handoff = buildSecretEnvHandoff({
      rootDir,
      mode: args.mode,
      environmentName: args.environmentName,
      mountPath: args.mountPath,
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(handoff, false, args.format === 'compact' ? formatSecretEnvHandoffCompact(handoff) : '');
  }

  if (name === 'sba_secret_env_handoff_status') {
    const status = buildSecretEnvHandoffStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatSecretEnvHandoffStatusCompact(status) : '');
  }

  if (name === 'sba_secret_env_handoff_watch') {
    const watch = buildSecretEnvHandoffWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in,
      out: args.out,
      staleAfterSeconds: args.staleAfterSeconds,
      mode: args.mode,
      environmentName: args.environmentName,
      mountPath: args.mountPath
    });
    return textResult(watch, false, args.format === 'compact' ? formatSecretEnvHandoffWatchCompact(watch) : '');
  }

  if (name === 'sba_providers') {
    const report = buildProviderReport({ rootDir });
    return textResult(report, false, args.format === 'compact' ? formatProviderReportCompact(report) : '');
  }

  if (name === 'sba_backend_matrix') {
    const matrix = await buildBackendMatrix({
      rootDir,
      write: Boolean(args.write),
      out: args.out,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv
    });
    return textResult(matrix, false, args.format === 'compact' ? formatBackendMatrixCompact(matrix) : '');
  }

  if (name === 'sba_backend_matrix_status') {
    const status = buildBackendMatrixStatus({
      rootDir,
      in: args.in || args.input || args.path,
      mcpObservationIn: args.mcpObservationIn,
      allowNewBackgroundTab: args.allowNewBackgroundTab,
      newBackgroundUrlEnv: args.newBackgroundUrlEnv,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatBackendMatrixStatusCompact(status) : '');
  }

  if (name === 'sba_provider_benchmark') {
    const report = await runProviderBenchmark({
      quick: Boolean(args.quick),
      iterations: Number(args.iterations || 2),
      rowCount: Number(args.rows || 40),
      url: args.url,
      rootDir
    });
    if (args.write || args.out) {
      report.outputPath = writeProviderBenchmarkReport(rootDir, report, args.out || '');
    }
    return textResult(report);
  }

  if (name === 'sba_readiness_audit') {
    const audit = buildReadinessAudit({ rootDir });
    return textResult(audit, false, args.format === 'compact' ? formatReadinessAuditCompact(audit) : '');
  }

  if (name === 'sba_objective_completion_audit') {
    const audit = await buildObjectiveCompletionAudit({
      rootDir,
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(audit, false, args.format === 'compact' ? formatObjectiveCompletionAuditCompact(audit) : '');
  }

  if (name === 'sba_objective_completion_audit_status') {
    const status = buildObjectiveCompletionAuditStatus({
      rootDir,
      in: args.in || args.input || args.path,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatObjectiveCompletionAuditStatusCompact(status) : '');
  }

  if (name === 'sba_objective_completion_audit_watch') {
    const watch = await buildObjectiveCompletionAuditWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in || args.input || args.path,
      out: args.out,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(watch, false, args.format === 'compact' ? formatObjectiveCompletionAuditWatchCompact(watch) : '');
  }

  if (name === 'sba_objective_safe_command') {
    const result = await buildObjectiveSafeCommand({
      rootDir,
      write: Boolean(args.write),
      out: args.out,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(result, false, args.format === 'compact' ? formatObjectiveSafeCommandCompact(result) : '');
  }

  if (name === 'sba_objective_proof_pipeline') {
    const pipeline = await buildObjectiveProofPipeline({
      rootDir,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(pipeline, false, args.format === 'compact' ? formatObjectiveProofPipelineCompact(pipeline) : '');
  }

  if (name === 'sba_objective_handoff') {
    const handoff = await buildObjectiveHandoff({
      rootDir,
      write: Boolean(args.write),
      out: args.out,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(handoff, false, args.format === 'compact' ? formatObjectiveHandoffCompact(handoff) : '');
  }

  if (name === 'sba_operator_pack') {
    const hasRawChromeMcpObservation = Boolean(args.chromeMcpStatusText || args.chromeMcpListPagesText);
    const hasChromeExtensionBackendObservation = args.chromeExtensionBackendAvailable !== undefined
      || Boolean(args.chromeExtensionBackendLastError);
    const cachedInputs = useCache ? {
      objectiveStatus: await cachedObjectiveStatus(rootDir),
      proofGateStatus: await cachedProofGateStatus(rootDir),
      runtimeAudit: await cachedRuntimeAudit(rootDir),
      runtimeCleanupPlan: await cachedRuntimeCleanupPlan(rootDir, args.ownerLimit),
      ...(!hasChromeExtensionBackendObservation ? { chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir) } : {}),
      ...(!hasChromeExtensionBackendObservation ? { chromeControlPlan: await cachedChromeControlPlan(rootDir, args.lane || 'auto') } : {}),
      ...(!hasRawChromeMcpObservation ? { chromeMcpStatus: await cachedChromeMcpStatus(rootDir, {
        observedConnected: args.chromeMcpConnected,
        observedTools: args.chromeMcpTools,
        observedPageListOk: args.chromeMcpPageListOk,
        observedPageCount: args.chromeMcpPageCount,
        observedLastError: args.chromeMcpLastError || '',
        observedSource: args.chromeMcpSource || ''
      }) } : {})
    } : {};
    const pack = await buildOperatorPack({
      rootDir,
      ...cachedInputs,
      write: Boolean(args.write),
      out: args.out,
      agentLoopStepStatusIn: args.agentLoopStepStatusIn,
      agentLoopStepTimeoutMs: args.agentLoopStepTimeoutMs,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs,
      chromeMcpStatusText: args.chromeMcpStatusText || '',
      chromeMcpListPagesText: args.chromeMcpListPagesText || '',
      chromeMcpConnected: args.chromeMcpConnected,
      chromeMcpTools: args.chromeMcpTools,
      chromeMcpPageListOk: args.chromeMcpPageListOk,
      chromeMcpPageCount: args.chromeMcpPageCount,
      chromeMcpLastError: args.chromeMcpLastError || '',
      chromeMcpSource: args.chromeMcpSource || '',
      chromeExtensionBackendAvailable: args.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: args.chromeExtensionBackendLastError || '',
      chromeExtensionWindowRetryAttempted: args.chromeExtensionWindowRetryAttempted,
      appleEventsActiveTabObserved: args.appleEventsActiveTabObserved,
      appleEventsJavascriptAllowed: args.appleEventsJavascriptAllowed
    });
    return textResult(pack, false, args.format === 'compact' ? formatOperatorPackCompact(pack) : '');
  }

  if (name === 'sba_operator_runbook') {
    const operatorPack = useCache ? await buildOperatorPack({
      rootDir,
      write: false,
      objectiveStatus: await cachedObjectiveStatus(rootDir),
      proofGateStatus: await cachedProofGateStatus(rootDir),
      runtimeAudit: await cachedRuntimeAudit(rootDir),
      runtimeCleanupPlan: await cachedRuntimeCleanupPlan(rootDir),
      chromeExtensionStatus: await cachedChromeExtensionStatus(rootDir),
      chromeControlPlan: await cachedChromeControlPlan(rootDir),
      chromeMcpStatus: await cachedChromeMcpStatus(rootDir),
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    }) : null;
    const runbook = await buildOperatorRunbook({
      rootDir,
      ...(operatorPack ? { operatorPack } : {}),
      write: Boolean(args.write),
      out: args.out,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(runbook, false, args.format === 'compact' ? formatOperatorRunbookCompact(runbook) : '');
  }

  if (name === 'sba_operator_pack_status') {
    const status = buildOperatorPackStatus({
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatOperatorPackStatusCompact(status) : '');
  }

  if (name === 'sba_operator_runbook_status') {
    const status = buildOperatorRunbookStatus({
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatOperatorRunbookStatusCompact(status) : '');
  }

  if (name === 'sba_operator_runbook_watch') {
    const watch = await buildOperatorRunbookWatch({
      ...args,
      rootDir
    });
    return textResult(watch, false, args.format === 'compact' ? formatOperatorRunbookWatchCompact(watch) : '');
  }

  if (name === 'sba_objective_next') {
    const next = await buildObjectiveNext({
      rootDir,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(next, false, args.format === 'compact' ? formatObjectiveNextCompact(next) : '');
  }

  if (name === 'sba_objective_status') {
    const status = useCache
      ? await cachedObjectiveStatus(rootDir)
      : await buildObjectiveStatus({
        rootDir,
        write: Boolean(args.write),
        out: args.out
      });
    return textResult(status, false, args.format === 'compact' ? formatObjectiveStatusCompact(status) : '');
  }

  if (name === 'sba_proof_gate_status') {
    const status = useCache
      ? await cachedProofGateStatus(rootDir)
      : await buildProofGateStatus({
        rootDir,
        write: Boolean(args.write),
        out: args.out
      });
    return textResult(status, false, args.format === 'compact' ? formatProofGateStatusCompact(status) : '');
  }

  if (name === 'sba_proof_gate_watch') {
    const watch = await buildProofGateWatch({
      rootDir,
      write: Boolean(args.write),
      out: args.out,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs
    });
    return textResult(watch, false, args.format === 'compact' ? formatProofGateWatchCompact(watch) : '');
  }

  if (name === 'sba_login_handoff_status') {
    const status = useCache
      ? await cachedLoginHandoffStatus(rootDir)
      : await buildLoginHandoffStatus({
        rootDir,
        write: Boolean(args.write),
        out: args.out
      });
    return textResult(status, false, args.format === 'compact' ? formatLoginHandoffStatusCompact(status) : '');
  }

  if (name === 'sba_background_monitor_plan') {
    const plan = await buildBackgroundMonitorPlan({
      rootDir,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      statusOut: args.statusOut,
      logPath: args.logPath,
      pidPath: args.pidPath
    });
    return textResult(plan, false, args.format === 'compact' ? formatBackgroundMonitorPlanCompact(plan) : '');
  }

  if (name === 'sba_background_proof_capture_plan') {
    const plan = await buildBackgroundProofCapturePlan({
      rootDir,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      monitorLogPath: args.monitorLogPath,
      monitorPidPath: args.monitorPidPath,
      captureLogPath: args.captureLogPath,
      capturePidPath: args.capturePidPath
    });
    return textResult(plan, false, args.format === 'compact' ? formatBackgroundProofCapturePlanCompact(plan) : '');
  }

  if (name === 'sba_background_proof_capture_status') {
    const status = await buildBackgroundProofCaptureStatus({
      rootDir,
      targetDir: args.targetDir,
      maxLogLines: args.maxLogLines
    });
    return textResult(status, false, args.format === 'compact' ? formatBackgroundProofCaptureStatusCompact(status) : '');
  }

  if (name === 'sba_background_proof_capture_start') {
    const result = await buildBackgroundProofCaptureStart({
      rootDir,
      mode: args.mode,
      run: Boolean(args.run),
      operatorOk: args.operatorOk || '',
      force: Boolean(args.force),
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      monitorTimeoutMs: args.monitorTimeoutMs,
      monitorIntervalMs: args.monitorIntervalMs
    });
    return textResult(result, false, args.format === 'compact' ? formatBackgroundProofCaptureStartCompact(result) : '');
  }

  if (name === 'sba_objective_resume') {
    const resume = await buildObjectiveResume({
      rootDir,
      run: Boolean(args.run),
      operatorOk: args.operatorOk || '',
      operatorReady: Boolean(args.operatorReady),
      manualCandidate: args.manualCandidate,
      waitAuthTimeoutMs: args.waitAuthTimeoutMs,
      waitAuthIntervalMs: args.waitAuthIntervalMs,
      timeoutMs: args.timeoutMs,
      write: Boolean(args.write),
      out: args.out
    });
    return textResult(resume, false, args.format === 'compact' ? formatObjectiveResumeCompact(resume) : '');
  }

  if (name === 'sba_target_benchmark') {
    const report = await runTargetBenchmark(args.targetDir, {
      profile: args.profile,
      recipes: args.recipes,
      modes: args.modes,
      iterations: Number(args.iterations || 1)
    });
    if (args.write || args.out) {
      report.outputPath = writeTargetBenchmarkReport(args.targetDir, report, args.out || '');
    }
    return textResult(report);
  }

  if (name === 'sba_target_proof') {
    return textResult(await buildTargetProof(args.targetDir, args));
  }

  if (name === 'sba_target_bootstrap_plan') {
    const plan = buildTargetBootstrapPlan(args);
    return textResult(plan, false, args.format === 'compact' ? formatTargetBootstrapPlanCompact(plan) : '');
  }

  if (name === 'sba_target_candidate_plan') {
    const plan = buildTargetCandidatePlan({ ...args, rootDir });
    return textResult(plan, false, args.format === 'compact' ? formatTargetCandidatePlanCompact(plan) : '');
  }

  if (name === 'sba_target_candidate_plan_status') {
    const status = buildTargetCandidatePlanStatus({
      rootDir,
      in: args.in,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetCandidatePlanStatusCompact(status) : '');
  }

  if (name === 'sba_target_candidate_plan_watch') {
    const watch = buildTargetCandidatePlanWatch({
      rootDir,
      run: Boolean(args.run),
      in: args.in,
      out: args.out,
      staleAfterSeconds: args.staleAfterSeconds,
      candidate: args.candidate
    });
    return textResult(watch, false, args.format === 'compact' ? formatTargetCandidatePlanWatchCompact(watch) : '');
  }

  if (name === 'sba_target_approval_pack') {
    const pack = buildTargetApprovalPack({
      ...args,
      rootDir
    });
    if (args.write || args.out) {
      pack.outputPath = writeTargetApprovalPack(rootDir, pack, args.out || '');
    }
    return textResult(pack, false, args.format === 'compact' ? formatTargetApprovalPackCompact(pack) : '');
  }

  if (name === 'sba_target_approval_status') {
    const status = await buildTargetApprovalStatus({
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetApprovalStatusCompact(status) : '');
  }

  if (name === 'sba_target_approval_preflight') {
    const preflight = await buildTargetApprovalPreflight({
      ...args,
      rootDir
    });
    return textResult(preflight, false, args.format === 'compact' ? formatTargetApprovalPreflightCompact(preflight) : '');
  }

  if (name === 'sba_target_approval_resume') {
    const resume = await buildTargetApprovalResume({
      ...args,
      rootDir
    });
    return textResult(resume, false, args.format === 'compact' ? formatTargetApprovalResumeCompact(resume) : '');
  }

  if (name === 'sba_target_approval_resume_status') {
    const status = buildTargetApprovalResumeStatus({
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetApprovalResumeStatusCompact(status) : '');
  }

  if (name === 'sba_target_approval_resume_watch') {
    const watch = await buildTargetApprovalResumeWatch({
      ...args,
      rootDir
    });
    return textResult(watch, false, args.format === 'compact' ? formatTargetApprovalResumeWatchCompact(watch) : '');
  }

  if (name === 'sba_target_proof_plan') {
    const plan = await buildTargetProofPlan(args.targetDir, args);
    return textResult(plan, false, args.format === 'compact' ? formatTargetProofPlanCompact(plan) : '');
  }

  if (name === 'sba_target_auth_check') {
    const authCheck = await buildTargetAuthCheck(args.targetDir, {
      ...args,
      write: Boolean(args.write),
      daemon: Boolean(args.daemon)
    });
    return textResult(authCheck, false, args.format === 'compact' ? formatTargetAuthCheckCompact(authCheck) : '');
  }

  if (name === 'sba_target_auth_watch') {
    const watch = await buildTargetAuthWatch(args.targetDir, {
      ...args,
      daemon: Boolean(args.daemon)
    });
    return textResult(watch, false, args.format === 'compact' ? formatTargetAuthWatchCompact(watch) : '');
  }

  if (name === 'sba_target_proof_capture') {
    const capture = await buildTargetProofCapture(args.targetDir, {
      ...args,
      realExternal: Boolean(args.realExternal),
      benchmarkFile: args.benchmarkFile,
      run: Boolean(args.run),
      waitAuth: Boolean(args.waitAuth),
      waitAuthTimeoutMs: args.waitAuthTimeoutMs,
      waitAuthIntervalMs: args.waitAuthIntervalMs,
      waitAuthStatusOut: args.waitAuthStatusOut,
      completionAudit: Boolean(args.completionAudit),
      cleanupOnFailure: args.cleanupOnFailure !== false
    });
    return textResult(capture, false, args.format === 'compact' ? formatTargetProofCaptureCompact(capture) : '');
  }

  if (name === 'sba_target_login_capture') {
    return textResult(await buildTargetLoginCapture(args.targetDir, {
      ...args,
      realExternal: Boolean(args.realExternal),
      dryRun: Boolean(args.dryRun),
      openOnly: Boolean(args.openOnly),
      handoffOut: args.handoffOut,
      handoffFormat: args.handoffFormat,
      waitAuthTimeoutMs: args.waitAuthTimeoutMs,
      waitAuthIntervalMs: args.waitAuthIntervalMs,
      waitAuthStatusOut: args.waitAuthStatusOut
    }));
  }

  if (name === 'sba_target_handoff_run') {
    const handoffRun = await buildTargetHandoffRun(args.targetDir, {
      ...args,
      rootDir,
      commandId: args.command,
      run: Boolean(args.run),
      preflightAuth: args.preflightAuth !== false
    });
    return textResult(handoffRun, false, args.format === 'compact' ? formatTargetHandoffRunCompact(handoffRun) : '');
  }

  if (name === 'sba_target_handoff_status') {
    const status = buildTargetHandoffStatus(args.targetDir, {
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetHandoffStatusCompact(status) : '');
  }

  if (name === 'sba_target_handoff_resume') {
    const resume = await buildTargetHandoffResume(args.targetDir, {
      ...args,
      rootDir,
      operatorOk: args.operatorOk || '',
      run: Boolean(args.run)
    });
    return textResult(resume, false, args.format === 'compact' ? formatTargetHandoffResumeCompact(resume) : '');
  }

  if (name === 'sba_target_handoff_resume_status') {
    const status = buildTargetHandoffResumeStatus(args.targetDir, {
      ...args,
      rootDir
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetHandoffResumeStatusCompact(status) : '');
  }

  if (name === 'sba_target_handoff_resume_watch') {
    const watch = await buildTargetHandoffResumeWatch(args.targetDir, {
      ...args,
      rootDir,
      run: Boolean(args.run)
    });
    return textResult(watch, watch.status === 'failed', args.format === 'compact' ? formatTargetHandoffResumeWatchCompact(watch) : '');
  }

  if (name === 'sba_target_proof_inventory') {
    const inventory = await buildTargetProofInventory(rootDir, args);
    return textResult(inventory, false, args.format === 'compact' ? formatTargetProofInventoryCompact(inventory) : '');
  }

  if (name === 'sba_target_proof_next') {
    const next = await buildTargetProofNext(rootDir, args);
    return textResult(next, false, args.format === 'compact' ? formatTargetProofNextCompact(next) : '');
  }

  if (name === 'sba_target_permissions') {
    const target = resolveTargetPermissions(args.targetDir, args.action || 'status', args);
    const policy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, policy);
    const targetProfilePath = profilePath(policy, target.profile);
    if (target.action === 'set') return textResult(writeTargetPermissions(target));
    if (target.action === 'apply') {
      const daemon = await cdpDaemonStatus(targetProfilePath);
      if (daemon.ok && !args.force) throw new Error(`target profile daemon is running: ${target.profile}`);
      ensureDirs(policy, target.profile);
      return textResult(applyTargetPermissions(target, targetProfilePath));
    }
    if (target.action === 'status') return textResult(targetPermissionStatus(target, targetProfilePath));
    return textResult(target);
  }

  if (name === 'sba_target_daemon') {
    const target = resolveTargetDaemon(args.targetDir, args.action || 'status', args);
    const policy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, policy);
    const targetProfilePath = profilePath(policy, target.profile);
    if (target.action === 'start') {
      if (target.initialUrl !== 'about:blank') assertAllowedUrl(target.initialUrl, policy);
      ensureDirs(policy, target.profile);
      return textResult(await startCdpDaemon(targetProfilePath, {
        headed: Boolean(args.headed),
        initialUrl: target.initialUrl
      }));
    }
    if (target.action === 'stop') return textResult(await stopCdpDaemon(targetProfilePath));
    return textResult(await cdpDaemonStatus(targetProfilePath));
  }

  if (name === 'sba_target_run') {
    const target = resolveTargetRun(args.targetDir, args.recipe || 'outline', args);
    const policy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, policy);
    ensureDirs(policy, target.profile);
    const recipe = expandRecipeSearchSteps(readJson(target.recipe));
    assertRecipeAllowed(recipe, policy);
    const output = await runRecipeWithCdp(recipe, profilePath(policy, target.profile), {
      daemon: Boolean(args.daemon),
      afterActionMs: Number(args.afterActionMs || 100),
      allowedOrigins: policy.allowedOrigins || [],
      artifactDir: policy.outputDir,
      artifactManifest: args.manifest !== false,
      artifactPolicy: policy.source
    });
    const redacted = redact(output, policy);
    if (args.out) {
      writeOutput(policy, { ...args, out: args.out, format: args.format || target.format, result: args.result || target.result, manifest: args.manifest !== false }, redacted, {
        command: 'mcp:sba_target_run',
        profile: target.profile,
        targetDir: target.dir,
        recipe: target.recipe
      });
    }
    return textResult(redacted);
  }

  if (name === 'sba_target_run_status') {
    const status = buildTargetRunStatus(args.targetDir, args.recipe || 'outline', {
      ...args,
      staleAfterSeconds: args.staleAfterSeconds
    });
    return textResult(status, false, args.format === 'compact' ? formatTargetRunStatusCompact(status) : '');
  }

  if (name === 'sba_target_operate_add') {
    return textResult(addTargetOperateStep(args.targetDir, args.action, {
      ...args,
      dryRun: Boolean(args.dryRun)
    }));
  }

  if (name === 'sba_target_scrape') {
    const target = resolveTargetScrape(args.targetDir, args);
    const policy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, policy);
    assertAllowedUrl(target.url, policy);
    ensureDirs(policy, target.profile);
    const output = await scrapeWithCdp(target.url, profilePath(policy, target.profile), {
      daemon: Boolean(args.daemon),
      selector: args.selector || '',
      suggestion: args.suggestion ?? 0,
      fields: csv(args.fields),
      limit: Number(args.limit || 50),
      waitMs: Number(args.waitMs || 300),
      linkLimit: Number(args.linkLimit || 25),
      controlLimit: Number(args.controlLimit || 40),
      textLimit: Number(args.textLimit || 600),
      candidateLimit: Number(args.candidateLimit || 20),
      sampleLimit: Number(args.sampleLimit || 3),
      suggestionLimit: Number(args.suggestionLimit || 8),
      consoleLimit: Number(args.consoleLimit || 100),
      maxConsoleArgLength: Number(args.maxConsoleArgLength || 300)
    });
    const redacted = redact(output, policy);
    if (args.out) {
      writeOutput(policy, { ...args, out: args.out, format: args.format || target.format, result: args.result || target.result, manifest: args.manifest !== false }, redacted, {
        command: 'mcp:sba_target_scrape',
        profile: target.profile,
        targetDir: target.dir,
        url: target.url
      });
    }
    return textResult(redacted);
  }

  if (name === 'sba_cdp_analyze') {
    const policy = loadPolicy(args.policy);
    const profile = args.profile || policy.defaultProfile || 'default';
    assertEngineAllowed('chrome', profile, policy);
    assertAllowedUrl(args.url, policy);
    ensureDirs(policy, profile);
    const output = await analyzeWithCdp(args.url, profilePath(policy, profile), { daemon: Boolean(args.daemon) });
    return textResult(redact(output, policy));
  }

  throw new Error(`Unknown tool: ${name}`);
}

function success(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function failure(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export async function handleMcpMessage(message) {
  if (!message || message.jsonrpc !== '2.0') return failure(message?.id ?? null, -32600, 'Invalid Request');
  if (!Object.hasOwn(message, 'id')) {
    if (message.method === 'notifications/initialized') return null;
    return null;
  }
  try {
    if (message.method === 'initialize') {
      return success(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: 'secure-browser-agent',
          title: 'Secure Browser Agent',
          version: '0.1.0'
        },
        instructions: 'Use target-pack tools for authenticated browser operation. Credentials remain in dedicated Chrome profiles; tool outputs are redacted by policy.'
      });
    }
    if (message.method === 'ping') return success(message.id, {});
    if (message.method === 'tools/list') return success(message.id, { tools: listMcpTools() });
    if (message.method === 'tools/call') {
      const params = message.params || {};
      if (!params.name) return failure(message.id, -32602, 'tools/call requires params.name');
      return success(message.id, await callMcpTool(params.name, params.arguments || {}));
    }
    return failure(message.id, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    return failure(message.id, -32000, error.message);
  }
}

export async function runMcpStdio({ input = process.stdin, output = process.stdout, error = process.stderr } = {}) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (parseError) {
      output.write(`${JSON.stringify(failure(null, -32700, 'Parse error', parseError.message))}\n`);
      continue;
    }
    const response = await handleMcpMessage(message);
    if (response) output.write(`${JSON.stringify(response)}\n`);
  }
  error.write('');
}
