# AI trust platform plan

This plan expands Crosscheck into a stronger anti-propaganda, bias-resistant
news verification product by adding AI as an evidence assistant around the
existing verification core.

The goal is not to make AI the judge of truth. The goal is to help people
understand what is known, what is disputed, how reporting is framed, and where
to inspect the evidence.

This should be openly positioned as an AI-heavy product. Users should know that
Crosscheck uses a lot of AI to read, compare, summarize, and explain reporting,
while also knowing that the final trust signals come from evidence,
corroboration, source diversity, and stored contradictions rather than a model
making unsupported truth claims.

## Product principles

1. **Core verification stays authoritative.** `@osint/core` remains the source
   of truth for corroboration, reliability labels, confidence reports, source
   disagreement, and contradiction records.
2. **AI explains evidence; it does not replace evidence.** AI output must be
   grounded in stored signals, evidence rows, contradictions, source metadata,
   and briefings.
3. **No duplicate systems.** New AI features should extend existing modules and
   routes instead of creating parallel verdicts, parallel source scores, or
   separate verification logic.
4. **User-facing language must be understandable.** The product should talk like
   a careful analyst helping a normal person, not like a model, lawyer, or
   internal scoring engine.
5. **Every warning needs a path to learn more.** Short feed language should link
   to signal details, evidence, source lists, contradiction notes, or the trust
   methodology page.
6. **Be transparent that AI is used heavily.** The product should not hide AI
   usage. The trust page and AI surfaces should say when AI helped summarize,
   compare, translate, extract, or explain evidence.

## Current foundation

The codebase already has the right split between deterministic verification and
assistive AI:

- Deterministic verification and status wording:
  `packages/core/src/verification.ts`
- Confidence report contract:
  `packages/core/src/confidence.ts`
- Source disagreement and contradiction detection:
  `packages/core/src/contradictions.ts`
- Feed and signal UI:
  `apps/web/app/feed/page.tsx`,
  `apps/web/components/signal-card.tsx`,
  `apps/web/app/signal/[id]/page.tsx`
- AI chat:
  `apps/web/app/api/ai/chat/route.ts`
- On-demand briefings:
  `apps/web/app/api/briefings/generate/route.ts`
- Worker briefings and provider fallback:
  `apps/worker/src/jobs/brief.ts`,
  `apps/worker/src/lib/llm.ts`
- Image forensics:
  `apps/web/app/api/image-forensics/route.ts`

## Plain-language output contract

AI-assisted product copy should avoid internal labels as the primary message.
Users should first see a short, human explanation, then a "Learn more" path.

### Good output examples

- "A lot of independent reports support that this happened, but some headlines
  are framing the cause differently. Check the disputed details before sharing."
- "This story is still developing. Several sources report the event, but the
  numbers are changing and not all outlets agree."
- "Most reports agree on the event itself. Be careful with posts claiming a
  motive, because that part is not strongly supported yet."
- "This appears to come mostly from official statements so far. We have not
  found much independent local reporting yet."
- "Several articles repeat the same wire report. That is useful coverage, but it
  is not the same as many independent confirmations."

### Avoid

- "This is true."
- "This source is propaganda."
- "AI verified this."
- "This side is lying."
- "Confirmed motive" unless the evidence contract clearly supports that wording.

### Suggested UI pattern

Use a three-layer pattern across feed cards, signal pages, verify results, and
briefings:

1. **Plain summary:** one or two sentences.
2. **Why we say this:** source count, independent domains, contradictions,
   evidence type, and update timing.
3. **Learn more:** evidence list, source comparison, contradiction guide, and
   methodology.

## Architecture rule: strengthen the core, do not duplicate it

New AI work should plug into the existing pipeline like this:

```mermaid
flowchart TD
  adapters[Source adapters] --> ingest[Worker ingest]
  ingest --> core[@osint/core verification]
  core --> database[(Supabase)]
  database --> feed[Feed and signal pages]
  database --> aiLayer[AI evidence assistant]
  aiLayer --> explanations[Plain-language explanations]
  explanations --> feed
```

The AI layer may produce explanations, reading guides, structured extraction
candidates, summaries, and search helpers. It should not independently set
`verification_status`, overwrite confidence, or create a second truth score.

## AI capability roadmap

### 1. Shared AI provider layer

Consolidate Gemini/Groq/provider fallback behavior so web and worker paths do
not drift.

Targets:

- `apps/worker/src/lib/llm.ts`
- `apps/web/app/api/ai/chat/route.ts`
- `apps/web/app/api/briefings/generate/route.ts`
- `packages/core/src/budget.ts`

Requirements:

- Use legitimate provider keys and provider terms.
- Cache or reuse outputs where possible.
- Keep worker calls on `usage_ledger`.
- Keep user-triggered calls on per-user daily limits.
- Fail closed to deterministic output when AI is unavailable.

Free-tier setup:

- Use one legitimate Gemini account/project and one legitimate Groq account.
- Create two API keys per provider when the provider allows it: one primary key
  and one backup/rotation key.
- Do not create extra accounts to bypass free-tier limits. That risks account
  bans, unreliable service, and provider terms violations.
- Treat Groq and Gemini as backups for each other. If Gemini is unavailable or
  over budget, try Groq. If both are unavailable, fall back to deterministic
  summaries and existing confidence copy.
- Keep usage free by prioritizing caching, short prompts, per-user daily limits,
  worker budgets, and AI only where it adds real user value.

### 2. AI claim extraction candidates

Use AI to extract structured candidate claims from evidence:

- actor
- action
- location
- time
- casualty/count numbers
- quoted source
- evidence type
- attribution strength

The deterministic contradiction system remains the final stored comparison
engine. AI extraction should be additive and reviewable.

Targets:

- `packages/core/src/contradictions.ts`
- `apps/worker/src/jobs/ingest.ts`
- `apps/web/lib/develop-signal.ts`

User value:

- Better detection of "the event happened, but details differ."
- Clearer explanations of what is supported versus what is only claimed.

### 3. Framing and loaded-language analysis

Add an AI-assisted framing lens that identifies reporting behavior rather than
assigning partisan labels.

Detect:

- emotional or loaded headline language
- speculation presented as fact
- motive/cause claims with weak support
- omission of key context
- syndicated repetition
- article body not supporting the headline

User-facing examples:

- "The event is widely reported, but several headlines use stronger language
  than the evidence currently supports."
- "Sources agree on the explosion, but not on the cause."
- "The claim about motive appears in social posts and has limited support in
  primary reporting."

Targets:

- `packages/core/src/confidence.ts`
- `apps/web/components/signal-card.tsx`
- `apps/web/app/signal/[id]/page.tsx`

### 4. Cross-source comparison

For each signal, generate a source comparison that separates:

- what all sources agree on
- what only some sources claim
- what is disputed
- what changed over time
- which sources appear to be repeating the same original report

This should be shown first on signal detail pages, then summarized on feed cards.

Targets:

- `apps/web/app/signal/[id]/page.tsx`
- `apps/web/lib/contradictions-display.ts`
- `apps/web/components/signal-card.tsx`

### 5. Neutral timeline builder

Build timelines from evidence timestamps and source updates.

Example:

```text
10:14 UTC - First report appears from a local outlet.
10:32 UTC - Official statement confirms an incident.
11:05 UTC - Two outlets report different casualty numbers.
12:20 UTC - Updated statement changes the count.
```

Targets:

- `apps/web/app/signal/[id]/page.tsx`
- `apps/worker/src/jobs/brief.ts`

### 6. Dispute reading guide

When contradictions exist, AI can help users inspect them without deciding the
winner.

Example:

- "Start with the official statement and the local outlet report."
- "Compare the casualty count in sources A and B."
- "The cause is still disputed; avoid sharing posts that state it as settled."

Targets:

- `packages/core/src/contradictions.ts`
- `apps/web/app/signal/[id]/page.tsx`
- `apps/web/app/api/ai/chat/route.ts`

### 7. Citation-first summaries

Generate concise summaries where each sentence is grounded in evidence.

Rules:

- Every factual sentence must map to one or more evidence rows.
- Summaries must distinguish confirmed reporting from claims and disputes.
- Summaries must not introduce facts absent from the evidence set.
- If citation grounding fails, show deterministic copy instead.

Targets:

- `apps/worker/src/jobs/brief.ts`
- `apps/web/app/api/briefings/generate/route.ts`
- `apps/web/app/briefings/[id]/page.tsx`
- `apps/web/components/signal-card.tsx`

### 8. Natural-language feed search

Allow users to search in plain English, then map the request to existing feed
filters and ranked signals.

Examples:

- "Show me well-supported climate stories from the last 24 hours."
- "Find stories where sources disagree about casualty numbers."
- "Show global events with local reporting, not just wire copy."

Targets:

- `apps/web/app/feed/page.tsx`
- `apps/web/lib/signals.ts`
- new API route for structured query interpretation

### 9. Smarter analyst workspace

The existing AI workspace should become the place where users ask questions
about evidence, not a generic chatbot.

Useful prompts:

- "What is confirmed here?"
- "What is disputed?"
- "Which source is closest to the event?"
- "Is this headline supported by the article?"
- "What changed since the first report?"

Targets:

- `apps/web/components/ai-workspace.tsx`
- `apps/web/app/api/ai/chat/route.ts`
- `apps/web/app/dashboard/ai/page.tsx`

### 10. Source transparency assistant

Help users understand the source mix behind a story.

Examples:

- "This story mostly relies on official statements."
- "This story has local reporting and international wire coverage."
- "Muting this source may reduce coverage of weather alerts in your feed."

Targets:

- `apps/web/app/sources/page.tsx`
- `apps/web/app/dashboard/sources/page.tsx`
- `packages/core/src/source-catalog.ts`

### 11. Expanded image and social verification

Build on existing image forensics with AI-assisted context checks:

- visible text extraction
- caption/image mismatch warnings
- old-image or reused-image suspicion
- social post claim extraction
- comparison between image claims and article claims

Targets:

- `apps/web/lib/image-forensics.ts`
- `apps/web/app/api/image-forensics/route.ts`
- `apps/web/app/verify/page.tsx`

### 12. AI transparency in methodology

The trust page should clearly explain where AI is used and where it is not.

Add:

- AI does not decide verification status.
- AI summaries are evidence-bound.
- AI can make mistakes.
- Users can inspect sources directly.
- The platform prioritizes corroboration over outrage or virality.

Target:

- `apps/web/app/trust/page.tsx`

## Implementation sequence

### Phase 1: Make AI usage coherent

- Create or extract one shared provider abstraction for AI calls.
- Keep provider fallback, budgets, user limits, and deterministic fallback.
- Document which AI surfaces exist.

### Phase 2: Add plain-language trust explanations

- Add feed-card and signal-page copy using existing confidence,
  contradiction, and source fields.
- Add "Learn more" links to evidence and methodology.
- Add tests that prevent absolute truth claims.

### Phase 3: Add framing and dispute guidance

- Generate AI-assisted framing notes from stored evidence.
- Add contradiction reading guides on signal pages.
- Keep all notes labeled as assistant explanations.

### Phase 4: Improve AI briefings and analyst workspace

- Make briefings structured: what happened, what is supported, what is disputed,
  what changed, what to watch next.
- Let users open a signal directly in the AI analyst workspace.

### Phase 5: Add semantic discovery

- Add natural-language feed search.
- Consider embeddings for related-story discovery and semantic dedupe.
- Run in shadow mode before affecting feed ranking.

## Guardrails

- Do not let AI write or overwrite `verification_status`.
- Do not create a second reliability score outside the existing core model.
- Do not expose unsupported model claims.
- Do not call stories "propaganda" without a specific observable reason.
- Do not rely on multiple free-tier accounts in ways that violate provider
  terms. Use compliant multi-provider fallback, caching, limits, and optional
  local models instead.
- Always prefer a useful uncertainty statement over false certainty.
- Be honest in product copy that AI is used extensively, but make it equally
  clear that users can inspect the underlying evidence themselves.

## Success criteria

The AI expansion is working when users can answer these questions quickly:

- What actually happened?
- Which parts are widely supported?
- Which parts are disputed or changing?
- Are headlines overstating the evidence?
- Who is reporting this, and are they independent?
- Where can I inspect the sources myself?

