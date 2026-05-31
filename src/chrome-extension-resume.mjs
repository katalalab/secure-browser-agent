import { spawnSync } from 'node:child_process';
import { buildChromeExtensionHandoff } from './chrome-extension-handoff.mjs';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function summarizeOpenResult(result) {
  if (!result) return null;
  return {
    status: typeof result.status === 'number' ? result.status : null,
    signal: result.signal || '',
    error: result.error ? result.error.message : ''
  };
}

function decideAction({ handoff, requestedRun, operatorApproved, dryRun }) {
  if (handoff.ready) return 'already-ready';
  if (!requestedRun) return 'plan-requires-operator-ok';
  if (!operatorApproved) return 'refused-operator-ok-required';
  if (!handoff.canOpenSelectedProfileWindow) return 'cannot-open-selected-profile-window';
  if (dryRun) return 'dry-run-open-selected-profile-window';
  return 'open-selected-profile-window-and-refresh-status';
}

export function buildChromeExtensionResume(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const requestedRun = Boolean(options.run);
  const dryRun = Boolean(options.dryRun);
  const operatorOk = String(options.operatorOk || '');
  const operatorApproved = operatorOk === 'OK';
  const statusBefore = options.chromeExtensionStatus || buildChromeExtensionStatus(options);
  const handoff = options.chromeExtensionHandoff || buildChromeExtensionHandoff({
    ...options,
    rootDir,
    generatedAt,
    chromeExtensionStatus: statusBefore
  });
  const openCommand = handoff.commands?.find((item) => item.id === 'open-selected-profile-window')?.command || null;
  const canOpenSelectedProfileWindow = Boolean(handoff.canOpenSelectedProfileWindow && openCommand?.args?.length);
  const action = decideAction({
    handoff: { ...handoff, canOpenSelectedProfileWindow },
    requestedRun,
    operatorApproved,
    dryRun
  });
  const willOpenBrowser = action === 'open-selected-profile-window-and-refresh-status';

  let openResult = null;
  let statusAfter = statusBefore;
  if (willOpenBrowser) {
    openResult = spawnSync(openCommand.args[0], openCommand.args.slice(1), {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    statusAfter = buildChromeExtensionStatus(options);
  }

  const afterReady = Boolean(statusAfter?.decision?.everydayChromeViaCodexExtensionReady);
  return {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    requestedRun,
    dryRun,
    operatorOkRequired: true,
    operatorOkAcceptedValue: 'OK',
    operatorApproved,
    opensBrowserNow: willOpenBrowser,
    action,
    selectedProfile: handoff.selectedProfile || '',
    chromeRunningBefore: Boolean(handoff.chromeRunning),
    extensionPreparedBefore: Boolean(handoff.extensionPrepared),
    backendAvailableBefore: Boolean(handoff.backendAvailable),
    readyBefore: Boolean(handoff.ready),
    canOpenSelectedProfileWindow,
    commandRunOnlyAfterUserSays: 'OK',
    openCommand,
    openResult: summarizeOpenResult(openResult),
    chromeRunningAfter: Boolean(statusAfter?.chrome?.running),
    extensionPreparedAfter: Boolean(statusAfter?.decision?.everydayChromeViaCodexExtensionPrepared),
    backendAvailableAfter: Boolean(statusAfter?.decision?.everydayChromeViaCodexExtensionBackendAvailable),
    readyAfter: afterReady,
    nextAction: afterReady ? 'claim-or-open-everyday-chrome-tab' : 'retry-codex-chrome-extension-backend',
    statusBefore,
    statusAfter
  };
}

export function formatChromeExtensionResumeCompact(result) {
  const lines = [
    `safe_mode: ${yesNo(result.safeMode)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `run_requested: ${yesNo(result.requestedRun)}`,
    `dry_run: ${yesNo(result.dryRun)}`,
    `operator_ok_required: ${yesNo(result.operatorOkRequired)}`,
    `operator_approved: ${yesNo(result.operatorApproved)}`,
    `opens_browser_now: ${yesNo(result.opensBrowserNow)}`,
    `action: ${compact(result.action)}`,
    `selected_profile: ${compact(result.selectedProfile)}`,
    `chrome_running_before: ${yesNo(result.chromeRunningBefore)}`,
    `extension_prepared_before: ${yesNo(result.extensionPreparedBefore)}`,
    `backend_available_before: ${yesNo(result.backendAvailableBefore)}`,
    `ready_before: ${yesNo(result.readyBefore)}`,
    `can_open_selected_profile_window: ${yesNo(result.canOpenSelectedProfileWindow)}`,
    `command_run_only_after_user_says: ${compact(result.commandRunOnlyAfterUserSays)}`,
    `chrome_running_after: ${yesNo(result.chromeRunningAfter)}`,
    `extension_prepared_after: ${yesNo(result.extensionPreparedAfter)}`,
    `backend_available_after: ${yesNo(result.backendAvailableAfter)}`,
    `ready_after: ${yesNo(result.readyAfter)}`,
    `next_action: ${compact(result.nextAction)}`
  ];
  if (result.openCommand?.shell) lines.push(`open_command: ${result.openCommand.shell}`);
  if (result.openResult) lines.push(`open_exit_status: ${compact(result.openResult.status)}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeExtensionResumeMarkdown(result) {
  const lines = [
    '# Codex Chrome Extension Resume',
    '',
    `Generated: ${result.generatedAt}`,
    `Safe mode: ${result.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${result.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${result.secretValuesRead ? 'yes' : 'no'}`,
    `Run requested: ${result.requestedRun ? 'yes' : 'no'}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Operator approved: ${result.operatorApproved ? 'yes' : 'no'}`,
    `Opens browser now: ${result.opensBrowserNow ? 'yes' : 'no'}`,
    '',
    '## Decision',
    '',
    `- Action: ${result.action}`,
    `- Selected profile: ${result.selectedProfile || 'unknown'}`,
    `- Ready before: ${result.readyBefore ? 'yes' : 'no'}`,
    `- Ready after: ${result.readyAfter ? 'yes' : 'no'}`,
    `- Next action: ${result.nextAction}`,
    ''
  ];
  if (!result.operatorApproved && !result.readyBefore) {
    lines.push('## Required Approval', '', '普段使いChromeの選択プロファイルを開いて再試行する場合だけ、`--run --operator-ok OK` を付けて実行してください。', '');
  }
  if (result.openCommand?.shell) {
    lines.push('## Open Command', '', '```bash', result.openCommand.shell, '```', '');
  }
  return lines.join('\n');
}
