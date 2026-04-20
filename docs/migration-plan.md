# Migration plan — reliability / contradictions / evidence rollout

This document captures the end-to-end procedure for rolling out phases 2–8
(contradictions contract → reliability scoring → public label → card UX →
evidence hardening → normalization → safety rails → backfill) without
recomputing the full signal history.

## Guiding principle

**Additive only.** We do not touch `severity`, `confidence`, or
`verification_status` on existing rows. We only populate the new columns
(`reliability_score` / `reliability_label` / `reliability_summary` /
`agreement_score` / `source_independence_score` / `narrative_divergence_score`
/ `evidence_strength_score`) and replace per-signal `contradictions` rows.
`raw_data` is merge-updated so earlier keys survive.

## Step 1 — apply migrations

Apply these files in order in the Supabase SQL editor. All four are
idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` / guarded `DO` blocks), so
re-running is safe if an earlier step partially completed.

1. `supabase/migrations/013_reframe_ai_defaults.sql`
   Reframes the default AI analyst prompt so the model never claims to
   "verify truth" or to "fact-check" — it describes reliability,
   corroboration, confidence, and disagreement instead.
2. `supabase/migrations/014_contradictions_contract.sql`
   Adds `type` / `severity` / `summary` / `metadata` to
   `public.contradictions` (with `CHECK` constraints) and indexes.
3. `supabase/migrations/015_reliability_dimensions.sql`
   Adds the five reliability columns to `public.signals` and appends them
   to `public.signals_public`.
4. `supabase/migrations/016_reliability_labels.sql`
   Adds `reliability_label` + `reliability_summary` to `public.signals`,
   check-constrains the label enum, and appends both to `signals_public`.

Verify each migration with:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'signals'
  and column_name in (
    'reliability_score','agreement_score','source_independence_score',
    'narrative_divergence_score','evidence_strength_score',
    'reliability_label','reliability_summary'
  );
```

All seven rows should be present.

## Step 2 — deploy the worker code

Push the updated worker (phases 2–7) so that **new** ingests start
populating the additive columns immediately. Until the worker is deployed,
new rows keep all new columns `NULL`, same as old rows.

```bash
git push origin main
```

Vercel deploys the web app automatically. The worker runs on
`.github/workflows/*.yml`, so the next hourly `ingest.yml` run picks up the
new code without action.

After the first post-deploy `ingest` run, new signals should have
`reliability_score IS NOT NULL` and `raw_data.physical_evidence` populated.
Confirm:

```sql
select count(*) filter (where reliability_score is not null) as scored,
       count(*) filter (where reliability_score is null)     as unscored,
       count(*) as total
from public.signals
where first_seen_at >= now() - interval '2 hours';
```

## Step 3 — backfill the last 24–48 hours (and only that)

The backfill job replays the phase 2–7 pipeline against existing
`signals` + `evidence` rows. It never re-fetches from adapters, never calls
an LLM, and never touches `severity` / `confidence` / `verification_status`.
It is strictly additive.

### Guardrails baked in

- **Window is capped at 168h** (7 days) in code; the default is 48h.
  Requesting more prints a warning and clamps down.
- **Row limit is capped at 2000 per invocation** (default 500). Run it
  again to continue; the filter `reliability_score IS NULL` makes this
  idempotent.
- **Dry-run mode** prints per-signal plans and writes zero rows. Always
  run a dry-run first.
- Concurrent `ingest` and `backfill` runs are safe — contradictions use
  the same `delete()+insert()` replace-per-signal contract, so neither job
  creates duplicates.

### Preferred path — GitHub Actions

1. Go to **Actions → Backfill (manual) → Run workflow**.
2. Leave `hours=48`, `dry_run=true`, `limit=500` for the first invocation.
3. Inspect the run log: it prints one line per candidate with the
   computed `reliability_score`, `label`, `contradictions_count`, and
   whether `complex_signal` fired.
4. If the dry-run output looks sane, run it again with `dry_run=false`.
5. Re-invoke as many times as needed until `reliability_score IS NULL`
   returns zero for the window.

### Alternate path — local CLI

Useful for one-off backfills from a laptop with `SUPABASE_SERVICE_ROLE_KEY`
in `.env`.

```bash
# Dry run (no writes)
npm run backfill -- 48 --dry-run --limit=500

# Live run
npm run backfill -- 48 --limit=500

# Narrower window if we just want the freshest rows
npm run backfill -- 24
```

### What the backfill writes

Per matched signal (scoped by `id`):

- `signals.reliability_score`, `agreement_score`,
  `source_independence_score`, `narrative_divergence_score`,
  `evidence_strength_score`
- `signals.reliability_label`, `reliability_summary`
- `signals.tags` — merged with the existing array; `complex_signal` added
  when detection is skipped, other tags preserved
- `signals.raw_data` — merged: adds `reliability`, `physical_evidence`,
  `contradiction_detection`, and a `backfilled_at` timestamp; any other
  keys the ingest pipeline wrote earlier are left untouched
- `contradictions` — replace-per-signal; prior rows for this `signal_id`
  are deleted, freshly detected rows inserted

### What the backfill does **not** do

- Does not modify `severity`, `confidence`, or `verification_status`.
- Does not recompute `source_count`, `credible_source_count`, or
  `distinct_domains` — those were set during original ingest and flow
  through RLS / alerts / feed filters; changing them retroactively would
  shift the public feed.
- Does not call any LLM.
- Does not touch rows older than the configured window.
- Does not touch rows that already have `reliability_score IS NOT NULL`.

## Step 4 — verify the rollout

```sql
-- How many recent signals are now fully scored?
select
  count(*)                                           as recent_total,
  count(*) filter (where reliability_score is not null)   as scored,
  count(*) filter (where reliability_label is not null)   as labelled,
  count(*) filter (where 'complex_signal' = any(tags))    as complex_skipped
from public.signals
where first_seen_at >= now() - interval '48 hours';

-- Are the contradictions contract columns populated on every new row?
select
  count(*)                                       as total,
  count(*) filter (where type is not null)       as contract_rows,
  count(*) filter (where summary is null)        as missing_summary
from public.contradictions
where created_at >= now() - interval '48 hours';

-- Spot-check the public view surface
select id, reliability_score, reliability_label, reliability_summary
from public.signals_public
where reliability_score is not null
order by first_seen_at desc
limit 10;
```

## Step 5 — DO NOT recompute full history yet

The backfill is deliberately bounded. Before widening the window beyond
168h we want to:

- Observe a few backfill cycles and confirm error rates stay at zero.
- Track `reliability_score` distribution vs. our expectations
  (most signals should land in the 35–85 band; anything above 90 with a
  cold cache usually means evidence is thin).
- Confirm the `complex_signal` rate is under a few percent — a spike there
  means the adapters are emitting signals with unusual fan-out.

Only once those three confirms are green do we consider writing a
long-history backfill (phase 9, not covered here), and it will go through
a separate review.

## Rollback

Every migration file is additive. To roll back you would:

1. Revert the worker deploy (the old worker simply ignores the new
   columns).
2. Optional: `update public.signals set reliability_score = null, ...`
   to blank the scoring, but there is no need — the new columns are
   nullable and the UI already falls back gracefully when they are null.
3. Dropping the columns is a last resort and requires a new migration; the
   `signals_public` view will need to be recreated to stop referencing
   them.

We have not dropped or renamed a single existing column across phases 2–8,
so no data is at risk from a rollback.
