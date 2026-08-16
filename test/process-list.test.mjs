import test from 'node:test';
import assert from 'node:assert/strict';
import { listProcesses, listProcessCommandLines } from '../src/process-list.mjs';

test('process listing succeeds on every supported platform', () => {
  const listing = listProcesses();
  // The point of this module is that it works where `ps` does not. A failure here on Windows
  // is the exact regression it was written to prevent.
  assert.equal(listing.ok, true, `listing failed: ${listing.reason}`);
  assert.equal(Array.isArray(listing.processes), true);
  assert.equal(listing.processes.length > 0, true);
});

test('process listing reports this process', () => {
  const listing = listProcesses();
  assert.equal(listing.processes.some((item) => item.pid === process.pid), true);
});

test('every row carries a numeric pid and a command', () => {
  const listing = listProcesses();
  for (const item of listing.processes.slice(0, 50)) {
    assert.equal(Number.isInteger(item.pid), true);
    assert.equal(item.pid > 0, true);
    assert.equal(typeof item.command, 'string');
  }
});

test('command lines view keeps the ok flag so callers cannot read failure as emptiness', () => {
  const lines = listProcessCommandLines();
  assert.equal(lines.ok, true);
  assert.equal(typeof lines.text, 'string');
  assert.match(lines.text, new RegExp(`(^|\\n)${process.pid} `));
});
