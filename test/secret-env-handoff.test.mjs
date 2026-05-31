import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSecretEnvHandoff, buildSecretEnvHandoffStatus, buildSecretEnvHandoffWatch, formatSecretEnvHandoffCompact, formatSecretEnvHandoffMarkdown, formatSecretEnvHandoffStatusCompact, formatSecretEnvHandoffWatchCompact } from '../src/secret-env-handoff.mjs';

function auditFixture(overrides = {}) {
  return {
    headlessReady: false,
    headlessConfigAvailable: false,
    recommendedHeadlessMode: 'not-configured',
    processes: {
      onePasswordMcp: 1
    },
    capabilities: {
      localEnvMountSupported: true,
      serviceAccountConfigured: false,
      connectConfigured: false,
      desktopIntegrationLikely: true,
      ...overrides.capabilities
    },
    ...overrides
  };
}

test('secret env handoff plans 1Password Environment approval without reading secrets', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-env-handoff-'));
  try {
    const handoff = buildSecretEnvHandoff({
      rootDir,
      generatedAt: '2026-05-29T00:00:00.000Z',
      audit: auditFixture(),
      environmentName: 'SBA Test'
    });

    assert.equal(handoff.safeMode, true);
    assert.equal(handoff.secretValuesRead, false);
    assert.equal(handoff.mutatesOnePasswordNow, false);
    assert.equal(handoff.mode, 'environment-local-env');
    assert.equal(handoff.ready, true);
    assert.equal(handoff.requiresOnePasswordApproval, true);
    assert.equal(handoff.commands.some((item) => item.id === 'mcp-authenticate'), true);
    assert.equal(handoff.commands.some((item) => item.id === 'mcp-create-environment' && item.mutatesOnePassword), true);
    assert.equal(JSON.stringify(handoff).includes('sk-'), false);
    const compact = formatSecretEnvHandoffCompact(handoff);
    assert.match(compact, /^mutates_onepassword_now: no$/m);
    assert.match(compact, /^requires_onepassword_approval: yes$/m);
    assert.match(compact, /^mcp_authenticate_tool: onepassword\.authenticate$/m);
    assert.match(formatSecretEnvHandoffMarkdown(handoff), /Secret Environment Handoff/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('secret env handoff writes only under runs and rejects invalid mode', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-env-handoff-write-'));
  try {
    const handoff = buildSecretEnvHandoff({
      rootDir,
      audit: auditFixture(),
      write: true,
      out: 'operator/secret-env.json'
    });
    assert.equal(handoff.outputPath, path.join(rootDir, 'runs/operator/secret-env.json'));
    assert.equal(JSON.parse(fs.readFileSync(handoff.outputPath, 'utf8')).secretValuesRead, false);

    assert.throws(
      () => buildSecretEnvHandoff({ rootDir, audit: auditFixture(), out: '../secret-env.json' }),
      /invalid secret env handoff output path/
    );
    assert.throws(
      () => buildSecretEnvHandoff({ rootDir, audit: auditFixture(), mode: 'bad' }),
      /invalid secret env handoff mode/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('secret env handoff status reads saved handoff without recomputing secrets', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-env-handoff-status-'));
  try {
    buildSecretEnvHandoff({
      rootDir,
      generatedAt: '2026-05-29T00:00:00.000Z',
      audit: auditFixture(),
      write: true,
      out: 'operator/secret-env.json'
    });
    const status = buildSecretEnvHandoffStatus({
      rootDir,
      in: 'operator/secret-env.json',
      staleAfterSeconds: 900
    });
    assert.equal(status.safeMode, true);
    assert.equal(status.statusOnly, true);
    assert.equal(status.secretValuesRead, false);
    assert.equal(status.opensBrowserNow, false);
    assert.equal(status.startsCaptureNow, false);
    assert.equal(status.readsBrowserStorage, false);
    assert.equal(status.exists, true);
    assert.equal(status.parseOk, true);
    assert.equal(status.mode, 'environment-local-env');
    assert.match(formatSecretEnvHandoffStatusCompact(status), /^refresh_command: 'node' 'src\/cli\.mjs' 'secret-env-handoff-watch'/m);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('secret env handoff watch refreshes missing saved handoff only when run is requested', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-env-handoff-watch-'));
  try {
    const planned = buildSecretEnvHandoffWatch({
      rootDir,
      audit: auditFixture()
    });
    assert.equal(planned.executed, false);
    assert.equal(planned.status, 'refresh-required');
    assert.equal(planned.blockedReason, 'run-not-requested');
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/secret-env-handoff.json')), false);

    const refreshed = buildSecretEnvHandoffWatch({
      rootDir,
      audit: auditFixture(),
      run: true
    });
    assert.equal(refreshed.executed, true);
    assert.equal(refreshed.status, 'refreshed');
    assert.equal(refreshed.secretValuesRead, false);
    assert.equal(refreshed.opensBrowserNow, false);
    assert.equal(fs.existsSync(path.join(rootDir, 'runs/operator/secret-env-handoff.json')), true);
    assert.match(formatSecretEnvHandoffWatchCompact(refreshed), /^after_stale: no$/m);

    const fresh = buildSecretEnvHandoffWatch({
      rootDir,
      audit: auditFixture(),
      run: true
    });
    assert.equal(fresh.executed, false);
    assert.equal(fresh.blockedReason, 'saved-secret-env-handoff-is-fresh');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('secret env handoff status and watch reject paths outside runs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-secret-env-handoff-path-'));
  try {
    assert.throws(
      () => buildSecretEnvHandoffStatus({ rootDir, in: '../secret-env.json' }),
      /invalid secret env handoff output path/
    );
    assert.throws(
      () => buildSecretEnvHandoffWatch({ rootDir, out: '../secret-env.json', run: true }),
      /invalid secret env handoff output path/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
