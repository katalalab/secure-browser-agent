import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStatusCache, formatStatusCacheCompact, readStatusCache, statusCachePath } from '../src/status-cache.mjs';

test('status cache writes and reports fresh cache hits without recomputing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-status-cache-'));
  try {
    let calls = 0;
    const builders = {
      probe: async () => {
        calls += 1;
        return { ok: true, count: calls };
      }
    };
    const written = await buildStatusCache(root, 'probe', builders, {
      write: true,
      generatedAt: '2026-06-01T00:00:00.000Z',
      nowMs: Date.parse('2026-06-01T00:00:00.000Z')
    });
    assert.equal(written.refreshed, true);
    assert.equal(calls, 1);
    assert.equal(fs.existsSync(statusCachePath(root, 'probe')), true);

    const cached = await buildStatusCache(root, 'probe', builders, {
      nowMs: Date.parse('2026-06-01T00:00:05.000Z'),
      staleAfterSeconds: 900
    });
    assert.equal(cached.cacheHit, true);
    assert.equal(cached.value.ok, true);
    assert.equal(calls, 1);
    assert.match(formatStatusCacheCompact(cached), /^cache_hit: yes$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('status cache marks stale and parse-broken entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-status-cache-bad-'));
  try {
    fs.mkdirSync(path.dirname(statusCachePath(root, 'bad')), { recursive: true });
    fs.writeFileSync(statusCachePath(root, 'bad'), '{not-json\n', 'utf8');
    const bad = readStatusCache(root, 'bad');
    assert.equal(bad.parseOk, false);
    assert.equal(bad.stale, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('non-object status cache entries miss and can be refreshed', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-status-cache-shape-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = statusCachePath(root, 'probe');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  for (const raw of ['null', '[]', '17', '"text"', '{"value":[]}', '{"value":null}']) {
    fs.writeFileSync(file, raw, 'utf8');
    const report = await buildStatusCache(root, 'probe');
    assert.equal(report.cacheHit, false, raw);
    assert.equal(report.cache.parseOk, false, raw);
    assert.equal(report.cache.stale, true, raw);
    assert.equal(report.value, null, raw);
  }

  fs.writeFileSync(file, 'null', 'utf8');
  const refreshed = await buildStatusCache(root, 'probe', { probe: () => ({ ok: true }) }, { write: true });
  assert.equal(refreshed.refreshed, true);
  assert.deepEqual(refreshed.cache.value, { ok: true });

  fs.writeFileSync(file, '{"ok":true}', 'utf8');
  const legacy = await buildStatusCache(root, 'probe');
  assert.equal(legacy.cacheHit, true);
  assert.deepEqual(legacy.value, { ok: true });
});

test('parse errors do not expose bytes from the cache', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sba-status-cache-parse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = statusCachePath(root, 'probe');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const marker = 'notjsonFixtureValue';
  fs.writeFileSync(file, marker, 'utf8');

  const report = await buildStatusCache(root, 'probe');

  assert.equal(report.cache.parseOk, false);
  assert.ok(report.cache.error);
  assert.ok(!JSON.stringify(report).includes(marker));
  assert.ok(!formatStatusCacheCompact(report).includes(marker));
});
