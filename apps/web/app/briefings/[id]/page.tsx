import { notFound } from 'next/navigation';
import { getAdminSupabase } from '@/lib/supabase-server';

export const revalidate = 120;

export default async function BriefingPage({ params }: { params: { id: string } }) {
  const sb = getAdminSupabase();
  const { data } = await sb.from('briefings').select('*').eq('id', params.id).maybeSingle();
  if (!data) notFound();

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
