# Berrypad launch films

Two 16-second, 1920×1080, 30fps films made with [HyperFrames](https://github.com/heygen-com/hyperframes)
(HTML compositions rendered frame-by-frame to MP4), each with a music bed.

## Music

Both beds are from HeyGen's music catalog, cut to 16s, faded, and normalised
to −16 LUFS (`music.m4a` in each project). The cuts are placed so the track's
big hit lands on the film's key moment:

| Film | Track | Cut from source | Hit lands on |
| --- | --- | --- | --- |
| `launch-it` | HeyGen `e5cb3a44…` "energetic premium tech launch" | 2.2s → 18.2s | 11.8s, the GRADUATED stamp |
| `live-pad` | HeyGen `bc2db71a…` "dark futuristic cyber trailer" | 13.0s → 29.0s | 0.1s "Every launch." stab, silence under "Every fill.", 2.0s hit on "Live." |
| `hype` | HeyGen `3b6f8a0d…` "hype cinematic drop" | 4.9s → 29.9s | drop at 10.12s, final hit (logo slam) at 23.6s |

`hype` also has `beats/music.m4a.json` from `hyperframes beats` (128 BPM); the
composition times every cut from that grid. Its web encode is 720p
(`public/videos/hype.mp4`), with the 1080p file at `hype-1080.mp4`.

On the site the films autoplay muted (browsers block autoplay with sound);
each has a sound button.

| Film | Shows |
| --- | --- |
| `launch-it/` | The creation flow: a coin is typed in and launched, the bonding curve fills with buys, it graduates into a locked Uniswap V4 pool. |
| `live-pad/` | The discovery side: launches racing to graduation, the live buy/sell feed, and the top-traders board reshuffling. |

`shared/` holds the brand layer both films use: Figtree + JetBrains Mono,
the palette, the logo, GSAP, and `swirl.js` — a deterministic port of the
site's pixel swirl, driven by timeline time so every frame is reproducible.

## Render

Needs Node 22+, FFmpeg/FFprobe and a headless Chrome.

```bash
cd videos/launch-it            # or live-pad
mkdir -p assets && cp ../shared/* assets/
npx hyperframes@0.8.91 snapshot --at 2,6,10,14   # spot-check frames
npx hyperframes@0.8.91 render --fps 30 --quality high -o renders/launch-it.mp4
```

Web encodes in `public/videos/`:

```bash
ffmpeg -i renders/launch-it.mp4 -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart ../../public/videos/launch-it.mp4
ffmpeg -i renders/launch-it.mp4 -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -pix_fmt yuv420p -c:a libopus -b:a 112k ../../public/videos/launch-it.webm
```
