import { useSelector } from 'react-redux';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import ThemeSwitcher from '@/components/layout/ThemeSwitcher';
import WalletAccountChip from '@/components/layout/WalletAccountChip';

/**
 * Home header trailing actions.
 * Logged-in: theme & language live inside the account panel list.
 * Guest: keep compact switchers next to login.
 */
export default function AuthHeader() {
  const user = useSelector((state: any) => state.auth.user);

  return (
    <div className="flex shrink-0 items-center gap-3">
      {!user ? (
        <>
          <LanguageSwitcher variant="light" />
          <ThemeSwitcher />
        </>
      ) : null}
      <WalletAccountChip />
    </div>
  );
}
