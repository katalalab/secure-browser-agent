import fs from 'node:fs';
import path from 'node:path';
import { buildChromeAppleEventsStatus } from './chrome-apple-events-status.mjs';

const OFFICIAL_HELP_URL = 'https://support.google.com/chrome/?p=applescript';

function clean(value, fallback = 'none') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function command(args) {
  return {
    args,
    shell: args.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(' ')
  };
}

function safeRunPath(rootDir, outPath, fallback) {
  const runsRoot = path.resolve(rootDir, 'runs');
  const relative = String(outPath || fallback).replace(/^[/\\]+/, '');
  const outputPath = path.resolve(runsRoot, relative);
  const insideRuns = outputPath === runsRoot || outputPath.startsWith(`${runsRoot}${path.sep}`);
  if (!insideRuns) throw new Error(`invalid Chrome Apple Events enable plan output path: ${outPath}`);
  return outputPath;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function maybeWrite(value, options, fallback) {
  if (!options.write && !options.out && !options.output) return value;
  const outputPath = safeRunPath(options.rootDir || process.cwd(), options.out || options.output, fallback);
  const written = { ...value, outputPath };
  writeJson(outputPath, written);
  return written;
}

export function buildChromeAppleEventsEnablePlan(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const status = options.status || buildChromeAppleEventsStatus({
    ...options,
    rootDir,
    generatedAt,
    write: false,
    out: undefined,
    output: undefined
  });
  const javascriptAllowed = Boolean(status.javascript?.allowed);
  const activeTabObserved = Boolean(status.activeTab?.observed);
  const plan = {
    schemaVersion: 1,
    generatedAt,
    rootDir,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    changesChromeSettingsNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    backend: 'chrome-apple-events',
    officialHelpUrl: OFFICIAL_HELP_URL,
    current: {
      chromeReachable: Boolean(status.chrome?.reachable),
      activeTabObserved,
      javascriptAllowed,
      javascriptError: status.javascript?.error || '',
      activeTabUrlRedacted: status.activeTab?.urlRedacted || '',
      fullUrlReturned: Boolean(status.activeTab?.fullUrlReturned),
      titleTextReturned: false
    },
    readyForOutline: javascriptAllowed,
    userActionRequired: !javascriptAllowed,
    operatorSteps: javascriptAllowed
      ? []
      : [
          'In Google Chrome, open View > Developer.',
          'Enable Allow JavaScript from Apple Events.',
          'Re-run chrome-apple-events-status before running the outline probe.'
        ],
    statusCommand: command(['node', 'src/cli.mjs', 'chrome-apple-events-status', '--format', 'compact']),
    outlinePlanCommand: command(['node', 'src/cli.mjs', 'chrome-apple-events-outline', '--format', 'compact']),
    outlineApprovalCommand: command(['node', 'src/cli.mjs', 'chrome-apple-events-outline', '--run', '--operator-ok', 'OK', '--format', 'compact']),
    regularChromeUseCommand: command(['node', 'src/cli.mjs', 'regular-chrome-use', '--intent', 'inspect', '--apple-events-active-tab-observed', activeTabObserved ? 'yes' : 'no', '--apple-events-javascript-allowed', javascriptAllowed ? 'yes' : 'no', '--format', 'compact']),
    nextAction: javascriptAllowed
      ? 'run-gated-apple-events-outline-if-operator-approves'
      : 'enable-javascript-from-apple-events-if-operator-approves',
    notes: [
      'This plan does not change Chrome settings, open Chrome, read cookies, read localStorage, or return page text.',
      'Apple Events outline is for operator-requested existing-tab structure diagnostics only.',
      'Stored authenticated scraping remains on dedicated target profiles.'
    ],
    status
  };
  return maybeWrite(plan, options, 'operator/chrome-apple-events-enable-plan-latest.json');
}

export function formatChromeAppleEventsEnablePlanCompact(plan) {
  const lines = [
    `safe_mode: ${yesNo(plan.safeMode)}`,
    `destructive_actions: ${yesNo(plan.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(plan.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(plan.opensBrowserNow)}`,
    `changes_chrome_settings_now: ${yesNo(plan.changesChromeSettingsNow)}`,
    `reads_browser_storage: ${yesNo(plan.readsBrowserStorage)}`,
    `page_content_returned: ${yesNo(plan.pageContentReturned)}`,
    `backend: ${plan.backend}`,
    `official_help_url: ${plan.officialHelpUrl}`,
    `chrome_reachable: ${yesNo(plan.current.chromeReachable)}`,
    `active_tab_observed: ${yesNo(plan.current.activeTabObserved)}`,
    `active_tab_url_redacted: ${clean(plan.current.activeTabUrlRedacted)}`,
    `full_url_returned: ${yesNo(plan.current.fullUrlReturned)}`,
    `title_text_returned: ${yesNo(plan.current.titleTextReturned)}`,
    `javascript_from_apple_events_allowed: ${yesNo(plan.current.javascriptAllowed)}`,
    `ready_for_outline: ${yesNo(plan.readyForOutline)}`,
    `user_action_required: ${yesNo(plan.userActionRequired)}`,
    `operator_step_count: ${plan.operatorSteps.length}`,
    `next_action: ${plan.nextAction}`,
    `status_command: ${plan.statusCommand.shell}`,
    `outline_plan_command: ${plan.outlinePlanCommand.shell}`,
    `outline_approval_command: ${plan.outlineApprovalCommand.shell}`,
    `regular_chrome_use_command: ${plan.regularChromeUseCommand.shell}`
  ];
  if (plan.current.javascriptError) lines.push(`javascript_error: ${clean(plan.current.javascriptError)}`);
  plan.operatorSteps.forEach((step, index) => lines.push(`operator_step_${index + 1}: ${step}`));
  if (plan.outputPath) lines.push(`output: ${plan.outputPath}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeAppleEventsEnablePlanMarkdown(plan) {
  const lines = [
    '# Chrome Apple Events Enable Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    `Safe mode: ${plan.safeMode ? 'yes' : 'no'}`,
    `Opens browser now: ${plan.opensBrowserNow ? 'yes' : 'no'}`,
    `Changes Chrome settings now: ${plan.changesChromeSettingsNow ? 'yes' : 'no'}`,
    `Secret values read: ${plan.secretValuesRead ? 'yes' : 'no'}`,
    `Official help: ${plan.officialHelpUrl}`,
    '',
    '## Current',
    '',
    `- Chrome reachable: ${plan.current.chromeReachable ? 'yes' : 'no'}`,
    `- Active tab observed: ${plan.current.activeTabObserved ? 'yes' : 'no'}`,
    `- JavaScript from Apple Events allowed: ${plan.current.javascriptAllowed ? 'yes' : 'no'}`,
    `- URL redacted: ${plan.current.activeTabUrlRedacted || 'none'}`,
    `- Full URL returned: ${plan.current.fullUrlReturned ? 'yes' : 'no'}`,
    '',
    '## Next',
    '',
    `- ${plan.nextAction}`
  ];
  if (plan.operatorSteps.length) {
    lines.push('', '## Operator Steps', '');
    for (const step of plan.operatorSteps) lines.push(`- ${step}`);
  }
  lines.push(
    '',
    '## Commands',
    '',
    '```bash',
    plan.statusCommand.shell,
    plan.outlinePlanCommand.shell,
    plan.outlineApprovalCommand.shell,
    '```'
  );
  return `${lines.join('\n')}\n`;
}
