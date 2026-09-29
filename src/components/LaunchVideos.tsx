'use client'

import { useEffect, useRef, useState } from 'react'

const VIDEOS = [
  {
    src: '/videos/hype',
    poster: '/videos/hype.jpg',
    full: '/videos/hype-1080.mp4',
    title: 'Berrypad — the hype reel',
    body: '25 seconds, cut to the beat. Launch it, trade it, graduate it.',
    wide: true,
  },
  {
    src: '/videos/launch-it',
    poster: '/videos/launch-it.jpg',
    title: 'Launch it',
    body: 'Name it, ticker it, one transaction. Then watch the curve fill and graduate.',
    full: '/videos/launch-it.mp4',
    wide: false,
  },
  {
    src: '/videos/live-pad',
    poster: '/videos/live-pad.jpg',
    title: 'The pad is live',
    body: 'Every launch racing to graduation, every fill as it lands, traders ranked live.',
    full: '/videos/live-pad.mp4',
    wide: false,
  },
] as const

/**
 * Autoplaying, muted, looping launch films.
 *
 * The files are 5–7 MB each, so nothing is fetched until a film is near the
 * viewport, and each one pauses when it scrolls away. H.264 plays in Chrome,
 * Safari and Edge; open-source Chromium and some Linux Firefox builds lack it,
 * so those get the VP9 WebM instead.
 *
 * Browsers only autoplay muted video, so the films start silent and each has a
 * sound button. Turning sound on restarts that film from the top (the music is
 * cut to the picture) and mutes the other one.
 */
function pickSource(v: HTMLVideoElement, base: string) {
  return v.canPlayType('video/mp4; codecs="avc1.640028"') ? `${base}.mp4` : `${base}.webm`
}

function Film({
  src,
  poster,
  title,
  audible,
  onToggleSound,
}: {
  src: string
  poster: string
  title: string
  audible: boolean
  onToggleSound: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    // React does not keep the `muted` property in sync, so set it directly.
    v.muted = !audible
    if (audible) {
      if (!v.getAttribute('src')) v.src = pickSource(v, src)
      v.currentTime = 0
      void v.play().catch(() => {})
    }
  }, [audible, src])

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
    <div className="relative">
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
      <button
        type="button"
        onClick={onToggleSound}
        aria-pressed={audible}
        aria-label={audible ? `Mute ${title}` : `Play ${title} with sound`}
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-xs font-medium backdrop-blur hover:border-[var(--accent)]/60"
      >
        <SpeakerIcon on={audible} />
        {audible ? 'Sound on' : 'Sound off'}
      </button>
    </div>
  )
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" stroke="none" />
      {on ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
        </>
      ) : (
        <path d="m16 9 6 6m0-6-6 6" strokeLinecap="round" />
      )}
    </svg>
  )
}

export function LaunchVideos() {
  const [audible, setAudible] = useState<number | null>(null)
  return (
    <section className="mt-16">
      <h2 className="text-center text-lg text-[var(--color-muted)]">See it in action</h2>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {VIDEOS.map((v, i) => (
          <figure key={v.src} className={`card overflow-hidden ${v.wide ? 'lg:col-span-2' : ''}`}>
            <Film
              src={v.src}
              poster={v.poster}
              title={v.title}
              audible={audible === i}
              onToggleSound={() => setAudible((cur) => (cur === i ? null : i))}
            />
            <figcaption className="flex items-start justify-between gap-4 p-5">
              <span>
                <span className="block text-lg font-semibold tracking-tight">{v.title}</span>
                <span className="mt-1 block text-sm text-[var(--color-muted)]">{v.body}</span>
              </span>
              <a
                href={v.full}
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
