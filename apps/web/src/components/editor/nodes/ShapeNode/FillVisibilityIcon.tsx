import { HiOutlineEye, HiOutlineEyeSlash } from 'react-icons/hi2';

/** Eye / eye-slash for fill layer visibility. */
export function FillVisibilityIcon({
  visible,
  className,
}: {
  visible: boolean;
  className?: string;
}) {
  const Icon = visible ? HiOutlineEye : HiOutlineEyeSlash;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
