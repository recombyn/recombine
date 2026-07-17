import AuthHeader from '@/components/layout/AuthHeader';

/** Floating top-right actions — not a full-width nav bar. */
export default function HomeTopBar() {
  return (
    <div className="pointer-events-none absolute right-0 top-0 z-10 flex items-center justify-end px-6 py-3">
      <div className="pointer-events-auto">
        <AuthHeader />
      </div>
    </div>
  );
}
