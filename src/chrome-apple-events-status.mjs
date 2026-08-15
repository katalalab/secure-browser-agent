import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { toPosixPath } from './output.mjs';

function clean(value, fallback = '') {
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
  if (!insideRuns) throw new Error(`invalid Chrome Apple Events output path: ${outPath}`);
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

function runOsa(script, runner = spawnSync) {
  try {
    const result = runner('osascript', ['-e', script], {
      encoding: 'utf8',
      timeout: 3000
    });
    return {
      ok: result.status === 0,
      status: result.status,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
      error: result.error ? result.error.message : ''
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function appleScriptString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function redactedUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return {
      present: false,
      redacted: '',
      origin: '',
      path: '',
      queryPresent: false,
      fragmentPresent: false
    };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.origin === 'null') {
      return {
        present: true,
        redacted: `${parsed.protocol}${parsed.pathname}`,
        origin: '',
        path: parsed.pathname,
        queryPresent: Boolean(parsed.search),
        fragmentPresent: Boolean(parsed.hash)
      };
    }
    return {
      present: true,
      redacted: `${parsed.origin}${parsed.pathname}`,
      origin: parsed.origin,
      path: parsed.pathname,
      queryPresent: Boolean(parsed.search),
      fragmentPresent: Boolean(parsed.hash)
    };
  } catch {
    return {
      present: true,
      redacted: raw.split(/[?#]/, 1)[0],
      origin: '',
      path: '',
      queryPresent: raw.includes('?'),
      fragmentPresent: raw.includes('#')
    };
  }
}

function normalizedError(result) {
  const text = clean(result.stderr || result.error || '');
  if (!text) return '';
  if (/AppleScript .* JavaScript|JavaScript .* AppleScript|Apple Events .* JavaScript|applescript/i.test(text)) {
    return 'javascript-from-apple-events-disabled';
  }
  if (/not authorized|not allowed|not permitted|Automation/i.test(text)) {
    return 'macos-automation-permission-required';
  }
  return text.slice(0, 180);
}

const OUTLINE_SCRIPT = `(() => {
  const visible = (element) => {
    const style = window.getComputedStyle(element);
    return style && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const count = (selector) => document.querySelectorAll(selector).length;
  const byType = (items, picker) => {
    const out = {};
    for (const item of items) {
      const key = picker(item) || 'unknown';
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  };
  const controls = [...document.querySelectorAll('input,textarea,select,button')].filter(visible);
  const links = [...document.querySelectorAll('a[href]')].filter(visible);
  const headings = [1,2,3,4,5,6].reduce((acc, level) => {
    acc['h' + level] = count('h' + level);
    return acc;
  }, {});
  const elementSamples = [...document.querySelectorAll('main,article,section,nav,aside,form,table,[role]')]
    .filter(visible)
    .slice(0, 25)
    .map((element, index) => ({
      index,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || '',
      childElementCount: element.childElementCount,
      textLength: (element.innerText || '').trim().length
    }));
  return JSON.stringify({
    url: location.href,
    titleLength: document.title.length,
    bodyTextLength: (document.body?.innerText || '').trim().length,
    headings,
    links: {
      total: links.length,
      sameOrigin: links.filter((link) => {
        try { return new URL(link.href, location.href).origin === location.origin; } catch { return false; }
      }).length,
      external: links.filter((link) => {
        try { return new URL(link.href, location.href).origin !== location.origin; } catch { return false; }
      }).length
    },
    forms: {
      total: count('form'),
      withPassword: count('input[type="password"]'),
      withFile: count('input[type="file"]')
    },
    controls: {
      total: controls.length,
      byTag: byType(controls, (element) => element.tagName.toLowerCase()),
      inputTypes: byType(controls.filter((element) => element.tagName.toLowerCase() === 'input'), (element) => element.type || 'text')
    },
    media: {
      images: count('img'),
      videos: count('video'),
      canvases: count('canvas'),
      iframes: count('iframe')
    },
    data: {
      tables: count('table'),
      lists: count('ul,ol'),
      articles: count('article'),
      sections: count('section')
    },
    elementSamples
  });
})()`;

function parseOutlineJson(value) {
  try {
    return JSON.parse(String(value || '').trim());
  } catch {
    return null;
  }
}

export function buildChromeAppleEventsStatus(options = {}) {
  const runner = options.runner || spawnSync;
  const generatedAt = options.generatedAt || new Date().toISOString();
  const tabResult = runOsa(`
tell application "Google Chrome"
  if (count of windows) is 0 then
    return "NO_WINDOWS"
  end if
  set tabTitle to title of active tab of front window
  set tabUrl to URL of active tab of front window
  return tabTitle & linefeed & tabUrl
end tell
`, runner);
  const [title = '', url = ''] = tabResult.ok ? tabResult.stdout.replace(/\r/g, '').split('\n') : [];
  const urlInfo = redactedUrl(url);
  const jsResult = tabResult.ok
    ? runOsa('tell application "Google Chrome" to execute active tab of front window javascript "document.title"', runner)
    : { ok: false, status: null, stdout: '', stderr: '', error: 'tab-not-readable' };
  const javascriptAllowed = Boolean(jsResult.ok);
  const nextAction = !tabResult.ok
    ? normalizedError(tabResult) === 'macos-automation-permission-required'
      ? 'grant-macos-automation-permission-if-operator-approves'
      : 'open-or-select-a-chrome-window'
    : javascriptAllowed
    ? 'apple-events-read-only-dom-probe-available'
    : 'enable-javascript-from-apple-events-if-operator-approves';

  const status = {
    schemaVersion: 1,
    generatedAt,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    pageContentReturned: false,
    backend: 'chrome-apple-events',
    chrome: {
      reachable: Boolean(tabResult.ok),
      windowAvailable: Boolean(tabResult.ok && tabResult.stdout.trim() !== 'NO_WINDOWS'),
      automationPermissionLikely: tabResult.ok || normalizedError(tabResult) !== 'macos-automation-permission-required'
    },
    activeTab: {
      observed: Boolean(tabResult.ok && tabResult.stdout.trim() !== 'NO_WINDOWS'),
      titlePresent: Boolean(title),
      titleLength: title.length,
      urlPresent: urlInfo.present,
      urlRedacted: urlInfo.redacted,
      origin: urlInfo.origin,
      path: urlInfo.path,
      queryPresent: urlInfo.queryPresent,
      fragmentPresent: urlInfo.fragmentPresent,
      fullUrlReturned: false
    },
    javascript: {
      allowed: javascriptAllowed,
      checkedWith: 'document.title',
      resultReturned: false,
      error: javascriptAllowed ? '' : normalizedError(jsResult)
    },
    capabilities: {
      observeActiveTabUrlAndTitleMetadata: Boolean(tabResult.ok),
      inspectDomWithJavaScript: javascriptAllowed,
      operatePage: false,
      listAllTabs: false,
      backgroundFriendly: true,
      storedAuthenticatedScrapingAllowed: false,
      dedicatedTargetProfileRequiredForStoredAuth: true
    },
    nextAction,
    operatorNotes: [
      'This status uses macOS Apple Events and does not open Chrome or use the default profile through CDP.',
      'It redacts URL query and fragment and does not return page title text.',
      'DOM inspection through this lane requires the operator to enable Chrome View > Developer > Allow JavaScript from Apple Events.',
      'Use this only for operator-requested existing-tab diagnostics; stored authenticated scraping remains on dedicated target profiles.'
    ]
  };
  return maybeWrite(status, options, 'operator/chrome-apple-events-status-latest.json');
}

export function buildChromeAppleEventsOutline(options = {}) {
  const runner = options.runner || spawnSync;
  const generatedAt = options.generatedAt || new Date().toISOString();
  const run = Boolean(options.run);
  const operatorOk = clean(options.operatorOk || '');
  const operatorApproved = operatorOk === 'OK';
  const status = options.status || buildChromeAppleEventsStatus({ ...options, runner, generatedAt });
  const base = {
    schemaVersion: 1,
    generatedAt,
    safeMode: true,
    destructiveActionsIncluded: false,
    secretValuesRead: false,
    opensBrowserNow: false,
    readsBrowserStorage: false,
    backend: 'chrome-apple-events',
    run,
    operatorOkRequired: true,
    operatorApproved,
    commandRunOnlyAfterUserSays: 'OK',
    pageOutputTrusted: false,
    textContentReturned: false,
    fullUrlReturned: false,
    storedAuthenticatedScrapingAllowed: false,
    dedicatedTargetProfileRequiredForStoredAuth: true,
    command: command(['node', 'src/cli.mjs', 'chrome-apple-events-outline', '--format', 'compact']),
    approvalCommand: command(['node', 'src/cli.mjs', 'chrome-apple-events-outline', '--run', '--operator-ok', 'OK', '--format', 'compact']),
    status
  };
  if (!run) {
    return maybeWrite({
      ...base,
      ready: Boolean(status.javascript.allowed),
      executed: false,
      blocked: true,
      nextAction: status.javascript.allowed ? 'rerun-with-operator-ok' : status.nextAction,
      blockedReason: status.javascript.allowed
        ? 'Outline execution is gated. Re-run with --run --operator-ok OK only for an operator-requested active tab.'
        : 'Chrome JavaScript from Apple Events is not available, so the active tab DOM outline cannot be inspected through this lane.',
      outline: null
    }, options, 'operator/chrome-apple-events-outline-latest.json');
  }
  if (!operatorApproved) {
    return maybeWrite({
      ...base,
      ready: Boolean(status.javascript.allowed),
      executed: false,
      blocked: true,
      nextAction: 'wait-for-operator-ok',
      blockedReason: 'Missing explicit --operator-ok OK approval for active-tab Apple Events DOM outline.',
      outline: null
    }, options, 'operator/chrome-apple-events-outline-latest.json');
  }
  if (!status.javascript.allowed) {
    return maybeWrite({
      ...base,
      ready: false,
      executed: false,
      blocked: true,
      nextAction: status.nextAction,
      blockedReason: status.javascript.error || 'Chrome JavaScript from Apple Events is not available.',
      outline: null
    }, options, 'operator/chrome-apple-events-outline-latest.json');
  }

  const result = runOsa(`tell application "Google Chrome" to execute active tab of front window javascript "${appleScriptString(OUTLINE_SCRIPT)}"`, runner);
  const parsed = result.ok ? parseOutlineJson(result.stdout) : null;
  if (!result.ok || !parsed) {
    return maybeWrite({
      ...base,
      ready: false,
      executed: false,
      blocked: true,
      nextAction: 'inspect-apple-events-outline-error',
      blockedReason: normalizedError(result) || 'Apple Events outline returned invalid JSON.',
      outline: null
    }, options, 'operator/chrome-apple-events-outline-latest.json');
  }
  const urlInfo = redactedUrl(parsed.url);
  return maybeWrite({
    ...base,
    ready: true,
    executed: true,
    blocked: false,
    nextAction: 'use-active-tab-outline',
    blockedReason: '',
    outline: {
      urlRedacted: urlInfo.redacted,
      origin: urlInfo.origin,
      path: urlInfo.path,
      queryPresent: urlInfo.queryPresent,
      fragmentPresent: urlInfo.fragmentPresent,
      titleLength: Number(parsed.titleLength || 0),
      bodyTextLength: Number(parsed.bodyTextLength || 0),
      headings: parsed.headings || {},
      links: parsed.links || {},
      forms: parsed.forms || {},
      controls: parsed.controls || {},
      media: parsed.media || {},
      data: parsed.data || {},
      elementSamples: Array.isArray(parsed.elementSamples) ? parsed.elementSamples.slice(0, 25) : []
    }
  }, options, 'operator/chrome-apple-events-outline-latest.json');
}

export function formatChromeAppleEventsStatusCompact(status) {
  const lines = [
    `safe_mode: ${yesNo(status.safeMode)}`,
    `destructive_actions: ${yesNo(status.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(status.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(status.opensBrowserNow)}`,
    `backend: ${status.backend}`,
    `chrome_reachable: ${yesNo(status.chrome.reachable)}`,
    `window_available: ${yesNo(status.chrome.windowAvailable)}`,
    `active_tab_observed: ${yesNo(status.activeTab.observed)}`,
    `active_tab_title_present: ${yesNo(status.activeTab.titlePresent)}`,
    `active_tab_title_length: ${status.activeTab.titleLength}`,
    `active_tab_url_present: ${yesNo(status.activeTab.urlPresent)}`,
    `active_tab_url_redacted: ${clean(status.activeTab.urlRedacted, 'none')}`,
    `active_tab_query_present: ${yesNo(status.activeTab.queryPresent)}`,
    `active_tab_fragment_present: ${yesNo(status.activeTab.fragmentPresent)}`,
    `full_url_returned: ${yesNo(status.activeTab.fullUrlReturned)}`,
    `javascript_from_apple_events_allowed: ${yesNo(status.javascript.allowed)}`,
    `javascript_result_returned: ${yesNo(status.javascript.resultReturned)}`,
    `can_observe_tab_metadata: ${yesNo(status.capabilities.observeActiveTabUrlAndTitleMetadata)}`,
    `can_inspect_dom_with_javascript: ${yesNo(status.capabilities.inspectDomWithJavaScript)}`,
    `operate_page_allowed: ${yesNo(status.capabilities.operatePage)}`,
    `stored_authenticated_scraping_allowed: ${yesNo(status.capabilities.storedAuthenticatedScrapingAllowed)}`,
    `dedicated_target_profile_required: ${yesNo(status.capabilities.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `next_action: ${status.nextAction}`
  ];
  if (status.javascript.error) lines.push(`javascript_error: ${status.javascript.error}`);
  if (status.outputPath) lines.push(`output: ${toPosixPath(status.outputPath)}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeAppleEventsOutlineCompact(result) {
  const outline = result.outline || {};
  const lines = [
    `safe_mode: ${yesNo(result.safeMode)}`,
    `destructive_actions: ${yesNo(result.destructiveActionsIncluded)}`,
    `secret_values_read: ${yesNo(result.secretValuesRead)}`,
    `opens_browser_now: ${yesNo(result.opensBrowserNow)}`,
    `backend: ${result.backend}`,
    `run: ${yesNo(result.run)}`,
    `operator_ok_required: ${yesNo(result.operatorOkRequired)}`,
    `operator_approved: ${yesNo(result.operatorApproved)}`,
    `ready: ${yesNo(result.ready)}`,
    `executed: ${yesNo(result.executed)}`,
    `blocked: ${yesNo(result.blocked)}`,
    `page_output_trusted: ${yesNo(result.pageOutputTrusted)}`,
    `text_content_returned: ${yesNo(result.textContentReturned)}`,
    `full_url_returned: ${yesNo(result.fullUrlReturned)}`,
    `stored_authenticated_scraping_allowed: ${yesNo(result.storedAuthenticatedScrapingAllowed)}`,
    `dedicated_target_profile_required: ${yesNo(result.dedicatedTargetProfileRequiredForStoredAuth)}`,
    `javascript_from_apple_events_allowed: ${yesNo(result.status?.javascript?.allowed)}`,
    `next_action: ${result.nextAction}`,
    `url_redacted: ${clean(outline.urlRedacted, 'none')}`,
    `query_present: ${yesNo(outline.queryPresent)}`,
    `fragment_present: ${yesNo(outline.fragmentPresent)}`,
    `title_length: ${outline.titleLength ?? 0}`,
    `body_text_length: ${outline.bodyTextLength ?? 0}`,
    `headings_h1: ${outline.headings?.h1 ?? 0}`,
    `headings_h2: ${outline.headings?.h2 ?? 0}`,
    `links_total: ${outline.links?.total ?? 0}`,
    `forms_total: ${outline.forms?.total ?? 0}`,
    `forms_with_password: ${outline.forms?.withPassword ?? 0}`,
    `controls_total: ${outline.controls?.total ?? 0}`,
    `tables: ${outline.data?.tables ?? 0}`,
    `element_sample_count: ${outline.elementSamples?.length || 0}`,
    `command: ${result.command.shell}`,
    `approval_command: ${result.approvalCommand.shell}`
  ];
  if (result.blockedReason) lines.push(`blocked_reason: ${result.blockedReason}`);
  if (result.outputPath) lines.push(`output: ${toPosixPath(result.outputPath)}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeAppleEventsStatusMarkdown(status) {
  const lines = [
    '# Chrome Apple Events Status',
    '',
    `Generated: ${status.generatedAt}`,
    `Safe mode: ${status.safeMode ? 'yes' : 'no'}`,
    `Opens browser now: ${status.opensBrowserNow ? 'yes' : 'no'}`,
    `Secret values read: ${status.secretValuesRead ? 'yes' : 'no'}`,
    '',
    '## Active Tab',
    '',
    `- Chrome reachable: ${status.chrome.reachable ? 'yes' : 'no'}`,
    `- Active tab observed: ${status.activeTab.observed ? 'yes' : 'no'}`,
    `- URL redacted: ${status.activeTab.urlRedacted || 'none'}`,
    `- Query present: ${status.activeTab.queryPresent ? 'yes' : 'no'}`,
    `- Fragment present: ${status.activeTab.fragmentPresent ? 'yes' : 'no'}`,
    `- Full URL returned: ${status.activeTab.fullUrlReturned ? 'yes' : 'no'}`,
    '',
    '## JavaScript',
    '',
    `- Allowed from Apple Events: ${status.javascript.allowed ? 'yes' : 'no'}`,
    `- Result returned: ${status.javascript.resultReturned ? 'yes' : 'no'}`,
    `- Error: ${status.javascript.error || 'none'}`,
    '',
    '## Next',
    '',
    `- ${status.nextAction}`,
    '',
    '## Notes',
    ''
  ];
  for (const note of status.operatorNotes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

export function formatChromeAppleEventsOutlineMarkdown(result) {
  const outline = result.outline || {};
  const lines = [
    '# Chrome Apple Events Outline',
    '',
    `Generated: ${result.generatedAt}`,
    `Safe mode: ${result.safeMode ? 'yes' : 'no'}`,
    `Run: ${result.run ? 'yes' : 'no'}`,
    `Operator approved: ${result.operatorApproved ? 'yes' : 'no'}`,
    `Executed: ${result.executed ? 'yes' : 'no'}`,
    `Blocked: ${result.blocked ? 'yes' : 'no'}`,
    `Secret values read: ${result.secretValuesRead ? 'yes' : 'no'}`,
    `Text content returned: ${result.textContentReturned ? 'yes' : 'no'}`,
    `Full URL returned: ${result.fullUrlReturned ? 'yes' : 'no'}`,
    '',
    '## Outline',
    '',
    `- URL redacted: ${outline.urlRedacted || 'none'}`,
    `- Body text length: ${outline.bodyTextLength ?? 0}`,
    `- H1: ${outline.headings?.h1 ?? 0}`,
    `- H2: ${outline.headings?.h2 ?? 0}`,
    `- Links: ${outline.links?.total ?? 0}`,
    `- Forms: ${outline.forms?.total ?? 0}`,
    `- Controls: ${outline.controls?.total ?? 0}`,
    `- Element samples: ${outline.elementSamples?.length || 0}`,
    '',
    '## Next',
    '',
    `- ${result.nextAction}`
  ];
  if (result.blockedReason) lines.push(`- Blocked reason: ${result.blockedReason}`);
  return `${lines.join('\n')}\n`;
}
