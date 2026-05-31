import { buildChromeExtensionHandoff } from './chrome-extension-handoff.mjs';
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

function backendProbe(options) {
  const available = boolFromFlag(options.backendAvailable ?? options.observedBackendAvailable);
  return {
    attemptedByCli: available !== null || Boolean(options.backendLastError || options.observedLastError),
    available,
    note: compact(options.backendLastError || options.observedLastError || options.backendNote || 'No live extension backend result was supplied.')
  };
}

function windowRetryAttempted(options) {
  return Boolean(boolFromFlag(
    options.profileWindowRetryAttempted
      ?? options.windowRetryAttempted
      ?? options.profileWindowOpened
      ?? options.selectedProfileWindowOpened
      ?? options.resumeAttempted
  ));
}

function nextAction(status, handoff, probe, retryAttempted) {
  if (status.decision?.everydayChromeViaCodexExtensionReady) return 'claim-or-open-everyday-chrome-tab';
  if (!status.plugin?.available) return 'reinstall-codex-chrome-plugin-from-ui';
  if (!status.chrome?.installed) return 'install-google-chrome';
  if (!status.chrome?.running) return 'ask-operator-to-launch-google-chrome';
  if (!status.extension?.installed || !status.extension?.enabled) return 'ask-operator-to-enable-codex-chrome-extension';
  if (!status.nativeHost?.correct) return 'reinstall-codex-chrome-plugin-from-ui';
  if (probe.available === false && retryAttempted && status.decision?.everydayChromeViaCodexExtensionPrepared) {
    return 'reinstall-codex-chrome-plugin-from-ui';
  }
  if (probe.available === false && handoff.canOpenSelectedProfileWindow) return 'open-selected-profile-window-after-operator-ok';
  if (status.decision?.everydayChromeViaCodexExtensionPrepared) return 'probe-codex-chrome-extension-backend';
  return 'repair-chrome-extension-prerequisites';
}

export function buildChromeExtensionTroubleshoot(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const rootDir = options.rootDir || process.cwd();
  const probe = backendProbe(options);
  const status = options.chromeExtensionStatus || buildChromeExtensionStatus({
    ...options,
    backendProbe: probe
  });
  const handoff = options.chromeExtensionHandoff || buildChromeExtensionHandoff({
    ...options,
    rootDir,
    generatedAt,
    chromeExtensionStatus: status
  });
  const retryAttempted = windowRetryAttempted(options);
  const backendFailureAfterWindowRetry = Boolean(
    probe.available === false
      && retryAttempted
      && status.decision?.everydayChromeViaCodexExtensionPrepared
  );
  const action = nextAction(status, handoff, probe, retryAttempted);
  const commands = {
    status: command(['node', 'src/cli.mjs', 'chrome-extension-status', '--format', 'compact']),
    handoff: command(['node', 'src/cli.mjs', 'chrome-extension-handoff', '--format', 'compact']),
    resumePlan: command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--format', 'compact']),
    resumeApproval: command(['node', 'src/cli.mjs', 'chrome-extension-resume', '--run', '--operator-ok', 'OK', '--format', 'compact'])
  };

  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    pageOutputTrusted: false,
    observedBackendAvailable: probe.available,
    observedBackendLastError: probe.note,
    profileWindowRetryAttempted: retryAttempted,
    backendFailureAfterProfileWindowRetry: backendFailureAfterWindowRetry,
    chromeRunning: Boolean(status.chrome?.running),
    selectedProfile: status.extension?.selectedProfileDirectory || '',
    extensionInstalled: Boolean(status.extension?.installed),
    extensionEnabled: Boolean(status.extension?.enabled),
    nativeHostCorrect: Boolean(status.nativeHost?.correct),
    extensionPrepared: Boolean(status.decision?.everydayChromeViaCodexExtensionPrepared),
    backendAvailable: Boolean(status.decision?.everydayChromeViaCodexExtensionBackendAvailable),
    ready: Boolean(status.decision?.everydayChromeViaCodexExtensionReady),
    cdpAllowed: Boolean(status.decision?.everydayChromeViaCdpAllowed),
    dedicatedTargetProfileRequired: Boolean(status.decision?.dedicatedTargetProfileStillRequiredForStoredAuth),
    canOpenSelectedProfileWindow: Boolean(handoff.canOpenSelectedProfileWindow),
    userPermissionRequired: Boolean(handoff.needsUserPermission || action === 'open-selected-profile-window-after-operator-ok'),
    commandRunOnlyAfterUserSays: 'OK',
    extensionReinstallRecommended: action === 'reinstall-codex-chrome-plugin-from-ui',
    nextAction: action,
    status,
    handoff,
    commands
  };
}

export function formatChromeExtensionTroubleshootCompact(result) {
  const lines = [
    `safe_mode: ${yesNo(result.safeMode)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(result.opensBrowserNow)}`,
    `page_output_trusted: ${yesNo(result.pageOutputTrusted)}`,
    `chrome_running: ${yesNo(result.chromeRunning)}`,
    `selected_profile: ${compact(result.selectedProfile)}`,
    `extension_installed: ${yesNo(result.extensionInstalled)}`,
    `extension_enabled: ${yesNo(result.extensionEnabled)}`,
    `native_host_correct: ${yesNo(result.nativeHostCorrect)}`,
    `extension_prepared: ${yesNo(result.extensionPrepared)}`,
    `backend_observed_available: ${result.observedBackendAvailable === null ? 'unknown' : yesNo(result.observedBackendAvailable)}`,
    `backend_available: ${yesNo(result.backendAvailable)}`,
    `profile_window_retry_attempted: ${yesNo(result.profileWindowRetryAttempted)}`,
    `backend_failure_after_profile_window_retry: ${yesNo(result.backendFailureAfterProfileWindowRetry)}`,
    `ready: ${yesNo(result.ready)}`,
    `cdp_allowed: ${yesNo(result.cdpAllowed)}`,
    `dedicated_target_profile_required: ${yesNo(result.dedicatedTargetProfileRequired)}`,
    `can_open_selected_profile_window: ${yesNo(result.canOpenSelectedProfileWindow)}`,
    `user_permission_required: ${yesNo(result.userPermissionRequired)}`,
    `command_run_only_after_user_says: ${compact(result.commandRunOnlyAfterUserSays)}`,
    `extension_reinstall_recommended: ${yesNo(result.extensionReinstallRecommended)}`,
    `next_action: ${compact(result.nextAction)}`,
    `status_command: ${result.commands.status.shell}`,
    `handoff_command: ${result.commands.handoff.shell}`,
    `resume_plan_command: ${result.commands.resumePlan.shell}`,
    `resume_approval_command: ${result.commands.resumeApproval.shell}`
  ];
  if (result.observedBackendLastError && result.observedBackendLastError !== 'No live extension backend result was supplied.') {
    lines.push(`backend_last_error: ${compact(result.observedBackendLastError)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function formatChromeExtensionTroubleshootMarkdown(result) {
  const lines = [
    '# Codex Chrome Extension Troubleshoot',
    '',
    `Generated: ${result.generatedAt}`,
    `Safe mode: ${result.safeMode ? 'yes' : 'no'}`,
    `Opens browser now: ${result.opensBrowserNow ? 'yes' : 'no'}`,
    `Secret values read: ${result.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Next action: ${result.nextAction}`,
    `- Selected profile: ${result.selectedProfile || 'unknown'}`,
    `- Extension prepared: ${result.extensionPrepared ? 'yes' : 'no'}`,
    `- Backend observed available: ${result.observedBackendAvailable === null ? 'unknown' : yesNo(result.observedBackendAvailable)}`,
    `- Profile window retry attempted: ${result.profileWindowRetryAttempted ? 'yes' : 'no'}`,
    `- Backend failure after profile window retry: ${result.backendFailureAfterProfileWindowRetry ? 'yes' : 'no'}`,
    `- Ready: ${result.ready ? 'yes' : 'no'}`,
    `- CDP allowed: ${result.cdpAllowed ? 'yes' : 'no'}`,
    `- Dedicated target profile required: ${result.dedicatedTargetProfileRequired ? 'yes' : 'no'}`,
    `- User permission required: ${result.userPermissionRequired ? 'yes' : 'no'}`,
    `- Extension reinstall recommended: ${result.extensionReinstallRecommended ? 'yes' : 'no'}`,
    '',
    '## Commands',
    '',
    '```bash',
    result.commands.resumePlan.shell,
    result.commands.resumeApproval.shell,
    '```',
    ''
  ];
  if (result.observedBackendLastError) {
    lines.push('## Last Backend Error', '', result.observedBackendLastError, '');
  }
  return lines.join('\n');
}
