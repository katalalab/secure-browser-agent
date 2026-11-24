// Command handlers 1356-2337 of the former src/cli.mjs main(); src/cli.mjs runs the parts in order until one handles the command.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cdpDaemonStatus, startCdpDaemon, stopCdpDaemon } from './cdp-backend.mjs';
import { assertAllowedUrl, profilePath, statePath } from './policy.mjs';
import { doctorTargetPack, scaffoldTargetPack } from './target-pack.mjs';
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
import { buildSourceAudit, formatSourceAuditCompact, formatSourceAuditMarkdown } from './source-audit.mjs';
import { buildGithubRepoResearch, formatGithubRepoResearchCompact, formatGithubRepoResearchMarkdown, writeGithubRepoResearch } from './github-repo-research.mjs';
import { formatTargetBenchmarkMarkdown, runTargetBenchmark, writeTargetBenchmarkReport } from './target-benchmark.mjs';
import { auditTargetPack } from './security-audit.mjs';
import { buildRuntimeAudit, buildRuntimeCleanupPlan, formatRuntimeAuditCompact, formatRuntimeAuditMarkdown, formatRuntimeCleanupPlanCompact, formatRuntimeCleanupPlanMarkdown, writeRuntimeAuditReport, writeRuntimeCleanupPlanReport } from './runtime-audit.mjs';
import { buildRunGateAudit, formatRunGateAuditCompact } from './run-gate-audit.mjs';
import { buildCompactCommandAudit, formatCompactCommandAuditCompact } from './compact-command-audit.mjs';
import { buildCompletionProofBundle, buildCompletionProofBundleStatus, buildCompletionProofBundleWatch, formatCompletionProofBundleCompact, formatCompletionProofBundleStatusCompact, formatCompletionProofBundleWatchCompact } from './completion-proof-bundle.mjs';
import { buildReadinessAudit, formatReadinessAuditCompact, formatReadinessAuditMarkdown } from './readiness-audit.mjs';
import { buildObjectiveNext, formatObjectiveNextCompact, formatObjectiveNextMarkdown } from './objective-next.mjs';
import { buildObjectiveResume, formatObjectiveResumeCompact, formatObjectiveResumeMarkdown } from './objective-resume.mjs';
import { buildObjectiveStatus, formatObjectiveStatusCompact, formatObjectiveStatusMarkdown } from './objective-status.mjs';
import { buildObjectiveCompletionAudit, buildObjectiveCompletionAuditStatus, buildObjectiveCompletionAuditWatch, formatObjectiveCompletionAuditCompact, formatObjectiveCompletionAuditMarkdown, formatObjectiveCompletionAuditStatusCompact, formatObjectiveCompletionAuditWatchCompact } from './objective-completion-audit.mjs';
import { buildObjectiveSafeCommand, formatObjectiveSafeCommandCompact } from './objective-safe-command.mjs';
import { buildObjectiveProofPipeline, formatObjectiveProofPipelineCompact, formatObjectiveProofPipelineMarkdown } from './objective-proof-pipeline.mjs';
import { buildObjectiveHandoff, formatObjectiveHandoffCompact, formatObjectiveHandoffMarkdown } from './objective-handoff.mjs';
import { buildTargetBootstrapPlan, formatTargetBootstrapPlanCompact, formatTargetBootstrapPlanMarkdown } from './target-bootstrap-plan.mjs';
import { buildLightpandaDoctor, formatLightpandaDoctorCompact, formatLightpandaDoctorMarkdown } from './lightpanda-doctor.mjs';
import { buildLightpandaDecision, formatLightpandaDecisionMarkdown, writeLightpandaDecision } from './lightpanda-decision.mjs';
import { buildPlaywrightDoctor, formatPlaywrightDoctorCompact, formatPlaywrightDoctorMarkdown } from './playwright-doctor.mjs';
import { buildSeleniumDoctor, formatSeleniumDoctorCompact, formatSeleniumDoctorMarkdown } from './selenium-doctor.mjs';
import { buildSecretAudit, buildSecretRunPlan, buildSecretRunSelect, buildSecretSetupPlan, formatSecretAuditCompact, formatSecretAuditMarkdown, formatSecretRunPlanCompact, formatSecretRunPlanMarkdown, formatSecretRunSelectCompact, formatSecretSetupPlanCompact, formatSecretSetupPlanMarkdown } from './secret-audit.mjs';
import { buildSecretEnvHandoff, buildSecretEnvHandoffStatus, buildSecretEnvHandoffWatch, formatSecretEnvHandoffCompact, formatSecretEnvHandoffMarkdown, formatSecretEnvHandoffStatusCompact, formatSecretEnvHandoffWatchCompact } from './secret-env-handoff.mjs';
import { buildControlStatus } from './control-status.mjs';
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
import { NOT_HANDLED, ensureDirs, printJson, readFirstTextFlag } from './cli-support.mjs';

export async function runCommandsPart2({ command, flags, positional, policy, profileName }) {
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

  return NOT_HANDLED;
}
