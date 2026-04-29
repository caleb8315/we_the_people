import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAiCompletion } from '../ai-provider';

describe('runAiCompletion', () => {
  it('returns skipped with no_providers_configured when every provider is missing a key', async () => {
    const result = await runAiCompletion({
      providers: [
        { provider: 'gemini', apiKey: undefined },
        { provider: 'groq', apiKey: undefined },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(result.text, null);
    assert.equal(result.provider, 'skipped');
    assert.equal(result.reason, 'no_providers_configured');
    assert.equal(result.attempts.length, 2);
    assert.ok(result.attempts.every((a) => !a.ok && a.error === 'no_api_key'));
  });

  it('records each provider attempt in order', async () => {
    const result = await runAiCompletion({
      providers: [
        { provider: 'gemini', apiKey: undefined },
        { provider: 'groq', apiKey: undefined },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(result.attempts[0]?.provider, 'gemini');
    assert.equal(result.attempts[1]?.provider, 'groq');
  });
});
