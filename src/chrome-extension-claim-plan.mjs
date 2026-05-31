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

function normalizeIntent(intent) {
  const value = String(intent || 'inspect').toLowerCase();
  if (['operate', 'click', 'fill'].includes(value)) return 'operate';
  if (['screenshot', 'visual'].includes(value)) return 'screenshot';
  if (['console', 'logs'].includes(value)) return 'console';
  if (['network', 'requests'].includes(value)) return 'network';
  return 'inspect';
}

function actionsForIntent(intent) {
  const common = ['open-tabs', 'claim-tab', 'title-length', 'url-redacted', 'snapshot'];
  if (intent === 'operate') return [...common, 'click', 'fill'];
  if (intent === 'screenshot') return [...common, 'screenshot'];
  if (intent === 'console') return [...common, 'console'];
  if (intent === 'network') return [...common, 'network'];
  return common;
}

function jsString(value) {
  return JSON.stringify(String(value || ''));
}

function redactedUrlExpression() {
  return `function sbaRedactUrl(value) {
  const raw = String(value || "");
  try {
    const parsed = new URL(raw);
    const redacted = parsed.origin === "null" ? parsed.protocol + parsed.pathname : parsed.origin + parsed.pathname;
    return { urlPresent: Boolean(raw), urlRedacted: redacted, origin: parsed.origin === "null" ? "" : parsed.origin, path: parsed.pathname, queryPresent: Boolean(parsed.search), fragmentPresent: Boolean(parsed.hash), fullUrlReturned: false };
  } catch {
    const redacted = raw.split(/[?#]/, 1)[0];
    return { urlPresent: Boolean(raw), urlRedacted: redacted, origin: "", path: "", queryPresent: raw.includes("?"), fragmentPresent: raw.includes("#"), fullUrlReturned: false };
  }
}`;
}

function safeTabExpression() {
  return `function sbaSafeTab(tab, index) {
  const url = sbaRedactUrl(tab.url || "");
  return { index, titlePresent: Boolean(tab.title), titleLength: String(tab.title || "").length, ...url, lastOpenedPresent: Boolean(tab.lastOpened), tabGroupPresent: Boolean(tab.tabGroup) };
}`;
}

function setupSnippet(pluginDir, sessionName) {
  const browserClient = `${String(pluginDir || '').replace(/\/$/, '')}/scripts/browser-client.mjs`;
  return [
    'if (!globalThis.agent) {',
    `  const { setupBrowserRuntime } = await import(${jsString(browserClient)});`,
    '  await setupBrowserRuntime({ globals: globalThis });',
    '}',
    'if (!globalThis.browser) globalThis.browser = await agent.browsers.get("extension");',
    `await browser.nameSession(${jsString(sessionName || 'Chrome claim plan')});`
  ].join('\n');
}

function openTabsSnippet(pluginDir, sessionName) {
  return [
    setupSnippet(pluginDir, sessionName),
    redactedUrlExpression(),
    safeTabExpression(),
    'const sbaOpenTabs = await browser.user.openTabs();',
    'nodeRepl.write(JSON.stringify({ tabs: sbaOpenTabs.map((tab, index) => sbaSafeTab(tab, index)), pageTitleReturned: false, fullUrlReturned: false }));'
  ].join('\n');
}

function claimTabSnippet(pluginDir, options) {
  const matchTitle = jsString(options.matchTitle || '');
  const matchUrl = jsString(options.matchUrl || '');
  const matchOrigin = jsString(options.matchOrigin || '');
  const matchPath = jsString(options.matchPath || '');
  const index = Number.isFinite(Number(options.tabIndex)) ? Number(options.tabIndex) : -1;
  return [
    setupSnippet(pluginDir, options.sessionName),
    redactedUrlExpression(),
    safeTabExpression(),
    'const sbaTabs = await browser.user.openTabs();',
    `const sbaMatchTitle = ${matchTitle};`,
    `const sbaMatchUrl = ${matchUrl};`,
    `const sbaMatchOrigin = ${matchOrigin};`,
    `const sbaMatchPath = ${matchPath};`,
    `const sbaMatchIndex = ${index};`,
    'const sbaTabInfo = sbaTabs.find((candidate, index) => { const safe = sbaSafeTab(candidate, index); return (sbaMatchIndex >= 0 ? index === sbaMatchIndex : true) && (sbaMatchTitle ? String(candidate.title || "").includes(sbaMatchTitle) : true) && (sbaMatchUrl ? String(candidate.url || "").includes(sbaMatchUrl) : true) && (sbaMatchOrigin ? safe.origin === sbaMatchOrigin : true) && (sbaMatchPath ? safe.path === sbaMatchPath : true); });',
    'if (!sbaTabInfo) throw new Error("No matching user Chrome tab. Refresh openTabs and choose a tab returned by that result.");',
    'globalThis.tab = await browser.user.claimTab(sbaTabInfo);',
    'const sbaClaimedTitle = await tab.title();',
    'const sbaClaimedUrl = await tab.url();',
    'nodeRepl.write(JSON.stringify({ claimed: true, titlePresent: Boolean(sbaClaimedTitle), titleLength: String(sbaClaimedTitle || "").length, ...sbaRedactUrl(sbaClaimedUrl), pageTitleReturned: false, fullUrlReturned: false }));'
  ].join('\n');
}

export function buildChromeExtensionClaimPlan(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const rootDir = options.rootDir || process.cwd();
  const intent = normalizeIntent(options.intent);
  const observedReady = boolFromFlag(options.backendReady ?? options.backendAvailable);
  const status = options.chromeExtensionStatus || buildChromeExtensionStatus({
    ...options,
    backendProbe: observedReady === null ? undefined : {
      attemptedByCli: true,
      available: observedReady,
      note: 'Observed by caller before building the claim plan.'
    }
  });
  const ready = observedReady === true || Boolean(status.decision?.everydayChromeViaCodexExtensionReady);
  const pluginDir = status.plugin?.dir || options.pluginDir || '';
  const sessionName = options.sessionName || `Chrome ${intent}`;
  const allowedActions = actionsForIntent(intent);
  const snippets = ready
    ? {
        openTabs: openTabsSnippet(pluginDir, sessionName),
        claimTab: claimTabSnippet(pluginDir, { ...options, sessionName })
      }
    : {};
  const nextAction = ready
    ? 'list-user-tabs-then-claim-returned-tab'
    : status.decision?.everydayChromeViaCodexExtensionPrepared
    ? 'run-chrome-extension-troubleshoot-or-resume'
    : status.nextAction || 'prepare-codex-chrome-extension';

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    pageOutputTrusted: false,
    intent,
    ready,
    nextAction,
    nextTool: ready ? 'mcp__node_repl__js' : 'none',
    selectedProfile: status.extension?.selectedProfileDirectory || '',
    extensionPrepared: Boolean(status.decision?.everydayChromeViaCodexExtensionPrepared),
    extensionBackendAvailable: ready,
    directCdpDefaultProfileAllowed: false,
    storedAuthenticatedScrapingAllowed: false,
    dedicatedTargetProfileRequiredForStoredAuth: true,
    readsBrowserStorage: false,
    readsOpenTabMetadataWhenRun: ready,
    pageTitleReturnedWhenRun: false,
    fullUrlReturnedWhenRun: false,
    claimRequiresOpenTabsResult: true,
    freshSnapshotRequiredForMutation: intent === 'operate',
    allowedActions,
    match: {
      title: options.matchTitle || '',
      url: options.matchUrl || '',
      origin: options.matchOrigin || '',
      path: options.matchPath || '',
      tabIndex: Number.isFinite(Number(options.tabIndex)) ? Number(options.tabIndex) : null
    },
    snippets,
    commands: {
      troubleshoot: command(['node', 'src/cli.mjs', 'chrome-extension-troubleshoot', '--format', 'compact']),
      resumePlan: command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--format', 'compact']),
      resumeApproval: command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--run', '--operator-ok', 'OK', '--format', 'compact'])
    },
    status
  };
}

export function formatChromeExtensionClaimPlanCompact(plan) {
  const lines = [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `page_output_trusted: ${yesNo(plan.pageOutputTrusted)}`,
    `intent: ${plan.intent}`,
    `ready: ${yesNo(plan.ready)}`,
    `next_action: ${plan.nextAction}`,
    `next_tool: ${plan.nextTool}`,
    `selected_profile: ${compact(plan.selectedProfile)}`,
    `extension_prepared: ${yesNo(plan.extensionPrepared)}`,
    `extension_backend_available: ${yesNo(plan.extensionBackendAvailable)}`,
    `direct_cdp_default_profile_allowed: ${yesNo(plan.directCdpDefaultProfileAllowed)}`,
    `stored_authenticated_scraping_allowed: ${yesNo(plan.storedAuthenticatedScrapingAllowed)}`,
    `dedicated_target_profile_required: ${yesNo(plan.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `reads_browser_storage: ${yesNo(plan.readsBrowserStorage)}`,
    `reads_open_tab_metadata_when_run: ${yesNo(plan.readsOpenTabMetadataWhenRun)}`,
    `page_title_returned_when_run: ${yesNo(plan.pageTitleReturnedWhenRun)}`,
    `full_url_returned_when_run: ${yesNo(plan.fullUrlReturnedWhenRun)}`,
    `claim_requires_open_tabs_result: ${yesNo(plan.claimRequiresOpenTabsResult)}`,
    `fresh_snapshot_required_for_mutation: ${yesNo(plan.freshSnapshotRequiredForMutation)}`,
    `allowed_actions: ${plan.allowedActions.join(',')}`,
    `snippet_keys: ${Object.keys(plan.snippets).join(',') || 'none'}`,
    `troubleshoot_command: ${plan.commands.troubleshoot.shell}`,
    `resume_plan_command: ${plan.commands.resumePlan.shell}`,
    `resume_approval_command: ${plan.commands.resumeApproval.shell}`
  ];
  return `${lines.join('\n')}\n`;
}

export function formatChromeExtensionClaimPlanMarkdown(plan) {
  const lines = [
    '# Codex Chrome Extension Claim Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Ready: ${plan.ready ? 'yes' : 'no'}`,
    `Opens browser now: ${plan.opensBrowserNow ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Next action: ${plan.nextAction}`,
    `- Next tool: ${plan.nextTool}`,
    `- Intent: ${plan.intent}`,
    `- Selected profile: ${plan.selectedProfile || 'unknown'}`,
    `- Direct CDP default profile allowed: ${plan.directCdpDefaultProfileAllowed ? 'yes' : 'no'}`,
    `- Stored authenticated scraping allowed: ${plan.storedAuthenticatedScrapingAllowed ? 'yes' : 'no'}`,
    ''
  ];
  if (plan.ready) {
    lines.push('## Snippets', '', '### Open Tabs', '', '```js', plan.snippets.openTabs, '```', '', '### Claim Tab', '', '```js', plan.snippets.claimTab, '```', '');
  } else {
    lines.push('## Resume', '', '```bash', plan.commands.resumePlan.shell, plan.commands.resumeApproval.shell, '```', '');
  }
  return lines.join('\n');
}
