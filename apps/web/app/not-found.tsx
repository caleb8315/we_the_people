import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-white/70">That page does not exist or has expired.</p>
      <Link className="text-white underline" href="/feed">Go to feed</Link>
    </div>
  );
}
