import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRunsPath, shellQuote } from '../src/output.mjs';

const rootDir = path.resolve('/tmp/sba-root');
const runsRoot = path.join(rootDir, 'runs');

test('resolveRunsPath keeps paths under runs and falls back when none is given', () => {
  assert.equal(resolveRunsPath(rootDir, 'operator/x.json', 'unused.json', 'x path'), path.join(runsRoot, 'operator/x.json'));
  assert.equal(resolveRunsPath(rootDir, '', 'operator/default.json', 'x path'), path.join(runsRoot, 'operator/default.json'));
  assert.equal(resolveRunsPath(rootDir, '/operator/abs.json', '', 'x path'), path.join(runsRoot, 'operator/abs.json'));
  assert.equal(resolveRunsPath(rootDir, 'a/../b.json', '', 'x path'), path.join(runsRoot, 'b.json'));
  assert.equal(resolveRunsPath(rootDir, '', '', 'x path'), runsRoot);
});

test('resolveRunsPath refuses paths that escape runs with the caller label', () => {
  assert.throws(() => resolveRunsPath(rootDir, '../secret.json', 'd.json', 'demo output path'), { message: 'invalid demo output path: ../secret.json' });
  assert.throws(() => resolveRunsPath(rootDir, 'a/../../x', 'd.json', 'demo output path'), /invalid demo output path/);
  assert.throws(() => resolveRunsPath(rootDir, '../runs-other/x', 'd.json', 'demo output path'), /invalid demo output path/);
  assert.throws(() => resolveRunsPath(rootDir, undefined, '../escape', 'demo output path'), { message: 'invalid demo output path: undefined' });
});

test('shellQuote wraps values in single quotes and escapes embedded quotes', () => {
  assert.equal(shellQuote('plain'), "'plain'");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
  assert.equal(shellQuote('$(rm -rf /) `x`'), "'$(rm -rf /) `x`'");
  assert.equal(shellQuote(42), "'42'");
});
