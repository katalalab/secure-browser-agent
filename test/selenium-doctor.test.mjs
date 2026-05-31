import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSeleniumDoctor, formatSeleniumDoctorCompact, formatSeleniumDoctorMarkdown } from '../src/selenium-doctor.mjs';

function makeExecutable(filePath, body = '#!/bin/sh\necho "ok"\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
  fs.chmodSync(filePath, 0o755);
}

test('selenium doctor reports missing webdriver package and optional drivers', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-selenium-missing-'));
  const report = buildSeleniumDoctor({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    env: { PATH: '' }
  });
  assert.equal(report.readyForLocalSmoke, false);
  assert.equal(report.package.exists, false);
  assert.equal(report.checks.find((item) => item.name === 'package.selenium-webdriver').status, 'missing');
  assert.equal(report.checks.find((item) => item.name === 'driver.geckodriver').status, 'optional');
  assert.match(report.installCommands.join('\n'), /npm install --save-dev selenium-webdriver/);
  assert.equal(report.installPlanRequiresOperatorApproval, true);
  assert.equal(report.installPlanAgentMayRunUnattended, false);
  assert.equal(report.installPlanMutatesRuntime, true);
  assert.equal(report.smokeRequiresOperatorApproval, false);
  assert.equal(report.smokeAgentMayRunUnattended, true);
  assert.equal(report.smokeStartsBrowser, false);
  const compact = formatSeleniumDoctorCompact(report);
  assert.match(compact, /^role: compatibility-bridge$/m);
  assert.match(compact, /^ready_for_local_smoke: no$/m);
  assert.match(compact, /^selenium_webdriver_present: no$/m);
  assert.match(compact, /^chromedriver_present: no$/m);
  assert.match(compact, /^install_requires_operator_approval: yes$/m);
  assert.match(compact, /^install_agent_may_run_unattended: no$/m);
  assert.match(compact, /^install_mutates_runtime: yes$/m);
  assert.match(compact, /^smoke_command: /m);
  assert.match(compact, /^smoke_requires_operator_approval: no$/m);
  assert.match(compact, /^smoke_agent_may_run_unattended: yes$/m);
  assert.match(compact, /^smoke_starts_browser: no$/m);
  assert.doesNotMatch(compact, /^\{/);
});

test('selenium doctor accepts local webdriver package and chromedriver', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-selenium-ready-'));
  const packageJson = path.join(rootDir, 'node_modules/selenium-webdriver/package.json');
  fs.mkdirSync(path.dirname(packageJson), { recursive: true });
  fs.writeFileSync(packageJson, JSON.stringify({ version: '4.99.0-test' }));
  const binDir = path.join(rootDir, 'bin');
  makeExecutable(path.join(binDir, 'chromedriver'), '#!/bin/sh\necho "ChromeDriver 149.0-test"\n');
  makeExecutable(path.join(binDir, 'node'), '#!/bin/sh\necho "v22.0.0-test"\n');
  makeExecutable(path.join(binDir, 'npm'), '#!/bin/sh\necho "11.0.0-test"\n');
  const report = buildSeleniumDoctor({
    rootDir,
    generatedAt: '2026-05-28T00:00:00.000Z',
    env: { PATH: binDir }
  });
  assert.equal(report.readyForLocalSmoke, true);
  assert.equal(report.localDriverReady, true);
  assert.equal(report.bidiCandidate, true);
  assert.equal(report.package.version, '4.99.0-test');
  assert.match(report.drivers.chromedriver.path, /chromedriver$/);
  const markdown = formatSeleniumDoctorMarkdown(report);
  assert.match(markdown, /Ready for local smoke: yes/);
  assert.match(markdown, /WebDriver BiDi candidate: yes/);
  const compact = formatSeleniumDoctorCompact(report);
  assert.match(compact, /^ready_for_local_smoke: yes$/m);
  assert.match(compact, /^local_driver_ready: yes$/m);
  assert.match(compact, /^bidi_candidate: yes$/m);
  assert.match(compact, /^selenium_webdriver_version: 4\.99\.0-test$/m);
});
