import assert from 'node:assert/strict';
import test from 'node:test';
import { redact, redactText } from '../../src/security/redaction.js';

test('removes common token formats and secret-valued fields', () => {
  assert.equal(redactText('Authorization: Bearer abc.def.123456789'), 'Authorization: [REDACTED]');
  assert.deepEqual(redact({ apiKey: 'secret', nested: { password: 'hidden', safe: 'visible' } }), { apiKey: '[REDACTED]', nested: { password: '[REDACTED]', safe: 'visible' } });
});
