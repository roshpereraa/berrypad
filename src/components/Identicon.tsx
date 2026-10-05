/**
 * A wallet's face: a 5x5 mirrored pixel pattern in shades of green, derived
 * from the address, so the same trader is recognisable across the feed.
 */
export function Identicon({ address, size = 28 }: { address: string; size?: number }) {
  /*
   * Base58 is not hex, so the pattern comes from a hash of the whole address
   * rather than from reading off nibbles. Every character then feeds into
   * every cell, which is what keeps two mints sharing a prefix - and pump.fun
   * vanity mints often do - from drawing the same face.
   */
  const bits: number[] = []
  let hash = 2166136261
  for (const ch of address) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 16777619) >>> 0
    bits.push(hash)
  }
  const at = (i: number) => (bits[i % bits.length] ?? hash) >>> ((i % 4) * 8)
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (at(y * 3 + x) % 2 === 0) {
        cells.push({ x, y })
        if (x < 2) cells.push({ x: 4 - x, y })
      }
    }
  }
  const shade = 38 + (at(15) % 30)
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
