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
