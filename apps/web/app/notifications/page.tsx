import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ExpandableText } from '@/components/expandable-text';

export const metadata = { title: 'Alerts · Crosscheck' };
export const dynamic = 'force-dynamic';

const MODES = ['all', 'unread'] as const;
type NotificationMode = (typeof MODES)[number];

interface NotificationRow {
  id: string;
  type: 'daily_briefing' | 'priority_alert' | 'summary';
  title: string;
  summary: string;
  body: string;
  signal_id: string | null;
  briefing_id: string | null;
  is_read: boolean;
  created_at: string;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { mode?: string };
}) {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/notifications');

  const mode = parseMode(searchParams.mode);

  let query = sb
    .from('user_notifications')
    .select('id, type, title, summary, body, signal_id, briefing_id, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(150);

  if (mode === 'unread') query = query.eq('is_read', false);
  const { data } = await query;
  const notifications = (data ?? []) as NotificationRow[];

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-ink-500">
          Daily briefings and priority alerts now arrive here in-app, including on mobile.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill href="/notifications?mode=all" active={mode === 'all'} label="All notifications" />
        <FilterPill
          href="/notifications?mode=unread"
          active={mode === 'unread'}
          label={`Unread${mode === 'all' ? ` (${unreadCount})` : ''}`}
        />
        <form action="/api/notifications/mark-all-read" method="post" className="ml-auto">
          <button
            type="submit"
            className="rounded-full border border-ink-100 bg-paper px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-canvas-50"
          >
            Mark all as read
          </button>
        </form>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title={mode === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
          body={
            mode === 'unread'
              ? 'You are all caught up.'
              : 'Daily briefings and priority alerts will appear after the next worker runs.'
          }
          action={{ label: 'Open feed', href: '/feed' }}
        />
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li key={n.id} className="rounded-card border border-ink-100 bg-paper p-3 sm:p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={badgeVariantForType(n.type)} withIcon={false}>
                  {labelForType(n.type)}
                </Badge>
                {!n.is_read && (
                  <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand-700">
                    Unread
                  </span>
                )}
                <span className="ml-auto text-xs text-ink-400">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>

              <h2 className="mt-2 text-sm font-semibold text-ink sm:text-[15px]">{n.title}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{n.summary}</p>
              {n.body && (
                <div className="mt-2.5 rounded-xl border border-ink-100 bg-canvas-50 p-2.5 sm:p-3">
                  <ExpandableText text={n.body} previewLines={4} minCharsToCollapse={280} />
                </div>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {n.signal_id && (
                  <Link
                    href={`/signal/${n.signal_id}`}
                    className="rounded-full border border-ink-100 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-canvas-50"
                  >
                    Open signal
                  </Link>
                )}
                {n.briefing_id && (
                  <Link
                    href={`/briefings/${n.briefing_id}`}
                    className="rounded-full border border-ink-100 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-canvas-50"
                  >
                    Open briefing
                  </Link>
                )}
                {!n.is_read && (
                  <form
                    action={`/api/notifications/${n.id}/read?next=${encodeURIComponent(
                      `/notifications?mode=${mode}`,
                    )}`}
                    method="post"
                    className="ml-auto"
                  >
                    <button
                      type="submit"
                      className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                    >
                      Mark as read
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function parseMode(mode: string | undefined): NotificationMode {
  if (!mode) return 'all';
  return MODES.includes(mode as NotificationMode) ? (mode as NotificationMode) : 'all';
}

function labelForType(type: NotificationRow['type']) {
  if (type === 'daily_briefing') return 'Daily briefing';
  if (type === 'priority_alert') return 'Priority alert';
  return 'Summary';
}

function badgeVariantForType(type: NotificationRow['type']): 'neutral' | 'developing' | 'verified' {
  if (type === 'priority_alert') return 'developing';
  if (type === 'daily_briefing') return 'verified';
  return 'neutral';
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-100 bg-paper text-ink-600 hover:bg-canvas-50'
      }`}
    >
      {label}
    </Link>
  );
}
