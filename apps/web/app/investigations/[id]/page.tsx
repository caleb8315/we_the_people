import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { InvestigationReport } from '@osint/investigator/schema';
import { ReportView } from '@/components/investigation/report-view';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Investigation · Crosscheck' };

export default async function InvestigationPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) {
    return (
      <div className="rounded-card border border-ink-100 bg-paper p-6 shadow-card">
        <p className="text-sm text-ink-700">
          Sign in to view your saved investigations.{' '}
          <Link href={`/login?next=/investigations/${params.id}`} className="font-semibold text-signal-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }
  const { data } = await sb.from('investigations').select('report, created_at').eq('id', params.id).maybeSingle();
  if (!data) notFound();
  const report = (data as { report: InvestigationReport }).report;

  return (
    <div className="space-y-5">
      <p className="text-xs text-ink-500">
        <Link href="/verify" className="font-semibold text-signal-600 hover:underline">
          ← New investigation
        </Link>{' '}
        · Investigated {new Date(report.created_at).toLocaleString()}
      </p>
      <ReportView report={report} />
    </div>
  );
}
