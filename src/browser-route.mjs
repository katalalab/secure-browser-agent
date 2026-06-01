import { buildChromeControlPlan } from './chrome-control-plan.mjs';
import { buildChromeExtensionHandoff } from './chrome-extension-handoff.mjs';
import { buildChromeMcpStatus } from './chrome-mcp-status.mjs';
import { buildLightpandaDoctor } from './lightpanda-doctor.mjs';
import { buildLightpandaGate } from './lightpanda-gate.mjs';
import { buildProofGateStatus } from './proof-gate-status.mjs';
import { buildSeleniumDoctor } from './selenium-doctor.mjs';

const TASK_ALIASES = new Map([
  ['auto', 'auto'],
  ['existing-tab', 'existing-tab'],
  ['everyday-tab', 'existing-tab'],
  ['regular-chrome', 'existing-tab'],
  ['user-session', 'existing-tab'],
  ['search', 'search'],
  ['find', 'search'],
  ['analyze', 'analyze'],
  ['analysis', 'analyze'],
  ['inspect', 'analyze'],
  ['structure', 'analyze'],
  ['page-structure', 'analyze'],
  ['scrape', 'scrape'],
  ['extract', 'scrape'],
  ['operate', 'operate'],
  ['click', 'operate'],
  ['fill', 'operate'],
  ['authenticated-scrape', 'authenticated-scrape'],
  ['auth-scrape', 'authenticated-scrape'],
  ['stored-auth', 'authenticated-scrape'],
  ['public-crawl', 'public-crawl'],
  ['public-scrape', 'public-crawl'],
  ['compatibility-test', 'compatibility-test'],
  ['selenium', 'compatibility-test'],
  ['webdriver', 'compatibility-test']
]);

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNoUnknown(value) {
  return value === null || value === undefined ? 'unknown' : yesNo(value);
}

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function normalizeTask(task) {
  return TASK_ALIASES.get(String(task || 'auto')) || 'auto';
}

function parseObservedFlag(value) {
  if (value === true || value === 'yes' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  return null;
}

function parseObservedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lightweightChromeMcpStatusFromOptions(options = {}) {
  const hasObservation = options.chromeMcpConnected !== undefined
    || options.chromeMcpPageListOk !== undefined
    || options.chromeMcpLastError;
  if (!hasObservation) return null;
  const connected = parseObservedFlag(options.chromeMcpConnected);
  const pageListOk = parseObservedFlag(options.chromeMcpPageListOk);
  const tools = parseObservedNumber(options.chromeMcpTools);
  const pageCount = parseObservedNumber(options.chromeMcpPageCount);
  const lastError = clean(options.chromeMcpLastError || '', '');
  const timedOut = /timed out|timeout|Network\.enable/i.test(lastError);
  const usable = connected === true && pageListOk === true;
  const status = usable
    ? 'usable-for-operator-requested-tabs'
    : connected === true && pageListOk === false && timedOut
    ? 'mcp-connected-page-list-timeout'
    : connected === true && pageListOk === false
    ? 'mcp-connected-page-list-failed'
    : connected === true
    ? 'mcp-connected-page-list-unproved'
    : connected === false
    ? 'mcp-observed-disconnected'
    : 'not-ready';
  return {
    observedSource: options.chromeMcpSource || '',
    observed: {
      chromeDevtoolsMcpConnected: connected,
      chromeDevtoolsMcpTools: tools,
      chromeDevtoolsMcpPageListOk: pageListOk,
      chromeDevtoolsMcpPageCount: pageCount,
      chromeDevtoolsMcpListPagesTimedOut: timedOut,
      chromeDevtoolsMcpLastError: lastError
    },
    decision: {
      status,
      chromeDevtoolsMcpUsableForEverydayTabs: usable,
      usableForEverydayChromeTabs: usable
    }
  };
}

function lightweightChromeExtensionStatusFromOptions(options = {}) {
  const prepared = parseObservedFlag(options.chromeExtensionPrepared);
  const backendAvailable = parseObservedFlag(options.chromeExtensionBackendAvailable ?? options.extensionBackendAvailable);
  if (prepared === null && backendAvailable === null) return null;
  const extensionPrepared = prepared ?? backendAvailable === true;
  const extensionReady = extensionPrepared && backendAvailable === true;
  return {
    decision: {
      everydayChromeViaCodexExtensionPrepared: extensionPrepared,
      everydayChromeViaCodexExtensionBackendAvailable: backendAvailable === true,
      everydayChromeViaCodexExtensionReady: extensionReady,
      everydayChromeViaCdpAllowed: false,
      dedicatedTargetProfileStillRequiredForStoredAuth: true
    },
    extension: {
      selectedProfileDirectory: options.chromeExtensionSelectedProfile || 'Default',
      selectedProfileEnabled: extensionPrepared,
      enabled: extensionPrepared
    },
    nativeHost: {
      correct: extensionPrepared
    },
    nextAction: extensionReady ? 'claim-or-open-everyday-chrome-tab' : 'verify-codex-chrome-extension-backend'
  };
}

function selectedTask(task, proofGate) {
  const normalized = normalizeTask(task);
  if (normalized !== 'auto') return normalized;
  if (proofGate && !proofGate.complete) return 'authenticated-scrape';
  return 'public-crawl';
}

function proofCommand(proofGate) {
  return proofGate?.recommendedCommand?.command
    || proofGate?.nextAction?.command
    || command(['node', 'src/cli.mjs', 'proof-gate-status', '--format', 'compact']);
}

function chromeResumePlanCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--format', 'compact']);
}

function chromeResumeApprovalCommand() {
  return command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--run', '--operator-ok', 'OK', '--format', 'compact']);
}

function targetProfileRoute({ task, proofGate }) {
  const operation = task === 'operate';
  return {
    lane: operation ? 'target-pack-direct-cdp-operate' : 'target-pack-direct-cdp',
    backend: 'direct-cdp-chrome',
    profileMode: 'dedicated-target-profile',
    userPermissionRequired: Boolean(proofGate.operatorInput) || operation,
    operatorInput: Boolean(proofGate.operatorInput),
    canRunInBackground: true,
    startsCapture: !operation && !proofGate.operatorGuidance?.captureBlocked,
    captureBlocked: Boolean(proofGate.operatorGuidance?.captureBlocked),
    commandOpensBrowser: false,
    approvalCommandOpensBrowser: false,
    commandRunOnlyAfterUserSays: '',
    command: proofCommand(proofGate),
    approvalCommand: null,
    reason: operation
      ? 'Authenticated page operation stays in the dedicated target profile and should run auth-check plus a fresh snapshot before mutation. Everyday Chrome CDP remains disabled for this path.'
      : 'Stored authenticated scraping stays in a dedicated target profile. Everyday Chrome CDP remains disabled for this path.'
  };
}

function routeForTask({ task, chromePlan, chromeMcpStatus, chromeHandoff, lightpanda, lightpandaGate, selenium, proofGate, allowNewBackgroundTab, newBackgroundUrlEnv }) {
  if (task === 'existing-tab') {
    const mcpReady = Boolean(chromeMcpStatus?.decision?.chromeDevtoolsMcpUsableForEverydayTabs);
    const mcpConnected = chromeMcpStatus?.observed?.chromeDevtoolsMcpConnected === true;
    const mcpNewBackgroundTabReady = Boolean(allowNewBackgroundTab && mcpConnected);
    const ready = Boolean(chromePlan.chrome.regularExtensionReady);
    const prepared = Boolean(chromePlan.chrome.regularExtensionPrepared);
    const openCommand = chromeHandoff.commands?.find((item) => item.id === 'open-selected-profile-window');
    if (mcpNewBackgroundTabReady) {
      return {
        lane: 'regular-chrome-mcp-new-background-tab',
        backend: 'chrome-devtools-mcp',
        profileMode: 'everyday-chrome-new-background-tab',
        userPermissionRequired: false,
        operatorInput: false,
        canRunInBackground: true,
        startsCapture: false,
        captureBlocked: false,
        commandOpensBrowser: false,
        approvalCommandOpensBrowser: false,
        commandRunOnlyAfterUserSays: '',
        command: command([
          'node',
          'src/cli.mjs',
          'regular-chrome-use',
          '--intent',
          'inspect',
          '--chrome-mcp-connected',
          'yes',
          '--chrome-mcp-tools',
          String(chromeMcpStatus.observed?.chromeDevtoolsMcpTools ?? 0),
          '--chrome-mcp-page-list-ok',
          mcpReady ? 'yes' : 'no',
          '--chrome-mcp-page-count',
          String(chromeMcpStatus.observed?.chromeDevtoolsMcpPageCount ?? 0),
          ...(chromeMcpStatus.observed?.chromeDevtoolsMcpLastError ? ['--chrome-mcp-last-error', chromeMcpStatus.observed.chromeDevtoolsMcpLastError] : []),
          '--chrome-mcp-source',
          chromeMcpStatus.observedSource || 'external-mcp-status',
          '--allow-new-background-tab',
          'yes',
          ...(newBackgroundUrlEnv ? ['--new-background-url-env', newBackgroundUrlEnv] : []),
          '--format',
          'compact'
        ]),
        approvalCommand: null,
        reason: 'Everyday Chrome MCP is connected and the operator opted into a fresh background tab, so agents can use a new_page template without listing or selecting existing tabs. Stored authenticated scraping still uses dedicated target profiles.'
      };
    }
    if (mcpReady) {
      return {
        lane: 'regular-chrome-mcp',
        backend: 'chrome-devtools-mcp',
        profileMode: 'everyday-chrome-live-tabs',
        userPermissionRequired: false,
        operatorInput: false,
        canRunInBackground: true,
        startsCapture: false,
        captureBlocked: false,
        commandOpensBrowser: false,
        approvalCommandOpensBrowser: false,
        commandRunOnlyAfterUserSays: '',
        command: command([
          'node',
          'src/cli.mjs',
          'chrome-mcp-status',
          '--observed-connected',
          'yes',
          '--observed-tools',
          String(chromeMcpStatus.observed?.chromeDevtoolsMcpTools ?? 0),
          '--observed-page-list-ok',
          'yes',
          '--observed-page-count',
          String(chromeMcpStatus.observed?.chromeDevtoolsMcpPageCount ?? 0),
          '--observed-source',
          chromeMcpStatus.observedSource || 'external-mcp-status',
          '--format',
          'compact'
        ]),
        approvalCommand: null,
        reason: 'Everyday Chrome has an observed live Chrome DevTools MCP backend, so operator-requested existing-tab work can use the MCP lane. Stored authenticated scraping still uses dedicated target profiles.'
      };
    }
    return {
      lane: ready ? 'regular-chrome-extension' : 'regular-chrome-extension-handoff',
      backend: 'codex-chrome-extension',
      profileMode: 'everyday-chrome-selected-profile',
      userPermissionRequired: !ready && Boolean(chromeHandoff.needsUserPermission),
      operatorInput: !ready,
      canRunInBackground: ready,
      startsCapture: false,
      captureBlocked: false,
      commandOpensBrowser: false,
      approvalCommandOpensBrowser: !ready && Boolean(openCommand?.opensBrowser ?? openCommand),
      commandRunOnlyAfterUserSays: !ready ? (openCommand?.runOnlyAfterUserSays || 'OK') : '',
      command: ready
        ? command(['node', 'src/cli.mjs', 'chrome-extension-status', '--format', 'compact'])
        : chromeResumePlanCommand(),
      approvalCommand: !ready && openCommand ? chromeResumeApprovalCommand() : null,
      reason: ready
        ? 'Everyday Chrome is reachable through the Codex Chrome Extension; use it for operator-requested existing-tab work.'
        : prepared
          ? 'Everyday Chrome is prepared but the extension backend is not proved in this session; run the gated resume plan and require OK before opening the selected profile window.'
          : 'Everyday Chrome is not prepared for extension control; inspect chrome-extension-handoff before using it.'
    };
  }

  if (task === 'authenticated-scrape' || task === 'scrape' || task === 'operate') {
    return targetProfileRoute({ task, proofGate });
  }

  if (task === 'search') {
    return {
      lane: 'public-search-direct-cdp',
      backend: 'direct-cdp-chrome',
      profileMode: 'public-profile',
      userPermissionRequired: false,
      operatorInput: false,
      canRunInBackground: true,
      startsCapture: false,
      captureBlocked: false,
      commandOpensBrowser: false,
      approvalCommandOpensBrowser: false,
      commandRunOnlyAfterUserSays: '',
      command: command(['node', 'src/cli.mjs', 'agent-workflow', '--task', 'search', '--query', '<query>', '--format', 'compact']),
      approvalCommand: null,
      reason: 'Search is a public low-token workflow by default. Pass an explicit target pack through agent-workflow when searching inside an authenticated site.'
    };
  }

  if (task === 'analyze') {
    return {
      lane: 'direct-cdp-page-analysis',
      backend: 'direct-cdp-chrome',
      profileMode: 'public-or-dedicated-target-profile',
      userPermissionRequired: false,
      operatorInput: false,
      canRunInBackground: true,
      startsCapture: false,
      captureBlocked: false,
      commandOpensBrowser: false,
      approvalCommandOpensBrowser: false,
      commandRunOnlyAfterUserSays: '',
      command: command(['node', 'src/cli.mjs', 'analyze-cdp', '<url>', '--profile', 'public']),
      approvalCommand: null,
      reason: 'Page structure analysis uses direct CDP snapshots/inspect flows. Authenticated analysis should pass a target pack through agent-workflow, preserving the dedicated-profile boundary.'
    };
  }

  if (task === 'public-crawl') {
    const lightpandaReady = Boolean(lightpanda.readyForPublicBenchmark);
    if (lightpandaGate.accepted && lightpandaReady) {
      return {
        lane: 'lightpanda-public-gated',
        backend: 'lightpanda',
        profileMode: 'public-ephemeral-profile',
        userPermissionRequired: false,
        operatorInput: false,
        canRunInBackground: true,
        startsCapture: false,
        captureBlocked: false,
        commandOpensBrowser: false,
        approvalCommandOpensBrowser: false,
        commandRunOnlyAfterUserSays: '',
        command: command(['node', 'src/cli.mjs', 'extract', '<public-url>', '--selector', 'body', '--engine', 'lightpanda', '--profile', 'public']),
        approvalCommand: null,
        reason: 'Lightpanda has an accepted public benchmark/decision proof, so public crawl work can use the Lightpanda lane. Authenticated profiles still stay Chrome-only.'
      };
    }
    return {
      lane: lightpandaReady ? 'lightpanda-public-benchmark-candidate' : 'direct-cdp-public',
      backend: lightpandaReady ? 'lightpanda-candidate' : 'direct-cdp-chrome',
      profileMode: 'public-or-ephemeral-profile',
      userPermissionRequired: false,
      operatorInput: false,
      canRunInBackground: true,
      startsCapture: false,
      captureBlocked: false,
      commandOpensBrowser: false,
      approvalCommandOpensBrowser: false,
      commandRunOnlyAfterUserSays: '',
      command: lightpandaReady
        ? command(['node', 'src/cli.mjs', 'benchmark', '--url', 'https://example.com', '--iterations', '1', '--write', '--out', 'provider-benchmarks/lightpanda-public.json', '--format', 'json'])
        : command(['node', 'src/cli.mjs', 'benchmark', '--quick', '--iterations', '1', '--format', 'markdown']),
      approvalCommand: null,
      reason: lightpandaReady
        ? 'Lightpanda is runnable enough to benchmark as a public-page accelerator before adoption.'
        : 'Lightpanda is not benchmark-ready here, so direct CDP Chrome remains the public crawl default.'
    };
  }

  const seleniumReady = Boolean(selenium.readyForLocalSmoke);
  return {
    lane: seleniumReady ? 'selenium-compatibility-bridge' : 'direct-cdp-with-selenium-plan',
    backend: seleniumReady ? 'selenium-webdriver' : 'direct-cdp-chrome',
    profileMode: 'test-profile',
    userPermissionRequired: false,
    operatorInput: false,
    canRunInBackground: true,
    startsCapture: false,
    captureBlocked: false,
    commandOpensBrowser: false,
    approvalCommandOpensBrowser: false,
    commandRunOnlyAfterUserSays: '',
    command: command(['node', 'src/cli.mjs', 'selenium-doctor', '--format', 'markdown']),
    approvalCommand: null,
    reason: seleniumReady
      ? 'Selenium is ready as a compatibility bridge for WebDriver/Grid estates, not as the authenticated default.'
      : 'Selenium is not locally smoke-ready, so keep it as an optional compatibility plan.'
  };
}

export async function buildBrowserRoute(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const requestedTask = normalizeTask(options.task);
  let proofGate = options.proofGateStatus || null;
  let task = requestedTask;
  if (requestedTask === 'auto') {
    proofGate ||= await buildProofGateStatus({ ...options, rootDir, generatedAt });
    task = selectedTask(options.task, proofGate);
  } else if (['authenticated-scrape', 'scrape', 'operate'].includes(requestedTask) && !proofGate) {
    proofGate = await buildProofGateStatus({ ...options, rootDir, generatedAt });
  }
  proofGate ||= {};
  const needsEverydayChrome = task === 'existing-tab';
  const chromeMcpStatus = options.chromeMcpStatus || (needsEverydayChrome ? (lightweightChromeMcpStatusFromOptions(options) || buildChromeMcpStatus({
    ...options,
    rootDir,
    generatedAt,
    observedConnected: options.chromeMcpConnected,
    observedTools: options.chromeMcpTools,
    observedPageListOk: options.chromeMcpPageListOk,
    observedPageCount: options.chromeMcpPageCount,
    observedLastError: options.chromeMcpLastError,
    observedSource: options.chromeMcpSource || ''
  })) : null);
  const mcpReady = Boolean(chromeMcpStatus?.decision?.chromeDevtoolsMcpUsableForEverydayTabs);
  const allowNewBackgroundTab = parseObservedFlag(options.allowNewBackgroundTab ?? options['allow-new-background-tab']) === true;
  const newBackgroundUrlEnv = String(options.newBackgroundUrlEnv ?? options['new-background-url-env'] ?? '').trim();
  const mcpNewBackgroundTabReady = Boolean(
    allowNewBackgroundTab
    && chromeMcpStatus?.observed?.chromeDevtoolsMcpConnected === true
    && !mcpReady
  );
  const observedExtensionStatus = lightweightChromeExtensionStatusFromOptions(options);
  const chromePlan = options.chromeControlPlan || (needsEverydayChrome && !mcpReady && !mcpNewBackgroundTabReady
    ? observedExtensionStatus
      ? {
          recommendedLane: observedExtensionStatus.decision.everydayChromeViaCodexExtensionReady ? 'regular-chrome' : 'regular-chrome-handoff',
          chrome: {
            regularExtensionPrepared: observedExtensionStatus.decision.everydayChromeViaCodexExtensionPrepared,
            regularExtensionReady: observedExtensionStatus.decision.everydayChromeViaCodexExtensionReady
          },
          chromeExtensionStatus: observedExtensionStatus
        }
      : buildChromeControlPlan({
        ...options,
        rootDir,
        generatedAt,
        lane: options.lane || 'auto'
      })
    : {
        recommendedLane: 'not-checked',
        chrome: {
          regularExtensionPrepared: false,
        regularExtensionReady: false
      },
      chromeExtensionStatus: null
    });
  const chromeHandoff = options.chromeExtensionHandoff || (needsEverydayChrome && !mcpReady && !mcpNewBackgroundTabReady ? buildChromeExtensionHandoff({
    ...options,
    rootDir,
    generatedAt,
    chromeExtensionStatus: chromePlan.chromeExtensionStatus
  }) : { commands: [] });
  const lightpanda = options.lightpandaDoctor || (task === 'public-crawl'
    ? buildLightpandaDoctor({ ...options, rootDir, generatedAt })
    : { readyForPublicBenchmark: false });
  const lightpandaGate = options.lightpandaGate || (task === 'public-crawl'
    ? buildLightpandaGate(rootDir, { generatedAt })
    : { accepted: false, status: 'not-checked' });
  const selenium = options.seleniumDoctor || (task === 'compatibility-test'
    ? buildSeleniumDoctor({ ...options, rootDir, generatedAt })
    : { readyForLocalSmoke: false });
  const route = routeForTask({ task, chromePlan, chromeMcpStatus, chromeHandoff, lightpanda, lightpandaGate, selenium, proofGate, allowNewBackgroundTab, newBackgroundUrlEnv });

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    requestedTask: options.task || 'auto',
    task,
    selectedLane: route.lane,
    backend: route.backend,
    profileMode: route.profileMode,
    userPermissionRequired: route.userPermissionRequired,
    operatorInput: route.operatorInput,
    canRunInBackground: route.canRunInBackground,
    startsCapture: route.startsCapture,
    captureBlocked: route.captureBlocked,
    commandOpensBrowser: route.commandOpensBrowser,
    approvalCommandOpensBrowser: route.approvalCommandOpensBrowser,
    commandRunOnlyAfterUserSays: route.commandRunOnlyAfterUserSays,
    reason: route.reason,
    security: {
      everydayChromeCdpAllowed: false,
      dedicatedTargetProfileForStoredAuth: true,
      cookieValuesRead: false,
      browserStorageRead: false
    },
    evidence: {
      allowNewBackgroundTab,
      newBackgroundUrlEnv,
      newBackgroundUrlValueRead: false,
      proofGateStatus: proofGate.status || '',
      proofGateComplete: Boolean(proofGate.complete),
      proofGateTarget: proofGate.target || '',
      proofGateAuthCheckOk: Boolean(proofGate.authCheckOk),
      proofGateLoginLike: Boolean(proofGate.loginLike),
      chromeRecommendedLane: chromePlan.recommendedLane || '',
      chromeMcpStatus: chromeMcpStatus?.decision?.status || 'not-checked',
      chromeMcpUsableForEverydayTabs: Boolean(chromeMcpStatus?.decision?.chromeDevtoolsMcpUsableForEverydayTabs),
      chromeMcpObservedConnected: chromeMcpStatus?.observed?.chromeDevtoolsMcpConnected,
      chromeMcpObservedTools: chromeMcpStatus?.observed?.chromeDevtoolsMcpTools ?? null,
      chromeMcpObservedPageListOk: chromeMcpStatus?.observed?.chromeDevtoolsMcpPageListOk ?? null,
      chromeMcpObservedPageCount: chromeMcpStatus?.observed?.chromeDevtoolsMcpPageCount ?? null,
      chromeMcpListPagesTimedOut: Boolean(chromeMcpStatus?.observed?.chromeDevtoolsMcpListPagesTimedOut),
      chromeMcpLastError: chromeMcpStatus?.observed?.chromeDevtoolsMcpLastError || '',
      regularChromeExtensionPrepared: Boolean(chromePlan.chrome?.regularExtensionPrepared),
      regularChromeExtensionReady: Boolean(chromePlan.chrome?.regularExtensionReady),
      regularChromeUserPermissionRequired: Boolean(chromeHandoff?.needsUserPermission),
      lightpandaGateStatus: lightpandaGate.status || 'not-checked',
      lightpandaGateAccepted: Boolean(lightpandaGate.accepted),
      lightpandaGateProof: lightpandaGate.proofRelativePath || '',
      lightpandaReadyForPublicBenchmark: Boolean(lightpanda.readyForPublicBenchmark),
      seleniumReadyForLocalSmoke: Boolean(selenium.readyForLocalSmoke)
    },
    commands: {
      route: route.command,
      approval: route.approvalCommand,
      status: command(['node', 'src/cli.mjs', 'browser-route', '--task', task, '--format', 'compact']),
      chromeMcpStatus: command(['node', 'src/cli.mjs', 'chrome-mcp-status', '--format', 'compact']),
      chromeHandoff: command(['node', 'src/cli.mjs', 'chrome-extension-handoff', '--format', 'compact']),
      proofGateStatus: command(['node', 'src/cli.mjs', 'proof-gate-status', '--format', 'compact']),
      lightpandaDoctor: command(['node', 'src/cli.mjs', 'lightpanda-doctor', '--format', 'markdown']),
      seleniumDoctor: command(['node', 'src/cli.mjs', 'selenium-doctor', '--format', 'markdown'])
    }
  };
}

export function formatBrowserRouteCompact(route) {
  const lines = [
    `safe_mode: ${yesNo(route.safeMode)}`,
    `destructive_actions: ${yesNo(route.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(route.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(route.opensBrowserNow)}`,
    `requested_task: ${clean(route.requestedTask)}`,
    `task: ${clean(route.task)}`,
    `selected_lane: ${clean(route.selectedLane)}`,
    `backend: ${clean(route.backend)}`,
    `profile_mode: ${clean(route.profileMode)}`,
    `operator_input: ${yesNo(route.operatorInput)}`,
    `user_permission_required: ${yesNo(route.userPermissionRequired)}`,
    `can_run_in_background: ${yesNo(route.canRunInBackground)}`,
    `starts_capture: ${yesNo(route.startsCapture)}`,
    `capture_blocked: ${yesNo(route.captureBlocked)}`,
    `command_opens_browser: ${yesNo(route.commandOpensBrowser)}`,
    `approval_command_opens_browser: ${yesNo(route.approvalCommandOpensBrowser)}`,
    `command_run_only_after_user_says: ${clean(route.commandRunOnlyAfterUserSays)}`,
    `everyday_chrome_cdp_allowed: ${yesNo(route.security.everydayChromeCdpAllowed)}`,
    `dedicated_target_profile_for_stored_auth: ${yesNo(route.security.dedicatedTargetProfileForStoredAuth)}`,
    `allow_new_background_tab: ${yesNo(route.evidence.allowNewBackgroundTab)}`,
    `new_background_url_env: ${clean(route.evidence.newBackgroundUrlEnv)}`,
    `new_background_url_value_read: ${yesNo(route.evidence.newBackgroundUrlValueRead)}`,
    `proof_gate_status: ${clean(route.evidence.proofGateStatus)}`,
    `proof_gate_complete: ${yesNo(route.evidence.proofGateComplete)}`,
    `proof_gate_target: ${clean(route.evidence.proofGateTarget)}`,
    `proof_gate_auth_check_ok: ${yesNo(route.evidence.proofGateAuthCheckOk)}`,
    `proof_gate_login_like: ${yesNo(route.evidence.proofGateLoginLike)}`,
    `chrome_recommended_lane: ${clean(route.evidence.chromeRecommendedLane)}`,
    `chrome_mcp_status: ${clean(route.evidence.chromeMcpStatus)}`,
    `chrome_mcp_usable_for_everyday_tabs: ${yesNo(route.evidence.chromeMcpUsableForEverydayTabs)}`,
    `chrome_mcp_observed_connected: ${yesNoUnknown(route.evidence.chromeMcpObservedConnected)}`,
    `chrome_mcp_observed_tools: ${route.evidence.chromeMcpObservedTools ?? 'unknown'}`,
    `chrome_mcp_observed_page_list_ok: ${yesNoUnknown(route.evidence.chromeMcpObservedPageListOk)}`,
    `chrome_mcp_observed_page_count: ${route.evidence.chromeMcpObservedPageCount ?? 'unknown'}`,
    `chrome_mcp_list_pages_timed_out: ${yesNo(route.evidence.chromeMcpListPagesTimedOut)}`,
    `regular_chrome_extension_prepared: ${yesNo(route.evidence.regularChromeExtensionPrepared)}`,
    `regular_chrome_extension_ready: ${yesNo(route.evidence.regularChromeExtensionReady)}`,
    `regular_chrome_user_permission_required: ${yesNo(route.evidence.regularChromeUserPermissionRequired)}`,
    `lightpanda_gate_status: ${clean(route.evidence.lightpandaGateStatus)}`,
    `lightpanda_gate_accepted: ${yesNo(route.evidence.lightpandaGateAccepted)}`,
    `lightpanda_gate_proof: ${clean(route.evidence.lightpandaGateProof)}`,
    `lightpanda_public_benchmark_ready: ${yesNo(route.evidence.lightpandaReadyForPublicBenchmark)}`,
    `selenium_local_smoke_ready: ${yesNo(route.evidence.seleniumReadyForLocalSmoke)}`
  ];
  if (route.commands.route?.shell) lines.push(`command: ${route.commands.route.shell}`);
  if (route.commands.approval?.shell) lines.push(`approval_command: ${route.commands.approval.shell}`);
  if (route.evidence.chromeMcpLastError) lines.push(`chrome_mcp_last_error: ${clean(route.evidence.chromeMcpLastError)}`);
  return `${lines.join('\n')}\n`;
}

export function formatBrowserRouteMarkdown(route) {
  const lines = [
    '# Secure Browser Agent Browser Route',
    '',
    `Generated: ${route.generatedAt}`,
    `Safe mode: ${route.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${route.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${route.secretValuesRead ? 'yes' : 'no'}`,
    `Opens browser now: ${route.opensBrowserNow ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Requested task: ${route.requestedTask}`,
    `- Task: ${route.task}`,
    `- Selected lane: ${route.selectedLane}`,
    `- Backend: ${route.backend}`,
    `- Profile mode: ${route.profileMode}`,
    `- Operator input: ${route.operatorInput ? 'yes' : 'no'}`,
    `- User permission required: ${route.userPermissionRequired ? 'yes' : 'no'}`,
    `- Can run in background: ${route.canRunInBackground ? 'yes' : 'no'}`,
    `- Capture blocked: ${route.captureBlocked ? 'yes' : 'no'}`,
    `- Command opens browser: ${route.commandOpensBrowser ? 'yes' : 'no'}`,
    `- Approval command opens browser: ${route.approvalCommandOpensBrowser ? 'yes' : 'no'}`,
    `- Command run only after user says: ${route.commandRunOnlyAfterUserSays || 'none'}`,
    `- Reason: ${route.reason}`,
    '',
    '## Security',
    '',
    `- Everyday Chrome CDP allowed: ${route.security.everydayChromeCdpAllowed ? 'yes' : 'no'}`,
    `- Dedicated target profile for stored auth: ${route.security.dedicatedTargetProfileForStoredAuth ? 'yes' : 'no'}`,
    `- Cookie values read: ${route.security.cookieValuesRead ? 'yes' : 'no'}`,
    `- Browser storage read: ${route.security.browserStorageRead ? 'yes' : 'no'}`,
    '',
    '## Evidence',
    '',
    `- Proof gate status: ${route.evidence.proofGateStatus || 'none'}`,
    `- Proof gate target: ${route.evidence.proofGateTarget || 'none'}`,
    `- Chrome recommended lane: ${route.evidence.chromeRecommendedLane || 'none'}`,
    `- Chrome MCP status: ${route.evidence.chromeMcpStatus || 'none'}`,
    `- Chrome MCP usable for everyday tabs: ${route.evidence.chromeMcpUsableForEverydayTabs ? 'yes' : 'no'}`,
    `- Chrome MCP observed connected: ${yesNoUnknown(route.evidence.chromeMcpObservedConnected)}`,
    `- Chrome MCP observed tools: ${route.evidence.chromeMcpObservedTools ?? 'unknown'}`,
    `- Regular Chrome extension prepared: ${route.evidence.regularChromeExtensionPrepared ? 'yes' : 'no'}`,
    `- Regular Chrome extension ready: ${route.evidence.regularChromeExtensionReady ? 'yes' : 'no'}`,
    `- Lightpanda gate status: ${route.evidence.lightpandaGateStatus || 'not-checked'}`,
    `- Lightpanda gate accepted: ${route.evidence.lightpandaGateAccepted ? 'yes' : 'no'}`,
    `- Lightpanda public benchmark ready: ${route.evidence.lightpandaReadyForPublicBenchmark ? 'yes' : 'no'}`,
    `- Selenium local smoke ready: ${route.evidence.seleniumReadyForLocalSmoke ? 'yes' : 'no'}`,
    '',
    '## Command',
    '',
    '```bash',
    route.commands.route?.shell || '',
    '```',
    ''
  ];
  if (route.commands.approval?.shell) {
    lines.push('## Approval Command', '', '```bash', route.commands.approval.shell, '```', '');
  }
  return lines.join('\n');
}
