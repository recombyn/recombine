import AuthHeader from '@/components/layout/AuthHeader';

/** Top chrome — account / credits / theme only. */
export default function HomeTopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 bg-[var(--surface)] px-6">
      <AuthHeader />
    </header>
  );
}
