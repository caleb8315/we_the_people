import { runIngest } from './jobs/ingest';
import { runBriefing } from './jobs/brief';
import { runAlerts } from './jobs/alert';
import { runEmailBriefings } from './jobs/email-briefings';
import { runBackfill } from './jobs/backfill';
import { autoDeepDive } from './jobs/deep-dive';

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
    case 'deep-dive': {
      const count = Number(arg ?? '5');
      const dived = await autoDeepDive(Number.isFinite(count) ? count : 5);
      console.log(`[worker] deep-dived ${dived} signals`);
      return;
    }
    default:
      console.error(
        `unknown command: ${cmd}. use: ingest | brief [weekly] | alert | email | backfill [hours] [--dry-run] [--limit=N] | deep-dive [count]`,
      );
      process.exit(2);
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
