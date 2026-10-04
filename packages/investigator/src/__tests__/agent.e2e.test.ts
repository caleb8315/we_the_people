import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';
import { runInvestigation } from '../agent';
import type { InvestigationEvent } from '../schema';
import type { ResolvedModels } from '../model';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

const text = (t: string) => ({
  content: [{ type: 'text' as const, text: t }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage,
  warnings: [],
});

const toolCalls = (calls: Array<{ id: string; name: string; input: unknown }>) => ({
  content: calls.map((c) => ({ type: 'tool-call' as const, toolCallId: c.id, toolName: c.name, input: JSON.stringify(c.input) })),
  finishReason: { unified: 'tool-calls' as const, raw: undefined },
  usage,
  warnings: [],
});

const ARTICLE = `<html lang="en"><head><title>Fact Check: Video of Eiffel Tower fire is from a 2019 Lyon warehouse blaze</title>
<meta property="article:published_time" content="2026-10-02T09:00:00Z"></head><body><article>
<h1>Fact Check: Video of Eiffel Tower fire is from a 2019 Lyon warehouse blaze</h1>
${Array.from({ length: 6 }, () => '<p>Social media users shared a video claiming to show the Eiffel Tower on fire this week.</p>').join('')}
<p>The footage was first posted in June 2019 and shows a warehouse fire in Lyon, digitally altered to add the tower.</p>
<p>Paris fire services said there was no fire at the Eiffel Tower on October 1.</p>
</article></body></html>`;

const PLAN = {
  claim_summary: 'A video shows the Eiffel Tower on fire on October 1, 2026.',
  original_language: 'en',
  atomic_claims: [{ text: 'The Eiffel Tower caught fire on October 1, 2026.', type: 'event', places: ['Paris'], date_hint: '2026-10-01', physical: true }],
  regions: [{ country: 'FR', language: 'fr', why: 'Event location' }],
  search_queries: [{ language: 'fr', query: 'incendie tour Eiffel' }],
  physical_checks: ['fire detections near the Eiffel Tower on 2026-10-01'],
  competing_narratives: [],
};

const DRAFT = {
  headline_claim: 'A video shows the Eiffel Tower on fire on October 1, 2026.',
  verdict: 'false',
  confidence: 'high',
  confidence_reason: 'The video is traced to a 2019 event and local authorities deny any fire.',
  bottom_line: 'The video is old and altered [S1]. There was no fire at the Eiffel Tower [S1][S99].',
  is_it_fake: { answer: 'yes', explanation: 'Recycled 2019 footage, digitally altered.' },
  conspiracy: { level: 'none', traits: [], documented_real_conspiracy: false, explanation: 'A hoax, not a conspiracy theory.' },
  what_is_true: 'The footage shows a 2019 warehouse fire in Lyon [S1].',
  claims: [
    {
      text: 'The Eiffel Tower caught fire on October 1, 2026.',
      verdict: 'false',
      explanation: 'Authorities deny it and the video predates the claim.',
      citations: [
        { source_id: 'S1', quote: 'The footage was first posted in June 2019 and shows a warehouse fire in Lyon', stance: 'refutes' },
        { source_id: 'S1', quote: 'Paris fire services said there was no fire at the Eiffel Tower on October 1.', stance: 'refutes' },
        { source_id: 'S1', quote: 'Firefighters battled flames on the tower for hours', stance: 'supports' },
        { source_id: 'S42', quote: 'made up', stance: 'refutes' },
      ],
    },
  ],
  sides: [{ perspective: 'Viral social posts', countries: ['FR'], position: 'The tower burned.', framing_notes: 'Uses altered footage.', evidence_strength: 'none', source_ids: ['S1', 'S77'] }],
  origin: { earliest_source_id: 'S1', earliest_date: '2019-06-01', description: 'Footage first appeared in 2019.' },
  manipulation_techniques: [{ technique: 'Recycled old footage', explanation: '2019 video presented as new.', source_ids: ['S1'] }],
  physical_check_findings: [{ check_id: 'P1', result: 'inconsistent', interpretation: 'No thermal detections over central Paris.' }],
  open_questions: [],
};

describe('runInvestigation (mock model, stubbed network)', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('factcheck.example')) {
        return new Response(ARTICLE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('plans, researches with tools, verifies quotes and applies guardrails', async () => {
    const fast = new MockLanguageModelV4({ doGenerate: [text(JSON.stringify(PLAN))] });
    const main = new MockLanguageModelV4({
      doGenerate: [
        toolCalls([
          { id: 'c1', name: 'read_url', input: { url: 'https://factcheck.example/eiffel' } },
          { id: 'c2', name: 'fire_detections', input: { lat: 48.858, lon: 2.294, start_date: '2026-10-01', end_date: '2026-10-02', radius_km: 5, place: 'Eiffel Tower' } },
        ]),
        text('NOTES: The fact-check [S1] traces the video to 2019 Lyon. Fire check [P1] has no FIRMS key.'),
        text(JSON.stringify(DRAFT)),
      ],
    });
    const models: ResolvedModels = { main, fast, label: 'mock', gateway: null };
    const events: InvestigationEvent[] = [];

    const report = await runInvestigation(
      { kind: 'text', text: 'BREAKING: Eiffel Tower on fire tonight! Video!' },
      { models, env: { INVESTIGATOR_VISION: 'false' }, emit: (e) => events.push(e), budgetMs: 200_000 },
    );

    const phases = events.filter((e) => e.type === 'phase').map((e) => (e as { phase: string }).phase);
    assert.deepEqual(phases, ['intake', 'plan', 'research', 'synthesis', 'verification', 'done']);
    assert.ok(events.some((e) => e.type === 'tool_start' && e.tool === 'read_url'));
    assert.ok(events.some((e) => e.type === 'physical'));

    assert.equal(report.verdict, 'false');
    assert.equal(report.integrity.citations_checked, 4);
    assert.equal(report.integrity.citations_verified, 2);
    assert.equal(report.claims[0]!.citations.every((c) => c.stance === 'refutes'), true);
    assert.equal(report.confidence, 'medium', 'single independent outlet caps confidence');
    assert.ok(!report.bottom_line.includes('S99'));
    assert.deepEqual(report.sides[0]!.source_ids, ['S1']);
    assert.equal(report.sources[0]!.read_full_text, true);
    assert.equal(report.physical_checks[0]!.result, 'no_data', 'no detection is never a contradiction');
    assert.equal(report.physical_checks[0]!.imagery.length, 1);
    assert.ok(report.coverage.tools.some((t) => t.tool === 'read_url' && t.calls === 1));
  });
});
