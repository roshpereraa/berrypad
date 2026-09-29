/**
 * Berrypad mark — the leaf-berry.
 *
 * A heart-shaped berry with two leaves at the crown, cut by one diagonal
 * stroke. The cut is a mask rather than a painted line, so the mark reads the
 * same on the black nav, the green hero and a browser tab.
 *
 * Mirrored as static SVG in app/icon.svg; change both together.
 */
export function Logo({
  size = 30,
  withWordmark = false,
  color = '#ffffff',
}: {
  size?: number
  withWordmark?: boolean
  color?: string
}) {
  const mark = (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" role="img" aria-label="Berrypad">
      <defs>
        <mask id="bp-cut" maskUnits="userSpaceOnUse" x="-10" y="-10" width="60" height="60">
          <rect x="-10" y="-10" width="60" height="60" fill="#fff" />
          <path d="M18.2 34.5 22 9.5" stroke="#000" strokeWidth="2.6" strokeLinecap="round" />
        </mask>
      </defs>
      <g transform="rotate(-38 20 21) scale(0.9) translate(2.2 2)">
        <g mask="url(#bp-cut)" fill={color}>
          <path d="M19.6 37.2C11.2 33.4 5.6 26.6 6.3 19.6 6.9 13.7 11.6 10.6 16.2 12.1c1.6.5 2.8 1.4 3.6 2.4.9-1 2.2-1.8 3.8-2.2 4.8-1.2 9.1 2.2 9.3 8.1.2 7-5.1 13.4-13.3 16.8Z" />
          <path d="M19.4 13.2c-2.4-2.6-3-5.8-1.6-9.1 2.6 1.6 3.6 4.9 1.6 9.1Z" />
          <path d="M20.6 13.4c1.2-3.2 4.2-5.2 8.4-5.1-1.2 3-4.2 5-8.4 5.1Z" />
        </g>
      </g>
    </svg>
  )

  if (!withWordmark) return mark

  return (
    <span className="flex items-center gap-2">
      {mark}
      <span className="text-[16px] font-bold uppercase tracking-[0.04em]">
        Berry<span className="text-[var(--accent)]">pad</span>
      </span>
    </span>
  )
}
