import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { logProductEvent } from '@/lib/product-events';
import { Badge } from '@/components/ui/badge';

export const revalidate = 120;

export default async function BriefingPage({ params }: { params: { id: string } }) {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const { data } = await sb.from('briefings').select('*').eq('id', params.id).maybeSingle();
  if (!data) notFound();

  if (auth.user) {
    void logProductEvent(sb, {
      userId: auth.user.id,
      eventName: 'briefing_opened',
      eventProps: { mode: 'global_detail', briefing_id: data.id, kind: data.kind },
    });
  }

  return (
    <article className="prose-osint space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="neutral" withIcon={false}>
            {data.kind}
          </Badge>
          <span className="text-xs text-ink-500">{new Date(data.period_start).toLocaleString()}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{data.headline}</h1>
        {(data.topics ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(data.topics as string[]).map((t) => (
              <Badge key={t} variant="topic" withIcon={false}>
                {t}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <div className="rounded-card border border-ink-100 bg-paper p-5">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700">
          {data.body_markdown}
        </pre>
      </div>

      <p className="text-xs text-ink-400">
        <Link href="/briefings" className="underline hover:text-ink">
          Back to briefings
        </Link>
      </p>
    </article>
  );
}
