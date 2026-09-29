'use client'

import { useEffect, useRef } from 'react'

const VIDEOS = [
  {
    src: '/videos/launch-it',
    poster: '/videos/launch-it.jpg',
    title: 'Launch it',
    body: 'Name it, ticker it, one transaction. Then watch the curve fill and graduate.',
  },
  {
    src: '/videos/live-pad',
    poster: '/videos/live-pad.jpg',
    title: 'The pad is live',
    body: 'Every launch racing to graduation, every fill as it lands, traders ranked live.',
  },
] as const

/**
 * Autoplaying, muted, looping launch films.
 *
 * The files are ~5 MB each, so nothing is fetched until a film is near the
 * viewport, and each one pauses when it scrolls away. H.264 plays in Chrome,
 * Safari and Edge; open-source Chromium and some Linux Firefox builds lack it,
 * so those get the VP9 WebM instead.
 */
function pickSource(v: HTMLVideoElement, base: string) {
  return v.canPlayType('video/mp4; codecs="avc1.640028"') ? `${base}.mp4` : `${base}.webm`
}

function Film({ src, poster, title }: { src: string; poster: string; title: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return
        if (e.isIntersecting) {
          if (!v.getAttribute('src')) v.src = pickSource(v, src)
          if (!reduced) void v.play().catch(() => {})
        } else {
          v.pause()
        }
      },
      { rootMargin: '200px 0px', threshold: 0.25 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [src])

  return (
    <video
      ref={ref}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={`${title} — Berrypad launch film`}
      className="block aspect-video w-full bg-black"
    />
  )
}

export function LaunchVideos() {
  return (
    <section className="mt-16">
      <h2 className="text-center text-lg text-[var(--color-muted)]">See it in action</h2>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {VIDEOS.map((v) => (
          <figure key={v.src} className="card overflow-hidden">
            <Film src={v.src} poster={v.poster} title={v.title} />
            <figcaption className="flex items-start justify-between gap-4 p-5">
              <span>
                <span className="block text-lg font-semibold tracking-tight">{v.title}</span>
                <span className="mt-1 block text-sm text-[var(--color-muted)]">{v.body}</span>
              </span>
              <a
                href={`${v.src}.mp4`}
                target="_blank"
                rel="noopener noreferrer"
                className="pill shrink-0 px-3 py-1 text-xs"
              >
                Full size ↗
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
