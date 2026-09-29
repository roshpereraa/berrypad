'use client'

import { useEffect, useRef } from 'react'

/** Pixel size of one cell of the field, in CSS pixels. */
const CELL = 3

/**
 * The brand's green particle swirl, drawn live.
 *
 * The field is rendered at one pixel per 3x3 cell into a small buffer and
 * scaled up without smoothing, which gives the banner's square, "matrix"
 * grain for the cost of a few thousand pixels a frame. Ribbons come from the
 * crests of a domain-warped sine field; a per-cell hash breaks them into
 * sparkling dust, and a fainter second layer fills the gaps between ribbons.
 *
 * The loop pauses while the hero is off screen, and with reduced motion one
 * frame is drawn and left still.
 */
export function SwirlField() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const buffer = document.createElement('canvas')
    const bctx = buffer.getContext('2d')
    if (!bctx) return

    let cols = 0
    let rows = 0
    let img: ImageData | null = null
    let seed = new Float32Array(0)
    let raf = 0
    let visible = true
    let last = 0
    let t = Math.random() * 100

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      cols = Math.max(1, Math.ceil(r.width / CELL))
      rows = Math.max(1, Math.ceil(r.height / CELL))
      canvas.width = cols * CELL
      canvas.height = rows * CELL
      buffer.width = cols
      buffer.height = rows
      img = bctx.createImageData(cols, rows)
      seed = new Float32Array(cols * rows)
      for (let i = 0; i < seed.length; i++) seed[i] = Math.random()
    }

    const draw = () => {
      if (!img) return
      const d = img.data
      const aspect = cols / rows
      for (let y = 0; y < rows; y++) {
        const ny = y / rows - 0.5
        for (let x = 0; x < cols; x++) {
          const nx = (x / cols - 0.5) * aspect
          // Domain warp: bends straight bands into the banner's S-curves.
          const wx = nx + 0.42 * Math.sin(ny * 3.1 + t * 0.5) + 0.1 * Math.sin(ny * 11 - t * 0.35)
          const wy = ny + 0.3 * Math.cos(nx * 2.3 - t * 0.38) + 0.06 * Math.sin(nx * 9 + t * 0.2)
          const phase = wy * 11 - wx * 3.2 + Math.sin(wx * 2.8 + t * 0.22) * 2.2
          const crest = Math.max(0, Math.sin(phase))
          const ribbon = crest ** 16
          const dust = crest ** 4

          const i = y * cols + x
          const s = seed[i] ?? 0
          // Twinkle: each cell flickers on its own slow clock.
          const tw = 0.5 + 0.5 * Math.sin(t * 2.4 + s * 40)
          let v =
            ribbon * (s > 0.3 ? 1.1 : 0.3) * tw +
            dust * (s > 0.72 ? 0.5 : 0) * tw +
            (s > 0.985 ? 0.12 : 0)
          // Keep the centre-left quieter, where the copy sits.
          const fx = x / cols
          v *= 0.4 + 0.6 * Math.min(1, Math.abs(fx - 0.28) * 2.2)
          v = Math.min(1, v)

          const o = i * 4
          d[o] = 30 * v * v
          d[o + 1] = 225 * v
          d[o + 2] = 140 * v
          d[o + 3] = 255
        }
      }
      bctx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(buffer, 0, 0, cols * CELL, rows * CELL)
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      // ~30fps is plenty for a drift this slow, and halves the cost.
      if (!visible || now - last < 33) return
      last = now
      t += 0.018
      draw()
    }

    resize()
    draw()
    if (!reduced) raf = requestAnimationFrame(loop)

    const ro = new ResizeObserver(() => {
      resize()
      draw()
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
    })
    io.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [])

  return <canvas ref={ref} aria-hidden style={{ imageRendering: 'pixelated' }} />
}
