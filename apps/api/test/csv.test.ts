import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell } from '../src/analytics.controller';

test('csvCell quotes, escapes and defuses formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-1+1'), "'-1+1");
  assert.equal(csvCell(['a', 'b']), '"a, b"');
  assert.equal(csvCell(new Date('2026-01-02T03:04:05Z')), '2026-01-02T03:04:05.000Z');
});
