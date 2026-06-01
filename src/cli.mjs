#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionWithCdp, analyzeWithCdp, cdpDaemonStatus, consoleSummaryWithCdp, extractWithCdp, inspectWithCdp, networkSummaryWithCdp, observeWithCdp, openCdpProfile, outlineWithCdp, runRecipeWithCdp, scrapeWithCdp, screenshotWithCdp, startCdpDaemon, stopCdpDaemon, waitForWithCdp } from './cdp-backend.mjs';
import { runAgentBrowser, sessionArgs } from './agent-browser.mjs';
import { summarizeHarFile } from './har.mjs';
import { outlineWithPlaywright } from './playwright-adapter.mjs';
import { assertAllowedUrl, assertEngineAllowed, loadPolicy, profilePath, redact, statePath } from './policy.mjs';
import { applyOwnedReap, planOwnedReap } from './reap-owned.mjs';
import { buildExtractScript, buildObserveScript, buildOutlineScript } from './extract-script.mjs';
import { safeOutputPath, writeOutput } from './output.mjs';
import { addTargetOperateStep, addTargetUrls, applyTargetPermissions, buildTargetRunStatus, doctorTargetPack, formatTargetRunStatusCompact, loadTargetAutostart, removeTargetAutostart, resolveTargetAutostart, resolveTargetDaemon, resolveTargetLogin, resolveTargetPack, resolveTargetPermissions, resolveTargetRun, resolveTargetScrape, scaffoldTargetPack, targetAutostartStatus, targetLoginHandoff, targetPermissionStatus, unloadTargetAutostart, writeTargetAutostart, writeTargetPermissions } from './target-pack.mjs';
import { profileStatus } from './profile-status.mjs';
import { runMcpStdio } from './mcp-server.mjs';
import { buildProviderReport, formatProviderReportCompact, formatProviderReportMarkdown } from './provider-report.mjs';
import { buildAgentBrowserDoctor, formatAgentBrowserDoctorCompact } from './agent-browser-doctor.mjs';
import { buildProviderDoctorStatus, formatProviderDoctorStatusCompact } from './provider-doctor-status.mjs';
import { buildBackendMatrix, buildBackendMatrixStatus, formatBackendMatrixCompact, formatBackendMatrixMarkdown, formatBackendMatrixStatusCompact } from './backend-matrix.mjs';
import { formatProviderBenchmarkMarkdown, runProviderBenchmark, writeProviderBenchmarkReport } from './provider-benchmark.mjs';
import { buildLightpandaGate, formatLightpandaGateCompact } from './lightpanda-gate.mjs';
import { buildStatusCache, formatStatusCacheCompact } from './status-cache.mjs';
import { buildTargetWorkerPool, formatTargetWorkerPoolCompact } from './target-worker-pool.mjs';
import { buildTargetBatch, formatTargetBatchCompact, formatTargetBatchMarkdown } from './target-batch.mjs';
import { buildSourceAudit, formatSourceAuditCompact, formatSourceAuditMarkdown } from './source-audit.mjs';
import { buildGithubRepoResearch, formatGithubRepoResearchCompact, formatGithubRepoResearchMarkdown, writeGithubRepoResearch } from './github-repo-research.mjs';
import { formatTargetBenchmarkMarkdown, runTargetBenchmark, writeTargetBenchmarkReport } from './target-benchmark.mjs';
import { auditTargetPack } from './security-audit.mjs';
import { buildRuntimeAudit, buildRuntimeCleanupPlan, formatRuntimeAuditCompact, formatRuntimeAuditMarkdown, formatRuntimeCleanupPlanCompact, formatRuntimeCleanupPlanMarkdown, writeRuntimeAuditReport, writeRuntimeCleanupPlanReport } from './runtime-audit.mjs';
import { buildRunGateAudit, formatRunGateAuditCompact } from './run-gate-audit.mjs';
import { buildCompactCommandAudit, COMPACT_COMMAND_AUDIT_SOURCES, formatCompactCommandAuditCompact } from './compact-command-audit.mjs';
import { buildCompletionProofBundle, buildCompletionProofBundleStatus, buildCompletionProofBundleWatch, formatCompletionProofBundleCompact, formatCompletionProofBundleStatusCompact, formatCompletionProofBundleWatchCompact } from './completion-proof-bundle.mjs';
import { buildReadinessAudit, formatReadinessAuditCompact, formatReadinessAuditMarkdown } from './readiness-audit.mjs';
import { buildObjectiveNext, formatObjectiveNextCompact, formatObjectiveNextMarkdown } from './objective-next.mjs';
import { buildObjectiveResume, formatObjectiveResumeCompact, formatObjectiveResumeMarkdown } from './objective-resume.mjs';
import { buildObjectiveStatus, formatObjectiveStatusCompact, formatObjectiveStatusMarkdown } from './objective-status.mjs';
import { buildObjectiveCompletionAudit, buildObjectiveCompletionAuditStatus, buildObjectiveCompletionAuditWatch, formatObjectiveCompletionAuditCompact, formatObjectiveCompletionAuditMarkdown, formatObjectiveCompletionAuditStatusCompact, formatObjectiveCompletionAuditWatchCompact } from './objective-completion-audit.mjs';
import { buildObjectiveSafeCommand, formatObjectiveSafeCommandCompact } from './objective-safe-command.mjs';
import { buildObjectiveProofPipeline, formatObjectiveProofPipelineCompact, formatObjectiveProofPipelineMarkdown } from './objective-proof-pipeline.mjs';
import { buildObjectiveHandoff, formatObjectiveHandoffCompact, formatObjectiveHandoffMarkdown } from './objective-handoff.mjs';
import { buildTargetProof, buildTargetProofInventory, buildTargetProofNext, buildTargetProofPlan, formatTargetProofInventoryCompact, formatTargetProofInventoryMarkdown, formatTargetProofMarkdown, formatTargetProofNextCompact, formatTargetProofNextMarkdown, formatTargetProofPlanCompact, formatTargetProofPlanMarkdown } from './target-proof.mjs';
import { buildTargetProofCapture, formatTargetProofCaptureCompact, formatTargetProofCaptureMarkdown } from './target-proof-capture.mjs';
import { buildTargetLoginCapture, formatTargetLoginCaptureMarkdown } from './target-login-capture.mjs';
import { buildTargetHandoffResume, buildTargetHandoffResumeStatus, buildTargetHandoffResumeWatch, buildTargetHandoffRun, buildTargetHandoffStatus, formatTargetHandoffResumeCompact, formatTargetHandoffResumeMarkdown, formatTargetHandoffResumeStatusCompact, formatTargetHandoffResumeWatchCompact, formatTargetHandoffRunCompact, formatTargetHandoffRunMarkdown, formatTargetHandoffStatusCompact, formatTargetHandoffStatusMarkdown } from './target-handoff-run.mjs';
import { buildTargetAuthCheck, buildTargetAuthWatch, formatTargetAuthCheckCompact, formatTargetAuthCheckMarkdown, formatTargetAuthWatchCompact, formatTargetAuthWatchMarkdown } from './target-auth-check.mjs';
import { buildTargetBootstrapPlan, formatTargetBootstrapPlanCompact, formatTargetBootstrapPlanMarkdown } from './target-bootstrap-plan.mjs';
import { buildTargetCandidatePlan, buildTargetCandidatePlanStatus, buildTargetCandidatePlanWatch, formatTargetCandidatePlanCompact, formatTargetCandidatePlanMarkdown, formatTargetCandidatePlanStatusCompact, formatTargetCandidatePlanWatchCompact, writeTargetCandidatePlan } from './target-candidate-plan.mjs';
import { buildTargetApprovalPack, buildTargetApprovalPreflight, buildTargetApprovalResume, buildTargetApprovalResumeStatus, buildTargetApprovalResumeWatch, buildTargetApprovalStatus, formatTargetApprovalPackCompact, formatTargetApprovalPackMarkdown, formatTargetApprovalPreflightCompact, formatTargetApprovalResumeCompact, formatTargetApprovalResumeStatusCompact, formatTargetApprovalResumeWatchCompact, formatTargetApprovalStatusCompact, writeTargetApprovalPack } from './target-approval-pack.mjs';
import { buildLightpandaDoctor, formatLightpandaDoctorCompact, formatLightpandaDoctorMarkdown } from './lightpanda-doctor.mjs';
import { buildLightpandaDecision, formatLightpandaDecisionMarkdown, writeLightpandaDecision } from './lightpanda-decision.mjs';
import { buildPlaywrightDoctor, formatPlaywrightDoctorCompact, formatPlaywrightDoctorMarkdown } from './playwright-doctor.mjs';
import { buildSeleniumDoctor, formatSeleniumDoctorCompact, formatSeleniumDoctorMarkdown } from './selenium-doctor.mjs';
import { buildSecretAudit, buildSecretRunPlan, buildSecretRunSelect, buildSecretSetupPlan, formatSecretAuditCompact, formatSecretAuditMarkdown, formatSecretRunPlanCompact, formatSecretRunPlanMarkdown, formatSecretRunSelectCompact, formatSecretSetupPlanCompact, formatSecretSetupPlanMarkdown } from './secret-audit.mjs';
import { buildSecretEnvHandoff, buildSecretEnvHandoffStatus, buildSecretEnvHandoffWatch, formatSecretEnvHandoffCompact, formatSecretEnvHandoffMarkdown, formatSecretEnvHandoffStatusCompact, formatSecretEnvHandoffWatchCompact } from './secret-env-handoff.mjs';
import { buildAgentNext, buildControlStatus, formatAgentNextCompact, formatControlStatusCompact, formatControlStatusMarkdown } from './control-status.mjs';
import { buildAgentProofCloseout, buildAgentProofCloseoutStatus, formatAgentProofCloseoutCompact, formatAgentProofCloseoutStatusCompact } from './agent-proof-closeout.mjs';
import { buildAgentProofChecklist, buildAgentProofChecklistStatus, formatAgentProofChecklistCompact, formatAgentProofChecklistStatusCompact } from './agent-proof-checklist.mjs';
import { buildAgentLoopStep, buildAgentLoopStepStatus, formatAgentLoopStepCompact, formatAgentLoopStepStatusCompact } from './agent-loop-step.mjs';
import { buildAgentProofStep, buildAgentProofStepStart, buildAgentProofStepStatus, formatAgentProofStepCompact, formatAgentProofStepStartCompact, formatAgentProofStepStatusCompact } from './agent-proof-step.mjs';
import { buildAgentWorkflow, formatAgentWorkflowCompact, formatAgentWorkflowMarkdown } from './agent-workflow.mjs';
import { buildAgentBackendSelect, formatAgentBackendSelectCompact } from './agent-backend-select.mjs';
import { buildAgentControlPlane, buildAgentControlPlaneStatus, buildAgentControlPlaneWatch, formatAgentControlPlaneCompact, formatAgentControlPlaneStatusCompact, formatAgentControlPlaneWatchCompact, writeAgentControlPlane } from './agent-control-plane.mjs';
import { buildAgentTask, buildAgentTaskLoop, buildAgentTaskStatus, buildAgentTaskWatch, buildAgentTaskWatchStart, buildAgentTaskWatchStatus, formatAgentTaskCompact, formatAgentTaskLoopCompact, formatAgentTaskStatusCompact, formatAgentTaskWatchCompact, formatAgentTaskWatchStartCompact, formatAgentTaskWatchStatusCompact } from './agent-task.mjs';
import { publicSearchHttp } from './public-search-http.mjs';
import { buildChromeControlPlan, formatChromeControlPlanCompact, formatChromeControlPlanMarkdown } from './chrome-control-plan.mjs';
import { buildBrowserRoute, formatBrowserRouteCompact, formatBrowserRouteMarkdown } from './browser-route.mjs';
import { buildChromeMcpObservation, buildChromeMcpObservationStatus, formatChromeMcpObservationCompact, formatChromeMcpObservationMarkdown, formatChromeMcpObservationStatusCompact } from './chrome-mcp-observation.mjs';
import { buildChromeMcpStatus, formatChromeMcpStatusCompact, formatChromeMcpStatusMarkdown } from './chrome-mcp-status.mjs';
import { buildChromeMcpHandoff, formatChromeMcpHandoffCompact, formatChromeMcpHandoffMarkdown } from './chrome-mcp-handoff.mjs';
import { buildChromeMcpTimeoutPlan, buildChromeMcpTimeoutPlanStatus, formatChromeMcpTimeoutPlanCompact, formatChromeMcpTimeoutPlanMarkdown, formatChromeMcpTimeoutPlanStatusCompact } from './chrome-mcp-timeout-plan.mjs';
import { buildChromeMcpAutostartPlan, buildChromeMcpAutostartPlanStatus, formatChromeMcpAutostartPlanCompact, formatChromeMcpAutostartPlanStatusCompact } from './chrome-mcp-autostart-plan.mjs';
import { buildRegularChromeUse, formatRegularChromeUseCompact, formatRegularChromeUseMarkdown } from './regular-chrome-use.mjs';
import { buildRegularChromeRefresh, buildRegularChromeStatus, buildRegularChromeWatch, formatRegularChromeRefreshCompact, formatRegularChromeStatusCompact, formatRegularChromeWatchCompact } from './regular-chrome-refresh.mjs';
import { buildChromeAppleEventsOutline, buildChromeAppleEventsStatus, formatChromeAppleEventsOutlineCompact, formatChromeAppleEventsOutlineMarkdown, formatChromeAppleEventsStatusCompact, formatChromeAppleEventsStatusMarkdown } from './chrome-apple-events-status.mjs';
import { buildChromeAppleEventsEnablePlan, formatChromeAppleEventsEnablePlanCompact, formatChromeAppleEventsEnablePlanMarkdown } from './chrome-apple-events-enable-plan.mjs';
import { buildChromeExtensionStatus, formatChromeExtensionStatusCompact, formatChromeExtensionStatusMarkdown } from './chrome-extension-status.mjs';
import { buildChromeExtensionHandoff, formatChromeExtensionHandoffCompact, formatChromeExtensionHandoffMarkdown } from './chrome-extension-handoff.mjs';
import { buildChromeExtensionResume, formatChromeExtensionResumeCompact, formatChromeExtensionResumeMarkdown } from './chrome-extension-resume.mjs';
import { buildChromeExtensionTroubleshoot, formatChromeExtensionTroubleshootCompact, formatChromeExtensionTroubleshootMarkdown } from './chrome-extension-troubleshoot.mjs';
import { buildChromeExtensionBackendCheckPlan, formatChromeExtensionBackendCheckPlanCompact, formatChromeExtensionBackendCheckPlanMarkdown } from './chrome-extension-backend-check-plan.mjs';
import { buildChromeExtensionClaimPlan, formatChromeExtensionClaimPlanCompact, formatChromeExtensionClaimPlanMarkdown } from './chrome-extension-claim-plan.mjs';
import { buildProofGateStatus, formatProofGateStatusCompact, formatProofGateStatusMarkdown } from './proof-gate-status.mjs';
import { buildProofGateWatch, formatProofGateWatchCompact, formatProofGateWatchMarkdown } from './proof-gate-watch.mjs';
import { buildLoginHandoffStatus, formatLoginHandoffStatusCompact, formatLoginHandoffStatusMarkdown } from './login-handoff-status.mjs';
import { buildOperatorPack, buildOperatorPackStatus, formatOperatorPackCompact, formatOperatorPackMarkdown, formatOperatorPackStatusCompact } from './operator-pack.mjs';
import { buildOperatorRunbook, buildOperatorRunbookStatus, buildOperatorRunbookWatch, formatOperatorRunbookCompact, formatOperatorRunbookMarkdown, formatOperatorRunbookStatusCompact, formatOperatorRunbookWatchCompact } from './operator-runbook.mjs';
import { buildBackgroundMonitorPlan, formatBackgroundMonitorPlanCompact, formatBackgroundMonitorPlanMarkdown } from './background-monitor-plan.mjs';
import { buildBackgroundProofCapturePlan, formatBackgroundProofCapturePlanCompact, formatBackgroundProofCapturePlanMarkdown } from './background-proof-capture-plan.mjs';
import { buildBackgroundProofCaptureStatus, formatBackgroundProofCaptureStatusCompact, formatBackgroundProofCaptureStatusMarkdown } from './background-proof-capture-status.mjs';
import { buildBackgroundProofCaptureStart, formatBackgroundProofCaptureStartCompact, formatBackgroundProofCaptureStartMarkdown } from './background-proof-capture-start.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const [rawKey, inlineValue] = item.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
    } else if (rest[index + 1] && !rest[index + 1].startsWith('--')) {
      flags[rawKey] = rest[index + 1];
      index += 1;
    } else {
      flags[rawKey] = true;
    }
  }
  return { command, flags, positional };
}

function ensureDirs(policy, profileName) {
  fs.mkdirSync(policy.outputDir, { recursive: true });
  fs.mkdirSync(profilePath(policy, profileName), { recursive: true });
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isDataUrl(url) {
  return typeof url === 'string' && url.startsWith('data:');
}

function searchUrl(provider, query) {
  const encoded = encodeURIComponent(query);
  if (provider === 'brave') return `https://search.brave.com/search?q=${encoded}`;
  if (provider === 'google') return `https://www.google.com/search?igu=1&q=${encoded}`;
  return `https://html.duckduckgo.com/html/?q=${encoded}`;
}

function searchStatus(provider, query, outline) {
  const haystack = `${outline.title || ''} ${outline.url || ''} ${JSON.stringify(outline.forms || [])}`.toLowerCase();
  const challenge = haystack.includes('captcha') || haystack.includes('sorry/index') || haystack.includes('anomaly.js') || haystack.includes('challenge');
  return {
    provider,
    query,
    challenge,
    resultLinks: (outline.links || []).filter((link) => link.text && link.href && !link.href.includes('/settings') && !link.href.includes('/html/')).length
  };
}

function readJsonFile(filePath) {
  if (!filePath) throw new Error('JSON file path is required');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTextFlag(flags, textKey, fileKey) {
  if (typeof flags[textKey] === 'string') return flags[textKey];
  if (typeof flags[fileKey] === 'string') return fs.readFileSync(flags[fileKey], 'utf8');
  return '';
}

function readFirstTextFlag(flags, pairs) {
  for (const [textKey, fileKey] of pairs) {
    const value = readTextFlag(flags, textKey, fileKey);
    if (value) return value;
  }
  return '';
}

function expandRecipeSearchSteps(recipe) {
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
  for (const url of recipe.urls || []) {
    assertAllowedUrl(url, policy);
  }
  for (const step of recipe.steps || []) {
    if (step.url) assertAllowedUrl(step.url, policy);
  }
}

async function main() {
  const { command, flags, positional } = parseArgs(process.argv.slice(2));
  const policy = loadPolicy(flags.policy);
  const profileName = flags.profile || policy.defaultProfile || 'default';
  const engine = flags.engine || policy.defaultEngine || 'chrome';

  if (!command || command === 'help') {
    process.stdout.write(`secure-browser-agent

Commands:
  doctor [--offline]
  agent-next [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|compact]
  agent-preflight [--candidate github|google-drive|notion] [--real-external] [--format json|compact]
  agent-proof-checklist [--candidate github|google-drive|notion] [--write] [--out operator/agent-proof-checklist-latest.json] [--format json|compact]
  agent-proof-checklist-status [--in operator/agent-proof-checklist-latest.json] [--stale-after-seconds 900] [--format json|compact]
  agent-proof-closeout [--candidate github|google-drive|notion] [--include-compact-command-audit] [--write] [--out operator/agent-proof-closeout-latest.json] [--checklist-in operator/agent-proof-checklist-latest.json] [--format json|compact]
  agent-proof-closeout-status [--in operator/agent-proof-closeout-latest.json] [--stale-after-seconds 900] [--format json|compact]
  control-status [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|markdown|compact]
  agent-workflow [--task search|observe|inspect|analyze|scrape|operate|screenshot|diagnose|crawl|links|existing-tab|public-crawl|auth-proof] [--target-dir dir] [--query text] [--provider duckduckgo|brave|google] [--intent inspect|operate|screenshot|console|network] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--match-origin origin] [--match-path path] [--tab-index n] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--format json|markdown|compact]
  agent-backend-select [--task search|observe|inspect|analyze|scrape|operate|screenshot|diagnose|crawl|links|existing-tab|public-crawl|auth-proof] [--target-dir dir] [--query text] [--provider duckduckgo|brave|google] [--backend-matrix-in operator/backend-matrix-latest.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--chrome-mcp-connected yes|no] [--chrome-mcp-page-list-ok yes|no] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--match-origin origin] [--match-path path] [--tab-index n] [--format json|compact]
  agent-control-plane [--write] [--out operator/agent-control-plane-latest.json] [--task search|analyze|scrape|operate|existing-tab|public-crawl] [--target-dir dir] [--query text] [--provider duckduckgo|brave|google] [--backend-matrix-in operator/backend-matrix-latest.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--chrome-mcp-connected yes|no] [--chrome-mcp-page-list-ok yes|no] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|compact]
  agent-control-plane-status [--in operator/agent-control-plane-latest.json] [--stale-after-seconds 900] [--format json|compact]
  agent-control-plane-watch [--run] [--in operator/agent-control-plane-latest.json] [--out operator/agent-control-plane-latest.json] [--stale-after-seconds 900] [--task search|analyze|scrape|operate|existing-tab|public-crawl] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--format json|compact]
  agent-task [--run] [--write] [--out operator/agent-task-latest.json] [--task search|observe|inspect|analyze|scrape|operate|screenshot|diagnose|crawl|links|existing-tab|public-crawl|auth-proof] [--target-dir dir] [--query text] [--provider duckduckgo|brave|google] [--search-providers brave,google,duckduckgo] [--intent inspect|operate|screenshot|console|network] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--match-origin origin] [--match-path path] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--timeout-ms 120000] [--format json|compact]
  agent-task-status [--in operator/agent-task-latest.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--stale-after-seconds 900] [--timeout-ms 120000] [--format json|compact]
  agent-task-watch [--run] [--in operator/agent-task-latest.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--stale-after-seconds 900] [--timeout-ms 120000] [--format json|compact]
  agent-task-loop [--run] [--in operator/agent-task-latest.json] [--iterations 3] [--interval-ms 0] [--status-out operator/agent-task-loop-status.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--stale-after-seconds 900] [--timeout-ms 120000] [--format json|compact]
  agent-task-watch-start [--run] [--operator-ok OK] [--force] [--in operator/agent-task-latest.json] [--log-path operator/agent-task-watch.log] [--pid-path operator/agent-task-watch.pid] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--stale-after-seconds 900] [--timeout-ms 120000] [--format json|compact]
  agent-task-watch-status [--in operator/agent-task-latest.json] [--log-path operator/agent-task-watch.log] [--pid-path operator/agent-task-watch.pid] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--max-log-lines 10] [--format json|compact]
  search-http <query> [--provider duckduckgo] [--limit 10]
  agent-loop-step [--run] [--write] [--out operator/agent-loop-step-latest.json] [--timeout-ms 300000] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|compact]
  agent-loop-step-status [--in operator/agent-loop-step-latest.json] [--stale-after-seconds 900] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|compact]
  agent-proof-step [--run --operator-ok OK] [--write] [--out operator/agent-proof-step-latest.json] [--target-dir dir] [--handoff operator-handoff.json] [--timeout-ms 300000] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|compact]
  agent-proof-step-start [--run] [--operator-ok OK] [--force] [--out operator/agent-proof-step-latest.json] [--log-path operator/agent-proof-step.log] [--pid-path operator/agent-proof-step.pid] [--timeout-ms 300000] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|compact]
  agent-proof-step-status [--in operator/agent-proof-step-latest.json] [--log-path operator/agent-proof-step.log] [--pid-path operator/agent-proof-step.pid] [--max-log-lines 10] [--format json|compact]
  chrome-control-plan [--lane auto|target-pack|regular-chrome|codex-browser-agent] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--format json|markdown|compact]
  chrome-mcp-observation [--status-text text|--status-file file] [--list-pages-text text|--list-pages-file file] [--observed-connected yes|no|unknown] [--observed-tools n] [--observed-page-list-ok yes|no|unknown] [--observed-page-count n] [--observed-list-pages-timed-out yes|no] [--observed-last-error text] [--source text] [--intent inspect|operate|screenshot|console|network] [--write] [--out operator/chrome-mcp-observation-latest.json] [--format json|markdown|compact]
  chrome-mcp-observation-status [--in operator/chrome-mcp-observation-latest.json] [--stale-after-seconds 900] [--format json|compact]
  chrome-mcp-status [--observed-connected yes|no] [--observed-tools n] [--observed-page-list-ok yes|no] [--observed-page-count n] [--observed-last-error text] [--observed-source text] [--format json|markdown|compact]
  chrome-mcp-handoff [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--chrome-mcp-connected yes|no] [--chrome-mcp-tools n] [--chrome-mcp-page-list-ok yes|no] [--chrome-mcp-page-count n] [--chrome-mcp-last-error text] [--chrome-mcp-source text] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--format json|markdown|compact]
  chrome-mcp-timeout-plan [--write] [--out operator/chrome-mcp-timeout-plan-latest.json] [--observed-connected yes|no] [--observed-tools n] [--observed-page-list-ok yes|no] [--observed-page-count n] [--observed-last-error text] [--observed-source text] [--owner-limit n] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--format json|markdown|compact]
  chrome-mcp-timeout-plan-status [--in operator/chrome-mcp-timeout-plan-latest.json] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--stale-after-seconds 900] [--format json|compact]
  chrome-mcp-autostart-plan [--write] [--out operator/chrome-mcp-autostart-plan-latest.json] [--label local.secure-browser-agent.chrome-devtools-mcp] [--browser-url http://127.0.0.1:9223] [--headless yes|no] [--format json|compact]
  chrome-mcp-autostart-plan-status [--in operator/chrome-mcp-autostart-plan-latest.json] [--format json|compact]
  regular-chrome-use [--intent inspect|operate|screenshot|console|network] [--status-text text|--status-file file] [--list-pages-text text|--list-pages-file file] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--chrome-mcp-connected yes|no] [--chrome-mcp-tools n] [--chrome-mcp-page-list-ok yes|no] [--chrome-mcp-page-count n] [--chrome-mcp-last-error text] [--chrome-mcp-source text] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--chrome-extension-prepared yes|no] [--chrome-extension-backend-available yes|no] [--chrome-extension-backend-last-error text] [--chrome-extension-window-retry-attempted yes|no] [--apple-events-active-tab-observed yes|no] [--apple-events-javascript-allowed yes|no] [--apple-events-status-file operator/chrome-apple-events-status-latest.json] [--write] [--out operator/regular-chrome-use-latest.json] [--plugin-dir dir] [--format json|markdown|compact]
  regular-chrome-refresh [--intent inspect|operate|screenshot|console|network] [--apple-events-out operator/chrome-apple-events-status-latest.json] [--out operator/regular-chrome-use-latest.json] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--format json|compact]
  regular-chrome-status [--in operator/regular-chrome-use-latest.json] [--apple-events-in operator/chrome-apple-events-status-latest.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--stale-after-seconds 900] [--format json|compact]
  regular-chrome-watch [--run] [--force] [--in operator/regular-chrome-use-latest.json] [--apple-events-in operator/chrome-apple-events-status-latest.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--stale-after-seconds 900] [--format json|compact]
  chrome-apple-events-status [--write] [--out operator/chrome-apple-events-status-latest.json] [--format json|markdown|compact]
  chrome-apple-events-enable-plan [--write] [--out operator/chrome-apple-events-enable-plan-latest.json] [--format json|markdown|compact]
  chrome-apple-events-outline [--run] [--operator-ok OK] [--write] [--out operator/chrome-apple-events-outline-latest.json] [--format json|markdown|compact]
  browser-route [--task auto|search|analyze|scrape|operate|existing-tab|authenticated-scrape|public-crawl|compatibility-test] [--chrome-mcp-connected yes|no] [--chrome-mcp-tools n] [--chrome-mcp-page-list-ok yes|no] [--chrome-mcp-page-count n] [--chrome-mcp-last-error text] [--chrome-mcp-source text] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--format json|markdown|compact]
  chrome-extension-status [--plugin-dir dir] [--format json|markdown|compact]
  chrome-extension-handoff [--write] [--out operator/chrome-extension-handoff.json] [--plugin-dir dir] [--format json|markdown|compact]
  chrome-extension-resume [--run] [--operator-ok OK] [--dry-run] [--plugin-dir dir] [--format json|markdown|compact]
  chrome-extension-troubleshoot [--backend-available yes|no|unknown] [--backend-last-error text] [--profile-window-retry-attempted yes|no] [--plugin-dir dir] [--format json|markdown|compact]
  chrome-extension-backend-check-plan [--backend-available yes|no|unknown] [--plugin-dir dir] [--format json|markdown|compact]
  chrome-extension-claim-plan [--backend-ready yes|no|unknown] [--intent inspect|operate|screenshot|console|network] [--match-title text] [--match-url text] [--match-origin origin] [--match-path path] [--tab-index n] [--plugin-dir dir] [--format json|markdown|compact]
  providers|provider-status [--format json|markdown|compact]
  agent-browser-doctor [--format json|compact]
  provider-doctor-status [--format json|compact]
  backend-matrix [--write] [--out operator/backend-matrix-latest.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--format json|markdown|compact]
  backend-matrix-status [--in operator/backend-matrix-latest.json] [--mcp-observation-in operator/chrome-mcp-observation-latest.json] [--allow-new-background-tab yes|no] [--new-background-url-env VAR] [--stale-after-seconds 900] [--format json|compact]
  status-cache --key provider-doctor-status|backend-matrix|control-status [--write] [--stale-after-seconds 900] [--format json|compact]
  source-audit [--format json|compact|markdown]
  github-repo-research [--limit 12] [--local-only] [--write] [--out research/github-repo-research-latest.json] [--format json|compact|markdown]
  target-worker-pool [--target-dir runs/target-packs/name] [--format json|compact]
  lightpanda-gate [--format json|compact]
  lightpanda-doctor [--format json|markdown|compact]
  lightpanda-decision [--decision reject|adopt] [--reason text] [--write] [--out provider-benchmarks/lightpanda-decision.json] [--format json|markdown]
  playwright-doctor [--format json|markdown|compact]
  selenium-doctor [--format json|markdown|compact]
  secret-audit [--format json|markdown|compact]
  secret-setup-plan [--mode service-account|connect|local-desktop] [--format json|markdown|compact]
  secret-run-plan [--mode service-account|connect] [--command control-status|secret-audit|target-login-capture|target-proof-capture] [--target-dir dir] [--format json|markdown|compact]
  secret-run-select [--command control-status|secret-audit|target-login-capture|target-proof-capture] [--target-dir dir] [--format json|compact]
  secret-env-handoff [--mode environment-local-env|service-account|connect|local-desktop] [--environment-name name] [--mount-path path] [--write] [--out operator/secret-env-handoff.json] [--format json|markdown|compact]
  secret-env-handoff-status [--in operator/secret-env-handoff.json] [--stale-after-seconds 900] [--format json|compact]
  secret-env-handoff-watch [--run] [--in operator/secret-env-handoff.json] [--out operator/secret-env-handoff.json] [--stale-after-seconds 900] [--mode environment-local-env|service-account|connect|local-desktop] [--environment-name name] [--mount-path path] [--format json|compact]
  benchmark [--quick] [--iterations 2] [--rows 40] [--url public-url] [--write] [--out provider-benchmarks/latest.json] [--format json|markdown]
  target-benchmark <target-pack-dir> [--recipes observe,inspect] [--modes cold,daemon] [--iterations 1] [--write] [--out proof/target-benchmark.json] [--format json|markdown]
  runtime-audit [--write] [--out runtime/runtime-audit.json] [--format json|markdown|compact]
  runtime-cleanup-plan [--write] [--out runtime/runtime-cleanup-plan.json] [--format json|markdown|compact] [--owner-limit 12]
  run-gate-audit [--format json|compact] [--strict]
  compact-command-audit [--source ${COMPACT_COMMAND_AUDIT_SOURCES.join('|')}|all] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|compact] [--strict]
  completion-proof-bundle [--candidate github|google-drive|notion] [--include-compact-command-audit] [--write] [--out operator/completion-proof-bundle-latest.json] [--format json|compact] [--strict]
  completion-proof-bundle-status [--in operator/completion-proof-bundle-latest.json] [--stale-after-seconds 900] [--format json|compact] [--strict]
  completion-proof-bundle-watch [--run] [--in operator/completion-proof-bundle-latest.json] [--out operator/completion-proof-bundle-latest.json] [--stale-after-seconds 900] [--candidate github|google-drive|notion] [--format json|compact]
  readiness-audit [--format json|markdown|compact] [--strict]
  objective-completion-audit [--write] [--out operator/objective-completion-audit-latest.json] [--format json|markdown|compact] [--strict]
  objective-completion-audit-status [--in operator/objective-completion-audit-latest.json] [--stale-after-seconds 900] [--format json|compact] [--strict]
  objective-completion-audit-watch [--run] [--in operator/objective-completion-audit-latest.json] [--out operator/objective-completion-audit-latest.json] [--stale-after-seconds 900] [--format json|compact]
  objective-safe-command [--write] [--out operator/objective-safe-command-latest.json] [--monitor-timeout-ms 300000] [--monitor-interval-ms 5000] [--format json|compact]
  objective-proof-pipeline [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|markdown|compact]
  objective-handoff [--write] [--out objective-handoff.json] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|markdown|compact]
  operator-pack [--write] [--out operator/operator-pack-latest.json] [--regular-chrome-use-in operator/regular-chrome-use-latest.json] [--saved-regular-chrome-max-age-seconds 900] [--agent-loop-step-status-in operator/agent-loop-step-latest.json] [--agent-loop-step-timeout-ms 300000] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--chrome-mcp-status-text text|--chrome-mcp-status-file file] [--chrome-mcp-list-pages-text text|--chrome-mcp-list-pages-file file] [--chrome-status-text text|--chrome-status-file file] [--chrome-list-pages-text text|--chrome-list-pages-file file] [--chrome-mcp-connected yes|no|unknown] [--chrome-mcp-page-list-ok yes|no|unknown] [--chrome-mcp-last-error text] [--chrome-extension-backend-available yes|no|unknown] [--chrome-extension-backend-last-error text] [--chrome-extension-window-retry-attempted yes|no] [--apple-events-active-tab-observed yes|no|unknown] [--apple-events-javascript-allowed yes|no|unknown] [--apple-events-status-file operator/chrome-apple-events-status-latest.json] [--format json|markdown|compact]
  operator-pack-status [--in operator/operator-pack-latest.json] [--stale-after-seconds 900] [--format json|compact]
  operator-runbook [--write] [--out operator/operator-runbook.md] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|markdown|compact]
  operator-runbook-status [--in operator/operator-runbook-latest.json] [--stale-after-seconds 900] [--format json|compact]
  operator-runbook-watch [--run] [--in operator/operator-runbook-latest.json] [--out operator/operator-runbook-latest.json] [--stale-after-seconds 900] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|compact]
  objective-next [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--format json|markdown|compact] [--strict]
  objective-status [--write] [--out operator/objective-status-latest.json] [--format json|markdown|compact]
  proof-gate-status [--write] [--out operator/proof-gate-status-latest.json] [--format json|markdown|compact] [--strict]
  proof-gate-watch [--write] [--out operator/proof-gate-watch-status.json] [--timeout-ms 300000] [--interval-ms 5000] [--format json|markdown|compact] [--strict]
  login-handoff-status [--write] [--out operator/login-handoff-status-latest.json] [--format json|markdown|compact]
  background-monitor-plan [--timeout-ms 300000] [--interval-ms 5000] [--status-out operator/background-proof-gate-watch-status.json] [--log-path runs/operator/background-proof-gate-watch.log] [--pid-path runs/operator/background-proof-gate-watch.pid] [--format json|markdown|compact]
  background-proof-capture-plan [--timeout-ms 300000] [--interval-ms 5000] [--monitor-log-path runs/operator/background-auth-monitor.log] [--monitor-pid-path runs/operator/background-auth-monitor.pid] [--capture-log-path runs/operator/background-proof-capture.log] [--capture-pid-path runs/operator/background-proof-capture.pid] [--format json|markdown|compact]
  background-proof-capture-status [--target-dir runs/target-packs/name] [--max-log-lines 5] [--format json|markdown|compact]
  background-proof-capture-start [--mode monitor|capture] [--timeout-ms 300000] [--interval-ms 5000] [--monitor-timeout-ms ms] [--monitor-interval-ms ms] [--run] [--operator-ok OK] [--force] [--format json|markdown|compact]
  objective-resume [--run] [--operator-ok OK] [--operator-ready] [--manual-candidate 1|open-only|login-capture-wait] [--wait-auth-timeout-ms 300000] [--wait-auth-interval-ms 5000] [--timeout-ms 360000] [--write] [--out operator/objective-resume-latest.json] [--format json|markdown|compact] [--strict]
  mcp-stdio
  open <url> [--profile name] [--headed]
  login <url> [--profile name] --headed
  snapshot [--profile name] [--json]
  extract <url> --selector <css> [--fields text,href,attr:data-id] [--limit 50] [--engine chrome|lightpanda] [--state-only]
  outline <url> [--profile name] [--out file.json]
  observe-cdp <url> [--profile name] [--out file.json] [--daemon]
  analyze-cdp <url> [--profile name] [--out file.json] [--daemon]
  scrape-cdp <url> [--profile name] [--selector css] [--suggestion 0] [--fields text,href] [--limit 50] [--out file.json|file.csv] [--format json|csv] [--daemon]
  inspect-cdp <url> [--profile name] [--out file.json] [--daemon]
  wait-cdp <url> [--selector css] [--text text] [--url-includes text] [--timeout-ms 5000] [--daemon]
  console-cdp <url> [--wait-ms 300] [--limit 100] [--daemon]
  screenshot-cdp <url> --out file.png [--full-page] [--wait-ms 300] [--daemon]
  extract-cdp <url> --selector <css> [--fields text,href] [--out file.json|file.csv] [--format json|csv] [--daemon]
  outline-cdp <url> [--out file.json] [--daemon]
  fill-cdp <url> --selector <css> --value <text> [--out file.json] [--daemon]
  click-cdp <url> --selector <css> [--out file.json] [--daemon]
  network-cdp <url> [--out file.json] [--daemon]
  login-cdp <url> [--profile name]
  search-cdp <query> [--provider duckduckgo|brave|google] [--profile name]
  scaffold-target <name> --origin <https://host[,https://other]> [--login-url url] [--page-url url] [--query text] [--search-provider duckduckgo|brave|google] [--permissions clipboard,downloads] [--force]
  target-doctor <target-pack-dir>
  target-audit <target-pack-dir> [--profile name]
  target-bootstrap-plan --name target --origin https://host[,https://auth-host] [--login-url url] [--page-url url] [--permissions clipboard,downloads] [--format json|markdown|compact]
  target-candidate-plan [--candidate github|google-drive|notion] [--write] [--out operator/target-candidate-plan-latest.json] [--format json|markdown|compact]
  target-candidate-plan-status [--in operator/target-candidate-plan-latest.json] [--stale-after-seconds 900] [--format json|compact]
  target-candidate-plan-watch [--run] [--in operator/target-candidate-plan-latest.json] [--out operator/target-candidate-plan-latest.json] [--stale-after-seconds 900] [--candidate github|google-drive|notion] [--format json|compact]
  target-approval-pack [--candidate github|google-drive|notion] [--write] [--out operator/target-approval-github.json] [--format json|markdown|compact]
  target-approval-preflight [--candidate github|google-drive|notion] [--real-external] [--format json|compact]
  target-approval-status [--candidate github|google-drive|notion] [--in operator/target-approval-github.json] [--real-external] [--format json|compact]
  target-approval-resume [--candidate github|google-drive|notion] [--real-external] [--run --operator-ok OK] [--write] [--out operator/target-approval-resume-latest.json] [--format json|compact]
  target-approval-resume-status [--in operator/target-approval-resume-latest.json] [--stale-after-seconds 900] [--format json|compact]
  target-approval-resume-watch [--run] [--in operator/target-approval-resume-latest.json] [--out operator/target-approval-resume-latest.json] [--stale-after-seconds 900] [--candidate github|google-drive|notion] [--real-external] [--format json|compact]
  target-auth-check <target-pack-dir> [--profile name] [--cdp-port port|--handoff operator-handoff.json] [--write] [--status-out auth-check-status.json] [--daemon] [--strict] [--format json|markdown|compact]
  target-auth-watch <target-pack-dir> [--profile name] [--cdp-port port|--handoff operator-handoff.json] [--status-out auth-watch-status.json] [--timeout-ms 300000] [--interval-ms 5000] [--daemon] [--strict] [--format json|markdown|compact]
  target-proof-inventory [--real-external] [--strict] [--outputs observe.json,inspect.json,scrape.csv] [--format json|markdown|compact]
  target-proof-next [--real-external] [--strict] [--outputs observe.json,inspect.json,scrape.csv] [--format json|markdown]
  target-proof-plan <target-pack-dir> [--real-external] [--strict] [--benchmark-file file] [--outputs observe.json,inspect.json,scrape.csv] [--format json|markdown|compact]
  target-proof-capture <target-pack-dir> [--real-external] [--run] [--wait-auth] [--auth-check-port port] [--wait-auth-timeout-ms 300000] [--wait-auth-interval-ms 5000] [--wait-auth-status-out wait-auth-status.json] [--benchmark-file file] [--apply-permissions] [--stop-daemon] [--completion-audit] [--no-cleanup-on-failure] [--format json|markdown|compact]
  target-batch <target-pack-dir> [--real-external] [--run] [--wait-auth] [--format json|markdown|compact]
  target-proof <target-pack-dir> [--real-external] [--write] [--strict] [--benchmark-file file] [--outputs observe.json,inspect.json,scrape.csv] [--format json|markdown]
  target-info <target-pack-dir>
  target-status <target-pack-dir> [--profile name]
  target-add-url <target-pack-dir> <url...> [--dry-run]
  target-operate-add <target-pack-dir> fill|click|wait-for|wait|observe|inspect|extract [--selector css] [--value text|--value-env ENV] [--text text] [--url-includes text] [--as name] [--dry-run]
  target-login <target-pack-dir> [--profile name] [--real-external] [--dry-run]
  target-login-capture <target-pack-dir> [--profile name] [--real-external] [--dry-run] [--open-only] [--handoff-out file.json|file.md] [--handoff-format json|markdown] [--wait-auth-timeout-ms 300000] [--wait-auth-interval-ms 5000] [--wait-auth-status-out wait-auth-status.json] [--format json|markdown]
  target-handoff-status <target-pack-dir> [--handoff operator-handoff.json] [--format json|markdown|compact]
  target-handoff-run <target-pack-dir> [--handoff operator-handoff.json] [--command post-login-capture] [--run] [--out handoff-run.json] [--no-preflight-auth] [--format json|markdown|compact]
  target-handoff-resume <target-pack-dir> [--handoff operator-handoff.json] [--run] [--open-login] [--wait-auth] [--wait-auth-timeout-ms 300000] [--wait-auth-interval-ms 5000] [--wait-auth-status-out handoff-resume-wait-auth-status.json] [--out handoff-resume.json] [--format json|markdown|compact]
  target-handoff-resume-status <target-pack-dir> [--handoff operator-handoff.json] [--in handoff-resume-latest.json] [--wait-auth-status-out handoff-resume-wait-auth-status.json] [--auth-watch-in auth-watch-status.json] [--auth-check-in auth-check-status.json] [--monitor-timeout-ms 300000] [--monitor-interval-ms 5000] [--format json|compact]
  target-handoff-resume-watch <target-pack-dir> [--handoff operator-handoff.json] [--run --operator-ok OK] [--in handoff-resume-latest.json] [--wait-auth-status-out handoff-resume-wait-auth-status.json] [--auth-watch-in auth-watch-status.json] [--auth-check-in auth-check-status.json] [--monitor-timeout-ms 300000] [--monitor-interval-ms 5000] [--format json|compact]
  target-permissions <target-pack-dir> [status|plan|set|apply] [--allow clipboard,downloads,notifications] [--origin https://host]
  target-daemon <target-pack-dir> [start|status|stop] [--profile name] [--headed] [--url url]
  target-autostart <target-pack-dir> [plan|write|install|load|unload|status|remove] [--profile name] [--interval seconds] [--url url] [--plist file] [--install-path file]
  target-run <target-pack-dir> [diagnose|observe|inspect|analyze|operate|screenshot|crawl|crawl-links|outline|links|search] [--profile name] [--out file] [--format json|csv] [--result name] [--daemon]
  target-run-status <target-pack-dir> [diagnose|observe|inspect|analyze|operate|scrape|screenshot|crawl|crawl-links|outline|links|search] [--in output.json] [--stale-after-seconds 900] [--format json|compact]
  target-scrape <target-pack-dir> [--url url] [--selector css] [--suggestion 0] [--fields text,href] [--out file.csv] [--format json|csv] [--daemon]
  run-cdp <recipe.json> [--profile name] [--out file.json|file.csv] [--format json|csv] [--result name] [--manifest] [--daemon]
  outline-playwright <url> [--out file.json]
  capture-har <url> --out file.har
  har-summary <file.har> [--out file.json]
  reap-owned [--apply]
  search <query> [--profile name]
  profile-info [--profile name]
  profile-status [--profile name]
  cdp-start [--profile name] [--headed] [--url url]
  cdp-status [--profile name]
  cdp-stop [--profile name]
  close-session [--profile name]

Safety:
  URLs must match config/example-policy.json allowedOrigins.
  Profiles and storage state stay under profiles/ and are gitignored.
  --manifest writes an audit JSON next to --out.
`);
    return;
  }

  assertEngineAllowed(engine, profileName, policy);
  const outputMetadata = {
    command,
    profile: profileName,
    engine,
    argv: process.argv.slice(2)
  };

  if (command === 'doctor') {
    if (flags.offline) {
      process.stdout.write(formatAgentBrowserDoctorCompact(buildAgentBrowserDoctor({
        rootDir: process.cwd()
      })));
      return;
    }
    const args = ['doctor'];
    const result = await runAgentBrowser(args).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
      return {
        stdout: formatAgentBrowserDoctorCompact(buildAgentBrowserDoctor({
          rootDir: process.cwd()
        }))
      };
    });
    process.stdout.write(result.stdout);
    return;
  }

  if (command === 'control-status') {
    const status = await buildControlStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatControlStatusCompact(status));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatControlStatusMarkdown(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'agent-next') {
    const status = await buildControlStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    const next = buildAgentNext(status);
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentNextCompact(next));
    } else {
      printJson(next);
    }
    return;
  }

  if (command === 'agent-preflight') {
    const result = await buildTargetApprovalPreflight({
      ...flags,
      candidate: flags.candidate || positional[0] || 'github',
      realExternal: true,
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalPreflightCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'agent-proof-checklist') {
    const result = await buildAgentProofChecklist({
      ...flags,
      candidate: flags.candidate || positional[0] || 'github',
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentProofChecklistCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'agent-proof-checklist-status') {
    const result = buildAgentProofChecklistStatus({
      ...flags,
      in: flags.in || positional[0],
      candidate: flags.candidate || 'github',
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentProofChecklistStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'agent-proof-closeout') {
    const result = await buildAgentProofCloseout({
      ...flags,
      candidate: flags.candidate || positional[0] || 'github',
      checklistIn: flags['checklist-in'] || flags.checklistIn,
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentProofCloseoutCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'agent-proof-closeout-status') {
    const result = buildAgentProofCloseoutStatus({
      ...flags,
      in: flags.in || positional[0],
      candidate: flags.candidate || 'github',
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentProofCloseoutStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'agent-workflow') {
    const workflowTask = flags.task || positional[0] || flags.intent || 'auto';
    const workflow = await buildAgentWorkflow({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      task: workflowTask,
      targetDir: flags['target-dir'] || flags.targetDir || positional[1] || '',
      query: flags.query || '',
      provider: flags.provider || 'duckduckgo',
      chromeMcpConnected: flags['chrome-mcp-connected'] || flags.chromeMcpConnected,
      chromeMcpTools: flags['chrome-mcp-tools'] || flags.chromeMcpTools,
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'] || flags.chromeMcpPageListOk,
      chromeMcpPageCount: flags['chrome-mcp-page-count'] || flags.chromeMcpPageCount,
      chromeMcpLastError: flags['chrome-mcp-last-error'] || flags.chromeMcpLastError,
      chromeMcpSource: flags['chrome-mcp-source'] || flags.chromeMcpSource,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      chromeExtensionPrepared: flags['chrome-extension-prepared'] || flags.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: flags['chrome-extension-backend-available'] || flags.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: flags['chrome-extension-backend-last-error'] || flags.chromeExtensionBackendLastError,
      chromeExtensionWindowRetryAttempted: flags['chrome-extension-window-retry-attempted'] || flags.chromeExtensionWindowRetryAttempted,
      appleEventsActiveTabObserved: flags['apple-events-active-tab-observed'] || flags.appleEventsActiveTabObserved,
      appleEventsJavascriptAllowed: flags['apple-events-javascript-allowed'] || flags.appleEventsJavascriptAllowed,
      appleEventsStatusFile: flags['apple-events-status-file'] || flags.appleEventsStatusFile,
      intent: flags.intent || '',
      matchTitle: flags['match-title'] || flags.matchTitle || '',
      matchUrl: flags['match-url'] || flags.matchUrl || '',
      matchOrigin: flags['match-origin'] || flags.matchOrigin || '',
      matchPath: flags['match-path'] || flags.matchPath || '',
      tabIndex: flags['tab-index'] || flags.tabIndex
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentWorkflowCompact(workflow));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatAgentWorkflowMarkdown(workflow));
    } else {
      printJson(workflow);
    }
    return;
  }

  if (command === 'agent-backend-select') {
    const selection = await buildAgentBackendSelect({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      task: flags.task || positional[0] || 'auto',
      targetDir: flags['target-dir'] || flags.targetDir || positional[1] || '',
      query: flags.query || '',
      provider: flags.provider || 'duckduckgo',
      backendMatrixIn: flags['backend-matrix-in'] || flags.backendMatrixIn || flags.matrixIn,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      chromeMcpConnected: flags['chrome-mcp-connected'] || flags.chromeMcpConnected,
      chromeMcpTools: flags['chrome-mcp-tools'] || flags.chromeMcpTools,
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'] || flags.chromeMcpPageListOk,
      chromeMcpPageCount: flags['chrome-mcp-page-count'] || flags.chromeMcpPageCount,
      chromeMcpLastError: flags['chrome-mcp-last-error'] || flags.chromeMcpLastError,
      chromeMcpSource: flags['chrome-mcp-source'] || flags.chromeMcpSource,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      chromeExtensionPrepared: flags['chrome-extension-prepared'] || flags.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: flags['chrome-extension-backend-available'] || flags.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: flags['chrome-extension-backend-last-error'] || flags.chromeExtensionBackendLastError,
      matchOrigin: flags['match-origin'] || flags.matchOrigin || '',
      matchPath: flags['match-path'] || flags.matchPath || '',
      tabIndex: flags['tab-index'] || flags.tabIndex
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentBackendSelectCompact(selection));
    } else {
      printJson(selection);
    }
    return;
  }

  if (command === 'agent-control-plane') {
    const status = await buildAgentControlPlane({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      task: flags.task || positional[0] || 'auto',
      targetDir: flags['target-dir'] || flags.targetDir || positional[1] || '',
      query: flags.query || '',
      provider: flags.provider || 'duckduckgo',
      backendMatrixIn: flags['backend-matrix-in'] || flags.backendMatrixIn || flags.matrixIn,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      chromeMcpConnected: flags['chrome-mcp-connected'] || flags.chromeMcpConnected,
      chromeMcpTools: flags['chrome-mcp-tools'] || flags.chromeMcpTools,
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'] || flags.chromeMcpPageListOk,
      chromeMcpPageCount: flags['chrome-mcp-page-count'] || flags.chromeMcpPageCount,
      chromeMcpLastError: flags['chrome-mcp-last-error'] || flags.chromeMcpLastError,
      chromeMcpSource: flags['chrome-mcp-source'] || flags.chromeMcpSource,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      chromeExtensionPrepared: flags['chrome-extension-prepared'] || flags.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: flags['chrome-extension-backend-available'] || flags.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: flags['chrome-extension-backend-last-error'] || flags.chromeExtensionBackendLastError,
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.write || flags.out) {
      status.outputPath = writeAgentControlPlane(
        path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
        status,
        flags.out || flags.output || ''
      );
    }
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentControlPlaneCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'agent-control-plane-status') {
    const status = buildAgentControlPlaneStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input || flags.path,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentControlPlaneStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'agent-control-plane-watch') {
    const watch = await buildAgentControlPlaneWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      in: flags.in || flags.input || flags.path,
      out: flags.out || flags.output,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds,
      task: flags.task || positional[0] || '',
      targetDir: flags['target-dir'] || flags.targetDir || positional[1] || '',
      query: flags.query || '',
      provider: flags.provider || 'duckduckgo',
      backendMatrixIn: flags['backend-matrix-in'] || flags.backendMatrixIn || flags.matrixIn,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      chromeMcpConnected: flags['chrome-mcp-connected'] || flags.chromeMcpConnected,
      chromeMcpTools: flags['chrome-mcp-tools'] || flags.chromeMcpTools,
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'] || flags.chromeMcpPageListOk,
      chromeMcpPageCount: flags['chrome-mcp-page-count'] || flags.chromeMcpPageCount,
      chromeMcpLastError: flags['chrome-mcp-last-error'] || flags.chromeMcpLastError,
      chromeMcpSource: flags['chrome-mcp-source'] || flags.chromeMcpSource,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      chromeExtensionPrepared: flags['chrome-extension-prepared'] || flags.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: flags['chrome-extension-backend-available'] || flags.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: flags['chrome-extension-backend-last-error'] || flags.chromeExtensionBackendLastError,
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentControlPlaneWatchCompact(watch));
    } else {
      printJson(watch);
    }
    return;
  }

  if (command === 'agent-task') {
    const task = await buildAgentTask({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      operatorOk: flags['operator-ok'] || flags.operatorOk || '',
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      task: flags.task || positional[0] || 'auto',
      targetDir: flags['target-dir'] || flags.targetDir || positional[1] || '',
      query: flags.query || '',
      provider: flags.provider || 'duckduckgo',
      searchProviders: flags['search-providers'] || flags.searchProviders || '',
      intent: flags.intent || '',
      matchTitle: flags['match-title'] || flags.matchTitle || '',
      matchUrl: flags['match-url'] || flags.matchUrl || '',
      matchOrigin: flags['match-origin'] || flags.matchOrigin || '',
      matchPath: flags['match-path'] || flags.matchPath || '',
      tabIndex: flags['tab-index'] || flags.tabIndex,
      chromeMcpConnected: flags['chrome-mcp-connected'] || flags.chromeMcpConnected,
      chromeMcpTools: flags['chrome-mcp-tools'] || flags.chromeMcpTools,
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'] || flags.chromeMcpPageListOk,
      chromeMcpPageCount: flags['chrome-mcp-page-count'] || flags.chromeMcpPageCount,
      chromeMcpLastError: flags['chrome-mcp-last-error'] || flags.chromeMcpLastError,
      chromeMcpSource: flags['chrome-mcp-source'] || flags.chromeMcpSource,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      chromeExtensionPrepared: flags['chrome-extension-prepared'] || flags.chromeExtensionPrepared,
      chromeExtensionBackendAvailable: flags['chrome-extension-backend-available'] || flags.chromeExtensionBackendAvailable,
      chromeExtensionBackendLastError: flags['chrome-extension-backend-last-error'] || flags.chromeExtensionBackendLastError,
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 120000)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentTaskCompact(task));
    } else {
      printJson(task);
    }
    return;
  }

  if (command === 'agent-task-status') {
    const status = buildAgentTaskStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input || flags.path,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      staleAfterSeconds: Number(flags['stale-after-seconds'] || flags.staleAfterSeconds || 900),
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 120000)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentTaskStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'agent-task-watch') {
    const watch = buildAgentTaskWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      in: flags.in || flags.input || flags.path,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      staleAfterSeconds: Number(flags['stale-after-seconds'] || flags.staleAfterSeconds || 900),
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 120000)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentTaskWatchCompact(watch));
    } else {
      printJson(watch);
    }
    return;
  }

  if (command === 'agent-task-loop') {
    const loop = await buildAgentTaskLoop({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      write: Boolean(flags.write),
      in: flags.in || flags.input || flags.path,
      iterations: Number(flags.iterations || 3),
      intervalMs: Number(flags['interval-ms'] || flags.intervalMs || 0),
      statusOut: flags['status-out'] || flags.statusOut,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      staleAfterSeconds: Number(flags['stale-after-seconds'] || flags.staleAfterSeconds || 900),
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 120000)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentTaskLoopCompact(loop));
    } else {
      printJson(loop);
    }
    return;
  }

  if (command === 'agent-task-watch-start') {
    const started = buildAgentTaskWatchStart({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      force: Boolean(flags.force),
      operatorOk: flags['operator-ok'] || flags.operatorOk || '',
      in: flags.in || flags.input || flags.path,
      logPath: flags['log-path'] || flags.logPath,
      pidPath: flags['pid-path'] || flags.pidPath,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      staleAfterSeconds: Number(flags['stale-after-seconds'] || flags.staleAfterSeconds || 900),
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 120000)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentTaskWatchStartCompact(started));
    } else {
      printJson(started);
    }
    return;
  }

  if (command === 'agent-task-watch-status') {
    const status = buildAgentTaskWatchStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input || flags.path,
      logPath: flags['log-path'] || flags.logPath,
      pidPath: flags['pid-path'] || flags.pidPath,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      maxLogLines: Number(flags['max-log-lines'] || flags.maxLogLines || 10),
      staleAfterSeconds: Number(flags['stale-after-seconds'] || flags.staleAfterSeconds || 900),
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 120000)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentTaskWatchStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'search-http') {
    const output = await publicSearchHttp(positional.join(' '), {
      provider: flags.provider || 'duckduckgo',
      limit: Number(flags.limit || 10)
    });
    printJson(output);
    return;
  }

  if (command === 'agent-loop-step') {
    const step = await buildAgentLoopStep({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 300000),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentLoopStepCompact(step));
    } else {
      printJson(step);
    }
    if (flags.strict && step.status !== 'ran') process.exitCode = 1;
    return;
  }

  if (command === 'agent-loop-step-status') {
    const status = buildAgentLoopStepStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input || flags.path,
      staleAfterSeconds: Number(flags['stale-after-seconds'] || flags.staleAfterSeconds || 900),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentLoopStepStatusCompact(status));
    } else {
      printJson(status);
    }
    if (flags.strict && (!status.exists || status.stale || status.parseError)) process.exitCode = 1;
    return;
  }

  if (command === 'agent-proof-step') {
    const step = await buildAgentProofStep({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      targetDir: flags['target-dir'] || flags.targetDir || positional[0] || '',
      handoff: flags.handoff || '',
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 300000),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentProofStepCompact(step));
    } else {
      printJson(step);
    }
    if (flags.strict && step.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'agent-proof-step-start') {
    const start = await buildAgentProofStepStart({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      force: Boolean(flags.force),
      operatorOk: flags['operator-ok'] || flags.operatorOk || '',
      out: flags.out || flags.output,
      logPath: flags['log-path'] || flags.logPath,
      pidPath: flags['pid-path'] || flags.pidPath,
      targetDir: flags['target-dir'] || flags.targetDir || positional[0] || '',
      handoff: flags.handoff || '',
      timeoutMs: Number(flags['timeout-ms'] || flags.timeoutMs || 300000),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentProofStepStartCompact(start));
    } else {
      printJson(start);
    }
    if (flags.strict && start.status !== 'started') process.exitCode = 1;
    return;
  }

  if (command === 'agent-proof-step-status') {
    const status = buildAgentProofStepStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input || flags.path,
      logPath: flags['log-path'] || flags.logPath,
      pidPath: flags['pid-path'] || flags.pidPath,
      maxLogLines: Number(flags['max-log-lines'] || flags.maxLogLines || 10)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentProofStepStatusCompact(status));
    } else {
      printJson(status);
    }
    if (flags.strict && (!status.saved.exists || status.saved.parseError)) process.exitCode = 1;
    return;
  }

  if (command === 'chrome-control-plan') {
    const plan = buildChromeControlPlan({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      lane: flags.lane || 'auto',
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeControlPlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeControlPlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'chrome-mcp-observation') {
    const observation = buildChromeMcpObservation({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      statusText: readTextFlag(flags, 'status-text', 'status-file'),
      listPagesText: readTextFlag(flags, 'list-pages-text', 'list-pages-file'),
      observedConnected: flags['observed-connected'] || flags.observedConnected,
      observedTools: flags['observed-tools'] || flags.observedTools,
      observedPageListOk: flags['observed-page-list-ok'] || flags.observedPageListOk,
      observedPageCount: flags['observed-page-count'] || flags.observedPageCount,
      observedListPagesTimedOut: flags['observed-list-pages-timed-out'] || flags.observedListPagesTimedOut,
      observedLastError: flags['observed-last-error'] || flags.observedLastError,
      source: flags.source || '',
      intent: flags.intent || 'inspect',
      write: flags.write,
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeMcpObservationCompact(observation));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeMcpObservationMarkdown(observation));
    } else {
      printJson(observation);
    }
    return;
  }

  if (command === 'chrome-mcp-observation-status') {
    const status = buildChromeMcpObservationStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeMcpObservationStatusCompact(status));
    } else {
      printJson(status);
    }
    if (flags.strict && (!status.exists || !status.parseOk || status.stale)) process.exitCode = 1;
    return;
  }

  if (command === 'chrome-mcp-status') {
    const status = buildChromeMcpStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      observedConnected: flags['observed-connected'],
      observedTools: flags['observed-tools'],
      observedPageListOk: flags['observed-page-list-ok'],
      observedPageCount: flags['observed-page-count'],
      observedLastError: flags['observed-last-error'] || '',
      observedSource: flags['observed-source'] || ''
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeMcpStatusCompact(status));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeMcpStatusMarkdown(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'chrome-mcp-handoff') {
    const handoff = await buildChromeMcpHandoff({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      task: flags.task || 'existing-tab',
      chromeMcpConnected: flags['chrome-mcp-connected'],
      chromeMcpTools: flags['chrome-mcp-tools'],
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'],
      chromeMcpPageCount: flags['chrome-mcp-page-count'],
      chromeMcpLastError: flags['chrome-mcp-last-error'] || '',
      chromeMcpSource: flags['chrome-mcp-source'] || '',
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      allowNewBackgroundTab: flags['allow-new-background-tab'],
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeMcpHandoffCompact(handoff));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeMcpHandoffMarkdown(handoff));
    } else {
      printJson(handoff);
    }
    return;
  }

  if (command === 'chrome-mcp-timeout-plan') {
    const plan = buildChromeMcpTimeoutPlan({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      observedConnected: flags['observed-connected'],
      observedTools: flags['observed-tools'],
      observedPageListOk: flags['observed-page-list-ok'],
      observedPageCount: flags['observed-page-count'],
      observedLastError: flags['observed-last-error'] || '',
      observedSource: flags['observed-source'] || '',
      ownerLimit: flags['owner-limit'] || flags.ownerLimit,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      write: Boolean(flags.write),
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeMcpTimeoutPlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeMcpTimeoutPlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'chrome-mcp-timeout-plan-status') {
    const status = buildChromeMcpTimeoutPlanStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeMcpTimeoutPlanStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'chrome-mcp-autostart-plan') {
    const plan = buildChromeMcpAutostartPlan({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      label: flags.label,
      browserUrl: flags['browser-url'] || flags.browserUrl,
      headless: flags.headless,
      packageSpec: flags.package || flags['package-spec'] || flags.packageSpec,
      npx: flags.npx,
      plist: flags.plist,
      installPath: flags['install-path'] || flags.installPath
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeMcpAutostartPlanCompact(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'chrome-mcp-autostart-plan-status') {
    const status = buildChromeMcpAutostartPlanStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeMcpAutostartPlanStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'regular-chrome-use') {
    const plan = await buildRegularChromeUse({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      intent: flags.intent || 'inspect',
      statusText: readTextFlag(flags, 'status-text', 'status-file'),
      listPagesText: readTextFlag(flags, 'list-pages-text', 'list-pages-file'),
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      source: flags.source || '',
      chromeMcpConnected: flags['chrome-mcp-connected'],
      chromeMcpTools: flags['chrome-mcp-tools'],
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'],
      chromeMcpPageCount: flags['chrome-mcp-page-count'],
      chromeMcpLastError: flags['chrome-mcp-last-error'] || '',
      chromeMcpSource: flags['chrome-mcp-source'] || '',
      allowNewBackgroundTab: flags['allow-new-background-tab'],
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      chromeExtensionPrepared: flags['chrome-extension-prepared'],
      chromeExtensionBackendAvailable: flags['chrome-extension-backend-available'],
      chromeExtensionBackendLastError: flags['chrome-extension-backend-last-error'] || '',
      chromeExtensionWindowRetryAttempted: flags['chrome-extension-window-retry-attempted'],
      appleEventsActiveTabObserved: flags['apple-events-active-tab-observed'],
      appleEventsJavascriptAllowed: flags['apple-events-javascript-allowed'],
      appleEventsStatusFile: flags['apple-events-status-file'] || flags['apple-events-status-in'],
      write: flags.write,
      out: flags.out || flags.output,
      pluginDir: flags['plugin-dir'] || ''
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatRegularChromeUseCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatRegularChromeUseMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'regular-chrome-refresh') {
    const refresh = await buildRegularChromeRefresh({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      intent: flags.intent || 'inspect',
      appleEventsOut: flags['apple-events-out'],
      out: flags.out || flags.output,
      statusText: readTextFlag(flags, 'status-text', 'status-file'),
      listPagesText: readTextFlag(flags, 'list-pages-text', 'list-pages-file'),
      source: flags.source || '',
      chromeMcpConnected: flags['chrome-mcp-connected'],
      chromeMcpTools: flags['chrome-mcp-tools'],
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'],
      chromeMcpPageCount: flags['chrome-mcp-page-count'],
      chromeMcpLastError: flags['chrome-mcp-last-error'] || '',
      chromeMcpSource: flags['chrome-mcp-source'] || '',
      chromeExtensionPrepared: flags['chrome-extension-prepared'],
      chromeExtensionBackendAvailable: flags['chrome-extension-backend-available'],
      chromeExtensionBackendLastError: flags['chrome-extension-backend-last-error'] || '',
      chromeExtensionWindowRetryAttempted: flags['chrome-extension-window-retry-attempted'],
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      pluginDir: flags['plugin-dir'] || ''
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatRegularChromeRefreshCompact(refresh));
    } else {
      printJson(refresh);
    }
    return;
  }

  if (command === 'regular-chrome-status') {
    const status = buildRegularChromeStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input,
      appleEventsIn: flags['apple-events-in'],
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      staleAfterSeconds: flags['stale-after-seconds']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatRegularChromeStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'regular-chrome-watch') {
    const watch = await buildRegularChromeWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      force: Boolean(flags.force),
      in: flags.in || flags.input,
      appleEventsIn: flags['apple-events-in'],
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      staleAfterSeconds: flags['stale-after-seconds'],
      intent: flags.intent || 'inspect'
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatRegularChromeWatchCompact(watch));
    } else {
      printJson(watch);
    }
    return;
  }

  if (command === 'chrome-apple-events-status') {
    const status = buildChromeAppleEventsStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: flags.write,
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeAppleEventsStatusCompact(status));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeAppleEventsStatusMarkdown(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'chrome-apple-events-enable-plan') {
    const plan = buildChromeAppleEventsEnablePlan({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: flags.write,
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeAppleEventsEnablePlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeAppleEventsEnablePlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'chrome-apple-events-outline') {
    const outline = buildChromeAppleEventsOutline({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      operatorOk: flags['operator-ok'] || flags.operatorOk || '',
      write: flags.write,
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeAppleEventsOutlineCompact(outline));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeAppleEventsOutlineMarkdown(outline));
    } else {
      printJson(outline);
    }
    return;
  }

  if (command === 'browser-route') {
    const route = await buildBrowserRoute({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      task: flags.task || 'auto',
      lane: flags.lane || 'auto',
      chromeMcpConnected: flags['chrome-mcp-connected'],
      chromeMcpTools: flags['chrome-mcp-tools'],
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'],
      chromeMcpPageCount: flags['chrome-mcp-page-count'],
      chromeMcpLastError: flags['chrome-mcp-last-error'] || '',
      chromeMcpSource: flags['chrome-mcp-source'] || '',
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatBrowserRouteCompact(route));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatBrowserRouteMarkdown(route));
    } else {
      printJson(route);
    }
    return;
  }

  if (command === 'chrome-extension-status') {
    const status = buildChromeExtensionStatus({
      pluginDir: flags['plugin-dir'] || ''
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeExtensionStatusCompact(status));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeExtensionStatusMarkdown(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'chrome-extension-handoff') {
    const handoff = buildChromeExtensionHandoff({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      pluginDir: flags['plugin-dir'] || '',
      write: Boolean(flags.write),
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeExtensionHandoffCompact(handoff));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeExtensionHandoffMarkdown(handoff));
    } else {
      printJson(handoff);
    }
    return;
  }

  if (command === 'chrome-extension-resume') {
    const result = buildChromeExtensionResume({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      pluginDir: flags['plugin-dir'] || '',
      run: Boolean(flags.run),
      dryRun: Boolean(flags['dry-run'] || flags.dryRun),
      operatorOk: flags['operator-ok'] || flags.operatorOk || ''
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeExtensionResumeCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeExtensionResumeMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'chrome-extension-troubleshoot') {
    const result = buildChromeExtensionTroubleshoot({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      pluginDir: flags['plugin-dir'] || '',
      backendAvailable: flags['backend-available'] || flags.backendAvailable,
      backendLastError: flags['backend-last-error'] || flags.backendLastError || '',
      profileWindowRetryAttempted: flags['profile-window-retry-attempted'] || flags.profileWindowRetryAttempted || flags['window-retry-attempted'] || flags.windowRetryAttempted
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeExtensionTroubleshootCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeExtensionTroubleshootMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'chrome-extension-backend-check-plan') {
    const plan = buildChromeExtensionBackendCheckPlan({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      pluginDir: flags['plugin-dir'] || '',
      backendAvailable: flags['backend-available'] || flags.backendAvailable
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeExtensionBackendCheckPlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeExtensionBackendCheckPlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'chrome-extension-claim-plan') {
    const plan = buildChromeExtensionClaimPlan({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      pluginDir: flags['plugin-dir'] || '',
      backendReady: flags['backend-ready'] || flags.backendReady,
      intent: flags.intent || 'inspect',
      matchTitle: flags['match-title'] || flags.matchTitle || '',
      matchUrl: flags['match-url'] || flags.matchUrl || '',
      matchOrigin: flags['match-origin'] || flags.matchOrigin || '',
      matchPath: flags['match-path'] || flags.matchPath || '',
      tabIndex: flags['tab-index'] || flags.tabIndex
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatChromeExtensionClaimPlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatChromeExtensionClaimPlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'providers' || command === 'provider-status') {
    const report = buildProviderReport();
    if (flags.format === 'compact') {
      process.stdout.write(formatProviderReportCompact(report));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatProviderReportMarkdown(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'provider-doctor-status') {
    const status = buildProviderDoctorStatus({
      seleniumOptions: {
        rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
      }
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatProviderDoctorStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'agent-browser-doctor') {
    const report = buildAgentBrowserDoctor({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatAgentBrowserDoctorCompact(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'backend-matrix') {
    const matrix = await buildBackendMatrix({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatBackendMatrixCompact(matrix));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatBackendMatrixMarkdown(matrix));
    } else {
      printJson(matrix);
    }
    return;
  }

  if (command === 'backend-matrix-status') {
    const status = buildBackendMatrixStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input || flags.path,
      mcpObservationIn: flags['mcp-observation-in'] || flags.mcpObservationIn,
      allowNewBackgroundTab: flags['allow-new-background-tab'] || flags.allowNewBackgroundTab,
      newBackgroundUrlEnv: flags['new-background-url-env'] || flags.newBackgroundUrlEnv,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatBackendMatrixStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'status-cache') {
    const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const key = flags.key || positional[0] || 'provider-doctor-status';
    const builders = {
      'provider-doctor-status': () => buildProviderDoctorStatus({ rootDir }),
      'backend-matrix': () => buildBackendMatrix({ rootDir }),
      'control-status': () => buildControlStatus({ rootDir })
    };
    const report = await buildStatusCache(rootDir, key, builders, {
      ...flags,
      staleAfterSeconds: Number(flags['stale-after-seconds'] || flags.staleAfterSeconds || 900)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatStatusCacheCompact(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'source-audit') {
    const report = buildSourceAudit({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatSourceAuditMarkdown(report));
    } else if (flags.format === 'compact') {
      process.stdout.write(formatSourceAuditCompact(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'github-repo-research') {
    const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const report = buildGithubRepoResearch({
      rootDir,
      limit: flags.limit,
      includeGithub: !flags['local-only']
    });
    if (flags.write || flags.out || flags.output) {
      writeGithubRepoResearch(rootDir, report, flags.out || flags.output);
    }
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatGithubRepoResearchMarkdown(report));
    } else if (flags.format === 'compact') {
      process.stdout.write(formatGithubRepoResearchCompact(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'lightpanda-doctor') {
    const report = buildLightpandaDoctor();
    if (flags.format === 'compact') {
      process.stdout.write(formatLightpandaDoctorCompact(report));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatLightpandaDoctorMarkdown(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'lightpanda-decision') {
    const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const report = buildLightpandaDecision({
      decision: flags.decision || 'reject',
      reason: flags.reason || '',
      force: Boolean(flags.force)
    });
    if (flags.write || flags.out) {
      report.outputPath = writeLightpandaDecision(rootDir, report, flags.out || '');
    }
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatLightpandaDecisionMarkdown(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'target-worker-pool') {
    const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const pool = await buildTargetWorkerPool(rootDir, {
      targetDir: flags['target-dir'] || flags.targetDir || positional[0],
      profile: flags.profile
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetWorkerPoolCompact(pool));
    } else {
      printJson(pool);
    }
    return;
  }

  if (command === 'lightpanda-gate') {
    const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const gate = buildLightpandaGate(rootDir);
    if (flags.format === 'compact') {
      process.stdout.write(formatLightpandaGateCompact(gate));
    } else {
      printJson(gate);
    }
    return;
  }

  if (command === 'playwright-doctor') {
    const report = buildPlaywrightDoctor({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatPlaywrightDoctorCompact(report));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatPlaywrightDoctorMarkdown(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'selenium-doctor') {
    const report = buildSeleniumDoctor({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatSeleniumDoctorCompact(report));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatSeleniumDoctorMarkdown(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'secret-audit') {
    const report = buildSecretAudit();
    if (flags.format === 'compact') {
      process.stdout.write(formatSecretAuditCompact(report));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatSecretAuditMarkdown(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'secret-setup-plan') {
    const plan = buildSecretSetupPlan({
      mode: flags.mode
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatSecretSetupPlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatSecretSetupPlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'secret-run-plan') {
    const plan = buildSecretRunPlan({
      mode: flags.mode,
      command: flags.command,
      targetDir: flags['target-dir'] || flags.targetDir
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatSecretRunPlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatSecretRunPlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'secret-run-select') {
    const selection = buildSecretRunSelect({
      command: flags.command,
      targetDir: flags['target-dir'] || flags.targetDir
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatSecretRunSelectCompact(selection));
    } else {
      printJson(selection);
    }
    return;
  }

  if (command === 'secret-env-handoff') {
    const handoff = buildSecretEnvHandoff({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      mode: flags.mode,
      environmentName: flags['environment-name'],
      mountPath: flags['mount-path'],
      write: Boolean(flags.write),
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatSecretEnvHandoffCompact(handoff));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatSecretEnvHandoffMarkdown(handoff));
    } else {
      printJson(handoff);
    }
    return;
  }

  if (command === 'secret-env-handoff-status') {
    const status = buildSecretEnvHandoffStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input,
      staleAfterSeconds: flags['stale-after-seconds']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatSecretEnvHandoffStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'secret-env-handoff-watch') {
    const watch = buildSecretEnvHandoffWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      in: flags.in || flags.input,
      out: flags.out || flags.output,
      staleAfterSeconds: flags['stale-after-seconds'],
      mode: flags.mode,
      environmentName: flags['environment-name'],
      mountPath: flags['mount-path']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatSecretEnvHandoffWatchCompact(watch));
    } else {
      printJson(watch);
    }
    return;
  }

  if (command === 'benchmark') {
    const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const report = await runProviderBenchmark({
      quick: Boolean(flags.quick),
      iterations: Number(flags.iterations || 2),
      rowCount: Number(flags.rows || 40),
      url: flags.url,
      rootDir
    });
    if (flags.write || flags.out) {
      report.outputPath = writeProviderBenchmarkReport(rootDir, report, flags.out || '');
    }
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatProviderBenchmarkMarkdown(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'target-benchmark') {
    const report = await runTargetBenchmark(positional[0], {
      profile: flags.profile,
      recipes: flags.recipes,
      modes: flags.modes,
      iterations: Number(flags.iterations || 1),
      audit: flags.audit !== false && flags['no-audit'] !== true,
      enforceAudit: flags['enforce-audit'] !== false
    });
    if (flags.write || flags.out) {
      report.outputPath = writeTargetBenchmarkReport(positional[0], report, flags.out || path.join('proof', 'target-benchmark.json'));
    }
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetBenchmarkMarkdown(report));
    } else {
      printJson(report);
    }
    return;
  }

  if (command === 'runtime-audit') {
    const audit = buildRuntimeAudit();
    if (flags.write || flags.out) {
      audit.outputPath = writeRuntimeAuditReport(process.cwd(), audit, flags.out || '');
    }
    if (flags.format === 'compact') {
      process.stdout.write(formatRuntimeAuditCompact(audit));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatRuntimeAuditMarkdown(audit));
    } else {
      printJson(audit);
    }
    return;
  }

  if (command === 'runtime-cleanup-plan') {
    const plan = buildRuntimeCleanupPlan({
      ownerLimit: flags['owner-limit'] || flags.ownerLimit
    });
    if (flags.write || flags.out) {
      plan.outputPath = writeRuntimeCleanupPlanReport(process.cwd(), plan, flags.out || '');
    }
    if (flags.format === 'compact') {
      process.stdout.write(formatRuntimeCleanupPlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatRuntimeCleanupPlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'run-gate-audit') {
    const audit = buildRunGateAudit();
    if (flags.format === 'compact') {
      process.stdout.write(formatRunGateAuditCompact(audit));
    } else {
      printJson(audit);
    }
    if (flags.strict && !audit.summary.okForAgentLoops) process.exitCode = 1;
    return;
  }

  if (command === 'compact-command-audit') {
    const audit = await buildCompactCommandAudit({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      source: flags.source || 'operator-pack',
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatCompactCommandAuditCompact(audit));
    } else {
      printJson(audit);
    }
    if (flags.strict && !audit.safeForStrictAgentLoops) process.exitCode = 1;
    return;
  }

  if (command === 'completion-proof-bundle') {
    const bundle = await buildCompletionProofBundle({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      candidate: flags.candidate || 'github',
      includeCompactCommandAudit: Boolean(flags['include-compact-command-audit'] || flags.includeCompactCommandAudit),
      write: Boolean(flags.write),
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatCompletionProofBundleCompact(bundle));
    } else {
      printJson(bundle);
    }
    if (flags.strict && !bundle.complete) process.exitCode = 1;
    return;
  }

  if (command === 'completion-proof-bundle-status') {
    const status = buildCompletionProofBundleStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds,
      candidate: flags.candidate || 'github'
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatCompletionProofBundleStatusCompact(status));
    } else {
      printJson(status);
    }
    if (flags.strict && !status.complete) process.exitCode = 1;
    return;
  }

  if (command === 'completion-proof-bundle-watch') {
    const watch = await buildCompletionProofBundleWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      in: flags.in || flags.input,
      out: flags.out || flags.output,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds,
      candidate: flags.candidate || 'github'
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatCompletionProofBundleWatchCompact(watch));
    } else {
      printJson(watch);
    }
    return;
  }

  if (command === 'readiness-audit') {
    const audit = buildReadinessAudit({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatReadinessAuditCompact(audit));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatReadinessAuditMarkdown(audit));
    } else {
      printJson(audit);
    }
    if (flags.strict && !audit.completeAgainstObjective) process.exitCode = 1;
    return;
  }

  if (command === 'objective-completion-audit') {
    const audit = await buildObjectiveCompletionAudit({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveCompletionAuditCompact(audit));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatObjectiveCompletionAuditMarkdown(audit));
    } else {
      printJson(audit);
    }
    if (flags.strict && !audit.complete) process.exitCode = 1;
    return;
  }

  if (command === 'objective-completion-audit-status') {
    const status = buildObjectiveCompletionAuditStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input || flags.path,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveCompletionAuditStatusCompact(status));
    } else {
      printJson(status);
    }
    if (flags.strict && !status.savedComplete) process.exitCode = 1;
    return;
  }

  if (command === 'objective-completion-audit-watch') {
    const watch = await buildObjectiveCompletionAuditWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      in: flags.in || flags.input || flags.path,
      out: flags.out || flags.output,
      staleAfterSeconds: flags['stale-after-seconds'] || flags.staleAfterSeconds
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveCompletionAuditWatchCompact(watch));
    } else {
      printJson(watch);
    }
    return;
  }

  if (command === 'objective-safe-command') {
    const result = await buildObjectiveSafeCommand({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveSafeCommandCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'objective-proof-pipeline') {
    const pipeline = await buildObjectiveProofPipeline({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveProofPipelineCompact(pipeline));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatObjectiveProofPipelineMarkdown(pipeline));
    } else {
      printJson(pipeline);
    }
    return;
  }

  if (command === 'objective-handoff') {
    const handoff = await buildObjectiveHandoff({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out,
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveHandoffCompact(handoff));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatObjectiveHandoffMarkdown(handoff));
    } else {
      printJson(handoff);
    }
    return;
  }

  if (command === 'operator-pack') {
    const pack = await buildOperatorPack({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      chromeMcpStatusText: readFirstTextFlag(flags, [
        ['chrome-mcp-status-text', 'chrome-mcp-status-file'],
        ['chrome-status-text', 'chrome-status-file']
      ]),
      chromeMcpListPagesText: readFirstTextFlag(flags, [
        ['chrome-mcp-list-pages-text', 'chrome-mcp-list-pages-file'],
        ['chrome-list-pages-text', 'chrome-list-pages-file']
      ]),
      chromeMcpConnected: flags['chrome-mcp-connected'],
      chromeMcpTools: flags['chrome-mcp-tools'],
      chromeMcpPageListOk: flags['chrome-mcp-page-list-ok'],
      chromeMcpPageCount: flags['chrome-mcp-page-count'],
      chromeMcpLastError: flags['chrome-mcp-last-error'] || '',
      chromeMcpSource: flags['chrome-mcp-source'] || '',
      chromeExtensionBackendAvailable: flags['chrome-extension-backend-available'],
      chromeExtensionBackendLastError: flags['chrome-extension-backend-last-error'] || '',
      chromeExtensionWindowRetryAttempted: flags['chrome-extension-window-retry-attempted'] || flags.chromeExtensionWindowRetryAttempted || flags['profile-window-retry-attempted'] || flags.profileWindowRetryAttempted,
      appleEventsActiveTabObserved: flags['apple-events-active-tab-observed'] || flags.appleEventsActiveTabObserved,
      appleEventsJavascriptAllowed: flags['apple-events-javascript-allowed'] || flags.appleEventsJavascriptAllowed,
      appleEventsStatusFile: flags['apple-events-status-file'] || flags['apple-events-status-in'] || flags.appleEventsStatusFile,
      regularChromeUseIn: flags['regular-chrome-use-in'],
      savedRegularChromeMaxAgeSeconds: flags['saved-regular-chrome-max-age-seconds'],
      agentLoopStepStatusIn: flags['agent-loop-step-status-in'] || flags.agentLoopStepStatusIn,
      agentLoopStepTimeoutMs: flags['agent-loop-step-timeout-ms'] || flags.agentLoopStepTimeoutMs,
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatOperatorPackCompact(pack));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatOperatorPackMarkdown(pack));
    } else {
      printJson(pack);
    }
    return;
  }

  if (command === 'operator-pack-status') {
    const status = buildOperatorPackStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input || flags.path,
      staleAfterSeconds: Number(flags['stale-after-seconds'] || flags.staleAfterSeconds || 900)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatOperatorPackStatusCompact(status));
    } else {
      printJson(status);
    }
    if (flags.strict && (!status.exists || !status.parseOk || status.stale)) process.exitCode = 1;
    return;
  }

  if (command === 'operator-runbook') {
    const runbook = await buildOperatorRunbook({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatOperatorRunbookCompact(runbook));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatOperatorRunbookMarkdown(runbook));
    } else {
      printJson(runbook);
    }
    return;
  }

  if (command === 'operator-runbook-status') {
    const status = buildOperatorRunbookStatus({
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatOperatorRunbookStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'operator-runbook-watch') {
    const watch = await buildOperatorRunbookWatch({
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatOperatorRunbookWatchCompact(watch));
    } else {
      printJson(watch);
    }
    return;
  }

  if (command === 'background-monitor-plan') {
    const plan = await buildBackgroundMonitorPlan({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      timeoutMs: flags['timeout-ms'] || flags.timeoutMs,
      intervalMs: flags['interval-ms'] || flags.intervalMs,
      statusOut: flags['status-out'] || flags.statusOut,
      logPath: flags['log-path'] || flags.logPath,
      pidPath: flags['pid-path'] || flags.pidPath
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatBackgroundMonitorPlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatBackgroundMonitorPlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'objective-next') {
    const next = await buildObjectiveNext({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveNextCompact(next));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatObjectiveNextMarkdown(next));
    } else {
      printJson(next);
    }
    if (flags.strict && !next.complete) process.exitCode = 1;
    return;
  }

  if (command === 'objective-status') {
    const status = await buildObjectiveStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveStatusCompact(status));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatObjectiveStatusMarkdown(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'proof-gate-status') {
    const status = await buildProofGateStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatProofGateStatusCompact(status));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatProofGateStatusMarkdown(status));
    } else {
      printJson(status);
    }
    if (flags.strict && !status.complete) process.exitCode = 1;
    return;
  }

  if (command === 'proof-gate-watch') {
    const watch = await buildProofGateWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output,
      timeoutMs: flags['timeout-ms'] || flags.timeoutMs,
      intervalMs: flags['interval-ms'] || flags.intervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatProofGateWatchCompact(watch));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatProofGateWatchMarkdown(watch));
    } else {
      printJson(watch);
    }
    if (flags.strict && !watch.complete) process.exitCode = 1;
    return;
  }

  if (command === 'login-handoff-status') {
    const status = await buildLoginHandoffStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      write: Boolean(flags.write),
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatLoginHandoffStatusCompact(status));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatLoginHandoffStatusMarkdown(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'background-proof-capture-plan') {
    const plan = await buildBackgroundProofCapturePlan({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      timeoutMs: flags['timeout-ms'] || flags.timeoutMs,
      intervalMs: flags['interval-ms'] || flags.intervalMs,
      monitorLogPath: flags['monitor-log-path'] || flags.monitorLogPath,
      monitorPidPath: flags['monitor-pid-path'] || flags.monitorPidPath,
      captureLogPath: flags['capture-log-path'] || flags.captureLogPath,
      capturePidPath: flags['capture-pid-path'] || flags.capturePidPath
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatBackgroundProofCapturePlanCompact(plan));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatBackgroundProofCapturePlanMarkdown(plan));
    } else {
      printJson(plan);
    }
    return;
  }

  if (command === 'background-proof-capture-status') {
    const status = await buildBackgroundProofCaptureStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      targetDir: flags['target-dir'] || flags.targetDir,
      maxLogLines: flags['max-log-lines'] || flags.maxLogLines
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatBackgroundProofCaptureStatusCompact(status));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatBackgroundProofCaptureStatusMarkdown(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'background-proof-capture-start') {
    const result = await buildBackgroundProofCaptureStart({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      mode: flags.mode,
      run: Boolean(flags.run),
      force: Boolean(flags.force),
      operatorOk: flags['operator-ok'] || flags.operatorOk,
      timeoutMs: flags['timeout-ms'] || flags.timeoutMs,
      intervalMs: flags['interval-ms'] || flags.intervalMs,
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatBackgroundProofCaptureStartCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatBackgroundProofCaptureStartMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'objective-resume') {
    const resume = await buildObjectiveResume({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      operatorOk: flags['operator-ok'] || flags.operatorOk,
      operatorReady: Boolean(flags['operator-ready'] || flags.operatorReady),
      manualCandidate: flags['manual-candidate'] || flags.manualCandidate,
      waitAuthTimeoutMs: flags['wait-auth-timeout-ms'] || flags.waitAuthTimeoutMs,
      waitAuthIntervalMs: flags['wait-auth-interval-ms'] || flags.waitAuthIntervalMs,
      timeoutMs: flags['timeout-ms'] || flags.timeoutMs,
      write: Boolean(flags.write),
      out: flags.out || flags.output
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatObjectiveResumeCompact(resume));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatObjectiveResumeMarkdown(resume));
    } else {
      printJson(resume);
    }
    if (flags.strict && resume.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'mcp-stdio') {
    await runMcpStdio();
    return;
  }

  if (command === 'profile-info') {
    printJson({
      profile: profileName,
      profilePath: profilePath(policy, profileName),
      statePath: statePath(policy, profileName),
      policy: policy.source
    });
    return;
  }

  if (command === 'profile-status') {
    printJson(profileStatus(policy, profileName));
    return;
  }

  if (command === 'cdp-start') {
    const initialUrl = flags.url || 'about:blank';
    if (initialUrl !== 'about:blank') assertAllowedUrl(initialUrl, policy);
    ensureDirs(policy, profileName);
    printJson(await startCdpDaemon(profilePath(policy, profileName), {
      headed: Boolean(flags.headed),
      initialUrl
    }));
    return;
  }

  if (command === 'cdp-status') {
    printJson(await cdpDaemonStatus(profilePath(policy, profileName)));
    return;
  }

  if (command === 'cdp-stop') {
    printJson(await stopCdpDaemon(profilePath(policy, profileName)));
    return;
  }

  if (command === 'scaffold-target') {
    printJson(scaffoldTargetPack(policy, {
      name: positional[0],
      origins: flags.origin,
      loginUrl: flags['login-url'],
      pageUrl: flags['page-url'],
      query: flags.query,
      searchProvider: flags['search-provider'],
      permissions: flags.permissions,
      dir: flags.dir,
      force: Boolean(flags.force)
    }));
    return;
  }

  if (command === 'target-doctor') {
    const result = doctorTargetPack(positional[0]);
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'target-audit') {
    const result = await auditTargetPack(positional[0], flags);
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'target-bootstrap-plan') {
    const result = buildTargetBootstrapPlan({
      ...flags,
      name: flags.name || positional[0],
      loginUrl: flags['login-url'],
      pageUrl: flags['page-url'],
      searchProvider: flags['search-provider']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetBootstrapPlanCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetBootstrapPlanMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.ready) process.exitCode = 1;
    return;
  }

  if (command === 'target-candidate-plan') {
    const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const result = buildTargetCandidatePlan({
      rootDir,
      candidate: flags.candidate || positional[0]
    });
    if (flags.write || flags.out || flags.output) {
      writeTargetCandidatePlan(rootDir, result, flags.out || flags.output);
    }
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetCandidatePlanCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetCandidatePlanMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-candidate-plan-status') {
    const result = buildTargetCandidatePlanStatus({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      in: flags.in || flags.input,
      staleAfterSeconds: flags['stale-after-seconds']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetCandidatePlanStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-candidate-plan-watch') {
    const result = buildTargetCandidatePlanWatch({
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      in: flags.in || flags.input,
      out: flags.out || flags.output,
      staleAfterSeconds: flags['stale-after-seconds'],
      candidate: flags.candidate || positional[0]
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetCandidatePlanWatchCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-pack') {
    const result = buildTargetApprovalPack({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.write || flags.out) {
      result.outputPath = writeTargetApprovalPack(process.cwd(), result, flags.out || '');
    }
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalPackCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetApprovalPackMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-status') {
    const result = await buildTargetApprovalStatus({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-preflight') {
    const result = await buildTargetApprovalPreflight({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalPreflightCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-resume') {
    const result = await buildTargetApprovalResume({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalResumeCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-resume-status') {
    const result = buildTargetApprovalResumeStatus({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalResumeStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-approval-resume-watch') {
    const result = await buildTargetApprovalResumeWatch({
      ...flags,
      candidate: flags.candidate || positional[0],
      rootDir: process.cwd()
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetApprovalResumeWatchCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-auth-check') {
    const result = await buildTargetAuthCheck(positional[0], {
      ...flags,
      write: Boolean(flags.write),
      daemon: Boolean(flags.daemon)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetAuthCheckCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetAuthCheckMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'target-auth-watch') {
    const result = await buildTargetAuthWatch(positional[0], {
      ...flags,
      daemon: Boolean(flags.daemon)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetAuthWatchCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetAuthWatchMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'target-proof-inventory') {
    const result = await buildTargetProofInventory(path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))), {
      ...flags,
      realExternal: Boolean(flags['real-external'])
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetProofInventoryCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofInventoryMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.complete) process.exitCode = 1;
    return;
  }

  if (command === 'target-proof-next') {
    const result = await buildTargetProofNext(path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))), {
      ...flags,
      realExternal: Boolean(flags['real-external'])
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetProofNextCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofNextMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.complete) process.exitCode = 1;
    return;
  }

  if (command === 'target-proof-plan') {
    const result = await buildTargetProofPlan(positional[0], {
      ...flags,
      realExternal: Boolean(flags['real-external']),
      benchmarkFile: flags['benchmark-file']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetProofPlanCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofPlanMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.currentState.proofReady) process.exitCode = 1;
    return;
  }

  if (command === 'target-proof-capture') {
    const result = await buildTargetProofCapture(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      realExternal: Boolean(flags['real-external']),
      benchmarkFile: flags['benchmark-file'],
      applyPermissions: Boolean(flags['apply-permissions']),
      startDaemon: flags['start-daemon'] !== false,
      stopDaemon: Boolean(flags['stop-daemon']),
      cleanupOnFailure: flags['no-cleanup-on-failure'] !== true,
      run: Boolean(flags.run)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetProofCaptureCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofCaptureMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-batch') {
    const result = await buildTargetBatch(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      realExternal: Boolean(flags['real-external']),
      run: Boolean(flags.run)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetBatchCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetBatchMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-proof') {
    const result = await buildTargetProof(positional[0], {
      ...flags,
      realExternal: Boolean(flags['real-external']),
      requireBenchmark: Boolean(flags['require-benchmark']),
      benchmarkFile: flags['benchmark-file']
    });
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetProofMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && !result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'target-info') {
    const target = resolveTargetPack(positional[0]);
    printJson({
      dir: target.dir,
      policy: target.policy,
      metadata: target.metadataFile,
      target: target.metadata
    });
    return;
  }

  if (command === 'target-status') {
    const target = resolveTargetPack(positional[0]);
    const targetPolicy = loadPolicy(target.policy);
    const targetProfile = flags.profile || target.metadata.profile || target.targetPolicy.defaultProfile || target.metadata.target;
    printJson({
      target: target.metadata.target || targetProfile,
      dir: target.dir,
      ...profileStatus(targetPolicy, targetProfile)
    });
    return;
  }

  if (command === 'target-add-url') {
    printJson(addTargetUrls(positional[0], positional.slice(1), { dryRun: Boolean(flags['dry-run']) }));
    return;
  }

  if (command === 'target-operate-add') {
    printJson(addTargetOperateStep(positional[0], positional[1], {
      ...flags,
      dryRun: Boolean(flags['dry-run']),
      valueEnv: flags['value-env'],
      urlIncludes: flags['url-includes'],
      afterMs: flags['after-ms'],
      timeoutMs: flags['timeout-ms'],
      pollMs: flags['poll-ms'],
      linkLimit: flags['link-limit'],
      controlLimit: flags['control-limit'],
      textLimit: flags['text-limit'],
      candidateLimit: flags['candidate-limit'],
      sampleLimit: flags['sample-limit']
    }));
    return;
  }

  if (command === 'target-login') {
    const target = resolveTargetLogin(positional[0], flags);
    const handoff = targetLoginHandoff(target.dir, { realExternal: Boolean(flags['real-external']) });
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, targetPolicy);
    assertAllowedUrl(target.loginUrl, targetPolicy);
    ensureDirs(targetPolicy, target.profile);
    if (flags['dry-run']) {
      printJson({ ...target, handoff });
      return;
    }
    const output = await openCdpProfile(target.loginUrl, profilePath(targetPolicy, target.profile), { headed: true });
    printJson({
      ...output,
      target: target.target,
      profile: target.profile,
      policy: target.policy,
      next: handoff.instructions.join(' '),
      handoff
    });
    return;
  }

  if (command === 'target-login-capture') {
    const result = await buildTargetLoginCapture(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      realExternal: Boolean(flags['real-external'])
    });
    if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetLoginCaptureMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-handoff-run') {
    const result = await buildTargetHandoffRun(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      commandId: flags.command,
      run: Boolean(flags.run),
      preflightAuth: flags['no-preflight-auth'] !== true
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffRunCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetHandoffRunMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-handoff-status') {
    const result = buildTargetHandoffStatus(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffStatusCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetHandoffStatusMarkdown(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-handoff-resume') {
    const result = await buildTargetHandoffResume(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      run: Boolean(flags.run),
      monitorTimeoutMs: flags['monitor-timeout-ms'] || flags.monitorTimeoutMs,
      monitorIntervalMs: flags['monitor-interval-ms'] || flags.monitorIntervalMs
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffResumeCompact(result));
    } else if (flags.format === 'markdown' || flags.format === 'md') {
      process.stdout.write(formatTargetHandoffResumeMarkdown(result));
    } else {
      printJson(result);
    }
    if (flags.strict && result.status !== 'completed') process.exitCode = 1;
    return;
  }

  if (command === 'target-handoff-resume-status') {
    const result = buildTargetHandoffResumeStatus(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffResumeStatusCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-handoff-resume-watch') {
    const result = await buildTargetHandoffResumeWatch(positional[0], {
      ...flags,
      rootDir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
      operatorOk: flags['operator-ok'] || flags.operatorOk,
      run: Boolean(flags.run)
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetHandoffResumeWatchCompact(result));
    } else {
      printJson(result);
    }
    return;
  }

  if (command === 'target-permissions') {
    const target = resolveTargetPermissions(positional[0], positional[1] || 'status', flags);
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, targetPolicy);
    const targetProfilePath = profilePath(targetPolicy, target.profile);
    if (target.action === 'set') {
      printJson(writeTargetPermissions(target));
    } else if (target.action === 'apply') {
      const daemon = await cdpDaemonStatus(targetProfilePath);
      if (daemon.ok && !flags.force) {
        throw new Error(`target profile daemon is running; stop it before applying permissions or pass --force: ${target.profile}`);
      }
      ensureDirs(targetPolicy, target.profile);
      printJson(applyTargetPermissions(target, targetProfilePath));
    } else if (target.action === 'status') {
      printJson(targetPermissionStatus(target, targetProfilePath));
    } else {
      printJson(target);
    }
    return;
  }

  if (command === 'target-daemon') {
    const target = resolveTargetDaemon(positional[0], positional[1] || 'status', flags);
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, targetPolicy);
    const daemonProfilePath = profilePath(targetPolicy, target.profile);
    let output;
    if (target.action === 'start') {
      if (target.initialUrl !== 'about:blank') assertAllowedUrl(target.initialUrl, targetPolicy);
      ensureDirs(targetPolicy, target.profile);
      output = await startCdpDaemon(daemonProfilePath, {
        headed: Boolean(flags.headed),
        initialUrl: target.initialUrl
      });
    } else if (target.action === 'stop') {
      output = await stopCdpDaemon(daemonProfilePath);
    } else {
      output = await cdpDaemonStatus(daemonProfilePath);
    }
    printJson({
      target: target.target,
      action: target.action,
      profile: target.profile,
      policy: target.policy,
      ...output
    });
    return;
  }

  if (command === 'target-autostart') {
    const target = resolveTargetAutostart(positional[0], positional[1] || 'plan', {
      ...flags,
      installPath: flags['install-path'],
      nodePath: process.execPath,
      cliPath: fileURLToPath(import.meta.url)
    });
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed('chrome', target.profile, targetPolicy);
    if (target.initialUrl !== 'about:blank') assertAllowedUrl(target.initialUrl, targetPolicy);
    if (target.action === 'write' || target.action === 'install') {
      printJson(writeTargetAutostart(target));
    } else if (target.action === 'load') {
      printJson(loadTargetAutostart(target));
    } else if (target.action === 'unload') {
      printJson(unloadTargetAutostart(target));
    } else if (target.action === 'remove') {
      printJson(removeTargetAutostart(target));
    } else if (target.action === 'status') {
      printJson(targetAutostartStatus(target));
    } else {
      printJson(target);
    }
    return;
  }

  if (command === 'target-run') {
    const target = resolveTargetRun(positional[0], positional[1] || 'outline', flags);
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed(engine, target.profile, targetPolicy);
    ensureDirs(targetPolicy, target.profile);
    const recipe = expandRecipeSearchSteps(readJsonFile(target.recipe));
    assertRecipeAllowed(recipe, targetPolicy);
    const output = await runRecipeWithCdp(recipe, profilePath(targetPolicy, target.profile), {
      daemon: Boolean(flags.daemon),
      afterActionMs: Number(flags['after-action-ms'] || 100),
      allowedOrigins: targetPolicy.allowedOrigins || [],
      artifactDir: targetPolicy.outputDir,
      artifactManifest: flags.manifest !== false,
      artifactPolicy: targetPolicy.source
    });
    writeOutput(targetPolicy, {
      ...flags,
      out: target.out,
      format: target.format,
      result: target.result,
      manifest: flags.manifest !== false
    }, redact(output, targetPolicy), {
      command,
      profile: target.profile,
      engine,
      argv: process.argv.slice(2),
      targetDir: target.dir,
      recipe: target.recipe,
      recipeName: target.recipeName
    });
    return;
  }

  if (command === 'target-run-status') {
    const status = buildTargetRunStatus(positional[0], positional[1] || 'outline', {
      ...flags,
      staleAfterSeconds: flags['stale-after-seconds']
    });
    if (flags.format === 'compact') {
      process.stdout.write(formatTargetRunStatusCompact(status));
    } else {
      printJson(status);
    }
    return;
  }

  if (command === 'target-scrape') {
    const target = resolveTargetScrape(positional[0], flags);
    const targetPolicy = loadPolicy(target.policy);
    assertEngineAllowed(engine, target.profile, targetPolicy);
    assertAllowedUrl(target.url, targetPolicy);
    ensureDirs(targetPolicy, target.profile);
    const output = await scrapeWithCdp(target.url, profilePath(targetPolicy, target.profile), {
      daemon: Boolean(flags.daemon),
      selector: flags.selector || '',
      suggestion: flags.suggestion ?? 0,
      fields: flags.fields ? String(flags.fields).split(',') : [],
      limit: Number(flags.limit || 50),
      waitMs: Number(flags['wait-ms'] || 300),
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600),
      candidateLimit: Number(flags['candidate-limit'] || 20),
      sampleLimit: Number(flags['sample-limit'] || 3),
      suggestionLimit: Number(flags['suggestion-limit'] || 8),
      consoleLimit: Number(flags['console-limit'] || 100),
      maxConsoleArgLength: Number(flags['max-console-arg-length'] || 300)
    });
    writeOutput(targetPolicy, {
      ...flags,
      out: target.out,
      format: target.format,
      result: target.result,
      manifest: flags.manifest !== false
    }, redact(output, targetPolicy), {
      command,
      profile: target.profile,
      engine,
      argv: process.argv.slice(2),
      targetDir: target.dir,
      target: target.target,
      url: target.url,
      selector: output.extractor.selector
    });
    return;
  }

  if (command === 'har-summary') {
    const harPath = positional[0];
    if (!harPath) throw new Error('har-summary requires a HAR path');
    writeOutput(policy, flags, summarizeHarFile(harPath, policy), outputMetadata);
    return;
  }

  if (command === 'reap-owned') {
    const plan = planOwnedReap(policy, { includePublic: flags.public !== false });
    if (!flags.apply) {
      printJson({ mode: 'dry-run', ...plan });
      return;
    }
    printJson({ mode: 'apply', ...applyOwnedReap(plan) });
    return;
  }

  if (command === 'close-session') {
    const result = await runAgentBrowser(['--session', profileName, 'close'], { timeoutMs: 5000 });
    process.stdout.write(result.stdout);
    return;
  }

  ensureDirs(policy, profileName);

  if (command === 'open') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const args = [...sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) })];
    if (flags.headed) args.push('--headed');
    args.push('open', url);
    const result = await runAgentBrowser(args);
    process.stdout.write(result.stdout);
    return;
  }

  if (command === 'login') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const args = [...sessionArgs(policy, profileName, { engine: 'chrome' }), '--headed', 'open', url];
    const result = await runAgentBrowser(args);
    process.stdout.write(result.stdout);
    printJson({
      profile: profileName,
      profilePath: profilePath(policy, profileName),
      statePath: statePath(policy, profileName),
      next: 'Complete login in the opened dedicated browser profile, then run snapshot or extract with the same --profile.'
    });
    return;
  }

  if (command === 'snapshot') {
    const args = [...sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'] }), 'snapshot', '-i'];
    if (flags.json) args.push('--json');
    const result = await runAgentBrowser(args);
    process.stdout.write(result.stdout);
    return;
  }

  if (command === 'extract') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const selector = flags.selector || 'body';
    const limit = Number(flags.limit || 50);
    const fields = String(flags.fields || 'text,href').split(',');
    const script = buildExtractScript({ selector, limit, fields });
    if (Buffer.byteLength(script, 'utf8') > policy.maxEvalBytes) {
      throw new Error(`extract script exceeds maxEvalBytes=${policy.maxEvalBytes}`);
    }
    const browserArgs = sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) });
    await runAgentBrowser([...browserArgs, 'open', url]);
    const result = await runAgentBrowser([...browserArgs, 'eval', '--stdin'], { stdin: script });
    try {
      writeOutput(policy, flags, redact(JSON.parse(result.stdout), policy), { ...outputMetadata, url, selector, fields, limit });
    } catch {
      process.stdout.write(result.stdout);
    }
    return;
  }

  if (command === 'outline') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const script = buildOutlineScript({ linkLimit: Number(flags['link-limit'] || 100) });
    const browserArgs = sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) });
    await runAgentBrowser([...browserArgs, 'open', url]);
    const result = await runAgentBrowser([...browserArgs, 'eval', '--stdin'], { stdin: script });
    try {
      writeOutput(policy, flags, redact(JSON.parse(result.stdout), policy), { ...outputMetadata, url });
    } catch {
      process.stdout.write(result.stdout);
    }
    return;
  }

  if (command === 'observe') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const script = buildObserveScript({
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600)
    });
    const browserArgs = sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) });
    await runAgentBrowser([...browserArgs, 'open', url]);
    const result = await runAgentBrowser([...browserArgs, 'eval', '--stdin'], { stdin: script });
    try {
      writeOutput(policy, flags, redact(JSON.parse(result.stdout), policy), { ...outputMetadata, url });
    } catch {
      process.stdout.write(result.stdout);
    }
    return;
  }

  if (command === 'extract-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await extractWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      selector: flags.selector || 'body',
      limit: Number(flags.limit || 50),
      fields: String(flags.fields || 'text,href').split(',')
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url, selector: flags.selector || 'body' });
    return;
  }

  if (command === 'outline-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await outlineWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      linkLimit: Number(flags['link-limit'] || 100)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'observe-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await observeWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'analyze-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await analyzeWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      waitMs: Number(flags['wait-ms'] || 300),
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600),
      candidateLimit: Number(flags['candidate-limit'] || 20),
      sampleLimit: Number(flags['sample-limit'] || 3),
      suggestionLimit: Number(flags['suggestion-limit'] || 8),
      consoleLimit: Number(flags['console-limit'] || 100),
      maxConsoleArgLength: Number(flags['max-console-arg-length'] || 300)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'scrape-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await scrapeWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      selector: flags.selector || '',
      suggestion: flags.suggestion ?? 0,
      fields: flags.fields ? String(flags.fields).split(',') : [],
      limit: Number(flags.limit || 50),
      waitMs: Number(flags['wait-ms'] || 300),
      linkLimit: Number(flags['link-limit'] || 25),
      controlLimit: Number(flags['control-limit'] || 40),
      textLimit: Number(flags['text-limit'] || 600),
      candidateLimit: Number(flags['candidate-limit'] || 20),
      sampleLimit: Number(flags['sample-limit'] || 3),
      suggestionLimit: Number(flags['suggestion-limit'] || 8),
      consoleLimit: Number(flags['console-limit'] || 100),
      maxConsoleArgLength: Number(flags['max-console-arg-length'] || 300)
    });
    writeOutput(policy, { result: flags.result || 'rows', ...flags }, redact(output, policy), { ...outputMetadata, url, selector: output.extractor.selector });
    return;
  }

  if (command === 'inspect-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await inspectWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      candidateLimit: Number(flags['candidate-limit'] || 20),
      sampleLimit: Number(flags['sample-limit'] || 3)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'wait-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await waitForWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      selector: flags.selector || '',
      text: flags.text || '',
      urlIncludes: flags['url-includes'] || '',
      timeoutMs: Number(flags['timeout-ms'] || 5000),
      pollMs: Number(flags['poll-ms'] || 100)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'console-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await consoleSummaryWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      waitMs: Number(flags['wait-ms'] || 300),
      limit: Number(flags.limit || 100),
      maxArgLength: Number(flags['max-arg-length'] || 300)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'screenshot-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    if (!flags.out) throw new Error('screenshot-cdp requires --out file.png');
    const output = await screenshotWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      fullPage: Boolean(flags['full-page']),
      waitMs: Number(flags['wait-ms'] || 0)
    });
    const target = safeOutputPath(policy, flags.out);
    fs.mkdirSync(policy.outputDir, { recursive: true });
    fs.writeFileSync(target, Buffer.from(output.data, 'base64'));
    const metadata = {
      command,
      profile: profileName,
      engine,
      argv: process.argv.slice(2),
      url,
      output: target,
      mimeType: output.mimeType,
      format: output.format,
      fullPage: output.fullPage,
      width: output.width,
      height: output.height,
      bytes: output.bytes,
      policy: policy.source,
      createdAt: new Date().toISOString()
    };
    if (flags.manifest) {
      fs.writeFileSync(`${target}.manifest.json`, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    }
    printJson(metadata);
    return;
  }

  if (command === 'fill-cdp' || command === 'click-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const selector = flags.selector;
    if (!selector) throw new Error(`${command} requires --selector`);
    const output = await actionWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      action: command === 'fill-cdp' ? 'fill' : 'click',
      selector,
      value: flags.value || '',
      linkLimit: Number(flags['link-limit'] || 100)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url, action: command === 'fill-cdp' ? 'fill' : 'click', selector });
    return;
  }

  if (command === 'network-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await networkSummaryWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon)
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'login-cdp') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await openCdpProfile(url, profilePath(policy, profileName), { headed: true });
    printJson({
      ...output,
      next: 'Complete login in the opened dedicated Chrome profile, then close that browser before using extract-cdp/outline-cdp with the same --profile.'
    });
    return;
  }

  if (command === 'search-cdp') {
    const query = positional.join(' ');
    const provider = flags.provider || 'duckduckgo';
    const url = searchUrl(provider, query);
    assertAllowedUrl(url, policy);
    const output = await outlineWithCdp(url, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      linkLimit: Number(flags['link-limit'] || 50)
    });
    writeOutput(policy, flags, redact({
      search: searchStatus(provider, query, output),
      page: output
    }, policy), { ...outputMetadata, provider, query, url });
    return;
  }

  if (command === 'run-cdp') {
    const recipe = expandRecipeSearchSteps(readJsonFile(positional[0]));
    assertRecipeAllowed(recipe, policy);
    const output = await runRecipeWithCdp(recipe, profilePath(policy, profileName), {
      daemon: Boolean(flags.daemon),
      afterActionMs: Number(flags['after-action-ms'] || 100),
      artifactDir: policy.outputDir,
      artifactManifest: Boolean(flags.manifest),
      artifactPolicy: policy.source
    });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, recipe: positional[0] });
    return;
  }

  if (command === 'outline-playwright') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const output = await outlineWithPlaywright(url, { linkLimit: Number(flags['link-limit'] || 100) });
    writeOutput(policy, flags, redact(output, policy), { ...outputMetadata, url });
    return;
  }

  if (command === 'capture-har') {
    const url = positional[0];
    assertAllowedUrl(url, policy);
    const out = flags.out;
    if (!out) throw new Error('capture-har requires --out file.har');
    const harPath = safeOutputPath(policy, out);
    fs.mkdirSync(policy.outputDir, { recursive: true });
    const browserArgs = sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: isDataUrl(url) });
    await runAgentBrowser([...browserArgs, 'network', 'har', 'start']);
    await runAgentBrowser([...browserArgs, 'open', url]);
    await runAgentBrowser([...browserArgs, 'network', 'har', 'stop', harPath]);
    process.stdout.write(`${harPath}\n`);
    return;
  }

  if (command === 'search') {
    const query = positional.join(' ');
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    assertAllowedUrl(url, policy);
    const result = await runAgentBrowser([...sessionArgs(policy, profileName, { engine, stateOnly: flags['state-only'], skipAllowedDomains: false }), 'open', url]);
    process.stdout.write(result.stdout);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
