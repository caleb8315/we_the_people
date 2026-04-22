import { runIngest } from './jobs/ingest';
import { runBriefing } from './jobs/brief';
import { runAlerts } from './jobs/alert';
import { runEmailBriefings } from './jobs/email-briefings';
import { runBackfill } from './jobs/backfill';
import { runDevelop } from './jobs/develop';

/**
 * CLI dispatcher. Invoked by GitHub Actions with a single command plus
 * optional arguments:
 *   tsx src/index.ts ingest
 *   tsx src/index.ts brief
 *   tsx src/index.ts brief weekly
 *   tsx src/index.ts alert
 *   tsx src/index.ts email
 *   tsx src/index.ts backfill                 # 48h window, live
 *   tsx src/index.ts backfill 24              # 24h window, live
 *   tsx src/index.ts backfill 48 --dry-run    # 48h window, no writes
 *   tsx src/index.ts backfill 48 --limit=200  # cap candidates per run
 *   tsx src/index.ts develop                  # enrich stale developing signals
 *   tsx src/index.ts develop --dry-run        # list candidates, no writes
 *   tsx src/index.ts develop --max=12         # override max signals per run
 */
const args = process.argv.slice(2);
const [cmd, arg] = args;

async function main() {
  switch (cmd) {
    case 'ingest':
      await runIngest();
      return;
    case 'brief':
      await runBriefing(arg === 'weekly' ? 'weekly' : 'daily');
      return;
    case 'alert':
      await runAlerts();
      return;
    case 'email':
      await runEmailBriefings();
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
      await runDevelop({
        max: maxArg ? Number(maxArg.slice('--max='.length)) : undefined,
        cooldownMinutes: cooldownArg
          ? Number(cooldownArg.slice('--cooldown='.length))
          : undefined,
        windowHours: windowArg ? Number(windowArg.slice('--window='.length)) : undefined,
        dryRun,
      });
      return;
    }
    default:
      console.error(
        `unknown command: ${cmd}. use: ingest | brief [weekly] | alert | email | backfill [hours] [--dry-run] [--limit=N] | develop [--dry-run] [--max=N] [--cooldown=MIN] [--window=HRS]`,
      );
      process.exit(2);
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
