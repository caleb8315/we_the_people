import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quoteAppearsIn, verifyCitations, scrubMarkers } from '../citations';
import { SourceLedger } from '../ledger';
import { applyGuardrails } from '../guardrails';
import { parseGoogleNewsRss, googleNewsLocale } from '../tools/news';
import { parseFirmsCsv, bboxAround, haversineKm, gibsSnapshotUrl } from '../tools/earth';
import { focusPassages, extractArticle } from '../tools/web';
import { harvestUrls } from '../agent';
import type { PhysicalCheck } from '../schema';

describe('quote verification', () => {
  const text =
    'The footage was first posted in 2019 during a fire at a warehouse in Lyon. It was not filmed in Paris this week, officials said.';

  it('accepts verbatim quotes regardless of case, quotes and spacing', () => {
    assert.ok(quoteAppearsIn('It was NOT filmed in   Paris this week', text));
    assert.ok(quoteAppearsIn('“first posted in 2019”', text));
  });

  it('accepts near-verbatim quotes and ellipsis fragments', () => {
    assert.ok(quoteAppearsIn('footage was first posted in 2019 during a fire at the warehouse in Lyon', text));
    assert.ok(quoteAppearsIn('The footage was first posted in 2019 … not filmed in Paris this week', text));
  });

  it('rejects paraphrases and invented quotes', () => {
    assert.ok(!quoteAppearsIn('Officials confirmed the Paris fire video is authentic', text));
    assert.ok(!quoteAppearsIn('The video shows the Eiffel Tower burning', text));
  });

  it('works for non-Latin scripts', () => {
    assert.ok(quoteAppearsIn('видео снято в 2019 году', 'Эксперты установили, что видео снято в 2019 году в Лионе.'));
    assert.ok(quoteAppearsIn('هذا الفيديو قديم', 'قال المسؤولون إن هذا الفيديو قديم وليس من باريس.'));
  });
});

describe('citation verification against the ledger', () => {
  const ledger = new SourceLedger();
  ledger.add({ url: 'https://www.reuters.com/fact-check/abc', title: 'Fact Check: Old video', text: 'The video is from 2019 and shows Lyon.', retrieved_via: 'test' });
  ledger.add({ url: 'https://www.rt.com/news/1', title: 'Paris burns', snippet: 'Huge fire engulfs Paris landmark', retrieved_via: 'test' });

  it('keeps real quotes, drops invented quotes and unknown ids', () => {
    const r = verifyCitations(
      [
        { source_id: 'S1', quote: 'The video is from 2019', stance: 'refutes' },
        { source_id: 'S1', quote: 'The video is genuine', stance: 'supports' },
        { source_id: 'S9', quote: 'anything', stance: 'supports' },
        { source_id: '[S2]', quote: 'Huge fire engulfs Paris landmark', stance: 'supports' },
      ],
      ledger,
    );
    assert.equal(r.kept.length, 2);
    assert.deepEqual(r.removed.map((x) => x.reason).sort(), ['quote_not_found', 'unknown_source']);
  });

  it('labels state-controlled outlets in the ledger', () => {
    assert.equal(ledger.get('S2')?.ownership, 'state_controlled');
    assert.equal(ledger.get('S1')?.ownership, 'wire');
  });

  it('scrubs markers for sources that do not exist', () => {
    assert.equal(scrubMarkers('It is old [S1]. Also [S7].', ledger), 'It is old [S1]. Also .');
  });

  it('dedupes by canonical URL and upgrades with full text', () => {
    const l = new SourceLedger();
    const a = l.add({ url: 'https://www.bbc.com/news/x?utm_source=tw', retrieved_via: 'search' });
    const b = l.add({ url: 'https://bbc.com/news/x', text: 'Full text', retrieved_via: 'read' });
    assert.equal(a.id, b.id);
    assert.equal(l.size, 1);
    assert.equal(l.get(a.id)?.read_full_text, true);
  });
});

describe('guardrails', () => {
  const ledger = new SourceLedger();
  ledger.add({ url: 'https://www.rt.com/a', text: 'x', retrieved_via: 't' }); // S1 state-controlled
  ledger.add({ url: 'https://apnews.com/a', text: 'x', retrieved_via: 't' }); // S2
  ledger.add({ url: 'https://www.bbc.com/a', text: 'x', retrieved_via: 't' }); // S3
  const noPhysical: PhysicalCheck[] = [];

  it('will not call a claim true on state-media support alone', () => {
    const g = applyGuardrails({
      verdict: 'true',
      confidence: 'high',
      claims: [{ text: 'c', verdict: 'true', explanation: '', citations: [{ source_id: 'S1', quote: 'x', stance: 'supports' }] }],
      physical: noPhysical,
      ledger,
      citationsChecked: 1,
      citationsRemoved: 0,
    });
    assert.equal(g.verdict, 'unproven');
    assert.equal(g.claims[0]!.verdict, 'unproven');
    assert.equal(g.confidence, 'low');
  });

  it('will not call a claim false without a verified refutation', () => {
    const g = applyGuardrails({
      verdict: 'false',
      confidence: 'high',
      claims: [{ text: 'c', verdict: 'false', explanation: '', citations: [{ source_id: 'S2', quote: 'x', stance: 'context' }] }],
      physical: noPhysical,
      ledger,
      citationsChecked: 1,
      citationsRemoved: 0,
    });
    assert.equal(g.verdict, 'unproven');
  });

  it('keeps a well-supported false verdict and caps confidence by independence', () => {
    const g = applyGuardrails({
      verdict: 'false',
      confidence: 'high',
      claims: [
        {
          text: 'c',
          verdict: 'false',
          explanation: '',
          citations: [
            { source_id: 'S2', quote: 'x', stance: 'refutes' },
            { source_id: 'S2', quote: 'y', stance: 'refutes' },
          ],
        },
      ],
      physical: noPhysical,
      ledger,
      citationsChecked: 2,
      citationsRemoved: 0,
    });
    assert.equal(g.verdict, 'false');
    assert.equal(g.confidence, 'medium');
  });

  it('never treats "no detection" from a sensor catalog as a contradiction', () => {
    const g = applyGuardrails({
      verdict: 'false',
      confidence: 'medium',
      claims: [{ text: 'c', verdict: 'false', explanation: '', citations: [] }],
      physical: [
        {
          id: 'P1',
          kind: 'fire_detection',
          place: 'X',
          lat: 0,
          lon: 0,
          window: null,
          data_sources: [],
          observation: 'none',
          hits: 0,
          imagery: [],
          result: 'inconsistent',
          interpretation: null,
        },
      ],
      ledger,
      citationsChecked: 0,
      citationsRemoved: 0,
    });
    assert.equal(g.physical[0]!.result, 'no_data');
    assert.equal(g.verdict, 'unproven');
  });
});

describe('tool parsers', () => {
  it('parses Google News RSS and strips the outlet suffix', () => {
    const xml = `<rss><channel><item><title>Пожежа у Києві - Українська правда</title><link>https://news.google.com/rss/articles/ABC?oc=5</link><pubDate>Sat, 03 Oct 2026 23:23:59 GMT</pubDate><source url="https://www.pravda.com.ua">Українська правда</source></item></channel></rss>`;
    const items = parseGoogleNewsRss(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.title, 'Пожежа у Києві');
    assert.equal(items[0]!.sourceUrl, 'https://www.pravda.com.ua');
  });

  it('builds Google News locales for regional variants', () => {
    assert.deepEqual(googleNewsLocale('pt', 'BR'), { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' });
    assert.deepEqual(googleNewsLocale('zh', 'TW'), { hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant' });
    assert.deepEqual(googleNewsLocale('en', 'ng'), { hl: 'en-NG', gl: 'NG', ceid: 'NG:en' });
  });

  it('parses FIRMS CSV', () => {
    const csv = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n34.07,-118.54,367.0,0.4,0.6,2025-01-08,0912,N,VIIRS,h,2.0NRT,290.1,45.2,N';
    const rows = parseFirmsCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.frp, 45.2);
    assert.equal(rows[0]!.date, '2025-01-08');
  });

  it('computes bounding boxes and distances', () => {
    const [w, s, e, n] = bboxAround(34, -118.5, 10);
    assert.ok(w < -118.5 && e > -118.5 && s < 34 && n > 34);
    assert.ok(Math.abs(haversineKm(48.8566, 2.3522, 51.5074, -0.1278) - 344) < 5);
    assert.match(gibsSnapshotUrl(['A'], '2025-01-08', [w, s, e, n]), /TIME=2025-01-08/);
  });

  it('extracts article text with Readability', () => {
    const body = Array.from({ length: 8 }, (_, i) => `<p>Paragraph ${i} about the warehouse fire in Lyon that spread overnight and was later filmed by residents.</p>`).join('');
    const html = `<html lang="fr"><head><title>Incendie à Lyon</title><meta property="article:published_time" content="2019-06-01T10:00:00Z"></head><body><nav>menu</nav><article><h1>Incendie à Lyon</h1>${body}</article></body></html>`;
    const a = extractArticle(html, 'https://example.fr/x');
    assert.ok(a);
    assert.equal(a!.lang, 'fr');
    assert.match(a!.text, /warehouse fire in Lyon/);
    assert.equal(a!.publishedTime, '2019-06-01T10:00:00Z');
  });

  it('focuses long articles on relevant passages', () => {
    const text = Array.from({ length: 50 }, (_, i) => (i === 40 ? 'The satellite image shows the bridge intact.' : `Filler paragraph number ${i} with nothing relevant.`)).join('\n');
    assert.match(focusPassages(text, 'bridge satellite', 400), /bridge intact/);
  });

  it('harvests urls from provider search payloads', () => {
    const hits = harvestUrls({ results: [{ url: 'https://a.com/x', title: 'A', highlights: ['one', 'two'] }, { nested: { url: 'https://b.com', text: 'B' } }] });
    assert.deepEqual(hits.map((h) => h.url), ['https://a.com/x', 'https://b.com']);
    assert.equal(hits[0]!.text, 'one … two');
  });
});
