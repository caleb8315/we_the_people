import Link from 'next/link';
import { redirect } from 'next/navigation';
import React from 'react';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { decorateSignals, personalizeSignals, type SignalRowRaw } from '@/lib/signals';
import { PlayerStatus } from '@/components/player-status';
import { DailyMissions } from '@/components/daily-missions';

export const metadata = { title: 'HQ · Crosscheck' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard');

  const [
    { data: profile },
    { data: prefs },
    { count: sessionCount },
    { data: briefing },
    { data: rawSignals },
  ] = await Promise.all([
    sb
      .from('profiles')
      .select('display_name, onboarded_at, last_dashboard_visit_at')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    sb
      .from('preferences')
      .select(
        'topics, muted_sources, muted_topics, countries_of_focus, min_alert_severity, feed_mode_preference, briefing_frequency_preference, notifications_enabled, alert_intensity_preference, max_alerts_per_day_preference',
      )
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    sb.from('ai_sessions').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id),
    sb
      .from('briefings')
      .select('id, headline, period_start')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('signals_public')
      .select('*')
      .order('severity', { ascending: false })
      .limit(80),
  ]);

  if (!profile?.onboarded_at) redirect('/onboarding');

  const lastVisit = profile.last_dashboard_visit_at ?? null;
  const personal = personalizeSignals((rawSignals ?? []) as SignalRowRaw[], prefs);
  const decoratedPersonal = await decorateSignals(sb, personal.slice(0, 12), { newSince: lastVisit });

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const newCorroboratedCount = (rawSignals ?? []).filter(
    (s) => s.verification_status === 'verified' && s.first_seen_at >= dayAgo,
  ).length;
  const disputedCount = decoratedPersonal.reduce((n, s) => n + ((s.contradictions_count ?? 0) > 0 ? 1 : 0), 0);
  const criticalCount = decoratedPersonal.filter((s) => s.severity >= 85).length;
  const topPriority = decoratedPersonal[0] ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: alertUsage } = await sb
    .from('user_daily_usage')
    .select('calls')
    .eq('user_id', auth.user.id)
    .eq('day', today)
    .eq('bucket', 'priority_alert');
  const alertsSentToday = (alertUsage ?? []).reduce((sum, r) => sum + Number(r.calls ?? 0), 0);

  void sb
    .from('profiles')
    .update({ last_dashboard_visit_at: new Date().toISOString() })
    .eq('user_id', auth.user.id);

  const name = profile.display_name || auth.user.email?.split('@')[0] || 'Citizen';
  const topics = (prefs?.topics ?? ['war', 'economy', 'climate']) as string[];
  const alertCap = Number(prefs?.max_alerts_per_day_preference ?? 3);

  return (
    <div className="space-y-5 sm:space-y-7">
      <header className="relative overflow-hidden rounded-[28px] border border-ink-100 bg-ink-900 px-5 py-6 text-white sm:px-7 sm:py-8">
        <div
          className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-signal/30 blur-3xl animate-drift"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-flare/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-signal-300">
              Command HQ
            </p>
            <h1 className="mt-2 font-display text-[30px] font-semibold leading-[1.1] tracking-tight sm:text-[38px]">
              Welcome back, {name}.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              Clear calls for the people. Missions today, stories that matter, and what looks solid vs what clashes.
            </p>
            <Link
              href="/verify"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-flare px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(228,87,46,0.65)] transition hover:bg-flare-600"
            >
              Verify a claim · +25 XP
            </Link>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <HeroStat label="Solid today" value={newCorroboratedCount} />
            <HeroStat label="Clashes" value={disputedCount} warn={disputedCount > 0} />
            <HeroStat label="Alerts" value={`${alertsSentToday}/${alertCap}`} />
          </dl>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <PlayerStatus />
        <DailyMissions />
      </div>

      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/intel"
          className="group flex items-start gap-4 rounded-[28px] border border-flare/25 bg-flare/5 p-5 shadow-card transition hover:shadow-card-hover"
        >
          <span className="mt-0.5 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-flare text-lg font-bold text-white">
            !
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-flare-700">
              Hot zone
            </p>
            <p className="mt-1 text-sm font-semibold text-ink group-hover:text-flare-700">
              High-severity signals for your focus topics
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {criticalCount > 0
                ? `${criticalCount} critical right now`
                : 'Filtered to your interests'}{' '}
              · {disputedCount > 0 ? `${disputedCount} clashes` : 'no clashes'}
            </p>
          </div>
        </Link>
        {topPriority ? (
          <TopPriorityCard
            id={topPriority.id}
            title={topPriority.title}
            severity={topPriority.severity}
            topic={topPriority.topic ?? 'event'}
            verification={topPriority.verification_status}
          />
        ) : (
          <Card tone="neutral">
            <p className="text-sm text-ink-500">
              No personalized signals yet — adjust your topics or try the{' '}
              <Link href="/feed?mode=global" className="text-signal underline-offset-2 hover:underline">
                global feed
              </Link>
              .
            </p>
          </Card>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-ink-600">
                Your top stories
              </h2>
              <p className="mt-0.5 text-xs text-ink-400">
                Focus: {topics.slice(0, 4).join(' · ')}
                {topics.length > 4 && ` · +${topics.length - 4}`}
              </p>
            </div>
            <Link href="/feed" className="text-sm font-medium text-signal hover:underline">
              View all →
            </Link>
          </header>
          {decoratedPersonal.length === 0 ? (
            <EmptyState
              title="No personalized signals yet."
              body="Adjust your topics or try the global feed for now."
              action={{ label: 'Open global feed', href: '/feed?mode=global' }}
            />
          ) : (
            <ul className="space-y-3">
              {decoratedPersonal.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <SignalCard s={s} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4 lg:space-y-5">
          <Card title="Your focus">
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <span
                  key={t}
                  className="rounded-xl border border-ink-100 bg-canvas-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600"
                >
                  {t}
                </span>
              ))}
            </div>
            <dl className="mt-3 space-y-1 text-xs text-ink-500">
              <FocusRow label="Feed mode" value={prefs?.feed_mode_preference ?? 'personalized'} />
              <FocusRow label="Briefings" value={prefs?.briefing_frequency_preference ?? 'daily'} />
              <FocusRow
                label="Notifications"
                value={prefs?.notifications_enabled === false ? 'off' : 'on'}
              />
              <FocusRow label="Alert intensity" value={prefs?.alert_intensity_preference ?? 'critical_only'} />
            </dl>
            <Link href="/settings" className="mt-3 inline-block text-sm font-medium text-signal hover:underline">
              Update preferences →
            </Link>
          </Card>

          <Card title="Latest briefing">
            {briefing ? (
              <>
                <p className="text-sm font-medium leading-snug text-ink-700 clamp-2">{briefing.headline}</p>
                <p className="mt-1.5 text-[11px] uppercase tracking-wider text-ink-400">
                  {new Date(briefing.period_start).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <Link
                  href={`/briefings/${briefing.id}`}
                  className="mt-3 inline-block text-sm font-medium text-signal hover:underline"
                >
                  Open briefing →
                </Link>
              </>
            ) : (
              <p className="text-sm text-ink-500">No briefing yet. It&rsquo;ll appear here after the next run.</p>
            )}
          </Card>

          <Card title="Quick tools">
            <ul className="-my-1 divide-y divide-ink-100">
              <QuickTool
                href="/dashboard/sources"
                title="Source control"
                body="Global map · credibility tiers · what's active."
              />
              <QuickTool
                href="/dashboard/ai"
                title="AI analyst"
                body={`Your analyst memory — ${sessionCount ?? 0} session${sessionCount === 1 ? '' : 's'}.`}
              />
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-white/50">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${warn ? 'text-flare-200' : 'text-white'}`}>
        {value}
      </dd>
    </div>
  );
}

function TopPriorityCard({
  id,
  title,
  severity,
  topic,
  verification,
}: {
  id: string;
  title: string;
  severity: number;
  topic: string;
  verification: string;
}) {
  const severe = severity >= 85;
  return (
    <Link
      href={`/signal/${id}`}
      className={`group relative block overflow-hidden rounded-[28px] border p-5 shadow-card transition hover:shadow-card-hover sm:p-6 ${
        severe
          ? 'border-danger-200 bg-gradient-to-br from-danger-50 via-paper to-paper'
          : 'border-signal/25 bg-gradient-to-br from-signal/10 via-paper to-paper'
      }`}
    >
      <div className="flex items-start gap-4 sm:gap-5">
        <div
          className={`flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center rounded-2xl sm:h-20 sm:w-20 ${
            severe ? 'bg-danger-100 text-danger-700' : 'bg-signal/15 text-signal-700'
          }`}
        >
          <span className="text-2xl font-semibold leading-none tabular-nums sm:text-3xl">{severity}</span>
          <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider opacity-80">severity</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              Top priority
            </span>
            <span className="rounded-xl border border-ink-100 bg-paper/70 px-2 py-0.5 text-[10px] font-medium text-ink-600">
              {topic}
            </span>
            <span className="rounded-xl border border-ink-100 bg-paper/70 px-2 py-0.5 text-[10px] font-medium text-ink-600">
              {verification.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-2 font-display text-[17px] font-semibold leading-snug text-ink clamp-2 sm:text-lg">
            {title}
          </p>
          <p className="mt-2 text-xs text-ink-500">Open for evidence, clashes, and the live source trail →</p>
        </div>
      </div>
    </Link>
  );
}

function FocusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-medium text-ink-700">{value}</dd>
    </div>
  );
}

function QuickTool({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <li>
      <Link
        href={href}
        className="group -mx-1 flex items-start justify-between gap-3 rounded-lg px-1 py-2 transition hover:bg-canvas-50"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-700 group-hover:text-signal">{title}</p>
          <p className="mt-0.5 text-xs text-ink-500">{body}</p>
        </div>
        <span
          className="mt-0.5 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-signal"
          aria-hidden
        >
          →
        </span>
      </Link>
    </li>
  );
}
