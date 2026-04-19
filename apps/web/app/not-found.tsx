import { EmptyState } from '@/components/ui/empty-state';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-10">
      <EmptyState
        title="Page not found"
        body="That page does not exist or has expired."
        action={{ label: 'Go to feed', href: '/feed' }}
      />
    </div>
  );
}
