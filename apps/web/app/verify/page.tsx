import { VerifyForm } from './verify-form';

export const metadata = { title: 'Verify · Crosscheck' };

export default function VerifyPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="mx-auto w-full max-w-2xl space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Verify anything.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-zinc-400">
            Paste any news article URL. We&apos;ll extract the claims, search for evidence,
            check sensor networks, and show you everything we find.
          </p>
        </div>

        <VerifyForm />

        <div className="grid grid-cols-4 gap-4 pt-4 text-center">
          <Step num="1" label="Extract claims" />
          <Step num="2" label="Search the web" />
          <Step num="3" label="Check sensors" />
          <Step num="4" label="Show evidence" />
        </div>

        <p className="text-xs text-zinc-600">
          Crosscheck does not tell you what is true. It shows you what sources report,
          so you can decide for yourself.
        </p>
      </div>
    </div>
  );
}

function Step({ num, label }: { num: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-400">
        {num}
      </div>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}
