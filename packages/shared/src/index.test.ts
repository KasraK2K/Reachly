import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, renderTemplate, templateErrors, spintaxVariants } from './index.ts';

test('normalizeHandle', () => {
  assert.equal(normalizeHandle('@Some.User'), 'some.user');
  assert.equal(normalizeHandle(' https://www.instagram.com/some_user/?hl=en '), 'some_user');
  assert.equal(normalizeHandle('not a handle'), null);
  assert.equal(normalizeHandle(''), null);
});

test('merge fields with fallback and first_name', () => {
  const d = { name: 'Anna Kowal', handle: 'anna', niche: '' };
  assert.equal(renderTemplate('hi {{first_name}}, {{niche|your work}} rocks', d), 'hi Anna, your work rocks');
  assert.equal(renderTemplate('hey {{name}}', {}), 'hey');
});

test('spintax picks options, nested, deterministic with random', () => {
  assert.equal(renderTemplate('{hi|hey} there', {}, () => 0), 'hi there');
  assert.equal(renderTemplate('{hi|hey} there', {}, () => 0.99), 'hey there');
  assert.equal(renderTemplate('{a {x|y}|b}', {}, () => 0), 'a x');
});

test('lead data with braces is never parsed as spintax', () => {
  assert.equal(renderTemplate('yo {{name}}', { name: '{evil|x}' }), 'yo {evil|x}');
});

test('templateErrors', () => {
  assert.deepEqual(templateErrors('{hi|hey} {{name}}'), []);
  assert.ok(templateErrors('{{foo}}')[0].includes('Unknown'));
  assert.ok(templateErrors('{hi|hey').some((e) => e.includes('Unbalanced')));
  assert.ok(templateErrors('  ').length > 0);
});

test('spintaxVariants', () => {
  assert.equal(spintaxVariants('{a|b} {c|d|e}'), 6);
  assert.equal(spintaxVariants('plain {{name}}'), 1);
});
