import fs from 'node:fs';
import path from 'node:path';
import { buildChromeExtensionStatus } from './chrome-extension-status.mjs';

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function compact(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
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

function safeRunPath(rootDir, outPath) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || 'operator/chrome-extension-handoff.json').replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid chrome extension handoff output path: ${outPath}`);
  return outputPath;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function openChromeWindowCommand(status) {
  const script = path.join(status.plugin?.dir || '', 'scripts', 'open-chrome-window.js');
  if (!status.plugin?.available || !fs.existsSync(script)) return null;
  return command(['node', script]);
}

function handoffAction(status) {
  if (!status.plugin?.available) return 'reinstall-or-enable-codex-chrome-plugin';
  if (!status.chrome?.installed) return 'install-google-chrome';
  if (!status.chrome?.running) return 'ask-user-to-launch-google-chrome';
  if (!status.extension?.installed || !status.extension?.enabled) return 'ask-user-to-enable-codex-chrome-extension';
  if (!status.nativeHost?.correct) return 'reinstall-codex-chrome-plugin';
  if (status.decision?.everydayChromeViaCodexExtensionReady) return 'claim-or-open-everyday-chrome-tab';
  return 'ask-user-ok-to-open-selected-profile-window-and-retry';
}

export function buildChromeExtensionHandoff(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const status = options.chromeExtensionStatus || buildChromeExtensionStatus(options);
  const openWindow = openChromeWindowCommand(status);
  const action = handoffAction(status);
  const needsUserPermission = [
    'ask-user-to-launch-google-chrome',
    'ask-user-to-enable-codex-chrome-extension',
    'ask-user-ok-to-open-selected-profile-window-and-retry'
  ].includes(action);
  const canOpenSelectedProfileWindow = Boolean(openWindow && action === 'ask-user-ok-to-open-selected-profile-window-and-retry');

  const commands = [
    {
      id: 'status',
      label: 'Refresh read-only everyday Chrome extension status',
      permissionRequired: false,
      opensBrowser: false,
      command: command(['node', 'src/cli.mjs', 'chrome-extension-status', '--format', 'compact'])
    }
  ];
  if (openWindow) {
    commands.push({
      id: 'open-selected-profile-window',
      label: 'Open an about:blank window for the selected everyday Chrome profile',
      permissionRequired: true,
      opensBrowser: true,
      runOnlyAfterUserSays: 'OK',
      command: openWindow
    });
  }

  const handoff = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    action,
    nextAction: status.nextAction,
    needsUserPermission,
    userPrompt: needsUserPermission
      ? '普段使いChromeの選択プロファイルでウィンドウを開いて接続を再試行してよければ「OK」と返してください。'
      : '',
    canOpenSelectedProfileWindow,
    selectedProfile: status.extension?.selectedProfileDirectory || '',
    chromeRunning: Boolean(status.chrome?.running),
    extensionPrepared: Boolean(status.decision?.everydayChromeViaCodexExtensionPrepared),
    backendAvailable: Boolean(status.decision?.everydayChromeViaCodexExtensionBackendAvailable),
    ready: Boolean(status.decision?.everydayChromeViaCodexExtensionReady),
    cdpAllowed: Boolean(status.decision?.everydayChromeViaCdpAllowed),
    dedicatedTargetProfileStillRequired: Boolean(status.decision?.dedicatedTargetProfileStillRequiredForStoredAuth),
    retryInstruction: status.decision?.everydayChromeViaCodexExtensionReady
      ? 'Everyday Chrome is already ready through the Codex Chrome Extension backend.'
      : 'After operator approval and opening the selected Chrome profile window, retry the Codex Chrome Extension backend once with browser.user.openTabs().',
    status,
    commands,
    outputPath: ''
  };

  if (options.write || options.out || options.output) {
    const outputPath = safeRunPath(rootDir, options.out || options.output);
    handoff.outputPath = outputPath;
    writeJson(outputPath, handoff);
  }

  return handoff;
}

export function formatChromeExtensionHandoffCompact(handoff) {
  const lines = [
    `safe_mode: ${yesNo(handoff.safeMode)}`,
    `destructive_actions: ${yesNo(handoff.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(handoff.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(handoff.opensBrowserNow)}`,
    `action: ${compact(handoff.action)}`,
    `next_action: ${compact(handoff.nextAction)}`,
    `selected_profile: ${compact(handoff.selectedProfile)}`,
    `chrome_running: ${yesNo(handoff.chromeRunning)}`,
    `extension_prepared: ${yesNo(handoff.extensionPrepared)}`,
    `backend_available: ${yesNo(handoff.backendAvailable)}`,
    `ready: ${yesNo(handoff.ready)}`,
    `cdp_allowed: ${yesNo(handoff.cdpAllowed)}`,
    `dedicated_target_profile_required: ${yesNo(handoff.dedicatedTargetProfileStillRequired)}`,
    `user_permission_required: ${yesNo(handoff.needsUserPermission)}`,
    `can_open_selected_profile_window: ${yesNo(handoff.canOpenSelectedProfileWindow)}`,
    `commands: ${handoff.commands?.length || 0}`
  ];
  if (handoff.outputPath) lines.push(`output: ${handoff.outputPath}`);
  const open = handoff.commands?.find((item) => item.id === 'open-selected-profile-window');
  if (open?.command?.shell) lines.push(`open_command: ${open.command.shell}`);
  const status = handoff.commands?.find((item) => item.id === 'status');
  if (status?.command?.shell) lines.push(`status_command: ${status.command.shell}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeExtensionHandoffMarkdown(handoff) {
  const lines = [
    '# Codex Chrome Extension Handoff',
    '',
    `Generated: ${handoff.generatedAt}`,
    `Safe mode: ${handoff.safeMode ? 'yes' : 'no'}`,
    `Destructive actions included: ${handoff.destructiveActionsIncluded ? 'yes' : 'no'}`,
    `Secret values read: ${handoff.secretValuesRead ? 'yes' : 'no'}`,
    `Opens browser now: ${handoff.opensBrowserNow ? 'yes' : 'no'}`,
    '',
    '## Status',
    '',
    `- Action: ${handoff.action}`,
    `- Next action: ${handoff.nextAction}`,
    `- Selected profile: ${handoff.selectedProfile || 'unknown'}`,
    `- Chrome running: ${handoff.chromeRunning ? 'yes' : 'no'}`,
    `- Extension prepared: ${handoff.extensionPrepared ? 'yes' : 'no'}`,
    `- Backend available: ${handoff.backendAvailable ? 'yes' : 'no'}`,
    `- Ready: ${handoff.ready ? 'yes' : 'no'}`,
    `- CDP allowed: ${handoff.cdpAllowed ? 'yes' : 'no'}`,
    `- Dedicated target profile required: ${handoff.dedicatedTargetProfileStillRequired ? 'yes' : 'no'}`,
    `- User permission required: ${handoff.needsUserPermission ? 'yes' : 'no'}`,
    ''
  ];
  if (handoff.userPrompt) {
    lines.push('## User Prompt', '', handoff.userPrompt, '');
  }
  lines.push('## Commands', '');
  for (const item of handoff.commands || []) {
    lines.push(`- ${item.id}: ${item.label}`);
    lines.push(`  - Permission required: ${item.permissionRequired ? 'yes' : 'no'}`);
    lines.push(`  - Opens browser: ${item.opensBrowser ? 'yes' : 'no'}`);
    if (item.runOnlyAfterUserSays) lines.push(`  - Run only after user says: ${item.runOnlyAfterUserSays}`);
    lines.push('```bash', item.command.shell, '```');
  }
  lines.push('', '## Retry', '', handoff.retryInstruction, '');
  return lines.join('\n');
}
