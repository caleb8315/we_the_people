import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  RETIRED_MODEL_IDS,
  geminiSupportsSamplingParams,
  isRetiredModel,
  resolveModel,
  runAiCompletion,
} from '../ai-provider';

/** Capture outgoing requests without hitting the network. */
async function withStubbedFetch(
  respond: (url: string, init?: RequestInit) => Response,
  run: (requests: Array<{ url: string; init?: RequestInit }>) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return respond(String(input), init);
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

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
    await withStubbedFetch(
      () => okJson({ choices: [{ message: { content: 'gateway response' } }] }),
      async (requests) => {
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
      },
    );
  });

  it('substitutes the provider default when a caller asks for a shut-down model', async () => {
    await withStubbedFetch(
      () => okJson({ choices: [{ message: { content: 'ok' } }] }),
      async (requests) => {
        const result = await runAiCompletion({
          providers: [
            { provider: 'groq', apiKey: 'k', model: 'llama-3.3-70b-versatile' },
          ],
          messages: [{ role: 'user', content: 'hello' }],
        });

        assert.equal(result.text, 'ok');
        assert.equal(result.model, DEFAULT_GROQ_MODEL);
        const body = JSON.parse(String(requests[0]?.init?.body));
        assert.equal(body.model, DEFAULT_GROQ_MODEL);
      },
    );
  });

  it('substitutes the default for a retired Gemini model stored on a user profile', async () => {
    await withStubbedFetch(
      () => okJson({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      async (requests) => {
        const result = await runAiCompletion({
          providers: [{ provider: 'gemini', apiKey: 'k', model: 'gemini-2.0-flash' }],
          messages: [{ role: 'user', content: 'hello' }],
        });

        assert.equal(result.model, DEFAULT_GEMINI_MODEL);
        assert.ok(requests[0]?.url.includes(DEFAULT_GEMINI_MODEL));
        assert.ok(!requests[0]?.url.includes('gemini-2.0-flash'));
      },
    );
  });

  it('omits sampling parameters Gemini 3 no longer accepts', async () => {
    await withStubbedFetch(
      () => okJson({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      async (requests) => {
        await runAiCompletion({
          providers: [{ provider: 'gemini', apiKey: 'k', model: 'gemini-3.6-flash' }],
          messages: [{ role: 'user', content: 'hello' }],
          temperature: 0.7,
        });

        const body = JSON.parse(String(requests[0]?.init?.body));
        assert.equal(body.generationConfig.temperature, undefined);
        assert.equal(body.generationConfig.maxOutputTokens, 800);
      },
    );
  });

  it('keeps sampling parameters for pre-Gemini-3 models', async () => {
    await withStubbedFetch(
      () => okJson({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      async (requests) => {
        await runAiCompletion({
          providers: [{ provider: 'gemini', apiKey: 'k', model: 'gemini-2.5-flash' }],
          messages: [{ role: 'user', content: 'hello' }],
          temperature: 0.7,
        });

        const body = JSON.parse(String(requests[0]?.init?.body));
        assert.equal(body.generationConfig.temperature, 0.7);
      },
    );
  });

  it('records the HTTP status so a dead model is distinguishable from a bad key', async () => {
    await withStubbedFetch(
      () => new Response('model_decommissioned', { status: 404 }),
      async () => {
        const result = await runAiCompletion({
          providers: [{ provider: 'groq', apiKey: 'k' }],
          messages: [{ role: 'user', content: 'hello' }],
        });

        assert.equal(result.text, null);
        assert.equal(result.reason, 'all_providers_failed');
        assert.equal(result.attempts[0]?.status, 404);
        assert.equal(result.attempts[0]?.model, DEFAULT_GROQ_MODEL);
      },
    );
  });
});

describe('model deprecation guards', () => {
  it('does not default to any model the providers have shut down', () => {
    assert.equal(isRetiredModel(DEFAULT_GEMINI_MODEL), false);
    assert.equal(isRetiredModel(DEFAULT_GROQ_MODEL), false);
  });

  it('knows the IDs that were shut down in 2026', () => {
    assert.ok(RETIRED_MODEL_IDS.has('gemini-2.0-flash'));
    assert.ok(RETIRED_MODEL_IDS.has('llama-3.3-70b-versatile'));
    assert.equal(isRetiredModel('gemini-3.6-flash'), false);
    assert.equal(isRetiredModel(undefined), false);
  });

  it('resolves an unset or retired model to the provider default', () => {
    assert.equal(resolveModel('gemini', undefined), DEFAULT_GEMINI_MODEL);
    assert.equal(resolveModel('gemini', 'gemini-2.0-flash'), DEFAULT_GEMINI_MODEL);
    assert.equal(resolveModel('groq', 'llama-3.3-70b-versatile'), DEFAULT_GROQ_MODEL);
    assert.equal(resolveModel('groq', 'openai/gpt-oss-20b'), 'openai/gpt-oss-20b');
  });

  it('treats Gemini 3 and later as not accepting sampling parameters', () => {
    assert.equal(geminiSupportsSamplingParams('gemini-2.5-flash'), true);
    assert.equal(geminiSupportsSamplingParams('gemini-3.6-flash'), false);
    assert.equal(geminiSupportsSamplingParams('gemini-3.8-flash'), false);
  });
});
