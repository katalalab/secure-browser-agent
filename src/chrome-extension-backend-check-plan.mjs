import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function boolFromFlag(value) {
  if (value === true || value === 'yes') return true;
  if (value === false || value === 'no') return false;
  return null;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function command(args) {
  return {
    args,
    shell: args.map(shellQuote).join(' ')
  };
}

function jsString(value) {
  return JSON.stringify(String(value || ''));
}

function probeSnippet(pluginDir, sessionName) {
  const browserClient = `${String(pluginDir || '').replace(/\/$/, '')}/scripts/browser-client.mjs`;
  return [
    'try {',
    '  if (!globalThis.agent) {',
    `    const { setupBrowserRuntime } = await import(${jsString(browserClient)});`,
    '    await setupBrowserRuntime({ globals: globalThis });',
    '  }',
    '  if (!globalThis.browser) globalThis.browser = await agent.browsers.get("extension");',
    `  await browser.nameSession(${jsString(sessionName || 'Chrome backend check')});`,
    '  const sbaProbeTabs = await browser.user.openTabs();',
    '  nodeRepl.write(JSON.stringify({ ok: true, backendAvailable: true, tabCount: sbaProbeTabs.length, sampleTabs: sbaProbeTabs.slice(0, 5).map((tab, index) => ({ index, title: tab.title || "", url: tab.url || "", lastOpened: tab.lastOpened || "", tabGroup: tab.tabGroup || "" })) }, null, 2));',
    '} catch (error) {',
    '  nodeRepl.write(JSON.stringify({ ok: false, backendAvailable: false, error: String(error?.message || error) }, null, 2));',
    '}'
  ].join('\n');
}

export function buildChromeExtensionBackendCheckPlan(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const rootDir = options.rootDir || process.cwd();
  const observedAvailable = boolFromFlag(options.backendAvailable ?? options.observedBackendAvailable);
  const status = options.chromeExtensionStatus || buildChromeExtensionStatus({
    ...options,
    backendProbe: observedAvailable === null ? undefined : {
      attemptedByCli: true,
      available: observedAvailable,
      note: 'Observed by caller before building the backend check plan.'
    }
  });
  const pluginDir = status.plugin?.dir || options.pluginDir || '';
  const prepared = Boolean(status.decision?.everydayChromeViaCodexExtensionPrepared);
  const ready = observedAvailable === true || Boolean(status.decision?.everydayChromeViaCodexExtensionReady);
  const sessionName = options.sessionName || 'Chrome backend check';
  const snippets = prepared && !ready
    ? {
        probe: probeSnippet(pluginDir, sessionName)
      }
    : {};
  const nextAction = ready
    ? 'build-claim-plan-for-user-tab'
    : prepared
    ? 'run-node-repl-backend-probe'
    : status.nextAction || 'prepare-codex-chrome-extension';

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    startsCapture: false,
    pageOutputTrusted: false,
    nextTool: prepared && !ready ? 'mcp__node_repl__js' : 'none',
    nextAction,
    selectedProfile: status.extension?.selectedProfileDirectory || '',
    extensionPrepared: prepared,
    backendObservedAvailable: observedAvailable,
    backendAvailable: ready,
    directCdpDefaultProfileAllowed: false,
    storedAuthenticatedScrapingAllowed: false,
    dedicatedTargetProfileRequiredForStoredAuth: true,
    readsBrowserStorage: false,
    readsOpenTabMetadataWhenRun: prepared && !ready,
    probeUsesOpenTabsOnly: true,
    snippets,
    commands: {
      status: command(['node', 'src/cli.mjs', 'chrome-extension-status', '--format', 'compact']),
      troubleshootOnFailure: command(['node', 'src/cli.mjs', 'chrome-extension-troubleshoot', '--backend-available', 'no', '--backend-last-error', '<error-from-probe>', '--format', 'compact']),
      recordFailure: command(['node', 'src/cli.mjs', 'regular-chrome-use', '--intent', 'inspect', '--chrome-extension-prepared', 'yes', '--chrome-extension-backend-available', 'no', '--chrome-extension-backend-last-error', '<error-from-probe>', '--write', '--out', 'operator/regular-chrome-use-latest.json', '--format', 'compact']),
      recordSuccess: command(['node', 'src/cli.mjs', 'regular-chrome-use', '--intent', 'inspect', '--chrome-extension-prepared', 'yes', '--chrome-extension-backend-available', 'yes', '--write', '--out', 'operator/regular-chrome-use-latest.json', '--format', 'compact']),
      claimPlanOnSuccess: command(['node', 'src/cli.mjs', 'chrome-extension-claim-plan', '--backend-ready', 'yes', '--intent', 'inspect', '--format', 'compact'])
    },
    status
  };
}

export function formatChromeExtensionBackendCheckPlanCompact(plan) {
  const lines = [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `starts_capture: ${yesNo(plan.startsCapture)}`,
    `page_output_trusted: ${yesNo(plan.pageOutputTrusted)}`,
    `next_action: ${plan.nextAction}`,
    `next_tool: ${plan.nextTool}`,
    `selected_profile: ${compact(plan.selectedProfile)}`,
    `extension_prepared: ${yesNo(plan.extensionPrepared)}`,
    `backend_observed_available: ${plan.backendObservedAvailable === null ? 'unknown' : yesNo(plan.backendObservedAvailable)}`,
    `backend_available: ${yesNo(plan.backendAvailable)}`,
    `direct_cdp_default_profile_allowed: ${yesNo(plan.directCdpDefaultProfileAllowed)}`,
    `stored_authenticated_scraping_allowed: ${yesNo(plan.storedAuthenticatedScrapingAllowed)}`,
    `dedicated_target_profile_required: ${yesNo(plan.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `reads_browser_storage: ${yesNo(plan.readsBrowserStorage)}`,
    `reads_open_tab_metadata_when_run: ${yesNo(plan.readsOpenTabMetadataWhenRun)}`,
    `probe_uses_open_tabs_only: ${yesNo(plan.probeUsesOpenTabsOnly)}`,
    `snippet_keys: ${Object.keys(plan.snippets).join(',') || 'none'}`,
    `status_command: ${plan.commands.status.shell}`,
    `troubleshoot_failure_command: ${plan.commands.troubleshootOnFailure.shell}`,
    `record_failure_command: ${plan.commands.recordFailure.shell}`,
    `record_success_command: ${plan.commands.recordSuccess.shell}`,
    `claim_plan_success_command: ${plan.commands.claimPlanOnSuccess.shell}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatChromeExtensionBackendCheckPlanMarkdown(plan) {
  const lines = [
    '# Codex Chrome Extension Backend Check Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Opens browser now: ${plan.opensBrowserNow ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Next action: ${plan.nextAction}`,
    `- Next tool: ${plan.nextTool}`,
    `- Selected profile: ${plan.selectedProfile || 'unknown'}`,
    `- Extension prepared: ${plan.extensionPrepared ? 'yes' : 'no'}`,
    `- Backend available: ${plan.backendAvailable ? 'yes' : 'no'}`,
    `- Direct CDP default profile allowed: ${plan.directCdpDefaultProfileAllowed ? 'yes' : 'no'}`,
    ''
  ];
  if (plan.snippets.probe) {
    lines.push('## Probe Snippet', '', '```js', plan.snippets.probe, '```', '');
  }
  lines.push(
    '## Follow Up Commands',
    '',
    '```bash',
    plan.commands.troubleshootOnFailure.shell,
    plan.commands.recordFailure.shell,
    plan.commands.recordSuccess.shell,
    plan.commands.claimPlanOnSuccess.shell,
    '```',
    ''
  );
  return lines.join('\n');
}
