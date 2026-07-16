/** Compact stroke on/off glyph (replaces generic eye next to「描边」). */
export function StrokeVisibilityIcon({
  visible,
  className,
}: {
  visible: boolean;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="3"
        y="3"
        width="10"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={visible ? undefined : '2.4 1.6'}
      />
      {visible ? null : (
        <path
          d="M4 12 L12 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
