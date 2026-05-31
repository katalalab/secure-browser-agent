import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { allowedDomains, assertAllowedUrl, assertEngineAllowed, loadPolicy, profilePath, redact, statePath } from '../src/policy.mjs';
import { buildExtractScript, buildInspectScript, buildObserveScript, buildOutlineScript } from '../src/extract-script.mjs';
import { summarizeHarFile } from '../src/har.mjs';
import { sessionArgs } from '../src/agent-browser.mjs';
import { __test as cdpBackendTest, actionWithCdp, analyzeWithCdp, cdpDaemonStatus, consoleSummaryWithCdp, inspectWithCdp, observeWithCdp, openCdpProfile, outlineWithCdp, runRecipeWithCdp, scrapeWithCdp, screenshotWithCdp, startCdpDaemon, stopCdpDaemon, waitForWithCdp } from '../src/cdp-backend.mjs';
import { safeOutputPath, selectRowsForCsv, toCsv, writeOutput } from '../src/output.mjs';
import { addTargetOperateStep, addTargetUrls, applyTargetPermissions, buildTargetRunStatus, doctorTargetPack, formatTargetRunStatusCompact, loadTargetAutostart, removeTargetAutostart, resolveTargetAutostart, resolveTargetDaemon, resolveTargetLogin, resolveTargetPack, resolveTargetPermissions, resolveTargetRun, resolveTargetScrape, scaffoldTargetPack, targetAutostartStatus, targetLoginHandoff, targetPermissionStatus, unloadTargetAutostart, writeTargetAutostart, writeTargetPermissions } from '../src/target-pack.mjs';
import { profileStatus } from '../src/profile-status.mjs';
import { auditTargetPack, scanTargetPackForSecrets } from '../src/security-audit.mjs';
import { listMcpTools } from '../src/mcp-server.mjs';

test('policy accepts configured origins and blocks unknown origins', () => {
  const policy = loadPolicy();
  assert.doesNotThrow(() => assertAllowedUrl('https://example.com/a', policy));
  assert.doesNotThrow(() => assertAllowedUrl('data:text/html,<h1>ok</h1>', policy));
  assert.throws(() => assertAllowedUrl('https://evil.example/a', policy), /blocked URL/);
});

test('redaction removes sensitive keys and bearer-like values', () => {
  const policy = loadPolicy();
  const output = redact({ headers: { authorization: 'Bearer abc.def' }, text: 'Basic xyz' }, policy);
  assert.equal(output.headers.authorization, '[REDACTED]');
  assert.equal(output.text, 'Basic [REDACTED]');
});

test('extract script embeds selector and fields as JSON values', () => {
  const script = buildExtractScript({ selector: 'a[href]', fields: ['text', 'href', 'attr:data-id'], limit: 2 });
  assert.match(script, /document\.querySelectorAll/);
  assert.match(script, /"attr:data-id"/);
  assert.match(script, /const limit = 2/);
});

test('outline script includes structural page features', () => {
  const script = buildOutlineScript({ linkLimit: 3 });
  assert.match(script, /headings/);
  assert.match(script, /forms/);
  assert.match(script, /tables/);
  assert.match(script, /slice\(0, 3\)/);
});

test('observe script includes compact page features', () => {
  const script = buildObserveScript({ linkLimit: 2, controlLimit: 3, textLimit: 80 });
  assert.match(script, /counts/);
  assert.match(script, /controls/);
  assert.match(script, /textSample/);
  assert.match(script, /slice\(0, 2\)/);
});

test('inspect script includes scraping candidate features', () => {
  const script = buildInspectScript({ candidateLimit: 2, sampleLimit: 1 });
  assert.match(script, /candidates/);
  assert.match(script, /sampleFields/);
  assert.match(script, /sampleRows/);
  assert.match(script, /tables/);
});

test('session args use dedicated profile path and state path', () => {
  const policy = loadPolicy();
  const args = sessionArgs(policy, 'target.example');
  assert.equal(args[args.indexOf('--session') + 1], 'target.example');
  assert.equal(args[args.indexOf('--profile') + 1], profilePath(policy, 'target.example'));
  assert.equal(args.includes('--state'), false);
  assert.ok(args.includes('--allowed-domains'));
});

test('state-only session args do not combine profile and storage state', () => {
  const policy = loadPolicy();
  const args = sessionArgs(policy, 'target.example', { stateOnly: true });
  assert.equal(args.includes('--profile'), false);
  assert.equal(args[args.indexOf('--state') + 1], statePath(policy, 'target.example'));
});

test('lightpanda session args avoid chrome profile and storage state', () => {
  const policy = loadPolicy();
  const args = sessionArgs(policy, 'public', { engine: 'lightpanda' });
  assert.equal(args.includes('--profile'), false);
  assert.equal(args.includes('--state'), false);
  assert.equal(args[args.indexOf('--engine') + 1], 'lightpanda');
});

test('lightpanda session args accept explicit executable path', () => {
  const policy = loadPolicy();
  const args = sessionArgs(policy, 'public', {
    engine: 'lightpanda',
    executablePath: '/opt/lightpanda/bin/lightpanda'
  });
  assert.equal(args[args.indexOf('--executable-path') + 1], '/opt/lightpanda/bin/lightpanda');
});

test('lightpanda session args accept policy executable path', () => {
  const policy = {
    ...loadPolicy(),
    engines: {
      lightpanda: {
        executablePath: '/Applications/Lightpanda/lightpanda'
      }
    }
  };
  const args = sessionArgs(policy, 'public', { engine: 'lightpanda' });
  assert.equal(args[args.indexOf('--executable-path') + 1], '/Applications/Lightpanda/lightpanda');
});

test('allowed domains are derived from origins', () => {
  const policy = loadPolicy();
  assert.deepEqual(allowedDomains(policy), ['example.com', 'duckduckgo.com', 'html.duckduckgo.com', 'search.brave.com', 'www.google.com']);
});

test('lightpanda is public-profile only by policy', () => {
  const policy = loadPolicy();
  assert.doesNotThrow(() => assertEngineAllowed('lightpanda', 'public', policy));
  assert.throws(() => assertEngineAllowed('lightpanda', 'logged-in-target', policy), /authenticated profiles/);
});

test('har summary inventories entries without bodies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-har-'));
  const file = path.join(dir, 'sample.har');
  fs.writeFileSync(file, JSON.stringify({
    log: {
      pages: [{ id: 'p1' }],
      entries: [
        {
          request: { method: 'GET', url: 'https://example.com/a' },
          response: { status: 200, content: { mimeType: 'text/html', size: 12 } }
        },
        {
          request: { method: 'POST', url: 'https://api.example.com/v1/items' },
          response: { status: 401, bodySize: 3, content: { mimeType: 'application/json' } }
        }
      ]
    }
  }), 'utf8');
  const summary = summarizeHarFile(file, loadPolicy());
  assert.equal(summary.pages, 1);
  assert.equal(summary.entries, 2);
  assert.equal(summary.hosts['example.com'], 1);
  assert.equal(summary.methods.POST, 1);
  assert.equal(summary.statuses['401'], 1);
  assert.equal(summary.resources.length, 2);
});

test('CSV output selects recipe result arrays and quotes cells', () => {
  const rows = selectRowsForCsv({
    results: {
      result: [
        { text: 'hello, world', href: '/x' },
        { text: 'quoted "value"', href: '/y' }
      ]
    }
  }, 'result');
  assert.equal(rows.length, 2);
  assert.equal(toCsv(rows), 'text,href\n"hello, world",/x\n"quoted ""value""",/y');
});

test('CSV output flattens multi-page crawl result paths with page context', () => {
  const rows = selectRowsForCsv({
    pages: [
      {
        inputUrl: 'https://example.com/a',
        url: 'https://example.com/a',
        results: {
          links: [
            { text: 'A', href: '/a' }
          ]
        }
      },
      {
        inputUrl: 'https://example.com/b',
        url: 'https://example.com/b#done',
        results: {
          links: [
            { text: 'B', href: '/b' }
          ]
        }
      }
    ]
  }, 'pages[].results.links');
  assert.deepEqual(rows, [
    { pageIndex: 0, inputUrl: 'https://example.com/a', pageUrl: 'https://example.com/a', text: 'A', href: '/a' },
    { pageIndex: 1, inputUrl: 'https://example.com/b', pageUrl: 'https://example.com/b#done', text: 'B', href: '/b' }
  ]);
});

test('manifest output writes audit metadata next to output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-output-'));
  const policy = { outputDir: dir, source: '/tmp/policy.json' };
  writeOutput(policy, { out: 'nested/rows.csv', format: 'csv', manifest: true, quiet: true }, [{ text: 'hello' }], {
    command: 'test',
    profile: 'public'
  });
  assert.equal(fs.readFileSync(path.join(dir, 'nested', 'rows.csv'), 'utf8'), '\uFEFFtext\nhello\n');
  const manifest = JSON.parse(fs.readFileSync(`${safeOutputPath(policy, 'nested/rows.csv')}.manifest.json`, 'utf8'));
  assert.equal(manifest.command, 'test');
  assert.equal(manifest.profile, 'public');
  assert.equal(manifest.format, 'csv');
  assert.equal(manifest.policy, '/tmp/policy.json');
});

test('profile status reports auth artifacts without reading secrets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-profile-status-'));
  const policy = {
    source: '/tmp/policy.json',
    profileDir: dir
  };
  const profile = profilePath(policy, 'target.example');
  fs.mkdirSync(path.join(profile, 'Default', 'Network'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'Default', 'Network', 'Cookies'), 'cookie-db-placeholder', 'utf8');
  fs.writeFileSync(path.join(profile, 'Local State'), '{"browser":{"enabled_labs_experiments":[]}}', 'utf8');
  const status = profileStatus(policy, 'target.example');
  assert.equal(status.exists, true);
  assert.equal(status.likelyAuthenticated, true);
  assert.equal(status.artifacts.some((artifact) => artifact.kind === 'chromeCookies' && artifact.bytes > 0), true);
  assert.equal(JSON.stringify(status).includes('cookie-db-placeholder'), false);
});

test('profile status stays read-only for missing profiles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-profile-status-missing-'));
  const policy = {
    source: '/tmp/policy.json',
    profileDir: dir
  };
  const status = profileStatus(policy, 'missing');
  assert.equal(status.exists, false);
  assert.equal(status.likelyAuthenticated, false);
  assert.equal(fs.existsSync(status.profilePath), false);
});

test('target pack scaffold writes policy, recipes, and commands under output dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example,https://auth.target.example',
    loginUrl: 'https://auth.target.example/login',
    pageUrl: 'https://target.example/dashboard',
    query: 'target docs'
  });
  const policy = JSON.parse(fs.readFileSync(pack.policy, 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(pack.metadata, 'utf8'));
  const outline = JSON.parse(fs.readFileSync(pack.recipes.outline, 'utf8'));
  const observe = JSON.parse(fs.readFileSync(pack.recipes.observe, 'utf8'));
  const inspect = JSON.parse(fs.readFileSync(pack.recipes.inspect, 'utf8'));
  const analyze = JSON.parse(fs.readFileSync(pack.recipes.analyze, 'utf8'));
  const operate = JSON.parse(fs.readFileSync(pack.recipes.operate, 'utf8'));
  const diagnose = JSON.parse(fs.readFileSync(pack.recipes.diagnose, 'utf8'));
  const screenshot = JSON.parse(fs.readFileSync(pack.recipes.screenshot, 'utf8'));
  const crawl = JSON.parse(fs.readFileSync(pack.recipes.crawl, 'utf8'));
  const links = JSON.parse(fs.readFileSync(pack.recipes.links, 'utf8'));
  assert.deepEqual(policy.allowedOrigins, ['https://target.example', 'https://auth.target.example', 'https://html.duckduckgo.com']);
  assert.equal(metadata.loginUrl, 'https://auth.target.example/login');
  assert.equal(metadata.searchProvider, 'duckduckgo');
  assert.equal(metadata.profile, 'target.example');
  assert.equal(policy.defaultProfile, 'target.example');
  assert.equal(policy.outputDir, 'target.example/outputs');
  assert.equal(observe.steps[0].type, 'observe');
  assert.equal(inspect.steps[0].type, 'inspect');
  assert.equal(analyze.steps[0].type, 'inspect');
  assert.deepEqual(operate.steps.map((step) => step.type), ['observe', 'inspect']);
  assert.deepEqual(diagnose.steps.map((step) => step.type), ['observe', 'console', 'screenshot']);
  assert.equal(diagnose.steps[2].out, 'diagnose.png');
  assert.equal(screenshot.steps[0].type, 'screenshot');
  assert.equal(screenshot.steps[0].out, 'page.png');
  assert.deepEqual(crawl.urls, ['https://target.example/dashboard']);
  assert.deepEqual(crawl.steps.map((step) => step.type), ['observe', 'extract']);
  assert.equal(outline.url, 'https://target.example/dashboard');
  assert.equal(links.steps[0].as, 'links');
  assert.match(fs.readFileSync(path.join(pack.dir, 'README.md'), 'utf8'), /login-cdp https:\/\/auth\.target\.example\/login/);
});

test('target-run resolves pack recipes and output defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-run-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const outline = resolveTargetRun(pack.dir, 'outline');
  const observe = resolveTargetRun(pack.dir, 'observe');
  const inspect = resolveTargetRun(pack.dir, 'inspect');
  const analyze = resolveTargetRun(pack.dir, 'analyze');
  const operate = resolveTargetRun(pack.dir, 'operate');
  const diagnose = resolveTargetRun(pack.dir, 'diagnose');
  const screenshot = resolveTargetRun(pack.dir, 'screenshot');
  const crawl = resolveTargetRun(pack.dir, 'crawl');
  const crawlLinks = resolveTargetRun(pack.dir, 'crawl-links');
  const links = resolveTargetRun(pack.dir, 'links');
  assert.equal(outline.profile, 'target.example');
  assert.equal(observe.out, 'observe.json');
  assert.equal(inspect.out, 'inspect.json');
  assert.equal(analyze.out, 'analyze.json');
  assert.match(analyze.recipe, /recipes\/analyze\.json$/);
  assert.equal(operate.out, 'operate.json');
  assert.match(operate.recipe, /recipes\/operate\.json$/);
  assert.equal(diagnose.out, 'diagnose.json');
  assert.equal(screenshot.out, 'screenshot.json');
  assert.equal(crawl.out, 'crawl.json');
  assert.equal(crawlLinks.out, 'crawl-links.csv');
  assert.equal(crawlLinks.format, 'csv');
  assert.equal(crawlLinks.result, 'pages[].results.links');
  assert.equal(outline.out, 'outline.json');
  assert.equal(outline.format, 'json');
  assert.equal(links.out, 'links.csv');
  assert.equal(links.format, 'csv');
  assert.equal(links.result, 'links');
});

test('target-run-status summarizes saved outputs without page text or rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-run-status-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const outputs = path.join(pack.dir, 'outputs');
  fs.mkdirSync(outputs, { recursive: true });
  fs.writeFileSync(path.join(outputs, 'operate.json'), `${JSON.stringify({
    ok: true,
    url: 'https://target.example/dashboard',
    steps: [
      { type: 'observe', as: 'before', output: { textSample: 'Do not return this text' } },
      { type: 'wait-for', as: 'ready', output: { ok: true, state: { title: 'Do not return title' } } }
    ],
    results: {
      before: { title: 'Do not return title', counts: { links: 3 }, controls: [{ name: 'secretish' }] },
      ready: { ok: true, state: { title: 'Do not return title' } }
    }
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputs, 'links.csv'), '\uFEFFtext,href\nHidden,/hidden\n', 'utf8');
  fs.writeFileSync(path.join(outputs, 'scrape.csv'), '\uFEFFtext,href\nHidden,/hidden\n', 'utf8');

  const operate = buildTargetRunStatus(pack.dir, 'operate');
  assert.equal(operate.exists, true);
  assert.equal(operate.parseOk, true);
  assert.equal(operate.ok, true);
  assert.deepEqual(operate.stepTypes, ['observe', 'wait-for']);
  assert.deepEqual(operate.resultKeys, ['before', 'ready']);
  const compact = formatTargetRunStatusCompact(operate);
  assert.match(compact, /^step_types: observe,wait-for$/m);
  assert.match(compact, /^result_keys: before,ready$/m);
  assert.doesNotMatch(compact, /Do not return/);
  assert.equal(operate.pageTextReturned, false);
  assert.equal(operate.rowDataReturned, false);

  const links = buildTargetRunStatus(pack.dir, 'links');
  assert.equal(links.format, 'csv');
  assert.equal(links.rowCount, 1);
  assert.equal(links.columnCount, 2);
  const scrape = buildTargetRunStatus(pack.dir, 'scrape');
  assert.equal(scrape.output, 'scrape.csv');
  assert.equal(scrape.format, 'csv');
  assert.equal(scrape.rowCount, 1);
  assert.match(scrape.commands.refresh.shell, /target-scrape/);
});

test('target-scrape resolves page url and csv defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-scrape-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const scrape = resolveTargetScrape(pack.dir);
  assert.equal(scrape.profile, 'target.example');
  assert.equal(scrape.url, 'https://target.example/dashboard');
  assert.equal(scrape.out, 'scrape.csv');
  assert.equal(scrape.format, 'csv');
  assert.equal(scrape.result, 'rows');
});

test('target-daemon resolves pack profile and default start url', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-daemon-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const start = resolveTargetDaemon(pack.dir, 'start');
  const status = resolveTargetDaemon(pack.dir);
  assert.equal(start.action, 'start');
  assert.equal(start.profile, 'target.example');
  assert.equal(start.initialUrl, 'https://target.example/dashboard');
  assert.equal(status.action, 'status');
  assert.throws(() => resolveTargetDaemon(pack.dir, 'restart'), /unsupported target-daemon action/);
});

test('target-autostart plans, writes, and removes a LaunchAgent plist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-autostart-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const plan = resolveTargetAutostart(pack.dir, 'write', {
    interval: '60',
    uid: '501',
    installPath: path.join(dir, 'LaunchAgents', 'local.secure-browser-agent.target.example.plist'),
    nodePath: '/usr/local/bin/node',
    cliPath: '/app/src/cli.mjs'
  });
  assert.equal(plan.label, 'local.secure-browser-agent.target.example');
  assert.equal(plan.profile, 'target.example');
  assert.equal(plan.initialUrl, 'https://target.example/dashboard');
  assert.equal(plan.interval, 60);
  assert.equal(plan.domain, 'gui/501');
  assert.equal(plan.serviceTarget, 'gui/501/local.secure-browser-agent.target.example');
  assert.deepEqual(plan.bootstrapCommand, ['launchctl', 'bootstrap', 'gui/501', plan.installPath]);
  assert.deepEqual(plan.bootoutCommand, ['launchctl', 'bootout', plan.serviceTarget]);
  assert.ok(plan.programArguments.includes('target-daemon'));
  assert.ok(plan.programArguments.includes('--url'));
  assert.match(plan.plist, /<key>RunAtLoad<\/key>/);
  assert.match(plan.plist, /<integer>60<\/integer>/);

  const written = writeTargetAutostart(plan);
  assert.equal(written.exists, true);
  assert.equal(fs.existsSync(plan.plistPath), true);
  assert.match(fs.readFileSync(plan.plistPath, 'utf8'), /local\.secure-browser-agent\.target\.example/);

  const removed = removeTargetAutostart(resolveTargetAutostart(pack.dir, 'remove', {
    interval: '60',
    nodePath: '/usr/local/bin/node',
    cliPath: '/app/src/cli.mjs'
  }));
  assert.equal(removed.existed, true);
  assert.equal(fs.existsSync(plan.plistPath), false);
  assert.throws(() => resolveTargetAutostart(pack.dir, 'enable'), /unsupported target-autostart action/);
});

test('target-autostart loads, unloads, and reports launchctl status with injectable runner', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-autostart-launchctl-'));
  const installPath = path.join(dir, 'LaunchAgents', 'local.secure-browser-agent.target.example.plist');
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const calls = [];
  const runner = (command, args) => {
    calls.push([command, ...args]);
    return { status: 0, stdout: 'loaded', stderr: '' };
  };
  const plan = resolveTargetAutostart(pack.dir, 'load', {
    interval: '60',
    uid: '501',
    installPath,
    nodePath: '/usr/local/bin/node',
    cliPath: '/app/src/cli.mjs'
  });

  const loaded = loadTargetAutostart(plan, { runner });
  assert.equal(loaded.loaded, true);
  assert.equal(loaded.installed, true);
  assert.equal(fs.existsSync(installPath), true);
  assert.deepEqual(calls[0], ['launchctl', 'bootstrap', 'gui/501', installPath]);

  const status = targetAutostartStatus(plan, { runner });
  assert.equal(status.loaded, true);
  assert.deepEqual(calls[1], ['launchctl', 'print', 'gui/501/local.secure-browser-agent.target.example']);

  const unloaded = unloadTargetAutostart(plan, { runner });
  assert.equal(unloaded.loaded, false);
  assert.deepEqual(calls[2], ['launchctl', 'bootout', 'gui/501/local.secure-browser-agent.target.example']);
});

test('target-permissions plans, persists, applies, and reports Chrome profile settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-permissions-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard',
    permissions: 'clipboard,downloads'
  });
  const plan = resolveTargetPermissions(pack.dir, 'plan');
  assert.deepEqual(plan.allow, ['clipboard', 'downloads']);
  assert.deepEqual(plan.origins, ['https://target.example']);
  assert.equal(plan.entries.length, 2);
  assert.deepEqual(plan.entries.map((entry) => entry.chromeType).sort(), ['automatic_downloads', 'clipboard']);
  assert.equal(plan.entries[0].pattern, 'https://target.example:443,*');

  const set = resolveTargetPermissions(pack.dir, 'set', { allow: 'notifications', origin: 'https://target.example' });
  const persisted = writeTargetPermissions(set);
  assert.equal(persisted.changed, true);
  const metadata = JSON.parse(fs.readFileSync(pack.metadata, 'utf8'));
  assert.deepEqual(metadata.permissions.allow, ['notifications']);

  const apply = resolveTargetPermissions(pack.dir, 'apply');
  const profileDir = path.join(dir, 'profiles', 'target.example');
  const applied = applyTargetPermissions(apply, profileDir);
  assert.equal(applied.applied, 1);
  const prefs = JSON.parse(fs.readFileSync(applied.preferencesPath, 'utf8'));
  assert.equal(prefs.profile.content_settings.exceptions.notifications['https://target.example:443,*'].setting, 1);

  const status = targetPermissionStatus(apply, profileDir);
  assert.equal(status.preferencesExists, true);
  assert.equal(status.applied, 1);
  assert.equal(status.pending, 0);
  assert.throws(() => resolveTargetPermissions(pack.dir, 'plan', { allow: 'usb' }), /unsupported target permission/);
  assert.throws(() => resolveTargetPermissions(pack.dir, 'plan', { allow: 'clipboard', origin: 'https://evil.example' }), /blocked permission origin/);
});

test('target-add-url appends allowed crawl urls and deduplicates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-add-url-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const result = addTargetUrls(pack.dir, [
    'https://target.example/dashboard',
    'https://target.example/reports'
  ]);
  const crawl = JSON.parse(fs.readFileSync(pack.recipes.crawl, 'utf8'));
  assert.equal(result.beforeCount, 1);
  assert.equal(result.afterCount, 2);
  assert.deepEqual(result.added, ['https://target.example/reports']);
  assert.deepEqual(crawl.urls, ['https://target.example/dashboard', 'https://target.example/reports']);
});

test('target-add-url blocks urls outside target policy without writing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-add-url-block-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  assert.throws(
    () => addTargetUrls(pack.dir, ['https://evil.example/reports']),
    /blocked URL by target policy/
  );
  const crawl = JSON.parse(fs.readFileSync(pack.recipes.crawl, 'utf8'));
  assert.deepEqual(crawl.urls, ['https://target.example/dashboard']);
});

test('target-operate-add appends safe operation steps without printing inline values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-operate-add-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });

  const dryRun = addTargetOperateStep(pack.dir, 'fill', {
    selector: '#q',
    value: 'hello',
    as: 'fill_query',
    dryRun: true
  });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.added.value, '<inline-value-redacted>');
  assert.equal(dryRun.added.valueLength, 5);
  let operate = JSON.parse(fs.readFileSync(pack.recipes.operate, 'utf8'));
  assert.deepEqual(operate.steps.map((step) => step.type), ['observe', 'inspect']);

  const written = addTargetOperateStep(pack.dir, 'click', {
    selector: '#submit',
    as: 'submit'
  });
  assert.equal(written.afterCount, 3);
  operate = JSON.parse(fs.readFileSync(pack.recipes.operate, 'utf8'));
  assert.equal(operate.steps[2].type, 'click');
  assert.equal(operate.steps[2].selector, '#submit');
  assert.throws(
    () => addTargetOperateStep(pack.dir, 'fill', { selector: 'input[type=password]', value: 'secret' }),
    /use --value-env/
  );
});

test('target-info and target-login resolve metadata without credentials', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-login-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example,https://auth.target.example',
    loginUrl: 'https://auth.target.example/login',
    pageUrl: 'https://target.example/dashboard'
  });
  const info = resolveTargetPack(pack.dir);
  const login = resolveTargetLogin(pack.dir);
  assert.equal(info.metadata.target, 'target.example');
  assert.equal(login.profile, 'target.example');
  assert.equal(login.loginUrl, 'https://auth.target.example/login');
  assert.equal(login.policy, pack.policy);
  const handoff = targetLoginHandoff(pack.dir, { realExternal: true });
  assert.match(handoff.instructions.join('\n'), /Complete login/);
  assert.match(handoff.commands[0].shell, /target-proof-capture/);
  assert.match(handoff.commands[0].shell, /--real-external/);
  assert.match(handoff.commands[0].shell, /--run/);
  assert.match(handoff.commands[0].shell, /--wait-auth-status-out/);
  assert.match(handoff.commands[0].shell, /wait-auth-status\.json/);
});

test('target-doctor validates recipe URLs and search provider origins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-doctor-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard',
    searchProvider: 'brave'
  });
  const result = doctorTargetPack(pack.dir);
  assert.equal(result.ok, true);
  assert.ok(result.checks.some((item) => item.name === 'recipe.diagnose.json.recipe.url.allowed' && item.detail === 'https://target.example/dashboard'));
  assert.ok(result.checks.some((item) => item.name === 'recipe.inspect.json.recipe.url.allowed' && item.detail === 'https://target.example/dashboard'));
  assert.ok(result.checks.some((item) => item.name === 'recipe.analyze.json.recipe.url.allowed' && item.detail === 'https://target.example/dashboard'));
  assert.ok(result.checks.some((item) => item.name === 'recipe.screenshot.json.recipe.url.allowed' && item.detail === 'https://target.example/dashboard'));
  assert.ok(result.checks.some((item) => item.name === 'recipe.crawl.json.urls[0].allowed' && item.detail === 'https://target.example/dashboard'));
  assert.ok(result.checks.some((item) => item.name === 'recipe.search.json.steps[0].search.allowed' && item.detail === 'https://search.brave.com'));
});

test('target-audit reports secure pack boundaries without reading profile secrets', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-audit-'));
  const installPath = path.join(dir, 'LaunchAgents', 'local.secure-browser-agent.target.example.plist');
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const runner = () => ({ status: 113, stdout: '', stderr: 'service not found' });
  const audit = await auditTargetPack(pack.dir, { uid: '501', installPath, runner });
  assert.equal(audit.ok, true);
  assert.equal(audit.target, 'target.example');
  assert.equal(audit.profile.likelyAuthenticated, false);
  assert.equal(audit.permissions.pending, 0);
  assert.equal(audit.autostart.loaded, false);
  assert.deepEqual(audit.secrets.findings, []);
  assert.ok(audit.checks.some((item) => item.name === 'policy.profileDirScoped' && item.ok));
  assert.ok(audit.checks.some((item) => item.name === 'secrets.configFilesClean' && item.ok));
});

test('target-audit detects secret-like values in target pack config files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-pack-audit-secret-'));
  const pack = scaffoldTargetPack({
    outputDir: dir,
    redactKeys: ['cookie'],
    maxEvalBytes: 1234
  }, {
    name: 'target.example',
    origins: 'https://target.example',
    pageUrl: 'https://target.example/dashboard'
  });
  const metadata = JSON.parse(fs.readFileSync(pack.metadata, 'utf8'));
  metadata.apiKey = 'sk-testsecretvaluethatshouldbeflagged';
  fs.writeFileSync(pack.metadata, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  const findings = scanTargetPackForSecrets(pack.dir);
  assert.equal(findings.some((finding) => finding.rule === 'sensitive-json-key' && finding.path === '$.apiKey'), true);
  assert.equal(JSON.stringify(findings).includes('sk-testsecret'), false);
});

test('mcp tool list exposes target audit preflight', () => {
  const tools = listMcpTools();
  assert.equal(tools.some((tool) => tool.name === 'sba_target_audit'), true);
});

test('cdp backend outlines a data html page', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-cdp-'));
  const outline = await outlineWithCdp('data:text/html,<h1>CDP</h1><a href="/x">Link</a>', dir);
  assert.equal(outline.headings[0].text, 'CDP');
  assert.equal(outline.links[0].text, 'Link');
});

test('cdp daemon starts, reuses a dedicated profile, and stops', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-cdp-daemon-'));
  try {
    const started = await startCdpDaemon(dir);
    assert.equal(started.started, true);
    assert.equal(started.ok, true);
    assert.equal(fs.existsSync(started.metadataPath), true);

    const reused = await startCdpDaemon(dir);
    assert.equal(reused.reused, true);
    assert.equal(reused.pid, started.pid);

    const outline = await outlineWithCdp('data:text/html,<h1>Daemon</h1>', dir, { daemon: true });
    assert.equal(outline.headings[0].text, 'Daemon');

    const stopped = await stopCdpDaemon(dir);
    assert.equal(stopped.stopped, true);
    const after = await cdpDaemonStatus(dir);
    assert.equal(after.ok, false);
    assert.equal(after.metadataExists, false);
  } finally {
    await stopCdpDaemon(dir).catch(() => {});
  }
});

test('cdp version wait retries until DevTools HTTP endpoint is reachable', async () => {
  let attempts = 0;
  const server = http.createServer((request, response) => {
    attempts += 1;
    if (attempts === 1) {
      request.socket.destroy();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ Browser: 'Chrome/test' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const version = await cdpBackendTest.waitForCdpVersion(port, 2000);
    assert.equal(version.Browser, 'Chrome/test');
    assert.equal(attempts >= 2, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('cdp profile opener leaves a reachable headed login browser', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-cdp-open-'));
  const opened = await openCdpProfile('about:blank', dir, { headed: true });
  try {
    assert.equal(opened.ok, true);
    assert.match(String(opened.port), /^\d+$/);
    const response = await fetch(`http://127.0.0.1:${opened.port}/json/version`);
    assert.equal(response.ok, true);
    const version = await response.json();
    assert.match(version.Browser || '', /Chrome/);
  } finally {
    try {
      process.kill(Number(opened.pid), 'SIGTERM');
    } catch {
      // Best-effort cleanup for the headed browser opened by this test.
    }
  }
});

test('cdp backend observes a compact data html page', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-observe-'));
  const observe = await observeWithCdp('data:text/html,<main><h1>CDP</h1><a href="/x">Link</a><label>Search<input name="q"></label></main>', dir);
  assert.equal(observe.headings[0].text, 'CDP');
  assert.equal(observe.counts.links, 1);
  assert.equal(observe.controls.some((control) => control.name === 'q'), true);
  assert.match(observe.textSample, /CDP/);
});

test('cdp backend analyzes page structure, diagnostics, and extractors in one run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-analyze-'));
  const page = 'data:text/html,<main><h1>Catalog</h1><script>console.log("ready")</script><ul><li class="item"><a href="/a">A</a><span>100</span></li><li class="item"><a href="/b">B</a><span>200</span></li></ul></main>';
  const analysis = await analyzeWithCdp(page, dir, { waitMs: 100 });
  assert.equal(analysis.ok, true);
  assert.equal(analysis.observe.headings[0].text, 'Catalog');
  assert.equal(analysis.inspect.candidates.some((candidate) => candidate.selector === 'li.item'), true);
  assert.equal(analysis.suggestedExtractors.some((item) => item.selector === 'li.item'), true);
  assert.equal(analysis.console.logs.some((entry) => entry.text.includes('ready')), true);
  assert.equal(typeof analysis.network.entries, 'number');
});

test('cdp backend scrapes with the first suggested extractor', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-scrape-'));
  const page = 'data:text/html,<main><h1>Catalog</h1><ul><li class="item"><a href="/a">A</a><span>100</span></li><li class="item"><a href="/b">B</a><span>200</span></li></ul></main>';
  const result = await scrapeWithCdp(page, dir, { fields: ['text', 'tag'] });
  assert.equal(result.ok, true);
  assert.equal(result.extractor.selector, 'li.item');
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((row) => row.text), ['A100', 'B200']);
  assert.equal(result.results.rows, result.rows);
});

test('cdp backend scrapes with a manually supplied selector', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-scrape-manual-'));
  const page = 'data:text/html,<main><a href="/a">A</a><a href="/b">B</a></main>';
  const result = await scrapeWithCdp(page, dir, { selector: 'a[href]', fields: ['text', 'href'], limit: 1 });
  assert.equal(result.extractor.kind, 'manual');
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], { index: 0, text: 'A', href: '/a' });
});

test('cdp backend inspects scraping candidates', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-inspect-'));
  const page = 'data:text/html,<main><h1>Catalog</h1><ul><li class="item"><a href="/a">A</a><span class="price">100</span></li><li class="item"><a href="/b">B</a><span class="price">200</span></li></ul></main>';
  const inspect = await inspectWithCdp(page, dir);
  assert.equal(inspect.title, '');
  assert.equal(inspect.links.count, 2);
  assert.equal(inspect.candidates.some((candidate) => candidate.selector === 'li.item' && candidate.count === 2), true);
});

test('cdp backend waits for delayed selector and text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-wait-'));
  const page = 'data:text/html,<main><h1>Wait</h1><script>setTimeout(()=>{const p=document.createElement("p");p.id="ready";p.textContent="Ready";document.body.appendChild(p)},50)</script></main>';
  const result = await waitForWithCdp(page, dir, { selector: '#ready', text: 'Ready', timeoutMs: 2000, pollMs: 50 });
  assert.equal(result.ok, true);
  assert.equal(result.state.selectorMatched, true);
  assert.equal(result.state.textMatched, true);
});

test('cdp backend fails when wait-for condition does not match', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-wait-fail-'));
  await assert.rejects(
    waitForWithCdp('data:text/html,<h1>Wait</h1>', dir, { selector: '#missing', timeoutMs: 150, pollMs: 50 }),
    /wait-for timed out/
  );
});

test('cdp backend captures console logs and exceptions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-console-'));
  const page = 'data:text/html,<script>console.log("hello", 42);console.error("bad");setTimeout(()=>{throw new Error("boom")},20)</script>';
  const result = await consoleSummaryWithCdp(page, dir, { waitMs: 150 });
  assert.equal(result.levels.log, 1);
  assert.equal(result.levels.error >= 1, true);
  assert.equal(result.logs.some((entry) => entry.text.includes('hello')), true);
  assert.equal(result.logs.some((entry) => entry.text.includes('boom')), true);
});

test('cdp backend captures a png screenshot', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-screenshot-'));
  const result = await screenshotWithCdp('data:text/html,<main style="background:white"><h1>Shot</h1></main>', dir);
  const buffer = Buffer.from(result.data, 'base64');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.bytes, buffer.length);
  assert.deepEqual(Array.from(buffer.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('cdp backend can click and observe post-action DOM', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-click-'));
  const page = 'data:text/html,<h1>Before</h1><button id="go" onclick="document.querySelector(&quot;h1&quot;).textContent=&quot;After&quot;">Go</button>';
  const result = await actionWithCdp(page, dir, { action: 'click', selector: '#go' });
  assert.equal(result.action.ok, true);
  assert.equal(result.outline.headings[0].text, 'After');
});

test('cdp recipe can fill, click, extract, and outline in one browser run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-recipe-'));
  const page = 'data:text/html,<h1>Before</h1><input id="q"><button id="go" onclick="setTimeout(()=>{document.querySelector(&quot;#result&quot;).textContent=document.querySelector(&quot;#q&quot;).value;document.querySelector(&quot;h1&quot;).textContent=&quot;After&quot;},50)">Go</button><p id="result"></p>';
  const result = await runRecipeWithCdp({
    url: page,
    steps: [
      { type: 'fill', selector: '#q', value: 'hello' },
      { type: 'click', selector: '#go' },
      { type: 'wait-for', selector: 'h1', text: 'After', timeoutMs: 2000, pollMs: 50, as: 'ready' },
      { type: 'console', waitMs: 50, as: 'logs' },
      { type: 'inspect', as: 'inspect' },
      { type: 'extract', selector: '#result', fields: ['text'], as: 'result' },
      { type: 'observe', as: 'compact' },
      { type: 'outline', as: 'page' }
    ]
  }, dir);
  assert.equal(result.ok, true);
  assert.equal(result.results.ready.ok, true);
  assert.equal(result.results.logs.entries, 0);
  assert.equal(result.results.inspect.links.count, 0);
  assert.equal(result.results.result[0].text, 'hello');
  assert.equal(result.results.compact.headings[0].text, 'After');
  assert.equal(result.results.page.headings[0].text, 'After');
});

test('cdp recipe blocks post-click navigation outside allowed origins', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-recipe-policy-nav-'));
  const page = 'data:text/html,<h1>Before</h1><button id="go" onclick="location.href=&quot;https://blocked.example/&quot;">Go</button>';
  await assert.rejects(
    () => runRecipeWithCdp({
      url: page,
      steps: [
        { type: 'click', selector: '#go' }
      ]
    }, dir, { allowedOrigins: ['data:'], afterActionMs: 100 }),
    /outside target policy/
  );
});

test('cdp recipe fill can read valueEnv without echoing the value', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-recipe-value-env-'));
  const page = 'data:text/html,<h1>Value</h1><input id="q"><p id="result"></p>';
  process.env.SBA_TEST_FILL_VALUE = 'env-fill-value';
  try {
    const result = await runRecipeWithCdp({
      url: page,
      steps: [
        { type: 'fill', selector: '#q', valueEnv: 'SBA_TEST_FILL_VALUE', as: 'fill_q' }
      ]
    }, dir);
    assert.equal(result.results.fill_q.ok, true);
    assert.equal(result.results.fill_q.value, undefined);
    assert.equal(result.results.fill_q.valueLength, 'env-fill-value'.length);
  } finally {
    delete process.env.SBA_TEST_FILL_VALUE;
  }
});

test('cdp transient retry is limited to local recipe URLs and socket-close errors', () => {
  assert.equal(cdpBackendTest.isCdpSocketClosedError(new Error('CDP socket closed')), true);
  assert.equal(cdpBackendTest.isCdpSocketClosedError(new Error('CDP socket is not open for Runtime.evaluate')), true);
  assert.equal(cdpBackendTest.isCdpSocketClosedError(new Error('selector not found')), false);

  assert.equal(cdpBackendTest.recipeCanRetryAfterTransientCdpClose({
    url: 'data:text/html,<h1>Local</h1>',
    steps: [
      { type: 'fill', selector: '#q' },
      { type: 'goto', url: 'about:blank' }
    ]
  }), true);
  assert.equal(cdpBackendTest.recipeCanRetryAfterTransientCdpClose({
    urls: ['data:text/html,<h1>One</h1>', 'about:blank']
  }), true);
  assert.equal(cdpBackendTest.recipeCanRetryAfterTransientCdpClose({
    url: 'https://example.com/',
    steps: [{ type: 'fill', selector: '#q' }]
  }), false);
  assert.equal(cdpBackendTest.recipeCanRetryAfterTransientCdpClose({
    url: 'data:text/html,<h1>Local</h1>',
    steps: [{ type: 'goto', url: 'https://example.com/' }]
  }), false);
});

test('cdp recipe can iterate urls in one browser session', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-recipe-urls-'));
  const first = 'data:text/html,<main><h1>First</h1><a href="/one">One</a></main>';
  const second = 'data:text/html,<main><h1>Second</h1><a href="/two">Two</a></main>';
  const result = await runRecipeWithCdp({
    urls: [first, second],
    steps: [
      { type: 'observe', as: 'page' },
      { type: 'extract', selector: 'a[href]', fields: ['text', 'href'], as: 'links' }
    ]
  }, dir);
  assert.equal(result.ok, true);
  assert.equal(result.pages.length, 2);
  assert.equal(result.results.pages[0].results.page.headings[0].text, 'First');
  assert.equal(result.results.pages[1].results.page.headings[0].text, 'Second');
  assert.equal(result.results.pages[1].results.links[0].href, '/two');
});

test('cdp recipe can persist a screenshot artifact without embedding image data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-recipe-shot-'));
  const result = await runRecipeWithCdp({
    url: 'data:text/html,<main style="background:white"><h1>Shot</h1></main>',
    steps: [
      { type: 'screenshot', out: 'artifacts/shot.png', as: 'shot' }
    ]
  }, path.join(dir, 'profile'), {
    artifactDir: dir,
    artifactManifest: true,
    artifactPolicy: '/tmp/policy.json'
  });
  const artifact = path.join(dir, 'artifacts/shot.png');
  const buffer = fs.readFileSync(artifact);
  const manifest = JSON.parse(fs.readFileSync(`${artifact}.manifest.json`, 'utf8'));
  assert.equal(result.results.shot.output, artifact);
  assert.equal(result.results.shot.data, undefined);
  assert.deepEqual(Array.from(buffer.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(manifest.policy, '/tmp/policy.json');
});

test('cdp recipe closes its transient Chrome profile after run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-recipe-cleanup-'));
  const result = await runRecipeWithCdp({
    url: 'data:text/html,<main><h1>Cleanup</h1></main>',
    steps: [{ type: 'observe', as: 'page' }]
  }, dir);
  assert.equal(result.ok, true);

  const ps = spawnSync('ps', ['-axo', 'command='], { encoding: 'utf8', timeout: 3000 });
  assert.equal(ps.status, 0);
  assert.equal(String(ps.stdout || '').includes(`--user-data-dir=${dir}`), false);
});

test('cdp recipe search-status marks challenge pages and result counts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-search-status-'));
  const page = 'data:text/html,<title>DuckDuckGo</title><form action="/anomaly.js"><input name="challenge"></form><a href="https://example.com">Result</a>';
  const result = await runRecipeWithCdp({
    url: page,
    provider: 'duckduckgo',
    query: 'example domain',
    steps: [
      { type: 'search-status', as: 'search_status' }
    ]
  }, dir);
  assert.equal(result.results.search_status.provider, 'duckduckgo');
  assert.equal(result.results.search_status.query, 'example domain');
  assert.equal(result.results.search_status.challenge, true);
  assert.equal(result.results.search_status.resultLinks, 1);
});

test('cdp recipe search-status can reuse a prior outline result', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-search-status-from-'));
  const page = 'data:text/html,<title>Search</title><a href="https://example.com">Result</a>';
  const result = await runRecipeWithCdp({
    url: page,
    steps: [
      { type: 'outline', as: 'search' },
      { type: 'search-status', from: 'search', provider: 'duckduckgo', query: 'example domain', as: 'search_status' }
    ]
  }, dir);
  assert.equal(result.results.search_status.provider, 'duckduckgo');
  assert.equal(result.results.search_status.challenge, false);
  assert.equal(result.results.search_status.resultLinks, 1);
});
