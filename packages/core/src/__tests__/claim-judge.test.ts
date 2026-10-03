import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJudgeMessages,
  judgeClaim,
  parseJudgment,
  selectJudgeEvidence,
  type JudgeEvidence,
} from '../claim-judge';
import type { AiCompletionOptions, AiCompletionResult } from '../ai-provider';
import type { EvidenceItem } from '../types';
import type { RankedSource } from '../source-ranking';

function source(i: number, partial: Partial<JudgeEvidence> = {}): JudgeEvidence {
  return {
    url: `https://outlet${i}.com/story`,
    domain: `outlet${i}.com`,
    title: `Story ${i}`,
    excerpt: `Excerpt ${i}`,
    published_at: '2026-10-01T00:00:00Z',
    is_credible: true,
    role: 'reporting',
    ...partial,
  };
}

const sources = [source(1), source(2), source(3), source(4)];
const meta = { provider: 'gemini', model: 'gemini-3.6-flash' };

describe('parseJudgment', () => {
  it('accepts a grounded yes and maps cited ids to source URLs', () => {
    const judgment = parseJudgment(
      JSON.stringify({
        answer: 'yes',
        basis: 'reported',
        headline: 'Yes — the senate passed the bill on Tuesday.',
        explanation: 'outlet1 and outlet2 both report the vote.',
        evidence: [
          { id: 1, stance: 'supports' },
          { id: 2, stance: 'supports' },
        ],
      }),
      sources,
      meta,
    );
    assert.ok(judgment);
    assert.equal(judgment.answer, 'yes');
    assert.deepEqual(
      judgment.evidence.map((e) => e.url),
      ['https://outlet1.com/story', 'https://outlet2.com/story'],
    );
  });

  it('rejects a yes that cites no supporting source', () => {
    const judgment = parseJudgment(
      JSON.stringify({
        answer: 'yes',
        basis: 'reported',
        headline: 'Yes — it happened.',
        explanation: '',
        evidence: [{ id: 1, stance: 'topic_only' }],
      }),
      sources,
      meta,
    );
    assert.equal(judgment, null);
  });

  it('ignores citations outside the list it was given', () => {
    const judgment = parseJudgment(
      JSON.stringify({
        answer: 'yes',
        basis: 'reported',
        headline: 'Yes — it happened.',
        explanation: '',
        evidence: [{ id: 9, stance: 'supports' }, { id: 0, stance: 'supports' }],
      }),
      sources,
      meta,
    );
    assert.equal(judgment, null);
  });

  it('accepts a decisive no for a claim that is not real', () => {
    const judgment = parseJudgment(
      '```json\n{"answer":"no","basis":"not_real","headline":"No — no policy can turn AI into superintelligence.","explanation":"Coverage describes AI executive orders only.","evidence":[{"id":1,"stance":"topic_only"}]}\n```',
      sources,
      meta,
    );
    assert.ok(judgment);
    assert.equal(judgment.answer, 'no');
    assert.equal(judgment.basis, 'not_real');
  });

  it('does not treat silence from a near-empty search as a denial', () => {
    const judgment = parseJudgment(
      JSON.stringify({
        answer: 'no',
        basis: 'not_reported',
        headline: 'No — nobody reports this.',
        explanation: '',
        evidence: [],
      }),
      sources.slice(0, 1),
      meta,
    );
    assert.ok(judgment);
    assert.equal(judgment.answer, 'unclear');
    assert.equal(judgment.basis, 'no_coverage');
    assert.doesNotMatch(judgment.headline, /^No\b/);
  });

  it('downgrades "contradicted" when no contradicting source is cited', () => {
    const judgment = parseJudgment(
      JSON.stringify({
        answer: 'no',
        basis: 'contradicted',
        headline: 'No — it did not happen.',
        explanation: '',
        evidence: [{ id: 1, stance: 'topic_only' }],
      }),
      sources,
      meta,
    );
    assert.equal(judgment?.basis, 'not_reported');
  });

  it('makes the headline lead with the answer', () => {
    const judgment = parseJudgment(
      JSON.stringify({
        answer: 'no',
        basis: 'not_real',
        headline: 'That is not something a president can do.',
        explanation: '',
        evidence: [],
      }),
      sources,
      meta,
    );
    assert.equal(judgment?.headline, 'No — that is not something a president can do.');
  });

  it('rejects hedges dressed up as answers and malformed replies', () => {
    assert.equal(
      parseJudgment(
        JSON.stringify({ answer: 'unclear', basis: 'not_reported', headline: 'Hard to say.', evidence: [] }),
        sources,
        meta,
      ),
      null,
    );
    assert.equal(parseJudgment('Partly true.', sources, meta), null);
    assert.equal(
      parseJudgment(JSON.stringify({ answer: 'partly', basis: 'reported', headline: 'x' }), sources, meta),
      null,
    );
  });
});

describe('buildJudgeMessages', () => {
  it('numbers sources and includes the date and claim', () => {
    const [system, user] = buildJudgeMessages({
      claim: 'Did X happen?',
      evidence: sources.slice(0, 2),
      now: new Date('2026-10-03T12:00:00Z'),
    });
    assert.equal(system?.role, 'system');
    assert.match(user!.content, /Today is 2026-10-03/);
    assert.match(user!.content, /Claim: Did X happen\?/);
    assert.match(user!.content, /\[1\] outlet1\.com \(credible, reporting\) 2026-10-01 — Story 1 :: Excerpt 1/);
    assert.match(user!.content, /\[2\] outlet2\.com/);
  });
});

describe('selectJudgeEvidence', () => {
  it('orders by rank, drops empty items, and caps the list', () => {
    const items: EvidenceItem[] = [1, 2, 3].map((i) => ({
      source_id: null,
      url: `https://s${i}.com/a`,
      domain: `s${i}.com`,
      title: i === 3 ? null : `Title ${i}`,
      excerpt: null,
      published_at: null,
      is_credible: true,
    }));
    const ranked = [
      { url: 'https://s2.com/a', rank: 1, role: 'primary' },
      { url: 'https://s1.com/a', rank: 2, role: 'reporting' },
    ] as unknown as RankedSource[];
    const selected = selectJudgeEvidence(items, ranked, 5);
    assert.deepEqual(selected.map((s) => s.domain), ['s2.com', 's1.com']);
    assert.equal(selected[0]?.role, 'primary');
    assert.equal(selectJudgeEvidence(items, ranked, 1).length, 1);
  });
});

describe('judgeClaim', () => {
  const valid = JSON.stringify({
    answer: 'yes',
    basis: 'reported',
    headline: 'Yes — it happened.',
    explanation: 'outlet1 reports it.',
    evidence: [{ id: 1, stance: 'supports' }],
  });

  function stub(replies: Array<string | null>) {
    const calls: AiCompletionOptions[] = [];
    const complete = async (opts: AiCompletionOptions): Promise<AiCompletionResult> => {
      calls.push(opts);
      const text = replies[calls.length - 1] ?? null;
      const provider = opts.providers[0]!.provider;
      return text
        ? { text, provider, model: 'm', attempts: [{ provider, ok: true, model: 'm' }] }
        : { text: null, provider: 'skipped', reason: 'all_providers_failed', attempts: [{ provider, ok: false, status: 404 }] };
    };
    return { calls, complete };
  }

  it('moves to the next provider when a reply fails validation', async () => {
    const { calls, complete } = stub(['Partly.', valid]);
    const result = await judgeClaim({
      claim: 'Did it happen?',
      evidence: sources,
      providers: [
        { provider: 'gemini', apiKey: 'a' },
        { provider: 'groq', apiKey: 'b' },
      ],
      complete,
    });
    assert.equal(calls.length, 2);
    assert.equal(result.judgment?.provider, 'groq');
    assert.ok(result.attempts.some((a) => a.error === 'invalid_judgment'));
  });

  it('skips providers without a key and reports when none are configured', async () => {
    const { calls, complete } = stub([valid]);
    const none = await judgeClaim({
      claim: 'Did it happen?',
      evidence: sources,
      providers: [{ provider: 'gemini', apiKey: undefined }],
      complete,
    });
    assert.equal(none.judgment, null);
    assert.equal(none.reason, 'no_providers_configured');
    assert.equal(calls.length, 0);
  });

  it('returns no judgment when every provider fails', async () => {
    const { complete } = stub([null, null]);
    const result = await judgeClaim({
      claim: 'Did it happen?',
      evidence: sources,
      providers: [
        { provider: 'gemini', apiKey: 'a' },
        { provider: 'groq', apiKey: 'b' },
      ],
      complete,
    });
    assert.equal(result.judgment, null);
    assert.equal(result.reason, 'all_providers_failed');
  });

  it('stops trying once the time budget is spent', async () => {
    const { calls, complete } = stub([valid]);
    const result = await judgeClaim({
      claim: 'Did it happen?',
      evidence: sources,
      providers: [{ provider: 'gemini', apiKey: 'a' }],
      budgetMs: 500,
      complete,
    });
    assert.equal(calls.length, 0);
    assert.equal(result.judgment, null);
  });
});
