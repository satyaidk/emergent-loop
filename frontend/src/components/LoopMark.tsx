/** The LearnLoop mark: a nearly closed loop. Colours follow the theme. */
export function LoopMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="22" fill="none" stroke="var(--line-strong)" strokeWidth="9" />
      <path
        d="M32 10a22 22 0 1 1-21.4 27.1"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="9"
        strokeLinecap="round"
      />
    </svg>
  );
}
