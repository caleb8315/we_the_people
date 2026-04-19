import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { logProductEvent } from '@/lib/product-events';

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
      <header>
        <div className="text-xs uppercase tracking-wide text-white/50">
          {data.kind} · {new Date(data.period_start).toLocaleString()}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{data.headline}</h1>
      </header>
      <pre className="whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-5 font-sans text-sm leading-relaxed text-white/80">
        {data.body_markdown}
      </pre>
    </article>
  );
}
