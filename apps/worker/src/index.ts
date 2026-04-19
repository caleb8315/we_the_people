import { runIngest } from './jobs/ingest';
import { runBriefing } from './jobs/brief';
import { runAlerts } from './jobs/alert';
import { runEmailBriefings } from './jobs/email-briefings';

/**
 * CLI dispatcher. Invoked by GitHub Actions with a single argument:
 *   tsx src/index.ts ingest
 *   tsx src/index.ts brief
 *   tsx src/index.ts brief weekly
 *   tsx src/index.ts alert
 */
const [cmd, arg] = process.argv.slice(2);

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
    default:
      console.error(`unknown command: ${cmd}. use: ingest | brief [weekly] | alert | email`);
      process.exit(2);
  }
}

main().catch(err => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
