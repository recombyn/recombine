import { HiOutlineEye, HiOutlineEyeSlash } from 'react-icons/hi2';

/** Eye / eye-slash for stroke layer visibility. */
export function StrokeVisibilityIcon({
  visible,
  className,
}: {
  visible: boolean;
  className?: string;
}) {
  const Icon = visible ? HiOutlineEye : HiOutlineEyeSlash;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
