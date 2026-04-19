# Runbooks

Operational playbooks for the beta. Keep these up to date as the system evolves.

## 1. Rotate Supabase service-role key

1. Supabase Dashboard → Project Settings → API → **Generate new service role key**.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in:
   - GitHub Actions → repo secrets
   - Vercel → project environment variables (Production + Preview)
3. Redeploy the web app (Vercel auto-redeploy on env change is usually sufficient).
4. Tail Vercel logs for 10 minutes to confirm no `invalid JWT` errors.

## 2. Rotate LLM keys

- Gemini: https://aistudio.google.com/apikey → revoke old, create new → update `GEMINI_API_KEY`.
- Groq: https://console.groq.com → revoke old, create new → update `GROQ_API_KEY`.

## 3. Beta cohort onboarding

1. Add entries to `public.beta_allowlist` (one row per email, tagged with cohort).
2. Send outreach from your founder email with a link to `/login`.
3. Monitor the `auth.users` table for sign-ups; confirm at least one magic-link was consumed per invitee.

## 4. Ingestion is failing

Symptoms: `/feed` is stale, `engine_runs` rows show `status = failed`.

1. Open the latest ingest run in Supabase: `select * from engine_runs where job='ingest' order by started_at desc limit 5;`
2. Check the `errors` array.
3. If a specific adapter is failing repeatedly, set `enabled = false` in `public.sources` to skip it.
4. Manually re-run via GitHub Actions → Ingest → Run workflow.

## 5. LLM budget exhausted

Symptoms: briefings revert to deterministic bullet form; `engine_runs.meta.llm_skipped = true`.

1. Check `usage_ledger` for today: `select bucket, sum(calls) from usage_ledger where day = current_date group by 1;`
2. Raise `MAX_DAILY_LLM_CALLS_*` carefully if you have provider quota headroom.
3. If consistently over budget, reduce source count or tighten severity thresholds in `jobs/brief.ts`.

## 6. Incident response (data exposure)

1. Rotate all keys (runbooks 1 + 2).
2. Review the last 24h of `engine_runs` and Vercel logs.
3. If user PII may be involved, draft user notification within 24h and send within 72h.
4. Write a post-mortem in `docs/incidents/` (create as needed).

## 7. Account deletion requested via email

If a user cannot log in to delete themselves:

```sql
-- Replace with the actual email.
select id from auth.users where email = 'user@example.com';
-- Then:
select auth.uid = '<id>' as ok; -- safety check
delete from auth.users where id = '<id>';
-- RLS cascades take care of profiles/preferences/feedback.
```

Confirm by rerunning the select and ensuring zero rows.
