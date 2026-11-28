// Command handlers 389-1354 of the former src/cli.mjs main(); src/cli.mjs runs the parts in order until one handles the command.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgentBrowser } from './agent-browser.mjs';
import { buildAgentBrowserDoctor, formatAgentBrowserDoctorCompact } from './agent-browser-doctor.mjs';
import { buildTargetApprovalPreflight, formatTargetApprovalPreflightCompact } from './target-approval-pack.mjs';
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
import { NOT_HANDLED, printJson, readTextFlag } from './cli-support.mjs';

export async function runCommandsPart1({ command, flags, positional }) {
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

  return NOT_HANDLED;
}
