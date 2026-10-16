import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handlesFromBooking } from '../src/integrations.controller';

test('handlesFromBooking reads utm_content and form answers', () => {
  assert.deepEqual(
    handlesFromBooking({
      tracking: { utm_content: 'jane.doe', utm_source: 'ig' },
      questions_and_answers: [{ answer: '@Jane.Doe' }, { answer: 'https://instagram.com/other_one/' }, { answer: 'not a handle!' }],
    }),
    ['jane.doe', 'other_one'],
  );
  assert.deepEqual(handlesFromBooking(undefined), []);
});
