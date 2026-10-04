# Deep investigation engine

`packages/investigator` turns Crosscheck from "search once and score" into an
investigator that answers three questions about any claim, in any language:

1. **Is it fake?** — verdict on a seven-point scale (true, mostly true, mixed,
   misleading, unproven, false, fabricated) with a confidence level.
2. **Is it a conspiracy theory?** — which conspiracy-theory traits are present,
   kept separate from real, documented conspiracies.
3. **What is actually true?** — a cited account of what the evidence
   establishes, every side's version, the physical evidence, and where the
   story started.

## Pipeline

```
intake ─▶ plan ─▶ research (tool loop) ─▶ synthesis ─▶ verification ─▶ report
```

| Stage | What happens |
| --- | --- |
| Intake | URLs are fetched and the article text extracted (Readability, charset-aware). |
| Plan | A fast model splits the submission into atomic claims, finds places/dates, and lists every country/language with a stake — including opposing sides. |
| Research | The main model runs a tool loop (up to `INVESTIGATOR_MAX_STEPS`, parallel calls per step) following the method in `src/prompts.ts`: prior fact-checks → global coverage → each side's local media in its own language → read sources in full → sensors/satellites → origin → science. |
| Synthesis | The model writes a structured report (`ReportDraftSchema`) from a dossier of every retrieved source and physical check. Citations must be verbatim quotes. |
| Verification | Every quote is checked against the stored source text (`src/citations.ts`); unverifiable quotes and unknown source ids are removed. Deterministic guardrails (`src/guardrails.ts`) then adjust verdict and confidence. |

Every source any tool touches goes into a **ledger** with a stable id (`S1`,
`S2`, …), an ownership label (state-controlled, state-funded, public
broadcaster, wire, fact-checker, official), country and language. The model can
only cite ledger ids, so a citation can never point at something the
investigation did not retrieve.

## Tools and data sources

| Tool | Data | Key needed |
| --- | --- | --- |
| `google_news_search` | Google News for any country edition + language; redirect links resolved to publisher URLs | — |
| `gdelt_search` | GDELT DOC 2.0: news in 65+ languages, machine-translated, filter by source country/language, oldest-first sort | — |
| `fact_check_search` | Google Fact Check Tools (ClaimReview from fact-checkers worldwide) | `GOOGLE_FACTCHECK_API_KEY` |
| `web_search` | Brave / Exa / Firecrawl (first configured) | one of them |
| `exa_search` | Exa via AI Gateway (provider-executed) | `AI_GATEWAY_API_KEY` |
| `read_url` | Full-text extraction; Firecrawl fallback for JS-heavy pages | — |
| `wikipedia_search` | Any language edition | — |
| `outlet_profile` | Curated ownership table + Wikidata (country, owner, type) | — |
| `scholarly_search` | OpenAlex (250M+ works) | — |
| `trace_origin` | GDELT earliest coverage + Internet Archive first capture | — |
| `geocode` | OpenStreetMap Nominatim, Open-Meteo fallback | — |
| `earthquakes` | USGS ComCat, any point/radius/window | — |
| `natural_events` | NASA EONET + GDACS (UN/EU disaster alerts) | — |
| `fire_detections` | NASA FIRMS VIIRS 375 m detections + GIBS true-colour overlay image | `FIRMS_MAP_KEY` for counts (image works without) |
| `weather_history` | Open-Meteo ERA5 reanalysis (1940–present) | — |
| `satellite_imagery` | Before/after: Sentinel-2 10 m (Microsoft Planetary Computer), NASA daily true colour, VIIRS night lights. Images are passed to the model to inspect. | — |

## Guardrails (deterministic)

- A claim (or the overall verdict) cannot be **true / mostly true** without at
  least one verified supporting quote from a non-state-controlled outlet.
- A claim cannot be **false / fabricated** without a verified refuting quote or
  a positive contradicting observation (e.g. imagery showing the structure intact).
- "No detection" from a sensor catalog is never treated as a contradiction.
- Confidence is capped at medium with fewer than two independent outlets, and
  set to low with fewer than two verified quotes; heavy quote removal also caps it.
- State-controlled media count as a perspective, never as corroboration.

## Running it

```bash
# one investigation in the terminal
npm run investigate --workspace packages/investigator -- "Dubai floods were caused by cloud seeding"
npm run investigate --workspace packages/investigator -- --url https://example.com/article

# live smoke test of every keyless tool (no model needed)
npm run smoke --workspace packages/investigator

# accuracy benchmark (22 labelled claims, 6 languages)
npm run eval --workspace packages/investigator -- --concurrency 2
```

The web app streams the same events from `POST /api/investigate` (NDJSON,
300 s budget) and renders them on `/verify` (Deep investigation mode).
Signed-in users' reports are stored in `public.investigations` (migration 035).

## Configuration

See `.env.example` → "Deep investigation engine". Minimum: one model key
(`AI_GATEWAY_API_KEY` recommended). Recommended extras: `FIRMS_MAP_KEY`,
`GOOGLE_FACTCHECK_API_KEY`, and one web search key (`BRAVE_SEARCH_API_KEY`,
`EXA_API_KEY` or `FIRECRAWL_API_KEY`).

## Known limits

- GDELT's free API covers roughly the last three months and rate-limits shared
  cloud IPs; the tool backs off and the agent falls back to Google News / web search.
- Sentinel-2 revisits every ~5 days and is blocked by cloud; VIIRS night lights
  vary with moonlight and snow. The model is instructed to say what imagery
  cannot show.
- Image/video forensics (reverse image search, deepfake detection) is not yet
  implemented.
