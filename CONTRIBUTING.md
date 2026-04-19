# Contributing

This is a private beta, but we welcome pull requests from beta users who spot bugs or want to propose small improvements.

## Principles

- Free-tier first. Any dependency that has a paid-only path is a red flag.
- Transparency before performance. Never hide evidence or sources to make the UI tidier.
- Neutrality in wording. Never accuse. Always cite.

## Local dev

```bash
npm install
cp .env.example .env         # fill in Supabase vars
npm run dev                  # dashboard at :3000
npm run ingest               # one ingest cycle
```

## Style

- TypeScript strict, `noUncheckedIndexedAccess` on.
- Keep modules small (< 250 lines where possible).
- Add a short JSDoc on any non-trivial export.
- No emojis in code, docs, or UI unless explicitly requested.

## PR checklist

- `npm run typecheck` passes.
- Any schema change ships with a migration file in `supabase/migrations/`.
- New user-visible changes include a line in `docs/changelog.md`.
- Security-sensitive changes update `docs/security.md`.
