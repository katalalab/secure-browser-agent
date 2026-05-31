import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildChromeAppleEventsOutline, buildChromeAppleEventsStatus, formatChromeAppleEventsOutlineCompact, formatChromeAppleEventsStatusCompact, formatChromeAppleEventsStatusMarkdown } from '../src/chrome-apple-events-status.mjs';

function runnerFor({ tabOk = true, jsOk = false } = {}) {
  return (command, args) => {
    assert.equal(command, 'osascript');
    const script = args.at(-1);
    if (script.includes('execute active tab')) {
      return jsOk
        ? { status: 0, stdout: 'Sensitive Title\n', stderr: '' }
        : {
            status: 1,
            stdout: '',
            stderr: 'execution error: JavaScript from Apple Events is disabled. https://support.google.com/chrome/?p=applescript'
          };
    }
    return tabOk
      ? { status: 0, stdout: 'Sensitive Account, Inc.\nhttps://example.com/private/path?token=secret#frag\n', stderr: '' }
      : { status: 1, stdout: '', stderr: 'Not authorized to send Apple events to Google Chrome.' };
  };
}

function outlineRunner() {
  return (command, args) => {
    assert.equal(command, 'osascript');
    const script = args.at(-1);
    if (script.includes('elementSamples')) {
      return {
        status: 0,
        stdout: `${JSON.stringify({
          url: 'https://example.com/private?token=secret#frag',
          titleLength: 12,
          bodyTextLength: 1234,
          headings: { h1: 1, h2: 2, h3: 0, h4: 0, h5: 0, h6: 0 },
          links: { total: 8, sameOrigin: 6, external: 2 },
          forms: { total: 1, withPassword: 1, withFile: 0 },
          controls: { total: 4, byTag: { input: 3, button: 1 }, inputTypes: { text: 1, password: 1, submit: 1 } },
          media: { images: 2, videos: 0, canvases: 0, iframes: 1 },
          data: { tables: 1, lists: 2, articles: 0, sections: 3 },
          elementSamples: [{ index: 0, tag: 'main', role: '', childElementCount: 3, textLength: 100 }]
        })}\n`,
        stderr: ''
      };
    }
    if (script.includes('document.title')) {
      return { status: 0, stdout: 'Sensitive Title\n', stderr: '' };
    }
    return { status: 0, stdout: 'Sensitive Account, Inc.\nhttps://example.com/private?token=secret#frag\n', stderr: '' };
  };
}

test('chrome apple events status redacts tab URL and title text', () => {
  const status = buildChromeAppleEventsStatus({
    generatedAt: '2026-05-29T00:00:00.000Z',
    runner: runnerFor()
  });

  assert.equal(status.safeMode, true);
  assert.equal(status.destructiveActionsIncluded, false);
  assert.equal(status.secretValuesRead, false);
  assert.equal(status.opensBrowserNow, false);
  assert.equal(status.activeTab.titlePresent, true);
  assert.equal(status.activeTab.titleLength, 'Sensitive Account, Inc.'.length);
  assert.equal(status.activeTab.urlRedacted, 'https://example.com/private/path');
  assert.equal(status.activeTab.queryPresent, true);
  assert.equal(status.activeTab.fragmentPresent, true);
  assert.equal(status.activeTab.fullUrlReturned, false);
  assert.equal(status.javascript.allowed, false);
  assert.equal(status.javascript.error, 'javascript-from-apple-events-disabled');
  assert.equal(JSON.stringify(status).includes('token=secret'), false);
  assert.equal(JSON.stringify(status).includes('Sensitive Account'), false);

  const compact = formatChromeAppleEventsStatusCompact(status);
  assert.match(compact, /^backend: chrome-apple-events$/m);
  assert.match(compact, /^active_tab_url_redacted: https:\/\/example\.com\/private\/path$/m);
  assert.match(compact, /^full_url_returned: no$/m);
  assert.match(compact, /^javascript_from_apple_events_allowed: no$/m);
  assert.match(compact, /^stored_authenticated_scraping_allowed: no$/m);
  assert.doesNotMatch(compact, /token=secret/);

  const markdown = formatChromeAppleEventsStatusMarkdown(status);
  assert.match(markdown, /Chrome Apple Events Status/);
  assert.match(markdown, /URL redacted: https:\/\/example\.com\/private\/path/);
  assert.doesNotMatch(markdown, /Sensitive Account/);
});

test('chrome apple events status reports javascript availability without returning result', () => {
  const status = buildChromeAppleEventsStatus({
    generatedAt: '2026-05-29T00:00:00.000Z',
    runner: runnerFor({ jsOk: true })
  });

  assert.equal(status.javascript.allowed, true);
  assert.equal(status.javascript.resultReturned, false);
  assert.equal(status.capabilities.inspectDomWithJavaScript, true);
  assert.equal(status.nextAction, 'apple-events-read-only-dom-probe-available');
});

test('chrome apple events status formats special browser URLs without null origin', () => {
  const status = buildChromeAppleEventsStatus({
    generatedAt: '2026-05-29T00:00:00.000Z',
    runner: (command, args) => {
      assert.equal(command, 'osascript');
      const script = args.at(-1);
      if (script.includes('execute active tab')) {
        return { status: 1, stdout: '', stderr: 'JavaScript from Apple Events is disabled.' };
      }
      return { status: 0, stdout: '\nabout:blank\n', stderr: '' };
    }
  });

  assert.equal(status.activeTab.urlRedacted, 'about:blank');
  assert.equal(formatChromeAppleEventsStatusCompact(status).includes('nullblank'), false);
});

test('chrome apple events outline is gated and redacts active tab details', () => {
  const plan = buildChromeAppleEventsOutline({
    generatedAt: '2026-05-29T00:00:00.000Z',
    runner: outlineRunner()
  });

  assert.equal(plan.run, false);
  assert.equal(plan.executed, false);
  assert.equal(plan.blocked, true);
  assert.equal(plan.operatorOkRequired, true);
  assert.match(plan.approvalCommand.shell, /--operator-ok' 'OK/);

  const outline = buildChromeAppleEventsOutline({
    generatedAt: '2026-05-29T00:00:00.000Z',
    run: true,
    operatorOk: 'OK',
    runner: outlineRunner()
  });

  assert.equal(outline.executed, true);
  assert.equal(outline.blocked, false);
  assert.equal(outline.textContentReturned, false);
  assert.equal(outline.fullUrlReturned, false);
  assert.equal(outline.storedAuthenticatedScrapingAllowed, false);
  assert.equal(outline.outline.urlRedacted, 'https://example.com/private');
  assert.equal(outline.outline.queryPresent, true);
  assert.equal(outline.outline.fragmentPresent, true);
  assert.equal(outline.outline.forms.withPassword, 1);
  assert.equal(JSON.stringify(outline).includes('token=secret'), false);
  assert.equal(JSON.stringify(outline).includes('Sensitive Account'), false);

  const compact = formatChromeAppleEventsOutlineCompact(outline);
  assert.match(compact, /^executed: yes$/m);
  assert.match(compact, /^text_content_returned: no$/m);
  assert.match(compact, /^url_redacted: https:\/\/example\.com\/private$/m);
  assert.match(compact, /^forms_with_password: 1$/m);
});

test('chrome apple events status and outline can write under runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-apple-events-write-'));
  try {
    const status = buildChromeAppleEventsStatus({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      runner: runnerFor(),
      write: true
    });

    assert.equal(status.outputPath, path.join(rootDir, 'runs/operator/chrome-apple-events-status-latest.json'));
    const savedStatus = JSON.parse(fs.readFileSync(status.outputPath, 'utf8'));
    assert.equal(savedStatus.secretValuesRead, false);
    assert.equal(savedStatus.activeTab.urlRedacted, 'https://example.com/private/path');
    assert.equal(JSON.stringify(savedStatus).includes('token=secret'), false);
    assert.match(formatChromeAppleEventsStatusCompact(status), /^output: .*chrome-apple-events-status-latest\.json$/m);

    const outline = buildChromeAppleEventsOutline({
      rootDir,
      generatedAt: '2026-05-30T00:00:00.000Z',
      runner: outlineRunner(),
      write: true,
      out: 'operator/apple-outline.json'
    });

    assert.equal(outline.outputPath, path.join(rootDir, 'runs/operator/apple-outline.json'));
    const savedOutline = JSON.parse(fs.readFileSync(outline.outputPath, 'utf8'));
    assert.equal(savedOutline.executed, false);
    assert.equal(savedOutline.secretValuesRead, false);
    assert.equal(JSON.stringify(savedOutline).includes('token=secret'), false);
    assert.match(formatChromeAppleEventsOutlineCompact(outline), /^output: .*operator\/apple-outline\.json$/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('chrome apple events writes reject output paths outside runs', () => {
  assert.throws(
    () => buildChromeAppleEventsStatus({
      rootDir: '/tmp/sba',
      runner: runnerFor(),
      write: true,
      out: '../apple-events.json'
    }),
    /invalid Chrome Apple Events output path/
  );
});
