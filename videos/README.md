# Berrypad launch films

Two 16-second, 1920×1080, 30fps films made with [HyperFrames](https://github.com/heygen-com/hyperframes)
(HTML compositions rendered frame-by-frame to MP4). Both are silent by design —
they autoplay muted on the site.

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
ffmpeg -i renders/launch-it.mp4 -an -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart ../../public/videos/launch-it.mp4
ffmpeg -i renders/launch-it.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -pix_fmt yuv420p ../../public/videos/launch-it.webm
```
