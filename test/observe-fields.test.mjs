import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { buildObserveScript, resolveObserveFields, selectObservedResult } from '../src/extract-script.mjs';
import { runRecipeWithCdp } from '../src/cdp-backend.mjs';

test('title-only observation reads only the document title', () => {
  const scope = { document: { title: 'Fixture', readyState: 'complete' } };
  const result = vm.runInNewContext(buildObserveScript({ fields: ['title'] }), scope);
  assert.deepEqual({ ...result }, { title: 'Fixture' });
  scope.document.readyState = 'loading';
  assert.throws(() => vm.runInNewContext(buildObserveScript({ fields: ['title'] }), scope), /observation unavailable/);
});

test('observation fields narrow policy and missing results stop the read', () => {
  const allowed = ['title', 'headings'];
  assert.deepEqual(resolveObserveFields(undefined, allowed), allowed);
  assert.deepEqual(resolveObserveFields(['title'], allowed), ['title']);
  assert.throws(() => resolveObserveFields(['links'], allowed), /outside policy/);
  for (const bad of [[], null, '', ['typo']]) assert.throws(() => resolveObserveFields(undefined, bad), /nonempty list/);
  for (const value of [{}, { title: null }, { title: {} }]) {
    assert.throws(() => selectObservedResult(value, ['title']), /unavailable/);
  }
  assert.throws(() => selectObservedResult({ counts: {} }, ['counts']), /unavailable/);
  assert.deepEqual(selectObservedResult({ headings: [], title: 'sample' }, ['headings']), { headings: [] });
});

test('recipe validates later observation fields before opening a browser or running prior steps', async () => {
  const recipe = { url: 'about:blank', steps: [{ type: 'outline' }, { type: 'observe', fields: ['links'] }] };
  await assert.rejects(() => runRecipeWithCdp(recipe, '', { observeFields: ['counts'] }), /outside policy/);
});
