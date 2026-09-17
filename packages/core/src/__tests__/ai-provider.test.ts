import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAiCompletion } from '../ai-provider';

describe('runAiCompletion', () => {
  it('returns skipped with no_providers_configured when every provider is missing a key', async () => {
    const result = await runAiCompletion({
      providers: [
        { provider: 'gemini', apiKey: undefined },
        { provider: 'groq', apiKey: undefined },
        { provider: 'xay', apiKey: undefined },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(result.text, null);
    assert.equal(result.provider, 'skipped');
    assert.equal(result.reason, 'no_providers_configured');
    assert.equal(result.attempts.length, 3);
    assert.ok(result.attempts.every((a) => !a.ok && a.error === 'no_api_key'));
  });

  it('records each provider attempt in order', async () => {
    const result = await runAiCompletion({
      providers: [
        { provider: 'gemini', apiKey: undefined },
        { provider: 'groq', apiKey: undefined },
        { provider: 'xay', apiKey: undefined },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(result.attempts[0]?.provider, 'gemini');
    assert.equal(result.attempts[1]?.provider, 'groq');
    assert.equal(result.attempts[2]?.provider, 'xay');
  });

  it('calls XAY through its OpenAI-compatible endpoint', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'gateway response' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    try {
      const result = await runAiCompletion({
        providers: [
          {
            provider: 'xay',
            apiKey: 'test-xay-key',
            model: 'gpt-4o-mini',
          },
        ],
        messages: [{ role: 'user', content: 'hello' }],
      });

      assert.equal(result.text, 'gateway response');
      assert.equal(result.provider, 'xay');
      const request = requests[0];
      assert.ok(request);
      assert.equal(request.url, 'https://api.xay.ai/v1/chat/completions');
      assert.equal(
        new Headers(request.init?.headers).get('authorization'),
        'Bearer test-xay-key',
      );
      const body = JSON.parse(String(request.init?.body));
      assert.equal(body.model, 'gpt-4o-mini');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
