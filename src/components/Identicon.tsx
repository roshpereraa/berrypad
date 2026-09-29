/**
 * A wallet's face: a 5x5 mirrored pixel pattern in shades of green, derived
 * from the address, so the same trader is recognisable across the feed.
 */
export function Identicon({ address, size = 28 }: { address: string; size?: number }) {
  const hex = address.toLowerCase().replace(/^0x/, '').padEnd(40, '0')
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const nib = parseInt(hex[(y * 3 + x) % 40] ?? '0', 16)
      if (nib % 2 === 0) {
        cells.push({ x, y })
        if (x < 2) cells.push({ x: 4 - x, y })
      }
    }
  }
  const shade = 38 + (parseInt(hex.slice(30, 32), 16) % 30)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 7"
      className="shrink-0 rounded-lg"
      style={{ background: '#03140c' }}
      aria-hidden
    >
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x + 1} y={c.y + 1} width="1" height="1" fill={`hsl(156, 80%, ${shade}%)`} />
      ))}
    </svg>
  )
}
