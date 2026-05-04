import { runIngest } from './jobs/ingest';
import { runBriefing } from './jobs/brief';
import { runAlerts } from './jobs/alert';
import { runUserNotifications } from './jobs/email-briefings';
import { runBackfill } from './jobs/backfill';
import { runDevelop } from './jobs/develop';
import { runMaintenance } from './jobs/maintenance';

/**
 * CLI dispatcher. Invoked by GitHub Actions with a single command plus
 * optional arguments:
 *   tsx src/index.ts ingest                   # full ingest (every 15 min)
 *   tsx src/index.ts ingest --fast            # fast-lane sensors only (every 5 min)
 *   tsx src/index.ts brief
 *   tsx src/index.ts brief weekly
 *   tsx src/index.ts alert
 *   tsx src/index.ts email                  # creates in-app daily notifications
 *   tsx src/index.ts backfill                 # 48h window, live
 *   tsx src/index.ts backfill 24              # 24h window, live
 *   tsx src/index.ts backfill 48 --dry-run    # 48h window, no writes
 *   tsx src/index.ts backfill 48 --limit=200  # cap candidates per run
 *   tsx src/index.ts develop                  # enrich stale developing signals
 *   tsx src/index.ts develop --dry-run        # list candidates, no writes
 *   tsx src/index.ts develop --max=12         # override max signals per run
 *   tsx src/index.ts develop --thin=2         # prioritise low-source signals first
 *   tsx src/index.ts maintenance              # prune retention-managed rows
 */
const args = process.argv.slice(2);
const [cmd, arg] = args;

async function main() {
  switch (cmd) {
    case 'ingest': {
      const fastLane = args.includes('--fast') || args.includes('--fast-lane');
      await runIngest({ fastLane });
      return;
    }
    case 'brief':
      await runBriefing(arg === 'weekly' ? 'weekly' : 'daily');
      return;
    case 'alert':
      await runAlerts();
      return;
    case 'notifications':
    case 'email':
      await runUserNotifications();
      return;
    case 'backfill': {
      const hoursBack = Number(arg ?? '48');
      const dryRun = args.includes('--dry-run');
      const limitArg = args.find((a) => a.startsWith('--limit='));
      const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined;
      await runBackfill({
        hoursBack: Number.isFinite(hoursBack) ? hoursBack : 48,
        dryRun,
        limit,
      });
      return;
    }
    case 'develop': {
      const dryRun = args.includes('--dry-run');
      const maxArg = args.find((a) => a.startsWith('--max='));
      const cooldownArg = args.find((a) => a.startsWith('--cooldown='));
      const windowArg = args.find((a) => a.startsWith('--window='));
      const thinArg = args.find((a) => a.startsWith('--thin='));
      await runDevelop({
        max: maxArg ? Number(maxArg.slice('--max='.length)) : undefined,
        cooldownMinutes: cooldownArg
          ? Number(cooldownArg.slice('--cooldown='.length))
          : undefined,
        windowHours: windowArg ? Number(windowArg.slice('--window='.length)) : undefined,
        thinSourceThreshold: thinArg ? Number(thinArg.slice('--thin='.length)) : undefined,
        dryRun,
      });
      return;
    }
    case 'maintenance': {
      const dryRun = args.includes('--dry-run');
      const usageArg = args.find((a) => a.startsWith('--usage-days='));
      const signalArg = args.find((a) => a.startsWith('--signal-hours='));
      await runMaintenance({
        dryRun,
        usageRetentionDays: usageArg ? Number(usageArg.slice('--usage-days='.length)) : undefined,
        expiredSignalGraceDays: signalArg ? Number(signalArg.slice('--signal-hours='.length)) / 24 : undefined,
      });
      return;
    }
    default:
      console.error(
        `unknown command: ${cmd}. use: ingest [--fast] | brief [weekly] | alert | notifications (or email alias) | backfill [hours] [--dry-run] [--limit=N] | develop [--dry-run] [--max=N] [--cooldown=MIN] [--window=HRS] [--thin=N] | maintenance [--dry-run] [--usage-days=N] [--signal-hours=N]`,
      );
      process.exit(2);
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
