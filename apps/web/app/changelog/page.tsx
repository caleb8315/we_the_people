import { readFileSync } from 'node:fs';
import path from 'node:path';

export const metadata = { title: 'Changelog · Crosscheck' };

function loadChangelog(): string {
  const filePath = path.join(process.cwd(), '..', '..', 'docs', 'changelog.md');
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '# Changelog\n\nUnable to load changelog right now.';
  }
}

export default function ChangelogPage() {
  const body = loadChangelog();

  return (
    <article className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Changelog</h1>
        <p className="text-sm text-ink-500">
          Product-facing changes shipped to the Crosscheck beta.
        </p>
      </header>

      <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700">
          {body}
        </pre>
      </div>
    </article>
  );
}
